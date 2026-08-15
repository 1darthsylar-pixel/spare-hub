/* ============================================================================
   SalesAllocation.jsx — Gate City Hub
   Daily sales by channel (DT / Carry Out / Dine In / On Demand / Catering).
   Replaces the "[Month] Sales Allocation" tabs in the FCR Workbook.

   Storage: one key per month → gcfcr-salesalloc-[YYYY-MM]-v1
   Shape:   { version:1, month:"2026-07",
              days:{ "2026-07-01":{dt,co,di,od,ca,hol?,adj?}, ... } }
            hol = true marks a holiday. adj = optional adjusted sales used
            ONLY for averages (Thaw / Planner). Real channel entries still
            count toward month totals, food cost, and FCR.

   Exports for downstream engines (Thaw, Planner, FCR):
     saKey(ym)                    → storage key for a month
     loadSalesMonth(ym)           → month record or null
     dayTotal(rec)                → sum of 5 channels (real sales)
     avgBasisTotal(rec)           → value a day contributes to AVERAGES:
                                    holiday → adj (or 0 = excluded),
                                    normal  → dayTotal
     weeklyTotals(monthRec)       → [{weekStart, days:[...], total}]
     lastTwoWeekendsAvg(...recs)  → avg Fri/Sat day over the last two
                                    weekend totals (Thaw Allocation input).
                                    Holiday days without an adjusted value
                                    knock their weekend out — the engine
                                    reaches back to the prior clean weekend.
     lastTwoWeeksAvg(cur, prev)   → legacy full-week average (kept for
                                    compatibility; Thaw no longer uses it)
     weekdayTwoMonthAvg(recA,recB)→ {1:avgMon,...,6:avgSat} (Planner forecast)
                                    — holidays excluded / adjusted

   NAV: the month/year label in the header is tappable — opens a quick
   month+year picker so you can jump straight to any past month instead
   of clicking ‹ › repeatedly. Useful now that history goes back to
   Jan 2025 via the backfill import.

   VIEW: days are laid out as a real month calendar (weeks as rows, Sun–Sat
   columns) via the shared CalendarGrid; closed Sundays show as blank cells,
   and each day cell shows its dollar total. Tap a day to edit it below.
   ============================================================================ */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { kvGet, kvSet, kvGetResult } from "./store";
/* The shared raised look — see cardStyle.js. */
import { importZone, CARD_3D, CARD_3D_SOFT, cardSurface, accentEdge } from "./cardStyle.js";
import MonthYearPicker from "./MonthYearPicker.jsx";
import CalendarGrid from "./CalendarGrid.jsx";
/* ★ THE SALES LOADERS LIVE IN laborEngine.js NOW (Aug 6 2026). The worker's
   labor-daypart job reads the same sales months, and worker.js cannot import
   a React component file — so SA_CHANNELS, saKey, loadSalesMonth, dayTotal,
   avgBasisTotal and weekdayTwoMonthAvg moved to that leaf, with the storage
   reader injected. This file binds the browser door (kvGet) below and
   re-exports the same names, so its five consumers and this component's own
   code are untouched. ONE implementation either way — a second copy is how
   two surfaces drift. */
import {
  SA_CHANNELS, saKey, dayTotal, avgBasisTotal, weekdayTwoMonthAvg,
  loadSalesMonth as engineLoadSalesMonth,
} from "./laborEngine.js";
export { SA_CHANNELS, saKey, dayTotal, avgBasisTotal, weekdayTwoMonthAvg };
const NAVY = "#1B3A5C", RED = "#DD0031", INK = "#232A31", GRAY = "#6B7480", LINE = "#E3E7EC", BG = "#F6F8FA";
const HOL = "#B45309";

/* ---------------- date helpers (business days = Mon–Sat) ---------------- */
const pad = (n) => String(n).padStart(2, "0");
const ymOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function businessDaysOf(ym) {
  const [y, m] = ym.split("-").map(Number);
  const out = [];
  const d = new Date(y, m - 1, 1);
  while (d.getMonth() === m - 1) {
    if (d.getDay() !== 0) out.push(isoOf(d)); // skip Sundays (closed)
    d.setDate(d.getDate() + 1);
  }
  return out;
}
function prevBusinessDay(from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() - 1);
  while (d.getDay() === 0) d.setDate(d.getDate() - 1);
  return isoOf(d);
}
function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return ymOf(d);
}
const monthLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

/* ---------------- storage + engine (moved to laborEngine.js) ----------------
   The browser door onto the shared loader. Same function the worker calls,
   different reader — see the note on the laborEngine import above. */
export async function loadSalesMonth(ym) {
  return engineLoadSalesMonth(ym, kvGet);
}

export function weeklyTotals(monthRec) {
  if (!monthRec || !monthRec.days) return [];
  const weeks = new Map(); // key = ISO of that week's Monday
  Object.keys(monthRec.days).sort().forEach((iso) => {
    const d = fromIso(iso);
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
    const wk = isoOf(mon);
    if (!weeks.has(wk)) weeks.set(wk, { weekStart: wk, days: [], total: 0 });
    const w = weeks.get(wk);
    const t = dayTotal(monthRec.days[iso]);
    w.days.push({ iso, total: t, rec: monthRec.days[iso] });
    w.total += t;
  });
  return [...weeks.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

/* A week counts as "completed" when it has 6 entered business days
   (or its Saturday is in the past and every listed day has a total > 0). */
function completedWeeks(...monthRecs) {
  const all = [];
  monthRecs.filter(Boolean).forEach((r) => all.push(...weeklyTotals(r)));
  const byStart = new Map();
  all.forEach((w) => {
    if (!byStart.has(w.weekStart)) byStart.set(w.weekStart, { weekStart: w.weekStart, days: [], total: 0 });
    const t = byStart.get(w.weekStart);
    t.days.push(...w.days); t.total += w.total;
  });
  return [...byStart.values()]
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .filter((w) => w.days.length >= 6 && w.days.every((d) => d.total > 0));
}

/* Legacy full-week average — kept for compatibility. */
export function lastTwoWeeksAvg(monthRec, prevMonthRec) {
  const done = completedWeeks(prevMonthRec, monthRec);
  if (done.length < 2) return null;
  const [a, b] = done.slice(-2);
  return (a.total + b.total) / 2;
}

/* THAW BASIS — average of the last two completed WEEKENDS (Fri + Sat).
   Pass any number of month records (order doesn't matter). A weekend
   qualifies only when both days contribute a basis > 0, so a holiday
   Fri/Sat with no adjusted value skips that weekend and the engine
   reaches back to the prior clean one. */
export function lastTwoWeekendsAvg(...monthRecs) {
  const days = {};
  monthRecs.filter(Boolean).forEach((r) => Object.assign(days, r.days || {}));
  const weekends = [];
  Object.keys(days).sort().forEach((iso) => {
    const d = fromIso(iso);
    if (d.getDay() !== 6) return; // anchor on Saturdays
    const fri = new Date(d);
    fri.setDate(d.getDate() - 1);
    const fv = avgBasisTotal(days[isoOf(fri)]);
    const sv = avgBasisTotal(days[iso]);
    if (fv > 0 && sv > 0) weekends.push({ sat: iso, total: fv + sv });
  });
  if (weekends.length < 2) return null;
  const [a, b] = weekends.slice(-2);
  // Average Fri/Sat DAY across the last two weekends (4 days) — this is
  // the sheet's basis; the thaw factors are calibrated to it.
  return (a.total + b.total) / 4;
}

/* weekdayTwoMonthAvg — the planner forecast basis — moved to laborEngine.js
   with the other loaders; re-exported above. */

/* ---------------- formatting ---------------- */
const fmt$ = (n) =>
  (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmt$c = (n) =>
  (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n) => (isFinite(n) ? `${(n * 100).toFixed(1)}%` : "—");

/* Decimal-safe input cleaner: keeps the string exactly as typed (so "104.5"
   and a trailing "." survive re-render), allowing digits + one dot. */
const cleanDec = (raw) => {
  const c = String(raw).replace(/[^0-9.]/g, "");
  const i = c.indexOf(".");
  return i === -1 ? c : c.slice(0, i + 1) + c.slice(i + 1).replace(/\./g, "");
};

/* ============================================================================
   Component
   ============================================================================ */
export default function SalesAllocation() {
  const todayYm = ymOf(new Date());
  const [ym, setYm] = useState(todayYm);
  const [month, setMonth] = useState(null);      // current month record
  const [prevA, setPrevA] = useState(null);      // ym-1 (weekday avg + thaw)
  const [prevB, setPrevB] = useState(null);      // ym-2 (weekday avg + thaw)
  const [selected, setSelected] = useState(null); // iso of day being edited
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  // false = this month's read FAILED (not "empty") — entry is off until a
  // reopen loads it, so a blank month can never overwrite the real one.
  const [loadOk, setLoadOk] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const saveTimer = useRef(null);
  const channelRefs = useRef([]); // channel inputs, for Enter-to-advance

  /* ---- load month + two prior months whenever ym changes ---- */
  useEffect(() => {
    let alive = true;
    (async () => {
      // ⚠️ The CURRENT month reads with kvGetResult: a FAILED read used to
      // arrive as null, render as an empty month, and one keystroke in a
      // channel field then saved that emptiness over the month every other
      // tile divides by. The two prior months stay on loadSalesMonth — they
      // are display/average inputs and never feed a write from here.
      const [curR, a, b] = await Promise.all([
        kvGetResult(saKey(ym)), loadSalesMonth(shiftMonth(ym, -1)), loadSalesMonth(shiftMonth(ym, -2)),
      ]);
      if (!alive) return;
      setLoadOk(curR.ok);
      const cur = curR.ok ? curR.value : null;
      setMonth(cur || { version: 1, month: ym, days: {} });
      setPrevA(a); setPrevB(b);
      // default selection: previous business day if it's in this month, else last day
      const days = businessDaysOf(ym);
      const pbd = prevBusinessDay();
      setSelected(days.includes(pbd) ? pbd : days[days.length - 1]);
    })();
    return () => { alive = false; };
  }, [ym]);

  /* ---- debounced persist ---- */
  const persist = (next) => {
    // Refuse before the optimistic update: with the month unloaded, even the
    // typed digit must not appear, or the screen shows sales that cannot save.
    if (!loadOk) { setSaveState("error"); return; }
    setMonth(next);
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      // kvSet returns false on a refused write and never throws — the old
      // catch here was unreachable, so "error" had never once shown while
      // five downstream tiles quietly read the stale month.
      const ok = await kvSet(saKey(ym), next);
      setSaveState(ok ? "saved" : "error");
      setTimeout(() => setSaveState("idle"), 2000);
    }, 600);
  };

  /* Store the typed string as-is (decimal-safe, never rounded). */
  const setChannel = (iso, ch, raw) => {
    const v = cleanDec(raw);
    const next = { ...month, days: { ...month.days, [iso]: { ...(month.days[iso] || {}), [ch]: v } } };
    persist(next);
  };
  const setDayMeta = (iso, patch) => {
    const next = { ...month, days: { ...month.days, [iso]: { ...(month.days[iso] || {}), ...patch } } };
    persist(next);
  };

  /* Enter on a channel input drops down to the next channel; on the last
     channel it closes the cell (blur). Keyboard-only quality-of-life for
     laptop entry — touch entry is unaffected. */
  const onChannelKeyDown = (e, i) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const nextEl = channelRefs.current[i + 1];
    if (nextEl) { nextEl.focus(); nextEl.select?.(); }
    else e.currentTarget.blur();
  };

  /* ---- derived ---- */
  const days = useMemo(() => businessDaysOf(ym), [ym]);
  const weeks = useMemo(() => weeklyTotals(month), [month]);
  const monthTotal = useMemo(() => weeks.reduce((s, w) => s + w.total, 0), [weeks]);
  const channelTotals = useMemo(() => {
    const t = {}; SA_CHANNELS.forEach((c) => (t[c.id] = 0));
    Object.values(month?.days || {}).forEach((r) => SA_CHANNELS.forEach((c) => (t[c.id] += Number(r[c.id]) || 0)));
    return t;
  }, [month]);
  const thawAvg = useMemo(() => lastTwoWeekendsAvg(prevB, prevA, month), [month, prevA, prevB]);
  const wkdayAvg = useMemo(() => weekdayTwoMonthAvg(prevA, prevB), [prevA, prevB]);
  /* Projected month sales (auto): sum each business day's 2-month weekday
     average across the whole month. Pure projection — independent of what's
     been actually entered. Null until both prior months exist to average. */
  const projectedMonth = useMemo(() => {
    if (!prevA || !prevB) return null;
    let sum = 0;
    days.forEach((iso) => {
      const dow = fromIso(iso).getDay();
      sum += wkdayAvg[dow] || 0;
    });
    return sum > 0 ? sum : null;
  }, [days, wkdayAvg, prevA, prevB]);
  const sel = month?.days?.[selected] || {};
  const selTotal = dayTotal(sel);
  const missing = useMemo(
    () => days.filter((iso) => {
      const rec = month?.days?.[iso];
      if (rec?.hol) return false; // holidays don't nag for entry
      return iso <= prevBusinessDay() && dayTotal(rec) === 0;
    }),
    [days, month]
  );

  /* Per-day info for the shared calendar grid. */
  const getDay = (iso) => {
    const rec = month?.days?.[iso];
    const total = dayTotal(rec);
    return {
      total,
      entered: total > 0,
      missing: missing.includes(iso),
      holiday: !!rec?.hol,
    };
  };

  /* ---- bulk import: lines of  YYYY-MM-DD, dt, co, di, od, ca ---- */
  const runImport = () => {
    const next = { ...month, days: { ...month.days } };
    let ok = 0, bad = 0;
    importText.split(/\n+/).forEach((rawLine) => {
      const line = rawLine.replace(/[\u0022\r]/g, "").trim();
      /* ⚠️ A TAB WINS WHEN THERE IS ONE, and that is the whole fix for the way
         this is actually used. Splitting on comma OR tab looks harmless until
         someone pastes real sales out of a spreadsheet, where 1,234.56 carries
         its thousands comma. That splits into TWO fields, every column after
         it shifts by one, and the day is saved with the wrong figure in every
         channel — then the box says "Imported 1 day(s)" and it reads as a
         success. A spreadsheet copy is tab-separated, so preferring the tab
         keeps those numbers whole.
         ⚠️ Known limit, deliberately not built: a true CSV with quoted commas
         still mis-splits, because the quote strip on the line above runs
         first. Tab covers the real workflow; a CSV parser is not worth
         carrying for one paste box. */
      const p = (line.includes("\t") ? line.split("\t") : line.split(",")).map((s) => s.trim());
      if (p.length < 6 || !/^\d{4}-\d{2}-\d{2}$/.test(p[0])) { if (line.trim()) bad++; return; }
      if (!p[0].startsWith(ym)) { bad++; return; }
      /* ⚠️ REJECT WHAT WE CANNOT READ, NEVER SILENTLY CALL IT ZERO.
         `+p[1] || 0` turned "$1,234.56" into 0 and saved it as a real figure.
         A day showing 0 reads as a day the store took nothing, not as a paste
         that failed — and it lands in the field leaders plan off. Now an
         unreadable number fails the whole line and is counted in "skipped", so
         the alert tells the truth. A BLANK still means a genuine zero, which
         it always did. */
      const nums = p.slice(1, 6).map((s) => {
        const v = String(s).replace(/[$\s,]/g, "");
        if (v === "") return 0;
        return /^-?\d*\.?\d+$/.test(v) ? Number(v) : null;
      });
      if (nums.some((n) => n === null)) { bad++; return; }
      next.days[p[0]] = { ...(next.days[p[0]] || {}), dt: nums[0], co: nums[1], di: nums[2], od: nums[3], ca: nums[4] };
      ok++;
    });
    persist(next);
    setShowImport(false); setImportText("");
    alert(`Imported ${ok} day(s)` + (bad ? `, skipped ${bad} bad line(s)` : ""));
  };

  /* ---- styles (16px inputs — prevents iPad Safari zoom) ---- */
  const S = {
    page: { fontFamily: "Inter, -apple-system, sans-serif", background: BG, minHeight: "100vh", padding: 14, color: INK },
    /* ★ THE RAISED LOOK, NOT JUST THE STRIP (Matt, Aug 4 2026: "these are
       blocked at the edge").
       This screen had only ever got half the treatment. Callers add a 3px
       coloured top and left by hand, but the card underneath stayed a flat white
       rectangle with a hairline round the rest, so what you saw was a hard
       coloured L stuck on a flat block. The strip is the label; the gradient and
       the shadow are what make it a surface. Adding them here lifts every card
       on the screen, because they all spread S.card. */
    card: { backgroundColor: "#fff", backgroundImage: cardSurface(NAVY, 0.5), border: `1px solid ${LINE}`, borderRadius: 12, padding: 14, marginBottom: 12, boxShadow: CARD_3D },
    h1: { fontSize: 20, fontWeight: 800, color: NAVY, margin: 0 },
    sub: { fontSize: 13, color: GRAY, marginTop: 2 },
    input: {
      fontSize: 16, padding: "10px 12px", border: `1.5px solid ${LINE}`, borderRadius: 10,
      width: "100%", boxSizing: "border-box", textAlign: "right", fontVariantNumeric: "tabular-nums",
    },
    btn: (bg) => ({
      fontSize: 15, fontWeight: 700, padding: "10px 14px", borderRadius: 10, border: "none",
      background: bg, color: "#fff", cursor: "pointer",
    }),
    chip: (bg, fg) => ({
      display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 12,
      fontWeight: 700, background: bg, color: fg, marginRight: 6, marginTop: 4,
    }),
  };

  const savedBadge =
    saveState === "saving" ? <span style={S.chip("#FFF3CD", "#7A5A00")}>Saving…</span> :
    saveState === "saved" ? <span style={S.chip("#DCF5E8", "#166B4A")}>Saved ✓</span> :
    saveState === "error" ? <span style={S.chip("#FDE2E2", "#8A1220")}>Save failed — retry</span> : null;

  const selAdjNum = Number(sel.adj);

  return (
    <div style={S.page}>
      {!loadOk && (
        <div style={{ background: "#F5EAD3", border: "1px solid #E4CE9E", borderLeft: "3px solid #A9741C", borderTop: "3px solid #A9741C", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 13, fontWeight: 700, color: "#7A5410" }}>
          This month's sales could not be reached — the grid below is blank, not real, and entry is off so it cannot overwrite the real month. Reopen the tile to retry.
        </div>
      )}
      {/* header */}
      <div style={{ ...S.card, borderLeft: `3px solid ${RED}`, borderTop: `3px solid ${RED}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 style={S.h1}>Sales Allocation</h1>
            <div style={S.sub}>Enter daily sales by channel · feeds Thaw, Planner &amp; FCR · flag holidays to keep them out of averages</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button style={S.btn(NAVY)} onClick={() => setYm(shiftMonth(ym, -1))}>‹</button>
            <button
              onClick={() => setShowMonthPicker(true)}
              style={{
                fontWeight: 800, color: NAVY, minWidth: 130, textAlign: "center",
                background: "none", border: "none", cursor: "pointer",
                borderBottom: `1.5px dotted ${NAVY}`, padding: "2px 4px", fontSize: 15,
              }}
            >
              {monthLabel(ym)}
            </button>
            <button style={S.btn(NAVY)} onClick={() => setYm(shiftMonth(ym, +1))}>›</button>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <span style={S.chip("#EAF0F6", NAVY)}>Month {fmt$(monthTotal)}</span>
          {projectedMonth != null && <span style={S.chip("#F1ECF9", "#6B4FA0")}>Projected {fmt$(projectedMonth)}</span>}
          {thawAvg != null && <span style={S.chip("#E6F4F4", "#0E7C7B")}>Thaw basis (Fri/Sat day avg) {fmt$(thawAvg)}</span>}
          {missing.length > 0 && <span style={S.chip("#FFF3CD", "#7A5A00")}>{missing.length} day(s) need entry</span>}
          {savedBadge}
        </div>
      </div>

      {showMonthPicker && (
        <MonthYearPicker ym={ym} onPick={setYm} onClose={() => setShowMonthPicker(false)} />
      )}

      {/* calendar */}
      <div style={S.card}>
        <CalendarGrid
          ym={ym}
          selected={selected}
          onSelect={setSelected}
          getDay={getDay}
          accent={RED}
          fmtTotal={fmt$}
        />
      </div>

      {/* entry form for selected day */}
      {selected && (
        <div style={{ ...S.card, borderLeft: `3px solid ${sel.hol ? HOL : NAVY}`, borderTop: `3px solid ${sel.hol ? HOL : NAVY}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            <div style={{ fontWeight: 800, color: sel.hol ? HOL : NAVY }}>
              {fromIso(selected).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              {sel.hol ? " · HOLIDAY" : ""}
            </div>
            <button
              style={{
                fontSize: 12.5, fontWeight: 800, padding: "6px 12px", borderRadius: 999, cursor: "pointer",
                border: `1.5px solid ${sel.hol ? HOL : LINE}`,
                background: sel.hol ? "#FFF4E5" : "#fff", color: sel.hol ? HOL : GRAY,
              }}
              onClick={() => setDayMeta(selected, { hol: !sel.hol })}
            >
              {sel.hol ? "★ Holiday — tap to unmark" : "Mark as holiday"}
            </button>
          </div>

          {sel.hol && (
            <div style={{ backgroundColor: "#FFF4E5", backgroundImage: cardSurface(HOL, 0.4), border: "1px solid #F5D9AE", ...accentEdge(HOL, 3), boxShadow: CARD_3D_SOFT, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
              <div style={{ fontSize: 12.5, color: HOL, fontWeight: 700, marginBottom: 6 }}>
                Holiday — excluded from Thaw &amp; Planner averages. Real sales below still count toward month totals, food cost, and FCR.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Adjusted sales for averages ($)</div>
                  <div style={{ fontSize: 11, color: GRAY }}>Optional — enter a normal-day figure to use in averages instead. Leave blank to skip this day entirely.</div>
                </div>
                <input
                  style={{ ...S.input, width: 130 }} inputMode="decimal" placeholder="skip"
                  value={sel.adj ?? ""} onChange={(e) => setDayMeta(selected, { adj: cleanDec(e.target.value) })}
                />
              </div>
              {isFinite(selAdjNum) && selAdjNum > 0 && (
                <div style={{ fontSize: 11.5, color: HOL, marginTop: 6 }}>Averages will use {fmt$c(selAdjNum)} for this day.</div>
              )}
            </div>
          )}

          {SA_CHANNELS.map((c, i) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 6, alignSelf: "stretch", borderRadius: 3, background: c.color }} />
              <div style={{ width: 100, fontSize: 14, fontWeight: 700 }}>{c.label}</div>
              <input
                ref={(el) => (channelRefs.current[i] = el)}
                style={S.input} inputMode="decimal" placeholder="0"
                value={sel[c.id] ?? ""} onChange={(e) => setChannel(selected, c.id, e.target.value)}
                onKeyDown={(e) => onChannelKeyDown(e, i)}
              />
              <div style={{ width: 52, fontSize: 12, color: GRAY, textAlign: "right" }}>
                {selTotal > 0 ? fmtPct((Number(sel[c.id]) || 0) / selTotal) : "—"}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${LINE}` }}>
            <div style={{ fontWeight: 800 }}>Day Total</div>
            <div style={{ fontWeight: 800, color: RED, fontSize: 18, fontVariantNumeric: "tabular-nums" }}>{fmt$c(selTotal)}</div>
          </div>
        </div>
      )}

      {/* weekly rollup */}
      <div style={S.card}>
        <div style={{ fontWeight: 800, color: NAVY, marginBottom: 8 }}>Weekly Totals</div>
        {weeks.length === 0 && <div style={{ color: GRAY, fontSize: 14 }}>No entries yet this month.</div>}
        {weeks.map((w, i) => (
          <div key={w.weekStart} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${LINE}`, fontSize: 14 }}>
            <div>Week {i + 1} <span style={{ color: GRAY, fontSize: 12 }}>(w/o {w.weekStart.slice(5)})</span></div>
            <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt$c(w.total)} <span style={{ color: GRAY, fontWeight: 400, fontSize: 12 }}>· {w.days.filter((d) => d.total > 0).length}/6 days</span></div>
          </div>
        ))}
      </div>

      {/* channel mix + projections */}
      <div style={S.card}>
        <div style={{ fontWeight: 800, color: NAVY, marginBottom: 8 }}>Channel Mix (MTD)</div>
        {SA_CHANNELS.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 14 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: c.color }} />
            <div style={{ width: 96 }}>{c.short}</div>
            <div style={{ flex: 1, height: 8, background: BG, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${monthTotal ? (channelTotals[c.id] / monthTotal) * 100 : 0}%`, height: "100%", background: c.color }} />
            </div>
            <div style={{ width: 110, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {fmt$(channelTotals[c.id])} <span style={{ color: GRAY, fontSize: 12 }}>{monthTotal ? fmtPct(channelTotals[c.id] / monthTotal) : ""}</span>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${LINE}` }}>
          <div style={{ fontWeight: 800, color: NAVY, marginBottom: 6, fontSize: 14 }}>Planner Forecast Basis (2-month weekday avg · holidays excluded)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, fontSize: 13 }}>
            {[1, 2, 3, 4, 5, 6].map((d) => (
              <div key={d} style={{ background: BG, borderRadius: 8, padding: "6px 4px", textAlign: "center" }}>
                <div style={{ color: GRAY, fontSize: 11 }}>{DOW[d]}</div>
                <div style={{ fontWeight: 700 }}>{wkdayAvg[d] ? fmt$(wkdayAvg[d]) : "—"}</div>
              </div>
            ))}
          </div>
          {(!prevA || !prevB) && (
            <div style={{ fontSize: 12, color: GRAY, marginTop: 6 }}>
              Needs the two prior months entered (use Import to backfill from the Sheet).
            </div>
          )}
        </div>
      </div>

      {/* import (backfill for parallel run) */}
      <div style={S.card}>
        {!showImport ? (
          <button style={S.btn(NAVY)} onClick={() => setShowImport(true)}>Import from Sheet (paste rows)</button>
        ) : (
          <div>
            <div style={{ fontSize: 13, color: GRAY, marginBottom: 6 }}>
              One line per day, comma or tab separated:<br />
              <code>YYYY-MM-DD, DT, CarryOut, DineIn, OnDemand, Catering</code> — dates must be in {monthLabel(ym)}. Decimals are kept as entered. Holiday flags survive re-imports.
            </div>
            {/* ★ The shared paste-box look (Matt, Aug 8 2026: "the pase boxes
                dont stand out with color"). Same blue dashed zone as every other
                paste box in the Hub, so one is recognisable wherever you meet
                it. minHeight is kept — this one takes a whole month of rows. */}
            <textarea
              style={{ ...importZone(), minHeight: 120 }}
              value={importText} onChange={(e) => setImportText(e.target.value)}
              placeholder={`${ym}-01, 20138.42, 4210, 4035, 3694, 335`}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button style={S.btn("#166B4A")} onClick={runImport}>Import</button>
              <button style={S.btn(GRAY)} onClick={() => { setShowImport(false); setImportText(""); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
