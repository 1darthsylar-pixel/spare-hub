/* ============================================================================
   pasteImports.js — Gate City Hub

   Parsers for the remaining monthly paste blocks (Matt, Aug 1 2026: "I want
   them all to have the same button"). LEAF MODULE — imports nothing, node-
   testable. Each parser reads exactly the block Claude hands back from the
   month's report; the TILE owns matching against its own row/metric lists
   and the gated write, so editor and renderer can never drift.

   DAYPART (CFA Signal → Labor Productivity, "Display Daypart", Sun incl.):
     DAYPART 2026-07 | July 2026          <- label optional
     sales Breakfast | 4044 | 4337 | 4619 | 5054 | 5763 | 4065
     sales Lunch | …      sales Afternoon | …     sales Dinner | …
     hours Breakfast | …  hours Lunch | …  hours Afternoon | …  hours Dinner | …
     late | 0.2 | 0.2 | 0.9 | 0.2 | 0.1 | 0.3   <- optional, zeros otherwise
   Six numbers per row (Mon..Sat), all four dayparts for sales AND hours.

   CEM (AnalyticsHub Customer Experience Monitor):
     CEM 2026-07 | Jul 2026 (90-day) | 1164     <- id | label | survey count
     Overall Satisfaction | 70 | 80 | 83        <- store | market | top
   Metric names are matched by the tile against its own list.

   SHOP (Smart Shop):
     SHOP 2026-07 | Jul 2026 | 85 | 87 | Needs Improvement
                       label | index | chain | level (level optional)
     Craveable Food | 33 | 86                   <- weight | score (optional rows)

   SCORECARD (AnalyticsHub Restaurant Data Report, quarterly):
     SCORECARD Q2
     <row label> | <value> [| benchmark]
   Row labels are matched by the tile against its own row list.

   LABORBENCH (TIR Overview → Labor Cost Opportunity, one page per benchmark):
     LABORBENCH 2026-07 | July 2026        <- label optional
     wages | 22.37                         <- FCR Wages %, same on every page
     productivity | 79.09                  <- Labor Productivity $, same too
     top 10 | 19.56 | 2.81 | 23137 | 48.58
     top 20 | 20.24 | 2.13 | 17495 | 36.74
     top 33 | 20.89 | 1.48 | 12173 | 25.56
     top 50 | 21.47 | 0.90 | 7392 | 15.52
       tier | benchmark wages % | opportunity % | opportunity $ | daily hours
   Any subset of the four tiers is accepted; the report prints all four.
   ============================================================================ */

const num = (s) => {
  const n = Number(String(s ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const splitLines = (text) => String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);

const DP_ORDER = ["Breakfast", "Lunch", "Afternoon", "Dinner"];

export function parseDaypartPaste(text) {
  const lines = splitLines(text);
  if (!lines.length) return { error: "Nothing pasted." };
  const head = lines[0].match(/^DAYPART\s+(\d{4}-\d{2})(?:\s*\|\s*(.+))?$/i);
  if (!head) return { error: `First line must be "DAYPART YYYY-MM" (got "${lines[0]}").` };
  const ym = head[1];
  const [y, m] = ym.split("-").map(Number);
  const label = (head[2] || "").trim() || new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const sales = {}, hours = {};
  let late = [0, 0, 0, 0, 0, 0];
  for (const line of lines.slice(1)) {
    const parts = line.split("|").map((p) => p.trim());
    const keyParts = parts[0].split(/\s+/);
    const kind = (keyParts[0] || "").toLowerCase();
    const nums = parts.slice(1).map(num);
    if (nums.length !== 6 || nums.some((n) => !Number.isFinite(n))) {
      return { error: `Every row needs six numbers, Mon through Sat: "${line}"` };
    }
    if (kind === "late") { late = nums; continue; }
    if (kind !== "sales" && kind !== "hours") return { error: `Rows start with "sales", "hours", or "late": "${line}"` };
    const dpRaw = keyParts.slice(1).join(" ");
    const dp = DP_ORDER.find((d) => d.toLowerCase() === dpRaw.toLowerCase());
    if (!dp) return { error: `Unknown daypart "${dpRaw}" — use Breakfast, Lunch, Afternoon, or Dinner.` };
    (kind === "sales" ? sales : hours)[dp] = nums;
  }
  const missing = [];
  DP_ORDER.forEach((dp) => {
    if (!sales[dp]) missing.push(`sales ${dp}`);
    if (!hours[dp]) missing.push(`hours ${dp}`);
  });
  if (missing.length) return { error: `Missing rows: ${missing.join(", ")}.` };
  return { ym, label, sales, hours, late };
}

export function parseCemPaste(text) {
  const lines = splitLines(text);
  if (!lines.length) return { error: "Nothing pasted." };
  const head = lines[0].match(/^CEM\s+(\S+)\s*\|\s*([^|]+)\|\s*(.+)$/i);
  if (!head) return { error: `First line must be "CEM id | label | survey count" (got "${lines[0]}").` };
  const count = num(head[3]);
  if (!Number.isFinite(count)) return { error: `Bad survey count: "${head[3]}"` };
  const metrics = [];
  for (const line of lines.slice(1)) {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 4 || !parts[0]) return { error: `Metric rows are "name | store | market | top": "${line}"` };
    const store = num(parts[1]), market = num(parts[2]), top = num(parts[3]);
    if ([store, market, top].some((n) => !Number.isFinite(n))) return { error: `Bad number in: "${line}"` };
    metrics.push({ name: parts[0], store, market, top });
  }
  if (!metrics.length) return { error: "No metric rows followed the header." };
  return { id: head[1], label: head[2].trim(), count, metrics };
}

export function parseShopPaste(text) {
  const lines = splitLines(text);
  if (!lines.length) return { error: "Nothing pasted." };
  const head = lines[0].match(/^SHOP\s+(\S+)\s*\|\s*([^|]+)\|([^|]+)(?:\|([^|]+))?(?:\|(.+))?$/i);
  if (!head) return { error: `First line must be "SHOP id | label | index | chain | level" (got "${lines[0]}").` };
  const index = num(head[3]);
  const chain = head[4] != null ? num(head[4]) : NaN;
  if (!Number.isFinite(index)) return { error: `Bad index score: "${head[3]}"` };
  if (head[4] != null && !Number.isFinite(chain)) return { error: `Bad chain score: "${head[4]}"` };
  const categories = [];
  for (const line of lines.slice(1)) {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 3 || !parts[0]) return { error: `Category rows are "name | weight | score": "${line}"` };
    const weight = num(parts[1]), score = num(parts[2]);
    if (!Number.isFinite(weight) || !Number.isFinite(score)) return { error: `Bad number in: "${line}"` };
    categories.push({ name: parts[0], weight, score });
  }
  return {
    id: head[1], label: head[2].trim(), index,
    chain: Number.isFinite(chain) ? chain : "",
    level: (head[5] || "").trim(),
    categories,
  };
}

export function parseScorecardPaste(text) {
  const lines = splitLines(text);
  if (!lines.length) return { error: "Nothing pasted." };
  const head = lines[0].match(/^SCORECARD\s+(Q[1-4])$/i);
  if (!head) return { error: `First line must be "SCORECARD Q1..Q4" (got "${lines[0]}").` };
  const rows = [];
  for (const line of lines.slice(1)) {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 2 || !parts[0]) return { error: `Rows are "row label | value | benchmark?": "${line}"` };
    rows.push({ label: parts[0], value: parts[1], bench: parts[2] != null && parts[2] !== "" ? parts[2] : null });
  }
  if (!rows.length) return { error: "No rows followed the quarter." };
  return { quarter: head[1].toUpperCase(), rows };
}

/* Labor Cost Opportunity, from the TIR Overview.

   ★ EVERY ROW IS CROSS-CHECKED, and that is the point of this parser. The
   report gives the same fact twice: opportunity % IS FCR wages % minus the
   benchmark's wages %. A mis-keyed digit breaks that identity, so a bad paste
   fails loudly here instead of landing in the trend as a plausible number
   nobody would ever question. Tolerance is 0.02 because the report rounds each
   figure to two places independently, so exact equality is not available. */
const LB_TIERS = ["10", "20", "33", "50"];
const LB_TOLERANCE = 0.02;

export function parseLaborBenchPaste(text) {
  const lines = splitLines(text);
  if (!lines.length) return { error: "Nothing pasted." };
  const head = lines[0].match(/^LABORBENCH\s+(\d{4}-\d{2})(?:\s*\|\s*(.+))?$/i);
  if (!head) return { error: `First line must be "LABORBENCH YYYY-MM" (got "${lines[0]}").` };
  const ym = head[1];
  const [y, m] = ym.split("-").map(Number);
  if (!(m >= 1 && m <= 12)) return { error: `"${ym}" is not a real month.` };
  const label = (head[2] || "").trim()
    || new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  let wagesPct = null, productivity = null;
  const tiers = {};
  for (const line of lines.slice(1)) {
    const parts = line.split("|").map((p) => p.trim());
    const kind = (parts[0] || "").toLowerCase();

    if (kind === "wages" || kind === "productivity") {
      const v = num(parts[1]);
      if (!Number.isFinite(v)) return { error: `"${kind}" needs one number: "${line}"` };
      if (v <= 0) return { error: `"${kind}" must be above zero (got ${v}).` };
      if (kind === "wages") wagesPct = v; else productivity = v;
      continue;
    }

    const tierM = kind.match(/^top\s*(\d+)%?$/);
    if (!tierM) return { error: `Rows start with "wages", "productivity", or "top N": "${line}"` };
    const tier = tierM[1];
    if (!LB_TIERS.includes(tier)) {
      return { error: `Unknown benchmark "top ${tier}" — use top 10, top 20, top 33, or top 50.` };
    }
    if (tiers[tier]) return { error: `"top ${tier}" appears twice.` };
    const nums = parts.slice(1, 5).map(num);
    if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) {
      return { error: `"top ${tier}" needs four numbers: benchmark %, opportunity %, opportunity $, daily hours. Got "${line}"` };
    }
    tiers[tier] = { benchPct: nums[0], oppPct: nums[1], oppDollars: nums[2], oppHours: nums[3] };
  }

  if (wagesPct == null) return { error: 'Missing the "wages" row (FCR Wages %).' };
  if (productivity == null) return { error: 'Missing the "productivity" row (Labor Productivity $).' };
  const found = LB_TIERS.filter((t) => tiers[t]);
  if (!found.length) return { error: "No benchmark rows — add at least one \"top N\" line." };

  for (const t of found) {
    const row = tiers[t];
    const expected = wagesPct - row.benchPct;
    if (Math.abs(expected - row.oppPct) > LB_TOLERANCE) {
      return { error: `"top ${t}" does not add up: ${wagesPct} minus ${row.benchPct} is ${expected.toFixed(2)}, but the opportunity % says ${row.oppPct}. Check the paste against the report.` };
    }
  }

  return { ym, label, wagesPct, productivity, tiers };
}
