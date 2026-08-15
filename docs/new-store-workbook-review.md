# New Store Setup Workbook — review against the input register

Every row below was checked against what the code actually reads, not against
what sounds reasonable. Where it says STRIP, the reason is a fact about the
Hub, and the check that proves it is named.

**Verdict: the workbook is close.** Four things are asked for that nothing can
use, and one whole tab asks the wrong question.

---

## The four to strip

### 1. Tab 1 · "Number of team members" and "Number of directors" — STRIP

**Why:** Tab 2 is the full roster with a role on every line. Both numbers are
that tab counted. Asking twice invites two different answers, and then somebody
has to decide which one is true.

### 2. Tab 1 · "Time zone" — STRIP, or make it a code job

**Why:** the Hub does not read a time zone. `America/New_York` is written into
`l10Schedule.js` and `worker.js` directly. Asking a store to fill this in
implies it is a setting, and their answer would be quietly ignored. A store
outside Eastern needs code work, not a cell.

### 3. Tab 1 · "Main brand color" — STRIP, or make it a code job

**Why:** nothing reads a configurable brand colour. There are 541 distinct
hex values written across the app and the CFA red is hardcoded in 41 files.
One cell cannot reach any of them.

### 4. Tab 1 · "Logo file" — KEEP, but say where it shows

**Why:** worth keeping, but the row should say which screens use it so a store
knows whether a square PNG is really enough.

---

## The tab that asks the wrong question

### Tab 5 · Area Owners — REPLACE

It asks for a named owner and a backup against 14 areas. The Hub does not route
that way.

**What the register actually does:** 29 of its 32 inputs route by ROLE, not by
name.

| Routes by | Inputs |
| --- | --- |
| Executive Director | 17 |
| Shift leader on duty | 5 |
| Director | 3 |
| Human Resources | 3 |
| Leadership Development Director | 1 |
| A named person | 2 |
| A named pair | 1 |

**So the useful question is "who holds each role", not "who owns each area".**
Six role answers replace fourteen area rows, and they are the answers the code
consumes.

**Keep one named exception.** Food quality is deliberately a person and not a
role, because the seat belongs to one individual and no role string expresses
that without paging every Assistant Director. That is two rows: the weekly sweep
and the quarterly item-list review.

**Keep "write NOBODY if nobody owns it."** That instruction is right and worth
keeping wherever the roles land.

---

## What is confirmed needed, and which tool eats it

| Workbook tab | Feeds | Why it cannot be skipped |
| --- | --- | --- |
| 2. Roster | HR Console, Daily Setups, every tool that names a person | Nothing works without it. It is the identity list the whole Hub joins on. |
| 3. Stations and Hours | Daily Setups | The board is generated from these. No stations, no board. |
| 4. People Rules | Daily Setups auto-assign | This is the difference between a board that is full and a board that is correct. |
| 6. Slack | The worker's reminders and alerts | Every scheduled post needs a channel that exists and has the bot in it. |
| 7. Financial Setup | FCR, Labor Planner, Food Cost, EOS scorecard | Equipment rent and the business service fee are read directly by the FCR projection. Last year's sales feeds the sales-vs-LY row. |
| 8. Questions for Us | Nothing, deliberately | Costs a store nothing and catches the thing the workbook did not think to ask. |

---

## Two additions worth making

### Add the four goals as a set, and say they drive colour

Tab 7 asks for food, paper, labor and turnover goals separately. They should
say plainly that these are what turn a number red or green on every screen. A
store that leaves them blank gets a Hub with no opinion, which is worse than a
wrong opinion because nobody notices.

### Add the one input no other operator can copy

PTO balances come from a spreadsheet the office manager keeps, and it is
different at every store. It is the only input where our answer is useless to
them and they have to name their own. Worth its own line so it is not skipped.

---

## What I did not touch

The seven accounts, the timeline, and the yellow-cell convention on Start Here.
Those are process, not data, and they are not mine to trim.
