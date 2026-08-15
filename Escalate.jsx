/* ============================================================================
   Escalate.jsx — TELL WHOEVER IS RUNNING THE SHIFT

   Matt, Aug 13 2026, part 3 of three: "One-way. Team member to whoever is
   running the shift. Preset reasons plus a short note… It routes automatically
   to whoever the board says owns that shift right now. The team member does not
   choose a recipient and does not need to know who is on… No reply thread on
   this one. If it needs discussion, the leader calls them."

   ⚠️⚠️ THERE IS NO RECIPIENT PICKER ON THIS SCREEN AND THERE MUST NEVER BE.
   The Worker resolves who is on from the BOARD at the moment of sending. A
   picker here would make this a direct message to a person of your choosing,
   which is the line Matt drew against: "There is no free-form chat between team
   members… free-form employee messages in a system I host make me the custodian
   of records that get subpoenaed."

   ⚠️⚠️ AND THERE IS NO REPLY BOX. A leader marks it seen and adds ONE line of
   outcome. That is the disposition of a record, not a message back. The moment
   a team member can answer that line, this is a DM channel to the leader on
   duty. If somebody later adds a second text field on the member's side, that
   is the drift.

   ⚠️ THE SEND SCREEN NEVER NAMES WHO IT REACHED, only how many. Matt: the
   sender "does not need to know who is on". A count confirms it went somewhere;
   a list of names turns the escalation form into a roster lookup for anybody
   with a phone. ZERO IS SAID OUT LOUD, because a message that reached nobody
   and looked sent is the worst outcome here — see `reached === 0` below.

   ⚠️ RULES LIVE IN escalations.js. Reasons, the record shape, who may see one.
   The Worker asks the same leaf the same questions, and two copies drift.
   ============================================================================ */

import React, { useEffect, useState } from "react";
import { toolCard } from "./cardStyle.js";
import ToolHero from "./ToolHero.jsx";
import { hubToken } from "./store.js";
import { REASONS, reasonLabel, isSeen } from "./escalations.js";

const NAVY = "#1B3A5C", INK = "#232A31", GRAY = "#6B7480", LINE = "#E3E7EC";
const GREEN = "#166B4A", RED = "#DD0031", AMBER = "#7A5A00";

/* ⚠️⚠️ `...cardSurface` WAS SPREADING A FUNCTION, AND IT PAINTED NOTHING.
   `cardSurface` is a FUNCTION you call with a tone, not a style object, so
   `{ ...cardSurface }` is `{}` — functions carry no own enumerable keys. The
   gradient face this line existed to add has therefore never been on these
   cards; they have been flat white under a shadow since the day it was
   written, and nothing complained because a flat card still looks like a card.
   ⚠️ THE OLD COMMENT HERE WAS ALSO WRONG and is replaced rather than kept:
   it said CARD_3D is "an ARRAY of shadow layers". It is a STRING — the array
   is `.join(", ")`ed at the end of cardStyle.js. Spreading it sets indexed
   keys and React throws "Indexed property setter is not supported". Both
   mistakes are real and they are not the same mistake.
   ⇒ `toolCard(tone)` returns the whole look — shadow, tinted face and the two
   coloured edges — so neither can be got wrong here again. Matt, Aug 14 2026:
   "I want the same look for the other tools like communication, tell a leader".
   ⚠️ THE TONE IS THIS TILE'S OWN COLOUR, the one App.jsx gives Tell a Leader, not
   the neutral navy a card with nothing to say gets. Duplicated rather than
   imported because App.jsx is a component and importing one component into
   another is how the cycle this repo keeps hitting comes back. */
const TONE = "#8C2F39";
const box = { ...toolCard(TONE), borderRadius: 14, padding: 14, marginBottom: 12 };
const inp = {
  width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 10,
  border: `1px solid ${LINE}`, boxSizing: "border-box", fontFamily: "inherit",
};
const btn = (bg = NAVY) => ({
  background: bg, color: "#fff", border: "none", borderRadius: 10,
  padding: "10px 16px", fontSize: 14, fontWeight: 800, cursor: "pointer",
});

/* Module level (design rule 7): called from render, never a closure over state. */
function whenText(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const DAYPART_WORD = {
  breakfast: "breakfast", lunch: "lunch", mid: "afternoon", night: "night",
};
const daypartWord = (p) => DAYPART_WORD[String(p || "")] || String(p || "");

/* ── A GLYPH PER REASON ──────────────────────────────────────────────────
   Matt, Aug 13 2026: "the message app needs glyphs."

   ⚠️ THIS SCREEN IS USED IN A HURRY, and that is the whole argument for icons
   here rather than anywhere else in the feature. Somebody is in a car park at
   5:30am, or standing next to a machine that has stopped. Four lines of similar
   grey text all begin with a word they have to read; four shapes do not.

   ⚠️⚠️ KEYED BY REASON ID, AND THERE IS A FALLBACK ON PURPOSE. The tile icon
   map in App.jsx has NO fallback, and that is exactly why five tiles have
   shipped this week drawing an empty box — twice by me. A reason added to
   escalations.js without a glyph here must degrade to a dot, not to a hole.
   Asserted in the test suite: every id in REASONS has one today, and an
   invented id still renders something. */
const REASON_GLYPH = {
  late: (            /* a clock */
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  cantmake: (        /* a crossed circle */
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-6 6" />
      <path d="M9 9l6 6" />
    </>
  ),
  leaveearly: (      /* out through a door */
    <>
      <path d="M10 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  broken: (          /* a spanner */
    <>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </>
  ),
};

/* Module level (design rule 7). `aria-hidden` because the label right beside it
   already says the same thing out loud, and a screen reader announcing "clock,
   Running late" is worse than "Running late". */
function ReasonIcon({ id, size = 26 }) {
  const glyph = REASON_GLYPH[String(id)];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* ★ NEVER NOTHING. An unknown reason draws a dot, so a new one added to
          the leaf shows up looking plain rather than looking broken. */}
      {glyph || <circle cx="12" cy="12" r="3" />}
    </svg>
  );
}

const api = async (path, body, method = "POST") => {
  const init = { method, headers: { "x-hub-token": hubToken(), "content-type": "application/json" } };
  if (method === "POST") init.body = JSON.stringify(body || {});
  const r = await fetch(path, init);
  return r.json().catch(() => null);
};

export default function Escalate({ user }) {
  const [rows, setRows] = useState([]);
  const [isLeader, setIsLeader] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  /* compose */
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(null);   // { reached } after a successful send

  /* one line of outcome, per record, on the leader's side */
  const [outcome, setOutcome] = useState({});

  const load = async () => {
    const d = await api("/api/escalations", null, "GET");
    if (!d || !d.ok) { setErr("Could not load these just now."); setLoading(false); return; }
    setRows(Array.isArray(d.escalations) ? d.escalations : []);
    setIsLeader(!!d.isLeader);
    setErr("");
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const send = async () => {
    if (!reason) { setErr("Pick a reason."); return; }
    setBusy("send");
    const d = await api("/api/escalation", { action: "send", reason, note });
    setBusy("");
    if (!d || !d.ok) {
      setErr(d && d.error ? String(d.error) : "That did not send, and nothing was logged.");
      return;
    }
    setReason(""); setNote(""); setErr("");
    setSent({ reached: Number(d.reached || 0) });
    await load();
  };

  const markSeen = async (e) => {
    setBusy(e.id);
    const d = await api("/api/escalation", { action: "seen", id: e.id, outcome: outcome[e.id] || "" });
    setBusy("");
    if (!d || !d.ok) { setErr(d && d.error ? String(d.error) : "That did not save."); return; }
    setOutcome((o) => ({ ...o, [e.id]: "" }));
    setErr("");
    await load();
  };

  if (!user) return <div style={box}>Sign in to the Hub to use this.</div>;
  if (loading) return <div style={box}>Loading…</div>;

  const waiting = rows.filter((e) => !isSeen(e));
  const answered = rows.filter((e) => isSeen(e));

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* ⚠️ TWO DIFFERENT BANDS, BECAUSE TWO DIFFERENT JOBS OPEN THIS SCREEN. A
          leader is triaging a queue, so the figure is what is still waiting on
          them. A team member is SENDING one thing, and a big number over that
          would be answering a question they did not ask — hence `soft`.
          Colour is the Tell-a-Leader tile's own #8C2F39 from App.jsx. */}
      <ToolHero
        color="#8C2F39"
        soft={!isLeader}
        label={isLeader ? "Waiting on a leader" : "Tell a leader"}
        value={isLeader ? (waiting.length || "All answered") : "Something come up?"}
        note={isLeader
          ? (waiting.length === 1 ? "One person is waiting to hear back"
            : waiting.length ? "People waiting to hear back" : "Nobody is waiting")
          : "It goes to whoever is running the shift right now"}
      />
      {err && (
        <div style={{ ...box, background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontSize: 13 }}>
          {err}
        </div>
      )}

      {/* ── SEND ────────────────────────────────────────────────────────
          Everyone gets this, leaders included. A leader on a break still
          needs to tell the leader who is on that they are running late. */}
      <div style={box}>
        <div style={{ fontWeight: 800, fontSize: 15, color: INK }}>Tell the leader on now</div>
        <div style={{ fontSize: 12.5, color: GRAY, marginTop: 4 }}>
          This goes straight to whoever is running the shift right now. You do not have to know who that is.
        </div>

        {/* ⚠️ TWO ACROSS ON A PHONE, not a wrapped row of pills. `1 1 calc(50%
            - 4px)` gives four big square-ish targets in a 2x2 block, which is
            what a thumb hits without looking. The old row put "Running late"
            and "Cannot make it" on one line at 13.5px and they read as one
            sentence at arm's length. */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {REASONS.map((r) => {
            const on = reason === r.id;
            return (
              <button key={r.id} onClick={() => { setReason(r.id); setSent(null); }}
                aria-pressed={on}
                style={{
                  flex: "1 1 calc(50% - 4px)", minWidth: 130,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                  background: on ? NAVY : "#fff", color: on ? "#fff" : INK,
                  border: `1px solid ${on ? NAVY : LINE}`, borderRadius: 12,
                  padding: "14px 10px", fontSize: 13.5, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit", lineHeight: 1.2,
                }}>
                <ReasonIcon id={r.id} />
                <span>{r.label}</span>
              </button>
            );
          })}
        </div>

        {/* Capped at 300 to match the route. The cap is not a style choice: a
            leader triaging this mid-rush reads it on a phone in one glance. */}
        <textarea style={{ ...inp, marginTop: 10, minHeight: 70, resize: "vertical" }}
          maxLength={300} placeholder="Anything they need to know (optional)"
          value={note} onChange={(e) => setNote(e.target.value)} />

        <div style={{ fontSize: 11.5, color: AMBER, marginTop: 4 }}>
          Once sent this cannot be edited or deleted. It stays on the record.
        </div>

        <button style={{ ...btn(), marginTop: 10 }} disabled={busy === "send" || !reason} onClick={send}>
          {busy === "send" ? "Sending…" : "Send"}
        </button>

        {/* ★ ZERO IS NOT A QUIET SUCCESS. If the board has nobody on that
            daypart the escalation is still logged — a leader sees it in the
            list below — but the person who sent it has to be told nobody was
            paged, or they will stand in a car park believing somebody knows. */}
        {sent && (
          sent.reached > 0 ? (
            <div style={{ fontSize: 13, fontWeight: 700, color: GREEN, marginTop: 10 }}>
              Sent. {sent.reached} {sent.reached === 1 ? "leader has" : "leaders have"} been told.
            </div>
          ) : (
            <div style={{ marginTop: 10, padding: 10, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, fontSize: 13, color: INK }}>
              <b>Logged, but nobody was paged.</b> The board does not show a leader on right now. Call the store as well.
            </div>
          )
        )}
      </div>

      {/* ── THE LIST ────────────────────────────────────────────────────
          A leader sees the store's. A team member sees only their own, and
          the server is what enforces that — /api/escalations filters through
          escalations.js before it answers, so this screen never receives a
          colleague's row and hides it. */}
      <div style={box}>
        <div style={{ fontWeight: 800, fontSize: 15, color: INK }}>
          {isLeader ? "Needs a leader" : "What you have sent"}
        </div>

        {rows.length === 0 && (
          <div style={{ fontSize: 13, color: GRAY, marginTop: 6 }}>Nothing yet.</div>
        )}

        {(isLeader ? waiting : rows).map((e) => (
          <Row key={e.id} e={e} isLeader={isLeader} busy={busy}
            outcome={outcome} setOutcome={setOutcome} markSeen={markSeen} />
        ))}

        {isLeader && waiting.length === 0 && rows.length > 0 && (
          <div style={{ fontSize: 13, color: GREEN, fontWeight: 700, marginTop: 6 }}>All answered.</div>
        )}
      </div>

      {isLeader && answered.length > 0 && (
        <div style={box}>
          <div style={{ fontWeight: 800, fontSize: 15, color: INK }}>Answered</div>
          {answered.map((e) => (
            <Row key={e.id} e={e} isLeader={isLeader} busy={busy}
              outcome={outcome} setOutcome={setOutcome} markSeen={markSeen} />
          ))}
        </div>
      )}
    </div>
  );
}

/* One record. Module level so it cannot close over the parent's state by
   accident, and so both lists draw the identical thing (design rule 8: the
   same row rendered twice is the same function once). */
function Row({ e, isLeader, busy, outcome, setOutcome, markSeen }) {
  const seen = isSeen(e);
  return (
    <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 10, marginTop: 10 }}>
      {/* ★ THE SAME GLYPH ON THE LIST SIDE. escalations.js says the reasons are
          a preset list so "a leader can triage twelve of these at a glance
          during a rush" — twelve identical-looking grey headings is not a
          glance, and the icon is the thing that makes the sentence true. */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 800, fontSize: 14, color: seen ? GRAY : RED }}>
        <ReasonIcon id={e.reason} size={18} />
        <span>{reasonLabel(e.reason) || "Needs a leader"}</span>
      </div>
      <div style={{ fontSize: 12, color: GRAY, marginTop: 2 }}>
        {e.byName} · {whenText(e.at)}
        {e.daypart ? ` · ${daypartWord(e.daypart)}` : ""}
      </div>
      {e.note && (
        <div style={{ fontSize: 13.5, color: INK, marginTop: 6, whiteSpace: "pre-wrap" }}>{e.note}</div>
      )}

      {/* ★ WHO IT REACHED, FROZEN ONTO THE RECORD AT SEND TIME. Shown to a
          leader reading it back, never on the send screen. This is the answer
          to "who was on when I said I could not make it" months later, which
          is the question a record like this exists for. */}
      {isLeader && (
        <div style={{ fontSize: 11.5, color: GRAY, marginTop: 4 }}>
          {e.routedTo && e.routedTo.length
            ? `Went to ${e.routedTo.join(", ")}`
            : "Nobody was on the board for that daypart"}
        </div>
      )}

      {seen ? (
        <div style={{ fontSize: 12, color: GREEN, fontWeight: 700, marginTop: 6 }}>
          Answered by {e.seen.byName} {whenText(e.seen.at)}
          {e.seen.outcome ? <span style={{ color: INK, fontWeight: 400 }}> — {e.seen.outcome}</span> : null}
        </div>
      ) : isLeader ? (
        /* ⚠️ ONE LINE, AND IT IS THE LEADER'S ONLY. Not a reply box: there is
           no field on the member's side to answer it with, on purpose. */
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <input style={{ ...inp, width: "auto", flex: "1 1 200px" }} maxLength={200}
            placeholder="What you did about it (optional)"
            value={outcome[e.id] || ""}
            onChange={(ev) => { const v = ev.target.value; setOutcome((o) => ({ ...o, [e.id]: v })); }} />
          <button style={btn(GREEN)} disabled={busy === e.id} onClick={() => markSeen(e)}>
            {busy === e.id ? "Saving…" : "Got it"}
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: GRAY, marginTop: 6, fontStyle: "italic" }}>
          Waiting on a leader. If it is urgent, call the store.
        </div>
      )}
    </div>
  );
}
