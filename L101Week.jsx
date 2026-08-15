import React, { useState, useMemo, useEffect, useRef } from "react";
/* The shared raised look and accent edge — see cardStyle.js. */
import { CARD_3D, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { useEditableCourse, CourseEditor, canEditCourse } from "./L101Editor.jsx";
import { useProgress, DoneToggle, openUpload } from "./L101Progress.jsx";
import { kvGetResult, kvSet, hubToken } from "./store.js";
import { collectStrings, applyStrings } from "./courseTranslate.js";
import SkillsChecklists from "./skillsPanel.jsx";
import { INSTRUCTOR_WEEKS, ASSIGN_KEY, loadAssignments, isAssigned, loadEligibleInstructors,
  inotesKey, ifeedbackKey, recordSession, normPid } from "./l101Instructors.js";
/* ⚠️ CALLED INSIDE EACH SENTENCE, NEVER HOISTED INTO A `const` AT MODULE LEVEL.
   A const would capture "Bri" at import, before a store's saved settings are
   merged, and every one of these five sentences would name her forever. */
import { courseOwnerLabel, courseOwnerLabelCap, STORE } from "./storeConfig.js";

/**
 * L101Week — the Leadership 101 class RENDERER, with no content of its own.
 *
 * ★ WHY THIS FILE EXISTS (Jul 27 2026)
 * Week 1 and Week 4 were two near-identical ~700-line files differing only in
 * their content object and their week id. Bri has asked for a third class
 * ("Welcome to Leadership 101") and a fourth ("Trainer Orientation"), so the
 * copy-the-file pattern was about to make four copies of one renderer.
 * A class is now: this renderer + a seed object + a week id.
 *
 * ★★ THE TWO COPIES HAD ALREADY DRIFTED, AND THE DRIFT WAS REAL.
 * This renderer is taken from the CATERING (W4) copy, which was a strict
 * superset of the Intro (W1) one:
 *   · `upload` item type + UploadItem — Intro had neither
 *   · select-all quiz questions (`q.answers`) — Intro only supported one answer
 *     per question, so W4's Quiz 1 Q5 could not have been answered correctly
 *     under it
 * Extracting from Intro (the first attempt) would have silently broken a graded
 * question the moment W4 moved onto it. `needsText` — the amber "question text
 * pending" marker, Intro-only — is carried back in below so nothing is lost in
 * either direction.
 *
 * ⚠️ THAT DRIFT IS THE ARGUMENT FOR THIS FILE. Two copies of a renderer do not
 * stay equal, and nobody finds out until a graded question quietly misgrades.
 *
 * Props:
 *   weekId    — storage key for content, progress and submission ("w1", "w4",
 *               "welcome"). A student's whole record hangs off it, so it must
 *               never change once anyone has started.
 *   weekLabel — what the submission is called in Bri's DM ("Week 4").
 *   seed      — starting content. Renders until somebody saves an edit; after
 *               that the stored version wins. One-way door per class.
 */

const C = {
  ink: "#171C26", sub: "#5B6472", paper: "#F4F6F8", card: "#FFFFFF",
  line: "#E3E7EC", red: "#DD0031", green: "#1E8E5A", greenSoft: "#E4F3EC",
  amber: "#C77D0A", amberSoft: "#FBF1DF", blue: "#1D5FA8", blueSoft: "#E6EFF9",
  redSoft: "#FBE7EC", ink2: "#0F1622",
};

// Item type identity — icon + label + accent. Structure encodes the
// kind of work each item asks of the student.
const TYPE = {
  watch:  { label: "Watch",     icon: "▶", fg: C.red,   bg: C.redSoft },
  read:   { label: "Read",      icon: "❑", fg: C.blue,  bg: C.blueSoft },
  qa:     { label: "Reflect",   icon: "✎", fg: C.amber, bg: C.amberSoft },
  match:  { label: "Activity",  icon: "⇄", fg: "#7D2AE8", bg: "#F1E8FD" },
  quiz:   { label: "Quiz",      icon: "✓", fg: C.green, bg: C.greenSoft },
  assign: { label: "Assignment", icon: "✐", fg: C.ink,  bg: "#ECEEF1" },
  upload: { label: "Assignment", icon: "⬆", fg: C.ink,  bg: "#ECEEF1" },
  walk:   { label: "Walkthrough", icon: "◎", fg: "#0E7490", bg: "#E0F1F6" },
};

const font = {
  display: "'Archivo', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  fun: "'Baloo 2', 'Inter', system-ui, sans-serif", // playful, rounded — for the type bubbles
};

// Reading-page images — served through the Hub's own /docs proxy, which maps
// /docs/<name> onto the hub-assets public bucket. Same bytes as the direct
// bucket URL, and the address bar stays on gatecityhub.com.
// Keys match the `images:` values in each read item's content above.
const READING_IMAGES = {
  "resource-leadership-principles-1": "/docs/1.png",
  "resource-leadership-principles-2": "/docs/2.png",
};

function Chip({ type }) {
  const t = TYPE[type];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: font.fun,
      fontSize: 12, fontWeight: 700, letterSpacing: 0.2, color: t.fg, backgroundColor: t.bg,
      padding: "3px 10px", borderRadius: 20 }}>
      <span aria-hidden style={{ fontSize: 11 }}>{t.icon}</span>{t.label}
    </span>
  );
}

// ── WATCH ─────────────────────────────────────────────
function WatchItem({ item }) {
  const [play, setPlay] = useState(false);
  const thumb = `https://img.youtube.com/vi/${item.youtube}/hqdefault.jpg`;
  return (
    <div>
      <div style={{ position: "relative", borderRadius: 12, overflow: "hidden",
        aspectRatio: "16 / 9", backgroundColor: "#000" }}>
        {play ? (
          <iframe title={item.title} width="100%" height="100%" style={{ border: 0, display: "block" }}
            src={`https://www.youtube.com/embed/${item.youtube}?autoplay=1&rel=0`}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen />
        ) : (
          <button onClick={() => setPlay(true)} aria-label={`Play ${item.title}`}
            style={{ all: "unset", cursor: "pointer", position: "absolute", inset: 0 }}>
            <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.85 }} />
            <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ width: 62, height: 62, borderRadius: "50%", background: C.red,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 6px 20px rgba(0,0,0,.35)" }}>
                <span style={{ color: "#fff", fontSize: 22, marginLeft: 4 }}>▶</span>
              </span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── READ ──────────────────────────────────────────────
function ReadItem({ item }) {
  /* 🐛 Bri, Jul 27: "undefined is not an object (evaluating 'e.images.map')".
     `item.images` was read unguarded, and a reading item does not have to have
     any images at all.

     ⚠️ THIS WAS A LANDMINE, NOT JUST A BAD SEED. The editor's own "+ Add an
     item… → Reading" creates `{ id, type: "read", title, note: "" }` — no
     `images` key, because reading images are not editable in the editor. So
     the FIRST reading Bri added to ANY class would have crashed that class.
     It only stayed hidden because W1's single reading happens to carry images
     and W4 has no readings at all.

     A reading with no images now renders as just its note, and the image grid
     is skipped entirely rather than rendered empty. */
  const images = Array.isArray(item.images) ? item.images : [];
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {item.note && <RichText text={item.note} style={{ fontSize: 14, color: C.sub, lineHeight: 1.55 }} />}
      {images.length > 0 && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        {images.map((img, i) => {
          const src = READING_IMAGES[img];
          return src ? (
            <img key={i} src={src} alt={`Leadership Principles — reading page ${i + 1}`}
              style={{ width: "100%", borderRadius: 10, border: `1px solid ${C.line}`,
                background: C.card, display: "block" , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }} />
          ) : (
            <div key={i} style={{ border: `1px dashed ${C.line}`, borderRadius: 10, background: C.paper,
              aspectRatio: "8.5 / 11", display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", color: C.sub, textAlign: "center", padding: 12, gap: 6 }}>
              <span style={{ fontSize: 22 }}>❑</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>Leadership Principles</span>
              <span style={{ fontSize: 11, color: C.sub }}>Reading page {i + 1} of {images.length}</span>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

// ── REFLECT (Q&A) ─────────────────────────────────────
function QaItem({ item, P }) {
  // Seeded from what they wrote last time. `saved` is the value we've persisted,
  // so re-opening the item shows their own answer rather than an empty box.
  const saved = P ? P.answerOf(item.id) : "";
  const [text, setText] = useState(saved);
  useEffect(() => { setText(saved); }, [saved]);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <RichText text={item.prompt} style={{ fontSize: 15, color: C.ink, lineHeight: 1.5 }} />
      <textarea value={text} onChange={(e) => setText(e.target.value)}
        onBlur={() => P && P.saveAnswer(item.id, text, item.title)}
        placeholder="Type your response…" rows={3}
        style={{ width: "100%", resize: "vertical", borderRadius: 10, border: `1px solid ${C.line}`,
          padding: "10px 12px", fontFamily: font.body, fontSize: 14, color: C.ink, background: C.paper }} />
      <div>
        <button style={btn(C.ink, "#fff")}>Save response</button>
        <span style={{ marginLeft: 10, fontSize: 12, color: C.sub, fontStyle: "italic" }}>
        </span>
      </div>
    </div>
  );
}

// ── MATCH ─────────────────────────────────────────────
/* ★ ONE SMALL PICTURE FOR A MATCHING PAIR (Bri, Aug 3 2026: "can I have the
   option to match images to the correct label? I don't want the images to be
   very large and take up too much space in the section").

   Height is CAPPED, not the width, so a tall portrait photo cannot push the
   row down the page — which is precisely what she asked not to happen. It sits
   beside the text rather than replacing it, so a pair can carry a picture, a
   caption, or both, and an image that fails to load leaves a readable row
   rather than an empty button nobody can match. */
function PairImage({ file }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    (async () => { const u = await openUpload(file); if (live && u) setUrl(u); })();
    return () => { live = false; };
  }, [file]);
  if (!file) return null;
  if (!url) return <span style={{ fontSize: 11.5, color: C.sub }}>🖼</span>;
  return (
    <img src={url} alt="" style={{ height: 52, maxWidth: 96, objectFit: "cover",
      borderRadius: 8, border: `1px solid ${C.line}`, display: "block", flexShrink: 0 }} />
  );
}

function MatchItem({ item, P, instructor }) {
  // ★ REBUILT Jul 25 to Bri's spec, after she tested it as a student:
  // "The matching game is not functioning properly. There are no options to
  // choose from… students should not have the answer key available… I want the
  // students to match the cards themselves with an immediate action of
  // 'correct' or 'try again' until all 22 matches are made. Can there be a word
  // bank with the answers for them to select from that eliminates as they go?
  // Once all 22 matches are made I would like the Teaching notes to become
  // visible for them to view — not before."
  //
  // ⚠️ IT WAS A PREVIEW, NOT AN ACTIVITY. Every definition showed a dead
  // "match…" placeholder and a **Show answer key** button any student could
  // press — the whole key, 22 answers, one tap away. That is the urgent half of
  // what she found.
  const [placed, setPlaced] = useState({});   // pairIndex → the answer they got right
  // ★ RESUMES WHERE THEY LEFT OFF (Bri: "It's a lengthy matching game so I don't
  // want their work to disappear."). The record loads a moment after mount, so
  // hydrate ONCE when it arrives — and only if they haven't already started in
  // this session, so a slow read can never wipe live work.
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !P || !P.ready) return;
    hydrated.current = true;
    const saved = P.matchOf(item.id);
    if (saved && Object.keys(saved).length && !Object.keys(placed).length) setPlaced(saved);
  }, [P && P.ready]);
  const [sel, setSel] = useState(null);       // word currently picked up from the bank
  const [wrongAt, setWrongAt] = useState(null);
  const [peek, setPeek] = useState(false);    // INSTRUCTOR-ONLY key
  const pairs = item.pairs || [];
  const doneCount = Object.keys(placed).length;
  const complete = pairs.length > 0 && doneCount === pairs.length;

  // Shuffled ONCE per mount. Re-shuffling on every render would move a word
  // under the student's finger as they reach for it.
  const bank = useMemo(() => {
    const all = pairs.map((p) => p.answer);
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all;
  }, [pairs.length]);

  // Remove exactly ONE instance per correct placement, so a repeated answer
  // (if a future set has one) doesn't vanish from the bank early.
  const remaining = useMemo(() => {
    const used = Object.values(placed);
    const pool = bank.slice();
    used.forEach((u) => { const i = pool.indexOf(u); if (i >= 0) pool.splice(i, 1); });
    return pool;
  }, [bank, placed]);

  // Completion is recorded by saveMatch itself, so there is no second writer
  // that could disagree with it about whether this activity is finished.

  const tryPlace = (i) => {
    if (!sel || placed[i]) return;
    if (sel === pairs[i].answer) {
      const next = { ...placed, [i]: sel };
      setPlaced(next);
      setSel(null);
      setWrongAt(null);
      // Saved on EVERY correct match, not at the end — the whole point is that
      // walking away mid-game costs nothing.
      if (P) P.saveMatch(item.id, next, item.title, Object.keys(next).length === pairs.length);
    } else {
      // "try again" — the word stays in hand so they can go again immediately.
      setWrongAt(i);
      setTimeout(() => setWrongAt((w) => (w === i ? null : w)), 900);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 14, color: C.sub }}>{item.instructions}</p>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: font.mono, fontSize: 12.5, fontWeight: 700, color: complete ? C.green : C.sub }}>
          {doneCount} / {pairs.length} matched
        </span>
        {sel && <span style={{ fontSize: 12.5, color: C.ink }}>Holding <b>{sel}</b> — tap its definition</span>}
        {complete && <span style={{ fontSize: 12.5, fontWeight: 700, color: C.green }}>All matched ✓</span>}
      </div>

      {/* THE WORD BANK. Words leave it as they're used. */}
      {!complete && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {remaining.map((w, i) => (
            <button key={w + i} onClick={() => setSel(sel === w ? null : w)}
              style={{ fontFamily: font.body, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                borderRadius: 20, padding: "5px 12px",
                border: `1px solid ${sel === w ? "#7D2AE8" : C.line}`,
                background: sel === w ? "#F1E8FD" : C.card,
                color: sel === w ? "#7D2AE8" : C.ink }}>
              {w}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {pairs.map((p, i) => {
          const got = placed[i];
          const isWrong = wrongAt === i;
          return (
            <button key={i} onClick={() => tryPlace(i)} disabled={!!got || !sel}
              style={{ all: "unset", display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center",
                gap: 12, padding: "9px 12px", borderRadius: 10, cursor: got || !sel ? "default" : "pointer",
                background: got ? "#ECFDF5" : isWrong ? "#FEF2F2" : C.card,
                border: `1px solid ${got ? "#A7F3D0" : isWrong ? "#FCA5A5" : C.line}` }}>
              <span style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.4, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: font.mono, color: C.sub }}>{i + 1}.</span>
                {p.img && <PairImage file={p.img} />}
                <span>{p.def}</span>
              </span>
              {got ? (
                <span style={{ fontFamily: font.mono, fontSize: 12.5, fontWeight: 700, color: "#047857",
                  background: "#D1FAE5", padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>✓ {got}</span>
              ) : isWrong ? (
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#B91C1C", whiteSpace: "nowrap" }}>Try again</span>
              ) : (
                <span style={{ width: 120, height: 30, borderRadius: 8, border: `1px dashed ${C.line}`,
                  background: C.paper, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, color: C.sub }}>match…</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ⚠️ INSTRUCTOR ONLY. A student can no longer reach the key at all. */}
      {instructor && (
        <div>
          <button onClick={() => setPeek((v) => !v)} style={btn("#7D2AE8", "#fff")}>
            {peek ? "Hide answer key" : "Show answer key"}
          </button>
          <span style={{ marginLeft: 10, fontSize: 12, color: C.sub, fontStyle: "italic" }}>
            (only you can see this)
          </span>
          {peek && (
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 2 }}>
              {pairs.map((p, i) => (
                <li key={i} style={{ fontSize: 12.5, color: C.sub }}>{i + 1}. {p.answer}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Teaching notes unlock on completion — Bri's rule, "not before". */}
      {item.keyPoints?.length > 0 && (complete || instructor ? (
        <details open={complete} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px" }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: C.ink }}>
            Teaching notes ({item.keyPoints.length})
          </summary>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 4 }}>
            {item.keyPoints.map((k, i) => <li key={i} style={{ fontSize: 13, color: C.sub, lineHeight: 1.45 }}>{k}</li>)}
          </ul>
        </details>
      ) : (
        <div style={{ fontSize: 12.5, color: C.sub, fontStyle: "italic" }}>
          Teaching notes unlock once all {pairs.length} are matched.
        </div>
      ))}
    </div>
  );
}

// ── QUIZ ──────────────────────────────────────────────
function QuizItem({ item, P }) {
  const [picked, setPicked] = useState({});
  const [graded, setGraded] = useState(false);
  // Recorded the moment it grades — the score AND, since Jul 27, what they
  // actually picked. Bri: "I still can't see the answers they've given for
  // quizzes." Nothing but the number was ever stored; `picked` lived here and
  // was thrown away on grade.
  // ⚠️ `responses` is read inside the callback, not named in the dep array —
  // it is computed further down and a dependency array is evaluated during
  // render, which is exactly the temporal-dead-zone crash that blanked this
  // class in July. The callback runs after render, so the binding is live.
  useEffect(() => {
    if (graded && P) P.saveQuiz(item.id, score, item.questions.length, item.title, responses);
  }, [graded]);
  // A question is either single-answer (`answer`) or select-all (`answers`).
  // Week 4 Quiz 1 Q5 is the only multi in either quiz, but the shape has to
  // support both or that question can never be answered correctly.
  const isMulti = (q) => Array.isArray(q.answers);
  const pickedSet = (qi) => (picked[qi] instanceof Set ? picked[qi] : new Set());
  /* ⚠️ SAME GUARD AS THE TWO READS BELOW, WHICH ALREADY HAVE IT. These two ran
     bare while lines 393 and 416 guarded the identical field, and both of these
     run during render — so a quiz item with no `questions` array would blank the
     whole class, exactly the way the missing `images` guard did. Safe only
     because the editor cannot add a quiz today; that is a UI accident, not a
     guarantee about the data. */
  const questionList = Array.isArray(item.questions) ? item.questions : [];
  const answeredCount = questionList.reduce((n, q, i) => {
    const v = picked[i];
    return n + (isMulti(q) ? (v instanceof Set && v.size > 0 ? 1 : 0) : (v != null ? 1 : 0));
  }, 0);
  const score = useMemo(
    () => questionList.reduce((n, q, i) => {
      if (!isMulti(q)) return n + (picked[i] === q.answer ? 1 : 0);
      const got = picked[i] instanceof Set ? [...picked[i]].sort() : [];
      const want = [...q.answers].sort();
      // select-all is right only when the sets match exactly — no part credit
      return n + (got.length === want.length && got.every((v, k) => v === want[k]) ? 1 : 0);
    }, 0),
    [picked, item.questions]
  );
  /* ★ QUESTION TEXT AND OPTION TEXT, NEVER INDICES.
     An index is only meaningful against the exact content that produced it, and
     Bri edits this content. A stored `2` that quietly starts pointing at a
     different choice after a reorder is a wrong answer on someone's record with
     nothing on screen to say so. Storing the words makes the record
     self-describing and permanently readable — same reasoning as the item
     titles saved with progress, and the question snapshot on recommendations.
     An unanswered question stores an empty `chose`, so "skipped" and "wrong"
     stay distinguishable. */
  const responses = useMemo(
    () => (Array.isArray(item.questions) ? item.questions : []).map((q, i) => {
      const multi = isMulti(q);
      const chosenIdx = multi
        ? [...(picked[i] instanceof Set ? picked[i] : [])].sort((a, b) => a - b)
        : (picked[i] == null ? [] : [picked[i]]);
      const rightIdx = multi
        ? [...(Array.isArray(q.answers) ? q.answers : [])].sort((a, b) => a - b)
        : (q.answer == null ? [] : [q.answer]);
      const textOf = (ci) => String((Array.isArray(q.choices) ? q.choices : [])[ci] ?? "");
      return {
        q: String(q.q || ""),
        chose: chosenIdx.map(textOf),
        correct: rightIdx.map(textOf),
        right: chosenIdx.length === rightIdx.length && chosenIdx.every((v, k) => v === rightIdx[k]),
      };
    }),
    [picked, item.questions]
  );
  const letters = ["a", "b", "c", "d"];
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Not reachable from the editor today (quizzes aren't addable there),
          but a quiz with no questions must not take the class down with it. */}
      {(Array.isArray(item.questions) ? item.questions : []).map((q, qi) => (
        <div key={qi} style={{ display: "grid", gap: 8 }}>
          <p style={{ margin: 0, fontSize: 14.5, color: C.ink, fontWeight: 600, lineHeight: 1.45 }}>
            <span style={{ fontFamily: font.mono, color: C.sub, marginRight: 8 }}>{qi + 1}</span>
            {q.q}{q.needsText && <span style={{ color: C.amber, fontWeight: 600 }}> (question text pending)</span>}
            {isMulti(q) && <span style={{ color: C.sub, fontWeight: 600, fontSize: 12.5 }}> (choose all that apply)</span>}
          </p>
          <div style={{ display: "grid", gap: 6 }}>
            {q.choices.map((c, ci) => {
              const multi = isMulti(q);
              const chosen = multi ? pickedSet(qi).has(ci) : picked[qi] === ci;
              const isRight = multi ? q.answers.includes(ci) : ci === q.answer;
              const correct = graded && isRight;
              const wrongPick = graded && chosen && !isRight;
              let bg = C.card, bd = C.line, fg = C.ink;
              if (correct) { bg = C.greenSoft; bd = C.green; fg = C.green; }
              else if (wrongPick) { bg = C.redSoft; bd = C.red; fg = C.red; }
              else if (chosen) { bd = C.ink; }
              return (
                <button key={ci} onClick={() => {
                    if (graded) return;
                    setPicked((p) => {
                      if (!multi) return { ...p, [qi]: ci };
                      const cur = new Set(p[qi] instanceof Set ? p[qi] : []);
                      cur.has(ci) ? cur.delete(ci) : cur.add(ci);
                      return { ...p, [qi]: cur };
                    });
                  }}
                  style={{ textAlign: "left", cursor: graded ? "default" : "pointer",
                    display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 12px",
                    borderRadius: 9, border: `1.5px solid ${bd}`, background: bg, color: fg,
                    fontFamily: font.body, fontSize: 13.5 }}>
                  <span style={{ fontFamily: font.mono, fontWeight: 700, opacity: 0.7 }}>{letters[ci]}</span>
                  <span>{c}</span>
                  {correct && <span style={{ marginLeft: "auto" }}>✓</span>}
                  {wrongPick && <span style={{ marginLeft: "auto" }}>✕</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {!graded ? (
          <button onClick={() => setGraded(true)}
            disabled={answeredCount < item.questions.length}
            style={{ ...btn(C.green, "#fff"),
              opacity: answeredCount < item.questions.length ? 0.5 : 1 }}>
            Submit quiz
          </button>
        ) : (
          <>
            <span style={{ fontFamily: font.mono, fontSize: 15, fontWeight: 700,
              color: score === item.questions.length ? C.green : C.ink }}>
              {score} / {item.questions.length} correct
            </span>
            <button onClick={() => { setGraded(false); setPicked({}); }} style={btn(C.paper, C.ink, C.line)}>
              Try again
            </button>
          </>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: C.sub, fontStyle: "italic" }}>
      </p>
    </div>
  );
}

// ── ASSIGNMENT ────────────────────────────────────────
function AssignItem({ item, P }) {
  // "Turn in" used to be a button that did nothing at all.
  const [text, setText] = useState(P ? P.answerOf(item.id) : "");
  const saved = P ? P.answerOf(item.id) : "";
  useEffect(() => { setText(saved); }, [saved]);
  const turnIn = () => { if (P && text.trim()) P.saveAnswer(item.id, text, item.title); };
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* ⚠️ Same guard, same reason. An assignment created in the editor has a
          `brief` and NO `parts` array — "+ Split into parts" adds one — so an
          unguarded read here crashes any assignment Bri adds herself. The brief
          renders below when there are no parts, so nothing is lost either way. */}
      {(Array.isArray(item.parts) ? item.parts : []).map((p, i) => (
        <div key={i} style={{ display: "grid", gap: 6 }}>
          <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 14.5, color: C.ink }}>{p.label}</div>
          <p style={{ margin: 0, fontSize: 14, color: C.ink, lineHeight: 1.5 }}>{p.body}</p>
          {p.scenarios?.map((s, si) => (
            <p key={si} style={{ margin: 0, fontSize: 13.5, color: C.sub, lineHeight: 1.5,
              paddingLeft: 12, borderLeft: `3px solid ${C.line}`, borderTop: `3px solid ${C.line}` }}>{s}</p>
          ))}
        </div>
      ))}
      {!Array.isArray(item.parts) && item.brief && (
        <RichText text={item.brief} style={{ fontSize: 14, color: C.ink, lineHeight: 1.55 }} />
      )}
      <textarea placeholder="Write your response…" rows={4} value={text}
        onChange={(e) => setText(e.target.value)} onBlur={turnIn}
        style={{ width: "100%", resize: "vertical", borderRadius: 10, border: `1px solid ${C.line}`,
          padding: "10px 12px", fontFamily: font.body, fontSize: 14, color: C.ink, background: C.paper }} />
      <div>
        <button style={btn(C.ink, "#fff")} onClick={turnIn}>Turn in</button>
        <span style={{ marginLeft: 10, fontSize: 12, color: C.sub, fontStyle: "italic" }}>
          (saved to your record when you turn it in)
        </span>
      </div>
    </div>
  );
}

// ── UPLOAD ────────────────────────────────────────────
// Bri: "I would like this submission to be an upload option for a PDF or Word
// doc." So no textarea — the deliverable is a file, and accepting typed text
// here would let someone submit the wrong thing.
function UploadItem({ item, P }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const turnedIn = P ? P.uploadsOf(item.id) : [];

  /* 🐛 FIXED Jul 27 2026 — THIS BUTTON HAD NO onClick AT ALL.
     A student could choose a file, tap "Turn in", and nothing whatsoever
     happened — while the caption underneath told them it had been saved to
     their record. `P.saveUpload` existed in L101Progress the whole time and was
     never called from here.

     ⚠️ IT WAS NOT COSMETIC. The W5 assignment (`w4-assign-w5`) is the LAST item
     in Week 4, and a week's Submit button only appears once every item is done.
     So nobody could complete Week 4 — the final class — and Bri's roster could
     never show a turned-in assignment. The sequential lock made it a dead end
     rather than a missing feature.

     ⚠️ NO VIEW LINK HERE ON PURPOSE. `openUpload` mints a raw Supabase signed
     URL, and the standing rule is that every link stays on gatecityhub.com.
     A student sees their own file's name and when it landed; wiring a viewer
     needs the worker proxy route, which is its own job. */
  const turnIn = async () => {
    if (!P || !file || busy) return;
    setBusy(true); setErr("");
    try {
      await P.saveUpload(item.id, file, item.title);
      setFile(null);
    } catch {
      // The record is only written after the upload succeeds, so a failure here
      // leaves nothing half-saved — say so plainly and let them retry.
      setErr("That didn't upload. Check your connection and try again.");
    }
    setBusy(false);
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* 🐛 THE EDIT THAT WENT NOWHERE (Bri, Jul 28 2026: "I am attempting to
          edit the W3 assignment in the W2 class, but I don't see the edits
          reflected… within the editing space it's shown as upload, but I don't
          see my edits showing once saved.").
          She was right, and it saved fine. The editor writes an upload item's
          body to `brief` (BODY_FIELD.upload = "brief" in L101Editor.jsx) while
          this line only ever read `prompt` — so her text was stored correctly
          and displayed nowhere.
          ⚠️ `brief` FIRST, `prompt` AS THE FALLBACK. Every upload item written
          before today carries `prompt`; reading only `brief` would blank all of
          them. Do not "tidy" this to one field without migrating the seeds. */}
      <RichText text={item.brief || item.prompt} style={{ fontSize: 14, color: C.ink, lineHeight: 1.55 }} />

      {/* 🐛 THE SPLIT THAT WENT NOWHERE. L101Editor offers "+ Split into parts"
          for `assign` AND `upload` items, and renders the whole part/scenario
          editor for either. Only AssignItem ever read `item.parts`, so an author
          splitting an upload saved the parts successfully and the student screen
          showed nothing at all. Same shape as the `brief` vs `prompt` bug right
          above: stored correctly, displayed nowhere.
          ⚠️ Array.isArray guard, not `item.parts?.map`. An upload item made in
          the editor has no `parts` key until the split is used, and this file
          has already crashed a whole class once on an unguarded read of an
          authored array. */}
      {(Array.isArray(item.parts) ? item.parts : []).map((p, i) => (
        <div key={i} style={{ display: "grid", gap: 6 }}>
          <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 14.5, color: C.ink }}>{p.label}</div>
          <p style={{ margin: 0, fontSize: 14, color: C.ink, lineHeight: 1.5 }}>{p.body}</p>
          {(Array.isArray(p.scenarios) ? p.scenarios : []).map((s, si) => (
            <p key={si} style={{ margin: 0, fontSize: 13.5, color: C.sub, lineHeight: 1.5,
              paddingLeft: 12, borderLeft: `3px solid ${C.line}`, borderTop: `3px solid ${C.line}` }}>{s}</p>
          ))}
        </div>
      ))}

      {item.requirement && (
        <div style={{ fontSize: 13, color: C.amber, fontWeight: 600, background: C.amberSoft,
          borderRadius: 8, padding: "7px 11px", display: "inline-block", justifySelf: "start" }}>
          {item.requirement}
        </div>
      )}

      {turnedIn.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {turnedIn.map((f, i) => (
            <div key={i} style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>
              ✓ Turned in — {f.name}
              <span style={{ color: C.sub, fontWeight: 400 }}>
                {f.at ? ` · ${new Date(f.at).toLocaleDateString()}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      <label style={{ display: "grid", gap: 8, justifyItems: "start" }}>
        <span style={{ ...btn(C.ink, "#fff"), cursor: "pointer" }}>
          {file ? "Choose a different file" : turnedIn.length ? "Turn in another file" : "Choose a file"}
        </span>
        <input type="file" accept={item.accept || ".pdf,.doc,.docx"} style={{ display: "none" }}
          onChange={(e) => { const f = (e.target.files && e.target.files[0]) || null; setFile(f); setErr(""); }} />
        <span style={{ fontSize: 12.5, color: C.sub }}>
          {file ? `📄 ${file.name}` : "PDF or Word document"}
        </span>
      </label>

      {err && <div style={{ fontSize: 13, color: C.red, fontWeight: 600 }}>{err}</div>}

      <div>
        <button onClick={turnIn} disabled={!file || busy}
          style={{ ...btn(C.green, "#fff"), opacity: file && !busy ? 1 : 0.5 }}>
          {busy ? "Turning in…" : "Turn in"}
        </button>
        <span style={{ marginLeft: 10, fontSize: 12, color: C.sub, fontStyle: "italic" }}>
          (saved to your record when you turn it in)
        </span>
      </div>
    </div>
  );
}

// ── WALKTHROUGH ───────────────────────────────────────
/* ★ BUILT FOR BRI'S MOCK INSPECTION (Jul 31 2026), to her spec: "something like
   a table with three sections — Area, Observations, Concerns — with note taking
   space under observations and concerns. Areas will be separated by BOH and
   FOH." Each row gets its own Observations and Concerns boxes; a group can
   carry a callout that renders before it (her "Wash hands before moving to the
   FOH!"), and `outro` is the discussion question at the end.

   ⚠️ EVERY BOX IS ITS OWN ANSWER, keyed `${item.id}:${row.id}:obs|con` and
   saved with a readable title ("Back Door — Observations") — so Bri's
   per-student review lists each box on its own line instead of one blob, and a
   half-finished walk keeps what was written. Row ids are therefore PERMANENT
   once anyone has written in a box, same rule as item ids. Renaming a row's
   label is safe; the title stored with each answer keeps the name it was
   written under.

   ⚠️ COMPLETION IS THE DoneToggle, deliberately. `saveAnswer` marks composite
   ids done, never the bare item id, so ticking happens when the student says
   the walk is finished — not when they touch their first box.

   ⚠️ `areas`/`rows` READ GUARDED. The editor seeds a full structure, but a
   malformed item must render empty rather than crash the class — an unguarded
   authored array has blanked a whole class here before (see ReadItem). */
function WalkBox({ id, title, P, label, rows = 2, placeholder }) {
  const saved = P ? P.answerOf(id) : "";
  const [text, setText] = useState(saved);
  useEffect(() => { setText(saved); }, [saved]);
  return (
    <label style={{ display: "grid", gap: 4 }}>
      {label && <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em",
        textTransform: "uppercase", color: C.sub }}>{label}</span>}
      <textarea value={text} onChange={(e) => setText(e.target.value)}
        onBlur={() => P && P.saveAnswer(id, text, title)}
        placeholder={placeholder || "Type your notes…"} rows={rows}
        style={{ width: "100%", resize: "vertical", borderRadius: 8, border: `1px solid ${C.line}`,
          padding: "8px 10px", fontFamily: font.body, fontSize: 13.5, color: C.ink, background: C.paper }} />
    </label>
  );
}

function WalkRow({ item, row, P }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, background: C.card,
      padding: "10px 12px", display: "grid", gap: 8 , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
        {row.label}
        {row.detail && <span style={{ fontWeight: 400, color: C.sub }}> — {row.detail}</span>}
      </div>
      <WalkBox id={`${item.id}:${row.id}:obs`} title={`${row.label} — Observations`} P={P}
        label="Observations" placeholder="What did you see?" />
      <WalkBox id={`${item.id}:${row.id}:con`} title={`${row.label} — Concerns`} P={P}
        label="Concerns" placeholder="Anything that needs action?" />
    </div>
  );
}

function WalkItem({ item, P }) {
  const areas = Array.isArray(item.areas) ? item.areas : [];
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {item.intro && <RichText text={item.intro} style={{ fontSize: 14, color: C.ink, lineHeight: 1.55 }} />}
      {areas.map((area) => (
        <div key={area.id} style={{ display: "grid", gap: 8 }}>
          {/* The callout sits ABOVE its group's heading — Bri put "Wash hands
              before moving to the FOH!" between the sections, not inside one. */}
          {area.note && (
            <div style={{ fontSize: 13, color: C.amber, fontWeight: 700, background: C.amberSoft,
              borderRadius: 8, padding: "7px 11px" }}>{area.note}</div>
          )}
          <div style={{ fontFamily: font.display, fontWeight: 800, fontSize: 12.5, letterSpacing: 1,
            textTransform: "uppercase", color: C.sub }}>Area: {area.label}</div>
          {(Array.isArray(area.rows) ? area.rows : []).map((row) => (
            <WalkRow key={row.id} item={item} row={row} P={P} />
          ))}
        </div>
      ))}
      {item.outro && (
        <div style={{ display: "grid", gap: 8, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>{item.outro}</div>
          <WalkBox id={`${item.id}:discuss`} title={`${item.title} — discussion`} P={P} rows={3}
            placeholder="Your notes for the group discussion…" />
        </div>
      )}
    </div>
  );
}

// ── INSTRUCTOR NOTES ON AN ITEM (Bri's per-class instructor system) ────
/* "a section with EACH activity called 'instructor notes' that are only
   visible to me or whomever I assign as an instructor." Rendered inside the
   open item, below the student content, in its own amber frame so it can
   never be mistaken for class material. Bri (and course admins) edit in
   place; an assigned instructor sees it read-only. */
function InstructorNoteBlock({ note, mayEdit, onSave }) {
  const saved = (note && note.text) || "";
  const [text, setText] = useState(saved);
  const [state, setState] = useState("");   // "" | "saving" | "saved" | "failed"
  useEffect(() => { setText(saved); }, [saved]);
  const doSave = async () => {
    setState("saving");
    const ok = await onSave(text);
    setState(ok ? "saved" : "failed");
    setTimeout(() => setState(""), 2500);
  };
  return (
    <div style={{ background: "#FDF6E7", border: "1px solid #EAD9A8", borderRadius: 10, padding: "10px 12px", display: "grid", gap: 8 }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "#8A6A1F" }}>
        Instructor notes · only instructors see this
      </div>
      {mayEdit ? (
        <>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
            placeholder="Teaching notes for whoever delivers this activity…"
            style={{ width: "100%", resize: "vertical", borderRadius: 8, border: "1px solid #EAD9A8",
              padding: "8px 10px", fontFamily: font.body, fontSize: 13.5, color: C.ink, background: "#fff" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={doSave} disabled={state === "saving"} style={btn("#8A6A1F", "#fff")}>
              {state === "saving" ? "Saving…" : "Save note"}
            </button>
            {state === "saved" && <span style={{ fontSize: 12.5, fontWeight: 700, color: C.green }}>Saved ✓</span>}
            {state === "failed" && <span style={{ fontSize: 12.5, fontWeight: 700, color: C.red }}>Not saved — try again</span>}
            {note && note.by && <span style={{ fontSize: 11.5, color: C.sub, marginLeft: "auto" }}>last saved by {note.by}</span>}
          </div>
        </>
      ) : saved ? (
        <RichText text={saved} style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5 }} />
      ) : null}
    </div>
  );
}

function ItemBody({ item, P, instructor }) {
  switch (item.type) {
    case "watch": return <WatchItem item={item} />;
    case "read": return <ReadItem item={item} />;
    case "qa": return <QaItem item={item} P={P} />;
    case "match": return <MatchItem item={item} P={P} instructor={instructor} />;
    case "quiz": return <QuizItem item={item} P={P} />;
    case "assign": return <AssignItem item={item} P={P} />;
    case "upload": return <UploadItem item={item} P={P} />;
    case "walk": return <WalkItem item={item} P={P} />;
    default: return null;
  }
}

function btn(bg, fg, border) {
  return { all: "unset", cursor: "pointer", fontFamily: font.body, fontSize: 13, fontWeight: 600,
    color: fg, background: bg, padding: "8px 14px", borderRadius: 9,
    border: border ? `1px solid ${border}` : "1px solid transparent", display: "inline-block" };
}

// ── ITEM ROW (collapsible) ────────────────────────────
/* ★ LIGHT FORMATTING FOR CLASS TEXT (Bri, Jul 28 2026: "there are things that
   need line spacing, bulleting, and emphasis with bold/underline").
   ⚠️ DELIBERATELY NOT A RICH-TEXT EDITOR. She types plain text; this renders it.
   A WYSIWYG would mean storing HTML in the content store and then sanitising it
   before display — a much larger surface, and one where a mistake puts arbitrary
   markup on a student's screen. Four marks cover everything she asked for:

     blank line  → a paragraph break
     - or •      → a bullet
     **bold**    → bold
     __under__   → underlined

   ⚠️ TEXT NODES ONLY — every span below carries the author's characters as a
   React child, never `dangerouslySetInnerHTML`. Nothing here can inject markup,
   which is why it is safe for content that students load.
   ⚠️ EXISTING CONTENT IS UNAFFECTED: text with none of these marks renders
   exactly as it did, because a paragraph with no matches is just a paragraph. */
function inlineMarks(text, keyBase) {
  const out = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] != null) out.push(<strong key={`${keyBase}-b${i}`}>{m[2]}</strong>);
    else out.push(<span key={`${keyBase}-u${i}`} style={{ textDecoration: "underline" }}>{m[3]}</span>);
    last = m.index + m[0].length; i += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : [text];
}

function RichText({ text, style }) {
  const raw = String(text == null ? "" : text);
  if (!raw) return null;
  const blocks = raw.split(/\n\s*\n/);
  return (
    <div style={style}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const bullets = lines.filter((l) => /^\s*[-•]\s+/.test(l));
        // A block counts as a list only if EVERY non-empty line is a bullet —
        // otherwise a stray dash mid-paragraph would silently become a list.
        const nonEmpty = lines.filter((l) => l.trim());
        if (nonEmpty.length && bullets.length === nonEmpty.length) {
          return (
            <ul key={bi} style={{ margin: bi ? "8px 0 0" : 0, paddingLeft: 20 }}>
              {nonEmpty.map((l, li) => (
                <li key={li} style={{ marginBottom: 3 }}>{inlineMarks(l.replace(/^\s*[-•]\s+/, ""), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi} style={{ margin: bi ? "8px 0 0" : 0 }}>
            {lines.map((l, li) => (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                {inlineMarks(l, `${bi}-${li}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/* ★ AUTHOR-ATTACHED IMAGES, ON ANY ITEM TYPE — Bri's "images inside class
   sections". These are `imageFiles` records the editor attaches ({bucket,
   path, name}); the two legacy W1 reading images stay on the hardcoded map
   above. Resolved to short-lived signed URLs on open, one fetch per image —
   an item is open in front of one student at a time, so this stays cheap.
   A file that fails to resolve renders its name as a line, not a broken
   image: "missing" must never look like "there was nothing here". */
/* ★ SMALL BY DEFAULT, TAP TO ENLARGE (Bri, Aug 3 2026: "Can the images
   uploaded into the class modules have the size reduced? They are very large
   and fill a lot of the screen. These are to reference, but do not need to be
   oversized, just visible. Maybe we can make all of those images smaller with
   the option to enlarge if needed?").

   Height is capped rather than width, the same rule as the matching-pair
   pictures: cap the width and a tall portrait screenshot still swallows the
   screen, which is the exact complaint.

   ⚠️ ENLARGING HAPPENS INLINE, NOT IN A NEW TAB, and that is deliberate.
   openUpload mints a raw provider signed URL — a bearer token for that file —
   so handing it to window.open would put a *.supabase.co address in the
   history of a shared iPad. The note further down this file says so already.
   Toggling the same <img> keeps the URL inside the page. */
function ItemImages({ files }) {
  const [urls, setUrls] = useState({});
  const [big, setBig] = useState({});
  useEffect(() => {
    let live = true;
    (files || []).forEach(async (f, i) => {
      const u = await openUpload(f);
      if (live && u) setUrls((p) => ({ ...p, [i]: u }));
    });
    return () => { live = false; };
  }, [files]);
  if (!files || !files.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "4px 0 12px" }}>
      {files.map((f, i) => urls[i] ? (
        <button key={i} type="button" onClick={() => setBig((b) => ({ ...b, [i]: !b[i] }))}
          title={big[i] ? "Tap to shrink" : "Tap to enlarge"}
          style={{ all: "unset", cursor: "zoom-in", display: "block", width: big[i] ? "100%" : "auto" }}>
          <img src={urls[i]} alt={f.name || "class image"}
            style={{ display: "block", borderRadius: 12, border: `1px solid ${C.line}`,
              maxWidth: "100%", ...(big[i] ? {} : { maxHeight: 190, width: "auto" }) }} />
          <span style={{ fontSize: 11, color: C.sub }}>{big[i] ? "Tap to shrink" : "Tap to enlarge"}</span>
        </button>
      ) : (
        <div key={i} style={{ fontSize: 12.5, color: C.sub }}>🖼 {f.name || "image"} — loading…</div>
      ))}
    </div>
  );
}

function Item({ item, index, open, onToggle, P, instructor, unlocked = true,
  inote, showNotes = false, canEditNotes = false, onSaveNote }) {
  return (
    <div style={{ borderTop: `1px solid ${C.line}` }}>
      {/* A locked row is dimmed AND unclickable. Dimming alone would still let
          someone tap straight past the lock. */}
      <button onClick={unlocked ? onToggle : undefined} aria-expanded={open} disabled={!unlocked}
        style={{ all: "unset", cursor: unlocked ? "pointer" : "default", display: "flex", alignItems: "center", gap: 12,
          width: "100%", boxSizing: "border-box", padding: "13px 4px", opacity: unlocked ? 1 : 0.45 }}>
        <span style={{ fontFamily: font.mono, fontSize: 12, color: C.sub, width: 20, textAlign: "right" }}>{index}</span>
        <Chip type={item.type} />
        <span style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, flex: 1 }}>{item.title}</span>
        {P && P.isDone(item.id) && <span style={{ color: "#0F766E", fontWeight: 800, fontSize: 13 }}>✓</span>}
        {!unlocked && <span style={{ fontSize: 11.5, color: C.sub }}>🔒 finish the one above</span>}
        {item.timeLabel && <span style={{ fontSize: 11.5, color: C.sub, fontFamily: font.mono }}>{item.timeLabel}</span>}
        <span style={{ color: C.sub, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>
      </button>
      {open && unlocked && (
        <div style={{ padding: "2px 4px 18px 52px" }}>
          <ItemImages files={item.imageFiles} />
          <ItemBody item={item} P={P} instructor={instructor} />
          {/* An assigned instructor with nothing written sees nothing here —
              an empty amber frame would read as "a note failed to load". */}
          {showNotes && (canEditNotes || (inote && inote.text)) && (
            <div style={{ marginTop: 12 }}>
              <InstructorNoteBlock note={inote} mayEdit={canEditNotes}
                onSave={(t) => onSaveNote ? onSaveNote(item.id, t) : false} />
            </div>
          )}
          {/* Quizzes and Q&A mark themselves — offering a second control would
              let the two disagree about whether something is finished. */}
          {P && P.person && item.type !== "quiz" && item.type !== "qa" && (
            <div style={{ marginTop: 12 }}>
              <DoneToggle done={P.isDone(item.id)} onChange={(v) => P.markDone(item.id, v, item.title)} C={C} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* The class opens on its first item. ⚠️ A SECTION IS ALLOWED TO BE EMPTY —
   the editor's "+ Add a section" creates one with `items: []`, and deleting or
   moving out the last item empties an existing one — so this scans past the
   empties instead of reading `sections[0].items[0]`, which threw during first
   render and blanked the whole class for every student. "" when there are no
   items anywhere; no item id matches it, so nothing opens. */
function firstItemId(course) {
  for (const sec of (course && course.sections) || []) {
    const items = sec.items || [];
    if (items.length) return items[0].id;
  }
  return "";
}

// ── MAIN ──────────────────────────────────────────────
export default function L101Week({ weekId, weekLabel, seed, sequential = true, instructors = null }) {
  /* ★ THE LOCK IS A SETTING, NOT A RULE. Bri, Jul 27, on how Trainer
     Orientation actually runs: "sometimes tasks first, info last." L101 locks
     each item until the one before it is done, which is right for a course
     someone works through alone — and wrong for a session an instructor
     delivers in whatever order suits the room. Defaults to true, so L101 and
     every existing caller behave exactly as before. */
  const SEED = seed;
  const enSeed = seed;
  // Content is EDITABLE now (Bri asked three times). The object above is the
  // SEED — it renders until somebody saves an edit, after which the stored
  // version wins for this week. See L101Editor.jsx for the full tradeoff.
  const { course: wk, stored, loadFailed: courseLoadFailed, save, revert } = useEditableCourse(weekId, enSeed);

  /* ── SPANISH ──────────────────────────────────────────────────────────
     Bri asked for a living toggle, not a second stored copy. The English is
     the only source; the Worker caches the translation against a hash of
     that English, so an unchanged class is free and an edited one pays for
     one translation on its next open.

     ⚠️ THE ENGLISH IS WHAT IS EDITED AND SAVED, ALWAYS.  stays English
     and every Save, Revert and editor control still writes it. Only what is
     RENDERED swaps. If Spanish were editable there would be two masters and
     the class would eventually disagree with itself in two languages. */
  const [lang, setLang] = useState('en');
  const [esCourse, setEsCourse] = useState(null);
  const [esState, setEsState] = useState('');   // '' | 'loading' | 'failed'

  useEffect(() => {
    if (lang !== 'es' || !wk) return undefined;
    let alive = true;
    setEsCourse(null); setEsState('loading');
    (async () => {
      try {
        const texts = collectStrings(wk);
        const r = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hub-token': hubToken() },
          body: JSON.stringify({ lang: 'es', texts }),
        });
        const d = await r.json().catch(() => null);
        if (!alive) return;
        if (!r.ok || !d || d.ok !== true) { setEsState('failed'); return; }
        /* applyStrings returns null on any count mismatch. Rendering a
           shifted class would put every sentence under the wrong heading and
           still look finished to anyone who does not read Spanish. */
        const built = applyStrings(wk, d.texts);
        if (!built) { setEsState('failed'); return; }
        setEsCourse(built); setEsState('');
      } catch { if (alive) setEsState('failed'); }
    })();
    return () => { alive = false; };
  }, [lang, wk]);

  const shown = lang === 'es' && esCourse ? esCourse : wk;
  const [editing, setEditing] = useState(false);
  const P = useProgress();
  // Read once at render, not held in state: a role change shouldn't need a reload.
  const isInstructor = canEditCourse();
  /* ★ PREVIEW — SEE THE CLASS AS A STUDENT SEES IT (Bri, Jul 28 2026: "I don't
     really know what a student is seeing without asking, and I'd like to see for
     myself if there are any gaps").
     ⚠️ IT WORKS BY TURNING OFF `mayEdit`, NOT BY DUPLICATING THE PAGE. Every
     instructor affordance on this screen already reads that one flag — the Edit
     button, the sequential-lock bypass, and `instructor` on every Item. A
     separate "student view" component would be a second copy of the page that
     drifts from the real one, and a preview that lies is worse than no preview.
     ⚠️ HER PROGRESS IS STILL HER OWN. Preview changes what is SHOWN, not whose
     record is written — if she ticks something while previewing it saves against
     her own progress, exactly as it would otherwise. Said plainly on the ribbon
     so she isn't surprised by her own name appearing in Class Progress. */
  const [preview, setPreview] = useState(false);
  /* ★ INSTRUCTOR VIEW (Bri, Jul 31: "May I have an 'Instructor View' like the
     student view so that I can see how my instructor notes are coming through,
     but also if I want to teach the class myself I can utilize that view
     without needing to assign it to myself.") Admin-only toggle that renders
     the class EXACTLY as an assigned instructor gets it: everything unlocked,
     notes visible but read-only, the notes-to-Bri space and Class Complete at
     the bottom — and no Edit button, which is the point. Mutually exclusive
     with student preview; each button clears the other. */
  const [instructorView, setInstructorView] = useState(false);
  const mayEdit = isInstructor && !preview && !instructorView;
  const [openId, setOpenId] = useState(firstItemId(wk));
  const totalItems = wk.sections.reduce((n, s) => n + (s.items || []).length, 0);

  /* ═══ BRI'S PER-CLASS INSTRUCTORS (Jul 31 2026) — see l101Instructors.js for
     her verbatim spec and the storage. Only the weeks in INSTRUCTOR_WEEKS
     (W2/W3, her in-person classes) carry any of this.
     ⚠️ ASSIGNMENT IS NOT EDITING. An assigned instructor gets the full module
     (no sequential lock), the match answer key, instructor notes, and the
     notes-to-Bri space — and never the Edit button, which stays on
     canEditCourse. That split is her explicit ruling (she had Daisy and
     Brandon REMOVED from the editor gates); do not merge the two. */
  const me = P.person;
  /* ⚠️ THE CALLER DECIDES, BECAUSE ONLY IT KNOWS WHICH COURSE THIS IS. A
     copied week's id (`wkmso0kydv6o9`) is minted the same way in both programs,
     so this file cannot tell the template's from the live class's. `instructors`
     is that answer, passed down. `null` means nobody told us, and then the old
     four-id set applies exactly as before — so every caller that has not been
     updated behaves identically. */
  const featured = instructors == null ? INSTRUCTOR_WEEKS.has(weekId) : !!instructors;
  const [assignMap, setAssignMap] = useState(null);       // null = still loading
  const [assignFailed, setAssignFailed] = useState(false);
  const [eligible, setEligible] = useState(null);         // dropdown roster
  const [inotes, setInotes] = useState({});
  const [inotesFailed, setInotesFailed] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackState, setFeedbackState] = useState(""); // "" | "saved" | "failed"
  const [feedbackFailed, setFeedbackFailed] = useState(false); // read failed → writes refuse
  const [completeState, setCompleteState] = useState("");  // "" | "busy" | "done" | "failed"

  useEffect(() => {
    if (!featured) return;
    let live = true;
    (async () => {
      const r = await loadAssignments();
      if (live) { setAssignMap(r.map); setAssignFailed(!r.ok); }
    })();
    return () => { live = false; };
  }, [weekId, featured]);

  const assigned = featured && !assignFailed && !!assignMap && isAssigned(assignMap, weekId, me);
  /* Instructor VIEW: course admins, admins in the Instructor View toggle, and
     assigned instructors. Drives unlocking and visibility only — never
     editing. Preview strips ALL sources, so "Preview as student" keeps its
     promise even for an admin who is also an assigned instructor. */
  const iView = mayEdit || (isInstructor && instructorView && !preview) || (assigned && !preview);

  useEffect(() => {
    if (!featured || !iView) return;
    let live = true;
    (async () => {
      const r = await kvGetResult(inotesKey(weekId));
      if (!live) return;
      if (r.ok) {
        setInotesFailed(false);
        setInotes(r.value && typeof r.value === "object" && !Array.isArray(r.value) ? r.value : {});
      } else setInotesFailed(true);
    })();
    return () => { live = false; };
  }, [weekId, featured, iView]);

  useEffect(() => {
    if (!featured || !me || !(assigned || mayEdit)) return;
    let live = true;
    (async () => {
      const r = await kvGetResult(ifeedbackKey(weekId));
      if (!live) return;
      if (!r.ok) { setFeedbackFailed(true); return; }
      setFeedbackFailed(false);
      const rec = r.value && typeof r.value === "object" ? r.value : {};
      const mine = rec[normPid(me.id)];
      if (mine && mine.text) setFeedback(mine.text);
    })();
    return () => { live = false; };
  }, [weekId, featured, assigned, mayEdit]); // eslint-disable-line

  useEffect(() => {
    if (!featured || !mayEdit || eligible !== null) return;
    let live = true;
    (async () => {
      const list = await loadEligibleInstructors().catch(() => []);
      if (live) setEligible(list);
    })();
    return () => { live = false; };
  }, [featured, mayEdit, eligible]);

  /* Read-merge-write on the ONE shared assignment map, refusing after a failed
     read — rebuilding it from {} would silently unassign every other class. */
  const saveAssignList = async (nextList) => {
    const r = await kvGetResult(ASSIGN_KEY);
    if (!r.ok) { setAssignFailed(true); return; }
    const cur = r.value && typeof r.value === "object" && !Array.isArray(r.value) ? r.value : {};
    const next = { ...cur, [weekId]: nextList };
    if (await kvSet(ASSIGN_KEY, next)) setAssignMap(next);
  };
  const addInstructor = (p) => {
    const list = (assignMap && assignMap[weekId]) || [];
    if (list.some((x) => normPid(x.id) === normPid(p.id))) return;
    saveAssignList([...list, { id: String(p.id), name: p.name, role: p.role,
      at: new Date().toISOString(), by: (me && me.name) || "" }]);
  };
  const removeInstructor = (pid) => {
    const list = (assignMap && assignMap[weekId]) || [];
    saveAssignList(list.filter((x) => normPid(x.id) !== normPid(pid)));
  };

  const saveInote = async (itemId, text) => {
    const r = await kvGetResult(inotesKey(weekId));
    if (!r.ok) return false;
    const cur = r.value && typeof r.value === "object" && !Array.isArray(r.value) ? r.value : {};
    const next = { ...cur };
    const t = String(text || "");
    if (t.trim()) next[itemId] = { text: t, at: new Date().toISOString(), by: (me && me.name) || "" };
    else delete next[itemId];
    const ok = await kvSet(inotesKey(weekId), next);
    if (ok) setInotes(next);
    return ok;
  };

  const saveFeedback = async () => {
    if (!me || feedbackFailed) { setFeedbackState("failed"); return false; }
    const r = await kvGetResult(ifeedbackKey(weekId));
    if (!r.ok) { setFeedbackState("failed"); return false; }
    const cur = r.value && typeof r.value === "object" ? r.value : {};
    const ok = await kvSet(ifeedbackKey(weekId), {
      ...cur, [normPid(me.id)]: { name: me.name || "", text: feedback, at: new Date().toISOString() },
    });
    setFeedbackState(ok ? "saved" : "failed");
    setTimeout(() => setFeedbackState(""), 2500);
    return ok;
  };

  /* Records FIRST, notifies AFTER the record lands — same order as the goal
     submission DM (#91): a ping must never point at a completion that failed
     to save. The DM itself is fire-and-forget; the record is the truth. */
  const classComplete = async () => {
    if (!me || completeState === "busy") return;
    if (!window.confirm(`Mark the ${weekLabel} in-person class complete? ${courseOwnerLabelCap()} gets a notification with your name and the notes in the box.`)) return;
    setCompleteState("busy");
    const entry = { weekId, weekLabel, at: new Date().toISOString(), byId: String(me.id),
      byName: me.name || "", notes: String(feedback || "").trim() };
    const ok = await recordSession(entry);
    if (!ok) { setCompleteState("failed"); return; }
    fetch("/api/slack-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
      body: JSON.stringify({
        to: "leadership",
        text: `*In-person class completed* — ${weekLabel}\n${entry.byName || "An instructor"} marked it complete.${entry.notes ? `\nNotes: ${entry.notes}` : ""}`,
      }),
    }).catch(() => {});
    setCompleteState("done");
  };

  // ★ SEQUENTIAL LOCK (Bri, Jul 25: "they should not be able to move to the next
  // activity until the previous is complete, similar to how the applications
  // operate"). One flat ordered list across every section, so the lock follows
  // the reading order rather than restarting per section.
  const ordered = wk.sections.flatMap((sec) => sec.items || []);
  const doneCount = ordered.filter((it) => P.isDone(it.id)).length;
  // ⚠️ INSTRUCTORS ARE NEVER LOCKED — Bri has to be able to open anything to
  // check it. The lock is for students working through the class.
  const firstUndoneIdx = ordered.findIndex((it) => !P.isDone(it.id));
  const itemUnlocked = (id) => {
    if (!sequential) return true;   // an unlocked program opens everything
    /* iView, not mayEdit: "This assignment would give them access to the full
       module for the classes they are assigned" — an assigned instructor is
       never locked out of an item they are about to teach. */
    if (iView) return true;
    const idx = ordered.findIndex((it) => it.id === id);
    if (idx < 0) return true;
    return firstUndoneIdx < 0 || idx <= firstUndoneIdx;
  };
  const allDone = ordered.length > 0 && doneCount === ordered.length;
  const submitted = P.isDone(`submit:${weekId}`);

  // Every hook above this line. The editor is a full-screen takeover rather
  // than an inline mode so there is no chance of a student seeing half a form.
  if (editing) {
    return (
      <CourseEditor seedCourse={SEED} course={wk} stored={stored}
        onSave={save} onRevert={revert} onClose={() => setEditing(false)} />
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: font.body }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Baloo+2:wght@600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
        * { box-sizing: border-box } @media (prefers-reduced-motion: reduce){*{transition:none!important}}`}</style>

      {(P.loadFailed || courseLoadFailed) && (
        <div style={{ background: "#F5EAD3", borderBottom: "1px solid #E4CE9E", color: "#7A5410", padding: "10px 16px", fontSize: 13, fontWeight: 700 }}>
          {P.loadFailed
            ? "Your saved progress could not be reached — checkmarks below are blank, not lost. Answers will not save until you close and reopen the class."
            : "The saved class content could not be reached — this is the built-in version. Editing is off so the stored class is not overwritten. Close and reopen to retry."}
        </div>
      )}

      {/* Masthead — red→navy gradient + soft decals, matching the Team Site pages */}
      <div style={{ background: `linear-gradient(120deg, #E51636 0%, #B21230 30%, ${C.ink2} 55%)`,
        color: "#fff", padding: "26px 20px 28px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", right: -46, top: -46, width: 190, height: 190, borderRadius: "50%", background: "rgba(255,255,255,.09)" }} />
        <div style={{ position: "absolute", right: 54, bottom: -64, width: 130, height: 130, borderRadius: "50%", background: "rgba(255,255,255,.06)" }} />
        <div style={{ position: "absolute", left: -30, bottom: -50, width: 110, height: 110, borderRadius: "50%", background: "rgba(255,255,255,.05)" }} />
        <div style={{ maxWidth: 760, margin: "0 auto", position: "relative" }}>
          {/* ⚠️ Gated on `isInstructor`, NOT `mayEdit` — the exit from preview
              has to survive preview, or the only way out is a page reload. */}
          {isInstructor && (
            <div style={{ position: "absolute", right: 0, top: 0, display: "flex", gap: 8 }}>
              <button onClick={() => { setPreview((v) => !v); setInstructorView(false); }}
                style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                  borderRadius: 8, padding: "6px 12px", border: "1px solid rgba(255,255,255,.45)",
                  background: preview ? "#fff" : "rgba(255,255,255,.14)", color: preview ? "#14243D" : "#fff" }}>
                {preview ? "Exit preview" : "Preview as student"}
              </button>
              {featured && (
                <button onClick={() => { setInstructorView((v) => !v); setPreview(false); }}
                  style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                    borderRadius: 8, padding: "6px 12px", border: "1px solid rgba(255,255,255,.45)",
                    background: instructorView ? "#fff" : "rgba(255,255,255,.14)", color: instructorView ? "#14243D" : "#fff" }}>
                  {instructorView ? "Exit instructor view" : "Instructor view"}
                </button>
              )}
              {mayEdit && (
                <button onClick={() => setEditing(true)}
                  style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                    borderRadius: 8, padding: "6px 12px", border: "1px solid rgba(255,255,255,.45)",
                    background: "rgba(255,255,255,.14)", color: "#fff" }}>
                  Edit this week
                </button>
              )}
            </div>
          )}
          <div style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 2, color: "rgba(255,255,255,.8)", fontWeight: 600 }}>
            LEADERSHIP 101 · WEEK {shown.n}
          </div>
          <h1 style={{ fontFamily: font.display, fontWeight: 800, fontSize: 30, margin: "6px 0 4px", lineHeight: 1.05 }}>
            {shown.title}
          </h1>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.85)" }}>{totalItems} item{totalItems === 1 ? "" : "s"}</div>

          {/* ★ ENGLISH / ESPAÑOL. Bri: "a large portion of our team that speaks
              Spanish and this would be a helpful tool to include them."
              Reading only — every edit and save stays on the English, which is
              the single source. A failure says so plainly and stays on English
              rather than showing a half-translated class. */}
          <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            {[["en", "English"], ["es", "Español"]].map(([v, label]) => (
              <button key={v} type="button" onClick={() => setLang(v)}
                style={{ border: "1px solid rgba(255,255,255,.45)", borderRadius: 999, padding: "4px 12px",
                  fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  background: lang === v ? "#fff" : "transparent", color: lang === v ? "#14243D" : "rgba(255,255,255,.9)" }}>
                {label}
              </button>
            ))}
            {lang === "es" && esState === "loading" && (
              <span style={{ fontSize: 12, color: "rgba(255,255,255,.85)" }}>Traduciendo…</span>
            )}
            {lang === "es" && esState === "failed" && (
              <span style={{ fontSize: 12, color: "#FFD9D9", fontWeight: 700 }}>
                No se pudo traducir. Mostrando la versión en inglés.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* The amber "Preview — grading and progress-saving switch on in the next
          pass" ribbon that sat here was removed Jul 25. Both of those shipped
          that morning, so the banner was telling students the class didn't do
          things it now does. Bri reported seeing it on both weeks. */}

      {/* ⚠️ A PREVIEW MUST ANNOUNCE ITSELF. An instructor who forgets they are in
          it would read a locked class as broken. Only ever renders for an
          instructor who switched it on — a student can never see this. */}
      {preview && (
        <div style={{ maxWidth: 760, margin: "16px auto 0", padding: "10px 14px", borderRadius: 10,
          background: "#FEF7E6", border: "1px solid #E8D9A8", color: "#6B5417", fontSize: 13, lineHeight: 1.45 }}>
          <strong>Preview — this is what a student sees.</strong> Editing is hidden and the
          step-by-step lock is on, so later items stay closed until earlier ones are done.
          Anything you complete here still saves against your own progress.
        </div>
      )}

      {/* ⚠️ THE VIEW MUST ANNOUNCE ITSELF, same rule as preview — an admin who
          forgets they're in it would read the missing Edit button as broken. */}
      {instructorView && (
        <div style={{ maxWidth: 760, margin: "16px auto 0", padding: "10px 14px", borderRadius: 10,
          background: C.blueSoft, border: "1px solid #BFD7EF", color: "#1E3A5F", fontSize: 13, lineHeight: 1.45 }}>
          <strong>Instructor view — this is what an assigned instructor sees.</strong> Everything
          is unlocked, instructor notes show read-only under each activity, and the notes space
          with Class Complete is at the bottom. Editing is hidden here; exit to edit. Anything
          you complete still saves against your own progress.
        </div>
      )}

      {/* An assigned instructor lands here with powers a student doesn't have —
          say so, or an unlocked class just looks broken to whoever expected
          the step-by-step lock. */}
      {featured && assigned && !isInstructor && (
        <div style={{ maxWidth: 760, margin: "16px auto 0", padding: "10px 14px", borderRadius: 10,
          background: C.blueSoft, border: "1px solid #BFD7EF", color: "#1E3A5F", fontSize: 13, lineHeight: 1.45 }}>
          <strong>You're an instructor for this class.</strong> Every item is open to you,
          instructor notes show under each activity, and your notes space for {courseOwnerLabel()} —
          with the Class Complete button — is at the bottom of the page.
        </div>
      )}

      {featured && iView && inotesFailed && (
        <div style={{ maxWidth: 760, margin: "16px auto 0", padding: "10px 14px", borderRadius: 10,
          background: "#F5EAD3", border: "1px solid #E4CE9E", color: "#7A5410", fontSize: 13, fontWeight: 700 }}>
          Instructor notes could not be reached — they exist, they're just not showing.
          Editing them is off so nothing overwrites the stored notes. Close and reopen to retry.
        </div>
      )}

      {/* ★ THE ASSIGNMENT MANAGER — Bri's "assign an instructor from a drop
          down roster with all Directors, Ex Directors, and Assistant Directors
          … as many as needed … remove them as I need to." Only course admins
          see it; the dropdown reads CURRENT titles (roster + HR overrides), so
          a promotion shows up here with no code change. */}
      {featured && mayEdit && (
        <div style={{ maxWidth: 760, margin: "16px auto 0", background: C.card, border: `1px solid ${C.line}`,
          borderRadius: 12, padding: "12px 14px" , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
          <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 13.5, color: C.ink, marginBottom: 8 }}>
            Instructors for this class
          </div>
          {assignFailed ? (
            <div style={{ fontSize: 12.5, color: "#7A5410", fontWeight: 700 }}>
              The instructor list could not be reached — assigning is off so the stored
              list is not overwritten. Close and reopen to retry.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                {((assignMap && assignMap[weekId]) || []).map((p) => (
                  <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 6,
                    fontSize: 12.5, fontWeight: 700, color: "#1E3A5F", background: C.blueSoft,
                    border: "1px solid #BFD7EF", borderRadius: 20, padding: "4px 10px" }}>
                    {p.name}
                    <span style={{ fontWeight: 400, color: C.sub }}>{p.role}</span>
                    <button onClick={() => removeInstructor(p.id)} aria-label={`Remove ${p.name} as instructor`}
                      style={{ all: "unset", cursor: "pointer", color: "#B91C1C", fontWeight: 800 }}>×</button>
                  </span>
                ))}
                {((assignMap && assignMap[weekId]) || []).length === 0 && (
                  <span style={{ fontSize: 12.5, color: C.sub }}>Nobody assigned yet.</span>
                )}
              </div>
              <select value="" style={{ marginTop: 8, fontFamily: font.body, fontSize: 12.5, padding: "7px 9px",
                  borderRadius: 8, border: `1px solid ${C.line}`, color: C.ink, background: "#fff", minWidth: 220 }}
                onChange={(e) => {
                  const p = (eligible || []).find((x) => x.id === e.target.value);
                  e.target.value = "";
                  if (p) addInstructor(p);
                }}>
                <option value="">+ Assign an instructor…</option>
                {(eligible || [])
                  .filter((p) => !((assignMap && assignMap[weekId]) || []).some((x) => normPid(x.id) === normPid(p.id)))
                  .map((p) => <option key={p.id} value={p.id}>{p.name} — {p.role}</option>)}
              </select>
              {eligible !== null && eligible.length === 0 && (
                <div style={{ fontSize: 11.5, color: C.sub, marginTop: 4 }}>
                  No Directors, Executive Directors, Assistant Directors or HR found on the roster.
                </div>
              )}
              <div style={{ fontSize: 11.5, color: C.sub, marginTop: 6, lineHeight: 1.5 }}>
                An assigned instructor gets the full module with nothing locked, sees every
                instructor note, and gets the notes space with the Class Complete
                button. They cannot edit the class.
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px 64px" }}>
        {shown.sections.map((sec) => (
          <section key={sec.id} style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 12.5, letterSpacing: 1,
              textTransform: "uppercase", color: C.sub, marginBottom: 2 }}>{sec.title}</div>
            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "4px 14px" , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
              {(sec.items || []).map((it, i) => (
                <Item key={it.id} item={it} P={P} instructor={iView} unlocked={itemUnlocked(it.id)}
                  index={i + 1}
                  open={openId === it.id}
                  onToggle={() => setOpenId((cur) => (cur === it.id ? null : it.id))}
                  inote={inotes[it.id]}
                  showNotes={featured && iView && !inotesFailed}
                  canEditNotes={featured && mayEdit && !inotesFailed}
                  onSaveNote={saveInote} />
              ))}
            </div>
          </section>
        ))}

        {/* ★ SUBMIT — the ONLY thing that marks this class complete.
            Bri: "the class should then check off after they submit… they should
            not be able to check it off themselves." So there is no student-facing
            completion control anywhere else, and this button does not appear at
            all until every item is done. */}
        {P.person && (
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14,
            padding: 16, marginTop: 18, textAlign: "center" , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
            {submitted ? (
              <>
                <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 15, color: C.green }}>
                  {weekLabel} submitted ✓
                </div>
                <div style={{ fontSize: 12.5, color: C.sub, marginTop: 4 }}>
                  {courseOwnerLabelCap()} has been told. Nothing else to do here.
                </div>
              </>
            ) : allDone ? (
              <>
                <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
                  That's everything — ready to hand in?
                </div>
                <button onClick={() => P.submitWeek(weekId, weekLabel)}
                  style={btn(C.ink, "#fff")}>Submit {weekLabel}</button>
              </>
            ) : (
              <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.5 }}>
                <b>{doneCount} of {ordered.length} done.</b> Finish everything above and a
                Submit button appears here.
              </div>
            )}
          </div>
        )}

        {/* ★★ THE SKILLS CHECKLIST FOR THIS CLASS (Bri, Jul 30 2026: "Entering
            the W2-4 classes should automatically open the Skills Checklists for
            Leadership 101 that we made in the Team Training section. Only
            Leadership 101 Skills should be accessed through the entrance into
            the W2 class").

            ⚠️ `only="l101"` IS HER RULE, NOT A DEFAULT. The Senior Trainer card
            lives in the same list and must not appear here; passing the week id
            as well means W2 shows W2 skills and nothing else.
            ⚠️ THE SAME COMPONENT AND THE SAME RECORD as Team Training, imported
            rather than rebuilt — a tick made here is the tick they see there.
            ⚠️ ONLY WHERE THE CHECKLIST HAS A MATCHING WEEK. The panel returns
            nothing for a class with no skills of its own, so a custom class Bri
            adds does not grow an empty section.
            ⚠️ NOT for a signed-out reader: `me` is null on the print and preview
            paths, and the panel keys its record off a person's name. */}
        {me && me.name && (
          <div style={{ marginTop: 18 }}>
            <SkillsChecklists name={me.name} only="l101" week={weekId} />
          </div>
        )}

        {/* ★ THE NOTES-TO-BRI SPACE + CLASS COMPLETE (her words: "a separate
            notes space where they can note anything that they want to
            communicate with me about how the class went, who participated,
            things that they missed or added … a 'Class Complete' button at
            the bottom with notes that sends me a notification").
            Each instructor has their OWN notes record, and Class Complete
            snapshots whatever is in the box into the session record — so the
            Completed In-Person Classes view shows the notes as they stood at
            completion even if the box is edited later. */}
        {featured && me && iView && (
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14,
            padding: 16, marginTop: 18 , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
            <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 15, color: C.ink }}>
              Instructor notes to {courseOwnerLabel()} — {weekLabel}
            </div>
            <div style={{ fontSize: 12.5, color: C.sub, marginTop: 4, lineHeight: 1.5 }}>
              How the class went, who participated, anything you skipped or added,
              questions that came up. These are yours — each instructor has their own space.
            </div>
            {feedbackFailed ? (
              <div style={{ fontSize: 12.5, color: "#7A5410", fontWeight: 700, marginTop: 10 }}>
                Your saved notes could not be reached — writing is off so nothing overwrites
                them. Close and reopen the class to retry.
              </div>
            ) : (
              <>
                <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={4}
                  placeholder="Your notes about this class session…"
                  style={{ width: "100%", resize: "vertical", borderRadius: 10, border: `1px solid ${C.line}`,
                    padding: "10px 12px", fontFamily: font.body, fontSize: 14, color: C.ink,
                    background: C.paper, marginTop: 10 }} />
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <button onClick={saveFeedback} style={btn(C.ink, "#fff")}>Save notes</button>
                  {feedbackState === "saved" && <span style={{ fontSize: 12.5, fontWeight: 700, color: C.green }}>Saved ✓</span>}
                  {feedbackState === "failed" && <span style={{ fontSize: 12.5, fontWeight: 700, color: C.red }}>Not saved — try again</span>}
                  <span style={{ flex: 1 }} />
                  <button onClick={classComplete} disabled={completeState === "busy"}
                    style={{ ...btn(C.green, "#fff"), opacity: completeState === "busy" ? 0.6 : 1 }}>
                    {completeState === "busy" ? "Recording…" : "Class Complete"}
                  </button>
                </div>
                {completeState === "done" && (
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.green, marginTop: 8 }}>
                    Recorded — {courseOwnerLabel()} has been told.
                  </div>
                )}
                {completeState === "failed" && (
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.red, marginTop: 8 }}>
                    The completion could not be recorded, so {courseOwnerLabel()} was not notified.
                    Check the connection and press Class Complete again.
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <p style={{ textAlign: "center", fontSize: 12.5, color: C.sub, marginTop: 28 }}>
          {STORE.appName} · Leadership Development · {weekLabel}
        </p>
      </div>
    </div>
  );
}
