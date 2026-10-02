---
title: "print(xxx);"
area: format-strings
role: author
event: pioneers25
published: 2026-03-20
summary: "A puts leak gives the libc base; one format string smashes the canary and points __stack_chk_fail at a one_gadget."
techniques: ["format string", "libc leak", "canary bypass", "GOT overwrite", "one_gadget"]
difficulty: medium
arch: amd64
---

## Overview
`vuln()` builds a string in a stack buffer and then calls `printf(name)` directly, giving a format string vulnerability. The program also prints a “secret code” which is actually a leak of `puts`, letting us compute the libc base.

The idea was to one-shot the binary by overwriting __stack_chk_fail and the canary in the same payload (we can't use %{arg}$n in the first overwrite to avoid printf caching) and call one_gadget, but i got 2 unintended solves ( first one by Torch, he overwrote `__do_global_dtors_aux` int `.bss` with `vuln` so when exit is called it jmps to it and he got infinity inputs, i fixed it by setting `.bss` read-only. Second one was by Mehdi, he overwrote the return address to return to `vuln() + some offset` so i fixed it by adding additional checks on saved ret addr). I shall leaked only a one_gadget address and made those fixes in the first version of challenge to force my intended solution :(.

The provided `solve.py` uses the format string primitive to:
1) compute libc base from the `puts` leak
2) corrupt the stack canary so the function *must* call `__stack_chk_fail`
3) use the same format string call to overwrite the `__stack_chk_fail` GOT entry to a libc one_gadget
4) let the canary failure redirect execution into the one_gadget

## Vulnerability analysis

### 1) Libc leak
The binary prints the address of `puts`:

```c
printf("Your secret code : %ld\n", puts);
```

Even though it uses `%ld`, the value is still the runtime address of `puts` in libc (printed as a signed integer). The solver parses it and computes:

$$\text{libc\_base} = \text{puts\_leak} - \text{puts\_offset}$$

### 2) Format string
User input is copied into `name` and then used as a format string:

```c
fgets(buf, 150, stdin);
sprintf(name, "Fank You %s", buf);
printf(name);                 // <-- format string bug
```

This gives arbitrary reads/writes via `%p`, `%s`, `%n` / `%hn` / `%ln`.

### 3) Helpful (intentional) stack pointer to the canary
There is a seemingly-unused local pointer:

```c
void* p = name + 0xc8;
```

From the compiled layout, `name` is at `rbp-0xd0`, so `name+0xc8` equals `rbp-0x8`, which is exactly where the stack canary is stored.

That means a pointer to the canary location exists on the stack, and format string writes that “consume” a pointer from the stack can use it.

### 4) The GOT is placed at an address containing a newline byte
The challenge uses a custom linker script that forces the GOT near `0x400a00` (note the `0x0a` byte). This makes it annoying to inject GOT addresses directly into a `fgets()`-read string (newline terminates the read), so the exploit leans on pointers already present on the stack rather than embedding raw GOT pointers in the payload.

## Exploitation strategy (matches `solve.py`)

### Step 1 — Compute libc base and pick a one_gadget
Solver excerpt:

```python
p.recvuntil(b"secret code : ")
libc.address = int(p.recvline()[:-1]) - libc.sym.puts
one_gadget = libc.address + 0xe5fb0
```

### Step 2 — Build the format string to:
#### (a) smash the canary (force a stack check failure)
The epilogue of `vuln()` will call `__stack_chk_fail@plt` if the canary doesn’t match.

The solver uses `%ln` (write “number of chars printed so far” to a `long*` pulled from the stack) to write a controlled non-canary value into the canary slot.

```python
stack_chk_value = e.got.__stack_chk_fail - 0x25
payload  = b"%p"*5
payload += b"%" + str(stack_chk_value).encode() + b"c"
payload += b"%ln"
```

The key idea is: make sure the canary comparison fails so the program *must* take the `__stack_chk_fail` call.

#### (b) overwrite `__stack_chk_fail` to `one_gadget`
Before the function returns (and triggers the canary check), the same `printf(name)` execution uses a positional `%n` to write the final printed-byte count into a stack-provided pointer slot.

Solver excerpt:

```python
one_gadget_value = one_gadget - stack_chk_value - 0x25
payload += b"%" + str(one_gadget_value & 0xffffffff).encode() + b"c"
payload += b"%53$n"
```

The net effect (as intended by the challenge layout) is that `__stack_chk_fail@got` ends up containing `one_gadget`. When the epilogue detects the canary mismatch, it calls `__stack_chk_fail`, but control flow goes to the one_gadget instead.

### Step 3 — Trigger occurs automatically
After `printf(name)` finishes, the function epilogue runs:

```asm
... compare canary ...
call __stack_chk_fail@plt
```

Because we corrupted the canary, the call is taken, and because we overwrote the GOT entry, it lands in our `one_gadget`.

## Result
Arbitrary code execution is achieved from a single input line by chaining:

- libc leak (`puts`)
- format string write(s)
- forced canary failure
- GOT redirection of `__stack_chk_fail`
