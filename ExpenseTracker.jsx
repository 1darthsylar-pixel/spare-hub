/* ============================================================================
   ExpenseTracker.jsx — Gate City Hub

   REBUILT Jul 31 2026 to Cindy's spec (she is Accounts Payable and the one
   who actually records these): an ENTRY LEDGER, not a day grid.

     1. "Adding TBR's and PM maintenance" — both are categories now
        (expenseDefaults.js), and the list stays editable in Manage.
     2. "No where to add the name of the company" — every entry carries one.
     3. "I don't need a daily cost breakdown … a place to enter the date paid
        or invoice date would suffice" — one line per payment: date, company,
        category, amount, optional note / invoice #.
     4. "Reoccurring monthly expenses could transfer over" — any entry can be
        marked repeats-monthly; each month starts with those as WAITING rows
        that count nothing until she records the payment with a real date.
        Seeded from her own "*Recurring Expenses FYI" block in the FCR
        Workbook (company + category only — amounts deliberately blank, so a
        stale figure can never become a payment).

   Company suggestions come from the "Key / Recurring Amounts" column of her
   workbook tab (VENDOR_HINTS) plus whatever has been typed this month.

   Storage:
     gcfcr-expenses-[YYYY-MM]-v2   { version:2, month, entries:[{ id, date,
                                     company, cat, amount, note, recurId? }] }
     gcfcr-expenses-recurring-v1   { version:1, items:[{ id, company, cat, note,
                                     every?, anchor? }] }  (absent every = monthly,
                                     so every record written before Aug 1 2026
                                     behaves exactly as it always has)
     gcfcr-expenses-cats-v1        { version:2, cats:[{ id, name, group }] }
                                     (a version-1 record gets the Aug 1 2026
                                      four-category merge ONCE on load, then
                                      saves as version 2 — so a category Cindy
                                      removes by hand afterward stays removed)

   ⚠️ OLD MONTHS ARE NOT MIGRATED. A month that has v1 day-grid data and no v2
   ledger renders as a READ-ONLY legacy summary — the stored record is never
   rewritten. Months with no v1 data (August 2026 onward, and any empty past
   month) use the ledger. Nothing outside this file reads either key.
   ============================================================================ */

import React, { useEffect, useMemo, useRef, useState } from "react";
/* The shared raised look and accent edge — see cardStyle.js. */
import { CARD_3D, cardSurface, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { hubToken, kvSet, kvGetResult } from "./store";
import MonthYearPicker from "./MonthYearPicker.jsx";
import { DEFAULT_EXPENSE_CATEGORIES, EXPENSE_GROUPS } from "./expenseDefaults.js";
/* The monthly RPIS report path — parsing, matching and entry-building all live
   in that leaf module so they can be driven without React. See its header for
   why a suggestion is never applied on its own. */
import {
  parseReport, planImport, entriesFrom, replaceImported, importSummary, mapFrom,
  importedCount, CATMAP_KEY, SKIP,
} from "./expenseImport.js";

/* The supplier roster now comes from the Worker — see expenseVendorData.js. It
   shipped in this bundle until Aug 8 2026. Returns empty on ANY failure, and
   every caller treats empty as "no hint to offer", never as "no vendors". */
async function fetchVendorData() {
  try {
    const r = await fetch("/api/expense-vendors", { headers: { "x-hub-token": hubToken() } });
    const d = await r.json().catch(() => null);
    if (!d || !d.ok) return { vendors: {}, recurring: [] };
    return { vendors: d.vendors || {}, recurring: Array.isArray(d.recurring) ? d.recurring : [] };
  } catch { return { vendors: {}, recurring: [] }; }
}

const NAVY = "#1B3A5C", RED = "#DD0031", INK = "#232A31", GRAY = "#6B7480",
      LINE = "#E3E7EC", BG = "#F6F8FA", GREEN = "#166B4A", AMBER = "#7A5A00";

const CATS_KEY = "gcfcr-expenses-cats-v1";
const RECUR_KEY = "gcfcr-expenses-recurring-v1";
/* Matt, Aug 1 2026: these four must exist in the LIVE dropdown, not just the
   defaults — the saved list replaces the defaults wholesale on load, and it
   predates them (that is why the Jul 31 "TBR and PM maintenance are categories
   now" note never reached the screen). A version-1 saved list gets exactly
   these appended once; the record then saves as version 2 and is never
   merged again, so a deliberate removal sticks. */
const REQUIRED_CAT_IDS = ["building-repair", "pm-building", "pm-equipment", "tbr"];
const legacyKey = (ym) => `gcfcr-expenses-${ym}-v1`;
const ledgerKey = (ym) => `gcfcr-expenses-${ym}-v2`;

/* ---------------- date helpers ---------------- */
const pad = (n) => String(n).padStart(2, "0");
const ymOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const shiftMonth = (ym, delta) => {
  const [y, m] = ym.split("-").map(Number);
  return ymOf(new Date(y, m - 1 + delta, 1));
};
const monthLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};
const prettyDate = (iso) => {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y) return iso || "";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/* ---------------- money ---------------- */
const fmt$ = (v) => (Number(v) || 0).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cleanAmt = (raw) => raw.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
const uid = () => `e_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
const mkId = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || uid();
const norm = (s) => (s || "").trim().toLowerCase();

/* ---------------- repeat cadences (Matt, Aug 1 2026) ----------------
   An item with no `every` is monthly. `anchor` is the month the cadence was
   set (or hand-picked in the manager); a repeat is due whenever a whole
   number of cycles separates the anchor from the viewed month.
   ⚠️ "Weekly" (Cindy, Aug 1 2026) is deliberately a MONTHLY reminder — cycle 1,
   the same as Monthly — because this ledger holds one row per month, not per
   week. A weekly-billed vendor (Cintas) is certainly due every month; the label
   just records the real cadence so she knows why it recurs. Do NOT give it a
   sub-month cycle: repeatDueIn counts whole months and there is no week axis. */
const CADENCES = [
  ["monthly", "Monthly", 1],
  ["weekly", "Weekly", 1],
  ["quarterly", "Quarterly", 3],
  ["semiannual", "Semi Annual", 6],
  ["annual", "Annually", 12],
];
const cadenceOf = (every) => CADENCES.find(([k]) => k === every) || CADENCES[0];
const repeatDueIn = (t, ym) => {
  const n = cadenceOf(t.every)[2];
  if (n === 1) return true;
  const [ay, am] = (t.anchor || ym).split("-").map(Number);
  const [by, bm] = ym.split("-").map(Number);
  const d = (by - ay) * 12 + (bm - am);
  return ((d % n) + n) % n === 0;
};
/* Anchor options for a repeat's "due" month (Cindy/Matt, Aug 1 2026): a year
   back — so a repeat whose month is already saved stays in the list — THROUGH
   December of next year, so she can schedule the rest of this year and all of
   next. Rolls forward on its own each year, so it never needs hand-editing.
   Compared as "YYYY-MM" strings, which sort right because the month is
   zero-padded; the length cap is a never-reached belt-and-suspenders stop. */
const anchorChoices = (ym) => {
  const end = `${Number(ym.split("-")[0]) + 1}-12`;   // December of next year
  const out = [];
  for (let cur = shiftMonth(ym, -12); cur <= end && out.length < 60; cur = shiftMonth(cur, 1)) out.push(cur);
  return out;
};

const emptyForm = (ym) => ({
  date: ym === ymOf(new Date()) ? todayISO() : `${ym}-01`,
  company: "", cat: "", amount: "", note: "", repeat: false, recurId: null,
});

export default function ExpenseTracker() {
  const [ym, setYm] = useState(ymOf(new Date()));
  const [cats, setCats] = useState(DEFAULT_EXPENSE_CATEGORIES);
  const [ledger, setLedger] = useState({ version: 2, month: ym, entries: [] });
  const [legacy, setLegacy] = useState(null);          // v1 record when this month predates the ledger
  const [recurring, setRecurring] = useState({ version: 1, items: [] });
  const [manage, setManage] = useState(false);         // category manager open
  const [manageReps, setManageReps] = useState(false); // repeats manager open
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatGroup, setNewCatGroup] = useState(EXPENSE_GROUPS[0]);
  /* null until the fetch lands; {} means it was refused or failed. */
  const [vendorData, setVendorData] = useState({ vendors: {}, recurring: [] });
  /* ⚠️ FETCHED ONCE, AND A REFUSAL IS NOT AN ERROR. Anyone below tier 3 gets a
     403 here and simply sees no vendor suggestions, which is correct. */
  useEffect(() => {
    let alive = true;
    fetchVendorData().then((d) => { if (alive) setVendorData(d); });
    return () => { alive = false; };
  }, []);
  const [form, setForm] = useState(emptyForm(ymOf(new Date())));
  const [editingId, setEditingId] = useState(null);
  const [formErr, setFormErr] = useState("");
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  // false = that read FAILED (not "empty") — the matching save path refuses,
  // because saving over a record we never saw destroys it.
  const [loadOk, setLoadOk] = useState(true);
  const [catsOk, setCatsOk] = useState(true);
  const [recurOk, setRecurOk] = useState(true);

  /* ---- monthly RPIS report import (Cindy, Aug 11 2026) ----
     `parsed` is null until she presses Read, so the panel opens empty rather
     than pretending to have understood a blank box. `plan` is the editable
     answer sheet: one row per report line, each carrying the category a human
     has confirmed. Nothing here can write until she presses the button that
     names the month and the money.
     ⚠️ catMapOk false means the remembered translation could not be READ. The
     import still works — it is the ledger write that matters — but the map is
     not saved over, because saving a rebuilt map over one we never saw is how
     a year of answers disappears. */
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [plan, setPlan] = useState([]);
  const [catMap, setCatMap] = useState({});
  const [catMapOk, setCatMapOk] = useState(true);
  const [importBusy, setImportBusy] = useState(false);
  const [importDone, setImportDone] = useState("");

  /* ---- load category list once; merge Matt's four into a version-1 list ---- */
  useEffect(() => {
    (async () => {
      const c = await kvGetResult(CATS_KEY);
      if (!c.ok) { setCatsOk(false); return; }
      if (!c.value?.cats?.length) return; // no saved list yet — defaults already carry all four
      const saved = c.value.cats;
      if ((c.value.version || 1) >= 2) { setCats(saved); return; }
      const missing = REQUIRED_CAT_IDS
        .filter((id) => !saved.some((x) => x.id === id))
        .map((id) => DEFAULT_EXPENSE_CATEGORIES.find((d) => d.id === id))
        .filter(Boolean);
      const merged = missing.length ? [...saved, ...missing] : saved;
      setCats(merged);
      // Stamp version 2 even when nothing was missing, so this merge runs once.
      // A refused write leaves the record at v1 and the next open retries.
      kvSet(CATS_KEY, { version: 2, cats: merged });
    })();
  }, []);

  /* ---- load the remembered category translation once ----
     A failed read disables SAVING the map, never the import itself. */
  useEffect(() => {
    (async () => {
      const r = await kvGetResult(CATMAP_KEY);
      if (!r.ok) { setCatMapOk(false); return; }
      if (r.value && r.value.map && typeof r.value.map === "object") setCatMap(r.value.map);
    })();
  }, []);

  /* ---- load the repeats list once; seed Cindy's contracts on a read that
          genuinely succeeded and found nothing (the TrainerTasks pattern —
          seeding after a FAILED read is the bug that wiped the trainer
          roster, so ok is checked first) ---- */
  useEffect(() => {
    (async () => {
      const r = await kvGetResult(RECUR_KEY);
      if (!r.ok) { setRecurOk(false); return; }
      if (r.value?.items?.length) { setRecurring({ version: 1, items: r.value.items }); return; }
      /* ⚠️ An empty roster must NOT seed an empty list over a real one. If the
         fetch was refused there is nothing to seed from, so skip rather than write. */
      const rec = vendorData.recurring;
      if (!rec.length) return;
      const seeded = { version: 1, items: rec.map((t) => ({ ...t })) };
      setRecurring(seeded);
      kvSet(RECUR_KEY, seeded).catch(() => {});
    })();
  }, []);

  /* ---- load month whenever it changes ----
     BOTH records load: the v2 ledger (entries) and the v1 day-grid (legacy).
     They COEXIST — Cindy's first day on the ledger was July 31, and July
     already held day-grid data, which originally hid the entry form for the
     whole month ("I still need a place to comment"). Now an old-format month
     shows its old summary AND takes new entries; totals combine the two.
     The old record is never rewritten. */
  useEffect(() => {
    let alive = true;
    (async () => {
      const [v2, v1] = await Promise.all([kvGetResult(ledgerKey(ym)), kvGetResult(legacyKey(ym))]);
      if (!alive) return;
      // Both reads must succeed: with v1 unknown, totals would silently
      // understate the month; with v2 unknown, an entry could overwrite real ones.
      if (!v2.ok || !v1.ok) {
        setLoadOk(false);
        setLegacy(null);
        setLedger({ version: 2, month: ym, entries: [] });
        return;
      }
      const hasV1 = v1.value && v1.value.byCat && Object.values(v1.value.byCat).some((m) => m && Object.keys(m).length);
      setLoadOk(true);
      setLegacy(hasV1 ? v1.value : null);
      setLedger({ version: 2, month: ym, entries: (v2.value && Array.isArray(v2.value.entries)) ? v2.value.entries : [] });
      setForm(emptyForm(ym)); setEditingId(null); setFormErr("");
    })();
    return () => { alive = false; };
  }, [ym]);

  /* ---- persistence ---- */
  const persistLedger = async (nextEntries) => {
    if (!loadOk) { setSaveState("error"); return false; }
    const prev = ledger;
    const next = { version: 2, month: ym, entries: nextEntries };
    setLedger(next);
    setSaveState("saving");
    // kvSet returns false on a refused write and never throws. On refusal the
    // optimistic update rolls back so the screen never shows money that did
    // not record — this is the ledger reviewers will trust.
    const ok = await kvSet(ledgerKey(ym), next);
    if (!ok) { setLedger(prev); setSaveState("error"); return false; }
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 1800);
    return true;
  };
  const saveRecurring = async (items) => {
    if (!recurOk) { setSaveState("error"); return false; }
    const next = { version: 1, items };
    setRecurring(next);
    if (!(await kvSet(RECUR_KEY, next))) { setSaveState("error"); return false; }
    return true;
  };
  const saveCats = async (next) => {
    if (!catsOk) { setSaveState("error"); return; }
    setCats(next);
    if (!(await kvSet(CATS_KEY, { version: 2, cats: next }))) setSaveState("error");
  };

  /* ---- entry ops ---- */
  const submitEntry = async () => {
    const company = form.company.trim();
    const amount = cleanAmt(form.amount);
    if (!form.date) { setFormErr("Pick the date paid or the invoice date."); return; }
    if (!company) { setFormErr("Enter the company the cost was paid to."); return; }
    if (!form.cat) { setFormErr("Pick a category."); return; }
    if (!amount || !Number(amount)) { setFormErr("Enter the amount."); return; }
    setFormErr("");
    const entry = {
      id: editingId || uid(),
      date: form.date, company, cat: form.cat,
      amount, note: form.note.trim(),
      ...(form.recurId ? { recurId: form.recurId } : {}),
    };
    const nextEntries = editingId
      ? ledger.entries.map((e) => (e.id === editingId ? entry : e))
      : [...ledger.entries, entry];
    const ok = await persistLedger(nextEntries);
    if (!ok) return; // entry stays in the form; the badge says why
    if (form.repeat && !recurring.items.some((t) => t.cat === entry.cat && norm(t.company) === norm(entry.company))) {
      await saveRecurring([...recurring.items, { id: `rec_${Date.now()}`, company: entry.company, cat: entry.cat, note: entry.note }]);
    }
    setForm(emptyForm(ym)); setEditingId(null);
  };
  const editEntry = (e) => {
    setEditingId(e.id);
    setForm({ date: e.date, company: e.company, cat: e.cat, amount: e.amount, note: e.note || "", repeat: false, recurId: e.recurId || null });
    setFormErr("");
  };
  const deleteEntry = (e) => {
    if (!window.confirm(`Delete the ${fmt$(e.amount)} ${e.company} entry?`)) return;
    persistLedger(ledger.entries.filter((x) => x.id !== e.id));
    if (editingId === e.id) { setEditingId(null); setForm(emptyForm(ym)); }
  };
  const recordRepeat = (t) => {
    setEditingId(null);
    setForm({ date: ym === ymOf(new Date()) ? todayISO() : `${ym}-01`, company: t.company, cat: t.cat, amount: "", note: t.note || "", repeat: false, recurId: t.id });
    setFormErr("");
  };

  /* ---- import ops ----
     readReport only PARSES. It writes nothing and touches no state the ledger
     reads, so pressing it is always safe and always reversible by pressing it
     again with different text. */
  const readReport = () => {
    const p = parseReport(importText);
    setParsed(p);
    setPlan(planImport(p.rows, cats, catMap));
    setImportDone("");
  };
  const setRowCat = (name, catId) => setPlan((rows) => rows.map((r) => (r.name === name ? { ...r, catId } : r)));
  /* Fill every undecided row that HAS a suggestion. Deliberately does not touch
     a row with no suggestion, and deliberately does not overwrite an answer
     already given — "accept the suggestions" must never quietly change a
     decision a human already made. */
  const acceptSuggestions = () =>
    setPlan((rows) => rows.map((r) => (!r.catId && r.suggestId ? { ...r, catId: r.suggestId } : r)));
  const runImport = async () => {
    const fresh = entriesFrom(plan, ym);
    if (!fresh.length) return;
    setImportBusy(true);
    const ok = await persistLedger(replaceImported(ledger.entries, fresh));
    setImportBusy(false);
    if (!ok) return;   // persistLedger already rolled back and set the badge
    /* The ledger is the record; the remembered translation is a convenience.
       It is saved only AFTER the money lands, and a refusal here is silent
       because it costs Cindy one extra minute next month and nothing else. */
    if (catMapOk) {
      const next = mapFrom(plan, catMap);
      setCatMap(next);
      kvSet(CATMAP_KEY, { version: 1, map: next }).catch(() => {});
    }
    setImportDone(`Imported ${fresh.length} ${fresh.length === 1 ? "line" : "lines"} into ${monthLabel(ym)}.`);
    setImportText(""); setParsed(null); setPlan([]);
  };

  /* ---- totals: new entries PLUS anything the old day-grid holds ---- */
  const catName = (id) => (cats.find((c) => c.id === id) || {}).name || id;
  const catTotal = (catId) =>
    Object.values((legacy && legacy.byCat?.[catId]) || {}).reduce((s, v) => s + (Number(v) || 0), 0) +
    ledger.entries.filter((e) => e.cat === catId).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const groupTotal = (group) => cats.filter((c) => c.group === group).reduce((s, c) => s + catTotal(c.id), 0);
  /* ⚠️ TOTALLED FROM THE MONEY, NOT FROM THE CATEGORY LIST.
     Summing `cats` meant an entry whose category had since been removed simply
     stopped counting: the spend was still on file, still listed, and quietly
     missing from the month total. Nothing said so — the total just got
     smaller, which is the one direction nobody questions on an expense report.
     Counting every entry that exists cannot drop real money. Verified against
     the live months on 2026-08-03: zero orphaned entries today, so this
     changes no figure now and only stops the silent loss later. */
  const monthTotal = useMemo(
    () =>
      Object.values((legacy && legacy.byCat) || {}).reduce(
        (s, m) => s + Object.values(m || {}).reduce((a, v) => a + (Number(v) || 0), 0),
        0,
      ) + ledger.entries.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [cats, ledger, legacy] // eslint-disable-line
  );

  const alreadyImported = importedCount(ledger.entries);

  /* Repeats due this month and not yet recorded: due per the cadence
     (monthly unless the manager says otherwise), matched by the template id
     an entry carries, or by same company + category typed by hand.

     ★★ A MONTH THAT CAME FROM THE MONTHLY REPORT HAS NO WAITING LIST (Matt,
     Aug 11 2026). Once Cindy stops entering invoices one at a time, no vendor
     is ever recorded individually, so every repeat stays unmatched forever and
     the banner reads "Waiting on 20 repeats" every day of every month. A
     permanent alarm is not an alarm.

     ⚠️ MATCHING BY CATEGORY WAS TRIED FIRST AND REJECTED ON THE REAL DATA.
     Treating a repeat as covered when the report carries money in its category
     clears only 7 of the store's 21 — the other 14 sit in categories RPIS does
     not report at all (six PM Maintenance contracts, Piedmont Gas, Inktel,
     NOREAST, Extra Space, HME, UniFirst, NC DHHS). That is half a fix plus a
     guess about who got paid, which is worse than either.

     ⚠️ THE HONEST READING: this watch answers "was this vendor's bill
     recorded", and a category report cannot answer it for anybody. So it goes
     quiet for the month rather than pretending, and says so on screen.
     ⚠️ PER MONTH, NOT A SETTING. A month entered by hand behaves exactly as it
     always has, in the same store, in the same week — and a store that never
     imports sees no change at all, because alreadyImported is 0 for every month
     it has ever had. Nothing stored changes. */
  const pendingReps = (!loadOk || alreadyImported > 0) ? [] : recurring.items.filter((t) =>
    repeatDueIn(t, ym) &&
    !ledger.entries.some((e) => e.recurId === t.id || (e.cat === t.cat && norm(e.company) === norm(t.company))));

  const suggestions = useMemo(() => {
    const set = new Set(vendorData.vendors[form.cat] || []);
    ledger.entries.forEach((e) => set.add(e.company));
    return [...set].filter(Boolean).sort();
  }, [form.cat, ledger]);

  // Cindy, Aug 1 2026: "list all entries alphabetically." A-Z sorts by company
  // (date descending as the tiebreak); By date stays the default so nobody
  // loses the newest-first view they already know.
  const [entrySort, setEntrySort] = useState("date"); // "date" | "az"
  const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const entriesSorted = useMemo(
    () => [...ledger.entries].sort((a, b) =>
      entrySort === "az"
        ? (norm(a.company).localeCompare(norm(b.company)) || byDateDesc(a, b))
        : byDateDesc(a, b)),
    [ledger, entrySort]
  );

  /* ---- styles ---- */
  const S = {
    page: { fontFamily: "Inter, -apple-system, sans-serif", background: BG, minHeight: "100vh", padding: 14, color: INK },
    /* ⚠️ THE THIRD PART OF THE TREATMENT, AND IT WAS THE LAST ONE MISSING. This
       card had the shadow and the edge and painted FLAT WHITE, so Expenses read
       plainer than Sales, Labor and Food Cost sitting beside it. Same tint as
       its own edge, which is how every other money screen does it.
       ⚠️ `backgroundColor` UNDERNEATH IS NOT DECORATION — cardSurface fades to
       fully transparent on purpose, so without solid white beneath it the page
       grey shows through the falloff. */
    card: { backgroundColor: "#fff", backgroundImage: cardSurface(ACCENT_NEUTRAL, 0.5), border: `1px solid ${LINE}`, ...accentEdge(ACCENT_NEUTRAL, 3), borderRadius: 12, padding: 14, marginBottom: 12, boxShadow: CARD_3D },
    h1: { fontSize: 20, fontWeight: 800, color: NAVY, margin: 0 },
    sub: { fontSize: 13, color: GRAY, marginTop: 2 },
    btn: (bg) => ({ fontSize: 14, fontWeight: 700, padding: "9px 13px", borderRadius: 9, border: "none", background: bg, color: "#fff", cursor: "pointer" }),
    ghost: { fontSize: 13, fontWeight: 700, padding: "8px 12px", borderRadius: 9, border: `1px solid ${LINE}`, background: "#fff", color: INK, cursor: "pointer" },
    chip: (bg, fg) => ({ display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: bg, color: fg, marginRight: 6, marginTop: 4 }),
    input: { fontSize: 16, padding: "8px 10px", border: `1.5px solid ${LINE}`, borderRadius: 8, boxSizing: "border-box", width: "100%", background: "#fff", fontFamily: "inherit" },
    label: { display: "block", fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: GRAY, marginBottom: 4 },
    catChip: { fontSize: 11.5, fontWeight: 700, color: NAVY, background: "#EDF2F8", borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" },
  };

  /* Computed straight from `plan`, which is the same thing the rows below are
     rendered from, so the count and total under the button cannot disagree with
     what actually lands. */
  const impSum = importSummary(plan);

  const savedBadge =
    saveState === "saving" ? <span style={S.chip("#FFF3CD", AMBER)}>Saving…</span> :
    saveState === "saved" ? <span style={S.chip("#DCF5E8", GREEN)}>Saved ✓</span> :
    saveState === "error" ? <span style={S.chip("#FDE2E2", "#8A1220")}>Save failed</span> : null;

  return (
    <div style={S.page}>
      {(!loadOk || !catsOk || !recurOk) && (
        <div style={{ background: "#F5EAD3", border: "1px solid #E4CE9E", borderLeft: "3px solid #A9741C", borderTop: "3px solid #A9741C", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 13, fontWeight: 700, color: "#7A5410" }}>
          {!loadOk
            ? "This month's ledger could not be reached — what you see is blank, not real, and entry is off so it cannot overwrite the real month. Reopen the tile to retry."
            : !catsOk
              ? "The category list could not be reached — category changes are off so the saved list is not overwritten. Reopen the tile to retry."
              : "The repeats list could not be reached — repeat changes are off so the saved list is not overwritten. Reopen the tile to retry."}
        </div>
      )}
      {showMonthPicker && (
        <MonthYearPicker ym={ym} onPick={setYm} onClose={() => setShowMonthPicker(false)} />
      )}

      {/* header */}
      <div style={{ ...S.card, borderLeft: `3px solid ${RED}`, borderTop: `3px solid ${RED}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 style={S.h1}>Expense Tracker</h1>
            <div style={S.sub}>One line per payment — date, company, category, amount</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {savedBadge}
            <button style={S.ghost} onClick={() => setYm(shiftMonth(ym, -1))}>‹</button>
            <button style={S.ghost} onClick={() => setShowMonthPicker(true)}>{monthLabel(ym)}</button>
            <button style={S.ghost} onClick={() => setYm(shiftMonth(ym, 1))}>›</button>
            <button style={S.ghost} onClick={() => { setManageReps(false); setImportOpen(false); setManage((m) => !m); }}>{manage ? "✓ Done" : "✎ Categories"}</button>
            <button style={S.ghost} onClick={() => { setManage(false); setImportOpen(false); setManageReps((m) => !m); }}>{manageReps ? "✓ Done" : "↻ Repeats"}</button>
            <button style={S.ghost} onClick={() => { setManage(false); setManageReps(false); setImportOpen((v) => !v); }}>{importOpen ? "✓ Done" : "⇩ Import"}</button>
          </div>
        </div>
      </div>

      {/* monthly report import */}
      {importOpen && (
        <div style={{ ...S.card, borderLeft: `3px solid ${NAVY}`, borderTop: `3px solid ${NAVY}` }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>Import the monthly report</div>
          <div style={{ fontSize: 12.5, color: GRAY, marginTop: 2, marginBottom: 10 }}>
            Paste the category report from Numbers or Excel. Nothing is recorded until you press the button at the bottom, and it goes into <b>{monthLabel(ym)}</b>, the month shown at the top.
          </div>

          {alreadyImported > 0 && (
            <div style={{ background: "#F5EAD3", border: "1px solid #E4CE9E", borderRadius: 8, padding: "8px 10px", marginBottom: 10, fontSize: 12.5, fontWeight: 700, color: "#7A5410" }}>
              {monthLabel(ym)} already has {alreadyImported} imported {alreadyImported === 1 ? "line" : "lines"}. Importing again replaces them. Payments typed by hand are never touched.
            </div>
          )}

          <textarea
            style={{ ...S.input, minHeight: 110, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13, resize: "vertical" }}
            placeholder={"Category Name\tTotal Amount\nFood - Produce\t2526.23\nUniforms\t428.17"}
            value={importText}
            onChange={(e) => { const v = e.target.value; setImportText(v); }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button style={S.btn(NAVY)} onClick={readReport} disabled={!importText.trim()}>Read the report</button>
            {(parsed || importText) && (
              <button style={S.ghost} onClick={() => { setImportText(""); setParsed(null); setPlan([]); setImportDone(""); }}>Clear</button>
            )}
            {importDone && <span style={S.chip("#DCF5E8", GREEN)}>{importDone}</span>}
          </div>

          {parsed && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12.5, color: GRAY, marginBottom: 8 }}>
                Read {parsed.rows.length} {parsed.rows.length === 1 ? "line" : "lines"}
                {parsed.ignored ? `, ignored ${parsed.ignored} (heading or blank)` : ""}
                {parsed.blocked.length ? `, refused ${parsed.blocked.length}` : ""}.
              </div>

              {parsed.blocked.length > 0 && (
                <div style={{ background: "#FDE2E2", border: "1px solid #F2B8B8", borderRadius: 8, padding: "9px 11px", marginBottom: 10 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: "#8A1220", marginBottom: 4 }}>Not imported</div>
                  {parsed.blocked.map((b, i) => (
                    <div key={`${b.name}-${i}`} style={{ fontSize: 12.5, color: "#8A1220", padding: "2px 0" }}>
                      <b>{b.name}</b> {fmt$(b.amount)} — {b.why}
                    </div>
                  ))}
                </div>
              )}

              {plan.some((r) => !r.catId && r.suggestId) && (
                <button style={{ ...S.ghost, marginBottom: 8 }} onClick={acceptSuggestions}>
                  Accept {plan.filter((r) => !r.catId && r.suggestId).length} suggested {plan.filter((r) => !r.catId && r.suggestId).length === 1 ? "match" : "matches"}
                </button>
              )}

              {plan.map((r) => (
                <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px dotted ${LINE}`, flexWrap: "wrap" }}>
                  <span style={{ flex: "2 1 150px", fontSize: 13.5, fontWeight: 700 }}>{r.name}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 800, width: 90, textAlign: "right" }}>{fmt$(r.amountStr)}</span>
                  <select
                    style={{ ...S.input, flex: "1 1 180px", fontSize: 13, padding: "6px 8px", ...(r.catId ? {} : { borderColor: "#D8A200" }) }}
                    value={r.catId || ""}
                    onChange={(e) => { const v = e.target.value; setRowCat(r.name, v); }}
                  >
                    <option value="">Pick a category…</option>
                    <option value={SKIP}>Skip this line</option>
                    {EXPENSE_GROUPS.map((g) => (
                      <optgroup key={g} label={g}>
                        {cats.filter((c) => c.group === g).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <span style={{ fontSize: 11.5, fontWeight: 700, width: 108, color: GRAY }}>
                    {r.how === "saved" ? "remembered"
                      : r.how === "exact" ? "name matched"
                      : r.catId === SKIP ? "skipped"
                      : r.catId ? "your pick"
                      : r.suggestId ? `try ${catName(r.suggestId)}`
                      : "needs a category"}
                  </span>
                </div>
              ))}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                <div style={{ fontSize: 12.5, color: GRAY }}>
                  {impSum.ready} ready · {impSum.skipped} skipped
                  {impSum.pending > 0 && <b style={{ color: AMBER }}> · {impSum.pending} still need a category and will not import</b>}
                </div>
                <button
                  style={{ ...S.btn(impSum.ready ? GREEN : GRAY), cursor: impSum.ready ? "pointer" : "not-allowed" }}
                  disabled={!impSum.ready || importBusy || !loadOk}
                  onClick={runImport}
                >
                  {importBusy ? "Importing…" : `Import ${impSum.ready} into ${monthLabel(ym)} — ${fmt$(impSum.total)}`}
                </button>
              </div>
              {!catMapOk && (
                <div style={{ fontSize: 12, color: GRAY, marginTop: 6 }}>
                  Your saved category matches could not be loaded, so this month's picks will not be remembered. The import itself works normally.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* legacy month notice */}
      {legacy && (
        <div style={{ ...S.card, borderLeft: `3px solid ${AMBER}`, borderTop: `3px solid ${AMBER}`, fontSize: 13.5, color: INK }}>
          <b>{monthLabel(ym)} also has amounts from the old day-grid format.</b> They're included in the totals and never changed. New payments go in the form below, same as any month.
        </div>
      )}

      {/* totals — what gets reported */}
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>{monthLabel(ym)} by category</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>{fmt$(monthTotal)}</div>
        </div>
        {EXPENSE_GROUPS.map((g) => {
          const gCats = cats.filter((c) => c.group === g && catTotal(c.id) > 0);
          if (!gCats.length) return null;
          return (
            <div key={g} style={{ marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: GRAY, borderBottom: `1px solid ${LINE}`, paddingBottom: 4 }}>
                <span>{g}</span><span>{fmt$(groupTotal(g))}</span>
              </div>
              {gCats.map((c) => (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "5px 0", borderBottom: `1px dotted ${LINE}` }}>
                  <span>{c.name}</span><span style={{ fontWeight: 700 }}>{fmt$(catTotal(c.id))}</span>
                </div>
              ))}
            </div>
          );
        })}
        {monthTotal === 0 && <div style={{ fontSize: 13, color: GRAY, marginTop: 8 }}>Nothing recorded for {monthLabel(ym)} yet.</div>}
      </div>

      {/* category manager */}
      {manage && (
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginBottom: 8 }}>Categories</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <input style={{ ...S.input, flex: "2 1 180px" }} placeholder="New category name" value={newCatName}
              onChange={(e) => { const v = e.target.value; setNewCatName(v); }} />
            <select style={{ ...S.input, flex: "1 1 110px" }} value={newCatGroup}
              onChange={(e) => { const v = e.target.value; setNewCatGroup(v); }}>
              {EXPENSE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <button style={S.btn(NAVY)} onClick={() => {
              const name = newCatName.trim();
              if (!name) return;
              const id = mkId(name);
              if (cats.some((c) => c.id === id)) { setNewCatName(""); return; }
              saveCats([...cats, { id, name, group: newCatGroup }]);
              setNewCatName("");
            }}>Add</button>
          </div>
          {cats.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px dotted ${LINE}` }}>
              <input style={{ ...S.input, flex: "2 1 160px", fontSize: 14, padding: "6px 8px" }} value={c.name}
                onChange={(e) => { const v = e.target.value; saveCats(cats.map((x) => (x.id === c.id ? { ...x, name: v } : x))); }} />
              <select style={{ ...S.input, flex: "1 1 100px", fontSize: 13, padding: "6px 8px" }} value={c.group}
                onChange={(e) => { const v = e.target.value; saveCats(cats.map((x) => (x.id === c.id ? { ...x, group: v } : x))); }}>
                {EXPENSE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <button style={{ ...S.ghost, color: "#8A1220", padding: "6px 10px" }} onClick={() => {
                const has = catTotal(c.id) > 0;
                const msg = has
                  ? `Remove "${c.name}"? It has ${fmt$(catTotal(c.id))} recorded this month — entries keep their data, but the category label disappears from the list.`
                  : `Remove "${c.name}"?`;
                if (window.confirm(msg)) saveCats(cats.filter((x) => x.id !== c.id));
              }}>Remove</button>
            </div>
          ))}
          <button style={{ ...S.ghost, marginTop: 10 }} onClick={() => {
            if (window.confirm("Reset the category list to the defaults? Recorded entries are kept; only the list of categories resets.")) {
              saveCats(DEFAULT_EXPENSE_CATEGORIES);
            }
          }}>Reset to defaults</button>
        </div>
      )}

      {/* repeats manager */}
      {manageReps && (
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Repeats</div>
          <div style={{ fontSize: 12.5, color: GRAY, marginBottom: 8 }}>
            Each one shows as a waiting row when its month comes around — Monthly unless you set Weekly, Quarterly, Semi Annual, or Annually here. Nothing counts until the payment is recorded with its real date and amount. Add one by ticking "repeats" when recording an entry.
          </div>
          {/* Said on screen because it is the first question anybody asks after
              changing a category: does this rewrite what I already filed? */}
          <div style={{ fontSize: 12.5, color: GRAY, marginBottom: 8 }}>
            Changing a category here sets what the <b>next</b> waiting row is filed under. Payments already recorded keep the category they were entered with.
          </div>
          {recurring.items.length === 0 && <div style={{ fontSize: 13, color: GRAY }}>No repeats saved.</div>}
          {recurring.items.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px dotted ${LINE}`, flexWrap: "wrap" }}>
              <span style={{ flex: "2 1 140px", fontWeight: 700, fontSize: 14 }}>{t.company}</span>
              {/* ⚠️⚠️ THIS WAS A READ-ONLY CHIP (Cindy, Aug 12 2026: "Can I edit
                  the coding entries under 'repeating expenses'? For some reason
                  all PM's that I entered are showing as PM-Backflow testing").

                  SHE HAD NOT ENTERED THEM. This list SEEDS ITSELF from
                  expenseVendorData.js the first time it is read into an empty
                  record, and that file files every PM vendor under the one
                  `pm-maintenance` id. So six different services — hood cleaning,
                  alarm monitoring, grease pumping, coil cleaning, backflow, ice
                  machine — all printed the same category name, which happens to
                  read "PM Maintenance    BackFlow Testing".

                  The chip was honest. The coding under it was not, and there was
                  no way to correct it short of Remove and retype the repeat,
                  which is a destructive fix for a spelling problem.

                  ⚠️ THE REPEAT ONLY, NEVER THE RECORDED PAYMENTS. Entries are
                  their own records and keep the category they were filed under.
                  Recoding them from here would move money between categories in
                  months that have already been reported to Matt and to the FCR. */}
              <select style={{ ...S.input, flex: "2 1 180px", fontSize: 13, padding: "6px 8px" }} value={t.cat || ""}
                aria-label={`Category for the ${t.company} repeat`}
                onChange={(e) => {
                  const v = e.target.value;
                  saveRecurring(recurring.items.map((x) => x.id === t.id ? { ...x, cat: v } : x));
                }}>
                <option value="">Pick one…</option>
                {/* ⚠️ A CATEGORY THAT IS NO LONGER IN THE LIST STILL SHOWS, and
                    still shows its own name. A removed category would otherwise
                    leave this select with a value matching no option — it renders
                    blank, and the next thing she touches silently recodes the
                    repeat to something nobody chose. An old id must still read
                    (design rule 1). */}
                {t.cat && !cats.some((c) => c.id === t.cat) && (
                  <option value={t.cat}>{catName(t.cat)} — not in the list</option>
                )}
                {EXPENSE_GROUPS.map((g) => (
                  <optgroup key={g} label={g}>
                    {cats.filter((c) => c.group === g).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                ))}
              </select>
              {t.note ? <span style={{ flex: "2 1 120px", fontSize: 12.5, color: GRAY }}>{t.note}</span> : null}
              <select style={{ ...S.input, width: 130, fontSize: 13, padding: "6px 8px" }} value={t.every || "monthly"}
                onChange={(e) => {
                  const v = e.target.value;
                  saveRecurring(recurring.items.map((x) => x.id === t.id
                    ? { ...x, every: v, ...(v === "monthly" ? {} : { anchor: x.anchor || ym }) }
                    : x));
                }}>
                {CADENCES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              {(t.every && t.every !== "monthly") && (
                <select style={{ ...S.input, width: 150, fontSize: 13, padding: "6px 8px" }} value={t.anchor || ym}
                  onChange={(e) => {
                    const v = e.target.value;
                    saveRecurring(recurring.items.map((x) => x.id === t.id ? { ...x, anchor: v } : x));
                  }}>
                  {anchorChoices(ym).map((m) => <option key={m} value={m}>due {monthLabel(m)}</option>)}
                </select>
              )}
              <button style={{ ...S.ghost, color: "#8A1220", padding: "5px 9px", marginLeft: "auto" }} onClick={() => {
                if (window.confirm(`Remove the ${t.company} repeat? Recorded entries are untouched.`)) {
                  saveRecurring(recurring.items.filter((x) => x.id !== t.id));
                }
              }}>Remove</button>
            </div>
          ))}
        </div>
      )}

      {/* waiting repeats for this month */}
      {pendingReps.length > 0 && (
        <div style={{ ...S.card, borderLeft: `3px solid ${NAVY}`, borderTop: `3px solid ${NAVY}` }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: NAVY, marginBottom: 6 }}>
            Waiting on {pendingReps.length} repeat{pendingReps.length === 1 ? "" : "s"} this month
          </div>
          {pendingReps.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px dotted ${LINE}`, flexWrap: "wrap" }}>
              <span style={{ flex: "2 1 140px", fontWeight: 700, fontSize: 14 }}>{t.company}</span>
              <span style={S.catChip}>{catName(t.cat)}</span>
              {(t.every && t.every !== "monthly") && <span style={S.catChip}>{cadenceOf(t.every)[1]}</span>}
              {t.note ? <span style={{ flex: "2 1 120px", fontSize: 12.5, color: GRAY }}>{t.note}</span> : null}
              <button style={{ ...S.btn(NAVY), padding: "6px 12px", fontSize: 13, marginLeft: "auto" }} onClick={() => recordRepeat(t)}>Record</button>
            </div>
          ))}
        </div>
      )}

      {/* ★ why the waiting list is not here. One quiet line, deliberately not a
          card with an accent edge — the whole point is that this month has
          nothing to chase, so it must not read like the alert it replaced. It
          only appears where the banner would otherwise have been, so a store
          with no repeats saved never sees it. */}
      {alreadyImported > 0 && recurring.items.length > 0 && (
        <div style={{ fontSize: 12.5, color: GRAY, padding: "0 4px", marginBottom: 12, lineHeight: 1.5 }}>
          {monthLabel(ym)} came from the monthly report, so repeats are not checked off one by one this month. Your {recurring.items.length} saved {recurring.items.length === 1 ? "repeat is" : "repeats are"} still there under <b>↻ Repeats</b>.
        </div>
      )}

      {/* entry form */}
      {(
        <div style={{ ...S.card, borderLeft: `3px solid ${GREEN}`, borderTop: `3px solid ${GREEN}` }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginBottom: 8 }}>
            {editingId ? "Edit entry" : "Record a payment"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <div>
              <label style={S.label}>Date paid / invoice date</label>
              <input type="date" style={{ ...S.input, minWidth: 0, WebkitAppearance: "none", appearance: "none" }} value={form.date}
                onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, date: v })); }} />
            </div>
            <div>
              <label style={S.label}>Company</label>
              <input style={S.input} list="exp-company-suggest" placeholder="Who was paid" value={form.company}
                onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, company: v })); }} />
              <datalist id="exp-company-suggest">
                {suggestions.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label style={S.label}>Category</label>
              <select style={S.input} value={form.cat}
                onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, cat: v })); }}>
                <option value="">Pick one…</option>
                {EXPENSE_GROUPS.map((g) => (
                  <optgroup key={g} label={g}>
                    {cats.filter((c) => c.group === g).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label style={S.label}>Amount</label>
              <input style={S.input} inputMode="decimal" placeholder="0.00" value={form.amount}
                onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, amount: cleanAmt(v) })); }} />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={S.label}>What it was for / invoice # (optional)</label>
            <input style={S.input} placeholder="What the expense was for, invoice number…" value={form.note}
              onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, note: v })); }} />
          </div>
          {!editingId && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13.5, fontWeight: 600, color: INK, cursor: "pointer" }}>
              <input type="checkbox" checked={form.repeat}
                onChange={(e) => { const v = e.target.checked; setForm((f) => ({ ...f, repeat: v })); }} />
              Repeats — waits at the start of each month it's due (Monthly to start; set Weekly, Quarterly, Semi Annual, or Annually under ↻ Repeats)
            </label>
          )}
          {formErr && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: "#8A1220" }}>{formErr}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={S.btn(GREEN)} onClick={submitEntry}>{editingId ? "Save changes" : "Add entry"}</button>
            {editingId && (
              <button style={S.ghost} onClick={() => { setEditingId(null); setForm(emptyForm(ym)); setFormErr(""); }}>Cancel</button>
            )}
          </div>
        </div>
      )}

      {/* entries list */}
      {(
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>
              Entries — {monthLabel(ym)} ({entriesSorted.length})
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button style={{ ...S.ghost, padding: "5px 10px", fontSize: 12, ...(entrySort === "date" ? { borderColor: NAVY, color: NAVY, fontWeight: 800 } : {}) }} onClick={() => setEntrySort("date")}>By date</button>
              <button style={{ ...S.ghost, padding: "5px 10px", fontSize: 12, ...(entrySort === "az" ? { borderColor: NAVY, color: NAVY, fontWeight: 800 } : {}) }} onClick={() => setEntrySort("az")}>A–Z</button>
            </div>
          </div>
          {entriesSorted.length === 0 && <div style={{ fontSize: 13, color: GRAY }}>No payments recorded this month yet.</div>}
          {entriesSorted.map((e) => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px dotted ${LINE}`, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: GRAY, width: 52, flexShrink: 0 }}>{prettyDate(e.date)}</span>
              <span style={{ flex: "2 1 130px", fontWeight: 700, fontSize: 14 }}>{e.company}</span>
              <span style={S.catChip}>{catName(e.cat)}</span>
              <span style={{ fontWeight: 800, fontSize: 14, marginLeft: "auto" }}>{fmt$(e.amount)}</span>
              <span style={{ display: "flex", gap: 6 }}>
                <button style={{ ...S.ghost, padding: "5px 9px", fontSize: 12 }} onClick={() => editEntry(e)}>Edit</button>
                <button style={{ ...S.ghost, padding: "5px 9px", fontSize: 12, color: "#8A1220" }} onClick={() => deleteEntry(e)}>Delete</button>
              </span>
              {e.note ? <span style={{ flexBasis: "100%", fontSize: 12.5, color: GRAY, paddingLeft: 60 }}>{e.note}</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
