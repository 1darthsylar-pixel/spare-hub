/* ============================================================================
   ecosureVisits.js — Gate City Hub

   THE ECOSURE FOOD SAFETY VISIT, QUARTER BY QUARTER.

   Matt, Aug 6 2026: "for food safety i want to add the upload data for our
   Ecosure visits".

   ★ LEAF. Imports nothing, so it is node-testable and the worker could read it
   later without dragging store.js in.

   WHY HAND-FED: the EcoSure report is a page behind CFA's SSO with no export,
   same as every other CFA number in this Hub. Matt drops the page on Claude and
   pastes back the block below. See CFA-REPORTS.md.

   ⚠️⚠️ THE REPORT CONTRADICTS ITSELF, AND THE FINDINGS WIN.
   In the real Q2-2026 report the findings list carries FOUR findings — 101.7
   HIGH and a repeat, 351.1 MEDIUM, 341.1 LOW, 513.3 LOW — while the report's
   own "Findings Summary" matrix on the same page sums to THREE and shows ZERO
   high. Trusting that matrix would have shown a clean sheet on the single most
   serious finding of the quarter.
   ⇒ summarise() DERIVES the counts from the findings themselves. There is
   deliberately no way to store a typed summary, because a number you cannot
   check against its own rows is worse than no number.

   ⚠️ ONE ROUND PER KEY, AND A RE-IMPORT REPLACES ONLY THAT ROUND. Re-pasting a
   corrected Q2 must never touch Q1. Findings carry the report's own code
   (101.7), which is the only stable id EcoSure gives us — never the wording,
   which is exactly what gets reworded between revisions.

   Shape: { [round]: { round, level, levelLabel, at, findings: [
             { code, severity, repeat, category, detail } ] } }
   ============================================================================ */

export const ECOSURE_KEY = "gcfcr-ecosure-v1";

/* Worst first. This order IS the display order and the sort order — a report
   that leads with "Low" buries the thing that needs doing today. */
export const ECOSURE_SEVERITIES = ["IMMEDIATE", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"];

const SEV_RANK = ECOSURE_SEVERITIES.reduce((m, s, i) => { m[s] = i; return m; }, {});

/* The colours the tile paints each severity. Immediate and High share the Hub's
   red on purpose: on a food safety board those two mean the same thing to a
   leader standing in the kitchen, which is "today". */
export const ECOSURE_SEVERITY_TONE = {
  IMMEDIATE: "#B91C1C", HIGH: "#DD0031", MEDIUM: "#B45309",
  LOW: "#1B3A5C", INFORMATIONAL: "#6B7480",
};

const clean = (s) => String(s == null ? "" : s).trim();

/* Q2-2026 → sortable 2026-2. Used for ordering rounds and for the trend line;
   returns "" for anything unparseable so a bad round sorts last rather than
   throwing. */
export const roundSortKey = (round) => {
  const m = /^Q([1-4])-(\d{4})$/i.exec(clean(round));
  return m ? `${m[2]}-${m[1]}` : "";
};

export const roundsNewestFirst = (rec) =>
  Object.keys(rec && typeof rec === "object" ? rec : {})
    .filter((k) => roundSortKey(k))
    .sort((a, b) => roundSortKey(b).localeCompare(roundSortKey(a)));

/* ★ DERIVED, NEVER TYPED. See the warning at the top of this file. */
export function summarise(findings) {
  const rows = Array.isArray(findings) ? findings : [];
  const bySeverity = {};
  ECOSURE_SEVERITIES.forEach((s) => { bySeverity[s] = { new: 0, repeat: 0, total: 0 }; });
  let repeats = 0;
  rows.forEach((f) => {
    const s = bySeverity[f && f.severity] ? f.severity : "INFORMATIONAL";
    if (f && f.repeat) { bySeverity[s].repeat += 1; repeats += 1; }
    else bySeverity[s].new += 1;
    bySeverity[s].total += 1;
  });
  return { total: rows.length, repeats, bySeverity };
}

/* The most serious severity present, for the tile's headline. null when a
   round genuinely has no findings — which is a real and good outcome, and must
   not render as "INFORMATIONAL". */
export function worstSeverity(findings) {
  const rows = (Array.isArray(findings) ? findings : []).filter(Boolean);
  if (!rows.length) return null;
  return rows
    .map((f) => (SEV_RANK[f.severity] === undefined ? "INFORMATIONAL" : f.severity))
    .sort((a, b) => SEV_RANK[a] - SEV_RANK[b])[0];
}

/* parseEcosurePaste(text) → { round, rec } | { error }

     ECOSURE Q2-2026 | 2 | Good
     101.7 | HIGH | REPEAT | TIME & TEMPERATURE | Boards/Cook-line: TCS foods held ≤ 40°F
     351.1 | MEDIUM | NEW | CLEANING & SANITATION | Compartment Sink: warewashing maintained
     341.1 | LOW | NEW | CLEANING & SANITATION | Breading Table: non-food contact surfaces clean
     513.3 | LOW | NEW | PESTS | Dry Storage: pest devices installed and working

   Header: ECOSURE <round> | <performance level> | <level label, optional>
   Row:    code | severity | NEW or REPEAT | category | description

   A round with a clean sheet is a real result, so the header alone is a valid
   paste and stores zero findings rather than erroring. */
export function parseEcosurePaste(text) {
  const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Nothing pasted." };

  const head = /^ECOSURE\s+(Q[1-4]-\d{4})\s*(?:\|\s*(.*))?$/i.exec(lines[0]);
  if (!head) {
    return { error: `The first line must be "ECOSURE Q2-2026 | 2 | Good" (got "${lines[0]}").` };
  }
  const round = head[1].toUpperCase();
  const rest = (head[2] || "").split("|").map(clean);
  const levelRaw = rest[0] || "";
  const level = levelRaw === "" ? null : Number(levelRaw);
  if (levelRaw !== "" && !Number.isFinite(level)) {
    return { error: `Performance level must be a number (got "${levelRaw}").` };
  }

  const findings = [];
  const seen = new Set();
  for (const line of lines.slice(1)) {
    const parts = line.split("|").map(clean);
    if (parts.length < 4) {
      return { error: `Can't read this line: "${line}". A finding is code | severity | NEW or REPEAT | category | description.` };
    }
    const [code, sevRaw, repeatRaw, category] = parts;
    const detail = parts.slice(4).join(" | ");
    if (!code) return { error: `Missing the finding code in: "${line}"` };

    const severity = sevRaw.toUpperCase();
    if (!SEV_RANK[severity] && SEV_RANK[severity] !== 0) {
      return { error: `"${sevRaw}" is not an EcoSure severity. Use one of: ${ECOSURE_SEVERITIES.join(", ")}.` };
    }
    const rp = repeatRaw.toUpperCase();
    if (rp !== "NEW" && rp !== "REPEAT") {
      return { error: `Third column must be NEW or REPEAT (got "${repeatRaw}" in "${line}").` };
    }
    /* ⚠️ A DUPLICATE CODE IS A PASTE MISTAKE, NOT DATA. The same finding twice
       would double a severity count that a leader acts on, and silently. */
    if (seen.has(code)) return { error: `Finding ${code} is listed twice. Each code appears once per visit.` };
    seen.add(code);

    findings.push({ code, severity, repeat: rp === "REPEAT", category, detail });
  }

  findings.sort((a, b) => (SEV_RANK[a.severity] - SEV_RANK[b.severity]) || a.code.localeCompare(b.code));

  return {
    round,
    rec: {
      round,
      level,
      levelLabel: rest[1] || "",
      at: new Date().toISOString(),
      findings,
    },
  };
}

/* Merge one round over whatever is stored. Replaces THAT round only; every
   other quarter is carried through untouched. A caller that already guarded
   its read passes the value in — this stays pure. */
export function mergeEcosure(saved, round, rec) {
  const base = saved && typeof saved === "object" ? saved : {};
  if (!round || !rec) return base;
  return { ...base, [round]: rec };
}

/* ⚠️ THE ROUNDS THEMSELVES LIVE IN `ecosureSeed.js`, AND THE SPLIT IS THE POINT.
   This file is code and travels to every store as it is; the rounds are THIS
   store's health inspection findings and must not. `ecosureSeed.empty.js` is
   what a clone receives. Re-exported here so every existing reader keeps its
   import exactly as it was. */
export { ECOSURE_SEED } from "./ecosureSeed.js";
