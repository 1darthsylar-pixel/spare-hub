/* ══════════════════════════════════════════════════════════════════════════
   StoreHours.jsx — the days this store does not keep its normal hours.

   Matt, Aug 13 2026: "for holidays we only open 10:30-4 so log that. I make
   special cuts for those days." Then: "I have a sept schedule with the actual
   holiday as well that will be coming soon."

   ⚠️ THE MATHS IS IN storeHours.js AND NOTHING HERE REPEATS IT. This screen
   loads, shows and saves. The engine reads the same module, so what a leader
   sees here and what the week is built against cannot disagree.

   ⚠️ NOTHING IS PRE-FILLED, INCLUDING THE HOURS HE TOLD ME. A placeholder that
   already says 10:30 would be a seeded value wearing a disguise: it travels
   into the next store's repo and it is believed. He types it once, on his own
   store, and then every later date is one tap.
   ══════════════════════════════════════════════════════════════════════════ */
import { useMemo, useState } from "react";
import { CalendarX2, Plus, Trash2 } from "lucide-react";
import { toolCard } from "./cardStyle.js";

/* ★ LINEUP'S OWN COLOUR, not the neutral navy a card with nothing to say
   gets. Matt, Aug 14 2026, naming the tabs one at a time: "Time off /
   School / Minors / Hours these need a look upgrade".
   ⚠️ THE SAME HEX Availability.jsx AND App.jsx GIVE THIS TILE. Duplicated
   rather than imported because App.jsx is a component and importing one
   component into another is how the cycle this repo keeps hitting returns.
   If the tile colour moves, it moves in all three. */
const TILE = "#0E7490";
import { minToInput, inputToMin, fmtMin } from "./availability.js";
import {
  readStoreHours, hoursForDate, setDate, removeDate, setDefaultWindow, upcoming,
  setStationCut, cutsOn, earlyStations,
} from "./storeHours.js";
import { dowOf } from "./schoolCalendar.js";
import { DAY_KEYS } from "./availability.js";

const INK = "#13293F", GRAY = "#6B7480", RED = "#B91C1C";

/* Module level (rule 7). Today, in the store's own clock, for "what is still
   to come" — not a date the engine ever decides anything from. */
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const prettyIso = (iso) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${MONTHS[(m || 1) - 1]} ${d}, ${y}`;
};

/* ⚠️ A DATE'S STATIONS ARE ITS WEEKDAY'S STATIONS. `stations.FOH` is keyed
   Mon..Sat, so a cut on Sep 7 is a cut on that Monday's list. `dowOf` is
   schoolCalendar's pure day-of-week, because `new Date(iso)` on a bare ISO
   string parses as UTC and lands on the wrong day west of Greenwich. */
const stationsOnDate = (stations, iso) => {
  const dow = dowOf(iso);
  if (dow < 0) return [];
  const key = DAY_KEYS[dow];
  const both = [
    ...(((stations && stations.FOH) || {})[key] || []).map((x) => ({ ...x, side: "FOH" })),
    ...(((stations && stations.BOH) || {})[key] || []).map((x) => ({ ...x, side: "BOH" })),
  ];
  return both.filter((x) => x && (x.id || x.name));
};

export default function StoreHours({ cfg, canEdit, onSave, busy, stations }) {
  const C = useMemo(() => readStoreHours(cfg), [cfg]);
  const [iso, setIso] = useState("");
  const [open, setOpen] = useState("");
  const [close, setClose] = useState("");
  const [note, setNote] = useState("");
  /* 🐛 BOTH BOXES HELD LOCALLY, AND THAT IS A FIX FOR A REAL DEADLOCK. Each
     field used to save on its own blur, and `setDefaultWindow` correctly
     refuses half a window — so the first box was refused because there was no
     close yet, and the second was refused because the first had not saved.
     Neither could ever go first and the window could never be set at all.
     Found by driving the screen, not by reading it. Rule 1 is about what
     reaches storage; a form still has to let somebody finish typing. */
  const [dOpen, setDOpen] = useState(() => minToInput(readStoreHours(cfg).defaultOpen));
  const [dClose, setDClose] = useState(() => minToInput(readStoreHours(cfg).defaultClose));
  const [closed, setClosed] = useState(false);
  const [err, setErr] = useState("");
  const [openCuts, setOpenCuts] = useState("");   // which date's station list is showing

  const rows = useMemo(() => upcoming(C, todayIso(), 24), [C]);
  const hasDefault = C.defaultOpen != null && C.defaultClose != null;

  const push = (next, whenBad) => {
    if (!next) { setErr(whenBad); return; }
    setErr("");
    onSave(next);
  };

  /* Only reaches storage once BOTH ends are typed. Half a window is not an
     error to shout about while somebody is still filling the form in. */
  const saveWindow = (o, c) => {
    if (!o || !c) { setErr(""); return; }
    const next = setDefaultWindow(C, inputToMin(o), inputToMin(c));
    if (!next) { setErr("The closing time has to be after the opening time."); return; }
    setErr("");
    onSave(next);
  };

  const add = () => {
    if (!iso) { setErr("Pick a date first."); return; }
    const entry = closed
      ? { closed: true, note }
      : { open: open ? inputToMin(open) : null, close: close ? inputToMin(close) : null, note };
    const next = setDate(C, iso, entry);
    if (!next) {
      setErr(closed
        ? "That date could not be saved."
        : "Set an opening and a closing time, or set the usual holiday hours above first.");
      return;
    }
    setErr("");
    onSave(next);
    setIso(""); setOpen(""); setClose(""); setNote(""); setClosed(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white p-4" style={toolCard(TILE)}>
        <div className="mb-1 flex items-center gap-2">
          <CalendarX2 className="h-4 w-4" style={{ color: INK }} />
          <div className="font-semibold text-slate-900">Days we do not keep normal hours</div>
        </div>
        <div className="mb-3 text-sm" style={{ color: GRAY }}>
          Holidays and any other day the store opens late or closes early. Every station's
          posted hours get cut to fit, and a station that would already be shut drops off
          the board for that day.
        </div>

        {/* The usual window, typed once. */}
        <div className="mb-3 rounded-lg bg-slate-50 p-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: GRAY }}>
            Our usual holiday hours
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <div className="mb-1 text-xs" style={{ color: GRAY }}>Open</div>
              <input
                type="time" value={dOpen} disabled={!canEdit || busy}
                onChange={(e) => { const v = e.target.value; setDOpen(v); saveWindow(v, dClose); }}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-sm">
              <div className="mb-1 text-xs" style={{ color: GRAY }}>Close</div>
              <input
                type="time" value={dClose} disabled={!canEdit || busy}
                onChange={(e) => { const v = e.target.value; setDClose(v); saveWindow(dOpen, v); }}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <div className="pb-1.5 text-xs" style={{ color: hasDefault ? GRAY : RED }}>
              {hasDefault
                ? `A date added below uses ${fmtMin(C.defaultOpen)}-${fmtMin(C.defaultClose)} unless you say otherwise.`
                : "Not set yet, so each date below needs its own times."}
            </div>
          </div>
        </div>

        {/* Add one date. */}
        {canEdit ? (
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex flex-wrap items-end gap-2">
              <label className="text-sm">
                <div className="mb-1 text-xs" style={{ color: GRAY }}>Date</div>
                <input type="date" value={iso} disabled={busy}
                  onChange={(e) => { const v = e.target.value; setIso(v); }}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              </label>
              {!closed ? (
                <>
                  <label className="text-sm">
                    <div className="mb-1 text-xs" style={{ color: GRAY }}>Open</div>
                    <input type="time" value={open} disabled={busy}
                      onChange={(e) => { const v = e.target.value; setOpen(v); }}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  </label>
                  <label className="text-sm">
                    <div className="mb-1 text-xs" style={{ color: GRAY }}>Close</div>
                    <input type="time" value={close} disabled={busy}
                      onChange={(e) => { const v = e.target.value; setClose(v); }}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  </label>
                </>
              ) : null}
              <label className="flex-1 text-sm" style={{ minWidth: 140 }}>
                <div className="mb-1 text-xs" style={{ color: GRAY }}>What it is</div>
                <input value={note} disabled={busy} placeholder="Labor Day"
                  onChange={(e) => { const v = e.target.value; setNote(v); }}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm text-slate-700">
                <input type="checkbox" checked={closed} disabled={busy}
                  onChange={(e) => { const v = e.target.checked; setClosed(v); }} />
                Closed all day
              </label>
              <button
                onClick={add}
                disabled={busy || !iso}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:bg-slate-300"
                style={!busy && iso ? { background: INK } : null}
              >
                <Plus className="h-4 w-4" /> Add this day
              </button>
            </div>
            {err ? <div className="mt-2 text-sm" style={{ color: RED }}>{err}</div> : null}
          </div>
        ) : null}
      </div>

      {/* What is coming. */}
      <div className="rounded-xl bg-white p-4" style={toolCard(TILE)}>
        <div className="mb-2 font-semibold text-slate-900">Coming up</div>
        {!rows.length ? (
          <div className="text-sm" style={{ color: GRAY }}>
            Nothing set. Every day runs its normal hours.
          </div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r) => {
              const h = r.resolved;
              const cuts = cutsOn(C, r.iso);
              const byId = Object.fromEntries(cuts.map((c) => [c.id, c]));
              const onDate = stationsOnDate(stations, r.iso);
              const earlyIds = new Set(earlyStations(onDate, C, r.iso).map((x) => String(x.id || x.name)));
              /* The ones a decision is needed about, first. */
              onDate.sort((a2, b2) => (earlyIds.has(String(b2.id || b2.name)) ? 1 : 0) - (earlyIds.has(String(a2.id || a2.name)) ? 1 : 0));
              return (
                <div key={r.iso} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <div className="font-medium text-slate-900">{prettyIso(r.iso)}</div>
                  <div style={{ color: h && h.closed ? RED : GRAY }}>
                    {!h ? "no hours set, so it runs normally"
                      : h.closed ? "closed all day"
                        : `${fmtMin(h.open)}-${fmtMin(h.close)}`}
                  </div>
                  {r.note ? <div className="text-xs" style={{ color: GRAY }}>{r.note}</div> : null}
                  {canEdit ? (
                    <button
                      onClick={() => setOpenCuts(openCuts === r.iso ? "" : r.iso)}
                      disabled={busy}
                      className="ml-auto rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600"
                    >
                      {openCuts === r.iso ? "Done" : `Cuts${cuts.length ? ` (${cuts.length})` : ""}`}
                    </button>
                  ) : null}
                  {canEdit ? (
                    <button
                      onClick={() => push(removeDate(C, r.iso), "That day could not be removed.")}
                      disabled={busy}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
                      aria-label={`Remove ${r.iso}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}

                  {/* ── the special cuts ──────────────────────────────────
                      Matt: "I make special cuts for those days." Shorter store
                      hours are half a holiday; this is the other half.
                      ⚠️ THE STATIONS THAT ALREADY RUN BEFORE THE DOORS ARE
                      SORTED TO THE TOP AND MARKED, because those are the ones
                      a decision is actually needed about. Everything else
                      follows the store's hours and needs no thought. */}
                  {openCuts === r.iso ? (
                    <div className="mt-2 w-full rounded-lg border border-slate-200 p-2">
                      {!onDate.length ? (
                        <div className="text-xs" style={{ color: GRAY }}>
                          No stations are set up for that day of the week.
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {onDate.map((st) => {
                            const sid = String(st.id || st.name);
                            const cut = byId[sid];
                            const early = earlyIds.has(sid);
                            return (
                              <div key={`${st.side}-${sid}`} className="flex flex-wrap items-center gap-2 rounded bg-slate-50 px-2 py-1.5">
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[13px] font-medium text-slate-900">{st.name}</div>
                                  <div className="text-[10.5px]" style={{ color: early ? RED : GRAY }}>
                                    {st.side}{early ? " · already on before the doors" : ""}
                                  </div>
                                </div>
                                <label className="flex items-center gap-1 text-xs text-slate-700">
                                  <input
                                    type="checkbox" checked={!!(cut && cut.off)} disabled={busy}
                                    onChange={(e) => {
                                      const on = e.target.checked;
                                      push(setStationCut(C, r.iso, sid, on ? { off: true } : null),
                                        "That could not be changed.");
                                    }}
                                  />
                                  Off
                                </label>
                                {!(cut && cut.off) ? (
                                  <>
                                    <input
                                      type="time" disabled={busy}
                                      value={cut && cut.start != null ? minToInput(cut.start) : ""}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        const end = cut && cut.end != null ? cut.end : null;
                                        if (!v || end == null) { setErr("Set both a start and an end for that station."); return; }
                                        push(setStationCut(C, r.iso, sid, { start: inputToMin(v), end }),
                                          "The end has to be after the start.");
                                      }}
                                      className="w-[92px] rounded border border-slate-300 px-1 py-1 text-xs"
                                    />
                                    <input
                                      type="time" disabled={busy}
                                      value={cut && cut.end != null ? minToInput(cut.end) : ""}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        /* ⚠️ AN END WITH NO START IS NOT HALF A CUT, it is a
                                           record nobody can read. The module refuses it; this
                                           says why rather than failing silently. */
                                        const start = cut && cut.start != null ? cut.start
                                          : (st.hours && st.hours[0] ? st.hours[0].start : null);
                                        if (!v || start == null) { setErr("Set a start time for that station first."); return; }
                                        push(setStationCut(C, r.iso, sid, { start, end: inputToMin(v) }),
                                          "The end has to be after the start.");
                                      }}
                                      className="w-[92px] rounded border border-slate-300 px-1 py-1 text-xs"
                                    />
                                  </>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="mt-1.5 text-[10.5px]" style={{ color: GRAY }}>
                        Leave a station alone and it follows the store's hours for that day.
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        {/* ⚠️ SAID OUT LOUD RATHER THAN ASSUMED: a date with no hours anywhere
            changes nothing, which is the safe answer but a surprising one if
            you thought you had set it. */}
        {rows.some((r) => !r.resolved) ? (
          <div className="mt-2 text-xs" style={{ color: RED }}>
            A day with no hours set runs its normal hours. Set the usual holiday hours above,
            or give that day its own.
          </div>
        ) : null}
      </div>
    </div>
  );
}
