import React, { useState, useEffect, useRef } from "react";
/* The shared raised look and accent edge — see cardStyle.js. */
import { CARD_3D, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { kvGet, kvSet, kvGetResult, uploadPhoto, signedDocUrl, photoPathFrom } from "./store.js";
import GoalSubmissions from "./GoalSubmissions.jsx";
import MemberVote from "./MemberVote.jsx";
import TeamTracker from "./TeamTracker.jsx";
import { isAdminSlackId, adminNames } from "./storeConfig.js";
import { TEAM_TOOL_ADMIN_ROLES } from "./adminRoles.js";
/* Leaf, no imports of its own — safe here and everywhere else. */
import { sameId } from "./nameMatch.js";
/* ★ THE LEAF, NOT GoalSubmissions.jsx. Only the KEY is needed here, and
   goalsWindow.js exists precisely so a caller can have it without dragging the
   submissions tile and everything it imports along. */
import { SUB_KEY } from "./goalsWindow.js";

/**
 * TeamGoals — Peak Reachers "Team Goals" page.
 * Reads the teams from gc-team-directory-v1; own data → gc-team-goals-v1.
 * Everyone VIEWS. Leaders (AD-tier + allowlist) EDIT. The "Submissions (AD Only)"
 * quick link is gated to Assistant Director and up.
 *
 * Structure (per Bri, Jul 21):
 *  • Top: TWO Team Members of the Month — one FOH, one BOH (by month).
 *  • Per team: a single Team Player of the Month + this month's goal.
 *  • Team-Wide Goals + Challenges: editable notes, each can attach an image.
 *  • Quick Links: Vote for Team Members of the Month · Goals Tracker ·
 *    Submissions (AD Only, AD-tier+ only).
 *
 * Image upload uses store.js uploadPhoto → hub-assets bucket. If uploads error
 * with a row-level-security message, hub-assets needs an anon INSERT policy
 * (same one-time fix as trainer-task-photos).
 */

const GOALS_KEY = "gc-team-goals-v1";

/* The approved submission for one team in one month, or null. Pure, module
   level (design rule 7).
   ⚠️ ONE ENTRY PER TEAM PER MONTH IS THE RULE GoalSubmissions ENFORCES on the
   way in ("This team's entry for that month is already approved"), so the
   newest approved one is the one. Sorted rather than assumed, because a record
   written before that rule existed could still be a pair. */
function approvedFor(subs, teamId, monthKey) {
  if (!Array.isArray(subs) || !teamId || !monthKey) return null;
  const hits = subs.filter((e) => e && e.status === "approved"
    && String(e.teamId) === String(teamId) && String(e.monthKey) === String(monthKey));
  if (!hits.length) return null;
  return hits.slice().sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))[0];
}

/* The goal text an AD actually wrote. ⚠️ TRIMMED — the live records carry
   leading spaces from the form, and pasting those in makes her first edit a
   whitespace hunt. */
const submittedGoal = (entry) => String(((entry && entry.answers) || {}).q_goal || "").trim();
const DIR_KEY = "gc-team-directory-v1";
const USER_KEY = "gcfcr-access-user";
const IMG_BUCKET = "hub-assets";

/* ★★ RENDERS A STORED IMAGE, WHICHEVER SHAPE IT IS IN.
   🐛 Broken since Jul 28 2026 and silent the whole time. `uploadPhoto` stopped
   returning a public URL that day and started returning a bucket PATH, because
   the bucket went private. This tile kept assigning that straight to
   `<img src>`, so the browser asked gatecityhub.com for a path that is not a
   route, the SPA catch-all answered with index.html, and the picture rendered
   as a broken box. The upload itself SUCCEEDED, so no error ever showed and the
   button flipped to "Replace image" — the tile insisted the photo was attached.
   Every other tile already mints a short-lived link at render time; this was
   the last one that did not.
   ⚠️ BOTH STORED SHAPES ARE LIVE AND ALWAYS WILL BE. Notes written before
   Jul 28 hold a full public URL, notes since hold a path, and nothing rewrites
   the old ones. `photoPathFrom` normalises either into a path, which is exactly
   why it exists. Never "simplify" this to assume one shape. */
function StoredImg({ value, style }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    const path = photoPathFrom(value, IMG_BUCKET);
    if (!path) { setSrc(""); return undefined; }
    signedDocUrl(IMG_BUCKET, path, 300)
      .then((u) => { if (alive) setSrc(u || ""); })
      .catch(() => { if (alive) setSrc(""); });
    return () => { alive = false; };
  }, [value]);
  if (!src) return null;
  return <img src={src} alt="" style={style} />;
}


// Same fix as ProfessionalGrowth — the Hub knows Bri as "Bri".
// This is the by-name half of BOTH powers on this page now: editing the goals
// and marking them met, in progress or unmet. Until Jul 30 2026 editing sat on
// a much wider role list and only the outcome was held here; Bri's ruling
// removed the lower level (see canEditGoals below). Adding a name here now
// hands over outcome-setting as well, so it is not a casual edit.
/* ★ THE NAME LIST NOW COMES FROM storeConfig — owners.adminNames.teamGoals.
   ⚠️ ITS OWN KEY, even though Team Directory's list is byte-identical today.
   The sentence above is why: a name here hands over outcome-setting, which is
   not the same grant as seeing an unannounced promotion. Two questions, one
   answer at the moment, and one key each so a change to either cannot silently
   move the other.
   ⚠️ READ INSIDE EACH GATE, NOT INTO A `const` UP HERE. Both call sites below
   call adminNames() themselves; a module-level Set would capture the baked-in
   default at import, before a store's saved settings are merged. */
// PRIMARY GATE = SLACK USER ID (same set and same reasoning as TeamDirectory):
// IDs never change, display names do, and a name-string gate is what locked Bri
// out of her own tools once already.
/* ★ THE FIVE ADMINS NOW COME FROM storeConfig.js, WHICH IS THE ONLY COPY.
   This exact block was duplicated in four tiles under four different names.
   Byte-identical every time, so a second store had to find all four to stop
   Gate City administering their Hub — and four copies of one permission list
   drift silently.
   ⚠️ THE MECHANISM IS UNCHANGED. Id first, name second, role last, exactly as
   before. Only the list moved. The name and role fallbacks below are NOT
   duplicates between tiles and deliberately stay here. */
// ⚠️ "human resources" is here because Bri asked for HR explicitly (Jul 23) and
// Hannah's roster role is HR, not Executive Director — without it she could not
// set an outcome. Do NOT widen this further; ADs must stay out.
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
   ⚠️ ONLY THE DECLARATION MOVED. Every use of STATUS_ROLES below is
   byte-for-byte what it was, including this file's own role normaliser,
   which is NOT the same function in every tile. */
const STATUS_ROLES = new Set(TEAM_TOOL_ADMIN_ROLES);
/* LEADER_ROLES lived here and is deliberately GONE, not left unused. It was the
   wide list that let Team Leaders and ADs type the goal text, and Bri's Jul 30
   ruling removed that power. Leaving a dead permission list sitting in the file
   is how one gets wired back into a gate by somebody tidying up later. Its
   members, for the record: Team Leader, Junior and Senior Team Leader,
   Assistant Director, Manager, Director, Leadership Development Director,
   Leadership Director, Executive Director, Executive, Human Resources, Owner. */
const AD_UP_ROLES = new Set([
  "Assistant Director", "Manager", "Director", "Leadership Development Director",
  "Leadership Director", "Executive Director", "Executive", "Human Resources", "Owner",
]);
const norm = (s) => (s || "").trim().toLowerCase();
function getViewer() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }
const canSeeSubmissions = (v) => !!v && (adminNames("teamGoals").includes(norm(v.name)) || AD_UP_ROLES.has(v.role));
const canSetStatus = (v) => !!v && ((v.slackId && isAdminSlackId(v.slackId)) || adminNames("teamGoals").includes(norm(v.name)) || STATUS_ROLES.has(norm(v.role)));

/* ★ EDITING IS NOW THE SAME SET AS MARKING A GOAL MET (Bri, Jul 30 2026:
   "Please remove editing access from ADs to adjust their team's monthly goals
   under their teams. I would like this to be me, Matt, or Hannah.")

   This page used to carry TWO edit levels: a wide leader list could type the
   goal text, STATUS_ROLES could mark it accomplished. Her ruling removes the
   lower one, so the two collapse into one question and this is an ALIAS rather
   than a second copy — the whole reason `normName` had to be hunted down three
   times in this repo. If they ever need to differ again, split them HERE.

   ⚠️ WHAT ACTUALLY CHANGES: Team Leader, Junior and Senior Team Leader,
   Assistant Director and Manager lose the Edit button. Nobody else moves.
   ⚠️ HER THREE ALREADY CLEAR IT and always did — Matt and Bri by name in
   adminNames("teamGoals"), Hannah by role ("Human Resources" is in
   TEAM_TOOL_ADMIN_ROLES). So
   this is purely a removal and cannot lock out the people she named.
   ⚠️ DIRECTORS DELIBERATELY KEEP IT. She named ADs, and a week later she and
   Matt both agreed plain Directors administer these five team tools (Aug 7,
   her words: "Yes, they can have the same accesss for those 4"). Daisy and
   Brandon stay in. "assistant director" is not in TEAM_TOOL_ADMIN_ROLES and
   never was, which is what makes this one line rather than a new list.
   ⚠️ SUBMITTING IS UNTOUCHED. `canSeeSubmissions` is its own gate on
   AD_UP_ROLES, so ADs still file their monthly goals for approval. That is the
   flow her ruling assumes: they submit, she edits. Removing that too would
   have left the month with no way in. */
const canEditGoals = canSetStatus;

// Goal outcome per team per month (Bri, Jul 22 — colours are hers).
const STATUS = {
  accomplished: { label: "Accomplished", short: "Met", bg: "#E7F6EC", fg: "#166534", dot: "#2E9E5B" },
  in_progress:  { label: "In Progress",  short: "WIP", bg: "#FEF3C7", fg: "#92400E", dot: "#D97706" },
  unmet:        { label: "Unmet",        short: "Unmet", bg: "#FBEAED", fg: "#B21230", dot: "#E51636" },
};
const STATUS_ORDER = ["accomplished", "in_progress", "unmet"];

// Walk backwards from a month counting an unbroken run of one status.
// Used for both of Bri's rules: 6 straight Accomplished earns the team an
// incentive; 3 straight Unmet flags the team to her for coaching.
function streak(data, teamId, fromMonth, kind) {
  let n = 0, m = fromMonth;
  for (let i = 0; i < 36; i++) {
    const st = (((data.months || {})[m] || {})[teamId] || {}).status;
    if (st !== kind) break;
    n++; m = shiftMonth(m, -1);
  }
  return n;
}
const INCENTIVE_AT = 6;
const CHALLENGE_STARS = 5;   // Bri: five challenge stars per team, then an incentive
const COACHING_AT = 3;

const C = {
  red: "#E51636", redDeep: "#B21230", navy: "#1A2238", ink: "#141821",
  sub: "#5B6474", line: "#E7E9EF", paper: "#F6F4EF", card: "#FFFFFF", gold: "#E8B23A",
};
const FONT = "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif";

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (k) => { const [y, m] = k.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" }); };
const shiftMonth = (k, delta) => { const [y, m] = k.split("-").map(Number); return monthKey(new Date(y, m - 1 + delta, 1)); };

/* ⚠️ ok:false = the read FAILED, not "no goals yet" — the autosave below would
   otherwise write {}-plus-one-edit over every month, team and member goal. */
async function loadGoals() {
  const r = await kvGetResult(GOALS_KEY);
  return { ok: r.ok, data: (r.ok && r.value) || {} };
}
async function loadTeams() { try { const d = await kvGet(DIR_KEY); return (d && Array.isArray(d.teams)) ? d.teams : []; } catch { return []; } }
async function saveGoals(data) { try { return await kvSet(GOALS_KEY, data); } catch { return false; } }

function Btn({ children, onClick, kind = "ghost", small }) {
  const kinds = { solid: { background: C.red, color: "#fff", border: "none" }, ghost: { background: "transparent", color: C.sub, border: `1px solid ${C.line}` } };
  return <button onClick={onClick} style={{ cursor: "pointer", fontFamily: FONT, fontWeight: 600, borderRadius: 9, padding: small ? "5px 10px" : "9px 16px", fontSize: small ? 12.5 : 14, ...kinds[kind] }}>{children}</button>;
}
const inp = { fontFamily: FONT, fontSize: 14, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, color: C.ink, background: "#fff", outline: "none", width: "100%", boxSizing: "border-box" };
const ta = { ...inp, minHeight: 60, resize: "vertical", lineHeight: 1.45 };

// editable notes with an optional image attachment (Team-Wide Goals + Challenges)
function NoteList({ items, editing, onChange, addLabel }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");
  const set = (id, patch) => onChange(items.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const del = (id) => onChange(items.filter((x) => x.id !== id));
  const add = () => onChange([...items, { id: `n${Date.now()}`, title: "", body: "", image: null }]);
  const pick = async (id, file) => {
    if (!file) return;
    setErr(""); setBusy(id);
    try {
      const url = await uploadPhoto(IMG_BUCKET, `team-goals/${id}-${Date.now()}-${file.name}`, file);
      set(id, { image: url });
    } catch (e) { setErr(`Couldn't upload image: ${e.message || e}`); }
    setBusy(null);
  };
  if (!editing && !items.length) return <p style={{ color: C.sub, fontSize: 13.5, margin: 0 }}>Nothing posted yet.</p>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {err && <div style={{ color: C.redDeep, fontSize: 12.5, background: "#FBEAED", borderRadius: 8, padding: "6px 10px" }}>{err}</div>}
      {items.map((x) => editing ? (
        <div key={x.id} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, background: C.card , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={x.title} placeholder="Title" onChange={(e) => set(x.id, { title: e.target.value })} style={{ ...inp, fontWeight: 700 }} />
            <button onClick={() => del(x.id)} style={{ border: "none", background: "#FBEAED", color: C.redDeep, borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16, flexShrink: 0 }}>×</button>
          </div>
          <textarea value={x.body} placeholder="Details" onChange={(e) => set(x.id, { body: e.target.value })} style={{ ...ta, marginTop: 8 }} />
          {x.image && <StoredImg value={x.image} style={{ width: "100%", borderRadius: 10, border: `1px solid ${C.line}`, marginTop: 8, display: "block" }} />}
          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
            <label style={{ ...inp, width: "auto", cursor: "pointer", fontWeight: 600, color: C.sub, display: "inline-flex", alignItems: "center", gap: 6 }}>
              📷 {busy === x.id ? "Uploading…" : x.image ? "Replace image" : "Add image"}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => pick(x.id, e.target.files && e.target.files[0])} />
            </label>
            {x.image && <button onClick={() => set(x.id, { image: null })} style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.sub, borderRadius: 8, padding: "6px 10px", fontSize: 12.5, cursor: "pointer", fontWeight: 600 }}>Remove image</button>}
          </div>
        </div>
      ) : (
        <div key={x.id} style={{ borderLeft: `3px solid ${C.red}`, borderTop: `3px solid ${C.red}`, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px" , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
          <div style={{ fontWeight: 700, color: C.ink, fontSize: 15 }}>{x.title || "Untitled"}</div>
          {x.body && <div style={{ color: C.sub, fontSize: 13.5, marginTop: 3, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{x.body}</div>}
          {x.image && <StoredImg value={x.image} style={{ width: "100%", borderRadius: 10, border: `1px solid ${C.line}`, marginTop: 10, display: "block" }} />}
        </div>
      ))}
      {editing && <Btn small kind="solid" onClick={add}>+ {addLabel}</Btn>}
    </div>
  );
}


const Section = ({ title, note, children }) => (
  <div style={{ marginTop: 30 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: C.ink }}>{title}</h2>
      <span style={{ height: 1, flex: 1, background: C.line }} />
    </div>
    {note && <p style={{ color: C.sub, fontSize: 13, margin: "0 0 12px" }}>{note}</p>}
    {children}
  </div>
);

// one big "Member of the Month" spotlight card (FOH / BOH)
function SpotlightCard({ label, name, editing, onChange }) {
  return (
    <div style={{ flex: 1, minWidth: 220, background: `linear-gradient(120deg, #24304d 0%, ${C.navy} 55%)`, borderRadius: 16, padding: "20px 22px", color: "#fff" }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: C.gold }}>★ {label} Team Member of the Month</div>
      {editing
        ? <input value={name || ""} placeholder="Name" onChange={(e) => onChange(e.target.value)} style={{ ...inp, marginTop: 8, background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.3)" }} />
        : <div style={{ fontWeight: 800, fontSize: 22, marginTop: 6 }}>{name || "—"}</div>}
    </div>
  );
}

export default function TeamGoals({ onBack, goalsDue = 0, onOpenSubmissions }) {
  const [teams, setTeams] = useState(null);
  const [data, setData] = useState(null);
  // true = the goals read FAILED — saving is off until a reopen loads it.
  const [loadFailed, setLoadFailed] = useState(false);
  const [month, setMonth] = useState(monthKey());
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  // Which in-Hub form is open, if any. Declared here with the other hooks: the
  // loading early-return below would make anything added later conditional.
  const [subPage, setSubPage] = useState(null);
  // Which team's Tracker is open (Bri, Aug 1: a "Tracker" button per team).
  // Inline render like subPage — the Hub has no routing.
  const [trackerTeam, setTrackerTeam] = useState(null);
  /* ═══ THE APPROVED SUBMISSION, OFFERED NOT APPLIED ═══════════════════════
     Bri, Jul 30 2026: "Is it possible to automatically pull those goals from
     the submissions form once they are approved each month? While still
     maintaining manual editing for me in case I need to adjust it?"
     Matt, Aug 11 2026: no auto-fill, a button.

     ★ WHY A BUTTON AND NOT A COPY. Auto-filling would make the Assistant
     Director's submission silently become the team's goal — the AD would be
     setting the target and Bri would only find out by noticing. The button
     saves the same typing and leaves the decision where she asked for it to
     stay: "maintaining manual editing for me in case I need to adjust it".

     ⚠️ READ-ONLY HERE. GoalSubmissions owns every write to SUB_KEY. This page
     copies text OUT of an approved entry and never touches the entry itself.
     ⚠️ A FAILED READ MEANS NO BUTTON, never a wrong one. */
  const [subs, setSubs] = useState([]);
  const first = useRef(true);

  const viewer = getViewer();
  const canEdit = canEditGoals(viewer);
  const showSubmissions = canSeeSubmissions(viewer);
  const maySetStatus = canSetStatus(viewer);

  useEffect(() => { (async () => {
    setTeams(await loadTeams());
    const g = await loadGoals();
    if (!g.ok) setLoadFailed(true);
    setData(g.data);
  })(); }, []);
  /* ⚠️ ITS OWN EFFECT, deliberately not folded into the one above. That one
     decides `loadFailed`, which is what turns SAVING off for the whole page; a
     rejected read of a read-only convenience must never be able to reach it. */
  useEffect(() => { (async () => {
    try {
      const v = await kvGet(SUB_KEY);
      const list = v && Array.isArray(v.entries) ? v.entries : [];
      setSubs(list.filter((e) => e && e.status === "approved"));
    } catch { /* no button is a fine outcome */ }
  })(); }, []);
  useEffect(() => {
    if (!data || loadFailed) return;
    if (first.current) { first.current = false; return; }
    let live = true;
    saveGoals(data).then((ok) => { if (ok && live) { setSaved(true); setTimeout(() => setSaved(false), 1400); } });
    return () => { live = false; };
  }, [data, loadFailed]);

  if (subPage === "submissions") return <GoalSubmissions onBack={() => setSubPage(null)} />;
  if (subPage === "vote") return <MemberVote onBack={() => setSubPage(null)} />;
  /* maySetStatus is Team Goals' Bri/HR/ExDir/Owner class — exactly the people
     Bri named as tracker column-managers, so it rides along as canManageAll. */
  if (trackerTeam) return <TeamTracker team={trackerTeam} viewer={viewer} canManageAll={maySetStatus} onBack={() => setTrackerTeam(null)} />;

  if (!data || !teams) return <div style={{ fontFamily: FONT, padding: 40, color: C.sub }}>Loading team goals…</div>;

  const links = data.links || {};
  const memberMonth = (data.members && data.members[month]) || {};
  const monthData = (data.months && data.months[month]) || {};
  const setLink = (k, v) => setData({ ...data, links: { ...links, [k]: v } });
  const setMember = (side, name) => setData({ ...data, members: { ...(data.members || {}), [month]: { ...memberMonth, [side]: name } } });
  const setTeamMonth = (teamId, patch) => setData({ ...data, months: { ...(data.months || {}), [month]: { ...monthData, [teamId]: { ...(monthData[teamId] || {}), ...patch } } } });

  return (
    <div style={{ fontFamily: FONT, background: C.paper, minHeight: "100vh", color: C.ink }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');`}</style>
      {loadFailed && (
        <div style={{ background: "#F5EAD3", borderBottom: "1px solid #E4CE9E", color: "#7A5410", padding: "10px 20px", fontSize: 13, fontWeight: 700 }}>
          Saved goals could not be reached — this page is blank, not empty. Changes will not save. Close and reopen to retry.
        </div>
      )}
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "rgba(246,244,239,.9)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.line}`, padding: "12px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        {onBack && <button onClick={onBack} style={{ border: "none", background: "none", color: C.sub, fontFamily: FONT, fontSize: 14, cursor: "pointer", fontWeight: 600 }}>← Back</button>}
        <div style={{ fontWeight: 800, fontSize: 16 }}>Team Goals</div>
        <div style={{ flex: 1 }} />
        {saved && <span style={{ color: "#2E9E5B", fontSize: 12.5, fontWeight: 600 }}>Saved ✓</span>}
        {canEdit && <Btn kind={editing ? "solid" : "ghost"} small onClick={() => setEditing((e) => !e)}>{editing ? "Done" : "Edit"}</Btn>}
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "22px 20px 60px" }}>
        {/* ★ THE DUE BANNER (Bri, Jul 30 2026): "a 'due' banner somewhere for
            ADs needing to submit their team goals on Submissions… visible
            through this timeframe until they submit and it's APPROVED. If they
            submit and it's sent back they need to have the banner remain."
            ⚠️ THE COUNT IS HANDED DOWN, NEVER RECALCULATED HERE. App.jsx works
            it out once for the whole trail; a second sum on this page is a
            second chance to disagree about whether somebody owes a goal, and
            the one that disagrees is the one nobody notices.
            ⚠️ IT IS A BUTTON, because this is the last stop before the form.
            A banner that tells you something is due and then makes you go and
            find it is half a banner. */}
        {goalsDue > 0 && (
          <button type="button"
            onClick={() => { if (onOpenSubmissions) onOpenSubmissions(); else setSubPage("submissions"); }}
            style={{ width: "100%", textAlign: "left", cursor: "pointer", fontFamily: FONT,
              background: "#FEF3C7", border: "1px solid #F0D48A", borderRadius: 14,
              padding: "13px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>📌</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontWeight: 800, fontSize: 14.5, color: "#92400E" }}>
                {goalsDue === 1 ? "Your team goal is due" : `${goalsDue} team goals are due`}
              </span>
              <span style={{ display: "block", fontSize: 13, color: "#92400E", marginTop: 2 }}>
                Submissions are open. This stays until yours is approved.
              </span>
            </span>
            <span style={{ color: "#92400E", fontWeight: 800, fontSize: 16 }}>→</span>
          </button>
        )}
        <div style={{ background: `linear-gradient(120deg, ${C.red} 0%, ${C.redDeep} 30%, ${C.navy} 55%)`, borderRadius: 20, padding: "24px 24px", color: "#fff", position: "relative", overflow: "hidden", marginBottom: 20 }}>
          <div style={{ position: "absolute", right: -30, top: -30, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,255,255,.08)" }} />
          <div style={{ fontSize: 24 }}>🎯</div>
          <div style={{ fontWeight: 800, fontSize: 23, letterSpacing: "-.02em", marginTop: 6 }}>Team Goals</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.85)", marginTop: 4, lineHeight: 1.45 }}>Recognition, monthly goals, and challenges — every team, one place.</div>
        </div>

        {/* month nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 6 }}>
          <button onClick={() => setMonth(shiftMonth(month, -1))} style={{ border: `1px solid ${C.line}`, background: "#fff", borderRadius: 9, width: 34, height: 34, cursor: "pointer", fontSize: 15 }}>‹</button>
          <div style={{ fontWeight: 800, fontSize: 18, minWidth: 180, textAlign: "center" }}>{monthLabel(month)}</div>
          <button onClick={() => setMonth(shiftMonth(month, 1))} style={{ border: `1px solid ${C.line}`, background: "#fff", borderRadius: 9, width: 34, height: 34, cursor: "pointer", fontSize: 15 }}>›</button>
        </div>

        {/* TOP: two Team Members of the Month — FOH + BOH */}
        <Section title="Team Members of the Month" note="One Front of House and one Back of House, chosen each month.">
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <SpotlightCard label="Front of House" name={memberMonth.foh} editing={editing} onChange={(v) => setMember("foh", v)} />
            <SpotlightCard label="Back of House" name={memberMonth.boh} editing={editing} onChange={(v) => setMember("boh", v)} />
          </div>
        </Section>

        {/* per-team: single Team Player of the Month + this month's goal */}
        <Section title="By Team" note="Each team's Team Player of the Month and this month's goal.">
          {teams.length === 0 && <p style={{ color: C.sub, fontSize: 13.5 }}>No teams found yet — set up the Team Directory first.</p>}
          <div style={{ display: "grid", gap: 14 }}>
            {teams.map((t) => {
              const md = monthData[t.id] || {};
              return (
                <div key={t.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
                  <div style={{ background: C.red, color: "#fff", fontWeight: 800, fontSize: 15.5, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ flex: 1 }}>{t.name}</span>
                    {/* Team-scoped on purpose (Bri): only this team's people —
                        and her column-manager class — even see the button.
                        🐛 The id shapes never matched (Aug 10 2026): `hrId` is
                        the directory's `27`, `viewer.id` is the roster's
                        `tm27`. So the Tracker button was hidden from every
                        person on the team and only ever appeared for the
                        column managers. See sameId in nameMatch.js. */}
                    {(maySetStatus || (t.people || []).some((p) => sameId(p && p.hrId, viewer && viewer.id))) && (
                      <button onClick={() => setTrackerTeam(t)}
                        style={{ cursor: "pointer", fontFamily: FONT, fontWeight: 700, fontSize: 12.5, color: "#fff", background: "rgba(255,255,255,.16)", border: "1px solid rgba(255,255,255,.35)", borderRadius: 8, padding: "5px 12px" }}>
                        Tracker
                      </button>
                    )}
                  </div>
                  <div style={{ padding: 16, display: "grid", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: C.gold }}>★ Team Player of the Month</div>
                      {editing ? <input value={md.player || ""} placeholder="Name" onChange={(e) => setTeamMonth(t.id, { player: e.target.value })} style={{ ...inp, marginTop: 5 }} />
                        : <div style={{ fontWeight: 700, color: C.ink, fontSize: 16, marginTop: 3 }}>{md.player || "—"}</div>}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: C.sub }}>This Month's Goal</div>
                        {/* E2 (census): STATUS[md.status] was bare here while the
                            approver branch below guards the same lookup — the one
                            view every NON-approver sees was the unguarded one. */}
                        {md.status && !maySetStatus && STATUS[md.status] && (
                          <span style={{ fontSize: 11, fontWeight: 800, background: STATUS[md.status].bg, color: STATUS[md.status].fg, padding: "2px 9px", borderRadius: 20 }}>
                            {STATUS[md.status].label}
                          </span>
                        )}
                        {(() => {
                          const win = streak(data, t.id, month, "accomplished");
                          const miss = streak(data, t.id, month, "unmet");
                          return (
                            <>
                              {win >= INCENTIVE_AT && (
                                <span title={`${win} months in a row`} style={{ fontSize: 11, fontWeight: 800, background: "#FDF2D9", color: "#B45309", padding: "2px 9px", borderRadius: 20 }}>
                                  🏆 Incentive earned · {win} in a row
                                </span>
                              )}
                              {miss >= COACHING_AT && maySetStatus && (
                                <span title={`${miss} months in a row`} style={{ fontSize: 11, fontWeight: 800, background: "#FBEAED", color: "#B21230", padding: "2px 9px", borderRadius: 20 }}>
                                  ⚠️ Needs coaching · {miss} unmet
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      {editing ? <textarea value={md.goal || ""} placeholder="What is this team working toward this month?" onChange={(e) => setTeamMonth(t.id, { goal: e.target.value })} style={{ ...ta, marginTop: 5 }} />
                        : <div style={{ color: C.ink, fontSize: 14, marginTop: 3, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{md.goal || "—"}</div>}
                      {/* ★ BRI'S "pull those goals from the submissions form once
                          they are approved", as an offer rather than an
                          overwrite. Only while editing, because the field it
                          fills is only editable then. */}
                      {editing && (() => {
                        const sub = approvedFor(subs, t.id, month);
                        const text = submittedGoal(sub);
                        /* Nothing approved, or it is already what is in the box:
                           no button. An offer to do what is already done reads
                           as a broken button. */
                        if (!text || text === String(md.goal || "").trim()) return null;
                        const has = String(md.goal || "").trim() !== "";
                        return (
                          <div style={{ marginTop: 6 }}>
                            <button
                              onClick={() => {
                                /* ⚠️ CONFIRMS ONLY WHEN THERE IS SOMETHING TO
                                   LOSE. She tapped a button that says what it
                                   does, so an empty box needs no ceremony — but
                                   replacing wording she has already typed is a
                                   different act and gets asked about. */
                                if (has && !window.confirm(
                                  `Replace this goal with ${sub.byName || "the Assistant Director"}'s approved submission?\n\nWhat is written now will be lost.`)) return;
                                setTeamMonth(t.id, { goal: text });
                              }}
                              style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.ink,
                                borderRadius: 8, padding: "6px 11px", fontSize: 12.5, fontWeight: 700,
                                cursor: "pointer", fontFamily: FONT }}>
                              {has ? "Replace with the approved submission" : "Use the approved submission"}
                            </button>
                            <div style={{ fontSize: 11.5, color: C.sub, marginTop: 4, lineHeight: 1.45 }}>
                              {sub.byName || "An Assistant Director"} submitted it
                              {sub.decidedBy ? `, ${sub.decidedBy} approved it` : ""}
                              {sub.decidedAt ? ` on ${String(sub.decidedAt).slice(0, 10)}` : ""}. You can edit it after.
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    {maySetStatus && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: C.sub, marginBottom: 5 }}>Outcome</div>
                        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                          {STATUS_ORDER.map((k) => {
                            const on = md.status === k;
                            return (
                              <button key={k} onClick={() => setTeamMonth(t.id, { status: on ? null : k })}
                                style={{ border: `1px solid ${on ? STATUS[k].dot : C.line}`, background: on ? STATUS[k].bg : "#fff",
                                  color: on ? STATUS[k].fg : C.sub, borderRadius: 20, padding: "5px 13px", fontSize: 12.5,
                                  fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                                {on ? "● " : "○ "}{STATUS[k].label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Tracker — the at-a-glance grid that replaces Bri's spreadsheet */}
        <Section title="Goals Tracker" note="Every team's outcome, month by month. Teams come straight from the Team Site, so this list follows any team you add, rename or remove.">
          {teams.length === 0 ? <p style={{ color: C.sub, fontSize: 13.5 }}>No teams yet.</p> : (() => {
            const months = [];
            for (let i = 5; i >= 0; i--) months.push(shiftMonth(month, -i));
            return (
              <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", minWidth: 460, fontFamily: FONT }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", fontSize: 11, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase",
                        color: C.sub, padding: "0 10px 8px 0", position: "sticky", left: 0, background: C.paper }}>Team</th>
                      {months.map((m) => (
                        <th key={m} style={{ fontSize: 11, fontWeight: 800, color: C.sub, padding: "0 4px 8px", whiteSpace: "nowrap" }}>
                          {monthLabel(m).split(" ")[0].slice(0, 3)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((t) => {
                      const win = streak(data, t.id, month, "accomplished");
                      const miss = streak(data, t.id, month, "unmet");
                      return (
                        <tr key={t.id}>
                          <td style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, padding: "6px 10px 6px 0",
                            position: "sticky", left: 0, background: C.paper, whiteSpace: "nowrap" }}>
                            {t.name}
                            {win >= INCENTIVE_AT && <span title={`${win} accomplished in a row`}> 🏆</span>}
                            {miss >= COACHING_AT && maySetStatus && <span title={`${miss} unmet in a row`}> ⚠️</span>}
                          </td>
                          {months.map((m) => {
                            const st = (((data.months || {})[m] || {})[t.id] || {}).status;
                            const cfg = st ? STATUS[st] : null;
                            return (
                              <td key={m} style={{ padding: "4px 3px", textAlign: "center" }}>
                                <div title={cfg ? cfg.label : "Not set"} style={{ height: 26, borderRadius: 8,
                                  background: cfg ? cfg.bg : "#EFEFEA", color: cfg ? cfg.fg : "#B9BCC2",
                                  border: `1px solid ${cfg ? cfg.dot : "transparent"}`, display: "flex",
                                  alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>
                                  {cfg ? cfg.short : "–"}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12, fontSize: 12, color: C.sub }}>
                  {STATUS_ORDER.map((k) => (
                    <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 11, height: 11, borderRadius: 3, background: STATUS[k].dot, display: "inline-block" }} />
                      {STATUS[k].label}
                    </span>
                  ))}
                  <span>🏆 {INCENTIVE_AT} accomplished in a row — incentive earned</span>
                  {maySetStatus && <span>⚠️ {COACHING_AT} unmet in a row — needs coaching</span>}
                </div>
              </div>
            );
          })()}
        </Section>

        <Section title="Team-Wide Goals">
          <NoteList items={data.teamWide || []} editing={editing} onChange={(items) => setData({ ...data, teamWide: items })} addLabel="Add a team-wide goal" />
        </Section>

        {/* Challenges — deliberately OUTSIDE the accomplished/in-progress/unmet
            model (Bri, Jul 22): challenges aren't set every month, so they're a
            running tally rather than a monthly outcome. Five stars per team,
            cumulative, filled by Bri; five earns an incentive. Public on
            purpose — she wants teams to see each other's progress. */}
        <Section title="Challenges" note="Five stars to earn — a team fills one each time they accomplish a challenge.">
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            {teams.map((t) => {
              const earned = (data.challengeStars || {})[t.id] || 0;
              const complete = earned >= CHALLENGE_STARS;
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                  background: C.card, border: `1px solid ${complete ? C.gold : C.line}`, borderRadius: 12, padding: "11px 14px" , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
                  <span style={{ flex: 1, minWidth: 130, fontWeight: 700, fontSize: 14.5, color: C.ink }}>
                    {t.name}
                    {complete && <span style={{ fontSize: 11, fontWeight: 800, background: "#FDF2D9", color: "#B45309",
                      padding: "2px 9px", borderRadius: 20, marginLeft: 8 }}>🏆 All 5 earned</span>}
                  </span>
                  <span style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                    {Array.from({ length: CHALLENGE_STARS }, (_, i) => {
                      const n = i + 1, on = n <= earned;
                      const star = (
                        <span style={{ fontSize: 22, lineHeight: 1, color: on ? C.gold : "#D6D9E0",
                          filter: on ? "none" : "grayscale(1)" }}>{on ? "★" : "☆"}</span>
                      );
                      // Only the status-setters can award; tapping the current
                      // count clears back to it minus one, so a mis-tap is undoable.
                      return maySetStatus ? (
                        <button key={n} title={`Set ${n} of ${CHALLENGE_STARS}`}
                          onClick={() => setData({ ...data, challengeStars: { ...(data.challengeStars || {}), [t.id]: earned === n ? n - 1 : n } })}
                          style={{ border: "none", background: "none", padding: 0, cursor: "pointer", lineHeight: 1 }}>{star}</button>
                      ) : <span key={n}>{star}</span>;
                    })}
                  </span>
                </div>
              );
            })}
          </div>
          <NoteList items={data.challenges || []} editing={editing} onChange={(items) => setData({ ...data, challenges: items })} addLabel="Add a challenge" />
        </Section>

        <Section title="Quick Links">
          {editing ? (
            <div style={{ display: "grid", gap: 10 }}>
              {/* BOTH Quick Links are in-Hub forms now, so there are no URLs
                  left to edit. `links.vote`, `links.submissions` and
                  `links.tracker` all stay in storage rather than being deleted,
                  in case a Google Form is ever wanted back. */}
              <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.5 }}>
                Both Quick Links now open forms built into the Hub, so there are no
                addresses to paste. Their questions and their open/close schedule are
                edited inside each form.
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <button onClick={() => setSubPage("vote")}
                style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                  fontFamily: FONT, background: "#fff", border: `1px solid ${C.line}`,
                  borderRadius: 12, padding: "12px 14px", color: C.ink }}>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>Vote for Team Member of the Month</div>
                <div style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>Open to everyone — one vote each</div>
              </button>
              {/* Now an in-Hub form rather than links.submissions. The stored
                  URL is left alone rather than deleted, so nothing is lost if
                  the Google Form is ever wanted back. */}
              {showSubmissions && (
                <button onClick={() => setSubPage("submissions")}
                  style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                    fontFamily: FONT, background: "#fff", border: `1px solid ${C.line}`,
                    borderRadius: 12, padding: "12px 14px", color: C.ink }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700 }}>Submissions (AD Only)</div>
                  <div style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>Assistant Directors and up</div>
                </button>
              )}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
