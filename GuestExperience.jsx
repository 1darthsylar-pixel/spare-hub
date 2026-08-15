import { useState, useEffect } from "react";
/* The shared raised look and accent edge — see cardStyle.js. */
import { CARD_3D, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { kvSet, kvGetResult, hubToken } from "./store.js";
import { eosPeriod } from "./eosPeriod.js";
import PasteMonth from "./PasteMonth.jsx";
import { parseCemPaste, parseShopPaste } from "./pasteImports.js";
import { STORE } from "./storeConfig.js"; // store name + number on the masthead

// ─── Guest Experience — Gate City FSU #04010 ────────────────────────────────
// Two measurement sources in one tile:
//   • CEM       — CFA Customer Experience Monitor (guest survey scores)
//   • SMART SHOP — CFA Smart Shop (mystery-shop index + WHED categories)
// Each keeps a MONTHLY HISTORY (add past months), shows a trend line, and a
// latest-period detail view. Editable — update when a new report drops.
//
// Persistence uses the Hub's store.js kv helpers (object stored directly, no
// JSON.stringify; localStorage fallback lives inside store.js). One key each.
const CEM_KEY  = "gcfcr-cem-v2";
const SHOP_KEY = "gcfcr-smartshop-v1";

const RED = "#DD0031";

// ── Guest Voice skin tokens ──
const PAPER="#FBF6EF", CARD="#FFFDF9", INK="#2A2320", SUB="#6E625A", STONE="#9B8E82",
      LINE="#EAE0D3", ALT="#FCF7F0",
      CLARET="#8C2F39", CLARET_DEEP="#6E222B", WINE="#5A1B24",
      ROSE="#F6E7E4", ROSE_LINE="#E7C9C6",
      AMBER="#A9741C", AMBER_BG="#F5EAD3", AMBER_LINE="#E4CE9E",
      GREEN="#3F7A5B",
      DISP="'Bricolage Grotesque', system-ui, sans-serif",
      BODY="'Plus Jakarta Sans', system-ui, sans-serif";
const nowYm = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const ymMonthLabel = (ym) => { const [y,m] = String(ym).split("-").map(Number); return new Date(y,(m||1)-1,1).toLocaleDateString("en-US",{month:"long",year:"numeric"}); };

/* ⚠️ THIS STORE'S SCORES ARE GONE FROM THE CLIENT (Aug 9 2026, sweep 12).
   CEM_SEED and SHOP_SEED were module-level consts here, so with no account you
   could read Likelihood to Return 63 against a market of 85, Fast Service 58
   against 72, and a June Smart Shop index of 85 against a chain 87 graded
   "Needs Improvement". Those come off analytics.cfahome.com, which is SSO-walled
   precisely so they are not public.
   ⚠️ THE TILE GATE COULD NEVER HAVE HELPED: tier 2 to open and tier 3 to edit
   both decide what RENDERS, and the bytes had already landed by then.
   ⇒ They live in guestSeed.js now, imported ONLY by worker.js and served on GET
   /api/guest-seed behind the same gate as the tile, allow-list included.
   ⚠️ DO NOT IMPORT guestSeed.js FROM ANY .jsx.

   ── WHAT STAYS HERE, AND WHY ──
   The metric names, and the Smart Shop category names and weights, are
   CHICK-FIL-A STANDARD. They are identical at every store and carry no figure
   about this one, so they are not the disclosure. They must stay client-side
   because the editor and the paste importer build a BLANK month out of them
   before any data has loaded — move these and "Add a period" produces a form
   with no rows to type into. */
const CEM_METRIC_ORDER = [
  { id: "sat",       name: "Overall Satisfaction" },
  { id: "taste",     name: "Taste of Food" },
  { id: "fast",      name: "Fast Service" },
  { id: "friend",    name: "Attentive / Friendly" },
  { id: "clean",     name: "Cleanliness" },
  { id: "placing",   name: "Ease of Placing Order" },
  { id: "receiving", name: "Ease of Receiving Order" },
  { id: "portion",   name: "Portion Size of Food" },
  { id: "accuracy",  name: "Order Accuracy" },
  { id: "return",    name: "Likelihood to Return (30d)" },
];
/* ═══ WHERE THE NUMBERS COME FROM ══════════════════════════════════════════
   Matt, Aug 11 2026: "remember other stores wont have claude."

   ⚠️ WRITTEN FROM THE ACTUAL REPORTS, not from memory. The Smart Shop lines
   below were checked against Gate City's real July 2026 Overview: the index is
   a big number in its own box, the performance level sits under it, the five
   categories are the Winning Hearts Every Day table — and the chain-wide figure
   is NOT in a box at all. It is the last point on the grey line of the Index
   Score Trend, which is the one a person will hunt for, so it gets its own line.

   ⚠️ THE STORE'S OWN NAME, NOT "Gate City". This hint used to read "Store =
   Gate City, Market = Greensboro-HPWS" in the code, which is exactly the kind
   of line that makes a cloned Hub read like somebody else's business. Both now
   come from storeConfig. */
const SHOP_WHERE = [
  "analytics.cfahome.com → Smart Shop → Overview.",
  "Index score: the big number top left. Performance level is under it.",
  "Chain-wide: the last point on the GREY line of the Index Score Trend at the bottom. It is not in a box.",
  "The five categories, their weights and their scores: the Winning Hearts Every Day table.",
  "Whole numbers only. One line per category, in any order.",
];
const CEM_WHERE = [
  "analytics.cfahome.com → CEM → Comparison Report.",
  `Store = ${STORE.name}. Market = your market row. Top 20% = the benchmark row.`,
  "The number after the label on the first line is how many responses the period had.",
  "Whole-number percents. Any metric name this tile does not know is named and skipped, never guessed.",
];

/* WHED, the five Smart Shop categories and their standard weights. */
const SHOP_CATEGORY_TEMPLATE = [
  { name: "Craveable Food",            weight: 33 },
  { name: "Attentive & Friendly Team", weight: 17 },
  { name: "Fast & Accurate Service",   weight: 23 },
  { name: "2nd Mile Service",          weight: 12 },
  { name: "Welcoming Environment",     weight: 15 },
];

/* ONE fetch of the seeded history, memoised, shared by both lists.
   ⚠️ A FAILURE IS NOT CACHED, so a dropped read retries on the next open
   instead of freezing the tile for the session. */
let guestSeedPromise = null;
const loadGuestSeed = () => {
  if (guestSeedPromise) return guestSeedPromise;
  guestSeedPromise = (async () => {
    try {
      const r = await fetch("/api/guest-seed", { headers: { "x-hub-token": hubToken() } });
      const j = await r.json().catch(() => null);
      if (j && j.ok && Array.isArray(j.cem) && Array.isArray(j.shop)) {
        return { cem: j.cem, shop: j.shop };
      }
    } catch { /* fall through to the retry below */ }
    guestSeedPromise = null;
    return null;
  })();
  return guestSeedPromise;
};


/* A failed read and an empty store both used to land on `seed`, and the next
   save then wrote seed-plus-one-edit over whatever the store really held.
   ok:false means the STORE COULD NOT BE REACHED — the caller may show the
   baseline, but must not publish from it and must not let an edit save. */
const kvLoad = async (key, seed) => {
  const r = await kvGetResult(key);
  if (!r.ok) return { ok: false, list: seed };
  return { ok: true, list: Array.isArray(r.value) && r.value.length ? r.value : seed };
};

// Publish the two guest metrics onto the EOS scorecard (rows s10/s11) from the
// LATEST CEM period. Read-modify-write so we only touch our own two keys and
// leave every other row's live override (s1-s9) untouched. Goal = Top-20%
// benchmark (the metric's own `top`), so hit = store >= top. Fires on every CEM
// save; picking the newest period by id keeps it right even when backfilling.
const pushCemToEos = async (cemList) => {
  try {
    if (!Array.isArray(cemList) || !cemList.length) return;
    const latest = cemList.reduce((a, b) => (String(b.id) > String(a.id) ? b : a));
    const mById = {};
    (latest.metrics || []).forEach((m) => { mById[m.id] = m; });
    const sat = mById.sat, fast = mById.fast;
    const key = `eos:scorecard:${eosPeriod()}`;
    // ⚠️ A failed read here used to survive as `cur = {}`, and the write below
    // then replaced every other team's row (s1–s9) with just our two. No read,
    // no publish — the next successful open republishes the same values anyway.
    const r = await kvGetResult(key);
    if (!r.ok) return;
    const cur = r.value && typeof r.value === "object" ? r.value : {};
    const next = { ...cur };
    if (sat && typeof sat.store === "number") {
      next.s10 = { actual: `${sat.store}%`, goal: `≥ ${sat.top}%`, hit: sat.store >= sat.top };
    }
    if (fast && typeof fast.store === "number") {
      next.s11 = { actual: `${fast.store}%`, goal: `≥ ${fast.top}%`, hit: fast.store >= fast.top };
    }
    kvSet(key, next);
  } catch {}
};

const clampPct = (v) => {
  const n = parseInt(String(v).replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : Math.max(0, Math.min(100, n));
};
const cemGap = (g) => (g >= 0 ? GREEN : g >= -6 ? AMBER : CLARET);

export default function GuestExperience({ tier }) {
  /* ★ VIEW-ONLY FOR SHIFT LEADERS (Matt, Jul 27: "let them see guest feedback").
     The tile drops to tier 2 in App.jsx so leaders can read CEM and Smart Shop
     scores alongside their scoreboard — numbers say what happened, guests say
     how it felt.

     ⚠️ `tier` was already being DESTRUCTURED HERE AND IGNORED — App.jsx passes
     it to every tile via `<activeTool.Component tier={tier} …>`. So lowering the
     registration alone would have handed leaders the "+ Add month" and "✎ Edit"
     controls, and this tile is not read-only data: `saveEdit` calls
     pushCemToEos(), which writes s10/s11 onto the EOS scorecard Nick reads at
     L10. A leader tidying a number would have landed it on the company board.

     ⚠️ Defaults to 3 when the prop is absent, so any caller that doesn't pass
     tier keeps full behaviour rather than silently locking itself out — same
     convention as ShiftLeaderScorecard. */
  const canEdit = (tier ?? 3) >= 3;
  const [tab, setTab]     = useState("cem"); // "cem" | "shop"
  /* Both lists start EMPTY and fill from the network. Nothing below indexes
     into them without a length check, and the screen shows a loading line
     rather than an empty chart — a guest-score chart drawn with no data reads
     as "we scored nothing", which is a wrong answer, not a blank one. */
  const [cem, setCem]     = useState([]);
  const [shop, setShop]   = useState([]);
  const [cemSel, setCemSel]   = useState("");
  const [shopSel, setShopSel] = useState("");
  const [seedFailed, setSeedFailed] = useState(false);
  /* ⚠️ THE THIRD STATE, AND ITS ABSENCE IS WHY THE VILLAGE SAW "Loading guest
     scores…" FOREVER. This tile had two states, loaded-with-data and failed,
     and read an empty list as "still coming". At a store whose seed is gated
     to empty and which has saved nothing, empty is the CORRECT and PERMANENT
     answer, so the loading line never went away and the paste boxes that would
     have fixed it sat below an early return nobody could get past.
     `loaded` says the fetch has finished, whatever it found. Nothing else can
     say that: both lists legitimately start [] and legitimately stay []. */
  const [loaded, setLoaded] = useState(false);
  const [cemMetric, setCemMetric] = useState("sat"); // which metric the CEM trend plots
  const [edit, setEdit]   = useState(false);
  const [draft, setDraft] = useState(null);
  // false = that list's read FAILED (not "empty") — baseline is on screen,
  // publishing and editing for that list are off until a reopen loads it.
  const [loadOk, setLoadOk] = useState({ cem: true, shop: true });

  useEffect(() => {
    // ⚠️ PUBLISH ON LOAD, not only on save. The s10/s11 feed used to fire ONLY
    // inside saveEdit, so the EOS board kept showing its own seed until somebody
    // opened this tile AND re-saved a CEM month — which nobody had reason to do
    // between quarterly reports. The rows read "seed — not publishing yet" for
    // weeks while the real numbers sat right here. Opening the tile is now
    // enough. pushCemToEos is a read-merge-write of our two keys only, so
    // republishing the same values is harmless.
    // ⚠️ ONLY from a read that succeeded: publishing after a FAILED read would
    // put the seed's numbers on the company scorecard as if they were measured.
    /* ⚠️ THE BASELINE IS A FETCH NOW, so it is awaited before either list is
       read. If it cannot be fetched there is no baseline to fall back to, so
       both lists stay empty and editing stays off — publishing or saving from
       nothing would overwrite real stored months with a blank. */
    let live = true;
    (async () => {
      const seed = await loadGuestSeed();
      if (!live) return;
      if (!seed) {
        setSeedFailed(true);
        setLoadOk({ cem: false, shop: false });
        setLoaded(true);
        return;
      }
      const [rc, rs] = await Promise.all([
        kvLoad(CEM_KEY, seed.cem),
        kvLoad(SHOP_KEY, seed.shop),
      ]);
      if (!live) return;
      setCem(rc.list); setCemSel(rc.list.length ? rc.list[rc.list.length - 1].id : "");
      if (rc.ok) pushCemToEos(rc.list);
      else setLoadOk(o => ({ ...o, cem: false }));
      setShop(rs.list); setShopSel(rs.list.length ? rs.list[rs.list.length - 1].id : "");
      if (!rs.ok) setLoadOk(o => ({ ...o, shop: false }));
      /* Last, and after both setters, so no frame can render as "finished" with
         one list still unset. */
      setLoaded(true);
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const id = "gv-fonts";
    if (typeof document !== "undefined" && !document.getElementById(id)) {
      const l = document.createElement("link");
      l.id = id; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
      document.head.appendChild(l);
    }
  }, []);

  const isCem = tab === "cem";
  const list  = isCem ? cem : shop;
  const selId = isCem ? cemSel : shopSel;
  /* ⚠️ `|| null`, AND IT IS LOAD-BEARING NOW THAT AN EMPTY LIST REACHES THE
     RENDER. `list[list.length - 1]` on an empty array is `undefined`, and the
     three detail blocks below test `view &&`, which is fine — but `startEdit`
     did `JSON.parse(JSON.stringify(selected))`, and JSON.stringify(undefined)
     returns undefined, so JSON.parse then throws on the string "undefined".
     A store with no reports yet used to be unable to reach that button. It can
     now, so the value it reads has to be a real one. */
  const selected = list.find(p => p.id === selId) || list[list.length - 1] || null;
  const latestId = list.length ? list.reduce((a, b) => (String(b.id) > String(a.id) ? b : a)).id : null;
  const stale = latestId && String(latestId) < nowYm();

  // Editing is also off while this tab's read has failed: an edit would upsert
  // onto the seed base and SAVE that over the real stored list.
  const tabLoadOk = isCem ? loadOk.cem : loadOk.shop;

  // ── editing ──
  // Guarded as well as hidden. Hiding a button is a UI choice; a guard is the
  // rule. Both, so no future render path can reopen editing by accident.
  /* `!selected` added Aug 12 2026 with the empty-list render. Editing nothing
     is not a state this editor has; the button is hidden in that case, and this
     is the belt to that pair of braces. */
  const startEdit = () => { if (!canEdit || !tabLoadOk || !selected) return; setDraft(JSON.parse(JSON.stringify(selected))); setEdit(true); };
  const startNew  = () => {
    if (!canEdit || !tabLoadOk) return;
    if (isCem) {
      setDraft({ id: "", label: "", count: "", metrics: CEM_METRIC_ORDER.map(m => ({ ...m, store: "", market: "", top: "" })) });
    } else {
      setDraft({ id: "", label: "", index: "", chain: "", level: "Needs Improvement",
        categories: SHOP_CATEGORY_TEMPLATE.map(c => ({ ...c, score: "" })) });
    }
    setEdit(true);
  };
  const cancelEdit = () => { setDraft(null); setEdit(false); };


  const saveEdit = async () => {
    if (!canEdit || !tabLoadOk) return;
    const id = (draft.id || "").trim() || (draft.label || "").trim().toLowerCase().replace(/\s+/g, "-");
    if (!id) { setEdit(false); setDraft(null); return; }
    if (isCem) {
      const rec = {
        id, label: (draft.label || id), count: clampPct(draft.count) || Number(String(draft.count).replace(/[^0-9]/g, "")) || 0,
        metrics: draft.metrics.map(m => ({ id: m.id, name: m.name, store: clampPct(m.store), market: clampPct(m.market), top: clampPct(m.top) })),
      };
      const next = upsert(cem, rec);
      // kvSet returns false on a refused write — it never throws. Saving used to
      // be fire-and-forget, so a dropped save looked identical to a kept one and
      // the editor closed over data that only existed on this screen.
      if (!(await kvSet(CEM_KEY, next))) {
        window.alert(`That did not save — the store could not be reached. Your edit is still open; try Save again. mention: ${CEM_KEY}`);
        return;
      }
      setCem(next); setCemSel(id);
      // Feed the two CEM guest metrics into the EOS scorecard so they show live
      // on the EOS board with no hand-entry (rows s10/s11 there). Same key
      // EOSTile reads — eos:scorecard:${eosPeriod()} — shaped
      // { [rowId]: { actual?, goal?, hit? } }. ONE writer per row, no drift.
      // ⚠️ READ-MODIFY-WRITE: merge our two rows into the existing override so we
      // don't clobber s1-s9's live values (published by FCR/HR/Cash/etc.).
      // Actuals come from the LATEST CEM period by month id — the record we just
      // saved may be a backfilled older month, so publish the newest, not `rec`.
      pushCemToEos(next);
    } else {
      const rec = {
        id, label: (draft.label || id), index: clampPct(draft.index), chain: clampPct(draft.chain),
        level: draft.level || "",
        categories: (draft.categories || []).filter(c => (c.name || "").trim()).map(c => ({ name: c.name, weight: clampPct(c.weight), score: clampPct(c.score) })),
      };
      const next = upsert(shop, rec);
      if (!(await kvSet(SHOP_KEY, next))) {
        window.alert(`That did not save — the store could not be reached. Your edit is still open; try Save again. mention: ${SHOP_KEY}`);
        return;
      }
      setShop(next); setShopSel(id);
    }
    setEdit(false); setDraft(null);
  };

  /* Paste imports — the same button as every monthly (PasteMonth). Both
     write through the exact upsert + kvSet path saveEdit uses, behind the
     same canEdit/tabLoadOk guards. CEM metric names are matched against
     this tile's own list, so a typo is named and ignored, never invented. */
  const importCem = async (text) => {
    if (!canEdit) return { ok: false, message: "View-only access — imports are off." };
    if (!tabLoadOk) return { ok: false, message: "This tab's record could not be read — importing could erase the history. Reopen the tile first." };
    const p = parseCemPaste(text);
    if (p.error) return { ok: false, message: p.error };
    const byName = new Map(CEM_METRIC_ORDER.map((m) => [m.name.toLowerCase(), m.id]));
    const unknown = [];
    const metrics = CEM_METRIC_ORDER.map((m) => ({ id: m.id, name: m.name, store: "", market: "", top: "" }));
    p.metrics.forEach((row) => {
      const id = byName.get(row.name.toLowerCase());
      if (!id) { unknown.push(row.name); return; }
      const slot = metrics.find((x) => x.id === id);
      slot.store = clampPct(row.store); slot.market = clampPct(row.market); slot.top = clampPct(row.top);
    });
    const rec = { id: p.id, label: p.label, count: Math.round(p.count), metrics };
    const next = upsert(cem, rec);
    if (!(await kvSet(CEM_KEY, next))) return { ok: false, message: `That did not save — the store could not be reached. Try again. mention: ${CEM_KEY}` };
    setCem(next); setCemSel(rec.id);
    pushCemToEos(next);
    return { ok: true, message: `Imported ${rec.label}.${unknown.length ? ` Ignored unknown metrics: ${unknown.join(", ")}.` : ""}` };
  };
  const importShop = async (text) => {
    if (!canEdit) return { ok: false, message: "View-only access — imports are off." };
    if (!tabLoadOk) return { ok: false, message: "This tab's record could not be read — importing could erase the history. Reopen the tile first." };
    const p = parseShopPaste(text);
    if (p.error) return { ok: false, message: p.error };
    const rec = {
      id: p.id, label: p.label, index: clampPct(p.index), chain: p.chain === "" ? "" : clampPct(p.chain),
      level: p.level || "",
      categories: (p.categories || []).map((c) => ({ name: c.name, weight: clampPct(c.weight), score: clampPct(c.score) })),
    };
    const next = upsert(shop, rec);
    if (!(await kvSet(SHOP_KEY, next))) return { ok: false, message: `That did not save — the store could not be reached. Try again. mention: ${SHOP_KEY}` };
    setShop(next); setShopSel(rec.id);
    return { ok: true, message: `Imported ${rec.label}.` };
  };

  const view = edit ? draft : selected;

  /* ⚠️ EARLY RETURN, AND IT IS SAFE HERE FOR ONE CHECKED REASON: every hook in
     this component runs above this line and there are none below it. That is
     the hooks-after-an-early-return fault that once rendered the dashboard with
     every tool blank, so it was verified before this was written, not assumed.
     🐛 THIS USED TO READ `if (!list.length)`, AND THE COMMENT UNDER IT SAID
     "`list` is only ever empty when the seeded history could not be fetched —
     kvLoad always returns the seed when nothing is stored". That was true at a
     store whose seed has months in it. It stopped being true the day the seed
     routes were gated per store: kvLoad still returns the seed, and the seed is
     now legitimately empty at every store that is not Gate City. So the one
     condition covered three different situations and answered "Loading" to all
     of them — permanently, for the two that never resolve.
     ⇒ Now it is exactly what it says: not finished, or finished and broken.
     A store that has finished loading and simply has no reports yet falls
     THROUGH to the real screen, where the paste boxes are. Those boxes are the
     entire remedy for having no reports, and they were unreachable from here. */
  if (!loaded || seedFailed) {
    return (
      <div style={{ fontFamily: BODY, background: PAPER, minHeight: "100vh", color: INK, padding: "24px 20px" }}>
        <div style={{ background: AMBER_BG, border: `1px solid ${AMBER_LINE}`, color: AMBER, borderRadius: 10, padding: "12px 14px", fontSize: 13, fontWeight: 700 }}>
          {seedFailed
            ? "Guest scores could not be loaded. Adding and editing are off so nothing overwrites the real record. Check the connection and reopen the tile."
            : "Loading guest scores…"}
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: BODY, background: PAPER, minHeight: "100vh", color: INK, paddingBottom: 40 }}>

      {(!loadOk.cem || !loadOk.shop) && (
        <div style={{ background: AMBER_BG, borderBottom: `1px solid ${AMBER_LINE}`, color: AMBER, padding: "10px 20px", fontSize: 13, fontWeight: 700 }}>
          Saved guest data could not be reached — showing the built-in baseline. Adding and editing are off so nothing overwrites the real record. Close and reopen the tile to retry.
        </div>
      )}

      {/* HEADER */}
      <div style={{ background: `linear-gradient(135deg,#97323C 0%,${CLARET} 42%,${CLARET_DEEP} 100%)`, padding: "16px 20px 0", borderBottom: `3px solid ${WINE}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.2em", color: "#E9B9BC", textTransform: "uppercase", marginBottom: 3 }}>
              {STORE.name} FSU · #{STORE.fsr}
            </div>
            <div style={{ fontFamily: DISP, fontSize: 30, fontWeight: 700, color: "#FFF6F1", letterSpacing: "-0.01em", lineHeight: 1.05 }}>
              Guest Experience
            </div>
          </div>
          {!edit && canEdit && tabLoadOk && (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={startNew} style={hdrBtn(false)}>+ Add month</button>
              {/* ⚠️ `selected &&`, because a store with no reports yet now
                  reaches this header. Edit with nothing to edit is a button
                  that is visible and does nothing, which is the exact symptom
                  the unbound-identifier check exists to catch — and it would
                  be a real dead button here, not a false positive. Add stays:
                  it is how the first month gets in. */}
              {selected && <button onClick={startEdit} style={hdrBtn(false)}>✎ Edit</button>}
            </div>
          )}
          {edit && (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={cancelEdit} style={hdrBtn(false)}>Cancel</button>
              <button onClick={saveEdit} style={hdrBtn(true)}>✓ Save</button>
            </div>
          )}
        </div>
        {/* TAB BAR */}
        <div style={{ display: "flex", gap: 4, marginTop: 12 }}>
          {[["cem", "CEM Survey"], ["shop", "Smart Shop"]].map(([k, lbl]) => (
            <button key={k} disabled={edit} onClick={() => setTab(k)} style={{
              padding: "11px 20px", fontSize: 13.5, fontWeight: 700, border: "none", cursor: edit ? "default" : "pointer",
              borderRadius: "12px 12px 0 0", background: tab === k ? PAPER : "rgba(255,255,255,0.14)",
              color: tab === k ? CLARET : "#F3D9DB", opacity: edit && tab !== k ? 0.5 : 1,
            }}>{lbl}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "14px 14px 10px" }}>

        {/* MONTHLY RESET NUDGE */}
        {/* Director-only: the nudge asks someone to enter last month's report,
            which is not a leader's job, and its button opens the editor. */}
        {!edit && stale && canEdit && tabLoadOk && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: AMBER_BG, border: `1px solid ${AMBER_LINE}`, borderLeft: `3px solid ${AMBER}`, borderTop: `3px solid ${AMBER}`, borderRadius: 14, padding: "12px 16px", marginBottom: 14 }}>
            <div style={{ flex: "1 1 auto", minWidth: 180 }}>
              <div style={{ fontFamily: DISP, fontSize: 15, fontWeight: 600, color: "#7A5A12" }}>New month — add {ymMonthLabel(nowYm())} {isCem ? "CEM" : "Smart Shop"} scores</div>
              <div style={{ fontSize: 12, color: SUB, marginTop: 2 }}>Latest on file is {ymMonthLabel(latestId)}. Drop in this month's report to keep the trend and EOS feed current.</div>
            </div>
            <button onClick={startNew} style={{ background: AMBER, color: "#FFF7EA", border: "none", borderRadius: 10, padding: "9px 15px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>+ Add {ymMonthLabel(nowYm()).split(" ")[0]}</button>
          </div>
        )}

        {/* ⚠️ NOTHING ON FILE IS A NORMAL STARTING STATE, NOT A FAULT, so this
            is a plain card and not the amber one. Amber here would tell a brand
            new store that something is wrong on their first open, which is both
            untrue and the fastest way to get a support message.
            ⚠️ RENDERED FOR EVERY TIER, but only the half that names the paste
            box is shown to somebody who can actually use it — pointing a team
            leader at a control they cannot see is worse than saying nothing. */}
        {!edit && !list.length && (
          <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontFamily: DISP, fontSize: 15, fontWeight: 600, color: INK }}>
              No {isCem ? "CEM" : "Smart Shop"} reports on file yet
            </div>
            <div style={{ fontSize: 12.5, color: SUB, marginTop: 3, lineHeight: 1.5 }}>
              {canEdit && tabLoadOk
                ? `Paste your ${isCem ? "CEM report" : "Smart Shop"} below to start the trend, or add a month by hand. Nothing is wrong and nothing is waiting on you.`
                : "A director adds these from the report each month. Nothing is wrong and nothing is waiting on you."}
            </div>
          </div>
        )}

        {!edit && canEdit && tabLoadOk && (
          <div style={{ marginBottom: 12 }}>
            <PasteMonth buttonLabel={isCem ? "Paste the CEM report" : "Paste the Smart Shop"} accent={CLARET}
              where={isCem ? CEM_WHERE : SHOP_WHERE}
              placeholder={isCem
                ? "CEM 2026-08 | Aug 2026 (90-day) | 1200\nOverall Satisfaction | 70 | 80 | 83\nTaste of Food | 71 | 80 | 83"
                : "SHOP 2026-08 | Aug 2026 | 85 | 87 | Needs Improvement\nCraveable Food | 33 | 86\n2nd Mile Service | 12 | 59"}
              onImport={isCem ? importCem : importShop} />
          </div>
        )}

        {/* PERIOD PICKER (view mode) */}
        {/* ⚠️ `list.length > 0`, NOT `list.length`. A bare `{0 && <div/>}`
            renders the character 0 into the page, so the empty case would put a
            stray zero above the paste box. The picker itself is hidden because
            a Period dropdown with no periods in it is a control that looks
            broken rather than empty. */}
        {!edit && list.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: SUB, textTransform: "uppercase", letterSpacing: "0.06em" }}>Period</span>
            <select value={selId} onChange={e => (isCem ? setCemSel : setShopSel)(e.target.value)}
              style={{ background: "#fff", border: `1.5px solid ${LINE}`, borderRadius: 9, padding: "8px 11px", fontSize: 13, fontWeight: 600, color: INK }}>
              {[...list].slice().reverse().map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            {isCem && view && <span style={{ fontSize: 11, color: SUB }}>{(view.count || 0).toLocaleString()} responses</span>}
          </div>
        )}

        {/* ============================= CEM ============================= */}
        {isCem && !edit && view && (
          <>
            <TrendCard
              title="Trend"
              subtitle={CEM_METRIC_ORDER.find(m => m.id === cemMetric)?.name}
              control={
                <select value={cemMetric} onChange={e => setCemMetric(e.target.value)}
                  style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 8, padding: "5px 9px", fontSize: 12, fontWeight: 600, color: INK }}>
                  {CEM_METRIC_ORDER.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              }
              series={[
                { color: CLARET,    label: "Store",   points: cem.map(p => ({ x: p.label, y: metricVal(p, cemMetric, "store") })) },
                { color: STONE,     label: "Top 20%", points: cem.map(p => ({ x: p.label, y: metricVal(p, cemMetric, "top") })) },
              ]}
            />
            <CemFocus metrics={view.metrics} />
            <CemTable metrics={view.metrics} />
            <div style={{ marginTop: 12, textAlign: "center", fontSize: 11, color: SUB }}>
              Claret = 6+ under Top 20% · Amber = within 6 · Green = at / above target
            </div>
          </>
        )}

        {/* ============================= SHOP ============================= */}
        {!isCem && !edit && view && (
          <>
            <TrendCard
              title="Index Score Trend"
              subtitle="Store vs chain-wide average"
              series={[
                { color: CLARET,    label: "Index", points: shop.map(p => ({ x: p.label, y: p.index })) },
                { color: STONE,     label: "Chain", points: shop.map(p => ({ x: p.label, y: p.chain })) },
              ]}
            />
            <ShopDetail rec={view} />
          </>
        )}

        {/* ============================= EDITOR ============================= */}
        {edit && draft && (
          <div style={card()}>
            {/* ⚠️ Every onChange here captures `const v = e.target.value` BEFORE
                calling setDraft. React can run a state updater after the handler
                returns, by which point the synthetic event is recycled and
                e.target is null — the bug that made Bri's prep-work field throw
                on every keystroke. Seven of these were latent in this editor. */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <Field label="Period label" hint="e.g. Aug 2026">
                <input value={draft.label} onChange={e => { const v = e.target.value; setDraft(d => ({ ...d, label: v })); }} style={txt(180)} placeholder="Aug 2026" />
              </Field>
              <Field label="Key (id)" hint="e.g. 2026-08">
                <input value={draft.id} onChange={e => { const v = e.target.value; setDraft(d => ({ ...d, id: v })); }} style={txt(120)} placeholder="2026-08" />
              </Field>
              {/* ⚠️ The Responses placeholder below was this store's REAL sample
                  size — n=1164, from the same SSO-walled Comparison Report the
                  scores come from — so moving the scores server-side would have
                  left the response count behind in the public chunk. Caught by
                  grepping the BUILT bundle, not the source. A round number
                  teaches the field just as well. */}
              {isCem
                ? <Field label="Responses"><input value={draft.count} onChange={e => { const v = e.target.value; setDraft(d => ({ ...d, count: v })); }} style={txt(90)} placeholder="1000" /></Field>
                : <>
                    <Field label="Index"><input value={draft.index} onChange={e => { const v = e.target.value; setDraft(d => ({ ...d, index: v })); }} style={txt(70)} placeholder="85" /></Field>
                    <Field label="Chain avg"><input value={draft.chain} onChange={e => { const v = e.target.value; setDraft(d => ({ ...d, chain: v })); }} style={txt(70)} placeholder="87" /></Field>
                    <Field label="Level"><input value={draft.level} onChange={e => { const v = e.target.value; setDraft(d => ({ ...d, level: v })); }} style={txt(160)} placeholder="Needs Improvement" /></Field>
                  </>}
            </div>

            {isCem ? (
              <>
                <ColHead cols={["Measure", "Store", "Market", "Top 20%"]} />
                {draft.metrics.map((m, i) => (
                  <div key={m.id} style={editRow(i)}>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                    <NumIn value={m.store}  accent onChange={v => setDraft(d => ({ ...d, metrics: d.metrics.map(x => x.id === m.id ? { ...x, store: v } : x) }))} />
                    <NumIn value={m.market}       onChange={v => setDraft(d => ({ ...d, metrics: d.metrics.map(x => x.id === m.id ? { ...x, market: v } : x) }))} />
                    <NumIn value={m.top}          onChange={v => setDraft(d => ({ ...d, metrics: d.metrics.map(x => x.id === m.id ? { ...x, top: v } : x) }))} />
                  </div>
                ))}
              </>
            ) : (
              <>
                <ColHead cols={["WHED Category", "Weight %", "Score"]} />
                {(draft.categories || []).map((c, i) => (
                  <div key={i} style={editRow(i)}>
                    <input value={c.name} onChange={e => { const v = e.target.value; setDraft(d => ({ ...d, categories: d.categories.map((x, j) => j === i ? { ...x, name: v } : x) })); }} style={{ ...txt(0), flex: 1, marginRight: 8 }} placeholder="Category" />
                    <NumIn value={c.weight} onChange={v => setDraft(d => ({ ...d, categories: d.categories.map((x, j) => j === i ? { ...x, weight: v } : x) }))} />
                    <NumIn value={c.score}  accent onChange={v => setDraft(d => ({ ...d, categories: d.categories.map((x, j) => j === i ? { ...x, score: v } : x) }))} />
                  </div>
                ))}
                <button onClick={() => setDraft(d => ({ ...d, categories: [...(d.categories || []), { name: "", weight: "", score: "" }] }))}
                  style={{ marginTop: 8, background: "#fff", border: `1.5px dashed ${STONE}`, color: INK, borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  + Add category
                </button>
              </>
            )}
            <div style={{ marginTop: 12, fontSize: 11.5, color: SUB, lineHeight: 1.5 }}>
              {isCem
                ? `Whole-number percents from the CEM Comparison Report. Store = ${STORE.name}, Market = your market row, Top 20% = benchmark row.`
                : "From the Smart Shop Overview. Index & chain-wide from the trend; category weights/scores from the WHED table."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── helpers / subcomponents ──────────────────────────────────────────────────
function upsert(arr, rec) {
  const i = arr.findIndex(x => x.id === rec.id);
  const next = i >= 0 ? arr.map((x, j) => (j === i ? rec : x)) : [...arr, rec];
  return next.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}
function metricVal(period, metricId, field) {
  const m = (period.metrics || []).find(x => x.id === metricId);
  return m ? m[field] : null;
}
function shortLabel(x) {
  return String(x).replace(/ 20\d\d.*/, "").replace(/ \(.*/, "");
}

function TrendCard({ title, subtitle, control, series }) {
  const pts = series[0].points;
  const vals = series.flatMap(s => s.points.map(p => p.y)).filter(v => typeof v === "number");
  const min = Math.max(0, Math.floor((Math.min(...vals) - 3) / 5) * 5);
  const max = Math.min(100, Math.ceil((Math.max(...vals) + 3) / 5) * 5);
  const W = 320, H = 120, PADX = 8, PADY = 10;
  const n = pts.length;
  const xAt = (i) => n <= 1 ? W / 2 : PADX + (i * (W - 2 * PADX)) / (n - 1);
  const yAt = (v) => H - PADY - ((v - min) / (max - min || 1)) * (H - 2 * PADY);
  const k = series.length;
  const slotW = (W - 2 * PADX) / Math.max(1, n);
  const groupW = Math.min(slotW * 0.72, 160);
  const barW = groupW / k;
  const baseY = yAt(min);
  const groupX = (i) => PADX + i * slotW + (slotW - groupW) / 2;
  return (
    <div style={card()}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
        <div>
          <div style={label()}>{title}</div>
          {subtitle && <div style={{ fontFamily: DISP, fontSize: 17, fontWeight: 600, color: INK }}>{subtitle}</div>}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          {series.map(s => <span key={s.label} style={{ fontSize: 11, fontWeight: 700, color: s.color, display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 3, background: s.color, borderRadius: 2, display: "inline-block" }} />{s.label}</span>)}
          {control}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow: "visible" }}>
        {[min, Math.round((min + max) / 2), max].map((g, i) => (
          <g key={i}>
            <line x1={0} x2={W} y1={yAt(g)} y2={yAt(g)} stroke={LINE} strokeWidth="1" />
            <text x={W} y={yAt(g) - 2} fontSize="8" fill={STONE} textAnchor="end">{g}</text>
          </g>
        ))}
        {pts.map((_, i) => series.map((s, j) => {
          const v = s.points[i] && typeof s.points[i].y === "number" ? s.points[i].y : null;
          if (v == null) return null;
          const x = groupX(i) + j * barW;
          const y = yAt(v);
          const h = Math.max(1, baseY - y);
          return (
            <g key={`${i}-${j}`}>
              <rect x={x + 1} y={y} width={Math.max(2, barW - 2)} height={h} rx={2} fill={s.color} />
              {n <= 4 && <text x={x + barW / 2} y={y - 3} fontSize="9" fontWeight="700" fill={s.color} textAnchor="middle">{v}</text>}
            </g>
          );
        }))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        {pts.map((p, i) => {
          const show = n <= 8 || i === 0 || i === n - 1 || i % 2 === 0;
          return show
            ? <span key={i} style={{ fontSize: 8.5, color: STONE, flex: 1, textAlign: "center" }}>{shortLabel(p.x)}</span>
            : <span key={i} style={{ flex: 1 }} />;
        })}
      </div>
    </div>
  );
}

function CemFocus({ metrics }) {
  const focus = metrics.map(m => ({ ...m, gap: m.store - m.top })).filter(m => m.gap < 0).sort((a, b) => a.gap - b.gap).slice(0, 3);
  if (!focus.length) return null;
  const below = metrics.filter(m => m.store < m.top).length;
  return (
    <div style={{ background: ROSE, border: `1px solid ${ROSE_LINE}`, borderRadius: 16, padding: "14px 18px", marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: CLARET, marginBottom: 10 }}>
        Biggest gaps to Top 20% · {below} of {metrics.length} below target
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {focus.map(m => (
          <div key={m.id} style={{ flex: "1 1 150px", background: CARD, border: `1px solid ${ROSE_LINE}`, borderLeft: `3px solid ${CLARET}`, borderTop: `3px solid ${CLARET}`, borderRadius: 12, padding: "10px 13px" , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: INK, lineHeight: 1.25 }}>{m.name}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 3 }}>
              <span style={{ fontFamily: DISP, fontSize: 32, fontWeight: 700, color: CLARET }}>{m.store}%</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: CLARET }}>{m.gap} pts</span>
              <span style={{ fontSize: 11, color: SUB, marginLeft: "auto" }}>target {m.top}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CemTable({ metrics }) {
  return (
    <div style={{ ...card(), padding: 0, overflow: "hidden" }}>
      <ColHead cols={["Measure", "Store", "Market", "Top 20%", "vs Top"]} inCard />
      {metrics.map((m, i) => {
        const gap = m.store - m.top, c = cemGap(gap);
        return (
          <div key={m.id} style={{ display: "flex", alignItems: "center", padding: "11px 14px", borderBottom: i < metrics.length - 1 ? `1px solid ${LINE}` : "none", background: gap <= -12 ? ROSE : CARD }}>
            <span style={{ flex: 1, fontFamily: DISP, fontSize: 15.5, fontWeight: 500, color: INK, lineHeight: 1.2, paddingRight: 8 }}>{m.name}</span>
            <span style={{ width: 62, textAlign: "center", fontFamily: DISP, fontSize: 19, fontWeight: 600, color: c }}>{m.store}%</span>
            <span style={{ width: 58, textAlign: "center", fontSize: 12, fontWeight: 600, color: STONE }}>{m.market}%</span>
            <span style={{ width: 58, textAlign: "center", fontSize: 12, fontWeight: 700, color: INK }}>{m.top}%</span>
            <span style={{ width: 62, textAlign: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#FBF1EC", background: c, borderRadius: 8, padding: "5px 9px" }}>{gap >= 0 ? `+${gap}` : gap}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ShopDetail({ rec }) {
  const cats = rec.categories || [];
  const lvlColor = /needs/i.test(rec.level || "") ? CLARET : /fair/i.test(rec.level || "") ? AMBER : GREEN;
  return (
    <>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ ...card(), flex: "1 1 120px", textAlign: "center", padding: "12px 10px" }}>
          <div style={label()}>Index Score</div>
          <div style={{ fontFamily: DISP, fontSize: 34, fontWeight: 700, color: CLARET }}>{rec.index}</div>
        </div>
        <div style={{ ...card(), flex: "1 1 120px", textAlign: "center", padding: "12px 10px" }}>
          <div style={label()}>Chain Avg</div>
          <div style={{ fontFamily: DISP, fontSize: 34, fontWeight: 700, color: STONE }}>{rec.chain}</div>
        </div>
        {rec.level && (
          <div style={{ ...card(), flex: "2 1 180px", textAlign: "center", padding: "12px 10px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={label()}>Performance Level</div>
            <div style={{ fontFamily: DISP, fontSize: 20, fontWeight: 600, color: lvlColor }}>{rec.level}</div>
          </div>
        )}
      </div>
      {cats.length > 0 && (
        <div style={{ ...card(), padding: 0, overflow: "hidden" }}>
          <ColHead cols={["WHED Category", "Weight", "Score"]} inCard />
          {cats.map((c, i) => {
            const sc = /needs/i.test(rec.level || "") && c.score < 70 ? CLARET : c.score >= 90 ? GREEN : INK;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: i < cats.length - 1 ? `1px solid ${LINE}` : "none" }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                <span style={{ width: 60, textAlign: "center", fontSize: 12, fontWeight: 600, color: STONE }}>{c.weight}%</span>
                <span style={{ width: 60, textAlign: "center", fontFamily: DISP, fontSize: 17, fontWeight: 600, color: sc }}>{c.score}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function ColHead({ cols, inCard }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: inCard ? "9px 14px" : "6px 4px", borderBottom: `1.5px solid ${LINE}`, background: inCard ? "#FBF6EF" : "transparent", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: SUB }}>
      <span style={{ flex: 1 }}>{cols[0]}</span>
      {cols.slice(1).map((c, i) => <span key={i} style={{ width: 60, textAlign: "center" }}>{c}</span>)}
    </div>
  );
}
function Field({ label, hint, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: SUB, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 10, color: STONE }}>{hint}</span>}
    </div>
  );
}
function NumIn({ value, onChange, accent }) {
  return (
    <span style={{ width: 60, textAlign: "center" }}>
      <input type="text" inputMode="numeric" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: 46, textAlign: "center", fontFamily: "monospace", fontSize: 13, fontWeight: accent ? 800 : 600,
          color: accent ? CLARET : INK, background: "#fff", border: `1.5px solid ${accent ? CLARET : LINE}`, borderRadius: 6, padding: "5px 4px" }} />
    </span>
  );
}

const card = () => ({ background: CARD, borderRadius: 16, border: `1px solid ${LINE}`, boxShadow: "0 1px 3px rgba(90,27,36,0.05)", padding: "16px 18px", marginBottom: 14 });
const label = () => ({ fontSize: 11, fontWeight: 700, color: SUB, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 4 });
const txt = (w) => ({ width: w || undefined, background: "#fff", border: `1.5px solid ${LINE}`, borderRadius: 9, padding: "8px 10px", fontSize: 13, fontWeight: 600, color: INK });
const editRow = (i) => ({ display: "flex", alignItems: "center", padding: "8px 4px", borderBottom: `1px solid ${LINE}`, background: i % 2 ? ALT : CARD });
const hdrBtn = (solid) => ({ background: solid ? "#FBF1EC" : "rgba(255,240,235,0.14)", border: "1px solid rgba(255,240,235,0.4)", color: solid ? CLARET : "#FFF3EF", borderRadius: 11, padding: "9px 15px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" });
