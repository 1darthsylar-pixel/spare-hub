/* ══════════════════════════════════════════════════════════════════════════
   storeConfig.js — EVERYTHING THIS BUILD KNOWS ABOUT *THIS* STORE.

   ★ NEAR-LEAF. It imports `ownerSeed.js` and NOTHING ELSE, and that one import
   is itself a strict leaf, so the chain terminates one step down. It is read by
   client tiles AND by worker.js, so anything it pulls in gets pulled into both.

   ⚠️ THIS SAID "IMPORTS NOTHING, AND MUST STAY THAT WAY" UNTIL AUG 13 2026, so
   the rule is restated rather than quietly dropped: **the ONE allowed import is
   a data module with no React, no store.js and no import.meta.env.** The reason
   the old rule existed is the Worker, and that reason is unchanged. Verified
   with `npx wrangler deploy --dry-run`, not assumed. Anything the Worker cannot
   run still cannot be imported here, and the same warning sits on orgSeats.js
   one level up.

   ═══ WHY THIS FILE EXISTS ═════════════════════════════════════════════════
   Matt, Aug 7 2026: "we need the clone ready asap."

   The Aug 7 audit found the same five Slack ids copied into five client files
   under five different names — ADMIN_SLACK_IDS, STATUS_SLACK_IDS,
   EDITOR_SLACK_IDS, EDIT_SLACK_IDS — plus more in the tiles that DM somebody.
   Byte-identical every time. That is two problems at once:

     1. A second store standing this up would have OUR people administering
        THEIR tiles, and would have to find all five copies to fix it.
     2. Five copies of one list drift. When the list that drifts is the one
        deciding who may edit the handbook, it drifts silently.

   So the list lives here once, and every gate reads it.

   ═══ STEP 1 OF THE STORE CONFIGURATION LAYER (Matt, Aug 11 2026) ══════════
   "Standing up the Hub for another operator currently means me hand editing
   JavaScript files. That is why an install takes weeks. The goal is that a
   store's setup becomes data typed in once, not code I edit."

   STORE_CONFIG below is that data. Step 1 MOVES VALUES IN AND CHANGES NOTHING
   ELSE — every consumer still reads its own hardcoded copy until step 2
   rewires them, and every existing export from this file keeps the exact name
   and value it had yesterday.

   ⚠️⚠️ SO THIS FILE DELIBERATELY HOLDS TWO COPIES OF SOME VALUES RIGHT NOW,
   AND THAT IS THE ONE THING STEP 2 MUST FINISH. Design rule 8 says never
   define the same thing twice because copies drift. That rule is suspended for
   exactly one step, on purpose, so the move and the rewire can be reviewed
   separately instead of as one 34-file commit. If step 2 stalls, this file is
   a drift hazard, not an improvement. The station block is the sharp end: 288
   station rows live here AND in stationTemplates.js until step 2 lands.

   ⚠️ THE STATION BLOCK WAS GENERATED FROM stationTemplates.js, NOT RETYPED.
   288 rows of names and posted hours is exactly the shape of data where a
   hand-copied digit becomes a wrong board on a Tuesday and nobody can see why.
   The generator refused to run if a station carried a field it did not know
   how to emit, so nothing was silently dropped.

   ═══ WHAT THIS FILE DELIBERATELY DOES *NOT* DO ════════════════════════════
   ⚠️ IT DOES NOT REPLACE THE ID GATE WITH A NAME GATE. That was the obvious
   move and it is wrong. TeamDirectory.jsx carries the scar in its own words:

       "PRIMARY GATE = SLACK USER ID. Slack IDs never change; display names do,
        and a name-string gate is what silently locked Bri out of her own admin
        panel (the Hub knew her as 'Bri', the gate wanted 'Brianna
        Moore')."

   Names are the FALLBACK on purpose. This change moves the list, not the
   mechanism, so no gate anywhere behaves differently than it did yesterday.

   ⚠️ IT DOES NOT HOLD THE PER-TILE NAME AND ROLE FALLBACKS. Those lists are
   NOT identical between files — ProfessionalGrowth includes Hannah where
   MemberVote does not, and the role sets differ tile by tile. They look like
   duplicates and they are not, so merging them here would quietly change who
   can do what in four tiles at once. They stay where they are.

   ⚠️ IT DOES NOT HOLD THE ROSTER. 106 people live in hrTeam.js and get
   overwritten by a store's own HR import on day one, so they were never the
   blocker they looked like.

   ⚠️ IT STILL DOES NOT HOLD A PRIVATE SLACK CHANNEL ID. See `messaging`.

   ═══ CLONING ═════════════════════════════════════════════════════════════
   A second store edits THIS FILE and nothing else to stop our people
   administering their Hub. That is the whole point of it.
   ══════════════════════════════════════════════════════════════════════════ */

/* ★ ONE OBJECT, SEVEN SECTIONS, IN INSTALL ORDER.
   The order matches the settings screen step 3 builds, which matches the order
   an install actually happens in: who the store is, then the board, then who
   owns what, then which parts of the Hub they want, then the numbers.

   ⚠️ EVERY VALUE HERE IS GATE CITY'S CURRENT ONE. Nothing was tidied, rounded
   or corrected on the way in. Two of them are known to disagree with a second
   copy elsewhere in the repo and are carried AS THEY ARE, flagged where they
   sit — a config layer that quietly picks a winner is worse than one that
   shows you the disagreement. */
import { OWNER_SEED } from "./ownerSeed.js";

const CONFIG = {
  /* ── 1. IDENTITY ────────────────────────────────────────────────────────
     ⚠️ THESE ARE THE WORDS A TEAM MEMBER ACTUALLY READS. Every HR email the
     Hub sends signs off with `legalName`, every nudge tells somebody to "open
     Professional Growth in the {appName}", and `notifyEmail` is the From:
     address on all of it. Left hardcoded, a second store emails its own team
     signing as Gate City Chick-fil-A from gatecityhub.com — which is not a
     cosmetic bug on a write-up or an injury notice, it is a message that looks
     like it came from somebody else's business.

     ⚠️ `city` AND `timezone` ARE NEW HERE AND WERE NEVER IN THE CODE. The city
     was read off the CEM market label ("Greensboro-HPWS", GuestExperience.jsx)
     rather than invented. The timezone was hardcoded identically in four
     places and every scheduled job assumes it; cron-job.org's account timezone
     has to match it or every job lands four hours out.

     ⚠️ `fsr` IS NOT A KEY PREFIX. Stored records are `gcfcr-` everywhere and
     changing that would orphan every one of them. */
  identity: {
    name: "SET-THIS-TO-THE-STORE-NAME",                       // the store, in prose
    legalName: "SET-THIS-TO-THE-STORE-NAME Chick-fil-A",      // how emails sign off
    fsr: "00000",
    city: "",
    state: "",
    /* ⚠️ THE ROAD, NOT A POSTAL ADDRESS, and the difference is what it renders
       into. The team site draws it as a stat that reads "1 · <street>", meaning
       one location, on that road. A full "4010 W Gate City Blvd, Greensboro NC
       27407" is a true address and a terrible stat.
       ⚠️ BLANK IS A WORKING STATE and is what a clone gets: the stat falls back
       to the store's own name, which is what the second store's team site does
       today. Never guess a road for a store. */
    street: "",
    timezone: "America/New_York",
    domain: "SET-THIS-TO-THE-STORE-WEB-ADDRESS",
    notifyEmail: "notify@SET-THIS-TO-THE-STORE-WEB-ADDRESS",   // the From: address on every email
    /* ⚠️⚠️ WHERE A REPLY LANDS, AND BLANK MEANS NOWHERE. `notifyEmail` above is
       a sending identity, not a mailbox — this domain has no MX, so a team
       member who hits Reply on "You have a document to sign" writes into a
       void and finds out days later, if ever.

       🐛 THE SAME SHAPE ALREADY BIT THE BOOKS APP on 11 Aug 2026: replies went
       to an address with no MX, Gmail retried for 46 hours, and the sender got
       a bounce two days later.

       ⚠️ BLANK IS THE HONEST DEFAULT AND IT CHANGES NOTHING. With no value the
       reply-to key is left off the request entirely, so the mail Resend
       receives is byte-for-byte the one it received yesterday. Nobody guesses a
       mailbox for a store: this is on the Store Settings screen and each store
       types its own (design rule 18).
       ⚠️ AND THE WORKER READS THE SAVED ONE, NOT THIS. See `storeBrand` — this
       constant is only the fallback for a store that has saved nothing. */
    replyToEmail: "",                        // where replies go; blank = no reply-to sent
  },

  /* ── 2. BRANDING ────────────────────────────────────────────────────────
     ⚠️⚠️ `primary` AND `ink` ARE THE MASTHEAD'S REAL COLOURS, AND THEY ARE
     NOT A THEME. There is no primary colour in this app today: 400 distinct
     hex values are typed inline across the tiles, and most tiles carry their
     own on purpose (Training's purple, HR's navy, IPO's gold) because a
     leader finds a tool by its colour. These two are the ones the top bar
     actually uses. Recolouring the whole Hub from here is a redesign, not a
     rewire, and step 2 must not pretend otherwise. */
  branding: {
    appName: "SET-THIS-TO-THE-STORE-NAME Hub",                // what the team calls the app
    primary: "#DD0031",                      // the masthead's red underline
    ink: "#13293F",                          // the masthead's dark
    logo: "",
  },

  /* ── 3. STATIONS AND HOURS ──────────────────────────────────────────────
     The board, as data. 288 rows: 2 houses x 6 days, FOH 25 a day and BOH 23.

     SHAPE, unchanged from stationTemplates.js so step 2 is a rewire and not a
     redesign. Times are MINUTES FROM MIDNIGHT (360 = 6:00am), which is what
     the assignment engines already compare against.
       hours: [{start,end}]   one entry per block; two entries = a split shift
       hours: null            no posted hours (open all day unless marked)
       leader: true           a leader covers it — the engine never fills it
       cellOverrides          per-period marker that beats the computed one
       cellText               what a locked cell prints
       overflow: true         normally-closed spare, manual assign only

     ⚠️⚠️ TWO FILES DEFINE THE FOUR DAYPART WINDOWS AND THEY DISAGREE. Both
     are carried here exactly as they are, because step 1 changes nothing:

       boardPeriods  breakfast 5:00-11:00   — stationTemplates.js, decides
                                              whether a station is OPEN in a
                                              period (an overlap test)
       dayparts      breakfast 6:00-10:30   — dayparts.js, decides how many
                                              HOURS a filled cell is worth
                                              (labor money)

     dayparts.js documents this as the bug it exists to fix and records that
     Matt picked 10:30. stationTemplates.js was never changed to match. They
     may be answering different questions — one is an overlap test and the
     other is arithmetic — so this has NOT been resolved here. Resolving it
     moves real labor money and is its own task, with Matt's eyes on it.

     ⚠️ "HOW MANY PEOPLE" DOES NOT EXIST YET. The step 3 grid asks for it. No
     station carries a headcount today; the board holds cells and people are
     assigned into them. It is a NEW field, not a value to move, so step 1
     does not invent one.

     ⚠️ RENAMING A STATION IS SAFE, AND AN EARLIER VERSION OF THIS COMMENT SAID
     IT WAS NOT. The claim was that the Drive Thru versus Front Counter labor
     split pattern-matches station names, so a rename would silently break it.
     dayparts.js does contain that name matching — `fohSide`, `fohSideHours` and
     FOH_SIDE_PATTERNS — but NOTHING IMPORTS ANY OF THEM. The only two mentions
     outside that file are both inside comments in DailySetup.jsx.
     The live split is `dtShareOfFoh`, which reads real SALES (drive thru versus
     carry out, dine in and on demand) and never looks at a station name. That
     is deliberate: the Planner used to budget DT as a fixed percentage of FOH
     hours, which made DT always on budget by construction and meant the screen
     could never say which side to cut.
     ⇒ A settings screen may let a store rename stations. Checked by grepping
     every export of dayparts.js for real importers, not by reading the code and
     assuming the function that looks load-bearing is wired up. */
  stations: {
    /* ⚠️⚠️ TWO DEFINITIONS OF THE SAME FOUR WINDOWS, IN TWO DIFFERENT UNITS.
       Both are carried EXACTLY as they are today. Read the units before
       touching either one — this is the single easiest place in the config to
       introduce a wrong number that still looks plausible.

         boardPeriods  MINUTES from midnight. 300 = 5:00am.
                       From stationTemplates.js. Decides whether a station is
                       OPEN in a period, by overlap. Generous on purpose.

         dayparts      DECIMAL HOURS. 10.5 = 10:30am.
                       From dayparts.js. Decides how many HOURS a filled cell
                       is worth, which is labor money.

       They disagree on the breakfast/lunch boundary: the board splits at 11:00,
       the labor maths splits at 10:30. dayparts.js documents this as the bug it
       exists to fix and records that Matt picked 10:30; stationTemplates.js was
       never changed to match. They may be answering different questions, so
       this is NOT resolved here. Resolving it moves real labor money and is its
       own task.

       ⚠️ `night.end` IS null IN dayparts AND THAT IS DELIBERATE. The store's
       closing time is not the same every day and is not written down anywhere
       this file could trust, so anything measuring night takes the end from the
       station's own posted hours. A store-wide closing guess would put an
       invented number inside a labor calculation. Do not "complete" it. */
    boardPeriods: {
      breakfast: { start: 300, end: 660 },
      lunch: { start: 660, end: 840 },
      mid: { start: 840, end: 1020 },
      night: { start: 1020, end: 1410 },
    },
    dayparts: [
      { key: "breakfast", label: "Breakfast", start: 6, end: 10.5, window: "6-10:30" },
      { key: "lunch", label: "Lunch", start: 10.5, end: 14, window: "10:30-2" },
      { key: "mid", label: "Mid", start: 14, end: 17, window: "2-5" },
      { key: "night", label: "Night", start: 17, end: null, window: "5-close" },
    ],

    FOH: {
      Mon: [
        { id: "window", name: "WINDOW", section: "FRONT LINE", hours: [{ start: 360, end: 1380 }], duty: "STOCK SAUCES" },
        { id: "expo1", name: "EXPO 1", section: "FRONT LINE", hours: [{ start: 660, end: 1200 }], duty: "CLEAN OUTSIDE WINDOW" },
        { id: "expo2", name: "EXPO 2", section: "FRONT LINE", hours: [{ start: 675, end: 840 }, { start: 1020, end: 1200 }], duty: "PARKING LOT CHECK" },
        { id: "drinks", name: "DRINKS", section: "FRONT LINE", hours: [{ start: 510, end: 1320 }], duty: "CLEAN AND STOCK DRINKS" },
        { id: "desserts", name: "DESSERTS", section: "FRONT LINE", hours: [{ start: 675, end: 1380 }], duty: "CLEAN AND STOCK DESSERTS" },
        { id: "dtTraditional", name: "DT TRADITIONAL", section: "DRIVE THRU", hours: [{ start: 660, end: 1380 }], duty: "STOCK AREA", cellOverrides: {"breakfast":"✔️"} },
        { id: "dtMobiles", name: "DT MOBILES", section: "DRIVE THRU", hours: [{ start: 510, end: 660 }], duty: "CHECK OFF AREAS", cellOverrides: {"lunch":"✔️","mid":"✔️","night":"✔️"} },
        { id: "traditionalBagger", name: "TRADITIONAL BAGGER", section: "FRONT COUNTER", hours: [{ start: 660, end: 840 }, { start: 1020, end: 1320 }], duty: "STOCK AREA", cellOverrides: {"breakfast":"✔️"} },
        { id: "mobileBagger", name: "MOBILE BAGGER", section: "FRONT COUNTER", hours: null, duty: "CHECK OFF AREAS", leader: true },
        { id: "insideExpo", name: "INSIDE EXPO", section: "FRONT COUNTER", hours: null, duty: "" },
        { id: "drinksDesserts", name: "MOBILE DRINKS/DESSERTS", section: "FRONT LINE", hours: null, duty: "STOCK AREA", leader: true, cellText: "split duties" },
        { id: "register1", name: "REGISTER 1", section: "FRONT COUNTER", hours: [{ start: 360, end: 660 }], duty: "STOCK FC", cellOverrides: {"lunch":"✔️(Line!!)","mid":"✔️(Line!!)","night":"✔️(Line!!)"} },
        { id: "register2", name: "REGISTER 2", section: "FRONT COUNTER", hours: [{ start: 660, end: 1260 }], duty: "TRASH AND FLOORS" },
        { id: "register3", name: "REGISTER 3", section: "FRONT COUNTER", hours: [{ start: 660, end: 1020 }], duty: "STOCK AREA" },
        { id: "hospitality", name: "HOSPITALITY", section: "DINING", hours: [{ start: 480, end: 1320 }], duty: "REFRESH /TABLE TOUCHES" },
        { id: "cleanliness", name: "CLEANLINESS", section: "DINING", hours: [{ start: 675, end: 840 }], duty: "BATHROOMS / PLAYPLACE" },
        { id: "otCaptain", name: "OT CAPTAIN", section: "OUTSIDE", hours: [{ start: 360, end: 1320 }], duty: "TABLETS AND CARD READERS" },
        { id: "ot1", name: "OT 1", section: "OUTSIDE", hours: [{ start: 360, end: 1320 }], duty: "TABLETS AND CARD READERS" },
        { id: "ot2", name: "OT 2", section: "OUTSIDE", hours: [{ start: 675, end: 840 }], duty: "TABLETS AND CARD READERS" },
        { id: "leaderDt", name: "LEADER DT", section: "LEADERSHIP", hours: [{ start: 315, end: 1380 }], duty: "TRANSITIONS" },
        { id: "leaderFc", name: "LEADER FC", section: "LEADERSHIP", hours: [{ start: 345, end: 1320 }], duty: "MONEY" },
      ],
      Tue: [
        { id: "window", name: "WINDOW", section: "FRONT LINE", hours: [{ start: 360, end: 1380 }], duty: "STOCK SAUCES" },
        { id: "expo1", name: "EXPO 1", section: "FRONT LINE", hours: [{ start: 660, end: 1200 }], duty: "CLEAN OUTSIDE WINDOW" },
        { id: "expo2", name: "EXPO 2", section: "FRONT LINE", hours: [{ start: 675, end: 840 }, { start: 1020, end: 1200 }], duty: "PARKING LOT CHECK" },
        { id: "drinks", name: "DRINKS", section: "FRONT LINE", hours: [{ start: 510, end: 1320 }], duty: "CLEAN AND STOCK DRINKS" },
        { id: "desserts", name: "DESSERTS", section: "FRONT LINE", hours: [{ start: 675, end: 1380 }], duty: "CLEAN AND STOCK DESSERTS" },
        { id: "dtTraditional", name: "DT TRADITIONAL", section: "DRIVE THRU", hours: [{ start: 660, end: 1380 }], duty: "STOCK AREA", cellOverrides: {"breakfast":"✔️"} },
        { id: "dtMobiles", name: "DT MOBILES", section: "DRIVE THRU", hours: [{ start: 510, end: 660 }], duty: "CHECK OFF AREAS", cellOverrides: {"lunch":"✔️","mid":"✔️","night":"✔️"} },
        { id: "traditionalBagger", name: "TRADITIONAL BAGGER", section: "FRONT COUNTER", hours: [{ start: 660, end: 840 }, { start: 1020, end: 1320 }], duty: "STOCK AREA", cellOverrides: {"breakfast":"✔️"} },
        { id: "mobileBagger", name: "MOBILE BAGGER", section: "FRONT COUNTER", hours: null, duty: "CHECK OFF AREAS", leader: true },
        { id: "insideExpo", name: "INSIDE EXPO", section: "FRONT COUNTER", hours: null, duty: "" },
        { id: "drinksDesserts", name: "MOBILE DRINKS/DESSERTS", section: "FRONT LINE", hours: null, duty: "STOCK AREA", leader: true, cellText: "split duties" },
        { id: "register1", name: "REGISTER 1", section: "FRONT COUNTER", hours: [{ start: 360, end: 660 }], duty: "STOCK FC", cellOverrides: {"lunch":"✔️(Line!!)","mid":"✔️(Line!!)","night":"✔️(Line!!)"} },
        { id: "register2", name: "REGISTER 2", section: "FRONT COUNTER", hours: [{ start: 660, end: 1260 }], duty: "TRASH AND FLOORS" },
        { id: "register3", name: "REGISTER 3", section: "FRONT COUNTER", hours: [{ start: 660, end: 1020 }], duty: "STOCK AREA" },
        { id: "hospitality", name: "HOSPITALITY", section: "DINING", hours: [{ start: 480, end: 1320 }], duty: "REFRESH /TABLE TOUCHES" },
        { id: "cleanliness", name: "CLEANLINESS", section: "DINING", hours: [{ start: 675, end: 840 }], duty: "BATHROOMS / PLAYPLACE" },
        { id: "otCaptain", name: "OT CAPTAIN", section: "OUTSIDE", hours: [{ start: 360, end: 1320 }], duty: "TABLETS AND CARD READERS" },
        { id: "ot1", name: "OT 1", section: "OUTSIDE", hours: [{ start: 360, end: 1320 }], duty: "TABLETS AND CARD READERS" },
        { id: "ot2", name: "OT 2", section: "OUTSIDE", hours: [{ start: 675, end: 840 }], duty: "TABLETS AND CARD READERS" },
        { id: "leaderDt", name: "LEADER DT", section: "LEADERSHIP", hours: [{ start: 315, end: 1380 }], duty: "TRANSITIONS" },
        { id: "leaderFc", name: "LEADER FC", section: "LEADERSHIP", hours: [{ start: 345, end: 1320 }], duty: "MONEY" },
      ],
      Wed: [
        { id: "window", name: "WINDOW", section: "FRONT LINE", hours: [{ start: 360, end: 1380 }], duty: "STOCK SAUCES" },
        { id: "expo1", name: "EXPO 1", section: "FRONT LINE", hours: [{ start: 660, end: 1200 }], duty: "CLEAN OUTSIDE WINDOW" },
        { id: "expo2", name: "EXPO 2", section: "FRONT LINE", hours: [{ start: 675, end: 840 }, { start: 1020, end: 1200 }], duty: "PARKING LOT CHECK" },
        { id: "drinks", name: "DRINKS", section: "FRONT LINE", hours: [{ start: 510, end: 1320 }], duty: "CLEAN AND STOCK DRINKS" },
        { id: "desserts", name: "DESSERTS", section: "FRONT LINE", hours: [{ start: 675, end: 1380 }], duty: "CLEAN AND STOCK DESSERTS" },
        { id: "dtTraditional", name: "DT TRADITIONAL", section: "DRIVE THRU", hours: [{ start: 660, end: 1380 }], duty: "STOCK AREA", cellOverrides: {"breakfast":"✔️"} },
        { id: "dtMobiles", name: "DT MOBILES", section: "DRIVE THRU", hours: [{ start: 510, end: 660 }], duty: "CHECK OFF AREAS", cellOverrides: {"lunch":"✔️","mid":"✔️","night":"✔️"} },
        { id: "traditionalBagger", name: "TRADITIONAL BAGGER", section: "FRONT COUNTER", hours: [{ start: 660, end: 840 }, { start: 1020, end: 1320 }], duty: "STOCK AREA", cellOverrides: {"breakfast":"✔️"} },
        { id: "mobileBagger", name: "MOBILE BAGGER", section: "FRONT COUNTER", hours: null, duty: "CHECK OFF AREAS", leader: true },
        { id: "insideExpo", name: "INSIDE EXPO", section: "FRONT COUNTER", hours: null, duty: "" },
        { id: "drinksDesserts", name: "MOBILE DRINKS/DESSERTS", section: "FRONT LINE", hours: null, duty: "STOCK AREA", leader: true, cellText: "split duties" },
        { id: "register1", name: "REGISTER 1", section: "FRONT COUNTER", hours: [{ start: 360, end: 660 }], duty: "STOCK FC", cellOverrides: {"lunch":"✔️(Line!!)","mid":"✔️(Line!!)","night":"✔️(Line!!)"} },
        { id: "register2", name: "REGISTER 2", section: "FRONT COUNTER", hours: [{ start: 660, end: 1260 }], duty: "TRASH AND FLOORS" },
        { id: "register3", name: "REGISTER 3", section: "FRONT COUNTER", hours: [{ start: 660, end: 1020 }], duty: "STOCK AREA" },
        { id: "hospitality", name: "HOSPITALITY", section: "DINING", hours: [{ start: 480, end: 1320 }], duty: "REFRESH /TABLE TOUCHES" },
        { id: "cleanliness", name: "CLEANLINESS", section: "DINING", hours: [{ start: 675, end: 840 }], duty: "BATHROOMS / PLAYPLACE" },
        { id: "otCaptain", name: "OT CAPTAIN", section: "OUTSIDE", hours: [{ start: 360, end: 1320 }], duty: "TABLETS AND CARD READERS" },
        { id: "ot1", name: "OT 1", section: "OUTSIDE", hours: [{ start: 360, end: 1320 }], duty: "TABLETS AND CARD READERS" },
        { id: "ot2", name: "OT 2", section: "OUTSIDE", hours: [{ start: 675, end: 840 }], duty: "TABLETS AND CARD READERS" },
        { id: "leaderDt", name: "LEADER DT", section: "LEADERSHIP", hours: [{ start: 315, end: 1380 }], duty: "TRANSITIONS" },
        { id: "leaderFc", name: "LEADER FC", section: "LEADERSHIP", hours: [{ start: 345, end: 1320 }], duty: "MONEY" },
      ],
      Thu: [
        { id: "window", name: "WINDOW", section: "FRONT LINE", hours: [{ start: 360, end: 1380 }], duty: "STOCK SAUCES" },
        { id: "expo1", name: "EXPO 1", section: "FRONT LINE", hours: [{ start: 660, end: 1260 }], duty: "CLEAN OUTSIDE WINDOW" },
        { id: "expo2", name: "EXPO 2", section: "FRONT LINE", hours: [{ start: 675, end: 840 }, { start: 1020, end: 1200 }], duty: "PARKING LOT CHECK" },
        { id: "drinks", name: "DRINKS", section: "FRONT LINE", hours: [{ start: 510, end: 1320 }], duty: "CLEAN AND STOCK DRINKS" },
        { id: "desserts", name: "DESSERTS", section: "FRONT LINE", hours: [{ start: 675, end: 1380 }], duty: "CLEAN AND STOCK DESSERTS" },
        { id: "dtTraditional", name: "DT TRADITIONAL", section: "DRIVE THRU", hours: [{ start: 660, end: 1380 }], duty: "STOCK AREA", cellOverrides: {"breakfast":"✔️"} },
        { id: "dtMobiles", name: "DT MOBILES", section: "DRIVE THRU", hours: [{ start: 510, end: 660 }], duty: "CHECK OFF AREAS", cellOverrides: {"lunch":"✔️","mid":"✔️","night":"✔️"} },
        { id: "traditionalBagger", name: "TRADITIONAL BAGGER", section: "FRONT COUNTER", hours: [{ start: 660, end: 1320 }], duty: "STOCK AREA", cellOverrides: {"breakfast":"✔️"} },
        { id: "mobileBagger", name: "MOBILE BAGGER", section: "FRONT COUNTER", hours: null, duty: "CHECK OFF AREAS", leader: true },
        { id: "insideExpo", name: "INSIDE EXPO", section: "FRONT COUNTER", hours: null, duty: "" },
        { id: "drinksDesserts", name: "MOBILE DRINKS/DESSERTS", section: "FRONT LINE", hours: null, duty: "STOCK AREA", leader: true, cellText: "split duties" },
        { id: "register1", name: "REGISTER 1", section: "FRONT COUNTER", hours: [{ start: 360, end: 660 }], duty: "STOCK FC", cellOverrides: {"lunch":"✔️(Line!!)","mid":"✔️(Line!!)","night":"✔️(Line!!)"} },
        { id: "register2", name: "REGISTER 2", section: "FRONT COUNTER", hours: [{ start: 660, end: 1260 }], duty: "TRASH AND FLOORS" },
        { id: "register3", name: "REGISTER 3", section: "FRONT COUNTER", hours: [{ start: 660, end: 1200 }], duty: "STOCK AREA" },
        { id: "hospitality", name: "HOSPITALITY", section: "DINING", hours: [{ start: 480, end: 1320 }], duty: "REFRESH /TABLE TOUCHES" },
        { id: "cleanliness", name: "CLEANLINESS", section: "DINING", hours: [{ start: 675, end: 840 }, { start: 1020, end: 1200 }], duty: "BATHROOMS / PLAYPLACE" },
        { id: "otCaptain", name: "OT CAPTAIN", section: "OUTSIDE", hours: [{ start: 360, end: 1320 }], duty: "TABLETS AND CARD READERS" },
        { id: "ot1", name: "OT 1", section: "OUTSIDE", hours: [{ start: 360, end: 1320 }], duty: "TABLETS AND CARD READERS" },
        { id: "ot2", name: "OT 2", section: "OUTSIDE", hours: [{ start: 675, end: 840 }], duty: "TABLETS AND CARD READERS" },
        { id: "leaderDt", name: "LEADER DT", section: "LEADERSHIP", hours: [{ start: 315, end: 1380 }], duty: "TRANSITIONS" },
        { id: "leaderFc", name: "LEADER FC", section: "LEADERSHIP", hours: [{ start: 345, end: 1320 }], duty: "MONEY" },
      ],
      Fri: [
        { id: "window", name: "WINDOW", section: "FRONT LINE", hours: [{ start: 360, end: 1380 }], duty: "STOCK SAUCES" },
        { id: "expo1", name: "EXPO 1", section: "FRONT LINE", hours: [{ start: 660, end: 1260 }], duty: "CLEAN OUTSIDE WINDOW" },
        { id: "expo2", name: "EXPO 2", section: "FRONT LINE", hours: [{ start: 675, end: 1260 }], duty: "PARKING LOT CHECK" },
        { id: "drinks", name: "DRINKS", section: "FRONT LINE", hours: [{ start: 510, end: 1320 }], duty: "CLEAN AND STOCK DRINKS" },
        { id: "desserts", name: "DESSERTS", section: "FRONT LINE", hours: [{ start: 675, end: 1380 }], duty: "CLEAN AND STOCK DESSERTS" },
        { id: "dtTraditional", name: "DT TRADITIONAL", section: "DRIVE THRU", hours: [{ start: 660, end: 1380 }], duty: "STOCK AREA", cellOverrides: {"breakfast":"✔️"} },
        { id: "dtMobiles", name: "DT MOBILES", section: "DRIVE THRU", hours: [{ start: 510, end: 660 }], duty: "CHECK OFF AREAS", cellOverrides: {"lunch":"✔️","mid":"✔️","night":"✔️"} },
        { id: "traditionalBagger", name: "TRADITIONAL BAGGER", section: "FRONT COUNTER", hours: [{ start: 660, end: 1320 }], duty: "STOCK AREA", cellOverrides: {"breakfast":"✔️"} },
        { id: "mobileBagger", name: "MOBILE BAGGER", section: "FRONT COUNTER", hours: null, duty: "CHECK OFF AREAS", leader: true },
        { id: "insideExpo", name: "INSIDE EXPO", section: "FRONT COUNTER", hours: null, duty: "" },
        { id: "drinksDesserts", name: "MOBILE DRINKS/DESSERTS", section: "FRONT LINE", hours: [{ start: 540, end: 660 }], duty: "STOCK AREA", leader: false, cellOverrides: {"lunch":"✔️","mid":"✔️","night":"✔️"} },
        { id: "register1", name: "REGISTER 1", section: "FRONT COUNTER", hours: [{ start: 360, end: 1260 }], duty: "STOCK FC" },
        { id: "register2", name: "REGISTER 2", section: "FRONT COUNTER", hours: [{ start: 510, end: 1260 }], duty: "TRASH AND FLOORS" },
        { id: "register3", name: "REGISTER 3", section: "FRONT COUNTER", hours: [{ start: 660, end: 840 }], duty: "STOCK AREA" },
        { id: "hospitality", name: "HOSPITALITY", section: "DINING", hours: [{ start: 480, end: 1320 }], duty: "REFRESH /TABLE TOUCHES" },
        { id: "cleanliness", name: "CLEANLINESS", section: "DINING", hours: [{ start: 675, end: 1200 }], duty: "BATHROOMS / PLAYPLACE" },
        { id: "otCaptain", name: "OT CAPTAIN", section: "OUTSIDE", hours: [{ start: 360, end: 1320 }], duty: "TABLETS AND CARD READERS" },
        { id: "ot1", name: "OT 1", section: "OUTSIDE", hours: [{ start: 360, end: 1320 }], duty: "TABLETS AND CARD READERS" },
        { id: "ot2", name: "OT 2", section: "OUTSIDE", hours: [{ start: 675, end: 1200 }], duty: "TABLETS AND CARD READERS" },
        { id: "leaderDt", name: "LEADER DT", section: "LEADERSHIP", hours: [{ start: 315, end: 1380 }], duty: "TRANSITIONS" },
        { id: "leaderFc", name: "LEADER FC", section: "LEADERSHIP", hours: [{ start: 345, end: 1320 }], duty: "MONEY" },
      ],
      Sat: [
        { id: "window", name: "WINDOW", section: "FRONT LINE", hours: [{ start: 360, end: 1380 }], duty: "STOCK SAUCES" },
        { id: "expo1", name: "EXPO 1", section: "FRONT LINE", hours: [{ start: 660, end: 1260 }], duty: "CLEAN OUTSIDE WINDOW" },
        { id: "expo2", name: "EXPO 2", section: "FRONT LINE", hours: [{ start: 675, end: 1260 }], duty: "PARKING LOT CHECK" },
        { id: "drinks", name: "DRINKS", section: "FRONT LINE", hours: [{ start: 510, end: 1320 }], duty: "CLEAN AND STOCK DRINKS" },
        { id: "desserts", name: "DESSERTS", section: "FRONT LINE", hours: [{ start: 675, end: 1380 }], duty: "CLEAN AND STOCK DESSERTS" },
        { id: "dtTraditional", name: "DT TRADITIONAL", section: "DRIVE THRU", hours: [{ start: 660, end: 1380 }], duty: "STOCK AREA", cellOverrides: {"breakfast":"✔️"} },
        { id: "dtMobiles", name: "DT MOBILES", section: "DRIVE THRU", hours: [{ start: 510, end: 660 }], duty: "CHECK OFF AREAS", cellOverrides: {"lunch":"✔️","mid":"✔️","night":"✔️"} },
        { id: "traditionalBagger", name: "TRADITIONAL BAGGER", section: "FRONT COUNTER", hours: [{ start: 660, end: 1320 }], duty: "STOCK AREA", cellOverrides: {"breakfast":"✔️"} },
        { id: "mobileBagger", name: "MOBILE BAGGER", section: "FRONT COUNTER", hours: null, duty: "CHECK OFF AREAS", leader: true },
        { id: "insideExpo", name: "INSIDE EXPO", section: "FRONT COUNTER", hours: null, duty: "" },
        { id: "drinksDesserts", name: "MOBILE DRINKS/DESSERTS", section: "FRONT LINE", hours: [{ start: 540, end: 660 }], duty: "STOCK AREA", leader: false, cellOverrides: {"lunch":"✔️","mid":"✔️","night":"✔️"} },
        { id: "register1", name: "REGISTER 1", section: "FRONT COUNTER", hours: [{ start: 360, end: 1260 }], duty: "STOCK FC" },
        { id: "register2", name: "REGISTER 2", section: "FRONT COUNTER", hours: [{ start: 510, end: 1260 }], duty: "TRASH AND FLOORS" },
        { id: "register3", name: "REGISTER 3", section: "FRONT COUNTER", hours: [{ start: 660, end: 840 }], duty: "STOCK AREA" },
        { id: "hospitality", name: "HOSPITALITY", section: "DINING", hours: [{ start: 480, end: 1320 }], duty: "REFRESH /TABLE TOUCHES" },
        { id: "cleanliness", name: "CLEANLINESS", section: "DINING", hours: [{ start: 675, end: 1200 }], duty: "BATHROOMS / PLAYPLACE" },
        { id: "otCaptain", name: "OT CAPTAIN", section: "OUTSIDE", hours: [{ start: 360, end: 1320 }], duty: "TABLETS AND CARD READERS" },
        { id: "ot1", name: "OT 1", section: "OUTSIDE", hours: [{ start: 360, end: 1320 }], duty: "TABLETS AND CARD READERS" },
        { id: "ot2", name: "OT 2", section: "OUTSIDE", hours: [{ start: 675, end: 1200 }], duty: "TABLETS AND CARD READERS" },
        { id: "leaderDt", name: "LEADER DT", section: "LEADERSHIP", hours: [{ start: 315, end: 1380 }], duty: "TRANSITIONS" },
        { id: "leaderFc", name: "LEADER FC", section: "LEADERSHIP", hours: [{ start: 345, end: 1320 }], duty: "MONEY" },
      ],
    },
    BOH: {
      Mon: [
        { id: "primaryPoint", name: "Primary Point", section: "PRIMARY", hours: [{ start: 360, end: 1200 }], duty: "STOCK SAUCES / CHECK TICKET TIMES" },
        { id: "specialsPoint", name: "Specials / Point", section: "PRIMARY", hours: [{ start: 300, end: 1380 }], duty: "CLEAN SPECIALS AREA / RESTOCK" },
        { id: "specialsGrilledBuns", name: "Specials / Grilled / Buns", section: "PRIMARY", hours: [{ start: 660, end: 840 }], duty: "CLEAN GRILL / RESTOCK BUNS", cellOverrides: {"breakfast":"✔️","night":"✔️"} },
        { id: "biscuitsEggs", name: "Biscuits / Eggs", section: "SECONDARY", hours: [{ start: 315, end: 660 }], duty: "CLEAN BISCUIT STATION / WRAP REMAINING" },
        { id: "nuggetsStrips", name: "Nuggets / Strips", section: "SECONDARY", hours: [{ start: 360, end: 1380 }], duty: "CLEAN HOLDING / RESTOCK NUGGETS" },
        { id: "grilledSoupMac", name: "Grilled / Soup / Mac", section: "SECONDARY", hours: [{ start: 510, end: 840 }], duty: "CLEAN SOUP AREA / CHANGE MAC WATER", cellOverrides: {"night":"✔️"} },
        { id: "hashPFry", name: "Hash / P Fry", section: "FRY STATION", hours: [{ start: 420, end: 1380 }], duty: "FILTER HASH OIL / CLEAN FRY AREA" },
        { id: "hashSFry", name: "Hash/S Fry", section: "FRY STATION", hours: null, duty: "CLEAN SECONDARY FRY / RECORD WASTE", cellOverrides: {"breakfast":"split duties","lunch":"split duties","mid":"split duties","night":"✔️"} },
        { id: "machines123", name: "Machines 1,2,3 — DT Lead", section: "MACHINES", hours: [{ start: 510, end: 1380 }], duty: "CLEAN MACHINES / CHECK OIL LEVELS" },
        { id: "machines45", name: "Machines 4,5 / Grills — FOH Lead", section: "MACHINES", hours: [{ start: 1020, end: 1380 }], duty: "FILTER MACHINES / STOCK BREADING TABLE" },
        { id: "breader", name: "Breader", section: "BREADING", hours: [{ start: 345, end: 1380 }], duty: "CLEAN BREADING TABLE (AFTER LAST ORDER)" },
        { id: "loader1", name: "Loader / Filter / Thaw", section: "BREADING", hours: [{ start: 660, end: 840 }], duty: "THAW ROTATION / FILTER SCHEDULE" },
        { id: "loader2", name: "Loader / Filter / Thaw", section: "BREADING", hours: [{ start: 660, end: 840 }], duty: "CHECK THAW TEMPS / ASSIST LOADER" },
        { id: "bulkPrep", name: "Bulk Prep", section: "PREP", hours: [{ start: 300, end: 1380 }], duty: "LABEL & DATE ALL PREP / CLEAN PREP AREA" },
        { id: "truck", name: "Truck", section: "TRUCK / DISH", hours: [{ start: 300, end: 510 }], duty: "PUT AWAY TRUCK ORDER / BOX COMPACTOR" },
        { id: "dish1", name: "Dish 1", section: "TRUCK / DISH", hours: [{ start: 1020, end: 1380 }], duty: "DISH SINK / DISH SHELVING / MOP SINK" },
        { id: "kitchenLeadDt", name: "Kitchen Lead / DT", section: "LEADERSHIP", hours: [{ start: 300, end: 1380 }], duty: "TRANSITIONS / WASTE LOG" },
        { id: "kitchenManagerFc", name: "Kitchen Manager / FC", section: "LEADERSHIP", hours: [{ start: 1020, end: 1380 }], duty: "ERQA / FOOD SAFETY CHECKS", cellOverrides: {"breakfast":"✔️","lunch":"✔️","mid":"✔️"} },
      ],
      Tue: [
        { id: "primaryPoint", name: "Primary Point", section: "PRIMARY", hours: [{ start: 360, end: 1200 }], duty: "STOCK SAUCES / CHECK TICKET TIMES" },
        { id: "specialsPoint", name: "Specials / Point", section: "PRIMARY", hours: [{ start: 300, end: 1380 }], duty: "CLEAN SPECIALS AREA / RESTOCK" },
        { id: "specialsGrilledBuns", name: "Specials / Grilled / Buns", section: "PRIMARY", hours: [{ start: 660, end: 840 }], duty: "CLEAN GRILL / RESTOCK BUNS", cellOverrides: {"breakfast":"✔️","night":"✔️"} },
        { id: "biscuitsEggs", name: "Biscuits / Eggs", section: "SECONDARY", hours: [{ start: 315, end: 660 }], duty: "CLEAN BISCUIT STATION / WRAP REMAINING" },
        { id: "nuggetsStrips", name: "Nuggets / Strips", section: "SECONDARY", hours: [{ start: 360, end: 1380 }], duty: "CLEAN HOLDING / RESTOCK NUGGETS" },
        { id: "grilledSoupMac", name: "Grilled / Soup / Mac", section: "SECONDARY", hours: [{ start: 510, end: 840 }], duty: "CLEAN SOUP AREA / CHANGE MAC WATER", cellOverrides: {"night":"✔️"} },
        { id: "hashPFry", name: "Hash / P Fry", section: "FRY STATION", hours: [{ start: 420, end: 1380 }], duty: "FILTER HASH OIL / CLEAN FRY AREA" },
        { id: "hashSFry", name: "Hash/S Fry", section: "FRY STATION", hours: null, duty: "CLEAN SECONDARY FRY / RECORD WASTE", cellOverrides: {"breakfast":"split duties","lunch":"split duties","mid":"split duties","night":"✔️"} },
        { id: "machines123", name: "Machines 1,2,3 — DT Lead", section: "MACHINES", hours: [{ start: 510, end: 1380 }], duty: "CLEAN MACHINES / CHECK OIL LEVELS" },
        { id: "machines45", name: "Machines 4,5 / Grills — FOH Lead", section: "MACHINES", hours: [{ start: 1020, end: 1380 }], duty: "FILTER MACHINES / STOCK BREADING TABLE" },
        { id: "breader", name: "Breader", section: "BREADING", hours: [{ start: 345, end: 1380 }], duty: "CLEAN BREADING TABLE (AFTER LAST ORDER)" },
        { id: "loader1", name: "Loader / Filter / Thaw", section: "BREADING", hours: [{ start: 660, end: 840 }], duty: "THAW ROTATION / FILTER SCHEDULE" },
        { id: "loader2", name: "Loader / Filter / Thaw", section: "BREADING", hours: [{ start: 660, end: 840 }], duty: "CHECK THAW TEMPS / ASSIST LOADER" },
        { id: "bulkPrep", name: "Bulk Prep", section: "PREP", hours: [{ start: 300, end: 1380 }], duty: "LABEL & DATE ALL PREP / CLEAN PREP AREA" },
        { id: "truck", name: "Truck", section: "TRUCK / DISH", hours: [{ start: 300, end: 510 }], duty: "PUT AWAY TRUCK ORDER / BOX COMPACTOR" },
        { id: "dish1", name: "Dish 1", section: "TRUCK / DISH", hours: [{ start: 1020, end: 1380 }], duty: "DISH SINK / DISH SHELVING / MOP SINK" },
        { id: "kitchenLeadDt", name: "Kitchen Lead / DT", section: "LEADERSHIP", hours: [{ start: 300, end: 1380 }], duty: "TRANSITIONS / WASTE LOG" },
        { id: "kitchenManagerFc", name: "Kitchen Manager / FC", section: "LEADERSHIP", hours: [{ start: 1020, end: 1380 }], duty: "ERQA / FOOD SAFETY CHECKS", cellOverrides: {"breakfast":"✔️","lunch":"✔️","mid":"✔️"} },
      ],
      Wed: [
        { id: "primaryPoint", name: "Primary Point", section: "PRIMARY", hours: [{ start: 360, end: 1200 }], duty: "STOCK SAUCES / CHECK TICKET TIMES" },
        { id: "specialsPoint", name: "Specials / Point", section: "PRIMARY", hours: [{ start: 300, end: 1380 }], duty: "CLEAN SPECIALS AREA / RESTOCK" },
        { id: "specialsGrilledBuns", name: "Specials / Grilled / Buns", section: "PRIMARY", hours: [{ start: 660, end: 840 }], duty: "CLEAN GRILL / RESTOCK BUNS", cellOverrides: {"breakfast":"✔️","night":"✔️"} },
        { id: "biscuitsEggs", name: "Biscuits / Eggs", section: "SECONDARY", hours: [{ start: 315, end: 660 }], duty: "CLEAN BISCUIT STATION / WRAP REMAINING" },
        { id: "nuggetsStrips", name: "Nuggets / Strips", section: "SECONDARY", hours: [{ start: 360, end: 1380 }], duty: "CLEAN HOLDING / RESTOCK NUGGETS" },
        { id: "grilledSoupMac", name: "Grilled / Soup / Mac", section: "SECONDARY", hours: [{ start: 510, end: 840 }], duty: "CLEAN SOUP AREA / CHANGE MAC WATER", cellOverrides: {"night":"✔️"} },
        { id: "hashPFry", name: "Hash / P Fry", section: "FRY STATION", hours: [{ start: 420, end: 1380 }], duty: "FILTER HASH OIL / CLEAN FRY AREA" },
        { id: "hashSFry", name: "Hash/S Fry", section: "FRY STATION", hours: null, duty: "CLEAN SECONDARY FRY / RECORD WASTE", cellOverrides: {"breakfast":"split duties","lunch":"split duties","mid":"split duties","night":"✔️"} },
        { id: "machines123", name: "Machines 1,2,3 — DT Lead", section: "MACHINES", hours: [{ start: 510, end: 1380 }], duty: "CLEAN MACHINES / CHECK OIL LEVELS" },
        { id: "machines45", name: "Machines 4,5 / Grills — FOH Lead", section: "MACHINES", hours: [{ start: 1020, end: 1380 }], duty: "FILTER MACHINES / STOCK BREADING TABLE" },
        { id: "breader", name: "Breader", section: "BREADING", hours: [{ start: 345, end: 1380 }], duty: "CLEAN BREADING TABLE (AFTER LAST ORDER)" },
        { id: "loader1", name: "Loader / Filter / Thaw", section: "BREADING", hours: [{ start: 660, end: 840 }], duty: "THAW ROTATION / FILTER SCHEDULE" },
        { id: "loader2", name: "Loader / Filter / Thaw", section: "BREADING", hours: [{ start: 660, end: 840 }], duty: "CHECK THAW TEMPS / ASSIST LOADER" },
        { id: "bulkPrep", name: "Bulk Prep", section: "PREP", hours: [{ start: 300, end: 1380 }], duty: "LABEL & DATE ALL PREP / CLEAN PREP AREA" },
        { id: "truck", name: "Truck", section: "TRUCK / DISH", hours: [{ start: 300, end: 510 }], duty: "PUT AWAY TRUCK ORDER / BOX COMPACTOR" },
        { id: "dish1", name: "Dish 1", section: "TRUCK / DISH", hours: [{ start: 1020, end: 1380 }], duty: "DISH SINK / DISH SHELVING / MOP SINK" },
        { id: "kitchenLeadDt", name: "Kitchen Lead / DT", section: "LEADERSHIP", hours: [{ start: 300, end: 1380 }], duty: "TRANSITIONS / WASTE LOG" },
        { id: "kitchenManagerFc", name: "Kitchen Manager / FC", section: "LEADERSHIP", hours: [{ start: 1020, end: 1380 }], duty: "ERQA / FOOD SAFETY CHECKS", cellOverrides: {"breakfast":"✔️","lunch":"✔️","mid":"✔️"} },
      ],
      Thu: [
        { id: "primaryPoint", name: "Primary Point", section: "PRIMARY", hours: [{ start: 360, end: 1320 }], duty: "STOCK SAUCES / CHECK TICKET TIMES" },
        { id: "specialsPoint", name: "Specials / Point", section: "PRIMARY", hours: [{ start: 300, end: 1380 }], duty: "CLEAN SPECIALS AREA / RESTOCK" },
        { id: "specialsGrilledBuns", name: "Specials / Grilled / Buns", section: "PRIMARY", hours: [{ start: 660, end: 840 }], duty: "CLEAN GRILL / RESTOCK BUNS", cellOverrides: {"breakfast":"✔️","night":"✔️"} },
        { id: "biscuitsEggs", name: "Biscuits / Eggs", section: "SECONDARY", hours: [{ start: 315, end: 660 }], duty: "CLEAN BISCUIT STATION / WRAP REMAINING" },
        { id: "nuggetsStrips", name: "Nuggets / Strips", section: "SECONDARY", hours: [{ start: 360, end: 1320 }], duty: "CLEAN HOLDING / RESTOCK NUGGETS" },
        { id: "grilledSoupMac", name: "Grilled / Soup / Mac", section: "SECONDARY", hours: [{ start: 510, end: 1380 }], duty: "CLEAN SOUP AREA / CHANGE MAC WATER" },
        { id: "hashPFry", name: "Hash / P Fry", section: "FRY STATION", hours: [{ start: 420, end: 1380 }], duty: "FILTER HASH OIL / CLEAN FRY AREA" },
        { id: "hashSFry", name: "Hash/S Fry", section: "FRY STATION", hours: null, duty: "CLEAN SECONDARY FRY / RECORD WASTE", cellOverrides: {"breakfast":"split duties","lunch":"split duties","mid":"split duties","night":"✔️"} },
        { id: "machines123", name: "Machines 1,2,3 — DT Lead", section: "MACHINES", hours: [{ start: 510, end: 1380 }], duty: "CLEAN MACHINES / CHECK OIL LEVELS" },
        { id: "machines45", name: "Machines 4,5 / Grills — FOH Lead", section: "MACHINES", hours: [{ start: 1020, end: 1380 }], duty: "FILTER MACHINES / STOCK BREADING TABLE" },
        { id: "breader", name: "Breader", section: "BREADING", hours: [{ start: 345, end: 1380 }], duty: "CLEAN BREADING TABLE (AFTER LAST ORDER)" },
        { id: "loader1", name: "Loader / Filter / Thaw", section: "BREADING", hours: [{ start: 510, end: 840 }], duty: "THAW ROTATION / FILTER SCHEDULE" },
        { id: "loader2", name: "Loader / Filter / Thaw", section: "BREADING", hours: [{ start: 660, end: 840 }], duty: "CHECK THAW TEMPS / ASSIST LOADER" },
        { id: "bulkPrep", name: "Bulk Prep", section: "PREP", hours: [{ start: 300, end: 1380 }], duty: "LABEL & DATE ALL PREP / CLEAN PREP AREA" },
        { id: "truck", name: "Truck", section: "TRUCK / DISH", hours: [{ start: 300, end: 510 }], duty: "PUT AWAY TRUCK ORDER / BOX COMPACTOR" },
        { id: "dish1", name: "Dish 1", section: "TRUCK / DISH", hours: [{ start: 1020, end: 1380 }], duty: "DISH SINK / DISH SHELVING / MOP SINK" },
        { id: "kitchenLeadDt", name: "Kitchen Lead / DT", section: "LEADERSHIP", hours: [{ start: 300, end: 1380 }], duty: "TRANSITIONS / WASTE LOG" },
        { id: "kitchenManagerFc", name: "Kitchen Manager / FC", section: "LEADERSHIP", hours: [{ start: 1020, end: 1380 }], duty: "ERQA / FOOD SAFETY CHECKS", cellOverrides: {"breakfast":"✔️","lunch":"✔️","mid":"✔️"} },
      ],
      Fri: [
        { id: "primaryPoint", name: "Primary Point", section: "PRIMARY", hours: [{ start: 360, end: 1320 }], duty: "STOCK SAUCES / CHECK TICKET TIMES" },
        { id: "specialsPoint", name: "Specials / Point", section: "PRIMARY", hours: [{ start: 300, end: 1380 }], duty: "CLEAN SPECIALS AREA / RESTOCK" },
        { id: "specialsGrilledBuns", name: "Specials / Grilled / Buns", section: "PRIMARY", hours: [{ start: 660, end: 840 }], duty: "CLEAN GRILL / RESTOCK BUNS", cellOverrides: {"breakfast":"✔️","night":"✔️"} },
        { id: "biscuitsEggs", name: "Biscuits / Eggs", section: "SECONDARY", hours: [{ start: 315, end: 660 }], duty: "CLEAN BISCUIT STATION / WRAP REMAINING" },
        { id: "nuggetsStrips", name: "Nuggets / Strips", section: "SECONDARY", hours: [{ start: 360, end: 1320 }], duty: "CLEAN HOLDING / RESTOCK NUGGETS" },
        { id: "grilledSoupMac", name: "Grilled / Soup / Mac", section: "SECONDARY", hours: [{ start: 510, end: 1380 }], duty: "CLEAN SOUP AREA / CHANGE MAC WATER" },
        { id: "hashPFry", name: "Hash / P Fry", section: "FRY STATION", hours: [{ start: 420, end: 1380 }], duty: "FILTER HASH OIL / CLEAN FRY AREA" },
        { id: "hashSFry", name: "Hash/S Fry", section: "FRY STATION", hours: [{ start: 660, end: 840 }], duty: "CLEAN SECONDARY FRY / RECORD WASTE", cellOverrides: {"breakfast":"split duties","mid":"✔️","night":"✔️"} },
        { id: "machines123", name: "Machines 1,2,3 — DT Lead", section: "MACHINES", hours: [{ start: 510, end: 1380 }], duty: "CLEAN MACHINES / CHECK OIL LEVELS" },
        { id: "machines45", name: "Machines 4,5 / Grills — FOH Lead", section: "MACHINES", hours: [{ start: 660, end: 840 }, { start: 1020, end: 1380 }], duty: "FILTER MACHINES / STOCK BREADING TABLE" },
        { id: "breader", name: "Breader", section: "BREADING", hours: [{ start: 345, end: 1380 }], duty: "CLEAN BREADING TABLE (AFTER LAST ORDER)" },
        { id: "loader1", name: "Loader / Filter / Thaw", section: "BREADING", hours: [{ start: 510, end: 840 }, { start: 1020, end: 1200 }], duty: "THAW ROTATION / FILTER SCHEDULE", cellOverrides: {"mid":"✔️"} },
        { id: "loader2", name: "Loader / Filter / Thaw", section: "BREADING", hours: [{ start: 660, end: 840 }], duty: "CHECK THAW TEMPS / ASSIST LOADER" },
        { id: "bulkPrep", name: "Bulk Prep", section: "PREP", hours: [{ start: 300, end: 1380 }], duty: "LABEL & DATE ALL PREP / CLEAN PREP AREA" },
        { id: "truck", name: "Truck", section: "TRUCK / DISH", hours: [{ start: 300, end: 510 }], duty: "PUT AWAY TRUCK ORDER / BOX COMPACTOR" },
        { id: "dish1", name: "Dish 1", section: "TRUCK / DISH", hours: [{ start: 1020, end: 1380 }], duty: "DISH SINK / DISH SHELVING / MOP SINK" },
        { id: "kitchenLeadDt", name: "Kitchen Lead / DT", section: "LEADERSHIP", hours: [{ start: 300, end: 1380 }], duty: "TRANSITIONS / WASTE LOG" },
        { id: "kitchenManagerFc", name: "Kitchen Manager / FC", section: "LEADERSHIP", hours: [{ start: 660, end: 1380 }], duty: "ERQA / FOOD SAFETY CHECKS", cellOverrides: {"breakfast":"✔️","mid":"✔️"} },
      ],
      Sat: [
        { id: "primaryPoint", name: "Primary Point", section: "PRIMARY", hours: [{ start: 360, end: 1320 }], duty: "STOCK SAUCES / CHECK TICKET TIMES" },
        { id: "specialsPoint", name: "Specials / Point", section: "PRIMARY", hours: [{ start: 300, end: 1380 }], duty: "CLEAN SPECIALS AREA / RESTOCK" },
        { id: "specialsGrilledBuns", name: "Specials / Grilled / Buns", section: "PRIMARY", hours: [{ start: 660, end: 840 }], duty: "CLEAN GRILL / RESTOCK BUNS", cellOverrides: {"breakfast":"✔️","night":"✔️"} },
        { id: "biscuitsEggs", name: "Biscuits / Eggs", section: "SECONDARY", hours: [{ start: 315, end: 660 }], duty: "CLEAN BISCUIT STATION / WRAP REMAINING" },
        { id: "nuggetsStrips", name: "Nuggets / Strips", section: "SECONDARY", hours: [{ start: 360, end: 1320 }], duty: "CLEAN HOLDING / RESTOCK NUGGETS" },
        { id: "grilledSoupMac", name: "Grilled / Soup / Mac", section: "SECONDARY", hours: [{ start: 510, end: 1380 }], duty: "CLEAN SOUP AREA / CHANGE MAC WATER" },
        { id: "hashPFry", name: "Hash / P Fry", section: "FRY STATION", hours: [{ start: 420, end: 1380 }], duty: "FILTER HASH OIL / CLEAN FRY AREA" },
        { id: "hashSFry", name: "Hash/S Fry", section: "FRY STATION", hours: [{ start: 660, end: 840 }], duty: "CLEAN SECONDARY FRY / RECORD WASTE", cellOverrides: {"breakfast":"split duties","mid":"✔️","night":"✔️"} },
        { id: "machines123", name: "Machines 1,2,3 — DT Lead", section: "MACHINES", hours: [{ start: 510, end: 1380 }], duty: "CLEAN MACHINES / CHECK OIL LEVELS" },
        { id: "machines45", name: "Machines 4,5 / Grills — FOH Lead", section: "MACHINES", hours: [{ start: 660, end: 840 }, { start: 1020, end: 1380 }], duty: "FILTER MACHINES / STOCK BREADING TABLE" },
        { id: "breader", name: "Breader", section: "BREADING", hours: [{ start: 345, end: 1380 }], duty: "CLEAN BREADING TABLE (AFTER LAST ORDER)" },
        { id: "loader1", name: "Loader / Filter / Thaw", section: "BREADING", hours: [{ start: 510, end: 840 }, { start: 1020, end: 1200 }], duty: "THAW ROTATION / FILTER SCHEDULE", cellOverrides: {"mid":"✔️"} },
        { id: "loader2", name: "Loader / Filter / Thaw", section: "BREADING", hours: [{ start: 660, end: 840 }], duty: "CHECK THAW TEMPS / ASSIST LOADER" },
        { id: "bulkPrep", name: "Bulk Prep", section: "PREP", hours: [{ start: 300, end: 1380 }], duty: "LABEL & DATE ALL PREP / CLEAN PREP AREA" },
        { id: "truck", name: "Truck", section: "TRUCK / DISH", hours: [{ start: 300, end: 510 }], duty: "PUT AWAY TRUCK ORDER / BOX COMPACTOR" },
        { id: "dish1", name: "Dish 1", section: "TRUCK / DISH", hours: [{ start: 1020, end: 1380 }], duty: "DISH SINK / DISH SHELVING / MOP SINK" },
        { id: "kitchenLeadDt", name: "Kitchen Lead / DT", section: "LEADERSHIP", hours: [{ start: 300, end: 1380 }], duty: "TRANSITIONS / WASTE LOG" },
        { id: "kitchenManagerFc", name: "Kitchen Manager / FC", section: "LEADERSHIP", hours: [{ start: 660, end: 1380 }], duty: "ERQA / FOOD SAFETY CHECKS", cellOverrides: {"breakfast":"✔️","mid":"✔️"} },
      ],
    },

  },

  /* ── 4. AREA OWNERS ─────────────────────────────────────────────────────
     Who owns what, as data. Carried from orgSeats.js, which is already the one
     source both the accountability chart and the Worker's routing read.

     ⚠️ `holder` IS FOR HUMANS, `holderId` IS THE ROUTE. The display name drifts
     and the roster id does not — the chart says "Lizy Gonzalez" where HR says
     "Lizbeth", one person, two spellings. Route on the id.

     ⚠️⚠️ NOBODY IS A REAL ANSWER, AND SEVEN OF THESE ARE NOBODY. Matt asked
     for that explicitly, and it is the honest state: the Hub can only route to
     an area that has a seat, and waste, training, leadership development,
     supply ordering, HR and payroll have never had one. People plainly DO
     these jobs at Gate City — that is not in question. The routing layer has
     simply never been told, so `holderId: null` is a true statement about the
     software and nothing here should pretend otherwise by guessing a name off
     a job title.

     ⚠️ TWO ID SPACES, AND THEY DO NOT MATCH. `holderId` here is the tm-prefixed
     HR roster id ("tm16"). TILE_ALLOW_IDS further down this same file uses the
     bare number ("16") for the same person. Both are correct for their own
     caller today. A settings screen offering one roster picker for both would
     write the wrong shape into one of them, so step 3 must not assume they are
     interchangeable.

     ⚠️ CASH AUDIT AND CLEANING HAVE A SEAT AND ARE STILL RESOLVED PER DAY.
     That is Matt's own rule — "audit is by open and closing leaders" — so the
     Worker reads the day's board rather than this seat. The seat is kept
     because it is the escalation target and the chart prints it. Do not wire
     step 2 to prefer this over the board for those two.

     ⚠️ DRIVE THRU IS TWO SEATS, SPLIT BY SHIFT, NOT BY FUNCTION. Collapsing
     them into one picker in step 3 would lose which half of the day each
     person runs. */
  /* ★ THE PEOPLE LISTS LIVE IN `ownerSeed.js`, AND THE REASON IS EXPOSURE
     RATHER THAN INHERITANCE. `ownPeopleList` below already withholds all of
     this from any store that is not us. What it cannot do is stop the values
     SHIPPING: config defaults are bundled like any other source, so another
     store's team member could read our leadership by name and the twelve full
     names in `seats`. One file that exists to be swapped beats fifteen lists
     emptied by hand inside this one. See that file's header for why this is
     not a move to storage, and why `seats` in particular never can be.
     ⚠️ THE VALUE IS UNCHANGED. This is a relocation, asserted byte for byte
     against the pre-move object, not a rewrite. */
  owners: OWNER_SEED,

  /* ── 5. FEATURES ────────────────────────────────────────────────────────
     ⚠️⚠️ ALL FIVE ARE TRUE BECAUSE ALL FIVE ARE ON TODAY. Step 1 records the
     current state and wires nothing. Turning one to false right now does
     exactly nothing, and that is correct for this step.

     ⚠️⚠️ READ THIS BEFORE WIRING THEM IN STEP 2. Only ONE of the five is a
     tile, so "false hides the tile" is not a plan that survives contact with
     four of them:

       teamSite      IS a tile ("teamsite", Peak Reachers). Hiding it works.
       profitShare   a TAB inside Financials. Self-contained: its config lives
                     in its own record that nothing else reads, and no published
                     row or labor figure touches it. Safe to hide.
       pto           a TAB inside Financials.
       aiSummaries   NOT a tile. A scheduled job PLUS the Focus Today card, so
                     it is gated in two places. Hiding only the card would leave
                     a store that switched it off still getting a 7am post in
                     their Slack channel every morning.

       ⚠️⚠️ I HAD `pto` WRONG AND IT IS WORTH WRITING DOWN WHY. I read the FCR's
       `mtd.pto` and concluded the PTO tracker fed the labor percentage, so
       turning it off would be a money change. Matt, Aug 11 2026: "Pto tab
       shouldn't feed labor yet because it doesn't know pay. I manually add pto
       and bonus pay in the fcr. The pto tracker is just a tool to track days
       left YTD rn." He is right, and the code agrees:
         · the tracker owns `gcfcr-pto-v1`, a DAYS ledger, read by itself and by
           one input-freshness check — never by anything financial;
         · labor % runs on `mtd.pto`, which is DOLLARS typed into three boxes on
           the FCR record, a different key entirely.
       Two things called PTO, no wire between them. Hiding the tracker hides a
       days-left tool and touches no money at all.
       ⚠️ THAT CHANGES IF THE TRACKER EVER LEARNS PAY RATES. The moment it can
       compute dollars and feed the FCR, this flag stops being cosmetic. Check
       that before assuming it is still safe.

       ⚠️ `teamGroups` IS GONE FROM THIS LIST. It does not exist under that name
       anywhere in the repo, and a flag that gates nothing is worse than no flag
       — it reads as a working switch on the settings screen and does nothing.
       The nearest real feature is team GOALS, which is nested inside Peak
       Reachers and already disappears with `teamSite`. If it needs its own
       switch later, it gets one then, named after the thing it actually hides. */
  features: {
    profitShare: true,
    pto: true,
    teamSite: true,
    aiSummaries: true,
    /* ★ TOKENS — OFF BY DEFAULT EVERYWHERE ELSE, ON HERE SINCE Aug 13 2026.
       Built Aug 11 (Matt: "This is a Hub feature, per store, off by default",
       and "I need this for the hub clone") and shipped switched off at the
       store that wrote it, because a store turns tokens on when it has decided
       what a token buys, not because the code arrived. Matt decided: "Turn
       tokens on."
       ⚠️ IT MUST BE THE LITERAL `false` TO BE OFF, NOT ABSENT. canUseTool gates
       on `storeCfg(...) === false`, so a MISSING flag SHOWS the tile. "Off by
       default" and "not mentioned" are opposites in this codebase. Deleting
       this line would not turn the feature off, it would turn it on.
       ⚠️ THE CLONE IS STILL OFF. This is a per-store decision and The Village
       has not made it; do not "sync" this line across.
       ⚠️ THE SHOP IS EMPTY UNTIL SOMEBODY FILLS IT. The catalog is store data in
       KV, not code (see the tokens block below), so on the first day everyone
       sees a balance of 0 and nothing to spend it on. That is the designed
       state, not a broken deploy. */
    tokens: true,
  },

  /* ── TOKENS ─────────────────────────────────────────────────────────────
     ⚠️⚠️ THE WORD A PERSON SEES IS A SETTING, AND THAT IS THE POINT. Matt: "Do
     NOT call these points. Gate City already uses 'points' to mean DISCIPLINE
     points from infractions. A reward currency called points in the same app
     would be actively confusing to a team member who has just been written up."
     The code says tokens everywhere; the screen says whatever the store put
     here. A clone renames the whole feature by editing two strings.

     ⚠️ NO CATALOG HERE, DELIBERATELY. What a token buys changes as often as a
     store feels like changing it, so it is store DATA in KV
     (`gcfcr-tokens-catalog-v1`), edited on screen, not a code constant somebody
     has to deploy for. It ships EMPTY: "What a token buys is the store's
     decision and their money, not ours."

     `grantMinTier` is the Hub's own 1/2/3 and nothing new — 3 is Director and
     above, which is Matt's stated default.

     ⚠️⚠️ 3 IS A DECISION, NOT A LEFTOVER DEFAULT. Matt was asked on Aug 13 2026,
     the day tokens went live, whether granting should stay Director-only or open
     to any leader. He chose Director-only: this hands out something the store
     pays for, widening it later is easy and taking it back is awkward.
     ⚠️ THERE IS AN UNMERGED BRANCH THAT WOULD UNDO THIS. `claude/village-new-0f7y5p`
     sets `grantMinTier: 2` and moves `KVSET_MIN_RANK["gcfcr-hr-tokens-v1"]` from
     6 to 3 to match, which opens granting to Senior Trainer, Junior Team Leader,
     Team Leader, Assistant Director and up. It was written before Matt was asked
     and it now conflicts with this file on the `tokens` flag, so somebody WILL
     resolve that conflict by hand. Take the widening only if Matt says so again;
     do not let it ride in as part of a merge nobody read.

     ⚠️ AND IF IT IS EVER WIDENED, BOTH GATES MOVE OR NEITHER DOES. This value is
     the SCREEN. `KVSET_MIN_RANK["gcfcr-hr-tokens-v1"]` in worker.js is the DOOR,
     and it counts in HR ranks rather than tiers. Today they agree: tier 3 here,
     rank 6 there, and roleTier maps rank >= 6 to tier 3. Move one alone and a
     leader gets a Grant button that answers 403. That pairing was found by the
     session that wrote the branch above, and it is the useful half of its work. */
  tokens: {
    label: "tokens",
    labelOne: "token",
    grantMinTier: 3,
  },

  /* ── TEAM SITE ──────────────────────────────────────────────────────────
     ★★ THE MENTORSHIP PROGRAMME'S NAME IS A SETTING, for exactly the reason
     `tokens.label` above is one: it is a word a team member reads, and it is
     this store's word rather than the Hub's.

     ⚠️ THIS IS NOT A REFINEMENT. "Peak Reachers" was written into eleven files
     and shipped **20 times in the built client bundle** (measured Aug 13 2026
     in `dist/assets`, `grep -o | wc -l`). Every clone inherits all twenty, and
     the second store is still carrying eleven of them today because emptying a
     name by hand stops wherever the person doing it got tired. A store cannot
     rename its own programme without a deploy, which is absurd for a heading.

     ⚠️ THE DEFAULT IS GATE CITY'S REAL NAME AND THAT IS CORRECT. This is Gate
     City's repo, so nothing changes here: every reader falls back to this exact
     string. **A clone changes this ONE line at snapshot time** and the whole
     app follows, or types it in Store Settings and does not touch code at all.
     Do NOT "scrub" this to a generic word — that would leave Gate City's own
     team site unnamed until somebody saved a setting.

     ⚠️ READ IT AT RENDER TIME, NEVER AT MODULE LEVEL. `storeCfg` reads `LIVE`,
     and `applyStoreOverrides` merges a store's saved settings AFTER the modules
     have imported. A module-level `const NAME = storeCfg(...)` would capture the
     unsaved default forever and look correct at Gate City, where they are the
     same string. That is why `demerits.js`, `hubTraining.js` and
     `expenseDefaults.js` are NOT wired to this yet: they are module-level data
     arrays and the wiring is a shape change, not a substitution. Three strings,
     recorded rather than half-done.

     ⚠️ `PeakReachers.jsx:456` STILL CARRIES "Est. April 2018 — Greensboro, NC".
     Same class of problem, different field, and deliberately not folded in here
     so this change stays one thing. The second store's config already has an
     `established` field for it; take that shape when it is done. */
  teamSite: {
    programName: "",
    /* ⚠️ THE MONTH WE OPENED, AND THE YEARS COUNT IS DERIVED FROM IT, never
       typed beside it. The hero badge and the Years of Service stat were two
       hardcoded facts about this store sitting in a file every clone runs, and
       "8+" would have gone stale here on its own next April even without a
       second store existing.
       ⚠️ FORMAT IS "Month YYYY" and `yearsSince` in the team site returns null
       for anything else. Blank is a working state: no date on the badge and no
       Years of Service tile, rather than a confident "0+". */
    established: "",
    /* ⚠️ A LABEL, NOT A COUNT. Deliberately a string like "100+" rather than a
       number the Hub works out from the roster: the roster is the people with
       Hub accounts, which is not the same as how a store describes its team on
       its own front page, and a stat that silently drifted every time somebody
       was hired would be worse than one a director types. Blank hides the tile. */
    teamCount: "",
    /* ⚠️ THE CHICK-FIL-A RESTAURANT MISSION, WHICH IS WHY THIS ONE IS NOT
       BLANKED IN A CLONE while the four below it are. It is the same sentence
       at every Chick-fil-A, so a new store inherits something true rather than
       something borrowed. Editable all the same; blank hides the card. */
    mission: "Great food served quickly by friendly team members in a clean and safe environment.",
    /* ⚠️⚠️ THIS IS THE SENTENCE THAT STARTED DESIGN RULE 18, and it is kept here
       as the store's own data precisely because of it. A clone's team site read
       "To be **Greensboro's** most caring company" to a team that may be
       nowhere near Greensboro, and it was found by a real leader reading her
       own store's live site, not by any check we run.
       ⚠️ BLANK IS THE RIGHT DEFAULT FOR A CLONE, not a rewritten guess. A vision
       is a thing a leadership team agrees on; the Hub's job is to hold it, not
       to invent one. Blank hides the Vision card entirely. */
    vision: "",
    /* ⚠️ ANY NUMBER OF THEM. These are drawn as the stops on the ridge, and the
       geometry is DERIVED from how many there are — it used to be a hand-written
       table of exactly five, so a store with four or six would have been drawn
       wrong or told to pad. Empty hides the whole panel. */
    values: [],
    valuesTitle: "",   // the name of your framework, if you have one
    /* ⚠️ THE RALLY CRY IS OURS TOO, and it is the vision wearing a different
       hat: "Win moments. Win hearts." is this store's "Winning Hearts Everyday".
       Blank hides the whole band rather than leaving an empty dark stripe. */
    rallyCry: "",
    rallyLine: "",
  },

  /* ── 6. FINANCIAL ───────────────────────────────────────────────────────
     ⚠️ THE LABOR GOAL IS NOT A PERCENTAGE ANYWHERE IN THIS CODEBASE, so there
     is no labor percent to move. It is COMPUTED from the benchmark tier and
     the planned wage. Those two are the store's real inputs and both are here.
     The tier table itself (fixed hours and marginal rate per tier) is CFA's
     benchmark, not this store's setting, so it stays in the labor engine.

     ⚠️ TWO GOALS ARE ALREADY DUPLICATED IN THE CODE and this is where that
     stops. The food goal 0.2756 is typed in App.jsx and eighteen more times in
     the projection data. The paper goal 3.27 is typed in two files. Step 2
     collapses those onto this one.

     ⚠️ `lastYearMonthlySales` IS THE WORST CLONE HAZARD IN THE REPO. The FCR
     falls back to it when a store has no last-year dailies of its own, so a
     NEW STORE SILENTLY READS GATE CITY'S SALES AS THEIR LAST YEAR for a whole
     year — every growth number and every projected finish measured against a
     restaurant they have never seen. The figures deliberately do NOT live in
     this file; see the note on the field itself for why, and for what that
     costs step 3. */
  financial: {
    feeShare: 0.15,                 // CFA base operating service fee share of sales
    mileageRate: 0.70,              // dollars per mile, catering reimbursement
    fixedDollarLines: ["Equipment Rent", "Business Service Fee"],
    laborTier: "top20",             // Gate City has historically been measured here
    plannedWage: 18.5,
    goals: {
      food: 0.2756,
      paper: 3.27,
      turnover: 0.08,
      salesGrowth: 0.05,
      evalsOnTime: 0.9,
      carsPerHour: 165,
      /* ⚠️ `independentAssessments: 3` WAS HERE AND WAS MISFILED BY ME. It is
         Kyleeka's quarterly rock ("develop 3-4 shift leaders"), which is one
         person's target for one quarter, not a setting a new store types in on
         day one. It stays in ShiftLeaderScorecard.jsx where the rock lives.
         The test that sorted it: would a second store, on their first morning,
         know what to put here? For a food cost goal, yes. For somebody else's
         rock, no — and a settings screen full of things nobody can answer is
         how a setup gets abandoned halfway. */
    },
    /* The amber band around the paper goal: at or under goal is green, up to
       +0.25 is watch, above is red.
       ⚠️ IT WAS DECLARED IN TWO FILES UNDER TWO NAMES — PAPER_BAND in
       inputRegistry.js and PAPER_AMBER_BAND in ShiftLeaderScorecard.jsx, same
       0.25, neither aware of the other. That is the same drift the paper GOAL
       had, and it grades the same number: the scorecard could call a week amber
       while the input register called it red. A threshold rather than a goal,
       so it sits beside `goals` rather than inside it. */
    paperBand: 0.25,
    /* ⚠️⚠️ THE FIGURES ARE NOT HERE, AND MUST NEVER BE PUT HERE.
       `lastYearMonthlySales` is a REAL STORE SETTING and it is the worst clone
       hazard in the repo — see the note above. It still belongs to the config
       layer conceptually, and it CANNOT LIVE IN THIS FILE, because this file
       ships to every browser with no account.

       🐛 CAUGHT BY REBUILDING, NOT BY READING. The first draft of this section
       carried all twelve 2025 monthly figures, and a grep of dist/assets found
       every one of them in a public chunk — re-opening by hand exactly the leak
       the Aug 8 and Aug 9 sweeps closed. Source greps were clean. Only the
       built bundle showed it.

       WHERE IT ACTUALLY LIVES: fcrReferenceData.js, imported ONLY by worker.js
       and served by /api/fcr-data behind the tier 3 gate. That is correct and
       it stays there. A clone MUST set it empty and get "not enough history"
       rather than a confident number measured against a restaurant they have
       never seen.

       ⇒ STEP 3 NOTE: the settings screen can offer this field, but reading and
       writing it has to go through the gated route, never through this file. */
    lastYearMonthlySales: null,
  },

  /* ── 7. MESSAGING ───────────────────────────────────────────────────────
     ⚠️ THIS FILE SHIPS TO THE BROWSER. storeConfig.js is imported by App.jsx
     and a dozen tiles, so anything added here is downloadable by anyone with
     no account — that is sweep finding 30.
     ⇒ ONLY CHANNEL NAMES LIVE HERE. A name is a name; a private channel ID is
     not, and the two the Hub uses stay in worker.js where the only code that
     needs them already lives.
     ⚠️ DO NOT PUT A PRIVATE CHANNEL ID BACK IN HERE. That was done on Aug 9
     adding Hannah's catering channel and it widened finding 30 by one entry
     before a bundle scan caught it.

     ⚠️⚠️ `leaders` IS EMPTY ON PURPOSE AND STEP 3 CANNOT FILL IT FROM A
     BROWSER. Matt's section list asks for a leaders channel. The Hub's is
     #assistant-directors, which is PRIVATE and is therefore addressed by raw
     ID from the Worker — a name lookup cannot find a private channel. So the
     settings screen can offer the field, but saving it has to go somewhere the
     browser never reads it back from. Left empty and flagged rather than
     quietly filled with a name that would not resolve.

     ⚠️ ALL OF THESE ARE PRIVATE CHANNELS. The "Gate City Hub" bot has to be
     invited to each one or every post silently does nothing. */
  messaging: {
    opsSuccess: "operational-success",   // monthly reports, change fund, boil notices, QIV
    brand: "guardian-of-the-brand",      // food safety walks, cleaning roll-ups
    inventory: "inventory-management",   // waste, donations, supply orders
    team: "gate-city-team",              // the team scoreboard
    leaders: "",                         // see the warning above
  },

  /* ── 8. SHIFT SWAPS ─────────────────────────────────────────────────────
     Matt, Aug 14 2026: "i want the hub to auto approve shift swaps with rules",
     and "We will be testing shift swaps next week before launching the
     schedule."

     ⚠️⚠️ `autoApprove` SHIPS FALSE AT EVERY STORE INCLUDING THIS ONE. Letting
     the Hub take somebody off a shift and put somebody else on it with nobody
     looking is a decision an operator makes, not one the code makes by
     arriving. Same reasoning as `features.tokens`, and the same shape: the
     switch is store data with a screen.

     ⚠️ THE OTHER TWO NUMBERS ONLY MATTER WHEN IT IS ON, and they are the rules
     that hold it back rather than settings that make it work. See
     DEFAULT_SWAP_POLICY in shiftMarket.js, which is where they are read and
     where each one's reason is written. Changing them here changes the
     machine's judgement for the whole store, so they get a screen too rather
     than living as a constant somebody has to deploy for (design rule 18).

     ⚠️ `maxDropsPerWeek` IS THE FLIGHT RISK RULE. Matt: "also pay attention to
     the shift swaps for flight risks." Somebody handing off their third shift
     of the week still gets to put it up; they just meet a human. */
  swaps: {
    autoApprove: false,
    minNoticeHours: 12,
    maxDropsPerWeek: 2,
  },

  /* ★★ WHAT THIS STORE CALLS ITS OWN LEADERSHIP ROLES.
     See `extraTitleRanks()` below for the whole reasoning. Each entry is a
     title this store uses, pointed at a rank the Hub already has.

     ⚠️ EMPTY HERE AND EMPTY IN A CLONE, ON PURPOSE. A store types its own in
     Store Settings; nobody inherits anybody else's vocabulary.
     ⚠️ THE RANK IS ACCESS, NOT SENIORITY. 4 is Assistant Director and cannot
     open a personnel file; 5 is Director and can open every one. That is the
     whole decision, and the settings screen has to say it in those words.
     ⚠️ ONLY KEYS THE DEFAULT ALREADY KNOWS SURVIVE `applyStoreOverrides`, which
     merges saved settings over this object — so this section has to exist here,
     even empty, or a store's saved titles are dropped on load. `hr.extraTitles`
     is in `OPEN_KEY_MAPS` for the same reason, one layer down: the KEYS are the
     store's answer and cannot be listed in advance. */
  hr: {
    extraTitles: {},
  },
};

/* ══════════════════════════════════════════════════════════════════════════
   A STORE'S OWN LEADERSHIP TITLES.

   A store names its own roles — Kitchen Director, Talent Director, Hospitality
   Director — and every one of those scores 0 against the built-in ladder, which
   is Limited. This is where a store says "our Kitchen Director has the access
   your Director has" without the Hub having to know the word in advance.

   ⚠️ CAPPED AT 5, WHICH IS Director. Ranks 6 and up are Leadership Development
   Director, Executive Director, Human Resources, Accounts Payable and Owner —
   the roles the Hub's own gates and the Worker's HR routes are written around.
   A store must not be able to mint one of those from a settings screen. Five is
   still the rank that reads every personnel file, so the editor has to say so
   out loud; the cap stops the worst outcome, it does not remove the decision.

   ⚠️ EMPTY IS THE DEFAULT AND IS CORRECT EVERYWHERE. A clone that has typed
   nothing inherits no store's vocabulary.

   ⚠️ READ AT CALL TIME, NEVER CAPTURED. Same rule as every other list in this
   file: a `const` here would freeze the shipped default before a store's saved
   settings arrive. */
export const HR_EXTRA_TITLE_MAX_RANK = 5;

export function extraTitleRanks() {
  const raw = storeCfg("hr.extraTitles", null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  Object.keys(raw).forEach((k) => {
    const name = String(k || "").trim();
    const rank = Number(raw[k]);
    /* ⚠️ A BAD ROW IS DROPPED, NOT CLAMPED. Clamping a 9 down to 5 would hand
       somebody Director access because a typo landed near it. A row that does
       not make sense should do nothing at all. */
    if (!name) return;
    if (!Number.isInteger(rank) || rank < 1 || rank > HR_EXTRA_TITLE_MAX_RANK) return;
    out[name] = rank;
  });
  return out;
}

/* Frozen all the way down. The flat objects in this file have always been
   frozen; the new sections nest, and a frozen outer object with a mutable
   array inside it is a gate that looks locked and is not.
   ⚠️ Under 20 lines, so no dependency (design rule 5). */
function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

export const STORE_CONFIG = deepFreeze(CONFIG);

/* ⚠️ DECLARED HERE, ABOVE EVERY READER, ON PURPOSE. `storeCfg` below reads it,
   and a `let` read before its declaration line throws rather than returning
   undefined. Nothing calls storeCfg during module evaluation today, so the
   order below would also have worked — but "works because nobody calls it yet"
   is one refactor away from a blank screen, and this file is imported by both
   the browser and the Worker. See the block further down for what it is. */
let LIVE = STORE_CONFIG;

/**
 * storeCfg("financial.goals.food")  →  0.2756
 *
 * The one reader. Takes a dotted path and returns the value, or `fallback`
 * when any step of the path is missing.
 *
 * ⚠️ IT NEVER THROWS, AND THAT IS THE POINT. This gets called from render
 * paths and from the Worker. A reader that can throw on a typo'd path takes a
 * tile to its crash boundary over a missing setting, which is a blank screen
 * where a sensible default would have done.
 * ⚠️ `undefined` FALLS BACK, `null` AND `false` AND `0` DO NOT. A store that
 * deliberately sets a goal to 0 or a feature to false means it, and a reader
 * that treated those as "missing" would hand back the Gate City value instead.
 */
export function storeCfg(path, fallback = undefined) {
  if (!path || typeof path !== "string") return fallback;
  let cur = LIVE;
  for (const key of path.split(".")) {
    if (cur == null || typeof cur !== "object" || !(key in cur)) return fallback;
    cur = cur[key];
  }
  return cur === undefined ? fallback : cur;
}

/* ═══ IS THIS THE ORIGINAL STORE? ═════════════════════════════════════════
   ★★ ONE ANSWER, IN ONE PLACE (design rule 8), AND READ AT CALL TIME.
   Two lists in this repo are Gate City's 106 real people: RAW_TEAM in
   hrTeam.js and HR_SEED_ROLES in hrRoster.js. They are the BASE the roster is
   built from, so a second store would see Gate City's whole team by name with
   their own people underneath. Both loaders ask this before using their seed.

   ⚠️⚠️ CALL IT INSIDE A LOADER, NEVER AT MODULE LEVEL. `TEAM` and
   `HR_SEED_ROLES` are built the moment their files import, which is before any
   saved setting has arrived. Gate the CONSTANT and you have captured the
   default and learned nothing; gate the LOADER and the answer is current. That
   is the exact module-load-versus-use-time trap this whole config layer exists
   to close, and it is the reason this is a function and not a const.

   ⚠️ EMPTYING THE SEED IS SAFE, AND IT WAS MEASURED RATHER THAN ASSUMED
   (Aug 11 2026, and the same claim is in hrTeam.js's header from Aug 7). With
   the seed at zero: nothing throws, `hrTitleFor` answers "" for an unknown id,
   and `hrIsFullReader` returns false for every id including 33 — it fails
   CLOSED, so an unknown person gets no access rather than all of it. A roster
   imported into gcfcr-hr-added-v1 resolves normally on top of an empty seed.

   ⚠️ worker.js HAS ITS OWN GATE_CITY_FSR LITERAL AND THE TWO MUST STAY APART.
   That one exists so a clone's hardcoded Slack recipients self-disable, and the
   Worker reads this file at module load and never re-reads it. Pointing it at
   this function would make a guard that is supposed to be fixed start
   following a setting the Worker cannot see change. Two literals, on purpose.

   ⚠️ KNOWN EDGE, NOT SOLVED HERE. Because the Worker never boots the saved
   config, this returns true inside the Worker for any deploy whose
   storeConfig.js still carries 04010. For a real install that is fine: a
   clone's deployed defaults are its own. It would only bite a clone that left
   the code defaults alone and set its store number in Settings only. */
export function isGateCity() {
  return String(storeCfg("identity.fsr", "")) === "04010";
}

/* ═══ WHAT THE STORE HAS ACTUALLY SAVED ═══════════════════════════════════
   ★★ THE WHOLE POINT OF STEP 3, AND THE REASON IT NEEDED A READER CHANGE
   BEFORE IT NEEDED A SCREEN.

   STORE_CONFIG above is the CODE DEFAULT and never changes. `LIVE` is what the
   app should actually read: the defaults until a store's saved settings arrive,
   the merged result afterwards.

   🐛 WHY A SETTINGS SCREEN ALONE WOULD NOT HAVE WORKED. Every consumer reads
   this file at MODULE LOAD — `const PAPER_GOAL = STORE_CONFIG.financial.goals.paper`
   captures its value the moment the file is imported, before any fetch can run.
   A screen that saved to storage would have saved fine and moved nothing on any
   screen. Mutating the object at boot does not fix it either: the primitive is
   already captured. The fix is that reads happen through `storeCfg()` at USE
   time, which is what the consumers are being changed to one file at a time.

   ⚠️ MERGE, NEVER REPLACE, AND KEY BY KEY. A store that overrides one goal must
   not blank the other six. Design rule 1: nothing already stored changes shape,
   and a store with nothing saved behaves exactly as it did yesterday.

   ⚠️ ARRAYS REPLACE WHOLE, and that is deliberate rather than lazy. The station
   list, the seat list and the fixed-dollar line names are ORDERED SETS, not bags
   of keys — merging index by index would leave a store that deleted a station
   holding a spliced hybrid of theirs and ours, which is worse than either.

   ⚠️ IT REFUSES A BAD SHAPE RATHER THAN APPLYING PART OF ONE. Anything that is
   not a plain object is ignored outright and the defaults stand. A half-applied
   config is the failure mode this whole layer exists to avoid; a store that sees
   its own settings not take effect will say so, and a store running on a silent
   hybrid of its settings and Gate City's will not.

   ⚠️ IT IS IDEMPOTENT AND ALWAYS MERGES FROM THE DEFAULTS, never from the last
   merge. Applying twice gives the same answer as applying once, so a re-fetch
   or a second call cannot compound. (`LIVE` itself is declared up beside
   STORE_CONFIG, above every reader.) */

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/* ══════════════════════════════════════════════════════════════════════════
   SECTIONS WHOSE KEYS ARE THE STORE'S OWN ANSWER.

   `mergeDeep` normally drops any key the defaults do not already know, because
   a typo in a saved record must not invent a setting nothing reads. That is
   right for every fixed setting and WRONG for a map whose keys are data the
   store supplies — a store's own leadership titles cannot be listed here in
   advance, so the guard would silently delete every one of them on load.

   ⚠️ A PATH ONLY BELONGS HERE WHEN THE KEYS ARE DATA THE STORE SUPPLIES. The
   test is: could I list every valid key in this file? If yes, it is not an open
   map and it must not be added.

   ⚠️ `doors.byDay` IS ON THIS LIST AT GATE CITY AND NOT HERE, because this
   store's config has no `doors` section yet. When it gains one, add the path —
   that store lost every opening time a person typed until this was fixed. */
const OPEN_KEY_MAPS = new Set([
  "hr.extraTitles",
]);

function mergeDeep(base, over, path = "") {
  const out = Array.isArray(base) ? [...base] : { ...base };
  const open = OPEN_KEY_MAPS.has(path);
  for (const k of Object.keys(over || {})) {
    const b = out[k], o = over[k];
    /* An override may only fill a key the defaults already know about. A typo
       in a saved record must not invent a setting nothing reads.
       ⚠️ UNLESS THIS IS AN OPEN MAP, where the keys ARE the store's answer. */
    if (!(k in out) && !open) continue;
    const next = path ? `${path}.${k}` : k;
    out[k] = isPlain(b) && isPlain(o) ? mergeDeep(b, o, next) : o;
  }
  return out;
}

/** Apply a store's saved settings over the code defaults. Returns true when
 *  something was applied, false when the input was unusable and the defaults
 *  were left alone. */
export function applyStoreOverrides(saved) {
  if (!isPlain(saved)) return false;
  LIVE = deepFreeze(mergeDeep(STORE_CONFIG, saved));
  return true;
}

/** The merged view, for anything that needs the whole object rather than one
 *  path. Frozen, like the defaults. */
export function liveStoreConfig() {
  return LIVE;
}

/* ★ THE EXISTING EXPORT, NOW A VIEW ONTO THE SECTIONS ABOVE.
   Same five keys and the same five values it has always had, so every one of
   the dozen files importing it is untouched. It reads from STORE_CONFIG rather
   than holding its own copy, because "one source of truth, never two" is the
   rule the settings screen has to be able to rely on — a screen that edits the
   config while a tile reads a second copy of the same value is the exact
   failure this whole layer exists to remove. */
/* ★★ GETTERS, NOT COPIED VALUES (step 3, Aug 11 2026). Same five keys, same
   five values, and every existing importer is untouched — `STORE.name` still
   reads like a plain property.

   ⚠️ WHY IT MATTERS: these are read at RENDER time, inside JSX, not at module
   load. A getter means all nineteen masthead sites pick up a store's saved
   identity the moment it is applied, with no change to any of those files. The
   flat copy this replaced captured the code default forever, so a store could
   have typed its own name into the settings screen and watched every screen
   keep saying Gate City.
   ⚠️ FROZEN STILL. Object.freeze on an accessor object stops the property being
   redefined; it does not stop the getter returning a new value, which is
   exactly the behaviour wanted here. */
export const STORE = Object.freeze({
  get name() { return LIVE.identity.name; },
  get appName() { return LIVE.branding.appName; },
  get legalName() { return LIVE.identity.legalName; },
  get notifyEmail() { return LIVE.identity.notifyEmail; },
  get fsr() { return LIVE.identity.fsr; },
});

/* ★ THE ADMIN LIST, ONCE.
   These five were byte-identical in MemberVote, TeamGoals, TeamDirectory,
   TeamResources and (as a DM target) three more. Comments kept verbatim from
   the files they came out of — the role beside each id is what tells a reader
   at another store which seat to swap, not which person.

   ⚠️ AN ARRAY, FROZEN, NOT A SHARED Set. Every file used to build its own Set,
   so a stray .add() could only ever affect one tile. One exported Set would be
   one mutable object behind every gate in the app. Five entries, so `includes`
   costs nothing and cannot be poisoned. */
export const ADMIN_SLACK_IDS = Object.freeze([
  /* ⛔ EMPTIED Aug 19 2026. These were the ORIGIN store's five Slack user ids,
     and `isAdminSlackId` below is a plain `includes` on the true branch of the
     admin check in five screens — so five people at another store were admins
     here, in this store's own built bundle.
     ⚠️ EMPTY IS A WORKING STATE: the id door never opens. adminRoles.js is the
     role door and the lists under owners.* are the name door, and both work.
     ⛔ NEVER PASTE ANOTHER STORE'S IDS IN HERE. Add this store's own or leave
     it empty. */
]);

/** True when this Slack id belongs to a store admin. Falsy id → false, never a
 *  throw: this sits on the true branch of a permission check, and a gate that
 *  can throw is a gate that fails open on the next refactor. */
export function isAdminSlackId(slackId) {
  return !!slackId && ADMIN_SLACK_IDS.includes(String(slackId));
}

/* ═══ HR CONSOLE MEMBERSHIP — THE ONE DEFINITION ══════════════════════════
   Hannah, Jul 28 2026: "Only me, Matt, Bri, Cindy, and Nick", and "I do not
   want Kyleeka to see into HR console."

   ⚠️ RANK CANNOT EXPRESS THAT, which is why the list exists. Daisy and Brandon
   need the DIRECTOR title (rank 5) for their other tools, and rank 5 is exactly
   HR_FULL_READ_MIN. Kyleeka is an Executive Director, rank 7 — no threshold
   removes her without removing Matt and Hannah too.

   🐛 THE BUG THIS FIXES (Jul 31 2026). HRConsole.jsx got this list on Jul 29
   and the WORKER never did: `hrIsFullReader` was rank-only, so anyone titled
   Director passed the server gate while the UI showed them nothing. Their
   session token could still fetch every person's HR rows straight from
   /api/hr-store — evaluations, injuries, CFA Home credentials. Daisy and
   Brandon were about to be made Directors, which is what surfaced it.

   ★ ONE LITERAL, KEYED BOTH WAYS. The browser knows a person by name, the
   Worker knows them by roster id, and two lists would drift. `names` carries
   every spelling the app has used (Bri appears as both). Adding or removing a
   person here changes BOTH sides at once — that is the point.
   ⚠️ DO NOT "SIMPLIFY" THIS BACK TO A RANK. The next Director added must not
   inherit HR Console by holding a title.

   ═══ WHY IT MOVED HERE (Matt, Aug 7 2026: "move it") ══════════════════════
   It lived in hrRoster.js, the strict leaf. That was fine while there was one
   store. It is the reason a SECOND store cannot use HR Console at all: the lock
   opens by NAME, these are Gate City's five names, and nothing a new store can
   reach from inside the Hub changes them. Their own Executive Director opens the
   console and sees nothing — not a permission message, nothing — with no setting
   anywhere to fix it.

   ⚠️ THE MECHANISM IS UNCHANGED. Same five people, same names-not-ranks lock,
   same both-ways keying. hrRoster.js imports it from here and re-exports it, so
   every existing importer still works. This moved WHERE the list is written, and
   nothing else. Every one of the 34 asserts in checks/hrGate.test.mjs passed
   before this move and passes after it.
   ⚠️ THIS IS AN ACCESS CONTROL LIST, NOT A PREFERENCE. Anyone added here can
   read every person's evaluations, injuries and CFA Home credentials. A store
   sets it once, deliberately, and it should be the shortest list that works. */
/* ★ FIRST-RUN SWITCH FOR A BRAND NEW STORE. Gate City: false. A clone: true.
   Matt, Aug 10 2026: "have the new store's HR or ops director set up the pins.
   it's a lot up front but better for security."

   ⚠️ WHAT IT DOES. `hrInConsole` (hrRoster.js) is the single chokepoint every
   HR Console power passes through, and EVERY call site pairs it with a rank or
   role test — full() needs rank 5, canEditRoster() needs 6, canSeeTerminated()
   needs 6, isHR() needs the Human Resources title. Turning this on makes
   `hrInConsole` stop consulting the name list below and lets those rank tests
   do the gating on their own. Nothing becomes ungated; the *list* stops being
   the gate and the *rank* becomes it.

   ⚠️ AN EXPLICIT FLAG, NOT "the list is empty". That was the obvious shortcut
   and it is wrong for an access control list: it would mean a store that
   deletes its last entry silently opens HR Console to every rank-5 person, and
   the person doing the deleting would have no idea. An ACL must never widen as
   a side effect of an edit somewhere else. Turning this on is a decision you
   have to type.

   ⚠️ ONE REAL WIDENING TO KNOW ABOUT, AND IT IS WRITTEN DOWN IN
   NEW-STORE-SETUP.md TOO. Three of those call sites let the `Payroll` title
   bypass the rank test (full, isDirectorUp, canSeeTerminated) — that is Gate
   City's deliberate carve-out for Cindy. With this flag ON, anybody a new
   store titles "Payroll" reads every personnel file. If a store does not want
   that, do not use that title. */
export const HR_CONSOLE_OPEN_BY_RANK = true;

/* ★★ A FUNCTION, NOT A CONST, AND THAT IS THE WHOLE CHANGE (Aug 11 2026).
   The list itself moved into STORE_CONFIG.owners.hrConsole so a store can save
   its own. Exported as a call so the answer is read when somebody asks, not
   captured when this module loaded — a const here would freeze the default
   before any saved setting arrived, which is the trap the whole config layer
   exists to close.

   ⚠️ FAILS CLOSED. An unreadable or missing list answers [], which means
   nobody is on it, which means nobody opens HR Console. An access list that
   defaults to "everyone" when the read wobbles is the one shape this must
   never take. */
/* ⚠️⚠️ THE FOURTH LIST, AND IT WAS THE ONE LEFT OUT. `ownPeopleList` was added
   below to stop a clone inheriting profitEdit, tileAllow and handbookExempt.
   This one kept reading storeCfg directly, so a clone that had not set its own
   list still inherited Gate City's five — by id AND by name — and this is the
   most sensitive of the four: it is the lock on every person's evaluations,
   injuries and CFA Home credentials.

   It is not enough on its own (rank is still required beside it), but "not
   enough on its own" is exactly how the other three were justified too, and
   they were still wrong. One guard, all four lists, no exceptions. */
export function hrConsolePeople() {
  const v = ownPeopleList("owners.hrConsole", []);
  return Array.isArray(v) ? v : [];
}

/* ★★ A CLONE INHERITS NOBODY, AND IT NEEDS TO DO NOTHING TO GET THAT.
   The block these lists live in already says it — "A CLONE WANTS ALL THREE
   EMPTY, not copied" — and nothing enforced it. A clone takes this file
   verbatim, so THEIR team member with roster id 17 walks into the L101 Store
   Template because OUR 17 is Bri, and their 33 gets Matt's access. Nobody does
   anything wrong and nothing looks wrong. The same sentence sits over
   `profitEdit` and `handbookExempt`, with the same gap.

   ⚠️ IT COMPARES AGAINST THE BAKED-IN DEFAULT, NOT AGAINST A FLAG. A store that
   has SET its own list through the settings screen gets that list served, at
   any FSR — the value differs from the default, so it is theirs and it stands.
   Only the untouched Gate City default is withheld from a Gate City that is not
   this one. That is what lets it need no action in either direction: forgetting
   is harmless, and deciding is honoured without a second switch to remember.

   ⚠️ `identity.fsr` IS READ FROM THE LIVE CONFIG, so a store that sets its own
   number in settings is recognised from that moment, not from the next deploy. */
const ownPeopleList = (path, fallback = []) => {
  const live = storeCfg(path, fallback);
  const def = pathIn(STORE_CONFIG, path);
  const isDefault = JSON.stringify(live) === JSON.stringify(def);
  if (!isDefault) return live;
  return String(storeCfg("identity.fsr", "")) === String(STORE_CONFIG.identity.fsr) ? live : fallback;
};

/* Walk a dotted path on a plain object. Used only to fetch the BAKED default
   for the comparison above; `storeCfg` reads the live (merged) value. */
function pathIn(obj, path) {
  let cur = obj;
  for (const k of String(path).split(".")) {
    if (cur == null || typeof cur !== "object" || !(k in cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

/* Who may edit profit share. Same reasoning, and it is money, so the empty
   answer has to be the safe one: no ids means the screen is read-only. */
export function profitEditIds() {
  const v = ownPeopleList("owners.profitEdit", []);
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

/* ★ PER-TILE EXCEPTIONS BY ROSTER ID — one home, two readers.
   App.jsx decides who may OPEN a tile (`allowIds` on the tool entry). worker.js
   decides who may fetch that tile's DATA. Those two answers have to agree, and
   before this they could not: the id lived only in App.jsx, so a gated route
   had no way to know about it.

   ⚠️ WRITTEN DOWN BECAUSE THE ALTERNATIVE ALREADY BIT US. Nick's reduced view
   took far too long to find this morning precisely because one person's access
   was expressed in one file and invisible from every other. Adding a second
   copy of an id in worker.js would be that mistake again, on purpose.

   `facilities` — Brandon, id 16. Added Jul 30 2026 so one person could use the
   tile without `allow: ["Assistant Director"]` opening it to all nine ADs.
   ⚠️ THIS WIDENS ACCESS. A store cloning the Hub wants this EMPTY, not copied. */
/* ★★ THE LISTS THEMSELVES MOVED TO STORE_CONFIG.owners.tileAllow (Aug 11 2026)
   and every word of the reasoning above moved with them. Out here they sat
   outside the config object, so `storeCfg` could not reach them and no store
   could ever set their own — the same thing that was wrong with
   HR_CONSOLE_PEOPLE and with the profit-share ids.

   ⚠️ THERE IS NO LONGER A `TILE_ALLOW_IDS` CONST, DELIBERATELY. Anything that
   held it held a value captured at import, which is precisely the bug: App.jsx
   builds its tool list in a module-level const, so the old
   `allowIds: TILE_ALLOW_IDS.facilities` froze Gate City's list before a store's
   settings existed. Call `tileAllowIds(toolId)` instead, and if you are writing
   a tool entry use `allowIdsFrom: "<toolId>"` so the gate resolves at use time.
   Leaving a const here that still worked would have made that mistake easy to
   make again. */

/* True when a roster id holds a per-tile exception. Takes the id as a string or
   a number, because App.jsx holds roster ids as strings and a token's `u` has
   arrived as both. */
/* ⚠️⚠️ BOTH SIDES NORMALISED, AND THAT IS A FIX. The note in the owners block
   says it plainly: the HR roster stores "tm16" and these lists use the bare
   "16" for the same person. `String()` does not close that gap, so this
   returned false for EVERY id the roster hands it — the identical defect
   App.jsx carried until Aug 11 2026, when it was found shutting Bri out of a
   tile she was listed on and five people out of Orientation, unreported.
   ⚠️ Inlined ONCE with this note rather than a fourth silent copy: nameMatch.js
   owns the rule and this file imports nothing by design (rule 8).
   ⚠️ AN EMPTY ID MATCHES NOTHING, or a blank entry opens a tile to nobody. */
const bareRosterId = (v) => String(v == null ? "" : v).trim().toLowerCase().replace(/^tm/, "");

export function tileAllowsId(toolId, personId) {
  const me = bareRosterId(personId);
  if (!me) return false;
  return tileAllowIds(toolId).some((id) => bareRosterId(id) === me);
}

/* ★★ THE LIVE LIST FOR ONE TILE, READ WHEN ASKED (Aug 11 2026).
   ⚠️ THIS EXISTS BECAUSE THE OLD SHAPE COULD NOT BE FOLLOWED. App.jsx builds
   its tool list in a MODULE-LEVEL const, so `allowIds: TILE_ALLOW_IDS.facilities`
   captured the array the moment that file imported — before any saved setting
   arrived. Turning TILE_ALLOW_IDS into a getter would not have helped: the
   getter still runs once, at capture. The call sites had to start asking by
   NAME instead of holding a value, which is what `allowIdsFrom` does there.
   ⚠️ ALWAYS AN ARRAY, so a caller can never get `undefined.includes`. An
   unknown tool id answers [] and therefore admits nobody. */
export function tileAllowIds(toolId) {
  const v = ownPeopleList(`owners.tileAllow.${toolId}`, []);
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

/* Leadership Dev's two by-name lists. `which` is "allowed" or "directors".
   ⚠️ LOWER-CASED AND TRIMMED HERE so the caller compares like with like. The
   tile normalises `user.name` the same way, and a list typed with a capital
   letter that silently admitted nobody would be a horrible thing to debug.
   ⚠️ Same clone guard as every other list in this block: a store that has set
   nothing inherits nobody, and empty admits nobody. */
export function leadershipDevNames(which) {
  const v = ownPeopleList(`owners.leadershipDev.${which}`, []);
  return Array.isArray(v) ? v.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [];
}

/* EOS's four lists. `which` is "allowed", "directors", "seatOrder" or
   "ownerOptions".
   ⚠️ CASE IS PRESERVED, UNLIKE leadershipDevNames. Two of these are FULL names
   compared against a lower-cased user name, and two are FIRST names that are
   PRINTED on the board and used as picker options. Lower-casing here would put
   "matt" on a screen. The caller lower-cases the two it compares. */
export function eosNames(which) {
  const v = ownPeopleList(`owners.eos.${which}`, []);
  return Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean) : [];
}

/* Leadership 101's instructor ids. Separate from the name list because it is a
   different fact about the same people, and because ids survive a marriage and
   a retitling. Same clone guard, same fail-closed direction.
   ⚠️ THE `tm` PREFIX IS STRIPPED HERE. The roster stores "tm33" and these lists
   hold the bare "33" for the same person; comparing either form literally
   matches nobody, which is the house bug class. */
export function leadershipDevInstructorIds() {
  const v = ownPeopleList("owners.leadershipDev.instructorIds", []);
  return Array.isArray(v)
    ? v.map((x) => String(x == null ? "" : x).trim().toLowerCase().replace(/^tm/, "")).filter(Boolean)
    : [];
}

/* Who never has to sign the handbook. Same use-time read, same fail-safe
   direction: an empty or unreadable list means everybody signs. */
export function handbookExemptIds() {
  const v = ownPeopleList("owners.handbookExempt", []);
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

/* ★ THE NAME DOOR FOR ONE PEAK REACHERS TILE. `tile` is a key under
   owners.adminNames — teamDirectory · teamGoals · teamResources ·
   professionalGrowth — and an unknown key returns [], which closes that door
   rather than opening it.

   ⚠️ CALL IT INSIDE THE GATE, NEVER INTO A MODULE-LEVEL `const` OR Set. That
   is the whole reason this move works: a `const` captures the baked-in default
   at import, before applyStoreOverrides has merged a store's saved settings,
   so the tile would keep answering with Gate City's names no matter what the
   store had chosen. Four tiles, four gates, all of them read at call time.

   ⚠️ RETURNS AN ARRAY AND THE CALL SITES USE .includes(). They each built a
   Set before; a Set rebuilt on every gate call would be slower and no safer,
   and six entries make `includes` free. It also cannot be poisoned by a stray
   .add() the way one exported Set behind four gates could.

   Lower-cased on the way out so a store that types "Matt" into its
   settings matches a call site that has already lowercased the viewer. */
export function adminNames(tile) {
  const v = ownPeopleList(`owners.adminNames.${tile}`, []);
  return Array.isArray(v)
    ? v.map((s) => String(s == null ? "" : s).trim().toLowerCase()).filter(Boolean)
    : [];
}

/* ★ THE COURSE OWNER'S NAME FOR ON-SCREEN COPY, or a phrase that stands in for
   it. "Bri" at Gate City, "the Director" at a store that has not said.

   ⚠️ IT GOES THROUGH `ownPeopleList` LIKE EVERY OTHER OWNER FIELD, even though
   it is one string rather than a list. That helper is a JSON comparison against
   the baked-in default, so it works on a string exactly as it works on an
   array, and reusing it is the whole of design rule 8: a second copy of "is
   this value theirs or ours" would be one more place for that answer to drift.
   Same bargain as everywhere else — a store that TYPES a name gets it at any
   FSR, and only the untouched Gate City default is withheld.

   ⚠️ THE FALLBACK IS A PHRASE, NOT A BLANK. Returning "" would leave sentences
   like "notes to " and "the class PIN from ." on screen. Every caller drops
   this straight into a sentence, so the empty case has to BE a sentence.

   ⚠️ "the Director", NOT "your instructor" (Bri, Aug 12 2026, settling the
   L101 template strip: her name off the on-screen labels, replaced with
   "Director"). It is the ROLE that runs the course at a new store, and a
   trainee reading "notes to the Director" knows who that is on day one.
   "your instructor" was vaguer and, on the template she is handing over,
   named nobody the reader could go and find.

   ⚠️ LOWER-CASE "the", CAPITAL "Director". `courseOwnerLabelCap()` below
   raises the first letter for the three sentence-initial callers, so this
   has to read correctly mid-sentence, which is where four of the seven sit.
   Capitalising "The" here would put it mid-sentence in "notes to The
   Director". */
export function courseOwnerLabel() {
  const v = ownPeopleList("owners.courseOwner", "");
  const name = String(v == null ? "" : v).trim();
  return name || "the Director";
}

/* The same label where a sentence STARTS with it — "Bri has been told" and
   "The Director has been told" need different first letters, and three of
   the seven call sites are sentence-initial. A real name is already capital, so
   this only ever changes the stand-in phrase.
   ⚠️ ONE DEFINITION, TWO FILES USE IT. Capitalising at each call site would be
   the same three lines written twice, in two files that already disagree about
   plenty else. */
export function courseOwnerLabelCap() {
  const s = courseOwnerLabel();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ★ THE MENTORSHIP PROGRAMME'S NAME, IN ONE PLACE, READ AT CALL TIME.
   Same shape as `courseOwnerLabel` above and for the same reason.

   ⚠️⚠️ THE POINT IS THE FALLBACK, NOT THE LOOKUP. The first version of this
   change put `storeCfg("teamSite.programName", "Peak Reachers")` at each of the
   six call sites, which is correct code and **did not do the job**: the fallback
   is itself a string literal, so it shipped once per call site and the built
   bundle only fell from 20 to 12. Measured, not guessed — that is the whole
   reason this function exists. A default written six times is six copies of the
   thing you were trying to have one of (design rule 8).

   ⇒ So the name now appears in this repo's client code EXACTLY TWICE: the
   default in STORE_CONFIG.teamSite, and the argument below. A clone changes the
   first one and is done.

   ⚠️ NOT `ownPeopleList`. That guard is for lists of Gate City's PEOPLE, which
   a clone must never inherit. A programme name is a label a clone REPLACES, not
   one it must be protected from, and passing it through that guard would blank
   the heading at any store that had not saved a setting yet. */
/* ★ WHO RUNS THE L10, AS A FIRST NAME ON SCREEN.
   ⚠️ IT WAS DEFINED TWICE — `useState("Bri")` in EOSTile.jsx and a FACILITATOR
   const in l10Schedule.js. Two files stating one fact is design rule 8, and the
   drift is silent: change the rotation in one and the meeting screen and the
   calendar note start naming different people.
   ⚠️ EMPTY IS A REAL ANSWER AND BOTH CALLERS HANDLE IT. The calendar note drops
   the "Facilitator:" sentence entirely rather than printing a dangling colon,
   and the meeting screen opens with an empty picker for the store to fill. */
/* ★ THE CASHIER SUGGESTION LIST, sorted on read so the caller never has to.
   ⚠️ SUGGESTIONS, NOT A GATE — nothing is validated against it. It goes through
   `ownPeopleList` anyway, like every other owner field, so the answer is the
   same shape everywhere and a clone inherits nobody without doing anything. */
export function cashierNames() {
  const v = ownPeopleList("owners.cashierNames", []);
  return (Array.isArray(v) ? v : []).map((x) => String(x == null ? "" : x).trim()).filter(Boolean).sort();
}

export function eosFacilitator() {
  const v = ownPeopleList("owners.eos.facilitator", "");
  return String(v == null ? "" : v).trim();
}

/* ⚠️⚠️ THE LAST FALLBACK IS NOT DECORATION. `newstore.mjs` now BLANKS
   `teamSite.programName` for a clone, because a programme name is invented by an
   operator and cannot be derived from a store name. So at a brand new store both
   the saved value and the deployed default are "", and without this line every
   caller would build a sentence around an empty string: "Owed to " on a money
   label, " monthly goal submission missed" on a demerit, and a tile with no name
   at all. Empty is a working state for a VALUE; it is not a working state inside
   a sentence.
   ⇒ "Team Site" is generic, true at any store, and obviously a placeholder to
   replace — which is the whole difference from inheriting another store's real
   programme name. Gate City never reaches it: its default is set. */
export function programLabel() {
  const v = storeCfg("teamSite.programName", STORE_CONFIG.teamSite.programName);
  return String(v == null ? "" : v).trim()
    || String(STORE_CONFIG.teamSite.programName || "").trim()
    || "Team Site";
}

/* ★ WHAT THE REWARD CURRENCY IS CALLED, AND IT IS TWO WORDS BECAUSE ENGLISH
   NEEDS BOTH. `unit()` in TokensTile picks between them on the count, so "1
   star" and "2 stars" both read properly. A single label would print "1 stars".

   ⚠️⚠️ NEVER "POINTS". Gate City already uses points to mean DISCIPLINE points
   from write-ups, so a reward currency by that name lands on a team member who
   has just been written up as the same thing. Matt ruled on this when the
   ledger was built and it is the first rule in `tokens.js`. This helper cannot
   enforce a word choice, but the next person reading it should know.

   ⚠️ LOWERCASE ON PURPOSE. Every caller drops these into a sentence — "Not
   enough stars.", "What a star buys" — so a capitalised value would read
   wrong mid-sentence. The two places that want a heading capitalise on the
   way out: TokensTile's panel title uses CSS `textTransform`, and the
   dashboard tile's getter in App.jsx upper-cases the first letter.

   ⚠️ THESE LIVE HERE RATHER THAN IN TokensTile.jsx, WHERE THEY STARTED. Once
   App.jsx needed the same word for the tile name there were two callers, and
   design rule 8 is that the function deciding what something is CALLED must
   not exist twice. A drift here would have the tile saying one word and the
   screen behind it saying another.

   ⇒ Falls back through saved value, then deployed default, then "tokens", so
   a store that blanks the box gets a working generic word rather than an
   empty one. Empty is a working state for a value; it is not a working state
   inside a sentence. Same reasoning as `programLabel` above. */
export function tokenLabel() {
  const v = storeCfg("tokens.label", STORE_CONFIG.tokens.label);
  return String(v == null ? "" : v).trim()
    || String(STORE_CONFIG.tokens.label || "").trim()
    || "tokens";
}

export function tokenLabelOne() {
  const v = storeCfg("tokens.labelOne", STORE_CONFIG.tokens.labelOne);
  return String(v == null ? "" : v).trim()
    || String(STORE_CONFIG.tokens.labelOne || "").trim()
    || "token";
}

/* ★ ONE PER-PERSON BOARD RULE, AS BARE ROSTER IDS.
   `which` is a key under owners.board — lockDining, fohAdOrder and so on. An
   unknown key returns [], which means "no rule", which the engines already
   handle as "unrestricted" and "unranked".

   ⚠️ ORDER SURVIVES. The two `*Order` lists ARE the seniority ranking, so this
   maps without sorting and without deduping. A helper that tidied the list
   would silently re-rank who outranks whom on a live board.

   ⚠️ BARE IDS, `tm` STRIPPED, because the roster writes "tm22" and the settings
   screen and the override maps write "22". Same normaliser as every other id
   list in this file, so a store typing either form is understood.

   ⚠️ CALL IT AT USE TIME. A module-level const captures the baked-in default
   before a store's saved settings are merged, and the engines would keep
   answering with Gate City's people no matter what the store had chosen. */
/* ★ THE NAME FALLBACK PATTERNS FOR THE BOARD ENGINES.
   Same path and same guard as `boardIds` below, and deliberately its own
   function rather than an alias: `boardIds` maps through `bareRosterId` and
   returns IDS, this returns REGEX SOURCES. One reading the other's value would
   quietly strip a pattern down to nothing.
   ⚠️ `ownPeopleList` IS THE GATE. The engines used to test `isGateCity()`
   themselves; the withholding happens here now, in the one place every other
   owner list is withheld, so there is one gate rather than two that can drift. */
export function boardNamePatterns(which) {
  const v = ownPeopleList(`owners.board.${which}`, []);
  return Array.isArray(v) ? v.map((x) => String(x == null ? "" : x)).filter(Boolean) : [];
}

export function boardIds(which) {
  const v = ownPeopleList(`owners.board.${which}`, []);
  return Array.isArray(v) ? v.map(bareRosterId).filter(Boolean) : [];
}

/* ★★ THE SIDE'S SECTIONS, IN ONE ORDER, FOR EVERY SCREEN THAT COLOURS THEM.

   Takes a `stations.FOH` / `stations.BOH` map — `{ Mon: [...], Tue: [...] }` —
   and returns each section name once, in the order it first appears walking the
   days. `"OTHER"` for a station with no section, which is the same word
   `boardDay` uses so the two lists line up.

   ⚠️⚠️ IT IS SIDE-WIDE ON PURPOSE, AND THAT IS A BUG FIX, NOT A PREFERENCE.
   `boardDay` builds its sections from ONE DAY's station list, so the index of a
   section moved whenever a day was missing one — Saturday has no BREADING and
   every section after it shifted up a slot. Colour it by that index and the same
   section is teal on Monday and blue on Saturday, on a board a leader reads at a
   glance to find their area. Indexing into this list instead pins a section to
   one colour on every day and on every screen.

   ⚠️ ORDER OF FIRST APPEARANCE, NEVER SORTED. Sorting would be stable too, but
   it would put the sections in an order nobody chose — the store's own list is
   the order leaders already read on the board.

   ★ MODULE LEVEL AND PURE (rule 7), and it takes the map rather than reading the
   config, because the Store Settings screen passes stations a leader has typed
   and not yet saved. */
export function sectionsOf(byDay) {
  const src = byDay && typeof byDay === "object" ? byDay : {};
  const seen = new Set();
  const out = [];
  Object.keys(src).forEach((day) => {
    (Array.isArray(src[day]) ? src[day] : []).forEach((st) => {
      /* ⚠️ A NULL ROW IS SKIPPED, NEVER COUNTED AS "OTHER". `(st && st.section)`
         is falsy for a null station AND for a real station with no section, so
         folding them together invented an OTHER section out of a hole in the
         list — a colour slot for stations that do not exist, which shifts every
         section after it. Caught by sectionColor.test.mjs, not by reading. */
      if (!st) return;
      const name = String(st.section || "").trim() || "OTHER";
      if (seen.has(name)) return;
      seen.add(name);
      out.push(name);
    });
  });
  return out;
}

/* ★ EVERY SLACK DESTINATION THE HUB POSTS TO — now a view onto
   STORE_CONFIG.messaging, for the same one-source-of-truth reason STORE is.

   Nineteen literal channel strings were spread through worker.js and notify.js.
   A clone built from that source posts a second store's waste report, food
   safety walk and monthly numbers into GATE CITY'S channels — which is worse
   than not working, because it looks like it worked.

   ⚠️ `team` CARRIES THE STORE'S NAME IN IT. "gate-city-team" is not a generic
   label like the other three; a clone that forgot this one would post to a
   channel that does not exist at their store and fail quietly.

   ⚠️ THE FOUR KEYS AND FOUR VALUES ARE UNCHANGED. `leaders` is deliberately
   NOT re-exported here: nothing imports it, and adding an empty string to a
   map every caller treats as "a real channel name" is how an empty destination
   reaches a post call. It stays in the section above until step 2 gives it a
   home the Worker can read. */
/* ★ GETTERS, for the same reason STORE has them: a store that renames its
   channels in the settings screen must have the next post go to the new one,
   not to a name captured when the module loaded. Every caller still reads
   `CHANNELS.inventory` and is untouched. */
export const CHANNELS = Object.freeze({
  get opsSuccess() { return LIVE.messaging.opsSuccess; },
  get brand() { return LIVE.messaging.brand; },
  get inventory() { return LIVE.messaging.inventory; },
  get team() { return LIVE.messaging.team; },
});
