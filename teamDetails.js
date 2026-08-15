/* ══════════════════════════════════════════════════════════════════════════
   teamDetails.js — EMAILS, PHONE NUMBERS AND HIRE DATES, out of the two
   HotSchedules staff exports.

   ★ NEAR-LEAF. Imports nameMatch.js and payRates.js and nothing else. No React,
   no storage, no UI.

   ⚠️ `nameFromExport` AND `isoFromUs` COME FROM payRates.js, not from a second
   copy here. They live there because the salary export needed them first, and
   one definition of "flip Last, First" and "read a US date" is the whole of
   rule 8. A second pair would drift on exactly the names and dates that are
   hardest to notice.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ THE TWO EXPORTS WRITE NAMES DIFFERENTLY AND IT IS EASY TO MISS.
   ────────────────────────────────────────────────────────────────────────
       staff export      "Jessica Acuna"              First Last
       hire date export  "Acuna, Jessica V (Jessica)" Last, First M (Preferred)
   Measured on the real files: 101 of 101 contact names carry no comma, and 102
   of 102 hire-date names do. Running one through the other's reader gives
   "Acuna Jessica" or "Jessica Acuna" reversed, which then matches nobody and
   looks like a roster problem rather than a parsing one. Each parser states
   which shape it expects and `nameFromExport` handles both anyway.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ THERE ARE TWO HIRE DATES AND THEY ARE NOT THE SAME QUESTION.
   ────────────────────────────────────────────────────────────────────────
   `Location Hire Date` is when somebody started AT THIS STORE. `Operator Hire
   Date` is when they started working FOR THE OPERATOR, which is earlier for
   anybody who transferred in or predates the store.

   Measured: they differ for 6 of 102 people, and in all 6 the operator date is
   earlier — one by six years. `hireDate` drives the evaluation clock and shows
   as tenure, so choosing wrongly silently moves six people's review dates.

   ⇒ THIS FILE DOES NOT CHOOSE. The caller passes `which`, the screen offers it,
   and BOTH dates are returned on every row so nothing is thrown away whichever
   way it goes. The people who differ come back in `differing` so the screen can
   name them instead of quietly picking for the store.
   ══════════════════════════════════════════════════════════════════════════ */

import { normName } from "./nameMatch.js";
import { nameFromExport, isoFromUs } from "./payRates.js";

/* Where contact details already live. `gcfcr-hr-info` is HR-protected and
   own-row-only, which is exactly the right standing for somebody's phone
   number, so nothing new is invented for it.
   ⚠️ THE RECORD ALREADY HOLDS `email`, `hireDate` and `termDate` for ~106 live
   people. `phone` is ADDED to that shape; nothing existing is replaced, and
   every merge below is per person and per field. Rule 1. */
export const INFO_KEY = "gcfcr-hr-info";

export const HIRE_SOURCES = Object.freeze([
  { key: "operator", label: "Operator hire date", hint: "when they started working for you, even at another store" },
  { key: "location", label: "Location hire date", hint: "when they started at this store" },
]);

/* Split a pasted sheet row. Tabs are the real separator; 2+ spaces are accepted
   because some paste paths flatten tabs. */
const cellsOf = (line) => (line.includes("\t") ? line.split("\t") : line.split(/\s{2,}/));

const HEADERS = {
  name: /^(employee\s*)?name$/i,
  phone: /^phone$/i,
  email: /^e-?mail$/i,
  locationHire: /^location\s*hire\s*date$/i,
  operatorHire: /^operator\s*hire\s*date$/i,
};

/* Find the header row and map the columns we care about by NAME.
   ⚠️ BY HEADING, NEVER BY POSITION — the salary export taught that lesson the
   hard way, where omitted empty cells shifted a date into a money column. */
function locate(lines) {
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cells = cellsOf(lines[i]).map((c) => c.trim());
    const col = {};
    cells.forEach((c, idx) => {
      Object.keys(HEADERS).forEach((k) => { if (HEADERS[k].test(c)) col[k] = idx; });
    });
    if (col.name != null && (col.phone != null || col.email != null || col.operatorHire != null || col.locationHire != null)) {
      return { at: i, col };
    }
  }
  return null;
}

/* ⚠️ A PHONE HAS AT LEAST SEVEN DIGITS. `/\d/` was too loose and let the
   export's footer row through: "Aug 13, 2026 10:57 AM" carries a "1" in the
   phone column, which passed, kept the row alive, and imported a person called
   "2026 10:57 AM Aug 13". A fake team member is worse than a missing one — it
   gets reported as "not on the roster" and sends somebody looking for them. */
const PHONE_OK = (s) => (String(s).match(/\d/g) || []).length >= 7;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Phone kept EXACTLY as the export writes it, "(336) 555-0100".
   ⚠️ NOT NORMALISED TO DIGITS. It is displayed and tapped, never compared, and
   a store that reads it off a screen wants it in the shape it is used to. */
const cleanPhone = (s) => String(s || "").trim();

/* ── the two exports ─────────────────────────────────────────────────────
   One entry point, because a leader should be able to paste whichever export
   they have open without first telling the Hub which one it is. */

export function parseTeamDetails(text, opts) {
  const which = (opts && opts.hire) === "location" ? "location" : "operator";
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  const problems = [], rows = [];
  if (!lines.length) return { rows, problems: [{ line: "", why: "nothing pasted" }], kind: "", differing: [] };

  const found = locate(lines);
  if (!found) {
    return {
      rows, kind: "", differing: [], skipped: [],
      problems: [{ line: lines[0].slice(0, 80), why: "could not find a Name column with Phone, Email or a hire date beside it" }],
    };
  }
  const { at, col } = found;
  const hasContact = col.phone != null || col.email != null;
  const hasHire = col.operatorHire != null || col.locationHire != null;
  const kind = hasContact && hasHire ? "both" : hasContact ? "contact" : "hire";

  const differing = [], skipped = [];
  for (let i = at + 1; i < lines.length; i++) {
    const cells = cellsOf(lines[i]);
    const at2 = (k) => (col[k] == null ? "" : String(cells[col[k]] || "").trim());
    const raw = at2("name");
    if (!raw) continue;
    /* ⚠️ `nameFromExport` HANDLES BOTH SHAPES. It flips on a comma and leaves a
       plain "First Last" alone, so one call covers both exports. */
    const name = nameFromExport(raw);
    if (!name) { problems.push({ line: raw, why: "could not read a name" }); continue; }

    const row = { name };
    if (hasContact) {
      const phone = cleanPhone(at2("phone"));
      const email = String(at2("email") || "").trim().toLowerCase();
      if (phone && PHONE_OK(phone)) row.phone = phone;
      /* ⚠️ A MALFORMED EMAIL IS REPORTED, NOT STORED. An address the Hub cannot
         send to is worse than a blank one: the blank gets chased, the broken one
         looks filled in and silently bounces. */
      /* ⚠️ "NOT AN EMAIL" AND "A BROKEN EMAIL" ARE DIFFERENT, AND ONLY ONE IS
         WORTH REPORTING. The real export carries a footer row whose email cell
         is "/", and calling that a malformed address sends a leader looking for
         a person who does not exist. Only something that TRIED to be an
         address — it has an @ — is reported when it fails. */
      if (email && email.includes("@")) {
        if (EMAIL_OK.test(email)) row.email = email;
        else problems.push({ line: raw, why: `email does not look like an address ("${email}")` });
      }
    }
    if (hasHire) {
      const loc = isoFromUs(at2("locationHire"));
      const op = isoFromUs(at2("operatorHire"));
      if (loc) row.locationHireDate = loc;
      if (op) row.operatorHireDate = op;
      const pick = which === "location" ? loc : op;
      const other = which === "location" ? op : loc;
      if (pick) row.hireDate = pick;
      else if (other) {
        /* Only one of the two is readable, so use it and say so rather than
           leaving somebody with no hire date at all. */
        row.hireDate = other;
        problems.push({ line: raw, why: `only one hire date was readable, used ${other}` });
      }
      if (loc && op && loc !== op) differing.push({ name, location: loc, operator: op });
    }

    /* ⚠️ A ROW THAT YIELDED NOTHING IS NOT A PERSON. Both exports end with a
       footer line — "Aug 13, 2026 10:57 AM" in the staff one — which has a name
       column and nothing else, and would otherwise be imported as a team member
       and then reported as "not on the roster", sending somebody looking for a
       person who does not exist. Counted, not silently dropped. */
    if (!row.email && !row.phone && !row.hireDate) { skipped.push(raw); continue; }
    rows.push(row);
  }
  return { rows, problems, kind, differing, skipped };
}

/* Report names → roster ids. Ambiguity is a miss, never a guess. */
export function matchDetailsToRoster(rows, team) {
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

/* Merge into the live `gcfcr-hr-info` map.

   ⚠️⚠️ PER PERSON AND PER FIELD. That record already holds `email`, `hireDate`
   and `termDate` for everybody, and a termination date is not something an
   import of phone numbers may touch. Only the fields the export actually
   carried are written, and only for the people it matched — everything else on
   the record is left exactly as it was. Rule 1.

   ⚠️ AN EXISTING VALUE IS ONLY REPLACED WHEN THE EXPORT HAS ONE. A blank cell
   never blanks a record that somebody typed by hand. */
export function mergeDetails(info, matched, stamp) {
  const base = info && typeof info === "object" ? info : {};
  const next = { ...base };
  let changed = 0;
  (Array.isArray(matched) ? matched : []).forEach((r) => {
    const cur = { ...(next[r.id] || {}) };
    let touched = false;
    ["email", "phone", "hireDate", "locationHireDate", "operatorHireDate"].forEach((f) => {
      if (r[f] && cur[f] !== r[f]) { cur[f] = r[f]; touched = true; }
    });
    if (!touched) return;
    cur.detailsAt = (stamp && stamp.at) || "";
    cur.detailsBy = (stamp && stamp.by) || "";
    next[r.id] = cur;
    changed++;
  });
  return { info: next, changed };
}
