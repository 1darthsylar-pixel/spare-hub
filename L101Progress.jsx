import React, { useState, useEffect, useCallback, useRef } from "react";
import { kvGet, kvSet, kvGetResult, uploadDoc, signedDocUrl } from "./store.js";

/**
 * L101Progress — per-student progress for Leadership 101.
 *
 * Bri's item 5: "per student progress that I can see — videos watched, answers,
 * matching game results, quiz scores, assignments."
 *
 * ★ WHY THIS COMES BEFORE HER ITEMS 4 AND 6.
 * Prep work saved per student, and her own prep sections, both need the same
 * per-person storage underneath. Building them first would mean building this
 * three times, in three shapes that wouldn't agree.
 *
 * ★ WHAT THIS REPLACES.
 * The roster view used to render five REAL team members with INVENTED
 * completion figures. Nothing was recorded — `ld:l101:progress:{personId}` was
 * declared in a comment and never written. Anyone could have read fabricated
 * progress as fact in a promotion conversation. Now it records, and where
 * there's nothing recorded it says so.
 *
 * Storage: ld:l101:progress:<personId>
 *   { items:   { [itemId]: { done: true, at } },
 *     quizzes: { [itemId]: { score, total, at } },
 *     answers: { [itemId]: { text, at } } }
 *
 * ⚠️ ONE RECORD PER PERSON, NOT PER WEEK. Item ids are already week-prefixed
 * ("w1-watch-intro"), so one record holds everything and the roster needs a
 * single read per student rather than one per week.
 */

export const progressKey = (personId) => `ld:l101:progress:${personId}`;

const EMPTY = { items: {}, quizzes: {}, answers: {}, uploads: {}, matches: {} };

// Student coursework lives in its OWN bucket — deliberately NOT `hr-files`,
// which holds I-9s, work authorisation and doctor's notes. A leadership
// assignment and a medical document should never share an access surface.
// Private bucket; the Hub mints a short-lived signed URL to view.
export const L101_BUCKET = "l101-coursework";

export function currentPerson() {
  try {
    const u = JSON.parse(localStorage.getItem("gcfcr-access-user"));
    return u && u.id != null ? { id: String(u.id), name: u.name || "" } : null;
  } catch { return null; }
}

const shape = (raw) => ({
  items: (raw && raw.items) || {},
  quizzes: (raw && raw.quizzes) || {},
  answers: (raw && raw.answers) || {},
  uploads: (raw && raw.uploads) || {},
  matches: (raw && raw.matches) || {},
});

/**
 * Progress for the signed-in student. Returns EMPTY and `ready:false` when
 * nobody is signed in — the class is PIN-gated, but a module must never throw
 * because it rendered a moment before identity resolved.
 */
export function useProgress() {
  const person = currentPerson();
  const pid = person ? person.id : null;
  const [prog, setProg] = useState(EMPTY);
  const [ready, setReady] = useState(false);
  /* The live record, always current. Declared ABOVE the hydration effect on
     purpose — a hook that names it must sit below it (the temporal-dead-zone
     rule this class has been bitten by before). See `write` for what it fixes. */
  const progRef = useRef(EMPTY);
  // ⚠️ SET DIRECTLY ON HYDRATION, not left to the sync effect below. The effect
  // runs after the next render; a save fired in between would merge onto EMPTY
  // and wipe the student's record.
  const applyProg = (v) => { progRef.current = v; setProg(v); };
  // true = the record's read FAILED (not "new student"). Mirrored in a ref so
  // `write` (a useCallback keyed on pid) always sees the current value.
  const [loadFailed, setLoadFailedState] = useState(false);
  const loadFailedRef = useRef(false);
  const setLoadFailed = (v) => { loadFailedRef.current = v; setLoadFailedState(v); };

  useEffect(() => {
    let live = true;
    (async () => {
      if (!pid) { if (live) { applyProg(EMPTY); setReady(true); } return; }
      // ⚠️ kvGetResult: a FAILED read used to arrive as null, shape(null) is
      // EMPTY, and the ref-hydration below made the NEXT write merge onto
      // EMPTY and save — a student's quizzes, answers, uploads and completions
      // wiped by ticking one box on bad wifi. The comment on `write` warned
      // about merging onto EMPTY and fixed the scheduling cause; this was the
      // other way in.
      const r = await kvGetResult(progressKey(pid));
      if (live) {
        if (r.ok) { applyProg(shape(r.value)); setLoadFailed(false); }
        else { applyProg(EMPTY); setLoadFailed(true); }
        setReady(true);
      }
    })();
    return () => { live = false; };
  }, [pid]);

  // Every writer funnels through here so a save can never drop a sibling
  // section — read current, merge, write whole.
  /* 🐛🐛 THIS SILENTLY LOST EVERY FILE ATTACHMENT (Bri, Jul 27: "attachments are
     not saving in the prep work sections").
     It used to read:
         let next;
         setProg((cur) => { next = mutate(cur); return next; });
         await kvSet(progressKey(pid), next);
     ⚠️ A `setState` UPDATER IS NOT GUARANTEED TO RUN BEFORE THE NEXT LINE.
     React usually evaluates it eagerly — but only when no other update is
     already queued. `saveUpload` is the ONE writer that calls another setter
     first (`setBusyUpload(pid)` in the click handler), so for uploads the queue
     was never empty, the updater ran later, and `next` was still **undefined**
     when `kvSet` fired. The file reached Supabase storage and the progress
     record never learned about it.
     🔎 PROVEN, NOT INFERRED: `l101-coursework` held uploaded objects while every
     `ld:l101:progress:*` record showed `uploads: 0`.
     ✅ FIX: compute `next` HERE from a ref that always holds the latest record,
     then set state and persist the same object. Nothing depends on React's
     scheduling any more.
     ⚠️ The ref must be updated on hydration too, or the first write after load
     merges onto EMPTY and wipes the record. */
  const write = useCallback(async (mutate) => {
    if (!pid) return false;
    // A record that never loaded must never be written — that is the wipe.
    if (loadFailedRef.current) return false;
    const prev = progRef.current;
    const next = mutate(prev);
    progRef.current = next;
    setProg(next);
    /* ⚠️ kvSet reports a refused write by RETURNING FALSE, never throwing —
       the old `return true` inside the try manufactured success from failure
       and handed it to submitWeek, which then posted the Slack courtesy
       message about a submission that did not exist. On refusal the ref and
       state roll back so the screen matches what is actually stored. */
    const ok = await kvSet(progressKey(pid), next);
    if (!ok) { progRef.current = prev; setProg(prev); return false; }
    return true;
  }, [pid]);

  // ★ TITLES ARE STORED WITH THE RECORD (Jul 25). Bri asked to read each
  // student's actual answers, which means her view has to label them — and the
  // item titles live inside the week modules, which Leadership101 doesn't
  // import. Storing the title at save time avoids a content lookup entirely
  // AND survives her renaming an item later: the answer keeps the label it was
  // written under, which is the honest one.
  const markDone = useCallback((itemId, done = true, title = "") => write((p) => {
    const items = { ...p.items };
    if (done) items[itemId] = { done: true, at: new Date().toISOString(), title: title || (p.items[itemId] || {}).title || "" };
    else delete items[itemId];
    return { ...p, items };
  }), [write]);

  /* ★ WHAT THEY ACTUALLY ANSWERED (Bri, Jul 27: "I still can't see the answers
     they've given for quizzes… I'd like to see the details somewhere.").
     Until now this stored `{score,total,at,title}` and nothing else — the chosen
     option lived in QuizItem's local state and was discarded on grade. Which is
     why the three quiz records already on file can never be recovered.
     ⚠️ `responses` holds QUESTION TEXT and OPTION TEXT, never indices. An index
     stops meaning anything the moment Bri edits a question or reorders choices,
     and a stored answer that silently re-points at a different option is worse
     than no answer at all. Same reasoning as the recommendation-question
     snapshot in ProfessionalGrowth.
     ⚠️ Written only when supplied, so an older caller (or a re-grade from a
     stale bundle) can't wipe a record that already has them. */
  const saveQuiz = useCallback((itemId, score, total, title = "", responses = null) => write((p) => ({
    ...p,
    quizzes: { ...p.quizzes, [itemId]: {
      score, total, at: new Date().toISOString(), title,
      ...(Array.isArray(responses) && responses.length
        ? { responses }
        : (((p.quizzes || {})[itemId] || {}).responses ? { responses: p.quizzes[itemId].responses } : {})),
    } },
    // A graded quiz is a completed item — recording it twice would let the two
    // disagree, so completion is derived here rather than asked for separately.
    items: { ...p.items, [itemId]: { done: true, at: new Date().toISOString(), title } },
  })), [write]);

  const saveAnswer = useCallback((itemId, text, title = "") => write((p) => {
    const t = String(text || "");
    const answers = { ...p.answers };
    const items = { ...p.items };
    if (t.trim()) {
      answers[itemId] = { text: t, at: new Date().toISOString(), title };
      items[itemId] = { done: true, at: new Date().toISOString(), title };
    } else {
      // Clearing an answer un-completes it. Otherwise someone who deleted their
      // response would still read as finished.
      delete answers[itemId]; delete items[itemId];
    }
    return { ...p, answers, items };
  }), [write]);

  // ★ PARTIAL MATCHING PROGRESS (Bri, Jul 25: "If they stop halfway through, I
  // want them to have the option to come back to it with their progress saved.
  // It's a lengthy matching game so I don't want their work to disappear.")
  // Stored as { pairIndex: answer } — only CORRECT placements are ever written,
  // so a resumed game can't inherit someone's wrong guess. The bank rebuilds
  // itself from this, so a fresh shuffle on reload is harmless.
  const saveMatch = useCallback((itemId, placed, title = "", complete = false) => write((p) => ({
    ...p,
    matches: { ...p.matches, [itemId]: placed },
    // Only marks the ITEM done once every pair is matched — a half-finished
    // activity must not count as complete on their record.
    items: complete ? { ...p.items, [itemId]: { done: true, at: new Date().toISOString(), title } } : p.items,
  })), [write]);

  // Uploads the file FIRST, then records it. If the upload throws, nothing is
  // written — a progress record must never claim a file that isn't there.
  const saveUpload = useCallback(async (itemId, file, title = "") => {
    if (!pid || !file) return null;
    const safe = String(file.name || "file").replace(/[^\w.\-]+/g, "_");
    const path = `${pid}/${itemId}/${Date.now()}-${safe}`;
    const loc = await uploadDoc(L101_BUCKET, path, file);
    await write((p) => {
      const rec = { name: file.name || safe, bucket: loc.bucket, path: loc.path, at: new Date().toISOString(), title };
      return {
        ...p,
        uploads: { ...p.uploads, [itemId]: [...((p.uploads || {})[itemId] || []), rec] },
        items: { ...p.items, [itemId]: { done: true, at: rec.at, title } },
      };
    });
    return loc;
  }, [pid, write]);

  // ★ SUBMIT-TO-COMPLETE (Bri, Jul 25). Her rule, and it is the important half:
  // **the student must not be able to tick the class off themselves.** The
  // completion mark is set BY the submission, only once every item is done, and
  // it notifies her.
  // ⚠️ THE NOTIFICATION IS FIRE-AND-FORGET AND MUST NOT BLOCK THE RECORD. If
  // Slack is down, the submission still stands — a student who finished the
  // class has finished it whether or not a message got out.
  const submitWeek = useCallback(async (weekId, weekLabel) => {
    if (!pid) return false;
    const key = `submit:${weekId}`;
    await write((p) => ({
      ...p,
      items: { ...p.items, [key]: { done: true, at: new Date().toISOString(), title: `Submitted ${weekLabel}` } },
    }));
    try {
      await fetch("/api/l101-submitted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: (person && person.name) || "", personId: pid, week: weekLabel }),
      });
    } catch { /* the record is what matters; the message is a courtesy */ }
    return true;
  }, [pid, write, person]);

  return { person, prog, ready, loadFailed, markDone, saveQuiz, saveAnswer, saveUpload, saveMatch, submitWeek,
    matchOf: (id) => ((prog.matches || {})[id] || null),
    uploadsOf: (id) => ((prog.uploads || {})[id] || []),
    isDone: (id) => !!(prog.items && prog.items[id]),
    quizOf: (id) => (prog.quizzes || {})[id] || null,
    answerOf: (id) => ((prog.answers || {})[id] || {}).text || "" };
}

/* ═══ THE INSTRUCTOR OVERRIDE ═════════════════════════════════════════════
   Bri, Jul 27: "'automatic only' for students when they submit, but a 'manual
   option' for only me if I need to override that for some reason."

   Every other writer above works on the SIGNED-IN person's own record through
   `write()`. This one writes to somebody else's, so it is deliberately its own
   named function rather than a flag on an existing one — there is exactly one
   code path in this app that can mark another person complete.

   ⚠️ AN OVERRIDE IS STAMPED, NOT DISGUISED. It records `override: true` and who
   did it. The entire value of submit-to-complete is that a completed class
   means the person did the work; a manual mark that looked identical to a real
   submission would quietly dissolve that.

   ⚠️ READ-MERGE-WRITE against the LIVE record, never against anything held in a
   component — the student may be working in the class while Bri is looking at
   their row. */
export async function overrideWeekComplete(personId, weekId, weekLabel, by = "", done = true) {
  const pid = String(personId || "");
  if (!pid || !weekId) return false;
  try {
    /* ⚠️ kvGetResult: a FAILED read here used to become shape(null) = EMPTY,
       and the write below then replaced the student's whole record with just
       this one override mark — Bri marking a week complete could erase the
       week's actual work. No read, no write. */
    const r = await kvGetResult(progressKey(pid));
    if (!r.ok) return false;
    const cur = shape(r.value);
    const key = `submit:${weekId}`;
    const items = { ...cur.items };
    if (done) {
      items[key] = {
        done: true, at: new Date().toISOString(),
        title: `${weekLabel} — marked complete`, override: true, by: by || "",
      };
    } else {
      /* ⚠️ Undo removes ONLY the completion mark. Quizzes, answers and uploads
         are the student's own work and are never touched by an instructor. */
      delete items[key];
    }
    // kvSet returns false on refusal, never throws — pass that through
    // instead of manufacturing a success the caller then displays.
    return await kvSet(progressKey(pid), { ...cur, items });
  } catch { return false; }
}

/** Did the student submit this class, or did an instructor mark it? */
export function submitInfo(rec, classKey) {
  const it = rec && rec.items && rec.items[`submit:${classKey}`];
  if (!it) return null;
  return { at: it.at || null, override: !!it.override, by: it.by || "" };
}

/* ═══ PER-CLASS BREAKDOWN (Bri's "Class Progress") ════════════════════════
   She asked to see a student "W1 (checked if completed), Welcome prep work
   (drop down for specific checks), W2 (checked if completed)…" — i.e. the
   record split by CLASS, in the order the classes are taken.

   ⚠️ THE RECORD DOES NOT SAY WHICH CLASS AN ITEM BELONGS TO. It is one flat
   map of item ids. Grouping therefore needs the CLASS CONTENT — the caller
   passes `{ key, label, itemIds }` per class, read from each class's stored
   content. A prefix heuristic ("w1-…") was the tempting shortcut and is wrong:
   items Bri adds herself through the editor get ids like `it-1785…` with no
   class prefix at all, so prefix-grouping would silently drop every activity
   she authored.

   ⚠️ ANYTHING THAT MATCHES NO CLASS IS RETURNED IN `orphans`, NEVER DROPPED.
   A student's answer disappearing from her review because a content id moved
   is worse than an untidy extra row.

   ★ `opts.ignoreIds` — ITEMS OWNED BY A DIFFERENT PROGRAM (Jul 27).
   The orphan rule above was written when there was one program. With two, every
   Leadership 101 item a student had ever done landed in Trainer Orientation's
   orphan list and rendered under "Recorded, but no longer part of any class" —
   Bri's report: Orientation showing L101's progress. The mirror is just as
   wrong: without this, an L101 review would list their Orientation answers as
   strays.
   ⚠️ IGNORED IS NOT DROPPED. These ids are claimed by a class in ANOTHER
   program, so they appear in that program's review instead. Anything owned by
   nothing anywhere still surfaces as an orphan, which is the whole point. */
export function classProgress(rec, classes, opts = {}) {
  const r = shape(rec);
  const ignore = opts.ignoreIds instanceof Set
    ? opts.ignoreIds
    : new Set(Array.isArray(opts.ignoreIds) ? opts.ignoreIds : []);
  const claimed = new Set();
  const out = (classes || []).map((c) => {
    const ids = (c.itemIds || []).filter(Boolean);
    ids.forEach((id) => claimed.add(id));
    const done = ids.filter((id) => r.items[id]).length;
    const sub = submitInfo(r, c.key);
    return {
      key: c.key,
      label: c.label,
      kind: c.kind || "class",
      total: ids.length,
      done,
      submitted: !!sub,
      submittedAt: sub ? sub.at : null,
      override: !!(sub && sub.override),
      overrideBy: sub ? sub.by : "",
      /* ★ THREE STATES, AND "submitted" IS NOT THE SAME AS "every item ticked".
         A class can be fully worked and not yet submitted; that is exactly the
         person Bri wants to spot. Prep sections have no submit step at all, so
         they read complete when every task is done. */
      status: sub ? "complete"
        : (c.kind === "prep" && ids.length && done === ids.length) ? "complete"
        : done > 0 ? "in-progress" : "not-started",
      detail: detailOf({ ...r,
        items: pick(r.items, ids), quizzes: pick(r.quizzes, ids),
        answers: pick(r.answers, ids), uploads: pick(r.uploads, ids), matches: pick(r.matches, ids),
      }),
    };
  });
  const isSubmitKey = (id) => String(id).startsWith("submit:");
  const orphanIds = Object.keys(r.items).filter((id) => !claimed.has(id) && !isSubmitKey(id) && !ignore.has(id));
  return {
    classes: out,
    orphans: orphanIds.length
      ? detailOf({ ...r,
          items: pick(r.items, orphanIds), quizzes: pick(r.quizzes, orphanIds),
          answers: pick(r.answers, orphanIds), uploads: pick(r.uploads, orphanIds), matches: pick(r.matches, orphanIds),
        })
      : [],
  };
}

/* ★ DOES THIS STUDENT HAVE ANY WORK IN *THIS* PROGRAM? (Jul 27)
   `summarise().started` answers "has this person recorded anything, anywhere",
   which was the same question while there was one class. It is not any more:
   Trainer Orientation's roster listed everyone who had ever touched Leadership
   101, each with nothing of their own to show.
   ⚠️ ONE PROGRESS RECORD PER PERSON IS DELIBERATE and is not what changes here
   — the record stays shared, and this only decides whose ROW a given program
   draws. Namespacing the record per program would split one student in two. */
export function hasProgramWork(rec, classes) {
  const r = shape(rec);
  const ids = new Set();
  for (const c of (classes || [])) {
    (c.itemIds || []).forEach((id) => ids.add(id));
    if (c.key) ids.add(`submit:${c.key}`);
  }
  if (!ids.size) return false;
  for (const bucket of [r.items, r.quizzes, r.answers, r.uploads, r.matches]) {
    for (const id of Object.keys(bucket || {})) if (ids.has(id)) return true;
  }
  return false;
}

const pick = (obj, ids) => {
  const set = new Set(ids);
  const out = {};
  for (const k of Object.keys(obj || {})) if (set.has(k)) out[k] = obj[k];
  return out;
};

/* ═══ HIDDEN STUDENTS ═════════════════════════════════════════════════════
   Bri: "I want to remove them from this view, but their progress in the class
   still saved in their personal Hub account."
   ⚠️ SO THIS IS A VIEW FILTER AND NOTHING ELSE — it stores a list of ids in
   Bri's own key and never touches a progress record. Reversible by design:
   `unhideStudent` puts the row straight back, because "remove" that cannot be
   undone is a delete wearing a friendlier word. */
export const HIDDEN_KEY = "ld:l101:progress-hidden";

/* ═══ THE GROUPED TICK COUNTS ON BRI'S ROSTER ═══════════════════════════
   Bri, Jul 29 2026: "I do see the tick mark count on the roster. I would like
   to see those labeled when they populate with a total for W2-W4 (auto totaled
   if items are added or removed) and a separate count for W5/W6 with the total
   for those skills. I'd also like the ability to remove these counts from the
   roster page once they are no longer needed (but their progress on the
   personal checklist stays put)."

   ⚠️ THE TOTALS ARE DERIVED, NEVER STORED. "Auto totaled if items are added or
   removed" is the whole requirement: the denominator is counted from the course
   content at render, so editing a week's items moves every student's total on
   the next load with nothing to migrate. A stored total would be a second copy
   of the truth and would drift the first time somebody edited a checklist.

   ⚠️ A GROUP WITH NO ITEMS RENDERS NOTHING rather than "0/0". Weeks 5 and 6 may
   have no content yet, and "0/0" reads like a student who has done nothing
   instead of a group that does not exist yet. */
export const WEEK_GROUPS = [
  { id: "w24", label: "W2-W4", from: 2, to: 4 },
  { id: "w56", label: "W5-W6", from: 5, to: 6 },
];

/* Hiding the counts is Bri's own view preference and touches NO progress
   record — the same separation as HIDDEN_KEY above. Her words: "their progress
   on the personal checklist stays put". */
export const COUNTS_HIDDEN_KEY = "ld:l101:roster-counts-hidden";

export async function loadCountsHidden() {
  return (await kvGet(COUNTS_HIDDEN_KEY)) === true;
}
/* Returns the value that is actually STORED after the attempt — the caller
   renders this, so a refused write leaves the toggle showing the truth
   instead of a preference that never saved. kvSet returns false on failure,
   it never throws. */
export async function setCountsHidden(v) {
  const ok = await kvSet(COUNTS_HIDDEN_KEY, !!v);
  return ok === false ? !v : !!v;
}

/* Ticked / total per group, for one student.
   `classes` = the rows from classProgress(); `rows` = courseRows, which carries
   the week number. Joined by key because classProgress deliberately does not
   know about weeks. */
export function groupCounts(classes, rows) {
  const weekOf = new Map((rows || []).map((r) => [r.key, r.week]));
  return WEEK_GROUPS.map((g) => {
    let done = 0, total = 0;
    (classes || []).forEach((c) => {
      const w = weekOf.get(c.key);
      if (w == null || w < g.from || w > g.to) return;
      done += Number(c.done) || 0;
      total += Number(c.total) || 0;
    });
    return { id: g.id, label: g.label, done, total };
  }).filter((g) => g.total > 0);
}

export async function loadHidden(hiddenKey = HIDDEN_KEY) {
  const r = await kvGetResult(hiddenKey);
  return Array.isArray(r.value) ? r.value.map(String) : [];
}
/* Result-aware read for the MUTATORS below. kvGet returns null for a failed
   read as well as an empty one, so hide/unhide used to rebuild the whole
   list off [] — one tap on a bad connection wrote a one-id list over every
   other hidden student, and they all reappeared on Bri's roster. ok:false →
   the mutator changes nothing and returns the list unchanged, so the caller's
   setState keeps the screen matching what is really stored. */
const loadHiddenR = async (hiddenKey = HIDDEN_KEY) => {
  const r = await kvGetResult(hiddenKey);
  return { ok: r.ok, list: Array.isArray(r.value) ? r.value.map(String) : [] };
};
export async function hideStudent(personId, hiddenKey = HIDDEN_KEY) {
  const cur = await loadHiddenR(hiddenKey);
  if (!cur.ok) return cur.list;
  const id = String(personId);
  if (cur.list.includes(id)) return cur.list;
  const next = [...cur.list, id];
  if ((await kvSet(hiddenKey, next)) === false) return cur.list;
  return next;
}
export async function unhideStudent(personId, hiddenKey = HIDDEN_KEY) {
  const cur = await loadHiddenR(hiddenKey);
  if (!cur.ok) return cur.list;
  const next = cur.list.filter((x) => x !== String(personId));
  if ((await kvSet(hiddenKey, next)) === false) return cur.list;
  return next;
}

/* ═══ CLEARED FROM HER VIEW — NOT DELETED ═══════════════════════════════
   🐛 I BUILT THE WRONG THING AND IT WAS DANGEROUS (Jul 29 2026).

   Bri asked on Jul 29 for "a delete option as well as put back… sometimes I'm
   ready to completely delete once the class is done". I read "delete" literally
   and shipped a button that ERASES the person's class work. She then said
   plainly what she actually meant:

     "I don't want it to remove the class work they've completed on their
      personal Hub account, just delete from my view. They may want to review
      info or notes from the class later, but I won't always need to see that
      for myself."

   ⚠️ THE OLD BUTTON WAS LIVE ON HER SCREEN AND DID THE OPPOSITE OF THAT. One
   tap, expecting a tidier list, and a student's coursework was gone with no way
   back. Nothing about the wording would have warned her, because she had asked
   for "delete" and got exactly that word.

   ⇒ There are only ever TWO states, and neither destroys anything:
       hidden  — off the roster, listed under "removed from this view",
                 one tap to put back
       cleared — off the roster and off that list too, because she is done with
                 them and does not want to scroll past them again
   The student's record is untouched in both. Their own Hub account still shows
   every class, note and tick.

   ⚠️ NOTHING IN THIS FILE MAY DELETE A PROGRESS RECORD. If a real delete is
   ever genuinely wanted, it needs a director's explicit instruction and its own
   confirmation naming what is destroyed — not a button that sits next to
   "Put back" and reads like a tidy-up. */
export const CLEARED_KEY = "ld:l101:progress-cleared";

export async function loadCleared(clearedKey = CLEARED_KEY) {
  const r = await kvGetResult(clearedKey);
  return Array.isArray(r.value) ? r.value.map(String) : [];
}

/* Same result-aware shape as loadHiddenR, same reason. */
const loadClearedR = async (clearedKey = CLEARED_KEY) => {
  const r = await kvGetResult(clearedKey);
  return { ok: r.ok, list: Array.isArray(r.value) ? r.value.map(String) : [] };
};

export async function clearStudent(personId, clearedKey = CLEARED_KEY, hiddenKey = HIDDEN_KEY) {
  const id = String(personId);
  const cur = await loadClearedR(clearedKey);
  if (!cur.ok) return { ok: false, cleared: cur.list, hidden: await loadHidden(hiddenKey) };
  const nextCleared = cur.list.includes(id) ? cur.list : [...cur.list, id];
  const ok = (await kvSet(clearedKey, nextCleared)) !== false;
  if (!ok) return { ok: false, cleared: cur.list, hidden: await loadHidden(hiddenKey) };
  /* Also drop them from the hidden list — an id in both would show under
     "removed from this view" while being cleared from it, which is two answers
     to one question. Refuses on a failed read: rebuilding hidden off [] here
     would unhide everyone else as a side effect of clearing one person. */
  const h = await loadHiddenR(hiddenKey);
  let nextHidden = h.list;
  if (h.ok) {
    nextHidden = h.list.filter((x) => x !== id);
    if ((await kvSet(hiddenKey, nextHidden)) === false) nextHidden = h.list; /* cosmetic */
  }
  return { ok: true, cleared: nextCleared, hidden: nextHidden };
}

export async function restoreCleared(personId, clearedKey = CLEARED_KEY) {
  const id = String(personId);
  const cur = await loadClearedR(clearedKey);
  if (!cur.ok) return cur.list;
  const next = cur.list.filter((x) => x !== id);
  if ((await kvSet(clearedKey, next)) === false) return cur.list;
  return next;
}


/** Bri's view: one read per student, in parallel. */
export async function loadAllProgress(people) {
  const out = {};
  await Promise.all((people || []).map(async (p) => {
    try { out[String(p.id)] = shape(await kvGet(progressKey(p.id))); }
    catch { out[String(p.id)] = shape(null); }   // a failed read is "nothing yet", never a crash
  }));
  return out;
}

export function summarise(rec, totalItems) {
  const r = shape(rec);
  const doneCount = Object.keys(r.items).length;
  const quizzes = Object.values(r.quizzes);
  const scored = quizzes.reduce((n, q) => n + (Number(q.score) || 0), 0);
  const outOf = quizzes.reduce((n, q) => n + (Number(q.total) || 0), 0);
  return {
    doneCount,
    total: totalItems,
    pct: totalItems ? Math.round((doneCount / totalItems) * 100) : 0,
    quizCount: quizzes.length,
    quizScore: scored,
    quizOutOf: outOf,
    answered: Object.keys(r.answers).length,
    started: doneCount > 0 || quizzes.length > 0 || Object.keys(r.answers).length > 0,
  };
}

/**
 * Everything ONE student has written, ordered newest last so it reads as a
 * record of their work rather than a data dump. Bri, Jul 25: "I would like to
 * see the answers for all students — this helps me gauge what they know or have
 * learned."
 * ⚠️ THIS REVERSES AN EARLIER DELIBERATE CHOICE. Progress had shown her scores
 * only, on the reasoning that a written reflection is a different thing from a
 * completion percentage. She is the instructor and asked for it directly, which
 * is the answer — but it is worth remembering that it was a decision, not an
 * oversight, so nobody "fixes" it back the other way by accident.
 */
export function detailOf(rec) {
  const r = shape(rec);
  const label = (id, from) => (from && from.title) || (r.items[id] || {}).title || id;
  const quizzes = Object.entries(r.quizzes).map(([id, q]) => ({
    id, kind: "quiz", title: label(id, q), score: q.score, total: q.total, at: q.at,
    // null for anything graded before Jul 27 — the view says so rather than
    // rendering an empty list that reads like "they answered nothing".
    responses: Array.isArray(q.responses) && q.responses.length ? q.responses : null,
  }));
  const answers = Object.entries(r.answers).map(([id, a]) => ({
    id, kind: "answer", title: label(id, a), text: a.text, at: a.at,
  }));
  // Items with no answer and no score — videos, readings, activities.
  const uploads = Object.entries(r.uploads).map(([id, list]) => ({
    id, kind: "upload", title: label(id, (list || [])[0]),
    files: list || [], at: ((list || [])[(list || []).length - 1] || {}).at,
  }));
  const matches = Object.entries(r.matches).map(([id, m]) => ({
    id, kind: "match", title: label(id, (r.items[id] || {})),
    matched: Object.keys(m || {}).length, at: (r.items[id] || {}).at,
  }));
  const written = new Set([...Object.keys(r.quizzes), ...Object.keys(r.answers),
    ...Object.keys(r.uploads), ...Object.keys(r.matches)]);
  const done = Object.entries(r.items).filter(([id]) => !written.has(id))
    .map(([id, it]) => ({ id, kind: "done", title: label(id, it), at: it.at }));
  return [...quizzes, ...answers, ...uploads, ...matches, ...done].sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
}

/** Short-lived signed URL — the bucket is private, so nothing is ever a
 *  permanent public link. 300s matches how HR documents are opened.
 *  ⚠️ store.js routes this through /api/doc-url, so the address bar stays on
 *  gatecityhub.com. Do not call supabase directly from here. */
export async function openUpload(f) {
  try { return await signedDocUrl(f.bucket, f.path, 300); } catch { return null; }
}

/* ★ AUTHOR-SIDE UPLOAD — course CONTENT, not student work. Bri's two asks
   (Jul 29): images inside class sections, and file-drop on prep-work sections.
   Same private bucket and same signed-URL viewing path as student uploads, so
   nothing new to secure; the only difference is the path carries no person id
   because the file belongs to the course. Throws on failure — the caller shows
   the error, because a silent null here reads as "attached" when it wasn't. */
export async function uploadCourseAsset(prefix, file) {
  const safe = String(file.name || "file").replace(/[^\w.\-]+/g, "_");
  const path = `${prefix}/${Date.now()}-${safe}`;
  const loc = await uploadDoc(L101_BUCKET, path, file);
  return { name: file.name || safe, bucket: loc.bucket, path: loc.path, at: new Date().toISOString() };
}

/* ── a small shared control, so both weeks mark items the same way ────────*/
export function DoneToggle({ done, onChange, C }) {
  return (
    <button onClick={() => onChange(!done)}
      style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
        borderRadius: 8, padding: "6px 12px",
        border: `1px solid ${done ? "#86EFAC" : (C && C.line) || "#E3E7EC"}`,
        background: done ? "#DCFCE7" : "#fff",
        color: done ? "#0F766E" : (C && C.sub) || "#5B6472" }}>
      {done ? "✓ Done" : "Mark as done"}
    </button>
  );
}
