import React, { useState, useMemo, useEffect } from 'react';
/* The one raised look and card face — see cardStyle.js. */
import { importZone, CARD_3D, CARD_3D_SOFT, cardSurface, accentEdge, sectionTint, shade, toolRow } from "./cardStyle.js";
import { Check, X, Users, GraduationCap, AlertTriangle, Thermometer, ChevronDown, ChevronUp, UtensilsCrossed, ChefHat, Minus, Clock, Plus, Printer, Pencil, Save, Upload, Info, Lock, RefreshCw, Trash2 } from 'lucide-react';
import { HR_TEAM, HR_RANK, loadHRTeam } from './HRConsole.jsx';
import { autoAssignFOH, autoAssignBreaks } from './FOHAutoAssign.js';
import { autoAssignBOH } from './BOHAutoAssign.js';
import { buildDayBoard } from './stationTemplates.js';
import { trainerTaskFallback } from './trainerTaskRoster.js';
/* normName is the SHARED name matcher. Writing a second one here is what
   broke the food safety rota for days — one definition, one leaf module. */
import { sameLeader, normName, nameParts, resolveLeaderId } from './nameMatch.js';
/* ⚠️⚠️ `kvGet`, NOT THIS FILE'S OWN `readKV`, AND THE DIFFERENCE IS NOT
   COSMETIC. The two are different storage roads with different value shapes:
   `writeKV` stores `JSON.stringify(val)` through `window.storage` and `readKV`
   parses that string back, while `kvSet` hands the Worker the OBJECT and
   `kvGet` returns an object. The schedule is written by ScheduleBuilder through
   `kvSet`, so it must be read with `kvGet` — reading it with `readKV` would try
   to JSON.parse something that is already parsed. Same key, same database, and
   still the wrong door. REPO-MAP.md has the long version under "Two storage
   paths exist and they are not the same backend". */
import { hubToken, kvGet } from './store.js';
/* Leaf data module, imports nothing — safe to pull in here. Needed so the board
   can tell a person who left years ago from a note somebody typed in a cell. */
/* Leaf module, imports nothing. Its keys are already exactly SHIFT_KEYS, which
   is what lets "the shift running now" work with no mapping table. */
import { DAYPARTS, DAYPART_WINDOW, nightWindowFrom } from './dayparts.js';
/* ★ ONE ANSWER TO "what hours does this line mean". Moved out of this file
   Aug 7 2026 — see shiftHours.js for the three-way drift it ends. */
import { TIME_RANGE_DASH, TIME_RANGE_TWOCLOCK, parseClock, parseRanges } from "./shiftHours.js";
/* The key the Schedule tile writes a week under. ONE definition, in the leaf,
   so the writer and this reader can never drift onto different keys. */
import { scheduleKey } from "./scheduleEngine.js";
import { STORE, storeCfg, sectionsOf } from "./storeConfig.js"; // store name on the board header, and the section order the colours index into

/* ============================================================================
   DailySetup.jsx — Gate City Hub (weekly boards + Google Docs / Auto Assignment
   dual-source edition)

   WHAT CHANGED FROM v3 — LOCKED STATION TEMPLATES
   • The Auto Assignment board's STRUCTURE (stations, sections, posted
     hours, ❌/✔️/split-duties markers) now always comes from
     stationTemplates.js — locked per-day templates verified against the
     live Google Sheets, all six days, FOH + BOH, including the
     weekend-only stations (DRINKS 2) and weekend hour shifts (Machines
     4,5 lunch block, Loader split, Kitchen Manager 11AM open). Three
     paths all use it:
       1. First-time seed of a week's Auto draft.
       2. "Reset stations" (was "Sync hours") — no longer fetches the
          live sheet; rebuilds instantly from the templates.
       3. The base for every import — each import rebuilds the day's
          structure from the template, then fills it, so structure can
          never drift from the verified spec.
     Pre-marked cells double as engine locks: the engines never overwrite
     a non-empty cell, so only cells the template leaves open get filled.
     The Google Docs live mirror is untouched.

   WHAT CHANGED FROM v2
   • Two fully separate boards now exist per day per side:
       - "Google Docs" source: the existing live board (gcfcr-dailysetup-
         foh/boh-v2-[monday-ISO]) — read-only live mirror of the Sheet.
       - "Auto Assignment" source: an INDEPENDENT draft board
         (…-v2-[monday-ISO]-auto).
   • A single toggle — "Google Docs" / "Auto Assignment" — controls BOTH
     which board you're viewing/editing AND which board Import writes into.
   • Import tab no longer has its own separate mode toggle.
   • DISPLAY FIX: a bare ✔️ cell no longer invents a name; leadership rows
     get no fallback map.

   Everything below this that isn't part of that (week rollover, PIN
   unlock, break compliance, printing, etc.) is unchanged from v2.
   ============================================================================ */

/* ============ CONFIG ============ */
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHIFT_KEYS = ['breakfast', 'lunch', 'mid', 'night'];
const SHIFT_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', mid: 'Mid', night: 'Night' };
/* ⚠️ WRITTEN OUT BY HAND, NEVER SLICED FROM THE LABEL (Matt, Aug 6 2026:
   "Someone might be offended by this"). Night cut to three letters spells the
   start of a racial slur, and the compact board printed it directly beside a
   team member's name. Night gets four letters; nothing derives these. */
const SHIFT_ABBR = { breakfast: 'BRE', lunch: 'LUN', mid: 'MID', night: 'NGT' };
/* The three reads of one board, and the per-device memory of which one you
   last chose. Order is the order of the buttons.
   ★ BOARD FIRST (Matt, Aug 6 2026: "change the setup priority order to board,
   compact and by position"). Board is also the DEFAULT below, so first in the
   list and first on arrival now agree — they did not, and a first-time opener
   landed on the second button in the row.
   ⚠️ The stored preference still wins for anyone who has already chosen. This
   changes where a NEW device starts, never what somebody picked. */
/* ⚠️⚠️ TWO VIEWS, NOT THREE. Matt, Aug 14 2026, after the board was rebuilt to
   match the training lines: "in the actual setup i want this new view and
   compact only."

   'By position' was the big-type read, added Aug 3 2026 when the grid was a
   flat four-across table nobody could scan. The grid is not that any more — it
   carries the section stripe, the tinted face and the posted hours — so the
   third view was answering a question the first one now answers, and a picker
   with a choice nobody needs is a choice everybody has to make.

   ⚠️ THE COMPONENT FILE STAYS ON DISK, UNREFERENCED, ON PURPOSE. Nothing
   imports it, so it leaves the bundle, which is the part that matters. Deleting
   500 lines of working code in the same change that hides it is two decisions
   wearing one commit; if the view is wanted back, the import is one line.
   ⚠️ ANY STORED PREFERENCE OF 'position' MUST STILL READ. Whoever last chose it
   has that word saved on their device — see readLayout. */
const LAYOUTS = [['grid', 'Board'], ['compact', 'Compact']];
const LAYOUT_KEY = 'gcfcr-setup-layout-v1';

const ACCENT = '#0F766E'; // teal-700

const FOH_LEGACY_KEY = 'gcfcr-dailysetup-foh-v1';
const BOH_LEGACY_KEY = 'gcfcr-dailysetup-boh-v1';
const MINORS_KEY = 'gcfcr-dailysetup-minors-v1';
const PINS_KEY = 'gcfcr-hr-pins';
const ROLES_KEY = 'gcfcr-hr-roles';

/* ⛔ THE HUB SCHEDULE IS NOT TRUSTED YET. Matt, Aug 14 2026: "lock the button
   on the setup for now that lets them pull the schedule in until we have it
   finished and can trust it."

   ⇒ TO UNLOCK: set this to true. That is the whole change. Nothing else in
   this file reads the scheduling platform.

   ⚠️⚠️ THE BUTTON BEING DISABLED IS NOT THE LOCK. `pullSchedule` refuses on its
   own as well, below. A `disabled` attribute lives in the DOM of a shared store
   iPad and is one inspector away from being cleared, and the thing on the other
   side of it REBUILDS A PRINTED BOARD. Same rule as the shift-pickup gate: if
   hiding the control is the only thing stopping the action, it is not a gate.

   ⚠️ IT STAYS VISIBLE AND SAYS WHY. Removing the button would be the
   TeamResources bug again — a control that vanishes reads as broken, and the
   next person to want it goes looking for what they did wrong. This one is
   greyed with the reason on it, so it explains itself and reminds us it is
   owed. */
const HUB_SCHEDULE_PULL_READY = false;
/* ★ HOW THIS BOARD STOPS GOING STALE.
   Matt, Jul 30 2026: "tyler is no longer here. how can we integrate this with
   the hr console to avoid going stale?"

   HR already knew — Tyler Byrd has been `terminated` with a term date of
   2026-07-20 since the day he left. Nothing on this board ever asked. The
   roster self-corrects because it is re-imported from the schedule, but the
   TRAINER list is typed by hand and stays exactly as somebody left it, so a
   name can sit there for months after the person has gone.

   ⚠️ IT REPORTS, IT DOES NOT DELETE. Silently removing a name from a board a
   leader is working from mid-week would be worse than the stale name: they
   would be looking for a cell that vanished, with nothing saying why. And a
   termination entered by mistake would quietly rewrite a live board. So HR is
   the source of truth about EMPLOYMENT and this board is told, once, plainly.
   ⚠️ `gcfcr-hr-status` is deliberately NOT on the worker's protected list, so
   this needs no token and works for any leader who opens the board. */
const HR_STATUS_KEY = 'gcfcr-hr-status';

// source: 'gdocs' (default, the live board) or 'auto' (independent draft)
const weekKey = (side, weekStart, source = 'gdocs') =>
  `gcfcr-dailysetup-${side}-v2-${weekStart}${source === 'auto' ? '-auto' : ''}`;

const SOURCE_LABEL = { gdocs: 'Google Docs', auto: 'Auto Assignment' };

/* ═══ FOOD SAFETY WALKTHROUGH ROTA ═══════════════════════════════════════
   Hannah, Jul 23: "auto assign food safety walk thrus on the daily setup —
   3 days pick a foh leader working and 3 days pick a boh leader working."
   Her spec: FIXED split (FOH Mon-Wed, BOH Thu-Sat — the store is closed
   Sunday, so DAYS is exactly those six), eligible = anyone WORKING that day
   at Senior Trainer and up, and "spread it out so all leaders share
   responsibility" — so this ROTATES on memory of who drew it last, never at
   random.

   ⚠️ THE FALLBACK IS AN INTERPRETATION. She wrote "assign closet option";
   read here as: if nobody eligible is on the required side that day, borrow
   an eligible leader from the OTHER side. The board LABELS that as a borrow
   so it is never silent. Confirm with her before treating it as settled.

   It NEVER invents an assignee — no eligible leader working means no
   assignment, shown plainly, rather than naming someone who isn't there. */
const FS_ROTA_KEY = 'gcfcr-foodsafety-rota-v1';
const FS_SIDE = { Monday: 'foh', Tuesday: 'foh', Wednesday: 'foh', Thursday: 'boh', Friday: 'boh', Saturday: 'boh' };
const FS_MIN_RANK = 3; // Senior Trainer and up, per Hannah

// Roster entries are STRINGS shaped "Full Name 9a-5p" (see rosterEntryString),
// sometimes with a ✔ and multiple ranges. Strip back to the name.
function fsNameOf(entry) {
  return String(entry || '')
    .replace(/✔️|✔/g, '')
    .replace(/\s+\d{1,2}(:\d{2})?\s*[ap]?m?\s*-\s*\d{1,2}(:\d{2})?\s*[ap]?m?.*$/i, '')
    .trim();
}

function fsEligible(dayRoster, rankByName) {
  const seen = new Set(); const out = [];
  (dayRoster || []).forEach((entry) => {
    const n = fsNameOf(entry);
    const k = n.toLowerCase();
    if (!n || seen.has(k)) return;
    seen.add(k);
    // Try each key form — the board's "Samuel" has to reach "Samuel Jackson".
    let rank = 0;
    for (const kk of fsNameKeys(n)) { const r = rankByName[kk]; if (typeof r === 'number') { rank = r; break; } }
    if (rank >= FS_MIN_RANK) out.push(n);
  });
  return out;
}

// Least-recently-assigned wins; never-assigned wins outright; alphabetical
// tiebreak so the same inputs always give the same person.
function fsPick(cands, lastBy) {
  if (!cands.length) return null;
  return cands.slice().sort((a, b) => {
    const la = lastBy[a.toLowerCase()] || '', lb = lastBy[b.toLowerCase()] || '';
    if (la !== lb) return la < lb ? -1 : 1;
    return a.localeCompare(b);
  })[0];
}

function fsAssignFor(day, fohRoster, bohRoster, rankByName, lastBy) {
  const want = FS_SIDE[day];
  if (!want) return null;
  const primary = fsEligible(want === 'foh' ? fohRoster : bohRoster, rankByName);
  if (primary.length) return { name: fsPick(primary, lastBy), side: want, fallback: false };
  const other = fsEligible(want === 'foh' ? bohRoster : fohRoster, rankByName);
  if (other.length) return { name: fsPick(other, lastBy), side: want === 'foh' ? 'boh' : 'foh', fallback: true };
  return null;
}

/* ⚠️ HR_TEAM IS THE FROZEN SEED, NOT THE ROSTER. Anyone hired since that seed
   was written lives only in gcfcr-hr-added-v1, and every function in this file
   read the seed directly, so those people did not exist as far as the board was
   concerned. HRConsole says this in its own margin: "THE ROSTER IS NOT HR_TEAM
   ANYMORE — USE loadHRTeam()."

   What it cost, Jul 30 2026: Friday's board reported "1 uncovered slot, OT 1
   Night 5:30–10, nobody on the clock covers these" while Abril Cortes was
   scheduled 5:30–10 that night. Hannah added her on Jul 23. Savannah Smith and
   Valerie Hernandez Cruz were invisible the same way on Thursday.

   ★ FILLED ONCE AT MOUNT, FALLS BACK TO THE SEED. A module-level cache rather
   than a prop because five separate helpers here need it and they are called
   from render paths that cannot await. The fallback means a failed read degrades
   to today's behaviour instead of emptying the roster. */
let LIVE_TEAM = null;
const teamList = () => {
  if (Array.isArray(LIVE_TEAM) && LIVE_TEAM.length) return LIVE_TEAM;
  return Array.isArray(HR_TEAM) ? HR_TEAM : Object.values(HR_TEAM || {});
};

// name → rank, from the live roster with the gcfcr-hr-roles overrides applied.
// ★ THE BUG THIS FIXES (Jul 25 2026). Hannah, three mornings running: "the food
// safety walk thru still isn't right… today there were multiple options."
//
// This map was keyed on the FULL HR name lowercased — "samuel jackson". The
// board writes FIRST NAMES — "Samuel". `fsEligible` looked up "samuel", got
// undefined, scored 0, and concluded nobody on the board was senior enough.
// Every single day. The people were there; the lookup could never see them.
//
// Now keyed on THREE forms per person, the same shapes the worker uses:
// full ("samueljackson"), first ("samuel"), first+last-initial ("samuelj").
// A key shared by two people is dropped ONLY when their ranks differ — two
// people called Samuel at the same rank give the same answer either way, and
// under-assigning is recoverable while naming the wrong person publicly is not.
function fsNameKeys(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  const norm = (x) => String(x || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');
  const out = [norm(parts.join(''))];
  out.push(norm(parts[0]));
  if (parts[1]) out.push(norm(parts[0] + parts[1][0]));
  return [...new Set(out.filter(Boolean))];
}

/* Names HR says have left. Keyed the same three ways as fsRankByName — full,
   first, first+last-initial — because the board writes first names and the HR
   record holds full ones. */
function departedNames(hrStatus) {
  const list = teamList();
  return list
    .filter((m) => m && m.name && (hrStatus || {})[m.id] === 'terminated')
    .map((m) => m.name);
}

/* ★ "I also want the trainers and up to be labeled the same as the hr
   console" (Matt, Jul 31 2026). Same name-key machinery as fsRankByName, but
   the value is the HR TITLE, and Team Members are left out entirely — the
   chips must not drown in labels, and "trainers and up" includes Junior
   Trainer by TITLE even though its access rank equals Team Member. A name
   key shared by two people with different titles is dropped, same clash
   rule as the rank map: a missing tag beats a wrong one. */
/* 🐛 SAME FLAW AS fsAvatarByName, FOUND WHILE FIXING IT (Aug 8 2026). The
   `return` for a Team Member fired BEFORE their name keys were counted, so a
   Team Member never contributed a clash. A Trainer and a Team Member sharing a
   first name meant the key resolved to the Trainer's title and the TEAM MEMBER'S
   chip wore it. Eight first-name keys on this roster are shared by more than one
   person, so this was not hypothetical.
   Ambiguity is counted across the whole roster first, exactly as the avatars
   now do; the Team Member filter then only decides who gets a LABEL, never who
   gets counted. A missing tag beats a wrong one, which this function already
   said and could not deliver. */
function fsRoleByName(hrRoles) {
  const map = {};
  const clash = new Set();
  const owners = new Map();
  teamList().forEach((m) => {
    if (!m || !m.name) return;
    fsNameKeys(m.name).forEach((k) => owners.set(k, (owners.get(k) || 0) + 1));
  });
  teamList().forEach((m) => {
    if (!m || !m.name) return;
    const role = (hrRoles && hrRoles[m.id]) || m.role || '';
    if (!role || /^team member$/i.test(role.trim())) return;
    fsNameKeys(m.name).forEach((k) => {
      if (owners.get(k) !== 1) { clash.add(k); return; }
      if (map[k] === undefined) map[k] = role;
      else if (map[k] !== role) clash.add(k);
    });
  });
  clash.forEach((k) => delete map[k]);
  return map;
}
/* ★ "is it also possible to put their profile pics with the names on the
   setup?" (Matt, Jul 31 2026). Same photo map HR Console renders (the worker
   caches Slack profile photos into hr:slack-avatars:v1, custom photos only),
   keyed by normName(full name). No photo, no img — names alone, like today. */
/* The person's name out of ANY board text. splitRoleHours only strips a
   parenthesised "(11-7)"; a station CELL usually carries bare trailing hours
   ("Chloe Jackson 5:45-2"), and a roster line can carry "@station" or a "→".
   Without this the photo lookup missed on almost every cell — the key in the
   avatar map is "chloe jackson", not "chloe jackson 5:45-2" — so faces would
   have shown in the roster and nowhere else, which is the bug this whole
   change exists to fix. Initials were unaffected (they take the first two
   words), which is exactly why this would have gone unnoticed. */
/* THE PERSON'S OWN SHIFT for this cell — the exact substring cellPersonName
   throws away.

   Matt, Aug 4 2026: "I want the persons actual shift for that day part
   displayed on the card." The by-position view was showing the STATION's
   operating window in its header ("WINDOW (6AM-11PM)"), which is when the
   position is open, not when the person standing on it is there. Those are
   different facts and the second one is the useful one on a setup board.

   ⚠️ INVERSE OF cellPersonName BY CONSTRUCTION. That function strips a trailing
   time range with two patterns; this reads the same two back. They are next to
   each other on purpose — if one changes and the other does not, a name keeps a
   time stuck on the end of it or a shift silently disappears, and nobody would
   connect the two. Keep them together.
   Returns "" when the cell carries no time, which is normal and must render as
   nothing rather than as a stray dash. */
const SHIFT_RANGE_RE = /(\d{1,2}(?::\d{2})?\s*-\s*\d{1,2}(?::\d{2})?)\s*$/;
/* \u2605 ONE DEFINITION OF THE "@time" MARKER, shared with cellDisplay below.
   The engines write a start time as a trailing "@11:15" when somebody comes in
   off the station's own opening hour. `@` is overloaded on a board \u2014 a roster
   line can also carry "@station" \u2014 so this only matches when what follows is a
   clock, and it must stay anchored to the END of the string for that reason. */
const AT_TIME_RE = /\s*@\s*(\d{1,2}(?::\d{2})?)\s*$/;
/* The relay half of a handoff: "Lulani 6" means Lulani takes it from 6. Needs
   the leading whitespace so it can never bite into a name. cellPersonName strips
   this exact shape off the end of a name, which is the file already treating it
   as a time; this is the reader that was missing. */
const BARE_CLOCK_RE = /\s(\d{1,2}(?::\d{2})?)\s*$/;
/* ★ THE ONE WAY A CELL IS SPLIT INTO PEOPLE, shared with cellPeople below.
   ⚠️ cellHours USED TO SPLIT ON THE MIDDOT ALONE while cellPeople split on all
   of these, even though cellHours' own comment claimed it followed cellPeople.
   A handoff is separated by an ARROW, so the split produced one part where
   cellPeople produced two people, the loop filled slot 0 and never reached slot
   1, and the relay time was silently dropped. That is the whole "it just doesnt
   show the relay time" bug. Two splits over one string is how a name ends up
   wearing somebody else's hours; now there is only one. */
const CELL_SPLIT_RE = /→|->|·|\/|,|&|\+/;
function cellPersonHours(entryStr) {
  const cleaned = splitRoleHours(stripCheck(entryStr || "")).name.split("\u2192")[0];
  /* \ud83d\udc1b THE "@11:15" WAS BEING THROWN AWAY HERE (Matt, Aug 4 2026: "i imported
     the setup for tommorow and the 11:15 shifts say 11").
     This read a trailing RANGE only, and its very first step stripped `@` and
     everything after it. So for a cell reading "Alianis @11:15" it answered ""
     and the By Position card showed her with no time at all, falling back to the
     generic "Lunch \u00b7 11-2" daypart label \u2014 which is where the 11 came from.
     The Board looked right the whole time because it has a SECOND path,
     cellDisplay, which does read the marker. Two readers of one fact, and only
     one of them knew about the marker.
     \u21d2 Check the marker FIRST, using cellDisplay's own regex, then fall back to
     the range. The two views now answer the same question the same way.
     \u26a0\ufe0f THE "@" IS KEPT IN THE RETURNED STRING on purpose. A range is the whole
     shift ("5:45-2"); a bare clock is only a START. Returning "11:15" would read
     as a shift that somehow lasts an instant, and it would also silently change
     what the Board renders, which has shown "@11:15" all along. */
  const at = cleaned.match(AT_TIME_RE);
  if (at) return `@${at[1]}`;
  const base = cleaned.replace(/@.*$/, "");
  const m = base.match(SHIFT_RANGE_RE);
  if (m) return m[1].replace(/\s+/g, "");
  /* 🐛 A BARE TRAILING CLOCK IS A START TIME TOO (Matt, Aug 4 2026: "another
     glitch", on LEADER DT reading "Lizbeth →Lulani 6").
     The second half of a handoff is written "Lulani 6", with no @ and no range,
     meaning Lulani takes it from 6. cellPersonName has ALWAYS stripped that
     trailing number off the name — so the file already agreed it is a time — but
     nothing read it back, so the handoff time vanished off the card.
     ⚠️ Returned exactly as typed, no "@" added. The Board has rendered these as
     a bare number all along and tomorrow morning is not the day to change what a
     closing time looks like to a leader. */
  const bare = base.match(BARE_CLOCK_RE);
  return bare ? bare[1] : "";
}

/* Shift times for a cell, ALIGNED INDEX-FOR-INDEX with cellPeople.

   ⚠️ IT SPLITS THE CELL THE SAME WAY cellPeople DOES rather than re-deriving
   its own list. Two different splits over one string is how a name ends up
   wearing somebody else's hours, and on a setup board that is a person told to
   come in at the wrong time. If cellPeople's splitting changes, this follows it
   for free.
   Entries with no time yield "" so the caller renders nothing there. */
function cellHours(raw) {
  const names = cellPeople(raw);
  if (!names.length) return [];
  const parts = String(raw || "").split(CELL_SPLIT_RE);
  const out = names.map(() => "");
  let pi = 0;
  for (const part of parts) {
    const nm = cellPersonName(part);
    if (!nm) continue;
    while (pi < names.length && names[pi] !== nm) pi++;
    if (pi >= names.length) break;
    out[pi] = cellPersonHours(part);
    pi++;
  }
  return out;
}

/* Split a board cell into what to SHOW and the start time written on it.

   🐛 THE BOARD PRINTED THE RAW CELL (Matt, Aug 4 2026, looking at Tuesday:
   "Pablo @6" and "Paola @11:15" beside plain "Thanh" and "Charity"). The
   by-position view strips that suffix and the board did not, so the same person
   read two different ways depending on which toggle you were on, and the board
   looked like somebody had typed inconsistently when the data was fine.

   ⚠️ IT TRIMS THE SUFFIX, IT DOES NOT REBUILD THE NAME. cellPersonName splits on
   the handoff arrow and keeps only the first person, which is right for matching
   a face and WRONG here — a cell reading "Pablo → Maria" must still show both on
   the board or the second half of the shift disappears off the screen. So this
   only removes a trailing "@time" and leaves everything else exactly as typed. */
function cellDisplay(entryStr) {
  const raw = stripCheck(entryStr || "").trim();
  /* Shares AT_TIME_RE with cellPersonHours above. It used to be written out
     twice, and the copy up there was the one that did not know about it. */
  const m = raw.match(AT_TIME_RE);
  return m ? { text: raw.slice(0, m.index).trim(), at: m[1] } : { text: raw, at: "" };
}

function cellPersonName(entryStr) {
  return splitRoleHours(stripCheck(entryStr || ""))
    .name
    .split("→")[0]
    .replace(/@.*$/, "")
    .replace(/\s+\d{1,2}(:\d{2})?\s*-\s*\d{1,2}(:\d{2})?\s*$/, "")
    .replace(/\s+\d{1,2}(:\d{2})?\s*$/, "")
    .trim();
}

function avatarOf(entryStr, avatarsMap) {
  if (!avatarsMap) return null;
  const nm = cellPersonName(entryStr);
  /* Try the raw name first — that is the Slack-display-name case that used to
     be the ONLY thing that worked — then the roster-derived keys. */
  const direct = avatarsMap[normName(nm)];
  if (direct) return direct;
  for (const k of fsNameKeys(nm)) { if (avatarsMap[k]) return avatarsMap[k]; }
  return null;
}

/* ★ A FACE OR INITIALS — NEVER NOTHING (Matt, Aug 2 2026: "whatever they come
   from in the HR console is what I want in the setup").
   The board and HR Console already read the SAME cache (hr:slack-avatars:v1),
   so the source was never the difference. The difference was the fallback:
   HR Console draws an initials tile when someone has no photo, the board drew
   nothing. Only ~8 of 106 people have ever set a Slack profile picture, so the
   board came out patchy — a handful of faces and a column of bare names, which
   reads as half-broken rather than as "most people have no photo".
   ⚠️ Same two-letter rule as HR Console's `ini`, kept identical on purpose so a
   person's initials never differ between the two screens. */
const iniOf = (entryStr) => {
  const nm = cellPersonName(entryStr);
  return nm.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
};

/* One 15px circle for a board cell: the photo when there is one, initials when
   there is not. Written once so all four call sites can never drift apart. */
function BoardFace({ entry, avatars, size = 15, flush = false }) {
  const pic = avatarOf(entry, avatars);
  /* ★ MATCHES HR CONSOLE (Matt, Aug 2 2026: "this is how I want the setup to
     look", with a screenshot of the HR Console team list). Same navy #14243D,
     same rounded SQUARE rather than a circle, same white initials — so a person
     looks like the same person on both screens. Radius scales with size so a
     13px board tile keeps HR Console's 9-on-36 proportion instead of turning
     into a blob. */
  const box = {
    width: size, height: size, borderRadius: Math.max(3, Math.round(size * 0.25)),
    display: "inline-block", flexShrink: 0,
    // Inline use (roster lines) needs the nudge + right margin; inside the
    // flex meta line both fight the gap and make the spacing look uneven.
    ...(flush ? {} : { verticalAlign: "-3px", marginRight: 5 }),
  };
  if (pic) {
    return (
      <img
        src={pic}
        alt=""
        onError={(e) => { e.currentTarget.style.display = "none"; }}
        style={{ ...box, objectFit: "cover" }}
      />
    );
  }
  const txt = iniOf(entry);
  if (!txt) return null;
  return (
    <span
      style={{
        ...box, background: "#14243D", color: "#fff",
        fontSize: Math.round(size * 0.48), fontWeight: 700,
        lineHeight: `${size}px`, textAlign: "center", letterSpacing: "0.01em",
      }}
    >
      {txt}
    </span>
  );
}

// A board entry ("Name (11-7)") to its HR title, or null for Team Members.
function roleTagOf(entryStr, rolesMap) {
  if (!rolesMap) return null;
  const nm = splitRoleHours(entryStr).name;
  for (const k of fsNameKeys(nm)) { const r = rolesMap[k]; if (r) return r; }
  return null;
}

/* ★ THE BADGE IS THE PERSON'S REAL HR TITLE, ABBREVIATED (Matt, Aug 2 2026:
   "I want the title to match what the staff says but abbreviated").
   It used to be derived from RANK, which collapsed every trainer into one
   "TRN" — but the store has ten Junior Trainers and eight Senior Trainers, and
   on a board that is the difference between who can run a position alone and
   who cannot. These are the titles actually in gcfcr-hr-roles today; anything
   unlisted falls back to initials of its words, so a title HR adds later still
   renders something sensible instead of vanishing.
   ⚠️ TEAM MEMBER RETURNS NOTHING ON PURPOSE. Most of the board is team
   members; badging all of them would be noise on the exact screen leaders scan
   fastest, and the useful signal is who is NOT a plain team member. */
const TITLE_ABBR = {
  "junior trainer": "JT",
  "senior trainer": "ST",
  "trainer": "TRN",
  "team leader": "TL",
  "junior team leader": "JTL",
  "senior team leader": "STL",
  "assistant director": "AD",
  "director": "DIR",
  "executive director": "ED",
  "executive director | hr": "HR",
  "leadership development director": "LDD",
  "human resources": "HR",
  "accounts payable": "AP",
  "owner": "OWN",
  "owner/operator": "OWN",
  "team member": null,
};
/* ⚠️ MUST STAY IN STEP WITH ROLE_COLORS IN HRConsole.jsx. Matt asked for the
   board to look like the HR Console team list, and a Team Leader showing blue
   there and something else here would defeat the point — the colour is how you
   recognise a rank without reading it. Same hexes, keyed lowercase like
   TITLE_ABBR so both lookups take the same input. */
const TITLE_COLOR = {
  "team member": "#6B7280",
  "junior trainer": "#0D9488",
  "trainer": "#0F766E",
  "senior trainer": "#0E7490",
  "team leader": "#1D4ED8",
  "junior team leader": "#2563EB",
  "senior team leader": "#1E40AF",
  "assistant director": "#6D28D9",
  "manager": "#6D28D9",
  "director": "#B45309",
  "leadership development director": "#223C6A",
  "leadership director": "#223C6A",
  "executive director": "#14243D",
  "executive director | hr": "#DD0031",
  "human resources": "#DD0031",
  "accounts payable": "#6B7280",
  "owner": "#111827",
  "owner/operator": "#111827",
};
const titleColor = (title) => TITLE_COLOR[String(title || "").trim().toLowerCase()] || "#6B7280";

function abbrevTitle(title) {
  const t = String(title || "").trim().toLowerCase();
  if (!t) return null;
  if (Object.prototype.hasOwnProperty.call(TITLE_ABBR, t)) return TITLE_ABBR[t];
  return t.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();
}

/* ★ PHOTOS KEYED THE WAY THE BOARD WRITES NAMES.
   🐛 Matt, Aug 3 2026: "the setup and team registry dont have all of the pics.
   the closet one is hr console." All three read the SAME Slack photo map, so
   the difference was never the data — it was the lookup. HR Console asks by
   FULL name, which is how the map is keyed. The board writes FIRST names, so
   it only ever found a photo when someone's Slack display name happened to be
   their first name. That is why a handful worked and most did not.

   The role badges have keyed three ways since they were built, and the comment
   on fsNameKeys says exactly why: "the board writes first names and the HR
   record holds full ones." The photos simply never got the same treatment.

   So: walk the roster, find each person's photo by their FULL name, and
   register it under all three keys — full, first, first+last-initial.

   ⚠️ AMBIGUOUS KEYS ARE DROPPED, same as fsRankByName. Two people called Maria
   must not resolve to one face; showing the wrong person's photo on a board is
   worse than showing initials. A clash removes the short key and the full name
   still works. */
/* 🐛 AND THE CLASH TEST ONLY FIRED WHEN BOTH PEOPLE HAD A PHOTO (Bri, Aug 7
   2026: "The two Adriana's are getting pictures mixed up on the setup. They are
   correct in HR, but not translating to the setup.").
   `if (!url) return;` skipped somebody with no picture BEFORE their name keys
   were registered, so they never contributed a clash. Adriana Arias Hurtado and
   Adriana both key to "adriana"; one had a Slack photo and one did
   not, so "adriana" resolved to the one face and the other Adriana's cell drew
   it. Two people, one picture, and the board looked perfectly normal.
   ⚠️ AMBIGUITY IS A PROPERTY OF THE ROSTER, NOT OF WHO HAPPENS TO HAVE A PHOTO.
   Counted across everybody first, then a photo is only registered under keys
   exactly one person owns. A shared first name falls back to initials, which
   this file already says is the right answer. */
/* Which name keys does more than one roster person answer to? ONE definition —
   both the photo map and the merge below need the same answer, and two copies
   of "is this name ambiguous" drifting apart is the whole bug family. */
function fsSharedKeys() {
  const owners = new Map();          // name key -> how many roster people own it
  teamList().forEach((m) => {
    if (!m || !m.name) return;
    fsNameKeys(m.name).forEach((k) => owners.set(k, (owners.get(k) || 0) + 1));
  });
  const shared = new Set();
  owners.forEach((n, k) => { if (n > 1) shared.add(k); });
  return shared;
}

function fsAvatarByName(slackByName) {
  const map = {};
  if (!slackByName) return map;
  const shared = fsSharedKeys();
  teamList().forEach((m) => {
    if (!m || !m.name) return;
    const url = slackByName[normName(m.name)];
    if (!url) return;
    fsNameKeys(m.name).forEach((k) => {
      if (!shared.has(k)) map[k] = url;
    });
  });
  return map;
}

/* 🐛 THE FIX ABOVE WAS BEING UNDONE ONE LINE LATER (Aug 9 2026, sweep 25).
   The call site did `{ ...slackRaw, ...fsAvatarByName(slackRaw) }`. For exactly
   the keys this file works to suppress, the derived map contributes NOTHING —
   that is the whole point of omitting them — so the raw Slack key underneath
   survived the merge and won. Bri's Aug 7 report was still live after the Aug 8
   fix: cells "Adriana", "Adriana A" and even the full "Adriana Arias Hurtado"
   all drew the other Adriana's face.
   ⇒ OMITTING A KEY IS NOT THE SAME AS REMOVING IT. Strip the shared keys from
   the raw map FIRST, then merge. Same rule, applied to both layers.
   ⚠️ The worker now also deletes these keys at the source when it builds the
   map (sweep 24), so this is the second of two locks on the same door. Keep
   both: the stored map is only rewritten once a week, and a bare key can come
   back the moment somebody's Slack display name changes. */
function fsPhotoMap(slackRaw) {
  const shared = fsSharedKeys();
  const safeRaw = {};
  Object.keys(slackRaw || {}).forEach((k) => {
    if (!shared.has(k)) safeRaw[k] = slackRaw[k];
  });
  return { ...safeRaw, ...fsAvatarByName(slackRaw) };
}

function fsRankByName(hrRoles) {
  const map = {};
  const clash = new Set();
  const list = teamList();
  list.forEach((m) => {
    if (!m || !m.name) return;
    const role = (hrRoles && hrRoles[m.id]) || m.role || '';
    const r = rankOfRole(role);
    fsNameKeys(m.name).forEach((k) => {
      if (map[k] === undefined) map[k] = r;
      else if (map[k] !== r) clash.add(k);
    });
  });
  clash.forEach((k) => delete map[k]);
  return map;
}

const PERIOD_COLORS = {
  breakfast: { text: '#B45309', bg: '#FFFBEB', dot: '#F59E0B' }, // amber
  lunch: { text: '#C2410C', bg: '#FFF7ED', dot: '#F97316' }, // orange
  mid: { text: '#1D4ED8', bg: '#EFF6FF', dot: '#3B82F6' }, // blue
  night: { text: '#4338CA', bg: '#EEF2FF', dot: '#6366F1' }, // indigo
};

/* ★ THE BOARD IS GROUPED THE WAY THE STORE ACTUALLY RUNS (Matt, Aug 5 2026:
   "Window, expo, drinks, DT bagger and OT's are all DT. Cleanliness and
   hospitality belong to front counter. Group the leaders with their own
   section", then "desserts stay in dt" and "drinks dt").

   FRONT LINE AND DINING ROOM ARE GONE as groups. Window, expo, drinks and
   desserts all serve the drive thru, so they sit with it; hospitality and
   cleanliness are front counter work. The old split described the template's
   zone labels, not who the work is for.

   ⚠️ THE OT ROWS MOVED, THE LEADER ROWS DID NOT. "Leadership & OT" was one
   group holding two unlike things. OT is drive thru work and now sits there;
   the leaders get a section of their own.

   ⚠️ DISPLAY ONLY. This regroups what the board SHOWS. It is not
   stationTemplates.js and not an assign engine, so it needs no re-import and
   cannot wipe a leader's manual edits. Safe to deploy mid-shift.

   ⚠️ IT DOES NOT TOUCH THE LABOR SPLIT. fohSide() in dayparts.js keeps its own
   pattern list on purpose and is not read from here, so no DT or FC hours and
   no money moved with this. Checked before shipping.

   ⚠️ ORDER MATTERS — categorizeFOH takes the FIRST match. "LEADER DT" must not
   fall into the dt bucket, which is why dt tests `DT\s` and `OT\s` with the
   space, never a bare `DT`. */
const FOH_CATEGORIES = [
  /* ⚠️ `DRINKS(?!\/)` IS THE WHOLE TRICK. categorizeFOH takes the FIRST match and
     dt is tested first, so a bare `DRINKS` alternative would swallow
     "DRINKS/DESSERTS" before Front Counter ever saw it. The lookahead lets the
     standalone DRINKS station through to Drive Thru while the combined row falls
     to fc below, which is where Matt put it: "the only things for FC are
     traditional bagger, mobile bagger, mobile drinks/desserts, Reg 1,2, and 3,
     hospitality and cleanliness". */
  { key: 'dt', label: 'Drive Thru', color: '#2563EB', test: (r) => /^(WINDOW|EXPO|DRINKS(?!\/)|DESSERTS|DT\s|OT\s)/i.test(r) },
  /* ⚠️ BOTH SPELLINGS OF THE COMBINED ROW. The template now says "MOBILE
     DRINKS/DESSERTS", but every board already saved in KV holds the old
     "DRINKS/DESSERTS" and only a re-import rewrites it. Matching just the new
     name would drop months of saved weekend boards into Drive Thru and hand
     them the wrong leader. Design rule 1: old records must still read. */
  /* ⚠️⚠️ `INSIDE EXPO` IS LISTED HERE OR IT FALLS OFF THE BOTTOM OF THE BOARD.
     This bucket matches the station NAME with a regex, not the `section` field
     in storeConfig — so a new station carrying `section: "FRONT COUNTER"` still
     lands in the "Other" bucket at the bottom unless its name is added here.
     That is exactly the DIRECTOR bug documented two lines down, and adding a
     station is the moment it happens again.
     ⚠️ IT SURVIVES THE `dt` TEST ABOVE, which is checked FIRST and contains
     `EXPO`. That alternative is anchored with `^`, and this name starts with
     "INSIDE", so it does not match. Renaming this station to anything starting
     with "EXPO" would silently move it to Drive Thru. */
  { key: 'fc', label: 'Front Counter', color: '#059669', test: (r) => /^(REGISTER|TRADITIONAL BAGGER|MOBILE BAGGER|MOBILE DRINKS|DRINKS\/DESSERTS|HOSPITALITY|CLEANLINESS|INSIDE EXPO)/i.test(r) },
  { key: 'training', label: 'Training', color: '#DB2777', test: (r) => /^(TRAINING|TRAINER)$/i.test(r) },
  /* ⚠️ DIRECTOR IS LISTED EXPLICITLY. It used to match nothing here — only
     "ASSISTANT DIRECTOR" did — so the FOH Director row fell through to the
     "Other" bucket and rendered at the BOTTOM of the board, while BOH carried
     its Director inside LEADERSHIP near the top. Same station, two different
     places, depending on which side a leader opened (Matt, Aug 1 2026: "director
     is on bottom on one side and on top the other. i just want them consistent").
     The FOH template already orders dirFoh directly above the two AD rows, so
     matching it here is all that was missing. Kept AFTER "ASSISTANT DIRECTOR" in
     the alternation for readability only — both land in this same category. */
  { key: 'leadership', label: 'Leadership', color: '#4F46E5', test: (r) => /^(LEADER |ASSISTANT DIRECTOR|DIRECTOR)/i.test(r) },
];

/* ⚠️ ROWS THAT STAY BARE WHEN NOBODY IS ASSIGNED, whichever group they end up
   in. This used to be a property of the GROUP — dining and leadership got no
   leader fallback — but the regroup above moves OT into Drive Thru and
   hospitality and cleanliness into Front Counter, and both of those groups DO
   carry a fallback. Without this, an empty OT Captain cell would suddenly print
   the DT leader's name and an empty Cleanliness cell would print the FC
   leader's, on every board, for rows that have always been left blank.
   The rule belongs to the row, not to the box it is drawn in.

   ⚠️ ONE COVERAGE CHANGE IS REAL, AND IT IS NOT THIS ONE. Window, expo, drinks
   and desserts moved from Front Line into Drive Thru, and a bare cell on those
   rows now falls back to the DRIVE THRU leader instead of the Front Counter
   leader. That follows from the regroup rather than being separate to it — if
   those stations are drive thru work, the drive thru leader is who covers them
   — but it is a visible change and it fires with no manual edit: the weekend
   template ships DRINKS/DESSERTS with three bare cells already in it. Flagged
   to Matt rather than buried. */
const NO_LEADER_COVER = /^(OT\s|HOSPITALITY|CLEANLINESS)/i;

const FOH_FALLBACK_CATEGORY = { key: 'other', label: 'Other', color: '#6B7280' };

function categorizeFOH(role) {
  return FOH_CATEGORIES.find((c) => c.test(role)) || FOH_FALLBACK_CATEGORY;
}

// groups keep the station's index in the flat array so edit handlers can target it
function groupFOHStations(stations) {
  const order = [];
  const map = {};
  (stations || []).forEach((s, idx) => {
    const cat = categorizeFOH(s.role);
    if (!map[cat.key]) {
      map[cat.key] = { ...cat, items: [] };
      order.push(cat.key);
    }
    map[cat.key].items.push({ station: s, idx });
  });
  // Training rides at the BOTTOM of the board no matter where the TRAINING /
  // TRAINER rows land in the flat stations array (Matt, Jul 24 2026).
  const ordered = order.filter((k) => k !== 'training');
  if (order.includes('training')) ordered.push('training');
  return ordered.map((k) => map[k]);
}

/* ★ THE SAME GROUPS, FLATTENED (Matt, Aug 6 2026, on the By position view:
   "Color is correct nut the grouping is not").
   That view renders ONE continuous run of cards and tints each by its group, so
   it was showing Drive Thru blue, then Front Counter green, then the OT cards in
   Drive Thru blue again — right colours, wrong order, because it was walking the
   raw station array.
   ⚠️ BUILT ON groupFOHStations, NOT ON A SECOND SORT. Reusing it means the
   running order can never disagree with the grid's, and Training keeps landing
   last without this having to know that rule. BOH is returned untouched: it has
   its own sections and its own order. */
function orderByGroup(rows, isFoh) {
  if (!isFoh || !Array.isArray(rows)) return rows;
  return groupFOHStations(rows).flatMap((g) => g.items.map((it) => it.station));
}

/* ══════════════════════════════════════════════════════════════════════════
   ★★ THE BOARD'S SECTION COLOURS — one palette, shared with the schedule.

   ⚠️⚠️ THIS WAS A HARDCODED MAP OF THIS STORE'S TEN BOH SECTION NAMES, and it
   was two bugs at once.

     Rule 8: the ten hexes existed here AND as SECTION_TINTS in cardStyle.js,
     which the schedule board indexes into. Two copies of one palette drift, and
     the day they drift is the day BREADING is teal on the setup board and blue
     on the schedule beside it.

     Rule 18: it was keyed by NAME, so a store whose sections are not called
     PRIMARY and FRY STATION fell through to `ACCENT` on every single row — one
     flat colour for a whole board, with nothing to say why, and no screen
     anywhere to fix it.

   ⇒ Indexing into the shared palette by the section's position in this store's
   OWN list fixes both. Another store gets a coloured board on day one without
   anybody typing a hex value.

   ⚠️ MEASURED BEFORE SWITCHING, not assumed: for this store the two agree on
   all ten sections, byte for byte, so nothing anybody looks at changes colour.
   The old map's key order and the config's first-appearance order were the same
   order, which is why it looked fine for a year.

   ⚠️ SIDE-WIDE, VIA `sectionsOf`. See the note at sectionTint: indexing by a
   position within ONE DAY's list makes a section change colour between two days
   of the same board.

   ⚠️ READ AT CALL TIME, never captured at module scope. `storeCfg` answers from
   live config, and a store's saved settings arrive after this module loads. A
   const here would freeze the shipped default and quietly ignore every rename. */
function bohSectionColor(name) {
  const order = sectionsOf(storeCfg('stations.BOH'));
  const at = order.indexOf(name);
  /* A section the config does not list at all still gets a colour rather than
     `undefined`, and the Hub accent is the honest answer for "this came from
     somewhere other than the station list". */
  return at < 0 ? ACCENT : sectionTint(at);
}

// HotSchedules job code → BOH section. First match wins; anything unmatched
// stays roster-only (or FOH, on auto-split). Order matters: specific → general.
const BOH_JOB_MAP = [
  { re: /bread/i, section: 'BREADING' },
  { re: /load|filter|thaw/i, section: 'BREADING' },
  { re: /fry|fries|hash/i, section: 'FRY STATION' },
  { re: /machine/i, section: 'MACHINES' },
  { re: /\bprep\b/i, section: 'PREP' },
  { re: /truck|receiv/i, section: 'TRUCK / RECEIVING' },
  { re: /dish|sanit/i, section: 'DISH / SANITATION' },
  { re: /biscuit|egg|nugget|strip|soup|\bmac\b|secondary/i, section: 'SECONDARY' },
  { re: /board|sandwich/i, section: 'PRIMARY' },
  { re: /primary|point|special/i, section: 'PRIMARY' },
  { re: /kitchen lead|kitchen manager|kitchen mgr/i, section: 'LEADERSHIP' },
  { re: /\bcook\b|kitchen|\bboh\b|grill/i, section: 'SECONDARY' },
];
function mapJobToSection(job) {
  if (!job) return null;
  const hit = BOH_JOB_MAP.find((j) => j.re.test(job));
  return hit ? hit.section : null;
}

/* ============ KV HELPERS (shared Hub storage) ============ */
/* ⚠️ A FAILED READ IS NOT AN EMPTY ONE. `readKV` answers null for both, which
   is fine for a read that only fills the screen. It is NOT fine anywhere the
   answer decides a write — see loadAutoDraftBoard, which used to seed a blank
   template over a real week because a dropped read looked like "no board yet".
   Use `readKVResult` and check `ok` before writing anything. */
async function readKVResult(key) {
  try {
    const r = await window.storage.getResult(key, true);
    return { ok: !!(r && r.ok), value: r && r.value ? JSON.parse(r.value) : null };
  } catch (e) {
    return { ok: false, value: null };
  }
}
async function readKV(key) {
  const r = await readKVResult(key);
  return r.value;
}
async function writeKV(key, val) {
  try {
    /* ⚠️ RETURN THE REAL ANSWER. This used to await the write and then return
       true regardless, so persistBoard's "Couldn't save" warning below could
       never fire and a dropped save still read "saved for everyone". */
    return await window.storage.set(key, JSON.stringify(val), true);
  } catch (e) {
    return false;
  }
}

/* ============ WEEK ENGINE ============ */
const pad2 = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

/* Monday ISO of the board week. Rollover: Saturday 11 PM — from then (and
   all day Sunday) the board week is the UPCOMING Mon–Sat. offset 1 = next. */
function boardWeekStart(offset = 0, now = new Date()) {
  const d = new Date(now);
  const day = d.getDay(); // 0 = Sun
  if (day === 0) d.setDate(d.getDate() + 1);
  else if (day === 6 && d.getHours() >= 23) d.setDate(d.getDate() + 2);
  else d.setDate(d.getDate() - (day - 1));
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset * 7);
  return isoOf(d);
}
function shiftWeek(weekStart, deltaWeeks) {
  const d = fromIso(weekStart);
  d.setDate(d.getDate() + deltaWeeks * 7);
  return isoOf(d);
}
function weekDatesOf(weekStart) {
  const mon = fromIso(weekStart);
  const map = {};
  DAYS.forEach((name, idx) => {
    const dt = new Date(mon);
    dt.setDate(mon.getDate() + idx);
    map[name] = isoOf(dt);
  });
  return map;
}
function weekLabel(weekStart) {
  const mon = fromIso(weekStart);
  const sat = new Date(mon);
  sat.setDate(mon.getDate() + 5);
  const f = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${f(mon)} – ${f(sat)}`;
}

/* ============ NEW-WEEK / NEW-DRAFT CLEARING ============ */
/* Keep structure, clear people: ❌ stays, ✔️ stays (name stripped),
   "split duties" stays, anything else blanks. */
function clearedCell(v) {
  const s = (v || '').trim();
  if (s === '❌') return '❌';
  if (s.includes('✔')) return '✔️';
  if (/split duties/i.test(s)) return 'split duties';
  return '';
}
function clearBoardWeek(weekObj, side) {
  const next = {};
  DAYS.forEach((dName) => {
    const dayData = weekObj && weekObj[dName];
    if (!dayData) return;
    const copy = JSON.parse(JSON.stringify(dayData));
    copy.roster = [];
    if (side === 'foh') {
      (copy.stations || []).forEach((s) => SHIFT_KEYS.forEach((k) => { s[k] = clearedCell(s[k]); }));
    } else {
      (copy.sections || []).forEach((sec) =>
        (sec.stations || []).forEach((s) => SHIFT_KEYS.forEach((k) => { s[k] = clearedCell(s[k]); }))
      );
    }
    next[dName] = copy;
  });
  return next;
}
const EMPTY_FOH_WEEK = DAYS.reduce((o, d) => { o[d] = { stations: [], trainers: [], roster: [] }; return o; }, {});
const EMPTY_BOH_WEEK = DAYS.reduce((o, d) => { o[d] = { sections: [], roster: [], reminders: [], weights: {} }; return o; }, {});

/* ============ LOCKED STATION TEMPLATES ============
   The Auto Assignment board's structure comes from stationTemplates.js —
   per-day station lists, posted hours, and ❌/✔️/split-duties markers
   verified against the live FOH/BOH Google Sheets for all six days
   (including the weekend-only stations and weekend hour shifts).
   buildDayBoard takes 'Mon'…'Sat'; DAYS holds full names, so slice(0,3). */
const templateDayBoard = (side, dayName) => buildDayBoard(side, dayName.slice(0, 3));
function templateWeekBoard(side) {
  const week = {};
  DAYS.forEach((d) => { week[d] = templateDayBoard(side, d); });
  return week;
}

/* Load (or seed) the Auto Assignment DRAFT board for this week. Completely
   separate storage from the Google Docs board. First time it's opened it
   builds straight from the LOCKED station templates (stationTemplates.js) —
   verified structure and hours, every name empty — so it reads as "empty"
   until an Auto-mode import fills it in. Once it exists, it's never
   re-seeded automatically; only an import, a "Reset stations", or a manual
   edit changes it. */
async function loadAutoDraftBoard(side, weekStart) {
  const key = weekKey(side, weekStart, 'auto');
  const { ok, value: existing } = await readKVResult(key);
  /* ★★ NEVER SEED ON A FAILED READ.
     🐛 This used to call readKV, which answers null for BOTH "no board yet" and
     "we could not reach the database". A read timeout on shop wifi therefore
     looked like a fresh week, and the next line wrote a BLANK TEMPLATE OVER THE
     REAL BOARD. It ran at mount for FOH and BOH every single time the tool
     opened, so one bad moment of wifi silently wiped a week leaders had already
     built. Bail out and let the caller say so instead. */
  if (!ok) return { data: null, seeded: false, failed: true };
  if (existing) return { data: existing, seeded: false };
  const fresh = templateWeekBoard(side);
  // Best-effort seed — writeKV reports false rather than throw. A missed seed
  // costs nothing: the template still renders from memory, and the first real
  // board edit persists the whole week through the checked save path.
  await writeKV(key, fresh);
  return { data: fresh, seeded: true };
}

/* ============ SMALL HELPERS ============ */
function splitRoleHours(role) {
  const m = (role || '').match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return { name: m[1].trim(), hours: m[2].trim() };
  return { name: (role || '').trim(), hours: null };
}

function stripCheck(str) {
  return (str || '').replace(/✔️|✔/g, '').trim();
}

/* ============ EDIT HISTORY (Google-Sheets-style) ============
   Who changed which cell, when, and from what to what.

   WHY NOT THE _edits FLAG: station._edits[field] is one boolean per cell,
   overwritten in place — no author, no timestamp, no before/after, and only
   ever the latest state. It stays as-is (it drives the orange highlight); the
   history is a separate, additive record.

   WHY DIFF AT SAVE: onFohStation/onBohStation fire on every keystroke, so
   stamping there would log "M, Ma, Mar, Mari, Maria" as five edits. saveDraft
   compares the cleaned draft against the stored board instead and emits one
   entry per real change.

   WHY ITS OWN KEY: every Import calls templateDayBoard and rebuilds the day
   from the locked template, wiping anything stored on the board (_edits
   included). History lives at its own key so it OUTLIVES imports — which is
   what "like Sheets" means. Newest first, capped.

   Rows are matched BY INDEX, not by role name: several roles legitimately
   repeat on a board (two ASSISTANT DIRECTOR rows on FOH, two
   "Loader / Filter / Thaw" on BOH), so keying by name would cross-wire them.
   If the structure itself changed (station added/deleted/re-imported), the
   index/role no longer line up and that row is skipped — a rebuild isn't a
   cell edit. */
const HIST_CAP = 300;
const histKey = (side, dateKey) => `gcfcr-dailysetup-hist-${side}-${dateKey}`;

/* Flatten either board shape to a comparable [{ role, cells }] list.
   ⚠️ EXPORTED, and shared with the by-position view. FOH keeps stations at the
   top level and BOH nests them under sections; anything reading the board
   generically needs both flattened the same way, and a second flattener is how
   the two views start disagreeing about which positions exist. */
/* ══════════════════════════════════════════════════════════════════════════
   ★★ THE FOUR ROWS THAT ARE NOT POSITIONS.

   Matt, Aug 14 2026: "Remove the assistant director and director boxes. Give
   them color and title in their box. Get rid of training and trainer boxes and
   notate on the setup and schedule."

   DIRECTOR, ASSISTANT DIRECTOR, TRAINING and TRAINER were never places to
   stand. They were 60 rows across the week carrying `hours: null`, which the
   scheduling engine already had to skip when working out demand — so they were
   board rows that meant "a fact about a person", printed as if they were a
   station. Who is directing is now the DIR badge on whatever box that person is
   actually standing in, and who is learning is the L on their own cell.

   ⚠️⚠️ THEY ARE FILTERED AT RENDER, NOT DELETED FROM THE SAVED BOARD, and that
   is deliberate twice over. They are gone from `storeConfig.js`, so every board
   built or imported from now on simply does not have them — but seven weeks of
   SAVED boards still carry them, and rewriting stored rows to tidy a screen is
   exactly the surgical data edit this project does not do. The record is left
   whole and the reader hides them, which is also the only version that is
   instantly reversible.

   ⚠️ A PERSON WHOSE ONLY APPEARANCE WAS ONE OF THESE ROWS DISAPPEARS FROM THE
   BOARD until that day is rebuilt. That is a real cost and it is stated rather
   than buried: on a saved week, a director who was written into the DIRECTOR
   row and nowhere else is no longer drawn. The underlying record still holds
   them, so nothing is lost, and a re-import puts them on a real position.

   ★ MODULE LEVEL AND PURE (rule 7), and ONE definition — the grid, the compact
   view and the flattened history all filter through it or they start
   disagreeing about what is on the board. */
const NON_POSITION_ROWS = /^(director|assistant director|training|trainer)$/i;

/* A board row's station name, out of the "NAME (HOURS)" form the board stores.
   ⚠️ splitRoleHours IS NOT USED HERE ON PURPOSE: it lives further down the file
   and this predicate is read by helpers above it. Taking everything before the
   first bracket is the whole of what is needed. */
const isPositionRow = (role) =>
  !NON_POSITION_ROWS.test(String(role || "").split("(")[0].trim());

function historyRows(dayData, side) {
  if (!dayData) return [];
  /* `loc` is additive and exists so the by-position view can WRITE, not just
     read: a flattened row otherwise has no way back to the station it came
     from, and BOH nests them under sections. History diffing ignores it. */
  /* ⚠️ THE INDEX IS THE ONE IN THE STORED ARRAY, so the filter happens AFTER
     the map. Filtering first would renumber every row and every edit handler
     would write to the wrong station. */
  if (side === 'foh') {
    return (dayData.stations || [])
      .map((s, idx) => ({ role: s.role, cells: s, loc: { side: 'FOH', si: null, idx } }))
      .filter((r) => isPositionRow(r.role));
  }
  return (dayData.sections || []).flatMap((sec, si) => (sec.stations || [])
    .map((s, idx) => ({ role: s.role, cells: s, loc: { side: 'BOH', si, idx } }))
    .filter((r) => isPositionRow(r.role)));
}

function diffDayCells(prev, next, side, who) {
  const at = new Date().toISOString();
  const by = (who && who.name) || null;
  const prevRows = historyRows(prev, side);
  const nextRows = historyRows(next, side);
  const out = [];
  nextRows.forEach((r, i) => {
    const p = prevRows[i];
    if (!p || p.role !== r.role) return; // structure changed — not a cell edit
    SHIFT_KEYS.forEach((k) => {
      const from = (p.cells[k] || '').trim();
      const to = (r.cells[k] || '').trim();
      if (from === to) return;
      out.push({ at, by, role: splitRoleHours(r.role).name, field: k, from, to });
    });
  });
  return out;
}

async function appendHistory(side, dateKey, entries) {
  if (!entries || !entries.length || !dateKey) return;
  const key = histKey(side, dateKey);
  // Result-style read: readKV answers null for a FAILED read too, and this is
  // a read-merge-write — one dropped read used to truncate the day's whole
  // edit history to just the newest entries. Skipping the append on a failed
  // read loses one line; writing would lose the log.
  const curR = await readKVResult(key);
  if (!curR.ok) return;
  const cur = curR.value || [];
  const next = [...entries, ...(Array.isArray(cur) ? cur : [])].slice(0, HIST_CAP);
  // The history is an audit trail, not board data — a refused write drops
  // this line and the board's own checked save still tells the truth.
  await writeKV(key, next);
}

function fmtHistTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}
const histCellText = (v) => (v && v.trim() ? v.trim() : '—');

/* The history panel. Director-only (see showEditors in the main tile): the
   Google Docs board was removed because setups were being deleted, so Matt
   needs to see who changed what — but the board shouldn't become a
   team-visible scoreboard while leaders are hand-fixing it on instruction. */
function HistorySection({ side, dateKey, show, reloadKey }) {
  const [log, setLog] = useState(null);

  useEffect(() => {
    if (!show || !dateKey) return;
    let cancelled = false;
    setLog(null);
    (async () => {
      const v = await readKV(histKey(side, dateKey));
      if (!cancelled) setLog(Array.isArray(v) ? v : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [side, dateKey, show, reloadKey]);

  if (!show) return null;

  return (
    <div className="mt-3">
      <Collapsible
        title="Edit history"
        icon={<Pencil size={15} style={{ color: '#C2410C' }} />}
        trailing={
          log && log.length ? (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: '#FFF7ED', color: '#C2410C' }}>
              {log.length}
            </span>
          ) : null
        }
      >
        {log === null ? (
          <div className="text-[11.5px] text-gray-400 pt-1">Loading…</div>
        ) : log.length === 0 ? (
          <div className="text-[11.5px] text-gray-400 pt-1">
            No hand edits recorded for this day yet. History starts when someone saves a change.
          </div>
        ) : (
          <div className="space-y-1 pt-1">
            {log.map((e, i) => (
              <div key={i} className="rounded-lg bg-gray-50 px-2.5 py-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-gray-400">{fmtHistTime(e.at)}</span>
                  <span className="text-[11.5px] font-bold text-gray-900">{e.by || 'Unknown'}</span>
                  <span className="text-[11px] text-gray-400">·</span>
                  <span className="text-[11.5px] font-semibold text-gray-700">{e.role}</span>
                  <span className="rounded px-1 text-[9.5px] font-bold uppercase" style={{ background: (PERIOD_COLORS[e.field] || {}).bg, color: (PERIOD_COLORS[e.field] || {}).text }}>
                    {SHIFT_LABELS[e.field] || e.field}
                  </span>
                </div>
                <div className="text-[11.5px] text-gray-600 leading-snug mt-0.5">
                  <span className="line-through text-gray-400">{histCellText(e.from)}</span>
                  <span className="mx-1.5 text-gray-400">→</span>
                  <span className="font-semibold text-gray-900">{histCellText(e.to)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="text-[10px] text-gray-400 leading-snug pt-2 mt-1 border-t border-gray-100">
          Hand edits only — auto-assigned placements aren't changes. Kept per day, survives
          re-imports, newest first, last {HIST_CAP}. Edits made before this was added have no
          recorded author and don't appear.
        </div>
      </Collapsible>
    </div>
  );
}

// Trainer coloring: build a set from a day's trainers list (rosterEntryString
// shape "Full Name h-h") and test a board cell's occupant against it. The
// board labels a name "First" normally, but "First L" (first + last initial)
// whenever two people share a first name on the clock — matching lbl() in the
// engine. So the set carries BOTH keys per trainer ("ashley" and "ashley r"),
// and a cell that shows an initial ("Ashley R") is matched ONLY on the exact
// first+initial key, with no bare-first fallback. That keeps a colliding
// non-trainer ("Ashley V") from inheriting the trainer's color.
function trainerSetOf(trainers) {
  const set = new Set();
  (trainers || []).forEach((t) => {
    const parts = (t || '').trim().split(/\s+/);
    const first = (parts[0] || '').toLowerCase();
    if (!first) return;
    set.add(first);
    if (parts[1] && /[a-z]/i.test(parts[1][0])) set.add(first + ' ' + parts[1][0].toLowerCase());
  });
  return set;
}
/* ══════════════════════════════════════════════════════════════════════════
   ★★ WHO IS LEADING THIS DAYPART — as a mark on whatever box they stand in.

   Matt, Aug 14 2026: "Give the leaders on shift a color that states they are
   leading the shift with it notated in the box", and separately "typically a
   leader bags but if all positions are filled they can float but only then."

   The leader rows already say who is leading. What they could not say is that
   the person bagging at Register 2 IS that leader — so a leader reading the
   board saw a bagger, and the one row that named them was somewhere else
   entirely.

   ⚠️⚠️ PER DAYPART, NEVER PER DAY. Leadership changes at the shift change: the
   6am leader is bagging at breakfast and gone by dinner. A day-wide set would
   badge the morning leader on a night cell, which is a wrong name on a printed
   board rather than a missing one.

   ⚠️ THE SAME MATCHING RULE AS `cellIsTrainer`, deliberately and by calling the
   same code path. The board writes first names, disambiguated to "Ashley R" only
   when two people share one, and a second rule for "is this the same person"
   would drift on exactly the names hardest to notice. Design rule 8.

   ★ MODULE LEVEL AND PURE (rule 7). */
function leaderSetsOf(...maps) {
  const out = {};
  SHIFT_KEYS.forEach((k) => {
    /* ★ trainerSetOf DOES THE KEYING, and calling it is the whole point rather
       than a shortcut. It adds BOTH the bare first name and "first i", which is
       what lets `cellIsTrainer` match a cell written either way — and a second
       hand-rolled copy of that would drift on exactly the names hardest to
       notice. One definition of "is this the same person". */
    out[k] = trainerSetOf(maps.map((m) => m && m[k]).filter(Boolean));
  });
  return out;
}

function cellIsTrainer(trainerSet, val) {
  if (!trainerSet || !trainerSet.size) return false;
  // Drop the check, any handoff partner ("→Name 6"), and an "@time" suffix,
  // then read the primary name's first token + (if the cell is disambiguated)
  // its last-initial token.
  const primary = stripCheck(val || '').split('→')[0].split('@')[0];
  const parts = primary.trim().split(/\s+/).filter(Boolean);
  const first = (parts[0] || '').toLowerCase();
  if (!first) return false;
  const init = (parts[1] || '').replace(/[^a-z]/gi, '').slice(0, 1).toLowerCase();
  if (init) return trainerSet.has(first + ' ' + init); // "Ashley R" — exact only
  return trainerSet.has(first); // bare "Ashley" — safe, collisions always show an initial
}

/* ★ WHICH BADGE A CELL GETS.
   Matt, Jul 30 2026: "AD's have the TRN in the cell. can we change that to AD?
   the rules still apply for placement."

   ADs are in the trainer list — they train — so the cell was correctly finding
   them and then labelling them with the least useful of their two facts. On a
   board you scan for coverage, "who is the AD on this shift" is the thing you
   need at a glance and "they can also train" is not.

   ⚠️ DISPLAY ONLY. This changes nothing about placement, eligibility or the
   trainer set — the engines and every rule still read `trainerSet` exactly as
   before. Matt was explicit that the placement rules still apply.
   ⚠️ Rank 4 is Assistant Director; 5 and up is Director and above. DIR is
   inferred rather than asked for — he named ADs only — so if a Director should
   read differently, this one line is the place.
   ⚠️ Falls back to TRN whenever the rank is unknown. A name the HR map cannot
   resolve is not evidence the person is not a trainer. */
/* The pill colour for a cell, from the person's real title. Falls back to the
   neutral grey when the title is unknown, so an unmapped role still renders a
   readable pill rather than an invisible one. */
function cellBadgeColor(val, roles) {
  return titleColor(roleTagOf(val, roles));
}

function cellBadge(trainerSet, ranks, val, roles) {
  /* Real title first — that is what the person is called on the floor. Rank is
     only the fallback for someone missing from the roles map, so a board never
     loses a leader's badge just because HR has not filled their title in. */
  const abbr = abbrevTitle(roleTagOf(val, roles));
  if (abbr) return abbr;
  const trainer = cellIsTrainer(trainerSet, val);
  const primary = stripCheck(val || '').split('→')[0].split('@')[0];
  const keys = fsNameKeys(primary);
  let rank = 0;
  for (const k of keys) if (ranks && ranks[k] != null) { rank = ranks[k]; break; }
  if (rank >= 5) return 'DIR';
  if (rank === 4) return 'AD';
  return trainer ? 'TRN' : null;
}

function extractLeaderShiftMap(stations, test) {
  const row = (stations || []).find((s) => test(s.role));
  if (!row) return null;
  const map = {};
  SHIFT_KEYS.forEach((k) => {
    map[k] = stripCheck(row[k]);
  });
  return map;
}

function hexToSoftBg(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.1)`;
}

function titleCaseWord(w) {
  return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w;
}

function formatRosterEntry(str) {
  const UPPER_TOKENS = new Set(['dt', 'boh', 'fc', 'foh', 'cl', 'ad']);
  return (str || '')
    .split(' ')
    .map((word) => {
      if (!word) return word;
      if (/^[\d:./*-]+,?$/.test(word)) return word;
      const trailingPunct = (word.match(/[,.:]+$/) || [''])[0];
      const core = trailingPunct ? word.slice(0, -trailingPunct.length) : word;
      const lower = core.toLowerCase();
      if (UPPER_TOKENS.has(lower)) return lower.toUpperCase() + trailingPunct;
      return titleCaseWord(lower) + trailingPunct;
    })
    .join(' ');
}

function extractRosterName(formattedEntry) {
  const tokens = (formattedEntry || '').split(' ');
  const nameTokens = [];
  for (const t of tokens) {
    if (/\d/.test(t)) break;
    nameTokens.push(t.replace(/[-:]+$/, ''));
  }
  return nameTokens.join(' ').trim() || (formattedEntry || '').trim();
}

/* ============ TIME PARSING ============ */

// Two accepted range shapes:
//  • dash-joined, am/pm optional:  "5:00a-2:00p" · "5-2" · "11-5, 6-10"
//  • two clock times with am/pm, whitespace-separated (HotSchedules roster
//    report copy):  "5:00 PM 8:00 PM" · "6:00 AM 2:00 PM"

// Pulls every "start-end" range out of a string. Runs two passes: the
// dash form ("5-2", "5:00a-2:00p") and the two-clock form ("5:00 PM 8:00
// PM"). Without am/pm markers it leans on store hours: opens 5AM, so a bare
// start of 1–4 reads as PM, and the end rolls forward past the start.

function rangesHours(ranges) {
  return (ranges || []).reduce((t, r) => t + Math.max(0, r.end - r.start), 0);
}

function fmtClock(h) {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h % 1) * 60);
  const disp = ((hh + 11) % 12) + 1;
  return mm ? `${disp}:${String(mm).padStart(2, '0')}` : `${disp}`;
}

// "Trainers today" from HR roles: a person is a trainer if their effective
// HR role (KV override → base) contains "Trainer" (Jr/Sr tiers). Leaders/ADs
// have their own rows. Name match mirrors the minors match (full or first).
function fohTrainerList(people, hrRoles) {
  // Trainers come from TWO sources — NOT the Jr/Sr Trainer HR role, which
  // can't be assigned to AD-ranked staff (AD outranks Trainer):
  //   (1) trainerTaskRoster.js — the list Tashiana maintains, and
  //   (2) every Assistant Director — matched by role, so Daisy, Tashiana,
  //       and any other AD color regardless of the task rotation.
  const set = new Set();
  const addName = (name) => {
    const n = (name || '').trim().toLowerCase();
    if (!n) return;
    set.add(n);
    set.add(n.split(' ')[0]); // first-name match, same as the board cells
  };
  /* Through the gate: at a second store this is empty, so their board is
     matched against their own people only. */
  trainerTaskFallback().forEach((t) => addName(t.trainer));
  const team = teamList();
  team.forEach((mem) => {
    const role = (hrRoles && hrRoles[mem.id]) || (mem && mem.role) || '';
    /* "Director" joined the match (Jul 31 2026): Brandon and Daisy move from
       Assistant Director to Director and still run the floor — without this
       the title change silently stripped their trainer coloring from every
       imported board. Anchored so LDD / Executive Director do NOT match:
       those titles never appear on imported rosters, but a loose /director/
       would claim them the day one does. */
    if (/^(assistant\s+)?director$/i.test(String(role).trim())) addName(mem.name);
  });
  return (people || [])
    .filter((p) => {
      const n = (p.name || '').trim().toLowerCase();
      return set.has(n) || set.has(n.split(' ')[0]);
    })
    .map(rosterEntryString);
}

function rosterEntryString(p) {
  return `${p.name} ${p.ranges.map((r) => `${fmtClock(r.start)}-${fmtClock(r.end)}`).join(', ')}`;
}

/* ── THE DAY'S PEOPLE, WITH IDENTITY ──────────────────────────────────────
   ★ THE INFORMATION ALREADY EXISTS AND WAS BEING THROWN AWAY. The schedule
   import carries FULL names — "Lizbeth" — and the roster holds
   the same person with an id. That pairing is unambiguous. Then the board
   writes the CELL as "Lizbeth", and from that moment nothing downstream can
   tell the two Lizbeths apart: not the push routes, not the input register,
   not the headcount card. Every wrong-person bug in this app traces back to
   this one discarded fact.
   ⇒ Keep it. `day.people` is written beside `day.roster`, at the same two
   moments, from the same list.

   ⚠️ ADDITIVE, AND NOTHING READS IT YET. A board written before this simply
   has no `people`, and every reader keeps its current behaviour (design rule
   1: old records must still read). This commit only starts recording.
   ⚠️ AN UNRESOLVED NAME STORES `null`, NEVER A GUESS. resolveLeaderId is the
   two-tier matcher: exact shape first, and the short form only if nothing
   matched exactly — two candidates always return null. HotSchedules spells
   some people differently from HR ("Tashiana" vs "Tashiana
   Campos"), so a few will resolve to null every import. That is correct and
   expected: those fall back to today's name matching. Never wrong, sometimes
   absent.
   ⚠️ Reads the roster through teamList(), which falls back to the seed if the
   live read failed. A missing new hire resolves to null, which is the safe
   direction. */
function peopleWithIds(people) {
  const leaders = teamList()
    .filter((m) => m && m.name && m.id != null)
    .map((m) => ({ name: m.name, hrId: m.id }));
  return (people || [])
    .map((p) => String((p && p.name) || '').trim())
    .filter(Boolean)
    .map((name) => ({ name, id: resolveLeaderId(name, leaders) }));
}

/* ============ FOH / BOH SPLIT — PER BLOCK, NOT PER PERSON ============
   HotSchedules codes a job PER TIME BLOCK. Jose Arias Cortez runs
   "Boards 1 Sandwiches 6-11 / Drive Thru 11-2 / Drive Thru 2-5" — one
   person, kitchen in the morning, front counter the rest of the day.

   The old routing decided FOH-or-BOH ONCE for the whole person, off
   p.section — which parseImportText sets from their EARLIEST job. So Jose
   went entirely to the BOH board on the strength of a 6AM sandwich block,
   and his six Drive Thru hours never reached the FOH engine at all. The FOH
   board then read as short-staffed (OT 1 mid blank) while the BOH engine's
   fallback pass parked him on a kitchen station he wasn't coded for.

   Now each person is split by BLOCK: their BOH blocks go to the BOH board,
   their FOH blocks to the FOH board, each side carrying only the hours it
   owns. Someone entirely on one side is unchanged — build() returns null for
   the empty side and only one copy is pushed. Blocks with no job code stay
   FOH, matching the old `p.section ? 'boh' : 'foh'` default. */
const IS_BOH_JOB_RE = /bread|load|filter|thaw|fry|fries|hash|machine|\bprep\b|truck|receiv|dish|sanit|biscuit|egg|nugget|strip|soup|\bmac\b|board|sandwich|kitchen|\bboh\b|grill|point|special|primary|secondary/i;
const blockIsBoh = (b) => !!(b.section || IS_BOH_JOB_RE.test(b.job || ''));

function splitPersonByHouse(p) {
  const blocks =
    p.blocks && p.blocks.length
      ? p.blocks
      : (p.ranges || []).map((r) => ({ start: r.start, end: r.end, job: p.job, skill: p.skill, section: p.section }));
  const build = (bl) => {
    if (!bl.length) return null;
    const ranges = bl.map((b) => ({ start: b.start, end: b.end })).sort((a, b) => a.start - b.start);
    const primary = bl.find((b) => b.job) || bl[0];
    return {
      ...p,
      ranges,
      blocks: bl.slice().sort((a, b) => a.start - b.start),
      hours: rangesHours(ranges),
      job: primary.job || '',
      section: primary.section || null,
    };
  };
  return { foh: build(blocks.filter((b) => !blockIsBoh(b))), boh: build(blocks.filter(blockIsBoh)) };
}

// Special-occasion / overflow people the engine couldn't seat on a station
// are surfaced under the board in the "Additional — added today" section
// (its subtitle already reads "Picked-up / special-occasion adds") rather
// than being dropped. Each becomes a name-labeled card with empty cells.
/* ★ WHO IS EXTRA AND WHO IS MISSING, AT A GLANCE.
   Matt, Jul 30 2026: "one thing the setup did before that i liked but cant see
   now is if there was a extra or missing person it told me. it made scanning
   the setup much easier."

   The board already surfaces both facts, but only as detail — unplaced people
   land in the Additional section, uncovered windows land in the gaps banner.
   Neither answers the question he actually asks every morning, which is "does
   this board match who is working today, yes or no".

   MISSING = on the day's roster and nowhere on the board. Somebody is on the
             clock with no station, which is the expensive one: you pay them and
             the station they should be on reads covered.
   EXTRA   = on the board and not on the roster. Usually a name left behind by
             an earlier import or a hand edit after somebody dropped a shift —
             so the board claims coverage from a person who is not coming in.

   ⚠️ NAMES ARE COMPARED THROUGH normName, THE SHARED LEAF. Cells carry
   annotations — "Tyler @8:30", "Maria →Hanna 6", a tick mark, "(9-2)" hours —
   and the roster carries "Name — Role (hours)". Writing a second matcher here
   is how the food safety rota broke for days. One definition, in nameMatch.js.
   ⚠️ HANDOFF CELLS NAME TWO PEOPLE. "Maria →Hanna 6" means Maria then Hanna;
   counting only the first would report Hanna missing while she is on the board.
   ⚠️ IT SAYS NOTHING WHEN BOTH LISTS AGREE. A banner reading "0 extra, 0
   missing" every day is a banner nobody reads on the day it finally says 1. */
/* EVERY PERSON NAMED IN ONE CELL. Extracted from boardNames so the
   by-position view reads a cell exactly the way the roster check does. This
   parsing has been wrong twice — once on handoffs, once on the ❌ glyph — and
   a second copy is how it goes wrong a third time. */
function cellPeople(rawCell) {
  const raw = stripCheck(rawCell);
  if (!raw) return [];
  const out = [];
  String(raw).split(CELL_SPLIT_RE).forEach((part) => {
    /* ⚠️ USES cellPersonName, THE FILE'S OWN EXTRACTOR, RATHER THAN A SECOND
       COPY. This line used to strip a trailing single number but not an hour
       RANGE, so "Chloe Jackson 5:45-2" came back whole and the roster check
       reported a person by that name as an extra on the board. cellPersonName
       already handled it correctly for the avatar lookup — the two had simply
       drifted, which is exactly what one definition prevents. */
    const nm = cellPersonName(part);
    /* ⚠️ MUST CONTAIN A LETTER. stripCheck only removes ✔, so a cell marked
       with ❌ handed back the bare glyph and it was reported to leaders as a
       person on the board who was not scheduled. Anything with no letters in
       it is a mark, not a team member.

       ⚠️ AND MUST BE CAPITALISED, WHICH IS WHAT A NAME LOOKS LIKE HERE.
       🐛 Found Aug 3 2026 when the by-position view drew an avatar for a
       person called "split duties". BOHAutoAssign writes that phrase into a
       cell to mean "whoever is already there covers it" (see boardOwner.js),
       and this function has been handing it to the roster check as a team
       member on the board the whole time — silently inflating the extra-people
       count on a banner leaders are meant to trust. Every real name the board
       carries comes from the roster and is capitalised; instruction text like
       this is not. "·" is split on for the same reason: the BOH fry cell reads
       "✔️Name · split duties", which was being read as one long name. */
    if (nm && /[a-z]/i.test(nm) && /(^|\s)[A-Z]/.test(nm)) out.push(nm);
  });
  return out;
}

function boardNames(stations) {
  const out = [];
  (stations || []).forEach((st) => {
    SHIFT_KEYS.forEach((k) => { out.push(...cellPeople(st && st[k])); });
  });
  return out;
}

function rosterNames(roster) {
  return (roster || [])
    .map((r) => {
      const head = String(r || "").split(/—|–| - /)[0];
      return { raw: String(r || "").trim(), name: splitRoleHours(head).name.trim() };
    })
    .filter((x) => x.name);
}

/* ★ THE ROSTER'S OWN NAME/HOURS SPLIT, and it deliberately does NOT reuse
   cellPersonName (Matt/Daisy, Aug 5 2026: "the team is scrolling too much").
   cellPersonName strips ONE trailing range, which is right for a board CELL
   because a cell carries at most one. A ROSTER line carries two:

       "Thania Garcia 5:15-11, 11-2"

   Fed through cellPersonName that comes back as "Thania Garcia 5:15-11," —
   which matches nobody, so every split-shift person would be told they are not
   on the board today. The rule here is POSITIONAL rather than trailing: the
   name ends where the FIRST clock begins, so it holds for however many ranges
   follow. `\s\d` is what keeps it off a hyphenated surname like
   "Monica Garcia-parra", where the hyphen is not preceded by whitespace+digit.
   Also handles the older "Name — Role (hours)" shape by falling through to
   splitRoleHours. */
const ROSTER_HOURS_RE = /\s\d{1,2}(?::\d{2})?\s*-/;
function rosterPersonName(entry) {
  const head = String(entry || "").split(/—|–| - /)[0];
  const rh = splitRoleHours(stripCheck(head));
  const clean = rh.name.trim();
  const m = clean.match(ROSTER_HOURS_RE);
  if (!m) return { name: clean, hours: rh.hours || "" };
  return { name: clean.slice(0, m.index).trim(), hours: clean.slice(m.index).trim() };
}

/* ★ ONE PERSON'S DAY, off one side's board. Powers the "You today" card.

   ⚠️ THE ROSTER MATCH IS EXACT, NOT sameLeader. This is the whole safety of
   the feature. sameLeader answers TRUE for "Lizbeth Gonzalez" vs "Lizbeth
   Gonzalez Ramos", and Matt confirmed on Aug 5 2026 that those are two real and
   different people who were BOTH on the Aug 3 board, on opposite sides. A card
   that tells somebody their station has to be right or it is worse than the
   scrolling it replaces, so the roster step compares whole normalised names and
   nothing looser.

   ⚠️ CELLS CARRY FIRST NAMES ONLY — "Samantha", "Pablo", "Karla". On Monday
   Aug 3 alone the roster held two Adrianas, two Benjamins and two Monicas. So a
   first-name cell is claimed ONLY when that first name belongs to exactly one
   person on that side that day. When it is shared, `sharedWith` comes back
   populated and the card says it cannot tell rather than guessing a station.
   A cell carrying the FULL name is unambiguous and is always claimed, which is
   why `certain` is tracked per spot.

   Returns null when the viewer is not on this side's roster at all — the caller
   uses that to tell FOH-only from BOH-only from working both. */
/* ⚠️ THE TWO SIDES DO NOT STORE STATIONS THE SAME WAY. FOH keeps a flat
   `stations` array; BOH groups them under `sections: [{name, stations}]`.
   Reading only `stations` finds the BOH roster but zero assignments, so every
   BOH person would be told "on the roster with no station yet" while standing
   in front of their station. Both shapes, one reader, and an unknown shape
   yields an empty list rather than throwing. */
function allStationsOf(dayData) {
  if (!dayData) return [];
  const out = [];
  if (Array.isArray(dayData.stations)) out.push(...dayData.stations);
  if (Array.isArray(dayData.sections)) {
    dayData.sections.forEach((sec) => {
      if (sec && Array.isArray(sec.stations)) out.push(...sec.stations);
    });
  }
  return out.filter(Boolean);
}

/* First name plus last initial, which is the key the BOARD ITSELF uses to tell
   two people apart. BOH writes "Adriana C" and "Adriana A", "Benjamin U" and
   "Benjamin S", precisely because both pairs are on one roster. Reading only
   the bare first name would throw that away and refuse to answer for the four
   people the board went to the trouble of disambiguating. */
const firstKey = (fullName) => normName(nameParts(fullName)[0] || "");
function initialKey(fullName) {
  const p = nameParts(fullName);
  if (!p.length) return "";
  const second = p[1] ? normName(String(p[1]).charAt(0)) : "";
  return second ? `${normName(p[0])}|${second}` : "";
}

function myDayOnBoard(dayData, viewerName) {
  const want = normName(viewerName);
  if (!want) return null;
  const people = (dayData && Array.isArray(dayData.roster) ? dayData.roster : [])
    .map(rosterPersonName)
    .filter((p) => p.name);
  const me = people.find((p) => normName(p.name) === want);
  if (!me) return null;

  const myFirst = firstKey(me.name);
  const myInitial = initialKey(me.name);
  /* Ambiguity is PER SIDE, which is what makes most of it disappear. Both
     Lizbeths were on the Aug 3 board, but one on each side, so within a side
     "Lizbeth" is a clean answer for each of them. */
  const sharedWith = people
    .filter((p) => normName(p.name) !== want && firstKey(p.name) === myFirst)
    .map((p) => p.name);
  // Does first+initial still land on exactly one person on this side?
  const initialUnique = !!myInitial &&
    people.filter((p) => initialKey(p.name) === myInitial).length === 1;

  const matches = (cellName) => {
    const nn = normName(cellName);
    if (nn === want) return true;                       // full name in the cell
    const parts = nameParts(cellName);
    if (parts.length >= 2 && String(parts[1]).replace(/\W/g, "").length === 1) {
      // "Adriana C" — the board's own disambiguator.
      return initialUnique && initialKey(cellName) === myInitial;
    }
    // Bare first name: only when nobody else on this side answers to it.
    return nn === myFirst && !sharedWith.length;
  };

  const spots = [];
  allStationsOf(dayData).forEach((st) => {
    SHIFT_KEYS.forEach((k) => {
      /* cellPeople and cellHours, not a third reader of a cell. They are
         index-aligned by contract and that contract has been broken twice. */
      const names = cellPeople(st[k]);
      if (!names.length) return;
      const times = cellHours(st[k]);
      names.forEach((n, i) => {
        if (!matches(n)) return;
        const rh = splitRoleHours(st.role || "");
        spots.push({
          shift: k,
          station: rh.name || String(st.role || "").trim(),
          stationHours: rh.hours || "",
          duty: String(st.duty || "").trim(),
          time: times[i] || "",
        });
      });
    });
  });
  spots.sort((a, b) => SHIFT_KEYS.indexOf(a.shift) - SHIFT_KEYS.indexOf(b.shift));
  /* ⚠️ THE BOARD REALLY DOES REPEAT A ROW. BOH Aug 3 carries TWO identical
     "Assistant Director" rows, both naming Adriana C at breakfast, so she was
     shown the same line twice on a card whose entire job is to be short enough
     not to scroll. Deduped on what a reader can actually see — shift, station
     and time — so two genuinely different rows still both show. */
  const seen = new Set();
  const unique = spots.filter((s) => {
    const k = `${s.shift}|${normName(s.station)}|${s.time}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  /* Only report an unresolvable name when it actually cost them something. If
     the board used "Adriana C" everywhere, she has her stations and does not
     need to be told her first name is shared. */
  const blocked = sharedWith.length > 0 && unique.length === 0;
  return { name: me.name, hours: me.hours, sharedWith, blocked, spots: unique };
}

/* Everyone the Hub has ever heard of. A fragment sitting in a board cell is a
   PERSON only if it matches somebody here; otherwise it is a note a leader typed
   into the cell, and notes are not team members.
   ⚠️ THIS IS WHY THE CHECK CRIED WOLF. On Jul 30 2026 it told Matt three people
   were on the board unscheduled: "❌", "Kimberly", and "split duties". Two of
   those were never people, and the third left in March 2024. A daily warning
   that is mostly wrong is one leaders learn to scroll past, which costs more
   than the check was ever worth. */
function knownPeople() {
  const list = teamList();
  /* `archived` is gone — see the note on setupHeadcount. The board no longer
     carries a list of who has left; it asks. */
  return { current: list.map((m) => m && m.name).filter(Boolean) };
}

/* ⚠️ `staleFromArchive` IS PASSED IN, NOT LOOKED UP HERE (Aug 7 2026). This
   used to read a 517-name list of former employees that shipped inside the
   browser bundle. The names now come from /api/stale-check, which is told what
   is on today's board and answers which of THOSE have left — so the archive
   never reaches a phone. See the route in worker.js for why it can only ever
   return names the caller already sent.
   ⚠️ DEFAULTS TO EMPTY, WHICH MEANS "NO STALE NAMES". Matt's ruling when the
   check cannot run: "skip the warning silently". A leader at 5am needs the
   board more than the hint, so a dropped request costs a warning, never the
   screen. */
export function setupHeadcount(data, departed, staleFromArchive = []) {
  const roster = rosterNames(data && data.roster);
  if (!roster.length) return null;            // nothing imported — nothing to compare
  const board = boardNames(data && data.stations);
  const known = knownPeople();
  /* ⚠️ MATCHED WITH sameLeader, NOT STRING EQUALITY. The board writes first
     names ("Tyler"), the roster writes full names ("Tyler Byrd — Team Leader").
     Plain comparison reports every single person as both missing AND extra,
     which is how this first failed its own tests. sameLeader is the one place
     that knows first-name / first-plus-initial / full-name are the same person.
     ⚠️ IT DOES **NOT** REFUSE TO GUESS WHEN TWO PEOPLE SHARE A FIRST NAME, and
     the sentence that used to sit here saying it did was false. `sameLeader` is
     deliberately permissive — a bare "Adriana" matches BOTH Adrianas, by design,
     because the board writes short forms and much of this roster carries two
     surnames. nameMatch.js says so in its own header. An assertion of safety
     that nobody re-checked is exactly how the two-Lizbeth bug survived three
     files, so it is written down plainly here instead.
     ⚠️ WHAT THAT COSTS, STILL OPEN: `missing` below can be silently covered by
     a namesake's cell — both Adrianas scheduled, one bare cell, and the one who
     is genuinely absent from the board is not reported. Closing that needs the
     roster-aware matcher (`uniqueLeader` in nameMatch.js), which is its own
     task. The `gone` list further down is the half that actively HARMS, and it
     is guarded below. */
  const missing = roster.filter((p) => !board.some((b) => sameLeader(p.name, b))).map((p) => p.raw);
  /* On the board but not on today's roster. Split three ways rather than one:
       · matches a CURRENT team member  → genuinely unscheduled, report it
       · matches somebody in the TERMINATED archive → a stale name, and saying
         "not scheduled" about someone who left two years ago sends the leader
         looking for a person who no longer exists. Reported as gone instead.
       · matches nobody at all → a note or a mark. Dropped, silently and on
         purpose. The cost is that a brand new hire not yet in HR is not
         flagged; the `missing` list above still catches the failure that
         actually hurts, which is a scheduled person absent from the board. */
  const offRoster = board.filter((b) => !roster.some((p) => sameLeader(p.name, b)));
  const extra = [...new Set(
    offRoster.filter((b) => known.current.some((n) => sameLeader(n, b)))
  )];
  /* The worker was asked about the whole board; narrow its answer with the
     same two filters that ran here before. */
  const stale = Array.isArray(staleFromArchive) ? staleFromArchive : [];
  const staleNames = [...new Set(
    offRoster
      .filter((b) => !known.current.some((n) => sameLeader(n, b)))
      .map((b) => stale.find((n) => sameLeader(n, b)))
      .filter(Boolean)
  )];
  /* Anyone HR says has left who is still named anywhere on this day — the board,
     the roster or the trainer list. This is the check that stops the board going
     stale, and it is the only one of the three that HR can answer. */
  /* ⚠️ MATCHED WITH sameLeader AND REPORTED BY THE HR NAME, and both halves of
     that were bugs on the first attempt.
     · Key-set matching flagged the wrong person: Tyler Byrd's keys include the
       bare "tyler", so Tyler Smith would have been reported as no longer
       employed. Telling a leader that a person on shift has left is worse than
       the stale name this exists to catch. sameLeader requires the last
       initials to agree when both sides carry one.
     · Reporting the spelling FOUND listed the same person twice — "Tyler" from
       the board and "Tyler Byrd" from the roster. It now reports the HR name,
       once, which is also the name to go and remove. */
  const gone = [];
  const candidates = [
    ...board,
    ...roster.map((p) => p.name),
    ...((data && data.trainers) || []),
  ].map((c) => String(c || '').trim()).filter(Boolean);
  /* ⚠️ THE SAME GUARD THE ARCHIVE PATH ABOVE ALREADY HAS, AND THIS ONE WAS
     MISSING IT.
     🐛 A terminated person matches a board cell that belongs to somebody who
     still works here. `sameLeader("Adriana Arias Hurtado", "Adriana")` is TRUE,
     so on a board whose only Adriana is the still-employed Assistant Director,
     the headcount card told a leader "No longer employed per HR: Adriana Arias
     Hurtado — remove from the trainer list." That invites deleting a LIVE
     assignment, which is worse than the stale name this check exists to catch —
     the file already says so in the Tyler note above. Every one of the seven
     shared first names on this roster becomes a false positive the day one of
     the pair is terminated.
     ⇒ Report only when at least one place the name matched CANNOT be explained
     by somebody who still works here. `every` rather than checking the first
     hit: a board carrying both "Adriana" and "Adriana Arias Hurtado" must still
     report the real one, and taking the first match would hide it. The cost is
     a false negative when a departed person is only ever written in a form a
     current employee could also claim, and that is the correct trade. */
  /* ⚠️ `known.current` IS NOT "PEOPLE WHO STILL WORK HERE". It is every name in
     teamList(), and `departedNames` builds its list BY FILTERING THAT SAME LIST
     for status 'terminated' — so a terminated person is in both. Guarding on
     known.current directly would let every departed person match their OWN name
     and silence this check completely, which is worse than the bug it fixes.
     Exact string match, not sameLeader: both sides are the same teamList()
     strings, so there is nothing to interpret and nothing to get wrong. */
  const departedExact = new Set(
    (departed || []).map((n) => String(n || '').trim()).filter(Boolean)
  );
  const stillHere = known.current.filter((n) => !departedExact.has(String(n || '').trim()));
  (departed || []).forEach((hrName) => {
    const hits = candidates.filter((c) => sameLeader(hrName, c));
    if (!hits.length) return;
    if (hits.every((c) => stillHere.some((n) => sameLeader(n, c)))) return;
    gone.push(hrName);
  });
  /* Archive matches join the same list. Deduped against what HR already
     reported, so somebody terminated recently enough to be in BOTH the live HR
     status and the archive is named once, not twice. */
  staleNames.forEach((n) => {
    if (!gone.some((g) => sameLeader(g, n))) gone.push(n);
  });
  return { missing, extra, gone };
}


function extrasFromUnplaced(unplaced, people) {
  const byName = {};
  (people || []).forEach((p) => { byName[(p.name || '').toLowerCase()] = p; });
  return (unplaced || []).map((nm) => {
    const p = byName[(nm || '').toLowerCase()];
    return {
      role: p ? rosterEntryString(p) : nm,
      breakfast: '', lunch: '', mid: '', night: '',
      duty: 'Extra — not on a station',
    };
  });
}

// Which board columns a shift touches: breakfast (pre-11), lunch (11–2),
// mid (2–5), night (5–close).
function periodsCovered(ranges) {
  const set = new Set();
  (ranges || []).forEach(({ start, end }) => {
    if (start < 11) set.add('breakfast');
    if (start < 14 && end > 11) set.add('lunch');
    if (start < 17 && end > 14) set.add('mid');
    if (end > 17) set.add('night');
  });
  return set;
}

/* ============ BREAK POLICY ============
   6+ hrs → 1 break · 12+ hrs → 2 breaks ·
   Minors (under 16) working 5+ hrs → one 30-minute break, required. */
function requiredBreaks(hours, isMinor) {
  if (hours >= 12) return 2;
  if (hours >= 6) return 1;
  if (isMinor && hours >= 5) return 1;
  return 0;
}

/* ============ HOTSCHEDULES IMPORT PARSING ============
   Handles BOTH paste shapes:
   • Single-line rows:  "Garcia, Maria 5:00a-2:00p Breader"  /
     "Tyler Byrd   5:00a - 8:30a   3.5 Hrs   Truck"
   • The iPad table-copy of the Roster Report, which lands one CELL per
     line:  Name ⏎ 5:00a - 8:30a ⏎ 3.5 Hrs ⏎ Truck ⏎ next name…
   Gross-hours cells ("3.5 Hrs") and report headers are skipped. */
const HS_HEADER_RE = /^(assigned|shift|gross hours|job|shift notes|total day|schedules|display options|group by day part|roster report.*|hotschedules.*|powered by fourth|\d+ of \d+ selected|[a-z]{3,9},? \d{1,2}\/\d{1,2}\/\d{2,4}|[a-z]{3,9} \d{1,2}, \d{4})$/i;
const HS_HOURS_RE = /^\d+(\.\d+)?\s*hrs?\.?$/i;

function hsCleanName(raw) {
  let n = (raw || '').replace(/[…]+$/, '').replace(/\.{2,}$/, '').replace(/[\s,•|·–-]+$/, '').trim();
  if (n.includes(',')) {
    const [last, first] = n.split(',').map((s) => s.trim());
    if (first) n = `${first} ${last}`;
  }
  return n.split(/\s+/).map(titleCaseWord).join(' ');
}
function hsStripHours(tail) {
  return (tail || '')
    .replace(/^[\s,|•·:–-]+/, '')
    .replace(/^\d+(\.\d+)?\s*hrs?\.?\b/i, '')
    .replace(/^[\s,|•·:–-]+/, '')
    .trim();
}

// Locate every range's [startIdx, endIdx] in a line using BOTH patterns,
// so name/job boundaries work for dash ranges and the "5:00 PM 8:00 PM"
// two-clock form alike.
function rangeSpans(line) {
  const spans = [];
  [TIME_RANGE_TWOCLOCK, TIME_RANGE_DASH].forEach((RE) => {
    const re = new RegExp(RE.source, 'gi');
    let m;
    while ((m = re.exec(line))) {
      // skip if this span overlaps one already found (two-clock wins)
      if (spans.some(([a, b]) => m.index < b && m.index + m[0].length > a)) continue;
      spans.push([m.index, m.index + m[0].length]);
    }
  });
  return spans.sort((a, b) => a[0] - b[0]);
}

// The HotSchedules roster report puts a station and a skill level between
// the name and the times: "Perla Cortes Garcia [ Perla ] Drive Thru
// Beginner  5:00 PM 8:00 PM". This pulls the job/station and strips the
// skill word + [nickname] bracket so what's left is just the person's name.
const HS_SKILL_RE = /\b(beginner|intermediate|advanced|trainer|expert|novice)\b/gi;
const HS_STATIONS = [
  'Boards 2 Nuggets Strips Soup', 'Boards 1 Sandwiches', 'Drive Thru',
  'Machines', 'Breader', 'Loader', 'Filter', 'Thaw', 'Fries', 'Prep',
  'Leadership', 'Dishes', 'Dish', 'Truck', 'Receiving', 'Biscuits', 'Nuggets',
  'Strips', 'Soup', 'Grilled', 'Buns', 'Point', 'Specials', 'Primary',
  'Secondary', 'Window', 'Expo', 'Register', 'Hospitality', 'Cleanliness',
];
// Splits the pre-time text into { name, job, skill }. Removes the
// [nickname] bracket, captures the skill-level word (Beginner/Intermediate/
// Advanced) for skill-based station placement, then pulls out the station
// name; what's left is the person's name.
function hsSplitNameStation(pre) {
  let s = (pre || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  // Capture skill before stripping it.
  const skillMatch = s.match(HS_SKILL_RE);
  const skill = skillMatch ? skillMatch[0].toLowerCase() : '';
  s = s.replace(HS_SKILL_RE, ' ').replace(/\s+/g, ' ').trim();
  let job = '';
  for (const st of HS_STATIONS) {
    const re = new RegExp(`\\b${st.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (re.test(s)) {
      const idx = s.search(re);
      job = s.slice(idx).trim();
      s = s.slice(0, idx).trim();
      break;
    }
  }
  return { name: s, job, skill };
}

function parseImportText(text) {
  const lines = (text || '')
    .split(/\n+/)
    .map((l) => l.replace(/\t/g, '  ').trim())
    .filter((l) => l && !HS_HEADER_RE.test(l));

  const rows = [];
  let pending = null; // vertical-format person being assembled
  const flush = () => {
    if (pending && pending.name && pending.ranges.length) rows.push(pending);
    pending = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ranges = parseRanges(line);

    if (ranges.length) {
      // Where does the first range start / last range end? (both patterns)
      const spans = rangeSpans(line);
      const firstIdx = spans.length ? spans[0][0] : line.length;
      const lastEnd = spans.length ? spans[spans.length - 1][1] : 0;
      const pre = line.slice(0, firstIdx).replace(/[\s,•|·–-]+$/, '').trim();
      let tail = hsStripHours(line.slice(lastEnd));

      // Figure out name + job + skill. Two layouts:
      //  A) job/station BEFORE the times ("Name [nick] Drive Thru Beginner
      //     5:00 PM 8:00 PM") — tail is empty, station is in `pre`.
      //  B) job AFTER the times ("Garcia, Maria 5:00a-2:00p Breader").
      let namePart = pre;
      let skill = '';
      if (!tail) {
        const split = hsSplitNameStation(pre);
        namePart = split.name;
        tail = split.job;
        skill = split.skill;
      } else {
        // Layout B: skill, if present, sits in the pre or tail text.
        const sm = (pre + ' ' + tail).match(HS_SKILL_RE);
        if (sm) skill = sm[0].toLowerCase();
        // Strip a trailing skill word off the name if it leaked in.
        namePart = pre.replace(HS_SKILL_RE, ' ').replace(/\s+/g, ' ').trim();
        tail = tail.replace(HS_SKILL_RE, ' ').replace(/\s+/g, ' ').trim();
      }

      if (namePart && /[a-z]/i.test(namePart)) {
        // Complete single-line row
        flush();
        rows.push({ name: hsCleanName(namePart), ranges: [...ranges], job: tail, skill });
      } else if (pending) {
        // Vertical format: a time cell under a name cell
        pending.ranges.push(...ranges);
        if (tail && !pending.job) pending.job = tail;
        if (skill && !pending.skill) pending.skill = skill;
      }
      continue;
    }

    if (HS_HOURS_RE.test(line)) continue; // gross-hours cell
    if (!/[a-z]/i.test(line)) continue;   // stray numbers/symbols

    // Pure text cell: either the pending person's JOB, or the NEXT NAME.
    // If the following line is a time range, this text is a name.
    const nextIsRange = i + 1 < lines.length && parseRanges(lines[i + 1]).length > 0;
    if (pending && pending.ranges.length && !pending.job && !nextIsRange) {
      // Might be "Boards 1 Sandwiches" or "Boards 1 Sandwiches Advanced".
      const sm = line.match(HS_SKILL_RE);
      if (sm && !pending.skill) pending.skill = sm[0].toLowerCase();
      pending.job = line.replace(HS_SKILL_RE, ' ').replace(/\s+/g, ' ').trim();
      flush();
    } else {
      flush();
      pending = { name: hsCleanName(line), ranges: [], job: '', skill: '' };
    }
  }
  flush();

  // Merge split shifts that arrive as separate rows for the same person.
  //
  // HotSchedules assigns a JOB PER TIME BLOCK — one person's day reads
  // "Fries 9-11a / Machines 11a-2p / Prep 2p-5p", arriving as three rows.
  // Merging must therefore PRESERVE each block's own job, not just the first
  // one: `blocks` is what the auto-assign engines place from. `job`/`section`
  // remain the person's first scheduled job, for the roster and preview.
  const byName = {};
  rows.forEach((r0) => {
    const job = (r0.job || '').trim();
    const skill = r0.skill || '';
    const section = mapJobToSection(job);
    const blocks = (r0.ranges || []).map((r) => ({
      start: r.start, end: r.end, job, skill, section,
    }));
    const k = r0.name.toLowerCase();
    if (byName[k]) {
      byName[k].ranges.push(...r0.ranges);
      byName[k].blocks.push(...blocks);
      if (!byName[k].skill && skill) byName[k].skill = skill;
    } else {
      byName[k] = { name: r0.name, ranges: [...r0.ranges], blocks, skill, job, section };
    }
  });

  return Object.values(byName).map((p) => {
    p.ranges.sort((a, b) => a.start - b.start);
    p.blocks.sort((a, b) => a.start - b.start);
    p.hours = rangesHours(p.ranges);
    // Primary job = the job of the earliest block that has one.
    const primary = p.blocks.find((b) => b.job);
    if (primary) {
      p.job = primary.job;
      p.section = primary.section;
    }
    if (!p.skill) {
      const s = p.blocks.find((b) => b.skill);
      if (s) p.skill = s.skill;
    }
    return p;
  });
}

/* ============ THE HUB SCHEDULE, AS IMPORT ROWS ============
   Turns a week saved by the Schedule tile into exactly what `parseImportText`
   produces, so a published week goes down the SAME path a HotSchedules paste
   does: Preview, Check for changes, Rebuild, the engines, gaps, breaks, undo
   and history all work with no change at all.

   ⚠️⚠️ THE ROWS CARRY JOB CODES, NOT STATIONS, AND THAT IS THE WHOLE POINT.
   The Schedule tile can show a position preview, but the board is authoritative
   on the day: `autoAssignFOH`/`autoAssignBOH` hold the store's locks, the
   leader-per-daypart rule, the trainer spread and the rotation tiebreak. Handing
   them a station would be a second engine quietly overruling the real one. They
   are handed the same thing HotSchedules hands them — who is on, when, and what
   they are certified to do — and they place people themselves.

   ⚠️⚠️ MINUTES BECOME DECIMAL HOURS HERE, AND THIS IS THE ONLY PLACE IT
   HAPPENS. Everything in scheduleEngine.js and availability.js is minutes from
   midnight, to match `stations[...].hours`. Everything on this board and in both
   engines is decimal hours, because that is what `parseRanges` returns. 570
   and 9.5 are the same instant. Getting this backwards would put somebody on at
   half past nine at night instead of half past nine in the morning.

   ⚠️ ONE ROW PER PERSON. A person cannot hold shifts on both sides of one day —
   the engine shares one `takenToday` set across FOH and BOH for exactly that
   reason — but this merges by id anyway rather than trusting it, because two
   rows for one person would place them twice and both boards would look right.
   ★ MODULE LEVEL AND PURE (design rule 7). */
function scheduleRowsFor(sched, dayName) {
  const day = sched && sched.days ? sched.days[dayName] : null;
  if (!day || !day.sides) return [];
  const byId = new Map();
  ['FOH', 'BOH'].forEach((side) => {
    const shifts = (day.sides[side] && day.sides[side].shifts) || [];
    shifts.forEach((s) => {
      if (!s || !s.name) return;
      const start = Number(s.start) / 60;
      const end = Number(s.end) / 60;
      if (!(end > start)) return;          // never emit a zero or backwards shift
      const job = String(s.job || '');
      const skill = String(s.skillWord || '');
      const section = mapJobToSection(job);
      const block = { start, end, job, skill, section };
      const key = String(s.id == null ? s.name.toLowerCase() : s.id);
      const row = byId.get(key);
      if (row) {
        row.ranges.push({ start, end });
        row.blocks.push(block);
        return;
      }
      byId.set(key, {
        name: s.name,
        id: s.id == null ? null : String(s.id),
        ranges: [{ start, end }],
        blocks: [block],
        job, skill, section,
      });
    });
  });
  return [...byId.values()].map((p) => {
    p.ranges.sort((a, b) => a.start - b.start);
    p.blocks.sort((a, b) => a.start - b.start);
    p.hours = p.ranges.reduce((t, r) => t + Math.max(0, r.end - r.start), 0);
    return p;
  });
}

/* ============ EDIT UNLOCK — personal PINs from the HR Console ============
   gcfcr-hr-pins is an object of MEMBER ID → pin (HRConsole.setPinValue).
   Names come from HR_TEAM by id; titles honor the gcfcr-hr-roles overrides.
   Team Leader and up (HR_RANK ≥ 3) may edit. */
function rankOfRole(role) {
  if (HR_RANK && HR_RANK[role] != null) return HR_RANK[role];
  if (!role) return 0;
  if (/owner|operator|executive|human res|\bhr\b|leadership dev|ldd|director/i.test(role)) return 6;
  if (/leader|\blead\b|trainer/i.test(role)) return 3;
  return 1;
}

/* ⚠️ THIS COMPARED PINs IN THE BROWSER AND BROKE THE MOMENT THEY WERE HASHED.
   PINs became salted hashes on Jul 27 and convert person-by-person as each one
   signs in, so `String(pins[id]) === p` silently stopped matching for anyone
   who had used HR Console that day — Monica Garcia-Parra hit it first: HR
   Console worked, the setup gate did not. It would have looked random and
   spread to all 106 as they converted.
   ★ `/api/pin-verify` is now the ONE place a PIN is checked. It also brings the
   rate limit and the terminated filter, which this gate never had.
   ⚠️ The ROLE decision stays here — the endpoint answers "who is this", the
   tile decides "may they edit". Two different questions. */
async function checkEditPin(pin) {
  const p = String(pin || '').trim();
  if (!p) return null;
  if (p === '1234') return { isDefault: true };

  let id = null;
  let tok = null;   // held until the rank gate below passes — see the note there
  try {
    const r = await fetch('/api/pin-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: p }),
    }).then((x) => x.json());
    /* ⚠️ THE TOKEN IS NOT STORED HERE. It is stored at the bottom, and ONLY on
       the branch that actually passes the rank gate.
       🐛 It WAS stored here for about an hour on Aug 2 2026, on `r.ok` alone —
       which means "this PIN belongs to somebody", not "this PIN belongs to
       someone allowed to edit". A Team Member typing their PIN was correctly
       refused, saw "editing needs Team Leader and up", and had nonetheless
       just replaced the device's session with their own. On the shared kitchen
       iPad that is the Director's session gone: /api/hr-store resolves HR
       scope from the token's uid, so HR Console would then render one row or
       none, and its saves would answer ok having written nothing. No 401, no
       banner, nothing on screen to explain it. */
    if (r && r.ok) { id = String(r.id); tok = r.token || null; }
    else if (r && r.error === 'ambiguous') return { dup: true };
    else if (r && r.error === 'locked') return { locked: true, retryAfterMin: r.retryAfterMin || 15 };
    else if (r && r.error === 'no-match') return null;
    /* ★ `who` IS NOT A BROKEN CONNECTION (Aug 9 2026, auth hardening stage 3b).
       Everything unrecognised used to fall into `noStore`, whose message says
       "check your connection" — which would be a flat lie for this one, and the
       kind of lie that sends a leader to the wifi during a rush instead of to
       the fix. This gate cannot name its caller: it has a PIN and nothing else,
       by design. So when the worker starts asking unknown devices to identify
       themselves, this board leans on the device cookie, which is seeded by the
       first successful sign-in on that iPad and never asks again.
       ⚠️ SHIPPED BEFORE THE WORKER CAN SEND IT. That ordering is the whole
       point of stage 3 — a client that cannot read `who` would hard-lock every
       board edit on every shared iPad until it caught up. */
    else if (r && r.error === 'who') return { needName: true };
    else return { noStore: true };
  } catch {
    return { noStore: true };
  }
  if (!id) return null;

  const roles = await readKV(ROLES_KEY);
  const list = teamList();
  const member = list.find((m) => m && String(m.id) === String(id));
  const role = (roles && roles[id]) || (member && member.role) || '';
  const name = member ? member.name : `ID ${id}`;
  if (rankOfRole(role) >= 3) {
    /* ★ KEEP THE TOKEN, BUT ONLY NOW — past the rank gate, so the session this
       device carries always belongs to someone who was actually let in. Before
       this the board's saves went out unauthenticated even for a leader who
       had just proved who they were, which is what put the board's keys in the
       untokened census. */
    if (tok) { try { localStorage.setItem('gcfcr-hub-token', tok); } catch {} }
    return { ok: true, name, role: role || 'Leader' };
  }
  return { tooLow: true, name, role: role || 'Team Member' };
}

/* ============ SHARED UI ============ */
/* `avatars` added Aug 2 2026 (Matt: "I want them next to the name in positions").
   Faces used to appear ONLY in the roster list at the bottom of the board, which
   is not the part anyone reads during setup. The cell is dense — name, hours, an
   edit marker, a trainer colour and the rank pill — so the face is deliberately
   small and sits BEFORE the name, giving the eye one consistent left edge to
   scan down a column rather than a ragged one. */
function ShiftCell({ value, fallbackName, edited, isTrainer, badge, avatars, badgeFor, badgeColor, colorFor, leaderSet = null }) {
  /* Resolved from the name the cell actually renders, the same way the badge is
     — a covered cell carries no name in its value. */
  const leadingOf = (nm) => cellIsTrainer(leaderSet, nm);
  const v = (value || '').trim();
  // A manually-edited cell (a name typed over what the import / auto-assign
  // placed) shows in orange with a dashed underline, so at a glance you can
  // see how much of the board was changed by hand vs. left as auto-assigned.
  const editStyle = edited ? { color: '#C2410C', borderBottom: '1.5px dashed #C2410C', paddingBottom: '0.5px' } : undefined;
  // Trainers render in rose (matches the "Trainers today" pill color) so a
  // leader can spot who's a trainer right on the board. A manual edit wins.
  const nameStyle = editStyle || (isTrainer ? { color: '#9D174D' } : undefined);
  const nameTitle = edited ? 'Manually edited' : (isTrainer ? 'Trainer' : undefined);
  if (v === '❌') {
    // Closed position — greyed cell, just an ✕.
    return (
      <div className="flex items-center justify-center py-0.5">
        <X size={14} strokeWidth={3} className="text-gray-400" />
      </div>
    );
  }
  if (v === '') {
    return <Minus size={12} className="text-gray-200" />;
  }
  if (v.includes('✔')) {
    // A ✔️ with a name shows that name. A bare ✔️ shows the fallback (the
    // leader covering this station) when one is provided — otherwise JUST
    // the check. It never invents a name: previously a bare ✔️ rendered as
    // "Covered" (or borrowed another row's leader), which made unassigned
    // leadership cells look assigned.
    const name = stripCheck(v) || fallbackName || '';
    /* ⚠️ RESOLVE THE BADGE FROM THE NAME ACTUALLY RENDERED. A bare "✔️"
       covered by a leader carries no name in the cell value, so the badge the
       parent computed from that value is empty while the FACE (built from
       fallbackName) shows — the covered leader would appear with a face and no
       title, and covered cells are disproportionately leaders and trainers. */
    const covBadge = badgeFor ? (badgeFor(name) || badge) : badge;
    /* ⚠️ leading-tight MUST MATCH THE PLAIN BRANCH. Without it this wrapper
       fell back to the default line-height, so a COVERED cell sat visibly
       further from its face than a plain one — the "gap in some" Matt saw
       after the first spacing fix. The difference only shows when the two cell
       types sit side by side, which is every board. */
    return (
      <div className="text-emerald-700 leading-tight">
        <span className="flex items-center gap-1" style={{ lineHeight: 1 }}>
          <Check size={13} strokeWidth={3} />
          {name && <span className="text-[11.5px] font-bold truncate" style={nameStyle} title={nameTitle}>{name}</span>}
        </span>
        {name && !edited && <CellMeta entry={name} avatars={avatars} badge={covBadge} badgeColor={(colorFor && colorFor(name)) || badgeColor} leading={leadingOf(name)} />}
      </div>
    );
  }
  /* ★ NAME ON TOP, FACE + TITLE UNDERNEATH (Matt, Aug 2 2026: "let's do name
     on top and pic with title on bottom").
     The name owns the full cell width instead of starting after a picture, so a
     column of names lines up and long ones stop wrapping around an avatar.
     ⚠️ The trainer/edit colouring stays on the NAME, and a manual edit still
     suppresses the meta line, so "someone changed this by hand" remains the
     loudest thing in the cell. */
  return (
    <span className="text-[12.5px] font-semibold text-gray-900 leading-tight block" style={{ wordBreak: 'break-word' }}>
      {/* The start time gets its own quiet chip instead of being glued to the
          name — see cellDisplay. The full raw cell stays in the title so hovering
          still shows exactly what is stored. */}
      {/* ★ EACH PERSON'S REAL SHIFT, INCLUDING BOTH HALVES OF A HANDOFF (Matt,
          Aug 4 2026: "The setup knows everyone's exact times so the station
          cards should reflect that", then "Yes real times including the handoff
          for odd times").
          The board already had every time — the import writes them into the
          cell — and was showing at most a single "@6" glued to the end. On a
          handoff that meant the second person's shift was invisible, which is
          the half a leader most needs: it is the moment somebody has to walk
          over and take the position.
          ⚠️ FALLS BACK TO THE PLAIN CELL when the names cannot be split
          confidently. cellPeople is the same splitter the by-position view
          uses, and if it does not recognise the shape, printing the cell as
          typed is right — a board that drops a name to show a time would be
          worse than one that shows no time. */}
      <span className="block" style={{ ...nameStyle }} title={nameTitle}>
        {(() => {
          const names = cellPeople(v);
          const hours = cellHours(v);
          if (names.length && hours.some(Boolean)) {
            return names.map((nm, i) => (
              <span key={`${nm}-${i}`}>
                {i > 0 && <span className="text-gray-400"> → </span>}
                {nm}
                {hours[i] && (
                  <span className="ml-1 text-[10.5px] font-bold text-gray-400 align-middle">{hours[i]}</span>
                )}
              </span>
            ));
          }
          const d = cellDisplay(v);
          return (
            <>
              {d.text}
              {d.at && <span className="ml-1 text-[10.5px] font-bold text-gray-400 align-middle">@{d.at}</span>}
            </>
          );
        })()}
      </span>
      {!edited && <CellMeta entry={v} avatars={avatars} badge={badge} badgeColor={badgeColor} leading={leadingOf(v)} />}
    </span>
  );
}

/* The quiet second line of a cell: the face, then the abbreviated title.
   ⚠️ ONE COMPONENT FOR BOTH BRANCHES. The plain-name and covered-cell paths
   drifted the moment they were written separately — the covered one shipped
   with a face and no badge. `flush` drops BoardFace's inline right margin so
   the flex gap is the ONLY spacing here; with both, the face sat a ragged
   distance from the name and the gap looked different cell to cell. */
/* ⚠️ THE LEADING PILL IS FILLED, THE TITLE PILL IS TINTED, and the difference
   is the information. A title says what somebody IS all week; leading says what
   they are doing RIGHT NOW, in this daypart, on this board. Two pills in the
   same weight would read as two labels of the same kind and the one that
   changes hourly would stop being noticed. */
const LEADING_COLOR = '#B45309';

function CellMeta({ entry, avatars, badge, badgeColor = '#6B7280', leading = false }) {
  if (!badge && !avatars && !leading) return null;
  return (
    <span className="flex items-center gap-1" style={{ marginTop: 1, lineHeight: 1 }}>
      <BoardFace entry={entry} avatars={avatars} size={13} flush />
      {leading && (
        <span title="Leading this shift"
          style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.04em',
                   color: '#fff', background: LEADING_COLOR,
                   borderRadius: 20, padding: '1px 5px', whiteSpace: 'nowrap' }}>
          LEADING
        </span>
      )}
      {badge && (
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.04em',
                       color: badgeColor, background: badgeColor + '18',
                       borderRadius: 20, padding: '1px 5px', whiteSpace: 'nowrap' }}>
          {badge}
        </span>
      )}
    </span>
  );
}

/* ============ BOARD TYPE + SECTION BAND (presentation only) ============
   Display face for station names / section labels and a mono face for posted
   hours. Loaded once at module scope so no Hub-global font change is needed. */
if (typeof document !== 'undefined' && !document.getElementById('ds-fonts')) {
  const l = document.createElement('link');
  l.id = 'ds-fonts';
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@500;600&display=swap';
  document.head.appendChild(l);
}
const DISPLAY_FONT = "'Barlow Semi Condensed', Inter, system-ui, sans-serif";
const MONO_FONT = "'IBM Plex Mono', ui-monospace, monospace";

// Station cards flow into as many columns as the screen allows instead of a
// fixed 1-or-2. On the iPad this is the single biggest readability win; it
// collapses to one column on phone on its own, no media query needed.
const CARD_GRID = { display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' };

// Section header: label + rule + station count. Replaces the small dot+text.
/* ★ WHICH SHIFT IS RUNNING RIGHT NOW.
   The board's SHIFT_KEYS and dayparts.js's DAYPART_KEYS are the same four keys
   in the same order, so this needs no mapping table — and if that ever stops
   being true, the lookup below returns null rather than guessing a shift.
   `night` carries no end on purpose (see dayparts.js), so anything from its
   start onward is night. */
/* ★ AN EMPTY DAY LOOKS EXACTLY LIKE A REAL ONE (Matt, Aug 5 2026: he found
   Thursday, Friday and Saturday had never been imported, after the board had
   been showing them all week).

   The station rows come from the TEMPLATE, so a day nobody has imported still
   renders 24 named stations with every cell blank. On a phone that reads as a
   quiet day, not a missing one — and the You today card compounds it by telling
   every single person they are not on the board, which is technically true and
   completely unhelpful.

   ⚠️ THE TEST IS THE ROSTER, NOT THE CELLS. A genuinely imported day always has
   a roster; a template day never does. Testing "are the cells empty" would call
   a real but lightly-staffed day unimported, which would be worse than saying
   nothing. */
function dayNotImported(dayData) {
  if (!dayData) return false;                       // still loading — say nothing
  const roster = Array.isArray(dayData.roster) ? dayData.roster : [];
  return roster.length === 0;
}

function currentShiftKey(now = new Date()) {
  const h = now.getHours() + now.getMinutes() / 60;
  let found = null;
  for (const d of DAYPARTS) {
    if (h >= d.start && (d.end == null || h < d.end)) { found = d.key; break; }
  }
  return found && SHIFT_KEYS.includes(found) ? found : null;
}

/* ★ THE COMPACT BOARD (Daisy via Matt, Aug 5 2026: "the leaders want a more
   condensed view for the whole day and shift too").

   One line per station instead of a 320px card, so a 25-station FOH day reads
   in roughly a quarter of the height. PrintSheet has rendered exactly this
   table for months; it was simply only ever visible on paper.

   ⚠️ IT SHARES THE GROUPING, NOT THE STYLING. groupFOHStations and BOH's own
   `sections` stay the single source of how a board is divided — that is the
   part that must never fork, because the two sides store stations differently
   and a second copy would get one of them wrong. The look is deliberately NOT
   shared with PrintSheet: 10px type and hairline #999 borders are right for
   paper and wrong for a thumb on a shared iPad mid-rush.

   ⚠️ READ-ONLY, like By position and for the same reason already written into
   this file: typing lives on the grid alone, or two surfaces start disagreeing
   about what a cell says.

   `shift` of "all" shows four columns; any single shift shows one AND drops
   stations with nobody on it, which is where the real height saving comes from
   — a filter that leaves 25 empty rows behind has not condensed anything. */
/* ⚠️ "❌" IS A CLOSED STATION, NOT A NAME, AND IT SHOUTS. On the board the red
   cross is doing a job — a leader is looking for gaps while assigning. On a
   read-only page it is the loudest thing on a row that is mostly names, so it
   reads as an alarm on a station that is simply not open at that hour.
   A dash says "nobody" without shouting. ✔️ is stripped by cellDisplay already. */
const hasPerson = (text) => !!text && text !== '❌';
const cellText = (c) => (hasPerson(c.text) ? c.text : '—');

function CompactView({ data, isFoh, shift }) {
  const groups = useMemo(() => {
    if (!data) return [];
    return isFoh
      ? groupFOHStations((data.stations || []).filter((st) => isPositionRow(st && st.role)))
          .map((g) => ({ name: g.label, color: g.color, stations: g.items.map((it) => it.station) }))
      : (data.sections || []).map((s) => ({
          name: s.name, color: bohSectionColor(s.name),
          stations: (s.stations || []).filter((st) => isPositionRow(st && st.role)),
        })).filter((g) => g.stations.length);
  }, [data, isFoh]);

  const cols = shift === 'all' ? SHIFT_KEYS : [shift];

  const rows = useMemo(() => groups.map((g) => ({
    ...g,
    stations: (g.stations || []).filter((st) => {
      if (!st) return false;
      if (shift === 'all') return true;
      // Nobody on this shift, so the row is noise in a filtered view.
      return cellPeople(st[shift]).length > 0;
    }),
  })).filter((g) => g.stations.length > 0), [groups, shift]);

  if (!rows.length) {
    return (
      <div className="text-center text-[13px] text-gray-400 py-10">
        Nobody is on {shift === 'all' ? 'this board' : SHIFT_LABELS[shift]} yet.
      </div>
    );
  }

  /* ★ ONE RAISED CARD PER GROUP, NOT ONE LONG SHEET (Matt, Aug 5 2026: "the new
     setup looks really flat"). This started as a single bordered box with every
     group stacked inside it, so the whole view was one white page divided by
     hairlines. It had CARD_3D on it, which is why it read as "flat" and not as
     "unstyled" — the depth was on the outside of a list nobody could see the
     edges of.
     Now each group is its own card in the Hub's language: the gradient surface,
     the coloured left/top edge, the same shadow every other tile uses, and real
     space between them. The group's colour does the work it was already picked
     for. Nothing about the rows changed. */
  /* ★★ AND THE SAME LEFT STRIPE THE GRID AND THE TRAINING LIST DRAW. Matt,
     Aug 14 2026: "improve the look of compact though". The card already had the
     gradient face; what it did not have was the one mark that makes every other
     list in the Hub scan — a colour running down the side of the whole group,
     rather than a border on two edges that stops at the corner.
     ⚠️ A REAL ELEMENT, NOT `accentEdge`. It has to stretch to the group's full
     height however many stations are in it, and a border cannot do that and
     stay square against a rounded card under `overflow-hidden`. */
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((g) => (
        <div key={g.name} className="flex rounded-xl overflow-hidden" style={{
          background: '#fff',
          backgroundImage: cardSurface(g.color, 0.45),
          border: '1px solid #E8EAE7',
          boxShadow: CARD_3D,
        }}>
          <div style={{ width: 5, flexShrink: 0, alignSelf: 'stretch', background: g.color }} />
          <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2 px-3 py-1.5"
            style={{ background: `${g.color}14`, borderBottom: `1px solid ${g.color}33` }}>
            <span className="text-[10.5px] font-extrabold uppercase tracking-wide" style={{ color: shade(g.color) }}>{g.name}</span>
            {/* The count in the group's own colour rather than grey: on a card
                that is already tinted, a grey number reads as switched off. */}
            <span className="rounded-full px-1.5 text-[10.5px] font-bold"
              style={{ color: '#fff', background: g.color }}>{g.stations.length}</span>
          </div>
          {g.stations.map((st, i) => {
            const { name, hours } = splitRoleHours(st.role || '');
            const cells = cols.map((k) => ({ k, ...cellDisplay(st[k]) }));
            /* ⚠️ ONE CELL, NOT FOUR IDENTICAL ONES. The DRINKS/DESSERTS leader
               row carries "split duties" in all four shifts and printed it four
               times, which is four lines of nothing on a view whose whole job
               is to be short. Same text everywhere means it is a note about the
               station, not four assignments. */
            const sameAll = cells.length > 1 && cells.every((c) => c.text === cells[0].text && !c.at);
            const single = cols.length === 1;
            /* When one shift is picked the row answers "who is on THIS shift and
               when", so the time has to be that shift's, in this order:
                 1. the person's own time typed into the cell ("@11:15", "5-8")
                 2. the daypart's window ("2-5")
               The station's posted hours are the whole day and belong only to
               the All day view. */
            /* ⚠️ NIGHT'S FALLBACK IS THE STATION'S OWN END, NOT "close" (Matt,
               Aug 6 2026: "The out times should be specific"). Every night row
               read "5-close" while the stations end at 8, 9, 10 and 11 — the
               posted window is sitting right there in `hours`, so the closer's
               real out time is derivable, and "close" hid a three-hour spread. */
            const shiftTime = single
              ? ((cellHours(st[cols[0]]) || [])[0]
                  || (cols[0] === 'night' ? nightWindowFrom(hours) : DAYPART_WINDOW[cols[0]])
                  || '')
              : hours;
            return (
              /* ⚠️ THE DIVIDER TAKES THE GROUP'S COLOUR AT LOW ALPHA, not a flat
                 grey. On a tinted card a grey hairline is a different surface
                 showing through; the group's own colour reads as one card
                 ruled, which is what it is. */
              <div key={`${name}-${i}`} className="px-3 py-1"
                style={{ borderTop: i === 0 ? 'none' : `1px solid ${g.color}22` }}>
                {/* ⚠️ ONE LINE WHEN ONE SHIFT IS PICKED. With a single column
                    there is exactly one name, so splitting it over two lines
                    doubles the height of a filtered board for nothing. */}
                {/* ⚠️ NO flex-wrap, AND THE TRAILING GROUP IS THE ONLY THING
                    THAT SHRINKS (Matt, Aug 5 2026: "Setup is better but can
                    look better").
                    Wrapping let a long duty drop onto its own line — OT CAPTAIN
                    became a two-line row with a hole in it — and `ml-auto`
                    pushed the duty hard against the person's name on a short
                    row, so DESSERTS read "Maria CLEAN AND STOCK DESSERTS" with
                    nothing between them.
                    Station and person are one group that never shrinks, because
                    they are the two things being read. Hours and duty are one
                    group that absorbs all the slack and truncates. `min-w-0` is
                    what makes truncate work at all inside a flex child. */}
                <div className="flex items-baseline gap-2">
                  <span className="flex items-baseline gap-2 shrink-0">
                    <span className="text-[12.5px] font-extrabold text-gray-900 uppercase tracking-tight">{name}</span>
                    {(single || sameAll) && (
                      <span className="text-[13.5px] font-bold text-gray-900">{cellText(cells[0])}</span>
                    )}
                  </span>
                  <span className="flex items-baseline gap-2 ml-auto min-w-0 justify-end">
                    {/* ★ THE SHIFT'S TIME, NOT THE STATION'S DAY (Matt, Aug 5
                        2026: "for each daypart it should only show that shift
                        and not the whole day"). Filtered to Mid, WINDOW was
                        printing 6AM-11PM — the station's posted opening hours,
                        which is exactly the whole day he does not want. Now:
                        the person's own time off the cell when there is one,
                        otherwise the daypart's window, and the station's posted
                        hours only when All day is showing.
                        ⚠️ NOT grey. It was 9.5px grey-400 and unreadable on a
                        phone in a kitchen; it is the second most useful thing
                        on the row after the name. */}
                    {shiftTime && (
                      <span className="text-[11.5px] font-extrabold whitespace-nowrap"
                        style={{ color: single ? PERIOD_COLORS[cols[0]].text : '#6B7280' }}>{shiftTime}</span>
                    )}
                    {st.duty && <span className="text-[10px] font-semibold text-gray-400 uppercase truncate">{st.duty}</span>}
                  </span>
                </div>
                {!single && !sameAll && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {cells.map((c) => (
                      <span key={c.k} className="text-[12px] leading-snug">
                        <span className="font-bold uppercase text-[9.5px] mr-1" style={{ color: PERIOD_COLORS[c.k].text }}>
                          {SHIFT_ABBR[c.k]}
                        </span>
                        <span className={hasPerson(c.text) ? 'text-gray-900 font-semibold' : 'text-gray-300'}>
                          {cellText(c)}
                        </span>
                        {c.at && <span className="ml-0.5 font-bold" style={{ color: PERIOD_COLORS[c.k].text }}>@{c.at}</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionBand({ label, color, count }) {
  return (
    <div className="flex items-center gap-2.5 mb-2.5 mt-1 px-0.5">
      <span style={{ fontFamily: DISPLAY_FONT, fontSize: 17, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color, lineHeight: 1 }}>
        {label}
      </span>
      <span className="flex-1 rounded" style={{ height: 2, background: color, opacity: 0.28 }} />
      {typeof count === 'number' && count > 0 && (
        <span style={{ fontFamily: MONO_FONT, fontSize: 10.5, fontWeight: 600, color: '#6B7280', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}>
          {count} station{count === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
}

function StationCard({ station, accent = ACCENT, accentSoft = '#F0FDFA', leaderMap = null, edit = false, onCell, onDuty, onRole, onDelete, trainerSet = null, ranks = null, avatars = null, roles = null, moveOn = false, isPicked = null, onMoveTap = null, leaderSets = null }) {
  const { name, hours } = splitRoleHours(station.role);
  // Rebuild the combined "Name (Hours)" role string when either part changes,
  // so posted hours can be maintained in the Hub without the Google Sheet.
  const setRole = (nextName, nextHours) => {
    const n = (nextName || '').trim();
    const h = (nextHours || '').trim();
    onRole(h ? `${n} (${h})` : n);
  };
  return (
    /* ★ THE SAME RAISED LOOK AS EVERY OTHER CARD IN THE HUB (Matt, Aug 4 2026:
       "do the station cards"). These carried a single flat blur and a plain
       white face while the tools around them had moved on, so the board read as
       the one screen that had not been touched.
       The face takes the section's own colour at 45% — the board shows six to
       ten of these at once and full strength turns a page of stations into a
       page of colour blocks, the same trap FCR hit with five.
       ⚠️ The accent cap stays. It is a horizontal gradient across the top and
       the accentEdge helper draws two solid edges; the cap is the louder, more
       useful signal on a dense board, so this adds depth WITHOUT replacing the
       thing that already worked. */
    /* ★★ A LEFT STRIPE, NOT A TOP CAP (Matt, Aug 14 2026: "I love the look of
       the training lines and that's how I want the schedule and setup").
       Same change already made to the schedule board's station cards, and the
       reason is the same: a cap across the top reads as a header rule, a stripe
       down the left reads as a row in a list, and a board of stations IS a list.
       It also survives the card stretching to match a taller neighbour, which a
       fixed-height cap never had to. */
    <div
      className="border overflow-hidden"
      /* ⚠️ A FULL-HEIGHT FLEX ROW NOW, with the column moved inside it. The
         stripe has to be a real element to stretch to the card's full height —
         and the card's height is decided by the grid row, not by its content,
         which is the same reason `height: 100%` is here at all. A border-left
         cannot round with the card and a background stripe cannot survive
         `overflow-hidden` on a card that stretches. */
      /* ★ 0.45, MATCHING THE COMPACT VIEW (Matt, Aug 6 2026: "make the setup
         gradient stronger pls"). All three reads of this board now use one
         tint strength, so switching view does not change how strong the colour
         looks — the compact list was already at 0.45 and the two card views sat
         at 0.28, which is why the cards read pale beside it. */
      style={{ borderColor: '#E8EAE7', borderRadius: 14, background: cardSurface(accent, 0.45), boxShadow: CARD_3D,
        height: '100%', display: 'flex', flexDirection: 'row' }}
    >
      <div style={{ width: 5, flexShrink: 0, alignSelf: 'stretch', background: accent }} />
      {/* ⚠️ THE COLUMN THAT USED TO BE THE CARD. `minWidth: 0` or a long station
          name stops the flex child shrinking and pushes the card wider than its
          grid track. */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      {edit && onRole ? (
        <div className="flex items-center gap-1.5 px-3 pt-3 pb-2">
          <input
            value={name}
            onChange={(e) => setRole(e.target.value, hours)}
            className="flex-1 min-w-0 text-[16px] font-semibold text-gray-900 rounded border border-gray-300 px-1.5 py-1"
            placeholder="Station name"
          />
          <input
            value={hours || ''}
            onChange={(e) => setRole(name, e.target.value)}
            className="w-28 shrink-0 text-[16px] font-bold text-gray-700 rounded border border-gray-300 px-1.5 py-1"
            placeholder="6AM-8PM"
            title="Posted hours — e.g. 6AM-8PM, or 11AM-2PM, 5PM-11PM"
          />
          {onDelete && (
            <button
              onClick={() => {
                if (window.confirm(`Remove the "${name || 'Untitled'}" station?`)) onDelete();
              }}
              className="shrink-0 grid place-items-center h-8 w-8 rounded border border-red-200 text-red-500"
              title="Remove this station"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2.5 px-3 pt-2.5 pb-2">
          <h4 style={{ margin: 0, fontFamily: DISPLAY_FONT, fontSize: 19, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1, color: '#111827' }}>
            {name}
          </h4>
          {hours && (
            <span style={{ fontFamily: MONO_FONT, fontSize: 10.5, fontWeight: 600, color: '#4B5563', background: '#F3F4F2', borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {hours}
            </span>
          )}
        </div>
      )}
      {/* One strip reading left-to-right across the day rather than four
          separate pastel tiles — the period colour drops to a rule so the
          NAME is the loudest thing in the cell. */}
      <div className="grid grid-cols-4" style={{ borderTop: '1px solid #EEF0ED' }}>
        {SHIFT_KEYS.map((k, ki) => {
          const raw = (station[k] || '').trim();
          const isClosed = raw === '❌' && !edit;
          const pc = PERIOD_COLORS[k];
          return (
            <div
              key={k}
              className="min-w-0"
              style={{
                padding: '8px 9px 10px',
                borderRight: ki < 3 ? '1px solid #EEF0ED' : 'none',
                /* ⚠️ TRANSPARENT, SO THE CARD'S OWN GRADIENT IS THE CELL'S
                   BACKGROUND (Matt, Aug 6 2026: "I would love a gradient view
                   of these cards", then "make the setup gradient stronger").
                   These four cells cover almost the whole card face, so
                   whatever they are painted IS what the card looks like.
                   Painted solid #fff they hid the gradient completely — a
                   white box with a coloured cap. Translucent white was the
                   first fix and it was still not enough: worked through
                   cardSurface's own maths, .82 white over strength 0.28 lets
                   about 0.9% of the tint reach the eye, which is a rumour, not
                   a gradient. Transparent over strength 0.45 gives the full
                   8%, which is visible and still light enough for black text.
                   ⚠️ The closed hatch stays opaque. It has to read as closed
                   first and pretty second, and it is the one cell whose
                   background is carrying information. */
                background: isClosed
                  ? 'repeating-linear-gradient(135deg,#FAFAF9,#FAFAF9 5px,#F1F1EF 5px,#F1F1EF 10px)'
                  : 'transparent',
              }}
            >
              <div
                className="text-[8.5px] font-extrabold uppercase"
                style={{ color: isClosed ? '#A8A8A4' : pc.text, letterSpacing: '0.09em', marginBottom: 4 }}
              >
                {SHIFT_LABELS[k]}
              </div>
              <div style={{ height: 3, borderRadius: 2, marginBottom: 6, opacity: 0.85, background: isClosed ? '#D6D6D2' : pc.dot }} />
              {edit && moveOn ? (
                /* ★ A TAP TARGET, NOT A TEXT FIELD. In move mode the input is
                   replaced rather than layered on: a focusable input under a
                   tap handler means the keyboard opens on an iPad every time
                   somebody picks a person up. The whole cell is the target,
                   which is what makes 70px workable with a thumb. */
                <button
                  type="button"
                  onClick={() => onMoveTap && onMoveTap(k)}
                  className="w-full text-left"
                  style={{
                    minHeight: 34, borderRadius: 8, padding: '5px 7px',
                    fontFamily: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                    border: isPicked && isPicked(k) ? '2px solid #14243D' : '1.5px dashed #C9D2DC',
                    background: isPicked && isPicked(k) ? '#EEF2F7' : '#fff',
                    color: (station[k] || '').trim() ? '#111827' : '#9AA3AE',
                  }}>
                  {(station[k] || '').trim() || 'empty'}
                </button>
              ) : edit ? (
                <input
                  value={station[k] || ''}
                  onChange={(e) => onCell(k, e.target.value)}
                  className="w-full text-[16px] font-semibold text-gray-900 rounded border border-gray-300 bg-white px-1 py-0.5"
                  placeholder="—"
                />
              ) : (
                <ShiftCell value={station[k]} fallbackName={leaderMap ? leaderMap[k] : null} edited={!!(station._edits && station._edits[k])} isTrainer={cellIsTrainer(trainerSet, station[k])} badge={cellBadge(trainerSet, ranks, station[k], roles)} badgeColor={cellBadgeColor(station[k], roles)} avatars={avatars} badgeFor={(nm) => cellBadge(trainerSet, ranks, nm, roles)} colorFor={(nm) => cellBadgeColor(nm, roles)} leaderSet={leaderSets ? leaderSets[k] : null} />
              )}
            </div>
          );
        })}
      </div>
      {edit ? (
        <input
          value={station.duty || ''}
          onChange={(e) => onDuty(e.target.value)}
          className="w-full border-0 px-3 py-2 text-[16px] font-medium"
          style={{ color: accent, background: accentSoft, borderTop: '1px solid #EEF0ED' }}
          placeholder="Duty"
        />
      ) : (
        /* ★ THE DUTY BAND ALWAYS RENDERS, AND IT IS ALWAYS AT THE BOTTOM
           (Matt, Aug 4 2026: "There shouldn't be any gaps on the bottom and the
           director block lacks color").
           Two faults, one cause. Cards sit in a two-column grid and stretch to
           match the taller one in the row, and this band was the last child with
           nothing pushing it down — so a short card ended with a strip of bare
           white below its duty. And a station with NO duty, which is exactly what
           DIRECTOR is, rendered no band at all, so the whole bottom of the card
           was blank white while every card around it carried the section colour.
           ⇒ `marginTop: 'auto'` pins the band to the bottom of the card however
           tall the row makes it, and the band renders whether or not there is a
           duty. With no duty it is the section's colour and nothing else, which
           is what "lacks color" was asking for — a card that still reads as part
           of Leadership rather than an empty box.
           ⚠️ The ◆ and the text only appear when there IS a duty. An empty card
           with a lone diamond floating in it looks like a bug, not a blank. */
        <div
          className="flex items-center gap-2"
          style={{ marginTop: 'auto', borderTop: '1px solid #EEF0ED', background: accentSoft, color: accent, padding: '8px 12px', fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', minHeight: 33 }}
        >
          {station.duty ? (
            <>
              <span style={{ fontSize: 10, opacity: 0.75 }}>◆</span>
              {station.duty}
            </>
          ) : null}
        </div>
      )}
      </div>
    </div>
  );
}

/* ============ ADDITIONAL (special-occasion adds) ============
   Ad-hoc team members added to a day — picked-up shifts, events, extra
   hands. Kept in a separate day.additional array so they never touch the
   locked template stations or the auto-assign engines; rendered at the
   bottom as editable mini-stations. Saves to the day for everyone. */
/* ⚠️ trainerSet + ranks ARE PART OF THIS SECTION'S JOB (Matt, Aug 2 2026).
   They were never passed, so a station added during the day showed a bare
   name while every station on the main board carried its DIR / AD / TRN
   pill. The rows that get added mid-shift are exactly the ones a leader is
   least sure about, so they are the worst place to drop the rank. */
function AdditionalSection({ stations, edit, accent = '#7C3AED', onAdd, onStation, onDelete, trainerSet = null, ranks = null, avatars = null, roles = null }) {
  const list = stations || [];
  if (!edit && list.length === 0) return null;
  return (
    <div className="mt-3">
      <SectionBand label="Additional — added today" color={accent} />
      {list.length > 0 && (
        <div style={CARD_GRID}>
          {list.map((s, i) => (
            <StationCard
              key={i}
              station={s}
              accent={accent}
              accentSoft={hexToSoftBg(accent)}
              edit={edit}
              onCell={(field, v) => onStation(i, field, v)}
              onDuty={(v) => onStation(i, 'duty', v)}
              onRole={(v) => onStation(i, 'role', v)}
              onDelete={() => onDelete(i)}
              trainerSet={trainerSet} ranks={ranks} avatars={avatars} roles={roles}
            />
          ))}
        </div>
      )}
      {edit ? (
        <button
          onClick={onAdd}
          className="mt-2 flex items-center gap-1.5 text-[12px] font-bold rounded-lg px-2.5 py-1.5 border"
          style={{ borderColor: accent, color: accent }}
        >
          <Plus size={13} strokeWidth={3} />
          Add team member
        </button>
      ) : (
        list.length > 0 && (
          <p className="text-[10.5px] text-gray-400 mt-1.5 px-0.5">
            Picked-up / special-occasion adds — not part of the standard board.
          </p>
        )
      )}
    </div>
  );
}
function Collapsible({ title, icon, children, defaultOpen = false, trailing = null }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-[13px] font-semibold text-gray-800">
          {icon}
          {title}
        </span>
        <span className="flex items-center gap-2">
          {trailing}
          {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </span>
      </button>
      {open && <div className="px-3 pb-3 border-t border-gray-100 pt-2">{children}</div>}
    </div>
  );
}

function DayPicker({ day, setDay, todayName, accent = ACCENT }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
      {DAYS.map((d) => {
        const active = d === day;
        const isToday = d === todayName;
        return (
          <button
            key={d}
            onClick={() => setDay(d)}
            className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors relative"
            style={
              active
                ? { background: accent, color: 'white' }
                : { background: '#F3F4F6', color: '#4B5563' }
            }
          >
            {d.slice(0, 3)}
            {isToday && (
              <span
                className="absolute -top-1 -right-1 h-2 w-2 rounded-full border border-white"
                style={{ background: active ? 'white' : accent }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ============ BREAK COMPLIANCE BOARD ============ */
function ComplianceBoard({ dateKey, side, roster, minors, accent, canEdit, onMinorsChange }) {
  const storageKey = `gcfcr-dailysetup-breaks2-${side}-${dateKey}`;
  const [log, setLog] = useState(null);
  const [adding, setAdding] = useState(null);
  const [timeVal, setTimeVal] = useState('');
  const [minorsDraft, setMinorsDraft] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLog(null);
    (async () => {
      const v = await readKV(storageKey);
      if (!cancelled) setLog(v || {});
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const persist = async (next) => {
    setLog(next);
    const ok = await writeKV(storageKey, next);
    setErr(!ok);
  };

  const minorSet = useMemo(
    () => new Set((minors || []).map((m) => m.trim().toLowerCase()).filter(Boolean)),
    [minors]
  );

  const people = useMemo(() => {
    const seen = {};
    (roster || []).forEach((raw) => {
      const f = formatRosterEntry(raw);
      const name = extractRosterName(f);
      if (!name || /\d/.test(name)) return;
      const key = name.toLowerCase();
      if (!seen[key]) seen[key] = { name, hours: 0 };
      seen[key].hours += rangesHours(parseRanges(f));
    });
    return Object.values(seen)
      .map((p) => {
        const isMinor = minorSet.has(p.name.toLowerCase()) || minorSet.has(p.name.split(' ')[0].toLowerCase());
        return { ...p, isMinor, required: requiredBreaks(p.hours, isMinor) };
      })
      .sort((a, b) => b.required - a.required || b.hours - a.hours || a.name.localeCompare(b.name));
  }, [roster, minorSet]);

  const addTime = (name) => {
    if (!timeVal.trim()) return;
    const next = { ...(log || {}) };
    next[name] = [...(next[name] || []), timeVal.trim()];
    persist(next);
    setTimeVal('');
    setAdding(null);
  };
  const removeTime = (name, i) => {
    const next = { ...(log || {}) };
    next[name] = (next[name] || []).filter((_, x) => x !== i);
    if (!next[name].length) delete next[name];
    persist(next);
  };

  // Parse a displayed break time ("10 AM", "1:30 PM", or a bare "2:30") into
  // a comparable 24h number, so the list can be ordered earliest → latest.
  const breakTimeValue = (str) => {
    const m = (str || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!m) return 99;
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    const mer = (m[3] || '').toLowerCase();
    if (mer === 'pm' && h < 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    /* No am/pm marker: fall back to the only reading the break windows allow.
       Breaks run 7:00–10:30 AM and 1:30–9:30 PM, so a bare 1 through 6 can only
       be afternoon — there is no 5 or 6 AM break for it to be confused with.
       🐛 THE CEILING WAS 4. Chloe types "6" for a 6 PM break, it parsed as 6:00
       AM, and that person jumped to the TOP of the list — ahead of everyone who
       genuinely broke in the morning. The list is ordered earliest break first,
       so one closer's entry pushed the whole morning down.
       ⚠️ 7, 8 and 9 DELIBERATELY STAY AM. Both windows contain those hours, so
       they are the only genuinely ambiguous ones; guessing PM there would break
       every morning break to fix an evening one. 10 is already correct — the
       morning window reaches 10:30 and the evening one stops at 9:30. */
    if (!mer && h >= 1 && h <= 6) h += 12;
    return h + min / 60;
  };
  const earliestBreak = (name) => {
    const times = (log && log[name]) || [];
    if (!times.length) return 99; // people without a logged break sink to the bottom
    return Math.min(...times.map(breakTimeValue));
  };

  const needing = people
    .filter((p) => p.required > 0)
    .sort((a, b) => earliestBreak(a.name) - earliestBreak(b.name) || a.name.localeCompare(b.name));
  const rest = people.filter((p) => p.required === 0);
  const outstanding = needing.filter((p) => ((log && log[p.name]) || []).length < p.required).length;

  /* ★ COLLAPSED BY DEFAULT (Matt, Aug 4 2026: "make the break's collapsible").
     Sixteen rows, a paragraph of who does not need one, and the policy text
     pushed the actual board most of a screen down — on the tool leaders open to
     look at the board. The headline is the only part that is true at a glance
     ("all covered" / "3 still owed"), so that stays visible and the detail is
     one tap away.
     ★ OPEN BY DEFAULT WHEN SOMETHING IS OWED, but the leader always wins.
     🐛 First version was `breaksOpen || outstanding > 0`, and that is not a
     default, it is a lock: with anything owed the panel is pinned open and the
     Hide button silently does nothing. Mid-shift there is essentially always a
     break owed, so the collapse Matt asked for never once worked on the tool he
     actually uses (Matt, Aug 4 2026: "the break list wont collapse now").
     ⇒ `null` means "nobody has touched it", which is the only state where the
     owed count gets to decide. One tap and the leader's choice is the answer for
     the rest of the session. The amber "N still owed" badge sits in the header
     either way, so collapsing never hides the fact that work is outstanding —
     it only hides the sixteen rows of detail. */
  const [breaksOpen, setBreaksOpen] = useState(null);
  const showRows = breaksOpen === null ? outstanding > 0 : breaksOpen;
  /* ⚠️ FLIP WHAT IS ON SCREEN, not the raw state. The usual `(v) => !v` updater
     reads null as false and flips it to true, so the first tap on a panel that
     is already open would re-open it and the button would look dead — the same
     symptom this fix exists to remove, just one tap later. */
  const toggleBreaks = () => setBreaksOpen(!showRows);

  return (
    <div className="rounded-xl border border-violet-200 p-3"
      style={{ background: cardSurface("#7C3AED", 0.35), ...accentEdge("#7C3AED", 3), boxShadow: CARD_3D }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-violet-800 font-bold text-[12px]">
          <Clock size={14} />
          Breaks
          {log !== null && needing.length > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={outstanding ? { background: '#FEF3C7', color: '#92400E' } : { background: '#D1FAE5', color: '#065F46' }}
            >
              {outstanding ? `${outstanding} still owed` : 'all covered'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleBreaks}
          className="text-[10.5px] font-bold uppercase tracking-wide text-violet-500"
        >
          {showRows ? 'Hide' : `Show${needing.length ? ` (${needing.length})` : ''}`}
        </button>
        {canEdit && (
          <button
            onClick={() => setMinorsDraft(minorsDraft === null ? (minors || []).join('\n') : null)}
            className="text-[10.5px] font-bold uppercase tracking-wide text-violet-500"
          >
            {minorsDraft === null ? 'Minors list' : 'Close'}
          </button>
        )}
        </div>
      </div>

      {minorsDraft !== null && (
        <div className="bg-white rounded-lg p-2.5 mb-2 border border-violet-200">
          <div className="text-[11px] font-semibold text-violet-800 mb-1">Team members under 16 — one name per line</div>
          <textarea
            value={minorsDraft}
            onChange={(e) => setMinorsDraft(e.target.value)}
            rows={4}
            className="w-full text-[16px] rounded-md border border-violet-200 px-2 py-1.5 text-gray-800"
            placeholder={'Alex\nJordan'}
          />
          <button
            onClick={() => {
              onMinorsChange(minorsDraft.split('\n').map((s) => s.trim()).filter(Boolean));
              setMinorsDraft(null);
            }}
            className="mt-1.5 text-[12px] font-bold text-white rounded-md px-2.5 py-1.5"
            style={{ background: accent }}
          >
            Save minors list
          </button>
        </div>
      )}

      {log === null ? (
        <div className="text-[11.5px] text-violet-400 mb-1">Loading…</div>
      ) : !showRows ? null : (
        <div className="space-y-1 mb-2">
          {needing.map((p) => {
            const given = (log[p.name] || []);
            const done = given.length >= p.required;
            return (
              <div key={p.name} className="bg-white rounded-lg px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {done ? (
                      <Check size={13} strokeWidth={3} className="text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                    )}
                    <span className="text-[12.5px] font-bold text-gray-900 truncate">{p.name}</span>
                    {p.isMinor && (
                      <span className="shrink-0 rounded px-1 text-[9px] font-bold" style={{ background: '#FCE7F3', color: '#9D174D' }}>
                        U16 · 30 min
                      </span>
                    )}
                    <span className="text-[10.5px] text-gray-400 shrink-0">{p.hours.toFixed(1)}h</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {given.map((t, i) => (
                      <span key={i} className="flex items-center gap-0.5 rounded-full bg-violet-100 text-violet-800 px-1.5 py-0.5 text-[11px] font-bold">
                        {t}
                        <button onClick={() => removeTime(p.name, i)} className="text-violet-300">
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                    {!done && adding !== p.name && (
                      <button
                        onClick={() => {
                          setAdding(p.name);
                          setTimeVal('');
                        }}
                        className="flex items-center gap-0.5 text-[11px] font-bold text-violet-600"
                      >
                        <Plus size={12} strokeWidth={3} />
                        {given.length ? '2nd' : 'break'}
                      </button>
                    )}
                  </div>
                </div>
                {adding === p.name && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <input
                      value={timeVal}
                      onChange={(e) => setTimeVal(e.target.value)}
                      placeholder="2:30"
                      autoFocus
                      className="text-[16px] font-medium rounded-md border border-violet-200 px-2 py-1 bg-white w-20 text-gray-700"
                    />
                    <button
                      onClick={() => addTime(p.name)}
                      className="text-[12px] font-bold text-white rounded-md px-2.5 py-1"
                      style={{ background: accent }}
                    >
                      Log
                    </button>
                    <button onClick={() => setAdding(null)} className="text-[12px] text-gray-400">
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {needing.length === 0 && (
            <div className="text-[11.5px] text-violet-400">No one on this roster hits a break threshold.</div>
          )}
          {rest.length > 0 && (
            <div className="text-[10.5px] text-violet-400 pt-1">
              No break required: {rest.map((p) => p.name).join(', ')}
            </div>
          )}
        </div>
      )}

      {err && <div className="text-[10.5px] text-red-500 mb-1">Couldn't save — try again.</div>}

      {/* The policy is reference, not a live fact, so it collapses with the
          rows. A leader who needs it is already looking at the list. */}
      {showRows && (
        <div className="text-[10px] text-violet-500 leading-snug pt-1.5 border-t border-violet-100">
          Policy: 6+ hrs → 1 break · 12+ hrs → 2 breaks · under 16 working 5+ hrs → one 30-minute break (required).
          Hours come from the roster; tag under-16 team members in the Minors list.
        </div>
      )}
    </div>
  );
}

/* ============ FOH VIEW ============ */
/* The uncovered-slots banner, shared by both boards.
   ⚠️ ONE COPY ON PURPOSE. This markup lived inside FOHView, which is exactly
   why the BOH board never had it — the list looked like a shared feature and
   was actually front-of-house-only. Duplicating it into BOHView would have set
   up the drift rule 8 exists for, on the one panel whose whole job is telling a
   leader the truth about staffing.
   ⚠️ The two boards fill `gaps` to different resolutions: FOH reports partial
   holes inside a staffed window, BOH reports whole empty cells (see the gap
   sweep in BOHAutoAssign.js). Both are real uncovered time, so both belong
   here; the wording below deliberately says nothing that only holds for one. */
function UncoveredBanner({ gaps }) {
  const list = gaps || [];
  if (!list.length) return null;
  return (
    <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: '#FEF2F2', color: '#991B1B' }}>
      <div className="flex items-center gap-1.5 font-bold mb-1">
        <AlertTriangle size={12} />
        {list.length} uncovered {list.length === 1 ? 'slot' : 'slots'} — nobody on the clock covers these
      </div>
      <div className="leading-snug space-y-0.5">
        {list.map((g, i) => (
          <div key={i}>
            <span className="font-semibold">{splitRoleHours(g.role).name}</span>{' '}
            <span className="text-[9.5px] font-bold uppercase">{SHIFT_LABELS[g.period] || g.period}</span>
            {' · '}
            {g.from}–{g.to}
          </div>
        ))}
      </div>
      <div className="text-[10px] mt-1.5 opacity-70 leading-snug">
        A blank cell listed here is a real staffing hole, not a bug — the engine had nobody
        scheduled and free for that window. Rebuilt on every import.
      </div>
    </div>
  );
}

function FOHView({ data, dateKey, edit, onStation, onRoster, onTrainers, minors, canEdit, onMinors, onAddStation, onDeleteStation, ranks = null, roles = null, avatars = null, departed = null, staleFromArchive = [], moveOn = false, moveSel = null, onMoveTap = null }) {
  if (!data) return null;
  /* ⚠️ FILTERED HERE, NOT INSIDE groupFOHStations. That helper keeps each
     station's INDEX in the flat array so every edit handler can target it, and
     it is also called by orderByGroup and by the print sheet — narrowing it
     would silently change three callers to serve one. */
  const groups = groupFOHStations((data.stations || []).filter((st) => isPositionRow(st && st.role)));
  const trainerSet = trainerSetOf(data.trainers);
  // Count of cells changed by hand on this board (auto-assigned names stay
  // plain), so the tally matches the highlighted names below.
  const editCount = (data.stations || []).reduce((n, s) => n + (s._edits ? SHIFT_KEYS.filter((k) => s._edits[k]).length : 0), 0);
  const leaderDT = extractLeaderShiftMap(data.stations, (r) => /^LEADER DT/i.test(r));
  const leaderFC = extractLeaderShiftMap(data.stations, (r) => /^LEADER FC/i.test(r));
  /* ★ WHO IS LEADING, PER DAYPART, so the badge lands on whatever box they are
     standing in rather than only on the row that names them. */
  const leaderSets = leaderSetsOf(leaderDT, leaderFC);

  return (
    <div className="space-y-3">
      {/* ★ ERRORS ONLY. Matt, Jul 30 2026: "all i need to see are errors. not the
          whole thing like before." So this renders nothing at all when the board
          and the roster agree, and lists only the names that disagree — never a
          headcount, never a summary of what is fine. */}
      {(() => {
        const hc = setupHeadcount(data, departed, staleFromArchive);
        if (!hc || (!hc.missing.length && !hc.extra.length && !hc.gone.length)) return null;
        return (
          <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: '#FFF7ED', color: '#9A3412' }}>
            {hc.missing.length > 0 && (
              <div className="leading-snug">
                <span className="font-bold">On the clock, not on the board:</span>{' '}
                {hc.missing.join(', ')}
              </div>
            )}
            {hc.extra.length > 0 && (
              <div className="leading-snug" style={{ marginTop: hc.missing.length ? 3 : 0 }}>
                <span className="font-bold">On the board, not scheduled:</span>{' '}
                {hc.extra.join(', ')}
              </div>
            )}
            {hc.gone.length > 0 && (
              <div className="leading-snug" style={{ marginTop: 3, color: '#991B1B' }}>
                <span className="font-bold">No longer employed per HR:</span>{' '}
                {hc.gone.join(', ')}
                <span className="opacity-70"> — remove from the trainer list</span>
              </div>
            )}
          </div>
        );
      })()}
      <UncoveredBanner gaps={data.gaps} />
      {editCount > 0 && (
        <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold" style={{ background: '#FFF7ED', color: '#C2410C' }}>
          <Pencil size={12} /> {editCount} manual edit{editCount === 1 ? '' : 's'} on this board — highlighted below
        </div>
      )}
      <ComplianceBoard
        dateKey={dateKey}
        side="foh"
        roster={data.roster}
        minors={minors}
        accent="#7C3AED"
        canEdit={canEdit}
        onMinorsChange={onMinors}
      />

      {(data.stations || []).length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-[12.5px] text-gray-500">
          No stations on this board yet — unlock editing to build it, or use Import.
        </div>
      )}

      {groups.map((g) => {
        // The leader fallback names apply to REGULAR stations (a bare ✔️
        // there means "the leader covers this"). Training and Leadership are
        // excluded at the group level (no shift leader owns them), and
        // NO_LEADER_COVER excludes the individual rows that must stay bare
        // wherever they are grouped — OT, hospitality and cleanliness.
        //
        // ⚠️ 'dining' IS NO LONGER A GROUP. It used to appear in this test,
        // which is exactly why NO_LEADER_COVER exists: hospitality and
        // cleanliness now live in Front Counter, which DOES carry a fallback,
        // so the exclusion had to move from the group to the row or those
        // cells would have started printing the FC leader's name.
        //
        // LEADER DT and LEADER FC cross-cover each other, matching the Google
        // Sheet: those two rows never sit bare there, so on a bare cell we
        // borrow the OTHER leader's name for that period.
        const leaderMap =
          g.key === 'dt'
            ? leaderDT
            : g.key === 'leadership' || g.key === 'training'
            ? null
            : leaderFC;
        const rowLeaderMap = (role) =>
          NO_LEADER_COVER.test(role)
            ? null
            : /^LEADER DT/i.test(role) ? leaderFC : /^LEADER FC/i.test(role) ? leaderDT : leaderMap;
        return (
          <div key={g.key}>
            <SectionBand label={g.label} color={g.color} count={g.items.length} />
            <div style={CARD_GRID}>
              {g.items.map(({ station, idx }) => (
                <StationCard
                  key={idx}
                  station={station}
                  moveOn={moveOn}
                  isPicked={(k) => !!moveSel && moveSel.side === 'FOH' && moveSel.idx === idx && moveSel.k === k}
                  onMoveTap={(k) => onMoveTap && onMoveTap({ side: 'FOH', si: null, idx, k })}
                  accent={g.color}
                  accentSoft={hexToSoftBg(g.color)}
                  /* 🐛 rowLeaderMap FOR EVERY GROUP, NOT JUST LEADERSHIP.
                     This read `g.key === 'leadership' ? rowLeaderMap(...) : leaderMap`,
                     which was correct while OT, hospitality and cleanliness all
                     lived in groups that had no fallback anyway. The regroup moved
                     them into dt and fc, which DO have one, so the guard that was
                     written to keep them bare sat behind a gate none of them could
                     reach — NO_LEADER_COVER was dead code and every one of those
                     rows started printing a leader's name on a bare cell. Caught by
                     review before it shipped; four separate passes found it.
                     rowLeaderMap already returns `leaderMap` for anything it does
                     not special-case, so calling it unconditionally is identical for
                     every other row. */
                  leaderMap={rowLeaderMap(station.role)}
                  edit={edit}
                  onCell={(field, v) => onStation(idx, field, v)}
                  onDuty={(v) => onStation(idx, 'duty', v)}
                  onRole={(v) => onStation(idx, 'role', v)}
                  onDelete={() => onDeleteStation(idx)}
                  trainerSet={trainerSet} ranks={ranks} avatars={avatars} roles={roles}
                  leaderSets={leaderSets}
                />
              ))}
            </div>
            {edit && (
              <button
                onClick={() => onAddStation(g.key)}
                className="mt-2 flex items-center gap-1.5 text-[12px] font-bold rounded-lg px-2.5 py-1.5 border"
                style={{ borderColor: g.color, color: g.color }}
              >
                <Plus size={13} strokeWidth={3} />
                Add station to {g.label}
              </button>
            )}
          </div>
        );
      })}

      <Collapsible title="Staff on the clock" icon={<Users size={15} style={{ color: '#2563EB' }} />} defaultOpen={edit}>
        {edit ? (
          <textarea
            value={(data.roster || []).join('\n')}
            onChange={(e) => onRoster(e.target.value)}
            rows={10}
            className="w-full text-[16px] rounded-md border border-gray-300 px-2 py-1.5 text-gray-800 mt-1"
            placeholder={'Name 5:45-2\nName 11-5, 6-10'}
          />
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
            {(data.roster || []).map((r, i) => {
              const tag = roleTagOf(r, roles);
              return (
                <div key={i} className="text-[12px] font-semibold text-gray-700 truncate">
                  <BoardFace entry={r} avatars={avatars} />
                  {formatRosterEntry(r)}
                  {tag && <span className="text-[10px]" style={{ color: '#6B7280', fontWeight: 800 }}> · {tag}</span>}
                </div>
              );
            })}
          </div>
        )}
      </Collapsible>

      <Collapsible title="Trainers today" icon={<GraduationCap size={15} style={{ color: '#DB2777' }} />} defaultOpen={edit}>
        {edit ? (
          <textarea
            value={(data.trainers || []).join('\n')}
            onChange={(e) => onTrainers(e.target.value)}
            rows={6}
            className="w-full text-[16px] rounded-md border border-gray-300 px-2 py-1.5 text-gray-800 mt-1"
            placeholder="One trainer per line"
          />
        ) : (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(data.trainers || []).map((t, i) => {
              const tag = roleTagOf(t, roles);
              return (
                <span
                  key={i}
                  className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{ background: '#FCE7F3', color: '#9D174D' }}
                >
                  <BoardFace entry={t} avatars={avatars} size={16} />
                  {formatRosterEntry(t)}
                  {tag && <span style={{ opacity: 0.7, fontWeight: 700 }}> · {tag}</span>}
                </span>
              );
            })}
          </div>
        )}
      </Collapsible>
    </div>
  );
}

/* ============ BOH VIEW ============ */
function BOHView({ data, dateKey, edit, onStation, onRoster, onTrainers, onReminders, minors, canEdit, onMinors, onAddStation, onDeleteStation, ranks = null, roles = null, avatars = null, departed = null, staleFromArchive = [], moveOn = false, moveSel = null, onMoveTap = null }) {
  if (!data) return null;
  // `sections` is guarded; each section's `stations` needs it too — onAddBohStation
  // below does `stations = stations || []`, so the missing-key shape is real, and
  // an undefined in this list throws in the reduce on the next line.
  const allStations = (data.sections || []).flatMap((s) => s.stations || []);
  // Trainers render rose on BOH cells too — BOH had no trainer awareness at
  // all before Jul 24 2026 (Matt: "I don't think the BOH has it").
  const trainerSet = trainerSetOf(data.trainers);
  // Manual-edit tally for this BOH board (see FOHView for the rationale).
  const editCount = allStations.reduce((n, s) => n + (s._edits ? SHIFT_KEYS.filter((k) => s._edits[k]).length : 0), 0);
  const kitchenLead = extractLeaderShiftMap(allStations, (r) => /Kitchen Lead/i.test(r));
  const kitchenManager = extractLeaderShiftMap(allStations, (r) => /Kitchen Manager/i.test(r));
  /* ★ Same as the front: who is leading the kitchen this daypart, so the badge
     travels to whatever position they are covering. */
  const leaderSets = leaderSetsOf(kitchenLead, kitchenManager);
  const leaderMap = (() => {
    if (!kitchenLead && !kitchenManager) return null;
    const map = {};
    SHIFT_KEYS.forEach((k) => {
      map[k] = (kitchenLead && kitchenLead[k]) || (kitchenManager && kitchenManager[k]) || '';
    });
    return map;
  })();

  return (
    <div className="space-y-3">
      {/* Same errors-only check as FOH. BOH holds its stations inside sections,
          so the flattened list is what gets compared. */}
      {(() => {
        const hc = setupHeadcount({ roster: data.roster, stations: allStations, trainers: data.trainers }, departed, staleFromArchive);
        if (!hc || (!hc.missing.length && !hc.extra.length && !hc.gone.length)) return null;
        return (
          <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: '#FFF7ED', color: '#9A3412' }}>
            {hc.missing.length > 0 && (
              <div className="leading-snug">
                <span className="font-bold">On the clock, not on the board:</span>{' '}
                {hc.missing.join(', ')}
              </div>
            )}
            {hc.extra.length > 0 && (
              <div className="leading-snug" style={{ marginTop: hc.missing.length ? 3 : 0 }}>
                <span className="font-bold">On the board, not scheduled:</span>{' '}
                {hc.extra.join(', ')}
              </div>
            )}
            {hc.gone.length > 0 && (
              <div className="leading-snug" style={{ marginTop: 3, color: '#991B1B' }}>
                <span className="font-bold">No longer employed per HR:</span>{' '}
                {hc.gone.join(', ')}
                <span className="opacity-70"> — remove from the trainer list</span>
              </div>
            )}
          </div>
        );
      })()}
      <UncoveredBanner gaps={data.gaps} />
      {editCount > 0 && (
        <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold" style={{ background: '#FFF7ED', color: '#C2410C' }}>
          <Pencil size={12} /> {editCount} manual edit{editCount === 1 ? '' : 's'} on this board — highlighted below
        </div>
      )}
      <ComplianceBoard
        dateKey={dateKey}
        side="boh"
        roster={data.roster}
        minors={minors}
        accent="#7C3AED"
        canEdit={canEdit}
        onMinorsChange={onMinors}
      />

      {(data.sections || []).length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-[12.5px] text-gray-500">
          No sections on this board yet — unlock editing to build it, or use Import.
        </div>
      )}

      {/* ⚠️ THE SECTION INDEX `si` IS THE STORED ONE, so the rows are filtered
          INSIDE the map rather than the sections being filtered first — every
          edit handler writes back through si and idx. A section left with no
          positions renders nothing at all rather than a heading over a gap. */}
      {(data.sections || []).map((section, si) => {
        const color = bohSectionColor(section.name);
        // Regular BOH stations fall back to whichever of Kitchen Lead /
        // Kitchen Manager is on duty that period. Within the Leadership
        // section itself, Assistant Director stays bare if unfilled — but
        // Kitchen Lead and Kitchen Manager cross-cover each other, matching
        // the Google Sheet convention where those two rows are never left
        // bare: a blank Kitchen Lead cell borrows Kitchen Manager's name for
        // that period, and vice versa.
        /* The positions actually drawn, so the count on the band and the cards
           under it can never disagree, and an emptied section vanishes.
           ⚠️ NOT WHILE EDITING: a leader who unlocks the board to fix it must
           still see every section, or a section can never be added back to. */
        const shown = (section.stations || []).filter((st) => isPositionRow(st && st.role));
        if (!shown.length && !edit) return null;
        const isLeadershipSection = /leader/i.test(section.name);
        const rowLeaderMap = (role) =>
          /Kitchen Lead/i.test(role) ? kitchenManager : /Kitchen Manager/i.test(role) ? kitchenLead : null;
        return (
          <div key={si}>
            <SectionBand label={section.name} color={color} count={shown.length} />
            <div style={CARD_GRID}>
              {(section.stations || []).map((s, i) => (isPositionRow(s && s.role) ? (
                <StationCard
                  key={i}
                  station={s}
                  moveOn={moveOn}
                  isPicked={(k) => !!moveSel && moveSel.side === 'BOH' && moveSel.si === si && moveSel.idx === i && moveSel.k === k}
                  onMoveTap={(k) => onMoveTap && onMoveTap({ side: 'BOH', si, idx: i, k })}
                  accent={color}
                  accentSoft={hexToSoftBg(color)}
                  leaderMap={isLeadershipSection ? rowLeaderMap(s.role) : leaderMap}
                  edit={edit}
                  onCell={(field, v) => onStation(si, i, field, v)}
                  onDuty={(v) => onStation(si, i, 'duty', v)}
                  onRole={(v) => onStation(si, i, 'role', v)}
                  onDelete={() => onDeleteStation(si, i)}
                  trainerSet={trainerSet} ranks={ranks} avatars={avatars} roles={roles}
                  leaderSets={leaderSets}
                />
              ) : null))}
            </div>
            {edit && (
              <button
                onClick={() => onAddStation(si)}
                className="mt-2 flex items-center gap-1.5 text-[12px] font-bold rounded-lg px-2.5 py-1.5 border"
                style={{ borderColor: color, color }}
              >
                <Plus size={13} strokeWidth={3} />
                Add station to {section.name}
              </button>
            )}
          </div>
        );
      })}

      <Collapsible title="Staff on the clock" icon={<Users size={15} style={{ color: '#2563EB' }} />} defaultOpen={edit}>
        {edit ? (
          <textarea
            value={(data.roster || []).join('\n')}
            onChange={(e) => onRoster(e.target.value)}
            rows={10}
            className="w-full text-[16px] rounded-md border border-gray-300 px-2 py-1.5 text-gray-800 mt-1"
            placeholder={'Name 5-2\nName 2-11'}
          />
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
            {(data.roster || []).map((r, i) => {
              const tag = roleTagOf(r, roles);
              return (
                <div key={i} className="text-[12px] font-semibold text-gray-700 truncate">
                  <BoardFace entry={r} avatars={avatars} />
                  {formatRosterEntry(r)}
                  {tag && <span className="text-[10px]" style={{ color: '#6B7280', fontWeight: 800 }}> · {tag}</span>}
                </div>
              );
            })}
          </div>
        )}
      </Collapsible>

      <Collapsible title="Trainers today" icon={<GraduationCap size={15} style={{ color: '#DB2777' }} />} defaultOpen={edit}>
        {edit ? (
          <textarea
            value={(data.trainers || []).join('\n')}
            onChange={(e) => onTrainers(e.target.value)}
            rows={6}
            className="w-full text-[16px] rounded-md border border-gray-300 px-2 py-1.5 text-gray-800 mt-1"
            placeholder="One trainer per line"
          />
        ) : (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(data.trainers || []).map((t, i) => {
              const tag = roleTagOf(t, roles);
              return (
                <span
                  key={i}
                  className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{ background: '#FCE7F3', color: '#9D174D' }}
                >
                  <BoardFace entry={t} avatars={avatars} size={16} />
                  {formatRosterEntry(t)}
                  {tag && <span style={{ opacity: 0.7, fontWeight: 700 }}> · {tag}</span>}
                </span>
              );
            })}
          </div>
        )}
      </Collapsible>

      {/* ★★ REFERENCE, SO IT SITS UNDER THE BOARD. Matt, Aug 14 2026: "put the
          kitchen reminders and weights at the bottom."
          These two used to sit ABOVE the first section, which pushed PRIMARY —
          the thing a leader opens this screen to read — most of a phone screen
          down. Reminders and weights are things you check once and refer back
          to; the stations are what somebody is standing there holding an iPad
          for. Order by what the screen is FOR.
          ⚠️ MOVED, NOT CHANGED. Same markup, same edit path, same keys. The
          textarea in edit mode moved with it, so building a board and reading
          one keep these in the same place as each other. */}
      {edit ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-1.5 mb-1.5 text-amber-800 font-semibold text-[12px]">
            <AlertTriangle size={14} />
            Kitchen reminders — one per line
          </div>
          <textarea
            value={(data.reminders || []).join('\n')}
            onChange={(e) => onReminders(e.target.value)}
            rows={4}
            className="w-full text-[16px] rounded-md border border-amber-200 px-2 py-1.5 text-amber-900 bg-white"
          />
        </div>
      ) : (
        data.reminders &&
        data.reminders.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center gap-1.5 mb-1.5 text-amber-800 font-semibold text-[12px]">
              <AlertTriangle size={14} />
              Kitchen reminders
            </div>
            <ul className="space-y-0.5">
              {data.reminders.map((r, i) => (
                <li key={i} className="text-[11.5px] text-amber-900 leading-snug">
                  • {r}
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      {data.weights && data.weights.weights && (
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3">
          <div className="flex items-center gap-1.5 mb-1.5 font-semibold text-[12px] text-cyan-800">
            <Thermometer size={14} />
            Weights & Food Safety 5
          </div>
          <div className="text-[11.5px] text-cyan-900 leading-snug">{data.weights.weights}</div>
          {data.weights.foodsafety5 && (
            <div className="text-[11px] text-cyan-700/80 leading-snug mt-1">{data.weights.foodsafety5}</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============ IMPORT TAB ============
   No longer has its own mode toggle — it always imports into whichever
   source (Google Docs / Auto Assignment) is currently selected up top. */
/* ============ SURGICAL ROSTER PATCH — the dormant "Check for changes" flow ============
   NOT the daily path (that's applyImport, a full rebuild). This compares a fresh
   paste to the board ALREADY built for the day and touches only who changed:
   people who dropped get cleared from their cells; people who arrived (or whose
   hours moved) are surfaced as Extras to hand-place. It NEVER re-runs the engine
   and NEVER rewrites a cell belonging to someone whose shift didn't change, so the
   board can't reshuffle. Past dayparts (today only) are frozen. All pure + unit-
   tested; see the harness. */
function cellPrimaryTok(val) {
  const primary = stripCheck(val || '').split('→')[0].split('@')[0];
  const parts = primary.trim().split(/\s+/).filter(Boolean);
  return {
    first: (parts[0] || '').toLowerCase(),
    init: (parts[1] || '').replace(/[^a-z]/gi, '').slice(0, 1).toLowerCase(),
  };
}
// Match a roster full-name to a cell at the granularity the CELL provides:
// a bare-first cell ("Ana") matches on first name; a disambiguated cell
// ("Ashley R") requires the last-initial too. Mirrors cellIsTrainer — the same
// rule that fixed the false-trainer collision. NEVER bare-first when the cell
// carries an initial.
function personMatchesCell(name, val) {
  const p = (name || '').trim().split(/\s+/).filter(Boolean);
  const pf = (p[0] || '').toLowerCase();
  const pi = (p[1] || '').replace(/[^a-z]/gi, '').slice(0, 1).toLowerCase();
  const c = cellPrimaryTok(val);
  if (!pf || !c.first || c.first !== pf) return false;
  if (c.init) return c.init === pi;
  return true;
}
function handoffPartnerName(val) {
  const s = stripCheck(val || '');
  const i = s.indexOf('→');
  if (i < 0) return null;
  const after = s.slice(i + 1).replace(/\d.*$/, '').trim();
  return after || null;
}
function patchStations(dayData, side) {
  if (!dayData) return [];
  if (side === 'foh') return dayData.stations || [];
  return (dayData.sections || []).flatMap((sec) => sec.stations || []);
}
function splitRosterEntry(entry) {
  const m = (entry || '').match(/^(.*?)\s+(\d.*)$/);
  if (!m) return { name: (entry || '').trim(), sig: '' };
  return { name: m[1].trim(), sig: m[2].replace(/\s+/g, '') };
}
function diffRoster(oldEntries, newEntries) {
  const map = (arr) => {
    const o = {};
    (arr || []).forEach((e) => { const { name, sig } = splitRosterEntry(e); if (name) o[name.toLowerCase()] = { name, sig }; });
    return o;
  };
  const o = map(oldEntries), n = map(newEntries);
  const added = [], dropped = [], moved = [];
  Object.keys(n).forEach((k) => { if (!o[k]) added.push(n[k].name); else if (o[k].sig !== n[k].sig) moved.push(n[k].name); });
  Object.keys(o).forEach((k) => { if (!n[k]) dropped.push(o[k].name); });
  return { added, dropped, moved };
}
const PATCH_DP_END = { breakfast: 11, lunch: 14, mid: 17, night: 24 };
function pastDaypartKeys(isToday, now) {
  if (!isToday) return new Set();
  const h = now.getHours() + now.getMinutes() / 60;
  return new Set(SHIFT_KEYS.filter((k) => h >= PATCH_DP_END[k]));
}
// Remove one person from a cloned board, skipping frozen (already-past) dayparts.
// Clears a primary occupancy; un-chains a handoff where the person is the partner.
function clearPersonFromBoard(dayData, side, name, frozen) {
  patchStations(dayData, side).forEach((st) => {
    SHIFT_KEYS.forEach((k) => {
      if (frozen.has(k)) return;
      const v = st[k];
      if (!v) return;
      if (personMatchesCell(name, v)) {
        st[k] = '';
        st._edits = { ...(st._edits || {}), [k]: true };
      } else {
        const partner = handoffPartnerName(v);
        if (partner && personMatchesCell(name, partner)) {
          st[k] = stripCheck(v).split('→')[0].trim();
          st._edits = { ...(st._edits || {}), [k]: true };
        }
      }
    });
  });
}

function RosterPatchPanel({ proposal, onCancel, onApply }) {
  const LABEL = { add: ['+', 'arriving', '#0F766E'], move: ['~', 'hours changed', '#B45309'], drop: ['−', 'leaving', '#B91C1C'] };
  const active = proposal.sides.filter((s) => s.changes && s.changes.length);
  return (
    <div className="rounded-xl border-2 border-blue-200 bg-blue-50/40 p-3 space-y-2">
      <div className="text-[12px] font-bold text-gray-800">Proposed changes</div>
      {!proposal.hasChanges ? (
        <div className="text-[12px] text-gray-500">No changes — this paste matches the board already built for {proposal.impDay}.</div>
      ) : (
        <>
          {active.map((s) => (
            <div key={s.side} className="space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{s.side}</div>
              {s.changes.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-[12.5px]">
                  <span className="font-bold w-3 text-center" style={{ color: LABEL[c.t][2] }}>{LABEL[c.t][0]}</span>
                  <span className="font-semibold text-gray-900">{c.name}</span>
                  <span className="text-[11px] text-gray-500">{LABEL[c.t][1]}</span>
                </div>
              ))}
            </div>
          ))}
          {proposal.frozen && proposal.frozen.length > 0 && (
            <div className="text-[11px] text-gray-500">Already passed today, left as-is: {proposal.frozen.join(', ')}</div>
          )}
          <div className="text-[11px] text-gray-500 leading-snug">
            People leaving are cleared from their stations. People arriving or with changed hours go under “Additional — added today” for you to place. Nobody who stayed is moved.
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onApply} className="text-[13px] font-semibold text-white rounded-lg px-3.5 py-2" style={{ background: '#2563EB' }}>Apply changes</button>
            <button onClick={onCancel} className="text-[13px] font-semibold text-gray-600 rounded-lg px-3.5 py-2 border border-gray-300">Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}

function ImportTab({ canEdit, onRequestUnlock, onApply, onPropose, onApplyPatch, onUndo, hasUndo, defaultDay, weekStart, source }) {
  const [proposal, setProposal] = useState(null);
  const [day, setDay] = useState(defaultDay);
  const [target, setTarget] = useState('auto');
  const [text, setText] = useState('');
  const [rows, setRows] = useState(null);
  const [summary, setSummary] = useState('');
  const [pulling, setPulling] = useState(false);

  const preview = () => {
    setSummary('');
    setRows(parseImportText(text));
  };

  /* ★ PULL THE WEEK THE SCHEDULE TILE BUILT, instead of pasting a report.
     ⚠️ IT ONLY FILLS `rows`. It does not apply anything, exactly like Preview,
     so Check for changes and Rebuild behave identically whether the rows came
     from a paste or from here. The one destructive action stays the one button
     it has always been.
     ⚠️ SILENT ON AN EMPTY WEEK IS NOT AN OPTION. A leader who presses this and
     sees nothing happen will press Rebuild on stale rows. No schedule, or a
     schedule with nothing on that day, says so and leaves `rows` alone. */
  const pullSchedule = async () => {
    /* ⛔ THE REAL LOCK. See HUB_SCHEDULE_PULL_READY at the top of this file.
       It refuses HERE, before the read, so clearing the button's `disabled`
       attribute in a browser buys nothing. */
    if (!HUB_SCHEDULE_PULL_READY) {
      setSummary('The Hub schedule is still being built. Paste the HotSchedules lines for now.');
      return;
    }
    setPulling(true);
    setSummary('');
    try {
      const sched = await kvGet(scheduleKey(weekStart));
      if (!sched || !sched.days) {
        setSummary(`No Hub schedule saved for the week of ${weekStart}. Build and save it in the Schedule tool first.`);
        return;
      }
      const next = scheduleRowsFor(sched, day);
      if (!next.length) {
        setSummary(`The Hub schedule for the week of ${weekStart} has nobody on ${day}.`);
        return;
      }
      setRows(next);
      setSummary(`Loaded ${next.length} from the Hub schedule for ${day}. Check it, then Rebuild.`);
    } catch {
      setSummary('Could not read the Hub schedule. Try again.');
    } finally {
      setPulling(false);
    }
  };

  const destination = (p) => {
    if (target === 'foh') return 'FOH roster';
    if (target === 'boh') return p.section ? `BOH · ${p.section}` : 'BOH roster only';
    return p.section ? `BOH · ${p.section}` : 'FOH roster';
  };

  if (!canEdit) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
        <Lock size={20} className="mx-auto mb-2 text-gray-400" />
        <div className="text-[13px] font-semibold text-gray-700 mb-1">Import is locked</div>
        <div className="text-[12px] text-gray-500 mb-3">
          Ask a Team Leader or Director to unlock editing to import a schedule.
        </div>
        <button
          onClick={onRequestUnlock}
          className="text-[13px] font-semibold text-white rounded-lg px-3.5 py-2"
          style={{ background: ACCENT }}
        >
          Unlock editing
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold" style={{ background: source === 'auto' ? '#EFF6FF' : '#F0FDFA', color: source === 'auto' ? '#2563EB' : ACCENT }}>
        Importing into: {SOURCE_LABEL[source]} {source === 'auto' ? '— a separate draft board, the Google Docs board is untouched' : '— this replaces that day\'s live roster'}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2.5">
        {source === 'auto' && (
          <div className="text-[11px] text-gray-500 leading-snug">
            {/* ⚠️ TWO THINGS IN THIS SENTENCE WERE THIS STORE'S AND NOT THE HUB'S,
                and the second store found both first — their wording is adopted
                here so the two files converge rather than drift.
                "Denise lands in Cleanliness/Hospitality only" named one of our own
                people as if it were a rule of the engine. The rule is real and it
                is per-store: the engine reads the lock lists under owners.board,
                which are empty at a store that has not set any. So it is stated as
                the rule now, which is true everywhere including here.
                "Verified against the Google Sheets" was a claim about OUR
                spreadsheet. It is true here and false in every clone, and it tells
                a reader nothing they can act on, so it is gone rather than left as
                one more line somebody has to remember to delete. */}
            Every import rebuilds the day's stations from the locked templates, then fills them: shift blocks matched to each position, trainers spread across OT captain, drinks, window, bagging, then fill by job skill. One DT + one FC leader per period. Anyone given a station lock in Store Settings only ever lands on those stations. Breaks are pre-assigned within the allowed windows (7-10:30 AM and 1:30-9:30 PM), in clock-in order — whoever has been on the floor longest goes first.
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-700">
            Day
            <select value={day} onChange={(e) => setDay(e.target.value)} className="text-[16px] rounded-md border border-gray-300 px-2 py-1.5 bg-white">
              {DAYS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-700">
            Target
            <select value={target} onChange={(e) => setTarget(e.target.value)} className="text-[16px] rounded-md border border-gray-300 px-2 py-1.5 bg-white">
              <option value="auto">Auto (split by job code)</option>
              <option value="foh">FOH only</option>
              <option value="boh">BOH only</option>
            </select>
          </label>
        </div>
        {/* ★ The shared paste-box look (Matt, Aug 8 2026: "the pase boxes dont
            stand out with color"). This was a grey hairline on white, on the
            single loudest import surface in the app.
            ⚠️ fontSize 16 IS KEPT AND MUST BE. The Tailwind class this replaces
            said `text-[16px]` deliberately: iOS Safari zooms the whole page when
            you focus an input under 16px, and index.html leaves pinch-zoom on by
            design. importZone() ships 12px, which is right for the desktop boxes
            and wrong here, where leaders paste on a store iPad mid-shift. */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          style={{ ...importZone(), fontSize: 16 }}
          placeholder={'Paste the HotSchedules lines here…\nSmith, Alex 5:00a-2:00p Breader\nJordan 8:30-5 Prep'}
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={preview}
            className="text-[13px] font-semibold text-white rounded-lg px-3.5 py-2"
            style={{ background: ACCENT }}
          >
            Preview
          </button>
          {/* ★ The other way in. Same destination as Preview — it fills `rows`
              and nothing else — so everything downstream is untouched.
              ⛔ LOCKED until the scheduling platform is trusted. The greying is
              the sign, not the gate; `pullSchedule` refuses on its own. */}
          <button
            onClick={pullSchedule}
            disabled={pulling || !HUB_SCHEDULE_PULL_READY}
            title={HUB_SCHEDULE_PULL_READY ? undefined : 'The Hub schedule is still being built'}
            className="flex items-center gap-1.5 text-[13px] font-semibold rounded-lg px-3.5 py-2 border-2 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              borderColor: HUB_SCHEDULE_PULL_READY ? ACCENT : '#9CA3AF',
              color: HUB_SCHEDULE_PULL_READY ? ACCENT : '#6B7480',
            }}
          >
            {HUB_SCHEDULE_PULL_READY ? <RefreshCw size={14} /> : <Lock size={14} />}
            {!HUB_SCHEDULE_PULL_READY
              ? 'Use the Hub schedule · coming soon'
              : (pulling ? 'Reading…' : 'Use the Hub schedule')}
          </button>
          {rows && rows.length > 0 && (
            <>
              <button
                onClick={async () => { setProposal(null); setSummary(await onApply(day, target, rows, source)); }}
                className="flex items-center gap-1.5 text-[13px] font-semibold text-white rounded-lg px-3.5 py-2"
                style={{ background: '#C2410C' }}
              >
                <Upload size={14} />
                Rebuild {day}
              </button>
              <button
                onClick={() => { setSummary(''); setProposal(onPropose(day, target, rows)); }}
                className="text-[13px] font-semibold rounded-lg px-3.5 py-2 border-2"
                style={{ borderColor: '#2563EB', color: '#2563EB' }}
              >
                Check for changes
              </button>
            </>
          )}
        </div>
        {rows && rows.length > 0 && (
          <div className="text-[11px] text-gray-500 leading-snug">
            <b>Rebuild</b> replaces the whole day from this paste and wipes hand edits. <b>Check for changes</b> keeps the day and only clears who left and lists who arrived — nobody who stayed moves.
          </div>
        )}
        {summary && <div className="text-[12px] font-semibold text-emerald-700">{summary}</div>}
        {proposal && (
          <RosterPatchPanel
            proposal={proposal}
            onCancel={() => setProposal(null)}
            onApply={() => { setSummary(onApplyPatch(proposal)); setProposal(null); }}
          />
        )}
        {hasUndo && (
          <button onClick={onUndo} className="text-[12px] font-semibold text-gray-600 underline self-start">
            Undo last change
          </button>
        )}
      </div>

      {rows && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-[12px] font-bold text-gray-800 mb-2">
            Preview — {rows.length} {rows.length === 1 ? 'person' : 'people'} parsed
          </div>
          {rows.length === 0 ? (
            <div className="text-[12px] text-gray-400">
              Nothing parsed. Each line needs a name followed by a time like 5-2 or 5:00a-2:00p.
            </div>
          ) : (
            <div className="space-y-1">
              {rows.map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5">
                  <div className="min-w-0">
                    <span className="text-[12.5px] font-bold text-gray-900">{p.name}</span>
                    <span className="text-[11px] text-gray-500"> · {p.hours.toFixed(1)}h</span>
                    <div className="text-[11px] text-gray-500 leading-snug">
                      {(p.blocks && p.blocks.length
                        ? p.blocks
                        : p.ranges.map((r) => ({ ...r, job: p.job }))
                      )
                        .map((b) => `${fmtClock(b.start)}-${fmtClock(b.end)}${b.job ? ` ${b.job}` : ''}`)
                        .join('  ·  ')}
                    </div>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                    style={
                      destination(p).startsWith('BOH')
                        ? { background: '#FFEDD5', color: '#9A3412' }
                        : { background: '#F0FDFA', color: '#0F766E' }
                    }
                  >
                    {destination(p)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============ PIN MODAL ============ */
function PinModal({ onClose, onUnlock }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!pin.trim() || busy) return;
    setBusy(true);
    setErr('');
    const res = await checkEditPin(pin.trim());
    setBusy(false);
    if (res && res.ok) {
      onUnlock(res);
    } else if (res && res.isDefault) {
      setErr('1234 is the shared default — open your file in the HR Console and set a personal PIN first.');
    } else if (res && res.dup) {
      setErr('That PIN is registered to more than one person — reset it in the HR Console.');
    } else if (res && res.locked) {
      /* The gate is rate-limited now. Without this the message would read
         "PIN not recognized", which is the same lie that cost an hour this
         morning — a lockout and a typo must not look identical. */
      setErr(`Too many incorrect PINs. Try again in about ${res.retryAfterMin} minutes.`);
    } else if (res && res.needName) {
      setErr('Sign in on the main screen first, then come back and edit the board.');
    } else if (res && res.noStore) {
      setErr("Couldn't check that PIN — check your connection and try again.");
    } else if (res && res.tooLow) {
      setErr(`That PIN belongs to ${res.name} (${res.role}) — editing needs Team Leader and up.`);
    } else {
      setErr('PIN not recognized. Personal PINs are set in your HR Console file.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(17,24,39,0.5)' }}>
      <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center gap-2 mb-1">
          <Lock size={16} style={{ color: ACCENT }} />
          <div className="text-[15px] font-bold text-gray-900">Unlock editing</div>
        </div>
        <div className="text-[12px] text-gray-500 mb-3">Enter your personal PIN. Team Leader and up can edit setups.</div>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="w-full text-[18px] tracking-widest text-center rounded-lg border border-gray-300 px-3 py-2 mb-2"
          placeholder="••••"
        />
        {err && <div className="text-[11.5px] text-red-600 mb-2">{err}</div>}
        <div className="flex gap-2">
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 text-[13px] font-semibold text-white rounded-lg py-2"
            style={{ background: ACCENT, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? 'Checking…' : 'Unlock'}
          </button>
          <button onClick={onClose} className="text-[13px] font-semibold text-gray-500 rounded-lg py-2 px-3 border border-gray-200">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============ PRINT SHEET ============ */
function PrintSheet({ tab, day, foh, boh, weekDates, source }) {
  if (tab === 'IMPORT') return null;
  const isFoh = tab === 'FOH';
  const data = isFoh ? foh && foh[day] : boh && boh[day];
  if (!data) return null;
  const groups = isFoh
    ? groupFOHStations((data.stations || []).filter((st) => isPositionRow(st && st.role)))
        .map((g) => ({ name: g.label, stations: g.items.map((it) => it.station) }))
    : (data.sections || []);
  const cell = { border: '1px solid #999', padding: '3px 5px', verticalAlign: 'top' };
  return (
    <div className="ds-print">
      <h1 style={{ fontSize: '16px', margin: 0, fontWeight: 700 }}>
        {STORE.name} — {isFoh ? 'Front of House' : 'Back of House'} Setup · {day} {weekDates && weekDates[day] ? weekDates[day] : ''} · {SOURCE_LABEL[source]}
      </h1>
      <div style={{ fontSize: '10px', color: '#555', margin: '2px 0 8px' }}>Printed {new Date().toLocaleString()}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
        <thead>
          <tr>
            {['Station', 'Breakfast', 'Lunch', 'Mid', 'Night', 'Duty'].map((h, i) => (
              <th key={h} style={{ ...cell, background: '#eee', textAlign: 'left', width: i === 0 ? '22%' : i === 5 ? '22%' : undefined }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <React.Fragment key={g.name}>
              <tr>
                <td colSpan={6} style={{ ...cell, background: '#ddd', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {g.name}
                </td>
              </tr>
              {(g.stations || []).map((s, i) => (
                <tr key={i}>
                  <td style={{ ...cell, fontWeight: 600 }}>{s.role}</td>
                  {SHIFT_KEYS.map((k) => (
                    <td key={k} style={cell}>
                      {s[k]}
                    </td>
                  ))}
                  <td style={cell}>{s.duty}</td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      {!isFoh && data.reminders && data.reminders.length > 0 && (
        <div style={{ fontSize: '10px', marginTop: '8px' }}>
          <b>Reminders:</b> {data.reminders.join('  ·  ')}
        </div>
      )}
      <div style={{ fontSize: '10px', marginTop: '6px', columns: 3 }}>
        <b>On the clock:</b>
        {(data.roster || []).map((r, i) => (
          <div key={i}>{formatRosterEntry(r)}</div>
        ))}
      </div>
    </div>
  );
}

const printCss = `
  .ds-print { display: none; }
  @media print {
    @page { size: landscape; margin: 10mm; }
    .ds-noprint { display: none !important; }
    .ds-print { display: block !important; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
  }
`;

/* ============ MAIN TILE ============
   `initialDay` (optional) — which board day to open on. App.jsx's landing
   quick-action chip passes it so the chip can point at TOMORROW's board in
   the evening, once today's setup has already been run. Without it the tile
   opens on today, exactly as before.

   It also fixes a Sunday bug: DAYS is Mon–Sat, so on a Sunday `todayName` is
   "Sunday", `DAYS.includes` is false, and the day state silently fell back to
   "Monday" — while the landing chip still read "Sunday stations". The chip now
   sends "Monday" explicitly and the two agree. Anything not in DAYS is ignored
   here, so a bad value can never break the board. */
/* ============ YOU TODAY ============ */
/* ★ THE CARD THAT STOPS THE SCROLLING (Daisy via Matt, Aug 5 2026: "the team is
   scrolling too much"). FOH Monday carries 25 station cards against a 31-person
   roster. Someone opening this tool almost always wants ONE row about
   themselves, and 70 different people opened it in the last 10 days, which
   makes it the most-used tool in the Hub by a distance. This answers that at
   the top and leaves the board underneath exactly as it was.

   ⚠️ IT NEVER GUESSES A STATION. myDayOnBoard hands back `sharedWith` when the
   viewer's first name belongs to more than one person on that side, and this
   renders the reason instead of a row. Telling Adriana she is on
   Adriana Arias Hurtado's station is worse than making her scroll, because she
   would believe it and go and stand there.

   ⚠️ BOTH SIDES, WHATEVER TAB IS OPEN. One person can be FOH breakfast and BOH
   evening on the same day, so showing only the tab they happen to be looking at
   hides half their day. Both boards are already in state, so this costs no
   extra board read.

   Breaks come from the same per-side, per-date key the compliance board writes,
   and that map is keyed by FULL name, so it stays exact even for the first
   names this card refuses to resolve. */
/* ⚠️ `tabColors` IS A PROP, NOT A MODULE CONSTANT. TAB_COLORS is declared
   inside DailySetup, so naming it here would be an unbound identifier at module
   scope — a card that renders blank or takes the tool down. Passing the same
   object in keeps ONE definition of the two side colours; copying the hex
   values up here is how the board and this card start disagreeing about which
   orange BOH is. */
function YouToday({ viewerName, day, dateKey, fohDay, bohDay, tabColors }) {
  const [breaks, setBreaks] = useState(null);

  const sides = useMemo(() => {
    const tc = tabColors || {};
    const out = [];
    const f = myDayOnBoard(fohDay, viewerName);
    if (f) out.push({ side: 'FOH', label: 'Front of House', tint: tc.FOH || '#14243D', ...f });
    const b = myDayOnBoard(bohDay, viewerName);
    if (b) out.push({ side: 'BOH', label: 'Back of House', tint: tc.BOH || '#C2410C', ...b });
    return out;
  }, [fohDay, bohDay, viewerName, tabColors]);

  const anySide = sides.length > 0;

  useEffect(() => {
    let cancelled = false;
    setBreaks(null);
    if (!dateKey || !anySide) return undefined;
    (async () => {
      const [f, b] = await Promise.all([
        readKV(`gcfcr-dailysetup-breaks2-foh-${dateKey}`),
        readKV(`gcfcr-dailysetup-breaks2-boh-${dateKey}`),
      ]);
      if (cancelled) return;
      setBreaks({ FOH: f || {}, BOH: b || {} });
    })();
    return () => { cancelled = true; };
  }, [dateKey, anySide]);

  /* Keyed by full name, but compared through normName so a stray double space
     or an accent cannot silently drop somebody's break. */
  const breakTimes = (side, fullName) => {
    const map = breaks && breaks[side];
    if (!map) return [];
    const want = normName(fullName);
    const hit = Object.keys(map).find((k) => normName(k) === want);
    const v = hit ? map[hit] : null;
    return Array.isArray(v) ? v.filter(Boolean) : [];
  };

  // Not signed in, or the boards have not landed yet. Say nothing rather than
  // flash "you are not on the board" at somebody who is.
  if (!viewerName) return null;
  if (!fohDay && !bohDay) return null;

  if (!anySide) {
    /* ⚠️ ONE QUIET LINE, NOT A CARD. This was a full raised card with a heading
       and a second line of explanation, which gave the biggest block on the
       page to the least useful message — and directors are off the board most
       days, so it is the message they see most often. The information is worth
       one line; it is not worth the top of the screen. */
    return (
      <div className="text-[12px] text-gray-400 mb-3 px-1">
        Not on the {day} board. If that looks wrong, the board may not be imported yet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border px-4 py-3 mb-4"
      style={{ borderColor: '#E8EAE7', background: cardSurface('#14243D', 0.3), ...accentEdge('#14243D', 3), boxShadow: CARD_3D }}>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="text-[13px] font-extrabold" style={{ color: '#14243D' }}>You today</div>
        <div className="text-[11.5px] font-semibold text-gray-500">{day}</div>
      </div>

      {sides.map((s) => {
        const brk = breakTimes(s.side, s.name);
        return (
          <div key={s.side} className="mb-2 last:mb-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
              <span className="text-[10.5px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full"
                style={{ background: s.tint, color: '#fff' }}>{s.label}</span>
              {s.hours && <span className="text-[12.5px] font-bold text-gray-800">{s.hours}</span>}
              {brk.length > 0 && (
                <span className="text-[11.5px] font-semibold text-violet-700">
                  Break {brk.join(', ')}
                </span>
              )}
            </div>

            {s.blocked ? (
              /* ⚠️ The honest answer, not a guessed one. See myDayOnBoard. */
              <div className="text-[12px] text-amber-800 rounded-lg px-2.5 py-1.5"
                style={{ background: '#FEF6E7', border: '1px solid #F3D6C4' }}>
                More than one <b>{nameParts(s.name)[0]}</b> is on the {s.label} board today
                {s.sharedWith.length === 1 ? ` (you and ${s.sharedWith[0]})` : ''}, so the Hub
                cannot tell which stations are yours. Check the board below.
              </div>
            ) : s.spots.length === 0 ? (
              <div className="text-[12px] text-gray-500">
                On the roster with no station assigned yet.
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {s.spots.map((sp, i) => (
                  <div key={`${sp.shift}-${sp.station}-${i}`}
                    className="flex flex-wrap items-baseline gap-x-2 rounded-lg px-2.5 py-1.5"
                    style={{ background: '#fff', border: '1px solid #EEF0F3' }}>
                    <span className="text-[10.5px] font-extrabold uppercase text-gray-400 w-14 shrink-0">
                      {SHIFT_LABELS[sp.shift] || sp.shift}
                    </span>
                    <span className="text-[13px] font-bold text-gray-900">{sp.station}</span>
                    {sp.time && <span className="text-[12px] font-semibold" style={{ color: s.tint }}>{sp.time}</span>}
                    {sp.duty && <span className="text-[11px] font-semibold text-gray-500 uppercase">{sp.duty}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function DailySetup({ initialDay, onOpenTool, user }) {
  const todayName = useMemo(() => {
    const map = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return map[new Date().getDay()];
  }, []);

  const [weekOffset, setWeekOffset] = useState(0); // 0 = current board week · 1 = next week
  const weekStart = useMemo(() => boardWeekStart(weekOffset), [weekOffset]);
  const weekDates = useMemo(() => weekDatesOf(weekStart), [weekStart]);

  const [tab, setTabState] = useState('FOH');
  const [day, setDayState] = useState(
    DAYS.includes(initialDay) ? initialDay : DAYS.includes(todayName) ? todayName : 'Monday'
  );
  // Google Docs board was removed — Auto Assignment is the only board now.
  const boardSource = 'auto';

  /* ★★ ONE-LEVEL UNDO, AND IT NOW COVERS APPLY AS WELL AS THE SURGICAL PATCH
     (Matt, Aug 12 2026, after applying a full Auto Assignment to the wrong
     day). The patch had an undo from the day it shipped; Apply — the bigger,
     more destructive of the two, which rebuilds a whole day — had none. Same
     button, same shape of mistake, no way back.

     ⚠️ IT HOLDS THE BREAK PLANS TOO, and that is not tidiness. Apply writes
     three records per side: the week store and the day's breaks. An undo that
     put the board back and left the wrong day's break plan underneath it would
     look like it worked and leave the day half-reverted, which is worse than
     no undo at all because nobody would go and check.

     ⚠️ ONE SLOT FOR BOTH PATHS, ON PURPOSE. Two undo stacks would mean two
     buttons and a leader having to know which kind of change they made
     (design rule 8). Whichever happened last is what comes back.

     Shape: { impDay, what, foh, boh, breaks: [{ key, value }] } */
  const [lastUndo, setLastUndo] = useState(null);

  // Food safety walkthrough rota — see FS_ROTA_KEY at the top of this file.
  const [fsRota, setFsRota] = useState(null);
  const [fsRanks, setFsRanks] = useState({});
  const [fsRoles, setFsRoles] = useState({}); // name-key -> HR title, trainers and up
  const [avatars, setAvatars] = useState({}); // normName(full name) -> Slack photo URL (same map HR Console renders)
  /* 'grid' = the four-across board leaders have always used. 'compact' = one
     line per station (Daisy via Matt, Aug 5 2026: "the leaders want a more
     condensed view for the whole day and shift too").

     🐛 THIS NOTE SAID "COMPACT IS THE DEFAULT NOW" AND IT WAS NEVER TRUE.
     `LAYOUTS[0][0]` is and has always been 'grid', and that is the only place a
     default is decided, so a first-time leader has always opened on Board. The
     line is corrected rather than deleted because a stale comment is what the
     next reader trusts — this file says so about three other blocks.

     ⚠️ 'position' IS GONE (Aug 14 2026, "i want this new view and compact
     only"). Anyone who chose it still has that word in localStorage, and the
     initialiser below already validates against LAYOUTS, so they fall back to
     Board rather than to a blank screen. Design rule 1, and the guard predates
     the removal.

     ⚠️ THE CHOICE IS REMEMBERED PER DEVICE, which is why "default" only ever
     decides somebody's FIRST visit. Anyone who taps Compact once gets Compact
     every time after, so nothing changes under a leader mid-rush.
     localStorage, not KV: it is a per-device reading preference, not store
     data, so it must never travel between people or need a network round trip
     to render the first paint. A blocked or full localStorage just falls back
     to the default, which is why every access is wrapped. */
  const [layout, setLayout] = useState(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_KEY);
      return LAYOUTS.some(([v]) => v === saved) ? saved : LAYOUTS[0][0];
    } catch { return LAYOUTS[0][0]; }
  });
  const setLayoutSticky = (v) => {
    setLayout(v);
    try { localStorage.setItem(LAYOUT_KEY, v); } catch { /* private mode, fine */ }
  };

  /* ★ THE SHIFT FILTER STARTS ON THE ONE THAT IS RUNNING, BUT ONLY FOR TODAY.
     Opening on the live shift is right when you are working the floor. It is
     wrong when you are planning: building Thursday's board at 8pm would open
     on Night and show a filtered day. Running a shift and planning a day are
     different jobs, so any day that is not today opens on All. */
  const [shift, setShift] = useState('all');
  useEffect(() => {
    const isToday = weekOffset === 0 && day === todayName;
    setShift(isToday ? (currentShiftKey() || 'all') : 'all');
  }, [day, weekOffset, todayName]);
  // Names HR says have left — see departedNameKeys.
  const [departedSet, setDepartedSet] = useState([]);
  /* ⚠️ ASKED FOR, NOT SHIPPED. The board used to carry 517 former-employee
     names in the bundle so it could spot a stale one. It now sends the names
     written on TODAY'S board to /api/stale-check and gets back which of those
     have left — nothing about anyone else ever reaches the device.
     ⚠️ EMPTY ON ANY FAILURE, which reads as "no stale names". Matt: "skip the
     warning silently." The board is what a leader needs at 5am, and the hint is
     not worth a line of noise every time the store wifi blinks. */
  const [staleSet, setStaleSet] = useState([]);
  useEffect(() => { (async () => {
    /* ⚠️ THE ROSTER IS AWAITED FIRST AND ASSIGNED BEFORE ANYTHING READS IT.
       fsRankByName and departedNames both walk the roster the moment they are
       called, so filling LIVE_TEAM afterwards would rank and check this run
       against the frozen seed and only come right on some later render. */
    const [team, rota, roles, hrStatus, av] = await Promise.all([
      loadHRTeam(), readKV(FS_ROTA_KEY), readKV(ROLES_KEY), readKV(HR_STATUS_KEY),
      readKV('hr:slack-avatars:v1'),
    ]);
    if (Array.isArray(team) && team.length) LIVE_TEAM = team;
    setFsRota(rota && typeof rota === 'object' ? rota : { assigned: {}, lastBy: {} });
    setFsRanks(fsRankByName(roles || {}));
    setFsRoles(fsRoleByName(roles || {}));
    setDepartedSet(departedNames(hrStatus || {}));
    // Display-only: the same worker-cached Slack photo map HR Console renders.
    // A failed read just means chips show names alone, exactly like today.
    const slackRaw = av && av.byName && typeof av.byName === 'object' ? av.byName : {};
    /* ⚠️ RE-KEYED FOR THE BOARD, not used raw. The map arrives keyed on full
       names; the board writes first names. fsAvatarByName spreads each photo
       across the same three keys the role badges use, which is why the badges
       have always resolved and the photos have not. A raw Slack display name
       that IS a first name still works — but only when exactly one person on
       the roster answers to it. See fsPhotoMap for the bug that rule fixes. */
    const slackByName = fsPhotoMap(slackRaw);
    setAvatars(slackByName);

    /* ★ HUB-UPLOADED PHOTOS FILL THE GAP, UNDER SLACK (Matt, Aug 3 2026:
       "slack is priority but add the upload photo option"). Measured: 62 of 99
       Slack accounts carry a photo, so 37 people showed as initials on every
       screen with no way to change it from inside the Hub.
       ⚠️ SLACK SPREADS LAST, so it wins any name present in both. To flip the
       precedence, swap the two spreads — that is the only line that decides it.
       ⚠️ SEPARATE AND LATER ON PURPOSE. The board must not wait on this: a slow
       or failed photo call would delay the whole setup opening, and faces are
       the least important thing on it. Names render first, pictures fill in.

       🐛🐛 IT WAS SPREAD RAW AND THEREFORE NEVER MATCHED A SINGLE CELL. Matt,
       Aug 14 2026: "they still need their profile pick instead of initials."

       `/api/hub-photos` answers keyed on the SQUASHED FULL NAME — "silastuggy",
       because that is what /api/my-photo writes. The board writes FIRST names
       into cells: "Silas T". So the lookup asked for "silast" and "silas",
       neither of which is in that map, and everybody who uploaded their own
       photo in the Hub drew initials on every board. The Slack map never had
       this problem only because it goes through `fsPhotoMap` two lines up.

       ⇒ SAME TREATMENT FOR BOTH MAPS. `fsPhotoMap` walks the roster, matches
       each person by their squashed full name and re-registers the photo under
       every name key that person alone answers to — which is exactly the shape
       the cells ask for. It also drops keys two people share, so a shared first
       name still falls back to initials rather than drawing the wrong face.
       ⚠️ Design rule 8, the reason this is a call and not a second loop: one
       answer to "which name keys does this photo belong to", used by both. */
    try {
      const r = await fetch('/api/hub-photos', { headers: { 'x-hub-token': hubToken() }, cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        if (d && d.ok && d.byName && typeof d.byName === 'object') {
          setAvatars({ ...fsPhotoMap(d.byName), ...slackByName });
        }
      }
    } catch { /* no Hub photos, Slack map already in place */ }
  })(); }, []);

  const [fohAutoData, setFohAutoData] = useState(null); // independent Auto Assignment draft
  const [loadFailed, setLoadFailed] = useState(false);  // the board read did not reach the database
  const [reloadTick, setReloadTick] = useState(0);      // bumped by "Try again"; re-runs the board load
  const [bohAutoData, setBohAutoData] = useState(null);

  const [minors, setMinors] = useState([]);
  const [hrRoles, setHrRoles] = useState({});
  const [unlocked, setUnlocked] = useState(null); // { name, role } after PIN
  const [showPin, setShowPin] = useState(false);
  const [pendingEdit, setPendingEdit] = useState(false);
  const [draft, setDraft] = useState(null); // { side, day, source, data }
  const [toast, setToast] = useState('');
  const [histTick, setHistTick] = useState(0); // bumped on save → History panel refetches

  // Who may SEE the edit history. Director and up, identified by the PIN they
  // already unlock editing with — DailySetup takes no session/tier prop, and
  // `unlocked` carries { name, role } straight from checkEditPin. Attribution
  // exists because setups were being deleted and Matt needs to know who; the
  // director gate keeps it an answer for him rather than a scoreboard the whole
  // team reads while leaders hand-fix boards on instruction.
  const showEditors = !!unlocked && rankOfRole(unlocked.role) >= 5;

  useEffect(() => {
    let cancelled = false;
    setFohAutoData(null);
    setBohAutoData(null);
    setLoadFailed(false);
    setDraft(null);
    (async () => {
      // Auto Assignment drafts seed straight from the LOCKED station
      // templates — they don't depend on the live Sheet or last week.
      const [m, roles] = await Promise.all([
        readKV(MINORS_KEY),
        readKV(ROLES_KEY),
      ]);
      if (cancelled) return;
      if (m) setMinors(m);
      if (roles) setHrRoles(roles);

      const [fa, ba] = await Promise.all([
        loadAutoDraftBoard('foh', weekStart),
        loadAutoDraftBoard('boh', weekStart),
      ]);
      if (cancelled) return;
      /* Either side failing means the boards on screen would be a guess, so
         neither is shown. Silence here is what let a bad read look normal. */
      if (fa.failed || ba.failed) { setLoadFailed(true); return; }
      setFohAutoData(fa.data);
      setBohAutoData(ba.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [weekStart, reloadTick]);

  // Live Sheet mirror: fetch the current day/side whenever the Google Docs
  // source is showing (current week only — the Sheet holds this week's tabs).
  const dateLabel = useMemo(
    () => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    []
  );

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  };

  async function persistBoard(side, store, source) {
    const ok = await writeKV(weekKey(side, weekStart, source), store);
    if (!ok) flash("Couldn't save — check connection and try again");
  }

  const guardDraft = () => !draft || window.confirm('Discard unsaved edits?');
  const setDay = (d) => {
    if (!guardDraft()) return;
    setDraft(null);
    setDayState(d);
  };
  const setTab = (t) => {
    if (!guardDraft()) return;
    setDraft(null);
    setTabState(t);
  };
  const setWeek = (offset) => {
    if (offset === weekOffset) return;
    if (!guardDraft()) return;
    setDraft(null);
    setWeekOffset(offset);
  };

  // Google Docs board removed — Auto Assignment is the only board, always
  // editable.
  const activeFoh = fohAutoData;
  const activeBoh = bohAutoData;
  const canEditSource = true;

  function beginEdit() {
    if (!canEditSource) return;
    const store = tab === 'FOH' ? activeFoh : activeBoh;
    if (tab === 'IMPORT' || !store || !store[day]) return;
    setDraft({ side: tab, day, source: boardSource, data: JSON.parse(JSON.stringify(store[day])) });
  }
  function requestEdit() {
    if (draft || !canEditSource) return;
    if (!unlocked) {
      setPendingEdit(true);
      setShowPin(true);
      return;
    }
    beginEdit();
  }
  function handleUnlock(res) {
    setUnlocked(res);
    setShowPin(false);
    flash(`Unlocked — ${res.name}`);
    if (pendingEdit) {
      setPendingEdit(false);
      const store = tab === 'FOH' ? activeFoh : activeBoh;
      if (canEditSource && tab !== 'IMPORT' && store && store[day]) {
        setDraft({ side: tab, day, source: boardSource, data: JSON.parse(JSON.stringify(store[day])) });
      }
    }
  }

  const mutateDraft = (fn) =>
    setDraft((d) => {
      if (!d) return d;
      const data = JSON.parse(JSON.stringify(d.data));
      fn(data);
      return { ...d, data };
    });

  function saveDraft() {
    if (!draft) return;
    // Only the Auto Assignment (KV) board is editable; the Google Docs board
    // is a read-only live mirror and never reaches here.
    if (draft.source !== 'auto') { setDraft(null); return; }
    const clean = JSON.parse(JSON.stringify(draft.data));
    clean.roster = (clean.roster || []).map((s) => s.trim()).filter(Boolean);
    if (clean.trainers) clean.trainers = clean.trainers.map((s) => s.trim()).filter(Boolean);
    if (clean.reminders) clean.reminders = clean.reminders.map((s) => s.trim()).filter(Boolean);
         if (clean.additional) clean.additional = clean.additional.filter((s) => (s.role || '').trim());

    if (draft.side === 'FOH') {
      const store = { ...fohAutoData, [draft.day]: clean };
      // Log the hand edits BEFORE the store swap, while the previous board is
      // still the one in state. Fire-and-forget: history is a record, not a
      // gate — a failed write must never block the save.
      appendHistory('foh', weekDates[draft.day], diffDayCells(fohAutoData && fohAutoData[draft.day], clean, 'foh', unlocked));
      setFohAutoData(store);
      persistBoard('foh', store, 'auto');
    } else {
      const store = { ...bohAutoData, [draft.day]: clean };
      appendHistory('boh', weekDates[draft.day], diffDayCells(bohAutoData && bohAutoData[draft.day], clean, 'boh', unlocked));
      setBohAutoData(store);
      persistBoard('boh', store, 'auto');
    }
    setHistTick((n) => n + 1);
    setDraft(null);
    flash(`${draft.day} ${draft.side} · ${SOURCE_LABEL[draft.source]} saved for everyone`);
  }

  async function saveMinors(list) {
    setMinors(list);
    const ok = await writeKV(MINORS_KEY, list);
    flash(ok ? 'Minors list saved' : "Couldn't save minors list");
  }

  // Import always writes into the Auto Assignment (KV) board — the Google
  // Docs board is a read-only live mirror and can't be imported into.
  // Every import STARTS FROM THE LOCKED TEMPLATE for that day (stations,
  // hours, ❌/✔️ markers), so a re-import fully replaces the previous
  // placement and the structure can never drift from the verified spec.
  // async so the break-plan writes can be awaited and their failures REPORTED
  // in the summary — they used to fire-and-forget while the summary claimed
  // success. The one caller awaits this before rendering the summary.
  async function applyImport(impDay, target, rows) {
    const curFoh = fohAutoData;
    const curBoh = bohAutoData;

    const toBoh = [];
    const toFoh = [];
    /* ★★ THE ROSTER ID RIDES ALONG WITH EVERY ROW FROM HERE ON.
       The engines hold per-person rules — Juana on the Breader, Julie off every
       station but three, who outranks whom — and until now they matched those
       on the FIRST NAME off the schedule. That is the one thing left that made
       a second store's board actively wrong rather than merely showing our
       people: a clone hiring any Julie got Gate City's Julie's lock, live, with
       nothing on screen to explain it.

       ⚠️ ATTACHED, NOT REPLACED. `peopleWithIds` already resolves the same ids
       two lines below, but it MAPS TO `{ name, id }` and throws away hours,
       role and blocks — it exists to write the identity record, not to feed the
       engine. Spreading onto the row keeps every field the engine reads.
       ⚠️ `resolveLeaderId` RETURNS null RATHER THAN GUESS, and a few people
       resolve to null every import because HotSchedules and HR spell them
       differently. That is fine and it is why the engines keep a name arm for
       Gate City: no id, still locked here, still nobody at a second store. */
    const idLeaders = teamList()
      .filter((m) => m && m.name && m.id != null)
      .map((m) => ({ name: m.name, hrId: m.id }));
    const withId = (p) => (p && p.id == null
      ? { ...p, id: resolveLeaderId(String((p && p.name) || ''), idLeaders) }
      : p);
    rows = (rows || []).map(withId);
    rows.forEach((p) => {
      // Split by BLOCK, not by person — see splitPersonByHouse. A person coded
      // kitchen in the morning and front counter after lunch now lands on BOTH
      // boards, each carrying only the hours it owns. Explicit FOH-only /
      // BOH-only targets still send the whole person, as before.
      if (target === 'foh') { toFoh.push(p); return; }
      if (target === 'boh') { toBoh.push(p); return; }
      const split = splitPersonByHouse(p);
      if (split.foh) toFoh.push(split.foh);
      if (split.boh) toBoh.push(split.boh);
    });
    const parts = [];
    /* ⚠️ CAPTURED BEFORE A SINGLE WRITE. Apply rebuilds the whole day from the
       template, so the only copy of what was there is the one taken here.
       `curFoh`/`curBoh` above are already the pre-apply week stores. */
    const undo = { impDay, what: 'apply', foh: null, boh: null, breaks: [] };
    /* Read the break plan we are about to replace. ⚠️ RESULT-STYLE: readKV
       answers null for a FAILED read as well as an absent one, and an undo that
       wrote null over a real plan on the strength of a dropped read would
       destroy the thing it exists to protect. A failed read simply means that
       plan is not offered back. */
    const keepBreaks = async (side) => {
      const key = `gcfcr-dailysetup-breaks2-${side}-${weekDates[impDay]}`;
      const r = await readKVResult(key);
      if (r.ok) undo.breaks.push({ key, value: r.value });
      return key;
    };

    if (toFoh.length && curFoh) {
      const dayData = templateDayBoard('foh', impDay);
      dayData.roster = toFoh.map(rosterEntryString);
      dayData.people = peopleWithIds(toFoh);   // see peopleWithIds — identity, kept
      dayData.trainers = fohTrainerList(toFoh, hrRoles);
      const res = autoAssignFOH(dayData, toFoh);
      Object.assign(dayData, res.data);
      dayData.additional = extrasFromUnplaced(res.unplaced, toFoh);
      // The engine has always computed `gaps` — the sub-intervals of a
      // station's staffed window nobody covers — and applyImport has always
      // thrown them away. That's why an unfilled cell just sat there blank
      // with no explanation: "OT 2 lunch is empty" instead of "OT 2 lunch:
      // nobody covers 11:15-2". Keep them on the day so the board can say so.
      dayData.gaps = res.gaps || [];
      /* ⚠️ "front of house uncovered", NOT "uncovered" (Matt, Aug 12 2026).
         Both houses append this clause and neither used to say which it was, so
         a day with 3 front holes and 3 kitchen holes printed "3 uncovered"
         twice and read as one number said twice. It is six.
         ⚠️ THE TWO COUNTS DO NOT MEAN THE SAME THING EITHER. FOH reports a
         missing SLICE of a staffed window; BOH reports a wholly empty cell (see
         the gap sweep in BOHAutoAssign.js). Naming the house is what lets a
         leader read them as the two different questions they are. */
      parts.push(
        `FOH auto-assigned: ${res.placed.length}` +
          (res.unplaced.length ? ` — ${res.unplaced.length} extra below: ${res.unplaced.join(', ')}` : '') +
          (dayData.gaps.length ? ` · ${dayData.gaps.length} front of house uncovered — see the board` : '')
      );
      // Awaited and reported — this ran fire-and-forget while the import
      // summary claimed success, so a refused write left the day with no
      // break plan and nothing said so.
      {
        const bk = await keepBreaks('foh');
        const bkOk = await writeKV(bk, autoAssignBreaks(toFoh, minors));
        if (bkOk === false) parts.push('⚠️ FOH breaks did not save — open Breaks and press Auto-assign');
      }
      undo.foh = curFoh;
      const store = { ...curFoh, [impDay]: dayData };
      setFohAutoData(store);
      persistBoard('foh', store, 'auto');
      parts.push(`FOH roster: ${toFoh.length}`);
    }

    if (toBoh.length && curBoh) {
      const base = templateDayBoard('boh', impDay);
      const res = autoAssignBOH(base, toBoh);
      const data = res.data;
      {
        const bk = await keepBreaks('boh');
        const bkOk = await writeKV(bk, autoAssignBreaks(toBoh, minors));
        if (bkOk === false) parts.push('⚠️ BOH breaks did not save — open Breaks and press Auto-assign');
      }
      undo.boh = curBoh;
      data.roster = toBoh.map(rosterEntryString);
      data.people = peopleWithIds(toBoh);      // see peopleWithIds — identity, kept
      data.trainers = fohTrainerList(toBoh, hrRoles);
      data.additional = extrasFromUnplaced(res.unplaced, toBoh);
      // Same as the FOH branch above: keep the engine's uncovered list on the
      // day so the board can name the holes instead of showing a blank cell.
      // BOH reports whole empty cells only — see the gap sweep in
      // BOHAutoAssign.js for why it is deliberately coarser than FOH's.
      data.gaps = res.gaps || [];
      const store = { ...curBoh, [impDay]: data };
      setBohAutoData(store);
      persistBoard('boh', store, 'auto');
      parts.push(
        `BOH roster: ${toBoh.length}, auto-placed: ${res.placed.length}` +
          (res.unplaced.length ? ` — ${res.unplaced.length} extra below: ${res.unplaced.join(', ')}` : '') +
          (data.gaps.length ? ` · ${data.gaps.length} kitchen uncovered — see the board` : '')
      );
    }
    /* ⚠️ ONLY OFFER THE UNDO IF SOMETHING WAS ACTUALLY REPLACED. `parts` is
       empty when neither side ran, and arming an undo that would restore
       nothing is a button that lies. */
    if (parts.length) setLastUndo(undo);
    return parts.length
      ? `Applied to ${impDay} (Auto Assignment, week of ${weekLabel(weekStart)}) · ${parts.join(' · ')} · press "Undo last change" if this was the wrong day`
      : 'Nothing to apply.';
  }

  // ── Surgical patch: compute what changed vs the saved board, apply nothing yet.
  function proposeRosterPatch(impDay, target, rows) {
    const now = new Date();
    const frozen = pastDaypartKeys(impDay === todayName, now);
    const toFoh = [], toBoh = [];
    rows.forEach((p) => {
      if (target === 'foh') return void toFoh.push(p);
      if (target === 'boh') return void toBoh.push(p);
      const s = splitPersonByHouse(p);
      if (s.foh) toFoh.push(s.foh);
      if (s.boh) toBoh.push(s.boh);
    });
    const sides = [];
    const route = (side, cur, people) => {
      if (!people.length || !cur || !cur[impDay]) return;
      const dayData = cur[impDay];
      const newEntries = people.map(rosterEntryString);
      const diff = diffRoster(dayData.roster || [], newEntries);
      if (!diff.added.length && !diff.dropped.length && !diff.moved.length) {
        sides.push({ side, changes: [] });
        return;
      }
      const clone = JSON.parse(JSON.stringify(dayData));
      [...diff.dropped, ...diff.moved].forEach((nm) => clearPersonFromBoard(clone, side, nm, frozen));
      // Arrivals (and hours-changed people) are surfaced as Extras to hand-place —
      // never auto-seated onto a station, so nobody who stayed gets moved.
      const byName = {};
      people.forEach((p) => { byName[(p.name || '').toLowerCase()] = p; });
      clone.additional = clone.additional || [];
      const already = new Set(clone.additional.map((a) => (a.role || '').toLowerCase()));
      [...diff.added, ...diff.moved].forEach((nm) => {
        const p = byName[nm.toLowerCase()];
        if (!p) return;
        const role = rosterEntryString(p);
        if (already.has(role.toLowerCase())) return;
        clone.additional.push({ role, breakfast: '', lunch: '', mid: '', night: '', duty: 'Extra — place on a station' });
        already.add(role.toLowerCase());
      });
      clone.roster = newEntries;
      /* The surgical patch rewrites the roster without rebuilding the day, so
         it has to keep `people` in step or a patched day would carry yesterday's
         identities against today's roster — worse than carrying none. */
      clone.people = peopleWithIds(people);
      const changes = [];
      diff.added.forEach((n) => changes.push({ t: 'add', name: n }));
      diff.moved.forEach((n) => changes.push({ t: 'move', name: n }));
      diff.dropped.forEach((n) => changes.push({ t: 'drop', name: n }));
      sides.push({ side, changes, clone });
    };
    route('foh', fohAutoData, toFoh);
    route('boh', bohAutoData, toBoh);
    return { impDay, sides, hasChanges: sides.some((s) => s.changes && s.changes.length), frozen: [...frozen] };
  }

  function applyRosterPatch(proposal) {
    if (!proposal || !proposal.hasChanges) return 'No changes to apply.';
    /* A patch never touches the break plans, so it captures none. */
    const undo = { impDay: proposal.impDay, what: 'patch', foh: null, boh: null, breaks: [] };
    const parts = [];
    proposal.sides.forEach((s) => {
      if (!s.clone || !s.changes.length) return;
      const nDrop = s.changes.filter((c) => c.t === 'drop').length;
      const nPlace = s.changes.filter((c) => c.t !== 'drop').length;
      if (s.side === 'foh') {
        undo.foh = fohAutoData;
        const store = { ...fohAutoData, [proposal.impDay]: s.clone };
        setFohAutoData(store); persistBoard('foh', store, 'auto');
      } else {
        undo.boh = bohAutoData;
        const store = { ...bohAutoData, [proposal.impDay]: s.clone };
        setBohAutoData(store); persistBoard('boh', store, 'auto');
      }
      parts.push(`${s.side.toUpperCase()}: ${nDrop} removed, ${nPlace} to place`);
    });
    setLastUndo(undo);
    return `Patched ${proposal.impDay} · ${parts.join(' · ')} · arrivals are under "Additional — added today" to place`;
  }

  async function undoLastChange() {
    if (!lastUndo) return;
    const u = lastUndo;
    /* ⚠️ CLEARED FIRST, so a second tap on a slow connection cannot replay the
       restore on top of itself. One level means one level. */
    setLastUndo(null);
    if (u.foh) { setFohAutoData(u.foh); persistBoard('foh', u.foh, 'auto'); }
    if (u.boh) { setBohAutoData(u.boh); persistBoard('boh', u.boh, 'auto'); }
    /* The break plans go back too. Only the ones we successfully READ before
       overwriting are here — see the capture in applyImport — so this can
       never write a guess over a real plan. */
    let breaksBack = 0;
    for (const b of u.breaks || []) {
      if (await writeKV(b.key, b.value) !== false) breaksBack += 1;
    }
    const missed = (u.breaks || []).length - breaksBack;
    flash(
      u.what === 'apply'
        ? `Put ${u.impDay} back${breaksBack ? ` · ${breaksBack} break plan${breaksBack === 1 ? '' : 's'} restored` : ''}` +
          (missed ? ` · ${missed} break plan did not save, open Breaks and press Auto-assign` : '')
        : 'Reverted the last roster patch'
    );
  }

  const TAB_COLORS = { FOH: ACCENT, BOH: '#C2410C', IMPORT: '#2563EB' };
  const activeAccent = TAB_COLORS[tab];
  const TAB_DEEP = { FOH: '#0B554F', BOH: '#8A2E08', IMPORT: '#1A46A8' };
  const activeGrad = `linear-gradient(120deg, ${activeAccent} 0%, ${TAB_DEEP[tab]} 55%)`;
  // Auto boards load from KV; the gdocs mirror loads per-day from the Sheet
  // (handled by its own loading/empty states in the view below).
  const loading = !fohAutoData || !bohAutoData;

  /* The assignment for the day on screen. Computed from whatever the board
     currently holds, then WRITTEN ONCE so it stops moving — a rota that
     reshuffles every time someone opens the page isn't a rota. Re-reads as
     stored on every later visit. */
  const fsDateKey = weekDates[day];
  const fsStored = fsRota && fsRota.assigned ? fsRota.assigned[fsDateKey] : undefined;
  const fsToday = useMemo(() => {
    // Jul 28 2026 — A STORED **null** MEANS "WE FAILED TO ANSWER", NOT "NOBODY".
    // If this day was ever opened before its roster was imported, fsAssignFor
    // returned null, the effect below persisted null, and `!== undefined` then
    // returned that null forever — the amber "nobody at Senior Trainer or above
    // is on today" banner froze in place with real leaders standing on the
    // board. Wed Jul 29 is exactly that: Daisy is on 5:15–11 as Leadership.
    // `!= null` lets a stored null fall through and recompute. This is the same
    // fix worker.js already got on Jul 25 (`if (entry === null) entry = undefined`);
    // the client copy never got it. A real assignment still writes once and
    // never reshuffles, which is the whole point of storing it.
    if (fsStored != null) return fsStored;
    if (!fsRota || !activeFoh || !activeBoh) return undefined;
    return fsAssignFor(day, (activeFoh[day] || {}).roster, (activeBoh[day] || {}).roster, fsRanks, fsRota.lastBy || {});
  }, [fsStored, fsRota, activeFoh, activeBoh, day, fsRanks]);

  useEffect(() => {
    // NEVER PERSIST A null. Storing "nobody" is what created the frozen banner,
    // and with the `!= null` read above, re-storing it every render would also
    // loop (each write makes a new fsRota object, which re-fires this effect).
    // No answer = write nothing, recompute next visit. Same shape as the
    // worker's "no board yet → post nothing, store nothing".
    if (fsStored != null || !fsToday || !fsDateKey || !fsRota) return;
    const next = {
      assigned: { ...(fsRota.assigned || {}), [fsDateKey]: fsToday },
      lastBy: fsToday
        ? { ...(fsRota.lastBy || {}), [fsToday.name.toLowerCase()]: fsDateKey }
        : { ...(fsRota.lastBy || {}) },
    };
    setFsRota(next);
    // Best-effort stamp — writeKV returns false rather than throw. A missed
    // write costs one rotation-fairness data point; tomorrow's assignment
    // recomputes from the board and re-writes the full map.
    writeKV(FS_ROTA_KEY, next);
  }, [fsToday, fsStored, fsDateKey, fsRota]);

  const editingHere = draft && draft.side === tab && draft.day === day && draft.source === boardSource;
  const viewData =
    tab === 'FOH'
      ? (editingHere ? draft.data : activeFoh && activeFoh[day])
      : tab === 'BOH'
        ? (editingHere ? draft.data : activeBoh && activeBoh[day])
        : null;

  /* Ask which of the names ON THIS BOARD have left. Keyed on the board itself,
     so it re-asks when the day or an edit changes what is written up there.
     ⚠️ FAILS TO EMPTY, ALWAYS. Matt: "skip the warning silently." Any refusal,
     timeout or bad shape leaves staleSet as it was rather than surfacing an
     error on the one screen a leader is reading at 5am.
     ⚠️ SENDS ONLY WHAT IS ALREADY ON SCREEN. The reply can never contain a
     name that was not sent, which is what lets the 517-name list stay on the
     server — see /api/stale-check in worker.js. */
  useEffect(() => {
    const names = [...new Set(boardNames(viewData && viewData.stations))].filter(Boolean);
    if (!names.length) { setStaleSet([]); return undefined; }
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/stale-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hub-token': hubToken() },
          body: JSON.stringify({ names }),
        });
        if (!r.ok) return;
        const d = await r.json();
        if (alive && d && d.ok && Array.isArray(d.left)) setStaleSet(d.left);
      } catch { /* silent by design — see above */ }
    })();
    return () => { alive = false; };
  }, [viewData]);

  /* ═══ TAP TO MOVE ═════════════════════════════════════════════════════
     Matt, Aug 3 2026: "can we have a click and drag feature to switch
     positions like one click".

     ★ TAP-TAP, NOT DRAG, AND THAT IS DELIBERATE. Browser drag-and-drop does
     not work on iOS touch at all, so drag here would mean hand-rolling
     long-press, finger tracking, drop-target detection and autoscroll — on a
     grid where a target is about 70px wide inside a card. On a shared iPad
     mid-rush, a near-miss silently moves someone to the wrong station and
     nothing tells you. Two taps is the same effort and can highlight every
     valid destination before anything is committed.

     ★ IT IS A SWAP, NOT A MOVE, which is exactly the words used: "switch
     positions". A swap needs no rule about what happens to the annotations a
     cell carries — "@8:30", a "→handoff", a ✔️ — because whatever is in each
     cell simply travels with it. A one-way move would have needed a ruling on
     every one of those, and every ruling is a way to be wrong.

     ⚠️ ONE mutateDraft FOR BOTH SIDES. Two sequential writes would each be
     safe on their own — mutateDraft takes a functional updater — but a swap
     that half-applied would duplicate somebody onto two stations and delete
     somebody else. One update, or none.

     ⚠️ IT WRITES THROUGH THE DRAFT, SO THE EDIT LOG GETS IT FREE. Matt: "i
     still want an edit log". Saving diffs the whole day against the previous
     board, so a swap is recorded exactly like a typed change, with no second
     logging path to fall out of step. */
  const [moveOn, setMoveOn] = useState(false);
  const [moveSel, setMoveSel] = useState(null);   // { side, si, idx, k } | null

  /* Leaving edit mode, or switching day/side/tab, must drop a half-finished
     selection. A pending source surviving a context change would swap two
     cells the person never looked at. */
  useEffect(() => { setMoveSel(null); }, [tab, day, weekOffset, editingHere]);
  useEffect(() => { if (!editingHere) setMoveOn(false); }, [editingHere]);

  const cellAt = (data, loc) => {
    if (!data || !loc) return null;
    if (loc.side === 'FOH') return (data.stations || [])[loc.idx] || null;
    const sec = (data.sections || [])[loc.si];
    return sec ? (sec.stations || [])[loc.idx] || null : null;
  };

  const onMoveTap = (loc) => {
    if (!moveSel) { setMoveSel(loc); return; }
    const same = moveSel.side === loc.side && moveSel.si === loc.si
      && moveSel.idx === loc.idx && moveSel.k === loc.k;
    if (same) { setMoveSel(null); return; }        // tapping the source again cancels
    const from = moveSel;
    mutateDraft((d) => {
      const a = cellAt(d, from);
      const b = cellAt(d, loc);
      if (!a || !b) return;
      const av = a[from.k] || '';
      const bv = b[loc.k] || '';
      a[from.k] = bv;
      b[loc.k] = av;
      /* Both sides are marked hand-edited, because both changed. Marking only
         the destination would leave the source rendering as auto-assigned
         while holding a name a person put there. */
      a._edits = { ...(a._edits || {}), [from.k]: true };
      b._edits = { ...(b._edits || {}), [loc.k]: true };
    });
    setMoveSel(null);
  };

  const onFohStation = (idx, field, v) =>
    mutateDraft((d) => {
      d.stations[idx][field] = v;
      // Track name cells a human changes, so they render highlighted on the
      // board (auto-assigned names stay plain). The marker rides on the
      // station object, so add/delete/reorder can't misalign it; a re-import
      // or "Reset stations" rebuilds fresh stations and clears it.
      if (SHIFT_KEYS.includes(field)) d.stations[idx]._edits = { ...(d.stations[idx]._edits || {}), [field]: true };
    });
  const onBohStation = (si, idx, field, v) =>
    mutateDraft((d) => {
      const st = d.sections[si].stations[idx];
      st[field] = v;
      if (SHIFT_KEYS.includes(field)) st._edits = { ...(st._edits || {}), [field]: true };
    });

  const blankStation = (role) => ({ role, breakfast: '', lunch: '', mid: '', night: '', duty: '' });

  // Starter role names so a new FOH station lands in the group you added it to
  // (groups are matched by name pattern — see FOH_CATEGORIES).
  /* ⚠️ EVERY STARTER MUST LAND BACK IN THE GROUP IT WAS ADDED FROM, which is
     the whole point of this map — categorizeFOH re-reads the name. The regroup
     broke two of these: 'frontline' and 'dining' are no longer groups at all,
     and leadership's starter was 'OT 4', which now categorises as Drive Thru,
     so adding a leadership row would have dropped it into the wrong section.
     Each value below was run back through categorizeFOH to confirm it returns
     its own key. */
  const FOH_NEW_ROLE = {
    dt: 'DT TRADITIONAL (11AM-11PM)',
    fc: 'REGISTER 5 (11AM-8PM)',
    training: 'TRAINING',
    leadership: 'ASSISTANT DIRECTOR',
    other: 'NEW STATION',
  };
  const onAddFohStation = (groupKey) =>
    mutateDraft((d) => {
      d.stations = d.stations || [];
      d.stations.push(blankStation(FOH_NEW_ROLE[groupKey] || 'NEW STATION'));
    });
  const onDeleteFohStation = (idx) =>
    mutateDraft((d) => {
      d.stations.splice(idx, 1);
    });

  const onAddBohStation = (si) =>
    mutateDraft((d) => {
      d.sections[si].stations = d.sections[si].stations || [];
      d.sections[si].stations.push(blankStation('New Station (11AM-2PM)'));
    });
  const onDeleteBohStation = (si, idx) =>
    mutateDraft((d) => {
      d.sections[si].stations.splice(idx, 1);
    });
  const onRosterText = (text) =>
    mutateDraft((d) => {
      d.roster = text.split('\n');
    });
  const onTrainersText = (text) =>
    mutateDraft((d) => {
      d.trainers = text.split('\n');
    });
  const onRemindersText = (text) =>
    mutateDraft((d) => {
      d.reminders = text.split('\n');
    });
     const onAddAdditional = () =>
    mutateDraft((d) => {
      d.additional = d.additional || [];
      d.additional.push(blankStation(''));
    });
  const onAdditionalStation = (idx, field, v) =>
    mutateDraft((d) => {
      if (!d.additional || !d.additional[idx]) return;
      d.additional[idx][field] = v;
    });
  const onDeleteAdditional = (idx) =>
    mutateDraft((d) => {
      if (!d.additional) return;
      d.additional.splice(idx, 1);
    });


  return (
    <>
      <style>{printCss}</style>
      <div className="ds-noprint min-h-screen bg-gray-50">
        {/* ⚠️ NOT STICKY ANY MORE. This block used to pin, and with seven bands
            in it that meant a phone lost 43% of its screen permanently. It now
            scrolls away and the slim day/shift bar below takes over the pin. */}
        <div className="bg-white border-b-2 transition-colors" style={{ borderBottomColor: activeAccent }}>
          <div className="max-w-5xl mx-auto px-4 pt-4 pb-2">
            <div className="flex items-center justify-between gap-2 mb-1" style={{ background: activeGrad, margin: "-1rem -1rem 0.5rem", padding: "14px 16px 12px" }}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xl">📋</span>
                {/* ⚠️ MUST MATCH THE TILE NAME IN App.jsx. A tile called one
                    thing on the dashboard and another inside reads as two
                    tools, and the masthead is the one people screenshot. */}
                <h1 className="text-lg font-bold truncate" style={{ color: "#fff" }}>Lineup · Daily Setup</h1>
                {unlocked && (
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}>
                    ✎ {unlocked.name.split(' ')[0]}
                  </span>
                )}
              </div>
              {tab !== 'IMPORT' && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {editingHere ? (
                    <>
                      <button
                        onClick={saveDraft}
                        className="flex items-center gap-1 text-[12px] font-bold rounded-lg px-2.5 py-1.5"
                        style={{ background: "#fff", color: activeAccent }}
                      >
                        <Save size={13} />
                        Save
                      </button>
                      <button
                        onClick={() => setDraft(null)}
                        className="text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.45)" }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => window.print()}
                        className="flex items-center gap-1 text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.45)" }}
                        title="Print this day"
                      >
                        <Printer size={13} />
                        Print
                      </button>
                      <button
                        onClick={requestEdit}
                        className="flex items-center gap-1 text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border"
                        style={{ borderColor: "rgba(255,255,255,0.45)", color: "#fff" }}
                      >
                        {unlocked ? <Pencil size={13} /> : <Lock size={13} />}
                        Edit
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            {/* ⚠️ TWO ROWS BECAME ONE (Matt, Aug 5 2026: "maybe make the top
                part a dropdown?"). The standalone date line went, not because
                the date does not matter but because the DayPicker below already
                carries it, and six stacked rows before the first station is the
                actual complaint. Nothing moved behind a tap: switching days is
                the single most common thing a leader does here, and a dropdown
                would have added a step to it to save the same space this saves
                for free. */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <div className="flex rounded-lg overflow-hidden border border-gray-200">
                {[0, 1].map((o) => (
                  <button
                    key={o}
                    onClick={() => setWeek(o)}
                    className="px-3 py-1.5 text-[12px] font-semibold"
                    style={weekOffset === o ? { background: '#111827', color: 'white' } : { background: 'white', color: '#6B7280' }}
                  >
                    {o === 0 ? 'This Week' : 'Next Week'}
                  </button>
                ))}
              </div>
              <span className="text-[12px] font-bold text-gray-700">Week of {weekLabel(weekStart)}</span>
              <span className="text-[11.5px] text-gray-400 truncate">{dateLabel}</span>
            </div>

            {editingHere && (
              <div className="flex gap-2 mb-2 items-center flex-wrap">
                <button type="button" onClick={() => { setMoveOn((v) => !v); setMoveSel(null); }}
                  className="rounded-lg py-1.5 px-3 text-[12.5px] font-semibold"
                  style={moveOn ? { background: '#14243D', color: '#fff' } : { background: '#F3F4F6', color: '#6B7280' }}>
                  {moveOn ? '✓ Moving people' : '⇄ Move people'}
                </button>
                <span className="text-[11.5px]" style={{ color: '#6B7280' }}>
                  {moveOn
                    ? (moveSel ? 'Now tap where they go. Tap them again to cancel.' : 'Tap a person, then tap where they go. They swap.')
                    : 'Turn this on to swap two people without typing.'}
                </span>
              </div>
            )}

            {editingHere && (
              <div className="rounded-lg px-2.5 py-1.5 mb-2 text-[11.5px] font-semibold" style={{ background: '#FFF7ED', color: '#C2410C' }}>
                Editing {day} {tab} · {SOURCE_LABEL[boardSource]} · week of {weekLabel(weekStart)} — type names directly into the cells. ❌ = closed, ✔️ = leader covers. Don't forget Save.
              </div>
            )}

            <div className="flex gap-2 mb-3">
              {['FOH', 'BOH', 'IMPORT'].map((t) => {
                const active = t === tab;
                return (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    /* ⚠️ SHORT LABELS. "Front of House" wrapped to two lines on a
                       phone, which made this row twice as tall as it needed to
                       be and pushed the board further down the screen — the
                       exact complaint. Everyone here says FOH and BOH out loud
                       anyway; the icon carries the rest. */
                    className={`${t === 'IMPORT' ? '' : 'flex-1 '}flex items-center justify-center gap-1.5 rounded-lg py-1.5 px-3 text-[12.5px] font-semibold transition-colors whitespace-nowrap`}
                    style={active ? { background: TAB_COLORS[t], color: 'white' } : { background: '#F3F4F6', color: '#6B7280' }}
                  >
                    {t === 'FOH' ? <UtensilsCrossed size={13} /> : t === 'BOH' ? <ChefHat size={13} /> : <Upload size={13} />}
                    {t === 'IMPORT' ? 'Import' : t}
                  </button>
                );
              })}
            </div>

            {tab !== 'IMPORT' && !editingHere && (
              /* ⚠️ LAYOUT AND SHIFT SHARE ONE ROW NOW. They were two, and two
                 rows of chips above a board is how a header gets to seven bands
                 deep. A thin divider keeps them readable as two groups. */
              <div className="flex gap-1.5 mb-1 flex-wrap items-center">
                {LAYOUTS.map(([v, lbl]) => (
                  <button key={v} type="button" onClick={() => setLayoutSticky(v)}
                    className="rounded-lg py-1 px-2.5 text-[12px] font-semibold"
                    style={layout === v
                      ? { background: '#14243D', color: '#fff' }
                      : { background: '#F3F4F6', color: '#6B7280' }}>
                    {lbl}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ★ THE ONLY THING THAT FOLLOWS YOU DOWN THE PAGE (Matt, Aug 5 2026,
            two screenshots: "I think it can be better").

            The whole header used to be sticky. Seven bands deep, it kept 43% of
            a phone screen FOREVER — you could scroll all day and never get it
            back, so the compact rows were being read through a letterbox. That
            is the real complaint, and shortening the rows underneath could
            never have fixed it.

            ⚠️ DAY AND SHIFT ARE WHAT STAY, and nothing else. They are the two
            things a leader changes while actually reading the board. Week,
            tabs and layout are set once on the way in, so they scroll away with
            everything else and are one flick back up. */}
        {tab !== 'IMPORT' && (
          <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b"
            style={{ borderBottomColor: '#E8EAE7' }}>
            <div className="max-w-5xl mx-auto px-4 py-1.5">
              <DayPicker day={day} setDay={setDay} todayName={weekOffset === 0 ? todayName : ''} accent={activeAccent} />
              {!editingHere && (
                /* Hidden while editing: typing happens against the full grid,
                   and a filtered board is the wrong surface to edit through. */
                <div className="flex gap-1 mt-1 flex-wrap items-center">
                  {[['all', 'All day'], ...SHIFT_KEYS.map((k) => [k, SHIFT_LABELS[k]])].map(([v, lbl]) => {
                    const on = shift === v;
                    const pc = PERIOD_COLORS[v];
                    return (
                      <button key={v} type="button" onClick={() => setShift(v)}
                        className="rounded-full py-0.5 px-2.5 text-[11.5px] font-bold"
                        style={on
                          ? { background: pc ? pc.dot : '#14243D', color: '#fff' }
                          : { background: '#fff', color: '#6B7280', border: '1px solid #E5E7EB' }}>
                        {lbl}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="max-w-5xl mx-auto px-4 py-4">
          {/* ★ FIRST THING ON THE PAGE, above food safety and above the board.
              The point of the card is that the common question is answered
              without scrolling, and anything placed above it undoes that. */}
          {/* ⚠️ ABOVE the You today card on purpose. If the day was never
              imported, "you are not on the board" is a misleading answer to a
              question nobody should be asking yet — the board is the problem,
              not the person. */}
          {tab !== 'IMPORT' && !loading && (() => {
            const d = tab === 'FOH' ? (fohAutoData && fohAutoData[day]) : (bohAutoData && bohAutoData[day]);
            if (!dayNotImported(d)) return null;
            return (
              <div className="rounded-2xl px-4 py-3 mb-4"
                style={{ background: '#FFF7E6', border: '1px solid #F3D6C4', ...accentEdge('#B4832B', 3), boxShadow: CARD_3D }}>
                <div className="text-[13.5px] font-extrabold" style={{ color: '#8A4B1F' }}>
                  {day} has not been imported yet
                </div>
                <div className="text-[12.5px] mt-1" style={{ color: '#8A4B1F', lineHeight: 1.5 }}>
                  The stations below are the template, not a real board. Nobody is assigned
                  to this day yet, so nothing here is anybody's shift.
                </div>
              </div>
            );
          })()}
          {tab !== 'IMPORT' && !loading && (
            <YouToday
              viewerName={user && user.name}
              day={day}
              dateKey={weekDates[day]}
              fohDay={fohAutoData && fohAutoData[day]}
              bohDay={bohAutoData && bohAutoData[day]}
              tabColors={TAB_COLORS}
            />
          )}
          {tab !== 'IMPORT' && !loading && fsToday !== undefined && (
            /* ★ IT OPENS THE TOOL (Matt, Aug 4 2026: "can the food safety here
               be a link to the tool?"). A leader reads who is doing the
               walkthrough and the next thing they want is the walkthrough.
               ⚠️ Only a button when the callback is actually there. Rendering a
               dead button because a prop went missing is the frozen-page
               complaint, so without onOpenTool it stays the plain banner.
               ⚠️ Bare block comment: this sits in the expression half of a
               `&& (`, where the braced JSX form is a parse error. Third time
               today I have hit this; the rule is that braces belong only where
               JSX CHILDREN go. */
            <div
              className="rounded-lg px-3 py-2.5 mb-3 flex items-center gap-2"
              onClick={onOpenTool ? () => onOpenTool('food') : undefined}
              role={onOpenTool ? 'button' : undefined}
              tabIndex={onOpenTool ? 0 : undefined}
              onKeyDown={onOpenTool ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenTool('food'); } } : undefined}
              style={{ background: fsToday ? '#E4F3EE' : '#FEF3C7', border: `1px solid ${fsToday ? '#A7D8CB' : '#FDE68A'}`,
                cursor: onOpenTool ? 'pointer' : undefined }}
            >
              <span style={{ fontSize: 15 }}>🛡️</span>
              <div className="min-w-0 text-[13px] leading-snug">
                <span className="font-semibold" style={{ color: fsToday ? '#0B554F' : '#92400E' }}>Food safety walkthrough</span>
                {fsToday ? (
                  <>
                    <span style={{ color: '#374151' }}> — {fsToday.name}</span>
                    {fsToday.fallback && (
                      <span style={{ color: '#92400E' }}>
                        {' '}· no {FS_SIDE[day] === 'foh' ? 'FOH' : 'BOH'} leader on today, so this is a stand-in
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ color: '#92400E' }}> — nobody at Senior Trainer or above is on today</span>
                )}
              </div>
            </div>
          )}

          {tab === 'IMPORT' ? (
            <ImportTab
              canEdit={!!unlocked}
              onRequestUnlock={() => setShowPin(true)}
              onApply={applyImport}
              onPropose={proposeRosterPatch}
              onApplyPatch={applyRosterPatch}
              onUndo={undoLastChange}
              hasUndo={!!lastUndo}
              defaultDay={day}
              weekStart={weekStart}
              source={boardSource}
            />
          ) : loadFailed ? (
            /* An empty board here would read as "the week is blank", which is
               the same lie the seeding bug used to write to the database. */
            <div className="text-center py-16 px-6">
              <div className="text-sm font-semibold text-gray-700">Couldn't load the boards</div>
              <div className="text-sm text-gray-500 mt-1">
                The Hub couldn't reach the database. Nothing has been changed. Check the
                connection and try again.
              </div>
              <button
                onClick={() => setReloadTick((n) => n + 1)}
                className="mt-4 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold"
                style={{ minHeight: 44 }}
              >
                Try again
              </button>
            </div>
          ) : loading ? (
            <div className="text-center text-sm text-gray-400 py-16">Loading boards…</div>
          ) : (layout === 'compact' && !editingHere && (tab === 'FOH' || tab === 'BOH')) ? (
            /* ⚠️ `!editingHere` SENDS AN EDITING LEADER BACK TO THE GRID.
               Compact is read-only, and dropping someone who tapped Edit onto a
               surface with no inputs is the frozen-page complaint: the button
               works, the screen looks right, and nothing can be typed. */
            <CompactView
              data={tab === 'FOH' ? (fohAutoData && fohAutoData[day]) : (bohAutoData && bohAutoData[day])}
              isFoh={tab === 'FOH'}
              shift={shift}
            />
          ) : tab === 'FOH' ? (
                      <>
              <FOHView
                moveOn={moveOn} moveSel={moveSel} onMoveTap={onMoveTap}
                ranks={fsRanks} roles={fsRoles} avatars={avatars}
                departed={departedSet} staleFromArchive={staleSet}
                data={viewData}
                dateKey={weekDates[day]}
                edit={!!editingHere}
                onStation={onFohStation}
                onRoster={onRosterText}
                onTrainers={onTrainersText}
                minors={minors}
                canEdit={!!unlocked && canEditSource}
                onMinors={saveMinors}
                onAddStation={onAddFohStation}
                onDeleteStation={onDeleteFohStation}
              />
              <AdditionalSection
                stations={viewData && viewData.additional}
                edit={!!editingHere}
                onAdd={onAddAdditional}
                onStation={onAdditionalStation}
                onDelete={onDeleteAdditional}
                trainerSet={trainerSetOf(viewData && viewData.trainers)} ranks={fsRanks} avatars={avatars} roles={fsRoles}
              />
              <HistorySection side="foh" dateKey={weekDates[day]} show={showEditors} reloadKey={histTick} />
            </>
          ) : (
            <>
              <BOHView
                moveOn={moveOn} moveSel={moveSel} onMoveTap={onMoveTap}
                ranks={fsRanks} roles={fsRoles} avatars={avatars}
                departed={departedSet} staleFromArchive={staleSet}
                data={viewData}
                dateKey={weekDates[day]}
                edit={!!editingHere}
                onStation={onBohStation}
                onRoster={onRosterText}
                onTrainers={onTrainersText}
                onReminders={onRemindersText}
                minors={minors}
                canEdit={!!unlocked && canEditSource}
                onMinors={saveMinors}
                onAddStation={onAddBohStation}
                onDeleteStation={onDeleteBohStation}
              />
              <AdditionalSection
                stations={viewData && viewData.additional}
                edit={!!editingHere}
                onAdd={onAddAdditional}
                onStation={onAdditionalStation}
                onDelete={onDeleteAdditional}
                trainerSet={trainerSetOf(viewData && viewData.trainers)} ranks={fsRanks} avatars={avatars} roles={fsRoles}
              />
              <HistorySection side="boh" dateKey={weekDates[day]} show={showEditors} reloadKey={histTick} />
            </>

          )}
        </div>

        {showPin && (
          <PinModal
            onClose={() => {
              setShowPin(false);
              setPendingEdit(false);
            }}
            onUnlock={handleUnlock}
          />
        )}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 text-[13px] font-semibold px-4 py-2 rounded-full shadow-lg bg-gray-900 text-white z-50">
            {toast}
          </div>
        )}
      </div>
      <PrintSheet
        tab={tab}
        day={day}
        foh={editingHere && tab === 'FOH' ? { ...activeFoh, [day]: draft.data } : activeFoh}
        boh={editingHere && tab === 'BOH' ? { ...activeBoh, [day]: draft.data } : activeBoh}
        weekDates={weekDates}
        source={boardSource}
      />
    </>
  );
}
