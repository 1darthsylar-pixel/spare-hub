/* ══════════════════════════════════════════════════════════════════════════
   SchoolDates.jsx — TAP THE DAYS SCHOOL IS OUT.

   ★ ITS OWN FILE WITH A ONE-LINE HOOK, same as PayRates.jsx and
   TeamDetails.jsx. The tile that mounts it is already long and this panel owns
   one subject, so the smallest footprint over there is the safest change here.

   ⚠️⚠️ IT OWNS NO STORAGE. The parent holds the school record and writes it,
   because the MEMBER LIST IMPORT WRITES THE SAME KEY. Two writers to one key
   is how a re-import of the member list silently wipes a year of tapping, so
   there is exactly one writer and this panel hands it a finished record.

   ⚠️ THE DATE MATHS IS ALL IN schoolCalendar.js AND NONE OF IT IS REPEATED
   HERE. That file is a near-leaf so the scheduling engine can ask "is school
   in" without dragging React in. Nothing in this file may build a Date from an
   ISO string — see the no-Date warning at the top of that file for what the
   alternative costs in this timezone.

   ⚠️ THE MODEL IS THE ONE MATT ALREADY USES. His HotSchedules screen reads
   "Selected non school days": school is IN across the term and you tap the days
   it is OUT. Weekends are never school and are never stored, so nobody taps
   eighty Saturdays.
   ══════════════════════════════════════════════════════════════════════════ */

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, GraduationCap } from "lucide-react";
import { toolCard } from "./cardStyle.js";

/* ★ LINEUP'S OWN COLOUR, not the neutral navy a card with nothing to say
   gets. Matt, Aug 14 2026, naming the tabs one at a time: "Time off /
   School / Minors / Hours these need a look upgrade".
   ⚠️ THE SAME HEX Availability.jsx AND App.jsx GIVE THIS TILE. Duplicated
   rather than imported because App.jsx is a component and importing one
   component into another is how the cycle this repo keeps hitting returns.
   If the tile colour moves, it moves in all three. */
const TILE = "#0E7490";
import {
  SCHOOL_STATE, readSchool, hasTerm, schoolDayState, monthMatrix,
  schoolDayCount, setTerm, toggleOffDate, setRange,
} from "./schoolCalendar.js";

const GRAY = "#6B7480";
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

/* ── module-level pure helpers (rule 7) ────────────────────────────────── */

const ymOfIso = (iso) => {
  const [y, m] = String(iso || "").split("-").map(Number);
  return Number.isFinite(y) && Number.isFinite(m) ? { y, m } : null;
};

const stepMonth = ({ y, m }, n) => {
  let mm = m + n, yy = y;
  while (mm > 12) { mm -= 12; yy += 1; }
  while (mm < 1) { mm += 12; yy -= 1; }
  return { y: yy, m: mm };
};

/* How each cell looks. One place, so the legend below cannot drift from the
   grid above it — the project rules call that mismatch out by name: an editor
   and a renderer that disagree because they live in two files. */
const CELL = {
  [SCHOOL_STATE.IN]: { bg: "#ECFDF5", fg: "#065F46", ring: "#A7F3D0", label: "School" },
  [SCHOOL_STATE.OFF]: { bg: "#FEF3C7", fg: "#92400E", ring: "#FDE68A", label: "No school" },
  [SCHOOL_STATE.WEEKEND]: { bg: "#F8FAFC", fg: "#CBD5E1", ring: "#F1F5F9", label: "Weekend" },
  [SCHOOL_STATE.BEFORE]: { bg: "#FFFFFF", fg: "#CBD5E1", ring: "#F1F5F9", label: "Outside the year" },
  [SCHOOL_STATE.AFTER]: { bg: "#FFFFFF", fg: "#CBD5E1", ring: "#F1F5F9", label: "Outside the year" },
  [SCHOOL_STATE.UNSET]: { bg: "#FFFFFF", fg: "#CBD5E1", ring: "#F1F5F9", label: "No year set" },
};

const TAPPABLE = new Set([SCHOOL_STATE.IN, SCHOOL_STATE.OFF]);

export default function SchoolDates({ cal, canEdit, onSave, busy }) {
  const school = useMemo(() => readSchool(cal), [cal]);
  const ready = hasTerm(school);

  const [at, setAt] = useState(() => {
    const s = ymOfIso(school.termStart);
    if (s) return s;
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() + 1 };
  });
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  const grid = useMemo(() => monthMatrix(at.y, at.m), [at]);
  const counted = useMemo(() => (ready ? schoolDayCount(school) : 0), [school, ready]);

  const push = (next) => { if (canEdit && typeof onSave === "function") onSave(next); };

  return (
    <div className="rounded-xl bg-white p-4" style={toolCard(TILE)}>
      <div className="mb-1 flex items-center gap-2 font-medium text-slate-900">
        <CalendarDays className="h-4 w-4" />
        School days
      </div>

      {/* ⚠️⚠️ WHY THIS IS TYPED AND NOT BUILT IN. Stated on the screen, not only
          in a comment, because the person who has to type it is the person who
          deserves the reason. */}
      <p className="mb-3 text-sm" style={{ color: GRAY }}>
        Type the first and last day of the school year, then tap the days school is out.
        Weekends are already out. Nothing here is built in on purpose: districts move
        days every year, and a calendar that is wrong by one day looks exactly like one
        that is right.
      </p>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <div className="mb-1 text-xs" style={{ color: GRAY }}>First day</div>
          <input
            type="date"
            value={school.termStart}
            disabled={!canEdit || busy}
            onChange={(e) => { const v = e.target.value; push(setTerm(school, v, school.termEnd)); }}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <div className="mb-1 text-xs" style={{ color: GRAY }}>Last day</div>
          <input
            type="date"
            value={school.termEnd}
            disabled={!canEdit || busy}
            onChange={(e) => { const v = e.target.value; push(setTerm(school, school.termStart, v)); }}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        {ready ? (
          <div className="pb-1.5 text-sm" style={{ color: GRAY }}>
            <b className="text-slate-900">{counted}</b> school days.
            {" "}Compare that against the district's own number.
          </div>
        ) : null}
      </div>

      {!ready ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No school year set. Until both dates are filled in, the Hub does not know
          which days are school days, so it checks every minor against the school day
          limits rather than guessing the looser ones.
        </div>
      ) : null}

      {ready ? (
        <>
          {/* ── the month ─────────────────────────────────────────────── */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setAt((p) => stepMonth(p, -1))}
              className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-medium text-slate-900">{MONTHS[at.m - 1]} {at.y}</div>
            <button
              type="button"
              onClick={() => setAt((p) => stepMonth(p, 1))}
              className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px]" style={{ color: GRAY }}>
            {DOW.map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {grid.flat().map((iso, i) => {
              if (!iso) return <div key={`p${i}`} />;
              const st = schoolDayState(school, iso);
              const look = CELL[st] || CELL[SCHOOL_STATE.UNSET];
              const can = canEdit && !busy && TAPPABLE.has(st);
              const dayNum = Number(iso.slice(8, 10));
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!can}
                  onClick={() => push(toggleOffDate(school, iso))}
                  title={`${iso} · ${look.label}${can ? " · tap to change" : ""}`}
                  className={"rounded-lg py-2 text-sm " + (can ? "cursor-pointer hover:opacity-80" : "cursor-default")}
                  style={{ background: look.bg, color: look.fg, border: `1px solid ${look.ring}` }}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex flex-wrap gap-3 text-xs" style={{ color: GRAY }}>
            {[SCHOOL_STATE.IN, SCHOOL_STATE.OFF, SCHOOL_STATE.WEEKEND, SCHOOL_STATE.BEFORE].map((k) => (
              <span key={k} className="flex items-center gap-1">
                <span
                  className="inline-block h-3 w-3 rounded"
                  style={{ background: CELL[k].bg, border: `1px solid ${CELL[k].ring}` }}
                />
                {CELL[k].label}
              </span>
            ))}
          </div>

          {/* ── a whole break at once ─────────────────────────────────────
              A school year holds four or five week-long breaks. Tapping each
              one five times is how a screen stops getting used. */}
          {canEdit ? (
            <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
              <div className="text-xs" style={{ color: GRAY }}>A whole break at once</div>
              <input
                type="date"
                value={rangeFrom}
                onChange={(e) => { const v = e.target.value; setRangeFrom(v); }}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
              />
              <input
                type="date"
                value={rangeTo}
                onChange={(e) => { const v = e.target.value; setRangeTo(v); }}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
              />
              <button
                type="button"
                disabled={!rangeFrom || !rangeTo || busy}
                onClick={() => push(setRange(school, rangeFrom, rangeTo, true))}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:bg-slate-300"
              >
                Mark off
              </button>
              <button
                type="button"
                disabled={!rangeFrom || !rangeTo || busy}
                onClick={() => push(setRange(school, rangeFrom, rangeTo, false))}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-40"
              >
                Put back
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {/* Who this calendar covers. The member list is imported on the tab
          above; this is only the count, so the two cannot disagree. */}
      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 text-sm" style={{ color: GRAY }}>
        <GraduationCap className="h-4 w-4" />
        {school.ids.length} {school.ids.length === 1 ? "person is" : "people are"} on this calendar
        {school.title ? ` (${school.title})` : ""}.
      </div>
    </div>
  );
}
