import React, { useState, useEffect, useMemo, useCallback } from "react";
import { CARD_3D, accentEdge, MONO } from "./cardStyle.js";
import ToolHero from "./ToolHero.jsx";
import { kvGet, kvGetResult, kvSet } from "./store.js";
import { STORE, storeCfg, tokenLabel, tokenLabelOne } from "./storeConfig.js";
import { loadHRTeam } from "./hrTeam.js";
import { bareId } from "./nameMatch.js";
/* ★ THE RULES LIVE IN THE LEAF. This file draws the screen and nothing else —
   no arithmetic about balances, no decision about affordability. A second
   opinion in here would be a second answer to "what do they have".
   ⚠️ "node-tested" WAS AN ASPIRATION UNTIL Aug 13 2026. This line claimed it
   and no test of tokens.js existed anywhere in the repo; it was written the day
   the feature was switched on. It is `tokens.test.mjs` at the repo root:
   `node tokens.test.mjs`, 88 assertions. If you change tokens.js, run it. */
import { TYPES, makeEntry, makeReversal, makeRedemption, balanceOf, historyFor,
  entriesFor, balanceIn, balances, append, shopFor, catalogList } from "./tokens.js";
import { reasonOptions, fillFor, unaddedSuggestions } from "./starReasons.js";

/**
 * TokensTile.jsx — the token ledger, on screen.
 *
 * Matt, Aug 11 2026: "Build a token reward system. Ledger first, rewards
 * second. This is a Hub feature, per store, off by default." And: "I need this
 * for the hub clone."
 *
 * ⚠️⚠️ THE WORD "POINTS" APPEARS NOWHERE A PERSON CAN SEE IT. Matt: "Gate City
 * already uses 'points' to mean DISCIPLINE points from infractions. A reward
 * currency called points in the same app would be actively confusing to a team
 * member who has just been written up." Every visible noun comes from
 * `tokens.label` / `tokens.labelOne` in storeConfig, so a clone renames the
 * whole feature without touching code.
 *
 * ⚠️ APPEND ONLY, ALL THE WAY UP. There is no edit button and no delete button
 * on this screen, because there is no edit and no delete in the ledger. A
 * mistake is fixed with a Reverse, which writes an opposite entry pointing at
 * the original and leaves the original standing.
 *
 * ⚠️ WHO SEES WHAT. A team member sees their own balance, their own history and
 * the catalog. Leaders see everyone's balances and can grant, redeem and
 * reverse. Nobody but a leader ever sees another person's reasons — enforced at
 * the Worker by HR_OWN_ROW_READ_ONLY, not merely by this file choosing not to
 * render them.
 */
const C = { ink: "#141821", sub: "#5B6474", faint: "#8A93A3", line: "#E7E9EF",
  paper: "#F6F4EF", card: "#FFFFFF", gold: "#8A6A1F", goldBg: "#FBF5E6",
  green: "#166534", greenBg: "#E7F6EC", red: "#B91C1C", navy: "#1A2238" };
const FONT = "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif";
/* MONO now comes from cardStyle.js. It was defined here and byte-identically in
   ManualTile.jsx, which is design rule 8: two copies of a font stack drift the
   moment one gains a fallback, and a figure that changes width between two
   tools looks like a rendering bug. */

const LEDGER_KEY = "gcfcr-hr-tokens-v1";
/* ⚠️ NOT AN HR KEY AND DELIBERATELY NOT PROTECTED. A price list is not a
   personnel record; everyone can see what things cost, which is the point. */
const CATALOG_KEY = "gcfcr-tokens-catalog-v1";

/* The store's own words for its own currency. Module level, pure.
   ⚠️ THE DEFINITIONS MOVED TO storeConfig.js AND THESE ARE NOW ALIASES, not a
   second copy. App.jsx needs the same word for the dashboard tile name, and
   design rule 8 says the function deciding what a thing is CALLED must exist
   once. Two copies of this would drift into a tile and a screen disagreeing
   about the name of the same currency.
   ⚠️ STILL CALLED, NEVER CAPTURED. `many` and `one` are functions here for the
   same reason they are in storeConfig: a store's saved label merges after this
   module is imported, so a value read at module level would freeze the
   deployed default. Every call site below keeps its parentheses. */
const many = tokenLabel;
const one = tokenLabelOne;
const unit = (n) => `${n} ${Math.abs(Number(n)) === 1 ? one() : many()}`;
const grantTier = () => Number(storeCfg("tokens.grantMinTier", 3)) || 3;

const todayISO = () => new Date().toLocaleDateString("en-CA");
const fmtWhen = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const btn = (on) => ({ fontFamily: FONT, fontSize: 13, fontWeight: 700, borderRadius: 8,
  padding: "8px 13px", cursor: "pointer", border: `1px solid ${on ? C.navy : C.line}`,
  background: on ? C.navy : "#fff", color: on ? "#fff" : C.ink });
const inp = { fontFamily: FONT, fontSize: 14, padding: "9px 11px", borderRadius: 8,
  border: `1px solid ${C.line}`, background: "#fff", color: C.ink, width: "100%" };

export default function TokensTile({ tier = 1, user, onBack }) {
  const isLeader = Number(tier) >= grantTier();
  const myId = bareId(user && user.id);

  const [ledger, setLedger] = useState({});
  const [catalog, setCatalog] = useState([]);
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(true);
  /* ⚠️ A FAILED READ BLOCKS EVERY WRITE. The same rule Cash Audit and the L101
     week list follow: rendering an unreadable ledger as empty and then saving
     on top of that emptiness is how a whole record gets erased by somebody
     doing nothing wrong. */
  const [readFailed, setReadFailed] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const r = await kvGetResult(LEDGER_KEY);
      if (!live) return;
      if (!r || !r.ok) { setReadFailed(true); setLoading(false); return; }
      setLedger(r.value && typeof r.value === "object" && !Array.isArray(r.value) ? r.value : {});
      try { setCatalog(catalogList(await kvGet(CATALOG_KEY))); } catch { /* an empty shop is fine */ }
      try { setRoster(await loadHRTeam()); } catch { setRoster([]); }
      setLoading(false);
    })();
    return () => { live = false; };
  }, []);

  const nameOf = useCallback((pid) => {
    const m = (roster || []).find((x) => bareId(x.id) === bareId(pid));
    return (m && m.name) || String(pid);
  }, [roster]);

  const myEntries = useMemo(() => entriesFor(ledger, myId), [ledger, myId]);
  const myBalance = useMemo(() => balanceOf(myEntries), [myEntries]);
  const rows = useMemo(() => balances(ledger), [ledger]);
  const shop = useMemo(() => shopFor(catalog, myBalance), [catalog, myBalance]);

  /* ⚠️ ONE WRITER, AND IT APPENDS. Every action on this screen funnels through
     here, so there is exactly one place a movement can be written and exactly
     one place the failed-read guard has to hold. */
  const write = async (entry) => {
    if (!entry) { setMsg("That did not save — check the amount and the reason."); return false; }
    if (readFailed) { setMsg("The ledger could not be read, so nothing can be saved right now."); return false; }
    setBusy(true);
    const next = append(ledger, entry);
    const ok = (await kvSet(LEDGER_KEY, next)) !== false;
    setBusy(false);
    if (!ok) { setMsg("That did not save. Check your connection and try again."); return false; }
    setLedger(next);
    setMsg("");
    return true;
  };

  if (loading) return <Shell onBack={onBack}><Note>Loading…</Note></Shell>;

  return (
    <Shell onBack={onBack}>
      {readFailed && (
        <div style={{ background: "#FEF2F2", border: `1px solid ${C.red}33`, borderRadius: 10,
          padding: "12px 14px", marginBottom: 16, fontSize: 13.5, color: C.red }}>
          The ledger could not be read. Nothing is missing — this is a failed load, not an empty
          record. Nothing can be saved until it reads again.
        </div>
      )}
      {msg && (
        <div style={{ background: C.goldBg, border: `1px solid ${C.gold}33`, borderRadius: 10,
          padding: "10px 13px", marginBottom: 14, fontSize: 13.5, color: C.gold }}>{msg}</div>
      )}

      {/* ── Your own balance. Everyone, including leaders. ─────────────── */}
      {/* ⚠️ THIS IS THE HERO MATT NAMED AS THE REFERENCE, so it is the first one
          moved onto the shared component and it must not CHANGE. `lift(#1A2238)`
          gives #283046 against the #26304A that was typed here — two points on
          red, four on blue, and identical on green. The one visible difference
          is the raised-card shadow, which every other surface in the Hub already
          has and this band was missing. */}
      <ToolHero color={C.navy} label="Your balance" value={myBalance} note={many()} />

      <Section title={`What you can get`}>
        {shop.length === 0 ? (
          <Note>Nothing is in the shop yet.{isLeader ? " Add items below." : ""}</Note>
        ) : shop.map((i) => (
          <Row key={i.id}>
            <span style={{ flex: 1, minWidth: 140, fontWeight: 650 }}>{i.name}</span>
            <span style={{ fontFamily: MONO, fontSize: 13, color: C.sub, fontVariantNumeric: "tabular-nums" }}>
              {unit(i.cost)}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 20, padding: "3px 10px",
              color: i.affordable ? C.green : C.faint,
              background: i.affordable ? C.greenBg : "transparent" }}>
              {i.affordable ? "You can get this" : `${i.cost - myBalance} more`}
            </span>
          </Row>
        ))}
      </Section>

      <Section title="Your history">
        {myEntries.length === 0 ? <Note>Nothing yet.</Note> : historyFor(myEntries).map((e) => (
          <Row key={e.id}>
            <span style={{ flex: 1, minWidth: 150 }}>
              <span style={{ fontWeight: 650 }}>{e.reason}</span>
              <span style={{ display: "block", fontSize: 12, color: C.faint }}>
                {fmtWhen(e.at)}{e.type === TYPES.REVERSAL ? " · reversed" : ""}
              </span>
            </span>
            <Amount n={e.amount} />
          </Row>
        ))}
      </Section>

      {isLeader && (
        <LeaderPanel
          ledger={ledger} rows={rows} roster={roster} nameOf={nameOf} user={user}
          catalog={catalog} setCatalog={setCatalog} write={write} busy={busy}
          readFailed={readFailed} setMsg={setMsg} />
      )}
    </Shell>
  );
}

/* ═══ LEADERS ═══════════════════════════════════════════════════════════════
   ⚠️ A SEPARATE COMPONENT, NOT A CONDITIONAL BLOCK, so nothing a team member
   renders can accidentally read another person's row: this whole subtree only
   mounts for a leader. The Worker filters the data as well — the two together
   are the rule, and neither on its own is. */
function LeaderPanel({ ledger, rows, roster, nameOf, user, catalog, setCatalog, write, busy, readFailed, setMsg }) {
  const [who, setWho] = useState("");
  const [amt, setAmt] = useState("");
  const [why, setWhy] = useState("");
  const [item, setItem] = useState("");
  const [pick, setPick] = useState("");
  const [newItem, setNewItem] = useState("");
  const [newCost, setNewCost] = useState("");
  const byId = bareId(user && user.id);

  const people = useMemo(() => [...(roster || [])]
    .filter((m) => m && m.name && String(m.status || "Active").toLowerCase() === "active")
    .sort((a, b) => String(a.name).localeCompare(String(b.name))), [roster]);

  const theirEntries = useMemo(() => entriesFor(ledger, who), [ledger, who]);
  const theirBalance = useMemo(() => balanceOf(theirEntries), [theirEntries]);
  const shop = useMemo(() => shopFor(catalog, theirBalance), [catalog, theirBalance]);

  const grant = async () => {
    const e = makeEntry({ personId: bareId(who), amount: Number(amt), reason: why,
      byId, type: TYPES.EARN });
    /* ⚠️ makeEntry REFUSES a blank reason, a zero, a fraction and a negative on
       an earn. The screen says which, rather than failing silently. */
    if (!e) { setMsg("Pick a person, a whole amount above zero, and say why."); return; }
    if (await write(e)) { setAmt(""); setWhy(""); }
  };

  const redeem = async () => {
    const picked = shop.find((i) => i.id === item);
    if (!picked) { setMsg("Pick something from the shop."); return; }
    /* ⚠️ AFFORDABILITY AND THE ENTRY COME FROM ONE FUNCTION. A screen that
       checked the balance itself and then wrote the entry separately is how a
       negative balance gets in. makeRedemption returns null rather than debt. */
    const e = makeRedemption({ entries: theirEntries, personId: bareId(who),
      item: picked.name, cost: picked.cost, byId });
    if (!e) { setMsg(`Not enough ${many()}.`); return; }
    if (await write(e)) setItem("");
  };

  const reverse = async (entry) => {
    const reason = window.prompt(`Why is this being reversed?\n\n"${entry.reason}"`);
    if (reason == null) return;
    const e = makeReversal(entry, byId, reason);
    if (!e) { setMsg("That entry cannot be reversed."); return; }
    await write(e);
  };

  const saveCatalog = async (next) => {
    const clean = catalogList(next);
    if ((await kvSet(CATALOG_KEY, clean)) === false) { setMsg("The shop did not save."); return; }
    setCatalog(clean);
  };

  return (
    <>
      <Section title={`Everyone's ${many()}`}>
        {rows.length === 0 ? <Note>Nobody has any yet.</Note> : rows.map((r) => (
          <Row key={r.personId}>
            <span style={{ flex: 1, minWidth: 140, fontWeight: 650 }}>{nameOf(r.personId)}</span>
            <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800,
              fontVariantNumeric: "tabular-nums" }}>{r.balance}</span>
          </Row>
        ))}
      </Section>

      <Section title="Give or spend">
        <select value={who} onChange={(e) => setWho(e.target.value)} style={{ ...inp, marginBottom: 8 }}>
          <option value="">Choose a team member…</option>
          {people.map((m) => <option key={m.id} value={bareId(m.id)}>{m.name}</option>)}
        </select>

        {who && (
          <>
            <div style={{ fontSize: 13, color: C.sub, margin: "2px 0 10px" }}>
              {nameOf(who)} has <b style={{ color: C.ink }}>{unit(theirBalance)}</b>.
            </div>

            {/* ⭐⭐ THE REASONS BRI SET, PICKABLE. Matt, Aug 20 2026: "We still
                need the stars system to be complete. Refer to Bri and Hannah
                slack." Nothing about the ledger was missing — the balances,
                reversals, shop and spend path all worked. What was missing is
                that the ANSWERS lived only in Slack, so a leader got an empty
                number box and an empty sentence box and had to invent both.
                ⚠️ IT FILLS THE BOXES, IT DOES NOT REPLACE THEM. The leader can
                still change either before pressing Give, and "Something else"
                leaves both alone. The list is a shortcut, never a gate. */}
            <select
              value={pick}
              onChange={(e) => {
                const id = e.target.value;
                setPick(id);
                const f = fillFor(id);
                if (f) { setWhy(f.reason); setAmt(f.amount); }
              }}
              style={{ ...inp, marginBottom: 8 }}>
              <option value="">What did they do?</option>
              {reasonOptions().map((o) => (
                <option key={o.id} value={o.id}>
                  {o.reason}{o.amount ? ` · +${o.amount}` : ""}
                </option>
              ))}
            </select>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <input value={amt} onChange={(e) => { const v = e.target.value; setAmt(v); }}
                inputMode="numeric" placeholder="How many" style={{ ...inp, width: 120 }} />
              <input value={why} onChange={(e) => { const v = e.target.value; setWhy(v); }}
                placeholder="What did they do? Required." style={{ ...inp, flex: 1, minWidth: 200 }} />
              <button onClick={grant} disabled={busy || readFailed} style={btn(true)}>Give</button>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select value={item} onChange={(e) => setItem(e.target.value)} style={{ ...inp, flex: 1, minWidth: 200 }}>
                <option value="">Spend on…</option>
                {shop.map((i) => (
                  <option key={i.id} value={i.id} disabled={!i.affordable}>
                    {i.name} — {unit(i.cost)}{i.affordable ? "" : " (not enough)"}
                  </option>
                ))}
              </select>
              <button onClick={redeem} disabled={busy || readFailed || !item} style={btn(false)}>Redeem</button>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em",
                textTransform: "uppercase", color: C.faint, marginBottom: 6 }}>
                {nameOf(who)}&rsquo;s history
              </div>
              {theirEntries.length === 0 ? <Note>Nothing yet.</Note> : historyFor(theirEntries).map((e) => (
                <Row key={e.id}>
                  <span style={{ flex: 1, minWidth: 150 }}>
                    <span style={{ fontWeight: 650 }}>{e.reason}</span>
                    <span style={{ display: "block", fontSize: 12, color: C.faint }}>
                      {fmtWhen(e.at)} · by {nameOf(e.byId)}{e.type === TYPES.REVERSAL ? " · reversal" : ""}
                    </span>
                  </span>
                  <Amount n={e.amount} />
                  {/* ⚠️ REVERSE, NOT DELETE, AND ONLY ONCE. A reversal cannot
                      itself be reversed — see makeReversal. */}
                  {e.type !== TYPES.REVERSAL && (
                    <button onClick={() => reverse(e)} disabled={busy || readFailed}
                      style={{ ...btn(false), fontSize: 12, padding: "5px 9px" }}>Reverse</button>
                  )}
                </Row>
              ))}
            </div>
          </>
        )}
      </Section>

      <Section title="The shop">
        <div style={{ fontSize: 13, color: C.sub, marginBottom: 10 }}>
          What a {one()} buys is {STORE.name}&rsquo;s decision. Nothing is set by default.
        </div>
        {catalog.map((i) => (
          <Row key={i.id}>
            <span style={{ flex: 1, minWidth: 140, fontWeight: 650, opacity: i.active ? 1 : .5 }}>{i.name}</span>
            <span style={{ fontFamily: MONO, fontSize: 13, color: C.sub }}>{unit(i.cost)}</span>
            <button onClick={() => saveCatalog(catalog.map((x) => x.id === i.id ? { ...x, active: !x.active } : x))}
              style={{ ...btn(false), fontSize: 12, padding: "5px 9px" }}>
              {i.active ? "Switch off" : "Switch on"}
            </button>
          </Row>
        ))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <input value={newItem} onChange={(e) => { const v = e.target.value; setNewItem(v); }}
            placeholder="What can they get?" style={{ ...inp, flex: 1, minWidth: 180 }} />
          <input value={newCost} onChange={(e) => { const v = e.target.value; setNewCost(v); }}
            inputMode="numeric" placeholder="Cost" style={{ ...inp, width: 100 }} />
          <button
            onClick={() => {
              const cost = Number(newCost);
              if (!String(newItem).trim() || !Number.isFinite(cost) || cost <= 0 || Math.trunc(cost) !== cost) {
                setMsg("Give the item a name and a whole cost above zero."); return;
              }
              saveCatalog([...catalog, { name: newItem.trim(), cost, active: true }]);
              setNewItem(""); setNewCost("");
            }}
            style={btn(true)}>Add</button>
        </div>

        {/* ⭐ BREAK FOOD, ONE TAP AT A TIME. Matt, Aug 20 2026: "break food is
            the reward." That answers the half of the question Hannah left open
            in August — her side was "subject to gift card prizes", which was
            always meant to become the things people spend on.
            ⚠️⚠️ SUGGESTED, NEVER WRITTEN. What a star buys is the store's own
            data and belongs in the store's record, not in source (rule 18).
            Tapping one adds it exactly as if it had been typed, and the cost is
            editable the moment it lands. A store that renames or re-prices one
            keeps its own version, because the match is on the NAME.
            ⚠️ THE PRICES ARE A LADDER, NOT A POLICY. Nobody has set them. They
            are laid out so the shape is obvious, not so the figures are right. */}
        {unaddedSuggestions(catalog).length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>
              Break food, if you want it. Tap to add, then change the cost.
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {unaddedSuggestions(catalog).map((s) => (
                <button key={s.name}
                  onClick={() => saveCatalog([...catalog, { name: s.name, cost: s.cost, active: true }])}
                  style={{ ...btn(false), fontSize: 12, padding: "6px 10px" }}>
                  + {s.name} · {unit(s.cost)}
                </button>
              ))}
            </div>
          </div>
        )}
      </Section>
    </>
  );
}

/* ── small shared pieces ─────────────────────────────────────────────────── */
function Shell({ children, onBack }) {
  return (
    <div style={{ fontFamily: FONT, background: C.paper, minHeight: "100vh", color: C.ink }}>
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "rgba(246,244,239,.92)",
        backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.line}`, padding: "12px 20px",
        display: "flex", alignItems: "center", gap: 14 }}>
        {onBack && <button onClick={onBack} style={{ border: "none", background: "none", color: C.sub,
          fontFamily: FONT, fontSize: 14, cursor: "pointer", fontWeight: 600 }}>← Back</button>}
        <div style={{ fontWeight: 800, fontSize: 16, textTransform: "capitalize" }}>{many()}</div>
      </div>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 18px 72px" }}>{children}</div>
    </div>
  );
}

const Section = ({ title, children }) => (
  <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14,
    ...accentEdge(C.gold, 3), boxShadow: CARD_3D, padding: "14px 16px", marginBottom: 16 }}>
    <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>{title}</div>
    {children}
  </div>
);

const Row = ({ children }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
    padding: "9px 0", borderTop: `1px solid ${C.line}` }}>{children}</div>
);

const Note = ({ children }) => (
  <div style={{ color: C.sub, fontSize: 13.5, padding: "8px 0" }}>{children}</div>
);

/* ⚠️ THE SIGN IS SHOWN, ALWAYS. A ledger that renders 20 and −20 identically is
   unreadable in exactly the moment somebody is querying it. */
const Amount = ({ n }) => (
  <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, fontVariantNumeric: "tabular-nums",
    color: Number(n) < 0 ? C.red : C.green }}>
    {Number(n) > 0 ? `+${n}` : n}
  </span>
);
