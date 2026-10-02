---
title: "Rootstar Games"
area: format-strings
role: author
event: friendly-2026
published: 2026-09-29
summary: "A login gate hides an embedded-NUL password, then a %n write flips the logged-in account's role field to \"CEO\"."
techniques: ["format string", "%n write", "authentication bypass"]
difficulty: medium
arch: amd64
flag: "Securinets{d3f4ult_cr3ds_l34k3d_th3_c30_bu1ld_n0t3s}"
---

> Category: **pwn** — Tag: **format-string**
> Flag: `Securinets{d3f4ult_cr3ds_l34k3d_th3_c30_bu1ld_n0t3s}`

This challenge layers a "login" step on top of a format-string bug: you
first need to authenticate with default credentials, *then* abuse a
format-string `%n` write to fake being the `"CEO"`.

## 1. The program

```c
#define DEFAULT_USERNAME "RockstarSeniorSWE"
#define DEFAULT_PASSWORD "MyPasswordIsVeryV\x00eryStrong#@."
#define DEFAULT_ROLE "Developer"

typedef struct Account {
    char role[67];
    char username[67];
    char password[67];
} Account;

void login() {
    ...
    char username[67], password[67];
    read(0, username, 66);
    read(0, password, 66);
    if (strcmp(username, acc->username) == 0 && strcmp(password, acc->password) == 0)
        return;
    // else: print "Invalid Credentials!" and exit(0)
}

void challenge(){
    login();
    ...
    char buf[67];
    read(0, buf, 65);
    char result[67 + sizeof("Saved! Your completed tasks are:")];
    sprintf(result, "Saved! Your completed tasks are: %s", buf);
    printf(result);                       // <-- format string bug #2
    printf("Thank you!\n");
    if (strcmp("CEO", account->role) == 0)
        showTopSecretAssest();            // system("cat flag")
    ...
}
```

Step 1: **the default password contains an embedded NUL byte.**
`#define DEFAULT_PASSWORD "MyPasswordIsVeryV\x00eryStrong#@."` — in C, a
string literal with `\x00` in the middle still *compiles* the full text
into the binary's data, but `strcmp()` (and anything else based on
`strlen`) only "sees" up to that NUL. That means the actual stored
password, as far as `strcmp` is concerned, is just `"MyPasswordIsVeryV"`
— **but only if we also send a NUL at the exact same spot**, otherwise our
guess and the stored default diverge right where the embedded byte is,
because `strcmp` compares byte-by-byte and stops matching only once *both*
sides hit `\0`. In practice this means: replicate the compiled bytes
exactly, embedded NUL and all.

`solver.py`'s comment makes this exact point:
```python
p.sendline("MyPasswordIsVeryV\016ryStrong#@.\x00")
# this can be found using gdb , do not blindly follow the main.c , compiler
# have his own touch
```
`\016` is octal for byte `0x0e`, **not** `\x00`! The author is flagging
that the *actual* compiled byte at that position (found by inspecting the
binary in GDB rather than trusting the source's `\x00` literally) turned
out to be `0x0e`. This is a great beginner lesson: **the compiled binary is
the ground truth, not the source you're reading** — compilers, escape
sequences, and struct padding can all shift bytes around in ways that
aren't obvious from `main.c` alone. Always verify in GDB.

## 2. The format-string bug — targeting the `role` field

Once logged in as the default developer account (`role = "Developer"`),
the program reads our "completed tasks" into `buf`, builds `result` with
`sprintf`, and then calls `printf(result)` — **our data flows straight
into `printf` as the format string**, same class of bug as the Radio
challenges.

The win condition is:
```c
if (strcmp("CEO", account->role) == 0)
    showTopSecretAssest();     // system("cat flag")
```
`account->role` is a 67-byte buffer sitting in the heap-allocated
`Account` struct. If we can get a format-string `%n` write to overwrite
those bytes with `"CEO\x00"`, the check passes and the flag gets `cat`'d
for us.

## 3. The payload

```python
p.sendline("%" + str(int(u32("CEO\x00") - 33)) + "c" + "%15$n")
```

Breaking this down:

- **`u32("CEO\x00")`** packs the 4 bytes `"CEO\x00"` into a little-endian
  32-bit integer — exactly the 4-byte value we want written into memory at
  `account->role`.
- **`%N c`** (the `%<count>c` specifier) tells `printf` to print `<count>`
  padding characters. By choosing `count` so that the *total number of
  characters printf has emitted so far* equals our target 32-bit value
  (`u32("CEO\x00")`), we set up the exact value that the next `%n` write
  will record. `- 33` accounts for the 33 characters of literal text
  (`"Saved! Your completed tasks are: "`) that `sprintf` already placed
  before our injected specifiers — that fixed prefix counts towards
  printf's internal character counter too, so it has to be subtracted out
  first.
- **`%15$n`** — the `%n` specifier writes the *number of characters
  printed so far* (as a full 4-byte `int`, since plain `%n` — not `%hn` or
  `%hhn` — writes 4 bytes) into the address given by the *15th* format
  argument. Just like in the other format-string challenges, argument 15
  happens (found via GDB, again) to correspond to a stack slot that
  already holds a pointer to `account->role` — left over from earlier
  function calls that passed that pointer around. So this single `%n`
  write lands exactly on `account->role`, overwriting it with `"CEO\x00"`.

After this, `strcmp("CEO", account->role) == 0` is true, and
`showTopSecretAssest()` runs `system("cat flag")`.

## 4. Running it

```bash
python3 solver.py
```
Login with the default creds, send the crafted `%c`/`%n` payload, and the
flag is printed by the program itself.

## 5. Lesson

Two separate beginner-relevant lessons in one binary:

1. **Trust the compiled binary, not just the source** when computing
   exact byte offsets/values (escape sequences, padding, struct layout).
2. **`%n` is one of the most dangerous format specifiers** — it turns a
   read-only-looking bug (`printf`) into an arbitrary memory *write*
   primitive. Modern glibc even disables `%n` in binaries linked with
   `_FORTIFY_SOURCE` unless the format string is in read-only memory,
   which is exactly why this challenge is compiled the way it is.
