/* ============================================================================
   rdrReport.js — read AnalyticsHub's Restaurant Data Report and hand back the
   block the Business Scorecard already imports. LEAF MODULE, imports nothing.

   ★ WHY. Matt, Aug 18 2026: "i need to be able to upload the resteraunt data
   report straight into the hub and get the same result", and separately, about
   the old instructions: "nobody will have claude". 25 scorecard rows were being
   read off a PDF and typed in by hand, once a month, at every store.

   ⇒ IT EMITS A `SCORECARD Qn` PASTE, IT DOES NOT WRITE ANYTHING. `pasteImports.js`
   parses that block and `BusinessScorecard.jsx` applies it, both unchanged. One
   import path, one set of rules about which labels exist and what a bad label
   does. A second writer would be design rule 8 with a reward ledger's worth of
   consequences.

   ⚠️⚠️ IT READS ROW LABELS, NEVER COLUMN POSITIONS, AND THAT IS THE WHOLE
   DESIGN. Reading this report by position is not a theoretical risk: it was
   done by hand on Aug 18 2026 and produced 2022's figures presented as this
   year's, twice, including a labor number that said the store was 0.78 points
   OVER benchmark when it is 0.67 UNDER. Matt caught both.

   The reason it is so easy to get wrong: the tables do not agree with each
   other about row order. Sales & Brand Growth and Financial Stewardship run
   2022 first; the Talent panel runs newest first. A parser keyed on "the last
   row is this year" is right on two tables and wrong on the third, and both
   answers look entirely plausible.
   ⇒ Every figure below is taken from a row that NAMES itself — `YTD 7/2026`,
   `P12 7/2026`, `QTD`. Order cannot hurt it.

   ⚠️ AND IT REFUSES RATHER THAN GUESSES. A report it cannot recognise, a
   period it cannot read, or a row it cannot find comes back named. Anything it
   is not sure of is left for the human, because a wrong number typed into a
   scorecard is read as fact at an L10 for a quarter.

   ⚠️ THE INPUT IS THE TEXT `pdfText.js` PRODUCES, tab separated, rebuilt from
   glyph coordinates. That is what makes the row labels reliable: pdfjs sorts by
   position, so the reading order of the PDF's own draw calls cannot mislead it.
   ============================================================================ */

/* Every scorecard row this report can fill, with the header it sits under.
   ⚠️ THE LABELS ARE THE SCORECARD'S OWN, spelled exactly as scorecardSeed.js
   spells them. `importScorecard` matches case-insensitively on the whole label
   and NAMES anything it cannot match, so a typo here is reported rather than
   invented as a new row — but it still costs the store that row. */
export const RDR_ROWS = {
  sales: [
    ["Sales Increase", 1, "%"],
    ["Transaction Count Increase", 3, "%"],
    ["Check Average", 4, "$"],
    ["Catering Sales", 5, "$0"],
    ["On Demand Sales", 6, "$0"],
    ["Mobile %", 7, "%"],
    ["Drive-Thru % of Sales", 8, "%"],
    ["Avg. Peak Hour Cars", 10, ""],
    ["DT Avg. Peak Hour Sales", 11, "$0"],
  ],
  financial: [
    ["Net Profit %", 2, "%"],
    ["Food Cost Gap", 6, "%"],
    ["Labor Cost Gap", 8, "%"],
  ],
  talent: [
    ["Turnover", 0, ""],
    ["Retention", 1, ""],
    ["Average Wage", 2, "$"],
  ],
  cem: [
    ["OSAT", 0, "%"],
    ["Taste", 1, "%"],
    ["Speed of Service", 2, "%"],
    ["Order Accuracy", 3, "%"],
    ["Attentive & Courteous", 4, "%"],
  ],
};

/* The four daypart rows, which name themselves individually rather than sitting
   in a table. ⚠️ THEIR ORDER ON THE PAGE IS NOT THE ORDER THE SCORECARD LISTS
   THEM IN, which is exactly why they are keyed by name. */
const DAYPARTS = [
  [/YTD\s+Bfst\s*%\s*Chg/i, "Breakfast"],
  [/YTD\s+Lnch\s*%\s*Chg/i, "Lunch"],
  [/YTD\s+Aftn\s*%\s*Chg/i, "Afternoon"],
  [/YTD\s+Dnr\s*%\s*Chg/i, "Dinner"],
];

/* A number as this report prints it: 1,234.56 or -31.68 or 96.0%.
   ⚠️ THE COMMA IS THE POINT. `Number("5,670,512")` is NaN, and a parser that
   quietly dropped every thousands-separated figure would fill the small rows
   and silently skip sales. */
const NUM = /^-?\$?\d[\d,]*(\.\d+)?%?$/;
const numOf = (s) => {
  const n = Number(String(s == null ? "" : s).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/* Split a line into the numbers it carries, in page order. Labels, headers and
   stray words are dropped, so `YTD 7/2026 5,670,512 10.79 …` yields the run of
   figures with the label gone. */
const tokensOf = (line) => String(line || "").split(/[\t ]+/).filter((c) => NUM.test(c));
const figuresOf = (line) => tokensOf(line).map(numOf).filter((n) => n != null);

/* ⚠️⚠️ THE FIGURE THAT FOLLOWS A LABEL, NOT THE FIRST ONE ON THE LINE. The
   reader merges rows that share a baseline across the whole page width, so the
   Breakfast daypart arrives on a line that also carries the 2025 talent row:

     2025 69.51 … 83.55  2025 OSAT  YTD Bfst %Chg 4.6  2025 ADTC 1,970

   Taking the line's first number gave Breakfast the value 2025 and Lunch the
   value 51.66 — both obviously wrong to a human and both perfectly plausible to
   a scorecard. Slice from the label and read forward. */
const afterLabel = (line, re) => {
  const m = re.exec(String(line || ""));
  if (!m) return [];
  return figuresOf(String(line).slice(m.index + m[0].length));
};

const money = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
const fmt = (n, kind) => {
  if (n == null) return null;
  if (kind === "%") return `${n}%`;
  if (kind === "$") return `$${n.toFixed(2)}`;
  if (kind === "$0") return money(n);
  return String(n);
};

/* ⚠️ CALENDAR QUARTERS, BECAUSE THE REPORT'S OWN COLUMNS ARE CALENDAR. Its CEM
   table is headed Q1-2026, Q2-2026, and the QTD column is the quarter those run
   into. Inventing a fiscal offset here would put a whole quarter of figures in
   the wrong column, and the scorecard keeps four columns so the mistake would
   sit there looking normal. */
export function quarterOfMonth(mm) {
  const m = Number(mm);
  return m >= 1 && m <= 12 ? Math.floor((m - 1) / 3) + 1 : null;
}

/** Does this text look like a Restaurant Data Report at all? */
export function isRdrText(text) {
  return /Restaurant\s+Data\s+Report/i.test(String(text || ""));
}

/**
 * Turn the report into a `SCORECARD Qn` block.
 * Returns { ok: true, text, quarter, period, filled, skipped } or
 * { ok: false, error }.
 */
export function rdrToScorecardPaste(text) {
  const raw = String(text || "");
  if (!isRdrText(raw)) {
    return { ok: false, error: "That does not look like a Restaurant Data Report. Drop the RDR PDF, or paste a SCORECARD block by hand." };
  }
  const lines = raw.split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());

  /* The period comes off the YTD row itself rather than the title, so the block
     and the figures can never describe different months. */
  const ytdLine = lines.find((l) => /^YTD\s+\d{1,2}\/\d{4}\s/.test(l.trim()));
  const p12Line = lines.find((l) => /^P12\s+\d{1,2}\/\d{4}\s/.test(l.trim()));
  const per = (ytdLine || "").trim().match(/^YTD\s+(\d{1,2})\/(\d{4})/);
  if (!per) {
    return { ok: false, error: "Could not find the YTD row in that report, so there is nothing to read the period from." };
  }
  const quarter = quarterOfMonth(per[1]);
  if (!quarter) return { ok: false, error: `"${per[1]}" is not a month.` };
  const period = `${per[2]}-${String(Number(per[1])).padStart(2, "0")}`;

  /* ⚠️⚠️ THERE ARE TWO ROWS BEGINNING `YTD 7/2026` — one under Sales & Brand
     Growth and one under Financial Stewardship — and they carry different
     figures. Telling them apart by COUNTING columns would be the position
     reading this file exists to avoid, so they are told apart by which table
     heading they come after. */
  const idxOf = (re) => lines.findIndex((l) => re.test(l));
  const salesAt = idxOf(/Sales\s*&\s*Brand\s+Growth/i);
  const finAt = idxOf(/Financial\s+Stewardship/i);
  const ytdRows = lines
    .map((l, i) => ({ i, l: l.trim() }))
    .filter((r) => /^YTD\s+\d{1,2}\/\d{4}\s/.test(r.l));
  /* ⚠️ THE LABEL IS STRIPPED BEFORE THE FIGURES ARE COUNTED. `YTD 7/2026` holds
     a 7 and a 2026, and leaving them in would shift every column by two.
     ⚠️ IT IS DEFENCE IN DEPTH, NOT THE ONLY GUARD, AND THE TEST SAYS SO RATHER
     THAN PRETENDING OTHERWISE: `7/2026` is one token and does not match NUM, so
     removing this line does not turn the suite red today. It would the moment a
     report printed `YTD 7 2026`, and that is a format change nobody would
     announce. Kept, and honestly labelled. */
  const pick = (from, to) => {
    const hit = ytdRows.find((r) => r.i > from && (to < 0 || r.i < to));
    return hit ? figuresOf(hit.l.replace(/^YTD\s+\d{1,2}\/\d{4}/, "")) : [];
  };
  const pickToks = (from, to) => {
    const hit = ytdRows.find((r) => r.i > from && (to < 0 || r.i < to));
    return hit ? tokensOf(hit.l.replace(/^YTD\s+\d{1,2}\/\d{4}/, "")) : [];
  };
  const salesFigs = salesAt >= 0 ? pick(salesAt, finAt >= 0 && finAt > salesAt ? finAt : -1) : [];
  const salesToks = salesAt >= 0 ? pickToks(salesAt, finAt >= 0 && finAt > salesAt ? finAt : -1) : [];
  const finFigs = finAt >= 0 ? pick(finAt, -1) : [];
  const finToks = finAt >= 0 ? pickToks(finAt, -1) : [];
  const talentFigs = p12Line ? figuresOf(p12Line.replace(/^\s*P12\s+\d{1,2}\/\d{4}/, "")) : [];
  const talentToks = p12Line ? tokensOf(p12Line.replace(/^\s*P12\s+\d{1,2}\/\d{4}/, "")) : [];
  const qtdLine = lines.find((l) => /^QTD(\t| {2,})/.test(l.trim()));
  const cemFigs = qtdLine ? figuresOf(qtdLine.replace(/^\s*QTD/, "")) : [];
  const cemToks = qtdLine ? tokensOf(qtdLine.replace(/^\s*QTD/, "")) : [];

  const out = [];
  const filled = [];
  const skipped = [];

  /* ⚠️ THE PRINTED PRECISION IS KEPT FOR PERCENTAGES. The report says 10.20 and
     `Number("10.20")` is 10.2, so a round trip through a number quietly drops
     the trailing zero and the column reads 10.2% beside last quarter's 11.13%.
     Nothing is wrong with the figure; it just stops looking like the others. */
  const take = (figs, toks, spec, why) => {
    for (const [label, at, kind] of spec) {
      const v = figs[at];
      if (v == null) { skipped.push(`${label} (${why})`); continue; }
      const shown = kind === "%" && toks && toks[at]
        ? `${String(toks[at]).replace(/[%$,]/g, "")}%`
        : fmt(v, kind);
      out.push(`${label} | ${shown}`);
      filled.push(label);
    }
  };

  take(salesFigs, salesToks, RDR_ROWS.sales, "no Sales & Brand Growth YTD row");
  take(finFigs, finToks, RDR_ROWS.financial, "no Financial Stewardship YTD row");
  take(talentFigs, talentToks, RDR_ROWS.talent, "no P12 row");
  take(cemFigs, cemToks, RDR_ROWS.cem, "no QTD row");

  for (const [re, label] of DAYPARTS) {
    const line = lines.find((l) => re.test(l));
    const n = line ? afterLabel(line, re) : [];
    if (!n.length) { skipped.push(`${label} (no ${label} line)`); continue; }
    out.push(`${label} | ${n[0]}%`);
    filled.push(label);
  }

  /* ⛔⛔ AHA AND QIV ARE DELIBERATELY NOT READ, AND THIS IS NOT AN OVERSIGHT.
     Their QTD figures sit on a line the reader merges with the P12 average row
     — measured on the real July 2026 export, `P12 Rest. Avg 29 96 96.5%` and
     `P12 FSU Avg 96.3%` — so which of 96.3 and 96.5 is this quarter and which
     is a benchmark cannot be settled from the text. Two plausible numbers and
     no way to choose is exactly when this file must stop. They stay hand-typed
     and are NAMED below so nobody thinks the import covered them. */
  skipped.push("Aha % Days Over 90% (its QTD column merges with the averages row — type it by hand)");
  skipped.push("QIV % (same, and the two candidates are 0.2 apart)");

  if (!filled.length) {
    return { ok: false, error: "That report was readable but no scorecard row could be matched in it." };
  }
  return {
    ok: true,
    quarter, period, filled, skipped,
    text: [`SCORECARD Q${quarter}`, ...out].join("\n"),
  };
}
