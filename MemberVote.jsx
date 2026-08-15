import React, { useState, useEffect, useMemo, useRef } from "react";
/* The shared raised look and accent edge — see cardStyle.js. */
import { CARD_3D, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { kvGet, kvGetResult, kvSet } from "./store.js";
import { SUB_KEY, monthOf, windowState, DayCount } from "./GoalSubmissions.jsx";
import { isAdminSlackId, adminNames } from "./storeConfig.js";
import { TEAM_TOOL_ADMIN_ROLES } from "./adminRoles.js";

/**
 * MemberVote — "Vote for Team Member of the Month", replacing Bri's Google Form.
 *
 * Bri's spec (Jul 24): anyone may vote, once per open window. The ballot fills
 * itself from Submissions — a nominee appears here only once their entry is
 * APPROVED — with their team shown beside the name. One pick from Daisy's side,
 * one from Brandon's.
 *
 * ONE VOTE PER PERSON, NOT PER DEVICE — Bri, verbatim: "This is attached to
 * their login pin... devices don't matter, the login does." The Hub runs on
 * shared iPads, so a device-keyed ballot would let the first voter lock out
 * everyone after them. Votes are keyed to the signed-in roster id.
 *
 * THE COLUMNS ARE DERIVED FROM DIRECTORS, NOT HARDCODED. Bri described it as
 * "one FOH (under Daisy) and one BOH (under Brandon)", but that grouping is
 * really "one per Director", and it reads `team.director` — the same field the
 * Meet Our Teams dropdown writes. Add a third Director and a third column
 * appears on its own.
 *
 * Storage: gc-member-vote-v1. Reads gc-goal-submissions-v1 + gc-team-directory-v1.
 */

const VOTE_KEY = "gc-member-vote-v1";
const DIR_KEY = "gc-team-directory-v1";
const USER_KEY = "gcfcr-access-user";

/* ⚠️ WAS A HARDCODED Set OF THIS STORE'S PEOPLE. Read at CALL time. */
/* ★ THE FIVE ADMINS NOW COME FROM storeConfig.js, WHICH IS THE ONLY COPY.
   This exact block was duplicated in four tiles under four different names.
   Byte-identical every time, so a second store had to find all four to stop
   Gate City administering their Hub — and four copies of one permission list
   drift silently.
   ⚠️ THE MECHANISM IS UNCHANGED. Id first, name second, role last, exactly as
   before. Only the list moved. The name and role fallbacks below are NOT
   duplicates between tiles and deliberately stay here. */
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
   ⚠️ ONLY THE DECLARATION MOVED. Every use of ADMIN_ROLES below is
   byte-for-byte what it was, including this file's own role normaliser,
   which is NOT the same function in every tile. */
const ADMIN_ROLES = new Set(TEAM_TOOL_ADMIN_ROLES);

const norm = (s) => (s || "").trim().toLowerCase();
function getViewer() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }
const isAdmin = (v) => !!v && ((v.slackId && isAdminSlackId(v.slackId)) || adminNames("memberVote").includes(norm(v.name)) || ADMIN_ROLES.has(norm(v.role)));

const DEFAULTS = {
  version: 1,
  // Bri, Jul 24: voting runs at the START of the month, on the nominations
  // approved from the previous month's submissions.
  window: { lastDays: 5, openTime: "00:00", closeTime: "23:59", manual: null, mode: "first" },
  hidden: false,
  votes: [],
};
function hydrate(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  return {
    version: 1,
    window: { ...DEFAULTS.window, ...(d.window || {}) },
    hidden: !!d.hidden,
    votes: Array.isArray(d.votes) ? d.votes : [],
  };
}

const FONT = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
const C = { paper: "#F6F4EF", ink: "#14243D", sub: "#5b6b82", line: "#E7E2D8",
  red: "#E51636", navy: "#13293F", green: "#0F766E", amber: "#B45309", amberBg: "#FEF3C7" };
// Bri, Jul 24: the ballot should read by AREA, not by who the Director is —
// "FOH Team Members/Trainers", not "FOH Director"; "our FOH teams", not
// "Daisy's teams". Derived from the Director's title so a renamed or replaced
// Director doesn't leave a stale person's name on a store-wide ballot.
const areaOf = (col) => String(col.title || "").replace(/\s*Director\s*$/i, "").trim() || String(col.name || "").split(" ")[0];

const fmtDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtTime = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

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

export default function MemberVote({ onBack }) {
  const [data, setData] = useState(null);
  const [subs, setSubs] = useState(null);
  const [dir, setDir] = useState(null);
  const [picks, setPicks] = useState({});          // directorId → nominee key
  const [view, setView] = useState("vote");        // vote | results
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(new Date());

  const viewer = getViewer();
  const admin = isAdmin(viewer);

  // The vote record read failed → admin writes refuse until a clean reload.
  // hydrate(null) would seed a fresh structure, and the next admin action
  // would persist that seed over every vote already cast. (Casting a vote is
  // already safe — it re-reads with kvGetResult right before writing.)
  const [loadFailed, setLoadFailed] = useState(false);
  const loadFailedRef = useRef(false);

  useEffect(() => { (async () => {
    /* VOTE_KEY loads result-style — it is the record this page WRITES. The
       other two only feed the display: a failed subs/dir read shows an empty
       ballot until refresh, and writes nothing. kvGet never throws, so the
       old .catch here was dead code. */
    const [vR, s, d] = await Promise.all([
      kvGetResult(VOTE_KEY),
      kvGet(SUB_KEY),
      kvGet(DIR_KEY),
    ]);
    if (!vR.ok) { loadFailedRef.current = true; setLoadFailed(true); }
    setData(hydrate(vR.value));
    setSubs(s && Array.isArray(s.entries) ? s.entries : []);
    setDir(d && typeof d === "object" ? d : { teams: [], directors: [] });
  })(); }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2400); };
  const persist = async (next) => {
    if (loadFailedRef.current) {
      flash("This page didn't load fully — refresh before changing anything");
      return false;
    }
    const prev = data;
    setData(next);
    /* `kvSet` REPORTS FAILURE BY RETURNING FALSE, NOT BY THROWING. On false,
       roll the screen back so it keeps matching what is really stored. */
    const ok = (await kvSet(VOTE_KEY, next)) !== false;
    if (!ok) { setData(prev); flash("Save failed — try again"); }
    return ok;
  };

  // ★ WHICH MONTH THE BALLOT IS FOR — this follows the window mode, and getting
  // it wrong empties the ballot silently.
  // Submissions run at the END of a month and are labelled for the NEXT one, so
  // late July produces entries keyed "2026-08". Voting then runs in the FIRST
  // days of August on exactly those entries — so in "first" mode the ballot is
  // THIS month, not next. Using next month here would look for September
  // nominees in early August and find none.
  const month = useMemo(
    () => monthOf(now, (data && data.window.mode === "first") ? 0 : 1),
    [now, data]);
  const win = useMemo(() => (data ? windowState(data.window, now) : null), [data, now]);

  // The ballot: approved submissions for this month, resolved to a director via
  // the team's own `director` field.
  const ballot = useMemo(() => {
    if (!subs || !dir) return { columns: [], orphans: [] };
    const teams = Array.isArray(dir.teams) ? dir.teams : [];
    const directors = Array.isArray(dir.directors) ? dir.directors : [];
    const approved = subs.filter((e) => e.status === "approved" && e.monthKey === month.key && e.nominee);

    const columns = directors.map((d) => ({ id: d.id, name: d.name, title: d.title, nominees: [] }));
    const byId = new Map(columns.map((c) => [c.id, c]));
    const orphans = [];

    for (const e of approved) {
      const team = teams.find((t) => t.id === e.teamId);
      const col = team && team.director ? byId.get(team.director) : null;
      const row = { key: `${e.teamId}::${e.nominee}`, name: e.nominee, team: e.teamName || (team || {}).name || "" };
      if (col) col.nominees.push(row);
      // A nominee whose team has no Director cannot be placed in either column.
      // They are NOT dropped — a nomination silently vanishing off the ballot is
      // how someone gets left out and nobody ever finds out why.
      else orphans.push(row);
    }
    return { columns: columns.filter((c) => c.nominees.length), orphans };
  }, [subs, dir, month]);

  const myVote = useMemo(() => {
    if (!data || !viewer) return null;
    return data.votes.find((v) => v.monthKey === month.key && String(v.voterId) === String(viewer.id)) || null;
  }, [data, viewer, month]);

  const tally = useMemo(() => {
    if (!data) return [];
    const counts = new Map();
    data.votes.filter((v) => v.monthKey === month.key).forEach((v) => {
      Object.values(v.picks || {}).forEach((p) => {
        if (!p) return;
        counts.set(p, (counts.get(p) || 0) + 1);
      });
    });
    return [...counts.entries()].map(([k, n]) => ({ key: k, name: k.split("::")[1] || k, n }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [data, month]);

  if (!data || !subs || !dir) return <div style={{ fontFamily: FONT, padding: 40, color: C.sub }}>Loading the ballot…</div>;

  // Bri, Jul 24: hide the whole page from everyone but her, HR and the Ex
  // Directors. ⚠️ An ADMIN still gets in while hidden — otherwise hiding it
  // would lock her out of her own Results tab and the toggle to unhide it.
  // Same rule as the closed-application state in ProfessionalGrowth.
  if (data.hidden && !admin) {
    return (
      <div style={{ fontFamily: FONT, background: C.paper, minHeight: "60vh", padding: 40, textAlign: "center" }}>
        {onBack && <div><Btn small onClick={onBack}>← Back</Btn></div>}
        <div style={{ fontSize: 28, marginTop: 26 }}>🏔️</div>
        <div style={{ marginTop: 8, fontWeight: 800, fontSize: 17, color: C.ink }}>Voting isn't open yet</div>
        <div style={{ fontSize: 14, marginTop: 6, color: C.sub }}>Team Member of the Month voting will appear here when it opens.</div>
      </div>
    );
  }

  const setWin = (patch) => persist({ ...data, window: { ...data.window, ...patch } });

  const castVote = async () => {
    setErr("");
    if (!win.open) { setErr("Voting is closed."); return; }
    if (!viewer || viewer.id == null) { setErr("Sign in with your PIN to vote."); return; }
    if (myVote) { setErr("You've already voted this month."); return; }
    for (const col of ballot.columns) {
      // Same wording as the column heading — a validation message that names a
      // Director when the heading says "FOH" reads as a different form.
      if (!picks[col.id]) { setErr(`Pick someone from our ${areaOf(col)} teams.`); return; }
    }
    if (!ballot.columns.length) { setErr("There's nothing to vote on yet."); return; }
    /* ★★ RE-READ THE VOTES IMMEDIATELY BEFORE APPENDING. `data` is loaded once
       at mount and never refreshed, so this used to append onto a snapshot and
       write the whole record back — erasing every vote cast by anyone else
       since this page was opened. With ~40 people voting from shared iPads in
       the same few days, that is not an edge case, and it is invisible
       afterwards: the result just looks like fewer people voted.
       🐛 The second failure was worse. `hydrate(null)` returns votes: [], and
       kvGet answers null for a FAILED read as well as an empty one — so a
       dropped read made `myVote` undefined, the duplicate check passed, and
       one vote was written over every vote already cast. */
    const fresh = await kvGetResult(VOTE_KEY);
    if (!fresh.ok) { setErr("Couldn't reach the ballot, so your vote was not recorded. Try again in a moment."); return; }
    const server = hydrate(fresh.value);
    if (server.votes.some((v) => String(v.voterId) === String(viewer.id) && v.monthKey === month.key)) {
      setErr("You've already voted this month.");
      setData(server);
      return;
    }
    const ok = await persist({ ...server, votes: [...server.votes, {
      id: `v_${Date.now()}`, monthKey: month.key, monthLabel: month.label,
      voterId: viewer.id, voterName: viewer.name, picks: { ...picks }, at: new Date().toISOString(),
    }] });
    if (ok) flash("Vote recorded");
  };

  const shell = (body) => (
    <div style={{ fontFamily: FONT, background: C.paper, minHeight: "100vh", color: C.ink }}>
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "rgba(246,244,239,.92)", backdropFilter: "blur(8px)",
        borderBottom: `1px solid ${C.line}`, padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {onBack && <button onClick={onBack} style={{ border: "none", background: "none", color: C.sub, fontFamily: FONT, fontSize: 14, cursor: "pointer", fontWeight: 600 }}>← Back</button>}
        <div style={{ fontWeight: 800, fontSize: 16 }}>Team Member of the Month</div>
        <div style={{ flex: 1 }} />
        {toast && <span style={{ color: C.green, fontSize: 12.5, fontWeight: 700 }}>{toast}</span>}
        <Btn small kind={view === "vote" ? "solid" : "ghost"} onClick={() => setView("vote")}>Vote</Btn>
        {admin && <Btn small kind={view === "results" ? "solid" : "ghost"} onClick={() => setView("results")}>Results</Btn>}
      </div>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 18px 60px" }}>{body}</div>
    </div>
  );

  /* ── results + settings, reviewers only ──────────────────────────────── */
  if (view === "results") return shell(
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>{month.label.replace(" Goal", "")}</h2>
      <p style={{ color: C.sub, fontSize: 13.5, margin: "0 0 18px" }}>
        {data.votes.filter((v) => v.monthKey === month.key).length} {data.votes.filter((v) => v.monthKey === month.key).length === 1 ? "person has" : "people have"} voted.
      </p>

      <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginBottom: 18 , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Who can see this page</div>
          <div style={{ flex: 1 }} />
          <Btn small kind={data.hidden ? "solid" : "ghost"} onClick={() => persist({ ...data, hidden: !data.hidden })}>
            {data.hidden ? "Hidden from the team" : "Visible to everyone"}
          </Btn>
        </div>
        <div style={{ fontSize: 12.5, color: C.sub, marginTop: 6, marginBottom: 16, lineHeight: 1.45 }}>
          While hidden, only you, HR and the Executive Directors can open it — including this panel, so you can always switch it back.
        </div>

        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>When voting is open</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 12.5, color: C.sub, flex: "1 1 130px" }}>Which end
            <select value={data.window.mode === "first" ? "first" : "last"}
              onChange={(e) => setWin({ mode: e.target.value })} style={{ ...inp, marginTop: 4 }}>
              <option value="first">The FIRST days of the month</option>
              <option value="last">The LAST days of the month</option>
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <Btn small kind={data.window.manual === null ? "solid" : "ghost"} onClick={() => setWin({ manual: null })}>Follow the schedule</Btn>
          <Btn small kind={data.window.manual === true ? "solid" : "ghost"} onClick={() => setWin({ manual: true })}>Force open</Btn>
          <Btn small kind={data.window.manual === false ? "solid" : "ghost"} onClick={() => setWin({ manual: false })}>Force closed</Btn>
        </div>
        <div style={{ fontSize: 12.5, color: C.sub, marginTop: 10 }}>
          This month the rule runs <b style={{ color: C.ink }}>{fmtDate(win.openAt)} {fmtTime(win.openAt)}</b> to <b style={{ color: C.ink }}>{fmtDate(win.closeAt)} {fmtTime(win.closeAt)}</b>.
          {" "}Right now it is <b style={{ color: win.open ? C.green : C.red }}>{win.open ? "open" : "closed"}</b>{win.forced ? " (forced)" : ""}.
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>Count so far</div>
        <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 12 }}>
          Shown to you only. Voting stays open until the window closes.
        </div>
        {!tally.length && <div style={{ color: C.sub, fontSize: 13.5 }}>No votes yet.</div>}
        {tally.map((t, i) => (
          <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? `1px solid ${C.line}` : "none" }}>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{t.name}</div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{t.n}</div>
          </div>
        ))}
      </div>
    </div>
  );

  /* ── the ballot ──────────────────────────────────────────────────────── */
  return shell(
    <div>
      <div style={{ background: `linear-gradient(120deg, ${C.red} 0%, ${C.navy} 60%)`, borderRadius: 18,
        padding: "20px 22px", color: "#fff", marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", opacity: .85 }}>Cast your vote</div>
        <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{month.label.replace(" Goal", "")}</div>
        <div style={{ fontSize: 13.5, opacity: .9, marginTop: 6 }}>
          {win.open
            ? <>Open until {fmtDate(win.closeAt)}, {fmtTime(win.closeAt)}.</>
            : <>Closed. Opens {fmtDate(win.openAt)} at {fmtTime(win.openAt)}.</>}
        </div>
      </div>

      {myVote && (
        <div style={{ background: "#DCFCE7", border: `1px solid ${C.green}`, borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, color: C.green }}>Your vote is in</div>
          <div style={{ fontSize: 13, color: C.ink, marginTop: 5, lineHeight: 1.45 }}>
            Thanks{viewer && viewer.name ? `, ${String(viewer.name).split(" ")[0]}` : ""}. One vote each — hand the iPad on and the next person can sign in and cast theirs.
          </div>
        </div>
      )}

      {!viewer && (
        <div style={{ background: C.amberBg, color: C.amber, borderRadius: 12, padding: "11px 14px", marginBottom: 16, fontSize: 13.5, fontWeight: 700 }}>
          Sign in with your PIN to vote — votes are counted per person, not per device.
        </div>
      )}

      {!win.open && (
        <div style={{ background: C.amberBg, color: C.amber, borderRadius: 12, padding: "11px 14px", marginBottom: 16, fontSize: 13.5, fontWeight: 700 }}>
          Voting is closed right now.
        </div>
      )}

      {!ballot.columns.length && win.open && (
        <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, color: C.sub, fontSize: 13.5, lineHeight: 1.5 , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
          No nominees yet. Names appear here once an Assistant Director's submission has been approved.
        </div>
      )}

      {ballot.orphans.length > 0 && (
        <div style={{ background: C.amberBg, color: C.amber, borderRadius: 12, padding: "11px 14px", marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
          <b>{ballot.orphans.length} approved {ballot.orphans.length === 1 ? "nominee is" : "nominees are"} not on the ballot</b> — {ballot.orphans.map((o) => `${o.name} (${o.team})`).join(", ")}.
          {" "}Their team has no Director set on Meet Our Teams, so there's no side to place them on.
        </div>
      )}

      {ballot.columns.map((col) => (
        <div key={col.id} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14,
          padding: 16, marginBottom: 14, opacity: win.open && !myVote ? 1 : .6 , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: C.sub }}>
            {areaOf(col)} Team Members/Trainers
          </div>
          <div style={{ fontSize: 13, color: C.sub, marginBottom: 10 }}>Pick one from our {areaOf(col)} teams</div>
          {col.nominees.map((n) => {
            const chosen = picks[col.id] === n.key;
            return (
              <label key={n.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                borderRadius: 10, marginBottom: 6, cursor: win.open && !myVote ? "pointer" : "default",
                border: `1px solid ${chosen ? C.navy : C.line}`, background: chosen ? "#F1F5FB" : "#fff" }}>
                <input type="radio" name={`col_${col.id}`} checked={chosen} disabled={!win.open || !!myVote}
                  onChange={() => setPicks({ ...picks, [col.id]: n.key })} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 700 }}>{n.name}</span>
                  <span style={{ fontSize: 12.5, color: C.sub, marginLeft: 8 }}>{n.team}</span>
                </span>
              </label>
            );
          })}
        </div>
      ))}

      {err && <div style={{ color: C.red, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{err}</div>}
      {ballot.columns.length > 0 && (
        <Btn kind="solid" onClick={castVote} disabled={!win.open || !!myVote || !viewer}>
          {myVote ? "You've voted" : "Submit my vote"}
        </Btn>
      )}
    </div>
  );
}
