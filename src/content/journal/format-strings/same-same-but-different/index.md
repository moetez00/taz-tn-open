---
title: "Same Same But Different!"
area: format-strings
role: author
event: friendly-2026
published: 2026-09-29
summary: "Rootstar Games with its struct reordered: every offset shifts, and the fix is overwriting the comparison buffer, not the role."
techniques: ["format string", "%n write", "authentication bypass"]
difficulty: medium
arch: amd64
flag: "Securinets{s4m3_5truct_r30rd3r3d_bug_st1ll_th3r3}"
---

> Category: **pwn** — Tag: **format-string**
> Flag: `Securinets{s4m3_5truct_r30rd3r3d_bug_st1ll_th3r3}`

The "v2" of [Rootstar Games](../rootstar_games): same bug, same idea, but
the challenge author reordered the `Account` struct and changed the target
string, precisely to prove the point in the flavor text — *"same struct,
same bad habits."*

## 1. What changed vs. Rootstar Games

```c
// Rootstar Games (v1):            // Same Same But Different (v2):
typedef struct Account{            typedef struct Account{
    char role[67];                     char username[67];
    char username[67];                 char password[67];
    char password[67];                 char role[67];
}Account;                          }Account;
#define DEFAULT_ROLE "Developer"   #define DEFAULT_ROLE "Dev"
```

The struct fields got **reordered** (`role` moved from first to last), and
the default role string is now `"Dev"` instead of `"Developer"`. The win
check also changed slightly:

```c
char isAdmin[] = "admin";
...
if (strcmp(account->role, isAdmin) == 0)
    showTopSecretAssest();     // system("cat flag")
```

Now we need `account->role` to become the literal string `"admin"`.

Everything else — the login step with default creds, the embedded-NUL
password, the `sprintf`-into-`printf` format-string bug on the "completed
tasks" input — is identical in spirit to Rootstar Games. See that
writeup for the full breakdown of *why* each piece works; here we'll focus
on what's different.

## 2. Login step

```python
p.sendline(b"RockstarSeniorSWE\x00")
p.wait(1)
p.sendline("MyPasswordIsVeryV\016ryStrong#@.\x00")
# this can be found using gdb , do not blindly follow the main.c , compiler
# have his own touch
```

Same username, and the exact same "the real compiled byte is `\x0e`, not
`\x00`" gotcha as before — the compiler's actual layout of the password
constant doesn't perfectly match a naive reading of the `\x00` literal in
`main.c`, so the working byte was found empirically in GDB.

## 3. The format-string write — overwriting the check, not the role

```python
p.sendline("%" + str(int(u32("Dev\x00") - 33)) + "c" + "%6$n")
```

At first glance writing `u32("Dev\x00")` looks backwards — the goal is to
pass as `"admin"`, and `"Dev"` is just the account's unchanged default
role. But that's the trick: this build's check is

```c
char isAdmin[] = "admin";
char* Admin = isAdmin;
...
if (strcmp(account->role, isAdmin) == 0)
    showTopSecretAssest();
```

`isAdmin` is a **local stack buffer**, not a constant, and it happens to
sit at the stack slot `printf`'s phantom argument `6` points into (the
struct reorder moved things around enough that argument `6` now lands on
`isAdmin` instead of `account->role` — found with GDB, same as always).
Rather than overwriting `account->role` to read `"admin"`, the payload
overwrites the **comparison buffer** `isAdmin` to read `"Dev\x00"` instead
— which matches `account->role`, since v2's default role is the short
string `"Dev"` and is never touched. Four bytes (`"Dev\x00"`) is exactly
what one plain `%n` write can deliver in a single shot, which is also why
this only works because v2 shortened the default role from `"Developer"`
to `"Dev"`: `strcmp(account->role, isAdmin)` becomes `strcmp("Dev",
"Dev")`, and it's true.

The practical beginner takeaway: **moving one field in a struct is enough
to completely change every offset a format-string exploit depends on** —
and it's worth checking both sides of a `strcmp`, since overwriting the
*comparison value* to match an unchanged field can be easier than
overwriting the field itself. The underlying bug (unsanitized
`printf(result)`) is identical between v1 and v2, but the exact `%N$`
argument index and target had to be re-derived from scratch for the new
layout — exactly what the flavor text ("different struct, same bad
habits") is hinting at.

## 4. Running it

```bash
python3 solver.py
```
Same flow as Rootstar Games: log in with default creds, send the crafted
`%c`/`%n` payload to flip `account->role` to `"admin"`, and
`showTopSecretAssest()` prints the flag.

## 5. Lesson

A format-string arbitrary-write exploit is **not portable across binary
layouts** — even a trivial struct field reorder (no logic change at all!)
forces you to redo the offset-hunting in GDB. This is also why real-world
format-string vulnerabilities are so fragile/version-specific: any compiler
flag, struct change, or library update can shift the exact argument index
you were relying on.
