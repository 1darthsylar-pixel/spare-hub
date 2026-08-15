/* ══════════════════════════════════════════════════════════════════════════
   teamImport.js — READ A CFA HOME "EMPLOYEE LIST" EXPORT AND WORK OUT WHO IS
   MISSING FROM THE ROSTER.

   ★ LEAF MODULE. It imports nameMatch.js and NOTHING else, and it must stay
   that way. HRConsole.jsx already sits in the middle of the import graph
   (Leadership101 → HRConsole → …), so parsing logic that lived in the console
   would be one more edge in the knot nameMatch.js exists to keep untied.

   ── WHAT THIS IS FOR ──
   Matt, Aug 6 2026: "i just want the box and for future imports only add names
   not currently in", and "this is for the hub clone".

   Two jobs, one behaviour:
     · Gate City — a monthly export, and only the handful of new hires come in.
     · A cloned Hub for another store — the roster is empty, so everyone comes
       in and the clone stops depending on the 106 names hardcoded in hrTeam.js.

   ⚠️ ADD-ONLY, ALWAYS. Nothing here updates, renames, retitles or removes a
   person who is already on the roster. Job titles from CFA Home seed a NEW
   person and never reach an existing one, which is what "keep ours for
   override" means: gcfcr-hr-roles is never touched because this never looks at
   anybody who already has a record.

   ⚠️ NAME AND TITLE ONLY. The export also carries home addresses, birth dates,
   personal phone numbers and emergency contacts for every team member. None of
   it is parsed, none of it is returned, none of it is stored. The roster needs
   a name and a role; hoovering the rest into KV would put 103 people's home
   addresses behind nothing but a PIN.
   ══════════════════════════════════════════════════════════════════════════ */

import { normName } from "./nameMatch.js";

/* ── HEADERS ───────────────────────────────────────────────────────────────
   Column ORDER is not assumed. The Aug 2026 export puts Full Name at column 1
   and Job at column 4 with 18 more between and after them, but a store pasting
   two hand-picked columns is just as valid, and a corporate revision that adds
   a column would silently shift a fixed index onto the wrong field.
   Matching is on the header text, lowercased with punctuation removed. */
const headerKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/* 🐛 A HEADER ALIAS MUST NOT ALSO BE A VALUE (caught in the browser, Aug 6
   2026). "teammember" and "employee" were in this list, and both are real JOB
   titles — "Team Member" is 86 of the 103 rows in the Aug 2026 export, and
   hrRoster.js ranks "Employee" as a title in its own right. A paste with no
   header row therefore found a "header" in its FIRST DATA ROW, locked the name
   column onto the job column, and imported 103 people named after their title.
   An alias here has to be a word that only ever appears in a header. */
const NAME_HEADERS = ["fullname", "name", "employeename", "teammembername"];
/* Job aliases carry no such risk: they are only looked for in the row where a
   name header already matched, so that row is known to be a header. */
const JOB_HEADERS = ["job", "jobtitle", "title", "position", "role"];
/* ── EMAIL. Matt, Aug 10 2026: "don't emails need to be in HR for documentation".
   YES, and without one the Hub goes quiet: every document builder in worker.js
   is written `if (b.member?.email)`, so a person with no address on file has
   their write-up filed and is told NOTHING. jobsForWriteup, the added-document
   notice and the leadership-standard notice all skip silently.
   ⚠️ NOT push notifications, which he also asked about. Those are Web Push —
   a per-device browser subscription in gcfcr-push-subs-v1, set up from the bell
   toggle. No address is involved and nothing here feeds them.
   ⚠️ THE ADDRESS NEVER TOUCHES THE ROSTER ROW. HRConsole.addMembers already
   routes it to gcfcr-hr-info, which is on HR_PROTECTED, precisely because the
   roster row is world readable. This only has to hand it over; the existing
   split does the rest. */
const EMAIL_HEADERS = ["personalemail", "email", "emailaddress", "workemail", "homeemail"];
/* ── PHONE, and it is read ONLY to make a one-time claim code. See
   claimCode.js: the last four digits are salted, hashed and the number is
   thrown away. The Hub stores no phone numbers.
   ⚠️⚠️ THE ORDER OF THIS LIST IS A SAFETY PROPERTY, NOT A PREFERENCE, AND
   THE EXCLUSIONS MATTER MORE THAN THE INCLUSIONS. The real export carries
   "Contact1 Phone" and "Contact2 Phone" — those are PARENTS and emergency
   contacts, and most of this team is under 20, so those columns are full of
   parents' mobiles. Picking one would mint a team member's account claim
   from their mother's phone number. They are deliberately ABSENT here, and
   because matching is by alias rank rather than column position, no
   reordering of the export can ever promote them.
   ⚠️ "homephone" IS included and ranks below mobile because real rows need
   it — at least one Assistant Director in the Aug 2026 export has a blank
   Mobile Phone and only a Home Phone. */
const PHONE_HEADERS = ["mobilephone", "cellphone", "mobile", "cell", "homephone", "otherphone", "phone", "phonenumber"];

/* EVERY matching column, best alias first. Shared by email and phone so the
   two cannot drift, and so neither can ever be satisfied by an
   emergency-contact column — that is the failure both are guarding against.

   🐛 IT USED TO RETURN ONE COLUMN AND THAT SILENTLY DENIED PEOPLE A CLAIM
   CODE. Caught by a test, Aug 10 2026. "Mobile Phone" exists in the header,
   so it won outright and became THE phone column for everybody — but real
   rows have it blank and carry only a Home Phone (an Assistant Director in
   the Aug 2026 export is exactly this). Those people parsed as "no phone",
   which means no claim code and a hand-set PIN, for no reason.
   ⇒ The fallback has to be PER ROW, not per file: keep the ranked list, and
   let each row take the first column that actually has something in it. */
const rankedCols = (cells, aliases) =>
  cells
    .map((c, i) => ({ i, r: aliases.indexOf(c) }))
    .filter((x) => x.r !== -1)
    .sort((a, b) => a.r - b.r)
    .map((x) => x.i);

/** First of those columns with a value in THIS row. */
const pickCell = (cells, cols) => {
  for (const i of cols) {
    const v = (cells[i] || "").trim();
    if (v) return v;
  }
  return "";
};

/* ── TITLES ────────────────────────────────────────────────────────────────
   CFA Home writes the pay class into the job title ("Team Member - Non-exempt").
   That suffix is payroll's business, not the Hub's, so it comes off before
   anything is matched. "Operator-Owner" keeps its hyphen — the strip only
   takes a trailing exempt/non-exempt, never an internal dash. */
const stripPayClass = (s) => String(s || "").replace(/\s*[-–]\s*(non[-\s]?)?exempt\s*$/i, "").trim();

/* Aliases, and ONLY where CFA Home and the Hub use different words for the
   same seat. Anything not here falls through to an exact match against the
   console's own title list, and anything that still misses is handed back for
   a human to answer.
   ⚠️ DO NOT GUESS A TITLE HERE. Rank is derived from the title (hrRoster.js),
   and rank decides who reads all 106 HR files. A wrong guess in this table is
   an access grant. Matt, Aug 6 2026, asked for exactly this: the four titles he
   had not ruled on are left unmapped rather than defaulted. */
export const CFA_TITLE_ALIASES = {
  "assistant mgr": "Assistant Director",
  "assistant manager": "Assistant Director",
  // The Hub retired "Manager" in favour of "Assistant Director"; both are rank
  // 4, and hrTeam.js rewrites the old word on load. Same answer, said once.
  manager: "Assistant Director",
  "operator-owner": "Owner",
  operator: "Owner",
};

/**
 * A CFA Home job title → a Hub role, or "" when nobody should guess.
 * `titleOptions` is the console's own TITLE_OPTIONS, passed in rather than
 * imported: this file must not depend on a component, and two copies of that
 * list would be two things to drift.
 */
export function mapJobTitle(job, titleOptions) {
  const base = stripPayClass(job);
  if (!base) return "";
  const k = base.toLowerCase();
  if (CFA_TITLE_ALIASES[k]) return CFA_TITLE_ALIASES[k];
  const hit = (titleOptions || []).find((t) => t.toLowerCase() === k);
  return hit || "";
}

/* ── NAMES ─────────────────────────────────────────────────────────────────
   CFA Home writes "Last, First Middle (Preferred)". The Hub stores the name a
   person actually goes by. Those are different strings for a quarter of the
   store, so a raw comparison would report all 103 people as new.

   Worked examples from the real Aug 6 2026 export:
     "Abuzaid, Ismail S"                  → Ismail Abuzaid
     "Acuna, Jessica V (Jessica)"         → Jessica Acuna
     "Aguilar Vega, Marelyn G"            → Marelyn Aguilar Vega     (2-word surname)
     "Anchecta Castillo, Salvador Daniel" → Salvador Daniel Anchecta Castillo
     "Jackson, Lindsay (Hannah)"          → Hannah Jackson           (preferred wins)
     "DeBrew, Christian I (Isaiah)"       → Isaiah DeBrew            (preferred wins)

   ⚠️ THE PREFERRED NAME IS THE REAL NAME HERE. Twenty-one rows carry one, and
   for Hannah, Matt, Cindy, Ally, Isaiah, Nicole and Marchelle it is the ONLY
   spelling the Hub has ever used. Ignoring it would have created a duplicate
   record for the two people who run HR. */
const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean);
const isInitial = (w) => /^[A-Za-z]\.?$/.test(String(w || ""));

/**
 * Every spelling one export row could be known by, best first, plus the name
 * to create the person under if they turn out to be new.
 */
export function nameVariants(raw) {
  let s = String(raw || "").trim().replace(/\s+/g, " ");
  let preferred = "";
  const m = s.match(/\(([^)]*)\)/);
  if (m) {
    preferred = m[1].trim();
    s = (s.slice(0, m.index) + s.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim();
  }
  if (!s) return { display: "", preferred, variants: [] };

  // No comma means it is already "First Last", or a single word. Take it as-is.
  if (!s.includes(",")) {
    const one = preferred ? preferred : s;
    return { display: one, preferred, variants: [...new Set([one, s].filter(Boolean))] };
  }

  const cut = s.indexOf(",");
  const last = s.slice(0, cut).trim();
  const given = words(s.slice(cut + 1));
  // A lone trailing letter is a middle initial, not a name. "Ismail S" is Ismail.
  const trimmed = given.length > 1 && isInitial(given[given.length - 1]) ? given.slice(0, -1) : given;

  const out = [];
  const push = (g) => {
    const v = [g, last].filter(Boolean).join(" ").trim();
    if (v && !out.includes(v)) out.push(v);
  };
  if (preferred) push(preferred);          // the name they go by, when stated
  push(trimmed.join(" "));                 // given names, middle initial dropped
  push(given.join(" "));                   // exactly as printed
  if (trimmed.length > 1) push(trimmed[0]); // first given name alone

  return { display: out[0] || last, preferred, variants: out };
}

/* ── NEAR MATCHES ──────────────────────────────────────────────────────────
   🐛 THE CASE THAT MADE THIS NECESSARY. Checked against the real export on
   Aug 6 2026, two of the seven "new" people were already on the roster:

     "Moore, Brianna"          → the Hub has Bri Moore, id 17
     "Parra Gonazlez, Paola"   → the Hub has Paola Parra Gonzalez, id 42
                                 (CFA Home has the surname misspelled)

   Neither is an exact match under any variant, so an add-only box that trusted
   exact matching alone would have created a SECOND Bri Moore. She is the
   Leadership Development Director; the duplicate would carry a fresh n_ id that
   is not in HR_CONSOLE_PEOPLE, so the copy could not open the console her own
   record grants her.

   ⚠️ A NEAR MATCH NEVER DECIDES ANYTHING ON ITS OWN. It unticks the row and
   says who it thinks the person already is. A human confirms. Fuzzy matching
   that writes by itself is how two records for one person get created, which
   is the exact outcome this is here to prevent. */

/** Levenshtein, abandoned as soon as it cannot come in at or under `max`. */
function withinDistance(a, b, max) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

/**
 * Roster people who look like they might already BE this person.
 * Three signals, any one is enough to raise a flag:
 *   1. same surname, and one first name is a short form of the other  (Bri / Brianna)
 *   2. same first name, and the surnames are within two typos         (Gonzalez / Gonazlez)
 *   3. the whole name is within two typos
 */
export function nearMatches(candidate, roster) {
  const cw = words(candidate);
  if (!cw.length) return [];
  const cFirst = normName(cw[0]);
  const cLast = normName(cw[cw.length - 1]);
  const cFull = normName(candidate);
  const out = [];
  (roster || []).forEach((m) => {
    if (!m || !m.name) return;
    const rw = words(m.name);
    if (!rw.length) return;
    const rFirst = normName(rw[0]);
    const rLast = normName(rw[rw.length - 1]);
    const rFull = normName(m.name);
    if (rFull === cFull) return; // an exact match is not a NEAR match
    const shortForm =
      cFirst && rFirst && cFirst !== rFirst &&
      Math.min(cFirst.length, rFirst.length) >= 3 &&
      (cFirst.startsWith(rFirst) || rFirst.startsWith(cFirst));
    const hit =
      (cLast === rLast && shortForm) ||
      (cFirst === rFirst && cLast !== rLast && withinDistance(cLast, rLast, 2)) ||
      withinDistance(cFull, rFull, 2);
    if (hit) out.push(m);
  });
  return out;
}

/* ── THE PASTE ─────────────────────────────────────────────────────────────
   ★ TAB WINS OVER COMMA. Copying cells out of Excel or Google Sheets puts
   TAB-separated text on the clipboard, not CSV. The CFA Home login import
   learned this the hard way in July — Bri was about to retype 86 rows by hand
   over a delimiter — and the same rule applies here. A job title can contain a
   comma; it cannot contain a tab. */
/* 🐛🐛 THIS WAS `line.split(",")` AND IT WOULD HAVE IMPORTED 103 PEOPLE NAMED
   AFTER HALF THEIR SURNAME. Found Aug 10 2026 against the real CFA Home
   download, which quotes every name precisely BECAUSE it contains a comma:
       "Abuzaid, Ismail S",11/06,Gate City FSU #04010,Team Member - Non-exempt,…
   A naive comma split turns that into `"Abuzaid` / ` Ismail S"` / `11/06` …, so
   the name is wrong AND every column after it shifts one to the left — the Job
   column lands on the birth date, and `mapJobTitle` then scores an unknown
   title as rank 0.
   ⚠️ IT WAS LATENT UNTIL TODAY. The only way in used to be a paste from a
   spreadsheet, which is TAB separated, so the comma branch never ran on real
   data. Adding "drop the downloaded CSV" made it reachable in the same session.
   A new capability turned a dormant bug into a live one; that is the lesson,
   not the comma.
   ⚠️ TAB BRANCH UNTOUCHED, deliberately. Every existing paste keeps behaving
   exactly as it did, so this cannot regress the flow that has been used. */
const splitRow = (line) => {
  if (line.includes("\t")) return line.split("\t");
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      /* "" inside a quoted field is a literal quote, per RFC 4180. */
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQ = false; }
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
};

/**
 * Turn pasted spreadsheet text into { name, job } rows.
 *
 * ⚠️ NO HEADER MEANS NO IMPORT. If the Full Name column cannot be found this
 * refuses and says so, rather than assuming column 1. Rule 1 in CLAUDE.md: a
 * write path unsure of its own shape fails loudly instead of saving something
 * wrong. Guessing here would create 103 people named after a birth date.
 */
export function parseExport(raw) {
  const lines = String(raw || "").split(/\r?\n/).map((l) => l.replace(/\r$/, "")).filter((l) => l.trim());
  if (!lines.length) return { ok: false, error: "Nothing pasted yet.", rows: [] };

  let nameCol = -1;
  let jobCol = -1;
  let emailCols = [];
  let phoneCols = [];
  let headerAt = -1;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const cells = splitRow(lines[i]).map(headerKey);
    const n = cells.findIndex((c) => NAME_HEADERS.includes(c));
    if (n === -1) continue;
    nameCol = n;
    jobCol = cells.findIndex((c) => JOB_HEADERS.includes(c));
    /* ⚠️ EARLIEST MATCH IN THE ALIAS LIST WINS, not the earliest column. The
       real export carries "Personal Email" AND "Contact1 Email"/"Contact2
       Email" for emergency contacts. A plain findIndex is column-order
       dependent and would grab a parent's address if corp ever reorders,
       emailing a team member's PARENT their write-up. Same for phone, where
       the consequence is worse. */
    emailCols = rankedCols(cells, EMAIL_HEADERS);
    phoneCols = rankedCols(cells, PHONE_HEADERS);
    headerAt = i;
    break;
  }
  if (nameCol === -1) {
    return {
      ok: false,
      rows: [],
      error: "No “Full Name” column found. Include the header row from the spreadsheet in what you copy.",
    };
  }

  const rows = [];
  for (let i = headerAt + 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    const name = (cells[nameCol] || "").trim();
    if (!name) continue;
    rows.push({
      name,
      job: jobCol === -1 ? "" : (cells[jobCol] || "").trim(),
      email: pickCell(cells, emailCols),
      /* ⚠️ THE RAW NUMBER STOPS HERE. It exists only long enough for the
         import panel to turn it into a hashed claim code; nothing stores it
         and nothing else may read it. See claimCode.js. */
      phone: pickCell(cells, phoneCols),
    });
  }
  return {
    ok: true,
    rows,
    hasJob: jobCol !== -1,
    hasEmail: emailCols.length > 0,
    hasPhone: phoneCols.length > 0,
    error: rows.length ? "" : "The header was found but there are no rows under it.",
  };
}

/**
 * Work out who is missing from the roster. Pure — decides nothing, writes
 * nothing, returns what a human then confirms.
 *
 * `roster` is the LIVE merged list (seed + gcfcr-hr-added-v1), never the seed
 * on its own. Anyone hired since the Hub went up lives only in the added key,
 * and comparing against the seed would offer to add them a second time.
 */
export function planImport(rows, roster, titleOptions) {
  const have = new Set((roster || []).filter((m) => m && m.name).map((m) => normName(m.name)));
  const candidates = [];
  const seen = new Set();
  let already = 0;
  let unnamed = 0;

  (rows || []).forEach((r) => {
    const { display, variants } = nameVariants(r.name);
    if (!display) { unnamed++; return; }
    if (variants.some((v) => have.has(normName(v)))) { already++; return; }
    // Two rows for one person inside a single paste. Keep the first.
    const dedup = normName(display);
    if (seen.has(dedup)) { already++; return; }
    seen.add(dedup);
    const role = mapJobTitle(r.job, titleOptions);
    candidates.push({
      key: dedup,
      source: r.name,
      name: display,
      job: r.job || "",
      /* Carried through so the panel can hand it to onAdd. HRConsole.addMembers
         files it to gcfcr-hr-info and never onto the roster row. */
      email: r.email || "",
      phone: r.phone || "",
      role,
      roleKnown: !!role,
      near: nearMatches(display, roster).map((m) => m.name),
    });
  });

  candidates.sort((a, b) => a.name.localeCompare(b.name));
  return { candidates, already, unnamed, total: (rows || []).length };
}
