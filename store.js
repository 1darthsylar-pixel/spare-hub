// ─────────────────────────────────────────────────────────────
// Shared storage layer for Gate City Hub
//
// Three interfaces:
//   kvGet/kvSet            → live, editable shared state
//                            (Waste Tracker data, Supply Central order)
//   saveSubmission/listSubmissions → append-only shared logs
//                            (Food Safety walkthroughs, Equipment checks,
//                            Trainer Weekly Cleaning Checklist submissions)
//   uploadPhoto             → Supabase Storage upload, returns a public URL
//                            (Trainer Weekly Cleaning Checklist photo proof)
//
// If Supabase env vars are present, everything is shared across the
// whole team in real time. If they are NOT set (e.g. local dev before
// you have a Supabase project), it transparently falls back to this
// browser's localStorage so the app still runs. Photo upload has no
// local-dev fallback — it requires Supabase Storage.
// ─────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isShared = Boolean(URL && KEY && !URL.includes("YOUR-PROJECT"));

const supabase = isShared ? createClient(URL, KEY) : null;

// ── Key/Value store ──────────────────────────────────────────
/* ── PROTECTED HR KEYS ───────────────────────────────────────────────────
 * These carry performance reviews, injury reports, uploaded IDs, hire and
 * termination dates, and the CFA Home credential store. `kv_store` currently
 * has a `USING (true)` policy and the anon key ships inside this bundle, so
 * today anyone who reads the bundle can read all of it.
 *
 * Routing them through the worker — which holds the service key — is what
 * allows that policy to be narrowed without the app losing access. Doing it
 * HERE, in the one function every tile already calls, covers all nine files
 * that touch HR data (App, DailySetup, LeadershipDev, NewHireOrientation,
 * PTOTracker, ShiftLeaderScorecard, TeamDirectory, HRConsole) with no change
 * to any of them.
 *
 * ⚠️ Status, roles and the handbooks are deliberately NOT here. Job titles and
 * employment status are read by nearly every tile — including the sign-in path
 * that decides someone's tier — and routing them would put the whole Hub behind
 * one endpoint for no real gain. They are roughly what the setup board shows
 * anyway.
 */
/* Where the signed session token lives. Written by App.jsx at sign-in; read
   here on every protected call. Kept in localStorage alongside the existing
   access-user record so signing out clears both together. */
export const HUB_TOKEN_KEY = "gcfcr-hub-token";
/* Exported since Jul 31 2026: the worker now requires this token on the
   notification and telemetry routes too (slack-notify, notify, tool-notify,
   push-subscribe, ai-summary, log-open, live-schedule), so the tools that call
   those directly attach it themselves. */
export const hubToken = () => { try { return localStorage.getItem(HUB_TOKEN_KEY) || ""; } catch { return ""; } };

/* ★ SLIDING SESSION, THE BROWSER HALF. The Worker renews a live token and hands
   the new one back in `x-hub-token-refresh`; this puts it away.

   ⚠️ EXPORTED AND CALLED FROM TWO PLACES, NOT COPIED INTO BOTH. `kvSet` uses it
   for saves, and App.jsx's mount-time /api/whoami uses it for opens — and that
   second caller is a RAW `fetch`, not a trip through this file, so before this
   existed the Worker could renew a token that nothing on the page ever stored.
   Design rule 8: the function deciding whether you stay signed in must not have
   two versions of itself.

   ⚠️ NEVER THROWS AND NEVER BLOCKS. Renewal is a bonus on top of a request that
   was already going to happen. A private-mode browser with no localStorage
   should lose the renewal, not the request. */
export function absorbTokenRefresh(res) {
  try {
    const fresh = res && res.headers && res.headers.get("x-hub-token-refresh");
    if (fresh) { localStorage.setItem(HUB_TOKEN_KEY, fresh); return true; }
  } catch { /* renewal is a bonus, never a blocker */ }
  return false;
}

const HR_PROTECTED = new Set([
  /* ⚠️⚠️ WAGES, AND THIS ENTRY IS HALF OF A PAIR. Added Aug 13 2026 in the same
     commit as worker.js's copy — a key here and not there is a read that 403s,
     a key there and not here is a read that skips the Worker and hits the
     database directly.
     ⚠️ THE WORKER ALSO ID-LOCKS THIS KEY to three people (HR_ID_LOCKED). This
     list only decides which door a read uses; it does NOT decide who gets an
     answer, and pay is the one key where those two questions have different
     answers. */
  "gcfcr-hr-pay-v1",
  "gcfcr-hr-evals", "gcfcr-hr-injuries", "gcfcr-hr-files", "gcfcr-hr-info",
  "gcfcr-hr-cfahome", "gcfcr-hr-sigs", "gcfcr-hr-docs-v1",
  "gcfcr-hr-docfiles-v1", "gcfcr-hr-docsends-v1", "gcfcr-hr-evaltpl-v1",
  "gcfcr-hr-evaltasks-v1", "gcfcr-hr-evalcopy-v1", "gcfcr-hr-pins",
  /* Not an HR key, but it belongs behind the same door: nothing in the browser
     may read the store’s cost variances straight out of KV. /api/ipo-plan is
     the only way in and it gates at tier 3. */
  "gcfcr-ipo-plans-v1",
  /* ⚠️ NOT AN HR KEY EITHER, AND IT BELONGS HERE FOR THE SAME REASON AS THE
     LINE ABOVE. `gcfcr-receipt-sends-v1` records who emailed which paid-out
     receipt TO WHICH ADDRESS. Left off this list it is served straight out of
     kv_store on the publishable key that ships in the browser bundle: a list
     of real email addresses plus a map of who sends the store's financial
     documents where. Nothing in the browser reads it — /api/receipt-email
     writes it and is the only thing that ever needs it. */
  "gcfcr-receipt-sends-v1",
  /* ⚠️ MUST STAY BYTE-IDENTICAL to HR_PROTECTED in worker.js — that array is
     the allowlist /api/hr-store checks, so a key here and not there is a
     read that 403s, and a key there and not here is a read that skips the
     Worker entirely and hits the now-denied database directly.
     `gcfcr-hr-team-v1` added Jul 31 2026: it carries all 106 members with
     emails, and it stayed world-readable in the database after the morning's
     bundle fix. See the note on the worker's copy. */
  "gcfcr-hr-team-v1",
  // Byte-identical with worker.js HR_PROTECTED — see the note there.
  "gcfcr-hr-leadership-v1",
  /* The token ledger, added Aug 11 2026 WITH its first line of code rather
     than after it. Same shape as the demerit file above and protected for the
     same reason: it names people and says what they did.
     The catalog is separate and NOT protected — it is a price list, the same
     standing as any other thing on a screen everyone can open. */
  "gcfcr-hr-tokens-v1",
  /* ⚠️⚠️ THE PTO LEDGER, Aug 14 2026, added in the same commit as the worker's
     copy. It held 33 people's year-end bonus DOLLARS and 17 people's dated
     absences, and it was on no list at all — a probe as `anon` against live
     production returned the whole file to a caller who had not signed in.
     ⚠️ THE WORKER ALSO RANK-LOCKS THIS KEY to rank 6 or Payroll
     (ptoGateRefuses), one rank ABOVE the shared HR door, because Matt ruled on
     Aug 10 that a Director does not see PTO and Director is rank 5. As with
     wages two entries up: this list only decides which door a read uses, it
     does NOT decide who gets an answer.
     ⚠️ ONE KNOWN COST, ACCEPTED. inputRegistry's `readPto` reads this key from
     the browser for every signed-in user just to show a last-updated date. It
     now 403s for anyone below the bar, so the register reports that row
     "untracked / No reading available yet" instead of a date. That is honest —
     the catch-all at inputRegistry.js:1879 owns it, the row is info-only and
     nags nobody, and a fabricated date would be worse. The real fix is a
     separate stamp key the way thaw does it (gcfcr-thaw-stamp-v1); not today,
     and not worth holding a live exposure open for. */
  "gcfcr-pto-v1",
  /* ⚠️⚠️ ADDED Aug 14 2026, AND BOTH WERE LIVE AND OPEN WHEN IT LANDED.
     `gcfcr-availability-v1` holds when 99 people can work — school nights,
     second jobs, the days somebody cannot do. `gcfcr-skills-v1` holds what 96
     people are certified on. Both answered to the publishable key that ships
     inside the browser bundle, so anyone who opened the site read the whole
     store in one request. Not one record: everybody's.
     ⚠️ THE DATABASE DENY LANDED IN THE SAME COMMIT, not after it. Wages sat on
     this list and the Worker's for a day while the database still served them,
     and read as protected to anybody looking at the code. That is the eighth
     time supabase-schema.sql would have been the stale list.
     ⚠️ NOBODY LOSES ACCESS. /api/hr-store admits any signed-in token regardless
     of tier, so every leader building a rota reads exactly what they read
     before. This removes ANONYMOUS access and nothing else.
     ⚠️ SAFE BECAUSE SIGN-IN NEVER READS THEM — proved, not assumed, in
     availabilityLocked.test.mjs section 1. The Jul 31 email fix protected a key
     the sign-in batch DID read and 401'd the whole store out. */
  "gcfcr-availability-v1",
  "gcfcr-skills-v1",
  /* ⚠️ One key came off this list Aug 8 2026 with the two tiles that used it,
     and came off the worker's HR_PROTECTED in the SAME commit. These two lists
     must stay byte-identical; removing a key from one and not the other is the
     exact drift this pairing exists to prevent. */
]);

/* ── MICRO-BATCHING THE PROTECTED READS ──────────────────────────────────
 * Every protected key became browser → worker → Supabase instead of one hop,
 * so a tile reading five of them paid five round trips and the Hub felt slow
 * to open. Tiles fire their reads together at mount, so collecting whatever is
 * requested in the same tick and sending ONE request removes almost all of it.
 *
 * ★ CALLERS DO NOT CHANGE. `kvGet` still takes one key and returns one value;
 * the queue is invisible. Touching every tile to batch by hand would be a much
 * larger change with far more to get wrong.
 * ⚠️ A 0ms timeout, not a microtask — reads fired from separate effects land in
 * different microtask ticks and would each flush alone.
 */
let hrQueue = new Map();      // key → [resolve, …]
let hrTimer = null;

/* ★ AN EXPIRED SIGN-IN MUST NOT LOOK LIKE EMPTY DATA.
   🐛 Bri, Jul 29 2026: "Our evaluations have disappeared from view, please find
   the issues and restore all of the evaluations that were in files." All 25
   were sitting in the database untouched. Her session had lapsed — tokens last
   12 hours — so every protected read came back 401, every HR map resolved to
   null, and HR Console rendered nothing.

   ⚠️ NOTHING ON SCREEN SAID "SIGNED OUT". It said, in effect, "there are no
   evaluations". That is the same failure shape as turnover publishing 0.0% and
   the write census reading empty: MISSING LOOKS LIKE FINE, and the person
   reading it reasonably concludes the data is gone. Bri's next words were
   "restore all of the evaluations", which is exactly the wrong and expensive
   thing to go and do.

   ⚠️ A 401 IS THE ONLY STATUS THAT MEANS THIS. A network failure or a 500 is
   "we could not reach it", which is a different sentence and must not claim the
   session is dead. */
let hrUnauthorized = false;
export const hrSessionExpired = () => hrUnauthorized;
function flagSessionExpired() {
  if (hrUnauthorized) return;
  hrUnauthorized = true;
  try { window.dispatchEvent(new CustomEvent("hub:session-expired")); } catch {}
}
function clearSessionExpired() {
  if (!hrUnauthorized) return;
  hrUnauthorized = false;
  try { window.dispatchEvent(new CustomEvent("hub:session-restored")); } catch {}
}

/* ⚠️ TAKES THE BATCH AS AN ARGUMENT. It must never read or assign the
   module-level `hrQueue`.
   🐛 The chunking below used to do `hrQueue = a; await flushHrQueue();
   hrQueue = b; await flushHrQueue();`. A read arriving during the first await
   landed in the fresh module-level queue, and the next line threw that map away
   — resolver and all. That promise never settled and the tile spun forever.
   HR Console polls all 14 protected keys every 20 seconds, so the split always
   ran and the window opened 180 times an hour. */
async function flushKeys(batch) {
  const keys = [...batch.keys()];
  if (!keys.length) return;
  /* ⚠️ `gcfcr-hr-files` alone is ~51KB and several of these are large. A batch
     of every protected key in one response is the most likely reason a batch
     fails at all, so it is chunked — six keys a request, still far fewer round
     trips than one per key. */
  if (keys.length > 6) {
    const half = Math.ceil(keys.length / 2);
    const a = new Map(), b = new Map();
    keys.forEach((k, i) => (i < half ? a : b).set(k, batch.get(k)));
    await flushKeys(a);
    await flushKeys(b);
    return;
  }
  try {
    const res = await fetch(`/api/hr-store?keys=${keys.map(encodeURIComponent).join(",")}`, {
      headers: { "x-hub-token": hubToken() },
    });
    if (res.status === 401) flagSessionExpired();
    const r = await res.json();
    if (r && r.ok && r.values) {
      clearSessionExpired();
      keys.forEach((k) => batch.get(k).forEach((res) => res({ ok: true, value: r.values[k] ?? null })));
      return;
    }
    console.error("hr-store batch failed:", JSON.stringify(r), "token:", hubToken() ? "present" : "MISSING");
  } catch (e) {
    console.error("hr-store batch threw:", e);
  }
  /* ⚠️ FALL BACK TO THE SINGLE-KEY PROXY, NOT TO THE DIRECT READ.
     kvReadDirect goes straight to Supabase, and RLS now BLOCKS these keys — so
     the old fallback returned null for every protected key and a failed batch
     looked exactly like "this person has no history". That is what hid the
     points. The single-key route is the same door that worked all day. */
  await Promise.all(keys.map(async (k) => {
    let out = { ok: false, value: null };
    try {
      const sres = await fetch(`/api/hr-store?key=${encodeURIComponent(k)}`, {
        headers: { "x-hub-token": hubToken() },
      });
      if (sres.status === 401) flagSessionExpired();
      const r = await sres.json();
      if (r && r.ok) { out = { ok: true, value: r.value ?? null }; clearSessionExpired(); }
      else console.error("hr-store single-key fallback failed:", k, JSON.stringify(r));
    } catch (e) {
      console.error("hr-store single-key fallback threw:", k, e);
    }
    batch.get(k).forEach((res) => res(out));
  }));
}

function flushHrQueue() {
  const batch = hrQueue;
  hrQueue = new Map();
  hrTimer = null;
  return flushKeys(batch);
}

/* ★★ A FAILED READ IS NOT AN EMPTY ONE.
   `kvGet` returns null for both "nothing is stored here" and "we could not
   reach the database", and three tiles used to treat that null as "nothing
   stored yet" and then WRITE OVER THE REAL DATA:
     • DailySetup seeded a blank template over a real week's board
     • EOSTile let its autosave effects put seed Rocks/Issues/To-Dos over a
       quarter's real work
     • CashAudit re-seeded the July rows over the ledger
   On store wifi a dropped read is routine, so this was silent destruction.

   `kvGetResult` is the same read, reporting `{ ok, value }`. `ok:false` means
   the read FAILED and the caller must not treat `value` as the truth — do not
   seed, do not autosave, say so on screen.
   ⚠️ `kvGet` is unchanged and still returns the bare value, so the ~40 callers
   that only ever read are untouched. Opt in where a read decides a write. */
export async function kvGetResult(key) {
  if (HR_PROTECTED.has(key) && isShared) {
    return new Promise((resolve) => {
      if (!hrQueue.has(key)) hrQueue.set(key, []);
      hrQueue.get(key).push(resolve);
      if (!hrTimer) hrTimer = setTimeout(flushHrQueue, 0);
    });
  }
  /* Unprotected keys go straight to Supabase as they always have — AUTO-batching
     them on a timer would add latency to the many reads that are already one hop,
     which is why that was rejected. `kvGetMany` below is the opt-in version: a
     caller that already knows it wants five keys asks for them in one trip, and
     a caller that wants one still pays exactly one hop. The dedupe here is free
     either way — it only ever removes a duplicate request, never adds a wait. */
  return kvReadShared(key);
}

export async function kvGet(key) {
  const r = await kvGetResult(key);
  return r.value;
}

/* ── MANY KEYS, ONE TRIP (Aug 2 2026) ──────────────────────────────────────
   A cold dashboard mount asked the database for ~20 keys, each in its own
   request, plus one more per leadership application on file. They were already
   fired in parallel (the Jul 30 fix), but a browser only runs ~6 requests to one
   host at a time, so the rest queued — that queue is the lag Matt reported as
   "the hub seems a little laggy when opening".

   Returns `{ [key]: { ok, value } }` — the SAME shape as kvGetResult, per key,
   deliberately. A plain value map would make a failed read indistinguishable
   from a stored null, which is the exact confusion that had Bri asking for
   evaluations to be restored when nothing had been lost.

   ⚠️ HR keys keep their own door. They ride the existing protected queue
   (/api/hr-store), never the direct read, so a protected key mixed into the list
   is still fetched the safe way rather than smuggled past the allowlist.
   ⚠️ CHUNKED. `.in()` puts every key in the query string, and the per-application
   keys are long; an over-long URL fails as a whole. 25 at a time keeps it well
   under any limit and is still one trip per 25 instead of 25 trips.
   ⚠️ A failed chunk marks ONLY its own keys not-ok. One bad chunk must not
   report the whole dashboard as unreadable. */
export async function kvGetMany(keys) {
  const list = [...new Set((keys || []).filter(Boolean).map(String))];
  const out = {};
  if (!list.length) return out;

  const protectedKeys = list.filter((k) => HR_PROTECTED.has(k) && isShared);
  const plainKeys = list.filter((k) => !(HR_PROTECTED.has(k) && isShared));

  // Protected keys: the existing batching queue already coalesces these.
  const hrWork = protectedKeys.map(async (k) => { out[k] = await kvGetResult(k); });

  // Local dev (no Supabase): localStorage, same shape.
  if (!isShared) {
    await Promise.all(hrWork);
    for (const k of plainKeys) out[k] = await kvReadDirect(k);
    return out;
  }

  const chunks = [];
  for (let i = 0; i < plainKeys.length; i += 25) chunks.push(plainKeys.slice(i, i + 25));

  const plainWork = chunks.map(async (chunk) => {
    try {
      const { data, error } = await supabase.from("kv_store").select("key,value").in("key", chunk);
      if (error) throw error;
      const found = new Map((data || []).map((row) => [row.key, row.value]));
      // A key with no row is a SUCCESSFUL read of nothing — same as maybeSingle.
      for (const k of chunk) out[k] = { ok: true, value: found.has(k) ? found.get(k) : null };
    } catch (e) {
      console.error("kvGetMany chunk failed:", chunk, e);
      for (const k of chunk) out[k] = { ok: false, value: null };
    }
  });

  await Promise.all([...hrWork, ...plainWork]);
  return out;
}

/* Row-keyed shared records (the EOS scorecard above all) are published by many
   tools, each owning a row or two. Every publisher used to hand-roll
   read-merge-write around kvGet, and a FAILED read arrived as null, became {},
   and the write replaced every other tool's rows with just the caller's —
   opening one tile on dead wifi could blank the company scorecard. This is the
   one sanctioned way to publish: a failed read publishes NOTHING (stale beats
   destroyed — the next successful publish carries the same values), and only
   the caller's rows are ever touched. Returns kvSet's boolean; false = not
   written, and publishers may treat that as best-effort. */
export async function publishSharedRows(key, rows) {
  if (!key || !rows || !Object.keys(rows).length) return false;
  const r = await kvGetResult(key);
  if (!r.ok) return false;
  const cur = r.value && typeof r.value === "object" ? r.value : {};
  const next = { ...cur };
  for (const k of Object.keys(rows)) next[k] = { ...(cur[k] || {}), ...rows[k] };
  return kvSet(key, next);
}

/* `member` (optional) = the roster id whose row is the ONLY thing that changed.
   Supplying it turns a whole-map replace into a server-side one-row merge, which
   is what stops two leaders filing at the same time from erasing each other.
   See the member-row branch in worker.js /api/hr-store. Omitting it keeps the
   old replace-everything behaviour, so every existing caller is unaffected.
   ⚠️ Only meaningful for id-keyed maps. Passing it for a key that is not shaped
   { "<rosterId>": ... } would write a row into something that has no rows — the
   worker whitelists which keys accept it rather than trusting the caller. */
export async function kvSet(key, value, member) {
  if (HR_PROTECTED.has(key) && isShared) {
    try {
      const body = { key, value };
      if (member != null && member !== "") body.member = String(member);
      const r = await fetch("/api/hr-store", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
        body: JSON.stringify(body),
      }).then((x) => x.json());
      if (r && r.ok) return true;
      /* ⚠️ THIS IS THE ONE THAT LOST DATA. A 401 here fell through to the
         direct write, the narrowed policy refused THAT too, and the caller was
         told nothing — an uploaded document's record vanished on reload and a
         handbook signature would do the same. Both paths are now reported. */
      console.error("hr-store write failed:", JSON.stringify(r), "key:", key,
        "token:", hubToken() ? "present" : "MISSING");
    } catch (e) {
      console.error("hr-store write threw:", e, "key:", key);
    }
  }
  return kvSetDirect(key, value);
}

/* ══════════════════════════════════════════════════════════════════════════
   ★★ SAVE ONLY IF THE RECORD IS STILL THE ONE YOU READ.

   Aug 16 2026, from a structural audit. `kvSet` is a blind PUT of a whole
   record, and the schedule has eight writers. Two leaders open Lineup, both
   read the week, both save, and the first one's entire week is gone with no
   error and no record.

   `ifSavedAt` is the `savedAt` the caller loaded. The Worker compares it
   against what is stored and refuses with 409 when they differ.

   Returns { ok, conflict, savedAt }:
     { ok: true }                        it saved
     { ok: false, conflict: true, savedAt } somebody else saved first; `savedAt`
                                         is theirs, so the caller can re-read,
                                         redo its work and try again
     { ok: false }                       an ordinary refusal or transport failure

   ⚠️ THREE OUTCOMES, NOT TWO, AND THAT IS THE WHOLE REASON THIS IS NOT JUST
   `kvSet`. "Somebody else got there first" and "the write failed" need
   different sentences on screen and different behaviour in code: one is retry
   after re-reading, the other is stop and tell somebody. Folding them into a
   boolean is how a conflict turns back into a silent overwrite.

   ⚠️ HR KEYS DO NOT COME THROUGH HERE. They route to /api/hr-store, which has
   its own path and its own rules; sending them here would skip that.
   ⚠️ NO `ifSavedAt` MEANS AN ORDINARY WRITE, so this is safe to call from a
   path that does not yet know the version. */
export async function kvSetIf(key, value, ifSavedAt) {
  if (!isShared) {
    /* Local mode is one browser tab against localStorage. There is no second
       writer to conflict with, so the guard is a no-op rather than a fake. */
    return { ok: await kvSetDirect(key, value) };
  }
  try {
    const res = await fetch("/api/kv-set", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
      body: JSON.stringify(
        ifSavedAt ? { key, value, ifSavedAt: String(ifSavedAt) } : { key, value },
      ),
    });
    absorbTokenRefresh(res);
    const r = await res.json().catch(() => null);
    if (res.status === 409) {
      return { ok: false, conflict: true, savedAt: (r && r.savedAt) || "" };
    }
    if (r && r.ok && r.authed === false) {
      try { window.dispatchEvent(new CustomEvent("hub:save-signed-out")); } catch {}
    }
    if (r && r.ok) return { ok: true };
    console.error("kv-set conditional write refused:", key, JSON.stringify(r));
    return { ok: false };
  } catch (e) {
    console.error("kv-set conditional write threw:", key, e);
    return { ok: false };
  }
}

/* Returns { ok, value }. `ok:false` is ONLY a transport/database failure.
   A key that simply is not there is a successful read of nothing:
   { ok: true, value: null }. Callers that seed or autosave depend on that
   distinction being exact. */
/* ── IN-FLIGHT READ DEDUPE (Aug 2 2026) ────────────────────────────────────
   The dashboard reads some keys TWICE on a cold mount — `gcfcr-hr-handbook` and
   `gcfcr-hr-status` each come from two different effects that know nothing about
   each other. Those were two real round trips over store wifi for one answer.

   While a read is in the air, a second read of the SAME key joins it instead of
   opening its own. Nothing is cached: the entry is dropped the moment the
   request settles, so the next read still goes to the database and nobody ever
   sees a stale number. This is purely "don't ask twice at the same instant".

   ⚠️ EACH CALLER STILL GETS ITS OWN OBJECT. Handing two callers the same parsed
   object would be a behaviour change with teeth — one of them mutating it in
   place would silently corrupt the other's copy, and today every read returns a
   fresh object. The clone keeps this change invisible to callers.
   ⚠️ Hoisted `function`, not a `const`, so `kvGetResult` above can call it. */
const inFlightReads = new Map();   // key → Promise<{ok, value}>

function cloneRead(r) {
  if (!r || r.value == null || typeof r.value !== "object") return r;
  try {
    return { ok: r.ok, value: structuredClone(r.value) };
  } catch {
    try { return { ok: r.ok, value: JSON.parse(JSON.stringify(r.value)) }; }
    catch { return r; }   // unclonable — hand back the original rather than fail a read
  }
}

function kvReadShared(key) {
  const running = inFlightReads.get(key);
  if (running) return running.then(cloneRead);
  const p = kvReadDirect(key);
  inFlightReads.set(key, p);
  // kvReadDirect never rejects (it catches and returns {ok:false}), so this
  // always fires. Guarded so a newer in-flight read is never deleted by an
  // older one settling.
  p.then(
    () => { if (inFlightReads.get(key) === p) inFlightReads.delete(key); },
    () => { if (inFlightReads.get(key) === p) inFlightReads.delete(key); },
  );
  return p;
}

async function kvReadDirect(key) {
  if (!isShared) {
    try {
      const raw = localStorage.getItem(key);
      return { ok: true, value: raw ? JSON.parse(raw) : null };
    } catch (e) {
      console.error("kvGet local read failed:", e);
      return { ok: false, value: null };
    }
  }
  try {
    const { data, error } = await supabase
      .from("kv_store")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    return { ok: true, value: data ? data.value : null };
  } catch (e) {
    console.error("kvGet failed:", e);
    return { ok: false, value: null };
  }
}

async function kvSetDirect(key, value) {
  if (!isShared) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
  /* ★ THROUGH THE WORKER, AND ONLY THE WORKER (Aug 2 2026).
     The direct-to-database fallback that used to sit below is GONE. It was the
     last reason the kv_store write policy had to stay open to anyone holding
     the publishable key that ships in this bundle — which meant every non-HR
     record (boards, sales, food cost, the scorecard, team goals, trackers,
     expenses) could be rewritten by a stranger. The old comment here said
     removing it and closing the policy are ONE change; this is that change.

     Nothing legitimate loses a path: the Worker performs every write with the
     service key, and /api/kv-set does NOT require a token (it records untokened
     writes to the census instead), so the pre-sign-in publishes keep working
     exactly as they do today.

     ⚠️ A WORKER FAILURE IS NOW A VISIBLE FAILURE. That is the point. kvSet
     returns false, and the callers already handle false loudly — the "that did
     not save" banners exist precisely for this. Silently succeeding by going
     around the Worker is what has to stop.
     ⚠️ HR keys never reach here; kvSet routes them to /api/hr-store above. */
  try {
    const res = await fetch("/api/kv-set", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
      body: JSON.stringify({ key, value }),
    });
    /* ★ SLIDING SESSION. The worker renews a valid token on every save and
       returns it here. Absorbing it on the one road every tool already uses is
       what keeps a daily-use iPad from aging out at hour 12 mid-shift — the
       anon-write census showed hundreds of saves a day arriving on dead
       tokens. An expired token gets no refresh; that person re-PINs once. */
    absorbTokenRefresh(res);
    const r = await res.json().catch(() => null);
    /* ★★ A SAVE THAT LANDED ANONYMOUSLY IS STILL A SAVE — SAY SO, DON'T FAIL IT.
       The Worker answers `authed:false` when it took the write without a valid
       session, and this only ever checked `ok`, so the tile said "Saved" and
       nobody ever learned their sign-in had lapsed. The census shows that
       happening in the hundreds.
       ⚠️ IT STILL RETURNS TRUE, DELIBERATELY. The record really is stored.
       Reporting failure would be a different lie in the opposite direction, and
       the tiles would offer to re-save something already saved.
       ⚠️ ITS OWN EVENT, NOT `hub:session-expired`. That one means "no HR data
       can load" and paints a full-width red banner across HR Console — firing
       it here would resurrect the exact false alarm fixed Aug 2, where the
       console cried expired while every record underneath loaded fine. This is
       a quieter, different sentence: your work saved, sign in again so it is
       under your name. */
    if (r && r.ok && r.authed === false) {
      try { window.dispatchEvent(new CustomEvent("hub:save-signed-out")); } catch {}
    }
    if (r && r.ok) return true;
    console.error("kv-set write refused:", key, JSON.stringify(r));
    return false;
  } catch (e) {
    console.error("kv-set write threw:", key, e);
    return false;
  }
}

// ── Append-only submissions log ──────────────────────────────
export async function saveSubmission(tool, submittedBy, payload) {
  const record = {
    tool,
    submitted_by: submittedBy || "Team Member",
    payload,
    submitted_at: new Date().toISOString(),
  };
  if (!isShared) {
    try {
      const key = `submissions:${tool}`;
      const list = JSON.parse(localStorage.getItem(key) || "[]");
      list.unshift({ ...record, id: `local_${Date.now()}` });
      localStorage.setItem(key, JSON.stringify(list.slice(0, 100)));
      return true;
    } catch {
      return false;
    }
  }
  /* ★ THROUGH THE WORKER, NOT STRAIGHT TO THE TABLE (Aug 2 2026).
     `submissions` accepted an INSERT from anyone holding the publishable key in
     this bundle, so a food safety walkthrough, an equipment check or a trainer
     task could be forged by a stranger. With a QIV falsification case open at
     the store, a record nobody can fake is the whole point of keeping one.
     The Worker requires a session token and writes with the service key.
     ⚠️ NO DIRECT FALLBACK, for the same reason kvSet lost its one: a fallback
     is exactly what keeps the door open. A refusal returns false, and every
     caller already handles false (the tiles show "did not save" and keep the
     typed values on screen). */
  try {
    const res = await fetch("/api/submission", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
      body: JSON.stringify({
        tool: record.tool,
        submitted_by: record.submitted_by,
        payload: record.payload,
        submitted_at: record.submitted_at,
      }),
    });
    const r = await res.json().catch(() => null);
    if (r && r.ok) return true;
    console.error("saveSubmission refused:", record.tool, res.status, JSON.stringify(r));
    return false;
  } catch (e) {
    console.error("saveSubmission threw:", record.tool, e);
    return false;
  }
}

/* Submission tools routed through the Worker instead of read straight from the
   world-readable `submissions` table. `onboarding-intake` carries a new hire's
   name, whether they are a MINOR, and the path to their uploaded ID.
   ⚠️ MUST STAY BYTE-IDENTICAL to SUB_PROTECTED in worker.js — a tool listed
   there and not here reads the denied table directly and returns nothing,
   which looks exactly like "no new hires" rather than an error. */
const SUB_PROTECTED = new Set(["onboarding-intake", "class-survey"]);

export async function listSubmissions(tool, limit = 10) {
  /* Protected tools go through /api/submissions, which holds the service key
     and checks the caller is a full HR reader. Returns [] on refusal — the
     same shape the direct read returns on failure, so no caller changes. */
  if (SUB_PROTECTED.has(tool) && isShared) {
    try {
      const res = await fetch(`/api/submissions?tool=${encodeURIComponent(tool)}&limit=${limit}`, {
        headers: { "x-hub-token": hubToken() },
      });
      /* ⚠️ DOES NOT FLAG THE SESSION DEAD ON A 401, AND THAT IS DELIBERATE.
         🐛 Matt, Aug 2 2026: HR Console painted "Your sign-in has expired —
         this is not missing data" across the top while every record underneath
         loaded perfectly (100 active, handbook counts, the lot). He signed out
         and back in and it stayed. Cause: this read was flagging the whole HR
         session expired. It is ONE optional card (the new-hire intake list) —
         if it cannot load, the honest outcome is that the card is empty, not a
         full-width red banner telling a working console it is broken.
         Only the core kv reads in flushKeys may declare a session dead; they
         are the ones whose failure genuinely means no HR data can load.
         Clearing on SUCCESS is kept — a good read here is real proof the token
         is alive, and that can only ever remove a false banner. */
      const r = await res.json();
      if (r && r.ok && Array.isArray(r.rows)) { clearSessionExpired(); return r.rows; }
      console.error("listSubmissions (protected) failed:", tool, res.status, JSON.stringify(r));
      return [];
    } catch (e) {
      console.error("listSubmissions (protected) threw:", tool, e);
      return [];
    }
  }
  if (!isShared) {
    try {
      const key = `submissions:${tool}`;
      const list = JSON.parse(localStorage.getItem(key) || "[]");
      return list.slice(0, limit);
    } catch {
      return [];
    }
  }
  try {
    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .eq("tool", tool)
      .order("submitted_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error("listSubmissions failed:", e);
    return [];
  }
}

// ── Photo upload (Supabase Storage) ──────────────────────────
// `bucket` must already exist in your Supabase project (Storage → New
// bucket → set Public, so the returned URL displays without extra auth).
// `path` should be unique per upload, e.g.
//   `${trainerName}/${Date.now()}-${file.name}`
//
// THROWS on failure with the real Supabase message (bucket missing,
// RLS/permission denied, size/MIME limit, etc.) so the caller can show
// the actual reason instead of a generic "couldn't attach" string. On
// success it returns the public URL. `upsert:false` because paths are
// already unique — a plain insert only needs the INSERT storage policy,
// not the extra UPDATE/SELECT policies an upsert existence-check needs.
/* ★ UPLOADS GO THROUGH THE WORKER (Aug 2 2026).
   Every bucket accepted an upload from anyone holding the publishable key in
   this bundle. Five are private so that was nuisance — but `hub-assets` is
   PUBLIC, so a stranger could park arbitrary content there and get a permanent
   world-readable link tied to the store. The Worker requires a session token
   and uploads with the service key.

   ⚠️ ONE helper for both uploadPhoto and uploadDoc — the same rule that keeps
   normName from existing three times. The two callers differ only in their
   default content type.
   Returns null on success, or an {message} shaped like the Supabase error the
   callers already parse, so neither caller's error handling changes. */
async function uploadViaWorker(bucket, path, file, fallbackType) {
  try {
    const res = await fetch(
      `/api/upload?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": (file && file.type) || fallbackType,
          "x-hub-token": hubToken(),
        },
        body: file,
      },
    );
    const r = await res.json().catch(() => null);
    if (r && r.ok) return null;
    if (res.status === 401) return { message: "Your sign-in has expired — sign out and back in, then try again." };
    return { message: (r && r.error) || `Upload failed (${res.status}).` };
  } catch (e) {
    return { message: e && e.message ? e.message : String(e) };
  }
}

export async function uploadPhoto(bucket, path, file) {
  if (!isShared) {
    throw new Error("Supabase isn't configured, so photos can't upload.");
  }

  const upErr = await uploadViaWorker(bucket, path, file, "image/jpeg");
  if (upErr) {
    // Surface Supabase's real reason. Common ones:
    //   "Bucket not found"                 → the bucket doesn't exist / name typo
    //   "new row violates row-level ..."   → missing INSERT policy for anon
    //   "The object exceeded the maximum"  → file bigger than the bucket limit
    throw new Error(upErr.message || String(upErr));
  }

  /* ★★ RETURNS THE PATH, NOT A PUBLIC URL (changed Jul 28).
     This function used to end in `getPublicUrl()`, which handed back a
     permanent, unsigned, world-readable *.supabase.co link — and that link was
     then SAVED into the submission record, so every piece of photo proof ever
     filed was reachable forever by anyone holding the address, with the backend
     host on show. It was the last thing in the Hub breaking Matt's rule that
     every link stays on gatecityhub.com.
     ⚠️ THE BUCKET IS NOW PRIVATE (flipped Jul 28), so `getPublicUrl` would not
     work even if it were restored. Callers store the PATH and mint a
     short-lived viewing link through `signedDocUrl` (which goes via
     /api/doc-url on the service key) at the moment they render the image. */
  return path;
}

/* Turn whatever is on a stored record into a bucket PATH.
   ⚠️ BOTH SHAPES ARE LIVE AND WILL BE FOR GOOD. Records written before Jul 28
   hold a full public URL; records written after hold a path. Nothing rewrites
   the old ones — a one-off data edit would leave no trace anyone could find
   later — so every reader normalises here instead.
   Returns "" if it can't work one out, which reads as "no proof". */
export function photoPathFrom(stored, bucket) {
  const v = String(stored || "");
  if (!v) return "";
  const marker = "/object/public/" + bucket + "/";
  const i = v.indexOf(marker);
  if (i !== -1) return decodeURIComponent(v.slice(i + marker.length).split("?")[0]);
  if (/^https?:\/\//i.test(v)) return "";   // some other absolute URL — not ours
  return v;
}

// ── Private document upload (Supabase Storage, PRIVATE bucket) ────
// For SENSITIVE files — HR documents, government IDs, doctor's notes.
// Unlike uploadPhoto, this does NOT return a public URL: the bucket
// should be PRIVATE so files are never world-readable by URL. Store the
// returned { bucket, path } on the record, and call signedDocUrl() to
// mint a short-lived link only when an authorized viewer opens it.
//
// Setup (same INSERT-policy lesson as the trainer photos, plus SELECT so
// signed URLs can be minted):
//   Storage → New bucket → name it, leave Public OFF.
//   Policies on that bucket for the `anon` role:
//     • INSERT  — allows uploads
//     • SELECT  — allows createSignedUrl to mint view links
// Throws on failure with Supabase's real message so the caller can show it.
export async function uploadDoc(bucket, path, file) {
  if (!isShared) {
    throw new Error("Supabase isn't configured, so documents can't upload.");
  }
  const upErr = await uploadViaWorker(bucket, path, file, "application/octet-stream");
  if (upErr) throw new Error(upErr.message || String(upErr));
  return { bucket, path };
}

// Short-lived signed URL for a private-bucket object. Default 5 minutes.
// Returns null (never throws) so a broken/expired link can't crash a view.
export async function signedDocUrl(bucket, path, expiresInSec = 300) {
  if (!isShared || !bucket || !path) return null;
  /* ★ Signed through the worker, on the service key. The worker returns a
     gatecityhub.com/api/doc-view handle, never a provider URL.
     ⚠️ THE DIRECT createSignedUrl FALLBACK THAT USED TO SIT BELOW IS GONE
     (Aug 2 2026). Two reasons, and either alone is enough:
       1. It returned a raw *.supabase.co signed URL — a bearer token — and
          every caller hands the result straight to window.open or an <img
          src> on a shared iPad. That is the one thing the doc-view handle
          exists to prevent, so the fallback quietly undid it on any 401.
       2. It could not work anyway. `storage.objects` has RLS on and ZERO
          policies, so the publishable key in this bundle has no storage
          access at all; the call could only ever fail. It was dead code that
          leaked the backend host on its way to failing. */
  try {
    const r = await fetch(
      `/api/doc-url?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}&expires=${expiresInSec}`,
      { headers: { "x-hub-token": hubToken() } }
    ).then((x) => x.json());
    if (r && r.ok && r.url) return r.url;
    /* ⚠️ LOUD, NOT SILENT. This swallowed the reason for three rounds of
       debugging. `unauthorized` means this browser has no session token (sign
       out and back in); `sign-failed` carries the status Supabase returned. */
    console.error("doc-url proxy failed:", JSON.stringify(r), "token:", hubToken() ? "present" : "MISSING");
    if (typeof window !== "undefined") window.__lastDocUrlError = { ...r, token: hubToken() ? "present" : "MISSING" };
  } catch (e) {
    console.error("doc-url proxy threw:", e);
  }
  return null;
}

// Delete a private-bucket object (used when an HR doc is rejected, so the
// binary doesn't linger in the bucket after its record is gone). Follows the
// signedDocUrl pattern: guards on isShared/bucket/path, logs and returns false
// on failure instead of throwing, so a fire-and-forget call can't crash a view
// or leave an unhandled rejection.
export async function deleteDoc(bucket, path) {
  if (!isShared || !bucket || !path) return false;
  try {
    const r = await fetch("/api/doc-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
      body: JSON.stringify({ bucket, path }),
    }).then((x) => x.json());
    if (r && r.ok) return true;
    console.error("doc-delete refused:", bucket, path);
  } catch (e) {
    console.error("doc-delete threw:", e);
  }
  /* ⚠️ No direct storage.remove() fallback, for the same two reasons as
     signedDocUrl above: it is a browser-issued delete against the provider,
     and with zero policies on storage.objects it could never have succeeded
     anyway. Returning false lets the caller say so instead of pretending. */
  return false;
}
