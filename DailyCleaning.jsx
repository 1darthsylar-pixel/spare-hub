import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { STORE } from "./storeConfig.js";

/* Inline checkmark (replaces lucide-react so no extra dependency) */
function Check({ size = 16, color = "currentColor", strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ---------------------------------------------------------
   DATA — pulled from the Gate City FOH & BOH cleaning sheets
   (base seed — team edits are layered on top and saved
   separately, so the base list is never lost)
--------------------------------------------------------- */

/* Day colors come from the Hub's own family (the Sales Allocation channel
   palette plus harmonized shades) so this tool reads as part of the Hub, not a
   separate app. Each day keeps a distinct hue on purpose — leaders recognize
   "today's color" at a glance on the chips and the panel. */
const DAYS = [
  { key: "Monday",    short: "MON", foh: "Drive Thru",            boh: "Primary",     color: "#DD0031", tint: "#F8D6DC", deep: "#A80C27", ink: "light" },
  { key: "Tuesday",   short: "TUE", foh: "Front Counter",         boh: "Secondary",   color: "#1B3A5C", tint: "#D8E1EA", deep: "#12293F", ink: "light" },
  { key: "Wednesday", short: "WED", foh: "Dining Room",           boh: "Machines",    color: "#0E7C7B", tint: "#D3EAEA", deep: "#095756", ink: "light" },
  { key: "Thursday",  short: "THU", foh: "Drive Thru",            boh: "Prep",        color: "#6B4FA0", tint: "#E2DAF0", deep: "#4E3878", ink: "light" },
  { key: "Friday",    short: "FRI", foh: "Dish / Front Counter",  boh: "Dish / Hall", color: "#B4690E", tint: "#F2E2CC", deep: "#8A4F0A", ink: "light" },
  { key: "Saturday",  short: "SAT", foh: "Dining Room",           boh: "Breading",    color: "#87325C", tint: "#EAD2DE", deep: "#632343", ink: "light" },
];

const FOH_DATA = {
  Monday: { shifts: {
    AM:  ["DT Handsink", "Flyfan", "OLD Shelf and Walls", "DT Sticker Printer"],
    MID: ["DT Drink Cooler (Gaskets)", "Dessert Cooler (Gaskets)", "DT Drink Counter", "DT Cup Gaskets", "DT Ceiling and Vents"],
    PM:  ["DT Drink Cup Storage", "DT Storage Shelves and Walls", "DT Drink Lid Holders", "DT Drink and Window KP", "Ice Bin 1 (Lid Holders)"],
  }},
  Tuesday: { shifts: {
    AM:  ["FC Salad Cooler", "FC KPS", "FC Sticker Printer"],
    MID: ["FC Dry Storage Shelving", "FC Bev Towers Counter"],
    PM:  ["FC Condiment Kanbans", "Lemonade Machines", "Ice Bin 2 (Lid Holders)", "DT and FC Trash Cans (Inside and Out)"],
  }},
  Wednesday: { shifts: {
    MID: ["Clean Squeegee Wall (Red and Blue)", "Booster Seats"],
    PM:  ["DR Trash Cans (Inside and Out)", "Restroom Trash Cans (Inside and Out)", "Condiment Towers", "Scrub Night", "Trash Compactors", "Ice Bin 3 (Lid Holders)"],
  }},
  Thursday: { shifts: {
    AM:  ["Lids Shelving", "DT Straws and Dry Storage Shelving", "Bagging KPS", "DT Flylight and Wall"],
    MID: ["Desserts Wall", "Desserts Lid Holder", "Desserts Counter", "Desserts Cooler (Gaskets)", "Desserts Cups and Bowl Gaskets"],
    PM:  ["Ice Dream Machine", "DT Condiments Kanbans", "DT Chutes", "Lemonade Machines", "Ice Bin 4 (Lid Holders)"],
  }},
  Friday: { shifts: {
    PM:  ["Break Area", "Patio", "Spray Outside Trash Cans", "Ice Bucket Holders", "FC Chutes", "Lemonade Prep Area", "Sugar Dry Storage Shelving", "Ice Machine Inside"],
  }},
  Saturday: { shifts: {
    AM:  ["Behind Booths", "DR Chair Legs", "Dust Lights", "Dust Walls", "PP Shoe Cubby"],
    PM:  ["Shakebase Dispenser (Unplug)", "Scrubnight", "Lemonade Machines", "Trash Compactors"],
  }},
};

const BOH_DATA = {
  Monday:    { tasks: ["Thaw 1", "Henny 1", "Oven 1", "Primary screens/tablets", "Shelving", "Fry freezer", "Fry hopper/chute", "Foil bag holders", "Fry vents", "Hoods exterior", "Hand sink", "Papertowel holder", "Drink station", "Trash can"] },
  Tuesday:   { tasks: ["Thaw 2", "Henny 2", "Flat top, sides, back", "Shelving", "Storage", "Fry hopper/chute", "Hood vents", "Hood exterior", "Fry freezer", "Soup station/cooling rack", "Hand sink", "Papertowel holder", "Trash can"] },
  Wednesday: { tasks: ["Thaw 3", "Oven 2", "Garland grills", "Henny hood vents", "Hood exterior", "Soup warmer/pots/table", "Merco unit", "Breading and secondary storage", "Electric towers"] },
  Thursday:  { tasks: ["Thaw 4", "Henny 3", "Main prep lowboy", "Biscuit lowboy", "Secondary salad lowboy", "Prep shelving", "Biscuit shelves", "Mixer", "Produce sink", "Dish shelving", "Prep screens/tablets", "Trash can"] },
  Friday:    { tasks: ["Thaw 5", "Henny 4", "Dish sink", "Under dish sink", "Dishwasher", "Dirty dish shelving", "Clean dish shelving", "Dish pit floor", "Mop sink", "Freezer", "Trash can", "Hall walls and floor", "Hallway vents"] },
  Saturday:  { tasks: ["Henny 5", "Breading table", "Milkwash cooler", "Thaw tops/fans", "Shelf above table", "Ipad", "Trash can"] },
};

const SHIFT_ORDER = ["AM", "MID", "PM"];

/* ⭐ A COLOUR PER DAYPART, AND IT IS THE DAYPART'S RATHER THAN THE DAY'S.
   Matt, Aug 20 2026: "the AM, MID lines etc.. are just too blah. Some color
   would help break it up."

   ⚠️ THE DAY ALREADY OWNS THIS PAGE — the header gradient and the panel tint are
   both its colour — so painting the bands in it too would give three identical
   bars and break nothing up at all. A leader learns amber/teal/violet once and
   then reads the page without reading the words.
   ⚠️ ALL THREE HEXES ARE LIFTED FROM THE DAY PALETTE ABOVE (Friday, Wednesday,
   Thursday) rather than invented here, so the screen keeps one set of colours. */
const DAYPART_TINT = {
  AM:  { deep: "#8A4F0A", tint: "#F7EEE0" },   // sunrise
  MID: { deep: "#095756", tint: "#E2F0F0" },   // midday
  PM:  { deep: "#4E3878", tint: "#EDE7F6" },   // evening
};

/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */

const DEFAULT_CFG = { added: {}, overrides: {}, removed: [] };

// Build the effective task list for a house+day, with stable keys, from the
// base seed plus the team's edits (cfg = { added, overrides, removed }).
function buildTasks(house, dayKey, cfg) {
  const c = cfg || DEFAULT_CFG;
  const removed = c.removed || [];
  const overrides = c.overrides || {};
  const added = c.added || {};
  const out = [];
  if (house === "FOH") {
    const shifts = FOH_DATA[dayKey].shifts;
    SHIFT_ORDER.forEach((shift) => {
      (shifts[shift] || []).forEach((name, i) => {
        const key = `${shift}#b${i}`;
        if (!removed.includes(key)) out.push({ key, shift, name: overrides[key] ?? name, base: true });
      });
      (added[shift] || []).forEach((a) => {
        if (!removed.includes(a.id)) out.push({ key: a.id, shift, name: a.name, base: false });
      });
    });
  } else {
    BOH_DATA[dayKey].tasks.forEach((name, i) => {
      const key = `b${i}`;
      if (!removed.includes(key)) out.push({ key, shift: null, name: overrides[key] ?? name, base: true });
    });
    (added.list || []).forEach((a) => {
      if (!removed.includes(a.id)) out.push({ key: a.id, shift: null, name: a.name, base: false });
    });
  }
  return out;
}

function getWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/* ---------------------------------------------------------
   COMPONENT
--------------------------------------------------------- */

/* ⚠️ `tier` WAS NEVER ACCEPTED, AND ANYONE COULD EDIT THE LIST. App.jsx has
   always passed tier and user to every tool; this one ignored them, so the
   "Manage tasks" button was visible to a Team Member and the rename and
   remove controls with it. Matt, Aug 3 2026, asked for tier 2 and up — Senior
   Trainer, Team Leader and above. The tile itself stays tier 1 so everyone can
   still SIGN OFF their cleaning; only editing the list is raised. */
export default function DailyCleaning({ tier = 1 }) {
  const today = new Date();
  const isSunday = today.getDay() === 0;
  const weekKey = useMemo(() => getWeekKey(today), []); // stable for the session
  const defaultDayIndex = today.getDay() === 0 ? 0 : today.getDay() - 1;

  const [house, setHouse] = useState("FOH");
  const [dayIndex, setDayIndex] = useState(defaultDayIndex);
  const [data, setData] = useState({ FOH: {}, BOH: {} });   // signatures: { [day]: { [taskKey]: {cleaned,checked} } }
  const [cfg, setCfg] = useState({ FOH: {}, BOH: {} });      // task edits:  { [day]: { added, overrides, removed } }
  const [loadingHouse, setLoadingHouse] = useState(true);
  const [flash, setFlash] = useState(false);
  // Any read for the active house failed → initials and task edits refuse
  // until a clean reload (each day is one record; a save off a blank read
  // would erase the day's other signatures, or the team's task edits).
  // saveWarn = a write after a clean load came back false.
  const [loadFailed, setLoadFailed] = useState(false);
  const loadFailedRef = useRef(false);
  const [saveWarn, setSaveWarn] = useState(false);

  // Manage-mode state
  const [manage, setManage] = useState(false);
  const canManage = Number(tier) >= 2;
  /* Search runs across BOTH houses and all six days, because "which day is DT
     Handsink on" is the question people actually have and a search that only
     filters the day already on screen cannot answer it. */
  const [query, setQuery] = useState("");
  const [otherLoaded, setOtherLoaded] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [addingShift, setAddingShift] = useState(null); // "AM"|"MID"|"PM" for FOH, "_BOH" for BOH
  const [formName, setFormName] = useState("");

  const day = DAYS[dayIndex];
  const dayKey = day.key;
  const dayCfg = cfg[house]?.[dayKey] || DEFAULT_CFG;
  const flatTasks = useMemo(() => buildTasks(house, dayKey, dayCfg), [house, dayKey, dayCfg]);
  const sigs = data[house]?.[dayKey];

  /* Every matching task across both houses and all six days. A day whose
     config never loaded is skipped rather than searched off the seed. */
  const hits = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    ["FOH", "BOH"].forEach((h) => {
      DAYS.forEach((d) => {
        const dcfg = cfg[h] && cfg[h][d.key];
        if (!dcfg) return;
        buildTasks(h, d.key, dcfg).forEach((t) => {
          if (String(t.name || "").toLowerCase().includes(q)) {
            out.push({ house: h, day: d, shift: t.shift, name: t.name, key: t.key });
          }
        });
      });
    });
    return out;
  })();

  /* THE OTHER HOUSE'S EDITS, FETCHED ONLY WHEN SOMEONE SEARCHES.
     Search has to be accurate across both houses, and the base seed alone is
     not: a task the team REMOVED still sits in the seed, so searching without
     the other house's config would hand someone a task that is not on the
     list any more. Six reads, once per open, and only if the search box is
     actually used — nobody pays for this on a normal sign-off. */
  useEffect(() => {
    if (!query.trim() || otherLoaded) return undefined;
    const other = house === "FOH" ? "BOH" : "FOH";
    let cancelled = false;
    (async () => {
      const rows = await Promise.all(DAYS.map(async (d) => {
        try {
          const r = await window.storage.getResult(`cleaning-cfg:${other}:${d.key}`, true);
          if (!r.ok) return [d.key, null];
          if (!r.value) return [d.key, DEFAULT_CFG];
          const parsed = JSON.parse(r.value);
          return [d.key, (parsed && typeof parsed === "object")
            ? { added: parsed.added || {}, overrides: parsed.overrides || {}, removed: parsed.removed || [] }
            : DEFAULT_CFG];
        } catch { return [d.key, null]; }
      }));
      if (cancelled) return;
      /* A day whose read FAILED stays absent rather than defaulting. Searching
         it would be searching the seed, which is the inaccuracy this exists to
         avoid — better to find nothing than to find a removed task. */
      const map = {};
      rows.forEach(([k, v]) => { if (v) map[k] = v; });
      setCfg((c) => ({ ...c, [other]: { ...map, ...(c[other] || {}) } }));
      setOtherLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [query, otherLoaded, house]);

  // Load every day's signatures + task edits for the active house
  useEffect(() => {
    let cancelled = false;
    async function loadHouse() {
      setLoadingHouse(true);
      const results = await Promise.all(
        DAYS.map(async (d) => {
          const sigKey = `cleaning:${weekKey}:${house}:${d.key}`;
          const cfgKey = `cleaning-cfg:${house}:${d.key}`;
          // getResult, not get — get returns null for BOTH "nothing stored"
          // and "read failed", and after a failed read the defaults below
          // would be saved over the real day on the next initial.
          let ok = true;
          let dcfg = DEFAULT_CFG;
          const cRes = await window.storage.getResult(cfgKey, true);
          if (!cRes.ok) ok = false;
          else if (cRes.value) {
            try {
              const parsed = JSON.parse(cRes.value);
              if (parsed && typeof parsed === "object") dcfg = { added: parsed.added || {}, overrides: parsed.overrides || {}, removed: parsed.removed || [] };
            } catch {}
          }
          let sigMap = {};
          const sRes = await window.storage.getResult(sigKey, true);
          if (!sRes.ok) ok = false;
          else if (sRes.value) {
            try {
              const parsed = JSON.parse(sRes.value);
              if (Array.isArray(parsed)) {
                // Legacy positional array → migrate onto base task keys
                const baseTasks = buildTasks(house, d.key, DEFAULT_CFG);
                parsed.forEach((e, i) => { if (baseTasks[i] && e) sigMap[baseTasks[i].key] = e; });
              } else if (parsed && typeof parsed === "object") {
                sigMap = parsed;
              }
            } catch {}
          }
          return [d.key, sigMap, dcfg, ok];
        })
      );
      if (cancelled) return;
      const houseSigs = {}, houseCfg = {};
      let anyFail = false;
      results.forEach(([k, s, c, ok]) => { houseSigs[k] = s; houseCfg[k] = c; if (!ok) anyFail = true; });
      loadFailedRef.current = anyFail;
      setLoadFailed(anyFail);
      setData((prev) => ({ ...prev, [house]: houseSigs }));
      setCfg((prev) => ({ ...prev, [house]: houseCfg }));
      setLoadingHouse(false);
    }
    loadHouse();
    return () => { cancelled = true; };
  }, [house, weekKey]);

  const updateField = useCallback((taskKey, field, value) => {
    setData((prev) => {
      const dayMap = { ...(prev[house]?.[dayKey] || {}) };
      dayMap[taskKey] = { ...(dayMap[taskKey] || {}), [field]: value };
      return { ...prev, [house]: { ...prev[house], [dayKey]: dayMap } };
    });
  }, [house, dayKey]);

  const persist = useCallback(() => {
    if (loadFailedRef.current) return; // banner explains — a save would erase the day's other initials
    setData((prev) => {
      const map = prev[house]?.[dayKey];
      if (map) {
        const key = `cleaning:${weekKey}:${house}:${dayKey}`;
        // set returns FALSE on a refused write, it never throws — the old
        // .then here flashed "Saved" on failure and the .catch could not run.
        window.storage.set(key, JSON.stringify(map), true).then((ok) => {
          if (ok === false) { setSaveWarn(true); return; }
          setSaveWarn(false);
          setFlash(true); setTimeout(() => setFlash(false), 1100);
        });
      }
      return prev;
    });
  }, [house, dayKey, weekKey]);

  // ── Task management (persists to the shared task-edit key, not week-scoped) ──
  const saveCfg = useCallback((nextDayCfg) => {
    if (loadFailedRef.current) return; // banner explains — a save would erase the team's task edits
    const prevDayCfg = dayCfg;
    setCfg((prev) => ({ ...prev, [house]: { ...prev[house], [dayKey]: nextDayCfg } }));
    const cfgKey = `cleaning-cfg:${house}:${dayKey}`;
    window.storage.set(cfgKey, JSON.stringify(nextDayCfg), true).then((ok) => {
      if (ok === false) {
        // Roll back to what is really stored for this day.
        setCfg((prev) => ({ ...prev, [house]: { ...prev[house], [dayKey]: prevDayCfg } }));
        setSaveWarn(true);
      } else setSaveWarn(false);
    });
  }, [house, dayKey, dayCfg]);

  const cancelForm = () => { setEditingKey(null); setAddingShift(null); setFormName(""); };

  const commitAdd = () => {
    const name = formName.trim();
    if (!name) return;
    const id = `c${Date.now()}`;
    const added = { ...(dayCfg.added || {}) };
    if (house === "FOH") {
      const shift = addingShift;
      added[shift] = [...(added[shift] || []), { id, name }];
    } else {
      added.list = [...(added.list || []), { id, name }];
    }
    saveCfg({ ...dayCfg, added });
    cancelForm();
  };

  const commitEdit = (task) => {
    const name = formName.trim();
    if (!name) return;
    if (task.base) {
      saveCfg({ ...dayCfg, overrides: { ...(dayCfg.overrides || {}), [task.key]: name } });
    } else {
      const added = { ...(dayCfg.added || {}) };
      const bucket = house === "FOH" ? task.shift : "list";
      added[bucket] = (added[bucket] || []).map((a) => (a.id === task.key ? { ...a, name } : a));
      saveCfg({ ...dayCfg, added });
    }
    cancelForm();
  };

  const removeTask = (task) => {
    if (task.base) {
      saveCfg({ ...dayCfg, removed: [...(dayCfg.removed || []), task.key] });
    } else {
      const added = { ...(dayCfg.added || {}) };
      const bucket = house === "FOH" ? task.shift : "list";
      added[bucket] = (added[bucket] || []).filter((a) => a.id !== task.key);
      saveCfg({ ...dayCfg, added });
    }
    // clear any signature for the removed task
    setData((prev) => {
      const dayMap = { ...(prev[house]?.[dayKey] || {}) };
      delete dayMap[task.key];
      return { ...prev, [house]: { ...prev[house], [dayKey]: dayMap } };
    });
  };

  const primaryField = house === "FOH" ? "cleaned" : "checked";
  const sigOf = (key) => (data[house]?.[dayKey]?.[key] || {});
  const doneCount = flatTasks.filter((t) => (sigOf(t.key)[primaryField] || "").trim()).length;
  const total = flatTasks.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  function dayProgress(d) {
    const dcfg = cfg[house]?.[d.key];
    if (!dcfg && loadingHouse) return null;
    const tasks = buildTasks(house, d.key, dcfg || DEFAULT_CFG);
    const map = data[house]?.[d.key] || {};
    const done = tasks.filter((t) => (map[t.key]?.[primaryField] || "").trim()).length;
    return { done, total: tasks.length };
  }

  const editBtn = { background: "#EEF2FF", border: "1px solid #C7D2FE", color: "#4338CA", borderRadius: 7, padding: "5px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
  const removeBtn = { background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 7, padding: "5px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };

  function renderManageRow(t) {
    const editing = editingKey === t.key;
    if (editing) {
      return (
        <div className="wcl-row" key={t.key} style={{ gap: 8, flexWrap: "wrap" }}>
          <input autoFocus className="sig-box" style={{ flex: 1, width: "auto", textAlign: "left", minWidth: 140 }}
            value={formName} onChange={(e) => setFormName(e.target.value)} />
          <button style={{ ...editBtn, background: day.color, border: "none", color: "#fff" }} onClick={() => commitEdit(t)}>Save</button>
          <button style={{ ...editBtn, background: "#fff", border: "1px solid #E5E7EB", color: "#6B7480" }} onClick={cancelForm}>Cancel</button>
        </div>
      );
    }
    return (
      <div className="wcl-row" key={t.key} style={{ gap: 8 }}>
        <div className="wcl-name" style={{ flex: 1 }}>
          {t.name}
          {!t.base && <span style={{ fontSize: 10, fontWeight: 800, color: "#6B7480", marginLeft: 6, letterSpacing: ".05em" }}>ADDED</span>}
        </div>
        <button style={editBtn} onClick={() => { setEditingKey(t.key); setAddingShift(null); setFormName(t.name); }}>✎ Edit</button>
        <button style={removeBtn} onClick={() => removeTask(t)}>✕ Remove</button>
      </div>
    );
  }

  function renderAdd(shift) {
    const isOpen = addingShift === shift;
    if (isOpen) {
      return (
        <div className="wcl-row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input autoFocus className="sig-box" style={{ flex: 1, width: "auto", textAlign: "left", minWidth: 140 }}
            placeholder="New task name" value={formName} onChange={(e) => setFormName(e.target.value)} />
          <button style={{ ...editBtn, background: day.color, border: "none", color: "#fff" }} onClick={commitAdd}>Add</button>
          <button style={{ ...editBtn, background: "#fff", border: "1px solid #E5E7EB", color: "#6B7480" }} onClick={cancelForm}>Cancel</button>
        </div>
      );
    }
    return (
      <div className="wcl-row">
        <button onClick={() => { setAddingShift(shift); setEditingKey(null); setFormName(""); }}
          style={{ flex: 1, background: "#fff", border: `1.5px dashed ${day.color}`, color: day.deep, borderRadius: 9, padding: "9px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          + Add task{house === "FOH" ? ` to ${shift}` : ""}
        </button>
      </div>
    );
  }

  return (
    <div className="wcl-root">
      <style>{`
        /* No @import here on purpose. This tool used to pull Fraunces + Inter
           from fonts.googleapis.com on every open — the only external fetch in
           the whole Hub, slow on store wifi and against the house rule that
           nothing the Hub serves phones another host. System stack matches the
           rest of the Hub. */
        .wcl-root {
          --red: #DD0031;
          --charcoal: #232A31;
          --paper: #F6F8FA;
          --line: #E3E7EC;
          --muted: #6B7480;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
          background: var(--paper);
          color: var(--charcoal);
          min-height: 100vh;
          padding: 20px 14px 60px;
        }
      ` +
      /* ⚠️ THE STRING IS BROKEN HERE SO THIS COMMENT IS JS, NOT CSS (Aug 8
         2026). A block comment inside a style template literal is part of the
         STRING, so no minifier can remove it and all three notes in this file
         shipped to the browser word for word, Matt's quotes included.
         Concatenating the literal keeps each note beside the rule it explains
         and out of the bundle.
         960 matches the laptop-width pass on WasteTracker / PeakReachers /
         DailySetup (Jul 30): only bites above iPad portrait, phones and
         iPads render exactly as before. 600 was a phone width applied to
         every screen — same bug, found in this embedded style block, which
         is why the inline-style and Tailwind sweeps missed it. */
      `
        .wcl-shell { max-width: 960px; margin: 0 auto; }

        .wcl-top { margin-bottom: 18px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .wcl-eyebrow { font-size: 11px; letter-spacing: 0.14em; font-weight: 800; color: var(--red); text-transform: uppercase; }
        .wcl-title { font-weight: 800; font-size: 27px; line-height: 1.05; margin-top: 4px; letter-spacing: -0.01em; }
        .wcl-manage-btn { flex: 0 0 auto; border-radius: 9px; padding: 8px 13px; font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer; border: 1.5px solid var(--red); }

        .wcl-sunday { background: #232A31; color: #F2F5F8; font-size: 12.5px; font-weight: 600; padding: 9px 13px; border-radius: 10px; margin-bottom: 14px; }
        .wcl-manage-hint { background: #FEF3C7; border: 1px solid #F59E0B; color: #92400E; font-size: 12px; font-weight: 600; padding: 9px 13px; border-radius: 10px; margin-bottom: 14px; }

        .wcl-toggle { display: flex; background: #E9EDF2; border-radius: 12px; padding: 4px; gap: 4px; margin-bottom: 16px; }
        .wcl-toggle button { flex: 1; border: none; background: transparent; padding: 10px 8px; border-radius: 9px; font-family: inherit; font-size: 13.5px; font-weight: 700; color: var(--muted); cursor: pointer; transition: background .15s, color .15s; }
        .wcl-toggle button.active { background: var(--red); color: #fff; box-shadow: 0 2px 6px rgba(221,0,49,.25); }

        .wcl-spectrum { display: flex; align-items: center; gap: 3px; margin: 14px 0 18px; }
        .wcl-spectrum-seg { flex: 1; height: 8px; border: none; padding: 0; cursor: pointer; border-radius: 4px; opacity: .55; transition: opacity .15s, height .15s; }
        .wcl-spectrum-seg.active { opacity: 1; height: 14px; }

        .wcl-strip { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px; margin-bottom: 16px; scrollbar-width: none; }
        .wcl-strip::-webkit-scrollbar { display: none; }
        .wcl-chip { position: relative; flex: 0 0 auto; min-width: 92px; border: none; border-radius: 13px; padding: 10px 12px; cursor: pointer; text-align: left; font-family: inherit; transition: transform .12s, box-shadow .12s; }
        .wcl-chip.active { transform: translateY(-2px); box-shadow: 0 6px 14px rgba(0,0,0,.16); }
        .wcl-chip-day { font-size: 12.5px; font-weight: 800; letter-spacing: .04em; }
        .wcl-chip-zone { font-size: 10.5px; margin-top: 2px; opacity: .9; font-weight: 600; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 26px; }
        .wcl-chip-prog { font-size: 10px; margin-top: 6px; font-weight: 800; opacity: .9; }
        .wcl-chip-today { position: absolute; top: 9px; right: 9px; width: 6px; height: 6px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 2px var(--red); }

      ` +
      /* The shared raised look — same stack as every tool tile and the setup
         cards. The old shadow here was a single soft blur, which reads as a
         smudge under a rectangle rather than a card with an edge.
         ⚠️ overflow:hidden, AND IT IS THE FIX (Matt, Aug 5 2026: "The cleaning
         list is off layer"). The panel is rounded and bordered; the coloured
         strip is a CHILD with its own corner radius. Without clipping, the
         strip's corners sat outside the parent's rounded border and the two
         layers read as misaligned — which is exactly what "off layer" looks
         like. The strip no longer needs its own radius once the parent clips.
         🐛 AND THE WHITE INSETS ARE GONE. This file carried its own copy of
         the shadow written before cardStyle.js existed, including the two
         inset white lines that were removed there on Aug 4 as "the white
         line" — so every other card in the Hub lost the seam and this one
         kept it. One more reason a second copy of a shared look is a bug
         waiting for somebody to notice. Matched to CARD_3D's values. */
      `
        .wcl-panel { background: radial-gradient(140% 140% at 0% 0%, #FFFFFF 0%, #F7FAFD 38%, #EDF2F8 72%, #E7EDF5 100%); border-radius: 18px; border: 1px solid var(--line); overflow: hidden;
          box-shadow: -7px -7px 10px -4px rgba(200,212,228,.9), 0 0 0 1px rgba(17,24,39,.06), 0 12px 28px -10px rgba(17,24,39,.22); }
        .wcl-panel-edge { height: 5px; }
        .wcl-panel-head { padding: 18px 18px 14px; border-bottom: 1px solid var(--line); }
        .wcl-panel-title-row { display: flex; align-items: baseline; gap: 8px; }
        .wcl-panel-title { font-size: 22px; font-weight: 800; letter-spacing: -0.01em; }
        .wcl-panel-zone { font-size: 12.5px; color: var(--muted); margin-top: 2px; font-weight: 700; }

        .wcl-progress-row { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
        .wcl-progress-track { flex: 1; height: 6px; border-radius: 4px; background: #E9EDF2; overflow: hidden; }
        .wcl-progress-fill { height: 100%; border-radius: 4px; transition: width .25s ease; }
        .wcl-progress-text { display: flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 700; color: var(--muted); white-space: nowrap; }

        .wcl-colhead { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; padding: 10px 18px; font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; background: #FAF7F2; box-shadow: 0 1px 0 var(--line); }
        .wcl-colhead-name { flex: 1; }
        .wcl-colhead-field { width: 76px; text-align: center; }
        .wcl-colhead-field + .wcl-colhead-field { margin-left: 8px; }

        /* ⭐ THE DAYPART IS A BAND NOW, NOT A WORD. Matt, Aug 20 2026: "the AM,
           MID lines etc.. are just too blah. Some color would help break it up."
           They were three characters of tinted text over a white page, so a list
           of thirty tasks read as one undifferentiated column.

           ⚠️ THE COLOUR IS THE DAYPART'S, NOT THE DAY'S, AND THAT IS THE POINT.
           The day already owns this page — the header gradient and the panel
           tint are both its colour — so painting the bands in it too would give
           three identical bars and change nothing. A leader learns amber/teal/
           violet once and then reads the page without reading the words.
           ⚠️ THE THREE HEXES ARE ALREADY IN THIS FILE'S DAY PALETTE (Friday,
           Wednesday, Thursday) rather than three new ones invented here.
           ★ AND THE COUNT MAKES THE BAND INFORMATION RATHER THAN DECORATION —
           "3/4 signed off" for that daypart alone, which is the number a leader
           walking the floor is actually after. */
        .wcl-shift-label { display: flex; align-items: center; gap: 8px; margin: 14px 0 0;
          padding: 7px 18px 7px 0; font-size: 11px; font-weight: 900; letter-spacing: .12em;
          border-radius: 0 8px 8px 0; }
        .wcl-shift-bar { width: 5px; align-self: stretch; flex: 0 0 auto; border-radius: 0 3px 3px 0; }
        .wcl-shift-count { margin-left: auto; font-size: 10.5px; font-weight: 800; letter-spacing: .04em;
          padding: 2px 8px; border-radius: 999px; }

      ` +
      /* ── The task rows ──────────────────────────────────────────────
         Matt, Aug 4 2026: "the blah stuff on the lists needs more detail".
         They were a name, two boxes and a hairline. Three things added, each
         doing a job rather than decorating:

         ⚠️ THE DIVIDER IS A CUT, NOT A DRAWN LINE. A 1px grey rule on white
         reads as pencil. The same rule with a white inset directly under it
         reads as two surfaces meeting, which is the whole trick the setup
         cards use and costs one shadow.

         ★ A STATUS RAIL DOWN THE LEFT, so a leader can scan which tasks are
         done without reading a single name — green fills as each row is
         initialled. That is the detail worth adding: it answers the question
         the screen exists for, from across the kitchen.

         ★ A HOVER, because these rows are tappable and nothing said so. */
      `
        .wcl-row { position: relative; display: flex; align-items: center; padding: 10px 18px 10px 22px;
          gap: 10px; border-top: 1px solid #EEF1F5;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.9);
          transition: background .12s ease; }
        .wcl-row::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
          background: #E7EBF0; transition: background .18s ease; }
        .wcl-row:has(.wcl-check.on)::before { background: #3F8F5F; }
        .wcl-row:hover { background: #FBFCFD; }
        /* A finished row settles back rather than shouting — the eye should go
           to what is still open. */
        .wcl-row:has(.wcl-check.on) { background: #FCFDFC; }
        /* ⚠️ SQUARE-ISH, NOT ROUND. Matt, Aug 20 2026: "Let's make the check
           boxes square ish." A circle reads as a radio button, which is a
           one-of-many control; these are independent tick boxes and every other
           checkbox in the Hub is a rounded square. */
        .wcl-check { width: 19px; height: 19px; border-radius: 6px; border: 1.7px solid #CBD3DC; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; transition: background .15s, border-color .15s; }
        .wcl-check.on { background: #3F8F5F; border-color: #3F8F5F; }
        .wcl-name { flex: 1; font-size: 13.5px; font-weight: 600; transition: color .15s; min-width: 0; }
        .wcl-name.done { color: #9AA4B0; }
        .wcl-fields { display: flex; gap: 8px; flex: 0 0 auto; }
        .sig-box { width: 76px; padding: 7px 6px; font-size: 12.5px; font-weight: 600; text-align: center; border: 1.5px solid #E5E7EB; border-radius: 8px; font-family: inherit; background: #FBFCFE; color: var(--charcoal); }
        .sig-box::placeholder { color: #B7C0CC; }
        .sig-box:focus { outline: none; border-color: var(--red); background: #fff; }
        .sig-box.filled { background: #F0F8F2; border-color: #BFE0CA; font-weight: 800; }
        .sig-wrap { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .sig-cap { font-size: 8.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #9AA4B0; }

        .wcl-loading { padding: 40px 18px; text-align: center; color: var(--muted); font-size: 13px; }
        .wcl-footer-note { text-align: center; font-size: 11px; color: var(--muted); margin-top: 16px; }
        .wcl-flash { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); font-size: 12.5px; font-weight: 700; padding: 9px 16px; border-radius: 20px; opacity: ${flash ? 1 : 0}; transition: opacity .25s; pointer-events: none; box-shadow: 0 8px 20px rgba(0,0,0,.18); }

        @media (max-width: 380px) {
          .sig-box { width: 64px; font-size: 12px; }
          .wcl-colhead-field { width: 64px; }
        }
        /* Wide screens: the six day chips stretch to fill the shell instead of
           scrolling sideways in a strip built for phones. */
        @media (min-width: 760px) {
          .wcl-chip { flex: 1 1 0; }
        }
      `}</style>

      <div className="wcl-shell">
        <div className="wcl-top" style={{ background: `linear-gradient(120deg, ${day.color} 0%, ${day.deep} 55%)`, borderRadius: 14, padding: "16px 18px", marginBottom: 14 }}>
          <div>
            <div className="wcl-eyebrow" style={{ color: "rgba(255,255,255,0.82)" }}>{STORE.appName}</div>
            <div className="wcl-title" style={{ color: "#fff" }}>Daily Cleaning</div>
          </div>
          {canManage && (
          <button className="wcl-manage-btn" onClick={() => { setManage((m) => !m); cancelForm(); }}
            style={{ background: manage ? "#fff" : "rgba(255,255,255,0.16)", color: manage ? day.deep : "#fff", borderColor: "rgba(255,255,255,0.4)" }}>
            {manage ? "✓ Done" : "✎ Manage tasks"}
          </button>
          )}
        </div>

        {/* ★ SEARCH ACROSS EVERY DAY AND BOTH HOUSES (Matt, Aug 3 2026).
            "Which day is DT Handsink on" is the question people actually have,
            and a search that only filtered the day already on screen could not
            answer it. Each hit names its house and day, which is the whole
            point — finding the task matters less than finding WHEN it is. */}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search every task — which day is DT Handsink on?"
          style={{ width: "100%", boxSizing: "border-box", fontSize: 16, padding: "10px 12px",
            border: "1.5px solid #E3E7EC", borderRadius: 10, marginBottom: 12, fontFamily: "inherit" }} />

        {query.trim() && (
          <div style={{ border: "1px solid #E3E7EC", borderRadius: 10, marginBottom: 14, overflow: "hidden" }}>
            {hits.length === 0 ? (
              <div style={{ fontSize: 13, color: "#6B7480", padding: "10px 12px" }}>
                No task matches "{query.trim()}".
              </div>
            ) : hits.map((h, i) => (
              /* Tapping a hit goes to that day — and switches house when the
                 match is in the other one, which is most of the value. */
              <button
                key={`${h.house}-${h.day.key}-${h.key}-${i}`}
                type="button"
                onClick={() => {
                  if (h.house !== house) setHouse(h.house);
                  setDayIndex(DAYS.findIndex((d) => d.key === h.day.key));
                  setQuery("");
                }}
                style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, textAlign: "left",
                  background: "#fff", border: "none", borderTop: i ? "1px solid #F1F3F5" : "none",
                  padding: "9px 12px", cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ fontSize: 13.5, color: "#232A31", flex: 1 }}>{h.name}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: h.day.deep,
                  borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap" }}>
                  {h.house} · {h.day.short}{h.shift ? ` · ${h.shift}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}

        {loadFailed && (
          <div className="wcl-manage-hint" style={{ borderWidth: "1.5px" }}>
            This board did not load fully, so initialing and task edits are off —
            a save now could erase initials that are really stored. Check the
            wifi and refresh the page.
          </div>
        )}
        {!loadFailed && saveWarn && (
          <div className="wcl-manage-hint" style={{ background: "#FEF2F2", borderColor: "#DC2626", color: "#991B1B", borderWidth: "1.5px" }}>
            That change did not save — check the wifi and make it again.
          </div>
        )}

        <div className="wcl-spectrum">
          {DAYS.map((d, i) => (
            <button
              key={d.key}
              className={`wcl-spectrum-seg${i === dayIndex ? " active" : ""}`}
              style={{ background: d.color }}
              onClick={() => { setDayIndex(i); cancelForm(); }}
              aria-label={d.key}
            />
          ))}
        </div>

        {manage ? (
          <div className="wcl-manage-hint">Editing this list — add, rename, or remove tasks. Changes save automatically, sync to the team, and carry across weeks.</div>
        ) : isSunday && (
          <div className="wcl-sunday">Closed today — this week's list is ready for Monday.</div>
        )}

        <div className="wcl-toggle">
          <button className={house === "FOH" ? "active" : ""} onClick={() => { setHouse("FOH"); cancelForm(); }}>Front of House</button>
          <button className={house === "BOH" ? "active" : ""} onClick={() => { setHouse("BOH"); cancelForm(); }}>Back of House</button>
        </div>

        <div className="wcl-strip">
          {DAYS.map((d, i) => {
            const prog = dayProgress(d);
            const active = i === dayIndex;
            const textColor = d.ink === "light" ? "#fff" : "#232A31";
            const isToday = !isSunday && d.key === DAYS[defaultDayIndex].key;
            return (
              <button
                key={d.key}
                className={`wcl-chip${active ? " active" : ""}`}
                style={{ background: active ? d.color : d.tint, color: active ? textColor : "#232A31" }}
                onClick={() => { setDayIndex(i); cancelForm(); }}
              >
                {isToday && <span className="wcl-chip-today" />}
                <div className="wcl-chip-day">{d.short}</div>
                <div className="wcl-chip-zone">{house === "FOH" ? d.foh : d.boh}</div>
                <div className="wcl-chip-prog">{prog ? `${prog.done}/${prog.total}` : "…"}</div>
              </button>
            );
          })}
        </div>

        <div className="wcl-panel">
          <div className="wcl-panel-edge" style={{ background: day.color }} />
          <div className="wcl-panel-head" style={{ background: day.tint }}>
            <div className="wcl-panel-title-row">
              <div className="wcl-panel-title">{day.key}</div>
            </div>
            <div className="wcl-panel-zone">{house === "FOH" ? day.foh : day.boh}</div>
            {!manage && (
              <div className="wcl-progress-row">
                <div className="wcl-progress-track">
                  <div className="wcl-progress-fill" style={{ width: `${pct}%`, background: day.color }} />
                </div>
                <div className="wcl-progress-text" style={doneCount === total && total > 0 ? { color: day.deep } : undefined}>
                  {doneCount === total && total > 0 ? (
                    <>
                      <Check size={12} strokeWidth={3} />
                      All signed off
                    </>
                  ) : (
                    `${doneCount}/${total} signed off`
                  )}
                </div>
              </div>
            )}
          </div>

          {loadingHouse ? (
            <div className="wcl-loading">Loading this week's list…</div>
          ) : manage ? (
            /* MANAGE MODE — add / edit / remove tasks */
            house === "FOH" ? (
              SHIFT_ORDER.map((shift) => {
                const rows = flatTasks.filter((t) => t.shift === shift);
                if (rows.length === 0 && addingShift !== shift) {
                  return (
                    <div key={shift}>
                      {(() => {
                        const inShift = flatTasks.filter((x) => x.shift === shift);
                        const signed = inShift.filter((x) => !!sigOf(x.key).cleaned?.trim()).length;
                        const c = DAYPART_TINT[shift] || DAYPART_TINT.AM;
                        return (
                          <div className="wcl-shift-label" style={{ color: c.deep, background: c.tint }}>
                            <span className="wcl-shift-bar" style={{ background: c.deep }} />
                            {shift}
                            <span className="wcl-shift-count"
                              style={{ color: signed === inShift.length ? "#fff" : c.deep,
                                       background: signed === inShift.length ? c.deep : "rgba(255,255,255,0.75)" }}>
                              {signed}/{inShift.length}
                            </span>
                          </div>
                        );
                      })()}
                      {renderAdd(shift)}
                    </div>
                  );
                }
                return (
                  <div key={shift}>
                    <div className="wcl-shift-label" style={{ color: day.deep }}>{shift}</div>
                    {rows.map((t) => renderManageRow(t))}
                    {renderAdd(shift)}
                  </div>
                );
              })
            ) : (
              <>
                {flatTasks.map((t) => renderManageRow(t))}
                {renderAdd("_BOH")}
              </>
            )
          ) : (
            /* NORMAL MODE — sign-offs */
            <>
              <div className="wcl-colhead" style={{ color: day.deep }}>
                <div className="wcl-colhead-name">Task</div>
                {house === "FOH" && <div className="wcl-colhead-field">Cleaned</div>}
                <div className="wcl-colhead-field">Checked</div>
              </div>

              {house === "FOH" ? (
                SHIFT_ORDER.filter((s) => flatTasks.some((t) => t.shift === s)).map((shift) => (
                  <div key={shift}>
                    <div className="wcl-shift-label" style={{ color: day.deep }}>{shift}</div>
                    {flatTasks.filter((t) => t.shift === shift).map((t) => {
                      const e = sigOf(t.key);
                      const isDone = !!e.cleaned?.trim();
                      return (
                        <div className="wcl-row" key={t.key}>
                          <div className={`wcl-check${isDone ? " on" : ""}`}>
                            {isDone && <Check size={12} color="#fff" strokeWidth={3} />}
                          </div>
                          <div className={`wcl-name${isDone ? " done" : ""}`}>{t.name}</div>
                          <div className="wcl-fields">
                            <label className="sig-wrap">
                              <input
                                className={`sig-box${e.cleaned ? " filled" : ""}`}
                                placeholder="—"
                                value={e.cleaned || ""}
                                onChange={(ev) => updateField(t.key, "cleaned", ev.target.value)}
                                onBlur={persist}
                              />
                              <span className="sig-cap">cleaned</span>
                            </label>
                            <label className="sig-wrap">
                              <input
                                className={`sig-box${e.checked ? " filled" : ""}`}
                                placeholder="—"
                                value={e.checked || ""}
                                onChange={(ev) => updateField(t.key, "checked", ev.target.value)}
                                onBlur={persist}
                              />
                              <span className="sig-cap">checked</span>
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              ) : (
                flatTasks.map((t) => {
                  const e = sigOf(t.key);
                  const isDone = !!e.checked?.trim();
                  return (
                    <div className="wcl-row" key={t.key}>
                      <div className={`wcl-check${isDone ? " on" : ""}`}>
                        {isDone && <Check size={12} color="#fff" strokeWidth={3} />}
                      </div>
                      <div className={`wcl-name${isDone ? " done" : ""}`}>{t.name}</div>
                      <div className="wcl-fields">
                        <input
                          className={`sig-box${e.checked ? " filled" : ""}`}
                          placeholder="—"
                          value={e.checked || ""}
                          onChange={(ev) => updateField(t.key, "checked", ev.target.value)}
                          onBlur={persist}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>

        <div className="wcl-footer-note">Lists are shared with the team and reset automatically each week. Task edits carry across weeks.</div>
      </div>

      <div className="wcl-flash" style={{ background: day.color, color: day.ink === "light" ? "#fff" : "#232A31" }}>Saved</div>
    </div>
  );
}
