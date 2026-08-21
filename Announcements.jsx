/* ============================================================================
   Announcements.jsx — POST SOMETHING, AND SEE WHO ACTUALLY READ IT

   Matt, Aug 13 2026: "This is the one Slack is genuinely bad at, and it ships
   first." The thing Slack cannot do is tell you, by name, who has not seen the
   closing change yet.

   ⚠️⚠️ THIS SCREEN IS NOT A CHAT AND MUST NOT GROW INTO ONE. There is no reply
   box, no recipient picker for one person, no thread. An announcement goes to
   an AUDIENCE — everyone, a role, a team, or a shift. The reasoning is Matt's
   and it is not aesthetic: "free-form employee messages in a system I host make
   me the custodian of records that get subpoenaed in a harassment or wage
   claim. Attached messaging is narrow enough to be defensible. Open chat is
   not." If somebody later adds a reply field here, that is the drift.

   ⚠️ EVERY RULE COMES FROM announcements.js. Who may see one, what a read list
   is, whether a signature is still owed — all in the leaf, because the Worker
   answers the same questions and two copies drift. This file renders.

   ⚠️ THE SERVER DECIDES WHAT ARRIVES. /api/announcements-mine already filters
   to what this person may see and strips the read list from non-leaders. This
   screen never receives the store's announcements and hides rows.
   ============================================================================ */

import React, { useEffect, useMemo, useState } from "react";
import { toolCard } from "./cardStyle.js";
import ToolHero from "./ToolHero.jsx";
import { hubToken } from "./store.js";
import {
  ACK_STATEMENT, AUDIENCE_KINDS, audienceLabel,
  isRetracted, readList, hasOpened, hasAcked, stampFor,
} from "./announcements.js";
import { bareId, sameId } from "./nameMatch.js";
import { loadHRTeamResult } from "./hrTeam.js";
import { hrDisplayName, hrTierOfTitle } from "./hrRoster.js";

const NAVY = "#1B3A5C", INK = "#232A31", GRAY = "#6B7480", LINE = "#E3E7EC";
const GREEN = "#166B4A", RED = "#DD0031", AMBER = "#7A5A00";
const C = { ink: INK, sub: GRAY, line: LINE };

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
   ⚠️ THE TONE IS THIS TILE'S OWN COLOUR, the one App.jsx gives Announcements, not
   the neutral navy a card with nothing to say gets. Duplicated rather than
   imported because App.jsx is a component and importing one component into
   another is how the cycle this repo keeps hitting comes back. */
const TONE = "#B45309";
const box = { ...toolCard(TONE), borderRadius: 14, padding: 14, marginBottom: 12 };
const inp = {
  width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 10,
  border: `1px solid ${LINE}`, boxSizing: "border-box", fontFamily: "inherit",
};
const btn = (bg = NAVY) => ({
  background: bg, color: "#fff", border: "none", borderRadius: 10,
  padding: "10px 16px", fontSize: 14, fontWeight: 800, cursor: "pointer",
});

/* A time a person reads, not an ISO string. Module level (design rule 7). */
function whenText(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

const api = async (path, body, method = "POST") => {
  const init = { method, headers: { "x-hub-token": hubToken(), "content-type": "application/json" } };
  if (method === "POST") init.body = JSON.stringify(body || {});
  const r = await fetch(path, init);
  return r.json().catch(() => null);
};

/* The head of a read list: the count, always visible, and a tap to show the
   names. ⚠️ MODULE LEVEL (design rule 7) — a helper declared inside the
   component can be read in its temporal dead zone by anything that runs during
   render, and this file already renders it inside a map.
   ⚠️ A ZERO STILL DRAWS ITS HEAD, so "Everyone has" has something to sit under
   and the two columns stay the same height. It is not a button when there is
   nothing to open: a control that does nothing is worse than no control. */
function ReadHead({ label, tone, n, on, onClick }) {
  const head = (
    <span style={{ fontSize: 11.5, fontWeight: 800, color: tone }}>
      {label} · {n}{n > 0 ? (on ? " ▾" : " ▸") : ""}
    </span>
  );
  if (!n) return <div>{head}</div>;
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
      {head}
    </button>
  );
}

export default function Announcements({ user, openRowId }) {
  const [rows, setRows] = useState([]);
  const [isLeader, setIsLeader] = useState(false);
  const [uid, setUid] = useState("");
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [openId, setOpenId] = useState("");
  const [busy, setBusy] = useState("");
  /* ⭐ WHICH READ LISTS ARE OPEN. Matt, Aug 21 2026, looking at 92 names in a
     column: "in announcements this needs to be collapsible."

     ⚠️⚠️ THIS REVERSES A DELIBERATE DECISION AND THE OLD REASON IS KEPT BELOW SO
     NOBODY QUIETLY REVERSES IT BACK. The comment at the read list said the
     not-opened column "is the one with the value in it, so it is not hidden
     behind anything." That was right about WHERE THE VALUE IS and wrong about
     what it costs: at this store the list is 92 names, so every announcement
     card grew a wall that the next card had to be scrolled past.
     ⇒ THE COUNT IS THE VALUE AND IT STAYS VISIBLE ALWAYS. Only the NAMES fold,
     and both columns fold the same way so neither reads as the important one.
     Same rule the Report Card already follows: the shut page is the report.
     ⚠️ Keyed by announcement AND column, so opening the not-opened list on one
     card does not open it on forty. */
  const [readOpen, setReadOpen] = useState(() => new Set());
  const toggleRead = (k) => setReadOpen((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  /* compose */
  const [title, setTitle] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [kind, setKind] = useState("everyone");
  const [role, setRole] = useState("");
  /* ⚠️ CONFIRMATION IS ON BY DEFAULT. Matt, Aug 14 2026: "Require read for all
     important announcements."

     The Hub cannot know which announcement is important, so the choice is
     which way round the poster has to think. Off by default means every
     important one depends on somebody remembering to tick a box, and the ones
     that get forgotten are the ones sent in a hurry — which are exactly the
     ones that matter. On by default means the only thing anybody has to
     remember is to UNtick it for something trivial, and forgetting that costs
     one unnecessary tap for the reader instead of an unread policy change.

     Same reasoning as the rest of this repo: build the guard, do not rely on
     remembering. */
  const [needAck, setNeedAck] = useState(true);
  const [sig, setSig] = useState("");

  /* ⚠️ THE SERVER STILL DECIDES WHAT ARRIVES — see the note at the top of this
     file. This flag asks it a different question; it never hides a row that
     arrived. `hidden` is the server's count of what it left out, so the offer
     to see the full record is only drawn when there IS one. */
  const [showReplaced, setShowReplaced] = useState(false);
  const [hidden, setHidden] = useState(0);

  const load = async (all = showReplaced) => {
    const d = await api(`/api/announcements-mine${all ? "?all=1" : ""}`, null, "GET");
    if (!d || !d.ok) { setErr("Could not load announcements just now."); setLoading(false); return; }
    setRows(Array.isArray(d.announcements) ? d.announcements : []);
    setIsLeader(!!d.isLeader);
    setUid(String(d.uid || ""));
    setHidden(Number(d.hidden) || 0);
    setErr("");
    setLoading(false);
  };

  useEffect(() => { let alive = true; (async () => {
    await load();
    try {
      const t = await loadHRTeamResult();
      if (alive && t && Array.isArray(t.team)) setPeople(t.team);
    } catch { /* names fall back to ids */ }
  })(); return () => { alive = false; }; }, []);

  /* ⭐ THE NOTIFICATION FINISHES ITS SENTENCE. Matt, Aug 20 2026: "When viewing
     an announcement you should see the whole thing here." The push carries the
     whole announcement now and lands on `?to=announce&open=<id>`, which App.jsx
     hands down as `openRowId`. This expands that row, and `openRow` marks it
     opened through the same route a tap on the list uses.

     ⚠️⚠️ IT EXPANDS AND MARKS OPENED. IT DOES NOT SIGN. Confirming stores a
     TYPED signature against ACK_STATEMENT, and the comment at that constant
     says why: the words agreed to are kept beside the signature so a receipt
     reads years later. A lock-screen tap is "I dismissed a banner", and
     recording it as a signature would empty the only field on the record that
     means anything. What this removes is the HUNTING — the Confirm box is on
     screen with nothing to find.

     ⚠️ AFTER `rows` ARRIVE, NEVER ON MOUNT. openRow needs the announcement to
     mark it opened, and on mount there are none — it would have set the id and
     silently skipped the open, so the row would look read-but-unrecorded.
     ⚠️ ONCE. `done` stops a later reload from re-expanding a row somebody has
     deliberately closed. */
  const [deepDone, setDeepDone] = useState(false);
  useEffect(() => {
    if (deepDone || !openRowId || !rows.length) return;
    const hit = rows.find((a) => String(a.id) === String(openRowId));
    setDeepDone(true);
    if (hit) openRow(hit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRowId, rows, deepDone]);

  /* One name lookup, handed to the leaf. The leaf has no roster and must not
     grow one — it is handed a function and returns rows. */
  /* My own signature stamp on one announcement, or null. Goes through the leaf
     so this and `hasAcked` can never disagree about whether I signed. */
  const myAck = (a) => stampFor(a && a.acks, uid);

  const nameOf = useMemo(() => (id) => {
    const p = people.find((x) => sameId(x.id, id));
    return p ? hrDisplayName(p) : String(id);
  }, [people]);

  const roles = useMemo(
    () => Array.from(new Set(people.map((p) => String(p.role || "")).filter(Boolean))).sort(),
    [people]
  );

  /* ⚠️ THE SAME TEST THE ROW BELOW USES, NOT A SECOND OPINION ABOUT IT. The
     row computes `owes` inline from these four conditions; if this counted
     differently the band would say "2 to confirm" over a list showing three,
     and the number on screen is the thing a person trusts. Design rule 8.
     ⚠️ A LEADER SEES EVERY ANNOUNCEMENT, INCLUDING ONES NOT AIMED AT THEM, so
     `mineToRead` is part of the test rather than assumed. Without it the band
     would tell Matt he owes a confirmation on a notice sent to the kitchen. */
  const owedByMe = useMemo(
    () => rows.filter((a) =>
      a.requiresAck && !isRetracted(a)
      && (a.targetIds || []).some((x) => sameId(x, uid))
      && !hasAcked(a, uid)).length,
    [rows, uid]
  );

  /* ⚠️ RESOLVED HERE, STORED BY THE SERVER, NEVER RECOMPUTED ON READ. Somebody
     who changes role next month must still appear on the read list of an
     announcement sent to their old role — the question it answers is "who was
     told", not "who would be told today". */
  const targetsFor = () => {
    const live = people.filter((p) => String(p.status || "").toLowerCase() !== "terminated");
    /* ⚠️ TIER 2 AND UP, FROM THE ONE LADDER. `hrTierOfTitle` is what HR access
       and the Lineup's groups already read, so "who is a leader" has a single
       answer across the Hub. Tier 2 is Team Leader, Senior Trainer, Assistant
       Director and Director; tier 3 is the Owner, HR and the Executive
       Directors. Both are leadership; a Director is tier 2, not 3, which is the
       trap that nearly shipped a group headed "Directors" with no Directors
       in it. */
    if (kind === "leaders") return live.filter((p) => hrTierOfTitle(p.role) >= 2).map((p) => String(p.id));
    if (kind === "role") return live.filter((p) => String(p.role || "") === role).map((p) => String(p.id));
    return live.map((p) => String(p.id));
  };

  const post = async () => {
    const ids = targetsFor();
    if (!title.trim() || !bodyText.trim()) { setErr("An announcement needs a title and a message."); return; }
    if (!ids.length) { setErr("That reaches nobody. Pick a different audience."); return; }
    setBusy("post");
    const d = await api("/api/announcement", {
      action: "create", title, body: bodyText,
      audience: { kind, role },
      targetIds: ids, requiresAck: needAck,
    });
    setBusy("");
    if (!d || !d.ok) { setErr(d && d.error ? String(d.error) : "That did not send, and nothing was posted."); return; }
    /* ⚠️ RESET TO THE DEFAULT, WHICH IS NOW true, NOT TO false. This line is
       the whole change's second half and it is easy to miss: leaving it at
       false would put confirmation on for the first announcement of a session
       and quietly off for every one after it, which is worse than either
       setting because nobody would ever notice the pattern. */
    setTitle(""); setBodyText(""); setNeedAck(true); setErr("");
    await load();
  };

  /* ⚠️ MARKING IT READ IS THE ACT OF OPENING IT, not of opening the Hub
     (Matt's ruling). So this fires when the reader expands the row, and only
     for a recipient — a leader browsing the store's announcements is not a
     reader of one that was never sent to them. */
  const openRow = async (a) => {
    const next = openId === a.id ? "" : a.id;
    setOpenId(next);
    if (!next) return;
    const mine = (a.targetIds || []).some((x) => sameId(x, uid));
    if (!mine || hasOpened(a, uid)) return;
    await api("/api/announcement", { action: "open", id: a.id });
    await load();
  };

  const acknowledge = async (a) => {
    if (!sig.trim()) { setErr("Type your name to confirm."); return; }
    setBusy(a.id);
    const d = await api("/api/doc-ack", { kind: "announcement", id: a.id, sig });
    setBusy("");
    if (!d || !d.ok) {
      setErr(
        d && d.error === "already-signed" ? "That is already recorded as confirmed."
        : d && d.error === "not-a-recipient" ? "This was not sent to you, so it cannot be confirmed here."
        : d && d.error === "retracted" ? "That announcement was withdrawn, so it no longer needs confirming."
        : "That did not save, and nothing was changed."
      );
      return;
    }
    setSig(""); setErr("");
    await load();
  };

  const retract = async (a) => {
    const why = window.prompt("Withdraw this announcement. It stays visible, marked withdrawn.\n\nWhy? (optional)");
    if (why === null) return;
    setBusy(a.id);
    await api("/api/announcement", { action: "retract", id: a.id, why });
    setBusy("");
    await load();
  };

  if (!user) return <div style={box}>Sign in to the Hub to see announcements.</div>;
  if (loading) return <div style={box}>Loading…</div>;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* ⚠️ THE COLOUR IS THE ANNOUNCEMENTS TILE'S OWN #B45309 FROM App.jsx, not
          a colour chosen here. A person taps an amber tile and lands on an amber
          screen, which is the whole of what "consistent" means on a phone. */}
      <ToolHero
        color="#B45309"
        label="Announcements"
        value={loading ? "…" : owedByMe > 0 ? owedByMe : "All clear"}
        note={loading ? "Loading" : owedByMe > 0
          ? (owedByMe === 1 ? "Tap it and confirm you read it" : "Tap each one and confirm you read it")
          : "Nothing is waiting on you"}
      />
      {err && (
        <div style={{ ...box, background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontSize: 13 }}>
          {err}
        </div>
      )}

      {isLeader && (
        <div style={box}>
          <div style={{ fontWeight: 800, fontSize: 15, color: C.ink, marginBottom: 8 }}>Post an announcement</div>
          <input style={inp} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea style={{ ...inp, marginTop: 8, minHeight: 90, resize: "vertical" }}
            placeholder="What do they need to know?" value={bodyText}
            onChange={(e) => setBodyText(e.target.value)} />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <select style={{ ...inp, width: "auto" }} value={kind} onChange={(e) => setKind(e.target.value)}>
              {/* ⚠️ NAMED, NOT DERIVED FROM THE KEY. The old version printed
                  "Everyone" or "One role" off a two-way test, which quietly
                  mislabels the moment a third kind exists. `team` and `shift`
                  are in AUDIENCE_KINDS and have no compose UI yet, so they stay
                  out of this list rather than rendering as a blank option. */}
              {[["everyone", "The whole team"], ["leaders", "Leadership"], ["role", "One role"]].map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
            {kind === "role" && (
              <select style={{ ...inp, width: "auto" }} value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">Pick a role…</option>
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, color: C.ink }}>
            <input type="checkbox" checked={needAck} onChange={(e) => setNeedAck(e.target.checked)} />
            Require each person to confirm they have read it
          </label>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>
            Goes to {targetsFor().length} {targetsFor().length === 1 ? "person" : "people"} · {audienceLabel({ kind, role })}
          </div>
          {/* ⚠️ SAID OUT LOUD, BECAUSE IT CANNOT BE UNDONE. A sent announcement
              cannot be edited or deleted, only withdrawn, and people should know
              that before they tap rather than after. */}
          <div style={{ fontSize: 11.5, color: AMBER, marginTop: 4 }}>
            Once sent this cannot be edited or deleted. You can withdraw it, and it stays visible marked withdrawn.
          </div>
          <button style={{ ...btn(), marginTop: 10 }} disabled={busy === "post"} onClick={post}>
            {busy === "post" ? "Sending…" : "Send"}
          </button>
        </div>
      )}

      <div style={box}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: C.ink }}>
            {isLeader ? "All announcements" : "For you"}
          </div>
          {/* ⚠️ IT NAMES THE NUMBER. "Show replaced" alone reads as a setting;
              "3 older versions hidden" is a fact somebody can decide about. */}
          {(hidden > 0 || showReplaced) && (
            <button
              type="button"
              onClick={() => { const v = !showReplaced; setShowReplaced(v); load(v); }}
              style={{
                border: "none", background: "none", padding: 0, cursor: "pointer",
                fontSize: 12.5, fontWeight: 700, color: C.sub, textDecoration: "underline",
              }}
            >
              {showReplaced ? "Hide replaced" : `Show ${hidden} replaced`}
            </button>
          )}
        </div>
        {rows.length === 0 && (
          <div style={{ fontSize: 13, color: C.sub, marginTop: 6 }}>Nothing yet.</div>
        )}
        {rows.map((a) => {
          const gone = isRetracted(a);
          const mineToRead = (a.targetIds || []).some((x) => sameId(x, uid));
          const owes = a.requiresAck && !gone && mineToRead && !hasAcked(a, uid);
          const list = isLeader ? readList(a, nameOf) : null;
          return (
            <div key={a.id} style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10, marginTop: 10 }}>
              <button onClick={() => openRow(a)}
                style={{ background: "none", border: "none", padding: 0, textAlign: "left", width: "100%", cursor: "pointer" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: gone ? C.sub : C.ink, textDecoration: gone ? "line-through" : "none" }}>
                  {a.title}
                </div>
                <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
                  {a.byName} · {whenText(a.createdAt)} · {a.audienceLabel}
                  {a.requiresAck ? " · confirmation required" : ""}
                </div>
              </button>

              {gone && (
                <div style={{ fontSize: 12, fontWeight: 700, color: RED, marginTop: 4 }}>
                  Withdrawn {whenText(a.retracted.at)} by {a.retracted.byName}
                  {a.retracted.why ? ` — ${a.retracted.why}` : ""}
                </div>
              )}

              {openId === a.id && (
                <>
                  <div style={{ fontSize: 13.5, color: C.ink, marginTop: 8, whiteSpace: "pre-wrap" }}>{a.body}</div>

                  {owes && (
                    <div style={{ marginTop: 10, padding: 10, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10 }}>
                      <div style={{ fontSize: 12.5, color: INK }}>{ACK_STATEMENT}</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        <input style={{ ...inp, width: "auto", flex: "1 1 180px" }} placeholder="Type your name"
                          value={sig} onChange={(e) => setSig(e.target.value)} />
                        <button style={btn(GREEN)} disabled={busy === a.id} onClick={() => acknowledge(a)}>
                          {busy === a.id ? "Saving…" : "Confirm"}
                        </button>
                      </div>
                    </div>
                  )}
                  {/* ⚠️ THE STAMP IS FETCHED THROUGH THE LEAF, NOT INDEXED.
                      `hasAcked` matches on the BARE id, so it can be true while
                      `a.acks[uid]` is undefined — a record whose map was keyed
                      "tm55" rather than "55" would make this line read `.at` of
                      undefined and take the whole tile down. That is design
                      rule 1 exactly: `item.images.map()` on a key the writer
                      never set. One lookup, one answer, both from stampFor. */}
                  {a.requiresAck && mineToRead && myAck(a) && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, marginTop: 8 }}>
                      You confirmed this {whenText(myAck(a).at)}
                    </div>
                  )}

                  {/* ★ THE READ LIST — NAMES, NOT A COUNT (Matt's word). The
                      not-opened column is the one with the value in it, so it is
                      not hidden behind anything. Leaders only: the server does
                      not even send `opens` to anybody else. */}
                  {isLeader && list && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>
                        Opened {list.openedCount} of {list.totalCount}
                        {a.requiresAck ? ` · confirmed ${list.ackedCount}` : ""}
                      </div>
                      <div style={{ display: "flex", gap: 14, marginTop: 6, flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 200px" }}>
                          <ReadHead label="Opened" tone={GREEN} n={list.opened.length}
                            on={readOpen.has(`${a.id}:o`)} onClick={() => toggleRead(`${a.id}:o`)} />
                          {list.opened.length === 0 && <div style={{ fontSize: 12, color: C.sub }}>Nobody yet</div>}
                          {readOpen.has(`${a.id}:o`) && list.opened.map((p) => (
                            <div key={p.id} style={{ fontSize: 12, color: C.ink }}>
                              {p.name} <span style={{ color: C.sub }}>{whenText(p.openedAt)}</span>
                              {p.ackedAt && <span style={{ color: GREEN, fontWeight: 700 }}> ✓</span>}
                            </div>
                          ))}
                        </div>
                        <div style={{ flex: "1 1 200px" }}>
                          <ReadHead label="Not opened" tone={RED} n={list.notOpened.length}
                            on={readOpen.has(`${a.id}:n`)} onClick={() => toggleRead(`${a.id}:n`)} />
                          {list.notOpened.length === 0 && <div style={{ fontSize: 12, color: C.sub }}>Everyone has</div>}
                          {readOpen.has(`${a.id}:n`) && list.notOpened.map((p) => (
                            <div key={p.id} style={{ fontSize: 12, color: C.ink }}>{p.name}</div>
                          ))}
                        </div>
                      </div>
                      {!gone && (
                        <button style={{ ...btn("#7A1220"), marginTop: 10, fontSize: 12.5, padding: "7px 12px" }}
                          disabled={busy === a.id} onClick={() => retract(a)}>
                          Withdraw
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
