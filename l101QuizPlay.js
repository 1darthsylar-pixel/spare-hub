/**
 * l101QuizPlay.js — the rules for SITTING a Leadership 101 quiz, and for the
 * instructor's answer key.
 *
 * ★ LEAF MODULE ON PURPOSE. Imports NOTHING, same rule as l101QuizEdit.js.
 * QuizItem lives in L101Week.jsx, a `.jsx` that no Node test can import, so
 * anything worth proving has to live out here to be provable at all. That is
 * the same lesson setupRows.js records.
 *
 * ⚠️ WHY THIS IS A SECOND QUIZ MODULE AND NOT MORE OF l101QuizEdit.js. That one
 * answers "may this quiz be SAVED". This one answers "what does a person SEE".
 * Two different questions, and the edit module is loaded by the editor while
 * this one is loaded by every student.
 */

/* A question is either single-answer (`answer`) or select-all (`answers`).
   ⚠️ ONE DEFINITION FOR THE PLAY SIDE. L101Week.jsx used to carry its own copy
   inline; quizAnswerKey.test.mjs asserts this one and l101QuizEdit's still
   agree, because two functions deciding how a question is GRADED is the kind of
   drift that shows up as somebody's wrong score and nothing else. */
export const isMulti = (q) => Array.isArray(q && q.answers);

export const questionsOf = (item) => (Array.isArray(item && item.questions) ? item.questions : []);

/* ⚠️ THE LETTER LIST WAS FIXED AT FOUR — ["a","b","c","d"] — AND THE EDITOR HAS
   NO UPPER LIMIT ON CHOICES. `addChoice` in l101QuizEdit.js appends without a
   cap, deliberately, so the moment Bri writes a five-option question the fifth
   button renders with a BLANK letter beside it and she has no way to refer to
   it out loud in class. It does not throw, which is why it would have shipped.
   ⇒ Goes to z, then aa, ab. Nobody will write 27 choices; a function that
   cannot run out is still cheaper than one that fails quietly. */
export function letterFor(i) {
  /* ⚠️ typeof FIRST, AND THAT IS NOT PEDANTRY. `Number(null)` is 0, so a bare
     `Number(i)` answered "a" for null — a missing index rendered as a
     confident letter a, which is the one wrong answer this function can give
     that nobody would question on screen. */
  if (typeof i !== "number" || !Number.isInteger(i) || i < 0) return "";
  const n = i;
  let out = "", k = n;
  while (k >= 0) {
    out = String.fromCharCode(97 + (k % 26)) + out;
    k = Math.floor(k / 26) - 1;
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE INSTRUCTOR'S ANSWER KEY.

   Bri, Aug 19 2026: "Instructors need to have answer keys visible on their
   view."

   The matching game has had one since July and a quiz never did — QuizItem was
   the only activity with a right answer that was not handed the `instructor`
   flag at all, so there was nothing to render even if it had wanted to.

   ⚠️⚠️ SAY THE TRUE THING ABOUT WHAT THIS PROTECTS. The answers ride in the
   course content, and the course content is what the STUDENT'S BROWSER
   DOWNLOADS — L101W2.js says exactly this in its header, and it is why the
   fill-in-the-blanks in that week are written as `qa` and never as `quiz`. So
   gating the key on `instructor` keeps it off the student's SCREEN. It is not a
   secret from a determined student with a developer console, and no comment
   here should ever claim it is. If a key genuinely has to be secret, it has to
   live server-side and be checked there. That is a different build.

   ⚠️ TEXT, NEVER INDICES. Same rule the stored responses follow: an index only
   means something against the exact content that produced it, and Bri edits
   this content. A key printed as "2" is unreadable the moment a choice moves.

   ⚠️ A QUESTION WITH NO ANSWER MARKED COMES BACK EMPTY RATHER THAN GUESSING.
   `newQuestion` starts at `answer: null` on purpose, so an unfinished question
   is a real state, and the key must show it as unset instead of quietly
   printing choice `a`.
   ══════════════════════════════════════════════════════════════════════════ */
export function answerKeyOf(item) {
  return questionsOf(item).map((q, i) => {
    const multi = isMulti(q);
    const choices = Array.isArray(q && q.choices) ? q.choices : [];
    const idx = multi
      ? [...(Array.isArray(q.answers) ? q.answers : [])].sort((a, b) => a - b)
      : (q == null || q.answer == null ? [] : [q.answer]);
    /* An index the choice list does not have is dropped rather than rendered as
       "undefined". It means the key and the choices have drifted, which the
       editor's own validator reports; the key must not invent an answer. */
    const inRange = idx.filter((c) => Number.isInteger(c) && c >= 0 && c < choices.length);
    return {
      n: i + 1,
      q: String((q && q.q) || ""),
      multi,
      letters: inRange.map(letterFor),
      correct: inRange.map((c) => String(choices[c] ?? "")),
      unset: inRange.length === 0,
    };
  });
}

/* How many questions still have no answer marked. The instructor key says this
   out loud at the top, because a key that silently lists nothing for question 4
   reads as "there is no answer" rather than "this is not finished". */
export const unsetCount = (item) => answerKeyOf(item).filter((k) => k.unset).length;
