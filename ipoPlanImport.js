/* ══════════════════════════════════════════════════════════════════════════
   ipoPlanImport.js — VALIDATE A PASTED IPO QUARTER PLAN.

   ★ LEAF. Imports nothing. Text in, a verdict out. No storage, no React.

   ═══ WHY THIS EXISTS ══════════════════════════════════════════════════════
   Matt, Aug 8 2026: "A second store needs their own and a place to edit."

   Until now the IPO quarter plan was authored IN CODE — ipoPlanData.js carries
   the note "WHAT YOU AUTHOR EACH QUARTER (the ONE edit): add a block to
   QUARTER_PLANS". That is a deploy every quarter for Gate City, and for a second
   store it is not possible at all: they cannot edit this repo.

   So a plan now lives in KV per store, and this decides whether what somebody
   pasted is safe to store.

   ═══ WHY IT REFUSES RATHER THAN REPAIRS ═══════════════════════════════════
   ⚠️ A HALF-UNDERSTOOD PLAN IS WORSE THAN A REJECTED ONE. This drives the
   dashboard pill and a quarter of action items. A plan that saved with three of
   its four weeks would look finished and quietly under-report what the store
   owes itself. Every failure below returns a reason and stores nothing.

   ⚠️ IT DOES NOT INVENT THE SHAPE. The keys checked here are exactly the keys
   ipoQuarter() reads: fin, weeks, and inside a week — week, title, phase,
   dates, dollars, cats, and inside a cat — id, name, items. Anything else the
   author includes is passed through untouched, because the renderer already
   tolerates extra fields and guessing which ones matter is how an editor starts
   deleting data it did not understand.
   ══════════════════════════════════════════════════════════════════════════ */

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/** "2026-Q3" and nothing else. A typo here writes a quarter nobody will look at. */
const QKEY = /^\d{4}-Q[1-4]$/;

/**
 * Parse and check a pasted plan.
 *
 * Accepts EITHER a whole map of quarters — { "2026-Q3": {...}, "2026-Q4": {...} }
 * — or a single quarter object when `assumeKey` is given. Both are shapes a
 * person plausibly pastes, and refusing one of them for being the wrong wrapper
 * is a refusal about punctuation rather than about the data.
 *
 * Returns { ok, plans, quarters, error }.
 */
export function parseIpoPlans(text, assumeKey) {
  const raw = String(text == null ? "" : text).trim();
  if (!raw) return { ok: false, error: "Nothing pasted." };

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `That is not valid JSON. ${String(e.message || e).slice(0, 90)}` };
  }
  if (!isObj(data)) return { ok: false, error: "Expected an object, got " + (Array.isArray(data) ? "a list" : typeof data) + "." };

  /* A single quarter pasted on its own: wrap it, but only when we were told
     which quarter it is. Guessing the key from the contents would be inventing
     a fact about somebody's financial year. */
  let plans = data;
  const looksLikeOneQuarter = ("weeks" in data) || ("fin" in data);
  if (looksLikeOneQuarter) {
    if (!assumeKey || !QKEY.test(String(assumeKey))) {
      return { ok: false, error: "That looks like ONE quarter. Paste it wrapped as { \"2026-Q3\": { … } }, or pick the quarter first." };
    }
    plans = { [String(assumeKey)]: data };
  }

  const quarters = Object.keys(plans);
  if (!quarters.length) return { ok: false, error: "No quarters found in that." };

  for (const k of quarters) {
    if (!QKEY.test(k)) return { ok: false, error: `"${k}" is not a quarter key. They look like 2026-Q3.` };
    const q = plans[k];
    if (!isObj(q)) return { ok: false, error: `${k} is not an object.` };
    if (!Array.isArray(q.weeks)) return { ok: false, error: `${k} has no weeks list.` };
    if (!q.weeks.length) return { ok: false, error: `${k} has an empty weeks list. A quarter with no weeks renders as done.` };

    for (let i = 0; i < q.weeks.length; i++) {
      const w = q.weeks[i];
      const where = `${k} week ${i + 1}`;
      if (!isObj(w)) return { ok: false, error: `${where} is not an object.` };
      if (!Array.isArray(w.cats)) return { ok: false, error: `${where} has no cats list.` };
      /* ⚠️ AN EMPTY CATS LIST IS REJECTED TOO (Aug 9 2026 sweep, finding 18).
         The weeks list is checked for emptiness above and this one never was,
         so the loop below simply ran zero times and a half-staged quarter saved
         clean. Whoever staged weeks 1-3 and left week 4 blank got "Saved" and a
         tile that was dead from then on, with nothing naming the week that did
         it. A week with no categories is not a week anybody can work. */
      if (!w.cats.length) return { ok: false, error: `${where} has an empty cats list. A week with no categories has nothing to tick, and it stops the tile rendering.` };
      for (let j = 0; j < w.cats.length; j++) {
        const c = w.cats[j];
        if (!isObj(c)) return { ok: false, error: `${where}, category ${j + 1} is not an object.` };
        if (!c.id) return { ok: false, error: `${where}, category ${j + 1} has no id. The id is what a tick is stored against — without it, progress is lost on every reload.` };
        if (!Array.isArray(c.items)) return { ok: false, error: `${where}, category "${c.id}" has no items list.` };
      }
      /* ⚠️ DUPLICATE CATEGORY IDS SILENTLY MERGE PROGRESS. Ticks are stored as
         `${cat.id}-${index}`, so two cats sharing an id share their checkmarks
         and one of them appears half-done the moment the other is touched. */
      const ids = w.cats.map((c) => String(c.id));
      const dupe = ids.find((id, n) => ids.indexOf(id) !== n);
      if (dupe) return { ok: false, error: `${where} uses the category id "${dupe}" twice. Ticks are stored against that id, so the two would share their checkmarks.` };
    }
  }

  return { ok: true, plans, quarters };
}

/** A one-line summary for the preview, so somebody sees what they are about to
 *  store before they store it rather than after. */
export function describeIpoPlans(plans) {
  return Object.keys(plans || {}).sort().map((k) => {
    const q = plans[k] || {};
    const weeks = Array.isArray(q.weeks) ? q.weeks.length : 0;
    const cats = (q.weeks || []).reduce((n, w) => n + ((w.cats || []).length), 0);
    const items = (q.weeks || []).reduce((n, w) => n + (w.cats || []).reduce((m, c) => m + ((c.items || []).length), 0), 0);
    return `${k}: ${weeks} week${weeks === 1 ? "" : "s"}, ${cats} categories, ${items} action items`;
  });
}
