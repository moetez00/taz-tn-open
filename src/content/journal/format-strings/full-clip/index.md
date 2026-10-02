---
title: "Full Clip"
area: format-strings
role: author
event: friendly-2026
published: 2026-09-29
summary: "One read, one printf: a self-planted stack pointer lets a single %hhn write flip a loop-local integer to win()'s target value."
techniques: ["format string", "%n write", "self-referential stack pointer"]
difficulty: easy
arch: amd64
flag: "Securinets{fullcl1p_1_m4g_1_sh3ll}"
---

> Category: **pwn** — Tag: **format-string**
> Flag: `Securinets{fullcl1p_1_m4g_1_sh3ll}`

A tiny, self-contained format-string challenge: no leak needed, no login,
just one `read()` + one `printf()` — and the flavor text tells you the
whole plan: *"empty the whole magazine in a single read and the shell
fires itself."*

## 1. The program

```c
void win(){ system("/bin/sh"); }

void vuln(){
    char * p;
    char buf[0x50];
    p = buf;
    char ** p2 = &p;
    long long i = 0x67;              // starts as 0x67, NOT 0xc0

    read(0, buf, 0x50 - 2);
    printf(buf);                     // <-- format string bug
    if (i == 0xc0) win();            // win condition
    return;
}
```

The local variable `i` starts at `0x67`. If, by the time `printf(buf)`
returns, `i` has somehow become `0xc0`, the program calls `win()`, which
just does `system("/bin/sh")` — instant shell, instant flag access.

Because `i`, `buf`, `p`, and `p2` are all local variables living next to
each other on the stack, and because `printf(buf)` is a format-string bug
(our input is the format string itself, no `%s` wrapper), we can use `%n`
to make `printf` write a value of our choosing into `i`'s address on the
stack.

## 2. Getting `printf` to write into `i` — with no leaked address

Unlike a normal write-what-where, we're never told `i`'s address directly.
The classic trick used here (and reused in the sibling challenge, Rocketman)
is: **the buffer being formatted is itself on the stack, right where
`printf`'s "extra arguments" would be read from next.** That means the raw
bytes we send in `buf` can double as fake pointer arguments once `printf`
runs out of real ones and starts reading further up the stack — including
reading parts of `buf` back as if they were 8-byte pointer arguments. If we
place the address of `i` at the right spot in our input, a later `%n`/`%hhn`
specifier that asks for "the next argument" can be made to write straight
through that self-planted pointer.

The author's own comment in `main.c` spells out the arithmetic for the
padding count:
```c
if (i==0xc0) win();
```
and in `solver.py`:
```python
payload = "%c%c%c%c%c%c%50c%hhn%136c%7$hhn"
# 192-50-6   // write &i into stack and overwrite it with 0xc0
# we can't use $ in the first overwrite to avoid printf caching.
```

Reading this piece by piece:

- **`%c%c%c%c%c%c`** — six plain `%c` specifiers. Each one consumes "the
  next argument" and prints it as a single character. This walks past the
  first six phantom arguments (which on x86-64 come from leftover
  registers, not memory we control) to get printf's internal argument
  cursor lined up with the stack data that *is* ours — i.e. the contents
  of `buf` itself.
- **`%50c`** — prints 50 filler characters (consuming one more phantom
  argument as the width source isn't the point here — it's purely to pad
  the running character count up to a specific value before the write).
- **`%hhn`** (no `$index` — sequential, "next" argument) — writes the
  **lowest single byte** of the character count so far into the address
  given by the *next* argument in sequence. `i` starts at `0x67`, whose
  three high bytes are already `0`, so overwriting just its low byte is
  enough: once printf's running count hits `192` (`0xc0`), one `%hhn`
  sets that byte and `i` becomes exactly `0xc0`. The comment `# 192-50-6`
  shows the author's bookkeeping: 192 (target byte value)
  minus the 50 already printed by `%50c` minus the 6 characters from the
  six `%c`s = the extra padding still needed, which is quietly folded into
  how the specifiers are ordered/counted.
- **`%136c%7$hhn`** — a second, *positional* write (`%7$hhn`, "use
  argument #7 specifically") is included as a safety/second attempt in
  case caching effects (explained below) interfere with the first,
  non-positional write.
- The comment **"we can't use `$` in the first overwrite to avoid printf
  caching"** refers to a real glibc quirk: once you use a *positional*
  specifier like `%7$hhn` anywhere in a format string, glibc's `printf`
  pre-scans and internally caches/reorders how it interprets *all*
  argument positions for the entire call. Mixing a positional write in as
  the very *first* specifier can throw off the sequential argument cursor
  the earlier plain `%c`s were relying on. So the author deliberately
  keeps the first write purely sequential (no `$`) and only switches to
  positional addressing for the later, more precisely targeted write.

## 3. Running it

```python
payload = "%c%c%c%c%c%c%50c%hhn%136c%7$hhn"
p.sendline(payload)
p.interactive()
```

One `read()`, one `printf()`, one format string doing all the work — true
to the "full clip, one magazine" theme. Once `i == 0xc0`, `win()` runs
`system("/bin/sh")` and `p.interactive()` drops us into a shell to `cat
flag`.

## 4. Lesson

You don't always need a leaked address to abuse `%n`. When the format
string buffer itself lives on the stack near the data you want to
overwrite, the buffer's own bytes can be recycled as fake pointer
arguments — a "self-contained" format-string write. Exact offsets
(how many `%c`s to skip, which positional index lands where) are almost
always found empirically with GDB rather than derived purely by hand.
