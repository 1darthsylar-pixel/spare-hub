import React, { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Pencil, Check, TrendingDown, TrendingUp, ChevronLeft, ChevronRight, RefreshCw, Printer } from "lucide-react";
import { kvGet, kvSet, publishSharedRows, uploadDoc, signedDocUrl, deleteDoc, hubToken } from "./store.js"; // EOS scorecard publish + safe-entry mirror for the change-fund worker; CashAudit's own ledger stays on window.storage. uploadDoc/signedDocUrl are for receipt photos (PRIVATE `Receipts` bucket).
import { eosPeriod } from "./eosPeriod.js";
import { seatById } from "./orgSeats.js"; // display names follow the seat table, never a hardcoded person
import { storeCfg, programLabel, cashierNames, STORE } from "./storeConfig.js"; // the mileage rate and the programme name, both read at use time so a saved value takes effect
import { loadHRTeam } from "./hrTeam.js"; // the REAL roster, for the $5 shortage question only — see CASH_DOC_QUEUE_KEY
import { DENOMS, countedTotal, uncountedSafe } from "./cashCount.js"; // ⭐ the money rules live in a leaf so checks/ can EXECUTE them; a .jsx cannot be imported by any Node test

/* The person these strings name is the CASH-AUDIT SEAT HOLDER, resolved from
   the same seat file the worker's routing consults — so when the seat changes
   hands, the screen stops naming the old person. (WasteTracker kept
   mentioning Tyler after his termination; this is that bug's guard.) */
const CASH_SEAT_FIRST = (((seatById("cash-audit") || {}).holder || "the cash seat").split(" ")[0]); // s8 publish target — must match the key EOSTile reads, which is quarter-derived, never hardcoded.

/* ═══ WHAT CHANGED IN THIS REVISION ═══════════════════════════════════
   THE BUG (Jul 8 2026 PM, −$145 that was really +$5):
   Expected must always equal  prevShiftCounted − deposited + received.
   The auto-carry effect kept it there, but `startEditAudit` turned
   auto-carry OFF unconditionally. So a deposit typed while editing never
   adjusted Expected — the entry silently overstated the shortage by the
   exact deposit amount. Jul 8 PM stored $4,557 instead of $4,407.
   A prior revision noticed this and added a warning banner instead of
   fixing it. Warnings don't fix ledgers.

   THREE FIXES:
   1. `submitAudit` RECOMPUTES Expected from the carry basis at save time
      whenever auto-carry is on. The stored figure can no longer be stale
      relative to the deposit sitting next to it.
   2. `startEditAudit` only turns auto-carry off when the stored Expected
      genuinely diverges from the carry basis (a real manual override).
      Editing an entry whose Expected already matches keeps auto-carry on,
      so changing the deposit updates Expected the way it should.
   3. Expected + its carry basis now render ABOVE the denomination grid,
      before any counts are entered. Leaders were counting blind: the old
      form said "enter counts to see today's over/short" and showed nothing
      else. Four shifts of iNFORM disagreement went unnoticed for a week
      because nobody could see what the safe was supposed to hold.

   STORE MIRROR (Jul 13 2026):
   CashAudit's ledger lives on window.storage, but the change-fund worker
   reads safe entries from the shared Supabase kv_store (via store.js's
   kvSet/kvGet). Those are two different stores — so the worker saw "no
   audit entries" no matter how many shifts were logged. saveAudit and the
   initial load now ALSO mirror the entries array to the Hub store via
   kvSet(AUDIT_KEY, …), the same key/shape the worker's sbGet expects.
   window.storage stays the UI's source of truth; the mirror is read-only
   fuel for the Mon/Thu change-fund calc.
   ═══════════════════════════════════════════════════════════════════ */

// ---- Design tokens: light ledger (matches the rest of the Hub) ----
const INK = "#F6F8FA";                    // page background
const PANEL = "#FFFFFF";                  // cards / rows
const BORDER = "#E3E7EC";
const AMBER = "#B45309";                  // accent (ledger highlights)
const AMBER_SOFT = "rgba(180,83,9,0.10)";
const AMBER_GRAD = "linear-gradient(120deg,#C2690F 0%,#8A3D06 55%)"; // dual-shade masthead
const GREEN = "#166B4A";
const RED = "#DD0031";
const MUTED = "#6B7480";
const TEXT = "#232A31";

const SHIFTS = ["AM", "PM"];
const SHIFT_ORDER = { AM: 0, PM: 1 };
/* ★ FROM storeConfig.js (step 2, Aug 11 2026). Same 0.70, typed once.
   ⚠️ IT IS RENDERED AS THE RATE ON THE REIMBURSEMENT, so it is a number a
   person is paid against, not a label. It also lands in the printed mileage
   log a leader signs. Changing it changes what somebody is owed, so it belongs
   in the settings screen and not in this file.
   ⚠️ HISTORICAL ROWS ARE NOT RESTATED. Reimbursements already recorded keep
   whatever they were calculated at; this rate only prices new ones. The IRS
   figure moves most Januaries and last year's drive keeps last year's rate. */
/* A CALL, NOT A CAPTURED VALUE (step 3). Read at use time so a rate the
   store saves in settings is the rate the next reimbursement is priced at.
   Rows already recorded keep whatever they were calculated at. */
const mileageRate = () => storeCfg("financial.mileageRate");
/* ⚠️ THE 27 NAMES MOVED TO ownerSeed.js, read at call time. They were this
   store's cashiers, shipped to every clone as the autocomplete on a money
   screen. `cashierNames()` sorts on read, so the `.sort()` that used to be here
   is not needed at any call site. */
const KNOWN_NAMES = () => cashierNames();

const AUDIT_KEY = "gcfcr-cashaudit-safe-entries";
const CASHIER_KEY = "gcfcr-cashaudit-cashier-entries";
const MILEAGE_KEY = "gcfcr-cashaudit-mileage-entries";
const ORDER_KEY = "gcfcr-cashaudit-change-orders";
const RECEIPTS_KEY = "gcfcr-cashaudit-receipts";
// Cindy, Jul 24: "Catering Mileage module…Needs monthly starting and ending
// mileage from car's odometer." Kept in its OWN key rather than on the trip
// entries — an odometer reading belongs to the MONTH, not to any one trip.
// Shape: { "2026-07": { start, end, note } }
const ODO_KEY = "gcfcr-cashaudit-odometer";

/* Approved drivers (Hannah, Jul 23 — she maintains this in HR Console).
   ⚠️ Lives in KV, NOT window.storage: HR Console writes it and this tile reads
   it, and window.storage is not shared between them. Rows carry {id,name,expires}
   so nothing here needs the HR roster to render the list. */
const DRIVERS_KEY = "gcfcr-approved-drivers-v1";

/* ── Receipt uploads (Hannah, Jul 22 2026) ──────────────────────────────
   "No more putting receipts in mine or Cindy's boxes in the office."
   Leaders photograph refunds / paid ins / paid outs here instead.
   The PHOTO goes to a PRIVATE Supabase bucket (never public — these carry
   names and amounts); only {bucket,path} is stored on the entry, and a
   short-lived signed URL is minted when someone actually opens one.
   ⚠️ Bucket name is CASE-SENSITIVE and must match Supabase exactly. */
/* ⚠️ NO DEFAULT ON `kind`, AND THAT IS THE POINT (Bri, Aug 7 2026: "add a
   selection for 'draw overage' or 'drawer shortage'").
   The field was labelled "Amount ($, use − for short)", so the sign was typed by
   hand at the end of a shift. Forget the minus once and a $20 shortage is filed
   as a $20 overage: the ledger balances to the wrong number and nothing on
   screen looks wrong. Defaulting the selector would move that silent error
   rather than remove it, so the leader picks and cannot submit until they have.
   ⚠️ `kind` AND `reason` ARE FORM STATE. What gets STORED is the same single
   signed `amount` this ledger has always held, so every entry written before
   today reads identically and nothing needs migrating. A stored type would be a
   second source of truth for one fact. */
/* ⚠️ `personId` IS ITS OWN FIELD, BESIDE `name`, NEVER INSTEAD OF IT. Every
   cashier row ever written holds a typed first name and nothing else, and
   those rows still have to read exactly as they do. This is added, not
   swapped, and it is only ever asked for on a shortage of $5 or more.
   Design rule 1. */
const emptyCashier = () => ({ id: uid(), name: KNOWN_NAMES()[0] || "", personId: "", date: todayISO(), kind: "", amount: "", notes: "", reason: "" });

/* Opening an old entry derives the selector from the sign it already carries,
   so editing a row can never silently flip a shortage into an overage. */
/* ⚠️ `personId: e.personId || ""` — an entry written before Aug 10 2026 has no
   such field, and reading one back for an edit must not invent a person. Blank
   means "nobody was named", which is the truth about every historical row. */
/* ⚠️ AN OLD $5 ROW KEEPS ITS SENTENCE IN `reason`, NOT `notes`, so promote it
   into the comment box on the way in — and blank `reason` when we do. Writing
   the same sentence into both fields would print it twice in the list, once
   beside the name and once underneath. When the row has its own note the two
   are different sentences and both are left exactly as they were.
   Nothing is ever dropped: `notes || reason` cannot lose either one. */
const cashierFormFrom = (e) => {
  const note = e.notes || "";
  const why = e.reason || "";
  return {
    id: e.id, name: e.name, personId: e.personId || "", date: e.date,
    kind: (Number(e.amount) || 0) < 0 ? "short" : "over",
    amount: String(Math.abs(Number(e.amount) || 0)),
    notes: note || why, reason: note ? why : "",
  };
};

/* ★ ONE NAME FOR THIS LOG, IN ONE PLACE (Nick via Hannah, Aug 11 2026: "It
   needs to say shortages and overages or simply 'cashier variance log'").
   The home tile said "Cashier Overages" and the screen it opened said "Cashier
   Over / Short". Two names for one thing, and the one people meet first named
   only half of what the log holds — so a leader closing a drawer that came up
   short had no reason to think this was where it went.
   ⚠️ "CASHIER" IS KEPT DELIBERATELY. The tile above it logs a shift's till
   over/short, which is a different number about a different thing. Dropping the
   word would leave two rows on one screen that both read as over/short.
   A constant, not two strings, so they cannot drift apart again (rule 8). */
const CASHIER_LOG_NAME = "Cashier Shortages & Overages";

/* Her threshold, in one place. A shortage OVER five dollars needs paperwork;
   five exactly does not. */
/* ⚠️ "$5 OR MORE", NOT "MORE THAN $5", AND THE CHANGE IS DELIBERATE (Hannah,
   Aug 10 2026: "Require the leader recording shortages to document the team
   member associated with the shortage when the shortage is -$5 or more").
   It was `> 5`, from Bri's original wording "a shortage of more than $5". The
   two rulings differ by exactly one dollar, and a shortage of $5.00 flat is
   caught by Hannah's and missed by Bri's. HR documentation is Hannah's system,
   so hers wins and BOTH rules move together — the photo-or-reason gate and the
   HR queue fire on the same number. Two thresholds a dollar apart is a rule
   nobody could explain on the floor. */
const SHORT_DOC_AT = 5;

/* ★ SHORTAGES OF $5 OR MORE GO TO HR AS A WORKLIST (Hannah, Aug 10 2026: "Yes,
   I want the leader to document the shortages as a file entry in HR console").

   ⚠️⚠️ THIS TILE NEVER WRITES TO ANYBODY'S FILE, AND THAT IS THE DESIGN.
   A permanent HR record is the highest-consequence thing the Hub stores, and
   `gcfcr-hr-files` already has exactly one writer. Adding a second one, in a
   money tile, on a first-name string, is how a cash shortage lands on the wrong
   person's record forever. So this queues the FACTS and Hannah files it from
   HR Console with the tool she already uses. The leader has documented it; HR
   decides what goes on the file.

   ⚠️ ITS OWN KEY, NOT `gcfcr-hr-files`. Nothing that reads a file has to learn
   about this shape, and an unreviewed shortage cannot appear on somebody's
   record by accident. Design rule 1.
   ⚠️ IN KV, NOT window.storage. HR Console has to read what this tile writes,
   and window.storage is not shared between them — the same reason the approved
   drivers list lives in KV. */
const CASH_DOC_QUEUE_KEY = "gcfcr-hr-cashdocs-v1";

const RECEIPT_BUCKET = "Receipts";
/* ⚠️ THE ONE LIST. The month totals below are DERIVED from this array, not
   written out beside it. They used to be three hand-written `totalOf("…")`
   calls under a hand-written label, so adding a fourth type showed a new
   option in the dropdown and silently left its money out of the totals — a
   receipt you can log and cannot count. Hannah asked for the fourth on
   Aug 14 2026 ("paid in, paid out, refund, and credit card receipt"); a fifth
   now needs nothing but this line.
   ⚠️ APPEND, NEVER REORDER. `RECEIPT_TYPES[0]` is the default on a new
   receipt, so moving an entry changes what leaders get pre-selected. Old
   records store the plain string in `type` and keep reading either way
   (design rule 1). */
const RECEIPT_TYPES = ["Refund", "Paid in", "Paid out", "Credit card receipt"];

const ORDER_ITEMS = [
  { key: "b10", label: "$10 bills",   value: 1 },
  { key: "b5",  label: "$5 bills",    value: 1 },
  { key: "b1",  label: "$1 bills",    value: 1 },
  { key: "rq",  label: "Quarters ($)", value: 1 },
  { key: "rd",  label: "Dimes ($)",    value: 1 },
  { key: "rn",  label: "Nickels ($)",  value: 1 },
  { key: "rp",  label: "Pennies ($)",  value: 1 },
];

const money = (n) => {
  const v = Number(n) || 0;
  const sign = v < 0 ? "\u2212" : "";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
};
/* 🐛 WAS toISOString().slice(0,10) — UTC, so from 8pm Eastern it names
   tomorrow. This stamps the audit itself, receipts, mileage and change-fund
   orders. The PM count happens AT CLOSE, i.e. after 8pm, so every closing
   cash count, receipt and deposit was filed under the next day's date. This
   is money reconciliation and the date IS the record. */
const todayISO = () => new Date().toLocaleDateString("en-CA");
const uid = () => Math.random().toString(36).slice(2, 10);
const sortKey = (e) => `${e.date}-${SHIFT_ORDER[e.shift] ?? 0}`;
const monthKey = (dateStr) => (dateStr || "").slice(0, 7);
// The month before a "YYYY-MM" key. Used by the odometer auto-carry so a new
// month's start reading defaults to the prior month's ending reading.
const prevMonthKey = (key) => {
  const [y, m] = String(key || "").split("-").map(Number);
  if (!y || !m) return "";
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (key) => {
  if (!key) return "";
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
};
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function notifyTool(payload) {
  const res = await fetch("/api/tool-notify", { method: "POST", headers: { "Content-Type": "application/json", "x-hub-token": hubToken() }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error("send failed");
}

function emptyAudit() {
  const denoms = {};
  DENOMS.forEach((d) => (denoms[d.key] = ""));
  return {
    id: uid(),
    date: todayISO(),
    shift: "AM",
    ...denoms,
    tills: "1000",
    loose: "",
    deposited: "",
    received: "",
    receivedInCount: false,  // was the change fund already inside this shift's count?
    expected: "",
    inform: "",   // iNFORM-reported over/short for the shift (+ over, − short)
    leader: "",
    notes: "",
  };
}

/* ★★ THE JULY ROWS ARE NOT IN THIS FILE ANY MORE (Aug 9 2026 sweep, finding 4).
   🐛 `JULY_SEED` was eight real dated counts of this store's safe, sitting right
   here — so `dist/assets/CashAudit-*.js` handed the balances, the denomination
   mix, the $1,000 till float, the deposit sizes and a $900 change order to
   anyone on the internet, with no account and a year-long cache header. The
   tile's `tier: 2` gate never touched it: a gate decides what RENDERS, and the
   chunk downloads either way. The Aug 8 sweep fixed the change-order credential
   250 lines below this and walked straight past these.

   They live in cashAuditSeed.js now, which only worker.js imports, and arrive
   from GET /api/cashaudit-seed behind the same gate as the tile.

   ⚠️ THE SEED IS NOW A PARAMETER, AND AN EMPTY ONE MUST BE HARMLESS. That is
   the whole safety argument for moving it. A forbidden or failed fetch yields
   `[]`, so `add` is empty, so this returns null, so the caller's `if (seeded)`
   never fires and NOTHING IS WRITTEN. This file has already seeded over the real
   ledger once — twice in one pass, through window.storage and through kvSet —
   so the failure direction matters more here than anywhere else in the repo. */
function seedJulyEntries(list, seed, note) {
  const rows = Array.isArray(seed) ? seed : [];
  if (!rows.length) return null;
  const have = new Set(list.map((e) => `${e.date}-${e.shift}`));
  const add = rows.filter((s) => s && s.date && s.shift && !have.has(`${s.date}-${s.shift}`))
    .map((s) => ({ ...s, id: `seed-${s.date}-${s.shift}`, loose: "", notes: note || "" }));
  if (!add.length) return null;
  const next = [...list, ...add];
  next.sort((a, b) => (sortKey(a) > sortKey(b) ? 1 : -1));
  return next;
}

/* Fetches the July backfill rows. ⚠️ EVERY failure path returns an EMPTY seed
   rather than throwing or retrying: the caller treats empty as "add nothing",
   which is the only safe answer when we cannot tell what the store already has.
   A 401 or 403 lands here too, and that is correct — someone who cannot read
   the seed must not have rows invented for them either. */
async function fetchJulySeed() {
  try {
    const r = await fetch("/api/cashaudit-seed", { headers: { "x-hub-token": hubToken() } });
    if (!r.ok) return { seed: [], note: "" };
    const j = await r.json();
    if (!j || !j.ok || !Array.isArray(j.seed)) return { seed: [], note: "" };
    return { seed: j.seed, note: String(j.note || "") };
  } catch {
    return { seed: [], note: "" };
  }
}

function nowHM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function emptyReceipt(who) {
  // Amount is OPTIONAL on purpose: Hannah listed date/time/type/who and left it
  // out, but she also wants Cindy reconciling — and reconciling with no amounts
  // means opening every photo to total anything. Optional keeps logging fast
  // without making the reconcile view useless.
  return { id: uid(), date: todayISO(), time: nowHM(), type: RECEIPT_TYPES[0], who: who || "",
    amount: "", note: "", bucket: "", path: "", fileName: "",
    reconciled: false, reconciledBy: "", reconciledAt: "" };
}

function emptyMileage() {
  return { id: uid(), date: todayISO(), name: "", startMiles: "", endMiles: "", reason: "" };
}

function emptyOrder() {
  const o = { id: uid(), date: todayISO(), requestedBy: "", notes: "" };
  ORDER_ITEMS.forEach((d) => (o[d.key] = ""));
  return o;
}

function orderTotal(entry) {
  return ORDER_ITEMS.reduce((sum, d) => sum + (Number(entry[d.key]) || 0) * d.value, 0);
}

function mileageMiles(e) {
  const s = Number(e.startMiles), en = Number(e.endMiles);
  if (!isFinite(s) || !isFinite(en) || en < s) return 0;
  return en - s;
}

function hasCountedEntry(form) {
  const fields = [...DENOMS.map((d) => d.key), "loose", "deposited", "received"];
  return fields.some((k) => form[k] !== undefined && form[k] !== null && String(form[k]).trim() !== "");
}

function formatShiftLabel(e) {
  const d = new Date(e.date + "T00:00:00");
  const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${day} ${e.shift}`;
}

/* The one definition of Expected. Everything reads it from here.

   DEPOSITS leave before the count, so a shift's own deposit always comes
   out of its own Expected.

   CHANGE FUND is different. It arrives mid-day — after the AM count, before
   the PM count. So money "received" on a shift may or may not be sitting in
   that shift's counted total, depending on when the leader counted. The
   leader answers that with `receivedInCount`:

     receivedInCount = true   → the money is already inside counted(N).
                                Add it to Expected(N); it must NOT be added
                                again on the next shift.
     receivedInCount = false  → the money showed up after counted(N).
                                Leave Expected(N) alone; it lands in
                                Expected(N+1).

   The old code always did the first branch. On Jul 3 that inflated the AM
   Expected by $900 and deflated the PM Expected by the same $900 — the
   entries read $900 short, then $900 over. */
function carryExpectedFrom(prevEntry, entry) {
  if (!prevEntry) return null;
  const carriedIn = prevEntry.receivedInCount ? 0 : (Number(prevEntry.received) || 0);
  const ownReceived = entry.receivedInCount ? (Number(entry.received) || 0) : 0;
  return round2(countedTotal(prevEntry) + carriedIn + ownReceived - (Number(entry.deposited) || 0));
}

/* 🐛 CRASHED THE WHOLE TILE ON A REAL iPAD (Aug 9 2026): "null is not an object
   (evaluating 'r.role')".
   ⚠️ A DEFAULT PARAMETER ONLY FIRES FOR `undefined`. It does NOT fire for
   `null`, and App.jsx renders `<Component user={user} />` where `user` is
   initialised to null. So `user = {}` looked like the guard for exactly this
   and was never once doing the job — `user.role` at the reconcile check threw
   the moment anyone opened Cash Audit without a resolved identity.
   The cause of the null is fixed in App.jsx (a saved tier with no saved
   person is not a session). This stays as the belt to that braces: a tile
   must not be able to take itself down over a missing prop. */
export default function CashAudit({ user: userProp, tier = 1 }) {
  const user = userProp || {};
  const [screen, setScreen] = useState("home");
  const [auditEntries, setAuditEntries] = useState([]);
  const [cashierEntries, setCashierEntries] = useState([]);
  const [mileageEntries, setMileageEntries] = useState([]);
  const [receiptEntries, setReceiptEntries] = useState([]);
  const [drivers, setDrivers] = useState([]);
  // null = not read yet. [] = read and unusable, which disables the HR question
  // without touching anything else on this screen.
  const [hrRoster, setHrRoster] = useState(null);
  const [receiptForm, setReceiptForm] = useState(() => emptyReceipt(""));
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptErr, setReceiptErr] = useState("");
  const [receiptMonth, setReceiptMonth] = useState(monthKey(todayISO()));
  // A file <input> is UNCONTROLLED — clearing receiptFile state does NOT clear
  // what the browser displays. Without this ref the form still shows the last
  // photo after a successful upload, and pressing Upload again refuses with
  // "Add a photo" while a file is visibly attached.
  const receiptInput = React.useRef(null);
  // Receipt photos open INSIDE the app. Opening the signed URL in a browser tab
  // works, but parks the raw Supabase host in the address bar for everyone who
  // taps View — no reason to show the team where the backend lives.
  const [receiptView, setReceiptView] = useState(null);   // { url, label }
  /* Emailing a receipt out (Cindy, Aug 10 2026). `bucket`/`path` are carried
     because the SERVER re-fetches the file — the signed url in `receiptView`
     is a short-lived bearer token and must never be what gets emailed. */
  const [mailFor, setMailFor] = useState(null);           // { bucket, path, label }
  const [mailTo, setMailTo] = useState("");
  const [mailNote, setMailNote] = useState("");
  const [mailErr, setMailErr] = useState("");
  const [mailBusy, setMailBusy] = useState(false);
  const [mailSent, setMailSent] = useState("");

  const sendReceipt = async () => {
    if (mailBusy || !mailFor) return;
    const to = mailTo.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) { setMailErr("Enter a full email address."); return; }
    setMailBusy(true);
    try {
      const r = await fetch("/api/receipt-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-token": hubToken() || "" },
        body: JSON.stringify({ bucket: mailFor.bucket, path: mailFor.path, to, label: mailFor.label, note: mailNote.trim() }),
      }).then((x) => x.json());
      /* ⚠️ THE ANSWER IS READ. Resend resolves a 422 on a bad address and a
         403 on an unverified domain, so "it did not throw" is not "it sent" —
         telling somebody a receipt reached their accountant when it never left
         the building is the whole failure this guards. */
      if (!r || !r.ok) {
        const m = {
          forbidden: "You do not have access to email receipts.",
          "bad-address": "That email address does not look right.",
          "not-found": "That receipt could not be found. It may have been deleted.",
          "too-big": "That file is too large to email. Print it instead.",
          "send-failed": "The email did not go out. Try again in a minute.",
        };
        setMailErr(m[r && r.error] || "That did not send. Check the wifi and try again.");
        setMailBusy(false);
        return;
      }
      setMailSent(`Sent to ${to}`);
      setMailFor(null); setMailTo(""); setMailNote(""); setMailErr("");
      setTimeout(() => setMailSent(""), 4000);
    } catch (e) {
      setMailErr("That did not send. Check the wifi and try again.");
    }
    setMailBusy(false);
  };
  const [manageReceipts, setManageReceipts] = useState(false);
  const [orderEntries, setOrderEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);  // the ledger read did not reach the database
  const [manageAudit, setManageAudit] = useState(false);
  const [expandedAudits, setExpandedAudits] = useState({});
  const [manageCashier, setManageCashier] = useState(false);
  const [manageMileage, setManageMileage] = useState(false);
  const [manageOrder, setManageOrder] = useState(false);
  const [editingAuditId, setEditingAuditId] = useState(null);
  const [editingCashierId, setEditingCashierId] = useState(null);
  const [editingMileageId, setEditingMileageId] = useState(null);
  const [auditForm, setAuditForm] = useState(emptyAudit());
  const [autoExpected, setAutoExpected] = useState(true);
  const [cashierForm, setCashierForm] = useState(emptyCashier());
  const [cashierDoc, setCashierDoc] = useState(null);   // File, not yet uploaded
  const [cashierBusy, setCashierBusy] = useState(false);
  const cashierDocInput = React.useRef(null);
  const [mileageForm, setMileageForm] = useState(emptyMileage());
  const [orderForm, setOrderForm] = useState(emptyOrder());
  const [orderSending, setOrderSending] = useState(false);
  const [mileageMonth, setMileageMonth] = useState(monthKey(todayISO()));
  const [odo, setOdo] = useState({});
  const [auditMonth, setAuditMonth] = useState(monthKey(todayISO()));
  const [toast, setToast] = useState("");

  useEffect(() => {
    (async () => {
      let auditList = [];
      /* ★★ A FAILED READ MUST NEVER REACH THE SEED-AND-WRITE BELOW.
         🐛 This used to be `try { ... } catch {}`, which left auditList as [].
         An empty list makes seedJulyEntries return the July starter rows, and
         the next lines WROTE THOSE OVER THE REAL LEDGER — twice, once through
         window.storage and once through kvSet. So one dropped read on shop wifi
         replaced every cash audit entry with the seed. `getResult` tells the
         two apart: ok:false is "we could not reach it", never "it is empty". */
      const a = await window.storage.getResult(AUDIT_KEY, true);
      if (!a || !a.ok) { setLoadFailed(true); setLoading(false); return; }
      try {
        auditList = a.value ? JSON.parse(a.value) : [];
      } catch {
        // Unreadable is not empty either. Stop rather than seed over it.
        setLoadFailed(true); setLoading(false); return;
      }
      /* The seed comes over the wire now — see fetchJulySeed. It is fetched
         AFTER the ledger read above deliberately: if the ledger could not be
         read we have already returned, so a seed can never be applied to a list
         we do not actually know the contents of. */
      const july = await fetchJulySeed();
      const seeded = seedJulyEntries(auditList, july.seed, july.note);
      if (seeded) {
        auditList = seeded;
        try { await window.storage.set(AUDIT_KEY, JSON.stringify(auditList), true); } catch {}
      }
      setAuditEntries(auditList);
      try { await kvSet(AUDIT_KEY, auditList); } catch {}   // backfill existing entries into Hub store (Supabase kv_store) so the change-fund worker can read them
      /* ★★ SAME RULE AS THE LEDGER ABOVE, extended to the five side records —
         they never got the getResult treatment. A failed read rendered
         cashiers/trips/odometer/receipts/orders as EMPTY, and the next save
         wrote that emptiness back: saveOdo spreads {...odo}, so one dropped
         read plus one typed reading wiped every other month's odometer. These
         are money records; if any of them cannot be read, the tile stops. */
      const readAux = async (key) => {
        const r = await window.storage.getResult(key, true);
        if (!r || !r.ok) return { ok: false };
        try { return { ok: true, v: r.value ? JSON.parse(r.value) : null }; }
        catch { return { ok: false }; }
      };
      const cR = await readAux(CASHIER_KEY);
      if (!cR.ok) { setLoadFailed(true); setLoading(false); return; }
      setCashierEntries(cR.v || []);
      const mR = await readAux(MILEAGE_KEY);
      if (!mR.ok) { setLoadFailed(true); setLoading(false); return; }
      setMileageEntries(mR.v || []);
      const oR = await readAux(ODO_KEY);
      if (!oR.ok) { setLoadFailed(true); setLoading(false); return; }
      setOdo(oR.v || {});
      const rR = await readAux(RECEIPTS_KEY);
      if (!rR.ok) { setLoadFailed(true); setLoading(false); return; }
      setReceiptEntries(rR.v || []);
      try {
        const dl = await kvGet(DRIVERS_KEY);          // KV, not window.storage — HR Console owns this; display-only here
        setDrivers(Array.isArray(dl) ? dl : []);
      } catch { setDrivers([]); }
      /* ★ THE REAL ROSTER, FOR THE $5 SHORTAGE QUESTION ONLY (Hannah, Aug 10).
         ⚠️ NOT `KNOWN_NAMES`, AND THAT IS THE POINT. That list is 27 FIRST
         NAMES written into this file: it never changes when somebody is hired
         or terminated, and eight first names are shared on this roster —
         Camila by three, and Monica, Jose, Ashley, Benjamin and both Lizbeths
         collide too. "Monica was $40 short" cannot be resolved to a person, and
         guessing writes a cash shortage onto an innocent person's permanent
         record. Anything that becomes an HR record has to name an id.
         ⚠️ FAILURE IS NOT FATAL HERE. An empty roster only disables the HR
         question; every other part of this tile, including logging the money,
         works exactly as before. A cash record must never be lost because a
         roster read blipped. */
      try {
        const team = await loadHRTeam();
        setHrRoster(Array.isArray(team) ? team : []);
      } catch { setHrRoster([]); }
      const ordR = await readAux(ORDER_KEY);
      if (!ordR.ok) { setLoadFailed(true); setLoading(false); return; }
      setOrderEntries(ordR.v || []);
      setLoading(false);
    })();
  }, []);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(""), 1800); };

  /* ⚠️ window.storage.set passes kvSet's boolean through (main.jsx) and never
     throws — every catch that used to sit on these was unreachable, so a
     refused write flashed the success toast anyway. That is exactly how a
     typed odometer reading "didn't save" with no sign of it (Matt, Jul 31).
     Each save now checks, rolls the screen back, and says so. */
  const storSet = async (key, val) => {
    try { return (await window.storage.set(key, JSON.stringify(val), true)) !== false; }
    catch { return false; }
  };
  async function saveAudit(next) {
    const prev = auditEntries;
    setAuditEntries(next);
    if (!(await storSet(AUDIT_KEY, next))) { setAuditEntries(prev); flash("That did not save — check the wifi and try again."); return false; }
    try { await kvSet(AUDIT_KEY, next); } catch {}   // mirror to Hub store (Supabase kv_store) so the change-fund worker can read entries
    return true;
  }
  async function saveCashier(next) {
    const prev = cashierEntries;
    setCashierEntries(next);
    if (!(await storSet(CASHIER_KEY, next))) { setCashierEntries(prev); flash("That did not save — check the wifi and try again."); return false; }
    return true;
  }
  async function saveReceipts(next) {
    const prev = receiptEntries;
    setReceiptEntries(next);
    if (!(await storSet(RECEIPTS_KEY, next))) { setReceiptEntries(prev); flash("That did not save — check the wifi and try again."); return false; }
    return true;
  }

  // Upload the photo FIRST, and only record the entry if it lands. A receipt row
  // with no image is worse than no row — it looks logged and isn't.
  async function submitReceipt(e) {
    e.preventDefault();
    setReceiptErr("");
    if (!receiptFile) { setReceiptErr("Add a photo of the receipt."); return; }
    if (!receiptForm.who.trim()) { setReceiptErr("Who handled it?"); return; }
    /* Hannah, Jul 29 2026: a REFUND must carry a typed reason as well as the
       leader submitting it. Paid in and paid out keep the note optional — she
       asked for this on refunds specifically, and requiring it everywhere would
       slow down the logging the whole tile exists to make fast.
       ⚠️ Checked HERE as well as in the UI. The label below turns the field
       required-looking, but a stale `receiptForm` left over from switching type
       after typing would otherwise walk straight past it. The screen says it and
       the submit enforces it. */
    if (receiptForm.type === "Refund" && !receiptForm.note.trim()) {
      setReceiptErr("A refund needs a reason. Say what was refunded and why.");
      return;
    }
    if (receiptFile.size > 15 * 1024 * 1024) { setReceiptErr("That photo is over 15 MB — take a smaller one."); return; }
    setReceiptBusy(true);
    try {
      const safe = (receiptFile.name || "receipt.jpg").replace(/[^\w.\-]+/g, "_");
      const path = `${monthKey(receiptForm.date)}/${Date.now()}-${safe}`;
      const loc = await uploadDoc(RECEIPT_BUCKET, path, receiptFile);
      const entry = { ...receiptForm, id: uid(), bucket: loc.bucket, path: loc.path,
        fileName: receiptFile.name || "receipt", loggedAt: new Date().toISOString() };
      await saveReceipts([entry, ...receiptEntries]);
      setReceiptMonth(monthKey(entry.date));
      setReceiptForm(emptyReceipt(user.name || ""));
      setReceiptFile(null);
      if (receiptInput.current) receiptInput.current.value = "";
      flash("Receipt uploaded");
    } catch (x) {
      setReceiptErr(x && x.message ? x.message : "Upload failed. Try again.");
    } finally { setReceiptBusy(false); }
  }

  /* ── PRINT A RECEIPT (Cindy, Aug 10 2026: "allow printing and emailing paid
        out receipts that have been uploaded into the cash portal") ──────────
     Opens the receipt on its own so the browser's own print dialog handles it,
     which is what works on a store iPad as well as a laptop.
     ⚠️ THE LABEL IS ESCAPED. It is built from receipt fields somebody typed
     (type, date, time), and it is being written into a document — unescaped
     that is an injection into a page holding a signed link to a private file.
     ⚠️ SAME-ORIGIN AND SHORT-LIVED. The src is /api/doc-view on gatecityhub.com,
     never a provider URL, so nothing leaks the backend host and the link dies
     in five minutes either way — see signedDocUrl.
     ⚠️ NO noopener HERE, deliberately: it makes window.open return null in some
     browsers and we need the handle to write into. Our own origin, our own tab. */
  function printReceipt(v) {
    if (!v || !v.url) return;
    const esc = (x) => String(x || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) { flash("Allow pop-ups to print this receipt"); return; }
    w.document.write(
      '<!doctype html><meta charset="utf-8"><title>Receipt \u00b7 ' + esc(v.label) + '</title>' +
      '<style>html,body{margin:0;padding:0;background:#fff}' +
      'h1{font:600 13px system-ui,-apple-system,sans-serif;color:#333;margin:12px 16px 8px}' +
      'img{display:block;max-width:100%;margin:0 auto}' +
      '@media print{h1{margin:0 0 8px}}</style>' +
      '<h1>' + esc(v.label) + '</h1>' +
      '<img src="' + esc(v.url) + '" alt="Receipt" onload="window.focus();window.print()">'
    );
    w.document.close();
  }

  async function viewReceipt(r) {
    const url = await signedDocUrl(r.bucket, r.path, 300);
    if (!url) { flash("Couldn't open that receipt"); return; }
    // PDFs can't render in an <img>; those still hand off to the browser.
    if (/\.pdf$/i.test(r.fileName || "")) { window.open(url, "_blank", "noopener"); return; }
    setReceiptView({ url, label: `${r.type} \u00b7 ${r.date} ${r.time}`, bucket: r.bucket, path: r.path });
  }

  function toggleReconciled(id) {
    const by = user.name || "—";
    saveReceipts(receiptEntries.map((r) => (r.id === id
      ? (r.reconciled
          ? { ...r, reconciled: false, reconciledBy: "", reconciledAt: "" }
          : { ...r, reconciled: true, reconciledBy: by, reconciledAt: new Date().toISOString() })
      : r)));
  }

  function deleteReceipt(id) {
    const r = receiptEntries.find((x) => x.id === id);
    // Purge the photo BEFORE we drop the record and lose {bucket,path} — otherwise
    // the image sits in the bucket forever with nothing pointing at it. deleteDoc
    // swallows failures and returns false, so a storage error still removes the
    // record (the image just lingers, logged) and the delete stays instant.
    // Requires the anon DELETE policy on the Receipts bucket, added Jul 22.
    if (r && r.bucket && r.path) deleteDoc(r.bucket, r.path);
    saveReceipts(receiptEntries.filter((x) => x.id !== id));
    flash("Receipt removed");
  }

  async function saveOdo(month, patch) {
    const prev = odo;
    const next = { ...odo, [month]: { ...(odo[month] || { start: "", end: "", note: "" }), ...patch } };
    setOdo(next);
    if (!(await storSet(ODO_KEY, next))) {
      setOdo(prev);
      flash("The reading did not save — check the wifi and enter it again.");
      return false;
    }
    return true;
  }

  async function saveMileage(next) {
    const prev = mileageEntries;
    setMileageEntries(next);
    if (!(await storSet(MILEAGE_KEY, next))) { setMileageEntries(prev); flash("That did not save — check the wifi and try again."); return false; }
    return true;
  }
  async function saveOrders(next) {
    const prev = orderEntries;
    setOrderEntries(next);
    if (!(await storSet(ORDER_KEY, next))) { setOrderEntries(prev); flash("That did not save — check the wifi and try again."); return false; }
    return true;
  }

  function findPrevious(date, shift, excludeId) {
    const key = `${date}-${SHIFT_ORDER[shift] ?? 0}`;
    const candidates = auditEntries
      .filter((e) => e.id !== excludeId && sortKey(e) < key)
      .sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : -1));
    return candidates[0] || null;
  }

  const previousEntry = useMemo(
    () => findPrevious(auditForm.date, auditForm.shift, auditForm.id),
    [auditForm.date, auditForm.shift, auditForm.id, auditEntries]
  );

  useEffect(() => {
    if (!autoExpected) return;
    if (!previousEntry) return;
    const calc = carryExpectedFrom(previousEntry, auditForm).toFixed(2);
    setAuditForm((f) => (f.expected === calc ? f : { ...f, expected: calc }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoExpected, previousEntry, auditForm.deposited, auditForm.received, auditForm.receivedInCount]);

  /* FIX 1 — Expected is recomputed from the carry basis AT SAVE TIME.
     The effect above keeps the field live while typing, but a save must
     never trust form state that could have gone stale. If auto-carry is
     on, the stored figure is derived here, from the deposit that is
     actually being saved alongside it. */
  function submitAudit(e) {
    e.preventDefault();
    const entry = { ...auditForm };
    if (autoExpected) {
      const prev = findPrevious(entry.date, entry.shift, entry.id);
      const carry = carryExpectedFrom(prev, entry);
      if (carry != null) entry.expected = carry.toFixed(2);
    }
    const exists = auditEntries.some((x) => x.id === entry.id);

    /* ⛔⛔ A BLANK DENOMINATION GRID IS NOT A COUNT OF ZERO, AND SAVING ONE
       FILES A SHORTAGE NOBODY MEASURED.

       Matt, Aug 21 2026, off his own ledger: "we need a guard to prevent this
       from happening." Fri Aug 21 PM read every denomination $0.00, Tills
       $1000.00, Expected $3290.00, Over / Short −$2290.00. The safe was never
       counted. `emptyAudit` ships tills prefilled at "1000" and every
       denomination blank, so opening the form and pressing Save is enough.

       ⚠️⚠️ AND IT DOES NOT STOP AT THE LEDGER. That row lands in the month's
       net over/short, in the flagged list, and on the EOS scorecard as a
       variance the store then has to explain. The money rules in CLAUDE.md
       already decide this one: a write path unsure of the shape it is
       producing must FAIL LOUDLY rather than save. A visible error gets
       reported; a silently wrong figure does not.

       ⇒ The rule is in `cashCount.js` so a test can run it, and it reads
       BLANK rather than ZERO — a safe counted and found empty is ten typed
       zeroes, which is a real reading and still saves. Absent and zero are
       different facts, which is the rule this repo keeps relearning.

       ⚠️ NEW ENTRIES ONLY. Rows written before the grid existed carry no
       denomination keys at all, so they read as blank forever; refusing to let
       somebody edit one would be worse than what this prevents (rule 1). */
    const uncounted = uncountedSafe(entry, { isNew: !exists });
    if (uncounted != null) {
      flash(`Count the safe first — every denomination is blank, so this would file ${money(uncounted)}.`);
      return;
    }
    const next = exists ? auditEntries.map((x) => (x.id === entry.id ? entry : x)) : [...auditEntries, entry];
    next.sort((a, b) => (sortKey(a) > sortKey(b) ? 1 : -1));
    saveAudit(next);
    flash(exists ? "Entry updated" : "Entry saved");
    setAuditForm(emptyAudit());
    setAutoExpected(true);
    setEditingAuditId(null);
  }

  /* ⚠️ THE SIGN IS WRITTEN HERE, NEVER TYPED. `amount` in the form is a
     magnitude; the stored value is signed from the Short/Over choice. That is
     the whole change: the ledger's shape is untouched and the one way to get it
     wrong is gone.
     ⚠️ async NOW, because a shortage over $5 may carry a photo that has to
     upload before the row is written. A row saved with a document that failed
     to upload would claim paperwork that does not exist. */
  async function submitCashier(e) {
    e.preventDefault();
    if (cashierBusy) return;
    const mag = Math.abs(Number(cashierForm.amount) || 0);
    if (!cashierForm.kind) { flash("Choose Short or Over first"); return; }
    if (!(mag > 0)) { flash("Enter an amount"); return; }

    const short = cashierForm.kind === "short";
    /* ⚠️ ONLY EVER CARRIED THROUGH FROM AN OLD ROW NOW, never typed. No input
       writes `reason` since the comment below became the one box, but a row
       logged between Aug 10 and today may hold one and an edit must not eat it.
       See cashierFormFrom, which promotes it when there is no note beside it. */
    const reason = String(cashierForm.reason || "").trim();

    /* ★ EVERY ENTRY CARRIES A TYPED COMMENT (Nick via Hannah, Aug 11 2026:
       "require a comment when they submit discrepancies").

       ⚠️ THIS REPLACES BRI'S PHOTO-OR-REASON GATE RATHER THAN SITTING BESIDE
       IT, AND IT IS STRICTLY STRONGER. Hers ("If a shortage of more than $5 is
       input, prompt the leader to submitting document immediately before they
       can submit") fired only on a shortage of $5 or more, and a photo alone
       answered it — so a $5 shortage could be filed with a picture and no
       words, and a $4.99 one with neither. This fires on every entry in the
       log and only a sentence answers it, which covers hers on both counts.
       Leaving both would be two gates asking for the same sentence a dollar
       apart: exactly the rule nobody could explain on the floor that
       SHORT_DOC_AT was rewritten to get out of.

       ⚠️ TRIMMED, so the browser's own `required` cannot be satisfied with a
       space, and so the stored value is the trimmed one. */
    const comment = String(cashierForm.notes || "").trim();
    if (!comment) { flash("Say what happened before you log this"); return; }

    const needsDoc = short && mag >= SHORT_DOC_AT;
    /* ★ AND THE PERSON, ON A SHORTAGE OF $5 OR MORE (Hannah, Aug 11 2026: "Yes
       require a name before they submit").

       ⚠️ THIS CLOSES A HOLE IN HER OWN AUG 10 RULE. She asked that a shortage of
       $5 or more be documented on the team member's file. The picker was built
       and left optional, so a leader could log a $40 shortage, type a sentence,
       skip the name, and the entry never reached her Cash Shortages card — the
       one part of the rule that does anything. It was raised with her and this
       is her answer.

       ⚠️ IT IS ONLY EVER ASKED WHERE HER RULE APPLIES. Overages and shortages
       under $5 do not ask, so the daily flow is untouched. The typed first name
       above stays as it always was; this is the roster id, because a name
       reaching somebody's permanent file has to be a person, not a spelling.

       ⚠️ IF THE ROSTER DID NOT LOAD, THE ENTRY STILL SAVES. The screen says so
       and tells the leader to tell Hannah. Blocking a CASH record because a
       roster read blipped would lose the money to protect the paperwork, which
       is the wrong way round — and the leader would have no way to comply. */
    if (needsDoc && hrRoster && hrRoster.length && !cashierForm.personId) {
      flash(`A shortage of ${money(SHORT_DOC_AT)} or more needs the team member who was on the drawer`);
      return;
    }

    setCashierBusy(true);
    let doc = null;
    try {
      if (cashierDoc) {
        if (cashierDoc.size > 15 * 1024 * 1024) { flash("That photo is over 15 MB — take a smaller one."); setCashierBusy(false); return; }
        const safe = (cashierDoc.name || "shortage.jpg").replace(/[^\w.\-]+/g, "_");
        const loc = await uploadDoc(RECEIPT_BUCKET, `${monthKey(cashierForm.date)}/short-${Date.now()}-${safe}`, cashierDoc);
        doc = { bucket: loc.bucket, path: loc.path, fileName: cashierDoc.name || "document" };
      }
    } catch (x) {
      setCashierBusy(false);
      flash(x && x.message ? x.message : "That document did not upload. Try again.");
      return;
    }

    const prevRow = cashierEntries.find((x) => x.id === cashierForm.id) || null;
    const exists = !!prevRow;
    /* ⚠️ `loggedBy` IS THE ORIGINAL LOGGER, kept through an edit. Bri asked to
       know who logged the entry; overwriting it when somebody corrects a typo
       would answer a different question. Rows written before today have none
       and show nothing rather than a name that was never true. */
    const entry = {
      id: cashierForm.id,
      name: cashierForm.name,
      date: cashierForm.date,
      amount: short ? -mag : mag,
      notes: comment,
      reason,
      doc: doc || (prevRow && prevRow.doc) || null,
      loggedBy: (prevRow && prevRow.loggedBy) || user.name || "",
      loggedAt: (prevRow && prevRow.loggedAt) || new Date().toISOString(),
    };
    if (cashierForm.personId) entry.personId = cashierForm.personId;
    const next = exists ? cashierEntries.map((x) => (x.id === entry.id ? entry : x)) : [...cashierEntries, entry];
    next.sort((a, b) => b.date.localeCompare(a.date));
    await saveCashier(next);
    /* ★ RAISE IT WITH HR, AFTER the money is safely saved (Hannah, Aug 10).
       ⚠️ ORDER MATTERS AND THIS IS THE RIGHT WAY ROUND. The cash ledger is the
       record of record; the HR queue is a worklist built from it. If this throws
       or the write is refused, the shortage is already saved and the worst case
       is Hannah never hears about one entry. The other order risks losing the
       money record to a failure in a secondary feature.
       ⚠️ ONLY ON CREATE, NEVER ON EDIT (`!exists`). Correcting a typo on a
       shortage must not queue a second entry against the same person for the
       same money.
       ⚠️ READ-THEN-APPEND, not a blind write. Two leaders closing drawers at the
       same moment on different iPads is exactly the shape that ate three of
       Bri's goal submissions on Aug 1 — the fix there was to read the latest
       list first, and this follows it. */
    if (!exists && needsDoc && cashierForm.personId) {
      try {
        const who = (hrRoster || []).find((m) => String(m.id) === String(cashierForm.personId));
        const prior = await kvGet(CASH_DOC_QUEUE_KEY);
        const queue = Array.isArray(prior) ? prior : [];
        await kvSet(CASH_DOC_QUEUE_KEY, [{
          id: `cd-${entry.id}`,
          cashId: entry.id,
          personId: String(cashierForm.personId),
          personName: (who && who.name) || cashierForm.name || "",
          amount: entry.amount,
          date: entry.date,
          /* ⚠️ THE COMMENT, NOT `reason`. HR Console prints this row's `reason`
             under the person's name (HRConsole.jsx: `{d.reason && ...}`), and
             since today the leader's sentence lands in `notes`. Left as it was,
             every shortage queued from now on would reach Hannah with the
             amount, the date and no words at all. */
          reason: comment,
          hasDoc: !!doc,
          loggedBy: user.name || "",
          at: new Date().toISOString(),
          status: "pending",
        }, ...queue]);
      } catch { /* the money is saved; a queue blip must not fail the entry */ }
    }
    setCashierBusy(false);
    flash(exists ? "Entry updated" : "Entry logged");
    setCashierForm(emptyCashier());
    setCashierDoc(null);
    if (cashierDocInput.current) cashierDocInput.current.value = "";
    setEditingCashierId(null);
  }

  function submitMileage(e) {
    e.preventDefault();
    const entry = { ...mileageForm };
    const exists = mileageEntries.some((x) => x.id === entry.id);
    const next = exists ? mileageEntries.map((x) => (x.id === entry.id ? entry : x)) : [...mileageEntries, entry];
    next.sort((a, b) => a.date.localeCompare(b.date));
    saveMileage(next);
    flash(exists ? "Trip updated" : "Trip logged");
    setMileageMonth(monthKey(entry.date));
    setMileageForm(emptyMileage());
    setEditingMileageId(null);
  }

  async function submitOrder(e) {
    e.preventDefault();
    const entry = { ...orderForm };
    const total = orderTotal(entry);
    if (total <= 0) { flash("Enter at least one amount"); return; }
    setOrderSending(true);
    const next = [entry, ...orderEntries];
    await saveOrders(next);
    const lines = ORDER_ITEMS
      .filter((d) => (Number(entry[d.key]) || 0) > 0)
      .map((d) => `• ${d.label}: ${money(Number(entry[d.key]) || 0)}`)
      .join("\n");
    try {
      await notifyTool({
        tool: "cashaudit",
        subject: `Change fund order — ${entry.date} · ${money(total)}`,
        text:
          `${entry.requestedBy || "A leader"} submitted a change fund order on ${entry.date}.\n\n` +
          `Order:\n${lines}\n\nTotal: ${money(total)}` +
          (entry.notes.trim() ? `\n\nNotes: ${entry.notes.trim()}` : "") +
          `\n\nThe order log is in ${STORE.appName} → Cash Audit.`,
      });
      flash(`Order saved & emailed to ${CASH_SEAT_FIRST}`);
    } catch {
      flash("Order saved — email failed, retry from log");
    }
    setOrderSending(false);
    setOrderForm(emptyOrder());
  }

  async function resendOrder(entry) {
    const total = orderTotal(entry);
    const lines = ORDER_ITEMS
      .filter((d) => (Number(entry[d.key]) || 0) > 0)
      .map((d) => `• ${d.label}: ${money(Number(entry[d.key]) || 0)}`)
      .join("\n");
    try {
      await notifyTool({
        tool: "cashaudit",
        subject: `Change fund order — ${entry.date} · ${money(total)}`,
        text:
          `${entry.requestedBy || "A leader"} submitted a change fund order on ${entry.date}.\n\n` +
          `Order:\n${lines}\n\nTotal: ${money(total)}` +
          (entry.notes && entry.notes.trim() ? `\n\nNotes: ${entry.notes.trim()}` : "") +
          `\n\nThe order log is in ${STORE.appName} → Cash Audit.`,
      });
      flash(`Emailed to ${CASH_SEAT_FIRST}`);
    } catch {
      flash("Email failed — try again");
    }
  }

  function deleteAudit(id) { saveAudit(auditEntries.filter((x) => x.id !== id)); flash("Entry deleted"); }
  function deleteCashier(id) { saveCashier(cashierEntries.filter((x) => x.id !== id)); flash("Entry deleted"); }
  function deleteMileage(id) { saveMileage(mileageEntries.filter((x) => x.id !== id)); flash("Trip deleted"); }
  function deleteOrder(id) { saveOrders(orderEntries.filter((x) => x.id !== id)); flash("Order deleted"); }

  /* FIX 2 — Only drop out of auto-carry when the stored Expected is a
     REAL manual override. The old code turned it off on every edit, which
     meant correcting a deposit left Expected frozen at the old value. */
  function startEditAudit(e) {
    setAuditForm(e);
    setEditingAuditId(e.id);
    const prev = findPrevious(e.date, e.shift, e.id);
    const carry = carryExpectedFrom(prev, e);
    if (carry == null) { setAutoExpected(false); return; }
    setAutoExpected(Math.abs((Number(e.expected) || 0) - carry) < 0.005);
  }

  const dashboard = useMemo(() => {
    const totalCounted = auditEntries.reduce((s, e) => s + countedTotal(e), 0);
    const totalExpected = auditEntries.reduce((s, e) => s + (Number(e.expected) || 0), 0);
    const totalOverShort = totalCounted - totalExpected;
    const flagged = auditEntries.filter((e) => Math.abs(countedTotal(e) - (Number(e.expected) || 0)) >= 10);

    const byName = {};
    cashierEntries.forEach((e) => {
      byName[e.name] = byName[e.name] || { total: 0, count: 0, name: e.name };
      byName[e.name].total += Number(e.amount) || 0;
      byName[e.name].count += 1;
    });
    const cashierList = Object.values(byName).sort((a, b) => a.total - b.total);

    return { totalCounted, totalExpected, totalOverShort, flagged, cashierList };
  }, [auditEntries, cashierEntries]);

  /* Bri, Aug 7 2026: "a total shortage and total overage per month".
     ⚠️ TWO FIGURES, NEVER ONE NET. A month that is $80 short and $80 over nets
     to zero and reads as a clean month, which is the exact opposite of true.
     Six months is enough to see a trend without turning the screen into a
     ledger nobody scrolls. */
  const cashierMonths = useMemo(() => {
    const by = {};
    (cashierEntries || []).forEach((e) => {
      const k = monthKey(e.date);
      if (!k) return;
      by[k] = by[k] || { key: k, short: 0, over: 0, count: 0 };
      const n = Number(e.amount) || 0;
      if (n < 0) by[k].short += n; else by[k].over += n;
      by[k].count += 1;
    });
    return Object.values(by).sort((a, b) => b.key.localeCompare(a.key)).slice(0, 6);
  }, [cashierEntries]);

  // Net over/short "resets" each month via month buckets — no wipe, no
  // broken carry chain. Every screen reads the selected month from here.
  const auditMonths = useMemo(() => {
    const set = new Set(auditEntries.map((e) => monthKey(e.date)));
    set.add(monthKey(todayISO()));
    return Array.from(set).sort().reverse();
  }, [auditEntries]);

  const monthStats = useMemo(() => {
    const inMonth = auditEntries.filter((e) => monthKey(e.date) === auditMonth);
    const counted = inMonth.reduce((s, e) => s + countedTotal(e), 0);
    const expected = inMonth.reduce((s, e) => s + (Number(e.expected) || 0), 0);
    const overShort = counted - expected;
    const flagged = inMonth.filter((e) => Math.abs(countedTotal(e) - (Number(e.expected) || 0)) >= 10);
    return { counted, expected, overShort, flagged, count: inMonth.length };
  }, [auditEntries, auditMonth]);

  // ── Publish cash variance to the EOS scorecard feed so board row s8 goes
  // live. CashAudit keeps its own ledger on window.storage, but the EOS tile
  // reads the Hub store (store.js), so this one publish goes through kvGet/kvSet.
  // Read-merge-write: touches only s8, never clobbers rows other tools publish.
  //
  // ⚠️ PUBLISHES THE CURRENT MONTH, NOT THE MONTH BEING VIEWED. `monthStats`
  // follows the `auditMonth` dropdown, so publishing off it meant that simply
  // OPENING a past month in the audit view rewrote the live EOS board with that
  // old month's variance — the board would silently report June while sitting in
  // front of the team. Browsing history must never move a live number.
  //
  // ⚠️ QUARTER IS DERIVED. A hardcoded "2026-Q3" here would go dark on 10/1:
  // this file would keep writing to Q3 while EOSTile reads eosPeriod().
  const liveVariance = useMemo(() => {
    const cm = monthKey(todayISO());
    const inMonth = auditEntries.filter((e) => monthKey(e.date) === cm);
    if (!inMonth.length) return null; // no entries this month yet — publish nothing rather than a fake $0.00
    const counted = inMonth.reduce((s, e) => s + countedTotal(e), 0);
    const expected = inMonth.reduce((s, e) => s + (Number(e.expected) || 0), 0);
    return counted - expected;
  }, [auditEntries]);

  useEffect(() => {
    if (liveVariance == null) return;
    const v = Math.abs(liveVariance);
    let cancelled = false;
    (async () => {
      try {
        const key = `eos:scorecard:${eosPeriod()}`;
        // publishSharedRows: a FAILED read publishes nothing, instead of
        // arriving here as {} and wiping every row but s8.
        if (!cancelled) await publishSharedRows(key, { s8: { actual: money(v), goal: "≤ $10", hit: v <= 10 } });
      } catch { /* best-effort feed */ }
    })();
    return () => { cancelled = true; };
  }, [liveVariance]);

  const mileageMonths = useMemo(() => {
    const set = new Set(mileageEntries.map((e) => monthKey(e.date)));
    set.add(monthKey(todayISO()));
    return Array.from(set).sort().reverse();
  }, [mileageEntries]);

  const mileageForMonth = useMemo(
    () => mileageEntries.filter((e) => monthKey(e.date) === mileageMonth).sort((a, b) => a.date.localeCompare(b.date)),
    [mileageEntries, mileageMonth]
  );
  const mileageTotals = useMemo(() => {
    const miles = mileageForMonth.reduce((s, e) => s + mileageMiles(e), 0);
    return { miles, reimbursement: miles * mileageRate() };
  }, [mileageForMonth]);

  // ── ODOMETER RECONCILIATION ──────────────────────────────────────────────
  // The point of the two readings isn't record-keeping, it's the COMPARISON:
  // odometer travelled minus miles logged = miles the car did that nobody wrote
  // a trip for. That gap is the number worth looking at, so it is what gets
  // shown — not two figures side by side leaving the arithmetic to the reader.
  //
  // `null` where a reading is missing, NOT 0 — a blank end-reading must read as
  // "not filled in", never as "the car did minus four hundred miles".
  const odoStats = useMemo(() => {
    const rec = odo[mileageMonth] || {};
    const typedStart = String(rec.start ?? "").trim() === "" ? null : Number(rec.start);
    /* AUTO-CARRY (Matt, Aug 1 2026: "the odometer should auto carry"). When
       this month's start is blank, it defaults to LAST month's ENDING
       reading — the same "beginning = last month's ending" pattern the Food
       Cost tile uses. It is a COMPUTED default, shown on screen and used in
       the math, but never written to storage on its own: a real typed start
       always wins, and no stored month is edited behind Cindy's back (the
       no-surgical-writes rule). So Cindy enters the end each month and the
       start carries itself. */
    const prevEnd = String((odo[prevMonthKey(mileageMonth)] || {}).end ?? "").trim();
    const carried = prevEnd === "" ? null : Number(prevEnd);
    const carriedOk = carried !== null && isFinite(carried);
    const startCarried = typedStart === null && carriedOk;
    const start = typedStart !== null ? typedStart : (carriedOk ? carried : null);
    const end = String(rec.end ?? "").trim() === "" ? null : Number(rec.end);
    const bad = (v) => v !== null && !isFinite(v);
    const carryFields = { startCarried, carriedFrom: startCarried ? prevMonthKey(mileageMonth) : null };
    if (start === null || end === null || bad(start) || bad(end)) {
      // NORMALISE NaN BACK TO null. A non-numeric reading used to come out as
      // NaN, and the panel tests `start === null` to decide whether to prompt —
      // NaN isn't null, so it fell through to the "gap" branch, where
      // Math.abs(null) is 0 and it rendered a green "every mile is accounted
      // for" on top of nonsense. Caught by the test, not by reading it.
      return { start: bad(start) ? null : start, end: bad(end) ? null : end,
        travelled: null, gap: null, backwards: false, ...carryFields, note: rec.note || "" };
    }
    const travelled = end - start;
    return {
      start, end, travelled,
      // Negative means the readings are the wrong way round or mistyped —
      // surfaced as its own state rather than a nonsense negative gap.
      backwards: travelled < 0,
      gap: travelled < 0 ? null : travelled - mileageTotals.miles,
      ...carryFields,
      note: rec.note || "",
    };
  }, [odo, mileageMonth, mileageTotals.miles]);

  /* ── WHAT NICK ACTUALLY GETS PAID ────────────────────────────────────────
     Matt, Jul 31 2026: "there should be a month start amount and then I update
     the month end so that it catches any gaps in documentation so Nick gets
     paid the full amount… Make sure it calculates the total amount for Cindy
     who inputs it."

     🐛 THE MONEY WAS COMING OFF THE WRONG NUMBER. Reimbursement was
     `logged trip miles × rate`, so any mile nobody wrote a trip for was simply
     never paid. The odometer gap was already computed and shown on screen and
     then ignored by the arithmetic — the two readings existed to catch exactly
     that shortfall and it went nowhere.

     ⇒ The odometer is the source of truth when BOTH readings are present and
     sane. The trip log stays exactly as it is, because corporate wants that
     sheet for the records — this adds a number, it does not replace the sheet.
     ⚠️ FALLS BACK TO THE TRIP LOG, never to zero: mid-month there is no end
     reading yet, and a blank end must not read as "no miles". `basis` says
     which number was used so the screen can be honest about it rather than
     showing a total with no explanation. */
  const payable = useMemo(() => {
    const useOdo = odoStats.travelled !== null && !odoStats.backwards;
    const miles = useOdo ? odoStats.travelled : mileageTotals.miles;
    return { miles, amount: miles * mileageRate(), basis: useOdo ? "odometer" : "trips" };
  }, [odoStats, mileageTotals.miles]);

  function handlePrint() { window.print(); }

  /* An empty ledger on screen would read as "there are no entries", which is the
     same false answer the seeding bug used to write to the database. Say what
     actually happened instead. */
  if (loadFailed) {
    return (
      <div style={{ background: INK, minHeight: 600 }} className="flex items-center justify-center px-6 text-center">
        <div>
          <div className="text-sm font-semibold" style={{ color: "#fff" }}>Couldn&rsquo;t load the ledger</div>
          <div className="text-sm mt-2" style={{ color: MUTED, maxWidth: 380 }}>
            The Hub couldn&rsquo;t reach the database. Nothing has been changed or
            deleted. Check the connection and reopen Cash Audit.
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ background: INK, minHeight: 600 }} className="flex items-center justify-center text-sm">
        <span style={{ color: MUTED, fontFamily: "ui-monospace, monospace" }}>loading ledger&hellip;</span>
      </div>
    );
  }

  return (
    <>
      <style>{globalStyles}</style>
      <div style={{ background: INK, minHeight: 600 }} className="no-print font-sans">
        {renderScreen()}
        {toast && <Toast msg={toast} />}
      </div>
      <PrintSheet month={mileageMonth} entries={mileageForMonth} totals={mileageTotals} />
    </>
  );

  function renderScreen() {
    if (screen === "home") return HomeScreen();
    if (screen === "safe-entry") return SafeEntryScreen();
    if (screen === "safe-dash") return SafeDashScreen();
    if (screen === "cashier") return CashierScreen();
    if (screen === "mileage") return MileageScreen();
    if (screen === "change") return ChangeOrderScreen();
    if (screen === "receipts") return ReceiptsScreen();
    return null;
  }

  // ---------------- HOME ----------------
  function HomeScreen() {
    const net = monthStats.overShort;
    const netColor = net < -0.004 ? RED : net > 0.004 ? GREEN : AMBER;
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <TopBar title="Cash Audit" />

        <div className="ledger-hero mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="eyebrow">Net position &middot; {monthLabel(auditMonth)}</div>
              <div className="led-number" style={{ color: netColor, fontSize: "2.25rem" }}>{money(net)}</div>
              <div className="text-xs" style={{ color: MUTED, marginTop: 2 }}>Resets monthly &middot; {monthStats.count} shift{monthStats.count === 1 ? "" : "s"} this month</div>
            </div>
            <div className="text-right">
              <div className="eyebrow">Flagged shifts</div>
              <div className="led-number" style={{ color: monthStats.flagged.length ? RED : MUTED, fontSize: "1.5rem" }}>
                {String(monthStats.flagged.length).padStart(2, "0")}
              </div>
              <select value={auditMonth} onChange={(e) => setAuditMonth(e.target.value)} className="input" style={{ width: "auto", marginTop: 8 }}>
                {auditMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <TileRow emoji="&#129790;" title="Safe Audit Entry" desc="Log a shift's till count, deposit, and over/short." onClick={() => setScreen("safe-entry")} />
          <TileRow emoji="&#128202;" title="Safe Audit Dashboard" desc={`${auditEntries.length} shift${auditEntries.length === 1 ? "" : "s"} on record`} onClick={() => setScreen("safe-dash")} />
          <TileRow emoji="&#128100;" title={CASHIER_LOG_NAME} desc={`${cashierEntries.length} logged entr${cashierEntries.length === 1 ? "y" : "ies"}`} onClick={() => setScreen("cashier")} />
          <TileRow emoji="&#128663;" title="Catering Mileage" desc={`${mileageEntries.length} trip${mileageEntries.length === 1 ? "" : "s"} logged`} onClick={() => setScreen("mileage")} />
          <TileRow emoji="&#129534;" title="Receipts" desc={`${receiptEntries.length} uploaded${receiptEntries.filter((r) => !r.reconciled).length ? ` &middot; ${receiptEntries.filter((r) => !r.reconciled).length} to reconcile` : ""}`} onClick={() => setScreen("receipts")} />
          <TileRow emoji="&#127974;" title="Change Fund Order" desc={`${orderEntries.length} order${orderEntries.length === 1 ? "" : "s"} logged &middot; emails ${CASH_SEAT_FIRST}`} onClick={() => setScreen("change")} />
        </div>

        <div className="mt-6">
          <OrderInstructions />
        </div>
      </div>
    );
  }

  // ---------------- SAFE AUDIT ENTRY ----------------
  function SafeEntryScreen() {
    const counted = countedTotal(auditForm);
    const expected = Number(auditForm.expected) || 0;
    const overShort = counted - expected;
    const osColor = overShort < -0.004 ? RED : overShort > 0.004 ? GREEN : MUTED;
    const hasEntry = hasCountedEntry(auditForm);

    const prevActual = previousEntry ? countedTotal(previousEntry) : null;
    const depNum = Number(auditForm.deposited) || 0;
    const recNum = Number(auditForm.received) || 0;
    const carriedIn = previousEntry && !previousEntry.receivedInCount ? (Number(previousEntry.received) || 0) : 0;
    const ownRecIn = auditForm.receivedInCount ? recNum : 0;
    const carryExpected = carryExpectedFrom(previousEntry, auditForm);
    const carryMismatch =
      !autoExpected && carryExpected != null && Math.abs(expected - carryExpected) >= 0.005;

    return (
      <div className="p-6 max-w-3xl mx-auto">
        <TopBar title="Safe Audit Entry" onBack={() => setScreen("home")}
          action={<button onClick={() => setManageAudit((m) => !m)} className="btn-ghost">{manageAudit ? "Done" : "Manage"}</button>} />

        <form onSubmit={submitAudit} className="panel p-5 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Field label="Date">
              <input type="date" value={auditForm.date} onChange={(e) => setAuditForm({ ...auditForm, date: e.target.value })} className="input" required />
            </Field>
            <Field label="Shift">
              <select value={auditForm.shift} onChange={(e) => setAuditForm({ ...auditForm, shift: e.target.value })} className="input">
                {SHIFTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Leader">
              <input value={auditForm.leader} onChange={(e) => setAuditForm({ ...auditForm, leader: e.target.value })} className="input" placeholder="Initials" />
            </Field>
            <Field label="Tills ($)">
              <input type="number" step="0.01" inputMode="decimal" value={auditForm.tills} onChange={(e) => setAuditForm({ ...auditForm, tills: e.target.value })} className="input" />
            </Field>
            <Field label="Loose / other ($)">
              <input type="number" step="0.01" inputMode="decimal" value={auditForm.loose ?? ""} onChange={(e) => setAuditForm({ ...auditForm, loose: e.target.value })} className="input" placeholder="0.00" />
            </Field>
          </div>

          {/* FIX 3 — Expected, and where it came from, BEFORE any counting.
              Leaders used to see nothing here until counts were entered. */}
          <div className="ledger-hero mb-5" style={{ borderLeft: `3px solid ${AMBER}`, borderTop: `3px solid ${AMBER}` }}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="eyebrow">Expected in the safe</div>
                <div className="led-number" style={{ color: TEXT, fontSize: "1.6rem" }}>{money(expected)}</div>
                {previousEntry ? (
                  <div className="text-xs" style={{ color: MUTED, marginTop: 3, lineHeight: 1.5 }}>
                    {formatShiftLabel(previousEntry)} counted <span className="led-number">{money(prevActual)}</span>
                    {carriedIn > 0 && <> + change fund from that shift <span className="led-number">{money(carriedIn)}</span></>}
                    {ownRecIn > 0 && <> + change fund in this count <span className="led-number">{money(ownRecIn)}</span></>}
                    {depNum > 0 && <> &minus; deposited <span className="led-number">{money(depNum)}</span></>}
                    {recNum > 0 && !auditForm.receivedInCount && (
                      <><br /><span style={{ color: AMBER }}>{money(recNum)} received after this count — carries to the next shift.</span></>
                    )}
                  </div>
                ) : (
                  <div className="text-xs" style={{ color: MUTED, marginTop: 3 }}>No prior shift on record — enter Expected manually below.</div>
                )}
              </div>
              {hasEntry && (
                <div className="text-right">
                  <div className="eyebrow">Counted</div>
                  <div className="led-number" style={{ color: TEXT, fontSize: "1.25rem" }}>{money(counted)}</div>
                  <div className="eyebrow" style={{ marginTop: 6 }}>Over / Short</div>
                  <div className="led-number flex items-center gap-1 justify-end" style={{ color: osColor, fontSize: "1.25rem" }}>
                    {overShort < -0.004 && <TrendingDown size={16} />}
                    {overShort > 0.004 && <TrendingUp size={16} />}
                    {money(overShort)}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="eyebrow mb-2">Amounts on hand — $ value per denomination (decimals OK)</div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-5">
            {DENOMS.map((d) => (
              <Field key={d.key} label={d.label}>
                <input type="number" min="0" step="0.01" inputMode="decimal" value={auditForm[d.key]} onChange={(e) => setAuditForm({ ...auditForm, [d.key]: e.target.value })} className="input" placeholder="0.00" />
              </Field>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-2">
            <Field label="Deposited ($)">
              <input type="number" step="0.01" inputMode="decimal" value={auditForm.deposited} onChange={(e) => setAuditForm({ ...auditForm, deposited: e.target.value })} className="input" />
            </Field>
            <Field label="Received ($)">
              <input type="number" step="0.01" inputMode="decimal" value={auditForm.received} onChange={(e) => setAuditForm({ ...auditForm, received: e.target.value })} className="input" placeholder="Change order, etc." />
              {(Number(auditForm.received) || 0) > 0 && (
                <label className="flex items-start gap-2 text-xs" style={{ color: MUTED, marginTop: 6, lineHeight: 1.4 }}>
                  <input type="checkbox" checked={!!auditForm.receivedInCount}
                    onChange={(e) => setAuditForm({ ...auditForm, receivedInCount: e.target.checked })}
                    style={{ accentColor: AMBER, marginTop: 2 }} />
                  <span>
                    This change fund is <b>already counted</b> above.
                    {!auditForm.receivedInCount && <><br />Leave unchecked if it arrived after you counted — it will carry to the next shift.</>}
                  </span>
                </label>
              )}
            </Field>
            <Field label="iNFORM over/short ($)">
              <input type="number" step="0.01" inputMode="decimal" value={auditForm.inform ?? ""}
                onChange={(e) => setAuditForm({ ...auditForm, inform: e.target.value })}
                className="input" placeholder="+1.80 / −4.60" />
            </Field>
            <Field label="Notes">
              <input value={auditForm.notes} onChange={(e) => setAuditForm({ ...auditForm, notes: e.target.value })} className="input" placeholder="Optional" />
            </Field>
          </div>

          {/* iNFORM cross-check. If iNFORM's over/short differs from the
              Hub's by exactly the deposit, iNFORM is double-subtracting it. */}
          {String(auditForm.inform ?? "").trim() !== "" && hasEntry && (() => {
            const informN = Number(auditForm.inform) || 0;
            const gap = round2(informN - overShort);
            if (Math.abs(gap) < 0.005) return null;
            const isDepositGap = depNum > 0 && Math.abs(Math.abs(gap) - depNum) < 0.005;
            return (
              <div style={{
                marginTop: 8, background: isDepositGap ? "#FEF2F2" : "#FFF7E6",
                border: `1px solid ${isDepositGap ? "#FECACA" : "#F5D9AE"}`,
                borderRadius: "0.6rem", padding: "0.6rem 0.75rem",
              }}>
                <div className="text-xs" style={{ color: isDepositGap ? "#8A1220" : "#8A5A00", lineHeight: 1.5 }}>
                  <b>iNFORM disagrees by {money(Math.abs(gap))}.</b> Hub {money(overShort)} &middot; iNFORM {money(informN)}
                  {isDepositGap && <><br />That is exactly the deposit. iNFORM is likely subtracting {money(depNum)} twice — the Hub&rsquo;s figure is the one to trust.</>}
                </div>
              </div>
            );
          })()}

          <div className="flex items-center justify-between mb-4 mt-4">
            <label className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
              <input type="checkbox" checked={autoExpected} onChange={(e) => setAutoExpected(e.target.checked)} style={{ accentColor: AMBER }} />
              Auto-carry expected from previous shift
            </label>
            {previousEntry ? (
              <span className="text-xs flex items-center gap-1" style={{ color: MUTED }}>
                <RefreshCw size={12} /> from {formatShiftLabel(previousEntry)} &middot; actual {money(prevActual)}
              </span>
            ) : (
              <span className="text-xs" style={{ color: MUTED }}>no prior shift found</span>
            )}
          </div>

          <div className="mb-5">
            <Field label="Expected ($)">
              <input type="number" step="0.01" inputMode="decimal" value={auditForm.expected} disabled={autoExpected}
                onChange={(e) => setAuditForm({ ...auditForm, expected: e.target.value })} className="input" style={autoExpected ? { opacity: 0.6 } : {}} />
            </Field>
            {carryMismatch && (
              <div style={{
                marginTop: 8, background: "#FFF7E6", border: "1px solid #F5D9AE",
                borderRadius: "0.6rem", padding: "0.6rem 0.75rem",
              }}>
                <div className="text-xs" style={{ color: "#8A5A00", lineHeight: 1.5 }}>
                  <b>Expected doesn't match the carry-over.</b><br />
                  {formatShiftLabel(previousEntry)} counted {money(prevActual)}
                  {carriedIn > 0 ? ` + change fund ${money(carriedIn)}` : ""}
                  {ownRecIn > 0 ? ` + change fund ${money(ownRecIn)}` : ""}
                  {depNum > 0 ? ` − deposited ${money(depNum)}` : ""}
                  {" = "}<b>{money(carryExpected)}</b>
                </div>
                <button
                  type="button"
                  onClick={() => setAuditForm({ ...auditForm, expected: carryExpected.toFixed(2) })}
                  style={{
                    marginTop: 6, background: AMBER, color: "#fff", border: "none",
                    borderRadius: "0.5rem", padding: "0.4rem 0.8rem",
                    fontSize: "0.78rem", fontWeight: 700, cursor: "pointer",
                  }}
                >
                  Use {money(carryExpected)}
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex items-center gap-1.5">
              <Check size={16} /> {editingAuditId ? "Save changes" : "Save entry"}
            </button>
            {editingAuditId && (
              <button type="button" onClick={() => { setAuditForm(emptyAudit()); setAutoExpected(true); setEditingAuditId(null); }} className="btn-secondary">
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="flex items-center justify-between mb-2">
          <div className="eyebrow">Recent entries</div>
          <div className="text-xs" style={{ color: MUTED }}>tap an entry to view details</div>
        </div>
        <div className="space-y-2">
          {[...auditEntries].reverse().slice(0, 20).map((e) => {
            const cnt = countedTotal(e);
            const exp = Number(e.expected) || 0;
            const os = cnt - exp;
            const c = os < -0.004 ? RED : os > 0.004 ? GREEN : MUTED;
            const open = !!expandedAudits[e.id];
            return (
              <div key={e.id} style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: "0.75rem" }}>
                <div
                  className="flex items-center justify-between"
                  style={{ padding: "0.65rem 1rem", cursor: "pointer" }}
                  onClick={() => setExpandedAudits((s) => ({ ...s, [e.id]: !s[e.id] }))}
                >
                  <div className="text-sm flex items-center gap-2" style={{ color: TEXT }}>
                    <span style={{ color: MUTED, fontSize: "0.8rem", width: 10 }}>{open ? "▾" : "▸"}</span>
                    <span className="font-medium">{formatShiftLabel(e)}</span>
                    {e.leader && <span style={{ color: MUTED }}> &middot; {e.leader}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="led-number" style={{ color: c, fontSize: "0.9rem" }}>{money(os)}</span>
                    {manageAudit && (
                      <>
                        <button onClick={(ev) => { ev.stopPropagation(); startEditAudit(e); }} className="icon-btn"><Pencil size={14} /></button>
                        <button onClick={(ev) => { ev.stopPropagation(); deleteAudit(e.id); }} className="icon-btn danger"><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                </div>

                {open && (
                  <div style={{ padding: "0 1rem 0.85rem", borderTop: `1px solid ${BORDER}` }}>
                    <div className="eyebrow" style={{ margin: "0.7rem 0 0.4rem" }}>Denominations ($ on hand)</div>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-x-3 gap-y-1">
                      {DENOMS.map((d) => (
                        <div key={d.key} className="flex justify-between text-xs" style={{ color: MUTED }}>
                          <span>{d.label}</span>
                          <span className="led-number" style={{ color: TEXT }}>{money(e[d.key])}</span>
                        </div>
                      ))}
                    </div>

                    <div className="eyebrow" style={{ margin: "0.85rem 0 0.4rem" }}>Totals</div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <Detail label="Tills" value={money(e.tills)} />
                      <Detail label="Loose / other" value={money(e.loose)} />
                      <Detail label="Counted" value={money(cnt)} strong />
                      <Detail label="Expected" value={money(exp)} />
                      <Detail label="Deposited" value={money(e.deposited)} />
                      <Detail label="Received" value={money(e.received)} />
                      <Detail label="Over / Short" value={money(os)} color={c} strong />
                      {e.inform !== undefined && String(e.inform).trim() !== "" && (
                        <Detail
                          label="iNFORM over/short"
                          value={money(e.inform)}
                          color={Number(e.inform) < -0.004 ? RED : Number(e.inform) > 0.004 ? GREEN : MUTED}
                        />
                      )}
                    </div>

                    {(() => {
                      const prev = findPrevious(e.date, e.shift, e.id);
                      if (!prev) {
                        return (
                          <div className="text-xs" style={{ color: MUTED, marginTop: "0.7rem", fontStyle: "italic" }}>
                            No prior shift on record — Expected was entered manually.
                          </div>
                        );
                      }
                      const pActual = countedTotal(prev);
                      const pDep = Number(e.deposited) || 0;
                      const pCarried = prev.receivedInCount ? 0 : (Number(prev.received) || 0);
                      const pOwnRec = e.receivedInCount ? (Number(e.received) || 0) : 0;
                      const shouldBe = carryExpectedFrom(prev, e);
                      const drift = Math.abs(exp - shouldBe) >= 0.005;
                      return (
                        <div style={{ marginTop: "0.7rem" }}>
                          <div className="eyebrow" style={{ marginBottom: "0.2rem" }}>Carry basis</div>
                          <div className="text-xs" style={{ color: MUTED, lineHeight: 1.6 }}>
                            {formatShiftLabel(prev)} counted <span className="led-number">{money(pActual)}</span>
                            {pCarried > 0 && <> + change fund <span className="led-number">{money(pCarried)}</span></>}
                            {pOwnRec > 0 && <> + change fund <span className="led-number">{money(pOwnRec)}</span></>}
                            {pDep > 0 && <> − deposited <span className="led-number">{money(pDep)}</span></>}
                            {" = "}
                            <span className="led-number" style={{ color: drift ? RED : TEXT, fontWeight: 700 }}>
                              {money(shouldBe)}
                            </span>
                          </div>
                          {drift && (
                            <div className="text-xs" style={{ color: RED, marginTop: 2, fontWeight: 600 }}>
                              Expected on this entry is {money(exp)} — off by {money(exp - shouldBe)}.
                              Corrected, this shift is {money(cnt - shouldBe)}. Use Manage → edit to fix it.
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {e.notes && (
                      <div style={{ marginTop: "0.7rem" }}>
                        <div className="eyebrow" style={{ marginBottom: "0.2rem" }}>Notes</div>
                        <div className="text-xs italic" style={{ color: MUTED }}>{e.notes}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {auditEntries.length === 0 && <div className="text-sm italic" style={{ color: MUTED }}>No entries yet.</div>}
        </div>
      </div>
    );
  }

  // ---------------- SAFE AUDIT DASHBOARD ----------------
  function SafeDashScreen() {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <TopBar title="Safe Audit Dashboard" onBack={() => setScreen("home")} />
        <div className="flex items-center gap-2 mb-4">
          <span className="eyebrow">Month</span>
          <select value={auditMonth} onChange={(e) => setAuditMonth(e.target.value)} className="input" style={{ width: "auto" }}>
            {auditMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <Stat label="Counted" value={money(monthStats.counted)} color={TEXT} />
          <Stat label="Expected" value={money(monthStats.expected)} color={TEXT} />
          <Stat label="Net over/short" value={money(monthStats.overShort)} color={monthStats.overShort < -0.004 ? RED : monthStats.overShort > 0.004 ? GREEN : AMBER} />
        </div>

        <div className="eyebrow mb-2">Flagged shifts (&plusmn;$10 or more) &middot; {monthLabel(auditMonth)}</div>
        <div className="space-y-2">
          {monthStats.flagged.map((e) => {
            const os = countedTotal(e) - (Number(e.expected) || 0);
            return (
              <div key={e.id} className="row" style={{ borderColor: "rgba(221,0,49,0.35)" }}>
                <div className="text-sm" style={{ color: TEXT }}>
                  <span className="font-medium">{formatShiftLabel(e)}</span>
                  {e.leader && <span style={{ color: MUTED }}> &middot; {e.leader}</span>}
                  {e.notes && <span style={{ color: MUTED }} className="italic"> &mdash; {e.notes}</span>}
                </div>
                <span className="led-number" style={{ color: os < 0 ? RED : GREEN, fontSize: "0.9rem" }}>{money(os)}</span>
              </div>
            );
          })}
          {monthStats.flagged.length === 0 && <div className="text-sm italic" style={{ color: MUTED }}>No flagged entries.</div>}
        </div>
      </div>
    );
  }

  // ---------------- CASHIER SHORTAGES & OVERAGES ----------------
  function CashierScreen() {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <TopBar title={CASHIER_LOG_NAME} onBack={() => setScreen("home")}
          action={<button onClick={() => setManageCashier((m) => !m)} className="btn-ghost">{manageCashier ? "Done" : "Manage"}</button>} />

        <form onSubmit={submitCashier} className="panel p-5 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <Field label="Name">
              <input list="known-names" value={cashierForm.name} onChange={(e) => setCashierForm({ ...cashierForm, name: e.target.value })} className="input" required />
              <datalist id="known-names">{KNOWN_NAMES().map((n) => <option key={n} value={n} />)}</datalist>
            </Field>
            <Field label="Date">
              <input type="date" value={cashierForm.date} onChange={(e) => setCashierForm({ ...cashierForm, date: e.target.value })} className="input" required />
            </Field>
            <Field label="Short or Over">
              {/* ⚠️ NOTHING PRESELECTED — see emptyCashier. A default here would
                  swap "forgot the minus" for "did not notice the default", and
                  both file the wrong number with nothing looking wrong. */}
              <div className="flex gap-2">
                {[["short", "Short"], ["over", "Over"]].map(([v, lbl]) => (
                  <button key={v} type="button"
                    onClick={() => setCashierForm({ ...cashierForm, kind: v })}
                    className={cashierForm.kind === v ? "btn-primary" : "btn-secondary"}
                    style={cashierForm.kind === v && v === "short" ? { backgroundColor: RED, borderColor: RED } : undefined}>
                    {lbl}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Amount ($)">
              {/* A magnitude. The sign comes from the choice above, in
                  submitCashier, and is the only thing that reaches the ledger. */}
              <input type="number" step="0.01" min="0" inputMode="decimal" value={cashierForm.amount} onChange={(e) => setCashierForm({ ...cashierForm, amount: e.target.value })} className="input" required />
            </Field>
          </div>
          {/* ★ REQUIRED ON EVERY ENTRY (Nick via Hannah, Aug 11 2026: "require a
              comment when they submit discrepancies"). Every row in this log is
              a discrepancy by definition, so this asks on all of them.

              ⚠️ OUT OF THE GRID, AND THAT IS THE POINT. It was the fifth cell of
              a four-wide row, so it wrapped underneath on its own, labelled
              "Notes", placeholder "Optional" — a box that reads as skippable and
              was skipped. Full width above the money means it is part of logging
              the entry rather than an afterthought under it.

              ⚠️ IT WRITES `notes`, THE FIELD IT ALWAYS WROTE. Every cashier row
              ever logged keeps its free text there, so the required box lands on
              the field the data is already in: an old entry opened for an edit
              pre-fills with what it already says and nothing needs migrating.
              Design rule 1. */}
          <div className="mt-4">
            <Field label="What happened">
              <input value={cashierForm.notes} required className="input"
                placeholder="A recount, a bad change order, a mis-ring…"
                onChange={(ev) => { const v = ev.target.value; setCashierForm((f) => ({ ...f, notes: v })); }} />
            </Field>
          </div>
          {/* The gate Bri asked for. It appears the moment the number crosses
              the threshold, so it reads as a consequence of what was just typed
              rather than as a form that was always this long. */}
          {cashierForm.kind === "short" && Math.abs(Number(cashierForm.amount) || 0) >= SHORT_DOC_AT && (
            <div className="mt-4 p-3" style={{ border: `1px solid ${RED}33`, borderRadius: 8, backgroundColor: "#FEF2F2" }}>
              <div className="text-sm font-medium" style={{ color: RED }}>
                A shortage of {money(SHORT_DOC_AT)} or more goes to HR
              </div>
              {/* ⚠️ NO SECOND "what happened" BOX HERE ANY MORE. This block used
                  to carry its own, so on a $5 shortage the leader met two text
                  inputs one above the other asking the same question, and the
                  sentence could land in either field. The one above is required
                  on every entry now, which answers this block's half of the rule
                  before the block appears. The photo is what is left to offer,
                  and it is genuinely optional. */}
              <div className="text-xs mb-2" style={{ color: MUTED }}>
                You have said what happened above. Add a photo if you have one, and name who was on the drawer.
              </div>
              <div>
                <input ref={cashierDocInput} type="file" accept="image/*,.pdf" className="input"
                  onChange={(ev) => { const f = (ev.target.files && ev.target.files[0]) || null; setCashierDoc(f); }} />
              </div>
              {/* ★ WHO IT BELONGS TO, BY ROSTER (Hannah, Aug 10 2026: "I want the
                  leader to document the shortages as a file entry in HR console").
                  ⚠️ A SEPARATE QUESTION FROM THE NAME BOX ABOVE, ON PURPOSE. That
                  box is a typed first name and stays exactly as it is, because
                  every cashier row ever written uses it and eight first names are
                  shared on this roster. A name that is going to reach somebody's
                  PERMANENT HR RECORD has to be a person, not a spelling.
                  ⚠️ ONLY ASKED ON A SHORTAGE OF $5 OR MORE. The daily flow —
                  overages, small shortages — is untouched.
                  ⚠️ IF THE ROSTER DID NOT LOAD, THIS SAYS SO AND THE ENTRY STILL
                  SAVES. Losing a cash record because a roster read blipped would
                  be a far worse outcome than a shortage HR has to chase. */}
              <div className="mt-3">
                {hrRoster && hrRoster.length ? (
                  <>
                    {/* ⚠️ SAYS IT IS REQUIRED, because it is (Hannah, Aug 11
                        2026). A field that blocks on submit without saying so
                        beforehand reads as a broken button. */}
                    <div className="text-xs mb-1" style={{ color: MUTED }}>
                      Who was on the drawer? <span style={{ color: RED, fontWeight: 700 }}>Required.</span> HR files this on their record.
                    </div>
                    <select className="input" value={cashierForm.personId}
                      onChange={(ev) => { const v = ev.target.value; setCashierForm((f) => ({ ...f, personId: v })); }}>
                      <option value="">— Choose the team member —</option>
                      {[...hrRoster]
                        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
                        .map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                    </select>
                  </>
                ) : (
                  <div className="text-xs" style={{ color: MUTED }}>
                    {hrRoster === null
                      ? "Loading the team list…"
                      : "The team list did not load, so this cannot be sent to HR automatically. Log it anyway and tell your HR lead."}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <button type="submit" disabled={cashierBusy} className="btn-primary flex items-center gap-1.5">
              <Plus size={16} /> {cashierBusy ? "Saving…" : (editingCashierId ? "Save changes" : "Log entry")}
            </button>
            {editingCashierId && (
              <button type="button" onClick={() => { setCashierForm(emptyCashier()); setCashierDoc(null); setEditingCashierId(null); }} className="btn-secondary">
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="eyebrow mb-2">By month</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
          {cashierMonths.map((m) => (
            <div key={m.key} className="row">
              <div className="text-sm" style={{ color: TEXT }}>
                <span className="font-medium">{m.key}</span> <span style={{ color: MUTED }}>&middot; {m.count} {m.count === 1 ? "entry" : "entries"}</span>
              </div>
              {/* Two figures, never one net. A month $80 short and $80 over
                  nets to zero and reads as a clean month. */}
              <div className="flex items-center gap-3">
                <span className="led-number" style={{ color: m.short < -0.004 ? RED : MUTED, fontSize: "0.9rem" }}>{money(m.short)}</span>
                <span className="led-number" style={{ color: m.over > 0.004 ? GREEN : MUTED, fontSize: "0.9rem" }}>{money(m.over)}</span>
              </div>
            </div>
          ))}
          {cashierMonths.length === 0 && <div className="text-sm italic" style={{ color: MUTED }}>No entries yet.</div>}
        </div>

        <div className="eyebrow mb-2">Running totals by person</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
          {dashboard.cashierList.map((p) => (
            <div key={p.name} className="row">
              <div className="text-sm" style={{ color: TEXT }}>
                <span className="font-medium">{p.name}</span> <span style={{ color: MUTED }}>&middot; {p.count} entries</span>
              </div>
              <span className="led-number" style={{ color: p.total < -0.004 ? RED : p.total > 0.004 ? GREEN : MUTED, fontSize: "0.9rem" }}>{money(p.total)}</span>
            </div>
          ))}
          {dashboard.cashierList.length === 0 && <div className="text-sm italic" style={{ color: MUTED }}>No entries yet.</div>}
        </div>

        <div className="flex items-center justify-between mb-2">
          <div className="eyebrow">All entries</div>
        </div>
        <div className="space-y-2">
          {cashierEntries.map((e) => (
            <div key={e.id} className="row">
              <div className="text-sm" style={{ color: TEXT }}>
                <span className="font-medium">{e.name}</span> <span style={{ color: MUTED }}>&middot; {e.date}</span>
                {e.notes && <span style={{ color: MUTED }} className="italic"> &mdash; {e.notes}</span>}
                {/* Bri: "automatically note the leader who logged the entry for
                    reference." Rows written before today carry none and show
                    nothing, rather than a name that was never true. */}
                {(e.loggedBy || e.reason || e.doc) && (
                  <div className="text-xs" style={{ color: MUTED, marginTop: 2 }}>
                    {e.loggedBy && <>logged by {e.loggedBy}</>}
                    {e.doc && <>{e.loggedBy ? " · " : ""}document attached</>}
                    {e.reason && <>{(e.loggedBy || e.doc) ? " · " : ""}{e.reason}</>}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="led-number" style={{ color: Number(e.amount) < 0 ? RED : GREEN, fontSize: "0.9rem" }}>{money(e.amount)}</span>
                {manageCashier && (
                  <>
                    <button onClick={() => { setCashierForm(cashierFormFrom(e)); setCashierDoc(null); setEditingCashierId(e.id); }} className="icon-btn"><Pencil size={14} /></button>
                    <button onClick={() => deleteCashier(e.id)} className="icon-btn danger"><Trash2 size={14} /></button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------------- CATERING MILEAGE ----------------
  function ReceiptsScreen() {
    // Cindy reconciles (role "Payroll"); directors can too. Everyone else logs
    // receipts but can't clear them — that separation is the whole point.
    const canReconcile = user.role === "Payroll" || tier >= 3;
    /* ⚠️ WAS BUILT ONLY FROM MONTHS THAT ALREADY HAVE RECEIPTS. Two
       consequences, both quiet: a month with none could not be selected at all,
       and on the 1st of a new month the CURRENT month disappeared from its own
       dropdown until somebody uploaded something — so the screen opened on a
       month that was not today.
       Now: the last 12 months always, unioned with any month that actually has
       a receipt (so older history stays reachable), current month first. */
    const monthsBack = Array.from({ length: 12 }, (_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
    const months = Array.from(new Set([
      ...monthsBack,
      ...receiptEntries.map((r) => monthKey(r.date)).filter(Boolean),
    ])).sort().reverse();
    const shown = receiptEntries
      .filter((r) => monthKey(r.date) === receiptMonth)
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const outstanding = shown.filter((r) => !r.reconciled).length;
    const totalOf = (t) => shown.filter((r) => r.type === t).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    return (
      <>
        <TopBar title="Receipts" onBack={() => setScreen("home")}
          action={canReconcile ? <button onClick={() => setManageReceipts((m) => !m)} className="btn-ghost">{manageReceipts ? "Done" : "Manage"}</button> : null} />

        <form onSubmit={submitReceipt} className="panel p-5 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <Field label="Date">
              <input type="date" value={receiptForm.date} onChange={(e) => setReceiptForm({ ...receiptForm, date: e.target.value })} className="input" required />
            </Field>
            <Field label="Time">
              <input type="time" value={receiptForm.time} onChange={(e) => setReceiptForm({ ...receiptForm, time: e.target.value })} className="input" required />
            </Field>
            <Field label="Type">
              <select value={receiptForm.type} onChange={(e) => setReceiptForm({ ...receiptForm, type: e.target.value })} className="input">
                {RECEIPT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Who handled it">
              <input list="known-names-receipts" value={receiptForm.who} onChange={(e) => setReceiptForm({ ...receiptForm, who: e.target.value })} className="input" required />
              <datalist id="known-names-receipts">{KNOWN_NAMES().map((n) => <option key={n} value={n} />)}</datalist>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <Field label="Amount (optional)">
              <input type="number" step="0.01" inputMode="decimal" value={receiptForm.amount} onChange={(e) => setReceiptForm({ ...receiptForm, amount: e.target.value })} className="input" placeholder="Helps whoever totals the receipts without opening each photo" />
            </Field>
            {/* Refunds require the reason (Hannah, Jul 29). The label and the
                placeholder BOTH change, because a label alone reads as decoration
                on a phone — the placeholder is the text sitting in the empty box
                the leader is about to type into. */}
            <Field label={receiptForm.type === "Refund" ? "Reason (required)" : "Note (optional)"}>
              <input
                value={receiptForm.note}
                onChange={(e) => setReceiptForm({ ...receiptForm, note: e.target.value })}
                className="input"
                required={receiptForm.type === "Refund"}
                placeholder={receiptForm.type === "Refund" ? "Why was this refunded?" : "What it was for"}
              />
            </Field>
          </div>

          <div className="mb-4">
            <Field label="Photo of the receipt">
              <input ref={receiptInput} type="file" accept="image/*,application/pdf" capture="environment"
                onChange={(e) => { setReceiptFile((e.target.files && e.target.files[0]) || null); setReceiptErr(""); }}
                className="input" required />
            </Field>
            {receiptFile && <div className="eyebrow" style={{ marginTop: 6 }}>Selected: {receiptFile.name}</div>}
          </div>

          {receiptErr && (
            <div className="mb-4" style={{ background: "rgba(221,0,49,0.08)", border: `1px solid ${RED}`, color: RED, borderRadius: 8, padding: "9px 12px", fontSize: 13 }}>{receiptErr}</div>
          )}

          <div className="flex gap-2">
            <button type="submit" disabled={receiptBusy} className="btn-primary flex items-center gap-1.5">
              <Plus size={16} /> {receiptBusy ? "Uploading\u2026" : "Upload receipt"}
            </button>
          </div>
        </form>

        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <select value={receiptMonth} onChange={(e) => setReceiptMonth(e.target.value)} className="input" style={{ width: "auto" }}>
              {(months.length ? months : [receiptMonth]).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <span className="eyebrow">{shown.length} receipt{shown.length === 1 ? "" : "s"}{outstanding ? ` \u00b7 ${outstanding} to reconcile` : ""}</span>
          </div>
          {/* One block per type, built from RECEIPT_TYPES so a new type can
              never appear in the dropdown without its money appearing here.
              Wraps rather than overflowing — four labels do not fit one phone
              line, and "Credit card receipt" is the longest of them. */}
          <div className="flex items-end gap-4 flex-wrap" style={{ justifyContent: "flex-end" }}>
            {RECEIPT_TYPES.map((t) => (
              <div key={t} className="text-right">
                <div className="eyebrow">{t}</div>
                <div className="led-number" style={{ color: TEXT, fontSize: "1rem" }}>{money(totalOf(t))}</div>
              </div>
            ))}
          </div>
        </div>

        {shown.length === 0 && (
          <div className="panel p-5" style={{ textAlign: "center", color: "#6B7280", fontSize: 14 }}>
            No receipts logged for this month yet.
          </div>
        )}

        {/* ── Email a receipt out ────────────────────────────────────────
            Opens after the viewer closes, so the two are never stacked. */}
        {mailFor && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.72)", zIndex: 9999,
                        display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "#fff", borderRadius: 16, maxWidth: 440, width: "100%", padding: 18 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: TEXT }}>Email this receipt</div>
              <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{mailFor.label}</div>
              <input value={mailTo} onChange={(e) => { const v = e.target.value; setMailTo(v); }}
                type="email" inputMode="email" placeholder="Send to (email address)" className="input"
                style={{ width: "100%", boxSizing: "border-box", marginTop: 12 }} />
              <input value={mailNote} onChange={(e) => { const v = e.target.value; setMailNote(v); }}
                placeholder="Add a note (optional)" className="input"
                style={{ width: "100%", boxSizing: "border-box", marginTop: 8 }} />
              {mailErr && (
                <div style={{ marginTop: 10, borderRadius: 8, padding: "9px 12px", background: "#FEF2F2",
                              border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13, fontWeight: 700 }}>
                  {mailErr}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button onClick={sendReceipt} disabled={mailBusy} className="btn-primary" style={{ flex: 1 }}>
                  {mailBusy ? "Sending…" : "Send"}
                </button>
                <button onClick={() => { setMailFor(null); setMailErr(""); }} className="btn-secondary">Cancel</button>
              </div>
              <div style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 10, lineHeight: 1.45 }}>
                The receipt goes as an attachment from the store's address. Every
                send is recorded with your name.
              </div>
            </div>
          </div>
        )}

        {mailSent && (
          <div style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", zIndex: 9999,
                        background: "#1E9E57", color: "#fff", borderRadius: 999, padding: "10px 18px",
                        fontSize: 14, fontWeight: 700, boxShadow: "0 8px 24px rgba(0,0,0,.25)" }}>
            {mailSent}
          </div>
        )}

        {receiptView && (
          <div onClick={() => setReceiptView(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.88)", zIndex: 9999,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ color: "#fff", fontSize: 13, marginBottom: 10, opacity: .85 }}>{receiptView.label}</div>
            <img src={receiptView.url} alt="Receipt"
              style={{ maxWidth: "100%", maxHeight: "78vh", objectFit: "contain", borderRadius: 10, background: "#fff" }} />
            <div style={{ display: "flex", gap: 10, marginTop: 14 }} onClick={(e) => e.stopPropagation()}>
              <button onClick={() => printReceipt(receiptView)} className="btn-secondary">Print</button>
              {/* Carries bucket/path, never the signed url — the server refetches. */}
              <button
                onClick={() => { setMailFor({ bucket: receiptView.bucket, path: receiptView.path, label: receiptView.label }); setMailErr(""); setReceiptView(null); }}
                className="btn-secondary">Email</button>
              <button onClick={() => setReceiptView(null)} className="btn-secondary">Close</button>
            </div>
          </div>
        )}

        {/* Build marker. Three rounds were lost to "did this deploy?" — a visible
            string is the fastest way to tell a stale bundle from a real bug.
            If this line is missing, the browser is running an OLD build and
            nothing below it can be trusted. Bump on any change to this screen. */}
        <div className="eyebrow" style={{ textAlign: "right", opacity: .5, marginBottom: 6 }}>receipts build 4 &middot; viewer + print + email</div>

        {shown.map((r) => (
          <div key={r.id} className="panel p-4 mb-2 flex items-center justify-between gap-3" style={{ flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, flex: "1 1 160px" }}>
              <div style={{ fontWeight: 700, color: TEXT, fontSize: 14 }}>
                {r.type}{r.amount ? ` \u00b7 ${money(Number(r.amount))}` : ""}
              </div>
              <div className="eyebrow" style={{ marginTop: 2 }}>
                {r.date} {r.time} &middot; {r.who}{r.note ? ` \u00b7 ${r.note}` : ""}
              </div>
              {r.reconciled && (
                <div className="eyebrow" style={{ marginTop: 2, color: GREEN }}>
                  Reconciled by {r.reconciledBy}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
              <button onClick={() => viewReceipt(r)} className="btn-secondary">View</button>
              {canReconcile && (
                <button onClick={() => toggleReconciled(r.id)} className={r.reconciled ? "btn-ghost" : "btn-primary"}>
                  {r.reconciled ? "Undo" : <><Check size={14} /> Reconcile</>}
                </button>
              )}
              {canReconcile && (
                <button onClick={() => { if (window.confirm("Delete this receipt? The photo is removed from the record.")) deleteReceipt(r.id); }} className="icon-btn danger"><Trash2 size={14} /></button>
              )}
            </div>
          </div>
        ))}
      </>
    );
  }

  function MileageScreen() {
    const miles = mileageMiles(mileageForm);
    const reimb = miles * mileageRate();
    // Same rule as the Receipts screen: Cindy reconciles (role "Payroll"), and
    // directors can too. Everyone else logs trips and reads the odometer panel
    // without being able to change the readings the reconciliation rests on.
    const canReconcile = user.role === "Payroll" || tier >= 3;

    // Until HR approves anyone, fall back to the old hardcoded names so mileage
    // logging keeps working the moment this deploys rather than going blank.
    const usingFallback = drivers.length === 0;
    const pool = usingFallback
      ? KNOWN_NAMES().map((nm) => ({ id: nm, name: nm, expires: "" }))
      : drivers;
    const refDay = todayISO();
    const byName = (a, b) => a.name.localeCompare(b.name);
    const driverActive = pool.filter((d) => !d.expires || d.expires >= refDay).sort(byName);
    const driverLapsed = pool.filter((d) => d.expires && d.expires < refDay).sort(byName);
    const driverNames = new Set(pool.map((d) => d.name));

    return (
      <div className="p-6 max-w-3xl mx-auto">
        <TopBar title="Catering Mileage" onBack={() => setScreen("home")}
          action={<button onClick={() => setManageMileage((m) => !m)} className="btn-ghost">{manageMileage ? "Done" : "Manage"}</button>} />

        <form onSubmit={submitMileage} className="panel p-5 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <Field label="Name">
              {/* A <select>, not the datalist this used to be. A datalist only
                  SUGGESTS — any name could still be typed in — so it could never
                  enforce Hannah's approved list. Expired licences stay visible
                  but unselectable, so it's obvious why someone can't be picked
                  rather than them silently vanishing. */}
              <select value={mileageForm.name} onChange={(e) => setMileageForm({ ...mileageForm, name: e.target.value })} className="input" required>
                <option value="">Select a driver…</option>
                {driverActive.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                {driverLapsed.map((d) => <option key={d.id} value={d.name} disabled>{d.name} — licence expired</option>)}
                {/* Keeps an older entry's name selectable when editing, even if
                    that person has since come off the list. */}
                {mileageForm.name && !driverNames.has(mileageForm.name) && (
                  <option value={mileageForm.name}>{mileageForm.name} — no longer approved</option>
                )}
              </select>
              {usingFallback && (
                <div className="eyebrow" style={{ marginTop: 6 }}>
                  No approved-driver list set yet — showing the old name list. HR Console &rarr; Approved Drivers.
                </div>
              )}
            </Field>
            <Field label="Date">
              <input type="date" value={mileageForm.date} onChange={(e) => setMileageForm({ ...mileageForm, date: e.target.value })} className="input" required />
            </Field>
            <Field label="Starting mileage">
              <input type="number" step="0.1" inputMode="decimal" value={mileageForm.startMiles} onChange={(e) => setMileageForm({ ...mileageForm, startMiles: e.target.value })} className="input" required />
            </Field>
            <Field label="Ending mileage">
              <input type="number" step="0.1" inputMode="decimal" value={mileageForm.endMiles} onChange={(e) => setMileageForm({ ...mileageForm, endMiles: e.target.value })} className="input" required />
            </Field>
          </div>
          <div className="mb-4">
            <Field label="Reason for trip">
              <input value={mileageForm.reason} onChange={(e) => setMileageForm({ ...mileageForm, reason: e.target.value })} className="input" placeholder="Delivery, supply run, bank, etc." />
            </Field>
          </div>

          <div className="ledger-hero flex items-center justify-between mb-4">
            <div>
              <div className="eyebrow">Miles</div>
              <div className="led-number" style={{ color: TEXT, fontSize: "1.5rem" }}>{miles.toFixed(1)}</div>
            </div>
            <div className="text-right">
              <div className="eyebrow">Reimbursement &middot; ${mileageRate().toFixed(2)}/mi</div>
              <div className="led-number" style={{ color: AMBER, fontSize: "1.5rem" }}>{money(reimb)}</div>
            </div>
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex items-center gap-1.5">
              <Plus size={16} /> {editingMileageId ? "Save changes" : "Log trip"}
            </button>
            {editingMileageId && (
              <button type="button" onClick={() => { setMileageForm(emptyMileage()); setEditingMileageId(null); }} className="btn-secondary">
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="eyebrow">Month</span>
            <select value={mileageMonth} onChange={(e) => setMileageMonth(e.target.value)} className="input" style={{ width: "auto" }}>
              {mileageMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
          <button onClick={handlePrint} className="btn-secondary flex items-center gap-1.5">
            <Printer size={14} /> Print month
          </button>
        </div>

        <div className="ledger-hero flex items-center justify-between mb-5">
          <div>
            <div className="eyebrow">Total miles &middot; {monthLabel(mileageMonth)}</div>
            <div className="led-number" style={{ color: TEXT, fontSize: "1.5rem" }}>{mileageTotals.miles.toFixed(1)}</div>
          </div>
          <div className="text-right">
            <div className="eyebrow">Owed to {programLabel()}</div>
            <div className="led-number" style={{ color: AMBER, fontSize: "1.5rem" }}>{money(mileageTotals.reimbursement)}</div>
          </div>
        </div>

        {/* ── Odometer, Cindy's ask. Sits BETWEEN the totals and the trip list
             because it is a statement about that month's total, not about any
             one trip. ────────────────────────────────────────────────────── */}
        <div className="card mb-5" style={{ padding: "14px 16px" }}>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div className="eyebrow">Odometer &middot; {monthLabel(mileageMonth)}</div>
            {!canReconcile && <span className="text-xs" style={{ color: MUTED }}>Payroll and directors can edit</span>}
          </div>

          <div className="flex items-end gap-3 flex-wrap">
            <label className="text-xs" style={{ color: MUTED }}>
              Start of month
              <input type="number" inputMode="decimal" className="input" style={{ width: 130, display: "block", marginTop: 4 }}
                value={(odo[mileageMonth] || {}).start ?? ""} disabled={!canReconcile}
                placeholder={odoStats.startCarried ? String(odoStats.start) : ""}
                onChange={(e) => saveOdo(mileageMonth, { start: e.target.value })} />
              {odoStats.startCarried && (
                <div className="text-xs" style={{ color: MUTED, marginTop: 3, maxWidth: 130 }}>
                  auto from {monthLabel(odoStats.carriedFrom)} ending &mdash; type to override
                </div>
              )}
            </label>
            <label className="text-xs" style={{ color: MUTED }}>
              End of month
              <input type="number" inputMode="decimal" className="input" style={{ width: 130, display: "block", marginTop: 4 }}
                value={(odo[mileageMonth] || {}).end ?? ""} disabled={!canReconcile}
                onChange={(e) => saveOdo(mileageMonth, { end: e.target.value })} />
            </label>
            <div style={{ flex: "1 1 120px" }}>
              <div className="eyebrow">Travelled</div>
              <div className="led-number" style={{ color: TEXT, fontSize: "1.15rem" }}>
                {odoStats.travelled === null ? "—" : odoStats.travelled.toFixed(1)}
              </div>
            </div>
          </div>

          <div className="mt-3 text-sm" style={{ lineHeight: 1.5 }}>
            {odoStats.start === null || odoStats.end === null ? (
              <span style={{ color: MUTED }}>
                Enter both readings and the Hub will compare the odometer against the trips logged.
              </span>
            ) : odoStats.backwards ? (
              <span style={{ color: RED }}>
                The end reading is lower than the start &mdash; check the two numbers.
              </span>
            ) : Math.abs(odoStats.gap) < 0.05 ? (
              <span style={{ color: GREEN }}>
                Every mile is accounted for &mdash; the odometer matches the trips logged.
              </span>
            ) : odoStats.gap > 0 ? (
              <span style={{ color: AMBER }}>
                <b className="led-number">{odoStats.gap.toFixed(1)} miles</b> not logged &mdash; the car travelled
                {" "}{odoStats.travelled.toFixed(1)} but only {mileageTotals.miles.toFixed(1)} were written up as trips.
              </span>
            ) : (
              <span style={{ color: AMBER }}>
                <b className="led-number">{Math.abs(odoStats.gap).toFixed(1)} miles</b> more logged than the odometer moved
                &mdash; a trip may be duplicated, or a reading is off.
              </span>
            )}
          </div>

          {/* ★ THE ONE NUMBER CINDY PAYS. Deliberately sits under the odometer,
              not under the trip totals, because that is where it comes from.
              The trip sheet above is untouched — corporate wants it for the
              records; this is the payment, that is the audit trail. */}
          <div className="mt-3 pt-3 flex items-center justify-between gap-3 flex-wrap"
               style={{ borderTop: `1px solid ${BORDER}` }}>
            <div>
              {/* ⚠️ WAS "Pay Nick". A money label naming one person, and the only
                  name left in this file. There is no config field for "who gets
                  the mileage cheque" and inventing one for a single heading is a
                  config system for one setting, so the name is simply dropped:
                  the section is already the mileage payment, so no reader loses
                  anything, and it is true at every store. If a store wants the
                  payee named here, that is a field and a settings row, not a
                  literal. */}
              <div className="eyebrow">Mileage payment &middot; {monthLabel(mileageMonth)}</div>
              <div className="text-xs" style={{ color: MUTED, marginTop: 2 }}>
                {payable.basis === "odometer"
                  ? `${payable.miles.toFixed(1)} miles on the odometer, at $${mileageRate().toFixed(2)}/mile`
                  : `${payable.miles.toFixed(1)} miles from logged trips — add the end reading for the true total`}
              </div>
            </div>
            <div className="led-number" style={{ color: payable.basis === "odometer" ? GREEN : AMBER, fontSize: "1.75rem" }}>
              {money(payable.amount)}
            </div>
          </div>

          {canReconcile && (
            <input className="input mt-3" placeholder="Note (optional) — e.g. who read the odometer"
              value={(odo[mileageMonth] || {}).note ?? ""}
              onChange={(e) => saveOdo(mileageMonth, { note: e.target.value })} />
          )}
          {!canReconcile && odoStats.note && (
            <div className="text-xs mt-2" style={{ color: MUTED }}>{odoStats.note}</div>
          )}
        </div>

        <div className="flex items-center justify-between mb-2">
          <div className="eyebrow">Trips this month</div>
        </div>
        <div className="space-y-2">
          {mileageForMonth.map((e) => (
            <div key={e.id} className="row">
              <div className="text-sm" style={{ color: TEXT }}>
                <span className="font-medium">{e.name}</span> <span style={{ color: MUTED }}>&middot; {e.date}</span>
                {e.reason && <span style={{ color: MUTED }} className="italic"> &mdash; {e.reason}</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className="led-number" style={{ color: TEXT, fontSize: "0.9rem" }}>{mileageMiles(e).toFixed(1)} mi</span>
                {manageMileage && (
                  <>
                    <button onClick={() => { setMileageForm(e); setEditingMileageId(e.id); }} className="icon-btn"><Pencil size={14} /></button>
                    <button onClick={() => deleteMileage(e.id)} className="icon-btn danger"><Trash2 size={14} /></button>
                  </>
                )}
              </div>
            </div>
          ))}
          {mileageForMonth.length === 0 && <div className="text-sm italic" style={{ color: MUTED }}>No trips logged for this month.</div>}
        </div>
      </div>
    );
  }

  // ---------------- CHANGE FUND ORDER ----------------
  function ChangeOrderScreen() {
    const total = orderTotal(orderForm);

    return (
      <div className="p-6 max-w-3xl mx-auto">
        <TopBar title="Change Fund Order" onBack={() => setScreen("home")}
          action={<button onClick={() => setManageOrder((m) => !m)} className="btn-ghost">{manageOrder ? "Done" : "Manage"}</button>} />

        <OrderInstructions />

        <form onSubmit={submitOrder} className="panel p-5 mb-6">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="Date">
              <input type="date" value={orderForm.date} onChange={(e) => setOrderForm({ ...orderForm, date: e.target.value })} className="input" required />
            </Field>
            <Field label="Requested by">
              <input list="known-names-order" value={orderForm.requestedBy} onChange={(e) => setOrderForm({ ...orderForm, requestedBy: e.target.value })} className="input" placeholder="Name" required />
              <datalist id="known-names-order">{KNOWN_NAMES().map((n) => <option key={n} value={n} />)}</datalist>
            </Field>
          </div>

          <div className="eyebrow mb-2">Order amounts ($)</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {ORDER_ITEMS.map((d) => (
              <Field key={d.key} label={d.label}>
                <input type="number" min="0" step="0.01" inputMode="decimal" value={orderForm[d.key]} onChange={(e) => setOrderForm({ ...orderForm, [d.key]: e.target.value })} className="input" placeholder="0.00" />
              </Field>
            ))}
          </div>

          <div className="mb-4">
            <Field label="Notes">
              <input value={orderForm.notes} onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })} className="input" placeholder="Optional — bank, pickup timing, etc." />
            </Field>
          </div>

          <div className="ledger-hero flex items-center justify-between mb-4">
            <div>
              <div className="eyebrow">Order total</div>
              <div className="led-number" style={{ color: AMBER, fontSize: "1.5rem" }}>{money(total)}</div>
            </div>
            <div className="text-right">
              <div className="eyebrow">On submit</div>
              <div className="text-xs" style={{ color: MUTED }}>Saved to the log &amp; emailed to {CASH_SEAT_FIRST}</div>
            </div>
          </div>

          <button type="submit" disabled={orderSending} className="btn-primary flex items-center gap-1.5" style={orderSending ? { opacity: 0.6 } : {}}>
            <Check size={16} /> {orderSending ? "Sending…" : "Submit order"}
          </button>
        </form>

        <div className="flex items-center justify-between mb-2">
          <div className="eyebrow">Order log</div>
        </div>
        <div className="space-y-2">
          {orderEntries.map((e) => {
            const items = ORDER_ITEMS.filter((d) => (Number(e[d.key]) || 0) > 0)
              .map((d) => `${d.label}: ${money(Number(e[d.key]) || 0)}`)
              .join(", ");
            return (
              <div key={e.id} className="row" style={{ alignItems: "flex-start" }}>
                <div className="text-sm" style={{ color: TEXT }}>
                  <span className="font-medium">{e.date}</span>
                  {e.requestedBy && <span style={{ color: MUTED }}> &middot; {e.requestedBy}</span>}
                  <div className="text-xs" style={{ color: MUTED, marginTop: 2 }}>{items || "—"}</div>
                  {e.notes && <div className="text-xs italic" style={{ color: MUTED, marginTop: 2 }}>{e.notes}</div>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="led-number" style={{ color: AMBER, fontSize: "0.9rem" }}>{money(orderTotal(e))}</span>
                  {manageOrder && (
                    <>
                      <button onClick={() => resendOrder(e)} className="icon-btn" title="Re-email"><RefreshCw size={14} /></button>
                      <button onClick={() => deleteOrder(e.id)} className="icon-btn danger"><Trash2 size={14} /></button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {orderEntries.length === 0 && <div className="text-sm italic" style={{ color: MUTED }}>No orders yet.</div>}
        </div>
      </div>
    );
  }
}

/* 🐛🐛 THE LOGIN AND PASSWORD USED TO BE TYPED RIGHT HERE (Aug 8 2026).
   This is a React file, so both shipped in a client chunk that answered HTTP
   200 to anyone on the internet, no sign-in — confirmed against production
   before it was changed. A live credential for the change-order line.

   They now come from GET /api/change-order, which needs a signed-in session
   AND tier 2, and reads the values from Cloudflare secrets rather than from
   anything in this repo. The password is being rotated because of this, and
   the new one must never appear in a file again.

   ⚠️ EVERYTHING ELSE IN THIS PANEL STAYS. The phone number is published by
   Chick-fil-A, and the order amounts and days are operating detail, not a
   credential. Only the two secret values moved.
   ⚠️ A FAILED OR REFUSED FETCH SHOWS "ask Matt", never a blank. A gap where a
   credential used to be reads as a broken screen and someone retypes it. */
function OrderInstructions() {
  const [cred, setCred] = useState(null);   // null = still asking
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/change-order", { headers: { "x-hub-token": hubToken() } });
        const d = await r.json().catch(() => null);
        if (alive) setCred(d && d.ok && d.configured ? d : { configured: false });
      } catch { if (alive) setCred({ configured: false }); }
    })();
    return () => { alive = false; };
  }, []);
  return (
    <div className="panel p-4 mb-5" style={{ borderLeft: `3px solid ${AMBER}`, borderTop: `3px solid ${AMBER}` }}>
      <div className="eyebrow mb-1.5">How to order change &middot; 844-831-2129</div>
      <div className="text-[12.5px] leading-relaxed" style={{ color: TEXT }}>
        {cred && cred.configured ? (<>Login <span className="led-number" style={{ color: AMBER }}>{cred.login}</span> &middot; Password <span className="led-number" style={{ color: AMBER }}>{cred.password}</span></>) : (<span style={{ color: MUTED }}>Login and password: ask Matt. They are no longer stored in the app.</span>)}
      </div>
      <div className="text-[12px] leading-relaxed mt-2" style={{ color: MUTED }}>
        Order <b>Monday &amp; Thursday by 9am</b>. Mon: $5's $1,200 &middot; $1's $1,000. Thu: $5's $1,400&ndash;$1,600 &middot; $1's $1,200. Quarters $500 &middot; Dimes $250 &middot; Nickels $100.
      </div>
      <div className="text-[12px] leading-relaxed mt-1" style={{ color: MUTED }}>
        Coins order by the case &mdash; reorder quarters at $250 or below, dimes at $100 or below, nickels at $20 or below.
      </div>
    </div>
  );
}

function TopBar({ title, onBack, action }) {
  return (
    <div style={{ margin: "-1.5rem -1.5rem 1.5rem", background: AMBER_GRAD, color: "#fff", padding: "18px 24px 20px" }}>
      <div className="flex items-center gap-3">
        {onBack && (<button onClick={onBack} className="icon-btn"><ChevronLeft size={18} /></button>)}
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-base" style={{ background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.28)" }}>&#128181;</div>
        <h1 className="text-base font-semibold tracking-wide" style={{ color: "#fff" }}>{title.toUpperCase()}</h1>
        {action && <div style={{ marginLeft: "auto" }}>{action}</div>}
      </div>
    </div>
  );
}

function TileRow({ emoji, title, desc, onClick }) {
  return (
    <button onClick={onClick} className="tile-row">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: AMBER_SOFT }} dangerouslySetInnerHTML={{ __html: emoji }} />
        <div className="text-left">
          <div className="text-sm font-semibold" style={{ color: TEXT }}>{title}</div>
          <div className="text-xs" style={{ color: MUTED }} dangerouslySetInnerHTML={{ __html: desc }} />
        </div>
      </div>
      <ChevronRight size={16} style={{ color: MUTED }} />
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="eyebrow block mb-1">{label}</span>
      {children}
    </label>
  );
}

function Detail({ label, value, color, strong }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: MUTED }}>{label}</span>
      <span className="led-number" style={{ color: color || TEXT, fontWeight: strong ? 700 : 500 }}>{value}</span>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="panel p-4">
      <div className="eyebrow mb-1">{label}</div>
      <div className="led-number" style={{ color, fontSize: "1.35rem" }}>{value}</div>
    </div>
  );
}

function Toast({ msg }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 text-sm px-4 py-2 rounded-full shadow-lg no-print"
      style={{ background: PANEL, color: TEXT, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${AMBER}`, borderTop: `3px solid ${AMBER}` }}>
      {msg}
    </div>
  );
}

function PrintSheet({ month, entries, totals }) {
  const printedAt = new Date().toLocaleString();
  return (
    <div className="print-sheet">
      <h1 style={{ fontSize: "18px", margin: 0, fontWeight: 700 }}>{STORE.name} FSR &mdash; Catering Mileage Log</h1>
      <div style={{ fontSize: "13px", color: "#444", marginBottom: "12px" }}>
        {monthLabel(month)} &middot; Reimbursement rate ${mileageRate().toFixed(2)}/mile &middot; Paid to {programLabel()}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr>
            {["Date", "Name", "Starting", "Ending", "Miles", "Reason for trip"].map((h) => (
              <th key={h} style={{ textAlign: "left", borderBottom: "2px solid #000", padding: "4px 6px" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td style={{ borderBottom: "1px solid #ccc", padding: "4px 6px" }}>{e.date}</td>
              <td style={{ borderBottom: "1px solid #ccc", padding: "4px 6px" }}>{e.name}</td>
              <td style={{ borderBottom: "1px solid #ccc", padding: "4px 6px" }}>{e.startMiles}</td>
              <td style={{ borderBottom: "1px solid #ccc", padding: "4px 6px" }}>{e.endMiles}</td>
              <td style={{ borderBottom: "1px solid #ccc", padding: "4px 6px" }}>{mileageMiles(e).toFixed(1)}</td>
              <td style={{ borderBottom: "1px solid #ccc", padding: "4px 6px" }}>{e.reason}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} style={{ padding: "8px 6px", textAlign: "right", fontWeight: 700, borderTop: "3px solid #000" }}>Total</td>
            <td style={{ padding: "8px 6px", fontWeight: 700, borderTop: "3px solid #000" }}>{totals.miles.toFixed(1)} mi</td>
            <td style={{ padding: "8px 6px", fontWeight: 700, borderTop: "3px solid #000" }}>{money(totals.reimbursement)}</td>
          </tr>
        </tfoot>
      </table>
      <div style={{ fontSize: "10px", color: "#888", marginTop: "16px" }}>Printed {printedAt}</div>
    </div>
  );
}

const globalStyles = `
  .eyebrow { font-size: 0.68rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${MUTED}; }
  .led-number { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 600; letter-spacing: 0.02em; }
  .ledger-hero { background: radial-gradient(140% 140% at 0% 0%, #FFFFFF 0%, #F7FAFD 38%, #EDF2F8 72%, #E7EDF5 100%); border: 1px solid ${BORDER}; border-radius: 1rem; padding: 1.1rem 1.25rem; box-shadow: -7px -7px 10px -4px rgba(200,212,228,.9), 0 0 0 1px rgba(17,24,39,.06), 0 12px 28px -10px rgba(17,24,39,.22); }
  .panel { background: radial-gradient(140% 140% at 0% 0%, #FFFFFF 0%, #F7FAFD 38%, #EDF2F8 72%, #E7EDF5 100%); border: 1px solid ${BORDER}; border-radius: 1rem; box-shadow: -7px -7px 10px -4px rgba(200,212,228,.9), 0 0 0 1px rgba(17,24,39,.06), 0 12px 28px -10px rgba(17,24,39,.22); }
  .row { display: flex; align-items: center; justify-content: space-between; background: ${PANEL}; border: 1px solid ${BORDER}; border-radius: 0.75rem; padding: 0.65rem 1rem; }
  .tile-row { display: flex; align-items: center; justify-content: space-between; width: 100%; background: ${PANEL}; border: 1px solid ${BORDER}; border-radius: 1rem; padding: 0.9rem 1.1rem; text-align: left; transition: border-color 0.15s ease, transform 0.15s ease; }
  .tile-row:hover { border-color: ${AMBER}; transform: translateY(-1px); }
  .input { width: 100%; background: ${INK}; border: 1px solid ${BORDER}; border-radius: 0.6rem; padding: 0.5rem 0.65rem; font-size: 0.875rem; color: ${TEXT}; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .input::placeholder { color: #6B7280; }
  .input:focus { outline: none; border-color: ${AMBER}; box-shadow: 0 0 0 3px ${AMBER_SOFT}; }
  .input:disabled { color: ${MUTED}; }
  .btn-primary { background: ${AMBER}; color: #FFFFFF; font-weight: 600; font-size: 0.875rem; padding: 0.55rem 1.1rem; border-radius: 0.6rem; }
  .btn-primary:hover { filter: brightness(1.08); }
  .btn-secondary { background: transparent; border: 1px solid ${BORDER}; color: ${MUTED}; font-size: 0.875rem; font-weight: 500; padding: 0.55rem 1.1rem; border-radius: 0.6rem; }
  .btn-secondary:hover { background: ${PANEL}; }
  .btn-ghost { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: ${MUTED}; border: 1px solid ${BORDER}; padding: 0.3rem 0.6rem; border-radius: 0.5rem; }
  .btn-ghost:hover { color: ${TEXT}; border-color: ${AMBER}; }
  .icon-btn { padding: 0.35rem; border-radius: 0.5rem; color: ${MUTED}; }
  .icon-btn:hover { color: ${TEXT}; background: rgba(0,0,0,0.05); }
  .icon-btn.danger:hover { color: ${RED}; }

  .print-sheet { display: none; }
  @media print {
    .no-print { display: none !important; }
    .print-sheet { display: block !important; background: #fff; color: #000; padding: 24px; font-family: Arial, Helvetica, sans-serif; }
  }
`;
