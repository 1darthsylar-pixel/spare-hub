/* ============================================================================
   quizAnswerKey.test.mjs — the instructor's answer key, and the letters beside
   the choices.

       node quizAnswerKey.test.mjs

   ⛔ WHY. Bri, Aug 19 2026: "Instructors need to have answer keys visible on
   their view." The matching game has had one since July. A quiz never did —
   QuizItem was the only activity with a right answer that was not even handed
   the `instructor` flag, so there was nothing to render even if it had wanted
   to.

   🐛 AND TWO THINGS FELL OUT OF BUILDING IT, both live the moment the editor
   started adding quizzes on Aug 11:
     · the choice letters were fixed at ["a","b","c","d"] while `addChoice` has
       no cap, so a fifth choice rendered with a BLANK letter and no way for an
       instructor to say "pick e" out loud;
     · `item.questions.length` was read bare in four places in a function whose
       own comment says an unguarded read there "would blank the whole class".

   ⚠️ THE LOGIC IS OUT IN l101QuizPlay.js FOR A REASON. QuizItem lives in a
   `.jsx` and nothing in checks/ can execute one, which is how both of those sat
   there looking like working code. Same lesson setupRows.js records.
   ============================================================================ */
import { isMulti, questionsOf, letterFor, answerKeyOf, unsetCount } from "./l101QuizPlay.js";
import * as QE from "./l101QuizEdit.js";
import { readFileSync } from "node:fs";

let pass = 0; const fails = [];
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
};
const group = (n) => console.log(`\n── ${n}`);

const single = (q, choices, answer) => ({ q, choices, answer });
const multi = (q, choices, answers) => ({ q, choices, answers });

group("1. the choice letters — the bug the editor made reachable");
{
  ok("first four are unchanged", ["a", "b", "c", "d"].every((l, i) => letterFor(i) === l));
  /* ⚠️ THE WHOLE POINT. addChoice has no upper bound, so these used to be blank. */
  ok("★★★ a fifth choice HAS a letter", letterFor(4) === "e", letterFor(4));
  ok("★★ and a sixth", letterFor(5) === "f", letterFor(5));
  ok("the twenty-sixth is z", letterFor(25) === "z", letterFor(25));
  ok("★ it does not run out at z", letterFor(26) === "aa", letterFor(26));
  ok("and keeps going", letterFor(27) === "ab", letterFor(27));
  ok("every letter up to 30 is non-empty",
    Array.from({ length: 30 }, (_, i) => letterFor(i)).every((l) => l.length > 0));
  ok("★ they are all different", new Set(Array.from({ length: 60 }, (_, i) => letterFor(i))).size === 60);
  ok("a negative index is empty, not a crash", letterFor(-1) === "");
  ok("a non-number is empty", letterFor("x") === "" && letterFor(null) === "" && letterFor(undefined) === "");
  ok("a fraction is empty", letterFor(1.5) === "");
}

group("2. the answer key reads as words, never as numbers");
{
  const item = { questions: [
    single("Who owns the shift?", ["The leader", "The guest", "Nobody"], 0),
    single("When do you step in?", ["Never", "At the first sign", "After it fails"], 1),
  ] };
  const key = answerKeyOf(item);
  ok("one row per question", key.length === 2);
  ok("★★ the key is the CHOICE TEXT, not an index", key[0].correct[0] === "The leader", key[0].correct);
  ok("★ and it carries the letter the student sees", key[0].letters[0] === "a", key[0].letters);
  ok("the second is b", key[1].letters[0] === "b" && key[1].correct[0] === "At the first sign");
  ok("rows are numbered from one", key[0].n === 1 && key[1].n === 2);
  ok("the question text rides along", key[0].q === "Who owns the shift?");
  ok("nothing is marked unset", key.every((k) => !k.unset));
  ok("and unsetCount agrees", unsetCount(item) === 0);
}

group("3. select-all");
{
  const item = { questions: [multi("Pick both", ["one", "two", "three"], [2, 0])] };
  const key = answerKeyOf(item);
  ok("it says it is a multi", key[0].multi === true);
  ok("★ both answers come back", key[0].correct.length === 2, key[0].correct);
  /* ⚠️ SORTED, so the key reads in the same order the choices are on screen.
     An unsorted [2,0] would print "c, a" against a list that runs a, b, c. */
  ok("★★ in choice order, not the order they were marked",
    key[0].letters.join("") === "ac" && key[0].correct.join("|") === "one|three", key[0]);
  ok("a single question is not a multi", answerKeyOf({ questions: [single("q", ["a", "b"], 1)] })[0].multi === false);
}

group("4. an unfinished question says so, and never guesses");
{
  /* ⚠️ `newQuestion` starts at answer: null ON PURPOSE — a default of 0 is a
     silent claim that the first choice is right. The key must not undo that. */
  const fresh = QE.newQuiz("x");
  ok("★ a brand new quiz has an unmarked question (control)", fresh.questions[0].answer === null);
  const key = answerKeyOf(fresh);
  ok("★★★ it comes back UNSET, not as choice a", key[0].unset === true && key[0].correct.length === 0, key[0]);
  ok("and it is counted", unsetCount(fresh) === 1);

  const half = { questions: [single("done", ["a", "b"], 0), QE.newQuestion(), QE.newQuestion()] };
  ok("★ two of three unmarked", unsetCount(half) === 2, unsetCount(half));
  ok("the finished one still reads", answerKeyOf(half)[0].correct[0] === "a");

  /* An index the choice list does not have is dropped rather than printed as
     "undefined" — that means key and choices have drifted, and inventing an
     answer is worse than showing none. */
  ok("★★ an out-of-range answer is unset, not 'undefined'",
    answerKeyOf({ questions: [single("q", ["a", "b"], 7)] })[0].unset === true);
  ok("★★ and a multi drops only the bad index",
    JSON.stringify(answerKeyOf({ questions: [multi("q", ["a", "b"], [0, 9])] })[0].correct) === '["a"]');
  ok("a negative index is dropped too",
    answerKeyOf({ questions: [single("q", ["a", "b"], -1)] })[0].unset === true);
}

group("5. nothing here may throw on a half-built quiz");
{
  ok("no item", answerKeyOf(null).length === 0 && answerKeyOf(undefined).length === 0);
  ok("no questions key", answerKeyOf({}).length === 0);
  ok("questions is not an array", answerKeyOf({ questions: "five" }).length === 0);
  ok("a null question", answerKeyOf({ questions: [null] }).length === 1);
  ok("a question with no choices", answerKeyOf({ questions: [{ q: "x", answer: 0 }] })[0].unset === true);
  ok("choices is not an array", answerKeyOf({ questions: [{ q: "x", choices: "ab", answer: 0 }] })[0].unset === true);
  ok("unsetCount survives all of it", unsetCount(null) === 0 && unsetCount({ questions: [null] }) === 1);
  ok("questionsOf is always an array",
    Array.isArray(questionsOf(null)) && Array.isArray(questionsOf({ questions: 3 })));
}

group("6. one rule for how a question is graded, in two modules");
{
  /* ⚠️ THREE COPIES OF isMulti EXISTED: this module, l101QuizEdit.js, and an
     inline one in L101Week.jsx. The inline one is gone; these two must agree,
     because a disagreement is somebody's wrong score and nothing else. */
  const cases = [
    multi("m", ["a", "b"], [0]), single("s", ["a", "b"], 0),
    { q: "no answers at all", choices: ["a"] },
    { q: "answers is not an array", choices: ["a"], answers: 2 },
    { q: "empty answers array", choices: ["a"], answers: [] },
    null, undefined, {},
  ];
  cases.forEach((c, i) => ok(`case ${i}: play and edit agree`, isMulti(c) === QE.isMulti(c),
    { play: isMulti(c), edit: QE.isMulti(c) }));
  ok("★ and they are not both trivially false (control)", isMulti(cases[0]) === true);
}

group("7. the real quizzes in the shipped classes");
{
  /* ⚠️ RUNS THE REAL CONTENT, not a fixture. The classes live in .jsx, so the
     quiz literals are sliced out by brace counting and evaluated.
     ⚠️ GUARDED: a failed extraction is ONE named failure, not a stack trace
     that takes every assertion below it with it. That lesson is recorded in
     cleaningSpeed.test.mjs and it cost a whole test file the first time. */
  const grab = (file) => {
    const src = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    const out = [];
    let at = 0;
    while ((at = src.indexOf('type: "quiz"', at)) !== -1) {
      const start = src.lastIndexOf("{", at);
      /* ⚠️⚠️ COMMENTS HAVE TO BE SKIPPED, AND THE FIRST VERSION OF THIS DID
         NOT DO IT. The Catering quiz carries `// Bri's key is "a, b, d"`, and
         that apostrophe opened a string the scanner then looked for a closing
         quote to — swallowing the rest of the file, failing the brace match,
         and silently returning ZERO quizzes from that module. The controls
         above caught it, which is the only reason it is not still there.
         ⇒ A control that must be FOUND is worth more than the thing it guards. */
      let depth = 0, q = null, end = -1, line = false, block = false;
      for (let i = start; i < src.length; i++) {
        const ch = src[i], nx = src[i + 1];
        if (line) { if (ch === "\n") line = false; continue; }
        if (block) { if (ch === "*" && nx === "/") { block = false; i++; } continue; }
        if (q) { if (ch === "\\") i++; else if (ch === q) q = null; continue; }
        if (ch === "/" && nx === "/") { line = true; i++; continue; }
        if (ch === "/" && nx === "*") { block = true; i++; continue; }
        if (ch === '"' || ch === "'" || ch === "`") { q = ch; continue; }
        if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
      }
      /* One unreadable literal must not hide the rest of the file. Skip past it
         and keep going; the count control above is what reports the shortfall. */
      if (end < 0) { at += 12; continue; }
      out.push(src.slice(start, end));
      at = end;
    }
    return out;
  };
  let quizzes = [];
  try {
    ["L101IntroModule.jsx", "L101CateringModule.jsx"].forEach((f) => {
      grab(f).forEach((text) => { quizzes.push(new Function(`return (${text});`)()); });
    });
  } catch (e) {
    fails.push(`could not read the real quizzes — ${e.message}`);
    console.log(`  FAIL  could not read the real quizzes — ${e.message}`);
    quizzes = [];
  }

  ok(`★★ the real quizzes were read (control) — ${quizzes.length} found`, quizzes.length >= 5, quizzes.length);
  const questions = quizzes.flatMap(questionsOf);
  ok(`★★ and they have questions in them (control) — ${questions.length}`, questions.length >= 20, questions.length);

  const keys = quizzes.map((z) => answerKeyOf(z));
  ok("★★★ EVERY SHIPPED QUESTION HAS AN ANSWER MARKED, AND IT IS IN RANGE",
    keys.every((k) => k.every((row) => !row.unset)),
    keys.flatMap((k, zi) => k.filter((r) => r.unset).map((r) => `${quizzes[zi].id}:Q${r.n}`)));
  ok("★★ every key row reads as text, never a bare number",
    keys.every((k) => k.every((r) => r.correct.every((c) => typeof c === "string" && c.length > 0))));
  ok("★ a multi in the shipped set is graded as a multi (control)",
    keys.some((k) => k.some((r) => r.multi)));
  /* ⚠️ THE BUG THIS SECTION EXISTS FOR: any shipped question already past four
     choices would have rendered a blank letter. */
  const widest = Math.max(0, ...questions.map((q) => (Array.isArray(q.choices) ? q.choices.length : 0)));
  ok(`★ every shipped choice has a letter (widest question has ${widest})`,
    Array.from({ length: widest }, (_, i) => letterFor(i)).every((l) => l.length > 0));
}

group("8. the class actually uses this, and only instructors see it");
{
  const W = readFileSync(new URL("./L101Week.jsx", import.meta.url), "utf8");
  ok("L101Week.jsx was read (control)", W.length > 50000, String(W.length));
  ok("★★ it imports the key from the leaf", /import \{[^}]*answerKeyOf[^}]*\} from "\.\/l101QuizPlay\.js"/.test(W));
  ok("★★★ the quiz is HANDED the instructor flag — it never used to be",
    /case "quiz": return <QuizItem item=\{item\} P=\{P\} instructor=\{instructor\} \/>;/.test(W));
  ok("★★★ and the key renders behind that flag",
    /\{instructor && questionList\.length > 0 && \(/.test(W));
  ok("★★ the letters come from the leaf, not a four-item array",
    W.includes("{letterFor(ci)}") && !/const letters = \["a", "b", "c", "d"\]/.test(W));
  /* ⚠️ CONTROL THAT MUST BE FOUND: the guarded list still exists, so the four
     bare `item.questions.length` reads cannot quietly come back. */
  ok("★★ the guarded question list is still the one being used",
    W.includes("const questionList = Array.isArray(item.questions) ? item.questions : [];")
    && !W.includes("item.questions.length"));
  ok("★ MatchItem's key still sits behind the same flag (control)",
    /\{instructor && \(/.test(W));
}

console.log(`\n${fails.length ? "FAILED" : "PASSED"}  ${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log("  · " + f)); process.exit(1); }
