import { useState, useEffect, useRef } from "react";
/* The one raised look and accent edge — see cardStyle.js. */
import { CARD_3D, accentEdge, cardSurface, CARD_3D_SOFT } from "./cardStyle.js";
import { WASTE_MENU } from "./wasteMenu.js";
import { hubToken } from "./store.js";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from "recharts";
/* ★ THE FOUR PERIODS COME FROM THE LEAF. This file and worker.js each had a
   copy; the DM that chases a missing shift reads the same list the tile does. */
import { WASTE_PERIODS } from "./wasteInputCheck.js";
import { STORE } from "./storeConfig.js"; // store name on the donation record

// ════════════════════════════════════════════════════════════════
// STORE CONFIG — the only block another location needs to touch.
// Change these four values and the whole app re-skins itself —
// no other edits required anywhere below this section.
// ════════════════════════════════════════════════════════════════
const CONFIG = {
  storeName:        STORE.name,
  accent:           "#0F766E",   // Daily Ops teal — one brand color drives the entire palette
  logoMark:         "G",         // single character shown in the header badge
  storageKeyPrefix: "gcfcr",     // keeps each store's saved data separate
};

// Matt's Slack user ID — the "Signal input done" button DMs this user so he
// doesn't have to chase whether waste was entered in Signal. Posting a user
// ID (not a channel name) as the Slack "channel" opens a DM; the Worker's
// /api/slack-notify passes U-prefixed IDs straight through to make this work.
/* ★ MATT_SLACK_ID IS GONE (Aug 7 2026, clone work). This tile used to post a Gate
   City Slack id and the Worker took it on trust. It now sends
   { to: "owner" } and the Worker resolves the recipient from
   gcfcr-notify-targets-v1 — the same config every scheduled job reads.
   ⚠️ DO NOT PUT AN ID BACK HERE. Change who gets this in the notify-targets
   config, which takes effect without a deploy. An id in this file is a
   second store DMing one of ours, and a page choosing its own recipient. */
// Brandon — BOH Director from 8/1/2026; owns truck / waste / inventory
// and facilities. Tagged on the daily #inventory-management waste post.
// This slot used to hold Tyler Byrd's ID. Tyler's last day is 7/22/2026, and
// terminating him in HR does NOT touch this — it's a constant in this file, so
// the post would have kept @-mentioning a departed employee in front of 32
// people every day. Brandon inherits the function, so he inherits the tag.
/* ★ BRANDON_SLACK_ID IS GONE (Aug 7 2026, clone work). The post now writes
   {{boh}} and the Worker turns it into a real @-mention, resolved from
   gcfcr-notify-targets-v1 at send time.
   ⚠️ THIS IS THE TYLER BYRD BUG CLOSED FOR GOOD. The comment above used to
   explain that this slot held Tyler, that terminating him in HR did not touch
   it, and that the post kept @-mentioning a departed employee in front of 32
   people every day. Naming the SEAT instead of the person means the next
   handover is a config edit, not a deploy somebody has to remember. */
/* Where the last "Signal input done" press left off, so the DM to Matt can
   state the WHOLE range covered instead of just the day on screen (Matt,
   Aug 1 2026). Written and read only by notifySignalDone; a failed read
   degrades the DM to the single date and never blocks it. */
const SIGNAL_DONE_KEY = "gcfcr-waste-signal-done-v1";

// ── Derived theme — generated from CONFIG.accent, no manual upkeep ─
function mix(hex, target, amt) {
  const n = parseInt(hex.slice(1), 16), t = parseInt(target.slice(1), 16);
  const ch = (shift) => {
    const a = (n >> shift) & 0xff, b = (t >> shift) & 0xff;
    return Math.round(a + (b - a) * amt);
  };
  return `#${((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1)}`;
}
const ACCENT      = CONFIG.accent;
const ACCENT_DEEP = mix(ACCENT, "#000000", 0.30);
const ACCENT_TINT = mix(ACCENT, "#FFFFFF", 0.90);
const ACCENT_WASH = mix(ACCENT, "#FFFFFF", 0.96);
const ACCENT_GRAD = `linear-gradient(120deg, ${ACCENT} 0%, ${ACCENT_DEEP} 55%)`; // dual-shade masthead

const PAPER   = "#FAF6EF";
const INK     = "#241B1B";
const INK_DIM = "#9C9088";
const LINE    = "#E6DCCB";
const GOOD    = "#2F8F4E";
const WARN    = "#C2410C";
const MONO = `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`;
const SANS = `'Inter', -apple-system, BlinkMacSystemFont, sans-serif`;

const STORAGE = {
  data:   `${CONFIG.storageKeyPrefix}-waste-v4`,
  pins:   `${CONFIG.storageKeyPrefix}-waste-pins-v4`,
  custom: `${CONFIG.storageKeyPrefix}-waste-custom-v4`,   // LTO / user-added items
  prices: `${CONFIG.storageKeyPrefix}-waste-prices-v4`,   // per-item cost overrides
  don:    `${CONFIG.storageKeyPrefix}-waste-don-v4`,      // bulk donations { date:{ id:{u,lb,oz,ea} } }
  inv:    `${CONFIG.storageKeyPrefix}-waste-inv-v4`,      // on-hand counts { date:{ AM|PM:{ id:count } } }
  invItems: `${CONFIG.storageKeyPrefix}-waste-invitems-v4`, // custom inventory items
  removed: `${CONFIG.storageKeyPrefix}-waste-removed-v4`, // hidden menu items (removable/restorable)
};

// Muted, paper-friendly accent set — distinct per shift period / menu
// category, tuned to sit on a warm ticket background rather than the
// bright saturated tones a generic app template would reach for.
const PCOLOR = {
  "BOH - AM":  "#3C6E8F",
  "BOH - PM":  "#B23A2E",
  "FOH - AM":  "#3F7D52",
  "FOH - PM":  "#6B4E8E",
  "Donations": "#B8860B",
};
const PIE = ["#3C6E8F","#B23A2E","#B8860B","#6B4E8E","#3F7D52","#C2701F","#2F8F8F","#A8456B"];
const PERIODS = ["BOH - AM","BOH - PM","FOH - AM","FOH - PM","Donations"];
const CATS    = ["All","Breakfast","Sandwiches","Entrees","Salads","Sides","A La Carte","Treats","Drinks","LTO"];

const CATCOLOR = {
  "Breakfast":  PIE[2],
  "Sandwiches": PIE[4],
  "Entrees":    ACCENT,
  "Salads":     "#3F7D52",
  "Sides":      PIE[3],
  "A La Carte": PIE[0],
  "Treats":     PIE[7],
  "Drinks":     PIE[1],
  "LTO":        PIE[5],
};

// ── Icons (inline SVG — no emoji, no external icon dependency) ────
const Icon = {
  Trash: (p) => (
    <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke={p.color||"currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
    </svg>
  ),
  Search: (p) => (
    <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke={p.color||"currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
    </svg>
  ),
  Save: (p) => (
    <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke={p.color||"currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" /><path d="M7 3v5h8" />
    </svg>
  ),
  Send: (p) => (
    <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke={p.color||"currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  ),
  TrendUp: (p) => (
    <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke={p.color||"currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" />
    </svg>
  ),
  BarChart: (p) => (
    <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke={p.color||"currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><rect x="7" y="13" width="3" height="5" /><rect x="12" y="9" width="3" height="9" /><rect x="17" y="6" width="3" height="12" />
    </svg>
  ),
};

// Perforated "tear line" — the recurring signature motif. Sits between
// a card's stub (category / pin) and its body, like a real waste ticket.
function Perforation({ bg = PAPER }) {
  return (
    <div style={{ position:"relative", height:0 }}>
      <div style={{ borderTop:`1.5px dashed ${LINE}` }} />
      <span style={{ position:"absolute", left:-7, top:-8, width:16, height:16, borderRadius:"50%", background:bg }} />
      <span style={{ position:"absolute", right:-7, top:-8, width:16, height:16, borderRadius:"50%", background:bg }} />
    </div>
  );
}

// ── Gate City tracked items ───────────────────────────────────────
// Matches the store's Donations/Waste/Inventory sheet, with the
// menu adjustments applied (filets-level items, 5-ct nuggets/grilled,
// muffins as a biscuit-swap line, grilled strips removed, burritos/
// bowls/large hashbrowns/sausage biscuit/side bacon+sausage/a-la-carte
// buns/brownies added, grilled cool wrap -> veggie wrap).
//
// NOTE: the `price` values below are starting/placeholder unit costs.
// Tap any item's cost in the Entry screen to edit it — overrides save
// per item and persist across the team. LTO items take a cost on add.
//
// `bulk:true` = donated by WEIGHT (LB/OZ) rather than counted EACH.
// `vol:true`  = donated by VOLUME (GAL/QT).
/* Moved to wasteMenu.js so the Worker's weekly report reads the SAME list.
   It kept a copy that fell two items behind; see that file. Add items THERE. */
const MENU = WASTE_MENU;

// ── Inventory count list (from the Inventory Reset sheet) ─────────
/* ★ SINGLE-BAG ROWS (Adriana, Jul 31 2026: "when we put inventory and have
   single bags of either Frys or Hasbrowns, how do you want us to count them?
   Because there is no option for single bags it is just for boxes").
   Loose bags now get their own rows instead of being converted to partial
   cases in someone's head. The two existing rows are RENAMED to "(cases)" so
   the pair can't be misread — their ids stay inv01/inv02, so every count
   already saved under them is untouched. Counts here are a plain tally per
   row (the On-hand chip already sums unlike units); nothing downstream does
   case math on them. ⚠️ IDS ARE PERMANENT — stored counts key on them. */
const INVENTORY = [
  {id:"inv01",name:"Fries (cases)"},
  {id:"inv01b",name:"Fries (single bags)"},
  {id:"inv02",name:"Hashbrowns (cases)"},
  {id:"inv02b",name:"Hashbrowns (single bags)"},
  {id:"inv03",name:"Nuggets"},
  {id:"inv04",name:"Filets"},
  {id:"inv05",name:"Spicy"},
  {id:"inv06",name:"Strips"},
  {id:"inv07",name:"Grilled Filets"},
  {id:"inv08",name:"Grilled Nuggets"},
  {id:"inv09",name:"Breakfast Filets"},
  {id:"inv10",name:"Spicy Breakfast"},
];
const INV_SESSIONS = ["AM","PM"];

// ── Helpers ───────────────────────────────────────────────────────
const f$ = (n) => `$${n.toFixed(2)}`;
const fmtWt = (oz) => { const L = Math.floor(oz / 16); const O = +(oz % 16).toFixed(oz % 1 ? 1 : 0); return `${L}lb ${O}oz`; };
const fmtVol = (qt) => { const G = Math.floor(qt / 4); const Q = +(qt % 4).toFixed(qt % 1 ? 1 : 0); return `${G}gal ${Q}qt`; };
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const fmtDate  = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
const shiftDay = (d, days) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + days); return x.toISOString().slice(0, 10); };

// The unit a donation card OPENS on for a given item: volume items in gal/qt,
// bulk items in lb/oz, everything else counted as each.
// SHARED DELIBERATELY by donSet() and DonationCard() — when those two disagreed
// about what "default" meant, tapping LB/OZ on an empty EACH-default card
// deleted the record, donGet() returned null, the card fell back to EACH, and
// the toggle snapped straight back with no LB field ever appearing.
const defaultUnit = (item) => (item?.vol ? "vol" : item?.bulk ? "wt" : "ea");

/* Result-style read. window.storage.get returns null for BOTH "nothing
   stored" and "read failed" — on a dropped connection every list here loaded
   empty, and the next save (or a day clear) wrote that emptiness over the
   real log. getResult carries { ok }; ok:false means DO NOT SEED, DO NOT
   SAVE. */
const stGetR = async (k) => {
  const r = await window.storage.getResult(k);
  return { ok: r.ok, value: r.value ? JSON.parse(r.value) : null };
};
/* window.storage.set reports a refused write by RETURNING FALSE, never by
   throwing. The old version awaited it, threw the answer away, and returned
   true no matter what — every failed save on this tile toasted "Saved". */
const stSet = async (k, v) => (await window.storage.set(k, JSON.stringify(v))) !== false;

// ── Root ──────────────────────────────────────────────────────────
export default function WasteTracker() {
  const [view,    setView]    = useState("entry");
  const [date,    setDate]    = useState(todayStr());
  const [period,  setPeriod]  = useState("BOH - AM");
  const [data,    setData]    = useState({});
  /* ★ PINS ARE PER SECTION SINCE Jul 28 2026 (Karis: "when I pin an item in the
     waste and donations section I think it pins that item across all sections…
     the foods that I look for most often are different for each category").
     She was right — one flat array served both, so pinning in Donations moved
     the item in Waste too.
     ⚠️ SHAPE CHANGE, AND IT MIGRATES ITSELF. The stored key held a bare array;
     it now holds `{ waste: [], don: [] }`. An old array is read as the WASTE
     list, because that is where nearly all pinning happened — dropping it would
     silently clear everyone's pins, and a pin is a small thing somebody set up
     deliberately. */
  const [pins, setPins] = useState({ waste: [], don: [] });
  const [custom,  setCustom]  = useState([]);   // LTO items
  const [removed, setRemoved] = useState([]);   // hidden menu item ids
  const [prices,  setPrices]  = useState({});   // per-item cost overrides { id: cost }
  const [don,     setDon]     = useState({});   // bulk donations { date: { id: {u,lb,oz,ea} } }
  const [inv,       setInv]       = useState({});    // on-hand counts { date: { AM|PM: { id: count } } }
  const [invCustom, setInvCustom] = useState([]);    // custom inventory items
  const [invSession,setInvSession]= useState("AM");
  const [search,  setSearch]  = useState("");
  const [cat,     setCat]     = useState("All");
  const [dashDate,setDashDate]= useState(todayStr());
  const [toast,   setToast]   = useState(null);
  const [ready,   setReady]   = useState(false);
  // Any hydrate read failed → every write path refuses until a clean reload.
  // The page still renders what DID load, behind an amber banner.
  const [loadFailed, setLoadFailed] = useState(false);
  const loadFailedRef = useRef(false);

  // Effective item list = base menu + any LTO items the store added
  const menu = [...MENU.filter(m => !removed.includes(m.id)), ...custom.filter(m => !removed.includes(m.id))];
  /* ⚠️ PRICING LOOKS AT EVERY ITEM EVER, NOT THE PICKER LIST.
     🐛 `periodTotal` priced each logged entry by finding it in `menu`, and a
     removed item is not in `menu` — so `(m ? price * q : 0)` scored it ZERO and
     its dollars vanished from every PAST day at once. The quantities stayed
     (periodCount still counted them), so a day would read 55 items and a
     smaller total than it did yesterday, and the daily Slack post published the
     smaller figure. History is not supposed to move when someone tidies the
     menu. */
  const allItems = [...MENU, ...custom];
  // Effective cost per item — override wins over the built-in default
  const priceOf = (item) => (item && prices[item.id] != null ? prices[item.id] : (item ? item.price : 0));

  useEffect(() => {
    (async () => {
      const [dR, pR, cR, prR, dnR, ivR, icR, rmR] = await Promise.all([
        stGetR(STORAGE.data), stGetR(STORAGE.pins), stGetR(STORAGE.custom),
        stGetR(STORAGE.prices), stGetR(STORAGE.don), stGetR(STORAGE.inv),
        stGetR(STORAGE.invItems), stGetR(STORAGE.removed),
      ]);
      const failed = [dR, pR, cR, prR, dnR, ivR, icR, rmR].some((r) => !r.ok);
      loadFailedRef.current = failed;
      setLoadFailed(failed);
      const d = dR.value, p = pR.value, c = cR.value, pr = prR.value,
        dn = dnR.value, iv = ivR.value, ic = icR.value, rm = rmR.value;
      if (d) setData(d);
      /* Migration: a bare array is the OLD shape and was always the waste list. */
      if (p) setPins(Array.isArray(p) ? { waste: p, don: [] }
                                      : { waste: p.waste || [], don: p.don || [] });
      /* Same shape guard as the pins migration above. A stored value that is
         not an array breaks the `[...MENU..., ...custom]` spread with "is not
         iterable" and blanks the whole tile. */
      if (c) setCustom(Array.isArray(c) ? c : []);
      if (pr) setPrices(pr);
      if (dn) setDon(dn);
      if (iv) setInv(iv);
      // Same guard as `custom` above: invCustom is spread into invMenu.
      if (ic) setInvCustom(Array.isArray(ic) ? ic : []);
      // Same guard: `removed.includes(...)` runs on every render of the menu.
      if (rm) setRemoved(Array.isArray(rm) ? rm : []);
      setReady(true);
    })();
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const getQty = (id) => data?.[date]?.[period]?.[id] ?? 0;

  const bump = (id, delta) => setData(prev => {
    const n = JSON.parse(JSON.stringify(prev));
    if (!n[date]) n[date] = {};
    if (!n[date][period]) n[date][period] = {};
    const v = Math.max(0, (n[date][period][id] || 0) + delta);
    if (v === 0) delete n[date][period][id]; else n[date][period][id] = v;
    return n;
  });

  const setDQ = (id, raw) => {
    const v = Math.max(0, parseInt(raw) || 0);
    setData(prev => {
      const n = JSON.parse(JSON.stringify(prev));
      if (!n[date]) n[date] = {};
      if (!n[date][period]) n[date][period] = {};
      if (v === 0) delete n[date][period][id]; else n[date][period][id] = v;
      return n;
    });
  };

  const save = async () => {
    if (loadFailedRef.current) { showToast("This page didn't load fully — refresh before saving"); return; }
    const ok = (await stSet(STORAGE.data, data))
            && (await stSet(STORAGE.pins, pins))
            && (await stSet(STORAGE.custom, custom))
            && (await stSet(STORAGE.prices, prices))
            && (await stSet(STORAGE.don, don))
            && (await stSet(STORAGE.inv, inv))
            && (await stSet(STORAGE.invItems, invCustom));
    showToast(ok ? "Saved" : "Save failed – check storage");
  };

  /* Immediate-persist handlers. Each one refuses after a failed load (a write
     off an empty fallback would erase the stored list), applies optimistically,
     then checks stSet's boolean — on false it rolls the state back and says so.
     The writes used to fire inside the setState updater with the result thrown
     away; a refused write kept the item on screen and lost it on reload. */
  // LTO / custom items — persist immediately so they can't be lost
  const addCustom = async (name, price) => {
    if (loadFailedRef.current) { showToast("Didn't load fully — refresh before editing"); return; }
    const nm = (name || "").trim();
    if (!nm) return;
    const p = Math.max(0, parseFloat(price) || 0);
    const item = { id:`lto_${Date.now()}`, name:nm, price:p, cat:"LTO" };
    const next = [...custom, item];
    setCustom(next);
    if (!(await stSet(STORAGE.custom, next))) { setCustom(custom); showToast("Did not save — check the wifi and try again"); return; }
    showToast("LTO item added");
  };
  const removeCustom = async (id) => {
    if (loadFailedRef.current) { showToast("Didn't load fully — refresh before editing"); return; }
    /* ⚠️ HIDES, NEVER DELETES — the same treatment a base menu item already got.
       Dropping the item out of `custom` threw away the only record of what it
       cost, so every past day that logged it lost those dollars for good and no
       later fix could recover them. Hiding keeps the price for history, takes
       it out of the picker, and makes it restorable like the rest. */
    const next = [...new Set([...removed, id])];
    setRemoved(next);
    if (!(await stSet(STORAGE.removed, next))) { setRemoved(removed); showToast("Did not save — check the wifi and try again"); }
  };

  // Remove any item: custom (LTO/added) → delete; base menu item → hide (restorable)
  const removeItem = (item) => {
    if (custom.some(c => c.id === item.id)) { removeCustom(item.id); }
    else {
      if (loadFailedRef.current) { showToast("Didn't load fully — refresh before editing"); return; }
      const next = [...removed, item.id];
      setRemoved(next);
      stSet(STORAGE.removed, next).then(ok => { if (!ok) { setRemoved(removed); showToast("Did not save — check the wifi and try again"); } });
    }
  };
  const restoreItem = (id) => {
    if (loadFailedRef.current) { showToast("Didn't load fully — refresh before editing"); return; }
    const next = removed.filter(x => x !== id);
    setRemoved(next);
    stSet(STORAGE.removed, next).then(ok => { if (!ok) { setRemoved(removed); showToast("Did not save — check the wifi and try again"); } });
  };
  // Both kinds show in the restore list now that an LTO is hidden, not deleted.
  const removedItems = [...MENU, ...custom].filter(m => removed.includes(m.id));

  // Tap-to-edit cost — persist immediately so a set cost can't be lost
  const setPrice = (id, raw) => {
    if (loadFailedRef.current) { showToast("Didn't load fully — refresh before editing"); return; }
    const v = Math.max(0, parseFloat(raw) || 0);
    const next = { ...prices, [id]: v };
    setPrices(next);
    stSet(STORAGE.prices, next).then(ok => { if (!ok) { setPrices(prices); showToast("Did not save — check the wifi and try again"); } });
  };

  // ── Bulk donations (weight or each) ──
  const donGet = (id) => (don?.[date]?.[id]) ?? null;
  const donSet = (id, next) => setDon(prev => {
    const n = JSON.parse(JSON.stringify(prev));
    if (!n[date]) n[date] = {};
    const empty = next.u === "wt"  ? (!Number(next.lb)  && !Number(next.oz))
                : next.u === "vol" ? (!Number(next.gal) && !Number(next.qt))
                : (!Number(next.ea));
    // An empty record is only dropped when its unit is still the item's
    // DEFAULT. Previously ANY empty record was deleted, so tapping LB/OZ on an
    // empty EACH-default card removed it, donGet() returned null, the card fell
    // back to EACH, and the toggle snapped straight back — with no LB field
    // ever appearing to type a weight into. Keeping the unit-only record makes
    // the switch stick so the fields show. Empty records carry no weight/count,
    // so every total, summary and Slack post still ignores them.
    const defU = defaultUnit(menu.find(x => x.id === id));
    if (empty && next.u === defU) delete n[date][id]; else n[date][id] = next;
    return n;
  });
  const donTotals = (d) => {
    const day = don?.[d !== undefined ? d : date] ?? {};
    let oz = 0, ea = 0, qt = 0, items = 0;
    Object.values(day).forEach(v => {
      if (v.u === "wt") { const o = Number(v.lb||0)*16 + Number(v.oz||0); if (o > 0) { oz += o; items++; } }
      else if (v.u === "vol") { const q = Number(v.gal||0)*4 + Number(v.qt||0); if (q > 0) { qt += q; items++; } }
      else { const c = Number(v.ea||0); if (c > 0) { ea += c; items++; } }
    });
    return { oz, ea, qt, items };
  };

  // ── Inventory (on-hand counts by AM/PM session) ──
  const invMenu = [...INVENTORY, ...invCustom];
  const invGet = (id) => inv?.[date]?.[invSession]?.[id] ?? 0;
  const invSetQ = (id, val) => setInv(prev => {
    const n = JSON.parse(JSON.stringify(prev));
    if (!n[date]) n[date] = {};
    if (!n[date][invSession]) n[date][invSession] = {};
    const v = Math.max(0, val);
    if (v === 0) delete n[date][invSession][id]; else n[date][invSession][id] = v;
    return n;
  });
  const invBump = (id, delta) => invSetQ(id, (invGet(id) || 0) + delta);
  const invTotal = () => invMenu.reduce((s, it) => s + (invGet(it.id) || 0), 0);
  const addInvItem = async (name) => {
    if (loadFailedRef.current) { showToast("Didn't load fully — refresh before editing"); return; }
    const nm = (name || "").trim();
    if (!nm) return;
    const item = { id:`invx_${Date.now()}`, name:nm };
    const next = [...invCustom, item];
    setInvCustom(next);
    if (!(await stSet(STORAGE.invItems, next))) { setInvCustom(invCustom); showToast("Did not save — check the wifi and try again"); return; }
    showToast("Item added");
  };
  const removeInvItem = (id) => {
    if (loadFailedRef.current) { showToast("Didn't load fully — refresh before editing"); return; }
    const next = invCustom.filter(x => x.id !== id);
    setInvCustom(next);
    stSet(STORAGE.invItems, next).then(ok => { if (!ok) { setInvCustom(invCustom); showToast("Did not save — check the wifi and try again"); } });
  };

  /* ⚠️ THE SECTION IS PASSED IN, NOT READ FROM A CLOSURE. `period` lives in
     EntryView, not here, so a pin toggled from a Donation card must say so. */
  /* Which list is in play right now. Donations is its own section; everything
     else shares the waste list. */
  const pinsForPeriod = (period === "Donations" ? pins.don : pins.waste) || [];

  const togglePinIn = (which, id) => setPins(prev => {
    const cur = prev[which] || [];
    return { ...prev, [which]: cur.includes(id) ? cur.filter(x => x !== id) : [id, ...cur] };
  });

  const periodTotal = (p, d) => {
    const dd = d !== undefined ? d : date;
    return Object.entries(data?.[dd]?.[p] ?? {}).reduce((s, [id, q]) => {
      const m = allItems.find(x => x.id === id);
      return s + (m ? priceOf(m) * q : 0);
    }, 0);
  };

  const periodCount = (p, d) => {
    const dd = d !== undefined ? d : date;
    return Object.values(data?.[dd]?.[p] ?? {}).reduce((s, q) => s + q, 0);
  };

  const dayTotal = (d) => WASTE_PERIODS.reduce((s, p) => s + periodTotal(p, d), 0);

  // ── Deliberate one-tap post of a day's waste + donation summary to
  //    #inventory-management. Persists the current entries first, then
  //    posts through the Worker's existing /api/slack-notify route
  //    (channel name resolves server-side). If nothing's logged for the
  //    date it says so instead of firing an empty ping. It's a button,
  //    not fire-on-save, so the channel gets one clean summary per day.
  const postDailyToSlack = async (dk) => {
    // A failed load means the totals below were built off a partial log —
    // never post (or persist) from that.
    if (loadFailedRef.current) { showToast("This page didn't load fully — refresh before posting"); return "fail"; }
    const periodLines = [];
    let dayTot = 0, dayItems = 0;
    WASTE_PERIODS.forEach(p => {
      const t = periodTotal(p, dk);
      const c = periodCount(p, dk);
      if (c > 0) { periodLines.push(`   \u2022 ${p}: ${f$(t)} (${c})`); dayTot += t; dayItems += c; }
    });

    // Top items across all waste periods (by dollar value, then qty)
    const acc = {};
    WASTE_PERIODS.forEach(p => {
      Object.entries(data?.[dk]?.[p] ?? {}).forEach(([id, q]) => {
        const m = menu.find(x => x.id === id);
        const name = m ? m.name : id;
        const val = m ? priceOf(m) * q : 0;
        if (!acc[name]) acc[name] = { qty:0, val:0 };
        acc[name].qty += q; acc[name].val += val;
      });
    });
    const topItems = Object.entries(acc)
      .sort((a, b) => (b[1].val - a[1].val) || (b[1].qty - a[1].qty))
      .slice(0, 5);

    const dTotals = donTotals(dk);

    if (dayItems === 0 && dTotals.items === 0) {
      showToast("Nothing logged for this date");
      return "empty";
    }

    let text = `*Waste Log \u2014 ${fmtDate(dk)}*   {{boh}}\n`;
    text += `*Total waste:* ${f$(dayTot)} \u00b7 ${dayItems} item${dayItems !== 1 ? "s" : ""}\n`;
    if (periodLines.length) text += `\n*By period:*\n${periodLines.join("\n")}\n`;
    if (topItems.length) {
      text += `\n*Top items:*\n`;
      text += topItems.map(([n, v]) => `   \u2022 ${n} \u2014 ${f$(v.val)} (\u00d7${v.qty})`).join("\n") + "\n";
    }
    if (dTotals.items > 0) {
      const parts = [];
      if (dTotals.oz > 0) parts.push(fmtWt(dTotals.oz));
      if (dTotals.qt > 0) parts.push(fmtVol(dTotals.qt));
      if (dTotals.ea > 0) parts.push(`${dTotals.ea} ea`);
      text += `\n*Donations:* ${parts.join(" \u00b7 ")}\n`;
    }

    // Persist current entries so the saved log matches the ping. If the save
    // does NOT land, the ping doesn't go out — a Slack post carrying numbers
    // that storage never received would read as logged when nothing was.
    const okData = await stSet(STORAGE.data, data);
    const okDon = await stSet(STORAGE.don, don);
    if (!okData || !okDon) {
      showToast("The log did not save — check the wifi. Nothing was posted.");
      return "fail";
    }

    try {
      const res = await fetch("/api/slack-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
        body: JSON.stringify({ channel: "inventory-management", text }),
      });
      if (res.ok) { showToast("Posted to #inventory-management"); return "ok"; }
      showToast("Slack post failed"); return "fail";
    } catch {
      showToast("Slack post failed"); return "fail";
    }
  };

  // "Signal input done" — DMs Matt so he doesn't have to ask whether the
  // waste numbers were entered into Signal. Posts to /api/slack-notify with
  // Matt's user ID as the channel, which Slack turns into a direct message.
  // Matt, Aug 1 2026: "when waste is logged into Signal I want to know the
  // whole date range." The DM now covers everything since the previous
  // Signal-done press, not just the day on screen: a marker remembers where
  // the last press left off, the message states the full stretch, and it
  // names any day inside it with nothing logged \u2014 a hole in Signal is
  // invisible exactly when nobody wrote anything down.
  const notifySignalDone = async (dk) => {
    const marker = await stGetR(SIGNAL_DONE_KEY);
    let from = dk;
    if (marker.ok && marker.value?.lastDoneIso && marker.value.lastDoneIso < dk) {
      const next = shiftDay(marker.value.lastDoneIso, 1);
      if (next <= dk) from = next;
    }
    const hasEntries = (d) => WASTE_PERIODS.some((p) => Object.keys((data[d] || {})[p] || {}).length > 0);
    const holes = [];
    let span = 0;
    for (let d = from; d <= dk && span < 62; d = shiftDay(d, 1), span++) {
      if (!hasEntries(d)) holes.push(fmtDate(d));
      if (d === dk) break;
    }
    const range = from < dk ? `${fmtDate(from)} through ${fmtDate(dk)}` : fmtDate(dk);
    const text =
      `*Waste input into Signal* \u2014 ${range}\n` +
      (holes.length ? `No waste logged for: ${holes.slice(0, 8).join(", ")}${holes.length > 8 ? ` +${holes.length - 8} more` : ""}\n` : "") +
      `Marked done from the ${STORE.appName}.`;
    try {
      const res = await fetch("/api/slack-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
        body: JSON.stringify({ to: "owner", text }),
      });
      if (res.ok) {
        // Marker moves FORWARD only \u2014 re-signaling an old day must not
        // pull the next range's start backward. Best effort, unawaited: a
        // missed write only widens the next DM's range, it never loses data.
        if (!marker.ok || !marker.value?.lastDoneIso || dk > marker.value.lastDoneIso) {
          stSet(SIGNAL_DONE_KEY, { lastDoneIso: dk, at: new Date().toISOString() });
        }
        showToast("Matt notified"); return "ok";
      }
      showToast("Notify failed"); return "fail";
    } catch {
      showToast("Notify failed"); return "fail";
    }
  };

  /* The clears rewrite the WHOLE data/don maps minus the cleared keys. After a
     failed load those maps are empty fallbacks, so one tap would write {} over
     every day ever logged — the hardest refusal on this page. */
  // Wipe all waste + donation entries for one date (e.g. stale test data)
  const clearDay = async (dk) => {
    if (loadFailedRef.current) { showToast("This page didn't load fully — refresh before clearing"); return; }
    const nd = { ...data }; delete nd[dk];
    const ndon = { ...don }; delete ndon[dk];
    setData(nd); setDon(ndon);
    const okD = await stSet(STORAGE.data, nd);
    const okN = await stSet(STORAGE.don, ndon);
    if (!okD || !okN) { setData(data); setDon(don); showToast("Clear did not save — check the wifi and try again"); return; }
    showToast("Day cleared");
  };

  // Wipe all waste + donation entries within a date range (inclusive)
  const clearRange = async (start, end) => {
    if (loadFailedRef.current) { showToast("This page didn't load fully — refresh before clearing"); return; }
    const nd = { ...data }; Object.keys(nd).forEach(k => { if (k >= start && k <= end) delete nd[k]; });
    const ndon = { ...don }; Object.keys(ndon).forEach(k => { if (k >= start && k <= end) delete ndon[k]; });
    setData(nd); setDon(ndon);
    const okD = await stSet(STORAGE.data, nd);
    const okN = await stSet(STORAGE.don, ndon);
    if (!okD || !okN) { setData(data); setDon(don); showToast("Clear did not save — check the wifi and try again"); return; }
    showToast("Range cleared");
  };

  const filtered = menu
    .filter(m => !m.hidden && (cat === "All" || (cat === "Bulk" ? m.bulk : m.cat === cat)) && m.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      /* ⚠️ SORTS BY THE ACTIVE SECTION'S PINS. Using a merged list here would
         float a Donations pin to the top of the Waste list, which is the exact
         complaint this change answers. */
      const [ap, bp] = [pinsForPeriod.includes(a.id), pinsForPeriod.includes(b.id)];
      return (ap && !bp) ? -1 : (!ap && bp) ? 1 : 0;
    });

  if (!ready) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", gap:12, background:PAPER, fontFamily:SANS }}>
      <div style={{ width:52, height:52, borderRadius:8, background:ACCENT_DEEP, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <Icon.Trash size={26} color={PAPER} />
      </div>
      <div style={{ color:ACCENT_DEEP, fontWeight:700, fontSize:16, fontFamily:MONO }}>Loading waste log…</div>
    </div>
  );

  /* ⚠️ 520 WAS A PHONE WIDTH ON EVERY SCREEN. Matt's laptop screenshot, Jul 30:
     the entry form in a narrow strip with the right half of a 13" display
     empty, while the item grid inside it wrapped to one column. The cap is
     still right on a phone, so it becomes a ceiling that only bites on small
     screens: the screen width, up to 960. iPad portrait (768) and phones are
     unchanged because they are already under it. */
  return (
    <div style={{ fontFamily:SANS, background:PAPER, minHeight:"100vh", maxWidth:"min(100%, 960px)", margin:"0 auto" }}>
      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
        button:focus-visible, input:focus-visible, select:focus-visible { outline:2px solid ${ACCENT}; outline-offset:2px; }
        .gc-zz { height:9px; background: linear-gradient(135deg, #fff 5px, transparent 0) 0 0, linear-gradient(225deg, #fff 5px, transparent 0) 0 0; background-size:11px 9px; background-repeat:repeat-x; }
        .gc-zz-deep { height:9px; background: linear-gradient(135deg, ${ACCENT_DEEP} 5px, transparent 0) 0 0, linear-gradient(225deg, ${ACCENT_DEEP} 5px, transparent 0) 0 0; background-size:11px 9px; background-repeat:repeat-x; }
        @media (prefers-reduced-motion: reduce) { * { transition:none !important; } }
      `}</style>
      {loadFailed && (
        <div style={{ background:"#FFFBEB", border:"1.5px solid #F59E0B", color:"#92400E", borderRadius:10, padding:"10px 14px", fontSize:13, fontWeight:700, margin:"10px 12px" }}>
          Part of this log did not load, so saving, posting and clearing are off —
          a save now could erase days that are really stored. Check the wifi and
          refresh the page.
        </div>
      )}
      {/* ── Header ── */}
      <div style={{ background:ACCENT_GRAD, padding:"11px 14px 0", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingBottom:11 }}>
          <div style={{ display:"flex", alignItems:"center", gap:9 }}>
            <span style={{ width:28, height:28, borderRadius:6, background:PAPER, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontFamily:MONO, fontWeight:800, fontSize:14, color:ACCENT_DEEP }}>
              {CONFIG.logoMark}
            </span>
            <span style={{ color:PAPER, fontWeight:800, fontSize:17, letterSpacing:.2 }}>Waste Log</span>
            <span style={{ background:"rgba(255,255,255,0.16)", color:PAPER, fontSize:10, padding:"2px 8px", borderRadius:4, fontWeight:700, fontFamily:MONO, textTransform:"uppercase", letterSpacing:.4 }}>
              {CONFIG.storeName}
            </span>
          </div>
          <div style={{ display:"flex", gap:2, background:"rgba(0,0,0,0.18)", borderRadius:7, padding:2 }}>
            {[["entry","Entry"],["inventory","Inv"],["prices","Prices"],["dashboard","Dash"]].map(([v,lbl]) => (
              <button key={v} onClick={() => setView(v)}
                style={{ background:view===v?PAPER:"transparent", color:view===v?ACCENT_DEEP:"rgba(255,255,255,0.75)", border:"none", borderRadius:5, padding:"5px 11px", fontSize:11, fontWeight:800, letterSpacing:.4, textTransform:"uppercase", fontFamily:MONO, cursor:"pointer" }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", background:INK, color:PAPER, padding:"9px 22px", borderRadius:7, fontSize:13, fontWeight:700, fontFamily:MONO, zIndex:9999, boxShadow:"0 4px 20px rgba(0,0,0,0.3)", whiteSpace:"nowrap" }}>
          {toast}
        </div>
      )}

      {view === "entry"
        ? <EntryView {...{ date, setDate, period, setPeriod, filtered, getQty, bump, setDQ, periodTotal, periodCount, pinsForPeriod, togglePinIn, search, setSearch, cat, setCat, save, addCustom, removeCustom, priceOf, setPrice, donGet, donSet, donTotals, removeItem, restoreItem, removedItems, postDailyToSlack, notifySignalDone, data, menu, don }} />
        : view === "inventory"
        ? <InventoryView {...{ date, setDate, invSession, setInvSession, invMenu, invGet, invBump, invSetQ, invTotal, addInvItem, removeInvItem, save }} />
        : view === "prices"
        ? <PricesView {...{ menu, priceOf, setPrice }} />
        : <DashboardView {...{ dashDate, setDashDate, data, don, menu, periodTotal, periodCount, dayTotal, priceOf, clearDay, clearRange }} />
      }
    </div>
  );
}

/* ── Prices View (Aug 14 2026) ──────────────────────────────────────
   ⚠️ THE EDITOR WAS NEVER MISSING. IT WAS UNFINDABLE. Tap-to-edit has
   existed under every item in the Entry list since v4: an 11px grey price
   with an 8px "edit" beside it, one item at a time, behind whatever search
   and category filter you happen to have set. Measured Aug 14 2026 against
   the live board: 77 products had been wasted, 41 priced, 31 sitting at
   zero, and every one of the 31 was a raw component — filets, nuggets,
   buns, cheese, bacon, eggs, biscuits. The things you actually throw away.
   ⇒ So this is not a second editor. It is the SAME `setPrice`, the same
   `gcfcr-waste-prices-v4` map, the same flat { id: number } shape, shown
   as one list you can walk down in a single pass.

   ⚠️ NOTHING NEW IS STORED. No key, no field, no shape change. If that
   ever stops being true, this comment is wrong and rule 1 is in play.

   ⚠️ ZERO MEANS "NOT SET", DELIBERATELY. The map cannot tell a real zero
   from a fat finger — two items already carry an explicit 0 and there is
   no way to know which they were. Treating 0 as unset is what makes the
   count honest; the alternative is a screen that says you are done while
   items still cost nothing. If a product genuinely is free, it will show
   in this list forever, and that is the cheaper mistake. */
function PriceRow({ item, price, onSave }) {
  const [v, setV] = useState(price ? String(price) : "");
  const missing = !price;
  const commit = () => { if (v.trim() !== "" || price) onSave(item.id, v); };
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderBottom:`1px solid ${LINE}`, background: missing ? ACCENT_WASH : "transparent" }}>
      <span style={{ flex:1, fontSize:14, color:INK, fontWeight: missing ? 700 : 500 }}>{item.name}</span>
      <span style={{ fontSize:9, color:INK_DIM, fontFamily:MONO, letterSpacing:.3 }}>{item.id}</span>
      <span style={{ fontSize:12, color:INK_DIM, fontFamily:MONO }}>$</span>
      <input
        type="number" min={0} step="0.01" inputMode="decimal" placeholder="0.00"
        aria-label={`Cost for ${item.name}`}
        value={v}
        onChange={(e) => { const val = e.target.value; setV(val); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        style={{ width:84, border:`1.5px solid ${missing ? ACCENT : LINE}`, borderRadius:6, padding:"5px 8px", fontSize:16, fontFamily:MONO, color:INK, outline:"none", background:"white", textAlign:"right" }} />
    </div>
  );
}

function PricesView({ menu, priceOf, setPrice }) {
  const [onlyMissing, setOnlyMissing] = useState(true);
  const missing = menu.filter((m) => !priceOf(m));
  const shown = onlyMissing ? missing : menu;
  const cats = [...new Set(shown.map((m) => m.cat || "Other"))];
  const done = menu.length - missing.length;

  return (
    <div style={{ maxWidth:720, margin:"0 auto", padding:"16px 12px 60px" }}>

      {/* ⚠️⚠️ `background:` AND `boxShadow:`, NEVER THREE DOTS. Both helpers
          return STRINGS. Spreading a string spreads its CHARACTERS, so the style
          object becomes { 0:"r", 1:"a", 2:"d", … }, React tries to set a CSS
          property called "0", and the whole tile goes to its crash boundary with
          "Cannot set indexed properties on this object".
          This shipped live at the Village on Aug 14 2026 and killed two tiles.
          `styleSpread.test.mjs` fails the build for it. */}
      <div style={{ background: cardSurface(), boxShadow: CARD_3D, borderRadius:10, padding:"16px 18px", marginBottom:14 }}>
        <div style={{ fontSize:11, fontFamily:MONO, letterSpacing:.5, color:INK_DIM, textTransform:"uppercase", fontWeight:700 }}>Item costs</div>
        <div style={{ fontSize:26, fontWeight:800, color: missing.length ? ACCENT : INK, letterSpacing:-.5, marginTop:4 }}>
          {missing.length === 0 ? "All items priced" : `${missing.length} still need a price`}
        </div>
        <div style={{ fontSize:13, color:INK_DIM, marginTop:4, lineHeight:1.45 }}>
          {done} of {menu.length} done. An item with no cost is thrown away for free
          on every report, so waste, donations and the daily total all read low
          until it is filled in.
        </div>
        <div style={{ height:10 }} />
        <button
          onClick={() => setOnlyMissing((x) => !x)}
          style={{ background: onlyMissing ? ACCENT : "transparent", color: onlyMissing ? PAPER : INK, border:`1.5px solid ${onlyMissing ? ACCENT : LINE}`, borderRadius:7, padding:"7px 14px", fontSize:11, fontWeight:800, fontFamily:MONO, letterSpacing:.4, textTransform:"uppercase", cursor:"pointer" }}>
          {onlyMissing ? "Showing only missing" : "Showing everything"}
        </button>
      </div>

      {shown.length === 0 ? (
        <div style={{ background: cardSurface(), borderRadius:10, padding:"28px 18px", textAlign:"center", color:INK_DIM, fontSize:14 }}>
          Nothing left to price. Tap the button above to see every item.
        </div>
      ) : cats.map((c) => (
        <div key={c} style={{ background: cardSurface(), boxShadow: CARD_3D_SOFT, borderRadius:10, overflow:"hidden", marginBottom:12 }}>
          <div style={{ padding:"9px 12px", background:ACCENT_TINT, fontSize:11, fontWeight:800, fontFamily:MONO, letterSpacing:.5, textTransform:"uppercase", color:ACCENT_DEEP }}>
            {c}
          </div>
          {shown.filter((m) => (m.cat || "Other") === c).map((m) => (
            <PriceRow key={m.id} item={m} price={priceOf(m)} onSave={setPrice} />
          ))}
        </div>
      ))}

    </div>
  );
}

// ── Entry View ────────────────────────────────────────────────────
function EntryView({ date, setDate, period, setPeriod, filtered, getQty, bump, setDQ, periodTotal, periodCount, pinsForPeriod, togglePinIn, search, setSearch, cat, setCat, save, addCustom, removeCustom, priceOf, setPrice, donGet, donSet, donTotals, removeItem, restoreItem, removedItems, postDailyToSlack, notifySignalDone, data, menu, don }) {
  const [manage, setManage] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const [posting, setPosting] = useState(false);
  const [signaling, setSignaling] = useState(false);
  const [ltoOpen,  setLtoOpen]  = useState(false);
  const [ltoName,  setLtoName]  = useState("");
  const [ltoPrice, setLtoPrice] = useState("");
  const [editId,   setEditId]   = useState(null);
  const [editVal,  setEditVal]  = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const isDon = period === "Donations";
  const catOptions = isDon ? ["All","Bulk",...CATS.slice(1)] : CATS;
  const total = periodTotal(period, date);
  const count = periodCount(period, date);
  const dTot  = donTotals(date);

  // "Entered so far" — a flat list of just what's been logged for this date,
  // so a leader can see what's already in without scrolling the whole menu.
  const wasteEntries = Object.entries(data?.[date]?.[period] ?? {}).map(([id, q]) => {
    const m = (menu || []).find(x => x.id === id);
    return { id, name: m ? m.name : id, qty: q, value: m ? priceOf(m) * q : 0, off: !m };
  }).sort((a, b) => (b.value - a.value) || (b.qty - a.qty));

  const donEntries = Object.entries(don?.[date] ?? {}).map(([id, dv]) => {
    const m = (menu || []).find(x => x.id === id);
    let detail = "";
    if (dv.u === "wt") { const o = Number(dv.lb||0)*16 + Number(dv.oz||0); detail = o > 0 ? fmtWt(o) : ""; }
    else if (dv.u === "vol") { const qv = Number(dv.gal||0)*4 + Number(dv.qt||0); detail = qv > 0 ? fmtVol(qv) : ""; }
    else { const c = Number(dv.ea||0); detail = c > 0 ? `${c} ea` : ""; }
    return { id, name: m ? m.name : id, detail, off: !m };
  }).filter(r => r.detail).sort((a, b) => a.name.localeCompare(b.name));

  const summaryList  = isDon ? donEntries : wasteEntries;
  const summaryCount = summaryList.length;

  // Leaving donation mode? Bulk isn't a waste filter — fall back to All.
  useEffect(() => { if (!isDon && cat === "Bulk") setCat("All"); }, [isDon]);

  const submitLto = () => {
    addCustom(ltoName, ltoPrice);
    setLtoName(""); setLtoPrice(""); setLtoOpen(false);
  };

  const handleSendDaily = async () => {
    if (posting) return;
    setPosting(true);
    await postDailyToSlack(date);
    setPosting(false);
  };

  const handleSignalDone = async () => {
    if (signaling) return;
    setSignaling(true);
    await notifySignalDone(date);
    setSignaling(false);
  };

  // One tap for the whole close-out: post today's log to #inventory-management,
  // then notify Matt that Signal input is done. If nothing's logged, the post
  // step says so and we still send the "done" ping.
  const handleSignalComplete = async () => {
    if (posting || signaling) return;
    setPosting(true);
    await postDailyToSlack(date);
    setPosting(false);
    setSignaling(true);
    await notifySignalDone(date);
    setSignaling(false);
  };

  const startEdit = (item) => { setEditId(item.id); setEditVal(String(priceOf(item))); };
  const commitEdit = () => {
    if (editId != null) setPrice(editId, editVal);
    setEditId(null); setEditVal("");
  };

  return (
    <div>
      {/* Period + date bar — receipt stub */}
      <div style={{ background:"#fff", padding:"12px 14px 14px", boxShadow:"0 1px 4px rgba(36,27,27,0.06)" }}>
        <div style={{ display:"flex", gap:8, marginBottom:10 }}>
          {/* Period dropdown */}
          <div style={{ position:"relative", flex:1 }}>
            <button onClick={() => setShowDrop(d => !d)}
              style={{ width:"100%", background:"white", border:`1px dashed ${LINE}`, borderRadius:7, padding:"8px 12px", fontWeight:700, fontSize:13, color:INK, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between", fontFamily:MONO }}>
              <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                <span style={{ width:9, height:9, borderRadius:"50%", background:PCOLOR[period], display:"inline-block", flexShrink:0 }} />
                {period}
              </div>
              <span style={{ fontSize:10, color:INK_DIM }}>▼</span>
            </button>
            {showDrop && (
              <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:"white", borderRadius:9, border:`1px solid ${LINE}`, boxShadow:"0 6px 28px rgba(36,27,27,0.16)", zIndex:200, overflow:"hidden" }}>
                {PERIODS.map(p => (
                  <button key={p} onClick={() => { setPeriod(p); setShowDrop(false); }}
                    style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"11px 14px", border:"none", background:p===period?ACCENT_WASH:"white", textAlign:"left", fontSize:13, fontWeight:p===period?700:400, color:INK, cursor:"pointer", borderBottom:`1px solid ${LINE}`, fontFamily:MONO }}>
                    <span style={{ width:9, height:9, borderRadius:"50%", background:PCOLOR[p], flexShrink:0 }} />
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ background:"white", border:`1px dashed ${LINE}`, borderRadius:7, padding:"8px 10px", fontSize:16, color:INK, cursor:"pointer", fontWeight:600, fontFamily:MONO }} />
        </div>

        {/* Summary + Save */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", gap:8 }}>
            {isDon ? (
              <>
                <Chip label={fmtWt(dTot.oz)} sub="Donated" />
                {dTot.qt > 0 && <Chip label={fmtVol(dTot.qt)} sub="Volume" />}
                <Chip label={String(dTot.ea)} sub="Each" />
              </>
            ) : (
              <>
                <Chip label={f$(total)} sub="Waste" />
                <Chip label={String(count)} sub="Items" />
              </>
            )}
          </div>
          <button onClick={save}
            style={{ background:ACCENT_DEEP, color:PAPER, border:"none", borderRadius:8, padding:"12px 22px", fontSize:14, fontWeight:800, cursor:"pointer", display:"flex", alignItems:"center", gap:7, fontFamily:MONO, letterSpacing:1, boxShadow:"0 2px 0 rgba(0,0,0,0.25)" }}>
            <Icon.Save size={14} /> SAVE
          </button>
        </div>

        {/* One button: posts today's log to #inventory-management AND notifies
            Matt that Signal input is done. Runs both actions in sequence. */}
        <button onClick={handleSignalComplete} disabled={posting || signaling}
          style={{ width:"100%", marginTop:10, background:(posting||signaling)?ACCENT_WASH:ACCENT_DEEP, color:(posting||signaling)?ACCENT_DEEP:PAPER, border:`1px solid ${ACCENT_DEEP}`, borderRadius:8, padding:"12px 12px", fontSize:13, fontWeight:800, cursor:(posting||signaling)?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, fontFamily:MONO, letterSpacing:.3, opacity:(posting||signaling)?0.8:1 }}>
          <Icon.Send size={13} /> {(posting || signaling) ? "Working\u2026" : "Signal input is complete"}
        </button>
      </div>
      <div className="gc-zz" style={{ marginBottom:2 }} />

      {/* Entered so far — collapsible list of what's logged for this date+period */}
      <div style={{ background:PAPER, padding:"8px 14px 0" }}>
        <button onClick={() => setSummaryOpen(o => !o)}
          style={{ width:"100%", background:summaryOpen?ACCENT_DEEP:"white", color:summaryOpen?PAPER:ACCENT_DEEP, border:`1px dashed ${ACCENT}`, borderRadius:summaryOpen?"7px 7px 0 0":7, padding:"8px 12px", fontSize:12, fontWeight:800, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between", fontFamily:MONO, letterSpacing:.3 }}>
          <span>{summaryOpen ? "▾" : "▸"} Entered so far ({summaryCount})</span>
          <span style={{ fontSize:10, opacity:.8 }}>{isDon ? "Donations" : period}</span>
        </button>
        {summaryOpen && (
          <div style={{ background:"white", border:`1px solid ${LINE}`, borderTop:"none", borderRadius:"0 0 7px 7px", padding:"4px 12px 8px" }}>
            {summaryCount === 0 ? (
              <div style={{ fontSize:12, color:INK_DIM, padding:"10px 2px", textAlign:"center", fontFamily:MONO }}>
                Nothing logged yet for {isDon ? "donations" : period}
              </div>
            ) : summaryList.map((r, i) => (
              <div key={r.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 2px", borderBottom:i<summaryList.length-1?`1px solid ${LINE}`:"none" }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, flex:1, minWidth:0 }}>
                  <span style={{ fontSize:12, color:r.off?INK_DIM:INK, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.name}</span>
                  {r.off && <span style={{ fontSize:9, fontWeight:700, color:INK_DIM, background:"#0000000D", padding:"1px 5px", borderRadius:4, fontFamily:MONO, flexShrink:0 }}>off-list</span>}
                </div>
                <div style={{ fontSize:12, fontWeight:700, color:INK, fontFamily:MONO, flexShrink:0, marginLeft:8 }}>
                  {isDon ? r.detail : `${f$(r.value)} · ×${r.qty}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div style={{ background:PAPER, padding:"8px 14px", display:"flex", gap:8, borderBottom:`1px dashed ${LINE}`, position:"sticky", top:53, zIndex:40 }}>
        <select value={cat} onChange={e => setCat(e.target.value)}
          style={{ border:`1px solid ${LINE}`, borderRadius:7, padding:"7px 6px", fontSize:14, color:INK, background:"white", cursor:"pointer", fontFamily:MONO }}>
          {catOptions.map(c => <option key={c}>{c}</option>)}
        </select>
        <div style={{ flex:1, position:"relative" }}>
          <span style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", color:INK_DIM, display:"flex" }}>
            <Icon.Search size={14} />
          </span>
          <input placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width:"100%", border:`1px solid ${LINE}`, borderRadius:6, padding:"8px 10px 8px 32px", fontSize:16, outline:"none", boxSizing:"border-box", background:"white", color:INK }} />
        </div>
      </div>

      {/* Manage list toggle — waste mode only */}
      {!isDon && (
        <div style={{ background:PAPER, padding:"8px 14px 0", display:"flex", justifyContent:"flex-end" }}>
          <button onClick={() => setManage(m => !m)}
            style={{ background:manage?ACCENT_DEEP:"white", color:manage?PAPER:ACCENT_DEEP, border:`1px solid ${manage?ACCENT_DEEP:LINE}`, borderRadius:7, padding:"6px 12px", fontSize:11, fontWeight:800, cursor:"pointer", fontFamily:MONO, letterSpacing:.3 }}>
            {manage ? "✓ Done" : "Manage list"}
          </button>
        </div>
      )}
      {manage && !isDon && (
        <div style={{ background:PAPER, padding:"6px 14px 0", fontSize:11, color:INK_DIM, fontFamily:MONO }}>
          Tap REMOVE on any item to take it off the list. Removed items can be restored below.
        </div>
      )}

      {/* Add LTO item — waste mode only */}
      {!isDon && (
      <div style={{ background:PAPER, padding:"8px 14px 0" }}>
        {!ltoOpen ? (
          <button onClick={() => setLtoOpen(true)}
            style={{ width:"100%", background:"white", border:`1px dashed ${CATCOLOR.LTO}`, color:CATCOLOR.LTO, borderRadius:7, padding:"8px 12px", fontSize:12, fontWeight:800, cursor:"pointer", fontFamily:MONO, letterSpacing:.3 }}>
            + Add LTO / limited-time item
          </button>
        ) : (
          <div style={{ background:"white", border:`1px dashed ${CATCOLOR.LTO}`, borderRadius:7, padding:"10px 12px", display:"flex", flexDirection:"column", gap:8 }}>
            <div style={{ fontSize:10, fontWeight:800, color:CATCOLOR.LTO, textTransform:"uppercase", letterSpacing:.4, fontFamily:MONO }}>New LTO item</div>
            <div style={{ display:"flex", gap:8 }}>
              <input placeholder="Item name" value={ltoName} onChange={e => setLtoName(e.target.value)}
                style={{ flex:2, border:`1px solid ${LINE}`, borderRadius:6, padding:"8px 10px", fontSize:16, outline:"none", boxSizing:"border-box", background:"white", color:INK }} />
              <input placeholder="$ cost" type="number" min={0} step="0.01" value={ltoPrice} onChange={e => setLtoPrice(e.target.value)}
                style={{ flex:1, border:`1px solid ${LINE}`, borderRadius:6, padding:"8px 10px", fontSize:16, outline:"none", boxSizing:"border-box", background:"white", color:INK, fontFamily:MONO, minWidth:0 }} />
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button onClick={() => { setLtoOpen(false); setLtoName(""); setLtoPrice(""); }}
                style={{ background:"white", color:INK_DIM, border:`1px solid ${LINE}`, borderRadius:6, padding:"7px 14px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:MONO }}>
                Cancel
              </button>
              <button onClick={submitLto}
                style={{ background:CATCOLOR.LTO, color:"white", border:"none", borderRadius:6, padding:"7px 16px", fontSize:12, fontWeight:800, cursor:"pointer", fontFamily:MONO, letterSpacing:.3 }}>
                Add
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Items — waste steppers, or bulk donation entry */}
      {!isDon ? (
      <>
      <div style={{ padding:"10px 12px 28px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        {filtered.length === 0 && (
          <div style={{ gridColumn:"1/-1", textAlign:"center", padding:"50px 20px", color:INK_DIM }}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:8 }}><Icon.Search size={32} color={LINE} /></div>
            <div style={{ fontSize:14 }}>No items match "{search}"</div>
          </div>
        )}
        {filtered.map(item => {
          const qty      = getQty(item.id);
          const isPinned = pinsForPeriod.includes(item.id);
          const isLto    = item.cat === "LTO";
          // GAL/QT entry: the item's qty is stored as total quarts (gal folds
          // in ×4) so periodTotal/dayTotal/CSV/Slack keep working untouched —
          // this just changes how that one number gets typed in.
          const isVol    = !!item.volWaste;
          const volNum   = (raw) => Math.max(0, parseFloat(raw) || 0);
          const gal      = Math.floor(qty / 4);
          const qtRem    = qty % 4;
          const setGal   = (raw) => setDQ(item.id, volNum(raw) * 4 + qtRem);
          const setQt    = (raw) => setDQ(item.id, gal * 4 + volNum(raw));
          /* The category colour now runs along the TOP as well as the side —
             same corner treatment as the tool tiles. The shadow is the shared
             stack; the old single soft blur read as a smudge under a box.
             ⚠️ ABOVE the return, not inside it. A comment straight after
             `return (` is neither JSX children nor a plain expression slot, and
             both comment forms are a parse error there. Above the return is
             unambiguous. */
          return (
            <div key={item.id} style={{ background:cardSurface(), borderRadius:8, boxShadow: CARD_3D, border:`1px solid ${isPinned?ACCENT:LINE}`, ...accentEdge(CATCOLOR[item.cat]||LINE, 3), position:"relative", minWidth:0, overflow:"hidden" }}>
              {/* Pin row (+ remove for LTO) */}
              <div style={{ padding:"5px 8px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                {(manage || isLto)
                  ? <button onClick={() => removeItem(item)}
                      style={{ background:"none", border:"none", color:WARN, fontSize:9, fontWeight:800, letterSpacing:.3, cursor:"pointer", fontFamily:MONO, padding:0 }}>
                      REMOVE
                    </button>
                  : <span />}
                <div style={{ display:"flex", alignItems:"center", gap:4, cursor:"pointer" }} onClick={() => togglePinIn(isDon ? "don" : "waste", item.id)}>
                  <div style={{ width:28, height:15, background:isPinned?ACCENT:LINE, borderRadius:8, position:"relative", transition:"background 0.2s", flexShrink:0 }}>
                    <div style={{ width:11, height:11, background:"white", borderRadius:"50%", position:"absolute", top:2, left:isPinned?15:2, transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.25)" }} />
                  </div>
                  <span style={{ fontSize:9, color:INK_DIM, fontWeight:700, letterSpacing:.3, fontFamily:MONO }}>PIN</span>
                </div>
              </div>

              {/* Category tag.
                  ★ CENTRED (Matt, Aug 4 2026: "center the items on waste"). The
                  tag, the name and the price were pinned left while the stepper
                  underneath spans the whole card, so every card had a column of
                  dead space down its right and the eye had nothing to line up
                  on. Centred, the four rows share one axis. */}
              <div style={{ padding:"0 10px", textAlign:"center" }}>
                <span style={{ display:"inline-block", fontSize:9, fontWeight:700, letterSpacing:.4, textTransform:"uppercase", color:CATCOLOR[item.cat], background:`${CATCOLOR[item.cat]}1A`, padding:"3px 8px", borderRadius:4, fontFamily:MONO }}>
                  {item.cat}
                </span>
              </div>


              {/* Info + controls */}
              <div style={{ padding:"9px 10px 10px", textAlign:"center" }}>
                <div style={{ fontWeight:650, fontSize:12.5, color:INK, lineHeight:1.35, minHeight:30, marginBottom:2 }}>{item.name}</div>
                {editId === item.id ? (
                  <div style={{ display:"flex", alignItems:"center", gap:3, marginBottom:7 }}>
                    <span style={{ fontSize:11, color:INK_DIM, fontFamily:MONO }}>$</span>
                    <input autoFocus type="number" min={0} step="0.01" value={editVal}
                      onChange={e => setEditVal(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={e => { if (e.key === "Enter") commitEdit(); }}
                      style={{ width:76, border:`1.5px solid ${ACCENT}`, borderRadius:6, padding:"3px 8px", fontSize:16, fontFamily:MONO, color:INK, outline:"none", background:"white" }} />
                  </div>
                ) : (
                  <div onClick={() => startEdit(item)} title="Tap to edit cost"
                    style={{ fontSize:11, color:INK_DIM, marginBottom:7, fontFamily:MONO, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:4, borderBottom:`1px dotted ${LINE}` }}>
                    {f$(priceOf(item))}
                    <span style={{ fontSize:8, color:INK_DIM, opacity:0.7 }}>edit</span>
                  </div>
                )}
                {isVol ? (
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <div style={{ flex:1 }}>
                      <input type="number" min={0} placeholder="0" value={gal || ""} onChange={e => setGal(e.target.value)}
                        style={{ width:"100%", textAlign:"center", border:`1.5px solid ${gal>0?ACCENT:LINE}`, borderRadius:8, padding:"6px 0", fontSize:16, fontWeight:700, outline:"none", color:gal>0?INK:"#999", boxSizing:"border-box", fontFamily:MONO, background:"white" }} />
                      <div style={{ fontSize:9, color:INK_DIM, textAlign:"center", marginTop:2, fontFamily:MONO }}>GAL</div>
                    </div>
                    <div style={{ flex:1 }}>
                      <input type="number" min={0} max={3} placeholder="0" value={qtRem || ""} onChange={e => setQt(e.target.value)}
                        style={{ width:"100%", textAlign:"center", border:`1.5px solid ${qtRem>0?ACCENT:LINE}`, borderRadius:8, padding:"6px 0", fontSize:16, fontWeight:700, outline:"none", color:qtRem>0?INK:"#999", boxSizing:"border-box", fontFamily:MONO, background:"white" }} />
                      <div style={{ fontSize:9, color:INK_DIM, textAlign:"center", marginTop:2, fontFamily:MONO }}>QT</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <button onClick={() => bump(item.id, -1)}
                      style={{ width:34, height:34, borderRadius:9, background:qty>0?WARN:"#eee", color:qty>0?"white":"#ccc", border:"none", fontSize:19, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, lineHeight:1 }}>
                      −
                    </button>
                    <input type="number" min={0} value={qty} onChange={e => setDQ(item.id, e.target.value)}
                      style={{ flex:1, textAlign:"center", border:`1.5px solid ${qty>0?ACCENT:LINE}`, borderRadius:8, padding:"5px 0", fontSize:16, fontWeight:700, outline:"none", color:qty>0?INK:"#999", minWidth:0, transition:"border-color 0.15s", fontFamily:MONO, background:"white" }} />
                    <button onClick={() => bump(item.id, 1)}
                      style={{ width:34, height:34, borderRadius:9, background:GOOD, color:"white", border:"none", fontSize:19, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, lineHeight:1 }}>
                      +
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {manage && removedItems.length > 0 && (
        <div style={{ padding:"0 12px 28px" }}>
          <div style={{ background:"white", border:`1px solid ${LINE}`, borderRadius:9, padding:"12px 14px" }}>
            <div style={{ fontSize:12, fontWeight:800, color:INK, marginBottom:8, fontFamily:MONO, letterSpacing:.3 }}>REMOVED ITEMS ({removedItems.length})</div>
            {removedItems.map(item => (
              <div key={item.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 2px", borderBottom:`1px solid ${LINE}` }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:12, color:INK_DIM, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.name}</div>
                  <div style={{ fontSize:9, color:INK_DIM, fontFamily:MONO, opacity:.7 }}>{item.cat}</div>
                </div>
                <button onClick={() => restoreItem(item.id)}
                  style={{ background:"white", border:`1px solid ${GOOD}`, color:GOOD, borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:800, cursor:"pointer", fontFamily:MONO, flexShrink:0, marginLeft:8 }}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      </>
      ) : (
      <div style={{ padding:"10px 12px 28px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        {filtered.length === 0 && (
          <div style={{ gridColumn:"1/-1", textAlign:"center", padding:"50px 20px", color:INK_DIM }}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:8 }}><Icon.Search size={32} color={LINE} /></div>
            <div style={{ fontSize:14 }}>No items match "{search}"</div>
          </div>
        )}
        {filtered.map(item => (
          <DonationCard key={item.id} item={item} value={donGet(item.id)} onChange={(v) => donSet(item.id, v)}
            isPinned={pinsForPeriod.includes(item.id)} togglePin={() => togglePinIn("don", item.id)} />
        ))}
      </div>
      )}
    </div>
  );
}

// ── Donation Card (bulk: weight or each) ──────────────────────────
function DonationCard({ item, value, onChange, isPinned, togglePin }) {
  // Default unit: bulk items (filets/nuggets/strips, plus Mac & Cheese and
  // Noodle Soup) weigh in; volume items in gal/qt; everything else (salads,
  // wraps, parfaits, sandwiches) counts as EACH so an individual item goes in
  // as a count, not forced into lbs. defaultUnit() is SHARED with donSet() so
  // the fallback here and the "is it empty?" test there can never disagree —
  // when they did, tapping a non-default unit on an empty card deleted the
  // record and the toggle snapped back.
  const v = value || { u: defaultUnit(item), lb:0, oz:0, gal:0, qt:0, ea:0 };
  const setU = (u) => onChange({ ...v, u });
  const num = (raw) => Math.max(0, parseFloat(raw) || 0);
  const has = v.u === "wt"  ? (Number(v.lb) || Number(v.oz))
            : v.u === "vol" ? (Number(v.gal) || Number(v.qt))
            : Number(v.ea);
  const unitOpts = item.vol ? [["vol","GAL/QT"],["ea","EACH"]] : [["wt","LB/OZ"],["ea","EACH"]];
  const fieldStyle = (active) => ({ width:"100%", textAlign:"center", border:`1.5px solid ${active?CATCOLOR.LTO:LINE}`, borderRadius:8, padding:"6px 0", fontSize:16, fontWeight:700, outline:"none", color:active?INK:"#999", boxSizing:"border-box", fontFamily:MONO, background:"white" });
  return (
    <div style={{ background:cardSurface(), borderRadius:8, boxShadow:CARD_3D, border:`1px solid ${has?PCOLOR.Donations:(isPinned?ACCENT:LINE)}`, ...accentEdge(CATCOLOR[item.cat]||LINE, 3), position:"relative", minWidth:0, overflow:"hidden" }}>
      {/* Pin row */}
      <div style={{ padding:"5px 8px", display:"flex", justifyContent:"flex-end", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:4, cursor:"pointer" }} onClick={togglePin}>
          <div style={{ width:28, height:15, background:isPinned?ACCENT:LINE, borderRadius:8, position:"relative", transition:"background 0.2s", flexShrink:0 }}>
            <div style={{ width:11, height:11, background:"white", borderRadius:"50%", position:"absolute", top:2, left:isPinned?15:2, transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.25)" }} />
          </div>
          <span style={{ fontSize:9, color:INK_DIM, fontWeight:700, letterSpacing:.3, fontFamily:MONO }}>PIN</span>
        </div>
      </div>

      {/* Category tag */}
      <div style={{ padding:"0 10px" }}>
        <span style={{ display:"inline-block", fontSize:9, fontWeight:700, letterSpacing:.4, textTransform:"uppercase", color:CATCOLOR[item.cat], background:`${CATCOLOR[item.cat]}1A`, padding:"3px 8px", borderRadius:4, fontFamily:MONO }}>
          {item.cat}
        </span>
      </div>


      {/* Name + unit toggle + bulk inputs */}
      <div style={{ padding:"9px 10px 10px" }}>
        <div style={{ fontWeight:650, fontSize:12.5, color:INK, lineHeight:1.35, minHeight:30, marginBottom:6 }}>{item.name}</div>
        <div style={{ display:"flex", gap:2, background:ACCENT_WASH, borderRadius:6, padding:2, marginBottom:7, border:`1px solid ${LINE}` }}>
          {unitOpts.map(([u,lbl]) => (
            <button key={u} onClick={() => setU(u)}
              style={{ flex:1, background:v.u===u?PCOLOR.Donations:"transparent", color:v.u===u?"white":INK_DIM, border:"none", borderRadius:4, padding:"4px 0", fontSize:10, fontWeight:800, letterSpacing:.3, fontFamily:MONO, cursor:"pointer" }}>
              {lbl}
            </button>
          ))}
        </div>
        {v.u === "wt" ? (
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            <div style={{ flex:1 }}>
              <input type="number" min={0} placeholder="0" value={v.lb || ""} onChange={e => onChange({ ...v, lb:num(e.target.value) })} style={fieldStyle(Number(v.lb) > 0)} />
              <div style={{ fontSize:9, color:INK_DIM, textAlign:"center", marginTop:2, fontFamily:MONO }}>LB</div>
            </div>
            <div style={{ flex:1 }}>
              <input type="number" min={0} max={15} placeholder="0" value={v.oz || ""} onChange={e => onChange({ ...v, oz:num(e.target.value) })} style={fieldStyle(Number(v.oz) > 0)} />
              <div style={{ fontSize:9, color:INK_DIM, textAlign:"center", marginTop:2, fontFamily:MONO }}>OZ</div>
            </div>
          </div>
        ) : v.u === "vol" ? (
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            <div style={{ flex:1 }}>
              <input type="number" min={0} placeholder="0" value={v.gal || ""} onChange={e => onChange({ ...v, gal:num(e.target.value) })} style={fieldStyle(Number(v.gal) > 0)} />
              <div style={{ fontSize:9, color:INK_DIM, textAlign:"center", marginTop:2, fontFamily:MONO }}>GAL</div>
            </div>
            <div style={{ flex:1 }}>
              <input type="number" min={0} max={3} placeholder="0" value={v.qt || ""} onChange={e => onChange({ ...v, qt:num(e.target.value) })} style={fieldStyle(Number(v.qt) > 0)} />
              <div style={{ fontSize:9, color:INK_DIM, textAlign:"center", marginTop:2, fontFamily:MONO }}>QT</div>
            </div>
          </div>
        ) : (
          <div>
            <input type="number" min={0} placeholder="0" value={v.ea || ""} onChange={e => onChange({ ...v, ea:num(e.target.value) })} style={fieldStyle(Number(v.ea) > 0)} />
            <div style={{ fontSize:9, color:INK_DIM, textAlign:"center", marginTop:2, fontFamily:MONO }}>EACH</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inventory View (on-hand counts by AM/PM session) ─────────────
function InventoryView({ date, setDate, invSession, setInvSession, invMenu, invGet, invBump, invSetQ, invTotal, addInvItem, removeInvItem, save }) {
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const total = invTotal();
  const submitAdd = () => { addInvItem(addName); setAddName(""); setAddOpen(false); };

  return (
    <div>
      {/* Session + date bar — receipt stub */}
      <div style={{ background:"#fff", padding:"12px 14px 14px", boxShadow:"0 1px 4px rgba(36,27,27,0.06)" }}>
        <div style={{ display:"flex", gap:8, marginBottom:10, alignItems:"center" }}>
          <div style={{ display:"flex", gap:2, background:"white", border:`1px dashed ${LINE}`, borderRadius:7, padding:2, flex:1 }}>
            {INV_SESSIONS.map(s => (
              <button key={s} onClick={() => setInvSession(s)}
                style={{ flex:1, background:invSession===s?ACCENT_DEEP:"transparent", color:invSession===s?PAPER:INK_DIM, border:"none", borderRadius:5, padding:"7px 0", fontSize:12, fontWeight:800, letterSpacing:.4, fontFamily:MONO, cursor:"pointer" }}>
                {s}
              </button>
            ))}
          </div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ background:"white", border:`1px dashed ${LINE}`, borderRadius:7, padding:"8px 10px", fontSize:16, color:INK, cursor:"pointer", fontWeight:600, fontFamily:MONO }} />
        </div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <Chip label={String(total)} sub="On hand" />
          <button onClick={save}
            style={{ background:ACCENT_DEEP, color:PAPER, border:"none", borderRadius:8, padding:"12px 22px", fontSize:14, fontWeight:800, cursor:"pointer", display:"flex", alignItems:"center", gap:7, fontFamily:MONO, letterSpacing:1, boxShadow:"0 2px 0 rgba(0,0,0,0.25)" }}>
            <Icon.Save size={14} /> SAVE
          </button>
        </div>
      </div>
      <div className="gc-zz" style={{ marginBottom:2 }} />

      {/* Add inventory item */}
      <div style={{ background:PAPER, padding:"8px 14px 0" }}>
        {!addOpen ? (
          <button onClick={() => setAddOpen(true)}
            style={{ width:"100%", background:"white", border:`1px dashed ${ACCENT}`, color:ACCENT, borderRadius:7, padding:"8px 12px", fontSize:12, fontWeight:800, cursor:"pointer", fontFamily:MONO, letterSpacing:.3 }}>
            + Add inventory item
          </button>
        ) : (
          <div style={{ background:"white", border:`1px dashed ${ACCENT}`, borderRadius:7, padding:"10px 12px", display:"flex", flexDirection:"column", gap:8 }}>
            <input placeholder="Item name" value={addName} onChange={e => setAddName(e.target.value)}
              style={{ border:`1px solid ${LINE}`, borderRadius:6, padding:"8px 10px", fontSize:16, outline:"none", boxSizing:"border-box", background:"white", color:INK }} />
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button onClick={() => { setAddOpen(false); setAddName(""); }}
                style={{ background:"white", color:INK_DIM, border:`1px solid ${LINE}`, borderRadius:6, padding:"7px 14px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:MONO }}>
                Cancel
              </button>
              <button onClick={submitAdd}
                style={{ background:ACCENT, color:"white", border:"none", borderRadius:6, padding:"7px 16px", fontSize:12, fontWeight:800, cursor:"pointer", fontFamily:MONO, letterSpacing:.3 }}>
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Count grid */}
      <div style={{ padding:"10px 12px 28px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        {invMenu.map(item => (
          <InventoryCard key={item.id} item={item} qty={invGet(item.id)}
            onBump={(d) => invBump(item.id, d)} onSet={(raw) => invSetQ(item.id, Math.max(0, parseInt(raw) || 0))}
            isCustom={item.id.startsWith("invx_")} onRemove={() => removeInvItem(item.id)} />
        ))}
      </div>
    </div>
  );
}

function InventoryCard({ item, qty, onBump, onSet, isCustom, onRemove }) {
  return (
    <div style={{ background:"white", borderRadius:8, boxShadow:"0 1px 3px rgba(36,27,27,0.07)", border:`1px solid ${qty>0?ACCENT:LINE}`, borderLeft: `3px solid ${qty>0?ACCENT:LINE}`, borderTop: `3px solid ${qty>0?ACCENT:LINE}`, position:"relative", minWidth:0, overflow:"hidden" }}>
      <div style={{ padding:"5px 8px", display:"flex", justifyContent:"space-between", alignItems:"center", minHeight:23 }}>
        <span style={{ fontSize:9, color:INK_DIM, fontWeight:700, letterSpacing:.3, fontFamily:MONO }}>ON HAND</span>
        {isCustom && (
          <button onClick={onRemove}
            style={{ background:"none", border:"none", color:WARN, fontSize:9, fontWeight:800, letterSpacing:.3, cursor:"pointer", fontFamily:MONO, padding:0 }}>
            REMOVE
          </button>
        )}
      </div>
      <div style={{ padding:"9px 10px 10px" }}>
        <div style={{ fontWeight:650, fontSize:12.5, color:INK, lineHeight:1.35, minHeight:30, marginBottom:6 }}>{item.name}</div>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <button onClick={() => onBump(-1)}
            style={{ width:34, height:34, borderRadius:9, background:qty>0?WARN:"#eee", color:qty>0?"white":"#ccc", border:"none", fontSize:19, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, lineHeight:1 }}>
            −
          </button>
          <input type="number" min={0} value={qty} onChange={e => onSet(e.target.value)}
            style={{ flex:1, textAlign:"center", border:`1.5px solid ${qty>0?ACCENT:LINE}`, borderRadius:8, padding:"5px 0", fontSize:16, fontWeight:700, outline:"none", color:qty>0?INK:"#999", minWidth:0, transition:"border-color 0.15s", fontFamily:MONO, background:"white" }} />
          <button onClick={() => onBump(1)}
            style={{ width:34, height:34, borderRadius:9, background:GOOD, color:"white", border:"none", fontSize:19, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, lineHeight:1 }}>
            +
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard View ────────────────────────────────────────────────
function DashboardView({ dashDate, setDashDate, data, don, menu, periodTotal, periodCount, dayTotal, priceOf, clearDay, clearRange }) {
  const [mode,   setMode]   = useState("day");
  const [rStart, setRStart] = useState(shiftDay(dashDate, -6));
  const [rEnd,   setREnd]   = useState(dashDate);

  const total      = dayTotal(dashDate);
  const totalItems = WASTE_PERIODS.reduce((s, p) => s + periodCount(p, dashDate), 0);

  const areas = WASTE_PERIODS.map(p => ({
    p, color:PCOLOR[p],
    total: periodTotal(p, dashDate),
    items: periodCount(p, dashDate),
  }));

  const pieData = areas.filter(a => a.total > 0).map(a => ({
    name: a.p, value: +a.total.toFixed(2), color: a.color,
  }));

  const getBreakdown = (p) =>
    Object.entries(data?.[dashDate]?.[p] ?? {}).map(([id, qty]) => {
      const m = menu.find(x => x.id === id);
      return m
        ? { name:m.name, value:+(priceOf(m)*qty).toFixed(2), qty, offList:false }
        : { name:id, value:0, qty, offList:true };
    }).sort((a, b) => (b.value - a.value) || (b.qty - a.qty));

  // ── Donations: rows for a set of dates ──
  const donRowsFor = (dates) => {
    const acc = {}; // id -> { oz, ea, qt }
    dates.forEach(dk => {
      const day = don?.[dk] ?? {};
      Object.entries(day).forEach(([id, v]) => {
        if (!acc[id]) acc[id] = { oz:0, ea:0, qt:0 };
        if (v.u === "wt") acc[id].oz += Number(v.lb||0)*16 + Number(v.oz||0);
        else if (v.u === "vol") acc[id].qt += Number(v.gal||0)*4 + Number(v.qt||0);
        else acc[id].ea += Number(v.ea||0);
      });
    });
    return Object.entries(acc).map(([id, t]) => {
      const m = menu.find(x => x.id === id);
      return { name: m ? m.name : id, oz:t.oz, ea:t.ea, qt:t.qt };
    }).filter(r => r.oz > 0 || r.ea > 0 || r.qt > 0)
      .sort((a, b) => (b.oz + b.qt*32 + b.ea*16) - (a.oz + a.qt*32 + a.ea*16));
  };
  const donCell = (r) => [r.oz > 0 ? fmtWt(r.oz) : "", r.qt > 0 ? fmtVol(r.qt) : "", r.ea > 0 ? `${r.ea} ea` : ""].filter(Boolean).join(" · ");
  const donDayRows = donRowsFor([dashDate]);
  const donDayOz   = donDayRows.reduce((s, r) => s + r.oz, 0);
  const donDayEa   = donDayRows.reduce((s, r) => s + r.ea, 0);
  const donDayQt   = donDayRows.reduce((s, r) => s + r.qt, 0);

  // 7-day trend
  const trend = Array.from({ length:7 }, (_, i) => {
    const d = new Date(dashDate + "T12:00:00");
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    return {
      label: d.toLocaleDateString("en-US", { month:"numeric", day:"numeric" }),
      total: +dayTotal(key).toFixed(2),
    };
  });

  // Range aggregate — every item summed across the selected date range
  const rangeRows = (() => {
    const acc = {};
    Object.entries(data || {}).forEach(([dkey, periods]) => {
      if (dkey < rStart || dkey > rEnd) return;
      WASTE_PERIODS.forEach(p => {
        Object.entries(periods?.[p] || {}).forEach(([id, q]) => { acc[id] = (acc[id] || 0) + q; });
      });
    });
    return Object.entries(acc).map(([id, qty]) => {
      const m = menu.find(x => x.id === id);
      return { name: m ? m.name : id, qty, value: m ? +(priceOf(m) * qty).toFixed(2) : 0 };
    }).sort((a, b) => b.value - a.value);
  })();
  const rangeTotal = rangeRows.reduce((s, r) => s + r.value, 0);
  const rangeItems = rangeRows.reduce((s, r) => s + r.qty, 0);

  const rangeDonDates = Object.keys(don || {}).filter(dk => dk >= rStart && dk <= rEnd);
  const donRangeRows  = donRowsFor(rangeDonDates);
  const donRangeOz    = donRangeRows.reduce((s, r) => s + r.oz, 0);
  const donRangeEa    = donRangeRows.reduce((s, r) => s + r.ea, 0);
  const donRangeQt    = donRangeRows.reduce((s, r) => s + r.qt, 0);

  const setLast7 = () => { setRStart(shiftDay(dashDate, -6)); setREnd(dashDate); };

  return (
    <div style={{ padding:"12px 12px 36px" }}>
      {/* Day / Range toggle */}
      <div style={{ display:"flex", gap:2, background:ACCENT_WASH, borderRadius:8, padding:3, marginBottom:10, border:`1px solid ${LINE}` }}>
        {[["day","Single Day"],["range","Date Range"]].map(([v,lbl]) => (
          <button key={v} onClick={() => setMode(v)}
            style={{ flex:1, background:mode===v?ACCENT_DEEP:"transparent", color:mode===v?PAPER:INK_DIM, border:"none", borderRadius:6, padding:"7px 0", fontSize:11, fontWeight:800, letterSpacing:.4, textTransform:"uppercase", fontFamily:MONO, cursor:"pointer" }}>
            {lbl}
          </button>
        ))}
      </div>

      {mode === "day" ? (
        <>
          {/* Date selector */}
          <div style={{ background:"white", borderRadius:9, padding:"12px 14px", marginBottom:10, display:"flex", alignItems:"center", justifyContent:"space-between", border:`1px solid ${LINE}` }}>
            <div>
              <div style={{ fontSize:10, color:INK_DIM, fontWeight:700, textTransform:"uppercase", letterSpacing:.5, fontFamily:MONO }}>Date</div>
              <div style={{ fontWeight:700, fontSize:15, color:INK }}>{fmtDate(dashDate)}</div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
              <input type="date" value={dashDate} onChange={e => setDashDate(e.target.value)}
                style={{ border:`1px dashed ${LINE}`, borderRadius:6, padding:"6px 10px", fontSize:16, color:INK, cursor:"pointer", fontFamily:MONO }} />
              {(totalItems > 0 || donDayRows.length > 0) && (
                <button onClick={() => { if (window.confirm(`Clear all entries for ${fmtDate(dashDate)}? This can't be undone.`)) clearDay(dashDate); }}
                  style={{ background:"none", border:"none", color:WARN, fontSize:10, fontWeight:800, letterSpacing:.3, cursor:"pointer", fontFamily:MONO, padding:0 }}>
                  Clear this day
                </button>
              )}
            </div>
          </div>

          {/* Day total banner — register total */}
          <div style={{ marginBottom:12 }}>
            <div style={{ background:ACCENT_DEEP, borderRadius:"9px 9px 0 0", padding:"14px 16px 12px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ color:"rgba(255,255,255,0.75)", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:1.2, fontFamily:MONO }}>Total Waste</div>
                <div style={{ color:PAPER, fontWeight:800, fontSize:30, marginTop:3, fontFamily:MONO, letterSpacing:-0.5 }}>{f$(total)}</div>
              </div>
              <div style={{ textAlign:"right", borderLeft:"1.5px dashed rgba(255,255,255,0.3)", paddingLeft:14 }}>
                <div style={{ color:"rgba(255,255,255,0.7)", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:1, fontFamily:MONO }}>All Periods</div>
                <div style={{ color:PAPER, fontWeight:800, fontSize:18, marginTop:3, fontFamily:MONO }}>{totalItems} items</div>
              </div>
            </div>
            <div className="gc-zz-deep" />
          </div>

          {/* Area cards */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
            {areas.map(a => (
              <div key={a.p} style={{ background:"white", borderRadius:8, padding:"11px 13px", border:`1px solid ${LINE}`, borderLeft: `3px solid ${a.color}`, borderTop: `3px solid ${a.color}` }}>
                <div style={{ fontSize:10, color:INK_DIM, fontWeight:700, marginBottom:2, fontFamily:MONO }}>{a.p}</div>
                <div style={{ fontSize:19, fontWeight:800, color:a.total>0?GOOD:"#ccc", fontFamily:MONO }}>{f$(a.total)}</div>
                <div style={{ fontSize:10, color:INK_DIM, marginTop:1 }}>{a.items} item{a.items!==1?"s":""} · Waste</div>
              </div>
            ))}
          </div>

          {/* 7-day trend */}
          <DashCard title={<span style={{ display:"flex", alignItems:"center", gap:6 }}><Icon.TrendUp size={13} color={INK_DIM} /> 7-Day Waste Trend</span>}>
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={trend} margin={{ top:5, right:5, left:-25, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={LINE} />
                <XAxis dataKey="label" tick={{ fontSize:10, fill:INK_DIM, fontFamily:MONO }} />
                <YAxis tick={{ fontSize:10, fill:INK_DIM, fontFamily:MONO }} tickFormatter={v => `$${v}`} />
                <Tooltip formatter={v => [`$${Number(v).toFixed(2)}`, "Waste"]} />
                <Line type="monotone" dataKey="total" stroke={ACCENT} strokeWidth={2.5} dot={{ fill:ACCENT, r:3, strokeWidth:0 }} activeDot={{ r:5 }} />
              </LineChart>
            </ResponsiveContainer>
          </DashCard>

          {/* Waste by Area pie */}
          {pieData.length > 0 && (
            <DashCard title="Waste Totals by Area">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={72} labelLine={false}
                    label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(1)}%` : ""}>
                    {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={v => [f$(v), "Waste"]} />
                  <Legend iconType="circle" iconSize={9} formatter={v => <span style={{ fontSize:11 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </DashCard>
          )}

          {/* Per-period product breakdowns */}
          {WASTE_PERIODS.map(p => {
            const bd = getBreakdown(p);
            if (!bd.length) return null;
            const bdTotal = bd.reduce((s, b) => s + b.value, 0);
            const bdCount = bd.reduce((s, b) => s + b.qty, 0);
            const pieBd = bd.filter(b => b.value > 0);
            return (
              <div key={p} style={{ background:"white", borderRadius:9, padding:"14px", marginBottom:12, border:`1px solid ${LINE}` }}>
                <div style={{ fontSize:12, fontWeight:700, color:INK, marginBottom:8, background:ACCENT_WASH, padding:"6px 10px", borderRadius:6, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span>{p} — by Product</span>
                  <span style={{ color:PCOLOR[p], fontWeight:800, fontFamily:MONO }}>{f$(bdTotal)} · {bdCount} ea</span>
                </div>
                {pieBd.length >= 2 && (
                  <ResponsiveContainer width="100%" height={148}>
                    <PieChart>
                      <Pie data={pieBd} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={58} labelLine={false}
                        label={({ percent }) => percent > 0.08 ? `${(percent * 100).toFixed(0)}%` : ""}>
                        {pieBd.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v, n, props) => [`${f$(v)} (×${props.payload.qty})`, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                {bd.map((b, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"5px 2px", borderBottom:i<bd.length-1?`1px solid ${LINE}`:"none" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, flex:1, minWidth:0 }}>
                      <div style={{ width:9, height:9, borderRadius:"50%", background:b.offList?LINE:PIE[i%PIE.length], flexShrink:0 }} />
                      <span style={{ fontSize:12, color:b.offList?INK_DIM:INK, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.name}</span>
                      {b.offList && <span style={{ fontSize:9, fontWeight:700, color:INK_DIM, background:"#0000000D", padding:"1px 5px", borderRadius:4, fontFamily:MONO, flexShrink:0 }}>off-list</span>}
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0, marginLeft:8 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:INK, fontFamily:MONO }}>{f$(b.value)}</div>
                      <div style={{ fontSize:10, color:INK_DIM, fontFamily:MONO }}>×{b.qty}</div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}

          {/* Donations (bulk) — by weight / each */}
          {donDayRows.length > 0 && (
            <div style={{ background:"white", borderRadius:9, padding:"14px", marginBottom:12, border:`1px solid ${LINE}`, borderLeft: `3px solid ${PCOLOR.Donations}`, borderTop: `3px solid ${PCOLOR.Donations}` }}>
              <div style={{ fontSize:12, fontWeight:700, color:INK, marginBottom:8, background:ACCENT_WASH, padding:"6px 10px", borderRadius:6, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span>Donations — Bulk</span>
                <span style={{ color:PCOLOR.Donations, fontWeight:800, fontFamily:MONO }}>
                  {[donDayOz > 0 ? fmtWt(donDayOz) : "", donDayQt > 0 ? fmtVol(donDayQt) : "", donDayEa > 0 ? `${donDayEa} ea` : ""].filter(Boolean).join(" · ")}
                </span>
              </div>
              {donDayRows.map((r, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"5px 2px", borderBottom:i<donDayRows.length-1?`1px solid ${LINE}`:"none" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, flex:1, minWidth:0 }}>
                    <div style={{ width:9, height:9, borderRadius:"50%", background:PCOLOR.Donations, flexShrink:0 }} />
                    <span style={{ fontSize:12, color:INK, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.name}</span>
                  </div>
                  <div style={{ fontSize:12, fontWeight:700, color:INK, fontFamily:MONO, flexShrink:0, marginLeft:8 }}>
                    {donCell(r)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalItems === 0 && donDayRows.length === 0 && (
            <div style={{ textAlign:"center", padding:"50px 20px", color:INK_DIM }}>
              <div style={{ display:"flex", justifyContent:"center", marginBottom:10 }}><Icon.BarChart size={40} color={LINE} /></div>
              <div style={{ fontSize:14, fontWeight:600, color:INK }}>Nothing recorded</div>
              <div style={{ fontSize:12, marginTop:4 }}>{fmtDate(dashDate)}</div>
              <div style={{ fontSize:12, marginTop:8, color:INK_DIM }}>Switch to Entry to log waste or donations for this date.</div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Range selector */}
          <div style={{ background:"white", borderRadius:9, padding:"12px 14px", marginBottom:10, border:`1px solid ${LINE}` }}>
            <div style={{ fontSize:10, color:INK_DIM, fontWeight:700, textTransform:"uppercase", letterSpacing:.5, fontFamily:MONO, marginBottom:8 }}>Date Range</div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <input type="date" value={rStart} max={rEnd} onChange={e => setRStart(e.target.value)}
                style={{ flex:1, border:`1px dashed ${LINE}`, borderRadius:6, padding:"7px 8px", fontSize:16, color:INK, cursor:"pointer", fontFamily:MONO, minWidth:0 }} />
              <span style={{ color:INK_DIM, fontSize:12, fontFamily:MONO }}>to</span>
              <input type="date" value={rEnd} min={rStart} onChange={e => setREnd(e.target.value)}
                style={{ flex:1, border:`1px dashed ${LINE}`, borderRadius:6, padding:"7px 8px", fontSize:16, color:INK, cursor:"pointer", fontFamily:MONO, minWidth:0 }} />
            </div>
            <button onClick={setLast7}
              style={{ marginTop:8, background:ACCENT_WASH, color:ACCENT_DEEP, border:`1px solid ${LINE}`, borderRadius:6, padding:"6px 12px", fontSize:11, fontWeight:800, cursor:"pointer", fontFamily:MONO, letterSpacing:.3 }}>
              Last 7 days
            </button>
            {(rangeItems > 0 || donRangeRows.length > 0) && (
              <button onClick={() => { if (window.confirm(`Clear ALL entries from ${fmtDate(rStart)} to ${fmtDate(rEnd)}? This can't be undone.`)) clearRange(rStart, rEnd); }}
                style={{ marginTop:8, marginLeft:8, background:"none", border:"none", color:WARN, fontSize:11, fontWeight:800, cursor:"pointer", fontFamily:MONO, letterSpacing:.3 }}>
                Clear entries in range
              </button>
            )}
          </div>

          {/* Range total banner — register total */}
          <div style={{ marginBottom:12 }}>
            <div style={{ background:ACCENT_DEEP, borderRadius:"9px 9px 0 0", padding:"14px 16px 12px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ color:"rgba(255,255,255,0.75)", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:1.2, fontFamily:MONO }}>Range Total</div>
                <div style={{ color:PAPER, fontWeight:800, fontSize:30, marginTop:3, fontFamily:MONO, letterSpacing:-0.5 }}>{f$(rangeTotal)}</div>
              </div>
              <div style={{ textAlign:"right", borderLeft:"1.5px dashed rgba(255,255,255,0.3)", paddingLeft:14 }}>
                <div style={{ color:"rgba(255,255,255,0.7)", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:1, fontFamily:MONO }}>All Periods</div>
                <div style={{ color:PAPER, fontWeight:800, fontSize:18, marginTop:3, fontFamily:MONO }}>{rangeItems} items</div>
              </div>
            </div>
            <div className="gc-zz-deep" />
          </div>

          {/* Itemized aggregate */}
          <div style={{ background:"white", borderRadius:9, padding:"14px", marginBottom:12, border:`1px solid ${LINE}` }}>
            <div style={{ fontSize:12, fontWeight:700, color:INK, marginBottom:8, background:ACCENT_WASH, padding:"6px 10px", borderRadius:6, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span>All Items — {fmtDate(rStart)} to {fmtDate(rEnd)}</span>
              <span style={{ color:ACCENT, fontWeight:800, fontFamily:MONO }}>{f$(rangeTotal)}</span>
            </div>
            {rangeRows.length === 0 ? (
              <div style={{ textAlign:"center", padding:"34px 20px", color:INK_DIM }}>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:8 }}><Icon.BarChart size={34} color={LINE} /></div>
                <div style={{ fontSize:13, fontWeight:600, color:INK }}>No entries in this range</div>
              </div>
            ) : rangeRows.map((r, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 2px", borderBottom:i<rangeRows.length-1?`1px solid ${LINE}`:"none" }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, flex:1, minWidth:0 }}>
                  <div style={{ width:9, height:9, borderRadius:"50%", background:PIE[i%PIE.length], flexShrink:0 }} />
                  <span style={{ fontSize:12, color:INK, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.name}</span>
                </div>
                <div style={{ textAlign:"right", flexShrink:0, marginLeft:8 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:INK, fontFamily:MONO }}>{f$(r.value)}</div>
                  <div style={{ fontSize:10, color:INK_DIM, fontFamily:MONO }}>×{r.qty}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Donations (bulk) over range */}
          {donRangeRows.length > 0 && (
            <div style={{ background:"white", borderRadius:9, padding:"14px", marginBottom:12, border:`1px solid ${LINE}`, borderLeft: `3px solid ${PCOLOR.Donations}`, borderTop: `3px solid ${PCOLOR.Donations}` }}>
              <div style={{ fontSize:12, fontWeight:700, color:INK, marginBottom:8, background:ACCENT_WASH, padding:"6px 10px", borderRadius:6, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span>Donations — Bulk</span>
                <span style={{ color:PCOLOR.Donations, fontWeight:800, fontFamily:MONO }}>
                  {[donRangeOz > 0 ? fmtWt(donRangeOz) : "", donRangeQt > 0 ? fmtVol(donRangeQt) : "", donRangeEa > 0 ? `${donRangeEa} ea` : ""].filter(Boolean).join(" · ")}
                </span>
              </div>
              {donRangeRows.map((r, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 2px", borderBottom:i<donRangeRows.length-1?`1px solid ${LINE}`:"none" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, flex:1, minWidth:0 }}>
                    <div style={{ width:9, height:9, borderRadius:"50%", background:PCOLOR.Donations, flexShrink:0 }} />
                    <span style={{ fontSize:12, color:INK, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.name}</span>
                  </div>
                  <div style={{ fontSize:12, fontWeight:700, color:INK, fontFamily:MONO, flexShrink:0, marginLeft:8 }}>
                    {donCell(r)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────
function Chip({ label, sub }) {
  return (
    <div style={{ background:ACCENT_WASH, border:`1px solid ${LINE}`, borderRadius:8, padding:"7px 14px", minWidth:64, textAlign:"center" }}>
      <div style={{ fontSize:20, fontWeight:800, color:INK, fontFamily:MONO, letterSpacing:-0.3 }}>{label}</div>
      <div style={{ fontSize:9, color:INK_DIM, marginTop:2, fontWeight:800, textTransform:"uppercase", letterSpacing:1, fontFamily:MONO }}>{sub}</div>
    </div>
  );
}

function DashCard({ title, children }) {
  return (
    <div style={{ background:"white", borderRadius:9, padding:"14px", marginBottom:12, border:`1px solid ${LINE}` }}>
      <div style={{ fontSize:12, fontWeight:700, color:INK, marginBottom:10, background:ACCENT_WASH, padding:"6px 10px", borderRadius:6 }}>{title}</div>
      {children}
    </div>
  );
}
