/* ══════════════════════════════════════════════════════════════════════════
   availability.js — WHEN SOMEBODY CAN WORK, WHAT THEY CAN WORK, AND WHETHER
   SCHOOL IS IN. Step 1 of the scheduling platform.

   ★ NEAR-LEAF. Imports shiftHours.js and nameMatch.js and NOTHING ELSE. Both
   of those are strict leaves that import nothing, so the graph terminates one
   step down and no cycle is possible. The scheduling engine will need to run
   outside React exactly the way FOHAutoAssign.js does, so nothing React,
   nothing from store.js, and no component may ever be added here.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ EVERY TIME IN THIS FILE IS **MINUTES FROM MIDNIGHT**. 360 = 6:00am.
   ────────────────────────────────────────────────────────────────────────
   That is deliberate and it is the single most important line here.

   The Hub already carries the same idea in two different units and it is a
   documented bug source (see the header of dayparts.js, and the two
   definitions of the same four windows in storeConfig.js — one in minutes,
   one in decimal hours, disagreeing by half an hour). Availability gets
   compared against `storeCfg("stations.FOH")[day][n].hours`, which is
   **minutes**. Matching that exactly means the comparison is a subtraction
   with no conversion step in it, and a conversion step is where the half hour
   went missing last time.

   ⚠️ shiftHours.parseRanges RETURNS DECIMAL HOURS, because it serves the board
   and the engines. It is still the right parser — rule 8, one definition of
   "what hours does this text mean" — so it is used and its answer is converted
   ONCE, in `hoursToMin`, at the boundary. Do not add a second parser here.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ THREE STATES, AND "NOT SET" IS NOT "AVAILABLE".
   ────────────────────────────────────────────────────────────────────────
       day key absent   → NOT SET. Nobody has said. Never schedule from it.
       day key is []    → OFF. They said no. A real answer.
       day key has rows → the windows they can work.

   A blank must never resolve to "any time". Design rule 1, and the version of
   this file that shipped first got it wrong: a missing record normalised to
   `{ok: true, anyTime: true}`, which is a scheduler cheerfully putting
   somebody on a 6am Saturday they never agreed to. `dayState` is the only
   sanctioned way to ask, and it answers "unset" out loud.

   ⚠️ NEVER FILL A BLANK WITH A PLAUSIBLE GUESS applies to the importers too.
   Every one of them returns what it could NOT read alongside what it could,
   and the screen shows both. A name that does not match the roster is
   reported, never written under a guessed id. Same rule the PTO importer
   already follows, and for the same reason: somebody vanishing quietly is
   worse than an import that admits it is short.
   ══════════════════════════════════════════════════════════════════════════ */

import { parseRanges } from "./shiftHours.js";
import { normName } from "./nameMatch.js";
/* ⚠️ ONE DEFINITION OF "read a person's name out of a HotSchedules export".
   `nameFromExport` already drops a trailing all-digits token, which is why
   "Nick 04010" exists in these files — the store number stapled onto
   a name. It was written for the salary export; the availability report has
   the same artefact, and a second copy here would drift on exactly the names
   hardest to notice. payRates.js imports only nameMatch.js, so this adds no
   cycle and cyclecheck proves it on every run. */
import { nameFromExport } from "./payRates.js";
/* ⚠️ hrRoster.js IS THE STRICT LEAF that owns the rank ladder and the tier
   rule, and it imports nothing but storeConfig.js. Reading the off-floor
   default from there rather than re-testing a rank here is design rule 8: the
   boundary moves in one place or it drifts in two. cyclecheck proves the graph
   stays a DAG on every run. */
import { isOffFloorTitle } from "./hrRoster.js";

export const AVAIL_KEY = "gcfcr-availability-v1";
export const SKILLS_KEY = "gcfcr-skills-v1";
export const SCHOOL_KEY = "gcfcr-school-calendar-v1";

export const MIN_PER_DAY = 1440;

/* All seven, because a source file may carry a Sunday column and dropping data
   at the door is not this file's call. Which days a STORE shows comes from its
   own station config, not from here. */
export const DAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_LONG = {
  Sun: "Sunday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday",
  Thu: "Thursday", Fri: "Friday", Sat: "Saturday",
};

/* Decimal hours from shiftHours.js → minutes. THE ONLY conversion point. */
export const hoursToMin = (h) => Math.round(Number(h) * 60);

/* ── reading a stored record ──────────────────────────────────────────── */

/* ★ NOT SCHEDULED ON THE FLOOR AT ALL. Matt, Aug 13 2026: "skip nick and
   tiffany for the schedule", "and cindy".

   ⚠️⚠️ A FLAG ON THE PERSON, NOT A LIST IN THE SOURCE, AND THAT IS RULE 18.
   Who is office staff changes when anybody joins or leaves, so a hardcoded list
   would be wrong within a month and only a developer could fix it. It lives on
   the availability record, which is already the per-person scheduling screen a
   director can edit, and it travels to a clone as an empty field rather than as
   this store's names.

   ⚠️ IT IS NOT "unavailable" AND MUST NOT BE STORED AS SIX DAYS OFF. Marking
   them off every day would look identical to somebody who cannot work this
   week, so the schedule would quietly stop distinguishing "not floor staff"
   from "away", and next month somebody would helpfully "fix" their
   availability. This says the true thing: they are not scheduled here. */
export const isNoSchedule = (rec) => !!(rec && rec.noSchedule);

/* ══════════════════════════════════════════════════════════════════════════
   ★★ IS THIS PERSON ON THE FLOOR AT ALL — the whole precedence, in one place.

   Matt, Aug 14 2026: "remove everyone in sr leadership. just have the rest."

   `isNoSchedule` above answers only "has somebody ticked this box". That left
   the six senior leaders here counted as schedulable, because their records
   came in from the HotSchedules import with no tick on any of them, and nobody
   is going to tick six boxes every time a title changes.

   ⚠️⚠️ AN EXPLICIT ANSWER ALWAYS WINS, IN BOTH DIRECTIONS, and that is the
   whole design. Three states, not two:
     · `noSchedule === true`   somebody said off  → off, whatever the title
     · `noSchedule === false`  somebody said on   → ON, whatever the title
     · absent                  nobody has said    → the title decides
   The middle case is why this cannot be a plain OR. A store that really does
   roster its Executive Director unticks the box once and is never argued with
   again. Without it, a title would be a gate nobody could open, which is the
   uneditable-and-wrong state design rule 18 exists to prevent.

   ⚠️ `typeof === "boolean"` IS THE TEST, NOT TRUTHINESS. `!rec.noSchedule` is
   true for both `false` and `undefined`, and those are the two cases that have
   to be told apart. Getting this wrong silently reverts every title default the
   moment anybody saves a record.

   ⚠️ THE CALLER PASSES THE EFFECTIVE TITLE, the one from gcfcr-hr-roles where
   that map overrides the roster row. `loadHRTeam` does NOT merge that map, so a
   caller handing over `member.role` straight off the roster misses anybody
   whose title was changed in HR Console. That is a real person at this store
   today, and it is the kind of miss nothing complains about.
   ══════════════════════════════════════════════════════════════════════════ */
export function isOffFloor(rec, title) {
  if (rec && typeof rec.noSchedule === "boolean") return rec.noSchedule;
  return isOffFloorTitle(title);
}

/* "unset" | "off" | "open". The ONLY sanctioned way to ask whether somebody
   can work a day. See the three-states note in the header. */
export function dayState(rec, day) {
  if (!rec || !rec.days || !Object.prototype.hasOwnProperty.call(rec.days, day)) return "unset";
  const w = rec.days[day];
  if (!Array.isArray(w)) return "unset";
  return w.length ? "open" : "off";
}

/* The windows for a day, always an array so a caller cannot crash on it.
   ⚠️ EMPTY MEANS "no", AND SO DOES "not set". Check dayState first when the
   difference matters, which is any time you are about to schedule somebody. */
export function windowsFor(rec, day) {
  const w = rec && rec.days ? rec.days[day] : null;
  return Array.isArray(w) ? w : [];
}

/* Does a person's availability cover a whole [start,end) span on a day?
   One window has to cover it end to end; two windows that abut do NOT, because
   a split availability means they left and came back. */
export function coversSpan(rec, day, start, end) {
  if (dayState(rec, day) !== "open") return false;
  return windowsFor(rec, day).some((w) => w.start <= start && w.end >= end);
}

export const isAllDay = (windows) =>
  Array.isArray(windows) && windows.length === 1 &&
  windows[0].start <= 0 && windows[0].end >= MIN_PER_DAY;

/* ── display ──────────────────────────────────────────────────────────── */

export function fmtMin(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  if (m >= MIN_PER_DAY) return "midnight";
  const h24 = Math.floor(m / 60), mm = m % 60;
  const ampm = h24 >= 12 ? "pm" : "am";
  let h = h24 % 12;
  if (h === 0) h = 12;
  return mm ? `${h}:${String(mm).padStart(2, "0")}${ampm}` : `${h}${ampm}`;
}

export const fmtWindow = (w) => `${fmtMin(w.start)}-${fmtMin(w.end)}`;

/* ── `<input type="time">` ⇄ minutes ─────────────────────────────────────
   ⚠️ ONE DEFINITION. These started life inside Availability.jsx and the
   schedule grid needed exactly the same pair; a second copy of a time
   conversion is the drift rule 8 exists to stop, and this one converts the
   units this whole subsystem is built on.

   ⚠️ 1440 IS MIDNIGHT AT THE END OF THE DAY and `<input type="time">` has no
   way to say it, so it shows as 23:59 and reads back as 1440. It round trips
   exactly; the minute it costs cannot matter to a store that closes at 11. */
export const minToInput = (min) => {
  const m = Math.min(Math.max(0, Math.round(Number(min) || 0)), MIN_PER_DAY - 1);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
export const inputToMin = (hhmm) => {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  if (!(v >= 0 && v < MIN_PER_DAY)) return null;
  return v === MIN_PER_DAY - 1 ? MIN_PER_DAY : v;
};

export function summarizeDay(rec, day) {
  const st = dayState(rec, day);
  if (st === "unset") return "Not set";
  if (st === "off") return "Off";
  const w = windowsFor(rec, day);
  return isAllDay(w) ? "Any time" : w.map(fmtWindow).join(", ");
}

/* One line for a whole person, for the team list. */
export function summarizeRecord(rec, days) {
  const use = Array.isArray(days) && days.length ? days : DAY_KEYS;
  const known = use.filter((d) => dayState(rec, d) !== "unset");
  if (!known.length) return "Not set";
  const open = known.filter((d) => dayState(rec, d) === "open");
  if (!open.length) return "No days available";
  const parts = open.map((d) => {
    const w = windowsFor(rec, d);
    return isAllDay(w) ? d : `${d} ${w.map(fmtWindow).join(" & ")}`;
  });
  const short = known.length < use.length ? ` (${use.length - known.length} days not set)` : "";
  return parts.join(" · ") + short;
}

/* ── CSV ──────────────────────────────────────────────────────────────── */

/* Quote-aware CSV → array of arrays. Availability cells contain commas inside
   quotes, so a split(",") loses a column and shifts every day by one, which
   reads as real data and is not. Under 20 lines, so no dependency (rule 5). */
/* ⚠️⚠️ THE SEPARATOR IS DETECTED, NOT ASSUMED, AND THAT IS A REAL BUG FIX.
   Matt, Aug 13 2026, pasting the availability export: "Saved 0 people with
   availability. No day columns found in the header row."

   The FILE is comma separated and parsed perfectly — 100 people, 0 problems,
   checked. But nobody pastes a file. They open it in Excel or Numbers, select
   the sheet and copy, and **a spreadsheet puts TABS on the clipboard, not
   commas**. So the header arrived as one enormous single column, no day
   columns were found, and the screen truthfully reported that while being
   completely useless about why.

   ⇒ Decided from the FIRST NON-EMPTY LINE, which is the header. A comma file
   has zero tabs and still picks the comma, so nothing that worked changes. */
const pickDelim = (src) => {
  const first = String(src).split("\n").find((l) => l.trim()) || "";
  const tabs = (first.match(/\t/g) || []).length;
  const commas = (first.match(/,/g) || []).length;
  return tabs > 0 && tabs >= commas ? "\t" : ",";
};

export function parseCsv(text, delim) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = String(text || "").replace(/\r\n?/g, "\n");
  const sep = delim || pickDelim(src);
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => String(f).trim() !== ""));
}

/* ── the availability report ──────────────────────────────────────────── */

const CELL_OFF = /^unavailable\b/i;
const CELL_ANY = /^available all day$/i;
/* "…11:00 AM - 12:00 AM". See the note in parseAvailCell. */
const MIDNIGHT_END = /\b12(?::00)?\s*a\.?m\.?\s*$/i;

/* One cell → { windows } or { error }. NEVER a guess: a cell it cannot read
   comes back as an error and the caller reports it by name.
   Returns windows in MINUTES. */
export function parseAvailCell(raw) {
  const cell = String(raw || "").trim();
  if (!cell) return { error: "blank" };
  if (CELL_OFF.test(cell)) return { windows: [] };
  if (CELL_ANY.test(cell)) return { windows: [{ start: 0, end: MIN_PER_DAY }] };

  /* ⚠️ ONE DOCUMENTED CORRECTION, FOR ONE REAL SHAPE, AND IT IS NOT A SECOND
     PARSER. shiftHours.parseRanges drops "11:00 AM - 12:00 AM" entirely: it
     reads the end as 0:00, `end <= start`, and the push is refused. That is
     correct for a roster line (nobody works a negative shift) and wrong for an
     availability window, where midnight is the END of the day, not the start.
     Measured in the Aug 16 2026 report: 1 cell of 700. Left unhandled it would
     silently blank one person's best day, which is exactly the failure this
     file's header refuses. Widening the shared regex instead would change what
     the BOARD reads, which is a behaviour change nobody asked for. */
  const endsMidnight = MIDNIGHT_END.test(cell);
  const probe = endsMidnight ? cell.replace(MIDNIGHT_END, "11:59 PM") : cell;

  const ranges = parseRanges(probe);
  if (!ranges.length) return { error: cell };

  const windows = ranges.map((r) => ({ start: hoursToMin(r.start), end: hoursToMin(r.end) }));
  if (endsMidnight) windows[windows.length - 1].end = MIN_PER_DAY;
  return { windows };
}

/* The HotSchedules Availability Report, exported as CSV.
     Employees,Sun  8/16/26,Mon  8/17/26,…
     "Alex Smith","Unavailable All Day","Partially Available 5:30 PM - 10:00 PM",…

   ⚠️ DAY COLUMNS COME FROM THE FILE'S OWN HEADER, never from a fixed order. A
   report run from a different week starts on a different day, and a fixed
   order would move everybody's Monday onto their Tuesday with nothing on
   screen to say so.

   Returns { rows, problems }. `problems` is every cell it refused to guess at. */
export function parseAvailabilityCsv(text) {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], problems: [], days: [] };

  const header = table[0].map((h) => String(h || "").trim());
  const cols = [];
  header.forEach((h, i) => {
    if (i === 0) return;
    const m = h.match(/\b(sun|mon|tue|wed|thu|fri|sat)/i);
    if (!m) return;
    const day = m[1][0].toUpperCase() + m[1].slice(1, 3).toLowerCase();
    cols.push({ i, day });
  });

  const rows = [], problems = [];
  if (!cols.length) {
    /* ⚠️ SAY WHAT IT ACTUALLY SAW. "No day columns found in the header row" is
       true and completely useless: it does not say what the header WAS, so
       there is nothing to act on. Matt hit exactly that, and the real cause
       (tabs, not commas) was invisible from the message. Showing the header
       back makes a mangled paste obvious at a glance. */
    problems.push({
      name: "",
      cell: `No day columns in the header row. It read as ${header.length} column(s): ${header.slice(0, 8).map((h) => `"${h}"`).join(" | ") || "(nothing)"}`,
    });
    return { rows, problems, days: [] };
  }

  for (let r = 1; r < table.length; r++) {
    const line = table[r];
    /* ⚠️ CLEANED THE SAME WAY EVERY OTHER EXPORT IS. Measured against the real
       report and the real roster: 93 of 100 names matched raw, and
       "Nick 04010" was one of the seven that did not — a formatting
       artefact reading as a missing person.
       ⚠️ THE OTHER SIX ARE LEFT TO THE UNMATCHED REPORT ON PURPOSE. They are
       nickname and spelling differences (Bri vs Brianna, Cindy vs Cynthia,
       Ally vs Allysen, one typo) and this roster carries BOTH
       "Lizbeth Gonzalez" and "Lizbeth" as two different people.
       nameMatch.js is explicit that ambiguity resolves to no match, never to a
       guess, and a wrong guess here writes one person's hours onto another. */
    const name = nameFromExport(String(line[0] || "").trim());
    if (!name) continue;
    const days = {};
    cols.forEach(({ i, day }) => {
      const res = parseAvailCell(line[i]);
      if (res.error) {
        if (res.error !== "blank") problems.push({ name, day, cell: res.error });
        return; /* left ABSENT, which reads as "not set", never as available */
      }
      days[day] = res.windows;
    });
    rows.push({ name, days });
  }
  return { rows, problems, days: cols.map((c) => c.day) };
}

/* ── the job and skill level report ───────────────────────────────────── */

export const SKILL_WORDS = ["beginner", "intermediate", "advanced", "expert", "novice", "trainer"];
const SKILL_TAIL = new RegExp(`[-–—]\\s*(${SKILL_WORDS.join("|")})\\s*$`, "i");
const SKILL_RANK = { novice: 1, beginner: 1, intermediate: 2, advanced: 3, expert: 3, trainer: 3 };
export const skillRank = (s) => SKILL_RANK[String(s || "").toLowerCase()] || 0;

/* Pasted straight out of HotSchedules. One person's certifications run down
   the page under their name:

     Alex Smith            DRIVE THRU - BEGINNER
     Jordan Lee   BOARDS 1 SANDWICHES - BEGINNER
                             BOARDS 2 NUGGETS STRIPS SOUP - BEGINNER
                             BREADER - BEGINNER

   ⚠️ THE NAME IS ON THE FIRST ROW ONLY. Every later row belongs to whoever was
   named last, so the parser carries a pending name forward. Getting that wrong
   does not fail loudly — it files one person's certifications under another
   person, and both records still look entirely reasonable.

   Two ways to find the split, in order:
     1. a TAB, or two or more spaces. What the real export contains.
     2. the first ALL-CAPS token. Names are Title Case and jobs are upper case,
        so "Alex Smith DRIVE THRU" still splits correctly if a paste has
        flattened the tab to a single space.
   A row with no name part is a continuation. */
export function parseSkillsText(text) {
  const out = new Map();
  const problems = [];
  let pending = "";

  String(text || "").split(/\n+/).forEach((rawLine) => {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) return;
    if (/^employee\b/i.test(line.trim())) return;
    if (/^support and schedules/i.test(line.trim())) return;

    const m = line.match(SKILL_TAIL);
    if (!m) { problems.push(line.trim()); return; }

    const skill = m[1].toLowerCase();
    let head = line.slice(0, line.length - m[0].length).replace(/\s+$/, "");

    let name = "", job = "";
    const sep = head.search(/\t|\s{2,}/);
    if (sep >= 0) {
      name = head.slice(0, sep).trim();
      job = head.slice(sep).trim();
    } else {
      const toks = head.trim().split(/\s+/);
      let cut = toks.findIndex((t) => t.length >= 2 && t === t.toUpperCase() && /[A-Z]/.test(t));
      if (cut < 0) { problems.push(line.trim()); return; }
      name = toks.slice(0, cut).join(" ");
      job = toks.slice(cut).join(" ");
    }
    if (!job) { problems.push(line.trim()); return; }

    if (name) pending = name;
    if (!pending) { problems.push(line.trim()); return; }

    const rec = out.get(pending) || { name: pending, jobs: {} };
    /* Highest wins if a job is listed twice. Quietly keeping the last one read
       would let a stale BEGINNER row overwrite a real ADVANCED one. */
    const key = job.toUpperCase();
    if (skillRank(skill) >= skillRank(rec.jobs[key])) rec.jobs[key] = skill;
    out.set(pending, rec);
  });

  return { rows: [...out.values()], problems };
}

/* ── which report is this? ────────────────────────────────────────────────
   ★★ THE PASTE DECIDES, NOT THE TAB. Matt, Aug 13 2026: "none of the
   availabilty i sent imported".

   ⚠️⚠️ WHY THIS EXISTS. The import box used to run whichever parser matched the
   TAB somebody happened to be standing on. Paste the availability report while
   the Skills tab is open and it was read as skills: no crash, no error, a green
   "saved 0 people" and a hundred rows quietly on the floor. Splitting the tile
   into a team half and a leader half made that worse, because the availability
   tab moved to the OTHER tile — so the only import box a leader could see was
   the wrong one for the biggest report they had.

   ⇒ Same answer teamDetails.js already uses for the two staff exports: read the
   text, say what it is, and let somebody paste whichever sheet they have open.
   A wrong guess here is silent, so each test is a SHAPE only that report has.

   ⚠️ AN UNKNOWN PASTE RETURNS "", AND "" MUST NEVER FALL BACK TO A PARSER.
   Falling back is what caused this. The screen says it cannot tell. */
export function sniffReport(text) {
  const t = String(text || "");
  if (!t.trim()) return "";

  /* Availability: the report's own vocabulary. Both phrases are written by
     HotSchedules on every row and appear in no other export. */
  if (/\b(Unavailable All Day|Partially Available|Available All Day)\b/i.test(t)) return "avail";

  /* Availability with an empty week still has the header, which no other
     report has: an "Employees" column followed by dated day columns. */
  if (/^\s*"?Employees"?\s*,/im.test(t) && /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(t)) return "avail";

  /* Skills: "NAME<tab>JOB CODE - LEVEL". The trailing level word is the tell. */
  if (/[-–]\s*(BEGINNER|INTERMEDIATE|ADVANCED)\s*$/im.test(t)) return "skills";

  /* The school calendar group screen names itself. */
  if (/^.*calendar.*$/im.test(t) && /^[A-Z]{1,3}$/m.test(t)) return "school";

  return "";
}

/* ── the school calendar group ────────────────────────────────────────── */

/* Pasted from the HotSchedules group screen, which puts an initials badge on
   its own line above every name:

     2026-2027 School CalendarEditDelete
     AC
     Alex Smith

   ⚠️ A BADGE IS NOT A PERSON. "AC" on its own line is an avatar, and a school
   calendar with 36 members instead of 18 would send half of them to school. */
export function parseSchoolMembers(text) {
  const names = [];
  const problems = [];
  let title = "";

  String(text || "").split(/\n+/).forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    if (!title && /calendar/i.test(line)) {
      title = line.replace(/(Edit|Delete)+\s*$/i, "").trim();
      return;
    }
    if (/^[A-Z]{1,3}$/.test(line)) return;            // initials badge
    if (/^(edit|delete)$/i.test(line)) return;
    if (/[a-z]/.test(line) && /\s/.test(line)) { names.push(line); return; }
    problems.push(line);
  });

  return { title, names, problems };
}

/* ── the name a report uses for somebody already on the roster ────────── */

/* HotSchedules exports the LEGAL name. The Hub roster carries the name the
   store actually uses. Those are the same person and nothing in the data says
   so, which is why four people fell out of a clean skills import on Aug 13
   2026: Allysen/Ally Hardie, Brianna/Bri, and Paola Parra Gonazlez,
   whose own HotSchedules record has two letters transposed.

   ⚠️⚠️ THE FIX IS AN ALIAS A LEADER TYPES, NOT A LOOSER MATCHER, AND THE
   DIFFERENCE MATTERS. Widening the rule to catch Bri/Brianna would also merge
   this roster's `Lizbeth Gonzalez` and `Lizbeth`, who are two
   different people — nameMatch.js has a warning saying its permissive rule
   already cannot separate them. So the miss stays a miss until a human says
   who it is, and then that answer is remembered. Ambiguity is never guessed;
   it is asked once.

   ⚠️ AN ALIAS NEVER OVERRIDES A CLEAN MATCH. It is consulted only after an
   exact, unambiguous roster hit has failed, so an alias saved by mistake
   cannot silently redirect somebody who was already importing correctly. It
   CAN resolve an ambiguous one, because that is a human deciding between two
   real people, which is the one thing the matcher may not do by itself.

   ⚠️ KEYED BY normName OF THE EXPORT'S SPELLING, VALUE IS A ROSTER id. Storing
   a roster NAME on the right-hand side would break the moment somebody is
   renamed in HR Console, which is the whole failure this exists to end. */
export const ALIASES_KEY = "gcfcr-name-aliases-v1";

/* Guard the read. Absent, empty, or a bare map written before `v: 1` existed
   all answer "nobody has linked a name yet", which is a working state. Rule 1. */
export function readAliases(raw) {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const src = o.map && typeof o.map === "object" && !Array.isArray(o.map)
    ? o.map
    : (o.v || o.updatedAt || o.updatedBy ? {} : o);
  const map = {};
  Object.keys(src).forEach((k) => {
    const norm = normName(k);
    const id = String(src[k] == null ? "" : src[k]).trim();
    if (norm && id) map[norm] = id;
  });
  return { v: 1, map, updatedAt: String(o.updatedAt || ""), updatedBy: String(o.updatedBy || "") };
}

/* Link one export spelling to one roster person. Re-linking the same spelling
   replaces it rather than adding a second row, so the map cannot hold two
   answers for one name. */
export function setAlias(stored, exportName, rosterId, stamp) {
  const prev = readAliases(stored);
  const norm = normName(exportName);
  const id = String(rosterId == null ? "" : rosterId).trim();
  /* Rule 1: refuse loudly rather than store half a link. A blank either side
     would read back as "no alias" and look exactly like never having tried. */
  if (!norm || !id) return null;
  return {
    v: 1,
    map: { ...prev.map, [norm]: id },
    updatedAt: (stamp && stamp.at) || "",
    updatedBy: (stamp && stamp.by) || "",
  };
}

export function removeAlias(stored, exportName, stamp) {
  const prev = readAliases(stored);
  const norm = normName(exportName);
  if (!norm || !prev.map[norm]) return null;
  const map = { ...prev.map };
  delete map[norm];
  return { v: 1, map, updatedAt: (stamp && stamp.at) || "", updatedBy: (stamp && stamp.by) || "" };
}

/* ── what a person asks for ───────────────────────────────────────────────
   Matt, Aug 13 2026: "we need OT alerts and team member preferences", with a
   photo of the HotSchedules Schedule Threshold block. Six numbers, per person:

     Days scheduled in a week      min, max
     Hours scheduled in a week     min, max
     Hours scheduled in a day      max        (his own record says 12)
     Hours between shifts          min

   ⚠️⚠️ THE `min` HALF IS A PROMISE, NOT A LIMIT, and it is the half an engine
   written only to cap hours ignores in silence. Somebody who asked for at
   least twenty hours and got eight has been let down by the schedule exactly
   as much as somebody handed fifty, and today only one of those makes a sound.
   Both are checked.

   ⚠️ A PREFERENCE IS NOT A RULE. A minor's hour cap is something the store
   must do; "I would rather not work past 25 hours" is somebody's ask. They
   must never read as the same sentence, so nothing here produces a BLOCK and
   the wording says whose ask it is.

   ⚠️ THESE LIVE ON THE AVAILABILITY RECORD, NOT IN A NEW KEY. `people[id]` is
   already one row per person and `readStore` hands the row through untouched,
   so this is extra fields on a record that exists. A second key keyed by the
   same id is the drift rule 8 exists to stop.

   ⚠️ HOURS ARE STORED AS MINUTES, days as plain counts. Same unit as every
   other time in this file and in minorRules.js; the screen converts once.

   ⚠️ BLANK IS NULL, NEVER ZERO. "No minimum" and "a minimum of nothing" are
   different answers, and payRates.js already carries the scar of a missing
   value reading as a real zero on a money screen. */
export const PREF_FIELDS = Object.freeze([
  { key: "minDaysWeek", kind: "days", label: "Fewest days in a week" },
  { key: "maxDaysWeek", kind: "days", label: "Most days in a week" },
  { key: "minHoursWeek", kind: "dur", label: "Fewest hours in a week" },
  { key: "maxHoursWeek", kind: "dur", label: "Most hours in a week" },
  { key: "maxHoursDay", kind: "dur", label: "Most hours in a day" },
  { key: "minHoursBetween", kind: "dur", label: "Least time between shifts" },
]);

const PREF_KEYS = PREF_FIELDS.map((f) => f.key);

const prefNum = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/* Guard the read. A record written before any of this existed has no `prefs`
   key at all, and answers "nothing asked for", which is a working state and
   what every person starts with. Rule 1. */
export function readPrefs(rec) {
  const p = rec && typeof rec === "object" && rec.prefs && typeof rec.prefs === "object" ? rec.prefs : {};
  const out = {};
  PREF_KEYS.forEach((k) => { out[k] = prefNum(p[k]); });
  return out;
}

export const hasPrefs = (rec) => PREF_KEYS.some((k) => readPrefs(rec)[k] !== null);

/* What is wrong with a set of numbers, in plain words, or [] when nothing is.
   ⚠️ A MINIMUM ABOVE ITS MAXIMUM IS UNSATISFIABLE, and stored quietly it would
   make every week that person is on produce a warning nobody can clear. */
export function prefProblems(next) {
  const p = { ...readPrefs({ prefs: next }) };
  const out = [];
  if (p.minDaysWeek !== null && p.maxDaysWeek !== null && p.minDaysWeek > p.maxDaysWeek) {
    out.push("The fewest days cannot be more than the most days.");
  }
  if (p.minHoursWeek !== null && p.maxHoursWeek !== null && p.minHoursWeek > p.maxHoursWeek) {
    out.push("The fewest hours cannot be more than the most hours.");
  }
  if (p.maxDaysWeek !== null && p.maxDaysWeek > 7) out.push("A week has seven days.");
  if (p.maxHoursDay !== null && p.maxHoursDay > MIN_PER_DAY) out.push("A day has twenty four hours.");
  return out;
}

/* Write one person's preferences onto the stored map, touching nobody else.
   ⚠️ RETURNS null RATHER THAN STORING SOMETHING UNSATISFIABLE. Rule 1: fail
   loudly rather than save something wrong. */
export function setPrefs(stored, id, patch, stamp) {
  const base = readStore(stored);
  const key = String(id == null ? "" : id);
  if (!key) return null;
  const merged = { ...readPrefs(base.people[key]), ...(patch && typeof patch === "object" ? patch : {}) };
  const clean = {};
  PREF_KEYS.forEach((k) => { clean[k] = prefNum(merged[k]); });
  if (prefProblems(clean).length) return null;
  const prev = base.people[key] || {};
  return {
    v: 1,
    people: {
      ...base.people,
      [key]: {
        ...prev,
        prefs: clean,
        updatedAt: (stamp && stamp.at) || prev.updatedAt || "",
        updatedBy: (stamp && stamp.by) || prev.updatedBy || "",
      },
    },
  };
}

/* ── did the week honour what they asked for? ─────────────────────────────
   Pure, and given only what it needs, so the warning file and the engine can
   both call it without either of them owning the rule.

   `shifts` is that ONE person's shifts for the week, each { day, start, end }
   in minutes. Returns plain sentences, already in their voice.

   ⚠️ "TIME BETWEEN SHIFTS" IS THE ONLY ONE THAT CROSSES MIDNIGHT, and it is
   the one that gets written wrong: it is the gap from one shift's END to the
   next one's START, which for a close-then-open runs through the night. The
   caller passes a day INDEX so this can measure across the join without
   knowing what a calendar is. */
export function prefWarnings(rec, shifts, dayIndex) {
  const p = readPrefs(rec);
  const list = (Array.isArray(shifts) ? shifts : []).filter((s) => s && s.end > s.start);
  if (!list.length) return [];
  const out = [];
  const hrs = (m) => (m / 60).toFixed(1);

  const days = new Set(list.map((s) => s.day));
  const total = list.reduce((t, s) => t + (s.end - s.start), 0);

  if (p.maxDaysWeek !== null && days.size > p.maxDaysWeek) {
    out.push(`${days.size} days this week, and they asked for at most ${p.maxDaysWeek}`);
  }
  if (p.minDaysWeek !== null && days.size < p.minDaysWeek) {
    out.push(`only ${days.size} days this week, and they asked for at least ${p.minDaysWeek}`);
  }
  if (p.maxHoursWeek !== null && total > p.maxHoursWeek) {
    out.push(`${hrs(total)} hours this week, and they asked for at most ${hrs(p.maxHoursWeek)}`);
  }
  if (p.minHoursWeek !== null && total < p.minHoursWeek) {
    out.push(`only ${hrs(total)} hours this week, and they asked for at least ${hrs(p.minHoursWeek)}`);
  }

  if (p.maxHoursDay !== null) {
    const byDay = new Map();
    list.forEach((s) => byDay.set(s.day, (byDay.get(s.day) || 0) + (s.end - s.start)));
    byDay.forEach((m, day) => {
      if (m > p.maxHoursDay) {
        out.push(`${hrs(m)} hours on ${day}, and they asked for at most ${hrs(p.maxHoursDay)} in a day`);
      }
    });
  }

  if (p.minHoursBetween !== null && typeof dayIndex === "function") {
    /* Lay every shift on one timeline of minutes-since-the-week-began, so a
       close at 11pm and an open at 5am the next morning is a six hour gap and
       not a negative one. */
    const flat = list
      .map((s) => {
        const i = Number(dayIndex(s.day));
        return Number.isFinite(i) ? { start: i * MIN_PER_DAY + s.start, end: i * MIN_PER_DAY + s.end, day: s.day } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.start - b.start);
    for (let i = 1; i < flat.length; i++) {
      const gap = flat[i].start - flat[i - 1].end;
      if (gap >= 0 && gap < p.minHoursBetween) {
        out.push(`${hrs(gap)} hours off before ${flat[i].day}, and they asked for at least ${hrs(p.minHoursBetween)}`);
      }
    }
  }

  return out;
}

/* ── matching a report to the roster ──────────────────────────────────── */

/* Report names → roster ids.

   ⚠️ EVERY RECORD IN THE HUB IS KEYED BY ROSTER id, NEVER BY NAME, and this is
   the file where that gets decided. DailySetup carries the id onto every board
   row for exactly this reason: a second store hiring any Julie would otherwise
   inherit our Julie's station lock, live, with nothing on screen to explain it.

   ⚠️ AMBIGUITY IS A MISS, NEVER A GUESS. Two roster people normalising to the
   same name return neither. Same rule nameMatch.js already states about who
   sees a confidential recommendation, and it matters as much here: the wrong
   guess writes one person's days off onto somebody else's record. */
export function matchToRoster(rows, team, aliases) {
  const byNorm = new Map();
  const byId = new Map();
  const dupes = new Set();
  (Array.isArray(team) ? team : []).forEach((m) => {
    if (!m || m.id == null || !m.name) return;
    byId.set(String(m.id), m);
    const k = normName(m.name);
    if (!k) return;
    if (byNorm.has(k)) dupes.add(k);
    byNorm.set(k, m);
  });
  /* Optional third argument, so every existing caller keeps working untouched
     and a screen that has not loaded the key yet simply matches as it always
     did. Rule 1 applies to arguments too. */
  const alias = readAliases(aliases).map;

  const matched = [], unmatched = [];
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    const k = normName(r && r.name);
    /* Exact and unambiguous first. See the warning above ALIASES_KEY for why
       the order is load-bearing rather than arbitrary. */
    let hit = k && !dupes.has(k) ? byNorm.get(k) : null;
    let via = "";
    if (!hit && k && alias[k]) {
      /* A link whose person has since left, or been deleted, resolves to
         nothing and falls through to unmatched. It does NOT match whoever
         holds that id now, because ids are not reused, and it does not throw. */
      const linked = byId.get(alias[k]);
      if (linked) { hit = linked; via = "link"; }
    }
    if (hit) matched.push({ ...r, id: String(hit.id), rosterName: hit.name, via });
    else unmatched.push({ name: (r && r.name) || "", reason: dupes.has(k) ? "two people share that name" : "not on the roster" });
  });
  return { matched, unmatched };
}

/* ── writing ──────────────────────────────────────────────────────────── */

/* Merge imported rows into the stored map WITHOUT touching anyone the import
   did not mention. A report is a snapshot of whoever it covers, not of the
   whole store, so replacing the map wholesale would delete the availability of
   everybody hired since the export was run. */
export function mergeImport(stored, matched, stamp) {
  const base = stored && typeof stored === "object" && stored.people ? stored.people : {};
  const people = { ...base };
  matched.forEach((row) => {
    people[row.id] = {
      ...(row.days ? { days: row.days } : null),
      ...(row.jobs ? { jobs: row.jobs } : null),
      updatedAt: stamp && stamp.at ? stamp.at : "",
      updatedBy: stamp && stamp.by ? stamp.by : "",
      source: stamp && stamp.source ? stamp.source : "import",
    };
  });
  return { v: 1, people };
}

/* Every reader goes through this, so a key written before `v: 1` existed, or
   one written as a bare id → record map, still reads. Rule 1. */
export function readStore(raw) {
  if (!raw || typeof raw !== "object") return { v: 1, people: {} };
  if (raw.people && typeof raw.people === "object") return { v: raw.v || 1, people: raw.people };
  return { v: 1, people: raw };
}

/* ══════════════════════════════════════════════════════════════════════════
   ★★ ONE PERSON'S OWN SHIFTS, ACROSS HOWEVER MANY WEEKS ARE LOADED.

   Matt, Aug 14 2026: "how does the team see it and they need to only see their
   own."

   ⚠️⚠️ THIS IS THE OWN-ONLY RULE, AND IT IS THE ONLY ONE. "Lineup · My Shifts"
   is tier 1 as of today, so ~106 people can open the screen that holds the
   whole built week in memory. Nothing renders a shift that this function did
   not hand back, and it hands back exactly the rows whose id is the viewer's.
   ⇒ MODULE LEVEL AND PURE (rule 7) so it can be tested with a real week rather
   than proof-read inside a component.

   ⚠️ NO id, NO SHIFTS. A viewer the roster could not resolve gets an empty
   list, never everybody's. Failing closed is right for a filter that is
   standing in for a permission.

   ⚠️ EVERY ROW CARRIES `weekOf`. Two weeks are on screen, so "which week" can
   no longer be read off one piece of state — dropping a shift and approving a
   swap both key off it.
   ══════════════════════════════════════════════════════════════════════════ */
export function shiftsForPerson(weeks, personId) {
  const me = String(personId == null ? "" : personId);
  if (!me) return [];
  const out = [];
  (Array.isArray(weeks) ? weeks : []).forEach((wk) => {
    if (!wk || !wk.days || typeof wk.days !== "object") return;
    Object.keys(wk.days).forEach((day) => {
      const rec = wk.days[day] || {};
      const sides = rec.sides || {};
      Object.keys(sides).forEach((side) => {
        const list = (sides[side] || {}).shifts;
        (Array.isArray(list) ? list : []).forEach((sh) => {
          if (!sh || String(sh.id) !== me) return;
          out.push({ ...sh, day, side, iso: rec.iso, weekOf: wk.monday });
        });
      });
    });
  });
  /* Soonest first. Somebody opening this wants tomorrow, not Monday week. */
  return out.sort((a, b) => String(a.iso || "").localeCompare(String(b.iso || "")) || (a.start - b.start));
}
