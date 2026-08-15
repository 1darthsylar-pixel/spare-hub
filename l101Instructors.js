/**
 * l101Instructors.js — Bri's per-class instructor system for Leadership 101.
 *
 * Her spec (DM, Jul 31 2026), verbatim where it matters:
 *   "For my W2 and W3 classes, I'd love a section with EACH activity called
 *   'instructor notes' that are only visible to me or whomever I assign as an
 *   instructor. … the ability to 'assign an instructor' from a drop down
 *   roster with all Directors, Ex Directors, and Assistant Directors … select
 *   as many instructors per class as needed and remove them as I need to.
 *   This assignment would give them access to the full module … but include
 *   visibility to all instructor notes. They cannot edit through this view,
 *   but I would like a separate notes space … a 'Class Complete' button at
 *   the bottom with notes that sends me a notification … I want to view
 *   'Completed In-Person Classes' somewhere."
 *
 * ★ WHY ASSIGNMENT EXISTS INSTEAD OF A ROLE GRANT. Bri had Daisy and Brandon
 * REMOVED from the role/id gates that open her course tools (see the ⛔ notes
 * in Leadership101.jsx and L101Editor.jsx) — she does not want every Director
 * automatically inside her classes. Assignment is her explicit, revocable,
 * per-class grant. Do not "simplify" any of this back to a role check.
 *
 * ★ LEAF MODULE ON PURPOSE. Leadership101.jsx imports L101Week.jsx, and both
 * need these helpers — a shared home that imports neither is what keeps that
 * from becoming the import cycle this repo has been burned by. Imports
 * store.js and hrTeam.js (itself near-leaf) only.
 *
 * ⚠️ VISIBILITY IS UI-LEVEL, LIKE THE MATCH GAME'S ANSWER KEY. These keys are
 * ordinary kv_store rows, so they are technically readable by anyone with the
 * publishable key — the same standing as quiz answers and match pairs, which
 * already ship in the content store. What the separate keys DO guarantee is
 * that a student's browser never even fetches instructor material in normal
 * use. If instructor notes ever carry something genuinely sensitive, they
 * must move behind the worker like the HR keys — do not just hide the UI.
 *
 * Storage:
 *   ld:l101:instructors-v1     { [weekId]: [{ id, name, role, at, by }] }
 *   ld:l101:inotes:<weekId>    { [itemId]: { text, at, by } }
 *   ld:l101:ifeedback:<weekId> { [personId]: { name, text, at } }
 *   ld:l101:isessions-v1       [{ weekId, weekLabel, at, byId, byName, notes }]
 */
import { kvGet, kvGetResult, kvSet } from "./store.js";
import { loadHRTeam } from "./hrTeam.js";

/* Which classes carry the instructor system. Bri asked for W2 and W3 — her
   in-person classes. Widening it is one id here, nothing else.

   ★ THE STORE TEMPLATE'S TWO MATCHING WEEKS ARE HERE TOO (Bri, Aug 10 2026:
   "I also need the instructor notes, student preview, and instructor preview
   available with the copy. I want it to function just like my original copy
   does, but just not wired please.")

   🐛 THIS IS WHY THEY WERE MISSING. L101Template renames every week to `tpl-…`
   so the copy cannot write her live class's records — which is correct and
   load-bearing — but this set was still the two live ids, so `featured` was
   false on the copy and the whole instructor system silently did not exist
   there. No Instructor view button and no notes fields, on the one screen she
   asked to have them.
   ("Preview as student" was never affected. It hangs off canEditCourse, which
   is not per-week, so it has worked on the template since it shipped.)

   ⚠️ EVERY RECORD IT REACHES IS ALREADY KEYED BY WEEK ID, so this shares
   nothing with her live class: notes land in `ld:l101:inotes:tpl-w2`, feedback
   in `ld:l101:ifeedback:tpl-w2`, and assignments sit under their own `tpl-w2`
   entry inside the one assignments record. Nothing she writes in the template
   can appear in the class students are sitting in.
   ⚠️ STILL NOT WIRED, and the tile gate is what guarantees it: the template
   opens for two people (storeConfig `l101tpl`), so an instructor assigned in
   here cannot reach it. The assignment is a rehearsal, not a grant. */
export const INSTRUCTOR_WEEKS = new Set(["w2", "w3", "tpl-w2", "tpl-w3"]);

/* ★★ THE TEMPLATE CARRIES INSTRUCTOR NOTES ON EVERY WEEK (Bri, Aug 11 2026:
   "I need instructor notes and assignments to be available on all modules in
   the L101 template. I am making in person versions of the W1 and W4 classes
   and need to have these functions available on all modules — including copied
   weeks.")

   ⚠️⚠️ A SET COULD NEVER HAVE ANSWERED THIS. The set above is four fixed ids.
   A week Bri creates today gets a generated key (`wkmso0kydv6o9`), so it can
   never be in a list written yesterday — the feature was structurally unable to
   reach the weeks she was making. That is why this is a RULE and not another
   entry.

   ⚠️⚠️ AND THE WEEK ID ALONE CANNOT DECIDE IT. Both programs mint the same
   `wk…` shape from `addWeek`, so `wkmsku2vax772` (her live Week 5) and
   `wkmsnebnj6uq` (the template's) are indistinguishable by id. The NAMESPACE is
   the only thing that separates them, which is why callers pass it. Guessing
   from the id would have switched the system on across her live class, which
   she did not ask for — her original spec was "For my W2 and W3 classes".

   ⚠️ THE LIVE CLASS IS UNCHANGED: still exactly W2 and W3, still by the set.
   ⚠️ NO `ns` FALLS BACK TO THE SET, so any caller not yet passing one behaves
   exactly as it did before this function existed. */
export const isTemplateNs = (ns) => String(ns || "").split(":").pop() === "l101tpl";

export const weekHasInstructors = (weekId, ns) =>
  isTemplateNs(ns) ? true : INSTRUCTOR_WEEKS.has(String(weekId || ""));

export const ASSIGN_KEY = "ld:l101:instructors-v1";
export const SESSIONS_KEY = "ld:l101:isessions-v1";
export const inotesKey = (weekId) => `ld:l101:inotes:${weekId}`;
export const ifeedbackKey = (weekId) => `ld:l101:ifeedback:${weekId}`;

/* Bri's Slack id — the Class Complete DM target. One more hardcoded person,
   REGISTERED in TERMINATION-CHECKLIST.md under Bri. */
/* ★ CLASS_NOTIFY_ID IS GONE (Aug 7 2026, clone work). This tile used to post a Gate
   City Slack id and the Worker took it on trust. It now sends
   { to: "leadership" } and the Worker resolves the recipient from
   gcfcr-notify-targets-v1 — the same config every scheduled job reads.
   ⚠️ DO NOT PUT AN ID BACK HERE. Change who gets this in the notify-targets
   config, which takes effect without a deploy. An id in this file is a
   second store DMing one of ours, and a page choosing its own recipient. */

/* The roster stores "tm33" in some records and bare "33" in others. Strip the
   prefix on both sides before comparing — matching either form literally is
   the house bug class (see DIRECTOR_IDS in Leadership101.jsx). */
export const normPid = (v) => String(v == null ? "" : v).trim().toLowerCase().replace(/^tm/, "");

const isMap = (v) => v && typeof v === "object" && !Array.isArray(v);

/* Result-style: ok:false means the read FAILED, and callers must not write a
   rebuilt map over the stored one — the sweep rule. */
export async function loadAssignments() {
  const r = await kvGetResult(ASSIGN_KEY);
  return { ok: r.ok, map: isMap(r.value) ? r.value : {} };
}

export function isAssigned(map, weekId, person) {
  const list = (map && map[weekId]) || [];
  const pid = normPid(person && person.id);
  return !!pid && list.some((p) => normPid(p && p.id) === pid);
}

/* The dropdown roster: everyone whose CURRENT title is Director, Assistant
   Director, Executive Director (any Exec variant, e.g. "Executive Director
   | HR"), or Human Resources. Current = live roster with the gcfcr-hr-roles
   overrides applied — the same precedence App.jsx and the boards use — so a
   promotion appears here with no code change. Terminated people are excluded.
   ★ HUMAN RESOURCES ADDED Jul 31 at Bri's ask ("Please add HR to that
   instructor assignment roster") — Hannah's HR title is literally "Human
   Resources", so the Director/AD/Exec filter was leaving her out.
   Best-effort by design: a dropped override read can only make the list
   shorter or show a stale title; it feeds a picker, never a write-back. */
export async function loadEligibleInstructors() {
  const [team, overrides, status] = await Promise.all([
    loadHRTeam().catch(() => []),
    kvGet("gcfcr-hr-roles").catch(() => null),
    kvGet("gcfcr-hr-status").catch(() => null),
  ]);
  const roleOf = (m) => String(((overrides || {})[m.id]) || m.role || "").trim();
  const eligible = (r) =>
    /^director$/i.test(r) || /^assistant\s+director$/i.test(r) || /^executive\s+director/i.test(r)
    || /^human\s+resources$/i.test(r);
  return (team || [])
    .filter((m) => m && m.id != null && m.name && eligible(roleOf(m)) && (status || {})[m.id] !== "terminated")
    .map((m) => ({ id: String(m.id), name: m.name, role: roleOf(m) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadSessions() {
  const r = await kvGetResult(SESSIONS_KEY);
  return { ok: r.ok, list: Array.isArray(r.value) ? r.value : [] };
}

/* Append-only. Refuses when the existing list cannot be read — writing
   [entry] over a list we never saw would erase every prior class record. */
export async function recordSession(entry) {
  const r = await kvGetResult(SESSIONS_KEY);
  if (!r.ok) return false;
  const list = Array.isArray(r.value) ? r.value : [];
  return await kvSet(SESSIONS_KEY, [...list, entry]);
}
