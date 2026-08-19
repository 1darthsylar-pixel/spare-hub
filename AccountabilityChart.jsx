import React, { useState, useEffect, useMemo } from "react";
import { AD_SEATS } from "./orgSeats.js";
import { isGateCity, STORE } from "./storeConfig.js";
/* ⚠️ FROM `hrTeam.js` AND `hrRoster.js`, NOT FROM `HRConsole.jsx`. HRConsole
   re-exports the same loader, and importing it from there would pull the whole
   console into the EOS chunk and put a multi-session file in this one's import
   path. These two are near-leaves — hrRoster imports storeConfig and nothing
   else — so cyclecheck stays clean and the chunk stays small. */
import { loadHRTeamResult, ROSTER_ADD_KEY } from "./hrTeam.js";
import { hrTitleFor, hrRankOfTitle, hrDisplayName } from "./hrRoster.js";
import { bareId } from "./nameMatch.js";
/* ⚠️ `kvGetResult`, NOT `kvGet`, FOR THE READ BEFORE A SAVE. kvGet flattens to
   the value, so "this key is not set yet" and "the database refused" both
   arrive as null. Saving on top of the second one would wipe every seat another
   director had already written. kvGetResult keeps `ok` separate from `value`,
   which is the whole distinction the save path turns on. */
import { kvGet, kvGetResult, kvSet } from "./store.js";

/* Where a store's own seat labels live. The chart has always READ this; since
   Aug 12 2026 the editor below writes it too. */
const CHART_SEATS_KEY = "org:chart-seats:v1";

// ============================================================
// AccountabilityChart.jsx — Gate City Hub
// Company Rocks + the leadership tree (accountability chart).
//
// Split out of LeadershipTile.jsx: that file is already ~41K
// chars, past the iPad paste ceiling. Import it there:
//   import AccountabilityChart from "./AccountabilityChart.jsx";
//   {tab === "chart" && <AccountabilityChart />}
// ...and add ["chart", "Team"] to the tab array.
//
// ⚠️ IT READS AND WRITES ONE KEY: org:chart-seats:v1, the seat map, through
// the editor further down. This line used to claim eos:companyrocks /
// org:chart / org:seats were read here and none of them ever were; the stale
// claim is how the hardcoded rocks survived three weeks of live edits one tab
// away (census R1, Jul 31). Rocks arrive as the liveRocks PROP from EOSTile,
// which owns that record — there is no hardcoded fallback any more, so an
// empty board now says so instead of printing a July snapshot.
// Seats marked OPEN are the 2026 roles already published on
// gatecitycfa1.wixsite.com. Candidate lists are editable.
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
  amber: "#C77D0A",
  amberSoft: "#FBF1DF",
  blue: "#1D5FA8",
  blueSoft: "#E6EFF9",
};

/* ═══ EVERYTHING BELOW IS GATE CITY'S, AND ONLY GATE CITY'S ═══════════════
   ⚠️⚠️ THIS CHART IS A PERSONNEL RECORD THAT THE BROWSER DOWNLOADS. The Aug 8
   2026 note further down already says so — it is the file that leaked a
   departure nobody had announced. What it did NOT say is that a second store
   running this code opens their own accountability chart and reads GATE CITY'S
   leadership team: nine named leaders with their seats, two full job
   descriptions naming ten more people, and thirty-four team members by name on
   the bench rows. Nothing errors. It just quietly is not their store.

   ★ NO GATE IS LEFT ON THE CHART ITSELF. There were three, and all three went
   by being DELETED rather than by being gated harder, which is the only thing
   that actually stops the shipping. The tree and the bench went first, derived
   from the store's own roster by `buildChart`. The SEATS went on 12 Aug 2026
   into `org:chart-seats:v1` and the editor further down. The fallback COMPANY
   ROCKS went the same day: EOSTile owns that record and passes it down, so the
   copy here was only ever a July snapshot waiting to be printed as if current.
   The open seats went last, on 12 Aug 2026, into `org:open-seats:v1` and the
   same editor. What is still gated in this file is ONE block of hand-written
   decisions further down, and the note on it explains why that one has no
   generic core to fall back to.
   ⚠️ IF YOU ADD A GATE BACK, MAKE IT A FUNCTION CALLED WHERE IT RENDERS, never
   a `const` captured at module load. `isGateCity()` reads the live store
   number, and a store that types its own into Settings has to be recognised
   from that moment rather than from the next deploy.

   ⚠️ WHAT A GATE DOES AND DOES NOT DO. It stops a clone INHERITING these
   people. It does NOT stop them SHIPPING — what is still written below is in
   the bundle every store downloads, and gating cannot change that. Getting
   something out means moving it into storage with a screen to edit it, the way
   the roster went and then the seats, or deleting it when another file already
   owns the record, the way the rocks went.
   ⚠️ WHAT IS STILL WRITTEN HERE, HONESTLY: the open-seat write-up, which names
   one person in its prose. It is the last one, and it is still a job.
   ⚠️ THEY DO NOT BELONG IN storeConfig.js EITHER, and that is why they are not
   there. The project rule is explicit: no personnel data in that file, because
   it ships to every browser with no account. Moving names out of one shipped
   file into another shipped file would look like progress and be none. */

/* ⛔ THE FALLBACK COMPANY ROCKS ARE GONE AND MUST NOT COME BACK. Four Rocks
   lived here, three leaders named as owners, each carrying this store's own
   guest-experience and car-count targets. (The figures are deliberately not
   repeated here: a comment in the file whose job is getting store data out of
   the bundle is a poor place to write store data back in.) They shipped in
   every store's bundle and were a July snapshot of a record that had moved on.
   EOSTile owns the real one, `eos:companyrocks:{quarter}`, and hands it down
   as the `liveRocks` prop. Deleted 12 Aug 2026, with the seats. */

// Individual Rocks with no company Rock to ladder into.
// (Storage consolidation reassigned to Brandon — see BOH bench below.)
const ORPHAN_ROCKS = [];

// ---- The tree ----
/* ═══ THE TREE IS DERIVED FROM THE ROSTER NOW ════════════════════════════════
   ⛔ THE NINE NAMES THAT WERE HERE ARE GONE AND MUST NOT COME BACK.

   This was a hand-typed list: Nick, Matt, Hannah, Kyleeka, Bri, Daisy,
   Brandon, Cindy, Rhonda, each with their seat. Two problems with that, and
   the second is the one that actually bit.

   1. A second store downloaded Gate City's leadership team.
   2. IT WENT STALE AND NOTHING SAID SO. Tyler Byrd sat on this chart for a
      week after he left; the note above BENCH records the hand-fix. Measured
      Aug 11 2026, the bench rows were out by more than a name: they claimed
      7 Senior Trainers where the roster holds 10, and 12 "Trainers" against 9
      Junior Trainers. A chart nobody can trust gets read once and ignored.

   ★ WHO IS ON THE CHART NOW COMES FROM THE HR ROSTER, which is already in
   storage, already every store's own, and already the thing HR edits when
   somebody is hired, promoted or terminated. So the chart cannot go stale
   again without HR being wrong first, and a new store gets their tree the
   moment they import their team — nothing to retype.

   ⚠️ WHAT THE ROSTER CANNOT KNOW IS THE SEAT. "CFO · CIO" is an
   accountability, not a job title, and EOS is the whole reason the two are
   different words. That is what `org:chart-seats:v1` holds, written by the
   editor further down, and it is keyed by ROSTER ID rather than by name: an id
   survives a marriage and a retitling, and the record carries no names at all
   as a result. (This sentence used to point at a `GC_SEATS` map "below". That
   map was deleted on 12 Aug 2026 once the record was populated and checked, and
   a comment still naming it is the same stale-claim trap as the one recorded at
   the top of this file.)

   ⚠️ TWO PEOPLE NEED A TIER OVERRIDE AND THAT IS NOT A BUG. Rank puts Cindy
   (Accounts Payable, rank 7) beside the Executive Directors and Rhonda (Team
   Leader) on the bench. Both belong under Support, which is a fact about the
   store rather than about their rank, so `tier` on their stored entry says so
   explicitly. A store with its own oddity sets the same field in the editor.
   ⚠️ A TIER OVERRIDE ALSO REMOVES SOMEBODY FROM THE BENCH. Rhonda is a Team
   Leader by title; without that rule she would render twice on one screen. */

/* ⛔ THE SEATS AND THEIR NOTES ARE GONE FROM THIS FILE AND MUST NOT COME BACK.
   Fourteen entries lived here: seat labels, two tier overrides, five
   specialties, and four notes that named about ten more people in prose. Every
   one of them was in the bundle each store downloads, which is the whole reason
   they had to move rather than just be gated.

   ★ WHERE THEY ARE NOW: `org:chart-seats:v1`, written by the seat editor below.
   Matt copied them across on 12 Aug 2026, and the stored record was checked
   against what used to be here BEFORE this block was deleted: all fourteen ids,
   both long director notes at 372 and 370 characters, the owner note, the
   marketing note, and all five specialties. The chart reads that record and
   nothing else now.

   ⚠️ A SEAT IS EDITED IN THE HUB, NOT HERE. If one is wrong, fix it on the Team
   tab. Typing a seat back into this file would put personnel data into every
   store's download again, and it would lose the next time somebody edits the
   record, because stored has always won over shipped.
   ⚠️ AND NOT IN storeConfig.js EITHER. That file ships too, and the rule against
   personnel data in it exists for exactly this temptation. */

/* The four tiers the chart prints, in order, with the ranks that land in each.
   ★ RANKS COME FROM `hrRankOfTitle`, THE LADDER HR ALREADY USES. Design rule 8:
   a second title-to-seniority map in this file would be the same fact written
   twice, and the copy that drifts is always the one nobody is looking at.
     8  Owner                                        → Owner / Operator
     7  Executive Director · Human Resources · …     → Executive Directors
     5-6 Director · Leadership Development Director  → Directors
   ⚠️ RANK 4 (Assistant Director) IS DELIBERATELY ABSENT. Those seats render
   further down from orgSeats.js, which is already per-store and already
   settable. Letting them in here would print every AD twice.
   ⚠️ SUPPORT HAS NO RANK. Nobody lands there by title; it is reached only by an
   explicit `tier` in the seat map, which is what makes it a decision rather
   than a side effect of a job title. */
const TIERS = [
  { id: "owner", label: "Owner / Operator", ranks: [8] },
  { id: "exec", label: "Executive Directors", ranks: [7] },
  { id: "dir", label: "Directors", ranks: [5, 6] },
  { id: "support", label: "Support", ranks: [] },
];

/* Who counts as bench depth: everybody developing toward leadership, by title.
   ⚠️ BY TITLE, NOT BY RANK, and the difference is Junior Trainer — rank 1,
   which it shares with Team Member. Seventy-five Team Members do not belong on
   a bench-depth panel, and a rank test cannot tell the two apart. */
const BENCH_TITLES = [
  "Team Leader", "Senior Team Leader", "Junior Team Leader",
  "Senior Trainer", "Trainer", "Junior Trainer",
];

/* ★ PURE, AND AT MODULE LEVEL (design rule 7). Takes everything it needs, so
   nothing here can read a value that has not been passed in, and it can be
   run against real KV in a test without React.
   Returns the same shape the renderer has always walked: levels of
   { id, label, people[{ name, seat, note }] }, plus bench rows of
   { label, count, names }. */
export function buildChart({ roster, roles, added, status, seats }) {
  const people = Array.isArray(roster) ? roster : [];
  const seatMap = seats && typeof seats === "object" ? seats : {};
  const statusMap = status && typeof status === "object" ? status : {};

  /* ⚠️ ACTIVE ONLY, AND THE DEFAULT IS ACTIVE. A person with no status entry
     has never been terminated — reading a missing key as "not active" would
     empty the chart the first time the status map failed to load. */
  const live = people.filter((m) => {
    if (!m || m.id == null) return false;
    const st = statusMap[bareId(m.id)] || m.status || "Active";
    return String(st).toLowerCase() !== "terminated";
  });

  const rows = live.map((m) => {
    const bare = bareId(m.id);
    /* ⚠️⚠️ THE `|| m.role` IS LOAD-BEARING AND WAS MISSING. `hrTitleFor` looks
       in the override map, then in the ADDED list, then in Gate City's seed —
       it never looks at the roster row it was asked about. Without the fallback
       this dropped Matt, Hannah, Kyleeka and Bri off the tree entirely and kept
       only Daisy and Brandon, whose titles happen to come from an override. It
       looked like four people had left.
       ⚠️ It survived a first pass because in production `added` and the roster
       are currently the SAME KV row, so the lookup happened to hit. That is a
       coincidence of today's storage, not a rule, and a chart that empties out
       when those two diverge is exactly the failure nobody would debug.
       ⚠️ READING THEIR OWN ROSTER ROW INHERITS NOTHING. hrTitleFor's
       isGateCity() guard exists to stop a clone's id 17 picking up Gate City's
       SEEDED title; `m.role` is the store's own record of their own person. */
    const title = hrTitleFor(bare, roles || {}, added || []) || String((m && m.role) || "");
    const over = seatMap[bare] || {};
    const rank = hrRankOfTitle(title);
    const tier = over.tier || (TIERS.find((t) => t.ranks.includes(rank)) || {}).id || "";
    /* ⚠️ `id` IS CARRIED OUT OF HERE NOW. The levels below print names only, so
       nothing could map a rendered card back to the roster row it came from,
       and the seat map is keyed by id. The editor needs that link; the chart
       itself ignores the extra field. */
    return { id: bare, name: hrDisplayName(m), title, rank, tier,
      seat: over.seat || title, note: over.note || "",
      specialty: String(over.specialty || "") };
  });

  const levels = TIERS
    .map((t) => ({ id: t.id, label: t.label,
      people: rows.filter((r) => r.tier === t.id)
        .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))
        .map((r) => ({ name: r.name, seat: r.seat, note: r.note })) }))
    .filter((l) => l.people.length);

  /* ⚠️ ANYONE ALREADY PLACED ON THE TREE IS OFF THE BENCH. Rhonda is a Team
     Leader by title and sits in Support by decision; without this she renders
     in both places on one screen. */
  /* ⚠️ A SPECIALIST COMES OUT OF THEIR TITLE GROUP, not in addition to it. The
     hand-typed chart listed these five as their own row and NOT under Trainers,
     so counting them twice would inflate two rows at once and change what the
     panel has always said. Same rule as a tier override on the tree. */
  const bench = BENCH_TITLES
    .map((label) => {
      const hit = rows.filter((r) => !r.tier && !r.specialty && r.title === label);
      return { label: label + "s", count: hit.length,
        names: hit.map((r) => r.name).sort().join(" · ") };
    })
    .concat([{
      label: "Specialized Trainers",
      ...(() => {
        const hit = rows.filter((r) => !r.tier && r.specialty)
          .map((r) => `${r.name} (${r.specialty})`).sort();
        return { count: hit.length, names: hit.join(" · ") };
      })(),
    }])
    .filter((b) => b.count);

  /* `rows` is every active person with their id, for the seat editor. Added
     alongside the two the renderer already walks rather than replacing them, so
     nothing that reads this function had to change. */
  return { levels, bench, rows };
}

/* The open seats are published roles with nobody in them, so no roster row can
   produce one. They stay written down, and stay Gate City's.
   ⚠️ LIFTED VERBATIM out of the old LEVELS array rather than retyped — the
   wording is a decision record, not a description. */
/* THE OPEN SEATS LIVE IN `org:open-seats:v1`, EDITED IN THE PANEL BELOW.
   The published Nighttime Director used to sit here as a literal with its own
   `isGateCity()` gate. Deleted 12 Aug 2026 after the saved record was compared
   to it field by field and every string matched to the character.
   ⚠️ THE GATE WAS NEVER THE FIX, AND THAT IS THE POINT OF THIS FILE'S HISTORY.
   A gate stops another store SEEING this store's seat. It does not stop the
   seat, its job description and the name of whoever asked for it from being
   downloaded by that store's browser. Only deleting does that. Three things
   left this file that way: the tree and bench (derived from the roster), the
   seats (`org:chart-seats:v1`), and now these. */

/* Where a store's own published-but-empty roles live. The chart has always
   rendered these from code; since Aug 12 2026 the editor below writes them. */
const OPEN_SEATS_KEY = "org:open-seats:v1";

/* ★ PURE, MODULE LEVEL (design rule 7).
   ⚠️ A SEAT WITH NO TITLE IS NOT A SEAT, so a blank title returns null and the
   caller removes the row. Same rule as a cleared seat entry: an empty record
   renders identically to an absent one, so storing it would be a row nobody
   could tell from no row.
   ⚠️⚠️ `candidates` IS ALWAYS WRITTEN, AS AN ARRAY, EVEN WHEN EMPTY. The
   renderer reads `s.candidates.length` and maps it. A seat saved without the
   key would throw on the one screen it exists to appear on — which is exactly
   the `item.images.map()` scar design rule 1 is written from. The renderer is
   guarded too; both, because one of them will be edited by somebody who has
   not read the other. */
export function cleanOpenSeat(seat) {
  const str = (v) => String((seat && v) || "").trim();
  const title = str(seat && seat.title);
  if (!title) return null;
  const out = { id: str(seat && seat.id) || slugSeatId(title), title };
  const year = str(seat && seat.year); if (year) out.year = year;
  const owns = str(seat && seat.owns); if (owns) out.owns = owns;
  const signal = str(seat && seat.signal); if (signal) out.signal = signal;
  out.candidates = Array.isArray(seat && seat.candidates) ? seat.candidates : [];
  return out;
}

/* An id a person never sees and never types, derived once from the title so a
   new seat has a stable key the moment it is saved. */
export function slugSeatId(title) {
  const base = String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
  return base || "seat";
}

/* ★ ALSO PURE, AND THE WHOLE SAVE SHAPE LIVES HERE so it can be run against a
   record in a test without React — the only way to prove a save upserts rather
   than replaces the list.
   ⚠️ IT MERGES INTO WHAT WAS JUST READ. One record holds every open seat, so
   writing a stale copy drops whatever another director added in between. */
export function mergeOpenSeats(live, seat) {
  const list = Array.isArray(live) ? live.filter((x) => x && x.id) : [];
  const wanted = String((seat && seat.id) || "").trim();
  const clean = cleanOpenSeat(seat);
  if (!clean) return list.filter((x) => String(x.id) !== wanted);
  const at = list.findIndex((x) => String(x.id) === String(wanted || clean.id));
  if (at < 0) return [...list, clean];
  const next = list.slice();
  next[at] = clean;
  return next;
}


/* ★ THE AD SEATS NOW COME FROM `orgSeats.js`, NOT FROM THIS FILE.
   They used to be hardcoded here while the Worker routed notifications off a
   SEPARATE copy — two records of one fact, and they drifted (facilities was
   recorded under Chloe here while the chart said Brandon). Editing a seat in
   orgSeats.js now changes BOTH what this chart prints and who the Hub
   notifies, so they cannot disagree again.
   Shape is unchanged for the renderer below: [name, function, optional note]. */
const ADS = {
  FOH: AD_SEATS.FOH.map((s) => (s.note ? [s.holder, s.fn, s.note] : [s.holder, s.fn])),
  BOH: AD_SEATS.BOH.map((s) => (s.note ? [s.holder, s.fn, s.note] : [s.holder, s.fn])),
};

/* ⛔ THE FOUR HAND-TYPED BENCH ROWS ARE GONE. They named thirty-four people and
   were WRONG when they were deleted, which is the argument for deriving them:
   they claimed 7 Senior Trainers where the roster held 10, and 12 "Trainers"
   against 9 Junior Trainers. The old note here recorded Tyler Byrd sitting on
   the chart a week after he left and being taken off BY HAND. `buildChart`
   groups the roster by title instead, so the counts are whatever HR says today
   and nobody has to remember.

   ⚠️ ONE THING WAS LOST AND IT IS WORTH SAYING OUT LOUD: "Specialized
   Trainers" — Biscuits, Breading, Dining Room, Hospitality — is a Gate City
   idea the roster has no field for. Those five now appear under their roster
   title, without the specialty. It goes back on the day the seat map is
   editable in-app; `note` on a seat entry is already the place for it. */

function Card({ children, style = {}, className = "" }) {
  return (
    <div className={`rounded-xl p-4 ${className}`} style={{ backgroundColor: C.card, border: `1px solid ${C.line}`, ...style }}>
      {children}
    </div>
  );
}

function LevelLabel({ children }) {
  return (
    <div className="ac-display text-xs font-bold uppercase tracking-widest mb-2" style={{ color: C.sub }}>
      {children}
    </div>
  );
}

/* ═══ THE SEAT EDITOR ══════════════════════════════════════════════════════
   The write side of `org:chart-seats:v1`. The read has been here since the
   chart was split out; this is what finally makes the seats a store's own
   record instead of a literal in a file every store downloads.

   ⚠️ EDITING IS TIER 3, VIEWING IS NOT. The chart renders inside EOSTile,
   which already gates itself, and its tile entry is `tier: 3, allow:
   ["Director"]` — so a plain Director opens EOS at tier 2 and can READ the
   chart. Rewriting the org structure is the narrower thing, gated the same way
   the store-settings write is: rank 6 and up. That is why this needs `tier`
   passed down, which EOSTile did not do before.
   ⚠️ THE GATE IS NOT THE SECURITY. Anyone can call kvSet from a console; this
   key is not on HR_PROTECTED, deliberately, because it holds seat labels and
   no PINs, evaluations or injuries. The gate stops the wrong person editing by
   accident, which is what it is for. Do not read it as more than that. */
const SEAT_EDIT_MIN_TIER = 3;

const SEAT_TIER_OPTIONS = [
  { v: "", label: "From their title" },
  { v: "owner", label: "Owner / Operator" },
  { v: "exec", label: "Executive Directors" },
  { v: "dir", label: "Directors" },
  { v: "support", label: "Support" },
];

/* ★ PURE, AT MODULE LEVEL (design rule 7). Trims every field, drops the empty
   ones, and returns null when nothing survives.
   ⚠️ NULL MEANS REMOVE THE PERSON'S ENTRY, NOT SAVE AN EMPTY ONE. `{}` in the
   record would sit there forever meaning nothing, and `over.seat || title`
   already treats absent and blank the same — so an empty entry is a row that
   can never be told apart from no row, which is exactly the shape rule 1 warns
   about. Clearing the fields is how a seat is deleted. */
export function cleanSeatEntry(e) {
  const out = {};
  const seat = String((e && e.seat) || "").trim();
  const note = String((e && e.note) || "").trim();
  const tier = String((e && e.tier) || "").trim();
  const specialty = String((e && e.specialty) || "").trim();
  if (seat) out.seat = seat;
  if (note) out.note = note;
  /* An unknown tier would put the person in a level that does not render, so
     they would vanish off the chart with nothing to say why. */
  if (tier && SEAT_TIER_OPTIONS.some((o) => o.v && o.v === tier)) out.tier = tier;
  if (specialty) out.specialty = specialty;
  return Object.keys(out).length ? out : null;
}

/* ★ PURE, AND THE WHOLE DATA SHAPE OF A SAVE LIVES HERE. Kept out of the
   component so it can be run against a record in a test without React, which
   is the only way to prove a save merges rather than replaces.
   ⚠️ IT MERGES INTO WHAT WAS JUST READ, never into what the screen was holding.
   One object holds every seat, so writing a stale copy silently drops whatever
   another director saved in between. */
export function mergeSeat(live, id, entry) {
  const out = { ...(live && typeof live === "object" && !Array.isArray(live) ? live : {}) };
  const key = String(id);
  const clean = cleanSeatEntry(entry);
  if (clean) out[key] = clean;
  else delete out[key];
  return out;
}

/* Exported so it can be rendered in a test without signing in, reaching EOS and
   loading a roster. The six checks read code; only rendering it proves the JSX
   below survives a draft being open, a record being empty, and a save failing. */

/* The open-seat half of the chart's edit mode. Its own component beside
   SeatEditor rather than inside it: the two edit different records with
   different shapes, and one panel that saved to two keys would be the kind of
   thing where a later edit to one path quietly changes the other.
   ⚠️ CANDIDATES ARE NOT EDITED HERE. They are a list of people's names and
   nothing has asked for them yet; `cleanOpenSeat` preserves whatever is
   already stored rather than dropping it. */
export function OpenSeatEditor({ seats, draft, setDraft, onSave, saving, saveMsg }) {
  const list = Array.isArray(seats) ? seats : [];
  const field = (k) => (e) => { const v = e.target.value; setDraft((d) => ({ ...d, [k]: v })); };
  return (
    <Card className="mb-6" style={{ borderColor: C.red }}>
      <div className="ac-display font-bold text-sm mb-1">Open seats</div>
      <p className="text-xs mb-3" style={{ color: C.sub }}>
        Published roles with nobody in them yet. Clear the title to remove one.
      </p>

      {saveMsg && (
        <div className="rounded-lg p-2 mb-2 text-xs font-semibold" style={{ color: C.red, backgroundColor: "#FDECEF", border: `1px solid ${C.red}` }}>
          {saveMsg}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-2">
        {list.map((seat) => (
          <button
            key={seat.id}
            type="button"
            onClick={() => setDraft(draft && draft.id === seat.id ? null : { ...seat })}
            className="text-xs rounded-lg px-2 py-1"
            style={draft && draft.id === seat.id
              ? { backgroundColor: C.red, color: "#FFFFFF" }
              : { backgroundColor: C.card, color: C.sub, border: `1px solid ${C.line}` }}
          >
            {seat.title}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setDraft({ id: "", title: "", year: "", owns: "", signal: "", candidates: [] })}
          className="text-xs font-semibold rounded-lg px-2 py-1"
          style={{ backgroundColor: C.card, color: C.red, border: `1px dashed ${C.red}` }}
        >
          + Add a seat
        </button>
        {!list.length && (
          <span className="text-xs" style={{ color: C.sub }}>None published yet.</span>
        )}
      </div>

      {draft && (
        <div className="grid grid-cols-1 gap-2 rounded-lg p-2.5" style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper }}>
          <label className="text-xs" style={{ color: C.sub }}>
            Seat title
            {/* ⚠️ A PLACEHOLDER IS SHIPPED TEXT. This read "Nighttime Director",
                which is this store's own published seat, so every other store
                running this code was shown it as the suggested example in an
                empty box. Keep examples generic here. */}
            <input type="text" value={draft.title} placeholder="e.g. Catering Director" onChange={field("title")}
              className="w-full mt-0.5 rounded-lg px-2 py-1.5" style={{ border: `1px solid ${C.line}`, color: C.ink, fontSize: 16 }} />
          </label>
          <label className="text-xs" style={{ color: C.sub }}>
            Year published
            <input type="text" value={draft.year} placeholder="2026" onChange={field("year")}
              className="w-full mt-0.5 rounded-lg px-2 py-1.5" style={{ border: `1px solid ${C.line}`, color: C.ink, fontSize: 16 }} />
          </label>
          <label className="text-xs" style={{ color: C.sub }}>
            What the seat owns
            <textarea value={draft.owns} rows={2} onChange={field("owns")}
              className="w-full mt-0.5 rounded-lg px-2 py-1.5" style={{ border: `1px solid ${C.line}`, color: C.ink, fontSize: 16 }} />
          </label>
          <label className="text-xs" style={{ color: C.sub }}>
            Where it stands
            <textarea value={draft.signal} rows={3} onChange={field("signal")}
              className="w-full mt-0.5 rounded-lg px-2 py-1.5" style={{ border: `1px solid ${C.line}`, color: C.ink, fontSize: 16 }} />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={saving} onClick={() => onSave(draft)}
              className="text-xs font-semibold rounded-lg px-3 py-1.5"
              style={{ backgroundColor: C.red, color: "#FFFFFF", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setDraft(null)}
              className="text-xs font-semibold rounded-lg px-3 py-1.5"
              style={{ backgroundColor: C.card, color: C.sub, border: `1px solid ${C.line}` }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

export function SeatEditor({ rows, stored, draft, setDraft, onSave, saving, saveMsg }) {
  const [q, setQ] = useState("");
  const saved = stored || {};
  /* Highest rank first, then alphabetical: the same order the tree reads in, so
     the person somebody came here to edit is where they expect. A store can
     have a hundred on the roster, which is why the filter is not a luxury. */
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows || [])
      .filter((r) => !needle || r.name.toLowerCase().includes(needle) || String(r.title).toLowerCase().includes(needle))
      .slice()
      .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name));
  }, [rows, q]);

  return (
    <Card className="mb-6" style={{ borderColor: C.blue }}>
      <div className="ac-display font-bold text-sm mb-1">Edit seats</div>
      <p className="text-xs mb-3" style={{ color: C.sub }}>
        A seat is the accountability, not the job title. Names and titles come
        from HR and are not edited here. Clear every box to remove a seat.
      </p>

      {saveMsg && (
        <div className="rounded-lg p-2 mb-2 text-xs font-semibold" style={{ color: C.red, backgroundColor: "#FDECEF", border: `1px solid ${C.red}` }}>
          {saveMsg}
        </div>
      )}

      <input
        type="text"
        value={q}
        placeholder="Find a person"
        onChange={(e) => { const v = e.target.value; setQ(v); }}
        className="w-full mb-2 rounded-lg px-2 py-1.5"
        style={{ border: `1px solid ${C.line}`, color: C.ink, fontSize: 16 }}
      />

      <div className="grid grid-cols-1 gap-2">
        {list.map((p) => {
          const own = saved[p.id];
          const open = !!draft && String(draft.id) === String(p.id);
          return (
            <div key={p.id} className="rounded-lg p-2.5" style={{ border: `1px solid ${open ? C.blue : C.line}`, backgroundColor: open ? C.blueSoft : C.card }}>
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <span className="ac-display font-bold text-sm">{p.name}</span>
                  <span className="text-xs ml-2" style={{ color: C.sub }}>{p.title}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {own && <span className="text-xs font-semibold" style={{ color: C.green }}>yours</span>}
                  <button
                    type="button"
                    className="text-xs font-semibold"
                    style={{ color: C.blue }}
                    onClick={() => setDraft(open ? null : {
                      id: p.id,
                      seat: (own && own.seat) || "",
                      note: (own && own.note) || "",
                      tier: (own && own.tier) || "",
                      specialty: (own && own.specialty) || "",
                    })}
                  >
                    {open ? "Close" : "Edit"}
                  </button>
                </div>
              </div>

              {open && (
                <div className="mt-2 grid grid-cols-1 gap-2">
                  <label className="text-xs" style={{ color: C.sub }}>
                    Seat
                    <input
                      type="text"
                      value={draft.seat}
                      placeholder={p.title}
                      onChange={(e) => { const v = e.target.value; setDraft((d) => ({ ...d, seat: v })); }}
                      className="w-full mt-0.5 rounded-lg px-2 py-1.5"
                      style={{ border: `1px solid ${C.line}`, color: C.ink, fontSize: 16 }}
                    />
                  </label>

                  <label className="text-xs" style={{ color: C.sub }}>
                    Level
                    <select
                      value={draft.tier}
                      onChange={(e) => { const v = e.target.value; setDraft((d) => ({ ...d, tier: v })); }}
                      className="w-full mt-0.5 rounded-lg px-2 py-1.5"
                      style={{ border: `1px solid ${C.line}`, color: C.ink, fontSize: 16, backgroundColor: C.card }}
                    >
                      {SEAT_TIER_OPTIONS.map((o) => (
                        <option key={o.v || "auto"} value={o.v}>{o.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs" style={{ color: C.sub }}>
                    Specialty (puts them under Specialized Trainers)
                    <input
                      type="text"
                      value={draft.specialty}
                      placeholder="Biscuits, Breading, Hospitality…"
                      onChange={(e) => { const v = e.target.value; setDraft((d) => ({ ...d, specialty: v })); }}
                      className="w-full mt-0.5 rounded-lg px-2 py-1.5"
                      style={{ border: `1px solid ${C.line}`, color: C.ink, fontSize: 16 }}
                    />
                  </label>

                  <label className="text-xs" style={{ color: C.sub }}>
                    What they own
                    <textarea
                      value={draft.note}
                      rows={3}
                      onChange={(e) => { const v = e.target.value; setDraft((d) => ({ ...d, note: v })); }}
                      className="w-full mt-0.5 rounded-lg px-2 py-1.5"
                      style={{ border: `1px solid ${C.line}`, color: C.ink, fontSize: 16 }}
                    />
                  </label>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onSave(p.id, draft)}
                      className="text-xs font-semibold rounded-lg px-3 py-1.5"
                      style={{ backgroundColor: C.blue, color: "#FFFFFF", opacity: saving ? 0.6 : 1 }}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraft(null)}
                      className="text-xs font-semibold rounded-lg px-3 py-1.5"
                      style={{ backgroundColor: C.paper, color: C.sub, border: `1px solid ${C.line}` }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!list.length && (
          <div className="text-xs" style={{ color: C.sub }}>Nobody matches that.</div>
        )}
      </div>
    </Card>
  );
}

export default function AccountabilityChart({ liveRocks, quarterLabel, tier, user } = {}) {
  const [openSeat, setOpenSeat] = useState(null);
  const [expandedBench, setExpandedBench] = useState(null);
  /* ⚠️ THE ROSTER INPUTS ARE KEPT, NOT JUST THE BUILT CHART. Saving a seat has
     to redraw, and re-reading five keys to show a label somebody just typed
     would be a round trip for something already in memory. `chart` is derived
     below instead of stored.
     null = still loading, so an empty chart during the fetch cannot be mistaken
     for a store that has nobody. Every "not set up yet" line below waits on
     this being non-null for the same reason. */
  const [base, setBase] = useState(null);
  /* ⚠️ THE STORE'S OWN SEATS, HELD APART FROM THE SHIPPED ONES. The merged view
     is what renders, but a save has to write only what is really in storage,
     and the editor has to be able to say which seats are theirs and which are
     still coming from code. Merging the two into one state would lose both. */
  const [stored, setStored] = useState(null);
  /* The store's own published open roles. null while loading, so an empty
     list during the fetch is never mistaken for a store that has none. */
  const [storedOpen, setStoredOpen] = useState(null);
  const [openDraft, setOpenDraft] = useState(null);   // a seat being edited
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  /* ★ THE ONLY KV THIS FILE HAS EVER DONE, and it is all reads. The header
     comment used to boast that the chart had no KV wiring; that was true and it
     is exactly why the tree went stale. Four reads, in parallel, once.
     ⚠️ `loadHRTeamResult` CARRIES `ok`. A failed roster read hands back an empty
     list, and an empty list rendered as a chart says "this store has no
     leaders" — which is a sentence about the store, not about the network. So
     the failure is shown as a failure. */
  useEffect(() => {
    let alive = true;
    (async () => {
      const [r, roles, added, status, seats, openRows] = await Promise.all([
        loadHRTeamResult().catch(() => ({ ok: false, team: [] })),
        kvGet("gcfcr-hr-roles").catch(() => null),
        kvGet(ROSTER_ADD_KEY).catch(() => null),
        kvGet("gcfcr-hr-status").catch(() => null),
        kvGet(CHART_SEATS_KEY).catch(() => null),
        kvGet(OPEN_SEATS_KEY).catch(() => null),
      ]);
      if (!alive) return;
      if (!r.ok) setLoadFailed(true);
      setBase({ roster: r.team, roles, added, status });
      setStored(seats && typeof seats === "object" && !Array.isArray(seats) ? seats : {});
      setStoredOpen(Array.isArray(openRows) ? openRows.filter((x) => x && x.id) : []);
    })();
    return () => { alive = false; };
  }, []);

  /* ★ THE SAVED RECORD IS THE ONLY SOURCE OF SEATS NOW. This used to merge a
     shipped Gate City map underneath, and the merge is what let the two coexist
     while the seats moved into storage. Gate City's record was copied across and
     checked on 12 Aug 2026, so there is no shipped half left to merge. */
  const chart = useMemo(
    () => (base ? buildChart({ ...base, seats: stored || {} }) : null),
    [base, stored],
  );

  const canEdit = (tier ?? 0) >= SEAT_EDIT_MIN_TIER;
  /* ⚠️ STORED WINS ONLY ONCE THERE IS SOMETHING STORED. Until this store has
     saved an open seat, the shipped list still renders — which is what makes
     this a two-step rather than a gap: the code version keeps the board
     correct until the record exists, and only then is the literal deletable.
     `null` means still loading and is not the same as an empty list. */
  /* ⚠️ `null` IS STILL LOADING, `[]` IS A STORE WITH NO OPEN SEATS. There is
     no code fallback behind this any more, so the difference is the whole
     behaviour: treating a mid-fetch null as an empty list would flash "no
     open seats" at every store on every open. */
  const liveOpenSeats = Array.isArray(storedOpen) ? storedOpen : [];
  const levels = chart ? chart.levels : [];
  const bench = chart ? chart.bench : [];

  /* ⚠️ READ BEFORE WRITE, AND A FAILED READ REFUSES. Two directors editing two
     different people would otherwise erase each other: this record is one
     object, so writing a stale copy drops whatever landed in between. Same
     shape as the /api/store-config POST, and the same reason.
     ⚠️ kvSet RETURNS FALSE ON A REFUSED WRITE and the caller has to look. A
     tile that reported success off an unchecked write is exactly what lost an
     uploaded document's record once already. */
  async function writeSeats(next) {
    setSaving(true);
    setSaveMsg("");
    let cur;
    try {
      cur = await kvGetResult(CHART_SEATS_KEY);
    } catch {
      cur = { ok: false, value: null };
    }
    if (!cur.ok) {
      setSaving(false);
      setSaveMsg("Could not read the seats that are saved now, so nothing was changed. Try again.");
      return false;
    }
    const live = cur.value && typeof cur.value === "object" && !Array.isArray(cur.value) ? cur.value : {};
    const merged = next(live);
    const ok = await kvSet(CHART_SEATS_KEY, merged, user && user.name);
    setSaving(false);
    if (!ok) {
      setSaveMsg("That did not save. Nothing has changed.");
      return false;
    }
    setStored(merged);
    return true;
  }

  /* Clearing every box removes the seat outright, and now that nothing ships
     from code it stays removed. While the shipped map still existed this had to
     warn that a cleared seat would come straight back; that case is gone with
     it. */
  /* Same read-before-write as the seat save, against the open-seat record.
     ⚠️ kvGetResult, not kvGet: a refused read must not be written over. */
  async function saveOpenSeat(seat) {
    setSaving(true);
    setSaveMsg("");
    let cur;
    try { cur = await kvGetResult(OPEN_SEATS_KEY); } catch { cur = { ok: false, value: null }; }
    if (!cur.ok) {
      setSaving(false);
      setSaveMsg("Could not read the open seats that are saved now, so nothing changed. Try again.");
      return;
    }
    const merged = mergeOpenSeats(cur.value, seat);
    const ok = await kvSet(OPEN_SEATS_KEY, merged, user && user.name);
    setSaving(false);
    if (!ok) { setSaveMsg("That did not save. Nothing has changed."); return; }
    setStoredOpen(merged);
    setOpenDraft(null);
  }

  async function saveSeat(id, entry) {
    const done = await writeSeats((live) => mergeSeat(live, id, entry));
    if (done) setDraft(null);
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.paper, color: C.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .ac-display { font-family: 'Archivo', sans-serif; }
        .ac-body { font-family: 'Inter', sans-serif; }
        .ac-mono { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      <div className="max-w-4xl mx-auto px-4 py-6 ac-body">
        <header className="mb-5">
          {/* ⚠️ WAS THE LITERAL "Gate City Hub · Team". `STORE.appName` is a
              GETTER on the live config, so reading it here is a use-time read
              and a store that renames the app in Settings sees it immediately.
              Do not lift it into a `const` at module level — that captures the
              default before saved settings arrive. */}
          <div className="text-xs font-semibold tracking-widest uppercase" style={{ color: C.red }}>
            {STORE.appName} · Team
          </div>
          <h1 className="ac-display text-2xl" style={{ fontWeight: 800 }}>
            Company Rocks &amp; Accountability Chart
          </h1>
          <p className="text-sm mt-1" style={{ color: C.sub }}>
            Seats, not titles. Every individual Rock ladders into a company Rock.
          </p>
        </header>

        {/* ⚠️ THE BUTTON IS THE ONLY THING TIER GATES HERE. Everyone who can
            open this tab still reads the chart; rewriting it is the narrower
            act. A store on tier 2 sees exactly what it saw before. */}
        {canEdit && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => { setEditing((v) => !v); setDraft(null); setSaveMsg(""); }}
              className="text-xs font-semibold rounded-lg px-3 py-1.5"
              style={editing
                ? { backgroundColor: C.blue, color: "#FFFFFF" }
                : { backgroundColor: C.card, color: C.blue, border: `1px solid ${C.line}` }}
            >
              {editing ? "Done editing" : "Edit seats"}
            </button>
          </div>
        )}

        {canEdit && editing && chart && (
          <SeatEditor
            rows={chart.rows}
            stored={stored}
            draft={draft}
            setDraft={setDraft}
            onSave={saveSeat}
            saving={saving}
            saveMsg={saveMsg}
          />
        )}

        {canEdit && editing && (
          <OpenSeatEditor
            seats={liveOpenSeats}
            draft={openDraft}
            setDraft={setOpenDraft}
            onSave={saveOpenSeat}
            saving={saving}
            saveMsg={saveMsg}
          />
        )}

        {/* ===== Company Rocks ===== */}
        <section className="mb-6">
          <LevelLabel>Company Rocks — {quarterLabel || "Q3 2026"}</LevelLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* census R1: `owner || champion` is the same both-shapes rule
                worker.js uses, because the record has been written both ways.
                ⛔ THE FALLBACK SEED IS GONE AND MUST NOT COME BACK. It was a
                July snapshot naming three people, and EOSTile owns the real
                record, so the only time it could ever have rendered was when
                the live board was EMPTY — which after a quarter review is a
                real answer, not a gap. Showing four Rocks nobody has committed
                to, as if they were this quarter's, is the same fiction EOSTile
                refuses two files away when it honours [] after a review. */}
            {(Array.isArray(liveRocks) ? liveRocks : []).map((r, i) => (
              <Card key={r.id}>
                <div className="flex items-baseline justify-between mb-1">
                  <h3 className="ac-display font-bold text-sm">
                    <span className="ac-mono mr-2" style={{ color: C.red }}>{i + 1}</span>
                    {r.title}
                  </h3>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ color: C.blue, backgroundColor: C.blueSoft }}>
                    {r.owner || r.champion || "unowned"}
                  </span>
                </div>
              </Card>
            ))}
          </div>
          {!(Array.isArray(liveRocks) && liveRocks.length) && (
            <div className="text-sm" style={{ color: C.sub }}>
              No company Rocks set for this quarter yet. They are added on the
              Rocks tab, and every individual Rock ladders into one.
            </div>
          )}
          {ORPHAN_ROCKS.map((o) => (
            <div key={o.rock} className="mt-3 rounded-xl p-3 text-sm" style={{ backgroundColor: C.amberSoft, border: `1px solid ${C.amber}` }}>
              <span className="font-semibold" style={{ color: C.amber }}>Doesn't ladder up: </span>
              <span>{o.rock}</span>
              <div className="text-xs mt-0.5" style={{ color: C.sub }}>{o.note}</div>
            </div>
          ))}
        </section>

        {/* ===== Tree ===== */}
        <section className="mb-6">
          <LevelLabel>Leadership Tree</LevelLabel>

          {/* ⚠️ THREE DIFFERENT EMPTIES, THREE DIFFERENT SENTENCES. "Loading",
              "we could not read it" and "nobody is on your roster yet" are not
              the same fact, and collapsing them is how a failed read gets read
              as an empty store. */}
          {chart === null && (
            <div className="text-sm mb-3" style={{ color: C.sub }}>Loading…</div>
          )}
          {loadFailed && (
            <div className="text-sm mb-3" style={{ color: C.red }}>
              The roster could not be read, so the tree below may be incomplete.
            </div>
          )}
          {chart !== null && !loadFailed && !levels.length && (
            <div className="text-sm mb-3" style={{ color: C.sub }}>
              Nobody on the roster holds a Director title or above yet. The tree
              fills in from HR as titles are set.
            </div>
          )}

          {levels.map((lvl) => (
            <div key={lvl.id} className="mb-3">
              <div className="text-xs font-semibold mb-1.5" style={{ color: C.sub }}>{lvl.label}</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {lvl.people.map((p) => (
                  <Card key={p.name} style={p.flag ? { borderColor: C.amber } : {}}>
                    <div className="ac-display font-bold text-sm">{p.name}</div>
                    {p.seat && <div className="text-xs mt-0.5 leading-snug" style={{ color: C.blue }}>{p.seat}</div>}
                    {p.flag && (
                      <div className="text-xs mt-1 font-semibold leading-snug" style={{ color: C.amber }}>
                        ⚠ {p.flag}
                      </div>
                    )}
                    {p.note && <div className="text-xs mt-1 italic leading-snug" style={{ color: C.sub }}>{p.note}</div>}
                    {p.meta && <div className="ac-mono text-xs mt-1" style={{ color: C.sub }}>{p.meta}</div>}
                  </Card>
                ))}

                {/* ⚠️ THE OPEN SEATS HANG OFF "Directors" BY POSITION, which is
                    where they have always rendered. They used to be a key on
                    that level's object; the levels are derived now and a
                    derived row cannot carry a hand-written seat, so the tier id
                    is the anchor instead. */}
                {(lvl.id === "dir" ? liveOpenSeats : []).map((s) => {
                  const isOpen = openSeat === s.id;
                  return (
                    <div
                      key={s.id}
                      className="rounded-xl p-4"
                      style={{ backgroundColor: C.card, border: `2px dashed ${C.red}` }}
                    >
                      <button onClick={() => setOpenSeat(isOpen ? null : s.id)} className="w-full text-left">
                        <div className="flex items-baseline justify-between">
                          <span className="ac-display font-bold text-sm" style={{ color: C.red }}>{s.title}</span>
                          <span className="ac-mono text-xs px-1.5 py-0.5 rounded" style={{ color: C.red, backgroundColor: "#FBE7EC" }}>
                            OPEN {s.year}
                          </span>
                        </div>
                        <div className="text-xs mt-1" style={{ color: C.sub }}>
                          {s.owns || "Seat function not yet defined"}
                        </div>
                        <div className="text-xs mt-1 font-semibold" style={{ color: C.blue }}>
                          {(s.candidates || []).length ? `${(s.candidates || []).length} candidates ${isOpen ? "▾" : "▸"}` : "No candidates yet"}
                        </div>
                      </button>
                      {isOpen && (
                        <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
                          <ul className="text-xs space-y-1 mb-2">
                            {(s.candidates || []).map((c) => (
                              <li key={c}>{c}</li>
                            ))}
                            {!(s.candidates || []).length && <li style={{ color: C.sub }}>—</li>}
                          </ul>
                          <div className="text-xs italic leading-snug" style={{ color: C.sub }}>{s.signal}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Area Directors */}
          <div className="mb-3">
            <div className="text-xs font-semibold mb-1.5" style={{ color: C.sub }}>Area Directors — the bench for the 2026 seats</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {["FOH", "BOH"].map((side) => (
                <Card key={side}>
                  <div className="ac-display font-bold text-sm mb-2">{side}</div>
                  <ul className="space-y-1.5">
                    {ADS[side].map(([name, area, project]) => (
                      <li key={name} className="text-sm">
                        <div className="flex items-baseline justify-between">
                          <span>{name}</span>
                          <span className="text-xs" style={{ color: C.sub }}>{area}</span>
                        </div>
                        {project && <div className="text-xs mt-0.5" style={{ color: C.green }}>{project}</div>}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </div>

          {/* Bench depth */}
          <div>
            <div className="text-xs font-semibold mb-1.5" style={{ color: C.sub }}>Bench depth</div>
            <div className="space-y-2">
              {chart !== null && !bench.length && (
                <div className="text-xs" style={{ color: C.sub }}>
                  Nobody on the roster holds a trainer or team-leader title yet.
                </div>
              )}
              {bench.map((b) => {
                const isOpen = expandedBench === b.label;
                return (
                  <div key={b.label} className="rounded-xl px-4 py-3" style={{ backgroundColor: C.card, border: `1px solid ${C.line}` }}>
                    <button onClick={() => setExpandedBench(isOpen ? null : b.label)} className="w-full flex items-center justify-between text-left">
                      <span className="ac-display font-bold text-sm">{b.label}</span>
                      <span className="ac-mono text-sm" style={{ color: C.sub }}>{b.count} {isOpen ? "▾" : "▸"}</span>
                    </button>
                    {isOpen && (
                      <div className="text-xs mt-2 pt-2 leading-relaxed" style={{ borderTop: `1px solid ${C.line}`, color: C.sub }}>
                        {b.names}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Decisions */}
        {/* ⚠️ GATED 12 Aug 2026, AND IT IS THE REASON THIS FILE COULD NOT BE
            ADOPTED WHOLESALE BY ANOTHER STORE. Two hand-written decisions, both
            naming real people — an operations transition planned with two of
            them, and who asked for the Nighttime Director. They sat outside the
            open-seat list so every earlier pass over those seats missed them,
            and the second one restates the same seat in prose.
            ★ GATED RATHER THAN MADE EDITABLE, for the same reason as the EOS
            readiness list: there is no generic core. "What is in flight" at this
            store is not a feature another store wants a blank version of. If one
            ever asks, it becomes a record with an editor like the seats did. */}
        {isGateCity() && (
          <section>
            <div className="rounded-xl p-4" style={{ backgroundColor: C.ink }}>
              <div className="ac-display text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#9AA4B2" }}>
                In flight
              </div>
              <ol className="text-sm space-y-1.5 text-white">
                <li>1. Operations transition. Planned directly with the operator, not written down here.</li>
                <li>2. Nighttime Director. The operator wants a dedicated night leader over front and back — starts 5PM, owns the building front and back through close. Seat is open, no candidates named yet.</li>
              </ol>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
