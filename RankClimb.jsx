import React from "react";
import { programLabel } from "./storeConfig.js";

// Peak Reachers — the leadership climb.
// Plants the signed-in person's flag at their camp on the operational ladder
// (Team Member → Executive Director) and names the next camp above.
//
// Placement is by ROLE TITLE, not by HR_RANK. Several titles share a rank
// (Team Member / Junior Trainer = 1; Senior Trainer / Team Leader / Junior
// Team Leader / Senior Team Leader = 3; Assistant Director / Manager = 4), so
// the rank number alone can't tell those camps apart. Matching the exact title
// keeps every camp distinct. The label shown is always the person's real role.
//
// Ladder: Team Member · Junior Trainer · Trainer · Senior Trainer · Junior
// Team Leader · Senior Team Leader · Assistant Director · Director · Executive
// Director (summit). Ranks past Executive Director (LDD, HR, Owner) are tier 3
// and never see this card; if one ever renders, it shows at the summit.
//
// Manager shares Assistant Director's camp. Plain "Team Leader" is a legacy
// title being phased into Junior / Senior Team Leader — until those people are
// re-titled they show on the Junior Team Leader camp (their card still names
// their real "Team Leader" title).
//
// The between-camp fill (progress toward the NEXT role) is intentionally not
// drawn — rank is a step function, and faking smooth motion would be a lie.
// When Bri's Leadership 101/201 per-person pipeline is live, real sub-progress
// can slot in between the current camp and the next.

const RUNGS = [
  { label: "Team Member", next: "Junior Trainer" },
  { label: "Junior Trainer", next: "Trainer" },
  { label: "Trainer", next: "Senior Trainer" },
  { label: "Senior Trainer", next: "Junior Team Leader" },
  { label: "Junior Team Leader", next: "Senior Team Leader" },
  { label: "Senior Team Leader", next: "Assistant Director" },
  { label: "Assistant Director", next: "Director" },
  { label: "Director", next: "Executive Director" },
  { label: "Executive Director", next: null },
];

// Role title → camp index. Aliases and legacy titles fold onto the right camp.
const CAMP_BY_ROLE = {
  "Limited": 0, "Employee": 0, "Team Member": 0,
  "Junior Trainer": 1,
  "Trainer": 2,
  "Senior Trainer": 3,
  "Junior Team Leader": 4,
  "Team Leader": 4, // legacy — shows on the Junior Team Leader camp until re-titled
  "Senior Team Leader": 5,
  "Assistant Director": 6, "Manager": 6,
  "Director": 7,
  "Executive Director": 8, "Executive": 8,
  "Leadership Development Director": 8, "Leadership Director": 8,
  "Human Resources": 8, "Owner": 8,
};

// Place by title; fall back to the numeric rank only if the title is unknown.
function campIndex(role, rank) {
  const r = (role || "").trim();
  if (Object.prototype.hasOwnProperty.call(CAMP_BY_ROLE, r)) return CAMP_BY_ROLE[r];
  const ci = Object.keys(CAMP_BY_ROLE).find((k) => k.toLowerCase() === r.toLowerCase());
  if (ci) return CAMP_BY_ROLE[ci];
  if (typeof rank === "number") {
    if (rank >= 7) return 8;
    if (rank >= 5) return 7;
    if (rank >= 4) return 6;
    if (rank >= 3) return 4;
    if (rank >= 2) return 2;
    if (rank >= 1) return 0;
  }
  return 0;
}

// Manager and Assistant Director share a camp — show both under the Assistant
// Director label. Everyone else keeps their real title so peers on a shared
// camp stay distinct.
function displayRole(role) {
  const r = (role || "").trim();
  if (/^manager$/i.test(r)) return "Assistant Director";
  return r;
}

// Ridge base → summit (SVG y grows downward, so y falls as we climb), spread
// evenly across the camps so the path scales if the ladder ever changes length.
const RIDGE = RUNGS.map((_, i) => {
  const t = RUNGS.length === 1 ? 0 : i / (RUNGS.length - 1);
  return [Math.round(24 + (316 - 24) * t), Math.round(150 + (34 - 150) * t)];
});

export default function RankClimb({ role, rank, navy = "#1B2A4A", slate = "#6C89A6" }) {
  const idx = campIndex(role, rank);
  const atSummit = idx >= RUNGS.length - 1;
  const rung = RUNGS[idx];
  const here = displayRole(role) || rung.label;
  const [mx, my] = RIDGE[idx];
  const summit = RIDGE[RIDGE.length - 1];

  let ascent = "M " + RIDGE[0][0] + " " + RIDGE[0][1];
  for (let i = 1; i <= idx; i++) ascent += " L " + RIDGE[i][0] + " " + RIDGE[i][1];

  const full = "M " + RIDGE.map((p) => p.join(" ")).join(" L ");
  const terrain =
    "M " + RIDGE[0][0] + " 168 " +
    RIDGE.map((p) => "L " + p[0] + " " + p[1]).join(" ") +
    " L " + summit[0] + " 168 Z";

  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderLeft: `3px solid ${navy}`, borderTop: `3px solid ${navy}`, borderRadius: 14, padding: "16px 18px 14px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", color: navy, textTransform: "uppercase" }}>{programLabel()}</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#13293F", marginTop: 2 }}>Your climb</div>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: navy, textAlign: "right" }}>{here}</div>
      </div>

      <svg viewBox="0 0 340 184" width="100%" role="img" aria-label={"Your leadership climb: " + here} style={{ display: "block" }}>
        <defs>
          <linearGradient id="rankFill" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={slate} />
            <stop offset="100%" stopColor={navy} />
          </linearGradient>
          <linearGradient id="rankTerrain" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={navy} stopOpacity="0.03" />
            <stop offset="100%" stopColor={navy} stopOpacity="0.11" />
          </linearGradient>
        </defs>

        <path d={terrain} fill="url(#rankTerrain)" />
        <line x1="24" y1="168" x2="316" y2="168" stroke="#E2E6EC" strokeWidth="1" />

        <path d={full} fill="none" stroke="#C9D2DD" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 7" />
        <path d={ascent} fill="none" stroke="url(#rankFill)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />

        <g>
          <line x1={summit[0]} y1={summit[1]} x2={summit[0]} y2={summit[1] - 16} stroke={atSummit ? navy : "#C9D2DD"} strokeWidth="2" />
          <path d={"M " + summit[0] + " " + (summit[1] - 16) + " l 12 4 l -12 4 z"} fill={atSummit ? navy : "#C9D2DD"} />
        </g>

        {RIDGE.map((p, i) => (
          i === idx ? null : (
            <circle key={i} cx={p[0]} cy={p[1]} r="3.2" fill={i < idx ? navy : "#C9D2DD"} />
          )
        ))}

        <g transform={"translate(" + mx + ", " + my + ")"}>
          <circle r="6.5" fill="#FFFFFF" stroke={navy} strokeWidth="2.5" />
          <circle r="2.6" fill={navy} />
        </g>
      </svg>

      <div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 8, lineHeight: 1.4 }}>
        {atSummit ? "You're at the summit. Now you bring others up." : "Next camp: " + rung.next + "."}
      </div>
    </div>
  );
}
