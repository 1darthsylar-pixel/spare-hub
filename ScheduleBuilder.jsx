/* ══════════════════════════════════════════════════════════════════════════
   ScheduleBuilder.jsx — Gate City Hub · "Schedule"

   STEP 2 OF THE SCHEDULING PLATFORM. Builds a week from the inputs the
   Availability & Skills tile holds, against the Labor Planner's projection.

   ⚠️ THE MATHS IS IN scheduleEngine.js AND NOTHING HERE MAY REPEAT IT. That
   file is a leaf so the same week can be built from the Worker later without
   React. This screen loads, calls, shows and saves.

   ⚠️ IT STILL WRITES NO BOARD KEY, BUT THE BOARD NOW READS THIS ONE.
   (This block said "Daily Setup does not read the schedule key" until the
   publish step landed. Kept and corrected rather than deleted: a stale warning
   is worse than no warning, because the next reader trusts it.)
   Daily Setup's Import tab has a "Use the Hub schedule" button that reads the
   saved week and turns it into ordinary import rows. Saving here therefore
   makes a week AVAILABLE to the board; it does not put it ON the board. A
   leader still presses Preview and Rebuild, and can still Check for changes
   first. Nothing published here reaches a live shift on its own.

   ⚠️ THE LABOR NUMBERS COME FROM laborEngine, NOT FROM A COPY. `loadMonthBasis`
   → `forecastFor` → `targetFor` → `dayBudget` is the same chain the Labor
   Planner and the daypart DMs already run, so the budget shown here is the
   budget shown there. A second implementation would drift and only one of the
   two screens would be right.

   ⚠️ OVER BUDGET IS SHOWN, NEVER SILENTLY TRIMMED. See the long note at the
   top of scheduleEngine.js. Cutting hours to hit a number would produce a
   schedule that looks finished and leaves the close uncovered.

   ⚠️ APPROVED TIME OFF IS APPLIED WHILE THE WEEK IS DECIDED, not filtered out
   afterwards — a person removed after the fact leaves the shift they would have
   taken uncovered and unmentioned. A PENDING request changes nothing, so this
   screen names them above the Build button instead. Waiting is not off.

   ACCESS, and it is THREE different questions, which is why there are three
   lists. (This block has said "tier 3" and then "tier 3 plus the alpha gate";
   both were out of date within the hour, so it now names all three.)
       owners.tileAllow.schedule     who SEES this tile at all (alpha gate)
       owners.tileAllow.scheduleEdit who may Build, drag a shift or save
       owners.payAccess              who sees DOLLARS rather than only hours
   Nick is on the first and third and not the second: he opens the week, reads
   the money, and cannot change a shift. That is a real state and the screen
   renders fully for it rather than refusing him.
   ══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, CalendarRange, ChevronLeft, ChevronRight, Loader2, Pencil,
  HelpCircle, Plane, Plus, Save, Send, Trash2, Wand2,
} from "lucide-react";
import { kvGet, kvGetResult, kvSet, hubToken } from "./store.js";
import { loadHRTeam } from "./hrTeam.js";
import { isTerminatedId } from "./hrRoster.js";
import { CARD_3D, CARD_3D_SOFT, cardSurface, toolCard, toolRow, accentEdge, ACCENT_NEUTRAL, sectionTint, shade } from "./cardStyle.js";
import { storeCfg, tileAllowsId, sectionsOf } from "./storeConfig.js";
import {
  readStore, AVAIL_KEY, SKILLS_KEY, SCHOOL_KEY, fmtMin, minToInput, inputToMin,
  dayState, windowsFor,
} from "./availability.js";
import { TIMEOFF_KEY, readTimeOff, pendingInDates, fmtRange, offIdsByDate } from "./timeOff.js";
import { PAY_KEY, PAY_DEFAULT_KEY, readPay, costOf } from "./payRates.js";
import { JOBCODES_KEY, readJobCodes } from "./jobCodes.js";
import { readSchool } from "./schoolCalendar.js";
import { MINOR_RULES_KEY, MINORS_KEY, readMinorRules, minorIdsFrom } from "./minorRules.js";
import { DAYPARTS, daypartColor } from "./dayparts.js";
import { stationLoad, placementMemory } from "./boardHistory.js";
import { STORE_HOURS_KEY, readStoreHours, stationsForDate } from "./storeHours.js";
import { buildWeek, assignPositions, boardDay, trainingPlan, curveHours, SIDE_ORDER, scheduleKey, mondayOf, daypartHours, personHours, DEFAULT_RULES } from "./scheduleEngine.js";
import { TRAINING_KEY, readTraining } from "./trainingPriorities.js";
import { warningsForWeek, forCell, worstLevel, LEVEL } from "./scheduleWarnings.js";
/* ★ WHO TURNED UP. Leaf, imports nothing. ⚠️ NOT A TIME CLOCK and not a
   discipline system — see its header for the line it must not cross. */
import {
  attendanceKey, STATUSES, STATUS_LABEL, readAttendance, markShift, statusOf,
  keyOfShift, coverage as attCoverage,
} from "./attendance.js";
import {
  loadMonthBasis, activeTier, forecastFor, targetFor, dayBudget, isoOf, ymOf,
  pushScheduledHours, DP_KEY,
} from "./laborEngine.js";
/* ⚠️ `DP_KEY` IS IMPORTED, NEVER RETYPED. It is the key the daypart console
   already writes, and a second spelling of that string is a panel reading a
   record nothing writes. Rule 8. */
import {
  latestMonth, goalsFromHistory, plannedByPart, adviceForDay, adviceLine, ADVICE_DAYS,
} from "./laborAdvice.js";
/* ★ Near-leaf, imports only shiftHours. What this store really staffs, learned
   from its own saved boards every time they are read. */
import { learnFrom } from "./rosterLearning.js";

const INK = "#13293F", GREEN = "#1F6F4A", GRAY = "#6B7480", RED = "#B91C1C", AMBER = "#B45309";
/* ⚠️ `MINORS_KEY` NOW COMES FROM minorRules.js, not from a fourth copy of the
   string. Daily Setup owns and writes that list; everything in the scheduling
   platform reads it through one import. */
const HR_STATUS_KEY = "gcfcr-hr-status";

/* ══════════════════════════════════════════════════════════════════════════
   ★★ THE MARKS THE BOARD DRAWS — one definition, because the KEY draws them
   too. Matt, Aug 14 2026: "for the scheduler we also need a key o instructions
   guide".

   ⚠️⚠️ A LEGEND IS A SECOND COPY OF THE THING IT EXPLAINS, and that is the
   whole hazard in building one. A key that says the training badge is purple,
   written beside a board that draws it in some other purple, is worse than no
   key: it is a confident wrong answer about the screen it sits on, and nothing
   fails when they drift. So neither the board nor the key holds a literal —
   both read these. Design rule 8, applied to pixels. */
const MARK = Object.freeze({
  /* Learning this station. */
  training: "#7E22CE",
  /* Open, and nobody is on it. */
  gap: "#B91C1C",
  gapBg: "#FEF2F2",
  /* Shut at that hour. Not a problem, and drawn so it cannot be mistaken for
     one — see the note at BoardCell. */
  closed: "repeating-linear-gradient(45deg,#F8FAFC,#F8FAFC 5px,#EEF2F6 5px,#EEF2F6 10px)",
});
/* The id → title map HR Console writes when somebody's title changes. The
   roster row itself is not edited, so this is the only place a current title
   lives for anybody who has ever been promoted. */
const HR_ROLES_KEY = "gcfcr-hr-roles";

/* ── module-level pure helpers (rule 7) ────────────────────────────────── */

const addDays = (d, n) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
};
const prettyDay = (d) => d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });

/* The days this store's board runs, from its own station config (rule 18). */
function boardDays() {
  const foh = storeCfg("stations.FOH");
  const keys = foh && typeof foh === "object" ? Object.keys(foh) : [];
  return keys.length ? keys : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
}

const hrs = (n) => `${(Number(n) || 0).toFixed(1)}h`;

/* Every shift a human touched, keyed { day: { side: [shift] } }, ready to hand
   back to buildWeek as `keep`.
   ⚠️⚠️ THIS IS WHAT MAKES "Build it again" SAFE TO PRESS. Without it, a rebuild
   would throw away every decision a leader made — the exact scar the board
   carries, where an import "rebuilds the day and wipes leaders' manual edits". */
function keepFromWeek(wk) {
  const out = {};
  const days = (wk && wk.days) || {};
  Object.keys(days).forEach((day) => {
    const sides = (days[day] || {}).sides || {};
    Object.keys(sides).forEach((side) => {
      const manual = ((sides[side] || {}).shifts || []).filter((x) => x && x.manual);
      if (!manual.length) return;
      out[day] = out[day] || {};
      out[day][side] = manual.map((x) => ({ ...x }));
    });
  });
  return out;
}

/* Immutably replace one day+side's shift list. */
function withShifts(wk, day, side, fn) {
  const days = { ...(wk.days || {}) };
  const dayRec = { ...(days[day] || {}) };
  const sides = { ...(dayRec.sides || {}) };
  const sideRec = { ...(sides[side] || { shifts: [] }) };
  const next = fn((sideRec.shifts || []).map((x) => ({ ...x })));
  sideRec.shifts = next.sort((a, b) => a.start - b.start || String(a.name).localeCompare(String(b.name)));
  sideRec.hours = sideRec.shifts.reduce((t, x) => t + (x.end - x.start), 0) / 60;
  sides[side] = sideRec;
  dayRec.sides = sides;
  days[day] = dayRec;
  return { ...wk, days };
}

/* One row per person for the grid: their shifts across the week. */
function gridRows(wk, days) {
  const byPerson = new Map();
  days.forEach(({ day }) => {
    const sides = ((wk.days || {})[day] || {}).sides || {};
    Object.keys(sides).forEach((side) => {
      ((sides[side] || {}).shifts || []).forEach((sh) => {
        const id = String(sh.id);
        const row = byPerson.get(id) || { id, name: sh.name, cells: {}, minutes: 0 };
        row.cells[day] = [...(row.cells[day] || []), { ...sh, side }];
        row.minutes += sh.end - sh.start;
        byPerson.set(id, row);
      });
    });
  });
  return [...byPerson.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/* ── what an empty cell says ─────────────────────────────────────────────
   ★★ Matt, Aug 13 2026, on the HotSchedules grid: "i want our unique style but
   the info is good."

   ⚠️⚠️ AN EMPTY CELL WAS NOT INFORMATION, AND THAT WAS THE REAL GAP. Their grid
   writes "Unavailable", "Time Off All Day" or "Partially Available 5:00p -
   11:00p" into every cell with no shift in it. Ours drew a faint plus. So a
   leader looking at a thin Tuesday could not tell "nobody can work" from
   "nobody has been asked" from "three people are off" without leaving the
   screen — and those three want completely different responses.

   ⚠️ "NOT SET" IS ITS OWN ANSWER AND MUST NEVER READ AS AVAILABLE. Same
   three-state rule the whole of availability.js is built on: a blank means
   nobody has said, and the first version of that file getting this wrong is
   why the rule is written down. The wording here keeps them apart.

   ★ MODULE LEVEL, outside the component, per rule 7. */
function cellNote(rec, day, isOff) {
  if (isOff) return { text: "Time off", tone: "off" };
  const st = dayState(rec, day);
  if (st === "unset") return { text: "Not set", tone: "unset" };
  if (st === "off") return { text: "Unavailable", tone: "unavail" };
  const w = windowsFor(rec, day);
  if (!w.length) return { text: "Unavailable", tone: "unavail" };
  return { text: w.map((x) => `${fmtMin(x.start)}-${fmtMin(x.end)}`).join(", "), tone: "free" };
}

const NOTE_TONE = {
  off: "text-sky-700",
  unset: "text-slate-300",
  unavail: "text-slate-400",
  free: "text-emerald-700",
};

/* ── the board look ──────────────────────────────────────────────────────
   Matt, Aug 13 2026, with photos of Daily Setups: "now we need to change the
   look. These are the boards for the setup" and "Corp is coming next month.
   This has to impress them."

   ⚠️ COLOURED BY POSITION, NEVER BY SECTION NAME, and that is design rule 18
   rather than laziness. DailySetup carries a map keyed by THIS store's BOH
   section names — PRIMARY, FRY STATION, BREADING — so a store that calls its
   areas anything else gets one flat colour for the whole board. An index into
   a palette gives every store a coloured, readable board on day one without
   anybody typing a hex value. */
/* ⚠️ THE PALETTE MOVED TO cardStyle.js (Aug 14 2026) so the Training list can
   use the same ten hues. One copy, or the same station goes teal here and blue
   there. Imported at the top of this file; NOT re-declared. Rule 8. */

/* "6am-2pm", or "5:15am-11am, 5pm-8pm" for a station that shuts in between —
   the same two-window shape the setup board prints in its hours pill. */
const stationHoursLabel = (hours) => (Array.isArray(hours) ? hours : [])
  .map((h) => `${fmtMin(h.start)}-${fmtMin(h.end)}`).join(", ");

/* ⚠️ FOUR COLUMNS ON A PHONE IS ABOUT SEVEN CHARACTERS, so a full name is not
   a choice this cell has. The first render put "Adriana…" and "Ana Tur…" in
   adjacent cells on the same board, which is worse than useless: this store
   has an Adriana Arias Hurtado AND an Adriana, and a leader
   reading "Adriana…" cannot tell which one is on Specials.
   ⇒ First name, plus a last initial ONLY when somebody else on this board
   shares the first name. That is exactly what the setup board already prints
   ("Ashley R", "Cami G", "Valerie S") and it is how the floor talks. */
function shortNames(board) {
  const first = new Map();
  (board && board.sections ? board.sections : []).forEach((sec) => sec.stations.forEach((st) =>
    Object.values(st.cells).forEach((c) => (c.people || []).forEach((p) => {
      const f = String(p.name || "").trim().split(/\s+/)[0] || "";
      if (!f) return;
      if (!first.has(f)) first.set(f, new Set());
      first.get(f).add(String(p.id));
    }))));
  return (person) => {
    const parts = String(person.name || "").trim().split(/\s+/);
    const f = parts[0] || "";
    const clash = (first.get(f) || new Set()).size > 1;
    if (!clash || parts.length < 2) return f;
    return `${f} ${parts[1].charAt(0).toUpperCase()}`;
  };
}

/* ⚠️ ONE CELL, THREE ANSWERS, DRAWN THREE DIFFERENT WAYS ON PURPOSE. A hatched
   box means the station is shut then; a red box means it is open and nobody is
   on it. Those used to be the same blank, and the red list of holes sat at the
   bottom of the day where nobody reads it. */
function BoardCell({ dpKey, cell, label }) {
  const c = daypartColor(dpKey);
  if (!cell || cell.state === "closed") {
    return (
      <div className="flex min-h-[52px] items-center justify-center rounded-md" aria-label="closed"
        style={{ background: MARK.closed }}>
        <span className="text-slate-300">×</span>
      </div>
    );
  }
  if (cell.state === "gap") {
    /* ⚠️ THE ONE CELL THAT IS A JOB TO DO, so it is the one that stands off the
       card rather than sitting flat in it. Everything else here is information;
       this is the thing a leader has to fix before the day works. */
    return (
      <div
        className="flex min-h-[52px] items-center justify-center rounded-md px-1 text-center text-[11px] font-bold leading-tight"
        style={{ color: MARK.gap, background: MARK.gapBg, backgroundImage: cardSurface(MARK.gap, 1.1), boxShadow: CARD_3D_SOFT }}
      >
        nobody
      </div>
    );
  }
  return (
    <div
      className="min-h-[52px] rounded-md px-1.5 py-1"
      style={{ background: c.bg, backgroundImage: cardSurface(c.dot, 0.8), boxShadow: CARD_3D_SOFT }}
    >
      {/* ⚠️ WRAPS, NEVER TRUNCATES. "Adriana A" and "Adriana C" are two real
          people here, and an ellipsis makes them the same person on a phone.
          A name on two lines is readable; a cut one is a guess. */}
      {cell.people.map((p, i) => (
        <div key={`${p.id}-${p.start}`} className={i > 0 ? "mt-1" : ""}>
          <div className="break-words text-[11.5px] font-bold leading-[1.15] text-slate-900">
            {i > 0 ? <span className="mr-0.5 font-normal" style={{ color: c.text }}>→</span> : null}
            {label ? label(p) : p.name}
            {/* ★ LEARNING THIS STATION. One small mark, not a coloured cell — a
                training placement is still an ordinary shift and recolouring the
                box would make the day look like it is full of problems. The
                detail, and who is standing with them, is in the panel below the
                board; this is only the pointer to it.
                ⚠️ IT CARRIES A TITLE because on a printed board the dot alone
                means nothing to somebody who has not been told. */}
            {p.training ? (
              <span
                className="ml-1 inline-flex items-center rounded px-1 text-[9.5px] font-extrabold uppercase tracking-wide"
                style={{ background: MARK.training, color: "#fff" }}
                title={`Learning this station${p.priority ? ` · training priority ${p.priority}` : ""}`}
              >
                L
              </span>
            ) : null}
          </div>
          {/* ★★ THE SHIFT TIME, ON EVERY PERSON, IN EVERY CELL, EVERY DAY.
              Matt, Aug 14 2026: "It needs the shift times for each shift and
              day." The cell used to print a bare name and an "@6" ONLY for
              somebody who did not cover the whole daypart, so for most of the
              board there was no way to tell when anybody actually worked —
              which is the first question anybody asks a setup board.

              ⚠️ IT IS THE SPAN AT THIS STATION, NOT THE WHOLE SHIFT, and that is
              deliberate. `assignPositions` can move one person across two
              stations in a shift, and the useful answer inside a station box is
              when they are standing THERE. Somebody who never moves reads the
              same either way, which is most of the board.

              ⚠️ BOLD AND COLOURED WHEN THEY DO NOT COVER THE WHOLE DAYPART.
              That is what the old "@" marker was for and the information is
              worth keeping: a leader scanning for thin spots needs the part-
              window people to stand out from the ones who cover it. */}
          <div
            className={"text-[10px] leading-[1.2] tabular-nums " + (p.partial ? "font-bold" : "font-semibold")}
            style={{ color: p.partial ? c.text : "#64748B" }}
            title={p.partial ? "Not on for the whole daypart" : ""}
          >
            {fmtMin(p.start)}-{fmtMin(p.end)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE TRAINING PANEL — everybody learning something on this day.

   Matt, Aug 14 2026: "can the schedule and setup auto fill the training
   positions for people when assigned to different ones?" Then "Add both
   options", so the store's saved mode decides how this reads.

   ⚠️⚠️ THE TWO MODES DIFFER IN WORDING AND IN NOTHING ELSE, AND THAT IS THE
   HONEST VERSION. `suggest` says a leader still has to put it on the setup;
   `write` says it will be filled in. Neither one writes to the Daily Setup
   board from here, because the button that pulls this schedule into the setup
   is deliberately locked until the platform is trusted (see
   HUB_SCHEDULE_PULL_READY in DailySetup.jsx). Drawing a panel that claimed to
   have filled a board it cannot reach would be the worst kind of wrong: it
   reads as done.

   ⚠️ EMPTY IS SILENT. No priority list, or nobody learning anything today, and
   this renders nothing at all rather than an empty card explaining itself.
   ══════════════════════════════════════════════════════════════════════════ */
function TrainingPanel({ plan, mode }) {
  if (!plan || !plan.length) return null;
  const writing = mode === "write";
  return (
    <div className="mt-4 overflow-hidden rounded-xl bg-white" style={{ boxShadow: CARD_3D }}>
      <div className="h-1.5" style={{ background: "#7E22CE" }} />
      <div className="px-3 pt-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[13px] font-extrabold uppercase tracking-wide" style={{ color: "#7E22CE" }}>
            Learning today
          </div>
          <div className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500">
            {plan.length}
          </div>
        </div>
        <div className="mt-0.5 text-[11.5px] leading-snug text-slate-500">
          {writing
            ? "These go on the training row when this week reaches the setup."
            : "Suggestions. Put them on the setup yourself if you agree."}
        </div>
      </div>
      <div className="space-y-1.5 px-3 pb-3 pt-2">
        {plan.map((t) => (
          <div key={`${t.id}-${t.station}-${t.start}`}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg px-2.5 py-1.5"
            style={{ background: "#FAF5FF" }}>
            <span className="text-[12.5px] font-bold text-slate-900">{t.name}</span>
            <span className="text-[11px] text-slate-500">on</span>
            <span className="text-[12.5px] font-extrabold uppercase" style={{ color: "#7E22CE" }}>{t.station}</span>
            <span className="text-[11px] text-slate-500">{fmtMin(t.start)}-{fmtMin(t.end)}</span>
            {t.priority ? (
              <span className="rounded-full bg-white px-1.5 text-[10px] font-bold text-slate-500">
                #{t.priority} on your list
              </span>
            ) : null}
            {/* ⚠️ NO TRAINER IS SAID OUT LOUD, never left blank. A missing name
                here means nobody on the clock in that window has ever worked the
                station, which is a real thing a leader needs to see before they
                agree to it. */}
            <span className="ml-auto text-[11.5px] font-semibold" style={{ color: t.trainer ? "#1F6F4A" : "#B91C1C" }}>
              {t.trainer ? `with ${t.trainer}` : "nobody on who knows it"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   HOURS ADVICE — what to move, cut or add on this day, and off which station.

   Matt, Aug 14 2026: "i want built in the abilty to suggest what to cut or add
   and where as well as when", and on the input, "based on daypart from the
   previous month report".

   ⚠️ THE MATHS IS IN laborAdvice.js AND NOTHING HERE REPEATS IT. This reads a
   list and draws it. The Worker will want the same list for the morning
   message, which is why the sentence itself comes from `adviceLine` rather than
   being written again in JSX.

   ★ THE STATION COMES FROM THE STORE'S OWN BOARDS, NOT A TYPED LIST.
   `stationLoad` already measures how often each station is really staffed, and
   that IS a cut order: seven weeks of this store's boards put OT 2 at 32% and
   Register 1 at 81%, so the first is optional and the last is not. A cut is
   named off the least-worked station open in that daypart; an add off the most.

   ⚠️⚠️ IT NAMES A STATION ONLY WHEN THE HISTORY KNOWS ONE. `tierOf` answers ""
   for a station it has never seen, and a suggestion that invents a station to
   cut is worse than one that just says the hours — a leader would go looking
   for a row that is not there.

   ⚠️ EMPTY IS SILENT. A day inside its goal renders nothing at all, which is
   the common case. A panel that appears every day stops being read.
   ══════════════════════════════════════════════════════════════════════════ */
/* Mon → 0 … Sat → 5, matching the six-long arrays the daypart report stores.
   Sunday and anything unrecognised answer -1, which `adviceForDay` treats as
   "say nothing" rather than reading past the end of the array.
   ⚠️ MODULE LEVEL, outside the component, per rule 7. */
const adviceDayIndex = (dayName) => ADVICE_DAYS.indexOf(String(dayName || "").slice(0, 3));

/* ⚠️⚠️ WHOLE-STORE HOURS, BOTH SIDES ADDED TOGETHER, AND THIS IS NOT COSMETIC.
   The daypart report's sales and hours are for the WHOLE restaurant, so its
   dollars-per-hour is a whole-store rate. Feeding it one side's planned hours
   would compare a store-wide goal against front-of-house staffing and
   understate every suggested move by roughly the size of the kitchen. The
   panel is drawn once, under the first side, for the same reason. */
function wholeStoreDaypartHours(sides) {
  const out = {};
  SIDE_ORDER.forEach((sd) => {
    const shifts = ((sides && sides[sd]) || {}).shifts;
    const part = daypartHours(Array.isArray(shifts) ? shifts : [], DAYPARTS);
    Object.keys(part || {}).forEach((k) => { out[k] = (out[k] || 0) + (Number(part[k]) || 0); });
  });
  return out;
}

function HoursPanel({ advice, dayName, stations, load }) {
  if (!advice || !advice.length) return null;
  /* ⚠️ MODULE-LEVEL WORK WOULD BE WRONG HERE — this depends on the day's own
     station list — but it is a plain expression, not a hook, so it cannot fall
     foul of the TDZ rule. */
  /* ⚠️⚠️ `never` IS EXCLUDED, AND THE FIRST VERSION GOT THIS WRONG.
     It sorted on rate alone and took the lowest — which is always a station the
     history has NEVER seen staffed. `stationLoad`'s own header says why that is
     the wrong answer: a row nobody ever staffs is a duty row or a retired
     station, not an optional one, and "reporting them as unfilled is reporting
     the board's own design as a fault". Offering to cut from it is worse still,
     because there is nothing there to cut and a leader goes looking for a row
     that does not exist. Measured on real boards: OT 3, Register 4 and Drinks 2
     all sit at 0% and would have been named first, every day. */
  const ranked = (Array.isArray(stations) ? stations : [])
    .map((st) => ({ name: st && st.name, tier: load ? load.tierOf(st && st.name) : "", rate: load ? load.rateOf(st && st.name) : undefined }))
    .filter((s) => s.name && typeof s.rate === "number" && s.tier && s.tier !== "never")
    .sort((a, b) => a.rate - b.rate);
  const leastWorked = ranked.length ? ranked[0].name : "";
  const mostWorked = ranked.length ? ranked[ranked.length - 1].name : "";

  return (
    <div className="mt-4 overflow-hidden rounded-xl bg-white" style={{ boxShadow: CARD_3D }}>
      <div className="h-1.5" style={{ background: "#B45309" }} />
      <div className="px-3 pt-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[13px] font-extrabold uppercase tracking-wide" style={{ color: "#B45309" }}>
            Hours worth a look
          </div>
          <div className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500">
            {advice.length}
          </div>
        </div>
        <div className="mt-0.5 text-[11.5px] leading-snug text-slate-500">
          From your daypart report. Suggestions only, nothing has moved.
        </div>
      </div>
      <div className="space-y-1.5 px-3 pb-3 pt-2">
        {advice.map((a, i) => {
          const where = a.kind === "add" ? mostWorked : leastWorked;
          return (
            <div key={`${a.kind}-${a.part}-${i}`} className="rounded-lg px-2.5 py-1.5" style={{ background: "#FFFBEB" }}>
              <div className="text-[12.5px] font-semibold text-slate-900">{adviceLine(a, dayName)}</div>
              {/* ⚠️ ONLY SHOWN WHEN THE BOARDS ACTUALLY RANK A STATION. */}
              {a.kind !== "move" && where ? (
                <div className="text-[11px]" style={{ color: "#92400E" }}>
                  {a.kind === "cut" ? `Least worked open today: ${where}.` : `Busiest open today: ${where}.`}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ★★ THE KEY. Matt, Aug 14 2026: "for the scheduler we also need a key o
   instructions guide."

   Hannah and Bri are testing this before it goes to the store, and Corp is in
   next month. A board full of marks nobody has been told the meaning of is a
   board people guess at, and a wrong guess here puts somebody on a station.

   ⚠️⚠️ EVERY SWATCH IS DRAWN FROM THE SAME CONSTANT THE BOARD DRAWS FROM.
   `MARK`, `daypartColor`, `sectionTint`, `LEVEL`. Nothing below is a colour
   typed twice. That is the difference between a key and a second opinion: a
   legend that can disagree with its own screen is the most confidently wrong
   thing a tool can show, and nothing fails when it drifts.

   ⚠️ THE SECTIONS COME FROM THE STORE'S OWN CONFIG, not from a list. Another
   store opens this and reads their own areas in their own colours, with nobody
   editing anything. Rule 18.

   ⚠️ CLOSED BY DEFAULT. It is a thing you read once and come back to, and this
   screen already has a week on it. Everything below sits behind one tap.
   ══════════════════════════════════════════════════════════════════════════ */
function KeyRow({ swatch, title, body }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 shrink-0">{swatch}</div>
      <div className="min-w-0">
        <div className="text-[12.5px] font-bold text-slate-900">{title}</div>
        <div className="text-[11.5px] leading-snug" style={{ color: GRAY }}>{body}</div>
      </div>
    </div>
  );
}

function BoardKey({ sections }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3 overflow-hidden rounded-xl bg-white" style={toolCard(ACCENT_NEUTRAL)}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <HelpCircle size={16} style={{ color: ACCENT_NEUTRAL }} />
        <span className="text-[13px] font-bold text-slate-900">What the board is telling you</span>
        <span className="ml-auto text-[12px] font-semibold" style={{ color: ACCENT_NEUTRAL }}>
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open ? (
        <div className="space-y-4 border-t border-slate-100 px-3 py-3">
          {/* ── what is in a box ─────────────────────────────────────────── */}
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: GRAY }}>
              Inside a station box
            </div>
            <div className="space-y-2.5">
              <KeyRow
                swatch={
                  <div className="rounded-md px-1.5 py-1" style={{ width: 74, background: daypartColor("lunch").bg }}>
                    <div className="text-[11.5px] font-bold leading-[1.15] text-slate-900">Ana T</div>
                    <div className="text-[10px] font-semibold leading-[1.2] tabular-nums" style={{ color: "#64748B" }}>
                      11am-3pm
                    </div>
                  </div>
                }
                title="A name and the hours they are on"
                body="Grey hours mean they cover that whole daypart."
              />
              <KeyRow
                swatch={
                  <div className="rounded-md px-1.5 py-1" style={{ width: 74, background: daypartColor("lunch").bg }}>
                    <div className="text-[11.5px] font-bold leading-[1.15] text-slate-900">Ana T</div>
                    <div className="text-[10px] font-bold leading-[1.2] tabular-nums" style={{ color: daypartColor("lunch").text }}>
                      12pm-2pm
                    </div>
                  </div>
                }
                title="Coloured and bold hours"
                body="They are only on for part of that daypart. Check the rest of it is covered."
              />
              <KeyRow
                swatch={
                  <span
                    className="inline-flex items-center rounded px-1 text-[9.5px] font-extrabold uppercase tracking-wide"
                    style={{ background: MARK.training, color: "#fff" }}
                  >
                    L
                  </span>
                }
                title="Learning this station"
                body="They hold no certification for it. Who is on with them is in Learning today, under the board."
              />
              <KeyRow
                swatch={
                  <div
                    className="flex items-center justify-center rounded-md text-[10px] font-bold"
                    style={{ width: 74, height: 34, color: MARK.gap, background: MARK.gapBg }}
                  >
                    nobody
                  </div>
                }
                title="Open with nobody on it"
                body="The station is running that daypart and no one is assigned. This is the thing to fix."
              />
              <KeyRow
                swatch={
                  <div
                    className="flex items-center justify-center rounded-md"
                    style={{ width: 74, height: 34, background: MARK.closed }}
                  >
                    <span className="text-slate-300">×</span>
                  </div>
                }
                title="Shut at that hour"
                body="Not a gap. The station is not open then, so nobody is meant to be on it."
              />
            </div>
          </div>

          {/* ── the four columns ─────────────────────────────────────────── */}
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: GRAY }}>
              The four columns
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DAYPARTS.map((d) => {
                const c = daypartColor(d.key);
                return (
                  <span
                    key={d.key}
                    className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                    style={{ background: c.bg, color: c.text }}
                  >
                    {d.label}
                  </span>
                );
              })}
            </div>
            <div className="mt-1.5 text-[11.5px] leading-snug" style={{ color: GRAY }}>
              Night runs from its start to whenever the last station shuts, because the store does not
              close at the same time every day.
            </div>
          </div>

          {/* ── the areas ────────────────────────────────────────────────── */}
          {sections && sections.length ? (
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: GRAY }}>
                Your areas
              </div>
              {/* ⚠️ GROUPED BY SIDE AND INDEXED WITHIN IT, matching how the
                  board colours them. The two sides reuse the same hues and that
                  is correct: they are never on screen at the same time. Saying
                  which side each list belongs to is what stops that reading as
                  two areas sharing one colour. */}
              {sections.map((g) => (
                <div key={g.side} className="mb-2 last:mb-0">
                  <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wider" style={{ color: GRAY }}>
                    {g.side === "FOH" ? "Front of house" : "Back of house"}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {g.names.map((name, i) => (
                      <span key={name} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                        <span style={{ width: 12, height: 12, borderRadius: 3, background: sectionTint(i) }} />
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              <div className="mt-1.5 text-[11.5px] leading-snug" style={{ color: GRAY }}>
                The stripe down the left of a station card is its area. Same colour on the setup board.
              </div>
            </div>
          ) : null}

          {/* ── warnings ─────────────────────────────────────────────────── */}
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: GRAY }}>
              Warnings
            </div>
            <div className="space-y-2.5">
              <KeyRow
                swatch={<span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: RED }} />}
                title="Red — fix before you publish"
                body="A store rule is broken. Over 12 hours in a day, a close then an open with under 10 hours between, time off already approved, or somebody who has left."
              />
              <KeyRow
                swatch={<span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: AMBER }} />}
                title="Amber — worth a look"
                body="Nothing is broken. Usually a minor near a limit, or somebody outside the hours they gave you."
              />
            </div>
            {/* ⚠️ SAID OUT LOUD BECAUSE IT IS THE MOST IMPORTANT SENTENCE HERE.
                Nothing in this tool refuses an edit. A leader who thinks the
                tool will stop them will stop reading the warnings. */}
            <div className="mt-2 text-[11.5px] leading-snug" style={{ color: GRAY }}>
              Nothing here stops you. The week is yours to change, and a warning only ever tells you
              what the Hub can see.
            </div>
          </div>

          {/* ── the buttons ──────────────────────────────────────────────── */}
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: GRAY }}>
              The buttons, in the order you use them
            </div>
            <ol className="space-y-1.5 text-[11.5px] leading-snug" style={{ color: GRAY }}>
              <li><b className="text-slate-900">Build it again</b> — makes the week from availability, skills and the labor budget. Hand edits are kept.</li>
              <li><b className="text-slate-900">By day / Week grid</b> — one day at a time with its board, or everybody against all six days.</li>
              <li><b className="text-slate-900">Board / People</b> — the day as stations, or as a list of who works when.</li>
              <li><b className="text-slate-900">Save this week</b> — keeps it. Nobody is told anything yet.</li>
              <li><b className="text-slate-900">Publish to the team</b> — this is the one that messages people. Save and read it first.</li>
            </ol>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ★★ COVERAGE — WHERE THE HOLES ARE, front, back, or both at once.

   Matt, Aug 14 2026: "i also need a dashboard view of the filter for
   front/back/and combined so i can see any gaps. i want the option for filter
   view for each position as well."

   The board already draws a red "nobody" in the cell that is short. What it
   could not do is answer the question a leader actually opens the schedule
   with: how bad is this day, and which stations. Twenty-one FOH cards times
   four dayparts is 84 boxes to scan for red.

   ⚠️⚠️ IT IS THE ENGINE'S OWN `holes`, NOT A SECOND COUNT. `assignPositions`
   already reports every span it could not fill, with the station and the exact
   minutes. Recomputing coverage here from the filled list would be a second
   answer to "is this station covered", and the day the two disagree is the day
   the dashboard says clear over a board showing red. Design rule 8.

   ⚠️ MINUTES, MERGED PER STATION. Ten consecutive quarter-hour holes on one
   station is one problem, not ten, and a list of ten rows reads as ten.

   ★ MODULE LEVEL AND PURE (rule 7). */
function coverageOf(sides) {
  const out = [];
  Object.keys(sides || {}).forEach((side) => {
    const holes = (sides[side] && sides[side].holes) || [];
    const byStation = new Map();
    holes.forEach((h) => {
      if (!h || !h.station) return;
      const cur = byStation.get(h.station) || { station: h.station, side, minutes: 0, spans: [] };
      cur.minutes += Math.max(0, (Number(h.end) || 0) - (Number(h.start) || 0));
      cur.spans.push({ start: Number(h.start) || 0, end: Number(h.end) || 0 });
      byStation.set(h.station, cur);
    });
    byStation.forEach((v) => {
      v.spans.sort((a, b) => a.start - b.start);
      out.push(v);
    });
  });
  /* Worst first: the station missing the most minutes is the one to fix. */
  return out.sort((a, b) => b.minutes - a.minutes || a.station.localeCompare(b.station));
}

function CoveragePanel({ sides, stationsBySide }) {
  const [scope, setScope] = useState("both");
  const [only, setOnly] = useState("");

  const all = useMemo(() => coverageOf(sides), [sides]);
  const rows = useMemo(() => all
    .filter((r) => scope === "both" || r.side === scope)
    .filter((r) => !only || r.station === only), [all, scope, only]);

  /* Every station that runs today, for the per-position picker.
     ⚠️ FROM THE STATION LIST, NOT FROM THE HOLES. A picker built from the holes
     could only ever offer stations that are already broken, so it could never
     be used to check that a station is fine — which is half of why somebody
     opens a filter. */
  const stations = useMemo(() => {
    const seen = [];
    Object.keys(stationsBySide || {}).forEach((side) => {
      if (scope !== "both" && side !== scope) return;
      (stationsBySide[side] || []).forEach((st) => {
        if (st && st.name && !seen.includes(st.name)) seen.push(st.name);
      });
    });
    return seen.sort();
  }, [stationsBySide, scope]);

  const shortMin = rows.reduce((n, r) => n + r.minutes, 0);
  const inScope = all.filter((r) => scope === "both" || r.side === scope);
  const clean = inScope.length === 0;

  return (
    <div className="mb-3 overflow-hidden rounded-xl bg-white" style={toolCard(clean ? GREEN : RED)}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <span className="text-[13px] font-bold text-slate-900">Coverage</span>
        {/* ⚠️ THE HEADLINE IS THE ANSWER, not a count of rows. "3 stations
            short" is what a leader can act on; "7 gaps" is arithmetic. */}
        <span className="rounded-full px-2 py-0.5 text-[11px] font-bold"
          style={{ color: "#fff", background: clean ? GREEN : RED }}>
          {clean ? "fully covered" : `${inScope.length} short`}
        </span>
        {!clean && shortMin ? (
          <span className="text-[11.5px] tabular-nums" style={{ color: GRAY }}>{hrs(shortMin / 60)} uncovered</span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-3 py-2">
        {[["both", "Both"], ["FOH", "Front"], ["BOH", "Back"]].map(([id, label]) => {
          const on = scope === id;
          return (
            <button
              key={id}
              onClick={() => { setScope(id); setOnly(""); }}
              className={"rounded-lg px-2.5 py-1 text-[12px] font-semibold " + (on ? "text-white" : "border border-slate-200 bg-white text-slate-600")}
              style={on ? { background: INK } : null}
            >
              {label}
            </button>
          );
        })}
        {/* ⚠️ THE PICKER RESETS WHEN THE SIDE CHANGES (above), or it would hold
            a kitchen station while the front is showing and quietly filter
            everything to nothing. */}
        <select
          value={only}
          onChange={(e) => { const v = e.target.value; setOnly(v); }}
          className="ml-auto rounded-lg border border-slate-300 px-2 py-1 text-[12px]"
        >
          <option value="">Every position</option>
          {stations.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div className="border-t border-slate-100 px-3 py-2">
        {rows.length === 0 ? (
          <div className="text-[12px]" style={{ color: GRAY }}>
            {/* ⚠️ THE TWO EMPTY STATES ARE DIFFERENT AND MUST READ DIFFERENTLY.
                "Nothing is short" and "the thing you filtered to is fine" are
                both good news, but only one of them means the DAY is fine. */}
            {only ? `${only} is covered all day.`
              : scope === "both" ? "Every position is covered all day."
                : `Every ${scope === "FOH" ? "front" : "back"} position is covered all day.`}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {rows.map((r) => (
              <div key={`${r.side}-${r.station}`} className="flex items-center gap-2 overflow-hidden rounded-lg bg-white"
                style={toolRow(RED)}>
                <span className="self-stretch shrink-0" style={{ width: 4, background: RED }} />
                <span className="min-w-0 flex-1 py-1.5">
                  <span className="block truncate text-[12.5px] font-bold text-slate-900">{r.station}</span>
                  <span className="block text-[11px] tabular-nums" style={{ color: GRAY }}>
                    {r.spans.map((sp) => `${fmtMin(sp.start)}-${fmtMin(sp.end)}`).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 pr-2.5 text-[11px] font-bold tabular-nums" style={{ color: RED }}>
                  {hrs(r.minutes / 60)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StationBoard({ board, order }) {
  if (!board || !board.sections.length) {
    return <div className="text-sm text-slate-500">No stations are set up for this day.</div>;
  }
  /* Worked out once for the whole board, because "does anybody else here share
     this first name" is a question about the board, not about one cell. */
  const label = shortNames(board);
  const sideOrder = Array.isArray(order) ? order : [];
  return (
    <div className="space-y-4">
      {board.sections.map((sec, si) => {
        /* ⚠️ FALLS BACK TO THE DAY'S OWN INDEX, never to -1. A section name that
           is not in the side list means the two were built from different
           station data, and the old behaviour is a better answer there than
           painting every unknown section the same colour. */
        const at = sideOrder.indexOf(sec.name);
        const tint = sectionTint(at < 0 ? si : at);
        return (
          <div key={sec.name}>
            <div className="mb-2 flex items-center gap-2">
              <div className="text-[13px] font-extrabold uppercase tracking-wide" style={{ color: tint }}>{sec.name}</div>
              <div className="h-px flex-1" style={{ background: tint, opacity: 0.25 }} />
              <div className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500">
                {sec.stations.length} {sec.stations.length === 1 ? "station" : "stations"}
              </div>
            </div>

            <div className="space-y-2">
              {/* ★★ THE SAME LINE THE TRAINING LIST DRAWS. Matt, Aug 14 2026:
                  "I love the look of the training lines and that's how I want
                  the schedule and setup." So a station is a white card with a
                  left stripe in its section colour, that colour washed across
                  the face and fading out, and the hours pushed to the right the
                  way the training rows push their section name.
                  ⚠️ LEFT STRIPE, NOT THE TOP STRIP IT HAD. A top strip is a
                  header rule; a left stripe reads as a row in a list, which is
                  what a board of stations actually is. */}
              {sec.stations.map((st) => {
                /* ★★ A POSITION NOBODY IS ON ALL DAY COLLAPSES TO ONE LINE.
                   Matt, Aug 14 2026: "if a position isnt covered all day i want
                   it to be collapsed."

                   A station with nobody in any daypart still drew a full card:
                   four column headers, four empty cells, a duty band. On a
                   21-station front board those are the cards taking the most
                   room to say the least.

                   ⚠️⚠️ COLLAPSED, NEVER HIDDEN, and the line still says NOBODY
                   ALL DAY in red. A station quietly dropped off the board is a
                   hole nobody can see, which is the exact opposite of what the
                   coverage panel above it exists for.
                   ⚠️ AND ONLY WHEN IT IS OPEN AND EMPTY. A station SHUT all day
                   is a different fact and keeps its hatched card — the board has
                   drawn those two differently on purpose since it was built. */
                const cells = Object.values(st.cells || {});
                const openCells = cells.filter((c) => c && c.state !== "closed");
                if (openCells.length > 0 && openCells.every((c) => c.state === "gap")) {
                  return (
                    <div key={st.id} className="flex items-center overflow-hidden rounded-xl bg-white"
                      style={{ boxShadow: CARD_3D_SOFT, backgroundImage: cardSurface(MARK.gap, 0.7) }}>
                      <span className="self-stretch shrink-0" style={{ width: 4, background: MARK.gap }} />
                      <span className="min-w-0 flex-1 px-3 py-2">
                        <span className="block truncate text-[13.5px] font-extrabold uppercase leading-tight text-slate-900">
                          {st.name}
                        </span>
                        <span className="block text-[11px] tabular-nums" style={{ color: GRAY }}>
                          {stationHoursLabel(st.hours)}
                        </span>
                      </span>
                      <span className="shrink-0 pr-3 text-[11.5px] font-extrabold" style={{ color: MARK.gap }}>
                        NOBODY ALL DAY
                      </span>
                    </div>
                  );
                }
                return (
                <div
                  key={st.id}
                  className="flex overflow-hidden rounded-xl bg-white"
                  style={{ boxShadow: CARD_3D, backgroundImage: cardSurface(tint, 0.85) }}
                >
                  <div className="shrink-0" style={{ width: 4, background: tint }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 px-3 pt-2.5">
                      <div className="text-[15px] font-extrabold uppercase leading-tight text-slate-900">{st.name}</div>
                      <div
                        className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
                        style={{ color: shade(tint), background: "rgba(255,255,255,.75)" }}
                      >
                        {stationHoursLabel(st.hours)}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 px-3 pb-2.5 pt-2">
                      {board.windows.map((w) => {
                        const c = daypartColor(w.key);
                        return (
                          <div key={w.key}>
                            <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: c.text }}>{w.label}</div>
                            <div className="mb-1 h-[3px] rounded-full" style={{ background: c.dot }} />
                            <BoardCell dpKey={w.key} cell={st.cells[w.key]} label={label} />
                          </div>
                        );
                      })}
                    </div>

                    {st.duty ? (
                      <div className="px-3 py-1.5 text-[11.5px] font-extrabold uppercase tracking-wide"
                        style={{ background: `${tint}1A`, color: shade(tint) }}>
                        ◆ {st.duty}
                      </div>
                    ) : null}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── the tile ────────────────────────────────────────────────────────── */

export default function ScheduleBuilder({ tier, user }) {
  /* ⚠️ OPENING THIS TILE IS NOT PERMISSION TO CHANGE THE WEEK. The tile gate
     (`owners.tileAllow.schedule`) decides who sees it; this decides who may
     press Build, drag a shift or save. Matt, Aug 13 2026: "bri, hannah, and
     myself can edit schedule" — Nick can open it and read it, and cannot
     change it. Read-only is a real, useful state here, so the screen renders
     fully and withholds the buttons rather than refusing the tile. */
  const canBuild = useMemo(
    () => tileAllowsId("scheduleEdit", (user && user.id) != null ? user.id : ""),
    [user],
  );
  /* ⚠️⚠️ EDITING THE SCHEDULE AND SEEING WAGES ARE DIFFERENT PERMISSIONS, and
     they already differ: Bri builds the week and may not see a penny of it.
     So this screen shows HOURS to everybody who can open it and DOLLARS only to
     the wage list. It does not even ASK for the pay key otherwise — the Worker
     would refuse it anyway, and a refused request in the console reads like a
     bug to whoever opens dev tools next. */
  const canSeeWages = useMemo(
    () => tileAllowsId("payAccess", (user && user.id) != null ? user.id : ""),
    [user],
  );

  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [roster, setRoster] = useState([]);
  const [avail, setAvail] = useState({ people: {} });
  const [skills, setSkills] = useState({ people: {} });
  const [minors, setMinors] = useState(() => new Set());
  const [timeOff, setTimeOff] = useState({ v: 1, requests: [] });
  const [terminated, setTerminated] = useState(() => new Set());
  const [jobCodes, setJobCodes] = useState({ v: 1, codes: [] });
  /* ⚠️ BOTH OF THESE ARE READ-ONLY HERE. They are set up on the Inputs side of
     this console (Minors and School tabs) and only consumed while a week is
     built, so this screen never writes either key. */
  const [minorRules, setMinorRules] = useState({ v: 1, bands: [], people: {} });
  const [school, setSchool] = useState({ v: 1, termStart: "", termEnd: "", offDates: [] });
  const [pay, setPay] = useState({ v: 1, people: {} });
  const [payDefault, setPayDefault] = useState(0);
  const [statusUnread, setStatusUnread] = useState(false);
  const [budgets, setBudgets] = useState({});
  /* ⚠️ HOW THIS STORE ACTUALLY RUNS, read off its own saved boards. Null until
     the read lands, and null means "no history", which puts assignPositions
     back to exactly the fill it did before this existed. Never a default. */
  const [history, setHistory] = useState(null);
  /* ⚠️ THE DAYS THIS STORE DOES NOT KEEP ITS NORMAL HOURS. Matt, Aug 13 2026:
     "for holidays we only open 10:30-4". Station hours are keyed to a DAY OF
     THE WEEK, so without this a week containing Labor Day rosters Bulk Prep
     from 5am because Monday says so. Empty until typed, and empty means every
     day is ordinary. */
  const [storeHours, setStoreHours] = useState(() => readStoreHours(null));
  const [week, setWeek] = useState(null);
  const [openDay, setOpenDay] = useState(null);
  /* Who turned up, one row per week beside the schedule. ⚠️ ITS OWN KEY, not a
     field on the schedule: a rebuild replaces the schedule record wholesale and
     would take a week of marks with it. */
  const [att, setAtt] = useState(() => readAttendance(null));
  const [attBusy, setAttBusy] = useState(false);
  const [view, setView] = useState("days");        // "days" | "grid"
  /* ⚠️ THE PEOPLE LIST IS KEPT, NOT REPLACED. The board is the look Matt asked
     for and is the default, but "who is on and for how long" is a different
     question from "who is standing here at 2pm", and the old view answers it
     in one glance. Rule 16: never trade a working surface for a new one. */
  const [dayLook, setDayLook] = useState("board");  // "board" | "people"
  const [editing, setEditing] = useState(null);    // {day, side, id, name, start, end, isNew}
  const [addWho, setAddWho] = useState("");
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState("");
  const [pushing, setPushing] = useState(false);
  const [pushed, setPushed] = useState("");
  const [err, setErr] = useState("");

  const days = useMemo(boardDays, []);
  const mondayIso = useMemo(() => isoOf(monday), [monday]);

  /* The week as a person reads it. Used in the header AND in both confirmation
     questions, so the week you are told you are about to publish is the same
     string you are looking at (design rule 8 — two copies of this drift into a
     dialog naming a different week from the one on screen). */
  const weekLabel = useMemo(
    () => monday.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    [monday],
  );
  const dates = useMemo(
    () => days.map((d, i) => ({ day: d, date: addDays(monday, i), iso: isoOf(addDays(monday, i)) })),
    [days, monday],
  );

  /* Inputs. Reloaded when the week moves because the labor projection is
     per month and a week can cross one. */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        /* ⚠️ `kvGetResult` FOR STATUS, NOT `kvGet`. A failed read and an empty
           map both come back null from kvGet, and the two mean opposite things
           here: "nobody has left" versus "I could not find out". Scheduling a
           terminated person is bad; refusing to schedule anybody because a read
           dropped would be worse, so a failed read still builds — and says so. */
        const [team, a, s, m, saved, to, attRec, statusRes, jc, mr, sc, sh, roleMap] = await Promise.all([
          loadHRTeam(), kvGet(AVAIL_KEY), kvGet(SKILLS_KEY), kvGet(MINORS_KEY),
          kvGet(scheduleKey(isoOf(monday))), kvGet(TIMEOFF_KEY),
          kvGet(attendanceKey(isoOf(monday))),
          kvGetResult(HR_STATUS_KEY), kvGet(JOBCODES_KEY),
          kvGet(MINOR_RULES_KEY), kvGet(SCHOOL_KEY), kvGet(STORE_HOURS_KEY),
          kvGet(HR_ROLES_KEY),
        ]);
        if (!alive) return;
        /* ⚠️⚠️ THE TITLE OVERRIDE IS MERGED HERE, AND IT WAS NOT BEFORE.
           `loadHRTeam` returns the roster row's own `role`, and HR Console
           edits a title by writing gcfcr-hr-roles instead of touching that row.
           So the raw roster says one thing and every other screen in the Hub
           says another, and this one believed the roster.

           ⚠️ IT ONLY STARTED MATTERING WHEN THE TITLE STARTED DECIDING
           SOMETHING. Nothing here read `role` before; now `isOffFloor` does, so
           an unmerged title is somebody scheduled who should not be — and at
           this store that is a real person today, whose roster row still says
           the title they held before Hannah changed it.

           ⚠️ THE OVERRIDE WINS, matching the precedence App.jsx already uses on
           the sign-in path. A missing or unreadable map changes nothing: every
           row keeps the role it arrived with. */
        const overrides = roleMap && typeof roleMap === "object" && !Array.isArray(roleMap) ? roleMap : {};
        const list = (Array.isArray(team) ? team : []).map((p) => {
          if (!p || p.id == null) return p;
          const v = String(overrides[String(p.id)] || "").trim();
          return v && v !== p.role ? { ...p, role: v } : p;
        });
        setRoster(list);
        setAvail(readStore(a));
        setSkills(readStore(s));
        setTimeOff(readTimeOff(to));
        setJobCodes(readJobCodes(jc));
        /* ⚠️ AN EMPTY RECORD IS A WORKING STATE for both of these. With no
           limits typed the engine keeps the rough minor cap it has always had,
           and with no school year set every minor is checked against the
           SCHOOL day limits rather than the looser ones. Never the other way
           round — see the header of schoolCalendar.js. */
        setMinorRules(readMinorRules(mr));
        setSchool(readSchool(sc));
        /* ⚠️ EMPTY MEANS EVERY DAY IS ORDINARY, which is what every store has
           until somebody types a date. Never a seeded holiday list: another
           store trades on days this one shuts. */
        setStoreHours(readStoreHours(sh));

        /* The minors list is names, and everything else here is keyed by id.
           ⚠️ THE JOIN LIVES IN minorRules.js AND IS NOT REPEATED HERE. It used
           to be written out inline, and the Minors setup screen needs the same
           answer — two copies of "which Sam did they mean" is the drift rule 8
           exists to stop. The shared one is also stricter in one useful way: a
           first name shared by two people now matches NEITHER, where this copy
           matched both. */
        setMinors(minorIdsFrom(m, list));

        /* Who HR says has left. */
        setStatusUnread(!statusRes.ok);
        const statusMap = statusRes.ok ? statusRes.value : null;
        const gone = new Set();
        list.forEach((p) => { if (p && isTerminatedId(statusMap, p.id)) gone.add(String(p.id)); });
        setTerminated(gone);
        setWeek(saved && saved.days ? saved : null);
        setSavedAt(saved && saved.savedAt ? saved.savedAt : "");
        setAtt(readAttendance(attRec));
      } catch {
        if (alive) setErr("Could not load the schedule inputs. Close the tool and open it again.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [monday]);

  /* Wages, only for the people allowed to see them. */
  useEffect(() => {
    if (!canSeeWages) { setPay({ v: 1, people: {} }); setPayDefault(0); return undefined; }
    let alive = true;
    (async () => {
      try {
        const [p, d] = await Promise.all([kvGet(PAY_KEY), kvGet(PAY_DEFAULT_KEY)]);
        if (!alive) return;
        setPay(readPay(p));
        const n = Number(d && d.rate);
        setPayDefault(Number.isFinite(n) && n > 0 ? n : 0);
      } catch {
        /* A refused or dropped read means no dollars, never zero dollars. */
        if (alive) { setPay({ v: 1, people: {} }); setPayDefault(0); }
      }
    })();
    return () => { alive = false; };
  }, [canSeeWages]);

  /* THE LABOR PLANNER CONNECTION. Same chain the Labor Planner runs. */
  useEffect(() => {
    let alive = true;
    (async () => {
      /* 🐛🐛 THESE TWO EFFECTS WERE ONE, AND THE INNER ONE NEVER RAN.
         Found Aug 14 2026 by driving the tile in a browser. The boards/history
         effect had been pasted INSIDE this one's async body, so React threw
         "Invalid hook call — hooks can only be called inside the body of a
         function component" on every mount and `history` stayed null for ever.

         ⚠️⚠️ THAT MEANT THE MEMORY FEATURE WAS DEAD IN PRODUCTION. stationLoad
         and placementMemory were both computed off `history`, so anchors did
         not go home, core stations were not preferred over peak, and nothing
         could be marked as training. The tile looked completely normal: no
         blank screen, no red, just a schedule built as if the store had no past.

         ⚠️ THE SIX CHECKS CANNOT SEE THIS ONE. It parses, every name resolves,
         and hookcheck looks for a hook after an early RETURN — not for a hook
         nested in a callback. Only running it found it.

         ⇒ Keep them separate. They have different dependency arrays ([dates]
         here, [monday, roster] below) and merging them would re-read four weeks
         of boards every time a forecast changed. */
      try {
        const months = [...new Set(dates.map((d) => ymOf(d.date)))];
        const bases = {};
        for (const ym of months) bases[ym] = await loadMonthBasis(ym, kvGet);
        if (!alive) return;
        const out = {};
        dates.forEach(({ iso, date }) => {
          const b = bases[ymOf(date)];
          if (!b) return;
          const t = activeTier(b.tierCfg);
          const forecast = forecastFor(iso, b.p, b.wk);
          const target = targetFor(iso, b.p, b.wk, t);
          const d = dayBudget(forecast, target, b.cfg, undefined);
          out[iso] = { forecast, total: d.total, FOH: d.foh, BOH: d.boh };
        });
        setBudgets(out);
      } catch {
        /* ⚠️ A MISSING PROJECTION IS NOT AN ERROR AND MUST NOT BLOCK A BUILD.
           A month with no forecast typed yet is normal. The week still builds;
           the budget column just reads "no projection" instead of a number. */
        if (alive) setBudgets({});
      }
    })();
    return () => { alive = false; };
  }, [dates]);

  /* ── the store's own past, as numbers ─────────────────────────────────
     ⚠️⚠️ READ FROM THE SAVED BOARDS, NOT FROM A TYPED LIST. Which stations this
     store really staffs and where each person really stands are facts it has
     already recorded four weeks running. See the header of boardHistory.js for
     what the numbers turned out to be and why each one changes a placement.

     ⚠️ RECENT WEEKS COUNT MORE, 4 down to 1, so somebody who moved station
     reads as having moved rather than as split between the two.
     ⚠️ A FAILED OR EMPTY READ LEAVES `history` NULL, which is a working state:
     the engine falls straight back to what it did before. A board that has not
     been built yet is normal, not an error. */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const weeks = [0, 1, 2, 3].map((n) => isoOf(addDays(monday, -7 * (n + 1))));
        const keys = [];
        weeks.forEach((iso) => {
          keys.push(`gcfcr-dailysetup-foh-v2-${iso}-auto`);
          keys.push(`gcfcr-dailysetup-boh-v2-${iso}-auto`);
        });
        const raw = await Promise.all(keys.map((k) => kvGet(k).catch(() => null)));
        if (!alive) return;
        const boards = [];
        const weight = new Map();
        /* ★★ THE SAME BOARDS, KEPT SIDE BY SIDE FOR THE LESSON.
           `learnFrom` wants { FOH: { <weekIso>: { <DayName>: { roster } } } },
           which is the shape these keys already are — they are just being read
           into a flat list for the placement memory. Building both from one
           read means the scheduler learns from exactly the weeks it remembers
           placements from, with no second fetch and no chance of the two
           disagreeing about which weeks it saw. */
        const bySide = { FOH: {}, BOH: {} };
        raw.forEach((v, i) => {
          if (!v || typeof v !== "object") return;
          boards.push(v);
          /* Two keys per week, so the index halves back to the week number. */
          weight.set(v, 4 - Math.floor(i / 2));
          /* Keys were pushed foh-then-boh per week, so an even index is front. */
          bySide[i % 2 === 0 ? "FOH" : "BOH"][weeks[Math.floor(i / 2)]] = v;
        });
        if (!boards.length) { setHistory(null); return; }
        /* ⚠️ THE PRIORITY LIST IS READ HERE, BESIDE THE BOARDS, because the two
           are one answer: the boards say what somebody has already done and the
           list says what the store wants them to learn next. A failed read
           leaves it null, which readTraining turns into an empty list, which
           marks nothing — the same working state as a store that has not opened
           the Training tab. */
        const tp = await kvGet(TRAINING_KEY).catch(() => null);
        /* ⚠️ THE DAYPART REPORT IS READ HERE TOO, beside the boards, for the
           same reason: the boards say which stations this store really works
           and the report says which dayparts are carrying their sales. Both
           are "what the store already did". A failed read leaves it null,
           `latestMonth` answers null, and the hours panel renders nothing —
           the same working state as a store that has never filled it in. */
        const dp = await kvGet(DP_KEY).catch(() => null);
        if (!alive) return;
        setHistory({
          load: stationLoad(boards),
          memory: placementMemory(boards, roster, { weightOf: (b) => weight.get(b) || 1 }),
          training: readTraining(tp),
          month: latestMonth(dp),
          /* ★ WHAT THE STORE REALLY STAFFS, per side per weekday, read off the
             same boards. Recomputed on every load, so the week saved on Sunday
             is training data on Monday with nothing to retrain. */
          learned: learnFrom(bySide),
        });
      } catch {
        if (alive) setHistory(null);
      }
    })();
    return () => { alive = false; };
  }, [monday, roster]);

  const build = useCallback(async () => {
    setBuilding(true);
    setErr("");
    try {
      const FOH = storeCfg("stations.FOH") || {};
      const BOH = storeCfg("stations.BOH") || {};
      const res = buildWeek({
        /* ⚠️ NULL UNTIL THE BOARDS LAND, and null builds exactly as before.
           `needWithHistory` also refuses a weekday with fewer than two real
           rosters, so a thin history cannot move a day. */
        learned: history && history.learned,
        days: dates.map(({ day, iso }) => ({
          day, iso,
          /* ⚠️ CLAMPED TO THE DATE, NOT JUST THE WEEKDAY. On a 10:30-4 day
             every posted window is wrong at both ends, and a station that
             closes before the store opens drops out entirely rather than
             becoming a hole nobody could have filled. */
          /* ⚠️ FRONT FOLLOWS THE DOORS, BACK OPENS THE BUILDING. His real
             Labor Day roster has prep on at 8am on a 10:30 open, so clamping
             the back of house to the opening time would delete it. Only the
             closing end moves there. See stationsForDate. */
          sides: {
            FOH: stationsForDate(FOH[day] || [], storeHours, iso),
            BOH: stationsForDate(BOH[day] || [], storeHours, iso, { clampStart: false }),
          },
          budget: { FOH: (budgets[iso] || {}).FOH, BOH: (budgets[iso] || {}).BOH },
        })),
        roster, avail: avail.people, skills: skills.people, minors, timeOff, terminated, jobCodes,
        /* ⚠️ THE LIMITS ARE APPLIED WHILE THE WEEK IS DECIDED, not trimmed off
           afterwards. A minor who may not work past 7pm is never offered the
           8pm slot, so the shortfall shows up as a coverage gap somebody can
           look at instead of a shift that quietly breaks a rule. */
        minorRules, school,
        /* ⚠️ HAND EDITS SURVIVE A REBUILD. See keepFromWeek. */
        keep: keepFromWeek(week || {}),
      });
      const built = { v: 1, monday: mondayIso, days: res.days, weekMinutes: res.weekMinutes };
      setWeek(built);
      /* ══════════════════════════════════════════════════════════════════
         ★★ A BUILT WEEK SAVES ITSELF. Matt, Aug 14 2026: "once you build a
         week does it save? if i leave it keeps saying build."

         It did not. Build only set React state, so closing the tab threw the
         whole week away and the screen came back offering to build it again —
         with no warning that anything had been lost, because from the code's
         point of view nothing had.

         ⚠️ THIS IS NOT PUBLISHING. Saving keeps the week and lets the team see
         their own shifts; `Publish to the team` is still a separate, confirmed
         press that messages ~106 phones. Those two must never merge.

         ⚠️ REBUILDING OVER A SAVED WEEK IS SAFE, and that is what makes an
         automatic save safe. `keepFromWeek` feeds every hand-edited shift back
         in as `preplaced`, so a rebuild carries a leader's decisions forward
         rather than discarding them — the same guarantee that already made
         pressing Build twice safe.

         ⚠️ A FAILED SAVE SAYS SO AND LEAVES THE WEEK ON SCREEN. `savedAt` stays
         empty, the banner appears, and the manual Save button is still there.
         Nothing is lost that was not already only in memory.
         ══════════════════════════════════════════════════════════════════ */
      const at = new Date().toISOString();
      const ok = await kvSet(scheduleKey(mondayIso), { ...built, savedAt: at });
      if (ok === false) {
        setSavedAt("");
        setErr("The week was built but did not save. Press Save this week to try again.");
      } else {
        setSavedAt(at);
      }
    } catch {
      setErr("The week could not be built. Nothing was saved.");
    } finally {
      setBuilding(false);
    }
  }, [dates, budgets, roster, avail, skills, minors, timeOff, terminated, jobCodes, minorRules, school, storeHours, mondayIso, week]);

  /* ⚠️ EVERY EDIT STAMPS `manual: true`. That flag is the only thing standing
     between a leader's decisions and the next press of Build. */
  const applyEdit = useCallback((e) => {
    const start = inputToMin(e.startText);
    const end = inputToMin(e.endText);
    if (start == null || end == null || end <= start) {
      setErr("That shift ends before it starts.");
      return;
    }
    /* 🐛🐛 MOVING A SHIFT TO THE OTHER SIDE USED TO LEAVE A COPY BEHIND.
       `withShifts` only ever touches ONE side's list, and this wrote into
       `e.side` — the side currently chosen in the dropdown. Nothing remembered
       which side the shift came FROM, so switching FOH to BOH added it to BOH
       and left the original sitting on FOH. One person, two shifts, the same
       clock, on both boards.

       It is visible — the double-booking warning does fire — but visible is not
       fixed: the leader asked to MOVE it and got two, the day's hours
       double-count against the budget, and both boards print a body that is
       only ever standing on one of them.

       ⇒ THE ORIGINAL SIDE IS CAPTURED WHEN THE EDITOR OPENS (`fromSide`) and
       the old row is removed first. A brand new shift has no `fromSide`, so
       this is a no-op for it, and an edit that does not change the side takes
       the same path it always did. */
    const from = e.fromSide;
    setWeek((wk) => {
      const base = (from && from !== e.side)
        ? withShifts(wk, e.day, from, (list) => list.filter((x) => String(x.id) !== String(e.id)))
        : wk;
      return withShifts(base, e.day, e.side, (list) => {
        const rest = list.filter((x) => String(x.id) !== String(e.id));
        return [...rest, {
          ...(list.find((x) => String(x.id) === String(e.id)) || {}),
          id: String(e.id), name: e.name, start, end, manual: true,
          job: e.job || "", skillWord: e.skillWord || "", side: e.side,
        }];
      });
    });
    setEditing(null);
    setSavedAt("");
    setErr("");
  }, []);

  const removeShift = useCallback((day, side, id) => {
    setWeek((wk) => withShifts(wk, day, side, (list) => list.filter((x) => String(x.id) !== String(id))));
    setEditing(null);
    setSavedAt("");
  }, []);

  /* ⚠️ THE BROWSER SENDS A DATE. It does not choose who is told or what they
     are told — the Worker reads the saved week itself and builds each person's
     own message. See /api/schedule-publish for why that is the whole design.
     ⚠️ SAVE FIRST. Publishing what is on screen but not in storage would tell
     people about a week nobody can look up. */
  /* ── the week's hours, back into the Labor Planner ─────────────────────
     ⚠️ FROM THE WEEK ON SCREEN, not from a saved copy. What a leader is
     looking at, including every hand edit, is what the planner should get —
     otherwise pressing this after a drag sends yesterday's numbers.
     ⚠️ MINUTES → DECIMAL HOURS HERE, once, at the boundary. The schedule is
     minutes and the planner is hours; see the units warning at the top of
     availability.js for what a second conversion has already cost. */
  async function pushHours() {
    if (pushing || !week) return;
    /* ⚠️ THIS OVERWRITES WHAT SOMEBODY TYPED. The note above says overwrite is
       only safe when somebody asked for it in that moment — pressing a button IS
       asking, but a mis-tap on a phone is not, and this button sat in a flat row
       looking exactly like Save. */
    if (!window.confirm(
      `Overwrite the Labor Planner's hours for the week of ${weekLabel}?\n\n`
      + "Anything typed in the planner for those days is replaced by this schedule.",
    )) return;
    setPushing(true); setErr(""); setPushed("");
    try {
      const byIso = {};
      Object.keys(week.days || {}).forEach((day) => {
        const rec = week.days[day] || {};
        if (!rec.iso) return;
        const sides = rec.sides || {};
        const hrs = (side) =>
          ((sides[side] || {}).shifts || []).reduce((t, s) => t + (Number(s.end) - Number(s.start)), 0) / 60;
        byIso[rec.iso] = { foh: hrs("FOH"), boh: hrs("BOH") };
      });
      const res = await pushScheduledHours(byIso, {
        get: kvGet, set: kvSet, stamp: { at: new Date().toISOString() },
      });
      if (!res.ok) {
        setErr(`The planner would not save ${res.failedMonth}. ${res.days} day(s) went in before it stopped.`);
        return;
      }
      /* ⚠️ SAY WHEN IT CROSSED A MONTH. Two records changed is a surprise
         worth naming, not a detail to hide. */
      const months = res.months.filter((m) => m.days > 0).map((m) => m.ym);
      setPushed(
        `${res.days} day${res.days === 1 ? "" : "s"} sent to the Labor Planner`
        + (months.length > 1 ? ` (${months.join(" and ")})` : ""),
      );
    } catch {
      setErr("Could not send the hours. Nothing was changed in the planner.");
    } finally { setPushing(false); }
  }

  async function publish() {
    if (publishing || !week || !canBuild) return;
    if (!savedAt) { setErr("Save the week first, then publish it."); return; }
    /* ⚠️⚠️ ASKED BEFORE IT LEAVES THIS SCREEN. This notifies EVERY person on the
       roster, on their phone, at whatever moment it is pressed. It was one tap
       with nothing in between, on a shared iPad, next to three buttons that
       looked identical to it. A mis-tap here is not an undo — the phones have
       already buzzed.
       ⚠️ THE WEEK IS NAMED IN THE QUESTION. "Are you sure" answers nothing; the
       real mistake this prevents is publishing while looking at the wrong week,
       and the only way to catch that is to print which week is about to go. */
    if (!window.confirm(
      `Tell everyone on the roster their shifts for the week of ${weekLabel}?\n\n`
      + "This goes to their phones now and cannot be taken back.",
    )) return;
    setPublishing(true); setErr(""); setPublished("");
    try {
      const r = await fetch("/api/schedule-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
        body: JSON.stringify({ monday: mondayIso }),
      }).then((x) => x.json()).catch(() => null);
      if (!r || !r.ok) {
        setErr((r && r.error) || "Could not publish. Nothing was sent.");
        return;
      }
      setPublished(`Told ${r.sent} of ${r.people} people. ${r.skipped ? `${r.skipped} have no phone signed up.` : ""}`);
    } catch {
      setErr("Could not publish. Nothing was sent.");
    } finally { setPublishing(false); }
  }

  /* ⚠️ ONE READ, ONE WRITE, ON ITS OWN KEY. Marking a shift must never touch
     the schedule record: a rebuild replaces that wholesale and would take a
     week of marks with it.
     ⚠️ A REFUSED WRITE CHANGES NOTHING LOCALLY EITHER, so the row never shows a
     mark that did not save. */
  async function mark(key, status) {
    if (attBusy || !key) return;
    setAttBusy(true);
    try {
      const fresh = readAttendance(await kvGet(attendanceKey(mondayIso)));
      const next = markShift(fresh, key, status, (user && (user.name || user.Name)) || "");
      const ok = await kvSet(attendanceKey(mondayIso), { ...next, monday: mondayIso });
      if (ok === false) throw new Error("refused");
      setAtt(next);
    } catch {
      setErr("That mark did not save. Try again.");
    } finally { setAttBusy(false); }
  }

  async function save() {
    if (!week || saving) return;
    setSaving(true);
    setErr("");
    try {
      const at = new Date().toISOString();
      const ok = await kvSet(scheduleKey(mondayIso), { ...week, savedAt: at });
      if (ok === false) throw new Error("refused");
      setSavedAt(at);
    } catch {
      setErr("That did not save. Check the connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  /* ★ WHAT THE MARKS ADD UP TO. ⚠️ COVERAGE FIRST, DELIBERATELY. A week marked
     four percent through is not a week with no problems, and a bare "2 no
     shows" invites exactly that reading. */
  const attSum = useMemo(() => {
    if (!week) return null;
    const cov = attCoverage(att, week);
    if (!cov.shifts) return null;
    const counts = { late: 0, left: 0, calledout: 0, noshow: 0 };
    Object.values(readAttendance(att).marks).forEach((m) => {
      if (counts[m.status] != null) counts[m.status] += 1;
    });
    return { ...cov, ...counts, concerns: counts.late + counts.left + counts.calledout + counts.noshow };
  }, [att, week]);

  const totals = useMemo(() => {
    if (!week || !week.days) return null;
    let shifts = 0, hours = 0, budget = 0, gaps = 0, trimmed = 0, stuck = 0;
    Object.keys(week.days).forEach((d) => {
      const day = week.days[d];
      SIDE_ORDER.forEach((side) => {
        const s = day.sides && day.sides[side];
        if (!s) return;
        shifts += s.shifts.length;
        hours += s.hours;
        budget += Number(s.budget) || 0;
        gaps += s.gaps.length;
        /* What the budget trim did. `stuck` counts the day-sides where the
           slack ran out before the goal was met — those are the ones that need
           a human decision rather than more arithmetic. */
        trimmed += Number(s.trimmedHours) || 0;
        if (s.outOfSlack) stuck++;
      });
    });
    return { shifts, hours, budget, gaps, trimmed, stuck };
  }, [week]);

  /* ⚠️ THE ONE THING A LEADER MUST SEE BEFORE PRESSING BUILD. An unanswered
     request does not block the schedule (see timeOff.js), so anybody on this
     list gets scheduled on days they believe they asked off. Answering them is
     the difference between a week that is right and a week that looks right. */
  /* Approved time off for the whole week in one pass, keyed by date, so the
     grid can say "Time off" in an empty cell without asking per cell. */
  const offByDate = useMemo(
    () => offIdsByDate(timeOff, dates.map((d) => d.iso)),
    [timeOff, dates],
  );

  const stillWaiting = useMemo(
    () => pendingInDates(timeOff, dates.map((d) => d.iso)),
    [timeOff, dates],
  );

  /* ⚠️ WARNINGS NEVER CHANGE A SHIFT. A human builds, the machine warns. */
  /* The areas the key lists, in the order the boards colour them.

     ⚠️⚠️ ONE LIST PER SIDE, AND THAT IS NOT PRESENTATION. `StationBoard` gets
     `order={sectionsOf(stations.<side>)}`, so a section is indexed WITHIN ITS
     OWN SIDE — front-of-house's first area and back-of-house's first area are
     both index 0 and both the same colour, on purpose, because the two boards
     are never on screen together.

     🐛 The first version of this concatenated both sides into one deduped run.
     It happened to agree with the boards only because this store has exactly
     ten kitchen sections, so the front ones landed on a clean wrap of the
     ten-hue palette. With nine kitchen sections every front area in the key
     would have been one hue off from the stripe it was explaining — a legend
     confidently disagreeing with its own screen, which is the one thing a
     legend must never do. */
  const keySections = useMemo(
    () => SIDE_ORDER.map((side) => ({ side, names: sectionsOf(storeCfg(`stations.${side}`) || {}) }))
      .filter((g) => g.names.length),
    [],
  );

  const warnings = useMemo(
    () => (week ? warningsForWeek({ week, avail, skills, minors, timeOff, terminated, minorRules, school }) : []),
    [week, avail, skills, minors, timeOff, terminated, minorRules, school],
  );
  const rows = useMemo(() => (week ? gridRows(week, dates) : []), [week, dates]);

  /* ══════════════════════════════════════════════════════════════════════
     ★★ EVERY PERSON'S HOURS FOR THE WHOLE WEEK, id → hours.

     Matt, Aug 14 2026: "ill need to see a team members total hrs for the week
     as well." The Week grid already had it in its right-hand column; the DAY
     view and the shift editor did not, and those are the two places a change to
     somebody's hours is actually made. Seeing "9 hours" while editing tells you
     nothing about whether it tips them into overtime.

     ⚠️ BUILT FROM `rows`, WHICH IS BUILT FROM THE WEEK, rather than from
     `week.weekMinutes`. The stored minutes are what the BUILDER produced; the
     rows are what is on screen now, including every hand edit made since. Two
     numbers for one person's week — one of them stale the moment anybody typed
     — is worse than no number at all (design rule 8).
     ⚠️ HOURS, NOT MINUTES, because every caller shows hours and three separate
     `/60`s is three places to forget one. */
  const weekHoursById = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => m.set(String(r.id), r.minutes / 60));
    return m;
  }, [rows]);

  /* ⚠️ THE CAP COMES FROM THE ENGINE'S OWN RULES, never retyped. It is 40 here
     today and a store that changes it must not have to find this line too. */
  const weekCap = DEFAULT_RULES.maxWeekHours;
  const manualCount = useMemo(() => {
    let n = 0;
    Object.values(keepFromWeek(week || {})).forEach((bySide) =>
      Object.values(bySide).forEach((list) => { n += list.length; }));
    return n;
  }, [week]);

  /* ★★ THE MONEY STRIP. Hours per daypart for everybody; dollars and labour
     percent for the wage list only.
     ⚠️ `unknown` IS SHOWN, NOT SWALLOWED. People with no rate and no store
     default are counted and their hours are NOT in the dollars, so a total is
     never quietly short. `estimated` counts anybody priced from a salary or
     from the default. A labour percent built on either says so. */
  const moneyByDay = useMemo(() => {
    if (!week || !week.days) return {};
    const out = {};
    dates.forEach(({ day, iso }) => {
      const d = week.days[day];
      if (!d) return;
      const shifts = SIDE_ORDER.flatMap((sd) => ((d.sides || {})[sd] || {}).shifts || []);
      const hours = shifts.reduce((t, x) => t + (x.end - x.start), 0) / 60;
      const parts = daypartHours(shifts, DAYPARTS);
      const cost = canSeeWages ? costOf(personHours(shifts), pay, payDefault) : null;
      const forecast = (budgets[iso] || {}).forecast || 0;
      out[day] = {
        hours, parts, cost, forecast,
        pct: cost && forecast > 0 ? (cost.dollars / forecast) * 100 : null,
      };
    });
    return out;
  }, [week, dates, budgets, pay, payDefault, canSeeWages]);

  const weekMoney = useMemo(() => {
    const days = Object.values(moneyByDay);
    const hours = days.reduce((t, d) => t + d.hours, 0);
    const dollars = days.reduce((t, d) => t + ((d.cost && d.cost.dollars) || 0), 0);
    const forecast = days.reduce((t, d) => t + (d.forecast || 0), 0);
    const unknown = days.reduce((t, d) => t + ((d.cost && d.cost.unknown) || 0), 0);
    const estimated = days.reduce((t, d) => t + ((d.cost && d.cost.estimated) || 0), 0);
    return { hours, dollars, forecast, unknown, estimated, pct: forecast > 0 ? (dollars / forecast) * 100 : null };
  }, [moneyByDay]);

  const noInputs = !loading && Object.keys(avail.people || {}).length === 0;

  /* ⚠️ EVERY HOOK IS ABOVE THIS LINE (check 2). */
  if (loading) return <div className="p-6 text-sm text-slate-500">Loading…</div>;


  return (
    <div className="mx-auto max-w-5xl p-4 pb-24">
      <div className="mb-4 flex items-start gap-3">
        <div className="shrink-0 rounded-xl p-2" style={{ background: INK }}>
          <CalendarRange className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight text-slate-900">Schedule</h1>
          <p className="text-sm" style={{ color: GRAY }}>
            Builds the week from availability, skills and the labor projection.
          </p>
        </div>
      </div>

      {!canBuild ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" style={{ color: GRAY }}>
          You can read this week. Building and editing it is Bri, Hannah and Matt.
        </div>
      ) : null}

      {err ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm" style={{ color: RED }}>
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{err}</span>
        </div>
      ) : null}

      {statusUnread ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Could not read who has left the team, so nobody is being excluded for that reason.
          Check any name you do not recognise before you publish.
        </div>
      ) : null}

      {stillWaiting.length ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <Plane className="h-4 w-4" />
            {stillWaiting.length} time off request{stillWaiting.length === 1 ? "" : "s"} for this week
            {stillWaiting.length === 1 ? " has" : " have"} not been answered.
          </div>
          <div>
            {stillWaiting.slice(0, 6).map((r) => `${r.name} (${fmtRange(r)})`).join(" · ")}
            {stillWaiting.length > 6 ? ` … ${stillWaiting.length - 6} more` : ""}
          </div>
          <div className="mt-1 text-xs">
            Waiting is not off. Everyone above will be scheduled as normal until somebody
            answers, in Availability &amp; Skills → Time off.
          </div>
        </div>
      ) : null}

      {noInputs ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Nobody has availability set yet, so there is nothing to build a week from.
          Open Availability &amp; Skills and import it first.
        </div>
      ) : null}

      {/* week picker */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-white p-3" style={{ boxShadow: CARD_3D, ...accentEdge(ACCENT_NEUTRAL) }}>
        <button onClick={() => setMonday((m) => addDays(m, -7))} className="rounded-lg border border-slate-300 p-2 hover:bg-slate-50">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="font-semibold text-slate-900">Week of {weekLabel}</div>
          <div className="text-xs" style={{ color: GRAY }}>
            {savedAt ? `Saved ${new Date(savedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : week ? "Not saved yet" : "No schedule built"}
          </div>
          {/* ★ WHO TURNED UP, once anybody has marked a shift.
              ⚠️ HOW MUCH OF THE WEEK HAS BEEN LOOKED AT COMES FIRST. "2 to look
              at" over a week marked 4% through would read as a quiet week, and
              it would be a week nobody checked. It says nothing at all until a
              leader has marked something, so an untouched week is silent
              rather than accusing. */}
          {attSum && attSum.marked ? (
            <div className="text-[11px]" style={{ color: attSum.concerns ? AMBER : GRAY }}>
              {attSum.marked} of {attSum.shifts} shifts checked
              {attSum.concerns
                ? ` · ${attSum.concerns} to look at${attSum.noshow ? ` (${attSum.noshow} no show)` : ""}`
                : " · all good so far"}
            </div>
          ) : null}
        </div>
        <button onClick={() => setMonday((m) => addDays(m, 7))} className="rounded-lg border border-slate-300 p-2 hover:bg-slate-50">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* ══ THE ACTION ROW ══════════════════════════════════════════════════
          ⚠️⚠️ REBUILT Aug 14 2026 BECAUSE OF HOW IT FELT, NOT BECAUSE IT WAS
          BROKEN. Matt, before this goes past the four people testing it: "I want
          to make sure the interface is user friendly and looks good before
          rolling 100% out." Every button below did exactly what it said. Three
          things about the row were still wrong on a phone mid-rush:

          1. FOUR BUTTONS, ONE FLAT ROW, THREE IDENTICAL. Publish (reaches ~106
             phones) and Send hours (overwrites the planner) were the same grey
             outline as Save. The two that reach outside this screen looked like
             the one that does not.
          2. THE ORDER FOUGHT THE JOB. It ran Build, Publish, Send hours, Save —
             but Publish is disabled until you SAVE, so the button you must press
             second was last and the one you cannot press yet was second.
          3. THE STATUS SENTENCES WERE SIBLINGS OF THE BUTTONS in the same wrap
             container, so on a narrow screen "Trimmed 6h of slack to hit the
             plan" landed BETWEEN two buttons.

          ⇒ Numbered steps in the order the work happens, the outward-facing one
          marked, and every sentence moved below the buttons.
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={build}
            disabled={building || noInputs || !canBuild}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
            style={!building && !noInputs ? { background: INK } : null}
          >
            {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {week ? "Build it again" : "Build the week"}
          </button>

          {week ? (
            <button
              onClick={save}
              disabled={saving || !canBuild}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />{saving ? "Saving…" : savedAt ? "Save again" : "Save this week"}
            </button>
          ) : null}

          {/* ⚠️ AMBER AND FILLED, BECAUSE IT LEAVES THE BUILDING. This is the
              only control on the screen that reaches a person who is not
              looking at it. It should not be able to be mistaken for Save. */}
          {week ? (
            <button
              onClick={publish}
              disabled={publishing || !canBuild || !savedAt}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
              style={!publishing && canBuild && savedAt ? { background: AMBER } : null}
            >
              <Send className="h-4 w-4" />{publishing ? "Sending…" : "Publish to the team"}
            </button>
          ) : null}
        </div>

        {/* ⚠️ THE REASON A DISABLED BUTTON IS DISABLED, IN TEXT. It used to be a
            `title` tooltip, and a tooltip does not exist on an iPad — so on the
            device this is actually used on, Publish was a dead grey button with
            no explanation anywhere. */}
        {week && !savedAt ? (
          <div className="mt-2 text-sm" style={{ color: GRAY }}>
            Save the week before you can publish it.
          </div>
        ) : null}

        {/* ★ THE HOURS GO BACK TO THE PLANNER. Matt, Aug 13 2026: "the
            sechedule would need to talk to the labor planner as well", then
            "overwrite it with the button".
            ⚠️ A BUTTON, NEVER A SIDE EFFECT OF SAVING, and now on its own line
            below the three that are the main sequence. It is a side errand, not
            step four, and sitting in the main row implied it was. */}
        {week ? (
          <div className="mt-2">
            <button
              onClick={pushHours}
              disabled={pushing || !canBuild}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              <Wand2 className="h-4 w-4" />{pushing ? "Sending…" : "Send these hours to the Labor Planner"}
            </button>
          </div>
        ) : null}

        {/* ── what just happened, and what the week came out as ───────────
            All of it below the buttons now, one line each, so nothing can wrap
            into the middle of the controls. */}
        {published ? <div className="mt-2 text-sm" style={{ color: GREEN }}>{published}</div> : null}
        {pushed ? <div className="mt-2 text-sm" style={{ color: GREEN }}>{pushed}</div> : null}

        {totals ? (
          <div className="mt-2 text-sm" style={{ color: GRAY }}>
            {totals.shifts} shifts · {hrs(totals.hours)}
            {totals.budget > 0 ? ` of ${hrs(totals.budget)} budget` : " (no projection)"}
            {totals.gaps ? ` · ${totals.gaps} uncovered spans` : " · fully covered"}
          </div>
        ) : null}

        {/* ★ WHAT THE TRIM DID, SAID OUT LOUD. Matt: "I want this smart" and
            "adjust based on goals in the planner". A week that quietly came out
            smaller than expected is the thing that makes a leader distrust the
            build, so the number it removed and the number it could not are both
            on screen. */}
        {totals && (totals.trimmed > 0 || totals.stuck > 0) ? (
          <div className="mt-1 text-sm" style={{ color: totals.stuck ? AMBER : GREEN }}>
            {totals.trimmed > 0 ? `Trimmed ${hrs(totals.trimmed)} of slack to hit the plan` : "No slack left to trim"}
            {totals.stuck > 0
              ? ` · ${totals.stuck} day${totals.stuck === 1 ? "" : "s"} still over with no slack left, so that is your call`
              : ""}
          </div>
        ) : null}
      </div>

      {/* ── the money strip ─────────────────────────────────────────────
          Matt's brief calls this the clearest edge we have: Nation shows
          store-level labour only, HotSchedules shows a snapshot after the
          fact. This moves while you place a shift. */}
      {week && week.days ? (
        <div className="mb-4 rounded-xl bg-white p-3" style={{ boxShadow: CARD_3D, ...accentEdge(ACCENT_NEUTRAL) }}>
          <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-semibold text-slate-900">This week</span>
            <span className="text-sm" style={{ color: GRAY }}>{hrs(weekMoney.hours)} scheduled</span>
            {canSeeWages ? (
              <>
                <span className="text-sm font-medium text-slate-900">
                  ${Math.round(weekMoney.dollars).toLocaleString()}
                </span>
                {weekMoney.pct != null ? (
                  <span className="text-sm font-medium" style={{ color: weekMoney.pct > 30 ? AMBER : GREEN }}>
                    {weekMoney.pct.toFixed(1)}% of sales
                  </span>
                ) : (
                  <span className="text-sm" style={{ color: GRAY }}>no sales projection</span>
                )}
                {weekMoney.estimated ? (
                  <span className="text-xs" style={{ color: AMBER }}>
                    estimated — {weekMoney.estimated} priced from a salary or the default rate
                  </span>
                ) : null}
                {weekMoney.unknown ? (
                  <span className="text-xs" style={{ color: RED }}>
                    {weekMoney.unknown} with no rate at all, their hours are NOT in this total
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-xs" style={{ color: GRAY }}>Wages are Hannah, Matt and Nick.</span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr style={{ color: GRAY }}>
                  <th className="py-1 text-left font-medium">Day</th>
                  {DAYPARTS.map((p) => <th key={p.key} className="py-1 text-right font-medium">{p.label}</th>)}
                  <th className="py-1 text-right font-medium">Hours</th>
                  {canSeeWages ? <th className="py-1 text-right font-medium">Cost</th> : null}
                  {canSeeWages ? <th className="py-1 text-right font-medium">Labor %</th> : null}
                </tr>
              </thead>
              <tbody>
                {dates.map(({ day, date }) => {
                  const m = moneyByDay[day];
                  if (!m) return null;
                  return (
                    <tr key={day} className="border-t border-slate-100">
                      <td className="py-1 font-medium text-slate-900">{prettyDay(date)}</td>
                      {DAYPARTS.map((p) => (
                        <td key={p.key} className="py-1 text-right" style={{ color: GRAY }}>
                          {(m.parts[p.key] || 0).toFixed(1)}
                        </td>
                      ))}
                      <td className="py-1 text-right text-slate-900">{m.hours.toFixed(1)}</td>
                      {canSeeWages ? (
                        <td className="py-1 text-right text-slate-900">
                          ${Math.round((m.cost && m.cost.dollars) || 0).toLocaleString()}
                        </td>
                      ) : null}
                      {canSeeWages ? (
                        <td className="py-1 text-right" style={{ color: m.pct == null ? GRAY : m.pct > 30 ? AMBER : GREEN }}>
                          {m.pct == null ? "—" : `${m.pct.toFixed(1)}%`}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-1 text-xs" style={{ color: GRAY }}>
            Daypart columns are hours. Night runs from 5pm to whenever the last shift ends,
            because the store does not close at the same time every day.
          </div>
        </div>
      ) : null}

      {/* ★ THE KEY, above the week rather than buried under it. Somebody who
          does not know what a mark means is looking at the top of the screen,
          not the bottom. Closed by default, so it costs one line. */}
      {week && week.days ? <BoardKey sections={keySections} /> : null}

      {/* view switch */}
      {week && week.days ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {[["days", "By day"], ["grid", "Week grid"]].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={"rounded-lg px-3 py-1.5 text-sm font-medium " + (view === id ? "text-white" : "border border-slate-200 bg-white text-slate-600")}
              style={view === id ? { background: INK } : null}
            >
              {label}
            </button>
          ))}
          {manualCount ? (
            <span className="text-sm" style={{ color: GREEN }}>
              {manualCount} hand edit{manualCount === 1 ? "" : "s"} kept through rebuilds
            </span>
          ) : null}
          {warnings.length ? (
            <span className="text-sm" style={{ color: warnings.some((w) => w.level === LEVEL.BLOCK) ? RED : AMBER }}>
              {warnings.length} warning{warnings.length === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="text-sm" style={{ color: GREEN }}>No warnings</span>
          )}
        </div>
      ) : null}

      {/* ── the week grid ─────────────────────────────────────────────────
          Rows are people, columns are days. Tap a cell to change a shift.
          ⚠️ EVERY EDIT IS A WARNING AT MOST, NEVER A REFUSAL. The leader owns
          the final shift; this only ever tells them what it can see. */}
      {week && week.days && view === "grid" ? (
        <div className="rounded-xl bg-white p-3" style={{ boxShadow: CARD_3D, ...accentEdge(ACCENT_NEUTRAL) }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white px-2 py-2 text-left font-semibold text-slate-900">Person</th>
                  {dates.map(({ day, date }) => (
                    <th key={day} className="px-1 py-2 text-center font-semibold text-slate-700">
                      {day}<div className="text-xs font-normal" style={{ color: GRAY }}>{date.getMonth() + 1}/{date.getDate()}</div>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right font-semibold text-slate-700">Hrs</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const wk = r.minutes / 60;
                  return (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="sticky left-0 z-10 bg-white px-2 py-1.5 font-medium text-slate-900">{r.name}</td>
                      {dates.map(({ day, iso }) => {
                        const cells = r.cells[day] || [];
                        const note = cellNote(avail.people[r.id], day, (offByDate[iso] || new Set()).has(r.id));
                        const cw = forCell(warnings, r.id, day);
                        const lvl = worstLevel(cw);
                        const tone = lvl === LEVEL.BLOCK ? "bg-red-50 text-red-800"
                          : lvl === LEVEL.WARN ? "bg-amber-50 text-amber-900"
                            : cells.length ? "bg-slate-50 text-slate-700" : "";
                        return (
                          <td key={day} className="px-1 py-1 text-center align-top">
                            {cells.map((sh) => (
                              <button
                                key={`${sh.side}-${sh.start}`}
                                title={cw.map((w) => w.message).join(" · ")}
                                onClick={() => canBuild && setEditing({
                                  day, side: sh.side, id: r.id, name: r.name,
                                  startText: minToInput(sh.start), endText: minToInput(sh.end),
                                  job: sh.job, skillWord: sh.skillWord, isNew: false,
                                  /* ⚠️ WHERE IT CAME FROM, frozen at open.
                                     `side` above is what the dropdown edits;
                                     this is what the shift must be REMOVED from
                                     when the two differ. Without it, changing
                                     the side left the original behind and put
                                     one person on two boards at once. */
                                  fromSide: sh.side,
                                })}
                                className={`mb-0.5 block w-full rounded px-1 py-1 text-xs leading-tight ${tone} hover:ring-1 hover:ring-slate-300`}
                              >
                                {/* ⚠️ THE JOB FIRST, because that is what a leader
                                    scans for. Their grid leads with it too, and the
                                    shift has carried `job` since the engine was
                                    built — it was simply never drawn. */}
                                {sh.job ? (
                                  <div className="truncate font-semibold">{sh.job}</div>
                                ) : null}
                                {fmtMin(sh.start)}-{fmtMin(sh.end)}
                                {/* ★ SKILL LEVEL SHOWS. Matt, Aug 13 2026: "i want
                                    the skill levels to show". It rides on the shift
                                    already, so nothing new is stored or looked up. */}
                                <div className="text-[10px] opacity-70">
                                  {sh.side}
                                  {sh.skillWord ? ` · ${sh.skillWord}` : ""}
                                  {sh.manual ? " · edited" : ""}
                                </div>
                              </button>
                            ))}
                            {cells.length === 0 ? (
                              <button
                                onClick={() => canBuild && setEditing({
                                  day, side: "FOH", id: r.id, name: r.name,
                                  startText: "06:00", endText: "14:00", isNew: true,
                                })}
                                className="group w-full rounded px-1 py-1 text-[10px] leading-tight hover:bg-slate-50"
                                title={canBuild ? "Add a shift" : ""}
                              >
                                {/* ⚠️ WHY IT IS EMPTY, NOT JUST THAT IT IS. See
                                    cellNote — a blank cell told a leader nothing,
                                    and "nobody can work" and "nobody has been
                                    asked" want opposite responses. */}
                                <span className={NOTE_TONE[note.tone]}>{note.text}</span>
                                <Plus className="mx-auto mt-0.5 h-3 w-3 text-slate-200 group-hover:text-slate-500" />
                              </button>
                            ) : null}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-right" style={{ color: wk > 40 ? RED : GRAY }}>{wk.toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* add somebody who is not on the week at all */}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="text-sm" style={{ color: GRAY }}>Add someone:</span>
            <select
              value={addWho}
              onChange={(e) => { const v = e.target.value; setAddWho(v); }}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">Pick a person</option>
              {roster
                .filter((p) => p && p.name && !rows.some((r) => String(r.id) === String(p.id)))
                .sort((a, b) => String(a.name).localeCompare(String(b.name)))
                .map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
            </select>
            <button
              disabled={!addWho}
              onClick={() => {
                const p = roster.find((x) => String(x.id) === String(addWho));
                if (!p) return;
                setEditing({
                  day: dates[0].day, side: "FOH", id: String(p.id), name: p.name,
                  startText: "06:00", endText: "14:00", isNew: true,
                });
                setAddWho("");
              }}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:bg-slate-300"
              style={addWho ? { background: INK } : null}
            >
              Give them a shift
            </button>
          </div>
        </div>
      ) : null}

      {/* ── the cell editor ───────────────────────────────────────────── */}
      {editing ? (
        <div className="mt-3 rounded-xl bg-white p-4" style={{ boxShadow: CARD_3D, ...accentEdge(ACCENT_NEUTRAL) }}>
          <div className="mb-2 flex flex-wrap items-center gap-2 font-semibold text-slate-900">
            <Pencil className="h-4 w-4" />
            {editing.name} · {editing.day}
            {/* ★★ WHAT THIS EDIT DOES TO THEIR WEEK, at the moment it is made.
                Matt, Aug 14 2026: "ill need to see a team members total hrs for
                the week as well." The Week grid has carried this number all
                along, in a column on a different screen — which is no use to
                somebody typing a new end time here and wondering whether it
                tips into overtime.
                ⚠️ IT IS THE WEEK AS IT STANDS, NOT AS IT WILL BE. The typed
                boxes are still strings and not yet applied; showing a predicted
                total would be a number that disagrees with the grid until Save
                is pressed. It says "so far", which is true either way. */}
            {weekHoursById.has(String(editing.id)) ? (
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
                style={weekHoursById.get(String(editing.id)) > weekCap
                  ? { color: "#fff", background: RED }
                  : { color: GRAY, background: "#F1F5F9" }}
                title={`Cap is ${weekCap} hours`}
              >
                {weekHoursById.get(String(editing.id)).toFixed(1)}h so far this week
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Starts</span>
              <input type="time" value={editing.startText}
                onChange={(e) => { const v = e.target.value; setEditing((x) => ({ ...x, startText: v })); }}
                className="rounded-lg border border-slate-300 px-2 py-1.5" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Ends</span>
              <input type="time" value={editing.endText}
                onChange={(e) => { const v = e.target.value; setEditing((x) => ({ ...x, endText: v })); }}
                className="rounded-lg border border-slate-300 px-2 py-1.5" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Side</span>
              <select value={editing.side}
                onChange={(e) => { const v = e.target.value; setEditing((x) => ({ ...x, side: v })); }}
                className="rounded-lg border border-slate-300 px-2 py-1.5">
                {SIDE_ORDER.map((sd) => <option key={sd} value={sd}>{sd}</option>)}
              </select>
            </label>
            <button onClick={() => applyEdit(editing)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ background: INK }}>
              {editing.isNew ? "Add the shift" : "Save the change"}
            </button>
            {!editing.isNew ? (
              <button onClick={() => removeShift(editing.day, editing.side, editing.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">
                <Trash2 className="h-4 w-4" /> Remove
              </button>
            ) : null}
            <button onClick={() => setEditing(null)}
              className="rounded-lg px-3 py-2 text-sm text-slate-600">Cancel</button>
          </div>
          {forCell(warnings, editing.id, editing.day).length ? (
            <ul className="mt-3 list-inside list-disc text-sm" style={{ color: AMBER }}>
              {forCell(warnings, editing.id, editing.day).map((w, i) => <li key={i}>{w.message}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* the week, by day */}
      {week && week.days && view === "days" ? (
        <div className="space-y-3">
          {dates.map(({ day, date, iso }) => {
            const d = week.days[day];
            if (!d) return null;
            const open = openDay === day;
            const dayHours = SIDE_ORDER.reduce((a, s) => a + ((d.sides[s] || {}).hours || 0), 0);
            const dayBud = SIDE_ORDER.reduce((a, s) => a + (Number((d.sides[s] || {}).budget) || 0), 0);
            const dayGaps = SIDE_ORDER.reduce((a, s) => a + ((d.sides[s] || {}).gaps || []).length, 0);
            const over = dayBud > 0 ? dayHours - dayBud : 0;
            return (
              <div key={day} className="overflow-hidden rounded-xl bg-white" style={{ boxShadow: CARD_3D, ...accentEdge(ACCENT_NEUTRAL) }}>
                <button
                  onClick={() => setOpenDay(open ? null : day)}
                  className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div className="w-28 shrink-0 font-semibold text-slate-900">{prettyDay(date)}</div>
                  <div className="text-sm" style={{ color: GRAY }}>
                    {SIDE_ORDER.map((s) => `${s} ${(d.sides[s] || { shifts: [] }).shifts.length}`).join(" · ")}
                  </div>
                  <div className="text-sm" style={{ color: GRAY }}>{hrs(dayHours)}</div>
                  {dayBud > 0 ? (
                    <div className="text-sm" style={{ color: over > 0 ? AMBER : GREEN }}>
                      {over > 0 ? `${hrs(over)} over budget` : `${hrs(-over)} under budget`}
                    </div>
                  ) : (
                    <div className="text-sm" style={{ color: GRAY }}>no projection</div>
                  )}
                  {dayGaps ? (
                    <div className="text-sm" style={{ color: RED }}>{dayGaps} uncovered</div>
                  ) : null}
                  {/* ⚠️ DEDUPED BY ID. Somebody approved off is refused by BOTH
                      sides, so they appear in two `unusable` lists and a raw
                      count reads double. */}
                  {(() => {
                    const offIds = new Set();
                    SIDE_ORDER.forEach((sd) => ((d.sides[sd] || {}).unusable || [])
                      .forEach((u) => { if (u.why === "time off approved") offIds.add(u.id); }));
                    return offIds.size
                      ? <div className="text-sm" style={{ color: GRAY }}>{offIds.size} off</div>
                      : null;
                  })()}
                  <div className="ml-auto text-xs" style={{ color: GRAY }}>{open ? "Hide" : "Show"}</div>
                </button>

                {open ? (
                  <div className="border-t border-slate-200 p-4">
                    {/* ⚠️ THE LOOK IS PER-SCREEN, NOT PER-DAY. Somebody who
                        wants the board wants it on every day they open, so this
                        sits above the sides and stays put. */}
                    <div className="mb-3 flex gap-2">
                      {[["board", "Board"], ["people", "People"]].map(([id, label]) => (
                        <button
                          key={id}
                          onClick={() => setDayLook(id)}
                          className={"rounded-lg px-3 py-1 text-xs font-medium " + (dayLook === id ? "text-white" : "border border-slate-200 bg-white text-slate-600")}
                          style={dayLook === id ? { background: INK } : null}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {/* ★★ COVERAGE FIRST, because it is the question the day
                        is opened with. Built from the SAME assignPositions
                        results the boards below render, so the dashboard and
                        the red cells can never disagree. */}
                    {(() => {
                      const byS = {}, stationsBySide = {};
                      SIDE_ORDER.forEach((side) => {
                        const sd = d.sides[side];
                        if (!sd) return;
                        const st = stationsForDate(
                          (storeCfg(`stations.${side}`) || {})[day] || [], storeHours, iso,
                          { clampStart: side !== "BOH" });
                        stationsBySide[side] = st;
                        byS[side] = assignPositions(st, sd.shifts, history);
                      });
                      return <CoveragePanel sides={byS} stationsBySide={stationsBySide} />;
                    })()}

                    {SIDE_ORDER.map((side) => {
                      const s = d.sides[side];
                      if (!s) return null;
                      const stations = stationsForDate(
                        (storeCfg(`stations.${side}`) || {})[day] || [], storeHours, iso,
                        { clampStart: side !== "BOH" });
                      const pos = assignPositions(stations, s.shifts, history);
                      return (
                        <div key={side} className="mb-5 last:mb-0">
                          <div className="mb-2 flex flex-wrap items-baseline gap-2">
                            <span className="font-semibold text-slate-900">{side}</span>
                            <span className="text-xs" style={{ color: GRAY }}>
                              {s.shifts.length} shifts · {hrs(s.hours)} · stations need {hrs(curveHours(s.need))}
                            </span>
                          </div>

                          {dayLook === "board" ? (
                            <div className="mb-3">
                              {/* ⚠️ NO SCHEDULING HAPPENS HERE. boardDay only
                                  turns assignPositions' answer sideways, so the
                                  two looks can never disagree about who is on. */}
                              {/* ⚠️ `order` IS THE SIDE'S SECTIONS, NOT THIS
                                  DAY'S. Colouring by the day's own order made a
                                  section change colour between two days when one
                                  of them was missing a section above it. See
                                  sectionsOf in storeConfig.js. */}
                              <StationBoard
                                board={boardDay({ stations, filled: pos.filled, dayparts: DAYPARTS })}
                                order={sectionsOf(storeCfg(`stations.${side}`) || {})}
                              />
                              {/* ★ Who is learning something on this side today,
                                  and who is on with them. Renders nothing when
                                  nobody is, so a store with no priority list
                                  sees the board exactly as it is now. */}
                              <TrainingPanel
                                plan={trainingPlan(pos.filled, s.shifts, history && history.memory)}
                                mode={history && history.training ? history.training.mode : "suggest"}
                              />
                              {/* ★ What to move, cut or add, off the daypart
                                  report the store already fills in.
                                  ⚠️ `plannedByPart` MAPS THE SCHEDULE'S DAYPART
                                  KEYS ONTO THE REPORT'S NAMES BY POSITION. They
                                  share not one key — breakfast/lunch/mid/night
                                  against Breakfast/Lunch/Afternoon/Dinner — so
                                  passing `daypartHours` straight in would find
                                  nothing and this panel would be empty for ever,
                                  silently. See the note in laborAdvice.js.
                                  ⚠️ FOH ONLY WOULD BE WRONG: the daypart report
                                  is whole-store sales and hours, so the advice
                                  is drawn once, under the first side. */}
                              {side === SIDE_ORDER[0] && history && history.month ? (
                                <HoursPanel
                                  dayName={day}
                                  /* ⚠️⚠️ BOTH SIDES' STATIONS, NOT THIS ONE'S.
                                     The advice is whole-store, so the station it
                                     names to cut from could be either side.
                                     🐛 THE FIRST VERSION PASSED `stations`, the
                                     side being drawn — and `SIDE_ORDER[0]` is
                                     **BOH**, so the panel silently offered to cut
                                     from the kitchen's rankings while quoting
                                     front-of-house sales. It showed no station at
                                     all in testing, which is how it was caught;
                                     with a fuller history it would have shown a
                                     confidently wrong one. */
                                  stations={SIDE_ORDER.flatMap((sd) => stationsForDate(
                                    (storeCfg(`stations.${sd}`) || {})[day] || [], storeHours, iso,
                                    { clampStart: sd !== "BOH" }))}
                                  load={history.load}
                                  advice={adviceForDay({
                                    month: history.month,
                                    goals: goalsFromHistory([history.month]),
                                    dayIndex: adviceDayIndex(day),
                                    plannedHours: plannedByPart(
                                      wholeStoreDaypartHours(d.sides), DAYPARTS, history.month),
                                  })}
                                />
                              ) : null}
                            </div>
                          ) : null}

                          <div className={(dayLook === "board" ? "hidden " : "") + "mb-3 grid gap-1 sm:grid-cols-2"}>
                            {s.shifts.map((sh) => {
                              const row = pos.rows.find((r) => r.id === sh.id);
                              return (
                                <div key={`${sh.id}-${sh.start}`} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                                  <div className="flex items-baseline justify-between gap-2">
                                    <span className="font-medium text-slate-900">{sh.name}</span>
                                    <span style={{ color: GRAY }}>{fmtMin(sh.start)}-{fmtMin(sh.end)}</span>
                                  </div>
                                  {/* ★ THEIR WHOLE WEEK, beside the one day. A
                                      leader reading a day cannot otherwise tell
                                      a five hour shift from the one that tips
                                      somebody into overtime. Red at the cap,
                                      which is the engine's own number. */}
                                  {weekHoursById.has(String(sh.id)) ? (
                                    <div className="text-[11px] font-semibold tabular-nums"
                                      style={{ color: weekHoursById.get(String(sh.id)) > weekCap ? RED : GRAY }}>
                                      {weekHoursById.get(String(sh.id)).toFixed(1)}h this week
                                    </div>
                                  ) : null}
                                  <div className="text-xs" style={{ color: GRAY }}>
                                    {row && row.blocks.length
                                      ? row.blocks.map((b) => `${b.job} ${fmtMin(b.start)}`).join(" → ")
                                      : "no position"}
                                  </div>
                                  {/* ★★ DID THEY TURN UP. Matt, Aug 14 2026,
                                      on the gap against the three big platforms:
                                      without this nothing can say whether the
                                      week that was built is the week that
                                      happened.
                                      ⚠️ IT IS A LEADER'S MARK, NOT A CLOCK. No
                                      minute is recorded and nothing here is pay
                                      data — the store's real clock is the POS.
                                      ⚠️ AND IT FIRES NOTHING. HR Console holds
                                      this store's attendance ladder with
                                      Hannah's own point values. A mark is a
                                      note beside a shift; filing the infraction
                                      is still a person's decision, made there.
                                      ⚠️ UNMARKED IS THE DEFAULT AND MEANS
                                      "nobody looked", never "they were absent". */}
                                  {canBuild ? (() => {
                                    const k = keyOfShift({ day, side, id: sh.id, start: sh.start });
                                    const cur = statusOf(att, k);
                                    return (
                                      <div className="mt-1.5 flex flex-wrap gap-1">
                                        {STATUSES.map((st) => (
                                          <button
                                            key={st}
                                            onClick={() => mark(k, cur === st ? "" : st)}
                                            disabled={attBusy}
                                            title={cur === st ? "Tap again to clear" : ""}
                                            className={"rounded-full px-2 py-0.5 text-[10px] font-semibold disabled:opacity-40 "
                                              + (cur === st ? "text-white" : "border border-slate-200 bg-white text-slate-500")}
                                            style={cur === st
                                              ? { background: st === "here" ? GREEN : st === "noshow" ? RED : AMBER }
                                              : null}
                                          >
                                            {STATUS_LABEL[st]}
                                          </button>
                                        ))}
                                      </div>
                                    );
                                  })() : null}
                                </div>
                              );
                            })}
                          </div>

                          {/* ⚠️ NOT REPEATED UNDER THE BOARD. In board mode every
                              one of these is already drawn in red on the station
                              it belongs to, which is where somebody fixing it is
                              looking. Printing the list underneath as well made
                              one problem look like two. */}
                          {pos.holes.length && dayLook !== "board" ? (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs" style={{ color: RED }}>
                              <div className="mb-1 font-medium">Stations with nobody on them:</div>
                              {pos.holes.slice(0, 10).map((h, i) => (
                                <div key={i}>{h.station} {fmtMin(h.start)}-{fmtMin(h.end)}</div>
                              ))}
                              {pos.holes.length > 10 ? <div>… {pos.holes.length - 10} more</div> : null}
                            </div>
                          ) : null}

                          {s.unusable && s.unusable.length ? (
                            <div className="mt-2 text-xs" style={{ color: GRAY }}>
                              {s.unusable.filter((u) => u.why.startsWith("no availability")).length} with no availability set ·{" "}
                              {s.unusable.filter((u) => u.why.startsWith("no skills")).length} not trained on {side}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
