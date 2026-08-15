/* ============================================================================
   MonthYearPicker.jsx — Gate City Hub
   Shared tap-to-jump month/year picker, used by SalesAllocation.jsx,
   FoodCostTracker.jsx, LaborPlanner.jsx (and eventually FCR Projections once
   it's KV-driven per month instead of the static DATA object).

   Pulled into its own file instead of copy-pasting into every tile —
   same reasoning as format.js: fixing this in six places every time it
   needs a tweak isn't sustainable.

   Usage:
     import MonthYearPicker from "./MonthYearPicker.jsx";
     ...
     <button onClick={() => setShowPicker(true)}>{monthLabel(ym)}</button>
     {showPicker && (
       <MonthYearPicker ym={ym} onPick={setYm} onClose={() => setShowPicker(false)} />
     )}
   ============================================================================ */

import React, { useState } from "react";

const NAVY = "#1B3A5C", RED = "#DD0031", INK = "#232A31", GRAY = "#6B7480", LINE = "#E3E7EC", BG = "#F6F8FA";
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n) => String(n).padStart(2, "0");
const ymOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export default function MonthYearPicker({ ym, onPick, onClose }) {
  const [y] = ym.split("-").map(Number);
  const [pickYear, setPickYear] = useState(y);
  const nowYear = new Date().getFullYear();
  // Range: a few years back to a year ahead — generous enough to cover
  // history (back to Jan 2025) plus room to plan forward.
  const yearOptions = [];
  for (let yr = nowYear - 3; yr <= nowYear + 1; yr++) yearOptions.push(yr);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,32,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: 14, padding: 18, width: "100%", maxWidth: 340, boxShadow: "0 10px 40px rgba(0,0,0,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, color: NAVY, fontSize: 16 }}>Jump to month</div>
          <button
            onClick={onClose}
            style={{ border: "none", background: "none", fontSize: 20, color: GRAY, cursor: "pointer", lineHeight: 1, padding: 4 }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {yearOptions.map((yr) => (
            <button
              key={yr}
              onClick={() => setPickYear(yr)}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
                border: yr === pickYear ? `2px solid ${RED}` : `1.5px solid ${LINE}`,
                background: yr === pickYear ? "#FFF1F4" : "#fff",
                color: yr === pickYear ? RED : INK,
              }}
            >
              {yr}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {MONTH_NAMES.map((name, i) => {
            const monthNum = i + 1;
            const candidateYm = `${pickYear}-${pad(monthNum)}`;
            const isCurrent = candidateYm === ym;
            return (
              <button
                key={name}
                onClick={() => { onPick(candidateYm); onClose(); }}
                style={{
                  padding: "10px 4px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  border: isCurrent ? `2px solid ${RED}` : `1.5px solid ${LINE}`,
                  background: isCurrent ? "#FFF1F4" : "#fff",
                  color: isCurrent ? RED : INK,
                }}
              >
                {name.slice(0, 3)}
              </button>
            );
          })}
        </div>

        <button
          style={{
            marginTop: 14, width: "100%", padding: "10px 0", borderRadius: 8, fontSize: 13.5, fontWeight: 700,
            border: `1.5px solid ${LINE}`, background: BG, color: NAVY, cursor: "pointer",
          }}
          onClick={() => { onPick(ymOf(new Date())); onClose(); }}
        >
          Jump to current month
        </button>
      </div>
    </div>
  );
}
