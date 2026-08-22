import React, { useState, useMemo, useRef, useEffect } from "react";
import SectionBand from "./SectionBand.jsx";
/* The one raised look and accent edge — see cardStyle.js. */
import { CARD_3D, accentEdge, cardSurface } from "./cardStyle.js";
import { Check, Plus, X, Pencil } from "lucide-react";
import { kvGet, kvGetResult, kvSet } from "./store";
import { activeDaypart } from "./dayparts.js";

// Gate City Ops Checklists — Leader / FOH / BOH daily checklists.
//
// Model: SECTION -> AREA -> items, each item { text, shift }.
// Shift used to live inside the item string ("Opener — Check catering
// orders"). It's a field now, so one area list serves all three shifts and
// the shift tabs filter it. Nothing is duplicated per shift.
//
// KV:
//   gcfcr-ops-defs-v2                — the lists (edited in-app, tier 3+)
//   gcfcr-ops-done-{YYYY-MM-DD}-v2   — today's checks { "areaId:idx": {by, at} }
// The completion key carries the date, so checks clear daily on their own.
//
// Reads gcfcr-ops-defs-v2 only. DEFAULT_DEFS below stands until someone
// edits in-app. The old Checklists.jsx tile keeps its own v1 keys and is
// unaffected — the two tiles share no storage.

const ACCENT = "#0891B2"; // cyan — the "ops board" identity (bluer than Food Safety's teal)

const SECTION_ORDER = ["FOH", "BOH"];
const SECTION_META = {
  FOH: { color: "#3F6280", label: "Front of House" },
  BOH: { color: "#8B5E34", label: "Back of House" },
};

/* ★ ALL SITS LAST (Matt, Aug 5 2026: "chcklists - i want the all at the end").
   The three real filters run in the order the day runs, and All is the escape
   hatch rather than the first thing to read past.
   ⚠️ THE DEFAULT IS PINNED BY ID, not by position — see `openingTab` below. So
   this list can be reordered freely and the tile still opens on the right tab.
   If that ever becomes SHIFTS[0], reordering silently changes what leaders see
   first. */
const SHIFTS = [
  { id: "opening", label: "Opening" },
  { id: "midday", label: "Midday" },
  { id: "closing", label: "Closing" },
  { id: "all", label: "All" },
];

/* ── WHICH TAB OPENS ─────────────────────────────────────────────────────────
   Matt, Aug 18 2026: "the ops checklists defaults to all when opening. i want
   it to default to the active daypart."

   ⚠️⚠️ THE STORE'S FOUR DAYPARTS DO NOT MATCH THIS TILE'S THREE TABS, and that
   mismatch is the whole of the work. `stations.dayparts` is Breakfast, Lunch,
   Mid and Night; the checklists run Opening, Midday and Closing. So the mapping
   is by POSITION, not by name: the store's first window is the opening one, its
   last is the closing one, and everything between is midday.

   ★ POSITION SURVIVES A CLONE, A NAME DOES NOT. A store that calls its windows
   AM / Rush / PM gets the right tab from this and would get nothing from a
   lookup keyed on "breakfast". Rule 18: the numbers and the names are theirs.

   ⚠️ IT FALLS BACK TO "all", WHICH IS EXACTLY THE OLD BEHAVIOUR. A store with
   fewer than two dayparts typed in, or a clock that answers nothing, lands on
   the tab this tile has always opened on rather than a guessed one.

   ⚠️ IT IS THE OPENING TAB, NOT A LOCK. `useState` reads it once, so a leader
   who taps All or Closing stays there for the rest of the visit. A tile that
   re-snapped to the clock mid-shift would move the list under somebody's
   finger during a rush. */
const openingTab = () => {
  const d = activeDaypart();
  if (!d || d.total < 2) return "all";
  if (d.index === 0) return "opening";
  if (d.index === d.total - 1) return "closing";
  return "midday";
};

const PREFIX_MAP = { opener: "opening", midday: "midday", closing: "closing" };
const PREFIX_RE = /^(opener|midday|closing)\s*[\u2014\u2013-]\s*/i;

// "Opener — Check catering orders" -> { text, shift }.
// Already-migrated objects pass through untouched.
/* ── DAY-SCOPED ITEMS ────────────────────────────────────────────────────
 * Some checks only belong on one weekday — the linen audit is Thursday
 * morning, against the laundry invoice. Before this, every item showed every
 * day, so a weekly check either nagged six days a week or lived nowhere.
 *
 * ★ IT REUSES THE PREFIX PARSER RATHER THAN ADDING EDITOR UI. Typing
 * "Thu — Linen: audit sent vs returned" into the existing in-app editor is all
 * it takes; the day is parsed out the same way "Opener — " already is. A new
 * field with no way to set it would need the editor changed too, and the lists
 * live in KV, so the editor is the only route in.
 * ⚠️ `day: null` means EVERY DAY — the default, so nothing existing changes.
 */
const DAY_MAP = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
const DAY_RE = /^(sun|mon|tues|tue|thurs|thur|thu|wed|fri|sat)\s*[\u2014\u2013-]\s*/i;

const parseItem = (raw) => {
  if (raw && typeof raw === "object") {
    /* ⚠️ OBJECTS GET RE-PARSED WHEN THEY CARRY NO DAY OR SHIFT YET.
       This branch used to pass objects straight through, which was fine while
       only the seeds were ever raw strings. But `addItem` stored what the
       leader typed VERBATIM and never called this function, so an item added as
       "Thu — Linen: audit" was saved with the prefix still sitting in `text` and
       no `day` at all. It then showed EVERY day with "Thu — " printed in its
       label — the documented feature above never worked from the editor, which
       is the only route in. Re-parsing here repairs the ones already stored
       instead of leaving Bri to retype them.
       ⚠️ Only fills a field that is still null, so an explicit day or shift is
       never overwritten by something that looks like a prefix. */
    let text = String(raw.text ?? "");
    let day = raw.day == null ? null : raw.day;
    let shift = raw.shift == null ? null : raw.shift;
    if (day == null) {
      const dm = text.match(DAY_RE);
      if (dm) { day = DAY_MAP[dm[1].toLowerCase()]; text = text.slice(dm[0].length); }
    }
    if (shift == null) {
      const pm = text.match(PREFIX_RE);
      if (pm) { shift = PREFIX_MAP[pm[1].toLowerCase()]; text = text.slice(pm[0].length); }
    }
    return { text, shift, time: raw.time == null ? null : raw.time, day };
  }
  let s = String(raw);
  let day = null;
  const dm = s.match(DAY_RE);
  if (dm) { day = DAY_MAP[dm[1].toLowerCase()]; s = s.slice(dm[0].length); }
  const m = s.match(PREFIX_RE);
  if (!m) return { text: s, shift: null, time: null, day };
  return { text: s.slice(m[0].length), shift: PREFIX_MAP[m[1].toLowerCase()], time: null, day };
};

const migrate = (sections) => {
  const out = {};
  Object.keys(sections).forEach((k) => {
    out[k] = (sections[k] || []).map((a) =>
      Object.assign({}, a, { items: (a.items || []).map(parseItem) })
    );
  });
  return out;
};

// FOH (from the CHUP checkpoint forms) and BOH are the real Gate City content.
const DEFAULT_DEFS = migrate({
  FOH: [
    {
      id: "foh-open",
      title: "Opening",
      items: [
        { text: "Check Catering + Prep Orders", shift: "opening", time: null },
        { text: "Prep 2 iPads / Cash", shift: "opening", time: null },
        { text: "Check: Dining Room, Restrooms", shift: "opening", time: null },
        { text: "Set-up Sheet / Break Plan Ready", shift: "opening", time: null },
        { text: "Brew Coffee", shift: "opening", time: "6:15a" },
        { text: "Change Fund / Count all Drawers (Verify $150)", shift: "opening", time: "7:00a" },
      ],
    },
    {
      id: "foh-1030",
      title: "10:30 Transition",
      items: [
        { text: "Count Cash Belts", shift: "midday", time: null },
        { text: "Stocking", shift: "midday", time: null },
        { text: "DR Clean", shift: "midday", time: null },
        { text: "Restroom Check", shift: "midday", time: null },
        { text: "Trash Change", shift: "midday", time: null },
        { text: "Coffee Pot Clean", shift: "midday", time: null },
        { text: "Parking Lot Sweep", shift: "midday", time: null },
      ],
    },
    {
      id: "foh-2pm",
      title: "2pm Transition",
      items: [
        { text: "Count all Drawers / Cash Belts", shift: "midday", time: null },
        { text: "Sweep + Mop (Under the Drink Station)", shift: "midday", time: null },
        { text: "Inspect Dining Room / Windows / Restroom", shift: "midday", time: null },
        { text: "Stock + Clean all FOH areas", shift: "midday", time: null },
        { text: "Update SOS Tracker", shift: "midday", time: null },
        { text: "Trash / Parking Lot Sweep", shift: "midday", time: null },
        { text: "Attendance / Cash O/S Log", shift: "midday", time: null },
        { text: "Team Member Break Room Bathroom", shift: "midday", time: null },
        { text: "Empty MopIt", shift: "midday", time: null },
      ],
    },
    {
      id: "foh-5pm",
      title: "5pm Transition",
      items: [
        { text: "Sweep + Mop (Behind the Drink Station)", shift: "midday", time: null },
        { text: "Refill Lemonade / Tea / Ice", shift: "midday", time: null },
        { text: "Clean and Stock Dessert Station", shift: "midday", time: null },
        { text: "Stock all Sauces", shift: "midday", time: null },
        { text: "Stock Cold Holding Coolers (Drinks, Salads, Desserts)", shift: "midday", time: null },
        { text: "Trash / Parking Lot", shift: "midday", time: null },
        { text: "Update Speed of Service Tracker", shift: "midday", time: null },
        { text: "Break Down Coffee", shift: "midday", time: null },
        { text: "Count all Drawers / Cash Belts", shift: "midday", time: null },
        { text: "Team Member Break Room Cleaned", shift: "midday", time: null },
        { text: "Empty / Refill MopIt", shift: "midday", time: null },
        { text: "Count Change Fund", shift: "midday", time: null },
      ],
    },
    {
      id: "foh-preclose-mod",
      title: "Pre-Close \u00b7 MOD",
      items: [
        { text: "Front of House Lemonade and Tea", shift: "closing", time: "7:00p" },
        { text: "Front Counter Drink Towers", shift: "closing", time: "7:15p" },
        { text: "Stock Cold Holding / Dessert Fridges", shift: "closing", time: "7:30p" },
        { text: "Break Down Brew Station 1", shift: "closing", time: "7:45p" },
        { text: "Sweep and Scrub Behind Coolers and Sauce Station", shift: "closing", time: "8:40p" },
      ],
    },
    {
      id: "foh-preclose-dt",
      title: "Pre-Close \u00b7 DT",
      items: [
        { text: "Sweep Parking Lot", shift: "closing", time: "7:30p" },
        { text: "Stock All Condiments and Dressings", shift: "closing", time: "7:50p" },
        { text: "Clean desserts, drinks, lemonade holding fridge, personal fridge (by ice machine)", shift: "closing", time: "8:00p" },
        { text: "Break Down Coffee Base in Drive Thru", shift: "closing", time: "8:15p" },
        { text: "Break Down Top Sandwich Chute", shift: "closing", time: "8:20p" },
        { text: "Stock Dessert Station (Cooler, Cones, Puree, Lids, Cups)", shift: "closing", time: "8:30p" },
      ],
    },
    {
      id: "foh-wt-dt",
      title: "Walk-Thru \u00b7 Drive Thru",
      items: [
        { text: "Ice Dream Machine Clean", shift: "closing", time: null },
        { text: "29 Ice Dream Pieces", shift: "closing", time: null },
        { text: "Lemonade Machine", shift: "closing", time: null },
        { text: "Drink Station Shelves and Counters Clean", shift: "closing", time: null },
        { text: "Chutes Clean", shift: "closing", time: null },
        { text: "Drive Thru Counters and Fridges Clean", shift: "closing", time: null },
        { text: "Dessert Cooler Stocked", shift: "closing", time: null },
        { text: "Sauce and Toppings Stocked", shift: "closing", time: null },
        { text: "All Equipment Inside", shift: "closing", time: null },
        { text: "All Equipment Plugged In and Charging", shift: "closing", time: null },
        { text: "Lemonades / Coffee Cleaned", shift: "closing", time: null },
        { text: "Tea Shelf / Urns Cleaned", shift: "closing", time: null },
        { text: "Cups / Lids Stocked", shift: "closing", time: null },
        { text: "Counter Cleaned", shift: "closing", time: null },
      ],
    },
    {
      id: "foh-wt-fc",
      title: "Walk-Thru \u00b7 Front Counter",
      items: [
        { text: "Counters Clean", shift: "closing", time: null },
        { text: "Register Screens Clean", shift: "closing", time: null },
        { text: "Coolers and Doors Clean", shift: "closing", time: null },
        { text: "Drink Towers Clean", shift: "closing", time: null },
        { text: "Daily Deep Clean", shift: "closing", time: null },
        { text: "Cleaning Supplies Stored Below Counters", shift: "closing", time: null },
        { text: "Floors and Drains Clean", shift: "closing", time: null },
        { text: "Dust Pans Sprayed Out", shift: "closing", time: null },
        { text: "Deep Cleaning Task Completed", shift: "closing", time: null },
      ],
    },
    {
      id: "foh-wt-bath",
      title: "Walk-Thru \u00b7 Bathrooms",
      items: [
        { text: "Stocked", shift: "closing", time: null },
        { text: "Mopped", shift: "closing", time: null },
        { text: "Mirrors Clean", shift: "closing", time: null },
      ],
    },
    {
      id: "foh-wt-break",
      title: "Walk-Thru \u00b7 Break Room",
      items: [
        { text: "Floors Cleaned and Mopped", shift: "closing", time: null },
        { text: "All Counters Clean", shift: "closing", time: null },
        { text: "Bathroom Clean", shift: "closing", time: null },
        { text: "All Trash Cans Empty and Clean", shift: "closing", time: null },
      ],
    },
    {
      id: "foh-wt-dr",
      title: "Walk-Thru \u00b7 Dining Room",
      items: [
        { text: "Floor Clean / Mopped", shift: "closing", time: null },
        { text: "Under Tables Swept", shift: "closing", time: null },
        { text: "Trash Emptied", shift: "closing", time: null },
        { text: "Double Door Glass Clean", shift: "closing", time: null },
        { text: "Dining Room Checklist for 7pm / 10pm", shift: "closing", time: null },
        { text: "Green MopIt Emptied", shift: "closing", time: null },
      ],
    },
    {
      id: "foh-wt-outside",
      title: "Walk-Thru \u00b7 Outside",
      items: [
        { text: "Patio Tables", shift: "closing", time: null },
        { text: "Patio Trash", shift: "closing", time: null },
        { text: "All Radios / Equipment Inside", shift: "closing", time: null },
      ],
    },
  ],
  BOH: [
    {
      id: "boh-leader",
      title: "Leader",
      items: [
        /* Chloe J., Jul 30 2026 (photos in Slack): six opener items removed —
           "we either don't do anymore or are foh on the opening checklist".
           Cut here: bulk prep report + truck invoices printout, freezer
           inventory. The other four are in Prep, Machines and Utility below.
           The bulk prep report is gone entirely, so every line that said
           "refer to the bulk prep report" went with it. */
        "Opener — Check catering orders",
        "Opener — Check and turn on the equipment (stagger the cookers)",
        "Opener — Check for the chicken pull and milk wash",
        "Opener — Setups (DT plans)",
        "Opener — Check all paper towels, soap and hand sinks",
        "Opener — Fill the dish sinks and sanitizer sinks",
        "Opener — Check off the truck",
        "Opener — Turn on all lean iPads",
        "Opener — Check labels, temps and timers",
        "Opener — Verify opener duties are complete",
        "Opener — Check for the SAFE daily and ERQA (if breakfast or lunch)",
        "Midday — Timers and temps and labels",
        "Midday — Check paper towels, soap and hand sinks",
        "Midday — Check out each leaving position (refer to their lists)",
        "Midday — Verify if the SAFE daily or ERQA were done",
        "Midday — Communicate needs with shift change leaders",
        "Closing — Role clarity",
        "Closing — Check paper towels, soap and hand sinks",
        "Closing — Check if centerline is setup and restocked",
        "Closing — Check if all dishes are put away",
        "Closing — Check if dishpit area is clear and clean",
        "Closing — Check all trash cans and trash boat for cleanliness",
        "Closing — Checkout each area according to their lists",
        "Closing — Make sure all equipment is turned off",
        "Closing — Walkthrough, towels, brooms and mops, everything in its home",
      ],
    },
    {
      id: "boh-primary",
      title: "Primary",
      items: [
        "Opener — Set up the centerline (hot pans, cold pans, merco warmers and utensils)",
        "Opener — Check all paper good stocking",
        "Opener — Check for cheese containers (labeled)",
        "Opener — Check the fry freezer (full of fries and 2 hashbrowns)",
        "Opener — Bring up the first stack of bread (check dates)",
        "Midday — Check all paper good stocking",
        "Midday — Check for cheese containers (labeled)",
        "Midday — Check the fry freezer (full of fries)",
        "Midday — Check bread stock (check dates)",
        "Midday — Utensil change",
        "Midday — Maintain your area cleanliness (walls, floors and trash)",
        "Closing — Check all paper good stocking",
        "Closing — Check for cheese containers (labeled)",
        "Closing — Check the fry freezer (full of fries)",
        "Closing — 1 full breadrack",
        "Closing — Clean foil wrap shelf",
        "Closing — Clean monitors, inside the wall of foil bag holders, and where large fry paper goods are kept",
        "Closing — Maintain your area cleanliness top to bottom (food surfaces, equipment, walls, floors and trash)",
        "Closing — Return all dishes",
      ],
    },
    {
      id: "boh-secondary",
      title: "Secondary",
      items: [
        "Midday — Check all paper good stocking",
        "Midday — Check for cheese containers (labeled)",
        "Midday — Check the fry freezer (full of fries)",
        "Midday — Check multigrain buns (check dates)",
        "Midday — Utensil change",
        "Midday — Maintain your area cleanliness (walls, floors and trash)",
        "Closing — Check all paper good stocking",
        "Closing — Check for cheese containers (labeled)",
        "Closing — Check the fry freezer (full of fries)",
        "Closing — 1 tray of multigrain buns (check dates)",
        "Closing — Maintain your area cleanliness top to bottom (food surfaces, equipment, walls, floors and trash)",
        "Closing — Return all dishes",
      ],
    },
    {
      id: "boh-prep",
      title: "Prep",
      items: [
        "Opener — Biscuits (lean)",
        "Opener — Cookies (lean)",
        "Opener — Fruit and yogurt (lean)",
        "Opener — Cook minis and eggs (lean)",
        "Midday — Check if there is enough bulk prep for the night shift (don't over prep)",
        "Midday — Using the lean prep iPad, verify that all kanbans are full (check labels)",
        "Midday — Check temps (have a leader verify)",
        "Midday — Check tomato slicer and lettuce spinner cleanliness (have a leader verify)",
        "Midday — Utensil change",
        "Midday — Maintain your area cleanliness (walls, floors and trash)",
        "Closing — Prep person starts with dishes and floors 1 hr before close",
        "Closing — Check if there is no more than 1 kanban of each product (goal is almost none)",
        "Closing — Check tomato slicer and lettuce spinner cleanliness (have a leader verify)",
        "Closing — Have all utensils ready for the next day",
        "Closing — Maintain your area cleanliness top to bottom (coolers inside and out, walls, floors and trash)",
        "Closing — Return your area dishes",
      ],
    },
    {
      id: "boh-breading",
      title: "Breading",
      items: [
        "Opener — Set up the breading table",
        "Opener — Check for chicken pull and milk wash",
        "Opener — Filet chicken",
        "Midday — Check for chicken pull and milk wash",
        "Midday — Filet chicken",
        "Midday — Maintain your area cleanliness (walls, floors and trash)",
        "Closing — Note: breading table does not get broken down until after closing",
        "Closing — Check for chicken pull and milk wash",
        "Closing — Chicken replaced and wrapped",
        "Closing — Maintain your area cleanliness top to bottom (thaw cabinets, low boy, inside the breading table, walls, floors and trash)",
        "Closing — Return your area dishes",
      ],
    },
    {
      id: "boh-machines",
      title: "Machines",
      items: [
        /* The OPENER filter scrape is gone (Chloe, Jul 30). The MIDDAY one
           stays — she highlighted only the opener copy. */
        "Opener — Set up all chicken pans and baskets",
        "Midday — Scrape and clean all filters (turn on machines one at a time as cleaned)",
        "Midday — Thorough clean all cookers",
        "Midday — Send back 2 baskets at a time for cleaning (ask dish person to return after drying)",
        "Midday — Maintain your area cleanliness (walls, floors and trash)",
        "Closing — Thorough clean all cookers (inside and outside)",
        "Closing — Maintain your area cleanliness top to bottom (walls, top of the hoods, floors and trash)",
        "Closing — Return all dishes",
      ],
    },
    {
      id: "boh-utility",
      title: "Utility, Dishes & Trash",
      items: [
        "Opener — Put away truck inventory (neatly organize and cut open boxes for first in use)",
        "Opener — Verify everything on the list is checked off with the leader",
        "Midday — All dishes clean and dry",
        "Midday — Return all dry dishes",
        "Midday — Clean and refill all sinks",
        "Midday — Maintain your area cleanliness (walls, floors, mop sink, dishracks and trash)",
        "Closing — All dishes clean and dry, returned",
        "Closing — Clean and refill all sinks",
        "Closing — Make sure all boxes are clear",
        "Closing — Empty all trash cans, clean inside/outside/bottom (spray out and air dry for the night)",
        "Closing — Make sure the trash boat and dumpster pad are clean (no trash on the ground)",
        "Closing — Help finish floors and return dishes",
        "Closing — Make sure the mop buckets are empty and the mops are drying",
      ],
    },
  ],
});

const DEFS_KEY = "gcfcr-ops-defs-v2";
// Self-stamp for the Input Health register: last day ANY checklist item
// was checked, so the register can say "nothing since Jul 20" instead of
// only "nothing today". Written only when at least one item is checked.
const STAMP_KEY = "gcfcr-ops-stamp-v1";
/* 🐛 WAS toISOString().slice(0,10) — that is UTC, and Eastern runs 4-5 hours
   behind it. From 8 PM to midnight, UTC is already TOMORROW, so a closer
   checking off closing items was writing them onto the NEXT day's list: tonight
   showed items still unchecked, and tomorrow opened with closing work already
   "done" before the store unlocked. en-CA formats the DEVICE's own date as
   YYYY-MM-DD — the store's devices run Eastern. */
const todayStr = () => new Date().toLocaleDateString("en-CA");

const shortName = (user) => {
  const n = ((user && (user.name || user.firstName)) || "").trim();
  if (!n) return "";
  const p = n.split(/\s+/);
  return p.length === 1 ? p[0] : p[0] + " " + p[p.length - 1][0] + ".";
};

const timeOf = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch (e) {
    return "";
  }
};

const inputStyle = {
  flex: 1,
  minWidth: 0,
  fontSize: 14,
  padding: "8px 10px",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  outline: "none",
  fontFamily: "inherit",
  color: "#1F2937",
};

function ProgressBar({ pct, color }) {
  return (
    <div style={{ height: 6, borderRadius: 4, background: "#E5E7EB", overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          width: pct + "%",
          background: color,
          borderRadius: 4,
          transition: "width 200ms ease",
        }}
      />
    </div>
  );
}

export default function OpsChecklists({ tier, user }) {
  const canEdit = typeof tier !== "number" || tier >= 3;

  const [defs, setDefs] = useState(DEFAULT_DEFS);
  const [defsLoaded, setDefsLoaded] = useState(false);
  const [done, setDone] = useState({});
  const [doneLoaded, setDoneLoaded] = useState(false);
  const [section, setSection] = useState("FOH");
  /* ⚠️ THE INITIALISER IS A FUNCTION, NOT A CALL. `useState(openingTab())` would
     re-read the clock on every single render and throw the result away; passing
     the function means React calls it exactly once, on mount. */
  const [shift, setShift] = useState(openingTab);
  const [editMode, setEditMode] = useState(false);
  const [draftText, setDraftText] = useState({});
  const [newAreaTitle, setNewAreaTitle] = useState("");
  const [saveStatus, setSaveStatus] = useState("idle");
  /* Says on screen when what you are looking at is NOT the saved list. An
     empty checklist and an unreachable one look identical otherwise, and the
     difference decides whether ticking a box is safe. */
  const [loadWarn, setLoadWarn] = useState("");

  const defsSkipSave = useRef(true);
  const doneSkipSave = useRef(true);
  /* ⚠️ PERSISTENT, unlike the one-shot skip above it. The skip flag is
     consumed by the FIRST state change after hydration — but when the
     checkmark read FAILS, nothing calls setDone, so the leader's first manual
     tick ate the skip and the SECOND tick saved {} + two ticks over the day's
     real record. This ref stays true until a reload, so no number of ticks
     can fire the autosave off an unloaded day. */
  const doneReadFailed = useRef(false);
  const defsSaveTimer = useRef(null);
  const doneSaveTimer = useRef(null);
  const dayKey = useRef(todayStr());

  useEffect(() => {
    (async () => {
      try {
        const rec = await kvGetResult(DEFS_KEY);
        if (rec.ok && rec.value && rec.value.sections) {
          setDefs(migrate(rec.value.sections));
        } else if (rec.ok) {
          /* ★ SEED KV ON FIRST RUN — this is what makes the nightly Slack
             recap possible at all.
             🐛 `gcfcr-ops-defs-v2` has NEVER existed in the database (verified
             by query Jul 31 2026). The checklists live in DEFAULT_DEFS in this
             file, and KV was only ever written when somebody EDITED a list. So
             the Worker's runOpsChecklistRecap, which reads that key, found
             nothing every single night and returned
             {skipped: "no checklist definitions"} — the job has never once
             posted. Writing the seed on a successful empty read gives the
             Worker something to read, exactly as TrainerTasks does with its
             roster.
             ⚠️ Only on rec.ok. Seeding after a FAILED read is the bug that
             just wiped the trainer roster; a dropped read must never write. */
          try { await kvSet(DEFS_KEY, { sections: defs, updatedAt: new Date().toISOString() }); } catch { /* best effort */ }
        } else {
          setLoadWarn("Couldn't load the saved checklists, so these are the defaults. Nothing was changed.");
        }
      } catch (e) {
        // DEFAULT_DEFS stands
      } finally {
        defsSkipSave.current = true;
        setDefsLoaded(true);
      }
      try {
        /* 🐛 `kvGet` returns null for a FAILED read as well as an empty one, so
           a dropped read blanked every tick on screen. The leader re-ticked,
           the autosave below fired, and the day's real record became whatever
           they had just re-done. This is a mid-shift tool, so that is a live
           data-loss path, not a theoretical one. */
        const d = await kvGetResult("gcfcr-ops-done-" + dayKey.current + "-v2");
        if (!d.ok) {
          doneReadFailed.current = true;   // permanent for this mount — see the ref
          setLoadWarn("Couldn't load today's checkmarks. Reload before ticking anything — what you see is not the saved list.");
          return;
        }
        setDone((d.value && d.value.checked) || {});
      } catch (e) {
        setDone({});
      } finally {
        doneSkipSave.current = true;
        setDoneLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (defsSkipSave.current) {
      defsSkipSave.current = false;
      return;
    }
    if (!defsLoaded) return;
    clearTimeout(defsSaveTimer.current);
    setSaveStatus("saving");
    defsSaveTimer.current = setTimeout(async () => {
      try {
        // kvSet returns false, never throws — the old catch was unreachable.
        const ok = await kvSet(DEFS_KEY, { sections: defs, updatedAt: new Date().toISOString() });
        setSaveStatus(ok ? "saved" : "idle");
        if (!ok) setLoadWarn("List edit didn't save — check the wifi and try the change again.");
      } catch (e) {
        setSaveStatus("idle");
      }
    }, 600);
    return () => clearTimeout(defsSaveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defs]);

  useEffect(() => {
    if (doneReadFailed.current) return;   // never consumed — every tick refuses
    if (doneSkipSave.current) {
      doneSkipSave.current = false;
      return;
    }
    if (!doneLoaded) return;
    clearTimeout(doneSaveTimer.current);
    doneSaveTimer.current = setTimeout(async () => {
      try {
        // kvSet returns false on a refused write, never throws. Unchecked,
        // a failed save still fired the Input Health stamp below — a sign-off
        // recorded over ticks that never persisted, the false-green class.
        const ok = await kvSet("gcfcr-ops-done-" + dayKey.current + "-v2", {
          checked: done,
          updatedAt: new Date().toISOString(),
        });
        if (!ok) {
          setLoadWarn("That didn't save — your ticks are on screen but not recorded. Check the wifi and tick again.");
          return;
        }
        // Self-stamp for the Input Health register. Only when something is
        // actually checked — unchecking everything must not read as a
        // sign-off. Fire-and-forget: a failed stamp can't affect saving.
        const n = Object.keys(done).length;
        if (n > 0) {
          kvSet(STAMP_KEY, { at: new Date().toISOString(), iso: dayKey.current, count: n }).catch(() => {});
        }
      } catch (e) {
        // best effort
      }
    }, 500);
    return () => clearTimeout(doneSaveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const toggleItem = (areaId, idx) => {
    const key = areaId + ":" + idx;
    setDone((prev) => {
      const next = Object.assign({}, prev);
      if (next[key]) delete next[key];
      else next[key] = { by: shortName(user), at: new Date().toISOString() };
      return next;
    });
  };

  const addItem = (areaId) => {
    const text = (draftText[areaId] || "").trim();
    if (!text) return;
    /* ★★ PARSE WHAT WAS TYPED. This used to store the raw string as
       { text, shift, time } with no `day` key at all, so the "Thu — " and
       "Opener — " prefixes documented at the top of this file did nothing when
       used from the editor: the item showed every day with the prefix printed
       in its label. The day filter in the render reads a field nothing wrote.
       The shift dropdown still wins when it is set to something other than All,
       so picking a shift and typing a prefix does not fight. */
    const parsed = parseItem(text);
    const item = {
      text: parsed.text,
      shift: shift === "all" ? parsed.shift : shift,
      time: parsed.time,
      day: parsed.day,
    };
    setDefs((prev) =>
      Object.assign({}, prev, {
        [section]: prev[section].map((a) =>
          a.id === areaId
            ? Object.assign({}, a, { items: a.items.concat([item]) })
            : a
        ),
      })
    );
    setDraftText((prev) => Object.assign({}, prev, { [areaId]: "" }));
  };

  // Drops the item and shifts later indices down so today's checks stay on
  // the right rows.
  const removeItem = (areaId, idx) => {
    setDefs((prev) =>
      Object.assign({}, prev, {
        [section]: prev[section].map((a) =>
          a.id === areaId
            ? Object.assign({}, a, { items: a.items.filter((_, i) => i !== idx) })
            : a
        ),
      })
    );
    setDone((prev) => {
      const next = {};
      Object.keys(prev).forEach((key) => {
        const cut = key.lastIndexOf(":");
        const aid = key.slice(0, cut);
        const i = parseInt(key.slice(cut + 1), 10);
        if (aid !== areaId) {
          next[key] = prev[key];
          return;
        }
        if (i === idx) return;
        next[aid + ":" + (i > idx ? i - 1 : i)] = prev[key];
      });
      return next;
    });
  };

  const setItemShift = (areaId, idx, value) => {
    setDefs((prev) =>
      Object.assign({}, prev, {
        [section]: prev[section].map((a) =>
          a.id === areaId
            ? Object.assign({}, a, {
                items: a.items.map((it, i) =>
                  i === idx ? Object.assign({}, it, { shift: value || null }) : it
                ),
              })
            : a
        ),
      })
    );
  };

  const setItemText = (areaId, idx, value) => {
    setDefs((prev) =>
      Object.assign({}, prev, {
        [section]: prev[section].map((a) =>
          a.id === areaId
            ? Object.assign({}, a, {
                items: a.items.map((it, i) =>
                  i === idx ? Object.assign({}, it, { text: value }) : it
                ),
              })
            : a
        ),
      })
    );
  };

  const setAreaTitle = (areaId, value) => {
    setDefs((prev) =>
      Object.assign({}, prev, {
        [section]: prev[section].map((a) =>
          a.id === areaId ? Object.assign({}, a, { title: value }) : a
        ),
      })
    );
  };

  const setItemTime = (areaId, idx, value) => {
    setDefs((prev) =>
      Object.assign({}, prev, {
        [section]: prev[section].map((a) =>
          a.id === areaId
            ? Object.assign({}, a, {
                items: a.items.map((it, i) =>
                  i === idx
                    ? Object.assign({}, it, { time: (value || "").trim() || null })
                    : it
                ),
              })
            : a
        ),
      })
    );
  };

  const addArea = () => {
    const title = newAreaTitle.trim();
    if (!title) return;
    setDefs((prev) =>
      Object.assign({}, prev, {
        [section]: prev[section].concat([
          { id: section.toLowerCase() + "-" + Date.now(), title, items: [] },
        ]),
      })
    );
    setNewAreaTitle("");
  };

  const deleteArea = (areaId) => {
    setDefs((prev) =>
      Object.assign({}, prev, {
        [section]: prev[section].filter((a) => a.id !== areaId),
      })
    );
  };

  const meta = SECTION_META[section];
  const areas = defs[section] || [];

  // Keep the true array index alongside each visible row — filtering by
  // shift must not re-index the completion keys.
  const view = useMemo(
    () =>
      areas
        .map((a) => ({
          area: a,
          rows: a.items
            .map((it, idx) => ({ it, idx }))
            /* ⚠️ Day filter first: an item scoped to another weekday is not on
               today's list at all, whichever shift tab is showing. */
            .filter((r) => r.it.day == null || r.it.day === new Date().getDay())
            .filter((r) => shift === "all" || r.it.shift === shift),
        }))
        .filter((v) => editMode || v.rows.length > 0),
    [areas, shift, editMode]
  );

  return (
    <div
      style={{
        maxWidth: 1040,
        margin: "0 auto",
        padding: "0 20px 48px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: "#1F2937",
        minHeight: "100vh",
        background: "#F2F8FA",
      }}
    >
      <style>{`.oc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:12px;align-items:start;}`}</style>

      {/* Masthead — the ops board */}
      <div style={{ margin: "0 -20px 16px", background: "linear-gradient(120deg,#0891B2 0%,#0E7490 55%)", color: "#fff", padding: "18px 20px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, letterSpacing: "0.16em", color: "#BFEAF5", fontWeight: 600, marginBottom: 6 }}>DAILY OPERATIONS</div>
            <h1 style={{ fontSize: 25, fontWeight: 800, margin: "0 0 5px", lineHeight: 1.1 }}>Ops Checklists</h1>
            <p style={{ fontSize: 13.5, color: "rgba(255,255,255,.75)", margin: 0 }}>Checks reset every day and record who and when.</p>
          </div>
          {canEdit && (
            <button
              onClick={() => setEditMode((v) => !v)}
              style={{
                flex: "0 0 auto", display: "flex", alignItems: "center", gap: 6,
                padding: "8px 13px", borderRadius: 9,
                border: "1px solid rgba(255,255,255,.35)",
                background: editMode ? "#fff" : "rgba(255,255,255,.1)",
                color: editMode ? "#0E7490" : "#fff",
                fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 36,
              }}
            >
              <Pencil size={14} />
              {editMode ? "Done" : "Edit"}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        {SECTION_ORDER.map((key) => {
          const m = SECTION_META[key];
          const active = key === section;
          return (
            <button
              key={key}
              onClick={() => setSection(key)}
              style={{
                flex: "1 1 calc(33% - 6px)",
                minWidth: 100,
                padding: "10px 8px",
                borderRadius: 10,
                border: "1px solid " + (active ? m.color : "#E5E7EB"),
                background: active ? m.color : "#fff",
                color: active ? "#fff" : "#1F2937",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                minHeight: 40,
              }}
            >
              {key}
              <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.85 }}>{m.label}</div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {SHIFTS.map((s) => {
          const active = s.id === shift;
          return (
            <button
              key={s.id}
              onClick={() => setShift(s.id)}
              style={{
                flex: 1,
                padding: "8px 4px",
                borderRadius: 8,
                border: "1px solid " + (active ? meta.color : "#E5E7EB"),
                background: active ? "#F3F4F6" : "#fff",
                color: "#1F2937",
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                cursor: "pointer",
                minHeight: 36,
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* A failed load must be LOUD. Missing and unreachable look identical on
          a checklist, and only one of them makes ticking a box safe. */}
      {loadWarn && (
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#92400E", background: "#FEF3C7",
                      border: "1px solid #F59E0B", borderRadius: 10, padding: "9px 12px", marginBottom: 12 }}>
          {loadWarn}
        </div>
      )}

      {editMode && (
        <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 12 }}>
          Editing {meta.label} — changes save automatically.
          {saveStatus === "saving" ? " Saving…" : saveStatus === "saved" ? " Saved." : ""}
        </div>
      )}

      <div className="oc-grid">
        {view.map(({ area, rows }) => {
          const total = rows.length;
          const doneCount = rows.reduce(
            (acc, r) => acc + (done[area.id + ":" + r.idx] ? 1 : 0),
            0
          );
          const pct = total ? Math.round((doneCount / total) * 100) : 0;
          return (
            <div
              key={area.id}
              style={{
                background: cardSurface(),
                border: "1px solid #E5E7EB",
                /* The rail was already here on the left; the top makes the
                   corner read as lit rather than as a stripe down one side —
                   same treatment as every tool tile. */
                ...accentEdge(meta.color, 3),
                borderRadius: 12,
                padding: "14px 16px",
                boxShadow: CARD_3D,
              }}
            >
              {/* ⭐ THE SHARED BAND, NOT A BOLD SPAN. Matt, Aug 20 2026: "the
                  title rows for each block can be enhanced." It was a 15px bold
                  word and a grey fraction, on a card that already carried a
                  coloured rail the title made no use of.
                  ⚠️ THE COUNT KEEPS ITS OWN CHIP through `right`, because
                  "4/11" is a fraction and the band's default chip is a total.
                  It goes green when the block is finished, which is the one
                  thing a leader walking past wants to see. */}
              <SectionBand
                label={area.title}
                color={meta.color}
                right={
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 800, letterSpacing: ".03em",
                      fontVariantNumeric: "tabular-nums", padding: "2px 9px", borderRadius: 999,
                      color: total > 0 && doneCount === total ? "#fff" : "#6B7280",
                      background: total > 0 && doneCount === total ? "#3F8F5F" : "#fff",
                      border: `1px solid ${total > 0 && doneCount === total ? "#3F8F5F" : "#E5E7EB"}`,
                      whiteSpace: "nowrap",
                    }}>
                      {doneCount}/{total}
                    </span>
                  {editMode && (
                    <button
                      onClick={() => deleteArea(area.id)}
                      aria-label="Delete area"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        border: "1px solid #FCA5A5",
                        background: "#fff",
                        color: "#DC2626",
                        cursor: "pointer",
                      }}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                }
              />

              <div style={{ marginBottom: 10 }}>
                <ProgressBar pct={pct} color={meta.color} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rows.map(({ it, idx }) => {
                  const key = area.id + ":" + idx;
                  const rec = done[key];
                  const isChecked = !!rec;
                  return (
                    <div key={key} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      {!editMode && (
                        <button
                          onClick={() => toggleItem(area.id, idx)}
                          aria-pressed={isChecked}
                          aria-label={it.text}
                          style={{
                            flex: "0 0 auto",
                            width: 34,
                            height: 34,
                            borderRadius: 8,
                            border: "2px solid " + meta.color,
                            background: isChecked ? meta.color : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                          }}
                        >
                          {isChecked && <Check size={19} color="#fff" strokeWidth={3} />}
                        </button>
                      )}
                      <span style={{ flex: 1, paddingTop: editMode ? 0 : 5 }}>
                        {it.time && !editMode && (
                          <span
                            style={{
                              display: "inline-block",
                              fontSize: 11,
                              fontWeight: 700,
                              color: meta.color,
                              background: meta.color + "14",
                              borderRadius: 5,
                              padding: "1px 6px",
                              marginRight: 7,
                              whiteSpace: "nowrap",
                              verticalAlign: "1px",
                            }}
                          >
                            {it.time}
                          </span>
                        )}
                        {editMode ? (
                          <input
                            value={it.text}
                            onChange={(e) => setItemText(area.id, idx, e.target.value)}
                            placeholder="Item text…"
                            style={{
                              width: "100%",
                              fontSize: 14.5,
                              lineHeight: 1.4,
                              color: "#1F2937",
                              padding: "4px 6px",
                              borderRadius: 6,
                              border: "1px solid #E5E7EB",
                              background: "#fff",
                              fontFamily: "inherit",
                              boxSizing: "border-box",
                            }}
                          />
                        ) : (
                          <span
                            style={{
                              fontSize: 14.5,
                              lineHeight: 1.4,
                              color: isChecked && !editMode ? "#9CA3AF" : "#1F2937",
                              textDecoration: isChecked && !editMode ? "line-through" : "none",
                            }}
                          >
                            {it.text}
                          </span>
                        )}
                        {shift === "all" && it.shift && !editMode && (
                          <span
                            style={{
                              fontSize: 10,
                              color: "#9CA3AF",
                              marginLeft: 6,
                              textTransform: "uppercase",
                              letterSpacing: 0.5,
                            }}
                          >
                            {it.shift}
                          </span>
                        )}
                        {isChecked && rec.by && !editMode && (
                          <span
                            style={{
                              display: "block",
                              fontSize: 11,
                              color: "#9CA3AF",
                              marginTop: 2,
                            }}
                          >
                            {rec.by} · {timeOf(rec.at)}
                          </span>
                        )}
                      </span>
                      {editMode && (
                        <>
                          <input
                            value={it.time || ""}
                            onChange={(e) => setItemTime(area.id, idx, e.target.value)}
                            placeholder="time"
                            style={{
                              flex: "0 0 auto",
                              width: 54,
                              fontSize: 12,
                              padding: "4px 6px",
                              borderRadius: 6,
                              border: "1px solid #E5E7EB",
                              background: "#fff",
                              color: "#1F2937",
                              fontFamily: "inherit",
                            }}
                          />
                          <select
                            value={it.shift || ""}
                            onChange={(e) => setItemShift(area.id, idx, e.target.value)}
                            style={{
                              flex: "0 0 auto",
                              fontSize: 12,
                              padding: "4px 6px",
                              borderRadius: 6,
                              border: "1px solid #E5E7EB",
                              background: "#fff",
                              color: "#1F2937",
                            }}
                          >
                            <option value="">Any</option>
                            <option value="opening">Opening</option>
                            <option value="midday">Midday</option>
                            <option value="closing">Closing</option>
                          </select>
                          <button
                            onClick={() => removeItem(area.id, idx)}
                            aria-label="Remove item"
                            style={{
                              flex: "0 0 auto",
                              width: 26,
                              height: 26,
                              borderRadius: 6,
                              border: "1px solid #FCA5A5",
                              background: "#fff",
                              color: "#DC2626",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <X size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {editMode && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <input
                    value={draftText[area.id] || ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDraftText((prev) =>
                        Object.assign({}, prev, { [area.id]: v })
                      );
                    }
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addItem(area.id);
                    }}
                    placeholder={shift === "all" ? "Add item…" : "Add " + shift + " item…"}
                    style={inputStyle}
                  />
                  <button
                    onClick={() => addItem(area.id)}
                    style={{
                      flex: "0 0 auto",
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid " + meta.color,
                      background: meta.color,
                      color: "#fff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {view.length === 0 && (
          <div
            style={{ fontSize: 14, color: "#9CA3AF", textAlign: "center", padding: "24px 0" }}
          >
            Nothing on the {meta.label} {shift === "all" ? "" : shift + " "}list.
          </div>
        )}
      </div>

      {editMode && (
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 16,
            background: "#fff",
            border: "1px dashed #E5E7EB",
            borderRadius: 12,
            padding: "12px 14px",
          }}
        >
          <input
            value={newAreaTitle}
            onChange={(e) => setNewAreaTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addArea();
            }}
            placeholder={"New " + meta.label + " area…"}
            style={inputStyle}
          />
          <button
            onClick={addArea}
            style={{
              flex: "0 0 auto",
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid " + ACCENT,
              background: ACCENT,
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <Plus size={14} />
            Area
          </button>
        </div>
      )}
    </div>
  );
}
