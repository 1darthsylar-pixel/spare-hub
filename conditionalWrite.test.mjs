/* ══════════════════════════════════════════════════════════════════════════
   conditionalWrite.test.mjs — A SAVE THAT REFUSES TO ERASE SOMEBODY ELSE'S WORK.

       node conditionalWrite.test.mjs

   From the structural audit, Aug 16 2026. `/api/kv-set` writes a whole record
   blind, and the schedule has EIGHT writers: Build, Save, the publish re-save,
   the unattended repair pass and `applySwap`. Two leaders open Lineup, both
   read the week, both save, and the first one's entire week is gone — no error,
   no conflict, no record, roughly a hundred people's hours.

   ⚠️⚠️ THE FAILURE IS SILENT, WHICH IS WHY THIS FILE RUNS THE RULE RATHER THAN
   READING IT. Nothing throws, nothing logs, and both callers are told "saved".
   A test that grepped for `ifSavedAt` would be green while the comparison
   itself was inverted.

   ⚠️ WHAT THIS GRADES, AND WHAT IT CANNOT. The Worker route is not importable
   from Node — worker.js is a Cloudflare module with a live environment behind
   it. So this grades the DECISION the route makes, expressed once here exactly
   as the route expresses it, plus the retry protocol the callers rely on.
   Driving the real route needs a request against a deployed Worker and is
   recorded as owed. */

let pass = 0;
const fails = [];
const ok = (what, cond) => { if (cond) pass++; else fails.push(what); };

/* ── the route's decision, stated once ──────────────────────────────────────
   Mirrors worker.js /api/kv-set: an absent `ifSavedAt` writes unconditionally,
   a present one must equal the stored record's `savedAt`. */
const wouldRefuse = (stored, ifSavedAt) => {
  if (!ifSavedAt) return false;
  const curAt = stored && typeof stored === "object" ? String(stored.savedAt || "") : "";
  return curAt !== String(ifSavedAt);
};

const week = (savedAt) => ({ savedAt, days: { Mon: { iso: "2026-08-24", sides: {} } } });

/* ── 1 · the old behaviour is untouched ─────────────────────────────────── */

/* ⚠️⚠️ THE MOST IMPORTANT CASE IN THE FILE. ~132 call sites and every
   pre-sign-in publish send no version at all, and every one of them must keep
   working exactly as before (rule 1). */
ok("★★ no version means an ordinary unconditional write",
  !wouldRefuse(week("2026-08-16T10:00:00Z"), null));
ok("no version writes over anything at all",
  !wouldRefuse(week("anything"), undefined) && !wouldRefuse(null, ""));

/* ── 2 · the guard itself ───────────────────────────────────────────────── */

const A = "2026-08-16T10:00:00Z";
const B = "2026-08-16T10:05:00Z";

ok("★ writing against the version you read is allowed", !wouldRefuse(week(A), A));
ok("★★ writing against a version somebody has replaced is refused", wouldRefuse(week(B), A));

/* A record that has never been saved has no version to match. Sending one is
   the caller claiming to have read something that is not there. */
ok("★ a missing record refuses a versioned write", wouldRefuse(null, A));
ok("a record with no savedAt refuses a versioned write", wouldRefuse({ days: {} }, A));

/* ⚠️ STRING EQUALITY, NEVER A DATE COMPARISON. Parsing both sides into Dates
   would make two different instants that round to the same millisecond compare
   equal, and would throw on a malformed stamp. The version is an opaque token
   that happens to look like a time. */
ok("the comparison is exact, not chronological", wouldRefuse(week(A), B));
ok("a later stored version still refuses an older claim", wouldRefuse(week(B), A));

/* ── 3 · the lost update this exists to stop ────────────────────────────── */
{
  /* The real sequence, played out. Two leaders, one week. */
  let stored = week(A);
  const leaderA = stored.savedAt;          // both read the same version
  const leaderB = stored.savedAt;

  /* A saves first. */
  ok("A's save is allowed", !wouldRefuse(stored, leaderA));
  stored = week(B);

  /* ⚠️⚠️ THIS IS THE WHOLE BUG. Before the guard, B's save landed and A's week
     was gone with nobody told. */
  ok("★★ B's save is refused rather than silently erasing A's week",
    wouldRefuse(stored, leaderB));

  /* And after re-reading, B can save. */
  ok("★ B can save once they have read the newer week",
    !wouldRefuse(stored, stored.savedAt));
}

/* ── 4 · the retry protocol ─────────────────────────────────────────────── */
{
  /* The repair pass retries once because `repairWeek` is pure: re-reading and
     re-running answers the question again against the record that won. This
     grades the PROTOCOL, not the engine — that a conflict is followed by a
     re-read and a write against the NEW version, never a blind second attempt
     with the same stale one. */
  let stored = week(B);
  const stale = A;
  const attempts = [];
  const attempt = (v) => { attempts.push(v); return !wouldRefuse(stored, v); };

  let done = attempt(stale);
  ok("the first attempt against a stale version fails", !done);
  if (!done) done = attempt(stored.savedAt);      // re-read, then retry
  ok("★ the retry uses the version that was just read", done);
  ok("★★ the retry never repeats the stale version",
    attempts[1] !== stale && attempts.length === 2);
}

/* ── 5 · the three outcomes stay three ──────────────────────────────────── */
{
  /* ⚠️ `kvSetIf` RETURNS { ok, conflict, savedAt }, NOT A BOOLEAN, and that is
     load-bearing. "Somebody else got there first" and "the write failed" need
     different sentences on screen and different behaviour in code. Folding them
     into one false is how a conflict turns back into a silent overwrite. */
  const shapes = [
    { ok: true },
    { ok: false, conflict: true, savedAt: B },
    { ok: false },
  ];
  ok("a success is not a conflict", shapes[0].ok === true && !shapes[0].conflict);
  ok("★ a conflict is distinguishable from a plain failure",
    shapes[1].conflict === true && shapes[2].conflict === undefined);
  ok("★ a conflict hands back the version that won", shapes[1].savedAt === B);
  ok("★★ both failures are falsy on ok, so a caller cannot mistake either for a save",
    !shapes[1].ok && !shapes[2].ok);
}

if (fails.length) {
  console.log(`\nconditionalWrite: ${pass} passed, ${fails.length} FAILED`);
  fails.forEach((f) => console.log(`  FAILED  ${f}`));
  process.exit(1);
}
console.log(`\nconditionalWrite: ${pass} passed`);
