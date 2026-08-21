import React, { useState, useEffect } from "react";
/* The shared raised look and accent edge — see cardStyle.js. */
import { CARD_3D, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { effectiveRole } from "./accessOverrides.js";
import { kvSet, kvGetResult } from "./store.js";
import { uploadCourseAsset } from "./L101Progress.jsx";
import { TRAINING_ADMIN_ROLES } from "./adminRoles.js";
import { adminNames } from "./storeConfig.js";
/* Every rule about what a quiz may contain lives in that leaf module, not in
   this screen — see its header for why the two answer shapes are load-bearing
   and what the renderer's own comment warns about. */
import * as QE from "./l101QuizEdit.js";

/**
 * L101Editor — makes Leadership 101 week content editable by Bri.
 *
 * Bri has asked three times for "full editing capabilities to move/edit
 * elements of the class". Until now the content lived as a hardcoded object
 * inside each week's module file, so every wording change routed through Matt.
 *
 * ★ HOW SEEDING WORKS, AND WHY IT MATTERS
 * The code object stays the SEED. Until somebody saves an edit, the page reads
 * it straight from the file — so content fixes shipped in code still land.
 * The moment Bri saves, her version is stored and wins from then on.
 * ⚠️ CONSEQUENCE, AND SHE MUST BE TOLD: after her first save, changing the
 * content in code has NO visible effect on that week. That is the deal she
 * asked for — ownership — but it is a one-way door per week.
 *
 * ★ WHAT IS EDITABLE AND WHAT IS NOT
 * Editable: section titles and order · item titles and order · which section an
 * item sits in · the written text on an item (a reading note, a Q&A prompt, an
 * activity's instructions, an assignment brief) · adding and deleting items and
 * sections.
 * Also editable: matching-game pairs, and — since Aug 11 2026 — quiz questions,
 * choices and answer keys.
 *
 * ⚠️ THIS PARAGRAPH USED TO SAY THE OPPOSITE AND WAS HALF WRONG WHEN IT WAS
 * READ. It said neither quizzes nor matching-game pairs were editable here.
 * Pairs had been fully editable for over a week (def, answer and an image), so
 * the file was documenting a restriction it did not have — and a `LOCKED` set
 * naming both types survived alongside it, locking nothing. Both are gone.
 *
 * ★ WHAT THE OLD PARAGRAPH GOT RIGHT, AND WHAT REPLACED IT. Its reason was
 * sound: a quiz carries right and wrong answers, and a half-finished edit does
 * not break visibly — it silently mis-grades somebody, and nobody finds out
 * until a team member argues about a score. So quizzes did not become editable
 * by loosening anything. They became editable because l101QuizEdit.js now
 * holds the rules and doSave refuses while any of them is broken. Read that
 * module's header before changing anything here; the two answer shapes in
 * particular are load-bearing.
 *
 * Storage: ld:l101:content:<weekId>
 */

export const contentKey = (weekId) => `ld:l101:content:${weekId}`;

/* ⚠️ WAS A HARDCODED Set OF THIS STORE'S PEOPLE. Same name door as the tiles
   already reading `adminNames`. Read at CALL time, never captured. */
/* ⛔ "director" REMOVED Jul 27 at Bri's instruction — she does not want the
   FOH/BOH directors editing her course content when their titles change on
   promotion. This is the gate that actually opens the content editor, so
   leaving it here would have granted the thing she asked us not to, no matter
   what the class gate said. ⚠️ It narrows her own earlier role-based rule on
   purpose; do not restore it for consistency. */
/* ★ THE LIST NOW LIVES IN adminRoles.js — TRAINING_ADMIN_ROLES.
   the four training tools share one list. NOTE this list carries `leadership director` and NOT plain `director` — it is not the team-tool list.
   ⚠️ ONLY THE DECLARATION MOVED. Every use of ADMIN_ROLES below is
   byte-for-byte what it was, including this file's own role normaliser,
   which is NOT the same function in every tile. */
const ADMIN_ROLES = new Set(TRAINING_ADMIN_ROLES);
const norm = (s) => String(s || "").trim().toLowerCase();

// Bri's decision (recorded when L101 access was settled): edit rights are
// ROLE-based, so a newly promoted Director gets them without a code change.
export function canEditCourse() {
  try {
    const u = JSON.parse(localStorage.getItem("gcfcr-access-user"));
    /* ⚠️ `effectiveRole`, NOT `u.role`. The role branch below is what let an
       Executive Director through — which is correct for Matt, Hannah and Nick,
       and is exactly what Bri asked us to stop for Kyleeka on Jul 28 without
       changing her HR record. The name branch is unaffected: an override can
       only ever lower what somebody sees. */
    return !!u && (adminNames("l101Editor").includes(norm(u.name)) || ADMIN_ROLES.has(norm(effectiveRole(u))));
  } catch { return false; }
}

const clone = (o) => JSON.parse(JSON.stringify(o));

export function useEditableCourse(weekId, seed) {
  const [course, setCourse] = useState(seed);
  const [stored, setStored] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // true = the stored week could not be READ (not "never edited"). The seed is
  // then display-only: Save and Revert refuse, because an edit saved on top of
  // the seed would replace Bri's real stored class content.
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      // ⚠️ kvGetResult: a FAILED read used to be indistinguishable from
      // "never edited" — the seed rendered, and the next Save wrote
      // seed-plus-one-edit over the stored class.
      const r = await kvGetResult(contentKey(weekId));
      if (live) {
        if (!r.ok) {
          setLoadFailed(true);
        } else {
          setLoadFailed(false);
          const saved = r.value;
          // Shape-check before trusting it. A malformed record must fall back
          // to the seed rather than render an empty class.
          if (saved && Array.isArray(saved.sections) && saved.sections.length) {
            setCourse(saved); setStored(true);
          }
        }
        setLoaded(true);
      }
    })();
    return () => { live = false; };
  }, [weekId]);

  const save = async (next) => {
    if (loadFailed) return false;
    setCourse(next); setStored(true);
    // kvSet returns false on a refused write, never throws — pass it through
    // instead of manufacturing a success.
    return await kvSet(contentKey(weekId), next);
  };
  // Writes the seed back rather than deleting the key — predictable, and it
  // can't leave the page reading a half-removed record.
  const revert = async () => save(clone(seed));

  return { course, loaded, stored, loadFailed, save, revert };
}

/* ── ui ──────────────────────────────────────────────────────────────────*/
const C = { ink: "#14243D", sub: "#5b6b82", line: "#E3E7EC", paper: "#F4F6F8",
  red: "#DD0031", blue: "#1D4ED8", green: "#0F766E" };
const FONT = "'Inter', system-ui, -apple-system, sans-serif";
const inp = { fontFamily: FONT, fontSize: 14, padding: "8px 10px", borderRadius: 8,
  border: `1px solid ${C.line}`, width: "100%", boxSizing: "border-box", color: C.ink, background: "#fff" };

function Btn({ children, onClick, kind = "ghost", small, disabled, title }) {
  const solid = kind === "solid", danger = kind === "danger";
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ fontFamily: FONT, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1, borderRadius: 8,
        border: `1px solid ${solid ? C.ink : danger ? "#FCA5A5" : C.line}`,
        background: solid ? C.ink : "#fff", color: solid ? "#fff" : danger ? C.red : C.ink,
        fontSize: small ? 12 : 13.5, padding: small ? "4px 9px" : "8px 14px" }}>
      {children}
    </button>
  );
}

// The one text field each type actually carries, so the editor shows the right
// box instead of a generic one nobody can map to what's on screen.
const BODY_FIELD = { read: "note", qa: "prompt", match: "instructions", assign: "brief", upload: "brief", walk: "intro", watch: null, quiz: null };
const TYPE_LABEL = { read: "Reading", watch: "Video", qa: "Q&A", match: "Matching game", quiz: "Quiz", assign: "Assignment", upload: "Upload", walk: "Walkthrough" };

export function CourseEditor({ seedCourse, course, onSave, onRevert, onClose, stored }) {
  const [draft, setDraft] = useState(() => clone(course));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const secs = draft.sections || [];
  const upd = (next) => setDraft({ ...draft, sections: next });

  const moveSec = (i, d) => {
    const j = i + d; if (j < 0 || j >= secs.length) return;
    const n = secs.slice(); [n[i], n[j]] = [n[j], n[i]]; upd(n);
  };
  const setSecTitle = (i, v) => { const n = secs.slice(); n[i] = { ...n[i], title: v }; upd(n); };
  const addSec = () => upd([...secs, { id: "sec-" + Date.now(), title: "New section", items: [] }]);
  const delSec = (i) => {
    if ((secs[i].items || []).length && !window.confirm(
      `Delete "${secs[i].title}" and its ${secs[i].items.length} item(s)? This can't be undone.`)) return;
    upd(secs.filter((_, k) => k !== i));
  };

  const moveItem = (si, ii, d) => {
    const items = secs[si].items.slice();
    const j = ii + d; if (j < 0 || j >= items.length) return;
    [items[ii], items[j]] = [items[j], items[ii]];
    const n = secs.slice(); n[si] = { ...n[si], items }; upd(n);
  };
  const setItem = (si, ii, patch) => {
    const items = secs[si].items.slice(); items[ii] = { ...items[ii], ...patch };
    const n = secs.slice(); n[si] = { ...n[si], items }; upd(n);
  };
  const delItem = (si, ii) => {
    const it = secs[si].items[ii];
    if (!window.confirm(`Delete "${it.title}"? This can't be undone.`)) return;
    const items = secs[si].items.filter((_, k) => k !== ii);
    const n = secs.slice(); n[si] = { ...n[si], items }; upd(n);
  };
  // Moving between sections is a remove-then-append, so an item can never end
  // up in two sections if a render happens mid-change.
  const moveToSec = (si, ii, targetIdx) => {
    if (targetIdx === si || targetIdx < 0 || targetIdx >= secs.length) return;
    const it = secs[si].items[ii];
    const n = secs.slice();
    n[si] = { ...n[si], items: n[si].items.filter((_, k) => k !== ii) };
    n[targetIdx] = { ...n[targetIdx], items: [...n[targetIdx].items, it] };
    upd(n);
  };
  /* ── MULTI-PART ASSIGNMENTS ──────────────────────────────────────────
     Bri, Jul 26: "on the W2 assignment, the part A label and Part B (Enneagram
     portion) are still there. I attempted to manually edit, but there's not an
     option for me to do that."

     She was right. An `assign` item can carry a `parts` array —
       parts: [{ label, body, scenarios: [] }]
     — and this editor only knew about the single `brief` field. So a multi-part
     assignment showed an empty brief box that had nothing to do with what was
     on screen, and the actual wording was unreachable from anywhere in the Hub.

     ⚠️ Items WITHOUT a parts array are untouched and still use `brief`. Adding
     the first part does NOT delete an existing brief — both shapes render, and
     silently dropping her text to tidy the model would be the wrong trade. */
  const partsOf = (it) => Array.isArray(it && it.parts) ? it.parts : null;

  const setPart = (si, ii, pi, patch) => {
    const it = secs[si].items[ii]; const parts = (it.parts || []).slice();
    parts[pi] = { ...parts[pi], ...patch };
    setItem(si, ii, { parts });
  };
  const addPart = (si, ii) => {
    const it = secs[si].items[ii];
    setItem(si, ii, { parts: [...(it.parts || []), { label: "", body: "" }] });
  };
  const delPart = (si, ii, pi) => {
    const it = secs[si].items[ii]; const parts = it.parts || [];
    const nm = (parts[pi] && parts[pi].label) || "this part";
    if (!window.confirm(`Delete "${nm}" from this assignment? This can't be undone.`)) return;
    setItem(si, ii, { parts: parts.filter((_, k) => k !== pi) });
  };
  const movePart = (si, ii, pi, d) => {
    const parts = (secs[si].items[ii].parts || []).slice();
    const j = pi + d; if (j < 0 || j >= parts.length) return;
    [parts[pi], parts[j]] = [parts[j], parts[pi]];
    setItem(si, ii, { parts });
  };

  // Scenarios are a plain string list inside a part. Same shape rules: an
  // absent list stays absent rather than being created empty.
  const setScenario = (si, ii, pi, k, v) => {
    const list = ((secs[si].items[ii].parts || [])[pi].scenarios || []).slice();
    list[k] = v; setPart(si, ii, pi, { scenarios: list });
  };
  const addScenario = (si, ii, pi) => {
    const list = ((secs[si].items[ii].parts || [])[pi].scenarios || []).slice();
    setPart(si, ii, pi, { scenarios: [...list, ""] });
  };
  const delScenario = (si, ii, pi, k) => {
    const list = ((secs[si].items[ii].parts || [])[pi].scenarios || []).filter((_, x) => x !== k);
    setPart(si, ii, pi, { scenarios: list });
  };

  const addItem = (si, type) => {
    const it = { id: `it-${Date.now()}`, type, title: TYPE_LABEL[type] + " — untitled" };
    if (type === "watch") it.youtube = "";
    const f = BODY_FIELD[type]; if (f) it[f] = "";
    /* ★ A NEW WALKTHROUGH STARTS AS BRI'S MOCK-INSPECTION TABLE (her Jul 31
       spec), not an empty shell — W1 and W2 already have stored content, so the
       only way this activity reaches those weeks is her adding it here, and one
       tap should give her the working table to edit rather than ten rows to
       assemble by hand. Every id minted fresh: answers key on
       `${item.id}:${row.id}`, so two walkthroughs never share a record. */
    /* ★ A NEW MATCHING GAME STARTS WITH THREE PAIRS (Bri, Aug 2 2026: "I'd
       like the option to add matching games into the W3 like I have set up
       with W2"). Same reasoning as the walkthrough below: one tap should give
       her a working exercise to edit, not an empty shell she has to assemble.
       ⚠️ NO IDS ON PAIRS, deliberately — a student's saved progress is keyed
       by the pair's INDEX (see saveMatch in L101Progress.jsx), so ids here
       would imply a stability the storage does not actually have. The editor
       says so where she can delete one. */
    /* ★ A NEW QUIZ STARTS WITH ONE BLANK QUESTION, not an empty shell — the
       same reasoning as the matching game and the walkthrough below it.
       ⚠️⚠️ AND IT ALWAYS HAS A `questions` ARRAY. QuizItem's own comment says a
       quiz without one "would blank the whole class", and that it was "safe
       only because the editor cannot add a quiz today; that is a UI accident,
       not a guarantee about the data". This line is what turns that accident
       into a guarantee, together with the save gate in doSave. */
    if (type === "quiz") {
      const q = QE.newQuiz(it.id);
      it.title = q.title; it.timeLabel = q.timeLabel; it.questions = q.questions;
    }
    if (type === "match") {
      it.title = "Matching game — untitled";
      it.instructions = "Match each description on the left with the right word.";
      it.pairs = [
        { def: "", answer: "" },
        { def: "", answer: "" },
        { def: "", answer: "" },
      ];
      it.keyPoints = [];
    }
    if (type === "walk") {
      const t = Date.now();
      it.title = "Inspect What You Expect!";
      it.intro = "Before the walkthrough, make sure you have slip-resistant shoes, hair pulled back, a hairnet, and wash hands!\n\nAs you move through the restaurant, look for general violations and risks -- cross-contamination concerns, holding temperatures, hair/jewelry violations, etc. Don't be afraid to ask questions and seek clarity, it helps everyone learn!";
      it.outro = "Let's Discuss! What risks or violations did you see that require immediate action?";
      it.areas = [
        { id: `wa-${t}-boh`, label: "BOH", rows: [
          { id: `wr-${t}-1`, label: "Back Door", detail: "Chemical Shelf and SDS sheets" },
          { id: `wr-${t}-2`, label: "Walk-In Cooler" },
          { id: `wr-${t}-3`, label: "Walk-In Freezer" },
          { id: `wr-${t}-4`, label: "Dishes" },
          { id: `wr-${t}-5`, label: "Prep" },
          { id: `wr-${t}-6`, label: "Secondary" },
          { id: `wr-${t}-7`, label: "Primary" },
          { id: `wr-${t}-8`, label: "Raw (Breading)" },
        ] },
        { id: `wa-${t}-foh`, label: "FOH", note: "Wash hands before moving to the FOH!", rows: [
          { id: `wr-${t}-9`, label: "Front Counter" },
          { id: `wr-${t}-10`, label: "Drive Thru" },
        ] },
      ];
    }
    const n = secs.slice(); n[si] = { ...n[si], items: [...n[si].items, it] }; upd(n);
  };

  /* ── WALKTHROUGH AREAS (Bri's mock inspection, Jul 31) ────────────────────
     Same discipline as assignment parts: rebuild the array immutably through
     setItem, confirm before anything destructive.
     ⚠️ ROW IDS ARE PERMANENT once a student has written in a box — their notes
     key on `${item.id}:${row.id}:obs|con`. Renaming a row's LABEL is safe
     (each saved note keeps the title it was written under). Deleting a row or
     area leaves those notes on student records but stops showing them, and the
     confirm says so out loud. New rows and areas mint fresh ids. */
  const areasOf = (it) => (Array.isArray(it && it.areas) ? it.areas : []);
  const setArea = (si, ii, ai, patch) => {
    const areas = areasOf(secs[si].items[ii]).slice();
    areas[ai] = { ...areas[ai], ...patch };
    setItem(si, ii, { areas });
  };
  const addArea = (si, ii) => {
    const areas = areasOf(secs[si].items[ii]);
    setItem(si, ii, { areas: [...areas, { id: `wa-${Date.now()}`, label: "New area", rows: [] }] });
  };
  const delArea = (si, ii, ai) => {
    const areas = areasOf(secs[si].items[ii]);
    const a = areas[ai] || {};
    if (!window.confirm(`Delete "${a.label || "this area"}" and its ${(a.rows || []).length} row(s)? Notes students already wrote in them stay on their records but stop being shown here.`)) return;
    setItem(si, ii, { areas: areas.filter((_, k) => k !== ai) });
  };
  const moveArea = (si, ii, ai, d) => {
    const areas = areasOf(secs[si].items[ii]).slice();
    const j = ai + d; if (j < 0 || j >= areas.length) return;
    [areas[ai], areas[j]] = [areas[j], areas[ai]];
    setItem(si, ii, { areas });
  };
  const setWalkRow = (si, ii, ai, ri, patch) => {
    const areas = areasOf(secs[si].items[ii]).slice();
    const rows = (areas[ai].rows || []).slice();
    rows[ri] = { ...rows[ri], ...patch };
    areas[ai] = { ...areas[ai], rows };
    setItem(si, ii, { areas });
  };
  const addWalkRow = (si, ii, ai) => {
    const areas = areasOf(secs[si].items[ii]).slice();
    areas[ai] = { ...areas[ai], rows: [...(areas[ai].rows || []), { id: `wr-${Date.now()}`, label: "" }] };
    setItem(si, ii, { areas });
  };
  const delWalkRow = (si, ii, ai, ri) => {
    const areas = areasOf(secs[si].items[ii]).slice();
    const rows = areas[ai].rows || [];
    const nm = (rows[ri] && rows[ri].label) || "this row";
    if (!window.confirm(`Delete "${nm}"? Notes students already wrote for it stay on their records but stop being shown here.`)) return;
    areas[ai] = { ...areas[ai], rows: rows.filter((_, k) => k !== ri) };
    setItem(si, ii, { areas });
  };
  const moveWalkRow = (si, ii, ai, ri, d) => {
    const areas = areasOf(secs[si].items[ii]).slice();
    const rows = (areas[ai].rows || []).slice();
    const j = ri + d; if (j < 0 || j >= rows.length) return;
    [rows[ri], rows[j]] = [rows[j], rows[ri]];
    areas[ai] = { ...areas[ai], rows };
    setItem(si, ii, { areas });
  };

  const doSave = async () => {
    if (!secs.length) { setMsg("A week needs at least one section."); return; }
    /* ⚠️⚠️ A HALF-WRITTEN QUIZ NEVER REACHES A STUDENT. This is the whole reason
       quizzes were not editable before today: a question with no key, or a key
       pointing at a choice that was deleted, does not break visibly — it
       silently mis-grades somebody, and nobody finds out until a team member
       argues about a score. The message names the quiz and the question. */
    const quizProblems = QE.weekQuizProblems(secs);
    if (quizProblems.length) {
      setMsg(`Not saved — ${quizProblems.length} thing${quizProblems.length === 1 ? "" : "s"} to fix. ${quizProblems[0]}`);
      return;
    }
    setBusy(true);
    /* Strips editor-only state (an unpicked `answer: null`) and normalises the
       key, so what lands in storage is exactly the shape QuizItem reads.
       Non-quiz items pass through untouched. */
    const ok = await onSave({ ...draft, sections: QE.cleanWeek(secs) });
    setBusy(false);
    setMsg(ok ? "Saved" : "Save failed — try again");
    if (ok) setTimeout(() => onClose && onClose(), 700);
  };

  const doRevert = async () => {
    if (!window.confirm("Put this week back to how it was originally written? Your changes to it will be lost.")) return;
    setBusy(true); await onRevert(); setBusy(false);
    setDraft(clone(seedCourse)); setMsg("Reverted to the original");
  };

  return (
    <div style={{ fontFamily: FONT, background: C.paper, minHeight: "100vh", color: C.ink }}>
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "rgba(244,246,248,.95)",
        backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.line}`, padding: "12px 18px",
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Editing: {draft.title}</div>
        <div style={{ flex: 1 }} />
        {msg && <span style={{ fontSize: 12.5, fontWeight: 700, color: msg === "Saved" ? C.green : C.sub }}>{msg}</span>}
        <Btn small onClick={onClose}>Cancel</Btn>
        <Btn small kind="solid" onClick={doSave} disabled={busy}>Save changes</Btn>
      </div>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "18px 16px 60px" }}>
        <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10,
          padding: "11px 13px", fontSize: 12.5, color: "#1E3A5F", lineHeight: 1.5, marginBottom: 16 }}>
          You can rename anything, reorder it, move items between sections, and add or delete them.
          Quiz questions and matching-game pairs are edited here too, answer keys included. Because
          those decide who passes, a question that is missing its wording, its choices or its correct
          answer will stop the week saving and say so, rather than going out half written.
          Scores already recorded keep the words the student saw, so fixing a question never changes
          anybody's past result.
          An assignment made of several parts can be edited part by part — including deleting a
          whole part you no longer want.
          A walkthrough's area groups and rows are edited right on the item — labels, the callout
          between groups, and the discussion question at the end.
          {!stored && <> Nothing is stored yet, so this week is still showing its original version.</>}
        </div>

        {secs.map((sec, si) => (
          <div key={sec.id || si} style={{ background: "#fff", border: `1px solid ${C.line}`,
            borderRadius: 12, padding: 14, marginBottom: 14 , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <input value={sec.title || ""} onChange={(e) => setSecTitle(si, e.target.value)}
                style={{ ...inp, flex: "1 1 200px", fontWeight: 700 }} />
              <Btn small onClick={() => moveSec(si, -1)} disabled={si === 0} title="Move section up">▲</Btn>
              <Btn small onClick={() => moveSec(si, 1)} disabled={si === secs.length - 1} title="Move section down">▼</Btn>
              <Btn small kind="danger" onClick={() => delSec(si)}>Delete section</Btn>
            </div>

            {(sec.items || []).map((it, ii) => {
              const field = BODY_FIELD[it.type];
              return (
                <div key={it.id || ii} style={{ borderTop: `1px solid ${C.line}`, padding: "10px 0" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase",
                      color: C.sub, border: `1px solid ${C.line}`,
                      borderRadius: 5, padding: "2px 6px", whiteSpace: "nowrap" }}>
                      {TYPE_LABEL[it.type] || it.type}
                    </span>
                    <input value={it.title || ""} onChange={(e) => setItem(si, ii, { title: e.target.value })}
                      style={{ ...inp, flex: "1 1 180px" }} />
                    <Btn small onClick={() => moveItem(si, ii, -1)} disabled={ii === 0}>▲</Btn>
                    <Btn small onClick={() => moveItem(si, ii, 1)} disabled={ii === (sec.items.length - 1)}>▼</Btn>
                    <Btn small kind="danger" onClick={() => delItem(si, ii)}>Delete</Btn>
                  </div>

                  {it.type === "watch" && (
                    <input value={it.youtube || ""} placeholder="YouTube video ID"
                      onChange={(e) => setItem(si, ii, { youtube: e.target.value.trim() })}
                      style={{ ...inp, marginTop: 6, fontSize: 13 }} />
                  )}

                  {/* ── MATCHING GAME: the pairs, and the notes that unlock ──
                      `def` is what the student reads, `answer` is the word they
                      drag onto it. Both are required for a pair to be playable,
                      which is why an empty one is called out rather than
                      silently shipped. */}
                  {it.type === "match" && (
                    <div style={{ marginTop: 8, border: `1px solid ${C.line}`, borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: C.sub, marginBottom: 6 }}>
                        Pairs ({(it.pairs || []).length})
                      </div>
                      {(it.pairs || []).map((pr, pi) => (
                        <div key={pi} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, color: C.sub, width: 18, textAlign: "right" }}>{pi + 1}</span>
                          <input value={pr.def || ""} placeholder="What the student reads"
                            onChange={(e) => { const v = e.target.value;
                              setItem(si, ii, { pairs: (it.pairs || []).map((x, k) => (k === pi ? { ...x, def: v } : x)) }); }}
                            style={{ ...inp, flex: "3 1 220px", fontSize: 13 }} />
                          <input value={pr.answer || ""} placeholder="The word that matches it"
                            onChange={(e) => { const v = e.target.value;
                              setItem(si, ii, { pairs: (it.pairs || []).map((x, k) => (k === pi ? { ...x, answer: v } : x)) }); }}
                            style={{ ...inp, flex: "2 1 150px", fontSize: 13 }} />
                          {/* ★ AN IMAGE ON THE PROMPT SIDE (Bri, Aug 3 2026:
                              "the option to match images to the correct label").
                              Uploads to the same coursework bucket as every
                              other class image and renders small — the class
                              caps the HEIGHT so a portrait photo cannot push
                              the row down the page, which is the thing she
                              specifically asked to avoid.
                              ⚠️ Removing the picture clears the LINK only; the
                              file stays in the bucket, so a mis-tap is
                              recoverable rather than a permanent loss. Same
                              rule as item images above. */}
                          {pr.img ? (
                            <Btn small onClick={() => setItem(si, ii, { pairs: (it.pairs || []).map((x, k) => (k === pi ? { ...x, img: null } : x)) })}>
                              🖼 remove
                            </Btn>
                          ) : (
                            <label style={{ fontSize: 12, fontWeight: 700, color: C.blue, cursor: "pointer", whiteSpace: "nowrap" }}>
                              {busy ? "…" : "+ image"}
                              <input type="file" accept="image/*" style={{ display: "none" }}
                                onChange={async (e) => {
                                  const file = e.target.files && e.target.files[0];
                                  e.target.value = "";
                                  if (!file) return;
                                  setBusy(true);
                                  try {
                                    const rec = await uploadCourseAsset(`pairs/${draft.id || course.id || "wk"}/${it.id}`, file);
                                    setItem(si, ii, { pairs: (it.pairs || []).map((x, k) => (k === pi ? { ...x, img: rec } : x)) });
                                    setMsg("Image attached — remember to Save.");
                                  } catch (err) {
                                    window.alert((err && err.message) || "That didn't upload.");
                                  }
                                  setBusy(false);
                                }} />
                            </label>
                          )}
                          <Btn small kind="danger"
                            onClick={() => setItem(si, ii, { pairs: (it.pairs || []).filter((_, k) => k !== pi) })}>×</Btn>
                        </div>
                      ))}
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
                        <Btn small onClick={() => setItem(si, ii, { pairs: [...(it.pairs || []), { def: "", answer: "" }] })}>+ Add a pair</Btn>
                        {(it.pairs || []).some((pr) => !String(pr.def || "").trim() || !String(pr.answer || "").trim()) && (
                          <span style={{ fontSize: 12, color: "#B45309", fontWeight: 700 }}>
                            A pair needs both sides filled in before it will play.
                          </span>
                        )}
                      </div>
                      {/* ⚠️ SAID OUT LOUD, because the storage cannot protect
                          against it: saved matches are keyed by position, so
                          removing pair 2 makes every answer below it line up
                          against the wrong row for anyone mid-game. Adding is
                          always safe — new pairs go on the end. */}
                      <div style={{ fontSize: 11.5, color: C.sub, marginTop: 6, lineHeight: 1.45 }}>
                        Adding a pair is always safe. Removing or reordering one shifts the
                        answers of anyone who has already started this game, so do it before
                        the class rather than during it.
                      </div>

                      <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: C.sub, margin: "12px 0 4px" }}>
                        Teaching notes
                      </div>
                      <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 5 }}>
                        One per line. Students only see these once they have matched every pair; you see them straight away.
                      </div>
                      <textarea rows={3} value={(it.keyPoints || []).join("\n")}
                        onChange={(e) => { const v = e.target.value;
                          setItem(si, ii, { keyPoints: v.split("\n").map((x) => x.trim()).filter(Boolean) }); }}
                        style={{ ...inp, width: "100%", fontSize: 13, resize: "vertical" }} />
                    </div>
                  )}

                  {/* ★ IMAGES ON ANY ITEM — Bri's "images inside class sections"
                      (Jul 29). Until now the only images in a class were two
                      hardcoded in L101Week.jsx pointing straight at the backend
                      host; she could not add one without a deploy. These upload
                      to the same private coursework bucket as student work and
                      render through the same signed-URL path.
                      ⚠️ Removing an image drops it from the item only — the
                      stored file stays in the bucket, so a mis-tap can be
                      re-added rather than being a permanent loss. */}
                  <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {(it.imageFiles || []).map((f, fi) => (
                      <span key={fi} style={{ fontSize: 12, color: C.sub, border: `1px solid ${C.line}`, borderRadius: 6, padding: "3px 8px", display: "inline-flex", gap: 6, alignItems: "center" }}>
                        🖼 {f.name}
                        <button onClick={() => setItem(si, ii, { imageFiles: (it.imageFiles || []).filter((_, k) => k !== fi) })}
                          style={{ all: "unset", cursor: "pointer", color: "#B91C1C", fontWeight: 800 }} aria-label={`Remove ${f.name}`}>×</button>
                      </span>
                    ))}
                    <label style={{ fontSize: 12.5, fontWeight: 700, color: C.blue, cursor: "pointer" }}>
                      {busy ? "Uploading…" : "+ Add image"}
                      <input type="file" accept="image/*" style={{ display: "none" }}
                        onChange={async (e) => {
                          const file = e.target.files && e.target.files[0];
                          e.target.value = "";
                          if (!file) return;
                          setBusy(true);
                          try {
                            const rec = await uploadCourseAsset(`sections/${draft.id || course.id || "wk"}/${it.id}`, file);
                            setItem(si, ii, { imageFiles: [...(it.imageFiles || []), rec] });
                            setMsg("Image attached — remember to Save.");
                          } catch (err) {
                            /* ⚠️ SHOW THE REAL REASON. This used to say "try a
                               smaller file" for EVERY failure. Bri, Aug 2 2026:
                               "it is not allowing me to upload any … Everything
                               is saying try a smaller file" — so she kept
                               shrinking images against a problem that was never
                               size. Uploads now need a signed-in session, and
                               store.js already returns a plain sentence saying
                               so; this catch was discarding it. */
                            setMsg((err && err.message) || "That image didn't upload. Try again, or a smaller file.");
                          }
                          setBusy(false);
                        }} />
                    </label>
                  </div>
                  {/* ⚠️ FALLS BACK TO `prompt` FOR UPLOAD/ASSIGN ITEMS. Their body
                      field is `brief`, but every upload written before Jul 28
                      stored its text in `prompt` — so this box opened EMPTY over
                      content that was plainly on screen behind it, and anything
                      typed replaced nothing. Showing the real current text means
                      an edit starts from what is actually there. */}
                  {/* ★ THE FORMATTING SHE CAN USE, SAID WHERE SHE TYPES. Bri asked
                      for line spacing, bullets and bold/underline; four marks
                      cover all of it and the class renders them. Written here
                      rather than in a help page nobody opens.
                      ⚠️ `rows` went 2 → 5. Two rows for a paragraph of class
                      content made every edit feel like typing through a letterbox
                      and hid blank lines, which are how paragraphs are made. */}
                  {field && (
                    <div style={{ fontSize: 11, color: C.sub, marginTop: 6, lineHeight: 1.5 }}>
                      Blank line = new paragraph · start a line with <code>-</code> for a bullet ·
                      <code>**bold**</code> · <code>__underline__</code>
                    </div>
                  )}
                  {field && (
                    <textarea rows={5}
                      value={it[field] || ((field === "brief" && it.prompt) ? it.prompt : "")}
                      placeholder={
                      field === "prompt" ? "The question students answer"
                        : field === "instructions" ? "How to do the activity"
                        : field === "brief" ? "What they need to submit"
                        : field === "intro" ? "The notes shown before the walkthrough areas"
                        : "Note shown with this item"}
                      onChange={(e) => setItem(si, ii, { [field]: e.target.value })}
                      style={{ ...inp, marginTop: 6, resize: "vertical", fontSize: 13 }} />
                  )}
                  {it.type === "walk" && (
                    <div style={{ marginTop: 8, borderLeft: `3px solid ${C.line}`, borderTop: `3px solid ${C.line}`, paddingLeft: 10 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em",
                        textTransform: "uppercase", color: C.sub, marginBottom: 6 }}>
                        Walkthrough areas
                      </div>
                      {areasOf(it).map((area, ai) => (
                        <div key={area.id || ai} style={{ background: C.paper, border: `1px solid ${C.line}`,
                          borderRadius: 9, padding: 10, marginBottom: 8 }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <input value={area.label || ""} placeholder="Area group (BOH, FOH…)"
                              onChange={(e) => { const v = e.target.value; setArea(si, ii, ai, { label: v }); }}
                              style={{ ...inp, flex: "1 1 140px", fontSize: 13, fontWeight: 700 }} />
                            <Btn small onClick={() => moveArea(si, ii, ai, -1)} disabled={ai === 0}>▲</Btn>
                            <Btn small onClick={() => moveArea(si, ii, ai, 1)} disabled={ai === areasOf(it).length - 1}>▼</Btn>
                            <Btn small kind="danger" onClick={() => delArea(si, ii, ai)}>Delete area</Btn>
                          </div>
                          <input value={area.note || ""} placeholder="Callout shown before this group (optional)"
                            onChange={(e) => { const v = e.target.value; setArea(si, ii, ai, { note: v }); }}
                            style={{ ...inp, marginTop: 6, fontSize: 12.5 }} />
                          {(area.rows || []).map((row, ri) => (
                            <div key={row.id || ri} style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                              <input value={row.label || ""} placeholder="Area to inspect (Back Door…)"
                                onChange={(e) => { const v = e.target.value; setWalkRow(si, ii, ai, ri, { label: v }); }}
                                style={{ ...inp, flex: "1 1 130px", fontSize: 12.5 }} />
                              <input value={row.detail || ""} placeholder="Detail under it (optional)"
                                onChange={(e) => { const v = e.target.value; setWalkRow(si, ii, ai, ri, { detail: v }); }}
                                style={{ ...inp, flex: "1 1 130px", fontSize: 12.5 }} />
                              <Btn small onClick={() => moveWalkRow(si, ii, ai, ri, -1)} disabled={ri === 0}>▲</Btn>
                              <Btn small onClick={() => moveWalkRow(si, ii, ai, ri, 1)} disabled={ri === (area.rows || []).length - 1}>▼</Btn>
                              <Btn small kind="danger" onClick={() => delWalkRow(si, ii, ai, ri)}>×</Btn>
                            </div>
                          ))}
                          <div style={{ marginTop: 6 }}>
                            <Btn small onClick={() => addWalkRow(si, ii, ai)}>+ Add a row</Btn>
                          </div>
                        </div>
                      ))}
                      <Btn small onClick={() => addArea(si, ii)}>+ Add an area group</Btn>
                      <div style={{ fontSize: 11, color: C.sub, marginTop: 8 }}>
                        Discussion question shown after the table:
                      </div>
                      <textarea rows={2} value={it.outro || ""}
                        placeholder="e.g. Let's Discuss! What risks or violations did you see?"
                        onChange={(e) => setItem(si, ii, { outro: e.target.value })}
                        style={{ ...inp, marginTop: 4, resize: "vertical", fontSize: 13 }} />
                    </div>
                  )}
                  {partsOf(it) && (
                    <div style={{ marginTop: 8, borderLeft: `3px solid ${C.line}`, borderTop: `3px solid ${C.line}`, paddingLeft: 10 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em",
                        textTransform: "uppercase", color: C.sub, marginBottom: 6 }}>
                        Parts of this assignment
                      </div>
                      {partsOf(it).map((p, pi) => (
                        <div key={pi} style={{ background: C.paper, border: `1px solid ${C.line}`,
                          borderRadius: 9, padding: 10, marginBottom: 8 }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <input value={p.label || ""} placeholder="Heading — leave blank if there's only one part"
                              onChange={(e) => { const v = e.target.value; setPart(si, ii, pi, { label: v }); }}
                              style={{ ...inp, flex: "1 1 160px", fontSize: 13, fontWeight: 700 }} />
                            <Btn small onClick={() => movePart(si, ii, pi, -1)} disabled={pi === 0}>▲</Btn>
                            <Btn small onClick={() => movePart(si, ii, pi, 1)} disabled={pi === partsOf(it).length - 1}>▼</Btn>
                            <Btn small kind="danger" onClick={() => delPart(si, ii, pi)}>Delete part</Btn>
                          </div>
                          <textarea rows={2} value={p.body || ""} placeholder="What this part asks them to do"
                            onChange={(e) => { const v = e.target.value; setPart(si, ii, pi, { body: v }); }}
                            style={{ ...inp, marginTop: 6, resize: "vertical", fontSize: 13 }} />
                          {(p.scenarios || []).map((s, k) => (
                            <div key={k} style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "flex-start" }}>
                              <textarea rows={2} value={s} placeholder={`Scenario ${k + 1}`}
                                onChange={(e) => { const v = e.target.value; setScenario(si, ii, pi, k, v); }}
                                style={{ ...inp, resize: "vertical", fontSize: 12.5 }} />
                              <Btn small kind="danger" onClick={() => delScenario(si, ii, pi, k)}>×</Btn>
                            </div>
                          ))}
                          <div style={{ marginTop: 6 }}>
                            <Btn small onClick={() => addScenario(si, ii, pi)}>+ Add a scenario</Btn>
                          </div>
                        </div>
                      ))}
                      <Btn small onClick={() => addPart(si, ii)}>+ Add a part</Btn>
                    </div>
                  )}
                  {(it.type === "assign" || it.type === "upload") && !partsOf(it) && (
                    <div style={{ marginTop: 6 }}>
                      <Btn small onClick={() => addPart(si, ii)}>+ Split into parts</Btn>
                    </div>
                  )}
                  {/* ── QUIZ: the questions, the choices, and the answer key ──
                      Bri, Aug 11 2026: "What did we determine for editing quiz
                      questions through the classes? This function will be
                      needed for a template given to other stores, but I also
                      will need it at some point for my classes in use."

                      ⚠️ EVERY RULE IS IN l101QuizEdit.js, NOT HERE. This block
                      renders and calls; it never decides. That is deliberate —
                      the decisions are the part that can mis-grade somebody, so
                      they live where they can be driven against the real course
                      content without a browser.
                      ⚠️ NOTHING HALF WRITTEN CAN BE SAVED: doSave refuses while
                      any problem stands, and the problems print under the
                      question that owns them. */}
                  {it.type === "quiz" && (
                    <div style={{ marginTop: 8, border: `1px solid ${C.line}`, borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: C.sub, marginBottom: 6 }}>
                        Questions ({(it.questions || []).length})
                      </div>

                      {(it.questions || []).map((q, qi) => {
                        const choices = q.choices || [];
                        const multi = QE.isMulti(q);
                        const putQ = (nq) => setItem(si, ii, { questions: (it.questions || []).map((x, k) => (k === qi ? nq : x)) });
                        const problems = QE.questionProblems(q, qi);
                        return (
                          <div key={qi} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 9, marginBottom: 8, background: "#fff", boxShadow: CARD_3D }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 12, fontWeight: 800, color: C.sub }}>Q{qi + 1}</span>
                              {/* ⚠️ Single vs select-all is the ONE control that can
                                  silently change how a question is graded, so it says
                                  which it is in words rather than an icon. */}
                              <select value={multi ? "multi" : "single"}
                                onChange={(e) => { const v = e.target.value; putQ(v === "multi" ? QE.toMulti(q) : QE.toSingle(q)); }}
                                style={{ ...inp, width: "auto", minWidth: 150, fontSize: 12.5, padding: "5px 8px" }}>
                                <option value="single">One right answer</option>
                                <option value="multi">Select all that apply</option>
                              </select>
                              <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                                <Btn small onClick={() => setItem(si, ii, { questions: QE.moveQuestion(it, qi, -1).questions })} disabled={qi === 0} title="Move up">↑</Btn>
                                <Btn small onClick={() => setItem(si, ii, { questions: QE.moveQuestion(it, qi, 1).questions })} disabled={qi === (it.questions || []).length - 1} title="Move down">↓</Btn>
                                <Btn small kind="danger"
                                  disabled={(it.questions || []).length <= 1}
                                  title={(it.questions || []).length <= 1 ? "A quiz needs at least one question. Delete the whole quiz instead." : "Delete this question"}
                                  onClick={() => {
                                    if (!window.confirm(`Delete question ${qi + 1}? This can't be undone.`)) return;
                                    const next = QE.removeQuestion(it, qi);
                                    setItem(si, ii, { questions: next.questions, timeLabel: next.timeLabel });
                                  }}>✕</Btn>
                              </span>
                            </div>

                            <textarea value={q.q || ""} rows={2} placeholder="What the student reads"
                              onChange={(e) => { const v = e.target.value; putQ({ ...q, q: v }); }}
                              style={{ ...inp, fontSize: 13.5, resize: "vertical", marginBottom: 6 }} />

                            {choices.map((ch, ci) => {
                              const correct = multi ? (q.answers || []).includes(ci) : q.answer === ci;
                              return (
                                <div key={ci} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                                  {/* Marking the key is the same gesture the student makes:
                                      a radio for one answer, a tick box for select-all. */}
                                  <input type={multi ? "checkbox" : "radio"} checked={correct}
                                    onChange={() => putQ(multi ? QE.toggleAnswer(q, ci) : QE.setAnswer(q, ci))}
                                    title="Mark this the correct answer" />
                                  <input value={ch} placeholder={`Choice ${ci + 1}`}
                                    onChange={(e) => { const v = e.target.value; putQ(QE.setChoice(q, ci, v)); }}
                                    style={{ ...inp, flex: "1 1 200px", fontSize: 13, padding: "6px 8px",
                                      ...(correct ? { borderColor: C.green } : {}) }} />
                                  <Btn small kind="danger"
                                    disabled={choices.length <= QE.MIN_CHOICES}
                                    title={choices.length <= QE.MIN_CHOICES ? `A question needs at least ${QE.MIN_CHOICES} choices.` : "Remove this choice"}
                                    onClick={() => putQ(QE.removeChoice(q, ci))}>✕</Btn>
                                </div>
                              );
                            })}

                            <Btn small onClick={() => putQ(QE.addChoice(q))}>+ choice</Btn>

                            {problems.length > 0 && (
                              <div style={{ marginTop: 6, fontSize: 12, color: C.red, fontWeight: 600 }}>
                                {problems.map((p, pk) => <div key={pk}>{p}</div>)}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <Btn small kind="solid" onClick={() => {
                        const next = QE.addQuestion(it);
                        setItem(si, ii, { questions: next.questions, timeLabel: next.timeLabel });
                      }}>+ Add a question</Btn>
                      <div style={{ fontSize: 11.5, color: C.sub, marginTop: 6 }}>
                        Scores already recorded keep the words the student saw, so fixing a question never changes anybody's past result.
                      </div>
                    </div>
                  )}

                  {secs.length > 1 && (
                    <select value="" onChange={(e) => moveToSec(si, ii, Number(e.target.value))}
                      style={{ ...inp, marginTop: 6, fontSize: 12.5, width: "auto", minWidth: 190 }}>
                      <option value="">Move to another section…</option>
                      {secs.map((t, ti) => ti !== si && (
                        <option key={t.id || ti} value={ti}>{t.title}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}

            <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10, marginTop: 4 }}>
              <select value="" onChange={(e) => { if (e.target.value) { addItem(si, e.target.value); e.target.value = ""; } }}
                style={{ ...inp, fontSize: 12.5, width: "auto", minWidth: 170 }}>
                <option value="">+ Add an item…</option>
                <option value="watch">Video</option>
                <option value="read">Reading</option>
                <option value="qa">Q&amp;A</option>
                <option value="assign">Assignment</option>
                <option value="quiz">Quiz</option>
                <option value="upload">Upload</option>
                <option value="walk">Walkthrough</option>
                <option value="match">Matching game</option>
              </select>
            </div>
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          <Btn onClick={addSec}>+ Add a section</Btn>
          <div style={{ flex: 1 }} />
          {stored && <Btn kind="danger" onClick={doRevert} disabled={busy}>Revert to original</Btn>}
        </div>
      </div>
    </div>
  );
}
