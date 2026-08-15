import React from "react";
import { AHA_GOALS, targetZoneRag } from "./ahaMonthly.js";

/* ══════════════════════════════════════════════════════════════════════════
   AhaScores.jsx — THE FIVE AHA SCORES, ON SCREEN, IN ONE COPY.

   🐛 THE PASTE STORED FIVE SCORES AND THE TILE SHOWED ONE. Matt, Aug 6 2026:
   "the stats aren't visible or able to pull up on demand." He was right, and
   it was never a filing problem. System usage, hold times, scans and demand
   variance were all being parsed and written to gcfcr-aha-monthly-v1, and the
   card printed a single "target zone 34%" line. `AHA_GOALS`, `TZ_BANDS` and
   `targetZoneRag` were written on Aug 5, exported, and NOTHING imported them.
   They were built for a display nobody finished.

   ── WHERE IT BELONGS ──
   ⚠️ NOT GUEST EXPERIENCE. The recommendation on file was to move AHA beside
   CEM and Smart Shop. ahaMonthly.js:14 argues the opposite and is right: that
   tile is what a guest SAID about us, this is what the kitchen DID.
   ★ IT IS A QUALITY NUMBER. Matt, Aug 6 2026: "AHA is quality." So it renders
   in Food Quality, where somebody looking for a quality score will look, AND
   in the Shift Leader Scorecard, where the paste that feeds it lives.

   ★ ONE COMPONENT, TWO TILES. It sits in its own file rather than in either of
   them precisely so there is never a second copy to drift. It imports only
   ahaMonthly.js, which imports nothing.

   ⚠️ NOTHING IS GRADED THAT THE SOURCE DOES NOT GRADE. System usage, hold
   times and scans print their goal and get no invented red/amber split — 98%
   against a 100% goal is a miss, not a crisis, and colouring it would be my
   opinion rather than CFA's. The two real rules ARE applied: target zone is
   judged against demand variance (targetZoneRag), and system usage under 90 is
   called out because every other score on the page is only eligible above it
   (ahaMonthly.js:25).

   ⚠️ EVERY FIELD IS OPTIONAL ON READ, per ahaMonthly.js:40. The dashboard is a
   live product and its wording changes. A month stored before a field existed
   still renders; a missing score prints as a dash rather than a zero, because
   a zero is a result and an absence is not.
   ══════════════════════════════════════════════════════════════════════════ */

const INK = "#171523", INK2 = "#4A4560", INK3 = "#807B92";
const MONO = "'Azeret Mono',ui-monospace,'SF Mono',Menlo,monospace";
const RAG = { green: "#1B7F4B", amber: "#A9741C", red: "#B4232B", gray: INK3 };

/* ⚠️ REJECTS BLANK BEFORE CONVERTING. `Number(null)` is 0 and 0 is finite, the
   exact trap targetZoneRag documents at ahaMonthly.js:286 — a missing score
   would print as a real 0%. */
const pct = (v) =>
  (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

const FLAT = [
  { key: "systemUsage", label: "System usage" },
  { key: "holdTimes", label: "Hold times" },
  { key: "scans", label: "Scans" },
];

const rowSt = {
  display: "flex", alignItems: "baseline", justifyContent: "space-between",
  gap: 10, padding: "5px 0", borderTop: "1px solid #F2F1F6",
};
const valSt = { fontFamily: MONO, fontSize: 13.5, fontWeight: 700, color: INK };
const goalSt = { fontFamily: MONO, fontSize: 10.5, color: INK3, marginLeft: 6 };
const lblSt = { fontSize: 13, color: INK2 };

export default function AhaScores({ month, rec, title }) {
  if (!rec) return null;
  const tz = pct(rec.targetZone);
  const dv = pct(rec.demandVariance);
  const rag = targetZoneRag(rec.targetZone, rec.demandVariance);
  const usage = pct(rec.systemUsage);

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: INK3 }}>
        {title || `${month} scores`}
      </div>
      {FLAT.map((f) => {
        const v = pct(rec[f.key]);
        return (
          <div key={f.key} style={rowSt}>
            <span style={lblSt}>{f.label}</span>
            <span style={valSt}>
              {v === null ? "—" : `${v}%`}
              {AHA_GOALS[f.key] != null && <span style={goalSt}>goal {AHA_GOALS[f.key]}%</span>}
            </span>
          </div>
        );
      })}
      <div style={rowSt}>
        <span style={lblSt}>Target zone</span>
        <span style={valSt}>
          {tz === null ? "—" : `${tz}%`}
          {rag && (
            <span style={{ ...goalSt, color: RAG[rag.rag] || INK3, fontWeight: 700 }}>{rag.why}</span>
          )}
        </span>
      </div>
      <div style={rowSt}>
        <span style={lblSt}>Demand variance</span>
        <span style={valSt}>{dv === null ? "—" : dv}</span>
      </div>
      {usage !== null && usage < 90 && (
        <div style={{ fontSize: 11.5, color: RAG.red, marginTop: 7, lineHeight: 1.45, fontWeight: 600 }}>
          System usage is under 90%, so the other scores on this page are not eligible yet.
        </div>
      )}
    </div>
  );
}
