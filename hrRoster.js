/* ══════════════════════════════════════════════════════════════════════════
   hrRoster.js — WHO IS ALLOWED TO READ EVERYONE'S HR RECORDS.

   ★ NEAR-LEAF. IT IMPORTS EXACTLY ONE THING: storeConfig.js, for the HR
   Console list. Nothing else may be added to that import.
   ⚠️ THIS LINE USED TO SAY "IT IMPORTS NOTHING, AND IT MUST STAY THAT WAY",
   and that stopped being true on Aug 7 2026. storeConfig.js imports nothing
   itself, so the graph is still a DAG and no cycle is possible — cyclecheck
   proves that on every run. The rule behind the original line is what matters
   and it still holds: this file is shared with the Worker, so it must never
   reach anything that could reach back.
   Both the browser and the Cloudflare Worker answer the same question — "is
   this person a full reader?" — and before this file existed only the browser
   could. The Worker cannot import HRConsole.jsx (a .jsx, a different runtime),
   so per-record filtering had nothing to filter ON. See build-checks note 6:
   shared logic lives in a leaf module or the import graph closes into a cycle.

   ── THE RULING IT ENCODES ──
   ⚠️ SUPERSEDED, Jul 29-31 2026. This header used to read "Full read: LDD,
   Human Resources, Executive Director, Payroll, **Director (effective Sat 1
   Aug)**, Owner" — Matt's 27-28 July ruling, which was RANK-BASED. Hannah
   narrowed it on Jul 28-29: "Only me, Matt, Bri, Cindy, and Nick", and "I do
   not want Daisy and Brandon to have access into HR console." Daisy and
   Brandon are the Directors that earlier line would have admitted, so the two
   rulings pointed opposite ways and Aug 1 was the day it would have bitten.
   The NAMED LIST WINS: see HR_CONSOLE_PEOPLE below. Rank is still required on
   top of it, so both conditions must hold.
   Everyone else sees only their own row. Assistant Director and Manager are
   OUT — all eight of them, and so is every Director not on the list.

   ⚠️ PAYROLL IS RANK 1 AND JOINS BY NAME, NOT BY RANK. Cindy reads
   every file but was never granted a single write power, and the ladder cannot
   express that — so she sits at the bottom of it and is OR'd in here. A
   rank-only test locks her out of the entire console on day one. Every WRITE
   gate in HRConsole.jsx is pure rank, so she stays excluded from those for
   free. Do not "tidy" this by giving Payroll a higher rank.

   ⚠️ THE TEST IS A PREDICATE, NOT A LIST OF TITLES. RANK carries aliases
   ("Leadership Director", "Executive", "Manager") that a hand-written name
   list would miss, silently locking out anyone set to one.
   ══════════════════════════════════════════════════════════════════════════ */

import { hrConsolePeople, HR_CONSOLE_OPEN_BY_RANK, isGateCity, extraTitleRanks } from "./storeConfig.js";

/* Title → rank. MUST stay byte-identical to RANK in HRConsole.jsx.
   ⏭️ HRConsole should import this and delete its local copy — held back only
   because the relative path from the app source to the repo root has not been
   confirmed yet. Until it does, these are two copies of one fact. */
export const HR_RANK_BY_TITLE = {
  Limited: 0, Employee: 1, "Team Member": 1, "Junior Trainer": 1, Payroll: 1,
  Trainer: 2, "Senior Trainer": 3, "Team Leader": 3, "Junior Team Leader": 3,
  "Senior Team Leader": 3, "Assistant Director": 4, Manager: 4, Director: 5,
  "Leadership Development Director": 6, "Leadership Director": 6,
  "Executive Director": 7, Executive: 7, "Human Resources": 7, Owner: 8,
  /* ★★ THE HOST, NOT A TEAM MEMBER. Matt, Aug 15 2026: "change me to support
     for all stores except my own." Backline Ops hosts the Village and Guilford,
     and until now supporting a store meant being a person on its roster.

     ⛔ IT IS RANK 8 ON PURPOSE, AND THE RANK IS THE WHOLE POINT OF THIS LINE.
     An unrecognised title scores 0 (see `hrRankOfTitle` below), so retitling
     somebody `Support` WITHOUT this entry drops them to team-member access the
     instant it saves — no HR Console, no full HR read. That is precisely the
     failure Hannah reported about Cindy in the note directly below, and the
     reason `Operator` must never be typed as a Hub title.

     ⚠️ RANK ALONE DOES NOT FINISH THE JOB. It buys the ACCESS half. The other
     half is being left OUT of headcount, turnover, the accountability chart and
     the team directory, because a host is not one of the store's people. Three
     of those four are wired as of Aug 16 2026 through `isHostTitle` below; the
     team directory is not, because its rows carry no title to read. This line
     used to say the pass "is not done yet" and that a Support row "still counts
     as staff" — half true now, which is why it is stated precisely here.
     ⚠️ EXCLUDE BY TITLE, NEVER BY NAME. Matt is an ordinary Owner at his own
     store and must stay counted there. */
  Support: 8,
  /* ⚠️ ADDED Jul 31 2026 BEFORE the title change, deliberately in that order.
     Hannah asked to move Cindy from "Human Resources" to "Accounts Payable"
     while keeping "the same functions as me in the hub". An unknown title
     scores 0 here, so making that change first would have dropped Cindy to
     team-member access the instant it was saved — which is the exact problem
     Hannah reported the day before ("Cindy only has team member access").
     Rank 7 is Hannah's own rank, which is what "same functions as me" means.
     ⚠️ NOT the same as `Payroll` (rank 1 + a by-name carve-out). Payroll reads
     every file but holds no write power; Accounts Payable here is a full HR
     peer. If the intent ever narrows to reading only, move it to 1 and rely on
     the Payroll carve-out instead — do not leave it at 7 and add exceptions. */
  "Accounts Payable": 7,
};

/* The rank at which someone reads every active record. Director and up.
   ⚠️ This is the ONE number to change if the ruling ever moves. It is
   deliberately NOT the same as HRConsole's LDD_MIN / ROLE_EDIT_MIN / the other
   six gates, which stay at 6 — a Director reads everything but cannot edit
   roles or templates, add or remove people, approve evaluations, or see
   TERMINATED records (Matt ruled terminated stays at 6, explicitly). */
export const HR_FULL_READ_MIN = 5;

/* ★ THE PTO LEDGER READS ONE RANK HIGHER THAN EVERYTHING ELSE (Aug 14 2026).
   Matt, Aug 10 2026, looking at a Director's phone: "Director should see these
   things but just not the profit share or PTO." Director is rank 5, so the
   shared HR door at HR_FULL_READ_MIN would admit exactly the person that
   ruling excludes.

   ⚠️ THIS NUMBER IS NOT A SECOND OPINION ABOUT RANK. It is the same bar the
   PTO tile's own editor gate already uses — PTOTracker.jsx `canEdit` is
   `hrInConsole && (Payroll || rank >= 6)`. Before today the screen enforced
   that and the data did not, which is the shape of every gate-written-twice
   bug in this repo. Now one predicate answers both.
   ⚠️ DO NOT "TIDY" THIS TO HR_FULL_READ_MIN. The gap between 5 and 6 is the
   ruling. Collapsing them silently hands a Director the store's bonus
   dollars. */
export const HR_PTO_READ_MIN = 6;

/* ★ HAS THIS PERSON LEFT? `gcfcr-hr-status` is a flat map of roster id → state,
   and the only state anything tests for is the string "terminated".

   ⚠️ IT LIVES HERE BECAUSE THE SCHEDULER NEEDED IT AND THERE WAS NOWHERE TO
   ASK. The comparison is currently written inline in four places — HRConsole's
   `isTerminated`, DailySetup's `departedNames`, TeamDirectory's roster diff and
   App.jsx's sign-in path. Those are deliberately NOT rewritten here: they work,
   they are in three multi-session files, and a sweep to unify them is its own
   task. This is the door for new code so a fifth spelling never appears.

   ⚠️ A MISSING MAP MEANS NOBODY HAS LEFT, WHICH IS THE SAFE DIRECTION FOR A
   SCHEDULER. The other reading — an unreadable map means everybody has left —
   would silently produce an empty week and look like a store with no staff.
   The CALLER is responsible for telling the difference between "read fine, no
   terminations" and "the read failed"; kvGetResult exists for exactly that. */
export const isTerminatedId = (statusMap, id) =>
  String((statusMap || {})[String(id == null ? "" : id)] || "") === "terminated";


/* ── THE SEED TITLES ────────────────────────────────────────────────────────
   Base job title for the original 106, taken mechanically from RAW_TEAM in
   HRConsole.jsx. Names and emails are deliberately NOT copied — the only fact
   an access decision needs is the title, and copying less means less that can
   drift.

   ⚠️ WITHOUT THIS THE WHOLE FILTER FAILS OPEN-ENDED THE WRONG WAY. Job-title
   OVERRIDES live in KV (gcfcr-hr-roles), but the BASE title for anyone never
   overridden lives only in the app bundle — so Bri, Hannah, Kyleeka, Matt and
   Nick have no title the Worker can see, and a filter without this table would
   deny the five people who most need full read.

   ⚠️ This array has NO WRITE PATH and never has. Anyone hired since lives in
   gcfcr-hr-added-v1 and is resolved from there. Do not add people here.

   ═══ EMPTY SINCE AUG 11 2026, AND IT STAYS EMPTY ═══════════════════════════
   ⚠️⚠️ DO NOT PUT TITLES BACK IN HERE.

   This held id → role for Gate City's 106, the twin of RAW_TEAM in hrTeam.js.
   Both were compiled into the JavaScript every visitor downloads without
   signing in, and both would have followed into a second store's copy.

   ⇒ THE ROSTER LIVES IN gcfcr-hr-added-v1 NOW, and this function already read
   it: `hrTitleFor` checks the role override, then `added`, then this. With the
   roster stored, the third arm is never needed. The Worker passes `added` at
   all six of its call sites already, so nothing here changed shape.

   ⚠️ EMPTIED TOGETHER WITH ITS TWIN, because they were keyed by the same ids.
   One without the other leaves the Worker resolving a title the browser never
   shows, or the reverse, with neither side complaining.

   ⚠️ EMPTY IS SAFE AND WAS TESTED. Every reader still answers, nothing throws,
   and hrIsFullReader fails CLOSED: an unknown id gets no access rather than all
   of it.

   ⚠️ THE PARAGRAPH ABOVE ABOUT "the base title lives only in the app bundle"
   IS NOW HISTORY, NOT INSTRUCTION. That was the reason this table existed. The
   base title lives in storage now, which is what made removing it possible. */
export const HR_SEED_ROLES = {};

/* HRConsole rewrites the retired "Manager" title to "Assistant Director" on
   load (both are rank 4, so this changes no decision — it keeps the two sides
   answering identically if the seed is ever edited). */
const normTitle = (r) => (r === "Manager" ? "Assistant Director" : String(r || ""));

/* ★★ THE BUILT-IN LADDER FIRST, THEN THE STORE'S OWN TITLES.

   A store names its own leadership roles — Kitchen Director, Talent Director,
   Hospitality Director — and every one of those scored 0 here, which is
   Limited. See `extraTitleRanks` in storeConfig.js.

   ⚠️⚠️ THE BUILT-IN MAP WINS, AND THAT ORDER IS THE SAFETY. If a store's list
   could override it, typing "Team Member: 5" into a settings screen would hand
   every team member every personnel file. A store may add a name the Hub does
   not have; it may never redefine one it does.

   ⚠️ READ AT CALL TIME, so a store's saved settings take effect without this
   module being re-imported — the same reason `hrConsolePeople` is a function.

   ⚠️ UNKNOWN IS STILL 0, AND 0 IS STILL LIMITED. Adding a lookup must not turn
   a typo into access. A title in neither place fails closed exactly as before. */
export const hrRankOfTitle = (title) => {
  const t = normTitle(title);
  /* ⚠️⚠️ `hasOwnProperty`, NOT TRUTHINESS. `Limited` is rank 0 and 0 is falsy,
     so a truthy test falls straight through to the store's map — meaning a
     settings screen could promote the one title whose entire job is to have no
     access. */
  if (Object.prototype.hasOwnProperty.call(HR_RANK_BY_TITLE, t)) return HR_RANK_BY_TITLE[t];
  const extra = extraTitleRanks();
  return extra[t] || 0;
};

/* ═══ WHAT TO CALL SOMEBODY ON THEIR OWN SCREEN ══════════════════════════════

   Matt, Aug 22 2026, off a screenshot of the Village header reading
   **"Matt · Director · Sign out"**: *"this should say support."*

   ⭐ HE HAD ALREADY DONE HIS HALF. That store's `gcfcr-hr-roles` holds exactly
   one entry and it is `"Support"`. The retitle worked. The chip never asked.

   ⛔⛔ IT PRINTED THE ACCESS TIER'S LABEL, AND TIER 3's LABEL IS THE WORD
   "Director". So every person at tier 3 read "Director" there — Owner,
   Executive Director, Human Resources, Accounts Payable, Payroll and Support
   alike. It was never one person's bug; the host title is just what made it
   visible, because the whole point of Support is that he is NOT staff at a
   store he hosts and that line called him a Director of it.

   ⚠️ THE TIER LABEL IS STILL RIGHT WHERE A TIER IS WHAT IS MEANT — what access
   a tool needs, and what access the PIN card is refusing. Those stay. This is
   the one place the answer is an IDENTITY rather than a level.

   ⚠️⚠️ IT DECIDES NOTHING ABOUT ACCESS, AND MUST NOT. It never asks a rank and
   never reads the ladder: a label that also grades is two things sharing one
   function, and the drift shows up as a screen saying one thing while a gate
   does another. `hrRankOfTitle` above is still the only answer to "what may
   this person do".

   ⚠️ A BLANK FALLS BACK TO THE TIER LABEL, which is exactly what every screen
   did before, so a store with nobody titled is untouched.
   ⚠️ A NON-STRING IS NOT A TITLE. `String(["Owner"])` is `"Owner"`, and the
   fail-open gate in `finShared.js` is what that trick already cost once. */
export const titleOrTier = (title, tier, tierNames) => {
  const t = typeof title === "string" ? title.trim() : "";
  if (t) return t;
  const label = tierNames && tierNames[tier];
  return typeof label === "string" && label ? label : "Signed in";
};

/* The Hub's three access tiers, from a job title. 1 = Team Member, 2 = Leader,
   3 = Director, which are App.jsx's own words for them.

   ⚠️⚠️ THIS LOGIC ALREADY EXISTS IN SIX OTHER FILES — App.jsx, HRConsole.jsx,
   worker.js, finShared.js, FinancialSuite.jsx and hubTraining.js each carry
   their own `roleTier`. That is design rule 8 broken six times over, and the
   thresholds (>= 6 and >= 3) are the kind of number that drifts silently: move
   one and a Director keeps a screen they should have lost, with nothing failing.
   ⇒ THIS IS THE ONE TO CONVERGE ON, not a seventh. It is here because hrRoster
   already owns the rank ladder those six all read from, so the pair belongs
   together. Converting the other six is its own task with real blast radius
   (worker.js and App.jsx are multi-session files) and is not done here — but
   nothing new should define this again.

   ⚠️ TITLE IN, NOT A PERSON. Callers that need a per-person answer must apply
   the role clamp in App.jsx first: somebody's SESSION tier can be deliberately
   below their HR title (Kyleeka and Bri both have one). This function answers
   "what does this title rank as", never "what may this person see". */
export const hrTierOfTitle = (title) => {
  const r = hrRankOfTitle(title);
  return r >= 6 ? 3 : r >= 3 ? 2 : 1;
};

/* ══════════════════════════════════════════════════════════════════════════
   ★★ WHO IS NOT ON THE FLOOR — the default answer, from a job title alone.

   Matt, Aug 14 2026, looking at the schedule: "remove everyone in sr
   leadership. just have the rest."

   Senior leadership is the tier 3 rung: Owner, Executive Director, Executive,
   Human Resources, Accounts Payable and the two Leadership Director titles.
   Those people are not rostered onto a station, so the builder should not be
   trying, and the availability list should not be chasing them for hours they
   are never asked for.

   ⚠️⚠️ MEASURED BEFORE IT WAS BUILT, not assumed. Across every Daily Setup
   board this store has saved, the number of times anybody holding one of these
   titles was placed on a station is ZERO. The only hits were the "edited by"
   trail on boards they changed for somebody else.

   ⚠️ IT IS A DEFAULT, NEVER A GATE. A person's own availability record beats
   this in both directions, which is what makes it safe: a store that really
   does roster its Executive Director ticks them back onto the floor and this
   never argues. See `isOffFloor` in availability.js for the precedence, which
   is the only place that decision is made.

   ⚠️ TITLE IN, NOT A PERSON, exactly like `hrTierOfTitle` above. And the caller
   must pass the EFFECTIVE title — the one from gcfcr-hr-roles where that map
   overrides the roster row. Passing the raw roster role misses anybody whose
   title was changed in HR Console, which at this store is a real person today.

   ⚠️ NOT A SEVENTH COPY OF THE TIER RULE. It reads `hrTierOfTitle` rather than
   re-testing `>= 6`, so if the tier boundary ever moves this moves with it. */
export const OFF_FLOOR_MIN_TIER = 3;

export const isOffFloorTitle = (title) => hrTierOfTitle(title) >= OFF_FLOOR_MIN_TIER;

/* ══════════════════════════════════════════════════════════════════════════
   THE FRONT-LINE LADDER — the titles the Leadership Development Director may
   hand out. ★ ONE DEFINITION. Two screens write the same gcfcr-hr-roles map.

   🐛 IT EXISTED TWICE AND DRIFTED, TWICE. HRConsole.jsx carried eight rungs and
   LeadershipDev.jsx carried five, missing "Trainer", "Junior Team Leader" and
   "Senior Team Leader" — so Bri, who owns the leadership pipeline, could not
   promote anyone to plain Trainer from her own tile. That is the SECOND time
   this list has bitten her: on Jul 25 2026 she reported "I have the ability to
   change titles in HR console for all tiers except Team Leader", the HRConsole
   copy was fixed, and the Leadership Dev copy never got the fix.

   ⚠️ LeadershipDev.jsx used to say merging these "would risk a cycle" because
   the other copy lives in HRConsole.jsx. That was a fair worry about importing
   between two components. It does not apply here: this file imports NOTHING and
   the Worker already shares it, which is exactly what a leaf is for.

   ⚠️ DELIBERATELY STOPS BELOW Director. Director and up carry HR Console
   access, documenting rights and the financial gates. Widening this list is a
   permissions change and belongs to Hannah, not to a bug fix. That decision is
   recorded in both files it came from and must survive any future edit here.

   Ascending, so it reads as the ladder it is. A screen wanting it the other way
   round should reverse a copy, never re-type the list. */
export const HR_ASSIGNABLE_LADDER = [
  "Team Member",
  "Junior Trainer",
  "Trainer",
  "Senior Trainer",
  "Junior Team Leader",
  "Team Leader",
  "Senior Team Leader",
  "Assistant Director",
];

/* Resolve one person's CURRENT job title.
   Precedence: role override → someone hired since the seed → the seed itself.
   `roles` is gcfcr-hr-roles, `added` is gcfcr-hr-added-v1; both come from KV,
   which is why this function takes them rather than fetching. */
export function hrTitleFor(id, roles, added) {
  const key = String(id || "");
  if (!key) return "";
  const ov = roles && roles[key];
  if (ov) return normTitle(ov);
  if (Array.isArray(added)) {
    const hit = added.find((m) => m && String(m.id) === key);
    if (hit && hit.role) return normTitle(hit.role);
  }
  /* ⚠️ THE SEED IS GATE CITY'S, so only Gate City may fall through to it. A
     second store's id 2 is not Gate City's id 2, and letting it resolve here
     would hand somebody a title, a rank, and the access that follows from it,
     purely because they hold the same number as one of Matt's leaders.
     Everything above this line still works for everyone: a role override wins
     first, then an imported roster in gcfcr-hr-added-v1. An unknown id gets ""
     and hrIsFullReader then fails closed, which is measured, not assumed.
     ⚠️ Called here rather than at module level for the reason written up on
     isGateCity: HR_SEED_ROLES is built at import, before settings arrive. */
  if (!isGateCity()) return "";
  return normTitle(HR_SEED_ROLES[key] || "");
}

/* ══════════════════════════════════════════════════════════════════════════
   WHAT A PERSON IS ACTUALLY CALLED.

   Matt, Aug 7 2026: "Should we add a preferred name or nickname spot to avoid
   confusion", then "seen everywhere".

   ⚠️ THIS IS SMALLER THAN IT LOOKS, AND THAT WAS WORTH CHECKING FIRST. The
   roster already stores KNOWN names, not legal ones — the seed says "Ally
   Hardie", "Cindy", "Hannah", "Matt", "Isaiah DeBrew",
   "Nicole Garcia", "Marchelle Moody". All seven people whose CFA Home record
   carries a different legal first name are ALREADY right here. So `preferred`
   is blank for 105 of 106 people and nothing about their screens moves.

   The one exception is the person the Aug 7 sweep caught: the roster says
   "Guadalupe" and the store says Lupe. Her two food
   quality rows matched nobody for months because the register said "Lupe
   Villanueva" and first names have to be equal. That was patched by teaching
   the register her other spelling; this is the general answer to it.

   The other half of the job is imports. The CFA Home export gives LEGAL names
   with the preferred one in brackets — "Jackson, Lindsay (Hannah)" — for 21 of
   103 rows. Without somewhere to put it, every future import buries the name
   the store actually uses.

   ★ `name` IS NEVER TOUCHED. 75 call sites across ten files match on a roster
   name. Rewriting `name` to the nickname would change every one of them at
   once, which is not a nickname field, it is a rename with a blast radius.
   `preferred` is additive: display prefers it, matching ACCEPTS it as well as
   the full name, and a record without one behaves exactly as it does today.
   Design rule 1 — an old record must still read. Every record is an old record
   here. */

/* One spelling-insensitive form of a person's name. Declared HERE, above its
   first use, rather than 40 lines below where it used to sit: hrNamesOf calls
   it, and a helper that only works because nobody happens to call it during
   module evaluation is a trap, not a design. Design rule 7. */
export const hrNormPerson = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

/* What to show a human. Falls back to the full name, so a blank or
   whitespace-only nickname can never blank out somebody's name on a screen. */
export function hrDisplayName(person) {
  if (!person || typeof person !== "object") return "";
  const pref = String(person.preferred || "").trim();
  return pref || String(person.name || "").trim();
}

/* Every spelling this person answers to, for MATCHING — never for display.
   ⚠️ ORDER MATTERS: the full name first, so anything that takes names[0] as
   the canonical one keeps getting the same answer it got before this existed.
   Deduped, because "Lupe" recorded as both name and preferred must not make a
   person match twice and look like two people. */
export function hrNamesOf(person) {
  if (!person || typeof person !== "object") return [];
  const out = [];
  for (const raw of [person.name, person.preferred]) {
    const v = String(raw || "").trim();
    if (v && !out.some((x) => hrNormPerson(x) === hrNormPerson(v))) out.push(v);
  }
  return out;
}

/* ═══ HR CONSOLE MEMBERSHIP ═══════════════════════════════════════════════
   ★ THE LIST ITSELF NOW LIVES IN storeConfig.js, WITH ALL OF ITS REASONING
   (Matt, Aug 7 2026: "move it"). It is the lock on every person's
   evaluations, injuries and CFA Home credentials, and it opens by NAME rather
   than by rank on purpose. Read the block above it there before touching it.

   It moved because it is the reason a SECOND store cannot open HR Console at
   all: those are Gate City's five names, and nothing a new store can reach
   from inside the Hub changes them. Their own Executive Director opens the
   console and sees nothing, with no setting anywhere to fix it.

   ⚠️ RE-EXPORTED, NOT REDEFINED. Two copies of an access list is exactly the
   drift this file warns about everywhere else.

   ⚠️ IT IS A CALL NOW, NOT A CONST (Aug 11 2026). The list moved into
   STORE_CONFIG.owners.hrConsole so a store can save its own five, and a
   captured const would have frozen Gate City's before a saved setting arrived.
   Nothing in the repo imported the old const from here — checked, every other
   mention is a comment — so this is a rename with no call sites to chase. */
export { hrConsolePeople };

/* Membership by roster id (Worker) or by name (browser). Anything unrecognised
   is NOT a member — an unknown id and an unknown name both fail closed. */
export function hrInConsole(idOrName) {
  /* ⚠️ FIRST-RUN STORES GATE ON RANK, NOT ON THIS LIST. See the long note on
     HR_CONSOLE_OPEN_BY_RANK in storeConfig.js for why this is an explicit
     flag and what it widens. Gate City has it false, so the line below never
     runs here and this function behaves exactly as it always has.
     ⚠️ RETURNING TRUE IS NOT "no gate". Every caller ANDs this with a rank or
     title test; this only decides whether the five-name list is also consulted.
     Do not add a caller that uses hrInConsole alone. */
  if (HR_CONSOLE_OPEN_BY_RANK) return true;
  const v = idOrName == null ? "" : String(idOrName);
  if (!v) return false;
  const n = hrNormPerson(v);
  /* ⚠️ SPELLED OUT RATHER THAN CHAINED. This is an access list; the next person
     reading it has to be able to see what it admits without working out
     operator precedence. Guards on every field because the list is a store's
     saved data now, not a literal in this repo, so a malformed row is possible
     and must fail closed rather than throw. */
  return hrConsolePeople().some((p) => {
    if (!p) return false;
    if (String(p.id) === v) return true;
    return Array.isArray(p.names) && p.names.includes(n);
  });
}

/* The primary display name for a member id, so the Worker can apply the
   name-keyed access overrides the browser applies. "" for non-members. */
export function hrPrimaryName(id) {
  const hit = hrConsolePeople().find((p) => p && String(p.id) === String(id || ""));
  /* Guarded on `names` for the same reason as hrInConsole: the list is saved
     data now, and a row with no names must answer "" rather than throw. */
  return hit && Array.isArray(hit.names) && hit.names.length ? hit.names[0] : "";
}

/* ★ THE PREDICATE. On the HR Console list AND (Director-and-up OR Payroll).
   Everything in the Hub that asks "can this person see everyone?" calls this
   rather than comparing a rank inline — that inline comparison IS the bug
   documented above.
   `effectiveTitle` (optional) lets a caller supply a title already lowered by
   accessOverrides.js; omitted, the stored HR title is used. Overrides only ever
   REDUCE access, so omitting it can never open anything. */
/* ⚠️ ONE BODY, TWO THRESHOLDS — design rule 8. There are now two "can this
   person read everyone" questions with different answers, and the tempting
   move is to copy this function and change the number. Two copies of an
   access rule is precisely what canSeeProfitShare did before it drifted from
   the route it was supposed to match. The threshold is a parameter instead,
   so the membership half can only ever be written once. */
function rankedReader(id, roles, added, effectiveTitle, min) {
  if (!hrInConsole(id)) return false;
  const title = effectiveTitle != null && effectiveTitle !== ""
    ? normTitle(effectiveTitle)
    : hrTitleFor(id, roles, added);
  if (title === "Payroll") return true;
  return hrRankOfTitle(title) >= min;
}

export function hrIsFullReader(id, roles, added, effectiveTitle) {
  return rankedReader(id, roles, added, effectiveTitle, HR_FULL_READ_MIN);
}

/* ★ THE PTO LEDGER'S OWN READER TEST. Same membership rule, one rank higher.
   See HR_PTO_READ_MIN for why the two differ and why that gap is load-bearing.
   ⚠️ STRICTLY NARROWER THAN hrIsFullReader, and callers rely on that: the
   Worker checks `canAll` first and only then this, so a PTO reader is always
   also a full reader and the extra roles lookup never runs for anyone the
   shared door already turned away. */
export function hrIsPtoReader(id, roles, added, effectiveTitle) {
  return rankedReader(id, roles, added, effectiveTitle, HR_PTO_READ_MIN);
}
