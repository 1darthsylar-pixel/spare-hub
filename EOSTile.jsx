import React, { useState, useEffect, useMemo, useRef } from "react";
/* The one raised look, shared with every tool — see cardStyle.js. */
import { CARD_3D, cardSurface, CARD_3D_SOFT, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import AccountabilityChart from "./AccountabilityChart.jsx";
import { kvGet, kvGetResult, kvSet } from "./store.js";
import { eosNames, isGateCity, STORE } from "./storeConfig.js";
import { nextL10 } from "./l10Schedule.js";
import { eosPeriod } from "./eosPeriod.js";
import { INJECT_ISSUES, READINESS } from "./eosSeed.js";
import { eosFacilitator } from "./storeConfig.js";

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

// ============================================================
// EOSTile.jsx — Gate City Hub · People & Team
// EOS operating system: Rocks · Scorecard · Issues · To-dos
// · Team/Accountability Chart · Run Meeting (Level 10 engine)
// Split from the old LeadershipTile; Leadership Dev is now its
// own tile (LeadershipDevTile.jsx). Gate opens to all 4
// directors on RELEASED = true.
// Tab 1: EOS (Rocks · Scorecard · Issues · To-dos · L10 launcher)
// Tab 2: Leadership Development (Bri) — 101/201 cohorts,
//         pipeline funnel, promotion-ready
// Tab 3: Run Meeting — live, timed Level 10 that runs off the
//         same Rocks/scorecard/issues/todos state as Tab 1
//
// v3.3 changes:
//  - SCORECARD WEEK CELLS ARE NOW TRI-STATE: 1 hit · 0 miss · null
//    no-data. The strip was binary, so any new row had to fake five
//    greens or five reds — and fake reds are TAPPABLE, which mints
//    Issues for weeks that never happened. null renders hollow, is
//    not tappable, and never counts as a miss anywhere.
//  - New row s9 "Open roles" (Hannah, goal ≤ 2) seeded all-null —
//    the first honest use of the no-data state. ⚠️ s9 was REMOVED
//    again on 7/23 — Hannah confirmed she doesn't want open roles
//    measured at all. See the note where s8 ends.
//  - r7 + cr4 flipped "off" → "on": the owner's live call beats the
//    seed. HISTORICAL — r7 and cr4 were seed rows, and the Rocks and
//    Company Rocks seeds were deleted on 12 Aug 2026 once the live
//    records were checked. The live call is now the only call there is.
//  - missToIssue and the Last-5 strip now read the same effective
//    week array (weeksOf), so a LIVE hit overrides the seed's final
//    week in the strip too. That value was computed and then thrown
//    away — the strip showed the seed while the number beside it
//    came from the feed.
//
// v3.2 changes:
//  - TODAY is now new Date() — it was HARDCODED to 2026-07-08, which
//    froze the header at "Week 2 of 13", froze every Rock's staleness
//    age, and stamped 2026-07-08 onto any Rock anyone touched.
//  - Scorecard miss → Issue now stamps an ABSOLUTE week-start date
//    ("wk of 6/29") instead of a relative counter ("wk 2"). The old
//    arithmetic went NEGATIVE when the Last-5 strip reached back past
//    the start of the quarter — that's where "wk -2" came from. A
//    stored record outlives its frame of reference; a date doesn't.
//
// v3 changes:
//  - "Run Meeting" tab: per-segment countdown timer, Prev/Next,
//    jump strip, Month-close toggle (+30 min after IDS)
//  - Each segment shows LIVE data, not agenda text — Scorecard
//    segment reads the actual table, Rocks segment lets you cycle
//    status mid-meeting, IDS segment is the same issues queue
//  - Wrap segment: recap notes + 1–10 meeting rating
//  - EOS tab's "Next L10" card now launches Meeting Mode directly
//
// v2 changes:
//  - Tabbed: EOS + Leadership Dev in one tile
//  - Tap a red scorecard cell → auto-creates an IDS issue
//  - To-dos section (L10 output) with owner + done toggle
//  - Rock "last updated" aging (stale = 14+ days)
//
// v3.1 changes:
//  - Meeting Readiness section at top of EOS tab (KV-persisted):
//    what each director owes before the L10 + Bri's 101/201 timing
//    capture for automation. Feeds the Monday Slack touch-in.
//
// KV wiring:
//  eos:rocks:2026-Q3 · eos:scorecard:2026-Q3 · eos:issues
//  eos:todos · eos:meetinglog (ratings + notes) · ld:cohorts:101
//  ld:cohorts:201 · ld:pipeline · eos:readiness:v1
// Demo data in state — swap seeds for Supabase KV fetches.
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

// QUARTER_START — Monday on/before the 1st of the current quarter, UTC midnight.
// Was hardcoded `new Date("2026-06-29")` and would silently make "Week N of 13"
// count past 13 (e.g. "Week 27") once Q3 ended. Now derived: reproduces
// 2026-06-29 exactly for Q3 2026, and rolls to the right Monday every quarter.
// UTC ON PURPOSE — weekStartLabel below reads getUTCMonth/getUTCDate off this;
// a local-midnight date renders the day before in Eastern. Don't "simplify".
function quarterStartMondayUTC(now = new Date()) {
  const q = Math.floor(now.getUTCMonth() / 3);
  const first = new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1));
  const dow = first.getUTCDay();                 // 0 Sun..6 Sat
  const backToMon = dow === 0 ? 6 : dow - 1;     // Monday on/before the 1st
  return new Date(first.getTime() - backToMon * 864e5);
}
const QUARTER_START = quarterStartMondayUTC();

// ── Rocks key + quarter-roll detection ───────────────────────────────
// The scorecard key is DERIVED (rolls automatically — a fresh quarter's actuals
// legitimately start empty). Rocks are the OPPOSITE: an empty new-quarter Rocks
// key must NOT silently seed-fill, and last quarter's Rocks need a deliberate
// quarterly review, not an auto-carry (that's EOS anti-pattern). So the Rocks
// keys stay PINNED to the quarter they were authored in, and when the live
// quarter moves past that, we show a loud banner instead of rolling the data.
// When the review panel is built, this pin becomes its starting point.
const ROCKS_QUARTER = "2026-Q3";
const ROCKS_ROLLED = eosPeriod() !== ROCKS_QUARTER; // true once the calendar quarter passes Q3 2026

// Next L10 — DERIVED from the cadence rule in l10Schedule.js, never stored.
// This used to be a frozen pair of strings ("Wed, Jul 15 · 10:00 AM") with a
// second copy in eosTouchIn.js and a comment telling a human to remember to
// edit both after every meeting. Nobody ever does. One rule, two consumers.
// Computed at module load — a tab left open across a meeting won't roll over
// until refresh, which is fine for a header.
const NEXT_L10 = nextL10();
const QUARTER_WEEKS = 13;
const TODAY = new Date();
const CURRENT_WEEK = Math.min(
  QUARTER_WEEKS,
  Math.max(1, Math.floor((TODAY - QUARTER_START) / (7 * 864e5)) + 1)
);
const daysAgo = (iso) => Math.floor((TODAY - new Date(iso)) / 864e5);

// Absolute week-start label for a Last-5 column, e.g. "6/29".
// weeksBack = 0 is the current week, 1 is last week, etc.
//
// Why absolute: the old stamp was `wk ${CURRENT_WEEK - weeksBack}`, which
// produced "wk -2" whenever the strip reached back past the start of the
// quarter. Worse, it was baked into the issue's stored title, so it kept
// claiming a relative position long after the reference point had moved.
// A date can't go stale and can't go negative.
//
// UTC getters ON PURPOSE: QUARTER_START is parsed as UTC midnight, so local
// getters render the DAY BEFORE in Eastern (6/28 instead of 6/29). Don't
// "simplify" these to getMonth()/getDate().
// ⚠️ NO LONGER USED BY THE SCORECARD STRIP. Both callers (missToIssue and the
// Last-5 tooltip) now label from the row's RECORDED week keys instead, because
// counting weeks backwards from "now" stamps the wrong date the moment history
// has a gap. Kept only for reuse elsewhere — do not wire it back to the strip.
const weekStartLabel = (weeksBack) => {
  const d = new Date(QUARTER_START.getTime() + (CURRENT_WEEK - 1 - weeksBack) * 7 * 864e5);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

// ---- Scorecard week cells: TRI-STATE ----
//   1    = hit
//   0    = miss  (tappable → mints an IDS issue)
//   null = no data yet  (hollow, NOT tappable, never counts as a miss)
//
// This used to be binary, so a new row had to lie in one of two directions:
// five green squares (fake success) or five red ones (fake failure) — and the
// fake reds were tappable, so they'd mint Issues for weeks that never
// happened. "No data" is a real state; it now has a value.
const MISS = 0;
const cellState = (w) => (w === 1 ? "hit" : w === 0 ? "miss" : "none");

// The effective Last-5 for a row. See the strip builder below — cells and their
// week labels are computed in the `scorecard` memo from RECORDED history, so by
// the time a row reaches here `row.weeks` is already the effective array.
const weeksOf = (row) => row.weeks || [];
const lastCell = (row) => {
  const w = weeksOf(row);
  return w.length ? w[w.length - 1] : null;
};
const rowHasData = (row) => cellState(lastCell(row)) !== "none";
const rowHit = (row) => cellState(lastCell(row)) === "hit";

// ---- Last-5 = REAL observed history, not seed ----
//
// ⚠️ THE STRIPS USED TO BE FABRICATED. Every row carried a hardcoded 5-week
// `weeks` array in its seed, and a live feed could only ever move the FINAL
// cell — so a board two L10s old displayed five weeks of trend, four of which
// were invented at authoring time. Green squares nobody earned, red squares for
// weeks that never happened. The seeds are now all-null and history accrues for
// real, one entry per row per week, in eos:scorecard-history-v1.
//
// HONEST LIMIT: a week is recorded when someone OPENS this tile (the L10
// cadence). A week nobody opens is a gap, not a backfill — the strip stays
// short rather than inventing the missing reading. That is the intended
// behavior: a short honest strip beats a full fake one.
const HISTORY_KEY = "eos:scorecard-history-v1";
const STRIP_SLOTS = 5;
const HISTORY_CAP = 13; // ~one quarter of weeks kept per row

// Monday of the week containing d, as YYYY-MM-DD. Keying by the Monday DATE
// (not an ISO week number) sorts lexicographically and has no year-boundary
// edge cases. Local getters on purpose: this is "which week is it here," not a
// label rendered off QUARTER_START's UTC midnight.
const weekKey = (d = new Date()) => {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};
const weekKeyLabel = (k) => {
  const [, m, d] = k.split("-");
  return `${Number(m)}/${Number(d)}`;
};

// Build the strip for one row: its recorded weeks plus the current week's live
// hit, newest last, left-padded with nulls when we simply don't have 5 weeks.
// Labels come from the RECORDED week keys, so a gap week can't shift every
// square's date the way positional labelling did.
const buildStrip = (hist, liveHit) => {
  const merged = { ...(hist || {}) };
  if (typeof liveHit === "boolean") merged[weekKey()] = liveHit ? 1 : 0;
  const keys = Object.keys(merged).sort().slice(-STRIP_SLOTS);
  const pad = STRIP_SLOTS - keys.length;
  return {
    cells: [...Array(pad).fill(null), ...keys.map((k) => merged[k])],
    labels: [...Array(pad).fill(null), ...keys.map(weekKeyLabel)],
  };
};

// Fold this week's live hits into the stored history. Returns null when nothing
// changed so we never write on a plain read.
const recordWeek = (hist, live) => {
  const wk = weekKey();
  const next = { ...(hist || {}) };
  let changed = false;
  for (const [rowId, v] of Object.entries(live || {})) {
    if (!v || typeof v.hit !== "boolean") continue;
    const val = v.hit ? 1 : 0;
    const cur = next[rowId] || {};
    if (cur[wk] === val) continue;
    const grown = { ...cur, [wk]: val };
    const keys = Object.keys(grown).sort();
    next[rowId] = Object.fromEntries(keys.slice(-HISTORY_CAP).map((k) => [k, grown[k]]));
    changed = true;
  }
  return changed ? next : null;
};

/* ⛔ THE ROW SKELETON. Ids and measure names only: no owner, no goal, no
   actual. Those were deleted on 12 Aug 2026 — the owners moved into
   `eos:scorecard-owners:v1` and are edited in the tile, and the goals and
   actuals were already dead here because the producer feed covers all ten rows
   (checked: every row in eos:scorecard:2026-Q3 carries actual, goal AND hit).
   What shipped in every store's bundle until then was this store's sales,
   food cost, labour, speed, turnover, eval, cash-variance and CEM figures with
   five leaders' names against them.

   ⚠️⚠️ THE IDS ARE A CONTRACT WITH TWELVE FILES AND ARE NOT EDITABLE ANYWHERE.
   FCRPage, HRConsole, CashAudit, GuestExperience, LeadershipDev, LaborPlanner
   and ShiftLeaderScorecard PUBLISH into these ids; App.jsx's KPI strip,
   aiSummary.js, metricPlaybooks.js and worker.js READ them, and the Worker also
   uses the key as its security-sweep canary. Renaming one here silently breaks
   a feed and nothing would say so, which is why the editor edits the owner and
   nothing else.
   ⚠️ MEASURE NAMES STAY IN CODE ON PURPOSE. They are generic Chick-fil-A
   metrics, not this store's data, and a row with no name is not a row. They
   are also half of what makes an id readable to the next person.
   ⚠️ NOT GATED, DELIBERATELY. There is nothing store-specific left to gate: a
   second store gets the same ten measures with their own owners and their own
   feed. Gating it now would give a clone an empty scorecard for no reason. */
export const SCORECARD_ROWS = [
  { id: "s1", measure: "Sales vs LY" },
  { id: "s2", measure: "Food cost %" },
  { id: "s3", measure: "Labor %" },
  { id: "s4", measure: "Speed of service (avg)" },
  { id: "s5", measure: "Turnover (rolling 90d)" },
  { id: "s6", measure: "Evals completed on time" },
  { id: "s7", measure: "Promotion-ready leaders" },
  { id: "s8", measure: "Cash audit variance" },
  /* s9 "Open roles" was removed 7/23 2026 and must not come back without the
     number coming from the person who owns it. It was DERIVED from turnover,
     which is an invented standard wearing a scorecard row's authority. */
  { id: "s10", measure: "CEM Overall Satisfaction" },
  { id: "s11", measure: "CEM Fast Service" },
];

/* The store's own owner per row. Its OWN key, not `eos:scorecard:{period}`,
   and that is not a preference: producers REPLACE the whole row object when
   they publish (`next.s10 = { actual, goal, hit }`), so an owner written there
   would be wiped by the next CEM save. */
const SCORE_OWNERS_KEY = "eos:scorecard-owners:v1";

/* ⚠️ TWO SHAPES LIVE IN THIS RECORD AND BOTH ARE READ.
   The Save path has always written { id: { owner } }. The copy-into-storage
   button shipped on 12 Aug 2026 wrote { id: "Name" } instead — it handed the
   shipped map straight through without reshaping it — so the FIRST record
   created in production is the flat one. Spreading a string into the row gave
   {0:"M",1:"a",...} and left the owner undefined, which blanked the Owner
   column on all ten rows until this was added.
   ★ GUARDING THE READ RATHER THAN REWRITING THE RECORD IS DESIGN RULE 1. The
   record is live and its CONTENTS are right; only its shape is old. A row
   re-saved from the editor converges to the object form on its own, and
   nothing has to migrate for the board to be correct in the meantime.
   ⚠️ THE BUTTON THAT CAUSED IT IS GONE, along with the names it copied.
   ⚠️ DO NOT 'TIDY' THIS INTO ONE SHAPE without rewriting the stored record
   first, and there is no reason to: two cheap typeof tests cost nothing and
   the flat form disappears on its own as rows are edited. */
export const ownerOf = (v) =>
  typeof v === "string" ? v.trim()
    : v && typeof v.owner === "string" ? v.owner.trim()
      : "";

/* ★ PURE, MODULE LEVEL. An owner is trimmed, and a blank one REMOVES the row
   from the record rather than storing "" — an empty string and an absent key
   render identically, so storing one would be a row nobody could tell from no
   row. Same rule as the chart's seat entries. */
export function mergeRowOwner(live, id, name) {
  const out = { ...(live && typeof live === "object" && !Array.isArray(live) ? live : {}) };
  const key = String(id);
  const clean = String(name || "").trim();
  if (clean) out[key] = { owner: clean };
  else delete out[key];
  return out;
}

// One-time injected issues (Bri comp/IP · Hannah HR continuity). The live
// Issues list is KV data, so plain seeds only show on a first, empty run —
// these get added to the list exactly once, tracked by INJECT_MARKER_KEY, so
// they surface even over an existing KV list, never double-add, and never
// resurrect after being solved.
/* ⚠️ GATED ON THE STORE (Aug 11 2026). These are Gate City issues naming Gate
   City people, and the whole point of an injected seed is that it appears even
   over an existing list — so a second store would have had one arrive on their
   board about somebody they have never met. `injectIssues()` answers [] for
   anyone else, which makes the whole inject a no-op there. */
const injectIssues = () => (isGateCity() ? INJECT_ISSUES : []);
const INJECT_MARKER_KEY = "eos:issues-injected-v1";

/* ★ THE L10 SEAT ORDER, from storeConfig owners.eos.seatOrder (Aug 11 2026).
   A call, not a const: the tool list in App.jsx taught us that a captured value
   cannot follow a saved setting. Every warning that used to sit on the literal
   moved to the config beside the list. */
const seatOrder = () => eosNames("seatOrder");
/* Suggestions for the owner fields. Wider than the seat order, which is the L10
   seat order — a to-do can land on Cindy or Nick without them holding a seat
   on the rock board.
   ★ Kyleeka came off Aug 4 2026 (Matt: "kyleekas last day is 8/29 but she will
     be out alot so lets remove her from the eos"). Brandon and Daisy moved UP
     into the seat order at the same time, because they inherited her Rocks and now
     do hold seats on the board.
   ⚠️ REMOVING A NAME HERE DOES NOT BREAK A RECORD THAT STILL CARRIES IT. This
     list only populates the owner datalist; a Rock stored with an old owner
     still renders that owner. Old records must keep reading. */
const ownerOptions = () => eosNames("ownerOptions");

/* ═══ ROCKS WHOSE OWNER CAME OFF THE BOARD (Matt, Aug 10 2026) ══════════════
   🐛🐛 "brandons rocks arent in eos." They existed. All FOUR of the Rocks the
   Aug 4 handover was about were still stored under "Kyleeka", and every one of
   the three places that draws Rocks did `seatOrder.map(...)` and filtered on
   an exact owner match — so a Rock owned by anyone not seated rendered NOWHERE.
   Not on the board, not in the L10 segment, and not in the quarter-review panel
   either, which meant they could not even be carried forward or killed at the
   rollover. Two of the four were Brandon's; the other two were Kyleeka's own.

   ⚠️ THE COMMENT DIRECTLY ABOVE WAS WRONG, AND IT IS WHY THIS WAS INVISIBLE.
   It claimed "a Rock stored with an old owner still renders that owner". It did
   not. Removing a name from the seat order silently hid every Rock carrying it,
   and the on-track count in the header kept counting them, so the number and
   the board disagreed with nothing to explain the gap. Left in place above,
   struck through by this block, because the wrong belief is the story.

   ★ SO THE BOARD IS THE SEAT ORDER PLUS WHOEVER ELSE ACTUALLY HOLDS A ROCK.
   Seated people keep their order and their empty cards; anyone else appears
   after them, only while they still hold something, and disappears on their own
   once their last Rock is moved. Nothing to remember to clean up.

   ★ PURE, MODULE LEVEL, ONE COPY. Three renderers read it — two in EOSTile and
   one in RocksReviewPanel, which is a separate component — so a second copy
   would be a fourth chance for the board and the review to disagree about who
   exists. */
const boardOwners = (rocks) => {
  const seated = new Set(seatOrder());
  const extra = [];
  for (const r of (Array.isArray(rocks) ? rocks : [])) {
    const o = String((r && r.owner) || "").trim();
    if (o && !seated.has(o) && !extra.includes(o)) extra.push(o);
  }
  return [...seatOrder(), ...extra];
};
const isSeated = (owner) => seatOrder().includes(owner);

// Meeting-readiness checklist — what each director owes before the L10.
// Persisted to KV (eos:readiness:v1). Edit items freely; this is the source
// of truth the section renders from, and what the Monday touch-in reads.

/* ⚠️ GATED, NOT DELETED, AND NOT MADE EDITABLE EITHER — 12 Aug 2026, and the
   reasoning is the opposite of the scorecard's on the same day.

   The scorecard rows survived deletion because underneath the figures sat ten
   GENERIC Chick-fil-A measures any store tracks. There is nothing generic
   under this one. It is Gate City's own L10 setup, item by item: turnover and
   eval targets tied to s5 and s6, a named facilitator rotation, a note about
   who came off it in August, and time baselines two people gave in July. A
   second store would not want this list with the names changed. They would
   want a different list.

   ★ SO GATING IS THE WHOLE FIX, and an editor would be speculative. Nobody has
   asked for a second store to have a readiness checklist at all, and building
   sections, people, cadences and input placeholders for a want nobody has
   stated is the trade rule 16 warns about. Matt's call, 12 Aug 2026: gate it
   and stop.

   ⚠️ WHAT THIS DOES NOT DO. It stops a clone INHERITING five directors and
   their personal tasks. It does NOT stop them shipping — the list is still in
   the bundle every store downloads. That only ends with the editor, and the
   editor only earns its place when a store actually asks.

   ⚠️ A CALL, NEVER A CAPTURED CONST. `isGateCity()` reads the live store
   number, so a store that types its own into Settings has to be recognised
   from that moment rather than from the next deploy. All three readers below
   are inside the component and run at render, which is what makes that work.
   ⚠️ THE STORED STATE IS UNTOUCHED. `eos:readiness:v1` holds per-item answers
   keyed by item id; a store with no sections simply asks for none of them, and
   ids it never renders are ignored on read as they always have been. */
/* ⚠️⚠️ NAMED `readinessSections`, NOT `readiness`, AND THAT IS NOT STYLE.
   It shipped as `readiness()` on 12 Aug 2026 and took the whole EOS tile down:
   the component already has `const [readiness, setReadiness] = useState({})`
   for the per-item answers, so inside it the local SHADOWED this function and
   `readiness()` called an object. "I is not a function, I is an instance of
   Object", on a director's phone, with the tile refusing to open.
   ⚠️ THE SIX CHECKS CANNOT SEE THIS. `scope` asks whether a name resolves, and
   it did — to the wrong thing. `vite build` was green. Design rule 8 is the only
   thing that catches it: never define the same name twice, even in two scopes.
   ⚠️ AND MY TEST DID NOT SEE IT EITHER, because it imported this function and
   called it directly. That tests the export, not the use. */
export const readinessSections = () => (isGateCity() ? READINESS : []);

const STATUS = {
  on: { label: "On track", fg: C.green, bg: C.greenSoft },
  off: { label: "Off track", fg: C.red, bg: C.redSoft },
  tbd: { label: "Drafting", fg: C.amber, bg: C.amberSoft },
  /* ⚠️ "Drafting" means the rock is still being WRITTEN — not started, not
     stuck. It read as a progress state only because there was no way to mark a
     rock FINISHED, so a completed rock sat on "On track" forever or got
     deleted. */
  done: { label: "Done", fg: "#ffffff", bg: C.green },
};

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-xl p-4 ${className}`} style={{ background: cardSurface(), border: `1px solid ${C.line}`, ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
      {children}
    </div>
  );
}

function TabMissing({ name, file }) {
  return (
    <div className="rounded-xl p-6 text-center" style={{ backgroundColor: "#FBE7EC", border: "1px solid #DD0031", color: "#171C26" }}>
      <div className="font-bold mb-1">{name} didn't load</div>
      <div className="text-sm" style={{ color: "#5B6472" }}>
        The file <b>{file}</b> isn't in the app yet, or its name doesn't match exactly (camelCase, no underscores). Commit it and force-refresh.
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 className="eos-display text-sm font-bold uppercase tracking-wider mb-2" style={{ color: C.sub }}>
      {children}
    </h2>
  );
}

// ── Rocks quarterly-review panel ──────────────────────────────────────
// Shown in place of the normal Rocks board at a quarter roll. Walk each of last
// quarter's Rocks — Done / Re-commit / Drop — then re-commits plus any net-new
// drafts become the new quarter's list. This component only COLLECTS decisions
// and drafts into parent state; the actual live-KV read/write happens in the
// parent's finishReview. Both lists (personal + company) run in one pass.
const REVIEW_OPTS = [
  { key: "done", label: "Done", fg: C.green, bg: C.greenSoft },
  { key: "recommit", label: "Re-commit", fg: C.blue, bg: C.blueSoft },
  { key: "drop", label: "Drop", fg: C.red, bg: C.redSoft },
];

function DecisionRow({ id, title, sub, decisions, setDecisions }) {
  const cur = decisions[id];
  return (
    <li className="py-2.5" style={{ borderTop: `1px solid ${C.line}` }}>
      <div className="text-sm leading-snug">{title}</div>
      {sub && <div className="text-xs eos-mono mt-0.5" style={{ color: C.sub }}>{sub}</div>}
      <div className="flex gap-1.5 mt-2">
        {REVIEW_OPTS.map((o) => {
          const on = cur === o.key;
          return (
            <button
              key={o.key}
              onClick={() => setDecisions((d) => ({ ...d, [id]: o.key }))}
              className="px-2.5 py-1 rounded-full text-xs font-semibold"
              style={on
                ? { color: o.fg, backgroundColor: o.bg, border: `1px solid ${o.fg}` }
                : { color: C.sub, backgroundColor: C.card, border: `1px solid ${C.line}` }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </li>
  );
}

function AddRocks({ label, kind, rows, setRows, owners }) {
  const field = kind; // "owner" (personal) | "champion" (company)
  const add = () => setRows((r) => [...r, { [field]: owners[0], title: "" }]);
  const update = (i, patch) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const remove = (i) => setRows((r) => r.filter((_, j) => j !== i));
  return (
    <div className="mt-3">
      <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: C.sub }}>{label}</div>
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2 mb-2">
          <select
            value={row[field]}
            onChange={(e) => update(i, { [field]: e.target.value })}
            className="text-sm px-2 py-2 rounded-lg"
            style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper }}
          >
            {owners.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <input
            value={row.title}
            placeholder="New Rock…"
            onChange={(e) => update(i, { title: e.target.value })}
            className="flex-1 text-sm px-3 py-2 rounded-lg outline-none"
            style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper }}
          />
          <button onClick={() => remove(i)} className="px-2 text-sm" style={{ color: C.sub }} aria-label="Remove">✕</button>
        </div>
      ))}
      <button onClick={add} className="text-xs font-semibold px-3 py-1.5 rounded-full"
        style={{ color: C.blue, backgroundColor: C.blueSoft }}>
        + Add {kind === "owner" ? "individual" : "company"} Rock
      </button>
    </div>
  );
}

function RocksReviewPanel({ fromQuarter, toQuarter, rocks, companyRocks, decisions, setDecisions,
                            newPersonal, setNewPersonal, newCompany, setNewCompany, onFinish }) {
  const all = [...companyRocks, ...rocks];
  const total = all.length;
  const decidedCount = all.filter((r) => decisions[r.id]).length;
  const recommitCount = all.filter((r) => decisions[r.id] === "recommit").length;
  const allDecided = total > 0 && decidedCount === total;
  const fq = fromQuarter.split("-")[1];
  const tq = toQuarter.split("-")[1];

  return (
    <section className="mb-6">
      <div className="rounded-lg px-3 py-2.5 mb-4 text-sm"
        style={{ backgroundColor: C.amberSoft, border: `1px solid ${C.amber}`, color: "#78350F" }}>
        <span style={{ fontWeight: 800 }}>New quarter — {tq} review.</span>{" "}
        Walk each {fq} Rock: mark it <b>Done</b>, <b>Re-commit</b> it as a fresh {tq} Rock (new
        90-day clock), or <b>Drop</b> it. Re-commits plus anything you add below become {tq}'s Rocks.
        Last quarter stays archived with your call on each.
      </div>

      <SectionTitle>Company Rocks — {fq} review</SectionTitle>
      <Card>
        <ul>
          {companyRocks.map((r) => (
            <DecisionRow key={r.id} id={r.id} title={r.title} sub={`Champion: ${r.champion}`}
              decisions={decisions} setDecisions={setDecisions} />
          ))}
        </ul>
        <AddRocks label={`New company Rocks for ${tq}`} kind="champion"
          rows={newCompany} setRows={setNewCompany} owners={seatOrder()} />
      </Card>

      <div className="mt-5">
        <SectionTitle>Individual Rocks — {fq} review</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* boardOwners, not the seat order: a Rock left behind by somebody who
              came off the board has to be reviewable at the rollover, or it can
              be neither carried forward nor killed. */}
          {boardOwners(rocks).map((owner) => {
            const mine = rocks.filter((r) => r.owner === owner);
            if (!mine.length) return null;
            return (
              <Card key={owner}>
                <div className="eos-display font-bold mb-1">
                  {owner}
                  {!isSeated(owner) && <span className="eos-mono text-xs font-normal ml-2" style={{ color: C.red }}>not on the board</span>}
                </div>
                <ul>
                  {mine.map((r) => (
                    <DecisionRow key={r.id} id={r.id} title={r.title} sub={`updated ${r.updated}`}
                      decisions={decisions} setDecisions={setDecisions} />
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
        <Card className="mt-3">
          <AddRocks label={`New individual Rocks for ${tq}`} kind="owner"
            rows={newPersonal} setRows={setNewPersonal} owners={seatOrder()} />
        </Card>
      </div>

      <div className="flex items-center gap-3 mt-5 flex-wrap">
        <button
          onClick={onFinish}
          disabled={!allDecided}
          className="px-4 py-2 rounded-full text-sm font-bold"
          style={allDecided
            ? { backgroundColor: C.ink, color: "#fff" }
            : { backgroundColor: C.line, color: C.sub, cursor: "not-allowed" }}
        >
          Finish review → set {tq} Rocks
        </button>
        <span className="text-xs eos-mono" style={{ color: allDecided ? C.green : C.sub }}>
          {decidedCount}/{total} decided · {recommitCount} re-committing
        </span>
      </div>
    </section>
  );
}

// ---- Access gate (pre-release) ----
// Locked to Matt + Bri by roster name until the EOS rollout completes.
// App renders tiles as <Component tier={tier} user={user} />.
// Flip RELEASED = true to open the tile to all Tier 3.
const RELEASED = false;
/* ⚠️ THIS LIST IS THE REAL GATE WHILE RELEASED IS false — tier is not even
   consulted. So App.jsx's `allow: ["Director"]` opens the TILE and this opens
   the CONTENT, and a name missing here means a Director taps through to a
   locked screen, which is worse than not showing the tile at all.
   ★ Daisy asked for EOS on Aug 6 2026 and holds her own Q3 rock, which lives
   in here. Brandon is added with her because the exception in App.jsx is by
   ROLE, so he can already reach the tile — leaving him off this list would
   give him the locked screen this note exists to prevent.
   ⚠️ SPELLINGS MATTER AND THEY DRIFT. The gate compares against the ROSTER
   name from hrTeam.js — "Daisy Hernandez Espitia", no hyphen — while Slack
   knows her as "Daisy Hernandez-Espitia" and the accountability chart as
   "Daisy Hernandez". All three are listed, because a near-miss here fails
   silently and reads as "the fix did not work". */
/* ★ MOVED TO storeConfig owners.eos.allowed (Aug 11 2026), with every word of
   the spellings warning kept beside it there. */
/* ★ MOVED TO storeConfig owners.eos.directors. */
const RELEASED_MIN_TIER = 3;
const hasAccess = (tier, user) => {
  const name = (user?.name || "").trim().toLowerCase();
  const lower = (a) => a.map((x) => x.toLowerCase());
  if (RELEASED) return (tier ?? 0) >= RELEASED_MIN_TIER && lower(eosNames("directors")).includes(name);
  return lower(eosNames("allowed")).includes(name);
};

function LockedScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "#F4F6F8" }}>
      <div className="rounded-xl p-8 text-center max-w-sm" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E3E7EC" }}>
        <div className="text-3xl mb-3">🔒</div>
        <div className="font-bold mb-1" style={{ color: "#171C26", fontFamily: "'Archivo', sans-serif" }}>Leadership tile is in build</div>
        <div className="text-sm" style={{ color: "#5B6472", fontFamily: "'Inter', sans-serif" }}>
          Access is limited until the EOS rollout completes.
        </div>
      </div>
    </div>
  );
}

/* ★ QUICK CAPTURE — the box that sits under a meeting segment.
   ⚠️ MODULE LEVEL, NOT DECLARED INSIDE THE TILE. A component defined inside
   another component is a new function every render, so React throws the subtree
   away and the text box loses focus after each keystroke. That exact bug was
   found in TrainingSite this morning and cost Bri an unusable editor; this box
   is typed into mid-meeting, where losing focus would be worse. */
function QuickCapture({ segLabel, allowTodo, onCapture, C }) {
  const [text, setText] = React.useState("");
  const [who, setWho] = React.useState("");
  const send = (dest) => { if (onCapture(text, dest, who, segLabel)) { setText(""); setWho(""); } };
  return (
    <div className="mt-3 pt-3" style={{ borderTop: `1px dashed ${C.line}` }}>
      <div className="text-xs font-semibold mb-1.5" style={{ color: C.sub }}>
        Thought of something? Send it {allowTodo ? "to IDS or To-dos" : "to IDS"} without leaving this section.
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={text} onChange={(e) => setText(e.target.value)}
          placeholder="What came up…"
          className="text-sm px-2 py-1.5 rounded"
          style={{ flex: "2 1 200px", minWidth: 0, border: `1px solid ${C.line}`, color: C.ink }} />
        <input
          value={who} onChange={(e) => setWho(e.target.value)}
          placeholder="Who (optional)"
          className="text-sm px-2 py-1.5 rounded"
          style={{ flex: "1 1 110px", minWidth: 0, border: `1px solid ${C.line}`, color: C.ink }} />
        <button type="button" onClick={() => send("ids")} disabled={!text.trim()}
          className="text-xs font-bold px-3 py-1.5 rounded"
          style={{ border: `1px solid ${C.line}`, background: text.trim() ? C.ink : "#fff",
                   color: text.trim() ? "#fff" : C.sub, cursor: text.trim() ? "pointer" : "default" }}>
          → IDS
        </button>
        {allowTodo && (
          <button type="button" onClick={() => send("todo")} disabled={!text.trim()}
            className="text-xs font-bold px-3 py-1.5 rounded"
            style={{ border: `1px solid ${C.line}`, background: "#fff",
                     color: text.trim() ? C.ink : C.sub, cursor: text.trim() ? "pointer" : "default" }}>
            → To-do
          </button>
        )}
      </div>
    </div>
  );
}

// ---- Level 10 agenda (standard 90 min; month-close inserts +30 after IDS) ----
/* Timings are Bri's, Jul 29 2026, given to the minute. They still total 90, so
   the meeting is the same length — the time moved OUT of IDS and INTO rock
   review and to-dos, which is a deliberate change of emphasis rather than a
   longer meeting.
   ⚠️ IDS IS 50, NOT 60. It is the segment everything overruns into, so it was
   the one with slack to give. Do not "restore" it to 60 without her saying so. */
const AGENDA_STANDARD = [
  { id: "checkin", label: "Check-in", minutes: 5, kind: "checkin" },
  { id: "scorecard", label: "Scorecard", minutes: 5, kind: "scorecard" },
  { id: "rocks", label: "Rock review", minutes: 10, kind: "rocks" },
  { id: "headlines", label: "Headlines", minutes: 5, kind: "headlines" },
  { id: "todos", label: "To-do review", minutes: 10, kind: "todos" },
  /* Renamed at Bri's request — the letters mean nothing to somebody new, and
     this segment is half the meeting. */
  { id: "ids", label: "IDS: Identify, Discuss, Solve", minutes: 50, kind: "ids" },
  { id: "wrap", label: "Wrap", minutes: 5, kind: "wrap" },
];
const AGENDA_MONTHCLOSE = [
  ...AGENDA_STANDARD.slice(0, 6),
  { id: "monthclose", label: "Month-close", minutes: 30, kind: "monthclose" },
  AGENDA_STANDARD[6],
];
const formatClock = (totalSeconds) => {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

// A small dot marking whether a scorecard row's number is coming from the live
// data feed (green) or is still falling back to its seed value (hollow). Makes
// a silently-non-publishing producer visible instead of showing a stale number
// that looks live.
function LiveDot({ live }) {
  return (
    <span
      title={live ? "Live — coming from the data feed" : "Seed — this row isn't publishing yet"}
      style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", marginRight: 6, verticalAlign: "middle", flexShrink: 0, backgroundColor: live ? C.green : "transparent", border: live ? "none" : `1px solid ${C.sub}` }}
    />
  );
}

/* ★ ROUNDING A SEGMENTED BAR (Matt, Aug 5 2026: "the progress bar in the
   scorecard is still not rounded"). The single-fill bars were fixed with
   `rounded-full`, but the two SEGMENTED strips are a row of separate blocks,
   and rounding every block turns the strip into a line of pills. Only the two
   OUTER ends belong rounded, so the strip reads as one bar.
   ⚠️ DELIBERATELY NOT `overflow-hidden` on a rounded wrapper. That is the
   usual trick and it is the one that fails here: iPad Safari does not reliably
   clip a child to a rounded parent, which is exactly the square end being
   reported, on exactly the device leaders use.
   n === 1 rounds both ends of the one block it has. */
function segRadius(i, n) {
  if (n <= 1) return 999;
  if (i === 0) return "999px 0 0 999px";
  if (i === n - 1) return "0 999px 999px 0";
  return 0;
}

// Legend swatch for the Last-5 strip's three states.
function WeekSwatch({ state }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: 2,
        marginRight: 5,
        verticalAlign: "middle",
        flexShrink: 0,
        backgroundColor: state === "hit" ? C.green : state === "miss" ? C.redSoft : "transparent",
        border: state === "hit" ? "none" : state === "miss" ? `1px solid ${C.red}` : `1px dashed ${C.sub}`,
      }}
    />
  );
}

/* ⚠️⚠️ THE DEFAULT `user` IS A GATE, NOT A LABEL. `hasAccess` above compares
   `user.name` against the allowed list, so this default used to be a real
   person's name and a caller that forgot the prop was judged as him and let
   straight in. Empty fails closed, which is the only safe direction for a
   default that feeds a permission test. Found first at the second store. */
export default function EOSTile({ tier = 3, user = { name: "" } }) {
  const [tab, setTab] = useState("eos");
  /* ⛔ NO SEED. The individual Rocks live in `eos:rocks:{quarter}` and are
     edited in this tile; the hardcoded ten were deleted on 12 Aug 2026 after
     the live record was checked and held eighteen. Empty until hydration, and
     a failed read says so rather than drawing a board. */
  const [rocks, setRocks] = useState([]);
  const [newTodoOwner, setNewTodoOwner] = useState("Matt");
  const [newTodoDue, setNewTodoDue] = useState("");
  const [newRockTitle, setNewRockTitle] = useState("");
  const [newRockOwner, setNewRockOwner] = useState("Matt");
  /* ⚠️ GATED, AND IT WAS THE ONE THAT WAS NOT. `rocks` above and `issues`
     below have said `isGateCity() ? seed : []` for a while; this line sat
     between them still handing every store Gate City's four company Rocks,
     with Bri, Daisy and Hannah named on them.
     🐛 AND IT DID NOT ONLY DISPLAY THEM. The persist effect below writes
     `companyRocks` to `eos:companyrocks:{quarter}` once `hydrated`, and the
     mount read only calls setCompanyRocks when the store's own record has
     rows. So a second store opened EOS, kept this seed as its state, and then
     SAVED Gate City's Rocks into its own record — where they stop looking like
     a fallback and start looking like that store's own quarter. Same shape as
     the seven seed routes gated in the Worker on 12 Aug 2026, one layer up. */
  // Same: `eos:companyrocks:{quarter}` is the record, checked at four before
  // the seeded four were deleted.
  const [companyRocks, setCompanyRocks] = useState([]);

  // ── Rocks quarterly-review panel state ──────────────────────────────
  // rocksQuarter = the quarter whose Rocks are currently live/edited. Resolved
  // at hydration (see below): the calendar quarter if its review has been done
  // (marker present), else the authored pin ROCKS_QUARTER — with reviewNeeded
  // flipping on so the panel prompts the roll. Everything that reads/writes the
  // Rocks keys uses THIS, not the pin, so post-review edits land in the new key.
  const [rocksQuarter, setRocksQuarter] = useState(ROCKS_QUARTER);
  const [reviewNeeded, setReviewNeeded] = useState(false);
  const [reviewDecisions, setReviewDecisions] = useState({}); // rockId -> "done" | "recommit" | "drop"
  const [newPersonalRocks, setNewPersonalRocks] = useState([]); // [{ owner, title }]
  const [newCompanyRocks, setNewCompanyRocks] = useState([]);   // [{ champion, title }]
  // Scorecard actuals/goals go live per row as each owning tool publishes to
  // eos:scorecard:2026-Q3 ({ [rowId]: { actual?, goal?, hit? } }). Seed is the
  // fallback until a producer writes — so the board is never blank. _live marks
  // whether this row is actually coming from the feed vs still showing its seed.
  /* ── WHAT DAY IS THIS NUMBER FROM? ──────────────────────────────────────
     FCRPage stamps `asOf` (the last day the figure actually covers) and, on
     food cost, `stale`. Both have been written since Jul 23 and **nothing has
     ever rendered them**, which matters more since Jul 28: the labor % can now
     be HELD on purpose — FCRPage stops publishing and the last good figure
     stays put. Without this, a held number is indistinguishable from a live
     one, and the board quietly shows last week's labor as though it were today.
     ⚠️ DELIBERATELY NO "IS IT STALE YET" THRESHOLD. How many days old is too
     old is a cadence nobody has set, and inventing one would put a red flag on
     the board on a rule Matt never agreed. This states the date and lets the
     reader judge. */
  const asOfLabel = (row) => {
    const iso = row && row.asOf;
    if (!iso || typeof iso !== "string") return null;
    const d = new Date(iso + "T12:00:00");
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  /* "held" beats the date. A frozen number showing only a date reads as live —
     that is exactly what misled Matt on Jul 28. Say it has stopped moving
     FIRST, then say what day it stopped on. */
  const freshLabel = (row) => {
    const when = asOfLabel(row);
    if (row && row.held) return when ? `held \u00b7 as of ${when}` : "held";
    if (when) return `as of ${when}`;
    return row && row.stale ? "latest on file" : null;
  };


  const [scoreLive, setScoreLive] = useState({});
  /* The store's own owner per scorecard row, from SCORE_OWNERS_KEY. Its own
     record because the producer feed replaces whole rows when it publishes. */
  const [scoreOwners, setScoreOwners] = useState({});
  const [ownerEdit, setOwnerEdit] = useState(null);   // { id, name } | null
  const [ownerSaving, setOwnerSaving] = useState(false);
  const [ownerMsg, setOwnerMsg] = useState("");
  const [history, setHistory] = useState({});
  const scorecard = useMemo(
    /* ⚠️ THREE LAYERS, AND THE ORDER IS THE POINT. The skeleton gives the id
       and the measure name; the store's saved record gives the owner; the
       producer feed goes on LAST and keeps winning, which is what makes the
       numbers live rather than typed. */
    () => SCORECARD_ROWS.map((row) => {
      const ownName = ownerOf(scoreOwners[row.id]);
      const live = scoreLive[row.id];
      const isLive = !!(live && (live.actual != null || typeof live.hit === "boolean"));
      const merged = { ...row, ...(ownName ? { owner: ownName } : {}), ...(live || {}), _live: isLive };
      // weeks/weekLabels are DERIVED — they overwrite anything a producer sent,
      // because observed history is the only honest source for the strip.
      const { cells, labels } = buildStrip(
        history[row.id],
        typeof merged.hit === "boolean" ? merged.hit : null
      );
      return { ...merged, weeks: cells, weekLabels: labels };
    }),
    [scoreLive, scoreOwners, history]
  );
  // `eos:issues` held fifteen when the seeded three were deleted.
  const [issues, setIssues] = useState([]);
  /* ⚠️ THIS ONE WAS NEVER GATED AT ALL, and it persists — the same defect as
     companyRocks earlier on 12 Aug 2026, one line down and missed with it. A
     second store kept these five as its state and saved them into its own
     `eos:todos`. Deleting the seed closes both halves at once: nothing to
     inherit and nothing to ship. The record held ten. */
  const [todos, setTodos] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  /* Set when any mount read failed to reach the database. While it is true
     `hydrated` stays false, so not one of the autosave effects can fire. */
  const [loadFailed, setLoadFailed] = useState(false);
  // A board write came back false after a clean load — rendered as the red
  // banner; clears on the next write that lands.
  const [saveWarn, setSaveWarn] = useState(false);
  // false = the readiness side-record's read failed — its handlers refuse.
  const readinessOk = useRef(true);
  const [newIssue, setNewIssue] = useState("");
  const [toast, setToast] = useState("");

  // Meeting-readiness checklist (KV-persisted)
  const [readiness, setReadiness] = useState({});
  const [readyOpen, setReadyOpen] = useState(true);
  const [hubOpen, setHubOpen] = useState(false);

  // Live shift-leader development feed (written by ShiftLeaderScorecard.jsx)
  const [slRollup, setSlRollup] = useState(null);

  // Meeting Mode state
  const [isMonthClose, setIsMonthClose] = useState(false);
  /* ⚠️ FROM CONFIG, NOT A LITERAL, AND IT USED TO BE THE SAME NAME TWICE.
     l10Schedule.js had its own FACILITATOR const saying the same thing, which
     is design rule 8 exactly: two definitions of one fact, in two files, that
     drift the first time somebody changes the rotation in one of them. */
  const [facilitator, setFacilitator] = useState(eosFacilitator());
  const [segIdx, setSegIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(AGENDA_STANDARD[0].minutes * 60);
  const [meetingRunning, setMeetingRunning] = useState(false);
  const [meetingStarted, setMeetingStarted] = useState(false);
  const [headlinesText, setHeadlinesText] = useState("");
  const [newTodoText, setNewTodoText] = useState("");
  const [wrapNotes, setWrapNotes] = useState("");
  const [rating, setRating] = useState(null);

  const agenda = isMonthClose ? AGENDA_MONTHCLOSE : AGENDA_STANDARD;

  /* ★ THE TIMER SURVIVES LEAVING THE TILE, AND PAUSES WHILE YOU ARE AWAY.
     Bri, Jul 29 2026: "I don't want the timer restarting if I move between tabs
     or to a different page. I'd like it to automatically pause instead and
     restart when I return."

     It was restarting because this tile UNMOUNTS the moment she opens another
     tool, taking `segIdx`, `secondsLeft` and `meetingRunning` with it. Coming
     back rebuilt the component from its defaults, which reads as the timer
     resetting to the top of the meeting — mid-L10, in front of the room.

     ⇒ The running meeting is written to localStorage on every tick, and read
     back on mount. Leaving pauses it; returning offers it back exactly where it
     stopped.

     ⚠️ PAUSED, NOT KEPT RUNNING IN THE BACKGROUND. Wall-clock time would be the
     easy version — store a start time and subtract — but that means the segment
     drains while she is answering an email, and she asked for the opposite. The
     stored value is the remaining seconds, frozen.
     ⚠️ It also pauses when the browser tab goes to the background, which is the
     same intent for the same reason.
     ⚠️ The session is dropped once the meeting ends, so next week never
     resumes into last week's leftovers. */
  const MEETING_KEY = "gcfcr-eos-meeting-session-v1";

  useEffect(() => {
    if (!meetingRunning) return;
    const t = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    const away = () => { if (document.hidden) setMeetingRunning(false); };
    document.addEventListener("visibilitychange", away);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", away); };
  }, [meetingRunning]);

  /* Save on every change while a meeting is on. Cheap, and it means an
     unmount at any instant loses at most one second. */
  useEffect(() => {
    if (!meetingStarted) return;
    try {
      localStorage.setItem(MEETING_KEY, JSON.stringify({
        segIdx, secondsLeft, isMonthClose, at: new Date().toISOString(),
      }));
    } catch { /* a lost resume is a nuisance, never a failure */ }
  }, [meetingStarted, segIdx, secondsLeft, isMonthClose]);

  /* Pick a meeting back up. PAUSED on return — she chooses when the room is
     ready, rather than the clock running while she finds her place. */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(MEETING_KEY);
      if (!raw) return;
      const sv = JSON.parse(raw);
      if (!sv || typeof sv.secondsLeft !== "number") return;
      /* ⚠️ SAME DAY ONLY. A resume offered on Thursday for Monday's meeting is
         noise, and worse, it would put stale leftovers on screen at the start of
         a fresh L10. */
      const sameDay = String(sv.at || "").slice(0, 10) === todayLocal();
      if (!sameDay) { localStorage.removeItem(MEETING_KEY); return; }
      /* 🐛🐛 THE MONTH-CLOSE TICK WAS SAVED AND NEVER RESTORED, AND IT KILLED
         THE WHOLE TILE FOR THE REST OF THE DAY (found Aug 4 2026).
         AGENDA_MONTHCLOSE has 8 segments, AGENDA_STANDARD has 7. Wrap is the
         LAST segment, so every month-close L10 necessarily sits on segIdx 7
         while the facilitator types the wrap notes and the rating. The save
         above writes {segIdx: 7, isMonthClose: true}. This effect restored the
         7 and dropped the true, so `agenda` fell back to the 7-entry standard
         list, `agenda[7]` was undefined, and `agenda[segIdx].minutes` at the
         elapsed-total line threw DURING RENDER.
         ⇒ That line sits at component-body level with no early return above it,
         so the tile died into the error card whichever tab was showing.
         Reopening re-ran this resume and crashed again, and endMeeting is the
         only code that clears the key and it cannot be clicked from an error
         card — so EOS stayed dead until midnight.
         ⚠️ The clamp is computed from the SAVED flag, not from `agenda`. State
         setters do not apply until the next render, so reading `agenda` here
         would still be the old one. An old record with no isMonthClose key
         reads as false and clamps to the standard list, which is right. */
      const savedMonthClose = sv.isMonthClose === true;
      const savedAgenda = savedMonthClose ? AGENDA_MONTHCLOSE : AGENDA_STANDARD;
      setIsMonthClose(savedMonthClose);
      setSegIdx(Math.min(savedAgenda.length - 1, Math.max(0, Number(sv.segIdx) || 0)));
      setSecondsLeft(Math.max(0, sv.secondsLeft));
      setMeetingStarted(true);
      setMeetingRunning(false);
    } catch { /* nothing to resume */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load readiness once from KV.
  // Bri's 101/201 baselines (shared Jul 11) are seeded as defaults so they
  // display in the tile; anything typed in the app always wins over these.
  useEffect(() => {
    let alive = true;
    (async () => {
      const DEFAULTS = {
        "b-101-time": { value: "~17 hrs / full run (15-20, incl. prep + emailing)" },
        "b-201-prep": { value: "~9 hrs (6 prep + 3 delivery)" },
      };
      // ⚠️ kvGetResult, matching the quarter reads below — this one was missed
      // when they were converted. A FAILED read arrived as {}, and the
      // persist-once branch then wrote just the two DEFAULTS over everything
      // anyone had typed into readiness. Display-only on failure, no write.
      const r = await kvGetResult("eos:readiness:v1").catch(() => ({ ok: false, value: null }));
      if (!alive) return;
      if (!r.ok) { readinessOk.current = false; setReadiness(DEFAULTS); return; }
      const saved = r.value || {};
      const merged = { ...DEFAULTS, ...saved };
      setReadiness(merged);
      // Persist once if the baselines weren't already stored, so the Monday
      // touch-in sees them filled and doesn't nag Bri for them.
      if (!saved["b-101-time"] || !saved["b-201-prep"]) {
        kvSet("eos:readiness:v1", merged).catch(() => {});
      }
    })();
    return () => { alive = false; };
  }, []);

  // Load the shift-leader development rollup (leading indicator for the leadership development Rock, r8)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await kvGet("gcfcr-sl-eos-rollup-v1");
        if (alive && r && typeof r === "object") setSlRollup(r);
      } catch (e) { /* not written yet — Leader Scorecard hasn't run */ }
    })();
    return () => { alive = false; };
  }, []);

  // ── Hydrate the editable EOS state from KV (seed = first-run fallback) ──
  // Rocks / Company Rocks / Issues / To-dos persist here; the scorecard reads
  // live per-row overrides other tools publish. hydrated gates the save
  // effects so we never overwrite saved data with seeds on first paint.
  useEffect(() => {
    let alive = true;
    (async () => {
      // Resolve which quarter's Rocks are live. The scorecard rolls
      // automatically; Rocks do NOT — a rolled quarter needs a deliberate
      // review. If the calendar quarter has moved past the authored pin, look
      // for a review marker: present → the roll's already been done, read the
      // new quarter; absent → still on the old quarter's Rocks, so reviewNeeded
      // flips on and the panel prompts the roll. (Single-roll assumption: the
      // tile is opened every quarter via the weekly L10, so we never skip past
      // an unreviewed quarter; if one ever were, we fall back to the pin.)
      const cal = eosPeriod();
      let activeQ = ROCKS_QUARTER;
      let needReview = false;
      let reviewed = false;              // has THIS quarter been through a review?
      if (cal !== ROCKS_QUARTER) {
        // Result-style like every read below: a FAILED marker read is not the
        // same as "quarter not reviewed yet". Treating it that way pointed all
        // seven reads at the OLD quarter and prompted a re-roll that had
        // already happened — invisible, because the some(!ok) gate never saw
        // this read. A failed marker read now trips the same banner.
        const markR = await kvGetResult(`eos:rocks-reviewed:${cal}`);
        if (!alive) return;
        if (!markR.ok) { setLoadFailed(true); return; }
        if (markR.value) { activeQ = cal; reviewed = true; }
        else needReview = true;
      }
      /* ★★ READ FAILURES ARE TRACKED, NOT SWALLOWED.
         🐛 These were `kvGet(...).catch(() => null)`. kvGet already answers
         null for a failed read, so on flaky wifi every value came back null,
         Rocks/Issues/To-Dos stayed on their hardcoded SEEDS, `hydrated` flipped
         true anyway, and the four autosave effects below immediately WROTE THE
         SEED OVER THE QUARTER'S REAL WORK. The director saw a normal-looking
         board with the wrong content and nothing said a word — this file had no
         error message anywhere in it.
         `kvGetResult` separates "nothing stored" from "could not reach it". If
         any read failed we show that and never set `hydrated`, so nothing
         saves. */
      // kvGetResult never throws (store.js contract) — no .catch needed.
      const reads = await Promise.all([
        kvGetResult(`eos:rocks:${activeQ}`),
        kvGetResult(`eos:companyrocks:${activeQ}`),
        kvGetResult("eos:issues"),
        kvGetResult("eos:todos"),
        kvGetResult(`eos:scorecard:${eosPeriod()}`),
        kvGetResult(SCORE_OWNERS_KEY),
        kvGetResult(INJECT_MARKER_KEY),
        kvGetResult(HISTORY_KEY),
      ]);
      if (!alive) return;
      if (reads.some((r) => !r.ok)) { setLoadFailed(true); return; }
      const [kR, kC, kI, kT, kS, kSO, kInj, kH] = reads.map((r) => r.value);
      setScoreOwners(kSO && typeof kSO === "object" && !Array.isArray(kSO) ? kSO : {});
      setRocksQuarter(activeQ);
      setReviewNeeded(needReview);
      // ⚠️ EMPTY IS ONLY MEANINGLESS BEFORE THE FIRST REVIEW. On a never-seeded
      // key, [] means "nothing saved yet" and the seed is the right board. But
      // once a quarter HAS been reviewed, [] is a real answer — a team can
      // finish a review having dropped or completed everything and re-committed
      // nothing, intending to set the new Rocks at the L10. Falling back to the
      // seed there would put ten Rocks nobody committed to on the board, and
      // the save effect below would then PERSIST that fiction over the real
      // empty state. So after a review, honour [].
      if (Array.isArray(kR) && (kR.length || reviewed)) setRocks(kR);
      if (Array.isArray(kC) && (kC.length || reviewed)) setCompanyRocks(kC);
      // Issues/todos CAN be legitimately empty (all solved/done) → honor [].
      // Then inject the one-time items once (see injectIssues()): append any not
      // already injected and not already present, and record them so they don't
      // come back if solved. The eos:issues save effect persists the result.
      /* ⚠️ `[]`, NOT A SEED. This read `seedIssues` until 12 Aug 2026, so a
         failed issues read fell back to three hardcoded ones. With the seed
         deleted that name resolves to nothing and this line would have THROWN
         on exactly the unhappy path it exists to handle — caught by the scope
         check, not by the build, which went green with it in. An empty base is
         the honest answer now: the failed-read banner above says the boards are
         empty because nothing loaded, and `hydrated` stays false so none of it
         can be saved over the real list. */
      const baseIssues = Array.isArray(kI) ? kI : [];
      const injected = Array.isArray(kInj) ? kInj : [];
      const toInject = injectIssues().filter(
        (it) => !injected.includes(it.id) && !baseIssues.some((x) => x.id === it.id)
      );
      if (toInject.length) {
        setIssues([...baseIssues, ...toInject]);
        // Best-effort marker — kvSet returns false rather than throw (the old
        // .catch was dead). A missed marker just re-runs this dedup next open;
        // the id checks above make re-injection a no-op.
        kvSet(INJECT_MARKER_KEY, [...injected, ...toInject.map((it) => it.id)]);
      } else if (Array.isArray(kI)) {
        setIssues(kI);
      }
      if (Array.isArray(kT)) setTodos(kT);
      if (kS && typeof kS === "object") setScoreLive(kS);
      // Fold this week's hits into the stored strip history. recordWeek returns
      // null when this week is already on file with the same values, so simply
      // opening the tile twice never writes.
      const priorHist = kH && typeof kH === "object" ? kH : {};
      const nextHist = recordWeek(priorHist, kS);
      setHistory(nextHist || priorHist);
      // Best-effort fold — a missed write refolds on the next open (recordWeek
      // is idempotent for identical values). kvSet returns false, never throws.
      if (nextHist) kvSet(HISTORY_KEY, nextHist);
      setHydrated(true);
    })();
    return () => { alive = false; };
  }, []);

  // Persist to the ACTIVE quarter (rocksQuarter), not the authored pin — after a
  // review the active quarter is the new one, and these must follow it so edits
  // land in the current key and never overwrite the archived quarter.
  // Each write reports back: kvSet returns FALSE on a refused write (it never
  // throws — the old .catch chains were dead code), and the red banner below
  // stays up while writes keep failing, clearing on the first one that lands.
  // Status cycles and typed items stay on screen either way, so nothing is
  // lost locally; the banner is what stops "it looked saved" from being a lie.
  const persistBoard = (key, val) => {
    kvSet(key, val).then((ok) => setSaveWarn(ok === false));
  };
  /* ⚠️ READ BEFORE WRITE, AND A FAILED READ REFUSES. One object holds every
     row's owner, so writing a stale copy drops whatever another director set
     in between. kvGetResult, not kvGet: kvGet flattens "not set yet" and "the
     database refused" both to null, and only one of those is safe to write on
     top of. Same shape as the chart's seat editor and the store-config route. */
  const writeOwners = async (next) => {
    setOwnerSaving(true);
    setOwnerMsg("");
    const cur = await kvGetResult(SCORE_OWNERS_KEY);
    if (!cur.ok) {
      setOwnerSaving(false);
      setOwnerMsg("Could not read the owners that are saved now, so nothing changed. Try again.");
      return false;
    }
    const live = cur.value && typeof cur.value === "object" && !Array.isArray(cur.value) ? cur.value : {};
    const merged = next(live);
    const ok = await kvSet(SCORE_OWNERS_KEY, merged, user && user.name);
    setOwnerSaving(false);
    if (!ok) { setOwnerMsg("That did not save. Nothing has changed."); return false; }
    setScoreOwners(merged);
    return true;
  };
  const saveOwner = async (id, name) => {
    if (await writeOwners((live) => mergeRowOwner(live, id, name))) setOwnerEdit(null);
  };

  useEffect(() => { if (hydrated) persistBoard(`eos:rocks:${rocksQuarter}`, rocks); }, [rocks, hydrated, rocksQuarter]);
  useEffect(() => { if (hydrated) persistBoard(`eos:companyrocks:${rocksQuarter}`, companyRocks); }, [companyRocks, hydrated, rocksQuarter]);
  useEffect(() => { if (hydrated) persistBoard("eos:issues", issues); }, [issues, hydrated]);
  useEffect(() => { if (hydrated) persistBoard("eos:todos", todos); }, [todos, hydrated]);

  /* Move a Rock to a different owner. Persists through the same autosave every
     other rock edit uses, so there is nothing extra to save. */
  const setRockOwner = (id, owner) => {
    const next = String(owner || "").trim();
    if (!next) return;                       // never blank an owner into nowhere
    setRocks((rs) => rs.map((r) => (r.id === id ? { ...r, owner: next } : r)));
  };

  const cycleStatus = (id) =>
    setRocks((rs) =>
      rs.map((r) =>
        r.id === id
          ? {
              ...r,
              /* on → off → drafting → done → on. Done sits last so a finished
                 rock takes one extra tap to un-finish, not one to lose. */
              status: r.status === "on" ? "off" : r.status === "off" ? "tbd" : r.status === "tbd" ? "done" : "on",
              updated: TODAY.toISOString().slice(0, 10),
            }
          : r
      )
    );

  const cycleCompanyStatus = (id) =>
    setCompanyRocks((rs) =>
      rs.map((r) =>
        r.id === id
          ? {
              ...r,
              /* on → off → drafting → done → on. Done sits last so a finished
                 rock takes one extra tap to un-finish, not one to lose. */
              status: r.status === "on" ? "off" : r.status === "off" ? "tbd" : r.status === "tbd" ? "done" : "on",
              updated: TODAY.toISOString().slice(0, 10),
            }
          : r
      )
    );

  // ── Finish the quarterly review ──────────────────────────────────────
  // Survivors (re-commits, as FRESH Rocks with a new id + today's date) plus any
  // net-new drafts become the new quarter's list. The old quarter's key is left
  // in place as the archive but ENRICHED with each Rock's verdict and marked
  // not-done (done → on, re-commit/drop → off). A marker gates re-trigger, and
  // local state flips to the new quarter so the normal board returns.
  // All writes go through live KV (kvSet). There are no seed arrays left to
  // write over: only the scorecard still has one, and it is never persisted.
  const finishReview = async () => {
    const today = TODAY.toISOString().slice(0, 10);
    const toQ = eosPeriod();          // the new (calendar) quarter, e.g. "2026-Q4"
    const fromQ = rocksQuarter;        // the quarter under review (archive target)
    const mkId = (p) => `${p}-${toQ}-${Math.random().toString(36).slice(2, 7)}`;
    const dec = reviewDecisions;

    const newRocks = [
      ...rocks
        .filter((r) => dec[r.id] === "recommit")
        .map((r) => ({ id: mkId("r"), owner: r.owner, title: r.title, status: "on", updated: today })),
      ...newPersonalRocks
        .filter((n) => n.owner && n.title.trim())
        .map((n) => ({ id: mkId("r"), owner: n.owner, title: n.title.trim(), status: "on", updated: today })),
    ];
    const newCompany = [
      ...companyRocks
        .filter((r) => dec[r.id] === "recommit")
        .map((r) => ({ id: mkId("cr"), champion: r.champion, title: r.title, status: "on", updated: today })),
      ...newCompanyRocks
        .filter((n) => n.champion && n.title.trim())
        .map((n) => ({ id: mkId("cr"), champion: n.champion, title: n.title.trim(), status: "on", updated: today })),
    ];

    const archive = (r) => ({
      ...r,
      status: dec[r.id] === "done" ? "on" : "off",   // "marked not-done" unless completed
      review: dec[r.id] || "drop",
      reviewedAt: today,
    });
    const archPersonal = rocks.map(archive);
    const archCompany = companyRocks.map(archive);

    // Old key stays as the archive (enriched); new key gets survivors; marker
    // set LAST — it is what tells every future open the roll happened, so it
    // must never exist ahead of the content it describes.
    // ⚠️ FIVE WRITES, ALL CHECKED, ABORT ON THE FIRST FAILURE. These used to
    // run with dead .catch chains and then toast success unconditionally while
    // clearing the review inputs — a half-landed roll looked exactly like a
    // finished one. kvSet returns false rather than throw. Aborting mid-way is
    // safe: the marker is not yet written, so the next press re-runs the whole
    // roll over the same keys with the same inputs, which are NOT cleared on
    // failure.
    const steps = [
      [`eos:rocks:${fromQ}`, archPersonal],
      [`eos:companyrocks:${fromQ}`, archCompany],
      [`eos:rocks:${toQ}`, newRocks],
      [`eos:companyrocks:${toQ}`, newCompany],
      [`eos:rocks-reviewed:${toQ}`, {
        at: today,
        from: fromQ,
        personal: archPersonal.map((r) => ({ id: r.id, review: r.review })),
        company: archCompany.map((r) => ({ id: r.id, review: r.review })),
      }],
    ];
    for (const [k, v] of steps) {
      const ok = await kvSet(k, v);
      if (ok === false) {
        setToast("The roll did not finish — nothing was lost. Check the wifi and press it again.");
        setTimeout(() => setToast(""), 4000);
        return;
      }
    }

    // Flip local state to the new quarter. The write-back effects (now keyed to
    // rocksQuarter = toQ) re-persist survivors to the new key — idempotent — and
    // never touch the archived old key.
    setRocksQuarter(toQ);
    setRocks(newRocks);
    setCompanyRocks(newCompany);
    setReviewDecisions({});
    setNewPersonalRocks([]);
    setNewCompanyRocks([]);
    setReviewNeeded(false);
    setToast(`${toQ.split("-")[1]} Rocks set — ${fromQ.split("-")[1]} archived`);
    setTimeout(() => setToast(""), 2500);
  };

  const pushIssue = (text, from) => {
    setIssues((xs) => [...xs, { id: `i${Date.now()}`, text, from }]);
    setToast("Added to issues queue");
    setTimeout(() => setToast(""), 2000);
  };

  /* ★ CAPTURE IT WHERE YOU THOUGHT OF IT.
     Bri, Jul 29 2026: "Add option like a box with IDS and To-do's at the bottom
     of Check-in, scorecard, rock review, and headlines that pulls items directly
     over to IDS or To-do's lists without moving between sections. If we think of
     it during the other sections, we can note it to automatically pull over to
     the appropriate sections without having to try to remember or pause to note
     it."

     The problem is not navigation, it is MEMORY. Something surfaces during
     Scorecard, the meeting is on a timer, and the only options were to hold it
     in your head until IDS or stop the room and go find the list. Both cost
     more than the item is worth, so items get dropped.

     ⚠️ THE SEGMENT IT CAME FROM IS RECORDED. An issue that says only "cover
     situation" is a puzzle by the time IDS arrives; "cover situation — raised
     in Scorecard" is a thread you can pull. It costs nothing to store and it is
     unrecoverable later.
     ⚠️ To-dos take an OWNER, issues take a name too (Bri asked for both), but
     neither is required. A capture box that demands two fields before it will
     accept anything is a capture box people stop using mid-meeting. */
  const quickCapture = (text, dest, who, fromSeg) => {
    const t = String(text || "").trim();
    if (!t) return false;
    const stamp = fromSeg ? `${t} — raised in ${fromSeg}` : t;
    if (dest === "todo") {
      setTodos((xs) => [...xs, { id: `t${Date.now()}`, text: stamp, owner: String(who || "").trim() || "Unassigned", done: false }]);
      setToast("Added to To-dos");
    } else {
      setIssues((xs) => [...xs, { id: `i${Date.now()}`, text: stamp, from: String(who || "").trim() || "You" }]);
      setToast("Added to IDS");
    }
    setTimeout(() => setToast(""), 2000);
    return true;
  };

  // Only a REAL miss mints an issue. A no-data cell (null) is not a miss and
  // never fires — that's the whole point of the tri-state.
  const missToIssue = (row, weekIdx) => {
    const cells = weeksOf(row);
    if (cells[weekIdx] !== MISS) return;
    // Label from the RECORDED week, not a positional offset. With real history a
    // gap week shifts the array, so counting backwards from "now" would stamp
    // the wrong date on the issue.
    const wk = (row.weekLabels || [])[weekIdx];
    pushIssue(`${row.measure} missed goal (${row.goal})${wk ? ` — wk of ${wk}` : ""}`, row.owner || "");
  };

  const addIssue = () => {
    const t = newIssue.trim();
    if (!t) return;
    pushIssue(t, "You");
    setNewIssue("");
  };

  const bumpIssue = (idx) => {
    if (idx === 0) return;
    setIssues((xs) => {
      const copy = [...xs];
      [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
      return copy;
    });
  };

  const solveIssue = (id) => setIssues((xs) => xs.filter((x) => x.id !== id));
  const toggleTodo = (id) => setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  /* ★ REMOVE A TO-DO, WITH A WAY BACK.
     Bri, Jul 29 2026: "Can we also have a delete option for the To-do's once we
     no longer need to view it?"

     ⚠️ AN UNDO, NOT A CONFIRM DIALOG. This list is worked through live in a
     meeting on a timer. A confirm box on every removal is friction at exactly
     the wrong moment, and people learn to dismiss it without reading — which
     makes it worse than nothing. An undo costs one tap only when you got it
     wrong.
     ⚠️ THE POSITION IS REMEMBERED, not just the item. Putting a to-do back at
     the bottom of the list when it was third would look like a different item,
     and in a meeting people track by position.
     ⚠️ ONE LEVEL OF UNDO. A stack would need clearing rules nobody would ever
     see, and the realistic mistake is the tap you just made. */
  const [undoTodo, setUndoTodo] = useState(null);
  const removeTodo = (id) => {
    setTodos((ts) => {
      const at = ts.findIndex((t) => t.id === id);
      if (at < 0) return ts;
      setUndoTodo({ item: ts[at], at });
      return ts.filter((t) => t.id !== id);
    });
  };
  const putTodoBack = () => {
    if (!undoTodo) return;
    setTodos((ts) => {
      const next = ts.slice();
      next.splice(Math.min(undoTodo.at, next.length), 0, undoTodo.item);
      return next;
    });
    setUndoTodo(null);
  };

  // ---- Readiness handlers ----
  /* ⚠️ Gated on the readiness READ having succeeded. The effect above renders
     DEFAULTS on a failed read without tripping the main loadFailed banner (it
     is a side record), so without this gate one toggle wrote DEFAULTS-plus-a-
     tick over everything typed into readiness — the display-only promise the
     effect's comment makes held for its own branch but not for these handlers. */
  const persistReadiness = (next) => {
    if (!readinessOk.current) return;
    const prev = readiness;
    setReadiness(next);
    // kvSet returns false rather than throw (the old .catch was dead). Roll
    // the tick back on a refused write — a checked box the Monday touch-in
    // can't see is worse than an unchecked one — and raise the red banner.
    kvSet("eos:readiness:v1", next).then((ok) => {
      if (ok === false) { setReadiness(prev); setSaveWarn(true); }
      else setSaveWarn(false);
    });
  };
  const toggleReady = (id) => {
    const cur = readiness[id] || {};
    persistReadiness({ ...readiness, [id]: { ...cur, done: !cur.done } });
  };
  const onTypeReady = (id, value) => {
    const cur = readiness[id] || {};
    setReadiness({ ...readiness, [id]: { ...cur, value } });
  };
  const saveReady = () => { persistReadiness({ ...readiness }); };

  // Auto-derived readiness: item 1 checks itself off the live Company Rocks —
  // four entered, each with a champion and marked on/off-track (not "drafting").
  const companyRocksReady =
    companyRocks.length === 4 &&
    companyRocks.every((r) => r.champion && (r.status === "on" || r.status === "off"));
  const AUTO_DONE = { "m-rocks": companyRocksReady };
  const isDone = (item) =>
    item.id in AUTO_DONE ? AUTO_DONE[item.id] : !!(readiness[item.id] && readiness[item.id].done);

  // An item is "resolved" if its check is done, its input has a value, or it's
  // an informational note. Used to split the readiness view into two zones:
  //   WEEKLY — the recurring ritual each owner brings to every L10 (Rock +
  //            issues). Always visible; this is what "prep" actually is.
  //   SETUP  — one-time build/baseline. Collapses once complete; a badge on the
  //            header flags anything still (or newly) unresolved so a broken
  //            item can't hide.
  const itemResolved = (item) =>
    item.type === "note" ? true
    : item.type === "input" ? !!(readiness[item.id] && readiness[item.id].value)
    : isDone(item);

  const allItems = readinessSections().flatMap((s) => s.items);
  const weeklyItems = allItems.filter((i) => i.cadence === "weekly");
  const setupItems = allItems.filter((i) => i.cadence !== "weekly");

  const weekChecks = weeklyItems.filter((i) => i.type === "check");
  const weekDone = weekChecks.filter((i) => isDone(i)).length;
  const weekTotal = weekChecks.length;
  const weekPct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0;
  const weekAll = weekTotal > 0 && weekDone === weekTotal;

  const setupDone = setupItems.filter(itemResolved).length;
  const setupTotal = setupItems.length;
  const setupAll = setupTotal > 0 && setupDone === setupTotal;
  const setupPending = setupTotal - setupDone;

  // Setup zone: auto-open while there's build work, auto-collapse once done.
  // setupOpen === null means "follow that rule"; a click pins it either way.
  const [setupOpen, setSetupOpen] = useState(null);
  const setupExpanded = setupOpen === null ? !setupAll : setupOpen;

  // Legacy aggregate (kept for the Monday touch-in / any other reader).
  const readyChecks = allItems.filter((i) => i.type === "check");
  const readyDone = readyChecks.filter((i) => isDone(i)).length;
  const readyTotal = readyChecks.length;
  const readyAll = readyTotal > 0 && readyDone === readyTotal;

  // Only owners who actually have a weekly item show up in the weekly grid
  // (Matt's items are all build, so he correctly drops out of it).
  const weeklySections = readinessSections()
    .map((sec) => ({ ...sec, items: sec.items.filter((i) => i.cadence === "weekly") }))
    .filter((sec) => sec.items.length > 0);
  const setupSections = readinessSections()
    .map((sec) => ({ ...sec, items: sec.items.filter((i) => i.cadence !== "weekly") }))
    .filter((sec) => sec.items.length > 0);

  // One readiness row — note / input / check — shared by the This-Week and
  // Setup zones so the markup lives in exactly one place.
  const renderReadyItem = (item) => {
    const st = readiness[item.id] || {};
    if (item.type === "note") {
      return (
        <div key={item.id} className="flex items-start gap-2 py-1.5 text-sm" style={{ borderTop: `1px solid ${C.line}` }}>
          <span className="font-bold" style={{ color: C.green }}>✓</span>
          <div>
            <div>{item.label}</div>
            <div className="text-xs" style={{ color: C.sub }}>{item.detail}</div>
          </div>
        </div>
      );
    }
    if (item.type === "input") {
      return (
        <div key={item.id} className="py-1.5" style={{ borderTop: `1px solid ${C.line}` }}>
          <div className="text-sm font-medium">{item.label}</div>
          <div className="text-xs mb-1.5" style={{ color: C.sub }}>{item.detail}</div>
          <input
            value={st.value || ""}
            placeholder={item.placeholder || ""}
            onChange={(e) => onTypeReady(item.id, e.target.value)}
            onBlur={saveReady}
            className="w-full text-sm px-3 py-2 rounded-lg outline-none"
            style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper }}
          />
        </div>
      );
    }
    const done = isDone(item);
    const auto = item.id in AUTO_DONE;
    return (
      <label key={item.id} className="flex items-start gap-2 py-1.5 text-sm" style={{ borderTop: `1px solid ${C.line}`, cursor: auto ? "default" : "pointer" }}>
        <input type="checkbox" checked={done} disabled={auto} onChange={() => { if (!auto) toggleReady(item.id); }} className="mt-0.5" aria-label={item.label} />
        <div>
          <div style={{ textDecoration: done ? "line-through" : "none", color: done ? C.sub : C.ink }}>
            {item.label}
            {auto && (
              <span className="ml-2 text-xs font-semibold px-1.5 py-0.5 rounded-full align-middle" style={{ color: C.blue, backgroundColor: C.blueSoft }}>auto</span>
            )}
          </div>
          <div className="text-xs" style={{ color: C.sub }}>{item.detail}</div>
        </div>
      </label>
    );
  };

  // Meeting Mode controls
  const goToSegment = (i) => {
    const idx = Math.max(0, Math.min(agenda.length - 1, i));
    setSegIdx(idx);
    setSecondsLeft(agenda[idx].minutes * 60);
  };
  const startMeeting = () => {
    setSegIdx(0);
    setSecondsLeft(agenda[0].minutes * 60);
    setMeetingRunning(true);
    setMeetingStarted(true);
  };
  const endMeeting = () => {
    /* ⚠️ "Meeting logged" was a LIE until Jul 30. The header comment promised
       eos:meetinglog for weeks, but nothing ever wrote it — the rating and the
       wrap notes were dropped on the floor right here, then the toast said
       "logged". Persist the record FIRST, then clear the screen. The nightly
       l10-recap job (worker.js) reads this key to know a meeting actually
       happened today, so this write is also what triggers Nick's recap DM. */
    const t0 = new Date();
    const entry = {
      date: `${t0.getFullYear()}-${String(t0.getMonth() + 1).padStart(2, "0")}-${String(t0.getDate()).padStart(2, "0")}`,
      endedAt: t0.toISOString(),
      rating: rating || null,
      notes: wrapNotes.trim(),
      headlines: headlinesText.trim(),
      monthClose: isMonthClose,
      // Counts captured at the moment the room broke up — the recap job runs
      // hours later, when someone may have added or closed items since.
      issuesOpen: issues.length,
      todosOpen: todos.filter((x) => !x.done).length,
      todosDone: todos.filter((x) => x.done).length,
    };
    // ⚠️ kvGetResult: a FAILED read used to arrive as null and the write then
    // shrank the whole 60-meeting history to this one entry. If the log cannot
    // be read, this recap row is dropped instead — one missing row beats
    // losing the history — and the toast says so rather than claiming "logged".
    kvGetResult("eos:meetinglog")
      .then(async (r) => {
        if (!r.ok) { setToast("Meeting ended — the recap row could not be saved"); return; }
        const ok = await kvSet("eos:meetinglog", [...(Array.isArray(r.value) ? r.value : []), entry].slice(-60));
        setToast(ok
          ? (rating ? `Meeting logged — rated ${rating}/10` : "Meeting ended")
          : "Meeting ended — the recap row could not be saved");
      })
      .catch(() => {});
    setTimeout(() => setToast(""), 3500);
    setMeetingRunning(false);
    setMeetingStarted(false);
    /* Drop the saved session so next week never resumes into last week's
       leftovers. */
    try { localStorage.removeItem("gcfcr-eos-meeting-session-v1"); } catch {}
    goToSegment(0);
    setRating(null);
    setWrapNotes("");
    setHeadlinesText("");
  };
  const toggleMonthClose = (val) => {
    const a = val ? AGENDA_MONTHCLOSE : AGENDA_STANDARD;
    setIsMonthClose(val);
    setSegIdx(0);
    setSecondsLeft(a[0].minutes * 60);
    setMeetingRunning(false);
    setMeetingStarted(false);
  };
  /* ⚠️ OWNER WAS HARDCODED TO "You". Every to-do added in the meeting landed on
     Matt regardless of who agreed to it — which is how a shared list quietly
     becomes one person's. It is picked now, and an unowned to-do is the thing
     EOS exists to prevent. */
  const addTodoFromMeeting = () => {
    const t = newTodoText.trim();
    if (!t) return;
    setTodos((ts) => [...ts, {
      id: `t${Date.now()}`,
      text: t,
      owner: (newTodoOwner || "").trim() || "Matt",
      due: newTodoDue || null,
      done: false,
    }]);
    setNewTodoText("");
    setNewTodoDue("");
  };

  const addRock = () => {
    const t = (newRockTitle || "").trim();
    if (!t) return;
    setRocks((rs) => [...rs, {
      id: `r${Date.now()}`,
      title: t,
      owner: (newRockOwner || "").trim() || "Matt",
      status: "tbd",
      /* ⚠️ `updated` is required — the owner cards compute a stale badge from
         it, and a missing date renders "NaNd since update". */
      updated: todayLocal(),
    }]);
    setNewRockTitle("");
  };

  const totalMinutes = agenda.reduce((a, s) => a + s.minutes, 0);
  /* ⚠️ GUARDED AS WELL AS FIXED. The resume bug above is the reason this line
     ever saw an out-of-range index, and that is repaired — but this runs on
     every render with no gate above it, so ANY future path that leaves segIdx
     past the end of the agenda would take the entire tile down rather than show
     one wrong number. A stale clock is a nuisance; a dead L10 mid-meeting is
     not. Belt and braces on purpose. */
  const curSeg = agenda[segIdx] || agenda[agenda.length - 1] || { minutes: 0 };
  const elapsedTotal =
    agenda.slice(0, segIdx).reduce((a, s) => a + s.minutes, 0) * 60 +
    (curSeg.minutes * 60 - secondsLeft);

  const renderSegmentContent = (seg) => {
    switch (seg.kind) {
      case "checkin":
        return (
          <div className="text-sm leading-relaxed" style={{ color: C.sub }}>
            Go around the table — one personal win, one business win. Facilitator: <b style={{ color: C.ink }}>{facilitator}</b>.
          </div>
        );
      case "scorecard":
        return (
          <div className="space-y-1.5">
            {scorecard.map((row) => {
              const hasData = rowHasData(row);
              const hit = rowHit(row);
              return (
                <div key={row.id} className="flex items-center justify-between text-sm py-1" style={{ borderBottom: `1px solid ${C.line}` }}>
                  <span className="flex items-center"><LiveDot live={row._live} />{row.measure}{row.owner && <span style={{ color: C.sub }}>&nbsp;({row.owner})</span>}</span>
                  <span className="text-right">
                    <span className="eos-mono font-semibold" style={{ color: hasData ? (hit ? C.green : C.red) : C.sub }}>
                      {row.actual} · {hasData ? (hit ? "hit" : "miss") : "no data"}
                    </span>
                    {freshLabel(row) && (
                      <span className="block text-xs" style={{ color: row.held ? C.red : C.sub }}>
                        {freshLabel(row)}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
            <div className="flex items-center gap-3 text-xs pt-1" style={{ color: C.sub }}>
              <span className="flex items-center"><LiveDot live={true} />live</span>
              <span className="flex items-center"><LiveDot live={false} />seed (not publishing yet)</span>
            </div>
          </div>
        );
      case "rocks":
        return (
          <div className="space-y-2">
            {boardOwners(rocks).map((owner) => (
              <div key={owner} className="flex items-start gap-2 text-sm">
                <span className="font-semibold w-16 shrink-0" style={isSeated(owner) ? undefined : { color: C.red }}>{owner}</span>
                <div className="flex flex-wrap gap-1.5">
                  {rocks.filter((r) => r.owner === owner).map((r) => {
                    const s = STATUS[r.status] || STATUS.on; // census E3: legacy value must render, not crash
                    return (
                      <button
                        key={r.id}
                        onClick={() => cycleStatus(r.id)}
                        className="text-xs px-2 py-1 rounded-full"
                        style={{ color: s.fg, backgroundColor: s.bg }}
                        title={r.title}
                      >
                        {r.title.length > 30 ? r.title.slice(0, 30) + "…" : r.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {/* ⚠️ ROCKS HAD NO ADD PATH AT ALL — the board could only ever be
                edited in code, so a quarterly commitment agreed in the meeting
                had nowhere to go and became a to-do that rolls every week. */}
            <div className="flex gap-2 pt-2">
              <input
                value={newRockTitle}
                onChange={(e) => setNewRockTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addRock()}
                placeholder="New rock for this quarter"
                className="flex-1 text-sm px-3 py-2 rounded-lg outline-none"
                style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper }}
              />
              <input
                list="eos-owners"
                value={newRockOwner}
                onChange={(e) => setNewRockOwner(e.target.value)}
                placeholder="Owner"
                className="text-sm px-3 py-2 rounded-lg outline-none"
                style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper, width: 110 }}
              />
              <button onClick={addRock} className="text-sm font-semibold px-3 py-2 rounded-lg text-white" style={{ backgroundColor: C.ink }}>
                Add
              </button>
            </div>
            <datalist id="eos-owners">
              {ownerOptions().map((o) => <option key={o} value={o} />)}
            </datalist>
          </div>
        );
      case "headlines":
        return (
          <textarea
            value={headlinesText}
            onChange={(e) => setHeadlinesText(e.target.value)}
            placeholder="Jot headlines as they come up — customer wins, hires, resignations..."
            className="w-full text-sm px-3 py-2 rounded-lg outline-none"
            rows={4}
            style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper }}
          />
        );
      case "todos":
        return (
          <div>
            <ul className="space-y-2 mb-3">
              {todos.map((t) => (
                <li key={t.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={t.done} onChange={() => toggleTodo(t.id)} className="mt-0.5" aria-label={`Mark ${t.text} done`} />
                  <span className="flex-1" style={{ textDecoration: t.done ? "line-through" : "none", color: t.done ? C.sub : C.ink }}>
                    {t.text} <span style={{ color: C.sub }}>— {t.owner}</span>
                  </span>
                  {/* Bri: a way to clear a to-do once it is no longer worth
                      looking at. Undo lives under the list rather than behind a
                      confirm dialog — see removeTodo. */}
                  <button type="button" onClick={() => removeTodo(t.id)}
                    title="Remove from this list"
                    className="text-xs px-1.5 rounded"
                    style={{ border: "none", background: "none", color: C.sub, cursor: "pointer", lineHeight: 1.2 }}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            {undoTodo && (
              <div className="text-xs mb-2" style={{ color: C.sub }}>
                Removed “{undoTodo.item.text}”.{" "}
                <button type="button" onClick={putTodoBack}
                  style={{ border: "none", background: "none", padding: 0, color: C.blue || C.ink, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
                  Put it back
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={newTodoText}
                onChange={(e) => setNewTodoText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTodoFromMeeting()}
                placeholder="New to-do for next week"
                className="flex-1 text-sm px-3 py-2 rounded-lg outline-none"
                style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper }}
              />
              <input
                list="eos-owners"
                value={newTodoOwner}
                onChange={(e) => setNewTodoOwner(e.target.value)}
                placeholder="Owner"
                className="text-sm px-3 py-2 rounded-lg outline-none"
                style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper, width: 110 }}
              />
              <input
                type="date"
                value={newTodoDue}
                onChange={(e) => setNewTodoDue(e.target.value)}
                className="text-sm px-2 py-2 rounded-lg outline-none"
                style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper }}
              />
              <button onClick={addTodoFromMeeting} className="text-sm font-semibold px-3 py-2 rounded-lg text-white" style={{ backgroundColor: C.ink }}>
                Add
              </button>
            </div>
            {/* Free text with suggestions — the roster changes faster than a
                hardcoded list, and a name not on it must still be typeable. */}
            <datalist id="eos-owners">
              {ownerOptions().map((o) => <option key={o} value={o} />)}
            </datalist>
          </div>
        );
      case "ids":
        return (
          <div>
            <ol className="space-y-2 mb-3">
              {issues.map((issue, idx) => (
                <li key={issue.id} className="flex items-start gap-2 text-sm">
                  <span className="eos-mono font-semibold" style={{ color: C.red, minWidth: "1.25rem" }}>{idx + 1}</span>
                  <span className="flex-1 leading-snug">{issue.text} <span style={{ color: C.sub }}>— {issue.from}</span></span>
                  <button onClick={() => bumpIssue(idx)} className="text-xs px-1.5 py-0.5 rounded" style={{ color: C.sub, border: `1px solid ${C.line}` }} aria-label="Move up">↑</button>
                  <button onClick={() => solveIssue(issue.id)} className="text-xs px-1.5 py-0.5 rounded font-semibold" style={{ color: C.green, border: `1px solid ${C.green}` }}>Solved</button>
                </li>
              ))}
              {issues.length === 0 && <li className="text-sm" style={{ color: C.sub }}>Queue's clear.</li>}
            </ol>
            <div className="flex gap-2">
              <input
                value={newIssue}
                onChange={(e) => setNewIssue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addIssue()}
                placeholder="Add an issue"
                className="flex-1 text-sm px-3 py-2 rounded-lg outline-none"
                style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper }}
              />
              <button onClick={addIssue} className="text-sm font-semibold px-3 py-2 rounded-lg text-white" style={{ backgroundColor: C.ink }}>
                Add
              </button>
            </div>
          </div>
        );
      case "monthclose":
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
            {["FCR actuals vs projection", "Sales Allocation — full month", "Food/labor variance summary"].map((x) => (
              <div key={x} className="rounded-lg p-3 font-medium" style={{ backgroundColor: C.blueSoft, color: C.blue }}>
                {x}
              </div>
            ))}
            <div className="sm:col-span-3 text-xs" style={{ color: C.sub }}>
              Pulls from FinancialSuite / Sales Allocation once wired to KV — review together before Wrap.
            </div>
          </div>
        );
      case "wrap":
        return (
          <div>
            <textarea
              value={wrapNotes}
              onChange={(e) => setWrapNotes(e.target.value)}
              placeholder="Recap new to-dos and any messages to cascade..."
              className="w-full text-sm px-3 py-2 rounded-lg outline-none mb-3"
              rows={3}
              style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper }}
            />
            <div className="text-sm mb-1.5" style={{ color: C.sub }}>Rate this meeting</div>
            <div className="flex gap-1 flex-wrap">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  className="w-8 h-8 rounded-full text-xs font-semibold"
                  style={
                    rating === n
                      ? { backgroundColor: C.red, color: "#fff" }
                      : { backgroundColor: C.paper, color: C.sub, border: `1px solid ${C.line}` }
                  }
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const onCount = rocks.filter((r) => r.status === "on").length;

  if (!hasAccess(tier, user)) return <LockedScreen />;

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.paper, color: C.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .eos-display { font-family: 'Archivo', sans-serif; }
        .eos-body { font-family: 'Inter', sans-serif; }
        .eos-mono { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      <div className="max-w-5xl mx-auto px-4 py-6 eos-body">
        {/* ⚠️ WITHOUT THIS, A FAILED LOAD LOOKED LIKE A REAL BOARD. Everything
            below falls back to seed Rocks, Issues and To-Dos, so a dropped read
            rendered a plausible quarter that was not the team's. Saving is
            already blocked (hydrated stays false); this is what says so. */}
        {loadFailed && (
          <div
            role="alert"
            className="mb-4 rounded-xl px-4 py-3"
            style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#7F1D1D" }}
          >
            {/* ⚠️ THE WORDING CHANGED WITH THE SEEDS ON 12 Aug 2026 AND HAD TO.
                It used to say "what's on screen is the starting template", which
                was true while Rocks, Issues and To-Dos had hardcoded fallbacks.
                They are gone, so a failed read now shows EMPTY lists, and a
                banner still promising a template would send somebody looking for
                a board that is not there. */}
            <div className="font-semibold text-sm">Couldn't load EOS data</div>
            <div className="text-sm mt-1">
              The Hub couldn't reach the database, so the boards below are empty.
              That is not your quarter, and it is not an empty quarter either.
              Nothing will save until this loads. Check the connection and reopen
              the tile.
            </div>
          </div>
        )}
        {!loadFailed && saveWarn && (
          <div
            role="alert"
            className="mb-4 rounded-xl px-4 py-3"
            style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#7F1D1D" }}
          >
            <div className="font-semibold text-sm">Changes are not saving</div>
            <div className="text-sm mt-1">
              The last change did not reach the database. Everything typed is still on
              this screen — check the wifi and make the change again, or keep working
              and this clears on its own once a save lands.
            </div>
          </div>
        )}
        {/* ===== Header ===== */}
        <header className="mb-5" style={{ margin: "-1.5rem -1rem 1.25rem", background: "linear-gradient(120deg,#2A72C0 0%,#134479 55%)", color: "#fff", padding: "18px 16px 16px" }}>
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <div>
              <div className="text-xs font-semibold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.78)" }}>
                {STORE.appName}
              </div>
              <h1 className="eos-display text-2xl" style={{ fontWeight: 800, color: "#fff" }}>
                EOS — {(() => { const [y, q] = eosPeriod().split("-"); return `${q} ${y}`; })()}
              </h1>
            </div>
            <div className="eos-mono text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
              Week {CURRENT_WEEK} of {QUARTER_WEEKS} · {onCount}/{rocks.length} Rocks on track
            </div>
          </div>

          <div className="flex gap-1 mt-3" role="img" aria-label={`Quarter progress: week ${CURRENT_WEEK} of ${QUARTER_WEEKS}`}>
            {Array.from({ length: QUARTER_WEEKS }, (_, i) => (
              <div
                key={i}
                className="h-2 flex-1"
                style={{ borderRadius: segRadius(i, QUARTER_WEEKS), backgroundColor: i + 1 < CURRENT_WEEK ? "#fff" : i + 1 === CURRENT_WEEK ? "#FFC4CE" : "rgba(255,255,255,0.28)" }}
              />
            ))}
          </div>

          {/* The quarter-roll state is now handled by the RocksReviewPanel in
              the EOS tab below (shown when reviewNeeded), which replaces the old
              interim banner with the real Done / Re-commit / Drop review flow. */}

          {/* Tabs */}
          <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
            {[
              ["eos", "EOS"],
              ["chart", "Team"],
              ["meeting", "Meeting"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap"
                style={
                  tab === key
                    ? { backgroundColor: "#fff", color: C.ink }
                    : { backgroundColor: "rgba(255,255,255,0.16)", color: "#fff", border: "1px solid rgba(255,255,255,0.32)" }
                }
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {toast && (
          <div className="mb-3 text-sm font-semibold px-3 py-2 rounded-lg inline-block" style={{ backgroundColor: C.greenSoft, color: C.green }}>
            {toast}
          </div>
        )}

        {/* ================= EOS TAB ================= */}
        {tab === "eos" && (
          <>
            {/* ===== Meeting Readiness (prep tracker → Monday touch-in) ===== */}
            <section className="mb-6">
              <Card>
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => setReadyOpen((o) => !o)}>
                  <span className="eos-mono text-sm" style={{ color: C.sub }}>{readyOpen ? "▾" : "▸"}</span>
                  <h2 className="eos-display text-sm font-bold uppercase tracking-wider" style={{ color: C.sub }}>
                    Meeting Readiness
                  </h2>
                  <span className="ml-auto text-xs font-semibold eos-mono" style={{ color: weekAll ? C.green : C.sub }}>
                    {weekDone}/{weekTotal} ready this week
                  </span>
                </div>

                {/* ⚠️ FULLY ROUNDED, NOT `rounded-sm` (Matt, Aug 5 2026: "the
                    scorecard progress bar isnt rounded at the end"). rounded-sm
                    is a 2px radius, and on a bar 8px tall that reads as a square
                    end rather than a soft one. `rounded-full` makes the radius
                    half the height, which is the only value that looks
                    deliberate whatever the bar height becomes later.
                    BOTH need it. The track rounds the left end, the fill rounds
                    its own right end, and rounding only one is what makes a bar
                    look chopped at exactly the place a reader looks: the end. */}
                <div className="h-2 rounded-full mt-3 overflow-hidden" style={{ backgroundColor: C.line }}>
                  <div className="h-full rounded-full" style={{ width: weekPct + "%", backgroundColor: weekAll ? C.green : C.red, transition: "width .2s" }} />
                </div>

                {readyOpen && (
                  <div className="mt-4">
                    <p className="text-xs mb-4 leading-relaxed" style={{ color: C.sub }}>
                      Everything green by Tuesday AM → the bot posts the touch-in → we walk in ready Wednesday.
                    </p>

                    {/* ---- THIS WEEK: the recurring per-owner ritual ---- */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {weeklySections.map((sec) => (
                        <div key={sec.who}>
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="eos-display font-bold text-sm">{sec.who}</span>
                            <span className="text-xs" style={{ color: C.sub }}>{sec.role}</span>
                          </div>
                          {sec.items.map((item) => renderReadyItem(item))}
                        </div>
                      ))}
                    </div>

                    {weekAll && (
                      <div className="mt-4 rounded-lg p-3 text-sm font-semibold text-center" style={{ backgroundColor: C.greenSoft, color: C.green }}>
                        Everyone's Rock &amp; issues are in — ready for Wednesday.
                      </div>
                    )}

                    {/* ---- SETUP: one-time build, collapses when done ---- */}
                    <div className="mt-5 rounded-xl" style={{ border: `1px solid ${C.line}` }}>
                      <div
                        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
                        onClick={() => setSetupOpen(setupExpanded ? false : true)}
                      >
                        <span className="eos-mono text-sm" style={{ color: C.sub }}>{setupExpanded ? "▾" : "▸"}</span>
                        <span className="eos-display text-xs font-bold uppercase tracking-wider" style={{ color: C.sub }}>
                          One-time setup
                        </span>
                        {setupAll ? (
                          <span className="ml-auto text-xs font-semibold eos-mono" style={{ color: C.green }}>✓ complete</span>
                        ) : (
                          <span
                            className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full eos-mono"
                            style={{ color: C.amber, backgroundColor: C.amberSoft }}
                          >
                            {setupPending} to finish
                          </span>
                        )}
                      </div>

                      {setupExpanded && (
                        <div className="px-3 pb-3 pt-1">
                          <p className="text-xs mb-3 leading-relaxed" style={{ color: C.sub }}>
                            Built once, then it stays out of the weekly view. If one of these breaks later, the badge above turns amber.
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {setupSections.map((sec) => (
                              <div key={sec.who}>
                                <div className="flex items-baseline gap-2 mb-1">
                                  <span className="eos-display font-bold text-sm">{sec.who}</span>
                                  <span className="text-xs" style={{ color: C.sub }}>{sec.role}</span>
                                </div>
                                {sec.items.map((item) => renderReadyItem(item))}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            </section>

            {/* Rocks board — or, at a quarter roll, the review panel in its place. */}
            {reviewNeeded ? (
              <RocksReviewPanel
                fromQuarter={rocksQuarter}
                toQuarter={eosPeriod()}
                rocks={rocks}
                companyRocks={companyRocks}
                decisions={reviewDecisions}
                setDecisions={setReviewDecisions}
                newPersonal={newPersonalRocks}
                setNewPersonal={setNewPersonalRocks}
                newCompany={newCompanyRocks}
                setNewCompany={setNewCompanyRocks}
                onFinish={finishReview}
              />
            ) : (
              <>
            {/* ===== Company Rocks (shared quarterly priorities) ===== */}
            <section className="mb-6">
              <SectionTitle>Company Rocks — {rocksQuarter.split("-")[1]} · one champion each</SectionTitle>
              <div className="grid grid-cols-1 gap-2">
                {companyRocks.map((r) => {
                  const s = STATUS[r.status] || STATUS.on; // census E3: legacy value must render, not crash
                  return (
                    <Card key={r.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="text-sm leading-snug">{r.title}</div>
                          <div className="text-xs eos-mono mt-0.5" style={{ color: C.sub }}>Champion: {r.champion}</div>
                        </div>
                        <button
                          onClick={() => cycleCompanyStatus(r.id)}
                          className="px-2.5 py-1 rounded-full text-xs font-semibold shrink-0"
                          style={{ color: s.fg, backgroundColor: s.bg }}
                        >
                          {s.label}
                        </button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>

            <section className="mb-6">
              <SectionTitle>Individual Rocks — by owner</SectionTitle>
              {/* ⚠️ Rocks had no add path anywhere in the app — the board could
                  only be changed in code, so a quarterly commitment agreed in
                  the meeting became a to-do that rolls every week instead. */}
              <div className="flex flex-wrap gap-2 mb-3">
                <input
                  value={newRockTitle}
                  onChange={(e) => setNewRockTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addRock()}
                  placeholder="New rock for this quarter"
                  className="flex-1 min-w-0 text-sm px-3 py-2 rounded-lg outline-none"
                  style={{ minWidth: 160, border: `1px solid ${C.line}`, backgroundColor: C.paper }}
                />
                <input
                  list="eos-owners"
                  value={newRockOwner}
                  onChange={(e) => setNewRockOwner(e.target.value)}
                  placeholder="Owner"
                  className="text-sm px-3 py-2 rounded-lg outline-none"
                  style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper, width: 104 }}
                />
                <button onClick={addRock} className="text-sm font-semibold px-3 py-2 rounded-lg text-white" style={{ backgroundColor: C.ink }}>
                  Add
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {boardOwners(rocks).map((owner) => (
                  <Card key={owner}>
                    <div className="eos-display font-bold mb-2">
                      {owner}
                      {!isSeated(owner) && (
                        <span className="eos-mono text-xs font-normal ml-2" style={{ color: C.red }}>
                          not on the board — move these
                        </span>
                      )}
                    </div>
                    <ul className="space-y-2.5">
                      {rocks.filter((r) => r.owner === owner).map((r) => {
                        const age = daysAgo(r.updated);
                        const stale = age >= 14;
                        const s = STATUS[r.status] || STATUS.on; // census E3: legacy value must render, not crash
                        return (
                          <li key={r.id} className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="text-sm leading-snug">{r.title}</div>
                              {/* LIVE evidence under the Rock it measures. The
                                  Shift Leader Scorecard already publishes
                                  independentCount (leaders at composite ≥ 4.0)
                                  to gcfcr-sl-eos-rollup-v1, and this tile was
                                  already FETCHING it into slRollup — and then
                                  never rendering it. A status pill is a claim
                                  someone taps; this is the measurement. Only r8
                                  has a feed, so only r8 shows one. */}
                              {r.id === "r8" && slRollup && typeof slRollup.independentCount === "number" && (
                                <div className="text-xs eos-mono" style={{ color: slRollup.independentCount >= (slRollup.goal ?? 3) ? C.green : C.sub }}>
                                  {slRollup.independentCount}/{slRollup.goal ?? 3} coaching independently
                                  {typeof slRollup.scored === "number" ? ` · ${slRollup.scored} leaders scored` : ""}
                                </div>
                              )}
                              <div className="text-xs eos-mono" style={{ color: stale ? C.red : C.sub }}>
                                {stale ? `⚠ stale — ${age}d since update` : `updated ${age === 0 ? "today" : `${age}d ago`}`}
                              </div>
                              {/* ★ WHOSE ROCK IS THIS. There was no way to change an
                                  owner once a Rock existed, which is why four of them
                                  sat under a name that had come off the board with
                                  nobody able to do a thing about it.
                                  ⚠️ `updated` IS DELIBERATELY NOT BUMPED. Moving a
                                  Rock to its right owner is not progress on it, and
                                  resetting the stale badge here would hide that one
                                  of these has not been touched since July. */}
                              <select
                                value={r.owner}
                                onChange={(e) => setRockOwner(r.id, e.target.value)}
                                className="text-xs eos-mono mt-1 px-1.5 py-0.5 rounded"
                                style={{ border: `1px solid ${C.line}`, color: C.sub, background: "transparent" }}
                                aria-label={`Owner of ${r.title}`}
                              >
                                {/* The current owner is listed even when they are off
                                    the board, or the select would show somebody else's
                                    name over an unmoved Rock. */}
                                {(ownerOptions().includes(r.owner) ? ownerOptions() : [r.owner, ...ownerOptions()])
                                  .map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </div>
                            <button
                              onClick={() => cycleStatus(r.id)}
                              className="px-2.5 py-1 rounded-full text-xs font-semibold shrink-0"
                              style={{ color: s.fg, backgroundColor: s.bg }}
                            >
                              {s.label}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                ))}
              </div>
            </section>
              </>
            )}

            <section className="mb-6">
              <SectionTitle>Scorecard — tap a red cell to send it to Issues</SectionTitle>

              {/* ⚠️ OWNER ONLY. The measure names are the producer contract and
                  the goals and actuals arrive from the feed, so this edits the
                  one field that is this store's to decide. Tier 3, matching the
                  store-settings write; everyone who can open EOS still reads it. */}
              {(tier ?? 0) >= 3 && (
                <div className="mb-3">
                  {ownerMsg && (
                    <div className="rounded-lg p-2 mb-2 text-xs font-semibold" style={{ color: C.red, background: "#FDECEF", border: `1px solid ${C.red}` }}>
                      {ownerMsg}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {scorecard.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setOwnerEdit(
                          ownerEdit && ownerEdit.id === row.id ? null : { id: row.id, name: row.owner || "" }
                        )}
                        className="text-xs rounded-lg px-2 py-1"
                        style={ownerEdit && ownerEdit.id === row.id
                          ? { background: C.blue, color: "#FFFFFF" }
                          : { background: cardSurface(), color: C.sub, border: `1px solid ${C.line}` }}
                      >
                        {row.measure}: <b>{row.owner || "nobody"}</b>
                      </button>
                    ))}
                  </div>
                  {ownerEdit && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={ownerEdit.name}
                        placeholder="Who owns this measure"
                        onChange={(e) => { const v = e.target.value; setOwnerEdit((d) => ({ ...d, name: v })); }}
                        className="rounded-lg px-2 py-1.5"
                        style={{ border: `1px solid ${C.line}`, color: C.ink, fontSize: 16, minWidth: 200 }}
                      />
                      <button
                        type="button"
                        disabled={ownerSaving}
                        onClick={() => saveOwner(ownerEdit.id, ownerEdit.name)}
                        className="text-xs font-semibold rounded-lg px-3 py-1.5"
                        style={{ background: C.blue, color: "#FFFFFF", opacity: ownerSaving ? 0.6 : 1 }}
                      >
                        {ownerSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOwnerEdit(null)}
                        className="text-xs font-semibold rounded-lg px-3 py-1.5"
                        style={{ background: cardSurface(), color: C.sub, border: `1px solid ${C.line}` }}
                      >
                        Cancel
                      </button>
                      <span className="text-xs" style={{ color: C.sub }}>Clear the box to remove the owner.</span>
                    </div>
                  )}
                </div>
              )}
              <div className="rounded-xl overflow-x-auto" style={{ background: cardSurface(), border: `1px solid ${C.line}`, ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D_SOFT }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left" style={{ color: C.sub }}>
                      <th className="px-4 py-2 font-semibold">Measure</th>
                      <th className="px-2 py-2 font-semibold">Owner</th>
                      <th className="px-2 py-2 font-semibold">Goal</th>
                      <th className="px-2 py-2 font-semibold">This wk</th>
                      <th className="px-4 py-2 font-semibold">Last 5</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scorecard.map((row) => {
                      const cells = weeksOf(row);
                      const hasData = rowHasData(row);
                      const hit = rowHit(row);
                      return (
                        <tr key={row.id} style={{ borderTop: `1px solid ${C.line}` }}>
                          <td className="px-4 py-2.5 font-medium"><span className="flex items-center"><LiveDot live={row._live} />{row.measure}</span></td>
                          <td className="px-2 py-2.5" style={{ color: C.sub }}>{row.owner}</td>
                          <td className="px-2 py-2.5 eos-mono">{row.goal}</td>
                          <td className="px-2 py-2.5 eos-mono font-semibold" style={{ color: hasData ? (hit ? C.green : C.red) : C.sub }}>
                            {row.actual}
                            {freshLabel(row) && (
                              <span className="block text-xs font-normal" style={{ color: row.held ? C.red : C.sub }}>
                                {freshLabel(row)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex gap-1">
                              {cells.map((w, i) => {
                                const st = cellState(w);
                                const wk = (row.weekLabels || [])[i];
                                const when = wk ? ` — wk of ${wk}` : "";
                                const label =
                                  st === "hit"
                                    ? `Hit${when}`
                                    : st === "miss"
                                    ? `Miss${when} — tap to add to Issues`
                                    : "No reading recorded for this week";
                                return (
                                  <button
                                    key={i}
                                    onClick={() => missToIssue(row, i)}
                                    disabled={st !== "miss"}
                                    className="w-4 h-4 rounded-sm"
                                    style={{
                                      backgroundColor: st === "hit" ? C.green : st === "miss" ? C.redSoft : "transparent",
                                      border: st === "hit" ? "none" : st === "miss" ? `1px solid ${C.red}` : `1px dashed ${C.line}`,
                                      cursor: st === "miss" ? "pointer" : "default",
                                    }}
                                    title={label}
                                    aria-label={label}
                                  />
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="flex items-center gap-4 text-xs px-4 py-2 flex-wrap" style={{ color: C.sub }}>
                  <span className="flex items-center"><LiveDot live={true} />live from feed</span>
                  <span className="flex items-center"><LiveDot live={false} />seed — not publishing yet</span>
                  <span className="flex items-center"><WeekSwatch state="none" />no data yet</span>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              <Card>
                <SectionTitle>Issues — worked top down (IDS)</SectionTitle>
                <ol className="space-y-2 mb-3">
                  {issues.map((issue, idx) => (
                    <li key={issue.id} className="flex items-start gap-2 text-sm">
                      <span className="eos-mono font-semibold" style={{ color: C.red, minWidth: "1.25rem" }}>{idx + 1}</span>
                      <span className="flex-1 leading-snug">
                        {issue.text}
                        <span style={{ color: C.sub }}> — {issue.from}</span>
                      </span>
                      <button onClick={() => bumpIssue(idx)} className="text-xs px-1.5 py-0.5 rounded" style={{ color: C.sub, border: `1px solid ${C.line}` }} aria-label="Move up">↑</button>
                      <button onClick={() => solveIssue(issue.id)} className="text-xs px-1.5 py-0.5 rounded font-semibold" style={{ color: C.green, border: `1px solid ${C.green}` }}>Solved</button>
                    </li>
                  ))}
                </ol>
                <div className="flex gap-2">
                  <input
                    value={newIssue}
                    onChange={(e) => setNewIssue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addIssue()}
                    placeholder="Add an issue"
                    className="flex-1 text-sm px-3 py-2 rounded-lg outline-none"
                    style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper }}
                  />
                  <button onClick={addIssue} className="text-sm font-semibold px-3 py-2 rounded-lg text-white" style={{ backgroundColor: C.ink }}>Add</button>
                </div>
              </Card>

              <Card>
                <SectionTitle>To-dos — due by next L10</SectionTitle>
                <ul className="space-y-2 mb-4">
                  {todos.filter((t) => (t.area || "eos") !== "hub").map((t) => (
                    <li key={t.id} className="flex items-start gap-2 text-sm">
                      <input type="checkbox" checked={t.done} onChange={() => toggleTodo(t.id)} className="mt-0.5" aria-label={`Mark ${t.text} done`} />
                      <span className="flex-1 leading-snug" style={{ textDecoration: t.done ? "line-through" : "none", color: t.done ? C.sub : C.ink }}>
                        {t.text} <span style={{ color: C.sub }}>— {t.owner}</span>
                        {/* ⚠️ The date field was stored and never displayed, so
                            setting a due date did nothing anyone could see. */}
                        {t.due && !t.done && (
                          <span className="eos-mono" style={{ color: C.sub, fontSize: 12 }}>
                            {" · due "}{new Date(t.due + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* ⚠️ THE ADD CONTROLS WERE ONLY IN THE L10 MEETING FLOW, which
                    is the screen nobody opens between Wednesdays. The overview is
                    where the list actually gets used. */}
                {/* ⚠️ WAS A FIXED 4-UP ROW AND THE ADD BUTTON RAN OFF THE
                    SCREEN on iPad. `flex-wrap` plus `min-w-0` on the text field
                    lets it fall to a second line instead of overflowing — a
                    button you cannot reach is the same as no button. */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <input
                    value={newTodoText}
                    onChange={(e) => setNewTodoText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTodoFromMeeting()}
                    placeholder="New to-do"
                    className="flex-1 min-w-0 text-sm px-3 py-2 rounded-lg outline-none"
                    style={{ minWidth: 160, border: `1px solid ${C.line}`, backgroundColor: C.paper }}
                  />
                  <input
                    list="eos-owners"
                    value={newTodoOwner}
                    onChange={(e) => setNewTodoOwner(e.target.value)}
                    placeholder="Owner"
                    className="text-sm px-3 py-2 rounded-lg outline-none"
                    style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper, width: 104 }}
                  />
                  <input
                    type="date"
                    value={newTodoDue}
                    onChange={(e) => setNewTodoDue(e.target.value)}
                    className="text-sm px-2 py-2 rounded-lg outline-none"
                    style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper }}
                  />
                  <button onClick={addTodoFromMeeting} className="text-sm font-semibold px-3 py-2 rounded-lg text-white" style={{ backgroundColor: C.ink }}>
                    Add
                  </button>
                </div>
                <datalist id="eos-owners">
                  {ownerOptions().map((o) => <option key={o} value={o} />)}
                </datalist>

                {/* Hub dev backlog — real work, but NOT L10 prep. Collapsed and
                    out of the "due by next L10" count. A task graduates into the
                    L10 by being raised as an Issue first. */}
                {todos.some((t) => t.area === "hub") && (
                  <div className="mb-4 rounded-xl" style={{ border: `1px solid ${C.line}` }}>
                    <div
                      className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
                      onClick={() => setHubOpen((o) => !o)}
                    >
                      <span className="eos-mono text-sm" style={{ color: C.sub }}>{hubOpen ? "▾" : "▸"}</span>
                      <span className="eos-display text-xs font-bold uppercase tracking-wider" style={{ color: C.sub }}>
                        Hub backlog
                      </span>
                      <span className="ml-auto text-xs font-semibold eos-mono" style={{ color: C.sub }}>
                        {todos.filter((t) => t.area === "hub" && !t.done).length} open · not L10
                      </span>
                    </div>
                    {hubOpen && (
                      <ul className="space-y-2 px-3 pb-3 pt-1">
                        {todos.filter((t) => t.area === "hub").map((t) => (
                          <li key={t.id} className="flex items-start gap-2 text-sm">
                            <input type="checkbox" checked={t.done} onChange={() => toggleTodo(t.id)} className="mt-0.5" aria-label={`Mark ${t.text} done`} />
                            <span className="flex-1 leading-snug" style={{ textDecoration: t.done ? "line-through" : "none", color: t.done ? C.sub : C.ink }}>
                              {t.text} <span style={{ color: C.sub }}>— {t.owner}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <div className="pt-3 text-sm" style={{ borderTop: `1px solid ${C.line}` }}>
                  <div className="eos-display font-bold">
                    Next L10: {NEXT_L10.label}
                    {NEXT_L10.isFirst && (
                      <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: C.amber, backgroundColor: C.amberSoft }}>First L10</span>
                    )}
                  </div>
                  <div className="text-xs mt-1 mb-2 leading-relaxed" style={{ color: C.sub }}>
                    {NEXT_L10.note}
                  </div>
                  <button
                    onClick={() => setTab("meeting")}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
                    style={{ backgroundColor: C.red }}
                  >
                    Run this meeting →
                  </button>
                </div>
              </Card>
            </section>
          </>
        )}

        {/* ===== Delegated tabs — separate files, keeps this one under the paste limit ===== */}
        {/* ⚠️ `tier` AND `user` ARE PASSED FOR THE SEAT EDITOR, and without them
            it defaults closed rather than open. The chart reads them only to
            decide whether the Edit seats button renders; viewing is already
            gated by this tile's own hasAccess above. */}
        {tab === "chart" && (AccountabilityChart ? <AccountabilityChart embedded liveRocks={companyRocks} quarterLabel={`${rocksQuarter.split("-")[1]} ${rocksQuarter.split("-")[0]}`} tier={tier} user={user} /> : <TabMissing name="Team / Accountability Chart" file="AccountabilityChart.jsx" />)}

        {/* ================= RUN MEETING TAB ================= */}
        {tab === "meeting" && (
          <>
            <section className="mb-4">
              <Card>
                <div className="flex flex-wrap items-center gap-3 justify-between">
                  <div className="flex items-center gap-4 flex-wrap">
                    <label className="text-sm flex items-center gap-2">
                      <span style={{ color: C.sub }}>Facilitator</span>
                      <select
                        value={facilitator}
                        onChange={(e) => setFacilitator(e.target.value)}
                        className="text-sm px-2 py-1 rounded-lg"
                        style={{ border: `1px solid ${C.line}` }}
                      >
                        {seatOrder().map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm flex items-center gap-2">
                      <input type="checkbox" checked={isMonthClose} onChange={(e) => toggleMonthClose(e.target.checked)} />
                      <span>Month-close (+30 min)</span>
                    </label>
                  </div>
                  {!meetingStarted ? (
                    <button onClick={startMeeting} className="text-sm font-semibold px-4 py-2 rounded-lg text-white" style={{ backgroundColor: C.red }}>
                      Start Meeting
                    </button>
                  ) : (
                    <button onClick={endMeeting} className="text-sm font-semibold px-4 py-2 rounded-lg" style={{ color: C.red, border: `1px solid ${C.red}` }}>
                      End Meeting
                    </button>
                  )}
                </div>
              </Card>
            </section>

            <section className="mb-4">
              <div className="flex gap-1" role="img" aria-label={`Meeting progress: segment ${segIdx + 1} of ${agenda.length}`}>
                {agenda.map((seg, i) => (
                  <div
                    key={seg.id}
                    className="h-2"
                    style={{
                      borderRadius: segRadius(i, agenda.length),
                      flexGrow: seg.minutes,
                      backgroundColor: i < segIdx ? C.ink : i === segIdx ? C.red : C.line,
                    }}
                    title={`${seg.label} — ${seg.minutes} min`}
                  />
                ))}
              </div>
              <div className="flex justify-between text-xs mt-1 eos-mono" style={{ color: C.sub }}>
                <span>{formatClock(elapsedTotal)} elapsed</span>
                <span>{totalMinutes} min total</span>
              </div>
            </section>

            <section className="mb-4">
              <Card>
                <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                  <div>
                    <div className="text-xs eos-mono" style={{ color: C.sub }}>
                      Segment {segIdx + 1} of {agenda.length}
                    </div>
                    <div className="eos-display font-bold text-xl">{agenda[segIdx].label}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="eos-mono text-3xl font-bold" style={{ color: secondsLeft === 0 ? C.red : C.ink }}>
                      {formatClock(secondsLeft)}
                    </div>
                    <button
                      onClick={() => setMeetingRunning((r) => !r)}
                      className="text-sm font-semibold px-3 py-2 rounded-lg"
                      style={{ backgroundColor: meetingRunning ? C.amberSoft : C.greenSoft, color: meetingRunning ? C.amber : C.green }}
                    >
                      {meetingRunning ? "Pause" : "Start"}
                    </button>
                  </div>
                </div>

                <div className="mb-3">{renderSegmentContent(agenda[segIdx])}</div>
                {/* Bri, Jul 29: capture it where you thought of it. To-dos get
                    the IDS button only — an item raised during To-do review that
                    belongs on the To-do list is just a to-do, and offering the
                    button you are already standing in is noise. IDS and Wrap get
                    nothing: you are already there. */}
                {["checkin", "scorecard", "rocks", "headlines", "todos"].includes(agenda[segIdx].kind) && (
                  <QuickCapture
                    segLabel={agenda[segIdx].kind === "ids" ? "" : agenda[segIdx].label}
                    allowTodo={agenda[segIdx].kind !== "todos"}
                    onCapture={quickCapture}
                    C={C} />
                )}

                <div className="flex justify-between pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
                  <button
                    onClick={() => goToSegment(segIdx - 1)}
                    disabled={segIdx === 0}
                    className="text-sm font-semibold px-3 py-1.5 rounded-lg"
                    style={{ color: segIdx === 0 ? C.line : C.sub, border: `1px solid ${C.line}` }}
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => goToSegment(segIdx + 1)}
                    disabled={segIdx === agenda.length - 1}
                    className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white"
                    style={{ backgroundColor: segIdx === agenda.length - 1 ? C.line : C.ink }}
                  >
                    Next →
                  </button>
                </div>
              </Card>
            </section>

            <section>
              <div className="flex flex-wrap gap-2">
                {agenda.map((seg, i) => (
                  <button
                    key={seg.id}
                    onClick={() => goToSegment(i)}
                    className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={
                      i === segIdx
                        ? { backgroundColor: C.ink, color: "#fff" }
                        : { backgroundColor: C.card, color: C.sub, border: `1px solid ${C.line}` }
                    }
                  >
                    {seg.label}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
