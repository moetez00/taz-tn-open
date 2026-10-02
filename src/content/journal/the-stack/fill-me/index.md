---
title: "Fill me"
area: the-stack
role: author
event: pioneers25
published: 2026-03-20
summary: "An 8-byte overflow clobbers an adjacent sentinel variable, enough to trip win() without touching the return address."
techniques: ["stack overflow", "ret2win"]
difficulty: easy
arch: amd64
---

## Overview
This is an intentionally simple stack overflow: the program reads 0x28 bytes into a 0x20-byte buffer. An adjacent stack variable (`changeme`) acts as a sentinel; if it changes, `win()` is called and prints the flag.
It was for fun (i love this trend xD)

## Vulnerability analysis

In `vuln()`:

```c
char changeme[9];
char buf[0x20];
strcpy(changeme, "changeme");
read(0, buf, 0x28);
if (strcmp(changeme, "changeme") != 0)
	win();
```

`read(0, buf, 0x28)` reads 40 bytes into a 32-byte buffer → 8-byte overflow.

Because `changeme` is stored next to `buf` in the stack frame (compiler layout + alignment), the overflow can clobber at least one byte of `changeme`, making `strcmp()` fail and triggering `win()`.

There is no stack canary (`-fno-stack-protector` in the compile comment), but we don’t even need to touch the return address—flipping the sentinel is enough.

## Exploitation strategy (matches `solve.py`)

1) Choose option `1` to enter `vuln()`.
2) Send more than 0x20 bytes so the overflow changes `changeme`.

Solver excerpt:

```python
p.sendline(b"1")
p.send(b"a" * (0x28 + 1))
```

The payload size is slightly above the vulnerable read length to guarantee the adjacent bytes are overwritten (and to avoid any edge cases with newlines / buffering).

## Result
Once `changeme` differs from the original string, `win()` runs:

```c
system("cat flag");
```

and the flag is printed.
