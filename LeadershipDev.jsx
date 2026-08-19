import React, { useState, useMemo, useEffect, useRef } from "react";
import { CHECKLIST_CARDS } from "./skillsChecklists.js";
import { leadershipDevNames, STORE } from "./storeConfig.js";
import { kvGet, kvSet, kvGetResult, publishSharedRows } from "./store.js";
import { loadHRTeam } from "./HRConsole.jsx";
import { eosPeriod } from "./eosPeriod.js";
import { HR_ASSIGNABLE_LADDER } from "./hrRoster.js";
import { TRAINING_ADMIN_ROLES } from "./adminRoles.js";

// ============================================================
// LeadershipDev.jsx — Gate City Hub · People & Team
// Built from Bri's "Leadership Dev Hub" spec (Drive, Jul 10).
//
// SHIPS IN V1 (this file):
//   · Roster pulled from HR Console, Bri can edit roles
//   · 6-month evaluation flags (JT / ST / TL / AD)
//   · Coaching records per person, personal-PIN gated
//   · Private Notes field — LD Director + Exec Directors only
//
// DEFERRED (stubs at bottom, see BLOCKERS):
//   · Peak Reachers monthly goals   — needs file uploads
//   · Leadership Applications        — needs file uploads
//   · Leadership 101 modules         — needs content migration
//
// BLOCKERS
//   1. File uploads: Supabase KV is text/JSON only. PDF/JPEG
//      upload needs a Supabase Storage bucket. New primitive.
//   2. Google Classroom / Canva → modules: no API path. Manual
//      content re-entry by Bri, weeks of work, not a build task.
//   3. Notes privacy is HR-sensitive. Gate is role-based below,
//      NOT PIN-based. Verify before real data goes in.
//
// KV wiring:
//   ld:roster · ld:coaching:{personId} · ld:evalcadence
// Roster seeds from HR Console; coaching keyed per person.
// ============================================================

const C = {
  ink: "#171C26",
  sub: "#5B6472",
  paper: "#F4F6F8",
  card: "#FFFFFF",
  line: "#E3E7EC",
  red: "#DD0031",
  green: "#1E8E5A",
  greenSoft: "#E4F3EC",
  redSoft: "#FBE7EC",
  amber: "#C77D0A",
  amberSoft: "#FBF1DF",
  blue: "#1D5FA8",
  blueSoft: "#E6EFF9",
};

const TODAY = new Date();
/* Local calendar day, not UTC. toISOString() is UTC and from 8pm Eastern it
   already names tomorrow, which would expire an exemption a day early for
   anyone looking at this in the evening. Same rule the rest of the Hub uses. */
const TODAY_ISO = TODAY.toLocaleDateString("en-CA");
const EVAL_DAYS = 180;     // evaluation due 6 months after last eval (per spec)
const COACHING_DAYS = 90;  // coaching due 3 months after last eval (per spec, NEW UPDATE)

// HR Console KV keys — the LD tile READS these; HR Console owns the writes.
const HR_EVALS_KEY = "gcfcr-hr-evals";  // { [hrId]: [{ date, ... }] }
const HR_INFO_KEY  = "gcfcr-hr-info";   // { [hrId]: { hireDate, email, termDate } }
const HR_ROLES_KEY = "gcfcr-hr-roles";  // { [hrId]: role }  (Bri's role edits land here)
const HR_STATUS_KEY = "gcfcr-hr-status"; // { [hrId]: "current" | "terminated" | ... }
// Latest eval date (ms) for a person from the HR evals array, or null.
const latestEvalMs = (list) => {
  if (!Array.isArray(list) || !list.length) return null;
  let last = null;
  for (const ev of list) {
    const t = ev && ev.date ? new Date(ev.date + "T12:00:00").getTime() : NaN;
    if (!Number.isNaN(t) && (last == null || t > last)) last = t;
  }
  return last;
};

/* Roles Bri can ASSIGN, in hierarchy order.

   ⚠️ "Director" IS DELIBERATELY NOT HERE (Aug 4 2026). HR Console's
   TITLE_OPTIONS_LIMITED is Bri's assignable list over there and its comment
   spells out why Director is excluded: those titles carry HR Console access,
   documenting rights and the financial gates, so granting one "would be a
   permissions change, not a typo fix, and belongs to Hannah". This dropdown
   wrote the SAME gcfcr-hr-roles map with Director on the list, so the whole
   restriction was one tile away — any team member could be made a Director,
   and HR file access and the Facilities tile came with it.

   ⚠️ Two lists for one rule is the reason this drifted, and merging them is a
   real change: TITLE_OPTIONS_LIMITED lives in HRConsole.jsx, which is a
   multi-session file, and importing across would risk a cycle. Left as two,
   and flagged, rather than smuggled into a bug fix.
   ⚠️ ROLES_DISPLAY, not ROLES, feeds the dropdown — see below. Dropping
   Director from the options alone would have shown an EXISTING Director a
   select with their own title missing, which reads as "no role" and is one
   stray change event away from silently demoting them. */

/* ✅ THE MERGE ABOVE IS DONE — Aug 7 2026, and the cycle worry did not apply.
   🐛 The two lists had ALREADY drifted while that note sat here: this copy held
   five rungs against HRConsole's eight, missing "Trainer", "Junior Team Leader"
   and "Senior Team Leader". Bri owns the leadership pipeline and could not
   promote anyone to plain Trainer from this tile — the second time this exact
   list has done that to her (see the Jul 25 note in hrRoster.js).
   The list now lives in hrRoster.js, which imports NOTHING and is already
   shared with the Worker, so there is no cycle to risk. Do not re-type it here.
   ⚠️ Reversed for display only. This dropdown has always read top-down from
   Assistant Director and that is not what was broken, so it is preserved — but
   it is a reversed COPY of the one list, never a second list. */
const ROLES = [...HR_ASSIGNABLE_LADDER].reverse();
/* What the select shows: everything assignable, plus the person's CURRENT title
   when it is one Bri may not hand out. Present so the value renders, and it is
   never a new grant — she can move them down the ladder, not back up it. */
const rolesForSelect = (current) =>
  (current && !ROLES.includes(current)) ? [current, ...ROLES] : ROLES;
// Roles that carry an evaluation cadence
const EVAL_ROLES = ["Assistant Director", "Team Leader", "Senior Trainer", "Junior Trainer"];

// Notes visibility: LD Director + Executive Directors ONLY.
// Role-based, not PIN-based — a personal PIN proves identity,
// it does not grant authority.
// ★ ROLE FIRST, NAMES ONLY AS A SAFETY NET (Jul 26).
// A hardcoded list of people is a thing that rots. Kyleeka is leaving
// and sits in FOUR of these lists across the Hub; a new Executive Director
// would sit in none of them and silently have no access until someone edited
// code. Neither failure announces itself.
// The role check is the real gate now. The names stay so nobody currently
// holding access loses it the moment this deploys — but a name list should
// never again be the ONLY way in.
/* ★ THE LIST NOW LIVES IN adminRoles.js — TRAINING_ADMIN_ROLES.
   the four training tools share one list. NOTE this list carries `leadership director` and NOT plain `director`.
   ⚠️ ONLY THE DECLARATION MOVED. Every use of LEAD_ROLES below is
   byte-for-byte what it was, including this file's own role normaliser,
   which is NOT the same function in every tile. */
const LEAD_ROLES = new Set(TRAINING_ADMIN_ROLES);
const norm = (s) => String(s || "").trim().toLowerCase();
/* ★★ THE NAME SAFETY NET NOW COMES FROM storeConfig (Aug 11 2026).
   This list was byte-identical to Leadership101's INSTRUCTORS and to
   LeadershipDevTile's DIRECTORS — THREE copies of the same four people, in one
   feature, each able to drift on its own. Design rule 8 exists for exactly
   that, and it warns about it in the case where the drifting thing decides who
   matches whom. All three read owners.leadershipDev.directors now.

   ⚠️ IF THESE EVER NEED TO DIFFER, SPLIT THEM THEN, with a second key and a
   reason written down. Do not re-add a literal here.
   ⚠️ A CLONE GETS AN EMPTY LIST AND LOSES NOTHING: the role test above is the
   real gate and is unchanged, so their leadership reads notes by role. The
   names were only ever a safety net so nobody lost access on a deploy. */
// ⚠️ PRIVATE COACHING NOTES. Widening this is a privacy decision, not a
// convenience one — Assistant Directors and Team Leaders are deliberately OUT.
const canSeeNotes = (user) =>
  LEAD_ROLES.has(norm(user && user.role))
  || leadershipDevNames("directors").includes(norm(user && user.name));
const canEditRoles = (user) => canSeeNotes(user);

/* The hardcoded `seedRoster` array lived here and was deleted Aug 2 2026. It was
   already dead code: `roster` starts as useState([]) and is filled entirely from
   loadHRTeam() in the mount effect below, which also drops anyone marked
   terminated. The stale copy still listed Tyler Byrd (terminated 7/20/2026), so
   it was a termination waiting to leak back onto a screen if anyone ever wired
   it up as a fallback. Roster data belongs to HR Console, not to this file. */

/* ⚠️ EXAMPLE CONTENT ONLY — NO REAL PEOPLE, NO REAL ASSESSMENTS (Aug 8 2026).
   🐛 This seed used to carry what reads as genuine one-to-one coaching records:
   dated sessions with an identified opportunity, assigned actions, a follow-up
   date, and written judgements — "watch for taking on too much rather than
   delegating", "ready for AD conversation in Q4" — plus a real team member
   named in an action. LeadershipDev ships in a client chunk, so all of it was
   downloadable by anyone, including the people being assessed.

   Checked the database before deciding what to do with it: there are NO
   ld:coaching:* records at all, so nobody has ever used the feature and this
   was demonstration content, not history. It is de-identified rather than
   deleted so the tile still has a shape to render.

   ⚠️ REAL COACHING NOTES MUST NEVER LIVE IN THIS FILE. They belong in
   ld:coaching:{personId}, written through the tile. A judgement about a named
   person does not go in a .jsx. */
const seedCoaching = {};

/* Bri's Rock 2 — the pipeline funnel, Team Member through AD.
   Bri's ask (her priority 2): add, rename, delete and reorder the stages
   herself, not just the counts.

   ★★ EVERY STAGE HAS A STABLE `id`, AND THE EOS LINK USES IT.
   Until now the scorecard found the promotion-ready stage by its LABEL,
   `p.stage === "ADs In Progress"`. That coupling has already broken once: the
   stages were renamed on 7/20, the lookup missed, and the tile published a
   false 0 into the EOS scorecard — a red on Bri's own row for a stage that had
   simply been renamed. Handing her a rename button while that lookup stood
   would have guaranteed a repeat, silently.
   ⇒ `PROMO_STAGE_ID` below is what s7 follows. She can call that stage anything
   she likes, move it anywhere in the funnel, and the number keeps flowing.
   ⚠️ If she DELETES it, s7 stops publishing rather than publishing zero —
   "no such stage" is not "zero people ready". The UI says so before she does it. */
const PROMO_STAGE_ID = "ads";
const seedPipeline = [
  { id: "tm", stage: "Team Members", count: 78 },
  { id: "l101", stage: "Leadership 101", count: 5 },
  { id: "trainers", stage: "Trainers", count: 14 },
  { id: "tls", stage: "TLs In Progress", count: 9 },
  { id: PROMO_STAGE_ID, stage: "ADs In Progress", count: 5 },
];

const daysBetween = (a, b) => Math.round((b - a) / 864e5);
const fmt = (iso) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

/* ═══ THE 90 DAY PROMOTION REVIEW ═══════════════════════════════════════════
   Bri, Jul 30 2026: "I want to also add a separate space to add manual
   evaluation dates specifically for '90 Day Promotion Review'… I want the
   reminder visible beside the name on my roster that says what it is and the
   due date I set. I only want this visible if I have it set, otherwise I want
   the option hidden from view since there are only a few people at a time who
   will have this particular evaluation. It will not be recurring… This option
   can still show up in the 'eval due' filter, it's still an evaluation, just a
   specific type that functions differently."

   ★★ NO NEW STORE, AND THAT IS THE WHOLE FINDING. The obvious build was a map
   of person → date. It would have been wrong. She did not wait — on Jul 31 she
   set six of these up HERSELF in HR Console as assigned evaluations, using the
   "90 Day Promotion Review" template she had already made. Adriana, Lizbeth,
   Thania, Monica, Brandon and Daisy are all sitting in gcfcr-hr-evaltasks-v1
   right now with real due dates, and Thania's is Sep 29, which is the "end of
   September" she named in the original ask. A second store would have been a
   parallel list of the same fact, drifting from the day it shipped (rule 8).

   ★ HER PART SIX IS ALREADY BUILT, TOO: "once it's completed in the evaluation
   section it removes it and files with all other evaluations in HR Console" is
   exactly what approveTask does — it writes the eval into gcfcr-hr-evals under
   the person's roster id and closes the task. So the reminder clears itself
   with no new code and nothing to keep in step.

   ⚠️ WHAT WAS ACTUALLY MISSING is only this: her roster never read the key. So
   this file reads it, and nothing here writes it. HR Console owns the writes,
   the same rule as every other HR key above.
   ⚠️ STILL OWED MEANS NOT YET APPROVED. `submitted` is not done — a leader has
   written it and Bri has not accepted it, so it is not in anyone's file yet.
   Same standard as her team-goal banner: it stays up until submitted AND
   approved. */
const HR_EVAL_TASK_KEY = "gcfcr-hr-evaltasks-v1";
const PROMO_TEMPLATE = "90 day promotion review";
const PROMO_OPEN = new Set(["open", "returned", "recommended", "submitted"]);

/* The open 90-day review for one person, or null. Pure, module level (rule 7).
   ⚠️ MATCHED ON THE TEMPLATE NAME, lowercased and trimmed. The id would be
   tighter, but she can retire a template and build a new one with the same
   name — and when she does, the reminder must keep working. A name she chose
   is the stable thing here; a generated id is not. */
function promoTaskFor(tasks, personId) {
  if (!Array.isArray(tasks)) return null;
  const want = String(personId);
  let best = null;
  for (const t of tasks) {
    if (!t || String(t.subjectId) !== want) continue;
    if (String(t.templateName || "").trim().toLowerCase() !== PROMO_TEMPLATE) continue;
    if (!PROMO_OPEN.has(String(t.status || "").trim().toLowerCase())) continue;
    /* Soonest wins if she ever sets two. Showing the later one would hide the
       one that is actually about to come due. */
    if (!best || String(t.dueDate || "") < String(best.dueDate || "")) best = t;
  }
  return best;
}

/* The badge beside the name. `days` is negative when overdue, matching
   evalStatus so the two read the same way round. */
function promoStatus(task, todayIso) {
  if (!task || !task.dueDate) return null;
  const days = daysBetween(new Date(todayIso + "T12:00:00"), new Date(task.dueDate + "T12:00:00"));
  const late = days < 0;
  return {
    label: `90 Day Review ${late ? `${Math.abs(days)}d late` : `· ${task.dueDate}`}`,
    fg: late ? C.red : C.amber, bg: late ? C.redSoft : C.amberSoft, days,
  };
}

// Evaluation flag — 6 months after the person's LAST eval (from HR Console).
// Never-evaluated people show as "No eval on file" so they don't hide.
/* ⚠️ MUST STAY IDENTICAL TO `slug()` IN TrainingSite.jsx — the progress keys are
   written with that one. Any divergence here means "no progress found" forever,
   silently. Verified byte-equivalent Jul 28 2026. */
const slugName = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ═══ EVALUATION OPT-OUT (Bri, Aug 4 2026) ═══════════════════════════════════
   "For the alerts on my roster that say 'no eval on file' or if one becomes
   overdue I would like an option for 'opt out' with a new due date that I can
   set. Some aren't filed because they have entered new roles, so they need time
   to work in those role before being evaluated. A little drop down with a note
   I can also edit would be helpful… so I know why they were exempt."

   ★ IT IS A DEFERRAL, NOT A DELETION, AND THE DATE IS WHAT MAKES IT ONE. An
   exemption with no end date is how somebody quietly never gets evaluated
   again. Past its date it simply stops applying and the normal red badge comes
   back on its own — nobody has to remember to undo anything.

   ⚠️ THE NOTE STAYS ON THE RECORD after it lapses, which is the point of
   writing it down: in three months the question is "was this deliberate or did
   we miss it", and only the note answers that.
   ⚠️ VISIBLE TO THE PERSON IT IS ABOUT (her call, asked directly: "It's ok for
   the individual to see the note. If we are in evaluation season and someone
   recently came on board, I want them to see that we are giving them time").
   Nothing member-facing shows an evaluation due date today, so there is no
   second screen to change yet — this is stored so that when there is one, the
   note is already there rather than being added as an afterthought.
   ⚠️ EDITED BY BRI AND HANNAH ONLY — "it's only edited by Hannah or myself."
   Gated on canEditRoles, the same test that already guards role changes here. */
const OPT_KEY = "ld:eval-optout-v1";
const OPT_REASONS = [
  "New to the role",
  "Recently hired",
  "Returning from leave",
  "Role change in progress",
  "Covered by another review",
  "Other",
];
/* Is this person's evaluation deferred right now? Pure, module level, and it
   takes the record rather than reaching for it, so the badge, the counts and
   the drawer cannot disagree about who is exempt. */
const optActive = (opt, todayIso) =>
  !!(opt && opt.until && String(opt.until) >= String(todayIso));

function evalStatus(person, opt, todayIso) {
  if (!EVAL_ROLES.includes(person.role)) return null;
  /* ⚠️ BEFORE the missing/overdue tests, never after. Her two named cases are
     exactly "no eval on file" and "overdue", so an exemption that only applied
     to one of them would miss half of what she asked for. */
  if (optActive(opt, todayIso)) {
    return { label: `Exempt to ${opt.until}`, fg: C.sub, bg: C.paper, sort: 2, days: 9999, exempt: true };
  }
  if (!person.lastEval) return { label: "No eval on file", fg: C.red, bg: C.redSoft, sort: 0, days: -9999 };
  const due = new Date(person.lastEval + "T12:00:00");
  due.setDate(due.getDate() + EVAL_DAYS);
  const days = daysBetween(TODAY, due);
  if (days < 0) return { label: `Overdue ${Math.abs(days)}d`, fg: C.red, bg: C.redSoft, sort: 0, days };
  if (days <= 30) return { label: `Due in ${days}d`, fg: C.amber, bg: C.amberSoft, sort: 1, days };
  return { label: `${days}d`, fg: C.sub, bg: C.paper, sort: 2, days };
}

// Coaching-due flag — 3 months after the LAST eval (from HR Console).
// Applies to the same evaluated roles; silent until it's actually due.
function coachingStatus(person) {
  if (!EVAL_ROLES.includes(person.role) || !person.lastEval) return null;
  const due = new Date(person.lastEval + "T12:00:00");
  due.setDate(due.getDate() + COACHING_DAYS);
  const days = daysBetween(TODAY, due);
  if (days < 0) return { label: `Coaching due`, fg: C.red, bg: C.redSoft, due: true };
  if (days <= 14) return { label: `Coaching in ${days}d`, fg: C.amber, bg: C.amberSoft, due: false };
  return null;
}

function Card({ children, className = "", style = {} }) {
  return (
    <div className={`rounded-xl p-4 ${className}`} style={{ backgroundColor: C.card, border: `1px solid ${C.line}`, ...style }}>
      {children}
    </div>
  );
}

// The ROADMAP constant and the "Rest of Bri's spec — sequenced" section that
// rendered it were REMOVED Jul 25 at her request ("I want remove the spec's
// portion and phases"). It was build planning — v1-v4 phases, Blocked badges,
// "one Supabase bucket unblocks two phases" — sitting on a page her leaders
// read, and every line of it had gone stale: uploads, applications and
// Leadership 101 all shipped weeks ago.

/* ── One person's evaluation exemption. Module level and self-contained so its
   draft state belongs to the person being edited, not to the roster. ── */
function OptOutPanel({ person, current, todayIso, by, onSave, onClear, onClose }) {
  const [reason, setReason] = useState((current && current.reason) || OPT_REASONS[0]);
  const [note, setNote] = useState((current && current.note) || "");
  const [until, setUntil] = useState((current && current.until) || "");
  const live = optActive(current, todayIso);
  const ok = !!until && until >= todayIso;
  return (
    <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: C.card, border: `1px solid ${C.line}` }}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
        <div className="font-semibold text-sm">Evaluation exemption · {person.name}</div>
        <button onClick={onClose} className="text-xs font-semibold" style={{ color: C.sub }}>Close</button>
      </div>
      <p className="text-xs mb-3" style={{ color: C.sub, lineHeight: 1.5 }}>
        This pauses the evaluation flag until the date you set, and then it comes back on
        its own. {person.name} can see the reason and the note.
      </p>
      <label className="text-xs font-semibold block mb-1" style={{ color: C.sub }}>Why</label>
      <select value={reason} onChange={(e) => setReason(e.target.value)}
        className="w-full text-sm mb-3 rounded-lg px-3 py-2" style={{ border: `1px solid ${C.line}` }}>
        {OPT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <label className="text-xs font-semibold block mb-1" style={{ color: C.sub }}>Note</label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
        placeholder="Anything you want on the record about why"
        className="w-full text-sm mb-3 rounded-lg px-3 py-2" style={{ border: `1px solid ${C.line}` }} />
      <label className="text-xs font-semibold block mb-1" style={{ color: C.sub }}>
        Evaluate them by {until && !ok ? "(that date has already passed)" : ""}
      </label>
      <input type="date" value={until} min={todayIso} onChange={(e) => setUntil(e.target.value)}
        className="w-full text-sm mb-3 rounded-lg px-3 py-2" style={{ border: `1px solid ${C.line}` }} />
      <div className="flex gap-2 flex-wrap">
        <button disabled={!ok}
          onClick={() => onSave({ reason, note: String(note || "").trim(), until,
                                  by: by || "—", at: new Date().toISOString() })}
          className="text-xs font-semibold px-3 py-2 rounded-lg"
          style={{ backgroundColor: ok ? C.ink : C.line, color: ok ? "#fff" : C.sub, cursor: ok ? "pointer" : "default" }}>
          {live ? "Update the exemption" : "Set the exemption"}
        </button>
        {current && (
          /* ⚠️ Clearing removes the record entirely, which is the honest answer
             for "this was set by mistake". A lapsed one is left alone — its note
             is the only thing that answers "was this deliberate" later. */
          <button onClick={onClear} className="text-xs font-semibold px-3 py-2 rounded-lg"
            style={{ border: `1px solid ${C.line}`, color: C.red }}>Remove it</button>
        )}
      </div>
    </div>
  );
}

/* ⚠️ THE DEFAULT `user` IS A GATE, NOT A LABEL — the third file in this repo
   with that shape. A caller that forgets the prop was judged as a real person
   and admitted. Empty fails closed. */
export default function LeadershipDev({ user = { name: "" } }) {
  // Roster is DERIVED from HR Console — team list + role overrides + latest eval
  // date, all keyed by real HR person IDs. No parallel LD roster to maintain.
  const [roster, setRoster] = useState([]);
  /* Evaluation opt-outs, { [personId]: { reason, note, until, by, at } }.
     ⚠️ A FAILED READ MUST NOT LOOK LIKE 'nobody is exempt', because the next
     save would write {} over the real map and every deferral Bri has set would
     silently come back as overdue. The ref refuses writes until a clean read,
     the same shape usePersisted uses in HR Console. */
  const [optOuts, setOptOuts] = useState({});
  const [optFor, setOptFor] = useState(null);   // the person whose exemption is open
  const optOkRef = useRef(true);
  const todayIso = TODAY_ISO;
  const [rosterHydrated, setRosterHydrated] = useState(false);
  const [coaching, setCoaching] = useState(seedCoaching);
  const [selected, setSelected] = useState(null);
  // Coaching-log storage health for the OPEN drawer. coachOkRef: the stored
  // history loaded clean, so appends are allowed. coachErr: "load" (history
  // unreadable — logging refused) or "save" (a log did not store; draft kept).
  const coachOkRef = useRef(false);
  const [coachErr, setCoachErr] = useState(null);
  const [filter, setFilter] = useState("all");
  const [draft, setDraft] = useState(null);
  const [pipeline, setPipeline] = useState(seedPipeline);
  // ok:false = the pipeline read FAILED (not "never edited") — see writePipeline.
  const pipeOk = useRef(true);
  const [pipeHydrated, setPipeHydrated] = useState(false);

  const seesNotes = canSeeNotes(user);
  const editsRoles = canEditRoles(user);

  // Build the roster from HR Console on mount:
  //   loadHRTeam()      → live team (seed + anyone added since)
  //   gcfcr-hr-roles    → Bri's role edits (override the seed role)
  //   gcfcr-hr-evals    → latest eval date per person (the 6mo/3mo flags)
  //   gcfcr-hr-info     → hireDate (fallback basis) + term detection
  //   gcfcr-hr-status   → drop terminated people
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [team, roles, evals, info, status, optR, evalTasks] = await Promise.all([
          loadHRTeam(),
          kvGet(HR_ROLES_KEY).catch(() => null),
          kvGet(HR_EVALS_KEY).catch(() => null),
          kvGet(HR_INFO_KEY).catch(() => null),
          kvGet(HR_STATUS_KEY).catch(() => null),
          // Result-style: kvGet returns null for a dropped read AND for an empty
          // map, and those two must not mean the same thing here.
          kvGetResult(OPT_KEY).catch(() => ({ ok: false, value: null })),
          /* ⚠️ READ ONLY. HR Console owns every write to this key, the same rule
             as the four above it. A failed read means no 90-day badges for one
             load, never a badge that is wrong. */
          kvGet(HR_EVAL_TASK_KEY).catch(() => null),
        ]);
        optOkRef.current = !!(optR && optR.ok);
        if (alive) setOptOuts((optR && optR.ok && optR.value && typeof optR.value === "object") ? optR.value : {});
        const R = roles || {}, E = evals || {}, I = info || {}, S = status || {};
        const built = (Array.isArray(team) ? team : [])
          .filter((m) => (S[m.id] ?? "current") !== "terminated")
          .map((m) => {
            const lastMs = latestEvalMs(E[m.id]);
            const lastEval = lastMs != null
              ? new Date(lastMs).toISOString().slice(0, 10)
              : null;
            return {
              id: m.id,
              name: m.name,
              role: R[m.id] || m.role || "Team Member",
              area: m.area || null,
              lastEval,                       // ISO date or null — drives eval + coaching flags
              /* The open 90 Day Promotion Review she assigned in HR Console, or
                 null — which is what keeps it "hidden from view" for the ~100
                 people who do not have one. */
              promo: promoTaskFor(evalTasks, m.id),
              hireDate: (I[m.id] || {}).hireDate || null,
            };
          });
        if (alive) setRoster(built);
      } catch {
        if (alive) setRoster([]);
      } finally {
        if (alive) setRosterHydrated(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Role edits write to gcfcr-hr-roles (HR Console's own role store) so the
  // change persists AND HR Console sees it — one source of truth, no ld:roles.
  const setRole = (id, role) => {
    // rosterHydrated was declared for exactly this gate and never wired up.
    if (!rosterHydrated) return;
    const prevRole = ((roster || []).find((p) => p.id === id) || {}).role;
    setRoster((rs) => rs.map((p) => (p.id === id ? { ...p, role } : p)));
    (async () => {
      /* ⚠️ kvGetResult: this is HR Console's own role map, written from a
         second tile. A FAILED read used to arrive as {}, and the write then
         replaced every role override with this single one. No read, no write
         — the edit stays on screen and lands on the next successful save. */
      const r = await kvGetResult(HR_ROLES_KEY);
      if (!r.ok) return;
      const cur = (r.value && typeof r.value === "object") ? r.value : {};
      /* kvSet returns false on a refused write, never throws. Roll the row
         back then — this tile and HR Console must not disagree on a rank. */
      const ok = await kvSet(HR_ROLES_KEY, { ...cur, [id]: role });
      if (ok === false) {
        setRoster((rs) => rs.map((p) => (p.id === id ? { ...p, role: prevRole } : p)));
        window.alert("That role change did not save — check the wifi and try again.");
      }
    })();
  };

  // Pipeline persistence — the funnel is Bri's Rock 2. Edits save to ld:pipeline
  // so the numbers survive a refresh (the rest of this tile is still seed-only).
  // One writer for every pipeline change, so a stage list and its counts can
  // never be saved by two different paths and disagree.
  const pipeWarned = useRef(false); // one alert per failure burst, not per keystroke
  const writePipeline = (mutate) => {
    // A failed pipeline read left the SEED in state; saving any edit then
    // wrote seed counts over Bri's real stage list. The ref below is set by
    // the loader; while false, edits stay on screen and nothing writes.
    if (!pipeOk.current) return;
    // Computed here, not inside the setState updater — the write's boolean
    // has to be checked, and kvSet returns false rather than throw (the old
    // .catch was dead, which is how "the numbers survive a refresh" could
    // silently stop being true). On false the numbers STAY on screen and the
    // next edit retries the whole list.
    const next = mutate(pipeline);
    setPipeline(next);
    kvSet("ld:pipeline", next).then((ok) => {
      if (ok === false) {
        if (!pipeWarned.current) {
          pipeWarned.current = true;
          window.alert("That pipeline change did not save — check the wifi. The numbers are still on screen and the next change retries.");
        }
      } else pipeWarned.current = false;
    });
  };
  const setStageCount = (id, count) =>
    writePipeline((pl) => pl.map((p) => (p.id === id ? { ...p, count: Math.max(0, count) } : p)));
  const renameStage = (id, stage) =>
    writePipeline((pl) => pl.map((p) => (p.id === id ? { ...p, stage } : p)));
  const addStage = () =>
    writePipeline((pl) => [...pl, { id: "st" + Date.now(), stage: "New stage", count: 0 }]);
  const moveStage = (id, d) =>
    writePipeline((pl) => {
      const i = pl.findIndex((p) => p.id === id); const j = i + d;
      if (i < 0 || j < 0 || j >= pl.length) return pl;
      const n = pl.slice(); [n[i], n[j]] = [n[j], n[i]]; return n;
    });
  // ⚠️ Deleting the stage s7 follows stops the scorecard feed. She is told that
  // in the confirm, in those words, rather than discovering a dark row later.
  const delStage = (id) => {
    const p = pipeline.find((x) => x.id === id); if (!p) return;
    const warn = id === PROMO_STAGE_ID
      ? `Delete "${p.stage}"?\n\nThis is the stage that feeds the EOS scorecard "Promotion-ready leaders" number. Deleting it stops that number updating — the scorecard will show its last value and say it is no longer publishing.`
      : `Delete "${p.stage}" and its count of ${p.count}?`;
    if (!window.confirm(warn)) return;
    writePipeline((pl) => pl.filter((x) => x.id !== id));
  };

  // Load the saved pipeline once; fall back to the seed so the funnel never blanks.
  //
  // ⚠️ DO NOT go back to `setPipeline(saved)`. That replaced the seed WHOLESALE,
  // so when the stages were renamed on 7/20 (Team Leads → TLs In Progress,
  // Director-ready → ADs In Progress) the KV array kept the OLD names, the
  // "ADs In Progress" lookup below missed, and the tile published a false 0 into
  // the EOS scorecard on every load — a red on Bri's row for a stage that had
  // simply been renamed. seedPipeline is the authority on WHICH stages exist and
  // in what order; KV only carries the COUNTS. A renamed or dropped stage now
  // falls out harmlessly and its replacement keeps the seed count until Bri
  // steps it. (One-time cost of the rename: the old Director-ready count is not
  // carried over — Bri re-enters ADs In Progress once.)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const savedR = await kvGetResult("ld:pipeline");
        if (!savedR.ok) { pipeOk.current = false; return; }
        const saved = savedR.value;
        if (alive && Array.isArray(saved) && saved.length) {
          // A record with ids is Bri's own stage list — her list, her order, her
          // names, used as-is. Only a LEGACY record (no ids) still merges into
          // the seed by label, which is the shape that survived the 7/20 rename.
          const hasIds = saved.every((p) => p && p.id);
          if (hasIds) {
            setPipeline(saved.map((p) => ({ ...p, count: Number(p.count) || 0 })));
          } else {
            const byStage = new Map(
              saved.filter((p) => p && p.stage).map((p) => [p.stage, Number(p.count) || 0])
            );
            setPipeline(
              seedPipeline.map((p) =>
                byStage.has(p.stage) ? { ...p, count: byStage.get(p.stage) } : p
              )
            );
          }
        }
      } catch { /* keep seed */ }
      finally { if (alive) setPipeHydrated(true); }
    })();
    return () => { alive = false; };
  }, []);

  // Publish the promotion-ready count (ADs In Progress stage) to the EOS
  // scorecard feed EOSTile reads. Read-merge-write: touches only s7. Goal >= 6.
  // (Bri confirmed Jul 20: this metric now counts "ADs In Progress.")
  // NULL means "no such stage," which is NOT the same as a count of zero. The
  // old version returned 0 for both and the publish effect wrote that 0 to the
  // EOS board as fact. An unknown must stay silent — EOSTile falls back to its
  // own seed and renders the row as "not publishing yet," which is the truth.
  const promotionReady = useMemo(() => {
    const row = pipeline.find((p) => p.id === PROMO_STAGE_ID);
    return row ? Number(row.count) || 0 : null;
  }, [pipeline]);
  const promoStage = pipeline.find((p) => p.id === PROMO_STAGE_ID) || null;
  useEffect(() => {
    if (!pipeHydrated || promotionReady == null) return;
    let cancelled = false;
    (async () => {
      try {
        // Quarter is DERIVED, not hardcoded. EOSTile reads
        // eos:scorecard:${eosPeriod()} — a frozen "2026-Q3" here meant s7 went
        // dark on 10/1 while this file kept writing to a quarter nobody read.
        const key = `eos:scorecard:${eosPeriod()}`;
        // publishSharedRows: a FAILED read publishes nothing, instead of
        // arriving here as {} and wiping every other tool's rows.
        if (!cancelled) await publishSharedRows(key, { s7: { actual: String(promotionReady), goal: "≥ 6", hit: promotionReady >= 6 } });
      } catch { /* best-effort feed */ }
    })();
    return () => { cancelled = true; };
  }, [promotionReady, pipeHydrated]);

  /* ═══ SKILLS CHECKLIST PROGRESS ══════════════════════════════════════════
     Bri, Jul 28 2026: "I would like to be able to view their progress live in
     my Leadership Development tile to avoid tile hopping back and forth."

     ⚠️ ONE READ PER VISIBLE PERSON, NOT PER ROSTER. The roster runs past a
     hundred; fetching every record on mount would fire a hundred requests to
     draw a badge most of them don't need. It loads for the filtered list only,
     and skips anyone already loaded.
     ⚠️ TOTALS COME FROM THE LIVE CARDS, NOT A HARDCODED COUNT. Bri edits these
     — a fixed "of 7" would start lying the first time she adds a skill.
     ⚠️ FAILS QUIET. A person whose record can't be read shows no badge rather
     than a zero: "hasn't started" and "couldn't load" must not look alike. */
  const [skillsProg, setSkillsProg] = useState({});
  const skillTotals = useMemo(() => {
    const out = {};
    for (const card of CHECKLIST_CARDS) {
      for (const w of card.weeks || []) out[w.id] = (w.skills || []).length;
    }
    return out;
  }, []);

  const sorted = useMemo(() => {
    const withStatus = roster.map((p) => ({ ...p, ev: evalStatus(p, optOuts[p.id], todayIso), co: coachingStatus(p),
      pr: promoStatus(p.promo, todayIso) }));
    const filtered =
      filter === "due"
        /* ⚠️ THE SAME TEST THE COUNT USES. A pill reading "Eval due (9)" over a
           list of eight is the kind of disagreement nobody reports and everybody
           stops trusting — the note on dueCount says so, and adding the
           promotion review to one and not the other is exactly how that starts. */
        ? withStatus.filter((p) => (p.ev && p.ev.days <= 30) || (p.pr && p.pr.days <= 30))
        : filter === "all"
        ? withStatus
        : withStatus.filter((p) => p.role === filter);
    // Bri, Jul 24: "Can I have the list of people alphabetized by first name?"
    // ⚠️ THIS REPLACES AN URGENCY SORT — overdue evaluations used to float to
    // the top. That signal is NOT lost: every row still carries its overdue /
    // due-in badge, and the "Due soon" filter pill above gives the old view on
    // demand. Predictable ordering beats a list that reshuffles itself as dates
    // pass when you are trying to find one person among a hundred.
    // Roster names are first-name-first, so a plain locale compare IS first-name
    // order; numeric:true keeps any "Sam 2" style suffix sane.
    return filtered.sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base", numeric: true }));
  }, [roster, filter]);

  useEffect(() => {
    let live = true;
    (async () => {
      const missing = sorted.filter((p) => p.name && skillsProg[p.name] === undefined).slice(0, 40);
      if (!missing.length) return;
      const found = {};
      for (const p of missing) {
        try {
          const r = await kvGet(`gcfcr-skills-${slugName(p.name)}-v1`);
          found[p.name] = r && r.skills ? r.skills : null;
        } catch { found[p.name] = undefined; }   // leave unknown, retry next pass
      }
      if (live && Object.keys(found).length) setSkillsProg((cur) => ({ ...cur, ...found }));
    })();
    return () => { live = false; };
  }, [sorted]);

  /* ⚠️ THE COUNTS READ THE SAME FUNCTION AND THE SAME RECORD as the badges. A
     header saying "3 overdue" over a list showing two red rows is the kind of
     disagreement nobody reports and everybody stops trusting. */
  /* ★ A 90 DAY PROMOTION REVIEW COUNTS AS AN EVALUATION DUE. Bri, Jul 30: "This
     option can still show up in the 'eval due' filter, it's still an
     evaluation, just a specific type that functions differently."
     ⚠️ EITHER ONE IS ENOUGH, and neither is double counted. Somebody with a
     regular eval due AND a promotion review is one person on this list, not
     two. `evalStatus` returns null for roles with no cadence, so a Team Member
     with a promotion review still lands in the filter — which is the point, she
     promoted them. */
  const evalOwed = (p) => {
    const e = evalStatus(p, optOuts[p.id], todayIso);
    return !!(e && e.days <= 30);
  };
  const promoOwed = (p) => {
    const pr = promoStatus(p.promo, todayIso);
    return !!(pr && pr.days <= 30);
  };
  const dueCount = roster.filter((p) => evalOwed(p) || promoOwed(p)).length;
  const overdueCount = roster.filter((p) => {
    const e = evalStatus(p, optOuts[p.id], todayIso);
    const pr = promoStatus(p.promo, todayIso);
    return !!(e && e.days < 0) || !!(pr && pr.days < 0);
  }).length;

  /* ★ R3, editor-vs-renderer census (Jul 31): coaching logs were STATE-ONLY.
     The header has documented ld:coaching:{personId} since this file was
     born, and nothing ever wrote or read it — Bri typed a log, watched it
     appear, and it was gone on the next reload, invisible to anyone else.
     Now: the drawer loads the person's stored history result-style when it
     opens, and save re-reads immediately before appending (same pattern as
     HR's intake filing) so two people logging the same leader can't erase
     each other. A failed read refuses logging; a refused write keeps the
     draft on screen and says so. */
  useEffect(() => {
    if (!selected) return;
    let live = true;
    const pid = selected.id;
    (async () => {
      const r = await kvGetResult(`ld:coaching:${pid}`);
      if (!live) return;
      coachOkRef.current = r.ok;
      setCoachErr(r.ok ? null : "load");
      if (r.ok) setCoaching((c) => ({ ...c, [pid]: Array.isArray(r.value) ? r.value : [] }));
    })();
    return () => { live = false; };
  }, [selected ? selected.id : null]);

  const saveCoaching = async () => {
    if (!draft || !draft.discussed?.trim() || !selected) return;
    const pid = selected.id;
    if (!coachOkRef.current) { setCoachErr("load"); return; }
    const r = await kvGetResult(`ld:coaching:${pid}`);
    if (!r.ok) { coachOkRef.current = false; setCoachErr("load"); return; }
    const cur = Array.isArray(r.value) ? r.value : [];
    const next = [...cur, { ...draft, id: `c${Date.now()}` }];
    const ok = await kvSet(`ld:coaching:${pid}`, next);
    if (ok === false) { setCoachErr("save"); return; }
    setCoachErr(null);
    setCoaching((c) => ({ ...c, [pid]: next }));
    setDraft(null);
  };

  /* ★ SET OR CLEAR AN EVALUATION OPT-OUT (Bri, Aug 4 2026). See OPT_KEY above.
     ⚠️ RE-READ BEFORE WRITE, like the coaching save below it. This is one map
     for the whole roster, so a blind write of a stale copy would drop a
     deferral somebody else set between this tile loading and Bri saving.
     ⚠️ REFUSES AFTER A FAILED READ rather than writing an empty map over real
     exemptions — and says so, because a save that silently does nothing is the
     failure this file has been bitten by before. */
  const saveOptOut = async (pid, rec) => {
    if (!optOkRef.current) { window.alert("That did not save. The exemptions never loaded, and saving now would clear the ones already set. Reopen the tile and try again."); return; }
    const r = await kvGetResult(OPT_KEY);
    if (!r.ok) { optOkRef.current = false; window.alert("That did not save — the exemptions could not be re-read, and saving blind would erase other people's. Check the connection and try again."); return; }
    const cur = (r.value && typeof r.value === "object") ? r.value : {};
    const next = { ...cur };
    if (rec) next[pid] = rec; else delete next[pid];
    const ok = await kvSet(OPT_KEY, next);
    if (ok === false) { window.alert("That did not save. Try again."); return; }
    setOptOuts(next);
  };

  const person = selected ? roster.find((p) => p.id === selected.id) : null;
  // Bri, Jul 24: "May I also have these coaching logs drop down under each
  // individual rather than having it go to the bottom of the screen?"
  // The drawer used to be its own <section> AFTER the roster, so opening
  // someone threw you to the bottom of the page and you lost your place in a
  // hundred-person list. Same JSX, same closures — it is just CALLED from
  // inside the roster row now. A plain function, not a hook, so it is safe to
  // define here below the hooks.
  const renderDrawer = () => (
            <Card style={{ borderColor: C.ink, borderWidth: 2 }}>
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <h2 className="ld-display font-bold text-lg">{person.name}</h2>
                  <div className="text-xs" style={{ color: C.sub }}>{person.role}{person.area ? ` · ${person.area}` : ""}</div>
                </div>
                <button onClick={() => { setSelected(null); setDraft(null); }} className="text-xs px-2 py-1 rounded" style={{ color: C.sub, border: `1px solid ${C.line}` }}>
                  Close
                </button>
              </div>

              <div className="ld-display text-xs font-bold uppercase tracking-wider mb-2" style={{ color: C.sub }}>
                Coaching history
              </div>

              {coachErr === "load" && (
                <div className="text-sm mb-3 rounded-lg p-3" style={{ backgroundColor: "#FFFBEB", border: "1.5px solid #F59E0B", color: "#92400E", fontWeight: 600 }}>
                  This history did not load, so logging is off — a save now could
                  erase what is really stored. Close and reopen this person to retry.
                </div>
              )}
              {coachErr === "save" && (
                <div className="text-sm mb-3 rounded-lg p-3" style={{ backgroundColor: "#FEF2F2", border: "1.5px solid #DC2626", color: "#991B1B", fontWeight: 600 }}>
                  That log did not save — everything typed is still below. Hit Save again.
                </div>
              )}
              {records.length === 0 && coachErr !== "load" && (
                <div className="text-sm mb-3" style={{ color: C.sub }}>No coaching records yet.</div>
              )}

              <div className="space-y-3 mb-4">
                {records.map((r) => (
                  <div key={r.id} className="rounded-lg p-3" style={{ backgroundColor: C.paper }}>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="ld-mono text-xs font-semibold">{fmt(r.date)}</span>
                      {r.followUp && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: C.amber, backgroundColor: C.amberSoft }}>
                          follow up {fmt(r.followUp)}
                        </span>
                      )}
                    </div>
                    <Field label="Areas discussed" value={r.discussed} />
                    <Field label="Areas of opportunity" value={r.opportunity} />
                    <Field label="Action items" value={r.actions} />
                    {seesNotes && r.notes && (
                      <div className="mt-2 pt-2 rounded p-2" style={{ borderTop: `1px dashed ${C.line}`, backgroundColor: C.blueSoft }}>
                        <div className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{ color: C.blue }}>
                          Private notes · not visible to {person.name.split(" ")[0]}
                        </div>
                        <div className="text-sm">{r.notes}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {seesNotes && (
                <>
                  {!draft ? (
                    <button
                      /* UTC named tomorrow after 8pm Eastern, and coaching
                         conversations happen in the evening. */
                      onClick={() => setDraft({ date: TODAY.toLocaleDateString("en-CA"), discussed: "", opportunity: "", actions: "", notes: "", followUp: "" })}
                      className="text-sm font-semibold px-3 py-2 rounded-lg text-white"
                      style={{ backgroundColor: C.ink }}
                    >
                      + Log coaching
                    </button>
                  ) : (
                    <div className="space-y-2">
                      {[
                        ["discussed", "Areas discussed"],
                        ["opportunity", "Areas of opportunity"],
                        ["actions", "Action items"],
                      ].map(([k, label]) => (
                        <textarea
                          key={k}
                          value={draft[k]}
                          onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                          placeholder={label}
                          rows={2}
                          className="w-full text-sm px-3 py-2 rounded-lg outline-none"
                          style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper }}
                        />
                      ))}
                      <textarea
                        value={draft.notes}
                        onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                        placeholder="Private notes — leadership only"
                        rows={2}
                        className="w-full text-sm px-3 py-2 rounded-lg outline-none"
                        style={{ border: `1px solid ${C.blue}`, backgroundColor: C.blueSoft }}
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="text-xs" style={{ color: C.sub }}>Follow up</label>
                        <input
                          type="date"
                          value={draft.followUp}
                          onChange={(e) => setDraft({ ...draft, followUp: e.target.value })}
                          className="text-sm px-2 py-1 rounded-lg"
                          style={{ border: `1px solid ${C.line}` }}
                        />
                        <button onClick={saveCoaching} className="text-sm font-semibold px-3 py-2 rounded-lg text-white ml-auto" style={{ backgroundColor: C.red }}>
                          Save
                        </button>
                        <button onClick={() => setDraft(null)} className="text-sm px-3 py-2 rounded-lg" style={{ color: C.sub, border: `1px solid ${C.line}` }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>
  );
  const records = selected ? coaching[selected.id] || [] : [];

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.paper, color: C.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .ld-display { font-family: 'Archivo', sans-serif; }
        .ld-body { font-family: 'Inter', sans-serif; }
        .ld-mono { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      <div className="max-w-4xl mx-auto px-4 py-6 ld-body">
        <header className="mb-4" style={{ margin: "-1.5rem -1rem 1rem", background: "linear-gradient(120deg,#9B3B6E 0%,#57194A 55%)", color: "#fff", padding: "18px 16px 16px" }}>
          <div className="text-xs font-semibold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.78)" }}>
            {STORE.appName} · People &amp; Team
          </div>
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <h1 className="ld-display text-2xl" style={{ fontWeight: 800, color: "#fff" }}>
              Leadership Development
            </h1>
            <div className="ld-mono text-sm" style={{ color: overdueCount ? "#FFC9D6" : "rgba(255,255,255,0.8)" }}>
              {overdueCount} overdue · {dueCount} due in 30d
            </div>
          </div>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.75)" }}>
            Roster from HR Console · evaluations every 6 months for JT, ST, TL, AD
          </p>
        </header>

        {/* Permission banner */}
        <div className="rounded-xl px-4 py-2.5 mb-4 text-xs" style={{ backgroundColor: seesNotes ? C.blueSoft : C.paper, border: `1px solid ${seesNotes ? C.blue : C.line}`, color: seesNotes ? C.blue : C.sub }}>
          {/* ⚠️ THE ONE UNGUARDED READ IN THE FILE, and the old default person
              was what hid it: every other site here already asks
              `user && user.name`. With the fallback gone a caller that omits
              `user` would have taken this whole screen down on a banner. */}
          Signed in as <b>{(user && user.name) || "someone we could not identify"}</b> —{" "}
          {seesNotes
            ? "you can edit roles and see private coaching notes."
            : "you can view your own coaching. Private notes and role editing are restricted."}
        </div>

        {/* Pipeline funnel — Bri's Rock 2 */}
        <section className="mb-5">
          <div className="ld-display text-xs font-bold uppercase tracking-widest mb-2" style={{ color: C.sub }}>
            Pipeline — Team Member to AD
          </div>
          <Card>
            <div className="space-y-2">
              {pipeline.map((p, pi) => {
                const max = Math.max(...pipeline.map((x) => x.count), 1);
                const isReady = p.id === PROMO_STAGE_ID;
                return (
                  <div key={p.id} className="flex items-center gap-3 text-sm">
                    {editsRoles ? (
                      // ⚠️ value captured BEFORE the updater — a synthetic event
                      // read inside setState is null by the time it runs.
                      <input value={p.stage || ""}
                        onChange={(e) => { const v = e.target.value; renameStage(p.id, v); }}
                        className="w-32 sm:w-36 shrink-0 text-xs px-1.5 py-1 rounded"
                        style={{ border: `1px solid ${isReady ? C.red : C.line}`, backgroundColor: C.paper, color: C.ink }}
                        aria-label={`${p.stage} name`} />
                    ) : (
                      <span className="w-32 sm:w-36 shrink-0 text-xs" style={{ color: C.sub }}>{p.stage}</span>
                    )}
                    <div className="flex-1 h-5 rounded" style={{ backgroundColor: C.paper }}>
                      <div className="h-5 rounded" style={{ width: `${Math.max(6, (p.count / max) * 100)}%`, backgroundColor: isReady ? C.red : C.blue }} />
                    </div>
                    {editsRoles ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setStageCount(p.id, p.count - 1)} className="ld-mono text-xs w-5 h-5 rounded" style={{ border: `1px solid ${C.line}`, color: C.sub }} aria-label={`Decrease ${p.stage}`}>−</button>
                        <input
                          type="number"
                          value={p.count}
                          onChange={(e) => { const v = parseInt(e.target.value, 10) || 0; setStageCount(p.id, v); }}
                          className="ld-mono font-semibold w-11 text-center text-sm rounded"
                          style={{ border: `1px solid ${isReady ? C.red : C.line}`, backgroundColor: C.paper }}
                          aria-label={`${p.stage} count`}
                        />
                        <button onClick={() => setStageCount(p.id, p.count + 1)} className="ld-mono text-xs w-5 h-5 rounded" style={{ border: `1px solid ${C.line}`, color: C.sub }} aria-label={`Increase ${p.stage}`}>+</button>
                        <button onClick={() => moveStage(p.id, -1)} disabled={pi === 0} className="ld-mono text-xs w-5 h-5 rounded" style={{ border: `1px solid ${C.line}`, color: C.sub, opacity: pi === 0 ? .35 : 1 }} aria-label={`Move ${p.stage} up`}>▲</button>
                        <button onClick={() => moveStage(p.id, 1)} disabled={pi === pipeline.length - 1} className="ld-mono text-xs w-5 h-5 rounded" style={{ border: `1px solid ${C.line}`, color: C.sub, opacity: pi === pipeline.length - 1 ? .35 : 1 }} aria-label={`Move ${p.stage} down`}>▼</button>
                        <button onClick={() => delStage(p.id)} className="ld-mono text-xs w-5 h-5 rounded" style={{ border: `1px solid ${C.line}`, color: C.red }} aria-label={`Delete ${p.stage}`}>×</button>
                      </div>
                    ) : (
                      <span className="ld-mono font-semibold w-8 text-right">{p.count}</span>
                    )}
                  </div>
                );
              })}
            </div>
            {editsRoles && (
              <button onClick={addStage} className="text-xs font-semibold mt-3 px-2.5 py-1.5 rounded"
                style={{ border: `1px solid ${C.line}`, color: C.ink }}>+ Add a stage</button>
            )}
            {/* Names the stage as it is CURRENTLY called, so this line stays true
                after she renames it. A hardcoded "ADs In Progress" here would go
                stale the first time she used the rename box. */}
            <div className="text-xs mt-3" style={{ color: C.sub }}>
              {promoStage
                ? (editsRoles
                    ? `"${promoStage.stage}" (outlined in red) feeds the EOS scorecard "Promotion-ready leaders" number, goal ≥ 6. Rename it, move it, or change the count — the scorecard follows the stage itself, not its name. Everything saves automatically.`
                    : `"${promoStage.stage}" feeds the EOS scorecard "Promotion-ready leaders" number.`)
                : "The stage that fed the EOS scorecard \"Promotion-ready leaders\" number has been deleted, so that number is no longer updating."}
            </div>
          </Card>
        </section>

        {/* Filters */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          {/* ★ TEAM MEMBER IS A FILTER AGAIN (Bri, Jul 28 2026: "I have options to
              filter Evals due, ADs, TLs, Senior Trainers, and Junior Trainers —
              may I also have a function to filter only Team Members?").
              It was excluded here, not missing from the data — the row filter
              below already matches on `p.role`, so restoring the pill is the
              whole change.
              ⚠️ DIRECTOR STAYS OUT deliberately: there are four of them and they
              are not who this roster is for. Team Members are the largest group
              and the pool everything else promotes FROM, which is exactly why
              she wants to see them on their own. */}
          {[["all", "All"], ["due", `Eval due (${dueCount})`], ...ROLES.map((r) => [r, r])].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className="text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap"
              style={
                filter === key
                  ? { backgroundColor: C.ink, color: "#fff" }
                  : { backgroundColor: C.card, color: C.sub, border: `1px solid ${C.line}` }
              }
            >
              {label}
            </button>
          ))}
        </div>

        {/* ═══ THE EXEMPTION PANEL ════════════════════════════════════════
            Her ask in three parts: a reason from a short list, a note she can
            edit, and a new due date. All three are here and the date is
            required — an exemption with no end is how somebody quietly never
            gets evaluated again. */}
        {optFor && editsRoles && (
          <OptOutPanel
            person={optFor}
            current={optOuts[optFor.id] || null}
            todayIso={todayIso}
            by={user && user.name}
            onSave={async (rec) => { await saveOptOut(optFor.id, rec); setOptFor(null); }}
            onClear={async () => { await saveOptOut(optFor.id, null); setOptFor(null); }}
            onClose={() => setOptFor(null)}
          />
        )}

        {/* Roster */}
        <section className="mb-6">
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: C.card, border: `1px solid ${C.line}` }}>
            {sorted.map((p, i) => (
              <div key={p.id} className="px-4 py-3" style={{ borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <button onClick={() => { setSelected(p); setDraft(null); }} className="text-left flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{p.name}</div>
                    <div className="text-xs" style={{ color: C.sub }}>
                      {p.area ? `${p.area} · ` : ""}last eval {fmt(p.lastEval)}
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    {(() => {
                      const rec = skillsProg[p.name];
                      if (!rec) return null;                    // unknown or nothing ticked
                      const done = Object.values(rec).filter(Boolean).length;
                      const total = Object.values(skillTotals).reduce((a, b) => a + b, 0);
                      if (!done) return null;
                      return (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full ld-mono"
                          style={{ color: "#6B21A8", backgroundColor: "#F3EEF9" }} title="Skills checklist">
                          {done}/{total} skills
                        </span>
                      );
                    })()}
                    {p.co && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full ld-mono" style={{ color: p.co.fg, backgroundColor: p.co.bg }}>
                        {p.co.label}
                      </span>
                    )}
                    {/* ★ HER 90 DAY PROMOTION REVIEW, beside the name, with what
                        it is and the date she set. Renders ONLY when she has one
                        open for that person, which is her "otherwise I want the
                        option hidden from view". It clears itself the moment the
                        evaluation is approved in HR Console. */}
                    {p.pr && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full ld-mono"
                        style={{ color: p.pr.fg, backgroundColor: p.pr.bg }}
                        title={`Assigned to ${(p.promo && p.promo.assigneeName) || "—"} · clears when the evaluation is approved`}>
                        {p.pr.label}
                      </span>
                    )}
                    {/* ★ THE BADGE IS THE CONTROL for anyone who may edit — her
                        ask is an option ON the alert, and a separate button
                        elsewhere would be a second place to look. Everyone else
                        still sees a plain badge. */}
                    {p.ev && editsRoles && (
                      <button onClick={() => setOptFor(p)}
                        title={optOuts[p.id] && optOuts[p.id].note ? optOuts[p.id].note : "Set an exemption"}
                        className="text-xs font-semibold px-2 py-0.5 rounded-full ld-mono"
                        style={{ color: p.ev.fg, backgroundColor: p.ev.bg, border: `1px solid ${p.ev.exempt ? C.line : "transparent"}` }}>
                        {p.ev.label}{p.ev.exempt ? " ✎" : ""}
                      </button>
                    )}
                    {p.ev && !editsRoles && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full ld-mono" style={{ color: p.ev.fg, backgroundColor: p.ev.bg }}>
                        {p.ev.label}
                      </span>
                    )}
                    {editsRoles ? (
                      <select
                        value={p.role}
                        onChange={(e) => setRole(p.id, e.target.value)}
                        className="text-xs px-2 py-1 rounded-lg"
                        style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper }}
                        aria-label={`Role for ${p.name}`}
                      >
                        {rolesForSelect(p.role).map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs" style={{ color: C.sub }}>{p.role}</span>
                    )}
                  </div>
                </div>
                {person && person.id === p.id && renderDrawer()}
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div className="mb-1.5">
      <div className="text-xs font-semibold" style={{ color: C.sub }}>{label}</div>
      <div className="text-sm leading-snug">{value}</div>
    </div>
  );
}
