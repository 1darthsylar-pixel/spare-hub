/* ══════════════════════════════════════════════════════════════════════════
   payRates.js — WHAT PEOPLE EARN. Shapes and parsing only.

   ★ NEAR-LEAF. Imports nameMatch.js and NOTHING ELSE. No React, no storage, no
   UI, so the labor maths can use it from anywhere and it can be tested without
   a screen.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ THIS IS THE MOST SENSITIVE DATA IN THE HUB. READ THE ACCESS NOTE.
   ────────────────────────────────────────────────────────────────────────
   `gcfcr-hr-pay-v1` is protected on the server and gated to a named list in the
   browser. Matt, Aug 13 2026: "only Nick hannah and myself can see wages".

   ⚠️ NOTHING HERE MAY BE RENDERED PER PERSON OUTSIDE HR CONSOLE. The schedule
   screens use this ONLY to add money up. A leader building a week must not
   learn what their team earns, and an aggregate is not a leak while an
   individual row is. That is a rule about the CALLER, and it is written here
   because this is the file a caller reaches for.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ A MISSING RATE IS NOT ZERO. EVER.
   ────────────────────────────────────────────────────────────────────────
   Two of the 102 people in the real export are salaried, so their hourly cell
   is EMPTY. Reading that as 0 would quietly shrink every labor total that
   included them, and the number would still look completely reasonable —
   which is the worst kind of wrong for a figure somebody makes decisions on.
   `hourlyFor` returns null when it does not know, `costOf` reports what it had
   to estimate, and the screen says so.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ THE EXPORT'S COLUMNS ARE READ BY HEADER NAME, NEVER BY POSITION.
   ────────────────────────────────────────────────────────────────────────
   Found the hard way while profiling the real file: the sheet has 11 headers
   and most rows carry 8 values, because the three columns that only apply to
   salaried people are omitted entirely rather than left blank. Counting across
   a row therefore reads the EFFECTIVE DATE as a salary. Anything that lines
   columns up by counting is wrong on this file, and wrong in a way that puts a
   date where money goes.
   ══════════════════════════════════════════════════════════════════════════ */

import { normName } from "./nameMatch.js";

export const PAY_KEY = "gcfcr-hr-pay-v1";
export const PAY_DEFAULT_KEY = "gcfcr-hr-pay-default-v1";

/* Guard the read. Rule 1. */
export function readPay(raw) {
  if (!raw || typeof raw !== "object") return { v: 1, people: {} };
  if (raw.people && typeof raw.people === "object") return { v: raw.v || 1, people: raw.people };
  return { v: 1, people: raw };
}

/* ── one person's rate ───────────────────────────────────────────────────
   A record is { rate, basis, monthly, effective, updatedAt, updatedBy }.
   `rate` is dollars per hour and may be null for somebody salaried. */

/* Hours a salaried person is treated as working, for turning a monthly figure
   into an hourly one.
   ⚠️ A CONVENTION, NOT A FACT, AND IT IS LABELLED AS ONE EVERYWHERE IT SHOWS.
   40 hours × 52 weeks ÷ 12 months. A salaried director's real cost per hour
   falls as they work more, which is the opposite of how this behaves, so any
   total containing one is marked estimated rather than presented as measured. */
export const SALARY_HOURS_PER_MONTH = (40 * 52) / 12;

/* Dollars per hour, or null when it is genuinely not known.
   ⚠️ NULL IS A REAL ANSWER. Callers must handle it rather than defaulting. */
export function hourlyFor(rec) {
  if (!rec) return null;
  const r = Number(rec.rate);
  if (Number.isFinite(r) && r > 0) return r;
  const m = Number(rec.monthly);
  if (Number.isFinite(m) && m > 0) return m / SALARY_HOURS_PER_MONTH;
  return null;
}

/* What a block of hours costs, and how honest that number is.
   Returns { dollars, known, estimated, unknown } — `estimated` counts people
   priced from the store default or from a monthly salary, `unknown` counts
   people with no rate and no default, whose hours are NOT in `dollars`. */
export function costOf(entries, pay, defaultRate) {
  const people = (pay && pay.people) || pay || {};
  const def = Number(defaultRate);
  let dollars = 0, known = 0, estimated = 0, unknown = 0;
  (Array.isArray(entries) ? entries : []).forEach((e) => {
    const hours = Number(e && e.hours) || 0;
    if (hours <= 0) return;
    const rec = people[String(e.id)];
    const exact = rec && Number(rec.rate) > 0 ? Number(rec.rate) : null;
    if (exact != null) { dollars += hours * exact; known++; return; }
    const derived = hourlyFor(rec);
    if (derived != null) { dollars += hours * derived; estimated++; return; }
    if (Number.isFinite(def) && def > 0) { dollars += hours * def; estimated++; return; }
    unknown++;
  });
  return { dollars, known, estimated, unknown };
}

/* ── the export ──────────────────────────────────────────────────────────
   Pasted out of the Employee Salary sheet. A paste keeps empty cells as empty
   TAB-SEPARATED fields, so a header row can be trusted to line the columns up —
   unlike the raw file, where empty cells are omitted entirely. */

const HEADERS = {
  name: /^employee\s*name$/i,
  job: /^job$/i,
  basis: /^salary\s*basis$/i,
  rate: /^hourly\s*rate$/i,
  monthly: /^entity\s*monthly\s*salary$/i,
  effective: /^effective\s*date$/i,
  reason: /^change\s*reason$/i,
};

const money = (s) => {
  const t = String(s || "").replace(/[$,\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/* MM/DD/YYYY → ISO. Returns "" for anything else rather than a guessed date.
   ⚠️ NO `new Date()`. Parsing "01/22/2026" with Date is locale-dependent and
   UTC-shifted; the whole string is right here in three pieces, so it is
   assembled rather than parsed. Same reasoning as timeOff.js. */
export function isoFromUs(s) {
  const m = String(s || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
}

/* "Acuna, Jessica V (Jessica)" → "Jessica Acuna".

   ⚠️ EVERY PART OF THIS IS IN THE REAL FILE. 102 of 102 names carry a comma,
   21 carry a preferred name in brackets, and surnames include two-word and
   hyphenated forms. The bracket is dropped rather than preferred, because the
   roster is keyed on legal names and `normName` has to match what HR stores.
   ⚠️ A LONE MIDDLE INITIAL IS DROPPED — "Jessica V" is Jessica. A trailing
   single letter is never a name a roster would carry. */
export function nameFromExport(raw) {
  let s = String(raw || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (s.includes(",")) {
    const [last, first] = s.split(",").map((x) => x.trim());
    s = `${first || ""} ${last || ""}`.trim();
  }
  /* ⚠️ A TRAILING ALL-DIGITS TOKEN IS NOT PART OF A NAME. The staff export
     writes one person as "Nick 04010" — the store number stapled on —
     which then matches nobody on the roster and reads as a missing person
     rather than a formatting artefact. Dropped generically rather than by
     matching this store's number, which would be rule 18 all over again. */
  s = s.replace(/\s+\d+\s*$/, "").trim();
  const parts = s.split(/\s+/).filter(Boolean);
  const kept = parts.filter((p, i) => !(i > 0 && i < parts.length - 1 && /^[A-Za-z]\.?$/.test(p)));
  /* also drop a trailing lone initial, which is where the middle initial lands
     once "Last, First M" has been flipped */
  while (kept.length > 2 && /^[A-Za-z]\.?$/.test(kept[kept.length - 1])) kept.pop();
  return kept.join(" ");
}

/* Split a pasted sheet into rows of cells. Tabs are the real separator; two or
   more spaces are accepted because some paste paths flatten tabs. */
function cellsOf(line) {
  return line.includes("\t") ? line.split("\t") : line.split(/\s{2,}/);
}

/* Returns { rows, problems }. A row it cannot price is a PROBLEM, never a zero. */
export function parsePayExport(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  const problems = [], rows = [];
  if (!lines.length) return { rows, problems: [{ line: "", why: "nothing pasted" }] };

  /* find the header row anywhere in the paste — exports often carry a title
     line above it */
  let hi = -1, col = {};
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cells = cellsOf(lines[i]).map((c) => c.trim());
    const found = {};
    cells.forEach((c, idx) => {
      Object.keys(HEADERS).forEach((k) => { if (HEADERS[k].test(c)) found[k] = idx; });
    });
    if (found.name != null && (found.rate != null || found.monthly != null)) { hi = i; col = found; break; }
  }
  if (hi < 0) {
    return { rows, problems: [{ line: lines[0].slice(0, 80), why: "could not find the Employee Name and Hourly Rate headers" }] };
  }

  for (let i = hi + 1; i < lines.length; i++) {
    const cells = cellsOf(lines[i]);
    const at = (k) => (col[k] == null ? "" : String(cells[col[k]] || "").trim());
    const raw = at("name");
    if (!raw) continue;
    const name = nameFromExport(raw);
    if (!name) { problems.push({ line: raw, why: "could not read a name" }); continue; }

    const basis = at("basis") || "";
    const rate = money(at("rate"));
    const monthly = money(at("monthly"));
    if (rate == null && monthly == null) {
      /* ⚠️ REPORTED, NEVER STORED AS ZERO. See the header. */
      problems.push({ line: raw, why: `no rate and no monthly salary${basis ? ` (basis "${basis}")` : ""}` });
      continue;
    }
    rows.push({
      name, rate, monthly, basis,
      job: at("job") || "",
      effective: isoFromUs(at("effective")),
      reason: at("reason") || "",
    });
  }
  return { rows, problems };
}

/* Report names → roster ids. Ambiguity is a miss, never a guess — the same rule
   availability.js follows, and it matters more here: a wrong match writes one
   person's wage onto somebody else's record. */
export function matchPayToRoster(rows, team) {
  const byNorm = new Map(), dupes = new Set();
  (Array.isArray(team) ? team : []).forEach((m) => {
    if (!m || m.id == null || !m.name) return;
    const k = normName(m.name);
    if (!k) return;
    if (byNorm.has(k)) dupes.add(k);
    byNorm.set(k, m);
  });
  const matched = [], unmatched = [];
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    const k = normName(r.name);
    const hit = k && !dupes.has(k) ? byNorm.get(k) : null;
    if (hit) matched.push({ ...r, id: String(hit.id), rosterName: hit.name });
    else unmatched.push({ name: r.name, reason: dupes.has(k) ? "two people share that name" : "not on the roster" });
  });
  return { matched, unmatched };
}

/* ══════════════════════════════════════════════════════════════════════════
   ★★ ONE PERSON'S RATE, TYPED.

   Matt, Aug 20 2026: "make the rates editable where they are shown."

   ⚠️⚠️ THIS IS THE AFFORDANCE THE MONEY RULE ASKS FOR, NOT AN EXCEPTION TO IT.
   The rule is "never do surgical edits to stored data — build the affordance
   that lets the owner fix it, or fix the code that produced it". Until now a
   wrong rate could only be corrected by re-pasting the whole salary export,
   which is not a fix a person can make for one starter who just got a raise.

   ⚠️ IT KEEPS THE REST OF THE RECORD. `basis`, `monthly` and `effective` came
   from the payroll export and are still true; wiping them would lose the fact
   that somebody is salaried and quietly change what every other screen says
   about them.

   ⚠️ AN HOURLY RATE BEATS A SALARY ON PURPOSE — `hourlyFor` prefers `rate` —
   so typing one for a salaried person turns an estimate into a measured
   figure. That is the right way round and the screen says so.

   ⚠️ RETURNS null RATHER THAN SAVING SOMETHING UNREADABLE (money rule 2). A
   blank box is the one exception and means "no rate", which is a real answer
   and is NOT zero: `hourlyFor` treats null as unknown and the totals leave the
   person out and count them, rather than pricing their hours at nothing. */
export function setRate(stored, id, raw, stamp) {
  const base = readPay(stored).people;
  const key = String(id == null ? "" : id);
  if (!key) return null;
  const txt = String(raw == null ? "" : raw).replace(/[$,\s]/g, "").trim();
  let rate = null;
  if (txt !== "") {
    const n = Number(txt);
    /* ⛔ ZERO IS REFUSED, NOT STORED. Nobody is paid nothing, so a typed 0 is a
       slip, and storing it would price their hours at zero in every total
       silently. Clearing the box is how you say "no rate". */
    if (!Number.isFinite(n) || n <= 0) return null;
    rate = n;
  }
  const prev = base[key] || {};
  return {
    v: 1,
    people: {
      ...base,
      [key]: {
        ...prev,
        rate,
        updatedAt: (stamp && stamp.at) || "",
        updatedBy: (stamp && stamp.by) || "",
      },
    },
  };
}

/* Merge into the stored map without touching anybody the export did not cover. */
export function mergePay(stored, matched, stamp) {
  const base = readPay(stored).people;
  const people = { ...base };
  matched.forEach((r) => {
    people[r.id] = {
      rate: r.rate == null ? null : r.rate,
      monthly: r.monthly == null ? null : r.monthly,
      basis: r.basis || "",
      effective: r.effective || "",
      updatedAt: (stamp && stamp.at) || "",
      updatedBy: (stamp && stamp.by) || "",
    };
  });
  return { v: 1, people };
}
