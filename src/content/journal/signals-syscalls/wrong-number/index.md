---
title: "Wrong Number"
area: signals-syscalls
role: author
event: friendly-2026
published: 2026-09-29
summary: "read()'s return value is passed straight through as a raw syscall number; 322 bytes turns it into execveat(\"/bin/sh\")."
techniques: ["raw syscall", "execveat"]
difficulty: easy
arch: amd64
flag: "Securinets{d14l_th3_r1ght_sysc4ll_numb3r_g3t_4_sh3ll}"
---

> Category: **pwn** — Tag: **syscall**
> Flag: `Securinets{d14l_th3_r1ght_sysc4ll_numb3r_g3t_4_sh3ll}`

No overflow, no format string, no ROP chain — this challenge hands us
**direct control over which raw Linux syscall gets executed**, and the
whole exploit is picking the right number.

## 1. The program

```c
void vuln(){
    char buf[0x200];
    int n = read(0, buf, sizeof(buf)-1);      // n = number of bytes WE sent
    syscall(n, 0, "/bin/sh", NULL, NULL);     // <-- n becomes the syscall NUMBER!
    return;
}
```

`read()` returns the number of bytes it actually read — and here that
return value, completely attacker-controlled by how much data we send, is
fed straight into `syscall()` as the **syscall number** (the first
argument to the `syscall()` libc wrapper selects *which* kernel syscall to
invoke — `0` is `read`, `1` is `write`, `59` is `execve`, `322` is
`execveat`, and so on, per the Linux x86-64 syscall table). The remaining
arguments — `0, "/bin/sh", NULL, NULL` — stay fixed no matter what syscall
number we choose.

So the question becomes: **which syscall, when called as
`syscall(N, 0, "/bin/sh", NULL, NULL)`, gets us a shell?**

## 2. Picking the syscall number

`execve(const char *pathname, char *const argv[], char *const envp[])` is
the obvious candidate — its syscall number on x86-64 is `59`. But its
argument order is `(pathname, argv, envp)`, whereas our fixed call gives
arguments in the slots `(0, "/bin/sh", NULL, NULL)` — the *first* argument
here is `0`, not a pointer to `"/bin/sh"`. Plain `execve` won't line up.

`solver.py`'s own comment gives the answer directly:

```python
p.sendline("aaaa...aaaa")   # a very long string of 'a' characters
# \n counts btw , and we need to call execveat cz of paramters not execve
```

**`execveat`** (syscall number **`322`** on x86-64) has the signature:
```c
int execveat(int dirfd, const char *pathname, char *const argv[], char *const envp[], int flags);
```
Its *first* parameter is `dirfd` — a directory file descriptor used for
relative paths — and our fixed call already supplies `0` there. `0` isn't
a valid open file descriptor in this program, but `execveat` has a special
case: **if `pathname` is absolute** (starts with `/`), `dirfd` is ignored
entirely. Since `"/bin/sh"` is an absolute path, `dirfd = 0` doesn't matter
— it works.

So mapping our fixed call `syscall(n, 0, "/bin/sh", NULL, NULL)` onto
`execveat(dirfd, pathname, argv, envp, flags)`:
- `dirfd = 0` — ignored (absolute path).
- `pathname = "/bin/sh"` — correct.
- `argv = NULL` — the kernel treats a `NULL` `argv` leniently here
  (equivalent to `{pathname, NULL}` in practice for this syscall).
- `envp = NULL` — an empty environment, which is fine for spawning a shell.
- `flags` — not explicitly passed (only 4 args given, `execveat` wants 5),
  but on x86-64 the 5th argument comes from register `r8`, whatever
  garbage happens to be there; `0`/most values work fine as flags here.

So we need `n == 322`.

## 3. Turning "322" into "how many bytes to send"

We don't get to type the number `322` directly — `n` is *whatever `read()`
returns*, i.e. **the number of bytes we actually send**. So the entire
payload is just:

```python
p.sendline("a" * 322)
# \n counts btw
```

322 filler `a` characters. `sendline()` also appends a trailing `\n` — and
the comment `# \n counts btw` is the author reminding themselves that the
newline byte counts toward `read()`'s return value too, so the number of
`a`s sent (or the exact total, `a`s + `\n`) has to add up to exactly `322`
for the syscall dispatch to land on `execveat`.

## 4. Running it

```bash
python3 solver.py
```
Sending exactly 322 bytes makes `n == 322`, so `syscall(322, 0, "/bin/sh",
NULL, NULL)` runs as `execveat(0, "/bin/sh", NULL, NULL, ...)`, replacing
the current process image with `/bin/sh` — a shell, ready to `cat flag`.

## 5. Lesson

Never let user-controlled data (especially something as innocuous-looking
as a `read()` return value) flow into a raw `syscall()` number. Unlike
calling libc wrapper functions, raw syscalls have **no argument-count or
type checking** — the kernel will try to interpret whatever's in the
argument registers according to whichever syscall number you handed it,
even if the shapes don't quite match what a "normal" caller would provide
(as seen here, `execveat`'s odd 5-argument signature can still be
satisfied "close enough" by a call written for a completely different
function).
