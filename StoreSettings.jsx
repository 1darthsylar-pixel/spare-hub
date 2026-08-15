/* ══════════════════════════════════════════════════════════════════════════
   StoreSettings.jsx — THE STORE'S OWN SETUP, TYPED ONCE INSTEAD OF EDITED
   INTO JAVASCRIPT FILES.

   Matt, Aug 11 2026: "Standing up the Hub for another operator currently means
   me hand editing JavaScript files. That is why an install takes weeks."

   ═══ WHAT THIS EDITS, AND WHAT IT DELIBERATELY DOES NOT ═══════════════════
   Four sections, in the order an install actually happens: who the store is,
   who owns what, which parts of the Hub they run, and their numbers.

   ⚠️ STATIONS AND HOURS ARE NOT HERE YET, ON PURPOSE. That is the biggest
   section and the one that breaks the daily board for ~106 people if it is
   wrong. It gets its own build once this page has proved the save, confirm,
   undo and validate path on the four that cannot take a board down.

   ═══ IT SAVES INTO THE SAME CONFIG THE APP ALREADY READS ══════════════════
   One source of truth, never two. The record this writes is the record
   main.jsx applies at boot and every `storeCfg()` call reads through. There is
   no second copy of a setting anywhere.

   ⚠️ A FAILED READ TURNS SAVING OFF. If the current settings could not be
   fetched, this page shows what it has and refuses to write. Saving over a
   record we could not read would drop the version history and could stamp a
   stale form over another director's change. Same rule the IPO editor, the
   uniform catalogue and the scorecard all follow.

   ⚠️ NOTHING IS WRITTEN WITHOUT A CONFIRM, and the confirm names every field
   that will change. Matt's rule, and it is the right one: these values move
   the board, the money screens and who gets notified.
   ══════════════════════════════════════════════════════════════════════════ */

import React, { useEffect, useMemo, useState } from "react";
import { CARD_3D, cardSurface, accentEdge } from "./cardStyle.js";
import { hubToken } from "./store.js";
import { STORE_CONFIG, storeCfg, tokenLabel, tokenLabelOne } from "./storeConfig.js";
import { checkStoreSettings, changedPaths, atPath as at, setPath as setAt, pruneDefaults } from "./storeSettingsImport.js";

const NAVY = "#223C6A";
const RED = "#DD0031";
const GREEN = "#0F766E";
const SUB = "#6B7280";

/* ★ THE PATH HELPERS COME FROM THE SHARED LEAF, not from copies here. They
   were local to this file and the test copied them to exercise them; the two
   drifted within the hour. One definition, design rule 8. */

/* The fields, as data. Adding a setting is a row here, not a new block of JSX.
   `kind` decides the input; `note` is what the person typing needs to know and
   is written for an operator, not an engineer. */
const IDENTITY_FIELDS = [
  { path: "identity.name", label: "Store name", kind: "text", note: "Shows on every screen header and signs every email." },
  { path: "identity.legalName", label: "Legal name", kind: "text", note: "How HR emails sign off." },
  { path: "identity.fsr", label: "Store number", kind: "text", note: "The FSR number printed beside the store name." },
  { path: "identity.city", label: "City", kind: "text" },
  { path: "identity.state", label: "State", kind: "text" },
  { path: "identity.street", label: "Street the store is on", kind: "text",
    /* ⚠️ THE EXAMPLE IS DELIBERATELY NOT THIS STORE'S ROAD. A help note ships
       like any other string, so "like Gate City Blvd" would have put our
       address on every clone's settings screen as the worked example. */
    note: "Shows on the team site as \"1 · your street\". Keep it short, like the road name on your sign, not a full postal address. Blank shows your store name instead." },
  { path: "identity.timezone", label: "Timezone", kind: "text", note: "Like America/New_York. The scheduled-jobs account must match this or every job runs hours out." },
  { path: "identity.domain", label: "Web address", kind: "text", note: "No https:// in front. Like yourstorehub.com." },
  { path: "identity.notifyEmail", label: "Email the Hub sends from", kind: "text" },
  /* ⚠️ SENDING AND REPLYING ARE DIFFERENT ADDRESSES, and the one above is not a
     mailbox. It is a sending identity on a domain with no MX, so a reply to it
     goes nowhere. Leave this blank and no reply-to is sent at all, which is the
     behaviour every Hub email had before Aug 13 2026. */
  { path: "identity.replyToEmail", label: "Where replies should go", kind: "text" },
  /* ⚠️ NOT THE SAME ADDRESS AS THE ONE ABOVE, AND THE NOTE SAYS SO. The line
     above is the From: header every recipient already sees; this one is where
     the store's own security findings land. Putting your From: address here
     sends the findings to a shared mailbox. */
  { path: "identity.sweepEmail", label: "Email the 5am security sweep", kind: "text",
    note: "A person's inbox, not the From: address above. Leave blank for no email — the sweep still DMs the owner." },
  { path: "branding.appName", label: "What the team calls the app", kind: "text" },
  { path: "branding.logo", label: "Logo file", kind: "text", note: "A file already in the Hub, like /peakReachers.png." },
  /* ⚠️ SITS WITH BRANDING, NOT WITH THE TEAM SITE FEATURE SWITCH BELOW. The
     switch decides whether the page exists; this is what the page is called,
     and it is read in six places outside that page — the badge in the masthead,
     the climb card, the growth instructions and two mileage money labels. */
  { path: "teamSite.programName", label: "Name of your growth program", kind: "text",
    note: "The heading on your team site, and what the emblem is announced as. Also appears on the mileage log." },
  /* ⚠️ THE SETTING EXISTED WITH NO BOX FOR IT SINCE THE LEDGER SHIPPED. Both
     keys were in storeConfig and read correctly at render, and `tokens.js` said
     outright that "a clone calls them whatever they like without touching a
     line of this file" — which was not true, because there was nowhere to type
     it. A setting with no screen is a constant with extra steps (design rule
     18), and "I will hand-edit it during install" is not a path.
     ⚠️ TWO ROWS, NOT ONE, BECAUSE ENGLISH NEEDS BOTH. The tile picks between
     them on the count, so "1 star" and "2 stars" both read properly. One row
     would print "1 stars" to every team member with a single one.
     ⚠️⚠️ NEVER "POINTS", AND THE NOTE SAYS SO ON THE SCREEN. Gate City already
     uses points to mean DISCIPLINE points from write-ups. A reward currency by
     the same name reads as the same thing to a team member who has just been
     written up, which is the opposite of what the ledger is for. */
  { path: "tokens.label", label: "What you call your rewards, more than one", kind: "text",
    note: "Lowercase, like stars. It goes inside sentences: \"Not enough stars.\" Do NOT use points — that already means discipline points from write-ups." },
  { path: "tokens.labelOne", label: "What you call just one", kind: "text",
    note: "Lowercase, like star. Used when somebody has exactly one." },
  { path: "teamSite.established", label: "Month and year you opened", kind: "text",
    note: "Like March 2019. Leave blank and no date is shown. Years of service is worked out from this, so the two can never disagree." },
  { path: "teamSite.teamCount", label: "How many team members", kind: "text",
    note: "Like 60+. This is what your team site says about itself, not a count from the roster. Leave blank and that number is left off." },
  { path: "teamSite.mission", label: "Your mission", kind: "long",
    note: "One sentence, on your team site. The starting text is the Chick-fil-A restaurant mission, so it is safe to keep. Blank hides the card." },
  { path: "teamSite.vision", label: "Your vision", kind: "long",
    note: "One sentence. This is yours, not a company line, so leave it blank until your leadership team has agreed on it. Blank hides the card." },
  { path: "teamSite.values", label: "Your core values", kind: "list",
    note: "Separate them with commas. Any number of them. They are drawn as the stops on the ridge on your team site. Blank hides that whole panel." },
  { path: "teamSite.valuesTitle", label: "What you call your values", kind: "text",
    note: "Only if your values have a name of their own. Blank just shows Core Values." },
  { path: "teamSite.rallyCry", label: "Your rally cry", kind: "text",
    note: "The big line on the dark band. Blank hides the band." },
  { path: "teamSite.rallyLine", label: "The line under your rally cry", kind: "text",
    note: "One sentence. Only shows when you have a rally cry." },
];

const FEATURE_FIELDS = [
  { path: "features.teamSite", label: "Team site", note: "Announcements, team info and team goals." },
  { path: "features.profitShare", label: "Profit share", note: "A tab inside Financials." },
  { path: "features.pto", label: "PTO tracker", note: "Days left this year. Does not feed labor." },
  { path: "features.aiSummaries", label: "Morning digest", note: "The 7am Slack post and the Focus Today card. Off stops both." },
  /* 🐛 MISSING SINCE THE FLAG SHIPPED (Aug 11 2026), found Aug 12 when Matt
     could not see Tokens at Gate City OR at the Village and there was nothing
     to press. `features.tokens` was added to storeConfig as the literal `false`
     — correctly, because canUseTool hides on `=== false` and an absent flag
     would have shown the tile — and its own comment says "a store turns tokens
     on when it has decided what a token buys". Nothing was ever built for a
     store to turn it on WITH. It was off at every store with no switch, which
     is not "off by default", it is off.
     ⚠️ THE OTHER FOUR WERE HERE FROM THE START, so this read as a complete list
     and nobody counted it against storeConfig's five. Same shape as the runbook
     that said two name lists were gone.
     ⚠️ NO SECOND LIST TO UPDATE, checked rather than assumed: the settings
     validator accepts any boolean under `features` and does not name them, so
     this row is the whole change. */
  /* ⚠️ GETTERS, BECAUSE THE STORE NAMES THIS FEATURE ITSELF. Two boxes further
     up this same screen set what the reward is called, and this row was the one
     place that ignored them: a store that typed "stars" got a settings screen
     offering to switch on something called "Tokens", right under the box where
     it had just renamed it. Half a rename reads as a bug in the rename.
     ⚠️ READ AT USE TIME, never captured in a module const. A plain string here
     is evaluated at import, before the store's saved settings are merged, so it
     would answer "tokens" forever no matter what was saved. Same reason the
     dashboard tile in App.jsx uses `get name()`.
     ⚠️ SAFE UNDER THE SPREAD BELOW. `ALL_FIELDS` does `[...FEATURE_FIELDS]`,
     which is an ARRAY spread copying object references — the getters survive.
     An OBJECT spread would have flattened them to their import-time value. */
  {
    path: "features.tokens",
    get label() { const w = tokenLabel(); return w.charAt(0).toUpperCase() + w.slice(1); },
    get note() {
      return `The reward balance and what it buys. Leave off until the store has decided what one ${tokenLabelOne()} is worth.`;
    },
  },
];

const FINANCIAL_FIELDS = [
  { path: "financial.feeShare", label: "Service fee share of sales", kind: "num", note: "As a decimal. 15% is 0.15." },
  { path: "financial.mileageRate", label: "Mileage rate", kind: "num", note: "Dollars per mile. Only prices new claims." },
  { path: "financial.goals.food", label: "Food cost goal", kind: "num", note: "As a decimal. 27.56% is 0.2756." },
  { path: "financial.goals.paper", label: "Paper cost goal", kind: "num", note: "As a percent. 3.27 means 3.27%." },
  { path: "financial.paperBand", label: "Paper amber band", kind: "num", note: "How far over goal is still amber rather than red." },
  { path: "financial.goals.turnover", label: "Turnover goal", kind: "num", note: "As a decimal. 8% is 0.08." },
  { path: "financial.goals.salesGrowth", label: "Sales growth goal", kind: "num", note: "As a decimal. 5% is 0.05." },
  { path: "financial.goals.evalsOnTime", label: "Evaluations on time goal", kind: "num", note: "As a decimal. 90% is 0.9." },
  { path: "financial.goals.carsPerHour", label: "Cars per hour goal", kind: "num" },
];

/* ═══ HOW LONG MESSAGES ARE KEPT ════════════════════════════════════════════
   Matt, Aug 13 2026, before any of the messaging shipped: "Every message type
   needs a stated retention period, configurable per store, with a default."
   His defaults are in announcements.js and they are what a blank field means.

   ⚠️⚠️ THIS IS A SCREEN AND NOT A CONSTANT BECAUSE IT IS DESIGN RULE 18 IN ITS
   most literal form. A retention period is a thing a store's own lawyer has an
   opinion about. A number written into the source is Gate City's records policy
   travelling into somebody else's store and arriving looking deliberate — the
   same shape as the FY26 scorecard and the BOH station list.

   ⚠️ BLANK MEANS KEEP INDEFINITELY, and it is deliberately not a huge number.
   A big number is a period that quietly expires one day; blank cannot.
   ⚠️ NOTHING HERE LETS ANYBODY DELETE. Matt: "Nothing is ever hard deleted by a
   user. A store owner can purge on a schedule. Messages are records the moment
   they exist." This sets the schedule; it is not a delete button. */
const RETENTION_FIELDS = [
  /* ⚠️ THE NOTES SAY "DELETED FOR GOOD" NOW, because as of Aug 13 2026 they
     are. Until the purge job existed these three boxes saved a number and did
     nothing, so a note that only described the intent was harmless. It is not
     harmless any more: this is the one screen in the Hub where typing a number
     permanently destroys other people's messages, and the person typing it
     should read that before they tab away. The 30-day floor is enforced in
     storeSettingsImport.js, which is the SAME validator this screen runs and
     the Worker runs on save — one rule, both doors. */
  { path: "retention.announcements", label: "Announcements", kind: "text", note: "Days to keep announcements and their confirmations, then they are deleted for good. Blank keeps them, which is the default. Minimum 30." },
  { path: "retention.shiftThreads", label: "Shift threads", kind: "text", note: "Days after the last message on a request off, then the conversation is deleted for good. Blank keeps it as long as the request itself, which is the default. Minimum 30." },
  { path: "retention.escalations", label: "Escalations", kind: "text", note: "Days to keep messages sent to the leader on duty, then they are deleted for good. Blank uses the default of 365. Minimum 30." },
];

const MESSAGING_FIELDS = [
  { path: "messaging.opsSuccess", label: "Operations channel", kind: "text", note: "Monthly reports, change fund, boil notices." },
  { path: "messaging.brand", label: "Food safety channel", kind: "text", note: "Walkthroughs and cleaning roll-ups." },
  { path: "messaging.inventory", label: "Inventory channel", kind: "text", note: "Waste, donations, supply orders." },
  { path: "messaging.team", label: "Team channel", kind: "text", note: "The team scoreboard." },
];

/* ⚠️⚠️ THE TWO NUMBERS THAT HOLD AUTO APPROVAL BACK, not two numbers that make
   it work. The switch itself is rendered separately below with `=== true`
   semantics rather than joining FEATURE_FIELDS, and that difference is
   load-bearing: the feature checkboxes use `!== false`, so a MISSING value
   shows as ON. For a switch that lets the Hub move a person on the board with
   nobody looking, absent has to mean off. */
/* Its own list of one, so `labelFor` names it on the confirm screen. A change
   to this switch must never read as a bare dotted path there — it is the single
   most consequential box on this page. */
const SWAP_TOGGLE = [
  { path: "swaps.autoApprove", label: "Approve clean shift swaps automatically",
    note: "Off, the Hub only ever shows the checks and a leader taps Approve. On, a swap goes through by itself when every check is clean, there is enough notice, and the person giving it up is inside the weekly limit below. It never approves one with a warning on it." },
];

const SWAP_FIELDS = [
  { path: "swaps.minNoticeHours", label: "Hours of notice needed", kind: "num",
    note: "Under this many hours before the shift starts, a leader has to approve it. 12 is the default." },
  { path: "swaps.maxDropsPerWeek", label: "Shifts one person can hand off a week", kind: "num",
    note: "Past this, they can still put a shift up but a leader has to say yes. It also shows on the approval screen. 2 is the default." },
];

const thStyle = { padding: "7px 8px", borderBottom: "1px solid #E4E3DD", fontSize: 11, fontWeight: 800, color: "#6B7280", textAlign: "left", background: "#F7F7F4", whiteSpace: "nowrap" };
const tdStyle = { padding: "6px 8px", borderBottom: "1px solid #F0EFEA", verticalAlign: "top" };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUSES = [{ id: "FOH", label: "Front of house" }, { id: "BOH", label: "Back of house" }];

/* ★ MODULE LEVEL (design rule 7): these run inside a useMemo on first render. */

/* Minutes from midnight to something a person reads. 360 -> "6a", 675 -> "11:15a" */
function clock(min) {
  if (min == null || !Number.isFinite(min)) return "";
  const h24 = Math.floor(min / 60) % 24, m = min % 60;
  const ap = h24 >= 12 ? "p" : "a";
  let h = h24 % 12; if (h === 0) h = 12;
  return m ? `${h}:${String(m).padStart(2, "0")}${ap}` : `${h}${ap}`;
}
/* What one cell shows: every posted block, or a dash when the station has no
   hours on that day. A split shift shows both blocks — hiding the second is how
   somebody deletes an evening without noticing. */
function cellText(st) {
  if (!st) return "";
  if (st.leader) return "leader";
  if (!st.hours || !st.hours.length) return "all day";
  return st.hours.map((b) => `${clock(b.start)}-${clock(b.end)}`).join(", ");
}
/* "6:30a" / "6a" / "18:30" / "1830" -> minutes. Returns null on anything it
   cannot read, and the caller must refuse rather than guess: a mistyped hour
   that silently becomes 6am is a station somebody is not standing at. */
function parseClock(txt) {
  const t = String(txt || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return null;
  const m = t.match(/^(\d{1,2})(?::?(\d{2}))?(a|p|am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3] ? m[3][0] : "";
  if (min > 59) return null;
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  if (!ap && h <= 24 && t.length >= 3 && !m[3]) { /* 24h typed, leave as is */ }
  if (h > 24) return null;
  return h * 60 + min;
}

/* ★ THE ROWS ARE A UNION ACROSS THE SIX DAYS, KEYED BY id.
   A station does not exist on every day — the weekend template carries rows the
   weekday one does not. A grid built from one day would silently hide them, and
   a grid built per day could not show a row at all. The union is what makes
   "days across, stations down" honest: an empty cell means that station is not
   on the board that day, which is a real answer. */
function stationRows(stations, house) {
  const byId = new Map();
  for (const day of DAYS) {
    const list = (stations && stations[house] && stations[house][day]) || [];
    for (const st of list) {
      if (!byId.has(st.id)) byId.set(st.id, { id: st.id, name: st.name, section: st.section, leader: !!st.leader, days: {} });
      byId.get(st.id).days[day] = st;
    }
  }
  return [...byId.values()];
}

/* Turn a dotted path into the words the confirm screen shows. Falls back to the
   path itself rather than hiding a change nobody has labelled. */
const ALL_FIELDS = [...IDENTITY_FIELDS, ...FEATURE_FIELDS, ...FINANCIAL_FIELDS, ...MESSAGING_FIELDS, ...RETENTION_FIELDS, ...SWAP_FIELDS, ...SWAP_TOGGLE];
const HOUSE_LABEL = { FOH: "Front of house", BOH: "Back of house" };
const labelFor = (path) => {
  const hit = ALL_FIELDS.find((f) => f.path === path);
  if (hit) return hit.label;
  if (path.startsWith("owners.")) return "Area owners";
  const st = path.match(/^stations\.(FOH|BOH)\.(\w+)$/);
  if (st) return `Stations · ${HOUSE_LABEL[st[1]] || st[1]} · ${st[2]}`;
  if (path === "stations.boardPeriods") return "Board day-part windows";
  if (path === "stations.dayparts") return "Labor day-part windows";
  return path;
};

/* ★★ WHAT ACTUALLY CHANGED IN A STATION LIST, NAMED.
   🐛 THE CONFIRM SCREEN READ "25 entries → 25 entries" AND THAT IS NOT A
   CONFIRM. It is the same failure the financial rows had — the screen naming a
   container instead of the thing inside it — and it is worse here, because a
   director confirming a board change cannot see whether one station moved by
   half an hour or somebody deleted the drive thru. Compares by id, so a rename
   reads as a rename rather than as a delete plus an add. */
function describeStations(before, after) {
  const a = Array.isArray(before) ? before : [];
  const b = Array.isArray(after) ? after : [];
  const byId = (list) => new Map(list.map((x) => [x.id, x]));
  const A = byId(a), B = byId(b);
  const out = [];
  for (const [id, nb] of B) {
    const na = A.get(id);
    if (!na) { out.push(`added ${nb.name}`); continue; }
    if (na.name !== nb.name) out.push(`${na.name} renamed to ${nb.name}`);
    if (JSON.stringify(na.hours) !== JSON.stringify(nb.hours)) out.push(`${nb.name} ${cellText(na)} to ${cellText(nb)}`);
    if (!na.leader !== !nb.leader) out.push(`${nb.name} ${nb.leader ? "now leader-covered" : "no longer leader-covered"}`);
  }
  for (const [id, na] of A) if (!B.has(id)) out.push(`removed ${na.name}`);
  /* A cap, and it SAYS it is capped. A silent "and 3 more" that was not there
     is how somebody confirms a change they did not read. */
  if (out.length > 6) return out.slice(0, 6).join("; ") + `; and ${out.length - 6} more`;
  return out.join("; ") || "reordered";
}
const showValue = (v) => {
  if (v === true) return "on";
  if (v === false) return "off";
  if (v === null || v === undefined || v === "") return "(not set)";
  if (Array.isArray(v)) return `${v.length} entries`;
  if (typeof v === "object") return "changed";
  return String(v);
};

export default function StoreSettings({ tier, user = {} }) {
  /* `saved` is what the store has stored; `draft` is that plus unsaved edits.
     Both are OVERRIDES ONLY — never the whole config — so the record stays a
     short list of what this store changed rather than a copy of the defaults. */
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  /* null until the read lands. A failed read is NOT an empty record: one would
     let a save write {} over a real setup. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/store-config", { headers: { "x-hub-token": hubToken() } });
        if (!res.ok) throw new Error("read failed");
        const body = await res.json();
        if (!alive) return;
        if (!body || !body.ok) throw new Error("read refused");
        const rec = body.settings && typeof body.settings === "object" ? body.settings : {};
        setSaved(rec);
        setDraft(rec);
        setUpdatedAt(body.updatedAt || "");
      } catch {
        if (alive) setLoadFailed(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  /* The value a field should show: the store's own if it has one, otherwise the
     code default. `storeCfg` reads the merged view, which is exactly right —
     what the app is using right now is what the box should say. */
  const valueOf = (path) => {
    const own = at(draft, path);
    return own === undefined ? storeCfg(path) : own;
  };

  const seats = useMemo(() => {
    const own = at(draft, "owners.seats");
    return Array.isArray(own) ? own : STORE_CONFIG.owners.seats;
  }, [draft]);

  const [house, setHouse] = useState("FOH");
  /* Which cell is open for editing: "FOH|window|Mon", or null. One at a time,
     because a grid of live inputs on a phone is a tap-target minefield. */
  const [openCell, setOpenCell] = useState(null);
  const [cellErr, setCellErr] = useState("");

  const stations = useMemo(() => {
    const own = at(draft, "stations");
    return own && own.FOH ? { ...STORE_CONFIG.stations, ...own } : STORE_CONFIG.stations;
  }, [draft]);
  const rows = useMemo(() => stationRows(stations, house), [stations, house]);

  /* Every station write goes through here, so the merge shape is decided in one
     place. `fn` gets the day's list and returns the new one. */
  const editDay = (h, day, fn) => {
    const cur = (stations[h] && stations[h][day]) || [];
    const next = fn(cur.map((x) => ({ ...x })));
    setMsg("");
    setDraft((d) => pruneDefaults(setAt(d || {}, `stations.${h}.${day}`, next), STORE_CONFIG));
  };
  /* Rename, leader and remove apply to EVERY day the station is on. An operator
     renaming a station means the station, not one Tuesday. Hours are the only
     thing that is genuinely per day, which is why they are the grid's cells. */
  /* ── MOVE A STATION UP OR DOWN ─────────────────────────────────────────
     Matt, Aug 14 2026: "in store confige when adding stations we need to be
     able to move them up or down." A new station lands at the bottom of every
     day, and the board renders in this order, so the only way to get a station
     into the right place was to delete the ones below it and retype them.

     ⚠️⚠️ IT SWAPS INSIDE EACH DAY, IT DOES NOT IMPOSE ONE ORDER ON ALL OF THEM.
     The grid shows ONE row per station, built from the UNION across days —
     `stationRows` says so in as many words, because the weekend template
     carries rows the weekday one does not. So a day is free to have its own
     order today, and re-sorting every day to match the grid would silently
     rewrite Saturday because somebody nudged a row while looking at Monday.
     ⇒ Only the two stations being swapped move, only on the days that carry
     BOTH of them, and every other day is left exactly as it was read.

     ⚠️ IF THE TWO SHARE NO DAY, NOTHING CAN MOVE AND IT SAYS SO. Their relative
     order in the grid comes from which day was iterated first, not from any
     stored list, so there is no swap to write. Silently doing nothing would
     read as a dead button — check 3's signature symptom. */
  const moveStation = (h, id, dir) => {
    const order = stationRows(stations, h).map((r) => r.id);
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const otherId = order[j];
    let touched = 0;
    setMsg("");
    setDraft((d) => {
      let next = d || {};
      for (const day of DAYS) {
        const cur = (stations[h] && stations[h][day]) || [];
        const a = cur.findIndex((x) => x.id === id);
        const b = cur.findIndex((x) => x.id === otherId);
        if (a < 0 || b < 0) continue;
        const copy = cur.map((x) => ({ ...x }));
        const tmp = copy[a]; copy[a] = copy[b]; copy[b] = tmp;
        next = setAt(next, `stations.${h}.${day}`, copy);
        touched++;
      }
      return pruneDefaults(next, STORE_CONFIG);
    });
    if (!touched) {
      setMsg("Those two stations are never on the same day, so there is no order to change between them.");
    }
  };

  const editEveryDay = (h, id, fn) => {
    setMsg("");
    setDraft((d) => {
      let next = d || {};
      for (const day of DAYS) {
        const cur = (stations[h] && stations[h][day]) || [];
        if (!cur.some((x) => x.id === id)) continue;
        next = setAt(next, `stations.${h}.${day}`, cur.map((x) => (x.id === id ? fn({ ...x }) : { ...x })));
      }
      return pruneDefaults(next, STORE_CONFIG);
    });
  };

  const pending = useMemo(() => {
    if (draft == null || saved == null) return [];
    return changedPaths(saved, draft);
  }, [draft, saved]);

  const verdict = useMemo(() => (draft == null ? { ok: true, errors: [], warnings: [] } : checkStoreSettings(draft)), [draft]);

  const canSave = !loadFailed && draft != null && pending.length > 0 && verdict.ok && !busy;

  const edit = (path, value) => {
    setMsg("");
    setDraft((d) => pruneDefaults(setAt(d || {}, path, value), STORE_CONFIG));
  };

  const setSeat = (id, holder) => {
    const next = seats.map((s) => (s.id === id ? { ...s, holder: holder || null, holderId: holder ? s.holderId : null } : s));
    setMsg("");
    setDraft((d) => pruneDefaults(setAt(d || {}, "owners.seats", next), STORE_CONFIG));
  };

  async function doSave() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/store-config", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
        body: JSON.stringify({ settings: draft }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body || !body.ok) {
        /* ⚠️ THE SERVER'S REASON IS SHOWN VERBATIM. It ran the same validator
           this page did, so if the two ever disagree the person typing needs to
           see which one refused and why, not a generic failure. */
        const why = body && Array.isArray(body.errors) && body.errors.length ? body.errors.join(" ") : (body && body.error) || "that did not save";
        setMsg(why);
        setBusy(false);
        return;
      }
      setSaved(draft);
      setUpdatedAt(body.updatedAt || "");
      setConfirming(false);
      setMsg("Saved. It is live for everyone on their next refresh.");
    } catch {
      setMsg("That did not save — check the wifi and try again. Nothing was changed.");
    }
    setBusy(false);
  }

  /* 🐛 `...cardSurface(NAVY, 1.1)` WAS HERE AND IT IS A STRING, NOT AN OBJECT.
     Spreading a string into a style object gives it numeric keys — "0", "1",
     "2" — and React then tries to set indexed CSS properties, which throws
     "Indexed property setter is not supported" and takes the whole page to a
     blank screen. Every one of the six checks passed on it and so did the
     build; only opening it in a browser showed it. cardSurface returns a
     gradient, so it belongs in backgroundImage, which is how HRConsole and
     PeakReachers both use it. */
  const wrap = { backgroundColor: "#fff", backgroundImage: cardSurface(NAVY, 0.5), border: "1px solid #E4E3DD", ...accentEdge(NAVY, 3), boxShadow: CARD_3D, padding: 16, borderRadius: 12, marginBottom: 14 };
  const lbl = { fontSize: 12.5, fontWeight: 700, color: "#111827", marginBottom: 3 };
  const inp = { width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: 16, background: "#fff", color: "#111827" };
  const noteStyle = { fontSize: 11, color: SUB, marginTop: 3, lineHeight: 1.4 };

  if (tier < 3) {
    /* Belt and braces. The tile is already gated at tier 3 in App.jsx, so this
       should be unreachable — but a settings page is the one screen where a
       second refusal costs nothing and a missed one costs everything. */
    return <div style={{ padding: 18, color: SUB }}>Store settings are for directors.</div>;
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "4px 2px 40px" }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>Store settings</div>
        <div style={{ fontSize: 12.5, color: SUB, marginTop: 3 }}>
          Everything the Hub knows about this store. Changes go live for everyone on their next refresh.
          {updatedAt ? ` Last changed ${new Date(updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.` : ""}
        </div>
      </div>

      {loadFailed && (
        <div style={{ ...wrap, ...accentEdge(RED), background: "#FEF2F2" }}>
          <div style={{ fontWeight: 800, color: "#B91C1C", fontSize: 13.5 }}>Settings could not be loaded</div>
          <div style={{ fontSize: 12.5, color: "#7F1D1D", marginTop: 4, lineHeight: 1.5 }}>
            Saving is off, because writing now could overwrite the real setup with a blank one.
            Nothing has been changed. Check the wifi and reopen this page.
          </div>
        </div>
      )}

      {draft == null && !loadFailed && <div style={{ padding: 18, color: SUB }}>Loading the settings…</div>}

      {draft != null && (
        <>
          <Section title="1 · Identity and branding" wrap={wrap}>
            {IDENTITY_FIELDS.map((f) => (
              <Field key={f.path} f={f} lbl={lbl} inp={inp} noteStyle={noteStyle} value={valueOf(f.path)} onChange={edit} disabled={loadFailed} />
            ))}
          </Section>

          <Section title="2 · Area owners" wrap={wrap}>
            <div style={{ ...noteStyle, marginBottom: 8 }}>
              Leave one blank if nobody owns it yet. That is a real answer and the Hub treats it as one.
            </div>
            {seats.map((s) => (
              <div key={s.id} style={{ marginBottom: 10 }}>
                <div style={lbl}>{s.area || s.fn || s.id}</div>
                <input
                  style={inp}
                  value={s.holder || ""}
                  placeholder="Nobody yet"
                  disabled={loadFailed}
                  onChange={(e) => { const v = e.target.value; setSeat(s.id, v); }}
                />
              </div>
            ))}
          </Section>

          <Section title="3 · Stations and hours" wrap={wrap}>
            <div style={{ ...noteStyle, marginBottom: 9 }}>
              Days across, stations down. Tap a time to change it. A blank cell means that station is
              not on the board that day.
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {HOUSES.map((h) => (
                <button key={h.id} type="button" onClick={() => { setHouse(h.id); setOpenCell(null); }}
                  style={{ padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
                    border: house === h.id ? "none" : "1px solid #D1D5DB",
                    background: house === h.id ? NAVY : "#fff", color: house === h.id ? "#fff" : "#111827" }}>
                  {h.label}
                </button>
              ))}
            </div>

            {/* ⚠️ SCROLLS INSIDE ITS OWN BOX, never the page. Six day columns do
                not fit a phone, and a page that scrolls sideways is one a leader
                loses their place in mid-rush. */}
            <div style={{ overflowX: "auto", border: "1px solid #E4E3DD", borderRadius: 9, background: "#fff" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 620 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, position: "sticky", left: 0, background: "#F7F7F4", minWidth: 150 }}>Station</th>
                    {DAYS.map((d) => <th key={d} style={thStyle}>{d}</th>)}
                    <th style={thStyle} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={r.id}>
                      <td style={{ ...tdStyle, position: "sticky", left: 0, background: "#fff", minWidth: 150 }}>
                        <input
                          style={{ ...inp, fontSize: 13, padding: "5px 7px" }}
                          value={r.name}
                          disabled={loadFailed}
                          onChange={(e) => { const v = e.target.value; editEveryDay(house, r.id, (x) => ({ ...x, name: v })); }}
                        />
                        <label style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, fontSize: 11, color: SUB, cursor: "pointer" }}>
                          <input type="checkbox" checked={r.leader} disabled={loadFailed}
                            onChange={(e) => { const on = e.target.checked; editEveryDay(house, r.id, (x) => ({ ...x, leader: on })); }} />
                          Leader covers it
                        </label>
                      </td>
                      {DAYS.map((d) => {
                        const st = r.days[d];
                        const key = `${house}|${r.id}|${d}`;
                        return (
                          <td key={d} style={{ ...tdStyle, textAlign: "center", whiteSpace: "nowrap" }}>
                            {!st ? <span style={{ color: "#C7CBD1" }}>—</span> : openCell === key ? (
                              <CellEditor
                                station={st}
                                onCancel={() => { setOpenCell(null); setCellErr(""); }}
                                onSave={(hours, err) => {
                                  if (err) { setCellErr(err); return; }
                                  editDay(house, d, (list) => list.map((x) => (x.id === r.id ? { ...x, hours } : x)));
                                  setOpenCell(null); setCellErr("");
                                }}
                              />
                            ) : (
                              <button type="button" disabled={loadFailed}
                                onClick={() => { setOpenCell(key); setCellErr(""); }}
                                style={{ border: "none", background: "none", font: "inherit", color: st.leader ? SUB : "#111827",
                                  cursor: loadFailed ? "default" : "pointer", padding: "3px 4px", textDecoration: loadFailed ? "none" : "underline dotted" }}>
                                {cellText(st)}
                              </button>
                            )}
                          </td>
                        );
                      })}
                      {/* ⚠️ MOVE AND REMOVE SIT IN THE SAME CELL, and move comes
                          FIRST. Remove is the destructive one and it is a single
                          × with no confirm, so putting two new buttons on the
                          far side of it would mean reaching past a delete every
                          time somebody nudges a row. */}
                      <td style={{ ...tdStyle, textAlign: "center", whiteSpace: "nowrap" }}>
                        <button type="button" disabled={loadFailed || ri === 0}
                          title="Move this station up"
                          onClick={() => moveStation(house, r.id, -1)}
                          style={{ border: "none", background: "none", color: ri === 0 ? "#C7CBD1" : NAVY,
                            fontWeight: 800, cursor: loadFailed || ri === 0 ? "default" : "pointer",
                            fontSize: 13, padding: "0 3px" }}>▲</button>
                        <button type="button" disabled={loadFailed || ri === rows.length - 1}
                          title="Move this station down"
                          onClick={() => moveStation(house, r.id, 1)}
                          style={{ border: "none", background: "none", color: ri === rows.length - 1 ? "#C7CBD1" : NAVY,
                            fontWeight: 800, cursor: loadFailed || ri === rows.length - 1 ? "default" : "pointer",
                            fontSize: 13, padding: "0 3px" }}>▼</button>
                        <button type="button" disabled={loadFailed}
                          title="Remove this station from every day"
                          onClick={() => { for (const d of DAYS) editDay(house, d, (list) => list.filter((x) => x.id !== r.id)); }}
                          style={{ border: "none", background: "none", color: RED, fontWeight: 800, cursor: "pointer", fontSize: 14, paddingLeft: 6 }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cellErr && <div style={{ marginTop: 7, fontSize: 12.5, fontWeight: 700, color: RED }}>{cellErr}</div>}

            {/* ⚠️ "HOW MANY PEOPLE" IS THE ROW COUNT, NOT A FIELD, and that is
                how this board has always said it. Two people on a role is two
                rows — REGISTER 1 and REGISTER 2 where they differ, or the same
                name twice where they do not. Gate City runs 18 duplicate-name
                rows today. A count column would be a second way to say what the
                rows already say, and two ways to say one thing drift. */}
            <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap" }}>
              <button type="button" disabled={loadFailed}
                onClick={() => {
                  const id = `st${Date.now().toString(36)}`;
                  for (const d of DAYS) editDay(house, d, (list) => [...list, { id, name: "NEW STATION", section: list.length ? list[list.length - 1].section : "", hours: null, duty: "" }]);
                }}
                style={{ padding: "8px 13px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                + Add a station
              </button>
              <span style={{ ...noteStyle, marginTop: 8 }}>
                Two people on one role is two stations. Add it twice.
              </span>
            </div>
          </Section>

          <Section title="4 · Features" wrap={wrap}>
            {FEATURE_FIELDS.map((f) => (
              <label key={f.path} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 11, cursor: loadFailed ? "default" : "pointer" }}>
                <input
                  type="checkbox"
                  checked={valueOf(f.path) !== false}
                  disabled={loadFailed}
                  onChange={(e) => { const on = e.target.checked; edit(f.path, on); }}
                  style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0 }}
                />
                <span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "#111827" }}>{f.label}</span>
                  {f.note && <span style={{ ...noteStyle, marginTop: 1, display: "block" }}>{f.note}</span>}
                </span>
              </label>
            ))}
          </Section>

          <Section title="5 · Financial" wrap={wrap}>
            {FINANCIAL_FIELDS.map((f) => (
              <Field key={f.path} f={f} lbl={lbl} inp={inp} noteStyle={noteStyle} value={valueOf(f.path)} onChange={edit} disabled={loadFailed} />
            ))}
            <div style={{ height: 6 }} />
            <div style={{ ...lbl, marginTop: 8, marginBottom: 6, color: NAVY }}>Slack channels</div>
            {MESSAGING_FIELDS.map((f) => (
              <Field key={f.path} f={f} lbl={lbl} inp={inp} noteStyle={noteStyle} value={valueOf(f.path)} onChange={edit} disabled={loadFailed} />
            ))}
            <div style={{ height: 6 }} />
            <div style={{ ...lbl, marginTop: 8, marginBottom: 6, color: NAVY }}>How long messages are kept</div>
            {RETENTION_FIELDS.map((f) => (
              <Field key={f.path} f={f} lbl={lbl} inp={inp} noteStyle={noteStyle} value={valueOf(f.path)} onChange={edit} disabled={loadFailed} />
            ))}
          </Section>

          {/* ⚠️⚠️ ITS OWN SECTION, NOT A ROW UNDER FEATURES. This is the one box
              on this screen that lets the Hub take a person off a shift and put
              somebody else on it with nobody looking. It reads `=== true`, so a
              store that has never touched it is OFF. */}
          <Section title="6 · Shift swaps" wrap={wrap}>
            {SWAP_TOGGLE.map((f) => (
              <label key={f.path} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 11, cursor: loadFailed ? "default" : "pointer" }}>
                <input
                  type="checkbox"
                  checked={valueOf(f.path) === true}
                  disabled={loadFailed}
                  onChange={(e) => { const on = e.target.checked; edit(f.path, on); }}
                  style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0 }}
                />
                <span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "#111827" }}>{f.label}</span>
                  {f.note && <span style={{ ...noteStyle, marginTop: 1, display: "block" }}>{f.note}</span>}
                </span>
              </label>
            ))}
            {SWAP_FIELDS.map((f) => (
              <Field key={f.path} f={f} lbl={lbl} inp={inp} noteStyle={noteStyle} value={valueOf(f.path)} onChange={edit} disabled={loadFailed} />
            ))}
          </Section>

          {verdict.errors.length > 0 && (
            <div style={{ ...wrap, ...accentEdge(RED), background: "#FEF2F2" }}>
              <div style={{ fontWeight: 800, color: "#B91C1C", fontSize: 13.5 }}>Fix these before saving</div>
              {verdict.errors.map((e, i) => (
                <div key={i} style={{ fontSize: 12.5, color: "#7F1D1D", marginTop: 4 }}>· {e}</div>
              ))}
            </div>
          )}

          {verdict.warnings.length > 0 && verdict.ok && (
            <div style={{ ...wrap, background: "#FFFBEB" }}>
              {verdict.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 12.5, color: "#92400E" }}>· {w}</div>
              ))}
            </div>
          )}

          {confirming ? (
            <div style={{ ...wrap, ...accentEdge(NAVY), background: "#fff" }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#111827" }}>
                {pending.length === 1 ? "One change" : `${pending.length} changes`}
              </div>
              <div style={{ ...noteStyle, marginBottom: 8 }}>Everyone sees these on their next refresh.</div>
              {pending.map((p) => (
                <div key={p} style={{ fontSize: 12.5, color: "#111827", marginBottom: 5 }}>
                  <b>{labelFor(p)}</b>
                  {/^stations\.(FOH|BOH)\./.test(p) ? (
                    <span style={{ color: GREEN, fontWeight: 700 }}> · {describeStations(at(saved, p) === undefined ? storeCfg(p) : at(saved, p), at(draft, p))}</span>
                  ) : (
                    <>
                      <span style={{ color: SUB }}> · {showValue(at(saved, p) === undefined ? storeCfg(p) : at(saved, p))} → </span>
                      <span style={{ color: GREEN, fontWeight: 700 }}>{showValue(at(draft, p))}</span>
                    </>
                  )}
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button onClick={doSave} disabled={busy} style={{ padding: "10px 16px", borderRadius: 9, border: "none", background: busy ? SUB : GREEN, color: "#fff", fontWeight: 800, fontSize: 13.5, cursor: busy ? "default" : "pointer" }}>
                  {busy ? "Saving…" : "Yes, save"}
                </button>
                <button onClick={() => setConfirming(false)} disabled={busy} style={{ padding: "10px 16px", borderRadius: 9, border: "1px solid #D1D5DB", background: "#fff", color: "#111827", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
                  Back
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
              <button
                onClick={() => setConfirming(true)}
                disabled={!canSave}
                style={{ padding: "11px 18px", borderRadius: 9, border: "none", background: canSave ? NAVY : "#D1D5DB", color: "#fff", fontWeight: 800, fontSize: 14, cursor: canSave ? "pointer" : "default" }}
              >
                Review {pending.length || ""} change{pending.length === 1 ? "" : "s"}
              </button>
              {pending.length > 0 && (
                <button onClick={() => { setDraft(saved); setMsg(""); }} style={{ padding: "11px 14px", borderRadius: 9, border: "1px solid #D1D5DB", background: "#fff", color: "#111827", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
                  Undo my edits
                </button>
              )}
              {pending.length === 0 && <span style={{ fontSize: 12.5, color: SUB }}>Nothing changed yet.</span>}
            </div>
          )}

          {msg && (
            <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: /did not|could not|Fix/i.test(msg) ? RED : GREEN }}>
              {msg}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* One cell's posted hours. Times are typed, not picked: a leader knows "6a" and
   "11:15a" and typing it is faster than two dropdowns per block on a phone.

   ⚠️ IT REFUSES RATHER THAN GUESSES. Anything it cannot read comes back as an
   error and nothing is written. A mistyped hour that silently becomes 6am is a
   station nobody is standing at, and the board would look completely normal.

   ⚠️ EMPTY MEANS "no posted hours", which the board renders as open all day.
   That is a real state — several stations carry it — so clearing the boxes is
   allowed and is not the same as removing the station. */
function CellEditor({ station, onSave, onCancel }) {
  const blocks = (station.hours && station.hours.length ? station.hours : [{ start: null, end: null }]);
  const [txt, setTxt] = useState(blocks.map((b) => ({ s: clock(b.start), e: clock(b.end) })));
  const box = { width: 62, padding: "4px 5px", borderRadius: 6, border: "1px solid #D1D5DB", fontSize: 13, background: "#fff" };
  const set = (i, k, v) => setTxt((t) => t.map((row, j) => (j === i ? { ...row, [k]: v } : row)));
  return (
    <div style={{ display: "inline-block", textAlign: "left" }}>
      {txt.map((row, i) => (
        <div key={i} style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 4 }}>
          <input style={box} value={row.s} placeholder="6a" onChange={(e) => { const v = e.target.value; set(i, "s", v); }} />
          <span style={{ color: "#9CA3AF" }}>–</span>
          <input style={box} value={row.e} placeholder="11p" onChange={(e) => { const v = e.target.value; set(i, "e", v); }} />
        </div>
      ))}
      <div style={{ display: "flex", gap: 5, marginTop: 3 }}>
        <button type="button" style={{ ...box, width: "auto", cursor: "pointer", fontWeight: 700 }}
          onClick={() => {
            const out = [];
            for (const row of txt) {
              const a = String(row.s || "").trim(), b = String(row.e || "").trim();
              if (!a && !b) continue;
              const st = parseClock(a), en = parseClock(b);
              if (st == null || en == null) return onSave(null, `"${a || b}" is not a time this understands. Try 6a, 11:15a or 5p.`);
              if (en <= st) return onSave(null, "A block cannot end before it starts.");
              out.push({ start: st, end: en });
            }
            onSave(out.length ? out : null, "");
          }}>Save</button>
        <button type="button" style={{ ...box, width: "auto", cursor: "pointer" }} onClick={onCancel}>Cancel</button>
        <button type="button" style={{ ...box, width: "auto", cursor: "pointer" }}
          onClick={() => setTxt((t) => [...t, { s: "", e: "" }])}>+ block</button>
      </div>
    </div>
  );
}

function Section({ title, wrap, children }) {
  return (
    <div style={wrap}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.04em", color: NAVY, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ f, lbl, inp, noteStyle, value, onChange, disabled }) {
  /* ⚠️ TWO KINDS FOR THE TEAM SITE, AND BOTH EARN THEIR KEEP. A mission
     statement in a one-line box scrolls sideways while you type it on a phone,
     which is where a store will type it. And the values are an ARRAY in the
     record — the team site maps over them — so a plain text box would save a
     string and the renderer would map over its characters. */
  if (f.kind === "long" || f.kind === "list") {
    const shown = f.kind === "list"
      ? (Array.isArray(value) ? value.join(", ") : String(value == null ? "" : value))
      : (value == null ? "" : value);
    return (
      <div style={{ marginBottom: 11 }}>
        <div style={lbl}>{f.label}</div>
        <textarea
          style={{ ...inp, minHeight: f.kind === "long" ? 66 : 44, resize: "vertical", fontFamily: "inherit", lineHeight: 1.4 }}
          value={shown}
          disabled={disabled}
          onChange={(e) => {
            /* Read before the updater runs — the synthetic-event trap, same as
               the input below. */
            const raw = e.target.value;
            if (f.kind !== "list") { onChange(f.path, raw); return; }
            /* ⚠️ AN EMPTY BOX SAVES AN EMPTY ARRAY, NOT undefined. undefined
               would fall back to the code default, and for a store clearing
               somebody else's values that is the opposite of what they pressed. */
            onChange(f.path, raw.split(",").map((s) => s.trim()).filter(Boolean));
          }}
        />
        {f.note && <div style={noteStyle}>{f.note}</div>}
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={lbl}>{f.label}</div>
      <input
        style={inp}
        type={f.kind === "num" ? "number" : "text"}
        step={f.kind === "num" ? "any" : undefined}
        inputMode={f.kind === "num" ? "decimal" : undefined}
        value={value === null || value === undefined ? "" : value}
        disabled={disabled}
        onChange={(e) => {
          /* ⚠️ THE VALUE IS READ BEFORE THE UPDATER RUNS. Reading e.target
             inside the arrow passed to a state setter is the synthetic-event
             bug this repo has a check for; React pools the event and it is
             gone by the time the updater fires. */
          const raw = e.target.value;
          if (f.kind !== "num") { onChange(f.path, raw); return; }
          /* An empty box means "back to the default", not zero. Zero is a real
             value somebody may want, so it has to be typed. */
          if (raw === "") { onChange(f.path, undefined); return; }
          const n = Number(raw);
          onChange(f.path, Number.isFinite(n) ? n : raw);
        }}
      />
      {f.note && <div style={noteStyle}>{f.note}</div>}
    </div>
  );
}
