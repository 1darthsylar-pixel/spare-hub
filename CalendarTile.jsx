import React, { useState, useEffect, useMemo } from "react";
/* The shared raised look — see cardStyle.js. */
import { CARD_3D, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import ToolHero from "./ToolHero.jsx";
import { kvGet, kvSet, kvGetResult, hubToken } from "./store.js";
import { TYPES_KEY, slotsKey, typeList, typesRunBy, typesOwnedBy, ownsType,
  isCalendarOwner, openSlots, upcoming, bySoonest, bookedBy,
  monthGrid, byDay, dayKey, durationText, joinDuration, typeDesc } from "./calendarStore.js";
import { sameId, bareId } from "./nameMatch.js";
/* The live roster and the one definition of "what is this person's job title
   right now" — override, then their record, then the seed. */
import { loadHRTeamResult } from "./hrTeam.js";
import { hrTitleFor, hrDisplayName } from "./hrRoster.js";
/* The invitation half, on its own tab. ⚠️ ONE-WAY IMPORT: that file must never
   import this one — the cycle trap this repo has been burned by. It takes what
   it needs as props and reads the rest itself. */
import CalendarInvites from "./CalendarInvites.jsx";

/**
 * CalendarTile — the internal calendar, owner side.
 *
 * Bri, Aug 10 2026: event types she can "edit, add, or delete", co-hosts
 * ("Hannah and I often conduct leadership interviews or evaluations together"),
 * and "edit who can schedule specific types of events (based on tiers in the
 * Hub)". This screen is where she does all three, and where she publishes the
 * times each type can be booked into.
 *
 * ⚠️ THE RULES ARE NOT IN THIS FILE. Who owns a type, who may book it, and
 * whether an owner is still taking bookings all live in calendarStore.js,
 * because worker.js and Team Directory ask the same questions. A screen that
 * decided any of that for itself would be a second opinion.
 *
 * ⚠️ SLOTS ARE READ AND WRITTEN PER OWNER. Publishing a time is a plain kvSet
 * to your own row, which nobody else writes. A BOOKING is not — it goes through
 * /api/calendar, because that is the only place two people racing for one time
 * can be resolved. Never book or cancel from here.
 */
const USER_KEY = "gcfcr-access-user";
const C = { red: "#E51636", navy: "#1A2238", ink: "#141821", sub: "#5B6474",
  line: "#E7E9EF", paper: "#F6F4EF", card: "#FFFFFF", green: "#2E9E5B" };
const FONT = "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif";

function getViewer() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }

const inp = { fontFamily: FONT, fontSize: 14, padding: "9px 11px", borderRadius: 10,
  border: `1px solid ${C.line}`, color: C.ink, background: "#fff", outline: "none", boxSizing: "border-box" };
const btn = (solid) => ({ fontFamily: FONT, fontSize: 13, fontWeight: 700, borderRadius: 9,
  padding: "7px 13px", cursor: "pointer",
  border: solid ? "none" : `1px solid ${C.line}`,
  background: solid ? C.red : "#fff", color: solid ? "#fff" : C.sub });

/* Bri's wording, in the tiers the Hub already has. Not a new concept — this is
   the same 1/2/3 every tile gates on. */
const TIER_CHOICES = [
  { v: 1, label: "Anyone on the team" },
  { v: 2, label: "Leaders and up" },
  { v: 3, label: "Directors and up" },
];
const tierLabel = (v) => (TIER_CHOICES.find((t) => t.v === Number(v || 1)) || TIER_CHOICES[0]).label;

const fmtWhen = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? String(s)
    : d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

export default function CalendarTile({ onBack }) {
  const viewer = getViewer();
  const [types, setTypes] = useState(null);      // null = loading
  const [slots, setSlots] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [failed, setFailed] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("times");

  // new-type form
  const [label, setLabel] = useState("");
  /* Hours and minutes on screen, minutes in storage. See durationText in
     calendarStore.js for why the stored unit did not move. */
  const [hrs, setHrs] = useState("0");
  const [mins, setMins] = useState("30");
  const [desc, setDesc] = useState("");
  const [minTier, setMinTier] = useState(2);
  // new-slot form
  const [slotType, setSlotType] = useState("");
  const [slotAt, setSlotAt] = useState("");
  /* ── the month view ──────────────────────────────────────────────────────
     `monthAt` is the first of whatever month is on screen. Kept as a Date in
     state rather than derived, so paging back and forward is one arithmetic
     step and cannot drift.
     `elsewhere` is what THIS person has booked on OTHER people's calendars. A
     month that showed only the times she publishes would hide half of what she
     is actually committed to, which is worse than no month at all. */
  const [monthAt, setMonthAt] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [elsewhere, setElsewhere] = useState([]);
  const [daySel, setDaySel] = useState("");

  const myId = viewer && viewer.id;
  const owner = isCalendarOwner(viewer && viewer.role);

  const load = async () => {
    const t = await kvGetResult(TYPES_KEY);
    /* A failed read is not "no types". Adding one on top of that would save a
       single type over everybody's list — the same trap the goal submissions
       editor carries a note about. */
    if (!t.ok) { setFailed(true); setTypes([]); return; }
    setFailed(false);
    setTypes(typeList(t.value));
    if (myId) {
      try { const s = await kvGet(slotsKey(myId)); setSlots(Array.isArray(s) ? s : []); }
      catch { setSlots([]); }
    }
    /* ═══ THE CO-HOST LIST COMES FROM THE HR ROSTER ═══════════════════════════
       🐛 IT USED TO COME FROM THE TEAM DIRECTORY, AND THAT WAS BROKEN — caught
       before it shipped. The org chart's cards (`data.org`, `data.directors`)
       have NO `hrId` and never have: enrichWithHR only ever walks `data.teams`.
       So this fell through to `p.id` and offered "org-hannah" and "d1" as
       co-host ids. Adding Hannah would have stored `org-hannah`, which matches
       no roster id anywhere, so `canManageType` would say no to her and the
       Worker's co-host notice would resolve to nobody. Her name would sit on
       the type looking correct while she could neither manage it nor hear about
       a booking. Silent, and exactly the id-shape class of bug that cost this
       repo a day in Professional Growth.
       ⚠️ THE ROSTER IS THE ONLY PLACE WITH REAL IDS, so the list is built from
       it directly and the ids are right by construction rather than by matching
       a name. Narrowed to people who could own a calendar themselves, because a
       co-host manages the type and only those titles reach this screen. */
    try {
      const [hrRes, roles] = await Promise.all([
        loadHRTeamResult(),
        kvGet("gcfcr-hr-roles").catch(() => null),
      ]);
      const rm = roles && typeof roles === "object" ? roles : {};
      const team = Array.isArray(hrRes.team) ? hrRes.team : [];
      setLeaders(team
        .filter((p) => p && p.id != null && isCalendarOwner(hrTitleFor(String(p.id), rm, team)))
        .map((p) => ({ id: String(p.id), name: hrDisplayName(p) || p.name })));
    } catch { /* co-host picker is optional */ }

    /* ═══ WHAT THIS PERSON HAS BOOKED WITH SOMEBODY ELSE ═══════════════════
       ⚠️ THE FAN-OUT IS BOUNDED BY THE TYPES LIST, not by the roster. Only
       people who actually own an event type have a calendar row worth reading,
       which today is a handful of leaders — not 106 reads.
       ⚠️ ONE FAILED READ LOSES ONE PERSON'S ROW, never the whole month. */
    if (myId) {
      const owners = [...new Set(typeList(t.value).map((x) => bareId(x && x.ownerId)).filter(Boolean))]
        .filter((id) => !sameId(id, myId));
      const found = [];
      await Promise.all(owners.map(async (id) => {
        try {
          const rows = await kvGet(slotsKey(id));
          (Array.isArray(rows) ? rows : []).forEach((s) => {
            if (bookedBy(s, myId)) found.push({ ...s, withId: id });
          });
        } catch { /* that one leader's row is missing from the month, nothing else */ }
      }));
      setElsewhere(found);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [myId]);

  const mine = useMemo(() => typesRunBy(types, myId), [types, myId]);
  const owned = useMemo(() => typesOwnedBy(types, myId), [types, myId]);

  const saveTypes = async (next) => {
    setErr("");
    const prev = types;
    setTypes(next);
    if ((await kvSet(TYPES_KEY, next)) === false) { setTypes(prev); setErr("That did not save. Check the wifi and try again."); }
  };
  const saveSlots = async (next) => {
    setErr("");
    const prev = slots;
    setSlots(next);
    if ((await kvSet(slotsKey(myId), next)) === false) { setSlots(prev); setErr("That did not save. Check the wifi and try again."); }
  };

  const addType = () => {
    const l = label.trim();
    if (!l || !myId) return;
    saveTypes([...(types || []), {
      id: `ct${Date.now()}`, label: l, ownerId: bareId(myId), coHostIds: [],
      minTier: Number(minTier) || 1, mins: joinDuration(hrs, mins), desc: desc.trim(), active: true,
    }]);
    setLabel("");
  };
  const patchType = (id, patch) => saveTypes((types || []).map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const addSlot = () => {
    if (!slotAt.trim() || !slotType) return;
    const t = (types || []).find((x) => x.id === slotType);
    saveSlots([...slots, { id: `cs${Date.now()}`, typeId: slotType, at: slotAt.trim(),
      mins: (t && t.mins) || 30, booked: null }]);
    setSlotAt("");
  };

  /* ⚠️ RELEASING A BOOKED TIME GOES THROUGH THE ROUTE, not a local edit. The
     person who booked it has to be told, and only the server knows how to do
     that. Deleting an EMPTY slot is a plain write, because nobody is affected. */
  const release = async (slotId) => {
    setErr("");
    try {
      const r = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
        body: JSON.stringify({ action: "cancel", ownerId: bareId(myId), slotId }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || d.ok !== true) setErr((d && d.error) || "That did not go through.");
    } catch { setErr("That did not go through. Check the wifi."); }
    await load();
  };

  if (!viewer) return <Shell onBack={onBack}><Note>Sign in to the Hub to use the calendar.</Note></Shell>;
  /* ★★ A NON-OWNER GETS THE MEETINGS SCREEN AND NOTHING ELSE (Matt, Aug 12
     2026: "open it to everyone"). This used to be a dead end reading "the
     calendar is set up by Directors, HR and the Executive Directors", which was
     true of the OWNER half and left an invited team member with nowhere to
     answer. Publishing bookable times, event types and the month view are still
     owner-only; being asked to a meeting is not.
     ⚠️ RETURNED BEFORE `types === null`, deliberately. The types read is for
     the owner tabs and this screen does not use it, so a slow or failed types
     load must not hold up somebody who only came here to say yes or no.
     ⚠️ THE SCREEN ASKS THE WORKER WHAT IT IS IN — it cannot see a meeting it is
     not part of. See the header of CalendarInvites.jsx. */
  if (!owner) {
    return (
      <Shell onBack={onBack}>
        <CalendarInvites viewer={viewer} />
      </Shell>
    );
  }
  if (types === null) return <Shell onBack={onBack}><Note>Loading…</Note></Shell>;

  const ahead = upcoming(slots).slice(0, 60);
  const typeOf = (id) => (types || []).find((t) => String(t.id) === String(id)) || null;

  return (
    <Shell onBack={onBack}>
      {failed && <Warn>
        The event types could not be loaded, so this list may be showing nothing when there is
        something. Adding one now could overwrite what is already there. Refresh before editing.
      </Warn>}
      {err && <Warn>{err}</Warn>}

      {/* ⚠️ `soft`, AND THE FIGURE IS THE ONE THING THIS SCREEN CAN GET WRONG
          QUIETLY. Four tabs sit under this band, so a 40px number would fight
          them. But "how many times have I actually published" is worth saying
          out loud: a leader who published none looks unbookable on Our Teams
          and has no way of noticing from the month view.
          Colour is the Calendar tile's own #2F5D50 from App.jsx. */}
      <ToolHero
        color="#2F5D50"
        soft
        label="Calendar"
        value={slots.length ? `${slots.length} time${slots.length === 1 ? "" : "s"} published` : "No times published"}
        note={slots.length ? "People can book these from your name on Our Teams"
          : "Nobody can book you until you publish times under My times"}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[["month", "Month"], ["times", "My times"], ["types", `Event types (${mine.length})`],
          ["meetings", "Meetings"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={btn(tab === k)}>{l}</button>
        ))}
      </div>

      {/* ★ THE OTHER ARROW. "My times" is what people can book off you; this is
          what you have called and what you have been asked to. Its own tab
          rather than mixed in, because they are opposite questions and the
          booking screen is the one that already works (design rule 16).
          ⚠️ NO OWNER LIST IS PASSED ANY MORE. It used to take `leaders` to bound
          a client-side scan of everybody's calendars; the Worker answers that
          question now and hands back only what this person is in. */}
      {tab === "meetings" && <CalendarInvites viewer={viewer} />}

      {tab === "month" && (
        <MonthView slots={slots} elsewhere={elsewhere} types={types} leaders={leaders}
          at={monthAt} onMove={setMonthAt} sel={daySel} onSel={setDaySel} />
      )}

      {tab === "times" && (
        <>
          <div style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.5, marginBottom: 12 }}>
            Publish the times you are free for each event type. People book them from your name on Our Teams.
          </div>
          {owned.length === 0 ? (
            <Note>Add an event type first, then you can publish times for it.</Note>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
              <select value={slotType} onChange={(e) => setSlotType(e.target.value)} style={{ ...inp, width: "auto" }}>
                <option value="">Which type…</option>
                {owned.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <input type="datetime-local" value={slotAt} onChange={(e) => setSlotAt(e.target.value)}
                style={{ ...inp, width: "auto" }} aria-label="Date and time" />
              <button onClick={addSlot} disabled={!slotAt.trim() || !slotType || failed} style={btn(true)}>+ Add time</button>
            </div>
          )}

          {ahead.length === 0 ? <Note>No times published yet.</Note> : ahead.map((s) => {
            const t = typeOf(s.typeId);
            return (
              <Row key={s.id}>
                <span style={{ flex: 1, minWidth: 180, fontSize: 14, fontWeight: 600 }}>
                  {fmtWhen(s.at)} <span style={{ color: C.sub, fontWeight: 400 }}>· {(t && t.label) || "—"} · {durationText(s.mins || 30)}</span>
                </span>
                {s.booked ? (
                  <>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "#166534", background: "#E7F6EC", borderRadius: 20, padding: "3px 10px" }}>
                      {s.booked.name}
                    </span>
                    <button onClick={() => release(s.id)} style={btn(false)}>Release</button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 12.5, color: C.sub }}>open</span>
                    <button onClick={() => saveSlots(slots.filter((x) => x.id !== s.id))} style={btn(false)}>Remove</button>
                  </>
                )}
              </Row>
            );
          })}
        </>
      )}

      {tab === "types" && (
        <>
          <div style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.5, marginBottom: 12 }}>
            An event type is a kind of meeting people can book with you. You decide how long it runs
            and who is allowed to book it.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Leadership Interviews"
              style={{ ...inp, flex: 1, minWidth: 190 }} />
            <input type="number" min="0" max="8" step="1" value={hrs} onChange={(e) => setHrs(e.target.value)}
              style={{ ...inp, width: 64 }} aria-label="Hours" />
            <span style={{ fontSize: 13, color: C.sub }}>hr</span>
            <input type="number" min="0" max="59" step="5" value={mins} onChange={(e) => setMins(e.target.value)}
              style={{ ...inp, width: 64 }} aria-label="Minutes" />
            <span style={{ fontSize: 13, color: C.sub }}>min</span>
            <select value={minTier} onChange={(e) => setMinTier(Number(e.target.value))} style={{ ...inp, width: "auto" }}>
              {TIER_CHOICES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
            <button onClick={addType} disabled={!label.trim() || failed} style={btn(true)}>+ Add type</button>
          </div>
          {/* Bri: "a short description of each meeting type so someone knows what
              they are signing up for." It shows wherever the type is offered. */}
          <div style={{ marginBottom: 16 }}>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} style={{ ...inp, width: "100%" }}
              placeholder="What is this meeting for? (optional, shown to whoever books it)" />
          </div>

          {mine.length === 0 ? <Note>No event types yet.</Note> : mine.slice().sort((a, b) => String(a.label).localeCompare(String(b.label))).map((t) => {
            const isMine = ownsType(t, myId);
            return (
              <div key={t.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12,
                padding: "12px 14px", marginBottom: 10, ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ flex: 1, minWidth: 150, fontWeight: 800, fontSize: 15,
                    color: t.active === false ? C.sub : C.ink,
                    textDecoration: t.active === false ? "line-through" : "none" }}>{t.label}</span>
                  {!isMine && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sub }}>you co-host this</span>}
                  {isMine && (
                    <button onClick={() => patchType(t.id, { active: t.active === false })} style={btn(false)}>
                      {t.active === false ? "Turn back on" : "Retire"}
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: C.sub, marginTop: 4 }}>
                  {durationText(t.mins || 30)} · {tierLabel(t.minTier)} can book
                </div>
                {typeDesc(t) && (
                  <div style={{ fontSize: 12.5, color: C.ink, marginTop: 4 }}>{typeDesc(t)}</div>
                )}
                {isMine && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
                    <select value={t.minTier || 1} onChange={(e) => patchType(t.id, { minTier: Number(e.target.value) })}
                      style={{ ...inp, width: "auto", fontSize: 12.5 }}>
                      {TIER_CHOICES.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
                    </select>
                    {/* Bri: "I would want to add her to those certain event types." */}
                    <select value="" onChange={(e) => {
                      const id = e.target.value; e.target.value = "";
                      if (!id) return;
                      const now = Array.isArray(t.coHostIds) ? t.coHostIds : [];
                      if (now.some((x) => sameId(x, id))) return;
                      patchType(t.id, { coHostIds: [...now, bareId(id)] });
                    }} style={{ ...inp, width: "auto", fontSize: 12.5 }}>
                      <option value="">+ Add a co-host…</option>
                      {leaders.filter((l) => !sameId(l.id, myId)).map((l) => (
                        <option key={String(l.id)} value={String(l.id)}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {Array.isArray(t.coHostIds) && t.coHostIds.length > 0 && (
                  <div style={{ fontSize: 12.5, color: C.sub, marginTop: 6 }}>
                    With: {t.coHostIds.map((id) => {
                      const l = leaders.find((x) => sameId(x.id, id));
                      return (l && l.name) || String(id);
                    }).join(", ")}
                    {isMine && " · "}
                    {isMine && t.coHostIds.map((id) => (
                      <button key={String(id)} onClick={() => patchType(t.id, {
                        coHostIds: t.coHostIds.filter((x) => !sameId(x, id)),
                      })} style={{ ...btn(false), fontSize: 11, padding: "2px 7px", marginLeft: 4 }}>
                        remove {(leaders.find((x) => sameId(x.id, id)) || {}).name || id}
                      </button>
                    ))}
                  </div>
                )}
                {/* Retiring is not deleting: a retired type stops being offered and
                    every booking already in it stays exactly where it is. */}
                {isMine && t.active === false && (
                  <div style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>
                    Retired. Nobody can book it. Times already booked are unaffected.
                  </div>
                )}
                {openSlots(slots, t.id).length > 0 && (
                  <div style={{ fontSize: 12, color: C.green, marginTop: 6, fontWeight: 700 }}>
                    {openSlots(slots, t.id).length} time{openSlots(slots, t.id).length === 1 ? "" : "s"} open
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </Shell>
  );
}

/* ═══ MONTH AT A GLANCE ═════════════════════════════════════════════════════
   Bri, Aug 10 2026: "maybe have a month at a glance option as well as something
   detailed if needed." Both, on one screen: the grid is the glance, tapping a
   day is the detail.

   ★ MODULE LEVEL, outside the tile (design rule 7).
   ⚠️ IT DECIDES NOTHING AND WRITES NOTHING. Every slot it draws was already
   read and every rule it uses lives in calendarStore.js. Cancelling from here
   would need the route, so it does not offer it — "My times" does, and one
   Release button is better than two that could disagree. */
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_FMT = { month: "long", year: "numeric" };

function MonthView({ slots, elsewhere, types, leaders, at, onMove, sel, onSel }) {
  /* Mine and theirs in one list so a day cell counts everything that is on this
     person's plate, not just the half they published. `mine` marks which side a
     row came from, because a booked time on YOUR calendar and a time YOU booked
     with somebody else read very differently on the day. */
  const all = useMemo(() => [
    ...(Array.isArray(slots) ? slots : []).map((s) => ({ ...s, mine: true })),
    ...(Array.isArray(elsewhere) ? elsewhere : []).map((s) => ({ ...s, mine: false })),
  ], [slots, elsewhere]);
  const days = useMemo(() => byDay(all), [all]);
  const cells = useMemo(() => monthGrid(at), [at]);
  const today = dayKey(new Date());

  const typeOf = (id) => (types || []).find((t) => String(t.id) === String(id)) || null;
  const nameOf = (id) => { const l = (leaders || []).find((x) => sameId(x.id, id)); return (l && l.name) || "them"; };
  const step = (n) => { onSel(""); onMove(new Date(at.getFullYear(), at.getMonth() + n, 1)); };

  const rows = sel ? (days[sel] || []) : [];

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button onClick={() => step(-1)} style={btn(false)} aria-label="Previous month">‹</button>
        <div style={{ flex: 1, textAlign: "center", fontWeight: 800, fontSize: 15 }}>
          {at.toLocaleDateString(undefined, MONTH_FMT)}
        </div>
        <button onClick={() => step(1)} style={btn(false)} aria-label="Next month">›</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {WEEKDAYS.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: C.sub, padding: "2px 0" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((c) => {
          const on = days[c.key] || [];
          const booked = on.filter((s) => s.booked).length;
          const open = on.length - booked;
          return (
            <button key={c.key} onClick={() => onSel(sel === c.key ? "" : c.key)}
              disabled={on.length === 0}
              style={{ fontFamily: FONT, cursor: on.length ? "pointer" : "default",
                background: sel === c.key ? C.navy : C.card,
                color: sel === c.key ? "#fff" : c.inMonth ? C.ink : "#B9BFC9",
                border: `1px solid ${c.key === today ? C.red : C.line}`,
                borderRadius: 9, padding: "6px 2px 5px", minHeight: 46,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: 12.5, fontWeight: c.key === today ? 800 : 600 }}>{c.date.getDate()}</span>
              <span style={{ display: "flex", gap: 3, minHeight: 6 }}>
                {booked > 0 && <Dot n={booked} color={sel === c.key ? "#fff" : C.green} />}
                {open > 0 && <Dot n={open} color={sel === c.key ? "rgba(255,255,255,.55)" : "#B9BFC9"} />}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "10px 0 4px", fontSize: 12, color: C.sub }}>
        <span><Dot n={1} color={C.green} /> booked</span>
        <span><Dot n={1} color="#B9BFC9" /> open</span>
        <span style={{ color: C.red }}>▁ today</span>
      </div>

      {sel ? (
        rows.length === 0 ? <Note>Nothing that day.</Note> : (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>
              {new Date(rows[0].at).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </div>
            {rows.map((s) => {
              const t = typeOf(s.typeId);
              return (
                <Row key={`${s.mine ? "m" : "e"}${s.id}`}>
                  <span style={{ flex: 1, minWidth: 170, fontSize: 14, fontWeight: 600 }}>
                    {fmtWhen(s.at)}
                    <span style={{ color: C.sub, fontWeight: 400 }}> · {(t && t.label) || "—"} · {durationText(s.mins || 30)}</span>
                  </span>
                  {s.mine ? (
                    s.booked
                      ? <span style={{ fontSize: 12.5, fontWeight: 700, color: "#166534", background: "#E7F6EC", borderRadius: 20, padding: "3px 10px" }}>{s.booked.name}</span>
                      : <span style={{ fontSize: 12.5, color: C.sub }}>open</span>
                  ) : (
                    /* Time SHE booked with somebody else. Named, because "a
                       meeting at 3" without who it is with is not a calendar. */
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "#1E3A8A", background: "#E7EDFB", borderRadius: 20, padding: "3px 10px" }}>
                      with {nameOf(s.withId)}
                    </span>
                  )}
                </Row>
              );
            })}
          </div>
        )
      ) : (
        <Note>Tap a day to see what is on it.</Note>
      )}
    </>
  );
}

const Dot = ({ n, color }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
    <span style={{ width: 6, height: 6, borderRadius: 3, background: color, display: "inline-block" }} />
    {n > 1 && <span style={{ fontSize: 9.5, fontWeight: 800, color }}>{n}</span>}
  </span>
);

function Shell({ children, onBack }) {
  return (
    <div style={{ fontFamily: FONT, background: C.paper, minHeight: "100vh", color: C.ink }}>
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "rgba(246,244,239,.92)", backdropFilter: "blur(8px)",
        borderBottom: `1px solid ${C.line}`, padding: "12px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        {onBack && <button onClick={onBack} style={{ border: "none", background: "none", color: C.sub,
          fontFamily: FONT, fontSize: 14, cursor: "pointer", fontWeight: 600 }}>← Back</button>}
        <div style={{ fontWeight: 800, fontSize: 16 }}>Calendar</div>
      </div>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px 60px" }}>{children}</div>
    </div>
  );
}
const Note = ({ children }) => <div style={{ color: C.sub, fontSize: 13.5, padding: "10px 0" }}>{children}</div>;
const Warn = ({ children }) => (
  <div style={{ background: "#FEF3C7", color: "#92400E", borderRadius: 12, padding: "12px 14px",
    fontSize: 13.5, lineHeight: 1.5, marginBottom: 14 }}>{children}</div>
);
const Row = ({ children }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: C.card,
    border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 14px", marginBottom: 8 }}>{children}</div>
);
