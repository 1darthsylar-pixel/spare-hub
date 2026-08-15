/* ══════════════════════════════════════════════════════════════════════════
   boardHistory.js — WHAT THE STORE ACTUALLY DID, read off its own saved boards.

   ★ LEAF. Imports nameMatch.js and nothing else, and nameMatch imports nothing,
   so the graph terminates. No React, no store.js, no component — the schedule
   engine reads this while deciding a week, and one day the Worker will too.

   ────────────────────────────────────────────────────────────────────────
   WHY THIS EXISTS
   ────────────────────────────────────────────────────────────────────────
   Matt, Aug 13 2026: "For the schedule engine the positions are predetermined
   by schedule time and the current schedule applied doesn't match it. Use
   memory to predict who needs placed where."

   The schedule engine fills a station with whoever is free and can hold it
   longest. The real board does not work like that at all, and two weeks of
   this store's own boards say so in numbers:

     • Ana stood on Bulk Prep in 22 of her 22 cells. Hernan and Juana on
       Breader, 21 of 21 each. Those are not preferences, they are where those
       people work.
     • Kimberley appeared on 16 different stations in 20 cells. Lizbeth on 16.
       Those are floaters and the engine's "whoever fits" rule is right for
       them.
     • 8 front and 8 back stations were staffed in every daypart of every day.
       The rest were filled between 4% and 67% of the time — Hash/S Fry once
       all week. The engine treats all 48 as needing a body every minute they
       are open, which is where 22 "uncovered spans" came from on a week that
       was, by the store's own standard, covered.

   ⇒ So this file answers two questions off the same input, and they are the
   same question really: HOW DOES THIS STORE ACTUALLY RUN.

   ⚠️⚠️ IT MEASURES, IT NEVER PRESCRIBES. Nothing here contains a station name,
   a person, a percentage anybody typed, or a rule about this store. Hand it
   another store's boards and it describes that store instead. Design rule 18:
   a store's own behaviour is data, not a constant.

   ⚠️ AN EMPTY HISTORY IS A WORKING STATE and is what a new store has. Every
   reader answers "I do not know" rather than a default, and the engine falls
   straight back to the behaviour it has today. Rule 1.

   ────────────────────────────────────────────────────────────────────────
   ⚠️ WHAT IS IN A BOARD CELL IS NOT ALWAYS A PERSON
   ────────────────────────────────────────────────────────────────────────
   Measured rather than assumed, and my first pass got it wrong twice:

     "Ashley R @6"    a person, with the time they come on
     "✔️ Thanh"        a person, with the board's own tick
     "split duties"   NOT a person. The station is covered by whoever is near.
     "(Line!!)"       NOT a person, and this one bit: parsed naively it becomes
                      a team member called "Line!!)" who worked Register 1
                      twenty-four times, which is a better record than most of
                      the real team.
     "×" / "✕" / ""   nobody.

   A name is what is left after the markers come off, and it has to still look
   like a name. Anything else is dropped and counted, never guessed at.
   ══════════════════════════════════════════════════════════════════════════ */

import { sameLeader, normName } from "./nameMatch.js";

/* Board cells write short names — "Adriana C", "Benjamin S", "Ana". The roster
   holds "Adriana Carrera Reyes". `sameLeader` is the repo's existing answer to
   exactly that and its own comment names the board reconciliation as one of
   its two legitimate callers. Not re-implemented here (rule 8). */

const MARKER_ONLY = /^(split duties|line!!\)?|\(line!!\)|x|×|✕|✔️?|—|-|n\/a)$/i;

/* Strip the board's decorations, then decide whether a name is left.
   ⚠️ THE ORDER MATTERS: the "@6" comes off before the leading tick, because a
   cell can carry both. */
export function personInCell(raw) {
  const cut = String(raw == null ? "" : raw).replace(/@.*$/, "").trim();
  /* 🐛 STRIPPING SYMBOLS ATE THE DIGIT AND LEFT A NAME BEHIND. The first
     version removed every leading non-letter so that "✔️ Thanh" would work,
     which turned the cell "6am" into a team member called "am". A cell that
     STARTS with a digit is a time or a count, never a person, and that has to
     be decided before anything is stripped. Found by a test, not by reading. */
  if (/^\d/.test(cut)) return "";
  const s = cut
    .replace(/^[^A-Za-z(]+/, "")    // a leading ✔️ or bullet, keeping "(" so
    .trim();                        // "(Line!!)" still reaches the marker test
  if (!s || MARKER_ONLY.test(s)) return "";
  /* Has to start with a letter and contain no digits — a real name does. */
  if (!/^[A-Za-z]/.test(s) || /\d/.test(s)) return "";
  return s;
}

/* "WINDOW (6AM-11PM)" → "WINDOW". The hours are on the role string and they
   change between days, so they cannot be part of the identity.

   ⚠️⚠️ INTERNAL WHITESPACE IS COLLAPSED, AND THAT IS A BUG FIX, NOT TIDINESS.
   Found Aug 14 2026 by ranking every station off seven weeks of real boards:
   this store has BOTH `DT TRADITIONAL` and `DT  TRADITIONAL` — one typed with a
   double space — and every measurement in this file counted them as two
   different stations. The double-spaced one showed **16 cells, 0 staffed**,
   which made it look like the least-worked station in the building.

   ⇒ That is not cosmetic now that the cut advice picks a station off these
   rankings: a phantom station at 0% would be offered as the first thing to cut,
   every day, and a leader would go looking for a row that does not exist.

   ⚠️ IT ALSO MAKES BOARD NAMES MATCH CONFIG NAMES. `storeCfg("stations.FOH")`
   spells everything with single spaces, so a double-spaced board cell could
   never be matched to its own station row either.

   ⚠️ NOTHING STORED CHANGES. This normalises on READ, so months of saved boards
   keep whatever they hold and simply stop being counted twice. Rule 1. */
export const roleName = (role) =>
  String(role || "").split(" (")[0].trim().replace(/\s+/g, " ");

const DAYPARTS_IN_A_CELL = ["breakfast", "lunch", "mid", "night"];

/* Every { role, daypart, person } in one saved board, whichever side it is.
   FOH boards are `{ Day: { stations: [] } }` and BOH boards are
   `{ Day: { sections: [{ stations: [] }] } }`. One reader, both shapes, because
   a second one would drift and only one of them would be right. */
export function cellsOfBoard(board) {
  const out = [];
  const days = board && typeof board === "object" ? board : {};
  Object.keys(days).forEach((day) => {
    const rec = days[day];
    if (!rec || typeof rec !== "object") return;
    const stations = [];
    if (Array.isArray(rec.stations)) stations.push(...rec.stations);
    if (Array.isArray(rec.sections)) {
      rec.sections.forEach((sec) => { if (sec && Array.isArray(sec.stations)) stations.push(...sec.stations); });
    }
    stations.forEach((st) => {
      if (!st || typeof st !== "object") return;
      const role = roleName(st.role);
      if (!role) return;
      DAYPARTS_IN_A_CELL.forEach((dp) => {
        out.push({ day, role, daypart: dp, person: personInCell(st[dp]), edited: !!(st._edits && st._edits[dp]) });
      });
    });
  });
  return out;
}

/* ── how hard each station is really worked ───────────────────────────────
   `core` is a station this store staffs every daypart it is open. A hole there
   is a real hole. Everything else is `peak`: worth filling, not worth alarming
   about, and never worth pulling somebody off a core station for.

   ⚠️ THE THRESHOLD IS A RATIO OF THIS STORE TO ITSELF, not a number anybody
   picked for a restaurant. A station is core when it is staffed in at least
   `coreAt` of the cells it was open for. The default of 0.8 was set by looking
   at where the real gap falls in this store's own distribution: the core sits
   at 83% and the next station down is at 67%, so anything from about 0.7 to
   0.8 lands in the same place. It is a parameter so a store whose distribution
   has no gap can move it.

   ⚠️ A STATION NOBODY EVER STAFFS IS `never`, NOT `peak`. Trainer, Training,
   Mobile Bagger and Mobile Drinks/Desserts took zero bodies across two weeks
   because they are duty rows, not positions. Reporting them as unfilled is
   reporting the board's own design as a fault. */
export function stationLoad(boards, { coreAt = 0.8 } = {}) {
  const tally = new Map();
  (Array.isArray(boards) ? boards : []).forEach((b) => cellsOfBoard(b).forEach((c) => {
    const t = tally.get(c.role) || { role: c.role, cells: 0, staffed: 0 };
    t.cells += 1;
    if (c.person) t.staffed += 1;
    tally.set(c.role, t);
  }));

  const rows = [...tally.values()].map((t) => ({
    ...t,
    rate: t.cells ? t.staffed / t.cells : 0,
    tier: !t.staffed ? "never" : (t.cells && t.staffed / t.cells >= coreAt ? "core" : "peak"),
  })).sort((a, b) => b.rate - a.rate || a.role.localeCompare(b.role));

  const byRole = new Map(rows.map((r) => [r.role, r]));
  return {
    rows,
    /* ⚠️ A STATION THIS HISTORY HAS NEVER SEEN ANSWERS "" — not "peak". The
       engine has to be able to tell "I know this is optional" from "I have
       never heard of it", because only the first is a reason to relax. */
    tierOf: (role) => (byRole.get(roleName(role)) || {}).tier || "",
    rateOf: (role) => (byRole.get(roleName(role)) || {}).rate,
  };
}

/* ── where a person actually stands ───────────────────────────────────────
   An ANCHOR works one station most of the time; a FLOATER moves. That is not a
   label anybody applies, it is a shape in the counts, and both kinds are real
   and useful. Placing an anchor anywhere else is how a board stops looking
   like the store; placing a floater by history would freeze them.

   ⚠️ NAMES IN, IDS OUT. Board cells are short names and every record in the
   Hub is keyed by roster id. The match is `sameLeader`, and TWO ROSTER PEOPLE
   MATCHING ONE BOARD NAME MATCHES NEITHER — this roster holds a Lizbeth
   Gonzalez and a Lizbeth Gonzalez Ramos, and a board cell reading "Lizbeth"
   genuinely does not say which. A miss costs a hint; a wrong match puts one
   person's history onto another person's shift.

   ⚠️ RECENT WEEKS COUNT MORE. `weightOf(board)` lets the caller decay older
   boards; without it a station somebody left a month ago outvotes the one they
   moved to. Default is 1 for everything, which is honest when nobody has said
   which board is which. */
export function placementMemory(boards, roster, { anchorAt = 0.6, minCells = 6, weightOf } = {}) {
  const list = (Array.isArray(roster) ? roster : []).filter((p) => p && p.id != null && p.name);

  /* One pass to find the names that are ambiguous, so an ambiguous cell can be
     skipped rather than half-counted. */
  const idFor = (cellName) => {
    const hits = list.filter((p) => sameLeader(cellName, p.name) || normName(cellName) === normName(p.name));
    return hits.length === 1 ? String(hits[0].id) : "";
  };

  const seen = new Map();        // cell name → resolved id or "" (cache; the
                                 // same short name recurs hundreds of times)
  const byPerson = new Map();

  (Array.isArray(boards) ? boards : []).forEach((b) => {
    const w = typeof weightOf === "function" ? Number(weightOf(b)) || 0 : 1;
    if (w <= 0) return;
    cellsOfBoard(b).forEach((c) => {
      if (!c.person) return;
      if (!seen.has(c.person)) seen.set(c.person, idFor(c.person));
      const id = seen.get(c.person);
      if (!id) return;
      const rec = byPerson.get(id) || { id, total: 0, roles: new Map() };
      rec.total += w;
      rec.roles.set(c.role, (rec.roles.get(c.role) || 0) + w);
      byPerson.set(id, rec);
    });
  });

  const people = [...byPerson.values()].map((rec) => {
    const roles = [...rec.roles.entries()]
      .map(([role, n]) => ({ role, n, share: rec.total ? n / rec.total : 0 }))
      .sort((a, b) => b.n - a.n || a.role.localeCompare(b.role));
    const top = roles[0] || null;
    /* ⚠️ minCells GUARDS AGAINST A CONFIDENT NOTHING. Somebody with two cells
       all week is 100% on one station and knows nothing; calling them an
       anchor would pin a new hire to whatever they happened to do on day one. */
    const anchor = !!(top && rec.total >= minCells && top.share >= anchorAt);
    return { id: rec.id, cells: rec.total, roles, anchor, home: anchor ? top.role : "" };
  }).sort((a, b) => b.cells - a.cells);

  const byId = new Map(people.map((p) => [p.id, p]));
  return {
    people,
    /* "" when this person has no history — never a guess. */
    homeOf: (id) => (byId.get(String(id)) || {}).home || "",
    isAnchor: (id) => !!(byId.get(String(id)) || {}).anchor,
    /* How much of their time this person spent on that station, 0 when never.
       This is the number the engine sorts on, so a floater who is merely
       FAMILIAR with a station still beats a floater who has never seen it. */
    affinity: (id, role) => {
      const rec = byId.get(String(id));
      if (!rec) return 0;
      const r = rec.roles.find((x) => x.role === roleName(role));
      return r ? r.share : 0;
    },

    /* ── WHAT THIS PERSON HAS ACTUALLY DONE ───────────────────────────────
       Matt, Aug 14 2026, choosing this over a certification list: the front
       board runs 25 stations and the whole store holds ONE front certification
       code between them (DRIVE THRU, 67 people), so a rating cannot say who can
       work Window. Six weeks of these boards can, and does — 15 distinct front
       stations for the busiest person, measured.

       ⇒ Every station name they have stood at, at all, ever, in the boards
       handed in. This is the "already does it" set the training check subtracts
       from; anything NOT in it is something they have never done.

       ⚠️ EVERY ROLE, NOT THE ANCHOR ROLES. `homeOf` answers where somebody
       mostly stands, which is a different question — somebody who worked Window
       twice in six weeks is not a Window anchor but is certainly not in
       training on it either. Reading `homeOf` here would put a leader's most
       experienced people back into training on eight stations each. */
    rolesOf: (id) => {
      const rec = byId.get(String(id));
      return rec ? rec.roles.map((r) => r.role) : [];
    },

    /* How many board cells we hold for this person at all.
       ⚠️⚠️ THE CALLER MUST CHECK THIS BEFORE TREATING AN EMPTY rolesOf AS
       "THEY HAVE NEVER DONE ANYTHING". Zero means one of three things and only
       one of them is a fact about the person: brand new, or never rostered in
       the weeks handed in, or — the one that bites — a board name this roster
       could not resolve unambiguously. This file already refuses to guess
       between two Lizbeths; a training flag built on that silence would
       announce that an eight-year veteran has never worked a register. A miss
       costs a hint. A wrong flag prints a wrong name on a board. */
    cellsOf: (id) => (byId.get(String(id)) || {}).cells || 0,
  };
}
