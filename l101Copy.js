/* ══════════════════════════════════════════════════════════════════════════
   l101Copy.js — copying one class's weeks, sections and items into another.

   Bri, Aug 10 2026: "May I have a 'Copy Class' option that copies the weeks and
   sections/items already existing in my Leadership 101, Trainer Orientation,
   and the L101 - Store Template?"

   And the reason it is urgent, from the message eight minutes later: "Prep Work
   sections are not functioning on the L101 copy… I want it to function just
   like my original copy does." The store template shipped with `prepSeed: []`,
   so it has no prep work at all. This is how she fills it — she copies it
   herself. Nobody writes into her stored class by hand.

   ★ LEAF. Imports nothing, and must stay that way. Leadership101.jsx already
   sits at the centre of a five-file import knot (L101Week, L101Editor,
   L101Print, TrainerOrientation, L101Template) and this file is reached from
   inside it. Anything imported back in here closes the cycle that produced the
   blank page on Jul 25.

   ═══ THE ONE RULE THAT MATTERS ═════════════════════════════════════════════
   ⚠️ EVERY COPIED ID IS REWRITTEN, AND THAT IS THE WHOLE SAFETY MODEL.

   Progress is ONE shared record per person across every class. A student's tick
   is stored against an ITEM ID, not against a class. So a copied item that kept
   its original id would arrive already ticked for everybody who ever did the
   original — the template would open showing Gate City's completions, and worse,
   ticking it in the template would mark the real class done for that person.

   That is not a theory. L101Template.jsx carries the same rewrite at build time
   (`tplSeed`) and its comment records why: "handing this program the same seed
   objects would make it claim her students' completed work — which is exactly
   the bug the registry was built to fix (Orientation once displayed the whole of
   Leadership 101)."

   ⚠️ PREP ITEMS COUNT TOO. They enter the same record as `pw:<itemId>`
   (Leadership101.jsx builds the roster rows that way), so a copied prep tick
   claims a real one exactly like a class item does.

   ⚠️ THE REWRITE IS IDEMPOTENT. Copying the same class in twice produces the
   same ids rather than `tpl-w2-tpl-w2-…` growing on every pass — she will press
   this button more than once while she gets the new store's copy right.
   ══════════════════════════════════════════════════════════════════════════ */

/* One id, rewritten for its destination. `tag` is the target week key for class
   items and the target program's short name for prep, so a copied id can never
   collide with the original OR with a copy made into a different week. */
export function copiedId(tag, oldId) {
  const t = String(tag || "");
  const s = String(oldId == null ? "" : oldId);
  if (!t) return s;
  const p = t + "-";
  return s.startsWith(p) ? s : p + s;          // ← idempotent
}

/* The short name of a program, from its namespace. `ld:l101tpl` → `l101tpl`. */
export const progTag = (ns) => String(ns || "").split(":").pop() || "copy";

/* ═══ WHICH WEEKS LINE UP ═══════════════════════════════════════════════════
   Paired on the week NUMBER, never the title. The store template's Week 2 is
   "Conflict & Coaching" today and will be renamed the moment she starts editing
   it for the new store — matching on a title she is about to change would make
   this button quietly stop working exactly when she is using it most.

   Anything with no partner is reported rather than dropped. A week that cannot
   be copied has to be said out loud on the screen; a silently skipped one is a
   class she thinks she has and does not.

   ⚠️⚠️ BOTH LISTS MUST ARRIVE WITH THEIR KEYS ALREADY RESOLVED THROUGH `keyOf`.
   🐛 A DRAFT OF THIS READ `w.key` DIRECTLY AND WAS QUIETLY, BADLY WRONG. The
   live Leadership 101's stored week list carries `key: null` on weeks 1, 2, 3
   and 4 — only `welcome` and the class Bri added herself have explicit keys —
   because Leadership101.jsx resolves them at render with
   `keyOf(w) = w.key || \`w${w.n}\``. Reading `w.key` here therefore skipped
   two thirds of her real class, and a "Copy from Leadership 101" would have
   reported success having copied almost nothing. Found by looking at the actual
   stored record rather than the code's week constant.

   ⚠️ A PAIR POINTING AT THE SAME RECORD IS REFUSED. Class content is keyed by
   week id ALONE and is not namespaced per class (see contentKey), and `keyOf`
   falls back to `w<n>` — so a target week that ever lost its explicit key would
   resolve to the LIVE class's `w2` and a copy would overwrite the class 106
   people are sitting in. It cannot happen with today's records; it is refused
   anyway, because that is the one mistake here with no undo. */
export function weekPairs(fromWeeks, toWeeks) {
  const from = Array.isArray(fromWeeks) ? fromWeeks : [];
  const to = Array.isArray(toWeeks) ? toWeeks : [];
  const pairs = [], noHome = [], noSource = [], sameRecord = [];
  const seen = new Set();
  for (const f of from) {
    if (!f || !f.key) continue;
    const m = to.find((t) => t && t.key && String(t.n) === String(f.n));
    if (!m) { noHome.push({ n: f.n, title: f.title || "", key: f.key }); continue; }
    if (String(m.key) === String(f.key)) {
      sameRecord.push({ n: f.n, title: f.title || "", key: f.key });
      continue;
    }
    /* ⚠️ THE SAME WEEK CANNOT BE FILLED TWICE IN ONE RUN. Two source weeks
       sharing a number would have the second silently overwrite the first, and
       the screen would report both as copied. */
    if (seen.has(String(m.key))) continue;
    seen.add(String(m.key));
    pairs.push({ n: f.n, fromKey: f.key, toKey: m.key,
      title: f.title || "", toTitle: m.title || "" });
  }
  for (const t of to) {
    if (!t || !t.key) continue;
    if (!from.some((f) => f && String(f.n) === String(t.n))) {
      noSource.push({ n: t.n, title: t.title || "", key: t.key });
    }
  }
  return { pairs, noHome, noSource, sameRecord };
}

/* ═══ A WEEK, REWRITTEN FOR ITS NEW HOME ════════════════════════════════════
   Takes the source week EXACTLY as it is stored (or its seed, if she has never
   edited it — the caller resolves that, because only it can tell a failed read
   from an unedited week) and returns the record to write at the target.

   ⚠️ RETURNS null RATHER THAN AN EMPTY WEEK on anything it does not recognise.
   Design rule 1: "when a write path is uncertain about the shape it is
   producing, fail loudly without saving rather than save something wrong."
   Writing `{sections: []}` over one of her classes would look like a successful
   copy and leave the week blank. */
export function copyWeek(source, toKey) {
  if (!source || typeof source !== "object") return null;
  if (!Array.isArray(source.sections) || source.sections.length === 0) return null;
  const tag = String(toKey || "");
  if (!tag) return null;
  return {
    ...source,
    id: tag,
    sections: source.sections.map((s) => ({
      ...s,
      id: copiedId(tag, s && s.id),
      items: (Array.isArray(s && s.items) ? s.items : []).map((it) => ({
        ...it,
        id: copiedId(tag, it && it.id),
      })),
    })),
  };
}

/* ═══ PREP WORK ═════════════════════════════════════════════════════════════
   One array for the whole class, each section anchored to the week it follows
   by NUMBER (`after`). Since the weeks are paired by number too, `after` copies
   across unchanged and lands in the right place.

   `keepNumbers` is the set of week numbers actually being copied, so prep for a
   week she chose to skip does not arrive orphaned — a section whose `after`
   matches no week renders NOWHERE, which Leadership101.jsx already carries a
   note about as an invisible-content trap. */
export function copyPrep(prep, tag, keepNumbers) {
  const src = Array.isArray(prep) ? prep.filter(Boolean) : [];
  const keep = keepNumbers instanceof Set ? keepNumbers : null;
  return src
    .filter((sec) => !keep || keep.has(String(sec.after)))
    .map((sec) => ({
      ...sec,
      id: copiedId(tag, sec.id),
      items: (Array.isArray(sec.items) ? sec.items : []).map((it) => ({
        ...it,
        id: copiedId(tag, it && it.id),
      })),
    }));
}

/* ═══ WHAT DOES NOT TRAVEL, WRITTEN DOWN ════════════════════════════════════
   Matt approved this list on Aug 11 2026. It is here rather than only in a
   commit message because the next person to extend this button will otherwise
   add one of them back as an obvious improvement.

   • STUDENT PROGRESS. One record per person, shared by every class. Copying it
     would put real people's completed work inside a template for another store.
   • INSTRUCTOR NOTES. Her notes name real Gate City team members by name. The
     notes system is switched on for the copy (see l101Instructors.js) so she
     writes fresh ones; the text stays where it was written.
   • ASSIGNED INSTRUCTORS, class PINs, the open switch, and enrolment. "Just not
     wired please" — a copy that arrived with an entrance and a roster would be
     the one thing she asked this not to be.
   • MATERIAL LINKS. Stored per module in `materials`, and they point at Gate
     City's own videos and documents. A new store's copy pointing back here is
     worse than an empty field, because it looks correct. */
export const COPY_EXCLUDES = Object.freeze([
  "student progress", "instructor notes", "assigned instructors",
  "class PIN", "the open switch", "material links",
]);
