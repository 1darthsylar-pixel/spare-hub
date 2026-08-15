/* ============================================================================
   CalendarGrid.jsx — Gate City Hub
   Shared month calendar for the financial day-grids (Sales Allocation,
   Planner). Renders real calendar weeks as rows with Sun–Sat columns;
   Sundays are shown as blank/greyed cells (store is closed). Each business
   day cell shows the date, weekday, an optional dollar total, and optional
   badges. Tapping a day calls onSelect(iso).

   Pulled into its own component (same reasoning as MonthYearPicker) so both
   tiles share one layout instead of duplicating the grid logic.

   Props:
     ym          "YYYY-MM"
     selected    iso of the active day (or null)
     onSelect    (iso) => void
     getDay      (iso) => {
                   total?        number  — shown formatted if > 0
                   entered?      bool    — green treatment
                   missing?      bool    — amber "needs entry" treatment
                   holiday?      bool    — holiday treatment + HOL tag
                   badge?        string  — tiny text under the total (e.g. "custom")
                 }
                 Return null/undefined for a day with nothing to show.
     accent      active-cell border color (default red)
     fmtTotal    (n) => string  — how to format the total (default $ w/o cents)
   ============================================================================ */

import React from "react";

const RED = "#DD0031", INK = "#232A31", GRAY = "#6B7480", LINE = "#E3E7EC",
      GREEN = "#166B4A", HOL = "#B45309";
const DOW_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

const defaultFmt = (n) =>
  (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/* Build the calendar matrix: array of weeks, each week is 7 cells (Sun–Sat).
   Cells outside the month are null; Sundays inside the month are marked
   closed. */
function buildWeeks(ym) {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const lastDate = new Date(y, m, 0).getDate();
  const weeks = [];
  let week = new Array(7).fill(null);
  for (let day = 1; day <= lastDate; day++) {
    const d = new Date(y, m - 1, day);
    const dow = d.getDay(); // 0 = Sun
    week[dow] = { iso: isoOf(d), day, dow, closed: dow === 0 };
    if (dow === 6 || day === lastDate) {
      weeks.push(week);
      week = new Array(7).fill(null);
    }
  }
  return weeks;
}

export default function CalendarGrid({
  ym,
  selected,
  onSelect,
  getDay = () => null,
  accent = RED,
  fmtTotal = defaultFmt,
}) {
  const weeks = buildWeeks(ym);

  const headerCell = (label) => (
    <div key={label} style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: GRAY, padding: "0 0 4px" }}>
      {label}
    </div>
  );

  const cellStyle = (info, active) => {
    const base = {
      minHeight: 58, borderRadius: 10, padding: "6px 4px", textAlign: "center",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
      boxSizing: "border-box",
    };
    if (!info) return { ...base, background: "transparent", border: "none" };
    if (info.closed) {
      return { ...base, background: "#F3F4F6", border: `1px dashed ${LINE}`, color: "#B6BDC6", cursor: "default" };
    }
    const d = info.data || {};
    return {
      ...base,
      cursor: "pointer",
      border: active ? `2px solid ${accent}` : `1.5px solid ${LINE}`,
      background: active ? "#FFF1F4"
        : d.holiday ? "#FFF4E5"
        : d.entered ? "#F0F7F4"
        : d.missing ? "#FFF8E6"
        : "#fff",
      color: d.holiday ? HOL : d.entered ? GREEN : INK,
    };
  };

  return (
    <div>
      {/* 🐛 `repeat(7, 1fr)` CUT SATURDAY OFF AND BROKE EVERY CARD ON THE PAGE
          (Matt, iPhone screenshots, Aug 7 2026: "pls fix these borders").
          A `1fr` track carries an implicit `min-width: auto`, so it REFUSES to
          shrink below its own content. A cell reading "368.50h" or "$36,189"
          therefore forced its column wider than a seventh of the card, the grid
          overflowed by 44px at 375px wide, and the page went 18px wider than
          the phone. Every card is width:100% of that wider page, so all of them
          hung past the screen edge with their right border cut. The calendar
          looked like the only casualty; it was the cause.
          `minmax(0, 1fr)` lets a track shrink below its content. Measured at
          375px: page overflow 18px → 0, and the columns got WIDER, 30px → 41px,
          because the grid stopped fighting itself.
          ⚠️ NOTHING ELSE WAS NEEDED. Smaller fonts and tighter padding were
          tried and measured: 0 of 22 totals were ever clipped, before or after.
          The numbers were never too big; the track just would not shrink.
          ⚠️ SAME CLASS AS DailySetup.jsx:690, where a flex cell's default
          min-width:auto refused to shrink and the date box spilled on phones. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
        {DOW_FULL.map(headerCell)}
        {weeks.map((week, wi) =>
          week.map((info, di) => {
            if (!info) return <div key={`${wi}-${di}`} style={cellStyle(null)} />;
            if (info.closed) {
              return (
                <div key={info.iso} style={cellStyle(info)}>
                  <div style={{ fontSize: 11 }}>{DOW_FULL[info.dow]}</div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{info.day}</div>
                </div>
              );
            }
            const data = getDay(info.iso) || {};
            const active = selected === info.iso;
            return (
              <div
                key={info.iso}
                style={cellStyle({ ...info, data }, active)}
                onClick={() => onSelect(info.iso)}
              >
                <div style={{ fontSize: 10.5, color: data.holiday ? HOL : GRAY }}>{DOW_FULL[info.dow]}</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{info.day}</div>
                {data.total > 0 && (
                  <div style={{ fontSize: 10.5, fontWeight: 700, marginTop: 1, fontVariantNumeric: "tabular-nums" }}>
                    {fmtTotal(data.total)}
                  </div>
                )}
                {data.holiday && <div style={{ fontSize: 8.5, fontWeight: 800, color: HOL }}>HOL</div>}
                {data.badge && <div style={{ fontSize: 8.5, fontWeight: 800, color: HOL }}>{data.badge}</div>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
