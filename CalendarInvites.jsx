import React, { useState, useEffect, useMemo } from "react";
/* The shared raised look — see cardStyle.js. */
import { CARD_3D, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
/* ⚠️ `hubToken` AND NOTHING ELSE FROM store.js. No kvGet, no kvSet. Every read
   comes from /api/calendar-mine and every write from /api/calendar-event, so
   this file can neither fetch a meeting it is not in nor write a row it does
   not own. That is a property worth keeping: if an import line here ever grows
   a kv helper, the guarantee is gone. */
import { hubToken } from "./store.js";
import {
  eventList, upcomingEvents, awaitingReply, attendance, replyStatus, replyMap, durationText, joinDuration,
  clashesFor, busyItems,
  INVITED, ACCEPTED, DECLINED,
} from "./calendarStore.js";
import { bareId, sameId } from "./nameMatch.js";
import { loadHRTeamResult } from "./hrTeam.js";
import { hrDisplayName } from "./hrRoster.js";

/**
 * CalendarInvites — the answering half of the internal calendar.
 *
 * Stage 2 of Bri's invitations. calendarStore.js holds every rule; the Worker
 * route /api/calendar-event does every write. This file reads and renders, and
 * the only thing it decides on its own is what to show.
 *
 * Bri, Aug 11 2026: "let's make an option to self-schedule ourselves on the
 * calendar, as well as invite others… They should be able to accept or decline
 * anything scheduled… I want to also be able to reschedule and propose new
 * days/times if needed."
 *
 * ★ IT SITS BESIDE THE BOOKING SCREEN, NEVER OVER IT. CalendarTile's times,
 * types and month view are untouched. Booking is somebody taking one of YOUR
 * published times; this is you naming a time and asking people. Opposite
 * arrows, both real, and the working one does not get traded for the new one
 * (design rule 16).
 *
 * ⚠️⚠️ EVERY WRITE GOES THROUGH THE ROUTE, WITHOUT EXCEPTION. Not one kvSet in
 * this file. The one-writer-per-row rule that makes five people answering an
 * L10 safe is enforced in the Worker off the signed token, and a browser that
 * wrote these rows directly would walk straight around it — it could answer as
 * somebody else, or record consent to a time it was never asked about.
 *
 * ⚠️⚠️ IT ASKS THE WORKER WHAT IT IS IN. It does NOT read the meeting rows.
 * Events are keyed by ORGANISER, so "what am I invited to" has no index, and
 * the first version of this file scanned every leader's row and filtered here.
 * That put every leader's meeting titles and notes into the browser before it
 * decided what to draw — survivable at four directors, not at ~106 people on
 * shared iPads. /api/calendar-mine returns only what this person is in.
 * ⚠️ A FAILED READ SAYS SO rather than rendering a confident empty list.
 * "Nothing today" and "we could not find out" are different sentences.
 *
 * ⚠️ AN ANSWER TO A MOVED MEETING IS NOT AN ANSWER, and that rule lives in
 * calendarStore's replyStatus. This file must never compare `status` itself,
 * or the screen would say "accepted" for a time the person never agreed to
 * while the Worker and the organiser's tally both said otherwise.
 */

/* ── pure helpers, module level so nothing can read them mid-render ───────── */
const asList = (v) => (Array.isArray(v) ? v : []);

/* The stored `at` is a datetime-local string. Shown in the DEVICE's own day,
   never by slicing the ISO text — see the dayKey note in calendarStore.js for
   the evening-shift bug that convention caused. */
const whenText = (at) => {
  const d = new Date(at);
  return isNaN(d) ? String(at || "") : d.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
};

const nameOf = (people, id) => {
  const hit = asList(people).find((p) => p && sameId(p.id, id));
  return (hit && hit.name) || `#${bareId(id)}`;
};

const namesOf = (people, ids) => asList(ids).map((id) => nameOf(people, id)).join(", ");

const C = {
  ink: "#111827", sub: "#6B7280", line: "#E5E7EB", card: "#FFFFFF",
  green: "#166534", red: "#B91C1C", blue: "#1D4ED8", amber: "#92400E",
};

const box = {
  background: C.card, border: `1px solid ${C.line}`, borderRadius: 14,
  padding: 16, marginTop: 14, ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D,
};
const btn = (kind) => ({
  fontSize: 12.5, fontWeight: 700, padding: "7px 12px", borderRadius: 9, cursor: "pointer",
  border: `1px solid ${kind === "solid" ? C.blue : C.line}`,
  background: kind === "solid" ? C.blue : "#fff",
  color: kind === "solid" ? "#fff" : C.ink,
});
const field = {
  width: "100%", borderRadius: 9, border: `1px solid ${C.line}`, padding: "8px 10px", fontSize: 13.5,
};

const STATUS_WORD = { [ACCEPTED]: "Going", [DECLINED]: "Not going", [INVITED]: "No answer yet" };
const STATUS_COLOUR = { [ACCEPTED]: C.green, [DECLINED]: C.red, [INVITED]: C.sub };

export default function CalendarInvites({ viewer }) {
  const myId = viewer && viewer.id;

  const [people, setPeople] = useState([]);
  const [mine, setMine] = useState([]);            // events I organise
  const [invited, setInvited] = useState([]);      // { ev, organiserId }
  const [myReplies, setMyReplies] = useState({});
  const [repliesByPerson, setRepliesByPerson] = useState({});
  const [loading, setLoading] = useState(true);
  const [partial, setPartial] = useState(false);   // at least one calendar could not be read
  const [err, setErr] = useState("");

  // the create form
  const [title, setTitle] = useState("");
  const [at, setAt] = useState("");
  const [hrs, setHrs] = useState("0");
  const [mins, setMins] = useState("30");
  const [picked, setPicked] = useState([]);
  const [note, setNote] = useState("");

  // per-event working state, keyed by event id
  /* ⚠️ THE WARNING IS A STEP, NOT A BLOCK. `clash` holds who is busy after a
     send was attempted; the same button then reads "Send anyway". Bri's
     sentence is "they can push the invite anyway if they choose", so there is
     no path here that refuses. */
  const [clash, setClash] = useState(null);
  const [moveTo, setMoveTo] = useState({});
  const [declineWith, setDeclineWith] = useState({});

  /* ⚠️⚠️ ONE READ, THROUGH THE WORKER, AND NEVER A SCAN OF EVERYBODY'S ROWS.
     This used to walk every calendar owner's events row and filter locally,
     which meant the browser had already been handed every leader's meeting
     titles and notes before it decided which ones to draw. Filtering in here
     hides them; it does not withhold them. /api/calendar-mine answers with
     only what this person is actually in. See the route's header for why that
     matters more now the screen is open to the whole store.
     ⚠️ THE ROSTER IS STILL READ HERE, and that is fine — it is names, it is
     already world-readable, and every tile reads it. Only the MEETINGS moved. */
  const load = async () => {
    setLoading(true);
    setErr("");
    let missed = false;

    const hr = await loadHRTeamResult().catch(() => ({ team: [] }));
    const team = asList(hr && hr.team)
      .filter((p) => p && p.id != null)
      .map((p) => ({ id: String(p.id), name: hrDisplayName(p) || p.name }));
    setPeople(team);

    try {
      const r = await fetch("/api/calendar-mine", { headers: { "x-hub-token": hubToken() } });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || d.ok !== true) {
        /* ⚠️ A FAILED READ IS NOT AN EMPTY DIARY. Saying so is the whole
           difference between "nothing today" and "we could not find out". */
        missed = true;
        setMine([]); setInvited([]); setMyReplies({}); setRepliesByPerson({});
      } else {
        setMine(eventList(d.mine));
        setInvited(asList(d.invited)
          .filter((x) => x && x.event)
          .map((x) => ({ ev: x.event, organiserId: String(x.organiserId) })));
        setMyReplies(replyMap(d.myReplies));
        setRepliesByPerson(d.repliesByPerson && typeof d.repliesByPerson === "object" ? d.repliesByPerson : {});
      }
    } catch {
      missed = true;
      setMine([]); setInvited([]); setMyReplies({}); setRepliesByPerson({});
    }

    setPartial(missed);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [myId]);

  /* ⚠️ ONE DOOR FOR EVERY WRITE. Every button below goes through here, so the
     token, the error handling and the reload can never differ between them. */
  const send = async (body) => {
    setErr("");
    try {
      const r = await fetch("/api/calendar-event", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || d.ok !== true) {
        setErr((d && d.error) || "That did not go through.");
        return null;
      }
      await load();
      return d;
    } catch {
      setErr("That did not go through. Check the wifi.");
      return null;
    }
  };

  const create = async (force) => {
    setErr("");
    /* ⚠️ ASKED ON SEND, NOT WHILE PICKING. A lookup per tap would argue with
       her while she is still choosing who is coming. One question, once, at the
       moment it can change a decision.
       ⚠️ A FAILED CHECK NEVER STOPS THE INVITATION. If we cannot find out who
       is busy, the meeting still goes — a scheduling tool that refuses because
       a warning did not load is worse than one that does not warn. */
    if (!force && picked.length) {
      try {
        const r = await fetch("/api/calendar-busy", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
          body: JSON.stringify({ at, mins: joinDuration(hrs, mins), ids: picked }),
        });
        const d = await r.json().catch(() => null);
        if (r.ok && d && d.ok === true && d.busy && Object.keys(d.busy).length) {
          setClash(d.busy);
          return;
        }
      } catch { /* fall through and send */ }
    }
    const d = await send({
      action: "create", title: title.trim(), at, mins: joinDuration(hrs, mins),
      inviteeIds: picked, note: note.trim(),
    });
    if (d) { setTitle(""); setAt(""); setPicked([]); setNote(""); setHrs("0"); setMins("30"); setClash(null); }
  };

  /* A warning is about one time and one list of people. Change either and it
     is about a meeting that no longer exists, so it goes. */
  const resetClash = () => setClash(null);

  const answer = async (organiserId, ev, status) => {
    const extra = declineWith[ev.id] || {};
    await send({
      action: "reply", organiserId, eventId: ev.id, status,
      proposedAt: status === DECLINED ? (extra.proposedAt || "") : "",
      note: status === DECLINED ? (extra.note || "") : "",
    });
    /* ⚠️ VALUE CAPTURED, NEVER READ INSIDE THE UPDATER. */
    const id = ev.id;
    setDeclineWith((m) => { const n = { ...m }; delete n[id]; return n; });
  };

  const move = async (ev) => {
    const to = moveTo[ev.id];
    if (!to) { setErr("Pick the new time first."); return; }
    const d = await send({ action: "reschedule", id: ev.id, at: to });
    if (d) {
      const id = ev.id;
      setMoveTo((m) => { const n = { ...m }; delete n[id]; return n; });
    }
  };

  const scrap = async (ev) => {
    if (!window.confirm(`Remove "${ev.title}"? Everybody invited keeps their own record and simply stops seeing it.`)) return;
    await send({ action: "cancel", id: ev.id });
  };

  const togglePerson = (id) => {
    /* ⚠️ THE ID IS CAPTURED FIRST. Reading it off the event inside the updater
       is the synthetic-event trap this repo checks for. */
    const v = String(id);
    resetClash();
    setPicked((cur) => (cur.some((x) => sameId(x, v)) ? cur.filter((x) => !sameId(x, v)) : [...cur, v]));
  };

  const ahead = useMemo(() => upcomingEvents(mine), [mine]);
  const toAnswer = useMemo(
    () => invited
      .filter(({ ev }) => upcomingEvents([ev]).length > 0)
      .sort((a, b) => String(a.ev.at).localeCompare(String(b.ev.at))),
    [invited]
  );
  /* ⚠️⚠️ THE HEADER BADGE'S NUMBER, FROM THE HEADER BADGE'S FUNCTION. This list
     above is every upcoming invitation and prints each one's status, accepted
     ones included — deliberately, because you want to see what you already said
     yes to. `awaitingReply` is narrower: no answer at all. That is what "pending"
     means and it is what the count on the calendar icon shows.
     Printing it HERE, from the same leaf call, is the whole point. A badge whose
     number cannot be found on the screen it opens is the bug Bri reported about
     the last one, when it said "1" and the panel showed nothing. */
  const unanswered = useMemo(
    () => awaitingReply(invited.map(({ ev }) => ev), myId, myReplies).length,
    [invited, myId, myReplies]
  );

  if (!viewer) return <div style={box}>Sign in to the Hub to see your meetings.</div>;
  if (loading) return <div style={box}>Loading…</div>;

  return (
    <div>
      {partial && (
        <div style={{ ...box, background: "#F5EAD3", border: "1px solid #E4CE9E", color: C.amber, fontWeight: 700 }}>
          At least one calendar could not be read, so this list may be missing something.
          Refresh before you rely on it.
        </div>
      )}
      {err && (
        <div style={{ ...box, background: "#FBEAED", border: "1px solid #F0C4CC", color: C.red, fontWeight: 700 }}>
          {err}
        </div>
      )}

      {/* ── waiting on me ───────────────────────────────────────────────── */}
      <div style={box}>
        <div style={{ fontWeight: 800, fontSize: 15, color: C.ink }}>
          Waiting on you{unanswered > 0 ? ` (${unanswered})` : ""}
        </div>
        {toAnswer.length === 0 && (
          <div style={{ fontSize: 13, color: C.sub, marginTop: 6 }}>Nothing to answer.</div>
        )}
        {toAnswer.map(({ ev, organiserId }) => {
          const said = replyStatus(ev, myReplies);
          const d = declineWith[ev.id] || {};
          return (
            <div key={ev.id} style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10, marginTop: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{ev.title}</div>
              <div style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>
                {whenText(ev.at)}{ev.mins ? ` · ${durationText(ev.mins)}` : ""} · asked by {nameOf(people, organiserId)}
              </div>
              {ev.note && <div style={{ fontSize: 12.5, color: C.sub, marginTop: 4 }}>{ev.note}</div>}
              <div style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOUR[said], marginTop: 6 }}>
                {STATUS_WORD[said]}
              </div>
              {/* ⚠️ BOTH ITEMS, SIDE BY SIDE, WHICH IS WHAT BRI ASKED FOR: "alert
                  with both items to compare for accept/decline — give the choice
                  to the invitee to accept one and decline the other, even if one
                  has already been accepted." Both of these are THEIRS, so there
                  is nothing withheld here and nothing new fetched: it is the
                  same payload the screen already loaded.
                  ⚠️ SAME `clashesFor` THE WORKER USES. A screen with its own
                  idea of "overlapping" would disagree with the alert the
                  organiser saw. */}
              {clashesFor(ev, busyItems(mine, invited.map((x) => ({ event: x.ev })), myReplies)
                .filter((b) => b.title !== ev.title || b.at !== ev.at)).map((c, i) => (
                <div key={i} style={{ fontSize: 12.5, color: C.amber, background: "#F5EAD3",
                  border: "1px solid #E4CE9E", borderRadius: 9, padding: "8px 10px",
                  marginTop: 6, lineHeight: 1.5 }}>
                  <b>This clashes with something you already have.</b>
                  <div style={{ marginTop: 3 }}>
                    {c.title} · {whenText(c.at)}{c.mins ? ` · ${durationText(c.mins)}` : ""}
                    {c.why === "accepted" ? " · you said yes to this one" : " · you called this one"}
                  </div>
                  <div style={{ marginTop: 3 }}>You can take this one and decline that one, or leave it as it is.</div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <button style={btn("solid")} onClick={() => answer(organiserId, ev, ACCEPTED)}>Going</button>
                <button style={btn()} onClick={() => answer(organiserId, ev, DECLINED)}>Can't make it</button>
              </div>
              {/* Bri: "a rescheduling proposal can be an option upon declining
                  if we want." Optional, and it rides on the decline rather than
                  being an answer of its own. */}
              <div style={{ display: "grid", gap: 6, marginTop: 8, maxWidth: 420 }}>
                <label style={{ fontSize: 11.5, color: C.sub }}>If you can't make it, suggest another time (optional)</label>
                <input type="datetime-local" style={field} value={d.proposedAt || ""}
                  onChange={(e) => { const v = e.target.value; setDeclineWith((m) => ({ ...m, [ev.id]: { ...(m[ev.id] || {}), proposedAt: v } })); }} />
                <input style={field} placeholder="Anything they should know" value={d.note || ""}
                  onChange={(e) => { const v = e.target.value; setDeclineWith((m) => ({ ...m, [ev.id]: { ...(m[ev.id] || {}), note: v } })); }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── my own meetings ─────────────────────────────────────────────── */}
      <div style={box}>
        <div style={{ fontWeight: 800, fontSize: 15, color: C.ink }}>Meetings you called</div>
        {ahead.length === 0 && (
          <div style={{ fontSize: 13, color: C.sub, marginTop: 6 }}>Nothing coming up.</div>
        )}
        {ahead.map((ev) => {
          const a = attendance(ev, repliesByPerson);
          return (
            <div key={ev.id} style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10, marginTop: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{ev.title}</div>
              <div style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>
                {whenText(ev.at)}{ev.mins ? ` · ${durationText(ev.mins)}` : ""}
              </div>
              {/* ⚠️ DECLINES ARE SHOWN, NEVER HIDDEN. "Who is not coming" is the
                  whole question an organiser is asking, and Bri's ruling was
                  that a decline stays on the list until she removes it. */}
              <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.6 }}>
                <div style={{ color: C.green }}>Going ({a.accepted.length}): {namesOf(people, a.accepted) || "nobody yet"}</div>
                <div style={{ color: C.red }}>Not going ({a.declined.length}): {namesOf(people, a.declined) || "nobody"}</div>
                <div style={{ color: C.sub }}>No answer ({a.pending.length}): {namesOf(people, a.pending) || "nobody"}</div>
              </div>
              <div style={{ display: "grid", gap: 6, marginTop: 8, maxWidth: 420 }}>
                <label style={{ fontSize: 11.5, color: C.sub }}>
                  Move it — everybody is asked again, because they agreed to the old time and not this one
                </label>
                <input type="datetime-local" style={field} value={moveTo[ev.id] || ""}
                  onChange={(e) => { const v = e.target.value; setMoveTo((m) => ({ ...m, [ev.id]: v })); }} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button style={btn("solid")} onClick={() => move(ev)}>Move it</button>
                  <button style={btn()} onClick={() => scrap(ev)}>Remove</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── call a new one ──────────────────────────────────────────────── */}
      <div style={box}>
        <div style={{ fontWeight: 800, fontSize: 15, color: C.ink }}>Call a meeting</div>
        <div style={{ display: "grid", gap: 8, marginTop: 8, maxWidth: 480 }}>
          <input style={field} placeholder="What is it? (L10, coaching, evaluation…)"
            value={title} onChange={(e) => setTitle(e.target.value)} />
          <input type="datetime-local" style={field} value={at}
            onChange={(e) => { const v = e.target.value; resetClash(); setAt(v); }} />
          {/* Bri: "in terms of hours and minutes, not just minutes". A pair of
              boxes rather than a longer list of preset minutes, because the list
              is what could not express "an hour and a half" in the first place. */}
          {/* ⚠️⚠️ THESE TWO CLEAR THE WARNING AND DID NOT USED TO, WHICH MEANT
              THE LONGER MEETING WENT OUT UNCHECKED. The busy question is
              `{ at, mins: joinDuration(hrs, mins), ids: picked }` — the DURATION
              is half of what decides an overlap. The time and the people already
              reset it; the two boxes that set the length did not.

              The sequence that bites: ask for 9:00 for 30 minutes, get told
              Hannah is busy, change it to three hours, press the button. It now
              reads "Send anyway" and passes `force`, which skips the check
              entirely — so a three-hour meeting is sent having only ever been
              checked as a thirty-minute one, under a warning describing the
              short version. The opposite is just as wrong: shorten it until
              nothing clashes and the warning still says it does.

              This file already states the rule two handlers up — "a warning is
              about one time and one list of people. Change either and it is
              about a meeting that no longer exists, so it goes." The duration
              IS the time; it was the arm nobody wired. */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="number" min="0" max="8" step="1" style={{ ...field, width: 72 }}
              value={hrs} onChange={(e) => { const v = e.target.value; resetClash(); setHrs(v); }} aria-label="Hours" />
            <span style={{ fontSize: 12.5, color: C.sub }}>hr</span>
            <input type="number" min="0" max="59" step="5" style={{ ...field, width: 72 }}
              value={mins} onChange={(e) => { const v = e.target.value; resetClash(); setMins(v); }} aria-label="Minutes" />
            <span style={{ fontSize: 12.5, color: C.sub }}>min</span>
            <span style={{ fontSize: 12.5, color: C.sub }}>· {durationText(joinDuration(hrs, mins))}</span>
          </div>
          <input style={field} placeholder="Anything they should know (optional)"
            value={note} onChange={(e) => setNote(e.target.value)} />
          <div style={{ fontSize: 11.5, color: C.sub }}>Who is coming</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {people.filter((p) => !sameId(p.id, myId)).map((p) => {
              const on = picked.some((x) => sameId(x, p.id));
              return (
                <button key={p.id} onClick={() => togglePerson(p.id)}
                  style={{ ...btn(on ? "solid" : ""), fontWeight: on ? 700 : 600 }}>
                  {p.name}
                </button>
              );
            })}
          </div>
          {/* ⚠️ NAMES AND TIMES, NEVER WHAT THEY ARE DOING. The route strips the
              title for anybody but the caller, and this is what that protects:
              "Hannah is already booked" is a scheduling fact, "Hannah is in a
              performance conversation" is her business. */}
          {clash && (
            <div style={{ fontSize: 12.5, color: C.amber, background: "#F5EAD3",
              border: "1px solid #E4CE9E", borderRadius: 9, padding: "9px 11px", lineHeight: 1.55 }}>
              <b>Already booked at that time.</b>
              <div style={{ marginTop: 4 }}>
                {Object.keys(clash).map((id) => (
                  <div key={id}>
                    {nameOf(people, id)} — {clash[id].map((c) => `${whenText(c.at)}${c.mins ? ` for ${durationText(c.mins)}` : ""}`).join(", ")}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 6 }}>Send it anyway and they can pick which one to accept.</div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={btn("solid")} onClick={() => create(!!clash)}
              disabled={!title.trim() || !at}>
              {clash ? "Send anyway" : "Send the invitation"}
            </button>
            {clash && (
              <button style={btn()} onClick={() => { resetClash(); setAt(""); }}>Pick another time</button>
            )}
          </div>
          {/* ⚠️ THIS LINE USED TO SAY "Nobody is told outside the Hub yet" and it
              was true until notifications shipped. It says what happens now, and
              it deliberately does NOT claim delivery: the sends run in the
              background after this screen has its answer, so "everyone was told"
              is a promise this screen cannot keep. "Goes out" is what it knows.
              ⚠️ IT ALSO NAMES THE CHANNELS. A person who gets a Slack DM and an
              email about one meeting should have been told to expect both, or
              the second one reads as the Hub double-sending. */}
          <div style={{ fontSize: 11.5, color: C.sub }}>
            Everyone invited gets a phone alert, a Slack message and an email with a calendar invite attached.
            It goes out as soon as you send this.
          </div>
        </div>
      </div>
    </div>
  );
}
