import React, { useState, useEffect } from "react";
/* The shared raised look and accent edge — see cardStyle.js. */
import { CARD_3D, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
/* ⚠️ THE PUNCH LIST IS NOT IN THE BUNDLE ANYMORE (Aug 8 2026). It lived in
   facilitiesData.js, which BOTH this file and App.jsx imported, so 35 open
   maintenance items for the building rode into the ENTRY chunk that every
   anonymous visitor downloads. It arrives from GET /api/facilities-seed now,
   behind tier 3 OR the tile's own allowIds — see facilitiesSeed.js.

   ⚠️ THE `export { SEED, ACTIONS }` THAT SAT HERE WAS DEAD CODE. Its comment
   claimed App.jsx read it; App.jsx imported facilitiesData.js directly and
   nothing imported these from this module. Removed rather than rewired.

   ⚠️ AND THIS SEED IS NOT A FALLBACK. Read mergeItems below before changing
   anything: the seed owns the LIST and the saved record owns only the WORK, so
   an absent seed is an empty tile, not a default one. Every write is refused
   until it arrives. */
import { hubToken, kvSet, kvGetResult } from "./store.js";
import { STORE } from "./storeConfig.js"; // store name + number on the masthead

/* Returns null on ANY failure — refusal, network, expired token — and null is
   what switches every write off. Deliberately NOT {} or []: an empty list is a
   value the merge would happily write back over 35 real rows. */
async function fetchFacilitiesSeed() {
  try {
    const r = await fetch("/api/facilities-seed", { headers: { "x-hub-token": hubToken() } });
    const d = await r.json().catch(() => null);
    if (!d || !d.ok || !Array.isArray(d.seed) || !Array.isArray(d.actions)) return null;
    return { seed: d.seed, actions: d.actions };
  } catch { return null; }
}

const KEY = "gcfcr-facilities-punchlist-v1";

// CFA / Sterling scope is verbatim from Jason Sigmon's 7/9/26 Annual Site
// Survey follow-up. GAP items came off Matt's walkthrough notes and have NO
// corp work order behind them.
// SEED and ACTIONS are exported so App.jsx's Today-block facilities pill counts
// open items against the SAME defaults this tile falls back to. Matters on a
// cold store: kvGet returns null until someone edits a row, and the pill would
// otherwise read 0 open and hide itself while 32 items are actually open.


const GROUPS = {
  cfa: { label: "CFA / Facilities & Equipment", sub: "Work orders raised with the CFA facilities team" },
  store: { label: "Restaurant responsibility", sub: "Ours to close" },
  gap: { label: "Walked, but not on the corp list", sub: "8 items from the walkthrough with no work order behind them" },
};

const STATUS = {
  open: { label: "Open", bg: "#eef0f3", fg: "#5b6470", br: "#d7dce3" },
  scheduled: { label: "Scheduled", bg: "#fdf3d8", fg: "#8a6410", br: "#f0dca4" },
  done: { label: "Done", bg: "#e4f4ea", fg: "#1f6b40", br: "#bfe3cd" },
};
const CYCLE = { open: "scheduled", scheduled: "done", done: "open" };

const C = {
  page: "#f4f6f8",
  card: "#ffffff",
  line: "#e3e7ec",
  text: "#16202c",
  dim: "#6b7684",
  navy: "#13293F",
  warn: "#b4501f",
  warnBg: "#fdf1ec",
};

const inp = {
  width: "100%",
  background: "#fbfcfd",
  border: "1px solid #dbe0e7",
  borderRadius: 6,
  color: C.text,
  padding: "10px 12px",
  fontSize: 14,
  lineHeight: 1.4,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

function Row({ row, onChange, onRemove, flag, openId, setOpenId }) {
  // Census E3: bare index — one legacy status value away from a blank page.
  const s = STATUS[row.status] || STATUS.open;
  const open = openId === row.id;
  return (
    <div style={{ borderBottom: "1px solid " + C.line }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 16px" }}>
        <button
          onClick={() => onChange(row.id, { status: CYCLE[row.status] })}
          style={{
            minWidth: 94,
            padding: "7px 10px",
            borderRadius: 6,
            border: "1px solid " + s.br,
            background: s.bg,
            color: s.fg,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            cursor: "pointer",
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          {s.label}
        </button>
        <button
          onClick={() => setOpenId(open ? null : row.id)}
          style={{
            flex: 1,
            textAlign: "left",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            font: "inherit",
            color: row.status === "done" ? C.dim : C.text,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600, textDecoration: row.status === "done" ? "line-through" : "none" }}>
            {row.task}
          </span>
          {flag ? (
            <span style={{ color: C.warn, fontSize: 10, fontWeight: 700, marginLeft: 8, letterSpacing: ".08em" }}>
              NO WORK ORDER
            </span>
          ) : null}
          {row.detail ? (
            <div style={{ color: C.dim, fontSize: 12.5, lineHeight: 1.45, marginTop: 3 }}>{row.detail}</div>
          ) : null}
          {row.owner && !open ? (
            <div style={{ color: C.dim, fontSize: 11, fontWeight: 700, letterSpacing: ".06em", marginTop: 5 }}>
              {row.owner.toUpperCase()}
            </div>
          ) : null}
        </button>
        <span style={{ color: C.dim, fontSize: 18, lineHeight: 1.4 }}>{open ? "−" : "+"}</span>
      </div>
      {open ? (
        <div style={{ padding: "0 16px 16px 16px", display: "grid", gap: 8 }}>
          <input
            value={row.owner}
            onChange={(e) => onChange(row.id, { owner: e.target.value })}
            placeholder="Owner / vendor"
            style={inp}
          />
          <textarea
            value={row.notes}
            onChange={(e) => onChange(row.id, { notes: e.target.value })}
            placeholder="Notes"
            rows={2}
            style={{ ...inp, resize: "vertical" }}
          />
          {onRemove ? (
            <button onClick={() => onRemove(row.id)} style={{ ...inp, color: "#a3384a", cursor: "pointer", textAlign: "left" }}>
              Remove item
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ── Merging saved work back over the seed ─────────────────────────
 * The loader used to do `setItems(d.items)`, which replaced SEED outright. That
 * is fine until the day the punch list grows: once ANY row has been ticked a
 * record exists, and every row added to SEED afterwards is invisible to this
 * store forever — no error, nothing on screen, the list just quietly stops
 * growing. Nobody would catch it, because the tile looks completely normal.
 *
 * So: SEED owns the LIST (what exists, its wording, its detail), and the saved
 * record owns the WORK (status, owner, notes). Merging by id keeps both — a
 * corrected detail in code reaches everyone, and nobody loses a tick.
 */
/* ⚠️ `seed` IS A PARAMETER NOW, NOT A MODULE CONST (Aug 8 2026). Callers must
   never pass an empty array to stand in for "not loaded" — SEED.map over []
   returns [], which renders as a finished punch list and, one tick later, gets
   written back over everyone's. The loader below only calls this once the fetch
   has actually returned rows. */
function mergeItems(saved, seed) {
  if (!Array.isArray(saved)) return seed;
  const by = new Map(saved.map((r) => [r.id, r]));
  return seed.map((s) => {
    const v = by.get(s.id);
    return v ? { ...s, status: v.status || s.status, owner: v.owner ?? s.owner, notes: v.notes ?? s.notes } : s;
  });
}

/* Actions are different: they can be ADDED (generated `a{timestamp}` ids) and
 * REMOVED, so a blind merge would resurrect anything deliberately deleted.
 * `seedActionIds` records which seeded actions existed when the record was
 * written, which is what separates "added to the code since" from "the user
 * threw this away". A record saved before this existed keeps today's ids as
 * known, so nothing a user deleted can come back. */
function mergeActions(saved, knownIds, actions) {
  if (!Array.isArray(saved)) return actions;
  const by = new Map(saved.map((r) => [r.id, r]));
  const known = new Set(Array.isArray(knownIds) ? knownIds : actions.map((a) => a.id));
  const merged = saved.map((r) => {
    const s = actions.find((a) => a.id === r.id);
    return s ? { ...s, status: r.status || s.status, owner: r.owner ?? s.owner, notes: r.notes ?? s.notes } : r;
  });
  const added = actions.filter((a) => !by.has(a.id) && !known.has(a.id));
  return merged.concat(added);
}

export default function Facilities({ tier, user = {} }) {
  const [items, setItems] = useState([]);
  const [actions, setActions] = useState([]);
  /* null until the seed lands, and null is the OFF SWITCH for every write.
     Holds {seed, actions} rather than a bare flag so persist can stamp
     seedActionIds from the REAL action list — writing [] into that field
     resurrects every action anyone deliberately deleted, on the next load. */
  const [seedData, setSeedData] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  // true = the punch-list read FAILED — saves refuse until a reopen loads it.
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState("");
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      // ⚠️ kvGetResult: a FAILED read used to leave the SEED on screen as if
      // it were the record, and the next tick persisted seed over the shared
      // punch list. On failure every save refuses until a reopen.
      /* ⚠️ SEED FIRST, AND NOTHING SAVES WITHOUT IT. The seed is the LIST, so a
         refused or dropped fetch is not a degraded tile, it is no tile — and
         carrying on would let one tap write an empty punch list over the real
         one. Treated as the same failure as an unreadable record. */
      const sd = await fetchFacilitiesSeed();
      if (!alive) return;
      if (!sd) { setLoadFailed(true); setHydrated(true); return; }
      setSeedData(sd);
      setItems(sd.seed);
      setActions(sd.actions);
      const r = await kvGetResult(KEY);
      if (alive) {
        if (!r.ok) {
          setLoadFailed(true);
        } else if (r.value && typeof r.value === "object") {
          setItems(mergeItems(r.value.items, sd.seed));
          setActions(mergeActions(r.value.actions, r.value.seedActionIds, sd.actions));
        }
        setHydrated(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const persist = async (nextItems, nextActions) => {
    /* Both causes, one message, because the fix is the same either way. !seedData
       is the new one: no seed means `items` is whatever is on screen with no
       list behind it, and saving that is the wipe this whole change guards. */
    if (!seedData || loadFailed) { setSaving("Not saved — the punch list never loaded. Close and reopen the tile."); return; }
    setSaving("Saving…");
    try {
      // kvSet returns false on a refused write, never throws — the catch
      // below never fired, so "Save failed" had never shown.
      const ok = await kvSet(KEY, { items: nextItems, actions: nextActions, seedActionIds: seedData.actions.map((a) => a.id) });
      if (!ok) { setSaving("Save failed — try again"); return; }
      setSaving("Saved");
      setTimeout(() => setSaving(""), 1200);
    } catch (e) {
      console.error("facilities save", e);
      setSaving("Save failed — try again");
    }
  };

  const updItem = (id, patch) => {
    const next = items.map((x) => (x.id === id ? { ...x, ...patch } : x));
    setItems(next);
    persist(next, actions);
  };

  const updAct = (id, patch) => {
    const next = actions.map((x) => (x.id === id ? { ...x, ...patch } : x));
    setActions(next);
    persist(items, next);
  };

  const addAction = () => {
    if (!draft.trim()) return;
    const next = actions.concat([{ id: "a" + Date.now(), task: draft.trim(), detail: "", owner: "", status: "open", notes: "" }]);
    setActions(next);
    setDraft("");
    persist(items, next);
  };

  const removeAction = (id) => {
    const next = actions.filter((a) => a.id !== id);
    setActions(next);
    persist(items, next);
  };

  // Tier 3 is Exec Director / HR / LDD / Owner — which left the two people who
  // actually walk the building, Daisy and Brandon, unable to open the tile at
  // all. That is the likeliest reason the count sat at its seeded 32 for weeks.
  // Widening to tier 2 would also hand it to every Team Leader, so the fix is
  // the narrower instrument the Hub already uses for scoped grants: an explicit
  // role exception, mirrored by `allow: ["Director"]` on the tile in App.jsx.
  if (tier < 3 && String(user.role || "") !== "Director") {
    return (
      <div style={{ padding: 24, color: C.dim, fontSize: 14 }}>
        Facilities is director-only.
      </div>
    );
  }

  const doneCount = items.filter((i) => i.status === "done").length;
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  return (
    <div style={{ background: C.page, minHeight: "100%", color: C.text, paddingBottom: 48 }}>
      <header style={{ background: "linear-gradient(120deg,#8A6A2F 0%,#4E3A14 55%)", color: "#fff", padding: "20px 16px 18px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          <div style={{ color: "rgba(255,255,255,0.78)", fontSize: 11, fontWeight: 800, letterSpacing: ".14em" }}>
            FSR #{STORE.fsr} · {STORE.name.toUpperCase()} FSU
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "8px 0 6px", color: "#fff" }}>Facilities Punch List</h1>
          <div style={{ color: "rgba(255,255,255,0.82)", fontSize: 13, lineHeight: 1.5 }}>
            {/* ⚠️ Don's direct mobile was printed here and is gone (Aug 8 2026).
                This header string compiled into a client chunk that anyone on
                the internet could download without signing in. The names are
                who to ask for; the number belongs in a phone, not in a file the
                browser fetches. Same sweep that found the PTO and bonus tables. */}
            Annual Site Survey follow-up · CFA Facilities and the contractor
          </div>
          <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 12, lineHeight: 1.5, marginTop: 6 }}>
            Walkthrough verbal: ceiling 2–3 weeks (mid-July), balance ~6 weeks (Sept). The survey email gives no dates — contractors schedule with the operator directly.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)", minWidth: 92 }}>
              {doneCount}/{items.length} closed
            </div>
            <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.25)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: pct + "%", height: "100%", background: "#fff", transition: "width .25s" }} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.72)", minWidth: 84, textAlign: "right" }}>
              {hydrated ? saving : "Loading…"}
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 780, margin: "0 auto", padding: "0 8px" }}>
        {Object.keys(GROUPS).map((g) => (
          <section key={g} style={{ marginTop: 22 }}>
            <div style={{ padding: "0 8px 8px" }}>
              <h2 style={{ fontSize: 14, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", margin: 0, color: g === "gap" ? C.warn : C.navy }}>
                {GROUPS[g].label}
              </h2>
              <div style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>{GROUPS[g].sub}</div>
            </div>
            <div
              style={{
                background: g === "gap" ? C.warnBg : C.card,
                border: "1px solid " + (g === "gap" ? "#f0d6c7" : C.line),
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              {items
                .filter((i) => i.group === g)
                .map((row) => (
                  <Row key={row.id} row={row} onChange={updItem} flag={g === "gap"} openId={openId} setOpenId={setOpenId} />
                ))}
            </div>
          </section>
        ))}

        <section style={{ marginTop: 26 }}>
          <div style={{ padding: "0 8px 8px" }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", margin: 0, color: C.navy }}>
              Action items
            </h2>
          </div>
          <div style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 10, overflow: "hidden" , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
            {actions.map((row) => (
              <Row key={row.id} row={row} onChange={updAct} onRemove={removeAction} openId={openId} setOpenId={setOpenId} />
            ))}
            <div style={{ display: "flex", gap: 8, padding: 12 }}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addAction();
                }}
                placeholder="Add an action item"
                style={inp}
              />
              <button
                onClick={addAction}
                style={{
                  background: C.navy,
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "0 18px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Add
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
