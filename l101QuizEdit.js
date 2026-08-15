/* ============================================================================
   l101QuizEdit.js — the rules for editing a Leadership 101 quiz.

   WHY THIS EXISTS (Bri, Aug 11 2026): "What did we determine for editing quiz
   questions through the classes? This function will be needed for a template
   given to other stores, but I also will need it at some point for my classes
   in use."

   What we had determined was: deliberately not yet. L101Editor's header says
   it, and the reason is sound — quiz questions carry right and wrong answers,
   and a half-finished edit does not break visibly, it silently mis-grades
   somebody. So this is the purpose-built screen with the validation, and this
   module is the validation.

   ★ LEAF MODULE ON PURPOSE. Imports NOTHING. Every rule that decides whether a
   quiz is safe to save is a pure function here, so it can be driven directly
   against the real course content rather than only through a UI.

   ⚠️⚠️ THE RENDERER'S OWN COMMENT IS A WARNING ABOUT THIS FILE. QuizItem in
   L101Week.jsx guards `item.questions` and says why:

       "a quiz item with no `questions` array would blank the whole class,
        exactly the way the missing `images` guard did. Safe only because the
        editor cannot add a quiz today; that is a UI accident, not a guarantee
        about the data."

   Making quizzes editable removes that accident. Everything below exists so
   that what replaces it is a guarantee instead: a quiz cannot be saved without
   a questions array, and a question cannot be saved half written.

   ⚠️⚠️ TWO ANSWER SHAPES, AND THE RENDERER DECIDES BY PRESENCE, NOT BY VALUE.
   QuizItem does exactly this:

       const isMulti = (q) => Array.isArray(q.answers);

   So a single-answer question must carry NO `answers` key at all — not an empty
   array, not null. An empty array would make it select-all with nothing
   correct, which no student could ever pass and nothing on screen would
   explain. `isMulti` below is a deliberate byte-for-byte mirror of that line;
   if it ever drifts, the editor and the grader disagree about what a question
   even is. That is the single most dangerous drift available in this feature.

   ⚠️ THERE IS EXACTLY ONE SELECT-ALL QUESTION IN THE WHOLE COURSE (Week 4
   Quiz 1, "Which of the following are acceptable forms of payment"). It is the
   thing an editor written for the common case would silently destroy, which is
   why it is a first-class case here and not a special case.

   ★ PAST SCORES ARE SAFE, AND THIS WAS VERIFIED RATHER THAN ASSUMED. QuizItem
   stores each response as the question TEXT and the option TEXT, never an
   index — its comment: "A stored `2` that quietly starts pointing at a
   different choice after a reorder is a wrong answer on someone's record with
   nothing on screen to say so." So editing a quiz cannot rewrite anybody's
   history. Nothing in this file needs to protect that, and nothing in it may
   start storing indices in progress either.
   ⚠️ MATCH GAMES DO NOT HAVE THAT PROPERTY — saveMatch keys placements by pair
   INDEX. That is out of scope here and already shipped, but do not copy any
   pattern from this file into pair editing and assume it is safe.
   ============================================================================ */

/* Mirrors QuizItem's `isMulti` exactly. See the warning above before changing. */
export const isMulti = (q) => Array.isArray(q && q.answers);

export const MIN_CHOICES = 2;

const asArray = (v) => (Array.isArray(v) ? v : []);
const text = (v) => String(v == null ? "" : v);
const isIdx = (v, len) => Number.isInteger(v) && v >= 0 && v < len;

/* A new question starts SINGLE with two blank choices and no answer picked.
   Deliberately `answer: null` rather than 0: a default of 0 is a silent claim
   that the first choice is correct, and it would pass any validator that only
   checks the index is in range. Unpicked must be visibly unpicked. */
export const newQuestion = () => ({ q: "", choices: ["", ""], answer: null });

/* A new quiz arrives with one blank question rather than an empty shell — the
   same reasoning the matching game and the walkthrough already use in
   L101Editor: one tap should give her something to edit.
   ⚠️ `questions` IS ALWAYS AN ARRAY FROM THE MOMENT IT EXISTS. That is the
   guarantee replacing the UI accident the renderer's comment describes. */
export const newQuiz = (id) => ({
  id: id || `it-${Date.now()}`,
  type: "quiz",
  title: "Quiz — untitled",
  timeLabel: "1 question",
  questions: [newQuestion()],
});

/* Rebuilt on every question change so it can never disagree with the count.
   Only ever set for quizzes this editor touches; an existing quiz keeps the
   label Bri wrote until she changes something. */
export const timeLabelFor = (n) => `${n} question${n === 1 ? "" : "s"}`;

/* ---------------- switching between the two shapes ----------------
   ⚠️ THE OTHER KEY IS DELETED, NEVER LEFT BEHIND. A question carrying both
   `answer` and `answers` is graded as select-all and the single answer is
   silently ignored, so the editor would be showing one thing and the grader
   scoring another. */
export function toSingle(q) {
  const out = { ...q };
  const first = asArray(q && q.answers)[0];
  delete out.answers;
  out.answer = Number.isInteger(first) ? first : (Number.isInteger(q && q.answer) ? q.answer : null);
  return out;
}
export function toMulti(q) {
  const out = { ...q };
  const one = q && q.answer;
  delete out.answer;
  out.answers = Number.isInteger(one) ? [one] : asArray(q && q.answers).filter(Number.isInteger);
  return out;
}

/* ---------------- editing choices ---------------- */
export function setChoice(q, i, value) {
  const choices = asArray(q && q.choices).slice();
  if (i < 0 || i >= choices.length) return q;
  choices[i] = text(value);
  return { ...q, choices };
}

export function addChoice(q) {
  return { ...q, choices: [...asArray(q && q.choices), ""] };
}

/* ⚠️⚠️ REMOVING A CHOICE RENUMBERS THE ANSWER KEY. Every index above the
   removed one shifts down by one, and an answer that WAS the removed choice
   becomes unpicked rather than pointing at whatever slid into its place. That
   silent slide is the exact failure the L101Week comment describes for stored
   progress, and it is just as wrong in the key itself.
   ⚠️ Refuses below MIN_CHOICES rather than leaving a question that cannot be
   answered. */
export function removeChoice(q, i) {
  const choices = asArray(q && q.choices);
  if (choices.length <= MIN_CHOICES) return q;
  if (i < 0 || i >= choices.length) return q;
  const next = { ...q, choices: choices.filter((_, k) => k !== i) };
  const shift = (v) => (v === i ? null : (v > i ? v - 1 : v));
  if (isMulti(q)) {
    next.answers = asArray(q.answers).map(shift).filter((v) => v !== null && v !== undefined);
  } else {
    next.answer = Number.isInteger(q && q.answer) ? shift(q.answer) : null;
  }
  return next;
}

/* ---------------- editing the key ---------------- */
export function setAnswer(q, i) {
  if (isMulti(q)) return q;
  return { ...q, answer: isIdx(i, asArray(q && q.choices).length) ? i : null };
}

export function toggleAnswer(q, i) {
  if (!isMulti(q)) return q;
  const have = asArray(q.answers);
  const next = have.includes(i) ? have.filter((v) => v !== i) : [...have, i].sort((a, b) => a - b);
  return { ...q, answers: next };
}

/* ---------------- questions on a quiz ---------------- */
export function addQuestion(item) {
  const questions = [...asArray(item && item.questions), newQuestion()];
  return { ...item, questions, timeLabel: timeLabelFor(questions.length) };
}

/* ⚠️ THE LAST QUESTION CANNOT BE REMOVED. A quiz with an empty questions array
   renders as a gradeable exercise with nothing in it and saves a score of 0 of
   0 onto a student's record. Deleting the quiz whole is already supported by
   the editor and is the honest way to remove it. */
export function removeQuestion(item, qi) {
  const questions = asArray(item && item.questions);
  if (questions.length <= 1) return item;
  const next = questions.filter((_, k) => k !== qi);
  return { ...item, questions: next, timeLabel: timeLabelFor(next.length) };
}

export function moveQuestion(item, qi, delta) {
  const questions = asArray(item && item.questions).slice();
  const j = qi + delta;
  if (qi < 0 || qi >= questions.length || j < 0 || j >= questions.length) return item;
  [questions[qi], questions[j]] = [questions[j], questions[qi]];
  return { ...item, questions };
}

export function setQuestion(item, qi, q) {
  const questions = asArray(item && item.questions).slice();
  if (qi < 0 || qi >= questions.length) return item;
  questions[qi] = q;
  return { ...item, questions };
}

/* ---------------- validation ----------------
   Every message is written to be read by Bri on a screen, not by a developer in
   a log: it says which question, what is wrong, and implies the fix. */
export function questionProblems(q, qi) {
  const out = [];
  const n = qi + 1;
  const choices = asArray(q && q.choices);
  if (!text(q && q.q).trim()) out.push(`Question ${n} has no question written.`);
  if (choices.length < MIN_CHOICES) out.push(`Question ${n} needs at least ${MIN_CHOICES} choices.`);
  const blanks = choices.reduce((a, c, i) => (text(c).trim() ? a : [...a, i + 1]), []);
  if (blanks.length) out.push(`Question ${n} has ${blanks.length === 1 ? "a blank choice" : "blank choices"} (${blanks.join(", ")}).`);
  if (isMulti(q)) {
    const keys = asArray(q.answers);
    if (!keys.length) out.push(`Question ${n} is select-all but nothing is marked correct.`);
    if (keys.some((v) => !isIdx(v, choices.length))) out.push(`Question ${n} marks a correct answer that is not one of its choices.`);
    if (new Set(keys).size !== keys.length) out.push(`Question ${n} marks the same choice correct twice.`);
  } else {
    if (!Number.isInteger(q && q.answer)) out.push(`Question ${n} has no correct answer marked.`);
    else if (!isIdx(q.answer, choices.length)) out.push(`Question ${n} marks a correct answer that is not one of its choices.`);
  }
  return out;
}

/* ⚠️ A QUIZ WITH NO `questions` ARRAY IS ITSELF A PROBLEM, reported rather than
   quietly treated as empty. This is the case the renderer's comment says would
   blank the whole class. */
export function quizProblems(item) {
  if (!item || item.type !== "quiz") return [];
  if (!Array.isArray(item.questions)) return ["This quiz has no questions on it at all."];
  if (!item.questions.length) return ["This quiz has no questions on it at all."];
  return item.questions.flatMap((q, qi) => questionProblems(q, qi));
}

/* Every quiz across a whole week, for the save gate. Returns a flat list the
   screen can print, each already naming its quiz. */
export function weekQuizProblems(sections) {
  const out = [];
  for (const s of asArray(sections)) {
    for (const it of asArray(s && s.items)) {
      if (!it || it.type !== "quiz") continue;
      for (const p of quizProblems(it)) out.push(`${it.title || "Quiz"}: ${p}`);
    }
  }
  return out;
}

/* ---------------- what actually gets stored ----------------
   ⚠️ THE SHAPE THAT LEAVES THIS FILE IS THE SHAPE QuizItem READS, and nothing
   else rides along. `answer: null` is an editor state meaning "not picked yet";
   it never reaches storage, because a quiz carrying one cannot pass validation
   and cannot be saved.
   ⚠️ Existing questions keep every field they already had that this editor does
   not manage. A quiz written months ago must still read (design rule 1). */
export function cleanQuestion(q) {
  const out = { ...q, q: text(q && q.q), choices: asArray(q && q.choices).map(text) };
  if (isMulti(q)) {
    delete out.answer;
    out.answers = [...new Set(asArray(q.answers))].sort((a, b) => a - b);
  } else {
    delete out.answers;
    out.answer = Number.isInteger(q && q.answer) ? q.answer : null;
  }
  return out;
}

export function cleanQuiz(item) {
  if (!item || item.type !== "quiz") return item;
  return { ...item, questions: asArray(item.questions).map(cleanQuestion) };
}

/* Applied to a whole week on save, so nothing depends on the screen having
   touched a particular quiz. Non-quiz items pass through untouched. */
export function cleanWeek(sections) {
  return asArray(sections).map((s) => ({
    ...s,
    items: asArray(s && s.items).map((it) => (it && it.type === "quiz" ? cleanQuiz(it) : it)),
  }));
}
