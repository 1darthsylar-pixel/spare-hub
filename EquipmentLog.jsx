import { useState, useEffect, useRef } from "react";
/* The one raised look and accent edge, shared with every tool — see cardStyle.js. */
import { CARD_3D, cardSurface, CARD_3D_SOFT, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { saveSubmission, listSubmissions, kvGet, kvSet, hubToken } from "./store";
import { seatForTool } from "./orgSeats.js"; // the submit line names whoever holds the equipment seat
import CatalogImportBox from "./CatalogImportBox.jsx";
import { EQUIPMENT_SPEC } from "./catalogImport.js";
import { STORE } from "./storeConfig.js"; // store name + number on the masthead
const EQUIP_SEAT_FIRST = (((seatForTool("equipment") || {}).holder || "the equipment seat").split(" ")[0]);

// Weekly tier-2+ (Leader and up) reminder flag — set every Monday 6am ET by
// the Worker's scheduled() handler (runEquipmentReminderFlag in worker.js).
// Read directly via kvGet since it's a simple one-time flag, not part of
// the editable-config sync loop the rest of this file uses. The banner
// auto-expires 7 days after it was set, so it naturally clears itself
// before the next Monday reset without needing a dismiss button.
const EQUIP_REMINDER_KEY = "gcfcr-equip-reminder-v1";

// Self-stamp for the Input Health register: written on every submitted
// check so the register can say when the LAST check happened without
// scanning the submissions table. The register reads this, never the tile.
const EQUIP_STAMP_KEY = "gcfcr-equip-stamp-v1";

// ─── Official CFA Equipment List – Gate City FSU #04010 (base seed) ───────────
// This is the starting list. Team edits (add / edit / remove) are layered on top
// via the config below and saved to shared storage, so the base stays intact.
const CATEGORIES = [
  {
    id: "cooking",
    name: "Fryers & Cooking",
    color: "#DC2626",
    emoji: "🔥",
    items: [
      { id: "pf1", name: "Pressure Fryer #1",                  hasTemp: true,  target: "325°F" },
      { id: "pf2", name: "Pressure Fryer #2",                  hasTemp: true,  target: "325°F" },
      { id: "pf3", name: "Pressure Fryer #3",                  hasTemp: true,  target: "325°F" },
      { id: "pf4", name: "Pressure Fryer #4",                  hasTemp: true,  target: "325°F" },
      { id: "pf5", name: "Pressure Fryer #5",                  hasTemp: true,  target: "325°F" },
      { id: "ofs", name: "Open Fryer – Single Vat",            hasTemp: true,  target: "350°F" },
      { id: "ofd", name: "Open Fryer – Double Vat",            hasTemp: true,  target: "350°F" },
      { id: "gdf", name: "Griddle – Flat Top",                 hasTemp: false },
      { id: "gar", name: "Garland Grills",                     hasTemp: false },
      { id: "ovv", name: "Oven – Vector / Lang / Blodgett",    hasTemp: false },
      { id: "ovc", name: "Oven – Convection",                  hasTemp: false },
      { id: "tor", name: "Toaster – Radiant (Breakfast)",      hasTemp: false },
      { id: "tov", name: "Toaster – Vertical Contact (Lunch)", hasTemp: false },
    ],
  },
  {
    id: "holding",
    name: "Holding & Warmers",
    color: "#EA580C",
    emoji: "♨️",
    items: [
      { id: "ch33", name: "Cold Holding Station – 33\" Countertop (Randell CR5035M)", hasTemp: true,  target: "140°F+" },
      { id: "ch40", name: "Cold Holding Station – 40\" Countertop (Randell CR5046M)", hasTemp: true,  target: "140°F+" },
      { id: "chds", name: "Cold Holding Station – Dual Sided Centerline",             hasTemp: true,  target: "140°F+" },
      { id: "chss", name: "Cold Holding Station – Single Sided Centerline",           hasTemp: true,  target: "140°F+" },
      { id: "m42",  name: "Marco 4x2 Countertop (MHG24SA5ZN)",                       hasTemp: true,  target: "140°F+" },
      { id: "m22",  name: "Marco 2x2 Countertop (MHC22SN1.1T)",                      hasTemp: true,  target: "140°F+" },
      { id: "mhs",  name: "Marco Half Size Undercounter (MHC-52)",                    hasTemp: true,  target: "140°F+" },
      { id: "mfs",  name: "Marco Full Size Undercounter (MHC-54)",                    hasTemp: true,  target: "140°F+" },
      { id: "hcib", name: "Holding Cabinet – Ice Bath",                               hasTemp: true,  target: "140°F+" },
      { id: "fws",  name: "Fry Warming Station",                                      hasTemp: false },
      { id: "scw",  name: "Soup – Centerline Well",                                   hasTemp: true,  target: "165°F+" },
      { id: "spr",  name: "Soup – Pitco Rethermalizer",                               hasTemp: true,  target: "165°F+" },
      { id: "scw2", name: "Soup – Countertop Well #CW-100",                           hasTemp: true,  target: "165°F+" },
      { id: "sep",  name: "Soup – Electric Hot Plate",                                hasTemp: true,  target: "165°F+" },
    ],
  },
  {
    id: "breading",
    name: "Breading & Prep",
    color: "#B45309",
    emoji: "🥣",
    items: [
      { id: "btib", name: "Breading Table – Ice Bath", hasTemp: false },
      { id: "btrn", name: "Breading Table – Randell",  hasTemp: false },
      { id: "hbrt", name: "Hobart Mixer",              hasTemp: false },
    ],
  },
  {
    id: "cold",
    name: "Cold Storage",
    color: "#2563EB",
    emoji: "❄️",
    items: [
      { id: "wic",  name: "Walk-In Cooler",                      hasTemp: true, target: "34–38°F" },
      { id: "wif",  name: "Walk-In Freezer",                     hasTemp: true, target: "0–10°F"  },
      { id: "sdet", name: "Single Door Even Thaw",               hasTemp: true, target: "34–40°F" },
      { id: "ddet", name: "Double Door Even Thaw",               hasTemp: true, target: "34–40°F" },
      { id: "fus",  name: "Fridges – Undercounter / Standup",    hasTemp: true, target: "34–38°F" },
      { id: "fcl",  name: "Fridges – Centerline",                hasTemp: true, target: "34–38°F" },
      { id: "frzs", name: "Freezers – Undercounter / Standup",   hasTemp: true, target: "0–10°F"  },
      { id: "ctc",  name: "Chicken Transfer Carts – CT5",        hasTemp: true, target: "34–40°F" },
    ],
  },
  {
    id: "beverage",
    name: "Beverage & Ice",
    color: "#7C3AED",
    emoji: "🥤",
    items: [
      { id: "icm",  name: "Ice Cream Machines",          hasTemp: false },
      { id: "im1",  name: "Ice Machine #1",              hasTemp: false },
      { id: "im2",  name: "Ice Machine #2",              hasTemp: false },
      { id: "imb",  name: "Ice Machine Bins (Not Towers)", hasTemp: false },
      { id: "dtib", name: "Drink Tower Ice Bins",        hasTemp: false },
      { id: "tea",  name: "Tea Brewers",                 hasTemp: false },
      { id: "cof",  name: "Coffee Brewers",              hasTemp: false },
      { id: "cos",  name: "Coffee Server",               hasTemp: false },
      { id: "slb",  name: "Single Lemonade Bubbler",     hasTemp: false },
      { id: "dlb",  name: "Double Lemonade Bubbler",     hasTemp: false },
    ],
  },
  {
    id: "pos",
    name: "Drive-Thru & POS",
    color: "#059669",
    emoji: "🖥️",
    items: [
      { id: "dths", name: "Drive-Thru Headset System",   hasTemp: false },
      { id: "dtd",  name: "Drive-Thru Door (OCB)",       hasTemp: false },
      { id: "fcr",  name: "Front Counter Registers",     hasTemp: false },
      { id: "tab",  name: "Tablets & Card Readers (x6)", hasTemp: false },
    ],
  },
  {
    id: "sanitation",
    name: "Sanitation & Safety",
    color: "#0D9488",
    emoji: "🧼",
    items: [
      { id: "dw",   name: "Dishwasher",                           hasTemp: false },
      { id: "s3c",  name: "3-Compartment Sink",                   hasTemp: false },
      { id: "hws",  name: "Hand Washing Sinks",                   hasTemp: false },
      { id: "san",  name: "Sanitizer Dispensers (All)",           hasTemp: false },
      { id: "eco",  name: "EcoLab Prep-n-Print Flex 2\"",         hasTemp: false },
      { id: "fss",  name: "Fire Suppression System (Visual)",     hasTemp: false },
      { id: "fak",  name: "First Aid Kit Stocked",                hasTemp: false },
      { id: "gtr",  name: "Grease Trap (Visual Check)",           hasTemp: false },
      { id: "fly",  name: "Fly Light System – Drive-Thru",        hasTemp: false },
    ],
  },
];

const SHIFTS = ["Morning", "Evening"];
const CFG_KEY = "gcfcr-equip-config-v1"; // team edits to the equipment list

const STATUS_CONFIG = {
  OK:    { label: "✓ OK",    activeBg: "#15803D", activeBorder: "#166534", activeText: "#fff", rowBg: "#F0FDF4", rowBorder: "#16A34A", inactiveText: "#374151" },
  ISSUE: { label: "⚠ Issue", activeBg: "#B45309", activeBorder: "#92400E", activeText: "#fff", rowBg: "#FFFBEB", rowBorder: "#D97706", inactiveText: "#374151" },
  DOWN:  { label: "✗ Down",  activeBg: "#B91C1C", activeBorder: "#991B1B", activeText: "#fff", rowBg: "#FEF2F2", rowBorder: "#EF4444", inactiveText: "#374151" },
};

// ── Shared storage for the editable equipment list (Worker → localStorage) ──
/* Result-style: ok:false means the WORKER read failed, and the caller must
   refuse writes — this record holds the whole team's list edits, and a save
   off a blank fallback would erase them. localStorage stays as a read-only
   fallback so the list still renders offline; it never makes ok true. */
const cfgGet = async () => {
  const r = await window.storage.getResult(CFG_KEY);
  let v = null;
  if (r.value) { try { v = JSON.parse(r.value); } catch {} }
  if (v == null) { try { const s = localStorage.getItem(CFG_KEY); if (s) v = JSON.parse(s); } catch {} }
  return { ok: r.ok, value: v };
};
/* Returns whether the SHARED write landed. window.storage.set reports a
   refused write by returning false, never by throwing. localStorage is a
   best-effort mirror; it can genuinely throw (quota, private mode). */
const cfgSet = async (v) => {
  const s = JSON.stringify(v);
  const ok = (await window.storage.set(CFG_KEY, s)) !== false;
  try { localStorage.setItem(CFG_KEY, s); } catch {}
  return ok;
};

// ── Resolved flags — mirrors the cfg pattern above ───────────────────────────
// IMPORTANT: resolving NEVER edits or deletes a submitted log. The original
// ISSUE/DOWN entry stays in history forever; this map only records that a
// human dealt with it, and stops the red banner from nagging. If a NEWER log
// flags the same item again, that new flag outranks the resolution and the
// item comes back on its own (compare `clearedAt` to the log's timestamp).
const RES_KEY = "gcfcr-equip-resolved-v1";
const resGet = async () => {
  const r = await window.storage.getResult(RES_KEY);
  let v = null;
  if (r.value) { try { v = JSON.parse(r.value); } catch {} }
  if (v == null) { try { const s = localStorage.getItem(RES_KEY); if (s) v = JSON.parse(s); } catch {} }
  return { ok: r.ok, value: v };
};
const resSet = async (v) => {
  const s = JSON.stringify(v);
  const ok = (await window.storage.set(RES_KEY, s)) !== false;
  try { localStorage.setItem(RES_KEY, s); } catch {}
  return ok;
};

// ── Completion email (Worker /api/tool-notify → Resend → Brandon) ──
const notifyTool = async (payload) => {
  try {
    await fetch("/api/tool-notify", { method: "POST", headers: { "Content-Type": "application/json", "x-hub-token": hubToken() }, body: JSON.stringify(payload) });
  } catch {}
};

const isCustom = (id) => typeof id === "string" && id.startsWith("cust_");

function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return iso; }
}

export default function EquipmentLog({ tier }) {
  const today = new Date().toLocaleDateString("en-CA");
  const [date, setDate]           = useState(today);
  const [shift, setShift]         = useState("Morning");
  const [member, setMember]       = useState("");
  const [checks, setChecks]       = useState({});
  const [temps, setTemps]         = useState({});
  const [notes, setNotes]         = useState({});
  const [genNotes, setGenNotes]   = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitErr, setSubmitErr] = useState(false);
  const [recent, setRecent]       = useState([]);
  const [openLog, setOpenLog]     = useState(null); // a past submission opened for full detail

  // Editable-list state
  const [config, setConfig]       = useState({ added: {}, removed: [], overrides: {} });
  const [manage, setManage]       = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [addingCat, setAddingCat] = useState(null);
  const [form, setForm]           = useState({ name: "", target: "", hasTemp: false });

  // Resolved-flag state
  const [resolved, setResolved]       = useState({});   // { [itemId]: {at,by,note,clearedAt,...} }
  const [resolvingId, setResolvingId] = useState(null);  // item currently showing the note field
  const [resolveNote, setResolveNote] = useState("");
  const [showResolved, setShowResolved] = useState(false);

  // Weekly tier-2+ reminder banner (Team Leader / Assistant Director /
  // Director and up — matches App.jsx's own tier >= 2 gating for this tool).
  const [reminder, setReminder] = useState(null);

  // A cfg/resolved read failed → list edits and resolves refuse until a clean
  // reload (both are whole-team maps; a save off a blank read erases them).
  // saveWarn = a write after a clean load came back false.
  const [loadFailed, setLoadFailed] = useState(false);
  const loadFailedRef = useRef(false);
  const [saveWarn, setSaveWarn] = useState(false);

  useEffect(() => {
    listSubmissions("equipment", 30).then(setRecent);
    cfgGet().then(({ ok, value: c }) => {
      if (!ok) { loadFailedRef.current = true; setLoadFailed(true); }
      if (c) setConfig({ added: c.added || {}, removed: c.removed || [], overrides: c.overrides || {} });
    });
    resGet().then(({ ok, value: r }) => {
      if (!ok) { loadFailedRef.current = true; setLoadFailed(true); }
      if (r) setResolved(r);
    });
    kvGet(EQUIP_REMINDER_KEY).then(r => {
      if (r && r.active && r.since) {
        const since = new Date(r.since + "T00:00:00");
        const ageDays = (Date.now() - since.getTime()) / 86400000;
        if (ageDays >= 0 && ageDays < 7) setReminder(r);
      }
    }).catch(() => {});
  }, []);

  const saveConfig = async (next) => {
    if (loadFailedRef.current) return; // banner explains — a save would erase the team's list edits
    const prev = config;
    setConfig(next);
    if (!(await cfgSet(next))) { setConfig(prev); setSaveWarn(true); return; }
    setSaveWarn(false);
  };

  // Merge base list + team edits into the list that actually renders
  const effectiveCategories = CATEGORIES.map(cat => {
    const baseItems = cat.items
      .filter(it => !config.removed.includes(it.id))
      .map(it => (config.overrides[it.id] ? { ...it, ...config.overrides[it.id] } : it));
    const added = config.added[cat.id] || [];
    return { ...cat, items: [...baseItems, ...added] };
  });

  const effectiveIds = new Set(effectiveCategories.flatMap(c => c.items.map(i => i.id)));
  const totalItems = effectiveIds.size;

  /* Flat, and carrying its category NAME — the import matches on category plus
     name, and an item only knows its category by which array it sits in. */
  const importCurrent = effectiveCategories.flatMap(c => c.items.map(it => ({ ...it, cat: c.name })));

  // Map every known equipment id → display name (for history + flag readouts)
  const itemNameById = {};
  effectiveCategories.forEach(c => c.items.forEach(i => { itemNameById[i.id] = i.name; }));

  // History, newest-first (don't trust the store's order — sort defensively)
  const recentSorted = [...recent].sort(
    (a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0)
  );

  // Currently-flagged equipment: for each item, take its status from the MOST
  // RECENT log that touched it. If that latest status is ISSUE or DOWN, it's
  // still flagged. If a newer log marked it OK, it drops off automatically.
  const currentlyFlagged = (() => {
    const seen = {};
    for (const r of recentSorted) {
      const p = r.payload || {};
      const ch = p.checks || {};
      for (const [id, status] of Object.entries(ch)) {
        if (seen[id]) continue; // already have this item's latest status
        seen[id] = {
          id, status,
          name: itemNameById[id] || id,
          temp: (p.temps || {})[id],
          note: (p.notes || {})[id],
          date: p.date, shift: p.shift,
          when: r.submitted_at, by: r.submitted_by, log: r,
        };
      }
    }
    return Object.values(seen)
      .filter(x => x.status === "ISSUE" || x.status === "DOWN")
      // Drop anything a leader has explicitly resolved — UNLESS the flag we're
      // looking at is newer than the resolution, which means it broke again.
      .filter(x => {
        const r = resolved[x.id];
        if (!r) return true;
        return new Date(x.when || 0) > new Date(r.clearedAt || 0);
      })
      .sort((a, b) => (a.status === "DOWN" ? 0 : 1) - (b.status === "DOWN" ? 0 : 1));
  })();

  // Resolution trail — newest first. Kept separate from the logs themselves so
  // the equipment history stays exactly as it was submitted.
  const resolvedList = Object.entries(resolved)
    .map(([id, r]) => ({ id, ...r, name: r.name || itemNameById[id] || id }))
    .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

  const doResolve = async (f) => {
    if (loadFailedRef.current) return; // banner explains — the resolution trail never loaded
    const next = {
      ...resolved,
      [f.id]: {
        at: new Date().toISOString(),
        by: (member || "").trim() || "team",
        note: resolveNote.trim(),
        clearedAt: f.when || "",
        clearedStatus: f.status,
        name: f.name,
        flagNote: f.note || "",
        flagDate: f.date || "",
        flagShift: f.shift || "",
        logId: f.log?.id || null,
      },
    };
    setResolved(next);
    // The note field only clears once the resolve is really stored — a failed
    // write rolls back and leaves it typed for the retry.
    if (!(await resSet(next))) { setResolved(resolved); setSaveWarn(true); return; }
    setSaveWarn(false);
    setResolvingId(null);
    setResolveNote("");
  };

  const reopenResolved = async (id) => {
    if (loadFailedRef.current) return; // banner explains
    const next = { ...resolved };
    delete next[id];
    setResolved(next);
    if (!(await resSet(next))) { setResolved(resolved); setSaveWarn(true); return; }
    setSaveWarn(false);
  };

  const checkedEntries = Object.entries(checks).filter(([id]) => effectiveIds.has(id));
  const checkedCount = checkedEntries.length;
  const okCount    = checkedEntries.filter(([, s]) => s === "OK").length;
  const issueCount = checkedEntries.filter(([, s]) => s === "ISSUE").length;
  const downCount  = checkedEntries.filter(([, s]) => s === "DOWN").length;
  const pct        = totalItems ? Math.round((checkedCount / totalItems) * 100) : 0;
  const barColor   = downCount > 0 ? "#EF4444" : issueCount > 0 ? "#F59E0B" : "#22C55E";

  const toggleStatus = (id, status) => {
    setChecks(prev => {
      if (prev[id] === status) { const n = { ...prev }; delete n[id]; return n; }
      return { ...prev, [id]: status };
    });
    setSubmitted(false);
  };

  // ── Item management ──
  const startAdd = (catId) => { setAddingCat(catId); setEditingId(null); setForm({ name: "", target: "", hasTemp: false }); };
  const startEdit = (item) => { setEditingId(item.id); setAddingCat(null); setForm({ name: item.name, target: item.target || "", hasTemp: !!item.hasTemp }); };
  const cancelForm = () => { setEditingId(null); setAddingCat(null); setForm({ name: "", target: "", hasTemp: false }); };

  const commitAdd = (catId) => {
    const name = form.name.trim();
    if (!name) return;
    const item = { id: `cust_${Date.now()}`, name, hasTemp: form.hasTemp, ...(form.target.trim() ? { target: form.target.trim() } : {}) };
    const nextAdded = { ...config.added, [catId]: [...(config.added[catId] || []), item] };
    saveConfig({ ...config, added: nextAdded });
    cancelForm();
  };

  const commitEdit = (catId, item) => {
    const name = form.name.trim();
    if (!name) return;
    const fields = { name, hasTemp: form.hasTemp, target: form.target.trim() || undefined };
    if (isCustom(item.id)) {
      const nextAdded = { ...config.added, [catId]: (config.added[catId] || []).map(x => x.id === item.id ? { ...x, ...fields } : x) };
      saveConfig({ ...config, added: nextAdded });
    } else {
      saveConfig({ ...config, overrides: { ...config.overrides, [item.id]: fields } });
    }
    cancelForm();
  };

  /* ── Bulk import from a pasted sheet. See CatalogImportBox.jsx. ──────────
     ⚠️ ONE saveConfig FOR THE WHOLE IMPORT. Calling it per row would fire a
     KV write per item and, worse, each call reads `config` from this render's
     closure — fifty of them would each start from the SAME snapshot and the
     last one would win, so forty-nine rows would silently vanish.
     ⚠️ ONE STAMP PLUS AN INDEX. commitAdd uses `cust_${Date.now()}`, which is
     unique for one tap and not for fifty rows in the same millisecond. A
     collision here would point two machines at one temperature history.
     ⚠️ NOTHING TOUCHES gcfcr-equip-resolved-v1 OR THE SUBMISSIONS TABLE. A
     matched item keeps its id, so every logged temperature and every resolved
     fault still points at the same machine it always did. */
  const applyImport = async ({ add = [], update = [], discontinue = [] }) => {
    const catIdByName = {};
    CATEGORIES.forEach((c) => { catIdByName[c.name.trim().toLowerCase()] = c.id; });
    const stamp = Date.now();
    const nextAdded = { ...config.added };
    const nextOverrides = { ...config.overrides };
    let nextRemoved = [...config.removed];
    let n = 0;

    add.forEach((r, i) => {
      const catId = catIdByName[String(r.cat || "").trim().toLowerCase()];
      if (!catId || !String(r.name || "").trim()) return; // planImport already blocked these; belt and braces
      const item = {
        id: `cust_${stamp}_${i}`,
        name: String(r.name).trim(),
        hasTemp: !!String(r.target || "").trim(),
        ...(String(r.target || "").trim() ? { target: String(r.target).trim() } : {}),
      };
      nextAdded[catId] = [...(nextAdded[catId] || []), item];
      n++;
    });

    update.forEach((u) => {
      const fields = {};
      Object.keys(u.changes).forEach((f) => { fields[f] = u.changes[f].to; });
      if (!Object.keys(fields).length) return;
      if (isCustom(u.id)) {
        Object.keys(nextAdded).forEach((catId) => {
          nextAdded[catId] = (nextAdded[catId] || []).map((x) => (x.id === u.id ? { ...x, ...fields } : x));
        });
      } else {
        // Partial override. Line ~280 spreads it over the base item, so a field
        // the sheet never mentioned keeps its built-in value rather than blanking.
        nextOverrides[u.id] = { ...(nextOverrides[u.id] || {}), ...fields };
      }
      n++;
    });

    discontinue.forEach((d) => {
      if (isCustom(d.id)) {
        Object.keys(nextAdded).forEach((catId) => {
          nextAdded[catId] = (nextAdded[catId] || []).filter((x) => x.id !== d.id);
        });
      } else {
        if (nextRemoved.includes(d.id)) return;
        nextRemoved = [...nextRemoved, d.id];
        delete nextOverrides[d.id];
      }
      n++;
    });

    if (!n) return 0;
    await saveConfig({ added: nextAdded, removed: nextRemoved, overrides: nextOverrides });
    return n;
  };

  const removeItem = (catId, item) => {
    if (isCustom(item.id)) {
      const nextAdded = { ...config.added, [catId]: (config.added[catId] || []).filter(x => x.id !== item.id) };
      saveConfig({ ...config, added: nextAdded });
    } else {
      saveConfig({ ...config, removed: [...config.removed, item.id], overrides: (() => { const o = { ...config.overrides }; delete o[item.id]; return o; })() });
    }
    setChecks(prev => { const n = { ...prev }; delete n[item.id]; return n; });
  };

  const handleSubmit = async () => {
    if (checkedCount === 0) return;
    setSubmitErr(false);
    const saved = await saveSubmission("equipment", member, {
      date, shift, member,
      okCount, issueCount, downCount, checkedCount, totalItems,
      checks, temps, notes, genNotes,
    });
    /* ⚠️ RESULT CHECKED — it used to be discarded. saveSubmission reports a
       refused write by RETURNING FALSE, never by throwing, so a failed save
       still stamped the register, cleared the Monday reminder, emailed
       Brandon "submitted", and showed the green banner — four assertions
       about a log that did not exist, two of them to another human.
       Everything below runs only on a confirmed save. */
    if (!saved) { setSubmitErr(true); return; }
    // Self-stamp for the Input Health register. Fire-and-forget AFTER the
    // submission is safely saved — a failed stamp can never lose a log.
    kvSet(EQUIP_STAMP_KEY, {
      at: new Date().toISOString(),
      iso: date, shift, by: member || "team",
      ok: okCount, issue: issueCount, down: downCount,
    }).catch(() => {});

    /* ★ CLEAR THE REMINDER — the log is done, so stop asking for it.
       This flag is raised by the Monday `equip-reminder-flag` job and, until
       now, NOTHING ever lowered it. It sat `active:true` from Jul 17 to Jul 28
       while the morning digest repeated "Equipment Check Log still needs to be
       completed this week" every single day — including the day AFTER a log
       was submitted. The in-app banner hid the problem: it self-expires after
       7 days, so the only place the stale flag showed was the digest, which
       nobody could trace back to a checkbox nobody was clearing.
       Setting `active:false` (rather than deleting the key) keeps `since` and
       adds `clearedAt`, so it stays auditable and Monday's job simply raises
       it again for the new week. Fire-and-forget: failing to clear a nag must
       never cost someone their submitted log. */
    kvSet(EQUIP_REMINDER_KEY, {
      active: false,
      since: reminder?.since || date,
      clearedAt: new Date().toISOString(),
      clearedBy: member || "team",
    }).catch(() => {});
    setReminder(null);   // and drop the banner on screen, not just in storage
    // Email Brandon a completion summary (recipient lives in worker.js)
    const allItems = effectiveCategories.flatMap(c => c.items);
    const problems = checkedEntries
      .filter(([, s]) => s !== "OK")
      .map(([id, s]) => {
        const item = allItems.find(i => i.id === id);
        return `• [${s}] ${item ? item.name : id}${temps[id] ? ` · ${temps[id]}°F` : ""}${notes[id] ? " — " + notes[id] : ""}`;
      })
      .join("\n");
    notifyTool({
      tool: "equipment",
      subject: `Equipment Check submitted — ${shift} · ${date}${downCount > 0 ? ` · ${downCount} DOWN` : issueCount > 0 ? ` · ${issueCount} issue${issueCount > 1 ? "s" : ""}` : " · all OK"}`,
      text:
        `${member || "A team member"} submitted the ${shift} equipment check for ${date}.\n\n` +
        `✓ ${okCount} OK · ⚠ ${issueCount} issue · ✗ ${downCount} down (${checkedCount}/${totalItems} items logged)\n\n` +
        (problems ? `Flagged equipment:\n${problems}` : "All checked equipment OK.") +
        (genNotes.trim() ? `\n\nShift notes: ${genNotes.trim()}` : "") +
        `\n\nFull log is in the ${STORE.appName}.`,
    });
    setSubmitted(true);
    listSubmissions("equipment", 30).then(setRecent);
  };

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        ::placeholder { color: #6B7280 !important; opacity: 1; }
        @media print {
          .no-print { display: none !important; }
          .sticky-footer { position: static !important; box-shadow: none !important; border-top: 2px solid #D1D5DB !important; }
        }
        input:focus, textarea:focus { outline: 2px solid #DD0031; outline-offset: -1px; }
        button { transition: background 0.12s, border-color 0.12s, color 0.12s; }
      `}</style>

      {/* ⚠️ Bottom padding must CLEAR the fixed footer. 88px was less than the
          footer's real height on an iPhone (12+44+12 plus the ~34px home
          indicator ≈ 102px), so the last equipment row's buttons and °F box
          sat underneath the Submit bar and could not be tapped — Matt's
          screenshots show the row half-buried. Same class as the demo deck's
          covered controls, same fix: safe-area aware clearance. */}
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#F3F4F6", minHeight: "100vh", color: "#111827", paddingBottom: "calc(128px + env(safe-area-inset-bottom))" }}>

        {/* HEADER */}
        <div style={{ background: "linear-gradient(120deg,#E8203F 0%,#A00021 55%)", padding: "14px 18px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "rgba(255,255,255,0.88)", textTransform: "uppercase", marginBottom: 2 }}>
              {STORE.name} FSU · #{STORE.fsr}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              Equipment Check Log
            </div>
          </div>
          <div className="no-print" style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setManage(m => !m); cancelForm(); }}
              style={{ background: manage ? "#fff" : "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.45)", color: manage ? "#DD0031" : "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {manage ? "✓ Done" : "✎ Manage items"}
            </button>
            <button onClick={() => window.print()}
              style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.45)", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              🖨 Print
            </button>
          </div>
        </div>

        {loadFailed && (
          <div className="no-print" style={{ background: "#FFFBEB", border: "1.5px solid #F59E0B", color: "#92400E", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700, margin: "12px 18px 0" }}>
            The equipment list settings did not load, so list edits and resolves
            are off — saving now would erase the team's changes. Checks still
            submit. Check the wifi and refresh the page.
          </div>
        )}
        {!loadFailed && saveWarn && (
          <div className="no-print" style={{ background: "#FEF2F2", border: "1.5px solid #DC2626", color: "#991B1B", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700, margin: "12px 18px 0" }}>
            That change did not save — check the wifi and make it again.
          </div>
        )}

        {/* WEEKLY TIER-2+ REMINDER BANNER — set every Monday 6am ET by the
            Worker (runEquipmentReminderFlag). Visible only to tier >= 2
            (Team Leader / Assistant Director / Director and up), matching
            the same tier gate App.jsx already uses to unlock this tool. */}
        {tier >= 2 && reminder && (
          <div className="no-print" style={{ background: "#FEF3C7", borderBottom: "1px solid #F59E0B", padding: "10px 18px", fontSize: 12.5, fontWeight: 700, color: "#92400E", display: "flex", alignItems: "center", gap: 8 }}>
            <span>⚠</span>
            <span>{reminder.message || "Equipment Check Log needs to be completed this week."}</span>
          </div>
        )}

        {/* CURRENTLY-FLAGGED EQUIPMENT — anything whose most recent check is
            ISSUE or DOWN, pulled from submitted logs. Tap a row to open the
            log it came from, or Resolve to clear it without touching history.
            Also clears itself once a newer log marks the item OK. */}
        {currentlyFlagged.length > 0 && (
          <div className="no-print" style={{ background: "#FEF2F2", borderBottom: "1px solid #EF4444", padding: "11px 18px 12px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#B91C1C", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <span>⚠</span>
              <span>{currentlyFlagged.length} equipment item{currentlyFlagged.length > 1 ? "s" : ""} currently flagged</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {currentlyFlagged.map(f => {
                const isDown = f.status === "DOWN";
                const c = isDown ? "#B91C1C" : "#B45309";
                const resolving = resolvingId === f.id;
                return (
                  <div key={f.id}>
                  <div onClick={() => setOpenLog(f.log)} style={{
                    display: "flex", alignItems: "center", gap: 9, cursor: "pointer",
                    background: cardSurface(c), border: `1px solid ${c}33`, borderLeft: `3px solid ${c}`, borderTop: `3px solid ${c}`, boxShadow: CARD_3D,
                    borderRadius: resolving ? "8px 8px 0 0" : 8, padding: "7px 10px",
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: c, borderRadius: 5, padding: "3px 7px", flexShrink: 0, letterSpacing: "0.03em" }}>
                      {isDown ? "✗ DOWN" : "⚠ ISSUE"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#111827", lineHeight: 1.25 }}>
                        {f.name}{f.temp ? <span style={{ fontFamily: "monospace", fontWeight: 600, color: c, marginLeft: 6 }}>{f.temp}°F</span> : null}
                      </div>
                      {f.note && <div style={{ fontSize: 11, color: "#4B5563", lineHeight: 1.3, marginTop: 1 }}>{f.note}</div>}
                      <div style={{ fontSize: 10.5, color: "#9CA3AF", marginTop: 1 }}>last logged {f.shift || ""} · {f.date || ""} · {f.by || "team"}</div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setResolveNote(""); setResolvingId(resolving ? null : f.id); }}
                      style={{ flexShrink: 0, background: resolving ? "#15803D" : "#F0FDF4", border: "1px solid #16A34A",
                               color: resolving ? "#fff" : "#15803D", borderRadius: 6, padding: "5px 9px",
                               fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                    >
                      {resolving ? "Cancel" : "✓ Resolve"}
                    </button>
                    <span style={{ fontSize: 15, color: c, flexShrink: 0 }}>›</span>
                  </div>

                  {/* Resolve editor — the note is optional, but it is what turns
                      "the banner went away" into a record someone can read later. */}
                  {resolving && (
                    <div style={{ background: "#F0FDF4", border: "1px solid #16A34A", borderTop: "none",
                                  borderRadius: "0 0 8px 8px", padding: "9px 10px", display: "flex", flexDirection: "column", gap: 7 }}>
                      <input
                        type="text" autoFocus value={resolveNote}
                        onChange={(e) => setResolveNote(e.target.value)}
                        placeholder="What was done? (optional — e.g. gasket replaced, tech visit 7/22)"
                        style={{ width: "100%", background: "#fff", border: "1.5px solid #16A34A", color: "#111827",
                                 borderRadius: 6, padding: "7px 10px", fontSize: 12, fontWeight: 500, fontFamily: "inherit" }}
                      />
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <button
                          onClick={() => doResolve(f)}
                          style={{ background: "#15803D", border: "none", color: "#fff", borderRadius: 6,
                                   padding: "7px 13px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          Mark resolved
                        </button>
                        <span style={{ fontSize: 10.5, color: "#4B5563", lineHeight: 1.3 }}>
                          Recorded as {(member || "").trim() || "team"} · the {f.status === "DOWN" ? "DOWN" : "ISSUE"} log stays in history.
                        </span>
                      </div>
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* RESOLUTION TRAIL — the "I still want the history" half. Collapsed by
            default so it never competes with the live flags. */}
        {resolvedList.length > 0 && (
          <div className="no-print" style={{ background: "#F7FDF9", borderBottom: "1px solid #BBF7D0", padding: "9px 18px 10px" }}>
            <div
              onClick={() => setShowResolved(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                       fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#15803D" }}
            >
              <span>✓</span>
              <span>{resolvedList.length} resolved</span>
              <span style={{ marginLeft: "auto", fontSize: 13 }}>{showResolved ? "⌃" : "⌄"}</span>
            </div>
            {showResolved && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {resolvedList.map(r => {
                  const log = recentSorted.find(x => x.id === r.logId);
                  return (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 9,
                      background: "#fff", border: "1px solid #BBF7D0", borderLeft: "3px solid #16A34A", borderTop: "3px solid #16A34A",
                      borderRadius: 8, padding: "7px 10px" }}>
                      <div style={{ flex: 1, minWidth: 0, cursor: log ? "pointer" : "default" }} onClick={() => log && setOpenLog(log)}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#111827", lineHeight: 1.25 }}>
                          {r.name}
                          <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: r.clearedStatus === "DOWN" ? "#B91C1C" : "#B45309",
                                         borderRadius: 5, padding: "2px 6px", marginLeft: 7 }}>
                            was {r.clearedStatus === "DOWN" ? "DOWN" : "ISSUE"}
                          </span>
                        </div>
                        {r.flagNote && <div style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.3, marginTop: 1 }}>flagged: {r.flagNote}</div>}
                        {r.note && <div style={{ fontSize: 11, color: "#15803D", fontWeight: 600, lineHeight: 1.3, marginTop: 1 }}>fixed: {r.note}</div>}
                        <div style={{ fontSize: 10.5, color: "#9CA3AF", marginTop: 1 }}>
                          resolved by {r.by || "team"} · {(r.at || "").slice(0, 10)}
                          {r.flagDate ? ` · flagged ${r.flagShift || ""} ${r.flagDate}` : ""}
                        </div>
                      </div>
                      <button
                        onClick={() => reopenResolved(r.id)}
                        style={{ flexShrink: 0, background: "#fff", border: "1px solid #D1D5DB", color: "#6B7280",
                                 borderRadius: 6, padding: "5px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        Re-open
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {manage && (
          <div className="no-print" style={{ background: "#FEF3C7", borderBottom: "1px solid #F59E0B", padding: "9px 18px", fontSize: 12, fontWeight: 600, color: "#92400E" }}>
            Managing the equipment list — add, edit, or remove items. Changes save automatically and sync to the team.
          </div>
        )}

        {manage && (
          <div className="no-print" style={{ padding: "12px 18px 0" }}>
            <CatalogImportBox
              current={importCurrent}
              spec={EQUIPMENT_SPEC}
              want={["name", "cat", "target"]}
              allowedCats={CATEGORIES.map((c) => c.name)}
              onApply={applyImport}
              title="Import your equipment list"
              /* ⚠️ See the note on the same prop in SupplyCentral.jsx — the
                 wording lives with the tile that owns the data. */
              steps={[
                "Open the equipment list you were given, from corp, from your vendor, or your own spreadsheet.",
                "Save or export it as CSV. A PDF works too. If it is in Excel, choose File, Save As, CSV.",
                "Drop that file on the box below, or press Choose a file. You can also paste the rows straight in.",
              ]}
              hint="Equipment you already have is matched and left alone. Service history, faults and logged temperatures are never touched."
            />
          </div>
        )}

        {/* SHIFT INFO */}
        <div style={{ background: "#fff", borderBottom: "1px solid #D1D5DB", padding: "14px 18px", display: "flex", flexWrap: "wrap", gap: 12 }}>
          {/* ⚠️ minWidth: 0 + appearance: none. An iOS date input keeps its
              intrinsic width regardless of width:100%, and a flex cell's
              default min-width:auto refuses to shrink below it — so the date
              box spilled under the Morning chip on phone widths (visible in
              Matt's Jul 31 screenshots). appearance:none makes Safari treat
              it like a text box; the tap still opens the native picker. */}
          <div style={{ flex: "1 1 130px", minWidth: 0 }}>
            <div style={labelStyle}>Date</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputStyle, minWidth: 0, WebkitAppearance: "none", appearance: "none" }} />
          </div>
          <div style={{ flex: "1 1 210px", minWidth: 0 }}>
            <div style={labelStyle}>Checklist</div>
            <div style={{ display: "flex", gap: 6 }}>
              {SHIFTS.map(s => (
                <button key={s} onClick={() => setShift(s)} style={{
                  flex: 1, padding: "7px 4px", fontSize: 12, fontWeight: 700, borderRadius: 6,
                  border: shift === s ? "1.5px solid #DD0031" : "1.5px solid #9CA3AF",
                  background: shift === s ? "#DD0031" : "#fff",
                  color: shift === s ? "#fff" : "#374151", cursor: "pointer",
                }}>{s}</button>
              ))}
            </div>
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <div style={labelStyle}>Team Member</div>
            <input type="text" placeholder="Name or initials" value={member} onChange={e => setMember(e.target.value)} style={inputStyle} />
          </div>
        </div>

        {/* PROGRESS */}
        <div style={{ background: "#fff", borderBottom: "1px solid #D1D5DB", padding: "10px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{checkedCount} of {totalItems} items logged</span>
            <div style={{ display: "flex", gap: 14, fontSize: 12, fontWeight: 700 }}>
              <span style={{ color: "#15803D" }}>✓ {okCount} OK</span>
              <span style={{ color: "#B45309" }}>⚠ {issueCount} Issue</span>
              <span style={{ color: "#B91C1C" }}>✗ {downCount} Down</span>
            </div>
          </div>
          <div style={{ height: 6, background: "#E5E7EB", borderRadius: 999 }}>
            <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 999, transition: "width 0.35s ease, background 0.3s" }} />
          </div>
        </div>

        {/* EQUIPMENT SECTIONS */}
        <div style={{ padding: "14px 14px 10px" }}>
          {effectiveCategories.map(cat => {
            const catChecked = cat.items.filter(i => checks[i.id]).length;
            const allDone = cat.items.length > 0 && catChecked === cat.items.length;
            return (
              <div key={cat.id} style={{ marginBottom: 14, background: cardSurface(), borderRadius: 12, ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D, overflow: "hidden", border: "1px solid #D1D5DB", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
                <div style={{ background: cat.color + "14", borderBottom: `2px solid ${cat.color}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{cat.emoji}</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: cat.color, letterSpacing: "0.06em", textTransform: "uppercase" }}>{cat.name}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: allDone ? "#15803D" : "#4B5563" }}>
                    {catChecked}/{cat.items.length}
                  </span>
                </div>

                {cat.items.map((item, idx) => {
                  const status = checks[item.id];
                  const cfg    = status ? STATUS_CONFIG[status] : null;
                  const editing = editingId === item.id;
                  return (
                    <div key={item.id} style={{
                      padding: "10px 14px",
                      borderBottom: idx < cat.items.length - 1 ? "1px solid #E5E7EB" : "none",
                      background: editing ? "#F9FAFB" : (cfg ? cfg.rowBg : "#fff"),
                      borderLeft: cfg ? `4px solid ${cfg.rowBorder}` : "4px solid transparent",
                      transition: "background 0.2s, border-left-color 0.2s",
                    }}>
                      {editing ? (
                        <ItemForm form={form} setForm={setForm} color={cat.color}
                          onSave={() => commitEdit(cat.id, item)} onCancel={cancelForm} saveLabel="Save changes" />
                      ) : (
                        <>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <div style={{ flex: "1 1 140px", fontSize: 13, fontWeight: 600, color: "#111827", lineHeight: 1.3 }}>
                              {item.name}
                              {item.target && <span style={{ fontSize: 11, fontWeight: 500, color: "#4B5563", marginLeft: 6 }}>({item.target})</span>}
                            </div>
                            {item.hasTemp && (
                              <input type="text" placeholder="°F"
                                value={temps[item.id] || ""}
                                onChange={e => { const v = e.target.value; setTemps(p => ({ ...p, [item.id]: v })); }}
                                style={{ width: 62, background: "#F9FAFB", border: "1.5px solid #9CA3AF", color: "#111827", borderRadius: 6, padding: "6px 8px", fontSize: 13, textAlign: "center", fontFamily: "monospace", fontWeight: 600, flexShrink: 0 }}
                              />
                            )}
                            <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                              {Object.entries(STATUS_CONFIG).map(([key, c]) => {
                                const active = status === key;
                                return (
                                  <button key={key} onClick={() => toggleStatus(item.id, key)} style={{
                                    padding: "6px 11px", fontSize: 11, fontWeight: 700, borderRadius: 7, minWidth: 52,
                                    border: active ? `1.5px solid ${c.activeBorder}` : "1.5px solid #9CA3AF",
                                    background: active ? c.activeBg : "#F3F4F6",
                                    color: active ? c.activeText : c.inactiveText,
                                    cursor: "pointer", letterSpacing: "0.02em",
                                  }}>{c.label}</button>
                                );
                              })}
                            </div>
                          </div>
                          {(status === "ISSUE" || status === "DOWN") && (
                            <div style={{ marginTop: 8 }}>
                              <input type="text" placeholder="Describe issue / action taken…"
                                value={notes[item.id] || ""}
                                onChange={e => { const v = e.target.value; setNotes(p => ({ ...p, [item.id]: v })); }}
                                style={{ width: "100%", background: "#fff", border: `1.5px solid ${STATUS_CONFIG[status].activeBorder}`, color: "#111827", borderRadius: 6, padding: "7px 10px", fontSize: 12, fontWeight: 500 }}
                              />
                            </div>
                          )}
                          {manage && (
                            <div className="no-print" style={{ marginTop: 8, display: "flex", gap: 8 }}>
                              <button onClick={() => startEdit(item)}
                                style={{ background: "#EEF2FF", border: "1px solid #C7D2FE", color: "#4338CA", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                ✎ Edit
                              </button>
                              <button onClick={() => removeItem(cat.id, item)}
                                style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                ✕ Remove
                              </button>
                              {isCustom(item.id) && <span style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", alignSelf: "center", letterSpacing: "0.05em" }}>ADDED</span>}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}

                {manage && (
                  <div className="no-print" style={{ padding: "10px 14px", borderTop: "1px dashed #D1D5DB", background: "#FAFAFA" }}>
                    {addingCat === cat.id ? (
                      <ItemForm form={form} setForm={setForm} color={cat.color}
                        onSave={() => commitAdd(cat.id)} onCancel={cancelForm} saveLabel="Add item" />
                    ) : (
                      <button onClick={() => startAdd(cat.id)}
                        style={{ background: "#fff", border: `1.5px dashed ${cat.color}`, color: cat.color, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", width: "100%" }}>
                        + Add item to {cat.name}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ background: cardSurface(), borderRadius: 12, ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D, border: "1px solid #D1D5DB", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", padding: "14px 16px" }}>
            <div style={labelStyle}>General Shift Notes</div>
            <textarea placeholder="Additional observations, escalations, or follow-up items…" rows={3}
              value={genNotes} onChange={e => setGenNotes(e.target.value)}
              style={{ width: "100%", background: "#F9FAFB", border: "1.5px solid #9CA3AF", color: "#111827", borderRadius: 8, padding: "10px 12px", fontSize: 13, fontWeight: 500, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>

          {/* RECENT SUBMITTED LOGS (shared across team) */}
          {recent.length > 0 && (
            <div style={{ marginTop: 14, background: cardSurface(), borderRadius: 12, boxShadow: CARD_3D, border: "1px solid #D1D5DB", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", padding: "14px 16px" }}>
              <div style={labelStyle}>Recent Submitted Logs</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {recentSorted.map((r, i) => {
                  const p = r.payload || {};
                  const down = p.downCount || 0;
                  const issue = p.issueCount || 0;
                  const flagColor = down > 0 ? "#B91C1C" : issue > 0 ? "#B45309" : "#15803D";
                  return (
                    <div key={r.id || i} onClick={() => setOpenLog(r)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "#F9FAFB", borderRadius: 8, borderLeft: `3px solid ${flagColor}`, borderTop: `3px solid ${flagColor}`, cursor: "pointer" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                          {p.shift || "Shift"} · {p.date || ""}
                        </div>
                        <div style={{ fontSize: 11, color: "#6B7280" }}>
                          {r.submitted_by || "Team Member"} · {fmtWhen(r.submitted_at)}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, textAlign: "right", color: flagColor }}>
                        {down > 0 && <div>✗ {down} down</div>}
                        {issue > 0 && <div>⚠ {issue} issue{issue > 1 ? "s" : ""}</div>}
                        {down === 0 && issue === 0 && <div>✓ all OK</div>}
                      </div>
                      <span style={{ fontSize: 16, color: "#9CA3AF", flexShrink: 0 }}>›</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* STICKY FOOTER */}
        <div className="sticky-footer" style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          background: "#fff", borderTop: "1px solid #D1D5DB",
          boxShadow: "0 -4px 12px rgba(0,0,0,0.09)",
          // Bottom pad rides the home indicator so Submit is never under it.
          padding: "12px 18px calc(12px + env(safe-area-inset-bottom))", display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            {submitted ? (
              <div style={{ color: "#15803D", fontWeight: 700, fontSize: 13 }}>
                ✓ Log submitted & emailed to {EQUIP_SEAT_FIRST} — {shift} · {member || "Team Member"} · {date}
              </div>
            ) : submitErr ? (
              <div style={{ color: "#B91C1C", fontWeight: 700, fontSize: 13 }}>
                ✗ That did not save — your checks are still on screen. Check the wifi and press Submit again.
              </div>
            ) : (
              <div style={{ color: "#374151", fontWeight: 500, fontSize: 12 }}>
                {checkedCount === 0 ? "Start checking equipment above" : `${pct}% complete · ${totalItems - checkedCount} items remaining`}
              </div>
            )}
          </div>
          {(issueCount > 0 || downCount > 0) && !submitted && (
            <div style={{ fontSize: 11, fontWeight: 700, textAlign: "right", lineHeight: 1.6 }}>
              {downCount > 0  && <div style={{ color: "#B91C1C" }}>⚠ {downCount} DOWN – escalate now</div>}
              {issueCount > 0 && <div style={{ color: "#B45309" }}>⚠ {issueCount} issue{issueCount > 1 ? "s" : ""} flagged</div>}
            </div>
          )}
          <button onClick={handleSubmit} disabled={checkedCount === 0}
            style={{
              background: checkedCount > 0 ? "#DD0031" : "#E5E7EB", border: "none",
              color: checkedCount > 0 ? "#fff" : "#6B7280",
              borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700,
              cursor: checkedCount > 0 ? "pointer" : "not-allowed", letterSpacing: "0.02em", flexShrink: 0,
            }}>
            {checkedCount === totalItems && totalItems > 0 ? "✓ Submit Log" : `Submit (${checkedCount}/${totalItems})`}
          </button>
        </div>
      </div>

      {/* PAST-LOG DETAIL — opens when a history row or flagged item is tapped */}
      {openLog && (() => {
        const p = openLog.payload || {};
        const ch = p.checks || {};
        const entries = Object.entries(ch);
        const rank = { DOWN: 0, ISSUE: 1, OK: 2 };
        const sorted = [...entries].sort((a, b) => (rank[a[1]] ?? 3) - (rank[b[1]] ?? 3));
        const pill = { OK: "#15803D", ISSUE: "#B45309", DOWN: "#B91C1C" };
        const lbl  = { OK: "✓ OK", ISSUE: "⚠ Issue", DOWN: "✗ Down" };
        return (
          <div className="no-print" onClick={() => setOpenLog(null)} style={{
            position: "fixed", inset: 0, background: "rgba(17,24,39,0.55)", zIndex: 1000,
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: "#fff", width: "100%", maxWidth: 560, maxHeight: "88vh", overflowY: "auto",
              borderRadius: "16px 16px 0 0", boxShadow: "0 -8px 30px rgba(0,0,0,0.25)",
            }}>
              <div style={{ position: "sticky", top: 0, background: "#DD0031", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{p.shift || "Shift"} · {p.date || ""}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", marginTop: 1 }}>
                    {openLog.submitted_by || "Team Member"} · {fmtWhen(openLog.submitted_at)}
                  </div>
                </div>
                <button onClick={() => setOpenLog(null)} style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.45)", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>✕ Close</button>
              </div>

              <div style={{ display: "flex", gap: 14, padding: "12px 18px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB", fontSize: 12, fontWeight: 700 }}>
                <span style={{ color: "#15803D" }}>✓ {p.okCount || 0} OK</span>
                <span style={{ color: "#B45309" }}>⚠ {p.issueCount || 0} Issue</span>
                <span style={{ color: "#B91C1C" }}>✗ {p.downCount || 0} Down</span>
                <span style={{ color: "#6B7280", marginLeft: "auto" }}>{p.checkedCount || entries.length}/{p.totalItems || entries.length} logged</span>
              </div>

              <div style={{ padding: "10px 14px 20px" }}>
                {sorted.length === 0 && <div style={{ fontSize: 13, color: "#6B7280", padding: "10px 4px" }}>No item-level detail saved on this log.</div>}
                {sorted.map(([id, status]) => {
                  const c = pill[status] || "#6B7280";
                  const temp = (p.temps || {})[id];
                  const note = (p.notes || {})[id];
                  return (
                    <div key={id} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "9px 8px", borderBottom: "1px solid #F3F4F6" }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: c, borderRadius: 5, padding: "3px 7px", flexShrink: 0, minWidth: 58, textAlign: "center" }}>{lbl[status] || status}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", lineHeight: 1.3 }}>
                          {itemNameById[id] || id}
                          {temp ? <span style={{ fontFamily: "monospace", fontWeight: 700, color: c, marginLeft: 6 }}>{temp}°F</span> : null}
                        </div>
                        {note && <div style={{ fontSize: 12, color: "#4B5563", marginTop: 2, lineHeight: 1.35 }}>{note}</div>}
                      </div>
                    </div>
                  );
                })}
                {p.genNotes && p.genNotes.trim() && (
                  <div style={{ marginTop: 12, background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ ...labelStyle, marginBottom: 4 }}>Shift Notes</div>
                    <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.4 }}>{p.genNotes}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}

// Inline add/edit form for an equipment item
function ItemForm({ form, setForm, color, onSave, onCancel, saveLabel }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input type="text" autoFocus placeholder="Equipment name" value={form.name}
        onChange={e => { const v = e.target.value; setForm(f => ({ ...f, name: v })); }}
        style={{ width: "100%", background: "#fff", border: "1.5px solid #9CA3AF", color: "#111827", borderRadius: 6, padding: "8px 10px", fontSize: 13, fontWeight: 600 }} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer" }}>
          <input type="checkbox" checked={form.hasTemp} onChange={e => { const v = e.target.checked; setForm(f => ({ ...f, hasTemp: v })); }} />
          Logs a temperature
        </label>
        {form.hasTemp && (
          <input type="text" placeholder="Target (e.g. 34–38°F)" value={form.target}
            onChange={e => { const v = e.target.value; setForm(f => ({ ...f, target: v })); }}
            style={{ flex: "1 1 140px", background: "#fff", border: "1.5px solid #9CA3AF", color: "#111827", borderRadius: 6, padding: "7px 10px", fontSize: 12, fontWeight: 500 }} />
        )}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel}
          style={{ background: "#fff", border: "1px solid #D1D5DB", color: "#6B7280", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          Cancel
        </button>
        <button onClick={onSave}
          style={{ background: color, border: "none", color: "#fff", borderRadius: 6, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 10, fontWeight: 700, color: "#374151", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 5 };
const inputStyle = { width: "100%", background: "#F9FAFB", border: "1.5px solid #9CA3AF", color: "#111827", borderRadius: 7, padding: "8px 10px", fontSize: 13, fontWeight: 500, boxSizing: "border-box" };
