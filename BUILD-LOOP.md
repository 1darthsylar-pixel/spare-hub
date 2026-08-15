# Gate City Hub — the build loop

One session hands out work. Helpers build and check. You merge.

⚠️ Promoting is automatic since Aug 10 2026 — a merged PR is live about a
minute later, with nobody in between. The six checks and a green build are the
whole safety net, not a first opinion on the way to one.

This file is the instruction sheet. It lives in the repo so Claude Code reads it
every time.

---

## The one hard rule

**A helper never deploys. A helper never commits to `main`.**

A helper finishes a task when it can say:

> Branch `loop/<task>` pushed. All six checks clean. Here is the diff.

You review, you merge, you promote in Cloudflare. That step stays human forever.

Why: every entry in the checks list below exists because a file read clean and
shipped a crash anyway. The loop makes more work happen, not safer work. The
gate is what makes it safe.

---

## One-time setup

The checks need Node. macOS does not ship with it.

1. Go to **nodejs.org**, download the macOS installer (the LTS button), double-click it.
2. Open Terminal and run one line:

```
npm install -g typescript
```

3. Copy the `checks/` folder into the repo root and commit it.

Test it works:

```
node checks/run.mjs App.jsx
```

If that prints a summary table, setup is done.

**Expect findings on the first full-repo run.** Files written before these checks
existed have not all been swept. That is a to-do list, not an emergency. Work
through them one file at a time.

---

## Starting a batch

Open Claude Code in the repo. Paste this, filled in:

```
Read CLAUDE.md and BUILD-LOOP.md first.

Batch of N tasks. Run them as separate subagents, one per task.

TASK 1: <what to change, which file, what "done" looks like>
TASK 2: ...
TASK 3: ...

Rules for every subagent:
- Branch off main: loop/<short-task-name>. Never touch main.
- Read the whole file before editing it. Never assume a src/ directory.
- Follow the plan-first rule in BUILD-LOOP.md. Show me the plan and
  WAIT for approval on anything that is not a small obvious fix.
- Run: node checks/run.mjs <the files you touched>
- Do not report done until all six checks are clean on those files.
- Append one row to build-log.md: date, task, files, findings hit, kept or killed.
- Push the branch. Do not merge. Do not deploy.

Report back a table: task, branch, files changed, lines changed, checks status.
Flag anything you were unsure about instead of guessing.
```

That is the whole thing. Everything below is the reasoning behind it.

---

## Writing a good task

A bad task is "fix the equipment log." A good task names the file, the change,
and the finish line.

> **TASK:** EquipmentLog.jsx — the history view will not open. Find why, fix it,
> and add an error boundary around the tile the same way `L101Boundary` wraps
> Leadership 101. Done = the history panel renders with seeded data and all six
> checks are clean.

Three parts, every time: **the file**, **the change**, **what done looks like**.

If you cannot name the file, that task is not ready for the loop. It is a
question for a normal session.

---

## Plan first, then stop

Work like a contractor who bills for rework. A wrong guess costs you a rebuild.
A question costs me thirty seconds.

### Step 1 — go look before you ask

Read the code, the config, the wrangler file, whatever the task touches.
Anything you could find in under a minute of looking is not a question. It is
research you owe me.

Never ask me:

- which file something lives in
- whether a directory exists
- what a storage key is called
- how a similar tile already does it
- what the deploy path is

All of that is in the repo or in `CLAUDE.md`. If the repo contradicts itself,
that IS worth raising.

### Step 2 — write this, then wait

**Goal.** One paragraph, in your own words, saying what you think I asked for
and what "done" means. If your restatement is wrong, this is the cheapest
possible place to find that out. It has already caught one wrong guess here: a
request about "the pro page" got read as the Team Directory when it meant the
PTO page, and a whole panel got built against the wrong tile.

**Blocking questions, zero to three.** Only ask when a wrong answer means
throwing work away, not adjusting it. Every question comes with your
recommended answer, so I can reply "yes to all" in three seconds. Never ask an
open question when a proposed answer would do. If nothing is truly blocking,
say so and list zero.

**Assumptions.** Numbered and specific enough to be wrong. "The roster paste
always carries AM/PM" is an assumption. "The code should be clean" is not.
Cover whichever of these the task actually touches:

- **Data** — what shape the stored value is in, what a bad one looks like
- **Failure** — what happens on a timeout or a half-written save: retry, fail
  loudly, or carry on degraded
- **Who sees it** — which tier, which people, what a locked-out person sees
- **Timing** — can two people do this at once, does running it twice cause harm
- **Where it runs** — the client tile, the worker, or a scheduled job
- **Scope** — what you are deliberately NOT doing, and what you are leaving
- **Proof** — what you will actually verify, and what you are leaving unchecked

**Plan.** Which files you will touch, the key function names, and the order you
will work in. Where you picked between two real options, name the one you
rejected and why, in one clause.

Then stop. Do not start writing code.

### Step 3 — how much of this a task deserves

The ceremony scales with what breaks if you are wrong.

**Just do it, no plan:**

- a typo, a label, a rename
- under about 20 lines with one obvious correct form
- a cosmetic fix on a single tile

**Full treatment, and be suspicious of your own assumptions:**

- anything touching PINs, tiers, or who can see what
- anything touching money: labor, food cost, PTO, cash audit, profit share
- anything that changes the shape of stored data
- a brand new tile or a new storage key
- the auto-assign engines, the board, or a scheduled job
- anything that deletes

The test is not how many lines change. It is how many people notice if it is
wrong. 106 team members see this app.

### Step 4 — after I approve

Build the plan as approved. If the plan does not survive contact with the real
code, **stop and tell me**. Do not quietly build something different, and do
not push on with a plan you now know is wrong. A surprise at review is the
expensive kind.

---

## What to put in a batch, and what not to

**Good in a batch** — separate files, no shared state:

- one bug per tile across three or four different tiles
- adding an error boundary to several tiles
- sweeping one bug class repo-wide (every `e.target` inside an updater)
- a cosmetic pass across parked UI defects

**Never in a batch:**

- `App.jsx`, `worker.js`, `HRConsole.jsx` — these are multi-session files. Two
  helpers editing App.jsx will silently revert each other. One at a time, always.
- anything touching the auto-assign engines. Those need your eyes on real board
  data, not a checker.
- anything that changes stored data shape. New key shapes get designed with you,
  not batched.
- **the `checks/` folder.** See "The checker is off limits" below. A helper that
  can edit the thing grading it is not being graded.

Rule of thumb: **two helpers must never open the same file.** If two tasks touch
one file, they are one task.

---

## Iteration discipline

- **Change ONE variable per pass.** If a fix does not work, change one thing and
  try again. A failed attempt with five changes in it teaches nothing.
- **Log every attempt, kept or killed.** The log is the point. Batch two starts
  from what batch one learned.

### Stop rules — when a helper must quit and report

Four attempts is the ceiling. These three end it sooner, and any one of them is
enough:

1. **The same fix twice.** If a helper edits the same lines back to a state it
   already tried, it is going in circles. Stop.
2. **Ping-pong.** Two different fixes alternating — A, B, A, B. Neither is right
   and it is guessing. Stop.
3. **No forward progress.** Nothing has actually run clean in the last few
   passes. The tell is a check count that never drops, or drops and comes back.

When a stop rule hits, the helper reports three lines and quits:

```
BLOCKED: <task>
Tried: <the attempts, one line each>
Missing: <what it does not know>
```

A stuck helper is missing information, not effort. Four more attempts costs you
tokens and gets you a worse guess.

**Do not let it start over on its own reasoning.** If a task gets restarted,
restart it from the file on disk and the task text, not from the helper's
running notes. A wrong turn early poisons everything after it.

---

## build-log.md

One line per task. Plain text, in the repo, appended by whoever did the work.

```
2026-07-29 | equipment-history | EquipmentLog.jsx | scope 1 (unbound openHistory) | KEPT | branch loop/equip-history
2026-07-29 | thaw-order        | ThawAllocation.jsx | clean first pass          | KEPT | branch loop/thaw-order
2026-07-29 | rec-banner        | HRConsole.jsx     | SKIPPED - multi-session file | KILLED |
```

After a month this file answers "have we hit this before" in one search. That is
the whole reason to keep it.

---

## The six checks

Run by `node checks/run.mjs`. Every one of them exists because a bug got past
careful reading.

| # | Check | Catches |
|---|-------|---------|
| 1 | validate | syntax, parsed as real JSX |
| 2 | hookcheck | a hook called after an early return |
| 3 | scope | a name that resolves to nothing |
| 4 | tdzcheck | something read before it is declared, in a hook that runs during render |
| 5 | eventcheck | a form event read inside a state updater |
| 6 | cyclecheck | two files importing each other |

Two rules about the checks themselves:

- **Read the numbers, not just the word "clean."** A check that hides part of its
  own output is worse than no check. That is exactly how the Leadership 101
  crash shipped: the fault was detected, folded into a count, and the run exited
  zero.
- **Run all six. Every time.** Skipping one because the edit "looks safe" is how
  the dead-button bug reached Bri.

Known false positive, do not fix it: `useCount` in HRConsole's TemplateEditor is
a plain arrow function named like a hook. It is already allowlisted.

---

## The checker is off limits

**A helper never edits anything in `checks/`.** Not the checks, not the fixtures,
not the self-test.

The reason is simple. A helper is judged by these checks. If it can edit them, the
cheapest way to pass is to make the check stop looking. It will not do that on
purpose. It will do it by "fixing a false positive" that was not false.

If a check is wrong, that is a task for you and me in a normal session, not a
line item in a batch.

---

## Is the checker itself still working?

```
node checks/selftest.mjs
```

Twelve tests. Each one runs a check against a file with a known bug and confirms
it still catches it, plus a deliberately clean file every check must stay silent
on. Takes about a second.

**Run it after any change to a check. Always.**

Why this exists: on Jul 28 the hook check reported 18 findings across three
files, and every one was wrong — the code was fine. A checker can fail in both
directions:

- it stops catching a real bug, and a clean sweep means nothing
- it starts flagging good code, and you learn to ignore the output

Both look identical from the outside. A clean run from a broken checker and a
clean run from a working one print the same thing. The self-test is the only
thing that tells them apart.

The fixture files live in `checks/fixtures/`. Do not tidy them up — every one is
a bug that actually reached production here:

| Fixture | The real incident |
|---------|-------------------|
| BrokenHooks | pinned-tiles hooks below an early return, every tool went blank |
| NestedFn | the Jul 28 false positive, a helper function read as a return |
| BrokenScope | `progress`, the plain lowercase name the old check hid in a count |
| BrokenTdz | `keyOf` used 320 lines above where it was declared |
| BrokenEvent | Bri's prep-work field, throwing on every keystroke |
| CycleA/B | ProfessionalGrowth → Leadership101 → HRConsole → back |
| Clean | the counter-case: legal code that must produce zero findings |

**Add to it.** Every new bug class that reaches production earns a fixture and a
line in the self-test. That is how the checker gets better instead of just older.

---

## What the checks cannot see

They read code. They do not run it. Still true after a clean run:

- a stale bundle. If it still throws after deploy, compare the bundle hash and
  the stack columns before reading any source.
- wrong logic against real data. For anything that touches the board, the
  roster, or a score, write the behavioural test with real names from a
  screenshot.
- an editor that writes one shape and a renderer that reads another. Compare
  what the editor creates against what the renderer reads. Nothing checks that
  they agree.

---

## Definition of done

A batch is done when:

1. every branch is pushed,
2. every task's files are check-clean,
3. `node checks/selftest.mjs` passes, so the clean results mean something,
4. `build-log.md` has a row per task,
5. the report tells you what was skipped and why.

Then you merge what you want, promote, and hard-refresh.
