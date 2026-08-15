import React, { useState, useEffect, useMemo, useRef } from "react";
/* The one raised look and accent edge — see cardStyle.js. */
import { CARD_3D, accentEdge, cardSurface } from "./cardStyle.js";
import { kvGet, kvGetResult, kvSet, saveSubmission, listSubmissions, uploadPhoto, signedDocUrl, photoPathFrom } from "./store.js";

/* ★ ONE NAME FOR THE BUCKET. The upload, the legacy-URL normaliser and every
   minted link all have to agree about which bucket this is; a typo in any one
   of them fails silently as "no proof on file". Module level on purpose — it
   is a constant, not state. */
const PHOTO_BUCKET = "trainer-task-photos";
import { trainerTaskFallback, trainerTasksPeriodBounds } from "./trainerTaskRoster.js";

// ============================================================
// TrainerTasks.jsx — Gate City Hub
// Replaces TrainerTaskSubmit.jsx + TrainerTasksTile.jsx (both retired —
// delete those two files from the repo once this is deployed).
//
// The working roster now lives in KV (`gcfcr-trainer-roster-v1`) so it
// can be edited from the iPad. On first load it seeds from the static
// TRAINER_TASK_ROSTER (trainerTaskRoster.js), then that KV copy is the
// source of truth. Tap "Edit list" to add/remove people or tasks.
//
// The full roster is ALWAYS rendered — that's "how you view what the
// tasks are." Status badges layer on top once the daily job's output
// loads. Tap any row (outside edit mode) to open an inline photo-submit
// panel for that trainer's task — no separate screen, no name dropdown.
//
// Status source: gcfcr-trainer-tasks-v1 (written daily by worker.js's
// JOB 6). Submission source: the "submissions" table via saveSubmission/
// listSubmissions (store.js) — same table JOB 6 reads to compute status.
//
// ⚠️ JOB 6 must read `gcfcr-trainer-roster-v1` for ADDED tasks to ever
// compute a DONE/MISSING status. Until it does, a newly-added task
// submits fine and shows DONE optimistically for the session, but the
// next daily run won't know about it. Deletes are unaffected.
// ============================================================

const ROSTER_KEY = "gcfcr-trainer-roster-v1";

const C = {
  ink: "#171C26",
  sub: "#5B6472",
  paper: "#F7F4F1",
  card: "#FFFFFF",
  line: "#E8E2DC",
  green: "#1E8E5A",
  greenSoft: "#E4F3EC",
  red: "#DD0031",
  redSoft: "#FBE7EC",
  orange: "#EA580C",
  orangeDeep: "#C2410C",
};

const S = {
  page: { padding: "0 20px 60px", maxWidth: 1040, margin: "0 auto", minHeight: "100vh", background: C.paper, fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 },
  h1: { margin: 0, color: C.ink, fontSize: 19, fontWeight: 800 },
  weekLabel: { color: C.sub, fontSize: 12.5 },
  sub: { fontSize: 12.5, color: C.sub, margin: "4px 0 14px", lineHeight: 1.45 },
  toolbar: { display: "flex", justifyContent: "flex-end", marginBottom: 10 },
  editToggle: (on) => ({
    border: `1px solid ${on ? C.orange : C.line}`, background: on ? C.orange : C.card,
    color: on ? "#fff" : C.sub, fontSize: 12.5, fontWeight: 700, padding: "6px 12px",
    borderRadius: 8, cursor: "pointer",
  }),
  /* ⚠️ THE FILL NEEDS ITS OWN RADIUS (Matt, Aug 5 2026: "the status bar is
     still squared"). The track was rounded and the fill was not, so at any
     value under 100% the bar ended in a hard vertical edge inside a rounded
     shape — which reads as a rendering fault rather than a design.
     999 on both, so the radius is always half the height whatever the bar
     height becomes later. Rounding only the track is what made this look
     unfinished at exactly the place a reader looks: the end. */
  bar: { background: C.line, height: 6, borderRadius: 999, marginBottom: 16, overflow: "hidden" },
  barFill: (pct, done) => ({ width: `${pct}%`, background: done ? C.green : C.ink, height: "100%", borderRadius: 999, transition: "width 0.3s ease" }),
  /* The proof card. Accent edge in the tool's own orange so the top-left
     corner reads as lit, same as every tile on the dashboard. */
  row: { background: cardSurface(), border: `1px solid ${C.line}`, ...accentEdge(C.accent || "#C8500E", 3), borderRadius: 12, marginBottom: 0, overflow: "hidden", boxShadow: CARD_3D },
  rowHead: (editing) => ({ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: editing ? "default" : "pointer" }),
  check: (done) => ({
    width: 22, height: 22, flexShrink: 0, borderRadius: 6,
    border: `2px solid ${done ? C.green : C.line}`, background: done ? C.greenSoft : "transparent",
    display: "flex", alignItems: "center", justifyContent: "center",
  }),
  taskName: { color: C.ink, fontSize: 14.5, fontWeight: 700 },
  trainerName: { color: C.sub, fontSize: 12.5, marginTop: 1 },
  badge: (done) => ({
    fontSize: 10.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999,
    color: done ? C.green : C.red, background: done ? C.greenSoft : C.redSoft, whiteSpace: "nowrap",
  }),
  delBtn: {
    flexShrink: 0, border: `1px solid ${C.redSoft}`, background: C.redSoft, color: C.red,
    fontSize: 12, fontWeight: 800, padding: "6px 10px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap",
  },
  panel: { padding: "0 14px 16px", borderTop: `1px solid ${C.line}` },
  status: (done) => ({
    display: "flex", alignItems: "center", gap: 8, padding: "10px 0 0",
    fontSize: 13, fontWeight: 600, color: done ? C.green : C.sub,
  }),
  fileBtn: { width: "100%", border: `2px dashed ${C.line}`, borderRadius: 10, padding: "16px 12px", textAlign: "center", color: C.sub, fontSize: 13.5, cursor: "pointer", marginTop: 12, background: C.paper },
  preview: { width: "100%", borderRadius: 10, marginTop: 10, display: "block" },
  submitBtn: (disabled) => ({
    width: "100%", border: "none", borderRadius: 10, padding: "12px 16px",
    fontSize: 14, fontWeight: 700, marginTop: 12, cursor: disabled ? "default" : "pointer",
    background: disabled ? C.line : C.orange, color: disabled ? C.sub : "#fff",
  }),
  error: { color: C.red, fontSize: 12.5, marginTop: 8 },
  // add-task panel
  addWrap: { background: C.card, border: `1px dashed ${C.line}`, borderRadius: 10, padding: 14, marginBottom: 8 },
  addTitle: { color: C.ink, fontSize: 13, fontWeight: 800, marginBottom: 10 },
  input: { width: "100%", boxSizing: "border-box", border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", fontSize: 13.5, color: C.ink, marginBottom: 8, background: C.paper },
  addBtn: (disabled) => ({
    width: "100%", border: "none", borderRadius: 8, padding: "11px 16px", fontSize: 13.5, fontWeight: 700,
    cursor: disabled ? "default" : "pointer", background: disabled ? C.line : C.green, color: disabled ? C.sub : "#fff",
  }),
};

// give every roster entry a stable client-side id (render key + open tracking)
let _idSeq = 0;
const withId = (t) => ({ id: t.id || `r${Date.now()}_${_idSeq++}`, task: t.task, trainer: t.trainer });

/* Bounds for the period N periods back, reusing the single anchored definition
   in trainerTaskRoster.js rather than writing a second one — two answers to
   "which fortnight is it" is exactly the coupling that breaks quietly.
   ⚠️ STEPS BY 14 DAYS, NOT 7. Stepping a week back and asking which fortnight
   that lands in would return the SAME period half the time, so the picker would
   show every entry twice and half the history would be unreachable. */
function weekBoundsBack(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() - 14 * Math.max(0, Number(offset) || 0));
  return trainerTasksPeriodBounds(d);
}
const weekPickerLabel = (offset) => {
  const { start, end } = weekBoundsBack(offset);
  const a = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const b = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const span = `${a} – ${b}`;
  return offset === 0 ? `This fortnight · ${span}` : offset === 1 ? `Last fortnight · ${span}` : span;
};

/* ★ WEEKS GROUPED INSIDE MONTHS.
   Matt's note: "Month dropdown for past uploads — Trainer Tasks has none
   (weekly reset, so group weeks inside months)."

   Thirteen weeks in one flat list is thirteen near-identical lines reading
   "Week of Jun 15", "Week of Jun 8", "Week of Jun 1". Nobody remembers which
   Monday a thing happened on; they remember it was in June. Grouping by month
   turns "scan thirteen dates" into "pick a month, then a week".

   ⚠️ THE MONTH IS THE ONE THE WEEK STARTS IN. A week straddling the end of a
   month has to sit somewhere, and the Monday is what the label already shows —
   so a week labelled "Week of Jun 29" lands under June even though most of it
   is July. Splitting it, or listing it twice, would be more accurate and much
   harder to use.
   ⚠️ ORDER IS PRESERVED. The offsets stay 0..12 newest first inside each group,
   so nothing about what a given offset means changes. */
const weekPickerGroups = (count) => {
  const groups = [];
  for (let i = 0; i < count; i++) {
    const { start } = weekBoundsBack(i);
    const label = start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.offsets.push(i);
    else groups.push({ label, offsets: [i] });
  }
  return groups;
};

export default function TrainerTasks() {
  const [roster, setRoster] = useState(null);          // [{id, task, trainer}] or null while loading
  const [statusData, setStatusData] = useState(null);  // { weekOf, tasks: [...] } or null if not loaded yet
  const [loadError, setLoadError] = useState(null);
  const [rosterError, setRosterError] = useState(null);
  // True only when the stored roster READ failed — persistRoster refuses then.
  // A failed SAVE sets rosterError but leaves this false, so retries stay open.
  const rosterLoadFailedRef = useRef(false);
  const [editMode, setEditMode] = useState(false);
  const [openRow, setOpenRow] = useState(null);        // row id of the open submit panel
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [alreadyThisWeek, setAlreadyThisWeek] = useState({}); // { trainerName: bool }
  const [localDone, setLocalDone] = useState({});             // optimistic overrides after a fresh submit
  const [newTask, setNewTask] = useState("");
  const [newTrainer, setNewTrainer] = useState("");
  const [proofs, setProofs] = useState({});          // { taskName: { url, by, when } } — most-recent photo per task this week
  const [lightbox, setLightbox] = useState(null);    // { url, task, by } when a proof is tapped to enlarge
  /* The freshest proofs, readable from a callback without re-creating it every
     time the map changes. */
  const proofsRef = React.useRef({});
  useEffect(() => { proofsRef.current = proofs; }, [proofs]);
  /* ── PAST WEEKS ───────────────────────────────────────────────────────
   * Every proof has always been written to the `submissions` table with a
   * timestamp — the board simply never looked back, so months of photo proof
   * existed with no route to it from the UI. `weekOffset` 0 is this week, 1 is
   * last week, and so on.
   *
   * ⚠️ A PAST WEEK IS READ-ONLY. Uploading into a closed week would let someone
   * fill in a task they never did, backdated — the opposite of what proof is
   * for. Only offset 0 shows the submit control. */
  const [weekOffset, setWeekOffset] = useState(0);
  const isThisWeek = weekOffset === 0;
  const fileInputRef = useRef(null);

  // Load the daily status output
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const result = await kvGet("gcfcr-trainer-tasks-v1");
        if (alive) setStatusData(result || null);
      } catch (e) {
        if (alive) setLoadError(String(e && e.message ? e.message : e));
      }
    })();
    return () => { alive = false; };
  }, []);

  // ── Proof gallery: this week's submitted photos, keyed by task ──────
  // The "submissions" table is append-only, so a task can have several photos
  // across a week (re-submits, or two trainers on one task). We keep the MOST
  // RECENT photo per task within the current week window — that's the proof a
  // director wants to glance at. Falls to {} on any error (gallery just hides),
  // never blocks the roster. Re-fetched after each successful submit via the
  // same setter, so a fresh upload shows its thumbnail without a reload.
  const loadProofs = React.useCallback(async () => {
    try {
      const { start, end } = weekBoundsBack(weekOffset);
      const recent = await listSubmissions("trainer-tasks", 200);
      const byTask = {};
      (recent || []).forEach((s) => {
        const when = new Date(s.submitted_at);
        if (Number.isNaN(when.getTime()) || when < start || when > end) return;
        const task = s.payload && s.payload.task;
        /* ⚠️ TWO RECORD SHAPES, BOTH PERMANENT. Submissions filed before
           Jul 28 carry `photoUrl` (a full public link); ones filed after carry
           `photoPath`. `photoPathFrom` normalises either into a bucket path.
           Nothing rewrites the old records — so read both, forever. */
        const raw = s.payload && (s.payload.photoPath || s.payload.photoUrl);
        const path = photoPathFrom(raw, PHOTO_BUCKET);
        if (!task || !path) return;
        const prev = byTask[task];
        /* `assignedTo` is the stamped assignment for the week the photo belongs
           to. Submissions filed before Jul 29 2026 do not carry it, so fall back
           to submitted_by — which is who uploaded, and is the closest thing the
           old records have. Never fall back to TODAY'S roster; that is the bug. */
        const who = (s.payload && s.payload.assignedTo) || s.submitted_by;
        if (!prev || when > prev.when) byTask[task] = { path, url: "", by: who, when, stamped: !!(s.payload && s.payload.assignedTo) };
      });
      /* ★ THE VIEWING LINK IS MINTED HERE, NOT STORED. Each one is a
         short-lived handle served by the worker, so the address bar stays on
         gatecityhub.com and the link dies within minutes of being made.
         Painted in two passes on purpose: the board renders as soon as we know
         WHICH tasks have proof, and thumbnails fill in as the links arrive. */
      setProofs(byTask);
      const tasks = Object.keys(byTask);
      const urls = await Promise.all(
        tasks.map((t) => signedDocUrl(PHOTO_BUCKET, byTask[t].path, 300).catch(() => null))
      );
      const withUrls = {};
      tasks.forEach((t, i) => { withUrls[t] = { ...byTask[t], url: urls[i] || "" }; });
      setProofs(withUrls);
    } catch { setProofs({}); }
  }, [weekOffset]);

  /* A handle lasts five minutes. Leave the board open longer than that and the
     image 404s on the next paint, so one failed thumbnail re-mints just itself.
     ⚠️ Deliberately NOT a longer expiry — a short window is the whole point of
     the handle, and re-minting costs one request. `tried` stops a broken path
     from looping forever on a photo that genuinely is not there. */
  const remintProof = React.useCallback(async (task) => {
    setProofs((prev) => {
      const cur = prev[task];
      if (!cur || cur.tried) return prev;
      return { ...prev, [task]: { ...cur, tried: true } };
    });
    try {
      const p = (proofsRef.current || {})[task];
      if (!p || !p.path) return;
      const fresh = await signedDocUrl(PHOTO_BUCKET, p.path, 300);
      if (fresh) setProofs((prev) => (prev[task] ? { ...prev, [task]: { ...prev[task], url: fresh } } : prev));
    } catch {}
  }, []);
  useEffect(() => { loadProofs(); }, [loadProofs]);   // re-runs when the week changes

  // Load (or seed) the editable roster
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        /* ★★ A FAILED READ IS NOT AN EMPTY ONE, AND HERE IT COST THE ROSTER.
           🐛 This used to be `const saved = await kvGet(ROSTER_KEY)`, and
           `kvGet` returns null for BOTH "nothing stored" and "the read
           failed". So `Array.isArray(null)` was false, the else branch ran,
           and it WROTE the static seed over gcfcr-trainer-roster-v1 —
           destroying every trainer-to-task assignment. No click required:
           opening the tile on store wifi was enough. The catch below could
           never save it either, because kvGet reports failure by RETURNING
           null, not by throwing, so that branch was unreachable.
           ⇒ Seed ONLY on a read that genuinely succeeded and found nothing. */
        const r = await kvGetResult(ROSTER_KEY);
        if (!alive) return;
        if (!r.ok) {
          // Render the static roster so the week is still usable, but say so
          // on screen and NEVER write — the stored roster is still out there.
          // The ref is what persistRoster checks; the message alone gated
          // nothing, and one edit here wrote the default list over it.
          rosterLoadFailedRef.current = true;
          setRoster(trainerTaskFallback().map(withId));
          setRosterError("Couldn't load the saved roster, so this is the default list. Nothing was changed — reload before editing.");
          return;
        }
        const saved = r.value;
        if (Array.isArray(saved) && saved.length) {
          setRoster(saved.map(withId));
        } else {
          // first run — seed KV from the static roster so it exists going forward
          const seeded = trainerTaskFallback().map(withId);
          setRoster(seeded);
          // Best-effort seed — kvSet returns false rather than throw (the old
          // catch was dead); a missed seed just re-seeds on the next open.
          await kvSet(ROSTER_KEY, seeded);
        }
      } catch (e) {
        // Anything genuinely thrown (not a failed read) still renders something.
        if (alive) {
          setRoster(trainerTaskFallback().map(withId));
          setRosterError(String(e && e.message ? e.message : e));
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  const persistRoster = async (next) => {
    /* Refuse while the stored roster has never loaded — the screen is showing
       the DEFAULT list, and saving it would erase the stored assignments. */
    if (rosterLoadFailedRef.current) {
      setRosterError("The saved roster never loaded, so editing is off — a save would erase the stored assignments. Reload the tile.");
      return;
    }
    const prev = roster;
    setRoster(next);
    /* kvSet reports a refused write by RETURNING FALSE, never throwing — the
       old catch was dead code, so a refused write fell through to
       setRosterError(null) and CLEARED the banner instead of raising one. */
    const ok = await kvSet(ROSTER_KEY, next);
    if (ok === false) {
      setRoster(prev);
      setRosterError("That change did not save — check the wifi and try again.");
    } else {
      setRosterError(null);
    }
  };

  const statusByTask = useMemo(() => {
    const map = {};
    (statusData?.tasks || []).forEach((t) => { map[t.task] = t.completed; });
    return map;
  }, [statusData]);

  /* ⚠️ THE LABEL FOLLOWS THE PICKER, NOT THE CRON. `statusData.weekOf` is
     whatever the nightly job last wrote, so the masthead read "WEEK OF JUL 19"
     while the selector said "This week · Jul 27" — the two disagreeing on screen
     is worse than neither being shown. */
  const weekLabel = weekBoundsBack(weekOffset).start
    .toLocaleDateString("en-US", { month: "short", day: "numeric" });

  /* ★ DONE COMES FROM THE SELECTED WEEK'S PHOTOS, not from `statusByTask`.
     `statusData` is a single snapshot of the CURRENT week written by the daily
     job, so before this every past week rendered this week's DONE/MISSING —
     the picker changed the thumbnail and nothing else, which is a worse lie
     than showing no history at all. `proofs` is already filtered to the chosen
     week, so it is the right source for every week including this one. */
  /* ⚠️ THE CRON SNAPSHOT GOES STALE AT THE WEEK BOUNDARY. `statusData` is
     rewritten by the nightly job, so on a Monday morning it still describes
     LAST week — and a proof submitted Sunday (which belongs to the previous
     week) kept the card green into the new week. The board must reset itself at
     midnight Monday, not whenever the job next runs. So the snapshot is only
     trusted when it actually claims the week being shown. */
  const statusIsCurrent = (() => {
    if (!statusData || !statusData.weekOf) return false;
    const snap = new Date(statusData.weekOf);
    if (Number.isNaN(snap.getTime())) return false;
    const { start } = weekBoundsBack(weekOffset);
    return snap.toDateString() === start.toDateString();
  })();

  /* ★ THE PHOTO IS THE ONLY SOURCE OF TRUTH. `statusByTask` is a nightly cron
     snapshot and it kept a task green into a new week twice — first because it
     was stale, then because guarding it on the week still wasn't enough. This
     is a PROOF board: a task is done when a photo exists in the week being
     shown, and `proofs` is already filtered to exactly that. One source cannot
     disagree with itself. `statusData` is left loaded for the header only. */
  const isDone = (task, trainer) => {
    if (isThisWeek && localDone[trainer]) return true;          // optimistic, until the reload
    return !!(proofs && proofs[task]);
  };

  const list = roster || [];
  const doneCount = list.filter((t) => isDone(t.task, t.trainer)).length;
  const total = list.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  const toggleRow = async (row) => {
    if (editMode) return; // no submit panel while editing the list
    if (openRow === row.id) { setOpenRow(null); return; }
    setOpenRow(row.id);
    setFile(null);
    setPreviewUrl(null);
    setSubmitError(null);
    if (!(row.trainer in alreadyThisWeek)) {
      const { start, end } = trainerTasksPeriodBounds();
      const recent = await listSubmissions("trainer-tasks", 100);
      const done = recent.some((s) => {
        const t = new Date(s.submitted_at);
        return s.submitted_by === row.trainer && t >= start && t <= end;
      });
      setAlreadyThisWeek((prev) => ({ ...prev, [row.trainer]: done }));
    }
  };

  const handleFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setFile(f);
    setSubmitError(null);
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result);
    reader.readAsDataURL(f);
  };

  const submit = async (task, trainer) => {
    if (!file) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const path = `${trainer.replace(/\s+/g, "_")}/${Date.now()}-${file.name}`;
      /* Stores the PATH now, not a public link — see uploadPhoto in store.js.
         The field is `photoPath` so a record's shape says plainly which era it
         is from; readers accept both. */
      const photoPath = await uploadPhoto(PHOTO_BUCKET, path, file);
      if (!photoPath) {
        setSubmitError("Photo upload failed — check your connection and try again.");
        setSubmitting(false);
        return;
      }
      /* ★ STAMP WHO THIS TASK WAS ASSIGNED TO, AND FOR WHICH WEEK.
         🐛 A past week showed TODAY'S task→trainer pairings. The roster rotates,
         so the rows are rebuilt from the CURRENT assignment every time — open
         last week and a photo Jamar took appears under whoever holds that task
         now. The history looked like a record and was actually a live view with
         old photos hung on it.
         ⚠️ NOTHING CAN FIX THE SUBMISSIONS ALREADY FILED. They never recorded
         the assignment, so their week is unrecoverable — `submitted_by` says who
         uploaded, which is usually but not always the assignee. This stamps it
         from here on; older weeks stay approximate and that cannot be undone by
         reading harder.
         ⚠️ `weekOf` as well as the name. The submitted_at timestamp already
         implies the week, but only if the reader applies the same Monday
         boundary — and that boundary lives in trainerTaskRoster.js, which has
         been changed before. Storing it removes the coupling. */
      const { start: wkStart } = weekBoundsBack(0);
      const weekOf = `${wkStart.getFullYear()}-${String(wkStart.getMonth() + 1).padStart(2, "0")}-${String(wkStart.getDate()).padStart(2, "0")}`;
      const ok = await saveSubmission("trainer-tasks", trainer, { task, photoPath, assignedTo: trainer, weekOf });
      if (!ok) {
        setSubmitError("Submission failed to save — try again.");
        setSubmitting(false);
        return;
      }
      setLocalDone((prev) => ({ ...prev, [trainer]: true }));
      setAlreadyThisWeek((prev) => ({ ...prev, [trainer]: true }));
      setFile(null);
      setPreviewUrl(null);
      setOpenRow(null);
    } catch (e) {
      setSubmitError(String(e && e.message ? e.message : e));
    }
    setSubmitting(false);
  };

  const addRow = () => {
    const task = newTask.trim();
    const trainer = newTrainer.trim();
    if (!task || !trainer) return;
    persistRoster([...(roster || []), withId({ task, trainer })]);
    setNewTask("");
    setNewTrainer("");
  };

  const removeRow = (id) => {
    if (openRow === id) setOpenRow(null);
    persistRoster((roster || []).filter((r) => r.id !== id));
  };

  return (
    <div style={S.page}>
      <style>{`.tt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;}`}</style>

      {/* Masthead — proof board */}
      <div style={{ margin: "0 -20px 16px", background: "linear-gradient(120deg,#EA580C 0%,#C2410C 55%)", color: "#fff", padding: "18px 20px 20px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, letterSpacing: "0.14em", color: "#FFE0CC", fontWeight: 600, marginBottom: 6 }}>TRAINER TASKS{weekLabel ? ` · WEEK OF ${String(weekLabel).toUpperCase()}` : ""}</div>
            <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>Proof Board</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 10, letterSpacing: "0.1em", color: "#FFD3B8", fontWeight: 600 }}>COMPLETE</div>
            <div style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 27, fontWeight: 700, lineHeight: 1.1 }}>{doneCount}<span style={{ color: "#F3A87C" }}>/{total}</span></div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
          <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,.25)", borderRadius: 5, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "#fff", borderRadius: 5, transition: "width .3s ease" }} />
          </div>
          {/* ★ Past weeks. 12 back is a quarter — enough to answer "was this
              ever done" without pulling a year of rows into one query. */}
          <select
            value={weekOffset}
            onChange={(e) => { setWeekOffset(Number(e.target.value)); setOpenRow(null); setEditMode(false); }}
            style={{ border: "1px solid rgba(255,255,255,.35)", background: "rgba(255,255,255,.12)", color: "#fff", fontSize: 12.5, fontWeight: 700, padding: "7px 11px", borderRadius: 8, whiteSpace: "nowrap", maxWidth: 190 }}
          >
            {weekPickerGroups(13).map((g) => (
              <optgroup key={g.label} label={g.label} style={{ color: "#111" }}>
                {g.offsets.map((i) => (
                  <option key={i} value={i} style={{ color: "#111" }}>{weekPickerLabel(i)}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            style={{ border: "1px solid rgba(255,255,255,.35)", background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 12.5, fontWeight: 700, padding: "7px 13px", borderRadius: 8, cursor: roster === null || !isThisWeek ? "default" : "pointer", whiteSpace: "nowrap", opacity: roster === null || !isThisWeek ? 0.6 : 1 }}
            onClick={() => { setEditMode((v) => !v); setOpenRow(null); }}
            disabled={roster === null || !isThisWeek}
          >
            {editMode ? "Done editing" : "Edit list"}
          </button>
        </div>
      </div>

      {!isThisWeek && (
        /* ⚠️ Says WHY it's read-only, not just that it is. Someone looking at a
           past week and finding no upload button will otherwise assume it's
           broken and report it. */
        <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", color: "#9A3412", borderRadius: 12, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
          Viewing a past week — photos only. Proof can't be added to a week that's already closed.
        </div>
      )}

      <p style={S.sub}>
        Every cleaning task and who's assigned it, due once a fortnight. Tap your card to submit a photo.
      </p>

      {loadError && (
        <div style={{ ...S.error, marginBottom: 10 }}>
          Status couldn't load ({loadError}) — the list below is still accurate, just without live checkmarks.
        </div>
      )}
      {rosterError && (
        <div style={{ ...S.error, marginBottom: 10 }}>{rosterError}</div>
      )}

      {roster === null ? (
        <div style={{ ...S.sub, textAlign: "center", padding: "24px 0" }}>Loading roster…</div>
      ) : (
        <>
          {editMode && (
            <div style={S.addWrap}>
              <div style={S.addTitle}>Add a task</div>
              <input
                style={S.input}
                placeholder="Task name (e.g. FOH Fridges)"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
              />
              <input
                style={S.input}
                placeholder="Assigned to (person's name)"
                value={newTrainer}
                onChange={(e) => setNewTrainer(e.target.value)}
              />
              <button
                style={S.addBtn(!newTask.trim() || !newTrainer.trim())}
                disabled={!newTask.trim() || !newTrainer.trim()}
                onClick={addRow}
              >
                Add to list
              </button>
            </div>
          )}

          <div className="tt-grid">{list.map((t) => {
            const done = isDone(t.task, t.trainer);
            const open = openRow === t.id;
            return (
              <div key={t.id} style={S.row}>
                {!editMode && (
                  <div style={done
                    ? { background: C.greenSoft, padding: "8px 14px", display: "flex", alignItems: "center", gap: 8 }
                    : { background: "repeating-linear-gradient(135deg,#FDF1E7,#FDF1E7 12px,#F8E7D6 12px,#F8E7D6 24px)", padding: "9px 14px", display: "flex", alignItems: "center", gap: 8 }
                  }>
                    <span style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.05em", color: done ? C.green : "#B0703F" }}>
                      {done ? "✓ PROOF SUBMITTED" : "📷 AWAITING PROOF"}
                    </span>
                    {done && proofs[t.task] && proofs[t.task].url && (
                      <img
                        src={proofs[t.task].url}
                        alt={`Proof for ${t.task}`}
                        onError={() => remintProof(t.task)}
                        onClick={(e) => { e.stopPropagation(); setLightbox({ url: proofs[t.task].url, task: t.task, by: proofs[t.task].by }); }}
                        style={{ marginLeft: "auto", width: 34, height: 34, objectFit: "cover", borderRadius: 6, border: `1.5px solid ${C.green}`, cursor: "zoom-in", flexShrink: 0 }}
                      />
                    )}
                  </div>
                )}
                <div style={S.rowHead(editMode)} onClick={() => toggleRow(t)}>
                  {!editMode && (
                    <div style={S.check(done)}>{done && <span style={{ color: C.green, fontSize: 13, fontWeight: 700 }}>✓</span>}</div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={S.taskName}>{t.task}</div>
                    <div style={S.trainerName}>{t.trainer}</div>
                  </div>
                  {editMode ? (
                    <button
                      style={S.delBtn}
                      onClick={(e) => { e.stopPropagation(); removeRow(t.id); }}
                    >
                      Remove
                    </button>
                  ) : (
                    <span style={S.badge(done)}>{done ? "DONE" : "MISSING"}</span>
                  )}
                </div>

                {open && !editMode && isThisWeek && (
                  <div style={S.panel}>
                    {alreadyThisWeek[t.trainer] ? (
                      <div style={S.status(true)}>✓ Already submitted this fortnight</div>
                    ) : (
                      <div style={S.status(false)}>Not yet submitted this fortnight</div>
                    )}

                    <button
                      type="button"
                      style={S.fileBtn}
                      onClick={() => fileInputRef.current && fileInputRef.current.click()}
                    >
                      {file ? "Change photo" : "📷 Take or choose a photo"}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFile}
                      style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
                    />

                    {previewUrl && <img src={previewUrl} alt="Preview" style={S.preview} />}
                    {submitError && <div style={S.error}>{submitError}</div>}

                    <button
                      style={S.submitBtn(!file || submitting)}
                      disabled={!file || submitting}
                      onClick={() => submit(t.task, t.trainer)}
                    >
                      {submitting ? "Submitting…" : "Submit"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}</div>

          {list.length === 0 && (
            <div style={{ ...S.sub, textAlign: "center", padding: "20px 0" }}>
              No tasks yet. Tap “Edit list” to add one.
            </div>
          )}
        </>
      )}

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(19,17,15,0.82)", zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, cursor: "zoom-out" }}
        >
          <img src={lightbox.url} alt={`Proof for ${lightbox.task}`} style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: 10, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }} />
          <div style={{ marginTop: 12, color: "#fff", textAlign: "center", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace" }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{lightbox.task}</div>
            {lightbox.by && <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{lightbox.by}</div>}
            <div style={{ fontSize: 10.5, opacity: 0.55, marginTop: 8 }}>tap anywhere to close</div>
          </div>
        </div>
      )}
    </div>
  );
}
