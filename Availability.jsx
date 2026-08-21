/* ══════════════════════════════════════════════════════════════════════════
   Availability.jsx — Gate City Hub · "Availability & Skills"

   STEP 1 OF THE SCHEDULING PLATFORM. This tile holds the three things a
   schedule has to be built FROM. It does not build one yet, and nothing on the
   board reads it yet, which is the point: the inputs land first and get checked
   by real leaders before anything starts scheduling ~106 people from them.

     · Availability — when somebody can work.        gcfcr-availability-v1
     · Skills       — what they are certified on.    gcfcr-skills-v1
     · School       — who is on a school calendar.   gcfcr-school-calendar-v1

   ⚠️ THE SHAPES AND THE PARSING LIVE IN availability.js, NOT HERE. That file is
   a near-leaf so the scheduling engine can import it without dragging React in,
   exactly the way FOHAutoAssign.js works today. Nothing in this file may
   re-implement a parser or a time conversion. Rule 8.

   ⚠️ EVERY TIME STORED IS MINUTES FROM MIDNIGHT. `<input type="time">` speaks
   "HH:MM", so minToInput/inputToMin convert at the input boundary and nowhere
   else. See the units warning at the top of availability.js — this app already
   carries one bug from the same idea being held in two units.

   ⚠️ IMPORT IS TIER 3. It writes across everybody at once. Reading your own is
   open to everyone; reading the team list is tier 2 and up.

   ⚠️ IMPORTING DOES NOT REPLACE THE MAP. A HotSchedules report covers whoever
   it covered on the day it was run, so `mergeImport` writes only the people it
   matched. Replacing wholesale would silently wipe everybody hired since.
   ══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, CalendarCheck, Check, ChevronLeft, ChevronRight, Clock,
  GraduationCap, Handshake, Plane, Save, Search, ThumbsDown, ThumbsUp,
  Undo2, Upload, X,
} from "lucide-react";
import { kvGet, kvGetResult, kvSet } from "./store.js";
import { loadHRTeam } from "./hrTeam.js";
import { isTerminatedId, hrRankOfTitle, OFF_FLOOR_MIN_TIER } from "./hrRoster.js";
import { CARD_3D, CARD_3D_SOFT, cardSurface, toolCard, toolRow, shade, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { storeCfg, tileAllowsId } from "./storeConfig.js";
import {
  AVAIL_KEY, SKILLS_KEY, SCHOOL_KEY, ALIASES_KEY, MIN_PER_DAY, DAY_LONG, shiftsForPerson,
  dayState, windowsFor, isAllDay, summarizeDay, summarizeRecord,
  fmtWindow, fmtMin, minToInput, inputToMin, isOffFloor, readStore, mergeImport, matchToRoster,
  parseAvailabilityCsv, parseSkillsText, parseSchoolMembers, sniffReport,
  readAliases, setAlias,
  PREF_FIELDS, readPrefs, prefProblems,
} from "./availability.js";
import {
  TIMEOFF_KEY, STATUS, readTimeOff, requestsFor, pendingRequests,
  requestProblem, overlapping, fmtRange, dayCount,
} from "./timeOff.js";
/* The conversation that belongs to one request (part 2 of messaging). It sits
   INSIDE a request row and nowhere else — there is no feed and no route that
   would list threads. */
import ShiftThread from "./ShiftThread.jsx";
import { weekKeyFor, scheduleKey, mondayOf, localIso } from "./scheduleEngine.js";
import {
  JOBCODES_KEY, DEFAULT_CODES, SIDES, SKILL_WORDS, readJobCodes, codeIndex, allCodes, sideOf, isLeaderCode, upsertCode, removeCode, unclassified, normCode, ZONES, ZONE_LABEL, zoneOf, codeGroups,
} from "./jobCodes.js";
import {
  MARKET_KEY, OFFER, readMarket, openOffers, hasClaimed, rankClaims,
  applySwap, fmtOffer, offerMatchesShift,
  readSwapPolicy, autoDecision, dropFlag,
} from "./shiftMarket.js";
/* ★ THE SETUP BOARD, NOT THE SCHEDULE. Approving a swap has always moved the
   shift on the schedule; the board leaders read at 6am is a different record and
   until now nothing touched it. Leaf module — see its header for why a rename on
   a board is never a string replace. */
import { applyBoardSwap, swapSummary } from "./boardSwap.js";
import { readSchool } from "./schoolCalendar.js";
import { MINOR_RULES_KEY, MINORS_KEY, readMinorRules, minorIdsFrom } from "./minorRules.js";
import { STORE_HOURS_KEY, readStoreHours } from "./storeHours.js";
import { TRAINING_KEY, readTraining } from "./trainingPriorities.js";
import TrainingPriorities from "./TrainingPriorities.jsx";
import StoreHours from "./StoreHours.jsx";
import SchoolDates from "./SchoolDates.jsx";
import MinorRules from "./MinorRules.jsx";

const INK = "#13293F", GREEN = "#1F6F4A", GRAY = "#6B7480", RED = "#B91C1C";
/* ★ THE TILE'S OWN COLOUR, so its cards carry it instead of the neutral navy a
   card with nothing to say gets. Matt, Aug 14 2026: "lineup-my shifts needs the
   look overhaul too" and "lineup-jobcodes and employees needs the new look
   upgrade".
   ⚠️ THE SAME HEX App.jsx GIVES BOTH LINEUP TILES. It is duplicated rather than
   imported because App.jsx is a multi-session file and importing a component
   into a component is how the import cycle this repo keeps hitting comes back.
   If the tile colour ever moves, it moves in both places. */
const TILE = "#0E7490", TILE_DEEP = shade(TILE);
const HR_STATUS_KEY = "gcfcr-hr-status";
/* The id → title map HR Console writes when a title changes. The roster row is
   not edited, so this is where a current title lives for anybody promoted. */
const HR_ROLES_KEY = "gcfcr-hr-roles";

/* ── module-level pure helpers (rule 7) ──────────────────────────────────
   Anything a useMemo body could reach lives out here, where a temporal dead
   zone cannot exist. */

/* WHICH DAYS THIS STORE'S BOARD HAS. Read from the store's own station config
   rather than written out, so a store that opens a different set of days gets
   its own days and not ours (rule 18). Falls back to Mon-Sat, which is what
   every Chick-fil-A runs, if the config is unreadable. */
function boardDays() {
  const foh = storeCfg("stations.FOH");
  const keys = foh && typeof foh === "object" ? Object.keys(foh) : [];
  return keys.length ? keys : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
}

/* ★★ WHEN A DROPPED SHIFT ACTUALLY STARTS, as a timestamp, so the auto-approval
   notice rule has something real to measure against.

   ⚠️⚠️ BUILT FROM LOCAL DATE PARTS, NEVER `new Date(iso)`. `new Date("2026-08-20")`
   is parsed as UTC midnight, which here is 8pm the evening BEFORE — so a shift
   would look four hours earlier than it is, and a swap needing twelve hours of
   notice would clear the rule with eight. Same trap scheduleEngine's `mondayOf`
   avoids by only ever using local getters.
   ⚠️ NULL WHEN IT CANNOT BE READ, and autoDecision treats null as "a leader
   looks". An unreadable date must never mean unlimited notice. */
/* The Monday after this one, as a local ISO date. ⚠️ LOCAL PARTS, never
   toISOString — after 8pm here that returns tomorrow in UTC and the key would
   slide a whole week every evening. Same reason scheduleEngine's `mondayOf`
   only ever uses local getters. */
function nextMondayIso() {
  const m = mondayOf(new Date());
  m.setDate(m.getDate() + 7);
  return localIso(m);
}

function shiftStartMs(offer) {
  const m = String((offer && offer.iso) || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const start = Number(offer && offer.start);
  if (!m || !Number.isFinite(start)) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime() + start * 60000;
}

/* ★ HOW GOOD SOMEBODY IS AT ONE JOB, as a colour that deepens.
   ⚠️ "not trained" IS GREY, NOT RED. It is the normal state for most jobs and
   most people; painting it as a problem would make every roster look like a
   crisis and would train leaders to ignore the colour. */
const SKILL_TINT = Object.freeze({
  "": "#94A3B8",
  beginner: "#38BDF8",
  intermediate: "#0E7490",
  advanced: "#1F6F4A",
});

const DEFAULT_WINDOW = { start: 6 * 60, end: 22 * 60 };

/* A day's three-way answer → the windows array that means it. */
function windowsForChoice(choice, prev) {
  if (choice === "off") return [];
  if (choice === "any") return [{ start: 0, end: MIN_PER_DAY }];
  const kept = Array.isArray(prev) && prev.length && !isAllDay(prev) ? prev[0] : DEFAULT_WINDOW;
  return [{ start: kept.start, end: kept.end }];
}
function choiceOf(rec, day) {
  const st = dayState(rec, day);
  if (st === "unset") return "";
  if (st === "off") return "off";
  return isAllDay(windowsFor(rec, day)) ? "any" : "hours";
}

const stamp = (by, source) => ({ at: new Date().toISOString(), by: by || "unknown", source });

function shortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* Today as an ISO date, local. ⚠️ NOT `toISOString().slice(0,10)`, which is UTC
   and reads as tomorrow after 8pm here — a request for tomorrow would then be
   refused as "already passed", in the evening only. */
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const STATUS_STYLE = {
  [STATUS.APPROVED]: { bg: "bg-emerald-50", fg: "text-emerald-700", label: "Approved" },
  [STATUS.DENIED]: { bg: "bg-red-50", fg: "text-red-700", label: "Not approved" },
  [STATUS.PENDING]: { bg: "bg-amber-50", fg: "text-amber-800", label: "Waiting" },
};

const btn = (on, tone) =>
  "px-3 py-1.5 text-sm transition-colors " +
  (on ? `text-white ${tone}` : "bg-white text-slate-600 hover:bg-slate-50");

/* ── the two modes ───────────────────────────────────────────────────────
   ⚠️⚠️ ONE COMPONENT, TWO TILES. Matt, Aug 13 2026: "for the 2 tools. one
   should be for availabilty and shift swaps only. the other for everything
   else."

   So the tabs are split down the middle. `team` is the tile the whole store
   will eventually open: when can I work, and can somebody take my shift.
   `leader` is everything a leader sets up behind that, and it is mounted
   inside the Schedule console beside the builder.

   ⚠️ WHY A PROP AND NOT TWO FILES. Every tab below shares one load, one roster,
   one `avail` map and one save path. Splitting the file would fork all of that
   and rule 16 is explicit: never trade a working surface for a half-finished
   one. A prop that filters a tab list cannot break a panel that already works,
   and it is one line to undo.

   ⚠️ THE MODE IS NOT A PERMISSION. Tier still decides everything it decided
   before — a team member opening the team tile sees their own record and no
   import box, exactly as they did. Do not start gating on `mode`. */
const TABS = {
  team: [["avail", "Availability"], ["shifts", "Shifts"]],
  leader: [["skills", "Skills"], ["timeoff", "Time off"], ["school", "School"], ["minors", "Minors"], ["hours", "Hours"], ["training", "Training"]],
};

/* ⚠️ THE IMPORT CARD IS ON EVERY TAB EXCEPT THE SHIFT BOARD, and that is the
   fix for a real loss. It used to be limited to the three tabs whose parser it
   ran, which meant a leader doing setup in the Schedule console could not reach
   the AVAILABILITY import at all — that tab lives on the other tile now. The
   card is a single collapsed button until somebody taps it, so its cost on a
   tab that rarely needs it is one line. `sniffReport` decides what the paste
   actually is, so no tab can run the wrong parser. */
/* ⚠️ THE HOURS TAB HAS NOTHING TO IMPORT. HotSchedules does not export a
   holiday, and offering a paste box there invites somebody to drop the
   availability report into the wrong screen. */
/* ⚠️ THE TRAINING TAB HAS ITS OWN PASTE BOX and a different parser. Offering
   the shared import card beside it invites somebody to drop the priority list
   into `sniffReport`, which has never heard of it and would report it as an
   unrecognised availability report. */
const NO_IMPORT_TABS = new Set(["shifts", "hours", "training"]);

/* What each recognised report is called on screen. */
const KIND_LABEL = {
  avail: "the availability report",
  skills: "the job and skill level report",
  school: "the school calendar group",
};

/* ══════════════════════════════════════════════════════════════════════════
   THE BREAKDOWN, SPLIT BY TIER — Matt, Aug 14 2026: "For the lineup I needs a
   collapsible breakdown and each tier separated."

   ⚠️ THE PROBLEM IT SOLVES IS A HUNDRED AND SIX NAMES IN ONE SCROLL. The list
   was flat and alphabetical, so finding the four leaders in it meant reading
   past ninety team members, and "who still has no availability" — the one thing
   that actually blocks a week from being built — was invisible unless you
   scrolled the whole way.

   ⚠️⚠️ DO NOT CALL TIER 3 "DIRECTORS". App.jsx's comment says "3 = Director"
   and that comment is misleading: a person titled **Director** is rank 5, which
   is tier TWO. Tier 3 starts at rank 6 — Leadership Development Director,
   Executive Director, Human Resources, Accounts Payable, Owner. A group headed
   "Directors" that does not contain the Directors is worse than no grouping at
   all, and it was written that way here first. Run `bandOf` before
   trusting any sentence about which tier a title lands in; `tierGroups.test.mjs`
   asserts every rung.

   ⚠️ THE BLURBS NAME THE ACTUAL TITLES for the same reason. Nobody should have
   to guess which bucket their own job is in.

   ⚠️ MATT, Aug 14 2026: "The only non ops hrs are Hannah, myself, Bri and
   Cindy." Those four hold exactly the rank-6-and-up titles, which is why the
   top group sits FIRST and CLOSED: its availability matters least to a
   schedule, so it should cost the least screen.
   ⚠️ BUT THIS IS NOT THE NON-OPS LIST AND MUST NOT BE LABELLED AS ONE. Who is
   non-ops is stored data, edited in the daypart console under
   `gcfcr-daypart-nonops-v1`. The two happen to be the same four people at this
   store today. Printing "non-ops" off a job title would be asserting a stored
   fact from a guess, and it would drift the first time somebody edits one.
   ══════════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════════
   ★★ RANK BANDS, NOT TIERS — and each one carries its own colour.

   Matt, Aug 14 2026: "in lineup for the whole team i want leaders a seperate
   color, ads, ond and directors one. group them together."

   ⚠️⚠️ THIS SPLITS WHAT USED TO BE ONE GROUP. Tier 2 held Director, Assistant
   Director, Team Leader and Senior Trainer together, and those are two
   different jobs: the first two run the building, the second two run a shift.
   A leader looking for "who is directing today" was reading a list of
   twenty-three names to find two.

   ⚠️ BY RANK, NOT BY TIER, because the tier boundary cannot express this — 3, 4
   and 5 are all tier 2. The ranks come from hrRoster's ladder, which is the
   same one HR Console promotes on, so a promotion moves somebody between these
   bands with nothing here to update.

   ⚠️ `min` IS INCLUSIVE AND THE BANDS MUST NOT OVERLAP OR GAP. Read downward:
   the first band whose `min` a rank clears wins, so the list is ordered high to
   low and a rank can only ever land in one. `tierGroups.test.mjs` grades every
   rung against this.
   ══════════════════════════════════════════════════════════════════════════ */
const RANK_BANDS = [
  { min: 6, key: "senior", label: "Senior leadership", tone: "#7C3AED",
    blurb: "Owner, Executive Director, HR, Accounts Payable, LDD." },
  { min: 4, key: "directors", label: "Directors", tone: "#B45309",
    blurb: "Director and Assistant Director. They run the building." },
  { min: 3, key: "leaders", label: "Leaders", tone: "#0E7490",
    blurb: "Team Leader and Senior Trainer. They run the shift." },
  { min: 0, key: "team", label: "Team", tone: "#0F766E",
    blurb: "Team Member, Trainer, Junior Trainer. Most of the week." },
];

/* The band a title belongs to. ⚠️ MODULE LEVEL AND PURE (rule 7), and it reads
   the ladder rather than a second list of titles — a title added to HR Console
   lands in a band here with nobody editing this file. */
const bandOf = (role) => {
  const r = hrRankOfTitle(role);
  return RANK_BANDS.find((b) => r >= b.min) || RANK_BANDS[RANK_BANDS.length - 1];
};

/* ── the tile ────────────────────────────────────────────────────────── */

export default function Availability({ tier, user, mode }) {
  const tierNum = Number(tier) || 0;
  const canSeeTeam = tierNum >= 2;
  const canEditAll = tierNum >= 3;
  const myName = (user && (user.name || user.Name)) || "";
  const view = mode === "leader" ? "leader" : "team";

  const [tab, setTab] = useState(() => TABS[mode === "leader" ? "leader" : "team"][0][0]);
  const [team, setTeam] = useState([]);
  const [avail, setAvail] = useState({ v: 1, people: {} });
  const [skills, setSkills] = useState({ v: 1, people: {} });
  const [school, setSchool] = useState({ v: 1, title: "", ids: [] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState({ days: {}, note: "" });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [leftCount, setLeftCount] = useState(0);
  const [market, setMarket] = useState({ v: 1, offers: [] });
  /* What the last approval did to the setup board, in one line. ⚠️ SEPARATE
     FROM `err`. A board that could not be rewritten is not a failed swap — the
     swap happened — and colouring it red would send somebody looking for a
     problem with the schedule. */
  const [note, setNote] = useState("");
  /* Which section the bulk skill setter is pointed at, and what it will set.
     ⚠️ ONE PAIR FOR THE WHOLE LIST, not per person. Somebody rating the
     kitchen rates several people the same way in a row, so the picker
     remembering where it was is the difference between two taps and four. */
  const [bulkGroup, setBulkGroup] = useState("all");
  const [bulkWord, setBulkWord] = useState("advanced");
  const [weekSched, setWeekSched] = useState(null);
  /* ⚠️⚠️ NEXT WEEK TOO, AND THAT IS THE WHOLE POINT OF THIS SCREEN FOR A TEAM
     MEMBER. A schedule is built AHEAD — the week of the 17th is built on the
     14th — so a screen that only ever read `weekKeyFor(new Date())` showed
     every team member "You are not on the schedule this week" on the one day
     they most wanted to look. Two keys, one read. */
  const [nextSched, setNextSched] = useState(null);
  const [mktBusy, setMktBusy] = useState(false);
  const [timeOff, setTimeOff] = useState({ v: 1, requests: [] });
  const [toFrom, setToFrom] = useState("");
  const [toTo, setToTo] = useState("");
  const [toReason, setToReason] = useState("");
  const [toWho, setToWho] = useState("");
  const [toBusy, setToBusy] = useState(false);
  const [toNote, setToNote] = useState("");
  const [paste, setPaste] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [report, setReport] = useState(null);
  /* Export spelling → roster id, for the names HotSchedules writes differently
     from the roster. See the block above ALIASES_KEY in availability.js. */
  const [aliases, setAliases] = useState({ v: 1, map: {} });
  const [linkPick, setLinkPick] = useState({});   // unmatched name → chosen roster id
  const [linkBusy, setLinkBusy] = useState("");
  const [codes, setCodes] = useState({ v: 1, codes: [] });
  const [newCode, setNewCode] = useState("");
  const [newSide, setNewSide] = useState("FOH");
  const [newLeader, setNewLeader] = useState(false);
  const [skillWho, setSkillWho] = useState(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [minorRules, setMinorRules] = useState({ v: 1, bands: [], people: {} });
  /* ⚠️ THE MINORS LIST IS DAILY SETUP'S AND THIS SCREEN ONLY READS IT. There is
     one list of who is a minor and it lives on the board, where it already
     drives breaks. A second one here would drift, and the drifting copy would
     be the one nobody looks at. Rule 8. */
  const [minorNames, setMinorNames] = useState([]);
  const [rulesBusy, setRulesBusy] = useState(false);
  /* The days the store does not keep its normal hours. Empty means every day
     is ordinary, which is what every store has until somebody types a date. */
  const [storeHours, setStoreHours] = useState(() => readStoreHours(null));
  const [training, setTraining] = useState(() => readTraining(null));

  const days = useMemo(boardDays, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [people, a, s, sc, to, statusRes, jc, roleMap] = await Promise.all([
          loadHRTeam(), kvGet(AVAIL_KEY), kvGet(SKILLS_KEY), kvGet(SCHOOL_KEY),
          kvGet(TIMEOFF_KEY), kvGetResult(HR_STATUS_KEY), kvGet(JOBCODES_KEY),
          kvGet(HR_ROLES_KEY),
        ]);
        /* This week's schedule, the drop board, and the minor setup. Read after
           the first batch so a missing schedule cannot hold up the rest of the
           screen. */
        const [mk, sched, sched2, mr, mn, al, sh, tp] = await Promise.all([
          kvGet(MARKET_KEY), kvGet(weekKeyFor(new Date())), kvGet(scheduleKey(nextMondayIso())),
          kvGet(MINOR_RULES_KEY), kvGet(MINORS_KEY), kvGet(ALIASES_KEY),
          kvGet(STORE_HOURS_KEY), kvGet(TRAINING_KEY),
        ]);
        if (!alive) return;

        /* ⚠️ PEOPLE WHO HAVE LEFT COME OFF THIS SCREEN, and HR Console does the
           same thing with the same test. Setting availability for somebody who
           no longer works here is not a task anybody will ever finish, and while
           they were counted the "N people have no availability yet" number was
           wrong in the direction that makes it easy to ignore.
           ⚠️ A FAILED READ SHOWS EVERYBODY rather than hiding people at random.
           kvGet answers null for both "no terminations" and "the read failed";
           kvGetResult tells them apart, and only a successful read filters. */
        /* ⚠️ THE TITLE OVERRIDE IS MERGED, for the same reason ScheduleBuilder
           merges it: `loadHRTeam` returns the roster row's own role, and HR
           Console changes a title by writing gcfcr-hr-roles instead. This screen
           groups people BY TITLE and now decides who is on the floor by title
           too, so an unmerged one puts somebody in the wrong group and asks the
           wrong person for availability. */
        const overrides = roleMap && typeof roleMap === "object" && !Array.isArray(roleMap) ? roleMap : {};
        const list = (Array.isArray(people) ? people : []).map((p) => {
          if (!p || p.id == null) return p;
          const v = String(overrides[String(p.id)] || "").trim();
          return v && v !== p.role ? { ...p, role: v } : p;
        });
        const statusMap = statusRes.ok ? statusRes.value : null;
        const active = statusRes.ok
          ? list.filter((p) => p && !isTerminatedId(statusMap, p.id))
          : list;
        setLeftCount(list.length - active.length);
        setTeam(active);
        setAvail(readStore(a));
        setSkills(readStore(s));
        setTimeOff(readTimeOff(to));
        setMarket(readMarket(mk));
        /* ⚠️ AN EMPTY LIST IS A WORKING STATE, not a reason to seed silently.
           With nothing typed the engine falls back to the regex exactly as it
           did before this existed; the screen offers the seed as a BUTTON so a
           store chooses its own list rather than inheriting one. */
        setCodes(readJobCodes(jc));
        setWeekSched(sched && sched.days ? sched : null);
        setNextSched(sched2 && sched2.days ? sched2 : null);
        /* ⚠️ GUARDED ON THE WAY IN. This record predates the term dates and the
           tapped days, so every one of those fields has to survive being
           absent. readSchool answers "no term set", which is a working state
           the whole calendar is built around. Rule 1. */
        setSchool(readSchool(sc));
        setMinorRules(readMinorRules(mr));
        setMinorNames(Array.isArray(mn) ? mn : []);
        setAliases(readAliases(al));
        setStoreHours(readStoreHours(sh));
        setTraining(readTraining(tp));
      } catch {
        if (alive) setErr("Could not load the team. Close the tool and open it again.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  /* Everyone below tier 2 only ever edits themselves, so land them on their own
     record. An unmatched sign-in gets a plain message rather than the team. */
  useEffect(() => {
    if (canSeeTeam || !team.length || !myName) return;
    const me = team.find((p) => p && p.name && p.name.toLowerCase() === myName.toLowerCase());
    setSelectedId(me ? String(me.id) : null);
  }, [canSeeTeam, team, myName]);

  /* ⚠️ KEYED ON selectedId ONLY. An earlier version also depended on the whole
     stored map, so every save re-ran this, wiped `dirty` and blanked the
     "Saved at" line the save had just set — the confirmation could never
     appear. `applyRecord` refreshes the draft on save instead. */
  useEffect(() => {
    if (selectedId == null) return;
    const rec = avail.people[selectedId] || { days: {}, note: "" };
    const who = team.find((p) => String(p.id) === String(selectedId));
    setDraft({
      days: { ...(rec.days || {}) }, note: rec.note || "",
      /* ⚠️⚠️ SEEDED FROM THE EFFECTIVE ANSWER, NOT FROM THE RAW FIELD, AND THAT
         IS A CORRECTNESS FIX RATHER THAN A COSMETIC ONE.

         The save below writes `!!draft.noSchedule`, so it always stores a real
         boolean. Seeding this from `rec.noSchedule` alone would show the box
         UNTICKED for a senior leader whose record has never carried the field —
         and then the first time anybody opened their record and pressed Save
         for any reason at all, it would write `noSchedule: false` and put them
         back on the floor. Silently, permanently, and looking like the leader
         had asked for it.
         ⇒ The box shows what is actually true. Ticked means off the floor,
         however that was decided; unticking it is a real, explicit "yes,
         schedule this person" that then beats the title for ever. */
      noSchedule: isOffFloor(rec, who && who.role), updatedAt: rec.updatedAt, updatedBy: rec.updatedBy,
      /* What they asked for, edited on the same screen and saved by the same
         button. One record, one save — a second Save for six numbers is a
         second thing to forget to press. */
      prefs: readPrefs(rec),
    });
    setDirty(false);
    setSavedAt("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const selected = useMemo(
    () => team.find((p) => String(p.id) === String(selectedId)) || null,
    [team, selectedId],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return team
      .filter((p) => p && p.name && (!q || p.name.toLowerCase().includes(q)))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [team, query]);

  const searching = query.trim().length > 0;

  /* ══════════════════════════════════════════════════════════════════════════
     ★★ THE PEOPLE THIS TILE SCHEDULES. Matt, Aug 14 2026: "Nick, Hannah, Bri,
     Matt and Kyleeka dont need to be in the employees for scheduling."

     Senior leadership is not rostered onto a station, so they do not belong in
     the lists this tile keeps ABOUT rostering: who is certified on what, whose
     availability is missing, who is on the school calendar. Measured before it
     was built — across every Daily Setup board this store has saved, none of
     them has been placed on a station once.

     ⚠️ `rows` IS STILL THERE AND STILL USED, deliberately. The time-off picker
     runs off it, because filing time off for the Executive Director is a real
     thing that has nothing to do with whether she stands on a register. This
     narrows the SCHEDULING lists, not the tile.

     ⚠️ SEARCH BRINGS THEM BACK, which is what stops this being a gate nobody
     can open. Typing a name reaches that person's record, including the tick
     box that puts them back on the floor for good. A hidden row with no path to
     it is the uneditable-and-wrong state design rule 18 is about.

     ⚠️ IT IS `isOffFloor`, SO A TICK STILL WINS. Somebody ticked back on shows
     up here normally, whatever their title. */
  const floorRows = useMemo(
    () => (searching ? rows : rows.filter((p) => !isOffFloor(avail.people[String(p.id)], p.role))),
    [rows, avail, searching],
  );
  /* How many this tile is holding back, for the tabs that have to SAY so.
     ⚠️ COUNTED OFF THE SAME TWO LISTS the screen renders, never re-derived from
     the roster. A count that disagreed with the list under it would be worse
     than no count (design rule 8). */
  const hiddenFromFloor = rows.length - floorRows.length;

  const notSet = useMemo(
    /* ⚠️ PEOPLE WHO ARE NEVER SCHEDULED DO NOT COUNT AS MISSING. Their record
       will never be "filled in", so counting them makes a number that can
       never reach zero and therefore stops being read.
       ⚠️ `isOffFloor`, NOT `isNoSchedule`. Senior leadership is off the floor
       by default now, so counting them here would leave this number stuck six
       above zero for ever — which is exactly the "stops being read" failure the
       line above is about. */
    () => team.filter((p) => p && p.name
      && !isOffFloor(avail.people[String(p.id)], p.role)
      && !avail.people[String(p.id)]).length,
    [team, avail],
  );

  /* ⚠️ BUILT FROM `rows`, NOT FROM `team`, so the search still works. Grouping a
     filtered list keeps the filter; grouping the raw roster would have made the
     search box silently do nothing on this tab.
     ⚠️ AND EVERY GROUP IS RETURNED, INCLUDING EMPTY ONES. A group that vanishes
     when it has nobody in it looks like a rendering bug, and worse, it hides
     that the roster has no Directors on it at all — which at a NEW store is a
     real finding, not an empty list. The header says the count either way. */
  const tierGroups = useMemo(() => RANK_BANDS.map((band) => {
    const people = floorRows.filter((p) => bandOf(p.role).key === band.key);
    return {
      tier: band.min, key: band.key, label: band.label, blurb: band.blurb, tone: band.tone, people,
      /* Same test `notSet` uses above, so the group headers and the amber
         banner above the list can never disagree about who is missing
         (design rule 8). */
      missing: people.filter((p) => !isOffFloor(avail.people[String(p.id)], p.role)
        && !avail.people[String(p.id)]).length,
    };
  /* ⚠️⚠️ AN EMPTY GROUP STILL SHOWS, EXCEPT THE ONE THIS TILE NO LONGER
     SCHEDULES. The note above is still right: a group that vanishes when it has
     nobody in it looks like a rendering bug, and it hides a roster with no
     Directors on it, which at a new store is a real finding.
     ⇒ So the rule is narrow. Every ordinary group is kept whether or not it has
     anybody. The senior leadership group is dropped only when `floorRows` has
     left it empty, which is exactly the case where it would be a heading over
     nothing. Searching refills it and it comes straight back. */
  /* ⚠️ `min >= 6` IS THE SENIOR BAND, the same boundary OFF_FLOOR_MIN_TIER
     draws in tiers. Compared against the band's own floor rather than a tier
     lookup, so splitting tier 2 into two bands did not quietly change which
     group this hides. */
  }).filter((g) => g.people.length || g.tier < 6), [floorRows, avail]);

  /* ⚠️ CLOSED IS THE DEFAULT AND SEARCH OVERRIDES IT. A hundred and six names is
     the problem; opening all three groups on mount would just rebuild it. But a
     search that finds somebody inside a closed group and shows nothing is worse
     than the long list ever was, so a live query forces every group open. */
  const [openTiers, setOpenTiers] = useState(() => new Set());
  /* ⚠️ CLOSED ON MOUNT, and it is a plain boolean rather than a stored setting.
     A leader opens this tab to rate somebody, not to read 46 job codes; the
     ones who do need the list tap once. Nothing is written for it, so there is
     no per-person state to migrate and no key to keep in step. */
  const [codesOpen, setCodesOpen] = useState(false);

  const schoolIds = useMemo(() => new Set((school.ids || []).map(String)), [school]);

  /* Who this request is FOR. A leader can file one on somebody's behalf (people
     ask in person all the time); everybody else can only file their own.
     ⚠️ RESOLVED TO A ROSTER ID, never left as a name. */
  const myId = useMemo(() => {
    const me = team.find((p) => p && p.name && p.name.toLowerCase() === myName.toLowerCase());
    return me ? String(me.id) : "";
  }, [team, myName]);
  const forId = canEditAll ? (toWho || myId) : myId;

  const myRequests = useMemo(() => requestsFor(timeOff, forId), [timeOff, forId]);
  const pending = useMemo(() => pendingRequests(timeOff), [timeOff]);

  /* ⚠️ ANSWERING A REQUEST IS ITS OWN PERMISSION, not "can open this tile".
     Matt, Aug 13 2026: only he and Hannah, for shift pick ups AND for time off.
     One list covers both — see the note in ownerSeed.js. Everyone else can see
     every request and every check and cannot answer one. */
  const canApprove = useMemo(() => tileAllowsId("requestApprove", myId), [myId]);

  /* ⚠️ EVERY SHIFT CARRIES THE WEEK IT BELONGS TO. Two weeks are on this
     screen now, so "which week" can no longer be read off one piece of state.
     Dropping a shift, approving a swap and writing the schedule back all key
     off `weekOf`, and getting it from the shift itself is what stops a
     next-week swap being written into this week's record. */
  const myShifts = useMemo(() => shiftsForPerson([weekSched, nextSched], myId), [weekSched, nextSched, myId]);

  const offers = useMemo(() => openOffers(market), [market]);
  const mine = useMemo(
    () => offers.filter((o) => String(o.fromPersonId) === String(myId)),
    [offers, myId],
  );
  const theirs = useMemo(
    () => offers.filter((o) => String(o.fromPersonId) !== String(myId)),
    [offers, myId],
  );
  const checkCtx = useMemo(
    () => ({ avail, skills, week: weekSched, minors: new Set(), timeOff, terminated: new Set() }),
    [avail, skills, weekSched, timeOff],
  );

  /* The store's own swap rules. ⚠️ READ THROUGH `storeCfg` AT USE TIME, never
     captured at module load — a saved setting arrives after this file imports.
     ⚠️ `readSwapPolicy` is the guard: `autoApprove` has to be the literal true,
     so a store that has never opened the settings screen is OFF. */
  /* ⛔⛔ READ AT USE TIME, NEVER MEMOISED. This was a `useMemo(…, [])` — an
     EMPTY dependency list — so it read the store's swap rules once at the
     tile's first render and held that answer for the whole mount, while its
     own comment claimed it read at use time.

     🐛 TWO WAYS THAT BITES, and one of them is the dangerous direction. A
     store's saved settings arrive AFTER this file imports, so a tile that
     mounted first froze the shipped default. And turning auto approval OFF in
     Store Settings did not reach a leader with the screen already open, so
     SWAPS KEPT GOING THROUGH ON THEIR OWN until they navigated away.

     ⚠️ THE MEMO BOUGHT NOTHING. It is three object lookups and nothing
     downstream keys on the result. Found by a Fable audit at the origin store
     on Aug 19 2026 and fixed there; this store still had it. */
  const swapPolicy = readSwapPolicy({
    on: storeCfg("swaps.autoApprove"),
    minNoticeHours: storeCfg("swaps.minNoticeHours"),
    maxDropsPerWeek: storeCfg("swaps.maxDropsPerWeek"),
  });

  const codeIdx = useMemo(() => codeIndex(codes), [codes]);
  const strayCodes = useMemo(() => unclassified(skills, codes), [skills, codes]);

  /* What the pasted text actually is. Reading it is free and changes nothing,
     so it happens on every keystroke and the leader sees the answer BEFORE any
     save. Same shape as the TeamDetails importer in HR Console. */
  const sniffed = useMemo(() => sniffReport(paste), [paste]);

  /* The roster in name order, for the "who is this?" picker on an unmatched
     import row. Built here rather than in the render so a hundred-odd people
     are not re-sorted on every keystroke in the paste box. */
  /* ★ EVERY POSITION ON THE BOARD IS A JOB ROLE TOO. Matt, Aug 13 2026: "i
     want all positions as job roles as well."
     ⚠️ ADDS, NEVER REPLACES. The 15 generic codes are what HotSchedules
     exports and what 313 existing ratings are keyed to; the store's stations
     land alongside them and a typed row always wins a collision. A store with
     no station matrix sees exactly what it typed, which is what makes this
     safe to ship to a clone on day one. */
  const codesAll = useMemo(
    () => allCodes(codes, { FOH: storeCfg("stations.FOH") || {}, BOH: storeCfg("stations.BOH") || {} }),
    [codes],
  );

  /* The sections the bulk skill setter offers, built from the codes themselves
     so a store that adds one gets it in the right group with nothing to type.
     ⚠️ BELOW `codesAll`, not above it. A useMemo dep array runs during render,
     so naming a const declared further down is a temporal dead zone crash on
     first paint — tdzcheck caught exactly that here. */
  const skillGroups = useMemo(
    () => codeGroups(codesAll.codes, codeIdx),
    [codesAll, codeIdx],
  );

  const rosterSorted = useMemo(
    () => team.filter((p) => p && p.id != null && p.name)
      .slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [team],
  );

  /* The board's minors list is NAMES; everything here is keyed by roster id.
     ⚠️ THE JOIN IS minorIdsFrom AND IS NOT REPEATED HERE. ScheduleBuilder does
     the same join for the same list, and two copies of "which Sam did they
     mean" is exactly the drift rule 8 exists to stop. */
  const minorIds = useMemo(() => minorIdsFrom(minorNames, team), [minorNames, team]);

  const setDay = useCallback((day, choice) => {
    setDraft((prev) => ({
      ...prev,
      days: { ...prev.days, [day]: windowsForChoice(choice, prev.days[day]) },
    }));
    setDirty(true);
  }, []);

  const setEdge = useCallback((day, edge, value) => {
    /* ⚠️ VALUE CAPTURED BEFORE THE UPDATER RUNS. Reading e.target inside the
       arrow passed to setDraft is check 5, and it reads null by the time React
       runs the updater. */
    const min = inputToMin(value);
    if (min == null) return;
    setDraft((prev) => {
      const cur = Array.isArray(prev.days[day]) && prev.days[day].length ? prev.days[day][0] : DEFAULT_WINDOW;
      const next = edge === "start" ? { start: min, end: cur.end } : { start: cur.start, end: min };
      return { ...prev, days: { ...prev.days, [day]: [next] } };
    });
    setDirty(true);
  }, []);

  const badWindow = useMemo(
    () => days.filter((d) => {
      const w = draft.days[d];
      return Array.isArray(w) && w.length && w[0].end <= w[0].start;
    }),
    [days, draft],
  );

  async function saveOne() {
    if (selectedId == null || saving) return;
    if (badWindow.length) {
      /* Rule 1: fail loudly without saving rather than store something wrong. */
      setErr(`${DAY_LONG[badWindow[0]] || badWindow[0]} ends before it starts. Fix it and save again.`);
      return;
    }
    /* ⚠️ A MINIMUM ABOVE ITS MAXIMUM CAN NEVER BE MET, so stored quietly it
       would make every week that person appears in warn for ever with nothing
       anybody could do about it. Same rule, same place, one line up. */
    const prefBad = prefProblems(draft.prefs);
    if (prefBad.length) { setErr(prefBad[0]); return; }
    setSaving(true);
    setErr("");
    try {
      /* Re-read first: HR Console and this tile are both open on shared iPads,
         and a blind write would drop whatever landed in between. */
      const fresh = readStore(await kvGet(AVAIL_KEY));
      const st = stamp(myName, "typed");
      /* 🐛 THIS REBUILT THE RECORD FROM SCRATCH AND WOULD HAVE WIPED `prefs`.
         Anything added to a person's row from now on has to be listed here or
         the next availability save silently deletes it — the exact shape of
         rule 1, and it was already true the moment preferences existed. */
      const rec = {
        days: draft.days, note: draft.note, noSchedule: !!draft.noSchedule,
        prefs: readPrefs(draft),
        updatedAt: st.at, updatedBy: st.by, source: st.source,
      };
      const next = { v: 1, people: { ...fresh.people, [selectedId]: rec } };
      const ok = await kvSet(AVAIL_KEY, next);
      if (ok === false) throw new Error("refused");
      setAvail(next);
      setDraft((d) => ({ ...d, updatedAt: st.at, updatedBy: st.by }));
      setDirty(false);
      setSavedAt(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    } catch {
      setErr("That did not save. Check the connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  /* ⚠️ RE-READ, MERGE, WRITE. Two leaders answering requests on two iPads is
     the normal case, not the edge case, and a blind write would drop whichever
     decision landed second with nothing on either screen to say so. */
  async function writeTimeOff(mutate) {
    const fresh = readTimeOff(await kvGet(TIMEOFF_KEY));
    const next = { v: 1, requests: mutate(fresh.requests.slice()) };
    const ok = await kvSet(TIMEOFF_KEY, next);
    if (ok === false) throw new Error("refused");
    setTimeOff(next);
  }

  async function askOff() {
    if (toBusy) return;
    setErr("");
    setToNote("");
    const req = { memberId: forId, from: toFrom, to: toTo || toFrom };
    const problem = requestProblem(req, todayIso());
    if (problem) { setErr(problem); return; }
    const clash = overlapping(timeOff, forId, req.from, req.to);
    if (clash.length) {
      /* Rule 1: fail loudly rather than store a second overlapping record that
         nobody can tell apart from the first. */
      setErr(`That overlaps a request already in for ${fmtRange(clash[0])}.`);
      return;
    }
    setToBusy(true);
    try {
      const who = team.find((p) => String(p.id) === String(forId));
      await writeTimeOff((list) => {
        list.push({
          id: `to_${Date.now()}_${list.length}`,
          memberId: String(forId),
          name: who ? who.name : myName,
          from: req.from, to: req.to,
          reason: toReason.trim(),
          status: STATUS.PENDING,
          askedAt: new Date().toISOString(),
          askedBy: myName || "unknown",
        });
        return list;
      });
      setToFrom(""); setToTo(""); setToReason("");
      setToNote("Sent. A director has to approve it before it changes the schedule.");
    } catch {
      setErr("That did not save. Try again.");
    } finally {
      setToBusy(false);
    }
  }

  async function decide(id, status) {
    if (toBusy) return;
    setToBusy(true);
    setErr("");
    try {
      await writeTimeOff((list) => list.map((r) => (r && r.id === id
        ? { ...r, status, decidedAt: new Date().toISOString(), decidedBy: myName || "unknown" }
        : r)));
    } catch {
      setErr("That did not save. Try again.");
    } finally {
      setToBusy(false);
    }
  }

  async function writeCodes(next) {
    if (codeBusy) return;
    setCodeBusy(true); setErr("");
    try {
      const ok = await kvSet(JOBCODES_KEY, next);
      if (ok === false) throw new Error("refused");
      setCodes(next);
    } catch { setErr("That did not save. Try again."); }
    finally { setCodeBusy(false); }
  }

  /* ⚠️ RE-READ, MERGE, WRITE — two directors tagging people at once is normal. */
  async function setPersonSkill(personId, code, word) {
    if (codeBusy) return;
    setCodeBusy(true); setErr("");
    try {
      const key = normCode(code);
      if (!key) return;
      const fresh = readStore(await kvGet(SKILLS_KEY));
      const rec = { ...(fresh.people[String(personId)] || {}) };
      const jobs = { ...(rec.jobs || {}) };
      if (word) jobs[key] = word; else delete jobs[key];
      const next = {
        v: 1,
        people: { ...fresh.people, [String(personId)]: { ...rec, jobs, updatedAt: new Date().toISOString(), updatedBy: myName } },
      };
      const ok = await kvSet(SKILLS_KEY, next);
      if (ok === false) throw new Error("refused");
      setSkills(next);
    } catch { setErr("That did not save. Try again."); }
    finally { setCodeBusy(false); }
  }

  /* ══════════════════════════════════════════════════════════════════════
     ★★ ONE SKILL ACROSS A WHOLE SECTION, IN ONE WRITE.

     Matt, Aug 14 2026: "for job skill i want an option to apply the same skill
     to all jobs", "by section", "so example is brandon should be advanced for
     all boh jobs. hes the director."

     ⚠️ ONE READ AND ONE WRITE, not a loop over setPersonSkill. Nine saves in a
     row against a live key is nine chances for one to be refused halfway, and
     the record would then be half advanced and half whatever it was, with the
     screen showing the version that never landed.
     ⚠️ AN EMPTY WORD CLEARS THE WHOLE GROUP, which is the same shape the single
     picker already has ("not trained"). It is destructive, so the caller
     confirms first.
     ══════════════════════════════════════════════════════════════════════ */
  async function setPersonSkills(personId, codes, word) {
    if (codeBusy) return;
    const keys = (Array.isArray(codes) ? codes : []).map(normCode).filter(Boolean);
    if (!keys.length) return;
    setCodeBusy(true); setErr("");
    try {
      const fresh = readStore(await kvGet(SKILLS_KEY));
      const rec = { ...(fresh.people[String(personId)] || {}) };
      const jobs = { ...(rec.jobs || {}) };
      keys.forEach((k) => { if (word) jobs[k] = word; else delete jobs[k]; });
      const next = {
        v: 1,
        people: { ...fresh.people, [String(personId)]: { ...rec, jobs, updatedAt: new Date().toISOString(), updatedBy: myName } },
      };
      const ok = await kvSet(SKILLS_KEY, next);
      if (ok === false) throw new Error("refused");
      setSkills(next);
      setNote(`${keys.length} ${keys.length === 1 ? "job" : "jobs"} set to ${word || "not trained"}.`);
    } catch { setErr("That did not save. Try again."); }
    finally { setCodeBusy(false); }
  }

  async function writeMarket(mutate) {
    /* Re-read, merge, write. Two people claiming the same shift at once is the
       normal case for a drop board, not the edge case. */
    const fresh = readMarket(await kvGet(MARKET_KEY));
    const next = { v: 1, offers: mutate(fresh.offers.slice()) };
    const ok = await kvSet(MARKET_KEY, next);
    if (ok === false) throw new Error("refused");
    setMarket(next);
    return next;
  }

  async function releaseShift(sh) {
    if (mktBusy) return;
    setMktBusy(true); setErr("");
    try {
      await writeMarket((list) => {
        if (list.some((o) => o.status === OFFER.OPEN &&
            offerMatchesShift(o, sh.weekOf, sh.day, sh.side, myId, sh.start))) return list;
        list.push({
          id: `sm_${Date.now()}_${list.length}`,
          weekOf: sh.weekOf, day: sh.day, iso: sh.iso, side: sh.side,
          start: sh.start, end: sh.end,
          fromPersonId: String(myId), fromPersonName: myName,
          status: OFFER.OPEN, claims: [], releasedAt: new Date().toISOString(),
        });
        return list;
      });
    } catch { setErr("Could not put that shift up. Try again."); }
    finally { setMktBusy(false); }
  }

  async function claimShift(offerId) {
    if (mktBusy) return;
    setMktBusy(true); setErr("");
    try {
      const next = await writeMarket((list) => list.map((o) => (o.id !== offerId ? o : {
        ...o,
        claims: hasClaimed(o, myId) ? o.claims
          : [...(o.claims || []), { personId: String(myId), personName: myName, claimedAt: new Date().toISOString() }],
      })));
      /* ★★ AUTO APPROVAL RUNS HERE, ON THE MARKET WE JUST WROTE, and only when
         the store has switched it on. ⚠️ IT RE-RANKS RATHER THAN TRUSTING THE
         SCREEN: `ranked` on screen was computed before this claim existed.
         ⚠️ A REFUSAL IS SILENT ON PURPOSE. "You claimed it" is the answer to
         what this person just did; a claimer does not need to be told which
         approval rule stopped the machine, and the leader's own screen shows it.
         ⚠️ IT NEVER THROWS INTO THE CLAIM. The claim is already saved and is
         valuable on its own — a failed auto approval must not read as a failed
         claim. */
      const fresh = (next.offers || []).find((o) => o.id === offerId);
      const d = autoDecision({
        offer: fresh,
        ranked: rankClaims(fresh, checkCtx),
        policy: swapPolicy,
        market: next,
        nowMs: Date.now(),
        startsAtMs: shiftStartMs(fresh),
      });
      if (d.approve) await settleClaim(fresh, d.approve, "Auto");
    } catch { setErr("Could not claim that shift. Try again."); }
    finally { setMktBusy(false); }
  }

  async function withdraw(offerId) {
    if (mktBusy) return;
    setMktBusy(true); setErr("");
    try {
      await writeMarket((list) => list.map((o) => (o.id !== offerId ? o : { ...o, status: OFFER.WITHDRAWN })));
    } catch { setErr("Could not take that back. Try again."); }
    finally { setMktBusy(false); }
  }

  /* ══════════════════════════════════════════════════════════════════════
     ⚠️⚠️ THE SHIFT MOVES HERE AND NOWHERE ELSE, and only on approval. Up to
     this point it is still the original person's, on the schedule and on the
     board.

     ⚠️ NO `canApprove` GATE INSIDE THIS FUNCTION, DELIBERATELY. Auto approval
     runs as whoever happened to tap "I will take it", and that person is
     usually a team member. The gate belongs on the BUTTON — `approveClaim`
     below keeps it — because the question is "may this person decide", and when
     the store's own rules decided, nobody did. Anything calling this directly
     has already answered that question.

     `by` is what goes in the record: a leader's name, or "Auto".
     ══════════════════════════════════════════════════════════════════════ */
  async function settleClaim(offer, result, by) {
    /* ⚠️⚠️ THE OFFER'S OWN WEEK, NOT "this week". Schedules are built ahead and
       My Shifts now shows two of them, so `weekKeyFor(new Date())` would read
       and write the WRONG record for every next-week swap — moving a shift on
       a week nobody swapped and leaving the real one untouched. The offer has
       carried `weekOf` since it was created; this reads it. */
    const key = scheduleKey(offer.weekOf);
    const fresh = await kvGet(key);
    const wk = fresh && fresh.days ? fresh : (weekSched && weekSched.monday === offer.weekOf ? weekSched : nextSched);
    const jobs = (skills.people[String(result.claimerId)] || {}).jobs || {};
    const jobName = Object.keys(jobs).find((j) => true) || "";
    const { week: moved, moved: ok } = applySwap(
      wk, offer, result.claimerId, result.claimerName, jobName, jobs[jobName] || "",
    );
    if (!ok) {
      /* Rule 1: fail loudly rather than record an approval the schedule
         never took. The shift has moved or been rebuilt underneath us. */
      setErr("That shift is not on the schedule any more. Rebuild the week and try again.");
      return false;
    }
    const saved = await kvSet(key, moved);
    if (saved === false) throw new Error("refused");
    if (weekSched && weekSched.monday === offer.weekOf) setWeekSched(moved);
    else setNextSched(moved);
    await writeMarket((list) => list.map((o) => (o.id !== offer.id ? o : {
      ...o, status: OFFER.APPROVED,
      approvedPersonId: String(result.claimerId),
      decidedBy: by, decidedAt: new Date().toISOString(),
    })));
    /* ★ AND THE SETUP BOARD. Matt: "i want it to auto upadate the setup."
       ⚠️ AFTER THE SCHEDULE, NEVER BEFORE. The schedule write is the one that
       decides whether this swap happened at all; a board rewritten first and
       then a refused schedule save would leave the two records disagreeing,
       with the board being the one people actually read. */
    await updateSetupBoard(offer, result.claimerName, result.claimerId);
    return true;
  }

  /* ⚠️⚠️ THE BOARD IS A SECOND WRITER'S KEY, so this reads fresh, changes only
     the cells naming one person on one day, and writes nothing at all when
     nothing matched. DailySetup owns this key; this is a leader's edit made
     from another screen, not an import.
     ⚠️ A BOARD FAILURE NEVER UNDOES AN APPROVAL. The swap is already real on
     the schedule. The banner says the setup needs a hand instead, because a
     board quietly left wrong is the failure this whole change exists to fix. */
  async function updateSetupBoard(offer, toName, toId) {
    const side = String(offer.side || "").toLowerCase() === "boh" ? "boh" : "foh";
    const key = `gcfcr-dailysetup-${side}-v2-${offer.weekOf}-auto`;
    try {
      const res = await kvGetResult(key);
      /* ⚠️ A FAILED READ IS NOT AN EMPTY BOARD. Writing here on a dropped read
         would put a one-day board over a whole week. */
      if (!res.ok || !res.value || typeof res.value !== "object") {
        setNote("The schedule is updated. The setup board could not be read, so check it by hand.");
        return;
      }
      const r = applyBoardSwap(res.value, DAY_LONG[offer.day] || offer.day, offer.fromPersonName, toName, toId);
      if (!r.changed) { setNote(swapSummary(r)); return; }
      const ok = await kvSet(key, r.board);
      setNote(ok === false
        ? "The schedule is updated. The setup board did not save, so change it by hand."
        : swapSummary(r));
    } catch {
      setNote("The schedule is updated. The setup board did not, so change it by hand.");
    }
  }

  async function approveClaim(offer, result) {
    if (mktBusy || !canApprove) return;
    setMktBusy(true); setErr("");
    try { await settleClaim(offer, result, myName); }
    catch { setErr("That did not save. Nothing was changed."); }
    finally { setMktBusy(false); }
  }

  /* ── the two setup screens save through here ──────────────────────────
     ⚠️⚠️ ONE WRITER PER KEY. SchoolDates.jsx and MinorRules.jsx hold no
     storage of their own and hand back a whole finished record, because the
     school key is ALSO written by the member-list import a few lines below.
     Two writers to one key is how a re-import silently wipes a year of tapped
     days. Rule 1: on a refused write nothing local changes either, so the
     screen never shows a save that did not happen. */
  async function saveSchool(next) {
    if (rulesBusy) return;
    setRulesBusy(true); setErr("");
    try {
      const ok = await kvSet(SCHOOL_KEY, { ...next, updatedAt: stamp(myName).at, updatedBy: myName });
      if (ok === false) throw new Error("refused");
      setSchool(readSchool(next));
    } catch { setErr("The school calendar did not save. Nothing was changed."); }
    finally { setRulesBusy(false); }
  }

  /* ⚠️ RE-READ IS NOT NEEDED HERE and that is deliberate: every writer in
     storeHours.js returns a whole new record built from the one on screen, and
     this key has ONE screen. The school key needed a re-read because its
     member import writes it too. */
  async function saveStoreHours(next) {
    if (rulesBusy) return;
    setRulesBusy(true); setErr("");
    try {
      const rec = { ...next, updatedAt: stamp(myName).at, updatedBy: myName };
      const ok = await kvSet(STORE_HOURS_KEY, rec);
      if (ok === false) throw new Error("refused");
      setStoreHours(readStoreHours(rec));
    } catch { setErr("Those hours did not save. Nothing was changed."); }
    finally { setRulesBusy(false); }
  }

  /* ⚠️ SAME NO-RE-READ REASONING AS saveStoreHours ABOVE: every writer in
     trainingPriorities.js returns a whole record built from the one on screen,
     and this key has one screen. */
  async function saveTraining(next) {
    if (rulesBusy) return;
    setRulesBusy(true); setErr("");
    try {
      const rec = { ...next, updatedAt: stamp(myName).at, updatedBy: myName };
      const ok = await kvSet(TRAINING_KEY, rec);
      if (ok === false) throw new Error("refused");
      setTraining(readTraining(rec));
    } catch { setErr("The training priorities did not save. Nothing was changed."); }
    finally { setRulesBusy(false); }
  }

  async function saveMinorRules(next) {
    if (rulesBusy) return;
    setRulesBusy(true); setErr("");
    try {
      const ok = await kvSet(MINOR_RULES_KEY, next);
      if (ok === false) throw new Error("refused");
      setMinorRules(readMinorRules(next));
    } catch { setErr("The minor limits did not save. Nothing was changed."); }
    finally { setRulesBusy(false); }
  }

  /* ⚠️ THE ALIAS MAP IS PASSED IN, NOT READ OFF STATE, when the caller has just
     saved one. `setAliases` does not land until the next render, so a re-import
     fired straight after linking a name would use the map from BEFORE the link
     and drop the person again — with a green "saved" on screen. The parameter
     defaults to state for the ordinary button press.
     ⚠️ CALLED AS `() => runImport()`, never `onClick={runImport}`, or React
     hands it a MouseEvent as the alias map. */
  async function runImport(aliasNow) {
    if (saving) return;
    /* ★★ THE PASTE DECIDES WHICH PARSER RUNS, NOT THE TAB. Matt, Aug 13 2026:
       "none of the availabilty i sent imported".
       ⚠️⚠️ THIS USED TO ROUTE ON `tab`, WHICH IS HOW A HUNDRED ROWS GOT LOST.
       Pasting the availability report while the Skills tab was open read it as
       skills: no crash, no error, a green "saved 0 people". Splitting the tile
       made it near-certain, because the availability tab moved to the OTHER
       tile and the only import box a leader could reach was the wrong one.
       ⚠️ AN UNKNOWN PASTE SAVES NOTHING. No fallback parser, ever — the
       fallback IS the bug. Rule 1: fail loudly rather than store something
       wrong. */
    const kind = sniffReport(paste);
    if (!kind) {
      setErr("Could not tell which report this is, so nothing was saved. Paste the whole export, including its heading row.");
      return;
    }
    setSaving(true);
    setErr("");
    setReport(null);
    const alias = aliasNow || aliases;
    /* ⚠️ THE PASTE IS KEPT WHEN ANYBODY WAS LEFT OUT, and that is the whole
       reason linking a name is usable. Clearing it unconditionally meant a
       leader who linked Brianna Moore had to go back to HotSchedules and
       export the report a second time to apply the link they had just made. */
    let leftOut = 0;
    try {
      if (kind === "school") {
        const parsed = parseSchoolMembers(paste);
        const { matched, unmatched } = matchToRoster(parsed.names.map((n) => ({ name: n })), team, alias);
        /* ⚠️⚠️ RE-READ AND MERGE, NEVER REPLACE. This key now also carries the
           school YEAR and every day somebody tapped out. The line that used to
           be here built a fresh `{ v, title, ids, updatedAt }`, which would
           have deleted a term's worth of tapping the first time anybody
           re-imported the member list — silently, and looking like a normal
           successful import. Rule 1. */
        const freshSchool = readSchool(await kvGet(SCHOOL_KEY));
        const next = {
          ...freshSchool,
          title: parsed.title || freshSchool.title || "",
          ids: matched.map((m) => m.id),
          updatedAt: stamp(myName).at,
          updatedBy: myName,
        };
        const ok = await kvSet(SCHOOL_KEY, next);
        if (ok === false) throw new Error("refused");
        setSchool(readSchool(next));
        leftOut = unmatched.length;
        setReport({ saved: matched.length, unmatched, problems: parsed.problems.map((p) => ({ cell: p })), what: "on the school calendar" });
      } else if (kind === "skills") {
        const parsed = parseSkillsText(paste);
        const { matched, unmatched } = matchToRoster(parsed.rows, team, alias);
        const fresh = readStore(await kvGet(SKILLS_KEY));
        const next = mergeImport(fresh, matched, stamp(myName, "import"));
        const ok = await kvSet(SKILLS_KEY, next);
        if (ok === false) throw new Error("refused");
        setSkills(next);
        leftOut = unmatched.length;
        setReport({ saved: matched.length, unmatched, problems: parsed.problems.map((p) => ({ cell: p })), what: "with skills" });
      } else {
        const parsed = parseAvailabilityCsv(paste);
        const { matched, unmatched } = matchToRoster(parsed.rows, team, alias);
        const fresh = readStore(await kvGet(AVAIL_KEY));
        const next = mergeImport(fresh, matched, stamp(myName, "import"));
        const ok = await kvSet(AVAIL_KEY, next);
        if (ok === false) throw new Error("refused");
        setAvail(next);
        leftOut = unmatched.length;
        setReport({ saved: matched.length, unmatched, problems: parsed.problems, what: "with availability" });
      }
      if (!leftOut) setPaste("");
    } catch {
      setErr("The import did not save. Nothing was changed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  /* ── linking a name the export spells differently ─────────────────────
     ⚠️ THE LINK IS SAVED, THEN THE SAME PASTE IS IMPORTED AGAIN. Saving the
     alias alone would leave the screen still saying the person was not saved,
     which is true, and the leader would have no way to act on it without
     re-exporting from HotSchedules. */
  async function linkName(exportName) {
    const id = linkPick[exportName];
    if (!id || linkBusy || saving) return;
    setLinkBusy(exportName);
    setErr("");
    try {
      /* ⚠️ RE-READ BEFORE WRITING. Two leaders doing setup at the same time
         would otherwise each save a map built from what they loaded, and the
         second save would drop the first one's links without a word. Same
         re-read-and-merge rule the three imports above already follow. */
      const fresh = readAliases(await kvGet(ALIASES_KEY));
      const next = setAlias(fresh, exportName, id, stamp(myName));
      /* setAlias answers null rather than storing half a link. Rule 1. */
      if (!next) throw new Error("blank");
      const ok = await kvSet(ALIASES_KEY, next);
      if (ok === false) throw new Error("refused");
      const saved = readAliases(next);
      setAliases(saved);
      setLinkPick((p) => { const o = { ...p }; delete o[exportName]; return o; });
      /* Passed in, not read off state — see the warning above runImport. */
      await runImport(saved);
    } catch {
      setErr("That link did not save. Nothing was changed. Try again.");
    } finally {
      setLinkBusy("");
    }
  }

  /* ⚠️ EVERY HOOK IS ABOVE THIS LINE. Check 2 — a use*() below a function-body
     return took the whole dashboard down once. */
  if (loading) return <div className="p-6 text-sm text-slate-500">Loading…</div>;

  const showList = canSeeTeam && !selected;
  const skillsOf = (id) => (skills.people[String(id)] || {}).jobs || {};

  return (
    <div className="mx-auto max-w-4xl p-4 pb-24">
      <div className="mb-4 flex items-start gap-3">
        <div className="shrink-0 rounded-xl p-2" style={{ background: INK }}>
          <CalendarCheck className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          {/* ⚠️ THE HEADING FOLLOWS THE MODE. It said "Availability & Skills" in
              both, which stopped being true the moment Skills moved to the
              Schedule console — a team member opened a tile named after a tab
              that is not on it. */}
          {/* ⚠️ BOTH HEADINGS MATCH THEIR TILE NAME IN App.jsx. The team half is
              its own tile ("Lineup · My Shifts"); the leader half is a TAB
              inside the Lineup console, so it names the tab and not the tile —
              repeating "Lineup" above a tab bar that already says it is noise. */}
          <h1 className="text-xl font-bold leading-tight text-slate-900">
            {view === "leader" ? "Lineup set up" : "Lineup · My Shifts"}
          </h1>
          <p className="text-sm" style={{ color: GRAY }}>
            {view === "leader"
              ? "Skills, time off, school days and minor limits. The week gets built from these."
              : "When you can work, and swapping a shift with somebody."}
          </p>
        </div>
      </div>

      {err ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm" style={{ color: RED }}>
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{err}</span>
        </div>
      ) : null}

      {/* What the last approval did to the setup board. ⚠️ NOT RED. The swap
          worked; this line is about the second record. */}
      {note ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <span className="flex-1">{note}</span>
          <button onClick={() => setNote("")} className="text-xs font-medium text-slate-500">Hide</button>
        </div>
      ) : null}

      {/* ⚠️⚠️ IT SCROLLS SIDEWAYS OR THE LAST TABS ARE UNREACHABLE ON A PHONE.
            Matt, Aug 14 2026, on his phone: "The top doesn't scroll side to
            side." The leader row went from five tabs to six when Training was
            added, and six at this size is wider than a 390px screen.

            ⚠️ THE APP ROOT SETS `overflow: hidden` (App.jsx), so anything wider
            than the viewport is CLIPPED WITH NO WAY TO REACH IT — not merely
            off-screen. A row that overflows there is a row whose last item
            simply does not exist for the person holding the phone.

            ⚠️ `shrink-0` + `whitespace-nowrap` ARE THE FIX, NOT THE SCROLLBAR.
            Without them flex quietly COMPRESSES each button instead of
            overflowing, so the strip never scrolls and the labels wrap to two
            squashed lines — which is why this did not show up as an overflow
            when measured. The buttons have to refuse to shrink before
            `overflow-x-auto` has anything to scroll.

            ⚠️ `-mx-1 px-1` keeps the focus ring and the first button's left
            edge from being shaved off by the scroll container. */}
      {canSeeTeam ? (
        <div className="mb-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {TABS[view].map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setTab(id); setSelectedId(null); setReport(null); setShowImport(false); }}
              className={"shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium " + (tab === id ? "text-white" : "bg-white text-slate-600 border border-slate-200")}
              style={tab === id ? { background: INK } : null}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {/* ── import ───────────────────────────────────────────────────────
          ⚠️ ONLY ON A TAB THAT HAS SOMETHING TO IMPORT. The paste box describes
          which HotSchedules export to use, and before this test it fell through
          to the school wording on every tab that was not availability or
          skills — so the Minors tab would have offered to import a school
          calendar. */}
      {canEditAll && !selected && !NO_IMPORT_TABS.has(tab) ? (
        <div className="mb-4 rounded-xl bg-white p-4" style={toolCard(TILE)}>
          <button
            onClick={() => { setShowImport((v) => !v); setReport(null); }}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-800"
          >
            <Upload className="h-4 w-4" />
            {showImport ? "Close import" : "Import from HotSchedules"}
          </button>

          {showImport ? (
            <div className="mt-3">
              {/* ⚠️ ONE BOX FOR ALL THREE REPORTS. It no longer matters which
                  tab you are on — same choice teamDetails.js already made for
                  the two staff exports, and for the same reason: a leader
                  pastes whichever sheet they have open. */}
              <p className="mb-2 text-sm" style={{ color: GRAY }}>
                Paste any of the three and the Hub works out which it is:
                Reporting → Availability Report (export CSV), Staff → Job and
                Skill Level, or the school calendar group's member list.
              </p>
              <textarea
                value={paste}
                onChange={(e) => { const v = e.target.value; setPaste(v); setReport(null); }}
                rows={6}
                placeholder={'Employees,Sun  8/16/26,Mon  8/17/26,…\n"Alex Smith","Unavailable All Day","Partially Available 5:30 PM - 10:00 PM",…\n— or —\nAlex Smith\tDRIVE THRU - BEGINNER'}
                className="w-full rounded-lg border border-slate-300 p-2 font-mono text-xs"
              />

              {/* ⚠️⚠️ SAY WHAT IT IS BEFORE ANYTHING SAVES. Reading the paste is
                  free and changes nothing, so the answer is on screen while
                  there is still time to fix it. The old screen said nothing
                  until after it had written the wrong thing. */}
              {paste.trim() ? (
                <div className="mt-2 text-sm" style={{ color: sniffed ? "#14243D" : RED }}>
                  {sniffed
                    ? `Reads as ${KIND_LABEL[sniffed]}.`
                    : "Cannot tell which report this is. Paste the whole export, including its heading row. Nothing will be saved."}
                </div>
              ) : null}

              <button
                onClick={() => runImport()}
                disabled={!paste.trim() || !sniffed || saving}
                className="mt-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
                style={paste.trim() && sniffed && !saving ? { background: INK } : null}
              >
                {saving ? "Reading…" : "Read it and save"}
              </button>
            </div>
          ) : null}

          {report ? (
            <div className="mt-3 space-y-2 text-sm">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2" style={{ color: GREEN }}>
                Saved {report.saved} {report.saved === 1 ? "person" : "people"} {report.what}.
              </div>
              {/* ⚠️⚠️ SAY WHO IT IS ONCE, AND THE HUB REMEMBERS. HotSchedules
                  exports the legal name and the roster carries the name the
                  store uses, so Ally, Bri and a misspelt Paola fell out of
                  every import and would have kept falling out for ever. The
                  matcher is right to refuse — widening it would merge the two
                  Lizbeths — so the answer is a person, picked once. */}
              {report.unmatched.length ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                  <div className="font-medium">
                    {report.unmatched.length} not saved, because the name did not match the roster.
                  </div>
                  <div className="mt-1 text-xs">
                    Pick who each one is and the Hub will remember it for next time.
                  </div>
                  <div className="mt-2 space-y-2">
                    {report.unmatched.map((u, i) => (
                      <div key={`${u.name}-${i}`} className="flex flex-wrap items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{u.name}</div>
                          <div className="text-xs opacity-75">{u.reason}</div>
                        </div>
                        <select
                          value={linkPick[u.name] || ""}
                          disabled={!!linkBusy || saving}
                          onChange={(e) => {
                            /* Read the value out FIRST. `.target` inside the
                               updater is the synthetic-event bug in check 5. */
                            const v = e.target.value;
                            setLinkPick((p) => ({ ...p, [u.name]: v }));
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
                        >
                          <option value="">Who is this?</option>
                          {rosterSorted.map((p) => (
                            <option key={p.id} value={String(p.id)}>{p.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => linkName(u.name)}
                          disabled={!linkPick[u.name] || !!linkBusy || saving}
                          className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:bg-slate-300"
                          style={linkPick[u.name] && !linkBusy && !saving ? { background: INK } : null}
                        >
                          {linkBusy === u.name ? "Linking…" : "This is them"}
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-xs">
                    Somebody who does not work here yet will not be in the list. Add them in
                    HR Console first, then import again.
                  </div>
                </div>
              ) : null}
              {report.problems && report.problems.length ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                  <div className="font-medium">{report.problems.length} line(s) could not be read and were left alone:</div>
                  <ul className="mt-1 list-inside list-disc font-mono text-xs">
                    {report.problems.slice(0, 12).map((p, i) => (
                      <li key={i}>{p.name ? `${p.name} ${p.day || ""}: ` : ""}{p.cell}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── shifts: drop, pick up, approve ─────────────────────────────── */}
      {tab === "shifts" ? (
        <div className="space-y-4">
          {!weekSched ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              No schedule has been built for this week yet, so there is nothing to give up or pick up.
            </div>
          ) : null}

          {/* my week */}
          <div className="rounded-xl bg-white p-4" style={toolCard(TILE)}>
            <div className="mb-3 font-semibold text-slate-900">Your shifts this week</div>
            {myShifts.length === 0 ? (
              <div className="text-sm" style={{ color: GRAY }}>
                {weekSched ? "You are not on the schedule this week." : "Nothing to show yet."}
              </div>
            ) : (
              <div className="space-y-2">
                {myShifts.map((sh) => {
                  const up = mine.find((o) => offerMatchesShift(o, sh.weekOf, sh.day, sh.side, myId, sh.start));
                  return (
                    <div key={`${sh.day}-${sh.side}-${sh.start}`} className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-900">
                          {DAY_LONG[sh.day] || sh.day} · {fmtMin(sh.start)}-{fmtMin(sh.end)}
                        </div>
                        <div className="text-xs" style={{ color: GRAY }}>
                          {sh.side}{sh.job ? ` · ${sh.job}` : ""}
                          {up ? ` · up for grabs, ${(up.claims || []).length} asked for it` : ""}
                        </div>
                      </div>
                      {up ? (
                        <button onClick={() => withdraw(up.id)} disabled={mktBusy}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50">
                          <Undo2 className="h-4 w-4" /> Keep it after all
                        </button>
                      ) : (
                        <button onClick={() => releaseShift(sh)} disabled={mktBusy}
                          className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                          style={{ background: INK }}>
                          Give this shift up
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-3 text-xs" style={{ color: GRAY }}>
              ⚠️ It stays your shift until a director approves somebody else for it.
            </p>
          </div>

          {/* shifts other people dropped */}
          <div className="rounded-xl bg-white p-4" style={toolCard(TILE)}>
            <div className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
              <Handshake className="h-4 w-4" /> Shifts going spare
            </div>
            {theirs.length === 0 ? (
              <div className="text-sm" style={{ color: GRAY }}>Nobody has given up a shift.</div>
            ) : (
              <div className="space-y-2">
                {theirs.map((o) => (
                  <div key={o.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900">{fmtOffer(o)}</div>
                      <div className="text-xs" style={{ color: GRAY }}>
                        {o.fromPersonName} · {(o.claims || []).length} asked for it
                      </div>
                    </div>
                    {hasClaimed(o, myId) ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">You asked for it</span>
                    ) : (
                      <button onClick={() => claimShift(o.id)} disabled={mktBusy}
                        className="rounded-lg border-2 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                        style={{ borderColor: INK, color: INK }}>
                        I will take it
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ⚠️⚠️ THE CHECKED APPROVAL. Every claimer is scored against the same
              rules the builder uses, BEFORE the leader taps anything, and the
              clean ones sort to the top. Approving blind is the thing this
              whole feature exists to stop. */}
          {canSeeTeam && offers.length ? (
            <div className="rounded-xl bg-white p-4" style={toolCard(TILE)}>
              <div className="mb-1 font-semibold text-slate-900">Who wants them</div>
              <p className="mb-3 text-sm" style={{ color: GRAY }}>
                {canApprove
                  ? "Checked against availability, training, hours and time off before you decide."
                  : "You can see every check. Only Matt and Hannah can approve a pick up."}
              </p>
              {/* ⚠️ SAY OUT LOUD THAT THE MACHINE IS APPROVING. A leader opening
                  this screen and finding swaps already settled with nobody named
                  is the kind of surprise that gets a feature switched off. */}
              {swapPolicy.on ? (
                <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  Clean swaps go through on their own, {swapPolicy.minNoticeHours}+ hours ahead.
                  Anything with a warning, anything closer than that, or anybody past{" "}
                  {swapPolicy.maxDropsPerWeek} shifts given up in a week still waits for you.
                </p>
              ) : null}
              <div className="space-y-4">
                {offers.map((o) => {
                  const ranked = rankClaims(o, checkCtx);
                  /* ★ THE FLIGHT RISK LINE. Matt: "also pay attention to the
                     shift swaps for flight risks." It only appears once
                     somebody is past the store's own weekly cap, because
                     everybody gives up a shift now and then and a badge on all
                     of them would say nothing. */
                  const flag = dropFlag(market, o.fromPersonId, o.weekOf, swapPolicy);
                  return (
                    <div key={o.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="mb-2 font-medium text-slate-900">
                        {fmtOffer(o)} <span className="text-xs font-normal" style={{ color: GRAY }}>from {o.fromPersonName}</span>
                      </div>
                      {flag ? (
                        <div className="mb-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">
                          {o.fromPersonName}: {flag}. Worth a conversation.
                        </div>
                      ) : null}
                      {ranked.length === 0 ? (
                        <div className="text-sm" style={{ color: GRAY }}>Nobody has asked for it yet.</div>
                      ) : (
                        <div className="space-y-2">
                          {ranked.map((r) => (
                            <div key={r.claimerId}
                              className={"rounded-lg px-3 py-2 " + (r.ok ? "bg-emerald-50" : "bg-red-50")}>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-slate-900">{r.claimerName}</span>
                                <span className="text-xs" style={{ color: GRAY }}>
                                  {r.ratedLabel} on {o.side} · {r.hoursBefore.toFixed(1)} → {r.hoursAfter.toFixed(1)} hours
                                  {r.overtime ? " · overtime" : ""}
                                </span>
                                {canApprove ? (
                                  <button onClick={() => approveClaim(o, r)} disabled={mktBusy}
                                    className="ml-auto rounded-lg px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
                                    style={{ background: r.ok ? GREEN : RED }}>
                                    {r.ok ? "Approve" : "Approve anyway"}
                                  </button>
                                ) : null}
                              </div>
                              {r.blockers.length ? (
                                <ul className="mt-1 list-inside list-disc text-xs" style={{ color: RED }}>
                                  {r.blockers.map((b, i) => <li key={i}>{b}</li>)}
                                </ul>
                              ) : null}
                              {r.notes.length ? (
                                <div className="mt-1 text-xs" style={{ color: GRAY }}>{r.notes.join(" · ")}</div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── time off ───────────────────────────────────────────────────── */}
      {tab === "timeoff" ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-white p-4" style={toolCard(TILE)}>
            <div className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
              <Plane className="h-4 w-4" /> Ask for time off
            </div>

            {canEditAll ? (
              <label className="mb-3 block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Who is this for</span>
                <select
                  value={toWho || myId}
                  onChange={(e) => { const v = e.target.value; setToWho(v); }}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                >
                  {myId ? <option value={myId}>Me</option> : null}
                  {rows.filter((p) => String(p.id) !== myId).map((p) => (
                    <option key={p.id} value={String(p.id)}>{p.name}</option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">First day off</span>
                <input type="date" value={toFrom}
                  onChange={(e) => { const v = e.target.value; setToFrom(v); if (!toTo) setToTo(v); }}
                  className="rounded-lg border border-slate-300 px-2 py-1.5" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Last day off</span>
                <input type="date" value={toTo}
                  onChange={(e) => { const v = e.target.value; setToTo(v); }}
                  className="rounded-lg border border-slate-300 px-2 py-1.5" />
              </label>
            </div>

            <label className="mt-3 block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Why (optional)</span>
              <input value={toReason}
                onChange={(e) => { const v = e.target.value; setToReason(v); }}
                placeholder="Family trip"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                onClick={askOff}
                disabled={toBusy || !toFrom || !forId}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
                style={!toBusy && toFrom && forId ? { background: INK } : null}
              >
                {toBusy ? "Sending…" : "Send the request"}
              </button>
              {toFrom && toTo ? (
                <span className="text-sm" style={{ color: GRAY }}>
                  {dayCount({ from: toFrom, to: toTo })} day(s)
                </span>
              ) : null}
              {toNote ? <span className="text-sm" style={{ color: GREEN }}>{toNote}</span> : null}
            </div>
            {!forId ? (
              <div className="mt-2 text-xs" style={{ color: GRAY }}>
                We could not match your sign in to the roster, so there is nobody to file this for.
              </div>
            ) : null}
          </div>

          {/* ⚠️ WAITING IS NOT OFF. A request nobody has answered still gets
              scheduled, so this list is the thing that has to be cleared before
              a week is built. See the header of timeOff.js. */}
          {canSeeTeam ? (
            <div className="rounded-xl bg-white p-4" style={toolCard(TILE)}>
              <div className="mb-1 font-semibold text-slate-900">
                Waiting on an answer {pending.length ? `(${pending.length})` : ""}
              </div>
              <p className="mb-3 text-sm" style={{ color: GRAY }}>
                These do <strong>not</strong> block the schedule yet. Anyone still on this list will
                be scheduled as normal until somebody answers.
                {!canApprove ? " Only Matt and Hannah can answer them." : ""}
              </p>
              {pending.length === 0 ? (
                <div className="text-sm" style={{ color: GRAY }}>Nothing waiting.</div>
              ) : (
                <div className="space-y-2">
                  {pending.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-900">{r.name}</div>
                        <div className="text-xs" style={{ color: GRAY }}>
                          {fmtRange(r)} · {dayCount(r)} day(s){r.reason ? ` · ${r.reason}` : ""}
                        </div>
                        {/* ★ THE SAME THREAD THE ASKER SEES, on the leader's
                            side of the same request. One conversation, not a
                            leader view and a member view that can disagree. */}
                        <ShiftThread requestId={r.id} meId={forId} />
                      </div>
                      {/* SEEING IS TIER 2, ANSWERING IS THE APPROVER LIST.
                          A leader who cannot answer still needs to SEE what is
                          waiting, because an unanswered request is what turns
                          into somebody being scheduled on a day they asked off. */}
                      {canApprove ? (
                        <>
                          <button
                            onClick={() => decide(r.id, STATUS.APPROVED)}
                            disabled={toBusy}
                            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                            style={{ background: GREEN }}
                          >
                            <ThumbsUp className="h-4 w-4" /> Approve
                          </button>
                          <button
                            onClick={() => decide(r.id, STATUS.DENIED)}
                            disabled={toBusy}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
                          >
                            <ThumbsDown className="h-4 w-4" /> Not this time
                          </button>
                        </>
                      ) : (
                        <span className="text-xs" style={{ color: GRAY }}>waiting on Matt or Hannah</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="rounded-xl bg-white p-4" style={toolCard(TILE)}>
            <div className="mb-3 font-semibold text-slate-900">
              {canEditAll && toWho && toWho !== myId ? "Their requests" : "Your requests"}
            </div>
            {myRequests.length === 0 ? (
              <div className="text-sm" style={{ color: GRAY }}>Nothing asked for yet.</div>
            ) : (
              <div className="space-y-2">
                {myRequests.map((r) => {
                  const st = STATUS_STYLE[r.status] || STATUS_STYLE[STATUS.PENDING];
                  return (
                    <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-900">{fmtRange(r)}</div>
                        <div className="text-xs" style={{ color: GRAY }}>
                          {dayCount(r)} day(s){r.reason ? ` · ${r.reason}` : ""}
                          {r.decidedBy ? ` · answered by ${r.decidedBy}` : ""}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${st.bg} ${st.fg}`}>{st.label}</span>
                      <ShiftThread requestId={r.id} meId={forId} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* ── skills tab ─────────────────────────────────────────────────── */}
      {tab === "skills" && canSeeTeam && !selected ? (
        <div className="space-y-4">
          {/* the store's own job codes */}
          {canEditAll ? (
            <div className="overflow-hidden rounded-xl bg-white" style={toolCard(TILE)}>
              {/* ★ COLLAPSED BY DEFAULT. Matt, Aug 14 2026: "make job codes
                  collapsable". This store runs 46 of them, so the list was
                  pushing the thing the tab is actually for — who is trained on
                  what — most of a screen down every time it opened.
                  ⚠️ THE COUNT IS ON THE CLOSED HEADER. A collapsed panel that
                  does not say how much is inside is a panel nobody opens. */}
              <button
                onClick={() => setCodesOpen((v) => !v)}
                aria-expanded={codesOpen}
                className="flex w-full items-center gap-2 px-4 py-3 text-left"
              >
                <span className="font-semibold text-slate-900">Job codes</span>
                <span className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                  style={{ color: "#fff", background: TILE }}>
                  {codesAll.codes.length}
                </span>
                {strayCodes.length ? (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                    {strayCodes.length} not set up
                  </span>
                ) : null}
                <span className="ml-auto text-[12px] font-semibold" style={{ color: TILE }}>
                  {codesOpen ? "Hide" : "Show"}
                </span>
              </button>
              {codesOpen ? (
              <div className="border-t border-slate-100 p-4">
              <p className="mb-3 text-sm" style={{ color: GRAY }}>
                What each job is and which side it belongs to. Tick <strong>leads</strong> for a code
                that means somebody is running a shift, so the schedule only puts those people on
                leader positions.
              </p>

              {codesAll.codes.length === 0 ? (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Nothing typed yet, so the Hub is guessing each job&apos;s side from its name.
                  <button
                    onClick={() => writeCodes({ v: 1, codes: DEFAULT_CODES.map((c) => ({ ...c })) })}
                    disabled={codeBusy}
                    className="ml-2 rounded-lg px-3 py-1 text-xs font-medium text-white"
                    style={{ background: INK }}
                  >
                    Start from the usual list
                  </button>
                </div>
              ) : null}

              {strayCodes.length ? (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {strayCodes.length} job code{strayCodes.length === 1 ? "" : "s"} came in from an import
                  and {strayCodes.length === 1 ? "has" : "have"} not been set up: {strayCodes.join(", ")}.
                  The Hub is guessing {strayCodes.length === 1 ? "its" : "their"} side from the name.
                </div>
              ) : null}

              {/* ★ JOB CODES AS TRAINING LINES TOO, and the stripe carries the
                  one thing this list is for: which side the code belongs to.
                  ⚠️ THREE MEANINGS, NOT A RAINBOW. Kitchen, front, and amber
                  for a code that arrived from an import and nobody has set up —
                  which the banner above already counts, so the colour and the
                  count cannot disagree.
                  ⚠️ THE SIDE IS STILL SPELT OUT in the dropdown beside it. The
                  stripe makes it quick; it does not make it readable on its own,
                  and a colour nobody can name is not a label. */}
              <div className="mb-3 flex flex-col gap-1.5">
                {codesAll.codes.map((c) => {
                  const hue = c.fromStations && !c.side ? "#B45309"
                    : String(c.side).toUpperCase() === "BOH" ? "#7C3AED" : TILE;
                  return (
                  <div
                    key={c.code}
                    className="flex overflow-hidden rounded-lg bg-white text-sm"
                    style={toolRow(hue)}
                  >
                    <span className="self-stretch shrink-0" style={{ width: 4, background: hue }} />
                    {/* ⚠️ THE CODE GETS ITS OWN LINE AND THE CONTROLS SIT UNDER
                        IT. Sharing one row with a dropdown, a checkbox and a
                        label left about eight characters for the name on a
                        phone, so "MACHINES 4,5 / GRILLS — FOH LEAD" broke across
                        three ragged lines and the list stopped scanning. Two
                        tight lines read faster than three torn ones. */}
                    <div className="min-w-0 flex-1 px-3 py-1.5">
                    <div className="font-bold text-slate-900">
                      {c.code}
                      {/* ★ SAID IN WORDS AS WELL AS IN COLOUR. The stripe makes
                          it quick; a colour nobody can name is not a label, and
                          this one decides where somebody gets cut from. */}
                      {c.zone ? (
                        <span className="ml-1.5 text-[10px] font-extrabold uppercase tracking-wider"
                          style={{ color: shade(hue) }}>{ZONE_LABEL[c.zone]}</span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                    <select
                      value={c.side || "FOH"}
                      onChange={(e) => { const v = e.target.value; writeCodes(upsertCode(codes, { ...c, side: v })); }}
                      className="rounded-lg border border-slate-300 px-2 py-1"
                    >
                      {SIDES.map((sd) => <option key={sd} value={sd}>{sd}</option>)}
                    </select>
                    {/* ★ WHICH HALF OF THE FRONT. Matt, Aug 14 2026: "for job
                        codes have DT and foh you know where to cut exactly...
                        its important because the planners says to cut from dt
                        and from foh." These are the Labor Planner's own two
                        buckets, so its advice and this list speak one language.
                        ⚠️ ONLY ON THE FRONT. The kitchen is one zone and an
                        empty picker on 17 rows is noise.
                        ⚠️ "BOTH" IS A REAL ANSWER, not a missing one. The window
                        and the expo serve both halves, and forcing them into one
                        would have a cut suggestion take somebody off a position
                        the other half was relying on. */}
                    {(c.side || "FOH") === "FOH" ? (
                      <select
                        value={c.zone || ""}
                        onChange={(e) => { const v = e.target.value; writeCodes(upsertCode(codes, { ...c, zone: v || null })); }}
                        className="rounded-lg border border-slate-300 px-2 py-1"
                        title="Which half of the front this counts against when the planner says to cut"
                      >
                        <option value="">both</option>
                        {ZONES.map((z) => <option key={z} value={z}>{ZONE_LABEL[z]}</option>)}
                      </select>
                    ) : null}
                    <label className="inline-flex items-center gap-1 text-xs" style={{ color: GRAY }}>
                      <input
                        type="checkbox"
                        checked={!!c.leader}
                        onChange={(e) => { const v = e.target.checked; writeCodes(upsertCode(codes, { ...c, leader: v })); }}
                        className="rounded border-slate-300"
                      />
                      leads
                    </label>
                    {/* ⚠️ A POSITION CANNOT BE REMOVED HERE AND MUST NOT OFFER TO BE.
                        It comes from the store's station list, so `removeCode`
                        would find nothing to remove and the button would sit
                        there doing nothing — the "visible but does nothing"
                        signature the project rules name. Take the station off
                        the board and the role goes with it.
                        ⚠️ SIDE AND `leads` ARE STILL EDITABLE ON ONE, on purpose:
                        `upsertCode` writes it into the typed list, which promotes
                        a derived position to one the store owns. That is the
                        right escape hatch and it is why those two are left
                        alone. */}
                    {c.fromStations ? (
                      <span className="text-xs" style={{ color: GRAY }}>from your stations</span>
                    ) : (
                      <button
                        onClick={() => writeCodes(removeCode(codes, c.code))}
                        disabled={codeBusy}
                        className="text-xs" style={{ color: RED }}
                      >
                        remove
                      </button>
                    )}
                    </div>
                    </div>
                  </div>
                  );
                })}
                {codesAll.codes.length === 0 ? (
                  <div className="rounded-lg px-3 py-3 text-sm" style={{ color: GRAY, background: "#F6F8FA" }}>
                    No job codes set up.
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <input
                  value={newCode}
                  onChange={(e) => { const v = e.target.value; setNewCode(v); }}
                  placeholder="New job code"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <select value={newSide} onChange={(e) => { const v = e.target.value; setNewSide(v); }}
                  className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
                  {SIDES.map((sd) => <option key={sd} value={sd}>{sd}</option>)}
                </select>
                <label className="inline-flex items-center gap-1 text-sm" style={{ color: GRAY }}>
                  <input type="checkbox" checked={newLeader}
                    onChange={(e) => { const v = e.target.checked; setNewLeader(v); }}
                    className="rounded border-slate-300" />
                  leads
                </label>
                <button
                  onClick={() => {
                    if (!normCode(newCode)) return;
                    writeCodes(upsertCode(codes, { code: newCode, side: newSide, leader: newLeader }));
                    setNewCode(""); setNewLeader(false);
                  }}
                  disabled={!normCode(newCode) || codeBusy}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
                  style={normCode(newCode) && !codeBusy ? { background: INK } : null}
                >
                  Add it
                </button>
              </div>
              </div>
              ) : null}
            </div>
          ) : null}

          {/* ⚠️⚠️ IT SAYS WHO IS NOT IN THIS LIST, AND WHERE TO CHANGE IT.
              This tab has no search box, so the escape hatch that works on the
              Availability tab — type a name, open the record, untick it — cannot
              be reached from here at all. A list that quietly drops six people
              with no way back is the uneditable-and-wrong state design rule 18
              is about. One line naming the count and pointing at the screen that
              owns the setting turns a silent filter into a stated one.
              ⚠️ ONLY WHEN SOMEBODY IS ACTUALLY HIDDEN. A store that schedules
              everybody never sees this. */}
          {hiddenFromFloor ? (
            <div className="mb-2 text-[11.5px]" style={{ color: GRAY }}>
              {hiddenFromFloor} not scheduled on the floor, so they are not listed.
              Change that on the Availability tab.
            </div>
          ) : null}

          {/* ★ WHO IS TRAINED ON WHAT, drawn as training lines. Matt, Aug 14
              2026: "lineup-jobcodes and employees needs the new look upgrade",
              and the look he named is the Training priorities list.
              ⚠️ THE STRIPE MEANS SOMETHING. Teal for somebody with skills on
              file, amber for "Not set" — which is the row a leader is actually
              looking for on this screen. A list where every row is the same
              colour is decoration; this one sorts itself by eye.
              ⚠️ AMBER IS "NOT YET", never red. Nobody has done anything wrong
              by not having been rated. Same rule as the Training tab. */}
          <div className="flex flex-col gap-1.5">
            {floorRows.map((p) => {
              const jobs = skillsOf(p.id);
              const names = Object.keys(jobs).sort();
              const open = String(skillWho) === String(p.id);
              const hue = names.length ? TILE : "#B45309";
              return (
                <div
                  key={p.id}
                  className="flex overflow-hidden rounded-lg bg-white"
                  style={toolRow(hue)}
                >
                  <span className="self-stretch shrink-0" style={{ width: 4, background: hue }} />
                  <div className="min-w-0 flex-1 px-3 py-2">
                  <button
                    onClick={() => canEditAll && setSkillWho(open ? null : String(p.id))}
                    className="w-full text-left"
                  >
                    <div className="font-semibold text-slate-900">{p.name}</div>
                    <div className="text-xs" style={{ color: names.length ? GRAY : shade(hue) }}>
                      {names.length
                        ? names.map((j) => `${j} (${jobs[j]})`).join(" · ")
                        : "Not set"}
                      {canEditAll ? <span className="ml-1">· {open ? "close" : "change"}</span> : null}
                    </div>
                  </button>

                  {open && canEditAll ? (
                    <div className="mt-2 space-y-1">
                      {/* ★★ SET A WHOLE SECTION AT ONCE. Matt: "brandon should be
                          advanced for all boh jobs. hes the director." Fifteen
                          taps on fifteen menus for a person who is advanced at
                          all of it.
                          ⚠️ THE COUNT IS ON THE BUTTON, so nobody presses this
                          without seeing how many records it rewrites. Leadership
                          is its own group and is never inside Kitchen or Front. */}
                      {skillGroups.length ? (
                        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-2 py-2">
                          <span className="text-xs font-medium text-slate-600">Set a whole section</span>
                          <select
                            value={bulkGroup}
                            onChange={(e) => { const v = e.target.value; setBulkGroup(v); }}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                          >
                            {skillGroups.map((g) => (
                              <option key={g.id} value={g.id}>{g.label} ({g.codes.length})</option>
                            ))}
                          </select>
                          <select
                            value={bulkWord}
                            onChange={(e) => { const v = e.target.value; setBulkWord(v); }}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                          >
                            {SKILL_WORDS.map((w) => <option key={w} value={w}>{w}</option>)}
                            <option value="">not trained</option>
                          </select>
                          <button
                            onClick={() => {
                              const g = skillGroups.find((x) => x.id === bulkGroup) || skillGroups[0];
                              if (!g) return;
                              /* ⚠️ CLEARING IS THE ONLY ONE THAT ASKS. Setting a
                                 level over a level is a correction; wiping a
                                 section is a deletion, and the two should not
                                 feel the same to press. */
                              if (!bulkWord && !window.confirm(
                                `Clear ${g.codes.length} job${g.codes.length === 1 ? "" : "s"} for ${p.name}?`)) return;
                              setPersonSkills(p.id, g.codes, bulkWord);
                            }}
                            disabled={codeBusy}
                            className="rounded-lg px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
                            style={{ background: INK }}
                          >
                            Apply to {(skillGroups.find((x) => x.id === bulkGroup) || skillGroups[0]).codes.length}
                          </button>
                        </div>
                      ) : null}
                      {/* ★★ THE SAME TRAINING-LINE LOOK AS EVERY OTHER LIST IN
                          LINEUP. Matt, Aug 14 2026: "let's give this look an
                          upgrade all the way for each of the tabs." These rows
                          were the last plain ones left — bare text beside a grey
                          menu, twenty-four of them down a phone.
                          ⚠️ THE STRIPE IS THE SKILL, NOT THE SIDE. A leader
                          scanning this is looking for the gaps, so grey is
                          "not trained" and the colour deepens as somebody gets
                          better. Side is a word on the row; it does not need a
                          colour as well.
                          ⚠️ COLOUR NEVER CARRIES THE MEANING ALONE. The level is
                          written in the menu beside it, which is also the only
                          thing that reads on a printed page. */}
                      {(codesAll.codes.length ? codesAll.codes.map((c) => c.code) : names).map((code) => {
                        const cur = jobs[code] || "";
                        const tint = SKILL_TINT[cur] || SKILL_TINT[""];
                        return (
                          <div
                            key={code}
                            className="flex items-center gap-2 overflow-hidden rounded-lg bg-white text-sm"
                            style={{ boxShadow: CARD_3D_SOFT, backgroundImage: cardSurface(tint, 0.92) }}
                          >
                            <span className="self-stretch shrink-0" style={{ width: 4, background: tint }} />
                            <span className="min-w-0 flex-1 py-1.5 font-medium" style={{ color: INK }}>
                              {code}
                              <span className="ml-1 text-[11px] font-normal" style={{ color: GRAY }}>
                                {sideOf(code, codeIdx)}{isLeaderCode(code, codeIdx) ? " · leads" : ""}
                              </span>
                            </span>
                            <select
                              value={cur}
                              onChange={(e) => { const v = e.target.value; setPersonSkill(p.id, code, v); }}
                              className="mr-1.5 shrink-0 rounded-lg border px-2 py-1 text-xs font-semibold"
                              style={{ borderColor: cur ? tint : "#CBD5E1", color: cur ? shade(tint) : GRAY, background: "#fff" }}
                            >
                              <option value="">not trained</option>
                              {SKILL_WORDS.map((w) => <option key={w} value={w}>{w}</option>)}
                            </select>
                          </div>
                        );
                      })}
                      {!codesAll.codes.length && !names.length ? (
                        <div className="text-xs" style={{ color: GRAY }}>
                          Set up some job codes above first.
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ── school tab ─────────────────────────────────────────────────── */}
      {tab === "school" && canSeeTeam && !selected ? (
        <div className="space-y-4">
          <SchoolDates cal={school} canEdit={canEditAll} onSave={saveSchool} busy={rulesBusy} />

          <div className="rounded-xl bg-white p-4" style={toolCard(TILE)}>
            <div className="mb-2 flex items-center gap-2 font-medium text-slate-900">
              <GraduationCap className="h-4 w-4" />
              {school.title || "No school calendar set"}
            </div>
            <p className="mb-3 text-sm" style={{ color: GRAY }}>
              {/* This line used to end "School dates are not loaded yet, so nothing
                  blocks a shift from this list on its own." That is no longer true
                  and a stale note is worse than none, so it says what is true now. */}
              {schoolIds.size} on this calendar. Import the member list from the
              HotSchedules group above; set the days on the calendar at the top.
            </p>
            <div className="flex flex-wrap gap-2">
              {floorRows.filter((p) => schoolIds.has(String(p.id))).map((p) => (
                <span key={p.id} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{p.name}</span>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── minors tab ─────────────────────────────────────────────────── */}
      {tab === "minors" && canSeeTeam && !selected ? (
        <MinorRules
          rules={minorRules}
          minorIds={minorIds}
          roster={team}
          canEdit={canEditAll}
          onSave={saveMinorRules}
          busy={rulesBusy}
          myName={myName}
        />
      ) : null}

      {tab === "hours" && canSeeTeam && !selected ? (
        <StoreHours cfg={storeHours} canEdit={canEditAll} onSave={saveStoreHours} busy={rulesBusy}
          /* The station lists come from the store's own config, so the cut
             list is whatever that day of the week really runs. */
          stations={{ FOH: storeCfg("stations.FOH") || {}, BOH: storeCfg("stations.BOH") || {} }} />
      ) : null}

      {/* ── training priorities ────────────────────────────────────────────
          Same station source as the Hours tab, so the "no station by that
          name" check is against this store's real board. */}
      {tab === "training" && canSeeTeam && !selected ? (
        <TrainingPriorities cfg={training} canEdit={canEditAll} onSave={saveTraining} busy={rulesBusy}
          stations={{ FOH: storeCfg("stations.FOH") || {}, BOH: storeCfg("stations.BOH") || {} }} />
      ) : null}

      {/* ── availability list ──────────────────────────────────────────── */}
      {tab === "avail" && showList ? (
        <div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the team"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
            />
          </div>

          {leftCount > 0 ? (
            <div className="mb-3 text-xs" style={{ color: GRAY }}>
              {leftCount} {leftCount === 1 ? "person who has" : "people who have"} left the team
              {leftCount === 1 ? " is" : " are"} not shown. HR Console is where that is set.
            </div>
          ) : null}

          {notSet > 0 ? (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {notSet} {notSet === 1 ? "person has" : "people have"} no availability yet. Nobody
              gets scheduled from a blank, so these have to be filled in before the schedule can run.
            </div>
          ) : null}

          {/* ⚠️ ONE CARD PER TIER, NOT ONE CARD WITH THREE HEADINGS INSIDE IT.
              Separate cards mean a closed group is genuinely one row tall, which
              is the whole point of collapsing it. Headings inside a single card
              still leave the card the height of everything it holds. */}
          <div className="space-y-3">
            {tierGroups.map((g) => {
              const open = searching || openTiers.has(g.key);
              return (
                /* ★ EACH BAND IN ITS OWN COLOUR. Matt, Aug 14 2026: "i want
                    leaders a seperate color, ads, ond and directors one. group
                    them together." The colour is the band's, not the tile's, so
                    a leader scanning for Directors finds the amber card without
                    reading a heading. */
                <div key={g.key} className="overflow-hidden rounded-xl bg-white"
                  style={toolCard(g.tone)}>
                  <button
                    onClick={() => setOpenTiers((prev) => {
                      /* ⚠️ A NEW Set, NEVER prev.add(...). Mutating the Set in
                         state and returning it is the same object, so React
                         sees no change and the group does not open. */
                      const next = new Set(prev);
                      if (next.has(g.key)) next.delete(g.key); else next.add(g.key);
                      return next;
                    })}
                    aria-expanded={open}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <ChevronRight
                      className={"h-4 w-4 shrink-0 transition-transform " + (open ? "rotate-90" : "")}
                      style={{ color: g.tone }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900">
                        {g.label} <span className="font-normal" style={{ color: GRAY }}>({g.people.length})</span>
                      </div>
                      <div className="truncate text-xs" style={{ color: GRAY }}>{g.blurb}</div>
                    </div>
                    {/* ⚠️ THE ONE NUMBER WORTH SEEING WITH THE GROUP SHUT. A
                        person with no availability is never scheduled, so this
                        is what has to reach zero before a week can be built. */}
                    {g.missing > 0 ? (
                      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
                        {g.missing} not set
                      </span>
                    ) : g.people.length ? (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                        all set
                      </span>
                    ) : null}
                  </button>

                  {/* ★ THE SAME TRAINING LINE, ONE PER PERSON. Matt, Aug 14
                      2026: "lineup-my shifts needs the look overhaul too."
                      ⚠️ THE STRIPE IS THE ANSWER TO THIS SCREEN'S ONE QUESTION:
                      amber for somebody whose availability is still missing,
                      teal for somebody who is done, grey for somebody this tile
                      does not schedule. That is the same three-way split the
                      group header's badge counts, off the same two tests, so a
                      row and the badge above it cannot disagree (rule 8). */}
                  {open && g.people.length ? (
                    <div className="flex flex-col gap-1.5 border-t border-slate-100 p-2">
                      {g.people.map((p) => {
                        const rec = avail.people[String(p.id)];
                        const off = isOffFloor(rec, p.role);
                        const hue = off ? "#94A3B8" : rec ? TILE : "#B45309";
                        return (
                          <button
                            key={p.id}
                            onClick={() => setSelectedId(String(p.id))}
                            className="flex w-full items-stretch overflow-hidden rounded-lg bg-white text-left"
                            style={toolRow(hue)}
                          >
                            <span className="self-stretch shrink-0" style={{ width: 4, background: hue }} />
                            <span className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2">
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold text-slate-900">
                                  {p.name}
                                  {schoolIds.has(String(p.id)) ? (
                                    <GraduationCap className="ml-1 inline h-3.5 w-3.5 text-slate-400" />
                                  ) : null}
                                </span>
                                <span className="block truncate text-xs" style={{ color: rec || off ? GRAY : shade(hue) }}>
                                  {off ? "Not scheduled on the floor" : rec ? summarizeRecord(rec, days) : "Not set"}
                                </span>
                              </span>
                              <span
                                className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold"
                                style={{ color: "#fff", background: hue }}
                              >
                                {off ? "Off floor" : rec ? "Set" : "Not set"}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  {open && !g.people.length ? (
                    <div className="border-t border-slate-100 px-4 py-4 text-sm" style={{ color: GRAY }}>
                      {searching ? "Nobody in this group matches that search." : "Nobody has this role yet."}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {rows.length === 0 ? (
              <div className="rounded-xl bg-white px-4 py-6 text-sm" style={{ color: GRAY, boxShadow: CARD_3D }}>
                No one matches that search.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── one person ─────────────────────────────────────────────────── */}
      {tab === "avail" && selected ? (
        <div>
          {canSeeTeam ? (
            <button
              onClick={() => setSelectedId(null)}
              className="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
            >
              <ChevronLeft className="h-4 w-4" /> Back to the team
            </button>
          ) : null}

          <div className="overflow-hidden rounded-xl bg-white" style={toolCard(TILE)}>
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div className="font-semibold text-slate-900">{selected.name}</div>
              <div className="text-xs" style={{ color: GRAY }}>
                {draft.updatedAt
                  ? `Last set ${shortDate(draft.updatedAt)}${draft.updatedBy ? ` by ${draft.updatedBy}` : ""}`
                  : "Never set"}
              </div>
            </div>

            <div>
              {days.map((d) => {
                const choice = choiceOf(draft, d);
                const w = windowsFor(draft, d);
                const cur = w.length ? w[0] : DEFAULT_WINDOW;
                const bad = w.length && cur.end <= cur.start;
                return (
                  <div key={d} className="border-b border-slate-100 px-4 py-3 last:border-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="w-24 shrink-0 font-medium text-slate-900">{DAY_LONG[d] || d}</div>
                      <div className="flex overflow-hidden rounded-lg border border-slate-300">
                        <button onClick={() => setDay(d, "off")} className={btn(choice === "off", "bg-slate-700")}>
                          <X className="mr-1 -mt-0.5 inline h-4 w-4" />Off
                        </button>
                        <button onClick={() => setDay(d, "any")} className={"border-l border-slate-300 " + btn(choice === "any", "bg-emerald-600")}>
                          <Check className="mr-1 -mt-0.5 inline h-4 w-4" />Any time
                        </button>
                        <button onClick={() => setDay(d, "hours")} className={"border-l border-slate-300 " + btn(choice === "hours", "bg-emerald-600")}>
                          <Clock className="mr-1 -mt-0.5 inline h-4 w-4" />Hours
                        </button>
                      </div>
                    </div>

                    {choice === "" ? (
                      <div className="mt-2 text-xs text-amber-700 sm:pl-24">Not set. Pick one.</div>
                    ) : null}

                    {choice === "hours" ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm sm:pl-24">
                        <input
                          type="time"
                          value={minToInput(cur.start)}
                          onChange={(e) => { const v = e.target.value; setEdge(d, "start", v); }}
                          className="rounded-lg border border-slate-300 px-2 py-1"
                        />
                        <span style={{ color: GRAY }}>to</span>
                        <input
                          type="time"
                          value={minToInput(cur.end)}
                          onChange={(e) => { const v = e.target.value; setEdge(d, "end", v); }}
                          className="rounded-lg border border-slate-300 px-2 py-1"
                        />
                        {bad ? <span className="text-xs" style={{ color: RED }}>Ends before it starts</span> : null}
                        {!bad ? <span className="text-xs" style={{ color: GRAY }}>{fmtWindow(cur)}</span> : null}
                      </div>
                    ) : null}

                    {choice === "any" || choice === "off" ? (
                      <div className="mt-1 text-xs sm:pl-24" style={{ color: GRAY }}>{summarizeDay(draft, d)}</div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* ⚠️ NOT THE SAME AS "off every day". Somebody who is not floor
                staff is a different fact from somebody who cannot work this
                week, and storing it as six days off would lose the difference
                the moment anybody tidied their availability up. */}
            {canEditAll ? (
              <div className="border-t border-slate-200 px-4 py-3">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!draft.noSchedule}
                    onChange={(e) => { const v = e.target.checked; setDraft((p) => ({ ...p, noSchedule: v })); setDirty(true); }}
                    className="mt-0.5 rounded border-slate-300"
                  />
                  <span>
                    <span className="font-medium text-slate-700">Never put them on the schedule</span>
                    <span className="block text-xs" style={{ color: GRAY }}>
                      For office and support people who are on the roster but do not work the floor.
                      The schedule will skip them and say why.
                    </span>
                  </span>
                </label>
              </div>
            ) : null}

            <div className="border-t border-slate-200 px-4 py-3">
              <label className="mb-1 block text-sm font-medium text-slate-700">Anything we should know</label>
              <textarea
                value={draft.note}
                onChange={(e) => { const v = e.target.value; setDraft((p) => ({ ...p, note: v })); setDirty(true); }}
                rows={2}
                placeholder="School until 3 on Tuesday and Thursday"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* ── what they asked for ──────────────────────────────────────
              ⚠️ A PREFERENCE IS NOT A LIMIT AND THE HEADING SAYS SO. The
              schedule never refuses a shift over one of these; it says the
              week did not match what they asked for, and a leader decides.
              Anything stronger belongs in Minors, which is a rule.
              ⚠️ THE PANEL RENDERS OFF `PREF_FIELDS`, so adding a seventh
              number is one row in availability.js and nothing here. */}
          <div className="mt-4 rounded-xl border border-slate-200 p-4">
            <div className="font-semibold text-slate-900">What they asked for</div>
            <div className="mb-3 text-sm" style={{ color: GRAY }}>
              Leave a box empty if they have not said. These never stop a shift being
              scheduled. They show up as a note on the week so somebody can decide.
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {PREF_FIELDS.map((f) => {
                const v = (draft.prefs || {})[f.key];
                const box = v === null || v === undefined ? ""
                  : (f.kind === "dur" ? String(Number(v) / 60) : String(v));
                return (
                  <label key={f.key} className="text-sm">
                    <div className="mb-1 text-xs" style={{ color: GRAY }}>
                      {f.label}{f.kind === "dur" ? " (hours)" : ""}
                    </div>
                    <input
                      type="number" min="0" step={f.kind === "dur" ? "0.25" : "1"}
                      value={box}
                      placeholder="not set"
                      /* A leader edits anybody; everybody else only ever reaches
                          their own record, and this says so rather than
                          relying on that. */
                      disabled={!canEditAll && String(selectedId) !== myId}
                      onChange={(e) => {
                        /* Check 5: read the value out BEFORE the updater. */
                        const raw = e.target.value;
                        setDraft((d) => ({
                          ...d,
                          prefs: {
                            ...(d.prefs || {}),
                            /* ⚠️ BLANK IS null, NEVER 0. "no minimum" and "a
                               minimum of nothing" are different answers. */
                            [f.key]: raw === "" ? null
                              : (f.kind === "dur" ? Math.round(Number(raw) * 60) : Math.round(Number(raw))),
                          },
                        }));
                        setDirty(true);
                        setSavedAt("");
                      }}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={saveOne}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
              style={dirty && !saving ? { background: INK } : null}
            >
              <Save className="h-4 w-4" />{saving ? "Saving…" : "Save availability"}
            </button>
            {savedAt ? <span className="text-sm" style={{ color: GREEN }}>Saved at {savedAt}</span> : null}
            {dirty && !saving ? <span className="text-sm text-amber-700">Not saved yet</span> : null}
          </div>
        </div>
      ) : null}

      {tab === "avail" && !canSeeTeam && !selected ? (
        <div className="rounded-xl bg-white p-6 text-sm" style={{ ...toolCard(TILE), color: GRAY }}>
          We could not match your sign in to anybody on the roster, so there is nothing to show.
          Ask a director to set your availability for you.
        </div>
      ) : null}
    </div>
  );
}
