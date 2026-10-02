---
title: "Radio Los Santos"
area: format-strings
role: author
event: friendly-2026
published: 2026-09-29
summary: "The flag lands on the stack before the vulnerable printf(buf) runs, so a bare %s walks phantom arguments straight onto it."
techniques: ["format string", "stack information leak"]
difficulty: easy
arch: amd64
flag: "Securinets{l0s_s4nt0s_3ch03s_b4ck_3v3ry_w0rd}"
---

> Category: **pwn** — Tag: **format-string**
> Flag: `Securinets{l0s_s4nt0s_3ch03s_b4ck_3v3ry_w0rd}`

This is the simplest format-string challenge in the set — a great one to
start with if you've never exploited `printf` before.

## 1. The program

```c
void getTopSecretAssest(){
    int f = open("flag", O_RDONLY);
    char flag[0x100];
    read(f, flag, sizeof(flag));     // flag bytes are now sitting on the stack!
    close(f);
    return;
}

void challenge(){
    char buf[0x100];
    read(0, buf, sizeof(buf));
    printf(buf);                     // <-- our input becomes the format string
    return;
}

void main(){
    setup();
    getTopSecretAssest();
    challenge();
    exit(0);
}
```

Two crucial facts:

1. **`getTopSecretAssest()` reads the flag into a local stack buffer**
   *before* `challenge()` runs. Even though that function has returned,
   the bytes it read are still physically sitting in memory further up the
   stack — they were never wiped.
2. **`printf(buf)`** in `challenge()` passes our raw input straight as the
   format string. Normally you'd write `printf("%s", buf)`; here there's no
   format string of the programmer's choosing at all — ours *is* the format
   string. That's a **format string vulnerability**.

## 2. Why that's dangerous: `%s` without an argument

`printf("%s")` tells `printf`: "treat the next function argument as a
`char*` and print the string it points to." But we didn't give `printf` any
extra argument! On x86-64 Linux, `printf` is variadic and just keeps
pulling values from wherever the calling convention says the *next*
argument would be — first from leftover registers, then from the stack.
Since the flag bytes were left behind on the stack by the earlier
`getTopSecretAssest()` call, there's a good chance one of those "phantom
arguments" `%s` picks up is actually a pointer sitting near/around the leaked
flag data, or (more directly) `%s` combined with positional specifiers can
walk the stack until it finds and dereferences something useful.

## 3. The exploit

`solver.py` is refreshingly short:

```python
p.sendline("%s")
p.interactive()
```

Sending the literal string `%s` as input makes `challenge()` call
`printf("%s")`. `printf` then treats the next stack value it finds as a
pointer and dereferences it as a C string. Because the stack still holds
the leftovers from `getTopSecretAssest()`'s local buffer, this frequently
prints out memory that includes the flag text directly to our socket.

*(The `gdb.attach` block with `DEBUG=2` in the solver — breaking at
`challenge + 51` — is just how the author inspected the stack layout in
GDB beforehand to confirm this would work, before switching to `DEBUG=0`
to hit it against the real remote service.)*

## 4. Running it

```bash
python3 solver.py
```
The flag prints straight to the terminal once `%s` is sent.

## 5. Lesson

**Never pass user input directly as a format string** (`printf(buf)`).
Always use `printf("%s", buf)`. A single missing `"%s", ` is the entire
bug here.
