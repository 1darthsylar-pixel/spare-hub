/* ══════════════════════════════════════════════════════════════════════════
   MinorRules.jsx — TYPE THE HOUR LIMITS FOR MINORS, AND SAY WHERE THEY CAME
   FROM.

   ★ ITS OWN FILE WITH A ONE-LINE HOOK, same as PayRates.jsx, TeamDetails.jsx
   and SchoolDates.jsx.

   ⚠️⚠️ IT OWNS NO STORAGE. The parent writes, so there is one writer to the
   key and this panel hands it a finished record. Same reason as SchoolDates.

   ⚠️⚠️ READ THE HEADER OF minorRules.js BEFORE CHANGING ANY TEXT ON THIS
   SCREEN. Nothing here may say a schedule is legal, compliant, or that it
   meets any state's rules. Every box starts EMPTY and empty means not checked.
   The store types its own numbers off its own copy of its own state's rules,
   because the primary sources could not be reached from this network and a
   plausible wrong number is worse than a blank one.

   ⚠️ THE ACCOUNTABILITY BOX IS NOT DECORATION. `source` and "checked on" are
   the only things standing between a typed number and a number nobody can
   vouch for a year from now. They are at the TOP of the screen for that
   reason, not at the bottom.
   ══════════════════════════════════════════════════════════════════════════ */

import { useMemo, useState } from "react";
import { AlertTriangle, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toolCard } from "./cardStyle.js";

/* ★ LINEUP'S OWN COLOUR, not the neutral navy a card with nothing to say
   gets. Matt, Aug 14 2026, naming the tabs one at a time: "Time off /
   School / Minors / Hours these need a look upgrade".
   ⚠️ THE SAME HEX Availability.jsx AND App.jsx GIVE THIS TILE. Duplicated
   rather than imported because App.jsx is a component and importing one
   component into another is how the cycle this repo keeps hitting returns.
   If the tile colour moves, it moves in all three. */
const TILE = "#0E7490";
import { hoursToMin, minToInput, inputToMin } from "./availability.js";
import {
  LIMIT_FIELDS, readMinorRules, hasLimits, upsertBand, removeBand,
  setPersonBand, setSource, minorsWithoutBand,
} from "./minorRules.js";

const GRAY = "#6B7480";

/* ── module-level pure helpers (rule 7) ────────────────────────────────── */

/* Minutes → what goes in the box, and back. Blank stays blank in both
   directions: a limit nobody typed must never render as "0".
   ⚠️ `hoursToMin`, `minToInput` and `inputToMin` COME FROM availability.js,
   not from a second copy here. One definition of "what does this clock mean"
   is the whole of rule 8, and this subsystem already carries one bug from the
   same idea living in two units. */
const durToBox = (m) => (m === null || m === undefined ? "" : String(Number(m) / 60));
const boxToDur = (v) => (String(v).trim() === "" ? null : hoursToMin(v));
const clockToBox = (m) => (m === null || m === undefined ? "" : minToInput(m));
const boxToClock = (v) => (String(v).trim() === "" ? null : inputToMin(v));

const toBox = (kind, v) => (kind === "clock" ? clockToBox(v) : durToBox(v));
const fromBox = (kind, v) => (kind === "clock" ? boxToClock(v) : boxToDur(v));

export default function MinorRules({ rules, minorIds, roster, canEdit, onSave, busy, myName }) {
  const R = useMemo(() => readMinorRules(rules), [rules]);
  const [sourceDraft, setSourceDraft] = useState(null);

  const ids = useMemo(
    () => (minorIds instanceof Set ? [...minorIds] : Array.isArray(minorIds) ? minorIds.map(String) : []),
    [minorIds],
  );
  const people = useMemo(() => {
    const byId = new Map((Array.isArray(roster) ? roster : []).map((p) => [String(p.id), p]));
    return ids
      .map((id) => ({ id: String(id), name: (byId.get(String(id)) || {}).name || `#${id}` }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ids, roster]);

  const noBand = useMemo(() => minorsWithoutBand(R, ids), [R, ids]);
  const typed = hasLimits(R);

  const push = (next) => { if (canEdit && typeof onSave === "function") onSave(next); };

  return (
    <div className="rounded-xl bg-white p-4" style={toolCard(TILE)}>
      <div className="mb-1 flex items-center gap-2 font-medium text-slate-900">
        <ShieldCheck className="h-4 w-4" />
        Minor hour limits
      </div>

      {/* ⚠️⚠️ THE HONEST STATEMENT, ON THE SCREEN. */}
      <p className="mb-3 text-sm" style={{ color: GRAY }}>
        The Hub does not know your state's rules and does not try to. Type the limits
        here off your own copy of them, and the schedule will warn when a shift goes
        over. It never blocks one, and it never says a week is legal.
      </p>

      {!typed ? (
        <div className="mb-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            Nothing is typed yet, so no minor is being checked against anything. The
            schedule still flags a long or late shift for anyone on the minors list,
            which is all it could honestly do before this screen existed.
          </div>
        </div>
      ) : null}

      {/* ── where these numbers came from ───────────────────────────────── */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="mb-1 text-xs font-semibold text-slate-700">Where these came from</div>
        {sourceDraft === null ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span style={{ color: R.source ? "#14243D" : GRAY }}>
              {R.source || "Not recorded. Nobody can check a number with no source."}
            </span>
            {R.checkedAt ? (
              <span className="text-xs" style={{ color: GRAY }}>
                · checked {R.checkedAt.slice(0, 10)}{R.checkedBy ? ` by ${R.checkedBy}` : ""}
              </span>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                onClick={() => setSourceDraft(R.source)}
                className="text-xs font-semibold text-slate-900 underline"
              >
                {R.source ? "Change" : "Add"}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={sourceDraft}
              onChange={(e) => { const v = e.target.value; setSourceDraft(v); }}
              placeholder="e.g. NC Dept of Labor Youth Employment sheet, printed 8/13/26"
              className="min-w-[18rem] flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                push(setSource(R, sourceDraft, { at: new Date().toISOString(), by: myName || "" }));
                setSourceDraft(null);
              }}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:bg-slate-300"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setSourceDraft(null)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* ── the bands ───────────────────────────────────────────────────── */}
      <div className="mb-2 text-xs font-semibold text-slate-700">Age groups</div>
      <p className="mb-2 text-xs" style={{ color: GRAY }}>
        Most states split minors into two groups with different limits. Name them
        whatever your rules call them. Leave a box blank and that limit is not checked.
      </p>

      {R.bands.map((band) => (
        <div key={band.id} className="mb-3 rounded-lg border border-slate-200 p-3">
          <div className="mb-2 flex items-center gap-2">
            <input
              value={band.label}
              disabled={!canEdit || busy}
              onChange={(e) => { const v = e.target.value; push(upsertBand(R, { ...band, label: v })); }}
              placeholder="Name this group, e.g. 14 and 15"
              className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
            />
            {canEdit ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => push(removeBand(R, band.id))}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
                aria-label="Remove this group"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {LIMIT_FIELDS.map((f) => (
              <label key={f.key} className="text-sm">
                <div className="mb-1 text-xs" style={{ color: GRAY }}>
                  {f.label}{f.kind === "dur" ? " (hours)" : ""}
                </div>
                <input
                  type={f.kind === "clock" ? "time" : "number"}
                  step={f.kind === "clock" ? undefined : "0.25"}
                  min={f.kind === "clock" ? undefined : "0"}
                  value={toBox(f.kind, band[f.key])}
                  disabled={!canEdit || busy}
                  placeholder={f.kind === "clock" ? "" : "not checked"}
                  onChange={(e) => {
                    const v = e.target.value;
                    push(upsertBand(R, { ...band, [f.key]: fromBox(f.kind, v) }));
                  }}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
            ))}
          </div>
        </div>
      ))}

      {canEdit ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => push(upsertBand(R, { label: "" }))}
          className="mb-4 flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
        >
          <Plus className="h-4 w-4" /> Add an age group
        </button>
      ) : null}

      {/* ── who is in which group ───────────────────────────────────────── */}
      <div className="mb-1 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-700">
        Who is in each group
      </div>
      <p className="mb-2 text-xs" style={{ color: GRAY }}>
        This list is the minors list from Daily Setup, so there is only ever one of it.
        {" "}
        {/* ⚠️ SAID OUT LOUD RATHER THAN HIDDEN. A typed band goes stale on a
            birthday and nothing in the Hub knows that, so the screen says so
            instead of letting somebody assume it is handled. */}
        A group is typed, not worked out from a birthday, so it needs changing when
        somebody has one.
      </p>

      {people.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" style={{ color: GRAY }}>
          Nobody is on the minors list. Daily Setup is where that list is kept.
        </div>
      ) : null}

      {noBand.length && R.bands.length ? (
        <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <b>{noBand.length} {noBand.length === 1 ? "person has" : "people have"} no group</b>, so
          nothing is checked for {noBand.length === 1 ? "them" : "them"}.
        </div>
      ) : null}

      {people.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-2 last:border-0">
          <span className="truncate text-sm text-slate-900">{p.name}</span>
          <select
            value={R.people[p.id] || ""}
            disabled={!canEdit || busy || !R.bands.length}
            onChange={(e) => { const v = e.target.value; push(setPersonBand(R, p.id, v)); }}
            className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">No group</option>
            {R.bands.map((b) => (
              <option key={b.id} value={b.id}>{b.label || "Unnamed group"}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
