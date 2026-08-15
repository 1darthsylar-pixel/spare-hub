import React, { useState, useEffect, useRef, useMemo } from "react";
/* The shared raised look and accent edge — see cardStyle.js. */
import { importZone, CARD_3D, CARD_3D_SOFT, cardSurface, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { effectiveRole } from "./accessOverrides.js";
/* Bri's Spanish on evaluations. ⚠️ THE WALKER IS THE LEAF'S — it decides what
   is authored and therefore translatable, and what a leader typed and therefore
   must never be touched. A second opinion on that line would eventually put a
   translated sentence in somebody's personnel file. */
import { collectEvalStrings, applyEvalStrings } from "./courseTranslate.js";
import { hrInConsole, hrNormPerson, HR_ASSIGNABLE_LADDER, hrDisplayName } from "./hrRoster.js";
import { kvGet, kvSet, kvGetResult, publishSharedRows, uploadDoc, signedDocUrl, deleteDoc, listSubmissions, HUB_TOKEN_KEY, hrSessionExpired } from "./store.js";
// ONE definition of "is this request mine", shared with the page this banner
// links to. Verified no import cycle — ProfessionalGrowth imports only React
// and store.js.
// ★ FROM THE LEAF MODULE, NOT FROM ProfessionalGrowth. Importing it from there
// made HRConsole → ProfessionalGrowth, and once that page needed to open the
// class the graph closed into a cycle. See nameMatch.js.
import { recMatches, normName } from "./nameMatch.js";
import { DUTIES as LDR_DUTIES, dutyById as ldrDutyById, makeEntry as makeLdrEntry, standing as ldrStanding, stages as ldrStages, CONFIG as LDR_CONFIG, pendingEntries as ldrPending } from "./demerits.js";
import { eosPeriod } from "./eosPeriod.js";
/* ★ THE RANK LADDER NOW HAS ONE HOME (Jul 28 2026).
   `worker.js` needs the same title→rank map to decide who may read everyone's
   HR records, and it cannot import a .jsx. So the map moved to `hrRoster.js`,
   a leaf module that imports nothing, sitting beside worker.js at the repo
   root — the same shape as nameMatch.js, and for the same reason.
   ⚠️ Until now this map existed TWICE, in this file and in the worker. Two
   copies of "who counts as a director" is exactly the drift Matt's own rule
   warns about: when two sources can disagree about one fact, delete one.
   It is still re-exported below as HR_RANK, so App.jsx, DailySetup,
   PTOTracker and ShiftLeaderScorecard keep importing it from here unchanged. */
import { HR_RANK_BY_TITLE as RANK } from "./hrRoster.js";
/* The roster seed, the live-roster loaders, the default PIN and the handbook
   exemption moved to hrTeam.js (Jul 31 2026) so the dashboard can read them
   without importing this whole file — that import alone kept HR Console out
   of lazy loading and inside the first-paint bundle. Everything is re-exported
   below unchanged, so the seven other tiles that import from here still work. */
import { TEAM, RAW_TEAM, HR_DEFAULT_PIN as PIN, isHbExempt, loadHRTeam, loadHRTeamResult, ROSTER_ADD_KEY, rosterRowsMissingFromStorage } from "./hrTeam.js";
import TeamImportBox from "./TeamImportBox.jsx";
/* ★ WAGES. Its own file so this one keeps a one-line footprint — HRConsole is
   5,000 lines and more than one session edits it. The component renders NOTHING
   for anybody outside owners.payAccess, and the Worker refuses the key on the
   server as well (HR_ID_LOCKED), so the gate here is the second lock. */
import PayRates from "./PayRates.jsx";
/* ★ Emails, phones and hire dates, from either staff export. Own file, one-line
   hook, same reason as PayRates above. It writes per person and per field into
   `gcfcr-hr-info`, which is live for ~106 people. */
import TeamDetails from "./TeamDetails.jsx";
import { STORE, storeCfg } from "./storeConfig.js"; // turnover + eval goals, masthead, doc host

/* ★ THE DEPTH BITS FOR A CONSOLE TILE, IN ONE PLACE (Matt, Aug 4 2026: "the hr
   console still lacks depth in the tiles", then "same look").
   The HR Console landing is fourteen tiles — the menu buttons, the purple
   launchers and the roster cards — and every one was a flat panel with a
   hairline border while the rest of the Hub had moved to the raised look. The
   style sat inline on each button, so "the tiles" was really fourteen separate
   edits waiting to drift apart.

   ⚠️ MODULE LEVEL, and it returns ONLY the three depth properties. Each tile
   keeps its own background, padding and border, because they genuinely differ:
   the launchers are purple, three tiles turn amber when something is waiting,
   and Approved Drivers turns red when a licence has expired. Spread this LAST
   so the tile's own colours stand and this only adds the lift.

   ⚠️ `tone` is the tile's STATUS colour, not decoration. cardStyle's rule is
   that a red metric gets a red edge, so a tile with work waiting carries the
   amber strip and an expired licence carries the red one. The strip then says
   the same thing the text inside it says. */
function tileDepth(tone) {
  return { backgroundImage: cardSurface(tone, 0.5), ...accentEdge(tone, 3), boxShadow: CARD_3D };
}
const TILE_WAIT = "#B4832B";   // amber — something is queued for you
const TILE_STOP = "#DD0031";   // red — an expiry that stops someone driving
const TILE_LAUNCH = "#6D28D9"; // the purple already on the launcher arrows

/* ⚠️ TODAY IN THE STORE'S OWN DAY, NOT UTC.
   `new Date().toISOString().slice(0,10)` is the UTC date. Eastern is UTC-4, so
   from 8pm every evening UTC has already rolled over and that string is
   TOMORROW. Matt works until 8pm, so this was not an edge case — it was every
   night. It made a licence read expired a day early, stamped a rock with
   tomorrow so its card said "-1d ago", and made a same-day check fail. */
const todayLocal = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* ============================================================================
   STORAGE ADAPTER — wired to the Hub's store.js (Supabase kv_store, same
   localStorage fallback the rest of the Hub uses). Keys namespaced "gcfcr-hr-*".
   kvGet/kvSet already handle JSON on both paths, so these just delegate.
   loadAll() fans kvGet across the HR keys to drive the 20s live poll.
   ============================================================================ */
const HR_KEYS = ["gcfcr-hr-status", "gcfcr-hr-pins", "gcfcr-hr-info", "gcfcr-hr-files", "gcfcr-hr-evals", "gcfcr-hr-injuries", "gcfcr-hr-handbook", "gcfcr-hr-ldrhandbook", "gcfcr-hr-roles", "gcfcr-hr-sigs", "gcfcr-hr-evaltpl-v1", "gcfcr-hr-added-v1", "gcfcr-hr-docfiles-v1", "gcfcr-hr-evaltasks-v1", "gcfcr-hr-leadership-v1"];

/* ── THE ROSTER, AND WHY IT'S TWO PIECES ──────────────────────────
   RAW_TEAM below is a hardcoded array with no add path. Until now that was the
   whole roster, exported as HR_TEAM and imported by App.jsx for Hub-wide PIN
   login — which meant HR Console could not onboard anyone. Team Documentation
   COULD add people (gcfcr-hr-team-v1), but HR Console never read that key, so a
   new hire existed in one tool and had no file, no PIN and no handbook row in
   the other. Cutting the Team Docs tile before fixing this would have made
   hiring impossible.

   SHAPE: seed + additions, never a replaced array.
     RAW_TEAM              — the original 106, still a module const
     gcfcr-hr-added-v1     — [{id,name,role,email,addedAt,addedBy}] appended
   Everything else about a person is ALREADY an overlay keyed by id
   (gcfcr-hr-roles / -info / -status / -pins), so an added member needs no
   special-casing anywhere: give them an id and the whole console works on them.

   Their ids are prefixed `n_` so they can never collide with the numeric seed
   ids, and — deliberately — so `reseedRoster`-style "restore the seed" logic
   can never mistake an added person for a stale one and delete them. That exact
   mistake orphaned two evaluations in Team Docs earlier today.

   WHY loadHRTeam() EXISTS: HR_TEAM has to stay a static export or every
   importer breaks at module load. So the static export stays (it's the seed),
   and consumers that need the LIVE roster call this instead. App.jsx's PIN
   login does — both of its lookups were already inside async functions, so it's
   an await, not a rewrite. */
const TEAMDOCS_ROSTER_KEY = "gcfcr-hr-team-v1"; // Team Docs' roster — read ONCE, by the import panel
/* ── PINS ARE SERVER-SIDE NOW ────────────────────────────────────────────
 * This tile used to `usePersisted("gcfcr-hr-pins")`, which pulled all 106
 * four-digit PINs into every browser that opened it — and `kv_store` carries a
 * `USING (true)` policy with the anon key shipped in the bundle, so that map
 * was readable by anyone who looked. Every comparison and every write now goes
 * through the worker, which holds the service key.
 *
 * ★ THE ONLY THING THE UI EVER NEEDED WAS *WHO* HAS A PIN, NEVER *WHAT* IT IS.
 * `readPinSet` throws the values away inside the one function that touches the
 * key, so a later edit cannot leak the map into a prop by accident.
 */
const hubToken = () => { try { return localStorage.getItem(HUB_TOKEN_KEY) || ""; } catch { return ""; } };

async function readPinSet() {
  try {
    const raw = await kvGet("gcfcr-hr-pins");
    const out = {};
    Object.keys(raw && typeof raw === "object" ? raw : {}).forEach((id) => { out[id] = true; });
    return out;
  } catch { return {}; }
}


/* ★ PURE, AT MODULE LEVEL, so it can be checked without React. Given the roster
   and the blocked map, who on this roster is not receiving.
   ⚠️ MATCHES ON THE ADDRESS, LOWERCASED, and on nothing else. Two people called
   Ashley is a real shape here and name matching has bitten this repo before —
   an address is the only thing the mail system and the roster both agree on.
   ⚠️ A null MAP MEANS "COULD NOT CHECK" AND MUST PRODUCE NOTHING, never an
   empty list. An empty list renders as "everyone is fine", which is the exact
   false all-clear that hid a blocked address for eight days. */
export function blockedRoster(team, emailOf, map) {
  if (!map || typeof map !== "object") return null;
  const rows = [];
  for (const m of Array.isArray(team) ? team : []) {
    const e = String((emailOf && emailOf(m)) || "").trim().toLowerCase();
    if (!e) continue;
    const hit = map[e];
    if (hit) rows.push({ id: m.id, name: m.name, email: e, since: String(hit.since || ""), origin: String(hit.origin || "") });
  }
  return rows.sort((a, b) => String(a.since).localeCompare(String(b.since)));
}

/* Verify a PIN. Returns the roster id or null. The rate limit and the
   terminated filter live in the worker, so every call site gets them free. */
/* ★ `expectedId` IS SENT TO THE SERVER, NOT JUST COMPARED AFTERWARDS
   (Aug 9 2026 sweep, finding 1). The old request carried the PIN alone, so the
   worker tested it against EVERY roster entry — one request was 106 guesses
   against a 10,000-value space, and the throttle that was meant to stop that
   counted in Cloudflare KV, which cannot count. Naming the account narrows the
   search to one, which is the single biggest cut to the attack and costs
   nothing: BOTH call sites below already know who they expect, they were just
   checking it after the answer came back instead of before.
   ⚠️ OPTIONAL ON PURPOSE. `verifyPin` at the generic call site has no id to
   give and must keep working, so a missing id means today's behaviour. */
async function verifyPinRaw(pin, expectedId) {
  try {
    const r = await fetch("/api/pin-verify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(expectedId == null ? { pin } : { pin, id: String(expectedId) }),
    }).then((x) => x.json());
    /* ⚠️ DELIBERATELY DOES NOT STORE THE TOKEN, even though the response
       carries one. `r.ok` only means the PIN belongs to SOMEBODY. Every caller
       here then checks it belongs to the RIGHT somebody — tryPin compares
       against the file that was tapped, LeaderSignIn against the name picked.
       🐛 Storing it here for about an hour on Aug 2 2026 meant a refused
       attempt still swapped the device's session: "That PIN belongs to someone
       else" on screen, and that someone else's session installed. On a shared
       iPad that silently reduces HR Console to one row and makes its saves
       answer ok while writing nothing. Store it in the success branch, next to
       the identity check that earned it. */
    return r || { ok: false, error: "empty" };
  } catch (e) { return { ok: false, error: "network" }; }
}
async function verifyPin(pin) {
  const r = await verifyPinRaw(pin);
  return r && r.ok ? String(r.id) : null;
}

/* ★ SAY WHICH FAILURE IT WAS. "Incorrect PIN." was shown for a lockout, a
   server error and a genuine mismatch alike, which made a real bug
   indistinguishable from a typo and cost hours. */
function pinErrText(r, expectedId) {
  if (!r) return "Couldn't check that PIN — try again.";
  if (r.ok && expectedId != null && String(r.id) !== String(expectedId)) {
    return "That PIN belongs to someone else — pick your own name.";
  }
  if (r.ok) return "";
  if (r.error === "locked") return `Too many attempts. Try again in about ${r.retryAfterMin || 15} minutes.`;
  if (r.error === "ambiguous") return "That PIN matches more than one person — set a unique PIN.";
  if (r.error === "no-match") return "Incorrect PIN.";
  if (r.error === "network") return "Couldn't reach the Hub — check your connection.";
  /* The worker asks callers it does not recognise to name themselves. Nothing
     sends this today; it is here first so the worker can never answer with a
     code this screen renders as "Couldn't check that PIN (who)." */
  if (r.error === "who") return "Pick your name first, then enter your PIN.";
  return `Couldn't check that PIN (${r.error || "unknown"}).`;
}

/* Set a PIN. The worker checks uniqueness across the whole map and stores a
   salted hash. Returns null on success or a message to show.
   ⚠️ Uniqueness CANNOT be checked here any more — hashed entries can't be
   compared client-side — and it must not be done by calling verifyPin, because
   a non-match there counts as a failed attempt and would rate-limit someone
   just for picking a PIN. */
async function setPinRemote(id, pin) {
  try {
    const r = await fetch("/api/pin-set", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
      body: JSON.stringify({ id, pin }),
    }).then((x) => x.json());
    if (r && r.ok) return null;
    if (r && r.error === "taken") return "That PIN is already in use — choose a different one.";
    if (r && r.error === "bad-pin") return "PIN must be 4–6 digits.";
    return "Couldn't save that PIN — try again.";
  } catch { return "Couldn't save that PIN — try again."; }
}

async function clearPinRemote(id) {
  try {
    await fetch("/api/pin-clear", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
      body: JSON.stringify({ id }),
    });
  } catch {}
}

/* 🐛 A FAILED SAVE USED TO SAY NOTHING AT ALL (Jul 29 2026).
   This swallowed the exception AND ignored the return value — and `kvSet`
   reports refusal by RETURNING FALSE, not by throwing, so the common failure
   never even reached the catch. React state had already been updated by the
   time this ran, so the entry sat on screen looking filed and was gone on the
   next reload. Hours can pass before anyone finds out.
   ⚠️ The alert is the point. There is no quieter option that still works: this
   runs after the UI has committed, so the only honest thing left is to tell the
   person in front of the iPad that what they just did did not stick.
   ⚠️ This does NOT fix a lost update — see the member-row note in worker.js.
   A clobbered write succeeds, so nothing here would fire. The two defects are
   independent and both needed fixing. */
async function saveKey(k, v, member) {
  let ok = false;
  try { ok = await kvSet(k, v, member); } catch (e) { console.error("hr save threw:", e, "key:", k); }
  if (!ok) {
    console.error("hr save failed:", k, "member:", member ?? "(whole map)");
    try {
      window.alert("That did not save.\n\nWhat you just entered is still on this screen but it did NOT reach the Hub, and it will be gone if you reload. Check your connection and do it again.\n\nIf it keeps failing, tell Matt and mention: " + k);
    } catch {}
  }
  return ok;
}
async function loadAll() {
  try { const out = {}; await Promise.all(HR_KEYS.map(async (k) => { const v = await kvGet(k); if (v != null) out[k] = v; })); return out; }
  catch { return null; }
}

/* 4th return value `loaded` = "the fetch for this key has come back", which is
   NOT the same question as "is this map empty". Before it existed there was no
   way to tell an un-fetched `{}` from a genuinely empty one, and a metric got
   published off the un-fetched state — see the mount-race note on the scorecard
   effect below. Every existing call site destructures three elements and simply
   ignores the fourth, so adding it is backward compatible.
   ⚠️ `loaded` goes true even when the hydrate read resolves null (key absent). That is
   correct: an absent key IS loaded, and it is legitimately empty. It is also
   true for a FILTERED read, which returns `{}` — this flag deliberately does not
   try to detect that. Filtering is a separate failure with a separate guard. */
function usePersisted(key, initial) {
  const [val, setVal] = useState(initial);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef(initial);
  /* ⚠️ true = the hydrate read FAILED, which `loaded` deliberately cannot see
     (the note above: absent IS loaded). Before this ref existed, a dropped
     read on any of the 13 keys riding this hook left `initial` in the ref,
     and the next mutate wrote that emptiness back — a whole-map replace for
     the unlisted keys (every injury report, every status flag, both handbook
     signature sets), and for member-row keys the SELECTED person's whole
     row. One flag, one gate in mutate, covers every call site at once. */
  const readFailed = useRef(false);
  useEffect(() => { ref.current = val; }, [val]);
  useEffect(() => {
    let a = true;
    setLoaded(false);
    readFailed.current = false;
    kvGetResult(key).then((r) => {
      if (!a) return;
      if (!r.ok) { readFailed.current = true; }
      else if (r.value != null) { ref.current = r.value; setVal(r.value); }
      setLoaded(true);
    }).catch(() => { if (a) { readFailed.current = true; setLoaded(true); } });
    return () => { a = false; };
  }, [key]);
  /* `member` (optional, 2nd arg) = the roster id whose row is the only one this
     change touches. Passed straight through to the worker, which then merges
     that one row instead of replacing the whole map. Callers that omit it keep
     the old whole-map write, so nothing else in this file changes behaviour. */
  const mutate = (fn, member) => {
    if (readFailed.current) {
      try {
        /* ⚠️ TWO DIFFERENT FAILURES, TWO DIFFERENT SENTENCES. An expired sign-in
           and a broken read both leave readFailed set, but the fix is opposite:
           one is "sign in again" (nothing is wrong), the other is "tell Matt"
           (something is). store.js already knows which — it flags a 401 as an
           expired session. Telling an expired leader to reopen the console just
           reuses the same dead token and loops; three leaders hit that and DMed
           Matt thinking the data broke. */
        if (hrSessionExpired()) {
          window.alert("Your Hub sign-in has expired.\n\nNothing has been deleted — this is just a timed-out login. Sign all the way out of the Hub and back in with your PIN, then try again.");
        } else {
          window.alert("That did not save.\n\nThis record never loaded — saving now would erase what is really stored. Close HR Console, reopen it, and do it again.\n\nIf it keeps happening, tell Matt and mention: " + key);
        }
      } catch {}
      return;
    }
    const next = fn(ref.current);
    ref.current = next;
    setVal(next);
    saveKey(key, next, member);
  };
  const setLocal = (v) => setVal((p) => { const n = typeof v === "function" ? v(p) : v; ref.current = n; return n; });
  return [val, mutate, setLocal, loaded];
}

/* ---------- notify (Worker /api/notify → Resend). Neutral to member, summary to HR. ----------
   Jul 31 2026: this file no longer knows anyone's email address. Payloads name
   people as { id, name } and the WORKER resolves addresses from protected HR
   data; it owns the HR/Bri summary addresses too, so hrEmail/briEmail are
   plain booleans here. That is what took 105 personal emails out of the
   public bundle. `skipEmail: true` on a member means "HR summary only, no
   member copy" — the pending-write-up path sends a sign request instead and
   emailing the filing too would double-notify. */
const who = (m) => ({ id: m?.id, name: m?.name, ...(m?.skipEmail ? { skipEmail: true } : {}) });
async function notify(payload) {
  try {
    const res = await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json", "x-hub-token": hubToken() }, body: JSON.stringify(payload) });
    const ct = res.headers.get("content-type") || "";
    return res.ok && ct.includes("application/json");
  } catch { return false; }
}
// Notifies the TEAM MEMBER that a document was added to their file. HR is NO
// LONGER copied: Hannah, Aug 1 2026 — "I no longer need emails for file entries
// since you fixed the alerts at the top of the console." The pending-points
// card now surfaces what she used to watch the inbox for. (This reverses her
// Jul 18 "email every time a leader documents someone.") Injury and Bri-facing
// notifications still email out; only file-entry HR copies are off.
/* ★ A POSITIVE ENTRY BUZZES THEIR PHONE (Matt, Aug 4 2026: "when anyone gets a
   positive documentation to get a push notification to their phones. That will
   also help adoption and usage").
   ⚠️ KEYED ON THE POINTS, NOT ON A LIST OF TYPE IDS. Points already carry the
   judgment — a positive entry is one that gives points back — so any type added
   later is covered without anyone remembering to update a second list. Today
   that is Recovery Point (+1) and nothing else, which is worth knowing: this
   fires rarely until there is a recognition type to go with it.
   ⚠️ NEGATIVE ENTRIES DO NOT PUSH, and that is deliberate. A phone buzzing to
   tell someone they have been written up is how you make people dread the app.
   They still get the email, which is the record. */
function notifyFileEntry(member, entry) {
  return notify({ kind: "fileEntry", member: who(member), hrEmail: false, type: entry.title, date: entry.date, issuedBy: entry.by, details: "A new document was added to your team file.", positive: Number(entry.points) > 0 });
}
// Sent when a leader attaches documentation WITHOUT the team member's signature:
// emails the team member a request to open their file and sign it themselves.
function notifySignRequest(member, title) {
  return notify({ kind: "sign-request", docTitle: title, recipients: [who(member)] });
}
/* The leader is told the moment a leadership point is filed, with the number
   and the next step — not just that something happened. See the builder in
   worker.js for why the total matters more than the notice. */
function notifyLdrPoint(member, d) {
  return notify({ kind: "leadershipPoint", member: who(member), hrEmail: true, ...d });
}
function notifyInjury(member, inj) {
  return notify({ kind: "injury", member: who(member), hrEmail: true, type: "Workplace Injury", date: inj.date, issuedBy: inj.reportedBy, details: `Injury reported — ${inj.bodyPart || "n/a"} at ${inj.area || "n/a"}. Medical: ${inj.medical}.` });
}
// Bri gets notified any time an evaluation or document (handbook / confidentiality) gets signed.
function notifySignatureComplete(itemKind, title, member, sig) {
  return notify({ kind: "signatureComplete", briEmail: true, itemKind, title, member: who(member), signedBy: sig || "" });
}

/* ---------- reference data ---------- */
/* Hannah, Jul 26 2026: "Five step counseling ladder is correct" and
   "Counselings carry zero points. They are to document conversations I have
   warning the employee of their standing in the point system."

   ⚠️ THE COLUMN CHANGED MEANING. It used to be the points the counseling
   DEDUCTED; it is now the point total that TRIGGERS it. Under the old system a
   leader chose the counseling and it was the thing being scored. Under hers,
   infractions move the balance and HR reads the balance to decide the level —
   so a counseling that also deducted would double-count: someone reaching -6
   and receiving a Written Warning would drop to -14, past termination, from one
   warning issued exactly as the policy intends. */
const COUNSELING_LADDER = [
  { step: "1 of 5", form: "Verbal Warning", at: "at -3 to -5" },
  { step: "2 of 5", form: "Written Warning", at: "at -6 to -8" },
  { step: "3 of 5", form: "Final Warning", at: "at -9" },
  { step: "4 of 5", form: "Suspension — one week, unpaid", at: "at -10 or -11" },
  { step: "5 of 5", form: "Termination", at: "at -12" },
];
const EVAL_DIMENSIONS = ["Operational Excellence", "Hospitality / Guest Focus", "Teamwork", "Reliability & Attendance", "Leadership & Initiative"];
const MEDICAL_OPTIONS = ["None", "First aid on site", "Sent to clinic / urgent care", "Emergency room", "Other"];
const HANDBOOK_STATEMENT = "I acknowledge that I have received, read, and understand the current Team Member Handbook, including the policies on attendance, conduct, food safety, and the point and counseling system. I agree to comply with these policies and understand that the handbook may be updated, in which case I will be asked to re-acknowledge the new version.";
/* ⚠️ "at this restaurant", NOT `STORE.name`, AND THE REASON IS THE TIMING.
   These two are module-level consts, evaluated when the chunk is imported,
   which can precede `applyStoreOverrides` — a settings read here would freeze
   the code default and look dynamic forever. Generic wording is true at every
   store and cannot go stale. Same call as the training slides and the
   orientation checklist.
   ⚠️ IT SAID "at Gate City" UNTIL AUG 13 2026, so a clone's leaders were asked
   to acknowledge the standards of a restaurant they do not work at.
   ⚠️⚠️ NOBODY IS RE-SENT BY THIS, CHECKED RATHER THAN ASSUMED, and that was
   Bri's stated constraint on this screen. The acknowledgement record is
   `{ version, date, signature }` — it does NOT store this sentence — and
   "signed the current version" is `ack.version === version.n`, a number
   comparison. Only `pushLdrHandbook` bumps that number, and only a director
   presses it. Editing this wording changes what the screen displays and
   nothing about who has signed. */
const LEADERSHIP_HANDBOOK_STATEMENT = "I acknowledge that I have received, read, and understand the current Leadership Handbook, including the expectations, standards, and responsibilities that come with a leadership role at this restaurant. I agree to lead by these standards and understand that this handbook may be updated, in which case I will be asked to re-acknowledge the new version.";
// Leadership Handbook applies to Team Leader and up — same "Leader" tier the rest of the Hub uses.
// Senior Trainer carries Team Leader access (rank 3), so it qualifies too.
// ★ WHO MUST SIGN THE LEADERSHIP HANDBOOK.
// Bri, repeatedly and finally on Jul 25: *"Trainers added to the Leadership
// Handbook requirement… this has been requested multiple times without
// movement."* She was right that it kept being overtaken.
//
// Was `>= 3`, which is Senior Trainer, Team Leader and up — so plain **Trainer
// (rank 2) was excluded**. Now `>= 2`, which adds them.
//
// ⚠️ HER CONSTRAINT, AND IT IS THE IMPORTANT HALF: *"without re-sending to
// anyone already signed."* This change CANNOT re-send, and the reason is worth
// knowing. A re-send happens only when `pushLdrHandbook` bumps `version.n`,
// which invalidates every ack at once. Widening eligibility touches no version:
// an existing signer still satisfies `acks[id].version === version.n` and stays
// signed. Only the newly-eligible trainers appear as outstanding, because they
// genuinely are. **Do not "helpfully" push a new version alongside this.**
//
// ✅ RESOLVED — Bri, Jul 26 2026: "Junior Trainers do also need to sign the
// Leadership Handbook. They are leaders in title, just with no additional
// permissions. Please add the requirement for all title Junior Trainers and up,
// regardless of their permission set. THE TITLE IS THE DISTINCTION with this
// particular requirement."
//
// So this test is deliberately no longer a pure rank threshold. Junior Trainer
// sits at rank 1 alongside Team Member, so no threshold can catch it without
// catching all 106 — the title has to be named. The rank test is KEPT beneath
// it so any role added at rank 2+ in future is still picked up automatically;
// the set only ever ADDS people, it can never remove anyone.
//
// ⚠️ Payroll is rank 1 and is deliberately absent: it is not a leadership title.
// ⚠️ Hannah, Jul 26: "There are no more 'plain trainers'. there are only junior
// and senior trainers." Trainer is listed anyway so that anyone still holding
// the retired role keeps their obligation instead of silently losing it.
const LDR_HANDBOOK_MIN = 2;      // Trainer and up, by permission
const LDR_HANDBOOK_TITLES = new Set(["Junior Trainer", "Trainer", "Senior Trainer"]);
const isLeaderTier = (role) => LDR_HANDBOOK_TITLES.has(role) || rankOf({ role }) >= LDR_HANDBOOK_MIN;
const CONFIDENTIALITY_STATEMENT = "I understand that during my employment I may have access to confidential and proprietary information, including guest information, financial data, recipes and operational procedures, team member records, and business strategy. I agree to keep this information strictly confidential, to use it only as required to perform my job, and not to disclose it to anyone outside the organization during or after my employment.";

/* ── EVALUATION TEMPLATES ─────────────────────────────────────────
   Key: gcfcr-hr-evaltpl-v1 — the SAME key Team Documentation uses. Until
   July 17 that was a trap, not a feature: Team Docs wrote it to window.storage
   and this console read it from Supabase, so kvGet always returned null and
   this console silently fell back to the hardcoded EVAL_DIMENSIONS below.
   Nothing errored; the two tools just quietly used different data. The Team
   Docs "Publish to HR Console" button copies the real templates across, and
   the editor now LIVES HERE writing to kvSet — one store, one source.

   FALLBACK_TEMPLATE is now only what a genuinely empty store starts from
   (and the editor's seed), not something that shadows real templates. */
const FALLBACK_TEMPLATE = {
  id: "tpl_default",
  name: "Team Member Evaluation",
  categories: EVAL_DIMENSIONS.map((d, i) => ({ id: "d" + i, name: d, max: 5 })),
};
const SCALE_OPTIONS = [3, 4, 5, 10];   // matches the scales Team Docs allowed
const tplsOf = (templates) => (templates && templates.length ? templates : [FALLBACK_TEMPLATE]);

/* ⚠️ THE SCALE USED TO BE HARDCODED TO 5 — in FOUR places, and one of them
   wasn't cosmetic. `Rating` rendered [1,2,3,4,5] literally, so a category built
   on a 1–10 scale COULDN'T BE SCORED past 5 in this console at all: 8 was not a
   button. The other three (`OverallReadout`, the Overall pill, the category
   chips) printed "/5" onto whatever number they were handed — "8/5".
   Every one of them now reads the scale off the template.

   catOf() resolves a rating's category so the chip can print the right max.
   A rating whose category no longer exists (template edited after the eval was
   run) falls back to showing the raw id at /5 rather than vanishing — a stale
   label beats a disappeared score. */
const catOf = (tpl, cid) => (tpl && tpl.categories || []).find((c) => c.id === cid) || { name: cid, max: 5 };
/* ── SECTION-AWARE SCORING (Bri, Jul 22) ──────────────────────────────────
   Two things are now excluded from the Overall average:
     • a rating of "na"  — N/A means "this doesn't apply", NOT zero. Averaging
       it in as 0 would punish someone for a category that never applied.
     • every category inside a section marked score:false — her example was a
       character section she wants averaged and a position section she doesn't.
   Templates with no `sections` array behave EXACTLY as before, so nothing
   already on file changes meaning. `scoredCats` is the single definition of
   "what counts" and both the readout and the average read from it. */
const isNA = (v) => v === "na" || v === "NA";
const sectionsOf = (tpl) => (tpl && Array.isArray(tpl.sections) ? tpl.sections : []);
const sectionScores = (tpl, sectionId) => {
  const s = sectionsOf(tpl).find((x) => x.id === sectionId);
  return s ? s.score !== false : true;   // no section, or unknown → counts
};
const scoredCats = (tpl) => ((tpl && tpl.categories) || []).filter((c) => sectionScores(tpl, c.sectionId));
const overallOf = (tpl, ratings) => {
  const r = ratings || {};
  const vals = scoredCats(tpl)
    .map((c) => r[c.id])
    .filter((v) => !isNA(v))
    .map(Number)
    .filter((n) => n > 0);
  if (!vals.length) return 0;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
};
const scoredCount = (tpl, ratings) => {
  const r = ratings || {};
  return scoredCats(tpl).filter((c) => !isNA(r[c.id]) && Number(r[c.id]) > 0).length;
};

/* tplMax — the scale to print next to an OVERALL average.
   Returns the shared max when every category uses the same one (the normal
   case). Returns null when a template MIXES scales, because then the mean of
   raw scores has no honest denominator — 5/5 and 5/10 are not the same 5, and
   averaging them is already dubious. Callers render a bare number in that case
   instead of stamping a denominator that would be wrong for half the inputs. */
const tplMax = (tpl) => {
  const maxes = scoredCats(tpl).map((c) => Number(c.max) || 5);
  if (!maxes.length) return 5;
  return maxes.every((m) => m === maxes[0]) ? maxes[0] : null;
};

const TEMPLATES = [
  // Hannah, Jul 23: "a general documentation icon so that leaders can document
  // anything that does not fall into the other categories", and — asked twice —
  // "flat zero points for all general documentation. I assign points if
  // applicable." So it files at ZERO and she adjusts afterwards through the
  // normal point-adjustment path. needsPricing stays FALSE: this is not an
  // unpriced write-up waiting on HR, it is a neutral record that may never need
  // a value at all. Kept FIRST so the catch-all is the easiest button to reach.
  // ⚠️ `source: "general"` is what keeps it out of the Write-ups group — see
  // FILE_GROUPS, whose writeups test is a catch-all.
  { id: "general-doc", title: "General Documentation", area: "General", source: "general", points: 0,
    body: "On {date}, {name} — \n\n(Describe what happened, factually and specifically. Include what was said or done, by whom, and any expectation set going forward.)" },
  // Hannah's Points Performance System (eff. 1 Jul 2026) lists No Call/No Show
  // as "TM Resigned" — a SEPARATION, not a point value. It was -4 here, which is
  // now wrong. It files at zero carrying hrDecides so HR must action it rather
  // than letting it look handled: the outcome is a resignation to process, and
  // that is not a decision a point total can make.
  { id: "ncns", title: "No Call/No Show", area: "Attendance", points: 0, hrDecides: true, outcome: "TM Resigned",
    body: "On {date}, {name} was scheduled from {startTime} to {endTime} and did not report to their shift, with no call, text, or notice to a manager. Documented as a No Call/No Show.\n\nUnder the {system}, a No Call/No Show is treated as the team member having resigned their position. HR reviews and processes the separation." },
  { id: "late30", title: "30+ Minutes Late", area: "Attendance", points: -2,
    body: "On {date}, {name} was scheduled to begin at {startTime} and clocked in at {actualTime}, more than 30 minutes late, without notifying a manager beforehand.\n\nExpectation going forward: arrive ready to work at the scheduled time and notify a manager immediately if lateness is anticipated." },
  { id: "late5", title: "Late for Scheduled Shift (Under 30 Min)", area: "Attendance", points: -1,
    body: "On {date}, {name} clocked in at {actualTime}, after a scheduled start of {startTime}. Documented as a punctuality concern.\n\nExpectation going forward: clock in at or before the scheduled shift time." },
  { id: "callout-wknd", title: "Call Out — Fri/Sat", area: "Attendance", points: -2,
    body: "On {date}, {name} called out of a scheduled Friday/Saturday shift, a high-impact coverage window.\n\nExpectation going forward: request weekend time off in advance through the normal process rather than calling out." },
  { id: "callout-short", title: "Call Out — <2hr Notice", area: "Attendance", points: -2,
    body: "On {date}, {name} reported they would not work less than two hours before their {startTime} start, leaving insufficient time to find coverage.\n\nExpectation going forward: provide as much advance notice as possible for any shift they cannot work." },
  { id: "callout-notice", title: "Call Out — 3+ hr Notice", area: "Attendance", points: -1,
    body: "On {date}, {name} called out of their {startTime} shift with more than three hours' notice, giving the team time to arrange coverage. Documented as an attendance occurrence with proper advance notice.\n\nExpectation going forward: continue giving as much advance notice as possible, and use the time-off request process where the absence is known ahead." },
  { id: "phone", title: "Phone on the Clock", area: "Policy", points: -2,
    body: "On {date}, {name} was observed using a personal phone while clocked in and working, in violation of the phone-use policy. Addressed directly at the time.\n\nExpectation going forward: personal devices stay put away during a working shift except on breaks or in an emergency." },
  { id: "attitude", title: "Poor Attitude/Disrespect", area: "Policy", points: -5,
    body: "On {date}, {name} behaved toward {witness} in a way inconsistent with team standards for professional conduct. Specifically: {details}\n\nExpectation going forward: communicate respectfully and professionally at all times, even during disagreements." },
  { id: "food-safety", title: "Food Safety Violation", area: "Policy", points: -5,
    body: "On {date}, {name} was observed violating a food safety standard. Specifically: {details}\n\nExpectation going forward: follow all food safety procedures without exception, as these protect guests and team members." },
  { id: "performance", title: "Performance Needs Improvement", area: "Policy", points: -2,
    body: "On {date}, a review identified the following area(s) needing improvement: {details}\n\nExpectation going forward: work with a manager on a clear improvement plan, with a follow-up check-in on {followUpDate}." },
  // ── Added Jul 26 2026 from Hannah's Points Performance System (eff. 1 Jul).
  // Every value below is hers verbatim. Four were simply absent; three carry an
  // outcome rather than a number, and those file at zero with hrDecides so the
  // decision lands with HR instead of a leader implying a point value.
  { id: "callout-mth", title: "Call Out — Mon-Thu", area: "Attendance", points: -1,
    body: "On {date}, {name} called out of a scheduled Monday-Thursday shift.\n\nExpectation going forward: request time off in advance through the normal process rather than calling out." },
  { id: "callout-leadership", title: "Leadership Shift Call Out", area: "Attendance", points: -3,
    body: "On {date}, {name} called out of a scheduled LEADERSHIP shift, leaving the shift without its assigned leader.\n\nExpectation going forward: a leadership shift carries responsibility for the whole team on duty — arrange coverage with a director well in advance of any absence." },
  { id: "frisat-90", title: "2nd Fri/Sat Missed in 90 Days", area: "Attendance", points: -4,
    body: "On {date}, {name} missed a Friday or Saturday shift — the second or later Friday/Saturday missed within a 90-day period.\n\nExpectation going forward: weekend shifts are the highest-volume periods of the week; repeated weekend absence puts the rest of the team short-staffed at the hardest time." },
  { id: "cfa-procedure", title: "Failure to Follow CFA Procedure", area: "Policy", points: -1,
    body: "On {date}, {name} did not follow an established Chick-fil-A procedure. Specifically: {details}\n\nExpectation going forward: follow the procedure as trained, and ask a leader if any step is unclear rather than working around it." },
  { id: "harassment", title: "Harassment", area: "Serious", points: -6, hrDecides: true, outcome: "-6 / Termination",
    body: "On {date}, a harassment allegation was reported involving {name}. Specifically: {details}\n\nWitness(es): {witness}\n\nPer policy the team member is sent home immediately and HR completes the follow-up. This may carry -6 points or result in termination, at HR's determination." },
  { id: "gross-misconduct", title: "Gross Misconduct", area: "Serious", points: 0, hrDecides: true, outcome: "Termination",
    body: "On {date}, {name} was involved in conduct documented as gross misconduct. Specifically: {details}\n\nWitness(es): {witness}\n\nPer policy the team member is sent home immediately and HR completes the follow-up. Gross misconduct is a termination-level event and is not scored in points." },
  { id: "insubordination", title: "Insubordination", area: "Serious", points: 0, hrDecides: true, outcome: "Up to termination",
    body: "On {date}, {name} refused or failed to follow a reasonable direction from a leader. Specifically: {details}\n\nWitness(es): {witness}\n\nHR determines the outcome, up to and including termination." },
  // Added Aug 1 2026 (Hannah, re: a falsified QIV). Its own line so integrity
  // breaches document clearly instead of under Gross Misconduct. Serious tier,
  // HR-decides, not scored in points.
  { id: "falsification", title: "Falsification of Records", area: "Serious", points: 0, hrDecides: true, outcome: "Up to termination",
    body: "On {date}, {name} falsified a company record. Specifically: {details}\n\nWitness(es): {witness}\n\nFalsifying a record — including a food safety or quality record such as a QIV — breaks the trust and integrity a leadership role is built on, and it means the underlying check was not truly performed. HR completes the follow-up and determines the outcome, up to and including termination. Not scored in points." },
  // The only template that ADDS points. Recovery is capped by total() — a
  // recovery point can bring someone back toward zero, never above it.
  { id: "recovery", title: "Recovery Point (Note Provided)", area: "Recovery", source: "recovery", points: 1, outcome: "+1 point",
    body: "On {date}, {name} provided a doctor's note, jury duty notice, or obituary covering a previously documented absence.\n\nOne recovery point is restored. A point total can never rise above zero." },
  { id: "adjust", title: "Point Adjustment", area: "Adjustment", points: 0,
    body: "On {date}, a manual point adjustment was applied to {name}'s file by leadership. Reason: {details}\n\nEnter a positive point value to restore points (e.g. correcting an inaccurate write-up) or a negative value to deduct. This entry keeps the point ledger accurate." },
  // ⚠️ ALL FIVE CARRY points: 0 — see COUNSELING_LADDER above for why. A
  // counseling RECORDS the conversation about someone's standing; the
  // infractions are what moved the balance that triggered it.
  { id: "verbal", title: "Verbal Warning", area: "Counseling", counseling: true, step: "1 of 5", points: 0, outcome: "No points · at -3 to -5",
    body: "On {date}, {name} was counseled regarding their standing in the {system}, having reached the -3 to -5 range. Discussed: {details}\n\nThis is Counseling 1 of 5 and carries no points of its own — the point total is set by the infractions already on file. Continued infractions will move that total further." },
  { id: "written", title: "Written Warning", area: "Counseling", counseling: true, step: "2 of 5", points: 0, outcome: "No points · at -6 to -8",
    body: "On {date}, {name} received a written warning regarding their standing in the {system}, having reached the -6 to -8 range. Discussed: {details}\n\nThis is Counseling 2 of 5 and carries no points of its own. This step outlines the specific issues, the expectations for improvement, and the consequences of continued infractions.\n\nNote: performance raises are forfeited while a team member is on Written Counseling or higher at the time of evaluation or raise eligibility." },
  { id: "final", title: "Final Warning", area: "Counseling", counseling: true, step: "3 of 5", points: 0, outcome: "No points · at -9",
    body: "On {date}, {name} was placed on a Final Written Warning in a formal counseling session, having reached -9 points. Discussed: {details}\n\nThis is Counseling 3 of 5 and carries no points of its own. This marks the last opportunity to avoid suspension or termination." },
  { id: "suspension", title: "Suspension — One Week, Unpaid", area: "Counseling", counseling: true, step: "4 of 5", points: 0, outcome: "No points · at -10 or -11",
    body: "On {date}, {name} was placed on a one-week unpaid suspension, having reached -10 or -11 points. Discussed: {details}\n\nThe suspension is effective the week following the Final Warning counseling. This is Counseling 4 of 5 and carries no points of its own.\n\nAny further infraction after this suspension, before points have rolled off, results in termination. A second suspension results in automatic termination." },
  { id: "term", title: "Termination", area: "Counseling", counseling: true, step: "5 of 5", points: 0, outcome: "No points · at -12",
    body: "On {date}, {name}'s employment was reviewed for termination following: {details}\n\nThis is Counseling 5 of 5 and carries no points of its own. The final termination process must be completed manually by an Admin, then this team member moved to the Terminated roster." },
];
const AREA_COLORS = { Attendance: "#B45309", Policy: "#DD0031", Serious: "#7F1D1D", Counseling: "#B91C1C", Adjustment: "#0F766E", Recovery: "#0F766E" };

/* FILE SECTIONS (Matt, July 16: "Have sections in their file divided up by
   point total, write ups, counselings, documentation").
   The file used to render as one undifferentiated stream — a verbal warning
   and a point adjustment sat side by side with nothing but a colour chip
   between them. Now it groups the way Matt actually thinks about a file, so
   opening one shows the SHAPE of someone's history at a glance: how many real
   write-ups, where they are on the counseling ladder, and what's just paperwork.
   Point total already has its own pill, so it isn't repeated as a group — but
   each group carries its own point subtotal, which the flat list never showed.
   `source === "teamdocs"` is the copy pushed over from Team Documentation —
   it lands in Documentation, not Write-ups, because those records carry no
   points and shouldn't look like a points event. */
const FILE_GROUPS = [
  // MUST stay ahead of "writeups": that test is a catch-all — anything that
  // isn't a counseling, an Adjustment or a teamdocs record matches it — so an
  // orientation completion would otherwise be filed under a DISCIPLINARY
  // heading in someone's HR file. Written by [[NewHireOrientation]] with
  // source:"orientation", points 0, needsPricing false.
  { id: "orientation", label: "Orientation & Training", blurb: "Completed orientation and training records. Not discipline — these carry no points.",
    test: (x) => x.source === "orientation" },
  /* ⚠️ THE `area` TESTS BELOW ARE FOR RECORDS ALREADY ON FILE, and they must
     move in lockstep with the `source` tests — writeups is checked FIRST, so a
     rule added to one and not the other makes a record match both and land in
     the wrong one anyway.

     🐛 Until Aug 7 2026 attach() never copied `source` onto the stored entry,
     so every General Documentation and Recovery Point ever filed sits in the
     data with no `source` at all. Fixing attach() only fixes what gets filed
     from now on; without this, every historical one stays under "Write-ups" on
     somebody's permanent record, and a Recovery Point is a +1 someone EARNED.

     ⚠️ SAFE BECAUSE THESE TWO AREAS ARE UNIQUE. Checked every template: `area:
     "General"` belongs to general-doc alone and `area: "Recovery"` to recovery
     alone. Nothing else in the list can be caught by them. Migrating on READ
     rather than rewriting stored records is design rule 1, and it means no
     entry is edited and no history stamp is invented. */
  { id: "writeups", label: "Write-ups", blurb: "Attendance and policy incidents that moved points.",
    test: (x) => !x.counseling && x.area !== "Adjustment" && x.area !== "General" && x.area !== "Recovery" && x.source !== "teamdocs" && x.source !== "orientation" && x.source !== "general" && x.source !== "recovery" },
  { id: "counselings", label: "Counselings", blurb: "The formal 1-4 ladder. HR-issued.",
    test: (x) => !!x.counseling },
  { id: "documentation", label: "Documentation", blurb: "General records, point adjustments, and entries copied from Team Documentation. Not discipline.",
    test: (x) => x.area === "Adjustment" || x.area === "General" || x.area === "Recovery" || x.source === "teamdocs" || x.source === "general" || x.source === "recovery" },
];
// Anything a future template adds that matches no group still has to render —
// otherwise a new `area` would silently vanish from the file. Catch-all.
// Fallback is looked up BY ID, not by index: a hardcoded FILE_GROUPS[2] breaks
// silently the moment a group is inserted ahead of it, and an unmatched entry
// landing in "Counselings" would be a lot worse than landing in Documentation.
const groupOf = (x) => (FILE_GROUPS.find((g) => g.test(x)) || FILE_GROUPS.find((g) => g.id === "documentation")).id;



// Junior Trainer carries Team Member access (rank 1); Senior Trainer carries
// Team Leader access (rank 3). Slotted into the existing scale so nothing
// above them renumbers — Slack jobs, LeadershipTile, and Daily Setups PINs
// all read these same ranks and stay put.
// RANK is imported from ./hrRoster.js at the top of this file — see the note there.
/* ── Access model ──
   Two separate powers, deliberately split (Hannah's design, July 16: "can we
   make it so the leaders can make file entries but not see into the file?").
     DOCUMENT  (DOC_MIN, Team Leader+) — write an entry about someone at or
                                         below you. Trainers are NOT in this,
                                         whatever their access rank says: see
                                         docRankOf.
     READ      (FULL_MIN, LDD+)        — see the file: history, points, evals,
                                         injuries, handbook status.
   A Team Leader reports what they saw and never sees the history. That's the
   point: escalation is HR's call, not something a leader infers from browsing
   someone's record. It also kills the reason Team Documentation's Counseling
   tab existed — one file, one ledger, no sync between two systems.
   Everyone still reads their OWN file via their personal PIN (selfView). */
/* ⚠️ READ THIS AGAINST docRankOf, NOT RANK. This is compared to a DOCUMENTATION
   rank, and since Aug 10 2026 the two are not the same number for a trainer.
   Senior Trainer is RANK 3 and doc rank 2, so it no longer clears this bar —
   which is Bri's ruling, not a side effect. See docRankOf below. */
const DOC_MIN = 3;        // Team Leader and up → CREATE entries only
/* ★ JUL 28 2026 — LOWERED 6 → 5 (Director). Matt's full-read list, verbatim:
   "leadership redevelopment, HR, executive director, payroll and soon to be
   director... obviously ownership". That list is exactly rank >= 5 plus Payroll
   by name, so this constant carries it. Effective Saturday, when Brandon and
   Daisy take the Director title — until someone actually holds rank 5 this
   change moves nobody, which is why it ships ahead of the promotion rather
   than on the morning of it.
   ⚠️ Assistant Director and Manager stay at rank 4 and stay OUT.
   ⚠️ ONLY THIS AND DIRECTOR_MIN MOVED. LDD_MIN, HREXEC_MIN, ROLE_EDIT_MIN,
   TPL_EDIT_MIN, ROSTER_EDIT_MIN, EVAL_ASSIGN_MIN and EVAL_APPROVE_MIN all
   STAY at 6 — a Director reads every active file but cannot edit roles or
   templates, add or remove people, approve evaluations, or see terminated
   records (Matt, Jul 28: terminated stays at 6, ruled explicitly). */
const FULL_MIN = 5;       // Director and up → leadership session (full access)

// Approved to drive the company car (Hannah, Jul 23: "I can maintain the drive
// list in HR console"). Deliberately an EXPLICIT list she curates — NOT derived
// from the IDs on file, because a licence sitting in someone's file is not the
// same as being approved to drive, the uploads can't be read to confirm what
// they even are, and nothing about a stored image tracks expiry.
// Lives in KV so CashAudit's mileage log can read the same list; window.storage
// would be invisible to it. Rows carry BOTH id and name so CashAudit never needs
// the HR roster to render the dropdown.
const DRIVERS_KEY = "gcfcr-approved-drivers-v1";
const driverExpired = (d, ref) => !!(d && d.expires) && d.expires < ref;
const driverExpiringSoon = (d, ref, soon) => !!(d && d.expires) && d.expires >= ref && d.expires <= soon;
/* ★ JUL 28 2026 — LOWERED 6 → 5 alongside FULL_MIN, and BOTH were required.
   FULL_MIN alone opens the leadership session; DIRECTOR_MIN is what `canOpen`
   uses to open somebody else's profile. Moving one without the other would
   have given Brandon and Daisy the Director title and a console that still
   showed them nothing. */
const DIRECTOR_MIN = 5;   // Director and up → override / open ANY profile
const LDD_MIN = 6;        // LDD and up → see Terminated roster
// Edit / remove history. Matt, July 16: "Matt, Hannah, and Bri" — Bri is rank 6,
// so this drops from 7 to 6. NB that also admits Kyleeka (Executive Director, 7)
// and Nick (Owner, 8) — flagged to Matt; naming exactly three people would need
// an explicit id allowlist, which breaks the moment someone changes seats.
const HREXEC_MIN = 6;

// ★ CFA HOME LOGIN STORE (Bri, Jul 25). A place to keep a team member's
// cfahome.com login so it can be retrieved when they forget it. It is a LOG,
// not a connection — changing the password here does NOT change it at CFA, and
// the panel says so on screen.
// ACCESS: `isHRExec` is rank >= 6 — LDD, Executive Director, Human Resources,
// Owner. That is exactly Bri's rule, and it already excludes Payroll (rank 1)
// and Director (rank 5), which she asked for explicitly.
// ⚠️ STORED IN PLAIN TEXT, deliberately — a password nobody can read is useless
// for the thing this solves. The access gate is the control, not encryption.
const CFAHOME_KEY = "gcfcr-hr-cfahome";
const CFAHOME_URL = "https://www.cfahome.com";
const ROLE_EDIT_MIN = 6;  // LDD (Bri) and up → edit roles, limited list below
// Evaluation templates — LDD and up, the same people who can RUN an evaluation
// (`leader` = full(acting)). Anyone who can't run one has no business shaping
// the form, and a Team Leader in write-only mode never sees Evaluations at all.
const TPL_EDIT_MIN = 6;
// Add a person to the roster — LDD and up. Onboarding creates a file, a PIN and
// a handbook obligation, so it sits with the people who already hold those
// powers. Deliberately NOT DOC_MIN: a Team Leader can document someone, which
// is not the same as conjuring an employee.
const ROSTER_EDIT_MIN = 6;
/* ── ASSIGNED EVALUATIONS (Bri, Jul 22) ────────────────────────────────────
   She wants ADs and Directors to COMPLETE evaluations she assigns, with the
   result going to her and Hannah for approval before it reaches a file.

   The important structural point: an Assistant Director is RANK 4, below
   FULL_MIN — they cannot open a file or see the Evaluations section at all,
   and that must not change. So an assigned evaluation is NOT file access. It
   is its own narrow view showing one form for one named person, exactly like
   the write-only documenting a Team Leader already does. An assignee never
   sees history, points, other evaluations, or anyone they weren't assigned.

   Nothing an assignee submits touches `gcfcr-hr-evals`. It sits on the TASK
   until an approver accepts it — that is the whole point of the approval gate,
   and it's why the draft lives in `task.draft` and not in the person's file. */
const EVAL_TASK_KEY = "gcfcr-hr-evaltasks-v1";
/* Bri, Jul 23 — two CONFIDENTIAL fields on an assigned evaluation, for her and
   Hannah only. Neither is ever written into the employee's file: `approveTask`
   copies ratings/comments/evaluator into `gcfcr-hr-evals` and deliberately
   leaves these behind on the task. If you add a field to the eval object, ask
   first whether it belongs in someone's permanent record. */
const EVAL_COPY_KEY = "gcfcr-hr-evalcopy-v1";
const EVAL_COPY_DEFAULT = {
  convoPrompt: "Does this team member/leader need an in-person conversation to review any specifics?",
  privacyNote: "Private — this answer and your notes below go only to Leadership Development and HR. They are never added to the team member's file and they never see them.",
};
const EVAL_ASSIGN_MIN = 6;   // LDD and up assign
const EVAL_APPROVE_MIN = 6;  // LDD and up approve (Bri + Hannah + Exec + Owner)
const canAssignEvals = (u) => rankOf(u) >= EVAL_ASSIGN_MIN;
const canApproveEvals = (u) => rankOf(u) >= EVAL_APPROVE_MIN;
const TEAM_DIR_KEY = "gc-team-directory-v1";   // Bri's teams, for group sends
const TIER_LABEL = { ad: "Assistant Directors", tl: "Team Leaders", trainer: "Trainers", member: "Team Members" };
// Full title list stays HR/Exec-only even though editing dropped to 6 — Bri
// moves people through the front-line ladder, not into Director seats.
const TITLE_FULL_MIN = 7;
const TITLE_OPTIONS = ["Team Member", "Junior Trainer", "Trainer", "Senior Trainer", "Junior Team Leader", "Senior Team Leader", "Team Leader", "Assistant Director", "Director", "Leadership Development Director", "Executive Director", "Human Resources", "Accounts Payable", "Owner", "Payroll"];
// Bri (LDD) can move people through the front-line ladder only. HR/Exec keeps
// the full list above, including Director-and-up titles.
// 🐛 Bri, Jul 25: "I have the ability to change titles in HR console for all
// tiers except Team Leader." She was right, and the cause was this list, not a
// permission: it carried "Junior Team Leader" and "Senior Team Leader" but not
// plain **"Team Leader"**, and "Junior Trainer"/"Senior Trainer" but not plain
// **"Trainer"** — the two most common rungs on the very ladder she owns. Almost
// certainly an oversight when the list was written, since every neighbouring
// rung is present.
// ⚠️ DELIBERATELY STILL EXCLUDES Director and up. Those titles carry HR
// Console access, documenting rights and the financial gates — widening this
// list to them would be a permissions change, not a typo fix, and belongs to
// Hannah rather than to a bug report.
/* ✅ ONE LIST NOW, in hrRoster.js. The rungs and their order are byte-identical
   to what this literal held, so nothing on this screen moves.
   🐛 The reason it moved: the SECOND copy, in LeadershipDev.jsx, was still five
   rungs and had never received the Jul 25 fix described above — so the tile Bri
   actually runs the pipeline from was missing Trainer, Junior Team Leader and
   Senior Team Leader. Fixing this list twice is what caused that, so it is
   defined once and imported by both. Do not re-type it here. */
const TITLE_OPTIONS_LIMITED = HR_ASSIGNABLE_LADDER;
const ROLE_COLORS = { Limited: "#9CA3AF", Employee: "#6B7280", "Team Member": "#6B7280", "Junior Trainer": "#0D9488", Trainer: "#0F766E", "Senior Trainer": "#0E7490", "Team Leader": "#1D4ED8", "Junior Team Leader": "#2563EB", "Senior Team Leader": "#1E40AF", "Assistant Director": "#6D28D9", Manager: "#6D28D9", Director: "#B45309", "Leadership Development Director": "#223C6A", "Leadership Director": "#223C6A", "Executive Director": "#14243D", Executive: "#14243D", "Human Resources": "#DD0031", Owner: "#111827" };
const roleColor = (r) => ROLE_COLORS[r] || "#6B7280";

/* 🐛 WAS toISOString().slice(0,10) — UTC, which becomes tomorrow at 8pm
   Eastern. This is the most consequential date in the Hub: it stamps
   termination dates, every file entry, handbook and confidentiality
   signatures, injury reports and evaluations. A counseling written up at 9pm
   was dated TOMORROW on a document the team member signs.
   ⚠️ AND IT MOVED THE SIX-MONTH POINTS RESET. `currentPeriodStart` is derived
   from this, so on Jun 30 or Dec 31 after 8pm it flipped to the next period a
   day early — everyone's points read as zero about 28 hours before they
   should, and a counseling filed in that window counted against the person
   for an extra six months. en-CA formats the DEVICE's date as YYYY-MM-DD; the
   store's devices run Eastern. */
const today = () => new Date().toLocaleDateString("en-CA");

/* ── THE SIX-MONTH RESET ────────────────────────────────────────────────
   Hannah, Jul 26 2026: "Points will reset every six months (July 1 and
   January 1)." Note this is a FIXED CALENDAR reset, not a rolling window —
   her written policy says "any rolling 6 month period" and her ruling
   overrides it. Everyone zeroes together on 1 Jan and 1 Jul.

   And, asked what happens to the records: "I would like for all
   documentation, counselings, etc to archive in the employee file after the
   6 month reset." So the reset zeroes the BALANCE, never the file. Every
   entry stays visible and searchable forever; it simply stops counting.

   ⚠️ An entry with no date is treated as OUTSIDE the current period. That is
   the deliberate direction: a dateless legacy record wrongly INCLUDED could
   push someone toward a suspension they never earned, while one wrongly
   excluded is visible in the file and correctable by hand. Under-count, never
   over-count, when the consequence is somebody's job. */
const periodStartFor = (iso) => {
  const y = (iso || today()).slice(0, 4);
  const m = Number((iso || today()).slice(5, 7)) || 1;
  return y + (m >= 7 ? "-07-01" : "-01-01");
};
const currentPeriodStart = () => periodStartFor(today());
const inCurrentPeriod = (x) => !!x && !!x.date && x.date >= currentPeriodStart();
const periodLabel = () => {
  const s = currentPeriodStart();
  const [y, m] = [s.slice(0, 4), s.slice(5, 7)];
  return (m === "07" ? "1 July " : "1 January ") + y;
};
// Members not required to sign either handbook (owner/exec — Matt, Jul 18:
// don't require Nick Matthews (37), Kyleeka Gonzalez (23)).
// Excluded from the signed/total counts, the unsigned pulse, and the status view.
// Cindy Dunning (90) was REMOVED from this list Jul 22 2026 at Hannah's request
// — she is now expected to sign like everyone else. Until she does, she counts
// as outstanding, which is correct: the Hub records signatures people actually
// give, it does not mark anyone signed on their behalf.
// Format an ISO timestamp for display; tolerant of bad/missing input.
const fmtDate = (iso) => { try { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return ""; } };
const uid = (p) => p + "_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
const ini = (n) => n.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

// Slack profile photos. The worker job `?job=slack-avatars` caches a name->URL
// map into hr:slack-avatars:v1; we only READ it here. Matching is by normalised
// name — this MUST stay byte-identical to normName() in worker.js or every
// lookup silently misses.
/* normName now comes from nameMatch.js — it was defined here as a THIRD
   byte-identical copy (this file, worker.js, nameMatch.js). Identical today,
   but a copy that drifts changes WHO MATCHES WHOM between the HR screen and
   the Slack lookups, and it would do it silently — the same failure that hid
   four unreachable trainers for weeks. One definition, three importers. */

// Slack photo if we have one for this person, else the initials tile.
// Falls back to initials if the image URL breaks, rather than leaving a hole.
function Av({ name, src, style }) {
  const [bad, setBad] = useState(false);
  if (src && !bad) return <img src={src} alt="" onError={() => setBad(true)} style={{ ...style, objectFit: "cover" }} />;
  return <div style={style}>{ini(name)}</div>;
}
/* ── PAYROLL (Cindy Dunning, Office Manager) ──
   An ACCESS CLASS, not a rung on the ladder. Payroll needs to READ every file
   (comp, hours, PTO, final checks) but was never granted a single write power.
   The ladder cannot express that: FULL_MIN, DIRECTOR_MIN, LDD_MIN, HREXEC_MIN,
   ROLE_EDIT_MIN, TPL_EDIT_MIN and ROSTER_EDIT_MIN are ALL 6, so any rank that
   opens the file also hands over edit-history, edit-roles, edit-templates and
   add/remove-people. So Payroll stays at RANK 1 and is OR'd into the three
   READ gates by name. Every write gate below is pure rankOf() and therefore
   excludes Payroll automatically — including canDocument (needs rank >= 3),
   which is why she can never author a file entry.
   NB: RANK 1 is also deliberate downstream — the Leader Scorecard imports
   rank 2-5 as its development pipeline, and Payroll is not a leader in
   development. Rank = the ladder; this predicate = the access. */
/* ═══ HR CONSOLE ACCESS IS A NAMED LIST, NOT A RANK ════════════════════════
   Hannah, Jul 28 2026 — "option 2", plus:
     "I do not want Daisy and Brandon to have access into HR console. Only me,
      Matt, Bri, Cindy, and Nick."
     "I do not want Kyleeka to see into HR console. She is leaving soon."

   ⚠️ RANK CANNOT EXPRESS EITHER OF THOSE, WHICH IS WHY THIS EXISTS.
   · Daisy and Brandon need the DIRECTOR title for their other tools, and
     Director is RANK 5 — the same number as FULL_MIN. The title she has to give
     them and the access she has forbidden are the same switch.
   · Kyleeka is an Executive Director, RANK 7. No threshold removes her without
     removing Matt and Hannah too.
   So membership is stated by name. Five people, changed deliberately.

   ⚠️ DO NOT "SIMPLIFY" THIS BACK TO A NUMBER. The next Director added to the
   roster must NOT inherit HR Console by holding a title; that is the whole
   point. Raising FULL_MIN to 6 would work today by accident and break the first
   time somebody is given a rank-6 title.
   ⚠️ NAMES **AND** ROLE, so it survives either changing: Cindy is here by name
   and also reaches her own payroll surfaces via isPayroll below.

   ★ THE LIST MOVED TO hrRoster.js (Jul 31 2026) and this file imports it.
   🐛 It lived only here, so the WORKER never had it: `hrIsFullReader` was
   rank-only and anyone titled Director passed the server gate while this UI
   showed them nothing — their token could still read every HR record through
   /api/hr-store. One definition now, keyed by name for here and by roster id
   for the Worker. Change membership in hrRoster.js and both sides move. */
const normPerson = hrNormPerson;
const inHRConsole = (u) => !!u && hrInConsole(u.name);

const isPayroll = (u) => !!u && u.role === "Payroll";
/* ⚠️ `full` NOW REQUIRES BOTH: the rank that always gated it AND membership of
   the list above. Payroll keeps its own carve-out, and Cindy is on the list too,
   so her access is unchanged either way. */
const full = (u) => !!u && inHRConsole(u) && ((RANK[effectiveRole(u)] || 0) >= FULL_MIN || isPayroll(u));

/* ── Pending pricing (Hannah, Aug 1 2026) ─────────────────────────────
   "An alert/tab with a list of pending documentations that need point
   assignments." needsPricing is the marker the filing flow already writes:
   leaders document at zero and HR prices later; hrDecides templates land
   here even when HR files them. The card in the console body surfaces
   every un-priced, un-removed entry in one place; pricing writes points,
   clears the flag, and stamps history — through the same mutFiles path
   every other edit uses. */
function PricePendingRow({ item, onPrice }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px dotted #E4E3DD", flexWrap: "wrap" }}>
      <div style={{ flex: "2 1 220px", minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#14243D" }}>
          {item.m.name} <span style={{ fontWeight: 500, color: "#6B7480" }}>· {item.f.title || item.f.area || "Documentation"} · {item.f.date || "no date"}</span>
        </div>
        <div style={{ fontSize: 12, color: "#6B7480", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.f.body || ""}</div>
        <div style={{ fontSize: 11, color: "#9B8E82" }}>filed by {item.f.by || "—"}</div>
      </div>
      <input inputMode="numeric" placeholder="pts (-2)" value={val}
        onChange={(e) => { const v = e.target.value; setVal(v); }}
        style={{ width: 74, padding: "8px 8px", borderRadius: 8, border: "1px solid #E4E3DD", fontSize: 14, textAlign: "center" }} />
      <button onClick={() => onPrice(item.m.id, item.f.id, val)}
        style={{ background: "#14243D", color: "#fff", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
        Set
      </button>
    </div>
  );
}
/* ⚠️ `effectiveRole`, not `u.role` — a person-level override (see
   accessOverrides.js) must close this the same way it closes the class editor.
   Belt and braces with the list above: Kyleeka is excluded by BOTH. */
const isHR = (u) => !!u && inHRConsole(u) && effectiveRole(u) === "Human Resources";
const rankOf = (u) => (u ? (RANK[effectiveRole(u)] || 0) : 0);
const isHRExec = (u) => rankOf(u) >= HREXEC_MIN;                    // edit/remove history
const canFullTitles = (u) => rankOf(u) >= TITLE_FULL_MIN;          // full title list — HR/Exec only
const canEditRoles = (u) => rankOf(u) >= ROLE_EDIT_MIN;             // LDD (Bri) and up
const canEditTemplates = (u) => rankOf(u) >= TPL_EDIT_MIN;          // LDD (Bri) and up
const canEditRoster = (u) => inHRConsole(u) && rankOf(u) >= ROSTER_EDIT_MIN;  // LDD (Bri) and up → add people
// Added-member ids are prefixed so they can never collide with the numeric seed
// ids, and so any future "restore the seed" logic can tell them apart on sight.
const newMemberId = () => "n_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
// Only people ADDED through this console can ever be removed. The seeded 106
// are code (RAW_TEAM) — there is nothing to delete them from, and a "delete"
// that silently fails is worse than no button.
const isAddedId = (id) => String(id).startsWith("n_");
/* ★★ MEMBERSHIP **AND** RANK, the same two-part rule `full` uses.

   🐛 THESE THREE CHECKED RANK ONLY (found Aug 4 2026), while every gate around
   them went through `full`, which is inHRConsole AND rank. hrRoster.js states
   the rule outright — "DO NOT 'SIMPLIFY' THIS BACK TO A RANK. The next Director
   added must not inherit HR Console by holding a title" — and these three were
   the places that had.
   ⇒ Kyleeka Gonzalez is an Executive Director, rank 7, and Hannah's instruction
   was explicit: "I do not want Kyleeka to see into HR console." She could add
   people to the roster, browse the terminated archive, and open any profile.
   Daisy and Brandon hold the Director title (rank 5) for their other tools and
   could open and read any file at or below their own rank — points, write-ups
   and all — which is exactly the case hrRoster.js says the list exists for.
   ⚠️ All five real HR Console people clear this unchanged: Bri, Hannah, Matt,
   Nick and Cindy are on HR_CONSOLE_PEOPLE, so nobody legitimate loses anything.
   ⚠️ The Payroll carve-out stays INSIDE the membership test rather than beside
   it. It exists for Cindy, who is on the list; letting it sit outside would
   hand every future "Payroll" the terminated archive without review. */
const isDirectorUp = (u) => inHRConsole(u) && (rankOf(u) >= DIRECTOR_MIN || isPayroll(u));  // open / override any profile
const canSeeTerminated = (u) => inHRConsole(u) && (rankOf(u) >= LDD_MIN || isPayroll(u)); // LDD and up; Payroll needs terms for final pay
// DOCUMENT — Team Leader and up, on tiers strictly BELOW them. Was full(actor),
// i.e. rank 6+, so only five people in the building could write a file entry.
/* ★ HANNAH'S RULING, Aug 7 2026, verbatim: "Allow tiers to document the same
   tier as their own."

   🐛 WHAT IT FIXES. Ben Smith DM'd Matt twice on Aug 6: "It won't let me
   document that Monica had to leave early and paola staying for us." He was not
   hitting a bug — this required the target STRICTLY below the actor, and Ben and
   Paola are both Team Leaders at rank 3. Three is not below three, so the form
   never rendered. The silent half of that was fixed the same day; this is the
   rule itself, and it needed an HR decision rather than a patch.

   ⚠️ IDENTITY IS EXCLUDED EXPLICITLY NOW, and it has to be. Same-rank passing
   means a leader would otherwise document THEMSELVES — rank 3 against rank 3 is
   true when both are you. The old `<` did that job as a side effect and can no
   longer be relied on for it.
   ⚠️ STILL BOUNDED BY DOC_MIN. This widens who a leader may document, not who
   may document at all. */

/* ★ TRAINERS SIT BELOW TEAM LEADERS FOR DOCUMENTATION (Bri, Aug 8 2026,
   answering the question directly): "Yes, Senior Trainers are below Team
   Leaders — we originally had them together for permissions purposes only
   because they have similar access needs, but in their functional role in the
   store Team Leaders are above all Trainers — and Senior Trainer and Junior
   Trainer are the same tier in regards to documentation — neither can document
   a Team Leader."

   She had already ruled it once, on Jul 28, inside her own W3 class material:
   "if documentation seems fitting, notify a leader". skillsChecklists.js says
   in as many words what the code change would be — "if she says both, DOC_MIN
   moves to Team Leader and above" — and then waited. This is that change.
   Trainers escalate. They do not file.

   ★ ACCESS RANK IS UNTOUCHED, AND THAT IS THE WHOLE DESIGN. Senior Trainer
   stays at RANK 3 beside Team Leader, because rank 3 is what gives them their
   nine tiles, the Leadership Handbook, the Daily Setup PINs, the Slack jobs
   and roleTier's tier 2. Her words: "for permissions purposes only… they have
   similar access needs". Renumbering RANK would have moved every one of those
   consumers to fix one rule. Documentation gets its own ladder instead, and
   canDocument is the ONLY thing that reads it.

   ⚠️ min(), NEVER a flat assignment. Junior Trainer is rank 1. Handing every
   trainer title a doc rank of 2 outright would RAISE a Junior Trainer and give
   them a power they have never had. This can only ever lower somebody.

   ⚠️ DELIBERATELY NOT LDR_HANDBOOK_TITLES, which today holds these same three
   strings. That one answers "who must sign the Leadership Handbook" and its
   own comment explains why a retired title is kept inside it. Pointing this at
   it would mean a future handbook edit silently rewrites who may write on 106
   people's records. Two rules, two lists, on purpose. */
const TRAINER_TITLES = new Set(["Junior Trainer", "Trainer", "Senior Trainer"]);
const TRAINER_DOC_RANK = 2;   // under Team Leader's 3, over Team Member's 1
const docRankOf = (u) =>
  TRAINER_TITLES.has(effectiveRole(u)) ? Math.min(rankOf(u), TRAINER_DOC_RANK) : rankOf(u);
/* ⚠️ THE NULL GUARDS COME FIRST NOW. They were always here, but sat AFTER a
   rankOf(actor) call that only survived a null actor because rankOf guards
   internally. Nothing about that was load-bearing and it reads as a trap. */
const canDocument = (actor, target) =>
  !!actor && !!target && String(actor.id) !== String(target.id)
  && docRankOf(actor) >= DOC_MIN
  && docRankOf(target) <= docRankOf(actor);
// READ the file — LDD+ reads anyone's; everyone reads their OWN (PIN or their
// own profile in a leadership session). A Team Leader documenting someone gets
// canDocument true and canReadFile FALSE: they write, they don't browse.
const canReadFile = (actor, target) => full(actor) || (!!actor && !!target && actor.id === target.id);
const canOpen = (actor, target) => isDirectorUp(actor) || canDocument(actor, target); // LDD+ opens anyone
/* WHO IS DOING THIS, as one string for a stamp or a signature line.

   🐛 THIS EXISTS BECAUSE `acting` IS NULL MORE OFTEN THAN IT LOOKS (Aug 3 2026).
   Valerie opened her own file, tapped Evaluations, and the WHOLE HR Console
   died: "Cannot read properties of null (reading 'name')". EvalSection ran
   `useState(acting.name + " \u00b7 " + acting.role)` — an initialiser, so it
   fires during render, before any gate can stop it.
   ⚠️ SELF-VIEW IS NOT A LEADERSHIP SESSION. `selfView` is its own path: someone
   enters their own PIN, `isSelf` goes true, `acting` STAYS NULL. Every section
   is handed `acting` regardless, and the Evaluations tab is in SECTIONS with no
   gate at all — so this was reachable by all ~106 people, not just leaders.
   ⚠️ `leader`/`canDoc`/`canAssignEvals` all start from `acting` and are false
   when it is null, which is why the save handlers never fired and why this hid
   for so long. Only the unconditional render path was exposed.
   ⇒ Written ONE time on purpose. There were 12 hand-copied versions of this
   expression and two of them had already lost the guard while their neighbour
   on the very next line kept it. That drift IS the bug. */
const actingSig = (u, fallback = "\u2014") => (u ? u.name + " \u00b7 " + u.role : fallback);
/* ★★ `{system}` IS FILLED FROM THE STORE, AND IT IS A CLONE FIX, NOT A TIDY-UP.
   Three templates had this store's name typed into the
   BODY — not a heading, the actual sentence that gets filed onto somebody's
   permanent record. A second store running this code would have printed OUR
   store's name onto THEIR team members' write-ups, forever, and nobody would
   have noticed until a team member read one.

   Raised with Hannah and Bri on Aug 11 2026 and fixed either way, because it
   is not a policy question — no store wants another store's name on their
   disciplinary records.

   ⚠️ IT IS A PLACEHOLDER, NOT AN INTERPOLATION IN THE TEMPLATE ARRAY. TEMPLATES
   is a module-level literal, so `${STORE.name}` there would capture the name
   ONCE at module load and freeze it — the exact thing storeConfig's getters
   exist to prevent. Filling it here means the name is read at the moment a
   write-up is written.
   ⚠️ IT FALLS BACK TO A NAMELESS SENTENCE, never to "[system]". Every other
   placeholder is something a leader forgot to type, so showing the bracket is a
   prompt; this one is configuration, and a bracket in a filed record would look
   like a bug in the document that ends somebody's employment. */
/* ⚠️ A LEADING "The " IS STRIPPED, AND THIS IS NOT PEDANTRY. Every template
   reads "…in the {system}…", so a store called "The Village" filed "in the The
   Village Points Performance System" onto a permanent record. Caught by running
   the fill with a second store's name rather than only with ours — which is the
   whole point of testing a clone fix as a clone. "Gate City" is unaffected. */
const systemName = () => {
  const n = String((STORE && STORE.name) || "").trim().replace(/^the\s+/i, "");
  return n ? `${n} Points Performance System` : "Points Performance System";
};
const fill = (body, f) => body.replace(/\{(\w+)\}/g, (_, k) => {
  if (k === "system") return systemName();
  return f[k] && String(f[k]).trim() ? f[k] : "[" + k + "]";
});
// Overall rating is derived, never typed: the mean of whatever category scores
// have been given, to one decimal. Returns 0 when nothing is scored yet.
// NB the mean is of RAW scores — see tplMax(): on a template that mixes scales
// this number has no honest denominator, which is why callers stop printing one.
const avgOverall = (ratings) => {
  const vals = Object.values(ratings || {}).map(Number).filter((n) => n > 0);
  if (!vals.length) return 0;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
};


/* ★ ERROR BOUNDARY. A crash in this tile used to paint a WHITE SCREEN with
   nothing to act on, so every diagnosis was a guess — exactly what cost hours
   on Leadership 101 before it got one. Now the message and stack are on screen
   and screenshottable. Keep it. */
class HRBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error("HRConsole crashed:", err, info); }
  render() {
    if (!this.state.err) return this.props.children;
    const e = this.state.err;
    return (
      <div style={{ padding: 20, font: "15px -apple-system, system-ui, sans-serif" }}>
        <div style={{ border: "1px solid #FECACA", background: "#FEF2F2", borderRadius: 14, padding: 18 }}>
          <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>HR Console hit an error</div>
          <div style={{ color: "#374151", marginBottom: 12 }}>
            Nothing you did — the page failed to load. Screenshot this and send it to Matt; it says exactly what went wrong.
          </div>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#fff",
            border: "1px solid #FCA5A5", borderRadius: 10, padding: 12, fontSize: 12, margin: 0 }}>
            {String((e && e.message) || e)}{"\n\n"}{String((e && e.stack) || "").slice(0, 900)}
          </pre>
        </div>
      </div>
    );
  }
}

/* ---------- root component (register this as a Hub tile) ---------- */
/* `launchers` — Onboarding Link and Orientation used to be their own tiles on
   the landing grid. Hannah, Jul 30 2026: put them inside HR Console. They are
   handed IN as ready-made elements rather than imported here, and that is
   deliberate: NewHireOrientation.jsx imports loadHRTeam FROM this file, so a static
   import back the other way is a cycle, which shows up as "Cannot access 'X'
   before initialization" and a blank Hub. App.jsx also still owns the access
   decision — it filters the list with canUseTool before passing it, so there is
   one access rule, not two that can drift apart. */
export default function HRConsoleTile({ launchers = [] }) {
  return <HRBoundary><HRConsole launchers={launchers} /></HRBoundary>;
}

function HRConsole({ launchers = [] }) {
  /* 🐛 AN EXPIRED SIGN-IN USED TO RENDER AS "THERE IS NOTHING HERE".
     Bri, Jul 29 2026: "Our evaluations have disappeared from view, please find
     the issues and restore all of the evaluations that were in files." All 25
     were in the database, untouched. Her 12-hour session had lapsed, every
     protected read 401'd, and this console drew empty lists with nothing
     anywhere saying why.
     ⚠️ THE COST WAS NOT CONFUSION, IT WAS THE NEXT ACTION. She asked for
     evaluations to be RESTORED — a real, expensive, alarming thing to go and do
     about data that was never lost. Silence about an auth state is what sent
     her there. */
  const [sessionExpired, setSessionExpired] = useState(() => hrSessionExpired());
  useEffect(() => {
    const dead = () => setSessionExpired(true);
    const alive = () => setSessionExpired(false);
    window.addEventListener("hub:session-expired", dead);
    window.addEventListener("hub:session-restored", alive);
    return () => {
      window.removeEventListener("hub:session-expired", dead);
      window.removeEventListener("hub:session-restored", alive);
    };
  }, []);

  const [status, mutStatus, locStatus, statusLoaded] = usePersisted("gcfcr-hr-status", {});
  /* id → true for anyone who HAS a personal PIN. Never the PIN itself. */
  const [pinSet, setPinSet] = useState({});
  const [info, mutInfo, locInfo, infoLoaded] = usePersisted("gcfcr-hr-info", {});
  const [files, mutFiles, locFiles] = usePersisted("gcfcr-hr-files", {});
  const [docFiles, mutDocFiles, locDocFiles, docFilesLoaded] = usePersisted("gcfcr-hr-docfiles-v1", {});
  // ★ CFA Home logins, keyed by roster id. ⚠️ `usePersisted`'s mutate takes a
  // FUNCTION, never a value — that mistake broke Discard and the drivers Add
  // button in one week. See the setter note above.
  const [cfaHome, mutCfaHome] = usePersisted(CFAHOME_KEY, {});
  const [evalTasks, mutEvalTasks, locEvalTasks] = usePersisted(EVAL_TASK_KEY, []);
  const [evalCopy, mutEvalCopy, locEvalCopy] = usePersisted(EVAL_COPY_KEY, EVAL_COPY_DEFAULT);
  const [teamDir, setTeamDir] = useState(null);   // Bri's teams, for group assignment
  const [evals, mutEvals, locEvals, evalsLoaded] = usePersisted("gcfcr-hr-evals", {});
  const [injuries, mutInjuries, locInjuries] = usePersisted("gcfcr-hr-injuries", {});
  /* Leadership Standards — negative leadership points (Hannah + Bri, Aug 3
     2026). Keyed by member id, newest first, exactly like injuries. Separate
     from `files` on purpose: this is the LEADERSHIP layer and must never mix
     with the team member points system, which is a different ladder with
     different consequences. */
  const [ldrPts, mutLdrPts, locLdrPts] = usePersisted("gcfcr-hr-leadership-v1", {});
  const [handbook, mutHandbook, locHandbook] = usePersisted("gcfcr-hr-handbook", { version: { n: 1, label: "Initial Handbook", date: "2026-05-12" }, acks: {}, conf: {} });
  // Leadership Handbook — moved here from Team Documentation so both handbooks
  // live and sign the same way, right next to the Team Handbook above.
  const [ldrHandbook, mutLdrHandbook, locLdrHandbook] = usePersisted("gcfcr-hr-ldrhandbook", { version: { n: 1, label: "Initial Leadership Handbook", date: "2026-07-07" }, acks: {} });
  const [roles, mutRoles, locRoles] = usePersisted("gcfcr-hr-roles", {});
  /* Preferred names — { "<roster id>": "Lupe" }. Matt, Aug 7 2026: "Should we
     add a preferred name or nickname spot to avoid confusion" → "seen
     everywhere". Merged into the roster by hrTeam.loadHRTeamResult, so setting
     one here changes every screen at once rather than just this console.
     ⚠️ A MAP, NOT A FIELD ON THE ROSTER ROW, because 106 of these people are
     the TEAM seed in source and there is no edit path to a seeded record. Same
     shape gcfcr-hr-roles above already uses to override a seeded title, and it
     rides the same hook, so it inherits the failed-read guard that stops an
     empty map being written back over the real one. */
  const [prefNames, mutPrefNames] = usePersisted("gcfcr-hr-preferred-v1", {});
  /* ★ CASH SHORTAGES WAITING TO BE FILED (Hannah, Aug 10 2026: "Yes, I want the
     leader to document the shortages as a file entry in HR console").
     Cash Audit writes this queue when a leader logs a shortage of $5 or more;
     nothing in that tile writes to anybody's file. This is the other half: the
     worklist that brings her here to file it herself.
     ⚠️ A WORKLIST, NOT A RECORD. Nothing in this list is on anyone's file until
     Hannah puts it there through the normal documentation flow. That is the
     whole reason it has its own key instead of landing in gcfcr-hr-files.
     ⚠️ Rides usePersisted for its failed-read guard: a dropped read must never
     let the next write replace a real queue with []. */
  const [cashDocs, mutCashDocs] = usePersisted("gcfcr-hr-cashdocs-v1", []);
  /* Blank REMOVES the entry rather than storing "". A map full of empty strings
     is a slow leak that every reader then has to guard against. */
  const updPreferred = (e, v) => mutPrefNames((p) => {
    const next = { ...(p || {}) };
    const val = String(v || "").trim();
    if (val) next[String(e.id)] = val;
    else delete next[String(e.id)];
    return next;
  });
  // Evaluation templates. The mutator used to be DISCARDED here (`[v, , loc]`) —
  // this console could only ever read them, which is why the editor had to live
  // in Team Documentation, which wrote to a different store, which is why this
  // console never saw a single one. Editor is now HERE and this writes kvSet.
  const [evalTemplates, mutEvalTpl, locEvalTpl] = usePersisted("gcfcr-hr-evaltpl-v1", null);
  // Roster ADDITIONS. The seed (RAW_TEAM) is code; anyone hired since lives
  // here. Append-only from the UI — there is no "replace the roster" path, on
  // purpose: every other record in this console is keyed by member id, so
  // dropping a person from the roster orphans their file, their evals and their
  // handbook signature while leaving all of it in the store. See the Team Docs
  // reseed bug from earlier today for what that looks like in practice.
  const [added, mutAdded, locAdded, addedLoaded] = usePersisted(ROSTER_ADD_KEY, []);

  // SOP catalog — Hannah, July 18: "place the documents in the HR console before
  // removing the Team Docs tile." This is Team Documentation's Docs tab catalog,
  // read here so the SOP Drive links keep a home in the Hub once that tile is
  // cut. READ-ONLY on purpose: the mutator is discarded, so nothing in this
  // console can write or clobber the catalog — authoring still happens in the
  // Docs tab until it's retired. Same key the Docs tab writes; if this ever
  // renders empty against a catalog that has documents, THAT is the proof the
  // key is cross-store, and the fix is a one-time migration panel in Team Docs
  // (mirroring the evals/write-ups ones) — do not point this at window.storage.
  // ⚠️ Was `const [sopDocs]` — the setter usePersisted already returns was
  // simply never taken, so the catalog was read-only by omission rather than by
  // design. The on-screen copy still told people to author documents in Team
  // Documentation, which was retired on 18 July: there was no route to add a
  // document at all, which is why the Point Performance System could not be
  // sent through the Hub.
  const [sopDocs, mutSopDocs] = usePersisted("gcfcr-hr-docs-v1", []);

  // Document SENDS — send an SOP doc to an audience and track acknowledgment.
  // Matt, July 18: parity with Team Docs' send flow, ADAPTED to HR Console's
  // model — the target self-signs in their own PIN-gated file (like a handbook),
  // NOT a leader typing their name. Fresh key (not TeamDocs' gcfcr-hr-sends-v1,
  // whose records reference Team Docs member ids that don't resolve here).
  const [sends, mutSends, locSends] = usePersisted("gcfcr-hr-docsends-v1", []);

  useEffect(() => {
    let alive = true;
    const iv = setInterval(async () => {
      const all = await loadAll();
      if (!alive || !all) return;
      const put = (k, setter) => { if (k in all) setter((prev) => JSON.stringify(prev) === JSON.stringify(all[k]) ? prev : all[k]); };
      put("gcfcr-hr-status", locStatus); put("gcfcr-hr-info", locInfo); put("gcfcr-hr-files", locFiles);
      put("gcfcr-hr-evals", locEvals); put("gcfcr-hr-injuries", locInjuries); put("gcfcr-hr-handbook", locHandbook); put("gcfcr-hr-roles", locRoles);
      put("gcfcr-hr-leadership-v1", locLdrPts);
      put("gcfcr-hr-evaltpl-v1", locEvalTpl); put("gcfcr-hr-ldrhandbook", locLdrHandbook); put(ROSTER_ADD_KEY, locAdded); put("gcfcr-hr-docfiles-v1", locDocFiles); put(EVAL_TASK_KEY, locEvalTasks); put(EVAL_COPY_KEY, locEvalCopy);
    }, 20000);
    return () => { alive = false; clearInterval(iv); };
  }, []);
  // THE LIVE ROSTER — seed plus everyone hired since. Everything below that
  // counts, lists, or looks up a person must use this, never bare TEAM.
  const ROSTER = added && added.length ? [...TEAM, ...added] : TEAM;
  // ── Publish store-level HR metrics to the EOS scorecard feed ──
  // EOSTile reads eos:scorecard:2026-Q3 and merges these over its seeds, so

  const [tab, setTab] = useState("current");
  const [q, setQ] = useState("");
  // Leadership sign-in persists across remounts/navigation (localStorage), the
  // same way the Hub's own tier sign-in already does — so a Director doesn't
  // have to re-authenticate every time they view another file.
  const ACTING_KEY = "gcfcr-hrconsole-acting-v1";
  const [acting, setActingState] = useState(() => {
    try { return JSON.parse(localStorage.getItem(ACTING_KEY)) || null; } catch { return null; }
  });
  const setActing = (person) => {
    setActingState(person);
    try { if (person) localStorage.setItem(ACTING_KEY, JSON.stringify(person)); else localStorage.removeItem(ACTING_KEY); } catch {}
  };
  const [sel, setSel] = useState(null);
  const [selfView, setSelfView] = useState(false);

  /* ═══ MOVE ANY ALREADY-STORED EMAIL OFF THE PUBLIC ROSTER ROW ═══════════
     The writers above no longer put an email on a roster row, but records
     added before Aug 7 2026 still carry one, and `gcfcr-hr-added-v1` is served
     straight from the database on the publishable key — so those addresses are
     readable by anyone who opens the site until something moves them.

     ⚠️ IT MOVES, IT DOES NOT DELETE. The email lands in gcfcr-hr-info, which is
     on every protection list and is where HR Console reads an email from
     anyway. Nothing is lost.

     ⚠️ IT FILLS A GAP, IT NEVER OVERWRITES. If info already holds an email for
     that person, theirs wins and the roster copy is simply dropped. Yesterday's
     register bug was a fallback that overwrote a real answer instead of filling
     a hole; this is the same shape and gets the same rule.

     ⚠️ WHY THIS IS SAFE TO WRITE AUTOMATICALLY. usePersisted.mutate REFUSES on
     a failed read and tells the user, so a dropped read cannot write emptiness
     over the real map. Both keys must also report loaded, only a full HR
     session runs it, it runs once per mount, and it writes nothing at all when
     there is nothing to move.

     ⚠️ NOT A ONE-OFF KV EDIT. Matt's standing rule is that bad stored data gets
     fixed by the code that produced it, not by hand — this is that code, in the
     owner's own session, self-healing on the next open. */
  const emailMigratedRef = useRef(false);
  useEffect(() => {
    if (emailMigratedRef.current) return;
    if (!addedLoaded || !infoLoaded) return;
    if (!full(acting)) return;
    const carrying = (added || []).filter((m) => m && m.id && String(m.email || "").trim());
    if (!carrying.length) { emailMigratedRef.current = true; return; }
    emailMigratedRef.current = true;
    mutInfo((prev) => {
      const next = { ...(prev || {}) };
      carrying.forEach((m) => {
        const existing = next[m.id] && String(next[m.id].email || "").trim();
        if (existing) return;                      // theirs wins
        next[m.id] = { ...(next[m.id] || {}), email: String(m.email).trim() };
      });
      return next;
    });
    mutAdded((prev) => (prev || []).map((m) => {
      if (!m || !String(m.email || "").trim()) return m;
      const { email, ...rest } = m;
      return rest;
    }));
  }, [addedLoaded, infoLoaded, acting, added]);

  // Turnover (s5) and Evals-on-time (s6) on the L10 board are computed live
  // from the roster, term dates, and evaluations here. Read-merge-write so we
  // touch only our own two rows and never clobber rows other tools publish.
  useEffect(() => {
    const now = Date.now();
    const DAY = 86400000;
    const parse = (iso) => { const t = Date.parse(iso || ""); return Number.isNaN(t) ? null : t; };
    const isTerminated = (id) => status[id] === "terminated";
    const active = ROSTER.filter((mm) => !isTerminated(mm.id));

    // Turnover — rolling 90-day separation rate (period rate, not annualized).
    // seps = anyone terminated with a term date inside the last 90 days;
    // base = everyone employed during the window (still here + those who left).
    const TURNOVER_GOAL = storeCfg("financial.goals.turnover");
    const seps = ROSTER.filter((mm) => {
      if (!isTerminated(mm.id)) return false;
      const t = parse((info[mm.id] || {}).termDate);
      return t != null && t <= now && now - t <= 90 * DAY;
    }).length;
    const base = active.length + seps;
    const turnoverPct = base > 0 ? seps / base : null;

    // Evals completed on time — 6-MONTH cadence, per person.
    // ⚠️ THIS WAS 90 DAYS and was the ONLY place still on that clock. App.jsx's
    // dashboard badge and worker.js's 7am digest have both always used 6 months,
    // so this row answered the same question — "is this eval on time?" — with a
    // different answer, and s6 is what PUBLISHES to eos:scorecard, which the
    // dashboard's KPI grid reads. The strip and the badge disagreed on screen
    // because of this line. Matt ruled 6 months everywhere (July 17).
    //
    // Computed with setMonth(+6), NOT `182 * DAY`: 6 months is 181–184 days
    // depending on where you start, so a day constant would put this back out of
    // step with the other two by a day or three. Change one, change all three:
    // here, App.jsx's EVAL_CADENCE_MONTHS, worker.js's EVAL_CADENCE_MONTHS.
    //
    // On time = the person's most recent eval is within the cadence; never-
    // evaluated is measured from hire date, so a new hire has a grace period
    // until due. People with neither an eval nor a hire date can't be assessed →
    // excluded rather than counted against you.
    const EVAL_CADENCE_MONTHS = 6;
    const EVAL_GOAL = storeCfg("financial.goals.evalsOnTime");
    let onTime = 0, assessable = 0;
    active.forEach((mm) => {
      const list = evals[mm.id] || [];
      let last = null;
      list.forEach((ev) => { const t = parse(ev.date); if (t != null && (last == null || t > last)) last = t; });
      const basis = last != null ? last : parse((info[mm.id] || {}).hireDate);
      if (basis == null) return;
      assessable += 1;
      const due = new Date(basis);
      due.setMonth(due.getMonth() + EVAL_CADENCE_MONTHS);
      if (due.getTime() >= now) onTime += 1;
    });
    const evalPct = assessable > 0 ? onTime / assessable : null;

    /* 🐛🐛 A STARVED READ WAS BEING PUBLISHED AS A COMPANY METRIC (Jul 28 2026).
       Matt: "a while ago turnover was red and the health was red but now it's
       not." It had gone to 0.0% and green while ELEVEN people sat terminated
       with July term dates — two of them dated that same day.

       CAUSE: `termDate` lives in `gcfcr-hr-info`, which is on the worker's
       HR_OWN_ROW_ONLY list. A viewer who cannot see everyone's rows gets `{}`,
       so every `parse(termDate)` returns null, `seps` is 0, and turnover
       computes as a clean 0.0% — the BEST possible score. It then read-merge-
       WROTE that to `eos:scorecard`, which the dashboard shows to everyone, and
       Company Health inherited it and went green too.

       ⚠️ THE DANGEROUS PART IS NOT THE ZERO, IT IS THE PUBLISH. A filtered read
       is a local view; writing it to a shared key turns one person's partial
       data into the whole store's number, and 0% turnover is indistinguishable
       from perfect performance.

       ⚠️ TWO GUARDS, AND THE SECOND IS THE ONE THAT MATTERS.
       1. Only a full reader publishes at all — a Team Leader opening this page
          must never rewrite the company scorecard.
       2. SELF-VALIDATION: `status` is NOT filtered, so we always know how many
          people are terminated. If anyone is terminated and we can see ZERO
          term dates, our view of `info` is incomplete by definition — publish
          nothing rather than a number we can prove is wrong.
       ⚠️ Do NOT relax guard 2 to "publish anyway if it looks fine". The failure
       mode it catches is silent and reads as good news. */
    /* 🐛🐛🐛 AND IT PUBLISHED 0.0% AGAIN THE NEXT MORNING (07:23, Jul 29 2026),
       with both guards above present in the source. They were not wrong. There
       was a THIRD hole, upstream of both.

       CAUSE — A MOUNT RACE, NOT A PERMISSION PROBLEM.
       `status`, `info` and `evals` all come from `usePersisted`, which starts at
       `{}` and fills in asynchronously. `acting` does NOT: it is restored from
       localStorage synchronously in a useState initializer, so a signed-in
       director is already `full()` on the very first render. That first pass
       runs with EVERY map still empty, and every guard reads clean:
         seps = 0                              (no term dates yet)
         terminatedCount = 0                   (no statuses yet)
         infoStarved = 0 > 0 && ... = FALSE    (guard 2 sees nothing wrong)
         turnoverPct = 0 / 106 = 0             (not null, so it publishes)
       ⇒ "0.0%", hit: true, written to the shared scorecard before a single byte
       of HR data has come back. Milliseconds later the real data arrives and the
       effect re-runs with the true 8.3% — but only if the page stays open long
       enough. Open the console and navigate away and the zero is what sticks.

       ⚠️ GUARD 2 CANNOT CATCH THIS AND NO AMOUNT OF TUNING WILL MAKE IT.
       Self-validation compares two maps against each other. Here BOTH are empty,
       so they agree perfectly. "Nobody is terminated" and "the roster has not
       loaded" are the same `{}` — the distinction does not exist in the value,
       only in whether the fetch has returned. That is what `loaded` is for.

       ⚠️ EMPTY IS NOT A READING. Do not replace this with a length check on the
       maps; an empty map is a legitimate state and the bug is not emptiness, it
       is not-yet-known. And do not move this test after the async read — the
       write is what has to be prevented, not the arithmetic.
       ⚠️ `evals` is gated too even though only s6 uses it: an un-fetched evals
       map makes everyone unassessable, which shrinks the denominator instead of
       zeroing the number, so it fails even quieter than turnover does. */
    const feedsLoaded = statusLoaded && infoLoaded && evalsLoaded;
    const terminatedCount = ROSTER.filter((mm) => isTerminated(mm.id)).length;
    const infoStarved = terminatedCount > 0 && seps === 0;
    const mayPublish = feedsLoaded && full(acting) && !infoStarved;

    /* ★ STAMP WHEN IT WAS PUBLISHED (Aug 4 2026).
       The three guards above are about whether a number is SAFE to publish, and
       they work. What none of them covers is what happens when they correctly
       refuse: the last good value just sits on the shared scorecard, and nothing
       on any screen says how old it is. A blocked publish is invisible.

       Sales, food cost and labor already stamp this — s1, s2 and s3 all carry
       `at`, and food carries `stale` as well. Turnover and evals never did, so
       they were the two rows that could be weeks stale while reading as current.

       ⚠️ THE STAMP IS NOT A GUARD AND MUST NOT BECOME ONE. It records when a
       publish happened. It never decides whether one may. Putting a time test
       into `mayPublish` would be a fourth reason to withhold a number, and the
       failure this fixes is the opposite one: a number that is shown with too
       much confidence, not one that is withheld.
       ⚠️ ISO, same shape as FCRPage writes, so one reader handles all of them. */
    const publishedAt = new Date().toISOString();

    const rows = {};
    /* ⚠️⚠️ THE GOAL LABEL IS DERIVED FROM THE GOAL NOW, NOT TYPED BESIDE IT.
       These two rows used to read `goal: "≤ 8%"` and `goal: "≥ 90%"` as literal
       strings while `hit` compared against the constants — so the label and the
       test were two separate opinions about one number. Harmless while both
       said 8, and a live wrong answer the moment a store sets a different goal:
       the EOS board would print "≤ 8%" next to a row graded at 10%, and the
       number it printed would be the one nobody could act on.
       ⚠️ `+(g*100).toFixed(1)` NOT `g*100` — floating point turns some goals
       into 8.000000000000002, and that would publish onto the board verbatim.
       The trailing .0 is dropped by the unary plus, so 0.08 stays exactly
       "≤ 8%" and 0.075 reads "≤ 7.5%". */
    const pctLabel = (g) => `${+(g * 100).toFixed(1)}%`;
    if (mayPublish && turnoverPct != null) rows.s5 = { at: publishedAt, actual: `${(turnoverPct * 100).toFixed(1)}%`, goal: `≤ ${pctLabel(TURNOVER_GOAL)}`, hit: turnoverPct <= TURNOVER_GOAL };
    /* ⚠️ s6 IS EXPOSED THE SAME WAY — it reads `evals` AND `hireDate` from
       `info`, both filtered. A starved read makes everyone "unassessable",
       which silently shrinks the denominator instead of zeroing the number, so
       it fails quieter and is worse. Same gate. */
    if (mayPublish && evalPct != null) rows.s6 = { at: publishedAt, actual: `${Math.round(evalPct * 100)}%`, goal: `≥ ${pctLabel(EVAL_GOAL)}`, hit: evalPct >= EVAL_GOAL };
    if (!Object.keys(rows).length) return;

    let cancelled = false;
    (async () => {
      try {
        const period = `eos:scorecard:${eosPeriod()}`; // derived — one key for read+write
        // publishSharedRows (store.js): a FAILED read publishes nothing,
        // instead of arriving here as {} and wiping every other tool's rows.
        // Last of the six publishers to convert — this one rode alone because
        // HRConsole is a never-in-batch file.
        if (!cancelled) await publishSharedRows(period, rows);
      } catch { /* best-effort feed */ }
    })();
    return () => { cancelled = true; };
    /* ⚠️ THE LOADED FLAGS MUST BE IN THIS DEP ARRAY. When a key resolves to a
     VALUE the map identity changes and that alone re-runs the effect — but when
     it resolves to null (key absent) the map stays the same empty object and
     only the flag flips. Without them listed, that case would gate the publish
     off forever and the row would silently never update again.

     🐛🐛🐛 AND `acting` MUST BE HERE TOO — IT WAS THE REASON THE ROW STAYED
     STUCK AT 0.0% EVEN AFTER THE MOUNT-RACE GUARD SHIPPED (Jul 29 2026).
     `mayPublish` calls `full(acting)`, so this effect READS `acting` — but it
     did not LISTEN for it. React only re-runs on a listed dep, so signing into
     the leadership session did not re-run the publish:
       1. Page loads. Nobody has signed into HR Console yet, acting = null.
       2. The HR maps arrive. The effect re-runs (status/info changed), finds
          full(null) === false, and correctly publishes nothing.
       3. Matt enters his PIN. `acting` becomes a director.
       4. Nothing happens. The data has already finished loading, so no listed
          dep will ever change again on this page.
     ⇒ The publish only ever fired for someone whose session was ALREADY
     restored from localStorage at mount — which is exactly the case where the
     maps were still empty and the number was 0.0%. The one path that published
     was the one that published a wrong number, and the path that would have
     published the RIGHT one was unreachable. That is why fixing the guard
     alone looked like it did nothing.
     ⚠️ The PIN effect immediately below already learned this on Jul 28 and
     lists `[acting, selfView]`. This effect reads the same value for the same
     reason and was missed. Any effect here that calls full()/acting belongs on
     that list — check the deps, not just the logic. */
  }, [status, info, evals, added, statusLoaded, infoLoaded, evalsLoaded, acting]);

  /* 🐛 RE-READ ON SIGN-IN, NOT ONCE AT MOUNT (Jul 28 2026).
     `gcfcr-hr-pins` is on the worker's own-row-only list, so what comes back
     depends on WHO IS ASKING — and the answer is decided by the Hub token.
     Mounting happens before anyone has signed into the leadership session, so
     this used to fetch as an unidentified caller, get `{}` back, and keep that
     empty map for the life of the page.
     ⇒ Everyone showed "No PIN yet", including on Matt's full-access view of a
     person whose PIN plainly exists. It reads as missing data rather than an
     auth state, which is why it took a day to spot.
     ⚠️ THE DEPENDENCY IS THE POINT. `acting` changing means a leadership
     session started or ended; `selfView` changing means somebody entered their
     own PIN. Both change who the worker thinks we are, so both must re-ask.
     ⚠️ Do NOT "optimise" this back to a mount-only read. Any key on
     HR_OWN_ROW_ONLY has the same property, and a stale pre-auth answer is
     indistinguishable from real absence. */
  useEffect(() => {
    let alive = true;
    readPinSet().then((m) => { if (alive) setPinSet(m); });
    return () => { alive = false; };
  }, [acting, selfView]);
  const [view, setView] = useState("dir");
  const [pinFor, setPinFor] = useState(null);
  const [pinVal, setPinVal] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [signIn, setSignIn] = useState(false);
  const [showPush, setShowPush] = useState(false);
  const [showPushLdr, setShowPushLdr] = useState(false);
  const [draft, setDraft] = useState(null);

  const statusOf = (id) => status[id] || "current";
  /* `pinOf` is DELETED, not reimplemented — it returned an actual PIN, and every
     caller was either a client-side comparison or a display. Both are now
     impossible by construction rather than by discipline. */
  const hasPin = (id) => !!pinSet[id];
  const infoOf = (e) => info[e.id] || { email: e.email || "", hireDate: "", termDate: "" };

  /* Addresses the mail provider refuses to deliver to. `null` is the starting
     value AND the failure value on purpose: both mean "not known", and the
     panel renders nothing for either. Only a real answer can put a warning on
     screen, so a provider outage can never read as a clean bill. */
  const [blockedMap, setBlockedMap] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/email-blocked", { headers: { "x-hub-token": hubToken() } });
        const d = await r.json().catch(() => null);
        if (!alive) return;
        /* Forbidden, signed out, provider down and a changed response all land
           here and all leave it null. Nothing is shown and nothing is claimed. */
        if (d && d.ok && d.blocked && typeof d.blocked === "object") setBlockedMap(d.blocked);
      } catch { /* stays null */ }
    })();
    return () => { alive = false; };
  }, []);
  // Removed entries are SOFT-deleted — kept in the record for the audit trail
  // (see `history` below), so they must not keep counting against a total.
  // Hannah's Points Performance System, verbatim: "You cannot get a point value
  // over zero." Recovery points bring someone back TOWARD zero and stop there —
  // nobody banks credit against a future infraction. The clamp lives here, on
  // the balance, rather than on the entry: the +1 stays truthful in the file and
  // in its own history, it just cannot push the ledger positive.
  // Balance = current period only (see periodStartFor). Removed entries and
  // anything filed before the last reset still render in the file; they just
  // stop counting. The Math.min(0, …) is Hannah's ceiling — recovery points
  // bring someone back toward zero and stop there.
  const total = (id) => Math.min(0, (files[id] || []).reduce((s, f) => s + ((f.removed || !inCurrentPeriod(f)) ? 0 : (Number(f.points) || 0)), 0));
  const roleOf = (m) => roles[m.id] || m.role;
  const TEAM_EFF = ROSTER.map((m) => ({ ...m, role: roleOf(m) }));
  /* Every un-priced, un-removed entry across every file, oldest first —
     Hannah's pending-points queue. See PricePendingRow above.
     ⚠️ MUST stay BELOW TEAM_EFF. It reads TEAM_EFF during render, and when it
     sat above the declaration the bare const hit the temporal dead zone and
     crashed the whole console ("Cannot access 'TEAM_EFF' before
     initialization") — live, Aug 1 2026. The tdz check only inspects hooks,
     so ordering a plain render-body const is on us, not the checker. */
  const pendingPricing = TEAM_EFF.flatMap((m) =>
    (files[m.id] || [])
      .filter((f) => f && f.needsPricing && !f.removed)
      .map((f) => ({ m, f }))
  ).sort((a, b) => String(a.f.date || "").localeCompare(String(b.f.date || "")));
  const priceEntry = (memberId, entryId, rawPoints) => {
    const n = Number(String(rawPoints).trim());
    if (String(rawPoints).trim() === "" || !Number.isFinite(n)) {
      window.alert("Enter the points number first — 0 or negative, like -2. Zero is a real answer; it clears the entry from the list.");
      return;
    }
    const pstamp = { at: new Date().toISOString(), by: actingSig(acting), action: "priced", note: `points set to ${n}` };
    mutFiles((p) => ({
      ...p,
      [memberId]: (p[memberId] || []).map((x) => (x.id === entryId ? { ...x, points: n, needsPricing: false, history: [...(x.history || []), pstamp] } : x)),
    }), memberId);
  };
  /* Append-only. A duplicate name is REFUSED here rather than in the form.
     ⚠️ THE REASON THIS COMMENT USED TO GIVE IS OUT OF DATE — it cited
     `hrIdFor()` in Team Docs, and Team Docs was retired into this console on
     Jul 18; that function no longer exists anywhere. Corrected Jul 28 2026
     because a stale justification is how a live safety guard gets removed by
     someone who checks the reason and finds it obsolete.
     ★ THE GUARD IS STILL LOAD-BEARING. Two people sharing a name would
     collide in the paths that genuinely cannot use an id:
       · `avatarFor(nm)` reads `hr:slack-avatars:v1`, which is keyed by
         NORMALISED NAME — there is no id in that map;
       · the CFA Home paste import matches Bri's pasted spreadsheet rows to
         the roster by name, because a pasted row carries no id.
     Both would silently pick whichever record sorted first. Until those two
     are id-keyed, this refusal is what keeps them honest. */
  const addMember = (m) => {
    const clash = TEAM_EFF.some((x) => x.name.trim().toLowerCase() === m.name.trim().toLowerCase());
    if (clash) return { ok: false, err: "Someone with that name is already on the roster." };
    // The created row is returned so callers that need the new id (the intake
    // create-file path) use THIS exact record — one shape, one writer.
    /* ⚠️⚠️ NO EMAIL ON THE ROSTER ROW (Aug 7 2026 sweep, critical).
       `gcfcr-hr-added-v1` is NOT on the read-protection lists, so it is served
       straight from the database on the publishable key that ships in the
       browser bundle — anyone who opens gatecityhub.com can read it. Name and
       role are already public (the seeded 106 are compiled into hrTeam.js), so
       the email was the one field that leaked something new, plus addedBy
       naming who does the hiring.
       ⚠️ IT COULD NOT SIMPLY BE PUT BEHIND A TOKEN. loadHRTeamResult() runs in
       the SAME Promise.all as /api/pin-verify (App.jsx:2116), before a token
       exists, so protecting the key 401s during sign-in and drops back to the
       built-in seed — and anyone hired since the seed could not sign in.
       ★ SO THE EMAIL MOVES rather than disappears: gcfcr-hr-info is already on
       every protection list and is where HR Console reads an email from anyway.
       Nothing is lost and nothing outside this file ever read the roster row's
       email — verified by grep before the change. */
    const email = (m.email || "").trim();
    const row = {
      id: newMemberId(), name: m.name.trim(), role: m.role,
      addedAt: new Date().toISOString(), addedBy: actingSig(acting),
    };
    mutAdded((p) => [...(p || []), row]);
    /* ⚠️ THE CLAIM CODE RIDES ALONG WITH THE EMAIL, IN gcfcr-hr-info, AND NOT
       IN A NEW KEY. Every reason the email lives here applies to it word for
       word: hr-info is already on every read-protection list, and this writer
       is already a per-member merge. A new key would have meant adding it to
       three separate protection lists and getting all three right.
       ⚠️ IT IS COMPUTED BY THE CALLER, ALREADY HASHED. Hashing is async and
       this function is sync and returns its row to callers that need the new
       id. Passing the finished record in keeps that contract intact — and it
       means the raw phone number never enters this file at all. See
       claimCode.js.
       ⚠️ ADDING SOMEONE MINTS THEIR CODE AT THE SAME MOMENT, which is the
       "don't let it go stale when people are added" half. Someone hired next
       month gets a code the same way the first hundred did, with no re-import. */
    const claim = m.claim && typeof m.claim === "object" ? m.claim : null;
    if (email || claim) {
      mutInfo((p) => ({
        ...p,
        [row.id]: {
          ...(p[row.id] || {}),
          ...(email ? { email } : {}),
          ...(claim ? { claim } : {}),
        },
      }));
    }
    return { ok: true, member: { ...row, email } };
  };
  // Bulk version for the Team Docs import — one write, same name guard.
  const addMembers = (rows) => {
    const have = new Set(TEAM_EFF.map((x) => x.name.trim().toLowerCase()));
    const fresh = [];
    const emails = {};   // id → email, written to gcfcr-hr-info, never to the roster
    const claims = {};   // id → hashed claim code, same key, same reason
    rows.forEach((r) => {
      const k = (r.name || "").trim().toLowerCase();
      if (!k || have.has(k)) return;
      have.add(k);
      /* Same rule as addMember above: the email goes to gcfcr-hr-info, which
         is protected, never onto the world-readable roster row. */
      const id = newMemberId();
      const em = (r.email || "").trim();
      if (em) emails[id] = em;
      /* Already hashed by the import panel — the raw number never gets here. */
      if (r.claim && typeof r.claim === "object") claims[id] = r.claim;
      fresh.push({
        id, name: r.name.trim(), role: r.role || "Team Member",
        addedAt: new Date().toISOString(), addedBy: actingSig(acting),
        // Provenance only, nothing reads it. Defaulted so the Team Docs panel,
        // which passes no such field, keeps stamping exactly what it always has.
        importedFrom: r.importedFrom || "teamdocs",
      });
    });
    if (fresh.length) mutAdded((p) => [...(p || []), ...fresh]);
    if (Object.keys(emails).length || Object.keys(claims).length) {
      mutInfo((p) => {
        const next = { ...p };
        Object.entries(emails).forEach(([id, em]) => { next[id] = { ...(next[id] || {}), email: em }; });
        Object.entries(claims).forEach(([id, c]) => { next[id] = { ...(next[id] || {}), claim: c }; });
        return next;
      });
    }
    return fresh.length;
  };

  // Terminated roster is visible to LDD and up ONLY
  const showTerm = canSeeTerminated(acting);
  // Read-only by construction (mutator discarded) — the worker owns this key.
  const [slackAvatars] = usePersisted("hr:slack-avatars:v1", {});
  const avatarFor = (nm) => ((slackAvatars && slackAvatars.byName) ? slackAvatars.byName[normName(nm)] : "") || "";
  const docPendingCount = Object.values(docFiles || {}).reduce((n, arr) => n + (arr || []).filter((d) => d.status === "pending").length, 0);
  // ⚠️ Guarded: a failed read leaves this at its initial [], and a stored value
  // written by an older shape must not be assumed to be an array either.
  const cashDocsOpen = (Array.isArray(cashDocs) ? cashDocs : []).filter((d) => d && d.status === "pending");
  // Onboarding intake: unmatched ID uploads from the login-less onboarding page.
  // Rows live in the `submissions` table (tool="onboarding-intake"); a KV set of
  // handled ids tracks which ones Hannah has already filed to a person.
  const [drivers, setDrivers] = usePersisted(DRIVERS_KEY, []);
  const [intakeRows, setIntakeRows] = useState([]);
  const [intakeHandled, setIntakeHandled] = usePersisted("gcfcr-hr-intake-handled-v1", []);
  const loadIntake = React.useCallback(async () => {
    try { setIntakeRows((await listSubmissions("onboarding-intake", 100)) || []); } catch { setIntakeRows([]); }
  }, []);
  useEffect(() => { loadIntake(); }, [loadIntake]);
  const handledSet = new Set(intakeHandled || []);
  const openIntake = (intakeRows || []).filter((r) => !handledSet.has(r.id));
  const intakeCount = openIntake.length;

  /* ★ UNIFORM ORDERS LAND WITH HANNAH (Bri asked for them to route here; Hannah
     chose the shape: "I don't want to be pinged. Put an amber tab at the top of
     HR console like the documentation tab").

     No Slack message and no push. She sees it when she is already in here doing
     HR, and it says nothing when nothing is waiting — which is the one thing
     neither of the notification options I offered her could honestly claim.

     ⚠️ FULFILLED IS A MARK, NOT A DELETE. Same shape as intakeHandled above and
     for the same reason: an order that drops off the list is still in the
     submissions log, so a mis-tap loses nothing and the record of what somebody
     ordered survives being ticked off.

     ⚠️ THE COUNT COUNTS ONLY WHAT IS WAITING ON HER. A tab reading 4 when two
     are already done is a tab she stops believing, and then it may as well not
     be there. */
  const [uniformRows, setUniformRows] = useState([]);
  const [uniformDone, setUniformDone] = usePersisted("gcfcr-hr-uniform-done-v1", []);
  const loadUniform = React.useCallback(async () => {
    try { setUniformRows((await listSubmissions("uniform-order", 200)) || []); } catch { setUniformRows([]); }
  }, []);
  useEffect(() => { loadUniform(); }, [loadUniform]);
  const uniformDoneSet = new Set(uniformDone || []);
  const openUniform = (uniformRows || []).filter((r) => !uniformDoneSet.has(r.id));
  const uniformCount = openUniform.length;
  /* Every open order added up. `payload` is whatever the form filed, so the
     subtotal is read defensively rather than assumed — an older record, or one
     from a future version of the form, must not make this throw or read as 0. */
  const uniformTotal = openUniform.reduce((sum, r) => {
    const v = Number(r && r.payload && r.payload.subtotal);
    return Number.isFinite(v) ? sum + v : sum;
  }, 0);
  const driverList = Array.isArray(drivers) ? drivers : [];
  const driversExpiredCount = driverList.filter((d) => driverExpired(d, today())).length;
  // File one intake upload into a matched member's HR file (same shape as addDoc's
  // pending doc), then mark the intake handled so it drops off the queue.
  const fileIntake = (member, row, auto) => {
    const now = new Date().toISOString();
    const by = auto ? "Hub auto-match" : actingSig(acting, "HR");
    const files = ((row.payload && row.payload.files) || []);
    const entries = files.map((f, i) => ({
      id: "doc_" + Date.now() + "_" + i + "_" + Math.random().toString(36).slice(2, 6),
      category: (row.payload && row.payload.kind ? row.payload.kind : "New-hire ID") + " (onboarding)",
      fileName: f.fileName || "ID document", fileType: f.fileType || "",
      bucket: f.bucket, path: f.path,
      date: today(), uploadedBy: (row.payload && row.payload.name ? row.payload.name : row.submitted_by || "New hire") + " · onboarding",
      status: "pending",
      approvedBy: "", approvedAt: "",
      history: [{ at: row.submitted_at || now, by: "Onboarding page", action: "uploaded" }, { at: now, by, action: auto ? "matched to " + member.name + " automatically — the typed name fits exactly one roster person" : "matched to " + member.name }],
    }));
    if (!entries.length) return;
    mutDocFiles((p) => ({ ...p, [member.id]: [...entries, ...(p[member.id] || [])] }), member.id);
    setIntakeHandled((prev) => [...(prev || []), row.id]);
  };

  /* ★ CREATE THE FILE FROM THE INTAKE — Hannah's ask (Jul 31): "make an
     employee file for new hire intakes once they are completed because I
     can't upload their IDs unless they are in the dropdown box." She chose
     APPROVAL-FIRST (her "2nd option", same day): the file appears only when
     she taps this on a reviewed intake, never on submission — so a duplicate
     or a no-show never creates a phantom person.
     One tap does both halves: the roster entry goes through addMember (the
     SAME writer and shape as the Add form — its duplicate-name guard stays
     load-bearing here), then the IDs file to the new record through
     fileIntake, landing as PENDING documents so Document Review keeps the
     final say. The intake collects only a typed name, so the file starts
     with name + Team Member role; everything else fills in on her normal
     screens. */
  const createFromIntake = (row) => {
    const nm = ((row.payload && row.payload.name) || row.submitted_by || "").trim();
    if (!nm) { window.alert("This upload has no typed name, so there is nothing to create a file from. Match it from the dropdown instead."); return; }
    const res = addMember({ name: nm, role: "Team Member", email: "" });
    if (!res.ok) { window.alert(res.err + " Use the dropdown on this row to file the ID to them."); return; }
    fileIntake(res.member, row);
  };

  // Clear an intake row WITHOUT filing it to anyone — a test upload, a
  // duplicate, a wrong photo, someone who never showed. Hannah hit this on
  // Jul 23: "File to their record" was the only action, so the only way to get
  // rid of a stray upload was to put it in a real person's HR record.
  // Purge the binaries FIRST: {bucket,path} live only on this row, so once it's
  // marked handled they're unrecoverable and the file would sit in hr-files
  // orphaned. deleteDoc swallows failures and returns false, so a storage error
  // still clears the queue (image lingers, logged) instead of trapping the row.
  const discardIntake = (row) => {
    ((row.payload && row.payload.files) || []).forEach((f) => {
      if (f && f.bucket && f.path) deleteDoc(f.bucket, f.path);
    });
    setIntakeHandled((prev) => [...(prev || []), row.id]);
  };

  /* ★ AUTO-MATCH — Hannah's yes, Jul 30 2026. An intake upload whose typed
     name fits EXACTLY ONE current roster person files itself, through the
     same fileIntake path as the button, still landing as a PENDING document
     so Document Review keeps the final say. Ambiguity stays human:
       · the typed name needs two parts — a bare "Ashley" never auto-files
       · the match is whole-name equality after normName, not first-name
       · two candidates (the two-Ashleys case) means zero auto-filing
       · a hire not on the roster yet matches nobody and simply waits
     ⚠️ GATED ON docFilesLoaded. Filing sends this member's whole row
     ([...entries, ...existing]); before the load finishes, "existing" is an
     empty default and the write would ERASE their other documents. Same
     missing-looks-like-fine shape as the mayPublish gate above.
     autoTried stops a re-render from filing the same row twice while the
     handled list is still saving. */
  const autoTried = useRef(new Set());
  useEffect(() => {
    if (!docFilesLoaded || !statusLoaded || !full(acting)) return;
    for (const row of openIntake) {
      if (autoTried.current.has(row.id)) continue;
      if (!((row.payload && row.payload.files) || []).length) continue;
      const typed = normName((row.payload && row.payload.name) || row.submitted_by || "");
      if (typed.split(" ").filter(Boolean).length < 2) continue;
      const hits = TEAM_EFF.filter((m) => statusOf(m.id) !== "terminated" && normName(m.name) === typed);
      if (hits.length !== 1) continue;
      autoTried.current.add(row.id);
      fileIntake(hits[0], row, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openIntake, docFilesLoaded, statusLoaded, acting]);
  const effTab = showTerm ? tab : "current";
  const teamNames = new Set(TEAM_EFF.map((m) => m.name.toLowerCase().trim()));
  /* 🐛 THE ARCHIVE USED TO BE IMPORTED AT MODULE LEVEL, which compiled all 528
     terminated people — names, dates and the written reason on 525 of them —
     into this tile's PUBLIC chunk. HR Console is tier 1, so every one of the
     106 downloaded it just by opening the tile to set a PIN, and anyone at all
     could fetch it from the page source. Confirmed live Aug 7 2026: HTTP 200,
     261KB, no account.
     ⚠️ THE TAB GATE BELOW WAS NEVER THE PROBLEM. It correctly hides this from
     everyone under LDD — and it runs AFTER the browser already has the bytes.
     Gating a render cannot unsend a download.
     It now comes from /api/term-archive, which checks HR Console membership
     AND rank >= 6 (or Payroll) server-side. A refusal leaves this empty. */
  const [archiveRows, setArchiveRows] = useState([]);
  useEffect(() => {
    if (!canSeeTerminated(acting)) { setArchiveRows([]); return undefined; }
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/term-archive", { headers: { "x-hub-token": hubToken() } }).then((x) => x.json());
        if (alive && r && r.ok && Array.isArray(r.archive)) setArchiveRows(r.archive);
      } catch { /* stays empty — an unreadable archive shows nothing, never a guess */ }
    })();
    return () => { alive = false; };
  }, [acting]);
  const ARCHIVE = archiveRows.filter((a) => !teamNames.has(a.name.toLowerCase().trim()));

  let curCount = 0, termCount = 0;
  TEAM_EFF.forEach((x) => (statusOf(x.id) === "terminated" ? termCount++ : curCount++));
  const signedCount = TEAM_EFF.filter((x) => statusOf(x.id) === "current" && !isHbExempt(x.id) && handbook.acks[x.id] && handbook.acks[x.id].version === handbook.version.n).length;
  // Leadership Handbook only applies to Team Leader (and Senior Trainer) and up.
  const ldrEligible = TEAM_EFF.filter((x) => statusOf(x.id) === "current" && isLeaderTier(x.role) && !isHbExempt(x.id));
  const ldrSignedCount = ldrEligible.filter((x) => ldrHandbook.acks[x.id] && ldrHandbook.acks[x.id].version === ldrHandbook.version.n).length;
  const s0 = q.trim().toLowerCase();
  const list = TEAM_EFF.filter((x) => statusOf(x.id) === effTab && (!s0 || x.name.toLowerCase().includes(s0) || x.role.toLowerCase().includes(s0))).sort((a, b) => a.name.localeCompare(b.name));

  // Files that never got a personal PIN are locked to casual "type the default"
  // access — anyone browsing the directory could otherwise open (and even set
  // the PIN for) someone else's private file just by knowing "1234". Only
  // Director-and-up override (canOpen) can open/initialize an unset file now;
  // the team member then signs in themselves once their PIN is set.
  const open = (e) => {
    if (canOpen(acting, e)) { setSel(e); setSelfView(false); setView("prof"); setDraft(null); return; }
    /* 🐛🐛 THIS LOCKED ~100 PEOPLE OUT OF THEIR OWN FILE (Chloe, Jul 28 2026:
       "no I can't see my profile it says my pin's not set up" — her PIN was set,
       one of 106 in `gcfcr-hr-pins`).
       CAUSE: `hasPin` reads `pinSet`, loaded from `gcfcr-hr-pins` — which is on
       the worker's `HR_OWN_ROW_ONLY` list. For anyone below Director the worker
       returns only THEIR OWN row… keyed by the identity of the caller, and at
       this moment they have not entered a PIN yet, so it returns `{}`. Empty map
       → `hasPin` false → the box refuses to open → "PIN not set up" about a PIN
       that plainly exists.
       ⚠️ THE CLIENT MUST NOT DECIDE THIS. It cannot see the map, and the thing
       that CAN — `/api/pin-verify` — already answers correctly, rate-limits, and
       filters terminated people. Ask it instead of guessing from data we were
       deliberately denied.
       ⚠️ THE ORIGINAL PROTECTION IS INTACT. `tryPin` still requires the returned
       id to equal the file that was tapped, so a valid PIN cannot open somebody
       else's record and an UNSET file still cannot be opened by typing a
       default — there is no PIN that verifies to it. What changed is that we no
       longer refuse to ask. */
    setPinFor({ ...e, __locked: false }); setPinVal(""); setPinErr("");
  };
  const tryPin = () => {
    /* ★ The id the worker returns must be the person whose file was tapped.
       Accepting any valid PIN would open someone else's record — the one
       mistake this screen cannot make. */
    setPinErr("");
    verifyPinRaw(pinVal, pinFor.id).then((r) => {
      if (r && r.ok && String(r.id) === String(pinFor.id)) {
        // Identity confirmed against the file that was tapped — only now is
        // this device's session allowed to become theirs. See verifyPinRaw.
        if (r.token) { try { localStorage.setItem("gcfcr-hub-token", r.token); } catch {} }
        setSel(pinFor); setSelfView(true); setView("prof"); setDraft(null); setPinFor(null);
      } else setPinErr(pinErrText(r, pinFor.id));
    });
  };
  const updInfo = (e, patch) => mutInfo((p) => ({ ...p, [e.id]: { ...(p[e.id] || { email: e.email || "", hireDate: "", termDate: "" }), ...patch } }));
  const toggleTerm = (e) => {
    const isT = statusOf(e.id) === "terminated";
    mutStatus((p) => ({ ...p, [e.id]: isT ? "current" : "terminated" }));
    updInfo(e, { termDate: isT ? "" : (infoOf(e).termDate || today()) });
    // Terminating clears their stored CFA Home password. Re-hiring does NOT put
    // it back — nobody should be handed an old password, and the username is
    // still there for them.
    if (!isT) clearCfaHomePassword(e.id);
  };
  /* Resolves to null on success, or a message. Callers surface it. */
  const setPinValue = (id, v) =>
    setPinRemote(id, v).then((err) => {
      if (!err) setPinSet((p) => ({ ...p, [id]: true }));
      return err;
    });
  const setRole = (id, role) => { mutRoles((p) => ({ ...p, [id]: role })); setSel((s) => (s && s.id === id ? { ...s, role } : s)); };
  // Templates write straight to gcfcr-hr-evaltpl-v1 via kvSet (usePersisted's
  // mutate → saveKey). Whole-array replace: the editor hands back the full list.
  const saveTemplates = (next) => mutEvalTpl(() => next);
  /* ── REMOVE AN ADDED MEMBER — only when they hold NOTHING ──────────
     Matt, July 17: an "added by mistake" person had no way out, because Mark
     Terminated is for real departures and leaves a typo on the Terminated tab
     forever. So: a real delete, fenced hard.

     TWO CONDITIONS, both required, both refusals rather than warnings:
       1. They were ADDED here (`n_` id). The seeded 106 live in code.
       2. recordCount(id) === 0 — nothing anywhere in the console.
     Anyone who holds a single record cannot be deleted at any tier, by anyone.
     Terminate is the answer there: it keeps the person and their whole history
     and drops their Hub access the moment the status flips. This is the same
     rule as the template delete guard, and the same rule the Team Docs reseed
     button broke when it wiped people out from under their own evaluations.

     A soft-DELETED file entry still counts. `removed: true` means "struck from
     the ledger", not "gone" — it keeps its audit trail on purpose, and deleting
     the person would take that trail with it.

     Cleans the overlays on the way out (pins/roles/info/status). pins matters
     most: leave a dead PIN in the map and pinTaken() blocks anyone from ever
     reusing that number, for a person who no longer exists. */
  const recordCount = (id) =>
    (files[id] || []).length +
    (evals[id] || []).length +
    (injuries[id] || []).length +
    /* ⚠️ UPLOADED DOCUMENTS COUNT TOO, and they were missed. This number is the
       only thing standing between "remove this person" and their records, and
       it did not look at `docFiles` — the per-member uploads, which is where a
       signed handbook, an ID or a doctor's note actually lives. So someone
       whose ONLY record was an uploaded document counted as zero, the Remove
       button appeared, and taking it dropped the person while their file stayed
       in the bucket with nothing pointing at it. Unreachable from the console
       and invisible in the count that said it was safe to delete. */
    (docFiles[id] || []).length +
    (handbook.acks[id] ? 1 : 0) +
    (handbook.conf[id] ? 1 : 0) +
    (ldrHandbook.acks[id] ? 1 : 0);
  const removeMember = (id) => {
    if (!isAddedId(id) || recordCount(id) !== 0) return;   // belt and braces — the UI already hides it
    const drop = (p) => { const n = { ...(p || {}) }; delete n[id]; return n; };
    mutAdded((p) => (p || []).filter((x) => x.id !== id));
    /* ⚠️ The PIN goes through the worker — this component no longer holds the
       map, so there is nothing local to mutate. */
    clearPinRemote(id);
    setPinSet((p) => { const n = { ...p }; delete n[id]; return n; });
    mutRoles(drop); mutInfo(drop); mutStatus(drop);
    setSel(null); setView("dir");
  };
  const saveCfaHome = (id, patch) => mutCfaHome((prev) => ({
    ...(prev || {}),
    [id]: { ...((prev || {})[id] || {}), ...patch, at: new Date().toISOString() },
  }));

  // ★ ON TERMINATION: clear the PASSWORD, keep the USERNAME. Bri's call, and a
  // better one than mine — a rehire returns to the same CFA Home account, so
  // wiping the username would just mean re-typing something that never changed.
  const clearCfaHomePassword = (id) => mutCfaHome((prev) => {
    const rec = (prev || {})[id];
    if (!rec || !rec.password) return prev || {};
    return { ...(prev || {}), [id]: { ...rec, password: "", at: new Date().toISOString() } };
  });

  const attach = () => {
    // Belt and braces on the button's whyOk check — a stale draft or a future
    // second call site must not be able to file a general doc with no reason.
    const tplHere = TEMPLATES.find((x) => x.id === draft.id);
    if (tplHere && tplHere.source === "general") {
      const b = String(draft.body || "");
      if (!b.trim() || /\(Describe what happened/i.test(b)) {
        window.alert("Please describe the reason for this documentation before attaching it.");
        return;
      }
    }
    /* ⚠️ THE FILER'S OWN NAME, ALWAYS. Counseling entries used to stamp
       "Hannah Jackson · Human Resources" no matter who filed them — a false
       attribution on a permanent record whenever anyone else did, and a name
       that would outlive her seat. The HR label stays (counseling IS issued
       under HR authority); the person is whoever actually filed it, which is
       also what every history stamp below already records. */
    const by = draft.counseling
      ? (acting ? acting.name : "—") + " · Human Resources"
      : actingSig(acting, "");
    // A leader can now attach documentation WITHOUT the team member's signature.
    // If the member signature is blank (and the doc type needs one), it goes on
    // file as pending and the member is emailed a request to sign it themselves.
    const needsSig = draft.id !== "adjust";
    const memberSigned = !!(draft.sig && draft.sig.trim());
    const pendingSig = needsSig && !memberSigned;
    // POINTS ARE HR's, NOT THE LEADER's (Hannah, July 16: "I don't want them to
    // set points. Document only."). Anyone below LDD reports what they saw and
    // the entry lands at ZERO carrying needsPricing — HR prices it by editing
    // the entry. Without the flag an unpriced write-up would sit in the file
    // looking handled while the point ledger said nothing happened.
    // `hrDecides` templates (No Call/No Show, Harassment, Gross Misconduct,
    // Insubordination) resolve to an OUTCOME, not a number, so they always land
    // needing an HR decision — even when HR files them itself. Without this an
    // entry whose consequence is termination would sit in the file at 0 points
    // looking fully handled.
    const priced = full(acting);
    const points = priced ? (Number(draft.points) || 0) : 0;
    const needsPricing = !priced || !!draft.hrDecides;
    // AUDIT TRAIL (Matt, July 16 — his compromise on who may edit/delete).
    // Rather than narrowing edit rights to a hand-listed few (which no rank
    // threshold expresses, since Bri is 6 and Kyleeka is 7), every entry
    // carries its own history: who created it, every edit, and any removal.
    // Auditable beats narrow — an edit nobody can see is the actual risk, not
    // an edit by the wrong person.
    const stamp = (action) => ({ at: new Date().toISOString(), by: actingSig(acting), action });
    /* 🐛 `source` WAS BUILT OUT OF THE ENTRY, so two templates filed into the
       wrong half of somebody's permanent record (Aug 7 2026 sweep, finding 24).

       FILE_GROUPS routes on `x.source`, and its `writeups` test is a CATCH-ALL:
       anything that is not a counseling, an Adjustment, teamdocs, orientation,
       general or recovery matches it. This object was assembled field by field
       and never copied `source`, so it arrived undefined, every one of those
       tests passed, and both templates landed under "Write-ups — Attendance and
       policy incidents that moved points".

       Two records that are explicitly NOT discipline:
         · General Documentation — Hannah's catch-all, kept first in the list
           because it is the one she reaches for most. "Flat zero points for all
           general documentation."
         · Recovery Point — the +1 someone EARNS for bringing in a doctor's
           note. Filed as a write-up, which is the opposite of what it is.

       All ~106 people read their own file through self-view, so this was on
       screen for the person it was about.

       ⚠️ THE COMMENT ABOVE THE TEMPLATE ALREADY SAID `source: "general"` is
       what keeps it out of the Write-ups group. It was true of the template and
       false of the entry, and nothing connected the two. NewHireOrientation is
       the only writer in the repo that persists a `source`, which is exactly
       why the orientation group works and these two did not.

       ⚠️ WRITTEN ONLY WHEN THE TEMPLATE HAS ONE. Old entries have no `source`
       and must keep reading exactly as they do — undefined still falls to the
       catch-all, which for a real write-up is the right answer. Design rule 1. */
    const entry = { id: draft.id + "-" + Date.now(), title: draft.title, area: draft.area, ...(draft.source ? { source: draft.source } : {}), counseling: !!draft.counseling, step: draft.step || null, points, needsPricing, date: draft.date, body: draft.body, by, sig: draft.sig || null, leaderSig: draft.leaderSig || null, pendingSig, history: [stamp("created")] };
    mutFiles((p) => ({ ...p, [sel.id]: [entry, ...(p[sel.id] || [])] }), sel.id);
    // MEMBER-FACING ONLY now (Hannah turned off the HR copy Aug 1 2026 — see
    // notifyFileEntry). A pending entry asks the MEMBER to sign; a complete one
    // tells the member it was filed. HR watches the console's pending-points
    // card instead of the inbox, so there is no HR-summary call to make here.
    if (pendingSig) {
      notifySignRequest(sel, entry.title);
    } else {
      notifyFileEntry(sel, entry);
    }
    setDraft(null);
  };
  // Editing an entry is how HR prices a leader's report — so saving an edit
  // clears needsPricing. If it didn't, a priced entry would keep nagging.
  // Every edit appends to the entry's own history, and records WHAT moved:
  // "points −4 → −2" is the change worth being able to see later.
  const editEntry = (updated) => mutFiles((p) => ({
    ...p,
    [sel.id]: (p[sel.id] || []).map((x) => {
      if (x.id !== updated.id) return x;
      const changes = [];
      const nextPts = Number(updated.points) || 0;
      if ((Number(x.points) || 0) !== nextPts) changes.push(`points ${x.points} → ${nextPts}`);
      if (x.date !== updated.date) changes.push(`date ${x.date} → ${updated.date}`);
      if ((x.body || "") !== (updated.body || "")) changes.push("text edited");
      if ((x.sig || "") !== (updated.sig || "")) changes.push("member signature edited");
      if ((x.leaderSig || "") !== (updated.leaderSig || "")) changes.push("leader signature edited");
      return {
        ...updated, points: nextPts, needsPricing: false,
        history: [...(x.history || []), { at: new Date().toISOString(), by: actingSig(acting), action: "edited", note: changes.join(" · ") || "no field changes" }],
      };
    }),
  }), sel.id);
  // REMOVE is a SOFT delete. An HR record shouldn't be able to silently vanish —
  // the entry stops counting points (see total()) and drops out of the file's
  // groups, but it stays in the data with who removed it and when. HR-exec can
  // show removed entries and restore one.
  const removeEntry = (id) => mutFiles((p) => ({
    ...p,
    [sel.id]: (p[sel.id] || []).map((x) => (x.id === id ? {
      ...x, removed: true,
      history: [...(x.history || []), { at: new Date().toISOString(), by: actingSig(acting), action: "removed" }],
    } : x)),
  }), sel.id);
  const restoreEntry = (id) => mutFiles((p) => ({
    ...p,
    [sel.id]: (p[sel.id] || []).map((x) => (x.id === id ? {
      ...x, removed: false,
      history: [...(x.history || []), { at: new Date().toISOString(), by: actingSig(acting), action: "restored" }],
    } : x)),
  }), sel.id);
  // The team member signs a pending file entry from their own file — this clears
  // the pending flag and notifies Bri the signature is complete.
  const signFileEntry = (entryId, sig) => {
    const cur = (files[sel.id] || []).find((x) => x.id === entryId);
    mutFiles((p) => ({ ...p, [sel.id]: (p[sel.id] || []).map((x) => (x.id === entryId ? { ...x, sig, pendingSig: false } : x)) }), sel.id);
    if (cur) notifySignatureComplete("Documentation", cur.title, sel, sig);
  };
  const addEval = (ev) => mutEvals((p) => ({ ...p, [sel.id]: [ev, ...(p[sel.id] || [])] }), sel.id);
  // Evaluations are now editable and removable in-console, same as file entries.
  const editEval = (updated) => mutEvals((p) => ({ ...p, [sel.id]: (p[sel.id] || []).map((x) => (x.id === updated.id ? updated : x)) }), sel.id);
  const removeEval = (id) => mutEvals((p) => ({ ...p, [sel.id]: (p[sel.id] || []).filter((x) => x.id !== id) }), sel.id);
  const addInjury = (inj) => { mutInjuries((p) => ({ ...p, [sel.id]: [inj, ...(p[sel.id] || [])] })); notifyInjury(sel, inj); };

  /* File a leadership point. Notifies the leader the moment it lands (Matt,
     Aug 3 2026, confirmed) — a ladder that quietly accumulates until somebody
     is suddenly at a written warning is a trap, not a standard.
     ⚠️ The total sent is computed AFTER the new entry, so the email states
     where they now stand rather than where they stood a second ago. */
  const addLdrPoint = (entry) => {
    const next = [entry, ...((ldrPts && ldrPts[sel.id]) || [])];
    mutLdrPts((p) => ({ ...p, [sel.id]: next }));
    /* ⚠️ A PENDING SUBMISSION TELLS THE LEADER NOTHING, ON PURPOSE. The whole
       point of the notification is that nobody learns their total at a meeting
       — but a pending entry has no total yet and might be binned. Telling
       somebody they have been documented and then withdrawing it is worse than
       waiting a day. HR's approval is what sends it. */
    if (entry.pending) return;
    const st = ldrStanding(next, new Date().toISOString().slice(0, 10));
    const d = ldrDutyById(entry.duty);
    notifyLdrPoint(sel, {
      points: entry.w,
      total: st.total,
      stage: st.stage ? st.stage.label : "",
      nextAt: st.next ? st.next.at : 0,
      details: d ? d.label : entry.duty,
      issuedBy: entry.by,
      date: entry.date,
    });
  };
  /* Voiding keeps the row and marks it, never deletes it. A removed record is
     a record nobody can argue with later — the point of documentation is that
     it stays readable, including the parts that were withdrawn. */
  /* HR files a pending submission. It becomes a real entry AT THAT MOMENT —
     the date it carries is the date of the incident, which is what the leader
     recorded, but it starts counting and it notifies now. */
  const fileLdrPending = (entryId) => {
    const cur = (ldrPts && ldrPts[sel.id]) || [];
    const e = cur.find((x) => x.id === entryId);
    if (!e) return;
    const filed = { ...e, pending: false, filedBy: actingSig(acting), filedAt: new Date().toISOString() };
    const next = cur.map((x) => (x.id === entryId ? filed : x));
    mutLdrPts((p) => ({ ...p, [sel.id]: next }));
    const st = ldrStanding(next, new Date().toISOString().slice(0, 10));
    const d = ldrDutyById(filed.duty);
    notifyLdrPoint(sel, {
      points: filed.w,
      total: st.total,
      stage: st.stage ? st.stage.label : "",
      nextAt: st.next ? st.next.at : 0,
      details: d ? d.label : filed.duty,
      issuedBy: filed.by,
      date: filed.date,
    });
  };

  const voidLdrPoint = (entryId) => {
    mutLdrPts((p) => ({ ...p, [sel.id]: ((p && p[sel.id]) || []).map((x) => (x.id === entryId ? { ...x, voided: true } : x)) }));
  };

  // ── Document files (uploaded scans: doctor's notes, IDs, signed forms) ──
  // Binaries go to a PRIVATE Supabase bucket; the record stores only { bucket,
  // path }, and a short-lived signed URL is minted on view. A team member's own
  // upload files as "pending" for HR to approve in one tap; a leader/HR upload
  // files "approved" immediately. Every add emails HR via notifyFileEntry —
  // Hannah's standing requirement that nothing enters a file silently.
  const DOC_BUCKET = "hr-files";
  const addDoc = async (member, file, category, viaSelf) => {
    const safe = (file.name || "document").replace(/[^\w.\-]+/g, "_");
    const path = member.id + "/" + Date.now() + "-" + safe;
    const loc = await uploadDoc(DOC_BUCKET, path, file); // throws on failure; caller catches
    const now = new Date().toISOString();
    const by = viaSelf ? (member.name + " · self") : (actingSig(acting));
    const entry = {
      id: "doc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      category: category || "General document",
      fileName: file.name || "document", fileType: file.type || "",
      bucket: loc.bucket, path: loc.path,
      date: today(), uploadedBy: by,
      status: viaSelf ? "pending" : "approved",
      approvedBy: viaSelf ? "" : by, approvedAt: viaSelf ? "" : now,
      history: [{ at: now, by, action: "uploaded" }],
    };
    mutDocFiles((p) => ({ ...p, [member.id]: [entry, ...(p[member.id] || [])] }), member.id);
    notifyFileEntry(member, { title: (category || "Document") + " — " + (file.name || "file"), date: entry.date, by });
    return true;
  };
  const approveDoc = (memberId, docId) => mutDocFiles((p) => ({
    ...p, [memberId]: (p[memberId] || []).map((d) => d.id === docId
      ? { ...d, status: "approved", approvedBy: actingSig(acting, "HR"), approvedAt: new Date().toISOString(), history: [...(d.history || []), { at: new Date().toISOString(), by: actingSig(acting, "HR"), action: "approved" }] }
      : d),
  }), memberId);
  const rejectDoc = (memberId, docId) => {
    const d = (docFiles[memberId] || []).find((x) => x.id === docId);
    // Best-effort: drop the private-bucket binary before we forget its { bucket, path }.
    if (d?.bucket && d?.path) deleteDoc(d.bucket, d.path);
    mutDocFiles((p) => ({
      ...p, [memberId]: (p[memberId] || []).filter((x) => x.id !== docId),
    }), memberId);
  };
  /* Hannah, Jul 24: "Give me the ability to change document upload types
     And/or delete documents". Retyping matters because the category decides
     which TAB a document lands in — a work-authorization file uploaded as a
     General document sits in the wrong place and is invisible in an audit.
     Both are HR-only: `canManage` covers leaders, and a leader shouldn't be
     able to remove something from someone's permanent record. */
  const retypeDoc = (memberId, docId, category) => mutDocFiles((p) => ({
    ...p, [memberId]: (p[memberId] || []).map((d) => d.id === docId
      ? { ...d, category, history: [...(d.history || []), { at: new Date().toISOString(), by: actingSig(acting, "HR"), action: `retyped to ${category}` }] }
      : d),
  }), memberId);
  // Same shape as rejectDoc — purge the binary FIRST, while we still hold its
  // { bucket, path }, or the file is orphaned in storage with nothing pointing
  // at it. Confirmed at the call site, not here.
  const removeDoc = (memberId, docId) => {
    const d = (docFiles[memberId] || []).find((x) => x.id === docId);
    if (d?.bucket && d?.path) deleteDoc(d.bucket, d.path);
    mutDocFiles((p) => ({ ...p, [memberId]: (p[memberId] || []).filter((x) => x.id !== docId) }), memberId);
  };

  const viewDoc = async (d) => {
    const url = await signedDocUrl(d.bucket, d.path, 300);
    if (url) window.open(url, "_blank", "noopener");
    else alert("Couldn't open this document — the link may have expired, or the storage bucket isn't set up yet. Try again.");
  };

  const signHandbook = async (id, sig) => {
    if (!(await postDocAck({ kind: "handbook", sig }))) return;
    locHandbook((h) => ({ ...h, acks: { ...h.acks, [id]: { version: h.version.n, date: today(), signature: sig } } }));
    const person = TEAM_EFF.find((m) => m.id === id);
    if (person) notifySignatureComplete("Handbook", "Team Handbook v" + handbook.version.n, person, sig);
  };
  const signConf = async (id, sig) => {
    if (!(await postDocAck({ kind: "conf", sig }))) return;
    locHandbook((h) => ({ ...h, conf: { ...h.conf, [id]: { date: today(), signature: sig } } }));
    const person = TEAM_EFF.find((m) => m.id === id);
    if (person) notifySignatureComplete("Confidentiality Statement", "Confidentiality Statement", person, sig);
  };
  const signLdrHandbook = async (id, sig) => {
    if (!(await postDocAck({ kind: "ldrhandbook", sig }))) return;
    locLdrHandbook((h) => ({ ...h, acks: { ...h.acks, [id]: { version: h.version.n, date: today(), signature: sig } } }));
    const person = TEAM_EFF.find((m) => m.id === id);
    if (person) notifySignatureComplete("Leadership Handbook", "Leadership Handbook v" + ldrHandbook.version.n, person, sig);
  };
  const pushLdrHandbook = (label) => mutLdrHandbook((h) => ({ ...h, version: { n: h.version.n + 1, label: label || "Leadership Handbook v" + (h.version.n + 1), date: today() } }));
  const pushHandbook = (label) => mutHandbook((h) => ({ ...h, version: { n: h.version.n + 1, label: label || "Handbook v" + (h.version.n + 1), date: today() } }));

  // Document sends
  const resolveTargets = (aud, role, area) => {
    const current = TEAM_EFF.filter((m) => statusOf(m.id) !== "terminated");
    if (aud === "role") return current.filter((m) => m.role === role).map((m) => m.id);
    if (aud === "area") return current.filter((m) => (infoOf(m).area || "") === area).map((m) => m.id);
    return current.map((m) => m.id);
  };
  // Add or update in one path: an id that already exists is replaced in place,
  // so a doc keeps its id and any send records that reference it stay valid.
  const saveSopDoc = (doc) => {
    if (!doc || !(doc.title || "").trim()) return { ok: false };
    const id = doc.id || ("doc_" + Date.now() + "_" + Math.floor(Math.random() * 1000));
    const rec = { ...doc, id, title: (doc.title || "").trim(), createdAt: doc.createdAt || new Date().toISOString() };
    mutSopDocs((xs) => {
      const list = Array.isArray(xs) ? xs : [];
      return list.some((d) => d.id === id) ? list.map((d) => d.id === id ? rec : d) : [rec, ...list];
    });
    return { ok: true, id };
  };
  // ⚠️ Deleting a document does NOT remove sends already made from it — those
  // records carry their own title and url, so an acknowledgement trail survives
  // the document being tidied away. That is deliberate: the receipt is evidence.
  const deleteSopDoc = (id) => mutSopDocs((xs) => (Array.isArray(xs) ? xs : []).filter((d) => d.id !== id));

  const sendDoc = (doc, opts) => {
    const { audience, role, area, ids, signRequired } = opts;
    const targetIds = audience === "select" ? (ids || []) : resolveTargets(audience, role, area);
    if (!targetIds.length) return { ok: false, count: 0 };
    const label = audience === "all" ? "Everyone" : audience === "role" ? "Role: " + role : audience === "area" ? "Area: " + area : targetIds.length + " selected";
    const rec = { id: "snd_" + Date.now().toString(36), docId: doc.id || "", docTitle: doc.title || "Untitled document", driveUrl: doc.attachUrl || "", signRequired: !!signRequired, createdAt: new Date().toISOString(), audienceLabel: label, targetIds, acks: {} };
    mutSends((xs) => [rec, ...xs]);
    if (signRequired) {
      targetIds.forEach((id) => {
        const m = TEAM_EFF.find((x) => x.id === id);
        if (m) notifySignRequest(m, rec.docTitle);
      });
    }
    return { ok: true, count: targetIds.length };
  };
  /* ══════════════════════════════════════════════════════════════════════
     SIGNING YOUR OWN THING GOES THROUGH /api/doc-ack.

     🐛 Every signature below used to be a WHOLE-MAP write, and the whole-map
     door requires full HR access. So a team member who read a document and
     tapped Acknowledge got "That did not save... check your connection" — a
     permission refusal wearing a network error's clothes — and the
     acknowledgment never recorded. Sent Documents showed 0 of N forever.

     Handbook signing appeared to work only because those two keys had never
     been protected, which meant anybody with a PIN could write them directly.
     Both problems have the same answer: one route that writes exactly one
     person's row and nothing else.

     ⚠️ THE SERVER DECIDES WHO SIGNED, from the token. Nothing here sends an id,
     because an id in the body is the old hole with extra steps. `memberId`
     below is used only to update what is on screen. */
  const ackErrorText = (err) => (
    err === "already-signed"   ? "That is already recorded as signed. Reopen this page to see it."
  : err === "not-a-recipient"  ? "This document was not sent to you, so it cannot be signed here."
  : err === "signature-required" ? "Type your name in the box to sign."
  : err === "no-such-document" ? "That document is no longer on file. Tell HR."
  : err === "unauthorized"     ? "Your Hub sign-in has expired.\n\nNothing was lost. Sign out of the Hub and back in with your PIN, then sign again."
  : err === "sends-unreadable" || err === "record-unreadable"
      ? "Could not read the record just now, so nothing was changed. Try again in a moment."
  : "That did not save, and nothing was changed. Try again, and if it keeps happening tell Matt and mention: " + String(err)
  );
  /* Returns true when the signature is genuinely stored. The caller only
     touches the screen after that — an optimistic update here is how "it said
     Saved and it was not" happens. */
  const postDocAck = async (body) => {
    let r = null;
    try {
      r = await fetch("/api/doc-ack", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-token": (() => { try { return localStorage.getItem(HUB_TOKEN_KEY) || ""; } catch { return ""; } })() },
        body: JSON.stringify(body),
      }).then((x) => x.json());
    } catch { r = null; }
    if (r && r.ok) return true;
    /* A thrown fetch really is the network; a returned error is not. Saying
       "check your connection" for a refusal is the exact lie being fixed. */
    try { window.alert(r ? ackErrorText(r.error) : "No answer from the Hub. Check your connection and try again — nothing was changed."); } catch {}
    return false;
  };

  const ackSend = async (sendId, memberId, sig) => {
    if (!(await postDocAck({ kind: "send", id: sendId, sig }))) return;
    locSends((xs) => (Array.isArray(xs) ? xs : []).map((s) => s.id === sendId ? { ...s, acks: { ...s.acks, [memberId]: { at: new Date().toISOString(), sig: sig || "" } } } : s));
    const s = sends.find((x) => x.id === sendId);
    const person = TEAM_EFF.find((m) => m.id === memberId);
    if (s && s.signRequired && person) notifySignatureComplete("Document", s.docTitle, person, sig || "");
  };
  const deleteSend = (sendId) => mutSends((xs) => xs.filter((s) => s.id !== sendId));

  // ── assigned evaluations ────────────────────────────────────────────────
  // Read Bri's team structure once so an assignment can target "every Team
  // Member on Julie's team" instead of ticking names one at a time.
  useEffect(() => { let live = true; (async () => {
    try { const d = await kvGet(TEAM_DIR_KEY); if (live) setTeamDir(d && Array.isArray(d.teams) ? d : { teams: [] }); }
    catch { if (live) setTeamDir({ teams: [] }); }
  })(); return () => { live = false; }; }, []);

  const tasks = Array.isArray(evalTasks) ? evalTasks : [];
  // What THIS person still owes. Approved and awaiting-approval work drops off
  // their list on purpose — Bri: "once submitted and approved the ADs can no
  // longer see it and it is removed as a task for them".
  const myOpenTasks = tasks.filter((t) => t.assigneeId === (acting && acting.id) && (t.status === "open" || t.status === "returned"));
  const pendingApproval = tasks.filter((t) => t.status === "submitted");

  // ── OUTSTANDING RECOMMENDATION REQUESTS ──────────────────────────────────
  // Bri, Jul 24: "Can we make it work similarly to assigning the evaluations
  // with the banner in HR Console showing needed action? These are visible and
  // stay put until they are completed."
  // Fixing the name matching only helps a leader who thinks to open Professional
  // Growth. This puts it where they already are and leaves it there until it's
  // written. Read-only — writing still happens in one place, on that page.
  const [myRecs, setMyRecs] = useState([]);
  const actingId = acting ? acting.id : null;
  const actingName = acting ? acting.name : "";
  useEffect(() => {
    let live = true;
    (async () => {
      if (!actingName) { if (live) setMyRecs([]); return; }
      try {
        const idx = (await kvGet(PG_INDEX_KEY)) || [];
        // One fetch per application. `catch(() => null)` per key so one missing
        // record can't blank the whole banner.
        const apps = await Promise.all(idx.map((r) => kvGet(pgAppKey(r.role, r.slug)).catch(() => null)));
        const out = [];
        apps.forEach((a, i) => {
          /* 🐛 THIS READ `a.recs` AND THERE IS NO SUCH FIELD (Aug 10 2026).
             Recommendations live at `a.steps.<stepId>.recs`. The banner Bri
             asked for on Jul 24 — "make it work similarly to assigning the
             evaluations with the banner in HR Console showing needed action…
             These are visible and stay put until they are completed" — has
             therefore never shown anybody anything, on any day, for any
             request. It did not fail; it looked at a field that does not exist
             and found nothing, which renders the same as "you have none".
             ⚠️ WALKS EVERY STEP, like App.jsx's badge and worker.js's reminder
             already do. Only the seeded `l2` step is type `recs` today and Bri
             cannot create another, but two of the four readers already walk all
             steps and this is the third — a reader narrower than its siblings
             is how they drift apart.
             ⚠️ A WITHDRAWN REQUEST IS NOT HERE TO FIND: withdrawing moves the
             record out of `recs` entirely, so a cancelled request correctly
             stops appearing without this needing to know that. */
          const recs = [];
          Object.values((a && a.steps) || {}).forEach((sd) => {
            if (sd && Array.isArray(sd.recs)) recs.push(...sd.recs);
          });
          recs.forEach((rc) => {
            if (!rc || rc.status === "completed") return;
            /* Same precedence as the page this banner links to: roster ID
               first, name only as the fallback for pre-ID records.
               ⚠️ The id comparison itself was ALSO wrong until today — the
               request carries the directory's `27` and this passes the roster's
               `tm27`. recMatches normalises both now; see sameId in
               nameMatch.js. Either bug alone kept this banner empty, so both
               had to be fixed before it could ever show a row. */
            if (!recMatches(rc, { id: actingId, name: actingName })) return;
            out.push({ applicant: (idx[i] || {}).name || "", requestedAt: rc.requestedAt || "" });
          });
        });
        if (live) setMyRecs(out);
      } catch { if (live) setMyRecs([]); }
    })();
    return () => { live = false; };
  }, [actingId, actingName]);

  const assignEvals = (rows) => {
    const stamp = Date.now();
    const made = rows.map((r, i) => ({
      id: "et_" + stamp + "_" + i,
      subjectId: r.subjectId, subjectName: r.subjectName,
      assigneeId: r.assigneeId, assigneeName: r.assigneeName,
      templateId: r.templateId, templateName: r.templateName,
      dueDate: r.dueDate || "", status: "open", draft: null,
      createdAt: new Date().toISOString(), createdBy: acting ? acting.name : "\u2014",
    }));
    mutEvalTasks((xs) => [...made, ...(Array.isArray(xs) ? xs : [])]);
    return made.length;
  };
  const submitTask = (taskId, draft) => mutEvalTasks((xs) => (xs || []).map((t) => (
    t.id === taskId ? { ...t, status: "submitted", draft, submittedAt: new Date().toISOString(), reviewNote: "" } : t)));
  const returnTask = (taskId, note) => mutEvalTasks((xs) => (xs || []).map((t) => (
    t.id === taskId ? { ...t, status: "returned", reviewNote: note || "", reviewedBy: acting ? acting.name : "\u2014", reviewedAt: new Date().toISOString() } : t)));
  /* ═══ RETURN WITH A RECOMMENDATION (Bri, Aug 5 2026) ═══════════════════════
     Her spec, near enough verbatim: a leader who is assigned an evaluation but
     thinks another AD or Director has more experience "can recommend sending it
     to that leader to complete instead… They also need to be required to note
     why that leader is a better choice." Bri or Hannah then approve, which
     re-assigns with the same due date, or deny with a reason, which sends it
     back to the original leader. "If the evaluation is denied they cannot
     re-recommend another leader."

     ⚠️ EVERY FIELD IS NEW AND NESTED, SO OLD TASKS ARE UNTOUCHED. A task
     written before today has no `rec`, no `recDenied`, no `recFrom`, and it
     reads and behaves exactly as it did. Design rule 1.
     ⚠️ "recommended" IS ITS OWN STATUS, which is what takes the task OUT of the
     original leader's queue while the decision is pending — myOpenTasks filters
     on open/returned. Leaving it in would let them complete the very evaluation
     they just said somebody else should do.
     ⚠️ THE WHY IS NOT ON THE TASK'S PUBLIC FACE. Her rule: the new assignee
     sees WHO recommended them and never the reason, which stays with her and
     Hannah. That is why approve copies only `byName` into `recFrom` and drops
     `rec` entirely rather than keeping it around "for the record". */
  const recommendTask = (taskId, toId, toName, why) => mutEvalTasks((xs) => (xs || []).map((t) => (
    t.id === taskId
      ? { ...t, status: "recommended",
          rec: { toId: String(toId), toName, why: String(why || "").trim(),
                 byId: acting ? String(acting.id) : "", byName: acting ? acting.name : "—",
                 at: new Date().toISOString() } }
      : t)));

  /* ⚠️ THE DRAFT IS CLEARED ON RE-ASSIGNMENT, DELIBERATELY. A part-written
     draft can hold the first leader's PRIVATE notes, which the confidential
     block on their own screen promises go only to Leadership Development and
     HR. Handing that to a second leader would break that promise quietly. The
     new person starts clean, which is also what "somebody better placed should
     do this" means. */
  const approveRec = (task) => mutEvalTasks((xs) => (xs || []).map((t) => (
    t.id === task.id
      ? { ...t, status: "open", assigneeId: t.rec.toId, assigneeName: t.rec.toName,
          recFrom: { name: t.rec.byName }, rec: undefined, draft: null }
      : t)));

  /* ⚠️ dueDate ONLY WHEN SHE SET ONE (Bri, asked directly whether a denial
     keeps the original date: "I want an option to keep the due date or revise
     the due date upon sending. It will be case by case."). An empty box means
     keep, so it is never possible to blank a date by not touching it. */
  const denyRec = (task, note, newDue) => mutEvalTasks((xs) => (xs || []).map((t) => (
    t.id === task.id
      ? { ...t, status: "open", rec: undefined, recDenied: true,
          recDenyNote: String(note || "").trim(),
          recDeniedBy: acting ? acting.name : "—", recDeniedAt: new Date().toISOString(),
          ...(String(newDue || "").trim() ? { dueDate: newDue } : {}) }
      : t)));

  const deleteTask = (taskId) => mutEvalTasks((xs) => (xs || []).filter((t) => t.id !== taskId));
  const patchTask = (taskId, patch) => mutEvalTasks((xs) => (xs || []).map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
  // Approval is the ONLY path from a draft into someone's file.
  const approveTask = (task) => {
    const d = task.draft || {};
    const ev = {
      id: "ev-" + Date.now(),
      date: d.date || today(),
      period: d.period || "Review",
      templateId: task.templateId, templateName: task.templateName,
      overall: d.overall || 0, ratings: d.ratings || {}, comments: d.comments || "",
      evaluator: d.evaluator || task.assigneeName,
      approvedBy: acting ? acting.name : "\u2014", approvedAt: new Date().toISOString(),
    };
    mutEvals((p) => ({ ...p, [task.subjectId]: [ev, ...(p[task.subjectId] || [])] }), task.subjectId);
    // The private answer + notes are HOISTED onto the task before the draft is
    // cleared, so Bri and Hannah keep them and the file never gets them.
    mutEvalTasks((xs) => (xs || []).map((t) => (
      t.id === task.id ? {
        ...t, status: "approved", reviewedBy: acting ? acting.name : "\u2014", reviewedAt: new Date().toISOString(),
        privateConvo: d.privateConvo || "", privateNotes: d.privateNotes || "", draft: null,
      } : t)));
  };
  const undoAck = (sendId, memberId) => mutSends((xs) => xs.map((s) => {
    if (s.id !== sendId) return s;
    const acks = { ...(s.acks || {}) };
    delete acks[memberId];
    return { ...s, acks };
  }));

  return (
    <div style={S.app}><div style={S.shell}>
      {/* ⚠️ SAY IT OUT LOUD WHEN THE SESSION HAS LAPSED. Before this, an expired
          sign-in rendered as empty lists and Bri reasonably read that as "the
          evaluations are gone" and asked for them to be restored. The data was
          never touched. Silence about an auth state is what sent her there.
          ⚠️ Sits ABOVE everything, not inside a tab. The whole console is empty
          in this state, so there is no section for it to belong to. */}
      {sessionExpired && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "13px 15px", margin: "0 0 14px" }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "#991B1B", marginBottom: 4 }}>
            Your sign-in has expired — this is not missing data
          </div>
          <div style={{ fontSize: 13, color: "#7F1D1D", lineHeight: 1.5 }}>
            HR records are only sent to a signed-in session, and sign-ins last about 12 hours.
            Anything below may look empty until you sign in again. <b>Nothing has been deleted.</b>
            {" "}Sign out of the Hub and back in, then reopen HR Console.
          </div>
        </div>
      )}
      {/* ── REDESIGN: personnel-register masthead + directory ──────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .hr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
        .hr-ctl{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
        .hr-card{transition:transform .12s ease,box-shadow .12s ease,border-color .12s ease}
        .hr-card:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(20,36,61,.10);border-color:#B4832B}
        .hr-card:focus-visible,.hr-seg:focus-visible,.hr-ctlbtn:focus-visible{outline:2px solid #B4832B;outline-offset:2px}
        @media (prefers-reduced-motion:reduce){.hr-card{transition:none}.hr-card:hover{transform:none}}
      `}</style>

      <div style={{ background: "radial-gradient(130% 100% at 50% 0%, #2A4880 0%, #223C6A 32%, #14243D 68%, #0B1727 100%)", color: "#fff", padding: "18px 22px 20px", borderBottom: "3px solid #B4832B" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
            {/* `launch:` covers the moved-in tiles (Onboarding Link, Orientation).
                They render a whole tool inside the console, so without this arrow
                the only way back to the register is closing the tool entirely. */}
            {(view === "prof" || view === "sigs" || view === "tpls" || view === "sop" || view === "docsends" || String(view).startsWith("launch:")) && (
              <button onClick={() => setView("dir")} style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.25)", color: "#fff", width: 34, height: 34, borderRadius: 9, cursor: "pointer", fontSize: 16, flexShrink: 0 }}>←</button>
            )}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
                <span style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 11, letterSpacing: 2, color: "#B4832B", fontWeight: 600 }}>PERSONNEL REGISTER</span>
                <span style={{ width: 4, height: 4, borderRadius: 4, background: "rgba(255,255,255,.35)" }} />
                <span style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 11, letterSpacing: 1, color: "rgba(255,255,255,.6)" }}>FSR #{STORE.fsr}</span>
              </div>
              <div style={{ fontFamily: "'Fraunces','Georgia',serif", fontSize: 28, fontWeight: 600, letterSpacing: -0.3, lineHeight: 1 }}>HR Console</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.72)", marginTop: 7 }}>{STORE.legalName} · {curCount} active records · as of {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
            </div>
          </div>
          {full(acting) ? (
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ textAlign: "right", lineHeight: 1.25 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{acting.name}</div>
                <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.6)" }}>Full access</div>
              </div>
              <button onClick={() => { setActing(null); setTab("current"); }} style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.28)", color: "#fff", borderRadius: 9, padding: "9px 15px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Sign out</button>
            </div>
          ) : (
            <button onClick={() => setSignIn(true)} style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.28)", color: "#fff", borderRadius: 9, padding: "9px 15px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Leadership Sign-In</button>
          )}
        </div>
      </div>

      {view === "dir" && (
        <div style={{ padding: "18px 22px 44px" }}>
          {full(acting) && (
            <div style={{ background: "#fff", border: "1px solid #E4E3DD", borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
              <div style={{ padding: "11px 15px", borderBottom: "1px solid #E4E3DD", fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 11, letterSpacing: 1.5, color: "#B4832B", fontWeight: 600 }}>SIGNATURE COMPLIANCE</div>
              {[
                { t: "Team Handbook", v: handbook.version.n, label: handbook.version.label, signed: signedCount, total: curCount, scope: "all current", push: () => setShowPush(true) },
                { t: "Leadership Handbook", v: ldrHandbook.version.n, label: ldrHandbook.version.label, signed: ldrSignedCount, total: ldrEligible.length, scope: "Team Leader+", push: () => setShowPushLdr(true) },
              ].map((h, i) => {
                const pct = h.total ? Math.round((h.signed / h.total) * 100) : 0;
                return (
                  <div key={h.t} style={{ display: "flex", alignItems: "center", gap: 15, padding: "13px 15px", borderTop: i ? "1px solid #E4E3DD" : "none", flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "#14243D" }}>{h.t}</span>
                        <span style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 12, color: "#B4832B", fontWeight: 600 }}>v{h.v}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 2 }}>{h.label} · signed by {h.scope}</div>
                    </div>
                    <div style={{ minWidth: 132 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                        <span style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 12, color: "#14243D", fontWeight: 600 }}>{h.signed}/{h.total}</span>
                        <span style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 12, color: pct === 100 ? "#1F7A5C" : "#14243D", fontWeight: 600 }}>{pct}%</span>
                      </div>
                      <div style={{ position: "relative", height: 5, borderRadius: 3, background: "#EDEBE4" }}>
                        <div style={{ position: "absolute", inset: 0, width: pct + "%", borderRadius: 3, background: pct === 100 ? "#1F7A5C" : "#223C6A" }} />
                      </div>
                    </div>
                    <button onClick={h.push} style={{ background: "#223C6A", color: "#fff", border: "none", borderRadius: 9, padding: "9px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>Push update</button>
                  </div>
                );
              })}
            </div>
          )}

          {myOpenTasks.length > 0 && (
            // Deliberately OUTSIDE the full(acting) control row below: an
            // Assistant Director is rank 4 and never sees that row, but they're
            // exactly who Bri assigns evaluations to. Shown only when they owe
            // something, so it isn't permanent furniture for everyone else.
            <button className="hr-ctlbtn" onClick={() => setView("evaltasks")}
              style={{ display: "block", width: "100%", textAlign: "left", backgroundColor: "#FFFBEB",
                border: "1px solid #FDE68A", borderRadius: 12, padding: "13px 15px", cursor: "pointer", marginBottom: 14,
                ...tileDepth(TILE_WAIT) }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#14243D" }}>
                {myOpenTasks.length === 1 ? "You have 1 evaluation to complete" : `You have ${myOpenTasks.length} evaluations to complete`} <span style={{ color: "#223C6A" }}>→</span>
              </div>
              <div style={{ fontSize: 12, color: "#92400E", marginTop: 2 }}>
                {(() => {
                  const dated = myOpenTasks.filter((t) => t.dueDate).map((t) => t.dueDate).sort();
                  return dated.length ? "Soonest due " + dated[0] : "No due date set";
                })()}
              </div>
            </button>
          )}

          {myRecs.length > 0 && (
            // Same placement rule as the evaluations banner above: OUTSIDE the
            // full(acting) row, because Team Leaders sit below that gate and are
            // half the people this is for. Inside it, the feature would die
            // silently for exactly its audience.
            // Blue rather than amber so two banners at once are tellable apart.
            <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 12,
              padding: "13px 15px", marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#14243D" }}>
                {myRecs.length === 1
                  ? "You've been asked to write 1 recommendation"
                  : `You've been asked to write ${myRecs.length} recommendations`}
              </div>
              <div style={{ fontSize: 12.5, color: "#1E40AF", marginTop: 3, lineHeight: 1.45 }}>
                {/* Naming the applicants matters — "1 recommendation" tells you
                    nothing about whether it's urgent or who is waiting on you. */}
                For {myRecs.map((r) => r.applicant).filter(Boolean).join(", ")}
              </div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 7 }}>
                Open <b>Professional Growth</b> to write {myRecs.length === 1 ? "it" : "them"}.
                This stays here until {myRecs.length === 1 ? "it's" : "they're"} done.
              </div>
            </div>
          )}

          {launchers.length > 0 && (
            // ⚠️ OUTSIDE the full(acting) row below, same reason as the two
            // banners above it. Hannah named Thanh for Orientation and Thanh is
            // an Assistant Director — rank 4, and FULL_MIN is 5. Inside that
            // gate this would be invisible to one of the five people it is for.
            // Access is already settled upstream: App.jsx filters `launchers`
            // with canUseTool, so anything in this array is allowed to be here.
            <div className="hr-ctl" style={{ marginBottom: 20 }}>
              {launchers.map((L) => (
                <button key={L.id} className="hr-ctlbtn" onClick={() => setView("launch:" + L.id)}
                  style={{ textAlign: "left", backgroundColor: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 12, padding: "12px 14px", cursor: "pointer", ...tileDepth(TILE_LAUNCH) }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#14243D" }}>{L.name} <span style={{ color: "#6D28D9" }}>→</span></div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{L.desc}</div>
                </button>
              ))}
            </div>
          )}

          {full(acting) && (
            <div className="hr-ctl" style={{ marginBottom: 20 }}>
              <button className="hr-ctlbtn" onClick={() => setView("sigs")} style={{ textAlign: "left", backgroundColor: "#FCFBF8", border: "1px solid #E4E3DD", borderRadius: 12, padding: "12px 14px", cursor: "pointer", ...tileDepth(ACCENT_NEUTRAL) }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#14243D" }}>Signatures <span style={{ color: "#223C6A" }}>→</span></div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>Everyone's status</div>
              </button>
              {canEditTemplates(acting) && (
                <button className="hr-ctlbtn" onClick={() => setView("tpls")} style={{ textAlign: "left", backgroundColor: "#FCFBF8", border: "1px solid #E4E3DD", borderRadius: 12, padding: "12px 14px", cursor: "pointer", ...tileDepth(ACCENT_NEUTRAL) }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#14243D" }}>Evaluations <span style={{ color: "#223C6A" }}>→</span></div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{tplsOf(evalTemplates).length} templates</div>
                </button>
              )}
              {canAssignEvals(acting) && (
                <button className="hr-ctlbtn" onClick={() => setView("evalassign")} style={{ textAlign: "left", backgroundColor: "#FCFBF8", border: "1px solid #E4E3DD", borderRadius: 12, padding: "12px 14px", cursor: "pointer", ...tileDepth(ACCENT_NEUTRAL) }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#14243D" }}>Assign evaluations <span style={{ color: "#223C6A" }}>→</span></div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>Send to a leader, by team or by person</div>
                </button>
              )}
              {canAssignEvals(acting) && (
                <button className="hr-ctlbtn" onClick={() => setView("evalmanage")} style={{ textAlign: "left", backgroundColor: "#FCFBF8", border: "1px solid #E4E3DD", borderRadius: 12, padding: "12px 14px", cursor: "pointer", ...tileDepth(ACCENT_NEUTRAL) }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#14243D" }}>Manage assignments <span style={{ color: "#223C6A" }}>→</span></div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                    {tasks.length ? `${tasks.length} total · reassign, redate, delete` : "Nothing assigned yet"}
                  </div>
                </button>
              )}
              {canApproveEvals(acting) && (
                <button className="hr-ctlbtn" onClick={() => setView("evalapprove")} style={{ textAlign: "left", backgroundColor: pendingApproval.length > 0 ? "#FFFBEB" : "#FCFBF8", border: pendingApproval.length > 0 ? "1px solid #FDE68A" : "1px solid #E4E3DD", borderRadius: 12, padding: "12px 14px", cursor: "pointer", ...tileDepth(pendingApproval.length > 0 ? TILE_WAIT : ACCENT_NEUTRAL) }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#14243D" }}>Evaluation approvals <span style={{ color: "#223C6A" }}>→</span></div>
                  <div style={{ fontSize: 12, color: pendingApproval.length > 0 ? "#92400E" : "#6B7280", marginTop: 2 }}>
                    {pendingApproval.length > 0 ? pendingApproval.length + " waiting on you" : "Nothing waiting"}
                  </div>
                </button>
              )}
              <button className="hr-ctlbtn" onClick={() => setView("sop")} style={{ textAlign: "left", backgroundColor: "#FCFBF8", border: "1px solid #E4E3DD", borderRadius: 12, padding: "12px 14px", cursor: "pointer", ...tileDepth(ACCENT_NEUTRAL) }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#14243D" }}>SOP Library <span style={{ color: "#223C6A" }}>→</span></div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{(sopDocs || []).length} documents</div>
              </button>
              <button className="hr-ctlbtn" onClick={() => setView("docreview")} style={{ textAlign: "left", backgroundColor: docPendingCount > 0 ? "#FFFBEB" : "#FCFBF8", border: docPendingCount > 0 ? "1px solid #FDE68A" : "1px solid #E4E3DD", borderRadius: 12, padding: "12px 14px", cursor: "pointer", position: "relative", ...tileDepth(docPendingCount > 0 ? TILE_WAIT : ACCENT_NEUTRAL) }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#14243D" }}>Document Review <span style={{ color: "#223C6A" }}>→</span></div>
                <div style={{ fontSize: 12, color: docPendingCount > 0 ? "#B45309" : "#6B7280", marginTop: 2, fontWeight: docPendingCount > 0 ? 700 : 400 }}>{docPendingCount > 0 ? docPendingCount + " waiting to file" : "All uploads filed"}</div>
              </button>
              <button className="hr-ctlbtn" onClick={() => setView("intake")} style={{ textAlign: "left", backgroundColor: intakeCount > 0 ? "#FFFBEB" : "#FCFBF8", border: intakeCount > 0 ? "1px solid #FDE68A" : "1px solid #E4E3DD", borderRadius: 12, padding: "12px 14px", cursor: "pointer", position: "relative", ...tileDepth(intakeCount > 0 ? TILE_WAIT : ACCENT_NEUTRAL) }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#14243D" }}>Onboarding Intake <span style={{ color: "#223C6A" }}>→</span></div>
                <div style={{ fontSize: 12, color: intakeCount > 0 ? "#B45309" : "#6B7280", marginTop: 2, fontWeight: intakeCount > 0 ? 700 : 400 }}>{intakeCount > 0 ? intakeCount + " new-hire ID upload" + (intakeCount > 1 ? "s" : "") + " to match" : "No new ID uploads"}</div>
              </button>
              {/* ★ CASH SHORTAGES TO FILE. Same amber-when-waiting shape as the
                  tiles above, so it reads as one more thing in her queue rather
                  than a new kind of alert. */}
              <button className="hr-ctlbtn" onClick={() => setView("cashdocs")} style={{ textAlign: "left", backgroundColor: cashDocsOpen.length > 0 ? "#FFFBEB" : "#FCFBF8", border: cashDocsOpen.length > 0 ? "1px solid #FDE68A" : "1px solid #E4E3DD", borderRadius: 12, padding: "12px 14px", cursor: "pointer", position: "relative", ...tileDepth(cashDocsOpen.length > 0 ? TILE_WAIT : ACCENT_NEUTRAL) }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#14243D" }}>Cash Shortages <span style={{ color: "#223C6A" }}>→</span></div>
                <div style={{ fontSize: 12, color: cashDocsOpen.length > 0 ? "#B45309" : "#6B7280", marginTop: 2, fontWeight: cashDocsOpen.length > 0 ? 700 : 400 }}>{cashDocsOpen.length > 0 ? cashDocsOpen.length + " to document" : "Nothing waiting"}</div>
              </button>
              {/* Hannah's uniform tab. Amber only when something is actually
                  waiting, exactly like the three tiles above it. */}
              <button className="hr-ctlbtn" onClick={() => setView("uniform")} style={{ textAlign: "left", backgroundColor: uniformCount > 0 ? "#FFFBEB" : "#FCFBF8", border: uniformCount > 0 ? "1px solid #FDE68A" : "1px solid #E4E3DD", borderRadius: 12, padding: "12px 14px", cursor: "pointer", position: "relative", ...tileDepth(uniformCount > 0 ? TILE_WAIT : ACCENT_NEUTRAL) }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#14243D" }}>Uniform Orders <span style={{ color: "#223C6A" }}>→</span></div>
                <div style={{ fontSize: 12, color: uniformCount > 0 ? "#B45309" : "#6B7280", marginTop: 2, fontWeight: uniformCount > 0 ? 700 : 400 }}>{uniformCount > 0 ? uniformCount + " order" + (uniformCount > 1 ? "s" : "") + " to fulfil · $" + uniformTotal.toFixed(2) : "No orders waiting"}</div>
              </button>
              <button className="hr-ctlbtn" onClick={() => setView("drivers")} style={{ textAlign: "left", backgroundColor: driversExpiredCount > 0 ? "#FEF2F2" : "#FCFBF8", border: driversExpiredCount > 0 ? "1px solid #FECACA" : "1px solid #E4E3DD", borderRadius: 12, padding: "12px 14px", cursor: "pointer", position: "relative", ...tileDepth(driversExpiredCount > 0 ? TILE_STOP : ACCENT_NEUTRAL) }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#14243D" }}>Approved Drivers <span style={{ color: "#223C6A" }}>→</span></div>
                <div style={{ fontSize: 12, color: driversExpiredCount > 0 ? "#B91C1C" : "#6B7280", marginTop: 2, fontWeight: driversExpiredCount > 0 ? 700 : 400 }}>{driversExpiredCount > 0 ? driversExpiredCount + " licence" + (driversExpiredCount > 1 ? "s" : "") + " expired" : driverList.length + " approved to drive"}</div>
              </button>
              {/* ★ isHRExec, NOT full(acting) — `full` includes Payroll, and Bri
                  ruled Cindy out of CFA Home explicitly. */}
              {isHRExec(acting) && (
              <button className="hr-ctlbtn" onClick={() => setView("cfahome")} style={{ textAlign: "left", backgroundColor: "#FCFBF8", border: "1px solid #E4E3DD", borderRadius: 12, padding: "12px 14px", cursor: "pointer", ...tileDepth(ACCENT_NEUTRAL) }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#14243D" }}>CFA Home logins <span style={{ color: "#223C6A" }}>→</span></div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>Import the spreadsheet. Each login also shows on that person's file.</div>
              </button>
              )}
              {(sends || []).length > 0 && (
                <button className="hr-ctlbtn" onClick={() => setView("docsends")} style={{ textAlign: "left", backgroundColor: "#FCFBF8", border: "1px solid #E4E3DD", borderRadius: 12, padding: "12px 14px", cursor: "pointer", ...tileDepth(ACCENT_NEUTRAL) }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#14243D" }}>Sent <span style={{ color: "#223C6A" }}>→</span></div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{(sends || []).length} document{(sends || []).length === 1 ? "" : "s"}</div>
                </button>
              )}
            </div>
          )}

          {/* ⚠️ THE HUB REPORTED THESE AS SENT. That is the whole reason this
              exists. A blocked address is answered with a 200 and an id and then
              delivered nowhere, so every send looked fine and one team member
              went eight days without a single notice before anybody noticed. */}
          {(() => {
            const rows = blockedRoster(TEAM_EFF, (m) => infoOf(m).email, blockedMap);
            if (!rows || !rows.length) return null;
            return (
              <div style={{ border: "1px solid #FDE68A", background: "#FFFBEB", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#92400E" }}>
                  {rows.length === 1
                    ? "1 person is not receiving Hub emails"
                    : `${rows.length} people are not receiving Hub emails`}
                </div>
                <div style={{ fontSize: 12, color: "#92400E", marginTop: 4, lineHeight: 1.5 }}>
                  Their address bounced, so the mail provider stopped delivering to it.
                  The Hub still reports these as sent. Check the address with them, fix
                  it below, and it starts working again.
                </div>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5, color: "#7C2D12", lineHeight: 1.6 }}>
                  {rows.map((r) => (
                    <li key={r.id}>
                      <b>{r.name}</b> · {r.email}{r.since ? ` · since ${r.since}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}

          {canEditRoster(acting) && <TeamDocsImportPanel existing={TEAM_EFF} onImport={addMembers} />}
          {canEditRoster(acting) && <TeamImportBox roster={TEAM_EFF} titleOptions={TITLE_OPTIONS} S={S} onAdd={addMembers} />}
          {canEditRoster(acting) && <AddMemberPanel onAdd={addMember} />}

          {/* Hannah, Matt and Nick only. Returns null for everybody else. */}
          <PayRates actingId={actingId} roster={TEAM_EFF} S={S} />

          {/* ⚠️ `mutInfo` REPLACES THE WHOLE MAP with what the import merged,
              because the importer already re-read and merged per field. Passing
              the merged map back keeps this screen in step without a reload. */}
          {canEditRoster(acting) && (
            <TeamDetails roster={TEAM_EFF} S={S} onImported={(next) => mutInfo(() => next)} />
          )}

          {/* ★★ MOVE THE ROSTER OUT OF THE CODE AND INTO STORAGE.
              Gate City's 106 people live in hrTeam.js, which is compiled into
              the main JavaScript file every visitor to the site downloads
              without signing in. Measured Aug 11 2026: all 106 names are in
              index-*.js. This copies them into gcfcr-hr-added-v1, where every
              other store's roster already lives, so a later change can delete
              them from the source.

              ⚠️ NOTHING VISIBLE HAPPENS WHEN THIS RUNS, AND THAT IS DELIBERATE.
              loadHRTeamResult dedupes by id and keeps the seed row first, so
              during the window between this copy and the deletion each person
              appears exactly once, from the same values as before. The risky
              step and the visible step are separated: if the copy were wrong it
              could be seen and fixed while the code copy still stood behind it.

              ⚠️ IDEMPOTENT. It only ever writes people who are not already
              stored, so a second press has nothing to do and says so.
              ⚠️ full(acting), NOT canEditRoster. The Worker restricts writes to
              this key to a full HR reader, so a looser gate here would draw a
              button that answers 403. */}
          {full(acting) && (() => {
            const pending = rosterRowsMissingFromStorage(TEAM, added);
            if (!addedLoaded) return null;
            return (
              <div style={{ marginTop: 14, backgroundColor: "#FCFBF8", border: "1px solid #E4E3DD", borderRadius: 12, padding: "12px 14px", ...tileDepth(ACCENT_NEUTRAL) }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#14243D" }}>Move the roster into storage</div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4, lineHeight: 1.5 }}>
                  {pending.length
                    ? `${pending.length} ${pending.length === 1 ? "person is" : "people are"} still written into the app's code rather than saved here. Copying them changes nothing you can see — it lets the code copy be deleted, so their names stop being downloadable by anyone who opens the site.`
                    : "Done. Everybody on the roster is saved here rather than written into the app's code."}
                </div>
                {pending.length > 0 && (
                  <button
                    className="hr-ctlbtn"
                    onClick={() => {
                      /* Named plainly: this is the last point at which somebody
                         can stop, and "migrate the roster" means nothing to the
                         person reading it. */
                      if (!window.confirm(`Copy ${pending.length} ${pending.length === 1 ? "person" : "people"} into storage?\n\nNothing on any screen changes. Nobody is added, removed or renamed. This only moves where the list is kept.`)) return;
                      /* ⚠️ SEED ROWS FIRST, EXISTING ROWS AFTER. The roster is
                         read as [...seed, ...added], so writing them in this
                         order keeps today's ordering once the seed is gone. */
                      mutAdded((p) => [
                        ...pending.map((m) => ({
                          id: String(m.id),
                          name: m.name,
                          role: m.role,
                          addedAt: new Date().toISOString(),
                          addedBy: "moved out of the app's code",
                        })),
                        ...(p || []),
                      ]);
                    }}
                    style={{ marginTop: 10, backgroundColor: "#223C6A", color: "#fff", border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                  >
                    Copy {pending.length} into storage
                  </button>
                )}
              </div>
            );
          })()}

          {full(acting) && pendingPricing.length > 0 && (
            <div style={{ background: "#FFF8E6", border: "1px solid #F1E2AE", borderLeft: "3px solid #A9741C", borderTop: "3px solid #A9741C", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#7A5A12", marginBottom: 2 }}>
                {pendingPricing.length} documentation{pendingPricing.length === 1 ? "" : "s"} waiting on a points call
              </div>
              <div style={{ fontSize: 12, color: "#6B7480", marginBottom: 6 }}>
                Filed at zero by a leader, or a type HR always decides. Set the points here — 0 is a real answer — and it leaves this list. Every set is stamped in the entry's history.
              </div>
              {pendingPricing.map((it) => (
                <PricePendingRow key={it.f.id} item={it} onPrice={priceEntry} />
              ))}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            {showTerm && (
              <div style={{ display: "inline-flex", background: "#EDEBE4", borderRadius: 10, padding: 3 }}>
                <button className="hr-seg" onClick={() => setTab("current")} style={{ border: "none", borderRadius: 8, padding: "8px 13px", fontSize: 13, fontWeight: 600, cursor: "pointer", background: effTab === "current" ? "#fff" : "transparent", color: effTab === "current" ? "#14243D" : "#6B7280", boxShadow: effTab === "current" ? "0 1px 3px rgba(20,36,61,.12)" : "none" }}>Current · {curCount}</button>
                <button className="hr-seg" onClick={() => setTab("terminated")} style={{ border: "none", borderRadius: 8, padding: "8px 13px", fontSize: 13, fontWeight: 600, cursor: "pointer", background: effTab === "terminated" ? "#fff" : "transparent", color: effTab === "terminated" ? "#14243D" : "#6B7280", boxShadow: effTab === "terminated" ? "0 1px 3px rgba(20,36,61,.12)" : "none" }}>Terminated · {termCount}</button>
              </div>
            )}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or role" style={{ flex: "1 1 220px", minWidth: 180, padding: "10px 12px", borderRadius: 10, border: "1px solid #E4E3DD", background: "#fff", fontSize: 14, outline: "none", color: "#14243D" }} />
          </div>

          {/* ⚠️ WHY THIS IS LOUD AND HAS A BUTTON ON IT (Jul 28 2026).
              Hannah reported "why can't I see point totals? I also can't see
              id's!" — both are inside `full(acting)` / `isHR(acting)`, so BOTH
              vanish together the moment the leadership session is absent. And
              it goes absent for a reason nobody would guess: `acting` lives in
              localStorage (`gcfcr-hrconsole-acting-v1`), and the installed
              home-screen app and Safari keep SEPARATE localStorage — the same
              split the Hub PINs were moved to KV to escape. Sign in through one,
              open the other, and you are signed out of HR while still looking
              signed in to the Hub.
              The old copy said all this in grey 12px above 106 cards; someone
              scrolling to a name never met it. It now says what is missing, in
              those words, with the fix attached.
              ⚠️ NOT AUTO-SIGNED-IN FROM THE HUB SESSION. That would remove a
              second factor Hannah designed in, and on a shared iPad it is what
              stops a passer-by reading 106 people's points and injuries. */}
          {!full(acting) && (
            <div style={{ ...S.note, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "#FEF7E6", border: "1px solid #E8D9A8", color: "#6B5417", fontSize: 13 }}>
              <div style={{ flex: "1 1 260px", lineHeight: 1.45 }}>
                <strong>You're not in a leadership session, so point totals, documents and file history are hidden.</strong>
                {" "}Tap Leadership Sign-In to see them. Files stay PIN-protected either way — tap your own name to view your record, set your Hub PIN, sign your handbook or report an injury.
              </div>
              <button onClick={() => setSignIn(true)} style={{ background: "#14243D", border: "none", color: "#fff", borderRadius: 9, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Leadership Sign-In</button>
            </div>
          )}

          <div className="hr-grid">
            {list.map((e) => {
              const t = total(e.id);
              const exempt = isHbExempt(e.id);
              const signed = handbook.acks[e.id] && handbook.acks[e.id].version === handbook.version.n;
              const rc = roleColor(e.role);
              return (
                <button key={e.id} className="hr-card" onClick={() => open(e)} style={{ textAlign: "left", backgroundColor: "#fff", border: "1px solid #E4E3DD", borderRadius: 12, padding: "14px 14px 13px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10, width: "100%", ...tileDepth(ACCENT_NEUTRAL) }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <Av name={hrDisplayName(e)} src={avatarFor(e.name)} style={{ width: 42, height: 42, borderRadius: 9, background: "#14243D", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: "#14243D", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis" }}>{hrDisplayName(e)}</div>
                      <span style={{ display: "inline-block", marginTop: 5, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: rc + "15", color: rc }}>{e.role}</span>
                    </div>
                    {!full(acting) && <span style={{ color: "#C9C7BF", fontSize: 18 }}>›</span>}
                  </div>
                  {full(acting) && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #E4E3DD", paddingTop: 9 }}>
                      {exempt
                        ? <span style={{ fontSize: 11.5, color: "#9CA3AF" }}>Handbook exempt</span>
                        : signed
                          ? <span style={{ fontSize: 11.5, fontWeight: 600, color: "#1F7A5C" }}>Handbook signed</span>
                          : <span style={{ fontSize: 11.5, fontWeight: 700, color: "#B4832B" }}>Needs signature</span>}
                      {t !== 0 && <span style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 11.5, fontWeight: 600, color: t < 0 ? "#DD0031" : "#0F766E" }}>{t > 0 ? "+" : ""}{t} pts</span>}
                    </div>
                  )}
                </button>
              );
            })}
            {list.length === 0 && effTab !== "terminated" && <div style={{ gridColumn: "1 / -1", ...S.empty }}>{"No one matches \"" + q + "\"."}</div>}
            {effTab === "terminated" && (() => {
              const qq = q.trim().toLowerCase();
              const arch = ARCHIVE.filter((a) => !qq || a.name.toLowerCase().includes(qq));
              return (
                <>
                  {list.length === 0 && arch.length === 0 && <div style={{ gridColumn: "1 / -1", ...S.empty }}>No terminated team members.</div>}
                  {arch.length > 0 && (
                    <div style={{ gridColumn: "1 / -1", marginTop: 6 }}>
                      <div style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "#6B7280", margin: "4px 0 10px" }}>Archive — terminated employees ({arch.length})</div>
                      <div className="hr-grid">
                        {arch.map((a, i) => (
                          <div key={a.name + i} style={{ background: "#fff", border: "1px solid #E4E3DD", borderRadius: 12, padding: "14px", display: "flex", alignItems: "center", gap: 11 }}>
                            <Av name={a.name} src={avatarFor(a.name)} style={{ width: 42, height: 42, borderRadius: 9, background: "#6B7280", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 }} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "#14243D" }}>{a.name}</div>
                              <span style={{ display: "inline-block", marginTop: 4, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#37415115", color: "#374151" }}>{a.year}{a.rehire ? ` · rehire ${a.rehire}` : ""}</span>
                              {a.notes && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }}>{a.notes}{a.date ? ` · ${a.date}` : ""}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {view === "prof" && sel && (
        <Profile avatarFor={avatarFor} e={sel} status={statusOf(sel.id)} entries={files[sel.id] || []} total={total(sel.id)}
          evals={evals[sel.id] || []} injuries={injuries[sel.id] || []} handbook={handbook}
          hbAck={handbook.acks[sel.id] || null} confAck={handbook.conf[sel.id] || null}
          ldrHandbook={ldrHandbook} ldrHbAck={ldrHandbook.acks[sel.id] || null}
          info={infoOf(sel)} pinIsSet={hasPin(sel.id)} pins={pinSet} acting={acting} selfView={selfView} draft={draft} setDraft={setDraft}
          evalTemplates={evalTemplates}
          isAdded={isAddedId(sel.id)} recordCount={recordCount(sel.id)} canRemoveMember={canEditRoster(acting)} onRemoveMember={() => removeMember(sel.id)}
          onUpdInfo={(p) => updInfo(sel, p)} onToggleTerm={() => toggleTerm(sel)} onSetPin={(v) => setPinValue(sel.id, v)}
          preferredName={(prefNames || {})[String(sel.id)] || ""} onUpdPreferred={(v) => updPreferred(sel, v)}
          onAttach={attach} onEditEntry={editEntry} onRemove={removeEntry} onRestore={restoreEntry} onSignEntry={signFileEntry}
          onAddEval={addEval} onEditEval={editEval} onRemoveEval={removeEval} onAddInjury={addInjury}
          ldrPts={ldrPts} onFileLdrPoint={addLdrPoint} onVoidLdrPoint={voidLdrPoint} onFileLdrPending={fileLdrPending}
          onSignHb={(s) => signHandbook(sel.id, s)} onSignConf={(s) => signConf(sel.id, s)}
          onSignLdrHb={(s) => signLdrHandbook(sel.id, s)} onSetRole={setRole}
          docs={docFiles[sel.id] || []} onUploadDoc={(file, cat, viaSelf) => addDoc(sel, file, cat, viaSelf)} onApproveDoc={(id) => approveDoc(sel.id, id)} onRejectDoc={(id) => rejectDoc(sel.id, id)} onViewDoc={viewDoc}
          onRetypeDoc={(id, cat) => retypeDoc(sel.id, id, cat)} onRemoveDoc={(id) => removeDoc(sel.id, id)} cfaHome={cfaHome} onSaveCfaHome={saveCfaHome} />
      )}

      {view === "sigs" && full(acting) && (
        <SignatureStatus avatarFor={avatarFor}
          team={TEAM_EFF} statusOf={statusOf} handbook={handbook} ldrHandbook={ldrHandbook} pins={pinSet}
          onBack={() => setView("dir")} onOpen={(m) => open(m)}
        />
      )}

      {view === "tpls" && canEditTemplates(acting) && (
        <TemplateEditor templates={evalTemplates} allEvals={evals} team={TEAM_EFF} onSave={saveTemplates} />
      )}

      {view === "sop" && (
        <SopLibrary docs={sopDocs} onBack={() => setView("dir")} canSend={full(acting)} canManage={full(acting)} onSaveDoc={saveSopDoc} onDeleteDoc={deleteSopDoc} team={TEAM_EFF.filter((m) => statusOf(m.id) !== "terminated")} roles={Array.from(new Set(TEAM_EFF.map((m) => m.role)))} areas={Array.from(new Set(TEAM_EFF.map((m) => infoOf(m).area).filter(Boolean)))} onSend={sendDoc} />
      )}
      {view === "docsends" && full(acting) && (
        <SentDocsView sends={sends} team={TEAM_EFF} statusOf={statusOf} onDelete={deleteSend} onUndoAck={undoAck} onBack={() => setView("dir")} />
      )}
      {view === "docreview" && full(acting) && (
        <DocReview docFiles={docFiles} team={TEAM_EFF} onApprove={approveDoc} onReject={rejectDoc} onView={viewDoc} onBack={() => setView("dir")} />
      )}
      {view === "evalassign" && canAssignEvals(acting) && (
        <AssignEvals templates={evalTemplates} team={TEAM_EFF.filter((m) => statusOf(m.id) !== "terminated")}
          teamDir={teamDir} copy={{ ...EVAL_COPY_DEFAULT, ...(evalCopy || {}) }}
          onCopy={(patch) => mutEvalCopy((p) => ({ ...EVAL_COPY_DEFAULT, ...(p || {}), ...patch }))}
          onAssign={assignEvals} onBack={() => setView("dir")} />
      )}
      {view === "evaltasks" && (
        <MyEvalTasks tasks={myOpenTasks} templates={evalTemplates} acting={acting}
          copy={{ ...EVAL_COPY_DEFAULT, ...(evalCopy || {}) }}
          /* Rank 4+ is Assistant Director and up, the same set the assignment
             screen offers as "who completes them" — one rule, one place. */
          leaders={TEAM_EFF.filter((m) => statusOf(m.id) !== "terminated" && rankOf(m) >= 4)}
          onRecommend={recommendTask}
          onSubmit={submitTask} onBack={() => setView("dir")} />
      )}
      {view === "evalmanage" && canAssignEvals(acting) && (
        <ManageEvalTasks tasks={tasks} team={TEAM_EFF.filter((m) => statusOf(m.id) !== "terminated")}
          onApproveRec={approveRec} onDenyRec={denyRec}
          onPatch={patchTask} onDelete={deleteTask} onBack={() => setView("dir")} />
      )}
      {view === "evalapprove" && canApproveEvals(acting) && (
        <EvalApprovals tasks={pendingApproval} templates={evalTemplates}
          onApprove={approveTask} onReturn={returnTask} onDelete={deleteTask} onBack={() => setView("dir")} />
      )}
      {view === "cfahome" && isHRExec(acting) && (
        <CfaHomeImport
          team={TEAM_EFF.filter((m) => statusOf(m.id) !== "terminated")}
          onImport={(rows) => mutCfaHome((prev) => {
            const next = { ...(prev || {}) };
            rows.forEach((r) => { next[r.id] = { username: r.username, password: r.password, at: new Date().toISOString() }; });
            return next;
          })}
          onBack={() => setView("dir")}
        />
      )}
      {view === "drivers" && full(acting) && (
        <ApprovedDrivers
          drivers={driverList}
          team={TEAM_EFF.filter((m) => statusOf(m.id) !== "terminated")}
          actingName={acting ? acting.name : "HR"}
          onSave={(next) => setDrivers(() => next)}
          onBack={() => setView("dir")}
        />
      )}
      {view === "intake" && full(acting) && (
        <OnboardingIntake rows={openIntake} team={TEAM_EFF.filter((m) => statusOf(m.id) !== "terminated")} onView={viewDoc} onMatch={fileIntake} onCreate={createFromIntake} onDiscard={discardIntake} onRefresh={loadIntake} onBack={() => setView("dir")} />
      )}
      {/* ★★ CASH SHORTAGES WAITING TO BE DOCUMENTED (Hannah, Aug 10 2026).
          ⚠️ THIS SCREEN NEVER WRITES TO A FILE, and that is deliberate. "Open
          their file" takes her to the person and she documents it with the
          normal flow, which is the ONE writer of gcfcr-hr-files. A second
          writer, fed by a money tile, is how a cash shortage lands on the wrong
          person's permanent record.
          ⚠️ GATED ON full(acting), the same as the uniform tab: this names a
          person and an amount, which is HR information, not a leader's view.
          ⚠️ `canOpen` STILL DECIDES whether the profile opens. This list must
          not become a side door into a file somebody may not read. */}
      {view === "cashdocs" && full(acting) && (
        <div style={S.body}>
          <button style={S.sec} onClick={() => setView("dir")}>← Back</button>
          <div style={S.sLbl}>Cash shortages to document</div>
          <div style={{ ...S.note, marginBottom: 12 }}>
            A leader logged each of these in Cash Audit. Nothing here is on
            anybody's file yet. Open their file and document it, then dismiss it
            from this list.
          </div>
          {cashDocsOpen.length === 0 && (
            <div style={{ ...S.card, color: "#6B7280", fontSize: 13.5 }}>Nothing waiting.</div>
          )}
          {cashDocsOpen.map((d) => {
            const person = TEAM_EFF.find((m) => String(m.id) === String(d.personId));
            return (
              <div key={d.id} style={S.card}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>
                  {d.personName || (person && person.name) || "Somebody"}
                  <span style={{ marginLeft: 8, color: "#B91C1C", fontWeight: 800 }}>
                    {"−$" + Math.abs(Number(d.amount) || 0).toFixed(2)}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 3 }}>
                  {d.date}{d.loggedBy ? ` · logged by ${d.loggedBy}` : ""}
                  {d.hasDoc ? " · photo attached in Cash Audit" : ""}
                </div>
                {d.reason && (
                  <div style={{ fontSize: 13, color: "#374151", marginTop: 6 }}>{d.reason}</div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {/* ⚠️ SAME GATE AS EVERY OTHER WAY INTO A PROFILE. If she may
                      not open this person, the button is not offered — rather
                      than offered and silently doing nothing, which is the Ben
                      Smith failure this file already carries a scar for. */}
                  {person && canOpen(acting, person) ? (
                    <button style={S.prim} onClick={() => { setSel(person); setSelfView(false); setView("prof"); setDraft(null); }}>
                      Open their file
                    </button>
                  ) : (
                    <span style={{ fontSize: 12.5, color: "#B45309" }}>
                      {person ? "You cannot open this person's file." : "This person is no longer on the roster."}
                    </span>
                  )}
                  <button style={S.sec} onClick={() => {
                    if (!window.confirm(
                      `Dismiss the ${"−$" + Math.abs(Number(d.amount) || 0).toFixed(2)} shortage for ${d.personName || "this person"}?\n\n` +
                      "It stays in the Cash Audit ledger. This only clears it from this list."
                    )) return;
                    /* ⚠️ MARKED, NEVER DELETED. Who cleared it and when is the
                       question somebody asks in three months, and a removed row
                       cannot answer it. The list filters on status, so a
                       dismissed row simply stops showing. */
                    mutCashDocs((p) => (Array.isArray(p) ? p : []).map((x) =>
                      x && x.id === d.id
                        ? { ...x, status: "dismissed", dismissedBy: actingSig(acting), dismissedAt: new Date().toISOString() }
                        : x));
                  }}>Dismiss</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {view === "uniform" && full(acting) && (
        <UniformOrders
          rows={openUniform}
          total={uniformTotal}
          /* 🐛 THE BUTTON THREW AND NOTHING SAVED (Hannah, Aug 7 2026 7:11am:
             "The fulfilled button does not seem to work on that").
             usePersisted's second slot is a MUTATOR — `mutate(fn)` calls
             `fn(ref.current)` — and this handed it an ARRAY. Every tap raised
             "fn is not a function" inside the click handler, so nothing
             persisted, nothing rendered, and the tab kept the order. A button
             that is visible and does nothing: the exact signature the checks
             list names for an unbound identifier, from the other direction.
             ⚠️ Guarded on read too. A failed load leaves this at its initial
             [], and `p` must never be assumed to be an array. */
          onFulfil={(id) => setUniformDone((p) => {
            const cur = Array.isArray(p) ? p : [];
            return cur.includes(id) ? cur : [...cur, id];
          })}
          onRefresh={loadUniform}
          onBack={() => setView("dir")}
        />
      )}
      {/* The moved-in tiles. `find` and not an index, so reordering the array in
          App.jsx cannot open the wrong panel. If the id no longer matches
          anything — someone lost access between renders — nothing renders and the
          back arrow above still returns to the register. */}
      {String(view).startsWith("launch:") && (
        <div style={{ padding: "0 0 44px" }}>
          {(launchers.find((L) => "launch:" + L.id === view) || {}).node || null}
        </div>
      )}
    </div>

    {pinFor && (
      <Overlay onClose={() => setPinFor(null)}>
        {pinFor.__locked ? (
          <>
            <div style={S.mTitle}>PIN Not Set Up Yet</div>
            <div style={S.mSub}>{pinFor.name} hasn't set a personal PIN yet, so this file is locked. Ask a Director or above to sign in with Leadership Sign-In and open it — {pinFor.name} can then set their own PIN inside.</div>
            <div style={S.mAct}><button style={S.prim} onClick={() => setPinFor(null)}>Got it</button></div>
          </>
        ) : (
          <>
            <div style={S.mTitle}>Enter PIN</div>
            <div style={S.mSub}>{pinFor.name} must enter their PIN to view this file.</div>
            <input type="password" inputMode="numeric" value={pinVal} onChange={(e) => { setPinVal(e.target.value); setPinErr(""); }} placeholder="••••" style={S.pinIn} />
            {pinErr && <div style={S.err}>{pinErr}</div>}
            <div style={S.mAct}><button style={S.sec} onClick={() => setPinFor(null)}>Cancel</button><button style={S.prim} onClick={tryPin}>View File</button></div>
          </>
        )}
      </Overlay>
    )}
    {signIn && <SignIn team={TEAM_EFF} onClose={() => setSignIn(false)} onOk={(e) => { setActing(e); setSignIn(false); }} />}
    {showPush && <PushModal version={handbook.version} label="Team Handbook" onClose={() => setShowPush(false)} onOk={(l) => { pushHandbook(l); setShowPush(false); }} />}
    {showPushLdr && <PushModal version={ldrHandbook.version} label="Leadership Handbook" onClose={() => setShowPushLdr(false)} onOk={(l) => { pushLdrHandbook(l); setShowPushLdr(false); }} />}
  </div>);
}

/* ════════════════════════════════════════════════════════════════
   EVALUATION TEMPLATE EDITOR — LDD (Bri) and up
   ────────────────────────────────────────────────────────────────
   Moved here from Team Documentation, which wrote gcfcr-hr-evaltpl-v1 to
   window.storage while this console read the same key from Supabase. Same name,
   opposite store: every template ever built was invisible here, and this console
   quietly used its 5 hardcoded dimensions instead. Now the editor and the reader
   are the same store — kvSet via usePersisted's mutator.

   DELETE IS GUARDED BY USE. A template isn't just a form; it's the only thing
   that knows what "c3" MEANS on every evaluation ever run from it. Delete one
   and its evaluations keep their scores but lose every category name — the same
   orphaning that made two evals unmigrateable, one level up. So the editor counts
   the evaluations pointing at a template and refuses to delete a template that's
   in use, rather than warning and letting it happen anyway.
   ════════════════════════════════════════════════════════════════ */
function TemplateEditor({ templates, allEvals, team, onSave }) {
  const live = tplsOf(templates);
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [labelsOpen, setLabelsOpen] = useState(null);
  const [toast, setToast] = useState("");
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  // How many evaluations across the whole store were run from each template.
  const useCount = (tplId) => Object.values(allEvals || {}).reduce(
    (n, list) => n + (list || []).filter((ev) => ev.templateId === tplId).length, 0);

  const commit = (next) => { onSave(next); };

  const saveTpl = () => {
    const t = { ...editing, name: (editing.name || "").trim(),
      sections: (editing.sections || []).filter((s) => (s.name || "").trim()),
      categories: (editing.categories || []).filter((c) => (c.name || "").trim()) };
    if (!t.name) { flash("Give the template a name"); return; }
    if (!t.categories.length) { flash("Add at least one category"); return; }
    const exists = live.some((x) => x.id === t.id);
    commit(exists ? live.map((x) => (x.id === t.id ? t : x)) : [...live, t]);
    setEditing(null);
    flash(exists ? "Template saved" : "Template created");
  };
  const copyTpl = (t) => {
    // Section ids must be REMAPPED on copy, not reused — otherwise the copy's
    // categories point at the original's sections and the two drift together.
    const secMap = {};
    const newSecs = (t.sections || []).map((s) => { const ns = { ...s, id: uid("s") }; secMap[s.id] = ns.id; return ns; });
    commit([...live, { ...t, id: uid("tpl"), name: t.name + " (copy)", sections: newSecs,
      categories: (t.categories || []).map((c) => ({ ...c, id: uid("c"), sectionId: secMap[c.sectionId] || "" })) }]);
    flash("Template copied");
  };
  const delTpl = (t) => { commit(live.filter((x) => x.id !== t.id)); setConfirmDel(null); flash("Template deleted"); };

  if (editing) {
    const setCat = (cid, patch) => setEditing({ ...editing, categories: editing.categories.map((c) => (c.id === cid ? { ...c, ...patch } : c)) });
    const secs = Array.isArray(editing.sections) ? editing.sections : [];
    const setSec = (sid, patch) => setEditing({ ...editing, sections: secs.map((s) => (s.id === sid ? { ...s, ...patch } : s)) });
    // Order is the array order, and grouping is sectionId — so moving a category
    // "between sections" is just the dropdown, and ▲▼ reorders within the list.
    const moveCat = (i, d) => {
      const j = i + d; if (j < 0 || j >= editing.categories.length) return;
      const next = editing.categories.slice(); [next[i], next[j]] = [next[j], next[i]];
      setEditing({ ...editing, categories: next });
    };
    const mixed = tplMax(editing) === null;
    return (
      <div style={S.body}>
        <div style={S.card}>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#111827", marginBottom: 8 }}>{live.some((x) => x.id === editing.id) ? "Edit template" : "New template"}</div>
          <Lbl t="Template name" />
          <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Trainer 90-day review" style={S.in} />
          <Lbl t="Sections" />
          <div style={{ fontSize: 11.5, color: "#6B7280", marginBottom: 8, lineHeight: 1.45 }}>
            Group categories into sections. Turn <b>Scored</b> off for a section you don't want counted in the Overall
            — the ratings are still recorded, they just don't move the average.
          </div>
          {secs.map((sx) => (
            <div key={sx.id} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <input value={sx.name} placeholder="Section name" onChange={(e) => setSec(sx.id, { name: e.target.value })} style={{ ...S.in, flex: 1, marginBottom: 0 }} />
              <button onClick={() => setSec(sx.id, { score: sx.score === false })}
                style={{ ...S.sec, padding: "9px 11px", minWidth: 104, color: sx.score === false ? "#92400E" : "#0F766E",
                  background: sx.score === false ? "#FEF3C7" : "#ECFDF5" }}>
                {sx.score === false ? "Not scored" : "Scored"}
              </button>
              <button style={{ ...S.sec, padding: "9px 11px", color: "#DD0031" }}
                onClick={() => setEditing({ ...editing, sections: secs.filter((x) => x.id !== sx.id),
                  categories: editing.categories.map((c) => (c.sectionId === sx.id ? { ...c, sectionId: "" } : c)) })}>✕</button>
            </div>
          ))}
          <button style={{ ...S.sec, width: "100%", marginTop: 2, marginBottom: 12 }}
            onClick={() => setEditing({ ...editing, sections: [...secs, { id: uid("s"), name: "", score: true }] })}>+ Add section</button>

          <Lbl t="Categories & scale" />
          {editing.categories.map((c, i) => (
            <div key={c.id} style={{ border: "1px solid #E5E7EB", borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input value={c.name} placeholder={"Category " + (i + 1)} onChange={(e) => setCat(c.id, { name: e.target.value })} style={{ ...S.in, flex: 1, marginBottom: 0 }} />
                <select value={c.max} onChange={(e) => setCat(c.id, { max: parseInt(e.target.value, 10) })} style={{ ...S.in, width: 86, marginBottom: 0 }}>
                  {SCALE_OPTIONS.map((n) => <option key={n} value={n}>1–{n}</option>)}
                </select>
                <button style={{ ...S.sec, padding: "9px 10px" }} disabled={i === 0} onClick={() => moveCat(i, -1)}>▲</button>
                <button style={{ ...S.sec, padding: "9px 10px" }} disabled={i === editing.categories.length - 1} onClick={() => moveCat(i, 1)}>▼</button>
                <button style={{ ...S.sec, padding: "9px 11px", color: "#DD0031" }} onClick={() => setEditing({ ...editing, categories: editing.categories.filter((x) => x.id !== c.id) })}>✕</button>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                <select value={c.sectionId || ""} onChange={(e) => setCat(c.id, { sectionId: e.target.value })} style={{ ...S.in, width: 190, marginBottom: 0 }}>
                  <option value="">— No section —</option>
                  {secs.map((sx) => <option key={sx.id} value={sx.id}>{sx.name || "Untitled section"}</option>)}
                </select>
                <button onClick={() => setCat(c.id, { allowNA: !c.allowNA })}
                  style={{ ...S.sec, padding: "9px 11px", color: c.allowNA ? "#0F766E" : "#6B7280" }}>
                  {c.allowNA ? "N/A allowed" : "No N/A"}
                </button>
                <button onClick={() => setLabelsOpen(labelsOpen === c.id ? null : c.id)} style={{ ...S.sec, padding: "9px 11px" }}>
                  {labelsOpen === c.id ? "Hide labels" : "Rating labels"}
                </button>
              </div>
              {labelsOpen === c.id && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11.5, color: "#6B7280", marginBottom: 6 }}>
                    Name each rating in your own words. Leave blank to show just the number.
                  </div>
                  {Array.from({ length: Number(c.max) || 5 }, (_, k) => k + 1).map((v) => (
                    <div key={v} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <span style={{ width: 20, fontWeight: 800, fontSize: 12, color: "#374151" }}>{v}</span>
                      <input value={(c.labels || {})[v] || ""} placeholder={"Label for " + v}
                        onChange={(e) => setCat(c.id, { labels: { ...(c.labels || {}), [v]: e.target.value } })}
                        style={{ ...S.in, flex: 1, marginBottom: 0 }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          <button style={{ ...S.sec, width: "100%", marginTop: 2, marginBottom: 10 }} onClick={() => setEditing({ ...editing, categories: [...editing.categories, { id: uid("c"), name: "", max: 5, sectionId: "" }] })}>+ Add category</button>
          {mixed && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "9px 11px", fontSize: 12, color: "#92400E", lineHeight: 1.45, marginBottom: 10 }}>
              <b>Mixed scales in one template.</b> Each category still scores and displays correctly, but the
              <b> Overall</b> average has no single scale to report against — a 5 out of 5 and a 5 out of 10 aren't the
              same 5. Overall will show a bare number instead of a fraction. Use one scale throughout if you want a
              meaningful Overall.
            </div>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button style={S.sec} onClick={() => setEditing(null)}>Cancel</button>
            <button style={S.prim} onClick={saveTpl}>Save Template</button>
          </div>
        </div>
        {toast && <div style={S.toast}>{toast}</div>}
      </div>
    );
  }

  return (
    <div style={S.body}>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 4 }}>Evaluation Templates</div>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12, lineHeight: 1.45 }}>
        These are the forms every evaluation is run from. Editing a template changes future evaluations — evaluations
        already on file keep the scores they were given.
      </div>
      {!templates && (
        <div style={S.note}>
          No templates in the shared database yet — this is the built-in starter form. If you built templates in
          <b> Team Documentation</b>, open its <b>Evals → Templates</b> tab and tap <b>Publish to HR Console</b> to
          bring them across, then come back here.
        </div>
      )}
      <button style={S.full} onClick={() => setEditing({ id: uid("tpl"), name: "", sections: [], categories: [{ id: uid("c"), name: "", max: 5, sectionId: "" }] })}>+ New Template</button>
      {live.map((t) => {
        const used = useCount(t.id);
        const mx = tplMax(t);
        return (
          <div key={t.id} style={S.fCard}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, color: "#111827" }}>{t.name}</div>
              <div style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "#EEF2FF", color: "#4338CA" }}>
                {mx ? "1–" + mx + " scale" : "mixed scales"}
              </div>
              <div style={{ marginLeft: "auto", fontSize: 12, color: "#9CA3AF" }}>{used} {used === 1 ? "evaluation" : "evaluations"}</div>
            </div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6, lineHeight: 1.5 }}>
              {(t.categories || []).length} {(t.categories || []).length === 1 ? "category" : "categories"} · {(t.categories || []).map((c) => c.name).filter(Boolean).join(", ")}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, marginTop: 10, alignItems: "center" }}>
              {confirmDel === t.id ? (
                <>
                  <span style={{ fontSize: 12, color: "#DD0031", fontWeight: 600 }}>Delete this template?</span>
                  <button style={S.rm} onClick={() => delTpl(t)}>Yes, delete</button>
                  <button style={{ ...S.rm, color: "#6B7280" }} onClick={() => setConfirmDel(null)}>Cancel</button>
                </>
              ) : (
                <>
                  {/* `categories` guarded like `sections` beside it — this is the
                      only place a STORED template becomes `editing`, so one guard
                      here keeps every editing.categories read below safe. */}
                  <button style={{ ...S.rm, color: "#223C6A" }} onClick={() => setEditing({ ...t, sections: (t.sections || []).map((s) => ({ ...s })), categories: (t.categories || []).map((c) => ({ ...c })) })}>Edit</button>
                  <button style={{ ...S.rm, color: "#0F766E" }} onClick={() => copyTpl(t)}>Copy</button>
                  {/* A template in use is the only record of what its category
                      ids mean. Deleting it would strip the names off every
                      evaluation run from it — scores with no questions. */}
                  {used > 0
                    ? <span style={{ fontSize: 11, color: "#9CA3AF" }} title="Delete is blocked while evaluations reference this template">In use — can't delete</span>
                    : <button style={S.rm} onClick={() => setConfirmDel(t.id)}>Delete</button>}
                </>
              )}
            </div>
          </div>
        );
      })}
      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   ADD A TEAM MEMBER — LDD and up
   ────────────────────────────────────────────────────────────────
   The thing HR Console could not do. RAW_TEAM is a hardcoded array; before this
   the only add path in the Hub was Team Documentation's, which wrote a key this
   console never read — so a new hire had no file, no PIN and no handbook row
   here. That made the Team Docs tile un-cuttable: killing it would have removed
   the only way to onboard anyone.

   Appends to gcfcr-hr-added-v1. No edit, no delete, on purpose — every record in
   this console (file, points, evals, injuries, handbook ack, PIN) is keyed by
   member id, so removing someone from the roster orphans all of it while
   leaving it in the store. Terminating is what you want instead, and that
   already exists on the profile: it keeps the person and their whole history,
   and drops their Hub access the moment the status flips.
   ════════════════════════════════════════════════════════════════ */
function AddMemberPanel({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", role: "Team Member", email: "" });
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const reset = () => { setF({ name: "", role: "Team Member", email: "" }); setErr(""); setOpen(false); };
  const save = () => {
    if (!f.name.trim()) return setErr("Name is required.");
    const r = onAdd(f);
    if (!r.ok) return setErr(r.err);
    setDone(f.name.trim());
    setTimeout(() => setDone(""), 4000);
    reset();
  };
  if (!open) {
    return (
      <>
        {done && (
          <div style={{ ...S.self, background: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }}>
            ✓ <b>{done}</b> added. Open their file to set their PIN — they can't sign in or sign anything until you do.
          </div>
        )}
        <button style={{ ...S.hbBtn, background: "#fff", color: "#223C6A", border: "1px solid #D1D5DB", width: "100%", marginBottom: 12 }} onClick={() => { setErr(""); setOpen(true); }}>
          + Add team member
        </button>
      </>
    );
  }
  return (
    <div style={S.card}>
      <div style={{ fontWeight: 700, fontSize: 15, color: "#111827", marginBottom: 8 }}>Add team member</div>
      <Lbl t="Full name" />
      <input value={f.name} onChange={(e) => { setF({ ...f, name: e.target.value }); setErr(""); }} placeholder="First Last" style={S.in} />
      <Lbl t="Role" />
      <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} style={S.in}>
        {TITLE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <Lbl t="Email (for notifications)" />
      <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@email.com" style={S.in} />
      {err && <div style={S.err}>{err}</div>}
      <div style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.5, margin: "6px 0 10px" }}>
        They'll appear in the roster immediately with no PIN. Open their file and set one — that PIN is how they sign
        into every Hub tool, so nothing else works until it's set. Hire date goes on their profile under Employee Details.
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button style={S.sec} onClick={reset}>Cancel</button>
        <button style={S.prim} onClick={save}>Add to roster</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   IMPORT ANYONE TEAM DOCS ADDED — LDD and up
   ────────────────────────────────────────────────────────────────
   The ONLY read of gcfcr-hr-team-v1 in this file. Team Documentation's roster
   is the seed plus anyone added through its "+ Add team member" form; this
   console has never read that key, so those people exist there and nowhere
   here. This finds them by name and offers to bring them across.

   SELF-ANSWERING BY DESIGN: it renders nothing at all when there's no-one to
   import. If this panel never appears, nobody was ever added over there and the
   split cost you nothing — which is a better answer than Claude guessing at how
   many people are affected, since guessing is exactly what went wrong earlier
   today. Match is BY NAME (lowercased, trimmed) because the two tools use
   incompatible id schemes and name is the only field they share.
   ════════════════════════════════════════════════════════════════ */
function TeamDocsImportPanel({ existing, onImport }) {
  const [strays, setStrays] = useState(null);   // null = still looking · [] = none
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const td = await kvGet(TEAMDOCS_ROSTER_KEY);
        if (!alive || !Array.isArray(td)) { if (alive) setStrays([]); return; }
        const have = new Set(existing.map((x) => x.name.trim().toLowerCase()));
        const missing = td.filter((m) => {
          const n = (m.name || "").trim().toLowerCase();
          // Separated over there = don't drag them in. They can be added by hand
          // if that's wrong; silently importing a departed person is worse.
          return n && !have.has(n) && m.status !== "Separated";
        });
        if (alive) setStrays(missing);
      } catch { if (alive) setStrays([]); }
    })();
    return () => { alive = false; };
  }, [existing.length]);

  if (strays === null || (strays.length === 0 && !result)) return null;
  const run = () => {
    if (busy) return;
    if (!window.confirm(`Add ${strays.length} ${strays.length === 1 ? "person" : "people"} from Team Documentation to the HR roster?\n\nThey're on the roster there but have no file here. Nothing in Team Documentation is changed. Each one still needs a PIN set before they can sign in.`)) return;
    setBusy(true);
    try {
      const n = onImport(strays);
      setResult(n);
      setStrays([]);
    } finally { setBusy(false); }
  };
  if (result !== null) {
    return (
      <div style={{ ...S.self, background: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }}>
        ✓ Imported <b>{result}</b> from Team Documentation. Open each one and set a PIN — they can't sign in until you do.
      </div>
    );
  }
  return (
    <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 13, color: "#92400E", marginBottom: 4 }}>
        {strays.length} {strays.length === 1 ? "person is" : "people are"} on the Team Documentation roster but have no file here
      </div>
      <div style={{ fontSize: 12, color: "#92400E", lineHeight: 1.5, marginBottom: 10 }}>
        {strays.map((m) => m.name).join(", ")} — added over there, never here. That means no employee file, no PIN, and no
        handbook row. Importing gives them all three. Nothing in Team Documentation changes.
      </div>
      <button onClick={run} disabled={busy} style={{ ...S.prim, background: "#B45309", opacity: busy ? 0.6 : 1 }}>
        {busy ? "Importing…" : `Import ${strays.length} to the HR roster`}
      </button>
    </div>
  );
}

/* Remove a mis-added person. Only rendered for `n_` ids (added here, not the
   seeded 106) and only offered when they hold ZERO records. With even one, the
   control becomes a plain statement of why not — a disabled button with no
   reason is just a mystery, and "terminate instead" is the actual answer. */
function RemoveMember({ name, records, onRemove }) {
  const [confirm, setConfirm] = useState(false);
  if (records > 0) {
    return (
      <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600 }} title="Only a member with no records at all can be removed">
        {records} {records === 1 ? "record" : "records"} on file — terminate instead of removing
      </span>
    );
  }
  if (!confirm) {
    return <button style={{ ...S.sec, color: "#DD0031", borderColor: "#FECACA" }} onClick={() => setConfirm(true)}>Remove from roster</button>;
  }
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: "#DD0031", fontWeight: 700 }}>Remove {name.split(" ")[0]} entirely?</span>
      <button style={{ ...S.prim, background: "#DD0031" }} onClick={() => { setConfirm(false); onRemove(); }}>Yes, remove</button>
      <button style={S.sec} onClick={() => setConfirm(false)}>Cancel</button>
      <span style={{ fontSize: 11, color: "#9CA3AF", width: "100%" }}>
        They hold no file entries, evaluations, injuries or signatures, so nothing is lost. Their PIN is freed for reuse.
        This is for someone added by mistake — for a real departure use <b>Mark Terminated</b>, which keeps their history.
      </span>
    </span>
  );
}

function Profile(props) {
  const avatarFor = props.avatarFor || (() => "");
  const { e, status, entries, total, evals, injuries, ldrPts, onFileLdrPoint, onVoidLdrPoint, onFileLdrPending, handbook, hbAck, confAck, ldrHandbook, ldrHbAck, info, pinIsSet, pins, acting, selfView, draft, setDraft, evalTemplates, isAdded, recordCount, canRemoveMember, onRemoveMember, onUpdInfo, onToggleTerm, onSetPin, preferredName, onUpdPreferred, onAttach, onEditEntry, onRemove, onSignEntry, onAddEval, onEditEval, onRemoveEval, onAddInjury, onSignHb, onSignConf, onSignLdrHb, onSetRole, sends, onAckSend, docs, onUploadDoc, onApproveDoc, onRejectDoc, onViewDoc, onRetypeDoc, onRemoveDoc , cfaHome, onSaveCfaHome } = props;
  // Hannah, Jul 26: "YES, REMOVE THE FOUR COUNSELING LEVELS FROM OTHER
  // VIEWERS." Deliberately NOT folded into `hr` — that flag also carries
  // Work Authorization and in-file access, which Cindy (role "Payroll")
  // legitimately needs. Issuing a counseling is the one thing that is
  // Hannah's alone, so it gets its own gate rather than narrowing hers.
  const leader = full(acting), hr = isHR(acting) || isPayroll(acting), hrExec = isHRExec(acting), canDoc = canDocument(acting, e);
  const canCounsel = isHR(acting);
  // A leader viewing their OWN profile is still the person themselves — they
  // may sign their own handbooks. Previously canSign was selfView-only, and a
  // leadership session never sets selfView, so Directors could never sign.
  const isSelf = selfView || (!!acting && acting.id === e.id);
  // WRITE-ONLY MODE. A Team Leader / AD who can document someone but can't read
  // their file gets ONE thing: the documentation form. No history, no point
  // total, no evaluations, no injuries, no handbook status — nothing that would
  // let them infer where a person sits on the ladder. Escalation is HR's call.
  const canRead = selfView || canReadFile(acting, e);
  const docOnly = !canRead && canDoc;
  const [sec, setSec] = useState("file");
  // Leadership Handbook applies to profiles at Team Leader tier and up.
  const myDocs = (sends || []).filter((s) => (s.targetIds || []).includes(e.id));
  /* ★ THE TAB ONLY EXISTS FOR LEADERS (Hannah + Bri: "visible to be used upon
     a role change to Junior Trainer, Senior Trainer, Team Leader, or Assistant
     Director"). A team member has no leadership duties, so a Leadership
     Standards tab on their file would be a section that can only ever be
     empty and reads as an accusation waiting to happen. */
  const LDR_ROLES = ["Junior Trainer", "Senior Trainer", "Team Leader", "Assistant Director"];
  const isLeaderRole = LDR_ROLES.includes(String((e && e.role) || ""));
  /* ⚠️ FILING IS DIRECTOR AND UP, NOT canDocument.
     🐛 Bri, Aug 3 2026: "We need permission to document under this area limited
     to Directors, HR, and Ex Directors. ADs and below should only be able to
     view this section in their own file."
     I had this on `hrExec || canDoc`, and canDocument is DOC_MIN — rank 3, a
     Senior Trainer or Team Leader. That would have let a Team Leader file a
     leadership point against another leader, which is not a small mistake in a
     system whose top step is a demotion review. `full` is FULL_MIN, rank 5,
     which is exactly the line she drew: Director, LDD, Ex Director, HR, Owner.

     ⚠️ AND THE SECTION ITSELF IS SCOPED. Below Director you see it only on
     your OWN file. Nobody under Director should be reading a peer's standing —
     that is the difference between a documented ladder and gossip. */
  const canFileLdr = leader;
  /* ★ SUBMIT, NOT FILE (Hannah, Aug 4 2026: "I want to leave Brandon and Daisy
     as they are in the hub for now. If they need to file something, leave it
     pending for HR review and I can file it").
     A Director who is not on the HR Console list can now LOG one. It sits
     pending, counts for nothing, and notifies nobody until Hannah files it.
     ⚠️ canDoc, not rank alone — it already carries "may document this person AND
     outranks them", which is the same judgment a leadership point needs. It
     cannot be used on a peer or upward. */
  const canSubmitLdr = !canFileLdr && canDoc;
  const showLdr = isLeaderRole && (canFileLdr || canSubmitLdr || isSelf);
  const SECTIONS = [["file", "File"], ["points", "Points"], ...(showLdr ? [["leadership", "Leadership"]] : []), ["evals", "Evaluations"], ["apps", "Applications"], ["injury", "Injury"], ["handbook", "Handbook"],
    ...(isLeaderTier(e.role) ? [["ldrhandbook", "Ldr Handbook"]] : []), ["conf", "Confidentiality"],
    ...(myDocs.length ? [["docs", "Docs"]] : [])];

  /* ═══ NEITHER READ NOR DOCUMENT: SAY WHY ═══════════════════════════════
     🐛 Ben Smith, Aug 6 2026, twice, at 8pm and again at 10:46pm: "It won't
     let me document that Monica had to leave early and paola staying for us."
     He was not blocked by a bug. canDocument requires the target to be
     STRICTLY BELOW the actor (HRConsole.jsx canDocument), and Ben and Paola
     are both Team Leaders, rank 3. Three is not below three.

     ⚠️ THE RULE IS FINE. THE SILENCE WAS THE DEFECT. The New Documentation
     block is wrapped in `{canDoc && (...)}`, so for a peer it simply is not
     rendered — no message, no greyed button, no reason. He opened a page,
     found nothing, and messaged twice. That is the exact failure the checks
     list names: something that should act and instead does nothing visible.

     ⚠️ THIS DOES NOT WIDEN THE GATE and must not. Whether a leader may
     document a peer is Hannah's ruling, not a UI decision, and it is still
     open with her. This only tells the person what is happening either way,
     so the answer changes one sentence here and nothing else.

     ⚠️ IT NAMES NO DETAIL ABOUT THE PERSON. Someone who cannot read the file
     must not learn from this screen where that person sits on any ladder —
     just the role, which is on the roster card they tapped to get here. */
  if (!canRead && !canDoc) {
    const them = (e.name || "").split(" ")[0] || "They";
    return (
      <div style={S.body}>
        <div style={S.pHead}>
          <Av name={hrDisplayName(e)} src={avatarFor(e.name)} style={{ ...S.av, width: 56, height: 56, fontSize: 18 }} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>{hrDisplayName(e)}</div>
            <div style={{ fontSize: 13, color: "#6B7280" }}>{e.role}</div>
          </div>
        </div>
        <div style={{ ...S.note, marginTop: 14 }}>
          {/* ⚠️ THIS SENTENCE HAS TO MOVE WITH canDocument, AND IT ALMOST DID
              NOT. It was written this morning to explain the old rule — "below
              your own role… which is your level or above" — and Hannah's ruling
              the same afternoon made same-level allowed. An explanation that
              outlives its rule is worse than none, because it sends somebody to
              a Director for something they are now allowed to do themselves.

              ⚠️ AND IT MOVED AGAIN, Aug 10 2026, for exactly that reason. With
              trainers now under Team Leaders for documentation, the sentence
              below was about to tell a Senior Trainer that a TEAM MEMBER was
              "above your level". That is false on its face and it is the kind
              of wrong explanation that gets screenshotted and believed. A
              trainer is not outranked here — they simply do not file — so they
              get their own sentence rather than a rank story that is untrue. */}
          {TRAINER_TITLES.has(effectiveRole(acting)) ? (
            <>
              <b>You can't document {them}.</b> Trainers don't write file entries. That
              is a Team Leader's job and above, whatever the other person's role is.
              <div style={{ marginTop: 8 }}>
                If something needs writing down, tell a Team Leader, a Director or HR
                and they will file it. Don't leave it unrecorded.
              </div>
            </>
          ) : (
            <>
              <b>You can't document {them}.</b> You can write an entry for anyone at or below
              your own role. {them} is {/^[aeiou]/i.test(e.role || "") ? "an" : "a"} {e.role},
              which is above your level.
              <div style={{ marginTop: 8 }}>
                If something needs writing down, a Director or HR can do it. Send it to them
                rather than leaving it unrecorded.
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (docOnly) {
    return (
      <div style={S.body}>
        <div style={S.pHead}>
          <Av name={hrDisplayName(e)} src={avatarFor(e.name)} style={{ ...S.av, width: 56, height: 56, fontSize: 18 }} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{hrDisplayName(e)}</div>
            <span style={{ ...S.badge, background: roleColor(e.role) + "14", color: roleColor(e.role), fontWeight: 700 }}>{e.role}</span>
          </div>
        </div>
        <div style={S.note}>
          <b>Documenting {e.name.split(" ")[0]}.</b> You can add an entry to their file — you can't see what's already in it.
          Write what you saw; HR reviews it, sets any points, and decides whether it escalates.
        </div>
        <FileSection e={e} entries={entries} total={total} leader={false} hr={hr} canCounsel={false} hrExec={false} canDoc={canDoc}
          isSelf={false} acting={acting} info={info} draft={draft} setDraft={setDraft} docOnly
          onUpdInfo={onUpdInfo} onAttach={onAttach} onEditEntry={onEditEntry} onRemove={onRemove} onSignEntry={onSignEntry} />
      </div>
    );
  }

  return (
    <div style={S.body}>
      <div style={S.pHead}>
      <Av name={hrDisplayName(e)} src={avatarFor(e.name)} style={{ ...S.av, width: 56, height: 56, fontSize: 18, borderRadius: 11 }} />
        <div>
          <div style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 10.5, letterSpacing: 1.5, color: "#B4832B", fontWeight: 600 }}>EMPLOYEE RECORD</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#14243D", margin: "2px 0 5px" }}>{hrDisplayName(e)}</div>
          <span style={{ ...S.badge, background: roleColor(e.role) + "14", color: roleColor(e.role), fontWeight: 700 }}>{e.role}</span>
          {status === "terminated" && <span style={{ ...S.badge, background: "#374151", color: "#fff", marginLeft: 6 }}>Terminated</span>}
          {canEditRoles(acting) && <RoleEditor id={e.id} role={e.role} options={canFullTitles(acting) ? TITLE_OPTIONS : TITLE_OPTIONS_LIMITED} onSetRole={onSetRole} />}
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 1, color: "#9CA3AF", fontWeight: 600 }}>Points</div>
          <div style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 26, fontWeight: 600, color: total < 0 ? "#DD0031" : "#0F766E" }}>{total > 0 ? "+" : ""}{total}</div>
        </div>
      </div>

      {selfView && <div style={S.self}>You're viewing your own record. Review your point total, counselings, and evaluations; set the PIN you use across the Hub; sign your handbook and confidentiality statement; and report a workplace injury.</div>}
      {selfView && <SelfPinChange pinIsSet={pinIsSet} selfId={e.id} onSetPin={onSetPin} />}
      {!selfView && isSelf && <div style={S.self}>This is your own profile. You can sign your handbooks here.</div>}

      {leader && !draft && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
          <button style={status === "terminated" ? S.react : S.term} onClick={onToggleTerm}>{status === "terminated" ? "Reactivate" : "Mark Terminated"}</button>
          <PinSetter pins={pins} selfId={e.id} onSetPin={onSetPin} />
          {canRemoveMember && isAdded && <RemoveMember name={e.name} records={recordCount} onRemove={onRemoveMember} />}
        </div>
      )}

      {!draft && (
        <div style={S.pills}>
          {SECTIONS.map(([id, lbl]) => <button key={id} style={{ ...S.pill, ...(sec === id ? S.pillA : {}) }} onClick={() => setSec(id)}>{lbl}</button>)}
        </div>
      )}

      {sec === "file" && <FileSection e={e} entries={entries} total={total} leader={leader} hr={hr} canCounsel={canCounsel} hrExec={hrExec} canDoc={canDoc} isSelf={isSelf} acting={acting} info={info} draft={draft} setDraft={setDraft} onUpdInfo={onUpdInfo} preferredName={preferredName} onUpdPreferred={onUpdPreferred} onAttach={onAttach} onEditEntry={onEditEntry} onRemove={onRemove} onSignEntry={onSignEntry} docs={docs} onUploadDoc={onUploadDoc} onViewDoc={onViewDoc} onRetypeDoc={onRetypeDoc} onRemoveDoc={onRemoveDoc} cfaHome={cfaHome} onSaveCfaHome={onSaveCfaHome} />}
      {sec === "points" && <PointsSection e={e} entries={entries} total={total} />}
      {sec === "leadership" && showLdr && (
        <LeadershipSection e={e} entries={(ldrPts && ldrPts[e.id]) || []}
          canFile={canFileLdr} canSubmit={canSubmitLdr} onFilePending={onFileLdrPending} acting={acting}
          onFile={onFileLdrPoint} onVoid={onVoidLdrPoint} />
      )}
      {sec === "evals" && <EvalSection e={e} evals={evals} leader={leader} acting={acting} onAdd={onAddEval} onEdit={onEditEval} onRemove={onRemoveEval} templates={evalTemplates} />}
      {sec === "apps" && <ApplicationsSection e={e} />}
      {sec === "injury" && <InjurySection e={e} injuries={injuries} leader={leader} selfView={selfView} acting={acting} onAdd={onAddInjury} />}
      {sec === "handbook" && <SignSection title={"Team Handbook — v" + handbook.version.n} sub={handbook.version.label + " · effective " + handbook.version.date} statement={HANDBOOK_STATEMENT} ack={hbAck && hbAck.version === handbook.version.n ? hbAck : null} stale={hbAck && hbAck.version !== handbook.version.n ? hbAck : null} canSign={isSelf} selfView={isSelf} e={e} acting={acting} onSign={onSignHb} signLabel="Sign Acknowledgment" />}
      {sec === "ldrhandbook" && <SignSection title={"Leadership Handbook — v" + ldrHandbook.version.n} sub={ldrHandbook.version.label + " · effective " + ldrHandbook.version.date} statement={LEADERSHIP_HANDBOOK_STATEMENT} ack={ldrHbAck && ldrHbAck.version === ldrHandbook.version.n ? ldrHbAck : null} stale={ldrHbAck && ldrHbAck.version !== ldrHandbook.version.n ? ldrHbAck : null} canSign={isSelf} selfView={isSelf} e={e} acting={acting} onSign={onSignLdrHb} signLabel="Sign Acknowledgment" />}
      {sec === "conf" && <SignSection title="Confidentiality Statement" statement={CONFIDENTIALITY_STATEMENT} ack={confAck} canSign={isSelf} selfView={isSelf} e={e} acting={acting} onSign={onSignConf} signLabel={confAck ? "Re-sign" : "Sign Statement"} />}
      {sec === "docs" && (
        <div>
          {myDocs.map((s) => {
            const ack = (s.acks || {})[e.id] || null;
            const statement = (s.signRequired ? "By signing below, I acknowledge that I have received and read this document." : "This document was shared with you for your reference.") + (s.driveUrl ? "\n\nDocument: " + s.driveUrl : "");
            return (
              <div key={s.id} style={{ marginBottom: 12 }}>
                <SignSection title={s.docTitle} sub={"Sent " + fmtDate(s.createdAt) + (s.signRequired ? " \u00b7 acknowledgment required" : " \u00b7 reference only")} statement={statement} ack={ack ? { date: fmtDate(ack.at), signature: ack.sig } : null} canSign={isSelf && s.signRequired && !ack} selfView={isSelf} e={e} acting={acting} onSign={(sig) => onAckSend(s.id, sig)} signLabel="Acknowledge" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Team member signs a pending file entry from their own file. Self-contained
// input state so each pending entry gets its own signature box.
function PendingSignRow({ name, onSign }) {
  const [sig, setSig] = useState("");
  return (
    <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 8, padding: "9px 11px", marginTop: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 6 }}>Your signature is needed</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input value={sig} onChange={(e) => setSig(e.target.value)} placeholder="Type your full name to sign" style={{ ...S.in, marginBottom: 0, flex: 1, minWidth: 160 }} />
        <button style={{ ...S.prim, ...(sig.trim() ? {} : { opacity: 0.45 }) }} disabled={!sig.trim()} onClick={() => sig.trim() && onSign(sig.trim())}>Sign</button>
      </div>
      <div style={{ fontSize: 11, color: "#9A6A2E", marginTop: 6 }}>By signing you acknowledge you have reviewed this documentation with your leader.</div>
    </div>
  );
}

// One entry card. Pulled out of FileSection's map so the three grouped lists
// (Write-ups / Counselings / Documentation) all render the identical card
// instead of three copies that drift apart.
function EntryCard({ x, e, hrExec, isSelf, onSignEntry, setEditing, onRemove, onRestore }) {
  const [showHist, setShowHist] = useState(false);
  const hist = x.history || [];
  const fmtWhen = (iso) => { try { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return iso; } };
  return (
    <div style={{ ...S.fCard, ...(x.removed ? { opacity: 0.55, borderStyle: "dashed" } : {}) }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700, color: "#111827", textDecoration: x.removed ? "line-through" : "none" }}>{x.title}</div>
        <div style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: AREA_COLORS[x.area] || "#9CA3AF", color: "#fff" }}>{x.counseling ? "Counseling " + x.step : x.area}</div>
        {x.source === "teamdocs" && (
          <div style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 8, background: "#EEF2FF", color: "#4338CA" }} title="Copied here from Team Documentation">
            from Team Docs
          </div>
        )}
        {x.removed && <div style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 8, background: "#F3F4F6", color: "#6B7280" }}>Removed</div>}
        <div style={{ marginLeft: "auto", fontSize: 13, color: "#9CA3AF" }}>{x.date}</div>
      </div>
      {x.needsPricing && !x.removed && (
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: "#B45309", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "6px 10px" }}>
          ⚑ Needs pricing — filed by a leader at 0 pts. {hrExec ? "Edit to set the points." : "HR will set the points."}
        </div>
      )}
      <div style={{ fontSize: 13, color: "#374151", whiteSpace: "pre-wrap", marginTop: 6 }}>{x.body}</div>
      {(x.sig || x.leaderSig) && (
        <div style={S.sigBox}>
          {x.sig && <div style={{ fontSize: 12, color: "#374151" }}><span style={{ color: "#9CA3AF" }}>Team member:</span> <strong>{x.sig}</strong></div>}
          {x.leaderSig && <div style={{ fontSize: 12, color: "#374151", marginTop: 3 }}><span style={{ color: "#9CA3AF" }}>Leader:</span> <strong>{x.leaderSig}</strong></div>}
        </div>
      )}
      {x.pendingSig && !x.removed && (
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: "#B45309", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 8, padding: "6px 10px" }}>
          ⏳ Awaiting {e.name}'s signature
        </div>
      )}
      {x.pendingSig && isSelf && !x.removed && <PendingSignRow name={e.name} onSign={(sig) => onSignEntry(x.id, sig)} />}
      <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 8, fontStyle: "italic" }}>Issued by {x.by}</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700, color: x.points < 0 ? "#DD0031" : "#0F766E" }}>{x.points} pts</div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {hist.length > 0 && (
            <button style={{ ...S.rm, color: "#6B7280" }} onClick={() => setShowHist((v) => !v)}>
              {showHist ? "Hide history" : `History (${hist.length})`}
            </button>
          )}
          {hrExec && !x.removed && (
            <>
              <button style={S.rm} onClick={() => setEditing({ ...x })}>Edit</button>
              <button style={S.rm} onClick={() => onRemove(x.id)}>Remove</button>
            </>
          )}
          {hrExec && x.removed && (
            <button style={{ ...S.rm, color: "#0F766E" }} onClick={() => onRestore(x.id)}>Restore</button>
          )}
        </div>
      </div>
      {/* Audit trail — every create / edit / removal, with who and when. Visible
          to anyone who can read the file, not just whoever can edit it: an
          unwatched edit right is the actual risk. */}
      {showHist && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed #E4E3DD" }}>
          {hist.map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "3px 0" }}>
              <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, minWidth: 58, color: h.action === "removed" ? "#DD0031" : h.action === "restored" ? "#0F766E" : "#6B7280" }}>{h.action}</span>
              <span style={{ fontSize: 11.5, color: "#374151", flex: 1 }}>
                {h.by}{h.note ? <span style={{ color: "#9CA3AF" }}> — {h.note}</span> : null}
              </span>
              <span style={{ fontSize: 11, color: "#9CA3AF", whiteSpace: "nowrap" }}>{fmtWhen(h.at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CFA Home bulk import. Bri pastes her spreadsheet; nothing is guessed. ──
// ⚠️ PASTE, NOT A FILE IN THE REPO. 86 plaintext passwords must never live in
// source control — this keeps them out of GitHub entirely and puts them
// straight into storage behind the access gate.
function CfaHomeImport({ team, onImport, onBack }) {
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState(null);

  const run = () => {
    // ⚠️ THE LINE IS NOT TRIMMED. Trimming it eats a trailing space inside a
    // password, and Bri asked for these kept exactly as typed. Only the carriage
    // return goes; name and username are trimmed individually below.
    const rows = String(raw).split(/\r?\n/).map((l) => l.replace(/\r$/, "")).filter((l) => l.trim());
    const byName = {};
    (team || []).forEach((m) => { byName[normName(m.name)] = m; });
    const matched = []; const unmatched = []; const blanks = [];
    rows.forEach((line, i) => {
      // Skip a header row if she pastes one.
      if (i === 0 && /full\s*name/i.test(line)) return;
      // ★ TABS OR COMMAS. Bri: "when I try to copy and paste, the formatting is
      // not correct." Cause: copying cells out of Google Sheets puts TAB-separated
      // text on the clipboard, not CSV — so every row arrived as one field and
      // matched nobody. She was about to retype 86 rows by hand over a delimiter.
      // Tab wins when present: a password can contain a comma, but not a tab.
      const cols = line.includes("\t") ? line.split("\t") : line.split(",");
      const name = (cols[0] || "").trim();
      const username = (cols[1] || "").trim();
      // ★ PASSWORD IS NOT TRIMMED OR CASED. Bri: "the passwords are
      // case-sensitive, so please keep that when copied over." A trailing space
      // in a password is a real character.
      const password = cols.slice(2).join(line.includes("\t") ? "\t" : ",");
      if (!name) return;
      const m = byName[normName(name)];
      if (!m) { unmatched.push(name); return; }
      if (!password) blanks.push(name);
      matched.push({ id: m.id, name: m.name, username, password });
    });
    setResult({ matched, unmatched, blanks });
  };

  const apply = () => { onImport(result.matched); setResult({ ...result, done: true }); };

  return (
    <div style={{ padding: 16 }}>
      <button onClick={onBack} style={{ fontSize: 13, fontWeight: 700, color: "#6B7280", background: "none", border: "none", cursor: "pointer", padding: 0 }}>← Back</button>
      <div style={{ fontWeight: 800, fontSize: 18, margin: "10px 0 4px" }}>Import CFA Home logins</div>
      <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.5, marginBottom: 10 }}>
        Select the three columns in your spreadsheet, copy, and paste here — straight
        out of Google Sheets, no reformatting. One person per line,
        <b>Full Name · Username · Password</b>.
        Nobody is created or renamed; every row is matched against the roster and
        anything that doesn't match is listed for you rather than guessed at.
      </div>
      {/* ★ The shared paste-box look (Matt, Aug 8 2026: "the pase boxes dont
          stand out with color"). This takes three columns of CFA Home logins
          out of a spreadsheet and was a 1px #E5E7EB hairline — the same shape
          as TeamImportBox two screens away, which already had the treatment.
          Two boxes doing the same job looked like different products. */}
      <textarea value={raw} onChange={(ev) => { const v = ev.target.value; setRaw(v); }} rows={8}
        placeholder="Full Name,Username,Password"
        style={importZone()} />
      <div style={{ marginTop: 8 }}>
        <button onClick={run} style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "#111827", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}>Check</button>
      </div>

      {result && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F766E" }}>{result.matched.length} matched</div>
          {result.blanks.length > 0 && (
            <div style={{ fontSize: 12.5, color: "#B45309", marginTop: 6 }}>
              <b>{result.blanks.length} with no password</b> — imported with the box empty: {result.blanks.join(", ")}
            </div>
          )}
          {result.unmatched.length > 0 && (
            <div style={{ fontSize: 12.5, color: "#9b2c2c", marginTop: 6, lineHeight: 1.5 }}>
              <b>{result.unmatched.length} not found in HR</b> — check the spelling or drop them:<br />{result.unmatched.join(", ")}
            </div>
          )}
          {!result.done ? (
            <button onClick={apply} style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: "#fff", background: "#0F766E", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}>
              Import {result.matched.length}
            </button>
          ) : (
            <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: "#0F766E" }}>
              Imported. Delete the spreadsheet — the Hub is the record now.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── CFA Home: a stored login, per person. Bri, Jul 25. ─────────────────────
function CfaHomePanel({ e, rec, canManage, isSelf, onSave }) {
  const [open, setOpen] = useState(false);
  const [u, setU] = useState((rec && rec.username) || "");
  const [pw, setPw] = useState((rec && rec.password) || "");
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setU((rec && rec.username) || ""); setPw((rec && rec.password) || ""); }, [rec]);

  // Username: only leadership may change it — a person can READ theirs, which
  // is the point of storing it. Password: they may change their own.
  const mayEditUser = canManage;
  const mayEditPw = canManage || isSelf;

  const save = async () => {
    await onSave(e.id, { username: u.trim(), password: pw });
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div style={{ border: "1px solid #E5E7EB", borderRadius: 12, padding: 14, marginBottom: 14, background: "#fff" }}>
      <button onClick={() => setOpen((v) => !v)}
        style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
        <span style={{ fontWeight: 700, color: "#111827" }}>CFA Home</span>
        <span style={{ fontSize: 12, color: "#9CA3AF" }}>{open ? "▾" : "▸"}</span>
        <span style={{ flex: 1 }} />
        {!open && (rec && rec.username
          ? <span style={{ fontSize: 12, color: "#6B7280" }}>login stored</span>
          : <span style={{ fontSize: 12, color: "#B45309" }}>no login yet</span>)}
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          <a href={CFAHOME_URL} target="_blank" rel="noreferrer"
            style={{ fontSize: 13, fontWeight: 700, color: "#1D4ED8" }}>Open cfahome.com ↗</a>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280" }}>
              Username
              <input value={u} readOnly={!mayEditUser}
                onChange={(ev) => { const v = ev.target.value; setU(v); }}
                style={{ display: "block", marginTop: 3, width: 210, fontSize: 13, padding: "7px 9px",
                  border: "1px solid #E5E7EB", borderRadius: 8,
                  background: mayEditUser ? "#fff" : "#F9FAFB", color: "#111827" }} />
            </label>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280" }}>
              Password
              <span style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3 }}>
                <input value={pw} readOnly={!mayEditPw} type={show ? "text" : "password"}
                  onChange={(ev) => { const v = ev.target.value; setPw(v); }}
                  style={{ width: 210, fontSize: 13, padding: "7px 9px", border: "1px solid #E5E7EB",
                    borderRadius: 8, background: mayEditPw ? "#fff" : "#F9FAFB", color: "#111827" }} />
                <button onClick={() => setShow((v) => !v)}
                  style={{ fontSize: 11.5, fontWeight: 700, color: "#6B7280", background: "#fff",
                    border: "1px solid #E5E7EB", borderRadius: 7, padding: "6px 9px", cursor: "pointer" }}>
                  {show ? "Hide" : "Show"}
                </button>
              </span>
            </label>
          </div>

          {/* Bri asked for this in so many words. Without it, someone changes it
              here, then can't sign in, and blames the Hub. */}
          <div style={{ fontSize: 12, color: "#B45309", background: "#FFFBEB", border: "1px solid #FDE68A",
            borderRadius: 8, padding: "8px 10px", marginTop: 10, lineHeight: 1.45 }}>
            Changing the password here does <b>not</b> change it on CFA Home. This is a place to keep
            a note of it, nothing more.
          </div>

          {(mayEditUser || mayEditPw) && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={save}
                style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "#111827",
                  border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}>Save</button>
              {saved && <span style={{ fontSize: 12, fontWeight: 700, color: "#0F766E" }}>Saved</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Documents panel: private-file upload + list, shown in a person's File tab.
// A team member viewing their own file (isSelf) uploads to a pending queue; a
// leader/HR (canManage) files documents directly. View mints a signed URL.
// Categories that belong in the Work Authorization block. Substring matching is
// deliberate: it also catches the "(onboarding)" suffixes the onboarding-page
// intake files under ("New-hire ID (onboarding)", "Youth Employment Certificate
// (onboarding)"), so those land in this section automatically.
const isWorkAuth = (c) => {
  const s = String(c || "").toLowerCase();
  return s.includes("i-9") || s.includes("work authorization") || s.includes("youth employment") || s.includes("new-hire id");
};

function DocumentsPanel({ e, docs, canManage, isSelf, hr, onUploadDoc, onViewDoc, onRetypeDoc, onRemoveDoc }) {
  // Work Authorization is its OWN TAB (Hannah, Jul 23: "Move work authorization
  // to a different tab in employee files with supporting ids"). It used to be a
  // block further down this same panel; a separate tab is what makes it
  // producible on its own in an audit instead of buried in a document list.
  const [docTab, setDocTab] = useState("docs");   // "docs" | "wa"

  // "Form I-9" is offered to HR only — HR completes the form; a leader filing one
  // would then be unable to see it.
  const WA_CATS = ["ID / Work authorization", "Youth Employment Certificate", ...(hr ? ["Form I-9"] : [])];
  const OTHER_CATS = canManage
    ? ["General document", "Doctor's note", "Signed form", "Other"]
    : ["Doctor's note", "General document", "Signed form", "Other"];
  const CATS = docTab === "wa" ? WA_CATS : OTHER_CATS;
  const [cat, setCat] = useState(OTHER_CATS[0]);
  // The category must belong to the tab you're on, or a doc uploaded here would
  // file into the OTHER tab and look like it vanished. Falls back to the first
  // valid one rather than carrying a stale selection across the tab switch.
  const activeCat = CATS.includes(cat) ? cat : CATS[0];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const inp = useRef(null);
  const viaSelf = isSelf && !canManage;
  const pick = () => { setErr(""); setOk(""); if (inp.current) inp.current.click(); };
  const onFile = async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (inp.current) inp.current.value = "";
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { setErr("That file is over 15 MB — please upload a smaller scan or photo."); return; }
    setBusy(true); setErr(""); setOk("");
    try {
      await onUploadDoc(file, activeCat, viaSelf);
      setOk(viaSelf ? "Uploaded — sent to HR for review." : "Uploaded to file.");
    } catch (x) {
      setErr(x && x.message ? x.message : "Upload failed. Try again.");
    } finally { setBusy(false); }
  };
  const list = docs || [];
  // Work-authorization documents live in their own block, apart from the rest of
  // the file, and open only for HR (or the person themselves).
  const waList = list.filter((d) => isWorkAuth(d.category));
  const otherList = list.filter((d) => !isWorkAuth(d.category));
  const canSeeWA = !!hr || !!isSelf;

  const row = (d) => (
    <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid #E4E3DD", borderRadius: 10, padding: "9px 11px", background: "#FCFBF8" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.category} · <span style={{ color: "#6B7280", fontWeight: 500 }}>{d.fileName}</span></div>
        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{d.date} · {d.uploadedBy}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {d.status === "pending"
          ? <span style={{ fontSize: 10.5, fontWeight: 700, color: "#B45309", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 20, padding: "2px 8px" }}>Pending review</span>
          : <span style={{ fontSize: 10.5, fontWeight: 700, color: "#15803D", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 20, padding: "2px 8px" }}>Filed</span>}
        <button style={{ ...S.sec, padding: "6px 12px", margin: 0 }} onClick={() => onViewDoc(d)}>View</button>
        {/* HR only. The category decides which TAB a document files under, so a
            mis-typed upload is effectively lost until it's corrected here.
            Changing it to a Work Authorization type moves it to that tab. */}
        {hr && onRetypeDoc && (
          <select value={d.category} onChange={(ev) => onRetypeDoc(d.id, ev.target.value)}
            title="Change document type"
            style={{ fontSize: 12, border: "1px solid #E4E3DD", borderRadius: 8, padding: "5px 7px", background: "#fff", maxWidth: 150 }}>
            {[...new Set([d.category, ...WA_CATS, ...OTHER_CATS])].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {hr && onRemoveDoc && (
          <button title="Delete this document"
            style={{ ...S.sec, padding: "6px 10px", margin: 0, color: "#DD0031" }}
            onClick={() => {
              if (window.confirm(`Delete "${d.fileName}" from ${e.name}'s file? The file itself is removed from storage and this can't be undone.`)) onRemoveDoc(d.id);
            }}>Delete</button>
        )}
      </div>
    </div>
  );

  return (
    <div style={S.card}>
      <div style={{ fontWeight: 700, color: "#111827", marginBottom: 8 }}>Documents <span style={{ color: "#9CA3AF", fontWeight: 700 }}>({list.length})</span></div>

      {/* Tab bar. The Work Authorization tab is hidden entirely from anyone who
          can't open it — showing a tab that refuses to render is worse than not
          showing it. */}
      <div style={{ display: "flex", gap: 6, borderBottom: "1px solid #E4E3DD", marginBottom: 10 }}>
        {[{ id: "docs", label: "Documents", count: otherList.length },
          ...(canSeeWA ? [{ id: "wa", label: "Work Authorization", count: waList.length }] : [])
        ].map((t) => {
          const on = docTab === t.id;
          return (
            <button key={t.id} onClick={() => setDocTab(t.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px 12px", fontSize: 13, fontWeight: 800, color: on ? "#223C6A" : "#9CA3AF", borderBottom: on ? "3px solid #223C6A" : "3px solid transparent", marginBottom: -1 }}>
              {t.label} {t.count > 0 && <span style={{ fontWeight: 700, opacity: 0.75 }}>({t.count})</span>}
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10, lineHeight: 1.5 }}>
        {docTab === "wa"
          ? "Form I-9 with the IDs and youth certificate that support it — kept together, and apart from the rest of the file, so this can be produced on its own for an audit. HR only."
          : canManage
            ? "Upload a scan or photo — doctor's note, signed form — straight into this file. Documents are private: only this person and leadership can open them."
            : "Upload your own documents — a doctor's note or signed form. HR reviews each one before it's filed. These are private to you and leadership."}
      </div>

      {/* Upload — deliberately loud; this was a plain button under the blurb and
          Hannah couldn't find it. */}
      <div style={{ border: "1.5px dashed #C7CBD3", borderRadius: 12, background: "#FBFAF7", padding: "14px 14px 12px" }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#14243D", marginBottom: 8 }}>Add a document to this file</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={activeCat} onChange={(ev) => setCat(ev.target.value)} style={{ ...S.in, width: "auto", margin: 0, padding: "9px 12px" }}>
            {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button style={{ ...S.prim, ...(busy ? { opacity: 0.5 } : {}) }} disabled={busy} onClick={pick}>{busy ? "Uploading…" : "⬆ Upload document"}</button>
          <input ref={inp} type="file" accept="image/*,application/pdf" onChange={onFile} style={{ display: "none" }} />
        </div>
        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>Photo or PDF, up to 15 MB. Choose the category first — it decides where the document files.</div>
      </div>

      {err && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 8, padding: "8px 11px", fontSize: 12, marginTop: 10 }}>{err}</div>}
      {ok && <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", borderRadius: 8, padding: "8px 11px", fontSize: 12, marginTop: 10 }}>{ok}</div>}

      {/* Only the active tab's documents render. Someone without WA access never
          reaches this branch — the tab isn't offered — but the count line below
          still tells them something is on file, so they don't re-upload a
          duplicate they simply can't see. */}
      {docTab === "wa" ? (
        canSeeWA ? (
          waList.length > 0
            ? <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>{waList.map(row)}</div>
            : <div style={{ marginTop: 12, fontSize: 12.5, color: "#9CA3AF", textAlign: "center", padding: "18px 10px" }}>No work-authorization documents on file yet.</div>
        ) : (
          <div style={{ marginTop: 12, fontSize: 12, color: "#9CA3AF" }}>{waList.length} document{waList.length === 1 ? "" : "s"} on file — visible to HR only.</div>
        )
      ) : (
        otherList.length > 0
          ? <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>{otherList.map(row)}</div>
          : <div style={{ marginTop: 12, fontSize: 12.5, color: "#9CA3AF", textAlign: "center", padding: "18px 10px" }}>No documents uploaded yet.</div>
      )}
      {docTab !== "wa" && !canSeeWA && waList.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11.5, color: "#9CA3AF" }}>{waList.length} work-authorization document{waList.length === 1 ? "" : "s"} on file — visible to HR only.</div>
      )}
    </div>
  );
}

// ── Approved Drivers: the explicit list of who may drive the company car.
// Hannah curates this; CashAudit's mileage log reads it as its name dropdown, so
// a trip can't be logged against someone who was never cleared. Approval is a
// decision recorded here, never inferred from a document in someone's file. ──
function ApprovedDrivers({ drivers, team, actingName, onSave, onBack }) {
  const [pick, setPick] = useState("");
  const [expires, setExpires] = useState("");
  const ref = todayLocal();
  const soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

  const listed = new Set(drivers.map((d) => String(d.id)));
  const addable = team.filter((m) => !listed.has(String(m.id))).sort((a, b) => a.name.localeCompare(b.name));
  const sorted = drivers.slice().sort((a, b) => a.name.localeCompare(b.name));

  const add = () => {
    const m = team.find((x) => String(x.id) === String(pick));
    if (!m) return;
    // Name is stored ALONGSIDE the id so CashAudit can render the dropdown
    // without loading the HR roster. If someone is renamed in HR, re-add them.
    onSave([...drivers, { id: String(m.id), name: m.name, expires: expires || "", addedBy: actingName, addedAt: new Date().toISOString() }]);
    setPick(""); setExpires("");
  };
  const setExpiry = (id, v) => onSave(drivers.map((d) => (String(d.id) === String(id) ? { ...d, expires: v } : d)));
  const remove = (d) => { if (window.confirm(`Remove ${d.name} from the approved drivers list?\n\nThey'll stop appearing on the mileage log.`)) onSave(drivers.filter((x) => String(x.id) !== String(d.id))); };

  return (
    <div style={S.body}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button onClick={onBack} style={{ background: "#F1EFE9", border: "1px solid #E4E3DD", borderRadius: 9, width: 34, height: 34, cursor: "pointer", fontSize: 16 }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#14243D" }}>Approved Drivers</div>
      </div>
      <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 14, lineHeight: 1.55 }}>
        Who is cleared to drive the company car. This is the list the mileage log uses — anyone not on it can't have a trip logged against them. Add a licence expiry and the Hub will flag it when it lapses.
      </div>

      <div style={{ border: "1.5px dashed #C7CBD3", borderRadius: 12, background: "#FBFAF7", padding: "14px 14px 12px", marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#14243D", marginBottom: 8 }}>Approve someone to drive</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ ...S.in, width: "auto", flex: "1 1 170px", margin: 0, padding: "9px 12px" }}>
            <option value="">Choose a team member…</option>
            {addable.map((m) => <option key={m.id} value={m.id}>{m.name}{m.role ? " — " + m.role : ""}</option>)}
          </select>
          <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} title="Licence expiry" style={{ ...S.in, width: "auto", margin: 0, padding: "9px 12px" }} />
          <button onClick={add} disabled={!pick} style={{ ...S.prim, ...(pick ? {} : { opacity: 0.45 }) }}>Add</button>
        </div>
        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>Expiry is optional but recommended — without it nothing can warn you when a licence lapses.</div>
      </div>

      {sorted.length === 0 && (
        <div style={{ textAlign: "center", padding: "34px 20px", color: "#9aa3af", fontSize: 14 }}>
          Nobody approved yet. Until someone is added, the mileage log falls back to its old name list.
        </div>
      )}

      {sorted.map((d) => {
        const gone = driverExpired(d, ref);
        const soonish = driverExpiringSoon(d, ref, soon);
        return (
          <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", border: `1px solid ${gone ? "#FECACA" : "#E4E3DD"}`, background: gone ? "#FEF2F2" : "#FCFBF8", borderRadius: 11, padding: "11px 13px", marginBottom: 8 }}>
            <div style={{ minWidth: 0, flex: "1 1 150px" }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: "#14243D" }}>
                {d.name}
                {gone && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, color: "#B91C1C", background: "#fff", border: "1px solid #FECACA", borderRadius: 20, padding: "1px 8px" }}>LICENCE EXPIRED</span>}
                {soonish && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, color: "#B45309", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 20, padding: "1px 8px" }}>EXPIRES SOON</span>}
              </div>
              <div style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 2 }}>
                {d.expires ? "Licence expires " + d.expires : "No expiry recorded"}{d.addedBy ? " · added by " + d.addedBy : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input type="date" value={d.expires || ""} onChange={(e) => setExpiry(d.id, e.target.value)} style={{ ...S.in, width: "auto", margin: 0, padding: "7px 10px", fontSize: 13 }} />
              <button onClick={() => remove(d)} style={{ background: "#fff", color: "#9b2c2c", border: "1px solid #F3C6C6", borderRadius: 9, padding: "8px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Remove</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Onboarding Intake: new-hire ID uploads from the login-less onboarding page.
// Each row is a `submissions` entry (tool="onboarding-intake") carrying the
// name the hire typed + the uploaded file paths. Hannah matches each to a
// roster person, which files the ID into that person's HR record (pending), so
// it flows through the normal Document Review approve path. ──
/* ============ UNIFORM ORDERS ============
   Hannah's queue. She asked for a tab rather than notifications, so this is
   what the tab opens.

   ⚠️ IT READS THE FILED RECORD DEFENSIVELY AND ASSUMES NOTHING. Every field
   comes off `payload`, which is whatever the order form wrote on the day. An
   order placed before a field existed, or after one is added, still has to
   render — so a missing `lines` array is an empty list rather than a crash,
   which is the exact shape that took a whole class down in June.

   ⚠️ FULFILLING IS ONE TAP AND IT IS NOT A DELETE. The row drops off her list
   and out of the count; the submission stays in the log. Nothing she taps can
   lose what somebody ordered. */
function UniformOrders({ rows, total, onFulfil, onRefresh, onBack }) {
  const list = Array.isArray(rows) ? rows : [];
  const money = (n) => (Number.isFinite(Number(n)) ? `$${Number(n).toFixed(2)}` : "—");
  const when = (r) => {
    const t = r && (r.submitted_at || (r.payload && r.payload.at));
    if (!t) return "";
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <button className="hr-ctlbtn" onClick={onBack} style={{ border: "1px solid #E4E3DD", background: "#fff", borderRadius: 10, padding: "7px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>← Back</button>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#14243D" }}>Uniform Orders</div>
        <button className="hr-ctlbtn" onClick={onRefresh} style={{ marginLeft: "auto", border: "1px solid #E4E3DD", background: "#fff", borderRadius: 10, padding: "7px 12px", cursor: "pointer", fontSize: 12.5, fontWeight: 700 }}>Refresh</button>
      </div>

      {!list.length ? (
        <div style={{ textAlign: "center", padding: "40px 16px", color: "#6B7280", fontSize: 14 }}>
          Nothing waiting. Orders appear here as they are placed.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10,
            background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "12px 15px", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#B45309" }}>
              {list.length} order{list.length > 1 ? "s" : ""} to fulfil
            </span>
            <span style={{ fontSize: 17, fontWeight: 800, color: "#14243D" }}>{money(total)}</span>
          </div>
          <div style={{ fontSize: 11.5, color: "#9CA3AF", marginBottom: 12 }}>
            Combined subtotal, before tax and shipping.
          </div>

          {list.map((r) => {
            const p = (r && r.payload) || {};
            const lines = Array.isArray(p.lines) ? p.lines : [];
            return (
              <div key={r.id} style={{ background: "#fff", border: "1px solid #E4E3DD", borderRadius: 12,
                padding: "13px 15px", marginBottom: 10, ...tileDepth(ACCENT_NEUTRAL) }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: "#14243D" }}>
                    {p.name || r.submitted_by || "Unnamed"}
                  </span>
                  {/* ★ NEW HIRE ORDERS LAND IN THIS SAME LIST (Hannah, Aug 8
                      2026, replacing her Google Form). One list on purpose — a
                      second tab is a second thing to check on a busy week — so
                      the badge is what tells them apart. They are a flat $60
                      with no per-item prices, which is why the price column
                      disappears on these rows rather than printing a dash. */}
                  {p.newHire && (
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", color: "#0F766E",
                      background: "#E4F4EA", border: "1px solid #BFE3CD", borderRadius: 999, padding: "2px 7px" }}>
                      NEW HIRE
                    </span>
                  )}
                  <span style={{ fontSize: 11.5, color: "#9CA3AF" }}>{when(r)}</span>
                  <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 800, color: "#14243D" }}>{money(p.subtotal)}</span>
                </div>

                {lines.length ? (
                  <ul style={{ listStyle: "none", margin: "9px 0 0", padding: 0 }}>
                    {lines.map((l, i) => (
                      /* ⚠️ SIZE, COLOUR AND FIT NOW LIVE ON THE LINE (Bri
                         moved them off the single notes box). Reading only the
                         item name here would drop exactly the detail she needs
                         to fulfil the order, and it would look fine.
                         Only what the item actually asked for is rendered —
                         null means "never asked", not "left blank", and a hat
                         showing an empty size is how a one-size item starts
                         looking like a mistake. */
                      <li key={`${l && l.id}-${i}`} style={{ display: "flex", gap: 8, fontSize: 13, color: "#4B5563", padding: "3px 0" }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          {(l && l.item) || "Item"}
                          {l && (l.size || l.color || l.fit) && (
                            <span style={{ color: "#14243D", fontWeight: 700 }}>
                              {" · "}{[l.size, l.color, l.fit].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </span>
                        {!p.newHire && (
                          <span style={{ color: "#9CA3AF", whiteSpace: "nowrap" }}>{money(l && l.price)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ fontSize: 12.5, color: "#9CA3AF", marginTop: 7 }}>No items on this order.</div>
                )}

                {String(p.sizeNotes || "").trim() && (
                  <div style={{ fontSize: 12.5, color: "#4B5563", marginTop: 9, background: "#F7F7F5", borderRadius: 9, padding: "8px 11px", lineHeight: 1.5 }}>
                    <b>Sizes and colours:</b> {p.sizeNotes}
                  </div>
                )}
                {p.comments && (
                  <div style={{ fontSize: 12.5, color: "#8A4B1F", marginTop: 7, background: "#FFF7E6", border: "1px solid #F3D6C4", borderRadius: 9, padding: "8px 11px", lineHeight: 1.5 }}>
                    <b>Comment:</b> {p.comments}
                  </div>
                )}
                {/* The shoes line is the one thing a new hire buys themselves,
                    so who typed the acknowledgement is worth keeping with the
                    order rather than only in the record of the form. */}
                {p.shoesAck && (
                  <div style={{ fontSize: 12, color: "#4B5563", marginTop: 7 }}>
                    Slip-resistant shoes acknowledged by <b>{p.shoesAck}</b>
                  </div>
                )}

                <button className="hr-ctlbtn" onClick={() => onFulfil(r.id)}
                  style={{ marginTop: 11, border: "none", background: "#14243D", color: "#fff", borderRadius: 10,
                    padding: "9px 15px", cursor: "pointer", fontSize: 13, fontWeight: 800 }}>
                  Mark fulfilled
                </button>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function OnboardingIntake({ rows, team, onView, onMatch, onCreate, onDiscard, onRefresh, onBack }) {
  const [pick, setPick] = useState({});   // rowId -> selected member id
  const sorted = (rows || []).slice().sort((a, b) => (b.submitted_at || "").localeCompare(a.submitted_at || ""));
  const memberById = {};
  const teamNames = new Set();
  (team || []).forEach((m) => { memberById[m.id] = m; teamNames.add(String(m.name || "").trim().toLowerCase()); });
  return (
    <div style={S.body}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button onClick={onBack} style={{ background: "#F1EFE9", border: "1px solid #E4E3DD", borderRadius: 9, width: 34, height: 34, cursor: "pointer", fontSize: 16 }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#14243D" }}>Onboarding Intake</div>
        <button onClick={onRefresh} style={{ marginLeft: "auto", background: "#fff", border: "1px solid #E4E3DD", borderRadius: 9, padding: "7px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#223C6A" }}>Refresh</button>
      </div>
      <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 14 }}>
        New hires upload their ID(s) on the onboarding link. When the name they typed fits exactly one roster person, the upload files itself to that record as a pending document. Anything ambiguous — a first name only, two people with the same name, or someone not on the roster yet — waits here for you. Someone not on the roster? One tap creates their employee file and attaches the ID, so they show up in your dropdowns right away.
      </div>
      {sorted.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#9aa3af", fontSize: 14 }}>No new-hire ID uploads waiting. New uploads appear here automatically.</div>
      )}
      {sorted.map((row) => {
        const nm = (row.payload && row.payload.name) || row.submitted_by || "Unnamed";
        const files = (row.payload && row.payload.files) || [];
        const minor = !!(row.payload && row.payload.minor);
        const chosen = pick[row.id] || "";
        // Offered only when the typed name matches NOBODY current — an exact
        // match belongs in the dropdown, and addMember's duplicate guard
        // backstops a race either way.
        const notOnRoster = !!String(nm).trim() && !teamNames.has(String(nm).trim().toLowerCase());
        return (
          <div key={row.id} style={{ background: "#FCFBF8", border: "1px solid #E4E3DD", borderRadius: 12, padding: "13px 14px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#14243D" }}>{nm}</div>
              {minor && <span style={{ fontSize: 11, fontWeight: 800, color: "#8a4b1f", background: "#FFF6F0", border: "1px solid #F3D6C4", borderRadius: 999, padding: "1px 8px" }}>UNDER 18</span>}
              <span style={{ fontSize: 12, color: "#9aa3af", marginLeft: "auto" }}>{(row.submitted_at || "").slice(0, 10)}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "9px 0 11px" }}>
              {files.map((f, i) => (
                <button key={i} onClick={() => onView(f)} style={{ background: "#fff", border: "1px solid #D8E0EC", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: "#223C6A" }}>
                  View {f.fileName || ("file " + (i + 1))}
                </button>
              ))}
              {files.length === 0 && <span style={{ fontSize: 12.5, color: "#9b2c2c" }}>No files attached to this upload.</span>}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select value={chosen} onChange={(e) => setPick({ ...pick, [row.id]: e.target.value })} style={{ flex: "1 1 180px", fontSize: 14, padding: "9px 10px", border: "1.5px solid #E4E3DD", borderRadius: 9, background: "#fff", color: "#14243D" }}>
                <option value="">Match to team member…</option>
                {(team || []).slice().sort((a, b) => a.name.localeCompare(b.name)).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}{m.role ? " — " + m.role : ""}</option>
                ))}
              </select>
              <button
                disabled={!chosen || files.length === 0}
                onClick={() => { if (chosen && memberById[chosen]) onMatch(memberById[chosen], row); }}
                style={{ background: chosen && files.length ? "#14243D" : "#e6e2d8", color: chosen && files.length ? "#fff" : "#9aa3af", border: "none", borderRadius: 9, padding: "10px 16px", fontWeight: 800, fontSize: 14, cursor: chosen && files.length ? "pointer" : "default" }}>
                File to their record
              </button>
              {/* Always available and never disabled: a row that can't be matched
                  to anybody is exactly the row that most needs clearing. */}
              <button
                onClick={() => { if (window.confirm(`Discard this upload from ${nm}?\n\nThe file is deleted and is NOT filed to anyone. This can't be undone.`)) onDiscard(row); }}
                style={{ background: "#fff", color: "#9b2c2c", border: "1px solid #F3C6C6", borderRadius: 9, padding: "10px 14px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
                Discard
              </button>
            </div>
            {notOnRoster && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 9, paddingTop: 9, borderTop: "1px dashed #E4E3DD" }}>
                <span style={{ fontSize: 12.5, color: "#6B7280" }}>Not on the roster yet?</span>
                <button
                  disabled={files.length === 0}
                  onClick={() => { if (window.confirm(`Create an employee file for ${nm} and attach this ID?\n\nThey'll appear in your dropdowns as a Team Member right away. The ID still goes through Document Review as usual.`)) onCreate(row); }}
                  style={{ background: files.length ? "#1E5E3A" : "#e6e2d8", color: files.length ? "#fff" : "#9aa3af", border: "none", borderRadius: 9, padding: "10px 16px", fontWeight: 800, fontSize: 13.5, cursor: files.length ? "pointer" : "default" }}>
                  Create file + attach ID
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Document Review: HR's one-tap pending queue across everyone's uploads. ──
function DocReview({ docFiles, team, onApprove, onReject, onView, onBack }) {
  const byId = {};
  (team || []).forEach((m) => { byId[m.id] = m; });
  const pending = [];
  Object.keys(docFiles || {}).forEach((mid) => {
    (docFiles[mid] || []).forEach((d) => { if (d.status === "pending") pending.push({ ...d, memberId: mid, memberName: (byId[mid] && byId[mid].name) || "Unknown member" }); });
  });
  pending.sort((a, b) => ((a.history && a.history[0] && a.history[0].at) || "").localeCompare((b.history && b.history[0] && b.history[0].at) || ""));
  return (
    <div style={S.body}>
      <button onClick={onBack} style={{ background: "#EDEBE4", border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#14243D", cursor: "pointer", marginBottom: 12 }}>← Directory</button>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#14243D", margin: "2px 0 4px" }}>Document Review</div>
      <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>{pending.length === 0 ? "Nothing waiting — every uploaded document is filed." : pending.length + " document" + (pending.length === 1 ? "" : "s") + " uploaded by team members, waiting to be filed."}</div>
      {pending.map((d) => (
        <div key={d.memberId + d.id} style={{ ...S.card, borderLeft: "3px solid #B45309", borderTop: "3px solid #B45309" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{d.memberName}</div>
            <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>{d.category} · <span style={{ color: "#6B7280" }}>{d.fileName}</span></div>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3 }}>Uploaded {d.date}</div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button style={{ ...S.sec, margin: 0 }} onClick={() => onView(d)}>View</button>
            <button style={{ ...S.prim, margin: 0 }} onClick={() => onApprove(d.memberId, d.id)}>Approve &amp; file</button>
            <button style={{ ...S.sec, margin: 0, color: "#B91C1C", borderColor: "#FECACA" }} onClick={() => { if (window.confirm("Reject and delete this upload? This can't be undone.")) onReject(d.memberId, d.id); }}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function FileSection(props) {
  const { e, entries, total, leader, hr, canCounsel, hrExec, canDoc, isSelf, acting, info, draft, setDraft, docOnly, onUpdInfo, preferredName, onUpdPreferred, onAttach, onEditEntry, onRemove, onRestore, onSignEntry, docs = [], onUploadDoc, onViewDoc, onRetypeDoc, onRemoveDoc , cfaHome, onSaveCfaHome } = props;
  const general = TEMPLATES.filter((t) => !t.counseling);
  const counsel = TEMPLATES.filter((t) => t.counseling);
  const [editing, setEditing] = useState(null); // existing entry being edited (separate from "draft" = new entry)
  const [showRemoved, setShowRemoved] = useState(false);
  // Point Adjustment is a ledger correction — it belongs to whoever owns the
  // ledger. A leader who can't set points on a write-up shouldn't be handed a
  // template whose whole purpose is setting points.
  const generalFor = leader ? general : general.filter((t) => t.id !== "adjust");
  const start = (t) => {
    if (t.counseling && !canCounsel) return;
    const f = { date: today(), name: e.name, startTime: "", endTime: "", actualTime: "", witness: "", details: "", followUpDate: "" };
    // Leader signature prefills with whoever is signed in — still editable, since
    // a counseling may be issued by HR while a different leader witnesses it.
    setDraft({ ...t, date: today(), fields: f, body: fill(t.body, f), points: t.points, sig: "", leaderSig: acting ? acting.name : "" });
  };

  if (editing) {
    const saveEdit = () => { onEditEntry({ ...editing, points: Number(editing.points) || 0 }); setEditing(null); };
    return (
      <div style={S.card}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#111827", marginBottom: 4 }}>Edit: {editing.title}</div>
        <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 10 }}>Editing an existing file entry directly — no need to route this through Jax.</div>
        <Lbl t="Date" /><input type="date" value={editing.date} onChange={(ev) => setEditing({ ...editing, date: ev.target.value })} style={S.in} />
        <Lbl t="Entry text" /><textarea value={editing.body} onChange={(ev) => setEditing({ ...editing, body: ev.target.value })} style={{ ...S.in, height: 140 }} />
        <Lbl t="Points" /><input type="number" value={editing.points} onChange={(ev) => setEditing({ ...editing, points: ev.target.value })} style={{ ...S.in, width: 100 }} />
        <div style={S.grid2}>
          <div><Lbl t="Team member signature" /><input value={editing.sig || ""} onChange={(ev) => setEditing({ ...editing, sig: ev.target.value })} style={S.in} /></div>
          <div><Lbl t="Leader signature" /><input value={editing.leaderSig || ""} onChange={(ev) => setEditing({ ...editing, leaderSig: ev.target.value })} style={S.in} /></div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 10 }}>
          <button style={S.sec} onClick={() => setEditing(null)}>Cancel</button>
          <button style={S.prim} onClick={saveEdit}>Save Changes</button>
        </div>
      </div>
    );
  }

  if (draft) {
    const tpl = TEMPLATES.find((x) => x.id === draft.id);
    const setF = (k, v) => { const f = { ...draft.fields, [k]: v }; setDraft({ ...draft, fields: f, body: fill(tpl.body, { ...f, name: e.name }) }); };
    // Point Adjustments are a ledger correction — no signatures required.
    const needsSig = draft.id !== "adjust";
    const memberSigned = !!(draft.sig && draft.sig.trim());
    // Only the LEADER signature is required to attach. The team member's is
    // optional here — leave it blank to attach now and send them a request to
    // sign it themselves.
    const sigOk = !needsSig || (draft.leaderSig && draft.leaderSig.trim());
    // ── DESCRIPTION REQUIRED ON GENERAL DOCUMENTATION ────────────────────
    // Hannah, Jul 25: "Can you make the general documentation tab require a
    // description of the reason for documentation? Two leaders have submitted
    // general documentation with nothing in the comments."
    // The template pre-fills a bracketed PROMPT, so "empty" isn't the only
    // failure — a leader can attach with the guidance text still sitting there
    // untouched, which reads as filled in and says nothing. Both are blocked.
    // ⚠️ Scoped to the general catch-all ON PURPOSE: every other template
    // writes a factual sentence of its own, so requiring an edit there would
    // demand busywork on entries that are already specific.
    const needsWhy = tpl && tpl.source === "general";
    const bodyText = String(draft.body || "");
    const stillPrompt = /\(Describe what happened/i.test(bodyText);
    const whyOk = !needsWhy || (bodyText.trim().length > 0 && !stillPrompt);
    return (
      <div style={S.card}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#111827", marginBottom: 4 }}>{draft.title}</div>
        {draft.counseling && <div style={S.issuer}>Issued by Human Resources.</div>}
        <div style={S.grid2}>
          <div><Lbl t="Date" /><input type="date" value={draft.fields.date} onChange={(ev) => setF("date", ev.target.value)} style={S.in} /></div>
          <div><Lbl t="Manager / Witness" /><input value={draft.fields.witness} onChange={(ev) => setF("witness", ev.target.value)} placeholder="Name" style={S.in} /></div>
          <div><Lbl t="Scheduled Start" /><input type="time" value={draft.fields.startTime} onChange={(ev) => setF("startTime", ev.target.value)} style={S.in} /></div>
          <div><Lbl t="Actual Clock-In" /><input type="time" value={draft.fields.actualTime} onChange={(ev) => setF("actualTime", ev.target.value)} style={S.in} /></div>
        </div>
        <Lbl t="Details" /><textarea value={draft.fields.details} onChange={(ev) => setF("details", ev.target.value)} placeholder="Specific incident or context" style={{ ...S.in, height: 60 }} />
        {/* 🐛 Hannah, Jul 26: a leader reported that "under general documentation,
            write up is already selected and can't be changed." This label is the
            most likely thing they meant — the form headline correctly says
            "General Documentation" while the box underneath was hard-labelled
            "Write-up text", so it reads as a type that's been chosen for you and
            greyed out. A general record is NOT a write-up: it carries no points
            and files under Documentation, not Write-ups.
            ⚠️ BEST READ, NOT CONFIRMED — asked for the screenshot. If they meant
            a different control, this is still wrong and worth fixing. */}
        <Lbl t={needsWhy ? "What happened (editable)" : "Write-up text (editable)"} /><textarea value={draft.body} onChange={(ev) => setDraft({ ...draft, body: ev.target.value })} style={{ ...S.in, height: 150 }} />
        {/* Points are HR's. A leader below LDD never sees this field — the entry
            files at 0 and HR prices it. Showing a number they can't set would
            just imply they had. */}
        {leader ? (
          <>
            <Lbl t={needsSig ? "Points" : "Points (+ restores, − deducts)"} />
            <input type="number" value={draft.points} onChange={(ev) => setDraft({ ...draft, points: ev.target.value })} style={{ ...S.in, width: 100 }} />
          </>
        ) : (
          <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "9px 11px", fontSize: 12, color: "#92400E", marginBottom: 10, lineHeight: 1.45 }}>
            <b>This files at 0 points.</b> Write what you saw — HR reviews it and decides whether it carries points or escalates to a counseling. You won't see this person's file or point total.
          </div>
        )}
        {needsSig && (
          <div style={{ background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 8, padding: "10px 12px", marginTop: 4, marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 8 }}>Signatures</div>
            <Lbl t="Leader (required)" />
            <input value={draft.leaderSig || ""} onChange={(ev) => setDraft({ ...draft, leaderSig: ev.target.value })} placeholder="Leader types their full name" style={{ ...S.in, marginBottom: 4 }} />
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 10 }}>The leader delivering this documentation signs to confirm it.</div>
            <Lbl t={"Team member — " + e.name + " (optional)"} />
            <input value={draft.sig || ""} onChange={(ev) => setDraft({ ...draft, sig: ev.target.value })} placeholder={"Blank = send to " + e.name + " to sign"} style={{ ...S.in, marginBottom: 4 }} />
            <div style={{ fontSize: 11, color: "#9CA3AF" }}>Leave blank to attach now and send {e.name} a request to sign it themselves in their own file. Nobody may sign on their behalf.</div>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 10 }}>
          <button style={S.sec} onClick={() => setDraft(null)}>Cancel</button>
          <button style={{ ...S.prim, ...(sigOk && whyOk ? {} : { opacity: 0.45 }) }} disabled={!sigOk || !whyOk} onClick={onAttach}>{needsSig && !memberSigned ? "Attach & Send to Sign" : "Attach to File"}</button>
          {needsWhy && !whyOk && (
            <div style={{ fontSize: 12, color: "#9b2c2c", marginTop: 6 }}>
              Replace the note in brackets with what actually happened before attaching.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {!docOnly && (
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#111827", marginBottom: 8 }}>Employee Details</div>
          {leader ? (
            <>
              {/* ★ GOES NOWHERE NEAR gcfcr-hr-info. Everything else in this
                  panel is own-row-only — a person can read their OWN email and
                  hire date and nobody else's. A name has to be the opposite: it
                  is shown on the board, the register, the directory and in
                  Slack DMs, to everyone. So it rides its own map and this input
                  is the only thing here that changes what other people see.
                  ⚠️ IT NEVER REPLACES THE FULL NAME IN STORAGE, only what is
                  displayed. 75 places in this app match people by their roster
                  name; overwriting that would be a rename with a blast radius,
                  not a nickname. Blank it and everything reverts to the full
                  name on the next load. */}
              <Lbl t="Goes by" />
              <input value={preferredName || ""} onChange={(ev) => onUpdPreferred(ev.target.value)}
                placeholder={`Leave blank to use "${e.name}"`} style={S.in} />
              <div style={{ fontSize: 11.5, color: "#6B7280", marginTop: -4, marginBottom: 8, lineHeight: 1.45 }}>
                Shown everywhere in the Hub instead of their full name. Their
                full name stays on file and is still what searches match.
              </div>
              <Lbl t="Email" /><input value={info.email} onChange={(ev) => onUpdInfo({ email: ev.target.value })} placeholder="name@email.com" style={S.in} />
              <div style={S.grid2}>
                <div><Lbl t="Date Hired" /><input type="date" value={info.hireDate} onChange={(ev) => onUpdInfo({ hireDate: ev.target.value })} style={S.in} /></div>
                <div><Lbl t="Date Terminated" /><input type="date" value={info.termDate} onChange={(ev) => onUpdInfo({ termDate: ev.target.value })} style={S.in} /></div>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.7 }}>
              <div>Email: {info.email || "—"}</div><div>Date Hired: {info.hireDate || "—"}</div><div>Date Terminated: {info.termDate || "—"}</div>
            </div>
          )}
        </div>
      )}

      {(isSelf || hr || leader) && onUploadDoc && (
        <DocumentsPanel e={e} docs={docs} canManage={hr || leader} isSelf={isSelf} hr={hr} onUploadDoc={onUploadDoc} onViewDoc={onViewDoc} onRetypeDoc={onRetypeDoc} onRemoveDoc={onRemoveDoc} />
      )}

      {/* ★ CFA Home. `hrExec` is rank >= 6 — LDD, Executive Director, HR, Owner —
          which is Bri's rule as written, and already excludes Payroll (rank 1)
          and Director (rank 5), both of which she named. Plus the person
          themselves, on their own file only. */}
      {(hrExec || isSelf) && onSaveCfaHome && (
        <CfaHomePanel e={e} rec={cfaHome && cfaHome[e.id]} canManage={!!hrExec} isSelf={isSelf} onSave={onSaveCfaHome} />
      )}

      {canDoc && (
        <>
          <div style={S.sLbl}>New Documentation</div>
          <div style={S.tGrid}>
            {generalFor.map((t) => <button key={t.id} style={S.tCard} onClick={() => start(t)}><div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{t.title}</div><div style={{ fontSize: 11, fontWeight: 700, color: t.id === "adjust" ? "#0F766E" : (leader ? "#DD0031" : "#9CA3AF") }}>{leader ? (t.id === "adjust" ? "± pts (manual)" : (t.outcome || t.points + " pts")) : "HR sets points"}</div></button>)}
          </div>
          {/* The counseling ladder is HR's, and a leader who can't read the file
              can't see where someone sits on it — so it isn't shown to them at
              all. Showing a locked ladder would leak the escalation path. */}
          {/* Was `leader` (rank 6+), which showed a locked ladder to Bri,
              Kyleeka and Nick. Hannah asked for it gone from other viewers
              entirely, so it now renders for HR only. */}
          {canCounsel && (
            <>
              <div style={S.sLbl}>Counseling Path</div>
              <div style={S.ladder}>
                {COUNSELING_LADDER.map((c) => <div key={c.step} style={S.ladRow}><span style={S.ladStep}>{c.step}</span><span style={{ flex: 1 }}>{c.form}</span><span style={{ fontWeight: 700, color: "#6B7280" }}>{c.at}</span></div>)}
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6, fontStyle: "italic" }}>Final termination must be completed manually by an Admin.</div>
              </div>
              <div style={S.note}>Counselings are applied from the point total, not chosen per incident — leaders document, HR counsels.</div>
              <div style={S.tGrid}>
                {counsel.map((t) => <button key={t.id} disabled={!canCounsel} style={{ ...S.tCard, ...(canCounsel ? {} : S.tLock) }} onClick={() => start(t)}><div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{t.title} {!canCounsel && "🔒"}</div><div style={{ fontSize: 11, color: "#9CA3AF" }}>Counseling {t.step}</div><div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280" }}>{t.outcome || (t.points + " pts")}</div></button>)}
              </div>
            </>
          )}
        </>
      )}

      {/* ── The file, in sections (Matt, July 16) ──
          Point total up top, then Write-ups / Counselings / Documentation, each
          with its own count and point subtotal. An empty group renders nothing —
          a clean file shouldn't show three empty headers.
          Hidden entirely in docOnly: a documenting leader writes, never reads. */}
      {!docOnly && (() => {
        const live = entries.filter((x) => !x.removed);
        const gone = entries.filter((x) => x.removed);
        return (
          <>
            <div style={S.sLbl}>Employee File ({live.length})</div>
            {live.length === 0 && gone.length === 0 ? (
              <div style={S.empty}>No documentation on file yet.</div>
            ) : (
              <>
                <div style={S.fileTotal}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#6B7280" }}>Point total</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: total < 0 ? "#DD0031" : "#0F766E" }}>{total} pts</span>
                </div>
                {/* Without this line the total looks wrong to anyone who
                    remembers a bigger number before the reset. */}
                <div style={{ fontSize: 11, color: "#8A93A3", margin: "0 2px 10px", lineHeight: 1.45 }}>
                  Counting since <b>{periodLabel()}</b>. Points reset every six months, on 1 January and 1 July. Everything filed before then stays on this record — it just no longer counts toward the total.
                </div>
                {FILE_GROUPS.map((g) => {
                  const rows = live.filter((x) => groupOf(x) === g.id);
                  if (!rows.length) return null;
                  // Scoped to the current period for the same reason the header
                  // total is — a section subtotal that counted archived points
                  // would contradict the number directly above it.
                  const pts = rows.filter(inCurrentPeriod).reduce((s, x) => s + (Number(x.points) || 0), 0);
                  const pending = rows.filter((x) => x.pendingSig).length;
                  const unpriced = rows.filter((x) => x.needsPricing).length;
                  return (
                    <div key={g.id} style={{ marginBottom: 6 }}>
                      <div style={S.gHead}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>
                            {g.label} <span style={{ color: "#9CA3AF", fontWeight: 700 }}>({rows.length})</span>
                            {unpriced > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: "#B45309", marginLeft: 8 }}>⚑ {unpriced} needs pricing</span>}
                            {pending > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: "#B45309", marginLeft: 8 }}>⏳ {pending} awaiting signature</span>}
                          </div>
                          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>{g.blurb}</div>
                        </div>
                        {pts !== 0 && (
                          <span style={{ fontSize: 13, fontWeight: 800, flexShrink: 0, marginLeft: 10, color: pts < 0 ? "#DD0031" : "#0F766E" }}>{pts} pts</span>
                        )}
                      </div>
                      {rows.map((x) => (
                        <EntryCard key={x.id} x={x} e={e} hrExec={hrExec} isSelf={isSelf}
                          onSignEntry={onSignEntry} setEditing={setEditing} onRemove={onRemove} onRestore={onRestore} />
                      ))}
                    </div>
                  );
                })}
                {/* Removed entries are soft-deleted, not gone. Only whoever can
                    edit gets to look at them or put one back. */}
                {gone.length > 0 && hrExec && (
                  <div style={{ marginTop: 10 }}>
                    <button style={{ ...S.sec, width: "100%" }} onClick={() => setShowRemoved((v) => !v)}>
                      {showRemoved ? "Hide" : "Show"} removed entries ({gone.length})
                    </button>
                    {showRemoved && (
                      <div style={{ marginTop: 8 }}>
                        <div style={S.note}>Removed entries stay on the record and keep their history — they just stop counting points. Restore puts one back.</div>
                        {gone.map((x) => (
                          <EntryCard key={x.id} x={x} e={e} hrExec={hrExec} isSelf={isSelf}
                            onSignEntry={onSignEntry} setEditing={setEditing} onRemove={onRemove} onRestore={onRestore} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        );
      })()}
    </>
  );
}

// A ledger row that OPENS. Hannah, July 16: "I want to be able to click on this
// and see the documentation." The ledger showed a title, a date and a number —
// enough to know something happened, not enough to know what. That gap is worst
// on migrated Team Docs records, where the body is the only thing carrying the
// story. Tapping now reveals the entry text, who issued it, and the signatures,
// without leaving Points.
function LedgerRow({ x }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ ...S.fCard, padding: 0, marginBottom: 6, overflow: "hidden" }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <span style={{ color: "#9CA3AF", fontSize: 12, width: 10, flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600, color: "#111827", fontSize: 14, display: "block" }}>{x.title}</span>
          <span style={{ fontSize: 12, color: "#9CA3AF" }}>
            {x.date}{x.counseling ? " · Counseling " + x.step : ""}{x.source === "teamdocs" ? " · from Team Docs" : ""}
            {!inCurrentPeriod(x) && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, letterSpacing: .3, textTransform: "uppercase", color: "#8A93A3", background: "#EEF0F4", borderRadius: 6, padding: "1px 6px" }}>Archived · prior period</span>}
          </span>
        </span>
        {x.needsPricing && (
          <span style={{ fontSize: 10, fontWeight: 800, color: "#B45309", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6, padding: "1px 6px", flexShrink: 0, whiteSpace: "nowrap" }}>unpriced</span>
        )}
        <span style={{ fontWeight: 700, flexShrink: 0, color: x.points < 0 ? "#DD0031" : "#0F766E" }}>{x.points} pts</span>
      </button>
      {open && (
        <div style={{ padding: "10px 12px 12px 34px", borderTop: "1px dashed #E4E3DD" }}>
          <div style={{ fontSize: 13, color: "#374151", whiteSpace: "pre-wrap" }}>{x.body}</div>
          {(x.sig || x.leaderSig) && (
            <div style={S.sigBox}>
              {x.sig && <div style={{ fontSize: 12, color: "#374151" }}><span style={{ color: "#9CA3AF" }}>Team member:</span> <strong>{x.sig}</strong></div>}
              {x.leaderSig && <div style={{ fontSize: 12, color: "#374151", marginTop: 3 }}><span style={{ color: "#9CA3AF" }}>Leader:</span> <strong>{x.leaderSig}</strong></div>}
            </div>
          )}
          {x.pendingSig && (
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: "#B45309" }}>⏳ Awaiting signature</div>
          )}
          {x.needsPricing && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#B45309" }}>Filed at 0 pts — set the points from the <b>File</b> tab (Edit).</div>
          )}
          <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 8, fontStyle: "italic" }}>Issued by {x.by}</div>
        </div>
      )}
    </div>
  );
}

/* ── LEADERSHIP STANDARDS ──────────────────────────────────────────────────
   Hannah and Bri, Aug 3 2026: "it would be easier for the team to understand
   if this were set up like the normal point system — but a Leadership
   Standards section in HR. It would be a separate section for accumulated
   negative leadership points for these infractions."

   ★ SEPARATE FROM THE POINTS SECTION, DELIBERATELY. This is the LEADERSHIP
   layer. Attendance and conduct stay on the team member points system, and
   falsification, cash integrity and harassment go straight to HR under the
   Serious lines. Mixing them would let a leadership pattern hide inside an
   attendance total, or the reverse.

   ★ IT SHOWS THE LADDER EVEN AT ZERO. Somebody at 0 should be able to see
   what the steps are and what earns a point, without waiting to be told at 3.
   The whole argument for this system over a judgement call is that it is
   knowable in advance.

   ★ VOID, NEVER DELETE. A withdrawn entry stays on the record marked as
   withdrawn. Documentation that can vanish is documentation nobody can rely
   on later, in either direction. */
function LeadershipSection({ e, entries, canFile, canSubmit, acting, onFile, onVoid, onFilePending }) {
  const today = new Date().toISOString().slice(0, 10);
  const [duty, setDuty] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const list = Array.isArray(entries) ? entries : [];
  const st = ldrStanding(list, today);
  const live = list.filter((x) => !x.voided);
  const pending = ldrPending(list);

  const file = () => {
    if (!duty) return;
    const by = actingSig(acting, "");
    /* A submitter's entry is marked pending here, at the one place an entry is
       created, so it cannot be missed by a future caller. */
    onFile({ ...makeLdrEntry({ duty, date, by, note }), ...(canFile ? {} : { pending: true }) });
    setDuty(""); setNote(""); setDate(today);
  };

  const tone = st.total >= LDR_CONFIG.reviewAt ? "#8A1220"
    : st.total >= LDR_CONFIG.writtenAt ? "#B45309"
    : st.total >= LDR_CONFIG.coachingAt ? "#B45309" : "#166B4A";

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ border: "1px solid #E5E7EB", borderRadius: 12, padding: "12px 14px", background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 26, fontWeight: 800, color: tone }}>{st.total}</span>
          <span style={{ fontSize: 13, color: "#6B7280" }}>
            point{st.total === 1 ? "" : "s"} in the last {LDR_CONFIG.windowDays} days
          </span>
        </div>
        <div style={{ fontSize: 13, color: "#374151", marginTop: 4, lineHeight: 1.5 }}>
          {st.stage
            ? <><strong>{st.stage.label}.</strong> {st.stage.action}</>
            : <>No step reached. {st.next ? `${st.next.at - st.total} more would reach ${st.next.label.toLowerCase()}.` : ""}</>}
        </div>
        {/* ★ THE WHOLE LADDER, ALWAYS, NOT JUST THE NEXT RUNG.
            Bri, Aug 3 2026: "can we have the clear path of point deductions
            laid out for them. I see the 'next step' based on where they are
            which is helpful, but we also need them to see what accumulating
            these points can lead to. The goal is transparency."
            She is right, and it is the entire argument for a points ladder over
            a judgement call: someone at 1 point should be able to see that 7
            means a demotion review, without having to reach 5 to find out. The
            step they are at or past is marked, so it reads as a path rather
            than a threat. */}
        <div style={{ marginTop: 10, borderTop: "1px solid #F1F3F5", paddingTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "#6B7280", marginBottom: 5 }}>
            What the points lead to
          </div>
          {ldrStages().map((sg) => {
            const reached = st.total >= sg.at;
            return (
              <div key={sg.key} style={{ display: "flex", gap: 9, alignItems: "baseline", padding: "3px 0" }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, minWidth: 20, color: reached ? "#8A1220" : "#9CA3AF" }}>{sg.at}</span>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: reached ? "#111827" : "#374151" }}>{sg.label}</span>
                  <span style={{ fontSize: 12, color: "#6B7280" }}> — {sg.action}</span>
                </div>
              </div>
            );
          })}
          <div style={{ fontSize: 11.5, color: "#6B7280", marginTop: 5, lineHeight: 1.45 }}>
            Points expire {LDR_CONFIG.windowDays} days after the date they were earned.
          </div>
        </div>

        {/* Points expiring soon are shown because they change what happens
            next — someone at 5 with two rolling off next week is in a very
            different position from someone at 5 who just earned it. */}
        {st.expiring && st.expiring.length > 0 && (
          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>
            {st.expiring.length} expiring within 14 days.
          </div>
        )}
      </div>

      {(canFile || canSubmit) && (
        <div style={{ border: "1px solid #E5E7EB", borderRadius: 12, padding: "12px 14px", background: "#FAFBFC" }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "#6B7280", marginBottom: 8 }}>
            {canFile ? "Log a standard" : "Submit for HR review"}
          </div>
          <select value={duty} onChange={(ev) => setDuty(ev.target.value)}
            style={{ width: "100%", fontSize: 16, padding: "8px 10px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", marginBottom: 8 }}>
            <option value="">Choose what happened…</option>
            {[1, 2, 3].map((w) => (
              <optgroup key={w} label={`${w} point${w === 1 ? "" : "s"}`}>
                {LDR_DUTIES.filter((d) => d.w === w).map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <input type="date" value={date} onChange={(ev) => setDate(ev.target.value)}
              style={{ fontSize: 16, padding: "8px 10px", borderRadius: 8, border: "1px solid #D1D5DB" }} />
            <input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="What happened (optional but useful)"
              style={{ flex: "1 1 200px", fontSize: 16, padding: "8px 10px", borderRadius: 8, border: "1px solid #D1D5DB" }} />
          </div>
          <button onClick={file} disabled={!duty}
            style={{ background: duty ? "#14243D" : "#D1D5DB", color: "#fff", border: "none", borderRadius: 8,
              padding: "9px 16px", fontSize: 13.5, fontWeight: 800, cursor: duty ? "pointer" : "default" }}>
            {canFile ? "Log it" : "Send to HR"}
          </button>
          <div style={{ fontSize: 11.5, color: "#6B7280", marginTop: 6, lineHeight: 1.45 }}>
            {canFile
              ? `${e && e.name ? e.name.split(" ")[0] : "They"} is told straight away, with the total and the next step. Nothing here files itself.`
              : `This goes to HR first. It counts for nothing and tells ${e && e.name ? e.name.split(" ")[0] : "them"} nothing until HR files it.`}
          </div>
        </div>
      )}

      <div>
        {live.length === 0 && list.length === 0 ? (
          <div style={{ fontSize: 13, color: "#6B7280" }}>Nothing on record.</div>
        ) : list.map((x) => {
          const d = ldrDutyById(x.duty);
          return (
            <div key={x.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 0", borderTop: "1px solid #F1F3F5", opacity: x.voided ? 0.5 : 1 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#374151", minWidth: 18 }}>{x.w}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: "#111827", textDecoration: x.voided ? "line-through" : "none" }}>
                  {d ? d.label : x.duty}
                </div>
                <div style={{ fontSize: 11.5, color: "#6B7280" }}>
                  {x.date}{x.by ? ` · ${x.by}` : ""}{x.voided ? " · withdrawn" : ""}
                </div>
                {x.note && <div style={{ fontSize: 12.5, color: "#374151", marginTop: 2 }}>{x.note}</div>}
              </div>
              {canFile && !x.voided && (
                <button onClick={() => onVoid(x.id)}
                  style={{ background: "transparent", border: "1px solid #E5E7EB", borderRadius: 7, padding: "3px 9px",
                    fontSize: 11.5, fontWeight: 700, color: "#6B7280", cursor: "pointer" }}>
                  Withdraw
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PointsSection({ e, entries, total }) {
  const byArea = {};
  TEMPLATES.forEach((t) => { (byArea[t.area] = byArea[t.area] || []).push(t); });
  // Removed entries are soft-deleted and don't count toward total() — so they
  // must not appear in the ledger either. Listing one here would show its points
  // against a total that ignores them, and the column wouldn't add up.
  const live = entries.filter((x) => !x.removed);
  return (
    <>
      <div style={S.card}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#9CA3AF" }}>Personal Point Total</div>
        <div style={{ fontSize: 34, fontWeight: 700, color: total < 0 ? "#DD0031" : "#0F766E" }}>{total}</div>
        <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>Everyone starts at 0. Points are deducted when documentation is added to your file for attendance or policy issues. Counseling steps carry the point values shown below. Leadership can file a Point Adjustment to correct an inaccurate total.</div>
      </div>
      <div style={S.sLbl}>Point Ledger ({live.length})</div>
      {live.length === 0 && <div style={S.empty}>No point activity yet — you're at 0.</div>}
      {live.length > 0 && <div style={{ fontSize: 11, color: "#9CA3AF", margin: "-2px 0 8px" }}>Tap any line to read the documentation behind it.</div>}
      {live.map((x) => <LedgerRow key={x.id} x={x} />)}
      {live.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", borderTop: "3px solid #E4E3DD", marginTop: 2, marginBottom: 4 }}>
          <div style={{ fontWeight: 700, color: "#111827" }}>Current Total</div>
          <div style={{ fontWeight: 700, color: total < 0 ? "#DD0031" : "#0F766E" }}>{total} pts</div>
        </div>
      )}
      <div style={S.sLbl}>Counseling Path</div>
      <div style={S.ladder}>
        {COUNSELING_LADDER.map((c) => <div key={c.step} style={S.ladRow}><span style={S.ladStep}>{c.step}</span><span style={{ flex: 1 }}>{c.form}</span><span style={{ fontWeight: 700, color: "#6B7280" }}>{c.at}</span></div>)}
        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6, fontStyle: "italic" }}>Each form above triggers that counseling step. Final termination is completed manually by an Admin.</div>
      </div>
      <div style={S.sLbl}>Point Values</div>
      {Object.keys(byArea).map((area) => (
        <div key={area} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: AREA_COLORS[area] || "#374151", marginBottom: 6 }}>{area}</div>
          {byArea[area].map((t) => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#374151", padding: "4px 0", borderBottom: "1px solid #F3F4F6" }}>
              <span>{t.title}{t.counseling ? " (Counseling " + t.step + ")" : ""}</span><span style={{ fontWeight: 700, color: t.id === "adjust" ? "#0F766E" : (t.source === "recovery" ? "#0F766E" : "#DD0031") }}>{t.id === "adjust" ? "± pts" : (t.outcome || t.points + " pts")}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/* Renders a template's categories grouped into its sections, with Do-Not-Score
   sections clearly marked so nobody wonders why a 5 didn't move the Overall.
   A template with no sections renders one unnamed group = the old flat list. */
function CategoryFields({ tpl, ratings, onRate }) {
  const cats = (tpl && tpl.categories) || [];
  const secs = sectionsOf(tpl);
  const groups = secs.length
    ? secs.map((s) => ({ sec: s, list: cats.filter((c) => c.sectionId === s.id) }))
        .concat([{ sec: null, list: cats.filter((c) => !c.sectionId || !secs.some((s) => s.id === c.sectionId)) }])
    : [{ sec: null, list: cats }];
  return (
    <>
      {groups.filter((g) => g.list.length).map((g, gi) => (
        <div key={g.sec ? g.sec.id : `ungrouped-${gi}`} style={{ marginBottom: 6 }}>
          {g.sec && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0 6px" }}>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "#374151" }}>{g.sec.name || "Section"}</span>
              {g.sec.score === false && (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "#92400E", background: "#FEF3C7", borderRadius: 20, padding: "2px 8px" }}>NOT SCORED</span>
              )}
            </div>
          )}
          {g.list.map((c) => (
            <div key={c.id}>
              <Lbl t={c.name + " (1–" + (Number(c.max) || 5) + ")"} />
              <Rating value={(ratings || {})[c.id] || 0} max={Number(c.max) || 5}
                labels={c.labels} allowNA={!!c.allowNA}
                onChange={(v) => onRate(c.id, v)} />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════
   APPLICATIONS — read-only mirror of Professional Growth (Bri, Jul 22:
   "can they view it through their file directly, with all privacy settings
   still intact — ex. the recommendations for Team Leader application hidden").

   READ-ONLY BY DESIGN. Applications are started and completed in the
   Professional Growth page; this is a window onto them, never an entry point.
   Nothing here writes.

   RECOMMENDATION CONTENTS ARE NEVER RENDERED HERE — only "Completed by
   {name}" / "In progress by {name}". Those letters are visible in exactly one
   place, Bri's admin review panel, and this view must not become a second
   door to them. If you add a field to a step, check it isn't `recs`.
   ════════════════════════════════════════════════════════════════ */
const PG_INDEX_KEY = "gc-pg-index-v1";
const pgAppKey = (role, slug) => `gc-pg-app-v1:${role}:${slug}`;
// Must match slugify() in ProfessionalGrowth.jsx — the application keys are
// built with it, so a divergence here means "no applications found" forever.
const pgSlug = (s) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const PG_ROLE_LABEL = { trainer: "Team Trainer", "team-leader": "Team Leader", "assistant-director": "Assistant Director" };

/* ── Assign evaluations (LDD+) ──────────────────────────────────────────── */
function AssignEvals({ templates, team, teamDir, copy, onCopy, onAssign, onBack }) {
  const tpls = tplsOf(templates);
  const [templateId, setTemplateId] = useState(tpls[0].id);
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [mode, setMode] = useState("group");         // group | people
  const [teamId, setTeamId] = useState("");
  const [tier, setTier] = useState("member");
  const [picked, setPicked] = useState([]);          // roster ids
  const [q, setQ] = useState("");
  const [toast, setToast] = useState("");
  const [showCheck, setShowCheck] = useState(false);

  const dirTeams = (teamDir && teamDir.teams) || [];
  // Bri's directory holds names, not HR ids — resolve back to the roster so an
  // assignment always points at a real file. An unmatched name is SKIPPED and
  // reported, never silently dropped and never guessed at.
  const byName = {};
  team.forEach((m) => { byName[String(m.name || "").trim().toLowerCase()] = m; });
  const byId = {};
  team.forEach((m) => { byId[String(m.id)] = m; });

  // ★ ID FIRST, NAME SECOND (Bri, Jul 24: "let's do the work that will fix
  // future issues… do it right the first time").
  // TeamDirectory's enrichWithHR already resolves most directory people to a
  // roster id and stores it as `hrId`. Using it means renaming somebody in Meet
  // Our Teams can no longer detach them from their own file — which is the same
  // fault that hid recommendation requests from every leader.
  // ⚠️ THE NAME FALLBACK STAYS, deliberately: a directory entry whose name never
  // resolved has no id to use, and dropping the fallback would make those people
  // unassignable rather than merely unmatched.
  const resolveDirPerson = (p) => {
    if (!p) return undefined;
    if (p.hrId != null && String(p.hrId) !== "" && byId[String(p.hrId)]) return byId[String(p.hrId)];
    return byName[String(p.name || "").trim().toLowerCase()];
  };

  const groupTeam = dirTeams.find((t) => t.id === teamId);
  const groupMatches = (groupTeam ? (groupTeam.people || []).filter((p) => p.tier === tier) : [])
    .map((p) => ({ p, m: resolveDirPerson(p) }));
  const groupFound = groupMatches.filter((x) => x.m);
  const groupMissing = groupMatches.filter((x) => !x.m);

  // Every unmatched person across every team and tier, grouped by team.
  // Now that ids resolve first, anyone still listed here genuinely has no HR
  // record to point at — so the list is short and every entry is real work.
  const nameCheck = dirTeams.map((t) => ({
    team: t.name,
    people: (t.people || []).filter((p) => !resolveDirPerson(p))
      .map((p) => ({ name: p.name, tier: p.tier })),
  })).filter((g) => g.people.length);

  const subjects = mode === "group" ? groupFound.map((x) => x.m) : team.filter((m) => picked.includes(m.id));
  const assignee = team.find((m) => m.id === assigneeId);
  const tpl = tpls.find((t) => t.id === templateId) || tpls[0];
  const ready = assignee && subjects.length > 0;

  const go = () => {
    if (!ready) return;
    const n = onAssign(subjects.map((s) => ({
      subjectId: s.id, subjectName: s.name,
      assigneeId: assignee.id, assigneeName: assignee.name,
      templateId: tpl.id, templateName: tpl.name, dueDate,
    })));
    setPicked([]); setToast(n + (n === 1 ? " evaluation assigned" : " evaluations assigned"));
    setTimeout(() => setToast(""), 2600);
  };

  const filtered = team.filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div style={S.body}>
      <button style={S.sec} onClick={onBack}>← Back</button>
      <div style={S.sLbl}>Assign evaluations</div>
      <div style={S.card}>
        <Lbl t="Template" />
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={S.in}>
          {tpls.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <Lbl t="Who completes them" />
        <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} style={S.in}>
          <option value="">— Choose a leader —</option>
          {team.filter((m) => rankOf(m) >= 4).map((m) => <option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}
        </select>
        <Lbl t="Due date" />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={S.in} />
      </div>

      <div style={S.card}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[["group", "A whole group"], ["people", "Pick people"]].map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} style={{ ...S.pill, ...(mode === k ? S.pillA : {}) }}>{l}</button>
          ))}
        </div>
        {mode === "group" ? (
          <>
            <Lbl t="Team" />
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} style={S.in}>
              <option value="">— Choose a team —</option>
              {dirTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <Lbl t="Tier" />
            <select value={tier} onChange={(e) => setTier(e.target.value)} style={S.in}>
              {Object.entries(TIER_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <div style={{ fontSize: 12.5, color: "#6B7280" }}>
              {teamId ? `${groupFound.length} ${TIER_LABEL[tier].toLowerCase()} on this team` : "Choose a team to see who's included."}
            </div>
            {groupMissing.length > 0 && (
              <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "9px 11px", fontSize: 12, color: "#92400E", marginTop: 8, lineHeight: 1.45 }}>
                <b>{groupMissing.length} not matched to an HR file</b> and will be skipped:{" "}
                {groupMissing.map((x) => x.p.name).join(", ")}. Assign them individually, or fix the name so the two match.
              </div>
            )}
          </>
        ) : (
          <>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the roster" style={S.in} />
            <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #E4E3DD", borderRadius: 8 }}>
              {filtered.map((m) => (
                <label key={m.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 10px", fontSize: 13.5, cursor: "pointer" }}>
                  <input type="checkbox" checked={picked.includes(m.id)}
                    onChange={() => setPicked((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]))} />
                  {m.name} <span style={{ color: "#9CA3AF" }}>· {m.role}</span>
                </label>
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 6 }}>{picked.length} selected</div>
          </>
        )}
      </div>

      <div style={S.card}>
        <div style={{ fontSize: 13, color: "#374151", marginBottom: 10 }}>
          {ready
            ? <><b>{assignee.name}</b> will be asked to complete <b>{subjects.length}</b> {subjects.length === 1 ? "evaluation" : "evaluations"} using <b>{tpl.name}</b>{dueDate ? <>, due <b>{dueDate}</b></> : ""}.</>
            : "Choose a leader and at least one person to evaluate."}
        </div>
        <button style={{ ...S.prim, opacity: ready ? 1 : .5 }} onClick={go} disabled={!ready}>Assign</button>
        {toast && <div style={{ marginTop: 8, fontSize: 13, color: "#0F766E", fontWeight: 700 }}>{toast}</div>}
      </div>

      {/* Bri, Jul 23: "There are names from the 'teams' that are not recognized
          in HR... tell me which don't match". The per-assignment warning only
          covers the team+tier she happens to be looking at, so this walks EVERY
          team and every tier in one pass. Read-only on purpose — it reports the
          mismatch and she fixes the name at the source. Nothing here renames
          anyone: a wrong auto-match would attach an evaluation to the wrong
          person's file. */}
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: nameCheck.length ? 8 : 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: "#6B7280" }}>Name check</div>
            <div style={{ fontSize: 12.5, color: nameCheck.length ? "#92400E" : "#0F766E", marginTop: 2 }}>
              {nameCheck.length
                ? `${nameCheck.length} ${nameCheck.length === 1 ? "name" : "names"} on Team Site don't match an HR record`
                : "Every name on Team Site matches an HR record ✓"}
            </div>
          </div>
          {nameCheck.length > 0 && (
            <button style={S.sec} onClick={() => setShowCheck((v) => !v)}>{showCheck ? "Hide" : "Show"}</button>
          )}
        </div>
        {showCheck && nameCheck.length > 0 && (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.45 }}>
              These people are on a Team Site team but no HR record matches their name, so they're skipped when you assign to a whole group.
              Fix the spelling on whichever side is wrong — Team Site or the roster — and they'll match.
            </div>
            {nameCheck.map((g) => (
              <div key={g.team} style={{ borderLeft: "3px solid #FDE68A", borderTop: "3px solid #FDE68A", paddingLeft: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{g.team}</div>
                {g.people.map((p, i) => (
                  <div key={i} style={{ fontSize: 13, color: "#6B7280" }}>
                    {p.name} <span style={{ color: "#9CA3AF" }}>· {TIER_LABEL[p.tier] || p.tier}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bri owns this wording — it appears on every assigned evaluation. */}
      <div style={S.card}>
        <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: "#6B7280", marginBottom: 8 }}>
          🔒 Private question wording
        </div>
        <Lbl t="The Yes/No question every evaluator answers" />
        <input value={copy.convoPrompt} onChange={(e) => onCopy({ convoPrompt: e.target.value })} style={S.in} />
        <Lbl t="The privacy note shown underneath it" />
        <textarea value={copy.privacyNote} onChange={(e) => onCopy({ privacyNote: e.target.value })} style={{ ...S.in, height: 64 }} />
        <div style={{ fontSize: 11.5, color: "#6B7280" }}>
          Answers to this, and the evaluator's private notes, go only to you and HR. They are never written into the team member's file.
        </div>
      </div>
    </div>
  );
}

/* ── Manage every assignment (LDD+ / HR) ────────────────────────────────
   Bri, Jul 23: "can I have a place within that area to view all assigned,
   re-assign, update due dates, and delete assignments" — she had test rows
   she couldn't clear. Covers every status, not just the open ones, so an
   approved evaluation's PRIVATE answer stays reachable to her and Hannah
   after it has left the evaluator's queue. */
/* ⚠️ A STATUS WITH NO LABEL FALLS BACK TO ITS RAW KEY, and both readers below
   already do that — so "recommended" would have rendered as the word
   "recommended" in grey rather than breaking. Named anyway, because a screen
   Bri reads should say what it means. */
const TASK_STATUS_LABEL = { open: "Not started", submitted: "Awaiting approval", approved: "Approved", returned: "Sent back", recommended: "Recommended to someone else" };
const TASK_STATUS_TONE = { open: "#6B7280", submitted: "#92400E", approved: "#0F766E", returned: "#B21230", recommended: "#6D28D9" };

/* ── One pending recommendation, and the two ways it can go. ──────────────
   Its own component so the open/closed state of the deny box belongs to the
   row rather than to the whole list — with one `openId` shared across rows,
   typing a reason on one and then scrolling to another would carry the text
   with it. */
function RecDecision({ t, onApprove, onDeny }) {
  const [denying, setDenying] = useState(false);
  const [note, setNote] = useState("");
  const [due, setDue] = useState("");
  return (
    <div style={{ marginTop: 10, border: "1px solid #DDD6FE", background: "#F5F3FF", borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12.5, color: "#5B21B6", fontWeight: 700, marginBottom: 4 }}>
        {t.rec.byName} thinks {t.rec.toName} should write this one.
      </div>
      <div style={{ fontSize: 13, color: "#111827", marginBottom: 8, whiteSpace: "pre-wrap" }}>{t.rec.why}</div>
      <div style={{ fontSize: 11.5, color: "#6B7280", marginBottom: 10 }}>
        Only you and HR see that reason. {t.rec.toName} is told who recommended them and nothing else.
      </div>
      {!denying ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* Approving keeps the due date, which is Bri's rule for the approve
              side. The deny side is where a date can change. */}
          <button style={S.prim} onClick={() => onApprove(t)}>
            Approve — {t.rec.toName} writes it{t.dueDate ? `, still due ${t.dueDate}` : ""}
          </button>
          <button style={S.sec} onClick={() => setDenying(true)}>Deny</button>
        </div>
      ) : (
        <>
          <Lbl t="Why not? (goes back to the leader)" />
          <textarea value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={`This stays with ${t.rec.byName}, and they will read this`} style={{ ...S.in, height: 60 }} />
          <Lbl t="New due date (optional — blank keeps the one it has)" />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={S.in} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={{ ...S.prim, opacity: note.trim() ? 1 : 0.5 }} disabled={!note.trim()}
              onClick={() => { onDeny(t, note, due); setDenying(false); setNote(""); setDue(""); }}>
              Send it back to {t.rec.byName}
            </button>
            <button style={S.sec} onClick={() => { setDenying(false); setNote(""); setDue(""); }}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}

function ManageEvalTasks({ tasks, team, onPatch, onDelete, onApproveRec, onDenyRec, onBack }) {
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState(null);
  const rows = tasks.filter((t) => filter === "all" || t.status === filter);
  const counts = tasks.reduce((a, t) => ({ ...a, [t.status]: (a[t.status] || 0) + 1 }), {});
  const leaders = team.filter((m) => rankOf(m) >= 4);

  return (
    <div style={S.body}>
      <button style={S.sec} onClick={onBack}>← Back</button>
      <div style={S.sLbl}>All assigned evaluations ({tasks.length})</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {[["all", "All"], ["recommended", "Recommendations"], ["open", "Not started"], ["submitted", "Awaiting approval"], ["returned", "Sent back"], ["approved", "Approved"]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ ...S.pill, ...(filter === k ? S.pillA : {}) }}>
            {l}{k !== "all" && counts[k] ? ` · ${counts[k]}` : ""}
          </button>
        ))}
      </div>

      {!rows.length && <div style={S.empty}>Nothing here.</div>}
      {rows.map((t) => (
        <div key={t.id} style={S.card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: "#111827" }}>{t.subjectName}</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>
                {t.templateName} · {t.assigneeName}{t.dueDate ? " · due " + t.dueDate : " · no due date"}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: TASK_STATUS_TONE[t.status] || "#6B7280", marginTop: 2 }}>
                {TASK_STATUS_LABEL[t.status] || t.status}
              </div>
            </div>
            <button style={S.sec} onClick={() => setOpenId(openId === t.id ? null : t.id)}>{openId === t.id ? "Close" : "Manage"}</button>
          </div>

          {/* ★★ A PENDING RECOMMENDATION IS DECIDED HERE, NOT BURIED IN Manage
              (Bri, Aug 5 2026). It sits ABOVE the row's normal controls and is
              always open, because it is the only state on this screen that is
              waiting on HER rather than on a leader. Re-assigning by hand while
              a recommendation is pending would leave the request dangling, so
              this is the way to clear it.
              ⚠️ THE WHY IS SHOWN ONLY HERE. She and Hannah are the only people
              who reach this screen (rank 6), and approving deletes the reason
              rather than carrying it onto the re-assigned task. */}
          {t.status === "recommended" && t.rec && onApproveRec && (
            <RecDecision t={t} onApprove={onApproveRec} onDeny={onDenyRec} />
          )}

          {openId === t.id && (
            <div style={{ marginTop: 10 }}>
              {t.status === "approved" ? (
                <div style={{ fontSize: 12.5, color: "#6B7280", marginBottom: 8 }}>
                  Approved {t.reviewedAt ? String(t.reviewedAt).slice(0, 10) : ""} by {t.reviewedBy || "—"}. It's in {t.subjectName}'s file; deleting this row does NOT remove it from the file.
                </div>
              ) : (
                <>
                  <Lbl t="Who completes it" />
                  <select value={t.assigneeId} onChange={(e) => {
                    const m = leaders.find((x) => x.id === e.target.value);
                    if (m) onPatch(t.id, { assigneeId: m.id, assigneeName: m.name });
                  }} style={S.in}>
                    {leaders.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}
                  </select>
                  <Lbl t="Due date" />
                  {/* Clearing remindedAt on a date change is deliberate — a task
                      already reminded for the old date must be able to remind
                      again for the new one. */}
                  <input type="date" value={t.dueDate || ""} onChange={(e) => onPatch(t.id, { dueDate: e.target.value, remindedAt: "" })} style={S.in} />
                </>
              )}

              {(t.privateConvo || t.privateNotes) && (
                <div style={{ border: "1px solid #FDE68A", background: "#FFFBEB", borderRadius: 10, padding: 11, marginBottom: 10 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "#92400E", marginBottom: 6 }}>🔒 Private — not filed</div>
                  {t.privateConvo && <div style={{ fontSize: 13, marginBottom: 6 }}>In-person conversation needed? <b>{t.privateConvo === "y" ? "Yes" : "No"}</b></div>}
                  {t.privateNotes && <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{t.privateNotes}</div>}
                </div>
              )}

              <button style={{ ...S.sec, color: "#DD0031" }}
                onClick={() => { if (window.confirm(`Delete the assignment for ${t.subjectName}? This removes the task, not anything already filed.`)) { onDelete(t.id); setOpenId(null); } }}>
                Delete assignment
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── The assignee's own queue. NOT file access — see EVAL_TASK_KEY note. ── */
/* ═══ THE EVALUATION FORM IN SPANISH ════════════════════════════════════════
   Bri, Aug 10 2026: "Can I also have a translation feature added for
   evaluations for leaders to use when they need to complete an evaluation?"

   ⚠️⚠️ ONLY WHAT BRI WROTE IS TRANSLATED. Section names, category names, the
   labels under each rating button and the two confidential prompts. What the
   LEADER types — their comments, their private answer, their private notes —
   is never sent anywhere and never rewritten. Those sentences go into a real
   person's permanent file, and a translated one would be a sentence in that
   file that nobody wrote. See the EVALUATIONS block in courseTranslate.js.

   ⚠️ RATINGS ARE KEYED BY CATEGORY ID, which the translation never touches, so
   switching language mid-form cannot move a score. The same guarantee the
   applications get from translating a VIEW rather than the record.

   ⚠️ THE TEMPLATE NAME STAYS ENGLISH, matching the applications: HR files this
   under "90 Day Promotion Review", and a Spanish name on the same record makes
   it harder to find rather than easier to read. */
const EVAL_UI_EN = {
  comments: "Comments",
  commentsHint: "Strengths, growth areas, goals",
  privateHdr: "Private",
  yes: "Yes", no: "No",
  privNotes: "Private notes (optional)",
  privHint: "Anything you want Leadership Development and HR to know",
  submit: "Submit for approval",
  back: "\u2190 Back to my list",
  evalOf: "Evaluation",
  due: "due",
  approvalNote: (who) => `This goes to Leadership Development and HR for approval. It isn't added to ${who}'s file until it's approved.`,
  translating: "Translating\u2026",
  trFailed: "Could not translate just now. Showing English.",
};
/* ⚠️ SPREAD OVER EN, so a key added above can never render as blank here — it
   falls back to English until somebody writes the Spanish. Same shape as
   ProfessionalGrowth's UI pair. */
const EVAL_UI_ES = {
  ...EVAL_UI_EN,
  comments: "Comentarios",
  commentsHint: "Fortalezas, \u00e1reas de crecimiento, metas",
  privateHdr: "Privado",
  yes: "S\u00ed", no: "No",
  privNotes: "Notas privadas (opcional)",
  privHint: "Cualquier cosa que quieras que sepan Desarrollo de Liderazgo y Recursos Humanos",
  submit: "Enviar para aprobaci\u00f3n",
  back: "\u2190 Volver a mi lista",
  evalOf: "Evaluaci\u00f3n",
  due: "para",
  approvalNote: (who) => `Esto va a Desarrollo de Liderazgo y Recursos Humanos para su aprobaci\u00f3n. No se agrega al archivo de ${who} hasta que se apruebe.`,
  translating: "Traduciendo\u2026",
  trFailed: "No se pudo traducir en este momento. Se muestra en ingl\u00e9s.",
};
const EVAL_UI = { en: EVAL_UI_EN, es: EVAL_UI_ES };

function EvalLangToggle({ lang, onPick }) {
  return (
    <div style={{ display: "flex", gap: 5 }}>
      {[["en", "EN"], ["es", "ES"]].map(([v, label]) => (
        <button key={v} type="button" onClick={() => onPick(v)} aria-pressed={lang === v}
          style={{ fontSize: 11.5, fontWeight: 800, lineHeight: 1, cursor: "pointer", borderRadius: 999,
            padding: "5px 11px", border: `1px solid ${lang === v ? "#14243D" : "#E5E7EB"}`,
            background: lang === v ? "#14243D" : "#fff", color: lang === v ? "#fff" : "#6B7280" }}>
          {label}
        </button>
      ))}
    </div>
  );
}

function MyEvalTasks({ tasks, templates, acting, copy, leaders = [], onRecommend, onSubmit, onBack }) {
  const tpls = tplsOf(templates);
  const [openId, setOpenId] = useState(null);
  const [rat, setRat] = useState({});
  const [comments, setComments] = useState("");
  const [privateConvo, setPrivateConvo] = useState("");
  const [privateNotes, setPrivateNotes] = useState("");
  // The recommend panel is closed until asked for — see the button's comment.
  const [recOpen, setRecOpen] = useState(false);
  const [recTo, setRecTo] = useState("");
  const [recWhy, setRecWhy] = useState("");
  /* Bri's Spanish. `lang` is a view setting only — nothing about it is stored
     on the task, the draft or the finished evaluation. */
  const [lang, setLang] = useState("en");
  const [trEs, setTrEs] = useState(null);
  const [trState, setTrState] = useState("");        // "" | "loading" | "failed"
  const t = tasks.find((x) => x.id === openId);
  const tplRaw = t ? (tpls.find((x) => x.id === t.templateId) || tpls[0]) : null;

  /* The AUTHORED words of this evaluation, and nothing else. Stable identity so
     the effect below re-runs on a real change rather than on every render.
     ⚠️ NOT the draft, not the ratings, not the comments. */
  const evalView = useMemo(() => (tplRaw ? {
    sections: sectionsOf(tplRaw).map((x) => ({ name: x.name })),
    categories: ((tplRaw.categories) || []).map((c) => ({ name: c.name, labels: c.labels })),
    convoPrompt: copy.convoPrompt, privacyNote: copy.privacyNote,
  } : null), [tplRaw, copy.convoPrompt, copy.privacyNote]);

  useEffect(() => {
    if (lang !== "es" || !evalView) return undefined;
    let alive = true;
    setTrEs(null); setTrState("loading");
    (async () => {
      try {
        const texts = collectEvalStrings(evalView);
        if (!texts.length) { if (alive) setTrState(""); return; }
        const r = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
          body: JSON.stringify({ lang: "es", texts }),
        });
        const d = await r.json().catch(() => null);
        if (!alive) return;
        if (!r.ok || !d || d.ok !== true) { setTrState("failed"); return; }
        /* Null means the reply did not hold one string per string sent. English
           is the right answer: a list put back shifted by one puts every rating
           label under the wrong number. */
        const built = applyEvalStrings(evalView, d.texts);
        if (!built) { setTrState("failed"); return; }
        setTrEs(built); setTrState("");
      } catch { if (alive) setTrState("failed"); }
    })();
    return () => { alive = false; };
  }, [lang, evalView]);

  const T = EVAL_UI[lang] || EVAL_UI_EN;
  const shown = lang === "es" && trEs ? trEs : null;
  /* ★ A DISPLAY COPY OF THE TEMPLATE. CategoryFields is handed a template whose
     names are Spanish and whose category IDS are untouched, so it needed no
     change at all and what gets saved cannot move. */
  const tpl = tplRaw && shown
    ? { ...tplRaw,
        sections: sectionsOf(tplRaw).map((x, i) => ({ ...x, name: (shown.sections[i] || x).name })),
        categories: ((tplRaw.categories) || []).map((c, i) => ({
          ...c, name: (shown.categories[i] || c).name, labels: (shown.categories[i] || c).labels })) }
    : tplRaw;
  const shownCopy = shown ? { ...copy, convoPrompt: shown.convoPrompt, privacyNote: shown.privacyNote } : copy;

  const start = (task) => {
    setOpenId(task.id);
    setRat((task.draft && task.draft.ratings) || {});
    setComments((task.draft && task.draft.comments) || "");
    setPrivateConvo((task.draft && task.draft.privateConvo) || "");
    setPrivateNotes((task.draft && task.draft.privateNotes) || "");
  };
  const send = () => {
    onSubmit(t.id, { ratings: rat, comments, privateConvo, privateNotes, overall: overallOf(tpl, rat), evaluator: acting ? acting.name : "\u2014", date: today(), period: t.templateName });
    setOpenId(null); setRat({}); setComments(""); setPrivateConvo(""); setPrivateNotes("");
  };

  if (t && tpl) {
    return (
      <div style={S.body}>
        <button style={S.sec} onClick={() => setOpenId(null)}>{T.back}</button>
        <div style={S.sLbl}>{T.evalOf} · {t.subjectName}</div>
        <div style={S.card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ fontSize: 12.5, color: "#6B7280", flex: 1, minWidth: 140 }}>
              {/* The template name stays English on purpose — see EVAL_UI_EN. */}
              {t.templateName}{t.dueDate ? ` · ${T.due} ${t.dueDate}` : ""}
            </div>
            <EvalLangToggle lang={lang} onPick={setLang} />
          </div>
          {/* ⚠️ SAYS WHAT IS HAPPENING RATHER THAN SILENTLY SHOWING ENGLISH. A
              toggle that appears to do nothing is what Bri reported on Aug 3. */}
          {lang === "es" && trState === "loading" && (
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>{T.translating}</div>
          )}
          {lang === "es" && trState === "failed" && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8,
              padding: "8px 10px", fontSize: 12, color: "#92400E", marginBottom: 8 }}>{T.trFailed}</div>
          )}
          {t.status === "returned" && t.reviewNote && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "9px 11px", fontSize: 12.5, color: "#92400E", marginBottom: 10 }}>
              <b>Sent back for another look:</b> {t.reviewNote}
            </div>
          )}
          {/* ★ WHO PUT THIS IN FRONT OF YOU, NEVER WHY (Bri: "if it's re-assigned
              I want the AD or Director to see who recommended them, but not the
              why — that can just be for Hannah and I"). The reason is not on the
              task at all once it is approved, so this cannot leak it by accident. */}
          {t.recFrom && t.recFrom.name && (
            <div style={{ background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 8, padding: "9px 11px", fontSize: 12.5, color: "#5B21B6", marginBottom: 10 }}>
              <b>{t.recFrom.name} recommended you for this one.</b> They thought you were better placed to write it.
            </div>
          )}
          {/* ★ A DENIED RECOMMENDATION COMES BACK WITH THE REASON. Bri's rule is
              that it returns to the original leader; a return with no explanation
              would read as the button being broken. */}
          {t.recDenied && t.recDenyNote && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "9px 11px", fontSize: 12.5, color: "#92400E", marginBottom: 10 }}>
              <b>Your recommendation was not approved:</b> {t.recDenyNote}
              <div style={{ marginTop: 4 }}>This one stays with you.{t.dueDate ? ` Due ${t.dueDate}.` : ""}</div>
            </div>
          )}
          <OverallReadout value={overallOf(tpl, rat)} count={scoredCount(tpl, rat)} total={scoredCats(tpl).length} max={tplMax(tpl)} />
          <CategoryFields tpl={tpl} ratings={rat} onRate={(cid, v) => setRat((p) => ({ ...p, [cid]: v }))} />
          <Lbl t={T.comments} />
          {/* ⚠️ WHAT THEY TYPE IS NEVER TRANSLATED. Only the label and the
              placeholder change language; `comments` is filed verbatim. */}
          <textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder={T.commentsHint} style={{ ...S.in, height: 74 }} />
          {/* Confidential block. Labelled as private on the evaluator's own
              screen so they know before they write, not after. */}
          <div style={{ border: "1px solid #E5E7EB", background: "#FAFAF8", borderRadius: 10, padding: 12, margin: "4px 0 12px" }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "#6B7280", marginBottom: 6 }}>
              🔒 {T.privateHdr}
            </div>
            <div style={{ fontSize: 13, color: "#111827", marginBottom: 8 }}>{shownCopy.convoPrompt}</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {[["y", T.yes], ["n", T.no]].map(([k, l]) => (
                <button key={k} onClick={() => setPrivateConvo(privateConvo === k ? "" : k)}
                  style={{ ...S.sec, minWidth: 74, ...(privateConvo === k ? { background: "#14243D", color: "#fff", borderColor: "#14243D" } : {}) }}>{l}</button>
              ))}
            </div>
            <Lbl t={T.privNotes} />
            <textarea value={privateNotes} onChange={(e) => setPrivateNotes(e.target.value)}
              placeholder={T.privHint} style={{ ...S.in, height: 64 }} />
            <div style={{ fontSize: 11.5, color: "#6B7280", lineHeight: 1.45 }}>{shownCopy.privacyNote}</div>
          </div>
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10 }}>
            {T.approvalNote(t.subjectName)}
          </div>
          <button style={S.prim} onClick={send}>{T.submit}</button>

          {/* ═══ RETURN WITH A RECOMMENDATION ═══════════════════════════════
              ⚠️ BELOW SUBMIT AND CLOSED BY DEFAULT, ON PURPOSE. Bri asked for a
              note saying it "should be used sparingly". A second button of equal
              weight beside Submit is an invitation; a quiet line you have to
              open is not. The wording does the rest.
              ⚠️ HIDDEN ENTIRELY ONCE DENIED — her rule: "If the evaluation is
              denied they cannot re-recommend another leader." Not disabled and
              not silent: the denial banner above already says it stays with them. */}
          {!t.recDenied && onRecommend && leaders.length > 0 && (
            <div style={{ marginTop: 14, borderTop: "1px solid #E5E7EB", paddingTop: 12 }}>
              {!recOpen ? (
                <button style={{ ...S.sec, fontWeight: 600 }} onClick={() => setRecOpen(true)}>
                  Someone else should write this
                </button>
              ) : (
                <div style={{ border: "1px solid #DDD6FE", background: "#F5F3FF", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 12.5, color: "#5B21B6", marginBottom: 10, lineHeight: 1.5 }}>
                    Use this sparingly. It is for when another Assistant Director or Director
                    has worked with {t.subjectName} more closely than you have, or has input
                    you cannot give. Leadership Development and HR decide, not you, and they
                    can send it back.
                  </div>
                  <Lbl t="Who should write it instead" />
                  <select value={recTo} onChange={(e) => setRecTo(e.target.value)} style={S.in}>
                    <option value="">— Choose a leader —</option>
                    {leaders.filter((m) => String(m.id) !== String(acting && acting.id))
                      .map((m) => <option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}
                  </select>
                  <Lbl t="Why are they a better choice? (required)" />
                  <textarea value={recWhy} onChange={(e) => setRecWhy(e.target.value)}
                    placeholder="What do they know that you don't?" style={{ ...S.in, height: 64 }} />
                  <div style={{ fontSize: 11.5, color: "#6B7280", marginBottom: 10 }}>
                    Only Leadership Development and HR read this. If it is approved, they are
                    told you recommended them and nothing more.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      style={{ ...S.prim, opacity: (recTo && recWhy.trim()) ? 1 : 0.5 }}
                      disabled={!recTo || !recWhy.trim()}
                      onClick={() => {
                        const who = leaders.find((m) => String(m.id) === String(recTo));
                        if (!who) return;
                        onRecommend(t.id, who.id, who.name, recWhy);
                        setRecOpen(false); setRecTo(""); setRecWhy(""); setOpenId(null);
                      }}>
                      Send the recommendation
                    </button>
                    <button style={S.sec} onClick={() => { setRecOpen(false); setRecTo(""); setRecWhy(""); }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={S.body}>
      <button style={S.sec} onClick={onBack}>← Back</button>
      <div style={S.sLbl}>Evaluations to complete ({tasks.length})</div>
      {!tasks.length && <div style={S.empty}>Nothing assigned to you right now.</div>}
      {tasks.map((task) => (
        <div key={task.id} style={S.card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: "#111827" }}>{task.subjectName}</div>
              <div style={{ fontSize: 12, color: task.status === "returned" ? "#92400E" : "#6B7280" }}>
                {task.templateName}{task.dueDate ? " · due " + task.dueDate : ""}{task.status === "returned" ? " · sent back" : ""}
              </div>
            </div>
            <button style={S.sec} onClick={() => start(task)}>{task.draft ? "Continue" : "Start"}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Approval queue (LDD+). The only door from a draft into a file. ── */
function EvalApprovals({ tasks, templates, onApprove, onReturn, onDelete, onBack }) {
  const tpls = tplsOf(templates);
  const [openId, setOpenId] = useState(null);
  const [note, setNote] = useState("");
  return (
    <div style={S.body}>
      <button style={S.sec} onClick={onBack}>← Back</button>
      <div style={S.sLbl}>Evaluations awaiting approval ({tasks.length})</div>
      {!tasks.length && <div style={S.empty}>Nothing waiting on you.</div>}
      {tasks.map((t) => {
        const tpl = tpls.find((x) => x.id === t.templateId) || tpls[0];
        const d = t.draft || {};
        return (
          <div key={t.id} style={S.card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: "#111827" }}>{t.subjectName}</div>
                <div style={{ fontSize: 12, color: "#6B7280" }}>
                  {t.templateName} · by {t.assigneeName}{t.submittedAt ? " · " + String(t.submittedAt).slice(0, 10) : ""}
                </div>
              </div>
              <button style={S.sec} onClick={() => { setOpenId(openId === t.id ? null : t.id); setNote(""); }}>
                {openId === t.id ? "Close" : "Review"}
              </button>
            </div>
            {openId === t.id && (
              <div style={{ marginTop: 10 }}>
                <OverallReadout value={d.overall || 0} count={scoredCount(tpl, d.ratings)} total={scoredCats(tpl).length} max={tplMax(tpl)} />
                {(tpl.categories || []).map((c) => {
                  const v = (d.ratings || {})[c.id];
                  return (
                    <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
                      <span style={{ color: "#374151" }}>{c.name}{sectionScores(tpl, c.sectionId) ? "" : " (not scored)"}</span>
                      <span style={{ fontWeight: 700, color: "#111827" }}>{isNA(v) ? "N/A" : (v || "—")}</span>
                    </div>
                  );
                })}
                {d.comments && <div style={{ fontSize: 13, color: "#111827", whiteSpace: "pre-wrap", marginTop: 8 }}>{d.comments}</div>}
                {(d.privateConvo || d.privateNotes) && (
                  <div style={{ border: "1px solid #FDE68A", background: "#FFFBEB", borderRadius: 10, padding: 11, marginTop: 10 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "#92400E", marginBottom: 6 }}>🔒 Private — not filed</div>
                    {d.privateConvo && (
                      <div style={{ fontSize: 13, color: "#111827", marginBottom: 6 }}>
                        In-person conversation needed? <b>{d.privateConvo === "y" ? "Yes" : "No"}</b>
                      </div>
                    )}
                    {d.privateNotes && <div style={{ fontSize: 13, color: "#111827", whiteSpace: "pre-wrap" }}>{d.privateNotes}</div>}
                  </div>
                )}
                <Lbl t="If sending back, say why" />
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note to the evaluator" style={S.in} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button style={S.prim} onClick={() => { onApprove(t); setOpenId(null); }}>Approve & add to file</button>
                  <button style={S.sec} onClick={() => { onReturn(t.id, note); setOpenId(null); }}>Send back</button>
                  <button style={{ ...S.sec, color: "#DD0031" }} onClick={() => { if (window.confirm("Discard this assigned evaluation entirely?")) { onDelete(t.id); setOpenId(null); } }}>Discard</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ApplicationsSection({ e }) {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => { let live = true; (async () => {
    try {
      const idx = (await kvGet(PG_INDEX_KEY)) || [];
      const slug = pgSlug(e.name);
      if (live) setRows(idx.filter((x) => x.slug === slug));
    } catch { if (live) setRows([]); }
  })(); return () => { live = false; }; }, [e.name]);

  const load = async (r) => {
    const k = `${r.role}:${r.slug}`;
    if (open === k) { setOpen(null); setDetail(null); return; }
    setOpen(k); setDetail(null);
    try { setDetail(await kvGet(pgAppKey(r.role, r.slug))); } catch { setDetail(null); }
  };

  if (rows === null) return <div style={S.empty}>Loading applications…</div>;
  if (!rows.length) return <div style={S.empty}>No role applications on file.</div>;

  return (
    <>
      <div style={S.sLbl}>Applications ({rows.length})</div>
      {rows.map((r) => {
        const k = `${r.role}:${r.slug}`;
        return (
          <div key={k} style={S.card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: "#111827" }}>{PG_ROLE_LABEL[r.role] || r.role}</div>
                <div style={{ fontSize: 12, color: "#6B7280" }}>
                  {r.status === "submitted" ? "Submitted" : "In progress"}
                  {r.updatedAt ? " · updated " + String(r.updatedAt).slice(0, 10) : ""}
                </div>
              </div>
              <button style={S.sec} onClick={() => load(r)}>{open === k ? "Hide" : "View"}</button>
            </div>
            {open === k && (
              detail ? (
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {Object.entries(detail.steps || {}).length === 0 && (
                    <div style={{ fontSize: 12.5, color: "#6B7280" }}>No steps completed yet.</div>
                  )}
                  {Object.entries(detail.steps || {}).map(([sid, sd]) => (
                    <div key={sid} style={{ borderLeft: "3px solid #E5E7EB", borderTop: "3px solid #E5E7EB", paddingLeft: 10 }}>
                      {sd.text && <div style={{ fontSize: 13, color: "#111827", whiteSpace: "pre-wrap" }}>{sd.text}</div>}
                      {sd.choices && <div style={{ fontSize: 13, color: "#111827" }}>{sd.choices.join(" · ")}</div>}
                      {(sd.files || []).map((f) => (
                        <div key={f.path} style={{ fontSize: 12.5, color: "#6B7280" }}>📄 {f.fileName}</div>
                      ))}
                      {/* status only — never the letter itself */}
                      {(sd.recs || []).map((rc, i) => (
                        <div key={i} style={{ fontSize: 12.5, color: "#6B7280" }}>
                          {rc.status === "completed" ? "Completed" : "In progress"} by {rc.leaderName}
                        </div>
                      ))}
                      {sd.done && !sd.text && !sd.files && !sd.choices && (
                        <div style={{ fontSize: 12.5, color: "#0F766E" }}>✓ Complete</div>
                      )}
                    </div>
                  ))}
                  <div style={{ fontSize: 11.5, color: "#9CA3AF" }}>
                    View only. Applications are completed in Professional Growth.
                  </div>
                </div>
              ) : <div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 8 }}>Loading…</div>
            )}
          </div>
        );
      })}
    </>
  );
}

function EvalSection({ e, evals, leader, acting, onAdd, onEdit, onRemove, templates }) {
  // Templates come from the shared store (gcfcr-hr-evaltpl-v1) and are edited in
  // this console now. FALLBACK_TEMPLATE only stands in for a genuinely empty
  // store — it used to shadow every real template, because this console read a
  // key Team Documentation was writing to a different backend.
  const tpls = tplsOf(templates);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);   // existing evaluation being edited
  const [confirmDel, setConfirmDel] = useState(null);
  const [period, setPeriod] = useState(""); const [date, setDate] = useState(today());
  const [templateId, setTemplateId] = useState(tpls[0].id);
  const [rat, setRat] = useState({}); const [comments, setComments] = useState("");
  // Bri asked for a named Evaluator she can type into — it pre-fills with
  // whoever is signed in, but an AD completing one on paper for someone else
  // needs to be able to change it.
  const [evaluator, setEvaluator] = useState(actingSig(acting, ""));
  const tpl = tpls.find((t) => t.id === templateId) || tpls[0];
  // Overall is computed from the category scores, never entered by hand.
  const overall = overallOf(tpl, rat);
  const reset = () => { setPeriod(""); setDate(today()); setTemplateId(tpls[0].id); setRat({}); setComments(""); setEvaluator(actingSig(acting, "")); setOpen(false); };
  const save = () => { onAdd({ id: "ev-" + Date.now(), date, period: period || "Review", templateId: tpl.id, templateName: tpl.name, overall, ratings: rat, comments, evaluator: (evaluator || "").trim() || actingSig(acting, "") }); reset(); };

  // ── Edit an existing evaluation ──
  if (editing) {
    const evTpl = tpls.find((t) => t.id === editing.templateId) || tpls[0];
    const editOverall = overallOf(evTpl, editing.ratings);
    const saveEdit = () => { onEdit({ ...editing, overall: editOverall }); setEditing(null); };
    return (
      <div style={S.card}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#111827", marginBottom: 8 }}>Edit Evaluation</div>
        <div style={S.grid2}>
          <div><Lbl t="Period" /><input value={editing.period} onChange={(ev) => setEditing({ ...editing, period: ev.target.value })} style={S.in} /></div>
          <div><Lbl t="Date" /><input type="date" value={editing.date} onChange={(ev) => setEditing({ ...editing, date: ev.target.value })} style={S.in} /></div>
        </div>
        <OverallReadout value={editOverall} count={scoredCount(evTpl, editing.ratings)} total={scoredCats(evTpl).length} max={tplMax(evTpl)} />
        <CategoryFields tpl={evTpl} ratings={editing.ratings}
          onRate={(cid, v) => setEditing({ ...editing, ratings: { ...editing.ratings, [cid]: v } })} />
        <Lbl t="Comments" /><textarea value={editing.comments || ""} onChange={(ev) => setEditing({ ...editing, comments: ev.target.value })} style={{ ...S.in, height: 74 }} />
        <Lbl t="Evaluator" /><input value={editing.evaluator || ""} onChange={(ev) => setEditing({ ...editing, evaluator: ev.target.value })} placeholder="Who completed this evaluation" style={S.in} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button style={S.sec} onClick={() => setEditing(null)}>Cancel</button>
          <button style={S.prim} onClick={saveEdit}>Save Changes</button>
        </div>
      </div>
    );
  }

  return (
    <>
      {leader && !open && <button style={S.full} onClick={() => setOpen(true)}>+ New Evaluation</button>}
      {leader && open && (
        <div style={S.card}>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#111827", marginBottom: 8 }}>Performance Evaluation</div>
          <div style={S.grid2}>
            <div><Lbl t="Period" /><input value={period} onChange={(ev) => setPeriod(ev.target.value)} placeholder="e.g. Q2 2026" style={S.in} /></div>
            <div><Lbl t="Date" /><input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} style={S.in} /></div>
          </div>
          {tpls.length > 1 && (
            <div><Lbl t="Template" /><select value={templateId} onChange={(ev) => { setTemplateId(ev.target.value); setRat({}); }} style={S.in}>{tpls.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          )}
          <OverallReadout value={overall} count={scoredCount(tpl, rat)} total={scoredCats(tpl).length} max={tplMax(tpl)} />
          {/* Each category renders its OWN scale. This used to be a hardcoded
              [1..5] for every category in the app, which meant a 1–10 category
              literally could not be scored above 5 — the buttons didn't exist. */}
          <CategoryFields tpl={tpl} ratings={rat} onRate={(cid, v) => setRat((p) => ({ ...p, [cid]: v }))} />
          <Lbl t="Comments" /><textarea value={comments} onChange={(ev) => setComments(ev.target.value)} placeholder="Strengths, growth areas, goals" style={{ ...S.in, height: 74 }} />
          <Lbl t="Evaluator" /><input value={evaluator} onChange={(ev) => setEvaluator(ev.target.value)} placeholder="Who completed this evaluation" style={S.in} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><button style={S.sec} onClick={reset}>Cancel</button><button style={S.prim} onClick={save}>Save</button></div>
        </div>
      )}
      <div style={S.sLbl}>Evaluations ({evals.length})</div>
      {/* 🐛 "No evaluations on file yet." WAS TRUE AND STILL SENT SOMEONE ASKING.
          Thania Garcia, Jul 29 2026, messaged about it: she opened her own
          profile, tapped Evaluations, and got that line. She had genuinely never
          been evaluated — Bri confirmed she is not due one until January — so
          the sentence was correct. It just could not be told apart from "your
          evaluation is missing", and that ambiguity is what cost a real
          conversation, a database check, and her worrying about her own record.
          ⚠️ The fix is not a nicer tone, it is naming the CAUSE. "Nothing here"
          is the same shape as every other failure this Hub has had today:
          missing looks like fine, and empty looks like lost. Saying which one it
          is costs a sentence. */}
      {evals.length === 0 && (
        <div style={S.empty}>
          {String(acting && acting.id) === String(e && e.id)
            ? "You have not had an evaluation recorded yet. Nothing is missing — evaluations appear here once HR files one after your review."
            : `No evaluations on file for ${String(e && e.name || "").split(" ")[0] || "this person"} yet. Nothing is missing; none have been filed.`}
        </div>
      )}
      {evals.map((ev) => {
        const evTpl = tpls.find((t) => t.id === ev.templateId) || tpl;
        const mx = tplMax(evTpl);
        return (
          <div key={ev.id} style={S.fCard}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, color: "#111827" }}>{ev.period}</div>
              <div style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "#0F766E", color: "#fff" }}>
                Overall {ev.overall}{mx ? "/" + mx : ""}
              </div>
              {ev.source === "teamdocs" && (
                <div style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 8, background: "#EEF2FF", color: "#4338CA" }} title="Copied here from Team Documentation">
                  from Team Docs
                </div>
              )}
              <div style={{ marginLeft: "auto", fontSize: 13, color: "#9CA3AF" }}>{ev.date}</div>
            </div>
            {ev.templateName && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>{ev.templateName}</div>}
            {/* Each chip prints its own category's scale — a 1–10 score no
                longer renders as "8/5". catOf falls back to the raw id at /5 if
                the category was deleted from the template after the fact. */}
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {Object.keys(ev.ratings || {}).map((k) => {
                const c = catOf(evTpl, k);
                return <span key={k} style={S.dim}>{c.name}: {ev.ratings[k]}/{Number(c.max) || 5}</span>;
              })}
            </div>
            {ev.comments && <div style={{ fontSize: 13, color: "#374151", marginTop: 8, whiteSpace: "pre-wrap" }}>{ev.comments}</div>}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <div style={{ fontSize: 12, color: "#9CA3AF", fontStyle: "italic" }}>Evaluated by {ev.evaluator}</div>
              {leader && (
                confirmDel === ev.id ? (
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#DD0031", fontWeight: 600 }}>Delete?</span>
                    <button style={S.rm} onClick={() => { onRemove(ev.id); setConfirmDel(null); }}>Yes, delete</button>
                    <button style={{ ...S.rm, color: "#6B7280" }} onClick={() => setConfirmDel(null)}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 14 }}>
                    <button style={S.rm} onClick={() => setEditing({ ...ev, ratings: { ...ev.ratings } })}>Edit</button>
                    <button style={S.rm} onClick={() => setConfirmDel(ev.id)}>Delete</button>
                  </div>
                )
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

// Read-only overall score — the average of whatever categories have been rated.
// `max` is the template's shared scale, or null when the template mixes scales;
// in that case we print a bare number, because there is no denominator that's
// true for every input that went into the mean.
function OverallReadout({ value, count, total, max }) {
  return (
    <div style={{ background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 8, padding: "10px 12px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>Overall</div>
        <div style={{ fontSize: 11, color: "#9CA3AF" }}>
          Averaged from {count} of {total} categories scored{max ? "" : " · mixed scales, shown unscaled"}
        </div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: value > 0 ? "#0F766E" : "#CBD5E1" }}>{value > 0 ? value + (max ? "/" + max : "") : "—"}</div>
    </div>
  );
}

function InjurySection({ e, injuries, leader, selfView, acting, onAdd }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ date: today(), time: "", area: "", bodyPart: "", description: "", witness: "", medical: "None" });
  const can = leader || selfView; const upd = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const reset = () => { setF({ date: today(), time: "", area: "", bodyPart: "", description: "", witness: "", medical: "None" }); setOpen(false); };
  const save = () => { onAdd({ id: "inj-" + Date.now(), ...f, reportedBy: selfView ? e.name + " (self-reported)" : actingSig(acting, "") }); reset(); };
  return (
    <>
      {can && !open && <button style={S.full} onClick={() => setOpen(true)}>+ Report Workplace Injury</button>}
      {can && open && (
        <div style={S.card}>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#111827", marginBottom: 8 }}>Workplace Injury Report</div>
          <div style={S.grid2}>
            <div><Lbl t="Date" /><input type="date" value={f.date} onChange={(e2) => upd("date", e2.target.value)} style={S.in} /></div>
            <div><Lbl t="Time" /><input type="time" value={f.time} onChange={(e2) => upd("time", e2.target.value)} style={S.in} /></div>
            <div><Lbl t="Area / Location" /><input value={f.area} onChange={(e2) => upd("area", e2.target.value)} placeholder="e.g. Fry station" style={S.in} /></div>
            <div><Lbl t="Body Part" /><input value={f.bodyPart} onChange={(e2) => upd("bodyPart", e2.target.value)} placeholder="e.g. Left hand" style={S.in} /></div>
          </div>
          <Lbl t="What happened" /><textarea value={f.description} onChange={(e2) => upd("description", e2.target.value)} placeholder="How the injury occurred" style={{ ...S.in, height: 66 }} />
          <div style={S.grid2}>
            <div><Lbl t="Witness" /><input value={f.witness} onChange={(e2) => upd("witness", e2.target.value)} placeholder="Optional" style={S.in} /></div>
            <div><Lbl t="Medical Attention" /><select value={f.medical} onChange={(e2) => upd("medical", e2.target.value)} style={S.in}>{MEDICAL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><button style={S.sec} onClick={reset}>Cancel</button><button style={S.prim} onClick={save}>Submit</button></div>
        </div>
      )}
      <div style={S.sLbl}>Injury Reports ({injuries.length})</div>
      {injuries.length === 0 && <div style={S.empty}>No injury reports on file.</div>}
      {injuries.map((x) => (
        <div key={x.id} style={S.fCard}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontWeight: 700, color: "#111827" }}>{x.bodyPart || "Injury"}</div>
            <div style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: x.medical === "None" ? "#9CA3AF" : "#DD0031", color: "#fff" }}>{x.medical}</div>
            <div style={{ marginLeft: "auto", fontSize: 13, color: "#9CA3AF" }}>{x.date}{x.time ? " · " + x.time : ""}</div>
          </div>
          {x.area && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>Location: {x.area}</div>}
          {x.description && <div style={{ fontSize: 13, color: "#374151", marginTop: 6, whiteSpace: "pre-wrap" }}>{x.description}</div>}
          {x.witness && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>Witness: {x.witness}</div>}
          <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 8, fontStyle: "italic" }}>Reported by {x.reportedBy}</div>
        </div>
      ))}
    </>
  );
}

function SignSection({ title, sub, statement, ack, stale, canSign, selfView, e, acting, onSign, signLabel }) {
  // Signatures are personal: only the person themselves can sign — either from
  // their own PIN-opened file, or from a leadership session on their own profile.
  const [sig, setSig] = useState(selfView ? e.name : "");
  return (
    <>
      <div style={S.card}>
        <div style={{ fontWeight: 700, color: "#111827" }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: "#6B7280" }}>{sub}</div>}
        <div style={{ marginTop: 10 }}>
          {ack ? <span style={{ fontSize: 13, fontWeight: 600, color: "#047857" }}>✓ Signed on {ack.date} — {ack.signature}</span>
            : <span style={{ fontSize: 13, fontWeight: 600, color: "#DD0031" }}>⚠ {stale ? "Needs signature (last signed v" + stale.version + " on " + stale.date + ")" : "Not yet signed"}</span>}
        </div>
      </div>
      <div style={S.statement}>{statement}</div>
      {!canSign && !ack && (
        <div style={S.note}>Only {e.name} can sign this — they open their own file with their PIN. Signatures can't be recorded on someone's behalf.</div>
      )}
      {canSign && !ack && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={sig} onChange={(ev) => setSig(ev.target.value)} placeholder="Type full name to sign" style={S.in} />
          <button style={S.prim} onClick={() => sig.trim() && onSign(sig.trim())}>{signLabel}</button>
        </div>
      )}
      {canSign && ack && signLabel === "Re-sign" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={sig} onChange={(ev) => setSig(ev.target.value)} placeholder="Type full name to sign" style={S.in} />
          <button style={S.prim} onClick={() => sig.trim() && onSign(sig.trim())}>Re-sign</button>
        </div>
      )}
    </>
  );
}

/* ⚠️ THIS WAS THE REAL SCALE BUG — not a display problem.
   It rendered [1, 2, 3, 4, 5] literally. Team Documentation lets a template
   category use a 1–3, 1–4, 1–5 or 1–10 scale, so any category above 5 simply
   could not be scored in this console: the buttons for 6–10 did not exist.
   `max` now comes from the category. Wraps, so a 1–10 row fits on a phone. */
function Rating({ value, max = 5, onChange, labels, allowNA }) {
  const n = Math.max(1, Number(max) || 5);
  const lab = labels || {};
  const na = isNA(value);
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "stretch" }}>
      {allowNA && (
        // N/A is a real answer, not a blank. It sits FIRST so it reads as an
        // option rather than an escape hatch, and it is excluded from the average.
        <button onClick={() => onChange(na ? 0 : "na")}
          style={{ ...S.rate, ...(na ? S.rateA : {}), flex: "0 0 auto", minWidth: 46, fontWeight: 700 }}>N/A</button>
      )}
      {Array.from({ length: n }, (_, i) => i + 1).map((v) => (
        <button key={v} onClick={() => onChange(v)} title={lab[v] || ""}
          style={{ ...S.rate, ...(!na && Number(value) >= v ? S.rateA : {}),
            ...(n > 5 || lab[v] ? { flex: "0 0 auto", minWidth: 40 } : {}),
            ...(lab[v] ? { height: "auto", padding: "6px 9px", lineHeight: 1.2 } : {}) }}>
          {lab[v] ? <span style={{ display: "block" }}><span style={{ display: "block", fontWeight: 800 }}>{v}</span><span style={{ display: "block", fontSize: 10 }}>{lab[v]}</span></span> : v}
        </button>
      ))}
    </div>
  );
}
function RoleEditor({ id, role, options, onSetRole }) {
  const opts = options && options.length ? options : TITLE_OPTIONS;
  const [val, setVal] = useState(role);
  const [open, setOpen] = useState(false);
  // A role outside this editor's allowed list (e.g. Bri looking at a Director)
  // can't be changed here — show nothing rather than a menu that would demote.
  if (!opts.includes(role)) return null;
  if (!open) return <button style={{ ...S.sec, fontSize: 11, padding: "4px 9px", marginTop: 6 }} onClick={() => { setVal(role); setOpen(true); }}>Edit title</button>;
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
      <select value={val} onChange={(e) => setVal(e.target.value)} style={{ ...S.in, marginBottom: 0, width: "auto" }}>
        {opts.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <button style={{ ...S.prim, fontSize: 11, padding: "7px 11px" }} onClick={() => { onSetRole(id, val); setOpen(false); }}>Save</button>
      <button style={{ ...S.sec, fontSize: 11, padding: "7px 10px" }} onClick={() => setOpen(false)}>×</button>
    </div>
  );
}

// PIN uniqueness: personal PINs sign you into the whole Hub, so the PIN alone
// must identify exactly one person. taken() checks every stored PIN.
/* `pinTaken` is DELETED. It compared PIN VALUES across the whole map, which is
   impossible once entries are hashed — and it was only possible before because
   this file was downloading all 106 of them. Uniqueness now lives in
   /api/pin-set, which refuses with "taken" and never hands anything back. */

/* ⚠️ `pin` is GONE from this component. It used to receive the person's real
   current PIN in order to (a) compare it against what they typed and (b) decide
   whether they were still on the default. Both are now server-side:
     · the current-PIN check is a real verify — correctly counted against the
       rate limit, because it IS an attempt;
     · "still on the default" becomes "has no personal PIN set at all", which
       `pinIsSet` already answers without revealing anything. */
function SelfPinChange({ pinIsSet, selfId, onSetPin }) {
  const isDefault = !pinIsSet;
  const [open, setOpen] = useState(isDefault);
  const [done, setDone] = useState(false);
  const [cur, setCur] = useState(""); const [n1, setN1] = useState(""); const [n2, setN2] = useState(""); const [err, setErr] = useState("");
  const clean = (v) => v.replace(/\D/g, "").slice(0, 6);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (n1.length < 4) return setErr("New PIN must be 4–6 digits.");
    if (n1 !== n2) return setErr("New PINs don't match.");
    if (n1 === "1234") return setErr("1234 is the default — pick something only you know.");
    setBusy(true);
    try {
      /* Prove they know the current one before changing it. Anyone already has
         to be signed in to reach this, so this is the second factor, not the
         first — but without it a borrowed unlocked phone changes the PIN. */
      if (!isDefault) {
        const who = await verifyPin(cur);
        if (!who || String(who) !== String(selfId)) return setErr("Current PIN is incorrect.");
      }
      const err = await onSetPin(n1);        // resolves null, or a message
      if (err) return setErr(err);
      setDone(true); setOpen(false); setCur(""); setN1(""); setN2(""); setErr("");
    } finally { setBusy(false); }
  };
  if (done && !open) return <div style={{ ...S.self, background: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }}>✓ Your PIN has been updated. Use it to sign into any Hub tool.</div>;
  if (!open) return <button style={{ ...S.sec, marginBottom: 12 }} onClick={() => { setOpen(true); setDone(false); }}>Change my PIN</button>;
  return (
    <div style={{ ...S.card, border: isDefault ? "1px solid #FECACA" : "1px solid #E4E3DD", background: isDefault ? "#FEF2F2" : "#fff" }}>
      <div style={{ fontWeight: 700, color: "#111827", marginBottom: 4 }}>{isDefault ? "Set your personal PIN" : "Change my PIN"}</div>
      {isDefault && <div style={{ fontSize: 12, color: "#DD0031", marginBottom: 8 }}>You don't have a personal PIN yet — you're still on the default (1234). Set one only you know: anyone could open your file until you do. This PIN also signs you into every Hub tool, so it must be unique to you.</div>}
      {!isDefault && (<><Lbl t="Current PIN" /><input type="password" inputMode="numeric" value={cur} onChange={(e) => { setCur(clean(e.target.value)); setErr(""); }} style={S.in} /></>)}
      <Lbl t="New PIN (4–6 digits)" /><input type="password" inputMode="numeric" value={n1} onChange={(e) => { setN1(clean(e.target.value)); setErr(""); }} style={S.in} />
      <Lbl t="Confirm new PIN" /><input type="password" inputMode="numeric" value={n2} onChange={(e) => { setN2(clean(e.target.value)); setErr(""); }} style={S.in} />
      {err && <div style={S.err}>{err}</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
        {!isDefault && <button style={S.sec} onClick={() => { setOpen(false); setErr(""); }}>Cancel</button>}
        <button style={S.prim} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save PIN"}</button>
      </div>
    </div>
  );
}

// SET a PIN. Never REVEAL one.
// ⚠️ SECURITY FIX (Hannah, July 16: "Anyone of the directors can see each others
// pins I think. I just saw Nick's"). This used to open with setV(pin) — the
// person's REAL current PIN — in a plaintext <input>. Tapping "Set PIN" on any
// profile displayed that person's live PIN to whoever was looking. Personal PINs
// sign you into the WHOLE HUB, so that wasn't "a director saw a number", it was
// "a director can act as Nick in every tool".
// Now: opens BLANK, always. The field is masked with a deliberate show/hide, so
// a leader can check what they just typed before telling the team member — but
// there is nothing to show until they type it, because the current value is
// never loaded into this component at all.
function PinSetter({ pins, selfId, onSetPin }) {
  /* `pins` here is now the id → true SET, not the map. `isSet` was always the
     only thing this component read from it. */
  const [open, setOpen] = useState(false);
  /* ⚠️ MUST STAY ABOVE THE `if (!open)` EARLY RETURN BELOW. Declared after it,
     the hook count changes between the closed and open renders and React
     unmounts the whole tree — a WHITE SCREEN on tapping Reset PIN. This is the
     documented bug class that passes every static check. */
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const isSet = !!(pins || {})[selfId];
  if (!open) {
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button style={S.sec} onClick={() => { setV(""); setErr(""); setShow(false); setOpen(true); }}>
          {isSet ? "Reset PIN" : "Set PIN"}
        </button>
        {/* Status only — whether a PIN exists, never what it is. */}
        <span style={{ fontSize: 11, fontWeight: 700, color: isSet ? "#047857" : "#B45309" }}>
          {isSet ? "PIN set" : "No PIN yet"}
        </span>
      </span>
    );
  }
  const save = async () => {
    if (v.length < 4) return setErr("4–6 digits.");
    setBusy(true);
    try {
      // Uniqueness is the worker's answer now — it refuses with "taken".
      const err = await onSetPin(v);
      if (err) return setErr(err);
      setOpen(false); setV(""); setShow(false); setErr("");
    } finally { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input value={v} type={show ? "text" : "password"} placeholder="New PIN"
        onChange={(e) => { setV(e.target.value.replace(/\D/g, "").slice(0, 6)); setErr(""); }}
        inputMode="numeric" style={{ ...S.in, width: 100, marginBottom: 0 }} />
      <button style={{ ...S.sec, padding: "10px 10px" }} onClick={() => setShow((s) => !s)}>{show ? "Hide" : "Show"}</button>
      <button style={S.prim} onClick={save} disabled={busy}>{busy ? "…" : "Save"}</button>
      <button style={S.sec} onClick={() => { setOpen(false); setV(""); setShow(false); setErr(""); }}>Cancel</button>
      {err && <span style={{ ...S.err, marginTop: 0 }}>{err}</span>}
      <span style={{ fontSize: 11, color: "#9CA3AF", width: "100%" }}>
        Sets a new PIN for {isSet ? "them — their current one is not shown to anyone, including you" : "them"}. Use 1234 to hand it back so they set their own.
      </span>
    </div>
  );
}
function SignIn({ team, onClose, onOk }) {
  // Team Leader and up can sign in — a Team Leader gets DOCUMENT rights only
  // (write an entry on someone below them, never read a file). LDD and up get
  // the full console. Was FULL_MIN, which left the sign-in list at five people.
  const leaders = team.filter((t) => (RANK[t.role] || 0) >= DOC_MIN).sort((a, b) => a.name.localeCompare(b.name));
  const [id, setId] = useState(leaders[0] ? leaders[0].id : ""); const [pin, setPin] = useState(""); const [err, setErr] = useState("");
  return (
    <Overlay onClose={onClose}>
      <div style={S.mTitle}>Leadership Sign-In</div>
      <div style={S.mSub}>Team Leaders and Assistant Directors sign in to <b>document</b> anyone below their tier — you write the entry, HR sets any points, and you don't see the file. Leadership Development Director and up get full access: every profile, the history, and the terminated roster.</div>
      <select value={id} onChange={(e) => { setId(e.target.value); setErr(""); }} style={S.in}>{leaders.map((l) => <option key={l.id} value={l.id}>{l.name} — {l.role}</option>)}</select>
      <input type="password" inputMode="numeric" value={pin} onChange={(e) => { setPin(e.target.value); setErr(""); }} placeholder="PIN" style={{ ...S.pinIn, marginTop: 10 }} />
      {err && <div style={S.err}>{err}</div>}
      <div style={S.hint}>Default PIN: {PIN}</div>
      {/* ★ The selected person and the PIN must agree. Verifying the PIN alone
           and trusting the dropdown would let anyone with ANY valid PIN sign in
           as any leader in the list. */}
      <div style={S.mAct}><button style={S.sec} onClick={onClose}>Cancel</button><button style={S.prim} onClick={() => {
        setErr("");
        verifyPinRaw(pin, id).then((r) => {
          if (r && r.ok && String(r.id) === String(id)) {
            // Name picked and PIN agree — only now does the device's session
            // become theirs. See verifyPinRaw for why not any sooner.
            if (r.token) { try { localStorage.setItem("gcfcr-hub-token", r.token); } catch {} }
            onOk(leaders.find((l) => l.id === id));
          } else setErr(pinErrText(r, id));
        });
      }}>Sign In</button></div>
    </Overlay>
  );
}
// Roster-wide signature status — see who has and hasn't signed either
// handbook without opening each team member's file one at a time.
function SentDocsView({ sends, team, statusOf, onDelete, onUndoAck, onBack }) {
  const [openId, setOpenId] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const list = Array.isArray(sends) ? sends : [];
  const roster = Array.isArray(team) ? team : [];
  const nameOf = (id) => { const m = roster.find((x) => x.id === id); return m ? m.name : "(removed)"; };
  return (
    <div style={S.body}>
      <div style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 11, letterSpacing: 1.2, color: "#B4832B", fontWeight: 600, marginBottom: 4 }}>SENT DOCUMENTS</div>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12, lineHeight: 1.45 }}>Documents sent from the SOP Library — {list.length} total. Acknowledgment counts update as people sign in their own file.</div>
      {list.length === 0 && <div style={S.empty}>Nothing sent yet.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map((s) => {
          const targets = s.targetIds || [];
          const acks = s.acks || {};
          const done = targets.filter((id) => acks[id]).length;
          const open = openId === s.id;
          const complete = s.signRequired && targets.length > 0 && done === targets.length;
          return (
            <div key={s.id} style={{ border: "1px solid #E4E3DD", borderRadius: 10, background: "#fff" }}>
              <button onClick={() => setOpenId(open ? null : s.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "11px 13px", background: "none", border: "none", cursor: "pointer" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{s.docTitle || "Untitled document"}</div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{s.audienceLabel || (targets.length + " people")} · {fmtDate(s.createdAt)} · {s.signRequired ? "acknowledgment required" : "reference only"}</div>
                </div>
                {s.signRequired ? (
                  <span style={{ fontSize: 12, fontWeight: 800, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap", background: complete ? "#ECFDF5" : "#FFF7ED", color: complete ? "#065F46" : "#B45309" }}>{done}/{targets.length}{complete ? " ✓" : ""}</span>
                ) : (
                  <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700 }}>sent to {targets.length}</span>
                )}
                <span style={{ color: "#bbb", fontSize: 16 }}>{open ? "▾" : "›"}</span>
              </button>
              {open && (
                <div style={{ padding: "0 13px 12px" }}>
                  {s.driveUrl && <a href={s.driveUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginBottom: 8, fontSize: 12, fontWeight: 700, color: "#1D5FA8", textDecoration: "none" }}>📎 Open document</a>}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                    {targets.map((id) => {
                      const a = acks[id];
                      return (
                        <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                          <span style={{ width: 16, color: a ? "#0F766E" : "#D1D5DB" }}>{a ? "✓" : "○"}</span>
                          <span style={{ flex: 1, color: statusOf(id) === "terminated" ? "#9CA3AF" : "#111827" }}>{nameOf(id)}</span>
                          {a ? (
                            <>
                              <span style={{ fontSize: 11, color: "#6B7280" }}>{fmtDate(a.at)}</span>
                              <button style={{ ...S.sec, padding: "2px 8px", fontSize: 11 }} onClick={() => onUndoAck(s.id, id)}>Undo</button>
                            </>
                          ) : (
                            <span style={{ fontSize: 11, color: "#B45309", fontWeight: 600 }}>{s.signRequired ? "pending" : "—"}</span>
                          )}
                        </div>
                      );
                    })}
                    {targets.length === 0 && <div style={{ fontSize: 12, color: "#9CA3AF" }}>No recipients on this send.</div>}
                  </div>
                  {confirmDel === s.id ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: "#DD0031", fontWeight: 700 }}>Delete this send and its acknowledgments?</span>
                      <button style={{ ...S.prim, background: "#DD0031" }} onClick={() => { setConfirmDel(null); onDelete(s.id); }}>Yes, delete</button>
                      <button style={S.sec} onClick={() => setConfirmDel(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button style={{ ...S.sec, color: "#DD0031", borderColor: "#FECACA" }} onClick={() => setConfirmDel(s.id)}>Delete send</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button style={{ ...S.hbBtn, background: "#fff", color: "#223C6A", border: "1px solid #D1D5DB", width: "100%", marginTop: 14 }} onClick={onBack}>← Back to directory</button>
    </div>
  );
}
function SignatureStatus({ team, statusOf, handbook, ldrHandbook, pins, onBack, onOpen, avatarFor = () => "" }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all"); // all | unsigned
  const qq = q.trim().toLowerCase();
  const hbSigned = (id) => handbook.acks[id] && handbook.acks[id].version === handbook.version.n;
  const ldrSigned = (id) => ldrHandbook.acks[id] && ldrHandbook.acks[id].version === ldrHandbook.version.n;
  // No personal PIN yet = they CANNOT sign — their own file won't open, by
  // design (leaders set PINs during onboarding). Without this pill, "waiting on
  // us" and "ignoring us" render as the identical red Not-signed badge, so an
  // Outstanding list can't tell you which half is yours to fix.
  const noPin = (id) => !(pins || {})[id];
  const noPinCount = team.filter((m) => statusOf(m.id) !== "terminated" && !isHbExempt(m.id) && noPin(m.id)).length;
  const outstanding = (m) => !isHbExempt(m.id) && (!hbSigned(m.id) || (isLeaderTier(m.role) && !ldrSigned(m.id)));
  const current = team
    .filter((m) => statusOf(m.id) !== "terminated" && (!qq || m.name.toLowerCase().includes(qq) || m.role.toLowerCase().includes(qq)))
    .filter((m) => (filter === "unsigned" ? outstanding(m) : true))
    .sort((a, b) => a.name.localeCompare(b.name));
  const unsignedCount = team.filter((m) => statusOf(m.id) !== "terminated" && outstanding(m)).length;
  const Pill = ({ ok, text }) => (
    <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap", background: ok ? "#ECFDF5" : "#FEF2F2", color: ok ? "#047857" : "#DD0031" }}>
      {ok ? "✓ Signed" : "Not signed"}{text ? " · " + text : ""}
    </span>
  );
  return (
    <div style={S.body}>
      <div style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 11, letterSpacing: 1.2, color: "#B4832B", fontWeight: 600, marginBottom: 4 }}>SIGNATURE STATUS</div>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 14, lineHeight: 1.45 }}>
        Team Handbook v{handbook.version.n} · Leadership Handbook v{ldrHandbook.version.n} (Team Leader and up only)
        {noPinCount > 0 && <> · <strong style={{ color: "#B45309" }}>{noPinCount} waiting on a PIN</strong> — they can't sign until a leader opens their file and sets it</>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", background: "#EDEBE4", borderRadius: 10, padding: 3 }}>
          <button onClick={() => setFilter("all")} style={{ border: "none", borderRadius: 8, padding: "8px 13px", fontSize: 13, fontWeight: 600, cursor: "pointer", background: filter === "all" ? "#fff" : "transparent", color: filter === "all" ? "#14243D" : "#6B7280", boxShadow: filter === "all" ? "0 1px 3px rgba(20,36,61,.12)" : "none" }}>Everyone</button>
          <button onClick={() => setFilter("unsigned")} style={{ border: "none", borderRadius: 8, padding: "8px 13px", fontSize: 13, fontWeight: 600, cursor: "pointer", background: filter === "unsigned" ? "#fff" : "transparent", color: filter === "unsigned" ? "#14243D" : "#6B7280", boxShadow: filter === "unsigned" ? "0 1px 3px rgba(20,36,61,.12)" : "none" }}>Outstanding · {unsignedCount}</button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or role" style={{ flex: "1 1 220px", minWidth: 180, padding: "10px 12px", borderRadius: 10, border: "1px solid #E4E3DD", background: "#fff", fontSize: 14, outline: "none", color: "#14243D" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
        {current.map((m) => (
          <button key={m.id} onClick={() => onOpen(m)} style={{ textAlign: "left", background: "#fff", border: "1px solid #E4E3DD", borderRadius: 12, padding: "14px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <Av name={m.name} src={avatarFor(m.name)} style={{ ...S.av, width: 42, height: 42, fontSize: 14, borderRadius: 9 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: "#14243D", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                <span style={{ display: "inline-block", marginTop: 5, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: roleColor(m.role) + "15", color: roleColor(m.role) }}>{m.role}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", borderTop: "1px solid #E4E3DD", paddingTop: 10 }}>
              {isHbExempt(m.id) ? (
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap", background: "#F3F4F6", color: "#6B7280" }}>
                  Not required to sign
                </span>
              ) : (
                <>
                  <Pill ok={hbSigned(m.id)} text="Handbook" />
                  {isLeaderTier(m.role) && <Pill ok={ldrSigned(m.id)} text="Ldr Handbook" />}
                  {noPin(m.id) && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap", background: "#FFF7ED", color: "#B45309" }}>
                      No PIN yet
                    </span>
                  )}
                </>
              )}
            </div>
          </button>
        ))}
        {current.length === 0 && <div style={{ gridColumn: "1 / -1", ...S.empty }}>{filter === "unsigned" ? "Everyone is signed and current. ✓" : "No matches for \"" + q + "\"."}</div>}
      </div>
    </div>
  );
}
function SopSendPanel({ doc, team, roles, areas, onCancel, onSend }) {
  const [audience, setAudience] = useState("all");
  const [role, setRole] = useState((roles && roles[0]) || "");
  const [area, setArea] = useState((areas && areas[0]) || "");
  const [ids, setIds] = useState([]);
  const [signRequired, setSignRequired] = useState(true);
  const [err, setErr] = useState("");
  const roster = Array.isArray(team) ? team : [];
  const toggleId = (id) => setIds((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const submit = () => {
    setErr("");
    if (audience === "select" && !ids.length) { setErr("Pick at least one person."); return; }
    const r = onSend({ audience, role, area, ids, signRequired });
    if (r && !r.ok) setErr("No one matched that audience.");
  };
  const opt = (val, label) => (
    <button key={val} onClick={() => setAudience(val)} style={{ ...S.sec, padding: "6px 12px", ...(audience === val ? { background: "#223C6A", color: "#fff", borderColor: "#223C6A" } : {}) }}>{label}</button>
  );
  return (
    <div style={{ marginTop: 10, padding: 12, border: "1px solid #C7D2FE", borderRadius: 10, background: "#F8FAFF" }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#223C6A", marginBottom: 8 }}>Send "{doc.title || "document"}"</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {opt("all", "Everyone")}
        {opt("role", "By role")}
        {opt("area", "By area")}
        {opt("select", "Select people")}
      </div>
      {audience === "role" && (
        <select value={role} onChange={(e) => setRole(e.target.value)} style={{ ...S.search, marginBottom: 8 }}>
          {(roles || []).map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      )}
      {audience === "area" && (
        (areas && areas.length) ? (
          <select value={area} onChange={(e) => setArea(e.target.value)} style={{ ...S.search, marginBottom: 8 }}>
            {areas.map((a) => <option key={a} value={a}>{a || "(no area)"}</option>)}
          </select>
        ) : (
          <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 8 }}>No areas are set on team member profiles yet.</div>
        )
      )}
      {audience === "select" && (
        <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #E4E3DD", borderRadius: 8, marginBottom: 8, background: "#fff" }}>
          {roster.map((m) => (
            <button key={m.id} onClick={() => toggleId(m.id)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "7px 10px", background: ids.includes(m.id) ? "#EEF2FF" : "#fff", border: "none", borderBottom: "1px solid #F3F4F6", cursor: "pointer" }}>
              <span style={{ width: 16 }}>{ids.includes(m.id) ? "☑" : "☐"}</span>
              <span style={{ fontSize: 13, color: "#111827", flex: 1 }}>{m.name}</span>
              <span style={{ fontSize: 11, color: "#6B7280" }}>{m.role}</span>
            </button>
          ))}
          {roster.length === 0 && <div style={{ padding: 10, fontSize: 12, color: "#9CA3AF" }}>No team members.</div>}
        </div>
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#374151", marginBottom: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={signRequired} onChange={(e) => setSignRequired(e.target.checked)} />
        Require acknowledgment (emails them + shows in their unsigned count)
      </label>
      {err && <div style={{ fontSize: 12, color: "#DD0031", marginBottom: 8, fontWeight: 600 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={S.prim} onClick={submit}>Send</button>
        <button style={S.sec} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
// Read-only SOP catalog surfaced from Team Documentation's Docs tab, so the SOP
// Drive links keep a home in the Hub once that tile is retired (Hannah, Jul 18).
// Renders whatever the Docs tab authored — {title, category, body, attachName,
// attachUrl}. No authoring here; this is preservation + access only.
/* The document form. `attachUrl` on the existing catalog points at the old Wix
   host (filesusr.com); anything served by the Hub itself should use a
   gatecityhub.com/docs/... address instead, which is why that hint is on the
   field rather than in a runbook nobody opens. */
function SopDocForm({ doc, onCancel, onSave }) {
  const [f, setF] = useState(() => ({
    id: (doc && doc.id) || "", title: (doc && doc.title) || "", category: (doc && doc.category) || "General",
    body: (doc && doc.body) || "", attachName: (doc && doc.attachName) || "", attachUrl: (doc && doc.attachUrl) || "",
    signRequired: !!(doc && doc.signRequired), createdAt: (doc && doc.createdAt) || "",
  }));
  const [err, setErr] = useState("");
  // ⚠️ value captured BEFORE the updater — see the prep-work bug in Leadership101.
  const set = (k) => (e) => { const v = e.target.type === "checkbox" ? e.target.checked : e.target.value; setF((p) => ({ ...p, [k]: v })); };
  const lbl = { fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: ".04em", margin: "9px 0 3px" };
  const inp = { width: "100%", boxSizing: "border-box", border: "1px solid #D1D5DB", borderRadius: 8, padding: "8px 10px", fontSize: 13, background: "#fff" };
  return (
    <div style={{ border: "1px solid #C7D2FE", background: "#F8FAFF", borderRadius: 10, padding: "12px 13px", marginTop: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#223C6A" }}>{f.id ? "Edit document" : "Add a document"}</div>
      <div style={lbl}>Title</div>
      <input style={inp} value={f.title} onChange={set("title")} placeholder="Point Performance System" />
      <div style={lbl}>Category</div>
      <input style={inp} value={f.category} onChange={set("category")} placeholder="General" />
      <div style={lbl}>Body — what someone sees, and signs against if acknowledgement is required</div>
      <textarea style={{ ...inp, minHeight: 70, resize: "vertical" }} value={f.body} onChange={set("body")}
        placeholder="By signing below I acknowledge that I have read and understand this policy." />
      <div style={lbl}>Link text</div>
      <input style={inp} value={f.attachName} onChange={set("attachName")} placeholder="Point Performance System" />
      <div style={lbl}>Document link</div>
      <input style={inp} value={f.attachUrl} onChange={set("attachUrl")} placeholder={`https://${storeCfg("identity.domain")}/docs/point-performance-system`} />
      <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3, lineHeight: 1.4 }}>
        Documents already in the Hub live at <b>{storeCfg("identity.domain")}/docs/…</b>. A Drive or other public link works too, as long as the team can open it without signing in.
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11, fontSize: 13, color: "#111827", fontWeight: 600 }}>
        <input type="checkbox" checked={f.signRequired} onChange={set("signRequired")} />
        Require acknowledgement when this is sent
      </label>
      {err && <div style={{ color: "#B91C1C", fontSize: 12, fontWeight: 700, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button style={{ ...S.hbBtn, flex: 1 }} onClick={() => {
          if (!f.title.trim()) { setErr("A title is required."); return; }
          const r = onSave(f); if (!r || !r.ok) setErr("Could not save that document.");
        }}>Save</button>
        <button style={{ ...S.sec, flex: 1 }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function SopLibrary({ docs, onBack, canSend, canManage, onSaveDoc, onDeleteDoc, team, roles, areas, onSend }) {
  const [editing, setEditing] = useState(null);   // a doc object, or {} for a new one
  const [q, setQ] = useState("");
  const [sendFor, setSendFor] = useState(null);
  const [sentMsg, setSentMsg] = useState("");
  const list = Array.isArray(docs) ? docs : [];
  const qq = q.trim().toLowerCase();
  const shown = list.filter((d) =>
    !qq ||
    (d.title || "").toLowerCase().includes(qq) ||
    (d.category || "").toLowerCase().includes(qq) ||
    (d.body || "").toLowerCase().includes(qq)
  );
  // Group by category, categories alphabetical, "General" first if present.
  const cats = Array.from(new Set(shown.map((d) => (d.category || "General").trim() || "General")))
    .sort((a, b) => (a === "General" ? -1 : b === "General" ? 1 : a.localeCompare(b)));

  return (
    <div style={S.body}>
      <div style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 11, letterSpacing: 1.2, color: "#B4832B", fontWeight: 600, marginBottom: 4 }}>SOP LIBRARY</div>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12, lineHeight: 1.45 }}>
        Standard operating procedures and reference documents — {list.length} on file. Each opens its
        document in a new tab, and can be sent to the team with acknowledgement required.
      </div>
      {canManage && !editing && (
        <button style={{ ...S.hbBtn, width: "100%", marginBottom: 12 }} onClick={() => { setSentMsg(""); setEditing({}); }}>
          + Add a document
        </button>
      )}
      {canManage && editing && !editing.id && (
        <SopDocForm doc={null} onCancel={() => setEditing(null)} onSave={(d) => { const r = onSaveDoc(d); if (r && r.ok) setEditing(null); return r; }} />
      )}
      {sentMsg && <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#065F46", borderRadius: 8, padding: "8px 11px", fontSize: 12, fontWeight: 700, marginBottom: 12 }}>{sentMsg}</div>}

      {list.length === 0 ? (
        <div style={S.empty}>
          No SOP documents found in the catalog. If the Docs tab has documents but none show here, the
          catalog isn't reading through — flag it before retiring Team Documentation.
        </div>
      ) : (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SOPs by title, category, or text" style={S.search} />
          {cats.map((cat) => {
            const inCat = shown.filter((d) => ((d.category || "General").trim() || "General") === cat);
            return (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "#6B7280", margin: "4px 0 8px" }}>{cat} ({inCat.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {inCat.map((d, i) => (
                    <div key={d.id || cat + i} style={{ border: "1px solid #E4E3DD", borderRadius: 10, padding: "11px 13px", background: "#fff" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{d.title || "Untitled document"}</div>
                      {d.body && (
                        <div style={{ fontSize: 12, color: "#6B7280", marginTop: 5, lineHeight: 1.4 }}>
                          {d.body.length > 160 ? d.body.slice(0, 160) + "…" : d.body}
                        </div>
                      )}
                      {d.attachUrl ? (
                        <a href={d.attachUrl} target="_blank" rel="noreferrer"
                          style={{ display: "inline-block", marginTop: 8, fontSize: 12, fontWeight: 700, color: "#1D5FA8", textDecoration: "none" }}>
                          📎 {d.attachName || "Open document"}
                        </a>
                      ) : d.attachName ? (
                        <div style={{ marginTop: 8, fontSize: 12, color: "#9CA3AF" }}>📎 {d.attachName} (no link)</div>
                      ) : (
                        <div style={{ marginTop: 8, fontSize: 12, color: "#9CA3AF", fontStyle: "italic" }}>No Drive link on this document</div>
                      )}
                      {canManage && (editing && editing.id === d.id ? (
                        <SopDocForm doc={d} onCancel={() => setEditing(null)} onSave={(x) => { const r = onSaveDoc(x); if (r && r.ok) setEditing(null); return r; }} />
                      ) : (
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                          <button style={{ ...S.sec, flex: 1 }} onClick={() => { setSentMsg(""); setEditing(d); }}>Edit</button>
                          <button style={{ ...S.sec, flex: 1, color: "#B91C1C", borderColor: "#FECACA" }}
                            onClick={() => { if (window.confirm("Delete \"" + (d.title || "this document") + "\" from the library?\n\nDocuments already sent keep their own record — acknowledgements are not lost.")) onDeleteDoc(d.id); }}>Delete</button>
                        </div>
                      ))}
                      {canSend && (sendFor && sendFor.id === (d.id || cat + i) ? (
                        <SopSendPanel doc={d} team={team} roles={roles} areas={areas} onCancel={() => setSendFor(null)} onSend={(opts) => { const r = onSend(d, opts); if (r && r.ok) { setSendFor(null); setSentMsg("\"" + (d.title || "Document") + "\" sent to " + r.count + " team member" + (r.count === 1 ? "" : "s") + "."); } return r; }} />
                      ) : (
                        <button style={{ ...S.sec, marginTop: 10, color: "#223C6A", borderColor: "#C7D2FE" }} onClick={() => { setSentMsg(""); setSendFor({ id: d.id || cat + i }); }}>Send to team →</button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {shown.length === 0 && <div style={S.empty}>{"No SOPs match \"" + q + "\"."}</div>}
        </>
      )}

      <button style={{ ...S.hbBtn, background: "#fff", color: "#223C6A", border: "1px solid #D1D5DB", width: "100%", marginTop: 8 }} onClick={onBack}>
        ← Back to directory
      </button>
    </div>
  );
}
function PushModal({ version, onClose, onOk, label: docName = "Handbook" }) {
  const [label, setLabel] = useState("");
  return (
    <Overlay onClose={onClose}>
      <div style={S.mTitle}>Push {docName} Update</div>
      <div style={S.mSub}>This publishes v{version.n + 1} to the whole team. Everyone currently signed will be marked as needing to re-sign.</div>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Version label (e.g. Summer 2026 update)" style={S.in} />
      <div style={S.mAct}><button style={S.sec} onClick={onClose}>Cancel</button><button style={S.prim} onClick={() => onOk(label.trim())}>Publish to Team</button></div>
    </Overlay>
  );
}
function Overlay({ children, onClose }) { return <div style={S.ov} onClick={onClose}><div style={S.modal} onClick={(e) => e.stopPropagation()}>{children}</div></div>; }
function Lbl({ t }) { return <div style={{ fontSize: 12, color: "#6B7280", margin: "0 0 4px", fontWeight: 600 }}>{t}</div>; }

const S = {
  app: { minHeight: "100vh", background: "#F6F5F2", fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif" },
  shell: { width: "100%", maxWidth: 1160, margin: "0 auto", background: "transparent", display: "flex", flexDirection: "column" },
  head: { background: "linear-gradient(135deg,#223C6A,#14243D)", color: "#fff", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  headL: { display: "flex", alignItems: "center", gap: 12 },
  back: { background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", width: 30, height: 30, borderRadius: 8, cursor: "pointer", fontSize: 16 },
  hIcon: { width: 34, height: 34, borderRadius: 8, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: "#fff" },
  sess: { background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", borderRadius: 8, padding: "7px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  body: { padding: 16, overflowY: "auto" },
  tabs: { display: "flex", gap: 8, marginBottom: 12 },
  tab: { flex: 1, padding: "9px 0", borderRadius: 10, border: "1px solid #D1D5DB", background: "#fff", color: "#6B7280", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  tabA: { background: "#223C6A", color: "#fff", borderColor: "#223C6A" },
  hbBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: "#fff", border: "1px solid #E4E3DD", borderRadius: 10, padding: "10px 12px", marginBottom: 12 },
  hbBtn: { background: "#223C6A", color: "#fff", border: "none", borderRadius: 8, padding: "8px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" },
  search: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #D1D5DB", background: "#fff", fontSize: 14, marginBottom: 12, outline: "none" },
  note: { background: "#F8FAFC", border: "1px solid #E5E7EB", color: "#4B5563", fontSize: 12, borderRadius: 10, padding: "10px 12px", marginBottom: 12, lineHeight: 1.4 },
  row: { display: "flex", alignItems: "center", gap: 12, padding: "10px", background: "#fff", border: "1px solid #E4E3DD", borderRadius: 10, cursor: "pointer", width: "100%" },
  av: { width: 36, height: 36, borderRadius: 9, background: "#14243D", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 },
  badge: { fontSize: 11, padding: "2px 8px", borderRadius: 10, display: "inline-block" },
  empty: { color: "#9CA3AF", fontSize: 13, padding: "10px 0" },
  pHead: { display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, marginBottom: 14, borderBottom: "1px solid #E4E3DD" },
  self: { background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#047857", fontSize: 12, borderRadius: 10, padding: "10px 12px", marginBottom: 12, lineHeight: 1.4 },
  term: { background: "#fff", color: "#DD0031", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" },
  react: { background: "#fff", color: "#0F766E", border: "1px solid #BFDBFE", borderRadius: 8, padding: "8px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" },
  pills: { display: "flex", gap: 6, overflowX: "auto", padding: 4, background: "#EDEBE4", borderRadius: 12, marginBottom: 16 },
  pill: { padding: "8px 14px", borderRadius: 8, border: "none", background: "transparent", color: "#6B7280", fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" },
  pillA: { background: "#fff", color: "#14243D", boxShadow: "0 1px 3px rgba(20,36,61,.12)" },
  sLbl: { fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, color: "#B4832B", margin: "18px 0 10px" },
  // Per-group header inside the Employee File — label + count + point subtotal.
  gHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 11px", margin: "12px 0 8px" },
  // The point total that sits above the grouped file.
  /* These two sit INSIDE the file view alongside raised cards, so they take the
     soft shadow. The full one would read as a second floating layer stacked on
     the first, which is the layered-card muddle rather than depth. */
  fileTotal: { display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", backgroundImage: cardSurface(ACCENT_NEUTRAL, 0.5), border: "1px solid #E4E3DD", borderRadius: 10, padding: "10px 14px", marginBottom: 2, fontFamily: "'IBM Plex Mono',ui-monospace,monospace", ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D_SOFT },
  tGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  /* ★ THE TILES (Matt, Aug 4 2026: "the hr console still lacks depth in the
     tiles"). "New Documentation" and "Counseling Path" are grids of these, and
     they were flat white with a hairline border while the rest of the Hub had
     moved to the raised look. They are the thing a leader taps, so they are
     exactly the surface that should sit above the page.
     ⚠️ backgroundColor + backgroundImage, never the `background` shorthand.
     The shorthand resets background-image, so a later gradient is the only thing
     holding the face and the card goes see-through where it fades out. Split
     into the two longhands there is no order to get wrong. */
  tCard: { backgroundColor: "#fff", backgroundImage: cardSurface(ACCENT_NEUTRAL, 0.5), border: "1px solid #E4E3DD", borderRadius: 10, padding: "10px 12px", textAlign: "left", cursor: "pointer", ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D },
  tLock: { background: "#F3F4F6", cursor: "not-allowed", opacity: 0.7 },
  ladder: { backgroundColor: "#fff", backgroundImage: cardSurface(ACCENT_NEUTRAL, 0.5), border: "1px solid #E4E3DD", borderRadius: 10, padding: "10px 12px", marginBottom: 10, ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D_SOFT },
  ladRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#374151", padding: "4px 0", borderBottom: "1px solid #F3F4F6" },
  ladStep: { fontSize: 11, fontWeight: 700, color: "#B91C1C", background: "#FEE2E2", padding: "2px 6px", borderRadius: 8, minWidth: 42, textAlign: "center" },
  /* Had the shadow and the strip but not the gradient face, because cardStyle's
     `cardSurface` was never imported here. A shadow says the card is above the
     page; the gradient is what makes the card itself look like a surface rather
     than a white rectangle. That missing half is what "lacks depth" was. */
  card: { backgroundColor: "#fff", backgroundImage: cardSurface(ACCENT_NEUTRAL, 0.5), border: "1px solid #E4E3DD", borderRadius: 10, padding: 12, marginBottom: 10, ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D },

  fCard: { backgroundColor: "#fff", backgroundImage: cardSurface(ACCENT_NEUTRAL, 0.5), border: "1px solid #E4E3DD", borderRadius: 10, padding: 12, marginBottom: 10, ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D },
  issuer: { background: "#FEE2E2", color: "#B91C1C", fontSize: 12, fontWeight: 600, borderRadius: 8, padding: "8px 10px", marginBottom: 10 },
  statement: { background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 10, padding: 12, fontSize: 13, color: "#374151", lineHeight: 1.5, marginBottom: 12 },
  sigBox: { background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 10px", marginTop: 8 },
  rm: { background: "none", border: "none", color: "#DD0031", fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 0 },
  dim: { fontSize: 11, padding: "3px 8px", borderRadius: 10, background: "#F3F4F6", color: "#374151" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  in: { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: 13, outline: "none", background: "#fff", marginBottom: 10 },
  rate: { flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", color: "#6B7280", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  rateA: { background: "#223C6A", color: "#fff", borderColor: "#223C6A" },
  full: { width: "100%", background: "#223C6A", color: "#fff", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 6 },
  prim: { background: "#223C6A", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" },
  sec: { background: "#F3F4F6", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 8, padding: "10px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  ov: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 },
  modal: { background: "#FFFFFF", borderRadius: 14, padding: 20, width: "100%", maxWidth: 360, boxShadow: "0 16px 40px rgba(15,23,42,0.3)" },
  mTitle: { fontSize: 17, fontWeight: 700, color: "#111827", marginBottom: 4 },
  mSub: { fontSize: 13, color: "#6B7280", marginBottom: 14, lineHeight: 1.4 },
  mAct: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 },
  pinIn: { width: "100%", boxSizing: "border-box", padding: "12px", borderRadius: 10, border: "1px solid #D1D5DB", fontSize: 20, letterSpacing: 6, textAlign: "center", outline: "none" },
  err: { color: "#DD0031", fontSize: 12, marginTop: 8, fontWeight: 600 },
  hint: { color: "#9CA3AF", fontSize: 11, marginTop: 8 },
  toast: { position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: "#14243D", color: "#fff", padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700, zIndex: 9999, boxShadow: "0 4px 18px rgba(0,0,0,0.3)" },
};

/* ── Shared with App.jsx and TeamDocs.jsx ─────────────────────────
   HR_TEAM is the SEED roster (RAW_TEAM), and stays a static export so no
   importer breaks at module load. It does NOT include anyone hired since the
   Hub went up.

   ⚠️ ANY PIN LOOKUP OR ROSTER-WIDE COUNT MUST USE `loadHRTeam()` (async, exported
   above) — HR_TEAM alone will not match a new hire's PIN, and they simply won't
   be able to sign in. App.jsx uses loadHRTeam in both places; both of its
   lookups were already inside async functions. */
// ⚠️ isLeaderTier is EXPORTED for the same reason isHbExempt is: handbook counts
// are computed in TWO files, here and in App.jsx (dashboard pulse + the Peak
// Reachers climb). A second, local copy of this rule in App.jsx is exactly how
// the counts drifted last time — import this one rather than re-deriving it.
export { TEAM as HR_TEAM, RANK as HR_RANK, PIN as HR_DEFAULT_PIN, isHbExempt, isLeaderTier, loadHRTeam, loadHRTeamResult };
