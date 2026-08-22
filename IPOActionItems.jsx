import { useState, useEffect, useMemo, useRef } from "react";
import { ipoQuarter } from "./ipoPlan.js";
import { parseIpoPlans, describeIpoPlans } from "./ipoPlanImport.js";
import { importZone, importCard, importOpenBtn } from "./cardStyle.js";
import { hubToken } from "./store.js";
import { STORE } from "./storeConfig.js"; // store + legal name on the eyebrow

// ---------------------------------------------------------------------------
// Gate City · Chick-fil-A — IPO Action Items, ledger-styled
// The plan (weeks, categories, storage key, financial ledger) comes from the
// shared ipoPlan.js — ONE source, also used by worker.js (the Slack reminder)
// and App.jsx (the Today-block pill). The quarter is derived from the date, so
// the key rolls each quarter (Q4 starts clean instead of inheriting Q3), and a
// not-yet-authored quarter auto-carries last quarter's checklist with numbers
// blanked (result.carried === true → the "numbers pending" banner shows).
// ---------------------------------------------------------------------------

// tier => text color + light tint
const TIER = {
  Critical: { ink: "#C4162E", tint: "#FBE4E7" },
  Medium: { ink: "#B4830F", tint: "#FBF0D3" },
  Monitor: { ink: "#2F5D8A", tint: "#E3EEF9" },
};

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/* 🐛🐛 A DEAD SECOND COPY OF THE WHOLE IPO PLAN LIVED HERE (Aug 8 2026).
   `const FIN` and `export const PLAN` held the ledger and every cost variance
   -- Repairs & Maintenance +$55,703, Paper +$42,672, Food +$35,269 -- and both
   were DEAD. Each is shadowed by a local inside the component (`const PLAN =
   plan.weeks`, `const FIN = plan.fin`), PLAN was exported and imported by
   nobody, and neither was read anywhere outside the component.

   Dead or not, the bundler shipped them. So the store's cost overruns were
   downloadable TWICE -- once from ipoPlan.js and once from here. Removing the
   ipoPlan copy alone would have left this one sitting in the bundle and looked
   exactly like a completed fix.

   ⚠️ THE LIVE VALUES COME FROM `plan` INSIDE THE COMPONENT, which is
   ipoQuarter(now, plans) fed by the gated /api/ipo-plan route. */

// Exported so App.jsx's Today-block IPO pill counts open items against the
// SAME plan this tile renders — one source, no duplicated item counts.

function itemId(catId, i) {
  return `${catId}-${i}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE QUARTER PLAN EDITOR (Matt, Aug 8 2026: "A second store needs their own
   and a place to edit.")

   Until today this plan was authored IN CODE — ipoPlanData.js still opens with
   "WHAT YOU AUTHOR EACH QUARTER (the ONE edit): add a block to QUARTER_PLANS".
   That is a deploy every quarter for this store, and simply impossible for a
   second store, who cannot edit this repo at all.

   ⚠️ IT IS A PASTE BOX, NOT A FORM, AND THAT IS A DELIBERATE STOPGAP. A quarter
   plan is four weeks of categories of items; a form for that is a week of work
   and this needed to exist today. Every other bulk entry in the Hub is a paste
   box, so this is the pattern people here already know. A friendlier editor can
   replace it later without changing anything stored.

   ⚠️ THE VALIDATOR IS SHARED WITH THE WORKER. parseIpoPlans runs here for the
   preview and AGAIN on the server before anything is written — a check that only
   runs in a browser is a check somebody can skip with curl.
   ⚠️ NOTHING SAVES UNTIL IT PASSES. A plan stored with three of its four weeks
   would look finished and quietly under-report what the store owes itself. */
function PlanEditor({ storedQuarters, onSaved }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [check, setCheck] = useState(null);   // { ok, error, plans, quarters }
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const runCheck = () => {
    const r = parseIpoPlans(text);
    setCheck(r);
    setNote("");
  };

  const save = async () => {
    if (!check || !check.ok || busy) return;
    setBusy(true); setNote("");
    try {
      const r = await fetch("/api/ipo-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
        body: JSON.stringify({ plans: check.plans }),
      });
      const d = await r.json().catch(() => null);
      if (d && d.ok) {
        setNote("Saved " + d.saved.join(", ") + ".");
        setText(""); setCheck(null);
        if (onSaved) onSaved();
      } else {
        /* ⚠️ THE SERVER'S REASON, VERBATIM. "Could not save" on its own sends
           somebody to me instead of to the line they got wrong. */
        setNote((d && d.error) || "Could not save. Nothing was stored.");
      }
    } catch (e) {
      setNote("Could not reach the server. Nothing was stored.");
    } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <div style={{ marginTop: 18 }}>
        <button type="button" style={importOpenBtn()} onClick={() => setOpen(true)}>
          Edit the quarter plan
        </button>
        <div style={{ fontSize: 12, color: "#6B7480", marginTop: 6 }}>
          {storedQuarters && storedQuarters.length
            ? "Your own plan is stored for " + storedQuarters.join(", ") + "."
            : "No plan stored yet for this store, so the built-in one is showing."}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 18 }}>
      <button type="button" style={importOpenBtn()} onClick={() => setOpen(false)}>Close</button>
      <div style={importCard()}>
        <div style={{ fontWeight: 800, fontSize: 13.5, color: "#1D4ED8", marginBottom: 6 }}>
          Paste a quarter plan
        </div>
        <div style={{ fontSize: 12.5, color: "#4B5563", lineHeight: 1.5, marginBottom: 8 }}>
          One or more quarters, keyed like <b>2026-Q3</b>. Nothing is stored until it passes the check.
        </div>
        <textarea
          rows={10}
          value={text}
          onChange={(e) => { const v = e.target.value; setText(v); setCheck(null); }}
          placeholder={'{\n  "2026-Q4": {\n    "fin": { },\n    "weeks": [\n      { "week": 1, "title": "…", "cats": [\n        { "id": "paper", "name": "Paper Cost", "items": ["…"] }\n      ] }\n    ]\n  }\n}'}
          style={importZone()}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={runCheck}
            style={{ fontSize: 13, fontWeight: 800, padding: "9px 14px", borderRadius: 8, border: "none", background: "#1D4ED8", color: "#fff", cursor: "pointer" }}>
            Check
          </button>
          <button type="button" onClick={save} disabled={!check || !check.ok || busy}
            style={{ fontSize: 13, fontWeight: 800, padding: "9px 14px", borderRadius: 8, border: "none",
                     background: (check && check.ok && !busy) ? "#047857" : "#9CA3AF",
                     color: "#fff", cursor: (check && check.ok && !busy) ? "pointer" : "default" }}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>

        {check && !check.ok && (
          <div style={{ marginTop: 9, fontSize: 12.5, fontWeight: 700, color: "#B91C1C", lineHeight: 1.5 }}>
            {check.error}
          </div>
        )}
        {check && check.ok && (
          <div style={{ marginTop: 9, fontSize: 12.5, color: "#065F46", lineHeight: 1.6 }}>
            <b>Reads correctly. This would store:</b>
            {describeIpoPlans(check.plans).map((line) => (<div key={line}>{line}</div>))}
          </div>
        )}
        {note && (
          <div style={{ marginTop: 9, fontSize: 12.5, fontWeight: 700, color: note.startsWith("Saved") ? "#065F46" : "#B91C1C" }}>
            {note}
          </div>
        )}
      </div>
    </div>
  );
}


export default function IPOActionItems() {
  // Whole plan derived from today's quarter — key, weeks, cats, ledger.
  /* ⚠️ THE PLAN ARRIVES OVER THE NETWORK NOW (Aug 8 2026). Its dollar variances
     used to be compiled into the client bundle — see ipoPlanData.js. Until the
     fetch lands, plans is null and ipoQuarter returns the empty week skeleton.
     ⚠️ THIS COMMENT USED TO CLAIM THE SKELETON "renders an empty quarter rather
     than crashing". It did not — weekStats indexed cats[0] on every one of
     those empty weeks and took the whole tile down on first paint, for months.
     A comment asserting the safe behaviour is what stopped anyone looking. */
  const [plans, setPlans] = useState(null);
  const [storedQuarters, setStoredQuarters] = useState([]);
  /* ⚠️⚠️ THREE OUTCOMES, NOT TWO. Matt, Aug 18 2026: "all of my ipo action items
     dissapeared." Nothing was deleted — his ticks were still in KV, every one of
     them — and the authored plan was still on the server. What happened is that
     a plan the tile could not LOAD and a store that has authored NOTHING both
     came back as `{}`, and `ipoQuarter({})` returns the empty week skeleton. So
     a refused or failed read rendered as a checklist with no items on it and
     said nothing at all.

     ⇒ `planLoad` is "loading" until the fetch answers, then "ok" or "failed".
     An empty checklist is only ever shown for "ok".

     ⚠️ THIS IS THE SAME CLASS AS THE RETENTION PURGE AND readKVResult: absent
     and unreachable are different facts, and collapsing them always fails in
     the frightening direction — the screen reports the store has nothing. */
  const [planLoad, setPlanLoad] = useState("loading");
  const [planWhy, setPlanWhy] = useState("");
  /* Bumping this refetches. The editor calls it after a successful save so the
     screen shows what was just stored rather than what was loaded on open. */
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/ipo-plan", { headers: { "x-hub-token": hubToken() } });
        const d = await r.json().catch(() => null);
        if (!alive) return;
        if (d && d.ok) {
          setPlans(d.plans || {});
          setStoredQuarters(d.storedQuarters || []);
          setPlanLoad("ok"); setPlanWhy("");
        } else {
          /* ⚠️ THE PLANS ARE LEFT ALONE ON A FAILURE, not blanked. If a refetch
             after a save fails, the screen keeps showing the quarter it already
             had rather than emptying under somebody who is mid-quarter. */
          setPlanLoad("failed");
          setPlanWhy(String((d && d.error) || `the server answered ${r.status}`).slice(0, 120));
        }
      } catch (e) {
        if (alive) { setPlanLoad("failed"); setPlanWhy("the request did not reach the Hub"); }
      }
    })();
    return () => { alive = false; };
  }, [reload]);
  /* ══ WHICH QUARTER IS ON SCREEN ══════════════════════════════════════════
     ⚠️⚠️ THIS WAS HARD-LOCKED TO `new Date()` AND THAT WAS THE BUG. Matt
     authored the 2026-Q4 plan on Aug 14, saved it, and the tile did not move —
     because in August `ipoQuarter` resolves to Q3 and there was no way to ask
     for any other quarter. He said "the ipo didnt work" twice. It had worked:
     the plan was in the database, correct, and unreachable.

     ⇒ A quarter you can AUTHOR is a quarter you must be able to OPEN. Waiting
     until October to look at a $223,232 plan built from July's numbers is not
     a plan, it is a diary entry.

     ⚠️ THE DATE IS WHAT MOVES, NOT THE PLAN. `ipoQuarter` derives the label,
     the checklist key and the week dates from one Date, so handing it a date
     inside the chosen quarter keeps all four in step. Passing a quarter key
     separately would have meant teaching it a second way to answer the same
     question. */
  const [viewKey, setViewKey] = useState("");     // "" = whatever quarter it is today

  /* A date inside a quarter: the first day of its first month. Module-level
     would be better (design rule 7) but it closes over nothing, and keeping it
     beside its only caller is what the rest of this file does. */
  const dateOfQuarter = (k) => {
    const m = /^(\d{4})-Q([1-4])$/.exec(String(k || ""));
    if (!m) return new Date();
    return new Date(Number(m[1]), (Number(m[2]) - 1) * 3, 1, 12, 0, 0);
  };

  const plan = useMemo(
    () => ipoQuarter(viewKey ? dateOfQuarter(viewKey) : new Date(), plans || {}),
    [plans, viewKey],
  );

  /* Every quarter worth offering: the one it is today, plus everything anybody
     has authored. Sorted, because a picker in insertion order puts next year
     above last year the moment two stores author out of sequence. */
  const quarterChoices = useMemo(() => {
    const now = new Date();
    const here = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
    return Array.from(new Set([here, ...Object.keys(plans || {})])).sort();
  }, [plans]);

  /* ⚠️ THE CURRENT QUARTER IS NAMED, so nobody has to work out which entry in
     the list is "now" from the label alone. */
  const todayKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
  }, []);
  const PLAN = plan.weeks;
  const STORAGE_KEY = plan.key;
  const FIN = plan.fin;            // null on a carried (not-yet-authored) quarter
  const carried = plan.carried;

  const ALL_CATS = useMemo(() => PLAN.flatMap((w) => w.cats), [PLAN]);
  const TOTAL_ITEMS = useMemo(() => ALL_CATS.reduce((n, c) => n + c.items.length, 0), [ALL_CATS]);
  const TOTAL_VARIANCE = useMemo(
    () => ALL_CATS.reduce((n, c) => n + (c.variance || 0), 0),
    [ALL_CATS]
  );
  const hasMoney = TOTAL_VARIANCE > 0; // false on a carried quarter → hide the $ ledger

  const [checked, setChecked] = useState({});
  const [openWeeks, setOpenWeeks] = useState(() => PLAN.map(() => true));
  // A failed hydrate read → every tick refuses until a clean reload. The
  // whole quarter lives in ONE record, so a tick after a failed read would
  // persist just that tick over every box already checked. saveWarn = a
  // write after a clean load came back false; clears on the next good write.
  const [loadFailed, setLoadFailed] = useState(false);
  const loadFailedRef = useRef(false);
  const [saveWarn, setSaveWarn] = useState(false);

  /* ⚠️⚠️ THIS DEPENDED ON `[]` AND HAD TO CHANGE WITH THE QUARTER PICKER, or
     switching quarters would have been a data bug rather than a view. Ticks are
     one record per quarter (`gcfcr-ipo-2026-q4-checklist` and so on), so a mount
     that reads once and never again would leave Q3's 39 ticks sitting on screen
     over Q4's items — every one of them against a DIFFERENT task, and the first
     tick after that would write the whole merged mess back to Q4's record.
     ⇒ It keys on STORAGE_KEY, and it CLEARS first. Clearing is the half that
     matters: without it, a quarter with nothing stored would inherit whatever
     the last quarter had, because `setChecked` only runs when a value comes
     back. That is the exact shape of the bug this comment exists to prevent. */
  useEffect(() => {
    let cancelled = false;
    setChecked({});
    setLoadFailed(false);
    loadFailedRef.current = false;
    (async () => {
      if (typeof window === "undefined" || !window.storage) return;
      // getResult, not get — get returns null for "nothing stored" AND "read
      // failed", and the difference is the whole quarter's checklist.
      const res = await window.storage.getResult(STORAGE_KEY, true);
      if (cancelled) return;
      if (!res.ok) {
        loadFailedRef.current = true;
        setLoadFailed(true);
        return;
      }
      if (res.value) setChecked(JSON.parse(res.value) || {});
    })();
    return () => {
      cancelled = true;
    };
  }, [STORAGE_KEY]);

  /* Returns whether the write landed. window.storage.set reports a refused
     write by RETURNING FALSE, never by throwing — the old try/catch could
     not catch anything and the result was thrown away. */
  async function persist(next) {
    if (typeof window === "undefined" || !window.storage) return false;
    return (await window.storage.set(STORAGE_KEY, JSON.stringify(next), true)) !== false;
  }

  async function toggle(id) {
    if (loadFailedRef.current) return; // banner explains
    const next = { ...checked, [id]: !checked[id] };
    if (!next[id]) delete next[id];
    setChecked(next);
    if (!(await persist(next))) { setChecked(checked); setSaveWarn(true); return; }
    setSaveWarn(false);
  }

  async function resetAll() {
    if (loadFailedRef.current) return; // banner explains
    if (typeof window !== "undefined" && window.confirm("Clear all posted entries for the IPO ledger?")) {
      const prev = checked;
      setChecked({});
      if (!(await persist({}))) { setChecked(prev); setSaveWarn(true); return; }
      setSaveWarn(false);
    }
  }

  const catDone = useMemo(() => {
    const m = {};
    for (const c of ALL_CATS) {
      m[c.id] = c.items.reduce((n, _, i) => n + (checked[itemId(c.id, i)] ? 1 : 0), 0);
    }
    return m;
  }, [checked]);

  const weekStats = useMemo(
    () =>
      PLAN.map((w) => {
        const total = w.cats.reduce((n, c) => n + c.items.length, 0);
        const done = w.cats.reduce((n, c) => n + catDone[c.id], 0);
        /* 🐛 THIS WAS `tier: w.cats[0].tier` AND IT CRASHED THE TILE EVERY TIME
           (Aug 9 2026 sweep). `plans` starts null, so the first render calls
           ipoQuarter with an empty map, which returns four week shells each
           carrying `cats: []` — and `w.cats[0]` is undefined. There is no early
           return above this useMemo and the component takes no props, so no
           caller could ever pre-supply a plan. Every Director who tapped IPO
           Action Items got the crash card instead of the checklist.
           ⚠️ DELETED RATHER THAN GUARDED. Nothing reads a WEEK-level tier —
           the chips further down read `c.tier`, the category's own. Guarding it
           would have left a dead field handing null to whoever read it next.
           ⚠️ SIX CHECKS ARE CLEAN ON THIS FILE. An index into an empty array at
           runtime is not something parse, hooks, scope, TDZ, event or cycle
           checks can model. It took opening the tile. */
        return { ...w, total, done };
      }),
    [catDone]
  );

  const doneCount = useMemo(() => Object.values(catDone).reduce((a, b) => a + b, 0), [catDone]);

  const posted = useMemo(
    () => ALL_CATS.reduce((sum, c) => sum + c.variance * (catDone[c.id] / c.items.length), 0),
    [catDone]
  );
  const outstanding = TOTAL_VARIANCE - posted;
  const pct = TOTAL_VARIANCE ? (posted / TOTAL_VARIANCE) * 100 : 0;

  // Cumulative dollar share per week, so the recovery rail paints ONE
  // continuous gradient across all four segments instead of four separate bars.
  const railSegs = useMemo(() => {
    let offset = 0;
    return weekStats.map((w) => {
      const share = TOTAL_VARIANCE ? w.dollars / TOTAL_VARIANCE : 0;
      const seg = { week: w.week, dollars: w.dollars, done: w.done, total: w.total, share, offset };
      offset += share * 100;
      return seg;
    });
  }, [weekStats, TOTAL_VARIANCE]);

  return (
    <div className="ipo-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .ipo-root{
          --m1:#C0731F; --m2:#8A3220; --m3:#3E1620;
          --gold:#F5C860;
          --paper:#F6F4F1; --card:#FFFFFF;
          --rule:#E7E2DA; --rule-soft:#F1EDE6;
          --ink:#1C222B; --dim:#67717F; --dimmer:#8C96A4;
          --amber:#B4830F; --amber-2:#9A5A18;
          --jade:#0F8A5F;
          font-family:'IBM Plex Sans',system-ui,-apple-system,sans-serif;
          color:var(--ink); background:var(--paper);
          min-height:100vh; padding:0 0 60px; line-height:1.5;
          -webkit-font-smoothing:antialiased;
        }
        .ipo-root *{box-sizing:border-box}
        .ipo-root .wrap{max-width:1040px;margin:0 auto;padding:0 16px}
        .ipo-root .num{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;font-weight:500}
        .ipo-root .sc{text-transform:uppercase;letter-spacing:.15em;font-size:10px;font-weight:700}

        /* ---------- Dark masthead ---------- */
        .ipo-root .mast{
          background:linear-gradient(120deg,var(--m1) 0%,var(--m2) 30%,var(--m3) 55%);
          color:#fff;padding:34px 0 30px;position:relative;overflow:hidden;
        }
        .ipo-root .mast::after{
          content:"";position:absolute;right:-90px;top:-120px;width:340px;height:340px;
          border-radius:50%;background:rgba(255,255,255,.05);pointer-events:none;
        }
        .ipo-root .mast .wrap{position:relative;z-index:1}
        .ipo-root .eyebrow{color:var(--gold);opacity:.95}
        .ipo-root .mast h1{
          font-family:'Space Grotesk',sans-serif;font-weight:700;letter-spacing:-.03em;
          font-size:clamp(28px,5.4vw,42px);margin:9px 0 3px;line-height:1.03;
        }
        .ipo-root .mast .sub{color:rgba(255,255,255,.72);font-size:12.5px;max-width:56ch}

        .ipo-root .figures{display:flex;flex-wrap:wrap;align-items:flex-end;gap:14px 42px;margin-top:26px}
        .ipo-root .fig-label{color:rgba(255,255,255,.6);margin-bottom:7px}
        .ipo-root .outstanding{
          font-family:'IBM Plex Mono',monospace;font-weight:600;letter-spacing:-.02em;
          font-size:clamp(40px,9vw,62px);line-height:.94;color:var(--gold);
        }
        .ipo-root .outstanding.zero{color:#7BE3B4}
        .ipo-root .fig-small{font-family:'IBM Plex Mono',monospace;font-size:21px;font-weight:600;color:#fff}
        .ipo-root .fig-foot{font-size:11px;color:rgba(255,255,255,.55);margin-top:6px}

        /* ---------- Recovery rail (one gradient, dollar-weighted weeks) ---------- */
        .ipo-root .rail{margin-top:26px}
        .ipo-root .rail-track{
          display:flex;gap:3px;height:30px;border-radius:9px;overflow:hidden;
          background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.14);
        }
        .ipo-root .rail-seg{position:relative;overflow:hidden}
        .ipo-root .rail-fill{
          position:absolute;top:0;bottom:0;left:0;
          background-image:linear-gradient(120deg,#FFE3A6 0%,var(--gold) 34%,#E09A2B 70%);
          background-size:var(--railw) 100%;
          background-position:calc(-1 * var(--offset)) 0;
          transition:width .6s cubic-bezier(.2,.8,.25,1);
        }
        .ipo-root .rail-legend{display:grid;grid-template-columns:repeat(4,1fr);gap:3px;margin-top:9px}
        .ipo-root .leg{font-size:10.5px;color:rgba(255,255,255,.6);line-height:1.5;padding-right:6px}
        .ipo-root .leg b{display:block;color:#fff;font-size:11.5px;font-weight:600}
        .ipo-root .leg .money{font-family:'IBM Plex Mono',monospace;color:var(--gold)}

        /* ---------- Carried-quarter banner ---------- */
        .ipo-root .carriedNote{
          margin-top:22px;padding:12px 15px;border-radius:0 8px 8px 0;font-size:12.5px;
          background:rgba(255,255,255,.10);border-left:3px solid var(--gold);color:rgba(255,255,255,.9);
        }
        .ipo-root .carriedNote b{color:var(--gold)}

        /* ---------- Weeks ---------- */
        .ipo-root .week{margin-top:32px}
        .ipo-root .weekHead{
          display:flex;align-items:baseline;gap:13px;width:100%;background:none;border:0;
          padding:0 2px 10px;cursor:pointer;text-align:left;color:inherit;
          border-bottom:1px solid var(--rule);position:relative;
          font-family:'IBM Plex Sans',system-ui,sans-serif;
        }
        .ipo-root .weekHead::after{
          content:"";position:absolute;left:0;bottom:-1px;height:2.5px;width:var(--wprog,0%);
          background:linear-gradient(90deg,var(--amber),var(--amber-2));transition:width .6s ease;
        }
        .ipo-root .weekHead:focus-visible{outline:2px solid var(--amber);outline-offset:4px;border-radius:4px}
        .ipo-root .chev{flex:0 0 auto;color:var(--dimmer);transition:transform .2s ease}
        .ipo-root .chev.closed{transform:rotate(-90deg)}
        .ipo-root .wk{
          font-family:'Space Grotesk',sans-serif;font-size:10px;font-weight:700;letter-spacing:.13em;
          color:#fff;background:linear-gradient(120deg,var(--m2),var(--m3) 70%);
          border-radius:4px;padding:4px 9px;text-transform:uppercase;flex:0 0 auto;
        }
        .ipo-root .weekHead h2{
          font-family:'Space Grotesk',sans-serif;font-size:17px;font-weight:600;
          letter-spacing:-.01em;margin:0;flex:1;
        }
        .ipo-root .weekHead .amt{font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--amber-2);font-weight:600}
        .ipo-root .weekHead .dates{font-size:11px;color:var(--dimmer);white-space:nowrap}
        .ipo-root .weekPhase{font-size:12.5px;color:var(--dim);margin:13px 2px 4px;max-width:62ch}

        /* ---------- Category cards ---------- */
        .ipo-root .cats{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;margin-top:15px}
        .ipo-root .cat{
          position:relative;border-radius:13px;padding:17px 18px 14px;background:var(--card);
          border:1px solid var(--rule);overflow:hidden;
          box-shadow:0 1px 2px rgba(28,34,43,.04),0 6px 16px -12px rgba(28,34,43,.18);
        }
        .ipo-root .cat::before{
          content:"";position:absolute;left:0;top:0;bottom:0;width:3px;
          background:linear-gradient(180deg,var(--tierInk) 0%,rgba(255,255,255,0) 92%);
        }
        .ipo-root .cat.complete{border-color:#BFE3D2;background:linear-gradient(160deg,#F3FBF7 0%,#fff 55%)}
        .ipo-root .cat.complete::before{background:linear-gradient(180deg,var(--jade) 0%,rgba(255,255,255,0) 92%)}
        .ipo-root .catTop{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}
        .ipo-root .tierChip{
          font-size:9px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;
          color:var(--tierInk);background:var(--tierTint);border-radius:99px;padding:3px 9px;display:inline-block;
        }
        .ipo-root .catName{
          font-family:'Space Grotesk',sans-serif;font-size:17px;font-weight:600;
          letter-spacing:-.01em;margin:9px 0 0;
        }
        .ipo-root .stamp{
          display:inline-block;margin-left:8px;font-size:9px;font-weight:700;letter-spacing:.09em;
          color:var(--jade);border:1.3px dashed var(--jade);border-radius:10px;padding:1.5px 7px;
          transform:rotate(-4deg);vertical-align:middle;
        }
        .ipo-root .catDetail{font-size:11.5px;color:var(--dimmer);margin-top:5px;max-width:40ch}
        .ipo-root .catVar{
          font-family:'IBM Plex Mono',monospace;font-size:20px;font-weight:600;
          color:var(--tierInk);text-align:right;white-space:nowrap;
        }
        .ipo-root .catPct{font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--dimmer);text-align:right;margin-top:2px}

        .ipo-root .meter{margin-top:15px}
        .ipo-root .meter-top{display:flex;justify-content:space-between;font-size:10.5px;color:var(--dim);margin-bottom:6px}
        .ipo-root .meter-top .done{color:var(--jade);font-weight:600}
        .ipo-root .meter-track{height:4px;border-radius:99px;background:#EDE9E2;overflow:hidden}
        .ipo-root .meter-fill{
          height:100%;border-radius:99px;
          background:linear-gradient(90deg,var(--amber),var(--amber-2));transition:width .45s ease;
        }
        .ipo-root .cat.complete .meter-fill{background:linear-gradient(90deg,#2FB183,var(--jade))}

        .ipo-root .note{
          margin-top:14px;padding:10px 13px;border-radius:0 8px 8px 0;font-size:12px;color:#6A521A;
          background:#FCF5E4;border-left:3px solid var(--amber);
        }

        .ipo-root .items{margin-top:13px;display:flex;flex-direction:column;gap:1px}
        .ipo-root .item{
          display:flex;gap:12px;align-items:flex-start;padding:8px;border-radius:8px;
          cursor:pointer;user-select:none;transition:background .15s;
        }
        .ipo-root .item:hover{background:#F7F4EF}
        .ipo-root .item:focus-visible{outline:2px solid var(--amber);outline-offset:-2px}
        .ipo-root .box{
          flex:0 0 auto;width:19px;height:19px;border-radius:6px;margin-top:1px;
          border:1.6px solid #C8CED8;background:#fff;
          display:flex;align-items:center;justify-content:center;transition:all .18s;
        }
        .ipo-root .box svg{opacity:0;transform:scale(.5);transition:all .18s}
        .ipo-root .box.on{background:linear-gradient(135deg,var(--amber),var(--amber-2));border-color:transparent}
        .ipo-root .box.on svg{opacity:1;transform:scale(1)}
        .ipo-root .item .label{font-size:13px;line-height:1.45}
        .ipo-root .item .label.on{color:var(--dimmer);text-decoration:line-through;text-decoration-color:#C8CED8}

        /* ---------- Financial ledger table ---------- */
        .ipo-root .snap{margin-top:34px;border-radius:13px;padding:19px 20px 10px;border:1px solid var(--rule);background:var(--card)}
        .ipo-root .snap .cap{
          color:var(--amber-2);display:inline-block;padding-bottom:6px;
          border-bottom:2px solid var(--amber);margin-bottom:14px;
        }
        .ipo-root .fin-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -2px}
        /* min-width is what actually stops the collision: below this the wrapper
           scrolls instead of the browser crushing the columns together. */
        .ipo-root table.fin{width:100%;min-width:520px;border-collapse:collapse;font-size:13px}
        /* Breathing room between money columns. They were butted up against each
           other with zero horizontal padding, which is why 11,650.14 and 9,118.90
           read as one number. */
        .ipo-root table.fin th + th,
        .ipo-root table.fin td + td{padding-left:16px}
        /* The category name stays put while the numbers scroll — a ledger row is
           meaningless once its label has slid off the screen. */
        .ipo-root table.fin th:first-child,
        .ipo-root table.fin td:first-child{position:sticky;left:0;background:var(--card);z-index:1}
        .ipo-root table.fin td{white-space:nowrap}
        .ipo-root table.fin th{
          font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dimmer);
          font-weight:600;text-align:right;padding:0 0 9px;border-bottom:1.5px solid var(--ink);
        }
        .ipo-root table.fin th:first-child{text-align:left}
        .ipo-root table.fin th:last-child{color:var(--amber-2)}
        .ipo-root table.fin td{
          padding:8px 0;text-align:right;border-top:1px solid var(--rule-soft);
          font-family:'IBM Plex Mono',monospace;
        }
        .ipo-root table.fin td:first-child{text-align:left;font-family:'IBM Plex Sans',sans-serif;color:var(--dim)}
        .ipo-root tr.strong td:first-child{color:var(--ink);font-weight:600}
        .ipo-root tr.sub td:first-child{padding-left:18px;font-size:12.5px;color:var(--dimmer)}
        .ipo-root table.fin td:last-child{color:var(--amber-2);font-weight:600}
        .ipo-root .marginNote{
          margin:14px 0 10px;padding:10px 13px;border-radius:0 8px 8px 0;font-size:12.5px;
          color:#6A521A;background:#FCF5E4;border-left:3px solid var(--amber);
        }
        .ipo-root .foot-note{font-size:10.5px;color:var(--dimmer);padding:4px 2px 10px}

        /* ---------- Controls / footer ---------- */
        .ipo-root .controls{display:flex;gap:10px;justify-content:flex-end;margin-top:30px}
        .ipo-root .btn{
          font-family:'IBM Plex Sans',sans-serif;font-size:11px;font-weight:600;letter-spacing:.09em;
          text-transform:uppercase;padding:11px 18px;border-radius:9px;cursor:pointer;color:#fff;border:0;
          background:linear-gradient(120deg,var(--m1),var(--m2) 70%);
        }
        .ipo-root .btn.ghost{background:transparent;border:1px solid var(--rule);color:var(--dim)}
        .ipo-root .btn:focus-visible{outline:2px solid var(--amber);outline-offset:3px}
        .ipo-root .pageFoot{font-size:10.5px;color:var(--dimmer);text-align:center;margin-top:28px;line-height:1.8}

        @media (max-width:640px){
          .ipo-root .figures{gap:14px 26px}
          .ipo-root .rail-legend{grid-template-columns:repeat(2,1fr);gap:10px 3px}
          .ipo-root .cats{grid-template-columns:1fr}
          .ipo-root .weekHead{flex-wrap:wrap;gap:8px 12px}
          .ipo-root .weekHead h2{flex:1 1 100%;order:3}
          .ipo-root .weekHead .amt{order:4}
          .ipo-root .weekHead .dates{order:5}
        }
        @media (prefers-reduced-motion:reduce){.ipo-root *{transition:none !important}}
        @media print{
          .ipo-root{background:#fff;padding:0}
          .ipo-root .mast{background:none;color:#000;padding:0 0 18px}
          .ipo-root .mast::after{display:none}
          .ipo-root .eyebrow,.ipo-root .outstanding,.ipo-root .leg .money{color:#000}
          .ipo-root .mast .sub,.ipo-root .fig-label,.ipo-root .fig-foot,.ipo-root .leg{color:#444}
          .ipo-root .fig-small,.ipo-root .leg b{color:#000}
          .ipo-root .carriedNote{background:#F4F4F4;color:#000}
          .ipo-root .controls{display:none}
          .ipo-root .week,.ipo-root .cat{break-inside:avoid}
          .ipo-root .item:hover{background:none}
        }
      `}</style>

      {planLoad === "failed" && (
        <div style={{ background:"#FEF2F2", border:"1.5px solid #DC2626", color:"#991B1B", borderRadius:10, padding:"10px 14px", fontSize:13, fontWeight:700, margin:"12px 14px 0" }}>
          The quarter plan did not load, so this list is not your real one.
          <b> Nothing has been deleted</b> — your ticked boxes are saved and will
          come straight back. Usually this means the sign-in expired: sign out
          and back in, then reopen this tile.
          {planWhy ? <div style={{ fontWeight: 600, marginTop: 4, fontSize: 12 }}>The Hub said: {planWhy}</div> : null}
        </div>
      )}
      {loadFailed && (
        <div style={{ background:"#FFFBEB", border:"1.5px solid #F59E0B", color:"#92400E", borderRadius:10, padding:"10px 14px", fontSize:13, fontWeight:700, margin:"12px 14px 0" }}>
          The checklist did not load, so ticking is off — one tick now would save
          over every box already checked. Check the wifi and refresh the page.
        </div>
      )}
      {!loadFailed && saveWarn && (
        <div style={{ background:"#FEF2F2", border:"1.5px solid #DC2626", color:"#991B1B", borderRadius:10, padding:"10px 14px", fontSize:13, fontWeight:700, margin:"12px 14px 0" }}>
          That tick did not save — check the wifi and tap it again.
        </div>
      )}

      {/* ---- Dark masthead ---- */}
      <div className="mast">
        <div className="wrap">
          <div className="eyebrow sc">{STORE.name} · Chick-fil-A · {plan.label}</div>
          <h1>IPO Action Items</h1>
          <div className="sub">
            Incremental Profit Opportunity — every dollar above benchmark, and the action that brings it back.
          </div>

          {/* ⚠️ ONLY WHEN THERE IS SOMETHING TO CHOOSE. A picker with one entry
              is furniture that asks a question with one answer. */}
          {quarterChoices.length > 1 && (
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <label htmlFor="ipo-quarter" style={{
                fontSize: 11, fontWeight: 700, letterSpacing: ".12em",
                textTransform: "uppercase", opacity: 0.7,
              }}>Quarter</label>
              <select
                id="ipo-quarter"
                value={viewKey || todayKey}
                onChange={(e) => {
                  /* ⚠️ THE VALUE IS READ BEFORE setState, not inside it. Check 5
                     in CLAUDE.md: `.target` read inside the updater is a
                     released synthetic event by the time it runs. */
                  const v = e.target.value;
                  setViewKey(v === todayKey ? "" : v);
                }}
                style={{
                  fontSize: 13.5, fontWeight: 700, padding: "6px 10px", borderRadius: 8,
                  border: "1px solid rgba(255,255,255,.28)", background: "rgba(255,255,255,.10)",
                  color: "#fff", cursor: "pointer",
                }}
              >
                {quarterChoices.map((k) => (
                  <option key={k} value={k} style={{ color: "#111" }}>
                    {k.replace("-", " ")}{k === todayKey ? " · now" : ""}
                  </option>
                ))}
              </select>
              {/* ⚠️ SAID OUT LOUD WHEN YOU ARE NOT LOOKING AT NOW. A checklist
                  for a quarter that has not started looks identical to this
                  quarter's, and ticking the wrong one wastes the work twice:
                  once doing it, once finding out. */}
              {viewKey && viewKey !== todayKey && (
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#F5C451" }}>
                  {viewKey > todayKey ? "Not started yet" : "Past quarter"} · ticks save against {viewKey}
                </span>
              )}
            </div>
          )}

          {carried && (
            <div className="carriedNote">
              <b>No {plan.label} plan has been written yet.</b>{" "}
              {plan.carriedFrom
                ? <>This is the checklist from <b>{plan.carriedFrom}</b>, shown with a fresh clean slate. Nothing has been moved or lost, and the {plan.carriedFrom} plan is still there under its own quarter.</>
                : <>Showing a clean checklist.</>}
              {" "}The dollar figures are hidden until this quarter has its own plan.
            </div>
          )}

          {hasMoney && (
            <>
              <div className="figures">
                <div>
                  <div className="fig-label sc">Still on the table</div>
                  <div className={`outstanding ${outstanding <= 0 ? "zero" : ""}`}>
                    {usd0.format(Math.round(outstanding))}
                  </div>
                </div>
                <div>
                  <div className="fig-label sc">Recovered</div>
                  <div className="fig-small">{usd0.format(Math.round(posted))}</div>
                  <div className="fig-foot">
                    {doneCount} of {TOTAL_ITEMS} actions posted · {pct.toFixed(0)}% recovered
                  </div>
                </div>
                <div>
                  <div className="fig-label sc">Total opportunity</div>
                  <div className="fig-small">{usd0.format(TOTAL_VARIANCE)}</div>
                  <div className="fig-foot">vs. prior-period benchmark</div>
                </div>
              </div>

              <div className="rail">
                <div className="rail-track">
                  {railSegs.map((s) => (
                    <div
                      className="rail-seg"
                      key={s.week}
                      title={`${s.week} — ${s.done}/${s.total}`}
                      style={{
                        flex: s.dollars,
                        "--railw": `${s.share ? 100 / s.share : 100}%`,
                        "--offset": `${s.share ? s.offset / s.share : 0}%`,
                      }}
                    >
                      <div
                        className="rail-fill"
                        style={{ width: `${s.total ? (s.done / s.total) * 100 : 0}%` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="rail-legend">
                  {railSegs.map((s) => (
                    <div className="leg" key={s.week}>
                      <b>{s.week}</b>
                      <span className="money">{usd0.format(s.dollars)}</span> · {s.done}/{s.total} posted
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="wrap">
        {/* ---- Weekly entries ---- */}
        {weekStats.map((w, wi) => {
          const open = openWeeks[wi];
          const wpct = w.total ? (w.done / w.total) * 100 : 0;
          return (
            <div className="week" key={w.week}>
              <button
                className="weekHead"
                onClick={() => setOpenWeeks((prev) => prev.map((v, i) => (i === wi ? !v : v)))}
                aria-expanded={open}
                style={{ "--wprog": `${wpct}%` }}
              >
                <svg
                  className={`chev ${open ? "" : "closed"}`}
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="wk">{w.week}</span>
                <h2>{w.title}</h2>
                <span className="amt">{usd0.format(w.dollars)}</span>
                <span className="dates">{w.dates}</span>
              </button>
              {open && <div className="weekPhase">{w.phase}</div>}

              {open && (
                <div className="cats">
                  {w.cats.map((c) => {
                    const done = catDone[c.id];
                    const complete = done === c.items.length;
                    const t = TIER[c.tier];
                    const back = c.variance ? c.variance * (done / c.items.length) : 0;
                    return (
                      <div
                        className={`cat ${complete ? "complete" : ""}`}
                        key={c.id}
                        style={{ "--tierInk": t.ink, "--tierTint": t.tint }}
                      >
                        <div className="catTop">
                          <div>
                            <span className="tierChip">{c.tier}</span>
                            <div className="catName">
                              {c.name}
                              {complete && <span className="stamp">Posted</span>}
                            </div>
                            {c.detail && <div className="catDetail">{c.detail}</div>}
                          </div>
                          {c.variance != null && (
                            <div>
                              <div className="catVar">{usd0.format(c.variance)}</div>
                              <div className="catPct">{c.pct} sales</div>
                            </div>
                          )}
                        </div>

                        <div className="meter">
                          <div className="meter-top">
                            <span>
                              {complete ? (
                                <span className="done">All actions posted</span>
                              ) : (
                                `${done} of ${c.items.length} posted`
                              )}
                            </span>
                            <span className="num">{usd0.format(Math.round(back))} back</span>
                          </div>
                          <div className="meter-track">
                            <div
                              className="meter-fill"
                              style={{ width: `${(done / c.items.length) * 100}%` }}
                            />
                          </div>
                        </div>

                        {c.note && <div className="note">{c.note}</div>}

                        <div className="items">
                          {c.items.map((label, i) => {
                            const id = itemId(c.id, i);
                            const on = !!checked[id];
                            return (
                              <div
                                className="item"
                                key={id}
                                onClick={() => toggle(id)}
                                role="checkbox"
                                aria-checked={on}
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === " " || e.key === "Enter") {
                                    e.preventDefault();
                                    toggle(id);
                                  }
                                }}
                              >
                                <span className={`box ${on ? "on" : ""}`}>
                                  <svg
                                    width="11"
                                    height="11"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="#fff"
                                    strokeWidth="4"
                                  >
                                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </span>
                                <span className={`label ${on ? "on" : ""}`}>{label}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* ---- Financial snapshot ---- */}
        {FIN && (
          <div className="snap">
            <div className="cap sc">{FIN.caption || "3-Month Spend"}</div>
            {/* 🐛 THE NUMBERS RAN INTO EACH OTHER ON AN iPAD (Matt: columns
                collide — "11,650.149,118.903,310.41" — and the 3-month column
                is cut off entirely).
                The table was width:100% with no minimum and nothing to scroll,
                so on a narrow screen the browser squeezed every money column
                until the digits touched and then clipped the last one off the
                right edge. The figures were correct the whole time and unreadable.
                ⚠️ SCROLL THE TABLE, NEVER THE PAGE. A page that scrolls sideways
                on a phone is a worse bug than the one being fixed. The wrapper
                takes the overflow so the rest of the layout cannot move. */}
            <div className="fin-wrap">
            <table className="fin">
              <thead>
                <tr>
                  <th>Category</th>
                  {FIN.cols.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FIN.rows.map((r) => (
                  <tr key={r.label} className={`${r.strong ? "strong" : ""} ${r.sub ? "sub" : ""}`}>
                    <td>{r.label}</td>
                    {r.vals.map((v, i) => (
                      <td key={i} className="num">
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {FIN.note && <div className="marginNote">{FIN.note}</div>}
            {FIN.footnote && <div className="foot-note">{FIN.footnote}</div>}
          </div>
        )}

        {/* ---- Controls ---- */}
        <div className="controls">
          <button className="btn" onClick={() => window.print()}>
            Print
          </button>
          <button className="btn ghost" onClick={resetAll}>
            Reset
          </button>
        </div>

        <PlanEditor storedQuarters={storedQuarters} onSaved={() => setReload((n) => n + 1)} />

        <div className="pageFoot">
          Source: CFA Analytics Hub IPO dashboard · variance vs. prior-period benchmark.
          <br />
          Re-run the IPO report the first week of each month, then review at L10.
        </div>
      </div>
    </div>
  );
}
