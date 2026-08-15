/* ============================================================================
   courseTranslate.js — Gate City Hub

   Turns a screen's words into a flat list of translatable strings, and puts a
   translated list back into the same shape. Three shapes live here: a
   Leadership 101 course, the Prep Work sections, and a role application.

   Bri, Aug 3 2026: an English/Spanish toggle on the classes and Prep Work,
   "kind of a living function so as I update the classes or make changes, I
   would not have to constantly re-update the Spanish version." Applications
   followed on Aug 10.

   ★ ONE WALKER, USED TWICE. collect() and apply() are the same traversal with
   a different callback. Two separate walkers would be two orderings, and the
   day they disagreed by one field every sentence in the class would land under
   the wrong heading — with nothing to notice it, because a Spanish class reads
   fine to someone who does not speak Spanish. This is the whole reason this
   file exists rather than the logic living inline.

   ★ IDS, TYPES AND STRUCTURE NEVER LEAVE. Student progress is keyed on item
   ids, so those are not translatable text and are never sent anywhere. Only
   the words a person reads are collected.

   ★ LEAF MODULE. Imports nothing, so it can be node-tested and can never
   introduce a cycle.
   ============================================================================ */

/* The fields that hold words a student reads. Anything not named here — id,
   type, youtube, images, imageFiles, timeLabel — is structure or a pointer and
   is deliberately left alone. */
const ITEM_TEXT = ["title", "note", "intro", "outro", "brief", "prompt", "instructions", "requirement"];

const isStr = (v) => typeof v === "string";
const arr = (v) => (Array.isArray(v) ? v : []);
/* Non-blank only. Used by the APPLICATIONS walker at the bottom of this file
   and deliberately NOT by the two above, whose behaviour must not change. */
const isText = (v) => typeof v === "string" && v.trim() !== "";

/* The single traversal. `visit(get, set)` is called for every translatable
   string in a fixed order; collect passes a getter, apply passes a setter. */
function walk(course, visit) {
  if (!course || typeof course !== "object") return;
  if (isStr(course.title)) visit(course.title, (v) => { course.title = v; });

  arr(course.sections).forEach((sec) => {
    if (!sec || typeof sec !== "object") return;
    if (isStr(sec.title)) visit(sec.title, (v) => { sec.title = v; });

    arr(sec.items).forEach((it) => {
      if (!it || typeof it !== "object") return;

      ITEM_TEXT.forEach((f) => {
        if (isStr(it[f])) visit(it[f], (v) => { it[f] = v; });
      });

      arr(it.questions).forEach((q) => {
        if (isStr(q)) return;               // a bare-string question is rare; skipped rather than guessed
        if (!q || typeof q !== "object") return;
        if (isStr(q.q)) visit(q.q, (v) => { q.q = v; });
        arr(q.choices).forEach((c, ci) => {
          if (isStr(c)) visit(c, (v) => { q.choices[ci] = v; });
        });
      });

      /* Both sides of a matching pair. Translating only the prompt would leave
         a Spanish question to be matched against English words. */
      /* ⚠️ `pr.img` IS A FILE RECORD, NOT WORDS, and is deliberately not
         visited. Only isStr fields are collected, so a bucket path could never
         be sent to a translator and handed back as Spanish — which would
         detach the picture from its pair. Named here because the guard is a
         type check and reads as incidental. */
      arr(it.pairs).forEach((pr) => {
        if (!pr || typeof pr !== "object") return;
        if (isStr(pr.def)) visit(pr.def, (v) => { pr.def = v; });
        if (isStr(pr.answer)) visit(pr.answer, (v) => { pr.answer = v; });
      });

      arr(it.keyPoints).forEach((k, ki) => {
        if (isStr(k)) visit(k, (v) => { it.keyPoints[ki] = v; });
      });

      arr(it.areas).forEach((a) => {
        if (!a || typeof a !== "object") return;
        if (isStr(a.label)) visit(a.label, (v) => { a.label = v; });
        if (isStr(a.note)) visit(a.note, (v) => { a.note = v; });
        arr(a.rows).forEach((r) => {
          if (!r || typeof r !== "object") return;
          if (isStr(r.label)) visit(r.label, (v) => { r.label = v; });
          if (isStr(r.detail)) visit(r.detail, (v) => { r.detail = v; });
        });
      });
    });
  });
}

/** Every translatable string in the course, in traversal order. */
export function collectStrings(course) {
  const out = [];
  walk(course, (val) => { out.push(val); });
  return out;
}

/**
 * A DEEP COPY of the course with `texts` written back in traversal order.
 * Returns null when the count does not match, rather than a course with its
 * sentences shifted by one — which would read as a finished translation and be
 * wrong everywhere at once.
 */
export function applyStrings(course, texts) {
  if (!Array.isArray(texts)) return null;
  let copy;
  try { copy = JSON.parse(JSON.stringify(course)); } catch { return null; }
  if (collectStrings(copy).length !== texts.length) return null;
  let i = 0;
  walk(copy, (_val, set) => { set(texts[i]); i += 1; });
  return copy;
}

/* ── PREP WORK ────────────────────────────────────────────────────────────
   Bri, Aug 3 2026: "I'd also like the option for prep work sections to be
   translated if someone needs it."

   Prep work is a different shape from a class — a flat list of sections, each
   with a title and a list of tasks — and it lives in a different file. Same
   discipline applies for the same reason: ONE walker used twice, so the order
   strings leave in is the order they come back to. `after` is the week anchor
   and `files` are handouts; neither is words a student reads, so neither is
   collected. */
function walkPrep(sections, visit) {
  arr(sections).forEach((sec) => {
    if (!sec || typeof sec !== "object") return;
    if (isStr(sec.title)) visit(sec.title, (v) => { sec.title = v; });
    arr(sec.items).forEach((t) => {
      if (!t || typeof t !== "object") return;
      if (isStr(t.text)) visit(t.text, (v) => { t.text = v; });
    });
  });
}

/** Every translatable string across the prep sections, in traversal order. */
export function collectPrepStrings(sections) {
  const out = [];
  walkPrep(sections, (val) => { out.push(val); });
  return out;
}

/**
 * A DEEP COPY of the sections with `texts` written back in traversal order.
 * Null on any count mismatch — a prep list shifted by one would put every task
 * under the wrong heading, which reads as a finished translation and is wrong
 * everywhere at once.
 */
export function applyPrepStrings(sections, texts) {
  if (!Array.isArray(texts)) return null;
  let copy;
  try { copy = JSON.parse(JSON.stringify(sections)); } catch { return null; }
  if (collectPrepStrings(copy).length !== texts.length) return null;
  let i = 0;
  walkPrep(copy, (_val, set) => { set(texts[i]); i += 1; });
  return copy;
}

/* ── ROLE APPLICATIONS ────────────────────────────────────────────────────
   Bri, Aug 3 2026: "In my opinion it is worth the investment to also make the
   Spanish option available for all of our applications… We have a large
   portion of our team that speaks Spanish and this would be a helpful tool to
   include them." Matt: "Applications — yes, and they're the cheapest case of
   the lot."

   ★ A FLAT VIEW OBJECT, NOT THE APPLICATION RECORD. ProfessionalGrowth builds
   this from the config: the role copy, the Expression of Interest items, the
   steps AFTER Bri's title/body overrides are resolved, and the chapter names.
   The stored application — every answer a person has typed, every uploaded
   file, every recommendation — is never walked and never leaves the browser.
   Nothing here is written back to storage either; the translated copy is only
   what is RENDERED.

     { eoiPrompt, submitPrompt,
       eoi:      [{ label, body }],
       steps:    [{ title, body, options: [] }],
       chapters: [] }

   ⚠️ BLANK FIELDS ARE NOT SENT. An application view is mostly optional fields:
   an Expression of Interest item usually has a label and no body. Sending a
   run of empty strings invites the model to drop them, and a dropped string is
   a count mismatch, which throws the whole translation away. So this walker
   skips blanks on BOTH passes — it is one function, so the two can never
   disagree about which fields were skipped.

   ⚠️ `options` IS REPLACED BY INDEX AND THE INDEX IS LOAD-BEARING. The choice
   step stores what the applicant picked, and it must store the ENGLISH option
   whatever language the screen is in — otherwise picking two in Spanish and
   then switching to English leaves nothing selected AND the picker full, which
   is a dead screen you cannot back out of. The renderer therefore shows
   `view.steps[i].options[n]` and saves `step.options[n]`. That pairing is only
   safe because applyAppStrings deep-copies and rewrites in place by index, and
   refuses outright on a count mismatch. Do not make this walker add, drop or
   reorder an option. */
function walkApp(view, visit) {
  if (!view || typeof view !== "object") return;
  if (isText(view.eoiPrompt)) visit(view.eoiPrompt, (v) => { view.eoiPrompt = v; });
  if (isText(view.submitPrompt)) visit(view.submitPrompt, (v) => { view.submitPrompt = v; });

  arr(view.eoi).forEach((it) => {
    if (!it || typeof it !== "object") return;
    if (isText(it.label)) visit(it.label, (v) => { it.label = v; });
    if (isText(it.body)) visit(it.body, (v) => { it.body = v; });
  });

  arr(view.steps).forEach((s) => {
    if (!s || typeof s !== "object") return;
    if (isText(s.title)) visit(s.title, (v) => { s.title = v; });
    if (isText(s.body)) visit(s.body, (v) => { s.body = v; });
    arr(s.options).forEach((o, oi) => {
      if (isText(o)) visit(o, (v) => { s.options[oi] = v; });
    });
  });

  arr(view.chapters).forEach((c, ci) => {
    if (isText(c)) visit(c, (v) => { view.chapters[ci] = v; });
  });
}

/* ── EVALUATIONS ──────────────────────────────────────────────────────────
   Bri, Aug 10 2026: "Can I also have a translation feature added for
   evaluations for leaders to use when they need to complete an evaluation?"

   ⚠️⚠️ AN EVALUATION IS THE FIRST THING HERE A READER WRITES INTO, and that is
   the whole reason it needed its own thought rather than reusing the class
   walker. Everything above translates something somebody reads. An evaluation
   is a form: the leader picks numbers and types sentences about a real person,
   and those sentences go into that person's permanent file.

   ★ SO THE LINE IS DRAWN AT AUTHORSHIP, NOT AT THE SCREEN. What Bri WROTE gets
   translated — section names, category names, the little labels under each
   rating button, and the two confidential prompts. What the LEADER writes is
   never sent, never translated and never written back:

     ratings        numbers, keyed by category id — the id never changes, so
                    switching language cannot move a score
     comments       their words, filed verbatim in the team member's record
     privateConvo   their answer to the private question
     privateNotes   their private notes to Bri and Hannah

   A translated comment would be a translated sentence in somebody's personnel
   file that nobody wrote. That is not a feature, it is a fabricated record.

   ⚠️ THE TEMPLATE NAME IS NOT HERE, deliberately, and it matches the rule the
   applications already follow: "Job titles and form names stay in English…
   those are what the schedule and Slack call them." HR files the evaluation
   under "90 Day Promotion Review"; a Spanish name on the same record would make
   it harder to find, not easier to read.

   The view:
     { sections: [{ name }], categories: [{ name, labels: {1:"…"} }],
       convoPrompt, privacyNote }

   ⚠️ `labels` IS AN OBJECT KEYED BY RATING VALUE, not an array — see Rating in
   HRConsole. Its keys are walked in sorted numeric order on BOTH passes,
   because it is one function; an ordering that could differ between collect and
   apply would put "Excellent" under the 1 button. */
function walkEval(view, visit) {
  if (!view || typeof view !== "object") return;

  arr(view.sections).forEach((s) => {
    if (!s || typeof s !== "object") return;
    if (isText(s.name)) visit(s.name, (v) => { s.name = v; });
  });

  arr(view.categories).forEach((c) => {
    if (!c || typeof c !== "object") return;
    if (isText(c.name)) visit(c.name, (v) => { c.name = v; });
    const lab = c.labels;
    if (!lab || typeof lab !== "object" || Array.isArray(lab)) return;
    Object.keys(lab)
      .sort((a, b) => Number(a) - Number(b))
      .forEach((k) => { if (isText(lab[k])) visit(lab[k], (v) => { lab[k] = v; }); });
  });

  if (isText(view.convoPrompt)) visit(view.convoPrompt, (v) => { view.convoPrompt = v; });
  if (isText(view.privacyNote)) visit(view.privacyNote, (v) => { view.privacyNote = v; });
}

/** Every translatable string in an evaluation view, in traversal order. */
export function collectEvalStrings(view) {
  const out = [];
  walkEval(view, (val) => { out.push(val); });
  return out;
}

/**
 * A DEEP COPY of the view with `texts` written back in traversal order.
 * Null on any count mismatch — English is the right answer then, because a list
 * put back shifted by one puts every rating label under the wrong number.
 */
export function applyEvalStrings(view, texts) {
  if (!Array.isArray(texts)) return null;
  let copy;
  try { copy = JSON.parse(JSON.stringify(view)); } catch { return null; }
  if (collectEvalStrings(copy).length !== texts.length) return null;
  let i = 0;
  walkEval(copy, (_val, set) => { set(texts[i]); i += 1; });
  return copy;
}

/** Every translatable string in an application view, in traversal order. */
export function collectAppStrings(view) {
  const out = [];
  walkApp(view, (val) => { out.push(val); });
  return out;
}

/**
 * A DEEP COPY of the view with `texts` written back in traversal order.
 * Null on any count mismatch, so the caller shows English rather than an
 * application whose answers sit under the wrong questions.
 */
export function applyAppStrings(view, texts) {
  if (!Array.isArray(texts)) return null;
  let copy;
  try { copy = JSON.parse(JSON.stringify(view)); } catch { return null; }
  if (collectAppStrings(copy).length !== texts.length) return null;
  let i = 0;
  walkApp(copy, (_val, set) => { set(texts[i]); i += 1; });
  return copy;
}
