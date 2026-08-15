/* ============================================================================
   L101Survey.jsx — Gate City Hub

   The end-of-class survey. Bri, Aug 3 2026: "I would like to have a survey
   added somewhere at the end of the L101 class — maybe upon completing the
   last module it can open the survey as a final step to completing the class…
   I'd like this to be locked using a timed open/close, along with a manual
   open/close if I need it."

   ★★ IT IS ANONYMOUS, AND THAT DECIDED THE WHOLE DESIGN. Her Google Form says
   it in her own words: "These forms are submitted anonymously, but please send
   the code on the submission page to receive credit for participation."
   ⚠️ THE FIRST VERSION OF THIS FILE GOT IT WRONG. It saved each answer through
   the student's own progress record, keyed `survey:<id>`, so their name sat on
   every line of their feedback about their own instructor. It read as a nice
   tidy touch and it would have quietly gutted the honesty the survey exists to
   collect. An evaluation people sign is a different evaluation.
   ⇒ Responses go to the `submissions` stream under tool `class-survey` with
   submitted_by "Anonymous", which the WORKER forces rather than trusts (see
   /api/submission). The tool is on SUB_PROTECTED, so reads need a full HR
   reader — Bri, Matt, Hannah, Cindy, Nick. Not the world-readable table.

   ★ CREDIT WITHOUT ATTRIBUTION, WHICH GOOGLE COULD NOT DO. Her "send me the
   code" step exists only because a Google Form cannot record that you took it
   without recording what you said. Here, participation is a plain completed
   item on the student's own record and the answers are somewhere else entirely.
   She knows who took it. She does not know who wrote what.
   ⚠️ SUBMIT FIRST, MARK SECOND, and never the other way round. If the mark
   fails after a good submit, someone is missing credit and Bri can see the
   response arrived. If it were reversed, a failed submit would leave someone
   credited for feedback that does not exist — the failure that hides itself.

   ★ THE MANUAL SWITCH BEATS THE DATES, IN BOTH DIRECTIONS. She asked for timed
   open/close AND a manual override, which only means something if the override
   wins — otherwise "open it now" does nothing until the date agrees.

   ★ QUESTION TEXT IS STORED WITH THE ANSWER, never an index or an id. Same rule
   as saveQuiz's `responses` in L101Progress: an index stops meaning anything
   the moment Bri edits or reorders a question, and an answer that silently
   re-points at a different question is worse than no answer at all.
   ============================================================================ */
import React, { useState } from "react";
/* The shared raised look and accent edge — see cardStyle.js. */
import { CARD_3D, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { saveSubmission } from "./store.js";
/* Who runs the course, as a name on screen. "Bri" here, "the Director" at a
   store that has not said. Called at USE time, never captured in a const — a
   module-level copy would freeze Gate City's answer before a store's saved
   settings arrive. Same rule as the header of L101Week.jsx. */
import { courseOwnerLabel } from "./storeConfig.js";

export const SURVEY_TOOL = "class-survey";
/* The completed item on the student's own record. Long and unmistakable on
   purpose: item ids share one namespace with every module in the class, and a
   collision would mark a module done that nobody did. */
export const SURVEY_ITEM_ID = "class-survey";

/* Pure and module level, so nothing can read it mid-render. Dates are plain
   YYYY-MM-DD compared as strings — same rule the rest of L101 uses, and it
   sidesteps every timezone question a Date object would raise. */
export function surveyIsOpen(cfg, todayIso) {
  if (!cfg) return false;
  if (cfg.manual === true) return true;
  if (cfg.manual === false) return false;
  const t = String(todayIso || "").slice(0, 10);
  if (cfg.openAt && t < String(cfg.openAt)) return false;
  if (cfg.closeAt && t > String(cfg.closeAt)) return false;
  /* No window set at all and no manual switch = closed. An unconfigured survey
     must not quietly start collecting answers the moment it ships. */
  return !!(cfg.openAt || cfg.closeAt);
}

/* Bri's form, question for question, so she is not retyping it. Types match
   what she actually built: one 1-5 scale, two Yes/No, four written.
   `req` mirrors her asterisks — 7 is the only optional one. */
export const SURVEY_SEED = [
  { id: "q1", type: "scale", req: true, text: "How would you rate your overall experience participating in Leadership 101?",
    lowLabel: "Highly Dissatisfied", highLabel: "Highly Satisfied" },
  { id: "q2", type: "text", req: true, text: "What was your favorite part of the course? Why?" },
  { id: "q3", type: "text", req: true, text: "What was your least favorite part of the course? Why?" },
  { id: "q4", type: "text", req: true, text: "What would you add or change regarding the course material or delivery?" },
  { id: "q5", type: "choice", req: true, text: "Do you feel that the course has helped develop your leadership skills?", options: ["Yes", "No"] },
  { id: "q6", type: "choice", req: true, text: "Would you recommend this course to other growing leaders?", options: ["Yes", "No"] },
  { id: "q7", type: "text", req: false, text: "Please provide any additional comments or feedback that you think would be helpful for us to continue developing the course. Be as specific as necessary." },
];

const C = { ink: "#171C26", sub: "#5B6472", paper: "#F4F6F8", card: "#FFFFFF", line: "#E3E7EC", green: "#1E8E5A", greenSoft: "#E4F3EC", red: "#DD0031" };

/* Answered means answered, for every type. A scale of 0 and an empty string are
   both "not yet"; `false` is never a valid answer here, so a plain falsy test
   would be right for the current three types — but it would quietly break the
   day somebody adds a checkbox. Checked per type instead. */
function isAnswered(q, v) {
  if (q.type === "scale") return Number(v) > 0;
  return String(v == null ? "" : v).trim().length > 0;
}

export default function L101Survey({ cfg, P, todayIso, program, programName }) {
  const questions = Array.isArray(cfg && cfg.questions) && cfg.questions.length ? cfg.questions : SURVEY_SEED;
  const open = surveyIsOpen(cfg, todayIso);
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");
  const alreadyDone = !!(P && P.isDone && P.isDone(SURVEY_ITEM_ID));

  const set = (id, v) => setVals((d) => ({ ...d, [id]: v }));
  const missing = questions.filter((q) => q.req && !isAnswered(q, vals[q.id]));

  const submit = async () => {
    if (busy || missing.length) return;
    setBusy(true); setFailed("");
    /* Question TEXT, answer, and type — no ids, no student, no timestamps per
       answer. What Bri reads is a page of answers with no way back to a person,
       which is the whole point. */
    const answers = questions.map((q) => ({
      question: q.text,
      type: q.type,
      answer: isAnswered(q, vals[q.id]) ? String(vals[q.id]) : "",
    }));
    const ok = await saveSubmission(SURVEY_TOOL, "Anonymous", { program: program || "l101", answers });
    /* ⚠️ A REFUSED SAVE MUST NOT LOOK LIKE A GOOD ONE. saveSubmission returns
       false on refusal and never throws, so the old habit of assuming success
       would show "Thanks!" over a response that reached nobody, mark the
       student complete, and lose their answers when the page closed. */
    if (!ok) { setBusy(false); setFailed("Your answers did not send. Nothing was recorded, and what you typed is still on screen — check your signal and press Submit again."); return; }
    const marked = P && P.markDone ? await P.markDone(SURVEY_ITEM_ID, true, "Class survey") : false;
    setBusy(false);
    /* ⚠️ "they", not "she". The name is now whoever runs the course at this
       store, so the pronoun cannot assume one. */
    if (marked === false) setFailed(`Your answers went through, thank you. The credit for taking it did not save though — tell ${courseOwnerLabel()} so they can mark you off.`);
  };

  if (!questions.length) return null;

  const box = { border: `1px solid ${C.line}`, borderRadius: 14, background: C.card, padding: "14px 16px", marginTop: 14 };

  if (alreadyDone) {
    return (
      <div style={box}>
        <div style={{ fontSize: 17, fontWeight: 800, color: C.ink }}>{(cfg && cfg.title) || `${programName || "Class"} Evaluation`}</div>
        <div style={{ marginTop: 8, fontSize: 13.5, color: C.ink, background: C.greenSoft, border: `1px solid ${C.green}33`, borderRadius: 10, padding: "10px 12px", lineHeight: 1.5 }}>
          Done, and thank you. Your answers went in without your name on them. You are marked as having completed it.
        </div>
      </div>
    );
  }

  return (
    <div style={box}>
      <div style={{ fontSize: 17, fontWeight: 800, color: C.ink }}>{(cfg && cfg.title) || `${programName || "Class"} Evaluation`}</div>
      <div style={{ fontSize: 13, color: C.sub, marginTop: 4, lineHeight: 1.55 }}>
        {(cfg && cfg.blurb) || "Please help us continue to develop Leadership 101 by giving honest, constructive feedback about your experience."}
      </div>
      {/* Said plainly, because a promise of anonymity people don't believe buys
          nothing. It is also literally true: the server refuses to record who. */}
      <div style={{ fontSize: 12.5, color: C.sub, marginTop: 6, lineHeight: 1.5, fontStyle: "italic" }}>
        This is anonymous. Your name is not attached to your answers. The Hub records that you completed it, so you get credit without anyone knowing what you wrote.
      </div>

      {!open ? (
        /* ⚠️ SAYS WHY, NEVER JUST HIDES. A student who reaches the end and finds
           nothing assumes the Hub is broken and asks a leader. */
        <div style={{ marginTop: 10, fontSize: 13, color: C.sub, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 11px" }}>
          The survey is closed right now.
          {cfg && cfg.manual !== false && cfg.openAt && String(todayIso).slice(0, 10) < String(cfg.openAt)
            ? ` It opens ${cfg.openAt}.`
            : " Your instructor will open it."}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
          {questions.map((q, i) => (
            <div key={q.id}>
              <div style={{ fontSize: 14, color: C.ink, marginBottom: 6, lineHeight: 1.45 }}>
                <span style={{ fontFamily: "monospace", color: C.sub, marginRight: 8 }}>{i + 1}.</span>
                {q.text}
                {q.req && <span style={{ color: C.red, marginLeft: 4 }}>*</span>}
              </div>

              {q.type === "scale" && (
                <div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[1, 2, 3, 4, 5].map((n) => {
                      const on = Number(vals[q.id]) === n;
                      return (
                        <button key={n} onClick={() => set(q.id, n)}
                          style={{ width: 46, height: 42, borderRadius: 10, cursor: "pointer", fontSize: 15, fontWeight: 800,
                            border: `1px solid ${on ? C.green : C.line}`, background: on ? C.green : C.card, color: on ? "#fff" : C.ink }}>
                          {n}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.sub, marginTop: 4, maxWidth: 268 }}>
                    <span>{q.lowLabel || "1"}</span><span>{q.highLabel || "5"}</span>
                  </div>
                </div>
              )}

              {q.type === "choice" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(q.options && q.options.length ? q.options : ["Yes", "No"]).map((opt) => {
                    const on = String(vals[q.id]) === String(opt);
                    return (
                      <button key={opt} onClick={() => set(q.id, opt)}
                        style={{ padding: "10px 20px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 700,
                          border: `1px solid ${on ? C.green : C.line}`, background: on ? C.green : C.card, color: on ? "#fff" : C.ink }}>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}

              {q.type !== "scale" && q.type !== "choice" && (
                <textarea rows={3} value={vals[q.id] == null ? "" : vals[q.id]}
                  onChange={(ev) => { const v = ev.target.value; set(q.id, v); }}
                  placeholder="Your answer…"
                  style={{ width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", fontSize: 16,
                    padding: "9px 11px", borderRadius: 10, border: `1px solid ${C.line}`, background: "#fff", color: C.ink , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }} />
              )}
            </div>
          ))}

          {failed && (
            <div style={{ fontSize: 13, color: C.ink, background: "#FDECEF", border: `1px solid ${C.red}55`, borderRadius: 10, padding: "10px 12px", lineHeight: 1.5 }}>
              {failed}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button onClick={submit} disabled={busy || missing.length > 0}
              style={{ padding: "11px 22px", borderRadius: 10, border: "none", fontSize: 14.5, fontWeight: 800,
                cursor: busy || missing.length ? "default" : "pointer",
                background: busy || missing.length ? C.line : C.green, color: busy || missing.length ? C.sub : "#fff" }}>
              {busy ? "Sending…" : "Submit"}
            </button>
            {/* Says what is left rather than just disabling the button. A dead
                button with no reason is the frozen-page complaint. */}
            <span style={{ fontSize: 12.5, color: C.sub }}>
              {missing.length === 0
                ? "You can only submit once, so check it over first."
                : `${missing.length} required question${missing.length === 1 ? "" : "s"} still to answer.`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
