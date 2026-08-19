/* inputRegistry.js — the Gate City Hub input register.
 *
 * ⚠️ IMPORTS: boardOwner.js ONLY (which itself imports only nameMatch.js).
 * All three are dependency-free leaves with no React, no store.js and no
 * `import.meta.env`, so worker.js can import any of them without the module
 * throwing at load and taking every scheduled job down with it.
 *
 * ONE list of every manual input the Hub depends on: what it is, who owns it,
 * how often it's due, and how to tell whether it's actually been entered.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * App.jsx's Today block used to compute staleness inline for eight signals and
 * knew nothing about the other twenty-odd. Anything not in that list could go
 * stale silently, and the green "all clear" line claimed a whole store it could
 * only speak for a fraction of. Every input now lives here instead, so adding
 * one later is a single entry in INPUTS rather than an edit in three places.
 *
 * THE RULE THAT KEEPS IT HONEST: a row's state is DERIVED from whether the data
 * is in the key. There is deliberately no "mark done" tick anywhere in here — a
 * checkbox would make the register itself another thing to keep up to date.
 *
 * NOT-TRACKED IS A FIRST-CLASS STATE. An input with no verified reader renders
 * grey with the reason, never red. A panel that is 60% grey on day one is
 * honest; one that is 60% red gets ignored by Tuesday.
 */

import { boardShift, ownersForInput, isOwner as isBoardOwner, boardKey, mondayKeyOf as boardMondayKey, boardHealth } from "./boardOwner.js";
/* Monthly AHA. A leaf that imports nothing, so pulling it in here cannot drag
   anything into the worker bundle. Same rule boardOwner.js follows. */
import { AHA_MONTHLY_KEY, ahaStatus } from "./ahaMonthly.js";
import { storeCfg } from "./storeConfig.js"; // the paper goal, read at use time so a saved goal takes effect
import { STORE_CONFIG } from "./storeConfig.js";


/* ── Owner model ───────────────────────────────────────────────────
 * Owners are ROLES, never names. Hardcoding people into automation is the bug
 * this store has already paid for twice (Tyler in the waste job, the mileage
 * name list): terminating someone in HR does not touch a hardcoded string, so
 * the row keeps pointing at a person who left. A role resolves through HR at
 * runtime, so when a seat changes hands its rows follow.
 *
 *   role   — whoever currently holds this HR role
 *   shift  — whoever led that day (per-date resolver)
 *   group  — anyone at or above a tier; shared, no single name
 *   all    — the register itself, i.e. Matt
 */
export const OWNER = {
  ED:      { kind: "role",  role: "Executive Director",              label: "Matt" },
  HR:      { kind: "role",  role: "Human Resources",                 label: "HR" },
  PAY:     { kind: "role",  role: "Payroll",                         label: "Payroll" },
  LDD:     { kind: "role",  role: "Leadership Development Director", label: "Leadership Dev" },
  OPS:     { kind: "role",  role: "Director",                        label: "Operations" },
  SHIFT:   { kind: "shift",                                          label: "Shift leader on duty" },
  LEADERS: { kind: "group", minTier: 2,                              label: "Tier 2 and up" },
};

/* ★ Jul 27 2026 — THE FIRST NAMED-PERSON OWNER.
 * Every owner above resolves on a ROLE, a SHIFT or a TIER, and none of those
 * can name one specialist: "Assistant Director" would light the row up for all
 * nine ADs, and OWNER.OPS already over-routes to three Directors.
 * The specialist model needs one of these per specialist, so it is a factory,
 * not another constant. Matching is delegated to boardOwner's isOwner so the
 * name forms (full / first / first + last initial) stay in ONE place and can't
 * drift — the same trap that broke the food safety rota for days.
 */
/* ⚠️⚠️ `alsoKnownAs` EXISTS BECAUSE A NAME IS NOT A KEY (Aug 7 2026 sweep).
   🐛 Lupe's two food-quality rows matched NOBODY. ownsRow routes a person
   owner through isOwner, which requires the FIRST NAMES to be equal after
   normalising. The register said "Lupe Villanueva"; the roster says
   "Guadalupe". normName("guadalupe") !== normName("lupe"),
   so the only person the rows were written for never saw them, and the late
   push (inputPush → planPush → forPerson → ownsRow) never fired either. Both
   rows surfaced only for Matt through the overseer short-circuit, which reads
   as "everything is waiting on me" — the exact failure the resolvedOwners work
   was done to fix.
   ⚠️ The Aug 4 note further down claims this was already fixed ("WHO THIS HID:
   Lupe never saw her two food-quality rows"). That fix corrected the array vs
   object SHAPE. The spelling was still wrong.
   ⚠️ THE REAL ANSWER IS AN ID, and orgSeats.js already does it — same seat,
   `holderId: "tm91"`, with a header saying "Route on the id; never match on
   the name." Threading ids through ownsRow and isOwner is a bigger change than
   belongs in a sweep fix, so this carries every spelling instead and the id
   stays the thing to move to. */
export const person = (name, label, alsoKnownAs) => ({
  kind: "person",
  name,
  names: [name, ...(alsoKnownAs || [])],
  label: label || name,
});
/* Co-ownership — the same person kind carrying several names.
   ⚠️ The note that used to sit here said "ownsRow already hands isBoardOwner an
   ARRAY". That was the bug: isOwner wants `{ names: [...] }` and returns false
   for a bare array, so these rows matched nobody until Jul 31 2026. See ownsRow.
   First use: Facilities, Matt + Brandon (Matt, Jul 30 2026: "i want brandon
   to co-own the facilities tool"). */
export const people = (names, label) => ({ kind: "person", names, label });

/* ★ AN OWNER FROM THE SEAT MAP, NOT FROM A LITERAL.
   Four rows below named this store's people by hand — the food quality owner
   twice, the equipment owner, and the facilities pair — and every one of them
   duplicated a fact that already lives in ownerSeed.js under `owners.seats`.
   Two copies of "who owns food quality" is design rule 8, and the drift is the
   worst kind: this register is what tells somebody a figure is theirs, so a
   stale copy tells the wrong person and stays quiet about the right one.

   ⚠️ IT IS A LOOKUP, NOT A LIST. `seatOwner("quality")` reads the seat at call
   time, so filling a seat in Store Settings fills the register too.
   ⚠️ A SEAT WITH NO HOLDER RETURNS null, WHICH IS A REAL ANSWER — the row has
   no owner rather than a made-up one, and `ownsRow` already treats a null owner
   as "nobody has claimed this", which is true at a store that has not said.
   ⚠️ `alsoKnownAs` SPELLINGS ARE STILL PASSED BY HAND where a person answers to
   more than one name, because the seat map holds one display name and the match
   needs every spelling. A near-miss here fails silently. */
const seatOwner = (seatId) => {
  const seat = (STORE_CONFIG.owners.seats || []).find((x) => x.id === seatId);
  const name = String((seat && seat.holder) || "").trim();
  if (!name) return null;
  /* ⚠️ THE LABEL AND THE SPELLINGS COME FROM THE SEAT TOO, and the first
     version of this took them as arguments — which put "Lupe" and
     "Guadalupe" straight back into this file as literals.
     Passing a name in to avoid hardcoding a name is not a fix. The short label
     is the holder's first name, and `alsoKnownAs` is a field on the seat row
     because a spelling variant belongs with the person, not with one of the
     four rows that happen to mention them. */
  return person(name, name.split(/\s+/)[0], seat.alsoKnownAs || []);
};

/* Several seats co-owning one row. Empty seats drop out, so a pair where only
   one is filled becomes a single owner rather than a half-empty list. */
const seatHolder = (seatId) => {
  const seat = (STORE_CONFIG.owners.seats || []).find((x) => x.id === seatId);
  return String((seat && seat.holder) || "").trim();
};

/* Several people co-owning one row. Empty entries drop out, so a pair where
   only one is known becomes a single owner rather than a half-empty list, and a
   pair where neither is known becomes null — no owner, which is true.
   ⚠️ THE LABEL IS DERIVED, NOT TYPED. It used to read "Matt + Brandon", which
   is two more names in the source and one more thing to forget. */
const coOwn = (names) => {
  const kept = names.map((n) => String(n || "").trim()).filter(Boolean);
  return kept.length ? people(kept, kept.map((n) => n.split(/\s+/)[0]).join(" + ")) : null;
};

/* The operator, who owns rows no seat covers. */
const operatorName = () => String(STORE_CONFIG.owners.operator || "").trim();

/* The seats that see the WHOLE board. Everyone else sees only what they own.
 *
 * ★ Matt, Jul 29 2026: "I want my view as the default dashboard for an ops
 * director." Until now only Executive Director qualified, so a Director opening
 * the register saw the handful of rows they personally own and nothing else —
 * which is not a dashboard, it is a to-do list. The person running operations
 * needs to see what is late across the store, including the rows somebody else
 * owns, because chasing those IS the job.
 *
 * ⚠️ SEEING IS NOT OWNING. This widens what the register DISPLAYS and changes
 * nothing about who a row is addressed to, who gets pushed, or who can open
 * which tool. `ownsRow` is the display filter; the owner field still decides
 * routing. A Director sees the food safety row and still reads "Lizbeth" on it.
 *
 * ⚠️ THIS SEAT EXISTS FOR THE SECOND STORE. Matt, Jul 29: "the ops director is
 * for a second store." Store two will be run by a Director, not by an Executive
 * Director, and the register has to be their dashboard on day one — nobody
 * should have to discover that the full view is gated on a title nobody at that
 * store holds. Getting it right in the seat rather than in a name is the whole
 * point of building for two stores.
 *
 * ⚠️ SIDE EFFECT AT GATE CITY, WORTH KNOWING: three people hold "Director"
 * here today — Daisy, Brandon and Kyleeka — so three dashboards widen from
 * "my rows" to "the whole store". That is defensible for a director and it is
 * the same thing store two needs, but it IS a change to three real screens. If
 * it should be one named person instead, use the `person()` factory above
 * rather than inventing a fourth rank rule.
 *
 * ⚠️ A LIST, NOT A RANK THRESHOLD, ON PURPOSE. A threshold would sweep in every
 * future title that happens to outrank it — the exact trap HR_CONSOLE_NAMES
 * exists to avoid in HRConsole. Adding a seat here should be a decision, not a
 * side effect of a promotion. */
const OVERSEER_ROLES = ["Executive Director", "Director"];
export const isOverseer = (person) => OVERSEER_ROLES.includes(String(person?.role || ""));

/* Does this person own this row?
 *
 * ✅ Jul 26 2026 — THE SHIFT DEAD-END IS CLOSED. A "shift" owner used to return
 * false for everyone but the overseer, because the register had no way to know
 * who led a given day. boardOwner.js now reads that off the Daily Setup board,
 * buildRows attaches the resolved names to the row as `resolvedOwners`, and
 * this compares the signed-in person against them.
 *
 * The old caution still holds where it should: if the board is missing, the day
 * is unstaffed, or the cell carries a marker instead of a name, `resolvedOwners`
 * is absent and the row falls back to the overseer exactly as before. It never
 * widens to "every leader" — that would put one person's cleaning row in front
 * of fifteen, which breaks "everyone sees their own and only theirs" far worse
 * than showing it to nobody. Under-routing is recoverable; spraying is what
 * makes people stop reading.
 */
export function ownsRow(input, person, tier) {
  if (!input || !person) return false;
  if (isOverseer(person)) return true;
  const o = input.owner;
  if (!o) return false;                       // unowned falls to the overseer only
  if (o.kind === "role")  return String(person.role || "") === o.role;
  if (o.kind === "group") return tier >= (o.minTier || 2);
  /* 🐛 THIS PASSED A BARE ARRAY AND SILENTLY MATCHED NOBODY, EVER.
     `isOwner(personName, owners)` in boardOwner.js reads `owners.names` off
     its second argument and returns false when it is missing. An array has no
     `.names`, so every `person(...)` and `people(...)` row returned false for
     the person who actually owns it. The line below it gets this right —
     `input.resolvedOwners` is `{names, label}` — and so does worker.js, which
     passes `{ names: [nm] }`. The object form is the real contract.
     WHO THIS HID: Lupe never saw her two food-quality rows and Brandon never
     saw the Facilities punch list. Both surfaced only for Matt, through the
     isOverseer short-circuit above — which reads as "everything is waiting on
     me", the exact failure the resolvedOwners work was done to fix. It also
     silenced their late push, since inputPush routes on this same function. */
  /* ⚠️ NO AMBIGUITY SET ON THIS LINE, DELIBERATELY. These names are written by
     hand — `person("Lupe Villanueva", …)` and its alsoKnownAs spellings — so
     they are a decision somebody made, not a cell a rota generated. Applying a
     uniqueness rule here would silently un-match a curated name, which is
     exactly the bug documented above that hid Lupe's two rows for weeks. */
  if (o.kind === "person") return isBoardOwner(person.name, { names: o.names || [o.name] });
  /* ★ THE SHIFT PATH READS RAW BOARD CELLS, so it is the one that can name the
     wrong person. `resolvedOwners` now carries `sharedFirst` — who else on that
     day's board answers to the same first name — so a bare "Lizbeth" stops
     resolving to BOTH Lizbeths. That was one row badged "Yours" for two people,
     neither able to tell whose it was, plus a late push to an Assistant
     Director who never worked the shift.
     ⚠️ Absent on an older row shape → undefined → isOwner behaves as it always
     has. Nothing here can start refusing because of a missing field. */
  if (o.kind === "shift") {
    return isBoardOwner(person.name, input.resolvedOwners,
      input.resolvedOwners && input.resolvedOwners.sharedFirst);
  }
  return false;
}

/* ── Cadence helpers ──────────────────────────────────────────────
 * Everything here obeys closed-days-only: the store is shut Sundays and a day
 * that hasn't closed yet legitimately has no data. Nothing may flag the open
 * day, and nothing may flag a Sunday.
 */
const pad = (n) => String(n).padStart(2, "0");

/* Dates render as "Jul 24", never as a raw ISO string — a register row is read
 * at a glance and 2026-07-24 does not read at a glance. Parsed at NOON so a
 * timezone offset can never roll the label back a day. */
export const shortDate = (iso) => {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d) ? String(iso) : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
export const ymOf = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/* ISO week key — MUST match DailyCleaning.jsx's getWeekKey byte for byte,
 * because it is how that tile names its rows. If the two ever drift, this
 * register reads keys the cleaning list never wrote and reports a clean week as
 * missing, every week, forever. */
export function weekKeyOf(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad(weekNo)}`;
}

/* Monday-of-week key, "YYYY-MM-DD" — MUST match ShiftLeaderScorecard.jsx's
 * mondayOf() + fmtKey() byte for byte, because that pair is how the paper pill
 * names its weeks. Note the Sunday case: day 0 walks BACK six days, so Sunday
 * belongs to the week that began the previous Monday. Get that wrong and every
 * Sunday reads a week the scorecard never wrote. Same trap as weekKeyOf above,
 * different tile. LOCAL dates on purpose — the scorecard writes local, and a
 * UTC key would slide a day for half the year. */
/* Previous BUSINESS day, ISO. The store is shut Sundays, so Monday looks back
 * to Saturday. Mirrors the worker's prevBizDayET; local dates because the
 * scorecard writes local. */
export function prevBizDayIso(d = new Date()) {
  const x = new Date(d);
  x.setDate(x.getDate() - 1);
  if (x.getDay() === 0) x.setDate(x.getDate() - 1);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function mondayKeyOf(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  date.setHours(0, 0, 0, 0);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/* The most recently COMPLETED week — this week's Monday minus seven days.
 * Deliberately never the current week: paper cost comes off the FCR once the
 * week has closed, so asking for an unfinished week is the closed-days rule
 * broken in a new place. */
export function lastCompleteMondayKey(d = new Date()) {
  const m = new Date(`${mondayKeyOf(d)}T12:00:00`);
  m.setDate(m.getDate() - 7);
  return `${m.getFullYear()}-${pad(m.getMonth() + 1)}-${pad(m.getDate())}`;
}


/* Previous CALENDAR month as YYYY-MM. The daypart report is the one input that
 * can never be current: CFA Signal only posts a month's Labor Productivity
 * table after that month closes, so "up to date" means LAST month is on file,
 * never this one. Asking for the open month would flag a miss that is
 * impossible to clear. */
export function prevYm(d = new Date()) {
  const y = d.getFullYear(), m = d.getMonth(); // 0-based
  return m === 0 ? `${y - 1}-12` : `${y}-${pad(m)}`;
}
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
export const ymLabel = (ym) => {
  const [y, m] = String(ym || "").split("-").map(Number);
  return m >= 1 && m <= 12 ? `${MONTH_NAMES[m - 1]} ${y}` : String(ym || "");
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const isStoreDay = (d = new Date()) => d.getDay() !== 0;

/* ── The register ─────────────────────────────────────────────────
 * `read` is not here — the readers live in readExtras() and in App.jsx's
 * existing `daily` effect, so this array stays a plain description of WHAT is
 * tracked and WHO owns it. That separation is what makes it cheap to add a row.
 */
export const INPUTS = [
  // ── Daily ────────────────────────────────────────────────────
  { id: "sales", seq: 1,   // Sales first. Every other number on this list divides by it.
    source: "CFA Now — yesterday's net sales",
    how: "CFA Now, yesterday's net sales. One row per closed day.",
    bridge: "CFA Now",
    feeds: "Feeds labor %, food cost % and the sales row on the L10 scorecard. A missed day shortens the window and makes labor read HIGH.",      label: "Daily sales",              owner: OWNER.ED,    cadence: "Every closed day", tile: "financials", tab: "sales" },
  { id: "hours", seq: 3,   // Time punch hours, the first half of labor.
    source: "Time punch report — actual hours worked, not the schedule",
    how: "Time punch report, actual hours worked. NOT the schedule.",
    bridge: "Time punch report",
    /* 🐛 SAME DEFECT AS THE wages ROW BELOW, FOUND BY THE SAME QUESTION (Matt,
       Aug 7 2026: "should daily wages and PTO stay in FCR or labor planner
       because I get directed there or direct me to the FCR"). This row said
       tab: "labor", and the Labor tab is LaborPlanner, which has no hours
       input at all — its only per-day numbers are SALES (laborWindow.js:43).
       Verified the hard way rather than by reading a label: `editMtdField`
       appears in exactly one file in the whole app, FCRPage.jsx, and the four
       payroll fields are typed at FCRPage.jsx:1790 (wages), :1800 (hours),
       :1806 (ot) and :1837 (pto). There is no second door.
       ⚠️ I ALSO HAD THIS ROW WRONG IN A COMMENT. The note under the wages row
       used to say this one was "the PLANNER's SCHEDULED hours". Nothing
       supports that and the row's own source/how lines flatly contradict it —
       both say actual punch hours, NOT the schedule. Comment corrected.
       ⚠️ OPEN, AND MATT'S CALL: the cadence still reads "Every closed day"
       while the only place to put the number takes a month-to-date total. If
       that is right, this row and `wages` are two views of one input and
       should probably be one row. Not merging them on my own guess. */
    feeds: "Feeds daypart labor productivity and the Labor card.",      label: "Labor hours",              owner: OWNER.ED,    cadence: "Every closed day", tile: "financials", tab: "fcr" },
  { id: "giveaways", seq: 2,   // Food cost: giveaways, invoices and transfers. Must not lag sales.
    source: "Inform or Signal — Discounts and Giveaways report",
    how: "Inform or Signal, the Discounts and Giveaways report.",
    bridge: "Inform / Signal",
    feeds: "Feeds food cost %, which feeds the L10 scorecard and the morning digest.",  label: "Daily food cost (giveaways \u00b7 food \u00b7 paper \u00b7 invoices)", owner: OWNER.ED,    cadence: "Every closed day", tile: "financials", tab: "foodcost" },
  // ⚠️ NOT the same as the "hours" row above. That one is chased every closed
  // day off the time punch report; this is the REAL payroll once it posts for
  // the month, which is what labor %, the Labor card and the EOS labor row all
  // ride on. Both are typed in the FCR — see the note on that row.
  { id: "wages", seq: 4,   // MTD payroll, the second half of labor.
    source: "Time punch report — once payroll posts",
    how: "Time punch report, same place as labor hours, once payroll posts.",
    bridge: "Time punch report",
    /* 🐛 SENT PEOPLE TO THE WRONG TAB (Matt, Aug 7 2026: "when you click the
       link to input payroll it should take you to the FCR because that's where
       the input is"). This row said tab: "labor", which is where payroll
       SHOWS UP, not where it is typed. Verified before changing it: FCRPage.jsx
       holds the whole payroll state — wages, hours, ot, pto, hoursThrough
       (FCRPage.jsx:481) — and LaborPlanner.jsx has no wages input at all.
       So the one row that exists to say "go and enter payroll" opened the one
       financial tab where you cannot.
       ⚠️ ONLY THIS ROW MOVES. Eight other rows legitimately say tab: "labor" —
       scheduled hours, the daypart table, the opportunity paste. They are
       entered there. */
    /* Label names all four fields on purpose. It used to read "(wages + hours)"
       while the FCR takes OT and PTO dollars in the same block, which left the
       other two looking like they lived somewhere else. They do not.
       ⚠️ THE PTO HERE IS DOLLARS, and it is NOT the "PTO balances" row further
       down. That one is Cindy's per-person spreadsheet, owned by HR, reference
       only. Same three letters, different input, different tab, and the two
       have been confused out loud once already. */
    feeds: "Feeds labor %, the Labor card and the L10 labor row. Wrong here is wrong in three places.",      label: "MTD payroll (wages · hours · OT · PTO $)", owner: OWNER.ED,  cadence: "Each payroll post", tile: "financials", tab: "fcr" },
  // Deliveries are not daily, so this row reports WHEN one last landed rather
  // than demanding one today. A daily nag here would cry wolf five days a week.
  // Split three ways Jul 25 — FoodCostTracker keeps invoices AND transfers in
  // one list, so a single combined row went green on any entry at all and told
  // Matt nothing about which of the three was actually missing.
  { id: "foodinv",
    source: "CFA Supply — the food invoice for that delivery",
    how: "CFA Supply, the food invoice for that delivery.",
    bridge: "CFA Supply",
    feeds: "Feeds food cost %. Missing invoices make food cost read LOW, which looks like good news.",    label: "Food invoices",           owner: OWNER.ED,    cadence: "Per delivery",     tile: "financials", tab: "foodcost" },
  { id: "paperinv",
    source: "CFA Supply — the paper invoice for that delivery",
    how: "CFA Supply, the paper invoice for that delivery.",
    bridge: "CFA Supply",
    feeds: "Feeds paper cost %, measured against the Top-20% benchmark.",   label: "Paper invoices",          owner: OWNER.ED,    cadence: "Per delivery",     tile: "financials", tab: "foodcost" },
  { id: "transfers",
    source: "Signal — transfers in and out",
    how: "Signal, transfers in and out.",
    bridge: "Signal",
    feeds: "Feeds food cost %. Transfers out that are never logged read as food you used.",  label: "Transfers in / out",      owner: OWNER.ED,    cadence: "As they happen",   tile: "financials", tab: "foodcost" },
  { id: "scorecard", seq: 5,   // Leader scorecard last: it reports on the day the four above describe.
    source: "Entered in the Hub — no outside report",
    how: "Entered in the Hub under Shift Leader Scorecard, by the closing leader.",
    feeds: "Feeds the Shift Leader Scorecard and the leader's own trend.",  label: "Leader scorecard",         owner: OWNER.ED,    cadence: "Every closed day", tile: "shiftleader" },
  { id: "cleaning",
    source: "Entered in the Hub — no outside report",
    how: "Signed off in the Hub under Daily Cleaning, by the leaders on those dayparts.",
    feeds: "The record that the day's cleaning was signed off.",   label: "Cleaning sign-offs",       owner: OWNER.SHIFT, cadence: "Every store day",  tile: "cleaning" },
  /* ★ ADDED Jul 26 2026. `SHIFT_INPUTS.checklists` had been wired in
     boardOwner.js since the resolver landed with nothing to route to — the
     checklists were the one shift-owned list the register never watched.
     Live data at the time it was added: the last completed checklist was
     2026-07-20, six days earlier, and nothing on any screen said so. */
  { id: "checklists",
    source: "Entered in the Hub — no outside report",
    how: "Signed off in the Hub under Ops Checklists, by the leaders on the board.",
    feeds: "The record that the shift's checklist was signed off.", label: "Ops checklists",           owner: OWNER.SHIFT, cadence: "Every store day",  tile: "opschecklists" },

  // ── Weekly ───────────────────────────────────────────────────
  // Store-level, off the FCR. It already shows as a pill in the Shift Leader
  // Scorecard so leaders see it every shift — which is exactly why a blank one
  // is invisible: an empty pill looks the same on day one as on day forty.
  { id: "paperpct",
    /* ★ DERIVED, NOT TYPED WEEKLY (Matt, Aug 5 2026: "for every week paper cost
       is auto calculated"). Verified in the code before changing this: FCRPage
       reads `foodCostLive.paperPct` and only falls back to a static figure when
       the live one is absent, so the number comes off the daily food cost
       entries that are already being made. Listing it as a weekly job asked
       somebody to do something the Hub had already done.
       ⚠️ The typed value still WINS where it exists — it is an override, not
       dead. That is why this says self-check rather than "nothing to enter": a
       stale override left armed while costs move is exactly the failure the
       thaw row carries the same warning about. */
    source: "Nothing to enter — derived in the Hub from daily food cost",
    how: "Nothing to enter. Comes off the daily food cost entries. A typed value overrides it, so check no stale override is left armed.",
    bridge: "FCR",
    feeds: "Shows on the Shift Leader Scorecard every shift, so a blank one is invisible.",   label: "Paper cost %",             owner: OWNER.ED,    cadence: "Self-check",       tile: "shiftleader" },
  /* ★ ADDED Jul 26 2026 (session 2). Reads the self-stamp EquipmentLog.jsx
     writes on every submitted check (`gcfcr-equip-stamp-v1`) — the submissions
     table itself is never scanned from the dashboard. Cadence WEEKLY to match
     the store's own definition of the ask: the Monday 6am reminder flag says
     "needs to be completed this week". ⚠️ The row only sees checks submitted
     AFTER the stamped EquipmentLog deployed — history before that is invisible
     to it by design.
     ⚠️ OWNER.OPS routes to everyone holding the "Director" role (same tolerated
     over-routing as guest scores); Brandon is who the completion email goes to. */
  { id: "equipment",
    source: "Entered in the Hub — no outside report",
    how: "Filed in the Hub under Equipment Log. Only counts checks submitted through the tile.",
    feeds: "The record that the week's equipment check happened.",  label: "Equipment checks",         owner: OWNER.OPS,   cadence: "Weekly",           tile: "equip",
    untracked: "No check recorded since the stamp shipped" },
  /* ★ ADDED Jul 27 2026. Reads the self-stamp FoodQuality.jsx writes when a
     week is filed (`gcfcr-foodquality-stamp-v1` — {at, week, pct, flagged, by}).
     Weekly, Monday-anchored, same shape as the equipment row.
     ⚠️ OWNER IS A NAMED PERSON, not a role — Lupe Villanueva holds the Food
     Quality seat on the accountability chart, and no role string can express
     that without hitting every AD. */
  { id: "foodquality",
    source: "Entered in the Hub — no outside report",
    how: "Filed in the Hub under Food Quality, one sweep a week.", label: "Food quality sweep",      owner: seatOwner("quality"), cadence: "Weekly", tile: "foodquality",
    untracked: "No sweep filed since the tile shipped" },

  /* ★ ADDED Jul 27 2026 — Matt: put the food quality checklist in Input Health
     "to update quarterly". This is NOT the sweep (that is the weekly row above)
     — it is the SOURCE LIST going stale. CFA publishes a new Restaurant Quality
     Improvement Visit each quarter; the tile is seeded from Q2 2026, so once a
     new quarter opens the item list needs re-checking against the new edition.
     Reader: the `qiv` block FoodQuality.jsx writes into its config when someone
     marks the source reviewed. An unmarked source is amber, never red — nothing
     is broken, it is a review that has not happened. */
  /* ⚠️ THE LABEL IS DELIBERATELY NOT "QIV …" ANYMORE (Matt, Aug 2 2026).
     It read "QIV source list review" and sat a few rows from the weekly food
     quality sweep, which is ALSO a QIV. Matt read the NOT TRACKED on this row
     as the sweep being missed and replied "QIV was done on Thursday" — it had
     been, 100%, nothing flagged, by Guadalupe. Two different jobs sharing a
     name is a reporting bug: a register exists to say what is missing, and
     naming it so the reader blames the wrong thing is worse than silence.
     Now named for what it actually is — comparing OUR item list against the
     NEW quarterly edition CFA publishes — and the wording says so plainly. */
  /* ★ ADDED Aug 6 2026 WITH the tile, not after it (Matt: "whatever we are
     adding please update the input registry").
     EcoSure went onto Food Safety earlier the same day and was NOT registered,
     which is the exact hole this file exists to close: an input nobody has a
     row for goes stale silently, and the register's green all-clear then speaks
     for a quarter it knows nothing about. */
  { id: "ecosure",
    source: "EcoSure visit — Ops Hub, the visit page (copy and paste, there is no export)",
    how: "Ops Hub, open the EcoSure visit page and copy it. Drop that on Claude, then paste the block it hands back into Food Safety → Paste an EcoSure visit.",
    bridge: "Ops Hub",
    feeds: "Feeds the EcoSure panel on Food Safety, where a REPEAT finding is what a leader should see before starting today's walkthrough.",
    label: "EcoSure visit", owner: OWNER.OPS, cadence: "Quarterly", tile: "food",
    untracked: "No EcoSure visit entered for this quarter" },

  { id: "qivsource",
    source: "Chick-fil-A Restaurant Quality Improvement Visit — the new edition each quarter",
    how: "Chick-fil-A publishes a new Restaurant Quality Improvement Visit each quarter with a changed item list. Compare our list against the new edition, then mark it checked in Food Quality → Manage items. This is NOT the weekly sweep — that is the 'Food quality sweep' row.",  label: "Item list vs new quarter",   owner: seatOwner("quality"), cadence: "Quarterly", tile: "foodquality",
    untracked: "Our item list has not been checked against this quarter's edition" },

  // ── Monthly ──────────────────────────────────────────────────
  { id: "eom",
    source: "Signal — end-of-month inventory total",
    how: "Signal, the end-of-month inventory total.",
    bridge: "Signal",
    feeds: "Closes the month's food cost. Everything before it is an estimate.",        label: "End-of-month inventory",   owner: OWNER.ED,    cadence: "Month end",        tile: "financials", tab: "foodcost" },
  /* ★ ADDED Aug 5 2026. Matt: "I want to upload the previous months AHA numbers
     ... i would get the total month usage and target goal and % from analytics
     hub". Deliberately NOT filed under Guest Experience: that tile holds CEM and
     Smart Shop, which is what a guest SAID about us, and AHA measures what the
     kitchen DID. Two unrelated jobs answering to one name is the QIV mistake. */
  { id: "ahamonth",
    source: "AHA dashboard — system usage, hold times, target zone, scans, demand variance",
    how: "Open the AHA dashboard for the closed month, select all, and paste the whole page into the Shift Leader Scorecard. It reads all five scores itself: system usage, hold times, target zone, scans without errors and demand variance. Do not retype anything.",
    bridge: "AHA dashboard",
    feeds: "The month's closed AHA, so a run of good days can be checked against the month it added up to. The daily figure on the Scorecard is a different reading and does not replace this.",
    /* ⚠️ A NAMED PERSON, NOT OWNER.OPS (Matt, Aug 5 2026: "brandon will own").
       OWNER.OPS routes to everyone holding Director, which is Brandon AND Daisy.
       This is a kitchen dashboard and it is Brandon's. Same reason the food
       quality rows name Lupe rather than paging every AD. */
    label: "AHA monthly totals", owner: seatOwner("equipment"), cadence: "Start of month", tile: "shiftleader" },
  /* ★ THE `how` IS THE WHOLE INSTRUCTIONS, NOT A POINTER (Matt, Aug 11 2026:
     "remember other stores wont have claude"). It used to say only that this
     was typed in by hand, which is true and useless: it named neither report,
     neither layout, nor the format the paste box wants. At Gate City that gap
     is invisible because somebody asks. A store that clones this Hub has the
     same empty box and nobody to ask.
     ⚠️ WRITTEN FROM THE REAL REPORTS. Checked against Gate City's July 2026
     Smart Shop Overview — which is why the chain-wide figure gets called out
     specifically: it is the only one of the five that is not printed in a box,
     it lives on the grey line of the trend chart, and it is the one a person
     will hunt for. Both surfaces say the same thing; see SHOP_WHERE in
     GuestExperience.jsx, which is what the paste box itself shows. */
  { id: "guest",
    source: "analytics.cfahome.com — CEM Comparison Report and Smart Shop Overview",
    how: "TWO reports, both on analytics.cfahome.com, both SSO-walled with no API, so both are typed in by hand each month. "
       + "SMART SHOP: open Smart Shop \u2192 Overview. The index score is the big number top left and the performance level is under it. "
       + "The chain-wide figure is NOT in a box \u2014 it is the last point on the grey line of the Index Score Trend at the bottom. "
       + "The five categories, their weights and their scores are the Winning Hearts Every Day table. "
       + "CEM: open CEM \u2192 Comparison Report and take your own store row, your market row and the Top 20% benchmark row. "
       + "Paste each into Guest Experience with the button on that tab; the box shows the format and where each number lives.",
    bridge: "analytics.cfahome.com",
    feeds: "Feeds the CEM rows on the L10 scorecard.",      label: "CEM + Smart Shop scores",  owner: OWNER.OPS,   cadence: "Start of month",   tile: "guestxp" },
  // ★ Jul 26 2026 — Matt: "make sure that upload monthly food and paper gaps
  // from analytics hub is present". BOTH halves come off the same AnalyticsHub
  // drilldown, so this is one upload and one row — but the label and the
  // reminder now say so. Previously it read only "Food item gaps" and, when
  // current, said nothing but "Current", which never told anyone WHERE the
  // number comes from or that paper belongs in it too.
  { id: "itemgaps",
    source: "AnalyticsHub — the food and paper drilldown",
    how: "AnalyticsHub, the food and paper drilldown. ONE upload covers both halves.",
    bridge: "AnalyticsHub",
    feeds: "Feeds food cost investigation \u2014 which items are running over.",   label: "Food + paper item gaps",   owner: OWNER.ED,    cadence: "Monthly \u00b7 from AnalyticsHub", tile: "financials", tab: "foodcost" },
  { id: "teamgoals",
    source: "Entered in the Hub — no outside report",
    how: "Set in the Hub under Team Site at the start of each month.",
    feeds: "Sets what the team is working toward this month.",  label: "Team goals + outcomes",    owner: OWNER.LDD,   cadence: "Start of month",   tile: "teamsite" },
  // The CFA Signal Labor Productivity table, hand-keyed into the daypart
  // console. Structurally always one month behind — see prevYm above. It is the
  // only source of per-weekday, per-daypart sales and hours, so a skipped month
  // is a permanent hole in the history the year-over-year plan will be built on.
  { id: "daypart",
    source: "CFA Signal — the Labor Productivity table",
    how: "CFA Signal, the Labor Productivity table, keyed in by hand. Always one month behind.",
    bridge: "CFA Signal",
    feeds: "The only source of per-weekday, per-daypart sales and hours. A skipped month is a permanent hole in the history.",    label: "Daypart labor productivity", owner: OWNER.ED,  cadence: "Start of month",   tile: "financials", tab: "labor" },
  /* ★ WRITTEN LONG ON PURPOSE (Matt, Aug 3 2026: "make the things needed
     detailed in the input registry so i dont forget"). This report is opened
     once a month, and the four benchmark pages look near-identical, so the
     part that is easy to get wrong is knowing WHICH six numbers to take off
     WHICH page. `how` is the whole procedure, not a pointer to it. */
  { id: "laborbench",
    source: "TIR Overview — Labor Cost Opportunity, Detailed Calculations",
    how: "TIR Overview → Labor Cost Opportunity, Detailed Calculations. FOUR benchmark pages: Top 10%, Top 20%, Top 33%, Top 50%. Take TWO numbers once, from any page — FCR Wages % and Labor Productivity $ — because every page repeats them. Then take FOUR off EACH page: Benchmark Wages %, Labor Cost Opportunity %, Labor Cost Opportunity $, and Avg. Daily Benchmark Opp. hours. Paste one block in Financials → Labor, under the daypart console. The importer refuses any block where opportunity % is not FCR wages % minus benchmark wages %, so a mis-keyed digit is caught rather than stored. Always one month behind, same as the daypart table.",
    bridge: "TIR Overview",
    feeds: "The only record of what our labor gap against the top performers is, and whether it is opening or closing. Nothing else in the Hub carries a benchmark we are measured against.", label: "Labor cost opportunity", owner: OWNER.ED, cadence: "Start of month", tile: "financials", tab: "labor" },

  // ── Rolling / open until cleared ─────────────────────────────
  { id: "evals",
    source: "Entered in the Hub — no outside report",
    how: "Filed in the Hub under HR Console. Six months per person.",
    feeds: "Feeds the evals-on-time row on the L10 scorecard.",      label: "Evaluations",              owner: OWNER.HR,    cadence: "Per person, 6 months", tile: "hr" },
  { id: "drivers",
    source: "Entered in the Hub — no outside report",
    how: "Kept current in the Hub under HR Console, the approved-to-drive list.",
    feeds: "Decides who may drive. An empty list falls back to old names.",    label: "Approved-to-drive list",   owner: OWNER.HR,    cadence: "Keep current",     tile: "hr" },
  // STANDING LISTS — a running count with no date attached. These never reach
  // the Today block: a row that stays true every day for a quarter teaches
  // people to skim the block it sits in, and the rows beside it that DO
  // change get skimmed with it. They live in the register instead, where a
  // count that never moves is visible as exactly that.
  { id: "ipo",
    source: "Entered in the Hub — no outside report",
    how: "Checked off in the Hub under IPO Action Items.",        label: "IPO action items",         owner: OWNER.ED,    cadence: "Quarterly",        tile: "ipo",        standing: true },
  { id: "facilities",
    source: "Entered in the Hub — no outside report",
    /* Co-owned since Jul 30 2026 — Matt: "i want brandon to co-own the
       facilities tool." Brandon holds the facilities seat in orgSeats.js
       already; this makes the register row light up for him too. */
    how: "Logged and cleared in the Hub under Facilities.", label: "Facilities punch list",    owner: coOwn([operatorName(), seatHolder("facilities")]), cadence: "Until clear", tile: "facilities", standing: true },

  // ── THE EXPIRY ROW ───────────────────────────────────────────
  // Every other row here watches whether a PERSON entered something. This one
  // watches whether the CODE still works — the second row type Matt asked for
  // ("I don't want anything to become stale"), which covers things with a shelf
  // life rather than a cadence: hardcoded names, hardcoded date windows, seeds
  // meant to be replaced, and couplings between two files that must move
  // together.
  //
  // Its first subject is the board router. boardOwner.js resolves who owns the
  // shift rows by matching leader station names and cleaning buckets defined in
  // OTHER files — rename a leader row in stationTemplates.js or change a day's
  // AM/MID/PM buckets in DailyCleaning.jsx and routing returns NOBODY,
  // silently, with the rows falling back to the overseer and nothing on screen
  // to say why. This row is what makes that visible the same day it happens.
  { id: "routing",
    source: "Nothing to enter — the Hub checks itself",
    how: "Nothing to enter. This watches whether the board can still work out who owns the shift rows.",
    feeds: "If this breaks, the shift rows quietly route to NOBODY and nothing on screen says so.",    label: "Responsibility routing",   owner: OWNER.ED,    cadence: "Self-check", tile: "dailysetup",
    untracked: "No board read yet today" },

  /* ★ ADDED Jul 26 2026 (session 2). Thaw has NO daily manual input — the pars
     derive live from Sales Allocation's last two completed weekends. What CAN
     silently go wrong: a manual override left armed while sales move, or no
     clean weekend basis at all (pars render 0). ThawAllocation.jsx stamps
     `gcfcr-thaw-stamp-v1` on every open and config save; a stamp that stops
     moving means nobody has looked at the pars — passive tracking, flagged to
     Matt as a judgment call when built. */
  { id: "thaw",
    source: "Nothing to enter — derived in the Hub from Sales Allocation",
    how: "Nothing to enter. Pars come from Sales Allocation's last two weekends. Opening the tile records that somebody looked.",
    feeds: "Pars come from Sales Allocation. If nobody looks, an override can sit armed while sales move.",       label: "Thaw allocation",          owner: OWNER.ED,    cadence: "Self-check", tile: "thaw",
    untracked: "No thaw reading yet — opening the tile records its basis" },

  // ── Informational — no cadence was ever set, so nothing nags ──
  { id: "pto",
    /* ⚠️ NOT A CFA REPORT, AND NOT THE SAME EVERYWHERE. Matt, Aug 4 2026:
       "pto source is a spreadsheet from cindy but each operator is different".
       Worth stating plainly in the new-store doc: this is the one input where
       another operator cannot copy our answer, they have to name their own. */
    source: "A spreadsheet kept by the office manager — varies by operator",
    /* ⚠️ OWNED BY HR, NOT PAY. Cindy was the ONLY person carrying the "Payroll"
       role, and her title moved to Human Resources. `kind: "role"` matches on
       the exact string, so this row would have matched nobody at all and sat in
       the register with no owner — the register's whole job is saying who owes
       what, and a row owed by no one is worse than no row. Cindy still sees it
       under HR, and so does Hannah. OWNER.PAY is left defined for whenever
       somebody carries that title again. */
    how: "Kept by HR. For reference only, nothing nags.",             label: "PTO balances",             owner: OWNER.HR,    cadence: "As needed",        tile: "financials", tab: "pto", info: true },

  // Both read live since Jul 28 — see readWaste / readCashCounts.
  { id: "waste",
    source: "Entered in the Hub — no outside report",
    how: "Entered in the Hub under Waste and Donations, every store day.",
    feeds: "Feeds food cost and the weekly waste report.",      label: "Waste + donations",        owner: OWNER.OPS,   cadence: "Every store day",  tile: "waste" },
  { id: "cashcounts",
    source: "Entered in the Hub — no outside report",
    how: "Counted in the Hub under Cash Audit, by the opening and closing leaders.",
    feeds: "Feeds the cash variance row on the L10 scorecard.", label: "Safe + cashier counts",    owner: OWNER.SHIFT, cadence: "Every store day",  tile: "cashaudit" },

  // ── Tracked but not yet readable. Grey, with the reason. ─────
  // [stated] Matt Jul 28: biweekly, and "assign it to me for now" — so OWNER.ED
  // rather than the tier-2 group it started as. Revisit when supply has a seat.
  { id: "supply",
    source: "Entered in the Hub — no outside report",
    how: "Ordered and signed out in the Hub under Supply Central.",     label: "Supply orders + sign-out", owner: OWNER.ED, cadence: "Every 2 weeks", tile: "supply" },
  // Reads the completion stamp since Jul 28 — see readFoodSafetyDone.
  { id: "foodsafety",
    source: "Entered in the Hub — no outside report",
    how: "Walked in the Hub under Food Safety. The rota picks who, each day.",
    feeds: "The record that the walkthrough happened. Nothing else proves it.", label: "Food safety walkthroughs", owner: OWNER.SHIFT, cadence: "Daily rota",       tile: "food" },
  { id: "trainer",
    source: "Entered in the Hub — no outside report",
    how: "Filed in the Hub under Trainer Tasks by each trainer. Every task on the list is due once a FORTNIGHT, not once a week (Matt, Aug 11 2026). The nightly job rolls the current fortnight up.",    label: "Trainer cleaning tasks", storeSpecific: true,     owner: OWNER.SHIFT, cadence: "Every 2 weeks",           tile: "trainertasks",
    untracked: "No status written yet by the nightly job" },
];


/* ★ HOW OFTEN, IN FOUR BUCKETS (Matt, Aug 5 2026: "for the input register I
   would like to try a different view and all collapsible. Daily, weekly and
   monthly").
   `cadence` is deliberately free text because it is written for a person to
   read: "Every closed day", "Per person, 6 months", "Until clear". Seventeen
   distinct strings, and a reader cannot group by that.

   ⚠️ DERIVED HERE, NOT IN THE VIEW. The register is the one place that knows
   what a cadence means. A map living inside App.jsx would be a second opinion
   about the same fact, and the next input added would land in whichever bucket
   that copy happened to guess.
   ⚠️ THE FOURTH BUCKET IS NOT A DUMPING GROUND. "Ongoing" is for the rows with
   no clock at all: a standing list worked until it is clear, a self-check, a
   reference figure. Forcing those into Daily or Monthly would make the two
   buckets that matter untrustworthy, which is worse than a fourth heading. */
export const CADENCE_BUCKETS = ["daily", "weekly", "monthly", "ongoing"];
export const CADENCE_LABEL = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  ongoing: "Ongoing",
};

export function cadenceBucket(input) {
  const c = String((input && input.cadence) || "").toLowerCase();
  if (!c) return "ongoing";
  /* Order matters: "every 2 weeks" contains "week", and a payroll post is a
     monthly rhythm even though the words say neither. */
  if (/every closed day|every store day|daily/.test(c)) return "daily";
  if (/every 2 weeks|weekly/.test(c)) return "weekly";
  /* ⚠️ NOT a bare /month/. "Per person, 6 months" contains the word and is not a
     monthly job at all — it is a rolling clock per person, which belongs with
     the other things that have no shared due date. A reader opening Monthly
     expects a list they work through at month end, and one row that can never
     be finished there makes the whole heading untrustworthy. */
  if (/month end|start of month|monthly|payroll post/.test(c)) return "monthly";
  return "ongoing";
}

/* Group a list of inputs into the four buckets, each preserving the order it
   arrived in. Empty buckets are returned too, so a caller can decide whether an
   empty heading is worth rendering rather than discovering it cannot. */
export function byCadence(list) {
  const out = { daily: [], weekly: [], monthly: [], ongoing: [] };
  (Array.isArray(list) ? list : []).forEach((i) => out[cadenceBucket(i)].push(i));
  return out;
}

export const inputById = (id) => INPUTS.find((x) => x.id === id) || null;

/* ── Readers ──────────────────────────────────────────────────────
 * Everything below either reads a key or returns null. Nothing throws: a
 * register that can break the dashboard is worse than no register.
 *
 * Storage is split in this repo and it matters here. Cleaning is on
 * window.storage with shared=true; PTO, team goals and the drivers list are on
 * Supabase via kvGet. Reading either one the other way returns null forever and
 * the row reports a clean input as missing.
 */
async function browserSharedGet(key) {
  try {
    const r = await window.storage.get(key, true);
    return r && r.value ? JSON.parse(r.value) : null;
  } catch { return null; }
}

/* ★ INJECTABLE, so the WORKER can read the same rows. `window.storage` is a
   shim over kvGet/kvSet (main.jsx), so shared keys like `cleaning:{week}:{house}:{day}`
   live in the SAME Supabase kv_store the worker's sbGet reads — the browser and
   the worker are looking at one store through two doors. Passing the door in is
   the house pattern (eosTouchIn does exactly this); bundling store.js into the
   worker is the thing that must never happen, because its top-level
   `import.meta.env` throws and takes every scheduled job down with it. */
const pickShared = (injected) => (typeof injected === "function" ? injected : browserSharedGet);

/* Today's cleaning only — deliberately NOT the week.
 * The cleaning list stores one row per week × house × day, so a whole week is
 * twelve round trips on every dashboard load. Two is enough to answer "has
 * today been signed off". */
async function readCleaningToday(now, sharedGet) {
  if (!isStoreDay(now)) return { na: true };
  const wk = weekKeyOf(now);
  const day = DAY_NAMES[now.getDay()];
  const get = pickShared(sharedGet);
  const [foh, boh] = await Promise.all([
    get(`cleaning:${wk}:FOH:${day}`),
    get(`cleaning:${wk}:BOH:${day}`),
  ]);
  const signed = (m) => m && typeof m === "object" && Object.keys(m).length > 0;
  /* The FOH sign-off keys are `${shift}#b${i}`, so the shift prefixes actually
     used are ground truth for which AM/MID/PM buckets this day really has.
     Handed to boardHealth so CLEAN_BUCKETS falling behind FOH_DATA is DETECTED
     rather than silently mis-routing that shift's leads. Reported only; it does
     not change what the cleaning row itself says. */
  const buckets = [...new Set(Object.keys(foh && typeof foh === "object" ? foh : {})
    .map((k) => String(k).split("#")[0])
    .filter((b) => b && b !== "list"))];
  return { na: false, foh: signed(foh), boh: signed(boh), day, buckets };
}

/* Leader scorecard COMPLETENESS for the previous business day.
 *
 * ⚠️ THE GAP THIS CLOSES: the existing row asks only whether the day's record
 * EXISTS. `gcfcr-sl-daily-{date}-v1` is an object of four dayparts, each with
 * its own SOS / AHA / cars / transactions fields, and it is written the moment
 * the first daypart is saved — so a day with breakfast filled and the other
 * three blank has always read "Entered", in green, indistinguishable from a
 * complete day. Those blanks feed the leader scores and the EOS SOS row.
 *
 * Same family as the off-goal fix: a row that only asks "did something get
 * typed" cannot tell entered from finished.
 *
 * Counting rule: a daypart COUNTS as entered when it carries at least one of
 * the four reported numbers. Lead IDs alone do not count — those are written
 * by the board, not by the person doing the entry, so treating them as data
 * would mark every daypart complete before anyone typed anything.
 */
const SL_DAYPARTS = ["breakfast", "lunch", "afternoon", "dinner"];
const SL_FIELDS = ["dtSos", "fcSos", "aha", "cars", "transactions", "goodScans", "txNoAha"];

async function readScorecardDay(kvGet, iso) {
  if (!iso) return null;
  try {
    const r = await kvGet(`gcfcr-sl-daily-${iso}-v1`);
    if (!r || typeof r !== "object") return { iso, exists: false, filled: 0, total: SL_DAYPARTS.length };
    const filled = SL_DAYPARTS.filter((d) => {
      const p = r[d];
      if (!p || typeof p !== "object") return false;
      return SL_FIELDS.some((f) => String(p[f] ?? "").trim() !== "");
    }).length;
    return { iso, exists: true, filled, total: SL_DAYPARTS.length };
  } catch { return null; }
}

/* Ops checklists — the shift-tagged Leader/FOH/BOH lists. One key per DAY, so
 * the date in the key IS the daily reset; there is no wipe logic to reason
 * about. Shape `{ checked: { "areaId:idx": true } }`.
 *
 * ⚠️ TODAY ONLY, one read — deliberately, and for the same reason the cleaning
 * reader takes today's two keys rather than the week's twelve: a register that
 * makes the dashboard slow gets collapsed and stops being read at all. The cost
 * is that this row can say "nothing signed off today" but not "nothing signed
 * off since the 20th". If the longer view is ever wanted, the cheap way is a
 * self-stamp inside OpsChecklists.jsx (the PTO pattern), not N reads here.
 */
async function readOpsChecklists(kvGet, now) {
  if (!isStoreDay(now)) return { na: true };
  try {
    const d = new Date(now);
    const todayIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const key = `gcfcr-ops-done-${todayIso}-v2`;
    const r = await kvGet(key);
    // An ABSENT key is the answer, not an error — it is precisely the state
    // this row exists to report. Only a throw returns null.
    const checked = r && typeof r === "object" && r.checked && typeof r.checked === "object" ? r.checked : {};
    const done = Object.keys(checked).filter((k) => checked[k]).length;
    /* ★ Jul 26 (session 2) — the longer view, exactly as the note above
       prescribed: OpsChecklists.jsx now self-stamps `gcfcr-ops-stamp-v1`
       (`{at, iso, count}`, only when count > 0). Read ONLY when today is
       empty, so a normal day still costs one read. Reported only when the
       stamp is genuinely a PRIOR day — a same-day stamp with today now empty
       means someone checked and unchecked, which is not "last was". A stamp
       failure degrades to exactly the old behaviour, never to silence. */
    let lastIso = null;
    if (done === 0) {
      try {
        const s = await kvGet("gcfcr-ops-stamp-v1");
        if (s && s.iso && s.iso < todayIso) lastIso = s.iso;
      } catch { /* stamp is a bonus, never load-bearing */ }
    }
    return { na: false, done, lastIso };
  } catch { return null; }
}

/* Equipment checks — reads ONLY the self-stamp EquipmentLog.jsx writes on
 * submit ({at, iso, shift, by, ok, issue, down}), never the submissions table.
 * WEEKLY, Monday-anchored via mondayKeyOf — the same week the reminder flag
 * speaks for. Absent stamp is the answer (nothing recorded), only a throw
 * returns null. */
/* ── WASTE + DONATIONS ────────────────────────────────────────────
 * ⚠️ THIS ROW SAID "writes to personal storage, not shared" AND THAT WAS
 * WRONG. Verified against the live store on Jul 28: `gcfcr-waste-v4` and
 * `gcfcr-waste-don-v4` are both SHARED kv_store rows, both carrying entries
 * through Jul 27. The register was not describing a data problem, it was
 * describing its own missing reader — and a register that reports NOT TRACKED
 * for something entered daily teaches people to skim the grey rows, which is
 * exactly the rows it exists to make them read.
 *
 * Shape is an OBJECT KEYED BY DATE → { "<shift>": { itemCode: qty } }, not an
 * array. Newest date wins.
 * ⚠️ A DATE CAN EXIST WITH NOTHING UNDER IT — `{"2026-06-29": {"BOH - AM": {}}}`
 * is a day the tile was opened and saved empty. That is NOT an entry, so days
 * are only counted when some shift actually holds an item. */
function newestDatedKey(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  let best = null;
  for (const [iso, byShift] of Object.entries(obj)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
    const has = byShift && typeof byShift === "object" &&
      Object.values(byShift).some((items) => items && typeof items === "object" && Object.keys(items).length > 0);
    if (has && (!best || iso > best)) best = iso;
  }
  return best;
}

async function readWaste(kvGet) {
  try {
    const [w, d] = await Promise.all([
      kvGet("gcfcr-waste-v4").catch(() => null),
      kvGet("gcfcr-waste-don-v4").catch(() => null),
    ]);
    const waste = newestDatedKey(w);
    const don = newestDatedKey(d);
    if (!waste && !don) return { has: false };
    return { has: true, waste, don, iso: [waste, don].filter(Boolean).sort().pop() };
  } catch { return null; }
}

/* ── SAFE + CASHIER COUNTS ────────────────────────────────────────
 * Said "No verified reader yet". Verified Jul 28: both are shared arrays of
 * `{date, …}` — 46 safe entries and 4 cashier entries, current to Jul 28 and
 * Jul 27. ⚠️ The two are NOT the same cadence in practice: a safe count
 * happens every store day, a cashier entry only when a drawer is out. So this
 * row is judged on the SAFE count alone, and the cashier date is carried only
 * as context. Judging it on the cashier list would call the row late on every
 * day nobody's drawer was wrong, which is most days. */
const newestIsoIn = (arr) => {
  if (!Array.isArray(arr)) return null;
  let best = null;
  for (const e of arr) {
    const iso = e && typeof e.date === "string" ? e.date : null;
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) && (!best || iso > best)) best = iso;
  }
  return best;
};

async function readCashCounts(kvGet) {
  try {
    const [safe, cashier] = await Promise.all([
      kvGet("gcfcr-cashaudit-safe-entries").catch(() => null),
      kvGet("gcfcr-cashaudit-cashier-entries").catch(() => null),
    ]);
    const safeIso = newestIsoIn(safe);
    if (!safeIso) return { has: false };
    return { has: true, iso: safeIso, cashier: newestIsoIn(cashier) };
  } catch { return null; }
}

/* Food safety walkthrough completion. Reads the stamp FoodSafetyWalkthrough.jsx
 * writes on save: `{at, iso, by, pct, flagged}`.
 * ⚠️ THE ROTA HAS BEEN ASSIGNING THIS SINCE JUL 24 AND NOTHING HAS EVER READ
 * BACK WHETHER IT GOT DONE — the assignment and the completion were two
 * separate facts and only one of them was visible. */
/* Supply orders + sign-out. Reads `gcfcr-signout-v1` from SHARED storage.
 * ⚠️ IT ONLY BECAME READABLE ON JUL 28. SupplyCentral wrote all four of its
 * keys to PERSONAL storage — every other tile passes shared — so the sign-out
 * log was one bucket per person and nothing outside that device could see it.
 * Fixed in SupplyCentral.jsx the same day; this reader depends on that deploy.
 * ⚠️ Entries carry `at` (a full ISO timestamp from `new Date().toISOString()`),
 * NOT a plain date like every other row's `date` field. Taking the first 10
 * characters is deliberate. */
/* 🐛 IT ONLY EVER READ HALF ITS OWN ROW (Matt, Aug 5 2026: "someone did a supply
   order yesterday but it says undone").
   The row is labelled "Supply orders + sign-out" and the reader looked at the
   sign-out log alone. Supply Central keeps TWO logs, `gcfcr-orders-v1` and
   `gcfcr-signout-v1`, and writes an order to the first one. Hannah placed an
   order on Aug 4; the sign-out log does not exist at all yet, so the register
   answered "no supply order or sign-out recorded yet" while an order sat in
   storage from the day before.
   ⚠️ THE LABEL WAS RIGHT AND THE READER WAS WRONG. Worth saying which way
   round, because the tempting fix is to narrow the label instead. Ordering and
   signing out are both real activity on this tile, and either one means somebody
   is using it.
   ⚠️ A FAILED READ IS STILL NOT AN EMPTY ONE. Both keys are fetched together;
   only a THROW returns null, which the caller renders as no row at all. A key
   that simply is not there is a successful read of nothing, which is exactly
   what the sign-out log is today. */
const supplyLatestIso = (log) => {
  if (!Array.isArray(log)) return null;
  let best = null;
  for (const e of log) {
    const iso = e && typeof e.at === "string" ? e.at.slice(0, 10) : null;
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) && (!best || iso > best)) best = iso;
  }
  return best;
};

/* Monthly AHA. Same shape as the other month-behind uploads: it asks for the
   month that just CLOSED, never the open one, which cannot be reported yet.
   ⚠️ Only a THROW returns null. A key that was never written is a successful
   read of nothing, and "nobody has pasted one yet" is exactly what this row
   exists to say. */
async function readAhaMonth(kvGet, now) {
  try {
    const all = await kvGet(AHA_MONTHLY_KEY);
    return ahaStatus(all && typeof all === "object" ? all : {}, now);
  } catch { return null; }
}

async function readSupply(sharedGet) {
  try {
    const get = pickShared(sharedGet);
    const [signoutLog, ordersLog] = await Promise.all([
      get(SIGNOUT_KEY_REG),
      get(ORDERS_KEY_REG),
    ]);
    const s = supplyLatestIso(signoutLog);
    const o = supplyLatestIso(ordersLog);
    if (!s && !o) return { has: false };
    /* The most recent of either, and which one it was, so the row can say
       "ordered" rather than claiming a sign-out that never happened. */
    const useOrder = !!o && (!s || o > s);
    return { has: true, iso: useOrder ? o : s, kind: useOrder ? "order" : "sign-out" };
  } catch { return null; }
}

async function readFoodSafetyDone(kvGet) {
  try {
    const st = await kvGet("gcfcr-foodsafety-stamp-v1");
    if (!st || typeof st !== "object" || typeof st.iso !== "string") return { has: false };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(st.iso)) return { has: false };
    return { has: true, iso: st.iso, by: st.by || "", flagged: Number(st.flagged) || 0 };
  } catch { return null; }
}

/* Today's food safety walkthrough assignee, straight from the rota.
 *
 * ⚠️ THE ROTA IS THE ONLY SYSTEM ALLOWED AN OPINION ABOUT THIS ROW.
 * boardOwner.js deliberately has no `foodsafety` rule and says why: the rota
 * already picks the person, and adding a board lookup would give two systems an
 * answer to one question and let them drift. So this reads the rota's OUTPUT
 * rather than re-deriving anything. If the rota changes how it picks, this
 * keeps working, because it never knew how it picked.
 *
 * Shape written by runFoodSafetyAssign in worker.js:
 *   { assigned: { "<iso>": { name, side, fallback } }, lastBy: {...} }
 * ⚠️ A STORED NULL FOR TODAY MEANS THE JOB RAN AND FAILED, not "nobody". The
 * worker retries those; here it is simply "no assignee", which leaves the row
 * with the overseer — the old behaviour, which is the right fallback.
 */
async function readFoodSafetyRota(kvGet, now) {
  try {
    const r = await kvGet("gcfcr-foodsafety-rota-v1");
    if (!r || typeof r !== "object") return null;
    const pad = (n) => String(n).padStart(2, "0");
    const iso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const e = (r.assigned || {})[iso];
    if (!e || typeof e !== "object" || typeof e.name !== "string" || !e.name.trim()) return null;
    return { iso, name: e.name.trim(), fallback: !!e.fallback };
  } catch { return null; }
}

/* Trainer weekly tasks — read the status the nightly job writes.
 *
 * 🐛 THE ROW EXISTED AND NOTHING EVER READ IT (found Jul 29 2026). `trainer`
 * was defined in INPUTS but no reader ever called ok() or late() on it, so it
 * fell through to the untracked fallback every single day and the dashboard
 * said "Not tracked". That read as a dead cron and sent Matt looking at
 * cron-job.org. The job was healthy the whole time — it had written the key the
 * previous afternoon with the current week and a real task list.
 *
 * ⚠️ SAME SHAPE AS THE FOOD SAFETY ROTA BUG, ONE DAY APART. A job does its
 * work, writes its key, and the register never consumes it. The tile looks
 * broken and the thing everyone reaches for is the job. When a row says
 * "not tracked", check whether anything READS it before touching the writer.
 *
 * Shape written by runTrainerTasksSummary: { weekOf, tasks: [{task, trainer,
 * completed}] }.
 */
async function readTrainerTasks(kvGet, now) {
  try {
    const r = await kvGet("gcfcr-trainer-tasks-v1");
    if (!r || typeof r !== "object" || !Array.isArray(r.tasks)) return null;
    const total = r.tasks.length;
    if (!total) return null;
    const done = r.tasks.filter((t) => t && t.completed === true).length;
    return { weekOf: typeof r.weekOf === "string" ? r.weekOf : null, total, done, thisWeek: mondayKeyOf(now) };
  } catch { return null; }
}

async function readEquip(kvGet) {
  try {
    const s = await kvGet("gcfcr-equip-stamp-v1");
    if (!s || typeof s !== "object" || (!s.iso && !s.at)) return { has: false };
    const d = s.iso ? new Date(`${s.iso}T12:00:00`) : new Date(s.at);
    if (isNaN(d)) return { has: false };
    return { has: true, iso: s.iso || null, week: mondayKeyOf(d), shift: s.shift || "", by: s.by || "", down: Number(s.down) || 0 };
  } catch { return null; }
}

/* Food quality — reads the self-stamp FoodQuality.jsx writes when a week is
 * filed ({at, week, pct, flagged, by}) plus the `qiv` review block on its
 * config. Two rows come off one read: the WEEKLY sweep and the QUARTERLY
 * source-list review. Absent is the answer (nothing filed), only a throw
 * returns null. */
async function readFoodQuality(kvGet) {
  try {
    const [s, cfg] = await Promise.all([
      kvGet("gcfcr-foodquality-stamp-v1").catch(() => null),
      kvGet("gcfcr-foodquality-config-v1").catch(() => null),
    ]);
    const qiv = cfg && typeof cfg === "object" && cfg.qiv && typeof cfg.qiv === "object" ? cfg.qiv : null;
    if (!s || typeof s !== "object" || !s.week) return { has: false, qiv };
    return {
      has: true,
      week: String(s.week),
      pct: s.pct == null ? null : Number(s.pct),
      flagged: Number(s.flagged) || 0,
      by: s.by || "",
      qiv,
    };
  } catch { return null; }
}

/* Which calendar quarter are we in — the unit the QIV is published on. */
function quarterOf(d) {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

/* EcoSure — reads the visit record Food Safety writes, keyed by round.
 * ⚠️ ROUND IS "Q2-2026", NOT quarterOf()'s "2026-Q2". Two shapes for the same
 * idea, and comparing them the wrong way round would report every quarter
 * missing forever. The report's own wording wins in its own record; the
 * conversion happens here, once.
 * Absent is the answer (no visit entered), only a throw returns null. */
async function readEcosure(kvGet, now) {
  try {
    const rec = await kvGet("gcfcr-ecosure-v1").catch(() => null);
    const map = rec && typeof rec === "object" ? rec : {};
    const want = `Q${Math.floor(now.getMonth() / 3) + 1}-${now.getFullYear()}`;
    const v = map[want];
    const rounds = Object.keys(map);
    if (!v) return { has: false, want, lastRound: rounds.length ? rounds.sort().pop() : "" };
    const findings = Array.isArray(v.findings) ? v.findings : [];
    return {
      has: true, want,
      total: findings.length,
      repeats: findings.filter((f) => f && f.repeat).length,
      level: v.level == null ? null : Number(v.level),
    };
  } catch { return null; }
}

/* Thaw allocation — reads the self-stamp ThawAllocation.jsx writes on every
 * open and config save ({at, alloc, auto, live}). auto:false = manual override
 * armed; alloc:null = no basis at all (pars render 0). An absent stamp means
 * the stamped tile has never been opened — untracked, not a miss, so the
 * reader returns null and the catch-all sweep reports it grey with the reason. */
async function readThaw(kvGet) {
  try {
    const s = await kvGet("gcfcr-thaw-stamp-v1");
    if (!s || typeof s !== "object" || !s.at) return null;
    return { at: s.at, alloc: s.alloc == null ? null : Number(s.alloc), auto: s.auto !== false, live: s.live == null ? null : Number(s.live) };
  } catch { return null; }
}

/* PTO stamps itself on every save, so its freshness is free — the only input
 * in the Hub that already reports its own last-touched date. */
async function readPto(kvGet) {
  try {
    const r = await kvGet("gcfcr-pto-v1");
    return (r && r.updatedAt) || null;
  } catch { return null; }
}

async function readDrivers(kvGet) {
  try {
    const r = await kvGet("gcfcr-approved-drivers-v1");
    const list = Array.isArray(r) ? r : (r && Array.isArray(r.drivers) ? r.drivers : []);
    return list.length;
  } catch { return null; }
}

async function readTeamGoals(kvGet, now) {
  try {
    const r = await kvGet("gc-team-goals-v1");
    const months = (r && r.months) || {};
    const m = months[ymOf(now)];
    return { set: !!(m && Object.keys(m).length > 0) };
  } catch { return null; }
}

/* Paper cost % — ONE number per week, keyed by that week's Monday, written by
 * the pill in ShiftLeaderScorecard.jsx (kvSet on gcfcr-sl-paper-v1). Returns
 * the last COMPLETED week only. An unreadable record returns null and the row
 * reports nothing rather than inventing a miss. */
/* ⚠️ MUST MATCH ShiftLeaderScorecard.jsx's PAPER_GOAL + its amber band. Two
   screens showing the same number against two different targets is worse than
   one screen not showing it at all. Same coupling class as weekKeyOf/getWeekKey
   and mondayKeyOf/mondayOf — if the scorecard's target moves, move this. */
export /* SupplyCentral's own key name, mirrored. */
const SIGNOUT_KEY_REG = "gcfcr-signout-v1";
/* ⚠️ THE SECOND HALF OF THE SUPPLY ROW. Supply Central keeps ordering and
   signing out in two separate logs, and the register only ever read one. Both
   names are copied from SupplyCentral.jsx; they are not derived, so if that
   tile renames a key this goes quiet rather than wrong, which is the safer of
   the two failures for a row that says whether somebody did their job. */
const ORDERS_KEY_REG = "gcfcr-orders-v1";
/* [stated] Matt, Jul 28: "let's make supply bi weekly."
   ⚠️ READ AS EVERY TWO WEEKS, not twice a week — the reading Claude recommended
   and he did not correct. It is one constant so it is one edit if wrong. */
const SUPPLY_STALE_DAYS = 14;

/* ★ FROM storeConfig.js (step 2, Aug 11 2026). Same 3.27.
   ⚠️ IT WAS DECLARED IN TWO FILES. ShiftLeaderScorecard.jsx had its own
   `const PAPER_GOAL = 3.27` and this file had this one, byte-identical and
   unaware of each other. That is rule 8, and the drift it invites is the worst
   kind here: the scorecard would grade a week against one number while the
   input register chased the other, about the same paper cost, on the same
   morning. Both read the config now.
   ⚠️ THE BAND WAS DUPLICATED THE SAME WAY and is fixed now too. 0.25 was
   declared here as PAPER_BAND and in ShiftLeaderScorecard.jsx as
   PAPER_AMBER_BAND — same number, two names, neither aware of the other. It
   grades the same figure, so the scorecard could call a week amber while this
   register called it red. Both read the config. */
const paperGoal = () => storeCfg("financial.goals.paper");
/* ⚠️ STILL A VALUE, NOT A CALL, BECAUSE IT IS EXPORTED and changing that
   changes every importer's contract. Nothing imports it today, so it is left
   as the default and revisited if something ever does. */
export const PAPER_BAND = storeCfg("financial.paperBand");
const paperBand = () => storeCfg("financial.paperBand");

async function readPaper(kvGet, now, paperSeedFor) {
  try {
    const r = await kvGet("gcfcr-sl-paper-v1");
    // An ABSENT or unparseable record is NOT an error — a key that was never
    // written is exactly the state this row exists to report, and returning
    // null here would make the register silent in the one case it was added
    // for. Only a THROW (storage actually down) returns null, so an outage can
    // never be dressed up as someone forgetting to type a number.
    const rec = r && typeof r === "object" ? r : {};
    const week = lastCompleteMondayKey(now);
    const raw = rec[week];
    const n = raw === undefined || raw === null || raw === "" ? NaN : Number(raw);
    if (Number.isFinite(n)) return { week, pct: n, seeded: false };

    /* ★ Jul 28 2026 — NO TYPED WEEKLY NUMBER. Fall back to the live
       MONTH-TO-DATE paper % from Food Cost, the same seed the scorecard pill
       now shows. Without this the register calls a week "not entered" while
       the scorecard is displaying a real figure for it — two screens, two
       verdicts, on one number.

       ⚠️ WHY IT ARRIVES AS AN INJECTED FUNCTION AND NOT AN IMPORT. This file
       imports boardOwner.js and nothing else BY DESIGN (see the header):
       worker.js imports it, and pulling in FoodCostTracker.jsx would drag
       React, store.js and SalesAllocation.jsx into the worker bundle and take
       every scheduled job down at load. App.jsx already imports
       monthFoodCostPct, so App.jsx passes the reader in. A caller that omits
       it (the worker) simply gets the old behaviour — the seed is optional,
       never required.

       ⚠️ THE SEED IS MONTHLY, THE ROW IS WEEKLY. There is no weekly paper %
       anywhere in the Hub. `seeded` travels with it so every line of copy can
       say so rather than passing a month figure off as the week's. */
    if (typeof paperSeedFor === "function") {
      try {
        const s = await paperSeedFor(week.slice(0, 7));
        const sn = s === undefined || s === null || s === "" ? NaN : Number(s);
        if (Number.isFinite(sn)) return { week, pct: sn, seeded: true };
      } catch { /* a failed seed is just no seed — never an outage */ }
    }
    return { week, pct: null, seeded: false };
  } catch { return null; }
}


/* Daypart labor — an ARRAY of month records, each { id: "YYYY-MM", sales, hours }.
 * Reports the newest month present, whether last month has landed, and how many
 * months of history exist. The count is not decoration: twelve months of
 * per-weekday, per-daypart figures is what a same-month-last-year plan needs,
 * and until then there is nothing to compare a month against.
 * Same rule as readPaper — an ABSENT record is the very state this row exists
 * to report, so only a THROW returns null. */
async function readDaypart(kvGet, now) {
  try {
    const r = await kvGet("gcfcr-daypart-labor-v1");
    const list = Array.isArray(r) ? r : [];
    const ids = list
      .map((m) => (m && typeof m.id === "string" ? m.id : null))
      .filter((id) => /^\d{4}-\d{2}$/.test(id || ""))
      .sort();
    const want = prevYm(now);
    return {
      want,
      latest: ids.length ? ids[ids.length - 1] : null,
      months: ids.length,
      current: ids.includes(want),
    };
  } catch { return null; }
}

/* Labor cost opportunity — an ARRAY of month records, each { id: "YYYY-MM",
 * wagesPct, productivity, tiers }. Reports the newest month and whether last
 * month has landed, the same shape readDaypart returns, because the row it
 * feeds asks the same question.
 *
 * ★ A MONTH ONLY COUNTS WHEN IT CARRIES THE HEADLINE TIER. A record present
 * but missing its Top 20% figures would otherwise mark the row green while
 * the card it feeds shows dashes, which is the worst of both: the reminder
 * stops and the number never arrives. Same rule as the daypart row — absence
 * is the state this exists to report, so only a THROW returns null. */
async function readLaborBench(kvGet, now) {
  try {
    const r = await kvGet("gcfcr-laborbench-v1");
    const list = Array.isArray(r) ? r : [];
    const ids = list
      .filter((m) => m && typeof m.id === "string" && /^\d{4}-\d{2}$/.test(m.id)
        && m.tiers && typeof m.tiers === "object" && m.tiers["20"])
      .map((m) => m.id)
      .sort();
    const want = prevYm(now);
    return {
      want,
      latest: ids.length ? ids[ids.length - 1] : null,
      months: ids.length,
      current: ids.includes(want),
    };
  } catch { return null; }
}

/* The week's two Daily Setup boards — the source for every shift-owned row.
 *
 * ★ READ HERE, NOT IN App.jsx, DELIBERATELY. `extras` already flows from this
 * function straight into buildRows, so putting the read here means the whole
 * feature ships in ONE file with ZERO App.jsx changes — which matters because
 * App.jsx is edited by parallel sessions and a stale copy of it silently
 * reverts other people's work. Same reasoning that put the item-gaps editor in
 * FoodCostTracker.jsx rather than App.jsx.
 *
 * Two extra KV reads per dashboard load, both inside the existing Promise.all,
 * so they cost one round trip in wall time rather than two.
 *
 * Boards are ONE ROW PER WEEK, so a single pair of reads covers every day —
 * there is no per-day fan-out here.
 */
async function readBoards(kvGet, now) {
  if (typeof kvGet !== "function") return null;
  const monday = boardMondayKey(now);
  const [foh, boh] = await Promise.all([
    kvGet(boardKey("foh", monday)).catch(() => null),
    kvGet(boardKey("boh", monday)).catch(() => null),
  ]);
  if (!foh && !boh) return null;              // no board → shift rows stay with the overseer
  return { foh: foh || {}, boh: boh || {} };
}

export async function readExtras({ kvGet, sharedGet, now = new Date(), prevBizDay, paperSeedFor } = {}) {
  /* ⚠️ POSITIONAL. This list and the Promise.all below must stay in lockstep —
     inserting a read without a matching name here shifts every value after it,
     silently, and each row then reports somebody else's data. `aha` sits
     directly after `supply` in both. */
  const [cleaning, ptoAt, drivers, goals, paper, daypart, laborbench, boards, checklists, slday, equip, thaw, foodq, waste, cash, fsdone, supply, aha, fsrota, trainer, ecosure] = await Promise.all([
    readCleaningToday(now, sharedGet).catch(() => null),
    readPto(kvGet).catch(() => null),
    readDrivers(kvGet).catch(() => null),
    readTeamGoals(kvGet, now).catch(() => null),
    readPaper(kvGet, now, paperSeedFor).catch(() => null),
    readDaypart(kvGet, now).catch(() => null),
    readLaborBench(kvGet, now).catch(() => null),
    readBoards(kvGet, now).catch(() => null),
    readOpsChecklists(kvGet, now).catch(() => null),
    readScorecardDay(kvGet, prevBizDay || prevBizDayIso(now)).catch(() => null),
    readEquip(kvGet).catch(() => null),
    readThaw(kvGet).catch(() => null),
    readFoodQuality(kvGet).catch(() => null),
    readWaste(kvGet).catch(() => null),
    readCashCounts(kvGet).catch(() => null),
    readFoodSafetyDone(kvGet).catch(() => null),
    readSupply(sharedGet).catch(() => null),
    readAhaMonth(kvGet, now).catch(() => null),
    readFoodSafetyRota(kvGet, now).catch(() => null),
    readTrainerTasks(kvGet, now).catch(() => null),
    /* ⚠️ APPENDED, NEVER INSERTED. The warning above is not decorative: this
       destructure is positional, so slotting a read into the middle shifts
       every value after it and each row silently reports somebody else's data.
       New reads go on the end of BOTH lists, together. */
    readEcosure(kvGet, now).catch(() => null),
  ]);
  return { cleaning, ptoAt, drivers, goals, paper, daypart, laborbench, boards, checklists, slday, equip, thaw, foodq, waste, cash, fsdone, supply, aha, fsrota, trainer, ecosure };
}

/* ── Row builder ──────────────────────────────────────────────────
 * Turns the definitions plus whatever has been read into display rows.
 * `daily` and `pulse` come from App.jsx's existing effects — those readers were
 * already correct and are reused rather than rewritten, so this change cannot
 * alter what the Today block has always reported.
 *
 * state: "late" · "ok" · "info" · "untracked"
 */
export function buildRows({ daily, pulse, extras, moneyGaps, now = new Date() } = {}) {
  const rows = [];
  const x = extras || {};
  /* ⚠️ ONE ROW PER INPUT — THE LAST ANSWER WINS.
     🐛 Matt, Aug 2 2026: "Trainer weekly tasks" appeared TWICE in the register,
     once as NOT TRACKED ("no status written yet by the nightly job") and again
     as CURRENT ("1 of 10 done · week of Jul 27"), directly contradicting each
     other on the same screen. Cause: this used to be a bare rows.push, so two
     different code paths could both describe the same input and BOTH rendered.
     A register whose whole job is to say what is missing must never print two
     answers for one question — the reader cannot tell which is true, and the
     pessimistic one is the one that gets acted on.

     Replacing rather than skipping is deliberate: the later call is the more
     specific one (a real reading arriving after an early not-tracked default),
     and it keeps its original POSITION so the on-screen order never jumps
     around between renders. */
  const rowAt = new Map();   // id -> index in rows
  const push = (id, o) => {
    const def = inputById(id);
    if (!def) return;
    const row = { ...def, ...o };
    const at = rowAt.get(id);
    if (at === undefined) { rowAt.set(id, rows.length); rows.push(row); }
    else rows[at] = row;
  };

  const late  = (id, tone, text, sub, extra) => push(id, { state: "late", tone, text, sub, ...(extra || {}) });
  const ok    = (id, note) => push(id, { state: "ok", note: note || "Entered" });
  const openList = (id, count, sub) => push(id, { state: "open", count, sub, note: `${count} open` });

  /* ★ THE THIRD STATE — ENTERED, BUT NOT ON GOAL (Jul 26 2026).
   *
   * Matt: "I want them all to be smart." Until now every row asked exactly one
   * question — was a number typed in — so a value that was entered and MISSING
   * ITS TARGET rendered green. Paper cost sat on screen as "CURRENT · 3.78%"
   * against a 3.27% goal, i.e. the dashboard called a half-point overrun fine
   * while the IPO close was treating the same number as a problem.
   *
   * ⚠️ THIS IS NOT "late". Nobody forgot anything — the input is complete and
   * on time. Reporting it as late would blame a person for a cost result and
   * would put it in the Today block, which is for things that clear when
   * someone acts. An off-goal number does not clear by being entered again.
   * Hence its own state: counted as TRACKED, never as a miss.
   */
  const offGoal = (id, note, sub, extra) => push(id, { state: "offgoal", note, sub, ...(extra || {}) });

  // ── The eight App.jsx already computed. daily === null means the effect
  // hasn't returned yet: report nothing rather than a fabricated miss.
  if (daily) {
    daily.sales      ? ok("sales")     : late("sales",     "amber", `${daily.pbdLabel} sales not entered`,     "Sales Allocation", { tab: "sales" });
    /* ⚠️ THE NAG'S `tab` BEATS THE ROW'S `tab`, WHICH IS WHY MOVING THE ROW DID
       NOTHING (Matt, Aug 8 2026: "inputting labor prompt is still not taking me
       to the fcr"). The row above already said tab: "fcr" — it was changed
       yesterday — and this line kept sending him to the Labor Planner anyway,
       because `late(...extra)` spreads over the row and the last write wins.
       Two places carry the same fact and nothing checks that they agree, which
       is the editor-vs-renderer mismatch this repo has shipped three times. */
    daily.hours      ? ok("hours")     : late("hours",     "amber", `${daily.pbdLabel} hours not entered`,     "FCR",              { tab: "fcr" });
    /* ⚠️ `x.slday` WINS when it is readable, because it can tell a half-entered
       day from a finished one and `daily.scorecard` cannot. The old existence
       test stays as the fallback so a storage failure degrades to exactly the
       behaviour this row has always had, never to silence. */
    if (!x.slday) {
      daily.scorecard ? ok("scorecard") : late("scorecard", "amber", `${daily.pbdLabel} leader scorecard not entered`, "Shift Leader Scorecard", { props: { initialDate: daily.pbd } });
    }

    // Giveaways carry two rows because they fail two different ways: not
    // entered at all, and entered with one side blanked. The second is RED —
    // a zeroed running total is already distorting a published food/paper %.
    if (daily.gvZeroSides && daily.gvZeroSides.length) {
      late("giveaways", "red", `Giveaway ${daily.gvZeroSides.join(" & ")} total reset to $0 — re-enter the running total`, "Food Cost", { tab: "foodcost" });
    } else if (!daily.giveaways) {
      /* ★ Jul 28 2026 — Matt: "For the daily input it just says food giveaways.
         It also needs to say food, paper, invoices." The row NAMES the whole
         daily Food Cost visit now, because that is what he actually does when
         he opens the tile. ⚠️ THE TRIGGER IS STILL THE GIVEAWAYS RECORD and
         that is deliberate: giveaways are the only DAILY-cadence input in the
         tile, so it is the only one that can be truthfully called missing for
         a given day. Invoices and transfers arrive on delivery days and keep
         their own rows (foodinv / paperinv / transfers) with a 7-day staleness
         test — testing those daily would fire falsely on every non-delivery
         day, which is the false-red class this file exists to avoid. So the
         text is a TO-DO naming what to enter, not a claim that all four are
         missing. */
      late("giveaways", "amber", `${daily.pbdLabel} food cost not entered \u00b7 giveaways, food, paper, invoices`, "Food Cost", { tab: "foodcost" });
    } else ok("giveaways");

    // Payroll: blank is a miss, but so is a payroll window that has fallen
    // BEHIND the sales window — that mismatch is what publishes a false red on
    // labor, and it looks completely normal on screen.
    if (!daily.wagesEntered) {
      late("wages", "amber", "MTD payroll not entered", "FCR", { tab: "fcr" });
    } else if (daily.wagesThrough && daily.lastSalesIso && daily.wagesThrough < daily.lastSalesIso) {
      late("wages", "red", `Payroll only covers through ${shortDate(daily.wagesThrough)} — sales are entered through ${shortDate(daily.lastSalesIso)}`, "FCR", { tab: "fcr" });
    } else ok("wages", daily.wagesThrough ? `Through ${shortDate(daily.wagesThrough)}` : "Entered");

    // Invoices: undefined = the record couldn't be read, which is not-tracked,
    // not a miss. STALE_DAYS is a judgment call, not a rule Matt gave — it is
    // set well beyond any normal delivery gap so it only speaks when something
    // has genuinely stopped arriving.
    // ⚠️ ONE threshold for all three, deliberately. 7 days is Claude's pick,
    // NOT a number Matt gave — set well beyond any normal delivery gap so it
    // only speaks when something has genuinely stopped arriving. Tune the one
    // constant rather than growing three.
    const ENTRY_STALE_DAYS = 7;
    const entryRow = (id, iso, noneText, staleNoun) => {
      // undefined = the month record could not be read at all, which is
      // not-tracked. null = read fine, nothing of this kind entered yet.
      if (iso === undefined) { push(id, { state: "untracked", note: "Entry list not readable from the month record" }); return; }
      if (!iso) { late(id, "amber", noneText, "Food Cost", { tab: "foodcost" }); return; }
      // CALENDAR days, not elapsed hours. Measuring from "now" undercounts by
      // one whenever it's earlier in the day than the anchor — an invoice from
      // the 13th read as 11 days old on the 25th. Both sides are pinned to
      // local noon so DST can't shift the answer either.
      const today12 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
      const days = Math.round((today12 - new Date(`${iso}T12:00:00`)) / 86400000);
      if (days > ENTRY_STALE_DAYS) late(id, "amber", `No ${staleNoun} entered in ${days} days`, "Food Cost", { tab: "foodcost" });
      else ok(id, `Last ${shortDate(iso)}`);
    };
    entryRow("foodinv",   daily.lastFoodInvIso,  "No food invoices entered this month",  "food invoice");
    entryRow("paperinv",  daily.lastPaperInvIso, "No paper invoices entered this month", "paper invoice");
    entryRow("transfers", daily.lastTransferIso, "No transfers entered this month",      "transfer");

    daily.eomYm   ? late("eom",   "amber", "End-of-month inventory due", "Food Cost", { tab: "foodcost" }) : ok("eom", "Not due");
    daily.guestYm ? late("guest", "amber", "Upload last month's guest scores", "Guest Experience") : ok("guest", "Up to date");

    // Quarter-long, not date-gated: these ride until the list is clear and the
    // row disappears at zero. null = store unreadable → no row, never a
    // fabricated count.
    if (daily.ipoOpen > 0) openList("ipo", daily.ipoOpen, "IPO Action Items");
    else if (daily.ipoOpen === 0) ok("ipo", "All clear");
    if (daily.facOpen > 0) openList("facilities", daily.facOpen, "Facilities");
    else if (daily.facOpen === 0) ok("facilities", "All clear");
  }

  if (pulse) {
    if (pulse.evalsOverdue > 0) late("evals", "red", `${pulse.evalsOverdue} eval${pulse.evalsOverdue === 1 ? "" : "s"} overdue`, "HR Console");
    else if (pulse.evalsDue > 0) late("evals", "amber", `${pulse.evalsDue} eval${pulse.evalsDue === 1 ? "" : "s"} due this week`, "HR Console");
    else ok("evals", "On time");
  }

  // ── New readers ──────────────────────────────────────────────
  // Cleaning: only after the day has had a chance to happen. Flagging an
  // unfinished list at 9am would be true and useless.
  if (x.cleaning && !x.cleaning.na) {
    const missing = [!x.cleaning.foh && "FOH", !x.cleaning.boh && "BOH"].filter(Boolean);
    if (missing.length && now.getHours() >= 18) {
      late("cleaning", "amber", `${x.cleaning.day} cleaning not signed off — ${missing.join(" + ")}`, "Daily Cleaning");
    } else ok("cleaning", missing.length ? "In progress" : "Signed off");
  }

  /* Same 18:00 gate as cleaning: these run THROUGH the day (opener → midday →
     closing), so an empty list at 10am means the shift has started, not that
     anyone is behind. Only after the evening does silence mean something. */
  if (x.checklists && !x.checklists.na) {
    /* `lastIso` comes from the OpsChecklists self-stamp, present only when
       today is empty AND the stamp names a prior day — so the late text can
       finally say HOW LONG, not just "not today". */
    const since = x.checklists.lastIso ? ` — last was ${shortDate(x.checklists.lastIso)}` : "";
    if (x.checklists.done > 0) ok("checklists", `${x.checklists.done} signed off today`);
    else if (now.getHours() >= 18) late("checklists", "amber", `No ops checklist items signed off today${since}`, "Ops Checklists");
    else ok("checklists", `Nothing signed off yet${since}`);
  }

  /* Equipment checks — weekly, against the same Monday-anchored week the
     reminder flag speaks for. Amber only from Thursday: the flag gives the
     store the WHOLE week, so nagging on Monday morning would be true and
     useless, the cleaning-at-9am problem at week scale.
     ⚠️ EQUIP_LATE_DOW = 4 (Thursday) is Claude's pick, not a day Matt gave. */
  /* Waste + donations — every store day. Judged against the previous business
     day, the same yardstick the other daily rows use, so a Monday morning does
     not call Sunday late. */
  if (x.waste) {
    const want = prevBizDayIso(now);
    if (!x.waste.has) {
      late("waste", "amber", "No waste or donations recorded yet", "Waste");
    } else if (x.waste.iso < want) {
      late("waste", "amber", `Waste not entered for ${shortDate(want)} — last was ${shortDate(x.waste.iso)}`, "Waste");
    } else {
      ok("waste", `Entered · through ${shortDate(x.waste.iso)}`);
    }
  }

  /* Safe + cashier counts. ⚠️ Judged on the SAFE count only — see readCashCounts
     for why the cashier list cannot be the test. */
  if (x.cash) {
    const want = prevBizDayIso(now);
    if (!x.cash.has) {
      late("cashcounts", "amber", "No safe count recorded yet", "Cash Audit");
    } else if (x.cash.iso < want) {
      late("cashcounts", "amber", `No safe count for ${shortDate(want)} — last was ${shortDate(x.cash.iso)}`, "Cash Audit");
    } else {
      ok("cashcounts", `Counted · through ${shortDate(x.cash.iso)}`);
    }
  }

  /* Food safety walkthrough — daily rota.
     ⚠️ NEVER RED WHEN NOTHING HAS EVER BEEN STAMPED. The stamp only started
     being written on Jul 28, so every walkthrough done before that is invisible
     here — calling the row late on day one would blame people for a record
     that did not exist yet. Absent reads amber and says so. */
  /* Supply — every two weeks. Measured in whole days from the newest sign-out,
     both sides pinned to local noon so a DST shift or a late-evening open can
     never move the count by one. */
  /* Monthly AHA. Asks for the month that just CLOSED, never the open one. */
  if (x.aha) {
    const a = x.aha;
    if (!a.has) {
      late("ahamonth", "amber", "Paste last month's AHA dashboard", "Shift Leader Scorecard");
    } else if (!a.current) {
      late("ahamonth", "amber", `${ymLabel(a.want)} AHA not pasted yet — newest on file is ${ymLabel(a.latest)}`, "Shift Leader Scorecard");
    } else {
      /* The headline is Target Zone, not System Usage. Usage is a gate the other
         charts sit behind; Target Zone is the one with waste and stock-outs in
         it, and at Gate City it is by far the weakest of the five. */
      const tz = a.rec && a.rec.targetZone;
      ok("ahamonth", `${ymLabel(a.latest)} in${tz != null ? ` · target zone ${tz}%` : ""} · ${a.months} month${a.months === 1 ? "" : "s"} on file`);
    }
  }

  if (x.supply) {
    if (!x.supply.has) {
      late("supply", "amber", "No supply order or sign-out recorded yet", "Supply Central");
    } else {
      const noon = (iso) => new Date(`${iso}T12:00:00`).getTime();
      const nowIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const days = Math.round((noon(nowIso) - noon(x.supply.iso)) / 86400000);
      if (days > SUPPLY_STALE_DAYS) {
        /* Says which one it actually was. Claiming a sign-out when the last
           activity was an order is a small lie, and it is the kind that costs
           trust in every other row on the page. */
        late("supply", "amber", `Nothing ordered or signed out in ${days} days — last was a ${x.supply.kind || "sign-out"} on ${shortDate(x.supply.iso)}`, "Supply Central");
      } else {
        ok("supply", `Last ${x.supply.kind || "sign-out"} ${shortDate(x.supply.iso)}`);
      }
    }
  }

  if (x.fsdone) {
    const want = prevBizDayIso(now);
    if (!x.fsdone.has) {
      late("foodsafety", "amber", "No completed walkthrough recorded yet", "Food Safety");
    } else if (x.fsdone.iso < want) {
      late("foodsafety", "amber", `No walkthrough for ${shortDate(want)} — last was ${shortDate(x.fsdone.iso)}`, "Food Safety");
    } else {
      ok("foodsafety", `Done ${shortDate(x.fsdone.iso)}${x.fsdone.by ? ` · ${x.fsdone.by}` : ""}`);
    }
  }

  if (x.equip) {
    const EQUIP_LATE_DOW = 4;
    const thisWeek = x.equip.has && x.equip.week === mondayKeyOf(now);
    if (thisWeek) {
      const who = [x.equip.shift, x.equip.iso ? shortDate(x.equip.iso) : "", x.equip.by].filter(Boolean).join(" · ");
      ok("equipment", who || "Checked this week");
    } else if (now.getDay() >= EQUIP_LATE_DOW) { // Thu–Sat only; Sunday is closed and never flags
      late("equipment", "amber",
        x.equip.has ? `No equipment check this week — last was ${shortDate(x.equip.iso) || "earlier"}` : "No equipment check recorded this week",
        "Equipment Log");
    } else {
      ok("equipment", x.equip.has ? `Not yet this week · last ${shortDate(x.equip.iso)}` : "Not yet this week");
    }
  }

  /* Food quality — WEEKLY sweep, Monday-anchored, and the QUARTERLY review of
     the source list. Both come off one read.
     Amber only from Thursday, the same reasoning as the equipment row: the
     sweep has the whole week, so nagging on Monday would be true and useless.
     ⚠️ FQ_LATE_DOW = 4 mirrors EQUIP_LATE_DOW — Claude's pick, not Matt's. */
  if (x.foodq) {
    const FQ_LATE_DOW = 4;
    const thisWeek = x.foodq.has && x.foodq.week === mondayKeyOf(now);
    if (thisWeek) {
      const bits = [
        x.foodq.pct == null ? null : `${x.foodq.pct}%`,
        x.foodq.flagged ? `${x.foodq.flagged} flagged` : "nothing flagged",
        x.foodq.by || null,
      ].filter(Boolean);
      ok("foodquality", bits.join(" · "));
    } else if (now.getDay() >= FQ_LATE_DOW) { // Thu–Sat only; Sunday is closed and never flags
      late("foodquality", "amber",
        x.foodq.has ? `No sweep this week — last was week of ${shortDate(x.foodq.week)}` : "No food quality sweep recorded this week",
        "Food Quality");
    } else {
      ok("foodquality", x.foodq.has ? `Not yet this week · last week of ${shortDate(x.foodq.week)}` : "Not yet this week");
    }

    /* The source list. Late once the CURRENT quarter has never been reviewed —
       the item list is seeded from one specific QIV edition and CFA reissues it
       every quarter. Amber, never red: nothing is broken, a review is overdue. */
    const nowQ = quarterOf(now);
    const q = x.foodq.qiv;
    if (q && q.quarter === nowQ) {
      ok("qivsource", `${q.version || nowQ} reviewed${q.reviewedAt ? ` · ${shortDate(q.reviewedAt)}` : ""}`);
    } else if (q && q.quarter) {
      late("qivsource", "amber", `Item list last checked against ${q.version || q.quarter} — ${nowQ} has not been reviewed`, "Food Quality");
    }
    // no qiv block at all → the catch-all untracked sweep reports it grey
  }

  /* EcoSure — a quarterly audit, so LATE is amber and never red: the visit
     lands when EcoSure turns up, not when somebody forgets something. When it
     IS in, the row says what it found, because "done" is the least useful thing
     the register could tell him about an audit — a repeat finding is what the
     next walkthrough should be looking at. */
  if (x.ecosure) {
    const e = x.ecosure;
    if (e.has) {
      const bits = [`${e.total} finding${e.total === 1 ? "" : "s"}`];
      if (e.repeats > 0) bits.push(`${e.repeats} repeat`);
      if (e.level != null) bits.push(`level ${e.level}`);
      ok("ecosure", `${e.want} · ${bits.join(" · ")}`);
    } else {
      late("ecosure", "amber",
        e.lastRound ? `${e.want} not entered — last visit on file is ${e.lastRound}` : `${e.want} not entered`,
        "Food Safety");
    }
  }

  /* Thaw allocation — a health row, not a data-entry row. Nothing here is a
     person forgetting something, so nothing is red:
     · no basis at all → LATE amber (pars render 0 — Sales Allocation needs
       recent weekends entered; that IS an input someone can act on)
     · manual override armed → OFF GOAL amber (deliberate, complete, worth
       seeing every day it stays armed — pars are not following live sales)
     · stamp not moving → LATE amber past THAW_STALE_DAYS (nobody has looked
       at the pars; ⚠️ 14 is Claude's pick, tune or delete freely)
     · otherwise ok, showing the live basis and when it was last seen. */
  if (x.thaw) {
    const THAW_STALE_DAYS = 14;
    const ageDays = Math.round((now - new Date(x.thaw.at)) / 86400000);
    const seen = shortDate(String(x.thaw.at).slice(0, 10));
    const basis = x.thaw.alloc != null ? `$${Math.round(x.thaw.alloc).toLocaleString()}` : null;
    if (x.thaw.alloc == null) {
      late("thaw", "amber", "Thaw pars have no basis — enter recent weekends in Sales Allocation", "Thaw Allocation");
    } else if (!x.thaw.auto) {
      offGoal("thaw", `Manual override armed at ${basis} — pars not following live sales`, "Thaw Allocation", { tone: "amber" });
    } else if (ageDays > THAW_STALE_DAYS) {
      late("thaw", "amber", `Thaw pars not checked in ${ageDays} days`, "Thaw Allocation");
    } else {
      ok("thaw", `Live · ${basis} basis · seen ${seen}`);
    }
  }

  // Paper cost %: the last COMPLETE week only. Amber, never red — a missing
  // number is a gap in visibility, not a cost overrun, and red would rank it
  // alongside a zeroed giveaway total that is actively distorting a published %.
  if (x.paper) {
    // `seeded` = no weekly number was typed and this is the live MTD figure
    // from Food Cost. It counts as ENTERED (the number is on screen and the
    // register should not nag for it) but every line SAYS it is month to date,
    // so a monthly figure is never quietly read as that week's.
    const pSrc = x.paper.seeded ? " · month to date from Food Cost" : "";
    if (x.paper.pct === null) {
      late("paperpct", "amber", `Paper cost % not entered for week of ${shortDate(x.paper.week)}`, "Shift Leader Scorecard");
    } else if (x.paper.pct > paperGoal()) {
      /* GOAL AND BAND MIRROR ShiftLeaderScorecard.jsx's own pill — the number
         and the target must never disagree between the two screens showing it.
         Over goal is amber; past the band it is red, the same escalation the
         pill uses. */
      offGoal("paperpct",
        `${x.paper.pct.toFixed(2)}% vs ${paperGoal()}% goal · week of ${shortDate(x.paper.week)}${pSrc}`,
        "Shift Leader Scorecard",
        { tone: x.paper.pct > paperGoal() + paperBand() ? "red" : "amber" });
    } else ok("paperpct", `${x.paper.pct.toFixed(2)}% · on goal · week of ${shortDate(x.paper.week)}${pSrc}`);
  }

  // Daypart labor. Amber only ever names LAST month — never the open one, which
  // has not been published yet and could not be entered if he wanted to.
  if (x.daypart) {
    const d = x.daypart;
    const hist = d.months >= 12
      ? `${d.months} months on file — full year available`
      : `${d.months} of 12 months on file`;
    if (!d.current) {
      late("daypart", "amber", `Upload ${ymLabel(d.want)} labor productivity from AnalyticsHub`,
        "Labor Planner", { tab: "labor" });
    } else ok("daypart", `${ymLabel(d.latest)} entered · ${hist}`);
  }

  // Labor cost opportunity. Same last-month-only rule as the daypart row above:
  // the TIR is published after the month closes, so nagging about the open month
  // would be asking for a number that does not exist yet.
  if (x.laborbench) {
    const b = x.laborbench;
    if (!b.current) {
      late("laborbench", "amber", `Upload ${ymLabel(b.want)} labor cost opportunity from the TIR Overview`,
        "Labor Planner", { tab: "labor" });
    } else {
      ok("laborbench", `${ymLabel(b.latest)} entered · ${b.months} month${b.months === 1 ? "" : "s"} on file`);
    }
  }


  if (x.drivers === 0) late("drivers", "amber", "Approved-to-drive list is empty — mileage is falling back to the old names", "HR Console");
  else if (typeof x.drivers === "number") ok("drivers", `${x.drivers} approved`);

  // Team goals: from the 1st, with a few days of grace before it counts as late.
  if (x.goals) {
    if (!x.goals.set && now.getDate() >= 5) late("teamgoals", "amber", "This month's team goals not set", "Team Site");
    else ok("teamgoals", x.goals.set ? "Set" : "Not due yet");
  }

  // Item gaps fall out of the food card's own load — no second read. `stale`
  // means it had to fall back to an older month than last, i.e. nobody has
  // entered the latest one.
  /* Names the SOURCE in the reminder. A row that says "not entered" without
     saying where the number lives sends someone hunting; this one tells them
     it is the AnalyticsHub drilldown and that paper counts too. */
  if (moneyGaps && moneyGaps.stale) late("itemgaps", "amber", "Upload last month's food + paper item gaps from AnalyticsHub", "Food Cost", { tab: "foodcost" });
  else if (moneyGaps) ok("itemgaps", "Food + paper entered for last month");

  if (x.ptoAt) push("pto", { state: "info", note: `Last updated ${new Date(x.ptoAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` });

  /* Leader scorecard, by DAYPART rather than by existence. */
  if (x.slday) {
    const { filled, total } = x.slday;
    const sub = "Shift Leader Scorecard";
    const props = { props: { initialDate: x.slday.iso } };
    if (filled === 0) {
      late("scorecard", "amber", `${shortDate(x.slday.iso)} leader scorecard not entered`, sub, props);
    } else if (filled < total) {
      /* AMBER, and it says WHICH part is missing by counting rather than by
         naming — a leader reads "2 of 4 dayparts" and knows to open it; naming
         the two would need the daypart labels the scorecard owns, and a label
         that drifts from that tile is worse than a count that cannot. */
      late("scorecard", "amber", `${shortDate(x.slday.iso)} leader scorecard is ${filled} of ${total} dayparts`, sub, props);
    } else {
      ok("scorecard", `All ${total} dayparts · ${shortDate(x.slday.iso)}`);
    }
  }

  /* ── THE EXPIRY ROW ───────────────────────────────────────────
     Emitted HERE, above the untracked sweeps, so the catch-all doesn't also
     push it — the sweeps below claim any definition that has no row yet, and a
     row added after them would appear twice. */

  /* THE EXPIRY CHECK. Reports only states that cannot occur on a healthy day,
     so it stays quiet through every normal one: no board yet at 6am, a BOH FC
     with no morning name, a closed Sunday. RED, not amber — a router that has
     stopped resolving is not a late entry, it is a feature that has silently
     stopped working, and it gets worse the longer it goes unnoticed. */
  const health = boardHealth(x.boards, now, (x.cleaning && x.cleaning.buckets) || null);
  if (health.checked && !health.ok) {
    late("routing", "red", health.issues[0].detail,
       "Daily Setup", { note: `${health.issues.length} routing check${health.issues.length > 1 ? "s" : ""} failed`, issues: health.issues });
  } else if (health.checked) {
    ok("routing", "Shift rows are routing to the board");
  }

  // ── Everything with no reader yet ────────────────────────────
  /* 🐛 THIS USED TO APPEND STRAIGHT TO `rows` AND THE ROW APPEARED TWICE
     (Matt, Aug 5 2026, looking at the new How often view: Trainer weekly tasks
     rendered as NOT TRACKED and as "0 of 10 done · week of Aug 3", one above
     the other, contradicting itself).
     `push()` keeps a `rowAt` index so a later, more specific reading REPLACES an
     earlier default rather than stacking on it. These two fallbacks bypassed it
     with a bare `rows.push`, so the index never learned the row existed. This
     sweep runs at line ~1539 and the trainer reader at ~1621, so the untracked
     default landed first, and when `ok("trainer", ...)` ran it looked the id up,
     found nothing in the index, and appended a SECOND row.
     ⚠️ IT WAS INVISIBLE UNTIL TODAY. Both copies sat in a long flat list where
     nobody scans for a repeat. Grouping the register by cadence put them
     directly beside each other, which is the only reason it was ever seen.
     ⇒ Both fallbacks now go through `push()`. One way to add a row, so the
     replace-in-place behaviour cannot be bypassed by accident again. */
  /* 🐛🐛 AND THE FIX ABOVE CREATED A WORSE BUG THAN THE ONE IT CURED (found
     Aug 6 2026 while registering EcoSure).
     Moving this sweep onto push() stopped the DUPLICATE row. But push()
     REPLACES by id, and this sweep runs LATE — after every real reader — so it
     did not fill a gap, it overwrote the answer. Every input carrying an
     `untracked` fallback was forced back to "not tracked" no matter what had
     just been read: equipment, foodquality, qivsource, routing, thaw, trainer
     and ecosure. Seven of them, permanently grey, whatever the store did.
     ⚠️ THIS IS THE OPEN MYSTERY IN CRON-JOBS.md. That file records, from Jul 29
     2026, that "Trainer weekly tasks reads 'not tracked' for a reason that is
     NOT a dead cron... still unidentified", and warns against fixing it by
     adding a second cron entry. It was never the cron. It was this line.
     ⇒ A FALLBACK MUST ONLY EVER FILL A GAP. Same guard the catch-all sweep
     below already had — the difference between the two is the whole bug. */
  INPUTS.filter((i) => i.untracked).forEach((i) => {
    if (rows.some((r) => r.id === i.id)) return;
    push(i.id, { state: "untracked", note: i.untracked });
  });

  // ★★ A ROW THAT NEVER EMITS IS THE ONE FAILURE THIS REGISTER CANNOT AFFORD.
  // Several readers above are `if (x.foo) …` with no else — cleaning, paper %,
  // drivers, team goals, PTO. When their source is missing or unreadable the
  // branch simply doesn't run and NO ROW IS PUSHED, so the input vanishes from
  // the register entirely: not late, not untracked, not counted. The register
  // goes silent about precisely the input it was added to watch, and the header
  // count quietly drops by one with nothing on screen to explain it.
  // (Live example: `pto` only emits when `x.ptoAt` exists, so a PTO record with
  // no update stamp removes the row rather than reporting it.)
  //
  // ⚠️ THESE ARE "untracked", NEVER "late". A source we could not read is not
  // the same as a person who did not do something, and fabricating a miss is
  // the fastest way to make people stop trusting the panel.
  /* Same fix as the sweep above, same reason. This one is the catch-all for an
     input with no reader at all, and it runs LAST, so in practice it rarely
     collided. "Rarely" is not "never", and one way to add a row is the point. */
  INPUTS.forEach((i) => {
    if (rows.some((r) => r.id === i.id)) return;
    push(i.id, { state: "untracked", note: i.untracked || "No reading available yet" });
  });

  /* ── WHO OWNS THE SHIFT ROWS TODAY ────────────────────────────
   * Matt, Jul 26: "For the checklist and cleaning lists I want it to assign by
   * using the setup. Audit is by open and closing leaders."
   *
   * Done LAST, as a pass over the finished rows, on purpose: it changes only
   * WHO a row is addressed to, never whether it is late or what it says. Every
   * reader above still computes exactly what it computed before, so this cannot
   * move a single row's state — the same discipline that let the register be
   * introduced without changing what Today had always reported.
   *
   * No boards → no `resolvedOwners` → the rows sit with the overseer, which is
   * precisely where they sat before this existed. The failure mode is the old
   * behaviour, not a new one.
   */
  if (x.boards) {
    const shift = boardShift(x.boards, now);

    rows.forEach((r) => {
      if (!r.owner || r.owner.kind !== "shift") return;
      const owners = ownersForInput(r.id, shift);
      if (!owners) return;
      r.resolvedOwners = owners;
      // The label is what the by-owner view groups on, so a resolved row shows
      // the real names instead of the generic seat it was waiting on.
      r.owner = { ...r.owner, label: owners.names.join(", ") };
    });
  }

  /* ── FOOD SAFETY IS ROUTED BY THE ROTA, NOT BY THE BOARD ──────────
   * 🐛 Matt, Jul 29: "Why is food safety waiting on me?" It was not. The rota
   * had assigned Lizbeth Gonzalez that morning and Julie the day before
   * — real people, no fallback, working exactly as built. The rota and the
   * input register had simply never been introduced to each other, so `ownsRow`
   * asked who owned the row, got nothing back, and fell through to the
   * overseer. Every day. The one person it should never have landed on is the
   * one it always landed on.
   *
   * ⚠️ SEPARATE PASS FROM THE BOARD BLOCK ABOVE, ON PURPOSE. boardOwner.js
   * states outright that `foodsafety` must NOT get a SHIFT_INPUTS rule, because
   * the rota already owns the decision and two systems answering one question
   * will drift. Adding it there would have been the easy fix and the wrong one.
   * This consumes the rota's ANSWER and derives nothing.
   *
   * ⚠️ Same discipline as the block above: this changes only WHO the row is
   * addressed to. It cannot make the row late or not-late — that is still
   * decided entirely by whether a walkthrough was stamped.
   */
  /* ★ TRAINER WEEKLY TASKS. Reports PROGRESS, and calls the row late only when
     the STATUS ITSELF is stale — i.e. the nightly job has not written this
     week yet. That is a fact about the data.
     ⚠️ IT DELIBERATELY DOES NOT CALL "1 of 10 done on a Wednesday" LATE. No
     within-week deadline has ever been set for these, and inventing one would
     put a red row on the dashboard on a rule Matt never agreed — the same
     mistake as picking INVOICE_STALE_DAYS out of the air. Show the count, let
     him judge. If he sets a deadline later, this is the one place to add it. */
  if (x.trainer) {
    const t = x.trainer;
    if (t.weekOf && t.thisWeek && t.weekOf !== t.thisWeek) {
      late("trainer", "amber", `Status is from week of ${shortDate(t.weekOf)} — the nightly job has not written this week`, "Trainer Tasks");
    } else if (t.done >= t.total) {
      ok("trainer", `All ${t.total} done`);
    } else {
      ok("trainer", `${t.done} of ${t.total} done${t.weekOf ? ` · week of ${shortDate(t.weekOf)}` : ""}`);
    }
  }

  if (x.fsrota && x.fsrota.name) {
    const row = rows.find((r) => r.id === "foodsafety");
    if (row && row.owner) {
      row.resolvedOwners = { names: [x.fsrota.name], label: "Today's food safety rota" };
      row.owner = { ...row.owner, label: x.fsrota.name };
    }
  }

  return rows;
}

/* Rows this person should see, split for the two views. */
/* ★ EVERYONE SEES THE WHOLE PICTURE; ONLY *YOURS* ASKS ANYTHING OF YOU.
   Matt, Jul 29 2026: "I want everyone to see what they own but I want the whole
   picture."

   Two different questions were being answered by one list:
     "what do I have to do?"        → mine. Small, personal, actionable.
     "how is the store doing?"      → all. Context, and the reason to care.
   Showing only `mine` answered the first and made the second unavailable to
   anybody below Executive Director, so a Team Leader could not tell whether the
   store was on top of things or falling over.

   ⚠️ `needs` STAYS YOURS ALONE. That is what the Today block renders, and it is
   a list of things that clear when YOU act. Filling it with everyone's late rows
   is the spraying failure this file already warns about: a person who cannot act
   on four of the six lines in front of them stops reading all six.
   ⚠️ Each row is stamped `mine` so the screen can say which is which. Without
   it "the whole picture" and "your list" look identical and the register stops
   telling anyone what to do. */
export function forPerson(rows, person, tier) {
  const all = rows.map((r) => ({ ...r, mine: ownsRow(r, person, tier) }));
  const mine = all.filter((r) => r.mine);
  // `needs` is what the Today block renders, and it is DATED ONLY — something
  // happened on a particular day and it will clear. Standing lists come back
  // separately so Today can be genuinely empty on a day that asks nothing,
  // which is the entire point of having a Today block.
  /* ★ ORDERED BY WHAT IT BREAKS, NOT JUST BY COLOUR.
     Matt, Jul 29 2026, on making the dashboard smarter: rank by consequence.

     Every row already says what it FEEDS — 24 of them carry it. That is the
     information needed to tell a missing food invoice (distorts food cost,
     which moves the L10 board and the digest) from a missing cleaning sign-off
     (a record, and nothing downstream reads it). Both were amber. Both sorted
     the same.

     `weight` is the number of things a row's absence moves, counted from the
     `feeds` sentence rather than hand-assigned per row — so a row added later
     is ranked automatically instead of quietly landing at the bottom. Colour
     still wins first, because red is a judgement somebody already made.

     ⚠️ A ROW WITH NO `feeds` IS NOT DEPRIORITISED. It sorts as ordinary, not
     last. Missing information about a row is not evidence the row is
     unimportant, and treating it that way would bury anything new. */
  const CONSEQUENCE = [
    "L10", "scorecard", "digest", "labor %", "food cost", "paper cost",
    "productivity", "profit", "Labor card",
  ];
  const weightOf = (r) => {
    const t = String(r.feeds || "");
    if (!t) return 1;                       // unknown, not unimportant
    return CONSEQUENCE.reduce((n, k) => (t.includes(k) ? n + 1 : n), 0);
  };
  const needs = mine.filter((r) => r.state === "late");
  const TONE = { red: 0, amber: 1 };
  /* ★★ THE DAILY MONEY CHAIN HAS A FIXED ORDER, AND IT BEATS URGENCY.
     Matt, Aug 8 2026: "It's because the order for things to input is wrong. It
     should be sales, giveaways, invoices and transfers, wages then scorecard."

     🐛 WHAT THIS FIXES. There was no order at all. This list sorted by colour,
     then by consequence weight, then ALPHABETICALLY BY LABEL — so the sequence a
     person worked through was decided by how the labels happen to be spelled.
     Nothing stopped payroll being entered before sales, or sales before the
     invoices that belong to the same day.

     That is not cosmetic. These five divide by each other. On the morning of
     Aug 8 sales were entered through the 7th and food invoices only through the
     6th, so the Hub published food cost as 23.91% against a 27.56% goal and the
     digest told 35 people it was meeting goal. It was 28.77%, over goal. A ratio
     is only honest when both sides cover the same days, and the surest way to get
     that is to ask for them in the order they depend on each other.

     ⚠️ seq BEATS TONE ON PURPOSE. Sorting a dependency chain by urgency is what
     produced the problem: whichever row happened to go red first jumped the
     queue and got entered out of order. A step that must happen third is third
     even when step four is louder.
     ⚠️ ONLY THE FIVE DAILY MONEY ROWS CARRY seq. Everything without one keeps
     the old colour-then-weight-then-label rule and sorts below the chain, so
     nothing else on the board changed position relative to its neighbours. */
  const seqOf = (r) => {
    const row = inputById(r.id);
    return row && typeof row.seq === "number" ? row.seq : Infinity;
  };
  needs.sort((a, b) =>
    seqOf(a) - seqOf(b) ||
    (TONE[a.tone] ?? 9) - (TONE[b.tone] ?? 9) ||
    weightOf(b) - weightOf(a) ||
    String(a.label).localeCompare(String(b.label)));

  const open = mine.filter((r) => r.state === "open").sort((a, b) => (b.count || 0) - (a.count || 0));
  /* Yours first, then everything else. Within each half the order the register
     already used is preserved, so the list does not reshuffle under someone who
     has learned where things sit. */
  const board = [...all].sort((x, y) => (y.mine === true) - (x.mine === true));
  return { mine, needs, open, all, board };
}

/* The by-owner map. Overseer only — a shared version of this is a scoreboard
 * of who is behind, in front of 106 people. */
/* ═══ INPUT STATUS PER TOOL ═══════════════════════════════════════════════
   Matt, Jul 29 2026: "group input health items with each tool or area".

   Every input row already names the tile that owns it, and the tile ids match
   the dashboard's — so the join has been sitting there unused. Inputs and tools
   have been two mental models for the same store: a row says food invoices are
   missing, and you then have to work out that Financials is where they live.
   This collapses that into one.

   ⚠️ WORST STATE WINS, and "off goal" outranks "needs you". A tile showing
   "2 need you" while one of its numbers is over target would hide the thing
   that costs money behind the thing that costs five minutes.
   ⚠️ NOT-TRACKED IS NOT A PROBLEM and never marks a tile. A row nobody reads
   yet is a gap in the Hub, not a gap in the store's work, and putting it on a
   tile would train people to ignore tile marks.
   ⚠️ Counts LATE rows only. Open lists are standing backlogs — facilities has
   32 open items every day of the quarter — and a permanent number on a tile is
   wallpaper within a week. */
/* ═══ WHAT A VENDOR BRIDGE COULD IMPORT ═══════════════════════════════════
   Matt, Jul 30 2026: "I want anything that could possibly be integrated to
   import data through vendor bridge to stand out so I can make that pitch to
   Nick and Corp."

   A row is bridgeable when the number ALREADY EXISTS in a CFA system and a
   person is retyping it into the Hub. That is the whole pitch: this is not a
   request for new data, it is a request to stop hand-copying data Chick-fil-A
   already has.

   ⚠️ THE FLAG IS ON THE ROW, NOT COMPUTED FROM THE `how` TEXT. Reading the
   sentence would work until somebody reworded it, and then the pitch would
   quietly lose a line. Each bridgeable row names its source system explicitly.

   ⚠️ HUB-NATIVE ROWS ARE NOT BRIDGEABLE AND MUST NOT BE COUNTED. Cleaning
   sign-offs, ops checklists, cash counts, waste — those are recorded IN the Hub
   because the Hub is where the work happens. There is no upstream system holding
   them, so putting them in the pitch would overstate it, and an overstated
   number is the fastest way to lose the argument in the room. */
export function bridgeCandidates(rows) {
  const seen = new Set();
  const items = [];
  (rows || []).forEach((r) => {
    if (!r || !r.bridge || seen.has(r.id)) return;
    seen.add(r.id);
    items.push({ id: r.id, label: r.label, system: r.bridge, cadence: r.cadence, feeds: r.feeds || "" });
  });
  const bySystem = {};
  items.forEach((i) => { (bySystem[i.system] = bySystem[i.system] || []).push(i.label); });
  return {
    items,
    bySystem,
    count: items.length,
    total: (rows || []).length,
    systems: Object.keys(bySystem).sort(),
  };
}

/* ★ THE TILE SAYS WHAT IS NEEDED, NOT JUST THAT SOMETHING IS (Matt, Aug 3
   2026, on the Start here strip: "this doesn't tell me what I need to do.
   Just that it needs me").

   Every late and off-goal row already carries the exact sentence — `late()`
   and `offGoal()` both take one, and the register prints it. This function
   was counting those rows and throwing the sentences away, so a tile that
   knew "enter last month's food item gaps" said "2 need you" and the only
   way to find out was to open it. On a phone at 11am that is four taps to
   learn something the dashboard already had.

   ⚠️ THE TILE CLAMPS THIS TO ONE LINE, on purpose — a card with something to
   say has to be exactly the height of one without, or the grid reshuffles at
   the moment it most needs to be readable. So the FIRST reason is spelled out
   and the rest become a count. The specific one leads because that is the
   part worth reading; "+2 more" truncating away costs nothing. */
export function statusByTool(rows) {
  const out = {};
  (rows || []).forEach((r) => {
    if (!r || !r.tile) return;
    const cur = out[r.tile] || { late: 0, offgoal: 0, reasons: [] };
    if (r.state === "late" || r.state === "offgoal") {
      if (r.state === "late") cur.late += 1; else cur.offgoal += 1;
      /* Off-goal reads first: a number that is wrong beats a form that is
         late. Everything else keeps register order, which is already
         cadence-then-urgency. */
      if (typeof r.text === "string" && r.text.trim()) {
        if (r.state === "offgoal") cur.reasons.unshift(r.text.trim());
        else cur.reasons.push(r.text.trim());
      }
    }
    out[r.tile] = cur;
  });
  Object.keys(out).forEach((k) => {
    const v = out[k];
    v.tone = v.offgoal > 0 ? "offgoal" : v.late > 0 ? "late" : null;
    if (!v.tone) { delete out[k]; return; }
    const extra = v.late + v.offgoal - 1;
    /* No sentence on file falls back to the old wording rather than showing
       nothing. A row is always allowed to carry no text. */
    v.text = v.reasons.length === 0
      ? (v.offgoal > 0 ? "Off goal" : `${v.late} need${v.late === 1 ? "s" : ""} you`)
      : extra > 0 ? `${v.reasons[0]} · +${extra} more` : v.reasons[0];
  });
  return out;
}

/* ═══ GROUPED BY AREA ═════════════════════════════════════════════════════
   Matt, Jul 29 2026: "possibly having the prioritized tool first… group input
   health items with each tool or area".

   The register was ordered by CADENCE — daily, weekly, monthly. Nobody runs a
   store that way. You think "how are we doing on money" and "is the kitchen on
   top of things", and that is also how the work divides between people.

   ⚠️ THE AREAS ARE THE HUB'S OWN SECTIONS, passed in rather than defined here.
   Inventing a second taxonomy would mean two lists of areas drifting apart the
   first time a tool moved section — the same shape as the labour % that was
   published from two places with different precision this morning. One
   definition, in App.jsx, where the tiles already live.

   ⚠️ WORST FIRST WITHIN EACH AREA. Off goal, then late, then everything else.
   A group whose first line is "Current" reads as fine no matter what is three
   rows below it.
   ⚠️ AREAS WITH SOMETHING WRONG SORT ABOVE QUIET ONES, so a bad day reorders
   the register but never the tile grid. The register is a worklist and is meant
   to move; the grid is a map and is not. */
const STATE_RANK = { offgoal: 0, late: 1, open: 2, untracked: 3, info: 4, ok: 5 };

export function byArea(rows, areaOf) {
  const groups = new Map();
  (rows || []).forEach((r) => {
    const label = (areaOf && areaOf(r)) || "Other";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(r);
  });
  return [...groups.entries()]
    .map(([label, items]) => ({
      label,
      items: items.slice().sort((a, b) =>
        (STATE_RANK[a.state] ?? 9) - (STATE_RANK[b.state] ?? 9) ||
        String(a.label).localeCompare(String(b.label))),
      late: items.filter((i) => i.state === "late").length,
      offgoal: items.filter((i) => i.state === "offgoal").length,
    }))
    .sort((a, b) =>
      (b.offgoal > 0) - (a.offgoal > 0) ||
      b.late - a.late ||
      a.label.localeCompare(b.label));
}

export function byOwner(rows) {
  const groups = new Map();
  rows.forEach((r) => {
    const label = (r.owner && r.owner.label) || "Unassigned";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(r);
  });
  return [...groups.entries()]
    .map(([label, items]) => ({
      label,
      items,
      late: items.filter((i) => i.state === "late").length,
      untracked: items.filter((i) => i.state === "untracked").length,
    }))
    .sort((a, b) => b.late - a.late || b.items.length - a.items.length);
}
