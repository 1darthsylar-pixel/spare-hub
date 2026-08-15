/* ══════════════════════════════════════════════════════════════════════════
   boardSwap.js — PUTTING THE NEW PERSON WHERE THE OLD ONE STOOD.

   Matt, Aug 14 2026: "i want the hub to auto approve shift swaps with rules and
   i want it to auto upadate the setup."

   An approved swap already moves the shift on the SCHEDULE. The board leaders
   actually read at 6am is a different record — `gcfcr-dailysetup-{side}-v2-
   {MondayISO}-auto` — and until now nothing touched it. So a swap approved on
   Thursday left Thursday's setup naming somebody who is not coming in, and the
   first person to find out was whoever opened.

   ★ LEAF. Imports `boardOwner.js` and `nameMatch.js`, both of which import
   nothing but each other. No React, no storage, no `import.meta.env` — the
   Worker can import this exactly as it imports boardOwner.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ IT NEVER DOES A STRING REPLACE ON A BOARD. THAT IS THE WHOLE FILE.
   ────────────────────────────────────────────────────────────────────────
   A cell is not a name. boardOwner.js already lists what has been measured in
   real cells: "✔️Daisy", a bare "✔️", "❌", "split duties", "Samuel @8:30",
   "Camila G →Saray 6", "✔️(Line!!)", stray spaces. Replacing "Ashley" with
   "Marco" across a day would hit "Ashley Rangel-avila" in the roster, the word
   inside a note, and any cell belonging to the OTHER Ashley.

   ⇒ Every candidate is read with the SAME functions the push notifications
   read it with — `cellName`, `rosterPersonNames`, `isOwner` — and a cell is only
   rewritten when:

     1. the name it resolves to is the person giving the shift up, AND
     2. that resolution is unambiguous against THAT DAY's roster (two Ashleys on
        Thursday means the cell says nothing this file may act on), AND
     3. the letters it is about to overwrite read back as the same name.

   Anything else is LEFT EXACTLY AS TYPED and counted in `skipped`, so the
   caller can say "two cells need a look" rather than quietly getting it wrong.

   ⚠️ THE MARKERS AND THE TIME SURVIVE. "✔️Samuel @8:30" becomes "✔️Marco @8:30".
   The ✔️ means a leader is covering that row and the @8:30 is a real start time;
   losing either would be a worse board than the wrong name, because the wrong
   name gets noticed.
   ══════════════════════════════════════════════════════════════════════════ */

import { cellName, rosterPersonNames, isOwner, DAYPARTS } from "./boardOwner.js";
import { normName, nameParts } from "./nameMatch.js";

/* The two board shapes, from DailySetup's own EMPTY_*_WEEK:
     FOH  { stations: [ {role, breakfast, lunch, mid, night}, ... ] }
     BOH  { sections: [ { stations: [ ...same... ] }, ... ] }
   Kept here rather than imported because boardOwner's `stationsOf` FLATTENS,
   which is right for reading and useless for writing back. */
const isFohDay = (day) => !!(day && Array.isArray(day.stations));
const isBohDay = (day) => !!(day && Array.isArray(day.sections));

const HANDOFF_SPLIT = /(→|->)/;   /* capturing, so the arrow can be put back */
const START_AT = /@\s*(\d{1,2}(?::\d{2})?)/;
const BARE_CLOCK = /\s(\d{1,2}(?::\d{2})?)\s*$/;

/* The run of letters a name occupies inside a cell. Words joined by spaces,
   never swallowing a trailing space, a clock, or a bracket.
   ⚠️ IT IS A CANDIDATE, NOT AN ANSWER. Nothing is rewritten on the strength of
   this match alone — `swapPart` checks that it reads back as the same name. */
const NAME_RUN = /[A-Za-z][A-Za-z'’.\-]*(?:\s+[A-Za-z][A-Za-z'’.\-]*)*/;

/* ══════════════════════════════════════════════════════════════════════════
   ⚠️⚠️ FIRST NAMES TWO PEOPLE ON THIS DAY ANSWER TO. THIS IS THE LOAD-BEARING
   GUARD AND IT IS NOT HYPOTHETICAL.

   Measured on the real FOH board, Friday Aug 14 2026: the roster carries
   **two Ashleys and two Camilas**, and the cells tell them apart only by an
   initial — "Ashley R" and "Ashley V", "Camila G" and "Camila L".

   `isOwner` matches a bare first name to ANYBODY who answers to it unless it is
   handed this set. That is the exact shape of the bug Hannah reported on Aug 12
   ("multiple people, including me, are receiving notifications that we are
   scheduled in certain positions but we are not") — and that was only a READ.
   Here it would put the wrong name in a box on a board a store prints.

   ⇒ A cell reading just "Ashley" on a day with two of them matches NOBODY and
   is left exactly as typed.
   ══════════════════════════════════════════════════════════════════════════ */
function sharedFirstNames(people) {
  const seen = new Map();
  (people || []).forEach((p) => {
    const parts = nameParts(p);
    if (!parts.length) return;
    const first = normName(parts[0]);
    if (!first) return;
    const list = seen.get(first) || [];
    if (!list.some((n) => normName(n) === normName(p))) list.push(p);
    seen.set(first, list);
  });
  const out = new Set();
  seen.forEach((list, first) => { if (list.length > 1) out.add(first); });
  return out;
}

/* One half of a cell (a whole cell, when there is no handoff arrow).
   Returns the rewritten text, or null when this half is not that person or
   cannot be rewritten safely. */
function swapPart(part, isThem, toName) {
  const raw = String(part == null ? "" : part);
  if (!raw.trim()) return null;

  /* Read it exactly as daypartAssignments does: an "@8:30" wins, and only when
     there is no "@" is a trailing bare clock treated as one. */
  const at = raw.match(START_AT);
  const bare = at ? null : raw.match(BARE_CLOCK);
  const forName = bare ? raw.replace(BARE_CLOCK, "") : raw;
  const who = cellName(forName);
  if (!who) return null;                       /* "✔️", "❌", "split duties" */
  if (!isThem(who)) return null;

  const hit = forName.match(NAME_RUN);
  if (!hit) return null;
  /* ⚠️ THE GUARD THAT MAKES THIS SAFE. If the letters about to be overwritten
     are not the name the cell resolves to, something in this cell is not what
     it looks like — a note before the name, an unusual marker — and it is left
     alone. Measured cheaply: cellName of the run must equal cellName of the
     half. */
  if (normName(cellName(hit[0])) !== normName(who)) return null;

  const swapped = forName.slice(0, hit.index) + toName + forName.slice(hit.index + hit[0].length);
  /* Put the bare clock back on the end exactly as it was written. */
  return bare ? swapped + bare[0] : swapped;
}

/* One cell, both halves of a handoff included.
   ⚠️ A HANDOFF IS TWO PEOPLE AND ONLY ONE OF THEM IS SWAPPING. "Camila G
   →Saray 6" with Saray giving her shift up must keep Camila. Splitting on the
   arrow and treating each half on its own is how boardOwner reads it too. */
export function swapCell(cell, isThem, toName) {
  const raw = String(cell == null ? "" : cell);
  if (!raw.trim()) return null;
  const parts = raw.split(HANDOFF_SPLIT);
  let hit = false;
  const out = parts.map((p, i) => {
    if (i % 2 === 1) return p;                 /* the captured arrow itself */
    const next = swapPart(p, isThem, toName);
    if (next == null) return p;
    hit = true;
    return next;
  });
  return hit ? out.join("") : null;
}

/* A roster line is "Ashley Rangel-avila 11-2", and sometimes
   "Name — Role (hours)". Only the leading name run is replaced; the hours and
   anything after them are the SHIFT, which does not change in a swap. */
export function swapRosterLine(line, isThem, toName) {
  const raw = String(line == null ? "" : line);
  if (!raw.trim()) return null;
  const hit = raw.match(NAME_RUN);
  if (!hit) return null;
  const who = cellName(hit[0]);
  if (!who || !isThem(who)) return null;
  return raw.slice(0, hit.index) + toName + raw.slice(hit.index + hit[0].length);
}

/* ══════════════════════════════════════════════════════════════════════════
   ★★ ONE DAY OF ONE HOUSE.

   Returns { day, cells, rosterLines, skipped, ambiguous }:
     day          a NEW object; the one handed in is never mutated
     cells        how many station cells were rewritten
     rosterLines  how many roster lines were rewritten
     skipped      cells that named this person and could not be rewritten
     ambiguous    true when the day's roster holds two people who answer to the
                  leaver's name, in which case NOTHING is touched

   ⚠️ AMBIGUOUS MEANS STOP, NOT GUESS. Hannah, Aug 12 2026: "multiple people,
   including me, are receiving notifications that we are scheduled in certain
   positions but we are not." That was a READ resolving a short cell to the
   wrong person. This is a WRITE, and the same mistake would put the wrong name
   on a printed board for a week.
   ══════════════════════════════════════════════════════════════════════════ */
export function swapOnDay(day, fromName, toName, toId) {
  const none = { day, cells: 0, rosterLines: 0, skipped: 0, ambiguous: false, droppedTrainer: false };
  if (!day || typeof day !== "object") return none;
  if (!String(fromName || "").trim() || !String(toName || "").trim()) return none;

  /* Who is on this day, by full name, from the board's own roster. */
  const people = rosterPersonNames(day);
  const shared = sharedFirstNames(people);
  const owns = people.filter((p) => isOwner(p, { names: [fromName] }, shared));
  /* Two people on today's roster answer to this name. Nothing is safe here. */
  if (owns.length > 1) return { ...none, ambiguous: true };

  /* The test a cell has to pass. ⚠️ BUILT ONCE AND PASSED DOWN rather than
     re-derived per cell, so every cell on the day is judged by one rule, and
     `shared` is closed over so a bare first name on a two-Ashley day can never
     match from any call site. */
  const isThem = (name) => isOwner(fromName, { names: [name] }, shared);

  let cells = 0, rosterLines = 0, skipped = 0;

  const mapStation = (st) => {
    if (!st || typeof st !== "object") return st;
    let next = st;
    DAYPARTS.forEach((dp) => {
      const cur = next[dp];
      if (cur == null || !String(cur).trim()) return;
      const swapped = swapCell(cur, isThem, toName);
      if (swapped == null) {
        /* Did it name them and simply refuse? That is worth reporting; a cell
           that names somebody else is not. */
        const who = cellName(String(cur).split(HANDOFF_SPLIT)[0]);
        if (who && isThem(who)) skipped += 1;
        return;
      }
      if (next === st) next = { ...st };
      next[dp] = swapped;
      cells += 1;
    });
    return next;
  };

  let out = day;
  if (isFohDay(day)) {
    const stations = day.stations.map(mapStation);
    if (cells) out = { ...day, stations };
  } else if (isBohDay(day)) {
    const before = cells;
    const sections = day.sections.map((sec) => {
      if (!sec || !Array.isArray(sec.stations)) return sec;
      const at = cells;
      const stations = sec.stations.map(mapStation);
      return cells === at ? sec : { ...sec, stations };
    });
    if (cells !== before) out = { ...day, sections };
  }

  if (Array.isArray(day.roster)) {
    let touched = false;
    const roster = day.roster.map((line) => {
      const next = swapRosterLine(line, isThem, toName);
      if (next == null) return line;
      touched = true; rosterLines += 1;
      return next;
    });
    if (touched) out = { ...out, roster };
  }

  /* ══════════════════════════════════════════════════════════════════════
     ⚠️⚠️ THE TRAINER LIST LOSES A NAME AND DOES NOT GAIN ONE.

     A real day carries a second list beside the roster — `trainers`, in the
     same "Name 6-11, 11-2" shape — measured on the live Friday board. The
     person handing the shift off comes OFF it, because she is not in the
     building. The person taking it is NOT put on it, because whether somebody
     is a trainer is a fact about them that this module cannot know, and a
     board that quietly promotes people is worse than one that is short a name.

     ⇒ Reported as `droppedTrainer` so the leader is told, rather than finding
     an empty trainer slot at 6am.
     ══════════════════════════════════════════════════════════════════════ */
  let droppedTrainer = false;
  if (Array.isArray(day.trainers)) {
    const trainers = day.trainers.filter((line) => {
      const hit = String(line == null ? "" : line).match(NAME_RUN);
      const who = hit ? cellName(hit[0]) : "";
      return !(who && isThem(who));
    });
    if (trainers.length !== day.trainers.length) { droppedTrainer = true; out = { ...out, trainers }; }
  }

  /* The structured twin of the roster: [{ id, name }], written beside it by
     DailySetup and read back for photos and the missing/extra check. Swapped
     only when the caller knows the new person's id — a name with somebody
     else's id attached is worse than a stale row, because everything
     downstream trusts the id over the words. */
  if (Array.isArray(day.people) && String(toId || "").trim()) {
    let touched = false;
    const people = day.people.map((p) => {
      if (!p || typeof p !== "object" || !isThem(String(p.name || ""))) return p;
      touched = true;
      return { ...p, id: String(toId), name: toName };
    });
    if (touched) out = { ...out, people };
  }

  return { day: out, cells, rosterLines, skipped, ambiguous: false, droppedTrainer };
}

/* ══════════════════════════════════════════════════════════════════════════
   ★ ONE WHOLE BOARD (a week, keyed by day name).

   ⚠️ ONE DAY ONLY. A swap is for one shift on one day, and rewriting a name
   across the week would move six shifts because somebody gave up one.
   ⚠️ NOTHING CHANGED MEANS `changed: false` AND THE ORIGINAL OBJECT BACK, so a
   caller can skip the write entirely. Writing an identical board is not free:
   it is a second writer racing DailySetup for the same key.
   ══════════════════════════════════════════════════════════════════════════ */
export function applyBoardSwap(board, dayName, fromName, toName, toId) {
  const src = board && typeof board === "object" ? board : null;
  const key = String(dayName || "");
  if (!src || !key || !src[key]) {
    return { board, changed: false, cells: 0, rosterLines: 0, skipped: 0, ambiguous: false, droppedTrainer: false };
  }
  const r = swapOnDay(src[key], fromName, toName, toId);
  const changed = r.cells > 0 || r.rosterLines > 0 || r.droppedTrainer;
  return {
    board: changed ? { ...src, [key]: r.day } : src,
    changed,
    cells: r.cells,
    rosterLines: r.rosterLines,
    skipped: r.skipped,
    ambiguous: r.ambiguous,
    droppedTrainer: r.droppedTrainer,
  };
}

/* One line a leader can read, for the banner after an approval.
   ⚠️ IT SAYS WHAT DID NOT HAPPEN TOO. "Setup updated" over a board with two
   cells nobody could rewrite is the kind of quiet half-success this repo keeps
   paying for. */
export function swapSummary(r) {
  if (!r) return "";
  if (r.ambiguous) return "Two people on that day answer to that name, so the setup was left alone.";
  const bits = [];
  if (r.cells) bits.push(`${r.cells} station ${r.cells === 1 ? "box" : "boxes"}`);
  if (r.rosterLines) bits.push(`the roster`);
  if (r.droppedTrainer) bits.push("the trainer list");
  if (!bits.length) return "Nothing on the setup named them, so nothing changed there.";
  let s = `Setup updated: ${bits.join(" and ")}.`;
  if (r.skipped) s += ` ${r.skipped} ${r.skipped === 1 ? "box needs" : "boxes need"} a look.`;
  /* ⚠️ SAID OUT LOUD. A trainer slot that silently emptied is a person nobody
     knows is missing until a new hire is standing there. */
  if (r.droppedTrainer) s += " They were a trainer today, so that slot is now open.";
  return s;
}
