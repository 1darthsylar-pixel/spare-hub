import React, { useState, useEffect, useMemo } from "react";
/* The shared raised look and accent edge — see cardStyle.js. */
import { CARD_3D, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { kvGet, kvSet, kvGetResult, hubToken, saveSubmission, listSubmissions } from "./store.js";
import { isAdminSlackId, adminNames } from "./storeConfig.js";
import { TEAM_TOOL_ADMIN_ROLES } from "./adminRoles.js";
/* ★ THE WINDOW RULE AND THE OWES-A-GOAL RULE MOVED TO A LEAF (Aug 10 2026).
   App.jsx needs `goalsOwed` for Bri's alert trail and must not import this file
   to get it — that would pull the whole tile into the home screen's first
   paint. Re-exported below so MemberVote, which imports SUB_KEY, monthOf and
   windowState from here, does not change at all. One definition, new address. */
import { SUB_KEY, monthOf, targetMonth, monthWindow, windowState, WINDOW_DEFAULTS, goalsOwed }
  from "./goalsWindow.js";
export { SUB_KEY, monthOf, targetMonth, monthWindow, windowState, goalsOwed };

/**
 * GoalSubmissions — "Submissions (AD Only)", replacing Bri's Google Form.
 *
 * Bri's spec (Jul 24): ADs submit one entry per team per month. Bri, HR and the
 * Executive Directors review, and either approve or send it back with feedback
 * for the AD to revise. Approved nominees are what the Vote form draws on.
 *
 * FOUR THINGS THAT ARE HERS, NOT CODE — she changes all of these in the Hub
 * with no deploy:
 *   • every question's wording, order, whether it's required, and whether it
 *     exists at all
 *   • the window: the recurring rule, the times, and a manual override
 *   • nothing here is hardcoded to a team — teams come from Meet Our Teams
 *
 * THE WINDOW IS JUDGED AT RENDER, never by a job. `isOpen()` compares now
 * against a window computed from the rule, so the form opens and closes on its
 * own with nothing scheduled anywhere. Only reminders would need a worker.
 *
 * Storage: gc-goal-submissions-v1. Teams: gc-team-directory-v1 (read-only).
 */

// Append-only ATTEMPT LOG, written to the submissions table (one INSERT per
// attempt) rather than into SUB_KEY's single shared object. No read-modify-
// write, so it can never be clobbered the way the entries were on Jul 31 — it
// is the durable answer to "did this person actually try to submit?".
const ATTEMPT_TOOL = "goal-submission-attempt";
const DIR_KEY = "gc-team-directory-v1";
const USER_KEY = "gcfcr-access-user";

/* ── access ──────────────────────────────────────────────────────────────
   Same gate shape as TeamGoals and TeamDirectory: Slack ID first (IDs never
   change, display names do), then a name allowlist, then roles. Fails closed. */
/* ⚠️ WAS A HARDCODED Set OF THIS STORE'S PEOPLE, and this is the gate that
   decides who marks a goal met. Read at CALL time, never captured. */
/* Who gets the new-submission DM. Bri, Jul 31: "Please notify me when there
   is a new submission on Submissions (AD Only)". DM only fires AFTER the
   write really lands, so a ping can never point at an entry that failed to
   save. Listed under Bri in TERMINATION-CHECKLIST.md. */
/* ★ SUBMIT_NOTIFY_ID IS GONE (Aug 7 2026, clone work). This tile used to post a Gate
   City Slack id and the Worker took it on trust. It now sends
   { to: "leadership" } and the Worker resolves the recipient from
   gcfcr-notify-targets-v1 — the same config every scheduled job reads.
   ⚠️ DO NOT PUT AN ID BACK HERE. Change who gets this in the notify-targets
   config, which takes effect without a deploy. An id in this file is a
   second store DMing one of ours, and a page choosing its own recipient. */

/* ★ THE FIVE ADMINS NOW COME FROM storeConfig.js, WHICH IS THE ONLY COPY.
   The fifth tile carrying this exact block. Same five ids, fifth name for
   them. The mechanism is unchanged — id first, name second, role last — and
   the name and role fallbacks below are NOT duplicates between tiles, so
   they stay here. */
/* ⚠️ "director" ADDED Aug 7 2026. Matt, asked directly whether a plain
   Director should administer this tile and the three beside it: "yes".
   It had been open since the demerit thread.
   ⚠️ EXACT MATCH, so this admits the title "Director" ONLY. "Assistant
   Director" is a different string and still does not pass — that line is
   unchanged and was not part of the question.
   ⚠️ THIS TILE ONLY, plus TeamGoals, GoalSubmissions and TeamResources.
   ProfessionalGrowth carries a byte-identical role set and was deliberately
   NOT widened: it was not one of the four, and quietly changing a fifth tile
   because its list looked the same is how a permission spreads unasked. */
/* ★ THE LIST NOW LIVES IN adminRoles.js — TEAM_TOOL_ADMIN_ROLES.
   the five team tools share one list so they cannot drift apart
   ⚠️ ONLY THE DECLARATION MOVED. Every use of REVIEW_ROLES below is
   byte-for-byte what it was, including this file's own role normaliser,
   which is NOT the same function in every tile. */
const REVIEW_ROLES = new Set(TEAM_TOOL_ADMIN_ROLES);
// Bri said "ADs only". Directors and up are included because they cover for an
// AD, and every reviewer outranks them anyway — excluding them would mean a
// Director could approve an entry they were not allowed to write.
const SUBMIT_ROLES = new Set([
  "Assistant Director", "Manager", "Director", "Leadership Development Director",
  "Leadership Director", "Executive Director", "Executive", "Human Resources", "Owner",
]);

const norm = (s) => (s || "").trim().toLowerCase();
function getViewer() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }
const canReview = (v) => !!v && ((v.slackId && isAdminSlackId(v.slackId)) || adminNames("goalSubmissions").includes(norm(v.name)) || REVIEW_ROLES.has(norm(v.role)));
const canSubmit = (v) => !!v && (SUBMIT_ROLES.has(v.role) || canReview(v));


const fmtDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtTime = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/* ── defaults ────────────────────────────────────────────────────────────
   BRI'S OWN QUESTIONS, verbatim from her Slack message of Jul 24 14:45 —
   wording, order, required flags and the three choices on Q2 are all hers, not
   invented. She can still change any of it in Settings without a deploy; this
   is the starting state, not a placeholder. */
const SEED_QUESTIONS = [
  { id: "q_team", text: "Team Name", kind: "team", required: true, fixed: true },
  { id: "q_prev", text: "Did you meet your goal for the previous month?", kind: "choice", required: true,
    options: [
      "Accomplished (goal met)",
      "Unmet (insufficient progress was made for this goal)",
      "In Progress (sufficient progress was made, goal is close to accomplished)",
    ] },
  { id: "q_hindered", text: "If this is an 'Unmet' goal (not near accomplishment) share what hindered accomplishing this goal and how you can adjust your goal to make it more attainable.", kind: "text", required: false },
  { id: "q_goal", text: "What is your team goal for this month?", kind: "text", required: true,
    help: "Remember:\nIt must be SMART — Specific, Measurable, Achievable, Relevant, and Time-Bound.\nIf your goal is In Progress from last month, you may submit this goal again to finish the work you've started!\nIf your goal was Unmet, please re-evaluate the goal and you may choose to set a new goal or rework your previous goal based on what hindered progress throughout the past month." },
  { id: "q_nom", text: "Who was your 'Team Player of the Month'? This is your nomination for Team Member of the Month!", kind: "nominee", required: true, fixed: true },
  { id: "q_nomwhy", text: "Why does this Team Member deserve to be nominated for Team Member of the Month?", kind: "text", required: true },
  { id: "q_notes", text: "If you have any questions, concerns, or additional Team Member shout outs, share here!", kind: "text", required: false },
];
const DEFAULTS = {
  version: 1,
  questions: SEED_QUESTIONS,
  window: { ...WINDOW_DEFAULTS },
  entries: [],
};

function hydrate(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  return {
    version: 1,
    questions: Array.isArray(d.questions) && d.questions.length ? d.questions : DEFAULTS.questions,
    window: { ...DEFAULTS.window, ...(d.window || {}) },
    entries: Array.isArray(d.entries) ? d.entries : [],
  };
}

/* ── ui atoms ────────────────────────────────────────────────────────────*/

// 🐛 Bri, Jul 24: "I did attempt to change the days but there is a 1 locked in
// place. It will not delete and any numbers added go behind the 1."
// CAUSE: the old input clamped on EVERY KEYSTROKE. Clearing the box made
// e.target.value "" and `Number("") || 1` snapped it straight back to 1, so the
// field could never be emptied to type a different number — anything typed
// landed after that stubborn 1.
// FIX: hold a free-text DRAFT while she's typing and only clamp on blur or
// Enter. Defined at MODULE scope on purpose — declared inside the parent it
// would remount on every keystroke and lose focus after one character.
// EXPORTED because the Vote form has the identical field; one definition.
export function DayCount({ value, min = 1, max = 28, onCommit, style }) {
  const [draft, setDraft] = useState(String(value ?? ""));
  const [editing, setEditing] = useState(false);
  // Follow the stored value when someone ELSE changes it, but never yank the
  // box out from under the person currently typing in it.
  useEffect(() => { if (!editing) setDraft(String(value ?? "")); }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const raw = String(draft).trim();
    const n = Number(raw);
    // Left blank or nonsense → put the previous value back rather than guessing.
    if (raw === "" || !isFinite(n)) { setDraft(String(value ?? "")); return; }
    onCommit(Math.max(min, Math.min(max, Math.round(n))));
  };
  return (
    <input type="number" inputMode="numeric" min={min} max={max} value={draft}
      onFocus={() => setEditing(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={style} />
  );
}
const FONT = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
const C = { paper: "#F6F4EF", ink: "#14243D", sub: "#5b6b82", line: "#E7E2D8",
  red: "#E51636", navy: "#13293F", green: "#0F766E", amber: "#B45309", amberBg: "#FEF3C7" };

function Btn({ children, onClick, kind = "ghost", small, disabled }) {
  const solid = kind === "solid";
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ fontFamily: FONT, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1, borderRadius: 9, border: `1px solid ${solid ? C.navy : C.line}`,
        background: solid ? C.navy : "#fff", color: solid ? "#fff" : C.ink,
        fontSize: small ? 12.5 : 14, padding: small ? "5px 11px" : "9px 16px" }}>
      {children}
    </button>
  );
}
const inp = { fontFamily: FONT, fontSize: 14, padding: "9px 11px", borderRadius: 9,
  border: `1px solid ${C.line}`, background: "#fff", color: C.ink, width: "100%", boxSizing: "border-box" };

function Pill({ tone, children }) {
  const map = { pending: [C.amberBg, C.amber], approved: ["#DCFCE7", C.green], returned: ["#FEE2E2", C.red] };
  const [bg, fg] = map[tone] || ["#EEF2F7", C.sub];
  return <span style={{ background: bg, color: fg, fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em",
    textTransform: "uppercase", borderRadius: 6, padding: "2px 7px" }}>{children}</span>;
}

/* ── component ───────────────────────────────────────────────────────────*/
export default function GoalSubmissions({ onBack }) {
  const [data, setData] = useState(null);
  // true = the submissions read FAILED — every write path refuses until reopen.
  const [loadFailed, setLoadFailed] = useState(false);
  const [teams, setTeams] = useState([]);
  const [view, setView] = useState("form");     // form | review | settings
  const [answers, setAnswers] = useState({});
  const [teamId, setTeamId] = useState("");
  const [nominee, setNominee] = useState("");
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(new Date());
  const [attempts, setAttempts] = useState([]); // reviewer's append-only attempt log

  const viewer = getViewer();
  const mayReview = canReview(viewer);
  const maySubmit = canSubmit(viewer);

  useEffect(() => { (async () => {
    /* ⚠️ kvGetResult for the submissions record: a FAILED read used to arrive
       as null, hydrate(null) rendered a fresh window, and the next submit or
       review then wrote that emptiness over every team's nominations and the
       window state. DIR_KEY stays plain — teams are display-only here. */
    const [subR, dir] = await Promise.all([
      kvGetResult(SUB_KEY).catch(() => ({ ok: false, value: null })),
      kvGet(DIR_KEY).catch(() => null),
    ]);
    if (!subR.ok) setLoadFailed(true);
    setData(hydrate(subR.ok ? subR.value : null));
    setTeams((dir && Array.isArray(dir.teams)) ? dir.teams : []);
  })(); }, []);

  // The window closes while somebody is sitting on the page at 11:59pm on the
  // last of the month. Re-tick so the form locks itself rather than accepting a
  // submission a minute after it should have stopped.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // The reviewer's attempt log — every submit that was tried, including ones
  // the entries record lost. Append-only, so it survives a clobber and answers
  // "did they actually try?" straight from the data.
  useEffect(() => {
    if (!mayReview) return;
    let alive = true;
    (async () => {
      const list = await listSubmissions(ATTEMPT_TOOL, 100).catch(() => []);
      if (alive) setAttempts(Array.isArray(list) ? list : []);
    })();
    return () => { alive = false; };
  }, [mayReview]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2400); };

  /* ⚠️ EVERY write goes through here, and it RE-READS the freshest record
     first, then applies the change to THAT — never to the copy this page
     loaded at open. Aug 1 2026: this whole record (every AD's entries plus the
     shared questions and window) lives in ONE object, and the old code wrote
     the whole object back from the mount-time copy. Two ADs on two iPads each
     appended to their own stale copy and the later save wiped the earlier one
     — three leaders' submissions vanished Jul 31 (Bri's report). Re-reading
     before every write closes that for submits, reviews AND question edits.
     `patch(fresh)` returns the next record, or null to abort with no write.
     A failed re-read REFUSES rather than falling back to the stale copy —
     writing the old copy is exactly the clobber this exists to stop. */
  const persistPatch = async (patch) => {
    if (loadFailed) { flash("Not saved — the record never loaded. Close and reopen."); return false; }
    const r = await kvGetResult(SUB_KEY);
    if (!r.ok || !r.value || typeof r.value !== "object") { flash("Couldn't reach the latest — try again."); return false; }
    const next = patch(r.value);
    if (!next) return false;
    const prev = data;
    setData(next);
    if (!(await kvSet(SUB_KEY, next))) { setData(prev); flash("Save failed — nothing recorded. Try again."); return false; }
    return true;
  };

  const month = useMemo(() => targetMonth(now), [now]);
  const win = useMemo(() => (data ? windowState(data.window, now) : null), [data, now]);

  // A team's Trainers and Team Members — Bri's spec for who may be nominated.
  // Leaders are excluded on purpose: this is Team PLAYER of the month.
  const nomineeOptions = useMemo(() => {
    const t = teams.find((x) => x.id === teamId);
    if (!t || !Array.isArray(t.people)) return [];
    return t.people.filter((p) => (p.tier === "trainer" || p.tier === "member") && p.name)
      .map((p) => p.name);
  }, [teams, teamId]);

  // Entries this person wrote, so an AD sees their own history and — the part
  // Bri asked for — is TOLD when something has been sent back to them.
  const mine = useMemo(() => {
    if (!data || !viewer) return [];
    return data.entries.filter((e) => String(e.byId) === String(viewer.id));
  }, [data, viewer]);
  const returnedToMe = mine.filter((e) => e.status === "returned" && e.monthKey === month.key);

  if (!data) return <div style={{ fontFamily: FONT, padding: 40, color: C.sub }}>Loading submissions…</div>;

  if (!maySubmit && !mayReview) {
    return (
      <div style={{ fontFamily: FONT, background: C.paper, minHeight: "60vh", padding: 40, textAlign: "center", color: C.sub }}>
        {onBack && <div><Btn small onClick={onBack}>← Back</Btn></div>}
        <div style={{ marginTop: 24, fontWeight: 800, fontSize: 17, color: C.ink }}>Assistant Directors only</div>
        <div style={{ fontSize: 14, marginTop: 6 }}>This form is completed by Assistant Directors.</div>
      </div>
    );
  }

  const questions = data.questions;
  const teamOf = (id) => teams.find((t) => t.id === id);

  /* ── submit ──────────────────────────────────────────────────────────── */
  const submit = () => {
    setErr("");
    if (!win.open) { setErr("The submission window is closed."); return; }
    if (!teamId) { setErr("Pick a team."); return; }
    for (const q of questions) {
      if (!q.required) continue;
      if (q.kind === "team" && !teamId) { setErr(`"${q.text}" is required.`); return; }
      else if (q.kind === "nominee" && !nominee) { setErr(`"${q.text}" is required.`); return; }
      else if ((q.kind === "text" || q.kind === "choice") && !String(answers[q.id] || "").trim()) { setErr(`"${q.text}" is required.`); return; }
    }
    // The entry is BUILT here but merged against the FRESHEST record inside
    // persistPatch, so it can never overwrite another AD who submitted while
    // this form was open. `prior` (one entry per team per month) is recomputed
    // from the fresh copy there, so a revision replaces the real current row.
    let built = null;
    (async () => {
      // Durable ATTEMPT LOG. One append-only INSERT, fired BEFORE the entry
      // save, so even if that save is refused or a race drops the entry there
      // is proof this AD tried. Best effort — the log never blocks a submission.
      saveSubmission(ATTEMPT_TOOL, viewer ? viewer.name : "", {
        teamId, teamName: (teamOf(teamId) || {}).name || "",
        monthKey: month.key, monthLabel: month.label,
        nominee, byId: viewer ? viewer.id : null, byName: viewer ? viewer.name : "",
        at: new Date().toISOString(),
      }).catch(() => {});
      const ok = await persistPatch((base) => {
        const be = Array.isArray(base.entries) ? base.entries : [];
        const prior = be.find((e) => e.monthKey === month.key && e.teamId === teamId);
        if (prior && prior.status === "approved") { setErr("This team's entry for that month is already approved. Refresh to see it."); return null; }
        const entry = {
          id: prior ? prior.id : `s_${Date.now()}`,
          monthKey: month.key, monthLabel: month.label,
          teamId, teamName: (teamOf(teamId) || {}).name || "",
          nominee, answers: { ...answers },
          status: "pending", feedback: "",
          byId: viewer ? viewer.id : null, byName: viewer ? viewer.name : "",
          at: new Date().toISOString(),
          revisedFrom: prior && prior.status === "returned" ? prior.at : null,
        };
        built = entry;
        const entries = prior ? be.map((e) => (e.id === prior.id ? entry : e)) : [...be, entry];
        return { ...base, entries };
      });
      if (!ok || !built) return;
      // Best-effort DM to the reviewer, AFTER the write landed. The queue
      // itself is the source of truth; a missed ping costs a refresh, never
      // a submission.
      fetch("/api/slack-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
        body: JSON.stringify({
          to: "leadership",
          text: `*New Goal Submission* — ${built.teamName} · ${built.monthLabel}\n${built.byName || "An AD"} nominated ${built.nominee || "no one yet"}${built.revisedFrom ? " (revision of a returned entry)" : ""}. Review it under Submissions (AD Only).`,
        }),
      }).catch(() => {});
      setAnswers({}); setNominee(""); setTeamId("");
      flash(built.revisedFrom ? "Revision sent for review" : "Submitted for review");
    })();
  };

  // Bri, Jul 24: "can I have a delete option in the Review section for my use."
  // Reviewer-only, confirms with the team and month named. A deleted entry takes
  // its nominee off the Vote ballot, which is worth saying out loud in the
  // confirm rather than letting her discover it.
  const removeEntry = (e) => {
    if (!window.confirm(`Delete ${e.teamName}'s ${e.monthLabel} submission?\n\nIf it was approved, ${e.nominee || "its nominee"} comes off the Vote ballot. This can't be undone.`)) return;
    persistPatch((b) => ({ ...b, entries: (Array.isArray(b.entries) ? b.entries : []).filter((x) => x.id !== e.id) })).then((ok) => { if (ok) flash("Deleted"); });
  };

  const decide = (id, status, feedback) => {
    persistPatch((b) => ({ ...b, entries: (Array.isArray(b.entries) ? b.entries : []).map((e) => (e.id !== id ? e
      : { ...e, status, feedback: feedback || "", decidedBy: viewer ? viewer.name : "", decidedAt: new Date().toISOString() })) }))
      .then((ok) => { if (ok) flash(status === "approved" ? "Approved" : "Sent back with feedback"); });
  };

  /* ── question editing (Bri only) ─────────────────────────────────────── */
  // Question/window edits also route through the fresh-read writer, so a Bri
  // config change can't overwrite an AD who submitted a moment earlier. Each
  // patches the FRESH questions/window, not the copy loaded at open.
  const setQ = (id, patch) => persistPatch((b) => ({ ...b, questions: (Array.isArray(b.questions) ? b.questions : []).map((q) => (q.id === id ? { ...q, ...patch } : q)) }));
  const moveQ = (i, dir) => {
    persistPatch((b) => {
      const next = (Array.isArray(b.questions) ? b.questions : []).slice();
      const j = i + dir; if (j < 0 || j >= next.length) return null;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...b, questions: next };
    });
  };
  const addQ = () => persistPatch((b) => ({ ...b, questions: [...(Array.isArray(b.questions) ? b.questions : []), { id: `q_${Date.now()}`, text: "New question", kind: "text", required: false }] }));
  const delQ = (q) => {
    // The team and nominee questions carry the two live dropdowns and the Vote
    // form reads both. Deleting one would quietly break the next form along.
    if (q.fixed) { flash("That question feeds the Vote form and can't be removed"); return; }
    if (!window.confirm(`Delete "${q.text}"?`)) return;
    persistPatch((b) => ({ ...b, questions: (Array.isArray(b.questions) ? b.questions : []).filter((x) => x.id !== q.id) }));
  };
  const setWin = (patch) => persistPatch((b) => ({ ...b, window: { ...(b.window || {}), ...patch } }));

  const shell = (body) => (
    <div style={{ fontFamily: FONT, background: C.paper, minHeight: "100vh", color: C.ink }}>
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "rgba(246,244,239,.92)", backdropFilter: "blur(8px)",
        borderBottom: `1px solid ${C.line}`, padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {onBack && <button onClick={onBack} style={{ border: "none", background: "none", color: C.sub, fontFamily: FONT, fontSize: 14, cursor: "pointer", fontWeight: 600 }}>← Back</button>}
        <div style={{ fontWeight: 800, fontSize: 16 }}>Submissions</div>
        <div style={{ flex: 1 }} />
        {toast && <span style={{ color: C.green, fontSize: 12.5, fontWeight: 700 }}>{toast}</span>}
        <Btn small kind={view === "form" ? "solid" : "ghost"} onClick={() => setView("form")}>Form</Btn>
        {mayReview && <Btn small kind={view === "review" ? "solid" : "ghost"} onClick={() => setView("review")}>Review</Btn>}
        {mayReview && <Btn small kind={view === "settings" ? "solid" : "ghost"} onClick={() => setView("settings")}>Settings</Btn>}
      </div>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "20px 18px 60px" }}>{body}</div>
    </div>
  );

  /* ── settings ────────────────────────────────────────────────────────── */
  if (view === "settings") return shell(
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Settings</h2>
      <p style={{ color: C.sub, fontSize: 13.5, margin: "0 0 18px", lineHeight: 1.5 }}>
        Everything here is yours. Nothing on this page needs a deploy to change.
      </p>

      <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginBottom: 18 , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>When the form is open</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 12.5, color: C.sub, flex: "1 1 130px" }}>Which end
            <select value={data.window.mode === "first" ? "first" : "last"}
              onChange={(e) => setWin({ mode: e.target.value })} style={{ ...inp, marginTop: 4 }}>
              <option value="last">The LAST days of the month</option>
              <option value="first">The FIRST days of the month</option>
            </select>
          </label>
          <label style={{ fontSize: 12.5, color: C.sub, flex: "1 1 130px" }}>Open for
            <DayCount value={data.window.lastDays} onCommit={(n) => setWin({ lastDays: n })}
              style={{ ...inp, marginTop: 4 }} /> days
          </label>
          <label style={{ fontSize: 12.5, color: C.sub, flex: "1 1 110px" }}>Opens at
            <input type="time" value={data.window.openTime} onChange={(e) => setWin({ openTime: e.target.value })} style={{ ...inp, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12.5, color: C.sub, flex: "1 1 110px" }}>Closes at
            <input type="time" value={data.window.closeTime} onChange={(e) => setWin({ closeTime: e.target.value })} style={{ ...inp, marginTop: 4 }} />
          </label>
        </div>
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 8 }}>
            Override the rule for now. “Follow the schedule” puts it back — a forced state
            doesn’t quietly switch the recurring rule off for good.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn small kind={data.window.manual === null ? "solid" : "ghost"} onClick={() => setWin({ manual: null })}>Follow the schedule</Btn>
            <Btn small kind={data.window.manual === true ? "solid" : "ghost"} onClick={() => setWin({ manual: true })}>Force open</Btn>
            <Btn small kind={data.window.manual === false ? "solid" : "ghost"} onClick={() => setWin({ manual: false })}>Force closed</Btn>
          </div>
          <div style={{ fontSize: 12.5, color: C.sub, marginTop: 10 }}>
            This month the rule runs <b style={{ color: C.ink }}>{fmtDate(win.openAt)} {fmtTime(win.openAt)}</b> to <b style={{ color: C.ink }}>{fmtDate(win.closeAt)} {fmtTime(win.closeAt)}</b>.
            {" "}Right now it is <b style={{ color: win.open ? C.green : C.red }}>{win.open ? "open" : "closed"}</b>{win.forced ? " (forced)" : ""}.
          </div>
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Questions</div>
          <div style={{ flex: 1 }} />
          <Btn small onClick={addQ}>+ Add question</Btn>
        </div>
        <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 12 }}>
          Starred questions must be answered before an AD can submit.
        </div>
        {questions.map((q, i) => (
          <div key={q.id} style={{ borderTop: i ? `1px solid ${C.line}` : "none", padding: "10px 0" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input value={q.text} onChange={(e) => setQ(q.id, { text: e.target.value })} style={{ ...inp, flex: "1 1 220px" }} />
              <Btn small onClick={() => moveQ(i, -1)} disabled={i === 0}>▲</Btn>
              <Btn small onClick={() => moveQ(i, 1)} disabled={i === questions.length - 1}>▼</Btn>
              <Btn small kind={q.required ? "solid" : "ghost"} onClick={() => setQ(q.id, { required: !q.required })}>
                {q.required ? "★ Required" : "☆ Optional"}
              </Btn>
              <Btn small onClick={() => delQ(q)} disabled={!!q.fixed}>Delete</Btn>
            </div>
            {q.kind === "choice" && (
              <div style={{ marginTop: 7 }}>
                <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 4 }}>Answer options — one per line</div>
                <textarea rows={3} value={(q.options || []).join("\n")}
                  onChange={(e) => setQ(q.id, { options: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })}
                  style={{ ...inp, resize: "vertical", fontSize: 13 }} />
              </div>
            )}
            {q.help !== undefined && (
              <div style={{ marginTop: 7 }}>
                <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 4 }}>Guidance shown under the question</div>
                <textarea rows={3} value={q.help || ""} onChange={(e) => setQ(q.id, { help: e.target.value })}
                  style={{ ...inp, resize: "vertical", fontSize: 13 }} />
              </div>
            )}
            {q.fixed && (
              <div style={{ fontSize: 11.5, color: C.sub, marginTop: 5 }}>
                {q.kind === "team"
                  ? "Pulls live from Meet Our Teams — new teams appear on their own."
                  : "Pulls the Trainers and Team Members on the chosen team. The Vote form reads this."}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  /* ── review ──────────────────────────────────────────────────────────── */
  if (view === "review") {
    const byMonth = {};
    data.entries.slice().sort((a, b) => (a.at < b.at ? 1 : -1)).forEach((e) => {
      (byMonth[e.monthLabel] = byMonth[e.monthLabel] || []).push(e);
    });
    const labels = Object.keys(byMonth);
    return shell(
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Review</h2>
        <p style={{ color: C.sub, fontSize: 13.5, margin: "0 0 18px" }}>
          Approving an entry is what puts its nominee on the Vote form.
        </p>
        {!labels.length && <div style={{ color: C.sub, fontSize: 14 }}>Nothing submitted yet.</div>}
        {labels.map((label) => (
          <div key={label} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: C.sub, marginBottom: 8 }}>{label}</div>
            {byMonth[label].map((e) => <ReviewCard key={e.id} entry={e} questions={questions} onDecide={decide} onDelete={removeEntry} />)}
          </div>
        ))}
        {attempts.length > 0 && (
          <details style={{ marginTop: 24, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 800, color: C.sub }}>
              Attempt log · {attempts.length}
            </summary>
            <div style={{ fontSize: 12, color: C.sub, margin: "6px 0 10px" }}>
              A row here means someone pressed Submit. If a name shows here but not in the list above, their entry did not save and they should submit again.
            </div>
            {attempts.map((a, i) => {
              const p = a.payload || {};
              const t = a.submitted_at || p.at;
              return (
                <div key={a.id || i} style={{ fontSize: 12.5, padding: "5px 0", borderBottom: `1px solid ${C.line}` }}>
                  <b>{p.byName || a.submitted_by || "—"}</b>
                  {p.teamName ? ` · ${p.teamName}` : ""}
                  {p.monthLabel ? ` · ${p.monthLabel}` : ""}
                  {p.nominee ? ` · ${p.nominee}` : ""}
                  <span style={{ color: C.sub }}> · {t ? `${fmtDate(new Date(t))}, ${fmtTime(new Date(t))}` : "?"}</span>
                </div>
              );
            })}
          </details>
        )}
      </div>
    );
  }

  /* ── the form ────────────────────────────────────────────────────────── */
  return shell(
    <div>
      <div style={{ background: `linear-gradient(120deg, ${C.red} 0%, ${C.navy} 60%)`, borderRadius: 18,
        padding: "20px 22px", color: "#fff", marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", opacity: .85 }}>Assistant Directors</div>
        <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{month.label}</div>
        <div style={{ fontSize: 13.5, opacity: .9, marginTop: 6 }}>
          {win.open
            ? <>Open until {fmtDate(win.closeAt)}, {fmtTime(win.closeAt)}.</>
            : <>Closed. Opens {fmtDate(win.openAt)} at {fmtTime(win.openAt)}.</>}
        </div>
      </div>

      {returnedToMe.length > 0 && (
        <div style={{ background: "#FEE2E2", border: `1px solid ${C.red}`, borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, color: C.red }}>
            {returnedToMe.length === 1 ? "Your submission was sent back" : `${returnedToMe.length} of your submissions were sent back`}
          </div>
          {returnedToMe.map((e) => (
            <div key={e.id} style={{ fontSize: 13, color: C.ink, marginTop: 6, lineHeight: 1.45 }}>
              <b>{e.teamName}</b>{e.feedback ? <> — “{e.feedback}”</> : null}
            </div>
          ))}
          <div style={{ fontSize: 12.5, color: C.sub, marginTop: 8 }}>Fill the form in again below; it replaces what you sent.</div>
        </div>
      )}

      {!win.open && (
        <div style={{ background: C.amberBg, color: C.amber, borderRadius: 12, padding: "11px 14px", marginBottom: 16, fontSize: 13.5, fontWeight: 700 }}>
          The window is closed, so nothing can be submitted right now.
        </div>
      )}

      <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, opacity: win.open ? 1 : .55 , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
        {questions.map((q) => (
          <div key={q.id} style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13.5, fontWeight: 700, display: "block", marginBottom: 6 }}>
              {q.text} {q.required && <span style={{ color: C.red }}>*</span>}
            </label>
            {q.help && (
              <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.5, whiteSpace: "pre-line", marginBottom: 7 }}>{q.help}</div>
            )}

            {q.kind === "team" ? (
              <select value={teamId} disabled={!win.open}
                onChange={(e) => { setTeamId(e.target.value); setNominee(""); }} style={inp}>
                <option value="">Choose a team…</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            ) : q.kind === "nominee" ? (
              <>
                <select value={nominee} disabled={!win.open || !teamId} onChange={(e) => setNominee(e.target.value)} style={inp}>
                  <option value="">{teamId ? "Choose a nominee…" : "Pick a team first"}</option>
                  {nomineeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                {teamId && !nomineeOptions.length && (
                  <div style={{ fontSize: 12, color: C.amber, marginTop: 5 }}>
                    No Trainers or Team Members are listed on that team in Meet Our Teams.
                  </div>
                )}
              </>
            ) : q.kind === "choice" ? (
              // Radio buttons rather than a dropdown: Bri's three options are
              // long sentences, and a <select> truncates them on an iPad.
              <div>
                {(q.options || []).map((opt) => {
                  const chosen = answers[q.id] === opt;
                  return (
                    <label key={opt} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "9px 11px",
                      borderRadius: 9, marginBottom: 6, cursor: win.open ? "pointer" : "default",
                      border: `1px solid ${chosen ? C.navy : C.line}`, background: chosen ? "#F1F5FB" : "#fff" }}>
                      <input type="radio" name={q.id} checked={chosen} disabled={!win.open}
                        onChange={() => setAnswers({ ...answers, [q.id]: opt })} style={{ marginTop: 3 }} />
                      <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>{opt}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <textarea value={answers[q.id] || ""} disabled={!win.open}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                rows={3} style={{ ...inp, resize: "vertical" }} />
            )}
          </div>
        ))}

        {err && <div style={{ color: C.red, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{err}</div>}
        <Btn kind="solid" onClick={submit} disabled={!win.open}>Submit for review</Btn>
      </div>

      {mine.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: C.sub, marginBottom: 8 }}>Your submissions</div>
          {mine.slice().sort((a, b) => (a.at < b.at ? 1 : -1)).map((e) => (
            <div key={e.id} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10,
              padding: "9px 12px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
              <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{e.teamName}</div>
                <div style={{ fontSize: 11.5, color: C.sub }}>{e.monthLabel}</div>
              </div>
              <Pill tone={e.status}>{e.status}</Pill>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── review card ─────────────────────────────────────────────────────────
   Kept as its own component so its feedback box holds its own draft text —
   one shared state would put the same words in every open card. */
function ReviewCard({ entry, questions, onDecide, onDelete }) {
  const [fb, setFb] = useState(entry.feedback || "");
  const [openFb, setOpenFb] = useState(false);
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, marginBottom: 10 , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{entry.teamName}</div>
        <Pill tone={entry.status}>{entry.status}</Pill>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11.5, color: C.sub }}>{entry.byName}</div>
      </div>

      {entry.nominee && (
        <div style={{ fontSize: 13.5, marginBottom: 8 }}>
          <span style={{ color: C.sub }}>Nominee: </span><b>{entry.nominee}</b>
        </div>
      )}

      {questions.filter((q) => q.kind === "text" || q.kind === "choice").map((q) => {
        const a = (entry.answers || {})[q.id];
        if (!a) return null;
        return (
          <div key={q.id} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11.5, color: C.sub, fontWeight: 700 }}>{q.text}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{a}</div>
          </div>
        );
      })}

      {entry.status === "returned" && entry.feedback && (
        <div style={{ background: "#FEE2E2", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, color: C.ink, marginTop: 8 }}>
          Sent back: “{entry.feedback}”
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <Btn small kind="solid" onClick={() => onDecide(entry.id, "approved")} disabled={entry.status === "approved"}>Approve</Btn>
        <Btn small onClick={() => setOpenFb((v) => !v)}>{openFb ? "Cancel" : "Send back"}</Btn>
        <div style={{ flex: 1 }} />
        {onDelete && (
          <button onClick={() => onDelete(entry)}
            style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 700, cursor: "pointer", borderRadius: 9,
              border: `1px solid ${C.line}`, background: "#fff", color: C.red, padding: "5px 11px" }}>
            Delete
          </button>
        )}
      </div>

      {openFb && (
        <div style={{ marginTop: 10 }}>
          <textarea value={fb} onChange={(e) => setFb(e.target.value)} rows={2} placeholder="What needs changing?"
            style={{ ...inp, resize: "vertical" }} />
          <div style={{ marginTop: 8 }}>
            <Btn small kind="solid" onClick={() => { onDecide(entry.id, "returned", fb); setOpenFb(false); }}>
              Send back with feedback
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
