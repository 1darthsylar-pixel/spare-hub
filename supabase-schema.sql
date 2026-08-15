-- ═══════════════════════════════════════════════════════════════
--  Gate City Hub — Supabase schema
--  Run this once in your Supabase project:
--    Dashboard → SQL Editor → New query → paste all of this → Run
--
--  ⚠️⚠️ THIS FILE IS WHAT A SECOND STORE GETS BUILT FROM. Everything below was
--  read back out of the live Gate City project on Aug 12 2026 and compared
--  statement by statement, because the last three times this file was trusted
--  it was wrong in a way nobody could see:
--    • Jul 29 2026 — it still said `using (true)` on everything, describing an
--      OPEN database, years after production had been tightened.
--    • Aug 4 2026 — it RECREATED write policies that production had dropped, so
--      re-running the documented setup script silently undid the lockdown.
--    • Aug 12 2026 — it was missing four whole objects (below). A store built
--      from it would have had a PIN throttle that could not count and an upload
--      button that failed on every press.
--  A schema file that does not match production is worse than no schema file,
--  because it gets trusted. If you change production, change this in the same
--  commit.
--
--  ⚠️ KEY NAMES STAY `gcfcr-` AT EVERY STORE, ON PURPOSE. The database is
--  per-store, so the prefix is decoration, not a namespace — Village's keys live
--  in Village's project and can never collide with Gate City's. Renaming them
--  would touch ~132 call sites across store.js and worker.js to buy nothing.
--  Do not "tidy" this for a new store.
-- ═══════════════════════════════════════════════════════════════

-- ⚠️⚠️ ALL OR NOTHING, AND THE `begin` IS LOAD-BEARING. Two policies below are
-- replaced with `drop` then `create`. Between those two statements RLS is
-- enabled with NO read policy, which denies every read — that is the whole app
-- blank for ~106 people, not a degraded corner. Pasting the file as one batch
-- is already atomic because Postgres wraps a multi-statement string in an
-- implicit transaction, but people run statements one at a time when something
-- errors, and that is exactly when the window opens.
--
-- ⚠️ SO: RUN THE WHOLE FILE, NEVER A HANDFUL OF LINES FROM IT. If it fails,
-- everything rolls back and the database is untouched, which is the outcome you
-- want from a failed setup script.
--
-- ★ For a SINGLE key added to an existing policy, `alter policy` is better than
-- this and has no window at all — that is how the two Aug 12 keys went into
-- production. Use `alter policy` for a one-key change; use this file for a
-- fresh store or a full reapply.
begin;

-- ── 1. Live shared state (Waste Tracker, Supply Central) ────────
create table if not exists kv_store (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz default now()
);

-- ── 2. Append-only logs (Food Safety, Equipment Check) ──────────
create table if not exists submissions (
  id           uuid primary key default gen_random_uuid(),
  tool         text not null,
  submitted_by text,
  payload      jsonb,
  submitted_at timestamptz default now()
);

create index if not exists submissions_tool_time_idx
  on submissions (tool, submitted_at desc);

-- ── 3. Sign-in throttle counters ────────────────────────────────
-- ⚠️⚠️ ADDED TO THIS FILE Aug 12 2026, THREE DAYS LATE. The table and both
-- functions went into production on Aug 9 (auth Stage 2) and were never written
-- down here. A store stood up from this file in those three days would have got
-- a database with no counters at all — and because bumpCounter FAILS OPEN by
-- design (a throttle fault must never become a sign-in outage), the PIN limiter
-- would have reported healthy and held NOTHING. Silent, and exactly the shape
-- this file's own warnings keep describing.
--
-- ⚠️ WHY POSTGRES AND NOT CLOUDFLARE KV. KV has no atomic increment and serves
-- reads from the colo cache, so the old `n = get(k); put(k, n+1)` lost every
-- concurrent write: 2,000 parallel POSTs all read 0 and the counter ended at 1.
-- "Eight guesses" was never eight. One INSERT ... ON CONFLICT DO UPDATE ...
-- RETURNING is a single statement under a row lock, which is the whole point.
create table if not exists rate_counters (
  k      text primary key,
  n      integer     not null default 0,
  resets timestamptz not null
);

-- INCREMENT-THEN-JUDGE: the caller compares with `>`, so the effective ceiling
-- is exactly the number the client already prints a message for.
create or replace function public.bump_counter(p_key text, p_window_sec integer)
  returns integer
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare v integer;
begin
  insert into rate_counters (k, n, resets)
  values (p_key, 1, now() + make_interval(secs => p_window_sec))
  on conflict (k) do update
    set n = case when rate_counters.resets < now() then 1 else rate_counters.n + 1 end,
        resets = case when rate_counters.resets < now()
                      then now() + make_interval(secs => p_window_sec)
                      else rate_counters.resets end
  returning n into v;
  return v;
end $function$;

create or replace function public.reset_counter(p_key text)
  returns void
  language sql
  security definer
  set search_path to 'public'
as $function$
  delete from rate_counters where k = p_key
$function$;

-- ⚠️⚠️ THIS REVOKE IS LOAD-BEARING AND POSTGRES WILL NOT DO IT FOR YOU.
-- New functions grant EXECUTE to PUBLIC by default, and both of these are
-- SECURITY DEFINER. Left as-is, anyone holding the publishable key that ships
-- in the browser bundle could call reset_counter and wipe their own sign-in
-- throttle before every batch of guesses — the limiter would be decorative.
-- Verified in the live project: anon, authenticated and public all read
-- has_function_privilege = false; service_role = true.
revoke execute on function public.bump_counter(text, integer) from public, anon, authenticated;
revoke execute on function public.reset_counter(text)          from public, anon, authenticated;
grant  execute on function public.bump_counter(text, integer) to service_role;
grant  execute on function public.reset_counter(text)          to service_role;

-- ── 4. Tool-open events (usage reporting) ───────────────────────
-- ⚠️ ALSO MISSING FROM THIS FILE UNTIL Aug 12 2026. Worker-only, on the service
-- key. RLS on with no policy, which is fail-CLOSED and correct.
create table if not exists tool_events (
  id        bigserial primary key,
  tool      text not null,
  uid       text,
  person    text,
  tier      smallint,
  opened_at timestamptz not null default now()
);

create index if not exists tool_events_opened_at_idx on tool_events (opened_at desc);
create index if not exists tool_events_tool_idx      on tool_events (tool);
create index if not exists tool_events_uid_idx       on tool_events (uid);

-- ⛔ `gcfcr_hr_store` EXISTS IN THE GATE CITY PROJECT AND IS DELIBERATELY NOT
-- CREATED HERE. Checked Aug 12 2026 before deciding: 0 rows, and 0 references
-- anywhere in the repo — not store.js, not worker.js, not one component. It is
-- a leftover. A new store should not inherit a table nothing reads, because the
-- next person to find it will reasonably assume it matters.

-- ── 5. Row Level Security ───────────────────────────────────────
-- ⚠️ THE PUBLISHABLE KEY IS PUBLIC. It ships inside the JavaScript bundle at
-- the store's own domain — that is how Supabase is designed to work, and it
-- cannot be hidden. Everything below IS the security model. There is nothing
-- behind it.
--
-- ⚠️ The Worker uses the SERVICE key, which bypasses RLS entirely. So any key
-- denied here is still reachable through /api/hr-store, which does its own
-- per-person filtering. Deny here, allow there — that is the intended shape,
-- and it is why denying a read below does not break the Hub.
--
-- ⚠️ TABLE GRANTS ARE WIDE OPEN AND THAT IS NORMAL. Supabase grants anon and
-- authenticated full DML on every public table; RLS is what actually holds the
-- door. Do not "fix" the grants — checked live, all five tables look like this,
-- and narrowing them is not how this model works.

alter table kv_store      enable row level security;
alter table submissions   enable row level security;
alter table rate_counters enable row level security;
alter table tool_events   enable row level security;

-- ── kv_store SELECT ──
-- Everything is readable EXCEPT the keys listed here. Every one of these is
-- also in store.js HR_PROTECTED, so the Hub reads them through the Worker and
-- never directly.
--
-- ⚠️⚠️ THERE ARE FIVE LISTS AND THEY MUST MOVE TOGETHER: this file, store.js
-- HR_PROTECTED, worker.js HR_PROTECTED, worker.js SEC_MUST_BE_DENIED, and
-- worker.js KVSET_NEEDS_HR. Being on four and missing from the fifth reads as
-- protected right up until someone checks. It has happened five times:
--
-- 🐛 gcfcr-hr-pins, Jul 29 2026 — 106 PINs, 83 of them plaintext, readable by
--    anyone who opened the site. On all four other lists.
-- 🐛 gcfcr-hr-writeups-v1 / -evals-v1 / gcfcr-push-subs-v1, Jul 31 2026 — found
--    OPEN in production: 17 disciplinary records with names and details, 2
--    evaluations, and 35 push devices with endpoint, p256dh, auth, uid, name and
--    role. On none of the lists.
-- 🐛 gcfcr-hr-leadership-v1, Aug 4 2026 — shipped Aug 3 on the write gate and
--    no other list.
-- 🐛 gcfcr-rollouts-v1, Aug 7 2026 — world-readable AND world-writable from the
--    day it shipped.
-- 🐛 gcfcr-receipt-sends-v1, Aug 12 2026 — ADDED TO THIS FILE ONLY NOW, and see
--    the note at the bottom of the file: in the live Gate City project it is
--    still readable, and it has held a real row since Aug 11.
drop policy if exists "kv read"  on kv_store;
create policy "kv read" on kv_store for select using (
  key <> ALL (ARRAY[
    'gcfcr-hr-evals','gcfcr-hr-injuries','gcfcr-hr-files','gcfcr-hr-info',
    'gcfcr-hr-cfahome','gcfcr-hr-sigs','gcfcr-hr-docs-v1','gcfcr-hr-docfiles-v1',
    'gcfcr-hr-docsends-v1','gcfcr-hr-evaltpl-v1','gcfcr-hr-evaltasks-v1',
    'gcfcr-hr-evalcopy-v1','gcfcr-hr-pins',
    -- The IPO plan names every cost category the store runs over Chick-fil-A
    -- benchmark and the dollar variance on each. Read only through
    -- /api/ipo-plan, which gates at tier 3.
    'gcfcr-ipo-plans-v1',
    -- Zero repo references (leftovers from the -migrated-v1 rename) and
    -- push-subs is service-key only. Denied because removing a deny buys
    -- nothing, and a regression re-opening one would otherwise be unreported.
    'gcfcr-hr-writeups-v1','gcfcr-hr-evals-v1','gcfcr-push-subs-v1',
    -- All 106 members with emails.
    'gcfcr-hr-team-v1',
    'gcfcr-rollouts-v1',
    -- The Leadership Standards demerit file. It names people and says what they
    -- did.
    'gcfcr-hr-leadership-v1',
    -- ⚠️ ADDED Aug 11 2026, BEFORE the reward ledger has a single row in it.
    -- The demerit file two lines up shipped on four lists and missed the
    -- fifth, and was world-readable until somebody probed for it. This one
    -- goes onto every list in the same commit as the code that writes it, so
    -- there is never a window where it is open.
    'gcfcr-hr-tokens-v1',
    -- ⚠️⚠️ ADDED Aug 14 2026, AND THIS ONE WAS NOT A NEAR MISS. Every other key
    -- above was denied before or as it was written. gcfcr-pto-v1 has been live
    -- and readable the whole time it has existed. Probed as `anon` against
    -- production before the fix: it returned the full 4,012-byte value, not
    -- just the key name. 33 people's year-end bonus DOLLARS, 17 people's 2026
    -- balances, dated absences. No sign-in required.
    -- ⚠️ IT WAS HALF FIXED ALREADY, WHICH IS WHY NOBODY LOOKED AGAIN.
    -- /api/pto-seed was locked down Aug 10 "because ~40 people's bonus dollars
    -- and dated absences were a public download". That closed the import route.
    -- The ledger it imported INTO stayed open, on all four lists, for four more
    -- days. Fixing the route somebody used is not the same as fixing the data.
    -- Safe to deny: as of the same commit both browser readers go through
    -- /api/hr-store, and the Worker's own reads use the SERVICE key, which
    -- bypasses RLS entirely.
    'gcfcr-pto-v1',
    -- ⚠️ ADDED Aug 12 2026, AND IT IS THE SIXTH TIME THIS FILE HAS BEEN THE
    -- STALE LIST. gcfcr-receipt-sends-v1 was on store.js HR_PROTECTED, on the
    -- Worker's HR_PROTECTED, and on the sweep's SEC_MUST_BE_DENIED — three of
    -- the four — with a comment in store.js explaining exactly why it must be
    -- denied. It was missing from HERE and from production, so it was readable
    -- by anyone with the publishable key for as long as it existed. The 5am
    -- sweep reported it EXPOSED on Aug 12, which is the nag working exactly as
    -- store.js predicted it would when it listed the key ahead of the policy.
    -- It holds who emailed which paid-out receipt to which address.
    -- Safe to deny: nothing in the browser reads it. /api/receipt-email writes
    -- it on the SERVICE key, which bypasses RLS entirely.
    -- ✅ APPLIED IN PRODUCTION Aug 12 2026 with ALTER POLICY (never DROP —
    -- a dropped SELECT policy leaves RLS denying every read, which is the whole
    -- app blank for 106 people until the CREATE lands). Verified immediately as
    -- the `anon` role: this key and gcfcr-hr-tokens-v1 both returned 0 rows,
    -- gcfcr-hr-pins was still denied, and gcfcr-hr-roles still returned its row
    -- with 1,062 keys still listable — so nothing was over-denied.
    'gcfcr-receipt-sends-v1',
    -- ⚠️⚠️ TWO SESSIONS ADDED KEYS TO THIS ARRAY WITHIN THE HOUR, Aug 13 2026,
    -- AND ONE OVERWROTE THE OTHER IN PRODUCTION. Both blocks below are kept
    -- because both are right; what follows is the part worth learning from.
    --
    -- The wages entry was applied with a FULL `alter policy ... using (...)`
    -- that retyped the whole array. The messaging entry was applied with a DO
    -- block that READ the existing expression and appended to it, specifically
    -- so it could not clobber anyone. Read back afterwards, production held the
    -- wages key and NOT the three messaging keys — so the full replacement won
    -- and silently dropped three denies that another session had already
    -- applied and verified.
    --
    -- ⇒ NEVER RETYPE THIS ARRAY AGAINST PRODUCTION. Append to what is there,
    -- the way the messaging block did. A full replacement is only safe when
    -- nobody else is working, and on this repo somebody else always is.
    -- ⇒ AND RE-READ THE LIVE POLICY AFTER MERGING, not just after applying.
    -- Both sessions verified their own change and neither would have caught
    -- this; it only showed up when the two branches met.

    -- ⚠️⚠️ WAGES. ADDED Aug 13 2026, AND ADDED WHILE THE KEY WAS STILL EMPTY,
    -- which is the whole point. `gcfcr-hr-pay-v1` went onto store.js
    -- HR_PROTECTED and the Worker HR_PROTECTED earlier the same day, with an id
    -- lock on top (HR_ID_LOCKED) so only three people get it even through the
    -- Worker. It was missing from HERE, which is the ONLY list that stops a
    -- DIRECT read — so it sat on two lists out of three and read as protected
    -- right up until somebody checked.
    --
    -- ⚠️ THAT IS THE SEVENTH TIME THIS FILE HAS BEEN THE STALE ONE. The
    -- difference is that this time there was nothing to leak yet: the key held
    -- zero rows when this landed. Every earlier entry was closed AFTER data was
    -- already sitting in it. Denying before the data lands is the order this
    -- file keeps asking for and rarely gets.
    --
    -- ✅ APPLIED IN PRODUCTION Aug 13 2026 with ALTER POLICY (never DROP — a
    -- dropped SELECT policy leaves RLS denying every read, which is the whole
    -- app blank for ~106 people until the CREATE lands).
    -- Verified by reading AS the `anon` role, with a canary:
    --   gcfcr-hr-pay-v1  → 0 rows      denied
    --   gcfcr-hr-evals   → 0 rows      still denied
    --   gcfcr-hr-added-v1 → 1 row       THE CANARY: a normal key still reads
    -- ⚠️⚠️ THE CANARY MOVED Aug 14 2026 AND THAT IS NOT COSMETIC. It used to be
    -- `gcfcr-skills-%`, which this same commit DENIES. Anybody following this
    -- recipe afterwards would have read 0 rows for the canary — which is exactly
    -- what a broken connection looks like, and this file already records a probe
    -- fooled by precisely that into a false all-clear.
    -- ⇒ `gcfcr-hr-added-v1` is the right replacement because it can NEVER be
    -- denied: the sign-in path reads it before a token exists, so putting it
    -- behind the gate breaks sign-in for every team member — and
    -- availabilityLocked.test.mjs asserts it stays off HR_PROTECTED. A canary
    -- that cannot quietly stop being a canary.
    --   whole table      → 1,131 rows  nothing over-denied
    -- ⚠️ THE CANARY IS NOT OPTIONAL. Without it, "0 rows everywhere" is also
    -- what a failed connection looks like, and that reads as a perfect
    -- all-clear. An earlier probe recorded in this file was fooled by exactly
    -- that.
    'gcfcr-hr-pay-v1',
    -- ⚠️⚠️ ADDED Aug 13 2026, AND THE FIRST TWO WERE ALREADY LIVE AND OPEN.
    -- The messaging build shipped in three parts the same day. Announcements
    -- (part 1) and shift threads (part 2) both merged BEFORE anyone added them
    -- here, so both were readable by anyone holding the publishable key for the
    -- hours in between. Seventh time this file has been the stale list.
    -- Escalations (part 3) goes on in the same commit as the code, which is
    -- what the tokens entry above says to do and what I failed to do twice.
    --
    -- WHAT IS IN THEM:
    --   · announcements — the notice, plus `opens` and `acks` BY NAME.
    --     /api/announcements-mine strips those maps from everyone but a leader,
    --     and a direct read makes that stripping worthless.
    --   · shift-threads — the conversation on one request off. Through the Hub
    --     only the person who asked and a leader can see one.
    --   · escalations — a reason plus a free note, sent to the leader on duty.
    --     The field somebody writes "my father is in hospital" into.
    --
    -- SAFE TO DENY: verified by statement, not substring — no .jsx and no .js
    -- outside worker.js and the two leaves names any of these keys or their
    -- ANNOUNCE_KEY / THREADS_KEY / ESCALATIONS_KEY constants. Every route reads
    -- and writes them on the SERVICE key, which bypasses RLS entirely.
    --
    -- ✅ APPLIED IN PRODUCTION Aug 13 2026, and PROVEN BY OUTPUT.
    --   • ALTER POLICY inside a DO block that read the existing USING
    --     expression and APPENDED a new conjunct, so the 22 keys already in the
    --     array were never retyped and there was no moment without a SELECT
    --     policy. Idempotent: it looks for 'gcfcr-escalations-v1' and returns.
    --   • ⚠️ COUNTING AS anon PROVED NOTHING AT FIRST, and that is worth saying:
    --     production holds ZERO rows on all three keys today, so 0 was the
    --     answer with or without the deny — the same worthless check the
    --     calendar apply caught itself making the day before.
    --   • ⇒ Proved inside a transaction that was ROLLED BACK: probe rows
    --     inserted as the owner, then read as `anon` — all three returned 0
    --     while a plain control key returned 1. Probe rows left afterwards: 0.
    --   • Nothing over-denied: gcfcr-hr-roles still reads, gc-cal-slots-v1
    --     still reads (booking untouched), gcfcr-hr-pins still denied, and
    --     `anon` can still list 1,131 rows. Policy count on kv_store: still 1.
    'gcfcr-announcements-v1', 'gcfcr-shift-threads-v1', 'gcfcr-escalations-v1',
    -- ⚠️⚠️ ADDED Aug 14 2026, AND BOTH WERE LIVE AND OPEN. Availability for 99
    -- people and certifications for 96, served to anyone holding the publishable
    -- key that ships inside the browser bundle. Not one person's record: the
    -- whole store, in a single request, to somebody who never signed in.
    --
    -- WHAT IS IN THEM:
    --   · availability — the days and hours each person can work. School
    --     nights, a second job, the shifts somebody cannot do. Read together
    --     it is a map of ~99 people's lives outside this restaurant.
    --   · skills — what each person is certified on. Less sensitive alone,
    --     and it names every member of the team next to what they can do.
    --
    -- ⚠️ THIS ENTRY LANDED IN THE SAME COMMIT AS store.js HR_PROTECTED AND THE
    -- WORKER'S COPY, deliberately. Wages went onto those two lists a day before
    -- reaching this file and read as protected the whole time, because this is
    -- the ONLY list that stops a direct read. That was the seventh time this
    -- file was the stale one. This is the entry that stops it being an eighth.
    --
    -- SAFE TO DENY, PROVED BEFORE WRITING IT: the sign-in batch in App.jsx
    -- reads /api/pin-verify, gcfcr-hr-roles, gcfcr-hr-added-v1 and the Slack
    -- avatar map — and none of these two. The tile that uses them is lazy() and
    -- cannot run before sign-in. availabilityLocked.test.mjs section 1 asserts
    -- both, so the Jul 31 failure (a protected key inside the sign-in batch,
    -- which 401'd the whole store out) cannot recur silently.
    --
    -- NOBODY LOSES ACCESS: /api/hr-store admits any signed-in token regardless
    -- of tier, so every leader building a rota reads what they read yesterday.
    --
    -- ✅ APPLIED IN PRODUCTION Aug 14 2026, AND PROVED BY OUTPUT BOTH WAYS.
    --   • ALTER POLICY inside a DO block that READ the existing USING expression
    --     with pg_get_expr and APPENDED a conjunct, so the 27 keys already in
    --     the array were never retyped — retyping is how a key silently falls
    --     off a deny list. Idempotent: it looks for 'gcfcr-availability-v1' and
    --     returns. It RAISES rather than CREATEs if the policy is missing,
    --     because a missing policy must never become a guess.
    --   • Never DROP. A dropped SELECT policy leaves RLS denying every read,
    --     which is the whole app blank for ~106 people until the CREATE lands.
    --   • Measured AS the `anon` role, in a transaction that was ROLLED BACK,
    --     before and after:
    --
    --                                        before   after
    --       gcfcr-availability-v1              1   →    0     closed
    --       gcfcr-skills-v1                    1   →    0     closed
    --       gcfcr-hr-added-v1  THE CANARY      1   →    1     still reads
    --       gcfcr-hr-pay-v1    control         0   →    0     stayed denied
    --       whole table                     1153   → 1151     exactly 2 fewer
    --
    --   ⚠️ THE LAST ROW IS THE ONE THAT PROVES NOTHING WAS OVER-DENIED. 1153 to
    --     1151 is exactly the two keys and nothing else. A policy that denied
    --     too much would show up there and nowhere else, and it would surface as
    --     blank tiles for 106 people rather than as an error.
    --   • Confirmed after: the service role still reads both keys and both rows
    --     are intact. This denies a READ; it deletes nothing.
    'gcfcr-availability-v1', 'gcfcr-skills-v1'  ])
  -- ⚠️⚠️ ADDED Aug 12 2026, AND THESE ARE THE FIRST PREFIX DENIES IN THIS
  -- POLICY. Every entry above is one exact key. The internal calendar's
  -- invitations are keyed PER PERSON — gc-cal-events-v1:17,
  -- gc-cal-replies-v1:20 — so there is no fixed name to list and an exact-match
  -- array cannot reach them however many rows get added.
  --
  -- WHAT IS IN THEM: an event carries a title, a time and a note, written by a
  -- leader about a meeting. "Performance conversation" with somebody named in
  -- it is the ordinary case, not the worst one. A reply row carries who
  -- declined and the note they gave for declining.
  --
  -- WHY NOW: the Calendar tile moved to tier 1 the same day (Matt: "open it to
  -- everyone"), so the screen is on ~106 devices, several of them shared iPads
  -- on the floor. The Hub itself no longer hands these rows out — the tile
  -- reads /api/calendar-mine, which returns only the meetings that person is
  -- actually in — but that is the Hub declining to serve them, not the database
  -- declining to. Without these two lines they stay fetchable directly by
  -- anyone holding the publishable key that ships in the browser bundle.
  -- Both halves are needed. Only one of them is code, and the code half is
  -- already merged, which is the "on four lists, missing from the fifth"
  -- shape this file has been caught by six times.
  --
  -- SAFE TO DENY: nothing in the browser reads either prefix. Verified by
  -- statement, not substring — no .jsx or .js outside worker.js and the
  -- calendarStore leaf mentions gc-cal-events-v1, gc-cal-replies-v1, eventsKey
  -- or repliesKey. Both routes read and write them on the SERVICE key, which
  -- bypasses RLS entirely.
  -- ⚠️ THE BOOKING HALF IS DELIBERATELY NOT HERE. gc-cal-types-v1 and
  -- gc-cal-slots-v1:* ARE still read straight from the browser by CalendarTile
  -- and TeamDirectory. Denying those prefixes takes the booking screen down.
  and key not like 'gc-cal-events-v1:%'
  and key not like 'gc-cal-replies-v1:%'
);

-- ✅ APPLIED IN PRODUCTION Aug 12 2026, and verified by output rather than by
-- reading the policy back.
--   • Applied with ALTER POLICY inside a DO block that READ the existing USING
--     expression and appended to it, so the deny array was never retyped and
--     there was never a moment without a SELECT policy. Idempotent: it checks
--     for 'gc-cal-events-v1' first and does nothing on a re-run.
--   • ⚠️ THE FIRST VERIFICATION WAS WORTHLESS AND SAYING SO IS THE POINT.
--     Counting gc-cal-events-v1 rows as `anon` returned 0 — but production
--     holds ZERO of those rows today, so 0 was the answer either way. A deny
--     that is never exercised proves nothing, which is the same shape as a
--     fixture that only ever carries the assumed record.
--   • ⇒ Proved properly inside a transaction that was ROLLED BACK: probe rows
--     inserted as the owner, then read as `anon` — gc-cal-events-v1:deny-probe
--     and gc-cal-replies-v1:deny-probe returned 0 rows while
--     gc-cal-slots-v1:deny-probe and a plain control key returned 1 each.
--     Nothing persisted; probe rows left afterwards: 0.
--   • Nothing over-denied: gc-cal-types-v1 and gc-cal-slots-v1:* still read
--     (booking is untouched), gcfcr-hr-roles still reads, gcfcr-hr-pins and
--     gcfcr-receipt-sends-v1 still denied, and `anon` can still list 1,094 of
--     the 1,109 rows. Policy count on kv_store is still exactly 1.
--
-- ── HOW TO APPLY THE TWO LINES ABOVE AT ANOTHER STORE ─────────────────────
-- ⚠️ IN A TRANSACTION. The note further up says "ALTER POLICY, never DROP",
-- because a dropped SELECT policy leaves RLS denying every read and that is
-- gatecityhub.com blank for 106 people until the CREATE lands. Postgres DDL is
-- transactional, so wrapping the drop and the create together closes that
-- window completely and avoids keeping a second copy of the deny array in an
-- ALTER statement, which would be one more list to drift.
--
--   begin;
--   drop policy if exists "kv read" on kv_store;
--   <paste the whole `create policy "kv read"` block above>
--   commit;
--
-- Then verify AS THE anon ROLE, not as the owner, and check the DATA:
--   select key from kv_store where key like 'gc-cal-events-v1:%';   -- expect 0 rows
--   select key from kv_store where key like 'gc-cal-types-v1%';     -- expect its row
--   select key from kv_store where key = 'gcfcr-hr-roles';          -- expect its row
-- The middle and last lines matter as much as the first: they prove nothing was
-- over-denied. The Aug 12 receipt-sends apply checked exactly this way.
--
-- ⚠️ WRITES NEED NOTHING. Measured in pg_policy on Aug 12 2026 rather than read
-- off the comments below: kv_store carries exactly ONE policy, "kv read", for
-- SELECT, and relrowsecurity is on. With RLS enabled and no INSERT, UPDATE or
-- DELETE policy, the publishable key cannot write these rows at all. The
-- paragraph below beginning "EVERYTHING ELSE IS STILL WRITEABLE" predates the
-- Aug 4 lockdown described under it and is no longer true of writes.

-- ── kv_store INSERT / UPDATE / DELETE ──
-- ⛔ THERE ARE NO WRITE POLICIES, ON PURPOSE. Confirmed live Aug 12 2026:
-- kv_store carries exactly one policy and it is this SELECT. Every browser
-- write goes through the Worker on the service key, which bypasses RLS.
--
-- 🐛 THIS FILE ONCE RECREATED THEM, AND IT DROPPED THE LIVE ONES FIRST. So
-- re-running the documented setup script — the obvious thing to do when
-- standing up a second store — silently undid the Aug 2 lockdown and handed the
-- write door back to anyone holding a key that ships in the browser. A setup
-- file that reverts your security is worse than no setup file, because it looks
-- like the source of truth.
--
-- ⚠️ DO NOT ADD WRITE POLICIES BACK HERE. If the Hub ever needs a direct
-- browser write again, that is a design decision, and it belongs in a reviewed
-- migration rather than in the file people run without reading.
--
-- ⚠️ A DENIED UPDATE OR DELETE RETURNS HTTP 204, NOT AN ERROR. PostgREST
-- reports "zero rows affected" and "success" identically. When testing this,
-- check the DATA afterwards — the status code will tell you nothing.

-- ── submissions SELECT ──
-- ⚠️ BOTH TOOLS, NOT ONE. The live Gate City policy denies `onboarding-intake`
-- only; `class-survey` is on SUB_PROTECTED in both store.js and worker.js and
-- was never added to the database. It has no rows yet, so nothing has leaked —
-- and it is written here denied so that no NEW store repeats it.
--   onboarding-intake : a new hire's name, whether they are a MINOR, and the
--                       storage path of their uploaded ID.
--   class-survey      : promised to students as anonymous. An open read policy
--                       lets anyone with the browser key pull every response.
drop policy if exists "sub read" on submissions;
create policy "sub read" on submissions for select using (
  tool <> ALL (ARRAY['onboarding-intake','class-survey'])
);

-- ⛔ NO INSERT POLICY ON submissions, ON PURPOSE. It was once `with check
-- (true)` — fully open write. Both doors are held by the Worker on the service
-- key. Nothing in the app needs a policy here. Do not add one back without
-- deciding, record by record, who is meant to read what.

-- ⛔ rate_counters AND tool_events GET NO POLICIES AT ALL. RLS on with zero
-- policies is fail-CLOSED: anon and authenticated can do nothing, the service
-- key bypasses RLS and does everything. Supabase's advisor reports this as two
-- INFO lints ("RLS enabled, no policy"). That is the correct state — do not
-- silence the lint by adding a policy.

-- ── 6. Storage buckets ─────────────────────────────────────────
-- ⚠️⚠️ MISSING FROM THIS FILE UNTIL Aug 12 2026, AND THIS IS THE ONE THAT
-- BREAKS A NEW STORE ON DAY ONE. Every upload path in the Hub names its bucket
-- as a string literal. With no bucket, every press of every upload button
-- fails, and the failure looks like a broken feature rather than missing setup.
--
-- ⚠️ `Receipts` HAS A CAPITAL R. Bucket ids are case-sensitive and the repo
-- spells it that way in six places. Do not normalise it.
--
-- ⚠️ ONLY hub-assets IS PUBLIC. The other five hold food-safety photos, HR
-- files, coursework, receipts and trainer task photos, and they are read
-- through a Worker route that proxies the bytes — never by handing the browser
-- a provider URL. A signed URL is a bearer token: it leaks the backend host and
-- lands in the history of a shared iPad.
insert into storage.buckets (id, name, public) values
  ('food-safety-photos', 'food-safety-photos', false),
  ('hr-files',           'hr-files',           false),
  ('hub-assets',         'hub-assets',         true),
  ('l101-coursework',    'l101-coursework',    false),
  ('Receipts',           'Receipts',           false),
  ('trainer-task-photos','trainer-task-photos',false)
on conflict (id) do nothing;

-- ⛔ NO STORAGE POLICIES, ON PURPOSE. Confirmed live Aug 12 2026: the storage
-- schema carries zero policies, so every upload and every read goes through the
-- Worker on the service key.
--
-- ⚠️ THIS IS THE ONE PLACE THE USUAL ADVICE IS WRONG FOR THIS PROJECT. A public
-- bucket with zero policies is still RLS-blocked for the browser, and the
-- obvious fix — "add an anon INSERT policy so uploads work" — would open an
-- anonymous write door into the private hr-files bucket. If a browser upload
-- needs to work, route it through the Worker instead.

-- Closes the transaction opened at the top. Nothing above this line is real
-- until it runs.
-- ⚠️ IT PAIRS WITH THE `begin;` ON LINE 44, which arrived on the same branch.
-- Dropping this while keeping that would leave the whole schema inside an
-- unterminated transaction — every object would look created and none would
-- survive the session.
commit;

-- ═══════════════════════════════════════════════════════════════
--  AFTER RUNNING THIS
-- ═══════════════════════════════════════════════════════════════
-- 1. Confirm by OUTPUT, not by "no errors". Run these three and read them:
--      select tablename, policyname, cmd from pg_policies
--        where schemaname in ('public','storage') order by tablename;
--      -- expect exactly two rows: kv_store/kv read/SELECT and
--      -- submissions/sub read/SELECT. Nothing for storage.
--      select proname, has_function_privilege('anon', oid, 'EXECUTE')
--        from pg_proc where proname in ('bump_counter','reset_counter');
--      -- expect false for both.
--      select id, public from storage.buckets order by id;
--      -- expect six rows, hub-assets true, the rest false.
--
-- 2. The Worker still needs its secrets set — this file only builds the
--    database. See NEW-STORE-SETUP.md for the full list, including the three
--    VAPID push secrets and the SESSION_KEY / RUN_JOB_KEY split.
--
-- ═══════════════════════════════════════════════════════════════
--  ✅ APPLIED AND PROVEN, BOTH PROJECTS, Aug 12 2026
-- ═══════════════════════════════════════════════════════════════
-- ⚠️ RE-MEASURED Aug 13 2026 WHILE MERGING THIS BRANCH, because the two sides
-- of the conflict disagreed: this one said all three were closed, main still
-- said they were open. Read straight out of pg_policies on the live Gate City
-- project rather than trusting either sentence. All three ARE denied:
--   `kv read`  denies gcfcr-hr-tokens-v1 and gcfcr-receipt-sends-v1
--   `sub read` denies class-survey (and onboarding-intake)
-- So main's paragraph was the stale one and is dropped.
-- Three read-side gaps were open when this file was corrected. All three are
-- now closed in the live Gate City project and were never present in Village:
--
--   gcfcr-hr-tokens-v1     — was on all three code lists, not denied live.
--   gcfcr-receipt-sends-v1 — was on both code lists and SEC_MUST_BE_DENIED,
--                            and HELD A REAL ROW since Aug 11. The only one of
--                            the three that was actually exposed.
--   class-survey           — was on SUB_PROTECTED in both code lists while the
--                            live policy denied onboarding-intake only.
--
-- ⚠️ PROVEN BY READING AS THE anon ROLE, NOT BY THE MIGRATION SAYING "success".
-- `set local role anon` inside Postgres is what the publishable key resolves
-- to, so it tests the policy rather than the plumbing. Gate City, against real
-- data: the canary returns 1, receipt-sends returns 0 with a row sitting in it,
-- and `select count(*) from submissions` returns 101 of 103 — exactly the two
-- onboarding-intake rows filtered and nothing else lost.
--
-- ⚠️ AN HTTP PROBE WOULD HAVE LIED HERE. The first attempt used curl with the
-- publishable key and every single read came back empty, including the ones
-- that are supposed to succeed — the agent proxy blocks *.supabase.co with a
-- 403 CONNECT. Read as "everything is denied", that is a perfect all-clear
-- produced by a connection that never happened. THE CANARY IS THE ONLY REASON
-- IT WAS CAUGHT. Never run this check without one.
--
-- ⚠️ A DENIED UPDATE OR DELETE IS NOT AN ERROR, PROVEN AGAIN. In Village the
-- anon INSERTs raised "violates row-level security policy", but the UPDATE and
-- DELETE raised nothing at all and simply affected zero rows. Check the DATA.
--
-- 🐛 THE SWEEP STILL CANNOT WARN EARLY, AND THAT IS UNFIXED. It reports EXPOSED
-- only when a read comes back with `rows > 0`, so an undenied key with no rows
-- tests clean. receipt-sends only started nagging because a row appeared;
-- tokens-v1 and class-survey would have stayed silent until the first token was
-- awarded and the first student submitted — the worst possible moment to find
-- out, and the exact opposite of this file's own rule that denying before data
-- lands is the right order. class-survey is worse still: SEC_MUST_BE_DENIED
-- holds only kv keys, so nothing tests the submissions tool filter at all,
-- ever. Closing the three keys did not fix the alarm that missed them.
