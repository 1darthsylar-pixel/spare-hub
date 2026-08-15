import React, { useState, useEffect, useRef } from "react";
/* The one raised look, shared with every tool — see cardStyle.js. */
import { CARD_3D, cardSurface, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { kvGet, kvSet, kvGetResult, hubToken } from "./store.js";
import { loadHRTeamResult } from "./HRConsole.jsx";
import { normName, bareId } from "./nameMatch.js";
/* Bri, Aug 10 2026: "Calendar scheduling can be linked with our name badges in
   'Our Teams' where the organization chart lives. The team can go there to our
   names and see a 'Schedule' button underneath each director, HR, or Ex
   Director to schedule a meeting type they're allowed to schedule."
   ⚠️ THE RULES ARE NOT IN THIS FILE. Who may book what, and whether somebody is
   still taking bookings, live in calendarStore.js because worker.js and the
   Calendar tile ask the same questions. */
import { TYPES_KEY as CAL_TYPES_KEY, slotsKey as calSlotsKey, typeList as calTypeList,
  bookableTypes, ownerAccepting, openSlots, heldBy, durationText, typeDesc } from "./calendarStore.js";
/* `hrNamesOf` is every spelling a person answers to — their HR name and their
   "goes by" — and it exists for exactly this. It was written when the goes-by
   field shipped and never wired to anything until now. */
import { hrDisplayName, hrNamesOf, hrTitleFor } from "./hrRoster.js";
import { isAdminSlackId, adminNames, STORE } from "./storeConfig.js";
import { TEAM_TOOL_ADMIN_ROLES } from "./adminRoles.js";
/* The person-scoped clamp. Empty today, and applied anyway — see below. */
import { effectiveRole } from "./accessOverrides.js";

/**
 * TeamDirectory — editable org/team layer for the Gate City Hub.
 * Source of truth behind "Our Team" and "Meet Our Teams".
 *
 * Persistence: store.js kvGet/kvSet on `gc-team-directory-v1` (shared Supabase
 *   KV; kvSet stores the object directly — no JSON.stringify).
 * Roster: seeded from Bri's Peak Reachers sheet (structure + trainer tier that
 *   HR lacks). loadHRTeam() runs at render as NON-DESTRUCTIVE enrichment —
 *   it only attaches `hrId` and flags `hrDiffers`; the DISPLAY always comes
 *   from this directory (Bri's manual edits win — the override model).
 * Visibility (two levels, both requested by Bri):
 *   • per-person  vis: "live" | "hidden" | "scheduled" (+ revealAt date)
 *   • whole-directory  meta.held  → the big-reveal switch
 *   Hidden/held/未reached-schedule items are visible ONLY to the allowlist
 *   (Bri + ED + Owner); everyone else sees only what's live. Scheduled items
 *   auto-reveal on their date (computed each render — no cron needed).
 *
 * The gate FAILS CLOSED: if the viewer can't be confidently identified as
 * allowlisted, they're treated as a team member (hidden stays hidden).
 */

const STORE_KEY = "gc-team-directory-v1";
const USER_KEY = "gcfcr-access-user"; // App.jsx writes the signed-in person here

// ── WHO CAN EDIT / SEE HIDDEN ITEMS ──────────────────────────────────────
// Person-scoped by design — promotions are confidential, so this is an exact
// allowlist, not a role-label guess.
//
// PRIMARY GATE = SLACK USER ID. Slack IDs never change; display names do, and
// a name-string gate is what silently locked Bri out of her own admin panel
// (the Hub knew her as "Bri Moore", the gate wanted "Brianna Moore").
/* ★ THE FIVE ADMINS NOW COME FROM storeConfig.js, WHICH IS THE ONLY COPY.
   This exact block was duplicated in four tiles under four different names.
   Byte-identical every time, so a second store had to find all four to stop
   Gate City administering their Hub — and four copies of one permission list
   drift silently.
   ⚠️ THE MECHANISM IS UNCHANGED. Id first, name second, role last, exactly as
   before. Only the list moved. The name and role fallbacks below are NOT
   duplicates between tiles and deliberately stay here. */

// FALLBACKS, in order, used only until every HR record carries a slackId.
// Both spellings of Bri's name are here on purpose. Do NOT remove these until
// `slackId` is confirmed populated on the roster — losing them locks people out.
/* ★ THE NAME LIST NOW COMES FROM storeConfig — owners.adminNames.teamDirectory.
   Last of the three doors to move: the ids went on Aug 7 and the roles on the
   same day, and this Set stayed behind holding four of Gate City's people in a
   file a second store clones verbatim.
   ⚠️ READ INSIDE THE GATE, NOT INTO A `const` UP HERE. A module-level Set would
   capture the baked-in default at import, before a store's saved settings are
   merged, and the tile would keep answering with Gate City's names forever.
   ⚠️ TEAM GOALS HOLDS A BYTE-IDENTICAL LIST UNDER ITS OWN KEY. That is
   deliberate — see the comment over adminNames in storeConfig.js. Do not point
   the two at one key. */
/* ⚠️ "human resources" IS HANNAH'S ONLY ROLE, and it was the one missing here
   (Aug 4 2026). MemberVote, ProfessionalGrowth, L101Editor and TrainingSite all
   carry it in the same list; this copy dropped it. So on any sign-in where the
   Slack lookup fails and the app falls back to the role string, Hannah could not
   edit the directory and hidden or scheduled promotion rows vanished from her
   view — while the same session still let her mark team goals met, which is why
   it read as a glitch rather than a permission. Same for whoever holds the seat
   after her. */
/* ★ THE LIST NOW LIVES IN adminRoles.js — TEAM_TOOL_ADMIN_ROLES.
   ⚠️ THIS TILE GAINS "director" (Matt, Aug 7 2026). It held a list identical to the other four that morning and was left behind when they were widened; joining them is what stops that happening again.
   ⚠️ ONLY THE DECLARATION MOVED. Every use of EDITOR_ROLES below is
   byte-for-byte what it was, including this file's own role normaliser,
   which is NOT the same function in every tile. */
const EDITOR_ROLES = new Set(TEAM_TOOL_ADMIN_ROLES);
const norm = (s) => (s || "").trim().toLowerCase();

function getViewer() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}
function viewerCanSeeHidden(v) {
  if (!v) return false;                       // not signed in → fail closed
  if (v.slackId && isAdminSlackId(v.slackId)) return true;
  if (adminNames("teamDirectory").includes(norm(v.name))) return true;
  return EDITOR_ROLES.has(norm(v.role));
}

// ---- palette -------------------------------------------------------------
const C = {
  red: "#E51636", redDeep: "#B21230", navy: "#1A2238", ink: "#141821",
  sub: "#5B6474", line: "#E7E9EF", paper: "#F6F4EF", card: "#FFFFFF", gold: "#E8B23A",
  amber: "#B7791F", amberBg: "#FEF3C7",
};
const FONT = "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif";

// ---- tier model ----------------------------------------------------------
const TIERS = [
  { key: "ad", label: "Assistant Director", short: "AD" },
  { key: "tl", label: "Team Leaders", short: "TL" },
  { key: "trainer", label: "Team Trainers", short: "TR" },
  { key: "member", label: "Team Members", short: "TM" },
];

// ---- visibility helpers --------------------------------------------------
// UTC → the device's own date; the old form named tomorrow after 8pm Eastern.
const todayISO = () => new Date().toLocaleDateString("en-CA");
// A person is "effectively live" for the team when live, or scheduled with a
// reveal date that has arrived.
function isEffectivelyLive(person) {
  if (!person.vis || person.vis === "live") return true;
  if (person.vis === "scheduled" && person.revealAt && person.revealAt <= todayISO()) return true;
  return false;
}
// visibility badge text for privileged viewers
function visBadge(person) {
  if (!person.vis || person.vis === "live") return null;
  if (person.vis === "hidden") return { t: "Hidden", bg: "#EDEFF3", fg: C.sub };
  if (person.vis === "scheduled") {
    const reached = person.revealAt && person.revealAt <= todayISO();
    return reached
      ? { t: "Revealed", bg: "#E7F6EC", fg: "#2E9E5B" }
      : { t: `Reveals ${person.revealAt || "—"}`, bg: C.amberBg, fg: C.amber };
  }
  return null;
}

/* ═══ THE SEED IS EMPTY, AND THAT IS THE CHANGE ══════════════════════════════
   ⛔ DO NOT PUT PEOPLE BACK IN HERE.

   This block used to hold Gate City's whole directory as a literal: 97 team
   members across seven named teams, two Directors, the five-person leadership
   ladder, and the seven team charters Bri wrote on Jul 22 2026. It was the
   single largest concentration of Gate City people left anywhere in the client
   bundle — 83 of the 106 on the roster were identifiable from it by first name
   — and every store that clones this repo downloaded all of them.

   ═══ WHY DELETING IT IS FREE ══════════════════════════════════════════════
   Gate City stopped reading it a long time ago. The real directory is the KV
   row `gc-team-directory-v1`, written by this tile every time Bri edits it,
   and it was measured before this change rather than assumed:
       7 teams · 91 people · 5 org rows · 2 directors · meta.version 6
   Ninety-one, not ninety-seven — the saved copy has moved on from the seed by
   six people, which is the proof that the seed is a stale snapshot and not the
   source of anything. `meta.version` is already 6, so every migration below has
   run and none of them will consult a charter or an org row again.

   ═══ WHAT ACTUALLY CHANGES ════════════════════════════════════════════════
   One thing, and only on a FAILED READ. `hydrate(null)` used to hand back this
   snapshot, so a blip painted a plausible July directory. Now it hands back an
   empty one, next to the load-failed banner `setLoadFailed(true)` already
   raises. A page that says "we could not load this" and shows nothing is a
   better answer than one that says it and shows six people who have since left.
   ⚠️ NOTHING CAN BE SAVED FROM THAT STATE. The `ok:false` guard below already
   stops both save paths writing a failed load back over the real directory —
   that guard is unchanged and is what makes an empty seed safe rather than
   destructive. Read its comment before touching either save path.

   ═══ AND FOR A NEW STORE ══════════════════════════════════════════════════
   Empty is the correct starting point: no teams, no charters, no ladder, and
   the in-app editors already build all three. `addTeam` writes a blank charter
   from EMPTY_CHARTER, so a store adding its first team gets exactly what Gate
   City got when Bri added hers. Design rule 16 — the empty version works end to
   end before anybody types anything into it.

   ⚠️ THE SHAPE IS UNCHANGED AND MUST STAY THAT WAY (design rule 1). `meta`,
   `directors` and `teams` are all still here and still the same types; only
   their contents are gone. Every reader below keeps working because none of
   them was ever reading a length. */
const EMPTY_CHARTER = { focus: "", mission: "", values: [] };

const SEED = {
  meta: { held: false, version: 6 },
  directors: [],
  teams: [],
};

/* ⚠️ `p()`, `_id`, `ORG_SEED` and `CHARTER_SEED` WERE DELETED WITH THE DATA.
   They existed only to build the literal above. `ORG_SEED` and `CHARTER_SEED`
   still have call sites in `hydrate` and those now read these two empties, so a
   store with no saved ladder gets no ladder rather than Gate City's five
   executives. Both are frozen: they are read on a path that deep-copies them,
   and freezing makes an accidental write to a shared default throw here instead
   of surfacing as one store's charter appearing at another. */
const ORG_SEED = Object.freeze([]);
const CHARTER_SEED = Object.freeze({});

// ---- migration: ensure loaded data has all fields -----------------------
function hydrate(raw) {
  // SEED goes through the SAME pipeline as saved data — otherwise a fresh
  // install lands on teams with no `page` and every charter renders blank.
  if (!raw || !Array.isArray(raw.teams)) raw = SEED;
  const meta = { held: false, version: 2, ...(raw.meta || {}) };
  // ⚠️ Do NOT default `page` here. An earlier version did, which meant the
  // v3→v4 charter migration below tested `if (!t.page)` against a value it
  // had just set itself — the seed never applied and every charter rendered
  // blank. Missing `page` is handled by the migration and by TeamCharter's
  // own `team.page || {...}` fallback.
  const teams = raw.teams.map((t) => ({
    ...t,
    people: (t.people || []).map((pp) => ({
      hrId: null, hrDiffers: false, vis: "live", revealAt: null, override: false, note: "", ...pp,
    })),
  }));
  // ── v2 → v3 migration: clear the stuck NAME PENDING pill ────────────────
  // `provisional` was only ever SET (addTeam sets it true); nothing cleared it
  // and edit mode never showed it, so a saved copy kept the pill forever even
  // after the team was named. Bri named the catering group in-app and the pill
  // stayed. Clear it once here; from v3 on it's a toggle in edit mode.
  if ((meta.version || 0) < 3) {
    teams.forEach((t) => { if (t.id === "catering") t.provisional = false; });
    meta.version = 3;
  }
  // ── v3 → v4: attach Bri's team charters (focus / mission / core values) ──
  // Seeded ONCE by team id. After this every charter lives in the saved blob
  // and is edited in-app; CHARTER_SEED is never read for these ids again.
  if ((meta.version || 0) < 4) {
    teams.forEach((t) => {
      if (!t.page) t.page = CHARTER_SEED[t.id] ? JSON.parse(JSON.stringify(CHARTER_SEED[t.id])) : { ...EMPTY_CHARTER, values: [] };
    });
    meta.version = 4;
  }
  // ── v4 → v5: the leadership ladder for the Our Team view ────────────────
  if ((meta.version || 0) < 5) {
    if (!Array.isArray(raw.org) || !raw.org.length) raw = { ...raw, org: JSON.parse(JSON.stringify(ORG_SEED)) };
    meta.version = 5;
  }
  // ── v5 → v6: REPAIR. Data saved while the bug above was live carries a
  // `page` that exists but is completely empty, so the v4 migration will
  // never revisit it. Re-seed ONLY charters that are still entirely blank —
  // anything Bri has actually typed is left alone.
  if ((meta.version || 0) < 6) {
    teams.forEach((t) => {
      const p = t.page || {};
      const blank = !(p.focus || "").trim() && !(p.mission || "").trim() && !((p.values || []).length);
      if (blank && CHARTER_SEED[t.id]) t.page = JSON.parse(JSON.stringify(CHARTER_SEED[t.id]));
    });
    meta.version = 6;
  }
  return { meta, directors: raw.directors || SEED.directors, org: raw.org || JSON.parse(JSON.stringify(ORG_SEED)), teams };
}

// ---- NON-DESTRUCTIVE HR enrichment --------------------------------------
/* ═══ ONE HR NAME INDEX, AT MODULE LEVEL ═══════════════════════════════════
   ★ THIS BODY IS enrichWithHR'S, MOVED AND NOT REWRITTEN. Every line below is
   byte-for-byte what sat inside that function; only the declaration moved out,
   so the answer it gives for any name is the answer it has always given.

   It moved because a SECOND caller now needs it. The org chart's cards
   (`data.org`, `data.directors`) carry no `hrId` and never have — enrichWithHR
   only ever walked `data.teams` — so "who is Bri Moore, in HR?" had no answer
   anywhere on the Our Team page. The Schedule button needs exactly that answer,
   and answering it a second way would be a second opinion on identity. This
   repo has one of those already and it cost a day (design rule 8).
   ★ Module level, not nested, so no hook body can read it in a dead zone
   (design rule 7). */
function hrIndex(hrList) {
  // index HR by normalized "first lastinitial", by full-first-name, and by id
  const byKey = new Map();
  const byId = new Map();
  /* ★ INDEXED UNDER EVERY NAME THEY ANSWER TO (Bri, Aug 8 2026: "Can we connect
     the 'goes by' names in HR Console to Meet Our Teams/Our Team? ... Bronson
     goes by Denise. I have her listed as Denise in the Team Directory, but I am
     getting an 'out of step' that Bronson doesn't have a team because the two
     are disconnected.")
     The directory holds what the team calls somebody; HR holds what payroll
     does. Indexing only the HR name meant a card written under a goes-by name
     could never find its person. */
  for (const m of Array.isArray(hrList) ? hrList : []) {
    byId.set(String(m.id), m);
    for (const nm of hrNamesOf(m)) {
      const parts = norm(nm).split(/\s+/);
      if (!parts[0]) continue;
      const fi = parts[0] + (parts[1] ? " " + parts[1][0] : "");
      if (!byKey.has(fi)) byKey.set(fi, []);
      byKey.get(fi).push(m);
      if (!byKey.has(parts[0])) byKey.set(parts[0], []);
      byKey.get(parts[0]).push(m);
    }
  }
  const match = (name) => {
    const n = norm(name);
    const parts = n.split(/\s+/);
    const fi = parts[0] + (parts[1] ? " " + parts[1][0].replace(".", "") : "");
    const cands = byKey.get(fi) || byKey.get(parts[0]) || [];
    /* ⚠️ DEDUPED BY ID BEFORE THE AMBIGUITY TEST, AND THIS IS LOAD-BEARING.
       One person is now indexed under two names, so somebody whose goes-by and
       real first name share a key would appear in this list TWICE and the
       length check would read them as two people and refuse to match — turning
       a fix into a regression. Ambiguity means two different PEOPLE. */
    const uniq = [...new Map(cands.map((c) => [String(c.id), c])).values()];
    return uniq.length === 1 ? uniq[0] : null; // only trust unambiguous matches
  };
  return { byId, match };
}

// Attaches hrId + hrDiffers by best-effort name match. Never changes display
// names/tiers. Guarded so a bad/absent HR roster can't crash or mutate state.
function enrichWithHR(data, hrList) {
  if (!Array.isArray(hrList) || !hrList.length) return data;
  const { byId, match } = hrIndex(hrList);
  const teams = data.teams.map((t) => ({
    ...t,
    people: t.people.map((pp) => {
      /* ★★ A STORED hrId IS VERIFIED, NOT TRUSTED (Jul 27 2026).
         This used to read `pp.hrId ? byId.get(pp.hrId) : match(pp.name)` — once
         a number was on a record it was never checked against the NAME sitting
         beside it, so a wrong one could never correct itself and nothing in the
         app could ever notice.

         🔴 WHAT THAT COST: Monica Garcia-Parra's card carried hrId 20, which is
         DAISY HERNANDEZ ESPITIA. Two consequences, both live for days —
         (1) recommendation requests made against Monica were addressed to
         Daisy's id, so Daisy could open and complete confidential requests
         meant for someone else, and Monica saw nothing; and (2) this page
         showed Monica as an Assistant Director while HR had her as a Team
         Leader, because the tier below is derived from whoever the id resolves
         to. One wrong number, two symptoms, no way to self-heal.

         ⚠️ THE CORRECTION IS DELIBERATELY NARROW. It only fires when the name
         resolves to EXACTLY ONE HR record (`match` returns null on any
         ambiguity) AND that record is a different person than the stored id.
         Anything less certain leaves the id alone — a wrong id is bad, but
         re-pointing a RIGHT one at the wrong person on a guess is worse.

         ⚠️ `override` MEANS HANDS OFF. It already protects `tier`; it protects
         the id too, because a leader who hand-set someone is the one case where
         the display name may deliberately differ from the HR name. */
      /* ⚠️ `override` PROTECTS THE TIER, NOT THE IDENTITY. An earlier cut of
         this fix also skipped the id correction on overridden records — and
         that is exactly why Monica Garcia-Parra's card did NOT repair: hers
         carries `override: true`, so the one record the fix was written for was
         the one it stepped around.
         The two are different kinds of fact. A leader hand-setting somebody's
         TIER is a display decision and must stick. WHICH HR RECORD THEY ARE is
         not a decision at all — nothing in this UI ever lets anyone choose an
         `hrId`, so `override` can never mean "I deliberately picked this id".
         The `tier` line below still honours it. */
      /* ★★ A PINNED id IS NEVER RE-POINTED (Jul 28 2026).
         The comment above says the self-correction is safe BECAUSE "nothing in
         this UI ever lets anyone choose an hrId". That is no longer true — the
         edit row now has a "Link to HR record" picker, added for the case name
         matching provably cannot solve: the roster holds BOTH tm26 Lizbeth
         Gonzalez and tm27 Lizbeth Gonzalez Ramos, two real people whose keys
         collide, so `match()` correctly refuses to resolve EITHER of them and
         no spelling of their names will ever fix it.
         Without this guard the matcher could overwrite a hand-picked id the
         moment a name happened to resolve elsewhere — silently undoing the one
         deliberate human decision in this whole function.
         ⚠️ `hrIdPinned` is NOT `override`. `override` protects the display TIER
         and deliberately does NOT protect identity (see above — that is exactly
         why Monica's card failed to repair). This protects identity ONLY, and
         only when someone actively chose it. */
      const byName = match(pp.name);
      const stored = pp.hrId ? byId.get(String(pp.hrId)) : null;
      const misfiled = !pp.hrIdPinned && !!pp.hrId && byName && String(byName.id) !== String(pp.hrId);
      const m = misfiled ? byName : (stored || (pp.hrId ? null : byName));
      if (!m) return pp;
      // HR role DRIVES the team tier — unless a leader has hand-set this person
      // (override), or the HR role doesn't map to a team tier (leave as-is).
      const mapped = hrRoleToTier(m.role);
      const tier = pp.override || !mapped ? pp.tier : mapped;
      /* A correction leaves a trace. An id that silently changes itself is the
         same problem as one that silently stays wrong — nobody can tell it
         happened, or what it used to be. */
      return misfiled
        ? { ...pp, hrId: m.id, tier, hrIdWas: String(pp.hrId), hrIdFixedAt: new Date().toISOString() }
        : { ...pp, hrId: m.id, tier };
    }),
  }));
  return { ...data, teams };
}
// ── HR SYNC: hires and terminations ────────────────────────────────────────
// enrichWithHR above only ever updates the TIER of somebody already listed —
// it has never added a new hire or removed a leaver, which is why this page
// drifts from HR Console. This computes the difference; it does NOT apply it.
//
// The two halves are deliberately asymmetric:
//   • TERMINATION is fully determinable — HR says terminated, so they come off.
//   • A HIRE IS NOT. Nothing on the HR record says which team someone joins,
//     so a new hire can only be SURFACED for a leader to place. Auto-adding
//     would have to pick a team, and any pick would be a guess.
//
// Nobody is judged "unplaced" on a failed name match: a person counts as placed
// if EITHER their resolved hrId OR their normalized name key already appears on
// a team, so an ambiguous name (which enrichWithHR refuses to resolve) shows up
// as placed rather than as a phantom new hire.
function computeHrSync(data, hrList, statusMap) {
  if (!data || !Array.isArray(hrList) || !hrList.length) return { terminated: [], unplaced: [] };
  const sm = statusMap || {};
  // TWO keys per name, matching how enrichWithHR indexes: "first lastinitial"
  // AND bare "first". The directory carries plain first names ("Marchelle")
  // while HR carries full ones ("Marchelle Boone") — keying only on the long
  // form makes an already-listed person look like a brand-new hire, and placing
  // them would duplicate them onto a team.
  // Looseness is the SAFE direction here: a false "already placed" just means a
  // leader adds someone by hand, while a false "unplaced" creates a duplicate.
  const nameKeys = (n) => {
    const parts = norm(n).split(/\s+/);
    if (!parts[0]) return [];
    const out = [parts[0]];
    if (parts[1]) out.push(parts[0] + " " + parts[1][0].replace(".", ""));
    return out;
  };

  const placedIds = new Set();
  const placedNames = new Set();
  const terminated = [];
  /* 🐛 DIRECTORS WERE NEVER COUNTED AS PLACED (Bri, Aug 7 2026: "Brandon and
     Daisy are pulling from HR Console as ADs to the Our Teams page -- it's
     showing they need a team assignment due to this. Can you tell me if there is
     a connection missing — they are directors?").
     There was. This only ever walked data.teams[].people, and `directors` is its
     own array. Daisy directs three teams and Brandon directs three teams; they
     are not members of one and never will be. HR holds both as Assistant
     Director, which maps to a real team tier, so they qualified for the unplaced
     list and nothing on the page could ever take them off it — placing them on a
     team would have been the wrong fix and would have duplicated them.
     ⚠️ BEING NAMED AS A TEAM'S DIRECTOR IS BEING PLACED. Same two keys as the
     member loop below, so a directory holding "Daisy Hernandez" still matches an
     HR record reading "Daisy Hernandez Espitia". */
  for (const d of data.directors || []) {
    if (!d) continue;
    if (d.hrId != null) placedIds.add(String(d.hrId));
    for (const k of nameKeys(d.name || "")) placedNames.add(k);
  }
  for (const t of data.teams || []) {
    for (const pp of t.people || []) {
      if (pp.hrId != null) placedIds.add(String(pp.hrId));
      for (const k of nameKeys(pp.name)) placedNames.add(k);
      if (pp.hrId != null && sm[pp.hrId] === "terminated") {
        terminated.push({ teamId: t.id, teamName: t.name, personId: pp.id, name: pp.name, hrId: String(pp.hrId) });
      }
    }
  }

  const unplaced = [];
  for (const m of hrList) {
    if (sm[m.id] === "terminated") continue;
    // Only roles that map to a team position belong on these pages — Owner,
    // Executive Directors, HR and Payroll are not team members and would
    // otherwise show up forever as "never placed".
    if (!hrRoleToTier(m.role)) continue;
    if (placedIds.has(String(m.id))) continue;
    /* Every name they answer to, not just the HR one — Bronson is on a team
       under "Denise", and checking only the HR spelling is what put him on the
       "needs a team" list while his card sat there the whole time. */
    if (hrNamesOf(m).some((nm) => nameKeys(nm).some((k) => placedNames.has(k)))) continue;
    unplaced.push({ hrId: String(m.id), name: m.name, role: m.role, tier: hrRoleToTier(m.role) });
  }
  return { terminated, unplaced };
}

// Map an HR Console role to a directory team tier. Returns null for roles that
// don't correspond to a team position (so the sheet's tier is left untouched).
const hrRoleToTier = (role) => {
  const r = (role || "").toLowerCase();
  if (r.includes("assistant director")) return "ad";
  if (r.includes("team leader")) return "tl";
  if (r.includes("trainer")) return "trainer";
  if (r === "team member" || r === "employee") return "member";
  return null;
};

// ---- persistence ---------------------------------------------------------
/* ⚠️ ok:false = the read FAILED, not "nothing stored". hydrate(null) falls back
   to the SEED, and both save paths would then write seed over the real
   directory — 106 people, team assignments, charters. Callers must not save
   anything that came from a failed load. */
async function loadData() {
  const r = await kvGetResult(STORE_KEY);
  return { ok: r.ok, data: hydrate(r.ok ? r.value : null) };
}
async function saveData(data) { try { return await kvSet(STORE_KEY, data); } catch { return false; } }

// ---- ui atoms ------------------------------------------------------------
const initials = (n) => (n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

/* ── SLACK PROFILE PHOTOS ───────────────────────────────────────────────────
   Bri, Jul 25: "These are still not showing the pics from HR console."
   She was right and it wasn't a matching failure — `Avatar` never looked a
   photo up at all. The `slack-avatars` job has been populating
   `hr:slack-avatars:v1` (105 members, ~67 with photos) and this page simply
   never read it.

   ⚠️ NAMES DISAGREE BETWEEN THE TWO SIDES. The map is keyed on Slack's version
   of a name; the directory holds its own. Bri's own card shows "Ben Smith"
   where Slack and the roster both say "Benjamin Smith" — an exact lookup misses
   him with a photo sitting right there. So: exact, then first+last-initial,
   then bare first name ONLY when it belongs to exactly one person.
   ⚠️ AMBIGUOUS RESOLVES TO NOTHING. Two Ashleys sharing a first name means
   neither gets a photo from that key — showing the wrong person's face is worse
   than showing initials, which is what this page already did happily.        */
const AVATAR_KEY = "hr:slack-avatars:v1";
// normName comes from nameMatch.js (imported at the top). This file used to
// carry a byte-identical copy; one definition means it can never drift from the
// rules HR and the Slack lookups use.

// One fetch per page load, shared by every Avatar on it. A module-level promise
// rather than a hook so 100 avatars don't trigger 100 reads.
let _photoPromise = null;
function loadPhotoIndex() {
  if (_photoPromise) return _photoPromise;
  _photoPromise = (async () => {
    try {
      /* 🐛 THE `clash` SET THAT USED TO SIT HERE WAS DEAD CODE. It was built,
         `short` was never written to, so the `if (short[k] ...)` test could
         never be true and the delete loop never ran. A guard that cannot fire
         reads as protection to the next person and is worse than no guard —
         same shape as the comment in DailySetup that claimed a matcher
         "refuses to guess" when it does not. Deleted, and replaced with a
         rule that actually runs.
         ★ AMBIGUITY IS A PROPERTY OF THE ROSTER, NOT OF WHO HAPPENS TO HAVE A
         PHOTO. DailySetup.jsx settled this one day earlier and the rule was
         never carried here. Count how many people on the ROSTER answer to each
         first name; the photo map cannot tell you, because Slack holding a
         single Adriana only means the other one never joined Slack. */
      const [raw, hr] = await Promise.all([
        kvGet(AVATAR_KEY).then((v) => v || {}).catch(() => ({})),
        loadHRTeamResult().catch(() => ({ ok: false, team: [] })),
      ]);
      const byName = raw.byName || {};
      const roster = (hr && Array.isArray(hr.team)) ? hr.team : [];
      const owners = new Map();
      roster.forEach((m) => {
        const k = normName(String((m && m.name) || "").trim().split(/\s+/)[0] || "");
        if (k) owners.set(k, (owners.get(k) || 0) + 1);
      });
      const sharedFirst = new Set();
      owners.forEach((n, k) => { if (n > 1) sharedFirst.add(k); });
      /* ⚠️ FAILS SAFE, NOT OPEN. With no roster we cannot know who is a
         namesake, and this file already settled the trade at the bottom of
         photoFor: a missing photo is a nuisance, the wrong person's photo on
         their card is not. Empty roster means no bare-first-name key resolves
         at all. */
      return { byName, keys: Object.keys(byName), sharedFirst, rosterKnown: roster.length > 0 };
    } catch { return { byName: {}, keys: [], sharedFirst: new Set(), rosterKnown: false }; }
  })();
  return _photoPromise;
}

function photoFor(name, idx) {
  if (!idx || !name) return "";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const exact = idx.byName[normName(parts.join(""))];
  if (exact) return exact;
  if (parts.length < 2) return "";
  const first = normName(parts[0]);
  const init = normName(parts[1].charAt(0));
  // A Slack key that starts with the same first name AND carries the same next
  // initial — "bensmith" won't reach "benjaminsmith", but "benjamins" will.
  const hits = idx.keys.filter((k) => {
    if (!k.startsWith(first)) return false;
    const rest = k.slice(first.length);
    if (rest) return rest.charAt(0) === init;
    /* 🐛 THIS BRANCH USED TO BE A BARE `true`, AND IT MATCHED EVERY INITIAL.
       A Slack key that IS a bare first name — `adriana` — reached Adriana
       Arias Hurtado (initial "a") AND Adriana Carrera Reyes (initial "c"). The
       dedupe below then saw one URL from one key, called it "exactly one
       match", and drew the same face on both cards. One photo, two people, and
       the directory looked perfectly normal — the identical shape as the setup
       board bug Bri reported.
       ⇒ A bare key is only trustworthy when exactly ONE person on the roster
       answers to that first name. Where two do, this returns nothing and both
       fall back to initials, which is the answer this file already argues for
       at the bottom of this function. */
    return idx.rosterKnown && !idx.sharedFirst.has(first);
  });
  /* ★ AMBIGUOUS MEANS TWO PHOTOS, NOT TWO KEYS.
     🐛 Matt, Aug 3 2026: "the setup and team registry dont have all of the
     pics." One cause here: a person with more than one Slack alias failed this
     test even when every alias pointed at the SAME photo. Brooke Southern
     matches `brooke` and `brookesouthernstar` — two keys, one picture — and
     was refused for being "ambiguous" between herself and herself.
     Checked against the live map before changing it: brooke and adriana are
     2 keys / 1 photo and should resolve; valerie is 3 keys / 2 photos and
     camila 4 keys / 3 photos, which are genuinely different people and still
     correctly refused. Deduping on the URL keeps every real safeguard and
     drops the false one. */
  const urls = [...new Set(hits.map((k) => idx.byName[k]).filter(Boolean))];
  if (urls.length === 1) return urls[0];
  /* FIRST + LAST, skipping any middle name. Slack display names routinely drop
     it — Monica Cerros Vergara is `monicavergara` — so without this she loses
     her photo for having a middle name. Still a FULL two-name match, so it
     cannot collide the way a first name alone does: Monica Garcia-Parra
     resolves to `monicagarciaparra`, which nobody holds. */
  if (parts.length > 2) {
    const firstLast = idx.byName[normName(parts[0] + parts[parts.length - 1])];
    if (firstLast) return firstLast;
  }
  /* ⚠️ THE FIRST-NAME-ONLY FALLBACK IS DELETED. It read "only one person in
     Slack answers to this first name, so it must be them" — but the Slack
     directory is not the roster. Hannah, Jul 27: Monica Garcia-Parra's card was
     showing Monica Cerros Vergara's photo. `monicagarciaparra` missed on the
     full name, missed on first-name+initial (`monicavergara` carries a "v", not
     a "g"), then matched the last resort because exactly one Slack key begins
     with "monica" — and returned the wrong colleague's face with total
     confidence.

     ★ ONE CANDIDATE IS NOT THE SAME AS ONE MATCH. Slack holding a single
     Monica says nothing about how many Monicas work here; it says the others
     never joined Slack. That is the fatal-ambiguity rule already applied to the
     reminder keys: a missing photo is a nuisance, the wrong person's photo on
     their card is not. */
  return "";
}
function Avatar({ name, tier, size = 40 }) {
  const bg = tier === "ad" ? C.navy : tier === "tl" ? C.red : tier === "trainer" ? C.gold : "#C6CBD6";
  const fg = tier === "trainer" ? C.ink : "#fff";
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    loadPhotoIndex().then((idx) => { if (live) setSrc(photoFor(name, idx)); });
    return () => { live = false; };
  }, [name]);
  // A broken or expired image URL falls straight back to initials rather than
  // leaving a grey box — the initials were never wrong, just less personal.
  if (src) {
    return <img src={src} alt="" onError={() => setSrc("")}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0,
        background: bg }} />;
  }
  return <div style={{ width: size, height: size, borderRadius: "50%", background: bg, color: fg,
    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
    fontSize: size * 0.34, flexShrink: 0, letterSpacing: "-.02em" }}>{initials(name)}</div>;
}
function Btn({ children, onClick, kind = "ghost", small }) {
  const kinds = { solid: { background: C.red, color: "#fff", border: "none" },
    ghost: { background: "transparent", color: C.sub, border: `1px solid ${C.line}` },
    danger: { background: "#FBEAED", color: C.redDeep, border: "none" } };
  return <button onClick={onClick} style={{ cursor: "pointer", fontFamily: FONT, fontWeight: 600,
    borderRadius: 9, padding: small ? "5px 10px" : "9px 16px", fontSize: small ? 12.5 : 14, ...kinds[kind] }}>{children}</button>;
}
const inp = (grow) => ({ flex: grow ? 1 : "none", minWidth: 0, fontFamily: FONT, fontSize: 14,
  padding: "7px 9px", borderRadius: 8, border: `1px solid ${C.line}`, color: C.ink, background: "#fff", outline: "none" });

// ---- person row ----------------------------------------------------------
function PersonRow({ person, editing, canSeeHidden, hrList, onChange, onDelete }) {
  const live = isEffectivelyLive(person);
  const badge = visBadge(person);
  // team members never see non-live people (safety belt — parent also filters)
  if (!editing && !canSeeHidden && !live) return null;

  if (!editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "7px 0", opacity: live ? 1 : 0.62 }}>
        <Avatar name={person.name} tier={person.tier} size={36} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: C.ink, fontSize: 14.5, lineHeight: 1.2 }}>
            {person.name}
            {person.note && <span style={{ color: C.sub, fontWeight: 500 }}> · {person.note}</span>}
          </div>
        </div>
        {badge && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, background: badge.bg,
          color: badge.fg, padding: "2px 8px", borderRadius: 20 }}>{badge.t}</span>}
      </div>
    );
  }

  // editing row
  return (
    <div style={{ padding: "7px 0", borderBottom: `1px solid ${C.paper}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Avatar name={person.name || "?"} tier={person.tier} size={32} />
        <input value={person.name} placeholder="Name"
          onChange={(e) => onChange({ ...person, name: e.target.value, override: true })} style={inp(1)} />
        <select value={person.tier} onChange={(e) => onChange({ ...person, tier: e.target.value, override: true })}
          style={{ ...inp(0), width: 120, flex: "none" }}>
          {TIERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <button onClick={onDelete} title="Remove" style={{ border: "none", background: "#FBEAED",
          color: C.redDeep, borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 16, flexShrink: 0 }}>×</button>
      </div>
      {/* ── Link to HR record ──────────────────────────────────────────
          Shown ONLY when nothing resolved. `enrichWithHR` attaches an hrId by
          name and refuses on any ambiguity, so a blank here means the matcher
          gave up — and for some people it always will: the roster holds both
          tm26 Lizbeth Gonzalez and tm27 Lizbeth Gonzalez Ramos, two real
          people whose name keys collide. No spelling fixes that; somebody has
          to say which is which, once.
          ⚠️ Without an hrId a person's recommendation requests and evaluation
          assignments fall back to name matching — the fault that hid live Team
          Leader applications for days. This is the manual escape hatch for the
          handful the matcher can't reach. */}
      {!person.hrId && Array.isArray(hrList) && hrList.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, paddingLeft: 40, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: ".05em" }}>Not linked to HR</span>
          <select value="" onChange={(e) => { const v = e.target.value; if (v) onChange({ ...person, hrId: v, hrIdPinned: true }); }}
            style={{ ...inp(0), width: 230, flex: "none" }}>
            <option value="">Link to HR record…</option>
            {[...hrList].sort((a, b) => String(a.name).localeCompare(String(b.name)))
              .map((m) => <option key={m.id} value={String(m.id)}>{hrDisplayName(m)}{m.role ? ` — ${m.role}` : ""}</option>)}
          </select>
        </div>
      )}
      {/* A pinned link says so, and can be undone — a wrong pin must not be
          permanent, and it cannot self-correct the way a matched id does. */}
      {person.hrId && person.hrIdPinned && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, paddingLeft: 40, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "#0F766E", textTransform: "uppercase", letterSpacing: ".05em" }}>
            Linked by hand{(() => { const m = (hrList || []).find((x) => String(x.id) === String(person.hrId)); return m ? ` · ${hrDisplayName(m)}` : ""; })()}
          </span>
          <button onClick={() => onChange({ ...person, hrId: null, hrIdPinned: false })}
            style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.sub, borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Unlink</button>
        </div>
      )}
      {/* visibility controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, paddingLeft: 40, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: ".05em" }}>Visibility</span>
        {[["live", "Live"], ["hidden", "Hidden"], ["scheduled", "Scheduled"]].map(([k, lbl]) => (
          <button key={k} onClick={() => onChange({ ...person, vis: k, revealAt: k === "scheduled" ? (person.revealAt || todayISO()) : null })}
            style={{ border: `1px solid ${person.vis === k ? C.red : C.line}`, background: person.vis === k ? "#FBEAED" : "#fff",
              color: person.vis === k ? C.redDeep : C.sub, borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{lbl}</button>
        ))}
        {person.vis === "scheduled" && (
          <input type="date" value={person.revealAt || todayISO()}
            onChange={(e) => onChange({ ...person, revealAt: e.target.value })}
            style={{ ...inp(0), width: 150, flex: "none" }} />
        )}
        {person.note !== undefined && (
          <input value={person.note} placeholder="note"
            onChange={(e) => onChange({ ...person, note: e.target.value, override: true })}
            style={{ ...inp(0), width: 100, flex: "none" }} />
        )}
      </div>
    </div>
  );
}

// ---- team card -----------------------------------------------------------
function TeamCard({ team, director, allDirectors = [], editing, canSeeHidden, hrList, onChange, onDelete, onMove, canMoveUp, canMoveDown, onOpenCharter }) {
  const visiblePeople = editing || canSeeHidden ? team.people : team.people.filter(isEffectivelyLive);
  // Bri, Jul 24: "Can Team Members and Trainers be automatically alphabatized in
  // these lists by first name within their sections?"
  // ⚠️ ONLY those two tiers. Assistant Director and Team Leader sections hold
  // one to three people and the AD is the team lead, so the order there may be
  // deliberate — alphabetising them would silently reorder a hierarchy she
  // didn't ask about. `byFirstName` is the same comparator the Our Team ladder
  // already uses, so the two pages now agree. `.slice()` first: sort mutates,
  // and `visiblePeople` can be `team.people` itself.
  const ALPHA_TIERS = new Set(["trainer", "member"]);
  const grouped = TIERS.map((t) => {
    const people = visiblePeople.filter((pp) => pp.tier === t.key);
    return { ...t, people: ALPHA_TIERS.has(t.key) ? people.slice().sort(byFirstName) : people };
  });
  const lead = team.people.find((pp) => pp.tier === "ad");
  const count = visiblePeople.length;
  const area = areaOf(team, director);

  const setPerson = (id, next) => onChange({ ...team, people: team.people.map((pp) => (pp.id === id ? next : pp)) });
  const delPerson = (id) => onChange({ ...team, people: team.people.filter((pp) => pp.id !== id) });
  const addPerson = (tier) => onChange({ ...team, people: [...team.people,
    { id: `p${Date.now()}`, name: "", tier, note: "", hrId: null, hrDiffers: false, vis: "live", revealAt: null, override: true }] });

  return (
    <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, overflow: "hidden", boxShadow: "0 1px 2px rgba(20,24,33,.04)" }}>
      <div style={{ background: C.red, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <>
              <input value={team.name} onChange={(e) => onChange({ ...team, name: e.target.value })}
                style={{ ...inp(1), width: "100%", fontWeight: 800, fontSize: 17, background: "rgba(255,255,255,.16)", color: "#fff", border: "1px solid rgba(255,255,255,.35)" }} />
              {/* Bri, Jul 23: "a drop option of which area Director needs to cover
                  that team to ensure that they are always correct". `area` is only a
                  LABEL — `director` is what actually decides who a team sits under,
                  which is why setting the label alone never moved Perfect Platers. */}
              <select value={team.director || ""} onChange={(e) => onChange({ ...team, director: e.target.value || null })}
                style={{ ...inp(1), width: "100%", marginTop: 6, fontSize: 13, background: "rgba(255,255,255,.16)", color: "#fff", border: "1px solid rgba(255,255,255,.35)" }}>
                <option value="" style={{ color: C.ink }}>— No Director —</option>
                {allDirectors.map((d) => <option key={d.id} value={d.id} style={{ color: C.ink }}>{d.name} · {d.title}</option>)}
              </select>
              <input value={team.area || ""} placeholder={director ? `Area — defaults to ${director.title.replace(" Director", "")}` : "Area — e.g. FOH, BOH, Catering"}
                onChange={(e) => onChange({ ...team, area: e.target.value })}
                style={{ ...inp(1), width: "100%", marginTop: 6, fontSize: 13, background: "rgba(255,255,255,.16)", color: "#fff", border: "1px solid rgba(255,255,255,.35)" }} />
              <button onClick={() => onChange({ ...team, provisional: !team.provisional })}
                title="Show or hide the NAME PENDING pill on this team"
                style={{ marginTop: 6, fontSize: 11, fontWeight: 700, letterSpacing: ".02em", color: "#fff", cursor: "pointer",
                  background: team.provisional ? "rgba(255,255,255,.28)" : "transparent",
                  border: "1px solid rgba(255,255,255,.45)", borderRadius: 20, padding: "3px 9px" }}>
                {team.provisional ? "NAME PENDING · tap to clear" : "+ mark name pending"}
              </button>
            </>
          ) : (
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 18, letterSpacing: "-.01em", lineHeight: 1.1 }}>
              {team.name}
              {team.provisional && <span style={{ fontSize: 11, fontWeight: 700, background: "rgba(255,255,255,.22)", padding: "2px 7px", borderRadius: 20, marginLeft: 8, verticalAlign: "middle" }}>NAME PENDING</span>}
            </div>
          )}
          <div style={{ color: "rgba(255,255,255,.85)", fontSize: 12.5, marginTop: 2, fontWeight: 500 }}>
            {lead ? `Led by ${lead.name}` : "No AD assigned"}{area && ` · ${area}`}{" · "}{count} {count === 1 ? "person" : "people"}
          </div>
          <button onClick={onOpenCharter}
            style={{ marginTop: 9, border: "1px solid rgba(255,255,255,.5)", background: "rgba(255,255,255,.14)", color: "#fff",
              fontFamily: FONT, fontWeight: 700, fontSize: 12.5, borderRadius: 20, padding: "4px 12px", cursor: "pointer" }}>
            Team Charter →
          </button>
        </div>
        {editing && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button onClick={() => onMove(-1)} disabled={!canMoveUp} title="Move team up"
              style={{ border: "none", background: "rgba(255,255,255,.18)", color: "#fff", borderRadius: 8, width: 30, height: 30, cursor: canMoveUp ? "pointer" : "default", opacity: canMoveUp ? 1 : 0.4, fontSize: 13 }}>▲</button>
            <button onClick={() => onMove(1)} disabled={!canMoveDown} title="Move team down"
              style={{ border: "none", background: "rgba(255,255,255,.18)", color: "#fff", borderRadius: 8, width: 30, height: 30, cursor: canMoveDown ? "pointer" : "default", opacity: canMoveDown ? 1 : 0.4, fontSize: 13 }}>▼</button>
            <button onClick={onDelete} title="Delete team"
              style={{ border: "none", background: "rgba(255,255,255,.18)", color: "#fff", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 17 }}>×</button>
          </div>
        )}
      </div>
      <div style={{ padding: "6px 18px 16px" }}>
        {grouped.map((g) => ((g.people.length > 0 || editing) && (
          <div key={g.key} style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".07em", textTransform: "uppercase", color: C.sub }}>{g.label}</span>
              <span style={{ height: 1, flex: 1, background: C.line }} />
              {editing && <button onClick={() => addPerson(g.key)} style={{ border: `1px dashed ${C.line}`, background: "#fff", color: C.sub, borderRadius: 7, padding: "2px 8px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>+ add</button>}
            </div>
            {g.people.map((pp) => (
              <PersonRow key={pp.id} person={pp} editing={editing} canSeeHidden={canSeeHidden} hrList={hrList}
                onChange={(n) => setPerson(pp.id, n)} onDelete={() => delPerson(pp.id)} />
            ))}
          </div>
        )))}
      </div>
    </div>
  );
}

// ---- Our Team (leadership) ----------------------------------------------
// ── Team Charter: focus / mission / core values, one per team ─────────────
// Bri asked for a button beside each team name opening a page of that team's
// Team Focus, Mission Statement and Core Values, editable by her, and ready
// for any team added later. The charter lives on `team.page` inside the same
// KV blob, so it travels with the team and a rename can never orphan it.
function TeamCharter({ team, director, editing, onChange, onBack }) {
  const page = team.page || { focus: "", mission: "", values: [] };
  const setPage = (patch) => onChange({ ...team, page: { ...page, ...patch } });
  const setValue = (i, patch) => setPage({ values: page.values.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  const addValue = () => setPage({ values: [...page.values, { label: "", text: "" }] });
  const delValue = (i) => setPage({ values: page.values.filter((_, j) => j !== i) });
  const moveValue = (i, d) => {
    const n = [...page.values]; const t = i + d;
    if (t < 0 || t >= n.length) return;
    [n[i], n[t]] = [n[t], n[i]];
    setPage({ values: n });
  };

  const label = (txt) => (
    <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: C.sub, marginBottom: 8 }}>{txt}</div>
  );

  return (
    <div>
      <button onClick={onBack} style={{ border: "none", background: "none", color: C.sub, fontFamily: FONT, fontSize: 14, cursor: "pointer", fontWeight: 700, padding: "0 0 14px" }}>
        ← Back to teams
      </button>

      <div style={{ background: C.red, borderRadius: 16, padding: "22px 22px 20px", color: "#fff", marginBottom: 18 }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", opacity: .8 }}>Team Charter</div>
        <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: "-.02em", lineHeight: 1.15, marginTop: 4 }}>{team.name}</div>
        <div style={{ fontSize: 13, opacity: .9, marginTop: 4, fontWeight: 500 }}>
          {areaOf(team, director) ? areaOf(team, director) + " · " : ""}{team.people.filter(isEffectivelyLive).length} people
        </div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 20, marginBottom: 14 }}>
        {label("Team Focus")}
        {editing ? (
          <input value={page.focus} placeholder="e.g. Hospitality" onChange={(e) => setPage({ focus: e.target.value })}
            style={{ ...inp(1), width: "100%", fontWeight: 800, fontSize: 18 }} />
        ) : (
          <div style={{ fontWeight: 800, fontSize: 20, color: C.ink, letterSpacing: "-.01em" }}>{page.focus || "Not set yet"}</div>
        )}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 20, marginBottom: 14 }}>
        {label("Mission Statement")}
        {editing ? (
          <textarea value={page.mission} rows={5} placeholder="What this team exists to do…" onChange={(e) => setPage({ mission: e.target.value })}
            style={{ ...inp(1), width: "100%", fontSize: 15, lineHeight: 1.55, resize: "vertical", fontFamily: FONT }} />
        ) : (
          <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.6, color: C.ink }}>{page.mission || "Not written yet."}</p>
        )}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          {label("Core Values")}
          {editing && <Btn small kind="solid" onClick={addValue}>+ Add value</Btn>}
        </div>
        {page.values.length === 0 && !editing && (
          <p style={{ margin: 0, color: C.sub, fontSize: 14.5 }}>No core values written yet.</p>
        )}
        <div style={{ display: "grid", gap: 10 }}>
          {page.values.map((v, i) => (
            <div key={i} style={{ borderLeft: `3px solid ${C.red}`, borderTop: `3px solid ${C.red}`, paddingLeft: 12 }}>
              {editing ? (
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input value={v.label} placeholder="Value name" onChange={(e) => setValue(i, { label: e.target.value })}
                      style={{ ...inp(1), flex: 1, fontWeight: 800, fontSize: 15 }} />
                    <button onClick={() => moveValue(i, -1)} disabled={i === 0} title="Move up"
                      style={{ border: `1px solid ${C.line}`, background: "#fff", borderRadius: 7, cursor: i === 0 ? "default" : "pointer", padding: "4px 8px", opacity: i === 0 ? .35 : 1 }}>▲</button>
                    <button onClick={() => moveValue(i, 1)} disabled={i === page.values.length - 1} title="Move down"
                      style={{ border: `1px solid ${C.line}`, background: "#fff", borderRadius: 7, cursor: i === page.values.length - 1 ? "default" : "pointer", padding: "4px 8px", opacity: i === page.values.length - 1 ? .35 : 1 }}>▼</button>
                    <button onClick={() => delValue(i)} title="Remove value"
                      style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.red, borderRadius: 7, cursor: "pointer", padding: "4px 8px", fontWeight: 700 }}>✕</button>
                  </div>
                  <textarea value={v.text} rows={2} placeholder="Optional description — leave blank for a one-word value"
                    onChange={(e) => setValue(i, { text: e.target.value })}
                    style={{ ...inp(1), width: "100%", fontSize: 14, lineHeight: 1.5, resize: "vertical", fontFamily: FONT }} />
                </div>
              ) : (
                <>
                  <div style={{ fontWeight: 800, fontSize: 15.5, color: C.ink }}>{v.label}</div>
                  {v.text && <div style={{ fontSize: 14.5, color: C.sub, lineHeight: 1.55, marginTop: 2 }}>{v.text}</div>}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Our Team: the whole ladder, top to bottom ────────────────────────────
// Bri's spec: Owner/Operator → Executive Directors → Directors → Assistant
// Directors → Team Leaders → Trainers, with notes from Meet Our Teams showing
// beside each name. The bottom three bands are DERIVED from the team
// breakdowns by `person.tier`, and tier is HR-synced — so when someone's title
// changes in HR they move band automatically, which is exactly what she asked
// for. ADs keep the team order set in Meet Our Teams; TLs and Trainers are
// alphabetical by first name.
/* Bri, Jul 23: "Where is the FOH or BOH distinction on Meet Our Teams coming
   from? I see Monica's team does not have this." — it was DERIVED, never
   stored: the label was `director.title.replace(" Director", "")`, so a team
   owned by Daisy read FOH, one owned by Brandon read BOH, and Perfect Platers
   (no director) read nothing at all. She wants it accurate AND editable.
   Now: `team.area` wins if set, the director-derived value is the fallback, so
   nothing changes for the six teams that were already right and she can set or
   correct any of them — including the ones with no director. */
const areaOf = (team, director) =>
  (team && team.area) || (director ? director.title.replace(" Director", "") : "");

const byFirstName = (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

// Bri, Jul 23: distinguish the tiers by colour, keeping Nick + the Executive
// Directors as they are. One deliberate ramp rather than six unrelated hues —
// deep red for Directors, brand red for ADs, gold for Team Leaders, slate for
// Trainers. Rank reads top-to-bottom in saturation, so the page still scans as
// one palette instead of a rainbow.
const TIER_TONE = {
  director: C.redDeep,
  ad: C.red,
  tl: C.gold,
  trainer: C.sub,
};

/* ═══ THE SCHEDULE BUTTON ═══════════════════════════════════════════════════
   Bri, Aug 10 2026: "The team can go there to our names and see a 'Schedule'
   button underneath each director, HR, or Ex Director to schedule a meeting
   type they're allowed to schedule."

   ⚠️ NOT GATED ON WHICH BAND THE CARD IS IN. It would have been easy to draw
   the button on the Owner, Executive Director and Director rows and stop — but
   then the day somebody is promoted to Director the button appears from their
   HR title, not from a list in this file, which is the whole reason
   adminRoles.js exists. It asks the real question instead: does this person own
   an event type this viewer is allowed to book? An Assistant Director gets no
   button because no event type is hers, not because a band said so.

   ⚠️ EVERY ARM FAILS CLOSED, and the reason is that this is a permission
   surface on a page the whole store reads. No calendar types loaded, a name
   that resolves to nobody or to two people, a status that is not Active, a
   title that is not an owner title — all of them draw no button. Refusing to
   offer a booking is a shrug; offering time with somebody who left is a person
   standing in the lobby.

   ⚠️ THE BUTTON IS NOT THE GATE. /api/calendar re-derives who you are and what
   tier you hold from the signed token and checks all of this again. Nothing
   here is load-bearing for security — it decides what is worth showing. */
function bookableWith(name, ctx) {
  if (!ctx || !ctx.idx || !Array.isArray(ctx.types) || ctx.types.length === 0) return null;
  const m = ctx.idx.match(name);
  if (!m) return null;
  const id = String(m.id);
  /* The LIVE title: the HR override first, then their roster record, then the
     seed. `hrTitleFor` is the one definition of that precedence and the Worker
     answers the same question the same way. */
  const title = hrTitleFor(id, ctx.roles, ctx.roster);
  /* ★ THE PERSON-SCOPED CLAMP IS APPLIED HERE TOO. accessOverrides is empty
     today — Kyleeka's restriction was lifted Jul 29 — so this changes nothing
     right now, and that is exactly when to wire it. The day somebody is put on
     that list because they are on their way out, "judged as a Team Member
     everywhere" has to include "cannot be booked", or the one surface that
     still offers their time is the org chart the whole store reads. */
  const role = effectiveRole({ name: m.name, role: title });
  const accepting = ownerAccepting({ status: (ctx.status && ctx.status[id]) || "Active", role });
  const types = bookableTypes(ctx.types, id, ctx.tier, accepting);
  return types.length ? { id, name: hrDisplayName(m) || m.name, types } : null;
}

/* What tier the signed-in person holds. App.jsx re-derives this from the roster
   on every mount and writes it here, so it is a cache of the roster rather than
   a claim the device gets to make.
   ⚠️ ANYTHING UNREADABLE MEANS TIER 1 — the lowest, so an unreadable value can
   only ever show FEWER event types, never more. */
const readViewerTier = () => {
  try {
    const n = parseInt(localStorage.getItem("gcfcr-access-tier"), 10);
    return Number.isFinite(n) && n >= 1 ? n : 1;
  } catch { return 1; }
};

const fmtCalWhen = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? String(s)
    : d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

/* The booking sheet. Opens over the org chart because the Hub has no URL
   routing — there is nowhere to navigate TO. */
function BookSheet({ owner, viewer, onClose }) {
  const [slots, setSlots] = useState(null);          // null = still loading
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    const r = await kvGetResult(calSlotsKey(owner.id));
    /* A failed read is not "no times available". Saying that would send
       somebody away believing this person has nothing free. */
    setFailed(!r.ok);
    setSlots(Array.isArray(r.value) ? r.value : []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [owner.id]);

  /* ⚠️ BOOKING AND CANCELLING BOTH GO THROUGH THE ROUTE, never a direct write.
     Two people tapping the same time in the same second is the whole reason it
     exists, and only the server can decide which of them got it. */
  const act = async (action, slotId) => {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
        body: JSON.stringify({ action, ownerId: bareId(owner.id), slotId }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || d.ok !== true) setErr((d && d.error) || "That did not go through. Try again.");
    } catch { setErr("That did not go through. Check the wifi."); }
    await load();
    setBusy(false);
  };

  const pill = (solid) => ({ fontFamily: FONT, fontSize: 13, fontWeight: 700, borderRadius: 9,
    padding: "7px 13px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
    border: solid ? "none" : `1px solid ${C.line}`,
    background: solid ? C.red : "#fff", color: solid ? "#fff" : C.sub });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(20,24,33,.45)",
      display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 0 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.paper, width: "100%", maxWidth: 560,
        borderRadius: "18px 18px 0 0", maxHeight: "86vh", overflowY: "auto", padding: "18px 20px 28px", fontFamily: FONT }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <Avatar name={owner.name} tier="ad" size={38} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Schedule with {owner.name}</div>
            <div style={{ color: C.sub, fontSize: 12.5 }}>Pick a time that works for you.</div>
          </div>
          <button onClick={onClose} style={{ ...pill(false), padding: "6px 11px" }}>Close</button>
        </div>

        {failed && (
          <div style={{ background: C.amberBg, color: C.amber, borderRadius: 12, padding: "11px 13px",
            fontSize: 13, lineHeight: 1.45, margin: "12px 0" }}>
            Their times could not be loaded, so this may be showing nothing when there is something.
            Check your connection and open this again.
          </div>
        )}
        {err && (
          <div style={{ background: C.amberBg, color: C.amber, borderRadius: 12, padding: "11px 13px",
            fontSize: 13, lineHeight: 1.45, margin: "12px 0" }}>{err}</div>
        )}

        {slots === null ? (
          <div style={{ color: C.sub, fontSize: 13.5, padding: "16px 0" }}>Loading times…</div>
        ) : owner.types.map((t) => {
          const held = heldBy(slots, viewer && viewer.id, t.id);
          const open = openSlots(slots, t.id).filter((s) => {
            const d = new Date(s.at);
            return !isNaN(d) && d >= new Date();          // past times stop being offered
          });
          return (
            <div key={t.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14,
              ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D, padding: "13px 15px", marginTop: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 14.5 }}>{t.label}</div>
              <div style={{ color: C.sub, fontSize: 12.5, marginTop: 2 }}>{durationText(t.mins || 30)}</div>
              {/* Bri: "so someone knows what they are signing up for." This is
                  the screen where they are actually signing up. */}
              {typeDesc(t) && <div style={{ color: C.ink, fontSize: 12.5, marginTop: 3 }}>{typeDesc(t)}</div>}

              {held ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 10,
                  background: "#E7F6EC", borderRadius: 10, padding: "9px 12px" }}>
                  <span style={{ flex: 1, minWidth: 150, fontSize: 13.5, fontWeight: 700, color: "#166534" }}>
                    You have {fmtCalWhen(held.at)}
                  </span>
                  <button disabled={busy} onClick={() => act("cancel", held.id)} style={pill(false)}>Cancel</button>
                </div>
              ) : open.length === 0 ? (
                <div style={{ color: C.sub, fontSize: 13, marginTop: 9 }}>No times open right now.</div>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  {open.slice(0, 12).map((s) => (
                    <button key={s.id} disabled={busy} onClick={() => act("book", s.id)} style={pill(true)}>
                      {fmtCalWhen(s.at)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OrgRow({ p, editing, onChange, onDelete, big, tone, bookable, onSchedule }) {
  const t = tone || C.red;
  return (
    <div style={{ background: big ? C.navy : C.card, color: big ? "#fff" : C.ink,
      border: big ? "none" : `1px solid ${C.line}`, borderLeft: big ? "none" : `4px solid ${t}`,
      borderRadius: big ? 16 : 12, padding: big ? "20px 20px" : "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Avatar name={p.name} tier="ad" size={big ? 48 : 40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div style={{ display: "grid", gap: 5 }}>
              <input value={p.name} placeholder="Name" onChange={(e) => onChange({ ...p, name: e.target.value })}
                style={{ ...inp(1), width: "100%", fontWeight: 800, fontSize: 15 }} />
              <input value={p.title} placeholder="Title" onChange={(e) => onChange({ ...p, title: e.target.value })}
                style={{ ...inp(1), width: "100%", fontSize: 13 }} />
              <input value={p.line || ""} placeholder="Specific role (optional) — e.g. Human Resources"
                onChange={(e) => onChange({ ...p, line: e.target.value })}
                style={{ ...inp(1), width: "100%", fontSize: 13 }} />
            </div>
          ) : (
            <>
              <div style={{ fontWeight: 800, fontSize: big ? 17 : 15 }}>{p.name}</div>
              <div style={{ color: big ? C.gold : t, fontSize: 12.5, fontWeight: 700 }}>{p.title}</div>
              {p.line && <div style={{ color: big ? "rgba(255,255,255,.72)" : C.sub, fontSize: 12.5, marginTop: 1 }}>{p.line}</div>}
              {p.sub && <div style={{ color: big ? "rgba(255,255,255,.72)" : C.sub, fontSize: 12.5, marginTop: 1 }}>{p.sub}</div>}
              {p.note && <div style={{ color: big ? "rgba(255,255,255,.72)" : C.sub, fontSize: 12.5, marginTop: 3, fontStyle: "italic" }}>{p.note}</div>}
            </>
          )}
        </div>
        {editing && onDelete && (
          <button onClick={onDelete} title="Remove from Our Team"
            style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.red, borderRadius: 7, cursor: "pointer", padding: "4px 8px", fontWeight: 700 }}>✕</button>
        )}
      </div>
      {/* UNDERNEATH the badge, which is where Bri asked for it. Hidden while
          editing — the edit row is for fixing the card, not booking time. */}
      {bookable && !editing && (
        <button onClick={() => onSchedule(bookable)} style={{
          marginTop: 11, width: "100%", fontFamily: FONT, fontSize: 13, fontWeight: 700,
          borderRadius: 9, padding: "8px 12px", cursor: "pointer",
          border: big ? "1px solid rgba(255,255,255,.35)" : `1px solid ${C.line}`,
          background: big ? "rgba(255,255,255,.14)" : "#fff",
          color: big ? "#fff" : t,
        }}>
          Schedule
          <span style={{ opacity: 0.7, fontWeight: 600 }}>
            {bookable.types.length === 1 ? ` · ${bookable.types[0].label}` : ` · ${bookable.types.length} options`}
          </span>
        </button>
      )}
    </div>
  );
}

function Band({ title, count, children }) {
  return (
    <>
      <div style={{ marginTop: 26, marginBottom: 12, display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: C.sub }}>{title}</span>
        {count != null && <span style={{ fontSize: 12.5, color: C.sub, fontWeight: 600 }}>· {count}</span>}
      </div>
      {children}
    </>
  );
}

function OurTeam({ data, editing, onChangeOrg, cal, onSchedule }) {
  /* One question per card, asked once, at the point the card is drawn. `cal`
     carries the roster index, the HR role and status maps, the event types and
     the viewer's tier — see bookableWith. */
  const bookFor = (name) => bookableWith(name, cal);
  const org = Array.isArray(data.org) ? data.org : [];
  const setOrg = (id, next) => onChangeOrg(org.map((o) => (o.id === id ? next : o)));
  const delOrg = (id) => onChangeOrg(org.filter((o) => o.id !== id));
  const addOrg = (rank) => onChangeOrg([...org, { id: `org-${Date.now()}`, name: "", title: "", line: "", rank }]);

  const owners = org.filter((o) => o.rank === "owner");
  const eds = org.filter((o) => o.rank === "ed");

  // Directors = ORG entries with rank "director" (Bri) + data.directors
  // (Daisy/Brandon, who own teams). Merged so nobody appears twice.
  //
  // ⚠️ THE TEAM LIST IS DERIVED FROM `team.director`, NOT from the director's
  // own `teams: [...]` array. That array is the ORIGINAL SEED and is now dead
  // data — do not read it and do not "fix" it. The Director dropdown on Meet
  // Our Teams writes `team.director`, so reading the seed array meant Bri could
  // set Perfect Platers → Daisy, watch it save, and see nothing change here
  // (reported Jul 24: "it's not connecting to the Directors on the Our Team
  // page"). One field decides who a team sits under, and this is it — the same
  // field TeamCard, TeamCharter and areaOf already read.
  //
  // Order follows data.teams, i.e. Meet Our Teams order, so the two pages read
  // the same way round.
  const teamsUnder = (dirId) => data.teams.filter((t) => t.director === dirId).map((t) => t.name);
  const directors = [
    ...org.filter((o) => o.rank === "director"),
    ...data.directors.map((d) => ({
      id: d.id, name: d.name, title: d.title, line: "", rank: "director", _fixed: true,
      sub: teamsUnder(d.id).join(" · "),
    })),
  ];

  // Everything below is derived from the team breakdowns, never hand-kept.
  const fromTeams = (tier) => data.teams.flatMap((t) =>
    t.people.filter((pp) => pp.tier === tier && isEffectivelyLive(pp))
      .map((pp) => ({ id: `${t.id}-${pp.id}`, name: pp.name, title: t.name, note: pp.note || "" })));

  const ads = fromTeams("ad");                        // team order = Meet Our Teams order
  const tls = fromTeams("tl").sort(byFirstName);      // alphabetical by first name
  const trainers = fromTeams("trainer").sort(byFirstName);

  const grid = (min) => ({ display: "grid", gap: 12, gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` });

  return (
    <div>
      <p style={{ color: C.sub, fontSize: 14.5, margin: "0 0 4px", maxWidth: 560, lineHeight: 1.5 }}>
        Everyone leading at {STORE.name}, from the top of the climb down.
      </p>
      {editing && (
        <p style={{ color: C.sub, fontSize: 12.5, margin: "0 0 4px", maxWidth: 560, lineHeight: 1.5 }}>
          Assistant Directors, Team Leaders and Trainers are pulled from Meet Our Teams and follow whatever
          tier each person holds — edit them there, not here.
        </p>
      )}

      <Band title="Owner / Operator">
        <div style={grid(230)}>
          {owners.map((p) => <OrgRow key={p.id} p={p} big editing={editing} onChange={(n) => setOrg(p.id, n)} onDelete={() => delOrg(p.id)}
            bookable={bookFor(p.name)} onSchedule={onSchedule} />)}
        </div>
      </Band>

      <Band title="Executive Directors" count={eds.length}>
        <div style={grid(230)}>
          {eds.map((p) => <OrgRow key={p.id} p={p} big editing={editing} onChange={(n) => setOrg(p.id, n)} onDelete={() => delOrg(p.id)}
            bookable={bookFor(p.name)} onSchedule={onSchedule} />)}
        </div>
        {editing && <div style={{ marginTop: 10 }}><Btn small kind="solid" onClick={() => addOrg("ed")}>+ Add Executive Director</Btn></div>}
      </Band>

      <Band title="Directors" count={directors.length}>
        <div style={grid(230)}>
          {directors.map((p) => (
            <OrgRow key={p.id} p={p} tone={TIER_TONE.director} editing={editing && !p._fixed}
              onChange={(n) => setOrg(p.id, n)} onDelete={p._fixed ? null : () => delOrg(p.id)}
              bookable={bookFor(p.name)} onSchedule={onSchedule} />
          ))}
        </div>
        {editing && <div style={{ marginTop: 10 }}><Btn small kind="solid" onClick={() => addOrg("director")}>+ Add Director</Btn></div>}
      </Band>

      {/* ⚠️ THE THREE BANDS BELOW ASK THE SAME QUESTION, and today the answer is
          always no — nobody at these tiers owns an event type, because the
          Calendar tile will not open for them. They are asked anyway so that
          "who gets a Schedule button" is decided in ONE place by ONE rule. A
          Director whose card has not been moved out of the Assistant Directors
          band yet is still a Director, and skipping the question here is how
          she would end up as the one leader nobody can book. */}
      <Band title="Assistant Directors" count={ads.length}>
        <div style={grid(210)}>{ads.map((p) => <OrgRow key={p.id} p={p} tone={TIER_TONE.ad}
          bookable={bookFor(p.name)} onSchedule={onSchedule} />)}</div>
      </Band>

      <Band title="Team Leaders" count={tls.length}>
        <div style={grid(210)}>{tls.map((p) => <OrgRow key={p.id} p={p} tone={TIER_TONE.tl}
          bookable={bookFor(p.name)} onSchedule={onSchedule} />)}</div>
      </Band>

      <Band title="Team Trainers" count={trainers.length}>
        <div style={grid(210)}>{trainers.map((p) => <OrgRow key={p.id} p={p} tone={TIER_TONE.trainer}
          bookable={bookFor(p.name)} onSchedule={onSchedule} />)}</div>
      </Band>
    </div>
  );
}

// ---- main ----------------------------------------------------------------
export default function TeamDirectory({ onBack, initialView = "teams" }) {
  const [data, setData] = useState(null);
  const [view, setView] = useState(initialView);
  const [charterId, setCharterId] = useState(null); // team id whose charter is open
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  // HR drift report. Declared here with the other hooks ON PURPOSE — the two
  // early returns below (loading, and the held-directory placeholder) would
  // make any hook added further down conditional.
  const [hrSync, setHrSync] = useState({ terminated: [], unplaced: [] });
  /* The HR roster is fetched below for enrichment; it is kept in state as well
     so the edit row can offer a "Link to HR record" picker. Read-only here —
     nothing writes HR from this page. */
  const [hrRoster, setHrRoster] = useState([]);
  const [syncOpen, setSyncOpen] = useState(false);
  // true = the directory read FAILED — the seed is on screen for reference and
  // every save path is off until the tile is reopened and the read succeeds.
  const [loadFailed, setLoadFailed] = useState(false);
  /* ── the calendar, for the Schedule buttons ──────────────────────────────
     ⚠️ DECLARED UP HERE WITH THE OTHER HOOKS, for the reason hrSync's comment
     above already gives: the two early returns below would make any hook added
     further down a conditional one. Check 2 exists because that once took the
     whole app out. */
  const [calTypes, setCalTypes] = useState([]);     // [] = none, and none is fine
  const [hrRoles, setHrRoles] = useState({});       // gcfcr-hr-roles, the title overrides
  const [hrStatus, setHrStatus] = useState({});     // gcfcr-hr-status, Active / terminated
  const [booking, setBooking] = useState(null);     // the owner whose sheet is open
  const first = useRef(true);

  const viewer = getViewer();
  const canSeeHidden = viewerCanSeeHidden(viewer);
  const canEdit = canSeeHidden; // only allowlisted people edit

  useEffect(() => { (async () => {
    const loaded = await loadData();
    let d = loaded.data;
    if (!loaded.ok) setLoadFailed(true);
    let repaired = 0;
    // The HR roster read must have SUCCEEDED before any repair persists. On a
    // failed read loadHRTeam hands back the static seed, and a name that is
    // only unambiguous because the real person is missing from it could get
    // the WRONG hrId stamped and saved. loadHRTeamResult carries ok.
    let hrOk = false;
    try {
      const [hrRes, statusMap] = await Promise.all([loadHRTeamResult(), kvGet("gcfcr-hr-status")]);
      hrOk = hrRes.ok;
      const hrList = hrRes.team;
      setHrRoster(Array.isArray(hrList) ? hrList : []);
      const before = JSON.stringify(d);
      d = enrichWithHR(d, hrList);
      /* ★★ A REPAIRED hrId HAS TO BE WRITTEN BACK, OR IT NEVER HAPPENED.
         `enrichWithHR` runs at load and its result went into `setData` — but the
         save effect below skips the FIRST `setData` (`first.current`), so the
         corrected copy lived in memory for one render and was thrown away. The
         stored record kept the wrong number forever.
         🔴 That is why Monica Garcia-Parra stayed broken through two deploys:
         the repair worked every single time and was never saved. Worse,
         ProfessionalGrowth builds its recommender list from the RAW stored
         directory (`kvGet(DIR_KEY)`), never the enriched one — so every new
         request kept copying the wrong id even while this page displayed the
         right person.
         ⚠️ ONLY WRITES WHEN SOMETHING WAS ACTUALLY CORRECTED (`hrIdWas` is
         stamped only by a real repair). A blind save on every load would churn
         the record and fight anyone editing in another tab. */
      repaired = (JSON.stringify(d).match(/"hrIdWas"/g) || []).length
               - (before.match(/"hrIdWas"/g) || []).length;
      // Computed AFTER enrichment so it sees the hrIds enrichment just resolved.
      setHrSync(computeHrSync(d, hrList, statusMap));
      setHrStatus(statusMap && typeof statusMap === "object" ? statusMap : {});
    } catch { /* HR optional — the page still renders without it */ }
    // Repairs computed against a failed load are repairs to the SEED — saving
    // them would replace the whole stored directory. Same for repairs matched
    // against a seed ROSTER (hrOk false): display only in both cases.
    if (loaded.ok && hrOk && repaired > 0) await saveData(d);
    setData(d);
  })(); }, []);

  /* ═══ THE CALENDAR READS, ON THEIR OWN ═════════════════════════════════════
     ⚠️ DELIBERATELY NOT ADDED TO THE Promise.all ABOVE. That one sits inside the
     try that decides whether an hrId repair gets WRITTEN BACK to the shared
     directory. A rejected calendar read in that block would skip the enrichment
     and take the repair with it — a cosmetic feature quietly disabling a data
     fix for 106 people. Two reads that answer different questions, in two
     places, and neither can break the other.
     ⚠️ NOTHING HERE FAILS THE PAGE. No types, no roles, no status: every
     Schedule button simply does not draw. */
  useEffect(() => { (async () => {
    try {
      const [t, r] = await Promise.all([
        kvGet(CAL_TYPES_KEY).catch(() => null),
        kvGet("gcfcr-hr-roles").catch(() => null),
      ]);
      setCalTypes(calTypeList(t));
      setHrRoles(r && typeof r === "object" ? r : {});
    } catch { /* no calendar on the page is a fine outcome */ }
  })(); }, []);

  useEffect(() => {
    if (!data || loadFailed) return;
    if (first.current) { first.current = false; return; }
    let live = true;
    saveData(data).then((ok) => { if (ok && live) { setSaved(true); setTimeout(() => setSaved(false), 1400); } });
    return () => { live = false; };
  }, [data, loadFailed]);

  if (!data) return <div style={{ fontFamily: FONT, padding: 40, color: C.sub }}>Loading team directory…</div>;

  // whole-directory hold: team members see a placeholder, nothing else
  if (data.meta.held && !canSeeHidden) {
    return (
      <div style={{ fontFamily: FONT, background: C.paper, minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 30 }}>
        <div style={{ textAlign: "center", maxWidth: 340 }}>
          {onBack && <button onClick={onBack} style={{ border: "none", background: "none", color: C.sub, fontFamily: FONT, fontSize: 14, cursor: "pointer", fontWeight: 600, marginBottom: 16 }}>← Back</button>}
          <div style={{ fontSize: 30, marginBottom: 10 }}>🏔️</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: C.ink }}>Coming soon</div>
          <div style={{ color: C.sub, fontSize: 14, marginTop: 6 }}>Our team pages are being updated — check back shortly.</div>
        </div>
      </div>
    );
  }

  const setTeam = (id, next) => setData({ ...data, teams: data.teams.map((t) => (t.id === id ? next : t)) });
  const delTeam = (id) => { if (window.confirm("Delete this whole team?")) setData({ ...data, teams: data.teams.filter((t) => t.id !== id) }); };
  const moveTeam = (i, dir) => { const j = i + dir; if (j < 0 || j >= data.teams.length) return; const next = data.teams.slice(); [next[i], next[j]] = [next[j], next[i]]; setData({ ...data, teams: next }); };
  const addTeam = () => setData({ ...data, teams: [...data.teams, { id: `team-${Date.now()}`, name: "New Team", director: null, provisional: true, page: { ...EMPTY_CHARTER, values: [] },
    people: [{ id: `p${Date.now()}`, name: "", tier: "ad", note: "", hrId: null, hrDiffers: false, vis: "live", revealAt: null, override: true }] }] });
  const setHeld = (held) => setData({ ...data, meta: { ...data.meta, held } });

  // ── HR sync actions ──────────────────────────────────────────────────────
  // Both are EXPLICIT. Nothing here fires on load: a person appearing on or
  // vanishing from a team page is visible to 106 people, so it happens because
  // a leader tapped it, not because a background job decided.
  const dropTerminated = (row) => {
    setData({ ...data, teams: data.teams.map((t) => (t.id !== row.teamId ? t
      : { ...t, people: t.people.filter((pp) => pp.id !== row.personId) })) });
    setHrSync((sv) => ({ ...sv, terminated: sv.terminated.filter((r) => r.personId !== row.personId) }));
  };
  const dropAllTerminated = () => {
    if (!window.confirm(`Remove ${hrSync.terminated.length} terminated ${hrSync.terminated.length === 1 ? "person" : "people"} from their teams?`)) return;
    const kill = new Set(hrSync.terminated.map((r) => r.personId));
    setData({ ...data, teams: data.teams.map((t) => ({ ...t, people: t.people.filter((pp) => !kill.has(pp.id)) })) });
    setHrSync((sv) => ({ ...sv, terminated: [] }));
  };
  // A placed hire keeps their hrId, so enrichWithHR takes over their tier from
  // the next render on and they never resurface as unplaced.
  const placeHire = (row, teamId) => {
    if (!teamId) return;
    setData({ ...data, teams: data.teams.map((t) => (t.id !== teamId ? t : { ...t, people: [...t.people,
      { id: `p${Date.now()}`, name: row.name, tier: row.tier || "member", note: "",
        hrId: row.hrId, hrDiffers: false, vis: "live", revealAt: null, override: false }] })) });
    setHrSync((sv) => ({ ...sv, unplaced: sv.unplaced.filter((r) => r.hrId !== row.hrId) }));
  };

  const totalVisible = data.teams.reduce((n, t) => n + t.people.filter((pp) => canSeeHidden || isEffectivelyLive(pp)).length, 0);
  const hiddenCount = data.teams.reduce((n, t) => n + t.people.filter((pp) => !isEffectivelyLive(pp)).length, 0);

  return (
    <div style={{ fontFamily: FONT, background: C.paper, minHeight: "100vh", color: C.ink }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');`}</style>

      {loadFailed && (
        <div style={{ background: "#F5EAD3", borderBottom: "1px solid #E4CE9E", color: "#7A5410", padding: "10px 20px", fontSize: 13, fontWeight: 700 }}>
          The saved directory could not be reached — this is the built-in starting list, not the real one. Changes will not save. Close and reopen the tile to retry.
        </div>
      )}

      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "rgba(246,244,239,.9)", backdropFilter: "blur(8px)",
        borderBottom: `1px solid ${C.line}`, padding: "12px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        {onBack && <button onClick={onBack} style={{ border: "none", background: "none", color: C.sub, fontFamily: FONT, fontSize: 14, cursor: "pointer", fontWeight: 600 }}>← Back</button>}
        <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-.01em" }}>Team Directory</div>
        <div style={{ flex: 1 }} />
        {saved && <span style={{ color: "#2E9E5B", fontSize: 12.5, fontWeight: 600 }}>Saved ✓</span>}
        {canEdit && <Btn kind={editing ? "solid" : "ghost"} small onClick={() => setEditing((e) => !e)}>{editing ? "Done editing" : "Edit"}</Btn>}
      </div>

      <div style={{ maxWidth: 940, margin: "0 auto", padding: "24px 20px 60px" }}>
        <div style={{ background: `linear-gradient(120deg, ${C.red} 0%, ${C.redDeep} 30%, ${C.navy} 55%)`,
          borderRadius: 20, padding: "24px 24px", color: "#fff", position: "relative", overflow: "hidden", marginBottom: 20 }}>
          <div style={{ position: "absolute", right: -30, top: -30, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,255,255,.08)" }} />
          <div style={{ fontSize: 24 }}>🏔️</div>
          <div style={{ fontWeight: 800, fontSize: 23, letterSpacing: "-.02em", marginTop: 6 }}>Our Teams</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.85)", marginTop: 4, lineHeight: 1.45 }}>
            The people of {STORE.name}, climbing together.
          </div>
        </div>
        {/* ── HR drift panel — leaders only ─────────────────────────────── */}
        {canSeeHidden && (hrSync.terminated.length > 0 || hrSync.unplaced.length > 0) && (
          <div style={{ background: cardSurface(), border: `1px solid ${C.line}`, borderRadius: 14, ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D, padding: "14px 16px", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>Out of step with HR Console</span>
              <span style={{ flex: 1 }} />
              <Btn small onClick={() => setSyncOpen((o) => !o)}>{syncOpen ? "Hide" : "Review"}</Btn>
            </div>
            <div style={{ color: C.sub, fontSize: 13, marginTop: 5, lineHeight: 1.45 }}>
              {hrSync.terminated.length > 0 && `${hrSync.terminated.length} ${hrSync.terminated.length === 1 ? "person is" : "people are"} still on a team after being terminated. `}
              {hrSync.unplaced.length > 0 && `${hrSync.unplaced.length} active ${hrSync.unplaced.length === 1 ? "person isn't" : "people aren't"} on any team yet.`}
            </div>

            {syncOpen && (
              <div style={{ marginTop: 14 }}>
                {hrSync.terminated.length > 0 && (
                  <div style={{ marginBottom: hrSync.unplaced.length ? 18 : 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>Terminated in HR, still listed</span>
                      <span style={{ flex: 1 }} />
                      <Btn small onClick={dropAllTerminated}>Remove all</Btn>
                    </div>
                    {hrSync.terminated.map((row) => (
                      <div key={row.personId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: `1px solid ${C.line}` }}>
                        <Avatar name={row.name} tier="member" size={30} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{row.name}</div>
                          <div style={{ color: C.sub, fontSize: 12 }}>{row.teamName}</div>
                        </div>
                        <Btn small onClick={() => dropTerminated(row)}>Remove</Btn>
                      </div>
                    ))}
                  </div>
                )}

                {hrSync.unplaced.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Not on a team yet</div>
                    <div style={{ color: C.sub, fontSize: 12, marginBottom: 8, lineHeight: 1.45 }}>
                      HR doesn’t record which team someone joins, so these need placing by hand.
                    </div>
                    {hrSync.unplaced.map((row) => (
                      <div key={row.hrId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: `1px solid ${C.line}` }}>
                        <Avatar name={row.name} tier={row.tier} size={30} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{row.name}</div>
                          <div style={{ color: C.sub, fontSize: 12 }}>{row.role}</div>
                        </div>
                        <select
                          defaultValue=""
                          onChange={(e) => { placeHire(row, e.target.value); e.target.value = ""; }}
                          style={{ fontFamily: FONT, fontSize: 13, padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.line}`, background: "#fff", color: C.ink }}
                        >
                          <option value="">Add to team…</option>
                          {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* privileged control bar */}
        {canSeeHidden && (data.meta.held || editing) && (
          <div style={{ background: data.meta.held ? C.navy : C.amberBg, color: data.meta.held ? "#fff" : C.amber,
            borderRadius: 12, padding: "12px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 13.5 }}>
              {data.meta.held ? "🔒 Whole directory is HELD — the team sees “Coming soon.”" : `You can see ${hiddenCount} hidden/scheduled ${hiddenCount === 1 ? "item" : "items"} the team can’t.`}
            </span>
            <div style={{ flex: 1 }} />
            {editing && <Btn small kind={data.meta.held ? "solid" : "ghost"} onClick={() => setHeld(!data.meta.held)}>
              {data.meta.held ? "Publish directory (reveal)" : "Hold whole directory"}
            </Btn>}
          </div>
        )}

        <div style={{ display: "flex", gap: 6, background: "#EDEAE3", padding: 4, borderRadius: 12, width: "fit-content", marginBottom: 22 }}>
          {[["teams", "Meet Our Teams"], ["our-team", "Our Team"]].map(([k, lbl]) => (
            <button key={k} onClick={() => setView(k)} style={{ border: "none", cursor: "pointer", fontFamily: FONT, fontWeight: 700, fontSize: 13.5,
              padding: "8px 16px", borderRadius: 9, background: view === k ? "#fff" : "transparent", color: view === k ? C.ink : C.sub,
              boxShadow: view === k ? "0 1px 2px rgba(20,24,33,.08)" : "none" }}>{lbl}</button>
          ))}
        </div>

        {charterId && data.teams.some((t) => t.id === charterId) ? (
          (() => {
            const t = data.teams.find((x) => x.id === charterId);
            return <TeamCharter team={t} director={data.directors.find((d) => d.id === t.director)}
              editing={editing} onChange={(n) => setTeam(t.id, n)} onBack={() => setCharterId(null)} />;
          })()
        ) : view === "our-team" ? (
          <OurTeam data={data} editing={editing} onChangeOrg={(org) => setData({ ...data, org })}
            /* Built here rather than inside OurTeam so the roster is indexed
               once per render instead of once per card. hrIndex is module
               level, so nothing can read it in a dead zone. */
            /* ⚠️ NOBODY SIGNED IN MEANS NO TYPES, WHICH MEANS NO BUTTONS. Our
               Teams is readable signed-out; a Schedule button there would open
               a sheet that can only 401, and the booking route has no idea who
               to put in the slot. Handled by starving bookableWith rather than
               by a null handler, so there is nothing to click at all. */
            cal={{ idx: hrIndex(hrRoster), roles: hrRoles, roster: hrRoster, status: hrStatus,
              types: viewer ? calTypes : [], tier: readViewerTier() }}
            onSchedule={setBooking} />
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
              <p style={{ color: C.sub, fontSize: 14.5, margin: 0, maxWidth: 520, lineHeight: 1.5 }}>
                {data.teams.length} teams climbing together · {totalVisible} team members across {STORE.name}.
              </p>
              {editing && <div style={{ display: "flex", gap: 8 }}><Btn small kind="solid" onClick={addTeam}>+ Add team</Btn></div>}
            </div>
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
              {data.teams.map((t, ti) => (
                <TeamCard key={t.id} team={t} hrList={hrRoster} director={data.directors.find((d) => d.id === t.director)}
                  editing={editing} canSeeHidden={canSeeHidden} onChange={(n) => setTeam(t.id, n)} onDelete={() => delTeam(t.id)}
                  onMove={(dir) => moveTeam(ti, dir)} canMoveUp={ti > 0} canMoveDown={ti < data.teams.length - 1}
                  allDirectors={data.directors} onOpenCharter={() => setCharterId(t.id)} />
              ))}
            </div>
          </>
        )}
      </div>

      {booking && <BookSheet owner={booking} viewer={viewer} onClose={() => setBooking(null)} />}
    </div>
  );
}
