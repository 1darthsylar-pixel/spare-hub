/* ============================================================================
   expenseImport.js — turn Cindy's monthly RPIS category report into ledger
   entries for ExpenseTracker.jsx.

   WHY THIS EXISTS (Cindy, Aug 11 2026): "I'm wondering if instead of entering
   invoices into the Hub expense module daily, I could send you this report at
   the end of every month. Would having the categories and totals be enough for
   your projections?" Yes — so this is the paste-in path that keeps her time
   saved without anyone retyping sixteen rows.

   ★ LEAF MODULE ON PURPOSE. Imports NOTHING. Every decision that touches money
   lives here as a pure function so it can be sliced out and driven against the
   real report text, which is exactly how it was verified. The React file below
   it only renders what these functions return.

   ⚠️ THE REPORT AND THE HUB DO NOT SPEAK THE SAME LANGUAGE. Measured Aug 11
   2026 against the live category list: of the sixteen lines Cindy sends, only
   THREE match a Hub category name exactly (Uniforms, Recruiting, Office
   Supplies) and EIGHT match nothing at all. RPIS says "Food - Bread" where the
   Hub says "Bread-Auto Rolls". That is why nothing here auto-imports on a
   guess: a suggestion is offered, a human confirms it once, and the confirmed
   answer is remembered so the second month is a glance instead of a decision.

   ⚠️⚠️ THE REPORT IS NOT ALWAYS AN EXPENSE REPORT. The two files Matt opened on
   Aug 11 2026 were the same month — fourteen of sixteen lines identical to the
   penny — yet one carried a $2,000 "Additional Profit" line that is not a cost
   at all. Summing that column blind reads $12,439.63 for a month whose real
   spend is $10,439.63. A row can therefore be marked SKIP, and skip is
   remembered like any other answer, so a revenue line refuses itself every
   month after the first.

   ⚠️ A TOTAL ROW IS REFUSED, NOT IMPORTED. An export that includes its own
   "Total" line would otherwise land as a category and double the month. That is
   the one parsing mistake that silently doubles real money, so it is blocked
   with a reason rather than skipped quietly.

   ⚠️ NEGATIVES ARE REFUSED, and this is deliberate rather than lazy. The entry
   form strips "-" in cleanAmt, so a negative amount is one the form can display
   but cannot re-create or edit. Importing one would put a figure on the ledger
   that nobody can correct in place, which is the shape of bug rule 1 exists
   for. Refusing it puts the row in front of a human instead.

   Storage this module names but never touches (the tile does the writing):
     gcfcr-expenses-catmap-v1  { version:1, map: { [reportName]: catId|"__skip__" } }
   New key, no old readers, so there is no stored shape to break.
   ============================================================================ */

/* The marker every imported entry carries. Replacement on a second paste is by
   THIS FIELD, never by id or by index: an entry Cindy or Matt typed by hand has
   no `src` and can therefore never be cleared by an import. Old entries written
   before today have no `src` either, which is the same thing and is why this is
   safe against every record already on file. */
export const IMPORT_SRC = "rpis";
export const CATMAP_KEY = "gcfcr-expenses-catmap-v1";
export const SKIP = "__skip__";

/* What shows in the Company column for an imported row. It is honest about
   where the number came from, and it deliberately matches NO real vendor, so
   the tile's "waiting on N repeats" watch cannot be fooled into thinking a
   specific supplier was paid because a category total arrived. */
export const IMPORT_COMPANY = "RPIS monthly report";

/* ---------------- normalising ----------------
   Punctuation is noise here: "Linen- Mops/cloths" and "Linen" differ by a
   hyphen and a slash, not by meaning. Lowercase, turn every non-alphanumeric
   run into one space, trim.
   ⚠️ NOT the same as ExpenseTracker's `norm`, which only lowercases and trims a
   company name for equality. Different job, different file, different name, so
   neither can drift into the other (rule 8). */
export const normLabel = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* "TM" is Chick-fil-A for "team member" and the two spellings sit on opposite
   sides of this match: the report says "Team Member Development", the Hub says
   "TM Development". Expanding one token turns a 0.4 near-miss into an exact
   hit. Kept to the aliases actually observed in the live data — a general
   synonym table would be a config system for one setting (rule 4).

   ⚠️ "opr" WAS HERE AND WAS REMOVED, Aug 11 2026, because it produced a
   confidently WRONG answer: expanding it made "Catering - Mileage - Opr" score
   0.40 against "Operator Wellness" — the single highest match in the report —
   while the two genuinely catering-shaped categories sat just under the floor
   at 0.33. A screenshot caught it; no assertion did, because the assertions
   only checked the matches I expected to be right. A mileage bill filed under
   Operator Wellness is the kind of wrong that survives a whole year of
   projections, and "accept the suggestions" is one click. With the alias gone
   that row simply asks for a category, which is the honest answer. */
const ALIAS = { tm: ["team", "member"], bldg: ["building"], maint: ["maintenance"], util: ["utility"], exp: ["expense"] };
const tokens = (s) => {
  const out = [];
  for (const t of normLabel(s).split(" ")) {
    if (!t) continue;
    if (ALIAS[t]) out.push(...ALIAS[t]);
    else out.push(t);
  }
  return out;
};

/* Dice coefficient over tokens, with partial credit when one token is a prefix
   of the other and the shared prefix is long enough to mean something
   ("lndscp" against "landscaping" is not a match; "maint" against
   "maintenance" is). Under twenty lines and specific to this pairing, so it
   stays hand-written rather than pulling a dependency (rule 5). */
const PREFIX_MIN = 4;
export function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.length || !B.length) return 0;
  const used = new Array(B.length).fill(false);
  let hits = 0;
  for (const ta of A) {
    let best = -1, bestScore = 0;
    for (let i = 0; i < B.length; i++) {
      if (used[i]) continue;
      const tb = B[i];
      let s = 0;
      if (ta === tb) s = 1;
      else if (ta.length >= PREFIX_MIN && tb.startsWith(ta)) s = 0.75;
      else if (tb.length >= PREFIX_MIN && ta.startsWith(tb)) s = 0.75;
      if (s > bestScore) { bestScore = s; best = i; }
    }
    if (best >= 0) { used[best] = true; hits += bestScore; }
  }
  return (2 * hits) / (A.length + B.length);
}

/* Below this a suggestion is worse than no suggestion: it invites a confirming
   click on a category nobody actually checked. Measured against the live
   sixteen rows — every pairing this lets through is one a person would
   recognise, and the ones it rejects genuinely have no counterpart. */
export const SUGGEST_MIN = 0.34;

/* ---------------- amounts ----------------
   Accepts what Numbers and Excel actually paste: "3805.50", "3805.5", "666",
   "1,237.50", "$1,237.50". Parentheses and a leading minus are RECOGNISED so
   they can be refused with a reason, never silently read as positive — a
   credit that imports as a charge is money moving the wrong way in silence. */
export function readAmount(tok) {
  const raw = String(tok == null ? "" : tok).trim();
  if (!raw) return null;
  const neg = /^\(.*\)$/.test(raw) || /^-/.test(raw.replace(/^\(|\)$/g, "").trim());
  const digits = raw.replace(/[()$,\s-]/g, "");
  if (!digits || !/^\d*\.?\d+$/.test(digits)) return null;
  const n = Number(digits);
  if (!isFinite(n)) return null;
  return { n, neg };
}

/* Name greedy, amount anchored at the end. Greedy matters: "Beverage/ Lease/CO2
   123.45" must keep CO2 in the name and take only the trailing number.
   Covers tab-separated text (what copying spreadsheet CELLS gives you) and
   plain runs of spaces. */
const LINE_RE = /^(.*\S)[ \t]+(\(?\s*-?\s*\$?\s*[\d,]*\.?\d+\s*\)?)$/;
const TOTAL_RE = /^(grand |sub)?total( amount)?$|^sum$/;

/* ★ CSV, added Aug 11 2026. Matt asked Cindy to send CSV rather than Numbers,
   because CSV opens on anything and he can read it on a phone without the
   Numbers app. Measured before that reply: a raw CSV paste read ZERO rows,
   because the only separators understood were tabs and spaces. It failed
   visibly rather than wrongly, which is the right kind of failure, but it
   failed — and CSV is now the format he has asked her for.

   Quote-aware on purpose: a spreadsheet writes `"Linen, Mops",133.35` and
   `"3,805.50"`, so a naive split on commas would cut a name in half or turn
   three thousand dollars into three. Doubled quotes inside a quoted field are
   an escaped quote, per the format. */
function splitCsv(line) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  while (out.length > 1 && out[out.length - 1] === "") out.pop();
  return out;
}

/* ---------------- parsing ----------------
   Three buckets, and the split is the point:
     rows    — usable, will be offered for mapping
     blocked — parsed as money but REFUSED, each with a reason a person can read
     ignored — never looked like a data row at all (the header, blank lines)
   A header is not detected by matching the word "Category": it is detected by
   its second column failing to be a number, which is true of every header any
   export could produce. */
export function parseReport(text) {
  const rows = [], blocked = [];
  let ignored = 0;
  for (const line of String(text == null ? "" : text).split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;

    /* Tabs and spaces first, so every file that worked before this existed
       behaves identically. CSV is only tried when that fails AND the line
       carries a comma, which no tab-separated row from a spreadsheet does. */
    let name, amtTok;
    const m = LINE_RE.exec(t);
    if (m) { name = m[1].trim(); amtTok = m[2]; }
    else if (t.includes(",")) {
      const f = splitCsv(t);
      if (f.length === 2) { name = f[0]; amtTok = f[1]; }
      else if (f.length > 2 && readAmount(f[f.length - 1])) {
        /* ⚠️⚠️ AMBIGUOUS, SO REFUSED RATHER THAN GUESSED. `Food,1,237.50` and
           `Linen, Mops,133.35` are the same shape to a parser, and the two
           sensible readings disagree by a thousand dollars: join-the-tail makes
           the first $1,237.50, take-the-last makes it $237.50 — and whichever
           rule is picked, the other line is read wrong. A spreadsheet QUOTES a
           field containing a comma, so an unquoted one is malformed input, not
           a case to be clever about. It goes in front of a person with a
           reason, which is what every other refusal here does. */
        blocked.push({ name: f.slice(0, -1).join(", "), amount: readAmount(f[f.length - 1]).n,
          why: "More than two columns, or a comma inside a name that is not in quotes. Cannot tell which part is the amount." });
        continue;
      } else { ignored++; continue; }
    } else { ignored++; continue; }

    const amt = readAmount(amtTok);
    if (!amt) { ignored++; continue; }
    if (TOTAL_RE.test(normLabel(name))) {
      blocked.push({ name, amount: amt.n, why: "Looks like a total row. Importing it would count the month twice." });
      continue;
    }
    if (amt.neg) {
      blocked.push({ name, amount: -amt.n, why: "Negative amount. Record a credit by hand so it can be edited later." });
      continue;
    }
    if (amt.n === 0) {
      blocked.push({ name, amount: 0, why: "Zero amount. Nothing to record." });
      continue;
    }
    rows.push({ name, amount: amt.n, amountStr: amt.n.toFixed(2) });
  }
  return { rows, blocked, ignored };
}

/* ---------------- mapping ----------------
   Precedence, highest first:
     saved   — a human already answered this exact name. Never second-guessed.
     exact   — the two names normalise identically.
     suggest — best scorer above the floor. NOT applied, only offered.
     none    — no opinion.
   `how` travels with the row so the screen can show which rows still need a
   person and which are already settled. Only "saved" and "exact" arrive
   pre-filled; everything else starts empty on purpose. */
export function planImport(rows, cats, savedMap) {
  const map = savedMap || {};
  const list = Array.isArray(cats) ? cats : [];
  return (rows || []).map((r) => {
    const saved = map[r.name] || map[normLabel(r.name)];
    if (saved) return { ...r, catId: saved, how: "saved", score: 1 };
    const exact = list.find((c) => normLabel(c.name) === normLabel(r.name));
    if (exact) return { ...r, catId: exact.id, how: "exact", score: 1 };
    let best = null, bestScore = 0;
    for (const c of list) {
      const s = similarity(r.name, c.name);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (best && bestScore >= SUGGEST_MIN) return { ...r, catId: "", how: "suggest", suggestId: best.id, score: bestScore };
    return { ...r, catId: "", how: "none", score: 0 };
  });
}

/* Last day of the month being viewed. The MONTH is decided by the storage key,
   never by this date, so it is presentation only: it sorts imported rows below
   the dated payments and can never place a cost in a month it did not happen
   in. */
export function lastDayOf(ym) {
  const [y, m] = String(ym || "").split("-").map(Number);
  if (!y || !m) return String(ym || "");
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

const slug = (s) => normLabel(s).replace(/ /g, "-").slice(0, 40) || "row";

/* Build the entries. Shape is EXACTLY what the entry form already writes —
   id, date, company, cat, amount (a STRING, as the form stores it), note —
   plus one new optional field, `src`. Adding a field cannot break a reader that
   never looks for it, which is what keeps every record written before today
   readable (rule 1). */
export function entriesFrom(plan, ym) {
  const seen = new Map();
  const out = [];
  for (const r of plan || []) {
    if (!r || !r.catId || r.catId === SKIP) continue;
    const base = `imp_${ym}_${slug(r.name)}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    out.push({
      id: n > 1 ? `${base}_${n}` : base,
      date: lastDayOf(ym),
      company: IMPORT_COMPANY,
      cat: r.catId,
      amount: r.amountStr,
      note: `RPIS report: ${r.name}`,
      src: IMPORT_SRC,
    });
  }
  return out;
}

/* A second paste of the same report must not double the month. Every prior
   imported row is dropped and the fresh set takes its place; anything without
   the marker — every hand-typed payment, and every record that predates this
   feature — is carried through untouched and in its original order. */
export function replaceImported(entries, fresh) {
  const kept = (Array.isArray(entries) ? entries : []).filter((e) => !e || e.src !== IMPORT_SRC);
  return [...kept, ...(fresh || [])];
}

export const importedCount = (entries) => (Array.isArray(entries) ? entries : []).filter((e) => e && e.src === IMPORT_SRC).length;

/* What the confirm button commits to, computed from the same plan the screen is
   showing so the number under the button and the number that lands are the same
   number. */
export function importSummary(plan) {
  const ready = (plan || []).filter((r) => r && r.catId && r.catId !== SKIP);
  const skipped = (plan || []).filter((r) => r && r.catId === SKIP);
  const pending = (plan || []).filter((r) => r && !r.catId);
  return {
    ready: ready.length,
    skipped: skipped.length,
    pending: pending.length,
    total: ready.reduce((s, r) => s + (Number(r.amountStr) || 0), 0),
  };
}

/* The answers a human gave, ready to store. Only decided rows are written, so
   an untouched row never freezes a guess into the saved map. */
export function mapFrom(plan, prev) {
  const next = { ...(prev || {}) };
  for (const r of plan || []) {
    if (r && r.name && r.catId) next[r.name] = r.catId;
  }
  return next;
}
