import { chaseDue, owedByPerson, chaseTitle, chaseBody } from "./docChase.js";
import { trainerTaskFallback, trainerTasksPeriodBounds } from "./trainerTaskRoster.js";
import { buildDailyDigest, buildLeaderDigest, readDigest, readLeaderDigest, MODEL as CLAUDE_MODEL } from "./aiSummary.js";
import { runEosTouchIn } from "./eosTouchIn.js";
import { claimMatches } from "./claimCode.js";
import { runInputPush } from "./inputPush.js";
/* ⚠️ THIS IMPORT WAS MISSING and `runIpoWeeklyReminder` has thrown
   `ReferenceError: ipoQuarter is not defined` on every run since. The comment
   block above that function even names ipoPlan.js as the shared source — the
   import line was simply never written.
   ★ It went unnoticed twice because grepping the file for "ipoPlan" returned a
   HIT — from that comment. Counting matches is not checking for an import. */
import { ipoQuarter } from "./ipoPlan.js";
import { QUARTER_PLANS } from "./ipoPlanData.js";
import { SEED as FOOD_GAPS_SEED } from "./foodItemGapsSeed.js";
import { SEED as INV_GAPS_SEED } from "./inventoryGapsSeed.js";
import { SEED as SCORECARD_SEED, BLANK as SCORECARD_BLANK } from "./scorecardSeed.js";
import { SEED as FACILITIES_SEED, ACTIONS as FACILITIES_ACTIONS } from "./facilitiesSeed.js";
import { SEED as CASH_AUDIT_SEED, NOTE as CASH_AUDIT_SEED_NOTE } from "./cashAuditSeed.js";
/* The new-hire uniform form. ONE definition, in uniformCatalog.js: this route
   validates against it and serves it to the signed-out onboarding page, so the
   page never carries its own copy of the sizes. */
import { NEWHIRE_ITEMS, NEWHIRE_FLAT_PRICE, NEWHIRE_INTRO, NEWHIRE_SHOES_ACK, newHireLineOk } from "./uniformCatalog.js";
import { VENDOR_HINTS, RECURRING_SEED } from "./expenseVendorData.js";
import { parseIpoPlans } from "./ipoPlanImport.js";
import { boardShift, ownersForInput, isOwner as isBoardOwner, boardKey, mondayKeyOf as boardMondayKey, dayNameOf, daypartRoster, shiftWhereText, DAYPART_LABEL,
  /* Part 3 of messaging: which daypart it is right now, and who the board says
     is running it. Nothing here knew what time a daypart STARTS until this —
     the four-a-day jobs are told by `&dp=` on the cron URL. */
  leadersOnDutyAt } from "./boardOwner.js";
import { CHANNELS, STORE, STORE_CONFIG, tileAllowsId } from "./storeConfig.js";
/* The star ledger's own rules. Only makeEntry may build a movement — it is what
   refuses a blank reason and a fractional amount — and starAwards decides who
   has earned one and who is blocked. Both are leaves. */
import { makeEntry as tkMakeEntry, TYPES as TK_TYPES } from "./tokens.js";
import { awardsFor as starAwardsFor, awardedIds as starAwardedIds } from "./starAwards.js";
import { trainingKey as hubTrainingKey, hasWatched as hubHasWatched, requiredDeck as hubRequiredDeck } from "./hubTraining.js";
/* The announcement rules, from the leaf both halves of the app read. Who may
   see one is a permission, and a permission written twice is the bug this repo
   lost a day to — same reason calendarStore.js and boardOwner.js are leaves. */
import { makeAnnouncement as annMake, announcementList as annList,
  visibleTo as annVisibleTo, isRetracted as annRetracted,
  /* Finds one person's open/ack stamp by BARE id. Imported rather than
     rewritten here: the read list and the "already signed" check must agree
     about what one signature is, and that is design rule 8. */
  stampFor as annStampFor,
  /* The retention purge. `purgeableOn` takes a DATE, not a record — the three
     messaging types keep their timestamp in three different fields, so the
     caller names it. RETENTION_DEFAULT_DAYS holds all three defaults in one
     place so the job and Store Settings cannot disagree. */
  purgeableOn, RETENTION_DEFAULT_DAYS } from "./announcements.js";
/* The shift-thread rules. Who is "involved in that specific request" is a
   permission, and this route and the screen must not answer it separately. */
import { THREADS_KEY, readThreads as thrRead, makePost as thrMakePost,
  canSeeThread as thrCanSee, canPost as thrCanPost, refusalFor as thrRefusal,
  threadFor as thrFor,
  /* A thread has no date of its own, only one per post. The purge measures its
     age from the NEWEST post — the oldest would delete a conversation people
     are still having. */
  lastPostAt as thrLastPostAt } from "./shiftThreads.js";
/* The requests the threads hang off. Already a strict leaf the schedule engine
   reads, so the Worker and the board agree on what a request IS. */
import { TIMEOFF_KEY, readTimeOff } from "./timeOff.js";
/* The escalation rules. One-way is a property of the record, not a missing
   feature — see the file header. */
import { ESCALATIONS_KEY, makeEscalation as escMake, escalationList as escList,
  visibleTo as escVisibleTo, isReason as escIsReason, alertText as escAlert,
  /* Used when an escalation files itself onto the person's HR record, so the
     title on that record says the same words the team member tapped. */
  reasonLabel as escReasonLabel } from "./escalations.js";
import { checkStoreSettings } from "./storeSettingsImport.js"; // the SAME validator the settings page runs

/* ★ THE STORE'S CLOCK, ONCE (step 2, Aug 11 2026). Every scheduled job in
   this file derives ET wall-clock from it, and it was typed in two places.
   ⚠️ IT MUST MATCH THE cron-job.org ACCOUNT TIMEZONE. Nothing in this repo can
   see that setting, so the two are kept in step by hand — a mismatch silently
   moves every job by four or five hours depending on daylight saving, which is
   how a "morning" digest ends up posting overnight. */
const STORE_TZ = STORE_CONFIG.identity.timezone;
/* ONE definition of who may see Profit Share, shared with FinancialSuite.jsx.
   finShared.js is a leaf with no imports at all, which is what lets both halves
   use it — see its header for the two-copies bug this closes. */
import { canSeeProfitShare, isDirector } from "./finShared.js";
/* The SAME rule the screen uses to decide who still owes a monthly goal. A
   second copy here is how a nudge starts arriving for work somebody already
   did. See goalsWindow.js — it is a leaf and safe for the Worker. */
import { SUB_KEY as GOAL_SUB_KEY, goalsOwed } from "./goalsWindow.js";
import { walkBucket } from "./backupWalk.js";
/* The calendar's rules, from the same leaf the tile and Team Directory read.
   Who may book what, and whether an owner is still taking bookings, must have
   one definition — a permission rule written twice is the bug this repo spent
   a whole day on. See calendarStore.js. */
import { TYPES_KEY as CAL_TYPES_KEY, slotsKey as calSlotsKey, typeList as calTypeList,
  canBookType as calCanBookType, ownerAccepting as calOwnerAccepting,
  canManageType as calCanManageType, heldBy as calHeldBy,
  bookedBy as calBookedBy,
  /* The invitation half. Same reason as the booking half above: who may be
     invited, what an answer means and when an answer stops counting are rules,
     and a rule written twice is the bug this repo lost a day to. */
  eventsKey as calEventsKey, repliesKey as calRepliesKey, eventList as calEventList,
  makeEvent as calMakeEvent, makeReply as calMakeReply, replyMap as calReplyMap,
  isInvited as calIsInvited, organises as calOrganises, reschedule as calReschedule,
  isCalendarOwner as calIsOwner,
  /* The double-booking rules. One definition, shared with the screen, so an
     alert here and a comparison there cannot disagree about what a clash is. */
  clashesFor as calClashesFor, busyItems as calBusyItems,
  /* Whether this meeting, at THIS time, has been announced yet. The stamp is
     the time itself, so a reschedule needs telling again and a title edit does
     not — one rule, in the leaf, rather than the route deciding separately. */
  needsTelling as calNeedsTelling, markTold as calMarkTold,
  ACCEPTED as CAL_ACCEPTED, DECLINED as CAL_DECLINED } from "./calendarStore.js";
/* ═══ THE FULL-READER TEST, ONE DEFINITION ══════════════════════════════════
   `rank >= 6 || Payroll` was written out at seven read routes, and on Aug 10
   2026 all seven had to widen together to admit Directors. Seven copies of a
   gate is seven chances to miss one, and a MISSED one is invisible: the tile
   still renders, the tab still draws its chrome, and only the numbers are
   absent. That is the Facilities lockout of Aug 8 exactly — a Director cleared
   a tile's role arm and then took a 403 from the route behind it.

   ⚠️ READS ONLY. POST /api/ipo-plan is the one WRITE among them and keeps its
   own stricter `rank >= 6` test; it replaces the stored quarter plans, which
   beat the in-code ones and drive the dashboard pill as well as the tile.
   ⚠️ PROFIT SHARE IS NOT ONE OF THESE. /api/profitshare-seed gates on
   canSeeProfitShare, which excludes Director by name, and must stay that way —
   Matt: "just not the profit share or PTO". */
const finReader = (who) =>
  !!who && (who.rank >= 6 || who.title === "Payroll" || isDirector(who.title));
/* ★ THE FOUR WASTE PERIODS AND THE DID-THEY-LOG DECISION, in a leaf. The list
   was defined here AND in WasteTracker.jsx; one of them was going to move. */
import { WASTE_PERIODS, wasteDayStatus, wasteCheckMessage } from "./wasteInputCheck.js";
/* ★ The labor maths and the daypart DM decision — both LEAVES, safe to import
   here. laborEngine.js takes its storage reader INJECTED (this file passes
   (k) => sbGet(env, k), the browser passes kvGet — same rows, two doors), so
   the daypart DMs compute from THE SAME monthLaborCard call the dashboard
   makes. laborDaypartPush.js imports nothing and cannot send — who-gets-what
   stays testable without a real DM going out. */
import { monthLaborCard as laborMonthCard, daypartCutNums } from "./laborEngine.js";
/* The week-ahead cut plan and the words for it — see weekCutReport.js. */
import { weekCutPlan } from "./laborEngine.js";
import { weekCutMessage } from "./weekCutReport.js";
/* SCOREBOARD_TITLE is the heading Slack prints and the announcement's title —
   one string, exported, so the two places cannot say different things. */
import { rankTeams, topPeople, scoreboardMessage, SCOREBOARD_TITLE } from "./teamScoreboard.js";
import { daypartRecipients } from "./laborDaypartPush.js";
/* normName was a local copy here too. boardOwner.js already imports nameMatch.js,
   so this module is in the bundle regardless — importing it directly costs nothing
   and removes the third place this rule could drift. */
import { normName, sameLeader, nameParts } from "./nameMatch.js";
/* ⚠️ TWO ID FORMATS FOR ONE PERSON, AND IT IS THE HOUSE BUG. `gcfcr-hr-team-v1`
   stores `tm27`; a session token and a push subscription store `27`. A raw
   compare matches nobody, silently, and the code then falls through to matching
   on NAMES — which is precisely where the two Lizbeths become one person.
   ONE definition (design rule 8). This rule decides identity, so a second copy
   drifting is not a cosmetic problem. */
const bareId = (v) => String(v == null ? "" : v).trim().toLowerCase().replace(/^tm/, "");
/* The waste menu is shared with WasteTracker.jsx — see wasteMenu.js for the
   two-items-behind bug that copy caused. */
import { WASTE_MENU } from "./wasteMenu.js";
/* eosPeriod.js was written to be shared with this Worker ("so both compute the
   exact same key and can never drift") — but the Worker never actually imported
   it until the l10-recap job needed the scorecard key. Verified by statement,
   not substring. */
import { eosPeriod } from "./eosPeriod.js";
import { seatForTool, seatById, AD_SEATS, EXTRA_SEATS } from "./orgSeats.js";
import { hrIsFullReader, hrIsPtoReader, hrTitleFor, hrPrimaryName, hrRankOfTitle, HR_SEED_ROLES, hrDisplayName,
  /* Tier 2 and up. The one ladder HR access, the Lineup groups and the
     Announcements audience all read, so "who is a leader" has a single answer. */
  hrTierOfTitle } from "./hrRoster.js";
/* ★ THE FCR FINANCIALS, IMPORTED HERE SO THEY ARE *NOT* IMPORTED THERE.
   🐛🐛 Aug 8 2026. FCRPage.jsx imported these, and FCRPage is a React file, so
   18 months of the complete profit-and-loss statement — every expense line in
   dollars and percent, and the real month-end net profit — plus three more
   years of profit percentages shipped in a client chunk that answered HTTP 200
   to any anonymous request.
   ⚠️ THE DATA FILES DID NOT MOVE. Only the importer did. Vite builds the client
   from its own entry and wrangler builds this worker from worker.js, so a module
   imported ONLY here is compiled only here and never lands in dist/assets. That
   is why this is three import lines rather than 950 lines of relocated data.
   ⚠️ NOTHING ELSE MAY IMPORT THEM FROM THE CLIENT SIDE. One import from any
   .jsx puts the whole P&L back in the bundle, silently. */
import { FCR_PROJECTIONS } from "./fcrProjectionData.js";
import { FCR_REFERENCE, LY_MONTHLY_SALES, REFERENCE_FSR } from "./fcrReferenceData.js";
import { FCR_YTD_SEED } from "./fcrYtdSeed.js";
import { GROUP_MULT, DEFAULT_GROUPS } from "./profitShareSeed.js";
/* Sweep finding 11. Two months of daypart sales AND paid hours used to sit in
   LaborPlanner.jsx, so they shipped in the Labor chunk that answers any
   anonymous request — enough to reconstruct the store's revenue shape and its
   sales per labor hour. Same rule as the seeds above it: imported HERE and
   nowhere in the client, or the whole table is back in the browser. */
import { DP_SEED_MONTHS } from "./daypartSeed.js";
/* Sweep finding 12. Chick-fil-A's own scoring of this store — CEM and Smart
   Shop — used to sit in GuestExperience.jsx and therefore in a public chunk.
   Those numbers come off analytics.cfahome.com, which is SSO-walled precisely
   so they are not public. Same rule as every seed above: imported HERE only. */
import { CEM_SEED, SHOP_SEED } from "./guestSeed.js";
/* ⚠️ THE TERMINATION ARCHIVE LIVES SERVER-SIDE NOW. It used to be imported by
   HRConsole.jsx, which put all 528 records into a PUBLIC client chunk — see
   /api/term-archive below. The worker bundle is not downloadable; that is the
   whole point of moving it here. */
import { TERM_ARCHIVE } from "./TermArchive.js";
/* The SAME person-level overrides HRConsole judges by. Keyed by name, which is
   why hrPrimaryName exists — the Worker only ever holds a roster id. A leaf
   module with no imports of its own, so this cannot cycle. */
import { effectiveRole } from "./accessOverrides.js";
import { GATE_CITY_RECIPIENTS, EMAIL_SEED, HR_SUMMARY_EMAIL, BRI_SUMMARY_EMAIL } from "./workerSeed.js";
import { PTO_SEED, PTO_BONUS_SEED, L10_ATTENDEE_DEFAULT, SWEEP_PEOPLE, NOTIFY_DEFAULTS, PIN_HELP_TO, SWEEP_EMAIL_EXTRA, PAY_ACCESS_IDS, SCHEDULE_PUBLISH_IDS } from "./workerSeed.js";

/* ★ THIS STORE'S WEB ADDRESS, FOR THE TWO PLACES THE SERVER PRINTS IT.
   Adopted from the second store, who wrote it first and hit the reason: a clone
   was putting the ORIGIN store's domain into its calendar invites and its
   PIN-guessing alarm, as a default nobody had typed.
   ⚠️ NOTHING CHANGES HERE. The value is this store's own domain, so the UID it
   builds is byte-identical to the literal it replaces.
   ⚠️⚠️ AND THAT MATTERS MORE THAN IT LOOKS: a phone matches an update to a
   calendar event BY UID, so changing the UID on a store with invites already
   out makes the next update DUPLICATE instead of edit. Do not "tidy" the `gc-`
   prefix for the same reason.
   ⚠️ THE WORKER SEES THE DEPLOYED CONFIG, NEVER SAVED STORE SETTINGS —
   `applyStoreOverrides` runs only in the browser. Do not turn this into a
   settings read; it would look dynamic and never be. */
const HUB_HOST = String((STORE_CONFIG.identity && STORE_CONFIG.identity.domain) || "").trim() || "hub.invalid";


// worker.js — Gate City Hub
// Serves the built SPA (through the ASSETS binding), provides API routes for
// email (Resend) / Slack / live Google Sheets read-through, and runs the
// Hub's scheduled reports.
//
// SCHEDULING NOTE: native Cloudflare Cron Triggers do NOT work on this
// account, so cron-job.org calls GET /api/run-job?job=<name>&key=<RUN_JOB_KEY>
// on a schedule instead. The scheduled() handler below is a Cron-Trigger
// fallback kept only in case Triggers are ever enabled — the live path is
// /api/run-job.
//
// Requires Worker Secrets (Cloudflare dashboard → your Worker → Settings →
// Variables and Secrets → add Secret):
//   RESEND_API_KEY        — for email sending
//   SWEEP_COPY_EMAIL      — OPTIONAL, and empty at Gate City on purpose. Set it
//                           on a CLONED store's Worker and that store's daily
//                           security sweep emails a copy of its report there as
//                           well as DMing its own owner. The sweep reports over
//                           Slack, which cannot cross workspaces, so without
//                           this a clone's sweep reaches nobody outside that
//                           store — and a silent sweep reads as an all-clear.
//                           Matt, Aug 11 2026: "I want the reports sent to me
//                           until the system is set."
//   GOOGLE_SHEETS_API_KEY — for reading the BOH/FOH schedule sheets
//   SLACK_BOT_TOKEN       — for posting to Slack (needs chat:write scope +
//                           channels:read/groups:read to resolve channel
//                           names; bot must be invited to any private
//                           channel it posts to). JOB 6's per-trainer DM loop
//                           additionally needs users:read to map names → user
//                           IDs; without it that loop is skipped (guarded).
//   SUPABASE_URL          — same value as the app's VITE_SUPABASE_URL
//   SUPABASE_SERVICE_KEY  — Supabase SERVICE ROLE key (Project Settings →
//                           API). NOT the anon key — cron has no logged-in
//                           user, so it needs to bypass row-level security.
//
// Requires a Bindings → KV Namespace on this Worker:
//   GATE_CITY_KV — used only as a lightweight "did this job already run
//   today" guard against double-firing, and to hold the Equipment Check
//   tier-2+ reminder flag the frontend can read. The Hub's real shared data
//   (cleaning sign-offs, waste log, cash audits, HR records, etc.) all lives
//   in Supabase via store.js — this Worker reads that directly for reports.

const FROM = `${STORE.legalName} <${STORE.notifyEmail}>`;

// One address book, server-side only — edit recipients here, never in the app code.
/* ⚠️ FALLBACK ONLY — DO NOT ADD NEW ENTRIES HERE. ⚠️
   These four personal addresses were the ONLY routing table the Hub had, which
   meant a seat changing hands, a role change or a termination silently kept
   mailing store operations to somebody's personal inbox forever. Ownership now
   lives in KV `org:seats` (the accountability chart, as data) and is resolved
   at send time by `recipientFor()` below.
   This map survives purely so a notification can never go NOWHERE if that KV
   read fails. Verified Jul 28 2026: all four are Active in HR and each matches
   the seat holder in org:seats, so the fallback is currently correct — but it
   is a snapshot and WILL rot. Fix the seat map, not this. */
/* 🐛 FOUR GATE CITY PERSONAL INBOXES USED TO BE HARDCODED HERE, AND THEY WERE
   THE SILENT FALLBACK FOR EVERY STORE (Aug 10 2026, sweep finding 28).
   Matt, Aug 10: "i want the data to go into each stores own."

   What that did to a second store: their Cash Audit change fund order —
   requester, order lines, dollar total, notes — emailed a Gate City team
   member's personal Gmail. Their equipment flags emailed another. And
   /api/tool-notify answered ok, so the store never learned the mail had left
   the business. Nothing was wrong at Gate City; the addresses were correct
   here, which is exactly why nobody found it.

   ⇒ RESOLUTION ORDER, AND THERE IS NO STRANGER AT THE END OF IT:
     1. the SEAT on the accountability chart, resolved against this store's
        roster at send time, so a promotion moves the email with it;
     2. this store's own override key, for a store that has not filled its
        roster in yet;
     3. NOTHING. No send, and the route says so.

   ⚠️ ONLY foodsafety AND equipment HAVE A SEAT, AND THAT IS DELIBERATE — do not
   "fix" it by adding the other two to TOOL_SEAT. orgSeats.js says why in its
   own words: cleaning and cashaudit are resolved PER DAY off the Daily Setup
   board by pushToOwners, because Matt's rule is "audit is by open and closing
   leaders", and a fixed seat holder is not day-accurate. Adding them there
   would give the Hub two opinions about one person, which is the bug that file
   exists to prevent. I started to make exactly that change and backed it out.
   ⇒ So for those two the EMAIL resolves to this store's override key and then
   to the OWN-STORE fallback below, while the PUSH keeps going to whoever the
   board says owns it today — always the day-accurate half, and unaffected.
   ⚠️ A WRONG-STORE EMAIL IS WORSE THAN A MISSING ONE: it cannot be recalled, it
   carries money detail, and the sender is told it worked.
   ⚠️ A KEY, NOT storeConfig.js. That file ships to every browser, and four
   personal addresses in it would redo the Aug 4 leak that pulled 105 emails
   out of the public bundle. Read here on the service key and nowhere else. */
const STORE_RECIPIENTS_KEY = "gcfcr-store-recipients-v1";

/* ⚠️ SCOPED TO ONE STORE NUMBER, AND THAT IS THE WHOLE TRICK. Cash Audit is a
   LIVE caller and is NOT seat-routed, so deleting these outright would have
   silently stopped this store's change-fund emails until somebody hand-set a
   key — losing a real notification here to fix a bug this store does not have.
   Gating them on STORE.fsr keeps Gate City exactly as it is, while a clone gets
   NOTHING and falls through to "no recipient", because changing STORE.fsr to
   its own number is step one of standing a clone up. The fallback disables
   itself; nobody has to remember to delete it.
   ⚠️ Server side only — worker.js is never served to a browser. */
const GATE_CITY_FSR = "04010";
const ownStoreFallback = (tool) =>
  (STORE.fsr === GATE_CITY_FSR ? GATE_CITY_RECIPIENTS[tool] : null) || null;

/* ═══ A SEED IS GATE CITY'S OR IT IS EMPTY ═══════════════════════════
   ⚠️⚠️ SEVEN ROUTES HANDED THIS RESTAURANT'S REAL OPERATING DATA TO WHATEVER
   STORE RAN THIS WORKER (found Aug 12 2026, while a second store was standing
   up their site). Between them: people by name with their PTO days and dated
   absences, the bonus figure beside each name, the safe counts and their
   denomination mix, the FY26 operator scorecard, a month of itemised shrink,
   a month of food gaps, the supplier roster with its standing contracts, and
   the facilities punch list with owners named.

   ⚠️⚠️ AND THIS IS THE HOLE THE AUG 8-9 FIX OPENED. Every one of these tables
   was moved OUT of the browser bundle on those two days because it shipped to
   anonymous visitors. Moving them behind the Worker closed that, and left this:
   the Worker never asked WHICH STORE was asking. The data did not stop being
   Gate City's when it stopped being public.

   ⚠️ SEVERAL OF THESE DO NOT MERELY DISPLAY. The tile writes the seed into that
   store's OWN KV on first open and then the seed never fires again — so the
   figures stop looking like a fallback and start looking like their history.

   ★ ONE HELPER, SEVEN CALLERS, SO NO ROUTE CAN DRIFT. Seven copies of the same
   ternary is how six of them stay right and the seventh quietly does not.

   ⚠️ EMPTY, NEVER A 403. Checked every caller before choosing this: all seven
   already treat an empty payload as "nothing to seed" on their failure path, so
   a clone gets a WORKING tile with nothing in it rather than an error banner.
   The cash audit route says it outright three lines above itself — "a failed or
   forbidden fetch must yield an EMPTY seed, which adds nothing and writes
   nothing" — and that file's history includes a dropped read seeding over the
   real ledger twice.

   ⚠️ THE EMPTY VALUE IS PASSED IN, NOT GUESSED HERE, because the shapes differ:
   `{}` for the ym-keyed and year-keyed tables, `[]` for the lists. A `{}` where
   the caller checks Array.isArray is a silently skipped seed. */
const seedFor = (mine, empty) => (STORE.fsr === GATE_CITY_FSR ? mine : empty);

/* ═══════════════════════════════════════════════════════════════════
   WHO OWNS THIS? — the single routing lookup.

   Matt, Jul 28 2026: "send directly to the people on the accountability
   chart." The chart existed only as prose inside AccountabilityChart.jsx,
   so nothing could route off it. `org:seats` is that chart as data:
     seats[<seat>] = { label, holderId, holder, escalatesTo }
     toolSeat[<tool>] = <seat>
   holderId is the HR roster id, which is what makes this durable — the
   email and the display name are read from HR at send time, so a changed
   address or a promotion follows automatically.

   ⚠️ TERMINATION IS HANDLED HERE, deliberately: if the seat holder is no
   longer Active, this escalates to `escalatesTo` rather than mailing a
   former team member. That was the actual bug this replaces.

   ⚠️⚠️ `toolSeat` COVERS ONLY `foodsafety` AND `equipment` — ON PURPOSE.
   `cleaning` and `cashaudit` are resolved PER DAY off the Daily Setup board
   by `pushToOwners` / `ownersForInput` further down this file: cleaning goes
   to that day's station owners, cash audit to the opening and closing
   leaders. Those two are correct and day-accurate; a fixed seat holder is
   not. Adding them here would give the Hub two opinions about the same
   person and they WILL drift apart. Food safety has its own rota and
   equipment is not a board seat, which is exactly why they belong here.
   ═══════════════════════════════════════════════════════════════════ */
/* This store's own override, for a store whose roster is not filled in yet.
   Shape: { "<tool>": { "name": "...", "to": "..." } }. Absent by default, which
   is correct — a store that has not set it gets no email rather than someone
   else's. Never falls back to another store's people. */
async function storeRecipient(env, tool) {
  try {
    const map = await sbGet(env, STORE_RECIPIENTS_KEY);
    const hit = map && typeof map === "object" ? map[tool] : null;
    if (hit && hit.to) return { name: String(hit.name || "there"), to: String(hit.to) };
  } catch { /* unreachable config is not a licence to email a stranger */ }
  return null;
}

/* Returns the person to email, or NULL. ⚠️ NULL MEANS SEND NOTHING — it is not
   an invitation to guess. /api/tool-notify answers ok:false so the tile can say
   the notice did not go, which is the part that was missing: it used to answer
   ok while the mail went to another store's staff. */
async function recipientFor(env, tool) {
  const fb = (await storeRecipient(env, tool)) || ownStoreFallback(tool);
  try {
    /* ★ THE SEAT COMES FROM `orgSeats.js` — the SAME module AccountabilityChart
       renders from. It used to come from a KV snapshot Claude typed by reading
       the chart, which is two records of one fact; they drifted inside a day
       (facilities recorded under Chloe while the chart said Brandon). Now a
       seat change is one edit and both the chart and this routing follow it.
       The KV key `org:seats` is superseded and must not be re-introduced. */
    const seat = seatForTool(tool);
    if (!seat || !seat.holderId) return fb;

    const roster = (await sbGet(env, "gcfcr-hr-team-v1")) || [];
    const byId = {};
    for (const p of roster) if (p && p.id) byId[String(p.id)] = p;

    const active = (p) => p && p.email && String(p.status || "Active").toLowerCase() === "active";

    let person = byId[String(seat.holderId)];
    if (!active(person) && seat.escalatesTo) person = byId[String(seat.escalatesTo)];
    if (!active(person)) return fb;

    /* First name only — matches the tone of the existing emails.
       ⚠️ OFF hrDisplayName, so a preferred name wins before the split. Taking
       the first word of the roster name greets Guadalupe
       as "Guadalupe" when the whole store calls her Lupe. A nickname with a
       space in it ("Mary Jo") still reduces to its first word, which is the
       same rule as before and the right one for a greeting. */
    const shown = hrDisplayName(person);
    return { name: shown.split(" ")[0] || shown, to: person.email, seat: seat.fn };
  } catch {
    return fb;
  }
}

/* ★★ THE SIXTH CHOKE POINT, AND IT WAS THE LAST ONE MISSING (Aug 9 2026 sweep).
   🐛 `&quiet=1` is what CLAUDE.md tells Matt to add to ANY manual /api/run-job
   test, and its whole promise is that a rehearsal bothers nobody. Five siblings
   honour it — sendSlack (:252), sendSlackDM (:297), postToSlackChannel (:366),
   pushToPerson (:4163) and pushToUid (:5710). This one, the raw fetch to Resend,
   never did. So a dry run of the trainer-tasks job put a real "100% Complete"
   email in a real inbox, and `runFoodSafetyWeekly` emailed on BOTH of its exits.
   Worse than the noise: the trainer-tasks caller stamps a once-a-WEEK guard the
   moment this resolves, so the rehearsal also retired the real Monday send.
   ⚠️ RETURNS A FAKE RESPONSE, NOT `true`. Callers read this three different
   ways — `/api/tool-notify` checks `res.ok`, `sendEmailOk` checks `res.ok` then
   `res.text()`, and older sites discard it. A quiet run has to walk the same
   branches a real one does, or the rehearsal proves nothing about the code that
   actually ships. Same shape as sendSlack's fake response above. */
/* ═══ WHERE A REPLY LANDS ═══════════════════════════════════════════════════
   ⚠️⚠️ ONE DEFINITION, TWO SEND SITES (design rule 8). This Worker builds a
   Resend request in two places — `sendEmail` below and the paid-out receipt
   route — and a reply-to added to only one of them is the bug wearing its own
   fix. Both call this.

   ⚠️ IT READS `storeBrand`, NOT `STORE.identity.replyToEmail`. The Worker never
   runs applyStoreOverrides, so `STORE.*` here is the DEPLOYED DEFAULT forever.
   storeBrand is the Worker's single live read of a store's saved settings and
   is already cached, so this costs nothing per send.

   ⚠️ IT CANNOT STOP AN EMAIL. storeBrand times out at two seconds and answers
   from the code default on any failure, so the worst case is a mail with no
   reply-to — which is exactly what every mail had before this existed. */
async function replyToFor(env) {
  try {
    const b = await storeBrand(env);
    return String((b && b.replyTo) || "").trim();
  } catch { return ""; }
}

/* ⚠️ `attachments` IS OPTIONAL AND ADDED, NEVER SWAPPED IN. Every existing
   caller passes four arguments, gets `undefined` here, and the key is left off
   the body entirely — so the request Resend receives is byte-for-byte the one
   it received yesterday. Design rule 1, applied to a function's contract rather
   than to a stored shape.
   Shape is `[{ filename, content }]` with `content` base64 and the MIME type
   derived from the extension. That is not a guess: the paid-out receipt route
   below has been sending attachments to Resend exactly this way. */
/* ⚠️ ASYNC NOW, AND EVERY CALLER ALREADY AWAITED IT. Counted before changing
   it: six call sites, all `await sendEmail(...)`. The reply-to has to come from
   `storeBrand`, which is a settings read, so this cannot stay synchronous. */
async function sendEmail(env, to, subject, text, attachments) {
  const files = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
  if (env && env.__QUIET) {
    /* ⚠️ THE REHEARSAL HAS TO MENTION THE ATTACHMENT. `&quiet=1` is what
       CLAUDE.md tells Matt to add to any manual run, and a dry run that prints
       a mail with no sign of the invite would read as proof the invite is not
       being built. */
    /* The rehearsal names the reply-to for the same reason it names the
       attachment: a dry run that omits it reads as proof it is not being set. */
    const qReply = await replyToFor(env);
    console.log(`[quiet] would email ${to}: ${subject}${files.length ? ` (+${files.map((f) => f.filename).join(", ")})` : ""}${qReply ? ` [reply-to ${qReply}]` : ""}\n${text}`);
    return Promise.resolve({
      ok: true,
      status: 200,
      quiet: true,
      json: async () => ({ ok: true, quiet: true, to, subject }),
      text: async () => JSON.stringify({ ok: true, quiet: true }),
    });
  }
  const body = { from: FROM, to: [to], subject, text };
  /* ⚠️ ADDED, NEVER SWAPPED IN — the same rule the attachments key follows.
     A store that has set no reply-to sends a body byte-for-byte identical to
     the one Resend received yesterday. */
  const replyTo = await replyToFor(env);
  if (replyTo) body.replyTo = replyTo;
  if (files.length) body.attachments = files;
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/* ── ADDRESSES RESEND WILL NOT DELIVER TO ─────────────────────────────────
   Found 12 Aug 2026, and only because Matt pushed back on an answer of mine.
   One team member had been receiving nothing since 4 Aug: her address hard
   bounced once, Resend blocked it, and two document notices afterwards were
   accepted with a 200 and thrown away. Nothing on any screen said so.
   ⚠️ THE GUARD BELOW CANNOT SEE THIS. It throws on a 4xx, which is a rotated
   key or a bad address. A blocked address is a 200 with an id. The send is
   indistinguishable from a good one at the moment it happens, which is why
   this has to be asked as a separate question rather than caught in the send.
   ⚠️ CACHED, AND SHORTER ON FAILURE. HR Console asks on every open and the
   answer changes maybe twice a year, so five minutes costs nothing. A failed
   lookup retries in one, so a rotated key is not invisible for five.
   ★ CONTRACT VERIFIED AGAINST RESEND'S OWN SDK, not assumed:
   GET /suppressions → { object: "list", has_more, data: [{ id, email,
   origin, source_id, created_at }] }. */
let blockedCache = null;                 // { until, map }  map === null means unknown
const BLOCKED_TTL_OK_MS = 5 * 60 * 1000;
const BLOCKED_TTL_ERR_MS = 60 * 1000;
const BLOCKED_TIMEOUT_MS = 4000;

async function blockedEmails(env) {
  const now = Date.now();
  if (blockedCache && now < blockedCache.until) return blockedCache.map;
  let map = null;
  try {
    const res = await Promise.race([
      fetch("https://api.resend.com/suppressions?limit=100", {
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
      }),
      new Promise((r) => setTimeout(() => r(null), BLOCKED_TIMEOUT_MS)),
    ]);
    if (res && res.ok) {
      const body = await res.json().catch(() => null);
      const rows = body && Array.isArray(body.data) ? body.data : null;
      /* A 200 whose body is not the documented shape is a FAILED lookup, not an
         empty one. Reading a changed response as "nobody is blocked" is exactly
         the false all-clear this whole route exists to remove. */
      if (rows) {
        map = {};
        for (const r of rows) {
          const e = String((r && r.email) || "").trim().toLowerCase();
          if (!e) continue;
          map[e] = { origin: String((r && r.origin) || ""), since: String((r && r.created_at) || "").slice(0, 10) };
        }
      }
    }
  } catch { map = null; }
  /* ⚠️⚠️ null IS NOT {}. An empty map means "nobody is blocked" and the screen
     may say so. null means "could not find out" and the screen must say
     NOTHING AT ALL. Collapsing the two would render a failed lookup as an
     all-clear, which is the same silent lie that hid this for eight days. */
  blockedCache = { until: now + (map ? BLOCKED_TTL_OK_MS : BLOCKED_TTL_ERR_MS), map };
  return map;
}

/* ★★ AN EMAIL THAT FAILED MUST THROW. THE SIBLING OF sendSlackDM.
   `sendEmail` is a bare fetch, so `await sendEmail(...)` resolves for a 401 on
   a rotated RESEND_API_KEY, a 403 on an unverified domain, a 422 on a bad
   address and a 429 on a rate limit. Every caller that then records "sent" is
   recording a guess.
   That is not hypothetical here: the trainer-tasks completion email stamps a
   once-a-WEEK guard straight after the send, so one refusal means the person
   waiting on it hears nothing until the following Monday, and /api/notify
   answers ok:true for a write-up or an injury notice the member never
   received.
   ⚠️ Same reason this is a NEW function rather than a change to sendEmail:
   /api/tool-notify already does `const res = await sendEmail(...)` and reads
   `res.ok`, so changing the return type would break a caller that got it
   right. Use this one everywhere the result is currently discarded. */
async function sendEmailOk(env, to, subject, text, attachments) {
  const res = await sendEmail(env, to, subject, text, attachments);
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.text()).slice(0, 200); } catch { detail = ""; }
    throw new Error(`Email to ${to} failed: ${res.status}${detail ? ` ${detail}` : ""}`);
  }
  return true;
}

/* ═══ A CALENDAR INVITE, AS A FILE ══════════════════════════════════════════
   Matt, Aug 11 2026: "can my Google Calendar be connected to the hub for my
   personal calendar? Can I also get push notifications for the meeting requests
   as well as to my email".

   Push already worked. Email did not, and neither did anything reaching a
   calendar. This is both.

   ⚠️⚠️ NO OAUTH, AND THAT IS THE DESIGN, NOT A SHORTCUT. Connecting a Google
   account means a consent screen, a refresh token this Worker has to store and
   rotate, a second thing that can expire quietly, and it works for exactly one
   person — every co-host would have to connect their own. An .ics attachment is
   one tap into Google Calendar, Apple Calendar or Outlook, works for all of
   them on day one, and there is no token to leak or expire. Design rule 4, and
   rule 16: the layer that works end to end beats the better design that is half
   finished.

   ⚠️ METHOD:PUBLISH, NOT REQUEST. REQUEST is a formal invitation with an
   organiser you can RSVP to. The reply would go to a notify address nobody
   reads, while claiming to come from a person this store does not send mail as.
   PUBLISH says "here is an event, put it in your calendar", which is the whole
   of what was asked for.

   ⚠️ THE UID IS STABLE PER SLOT, so a booking mailed twice updates one event
   rather than drawing two on the same afternoon. */

/* ⚠️ `at` IS LOCAL WALL TIME WITH NO ZONE — "2026-08-20T15:00", written straight
   from a `datetime-local` input (CalendarTile.jsx: `at: slotAt.trim()`). An .ics
   carries UTC, and "add the offset" is wrong twice a year, because the offset on
   Aug 20 is not the offset on Jan 15. This asks the runtime what that wall time
   IS in the store's zone and corrects by the difference, so it lands right on
   both sides of both daylight-saving changes.
   ⚠️ THE REGEX IS ALSO THE VALIDATOR: it takes hours and minutes only, so the
   seconds some browsers append cannot reach `new Date()` and turn a real time
   into Invalid Date. Anything that does not match returns null, and every caller
   below falls back to the raw string rather than inventing a time. */
function icsUTC(at, tz) {
  const m = String(at || "").match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const asUTC = new Date(`${m[1]}T${m[2]}:${m[3]}:00Z`);
  if (isNaN(asUTC)) return null;
  /* The offset in force at some instant, in milliseconds. */
  const offAt = (d) => {
    const seen = new Date(d.toLocaleString("en-US", { timeZone: tz }));
    return isNaN(seen) ? null : d - seen;
  };
  /* ⚠️⚠️ TWO PASSES, AND THE SECOND ONE IS NOT BELT AND BRACES — ONE PASS IS
     WRONG AND WAS CAUGHT BY TEST, NOT BY READING. The first sample is taken at
     the wall time treated as UTC, which is four or five hours EARLIER than the
     real instant, so it reads the offset from the wrong side of any change that
     falls in that gap. On 8 Mar 2026 a 3:00 AM meeting came back as 4:00 AM:
     the sample landed at 10 PM the previous evening, still on standard time,
     and the clocks had gone forward in between. Re-sampling AT the candidate
     lands inside the right offset and converges — every other case returns the
     same answer twice, which is asserted. */
  const off1 = offAt(asUTC);
  if (off1 == null) return null;
  const first = new Date(asUTC.getTime() + off1);
  const off2 = offAt(first);
  if (off2 == null) return null;
  return new Date(asUTC.getTime() + off2);
}

/* The same instant, in the words a person reads. Falls back to the stored
   string, which is what every notice said before today, so a time this cannot
   parse gets worse-looking rather than missing. */
function calWhenText(at, tz) {
  const d = icsUTC(at, tz);
  if (!d) return String(at || "");
  return d.toLocaleString("en-US", { timeZone: tz, weekday: "long", month: "long",
    day: "numeric", hour: "numeric", minute: "2-digit" });
}

const icsStamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/* ⚠️ BACKSLASH FIRST OR IT ESCAPES ITS OWN ESCAPES. A comma or a semicolon is
   a field separator in an .ics, so one unescaped comma in "Moore, Bri" splits a
   line into two properties and the calendar refuses the whole file. */
const icsEsc = (s) => String(s == null ? "" : s)
  .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/* RFC 5545 folds long lines. ⚠️ SPLIT BY CODE POINT, NEVER BY `slice` ON THE
   RAW STRING: an emoji in a meeting label sits in two UTF-16 units, and cutting
   between them writes half a character, which is a file the calendar rejects
   outright. 73 is inside the 75-octet limit for anything Latin-1 and a few
   octets over for accented text, which every parser accepts — the opposite
   mistake is fatal, this one is not. */
const icsFold = (line) => {
  const cp = Array.from(line);
  if (cp.length <= 73) return line;
  const out = [cp.slice(0, 73).join("")];
  for (let i = 73; i < cp.length; i += 72) out.push(" " + cp.slice(i, i + 72).join(""));
  return out.join("\r\n");
};

/* ⚠️ CRLF, NOT \n. RFC 5545 requires it and Outlook enforces it. */
function icsFor({ uid, summary, description, at, mins, tz, organizer, organizerName }) {
  const start = icsUTC(at, tz);
  if (!start) return null;
  const dur = Number(mins) > 0 ? Number(mins) : 30;
  const end = new Date(start.getTime() + dur * 60000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${icsEsc(STORE.legalName)}//${icsEsc(STORE.appName)}//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsEsc(uid)}`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsEsc(summary)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${icsEsc(description)}`);
  if (organizer) lines.push(`ORGANIZER;CN=${icsEsc(organizerName || STORE.legalName)}:mailto:${organizer}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

/* ⚠️ btoa ALONE THROWS ON ANYTHING ABOVE U+00FF, and this roster holds names
   like José and Adriana. One accented name in a meeting label
   would have thrown inside the booking route, where the catch is there to stop
   a failed NOTICE undoing a good booking — so the invite would have gone
   missing silently and the booking would have looked fine.
   The chunking is the same reason the receipt route chunks: `apply` on a very
   long array blows the call stack. */
/* ═══ ONE PERSON SIGNS ONE ROW ══════════════════════════════════════════════
   ★★ THE ACKNOWLEDGEMENT MECHANISM, EXTRACTED SO THERE IS EXACTLY ONE OF IT.
   Document sends and announcements both come through here. Matt, Aug 13 2026:
   "Reuse the write-up acknowledgement mechanism. Do not build a second one."

   🐛 WHY THIS SHAPE, AND IT IS NOT STYLE. Every signature in this app used to
   be a WHOLE-MAP write, and the whole-map door requires full HR access. So a
   team member who read a document and tapped Acknowledge got "That did not
   save… check your connection" — a permission refusal wearing a network
   error's clothes — and the acknowledgment never recorded. Sent Documents
   showed 0 of N forever. The answer was one route that writes exactly one
   person's row and nothing else, and this is that, now shared.

   ⚠️ THE SERVER DECIDES WHO SIGNED, from the token. Nothing takes an id from
   the body: an id in the body is the old hole with extra steps.
   ⚠️ IT MUST HAVE BEEN SENT TO THEM. Without the targets check, any signed-in
   person could add themselves to the acknowledgement list of something they
   were never given.
   ⚠️ WRITE-ONCE. A signature is evidence of a moment; letting it be re-written
   silently replaces the record of when they agreed. HR corrects through the
   console, not by overwriting.
   ⚠️ AN UNREADABLE LIST IS A 503, NEVER AN EMPTY ARRAY. Treating a failed read
   as "no records" and writing on top of it destroys everybody else's rows —
   the same failure the rollouts tile shipped with and was found to have. */
/* ═══ ONE WRITER FOR EVERY ANNOUNCEMENT, WHOEVER IS POSTING ════════════════
   Aug 13 2026: the team scoreboard now lands in the Hub as well as Slack
   (Matt: "start with the team scoreboard"), so a SCHEDULED JOB writes an
   announcement for the first time. It cannot go through /api/announcement —
   there is no token and no signed-in person behind a cron — so the choice was
   one shared writer or a second copy of the create logic in the job.

   ⚠️ IT IS A COPY THAT WOULD HAVE DRIFTED, not a copy that stays honest. The
   thing being duplicated is the record SHAPE plus the read-strictly-or-refuse
   rule, and this repo has the scar: `normName` in three places, deciding who
   matched whom. Design rule 8.

   ⚠️ AN UNREADABLE LIST RETURNS null AND WRITES NOTHING. Rebuilding an array
   on top of a failed read erases every announcement in the store — the
   rollouts-tile wipe. The caller decides what to say about it; this refuses.

   ⚠️ IT DOES NOT PUSH, AND THAT IS DELIBERATE RATHER THAN MISSING. The route
   pushes because a leader posting something is news; the scoreboard does not,
   because Matt said no push on it — a weekly nice-to-have on ~106 phones is
   how an app gets muted, and a muted app is worse than no app. Keeping the
   push at the CALL SITE is what makes that decision visible instead of buried.

   ⚠️ `id` AND `createdAt` ARE ALWAYS GENERATED HERE and cannot be passed in.
   A caller that could set either could forge when something was sent. */
async function writeAnnouncement(env, fields, known) {
  const list = known === undefined ? await sbGetStrict(env, ANNOUNCE_KEY).catch(() => null) : known;
  if (list === null) return null;
  const all = annList(list);
  const ev = annMake({
    ...(fields || {}),
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  });
  await sbSet(env, ANNOUNCE_KEY, [ev, ...all]);
  return ev;
}

/* Everyone still on the roster, as the ROSTER spells them. Used to address an
   announcement that a job is sending rather than a person.
   ⚠️ THE ROSTER'S OWN IDS (`tm55`), NOT BARED ONES. The compose box sends
   these, the read list looks them back up in the roster to put names on the
   columns, and announcements.js compares them loosely — so storing them
   faithfully is what keeps a job's announcement identical to a leader's.
   ⚠️ RETURNS [] ON A FAILED READ, and every caller must treat that as "do not
   send". An announcement addressed to nobody is refused downstream, which is
   the behaviour we want: silence beats a record that reached no one. */
async function everyoneOnRoster(env) {
  const team = await sbGet(env, "gcfcr-hr-team-v1").catch(() => null);
  if (!Array.isArray(team)) return [];
  const gone = await terminatedIds(env);
  return team
    .filter((p) => p && p.id
      && String(p.status || "").toLowerCase() !== "terminated"
      && !gone.has(bareId(p.id)))
    .map((p) => String(p.id));
}

async function ackOneRow(env, opts) {
  const { key, id, uid, sig, nowIso, missing, unreadable, refuse } = opts || {};
  const list = await sbGet(env, key);
  if (!Array.isArray(list)) {
    return Response.json({ ok: false, error: unreadable || "record-unreadable" }, { status: 503 });
  }
  const i = list.findIndex((s) => s && String(s.id) === String(id));
  if (i < 0) return Response.json({ ok: false, error: missing || "no-such-record" }, { status: 404 });
  const rec = list[i];
  if (typeof refuse === "function") {
    const why = refuse(rec);
    if (why) return Response.json({ ok: false, error: why }, { status: 409 });
  }
  /* ⚠️⚠️ COMPARED BARE, AND THIS LINE IS WHY ANNOUNCEMENTS REACHED NOBODY.
     `targetIds` carries the roster's own ids (measured in production Aug 13
     2026: tm1, tm2, tm3 …) while `uid` comes off the token, which sign-in mints
     from gcfcr-hr-pins, whose keys are bare (1, 2, 3 …). `"tm55" === "55"` is
     false, so every team member confirming an announcement was told
     "not-a-recipient" about something addressed to them.
     ⚠️ IT WIDENS NOTHING. bareId only folds a `tm` prefix and case, which is
     the repo's settled answer for "same person" (nameMatch.sameId); two
     genuinely different people never collide under it. Document sends come
     through this same function and are unaffected — bare still equals bare. */
  const targets = Array.isArray(rec.targetIds) ? rec.targetIds : [];
  if (!targets.some((t) => bareId(t) && bareId(t) === bareId(uid))) {
    return Response.json({ ok: false, error: "not-a-recipient" }, { status: 403 });
  }
  const acks = rec.acks && typeof rec.acks === "object" && !Array.isArray(rec.acks) ? rec.acks : {};
  /* Keyed by the BARE id, and read back the same way by announcements.js
     `stampFor`. One spelling for a stamp, or "already signed" and the read list
     disagree about the same signature. */
  const me = bareId(uid) || String(uid);
  if (annStampFor(acks, me)) return Response.json({ ok: false, error: "already-signed" }, { status: 409 });
  const next = list.slice();
  next[i] = { ...rec, acks: { ...acks, [me]: { at: nowIso, sig } } };
  await sbSet(env, key, next);
  return Response.json({ ok: true });
}

function utf8b64(s) {
  const bytes = new TextEncoder().encode(String(s == null ? "" : s));
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/* ═══ TELLING THE PEOPLE ON AN INVITATION ═══════════════════════════════════
   Bri, Aug 11 2026, on what the calendar still could not do: "I want to be able
   to set alerts for leaders of all tiers to receive with certain scheduled
   things." Until this, an invitation told nobody anything — five directors
   found out about Monday's L10 whenever they next happened to open the Hub.

   ★ NOTHING HERE IS NEW MACHINERY. The booking half already sends a push, a
   Slack DM and an email carrying a .ics, and this is that same path pointed at
   invitees. Writing a second sender would have given the store two ways to be
   told about a meeting that could drift apart in wording, in escaping and in
   which channel wins.

   ⚠️⚠️ ONE `try` PER CHANNEL, NOT ONE ROUND THE LOT. Copied deliberately from
   the booking path, where the scar is recorded: three channels under a single
   catch meant a push that threw took the Slack DM down with it and that person
   heard nothing at all. Email is the one Matt asked for and it sits last, so a
   shared catch would have made it the most likely to go quiet, and quietly.

   ⚠️ ONE PERSON FAILING NEVER STOPS THE REST. The loop's own body is guarded,
   so a roster row that cannot be resolved costs that person their alert and
   nobody else theirs.

   ⚠️⚠️ THE .ics UID IS THE EVENT ID AND IS BUILT ONCE, OUTSIDE THE LOOP. Every
   invitee has to receive the SAME uid or accepting produces one separate
   calendar entry per person, which nobody can move or cancel together. Same
   rule the booking path learned; the difference is that this fans out to 60
   people instead of three, so getting it wrong is 60 orphans rather than two.

   ⚠️ ADDRESSES AND SLACK IDS COME FROM HR, NEVER FROM THE REQUEST. A body that
   could name an address is a store that can be made to mail anyone.

   ⚠️ NO @channel AND NO CHANNEL POST. These are DMs to named invitees. An
   invitation is between the organiser and the people on it.

   ⚠️ RUNS IN THE BACKGROUND, AND THE CALLER MUST PASS ctx.waitUntil. 60 people
   across three channels is the widest fan-out in this file; inline, the
   organiser watches a spinner while it happens and one slow Slack call takes
   the whole invitation down with it. The meeting is already saved before this
   is called, so a failure here costs alerts and never the meeting. */
async function tellInvitees(env, ev, organiserName) {
  const out = { told: 0, skipped: 0, failed: 0 };
  const ids = Array.isArray(ev && ev.inviteeIds) ? ev.inviteeIds : [];
  if (!ids.length) return out;

  const when = calWhenText(ev.at, STORE_TZ);
  const mins = ev.mins || 30;
  const line = `${organiserName} invited you to ${ev.title} — ${when} (${mins} min).`;
  const ics = icsFor({
    uid: `gc-ev-${ev.id}@${HUB_HOST}`,
    summary: ev.title,
    description: `${organiserName} invited you through the Hub.${ev.note ? `\n\n${ev.note}` : ""}`,
    at: ev.at, mins, tz: STORE_TZ,
    organizer: STORE.notifyEmail, organizerName: STORE.legalName,
  });

  /* One read of each HR source for the whole loop, the same two the booking
     path and the notify route read, normalised the same way. */
  const [hrInfoRaw, hrAddedRaw] = await Promise.all([
    sbGet(env, "gcfcr-hr-info").catch(() => null),
    sbGet(env, HR_ADDED_KEY).catch(() => null),
  ]);
  const hrInf = hrInfoRaw && typeof hrInfoRaw === "object" && !Array.isArray(hrInfoRaw) ? hrInfoRaw : {};
  const hrAdd = Array.isArray(hrAddedRaw) ? hrAddedRaw : [];

  for (const raw of ids) {
    const who = bareId(raw);
    if (!who) { out.skipped++; continue; }
    try {
      const n = await rosterNameForUid(env, who).catch(() => "");
      if (!n) { out.skipped++; continue; }
      let reached = false;
      try { await pushToPerson(env, n, { title: "New meeting invitation", body: line }, who); reached = true; } catch { /* the meeting stands */ }
      try {
        const sid = await slackIdForName(env, n);
        if (sid) { await sendSlackDM(env, sid, line); reached = true; }
      } catch { /* the meeting stands */ }
      try {
        const em = emailFromSources({ id: String(who), name: n }, hrInf, hrAdd);
        if (em) {
          await sendEmailOk(env, em, `${ev.title} — ${when}`,
            `${organiserName} invited you to ${ev.title}.\n\n${when}\n${mins} minutes\n`
            + (ev.note ? `\n${ev.note}\n` : "")
            + `\nOpen the Hub to accept or decline.\n`
            + (ics ? "\nThe invite is attached. Open it once and it goes in your calendar.\n" : "")
            + `\n— ${STORE.legalName}`,
            ics ? [{ filename: "invitation.ics", content: utf8b64(ics) }] : null);
          reached = true;
        }
      } catch { /* the meeting stands */ }
      if (reached) out.told++; else out.failed++;
    } catch { out.failed++; }
  }
  return out;
}

/* ★★ QUIET MODE LIVES HERE NOW, AT THE BOTTOM (Aug 5 2026 sweep, high severity).
   🐛 `&quiet=1` is what CLAUDE.md tells Matt to add to ANY manual /api/run-job
   test, and its whole promise is that a rehearsal bothers nobody. Two of the
   three choke points honoured it — the channel post and the DM helper. This
   function, the raw fetch underneath both, did not. ELEVEN call sites reach
   Slack through it directly and every one of them ignored quiet: the Cash Audit
   seat DM, the trainer cleaning DMs, the security sweep post, the L10 recap, the
   adoption DMs, the adoption summary to Bri, and a channel post. So testing any
   of those jobs messaged real people, at up to 106 of them, exactly when Matt
   believed he was rehearsing.

   ⚠️ WHY IT IS SAFE TO PUT IT HERE, when the note on sendSlackDM says it is not.
   That note is about PARSING: reading res.json() inside this function would
   consume the stream and break every caller that parses it afterwards. This does
   not parse anything. It returns a stand-in that answers `json()` the way Slack
   answers a success, so every caller — the ones that parse, the ones that check
   `data.ok`, and the ones that ignore the result — behaves exactly as it does on
   a real send. A quiet run stays a true rehearsal rather than a different code
   path that might work.

   ⚠️ THE OTHER TWO CHECKS STAY. sendSlackDM and postToSlackChannel each check
   quiet before calling this, so they can log what they WOULD have sent with the
   recipient's name attached. Removing theirs to rely on this one would lose that
   detail from the log, which is the part that makes a dry run readable. */
/* ★ IS SLACK SET UP AT THIS STORE AT ALL? One copy, same shape as
   `vapidReady` below, which answers the identical question for push.

   🐛 A STORE WITH NO SLACK DID NOT GO QUIET, IT THREW. 01818 uses phone
   notifications only and has no `SLACK_BOT_TOKEN`. Every Slack call then went
   out with `Authorization: Bearer undefined`, Slack answered HTTP 200 with
   `{ok:false}`, and the wrappers turned that into an exception. Seventeen
   scheduled jobs died at their first Slack line — and three of them
   (runCleaningSummary, runTrainerTasksSummary, runOpsChecklistRecap) send a
   PHONE PUSH further down the same function, so the delivery that store
   actually chose never ran. NEW-STORE-SETUP.md flagged this as open and
   untraced and guessed the fix was "one early return in sendSlack". It is not:
   `postToSlackChannel` throws two calls upstream, in resolveChannel, before
   sendSlack is ever reached. Both are guarded now.

   ⚠️ NOT HAVING SLACK IS NOT AN ERROR, and that is the whole design. A store
   that chose push gets no-ops that report themselves as not-sent, never a
   failed job. The one thing that must NOT happen is a skipped message being
   recorded as delivered — that is the scar behind sendSlackDM's throw, and
   every guard below preserves it. */
function slackReady(env) {
  return !!(env && env.SLACK_BOT_TOKEN);
}

function sendSlack(env, channel, text) {
  /* ⚠️ BEFORE THE QUIET CHECK ON PURPOSE. A quiet run is a rehearsal of a real
     send, so at a store that can never send, the honest rehearsal is "this
     would not have gone anywhere". Reporting `ok:true, quiet` there would tell
     Matt a test passed for a message the store cannot deliver.
     ⚠️ THE SHAPE IS A FAILED SLACK RESPONSE, NOT A SUCCESSFUL ONE. All fourteen
     direct callers already read `res.json()` and test `data.ok`, so every one
     of them records not-sent with no edit. sendSlackDM parses this and throws,
     which is exactly right: its throw is what stops a refused DM being filed as
     delivered, and this is a refused DM. */
  if (!slackReady(env)) {
    console.log(`[no slack] SLACK_BOT_TOKEN is not set; not sending to ${channel}`);
    return Promise.resolve({
      ok: false,
      status: 0,
      skipped: "slack not configured",
      json: async () => ({ ok: false, error: "slack_not_configured" }),
      text: async () => JSON.stringify({ ok: false, error: "slack_not_configured" }),
    });
  }
  if (env && env.__QUIET) {
    console.log(`[quiet] would send to ${channel}:\n${text}`);
    return Promise.resolve({
      ok: true,
      status: 200,
      quiet: true,
      json: async () => ({ ok: true, quiet: true, channel, text }),
      text: async () => JSON.stringify({ ok: true, quiet: true }),
    });
  }
  return fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, text }),
  });
}

/* ★★ A DM THAT FAILED MUST THROW. USE THIS FOR EVERY DM.
   🐛 Found Aug 3 2026. `sendSlack` is a bare fetch that returns the Response,
   and Slack answers a REFUSED message with **HTTP 200** and `{ok:false,
   error:"channel_not_found"}` in the body. So `try { await sendSlack(...) }
   catch { failed = true }` never fires — the catch is unreachable for the
   failure it was written to catch, and the caller records a success.

   That is not theoretical. `runOnboardingNotice` marks a new hire ANNOUNCED on
   exactly that pattern, and the list of announced hires is what stops it
   trying again. So a DM Slack refused meant Hannah and Bri were never told a
   new hire had finished onboarding, permanently, and the job reported sent.
   The hire's ID sat in HR Console with nobody looking for it.

   ⚠️ NOT folded into `sendSlack` itself. `postToSlackChannel` calls that one
   and then reads `res.json()` — parsing the body here would consume the stream
   and break every channel post. Channel posts already check `data.ok` and
   throw correctly; it was only ever the DMs that skipped the check. */
async function sendSlackDM(env, uid, text) {
  /* ⚠️ THE THIRD CHOKE POINT, AND IT WAS MISSING (Aug 4 2026). The comment
     above postToSlackChannel says quiet mode works at "the two choke points" —
     the channel post and the person push. DMs are a third, and they never got
     it. So the documented dry run, `&quiet=1`, which CLAUDE.md tells Matt to
     add to any manual /api/run-job test, still sent real Slack messages to
     real people. The whole point of quiet is that his tests bother nobody. */
  if (env && env.__QUIET) {
    console.log(`[quiet] would DM ${uid}:\n${text}`);
    return true;
  }
  const res = await sendSlack(env, uid, text);
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!data || !data.ok) {
    throw new Error(`Slack DM to ${uid} failed: ${(data && data.error) || `http ${res.status}`}`);
  }
  return true;
}

/* ═══ A SCHEDULED NOTIFICATION THAT DID NOT SEND ════════════════════════════
   🐛 THE JOBS SWALLOWED THEIR OWN FAILURES. Every person-directed reminder job
   ended its DM attempt with an empty catch carrying the note "one failed DM
   must not stop the rest" — which is the right call, and is NOT the same thing
   as letting the failure vanish. (That note is quoted rather than pasted: a
   real comment marker inside this block would close it early, which is exactly
   what happened on the first draft and what the parse check caught.)
   Nothing was recorded anywhere a human looks. The only trace was a
   console.error inside a Cloudflare Worker, which nobody reads and which is
   gone within the day.

   So the shape of the bug is identical to the one that cost Jose his two
   recommendations: the message did not arrive, the job reported success, and
   the only person who could have noticed was the one person who was never told.
   ProfessionalGrowth.jsx says it plainly and it applies here word for word:
   "THE FIX IS NOT 'MAKE SLACK MORE RELIABLE', IT IS 'STOP LOSING THE ANSWER'."

   ★ THE SAME KEY THE BROWSER ALREADY WRITES, on purpose. gc-pg-notify-log-v1 is
   already a recovery worklist, already capped, and already read out in the
   weekly report. A second log would be a second place to look, and the person
   looking would have no way to know there were two.
   ⚠️ TAGGED `source: "job"`, because the advice differs. A browser failure is
   resendable from Professional Growth; a missed scheduled reminder is not — it
   ran, it is gone, and somebody has to say the words themselves.

   ⚠️ READS STRICT AND GIVES UP ON A REFUSED READ. sbGet answers null for BOTH
   "no rows" and "Supabase said no", and writing [entry] on top of the second
   one would replace the whole recovery log with a single line. Dropping one
   record beats destroying the log that exists to make misses recoverable —
   the same reasoning the browser copy carries.
   ⚠️ NEVER THROWS. It is called from inside catch blocks whose entire job is to
   let the run continue. */
const JOB_NOTIFY_LOG_KEY = "gc-pg-notify-log-v1";
const JOB_NOTIFY_LOG_MAX = 40;

async function logJobNotifyFailure(env, about, err) {
  try {
    const prior = await sbGetStrict(env, JOB_NOTIFY_LOG_KEY);
    const list = Array.isArray(prior) ? prior.filter(Boolean) : [];
    const entry = {
      at: new Date().toISOString(),
      about: String(about || "a scheduled notification").slice(0, 200),
      error: String((err && err.message) || err || "unknown").slice(0, 200),
      source: "job",
    };
    await sbSet(env, JOB_NOTIFY_LOG_KEY, [entry, ...list].slice(0, JOB_NOTIFY_LOG_MAX));
  } catch (e) {
    /* Best effort by definition. If the log itself cannot be written the run
       still has to finish — the console line is all that is left, and it is
       still better than the job dying. */
    console.error("could not record a failed notification:", about, e);
  }
}

// ── Slack channel name → ID resolver ────────────────────────────────
let channelCache = null;

async function loadChannelCache(env) {
  /* Belt to postToSlackChannel's braces. That guard stops the scheduled jobs
     reaching here, but resolveChannel is also called from /api/slack-notify,
     and any future caller inherits this for free. An empty cache means
     resolveChannel answers null rather than throwing on `Bearer undefined`. */
  if (!slackReady(env)) return {};
  const cache = {};
  let cursor;
  do {
    const url =
      `https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200` +
      (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
    });
    const data = await res.json();
    if (!data.ok) {
      throw new Error(`Slack conversations.list failed: ${data.error || "unknown error"}`);
    }
    (data.channels || []).forEach((c) => { cache[c.name] = c.id; });
    cursor = data.response_metadata?.next_cursor || null;
  } while (cursor);
  return cache;
}

async function resolveChannel(env, nameOrId) {
  if (!nameOrId) return null;
  // Pass raw Slack IDs straight through: C/G = channels, D = an already-open
  // DM, U = a user (chat.postMessage opens a DM when handed a user ID). This
  // is what lets /api/slack-notify DM a person by passing their Uxxxx id as
  // the "channel" — used by the waste tracker's "Signal input done" button.
  if (/^[CGDU][A-Z0-9]{8,}$/.test(nameOrId)) return nameOrId;
  const clean = nameOrId.replace(/^#/, "");
  if (!channelCache) channelCache = await loadChannelCache(env);
  if (channelCache[clean]) return channelCache[clean];
  channelCache = await loadChannelCache(env);
  return channelCache[clean] || null;
}

// Convenience wrapper used by the scheduled jobs below — resolves the
// channel name and posts, throwing on failure so the caller's try/catch
// can report it clearly instead of failing silently.
/* ═══ QUIET TEST RUNS ══════════════════════════════════════════════════
 * Matt, Jul 27: "The team gets annoyed with all of my tests." Every manual
 * `/api/run-job` hit posted `@channel` to the whole store, so verifying a fix
 * cost the team a notification each time — which trains people to ignore the
 * channel, and the channel is where the real nudges live.
 *
 * `&quiet=1` sets `env.__QUIET`, and the THREE choke points — the channel post,
 * the person push, and sendSlackDM above — return what they WOULD have sent
 * instead of sending it. (This said "two" until Aug 4 2026, and the DM was the
 * one that was actually missing it, so the comment described the bug.) ★ Deliberately at the CHOKE POINTS, not inside each job: a new
 * job is silent by default rather than needing to remember, which is the
 * opposite of the pattern that let jobs report success while doing nothing.
 * ⚠️ Everything else still runs for real — status keys are written, storage is
 * read — so a quiet run is a true rehearsal, not a simulation.
 */
async function postToSlackChannel(env, channelName, text) {
  /* ⚠️⚠️ THIS EARLY RETURN IS THE ONE THAT UNBREAKS THE SEVENTEEN JOBS, and it
     has to sit ABOVE resolveChannel rather than inside sendSlack. resolveChannel
     calls loadChannelCache, which is a raw fetch of conversations.list; with no
     token Slack answers `{ok:false}` and that function throws by design. So the
     job died before sendSlack was ever called, which is why the runbook's
     suggested one-line fix would not have worked.
     ⚠️ RETURNS, NEVER THROWS. Throwing is what took the rest of each job down
     with it, including the phone push three lines later in the ones that have
     one. A store with no Slack now completes its jobs and delivers by push.
     ⚠️ AND IT IS `ok:false`, NOT `ok:true`. Two callers read this return —
     postMonthly, which decides whether to burn the month's already-sent flag,
     and runTeamScoreboard's `posted` field. A cheerful `ok:true` here would let
     postMonthly stamp a report as sent that nobody received, and that report
     does not come round again for a month. */
  if (!slackReady(env)) {
    console.log(`[no slack] not posting to #${channelName}; SLACK_BOT_TOKEN is not set`);
    return { ok: false, skipped: "slack not configured", channel: channelName };
  }
  if (env && env.__QUIET) {
    console.log(`[quiet] would post to #${channelName}:\n${text}`);
    return { ok: true, quiet: true, channel: channelName, text };
  }
  const id = await resolveChannel(env, channelName);
  if (!id) throw new Error(`Slack channel "${channelName}" not found or bot not invited`);
  const res = await sendSlack(env, id, text);
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack post to "${channelName}" failed: ${data.error || "unknown"}`);
}

// ── Live Google Sheets read-through (Daily Setups "Google Docs" board) ──
const SHEETS_SPREADSHEET_IDS = {
  foh: "13WPR7Nmoqz7L-ZQar-7QbsziCgt_duQ1Gnwl2vV1xj0",
  boh: "1LmiXgkadd587hCs2KE35XflNO_HexfwWpDAf5YGkGaA",
};
const SHEETS_BOH_TABS = {
  Monday: "Monday", Tuesday: "Tuesday", Wednesday: "Wednesday",
  Thursday: "Thursday", Friday: "Friday", Saturday: "Saturday",
};
const SHEETS_FOH_TABS = {
  Monday: "Mon", Tuesday: "Tues", Wednesday: "Wed",
  Thursday: "Thurs", Friday: "Fri", Saturday: "Sat",
};
const SHEETS_RANGE_BY_SIDE = { foh: "A1:H60", boh: "A1:J100" };

async function fetchLiveSchedule(env, side, day) {
  const tabMap = side === "foh" ? SHEETS_FOH_TABS : SHEETS_BOH_TABS;
  const tab = tabMap[day];
  if (!tab) return { status: 400, body: { error: `Unknown day "${day}" for side "${side}"` } };
  const apiKey = env.GOOGLE_SHEETS_API_KEY;
  if (!apiKey) return { status: 500, body: { error: "GOOGLE_SHEETS_API_KEY is not set on this Worker" } };
  const spreadsheetId = SHEETS_SPREADSHEET_IDS[side];
  const range = `${tab}!${SHEETS_RANGE_BY_SIDE[side]}`;
  const apiUrl =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}` +
    `?key=${apiKey}&valueRenderOption=FORMATTED_VALUE`;
  let res;
  try {
    res = await fetch(apiUrl);
  } catch (e) {
    return { status: 502, body: { error: `Fetch to Sheets API failed: ${e.message}` } };
  }
  if (!res.ok) {
    const errBody = await res.text();
    return { status: res.status, body: { error: `Sheets API returned ${res.status}`, detail: errBody } };
  }
  const data = await res.json();
  return { status: 200, body: { side, day, tab, values: data.values || [] } };
}

// ═══════════════════════════════════════════════════════════════════
// Supabase REST helpers — reads/writes the SAME kv_store table store.js
// uses from the browser (via SUPABASE_URL / SUPABASE_SERVICE_KEY secrets).
// window.storage (used by DailyCleaning, WasteTracker, CashAudit) is
// a shim over this exact same store (see main.jsx), so this is the one
// true source of shared Hub data.
// ═══════════════════════════════════════════════════════════════════
async function sbGet(env, key) {
  const url = `${env.SUPABASE_URL}/rest/v1/kv_store?key=eq.${encodeURIComponent(key)}&select=value`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows && rows[0] ? rows[0].value : null;
}

/* Same read, but a REFUSED response THROWS instead of returning null. sbGet
   answers null for "absent" and "Supabase said no" alike — fine for display
   paths, fatal for read-merge-write guards. The input-push job's only-once
   guard reads through this: its sentReadOk sentinel catches a throw, so a
   refused read now correctly skips the guard write instead of passing
   through as "nothing sent today" and repeating every push. An absent key
   still returns null — that genuinely means nothing sent yet. */
async function sbGetStrict(env, key) {
  const url = `${env.SUPABASE_URL}/rest/v1/kv_store?key=eq.${encodeURIComponent(key)}&select=value`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`kv read refused: ${res.status} for ${key}`);
  const rows = await res.json();
  return rows && rows[0] ? rows[0].value : null;
}

/* ⚠️ THROWS WHEN SUPABASE REFUSES THE WRITE.
   🐛 This used to fire the request and ignore the response completely — no
   `res.ok`, no status, nothing. Both write doors (`/api/hr-store` and
   `/api/kv-set`) then returned `{ ok: true }` unconditionally, so store.js saw
   a success and `kvSet` returned true for a write that never landed. That is
   what defeated HR Console's loud save-failed alert: it only fires on !ok, and
   ok was hard-coded true by the layer underneath it.
   Throwing is right rather than returning false — every caller here is already
   inside a try/catch that turns an exception into a real error response. */
async function sbSet(env, key, value) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/kv_store`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.text()).slice(0, 300); } catch {}
    throw new Error(`kv write failed ${res.status} for "${key}": ${detail}`);
  }
}

/* ── ATOMIC COUNTERS (Postgres, not Cloudflare KV) ────────────────────────
   ⚠️ KV CANNOT DO THIS. No atomic increment, and get() is served from the colo
   cache, so `n = get(k); put(k, n+1)` loses every concurrent write: 2,000
   parallel POSTs all read 0 and the counter ends at 1. That is the sign-in bug
   this whole plan exists for — the PIN limiter looked like a limiter and held
   nothing.
   ★ INCREMENT FIRST, THEN JUDGE THE NUMBER THIS RETURNS. Reading a count and
   then deciding is the same time-of-check bug in a different store.
   ⚠️ FAILS OPEN, ON PURPOSE, AND IT IS NOT THE SAME CALL AS THE PINS READ.
   sbGet is a plain select the sign-in already cannot live without. This is a
   NEW dependency with new failure modes: a missing grant, a stale PostgREST
   schema cache, row-lock contention under the very flood it exists to stop.
   Refusing sign-in on any of those would build the outage the attacker wanted.
   null means "unknown", and unknown never blocks.
   ⚠️ 600ms CEILING so a slow counter can never add latency to a leader signing
   in during a lunch rush. */
const COUNTER_TIMEOUT_MS = 600;
const sbHeaders = (env) => ({
  apikey: env.SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  "Content-Type": "application/json",
});
/* ⚠️ `detail` IS AN OUT-PARAMETER AND IT EARNED ITS PLACE. The first live test
   returned only "UNREACHABLE", which is a word, not a diagnosis — it covers a
   missing grant, a stale PostgREST schema cache, a wrong URL and a timeout
   equally well, and we burned a deploy guessing between them. /api/gate-health
   passes an object and reports the status code and the first 200 bytes of the
   body, so the next failure names itself.
   ⚠️ THE TIMEOUT IS PER-CALL. Sign-in keeps the 600ms ceiling so a slow counter
   can never delay a leader during a rush; the health probe passes a longer one,
   because "slow" and "broken" are different answers and the bare 600ms could
   not tell them apart. Note sbGet, which has worked all along, sets no timeout
   at all — so 600ms was a NEW constraint this file had never had to meet. */
async function bumpCounter(env, key, windowSec, detail) {
  const d = detail || {};
  const ms = Number(d.timeoutMs) || COUNTER_TIMEOUT_MS;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/bump_counter`, {
      method: "POST", headers: sbHeaders(env),
      body: JSON.stringify({ p_key: String(key), p_window_sec: Number(windowSec) }),
      signal: AbortSignal.timeout(ms),
    });
    d.status = res.status;
    if (!res.ok) {
      try { d.body = (await res.text()).slice(0, 200); } catch {}
      return null;
    }
    const n = Number(await res.json());
    if (!Number.isFinite(n)) { d.err = "body was not a number"; return null; }
    return n;
  } catch (e) {
    d.err = String((e && (e.name || e.message)) || e).slice(0, 80);
    return null;
  }
}
async function resetCounter(env, key) {
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/reset_counter`, {
      method: "POST", headers: sbHeaders(env),
      body: JSON.stringify({ p_key: String(key) }),
      signal: AbortSignal.timeout(COUNTER_TIMEOUT_MS),
    });
  } catch {}
}
/* Read without incrementing. For /api/gate-health and the 5am sweep only. */
async function peekCounter(env, key) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/rate_counters?k=eq.${encodeURIComponent(key)}&select=n,resets`,
      { headers: sbHeaders(env), signal: AbortSignal.timeout(COUNTER_TIMEOUT_MS) });
    if (!r.ok) return null;
    const row = (await r.json())[0];
    if (!row) return 0;
    return new Date(row.resets).getTime() < Date.now() ? 0 : (Number(row.n) || 0);
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════
// Slack profile photos → KV, for HR Console avatars.
// Pulls users.list with the bot token (needs `users:read`, which the bot
// ALREADY has — no reinstall), and caches a name→photo-URL map so the
// browser never talks to Slack. Matching is BY NAME: there's no shared id
// between the HR roster and Slack, and matching on email would need the
// `users:read.email` scope = a Slack reinstall = re-inviting the bot to
// every private channel. Not worth it. Every name variant Slack gives us
// (real_name, display_name) becomes a key pointing at the same photo, so
// a roster name matches if it equals ANY of them.
// Users on Slack's DEFAULT avatar are skipped (is_custom_image false) —
// those are just coloured initials, and the Hub draws better ones itself.
// ═══════════════════════════════════════════════════════════════════


async function runSlackAvatars(env) {
  /* Reports skipped rather than throwing. This job's whole product is a Slack
     directory, so at a store with no Slack there is nothing to build and no
     failure to report — and it must not overwrite `hr:slack-avatars:v1` with an
     empty map either, because that key is what `slackIdForName` reads first.
     Returning before any write leaves whatever is stored alone. */
  if (!slackReady(env)) return { skipped: "slack not configured", members: 0, withPhoto: 0 };
  const byName = {};
  // idByName: normalised name → Slack user ID. Same matching as the photo map,
  // but captured BEFORE the is_custom_image skip — a user on the default Slack
  // avatar still has an ID, and identity matters more than a picture.
  // AMBIGUITY IS FATAL HERE, not cosmetic: two people sharing a normalised
  // name would mean one person authenticating as the other, so any clashing
  // key is DELETED rather than resolved. Never guess an identity.
  const idByName = {};
  const idClash = new Set();
  // ★ SECONDARY INDEX (Jul 25). The lookups below feed HR ROSTER names into a
  // map keyed on SLACK names, and the two don't always agree. Live example:
  // Slack has "Tashiana", HR has "Tashiana" — normName
  // gives "tashianacortes" vs "tashianacortescampos", so she resolves to
  // nothing and her reminder is silently dropped. Same failure that hid the
  // food safety rota and Bri's recommendation requests.
  // Keyed on first-name and first+last-initial. ⚠️ THE FATAL-AMBIGUITY RULE
  // FROM idByName IS KEPT AND MATTERS MORE HERE — these keys are deliberately
  // looser, so any key two people could answer to is deleted outright. A
  // dropped reminder is recoverable; DMing one person's evaluation list to
  // another is not.
  const idByShort = {};
  const shortClash = new Set();
  const shortKeys = (raw) => {
    const parts = String(raw || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return [];          // a single name adds nothing idByName lacks
    const out = [normName(parts[0])];
    out.push(normName(parts[0] + parts[1][0]));
    return [...new Set(out.filter(Boolean))];
  };
  let cursor = "", pages = 0, members = 0, withPhoto = 0;
  do {
    const u = new URL("https://slack.com/api/users.list");
    u.searchParams.set("limit", "200");
    if (cursor) u.searchParams.set("cursor", cursor);
    const r = await fetch(u.toString(), { headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` } });
    const j = await r.json();
    if (!j.ok) throw new Error("slack users.list failed: " + (j.error || "unknown"));
    for (const m of (j.members || [])) {
      if (m.deleted || m.is_bot || m.id === "USLACKBOT") continue;
      members++;
      const p = m.profile || {};
      for (const cand of [p.real_name, p.display_name, p.real_name_normalized, m.real_name, m.name]) {
        const k = normName(cand);
        if (!k) continue;
        if (idByName[k] && idByName[k] !== m.id) { idClash.add(k); continue; }
        idByName[k] = m.id;
        for (const sk of shortKeys(cand)) {
          if (idByShort[sk] && idByShort[sk] !== m.id) { shortClash.add(sk); continue; }
          idByShort[sk] = m.id;
        }
      }
      if (!p.is_custom_image) continue;
      const photo = p.image_192 || p.image_512 || p.image_72 || "";
      if (!photo) continue;
      withPhoto++;
      for (const cand of [p.real_name, p.display_name, p.real_name_normalized, m.real_name, m.name]) {
        const k = normName(cand);
        if (k && !byName[k]) byName[k] = photo;
      }
    }
    cursor = (j.response_metadata && j.response_metadata.next_cursor) || "";
    pages++;
  } while (cursor && pages < 10);

  for (const k of idClash) delete idByName[k]; // ambiguous → no identity at all
  for (const k of shortClash) delete idByShort[k];

  /* ★★ AMBIGUITY IS A PROPERTY OF THE ROSTER, NOT OF WHO HAPPENS TO BE IN SLACK.
     🐛 Every clash above is counted among SLACK MEMBERS ONLY. There are ~99
     Slack accounts against ~106 roster people, so a namesake who has no Slack
     account contributes NO clash — and the key then resolves confidently to the
     one who does. That is how a public @mention on a food safety post can tag
     the wrong colleague: the rota reads the full name off the ROSTER, misses on
     the full key, misses on first-plus-initial, and hits a bare `lizbeth` that
     belongs to the other one. `tagged` goes true, so the "could not notify"
     branch never fires, and the post renders only the mention — the real
     assignee's name never appears in the channel at all.
     ⇒ Count the owners on the ROSTER and delete every key more than one roster
     person could answer to, from all three maps. A dropped reminder is
     recoverable. Naming the wrong colleague in public is not.
     ⚠️ byName IS INCLUDED, and it never had a clash rule at all — that is the
     same bare key that puts one Adriana's face on the other's square. */
  const roster = await sbGet(env, "gcfcr-hr-team-v1");
  if (!Array.isArray(roster) || !roster.length) {
    /* ⚠️ FAIL LOUDLY RATHER THAN WRITE A MAP NOBODY CHECKED. The previous map
       stays in place and keeps working; a job failure is visible. Writing a
       Slack-only map here would look exactly like a good run. */
    throw new Error("slack-avatars: roster unreadable — refusing to write a name map that cannot be checked for namesakes");
  }
  const rosterClash = new Set();
  const ownerOf = new Map();
  for (const p of roster) {
    if (!p || !p.name) continue;
    const who = bareId(p.id) || normName(p.name);
    for (const k of [normName(p.name), ...shortKeys(p.name)]) {
      if (!k) continue;
      if (ownerOf.has(k) && ownerOf.get(k) !== who) rosterClash.add(k);
      else ownerOf.set(k, who);
    }
  }
  for (const k of rosterClash) {
    delete idByName[k];
    delete idByShort[k];
    delete byName[k];
  }
  await sbSet(env, "hr:slack-avatars:v1", {
    byName, idByName, idByShort, ambiguous: [...idClash], ambiguousShort: [...shortClash],
    /* Stored so the next reader can see the roster rule ran, and on what. A map
       with no `rosterAmbiguous` key was written before this existed. */
    rosterAmbiguous: [...rosterClash], rosterChecked: roster.length,
    updatedAt: new Date().toISOString(), members, withPhoto,
  });
  return { members, withPhoto, keys: Object.keys(byName).length,
    ids: Object.keys(idByName).length, ambiguous: idClash.size, pages };
}

// ── Small helper: "has this job already fired today?" guard using the
//    Cloudflare KV binding (fast, no Supabase round-trip needed for this).
//    Cron can occasionally double-fire on retries; this prevents a
//    duplicate Slack post/email in that case. ──
async function alreadyRanToday(env, jobKey) {
  /* 🐛 WAS toISOString() — UTC, while every other date in this file is ET via
     isoOfD(nowET()). Concrete failure: a manual run at 9pm ET Monday (already
     Tuesday in UTC) stamps `ran:job` with Tuesday. Tuesday 9am ET the real
     scheduled run computes the same Tuesday date, matches, and returns
     "already-ran-today" — the morning job silently does not run, and the only
     symptom is a Slack post that never arrives. The Sunday 8pm jobs sit
     exactly on the UTC midnight boundary, so a retry across it double-posted.
     ⚠️ `isoOfD` is a const declared below this function. Safe: this is only
     ever called from a request handler, long after module evaluation. */
  const today = isoOfD(nowET());
  const last = await env.GATE_CITY_KV.get(`ran:${jobKey}`);
  if (last === today) return true;
  await env.GATE_CITY_KV.put(`ran:${jobKey}`, today, { expirationTtl: 60 * 60 * 24 * 3 });
  return false;
}

// ── Eastern-time helper — DST-safe ──
// Derive ET wall-clock from the IANA zone instead of a fixed offset, so every
// scheduled job stays correct across the Nov/Mar clock changes. Workers run in
// UTC, so a Date built from the ET locale string reports ET wall-clock through
// its getHours()/getDay()/getDate() — exactly what the gates below read.
function nowET() {
  const d = new Date();
  return new Date(d.toLocaleString("en-US", { timeZone: STORE_TZ }));
}
/* ★ THE STORE IS CLOSED SUNDAYS (Matt, Aug 2 2026: "let's not do Sunday posts,
   let them start on Monday"). The Morning Ops Digest and the Ops Checklists
   recap both ran `* * *` on cron-job.org, so both posted into
   #operational-success on a day nobody worked — a digest about a shift that
   never happened, and a checklist recap counting items nobody could tick. That
   is the wallpaper problem: noise trains people to scroll past the channel,
   which costs the posts that DO matter.

   ⚠️ GUARDS THE JOB, NOT THE CRON. cron-job.org holds the schedule and editing
   it is a separate manual step; a guard here cannot be forgotten or undone by
   someone re-adding an entry. The job answers ok with skipped:"closed Sunday"
   so a monitoring check still sees a healthy call.
   ⚠️ DMs AND PUSHES ARE NOT AFFECTED — Matt: "DMs are still ok." Only the two
   channel-posting daily jobs use this. */
const isClosedDay = () => nowET().getDay() === 0;
const pad2 = (v) => String(v).padStart(2, "0");
const isoOfD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

// ═══════════════════════════════════════════════════════════════════
// JOBS 14 + 15 — BOIL OUT REMINDERS → Slack #operational-success
// Hannah, Jul 24 2026. Her spec, confirmed in writing:
//   • primary fry   — every Monday, 6am, done before 11am
//   • secondary fry — every OTHER Tuesday, 6am, done before 11am,
//                     FIRST ONE 28 JULY 2026 (she gave the anchor date)
//   • henny 1-5     — the first FULL week of each month, 11am Mon-Fri,
//                     completed by the CLOSING leaders between 5 and close
//
// TWO CRON ENTRIES, NOT THREE. The day-by-day decisions live HERE rather than
// in the schedule, the same way runFoodSafetyAssign handles Sunday in code.
// Fewer cron rows to keep in step, and the rule is readable in one place.
// ═══════════════════════════════════════════════════════════════════
const BOIL_CHANNEL = CHANNELS.opsSuccess;
// The Tuesday Hannah named. Every second Tuesday FROM this date — an anchor,
// not a "week number", because week-of-year arithmetic drifts across new year.
const SECONDARY_FRY_ANCHOR = "2026-07-28";

// Whole days between two ISO dates, computed at UTC noon so a DST shift can
// never turn 14 days into 13.96 and round the alternation off by one.
function boilDaysBetween(isoA, isoB) {
  const [ay, am, ad] = isoA.split("-").map(Number);
  const [by, bm, bd] = isoB.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd, 12) - Date.UTC(ay, am - 1, ad, 12)) / 864e5);
}

// Is `d` in the first FULL week of its month?
// "Full" = Monday-to-Friday all inside the month, so a month that starts on a
// Thursday skips forward instead of firing Henny 1 and 2 in the previous
// month's last days. The first Monday of any month falls on the 1st-7th, so
// Monday+4 is always in the same month — the first full week is simply the
// week that first Monday opens.
function boilFirstFullWeek(d) {
  const y = d.getFullYear(), m = d.getMonth();
  const firstDow = new Date(y, m, 1).getDay();          // 0 Sun … 6 Sat
  const firstMonday = firstDow === 1 ? 1 : ((8 - firstDow) % 7) + 1;
  const day = d.getDate();
  return day >= firstMonday && day <= firstMonday + 4;
}

// 6am — fry. Monday every week, Tuesday every second week.
/* Push a boil-out to the people who actually have to do it.
   ⚠️ THE CHANNEL POST STAYS — Hannah asked for these in #operational-success
   and it is the shared record that the task was called for. Only the @channel
   PING goes: a fryer boil-out is a BOH opening job, and waking 35 phones at
   6am to reach the two or three people on the line is the definition of the
   noise this effort is cutting.
   Falls back silently to the channel post alone if the board can't be read —
   an unresolvable morning must never mean the boil-out goes unmentioned. */
async function pushBoilOut(env, title, body, wantClosers) {
  try {
    const monday = boardMondayKey(nowET());
    const [foh, boh] = await Promise.all([
      sbGet(env, boardKey("foh", monday)),
      sbGet(env, boardKey("boh", monday)),
    ]);
    const s = boardShift({ foh: foh || {}, boh: boh || {} }, nowET());
    // Openers own it; if the board has none this early, fall back to whoever
    // is on at all rather than telling nobody.
    const pick = wantClosers ? s.closer : s.opener;
    const names = (pick && pick.length ? pick : s.all) || [];
    let sent = 0;
    for (const name of names) {
      const r = await pushToPerson(env, name, { title, body, url: "/" });
      if (r && (r === true || Number(r.sent) > 0)) sent++;
    }
    return { targeted: names.length, sent };
  } catch { return { targeted: 0, sent: 0 }; }
}

/* ═══ MONTHLY TEAM REPORTS ═════════════════════════════════════════════
   Matt, Aug 3 2026: "yes on the monthly reports for the fcr, guest feedback
   and food gaps." He had been writing these by hand; the July money report
   went out this afternoon.

   ★ DATA-TRIGGERED, NOT DATE-TRIGGERED. Each report posts the first time its
   own numbers exist for the closed month, and never again for that month. A
   job that fires on the 1st posts "we don't have the numbers yet", because
   the FCR is not uploaded on the 1st — checked before building this: on Aug 3
   the money data was there, the CEM was there, and Smart Shop and food gaps
   had never been entered at all. A calendar trigger would have posted two
   empty sections to 106 people.

   ★ THE DEDUP KEY IS SET ONLY AFTER A CONFIRMED POST. postToSlackChannel
   throws on a Slack error rather than returning false, so a failed post
   leaves the key unset and the next run retries. Marking it sent first is how
   a report silently never arrives.

   ★ NO SUNDAY CHANNEL POSTS. The store is closed and Matt's standing rule is
   that a channel post waits for Monday.

   ⚠️ EVERY FIGURE HERE IS ALREADY-COMPUTED STORED DATA. Nothing recalculates
   a percentage the tiles own. The month's food and paper % are deliberately
   ABSENT: that maths lives in costBreakdown inside FoodCostTracker.jsx, which
   is a React file this Worker cannot import, and a second copy of it here
   would drift from the tile the day either changed. YTD food cost comes
   straight off the FCR's own line totals, which need no maths at all. Moving
   costBreakdown into a leaf module is the clean way to add the monthly
   figure, and is a separate piece of work. */
const MONTHLY_CHANNEL = CHANNELS.opsSuccess;

const mPct = (n) => `${(Number(n) * 100).toFixed(1)}%`;
const mMoneyPer10 = (pct) => `$${(Number(pct) * 10).toFixed(2)}`;

/* Marks a report sent, but ONLY after it really posted. 400 days, so a month
   can never be re-reported a year later by a key that quietly expired. */
async function monthlyAlreadySent(env, kind, ym) {
  try { return !!(await env.GATE_CITY_KV.get(`monthly:${kind}:${ym}`)); } catch { return false; }
}
/* ⚠️ A DRY RUN MUST NOT CONSUME THE ONCE-ONLY FLAG.
   🐛 Found Aug 3 2026 the first time Matt ran this. postToSlackChannel returns
   { quiet: true } WITHOUT posting when &quiet=1 is set — that is the whole
   point of quiet mode — and this job then marked the report sent and answered
   `{"posted":"money"}`. Two failures in one: it lied about posting, and it
   burned the flag, so the REAL run would have skipped a report that had never
   gone out. Nobody would have noticed until the month ended with no report.

   This is the same rule the rest of the file already follows and the reason
   CRON-JOBS.md says to test with &quiet=1: `ok:true` never proves a message
   posted. Only a real send returns true here. */
async function postMonthly(env, text) {
  const res = await postToSlackChannel(env, MONTHLY_CHANNEL, text);
  /* ⚠️ `res.skipped` ADDED ALONGSIDE `res.quiet`, AND FORGETTING IT WOULD HAVE
     RECREATED THE EXACT BUG THE COMMENT ABOVE DESCRIBES. A store with no Slack
     now gets `{ok:false, skipped}` back instead of a thrown error, and a bare
     `!(res && res.quiet)` reads that as TRUE — "really sent" — so the caller
     burns the month's already-sent flag on a report nobody received, and it
     does not come round again for a month.
     ⚠️ On the real success path postToSlackChannel returns undefined, so this
     still answers true there. Unchanged at Gate City. */
  return !(res && (res.quiet || res.skipped));
}

async function monthlyMarkSent(env, kind, ym) {
  try { await env.GATE_CITY_KV.put(`monthly:${kind}:${ym}`, "1", { expirationTtl: 60 * 60 * 24 * 400 }); } catch { /* best effort */ }
}

function monthlyLabel(ym) {
  const [y, m] = String(ym).split("-").map(Number);
  const names = ["January", "February", "March", "April", "May", "June",
                 "July", "August", "September", "October", "November", "December"];
  return `${names[(m || 1) - 1]} ${y}`;
}

/* MONEY. Written for the floor, not for a director (Matt, Aug 3: "its for
   18-25 year olds so it needs to be educational and inspiring"). Profit is a
   PERCENTAGE and the dollars are forbidden — his standing rule. */
async function postMonthlyMoney(env, ym) {
  if (await monthlyAlreadySent(env, "money", ym)) return { skipped: "already sent" };
  const [act, ytd, bench] = await Promise.all([
    sbGet(env, `gcfcr-fcr-actual-${ym}-v1`).catch(() => null),
    sbGet(env, "gcfcr-fcr-ytd-v1").catch(() => null),
    sbGet(env, "gcfcr-laborbench-v1").catch(() => null),
  ]);
  const sales = Number(act && act.sales);
  const net = Number(act && act.netProfit);
  if (!(sales > 0) || !Number.isFinite(net)) return { skipped: "no FCR actual yet" };

  const pct = net / sales;
  const L = [`:mega: _${monthlyLabel(ym)} Money Report_`, "",
    "Team, here is how the store really did last month, in plain numbers.", ""];
  L.push(`_What profit actually is._ Out of every $10 a guest spent, about *${mMoneyPer10(pct)}* was left after food, wages, rent and everything else got paid. That is what keeps this place running and growing.`);

  const ySales = Number(ytd && ytd.sales);
  const yNet = Number(ytd && ytd.profit && ytd.profit["Net Profit"]);
  if (ySales > 0 && Number.isFinite(yNet)) {
    const yPct = yNet / ySales;
    L.push("", `Our year is averaging ${mMoneyPer10(yPct)}, so ${monthlyLabel(ym).split(" ")[0]} ran ${pct < yPct ? "a little behind" : "ahead of"} our own pace.`);
    const foodLine = Number(ytd && ytd.lines && ytd.lines["Food Cost"]);
    if (foodLine > 0) L.push("", `_Food, for the year so far._ ${mPct(foodLine / ySales)} of every sales dollar. That gap is real product: a filet dropped, a sandwich remade, sauce that walked out, fries that sat too long. None of it feels big in the moment. It adds up fast.`);
  }

  /* The labor gap is the TIR's own figure, entered from the report. It is
     stated as hours because "2.1% of sales" means nothing on the floor. */
  const row = Array.isArray(bench) ? bench.filter((b) => b && b.id === ym)[0] : null;
  const t20 = row && row.tiers && row.tiers["20"];
  if (t20 && Number.isFinite(Number(t20.oppHours))) {
    L.push("", `_And hours._ We used about *${Number(t20.oppHours).toFixed(0)} more labor hours a day* than the top Chick-fil-A stores did on the same sales. That is not about anyone working less. It is being sharp through the slow stretches so we are deep when it gets loud.`);
  }

  L.push("", "_Here is the good part._ These are won on the floor, in small moments, by you. Cook to the projection. Check the screen before you bag it. Ask for a task when you are caught up.");
  const sent = await postMonthly(env, L.join("\n"));
  if (!sent) return { quiet: true, wouldPost: "money", ym };
  await monthlyMarkSent(env, "money", ym);
  return { posted: "money", ym };
}

/* GUESTS. CEM and Smart Shop are typed in by hand from a report behind SSO,
   so either may be missing; whichever exists is reported and the other is
   simply not mentioned. Inventing a missing score would be worse than a
   shorter post. */
async function postMonthlyGuest(env, ym) {
  if (await monthlyAlreadySent(env, "guest", ym)) return { skipped: "already sent" };
  const [cemAll, shopAll] = await Promise.all([
    sbGet(env, "gcfcr-cem-v2").catch(() => null),
    sbGet(env, "gcfcr-smartshop-v1").catch(() => null),
  ]);
  const cem = Array.isArray(cemAll) ? cemAll.filter((e) => e && e.id === ym)[0] : null;
  const shop = Array.isArray(shopAll) ? shopAll.filter((e) => e && e.id === ym)[0] : null;
  if (!cem && !shop) return { skipped: "no guest scores yet" };

  const L = [`:mega: _${monthlyLabel(ym)} Guest Report Card_`, "",
    "Team, this is what our guests said about us last month.", ""];
  if (cem && Array.isArray(cem.metrics) && cem.metrics.length) {
    /* Biggest gap to the top stores leads, because that is the one worth
       working on. Sorted on the real numbers, never hand-picked. */
    const gaps = cem.metrics
      .filter((m) => m && Number.isFinite(Number(m.store)) && Number.isFinite(Number(m.top)))
      .map((m) => ({ name: m.name, store: Number(m.store), top: Number(m.top), gap: Number(m.top) - Number(m.store) }))
      .sort((a, b) => b.gap - a.gap);
    const worst = gaps[0];
    const best = gaps[gaps.length - 1];
    if (best) L.push(`_Where we are strong: ${best.name}, ${best.store}._ The top stores run ${best.top}. That is yours.`);
    if (worst && worst !== best) L.push("", `_The gap is ${worst.name}: ${worst.store}._ The top stores run ${worst.top}. It is ${worst.gap.toFixed(0)} points, and it is closed one guest at a time.`);
    if (Number.isFinite(Number(cem.count))) L.push("", `From ${cem.count} guest surveys.`);
  }
  if (shop && Number.isFinite(Number(shop.index))) {
    L.push("", `_Smart Shop: ${shop.index}._${Number.isFinite(Number(shop.chain)) ? ` The chain runs ${shop.chain}.` : ""}`);
  }
  const sent = await postMonthly(env, L.join("\n"));
  if (!sent) return { quiet: true, wouldPost: "guest", ym };
  await monthlyMarkSent(env, "guest", ym);
  return { posted: "guest", ym };
}

/* FOOD GAPS. The over-target subcategories Matt transcribes from the CFA
   drilldown. Only ever the top few — a list of fifteen line items is a list
   nobody reads, and the point is naming what to work on. */
async function postMonthlyGaps(env, ym) {
  if (await monthlyAlreadySent(env, "gaps", ym)) return { skipped: "already sent" };
  const all = await sbGet(env, "gcfcr-food-item-gaps-v1").catch(() => null);
  const rec = all && typeof all === "object" ? all[ym] : null;
  const items = (rec && Array.isArray(rec.items) ? rec.items : [])
    .filter((x) => x && Number(x.gap) > 0)
    .sort((a, b) => Number(b.gap) - Number(a.gap));
  if (!items.length) return { skipped: "no item gaps entered" };

  const top = items.slice(0, 4);
  const L = [`:mega: _${monthlyLabel(ym)} Food Focus_`, "",
    "Team, these are the items that cost us the most last month against target. Not blame — just where the attention goes.", ""];
  top.forEach((it, i) => L.push(`${i + 1}. *${it.name}*`));
  L.push("", "Portion them the way you were trained, and check the screen before it goes out. That is the whole fix.");
  const sent = await postMonthly(env, L.join("\n"));
  if (!sent) return { quiet: true, wouldPost: "gaps", ym };
  await monthlyMarkSent(env, "gaps", ym);
  return { posted: "gaps", ym };
}

async function runMonthlyReports(env, now) {
  const n = now || nowET();
  if (n.getDay() === 0) return { skipped: "closed Sunday" };
  const d = new Date(n.getTime());
  d.setDate(1); d.setMonth(d.getMonth() - 1);
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  /* Each is independent: one failing or having no data must never stop the
     others. Errors are reported, not swallowed into a green result. */
  const out = { ym };
  for (const [kind, fn] of [["money", postMonthlyMoney], ["guest", postMonthlyGuest], ["gaps", postMonthlyGaps]]) {
    try { out[kind] = await fn(env, ym); }
    catch (e) { out[kind] = { error: String(e) }; }
  }
  return out;
}

/* ═══ THE NIGHTLY BACKUP ═══════════════════════════════════════════════════
   Every row of the store's own data, written once a night to R2 as one JSON
   file. Nothing here reads or sends anything to anybody: it copies this store's
   database into this store's own bucket on this store's own account.

   ⛔⛔ THE SPEC SAID "READ EVERY ROW" AND THAT IS THE ONE THING A NAIVE READ
   CANNOT DO. Supabase REST returns a MAXIMUM OF 1000 ROWS per request. Measured
   against the live database on Aug 20 2026:

       kv_store       1,379 rows   <- already past the cap
       submissions      125 rows
       tool_events    7,326 rows   <- eight pages

   ⇒ A single unpaged GET would have backed up 1,000 of 1,379 keys, answered
   `ok: true` with a confident row count, and written a file that LOOKS like a
   backup. Nobody finds that out until they need it. This pages.

   ⚠️ ORDERED BY PRIMARY KEY, NEVER UNORDERED. Offset paging over an unordered
   result may repeat rows and skip others, because the database is free to
   return them in any order between requests. Each table is sorted by its own
   primary key: `key` for kv_store, `id` for the other two.

   ⚠️⚠️ IT REFUSES RATHER THAN TRUNCATES. If a table somehow exceeds the runaway
   cap, the job FAILS loudly instead of writing a short file. A backup that
   quietly holds nine tenths of the data is worse than no backup, because it
   stops anybody looking for the real one. Same reasoning as the write-path rule
   in this repo: a write unsure of the shape it is producing fails rather than
   saves.

   ⚠️ `rate_counters` IS DELIBERATELY NOT BACKED UP. It is throwaway rate-limit
   state that rebuilds itself in minutes, and it changes on nearly every
   request. `gcfcr_hr_store` is empty today and is included anyway, because "it
   is empty right now" is not a reason to leave a table out of a backup. */
const BACKUP_TABLES = [
  { table: "kv_store", order: "key" },
  { table: "submissions", order: "id" },
  { table: "tool_events", order: "id" },
  { table: "gcfcr_hr_store", order: "key" },
];
const BACKUP_PAGE = 1000;
/* A runaway guard, not a size limit. Roughly ten times today's whole database. */
const BACKUP_MAX_ROWS = 100000;

async function backupReadTable(env, table, order) {
  const rows = [];
  for (let offset = 0; ; offset += BACKUP_PAGE) {
    if (rows.length > BACKUP_MAX_ROWS) {
      throw new Error(`${table} passed ${BACKUP_MAX_ROWS} rows; refusing to write a partial backup`);
    }
    const url = `${env.SUPABASE_URL}/rest/v1/${table}`
      + `?select=*&order=${encodeURIComponent(order)}.asc`
      + `&limit=${BACKUP_PAGE}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    });
    /* ⚠️ THROWS. A refused read must never look like the end of the table —
       that is the difference between "the backup is complete" and "the backup
       stopped early and said nothing". Same rule as sbGetStrict. */
    if (!res.ok) throw new Error(`backup read refused: ${res.status} on ${table}`);
    const page = await res.json();
    if (!Array.isArray(page)) throw new Error(`backup read gave no rows array on ${table}`);
    rows.push(...page);
    if (page.length < BACKUP_PAGE) return rows;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   ★★ THE FILES, NOT JUST THE TABLES.

   Matt, Aug 20 2026: back up Supabase Storage too. Until now the nightly job
   copied four Postgres tables and NOTHING ELSE, so every uploaded ID, doctor's
   note, signed document, receipt, coursework file and task photo existed in
   exactly one place. A table backup that restores a row pointing at a file
   nobody kept is a backup that looks complete and is not.

   ⚠️⚠️ INCREMENTAL, AND THAT IS THE WHOLE DESIGN RATHER THAN AN OPTIMISATION.
   Copying the entire library every night would move the same gigabytes over
   and over, and a job that takes longer every week is a job that eventually
   times out at cron-job.org and stops running — which is exactly how
   `cleaning-summary` died. An object already in R2 AT THE SAME SIZE is
   skipped.

   ⚠️ SIZE IS THE TEST, NOT A CHECKSUM, and that is a stated trade. Supabase's
   listing gives a size and an updated_at; R2's head gives a size. Comparing
   sizes catches every added, removed and resized object, and misses only an
   edit that lands on exactly the same byte count. These are uploads — photos,
   PDFs, scans — not files edited in place, so that case is close to
   theoretical. A checksum would mean downloading every object every night,
   which is the thing being avoided.

   ⛔ A FAILED LISTING THROWS. Same posture as the table half: a bucket that
   could not be listed must never be written up as "0 objects", because a
   manifest claiming success is worse than no manifest at all. */
const BACKUP_BUCKETS = ["hr-files", "Receipts", "l101-coursework", "trainer-task-photos", "hub-assets"];
const BACKUP_LIST_PAGE = 100;
/* A runaway guard, not a size limit, matching BACKUP_MAX_ROWS above. */
const BACKUP_MAX_FILES = 20000;

const backupFilesName = () => `backup-files-${isoOfD(nowET())}.json`;

/* One page of a bucket's objects. Supabase's storage list is a POST, not a GET,
   and it returns `{ name, metadata: { size, mimetype }, updated_at }`. */
/* ONE PAGE, AT ONE PREFIX. Supabase's storage list is a POST, not a GET, and
   it returns `{ name, metadata: { size, mimetype }, updated_at }` for an object
   and `{ name, metadata: null }` for a folder.

   ⚠️⚠️ IT IS FOLDER-SCOPED, WHICH IS THE WHOLE BUG THIS PAIR EXISTS FOR. This
   function answers for `prefix` and nothing below it. WHERE TO GO NEXT IS
   `backupWalk.js`'S DECISION, deliberately, because that file can be executed
   by `checks/` and this one cannot. A backup that copied 19 of 595 files
   shipped green precisely because the walk lived in here. */
async function backupListPage(env, bucket, prefix, offset) {
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefix, limit: BACKUP_LIST_PAGE, offset }),
  });
  /* ⛔ A REFUSED LISTING THROWS. Same rule as the caller: it takes the whole
     job down rather than producing a manifest that quietly omits a folder. */
  if (!res.ok) throw new Error(`bucket listing refused: ${res.status} on ${bucket}/${prefix}`);
  return res.json();
}

/* Every object in the bucket, folders included. */
const backupListBucket = (env, bucket) =>
  walkBucket((prefix, offset) => backupListPage(env, bucket, prefix, offset), {
    pageSize: BACKUP_LIST_PAGE,
    maxFiles: BACKUP_MAX_FILES,
    label: bucket,
  });

/* Is this object already in R2, at the same size?
   ⚠️ A FAILED HEAD IS TREATED AS "NOT THERE", deliberately. The cost of being
   wrong that way is copying a file we already had; the cost of the other way is
   believing we have a file we do not. */
async function backupHasFile(env, key, size) {
  try {
    const head = await env.BACKUPS.head(key);
    return !!head && Number(head.size) === Number(size);
  } catch { return false; }
}

async function backupCopyFile(env, bucket, name) {
  const res = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${name.split("/").map(encodeURIComponent).join("/")}`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } },
  );
  if (!res.ok) throw new Error(`object read refused: ${res.status} on ${bucket}/${name}`);
  const body = await res.arrayBuffer();
  await env.BACKUPS.put(`files/${bucket}/${name}`, body, {
    httpMetadata: { contentType: res.headers.get("content-type") || "application/octet-stream" },
  });
  return body.byteLength;
}

async function runBackupFiles(env) {
  if (env && env.__QUIET) return { quiet: true, wouldWrite: backupFilesName() };
  if (!env || !env.BACKUPS) throw new Error("no BACKUPS bucket bound");  /* see runBackup */

  const startedAt = Date.now();
  const manifest = [];
  const perBucket = {};
  let copied = 0, skipped = 0, bytes = 0;

  for (const bucket of BACKUP_BUCKETS) {
    /* ⛔ NOT WRAPPED. A listing that fails takes the whole job down rather than
       producing a manifest that quietly omits a bucket. */
    const objects = await backupListBucket(env, bucket);
    perBucket[bucket] = { objects: objects.length, copied: 0, skipped: 0 };
    for (const o of objects) {
      const key = `files/${bucket}/${o.name}`;
      manifest.push({ bucket, name: o.name, size: o.size, updatedAt: o.updatedAt });
      if (await backupHasFile(env, key, o.size)) {
        skipped++; perBucket[bucket].skipped++;
        continue;
      }
      bytes += await backupCopyFile(env, bucket, o.name);
      copied++; perBucket[bucket].copied++;
    }
  }

  /* ⚠️ THE MANIFEST IS WRITTEN LAST, AFTER EVERY COPY HAS LANDED. Written
     first, a job that died halfway would leave a file claiming objects that are
     not in R2 — the same "looks complete and is not" failure the throw above
     exists to prevent. */
  const name = backupFilesName();
  await env.BACKUPS.put(name, JSON.stringify({
    store: STORE.fsr,
    takenAt: new Date().toISOString(),
    buckets: perBucket,
    copied, skipped, bytes,
    files: manifest,
  }), { httpMetadata: { contentType: "application/json" } });

  return { file: name, copied, skipped, files: manifest.length, bytes, buckets: perBucket, ms: Date.now() - startedAt };
}

/* ⚠️⚠️ THE STORE IS IN THE FILENAME, AND THAT IS NOT COSMETIC.

   The name was `backup-<date>.json` with nothing to say whose it was. Two
   stores in one Cloudflare account both run this at 3am and both write the
   SAME key to the SAME bucket — last writer wins, one store's nightly backup
   is silently destroyed, and BOTH jobs answer ok. Nobody finds out until
   restore day, which is the exact sentence this job was written to prevent.

   ⚠️ IT REACHES THAT STATE BY ACCIDENT, NOT BY CHOICE. `newstore.mjs` did not
   rewrite `bucket_name` in wrangler.toml, so a store generated today pointed
   at the origin's bucket without anybody deciding to share one. That is fixed
   there too — this is the belt to that pair of braces, because a shared bucket
   is a perfectly reasonable thing for somebody to set up on purpose one day.

   ⚠️ THE DATE IS THE STORE'S, NOT UTC. A job running at 3am ET is already
   tomorrow in UTC, so a UTC name would file every backup under the wrong day
   and overwrite the previous one on the same date.

   ⚠️ OLD FILES KEEP THEIR OLD NAMES and nothing reads them by name — they are
   restored by hand — so this changes where tonight's lands, never what is
   already there. */
const backupName = () => `backup-${STORE.fsr}-${isoOfD(nowET())}.json`;

async function runBackup(env) {
  /* ⚠️ A REHEARSAL WRITES NOTHING. Same rule every other sender in this file
     follows, and it matters more here: a quiet run that wrote the file would
     overwrite the night's real backup with a test. */
  if (env && env.__QUIET) return { quiet: true, wouldWrite: backupName() };
  /* ⚠️⚠️ THROWS, RATHER THAN RETURNING AN ERROR OBJECT. It used to `return
     { error: "no BACKUPS bucket bound" }`, and the dispatcher wraps whatever a
     job returns in `ok: true` — so a store with no bucket answered SUCCESS,
     noteJobRun stamped a good run, and the heartbeat moved. The dead-man check
     would then report the backup healthy at a store that has never once backed
     anything up. That is the exact shape this whole system keeps paying for: a
     failure that reports success. A missing bucket is a broken deployment, and
     a broken deployment must be loud. */
  if (!env || !env.BACKUPS) throw new Error("no BACKUPS bucket bound — the R2 binding is missing from wrangler.toml");

  const startedAt = Date.now();
  const data = {};
  const counts = {};
  for (const { table, order } of BACKUP_TABLES) {
    const rows = await backupReadTable(env, table, order);
    data[table] = rows;
    counts[table] = rows.length;
  }

  const name = backupName();
  const body = JSON.stringify({
    store: STORE.fsr,
    takenAt: new Date().toISOString(),
    counts,
    tables: data,
  });

  await env.BACKUPS.put(name, body, {
    httpMetadata: { contentType: "application/json" },
  });

  const total = Object.values(counts).reduce((n, v) => n + v, 0);

  /* ★★ AND THE FILES, IN THE SAME RUN. Matt, Aug 20 2026. One job, because a
     second cron entry is a second thing to set up and a second thing to notice
     has stopped — and this repo has already paid for a job with no entry.

     ⚠️⚠️ THE TABLES ARE WRITTEN FIRST AND ARE ALREADY SAFE BY THIS POINT. If
     the file half throws, the throw reaches the caller and the run is reported
     failed, which is correct — but the table backup for tonight is on disk
     rather than lost to an all-or-nothing job. Ordering, not error handling. */
  const files = await runBackupFiles(env);

  return {
    file: name, rows: total, counts, bytes: body.length,
    files, ms: Date.now() - startedAt,
  };
}

async function runBoilOutFry(env) {
  const now = nowET();
  const dow = now.getDay();
  const today = isoOfD(now);
  if (dow === 1) {
    await postToSlackChannel(env, BOIL_CHANNEL,
      `*Boil Out — Primary Fry*\nPlease boil out the *primary fry* before 11am today.\n\n<!channel>`);
    const p = await pushBoilOut(env, "Boil out the primary fry", "Before 11am today.");
    return { posted: "primary-fry", date: today, pushed: p };
  }
  if (dow === 2) {
    const weeks = boilDaysBetween(SECONDARY_FRY_ANCHOR, today) / 7;
    // Only on-cycle Tuesdays. Whole weeks apart AND an even number of them —
    // a Tuesday before the anchor gives a negative, which is correctly off-cycle
    // rather than wrapping round.
    const onCycle = Number.isInteger(weeks) && weeks >= 0 && weeks % 2 === 0;
    if (!onCycle) return { skipped: "off-cycle-tuesday", date: today, weeksFromAnchor: weeks };
    await postToSlackChannel(env, BOIL_CHANNEL,
      `*Boil Out — Secondary Fry*\nPlease boil out the *secondary fry* before 11am today.\n\n<!channel>`);
    const p = await pushBoilOut(env, "Boil out the secondary fry", "Before 11am today.");
    return { posted: "secondary-fry", date: today, weeksFromAnchor: weeks, pushed: p };
  }
  return { skipped: "not-a-fry-day", date: today, day: dow };
}

// 11am — henny, one unit a day through the month's first full week.
const HENNY_BY_DOW = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };
async function runBoilOutHenny(env) {
  const now = nowET();
  const dow = now.getDay();
  const today = isoOfD(now);
  const n = HENNY_BY_DOW[dow];
  if (!n) return { skipped: "weekend", date: today };
  if (!boilFirstFullWeek(now)) return { skipped: "not-first-full-week", date: today };
  await postToSlackChannel(env, BOIL_CHANNEL,
    `*Boil Out — Henny ${n}*\nClosing leaders: please complete the *Henny ${n}* boil out between 5 and close tonight.\n\n<!channel>`);
  // It already says "Closing leaders" — so tell the closing leaders, not the room.
  const p = await pushBoilOut(env, `Henny ${n} boil out`, "Between 5 and close tonight.", true);
  return { posted: `henny-${n}`, date: today, pushed: p };
}

// ═══════════════════════════════════════════════════════════════════
// JOB 1 — Daily Cleaning Sunday summary → Slack #guardian-of-the-brand
// ═══════════════════════════════════════════════════════════════════
const CLEAN_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CLEAN_FOH_DATA = {
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
const CLEAN_BOH_DATA = {
  Monday:    { tasks: ["Thaw 1", "Henny 1", "Oven 1", "Primary screens/tablets", "Shelving", "Fry freezer", "Fry hopper/chute", "Foil bag holders", "Fry vents", "Hoods exterior", "Hand sink", "Papertowel holder", "Drink station", "Trash can"] },
  Tuesday:   { tasks: ["Thaw 2", "Henny 2", "Flat top, sides, back", "Shelving", "Storage", "Fry hopper/chute", "Hood vents", "Hood exterior", "Fry freezer", "Soup station/cooling rack", "Hand sink", "Papertowel holder", "Trash can"] },
  Wednesday: { tasks: ["Thaw 3", "Oven 2", "Garland grills", "Henny hood vents", "Hood exterior", "Soup warmer/pots/table", "Merco unit", "Breading and secondary storage", "Electric towers"] },
  Thursday:  { tasks: ["Thaw 4", "Henny 3", "Main prep lowboy", "Biscuit lowboy", "Secondary salad lowboy", "Prep shelving", "Biscuit shelves", "Mixer", "Produce sink", "Dish shelving", "Prep screens/tablets", "Trash can"] },
  Friday:    { tasks: ["Thaw 5", "Henny 4", "Dish sink", "Under dish sink", "Dishwasher", "Dirty dish shelving", "Clean dish shelving", "Dish pit floor", "Mop sink", "Freezer", "Trash can", "Hall walls and floor", "Hallway vents"] },
  Saturday:  { tasks: ["Henny 5", "Breading table", "Milkwash cooler", "Thaw tops/fans", "Shelf above table", "Ipad", "Trash can"] },
};
const CLEAN_SHIFT_ORDER = ["AM", "MID", "PM"];
const CLEAN_DEFAULT_CFG = { added: {}, overrides: {}, removed: [] };

function cleanBuildTasks(house, dayKey, cfg) {
  const c = cfg || CLEAN_DEFAULT_CFG;
  const removed = c.removed || [];
  const added = c.added || {};
  const out = [];
  if (house === "FOH") {
    const shifts = CLEAN_FOH_DATA[dayKey].shifts;
    CLEAN_SHIFT_ORDER.forEach((shift) => {
      (shifts[shift] || []).forEach((name, i) => {
        const key = `${shift}#b${i}`;
        if (!removed.includes(key)) out.push({ key });
      });
      (added[shift] || []).forEach((a) => { if (!removed.includes(a.id)) out.push({ key: a.id }); });
    });
  } else {
    CLEAN_BOH_DATA[dayKey].tasks.forEach((_, i) => {
      const key = `b${i}`;
      if (!removed.includes(key)) out.push({ key });
    });
    (added.list || []).forEach((a) => { if (!removed.includes(a.id)) out.push({ key: a.id }); });
  }
  return out;
}

function cleanGetWeekKey(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}


/* ══ THE WEEKLY RECAPS, AS ANNOUNCEMENTS LEADERS MUST CONFIRM ═══════════════
   Matt, Aug 14 2026, asked which cron jobs could move into Announcements, then:
   "i want them as required read for leaders."

   ⚠️ THIS IS WHY THEY MOVE AND THE REMINDERS DO NOT. A recap is information a
   group should read. A reminder is a task for ONE person — an overdue
   evaluation names somebody, and putting that in a feed ~106 people read is a
   personnel record on a noticeboard. Recaps move; reminders stay DMs.

   ⚠️ requiresAck IS THE WHOLE POINT HERE, unlike the scoreboard, which is
   posted with no confirmation because nobody signs a scoreboard. These two are
   a wrap-up of work leaders own, so "who has actually read it" is the question
   worth answering — and it is the one thing Slack could never answer. */

/* Everyone on the roster whose TITLE is tier 2 or above. Mirrors
   `everyoneOnRoster` deliberately, including dropping terminated people from
   both the status field and the terminated set. */
async function leadersOnRoster(env) {
  const team = await sbGet(env, "gcfcr-hr-team-v1").catch(() => null);
  if (!Array.isArray(team)) return [];
  const gone = await terminatedIds(env);
  return team
    .filter((p) => p && p.id
      && String(p.status || "").toLowerCase() !== "terminated"
      && !gone.has(bareId(p.id))
      && hrTierOfTitle(p.role) >= 2)
    .map((p) => String(p.id));
}

/* ⚠️ SLACK MARKUP IS NOT PLAIN TEXT. These bodies were written for Slack and
   carry `*bold*` and `<!channel>`. Posted as-is, an announcement would show
   literal asterisks and, worse, the words "<!channel>" — which reads as a bug
   to every leader who opens it. */
function plainFromSlack(text) {
  return String(text == null ? "" : text)
    .replace(/<!channel>|<!here>/g, "")
    .replace(/\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ⚠️ ONE HELPER, NOT A COPY PER JOB. Two jobs post recaps today and more will;
   three copies of the author line and the roster read is design rule 8 waiting
   to happen, and the author line in particular is a rule-18 trap (see below).
   ⚠️ IT NEVER THROWS. The Slack post has already gone by the time this runs, so
   every failure is REPORTED in the return rather than raised — a recap that
   stopped reaching the team because an announcement could not be written would
   be a worse outcome than no announcement. Same stance as the scoreboard. */
async function postLeaderRecap(env, { title, body }) {
  try {
    const plain = plainFromSlack(body);
    if (!plain) return { posted: false, why: "nothing to say" };
    const targetIds = await leadersOnRoster(env);
    if (!targetIds.length) return { posted: false, why: "no leaders on the roster, so it would have reached nobody" };
    const ev = await writeAnnouncement(env, {
      title,
      body: plain,
      /* ⚠️⚠️ THE AUTHOR IS THE APP, AND IT MUST COME FROM `storeBrand`, NOT
         `STORE.appName`. The Worker never runs `applyStoreOverrides`, so
         `STORE.appName` is the DEPLOYED DEFAULT forever — it would compile,
         look dynamic, and print Gate City at exactly the store rule 18 exists
         to protect. This is the Worker's one live read of saved settings. */
      byId: "",
      byName: (await storeBrand(env).catch(() => null) || {}).appName || "The Hub",
      audience: { kind: "leaders" },
      targetIds,
      requiresAck: true,
    });
    if (!ev) return { posted: false, why: "announcements unreadable, so nothing was written" };
    return { posted: true, to: targetIds.length };
  } catch (e) {
    return { posted: false, why: String(e).slice(0, 80) };
  }
}

async function runCleaningSummary(env) {
  /* ★ REPORTS THE WEEK THAT JUST FINISHED, NOT THE ONE STARTING.
     Matt, Aug 2 2026: move the weekly wrap-ups off Sunday to Monday. This one
     could not simply be rescheduled — cleanGetWeekKey is ISO week numbering,
     where MONDAY starts a new week, so running it Monday would have reported
     the brand-new empty week and printed 0 of N for everything, every week.
     Anchoring on "three days ago" lands inside the previous week from anywhere
     Monday, and still lands in the CURRENT week if it is ever run Thu-Sat, so a
     manual mid-week run behaves the way someone would expect.
     ⚠️ Do NOT "simplify" this to today's date. That is the bug it exists to
     prevent, and it fails silently — a report of zeros looks like a team that
     did no cleaning, not like a broken window. */
  const anchor = nowET();
  anchor.setDate(anchor.getDate() - 3);
  const weekKey = cleanGetWeekKey(anchor);
  const lines = [];
  let grandDone = 0, grandTotal = 0;

  /* ⛔⛔ THESE READS RUN TOGETHER, AND THEY USED TO RUN ONE AFTER ANOTHER.
     Two houses times six days, twice over — a config read and a signature read
     each — is **24 sequential round trips to Supabase**, every one waiting on
     the one before it. Then this function still has a channel post, a DM and a
     push to do. That is what made this the heaviest job in the fleet and the
     one the origin store watched fail on a 30-second timeout.
     ⚠️ NOTHING HERE DEPENDS ON ANYTHING ELSE HERE, so waiting between them
     bought nothing. The OUTPUT ORDER is unchanged on purpose — only the
     fetching is parallel. A reordered report would look like a different bug.

     🐛🐛 AND A REFUSED READ USED TO REPORT AS "NOBODY SIGNED OFF", TO A REAL
     PERSON. `sbGet` answers null for "absent" and for "Supabase said no"
     alike, and `|| {}` turned both into an empty signature sheet — so one
     dropped read printed `FOH Monday: 0/12 signed off`, counted twelve misses
     into the store total, and DMed the cleaning owner that her week was
     outstanding when it may have been finished.
     ⇒ `sbGetStrict` throws on a refusal and still answers null for a key that
     genuinely is not there. Each read is caught on its own, so one bad key
     cannot lose the other twenty-three.
     ⚠️ AN UNREADABLE DAY IS LEFT OUT OF THE TOTALS ENTIRELY rather than counted
     as zero or as complete. Both of those are claims we cannot make. It is
     named in the report instead, and the percentage stays true for the days we
     could actually read. */
  const slots = [];
  for (const house of ["FOH", "BOH"]) {
    for (const day of CLEAN_DAYS) slots.push({ house, day });
  }
  const readOr = (pr) => pr.then((v) => ({ ok: true, v })).catch(() => ({ ok: false, v: null }));
  const fetched = await Promise.all(slots.flatMap(({ house, day }) => [
    readOr(sbGetStrict(env, `cleaning-cfg:${house}:${day}`)),
    readOr(sbGetStrict(env, `cleaning:${weekKey}:${house}:${day}`)),
  ]));

  const unreadable = [];
  slots.forEach(({ house, day }, i) => {
    const c = fetched[i * 2];
    const g = fetched[i * 2 + 1];
    if (!c.ok || !g.ok) { unreadable.push(`${house} ${day}`); return; }
    const cfg = c.v || CLEAN_DEFAULT_CFG;
    const sigs = g.v || {};
    const tasks = cleanBuildTasks(house, day, cfg);
    const field = house === "FOH" ? "cleaned" : "checked";
    const done = tasks.filter((t) => (sigs[t.key]?.[field] || "").trim()).length;
    grandDone += done; grandTotal += tasks.length;
    if (tasks.length > 0 && done < tasks.length) {
      lines.push(`• ${house} ${day}: ${done}/${tasks.length} signed off`);
    }
  });

  const pct = grandTotal ? Math.round((grandDone / grandTotal) * 100) : 100;
  /* ⚠️ "Everything is signed off" IS A CLAIM ABOUT THE WHOLE WEEK, so a day we
     could not read has to take it away. Saying it while a read was refused is
     the same lie as counting that day as zero, pointing the other direction. */
  const missed = unreadable.length
    ? `⚠️ Could not read ${unreadable.length} of ${slots.length} days, so they are NOT counted above: ${unreadable.join(", ")}.`
    : "";
  const body =
    `*Daily Cleaning — week ${weekKey}*\n` +
    `${grandDone}/${grandTotal} tasks signed off (${pct}%)\n\n` +
    (lines.length ? `Incomplete:\n${lines.join("\n")}` : (missed ? "" : "Everything is signed off. ✅")) +
    (missed ? `${lines.length ? "\n\n" : ""}${missed}` : "");

  /* ★ THIS SUMMARY NOW HAS AN OWNER (Matt, Jul 28 2026: "point it at her").
     Cleaning belongs to Lizy, so the person accountable for it gets told
     directly instead of hoping she reads a channel.

     ⚠️⚠️ THE FULL NAME IS LOAD-BEARING. There are TWO Lizbeth Gonzalezes:
     **Lizbeth** is the Assistant Director who owns cleaning, and
     **Lizbeth Gonzalez** is a different person on the trainer roster. Matt had
     to correct me on this. `slackIdForName` matches on first name + last
     initial, so "Lizbeth Gonzalez" is AMBIGUOUS across the two and correctly
     resolves to NOBODY — pointing this at the short name would have silently
     reached no one, or worse, the wrong person. Third such collision on this
     roster after Monica/Monica and Ashley/Ashley.
     ⚠️ IF SHE EVER STOPS RECEIVING THIS, check this constant before the code. */
  const CLEANING_OWNER = (await notifyName(env, "cleaning")) || "";

  /* ⚠️ `<!channel>` REMOVED. It pinged all 35 people in the channel every week
     for a report that is now one person's job. The post stays as the record —
     push and DM only reach people who have enabled them — but it no longer
     interrupts everybody to say a task is outstanding. */
  await postToSlackChannel(env, CHANNELS.brand, body);

  /* ⚠️ EACH DELIVERY IN ITS OWN TRY. A failed DM must not stop the push, and
     neither must stop the channel post above, which already happened. */
  const out = { pct, done: grandDone, total: grandTotal, dm: false, push: 0 };
  let uid = null;
  try { uid = await slackIdForName(env, CLEANING_OWNER); } catch { /* named below */ }
  if (uid) {
    try { await sendSlackDM(env, uid, body); out.dm = true; } catch { /* out.dm stays false — a refused DM now actually reaches here */ }
  }
  try {
    const r = await pushToPerson(env, CLEANING_OWNER, {
      title: `Cleaning list — ${pct}% signed off`,
      body: lines.length ? `${grandTotal - grandDone} task${grandTotal - grandDone === 1 ? "" : "s"} still outstanding this week.` : "Everything is signed off this week.",
      url: "/",
    });
    out.push = Number((r && r.sent) || 0);
  } catch { /* out.push stays 0 */ }

  /* Named, not counted — "owner unreachable" is the one result that needs to be
     visible in the job history rather than inferred from a zero. */
  if (!out.dm && !out.push) out.ownerUnreached = CLEANING_OWNER;

  /* ★ AND AS AN ANNOUNCEMENT LEADERS MUST CONFIRM (Matt, Aug 14 2026: "i want
     them as required read for leaders").
     ⚠️ THE DM ABOVE IS UNTOUCHED. The owner of cleaning still gets told
     directly, because a recap in a feed is not the same as somebody being
     handed their own job — and this post is best-effort, so it can never cost
     her that DM.
     ⚠️ BEFORE THE RETURN, AND ITS RESULT IS IN THE RETURN. A first attempt at
     this landed AFTER a `return` in a date helper further up the file, where it
     compiled, ran never, and reported nothing. The run has to be able to say
     whether the announcement was written. */
  out.hub = await postLeaderRecap(env, { title: `Daily Cleaning — week ${weekKey}`, body });
  return out;
}

// ═══════════════════════════════════════════════════════════════════
// JOB 2 — Waste/Donations/Inventory Sunday report → Slack #inventory-management
// ═══════════════════════════════════════════════════════════════════
const WASTE_STORAGE = {
  data:   "gcfcr-waste-v4",
  custom: "gcfcr-waste-custom-v4",
  prices: "gcfcr-waste-prices-v4",
  don:    "gcfcr-waste-don-v4",
  removed:"gcfcr-waste-removed-v4",
};


function fmtWt(oz) {
  const L = Math.floor(oz / 16);
  const O = +(oz % 16).toFixed(oz % 1 ? 1 : 0);
  return `${L}lb ${O}oz`;
}
function fmtVol(qt) {
  const G = Math.floor(qt / 4);
  const Q = +(qt % 4).toFixed(qt % 1 ? 1 : 0);
  return `${G}gal ${Q}qt`;
}
function shiftDayStr(iso, days) {
  const x = new Date(iso + "T12:00:00");
  x.setDate(x.getDate() + days);
  return isoOfD(x);
}

/* ═══ WHICH WASTE PERIODS LOGGED YESTERDAY ═══════════════════════════════
   Matt, Aug 7 2026: "i also want a slack dm daily to know what day-parts are
   and aren't inputting waste from the gatecityhub."

   ⚠️ YESTERDAY, NOT TODAY. Today's PM periods have not happened yet, so
   checking today would report every afternoon shift as delinquent every
   morning. Same last-closed-day convention the labor and AHA rows use.

   ⚠️ SUNDAY IS SKIPPED AND MONDAY LOOKS AT SATURDAY. The store is closed
   Sunday, so there is no waste to log and a Monday DM about Sunday would be
   wrong every week.

   ⚠️ SILENT WHEN THE WHOLE DAY IS EMPTY. wasteCheckMessage returns null there
   on purpose — four blanks is far more likely to mean a closed day or an
   unimported one than four shifts all forgetting, and a job that cries wolf
   gets muted. Partial days are the real signal and those always send.

   ⚠️ DM ONLY, never a channel. It names shifts that missed something. */
/* ═══ SUNDAY: WHAT TO CUT NEXT WEEK, DAY BY DAY ═════════════════════════
   Matt, Aug 7 2026: "I'd like a Sunday report dm'd to me with a daily summary
   of what to cut for each daypart and area so I can make the schedule cuts",
   and on how much detail: "i want to know what to cut exactly where so when im
   cutting im not guessing."

   ⚠️ A DM ON A SUNDAY IS FINE — the no-Sunday rule is about CHANNEL posts,
   because the store is shut and nobody reads a channel on a closed day. This
   is the one day Matt is actually building next week's schedule.

   ⚠️ IT LOOKS AT THE MONDAY AFTER, not the week just gone. Sunday is the last
   day of the board week here, so "next week" starts tomorrow.

   ⚠️ SILENT WHEN NOTHING IS ROSTERED. weekCutMessage returns null then, and a
   message saying "nothing to cut" on a week nobody has built yet would be
   worse than saying nothing. */
async function runWeekCutReport(env, forced = false) {
  const now = nowET();
  /* ⚠️ `forced` COMES FROM &force=1 ON THE URL, same as every other job that
     has a day guard. Without it there is no way to read the message before
     Sunday, which makes the whole thing untestable until the moment it
     matters. Paired with &quiet=1 it prints instead of sending.
     ⚠️ NO EM DASH IN THIS STRING. Matt reads these skips raw out of Safari and
     the response is not tagged UTF-8, so an em dash came back as "a€"". */
  if (now.getDay() !== 0 && !forced) {
    // Not Sunday. Answer ok so cron-job.org does not retry and mail Matt.
    return { skipped: "Sunday job, nothing to do today. Add &force=1 to run it now." };
  }
  /* ⚠️ THE NEXT MONDAY, NOT "TOMORROW". On a real Sunday those are the same
     day, so the scheduled run is unchanged. They are NOT the same on a forced
     test: run on a Friday, "tomorrow" is Saturday, and the report started from
     the wrong end of the week and returned 5 days instead of 6 (Matt's first
     forced run, Aug 7 2026, came back startIso 2026-08-08). A test flag that
     shows you a different week than the real job is worse than no test flag. */
  const daysToMonday = ((8 - now.getDay()) % 7) || 7;
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToMonday);
  const startIso = isoOfD(mon);
  const ym = `${mon.getFullYear()}-${pad2(mon.getMonth() + 1)}`;
  const get = (k) => sbGet(env, k);
  const plan = await weekCutPlan(ym, startIso, 6, get);
  if (!plan) return { skipped: "labor basis unreadable", startIso };
  const expected = [];
  for (let i = 0; i < 6; i += 1) {
    const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
    if (d.getDay() !== 0) expected.push(isoOfD(d));
  }
  const text = weekCutMessage(plan, expected);
  if (!text) return { skipped: "no day rostered yet for that week", startIso };
  /* ⚠️ THE ONE DM IN THIS FILE WITH NEITHER AN `if (uid)` NOR A try AROUND IT,
     which made it the only job the directory guard could not rescue. With no
     Slack, notifyTarget answers null, sendSlackDM throws on the refusal, and
     this job died — reporting a failure at a store that had simply chosen push.
     ⚠️ REPORTED, NOT SWALLOWED. `notified` goes in the return so the run log
     says plainly whether the owner heard, rather than a bare success implying
     it. Every other DM job in this file already records its outcome this way;
     this one just never had anywhere to put it. */
  let notified = false;
  try {
    await sendSlackDM(env, await notifyTarget(env, "owner"), text);
    notified = true;
  } catch (e) {
    console.error("week cut report -> owner failed:", e);
  }
  return { startIso, days: plan.days.length, chars: text.length, notified };
}

async function runWasteInputCheck(env) {
  const now = nowET();
  if (now.getDay() === 0) return { skipped: "closed Sunday" };
  // Yesterday, and on Monday that means Saturday.
  const back = now.getDay() === 1 ? 2 : 1;
  const target = shiftDayStr(isoOfD(now), -back);
  const data = (await sbGet(env, WASTE_STORAGE.data)) || {};
  const status = wasteDayStatus(data, target);
  const label = new Date(`${target}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric",
  });
  const text = wasteCheckMessage(status, label);
  if (!text) {
    return { skipped: "nothing logged all day, closed, or not imported", date: target };
  }
  /* ★ THE TEAM SEES THIS NOW, NOT JUST THE OWNER (Matt, Aug 8 2026: "I want the
     team to see this", then "inventory" when asked which channel).
     ⚠️ #inventory-management RATHER THAN THE TEAM CHANNEL, AND THAT WAS THE
     DECISION. This report names a MISS — "BOH AM, nothing logged". Read by the
     handful of people who own waste it is a nudge. Read by all 106 it is a
     callout, and everybody who DID log gets lumped in with everybody who did not.
     Accountability belongs with the function.
     ⚠️ THE OWNER DM IS GONE, not kept alongside. Matt is in that channel, so
     keeping both would have pinged him twice for one fact. */
  await postToSlackChannel(env, CHANNELS.inventory, text);
  return { date: target, logged: status.logged.length, missing: status.missing, to: CHANNELS.inventory };
}

async function runWasteReport(env) {
  const custom = (await sbGet(env, WASTE_STORAGE.custom)) || [];
  const prices = (await sbGet(env, WASTE_STORAGE.prices)) || {};
  const removed = (await sbGet(env, WASTE_STORAGE.removed)) || [];
  const data = (await sbGet(env, WASTE_STORAGE.data)) || {};
  const don = (await sbGet(env, WASTE_STORAGE.don)) || {};
  const menu = [...WASTE_MENU.filter((m) => !removed.includes(m.id)), ...custom];
  const priceOf = (id) => {
    const m = menu.find((x) => x.id === id);
    if (!m) return 0;
    return prices[id] != null ? prices[id] : m.price;
  };
  const nameOf = (id) => (menu.find((x) => x.id === id) || {}).name || id;

  const today = isoOfD(nowET());
  const end = shiftDayStr(today, -1);
  const start = shiftDayStr(end, -6);

  const itemTotals = {};
  let weekTotal = 0, weekItems = 0;
  for (let d = start; d <= end; d = shiftDayStr(d, 1)) {
    const dayData = data[d] || {};
    for (const p of WASTE_PERIODS) {
      Object.entries(dayData[p] || {}).forEach(([id, qty]) => {
        const v = priceOf(id) * qty;
        weekTotal += v; weekItems += qty;
        if (!itemTotals[id]) itemTotals[id] = { qty: 0, value: 0 };
        itemTotals[id].qty += qty; itemTotals[id].value += v;
      });
    }
    if (d === end) break;
  }
  const topWaste = Object.entries(itemTotals)
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 12)
    .map(([id, t]) => `• ${nameOf(id)} — ${money(t.value)} (×${t.qty})`);

  const donTotals = {};
  for (let d = start; d <= end; d = shiftDayStr(d, 1)) {
    const dayDon = don[d] || {};
    Object.entries(dayDon).forEach(([id, v]) => {
      if (!donTotals[id]) donTotals[id] = { oz: 0, ea: 0, qt: 0 };
      if (v.u === "wt") donTotals[id].oz += (Number(v.lb) || 0) * 16 + (Number(v.oz) || 0);
      else if (v.u === "vol") donTotals[id].qt += (Number(v.gal) || 0) * 4 + (Number(v.qt) || 0);
      else donTotals[id].ea += Number(v.ea) || 0;
    });
    if (d === end) break;
  }
  const donLines = Object.entries(donTotals)
    .filter(([, t]) => t.oz > 0 || t.ea > 0 || t.qt > 0)
    .map(([id, t]) => `• ${nameOf(id)} — ${[t.oz > 0 ? fmtWt(t.oz) : "", t.qt > 0 ? fmtVol(t.qt) : "", t.ea > 0 ? `${t.ea} ea` : ""].filter(Boolean).join(" · ")}`);

  const text =
    `*Weekly Waste & Donations Report* — ${start} to ${end}\n` +
    `Total waste: ${money(weekTotal)} (${weekItems} items)\n\n` +
    (topWaste.length ? `Top waste items:\n${topWaste.join("\n")}` : "No waste logged this week.") +
    `\n\n*Donations:*\n${donLines.length ? donLines.join("\n") : "None logged this week."}` +
    `\n\n<!channel>`;

  await postToSlackChannel(env, CHANNELS.inventory, text);

  /* ★ AND AS AN ANNOUNCEMENT LEADERS MUST CONFIRM. Same reasoning as the
     cleaning summary directly above: the channel post is untouched, this is in
     addition, and it is best-effort so it can never cost the Slack post.
     ⚠️ `plainFromSlack` INSIDE THE HELPER IS DOING REAL WORK HERE. This body
     carries `*bold*` AND a literal `<!channel>`; posted raw, every leader would
     open an announcement showing asterisks and the words "<!channel>", which
     reads as a bug rather than a report. */
  return await postLeaderRecap(env, { title: `Weekly Waste & Donations — ${start} to ${end}`, body: text });
}

// ═══════════════════════════════════════════════════════════════════
// JOB 3 — Mon/Thu change fund order calc → Slack #operational-success
// ═══════════════════════════════════════════════════════════════════
const AUDIT_KEY = "gcfcr-cashaudit-safe-entries";
const SHIFT_ORDER_MAP = { AM: 0, PM: 1 };
const sortKeyOf = (e) => `${e.date}-${SHIFT_ORDER_MAP[e.shift] ?? 0}`;

function orderCalcFor(dayName, entry) {
  const isMonday = dayName === "Monday";
  const par5 = isMonday ? 1200 : 1500;
  const par1 = isMonday ? 1000 : 1200;
  const have5 = Number(entry.d5) || 0;
  const have1 = Number(entry.d1) || 0;
  const haveQ = Number(entry.q) || 0;
  const haveD = Number(entry.dime) || 0;
  const haveN = Number(entry.n) || 0;

  const lines = [];
  const need5 = Math.max(0, par5 - have5);
  const need1 = Math.max(0, par1 - have1);
  if (need5 > 0) lines.push(`• $5 bills: order ${money(need5)} (on hand ${money(have5)}, par ${money(par5)})`);
  if (need1 > 0) lines.push(`• $1 bills: order ${money(need1)} (on hand ${money(have1)}, par ${money(par1)})`);
  if (haveQ <= 250) lines.push(`• Quarters: order ${money(Math.max(0, 500 - haveQ))} — a box (on hand ${money(haveQ)}, reorder at ≤$250)`);
  if (haveD <= 100) lines.push(`• Dimes: order ${money(Math.max(0, 250 - haveD))} — a box (on hand ${money(haveD)}, reorder at ≤$100)`);
  if (haveN <= 20)  lines.push(`• Nickels: order ${money(Math.max(0, 100 - haveN))} — a box (on hand ${money(haveN)}, reorder at ≤$20)`);
  return lines;
}

async function runAuditOrderCalc(env) {
  const entries = (await sbGet(env, AUDIT_KEY)) || [];
  if (!entries.length) {
    await postToSlackChannel(env, CHANNELS.opsSuccess, "*Change Fund Order* — no audit entries on file yet, nothing to calculate.");
    return;
  }
  /* ⚠️ A SAFE COUNT DATED IN THE FUTURE IS NOT A COUNT (Aug 9 2026 sweep,
     finding 15). This job picks "last shift on file" by sorting on `e.date`,
     which is a string the WRITER supplies — and /api/kv-set still accepts an
     untokened write for this key, so anyone can add a row. Dating it tomorrow
     puts it at the top, and this job then turns it into a real instruction: a
     maximum change-fund order posted to #operational-success and DM'd to
     whoever holds the Cash Audit seat, or "everything's at or above par" so the
     store runs the week short of change.
     ⚠️ THIS DOES NOT CLOSE THE WRITE DOOR, AND MUST NOT BE READ AS DOING SO.
     The key cannot join the token gate yet: the live anonymous-writer census
     records 15 real writes to it, so gating it today would refuse genuine safe
     counts from any leader whose 12-hour session has quietly lapsed. That is
     the door the auth work has to close first, in order. What this does is stop
     the job ACTING on a row that cannot be real.
     ⚠️ DROPPED ROWS ARE REPORTED, NEVER SILENT. A future-dated count is either
     tampering or a typo, and both are worth a human seeing. */
  const todayIso = isoOfD(nowET());
  const dated = entries.filter((e) => e && typeof e.date === "string" && e.date);
  const future = dated.filter((e) => e.date > todayIso);
  const usable = dated.filter((e) => e.date <= todayIso);
  if (!usable.length) {
    await postToSlackChannel(env, CHANNELS.opsSuccess,
      `*Change Fund Order* — nothing usable on file.` +
      (future.length ? ` ${future.length} entr${future.length === 1 ? "y is" : "ies are"} dated in the future and were ignored. Check the Cash Audit ledger.` : ""));
    return;
  }
  const sorted = [...usable].sort((a, b) => (sortKeyOf(a) > sortKeyOf(b) ? -1 : 1));
  const last = sorted[0];
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long", timeZone: STORE_TZ });
  const lines = orderCalcFor(dayName, last);

  const text =
    `*Change Fund Order* — based on ${last.date} ${last.shift} (last shift on file)\n\n` +
    (lines.length ? lines.join("\n") : "Everything's at or above par — no order needed today.") +
    (future.length
      ? `\n\n⚠️ ${future.length} entr${future.length === 1 ? "y" : "ies"} dated in the future ${future.length === 1 ? "was" : "were"} ignored. A count cannot be dated ahead — check the Cash Audit ledger.`
      : "");

  /* ⚠️ NO @channel PING HERE — DELIBERATE (Jul 28 2026).
     This fires at 4am and used to ping all 35 members of #operational-success.
     ONE person places the change order. Matt's rule: "eliminate noise in slack
     and send directly to the people on the accountability chart."
     The channel post STAYS as the shared record — it is the audit trail and
     the fallback if the DM below fails to resolve — it just stops being an
     alarm on 35 phones before dawn. */
  await postToSlackChannel(env, CHANNELS.opsSuccess, text);

  // …and the person who actually owns it gets it directly.
  try {
    /* ⚠️ seatById from orgSeats.js, NOT the "org:seats" KV key. That key is
       the superseded copy the seat module replaced (see its own header) —
       reading it meant a seat change in the repo never moved this DM, so a
       new cash-audit holder would sleep through it while the old one kept
       getting 4am messages. Same source recipientFor already uses. */
    const seat = seatById("cash-audit");
    if (seat && seat.holder) {
      const uid = await slackIdForName(env, seat.holder);
      if (uid) await sendSlack(env, uid, `${text}\n\n_You're getting this because you hold the Cash Audit seat._`);
    }
  } catch { /* the channel post above already carries it — never fail the job for a DM */ }
}

// ═══════════════════════════════════════════════════════════════════
// JOB 4 — Food Safety daily reminder → Slack #guardian-of-the-brand
// ═══════════════════════════════════════════════════════════════════
/* ── THE HR ROSTER, SERVER-SIDE ─────────────────────────────────────
   HR_ROSTER_IDS below is a THIRD copy of the roster — the frontend has
   RAW_TEAM in HRConsole.jsx, Team Documentation has SEED_TEAM, and this is the
   Worker's. That was already true; what changed on July 17 is that HR Console
   can now ADD people (gcfcr-hr-added-v1), so a hardcoded list is no longer the
   whole team. HRConsole exports loadHRTeam() for the browser; the Worker can't
   import it (different runtime), so hrRosterIds() composes the same thing from
   the same two sources.

   ⚠️ IF YOU EVER READ HR_ROSTER_IDS DIRECTLY, every count you produce silently
   under-reports by exactly the number of people hired since the Hub went up —
   and it under-reports QUIETLY, in a Slack message nobody cross-checks. Always
   go through hrRosterIds(env).

   The old note here said HRConsole ids ("1".."109") and TeamDocs ids
   ("tm1".."tm109") are two schemes for the same people, and that evals-due came
   from TeamDocs' roster. That second half is no longer true — see
   buildTodaysTodos(). Evals now come from HR Console, which is the only place
   they live. */
const HR_ROSTER_IDS = [
  "1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20",
  "21","22","23","26","27","28","29","30","31","32","33","34","35","36","37","38","40","41",
  "42","43","44","45","46","47","48","49","50","51","52","53","54","55","56","57","58","59",
  "60","61","62","63","64","65","66","67","68","69","70","71","72","73","74","75","76","77",
  "78","79","80","81","82","83","84","85","86","87","88","89","90","91","92","93","94","95",
  "96","97","98","99","100","101","102","103","104","105","106","107","108","109",
];
const HR_ADDED_KEY = "gcfcr-hr-added-v1";
/* Announcements. One row per announcement, targets resolved and STORED at send
   time — see announcements.js for why they are never recomputed on read. */
const ANNOUNCE_KEY = "gcfcr-announcements-v1";
/* Per-store IPO quarter plans. Absent means "this store has authored none yet",
   which correctly falls back to the built-in table rather than to nothing. */
const IPO_PLANS_KEY = "gcfcr-ipo-plans-v1";

/* ★ THE STORE'S OWN SETTINGS (step 3, Aug 11 2026). Absent means "this store
   has changed nothing", which correctly falls back to the code defaults in
   storeConfig.js rather than to an empty Hub.
   ⚠️ NOT ON THE SUPABASE DENY LIST, DELIBERATELY, AND CHECKED RATHER THAN
   ASSUMED. Everything in this record — the store name, its goals, its channel
   NAMES, its feature switches — already ships inside storeConfig.js, which is
   downloadable by anyone with no account. Denying it would buy nothing and
   would break the boot read every signed-in person needs. The WRITE is what is
   gated, and it is gated at tier 3.
   ⚠️ A PRIVATE SLACK CHANNEL ID MUST NEVER BE STORED HERE for the same reason
   it is not in storeConfig.js: this record is readable by every signed-in
   person, and a private channel id is credential-shaped. */
const STORE_CONFIG_KEY = "gcfcr-store-config-v1";

/* ═══ THE STORE'S NAME, FOR THE TWO FILES THAT SHIP BEFORE JAVASCRIPT ══════
   `index.html` and `manifest.webmanifest` are static. They are served before
   a line of the app runs, so they cannot reach storeCfg the way all nineteen
   masthead sites do — they carry whatever name was baked in at build time.
   That is what left "Gate City" in the browser tab and "Gate City Hub" under
   the icon at a second store, in an app whose every other surface had already
   read that store's own name correctly.

   ⚠️ IT READS THE SAVED SETTING, NOT `STORE.*`. `applyStoreOverrides` runs in
   the BROWSER at boot; nothing calls it in the Worker, so `LIVE` here is
   always the DEPLOYED DEFAULT. A clone types its identity into Store Settings
   and never touches storeConfig.js, so `STORE.appName` would print Gate City
   at exactly the store this exists to fix. The code default is still the
   fallback, for a store that has genuinely saved nothing.

   ⚠️ CACHED, AND THE CACHE IS THE POINT. This runs on every shell load, and
   index.html is the most load-bearing document in the app — it names the
   hashed bundles. It had NO Supabase dependency at all before this change.
   The cache holds that to about one read per isolate per five minutes, the
   timeout stops a slow Supabase from holding a page load, and every failure
   path serves the deployed default rather than nothing. A store's name
   changes about once in its lifetime, so five minutes stale costs nobody
   anything; a hung shell costs all ~106 people. */
let brandCache = null;                  // { until, appName, storeName, legalName }
const BRAND_TTL_OK_MS = 5 * 60 * 1000;  // a clean read, absent record included
const BRAND_TTL_ERR_MS = 30 * 1000;     // refused or slow: retry soon, but not every load
const BRAND_TIMEOUT_MS = 2000;

/* Only a non-empty string wins. A store that saved an empty identity.name
   falls back to the default rather than blanking the browser tab. */
const brandStr = (v, dflt) => (typeof v === "string" && v.trim() ? v.trim() : dflt);

async function storeBrand(env) {
  const now = Date.now();
  if (brandCache && now < brandCache.until) return brandCache;
  /* ⚠️ `programName` RIDES HERE RATHER THAN BEING READ SEPARATELY. The browser
     has `programLabel()` in storeConfig.js, but that reads `LIVE`, which only
     exists after `applyStoreOverrides` runs — and that never runs in the Worker.
     This function is already the Worker's one live read of a store's saved
     settings, so the fifth field costs one line here instead of a second
     mechanism that would drift from the first (design rule 8). */
  let appName = STORE.appName, storeName = STORE.name, legalName = STORE.legalName,
      fsr = STORE.fsr, programName = STORE_CONFIG.teamSite.programName,
      /* ⚠️ THE SIXTH FIELD, AND IT RIDES HERE FOR THE REASON THE FIFTH DOES.
         A reply-to is a per-store mailbox typed into Store Settings, and the
         Worker has exactly one live read of those — this function. Reading
         `STORE.identity.replyToEmail` at a send site would compile, look
         dynamic, and return the DEPLOYED DEFAULT forever, because
         applyStoreOverrides never runs in the Worker. */
      replyTo = brandStr(STORE_CONFIG.identity && STORE_CONFIG.identity.replyToEmail, ""),
      ttl = BRAND_TTL_OK_MS;
  try {
    /* sbGetStrict, not sbGet: sbGet answers null for "absent" and "Supabase
       refused" alike, and those two want different cache lifetimes. Absent is
       a real answer worth holding for five minutes; refused is worth retrying
       in thirty seconds. */
    const rec = await Promise.race([
      sbGetStrict(env, STORE_CONFIG_KEY),
      new Promise((_, rej) => setTimeout(() => rej(new Error("brand read timed out")), BRAND_TIMEOUT_MS)),
    ]);
    const s = rec && typeof rec === "object" && !Array.isArray(rec) ? rec.settings : null;
    if (s && typeof s === "object" && !Array.isArray(s)) {
      appName = brandStr(s.branding && s.branding.appName, appName);
      storeName = brandStr(s.identity && s.identity.name, storeName);
      legalName = brandStr(s.identity && s.identity.legalName, legalName);
      fsr = brandStr(s.identity && s.identity.fsr, fsr);
      programName = brandStr(s.teamSite && s.teamSite.programName, programName);
      replyTo = brandStr(s.identity && s.identity.replyToEmail, replyTo);
    }
  } catch {
    ttl = BRAND_TTL_ERR_MS;
  }
  brandCache = { until: now + ttl, appName, storeName, legalName, fsr, programName, replyTo };
  return brandCache;
}

/* The SPA shell, told apart from every other HTML document this Worker
   serves. `public/` holds eight fixed-name pages — the demo deck, the film,
   six training pages — and each has its own <title>. `id="root"` is in the
   shell and nothing else, checked across all nine files. */
const isAppShell = (html) => html.includes('id="root"');

/* A store name is typed into a settings form by a director, so it is escaped
   like any other authored value before it goes into markup. */
const brandEsc = (s) => String(s)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

/* ⚠️ THE PAGES WHERE A BARE "Gate City" IS THE STORE RATHER THAN PROSE.
   The demo deck and the film are about one store from top to bottom, so every
   mention of the name on them is that store's name: all three forms are
   substituted, and so is the store number printed beside it.

   Everywhere else a bare "Gate City" is a sentence about where the Hub came
   from ("Writes nothing to Gate City") and is left exactly as it is.

   ⚠️ WHAT THIS STILL CANNOT FIX. Matt asked for the deck and the film on
   12 Aug 2026, having been told they carry Gate City's own history. The FSR
   number travels with the name so the page can never print one store's name
   over another's number, but the deck's CLAIM — that this store ran on
   spreadsheets, Google Docs, paper checklists and Slack before the Hub — is
   still Gate City's story wearing whatever name is served. That is an
   editorial decision and it is his, not something substitution can resolve. */
const FULL_REBRAND = new Set(["/gate-city-demo", "/gate-city-film"]);

/* ⚠️ THE `.html` IS NOT THERE BY THE TIME THE WORKER SEES IT. Cloudflare's
   asset layer normalises `/gate-city-demo.html` to `/gate-city-demo` before
   this code runs, so a page list keyed on the real filenames matched nothing
   and those pages took the wrong branch. The guard read correctly and did
   nothing, which is only visible by asking the running Worker what path it
   actually got. Trailing slashes are folded for the same reason: the same
   document must not be reachable under a key that misses. */
const rebrandKey = (pathname) => pathname.replace(/\.html$/i, "").replace(/\/+$/, "") || "/";

/* Escape for the inside of a JavaScript string literal. The training pages
   carry their narration as JSON inside <script>, and one value cannot be
   escaped the same way in both places: an HTML entity renders literally as
   "&quot;" inside a script, and a bare quote ends the string early. `<` goes
   to < so a name containing "</script>" cannot break out of the block.
   ⚠️ NOT PARANOIA. checkStoreSettings only requires the store name to be a
   non-empty string, so "Nick's & Sons <flagship>" is a legal thing for a
   director to type into Store Settings and save. */
const brandJs = (s) => JSON.stringify(String(s)).slice(1, -1).replace(/</g, "\\u003c");

/* Put this store's name into a document that was authored with Gate City's.
   Three different things are called "Gate City" in these files and only two
   of them are the label:
     "Gate City Hub"          the app's name          -> appName
     "Gate City Chick-fil-A"  the store, formally     -> legalName
     "Gate City"              alone, and it is PROSE  -> left exactly as it is
   That last rule is what keeps the operator training honest. It says "Nothing
   in it writes to Gate City" and "It was all built for Gate City", which are
   statements about where the Hub came from — true at every store that runs it,
   and false the moment they are renamed. The single exception is the <title>,
   where a bare "Gate City" IS the store ("Welcome to the Team — Gate City"),
   substituted after the other two have had their turn.

   ⚠️ split/join RATHER THAN replace(). In a string replacement `$&` and `$1`
   are live patterns, so a store with a `$` in its name would inject part of
   the match back into its own page. */
function brandHtml(html, pathname, brand) {
  const { appName, storeName, legalName, fsr } = brand;
  if (isAppShell(html)) {
    return html
      .replace(/<title>[^<]*<\/title>/, () => `<title>${brandEsc(storeName)} FSR · Team Tools</title>`)
      .replace(
        /(<meta\s+name="apple-mobile-web-app-title"\s+content=")[^"]*(")/,
        (_m, a, b) => a + brandEsc(appName) + b,
      );
  }
  const bareIsStore = FULL_REBRAND.has(rebrandKey(pathname));
  /* Odd segments are the <script> blocks and take JS escaping; even segments
     are markup and take HTML escaping. */
  const swapped = html.split(/(<script\b[\s\S]*?<\/script>)/gi).map((seg, i) => {
    const esc = i % 2 ? brandJs : brandEsc;
    /* ⚠️ LONGEST FORM FIRST. Replacing the bare name before the two longer
       ones would turn "Gate City Chick-fil-A" into "<store> Chick-fil-A",
       which is only the same string by luck. */
    let out = seg
      .split("Gate City Chick-fil-A").join(esc(legalName))
      .split("Gate City Hub").join(esc(appName));
    if (bareIsStore) out = out.split("Gate City").join(esc(storeName));
    /* The deck prints the store number beside the store's name. Substituting
       one and not the other puts a real, checkable falsehood on the page:
       another store's name over Gate City's FSR. */
    return out.split("FSR #04010").join(`FSR #${esc(fsr)}`);
  }).join("");
  const titled = swapped.replace(/<title>([^<]*)<\/title>/, (_m, t) =>
    `<title>${t.split("Gate City").join(brandEsc(storeName))}</title>`);
  /* The source says "Put the Gate City Hub on your phone", so a store whose
     app name starts with "The" reads "the The Village Hub". No English
     sentence wants a doubled article, so collapsing one can only ever be a
     fix — and it is a smaller, more obvious rule than trying to be clever
     about articles at every substitution site. */
  return titled.replace(/\b(the|The) The\b/g, (_m, a) => a);
}

// The live roster ids: the seeded list above + anyone added in HR Console.
// Mirrors HRConsole's loadHRTeam(), which the browser imports directly.
async function hrRosterIds(env) {
  const added = await sbGet(env, HR_ADDED_KEY);
  if (!Array.isArray(added) || !added.length) return HR_ROSTER_IDS;
  const extra = added.map((m) => m && m.id).filter(Boolean);
  return [...HR_ROSTER_IDS, ...extra];
}

/* Eval cadence — 6 months from the most recent evaluation, or from the hire
   date for someone never evaluated. That MATCHES what Team Documentation's
   roster showed ("Eval due Jan 17, 2027") and what this digest has always
   said, so the line doesn't quietly change meaning under anyone.

   SETTLED July 17 2026: 6 MONTHS EVERYWHERE. This digest, App.jsx's dashboard
   badge, and HRConsole's EOS scorecard row s6 ("Evals on-time") all now use the
   same `setMonth(+6)` form and agree to the day. (s6 previously ran a 90-day
   cadence — that was the outlier, and it was fixed to match this.) All three
   must move together if the policy ever changes again; use setMonth, not a
   `N * DAY` constant — 6 months is 181–184 days and a day-count would reintroduce
   the drift this decision removed. */
const EVAL_CADENCE_MONTHS = 6;

function prevBizDayET() {
  const d = nowET();
  d.setDate(d.getDate() - 1);
  while (d.getDay() === 0) d.setDate(d.getDate() - 1);
  return isoOfD(d);
}

async function buildTodaysTodos(env) {
  const lines = [];
  const weekday = nowET().toLocaleDateString("en-US", { weekday: "long" });
  /* ⚠️ NAMES THE TILE AS THE DASHBOARD NAMES IT. This line goes out to the
     whole store every morning, so a stale tool name here is the single most
     repeated wrong instruction the Hub can send. */
  lines.push(`• ${weekday} stations — check Lineup · Daily Setup`);

  /* ── Evals due + handbook — BOTH from HR CONSOLE ──────────────────
     Evals due USED to be computed from Team Documentation's roster
     (gcfcr-hr-team-v1, using each member's lastEval/start). Team Documentation
     is being retired, and it is the ONLY writer of that key — so the moment
     the tile is cut, that key freezes and this line keeps reporting evals due
     against a dead roster, forever, pointing people at a tool that no longer
     exists. Silently. In a 7am Slack post nobody cross-checks.

     Evals live in HR Console now (gcfcr-hr-evals, keyed by member id), so
     that's the source. Same 6-month cadence, same one-week warning. */
  const [ids, evalsRaw, infoRaw, hb, stRaw] = await Promise.all([
    hrRosterIds(env),
    sbGet(env, "gcfcr-hr-evals"),
    sbGet(env, "gcfcr-hr-info"),
    sbGet(env, "gcfcr-hr-handbook"),
    sbGet(env, "gcfcr-hr-status"),
  ]);
  const evalsBy = evalsRaw || {};
  const infoBy = infoRaw || {};
  const st = stRaw || {};
  const nowMs = Date.now();

  let evalsDue = 0;
  ids.forEach((id) => {
    if (st[id] === "terminated") return;
    // Most recent evaluation on file.
    let last = null;
    (evalsBy[id] || []).forEach((ev) => {
      const t = Date.parse((ev && ev.date) || "");
      if (!Number.isNaN(t) && (last === null || t > last)) last = t;
    });
    // Never evaluated → measure from the hire date, so a new hire gets a grace
    // period instead of being "overdue" on day one.
    let basis = last;
    if (basis === null) {
      const h = Date.parse(((infoBy[id] || {}).hireDate) || "");
      basis = Number.isNaN(h) ? null : h;
    }
    // No eval AND no hire date = nothing to measure from. Not assessable —
    // counting them would invent a due date out of nothing.
    if (basis === null) return;
    const due = new Date(basis);
    due.setMonth(due.getMonth() + EVAL_CADENCE_MONTHS);
    if ((due.getTime() - nowMs) / 86400000 <= 7) evalsDue++;
  });
  if (evalsDue > 0) {
    lines.push(`• ${evalsDue} evaluation${evalsDue === 1 ? "" : "s"} due soon — HR Console`);
  }

  if (hb && hb.version) {
    const acks = hb.acks || {};
    const unsigned = ids.filter(
      (id) => st[id] !== "terminated" && (!acks[id] || acks[id].version !== hb.version.n)
    ).length;
    if (unsigned > 0) lines.push(`• ${unsigned} handbook signature${unsigned === 1 ? "" : "s"} pending — HR Console`);
  }

  const pbd = prevBizDayET();
  const ym = pbd.slice(0, 7);
  const [sa, pl, fc] = await Promise.all([
    sbGet(env, `gcfcr-salesalloc-${ym}-v1`),
    sbGet(env, `gcfcr-planner-${ym}-v1`),
    sbGet(env, `gcfcr-foodcost-${ym}-v1`),
  ]);
  const saDay = (sa && sa.days && sa.days[pbd]) || null;
  const sales = !!saDay && Object.values(saDay).some((v) => Number(v) > 0);
  const plDay = (pl && pl.days && pl.days[pbd]) || {};
  const hours = plDay.foh !== undefined || plDay.boh !== undefined;
  const giveaways = !!(fc && fc.giveaways && fc.giveaways[pbd] !== undefined);
  const pbdLabel = new Date(pbd + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
  if (!sales) lines.push(`• ${pbdLabel} sales not yet entered — Financials → Sales Allocation`);
  if (!giveaways) lines.push(`• ${pbdLabel} giveaways not yet entered — Financials → Food Cost`);
  if (!hours) lines.push(`• ${pbdLabel} hours not yet entered — Financials → Labor Planner`);

  return lines;
}

async function runFoodSafetyReminder(env) {
  const todos = await buildTodaysTodos(env);
  const text =
    `*Food Safety Walkthrough — daily reminder*\n` +
    `Don't forget to run today's walkthrough. Rest of today's to-dos:\n\n` +
    todos.join("\n") +
    `\n\n<!channel>`;
  await postToSlackChannel(env, CHANNELS.brand, text);
}

// ═══════════════════════════════════════════════════════════════════
// JOB 4b — Weekly Food Safety roll-up → Slack #guardian-of-the-brand
//          + one email to Adriana (replaces the old per-save email).
// Aggregates the last 7 days of internal walkthroughs (2x daily): count
// completed, average score, and total flagged by risk tier.
// ═══════════════════════════════════════════════════════════════════

// Sum flagged items by risk tier for one saved walkthrough. New saves carry
// payload.severityCounts directly; older ones are derived from flaggedItems.
function foodSafetySeverityOf(payload) {
  if (payload && payload.severityCounts) {
    const s = payload.severityCounts;
    return { immediate: s.immediate || 0, high: s.high || 0, medium: s.medium || 0, low: s.low || 0 };
  }
  const counts = { immediate: 0, high: 0, medium: 0, low: 0 };
  const map = { "Immediate Action": "immediate", "High Risk": "high", "Medium Risk": "medium", "Low Risk": "low" };
  (Array.isArray(payload?.flaggedItems) ? payload.flaggedItems : []).forEach((f) => {
    const id = map[f.section]; if (id) counts[id] += 1;
  });
  return counts;
}

async function runFoodSafetyWeekly(env) {
  // Timestamps in true UTC (nowET() is only safe for getHours/getDay/getDate);
  // date LABELS in ET.
  const nowReal = new Date();
  const since = new Date(nowReal.getTime() - 7 * 24 * 60 * 60 * 1000);
  const rows = await sbListSubmissions(env, "food-safety", since.toISOString());
  const wk = rows.filter((r) => {
    const ts = new Date(r.submitted_at);
    return ts >= since && ts <= nowReal;
  });

  const end = isoOfD(nowET());
  const startD = new Date(nowET()); startD.setDate(startD.getDate() - 7);
  const start = isoOfD(startD);
  /* ⚠️ NO FALLBACK TO A HARDCODED PERSON. This used to read
     `|| TOOL_RECIPIENTS.foodsafety`, which is how a SECOND STORE's weekly food
     safety report would have emailed a Gate City team member's personal Gmail.
     Null now means the Slack post still goes (that is the record, and it is
     store-scoped) and the EMAIL is skipped and reported. The scope check caught
     this caller — deleting the map left it referencing nothing. */
  const R = await recipientFor(env, "foodsafety");

  if (wk.length === 0) {
    const body = "No walkthroughs were recorded this week.";
    await postToSlackChannel(env, CHANNELS.brand,
      `*Weekly Food Safety Report — ${start} to ${end}*\n${body}\n\n<!channel>`);
    if (R) {
      await sendEmail(env, R.to, `Weekly Food Safety Report — ${start} to ${end}`,
        `Hi ${R.name},\n\n${body}\n\n— ${STORE.legalName}`);
    }
    return;
  }

  const scored = wk.map((r) => Number(r?.payload?.overallPct)).filter((v) => Number.isFinite(v));
  const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null;

  const tot = { immediate: 0, high: 0, medium: 0, low: 0 };
  wk.forEach((r) => {
    const s = foodSafetySeverityOf(r.payload || {});
    tot.immediate += s.immediate; tot.high += s.high; tot.medium += s.medium; tot.low += s.low;
  });
  const totalFlagged = tot.immediate + tot.high + tot.medium + tot.low;

  // The walkthrough that turned up the MOST findings — more actionable than a
  // low percentage, which can hide a lot of small hits behind a decent score.
  // Ties break toward the more severe set (immediate > high > medium > low).
  // A week where nothing was flagged produces no line at all, by design.
  let worst = null;
  wk.forEach((r) => {
    const p = r.payload || {};
    const s = foodSafetySeverityOf(p);
    const n = s.immediate + s.high + s.medium + s.low;
    if (!n) return;
    const sev = s.immediate * 1000 + s.high * 100 + s.medium * 10 + s.low;
    if (worst === null || n > worst.n || (n === worst.n && sev > worst.sev)) worst = { n, sev, date: p.walkDate, by: r.submitted_by };
  });

  const headline = `${wk.length} walkthrough${wk.length === 1 ? "" : "s"} completed` + (avg !== null ? ` · avg score ${avg}%` : "");
  // Recognise everyone who actually did one. Participation is the behaviour we
  // want more of, so the people doing it get named before any numbers land.
  const doers = Array.from(new Set(wk.map((r) => r.submitted_by).filter(Boolean)));
  const doerLine = doers.length ? `\nCompleted by: ${doers.join(", ")}` : "";
  const tierLines = `• Immediate: ${tot.immediate}\n• High: ${tot.high}\n• Medium: ${tot.medium}\n• Low: ${tot.low}\nTotal caught: ${totalFlagged}`;
  // Named as CREDIT, not blame: the person on this line is the one who ran the
  // walkthrough and caught the most — the name comes first for that reason.
  const worstLine = worst ? `\n\n:mag: Most catches: ${worst.by || "—"} — ${worst.n} found${worst.date ? ` on ${worst.date}` : ""}` : "";
  const closer = "\n\n_Every catch is a problem fixed before it costs us. Thanks for staying on these._";

  await postToSlackChannel(env, CHANNELS.brand,
    `*Weekly Food Safety Report — ${start} to ${end}*\n${headline}${doerLine}\n\n*Caught this week:*\n${tierLines}${worstLine}${closer}\n\n<!channel>`);

  /* ⚠️ GUARDED, LIKE THE BRANCH ABOVE. `R` can be null now that there is no
     hardcoded person to fall back to, and an unguarded R.to here would throw
     and take the whole weekly job down — the Slack post included, which is the
     part that always works. The post is the record; the email is the courtesy. */
  if (R) await sendEmail(env, R.to, `Weekly Food Safety Report — ${start} to ${end}`,
    `Hi ${R.name},\n\n${headline}${doerLine}\n\nCaught this week:\n${tierLines}${worstLine}${closer}\n\n— ${STORE.legalName}`);
}

// ═══════════════════════════════════════════════════════════════════
// JOB 5 — Equipment Check tier-2+ reminder (Leader and up), weekly from
// Monday 6am ET. IN-HUB reminder, not Slack/email — writes a flag to
// Supabase kv_store that the frontend can read/display for rank ≥ 3
// (Team Leader and up). Still needs a small read added on the frontend
// (EquipmentLog.jsx or App.jsx's chip strip) once that filename question
// is settled — this job only sets the flag.
// ═══════════════════════════════════════════════════════════════════
const EQUIP_REMINDER_KEY = "gcfcr-equip-reminder-v1";

async function runEquipmentReminderFlag(env) {
  await sbSet(env, EQUIP_REMINDER_KEY, {
    active: true,
    since: isoOfD(nowET()),
    minRank: 3,
    message: "Equipment Check Log needs to be completed this week.",
  });
}

// ═══════════════════════════════════════════════════════════════════
// JOB 6 — Trainer Weekly Cleaning Checklist (Tashiana's rotating,
// per-person program — separate from JOB 1's station-based Weekly
// Cleaning List above). Daily missed-items summary → Slack
// #guardian-of-the-brand, @channel. One-time completion email to
// Tashiana when the whole week hits 100%.
//
// Source: the "submissions" table (tool = "trainer-tasks"), written by
// TrainerTaskSubmit.jsx — the in-Hub screen that replaced the Google
// Form. The roster lives in trainerTaskRoster.js, shared with the
// frontend so both sides can never drift out of sync.
//
// NOTE: this is genuinely a different program from JOB 1. Both post to
// #guardian-of-the-brand, so two distinct "cleaning" messages will show
// up there — one for FOH/BOH stations (JOB 1, weekly), one for this
// per-person rotation (JOB 6, daily). Confirmed intentional — keep both.
// ═══════════════════════════════════════════════════════════════════
const TRAINER_TASKS_STATUS_KEY = "gcfcr-trainer-tasks-v1";
const TRAINER_TASKS_EMAIL_SENT_KEY = "gcfcr-trainer-tasks-email-sent-v1";
const TRAINER_TASKS_ROSTER_KEY = "gcfcr-trainer-roster-v1"; // live roster edited in-app (TrainerTasks.jsx); TRAINER_TASK_ROSTER import is the fallback

async function sbListSubmissions(env, tool, sinceISO) {
  const url =
    `${env.SUPABASE_URL}/rest/v1/submissions?tool=eq.${encodeURIComponent(tool)}` +
    `&submitted_at=gte.${encodeURIComponent(sinceISO)}&select=*`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!res.ok) return [];
  return res.json();
}

// Resolve trainer names -> Slack user ids straight from the workspace
// directory, so trainerTaskRoster.js stays the ONLY file to edit when
// Tashiana adds or removes a trainer — no second map to maintain here.
// Cached per isolate like channelCache above; refreshes on cold start.
let trainerDirCache = null;

async function loadSlackUserDirectory(env) {
  /* ★ THE GUARD THAT SILENCES THE DMs WITHOUT TOUCHING A SINGLE CALL SITE, and
     it is the highest-leverage one here. Empty directory → `slackIdForName`
     returns null → `notifyTarget` returns null → every
     `if (uid) await sendSlackDM(...)` in this file becomes a clean no-op. There
     are seven of those and none needed editing.
     ⚠️ IT ALSO MAKES notifyTarget'S OWN COMMENT TRUE AGAIN. That function says
     "Never throws — a recipient lookup must not be able to take a scheduled job
     down", and until now it could: this fetch threw on `{ok:false}` and the
     exception went straight through it. The promise was written before the case
     that broke it existed. */
  /* ⚠️⚠️ THE GUARD ABOVE ASKS WHETHER SLACK IS CONFIGURED, NOT WHETHER IT
     ANSWERS, and that gap is what this catch closes (Aug 13 2026).
     `slackReady` checks a token EXISTS. A store with a good token still gets a
     rate limit, a revoked scope, a 500 or a dropped connection, and every one
     of those took the whole caller down: this function has a bare `fetch`, a
     bare `res.json()` and an explicit `throw` on `{ok:false}`, none of them
     caught. The exception went up through `slackIdForName` and `notifyTarget`
     into whichever scheduled job asked, and there are FIFTEEN of those.
     ⚠️ REPRODUCED BEFORE FIXING, three ways, against the real Worker: with
     Slack throwing, and with Slack answering 500, /api/run-job returned HTTP
     500 and the security sweep wrote no report and no state. A recipient
     lookup was able to delete a morning's security report.
     ⛔ AND IT IS NOT WHAT BROKE THE SWEEP ON AUG 13. That was the request
     ending on too many subrequests, found and fixed separately in #500 — the
     census snapshot was never written that morning, and it runs BEFORE this
     call, which is what rules this out as the cause. This is the fault that
     did not happen yet. */
  if (!slackReady(env)) return {};
  try {
    const byName = {};
    let cursor;
    do {
      const url = `https://slack.com/api/users.list?limit=200` +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
      const res = await fetch(url, { headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` } });
      const data = await res.json();
      if (!data.ok) throw new Error(`Slack users.list failed: ${data.error || "unknown"}`);
      (data.members || []).forEach((m) => {
        if (m.deleted || m.is_bot) return;
        const p = m.profile || {};
        [m.real_name, p.real_name, p.display_name].forEach((n) => {
          const k = (n || "").trim().toLowerCase();
          if (k && !byName[k]) byName[k] = m.id;
        });
      });
      cursor = data.response_metadata?.next_cursor || null;
    } while (cursor);
    return byName;
  } catch (e) {
    /* ⚠️ null, NOT `{}`. `{}` is "Slack is not set up here", which the caller
       may cache forever. This is "we could not find out", which it must not.
       ⚠️ LOGGED, NEVER SWALLOWED. It goes to Cloudflare Observability the same
       way every other best-effort failure in this file does, so a Slack outage
       is findable rather than merely survivable. The report itself still
       reaches its owner: the sweep's email copy is deliberately not gated on
       having a Slack recipient. */
    console.error("slack users.list failed, DMs will be skipped this run:", e);
    return null;
  }
}

/* ★ JUL 26 2026 — TRAINER DMs NOW USE THE SAME RESOLVER AS EVERY OTHER JOB.
   This did an EXACT lowercase match on the full name, and FOUR of the twelve
   trainers never matched, so their weekly cleaning DM has never once sent:

     roster                        Slack
     Jose Arias-Cortez             Jose Arias
     Joselin Vargas-Teodoro        Joselin Vargas
     Maria Gracia-Perez            Maria Garcia      (Gracia/Garcia)
     Thania Gracia                 Thania Garcia     (Gracia/Garcia)

   It failed SILENTLY — `console.error` inside a try/catch, and the job reports
   success either way, so nothing ever surfaced it.

   The roster names are almost certainly the real ones, and trainerTaskRoster.js
   also feeds the submission screen, the oversight tile and the Shift Leader
   Scorecard — editing it to match Slack would put shortened names in front of
   everyone. So the CODE moves, not the roster.

   `slackIdFor` (used by the PG and eval reminders) already falls back to
   first-name + last-initial off the avatars map, and `runSlackAvatars` DELETES
   any short key two people share — so the loose step cannot mis-deliver the way
   bare-first-name matching did on the setup board. All four resolve on it:
   josea · joselinv · mariag · thaniag.

   The old users.list path stays as the fallback for when the avatars map hasn't
   been built yet, so this is strictly additive. */
async function slackIdForName(env, name) {
  if (!name) return null;
  try {
    const avatars = (await sbGet(env, "hr:slack-avatars:v1")) || {};
    const hit = slackIdFor(name, avatars.idByName || {}, avatars.idByShort || {});
    if (hit) return hit;
  } catch (e) { /* fall through to the directory below */ }
  /* ⚠️⚠️ null MEANS "COULD NOT FIND OUT" AND IS NEVER CACHED. `{}` means Slack
     is not configured here, which is a settled answer worth keeping for the
     life of the isolate. A FAILED lookup is not settled: caching it would make
     one Slack blip silence every DM in this file until the isolate recycled,
     turning a thirty second outage into an all-day one.
     ⚠️ AND IT NO LONGER INDEXES INTO THE RESULT BEFORE CHECKING IT. The old
     line read `trainerDirCache[...]` straight after assigning it, so the moment
     the lookup returned anything falsy this threw a TypeError — which is the
     same class of fault the guard below exists to stop. */
  const dir = trainerDirCache || (await loadSlackUserDirectory(env));
  if (!dir) return null;
  trainerDirCache = dir;
  return dir[String(name).trim().toLowerCase()] || null;
}

/* ═══════════════════════════════════════════════════════════════════
   Assigned-evaluation due reminders (Bri, Jul 22: "notified via Slack the
   day before they are due").

   Reads the SAME key HR Console writes, gcfcr-hr-evaltasks-v1, and DMs each
   assignee ONCE per task. `remindedAt` is written back so a job that runs
   more than once a day — or gets retriggered by hand — can't nag anyone
   twice for the same evaluation.

   Identity comes from the idByName map the slack-avatars job now builds, so
   nobody's Slack ID is guessed here. No ID = no DM, counted and reported
   rather than silently skipped.
   ═══════════════════════════════════════════════════════════════════ */
const EVAL_TASK_KEY = "gcfcr-hr-evaltasks-v1";

/* ═══ FOOD SAFETY WALKTHROUGH — morning assignment post ═══════════════════
   Hannah, Jul 23: "post in guardian of the brand each morning who is
   assigned." Reads the SAME rota key DailySetup writes, and if today has no
   assignment yet it COMPUTES one from the same board data and persists it —
   so the 7am post never depends on somebody having opened the board first.

   ⚠️ THE ROTA RULE NOW EXISTS IN TWO PLACES (here and DailySetup.jsx's
   fsAssignFor). That is a deliberate cost, not an oversight: the worker can't
   import from the client bundle. They are SAFE because whoever writes a given
   date FIRST wins — the write is guarded on `assigned[date]` being absent —
   and both use the identical rule (never-assigned first, then
   least-recently-assigned, alphabetical tiebreak). If you change the rule in
   one file, change it in the other or the two will silently diverge.

   Split: FOH Mon-Wed, BOH Thu-Sat. Sunday is closed — no post. */
const FS_ROTA_KEY = "gcfcr-foodsafety-rota-v1";
const FS_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const FS_SIDE = { Monday: "foh", Tuesday: "foh", Wednesday: "foh", Thursday: "boh", Friday: "boh", Saturday: "boh" };
const FS_MIN_RANK = 3;
/* Who may nudge somebody's phone. Rank 3 is Senior Trainer / Team Leader and
   up — the same line the app calls tier 2, and the people who actually chase a
   missing sign-off. Deliberately NOT tied to HR_FULL_READ_MIN: reading
   everyone's file and telling a teammate their cleaning is outstanding are
   different powers, and the second is the smaller one. */
const NUDGE_MIN_RANK = 3;
// Published by App.jsx at sign-in. See runFoodSafetyAssign for why.
const FS_RANK_KEY = "hr:rank-by-name:v1";
// MUST mirror rankNameKeys in App.jsx — the map is keyed with it.
function fsRankKeys(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  const out = [normName(parts.join(""))];
  out.push(normName(parts[0]));
  if (parts[1]) out.push(normName(parts[0] + parts[1][0]));
  return [...new Set(out.filter(Boolean))];
}

function fsNameOf(entry) {
  return String(entry || "")
    .replace(/✔️|✔/g, "")
    .replace(/\s+\d{1,2}(:\d{2})?\s*[ap]?m?\s*-\s*\d{1,2}(:\d{2})?\s*[ap]?m?.*$/i, "")
    .trim();
}

function fsPick(cands, lastBy) {
  if (!cands.length) return null;
  return cands.slice().sort((a, b) => {
    const la = lastBy[a.toLowerCase()] || "", lb = lastBy[b.toLowerCase()] || "";
    if (la !== lb) return la < lb ? -1 : 1;
    return a.localeCompare(b);
  })[0];
}

async function runFoodSafetyAssign(env) {
  const now = nowET();
  const dayName = FS_DAY_NAMES[now.getDay()];
  if (!FS_SIDE[dayName]) return { skipped: "closed", day: dayName };
  const today = isoOfD(now);

  const rota = (await sbGet(env, FS_ROTA_KEY)) || { assigned: {}, lastBy: {} };
  // ⚠️ `=== undefined` ON PURPOSE, AND IT MASKED THE DIAGNOSTIC (Jul 25).
  // A failed run stores NULL for today. On the next run `entry` is null — which
  // is DEFINED — so the whole computation below was skipped and it re-posted the
  // generic failure with `noMap` still false. The "roster hasn't reached this
  // job yet" message could therefore never appear, and a fix deployed mid-day
  // could never take effect until the next day.
  // A null stored for TODAY is now retried rather than trusted.
  let entry = (rota.assigned || {})[today];
  if (entry === null) entry = undefined;
  // Distinguishes "genuinely nobody eligible was working" from "the rank map
  // hasn't been published yet". Reporting both as the same sentence is what let
  // this fail silently for days.
  let noMap = false;

  if (entry === undefined) {
    // Monday of this week, ET, as the board's week key.
    const mon = new Date(now);
    mon.setDate(mon.getDate() - ((now.getDay() + 6) % 7));
    const weekStart = isoOfD(mon);
    const [foh, boh, rankMap] = await Promise.all([
      sbGet(env, `gcfcr-dailysetup-foh-v2-${weekStart}-auto`),
      sbGet(env, `gcfcr-dailysetup-boh-v2-${weekStart}-auto`),
      sbGet(env, FS_RANK_KEY),
    ]);
    // ── THE BUG THIS REPLACES (Jul 24 2026) ──────────────────────────────
    // This used to read `gcfcr-hr-roles` with a NAME taken off the board.
    // `gcfcr-hr-roles` is keyed by roster ID, and holds only people whose role
    // was manually OVERRIDDEN — so every lookup returned undefined, everyone
    // scored 0, the eligible list was always empty, and the rota posted
    // "nobody could be assigned" to @channel every single morning from the day
    // it went live. It never assigned anyone, once.
    //
    // The worker cannot import HRConsole, so it has no roster. App.jsx now
    // PUBLISHES `hr:rank-by-name:v1` on every sign-in — a name → rank map built
    // from the real roster with the overrides applied. Three key forms per
    // person (full / first / first+last-initial) because the board and HR write
    // names differently; ambiguous keys are dropped upstream only when the
    // ranks actually differ.
    const rankOf = (n) => {
      const m = rankMap || {};
      for (const k of fsRankKeys(n)) {
        const r = m[k];
        if (typeof r === "number") return r;
      }
      return 0;
    };
    const haveRankMap = !!rankMap && Object.keys(rankMap).length > 0;
    const eligible = (roster) => {
      const seen = new Set(); const out = [];
      (roster || []).forEach((e) => {
        const n = fsNameOf(e); const k = n.toLowerCase();
        if (!n || seen.has(k)) return;
        seen.add(k);
        if (rankOf(n) >= FS_MIN_RANK) out.push(n);
      });
      return out;
    };
    const want = FS_SIDE[dayName];
    const fohR = ((foh || {})[dayName] || {}).roster;
    const bohR = ((boh || {})[dayName] || {}).roster;

    /* ★★ NO BOARD AT ALL IS NOT THE SAME AS NOBODY ELIGIBLE (Jul 28 2026).
       Until now both ended at the same `<!channel>` post: "No leader at Senior
       Trainer or above is on the board today, so nobody could be assigned."
       When the board simply had not been BUILT yet that sentence is false and
       it is accusing — it tells the whole store that the leaders on shift do
       not qualify, when in fact nothing had been scheduled for the job to read.
       The cron runs 08:30 ET; any weekday board built after that produced this.
       ⇒ NO BOARD → SAY NOTHING and store NOTHING, so the next run (or a manual
       hit of the job) picks it up cleanly once the board exists.
       ⚠️ SILENCE MUST NOT BE INVISIBLE. Nobody would ever learn the walkthrough
       went unassigned, so Matt gets a private push instead — he is the one who
       can fix it, and it costs the team nothing. It also honours ?quiet=1 like
       every other send.
       ⚠️ AN EMPTY ARRAY IS STILL A BOARD. A built-but-empty day, or one with
       only low ranks on it, still posts the real message — that is a true
       statement about a real board. Only a MISSING roster is silent. */
    const haveBoard = Array.isArray(fohR) || Array.isArray(bohR);
    if (!haveBoard) {
      try {
        await pushToPerson(env, await notifyName(env, "owner"), {
          title: "Food safety walkthrough not assigned",
          body: `No ${dayName} board was built yet, so nobody was assigned and nothing was posted.`,
          url: "/",
        });
      } catch {}
      return { day: dayName, date: today, skipped: "no-board", posted: false };
    }

    const primary = eligible(want === "foh" ? fohR : bohR);
    if (primary.length) entry = { name: fsPick(primary, rota.lastBy || {}), side: want, fallback: false };
    else {
      const other = eligible(want === "foh" ? bohR : fohR);
      entry = other.length ? { name: fsPick(other, rota.lastBy || {}), side: want === "foh" ? "boh" : "foh", fallback: true } : null;
    }
    const next = {
      assigned: { ...(rota.assigned || {}), [today]: entry },
      lastBy: entry ? { ...(rota.lastBy || {}), [entry.name.toLowerCase()]: today } : { ...(rota.lastBy || {}) },
    };
    /* ⚠️ A DRY RUN PICKS, BUT IT MUST NOT REMEMBER (Aug 9 2026 sweep).
       This job had zero __QUIET references. `next` carries two pieces of
       memory: today's assignee, and `lastBy` — the ledger that keeps the
       walkthrough rotating fairly. A rehearsal that stores both fixes today's
       pick against whatever the board looked like at that moment, and stamps a
       leader as having walked on a day the store was never told about. The
       pick itself is harmless to compute and worth seeing in the response, so
       it is computed and simply not written. */
    if (!(env && env.__QUIET)) await sbSet(env, FS_ROTA_KEY, next);
    noMap = !haveRankMap;
  }

  const sideLabel = FS_SIDE[dayName] === "foh" ? "Front of House" : "Back of House";
  /* ★ TAG THE PERSON, DON'T JUST TYPE THEIR NAME (Hannah, Jul 28 2026: "when
     you assign someone a food safety walk thru please @ before their name so
     they get a notification").
     A bare name in Slack is text — it lights nothing up. `<@U123>` is a real
     mention and pings them. Reuses `slackIdForName`, the SAME lookup the PG and
     evaluation reminders use: exact match first, then first-name + last-initial
     off the avatars map, and `runSlackAvatars` deletes any short key two people
     share.
     ⚠️ FALLS BACK TO THE PLAIN NAME WHEN IDENTITY IS UNCERTAIN. Tagging the
     wrong person on a food safety assignment is worse than tagging nobody — the
     real assignee wouldn't be pinged AND someone else would think they were on
     the hook. Same reasoning as the setup board's bare-first-name bug. */
  let whoLabel = entry ? entry.name : null;
  if (entry && entry.name) {
    try {
      const uid = await slackIdForName(env, entry.name);
      if (uid) whoLabel = `<@${uid}>`;
    } catch { /* plain name stands */ }
  }
  /* 🐛 A WALKTHROUGH WAS MISSED BECAUSE THE POST LOOKED FINE (Hannah, Aug 4
     2026: "Thursday last week Adriana's was missing that and the walk thru got
     missed").
     The mention already falls back to a plain name when identity is uncertain —
     deliberately, because tagging the wrong person on a food safety assignment
     is worse than tagging nobody. But the fallback was SILENT: an untagged post
     reads exactly like a tagged one to everybody except the person who needed
     the ping, and they never saw it.
     ⇒ The push is resolved BEFORE the text is composed, so the post can say
     what actually reached them. If neither the tag nor the push landed, the
     channel is told plainly to go and tell the person. A room full of leaders
     can close that loop in ten seconds; silence cannot. */
  let pushedTo = null;
  if (entry && entry.name) {
    try {
      const r = await pushToPerson(env, entry.name, {
        title: "Food safety walkthrough — today",
        body: `You're assigned the ${sideLabel} walkthrough today. Run it in the Hub → Food Safety.`,
        url: "/",
      });
      if (r && Number(r.sent) > 0) pushedTo = entry.name;
    } catch { /* the post below reports it either way */ }
  }
  const tagged = !!(entry && whoLabel && whoLabel !== entry.name);
  const unreachable = !!entry && !tagged && !pushedTo;

  const text = entry
    ? `*Food Safety Walkthrough — ${dayName} ${today}*\n${whoLabel} is assigned today (${sideLabel} rotation).` +
      (entry.fallback ? `\n_No ${sideLabel} leader is on today, so this is a stand-in._` : "") +
      (unreachable
        ? `\n:warning: *Could not notify ${entry.name} — no Slack match and no alert on their phone. Please tell them in person.*`
        : "") +
      // No @channel: this branch NAMES the assignee and has already pushed to
      // them above. The two failure branches underneath keep theirs on purpose —
      // nobody is resolved there, so the room is the only recipient that makes
      // sense.
      `\n\nRun it in the ${STORE.appName} → Food Safety.`
    : noMap
      ? `*Food Safety Walkthrough — ${dayName} ${today}*\nCouldn't work out who is eligible — the roster hasn't reached this job yet. Please assign someone manually and tell Matt.\n\n<!channel>`
      : `*Food Safety Walkthrough — ${dayName} ${today}*\nNo leader at Senior Trainer or above is on the board today, so nobody could be assigned. Please assign someone manually.\n\n<!channel>`;
  await postToSlackChannel(env, CHANNELS.brand, text);

  /* `mentioned` makes a silent fallback visible in the job history — otherwise
     "they never get pinged" looks identical to "the job didn't run". */
  return { day: dayName, date: today, assigned: entry ? entry.name : null, mentioned: tagged, unreachable, pushedTo, fallback: !!(entry && entry.fallback), rankMapMissing: noMap };
}

/* ═══ PROFESSIONAL GROWTH REMINDERS ══════════════════════════════════════
   Bri's rules, Jul 23, verbatim in shape:
     • recommendation requested, application HAS a due date  → ONE reminder
       to the requested leader, 2 days BEFORE the due date
     • recommendation requested, NO due date                 → ONE nudge to
       the leader, 2 days AFTER the request
     • application HAS a due date and the applicant is missing pieces → ONE
       reminder to the APPLICANT, 2 days before

   Every reminder is SINGLE. She explicitly did not want repeated nagging, and
   a `reminded` map on the index entry makes each one fire exactly once even if
   the job runs twice in a day or gets retriggered by hand.

   Slack IDs come from `hr:slack-avatars:v1` → idByName, the same map the rest
   of the Hub uses. No ID means no DM, counted and reported — never guessed.
   ═══════════════════════════════════════════════════════════════════════ */
const PG_INDEX_KEY = "gc-pg-index-v1";
const PG_CONFIG_KEY = "gc-pg-config-v1";
const pgAppKey = (role, slug) => `gc-pg-app-v1:${role}:${slug}`;
/* ═══ INTERVIEW SLOTS — REPLACING CALENDLY ══════════════════════════════════
   Bri, Aug 7 2026: "Can we make an internal calendar system to schedule
   meetings, send reminders, have applicants schedule interviews, etc? We
   currently use Calendly… I can send specifics if this is possible, just tell
   me where to start."

   Interviews first, because that is the only thing Calendly actually does
   inside the Hub — one step on each of the three applications — and it is a
   whole working piece on its own. Meetings and general reminders wait for her
   specifics rather than being guessed at (design rule 16).

   ★ THE BOOKING IS DECIDED HERE, NOT IN THE BROWSER. Two applicants tapping
   the same slot is the one thing a client-side check cannot get right: both
   read "open", both write, and last-write-wins hands the same time to two
   people with nothing anywhere saying so. The route below re-reads immediately
   before it writes and refuses a slot that is already taken, so the first tap
   wins and the second is told it just went.
   ⚠️ Not a transaction, and it does not need to be. The window is one request,
   the volume is a handful of interviews per window, and the failure mode is
   visible to Bri on her own list. A lock would be more machinery than the
   problem. */
const PG_SLOTS_KEY = "gc-pg-slots-v1";
const PG_ROLE_LABEL = { trainer: "Team Trainer", "team-leader": "Team Leader", "assistant-director": "Assistant Director" };
const DAY_MS = 24 * 60 * 60 * 1000;

// Exact Slack-name match first; the looser first-name forms only if that misses.
// Returns null rather than guessing, and every caller already handles null by
// counting a `noSlackId` instead of sending.
// ★ SINGLE-WORD NAMES CONSULT idByShort TOO (Aug 6 2026). The Daily Setup
// board writes FIRST NAMES into its cells ("Daisy", "Thanh"), and this
// returned null for any one-word name before even looking — so the first
// labor-daypart rehearsal resolved zero of three real leaders. idByShort is
// safe for this: the avatars job DELETES any short form two people share
// ("ambiguous → no identity at all"), so a hit is always exactly one person,
// and a store with two Brandons still sends that Brandon nothing rather than
// guessing between them.
function slackIdFor(name, idByName, idByShort) {
  const k = normName(name);
  if (k && idByName && idByName[k]) return idByName[k];
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!idByShort || !parts.length) return null;
  const cands = parts.length >= 2
    ? [normName(parts[0] + parts[1][0]), normName(parts[0])]
    : [k];
  for (const c of cands) if (c && idByShort[c]) return idByShort[c];
  return null;
}

/* ═══ LABOR DAYPART DMs ══════════════════════════════════════════════
   Before each daypart, tell the leaders on today's board — and only
   them — what the labor forecast says about their own slice of the day.
   The numbers come from laborEngine.monthLaborCard, THE SAME CALL the
   dashboard makes, read through this worker's own door; who-gets-what
   is decided by laborDaypartPush.daypartRecipients (leaf, tested,
   cannot send). Six seats, one message per human, each seat only its
   own number.

   SILENT BY DESIGN when: Sunday (closed), the month basis is
   unreadable, the daypart table is unimported, today has no schedule,
   the DT/FC mix is unmeasurable, every seat is on budget (under half an
   hour), or a seat's board cell is blank. A job that DMs "nothing to
   do" four times a day is muted inside a week, and a muted job is worse
   than no job.

   ⚠️ EVERY MESSAGE NAMES ITS BASIS ("… Based on Thursdays, last 4
   weeks — not live"). Matt approved that framing explicitly: it is a
   forecast, never a claim about the floor right now. A leader who reads
   "you are 5 over" next to a quiet dining room stops believing the next
   one. */
async function runLaborDaypart(env, dp) {
  const now = nowET();
  if (now.getDay() === 0) return { skipped: "closed Sunday" };

  const get = (k) => sbGet(env, k);
  const ym = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const card = await laborMonthCard(ym, now.getDay(), get);
  if (!card) return { skipped: "labor card unavailable, month basis unreadable" };

  const nums = daypartCutNums(card, dp);
  if (!nums) return { skipped: "no daypart split, table unimported, nothing scheduled today, or DT/FC mix unmeasurable" };

  const monday = boardMondayKey(now);
  const dayName = dayNameOf(now);
  const [fohBoard, bohBoard, avatars] = await Promise.all([
    get(boardKey("foh", monday)),
    get(boardKey("boh", monday)),
    get("hr:slack-avatars:v1"),
  ]);

  const recips = daypartRecipients({
    fohDay: (fohBoard && typeof fohBoard === "object" ? fohBoard : {})[dayName],
    bohDay: (bohBoard && typeof bohBoard === "object" ? bohBoard : {})[dayName],
    dpKey: dp,
    dpLabel: nums.dp,
    weekday: dayName,
    weeks: 4,
    nums,
  });
  if (!recips.length) return { skipped: "on budget, or nobody named on the seats" };

  const idByName = (avatars && avatars.idByName) || {};
  const idByShort = (avatars && avatars.idByShort) || null;
  let sent = 0;
  const to = [], noSlackId = [], failed = [];
  for (const r of recips) {
    const uid = slackIdFor(r.name, idByName, idByShort);
    // No ID means no DM, counted and reported — never guessed.
    if (!uid) { noSlackId.push(`${r.seat}: ${r.name}`); continue; }
    try {
      await sendSlackDM(env, uid, r.text); // quiet-aware: &quiet=1 logs instead of sending
      sent += 1; to.push(`${r.seat}: ${r.name}`);
    } catch (e) {
      // One failed DM must not stop the rest — same rule as every DM job here.
      failed.push(`${r.seat}: ${r.name} — ${String(e).slice(0, 120)}`);
    }
  }
  return { sent, to, noSlackId, failed };
}

/* ═══ SHIFT "WHERE AM I GOING" PUSHES ══════════════════════════════════════
   Matt, Aug 7 2026: "add the message your team before the start of the shift so
   they know where to go instead of where am i going."

   Before each daypart, push EVERY person on today's board their own station.
   Not the leaders — everybody. The leaders already get labor-daypart, which is
   a forecast about hours; this is the other half, and it is the half the floor
   actually asked for.

   Who is on which station is read by boardOwner.daypartRoster (leaf, tested,
   cannot send) — the SAME cell reader the opener/closer rows and the board
   health card already use. One reader, so "✔️Daisy", "❌" and a handoff can
   never mean two different things in two places.

   SILENT BY DESIGN when: Sunday (closed), the week's board was never imported,
   or nobody is on the board for that daypart. A push that says "nothing today"
   is the fastest way to get every alert on this store's phones switched off.

   ⚠️ NOBODY WITHOUT ALERTS ON GETS CHASED ANOTHER WAY (Matt's call, Aug 7:
   "send nothing and report to me"). No Slack fallback and no email. They get
   nothing, and the owner and HR seats get one DM naming them — a list somebody
   can actually do something about, rather than a second channel to maintain.
   (HR was added Aug 12 2026; see the send block for why it is two seats.)

   ⚠️ THE REPORT GOES OUT ONCE A DAY, ON BREAKFAST ONLY. Four reach reports a
   day, six days a week, is twenty-four DMs that all say roughly the same thing,
   and a report Matt mutes is a report that does not exist. Every run still
   RETURNS its numbers, so &quiet=1 shows them for any daypart.

   ⚠️ A DRY RUN MUST NEVER LOOK LIKE AN OUTAGE. Under &quiet=1 pushToPerson
   returns { sent: 0, quiet: true } for everyone, so counting sent === 0 as
   "no alerts on" would report the whole roster as unreachable and send Matt
   chasing a problem that does not exist. The quiet flag is checked FIRST. */
const SHIFT_WHERE_REPORT_DP = "breakfast";

async function runShiftWhere(env, dp) {
  const now = nowET();
  if (now.getDay() === 0) return { skipped: "closed Sunday" };

  const monday = boardMondayKey(now);
  const [foh, boh] = await Promise.all([
    sbGet(env, boardKey("foh", monday)),
    sbGet(env, boardKey("boh", monday)),
  ]);
  if (!foh && !boh) return { skipped: "no board for this week — never imported" };

  const roster = daypartRoster({ foh, boh }, now, dp);
  if (!roster.length) return { skipped: `nobody on the board for ${dp}` };

  let sent = 0;
  let wouldSend = 0;         // quiet runs only
  const noAlerts = [];       // on the board, no push subscription at all
  const failed = [];         // subscribed, but the send did not land
  const unclear = [];        // cell could mean two people scheduled that day
  for (const p of roster) {
    /* ⚠️ SEND TO NOBODY RATHER THAN TO BOTH. daypartRoster resolves a short cell
       against the day's own roster; `ambiguous` means two people scheduled today
       answer to what the cell says, so there is no honest recipient. Buzzing
       both is what Hannah reported on Aug 12, and a wrong-person alert is how a
       store learns to switch alerts off. Named in the report instead, which is
       the one thing a leader can act on: put the initial in the cell. */
    if (p.ambiguous) { unclear.push(p.name); continue; }
    const { title, body } = shiftWhereText(p, dp);
    const r = await pushToPerson(env, p.name, { title, body, url: "/" });
    /* A quiet run now knows who it WOULD have reached, because pushToPerson
       reads the subscriptions before it honours quiet. So a dry run splits the
       board the same way a real one does, and `noAlerts` means the same thing
       in both. Before this, quiet counted every person as reachable and
       reported noAlerts 0 — a confident wrong answer to the one question a
       dry run exists to answer. */
    if (r && r.quiet) {
      if (Number(r.reached) > 0) wouldSend += 1; else noAlerts.push(p.name);
      continue;
    }
    const n = Number(r && r.sent) || 0;
    if (n > 0) { sent += n; continue; }
    /* reached counts the SUBSCRIPTIONS this name resolved to. Zero means
       nobody by that name has alerts on, which is the actionable one. Above
       zero with nothing sent is a delivery failure, which is ours not theirs. */
    if (Number(r && r.reached) > 0) failed.push(p.name); else noAlerts.push(p.name);
  }

  /* ⚠️ HR GETS THE SAME DM AS THE OWNER (Matt, Aug 12 2026: "Hannah needs this
     too"). This report is a chase list of people, and chasing people is HR's
     job. Sending it to one seat and expecting a forward every morning is how a
     report quietly stops being read.

     ⚠️ ADDRESSED BY SEAT, NEVER BY NAME. `hr` resolves through the store's own
     Slack, so this is the config-driven shape sweep finding 38 was about: a
     hardcoded id keeps DMing a departed leader forever, because terminating
     somebody in HR does not touch a literal.

     ⚠️ DEDUPED BY SLACK ID. A store pointing `owner` and `hr` at one person
     must get one DM, not the same message twice.

     ⚠️ ONE SEND CANNOT BLOCK THE OTHER, and neither can take the job down —
     the same per-recipient rule every other DM loop in this file follows. If
     HR's Slack is deactivated the owner's report still goes.

     ⚠️ `reported` IS TRUE IF EITHER LANDED, so false still means nobody was
     told. `reportedTo` counts who actually got it, because "sent to two
     people" and "sent to one of two" are different mornings. */
  let reported = false;
  let reportedTo = 0;
  if (dp === SHIFT_WHERE_REPORT_DP && (noAlerts.length || failed.length || unclear.length)) {
    const lines = [`*Shift alerts — ${DAYPART_LABEL[dp] || dp}*`];
    lines.push(`${roster.length} on the board · ${sent} got it · ${noAlerts.length} have no alerts on`);
    if (noAlerts.length) lines.push(`No alerts: ${noAlerts.join(", ")}`);
    if (failed.length) lines.push(`Failed to send: ${failed.join(", ")}`);
    /* Named, and told exactly what to do about it. "Ashley" with two Ashleys on
       today's schedule is unreadable; "Ashley R" is not. */
    if (unclear.length) lines.push(`Nobody told (two people it could mean): ${unclear.join(", ")} — put the last initial in the cell.`);
    lines.push("They turn alerts on in the Hub, under their own name.");
    const text = lines.join("\n");

    const uids = [];
    for (const seat of ["owner", "hr"]) {
      const uid = await notifyTarget(env, seat);
      if (uid && !uids.includes(uid)) uids.push(uid);
    }
    for (const uid of uids) {
      // quiet-aware: &quiet=1 logs instead of sending, so a dry run tells nobody.
      try { await sendSlackDM(env, uid, text); reported = true; reportedTo += 1; } catch {}
    }
  }

  return { dp, onBoard: roster.length, sent, wouldSend, noAlerts: noAlerts.length, names: noAlerts, failed, unclear, reported, reportedTo };
}


/* ═══ MONTHLY GOALS: THE DAY BEFORE THEY ARE DUE ════════════════════════════
   Bri, Jul 30 2026: "a direct notification the day before it's due can go out…
   recurring monthly the day before the due date (the last day of the month is
   the due date)."

   ⚠️ FIRES ON THE SECOND-TO-LAST DAY OF WHATEVER MONTH IT IS, worked out from
   the calendar rather than from a fixed date. February, a 30-day month and a
   31-day month all land correctly and nothing needs a special case — the same
   reason monthWindow computes rather than stores.

   ⚠️ IT ASKS THE SAME FUNCTION THE SCREEN ASKS. goalsOwed decides who owes one,
   so a person cannot be messaged about a goal the Hub is not showing them, or
   left alone about one it is. A second rule here is how a nudge starts arriving
   for work somebody already did.

   ⚠️ ONLY PEOPLE WHO STILL OWE ONE. Approved clears it; pending and returned do
   not, which is Bri's rule verbatim.

   ⚠️ PUSH FIRST, SLACK AS BACKUP, same as the weekly report — about 40% of the
   store has alerts on, so push-only would silently reach fewer than half. */
async function runGoalDueReminders(env) {
  const now = nowET();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (now.getDate() !== daysInMonth - 1) return { ran: false, why: "not the day before the due date" };

  const [subs, dir] = await Promise.all([
    sbGet(env, GOAL_SUB_KEY).catch(() => null),
    sbGet(env, "gc-team-directory-v1").catch(() => null),
  ]);
  const teams = (dir && Array.isArray(dir.teams)) ? dir.teams : [];
  if (!subs || !teams.length) return { ran: true, told: 0, why: "no submissions config or no teams" };

  /* Every AD who leads a team, from the same rows goalsOwed reads. */
  const leads = [];
  for (const t of teams) {
    for (const p of (Array.isArray(t.people) ? t.people : [])) {
      if (p && p.tier === "ad" && p.hrId != null && String(p.hrId) !== ""
        && !leads.some((x) => bareId(x.id) === bareId(p.hrId))) {
        leads.push({ id: String(p.hrId), name: p.name || "" });
      }
    }
  }

  let told = 0;
  const names = [];
  for (const ad of leads) {
    const owed = goalsOwed(subs, teams, { id: ad.id }, now);
    if (!owed.owed) continue;
    const text = `Your team goal is due tomorrow.\n\nOpen Team Goals in the ${STORE.appName} and submit it under Submissions.`;
    /* ⚠️ TWO CHANNELS, SO A MISS IS ONLY A MISS WHEN BOTH FAIL. Roughly 40 of
       106 people have push on; for everyone else `pushToPerson` returns
       {sent: 0} without erroring, which is not a failure. Logging the Slack arm
       on its own would file a false alarm every time somebody with push on had
       no Slack id — and a recovery log people learn to ignore is worse than
       none. */
    let reached = false;
    try {
      const r = await pushToPerson(env, ad.name, { title: "Team goal due tomorrow", body: text }, ad.id);
      reached = !!(r && r.sent > 0);
    } catch { /* push is best effort; the Slack arm below is the fallback */ }
    try {
      const uid = await slackIdForName(env, ad.name);
      if (uid) { await sendSlackDM(env, uid, text); reached = true; }
    } catch { /* one failed DM must not stop the rest */ }
    if (!reached) {
      await logJobNotifyFailure(env, `${ad.name} was not told their team goal is due tomorrow`,
        new Error("no push subscription and no Slack DM"));
    }
    told += 1; names.push(ad.name);
  }
  return { ran: true, ads: leads.length, told, names };
}

async function runPgReminders(env) {
  const idx = (await sbGet(env, PG_INDEX_KEY)) || [];
  if (!Array.isArray(idx) || !idx.length) return { checked: 0, sent: 0 };

  const cfg = (await sbGet(env, PG_CONFIG_KEY)) || {};
  /* Read once, outside the per-applicant loop — the list is the same for
     everybody and this job already does one fetch per application. */
  const rawSlots = await sbGet(env, PG_SLOTS_KEY).catch(() => null);
  const interviewSlots = Array.isArray(rawSlots) ? rawSlots : [];
  const avatars = (await sbGet(env, "hr:slack-avatars:v1")) || {};
  const idByName = avatars.idByName || {};
  const today = isoOfD(nowET());
  const dayOf = (d) => isoOfD(new Date(d));

  let sent = 0, noSlackId = 0, changed = false;
  const out = [];

  for (const row of idx) {
    const app = await sbGet(env, pgAppKey(row.role, row.slug));
    if (!app || app.status === "submitted") { out.push(row); continue; }

    const label = PG_ROLE_LABEL[row.role] || row.role;
    const due = ((cfg.due || {})[row.role]) || null;
    const reminded = { ...(row.reminded || {}) };
    const send = async (name, text, tag) => {
      if (reminded[tag]) return;
      const uid = slackIdFor(name, idByName, avatars.idByShort);
      if (!uid) { noSlackId++; reminded[tag] = "no-slack-id"; changed = true; return; }
      try {
        const r = await sendSlack(env, uid, text);
        const j = await r.json();
        if (j && j.ok) { sent++; reminded[tag] = today; changed = true; }
        /* 🐛 THIS ARM HAD NO HANDLING AT ALL, and it is the one that actually
           fires. Slack refuses a message with HTTP 200 and {ok:false} — the
           reason sendSlackDM exists — so a refusal fell straight through this
           `if` without throwing, without a console line, and without being
           counted. The catch below was only ever reachable for a network
           error. See the ★★ note on sendSlackDM. */
        else await logJobNotifyFailure(env, `Reminder to ${name} was refused by Slack`,
          new Error((j && j.error) || `http ${r.status}`));
      } catch (e) { /* one failed DM must not stop the rest — but it IS recorded */
        await logJobNotifyFailure(env, `Reminder to ${name} did not send`, e);
      }
    };

    // ── leaders asked for a recommendation ──
    for (const sd of Object.values(app.steps || {})) {
      for (const rc of (sd.recs || [])) {
        if (!rc || rc.status === "completed" || !rc.leaderName) continue;
        const tag = `rec:${normName(rc.leaderName)}`;
        if (due) {
          // 2 days BEFORE the due date
          if (dayOf(new Date(due).getTime() - 2 * DAY_MS) === today) {
            await send(rc.leaderName,
              `Reminder: ${row.name} is waiting on your ${label} recommendation, and it's due ${due}.\n\nOpen Professional Growth in the ${STORE.appName} to write it.`, tag);
          }
        } else if (rc.requestedAt) {
          // 2 days AFTER the request
          if (dayOf(new Date(rc.requestedAt).getTime() + 2 * DAY_MS) === today) {
            await send(rc.leaderName,
              `Just a nudge — ${row.name} asked you for a ${label} recommendation a couple of days ago.\n\nOpen Professional Growth in the ${STORE.appName} to write it.`, tag);
          }
        }
      }
    }

    // ── applicants still missing pieces, 2 days before the due date ──
    if (due && dayOf(new Date(due).getTime() - 2 * DAY_MS) === today) {
      await send(row.name,
        `Your ${label} application is due ${due} and it isn't finished yet.\n\nOpen Professional Growth in the ${STORE.appName} to complete the remaining steps.`,
        "applicant");
    }

    /* ── interview tomorrow ──────────────────────────────────────────────
       Bri asked for reminders alongside the scheduling. This is the one that
       earns its place: a booking made three weeks ago is exactly the kind of
       thing somebody forgets, and a missed interview costs two people an hour.
       ⚠️ THE SLOT LIST IS THE ONLY SOURCE. A cancelled slot has no `booked`, so
       nobody is reminded about a time that was released — which would be worse
       than saying nothing.
       ⚠️ ONE TAG PER SLOT, so the once-only guard in send() is per booking
       rather than per person; somebody who books, cancels and rebooks still
       gets told about the new time. */
    for (const s of interviewSlots) {
      if (!s || !s.booked || !s.at) continue;
      if (String(s.booked.slug) !== String(row.slug)) continue;
      const when = new Date(s.at);
      if (isNaN(when)) continue;
      if (dayOf(when.getTime() - DAY_MS) !== today) continue;
      await send(row.name,
        `Reminder: your ${label} interview is tomorrow, ${s.at}${s.mins ? ` (${s.mins} min)` : ""}.`,
        `interview:${s.id}`);
    }

    out.push({ ...row, reminded });
  }

  /* ⚠️⚠️ A DRY RUN MUST NOT CONSUME THE ONCE-ONLY FLAG (Aug 9 2026 sweep).
     🐛 `sendSlack` returns a FAKE success object when env.__QUIET is set — that
     is how quiet mode works — so `j.ok` reads true inside send() and every
     nudge above stamps `reminded[tag] = today`. Writing that here retires the
     tag permanently: send() opens with `if (reminded[tag]) return`, so the real
     run finds the leader already reminded and stays silent. The recommendation
     stops being chased and the applicant's file just sits there.
     CLAUDE.md tells Matt to add &quiet=1 to any manual /api/run-job test, so the
     DOCUMENTED safe way to test this job was the way that broke it — the third
     job in this file with that exact shape. See runEvalDueReminders below. */
  if (env && env.__QUIET) {
    return { quiet: true, checked: idx.length, wouldSend: sent, noSlackId, date: today, note: "reminded stamps NOT written" };
  }
  if (changed) await sbSet(env, PG_INDEX_KEY, out);
  return { checked: idx.length, sent, noSlackId, date: today };
}

/* ⚠️⚠️ WHETHER THIS STORE CAN SEND A SLACK DM AT ALL, SAID OUT LOUD.
   `dmPerson` exists at some stores and not others — Guilford and the spare
   template have the Hub's own push and no Slack helper — and worker.js travels
   to every one of them. A `typeof dmPerson === "function"` guard reads as
   careful and is not: the scope check cannot see through it, so it reports an
   undefined name in exactly the repos where the name really is undefined, and
   the honest answer is to stop pretending the two stores are the same file.
   ⇒ ONE LINE PER STORE, VISIBLE IN A DIFF. A store with Slack points this at
   its sender; a store without leaves it null and the chase reaches people
   through the Hub's own push, which every store has.
   ⚠️ NOT A FALLBACK CHAIN. The push is tried first everywhere and Slack is the
   second arm, so null here costs the people who have no device registered and
   nobody else. */
const chaseDm = null;

/* ══════════════════════════════════════════════════════════════════════════
   doc-chase — ONE REMINDER, TWO DAYS LATER, TO ANYONE WHO HAS NOT SIGNED.

   Bri, Aug 14 2026: "Please alert from SOP when docs are sent to sign and send
   a second notification after 2 days for any sent that are not signed." The
   first alert already goes out at send time. This is the second one.

   ⚠️⚠️ ONE CHASE PER SEND, NOT ONE PER DAY. `chasedAt` is stamped on the record
   and a stamped record is skipped forever after. A daily job over an unsigned
   pile is how a reminder becomes noise people mute, and a muted reminder is
   worse than none because everyone believes it is working.

   ⚠️⚠️ A REFUSED READ MUST NOT LOOK LIKE AN EMPTY ONE. `sbGet` answers null for
   "no key" and for "Supabase said no" alike, and treating a refusal as "nothing
   outstanding" means this job reports a clean run on the day it is blindest.
   `sbGetStrict` throws instead, and the throw aborts before anything is
   stamped — so nothing is marked chased that was never chased.

   ⚠️ IT WRITES THE STAMPS ONCE, AT THE END, AND ONLY IF SOMETHING WAS SENT. A
   write per person would mean a mid-run failure leaves half the people chased
   and the record saying they all were.
   ⚠️ AND IT RE-READS BEFORE WRITING. Somebody may have signed while this ran;
   writing back the list we started with would erase their acknowledgment. Only
   the `chasedAt` field is carried over onto the fresh copy. */
async function runDocChase(env) {
  const sends = await sbGetStrict(env, "gcfcr-hr-docsends-v1");
  const list = Array.isArray(sends) ? sends : [];
  if (!list.length) return { checked: 0, chased: 0, people: 0, noReach: 0 };

  /* ⚠️ THE TWO DECISIONS THAT CAN BE WRONG ARE IN docChase.js, not here.
     Nothing in checks/ can boot a Worker, so a rule written inline is a rule
     nobody can prove. What is left in this function is reading, sending and
     stamping. */
  const due = chaseDue(list, Date.now());
  if (!due.length) return { checked: list.length, chased: 0, people: 0, noReach: 0 };

  /* id -> name, from the roster the Worker can actually read. bareId because
     this store carries two id formats for one person and it is the house bug. */
  const names = new Map();
  try {
    const roster = await sbGet(env, "gcfcr-hr-team-v1");
    if (Array.isArray(roster)) for (const m of roster) {
      if (m && m.id && m.name) names.set(bareId(m.id), String(m.name));
    }
  } catch { /* unreadable roster: push by id alone still reaches a subscriber */ }

  const owedBy = owedByPerson(due);

  let people = 0, noReach = 0;
  for (const [id, titles] of owedBy) {
    const name = names.get(bareId(id)) || "";
    /* ⚠️ ONE SET OF WORDS FOR BOTH ARMS. A push and a Slack DM describing the
       same debt differently is how somebody opens the Hub looking for two
       documents and finds one. */
    const body = chaseBody(titles);
    let reached = false;
    /* ⚠️ EACH ARM IN ITS OWN TRY. A failed DM must not stop the push, and
       neither must stop the other people in this loop. */
    try {
      const r = await pushToPerson(env, name, {
        title: chaseTitle(titles.length),
        body: `${body} Open HR Console and look at your own file.`,
        url: "/",
      }, id);
      if (Number((r && r.sent) || 0) > 0) reached = true;
    } catch { /* reached stays false */ }
    /* ⚠️ THE SECOND ARM, AND ONLY WHERE THERE IS ONE. See chaseDm above.
       Nothing is silently skipped: somebody neither arm reached counts in
       `noReach`, and noReach is what stops the record being stamped chased. */
    if (name && chaseDm) {
      try {
        const r = await chaseDm(env, { name },
          `*${chaseTitle(titles.length)}*\n${titles.map((t) => "• " + t).join("\n")}\nHR Console, your own file.`,
          { title: "Documents to sign" });
        if (r && r.reached) reached = true;
      } catch { /* reached stays false */ }
    }
    if (reached) people++; else noReach++;
  }

  /* ⚠️ NOTHING SENT MEANS NOTHING STAMPED. If every person was unreachable the
     chase has not happened, and marking it done would retire a reminder that
     was never delivered. */
  if (!people) return { checked: list.length, chased: 0, people: 0, noReach };

  const stampAt = new Date().toISOString();
  const chasedIds = new Set(due.map((r) => String(r.id)));
  const fresh = await sbGetStrict(env, "gcfcr-hr-docsends-v1");
  if (!Array.isArray(fresh)) return { checked: list.length, chased: 0, people, noReach, stamp: "skipped" };
  await sbSet(env, "gcfcr-hr-docsends-v1",
    fresh.map((r) => (r && chasedIds.has(String(r.id)) ? { ...r, chasedAt: stampAt } : r)));
  return { checked: list.length, chased: due.length, people, noReach };
}

async function runEvalDueReminders(env) {
  const tasks = (await sbGet(env, EVAL_TASK_KEY)) || [];
  if (!Array.isArray(tasks) || !tasks.length) return { checked: 0, sent: 0, noSlackId: 0 };

  // "Tomorrow" in ET, as a YYYY-MM-DD string — task dueDate is a date input.
  const et = nowET();
  const tomorrow = new Date(et.getFullYear(), et.getMonth(), et.getDate() + 1);
  const pad = (n) => String(n).padStart(2, "0");
  const target = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;

  const avatars = (await sbGet(env, "hr:slack-avatars:v1")) || {};
  const idByName = avatars.idByName || {};

  const due = tasks.filter((t) => t && t.dueDate === target
    && (t.status === "open" || t.status === "returned") && !t.remindedAt);

  // One DM per assignee listing everything they owe, not one DM per person
  // being evaluated — five separate pings for five evaluations is noise.
  const byAssignee = {};
  for (const t of due) {
    const k = t.assigneeName || "";
    (byAssignee[k] = byAssignee[k] || []).push(t);
  }

  let sent = 0, noSlackId = 0;
  const remindedIds = new Set();
  for (const [name, list] of Object.entries(byAssignee)) {
    const uid = slackIdFor(name, idByName, avatars.idByShort);
    if (!uid) { noSlackId += list.length; continue; }
    const lines = list.map((t) => `• ${t.subjectName} — ${t.templateName}`).join("\n");
    /* ⚠️ THE ASK FIRST, THE FILLER GONE. CLAUDE.md, from Matt: "hannah needs
       her dms to be simple and concise. she hates reading" — and she is the
       measure for every automated message, not a special case.
       This opened with "Reminder:", which is a word that tells nobody
       anything, and closed with "Open HR Console in the Hub and you'll see it
       at the top" — twelve words for four. What she has to do and who it is
       about now land in the first line. */
    const text = list.length === 1
      ? `*Evaluation due tomorrow: ${list[0].subjectName}*\nTop of HR Console.`
      : `*${list.length} evaluations due tomorrow*\n${lines}\nTop of HR Console.`;
    try {
      const r = await sendSlack(env, uid, text);
      const j = await r.json();
      if (j && j.ok) { sent++; list.forEach((t) => remindedIds.add(t.id)); }
      /* 🐛 SAME MISSING ARM as the reminder job above: a Slack refusal arrives
         as HTTP 200 with {ok:false} and fell through this `if` silently. The
         ids are deliberately NOT added to remindedIds on a failure, so the job
         will try this person again tomorrow rather than marking them told. */
      else await logJobNotifyFailure(env, `Evaluation reminder to ${name} was refused by Slack`,
        new Error((j && j.error) || `http ${r.status}`));
    } catch (e) { /* a failed DM must not abort the rest — but it IS recorded */
      await logJobNotifyFailure(env, `Evaluation reminder to ${name} did not send`, e);
    }
  }

  if (remindedIds.size) {
    const stamp = new Date().toISOString();
    /* ⚠️⚠️ A DRY RUN MUST NOT CONSUME THE ONCE-ONLY FLAG (Aug 7 2026 sweep).
       🐛 sendSlack returns a FAKE success object when env.__QUIET is set — that
       is how quiet mode works — so `j.ok` read true, every due task got a
       remindedAt stamp, and this job's own filter (`&& !t.remindedAt`) then
       excluded them permanently. The real 8:15am run found nothing due. Every
       leader with an evaluation due tomorrow was marked as already told, and
       the EOS "evals on time" row dropped with no trace of why.
       CLAUDE.md tells Matt to add &quiet=1 to any manual run-job test, so the
       DOCUMENTED safe way to test this job was the way that broke it.
       ⚠️ THIS FILE ALREADY KNEW THE RULE, TWICE: monthlyAlreadySent says "A DRY
       RUN MUST NOT CONSUME THE ONCE-ONLY FLAG", and runGapCheck returns early
       on quiet before its state write. This job never got it. */
    if (env && env.__QUIET) {
      return { quiet: true, wouldRemind: remindedIds.size, sent, note: "remindedAt NOT written" };
    }
    await sbSet(env, EVAL_TASK_KEY, tasks.map((t) => (remindedIds.has(t.id) ? { ...t, remindedAt: stamp } : t)));
  }
  return { checked: tasks.length, due: due.length, sent, noSlackId, target };
}

async function runTrainerTasksSummary(env) {
  /* ⚠️ A FORTNIGHT NOW, NOT A WEEK (Matt, Aug 11 2026). The stored shapes are
     untouched: this job's dedup key and its status record both hold the ISO
     date of `start`, which is still a Monday — it is simply every other one. So
     an old record still reads and the first fortnight after the change simply
     does not match the last week's key, and the email sends. Design rule 1. */
  const { start, end } = trainerTasksPeriodBounds(nowET());

  // Live roster: read the same KV key TrainerTasks.jsx writes when someone
  // adds/removes a task in-app, so this job stays in sync with the screen.
  // Falls back to the static import if KV is empty or unreachable — this job
  // must never post an empty checklist just because a read blipped.
  let roster = trainerTaskFallback();
  try {
    const saved = await sbGet(env, TRAINER_TASKS_ROSTER_KEY);
    if (Array.isArray(saved) && saved.length) {
      roster = saved
        .filter((r) => r && r.task && r.trainer)
        .map((r) => ({ task: r.task, trainer: r.trainer }));
    }
  } catch (e) {
    console.error("trainer roster KV read failed, using static roster:", e);
  }

  const rows = await sbListSubmissions(env, "trainer-tasks", start.toISOString());

  const completed = new Set();
  rows.forEach((r) => {
    const ts = new Date(r.submitted_at);
    if (ts < start || ts > end) return;
    const task = r.payload && r.payload.task;
    if (task) completed.add(task);
  });

  const missing = roster.filter((t) => !completed.has(t.task));

  const slackText = missing.length
    // No @channel: each trainer is pushed their OWN outstanding task just
    // below, so this post is the record, not the alarm. Making 35 people
    // scan an eleven-line list for their own name is the thing being fixed.
    ? `*Trainer Weekly Cleaning Checklist — ${missing.length} task(s) still missing this week:*\n${missing
        .map((t) => `• ${t.task} (${t.trainer})`)
        .join("\n")}`
    : `*Trainer Weekly Cleaning Checklist — all tasks submitted this week.* ✅`;
  /* ⚠️ THE CHANNEL POST WAITS FOR MONDAY, THE REST OF THE JOB DOES NOT.
     This runs nightly at 11pm, so it was posting to #guardian-of-the-brand on
     Sunday nights — the store is closed and channel posts wait, which is the
     same ruling that moved the weekly wrap-ups. The Sunday guard existed but
     had only been wired into two jobs; this was the third that needed it.
     ⚠️ GUARDS THE POST, NOT THE JOB. Everything below still runs on a Sunday:
     the status write and the per-trainer pushes. Matt's rule is that a channel
     post waits and a DM is still fine, and skipping the whole job would lose
     the record as well as the noise. */
  if (!isClosedDay()) {
    /* ★ #trainers, not #guardian-of-the-brand (Bri, Aug 11 2026). The list is
       for the people who own the tasks, and it was landing in the food-safety
       channel where most of them are not looking.
       ⚠️ THE PER-TRAINER PUSHES BELOW ARE DELIBERATELY UNCHANGED. Her sentence
       "any task completion/incompletion should be only seen directly through
       this channel" is about where the GROUP post goes. The pushes are the
       thing that actually gets a task done — and they are the fix that made
       0-of-11 trainers reachable in the first place. Removing them to satisfy a
       reading of one sentence would quietly undo that, so they stay and she has
       been told they stay. */
    await postToSlackChannel(env, CH_TRAINERS, slackText);
  }

  /* ★ PUSH EACH TRAINER THEIR OWN TASK. The job already knows exactly whose
     task is outstanding — that knowledge was being spent on an `@channel` post,
     so everyone got pinged and nobody was actually addressed. A person reading
     an eleven-line list has to find their own name in it; a push says one thing
     and it is theirs.
     ⚠️ The channel post STAYS. Only a handful of people have a live
     subscription, so push is the second channel, not the replacement — and the
     list is also how Tashiana sees the whole picture. */
  const pushed = [];
  for (const t of missing) {
    if (!t.trainer) continue;
    try {
      const r = await pushToPerson(env, t.trainer, {
        title: "Cleaning task still open",
        body: `${t.task} — no photo submitted yet this week.`,
        url: "/",
      });
      if (r && Number(r.sent) > 0) pushed.push(t.trainer);
    } catch { /* one unreachable trainer must not stop the rest */ }
  }

  if (missing.length === 0) {
    const weekKey = isoOfD(start);
    const lastSent = await sbGet(env, TRAINER_TASKS_EMAIL_SENT_KEY);
    if (lastSent !== weekKey) {
      /* ⚠️ STAMP THE GUARD ONLY IF THE EMAIL ACTUALLY WENT. This guard is
         once a WEEK, so stamping it after a refused send means the person
         waiting on the confirmation hears nothing until next Monday, and the
         run reports clean. `sendEmail` alone resolves on a Resend 4xx, so the
         old `await sendEmail(...)` could not tell the difference. */
      /* ⚠️ THIS ADDRESS WAS HARDCODED AND THE SWEEP NEVER LISTED IT — found
         Aug 10 2026 while closing finding 28, by grepping for the four
         addresses rather than trusting the finding's file list. Same fault,
         same blast radius: a second store's weekly cleaning confirmation would
         have emailed a Gate City team member. Routed through recipientFor now,
         so it follows this store's override key and its own-store fallback and
         reaches nobody else. Null means no send. */
      const cleanTo = await recipientFor(env, "cleaning");
      if (cleanTo) await sendEmailOk(
        env,
        cleanTo.to,
        "Cleaning Checklist — 100% Complete ✅",
        `All ${roster.length} cleaning tasks were submitted for the fortnight beginning ${start.toDateString()}.`
      );
      /* ⚠️ AND NOT ON A DRY RUN EITHER (Aug 9 2026 sweep). `sendEmail` now
         honours quiet by returning a fake success, which is right — but that
         means sendEmailOk resolves and this once-a-WEEK guard would stamp on a
         rehearsal. Tashiana would then hear nothing until the following Monday
         and the run would report clean. Quiet mode must cost nothing. */
      if (!(env && env.__QUIET)) await sbSet(env, TRAINER_TASKS_EMAIL_SENT_KEY, weekKey);
    }
  }

  await sbSet(env, TRAINER_TASKS_STATUS_KEY, {
    weekOf: isoOfD(start),
    tasks: roster.map((t) => ({
      task: t.task,
      trainer: t.trainer,
      completed: completed.has(t.task),
    })),
  });

  // Personal overdue nudges — DM each trainer whose task is still outstanding,
  // Thu–Sat only, one message per trainer. Names resolve from the live Slack
  // directory, so add/remove is a trainerTaskRoster.js edit and nothing else.
  // Fully guarded: any failure (e.g. missing users:read scope) is logged and
  // skipped, never touching the channel post / status write above.
  try {
    const dow = nowET().getDay(); // 0=Sun … 4=Thu 5=Fri 6=Sat
    /* ★★ MONDAY IS A HEADS-UP; THU-SAT IS A CHASE (Jul 28 2026).
       Matt: "the trainers should get the weekly nudge."
       Until now the ONLY DM a trainer ever received was Thu-Sat and it opened
       with "isn't submitted yet" — so the first time anyone heard about their
       task, it was already a telling-off, three days in. Completion was
       **1 of 11 the week of Jul 20 and 0 of 11 by Tue Jul 28**; Thursday is far
       too late to be first contact.
       ⇒ Monday sends the same list with the opposite tone. Same loop, same name
       resolution, same guards — only the day gate and the wording change.
       ⚠️ ON MONDAY `missing` IS EVERYONE, because nothing has been submitted
       yet. That is exactly who should get a heads-up, so no second list is
       needed — but it does mean this must never say "still missing" on a
       Monday, which is why the text branches rather than being reused. */
    const trainerMonday = dow === 1;
    if (missing.length && (trainerMonday || (dow >= 4 && dow <= 6))) {
      const byTrainer = {};
      missing.forEach((t) => { (byTrainer[t.trainer] = byTrainer[t.trainer] || []).push(t.task); });
      for (const [trainer, tasks] of Object.entries(byTrainer)) {
        const uid = await slackIdForName(env, trainer);
        if (!uid) { console.error(`trainer DM: no Slack id for "${trainer}"`); continue; }
        const list = tasks.map((x) => `• ${x}`).join("\n");
        const dm = trainerMonday
          ? `Here ${tasks.length > 1 ? "are your weekly cleaning tasks" : "is your weekly cleaning task"} for this week:\n${list}\n\n` +
            `Snap a photo and submit it in the ${STORE.appName} once it's done. You've got all week.`
          : `Reminder — your weekly cleaning ${tasks.length > 1 ? "tasks aren't" : "task isn't"} submitted yet this week:\n${list}\n\n` +
            `Snap a photo and submit it in the ${STORE.appName} when it's done. Thanks!`;
        const res = await sendSlack(env, uid, dm);
        const data = await res.json();
        if (!data.ok) console.error(`trainer DM to ${trainer} (${uid}) failed: ${data.error}`);
      }
    }
  } catch (e) {
    console.error("trainer DM block failed:", e);
  }

  /* ⚠️ REPORT WHO WAS ACTUALLY REACHED. Every push path in this worker returns
     its counts, because a job that says nothing is how the whole notification
     system sat broken for a day. `missing` minus `pushed` is the adoption gap,
     not a failure — those people still get the channel post. */
  return {
    weekOf: isoOfD(start),
    missing: missing.length,
    pushed: pushed.length,
    pushedTo: pushed,
    unreachable: missing.length - pushed.length,
  };
}

/* ═══ PUSH-ADOPTION GAP CHECK → DM BRI ════════════════════════════════
 * Matt, Jul 27: "Anytime there are issues like this with leadership Bri is the
 * point person so verify daily and point her to them."
 *
 * The trigger was a real number: 0 of 11 trainers on the cleaning rota could be
 * reached by push, so every per-person nudge built this week landed on nobody.
 * The nine live subscriptions all belong to LEADERS.
 *
 * ★ THIS EXISTS BECAUSE CLAUDE CANNOT VERIFY DAILY. Claude only runs when Matt
 * is in a session, so a "daily check" by Claude is really a daily check by
 * Matt — the exact task he is trying to hand off. A cron can keep the promise;
 * a habit cannot.
 *
 * ★ IT DMs A PERSON, NOT A CHANNEL. A channel post about eleven people is
 * nobody's job — the same failure the per-person push was built to fix. One
 * list, one owner, her name on it.
 * ★ AND IT STAYS SILENT WHEN THERE IS NOTHING TO SAY. A daily message that
 * usually says "all good" is a daily message people stop reading.
 */
const GAP_CHECK_SENT_KEY = "gcfcr-gapcheck-sent-v1";

async function runGapCheck(env) {
  // The live in-app roster wins; the imported constant is the fallback.
  const roster = (await sbGet(env, TRAINER_TASKS_ROSTER_KEY)) || trainerTaskFallback();
  const subs = (await pushSubsGet(env)) || {};
  const reachable = new Set();
  Object.values(subs).forEach((r) => {
    if (r && r.subscription && r.name) reachable.add(String(r.name).trim().toLowerCase());
  });

  /* `isOwner` is the same strict matcher the board routing uses, so an
     ambiguous first name counts as NOT reachable rather than assumed fine —
     the safe direction: it over-reports, and over-reporting is recoverable. */
  const missing = [];
  for (const t of roster) {
    const nm = String((t && t.trainer) || "").trim();
    if (!nm) continue;
    const hit = [...reachable].some((have) => isBoardOwner(have, { names: [nm] }));
    if (!hit && !missing.includes(nm)) missing.push(nm);
  }

  const result = { checked: roster.length, reachable: reachable.size, missing: missing.length, names: missing };
  if (!missing.length) return { ...result, dm: "nothing to report" };

  /* ⚠️ ONE DM PER DAY AT MOST, and only when the LIST CHANGES. Sending the same
     eleven names every morning is how a useful message becomes noise she
     filters — the thing this job exists to avoid. */
  const stamp = missing.slice().sort().join("|");
  const last = (await sbGet(env, GAP_CHECK_SENT_KEY)) || {};
  if (last.stamp === stamp) return { ...result, dm: "unchanged since last DM" };

  const uid = await notifyTarget(env, "leadership");
  if (!uid) return { ...result, dm: "could not resolve the leadership contact in Slack" };

  /* ⚠️ THE ASK FIRST, THE REASSURANCE GONE. CLAUDE.md's rule is written about
     Hannah but says outright it is the measure for every automated message.
     This was five sentences: a heading, the list, a paragraph explaining WHY
     they cannot be reached, a softener, and a closing italic line telling her
     the job only sends when the list changes.
     ⚠️ THAT LAST LINE WAS FOR ME, NOT FOR HER. "This is automatic and only
     sends when the list changes" reassures the sender that they are not being
     noisy. It gives the reader nothing to do and is exactly what the rule means
     by a line that makes the sender feel thorough.
     ⚠️ THE "why" PARAGRAPH WENT TOO. She does not need the mechanism; she needs
     the names and the one action. */
  const text =
    `*${missing.length} trainers can't get Hub alerts*\n` +
    missing.map((n) => `• ${n}`).join("\n") +
    `\n\nEach one: open the Hub from the home-screen icon, then turn on alerts. Not from Safari.` +
    `\nNext time you have them together is fine.`;

  if (env && env.__QUIET) {
    console.log(`[quiet] would DM the leadership contact:\n${text}`);
    return { ...result, dm: "quiet", wouldSend: text };
  }
  const res = await sendSlack(env, uid, text);
  const data = await res.json();
  if (data.ok) await sbSet(env, GAP_CHECK_SENT_KEY, { stamp, at: new Date().toISOString() });
  return { ...result, dm: data.ok ? "sent" : `failed: ${data.error}` };
}

/* ═══ OPS CHECKLIST RECAP → #operational-success ══════════════════════
 * The register knows whether ops checklists were signed off, but only Matt
 * sees the register. This puts the same answer where the shift can see it.
 *
 * ★ IT NAMES WHAT IS OUTSTANDING, NOT A PERCENTAGE. "84% complete" tells a
 * closing leader nothing they can act on; four named items do.
 * ★ AND IT MIRRORS THE TILE'S OWN RULES — the item key is `areaId:idx`, and an
 * item scoped to another weekday is not counted today at all. Counting items
 * the tile never displayed would report misses nobody could have made.
 * ⚠️ These two rules live in OpsChecklists.jsx as well. If the key shape or the
 * day prefix changes there, this job silently miscounts — the same coupling
 * class as CLEAN_BUCKETS and the leader-station regexes.
 */
const OPS_DAY_MAP = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
const OPS_DAY_RE = /^(sun|mon|tues|tue|thurs|thur|thu|wed|fri|sat)\s*[\u2014\u2013-]\s*/i;
const OPS_SHIFT_RE = /^(opener|midday|closing)\s*[\u2014\u2013-]\s*/i;

function opsParseItem(raw) {
  if (raw && typeof raw === "object") {
    return {
      text: String(raw.text || ""),
      day: raw.day == null ? null : raw.day,
      shift: raw.shift ? String(raw.shift).toLowerCase() : null,
    };
  }
  let t = String(raw || "");
  let day = null;
  let shift = null;
  const dm = t.match(OPS_DAY_RE);
  if (dm) { day = OPS_DAY_MAP[dm[1].toLowerCase()]; t = t.slice(dm[0].length); }
  const sm = t.match(OPS_SHIFT_RE);
  /* ★ THE SHIFT TAG IS NOW KEPT, NOT THROWN AWAY. It was being parsed off the
     front of the label purely to clean up the text, and discarded — which is
     why this job could only ever shout at the whole channel. "Opener — wipe
     the line" already says who owns it; that one word is the difference
     between 35 pings and one person being told. */
  if (sm) { shift = sm[1].toLowerCase(); t = t.slice(sm[0].length); }
  return { text: t, day, shift };
}

/* Which board names own a shift-tagged checklist item.
   opener → the breakfast leaders · closing → the night leaders ·
   midday and anything UNTAGGED → every leader on the board today, because an
   item with no shift genuinely belongs to whoever is on. */
function opsOwnersForShift(shift, s) {
  if (!s) return [];
  /* ⚠️ THE TILE NORMALISES TO "opening", NOT "opener". OpsChecklists.jsx
     parses the "Opener — " prefix through PREFIX_MAP into `opening`, and its
     SHIFTS list is opening/midday/closing. Matching only "opener" sent every
     opening item to `s.all`, i.e. to every leader on the board instead of the
     openers. Both spellings accepted so a legacy stored item still routes. */
  if (shift === "opening" || shift === "opener") return s.opener || [];
  if (shift === "closing") return s.closer || [];
  return s.all || [];
}

async function runOpsChecklistRecap(env) {
  const today = isoOfD(nowET());
  const dow = nowET().getDay();
  /* 🐛 THIS JOB HAS NEVER RUN. Every night it returned
     `{skipped: "no checklist definitions"}` and posted nothing, because it
     read a shape OpsChecklists.jsx has never written. Four separate
     mismatches, all fixed here:

     1. SHAPE. The tile writes `{ sections: { FOH: [area…], BOH: [area…] } }` —
        an OBJECT keyed by house. This did `Array.isArray(sections)` and bailed
        on the very first check, every single run.
     2. A PHANTOM LEVEL. It then looped `sec.areas`. Nothing anywhere writes an
        `areas` key; each house maps STRAIGHT to its array of areas. So even
        past the guard it would have found nothing.
     3. THE LABEL FIELD. Areas carry `title`; this read `area.label || area.id`,
        so Slack would have printed `foh-1753900000000:` instead of
        "10:30 Transition".
     4. THE DONE WRAPPER. The tile saves `{ checked: {...}, updatedAt }`, and
        sbGet does no unwrapping, so every item read as still open.
     Fixing only the guard would have produced a post full of raw ids claiming
     nothing was done — worse than silence. */
  const defs = await sbGet(env, "gcfcr-ops-defs-v2");
  const rawDone = await sbGet(env, `gcfcr-ops-done-${today}-v2`);
  const done = (rawDone && typeof rawDone === "object" && rawDone.checked) ? rawDone.checked : (rawDone || {});
  const byHouse = (defs && defs.sections) || defs || null;
  if (!byHouse || typeof byHouse !== "object") return { skipped: "no checklist definitions" };
  // Each house maps to its array of AREAS. Flatten to one area list.
  const areas = Array.isArray(byHouse) ? byHouse : Object.values(byHouse).flat();
  if (!areas.length) return { skipped: "no checklist definitions" };

  const openByArea = [];
  const openByShift = {};   // shift tag -> ["Area: item", …]
  let total = 0, complete = 0;
  {
    for (const area of areas) {
      if (!area || typeof area !== "object") continue;
      const areaName = area.title || area.label || area.id;
      const open = [];
      (area.items || []).forEach((raw, idx) => {
        const it = opsParseItem(raw);
        if (it.day != null && it.day !== dow) return;   // not on today's list at all
        total++;
        if (done[`${area.id}:${idx}`]) complete++;
        else {
          open.push(it.text);
          // Keep the shift alongside the text so the push below can address
          // the right leader instead of everybody.
          openByShift[it.shift || "any"] = (openByShift[it.shift || "any"] || []).concat(
            `${areaName}: ${it.text}`
          );
        }
      });
      if (open.length) openByArea.push({ area: areaName, open });
    }
  }
  if (!total) return { skipped: "nothing scheduled today" };

  /* ⚠️ NO @channel PING — DELIBERATE (Jul 28 2026).
     This was the last big one: a by-area list fired at all 35 members, when
     every item already carries the shift that owns it. The post STAYS as the
     shared record and the fallback for anyone unreachable; the people who
     actually have to act now get told individually below. */
  /* ★ A SUMMARY, NOT THE WHOLE LIST (Matt, Aug 2 2026: "This is a lot. We need
     a better and cleaner report"). The old post printed EVERY open item — 167
     bullet points on a bad night, a full phone screen of scroll. Nobody reads
     a wall like that, and the people who actually have to act already get
     their own items as individual pushes right below. The channel post is the
     shared RECORD, so it now reads like one: the count, the three areas
     carrying the most open items, and where the full list lives. */
  let text;
  if (openByArea.length) {
    const ranked = [...openByArea].sort((a, b) => b.open.length - a.open.length);
    const top = ranked.slice(0, 3).map((a) => `${a.area} (${a.open.length})`).join(" · ");
    const rest = ranked.slice(3);
    const restItems = rest.reduce((s, a) => s + a.open.length, 0);
    const restNote = rest.length ? ` · +${rest.length} more area${rest.length === 1 ? "" : "s"} (${restItems})` : "";
    text =
      `*Ops Checklists — ${total - complete} of ${total} still open today*\n` +
      `Most open: ${top}${restNote}\n` +
      `_Full lists live in the Hub → Ops Checklists. Leaders on shift get their own items on their phones._`;
  } else {
    text = `*Ops Checklists — all ${total} signed off today.* ✅`;
  }
  await postToSlackChannel(env, CHANNELS.opsSuccess, text);

  /* ── Tell the leader whose shift it is ─────────────────────────────
     Matt's rule: "for the checklist and cleaning lists I want it to assign by
     using the setup." The board already says who is on; boardOwner turns that
     into names. One push per PERSON, not one per item — a leader with four
     open items gets one notification, never four. */
  let pushed = { targeted: 0, sent: 0 };
  try {
    const monday = boardMondayKey(nowET());
    const [foh, boh] = await Promise.all([
      sbGet(env, boardKey("foh", monday)),
      sbGet(env, boardKey("boh", monday)),
    ]);
    const shift = boardShift({ foh: foh || {}, boh: boh || {} }, nowET());

    // person name -> their own open items, deduped
    const perPerson = new Map();
    for (const key of Object.keys(openByShift)) {
      const owners = opsOwnersForShift(key === "any" ? null : key, shift);
      for (const name of owners) {
        const cur = perPerson.get(name) || new Set();
        openByShift[key].forEach((line) => cur.add(line));
        perPerson.set(name, cur);
      }
    }

    for (const [name, items] of perPerson) {
      pushed.targeted++;
      const list = Array.from(items);
      const r = await pushToPerson(env, name, {
        title: list.length === 1 ? "1 checklist item still open" : `${list.length} checklist items still open`,
        body: list.slice(0, 3).join(" · ") + (list.length > 3 ? ` · +${list.length - 3} more` : ""),
        url: "/",
      });
      if (r && (r === true || Number(r.sent) > 0)) pushed.sent++;
    }
  } catch { /* the channel post above already carries it — never fail the job */ }

  return { date: today, total, complete, open: total - complete, areas: openByArea.length, pushed };
}

// ═══════════════════════════════════════════════════════════════════
// JOB 7 — IPO Plan weekly director reminder → Slack #assistant-directors
// Monday ~8am ET. SMART: only posts if THIS week's IPO action items aren't
// all checked off. Reads the same shared key the IPOActionItems component
// writes; checkoffs are one shared team list, not per-director, so the nudge
// is "the list isn't done," not personal.
//
// QUARTERLY: the plan (weeks + categories + the storage key) now comes from
// the shared ipoPlan.js — ONE source, imported by IPOActionItems.jsx (screen)
// and App.jsx (pill) too. ipoQuarter(now) derives the current quarter's key
// (rolls per quarter so Q4 doesn't inherit Q3's checkmarks) and week windows.
// itemId convention must match the component: `${catId}-${i}`, i from 0.
// A carried-forward quarter still has cats+items (numbers blanked), so the
// reminder keeps working the quarter it rolls even before you author it.
// ═══════════════════════════════════════════════════════════════════
/* ── PRIVATE CHANNEL IDS, WORKER SIDE ONLY (Aug 10 2026) ──────────────────
   These used to live in storeConfig.js, which SHIPS TO THE BROWSER — so both
   ids were downloadable by anyone with no account (sweep finding 30). Nothing
   in the client ever used them: notify.js re-exports only the three channel
   NAMES, and FoodCostTracker and FoodQuality are its only callers. Verified
   before moving, not assumed.
   ⚠️ IDS, NOT NAMES, BECAUSE BOTH ARE PRIVATE. resolveChannel passes a raw
   C-prefixed id straight through; a name lookup cannot find a private channel.
   ⚠️ ALL PRIVATE CHANNELS NEED THE "Gate City Hub" BOT INVITED or every post
   silently does nothing. As of Aug 9 the bot was NOT in #catering-with-care —
   31 members and no app — so the Kia reminder throws there until it is. */
const CH_DIRECTORS = "C0938FEDF51";   // #assistant-directors
const CH_CATERING  = "C0BDUQSFWMS";   // #catering-with-care (Hannah's)
/* ★ #trainers (Bri's), added Aug 11 2026 at her ask: "Discontinue messaging
   incomplete Trainer tasks to the current group and remove it from the Morning
   Ops Digest — please move it to @trainers instead."
   ⚠️ THE ID LIVES HERE AND NOT IN storeConfig.js, deliberately. That file ships
   in the browser bundle, and its own comment records the cost: a private
   channel id was put there on Aug 9 for Hannah's catering channel and widened
   finding 30 before a bundle scan caught it. Worker code is never served to a
   browser, which is why the two ids above are here too.
   ⚠️ resolveChannel passes a raw C-id straight through, so no name lookup is
   involved — which matters because a private channel cannot be found by name.
   ⚠️ Bri invited the bot on Aug 11 at 2:29pm. If it is ever removed, this post
   fails loudly (postToSlackChannel throws) rather than silently. */
const CH_TRAINERS  = "C0BL0EH0BSA";   // #trainers (Bri's)
const IPO_DIRECTORS_CHANNEL = CH_DIRECTORS;
/* Where the team actually reads. Matt, Jul 27: the point system announcement
   "went to #general instead of #gate-city-team, which is where the team
   actually reads", and he had it reposted. ⚠️ PRIVATE, so the "Gate City Hub"
   bot has to be invited or the post fails silently — the same requirement every
   other channel in this file carries. */
const TEAM_CHANNEL = CHANNELS.team;

/* ═══════════════════════════════════════════════════════════════════
   SUPPLY ORDER + SIGN-OUT REMINDER → Slack #inventory-management, plus a
   push to whoever holds the seat. Matt, Jul 29: "biweekly reminder to do a
   supply order so this is resolved."

   ⚠️ IT ONLY SPEAKS WHEN THE WORK IS ACTUALLY OVERDUE. Cron cadence and
   reminder cadence are deliberately NOT the same thing. Run it as often as
   you like; it stays silent unless nothing has been signed out in 14 days.
   A reminder that fires on a schedule regardless of state is one people
   learn to swipe away, and this store already has enough of those.

   ⚠️ SUPPLY_STALE_DAYS = 14 IS COPIED FROM inputRegistry.js ON PURPOSE and
   must move with it. The dashboard row and this reminder answer the SAME
   question — "is a supply order overdue?" — and two numbers would let the
   Hub say overdue while Slack stays quiet. The worker cannot import that
   file (it pulls in React), so this is a stated duplicate, not an accident.

   ⚠️ NOTHING HAS EVER BEEN RECORDED AS OF Jul 29 2026. gcfcr-signout-v1
   does not exist in the store, which is why the dashboard has always said
   "No supply order or sign-out recorded yet". That is the ONE case worth
   wording differently: "you have never used this" is a different problem
   from "you are late this cycle", and a reminder that confuses the two
   sends people looking for a lapse that never happened.
   ═══════════════════════════════════════════════════════════════════ */
const SUPPLY_SIGNOUT_KEY = "gcfcr-signout-v1";
const SUPPLY_STALE_DAYS = 14;          // ⚠️ keep in step with inputRegistry.js
const SUPPLY_CHANNEL = CHANNELS.inventory;

/* Roster ids holding a given seed title, overrides applied. Used instead of a
   hardcoded id so that changing someone's role in HR actually re-routes the
   reminder — the "people are hardcoded into automations" trap that survives
   every termination otherwise. */
async function idsWithTitle(env, title) {
  const [roles, added] = await Promise.all([
    sbGet(env, "gcfcr-hr-roles").catch(() => null),
    sbGet(env, HR_ADDED_KEY).catch(() => null),
  ]);
  const addedArr = Array.isArray(added) ? added : [];
  const ids = new Set([...Object.keys(HR_SEED_ROLES), ...Object.keys(roles || {}), ...addedArr.map((m) => m && String(m.id))]);
  const out = [];
  ids.forEach((id) => { if (id && hrTitleFor(id, roles || {}, addedArr) === title) out.push(String(id)); });
  return out;
}

/* ── THE KIA, ONCE A MONTH ────────────────────────────────────────────────
   Hannah, Slack DM Aug 9 2026: "Please send a reminder in the cares with
   catering channel on the last business day of the month (we are open every
   day but Sundays) to post a picture of the mileage in the Kia and to post the
   oil change status. Make sure to use the @ channel feature. Post this reminder
   at 9am on those days."

   ⚠️ THE JOB KNOWS ITS OWN CADENCE, the cron does not decide it. Same rule the
   Sunday guard above was rewritten to follow: cron-job.org fires this at 9am ET
   EVERY day and the job itself decides whether today is the day. A
   schedule-only version would be one mis-click away from posting on the wrong
   date, and "last business day" is not a cron expression anyway — it moves
   every month.
   ⚠️ "LAST BUSINESS DAY" HERE MEANS THE LAST NON-SUNDAY, which is Hannah's own
   definition, in her own words, and matches the store being open six days.
   Walking backwards handles the case a month ends ON a Sunday (Aug 2026 ends
   Monday the 31st; Nov 2026 ends Monday; but e.g. Feb 2026 ends Saturday).
   ⚠️ Answers ok when it skips, so cron-job.org sees a healthy call on the other
   ~29 days instead of retrying and mailing Matt. */
function lastBusinessDayOfMonth(d) {
  const y = d.getFullYear(), m = d.getMonth();
  let day = new Date(y, m + 1, 0).getDate();          // last calendar day
  while (new Date(y, m, day).getDay() === 0) day -= 1; // step back off Sunday
  return day;
}
/* ═══ RETENTION: THE ONLY JOB IN THE HUB THAT DESTROYS RECORDS ═════════════
   Matt, Aug 13 2026: "build the retention job."

   ⚠️⚠️ THE SETTING EXISTED FOR HOURS AND DID NOTHING. Store Settings has had
   three "how long messages are kept" boxes since part 1 of messaging shipped,
   and `purgeableOn` was written the same day — with NOTHING calling it. A store
   could type 90 into that box and keep everything forever. A setting that lies
   is worse than a missing one, because somebody believes it.

   ⚠️⚠️ EVERY UNCERTAIN CASE KEEPS THE RECORD. A wrongly kept record is a
   tidiness problem; a wrongly deleted one is gone, and this app holds the
   messages ~106 people sent each other. So: an unreadable list refuses and
   writes nothing, a blank or zero or negative setting purges nothing, a missing
   or malformed date keeps its record, and a run that finds nothing to remove
   does not write at all.

   ⚠️ IT NEVER WRITES A LIST IT DID NOT FULLY READ. `sbGetStrict` per key, and a
   null read for one key skips THAT key and still lets the other two run — the
   rollouts-tile wipe was exactly "treat a failed read as an empty list and
   write on top of it", and here that would erase every message in the store.

   ⚠️ THREE KEYS AND NO OTHERS. It cannot be pointed at anything else, there is
   no key parameter, and the list is written out here rather than derived. */
const RETENTION_TARGETS = ["announcements", "shiftThreads", "escalations"];

async function runRetentionPurge(env, opts) {
  const dry = !!(opts && opts.dry);
  const now = new Date();

  /* The store's own numbers, falling back to the shared defaults. Blank means
     what each default says: indefinite for announcements and threads, 365 for
     escalations. `storeBrand` is the Worker's live read of saved settings but
     carries only brand fields, so this reads the record directly. */
  let saved = null;
  try {
    const rec = await sbGetStrict(env, STORE_CONFIG_KEY);
    saved = rec && typeof rec === "object" && !Array.isArray(rec) ? rec.settings : null;
  } catch {
    /* ⛔⛔ A REFUSED READ IS NOT "no saved settings", AND THIS IS THE ONE JOB
       IN THE HUB THAT DESTROYS RECORDS. `sbGetStrict` returns null when the key
       genuinely is not there and THROWS when the read was refused; catching
       both here collapsed them, so a dropped read fell back to the built-in
       numbers and purged on them. A store that typed 3650 days for escalations
       would have had years 1 to 10 deleted that night, on a schedule, silently,
       and the run would have stamped ok.
       ⇒ Absent still means "nobody has typed a number", which is a real answer
       and still gets the defaults. Refused means we do not know this store's
       policy, and you cannot delete on a policy you could not read.

       ⚠️⚠️ IT THROWS RATHER THAN RETURNING AN ERROR OBJECT, for the reason
       written at `runBackup` in this same file: the dispatcher wraps whatever a
       job RETURNS in `ok: true`, so an error object here would stamp a good
       run, move the heartbeat, and report healthy on the night it deleted
       nothing. A throw is the only thing the monitoring can see. */
    throw new Error("could not read this store's retention settings; refusing to delete anything on default numbers");
  }
  const savedRet = (saved && typeof saved.retention === "object" && saved.retention) || {};
  const daysFor = (name) => {
    const raw = savedRet[name];
    /* ⚠️ THE BOX IS A TEXT FIELD, so "90" arrives as a string and "" as blank.
       Blank falls back to the default; anything unparseable purges nothing. */
    if (raw === undefined || raw === null || String(raw).trim() === "") {
      return RETENTION_DEFAULT_DAYS[name];
    }
    const n = Number(String(raw).trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const out = { dry, removed: {}, kept: {}, days: {}, skipped: {} };

  for (const name of RETENTION_TARGETS) {
    const days = daysFor(name);
    out.days[name] = days === null || days === undefined ? "kept indefinitely" : days;
    if (!Number.isFinite(Number(days)) || Number(days) <= 0) {
      out.removed[name] = 0; out.kept[name] = null; out.skipped[name] = "retention off";
      continue;
    }

    const key = name === "announcements" ? ANNOUNCE_KEY
      : name === "shiftThreads" ? THREADS_KEY : ESCALATIONS_KEY;

    let raw = null;
    try { raw = await sbGetStrict(env, key); } catch { raw = null; }
    if (raw === null) {
      out.removed[name] = 0; out.kept[name] = null;
      out.skipped[name] = "could not read it, so nothing was touched";
      continue;
    }

    if (name === "shiftThreads") {
      /* A MAP keyed by request id, not an array — one entry per request. Age is
         the NEWEST post (shiftThreads.lastPostAt), never the oldest, or a
         conversation people are still having gets deleted for being old. */
      const all = thrRead(raw);
      const next = {}; let removed = 0;
      for (const rid of Object.keys(all)) {
        if (purgeableOn(thrLastPostAt(all[rid]), days, now)) removed += 1;
        else next[rid] = all[rid];
      }
      out.removed[name] = removed;
      out.kept[name] = Object.keys(next).length;
      if (removed && !dry) await sbSet(env, key, next);
      continue;
    }

    /* Announcements and escalations are both arrays; only the date field
       differs, and the CALLER names it rather than purgeableOn guessing. */
    const list = name === "announcements" ? annList(raw) : escList(raw);
    const whenOf = name === "announcements" ? (r) => r && r.createdAt : (r) => r && r.at;
    const next = list.filter((r) => !purgeableOn(whenOf(r), days, now));
    out.removed[name] = list.length - next.length;
    out.kept[name] = next.length;
    /* ⚠️ NOTHING TO REMOVE MEANS NO WRITE AT ALL. A weekly rewrite of an
       unchanged list is a chance to lose it for no benefit. */
    if (out.removed[name] && !dry) await sbSet(env, key, next);
  }

  out.totalRemoved = RETENTION_TARGETS.reduce((n, k) => n + (out.removed[k] || 0), 0);
  return out;
}

async function runKiaMileageReminder(env) {
  const now = nowET();
  const target = lastBusinessDayOfMonth(now);
  if (now.getDate() !== target) {
    return { skipped: "not the last business day", today: isoOfD(now), posts_on: target };
  }
  await postToSlackChannel(env, CH_CATERING,
    `*End of the month — two things for the Kia*\n` +
    `• A photo of the current mileage\n` +
    `• The oil change status\n\n` +
    `<!channel>`);
  return { posted: true, on: isoOfD(now) };
}

async function runSupplyReminder(env) {
  const today = isoOfD(nowET());
  const log = await sbGet(env, SUPPLY_SIGNOUT_KEY).catch(() => null);

  let last = null;
  if (Array.isArray(log)) {
    for (const e of log) {
      const iso = e && typeof e.at === "string" ? e.at.slice(0, 10) : null;
      if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) && (!last || iso > last)) last = iso;
    }
  }

  const days = last ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${last}T12:00:00Z`)) / 86400000) : null;
  /* ⚠️ A MALFORMED OR EMPTY LOG IS "NEVER", NOT "TODAY". Reading an
     unparseable log as current would silence the one store that most needs
     telling — failing toward quiet is the same shape as the turnover row
     failing toward zero. */
  if (last && days < SUPPLY_STALE_DAYS) return { skipped: "current", last, days };

  const text = last
    ? `*Supply order + sign-out is due*\n` +
      `Nothing has been signed out in ${days} days. Last was ${last}.\n` +
      `Place the order and record the sign-out in the Hub → Supply Central.`
    : `*Supply order + sign-out has never been recorded*\n` +
      `Supply Central has no sign-out log at all, so the dashboard cannot tell whether an order is overdue.\n` +
      `Recording one order in the Hub → Supply Central starts the ${SUPPLY_STALE_DAYS}-day clock and this reminder goes quiet until it is due again.`;

  await postToSlackChannel(env, SUPPLY_CHANNEL, text);

  /* Push as well as Slack — Matt, Jul 29: "that's the purpose of the push
     notifications, for as much as possible." Slack is the record, push is
     what actually reaches a phone. A push failure must never fail the job:
     the Slack post has already landed and IS the reminder. */
  let pushed = 0;
  try {
    const ids = await idsWithTitle(env, "Executive Director");
    for (const uid of ids) {
      const r = await pushToUid(env, uid, {
        title: "Supply order due",
        body: last ? `Nothing signed out in ${days} days.` : "No supply order has ever been recorded.",
        tag: "supply-reminder",
      });
      pushed += (r && r.sent) || 0;
    }
  } catch (e) { console.error("supply reminder push failed:", e); }

  return { posted: true, last, days, never: !last, pushed };
}

/* ═══════════════════════════════════════════════════════════════════
   DAILY SECURITY SWEEP — Hub data exposure. Matt, Jul 29 2026.

   ⚠️ IT TESTS FROM THE OUTSIDE, WITH THE PUBLIC KEY, AND THAT IS THE WHOLE
   POINT. Reading the policy definitions would only tell us what the rules SAY.
   This asks Supabase the same question a stranger's browser would ask, using the
   same publishable key that ships inside the bundle at gatecityhub.com, and
   reports what actually comes back. Every finding here is reproducible by anyone
   with the site open.

   🐛 WHY IT EXISTS. On Jul 29 `gcfcr-hr-pins` was found publicly readable — 106
   PINs, 83 of them plaintext. It was on FOUR protection lists (store.js
   HR_PROTECTED, the Worker's HR_PROTECTED, the Worker's own-row-only filter,
   and the client's routing) and missing from the ONE that stops a direct read.
   Being on four lists out of five reads as protected right up until somebody
   checks. Nothing was going to check on its own. Now something does, daily.

   ⚠️ SILENT WHEN CLEAN. A daily "all good" is a message people stop reading,
   and this one has to be read on the day it finally says something else.

   ⚠️ FINDINGS GO TO ONE PERSON, NOT A CHANNEL. A list of what is currently
   reachable is itself a map for anyone who wants it, and the store's channels
   have the whole leadership team in them.
   ═══════════════════════════════════════════════════════════════════ */
const SEC_STATE_KEY = "gcfcr-security-sweep-v1";
/* Findings go to Matt directly. NOT a channel: a list of what is currently
   reachable is a map for anyone who wants one, and every ops channel here has
   the whole leadership team in it. Same hardcoded-Slack-id shape as ADOPT_TO
   above, and the same caveat — if the owner seat ever changes hands this is one
   of the places that does not follow automatically. */
/* ═══ WHO GETS AN ALERT — BY NAME, NOT BY SLACK ID ═════════════════════════
   🐛 THE CLONE HOLE (Aug 7 2026 sweep, finding 8). Recipients were raw Slack
   user ids typed into this file. A second store running this code would DM
   Gate City's leaders their waste totals, security findings and adoption
   reports — or, if those ids did not resolve in the other workspace, send
   nothing at all while the store believed the automation was running. Silent
   either way, and the second failure is the worse one.

   ⚠️ NAMES, NOT JOB TITLES, AND THAT WAS A DELIBERATE SECOND CHOICE. Keying on
   a title looked cleaner and is not safe here: "Executive Director" resolves to
   TWO people in this roster, and the security sweep lands on Matt today only
   because Kyleeka is deliberately outside HR Console. That is luck, not a rule,
   and the security sweep is the last DM that should be decided by list order.

   ⚠️ KEYED ON THE STANDING ROLE, NOT ON ONE JOB, because each already serves
   several: `owner` takes the Sunday cut report, the waste input check and the
   security sweep. Naming them per job would mean six keys pointing at three
   people and six places to change when somebody moves seat.

   ⚠️ RESOLVED THROUGH slackIdForName, WHICH READS THE STORE'S OWN SLACK, so a
   clone changes these in one KV record with no deploy.
   ⚠️ NO FALLBACK TO A HARDCODED ID. An unresolved name means the DM is skipped
   and the job says so. Falling back to Gate City's id is the exact bug being
   fixed, and a wrong recipient for a security finding is worse than none. */
const NOTIFY_TARGETS_KEY = "gcfcr-notify-targets-v1";

/* ★ {{key}} IN MESSAGE TEXT BECOMES A REAL @-MENTION, RESOLVED HERE.
   A tile cannot turn a person into a mention without knowing their Slack id,
   and an id in a tile is the whole problem this pass exists to remove. So the
   tile writes {{boh}} and this turns it into <@U…>.

   ⚠️ AN UNRESOLVED KEY BECOMES THE PLAIN NAME, NEVER THE RAW {{boh}}. Slack
   would render the braces literally in front of the whole channel. The name
   without a ping is a worse message; the braces are a broken one.
   ⚠️ AN UNKNOWN KEY IS LEFT ALONE rather than blanked, so a typo is visible in
   testing instead of silently deleting part of a post. */
async function expandMentions(env, text) {
  const s = String(text == null ? "" : text);
  if (!s.includes("{{")) return s;
  const keys = [...new Set([...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];
  let out = s;
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(NOTIFY_DEFAULTS, k)) continue;
    const uid = await notifyTarget(env, k);
    const cfg = (await sbGet(env, NOTIFY_TARGETS_KEY).catch(() => null)) || {};
    const name = String(cfg[k] || NOTIFY_DEFAULTS[k] || "").trim();
    out = out.split(`{{${k}}}`).join(uid ? `<@${uid}>` : name);
  }
  return out;
}

/* A Slack user id, or null. Never throws — a recipient lookup must not be able
   to take a scheduled job down. */
async function notifyTarget(env, key) {
  const name = await notifyName(env, key);
  return name ? await slackIdForName(env, name) : null;
}

/* The NAME half of notifyTarget, for callers that need a person rather than a
   Slack id — pushToPerson takes a roster name, and a Slack id is a different id
   space entirely, so feeding one into the other would match nobody.
   ⚠️ EXISTS SO A STORE'S PEOPLE STOP BEING WRITTEN INTO CODE (Aug 10 2026,
   sweep finding 38). Three job constants named Gate City staff directly, two of
   them duplicating a config value verbatim. Terminating someone in HR does not
   touch a literal, so a departed leader keeps being DM'd forever. */
async function notifyName(env, key) {
  try {
    const cfg = (await sbGet(env, NOTIFY_TARGETS_KEY).catch(() => null)) || {};
    return String(cfg[key] || NOTIFY_DEFAULTS[key] || "").trim() || null;
  } catch { return String(NOTIFY_DEFAULTS[key] || "").trim() || null; }
}

/* Keys that must NEVER come back to an unauthenticated caller. Kept in step
   with store.js HR_PROTECTED — that list is what the Hub routes through the
   Worker, and anything routed but not denied at the database is exposed. */
const SEC_MUST_BE_DENIED = [
  /* ⚠️ A key that is denied but not listed HERE is a lockdown the nightly sweep
     never tests, which is exactly how the Jul 31 keys sat unwatched for days.
     One key came off this list Aug 8 2026 when its two tiles were removed. It
     never held a row. The database still denies it — see supabase-schema.sql,
     deliberately left in place, since removing a deny buys nothing. */
  "gcfcr-hr-evals", "gcfcr-hr-injuries", "gcfcr-hr-files", "gcfcr-hr-info",
  "gcfcr-hr-cfahome", "gcfcr-hr-sigs", "gcfcr-hr-docs-v1", "gcfcr-hr-docfiles-v1",
  "gcfcr-hr-docsends-v1", "gcfcr-hr-evaltpl-v1", "gcfcr-hr-evaltasks-v1",
  "gcfcr-hr-evalcopy-v1", "gcfcr-hr-pins",
  /* ⚠️ gcfcr-ipo-plans-v1 ADDED Aug 8 2026, AT THE SAME TIME AS THE KEY ITSELF.
     The IPO plan names every cost category this store runs over Chick-fil-A
     benchmark and the dollar variance on each. It was just taken OUT of the
     browser bundle; storing it in kv_store without denying the read here would
     have put it straight back in front of anyone holding the publishable key,
     which ships in that same bundle. The browser never reads this key directly —
     it goes through /api/ipo-plan, which is gated at tier 3 — so denying it
     costs nothing and is the whole point.
     ⚠️ LISTED HERE ON PURPOSE BEFORE THE SQL IS RUN. The sweep tests this
     list from OUTSIDE with the public key, so until somebody applies the
     schema change the 5am sweep will report this key as EXPOSED every
     morning. That is correct: it IS exposed until then, and a nag is a
     better reminder than a note in a commit message. */
  "gcfcr-ipo-plans-v1",
  /* Same door as the line above: it holds real email addresses and a trail
     of who sends the store's financial documents where. Listed BEFORE the SQL
     deny policy exists on purpose, exactly as ipo-plans was — the 5am sweep
     will report it EXPOSED every morning until the policy is applied, and
     that nag is a better reminder than a note in a commit message. */
  "gcfcr-receipt-sends-v1",
  // ⚠️ Denied in production Jul 31 2026 (writeups/evals/push-subs found open by
  // the security scan; hr-team-v1 closed after its reads moved to /api/hr-store)
  // — but never added HERE, so the nightly sweep was not testing any of them.
  // A regression re-opening one would have gone unreported. This list, store.js
  // HR_PROTECTED, worker HR_PROTECTED, and supabase-schema.sql move together.
  "gcfcr-hr-writeups-v1", "gcfcr-hr-evals-v1", "gcfcr-push-subs-v1",
  "gcfcr-hr-team-v1",
  // Moves WITH HR_PROTECTED and the schema deny list — see the note there.
  "gcfcr-hr-leadership-v1",
  // The token ledger. Same reason, same day it was written.
  "gcfcr-hr-tokens-v1",
  /* ⚠️ THE PTO LEDGER, Aug 14 2026. Listed here BEFORE the SQL deny is applied,
     exactly as ipo-plans and receipt-sends were, and for the same reason: the
     sweep probes this list from OUTSIDE with the public key, so it will report
     this key EXPOSED every morning until somebody runs the policy. That nag is
     correct — it IS exposed until then — and it is a better reminder than a
     line in a commit message. See ptoGateRefuses for what was open and for how
     long. */
  "gcfcr-pto-v1",
  /* ⚠️⚠️ THE THREE MESSAGING KEYS, Aug 13 2026. Announcements and shift threads
     SHIPPED TWO PULL REQUESTS AGO WITHOUT THIS LINE, so both have been readable
     by anyone holding the publishable key since they merged. That is the "on
     four lists, missing from the fifth" shape this whole file exists because
     of, repeated by me, on the same day, twice.

     WHAT IS IN THEM:
       · announcements — the notice itself, plus `opens` and `acks`, which are
         BY NAME. /api/announcements-mine deliberately strips those maps from
         everyone but a leader; a direct read makes that stripping worthless.
       · shift-threads — "who said I could have Friday off". Only the person and
         a leader may see one through the Hub.
       · escalations — "Cannot make it" plus a free note. The one people write
         "my father is in hospital" into.

     SAFE TO DENY, verified by statement rather than substring: no .jsx and no
     .js outside worker.js and the two leaves names gcfcr-announcements-v1,
     gcfcr-shift-threads-v1, gcfcr-escalations-v1, ANNOUNCE_KEY, THREADS_KEY or
     ESCALATIONS_KEY. Every route reads and writes them on the SERVICE key,
     which bypasses RLS entirely, so nothing in the Hub changes.

     ⚠️ LISTED HERE BEFORE THE SQL IS APPLIED, on purpose, exactly as
     ipo-plans and receipt-sends were: the 5am sweep will report all three
     EXPOSED every morning until somebody runs the policy, and a daily nag beats
     a note in a commit message. */
  "gcfcr-announcements-v1", "gcfcr-shift-threads-v1", "gcfcr-escalations-v1",
  /* ⚠️ ADDED Aug 14 2026 WITH the deny, so the nightly sweep watches these from
     day one. A key denied but not listed here is a lockdown nothing ever tests
     again — which is how the Jul 31 keys sat unwatched for days. */
  "gcfcr-availability-v1", "gcfcr-skills-v1",
];
/* One key that MUST stay readable. Without it a sweep where Supabase is simply
   down, or the key is wrong, would report "nothing is exposed" — the same
   fail-toward-good-news shape as the turnover row publishing 0.0%. */
const SEC_CANARY_KEY = "eos:scorecard:2026-Q3";
/* Stage 8 readiness. ⚠️ SEVEN DAYS, not one: a leader who only opens the Hub on
   a Friday still holds a legacy token, and flipping the flag is what signs them
   out. A week covers everyone's normal rota. */
const STAGE8_KEY = "gc-auth-stage8-v1";
const STAGE8_CLEAN_DAYS = 7;

/* ── Daily sweep expansion (Matt, Aug 1 2026: "start the sweep") ─────────
   Four more checks ride the same 5:00am job, same rules: findings join the
   same change-detected DM, quiet is honoured, silence means clean. */

// 1) PEOPLE STILL WIRED IN. Every automation that names a person, listed by
//    hand ON PURPOSE — when adding one, grep the repo for "U0…" Slack ids and
//    the director name lists. The sweep flags a listed person whose roster
//    row is missing or no longer Active (the roster's own status field, or
//    the gcfcr-hr-status map keyed by the numeric part of the roster id).
//    This is the "terminating someone does not touch the automations" hole
//    from CLAUDE.md, turned into a morning tripwire.

// 2) CENSUS WATCH. gcfcr-kvset-anon-keys-v1 records writes arriving with no
//    sign-in; it CAPS at 60 keys, after which new anonymous writers are
//    invisible — so saturation is itself a finding. Yesterday's key list is
//    kept here so a brand-new writer shows up as a named delta once.
const SWEEP_CENSUS_SNAP_KEY = "gcfcr-sweep-census-snap-v1";
/* 🐛 THE CENSUS COULD NEVER FINISH ITS JOB (Matt's 5 AM sweep, Aug 4 2026:
   "CENSUS MAP FULL (60/60)"). It recorded EXACT keys, and a third of what the
   Hub writes carries a date or a week in the key — the setup history, the
   breaks board, the ops-done flags, every cleaning day. Read from production:
   60 of 60 slots used, and the list grows every single day no matter what
   anyone fixes. So it filled, went blind, got auto-cleared, and refilled. A
   treadmill, not a census, and the whole reason it exists is to produce a
   FINISHED list of anonymous writers so the last open write door can be shut.

   ⇒ It records the key FAMILY now. `gcfcr-dailysetup-hist-foh-2026-08-03`
   and its 200 siblings are one writer, not 200. The list converges on the
   handful of real callers and stays there, which is the thing that can actually
   be reviewed and closed.
   ⚠️ The cap stays as a backstop, not as a working limit. Families are bounded,
   so hitting this now means something genuinely unexpected is writing, which is
   exactly when an alarm should fire. */
const SWEEP_CENSUS_CAP = 250;

/* One key's FAMILY: the same key with anything date-shaped folded out.
   Pure and module level so both the census writer and the sweep's delta read
   it the same way — comparing a family against an exact key would report every
   caller as brand new on the day this ships. */
function censusFamily(key) {
  return String(key || "")
    .replace(/\d{4}-\d{2}-\d{2}/g, "<date>")
    .replace(/\d{4}-W\d{1,2}/gi, "<week>")
    .replace(/\d{4}-Q\d/gi, "<quarter>")
    .replace(/\b20\d{2}\b/g, "<year>");
}

// 3) BUNDLE EMAIL SCAN. Email-shaped strings ALLOWED to ship in the client
//    bundle. Calibrated Aug 1 2026 against the real build: the entry-form
//    placeholder, plus the CFA Access contact one tile renders on purpose.
//    Anything else — one leaked roster import away — is a finding.
/* ⚠️ ADDRESSES THE SWEEP IS ALLOWED TO SEE IN THE CODE WITHOUT FLAGGING THEM.
   `name@email.com` is a placeholder this repo uses on purpose. The other was
   a named CFA facilities rep's work address, which is a real person's contact
   detail and belongs with the rest of this store's people. */
const SWEEP_EMAIL_ALLOW = new Set(["name@email.com", ...SWEEP_EMAIL_EXTRA]);

/* ── NAMES THAT MUST NOT APPEAR IN THIS STORE'S SHIPPED APP ──────────────
   EMPTY HERE, AND CORRECTLY SO: these are this store's own people and this is
   this store's own app. The list earns its keep in a CLONE, where it holds
   the ORIGIN store's people and turns "another restaurant's team is in our
   bundle" into a morning finding instead of something noticed months later.
   ⚠️ WHY IT EXISTS. On 12 Aug 2026 a second store's built app held TWENTY-FOUR
   mentions of this store's people across eleven chunks: "ask Matt", "tell
   Hannah", "contractors schedule with Nick", two names as the example inside
   an empty box. Not one was an email address or a figure, so every check that
   existed passed all of them clean. They are sentences, and nothing looked at
   sentences.
   ⚠️ IT REPORTS CONTEXT AND DOES NOT ADJUDICATE. A short name that is also an
   ordinary word will match something innocent — "Don" inside "Don't" is the
   one already met. Each finding carries the surrounding text so a human
   dismisses it in two seconds. A scan clever enough to suppress those would
   sooner or later suppress a real one to keep itself quiet. */
const SWEEP_FORBIDDEN_NAMES = [];
/* ★ PURE AND AT MODULE LEVEL so the matching can be checked without booting a
   worker. Word-boundaried and case-sensitive: a name is a proper noun, and
   lowercasing would make "Nick" match "nickname" on top of everything else
   a bare first name already matches. Every regex character in the name is
   escaped, because a list is typed by hand and one stray "." would quietly
   turn into "any character". */
const sweepNameRe = (nm) =>
  new RegExp("\\b" + String(nm).replace(/[.*+?^${}()|[\]\\]/g, (c) => "\\" + c) + "\\b", "g");
/* ⚠️⚠️ CUT FROM 24 TO 6 ON Aug 14 2026, AND THE REASON IS THAT THIS JOB WAS
   DYING. Every chunk is a subrequest, and Cloudflare cuts a Worker off at its
   limit — "Too many subrequests by single Worker invocation", seen twice that
   afternoon on a forced run. The whole report, the census snapshot and the
   state write all come AFTER this scan, so a scan that eats the budget takes
   the entire job with it. The morning report becomes a coin flip.

   ⚠️ 24 WAS THE RIGHT NUMBER WHEN THIS WAS THE ONLY SCAN. It no longer is.
   `bundleScan.test.mjs` reads ALL 63 chunks off the disk before anything
   ships, for free, so breadth is covered there and covered completely.

   ⇒ What is left for THIS scan is the question the build cannot answer: is
   what is actually being SERVED clean? A bad deploy and a stale edge cache
   both show up in the entry chunk and its immediate neighbours, which is what
   6 buys. Depth here was never the point; it was a stand-in for a check that
   did not exist yet.

   ⚠️ AND WHEN IT TRUNCATES IT STILL SAYS SO, loudly, which is what makes a
   budget honest. A silent cap reads exactly like a clean scan. */
const SWEEP_BUNDLE_CHUNK_CAP = 6;
const SWEEP_NAME_HITS_CAP = 12;         // enough to act on; the count says the rest

/* ★ THE STORE'S OWN FROM: ADDRESS IS ALLOWED, AND IT IS READ LIVE RATHER THAN
   LISTED (Aug 12 2026).

   🐛 WHY THIS EXISTS. The Aug 12 sweep reported "EMAIL IN THE BUNDLE —
   notify@gatecityhub.com ships to every browser that opens the Hub. Find the
   import that dragged it in." There was no stray import. It is
   `identity.notifyEmail`, and it reached the bundle the day it became a STORE
   SETTING: StoreSettings.jsx edits it on screen, so storeConfig has to ship it.

   ⚠️ AND IT IS NOT A SECRET. It is the From: header on every email the Hub
   sends — every recipient already has it. There is nothing to protect.

   ⚠️⚠️ SO THE FINDING WAS TRUE AND WORTHLESS, WHICH IS THE DANGEROUS KIND. It
   would have fired every single morning, forever, and a sweep with a permanent
   entry is one people stop reading — the same reasoning the Stage 8 watch uses
   for why it stays silent until the day it matters. A daily false alarm does
   not just waste a line; it teaches everybody to skim past the line above it.

   ⚠️⚠️ ALLOWED BY MEANING, NEVER BY VALUE. Writing "notify@gatecityhub.com"
   into the set above would fix Gate City and break every clone, because each
   store sets its own address and would then trip its own sweep on day one.
   Reading STORE.notifyEmail asks "is this the address this store configured",
   which is the actual question. A leaked roster address is still a finding,
   which is the whole point of the check. */
const sweepEmailAllowed = (e) => {
  if (SWEEP_EMAIL_ALLOW.has(e)) return true;
  const own = String((STORE && STORE.notifyEmail) || "").trim().toLowerCase();
  return !!own && e === own;
};

// 4) OUTSIDE DOOR PROBES. Written by .github/workflows/door-probes.yml twice
//    a day; the sweep alarms when the heartbeat goes stale, so a dead probe
//    can never read as an all-clear.
/* ⚠️⚠️ THE PROBE CANNOT TELL "DENIED" FROM "EMPTY", AND THAT IS A BLIND SPOT.
   PostgREST does not 403 an RLS refusal — it filters the row and returns 200
   with []. A key that is genuinely denied and a key that simply has no data
   are byte-identical answers. So `rows > 0` only ever detects a key that is
   BOTH exposed AND already holding real data: the alarm arrives after the
   leak, never before it.

   Measured Aug 12 2026: SIX of the twenty-one protected keys have no row yet,
   so six doors are untested — including gcfcr-hr-injuries, gcfcr-ipo-plans-v1
   and gcfcr-hr-tokens-v1. The token ledger is the sharp one: it is empty only
   because tokens is switched off, and the morning somebody grants the first
   one it holds who got what and why. If its deny policy were missing, the
   sweep would have said nothing until real data was already public.

   ⇒ THE SERVICE KEY ANSWERS THE OTHER HALF. The Worker can see whether a key
   EXISTS; the anon probe says whether an outsider can read it. Together they
   separate "denied" from "cannot be tested", which is the distinction that was
   missing.

   ⚠️⚠️ REPORTED ON CHANGE, NEVER DAILY. Six standing lines every morning is
   exactly the noise that got the store's own From: address flagged forever, and
   a sweep with permanent entries is one people stop reading. The set is stored
   and only a DIFFERENCE speaks — which also means adding a protected key
   without its policy is reported the very next morning, loudly, on its own. */
const SWEEP_BLIND_KEY = "gc-sweep-blindspots-v1";

const SWEEP_PROBE_KEY = "gcfcr-sweep-probe-heartbeat-v1";
const SWEEP_PROBE_STALE_H = 26;

/* `opts.rollCensus` — a DELIBERATE re-baseline of the anonymous-writer census.
   Matt, Aug 11 2026, after a 5am alert on `eos:rocks:<quarter>`: the counts in
   that map are cumulative and were never cleared, so they are mostly HISTORY
   from before the sliding session shipped on Aug 8. gc-pg-index-v1 alone sits
   at 4,092 anonymous writes, nearly all of them applicants typing on a token
   that had aged out at hour 12 — which the sliding session now renews on every
   save. Judging the door against that baseline means "NEW ANONYMOUS WRITER"
   fires for one ordinary lapse and wakes somebody at 5am for nothing.

   ⚠️ IT IS A FLAG, NOT A HAND EDIT. The comment on the cap-roll below says it
   plainly: "an alarm whose only fix is a manual database edit is an alarm that
   stays broken", and this store does not do surgical writes to production. So
   the reset goes through the job, on the same guarded path, and REPORTS itself
   in the findings — a monitoring baseline that moved silently is worse than one
   that never moved.
   ⚠️ DRY RUN STILL CLEARS NOTHING. Same rule as the cap-roll, and for the same
   reason: CRON-JOBS.md publishes the manual URL and CLAUDE.md tells Matt to add
   `&quiet=1` to it. */

/* ═══ A COPY OF THE SWEEP, OUT TO WHOEVER IS WATCHING THE FLEET ══════════════
   Matt, Aug 11 2026: "I want these sweeps built into the other stores builds.
   Idk how it will work but I want the reports sent to me until the system is
   set."

   ⚠️⚠️ THE SLACK DM CANNOT DO THIS, AND THAT IS THE WHOLE PROBLEM. The sweep
   reports through `notifyTarget(env, "owner")`, which resolves the OWNER OF THE
   STORE IT IS RUNNING IN, in THAT store's Slack workspace. A clone's sweep
   therefore reports perfectly — to somebody who is not Matt, in a workspace he
   is not in. He would never see it, and a silent security sweep is worse than
   none because it reads as an all-clear.

   ⇒ EMAIL, AND ONLY BECAUSE IT CROSSES WORKSPACES. Slack is per-workspace by
   design; an address is not.

   ⚠️ A WORKER SECRET, NOT storeConfig. Two reasons, and the second is the real
   one. A clone OWNS its storeConfig and will edit it, so a value that must
   survive their editing does not belong there. And "where does this deployment
   report to" is a property of the deployment, which is exactly what a secret
   is. Gate City leaves `SWEEP_COPY_EMAIL` unset and nothing changes here — Matt
   already gets the DM, and a second copy of a message he has read is noise.

   ⚠️ IT NAMES THE STORE IN THE SUBJECT. Ten stores reporting into one inbox
   under one subject line is an inbox nobody reads. Store name and FSR come from
   the clone's own config, so each store's mail sorts under its own name.

   ⚠️ IT CAN NEVER BREAK THE SWEEP. Everything is inside a catch and it returns
   nothing: the DM, the state write and the job's own result must all land
   whether or not this address is reachable. A monitoring copy that can take
   down the monitor is not a safety net.
   ⚠️ HONOURS QUIET, like every other send in this job. */
/* ★ THE ADDRESS ON ITS OWN, because two callers now need it and only one of
   them sends. `runSecuritySweep` asks whether this deployment can reach ANYBODY
   before it decides whether a silent run is itself a finding, and asking by
   trying to send would mean sending. One definition; the resolution order and
   every warning below it are unchanged. */
async function sweepCopyAddress(env) {
  let to = String((env && env.SWEEP_COPY_EMAIL) || "").trim();
  if (!to) {
    try {
      const saved = await sbGet(env, STORE_CONFIG_KEY);
      const ident = saved && saved.settings && saved.settings.identity;
      to = String((ident && ident.sweepEmail) || "").trim();
    } catch { to = ""; }
  }
  return to;
}

async function sweepCopyOut(env, subject, text) {
  /* ⚠️ THE SECRET STILL WINS, AND THE SETTING IS THE FALLBACK (Matt, Aug 12
     2026: "Set it" — and I could not, because nothing here can write a Worker
     secret; that is a dashboard job and it had sat undone for days).
     The note above still holds for a CLONE: "where does this deployment report
     to" is a property of the deployment, so SWEEP_COPY_EMAIL is read first and
     a clone can still pin it where their store settings cannot reach.
     ⇒ What changes is that a store which has NOT set the secret can now type
     the address into Store Settings and be done, instead of the report going
     nowhere. A blanked field is visible on a screen somebody opens; an unset
     secret is invisible, which is exactly how this one stayed unset.
     ⚠️ READ LIVE FROM THE SAVED RECORD, NEVER FROM STORE. The Worker boots
     storeConfig.js once at module load and never re-reads it, so the shipped
     defaults would be frozen at deploy time and typing the address on screen
     would appear to do nothing until the next deploy.
     ⚠️ A FAILED READ IS NOT AN ADDRESS. Any error leaves `to` empty and the
     copy is skipped, exactly as before — this must never be able to send the
     sweep somewhere it was not asked to. */
  /* 🐛 THE FALLBACK ONCE READ `saved.identity` AND THAT PATH DOES NOT EXIST
     (found the same day, before anybody relied on it). The saved record wraps
     everything in `settings` — its real shape is { history, settings: {
     identity, branding, owners, … }, updatedAt, updatedBy } — so the fallback
     could never fire and the whole change was decorative. Caught only by
     reading the live record before writing to it; six checks, a green build and
     ten assertions all passed over it, because every one of them used MY shape
     rather than the stored one. The resolution now lives in sweepCopyAddress
     above, and that is still the shape it reads. */
  const to = await sweepCopyAddress(env);
  if (!to) return;
  const line = `${STORE.name} · FSR #${STORE.fsr} — ${subject}`;
  try {
    await sendEmailOk(env, to, line,
      `${text}\n\nThis is the automatic security sweep for ${STORE.legalName}.\n`
      + `It reaches you because this store set an address for the security sweep.`);
  } catch (e) {
    /* Reported to the log, never to the caller. */
    console.error("sweep copy email failed:", e);
  }
}

/* ═══ WHAT EACH JOB ACTUALLY DID, AND WHEN ═════════════════════════════════
   Matt, Aug 13 2026, after the sweep failed at 5am and nothing said so until he
   asked at 5:30: "one line per job saying when it last ran and what it did."

   ⚠️⚠️ THE PROBLEM IS NOT THAT JOBS FAIL, IT IS THAT NOTHING RECORDS IT.
   cron-job.org answering 200 means the WORKER answered, not that the job did
   anything — CRON-JOBS.md says so in as many words. And a job that skips
   answers `ok` too, which is how `cleaning-summary` and `waste-report` have
   posted nothing every Sunday for weeks while the schedule looked green.

   ⚠️ ONE ROW PER JOB, NEVER ONE ROW FOR ALL OF THEM. Four jobs can fire in the
   same minute and a shared record is a read-modify-write race that silently
   loses one — the same fault `gc-goal-submissions-v1` had on Jul 31 and the
   reason the calendar keeps a row per person. Per-job keys cannot collide, and
   `/api/job-runs` reads them all back in ONE request with `key=in.(…)`.

   ⚠️ IT RECORDS FAILURES, WHICH IS THE ENTIRE POINT. A run that threw is the
   run worth knowing about; a recorder that only stamped successes would have
   been silent on exactly the morning that prompted it.

   ⚠️ IT CAN NEVER BREAK A JOB. Everything is inside a catch and nothing is
   awaited for its value. A bookkeeping write that can take down the job it is
   describing is worse than no bookkeeping.

   ⚠️ QUIET RUNS ARE NOT RECORDED. A rehearsal that stamped "last ran: now"
   would make a dead job look alive, which is the failure this exists to catch.
   Same rule the dedup stamp already follows. */
/* ⚠️⚠️ HAND-KEPT, AND IT IS THE ONE THING HERE THAT CAN DRIFT. This is the
   list of job names the chain below dispatches, and it exists so /api/job-runs
   can answer "which jobs have NEVER run" — a job that is merely absent from
   the results is invisible, and invisible is the failure this whole record was
   built to end.
   ⚠️ A NAME MISSING HERE IS A JOB THAT CANNOT BE REPORTED AS DEAD. Add the
   name in the same commit as the branch. The build harness asserts this list
   against the actual `job === "…"` strings in this file, so a drift fails
   there rather than quietly shrinking the answer.
   ⚠️ IT DOES NOT GATE ANYTHING. Dispatch is the chain, not this list, so a
   name missing here can never stop a job running. */
const KNOWN_JOBS = [
  "adoption-check", "ai-summary", "audit-order-calc", "backup", "boilout-fry",
  "doc-chase",
  "boilout-henny", "cleaning-summary", "emails-migrate", "eos",
  "equip-reminder-flag", "eval-due-reminders", "foodsafety-assign",
  "foodsafety-reminder", "foodsafety-weekly", "gap-check", "goal-due",
  "input-push", "ipo-weekly-reminder", "kia-monthly", "l10-recap",
  "labor-daypart", "monthly-reports", "onboarding-notice", "ops-recap",
  "pg-reminders", "pin-hash-migrate", "probe-heartbeat", "security-sweep",
  "shift-where", "slack-avatars", "supply-reminder", "team-scoreboard",
  "trainer-tasks-summary", "waste-input-check", "waste-report",
  "week-cut-report", "weekly-usage",
];
const JOB_RUN_PREFIX = "gcfcr-job-run-v1:";
const jobRunKey = (job) => `${JOB_RUN_PREFIX}${job}`;

async function noteJobRun(env, job, label, startedAt, res) {
  if (!job || (env && env.__QUIET)) return;
  try {
    /* ⚠️ CLONE BEFORE READING. The response is about to be returned to
       cron-job.org; consuming its body here would hand the caller an empty
       one. */
    let body = null;
    try { body = await res.clone().json(); } catch { /* not JSON, fine */ }
    const ok = !!(body && body.ok === true) && res.status < 400;
    /* "What it did", in the job's own words. Every branch already answers with
       something useful — `skipped`, `posted`, `sent`, `findings` — so this
       reports the job's own summary rather than inventing a second vocabulary
       nobody would keep in step. */
    const detail = {};
    if (body && typeof body === "object") {
      for (const k of ["skipped", "reason", "posted", "sent", "findings", "reachable", "changed", "note", "error", "dp", "remaining", "rows"]) {
        if (body[k] !== undefined) detail[k] = typeof body[k] === "string" ? String(body[k]).slice(0, 160) : body[k];
      }
    }
    await sbSet(env, jobRunKey(label || job), {
      job, at: new Date().toISOString(), ok, status: res.status,
      ms: Date.now() - startedAt, detail,
    });
  } catch (e) {
    /* Reported to the log, never to the caller. */
    console.error("job-run record failed:", e);
  }
}

async function runSecuritySweep(env, opts = {}) {
  const findings = [];

  /* ★★ CAN THIS REPORT REACH ANYBODY AT ALL? Asked FIRST, and it is the one
     check whose answer changes what every other check is worth.

     ⚠️ A SILENT SWEEP READS AS AN ALL-CLEAR. The note at the top of this file
     has said so since the clone work: a second store that has not wired its
     Slack and has not set an address gets a sweep that runs perfectly every
     morning, finds real holes, and posts them nowhere. Nobody is alarmed by a
     report they never see, and "we have a security sweep" becomes the most
     dangerous sentence in the building.

     ⚠️ IT IS A FINDING, NOT A REFUSAL. The sweep still runs and still writes
     its state — the checks are worth doing even when only the job response
     carries them, and refusing to run would trade a quiet report for no report.

     ⚠️ AND IT IS ALSO RETURNED AND LOGGED, because a finding inside a report
     nobody receives is the very thing being complained about. `reachable:false`
     comes back in the /api/run-job response, which is what the cron service
     records and what a person testing by hand actually sees.

     ⚠️ RESOLVED ONCE AND REUSED at both delivery sites below, so the question
     "who is this going to" cannot be answered differently in two places. */
  const reachSlack = await notifyTarget(env, "owner").catch(() => "");
  const reachEmail = await sweepCopyAddress(env).catch(() => "");
  if (!reachSlack && !reachEmail) {
    findings.push(
      "NOBODY IS LISTENING — this sweep has no Slack owner and no email address, "
      + "so this report reached nobody. Set a notify target for \"owner\" in "
      + "gcfcr-notify-targets-v1, or put an address in Store Settings, or set the "
      + "SWEEP_COPY_EMAIL secret. Until then every morning looks like an all-clear."
    );
    console.error("[security-sweep] no Slack owner and no email address — this report reached nobody");
  }

  const anon = env.SUPABASE_ANON_KEY || "";

  if (!anon) {
    findings.push("CHECK DID NOT RUN — SUPABASE_ANON_KEY is not set as a Worker secret, so the sweep cannot test what an outsider sees. Add it (it is the publishable key already in the public bundle, not a secret).");
  } else {
    const restGet = async (key) => {
      const u = `${env.SUPABASE_URL}/rest/v1/kv_store?key=eq.${encodeURIComponent(key)}&select=key`;
      const r = await fetch(u, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
      if (!r.ok) return { error: r.status };
      const rows = await r.json().catch(() => null);
      return { rows: Array.isArray(rows) ? rows.length : 0 };
    };

    const canary = await restGet(SEC_CANARY_KEY).catch(() => ({ error: "threw" }));
    if (canary.error || canary.rows === 0) {
      /* ⚠️ ABORT RATHER THAN REPORT CLEAN. If the canary cannot be read, every
         "denied" result below is meaningless — they would all look denied. */
      findings.push(`SWEEP INCONCLUSIVE — the control read failed (${canary.error || "0 rows"}). Nothing below can be trusted today; this is not an all-clear.`);
    } else {
      /* The same read as the anon probe, with the Worker's own key. It answers
         one question only — does this key exist at all — and never reports
         content. See SWEEP_BLIND_KEY for why that question matters. */
      /* ⚠️⚠️ ONE REQUEST PER KEY BECAME ONE REQUEST FOR ALL OF THEM, and it is
         not a tidy-up. SEC_MUST_BE_DENIED holds TWENTY-ONE keys and each one
         cost an anon read and then a service read: up to FORTY-TWO network
         round trips from this single loop. The sweep stopped finishing the day
         that loop landed — it wrote its blind-spot record at 09:00:21 and never
         reached the census snapshot two lines of work later. Every block in
         between is wrapped in its own try/catch, so nothing was throwing; the
         request itself was ending. Forty-two round trips are now two.
         ⚠️ `key=in.(...)` IS THE SAME QUESTION, ASKED ONCE. Postgrest returns
         the rows the caller may see, so the anon answer is still exactly "which
         of these can an outsider read" and the service answer is still exactly
         "which of these hold any data". Nothing about the judgement changed. */
      const inList = (keys) => `in.(${keys.map((k) => JSON.stringify(k)).join(",")})`;
      const readMany = async (apiKey) => {
        if (!apiKey) return { error: "no key" };
        const u = `${env.SUPABASE_URL}/rest/v1/kv_store?key=${encodeURIComponent(inList(SEC_MUST_BE_DENIED))}&select=key`;
        const r = await fetch(u, { headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` } });
        if (!r.ok) return { error: r.status };
        const rows = await r.json().catch(() => null);
        if (!Array.isArray(rows)) return { error: "unreadable body" };
        return { keys: new Set(rows.map((x) => x && x.key).filter(Boolean)) };
      };

      const seenByAnon = await readMany(anon).catch(() => ({ error: "threw" }));
      const seenByUs = await readMany(env.SUPABASE_SERVICE_KEY || "").catch(() => ({ error: "threw" }));

      const blind = [];
      if (seenByAnon.error) {
        /* ⚠️ ONE FAILURE NOW COSTS ALL TEN ANSWERS, so it says so by name
           rather than letting ten keys fall through looking denied. */
        findings.push(
          `COULD NOT TEST THE PROTECTED KEYS (${seenByAnon.error}). ` +
          `None of ${SEC_MUST_BE_DENIED.join(", ")} was checked, so today is not an all-clear on them.`);
      } else {
        for (const key of SEC_MUST_BE_DENIED) {
          if (seenByAnon.keys.has(key)) {
            findings.push(`EXPOSED — ${key} is readable by anyone with the public key. It should be denied at the database.`);
            continue;
          }
          /* Zero rows to an outsider. That is either a working deny or an
             empty key, and the anon read alone cannot say which. */
          if (seenByUs.error) continue;            // cannot ask; say nothing rather than guess
          if (!seenByUs.keys.has(key)) blind.push(key);   // no data, so the deny is unproven
        }
      }

      /* ⚠️ QUIET WRITES NOTHING — a rehearsal must not consume the change that
         the real run is supposed to report. Same rule every other state write
         in this file follows. */
      if (blind.length) {
        const now = blind.slice().sort();
        let prev = [];
        try { const st = await sbGet(env, SWEEP_BLIND_KEY); prev = Array.isArray(st && st.keys) ? st.keys : []; }
        catch { prev = null; }
        if (prev === null) {
          findings.push("BLIND SPOTS COULD NOT BE COMPARED — the sweep's own state key would not read, so today is not an all-clear on them.");
        } else {
          const fresh = now.filter((k) => !prev.includes(k));
          const changed = fresh.length > 0 || prev.some((k) => !now.includes(k));
          if (changed) {
            findings.push(
              `CANNOT BE VERIFIED — ${now.length} protected key${now.length === 1 ? " has" : "s have"} no data yet, so a missing deny policy would look identical to a working one: ${now.join(", ")}. `
              + `${fresh.length ? `New since the last report: ${fresh.join(", ")}. ` : ""}`
              + "Add them to the database policy and this goes quiet."
            );
            if (!(env && env.__QUIET)) await sbSet(env, SWEEP_BLIND_KEY, { keys: now, at: new Date().toISOString() }).catch(() => {});
          }
        }
      }
    }
  }

  /* Storage buckets. A bucket flipped public is how documents leak without any
     policy looking wrong. hub-assets is public ON PURPOSE — it holds the images
     the Hub renders — so it is the one expected exception. */
  try {
    const r = await fetch(`${env.SUPABASE_URL}/storage/v1/bucket`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
    });
    if (r.ok) {
      const buckets = await r.json().catch(() => []);
      (Array.isArray(buckets) ? buckets : []).forEach((b) => {
        if (b && b.public && b.name !== "hub-assets") {
          findings.push(`PUBLIC BUCKET — "${b.name}" is world-readable. Anything uploaded to it can be opened by URL with no sign-in.`);
        }
      });
    } else findings.push(`Could not list storage buckets (${r.status}).`);
  } catch (e) { findings.push(`Could not list storage buckets (${String(e)}).`); }

  /* The Worker's own door — TESTED IN PROCESS, NOT OVER HTTP.
     🐛 This used to fetch https://gatecityhub.com/api/hr-store and judge the
     status code. A Worker calling its OWN hostname loops back through the edge
     and commonly times out, so it returned 522 every single run: first as a
     false "OPEN DOOR", then, after that was fixed, as a permanent "could not
     test" that appeared in the report every morning and meant nothing.

     ⚠️ A CHECK THAT CAN NEVER PASS IS WORSE THAN NO CHECK. It occupied the one
     line this job has to say something important with, and it trained the
     reader to see a bullet point and skip it.

     ⇒ Test the actual GATE instead of the route. `readToken` is what
     /api/hr-store calls to decide whether to answer at all; if it accepts junk
     or a tampered signature, the door is open no matter what any status code
     says. That runs here, in process, with no network and no timeout. */
  try {
    const junk = await readToken(env, "not-a-real-token");
    if (junk) findings.push("OPEN DOOR — the session gate accepted a token that was not issued by this Worker. /api/hr-store answers anyone.");
    const real = await mintToken(env, "1");
    const tampered = String(real).replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    const forged = await readToken(env, tampered);
    if (forged) findings.push("OPEN DOOR — the session gate accepted a token whose signature had been altered. Anyone can mint their own identity.");
    if (!(await readToken(env, real))) {
      findings.push("The session gate rejected a token this Worker just issued. Sign-ins are probably failing right now.");
    }
    /* ⚠️ THE FORGERY A MISSPELLED SECRET NAME WOULD ALLOW. String(env.X || "")
       HMACs perfectly happily with a junk key, and a junk-key HMAC verifies
       consistently against itself — so if a signing secret were ever unset and
       used as-is, every token in the world would be forgeable and nothing would
       look broken. Sign a real payload with a key this Worker does not hold and
       confirm the gate spits it out. */
    const realPayload = String(real).split(".")[0];
    const junkKeyForged = `${realPayload}.${await hmacRaw("not-the-signing-key", realPayload)}`;
    if (await readToken(env, junkKeyForged)) {
      findings.push("OPEN DOOR — the session gate accepted a token signed with a key this Worker does not hold. A signing secret is unset or wrong, and every session is forgeable.");
    }
    /* The doc-handle ceiling, tested against the REAL verifier. Mint a handle,
       rewrite its expiry a day out, re-sign it with the SAME key it was minted
       under — so the signature is genuinely valid, which is exactly what the
       old code trusted — and confirm readDocHandle still refuses it.
       ⚠️ Tests the shared verifier, not a copy of its rules. A self-test that
       reimplements the check it is testing proves only that the copy agrees
       with itself. */
    const realHandle = await docHandle(env, "hr-files", "0/selftest.pdf", 300);
    if (!(await readDocHandle(env, realHandle))) {
      findings.push("The document gate rejected a handle this Worker just issued. HR files, receipts and course photos are probably failing to open right now.");
    }
    const immortal = await forgeLongDocHandle(env, realHandle, 86400);
    if (immortal && await readDocHandle(env, immortal)) {
      findings.push("OPEN DOOR — the document gate accepted a correctly signed handle claiming to last a day. A forged link to the private HR bucket would never expire.");
    }
    if (!immortal) {
      findings.push("The doc-handle ceiling self-test could not run, so it proved nothing. Not an all-clear.");
    }
  } catch (e) {
    findings.push(`Could not test the session gate (${String(e)}). This is not evidence it is open.`);
  }

  /* Secrets. A missing one does not break loudly, it makes a job quietly do
     nothing — the failure mode this whole file keeps running into. */
  /* ⚠️ CHANGE_ORDER_* ADDED Aug 8 2026. They are not needed for a job to run,
     but if they are unset the Cash Audit panel prints "ask Matt" where a
     credential belongs — which is correct behaviour and still worth knowing
     about, because it means the rotation was never finished. */
  ["RUN_JOB_KEY", "SLACK_BOT_TOKEN", "SUPABASE_SERVICE_KEY", "CHANGE_ORDER_LOGIN", "CHANGE_ORDER_PASSWORD"].forEach((k) => {
    if (!env[k]) findings.push(`MISSING SECRET — ${k} is not set. Anything depending on it is silently doing nothing.`);
  });
  /* ⚠️ THE TWO SIGNING SECRETS GET THEIR OWN WORDING. The generic line above
     understates these badly: absent does not mean "a job does nothing", it
     means sessions and private file links are still signed with the key that
     travels in cron-job.org URLs and gets pasted into Safari. freshKey treats
     anything under 32 characters as ABSENT, so a short paste reads here too. */
  if (!freshKey(env, "session")) findings.push(
    "SESSION_KEY is not set (or is under 32 characters). Session tokens are still signed with the key that travels in cron-job.org URLs and in Safari.");
  if (!freshKey(env, "doc")) findings.push(
    "DOC_KEY is not set (or is under 32 characters). Private document links are still signed with the key that travels in cron-job.org URLs and in Safari.");

  /* ── The sign-in throttle, reported by OUTPUT ──
     ⚠️ A CHECK THAT CANNOT RUN MUST SAY SO. If bump_counter is unreachable the
     PIN throttle is failing open by design, which is the right call in the
     moment and completely silent — so silence is exactly what this has to
     break. Reading 0 from a counter nobody has proved is reachable is the
     failure mode that makes an all-clear worthless. */
  try {
    const probe = await bumpCounter(env, "sweep:probe", 60);
    if (probe === null) {
      findings.push("SIGN-IN THROTTLE CANNOT COUNT — bump_counter is unreachable, so the PIN limiter is failing open. Not an all-clear. Check /api/gate-health.");
    } else {
      /* ⚠️ NO RAW COUNTS IN A FINDING, EVER. This sweep posts only when its
         finding LIST CHANGES (see `signature` below), so a line carrying a
         number that moves every day would post every single morning and would
         make `changed` permanently true — which is the one property that keeps
         this alarm worth reading. Both lines below are fixed sentences that
         appear only while a threshold is actually breached. */
      const walk = await peekCounter(env, "pin:distinct");
      if (walk !== null && walk > PIN_WALK_ALARM) findings.push(
        `SOMEONE IS GUESSING PINs — more than ${PIN_WALK_ALARM} different wrong PINs in an hour. Signed-in devices are unaffected. Read /api/gate-health for the live count.`);
      const anon = await peekCounter(env, "pin:anon");
      if (anon !== null && anon > PIN_ANON_MAX) findings.push(
        `SIGN-IN attempts from devices the Hub has never seen went over ${PIN_ANON_MAX} in an hour.` +
        (PIN_ANON_ENFORCE ? " Those are being refused." : " Nothing is being refused yet — this lane is still only counting."));
    }
  } catch { findings.push("SIGN-IN THROTTLE CHECK DID NOT RUN. Not an all-clear."); }

  /* ═══ STAGE 8 READINESS ═════════════════════════════════════════════════
     CLAUDE.md has said "waiting on Matt to read legacyTokens24h" for days, and
     that is the problem: the number lives at /api/auth-census and nowhere else,
     so knowing when Stage 8 is safe means remembering to go and look, every
     day, for a week. Nobody does that, which is why the rollback floor block is
     still load-bearing.

     ⚠️⚠️ IT REPORTS ONLY WHEN THE ANSWER CHANGES TO YES. A "not ready yet" line
     every morning would make the finding list move daily, which permanently
     sets `changed` and destroys the one property that makes this alarm worth
     reading — the comment forty lines above says exactly that about raw counts.
     So: silence while people still hold old tokens, and ONE message on the day
     it becomes safe.

     ⚠️ WHY A STREAK AND NOT A SINGLE ZERO. The counter is a 24-hour window. One
     quiet day proves nothing: somebody on holiday, or a leader who only opens
     the Hub on a Friday, still has a legacy token in their pocket and would be
     signed out. Flipping the flag is what signs them out, so the bar is a run
     of clean days, not a clean morning.

     ⚠️ ONE COUNT PER DAY. The streak advances on the DATE, not per run, so a
     manual re-run cannot inflate it toward the threshold.
     ⚠️ QUIET WRITES NOTHING, the same rule every other state write in this job
     follows: a rehearsal must not advance a counter that decides whether ~106
     people get signed out. */
  if (LEGACY_SIGNING_ACCEPTED) {
    try {
      const legacy = await peekCounter(env, "legacy:session");
      if (legacy === null) {
        findings.push("STAGE 8 CHECK DID NOT RUN — the legacy-token counter could not be read. Not an all-clear.");
      } else {
        const prev = (await sbGet(env, STAGE8_KEY).catch(() => null)) || {};
        const day = isoOfD(nowET());
        let streak = Number(prev.streak) || 0;
        if (prev.day !== day) {
          streak = legacy > 0 ? 0 : streak + 1;
          if (!(env && env.__QUIET)) {
            await sbSet(env, STAGE8_KEY, { day, streak, lastCount: legacy }).catch(() => {});
          }
        }
        if (legacy === 0 && streak >= STAGE8_CLEAN_DAYS) {
          findings.push(
            `STAGE 8 IS SAFE TO SHIP — no legacy session token has been presented for ${streak} days. ` +
            `Set LEGACY_SIGNING_ACCEPTED to false in worker.js (one line) and the old signing arm closes. ` +
            `Nobody is signed out: every live token is v:2 and verifies on SESSION_KEY. ` +
            `Once it is shipped, the rollback-floor block in CLAUDE.md can come out.`);
        }
      }
    } catch { findings.push("STAGE 8 CHECK DID NOT RUN. Not an all-clear."); }
  }

  /* ── Expansion 1: people still wired into automations ──
     Every "did not run" pushes a finding rather than passing silently —
     a check that cannot run must never read as an all-clear. */
  try {
    const roster = await sbGet(env, "gcfcr-hr-team-v1");
    const statusMap = (await sbGet(env, "gcfcr-hr-status").catch(() => null)) || {};
    if (!Array.isArray(roster) || !roster.length) {
      findings.push("PEOPLE CHECK DID NOT RUN — the HR roster could not be read. Not an all-clear.");
    } else {
      /* ⚠️ NO LOCAL normName HERE. There was one, and it shadowed the import at
         the top of this file — it kept spaces and punctuation where the
         canonical one strips them, so the check that finds hardcoded people
         matched names on a different rule than the rest of the Worker. That is
         the drift rule 8 exists for, in the one function whose whole job is
         deciding whether two names are the same person. Use the import. */
      for (const p of SWEEP_PEOPLE) {
        const want = normName(p.name);
        const row = roster.find((r) => (p.partial ? normName(r.name).startsWith(want) : normName(r.name) === want))
          || roster.find((r) => normName(r.name).includes(want));
        if (!row) {
          findings.push(`WIRED BUT GONE — ${p.name} is not on the HR roster, yet is still hardcoded into: ${p.where}.`);
          continue;
        }
        const numId = String(row.id || "").replace(/^tm/i, "");
        const inactive = normName(row.status) !== "active" || normName(statusMap[numId]) === "terminated";
        if (inactive) {
          findings.push(`WIRED BUT INACTIVE — ${p.name} reads "${row.status || statusMap[numId] || "unknown"}" in HR, yet is still hardcoded into: ${p.where}.`);
        }
      }
    }
  } catch (e) { findings.push(`PEOPLE CHECK DID NOT RUN (${String(e)}). Not an all-clear.`); }

  /* ── Expansion 2: census delta + saturation ── */
  try {
    const census = (await sbGetStrict(env, "gcfcr-kvset-anon-keys-v1")) || {};
    const keys = Object.keys(census).sort();
    /* ⚠️ AFTER `keys` IS CAPTURED AND BEFORE THE DELTA BELOW, deliberately, so
       the snapshot written at the end of this block is today's real list and
       tomorrow's delta is measured against it. Clearing earlier would erase the
       list this run is reporting on. */
    if (opts.rollCensus && keys.length < SWEEP_CENSUS_CAP) {
      let rolled = false;
      const dryRun = !!(env && env.__QUIET);
      try {
        if (!dryRun) { await sbSet(env, "gcfcr-kvset-anon-keys-v1", {}); rolled = true; }
      } catch (e) { console.error("census re-baseline failed:", e); }
      const total = Object.values(census).reduce((n, v) => n + (Number(v) || 0), 0);
      findings.push(
        `CENSUS RE-BASELINED ON PURPOSE — ${keys.length} key families, ${total} writes, cleared. ` +
        (dryRun
          ? `Dry run, so nothing was actually cleared.`
          : rolled
          ? `The counts were cumulative and mostly predate the Aug 8 sliding session, so they were measuring a fixed problem. From tomorrow this map reads the world as it is now, and anything still writing without a sign-in reappears within a day as a NEW ANONYMOUS WRITER.`
          : `Could NOT clear it, so the baseline is unchanged. This needs a look.`)
      );
    }
    if (keys.length >= SWEEP_CENSUS_CAP) {
      /* ★★ ROLL IT, DO NOT JUST COMPLAIN ABOUT IT.
         🐛 Reported Aug 2 AND Aug 3 2026, identically. The census stops
         recording NEW keys at the cap (see /api/kv-set), so once it fills, the
         one instrument watching the last open write door is blind — and it
         stayed blind, because the only remedy on offer was a hand edit to
         production KV, which is exactly the thing this store does not do.
         An alarm whose only fix is a manual database edit is an alarm that
         stays broken. So the sweep now clears the map itself, after taking the
         snapshot the delta check uses. Tomorrow starts recording again, and
         anything still writing anonymously reappears within a day and shows up
         as a NEW ANONYMOUS WRITER — which is the signal we actually want.
         ⚠️ CLEARS ONLY. It does NOT touch the snapshot, and that is deliberate:
         `keys` is already captured above, the delta check below still compares
         against the PREVIOUS snapshot, and the existing write at the end of
         this block then stores today's list. Snapshotting here as well would
         overwrite the old one before the delta had been measured, so nothing
         would ever read as new on the day it rolls — the alarm would go quiet
         at the exact moment it was meant to speak up. */
      /* ⚠️⚠️ A DRY RUN MUST NOT CLEAR PRODUCTION MONITORING DATA (Aug 9 2026
         sweep, finding 20). This is the worst of the four writes in this job:
         it EMPTIES the live census of anonymous writers, and CRON-JOBS.md
         publishes the manual URL that CLAUDE.md tells Matt to add `&quiet=1`
         to. The documented safe rehearsal wiped the record. */
      let rolled = false;
      const dryRun = !!(env && env.__QUIET);
      try {
        if (!dryRun) { await sbSet(env, "gcfcr-kvset-anon-keys-v1", {}); rolled = true; }
      } catch (e) { console.error("census roll failed:", e); }
      findings.push(
        `CENSUS MAP FULL (${keys.length}/${SWEEP_CENSUS_CAP}) — it stopped recording new anonymous writers. ` +
        (dryRun
          ? `Dry run, so it was NOT cleared and the map is still full. Run it for real to roll it.`
          : rolled
          ? `Cleared it just now, so tomorrow's sweep sees a fresh list; anything still writing without a sign-in will reappear as a NEW ANONYMOUS WRITER.`
          : `Could NOT clear it — the door still cannot be judged. This needs a look.`)
      );
    }
    const snap = await sbGet(env, SWEEP_CENSUS_SNAP_KEY).catch(() => null);
    if (snap && Array.isArray(snap.keys)) {
      /* ⚠️ BOTH SIDES THROUGH censusFamily. Yesterday's snapshot holds EXACT
         keys and today's holds families, so a raw compare would report every
         caller as a brand-new anonymous writer on the day this ships — the
         alarm crying wolf at the exact moment it started working properly. */
      const seen = new Set(snap.keys.map(censusFamily));
      const fresh = keys.filter((k) => !seen.has(censusFamily(k)));
      if (fresh.length) {
        findings.push(`NEW ANONYMOUS WRITER${fresh.length === 1 ? "" : "S"} since ${snap.at || "the last sweep"} — ${fresh.join(", ")}. Something is still saving without a sign-in.`);
      }
    }
    /* ⚠️ AND NOT THE SNAPSHOT EITHER. The NEW ANONYMOUS WRITER delta above
       compares today against this. Writing it on a rehearsal folds the new
       writer into "already seen", so the next real run computes an empty delta
       and the alarm never fires. It is one-shot by design, so consuming it
       consumes it permanently — on the last write door that is still open. */
    if (!(env && env.__QUIET)) await sbSet(env, SWEEP_CENSUS_SNAP_KEY, { at: isoOfD(nowET()), keys });
  } catch (e) { findings.push(`CENSUS CHECK DID NOT RUN (${String(e)}). Not an all-clear.`); }

  /* ── Expansion 3: emails in the shipped bundle ──
     Reads the same bytes the site serves, through the ASSETS binding —
     in process, so the own-hostname 522 trap cannot bite. This is the
     two-doors roster-leak lesson as a daily tripwire. */
  try {
    const idx = await env.ASSETS.fetch(new Request("https://sweep.internal/index.html"));
    const html = idx.ok ? await idx.text() : "";
    const seed = [...html.matchAll(/\/assets\/[A-Za-z0-9._-]+\.js/g)].map((m) => m[0]);
    if (!seed.length) {
      findings.push("BUNDLE SCAN DID NOT RUN — index.html named no /assets/ chunks. Not an all-clear.");
    } else {
      const leaked = new Set();
      const nameHits = [];
      let nameHitTotal = 0;
      /* ⚠️⚠️ A WALK, NOT A LIST, AND THE DIFFERENCE IS ABOUT 98% OF THE APP.
         index.html names ONE script: the entry. Every lazily-loaded tile — Cash
         Audit, EOS, Facilities, HR Console, Daily Setup — is reached by dynamic
         import and appears nowhere in it. MEASURED 12 Aug 2026: index.html named
         1 chunk; dist/assets held 54. So this scan had been reading the entry
         chunk and reporting the silence of the other fifty-three as an
         all-clear, which is the exact shape of failure it exists to catch.
         Chunks name their siblings as "./Name-hash.js", so the entry reaches
         every one of them transitively. */
      const seen = new Set(seed);
      const queue = [...seed];
      const chunks = [];
      let capped = false;
      while (queue.length) {
        if (chunks.length >= SWEEP_BUNDLE_CHUNK_CAP) { capped = true; break; }
        const path = queue.shift();
        const r = await env.ASSETS.fetch(new Request(`https://sweep.internal${path}`));
        if (!r.ok) { findings.push(`BUNDLE SCAN could not read ${path} (${r.status}).`); continue; }
        const js = await r.text();
        chunks.push(path);
        for (const m of js.matchAll(/"\.\/([A-Za-z0-9._-]+\.js)"/g)) {
          const next = "/assets/" + m[1];
          if (!seen.has(next)) { seen.add(next); queue.push(next); }
        }
        for (const m of js.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)) {
          const e = m[0].toLowerCase();
          if (!sweepEmailAllowed(e) && !/\.(png|jpe?g|svg|webp|gif|woff2?)$/.test(e)) leaked.add(e);
        }
        /* People, in sentences. The thing no other check has ever looked for. */
        for (const person of SWEEP_FORBIDDEN_NAMES) {
          const nm = String(person || "").trim();
          if (!nm) continue;
          for (const m of js.matchAll(sweepNameRe(nm))) {
            nameHitTotal += 1;
            if (nameHits.length >= SWEEP_NAME_HITS_CAP) continue;
            const around = js.slice(Math.max(0, m.index - 45), m.index + 45).replace(/\s+/g, " ");
            nameHits.push(nm + " in " + path.split("/").pop() + ": …" + around + "…");
          }
        }
      }
      /* ⚠️ NO SILENT CAP. A truncated scan that says nothing reads exactly like
         a clean one, which is the failure this whole job exists to avoid. */
      if (capped) {
        /* ⚠️ THE WORDING CHANGED WITH THE CAP. "Not an all-clear" every single
           morning, for a thing that is now covered elsewhere, is how a report
           trains its reader to skip it. It says what this scan is FOR and where
           the full one lives, so a truncation is informative rather than an
           alarm nobody can act on. */
        findings.push(
          "Bundle spot-check covered " + SWEEP_BUNDLE_CHUNK_CAP + " chunks — the entry chunk and its " +
          "neighbours, which is what catches a bad deploy or a stale cache. Full coverage of every " +
          "chunk runs at build time in bundleScan.test.mjs, before anything ships.");
      }
      if (nameHitTotal) {
        findings.push(
          "SOMEONE ELSE'S PEOPLE IN THE BUNDLE — " + nameHitTotal + " mention" + (nameHitTotal === 1 ? "" : "s") +
          " across " + chunks.length + " chunks. These ship to every phone that opens this store's Hub:\n  " +
          nameHits.join("\n  ") +
          (nameHitTotal > nameHits.length ? "\n  …and " + (nameHitTotal - nameHits.length) + " more." : "")
        );
      }
      if (leaked.size) {
        const list = [...leaked];
        findings.push(`EMAIL IN THE BUNDLE — ${list.slice(0, 6).join(", ")}${list.length > 6 ? ` +${list.length - 6} more` : ""} ships to every browser that opens the Hub. Find the import that dragged it in.`);
      }
    }
  } catch (e) { findings.push(`BUNDLE SCAN DID NOT RUN (${String(e)}). Not an all-clear.`); }

  /* ── Expansion 4: the outside door probes' heartbeat ── */
  try {
    const hb = await sbGet(env, SWEEP_PROBE_KEY);
    if (!hb || !hb.at) {
      findings.push("OUTSIDE PROBES HAVE NEVER REPORTED — the door-probes GitHub Action is not running yet (workflow not merged, or the HUB_JOB_KEY secret is missing). The doors are not being watched from outside.");
    } else {
      const ageH = (Date.now() - Date.parse(hb.at)) / 36e5;
      if (!(ageH < SWEEP_PROBE_STALE_H)) {
        findings.push(`OUTSIDE PROBES DEAD — last heartbeat ${hb.at}. A dead probe must never read as an all-clear; check the GitHub Action.`);
      } else if (Array.isArray(hb.fails) && hb.fails.length) {
        findings.push(`DOOR ANSWERED WITHOUT A SIGN-IN (probed from outside): ${hb.fails.join(", ")}. Lock it back down.`);
      }
    }
  } catch (e) { findings.push(`PROBE CHECK DID NOT RUN (${String(e)}). Not an all-clear.`); }

  /* Only speak on a CHANGE or while something is still open. Repeating an
     unchanged list every morning is how it becomes wallpaper. */
  const prev = (await sbGet(env, SEC_STATE_KEY).catch(() => null)) || {};
  const now = isoOfD(nowET());
  const signature = findings.slice().sort().join("|");
  const changed = signature !== (prev.signature || "");

  if (findings.length) {
    if (changed || prev.lastPosted !== now) {
      const text = `*Hub security sweep — ${now}*\n` +
        `${findings.length} item${findings.length === 1 ? " needs" : "s need"} attention:\n` +
        findings.map((f) => `• ${f}`).join("\n") +
        `\n\nTested from outside with the public key, the same way anyone with the site open would.`;
      /* ⚠️ HONOUR QUIET. Every other job routes through postToSlackChannel,
         which checks __QUIET; this one DMs via sendSlack directly and so
         ignored it. A `&quiet=1` test therefore still fired a real DM — the
         opposite of what quiet means, and exactly the "annoy people while
         testing" outcome the flag exists to prevent. */
      /* ⚠️ RESOLVED AT THE TOP OF THIS FUNCTION, not asked again here. Two
         lookups is two answers to "who is this going to", and the reachability
         finding above would be reasoning about a different one. */
      const secTo = reachSlack;
      if (env && env.__QUIET) {
        console.log(`[quiet] would DM ${secTo}:\n${text}`);
        if (env.SWEEP_COPY_EMAIL) console.log(`[quiet] would also email ${env.SWEEP_COPY_EMAIL}`);
      } else if (secTo) {
        try { await sendSlack(env, secTo, text); } catch (e) { console.error("security sweep post failed:", e); }
      }
      /* ⚠️ AFTER THE DM AND OUTSIDE ITS catch, so neither can cost the other.
         ⚠️ AND NOT GATED ON `secTo`. A clone that has not wired its own Slack
         yet has no owner to DM — which is precisely the store whose report
         needs to reach somebody, so the copy must not be conditional on the
         thing that is missing. */
      if (!(env && env.__QUIET)) {
        await sweepCopyOut(env, `${findings.length} item${findings.length === 1 ? "" : "s"} need attention`, text);
      }
      /* ⚠️ QUIET MEANS NO CONSEQUENCES, INCLUDING STATE (finding 19). Both
         quiet checks in this job wrapped the DM and left the state writes bare.
         Stamping `lastPosted` on a rehearsal makes the real 5am run read
         `changed || prev.lastPosted !== now` as false and return "unchanged
         today" with an open hole reported to nobody. Matt's day starts at 3am,
         so a pre-dawn test lands squarely before the real run. */
      if (env && env.__QUIET) {
        return { quiet: true, findings: findings.length, posted: false, changed, reachable: !!(reachSlack || reachEmail), note: "state NOT written" };
      }
      await sbSet(env, SEC_STATE_KEY, { signature, lastPosted: now, findings });
      return { findings: findings.length, posted: true, changed, reachable: !!(reachSlack || reachEmail) };
    }
    return { findings: findings.length, posted: false, reason: "unchanged today", reachable: !!(reachSlack || reachEmail) };
  }

  /* Going from findings to none IS worth one message. It is the only good news
     this job can deliver and it confirms a fix actually landed. */
  if ((prev.findings || []).length) {
    const clearText = `*Hub security sweep — ${now}*\nAll clear. Everything flagged previously is now closed.`;
    const clearTo = reachSlack;   // same one resolved at the top
    if (env && env.__QUIET) console.log(`[quiet] would DM ${clearTo}:\n${clearText}`);
    else if (clearTo) try { await sendSlack(env, clearTo, clearText); } catch {}
    /* ⚠️ THE ALL-CLEAR TRAVELS TOO. It only fires when something WAS open, so
       it is not daily noise — it is the one message that confirms a fix landed,
       and a fleet watcher who only ever hears bad news cannot tell a fixed
       store from a silent one. */
    if (!(env && env.__QUIET)) await sweepCopyOut(env, "all clear", clearText);
  }
  /* ⚠️ THE SAME RULE ON THE ALL-CLEAR PATH. Writing `findings: []` here on a
     rehearsal means the real run sees nothing previously open, so the "All
     clear" DM — the only confirmation a security fix actually landed — is never
     sent, and there is no second chance at it. */
  if (env && env.__QUIET) {
    return { quiet: true, findings: 0, posted: false, note: "all-clear state NOT written" };
  }
  await sbSet(env, SEC_STATE_KEY, { signature: "", lastPosted: now, findings: [] });
  return { findings: 0, posted: false };
}

/* ═══════════════════════════════════════════════════════════════════
   L10 RECAP → NICK (Matt, Jul 30: "nick likes meeting summaries so for
   every L10 can you send a meeting summary or recap weekly?")

   ★ THE TRIGGER IS A MEETING, NOT A WEEKDAY. This job runs every evening
   and sends NOTHING unless an L10 actually ended today — it reads
   eos:meetinglog, which EOSTile.jsx writes the moment someone taps "End
   meeting". If the meeting moves from Tuesday to Thursday, the recap
   moves with it and no schedule needs editing. A silent evening means
   "no meeting today", which is the correct message to not send.

   ⚠️ eos:meetinglog had a history of being documented but never written
   (the EOSTile header promised it for weeks while endMeeting discarded
   the rating and notes). If this job seems dead, check that key has
   entries BEFORE blaming the cron — an empty log makes this job
   correctly, silently, do nothing forever. */
const RECAP_STATE_KEY = "eos:recap-state-v1";
/* Labels and goals MIRROR seedScorecard in EOSTile.jsx — the live scorecard
   value only stores { actual, hit } per row, so the words come from here.
   s9 was removed Jul 23; do not re-add it. If a row is added or renamed in
   EOSTile, this list must change in the same commit. */
const RECAP_ROWS = [
  ["s1", "Sales vs LY", "+5%"],
  ["s2", "Food cost %", "≤ 29.5%"],
  ["s3", "Labor %", "≤ 24%"],
  ["s4", "Speed of service", "≤ 3:30"],
  ["s5", "Turnover (rolling 90d)", "≤ 8%"],
  ["s6", "Evals completed on time", "≥ 90%"],
  ["s7", "Promotion-ready leaders", "≥ 6"],
  ["s8", "Cash audit variance", "≤ $10"],
  ["s10", "CEM Overall Satisfaction", "≥ 83%"],
  ["s11", "CEM Fast Service", "≥ 78%"],
];

async function runL10Recap(env) {
  const today = isoOfD(nowET());
  const log = await sbGet(env, "eos:meetinglog").catch(() => null);
  const meeting = (Array.isArray(log) ? log : []).filter((e) => e && e.date === today).pop();
  if (!meeting) return { skipped: "no L10 ended today" };

  /* One recap per meeting day, even if the cron fires twice or someone runs
     the URL by hand after it already sent. */
  const state = (await sbGet(env, RECAP_STATE_KEY).catch(() => null)) || {};
  if (state.lastSentFor === today) return { skipped: `already sent for ${today}` };

  const period = eosPeriod(nowET());
  /* Rocks live under the ACTIVE quarter. Usually that is the calendar
     quarter; right after a roll that has not been reviewed yet, the live
     Rocks still sit under the previous quarter's key. Try current, then
     step back one. */
  const prevQ = (() => {
    const [y, q] = period.split("-Q").map(Number);
    return q === 1 ? `${y - 1}-Q4` : `${y}-Q${q - 1}`;
  })();
  const [score, rocksA, rocksB, coA, coB, issues, todos] = await Promise.all([
    sbGet(env, `eos:scorecard:${period}`).catch(() => null),
    sbGet(env, `eos:rocks:${period}`).catch(() => null),
    sbGet(env, `eos:rocks:${prevQ}`).catch(() => null),
    sbGet(env, `eos:companyrocks:${period}`).catch(() => null),
    sbGet(env, `eos:companyrocks:${prevQ}`).catch(() => null),
    sbGet(env, "eos:issues").catch(() => null),
    sbGet(env, "eos:todos").catch(() => null),
  ]);
  const pick = (a, b) => (Array.isArray(a) && a.length ? a : Array.isArray(b) ? b : []);
  const rocks = [...pick(rocksA, rocksB), ...pick(coA, coB)];

  const lines = [];
  const dayLabel = new Date(`${today}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric",
  });
  lines.push(`*L10 recap — ${dayLabel}*${meeting.rating ? ` · team rated it ${meeting.rating}/10` : ""}${meeting.monthClose ? " · month-close agenda" : ""}`);

  /* Scorecard: only rows that actually reported (hit is a boolean). A row
     nobody filled in is "not reported", never counted as a miss — missing
     must not look like fine, but it must not look like failure either. */
  const sc = score && typeof score === "object" ? score : {};
  const reported = RECAP_ROWS.filter(([id]) => typeof sc[id]?.hit === "boolean");
  if (reported.length) {
    const hitN = reported.filter(([id]) => sc[id].hit).length;
    lines.push("");
    lines.push(`*Scorecard (${period.replace("-", " ")}):* ${hitN} of ${reported.length} reporting rows on goal`);
    reported.filter(([id]) => !sc[id].hit).forEach(([id, label, goal]) => {
      const actual = sc[id].actual != null && sc[id].actual !== "" ? sc[id].actual : "?";
      lines.push(`  • Missed: ${label} — ${actual} against ${goal}`);
    });
    const silent = RECAP_ROWS.length - reported.length;
    if (silent) lines.push(`  • ${silent} row${silent === 1 ? "" : "s"} not reported this week`);
  }

  if (rocks.length) {
    const by = (s) => rocks.filter((r) => r && r.status === s);
    lines.push("");
    lines.push(`*Rocks:* ${by("on").length} on track · ${by("off").length} off track · ${by("done").length} done`);
    by("off").forEach((r) => lines.push(`  • Off track: ${r.title} (${r.owner || r.champion || "unowned"})`));
  }

  /* Prefer the counts EOSTile captured at "End meeting" — that is what the
     room actually saw. The live keys are the fallback for entries written
     before those fields existed. */
  const openIssues = Number.isFinite(meeting.issuesOpen) ? meeting.issuesOpen : Array.isArray(issues) ? issues.length : 0;
  const openTodos = Number.isFinite(meeting.todosOpen) ? meeting.todosOpen : Array.isArray(todos) ? todos.filter((t) => t && !t.done).length : 0;
  const doneTodos = Number.isFinite(meeting.todosDone) ? meeting.todosDone : Array.isArray(todos) ? todos.filter((t) => t && t.done).length : 0;
  lines.push("");
  lines.push(`*Issues:* ${openIssues} open on the list`);
  lines.push(`*To-dos:* ${openTodos} open · ${doneTodos} done`);

  const clip = (s) => (String(s).length > 500 ? `${String(s).slice(0, 500)}…` : String(s));
  if (meeting.headlines) { lines.push(""); lines.push(`*Headlines:* ${clip(meeting.headlines)}`); }
  if (meeting.notes) { lines.push(""); lines.push(`*Wrap-up notes:* ${clip(meeting.notes)}`); }
  lines.push("");
  lines.push(`_Sent automatically by the ${STORE.appName} after each L10._`);
  const text = lines.join("\n");

  const recapTo = await notifyTarget(env, "l10Recap");
  if (env && env.__QUIET) {
    console.log(`[quiet] would DM ${recapTo}:\n${text}`);
  } else if (!recapTo) {
    return { skipped: "no l10Recap recipient configured" };
  } else {
    const res = await sendSlack(env, recapTo, text);
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new Error(`L10 recap DM failed: ${data.error || "unknown"}`);
    /* Mark sent ONLY after Slack accepted it — a state write before the send
       would make one failed post permanently swallow that day's recap. */
    await sbSet(env, RECAP_STATE_KEY, { lastSentFor: today, sentAt: new Date().toISOString() });
  }
  return { sent: !env.__QUIET, date: today, rated: meeting.rating || null };
}

/* ═══════════════════════════════════════════════════════════════════
   ONE-OFF: HASH THE REMAINING PLAINTEXT PINS.

   `gcfcr-hr-pins` held 106 four-digit PINs, 83 of them stored as plain text.
   /api/pin-verify already upgrades an entry to a salted hash the moment its
   owner next signs in, so the map drains by itself — but it drains at the speed
   people sign in. Measured Jul 29: 24 hashed, 82 to go. Anyone who does not sign
   in for a month stays in plain text for a month, and anyone who has left the
   store never converts at all.

   ⚠️ NOBODY'S PIN CHANGES. This hashes the SAME digits with the SAME functions
   /api/pin-verify uses, so every PIN keeps working exactly as before. It is the
   identical transformation, applied on a schedule of our choosing instead of
   theirs.

   ⚠️ IDEMPOTENT. Already-hashed entries are skipped, so running it twice
   converts nothing and cannot double-hash anyone into a locked-out state.

   ⚠️ ONE READ, ONE WRITE, AND IT RE-READS IMMEDIATELY BEFORE WRITING. HRConsole
   and pin-set write this same key; writing back a copy fetched at the start of
   a slow loop would silently drop any PIN set in between — the exact lost-update
   shape that erased Evelyn's documentation this morning.

   ⚠️ A malformed entry is LEFT ALONE, never rewritten. If it is not a plain
   string it is either already a hash or something this does not understand, and
   guessing at it would lock somebody out of the Hub. */
async function runPinHashMigrate(env) {
  const before = (await sbGetStrict(env, "gcfcr-hr-pins")) || {};
  if (!before || typeof before !== "object" || Array.isArray(before)) {
    return { error: "pin map is missing or not an object", converted: 0 };
  }

  const converted = {};
  let alreadyHashed = 0, skipped = 0;
  for (const [id, entry] of Object.entries(before)) {
    if (!pinIsLegacy(entry)) { alreadyHashed++; continue; }
    const pin = String(entry ?? "");
    if (!pin) { skipped++; continue; }
    const salt = pinNewSalt();
    converted[id] = { h: await pinHashHex(pin, salt), s: salt };
  }

  const n = Object.keys(converted).length;
  if (!n) return { converted: 0, alreadyHashed, skipped, total: Object.keys(before).length };

  /* Re-read, then merge ONLY the entries that were still legacy at this moment.
     If someone set a PIN while we were hashing, theirs wins and is left alone. */
  const fresh = (await sbGetStrict(env, "gcfcr-hr-pins")) || {};
  const out = fresh && typeof fresh === "object" && !Array.isArray(fresh) ? { ...fresh } : {};
  let written = 0;
  for (const [id, hashed] of Object.entries(converted)) {
    if (!pinIsLegacy(out[id])) continue;   // changed under us — leave it
    out[id] = hashed;
    written++;
  }
  if (written) await sbSet(env, "gcfcr-hr-pins", out);

  const remaining = Object.values(out).filter((e) => pinIsLegacy(e) && String(e ?? "")).length;
  return { converted: written, alreadyHashed, skipped, remaining, total: Object.keys(out).length };
}

/* ═══════════════════════════════════════════════════════════════════
   NEW-HIRE ONBOARDING NOTICE → Hannah and Bri.

   Hannah, Jul 29 2026: "when a new member finishes the onboarding link,
   please automatically add their file to HR console. Additionally, please send
   me a notification to add them to a Peak Reacher's Group. Also, please notify
   Bri that a new hire's file is in HR console and ready for pathway password."

   The file ALREADY lands in HR Console on its own — the onboarding page writes
   a `submissions` row and Onboarding Intake lists it. What nobody was told is
   that it arrived, so it sat there until somebody happened to look.

   ⚠️ A JOB, NOT A HOOK ON THE UPLOAD. The onboarding page is standalone HTML
   that talks straight to Supabase; if it posted its own notification, a failed
   post would vanish exactly the way Bri's application notice did this morning.
   A job that reconciles what has been seen against what has been announced
   cannot miss one: if today's run fails, tomorrow's still catches it.

   ⚠️ IT NAMES WHO IT HAS ALREADY ANNOUNCED, so re-running it never re-notifies.
   The alternative — "anything from the last 24 hours" — double-notifies on any
   retry and goes silent the first time the job is late.
   ═══════════════════════════════════════════════════════════════════ */
const ONBOARD_NOTIFIED_KEY = "gcfcr-onboarding-notified-v1";
const ONBOARD_NOTIFY_MAX = 200;

/* 🐛 v2 BECAUSE v1 IS POISONED (Aug 8 2026). The first version stamped the year
   on a `&quiet=1` dry run — see runHandbookReminder — so v1 already holds
   {year: 2026} from Matt's very first test, and reading it would skip the real
   December send. The record is not edited by hand; the key moves and the bad
   one goes unread, which is the same fix shape used elsewhere in this repo. */
const HANDBOOK_KEY = "gcfcr-handbook-reminder-v2";

/* ★ THE HANDBOOK REMINDER RIDES ON THIS JOB (Bri, Aug 7 2026: "Remind you and
   Hannah about the new handbook the last week of December").
   It lives here rather than as its own cron because this job already runs every
   morning, already DMs exactly these two people, and already knows how not to
   say a thing twice. A new cron line is something Matt has to add by hand at
   cron-job.org, and a job that speaks once a year is the worst possible one to
   have to remember to wire up.

   ⚠️ ONCE PER YEAR, KEYED BY YEAR. Dec 25-31 is seven daily runs and she asked
   for one message, not seven.
   ⚠️ AN UNREADABLE RECORD SENDS NOTHING. Sending anyway would mean sending
   every morning for a week, which is how a useful reminder becomes noise
   somebody mutes.
   ⚠️ ROLE TARGETS, NOT IDS. notifyTarget("hr") and ("leadership") are the same
   two this job already uses, so a second store points them at its own people
   instead of DMing Gate City. */
async function runHandbookReminder(env, forced) {
  const now = nowET();
  const year = now.getFullYear();
  // December is month 11. "Last week" read as the 25th onward — unambiguous,
  // and it never lands before Christmas.
  if (!forced && !(now.getMonth() === 11 && now.getDate() >= 25)) {
    return { sent: false, why: "not the last week of December" };
  }
  let prev = null;
  try { prev = await sbGet(env, HANDBOOK_KEY); }
  catch { return { sent: false, why: "could not read the reminder record" }; }
  if (!forced && prev && Number(prev.year) === year) {
    return { sent: false, why: `already sent for ${year}` };
  }
  /* ⚠️ THE ASK IS THE FIRST LINE NOW. It read "The new team handbook is due",
     then explained what week it was, then said who else got the message. Three
     lines, and the verb was in none of them.
     ⚠️ THE "who else has it" LINE IS KEPT BUT CUT TO FOUR WORDS. It stops her
     chasing Bri to ask, which earns its place; the sentence explaining what
     time of year it is does not — she can see a calendar. */
  const text =
    "*Send the new team handbook*\n" +
    `Before ${year + 1} starts.\n` +
    "Bri has this too.";
  let ok = true;
  try { await sendSlackDM(env, await notifyTarget(env, "hr"), text); }
  catch (e) { ok = false; console.error("handbook reminder -> HR failed:", e); }
  try { await sendSlackDM(env, await notifyTarget(env, "leadership"), text); }
  catch (e) { ok = false; console.error("handbook reminder -> leadership failed:", e); }
  /* Marked done only when BOTH landed — the same trade the hire notice below
     makes. A duplicate tomorrow morning is recoverable; a reminder nobody got
     is not, and this one does not come round again for a year.

     🐛 AND A DRY RUN MUST NOT STAMP IT (Aug 8 2026, found by Matt's first test).
     `&quiet=1` makes sendSlackDM log instead of send, so it returns true and
     nothing reaches Slack — and this line then recorded the year as done. One
     documented, harmless-by-design test in August would have silently cancelled
     the December send, and the failure would have been a message nobody got and
     nobody thought to look for.
     ⚠️ QUIET MEANS NO CONSEQUENCES, INCLUDING STATE. A dry run that writes is
     not a dry run.
     ⚠️ `forced` does not stamp either. force=1 skips the date gate, so stamping
     from one would let an out-of-season manual run cancel the real one. Erring
     toward "the reminder still happens" is the only safe direction here: the
     cost of a duplicate is an extra DM, the cost of a miss is a whole year. */
  const dryRun = !!(env && env.__QUIET) || !!forced;
  if (ok && !dryRun) { try { await sbSet(env, HANDBOOK_KEY, { year, at: new Date().toISOString() }); } catch {} }
  return { sent: ok, year, stamped: ok && !dryRun };
}

async function runOnboardingNotice(env, forced) {
  /* ⚠️ THE REMINDER RUNS FIRST, BEFORE THE EARLY RETURNS BELOW. This function
     stops as soon as there are no new hires to announce — and over Christmas
     there will be none. Putting the handbook check after them would be the same
     as not building it. Its own failures are contained so a bad reminder can
     never stop a hire being announced. */
  let handbook;
  try { handbook = await runHandbookReminder(env, forced); }
  catch (e) { handbook = { sent: false, why: "threw" }; console.error("handbook reminder threw:", e); }
  /* 30 days back. The intake list is small and a new hire who uploaded three
     weeks ago and was never announced is exactly the case this exists for. */
  const since = new Date(nowET().getTime() - 30 * 86400000).toISOString();
  const rows = await sbListSubmissions(env, "onboarding-intake", since);
  if (!Array.isArray(rows) || !rows.length) return { seen: 0, notified: 0, handbook };

  const prev = (await sbGet(env, ONBOARD_NOTIFIED_KEY)) || [];
  const done = new Set(Array.isArray(prev) ? prev.map(String) : []);
  const fresh = rows.filter((r) => r && r.id != null && !done.has(String(r.id)));
  if (!fresh.length) return { seen: rows.length, notified: 0, handbook };

  /* One message per hire, not one digest. Hannah has to DO something per
     person (add them to a Peak Reachers group), and a digest of four names is
     a task list she has to re-read and tick off in her head. */
  let sent = 0;
  const announced = [];
  for (const r of fresh) {
    const name = String((r.payload && r.payload.name) || r.submitted_by || "A new hire").trim();
    const minor = !!(r.payload && r.payload.minor);
    const when = String(r.submitted_at || "").slice(0, 10);

    /* ⚠️⚠️ THE TWO THINGS SHE HAS TO DO WERE THE LAST LINE. The message opened
       with an event, explained where a file was, and only then said what she
       must do — so the ask was the part most likely to be skimmed past. It is
       first now, numbered, with the location demoted to the footer.
       ⚠️ "under 18" STAYS ON THE FIRST LINE. It changes what she is allowed to
       schedule them for, so it is not decoration. */
    const toHannah =
      `*${name} — 2 things to do*${minor ? "  ⚠️ under 18" : ""}\n` +
      "1. Match their upload on the roster\n" +
      `2. Add them to a ${(await storeBrand(env)).programName} group\n` +
      `HR Console → Onboarding Intake · ${when}`;
    /* ⚠️ THE ASK, NOT THE EVENT. "New hire file ready" is something that
       happened; setting the pathway password is the thing only she can do. */
    const toBri =
      `*Set the pathway password for ${name}*\n` +
      "Their file is ready in HR Console.";

    /* ⚠️ EACH SEND IS TRIED SEPARATELY AND A FAILURE DOES NOT MARK THE HIRE
       ANNOUNCED. If Bri's DM fails and Hannah's lands, this stays unannounced
       and both get it again tomorrow — a duplicate is recoverable, a hire
       nobody was told about is not. That is the trade this whole job exists to
       make. */
    let ok = true;
    try { await sendSlackDM(env, await notifyTarget(env, "hr"), toHannah); } catch (e) { ok = false; console.error("onboarding notice -> hr failed:", e); }
    try { await sendSlackDM(env, await notifyTarget(env, "leadership"), toBri); } catch (e) { ok = false; console.error("onboarding notice -> leadership failed:", e); }
    if (ok) { announced.push(String(r.id)); sent++; }
  }

  /* ⚠️⚠️ A DRY RUN MUST NOT CONSUME THE ONCE-ONLY FLAG (Aug 9 2026 sweep).
     🐛 `sendSlackDM` returns a fake `true` when env.__QUIET is set, so `ok`
     never goes false and every fresh hire lands in `announced`. Writing that
     list here marks them announced forever — the filter above drops anyone
     already in it — so the real 7am run skips them and NOBODY is told the hire
     finished onboarding. Their ID sits in HR Console with no one looking for it.
     ⚠️ THE COMMENT ABOVE sendSlackDM NAMES THIS JOB AS THE EXAMPLE of exactly
     this failure, from a different cause, and the unguarded write was still
     here. Knowing the story is not the same as closing the door. */
  if (env && env.__QUIET) {
    return { quiet: true, seen: rows.length, fresh: fresh.length, wouldNotify: sent, handbook, note: "announced list NOT written" };
  }
  if (announced.length) {
    await sbSet(env, ONBOARD_NOTIFIED_KEY, [...announced, ...[...done]].slice(0, ONBOARD_NOTIFY_MAX));
  }
  return { seen: rows.length, fresh: fresh.length, notified: sent, handbook };
}

async function runIpoWeeklyReminder(env) {
  const { key, weeks } = ipoQuarter(nowET(), QUARTER_PLANS);
  const todayISO = isoOfD(nowET());
  const wk = weeks.find((w) => todayISO >= w.start && todayISO <= w.end);
  if (!wk) return; // IPO plan not active this week — nothing to nudge

  const checked = (await sbGet(env, key)) || {};
  let total = 0, done = 0;
  const openCats = [];
  for (const c of wk.cats) {
    const count = c.items.length;
    let cDone = 0;
    for (let i = 0; i < count; i++) {
      total++;
      if (checked[`${c.id}-${i}`]) { done++; cDone++; }
    }
    if (cDone < count) openCats.push(`\u2022 ${c.name}: ${count - cDone} left`);
  }
  if (total === 0 || openCats.length === 0) return; // no plan yet, or week fully done — stay quiet

  const text =
    `*IPO Plan \u2014 ${wk.title} (${wk.dates})*\n` +
    `Directors: ${done}/${total} action items checked off this week. Still open:\n` +
    openCats.join("\n") +
    `\n\nCheck them off in the Hub \u2192 IPO Action Items.\n<!channel>`;
  await postToSlackChannel(env, IPO_DIRECTORS_CHANNEL, text);
}

// ═══════════════════════════════════════════════════════════════════
// JOB 8 — Daily AI ops digest → Slack #operational-success, ~7am ET.
// Also caches the digest (ai-summary:{date}) for the Hub's Today block.
// Generation, prompt, and KV caching live in aiSummary.js; this job just
// gathers the already-computed todo lines and hands off.
//
// COMBINED: this now also carries the Food Safety walkthrough reminder so
// mornings post ONE summary instead of two. After deploying, PAUSE the
// standalone "Food Safety Daily 8am" cron-job.org job (foodsafety-reminder).
// ═══════════════════════════════════════════════════════════════════
async function runDailyAiSummary(env) {
  if (!env.ANTHROPIC_API_KEY) { console.error("AI summary skipped: ANTHROPIC_API_KEY not set"); return; }
  const kv = { get: (k) => sbGet(env, k), set: (k, v) => sbSet(env, k, v) };
  const dateStr = isoOfD(nowET());
  let todos = [];
  try { todos = await buildTodaysTodos(env); } catch (e) { console.error("digest todos failed:", e); }
  /* ⚠️ THE MODEL IS TOLD WHICH RESTAURANT IT IS BRIEFING, and this is where that
     is decided. `storeBrand` is the Worker's one answer to "what is this store
     called": saved Store Settings first, deployed config as the fallback, and it
     never throws. A hardcoded name here would not print wrong at another store,
     it would make the AI write about a different restaurant. */
  const { storeName } = await storeBrand(env);
  const digest = await buildDailyDigest(kv, env, { dateStr, todos, prevDay: prevBizDayET(), storeName, force: true });
  const text =
    `*Morning Ops Digest — ${dateStr}*\n\n` +
    `${digest.text}\n\n` +
    `⚑ *Food Safety:* run today's walkthroughs (AM & PM) in the ${STORE.appName}.`;
  /* ⚠️ NO @channel PING HERE — DELIBERATE (Jul 28 2026).
     This is a 7am leadership SUMMARY, not a task anyone must drop what they
     are doing for. It pinged all 35 members every morning, which is the single
     highest-volume interruption the Hub produces. The post is unchanged and
     still lands in the channel; it simply no longer notifies everyone.
     Anyone who wants the alert can follow the channel or the digest reaches
     directors as a per-person AI summary already. */
  await postToSlackChannel(env, CHANNELS.opsSuccess, text);
}

/* ═══ TEAM EMAILS — SERVER-SIDE ONLY (Jul 31 2026) ═══════════════════════
   These 105 addresses used to sit in HRConsole.jsx's RAW_TEAM seed, which
   ships in the public bundle — anyone who opened the site's source could read
   every team member's personal email. They live HERE now because worker code
   is never served to a browser. The LIVE source of truth is the protected
   `gcfcr-hr-info` map (per-person rows, own-row-only reads); this seed
   backfills it once (job `emails-migrate`) and is the last-resort lookup.
   ⚠️ FIX AN ADDRESS IN HR CONSOLE, NOT HERE — hr-info wins over this seed
   everywhere. id 22 (Julie) has no email on file; not an omission. */

/* The HR and Bri summary copies are constants HERE, no longer trusted from the
   request body — a request could previously name ANY address as "the HR copy"
   and the store would email it. The client sends hrEmail/briEmail as plain
   booleans now (old bundles still send addresses; they are ignored). */

/* One person → one email, from HR data. `m` is { id, name, skipEmail? }.
   Any email the CLIENT sent is deliberately discarded — it shipped from a
   public bundle and could name any address. Order: the protected hr-info row,
   then the added-people list (covers hires newer than the seed), then the
   seed. The name fallback exists for payloads from bundles older than this
   change, which carry no id — those can only match added people; seed people
   without an id skip their copy until the device hard-refreshes.
   `skipEmail` is the explicit "HR copy only" marker (a pending write-up sends
   a sign request instead; emailing the filing too would double-notify). */
function emailFromSources(m, info, added) {
  if (!m || m.skipEmail) return "";
  const id = m.id != null && m.id !== "" ? String(m.id) : "";
  const nm = String(m.name || "").trim().toLowerCase();
  if (id) {
    const row = info ? info[id] : null;
    if (row && String(row.email || "").trim()) return String(row.email).trim();
    const a = (added || []).find((x) => x && String(x.id) === id && String(x.email || "").trim());
    if (a) return String(a.email).trim();
    if (EMAIL_SEED[id]) return EMAIL_SEED[id];
    return "";
  }
  if (nm) {
    const a = (added || []).find((x) => x && String(x.name || "").trim().toLowerCase() === nm && String(x.email || "").trim());
    if (a) return String(a.email).trim();
  }
  return "";
}

/* Mutates the parsed /api/notify body in place: fills member/recipient emails
   from HR data and swaps the summary flags for the real constants. One read
   of each source per request, shared across every recipient. */
async function resolveNotifyEmails(env, b) {
  const [info, added] = await Promise.all([
    sbGetStrict(env, "gcfcr-hr-info").catch(() => null),
    sbGet(env, HR_ADDED_KEY).catch(() => null),
  ]);
  const inf = info && typeof info === "object" && !Array.isArray(info) ? info : {};
  const add = Array.isArray(added) ? added : [];
  if (b.member) b.member = { ...b.member, email: emailFromSources(b.member, inf, add) };
  if (Array.isArray(b.recipients)) {
    b.recipients = b.recipients.map((r) => ({ ...r, email: emailFromSources(r, inf, add) }));
  }
  if (b.hrEmail) b.hrEmail = HR_SUMMARY_EMAIL;
  if (b.briEmail) b.briEmail = BRI_SUMMARY_EMAIL;
  return b;
}

/* One-off backfill (Jul 31 2026): copy EMAIL_SEED + added-row emails into the
   protected gcfcr-hr-info map, so HR Console DISPLAYS an email for everyone
   without the public-bundle seed it used to lean on. Idempotent — an email
   already present in hr-info is never overwritten, so re-runs fill 0 and any
   correction made in HR Console survives. ⚠️ Run at a QUIET hour: this is one
   read-modify-write of the whole map, and an HR edit landing in that same
   second could be lost. Usage: /api/run-job?job=emails-migrate&key=... */
async function runEmailsMigrate(env) {
  const info = (await sbGetStrict(env, "gcfcr-hr-info")) || {};
  const added = (await sbGet(env, HR_ADDED_KEY)) || [];
  let filled = 0, alreadyHad = 0;
  const put = (id, email) => {
    const k = String(id); const em = String(email || "").trim();
    if (!em) return;
    const row = info[k] || {};
    if (String(row.email || "").trim()) { alreadyHad++; return; }
    info[k] = { ...row, email: em }; filled++;
  };
  for (const [id, em] of Object.entries(EMAIL_SEED)) put(id, em);
  for (const a of Array.isArray(added) ? added : []) if (a && a.id) put(a.id, a.email);
  if (filled) await sbSet(env, "gcfcr-hr-info", info);
  return { filled, alreadyHad, wrote: filled > 0 };
}

// ═══════════════════════════════════════════════════════════════════
// /api/notify job builders — untouched; emails resolve upstream in
// resolveNotifyEmails before any builder runs.
// ═══════════════════════════════════════════════════════════════════
function jobsForWriteup(env, b) {
  const jobs = [];
  if (b.member?.email) {
    jobs.push(sendEmailOk(
      env, b.member.email, b.subject || "You have a document to review",
      `Hi ${b.member.name || "there"},\n\n` +
      `You have a new document to review and sign with your leader (dated ${b.date}). ` +
      `Please see your manager at your next shift.\n\n— ${STORE.legalName}`
    ));
  }
  if (b.hrEmail) {
    jobs.push(sendEmailOk(
      env, b.hrEmail, `Write-up logged — ${b.member?.name || "Team member"}`,
      `A ${b.type} was logged.\n\n` +
      `Team member: ${b.member?.name}\n` +
      `Date: ${b.date}\n` +
      `Issued by: ${b.issuedBy || "—"}\n\n` +
      `Details:\n${b.details || "(none)"}\n\n` +
      `Full record is in the Team Documentation hub.`
    ));
  }
  return jobs;
}

function jobsForFileEntry(env, b) {
  const jobs = [];
  /* ★ GOOD NEWS GOES TO THE PHONE (Matt, Aug 4 2026). An email lands in an inbox
     a team member may not open for days; a push lands now, which is the whole
     point of telling somebody they did well.
     ⚠️ ONLY when the entry is positive. A phone buzzing to say you were written
     up is how you teach people to dread opening the app, and the email still
     carries every entry either way. `positive` is decided in HRConsole off the
     entry's own points rather than a list of type ids here — one judgment, made
     where the points live. */
  if (b.positive && b.member?.name) {
    /* ⚠️ SWALLOWS ITS OWN FAILURE ON PURPOSE. These jobs are counted with
       allSettled and every rejection is reported to the caller as an EMAIL that
       did not go. A push that fails is not a failed email, and letting it land
       in that count would tell a leader their notice bounced when it did not.
       A missed push is a missed nudge; the email is still the record. */
    jobs.push(
      /* ★ ROUTED ON THE ID — this one is worse than the others when it goes
         wrong, because the body NAMES the issuing leader and the entry type,
         so a namesake was told the details of somebody else's file. */
      pushToPerson(env, b.member.name, {
        title: "Something good went on your file",
        body: `${b.issuedBy || "A leader"} logged ${b.type || "a positive note"} for you today. Open the Hub to read it.`,
        url: "/?to=hr",
      }, b.member.id).catch((e) => { console.error("positive-entry push failed:", String(e)); return null; })
    );
  }
  if (b.member?.email) {
    jobs.push(sendEmailOk(
      env, b.member.email, "A document was added to your file",
      `Hi ${b.member.name || "there"},\n\n` +
      `A new document was added to your team file (dated ${b.date}). ` +
      `Please see your leader if you have questions.\n\n— ${STORE.legalName}`
    ));
  }
  if (b.hrEmail) {
    jobs.push(sendEmailOk(
      env, b.hrEmail, `File entry added — ${b.member?.name || "Team member"}`,
      `A file entry was added.\n\n` +
      `Team member: ${b.member?.name}\n` +
      `Type: ${b.type || "—"}\n` +
      `Date: ${b.date}\n` +
      `Issued by: ${b.issuedBy || "—"}\n\n` +
      `Full record is in the HR Console.`
    ));
  }
  return jobs;
}

/* A leadership point was filed against a leader.

   Matt, Aug 3 2026, confirmed the leader is told the moment one is filed. That
   is deliberate and it is the fair half of the system: a points ladder that
   quietly accumulates until somebody is suddenly at a written warning is a
   trap, not a standard. Nobody should ever learn their total at the meeting.

   ⚠️ THE EMAIL SAYS THE TOTAL AND THE NEXT STEP, not just "you got a point".
   The whole reason this ladder exists is that people can see where they stand
   and act on it. A notice without the number tells them they are in trouble
   without telling them how much, which is worse than saying nothing.

   ⚠️ IT NEVER ACCUSES AND NEVER DECIDES. Every entry is filed by a person and
   this only reports what that person recorded. Same rule as the whole module:
   a count must never terminate or demote anyone on its own. */
function jobsForLeadershipPoint(env, b) {
  const jobs = [];
  const pts = Number(b.points) || 0;
  const total = Number(b.total) || 0;
  const nextAt = Number(b.nextAt) || 0;
  const toNext = nextAt > total ? nextAt - total : 0;

  if (b.member?.email) {
    const standing = b.stage
      ? `This puts you at the ${b.stage} step.`
      : (toNext > 0 ? `You are ${toNext} point${toNext === 1 ? "" : "s"} away from the next step.` : "");
    jobs.push(sendEmailOk(
      env, b.member.email, "A leadership standard was logged on your file",
      `Hi ${b.member.name || "there"},\n\n` +
      `${b.issuedBy || "A director"} logged a leadership standard on your file today.\n\n` +
      `What: ${b.details || "—"}\n` +
      `Points: ${pts}\n` +
      `Your rolling 90-day total: ${total}\n` +
      (standing ? `${standing}\n` : "") +
      `\nPoints expire 90 days after the date they were earned. ` +
      `If you think this is wrong, speak to the person who logged it or to HR — entries can be voided.\n\n` +
      `— ${STORE.legalName}`
    ));
  }
  if (b.hrEmail) {
    jobs.push(sendEmailOk(
      env, b.hrEmail, `Leadership standard logged — ${b.member?.name || "Leader"}`,
      `A leadership standard was logged.\n\n` +
      `Leader: ${b.member?.name}\n` +
      `What: ${b.details || "—"}\n` +
      `Points: ${pts}\n` +
      `Rolling 90-day total: ${total}${b.stage ? ` (${b.stage})` : ""}\n` +
      `Logged by: ${b.issuedBy || "—"}\n` +
      `Date: ${b.date || "—"}\n`
    ));
  }
  return jobs;
}

function jobsForInjury(env, b) {
  const jobs = [];
  if (b.member?.email) {
    jobs.push(sendEmailOk(
      env, b.member.email, "Workplace injury report received",
      `Hi ${b.member.name || "there"},\n\n` +
      `This confirms your workplace injury report dated ${b.date} was received. ` +
      `If you need medical attention, please seek care right away and let a leader know. ` +
      `HR has also been notified.\n\n— ${STORE.legalName}`
    ));
  }
  if (b.hrEmail) {
    jobs.push(sendEmailOk(
      env, b.hrEmail, `Injury reported — ${b.member?.name || "Team member"}`,
      `A workplace injury was reported.\n\n` +
      `Team member: ${b.member?.name}\n` +
      `Date: ${b.date}\n` +
      `Reported by: ${b.issuedBy || "—"}\n\n` +
      `Details:\n${b.details || "(none)"}\n\n` +
      `Full record is in the HR Console.`
    ));
  }
  return jobs;
}

function jobsForEval(env, b) {
  const jobs = [];
  if (b.member?.email) {
    jobs.push(sendEmailOk(
      env, b.member.email, "You have a new evaluation on file",
      `Hi ${b.member.name || "there"},\n\n` +
      `A new performance evaluation was completed for you (dated ${b.date}). ` +
      `Please see your leader to review it together.\n\n— ${STORE.legalName}`
    ));
  }
  if (b.hrEmail) {
    jobs.push(sendEmailOk(
      env, b.hrEmail, `Evaluation completed — ${b.member?.name || "Team member"}`,
      `An evaluation was completed.\n\n` +
      `Team member: ${b.member?.name}\n` +
      `Template: ${b.template || "—"}\n` +
      `Date: ${b.date}\n\n` +
      `Notes:\n${b.notes || "(none)"}\n\n` +
      `Full record is in Team Documentation.`
    ));
  }
  return jobs;
}

function jobsForDocSent(env, b) {
  const jobs = [];
  if (b.hrEmail) {
    jobs.push(sendEmailOk(
      env, b.hrEmail, `Document sent — ${b.docTitle || "Untitled document"}`,
      `"${b.docTitle}" was sent to ${b.count ?? "some"} team member(s).\n\n` +
      `Full send/acknowledgment status is in Team Documentation.`
    ));
  }
  return jobs;
}

function jobsForSignRequest(env, b) {
  const jobs = [];
  (b.recipients || []).forEach((r) => {
    if (!r.email) return;
    jobs.push(sendEmailOk(
      env, r.email, "You have a document to sign",
      `Hi ${r.name || "there"},\n\n` +
      `"${b.docTitle}" has been sent to you and needs your signature. ` +
      `Please see your leader to review and sign.\n\n— ${STORE.legalName}`
    ));
  });
  return jobs;
}

function jobsForSignatureComplete(env, b) {
  const jobs = [];
  if (b.briEmail) {
    jobs.push(sendEmailOk(
      env, b.briEmail, `Signature completed — ${b.member?.name || "Team member"}`,
      `${b.member?.name || "A team member"} signed ${b.itemKind || "an item"}: ${b.title || "—"}.\n\n` +
      `Signed by: ${b.signedBy || "—"}\n\n` +
      `Full record is in HR Console.`
    ));
  }
  return jobs;
}

function jobsGenericFallback(env, b) {
  const jobs = [];
  if (b.member?.email) {
    jobs.push(sendEmailOk(
      env, b.member.email, "You have a document to review",
      `Hi ${b.member.name || "there"},\n\n` +
      `You have a new document to review and sign with your leader (dated ${b.date || ""}). ` +
      `Please see your manager at your next shift.\n\n— ${STORE.legalName}`
    ));
  }
  if (b.hrEmail) {
    jobs.push(sendEmailOk(
      env, b.hrEmail, `Notification — ${b.member?.name || "Team member"}`,
      `A ${b.type || "notification"} was logged.\n\n` +
      `Team member: ${b.member?.name || "—"}\n` +
      `Date: ${b.date || "—"}\n` +
      `Issued by: ${b.issuedBy || "—"}\n\n` +
      `Details:\n${b.details || "(none)"}`
    ));
  }
  return jobs;
}

/* ── HR EVENTS → PUSH, ALONGSIDE THE EMAIL ──────────────────────────────
 * Matt, Jul 26: "If someone has an hr alert or needs signatures of any kind I
 * want them to get push alerts."
 *
 * These are EVENTS, not cadences — they fire when something happens to one
 * person, so they never belong in the input register (which tracks staleness
 * and would bend if events were forced into it). Same delivery path, different
 * trigger.
 *
 * ⚠️ THE EMAIL IS UNTOUCHED, AND SO IS THE hrEmail COPY. The ruled end state is
 * that the TEAM-MEMBER email becomes push and the HR copy stays as the formal
 * record — but push reaches five devices out of a hundred-plus today, so
 * removing the member's email now would leave most people with no channel at
 * all. This adds the second channel; the cut comes when adoption is real.
 *
 * Matched by NAME against the subscription store — no roster read, no HR
 * lookup. `isBoardOwner` is the same strict matcher the board routing uses, so
 * an ambiguous first name reaches NOBODY rather than the wrong person. On an
 * HR notice that matters more than anywhere else in the app: telling the wrong
 * team member they have a write-up to sign is not a recoverable mistake.
 */
/* 🐛 EVERY PUSH LANDED ON THE DASHBOARD (Matt, Aug 4 2026: "I got a push
   notification for a doc that needs signed but it didn't take me to it").
   A notification that tells you to do something and then does not take you
   there is worse than no notification — it moves the work of finding it onto
   the person you just interrupted.
   ⇒ `to` names the tool the message is about. App.jsx opens it on load; a kind
   with no `to` still lands on the dashboard, which is the honest default. */
const PUSH_ON_HR = {
  writeup:            { title: "Document to review",   body: "You have a document to review and sign with your leader.", to: "hr" },
  fileEntry:          { title: "Added to your file",   body: "A new entry was added to your file.", to: "hr" },
  injury:             { title: "Injury report filed",  body: "An injury report was filed. Please see a director.", to: "hr" },
  eval:               { title: "Evaluation",           body: "There is an evaluation update for you.", to: "hr" },
  docSent:            { title: "Document sent to you", body: "A document needs your review.", to: "hr" },
  "sign-request":     { title: "Signature needed",     body: "A document is waiting for your signature.", to: "hr" },
  signatureComplete:  { title: "Signature recorded",   body: "Your signature was recorded. Thank you.", to: "hr" },
};

/* ═══ L10 TOUCH-IN, DELIVERED TO PHONES ═══════════════════════════════════
   Matt, Jul 28 2026: "Set up the push and keep the list updated."

   ★ THE ATTENDEE LIST LIVES IN KV, NOT IN THIS FILE. `eos:l10-attendees`.
   The director team is mid-change — Daisy and Brandon join it on Saturday and
   Kyleeka leaves at the end of August — so a list hardcoded here would need a
   worker deploy every time the room changes, and would silently go stale in
   between. The default below is only what it falls back to when the key has
   never been written.
   ⚠️ EDIT THE KEY, NOT THIS ARRAY.

   ⚠️ THE CHANNEL POST REMAINS THE RECORD. Push reaches only the people who have
   enabled it (19 of the team as of Jul 28), so this is the nudge and Slack is
   still the source of truth. Do not remove the post in favour of this.        */
const L10_ATTENDEE_KEY = "eos:l10-attendees";
/* ⚠️ A FALLBACK THAT MUST NOT OUTLIVE ITS PEOPLE (Aug 5 2026 sweep).
   Kyleeka was in this list and came out with her Aug 4 removal from the
   EOS board. It was not firing: `eos:l10-attendees` holds the live three and the
   stored list wins. But a fallback is only ever read on the day something has
   gone wrong, and handing a departed director a push on exactly that day is the
   worst possible moment for it. Matched to what the key actually holds. */

async function pushL10TouchIn(env) {
  let names = L10_ATTENDEE_DEFAULT;
  try {
    const stored = await sbGet(env, L10_ATTENDEE_KEY);
    if (Array.isArray(stored) && stored.length) names = stored.filter(Boolean).map(String);
  } catch { /* default stands */ }

  /* ⚠️ NO MEETING DATE IN THE TEXT, AND NO IMPORT OF `nextL10`.
     The first cut imported it from l10Schedule.js so the date could never go
     stale. That is right in the app and WRONG here: this worker is deployed by
     pasting a single bundled file into Cloudflare's editor, where a sibling
     module does not exist — the import alone produced 41 errors and blocked the
     deploy.
     The alternative — copying the cadence rule into this file — is worse still,
     because a second copy of the meeting date is the exact fault l10Schedule.js
     was created to end.
     So the push carries no date. It does not need one: the job fires the day
     before the meeting, so "tomorrow" is always correct, and the Slack post
     beside it carries the full date as the record. */
  const out = { target: names.length, sent: 0, reached: 0, noSub: [] };
  for (const name of names) {
    try {
      const r = await pushToPerson(env, name, {
        title: "L10 tomorrow, 10:00 AM",
        body: "Scorecard, Rocks and issues in before the meeting. Open EOS to check yours.",
        url: "/",
      });
      const n = Number((r && r.sent) || 0);
      out.sent += n;
      out.reached += Number((r && r.reached) || 0);
      /* Named, not counted. "3 of 4 pushed" tells nobody who missed it, and the
         person who never gets one is exactly who this needs to surface. */
      if (!n) out.noSub.push(name);
    } catch { out.noSub.push(name); }
  }
  return out;
}

/* `uid` is OPTIONAL and, when present, it is the ONLY thing that decides who
   gets this. See the note below. Every caller without one keeps today's
   name matching exactly. */
async function pushToPerson(env, name, payloadObj, uid) {
  const wantId = bareId(uid);
  if (!name && !wantId) return { sent: 0, skipped: "no name" };
  try {
    const all = await pushSubsGet(env);
    /* ONE roster read for the whole lookup, not one per device. Built here
       rather than inside the loop because pushToPerson is called once per
       person on the board, and a read per device per person is the shape that
       turns a 30-person daypart into 900 reads. */
    const rosterNames = new Map();
    try {
      const roster = await sbGet(env, "gcfcr-hr-team-v1");
      if (Array.isArray(roster)) {
        for (const p of roster) {
          if (p && p.id && p.name) rosterNames.set(bareId(p.id), String(p.name));
        }
      }
    } catch { /* unreadable roster: every record is used as stored, see below */ }
    const owners = { names: [String(name || "")] };
    const uids = new Set();
    Object.values(all).forEach((rec) => {
      if (!rec || !rec.subscription || rec.uid == null) return;
      /* ★★ AN ID BEATS A NAME, AND NEVER FALLS BACK TO ONE.
         🐛 Matching on the name alone routes through isBoardOwner, which
         compares a first name plus the INITIAL of the second token. Across the
         real 106-person roster that gives exactly one colliding pair, and they
         are two different real people: `tm26 Lizbeth Gonzalez` (Team Leader)
         and `tm27 Lizbeth` (Assistant Director). So an injury
         report or a file entry filed on one of them buzzed BOTH their phones
         with "Injury report filed — please see a director."
         ⚠️ NO NAME FALLBACK WHEN AN ID WAS GIVEN. Falling back would restore
         the exact bug: the whole point is that a person who has an id and is
         not subscribed must resolve to nobody, never to a namesake. Same rule
         as isReachable. */
      if (wantId) { if (bareId(rec.uid) === wantId) uids.add(String(rec.uid)); return; }
      if (!rec.name) return;
      /* ⚠️⚠️ A STORED NAME THAT ITS OWN id DISAGREES WITH IS STALE, AND THE id
         WINS (Hannah, Aug 12 2026). Her watch buzzed "You are on LEADER FC"
         off the Wednesday lunch cell "✔️Thanh". She is not on the board at all:
         ONE record in gcfcr-push-subs-v1 carried `name: "Thanh Nguyen"` on
         `uid: 21`, which is Hannah's id — one device filed under two people,
         the only such row in the table. Matching on the name alone sent Thanh's
         alerts to Hannah's wrist.
         ⚠️ THE WRITE PATH IS ALREADY RIGHT and has been since it started taking
         the uid from the TOKEN and the name from the roster. It self-heals when
         somebody next signs in on that device — but a device nobody signs into
         again never heals, and it keeps receiving another person's shifts
         forever. This is the read half of that same rule.
         ⚠️ ONLY WHEN THE ROSTER GIVES A CONFIDENT ANSWER. An unreadable roster
         or an unknown id returns "" and the record is used as-is, because
         refusing every push the moment a roster read fails would silence the
         whole store to fix one row. Fail toward the old behaviour, not toward
         silence. */
      const trueName = rosterNames.get(bareId(rec.uid));
      const useName = trueName || rec.name;
      if (trueName && !isBoardOwner(rec.name, { names: [trueName] })) {
        console.log(`[push] stale sub name ignored: stored "${rec.name}" on uid ${rec.uid} is "${trueName}"`);
      }
      if (isBoardOwner(useName, owners)) uids.add(String(rec.uid));
    });
    /* ⚠️ QUIET RETURNS *AFTER* THE LOOKUP, NOT BEFORE IT (Matt, Aug 7 2026).
       It used to bail on the first line, before reading a single subscription,
       so a dry run reported `quiet: true` and nothing else — and shift-where's
       first real dry run came back onBoard 29, wouldSend 29, noAlerts 0. That
       reads as "all 29 are reachable" and it means "we never looked". The whole
       reason to run a job quiet is to find out what it WOULD do; a dry run that
       cannot tell you who it would fail to reach is worse than no dry run,
       because it answers confidently.
       Reading subscriptions sends nothing. Only the loop below sends, and quiet
       still never reaches it. */
    if (env && env.__QUIET) {
      console.log(`[quiet] would push to ${name} (${uids.size} device${uids.size === 1 ? "" : "s"}): ${payloadObj && payloadObj.title}`);
      return { sent: 0, quiet: true, reached: uids.size, wouldPush: name, title: payloadObj && payloadObj.title };
    }
    let sent = 0;
    const results = [];
    for (const uid of uids) {
      const r = await pushToUid(env, uid, payloadObj);
      if (r && Number(r.sent) > 0) sent += r.sent;
      if (r && Array.isArray(r.results)) results.push(...r.results);
    }
    return { sent, reached: uids.size, results };
  } catch (e) {
    // Never let a push failure take the email down — the email is still the
    // channel most of these people actually have.
    return { sent: 0, error: String(e) };
  }
}

const NOTIFY_JOB_BUILDERS = {
  leadershipPoint: jobsForLeadershipPoint,
  writeup: jobsForWriteup,
  fileEntry: jobsForFileEntry,
  injury: jobsForInjury,
  eval: jobsForEval,
  docSent: jobsForDocSent,
  "sign-request": jobsForSignRequest,
  signatureComplete: jobsForSignatureComplete,
};

// ═══════════════════════════════════════════════════════════════════
// Scheduled handler — routes on the cron pattern that fired (must match
// wrangler.toml's [triggers] crons exactly).
// ═══════════════════════════════════════════════════════════════════
async function handleScheduled(event, env) {
  const cron = event.cron;

  try {
    if (cron === "0 12 * * 0") {
      if (!(await alreadyRanToday(env, "cleaning-summary"))) await runCleaningSummary(env);
      if (!(await alreadyRanToday(env, "waste-report"))) await runWasteReport(env);
      return;
    }

    if (cron === "0 8 * * 1,4") {
      if (!(await alreadyRanToday(env, "audit-order-calc"))) await runAuditOrderCalc(env);
      return;
    }

    if (cron === "0 * * * *") {
      const et = nowET();
      if (et.getHours() === 7) {
        if (!(await alreadyRanToday(env, "ai-summary"))) await runDailyAiSummary(env);
      }
      if (et.getDay() === 1 && et.getHours() === 7) {
        if (!(await alreadyRanToday(env, "foodsafety-weekly"))) await runFoodSafetyWeekly(env);
      }
      /* ⚠️ `foodsafety-reminder` USED TO FIRE HERE AT 8 AM, AND MUST NOT.
         CRON-JOBS.md lists it under "Do NOT schedule this one": it is folded
         into `ai-summary` (7 AM, above) so the morning posts one message
         instead of two. Running both double-posts to #guardian-of-the-brand.
         `alreadyRanToday` would NOT have saved us — it dedups per job NAME,
         and these are two different names, so both would have run.
         Harmless until now only because [triggers] is commented out in
         wrangler.toml. It is still reachable by hand via
         /api/run-job?job=foodsafety-reminder, which is the intended way.
         ⚠️ The other times in this handler have not been reconciled against
         CRON-JOBS.md either. Do that before enabling Triggers. */
      if (et.getDay() === 1 && et.getHours() === 6) {
        if (!(await alreadyRanToday(env, "equip-reminder-flag"))) await runEquipmentReminderFlag(env);
      }
      if (et.getHours() === 9) {
        if (!(await alreadyRanToday(env, "trainer-tasks-summary"))) await runTrainerTasksSummary(env);
      }
      if (et.getDay() === 1 && et.getHours() === 8) {
        if (!(await alreadyRanToday(env, "ipo-weekly-reminder"))) await runIpoWeeklyReminder(env);
      }
      return;
    }
  } catch (e) {
    console.error(`scheduled job failed for cron "${cron}":`, e);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   JOB — `weekly-usage`. Monday morning adoption report.

   ★ DELIBERATELY DM-ONLY, NEVER A CHANNEL. Matt's standing direction
   (Jul 28): cut Slack noise, send straight to the person on the
   accountability chart. A channel post here would be read by 100 people
   who can't act on it and skimmed by the three who can. Recipients are
   hardcoded to the three directors who own the numbers.

   ⚠️ MEASURES COMPLETIONS, NOT TIMESTAMPS. The cleaning list writes its
   key the moment a day is OPENED — an empty {} still stamps updated_at.
   Reading updated_at made Claude tell Bri the cleaning list was dead when
   BOH was completing 14 items a week. Everything here counts ENTRIES.

   ⚠️ Attribution caveat that limits what this can fairly say: cleaning
   checks are hand-typed INITIALS ("LGR ", "Tcc"), and submissions take a
   free-text name. Only tool_events is keyed to the roster id. So the
   report names individuals ONLY from tool_events and the push list, and
   reports cleaning/checklists as COVERAGE, never per-person.
   ═══════════════════════════════════════════════════════════════════ */
/* Roles, resolved at send time — see notifyTarget. Three raw ids here meant a
   second store's adoption report would land in Gate City inboxes. */
const WEEKLY_USAGE_TO = ["owner", "hr", "leadership"];

// ISO week string, e.g. "2026-W31" — must match the cleaning tile's keys.
function isoWeekKey(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;          // Mon=1..Sun=7
  t.setUTCDate(t.getUTCDate() + 4 - day);  // nearest Thursday
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

// tool_events lives in its own table, not kv_store, so sbGet can't reach it.
/* ⚠️⚠️ IT PAGES, BECAUSE `limit=50000` WAS A LIE AND POSTGREST QUIETLY CAPPED IT
   AT 1,000 (Aug 12 2026).

   🐛 HOW THIS SURFACED. Matt test-ran the team scoreboard and got
   {"teams":7,"top":"The Nuggets","named":0}. Replaying the REAL directory and
   the REAL tool_events through the ranking gives "The Rush Masters" at 93%.
   Replaying it again using only the FIRST 1,000 events of the window gives
   "The Nuggets" at 82% — the live answer, reproduced exactly. The job was not
   ranking last week. It was ranking the oldest thousand rows of last week.

   ⚠️ NOTHING FAILED. There was no error, no empty result, no warning. The
   request succeeded, returned a valid array, and the array was a fraction of
   the answer — which is the worst possible failure for a number that gets
   posted to the whole store as a league table.

   ⚠️ THREE JOBS READ THROUGH HERE, NOT ONE, and the other two matter more than
   the scoreboard: `quietPeople` decides who gets nudged for not using the Hub,
   so a truncated read invents inactivity for people who were working, and
   `runWeeklyUsage` is the adoption report. Both were silently reading a
   fraction of the window on every run.

   ⚠️ `order=id.asc` IS NOT COSMETIC. Paging with offset over an UNORDERED
   result is undefined — PostgREST may repeat or skip rows between pages, and a
   duplicate row here would double-count somebody's tool opens. A stable sort is
   what makes the pages add up to the whole.

   ⚠️ A CALLER'S OWN `limit=` IS HONOURED AS A CEILING, not passed through, so
   the three existing call sites keep their intent (a cap on how much they are
   willing to pull) without fighting the pager for the same parameter name. */
const TE_PAGE = 1000;          // PostgREST's default max-rows; asking for more is ignored
const TE_HARD_CAP = 100000;    // a runaway stop, far above any real window

async function teQuery(env, qs) {
  /* Pull the caller's ceiling out of the query string and page up to it. */
  const params = new URLSearchParams(qs);
  const wanted = Number(params.get("limit"));
  params.delete("limit");
  params.delete("offset");
  const ceiling = Number.isFinite(wanted) && wanted > 0 ? Math.min(wanted, TE_HARD_CAP) : TE_HARD_CAP;
  const base = params.toString();

  const out = [];
  for (let offset = 0; offset < ceiling; offset += TE_PAGE) {
    const size = Math.min(TE_PAGE, ceiling - offset);
    const url = `${env.SUPABASE_URL}/rest/v1/tool_events?${base}&order=id.asc&offset=${offset}&limit=${size}`;
    /* ⚠️⚠️ A FAILED PAGE RETURNS NOTHING, NEVER WHAT WAS COLLECTED SO FAR.
       Returning the pages that happened to succeed would reintroduce the exact
       bug this function exists to fix, and reintroduce it in its nastiest form:
       a partial answer is indistinguishable from a real one, while an empty
       answer is visible everywhere downstream — the scoreboard says "nobody
       used the Hub in the window" and posts nothing at all. Losing a run is
       recoverable. Publishing a league table built on half the week is not. */
    let rows;
    try {
      const res = await fetch(url, {
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
      });
      if (!res.ok) return [];
      rows = await res.json();
    } catch { return []; }
    if (!Array.isArray(rows)) return [];
    out.push(...rows);
    /* A short page is the end of the data — the only stop condition that does
       not depend on knowing the total up front. An empty page is a short page. */
    if (rows.length < size) break;
  }
  return out;
}

/* WHO IS SET UP BUT QUIET — one definition, two callers.
   The weekly digest computed this inline and the Hub screen needs the same
   answer. Two copies of "who isn't using it" would drift, and the moment they
   disagree the person being nudged is the one paying for it. Same rule as
   normName and weekKeyOf: the shared judgement lives in exactly one place.

   ⚠️ IT IS TOOL OPENS, NOT THE SUBSCRIPTION STAMP. The push record's `at`
   refreshes every time a signed-in device loads the app, so it looks like a
   last-seen and is not one — a phone that reloads in someone's pocket would
   read as active. `tool_events` is somebody actually opening something.

   ⚠️ ONLY PEOPLE WITH ALERTS ON, deliberately. They are reachable and set up,
   so silence is a real signal rather than a missing install. Nudging someone
   who never installed it reaches nobody and tells you nothing. */
/* ═══ JOB — `team-scoreboard`. WHO IS USING THE HUB, BY TEAM ════════════════
   Matt, Aug 7 2026: "i want it to show top to bottom and all tool usage. i am
   overriding", and "This is strictly just informational."

   The arithmetic and every HR decision behind it live in teamScoreboard.js.
   This half only fetches, and it is deliberately thin: a job that both gathers
   and judges is a job whose judgement cannot be tested without a live Slack
   token.

   ★ JOINED BY ID, NEVER BY NAME. `gc-team-directory-v1` carries an `hrId` on
   each person and 90 of 91 are filled in, so a team maps to roster ids and
   roster ids ARE `tool_events.uid`. That matters more than it sounds: the
   directory's display names are first-name-and-initial ("Jose A.", "Camila
   L."), and matching those to a roster would be the exact fragile join that
   produced four separate defects on Aug 7 alone. A public post naming the
   wrong person is the worst failure this could have.

   ⚠️ NO MONEY, AND NONE IMPLIED. Bri killed the $500 and Matt confirmed nothing
   is being announced or decided. This posts a number and nothing else.

   ⚠️ MONDAY ONLY unless forced, same as the other weekly wrap-ups, because the
   store is closed Sunday and a channel post waits for Monday.

   ⚠️⚠️ ITS FIRST HONEST WEEK IS THE ONE AFTER THE SESSION FIX. Until Aug 7 an
   expired sign-in made /api/log-open drop the row silently, so anyone whose
   token had run out kept using the Hub and recorded nothing — that is how Nick
   showed as inactive the day after using it at the store. Numbers gathered
   before that fix UNDERSTATE every team, and a scoreboard's first outing must
   not name a team that was actually working. Run it quiet until a clean week
   has passed. */
async function runTeamScoreboard(env, forced) {
  if (!forced && nowET().getDay() !== 1) {
    return { skipped: "weekly, Mondays only, the store is closed Sunday" };
  }
  const dir = await sbGet(env, "gc-team-directory-v1");
  const rawTeams = dir && Array.isArray(dir.teams) ? dir.teams : null;
  /* A failed or empty read must not post "everybody is at 0%". */
  if (!rawTeams || !rawTeams.length) return { skipped: "team directory unreadable" };

  /* 🐛 THE NAMES CAME FROM THE WRONG ID SPACE AND NOBODY WAS EVER NAMED. First
     live run: {"teams":7,"top":"The Nuggets","named":0}. The ranking was right
     and the recognition line — the entire point of the post — was empty.

     The cause: this built its name map from `gcfcr-hr-team-v1`, whose ids are
     "tm1", "tm2", "tm3"… while tool_events.uid and the directory's hrId are
     "2", "14", "97". Two id spaces that look equally plausible in a comment and
     share not one value, so every lookup missed and the filter dropped
     everybody silently.

     ⇒ TAKE THE NAME FROM THE SAME RECORD AS THE ID. The directory already
     carries both — "Ben Smith" sits next to hrId "14" — so there is no second
     source to disagree with. A join that cannot be wrong beats a join that has
     to be checked. */
  const names = {};
  const teams = rawTeams.map((t) => {
    const members = [];
    for (const p of (t && t.people) || []) {
      if (!p || !p.hrId) continue;
      const id = String(p.hrId);
      members.push(id);
      /* First name only. The post is read by the whole store, and a full legal
         name in a recognition line reads like a summons. */
      const shown = String(p.name || "").trim();
      if (shown) names[id] = shown.split(" ")[0];
    }
    return { name: String((t && t.name) || "Team"), members };
  });

  const sinceISO = new Date(Date.now() - 7 * 86400000).toISOString();
  const rows = await teQuery(env, `select=uid,tool&opened_at=gte.${sinceISO}&limit=50000`);
  const byUid = {};
  for (const r of rows || []) {
    if (!r || !r.uid) continue;
    const k = String(r.uid);
    if (!byUid[k]) byUid[k] = new Set();
    if (r.tool) byUid[k].add(String(r.tool));
  }
  const activity = {};
  for (const k of Object.keys(byUid)) activity[k] = { tools: byUid[k].size };

  const ranked = rankTeams(teams, activity);
  const people = topPeople(ranked, teams, activity, names);
  const text = scoreboardMessage(ranked, { people });
  if (!text) return { skipped: "nobody used the Hub in the window" };

  /* ⚠️ THE TWO DESTINATIONS FAIL INDEPENDENTLY, added Aug 13 2026 with the Hub
     half below. `postToSlackChannel` THROWS when the bot is not in the channel,
     and this line used to be the last word in the job — so an uninvited bot
     meant no scoreboard anywhere, and after the Hub post was added it would
     have meant the Hub post never ran at all. Found by booting the job rather
     than by reading it.
     ⚠️ IT DOES NOT TURN A FAILURE INTO A 200 THAT LIES. The job already
     answered 200 with `posted: false` whenever Slack replied `ok: false`;
     catching the throw makes the two failure paths agree instead of one of
     them 500ing. The reason travels in the response, which is where this job
     reports all its workings.
     ⚠️ AND NOT 500ING IS THE SAFER ANSWER NOW THERE IS A SECOND DESTINATION:
     this job has no cron dedup, so a 500 that cron-job.org retried would write
     a SECOND announcement for the same week. */
  let res = null, slackWhy = "";
  try {
    res = await postToSlackChannel(env, TEAM_CHANNEL, text);
  } catch (e) {
    slackWhy = String(e && e.message ? e.message : e).slice(0, 120);
  }

  /* ═══ AND IN THE HUB, AS AN ANNOUNCEMENT ═════════════════════════════════
     Matt, Aug 13 2026, asked whether the scheduled jobs could post as
     announcements. Answer was "some, not all", and this is the one we start
     with: it already goes to the whole team, weekly, and Slack cannot tell him
     who read it.

     ⚠️⚠️ BOTH, NOT INSTEAD (his call). Slack is how people find out it exists;
     the Hub holds the record and the READ LIST. In a few weeks that list says
     by name whether anyone opens it, and THAT number decides whether the other
     ten jobs move. Turning Slack off today would mean a week of not knowing.

     ⚠️ NO PUSH. A weekly nice-to-have on ~106 phones is how an app gets muted,
     and a muted app is worse than no app because nobody knows it is muted.
     `writeAnnouncement` does not push; the leader route does. Slack is the
     alert while both run.

     ⚠️ NO CONFIRMATION REQUESTED. Nobody signs a scoreboard.

     ⚠️ THE HUB POST IS BEST EFFORT AND NEVER TAKES THE SLACK POST DOWN. The
     Slack message is already sent by the time this runs, and every failure
     below is REPORTED in the return rather than thrown — a scoreboard that
     stopped posting to the team because an announcement could not be written
     would be a worse outcome than no announcement. */
  let hub = { posted: false, why: "" };
  try {
    const plain = scoreboardMessage(ranked, { people, plain: true });
    const targetIds = await everyoneOnRoster(env);
    if (!plain) hub.why = "nothing to say";
    else if (!targetIds.length) hub.why = "roster unreadable, so it would have reached nobody";
    else {
      const ev = await writeAnnouncement(env, {
        title: SCOREBOARD_TITLE,
        body: plain,
        /* ⚠️⚠️ THE AUTHOR IS THE APP, NOT A PERSON AND NOT A HARDCODED STORE
           NAME. Design rule 18: a literal "Gate City Hub" here would travel
           into the next store's announcements looking deliberate.
           ⚠️ AND IT MUST COME FROM `storeBrand`, NOT `STORE.appName`. The
           Worker never runs `applyStoreOverrides`, so `STORE.appName` is the
           DEPLOYED DEFAULT forever — it would compile, look dynamic, and print
           Gate City at exactly the store this rule exists to protect. This
           function is the Worker's one live read of a store's saved settings,
           and it is the same trap `replyTo` and `programName` are written up
           for a few hundred lines above. */
        byId: "",
        byName: (await storeBrand(env).catch(() => null) || {}).appName || "The Hub",
        audience: { kind: "everyone" },
        targetIds,
        requiresAck: false,
      });
      if (ev) hub = { posted: true, why: "", to: targetIds.length };
      else hub.why = "announcements unreadable, so nothing was written";
    }
  } catch (e) {
    hub.why = String(e).slice(0, 80);
  }
  /* ★ THE RUN REPORTS ITS OWN WORKINGS, and this is why. `{"teams":7,"top":"The
     Nuggets","named":0}` was every number this job would tell you, and none of
     them said whether it had read 2,250 events or 1,000, whether any id had
     matched, or whether a single name had been built. Working out that it was
     reading a truncated window took replaying the real directory against the
     real table from outside. A quiet run should answer that by itself.
     ⚠️ COUNTS ONLY — no names, no ids. This lands in a browser address bar on a
     shared iPad, so it must never carry who did what. */
  return {
    teams: ranked.length,
    top: ranked[0] ? ranked[0].name : null,
    named: people.length,
    posted: !!(res && res.ok !== false),
    /* WHY Slack did not take it, when it did not. `posted: false` on its own
       sent somebody reading the run into the Slack app to guess. */
    ...(slackWhy ? { slackWhy } : {}),
    /* Says whether the Hub half landed and, when it did not, why — the same
       reason the read block below exists. A run that reports only `posted`
       cannot tell you which of the two places it reached. */
    hub,
    read: {
      events: (rows || []).length,           // how much of the window actually arrived
      peopleSeen: Object.keys(activity).length, // distinct ids with any activity
      rosterIds: Object.keys(names).length,     // ids the directory could name
      matched: Object.keys(activity).filter((id) => names[id]).length, // the join that matters
    },
  };
}

async function quietPeople(env, now, days = 7) {
  const today = now || new Date();
  const sinceISO = new Date(today.getTime() - days * 86400000).toISOString();
  const rows = await teQuery(env, `select=uid&opened_at=gte.${sinceISO}&limit=20000`);
  const seenUid = new Set();
  for (const r of rows) { if (r && r.uid) seenUid.add(String(r.uid)); }

  const subs = (await sbGet(env, "gcfcr-push-subs-v1")) || {};
  const byUid = {};
  for (const k of Object.keys(subs)) {
    const sub = subs[k];
    if (sub && sub.uid) byUid[String(sub.uid)] = sub.name || `#${sub.uid}`;
  }

  /* ★ THE ROSTER OVERRIDES THE STORED DEVICE NAME (Matt, Aug 10 2026).
     A device's `name` is whatever the browser claimed when it subscribed, and
     one of them is wrong today: id 21 is stored as "Thanh Nguyen" from a shared
     iPad where the cached identity had not caught up. /api/push-subscribe now
     resolves the name server-side so new rows are right, but this report should
     not have to wait for that device to sign in again — and it should never
     have been printing a browser-supplied name at the owner and HR in the first
     place. The roster is the record; the device name is a fallback.
     ⚠️ FIXES THE NAME INDEX BELOW TOO, which matters more than the display.
     With id 21 stored as Thanh, "thanh nguyen" was claimed by ids 21 AND 55, so
     it counted as a shared name and cleared NEITHER — Thanh's own submissions
     stopped vouching for him. One wrong row was quietly making a second person
     unattributable. */
  try {
    const roster = await sbGet(env, "gcfcr-hr-team-v1");
    if (Array.isArray(roster)) {
      for (const p of roster) {
        const b = bareId(p && p.id);
        if (b && byUid[b] && p.name) byUid[b] = String(p.name);
      }
    }
  } catch { /* no roster = keep the device names, exactly as before */ }

  /* ★★ A SUBMISSION IS USING THE HUB (Matt, Aug 10 2026, on the weekly report:
     "Verify Guadeloupe please. She submitted something on Friday").

     🐛 HE WAS RIGHT AND THE REPORT WAS WRONG ABOUT HER. Guadalupe filed 21 Food
     Quality records on Friday Aug 7, 1:33–1:38pm. This function asked ONE
     question — is there a tool_events row for your uid — and never looked at
     the submissions table at all. Her only tool_events row in the whole of
     August is Aug 10. So she did the work and the report named her, to the
     owner, HR and leadership, as somebody who never opened the Hub.

     ⚠️ WHY SHE HAD NO OPEN EVENT: her submissions are filed under "Lupe", a
     TYPED name, not a signed-in identity — most likely a shared store iPad
     signed in as somebody else. That is the same "typed name" caveat this
     report already prints about cleaning and checklists; it simply was not
     applied to the one list that names people.

     ⚠️⚠️ AN AMBIGUOUS NAME CLEARS NOBODY, and this is the load-bearing part.
     Eight first names are shared on this roster — Camila by three, and Monica,
     Jose, Ashley, Benjamin and both Lizbeths collide. Matching "Monica" to a
     person would silently clear the wrong one. So a name that could mean more
     than one person is dropped from the index entirely and clears no one. A
     wrongly-named person is the harm being fixed here; a wrongly-cleared one is
     a quiet report line, which is the far cheaper failure.

     ⚠️ THE PREFERRED-NAME MAP IS WHAT MAKES HER CASE WORK. "Lupe" is nobody's
     roster name; it is her preferred name, added Aug 7, keyed by the same
     roster id the push subs use. Without that join this fix would not reach the
     person who prompted it.
     ⚠️ FAILS OPEN. Every read here is optional. If submissions or the preferred
     map cannot be read, this degrades to exactly the old behaviour rather than
     clearing everybody or nobody. */
  /* ⚠️ PUNCTUATION IS FOLDED, CHECKED AGAINST THE REAL WEEK. Daisy signs in as
     "Daisy" and her submission is filed "Daisy
     Hernandez-Espitia" — the same person and the same words, separated by one
     hyphen. Folding it fixes her. It does NOT loosen anything that matters:
     "Maria Garcia" still fails to match "Maria Garcia-Perez", because those are
     genuinely different names and not a punctuation difference. */
  const nm = (s) => String(s || "").trim().toLowerCase()
    .replace(/[.'’]/g, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  const SHARED = Symbol("shared");
  const uidByName = new Map();
  const claim = (name, uid) => {
    const k = nm(name);
    if (!k || !uid) return;
    if (uidByName.has(k) && uidByName.get(k) !== String(uid)) uidByName.set(k, SHARED);
    else uidByName.set(k, String(uid));
  };
  Object.keys(byUid).forEach((u) => claim(byUid[u], u));
  try {
    const pref = (await sbGet(env, "gcfcr-hr-preferred-v1")) || {};
    Object.keys(pref).forEach((id) => claim(pref[id], bareId(id)));
  } catch { /* preferred names are a bonus, never a requirement */ }

  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/submissions?select=submitted_by&submitted_at=gte.${sinceISO}&limit=20000`,
      { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } });
    if (res.ok) {
      const subRows = await res.json();
      for (const r of subRows || []) {
        const hit = uidByName.get(nm(r && r.submitted_by));
        if (hit && hit !== SHARED) seenUid.add(hit);
      }
    }
  } catch { /* no submissions read = the old behaviour, never a worse one */ }

  return Object.keys(byUid)
    .filter((u) => !seenUid.has(u))
    .map((u) => ({ uid: u, name: byUid[u] }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function runWeeklyUsage(env, now) {
  const today = now || new Date();
  const sinceISO = new Date(today.getTime() - 7 * 86400000).toISOString();

  // ── 1 · Hub use, from the only id-keyed source we have ──────────────
  const rows = await teQuery(env,
    `select=tool,uid,person,tier&opened_at=gte.${sinceISO}&limit=20000`);

  const byTool = {};
  const byPerson = {};
  const seenUid = new Set();
  for (const r of rows) {
    byTool[r.tool] = (byTool[r.tool] || 0) + 1;
    if (r.uid) {
      seenUid.add(String(r.uid));
      const k = r.person || `#${r.uid}`;
      byPerson[k] = (byPerson[k] || 0) + 1;
    }
  }
  const topTools = Object.entries(byTool).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topPeople = Object.entries(byPerson).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // ── 2 · Who has alerts on but didn't open the Hub at all ────────────
  // The fair version of "who isn't using it": these people are reachable
  // and set up, so a gap is a real signal rather than a missing install.
  /* Was an inline copy of this. Now the one shared definition, so the digest
     and the Hub screen can never name different people. */
  const quiet = (await quietPeople(env, today)).map((p) => p.name);

  // ── 3 · Cleaning COVERAGE — count ticked items, never the timestamp ──
  const wk = isoWeekKey(new Date(today.getTime() - 7 * 86400000)); // week just ended
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const clean = { FOH: 0, BOH: 0 };
  const cleanDays = { FOH: 0, BOH: 0 };
  for (const area of ["FOH", "BOH"]) {
    for (const d of days) {
      const v = await sbGet(env, `cleaning:${wk}:${area}:${d}`);
      if (!v || typeof v !== "object") continue;
      /* ⚠️ COUNTS EITHER FIELD, because BOTH are live. This looked only for
         `checked`, while the cleaning summary treats FOH as `cleaned` — so a
         tick could go uncounted here and the report understated FOH coverage.
         ⚠️ Checked against the real records before choosing: FOH rows hold
         `cleaned` on 21 entries and `checked` on 26. BOTH shapes exist, so
         picking one by area (which is what the summary does) would still miss
         half of them. Counting either is the only number that matches what the
         team actually ticked. */
      const ticked = Object.keys(v).filter((k) => v[k] && (v[k].cleaned || v[k].checked)).length;
      if (ticked > 0) { clean[area] += ticked; cleanDays[area] += 1; }
    }
  }

  // ── 4 · Ops checklists — days with any completion ───────────────────
  /* ⚠️ READS BOTH KEY SHAPES. This asked only for
     `gcfcr-checklists-done-<date>-v1`, while OpsChecklists writes
     `gcfcr-ops-done-<date>-v2` (its own header says so) — so the live records
     were invisible and the report told Matt nobody runs the ops checklists,
     every week, while they were being run.
     ⚠️ The old key is NOT dead — 4 records of it exist, checked against the
     database rather than assumed. Reading only the new one would have swapped
     one blind spot for another, so it counts a day that has either.
     ⚠️ And the date was built with toISOString, which is UTC — after 8pm ET
     that is already tomorrow, so even with the right key the last day would
     have been off by one. isoOfD(nowET()) is the store's own day. */
  let checklistDays = 0;
  for (let i = 1; i <= 7; i++) {
    const d = nowET();
    d.setDate(d.getDate() - i);
    const iso = isoOfD(d);
    const v = await sbGet(env, `gcfcr-ops-done-${iso}-v2`);
    const legacy = v && typeof v === "object" && Object.keys(v).length
      ? null
      : await sbGet(env, `gcfcr-checklists-done-${iso}-v1`);
    const hit = (v && typeof v === "object" && Object.keys(v).length) ||
                (legacy && typeof legacy === "object" && Object.keys(legacy).length);
    if (hit) checklistDays++;
  }

  // ── 5 · Compose. Plain text, scannable on a phone. ──────────────────
  const L = [];
  L.push(`*Hub weekly report* · week ending ${today.toISOString().slice(0, 10)}`);
  L.push("");
  L.push(`*Use* — ${rows.length} tool opens by ${seenUid.size} people`);
  if (topTools.length) {
    L.push(topTools.map(([t, n]) => `• ${t} — ${n}`).join("\n"));
  } else {
    L.push("• no activity recorded");
  }
  if (topPeople.length) {
    L.push("");
    L.push("*Most active*");
    L.push(topPeople.map(([p, n]) => `• ${p} — ${n}`).join("\n"));
  }
  L.push("");
  L.push(`*Cleaning (${wk})* — FOH ${clean.FOH} items over ${cleanDays.FOH} days · BOH ${clean.BOH} items over ${cleanDays.BOH} days`);
  L.push(`*Ops checklists* — completed on ${checklistDays} of the last 7 days`);
  if (quiet.length) {
    L.push("");
    L.push(`*Set up but didn't open the Hub this week (${quiet.length})*`);
    L.push(quiet.map((n) => `• ${n}`).join("\n"));
    L.push("_These people have alerts on, so they can be reached — worth a nudge rather than a re-install._");
  }
  /* ★★ NOTIFICATIONS THAT DID NOT SEND (Matt, Aug 10 2026, after one bit).
     🐛 WHY THIS IS IN THE REPORT AT ALL. That morning two recommendation
     requests were refused. Jose Arias Cortez asked two leaders to write for him,
     neither was told, and his application sat waiting on people who did not know
     they had been asked — with a date on it. The Hub had recorded both failures
     correctly. Nothing read the record, so it sat there for eight hours and only
     surfaced because somebody happened to query the config for another reason.
     A log nobody opens is not a safety net, it is a receipt.

     ⚠️ IT REPORTS WHAT IS STILL OUTSTANDING, NOT WHAT EVER FAILED. The log is a
     recovery worklist that is cleared once somebody has resent, so "still
     listed" is the number that needs a person. A running total of all-time
     failures would climb forever and be ignored inside a month.
     ⚠️ NAMES THE FIRST FEW, because "3 notifications failed" sends somebody
     hunting through a tile and `about` already says who and what in a sentence.
     ⚠️ SILENT WHEN THERE IS NOTHING, so the line only ever appears when it wants
     something. A weekly "0 failures" trains people to skip the section that
     matters on the week it is not zero.
     ⚠️ EVERY FIELD GUARDED. This log is written by the browser and capped at 40;
     a half-written entry must not take the whole report down. */
  try {
    const failLog = await sbGet(env, "gc-pg-notify-log-v1");
    const fails = Array.isArray(failLog) ? failLog.filter(Boolean) : [];
    if (fails.length) {
      L.push("");
      L.push(`*Notifications that did not send (${fails.length})*`);
      L.push(fails.slice(0, 3).map((f) => {
        const about = String((f && f.about) || "a notification").slice(0, 120);
        const when = String((f && f.at) || "").slice(0, 10);
        return `• ${about}${when ? ` · ${when}` : ""}`;
      }).join("\n"));
      if (fails.length > 3) L.push(`_…and ${fails.length - 3} more._`);
      /* ⚠️ THE ADVICE NOW DEPENDS ON WHERE THE FAILURE CAME FROM, because the
         two are not recoverable the same way. A browser failure is a message
         somebody can send again from Professional Growth. A missed SCHEDULED
         reminder is not: the job ran, its moment has passed, and the only fix
         is a person saying the words. Telling somebody to "send it again from
         Professional Growth" for a reminder that lives in a cron job sends them
         looking for a button that is not there. */
      const jobs = fails.filter((f) => f && f.source === "job").length;
      if (jobs < fails.length) {
        L.push("_Nobody was told. These do not retry — open Professional Growth and send them again._");
      }
      if (jobs > 0) {
        L.push(`_${jobs} of these ${jobs === 1 ? "was a scheduled reminder that" : "were scheduled reminders that"} could not be delivered. They do not retry and there is no button for them — tell the person yourself._`);
      }
    }
  } catch { /* the report is worth more than this section; never let it fail the run */ }

  L.push("");
  L.push("_Counts ticked items, not last-opened. Cleaning and checklist figures are coverage only — those tools record typed initials, so they can't fairly be attributed to a person yet._");

  const text = L.join("\n");
  /* ★★ PUSH FIRST, SLACK AS WELL (Matt, Aug 10 2026: "I want them to have a
     report sent weekly like myself", about the stores cloning the Hub, and
     "100% push is preferable").

     ★ WHY PUSH IS THE ONE THAT MATTERS HERE. A cloned store has the Hub on day
     one and does NOT have this workspace: no bot, no channels, no invites. A
     report that only knows how to arrive as a Slack DM is a report a new store
     never receives. Push travels with the Hub itself, so this now works at a
     store that has never opened Slack.

     ⚠️ NOT PUSH-ONLY, AND THE NUMBER IS WHY. Measured against the live data
     today: 38 of 96 people on the roster have alerts turned on, 40%. Dropping
     Slack now would stop telling most of this store anything. Both go out, each
     one is independent, and Gate City's channels can be switched off once
     adoption is there rather than on the day this ships.

     ⚠️ ROUTED BY ROLE, NEVER BY NAME. `notifyName` resolves owner/hr/leadership
     to whoever holds that seat at THIS store, so a clone reaches its own people
     with no code change. That is already true of the Slack half; this keeps the
     two halves reading the same source rather than introducing a second list.

     ⚠️ A PUSH IS A HEADLINE, NOT THE REPORT. The full text stays in the DM and
     in the Hub; a notification that arrives as thirty lines is one nobody
     reads. Body names the two numbers worth waking up for.

     ⚠️ ONE FAILURE NEVER KILLS THE OTHER, or the rest of the loop. A store with
     no Slack must still get its push, and a person with no device must still
     get their DM. */
  const headline = `${rows.length} tool opens by ${seenUid.size} people`
    + (quiet.length ? ` · ${quiet.length} set up but quiet` : "");
  let sent = 0, pushed = 0;
  for (const role of WEEKLY_USAGE_TO) {
    /* A role nobody is configured for is skipped, never sent to a stale id. */
    const name = await notifyName(env, role);
    if (!name) continue;
    try {
      const r = await pushToPerson(env, name, { title: "Hub weekly report", body: headline });
      if (r && Number(r.sent) > 0) pushed += r.sent;
    } catch { /* no device, or a dead subscription — the DM below still goes */ }
    const to = await slackIdForName(env, name);
    if (!to) continue;
    try { await sendSlack(env, to, text); sent++; } catch { /* one bad DM must not kill the rest */ }
  }
  return { week: wk, opens: rows.length, people: seenUid.size, quiet: quiet.length, sent, pushed };
}

/* ═══════════════════════════════════════════════════════════════════
   JOB — `adoption-check`. Who the Hub cannot reach.

   ★ WHY THIS IS A JOB AND NOT SOMETHING CLAUDE DOES.
   Matt, Jul 27 2026: "Anytime there are issues like this with leadership Bri
   is the point person so verify daily and point her to them." Claude only
   runs when Matt is in a session, so "verify daily" done in chat is really
   "verify whenever Matt remembers" — which is the thing he was delegating
   away. This runs on a cron and DMs Bri whether or not anyone opens a chat.

   ★★ IT ONLY SPEAKS WHEN THE LIST CHANGES. Bri's standing rule is one
   reminder per thing and no recurring nagging. A daily DM repeating the same
   five names IS nagging, just aimed at one person instead of a channel — the
   exact failure this whole notification effort is trying to end. The previous
   list is kept in KV; identical list, no message. It also speaks when the
   list goes EMPTY, because "everyone is reachable now" is worth knowing and
   is the only good news this job can deliver.
   ═══════════════════════════════════════════════════════════════════ */
const ADOPT_STATE_KEY = "gcfcr-adoption-last-v1";

async function runAdoptionCheck(env) {
  /* ── who CAN be reached ────────────────────────────────────────────
     ⚠️ MATCH ON THE HR ID FIRST, NAME ONLY AS A FALLBACK.
     The first version of this job compared normalised NAMES exactly and
     produced two false positives on its very first run: the rota says
     "Jose Arias" while his subscription says "Jose Arias Cortez", and the
     seat says "Lizy Gonzalez" while hers says "Lizbeth".
     Both were reachable; both were reported to Bri as missing. Telling a
     director to chase someone who already did it is how this job loses
     credibility on day one.
     Seats carry `holderId` (the HR roster id) and subscriptions carry `uid`,
     which is the same id — so for anything with a seat the match is exact and
     nicknames stop mattering. The trainer rota has names only, so those fall
     back to `sameLeader`, which matches "Jose Arias" to "Jose Arias Cortez"
     (first name plus last initial) while still keeping genuinely different
     people apart. */
  const subs = (await sbGet(env, "gcfcr-push-subs-v1")) || {};
  const reachableIds = new Set();
  const reachableNames = [];
  for (const k of Object.keys(subs)) {
    const s = subs[k];
    // ⚠️ A record without a nested `subscription` is a DEAD legacy shape —
    // pushToUid skips it silently, so counting it as reachable would hide
    // exactly the person this job exists to surface.
    if (!s || !s.subscription) continue;
    if (bareId(s.uid)) reachableIds.add(bareId(s.uid));   // the shared rule, top of file
    if (s.name) reachableNames.push(s.name);
  }
  /* ⚠️ TWO ID FORMATS FOR ONE PERSON. `gcfcr-hr-team-v1` stores `tm27`;
     the push subscription stores `27`. The `tm` prefix is dropped somewhere
     between them, so a raw comparison never matches and this silently fell
     through to names — which is how the false positives happened. Strip it
     on both sides.
     ★ AND THE ID PATH IS NOT A NICETY HERE: the roster holds BOTH
     `tm26 Lizbeth Gonzalez` and `tm27 Lizbeth`, two different
     real people, and `sameLeader` matches them to EACH OTHER (same first
     name, same last initial). For anyone with an id, the id is the only
     safe answer.
     ⚠️ `bareId` IS NOW THE SHARED ONE at the top of this file. There were two
     copies of this rule and it decides identity, so they were collapsed. */
  const isReachable = (name, id) => {
    const b = bareId(id);
    if (b && reachableIds.has(b)) return true;
    if (b) return false;   // has an id and it isn't subscribed — don't guess by name
    return reachableNames.some((n) => sameLeader(n, name));
  };

  // ── who the Hub NEEDS to reach ────────────────────────────────────
  const want = [];   // { name, why }

  const rota = (await sbGet(env, "gcfcr-trainer-roster-v1")) || [];
  const seenTrainer = new Set();
  for (const r of Array.isArray(rota) ? rota : []) {
    const n = r && r.trainer ? String(r.trainer).trim() : "";
    if (!n || seenTrainer.has(normName(n))) continue;
    seenTrainer.add(normName(n));
    want.push({ name: n, id: null, why: "cleaning rota" });   // rota has names only
  }

  // Seat holders come from the accountability chart module, so a seat
  // changing hands changes who this job chases — no second list to update.
  for (const s of [].concat(AD_SEATS.FOH, AD_SEATS.BOH, EXTRA_SEATS)) {
    if (!s || !s.holder) continue;
    if (seenTrainer.has(normName(s.holder))) continue;
    want.push({ name: s.holder, id: s.holderId || null, why: s.fn });
  }

  const missing = want
    .filter((w) => !isReachable(w.name, w.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  // ── has anything actually changed? ────────────────────────────────
  const sig = missing.map((m) => normName(m.name)).join("|");
  const prev = (await sbGet(env, ADOPT_STATE_KEY)) || {};
  if (prev.sig === sig) {
    return { checked: want.length, missing: missing.length, sent: 0, reason: "unchanged" };
  }

  const lines = [];
  if (!missing.length) {
    /* ⚠️ THE ALL-CLEAR STAYS, AND IT IS ONE LINE. It only sends when the
       signature CHANGES, so this arrives once, after the last person is sorted
       — that is a finish line, not noise. Two lines saying the same thing was
       the noise. */
    lines.push(`*All ${want.length} reachable. Nothing outstanding.* ✅`);
  } else {
    const wasMissing = new Set(String(prev.sig || "").split("|").filter(Boolean));
    const fresh = missing.filter((m) => !wasMissing.has(normName(m.name)));
    const fixed = Array.from(wasMissing).filter((n) => !missing.some((m) => normName(m.name) === n));

    lines.push(`*${missing.length} people can't get Hub alerts*`);
    lines.push(missing.map((m) => `• ${m.name} — ${m.why}`).join("\n"));
    if (fresh.length) {
      lines.push("");
      lines.push(`*New since last time:* ${fresh.map((m) => m.name).join(", ")}`);
    }
    if (fixed.length) {
      lines.push("");
      lines.push(`*Sorted since last time:* ${fixed.length} ✅`);
    }
    lines.push("");
    /* Same one action as the gap check above, in the same words. Two jobs
       telling her the same thing two different ways is worse than either. */
    lines.push("Each one: open the Hub from the home-screen icon, then turn on alerts. Not from Safari.");
  }

  let sent = 0;
  /* ⚠️⚠️ TWO SEPARATE BUGS LIVED ON THIS LINE AND THE ONE BELOW (Aug 7 sweep).

     🐛 1. A REFUSED DM COUNTED AS SENT. sendSlack is a bare fetch, and Slack
     answers a refusal with HTTP 200 and {"ok":false,"error":"..."} in the BODY
     — so the try/catch never fired. `sent` went to 1, the signature was
     stored, and every later run saw an unchanged sig and returned "unchanged".
     A message Slack refused was therefore never retried, ever, and Bri was
     recorded as told. Reading r.json().ok is the fix sendSlackDM already has.

     🐛 2. A DRY RUN CONSUMED THE ONCE-ONLY FLAG. Under &quiet=1 sendSlack
     returns a FAKE success, so the documented test stored the signature and
     permanently silenced the real run. Same defect as runEvalDueReminders, and
     the rule this file already states at monthlyAlreadySent. */
  if (env && env.__QUIET) {
    return { checked: want.length, missing: missing.length, sent: 0, quiet: true, note: "signature NOT stored" };
  }
  let failReason = "";
  try {
    const adoptTo = await notifyTarget(env, "leadership");
    if (!adoptTo) return { checked: want.length, missing: missing.length, sent: 0, skipped: "no leadership recipient configured" };
    const r = await sendSlack(env, adoptTo, lines.join("\n"));
    const j = await r.json().catch(() => null);
    sent = j && j.ok ? 1 : 0;
    if (!sent) failReason = (j && j.error) || "slack refused";
  } catch (e) { failReason = String(e).slice(0, 120); }

  // Save AFTER sending, so a failed DM is retried tomorrow rather than
  // swallowed by a state write that says we already told her.
  /* ⚠️ ONLY ON A REAL SEND. Storing it after a failure is what made this
     silent and permanent. */
  if (sent) await sbSet(env, ADOPT_STATE_KEY, { sig, at: new Date().toISOString(), missing: missing.length });

  return { checked: want.length, missing: missing.length, sent };
}

// ── Public document proxy ──────────────────────────────────────────────
// Lets the team open files at gatecityhub.com/docs/<slug> instead of a raw
// supabase.co URL. Values are the REAL object names in the public hub-assets
// bucket, so a file can be re-uploaded under a different name and the link the
// team uses never changes. Unknown slugs fall through to the literal object
// name, so any older/direct link keeps working.
const SUPABASE_PUBLIC =
  "https://SET-THIS-TO-THE-NEW-STORE-SUPABASE-PROJECT.supabase.co/storage/v1/object/public/hub-assets/";
const DOC_MAP = {
  /* ⚠️ EMPTY ON PURPOSE, AND EMPTY IS A WORKING STATE. The origin store's
     entries named files in ITS bucket, so they came out with the snapshot. Add
     this store's own as it uploads handbooks to `hub-assets`: the key is the
     slug the team sees in the URL, the value is the real object name. An
     unknown slug already falls through to the literal object name, so an
     upload is reachable before it is ever listed here. */
};

/* ============================================================================
   WEB PUSH — VAPID + aes128gcm (RFC 8291 / RFC 8188)

   ⚠️ WHY THIS EXISTS: the client (`PushToggle` in App.jsx) has ALWAYS called
   /api/push-key, /api/push-subscribe, /api/push-test and /api/push-unsubscribe.
   None of them existed here, so every request fell through to
   `env.ASSETS.fetch(request)` and came back as index.html. `.json()` then threw —
   Chrome says `'<', "<!doctype "... is not valid JSON`, Safari says "The string
   did not match the expected pattern." Two different error texts, one cause,
   and neither is a phone problem. (Jul 26 2026.)

   Needs three SECRETS on the Worker: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
   VAPID_SUBJECT (a mailto:). Without them the routes answer honestly rather
   than throwing, so a missing secret reads as a configuration message.

   ⚠️ The public key is baked into every subscription the browser creates.
   Change it and every existing subscription is dead — everyone must toggle
   alerts off and on again.
   ============================================================================ */

/* PIN brute-force throttle. 8 wrong PINs from one address buys a 15-minute
   lockout — generous for a real person fat-fingering a four-digit code on a
   phone, ruinous for anyone walking the 10,000-code space. */
/* ── PIN HASHING ────────────────────────────────────────────────────────
 * `gcfcr-hr-pins` held 106 FOUR-DIGIT PLAINTEXT pins. Two shapes are accepted
 * so the map converts itself with no migration script and no flag day:
 *     "4821"                      legacy plaintext
 *     { h: "<hex>", s: "<hex>" }  salted SHA-256
 * A plaintext entry that matches is REWRITTEN as a hash on the spot, so the map
 * drains person by person as people sign in. Nobody's PIN changes.
 *
 * ⚠️ THE SALT IS NOT OPTIONAL AT THIS SIZE. Four digits is 10,000 values — an
 * unsalted table of every possible PIN builds in about a second, so an unsalted
 * map would be no better than plaintext. A per-person salt forces the whole
 * space to be re-walked for each individual. That, plus the rate limit on
 * verify, is what makes a 4-digit secret defensible at all.
 */
const pinHashHex = async (pin, saltHex) => {
  const bytes = new TextEncoder().encode(`${saltHex}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};
const pinNewSalt = () =>
  [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
/* Constant-time compare. Overkill against a network attacker behind Cloudflare,
   but it costs nothing and the alternative is explaining why it was fine. */
const pinEq = (a, b) => {
  const x = String(a || ""), y = String(b || "");
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
};
async function pinMatches(entry, pin) {
  if (entry && typeof entry === "object" && entry.h && entry.s) {
    return pinEq(entry.h, await pinHashHex(pin, entry.s));
  }
  return pinEq(String(entry ?? ""), pin);          // legacy plaintext
}
/* A HALF-formed entry ({h} with no salt) counts as legacy — so it gets
   rewritten on the next match rather than silently trusted as a hash. */
const pinIsLegacy = (entry) => !(entry && typeof entry === "object" && entry.h && entry.s);

/* Which ids does this PIN match? Shared by verify and by the uniqueness check
   inside pin-set, so "who owns this PIN" can never mean two different things. */
async function pinOwners(pm, pin) {
  const ids = [];
  for (const id of Object.keys(pm || {})) if (await pinMatches(pm[id], pin)) ids.push(id);
  return ids;
}

/* Narrow the map handed to pinOwners, so one request tests one account instead
   of all ~106. That ratio IS the brute-force fix: a four-digit PIN against 106
   accounts pays out on roughly 1.06% of guesses, against one account on 0.01%.
   ⚠️ pinOwners ITSELF IS NOT TOUCHED. It stays the single definition of "who
   owns this PIN" — /api/pin-set still needs the full scan for its uniqueness
   check, and two functions answering that question differently is exactly the
   drift design rule 8 exists to prevent. Narrow the INPUT, never the rule. */
const pinSubset = (pm, ids) => {
  const out = {};
  for (const id of ids) if (Object.prototype.hasOwnProperty.call(pm || {}, id)) out[id] = pm[id];
  return out;
};

/* ── SESSION TOKENS ─────────────────────────────────────────────────────
 * The Hub has never had a real identity. Tier lives in localStorage and is
 * therefore whatever the person editing it says it is — which was tolerable
 * while every read went through the anon key anyway, and is not once the HR
 * proxy is the only door to that data.
 *
 * A token is `<payloadB64url>.<hmacB64url>`, the payload being {u, e} — the
 * roster id and an expiry. HMAC-SHA256 with RUN_JOB_KEY as the secret.
 *
 * ★ SIGNED, NOT ENCRYPTED. Anyone can read their own id out of it — they
 * already know it. What they cannot do is CHANGE it without the secret, which
 * is the entire point.
 * ⚠️ RUN_JOB_KEY is reused deliberately rather than adding a fourth secret.
 * Last night proved every new secret is a chance to paste a trailing newline.
 * An HMAC is one-way, so a leaked token never reveals the key.
 */
const TOKEN_TTL_SEC = 12 * 60 * 60;   // a shift, plus slack — not a week
const REMEMBER_TTL_SEC = 30 * 24 * 60 * 60;   // "keep me signed in on this device" — a month on a personal phone, then a fresh PIN. Deliberately OFF by default so a shared iPad never rides it.

const b64u = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/* ── SIGNING KEYS: THREE SECRETS, THREE JOBS (Aug 9 2026) ─────────────────
     RUN_JOB_KEY  fires scheduled jobs. It keeps travelling in URLs because
                  cron-job.org can only call a URL, and after this split that is
                  the WHOLE of its power. CRON-JOBS.md's warning becomes true.
     SESSION_KEY  signs session tokens and the device cookie. Never in a URL.
     DOC_KEY      signs /api/doc-view handles. Never in a URL.

   🐛 WHY: there used to be exactly one signing function here (hmacB64u, now
   deleted) and it derived its key from RUN_JOB_KEY, so the value pasted into
   cron-job.org and into Safari by hand was the same value that mints a session
   and signs a private file link. Anyone reading one of those URLs could mint a
   token for any roster id, or sign their own doc handle and stream every
   uploaded ID photo.

   ⚠️ RUN_JOB_KEY IS READ RAW AND IS NEVER TRIMMED. Every token in every pocket
   right now was signed with its exact bytes, trailing newline and all. Trimming
   it here signs out all ~106 people in one deploy. The two NEW secrets ARE
   trimmed, because nothing has been signed with them yet — which is what
   finally kills the trailing-newline trap.

   ⚠️ A MISSING SECRET IS NOT AN EMPTY KEY. String(env.X || "") HMACs happily
   with "", and an empty-key HMAC verifies consistently, so a misspelled secret
   name would leave every token forgeable by anyone who guessed that. Under 32
   characters counts as ABSENT and falls back to today's behaviour, never to "".

   ⚠️ THE PREFIXES ARE NOT DECORATION. SESSION_KEY signs two different things.
   Without "tok|" and "dev|", a device cookie could be presented as x-hub-token,
   verify, and pass every `if (!tok)` gate in this file. */
const KEY_MIN_LEN = 32;
/* ★ FLIPPED Aug 9 2026 (Stage 7), after a device signed in BEFORE the key split
   opened the Hub with no PIN prompt — which is the proof that the legacy verify
   arm works. From here new tokens are signed with SESSION_KEY and stamped v:2.
   NOBODY IS SIGNED OUT: every token already in a pocket is unmarked and keeps
   verifying on the legacy arm, and devices migrate themselves on their next
   save (kv-set re-mints and returns x-hub-token-refresh).
   ⚠️ ROLLBACK IS FREE AND THERE ARE TWO OF THEM. Set this back to false, or
   delete SESSION_KEY in the dashboard — freshKey then returns null, minting
   falls straight back to RUN_JOB_KEY, and readToken verifies BOTH arms
   regardless of this flag. Either way, zero sign-outs.
   ⚠️ DO NOT roll the WORKER back past the Stage 6 deployment after this. Older
   code cannot verify a v:2 token, so it would sign out everyone who has signed
   in since this line changed. */
const MINT_WITH_NEW_KEY = true;         // ← STAGE 8 does NOT touch this. See LEGACY_SIGNING_ACCEPTED.
const LEGACY_SIGNING_ACCEPTED = true;   // ← STAGE 8 flips this to false. One line.
const COLD_SEARCH = true;               // ← STAGE 9, only on measured numbers.
const PIN_ANON_ENFORCE = false;         // ← STAGE 9, only on measured numbers.
const legacyKey = (env) => String(env.RUN_JOB_KEY || "");          // RAW. Do not trim.
const freshKey = (env, purpose) => {
  const v = String((purpose === "doc" ? env.DOC_KEY : env.SESSION_KEY) || "").trim();
  return v.length >= KEY_MIN_LEN ? v : null;
};
async function hmacRaw(secret, msg) {
  const s = String(secret || "");
  if (!s) throw new Error("refusing to sign with an empty key");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(s), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
}
async function hmacDev(env, msg) {
  return hmacRaw(freshKey(env, "session") || legacyKey(env), "dev|" + msg);
}
/* ⚠️ CONSTANT-TIME, NOT `!==`. pinEq already exists for exactly this reason.
   RUN_JOB_KEY_OLD is the STAGE 8 rotation window and is absent until then. */
const adminKeyOk = (env, k) => {
  const v = String(k || ""), cur = String(env.RUN_JOB_KEY || "");
  if (!v || !cur) return false;
  if (pinEq(v, cur)) return true;
  const old = String(env.RUN_JOB_KEY_OLD || "");
  return !!old && pinEq(v, old);
};

/* ── SESSION EPOCH — the kill switch that does not rotate a key ────────────
   Bumping one stored number invalidates every live session in about a minute,
   without touching RUN_JOB_KEY and therefore without breaking a single cron
   job. Before this, the only tool for "someone may have gotten in" was a key
   rotation that signs out all ~106 people AND kills every scheduled job.
   ⚠️ A token with NO `k` reads as epoch 1, so shipping this touches no session
   alive today. Design rule 1: old records must still read. */
const SESSION_EPOCH_KEY = "gcfcr-session-epoch-v1";
let EPOCH_CACHE = { v: 1, at: 0 };
async function sessionEpoch(env) {
  const now = Date.now();
  if (now - EPOCH_CACHE.at < 60000) return EPOCH_CACHE.v;
  try {
    const raw = await sbGet(env, SESSION_EPOCH_KEY);
    EPOCH_CACHE = { v: Number(raw && raw.epoch) || 1, at: now };
  } catch { /* a read fault must NEVER sign the store out */ }
  return EPOCH_CACHE.v;
}

/* ── TERMINATION ACTUALLY ENDS ACCESS ──────────────────────────────────────
   Hannah, Slack DM Aug 9 2026: "When I terminate someone in the Hub I want them
   to lose access to the hub and for their PIN to be deactivated."

   🐛 HALF OF THAT WAS TRUE AND THE OTHER HALF WAS NOT. The PIN really does stop
   working the instant she marks them — /api/pin-verify filters on this same map.
   And the client signs a terminated person out and deletes their token the next
   time they OPEN the Hub. But nothing on the SERVER ever asked whether a token's
   owner still worked here, so somebody who simply never reopened the app kept a
   live session: 12 hours, or THIRTY DAYS if they had ever ticked "keep me signed
   in". Every protected route — HR records, documents, uploads — answered it.
   Termination is meant to remove access in one step; this was the missing step.

   ⚠️ FAILS OPEN, AND THAT IS NOT NEGOTIABLE. This runs inside readToken, which
   gates every authenticated request in the file. If the status read fails and
   this refused, one Supabase blip would sign out all ~106 people mid-shift —
   building the exact outage the Hub is supposed to survive. An unreadable map
   means "refuse nobody", the same posture as sessionEpoch directly above.
   ⚠️ Keyed on the BARE id. Verified against production: gcfcr-hr-status is keyed
   "24", "25", … with no `tm` prefix, and so is gcfcr-hr-pins, which is where the
   token's `u` comes from. bareId normalises both ends so a future prefix change
   cannot silently stop matching — the failure this house calls its own bug. */
const TERM_TTL_MS = 60000;
let TERM_CACHE = { v: null, at: 0 };
async function terminatedIds(env) {
  const now = Date.now();
  if (TERM_CACHE.v && now - TERM_CACHE.at < TERM_TTL_MS) return TERM_CACHE.v;
  try {
    const sm = await sbGet(env, "gcfcr-hr-status");
    const s = new Set();
    Object.keys(sm || {}).forEach((id) => {
      if (String(sm[id]) === "terminated") { const b = bareId(id); if (b) s.add(b); }
    });
    TERM_CACHE = { v: s, at: now };
  } catch { /* keep the last good set; if there is none, refuse nobody */ }
  return TERM_CACHE.v || new Set();
}

/* ── THE DEVICE COOKIE ──────────────────────────────────────────────────────
   HttpOnly, server-signed, carrying the roster ids that have SUCCESSFULLY
   signed in on this device. It is the whole reason one request can test one
   account without asking anybody anything: the browser sends it by itself on
   same-origin fetches, so it costs ZERO taps and zero screens.
   ⚠️ AN EMPTY `i` IS TREATED EXACTLY LIKE NO COOKIE. A fresh cookie an attacker
   farms is therefore worth nothing — the only way to get an id into it is to
   already know that person's PIN.
   ⚠️ 24 ids, not 8. A shared kitchen iPad accumulates leaders all week; at 8
   with eviction the name step stops being a once-per-device event and starts
   reappearing during a lunch rush, which is the one outcome this whole plan is
   not allowed to produce.
   ⚠️ Placed BELOW b64u, pinEq, freshKey and hmacDev on purpose. Those are
   module-level consts, and reading one before its initialiser has run is the
   "Cannot access X before initialization" blank page this repo has already
   paid for. Nothing here runs at module load, but the ordering removes the
   question entirely. */
const DEV_COOKIE = "gc_dev";
const DEV_IDS_MAX = 24;
const DEV_TTL_SEC = 180 * 24 * 60 * 60;
const readCookie = (request, name) => {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return "";
};
async function readDevCookie(env, request) {
  try {
    const [p, sig] = String(readCookie(request, DEV_COOKIE) || "").split(".");
    if (!p || !sig) return null;
    if (!pinEq(sig, await hmacDev(env, p))) return null;   // constant-time
    const j = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(p.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));
    if (!j || !j.e || j.e < Math.floor(Date.now() / 1000)) return null;
    return { d: String(j.d || ""), i: (Array.isArray(j.i) ? j.i : []).map(String) };
  } catch { return null; }
}
async function devCookieHeader(env, prev, addId) {
  const ids = [String(addId), ...((prev && prev.i) || [])]
    .filter((v, k, a) => v && a.indexOf(v) === k).slice(0, DEV_IDS_MAX);
  const d = (prev && prev.d) ||
    [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const p = b64u(new TextEncoder().encode(JSON.stringify({
    d, i: ids, e: Math.floor(Date.now() / 1000) + DEV_TTL_SEC })));
  return `${DEV_COOKIE}=${encodeURIComponent(`${p}.${await hmacDev(env, p)}`)}` +
         `; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${DEV_TTL_SEC}`;
}

/* `remember` = the caller ticked "keep me signed in on this device". It rides
   INSIDE the payload as `r:1`, not just as a longer expiry, so a renewed token
   (see the save path — every save re-mints) knows to stay a 30-day token instead
   of silently shrinking back to 12h on the first save. An old token with no `r`
   reads as not-remembered, so existing sessions keep their 12h exactly. */
async function mintToken(env, uid, remember = false) {
  /* ⚠️ ONE FLAG DECIDES WHICH KEY SIGNS, AND IT IS STILL false. This deploy is
     provably byte-identical to the one before it: every token minted here still
     comes out signed with RUN_JOB_KEY and unmarked, exactly as it does today.
     Flipping MINT_WITH_NEW_KEY is a separate, one-line stage. */
  const sk = MINT_WITH_NEW_KEY ? freshKey(env, "session") : null;
  const payload = b64u(new TextEncoder().encode(JSON.stringify({
    u: String(uid),
    e: Math.floor(Date.now() / 1000) + (remember ? REMEMBER_TTL_SEC : TOKEN_TTL_SEC),
    ...(remember ? { r: 1 } : {}),
    k: await sessionEpoch(env),      // the kill switch. A token with no `k` reads as epoch 1.
    ...(sk ? { v: 2 } : {}),         // the marker and the key move together
  })));
  const sig = sk ? await hmacRaw(sk, "tok|" + payload) : await hmacRaw(legacyKey(env), payload);
  return `${payload}.${sig}`;
}

/* Returns the payload, or null. Null covers every failure — bad shape, bad
   signature, expired — because none of them should be told apart by a caller. */
async function readToken(env, token) {
  try {
    const [payload, sig] = String(token || "").split(".");
    if (!payload || !sig) return null;
    const json = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(payload.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))
    ));
    /* ⚠️ `u` IS REQUIRED. The gc_dev device cookie is signed with the same
       secret and carries no `u`; without this line it could be handed over as
       x-hub-token, verify cleanly, and walk past every `if (!tok)` gate in this
       file. The "dev|" prefix already stops that. This is the belt to it. */
    if (!json || !json.u || !json.e) return null;
    let ok = false;
    if (json.v === 2) {
      /* ⚠️ VERIFY IS INDEPENDENT OF THE MINT FLAG, ON PURPOSE. That is what
         makes flipping MINT_WITH_NEW_KEY back to false a FREE rollback: tokens
         already minted under SESSION_KEY keep verifying either way. */
      const k = freshKey(env, "session");
      ok = !!k && pinEq(sig, await hmacRaw(k, "tok|" + payload));
    } else if (LEGACY_SIGNING_ACCEPTED) {
      /* ★★ THIS ARM IS WHAT KEEPS ALL ~106 PEOPLE SIGNED IN. Every token in a
         pocket right now is this exact shape: unmarked, signed over the bare
         payload with the RAW RUN_JOB_KEY bytes. It accepts ONLY unmarked
         payloads, so someone holding the old key cannot present a v:2 payload
         and have it fall back to the key they have. */
      ok = pinEq(sig, await hmacRaw(legacyKey(env), payload));
      if (ok) json.__legacy = true;      // census marker: how many old tokens are still alive
    }
    if (!ok) return null;
    if (json.e < Math.floor(Date.now() / 1000)) return null;
    /* The kill switch. Bumping the stored epoch ends every live session inside
       a minute without rotating a key, so "sign everyone out now" no longer
       means breaking every scheduled job. */
    if (Number(json.k || 1) < await sessionEpoch(env)) return null;
    /* ★ AND THEY MUST STILL WORK HERE. Checked LAST, after the signature and the
       expiry, so a forged or stale token never causes a status read. Costs one
       cached lookup; see terminatedIds for why it can only ever fail open. */
    if ((await terminatedIds(env)).has(bareId(json.u))) return null;
    return json;
  } catch { return null; }
}

/* ── PER-RECORD FILTERING: IS THIS UID A FULL READER? ───────────────────────
   The session token carries a server-issued roster id and nothing else — no
   tier, deliberately, because the only tier the client could have offered is
   one it claimed itself. So the Worker resolves the answer here, from data it
   fetches with the service key.

   ★ THE TITLE COMES FROM THREE PLACES AND ALL THREE ARE NEEDED: the override
   map, anyone hired since the seed, and the seed titles in hrRoster.js. Drop
   the third and Bri, Hannah, Kyleeka, Matt and Nick — who have no override —
   resolve to no title and lose full read.

   ⚠️ FAILS CLOSED. If either KV read throws, this returns false: the caller
   sees only their own row. A read fault must not hand back the whole map. */
/* THE CALLER'S RANK, resolved the one way. Same three-step resolution
   hrFullReader does (roles map, then people added since the seed, then the
   name-keyed override) but it answers "how senior" rather than "everything or
   nothing", which is what a route needs when a capability sits below Director.

   ⇒ Written once because it was already written twice: /api/nudge and
   /api/quiet-people each carried an identical seven-line copy, and a drift
   between them would have meant two different answers to the same question.
   Returns 0 on any failure, so a bad read denies rather than admits. */
/* THE CALLER'S NAME, from the ROSTER — all ~106 people, not the five.

   🐛 /api/my-photo used hrPrimaryName and refused everyone else (Aug 4 2026).
   hrPrimaryName only knows HR_CONSOLE_PEOPLE, which is a five-person access
   list, not a directory. So "add your photo" — a feature built for the whole
   team — answered "no roster name for this sign-in" to 101 of them. The image
   had already uploaded to the private bucket by then, so every retry left
   another orphan behind and the prompt kept coming back.

   ⚠️ THE `tm` PREFIX IS THE TRAP. `gcfcr-hr-team-v1` stores `tm27` while a
   session token carries `27`. A raw compare matches nobody, silently, which is
   the house bug class. Stripped on both sides, same rule as isReachable.
   Falls back to hrPrimaryName so the five keep whatever spelling the
   name-keyed overrides expect. Empty string when genuinely unknown. */
async function rosterNameForUid(env, uid) {
  const bare = bareId(uid);           // the shared rule, see the top of this file
  if (!bare) return "";
  try {
    const roster = await sbGet(env, "gcfcr-hr-team-v1");
    if (Array.isArray(roster)) {
      const hit = roster.find((p) => p && p.id && bareId(p.id) === bare);
      if (hit && hit.name) return String(hit.name);
    }
  } catch { /* fall through to the added list, then to the five-person list */ }
  /* 🐛 THE MIDDLE STEP WAS MISSING, AND IT IS THE ONLY STEP A NEW STORE HAS.
     Reported from The Village Aug 12 2026: "Add a photo" answered "no roster
     name for this sign-in" for every person there, and the buckets were blamed
     first. They were fine. This function looked in exactly two places — the
     imported roster, then hrPrimaryName's five-name access list — and that
     store has NEITHER. It has no `gcfcr-hr-team-v1` at all, because nobody has
     imported their CFA Home export yet, and hrPrimaryName is Gate City's list.
     Its three people live in `gcfcr-hr-added-v1`, added by hand at setup.

     ⚠️ THE THREE-SOURCE RULE WAS ALREADY WRITTEN DOWN, IN THIS FILE, FOR THE
     TITLE. `hrTitleFor` resolves override → added → seed, and `hubRank` and
     `hrFullReader` both call it. The NAME side only ever had two of the three.
     So who you are and how senior you are were answered from different places,
     and at a new store one of them answered nothing.

     ⚠️ AT GATE CITY THIS CANNOT FIRE AND COSTS NOTHING. Everyone there is in
     the roster key, so the read above returns first and this never runs. That
     is also why it is sequential rather than a Promise.all: the second read
     only happens when the first found nobody.

     ⚠️ `hrDisplayName`, NOT `hit.name`, because it is the helper that already
     owns preferred-name-wins and it is imported here. Added rows carry no
     `preferred` today, so it returns `name` — and keeps returning the right
     thing on the day they do. */
  try {
    const added = await sbGet(env, HR_ADDED_KEY);
    if (Array.isArray(added)) {
      const hit = added.find((p) => p && p.id && bareId(p.id) === bare);
      const nm = hrDisplayName(hit);
      if (nm) return nm;
    }
  } catch { /* fall through to the five-person list */ }
  return hrPrimaryName(String(uid)) || "";
}

/* Is this Slack destination a LEADER of this store?

   Matt, Aug 4 2026: "i want the bot to message leaders." Until now the
   destination allowlist named exactly two people, Bri and Matt, so the
   recommendation-request DM was refused for every real recommender — every
   leader in that picker is an Assistant Director or a Team Leader. The
   applicant saw "sent", the leader was never told, and the audit post claimed
   it went out.

   ⚠️ THE PROPERTY THE ALLOWLIST EXISTS TO KEEP IS "NO ARBITRARY DESTINATION",
   and this keeps it. Widening to "any Uxxxx id" would hand every PIN holder the
   ability to make the store's own bot say anything to anyone, which is the
   impersonation the July lock closed. So a DM is allowed only when the id
   belongs to someone who is BOTH on this store's roster AND a leader by rank.
   Not on the roster, or below Team Leader, is still refused.

   Rank 3 is the app's own line for "leader" — Senior Trainer, Team Leader,
   Assistant Director, Director — the same DOC_MIN the HR file gates use.
   ⚠️ Reverse lookup, because idByName goes name → id. A Slack id can answer to
   several spellings, so every matching key is tried and the FIRST roster hit
   decides. Any read failing returns false: a refusal is visible and safe, and
   silently allowing on a bad read is how these doors come open. */
const SLACK_DM_MIN_RANK = 3;
async function slackDmIsLeader(env, dest) {
  const id = String(dest || "");
  if (!/^U[A-Z0-9]{4,}$/i.test(id)) return false;
  try {
    const avatars = (await sbGet(env, "hr:slack-avatars:v1")) || {};
    const idByName = (avatars && avatars.idByName) || {};
    const names = Object.keys(idByName).filter((n) => String(idByName[n]) === id);
    if (!names.length) return false;
    const roster = await sbGet(env, "gcfcr-hr-team-v1");
    if (!Array.isArray(roster)) return false;
    /* 🐛 A NICKNAME IN SLACK REFUSED THE DM ENTIRELY (found Aug 10 2026 in the
       notify-failure log, two real cases from the same application).

       Jose Arias Cortez asked two leaders for a Team Leader recommendation on
       Aug 10. Both DMs were refused `not-allowed`, so neither was told, and his
       application sat waiting on people who did not know they had been asked.

       WHY. This matched the Slack display name against the HR roster name and
       required them to be identical once normalised. They are not:
         · Slack "Lizy Gonzalez Ramos"  vs  HR "Lizbeth"
         · Slack "Ben Smith"            vs  HR "Benjamin Smith"
       A leader whose Slack name is a nickname or a shortening could not be
       messaged by the bot at all. That is most people, eventually.

       ⚠️ THE FIX IS MORE ALIASES, NOT LOOSER MATCHING. First-name-plus-initial
       would pull "Lizbeth Gonzalez" and "Lizbeth" onto the same
       key — two different real people this repo has already confused once — so
       matching stays EXACT and the set of names a person answers to gets wider
       instead. `gcfcr-hr-preferred-v1` is the "Goes by" box in HR Console, so
       the next mismatch is fixed by typing a name rather than by a deploy.
       ⚠️ PREFERRED NAMES ARE OPTIONAL AND THE READ CAN FAIL. An unreadable map
       must narrow this back to today's behaviour, never widen it. */
    let pref = {};
    try { pref = (await sbGet(env, "gcfcr-hr-preferred-v1")) || {}; } catch { pref = {}; }
    const answersTo = (m) => {
      const out = [normName(m.name)];
      const p = pref[bareId(m.id)] || pref[String(m.id)];
      if (p) out.push(normName(p));
      return out.filter(Boolean);
    };
    const hit = roster.find((m) => m && m.name && answersTo(m).some((n) => names.includes(n)));
    if (!hit || !hit.id) return false;
    return (await hrRankForUid(env, String(hit.id))) >= SLACK_DM_MIN_RANK;
  } catch {
    return false;
  }
}

async function hrRankForUid(env, uid) {
  if (!uid) return 0;
  try {
    const [roles, added] = await Promise.all([
      sbGet(env, "gcfcr-hr-roles").catch(() => null),
      sbGet(env, HR_ADDED_KEY).catch(() => null),
    ]);
    const addedArr = Array.isArray(added) ? added : [];
    const title = hrTitleFor(String(uid), roles || {}, addedArr);
    const myName = hrPrimaryName(String(uid));
    const eff = myName ? effectiveRole({ name: myName, role: title }) : title;
    return hrRankOfTitle(eff) || 0;
  } catch {
    return 0;
  }
}


/* ═══ PTO / BONUS SEED — SERVER SIDE ONLY, AND THAT IS THE WHOLE POINT ══════
   🐛🐛 THIS WAS PUBLIC. Aug 8 2026, found while cataloguing hardcoded people.

   These two tables lived as consts in PTOTracker.jsx. That is a React file, so
   they compiled into a client chunk, and that chunk answered HTTP 200 to anyone
   on the internet with no token, no cookie and no sign-in:

       https://gatecityhub.com/assets/FinancialSuite-<hash>.js

   Readable in it: every named team member's year-end bonus for 2024 and 2025,
   and named people's DATED PTO absences. About forty people, including at least
   one who had already left.

   ⚠️ WHY EVERY AUDIT MISSED IT. They all asked "who can call this route". This
   was never a route. The TILE was gated; the data under it was a compile-time
   constant, and gating a screen does nothing about the file the browser already
   downloaded to draw it. The same two-doors mistake as the Jul 31 email fix.

   ⚠️ worker.js NEVER SHIPS TO THE BROWSER, which is why the fix is a move
   rather than an obfuscation. Transcribed VERBATIM — not one figure retyped.

   ⚠️ IT IS SEED DATA, NOT THE LEDGER. The live ledger is in KV and is untouched
   by any of this. These are the starting values the import button writes, plus
   the one-time 2025 count repair. Deleting them outright would have lost the
   transcription of a retiring spreadsheet, which is why they moved instead. */


/* The signed-in person's HR rank and title, or rank 0. One definition, because
   two routes now gate on tier and a second copy of this is a second answer to
   "what tier is this person" the first time one of them is edited.
   ⚠️ ANY FAILURE RETURNS RANK 0, which every caller treats as refused. A gate
   that cannot read the roster must not fall open. */
/* The roster row for a uid, so a caller can see status as well as title.
   ⚠️ bareId BOTH SIDES — the roster writes `tm27` and half the Hub carries
   `27`. See nameMatch.js. */
async function rosterRowFor(env, uid) {
  const want = bareId(uid);
  if (!want) return null;
  try {
    const [seed, added] = await Promise.all([
      sbGet(env, "gcfcr-hr-team-v1").catch(() => null),
      sbGet(env, HR_ADDED_KEY).catch(() => null),
    ]);
    for (const list of [seed, added]) {
      if (!Array.isArray(list)) continue;
      const hit = list.find((p) => p && p.id && bareId(p.id) === want);
      if (hit) return hit;
    }
  } catch { /* fall through */ }
  return null;
}

/* The Hub tier for a rank, the SAME arithmetic App.jsx's roleTier uses. Written
   out rather than imported because roleTier lives inside App.jsx, which the
   Worker must never pull in. If one changes, change both. */
const tierForRank = (rank) => (rank >= 6 ? 3 : rank >= 3 ? 2 : 1);

async function hubRank(env, uid) {
  if (!uid) return { rank: 0, title: "" };
  try {
    const [roles, added] = await Promise.all([
      sbGet(env, "gcfcr-hr-roles").catch(() => null),
      sbGet(env, HR_ADDED_KEY).catch(() => null),
    ]);
    const title = hrTitleFor(String(uid), roles || {}, Array.isArray(added) ? added : []);
    return { rank: hrRankOfTitle(title), title };
  } catch { return { rank: 0, title: "" }; }
}

/* `isReader` (optional) swaps in a stricter predicate for one key — see
   hrPtoReader below. Defaulted, so the ten existing callers are untouched. */
async function hrFullReader(env, uid, isReader = hrIsFullReader) {
  if (!uid) return false;
  try {
    const [roles, added] = await Promise.all([
      sbGet(env, "gcfcr-hr-roles").catch(() => null),
      sbGet(env, HR_ADDED_KEY).catch(() => null),
    ]);
    /* ★ THE SAME TWO-PART RULE THE UI USES (Jul 31 2026): the HR Console list
       AND the rank, with person-level overrides applied. `hrIsFullReader` owns
       the list; the override is resolved here because it is keyed by name and
       this function is handed an id. A person not on the list has no name to
       look up and is refused before any of this runs. */
    const title = hrTitleFor(String(uid), roles || {}, Array.isArray(added) ? added : []);
    const name = hrPrimaryName(String(uid));
    const eff = name ? effectiveRole({ name, role: title }) : title;
    return isReader(String(uid), roles || {}, Array.isArray(added) ? added : [], eff);
  } catch {
    return false;
  }
}

/* ★ THE PTO LEDGER'S READER, Aug 14 2026. Same two-part rule, one rank higher —
   see HR_PTO_READ_MIN in hrRoster.js.
   ⚠️ CALL IT AFTER `canAll`, NEVER INSTEAD OF IT. This repeats hrFullReader's
   two Supabase reads, and the whole point of ordering it second is that it only
   ever runs for someone the shared door already admitted: the handful of HR
   Console people, opening one tile. Hoisting it to the top of the route would
   put two extra round trips on every dashboard mount for all ~106 people, on
   store wifi, to answer a question about a key they did not ask for. */
const hrPtoReader = (env, uid) => hrFullReader(env, uid, hrIsPtoReader);

/* Keys shaped { "<rosterId>": <that person's data> } AND whose every reader is
   confirmed. A non-full-reader gets back only their own entry.

   ⚠️⚠️ `gcfcr-hr-files` IS ID-KEYED AND IS DELIBERATELY **NOT** ON THIS LIST.
   NewHireOrientation.jsx does a READ-MODIFY-WRITE on it: it reads the whole map,
   adds a completion record for EVERY person in the session, and writes the map
   back. That tile is TIER 2 — a Team Leader runs orientation, not a director.
   Filter it and the facilitator reads one row, then files orientation records
   that quietly contain nobody. The merge below would keep the other 105 rows
   safe, but the filing itself would silently do nothing, which is worse than
   loud. The BINARIES are covered regardless by the hr-files owner check in
   /api/doc-url, so what stays readable is the index, not the documents.
   ⇒ Closing it means giving the tile a purpose-built write, not a filter.

   ✅ `gcfcr-hr-pins` IS on the list, verified safe: DailySetup.jsx moved to
   /api/pin-verify on Jul 27 and its PINS_KEY const is now dead code, nothing
   POSTs the map through here (pin-set/pin-clear own the writes), and inside
   HRConsole the only non-director consumer is `pinIsSet` for the viewer's own
   id. Adding a key here is one line; adding it blind is an outage. */
/* ★★ KEYS ONLY NAMED PEOPLE MAY TOUCH AT ALL, FULL HR READER OR NOT.

   ⚠️⚠️ THIS IS STRICTER THAN EVERY OTHER RULE IN THIS FILE AND IT HAS TO BE.
   `hrFullReader` opens for FIVE people. Matt asked for three. Without this,
   adding wages to HR_PROTECTED would have handed them to Bri and Cindy the
   moment it shipped — quietly, and looking exactly like it was working.

   ⚠️ NO OWN-ROW ARM, DELIBERATELY. A team member reading their own wage would
   be defensible, but "only these three can see wages" is what was asked, and an
   own-row door here is a second thing to get right for no benefit.
   ⚠️ EMPTY LIST MEANS NOBODY, so a clone refuses everyone until it says who. */
const HR_ID_LOCKED = { "gcfcr-hr-pay-v1": PAY_ACCESS_IDS };

/* Bare roster id, matching the tm-prefix normalisation the browser uses. */
const bareUid = (v) => String(v == null ? "" : v).trim().toLowerCase().replace(/^tm/, "");

/* True when this key is locked and this uid is not on its list. Called at every
   point a key becomes known — the batched read, the single read and the write. */
function hrIdLockRefuses(key, uid) {
  const allow = HR_ID_LOCKED[key];
  if (!allow) return false;
  const me = bareUid(uid);
  if (!me) return true;
  return !allow.some((id) => bareUid(id) === me);
}

/* ★★ THE PTO LEDGER NEEDS A HIGHER BAR THAN THE DOOR IT ARRIVES THROUGH.

   🐛 WHAT THIS CLOSES (Aug 14 2026). `gcfcr-pto-v1` was on NONE of the four
   lists — not HR_PROTECTED here, not store.js's copy, not SEC_MUST_BE_DENIED,
   not the schema deny array. Probed against live production as `anon`, which
   is the access level of anyone who opens gatecityhub.com: it returned the
   whole 4,012-byte value. 33 people's year-end bonus DOLLARS, 17 people's 2026
   balances, and dated absences, readable without signing in.
   ⚠️ HALF OF THIS WAS ALREADY FIXED AND THAT IS THE LESSON. /api/pto-seed was
   locked down Aug 10 "because ~40 people's bonus dollars and dated absences
   were a public download" (PTOTracker.jsx). That shut the import route and
   left the ledger itself open. Closing the door somebody walked through is not
   the same as closing the room.

   ⚠️ WHY A SEPARATE TEST AND NOT JUST HR_PROTECTED. Landing on HR_PROTECTED
   alone routes the read through /api/hr-store, whose full-read bar is rank 5 —
   Director. Matt's Aug 10 ruling is that a Director does NOT see PTO. So the
   list that hides the tab and the door that serves the bytes would have
   disagreed, which is the same failure canSeeProfitShare had.
   ⚠️ AND NOT HR_ID_LOCKED ABOVE EITHER. That is a fixed list of ids, right for
   wages where Matt named three people. PTO is a RANK rule: rank 6 or Payroll,
   whoever holds it. An id list would need editing every time someone is
   promoted, and the day it is not edited is the day it is wrong.
   ⚠️ REFUSES, NEVER FILTERS. hrReadFilter passes any key not on an own-row
   list straight through UNCHANGED, so "filter it" would serve every balance to
   every signed-in user. That exact hole is what the demerit file hit in the
   Aug 7 sweep. A 403 is the only safe answer here. */
const PTO_LEDGER_KEY = "gcfcr-pto-v1";
async function ptoGateRefuses(env, key, uid, canAll) {
  if (key !== PTO_LEDGER_KEY) return false;
  if (!canAll) return true;
  return !(await hrPtoReader(env, uid));
}

const HR_OWN_ROW_ONLY = [
  "gcfcr-hr-evals", "gcfcr-hr-info", "gcfcr-hr-injuries",
  "gcfcr-hr-cfahome", "gcfcr-hr-docfiles-v1", "gcfcr-hr-pins",
];

/* ⚠️⚠️ YOU MAY SEE YOUR OWN ROW. YOU MAY NEVER WRITE IT. (Aug 7 2026 sweep,
   finding 12.)

   🐛 THE HOLE. `gcfcr-hr-leadership-v1` — the Leadership Standards demerit file
   — was correctly added to HR_PROTECTED, the schema deny list and
   KVSET_NEEDS_HR after the Aug 4 sweep, which shut the anonymous half. What
   stayed open was /api/hr-store's own read: it accepts ANY valid token by
   design (a team member's own dashboard is built through it) and then narrows
   the answer with hrReadFilter, which passes straight through anything not on a
   list. The demerit file was on no list. So one GET with a Team Member's token
   returned every write-up ever filed against Hannah, Bri, Nick, Brandon and
   Daisy. Bri built that file on the promise it stays inside HR Console.

   ⚠️ WHY IT IS NOT SIMPLY ADDED TO HR_OWN_ROW_ONLY ABOVE, which was the obvious
   move and is wrong. That list drives the own-row WRITE MERGE as well as the
   read filter, so adding it there would hand every leader a supported path to
   POST their own row back — deleting their own demerits. Same trap the PIN
   fix hit from the other direction, and the reason HR_NEVER_WRITE_HERE exists.

   ⚠️ AND NOT HR_NEVER_WRITE_HERE EITHER, because that blocks the write for
   EVERYONE including full readers, and HR Console has to be able to file a
   point. This is the third shape: read like an own-row key, write like a key
   you have no business writing at all unless you are HR.

   ⚠️ A LEADER MUST STILL SEE THEIR OWN. HRConsole's `showLdr` is
   `isLeaderRole && (canFileLdr || canSubmitLdr || isSelf)`, so a leader opening
   their OWN file reads `ldrPts[their id]`. Returning {} for non-full-readers
   would have blanked that screen, which is why this filters rather than
   refuses. */
/* ⚠️ THE TOKEN LEDGER IS ON HERE FOR THE OPPOSITE-SOUNDING BUT IDENTICAL
   REASON. A team member has to be able to see what they earned — a balance
   nobody can read is not a balance — but they must not see everyone
   else's, or the ledger becomes a league table the store never agreed to
   publish. Filtering to their own row gives both. Same shape as the demerit
   file beside it: read your own, write only if you are HR. */
const HR_OWN_ROW_READ_ONLY = ["gcfcr-hr-leadership-v1", "gcfcr-hr-tokens-v1"];

/* ⚠️⚠️ READ-FILTERED HERE, NEVER WRITTEN HERE. (Aug 7 2026 sweep, critical.)
   `gcfcr-hr-pins` has to stay on HR_OWN_ROW_ONLY above, because that list is
   ALSO what stops /api/hr-store handing the whole PIN map to a signed-in team
   member on READ (hrReadFilter, ~line 4692). Taking it off to close the write
   hole would open a far worse read hole.

   🐛 THE HOLE THIS CLOSES. /api/pin-set is the guarded door: it rejects a PIN
   already in use and stores a salted hash. The own-row merge below was a
   SECOND door to the same map with neither check — any valid token could POST
   {key:"gcfcr-hr-pins", value:{"<their own id>":"1234"}} and have it written
   raw and unhashed.

   That one gap disarmed the brute-force limiter on /api/pin-verify. The
   limiter counts FAILURES per IP and stops at 8, but a SUCCESS clears the
   counter — and once someone owns their own row every probe succeeds on it, so
   the counter never reaches 8. They walk the PIN space until one comes back
   ambiguous, and an ambiguous answer means somebody else holds that PIN.
   End state: sign in as the Owner and read all 106 files. Or set your PIN to
   Hannah's and lock her out, since only a full HR reader can clear it.

   ★ THE INVARIANT: /api/pin-set is the ONLY writer of this key. Verified
   before adding this — HRConsole.setPinRemote posts to /api/pin-set, nothing
   in the client writes gcfcr-hr-pins through hr-store or kv-set, and
   HRConsole only ever READS it (HRConsole.jsx:123). */
const HR_NEVER_WRITE_HERE = ["gcfcr-hr-pins"];

/* Who hears "I cannot remember my PIN". The HR Console five minus Cindy, who
   is reachable by text and not by Slack DM — listing her would look like
   coverage and reach nobody. Names, not ids, because slackIdForName is what
   resolves a Slack account and these four are stable. */
/* ⚠️ PIN_HELP_TO MOVED TO workerSeed.js. It is who a team member locked out
   of the Hub actually reaches, so at a store with nobody in it the request
   goes nowhere and the person is stuck. The second store has run with it
   empty since go-live and their own notes call it "empty and silent, fill
   this first". Empty is the safe default and a loud to-do, not a working
   state. */

/* 🐛 THIS LIVED INSIDE THE FETCH HANDLER AND BROKE /api/kv-set ON ITS FIRST
   REAL CALL (Jul 29 2026): "ReferenceError: Cannot access 'HR_PROTECTED'
   before initialization", 500 on every request.

   It was a `const` declared PART WAY DOWN the handler, and the new route sits
   above it. Everything above that line is inside the temporal dead zone, so the
   reference threw at runtime — not at build, not in any of the six checks,
   which look at useMemo and useCallback bodies rather than at route order in a
   4,000-line handler. It only showed up when the endpoint was actually called.

   ⚠️ THE CLIENT FALLBACK IS THE ONLY REASON NOBODY NOTICED. store.js tries the
   Worker and falls back to the direct write, so every Hub write kept working
   and the endpoint failed in total silence — which is exactly what that
   fallback was written for, and exactly why removing it and closing the RLS
   policy have to be ONE change.
   ⚠️ It also meant the tokenless-write census recorded NOTHING. An empty census
   read as "every write is authenticated" when the truth was "the endpoint never
   ran once".

   ⇒ Module level, next to the list it belongs beside. A route added anywhere in
   the handler can now reference it. */
/* Submission tools too sensitive for the world-readable `submissions` table.
   ⚠️ MUST STAY BYTE-IDENTICAL to SUB_PROTECTED in store.js. See the
   /api/submissions route above for why this exists. */
const SUB_PROTECTED = ["onboarding-intake", "class-survey"];

/* Tools /api/submission will WRITE. Every real caller in the app, and nothing
   else — an unlisted tool is refused so a typo surfaces instead of quietly
   creating a stream nobody reads.
   ⚠️ Keep in step with the callers of saveSubmission in store.js. */
/* Buckets /api/upload will write to — every bucket the app actually uses, and
   nothing else, so a typo is refused instead of creating a stray bucket path. */
const UPLOAD_BUCKETS = [
  "hub-assets", "hr-files", "l101-coursework", "Receipts",
  "food-safety-photos", "trainer-task-photos",
];

/* ⚠️ ADDING A saveSubmission CALLER AND FORGETTING THIS LIST IS A TWO-FILE
   MISTAKE THAT SHIPS QUIETLY. The uniform order form went live on Aug 5 2026
   calling saveSubmission("uniform-order", ...) and every single order came back
   403 not-allowed. The client checks the boolean and says "that did not send",
   so it failed loudly at the person rather than silently — but the form could
   not take one order from the moment it was promoted.
   If you register a new tool that writes a submission, it goes here too. */
const SUB_WRITE_ALLOW = [
  "food-safety", "equipment", "trainer-tasks", "food-quality",
  "goal-submission-attempt", "onboarding-intake", "class-survey",
  "uniform-order", "new-store-setup",
];

/* ── NEW-HIRE INTAKE: THE ONE DOOR THAT CANNOT REQUIRE A TOKEN ────────────
 * public/gate-city-onboarding.html is opened by someone who does not have a
 * Hub account yet. No PIN, no session, so it cannot use /api/upload or
 * /api/submission like everything else does.
 *
 * It used to talk straight to Supabase on the publishable key. The Aug 2
 * lockdown (RLS on, zero policies on storage.objects and no INSERT policy on
 * submissions) silently BROKE it: a new hire's ID upload has been failing ever
 * since, and HR has been getting no intake row. These two routes are the
 * replacement.
 *
 * Everything that can be decided by the server IS decided by the server,
 * because there is no token here to trust:
 *   • the bucket is a constant, never a parameter
 *   • the path must sit under INTAKE_PREFIX, so this cannot write anywhere
 *     else in hr-files
 *   • the tool name is forced, so this cannot file as any other tool
 *   • the stored record is rebuilt field by field, so the page cannot add keys
 *   • per-IP throttle and a size cap stand in for the missing token
 *
 * ⚠️ THE STORED SHAPES ARE UNCHANGED from what the page wrote before — same
 * bucket, same `onboarding-intake/<name>/<file>` path, same payload keys — so
 * the rows HR Console already holds and the rows written from here read
 * identically. That is the whole reason the prefix is what it is. */
const INTAKE_BUCKET = "hr-files";
/* Where a team member's own profile picture lives, and the map that points at
   it. Same bucket as HR files because it is already private, already served
   through the doc-view proxy, and already has the upload path this Worker
   guards. */
const HR_BUCKET = "hr-files";
const HR_PHOTOS_KEY = "hr:photos:v1";

/* A five-minute, single-file handle for /api/doc-view.
   ⚠️ ONE DEFINITION. This was minted inline inside /api/doc-url, and the bulk
   photo route needs the identical thing. Two copies of a signing scheme is how
   one of them quietly stops matching the verifier. It deliberately carries no
   session token: putting that in a URL would trade a five-minute file link for
   a twelve-hour key to everything. */
/* ⚠️ ONE MINT, TWO WRAPPERS. The note above already says two copies of a
   signing scheme is how one of them quietly stops matching the verifier — and
   the copy came back anyway, inline inside /api/doc-url. Collapsed for good.
   ⚠️ THE CEILING IS THE POINT OF THE TTL CLAMP. /api/doc-view has always
   trusted `claim.e` completely, so a forged handle could declare it expires in
   2099. Every handle this Worker mints is now+300 or now+min(caller, 900), so
   a ceiling of DOC_MAX_TTL can reject an immortal forgery and cannot reject one
   legitimate handle, including any minted before this deploy. */
const DOC_MAX_TTL = 900;   // the same cap /api/doc-url already applies to `expires`
async function docHandle(env, bucket, path, expiresIn = 300) {
  if (!bucket || !path) return null;
  const ttl = Math.min(Math.max(Number(expiresIn) || 300, 60), DOC_MAX_TTL);
  const dk = freshKey(env, "doc");
  const hp = b64u(new TextEncoder().encode(JSON.stringify({
    b: bucket, p: path, e: Math.floor(Date.now() / 1000) + ttl, ...(dk ? { v: 2 } : {}),
  })));
  /* The `v` marker and the signing key move together, so rolling the key back
     out of the dashboard can never orphan a handle that is already out there. */
  const sig = dk ? await hmacRaw(dk, "doc|" + hp) : await hmacRaw(legacyKey(env), hp);
  return `${hp}.${sig}`;
}
async function signedHandle(env, bucket, path, expiresIn = 300) {
  const h = await docHandle(env, bucket, path, expiresIn);
  return h ? "/api/doc-view?h=" + encodeURIComponent(h) : null;
}
/* ── THE ONE VERIFIER ───────────────────────────────────────────────────────
   Returns the claim, or null, or the string "expired" so the caller can tell a
   person their link timed out rather than that they are not authorized.
   ⚠️ ONE DEFINITION, for the same reason the minting has one: this used to sit
   inline in /api/doc-view, which meant the 5am sweep had no way to test the
   real rule and could only test a copy of it. A self-test that reimplements
   what it is testing proves the copy agrees with itself and nothing else. */
async function readDocHandle(env, handle) {
  try {
    const [hp, sig] = String(handle || "").split(".");
    if (!hp || !sig) return null;
    /* Decode BEFORE verifying, so we know WHICH key to check against. Nothing
       is trusted until okSig is true, and a malformed payload throws into the
       catch below exactly as it did before. */
    let claim = null;
    try {
      claim = JSON.parse(new TextDecoder().decode(
        Uint8Array.from(atob(hp.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))
      ));
    } catch { return null; }
    if (!claim || !claim.e) return null;
    const dk = freshKey(env, "doc");
    const okSig = claim.v === 2
      ? (!!dk && pinEq(sig, await hmacRaw(dk, "doc|" + hp)))
      : pinEq(sig, await hmacRaw(legacyKey(env), hp));
    if (!okSig) return null;
    /* ⚠️ THE EXPIRY IS THE CALLER'S, AND A VALID SIGNATURE DOES NOT MAKE IT
       TRUE. Nothing used to stop a forged handle declaring e = 2099. Every
       handle this Worker has ever minted is now+300 or now+min(caller, 900),
       so this ceiling cannot refuse a legitimate one — including any minted
       before it shipped. */
    if (claim.e > Math.floor(Date.now() / 1000) + DOC_MAX_TTL) return null;
    if (claim.e < Math.floor(Date.now() / 1000)) return "expired";
    return claim;
  } catch { return null; }
}
/* Sweep helper: re-sign a real handle with a longer life, using the SAME key it
   was minted under, so the signature is genuinely valid. Exists only so the
   5am sweep can prove the ceiling above actually bites. */
async function forgeLongDocHandle(env, handle, seconds) {
  try {
    const [hp] = String(handle || "").split(".");
    const claim = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(hp.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))
    ));
    claim.e = Math.floor(Date.now() / 1000) + seconds;
    const hp2 = b64u(new TextEncoder().encode(JSON.stringify(claim)));
    const dk = freshKey(env, "doc");
    const sig = claim.v === 2 && dk
      ? await hmacRaw(dk, "doc|" + hp2)
      : await hmacRaw(legacyKey(env), hp2);
    return `${hp2}.${sig}`;
  } catch { return null; }
}
const INTAKE_PREFIX = "onboarding-intake/";
const INTAKE_TOOL = "onboarding-intake";
const INTAKE_MAX_BYTES = 15 * 1024 * 1024;   // a phone photo of an ID, with room
const INTAKE_MAX_PER_HOUR = 40;              // ~10 new hires an hour on one store IP
/* Store-wide ceiling. The per-IP one alone is worth little against an anonymous
   15MB write into the private hr-files bucket, because addresses are free. */
const INTAKE_MAX_ALL_PER_HOUR = 120;

/* What an ID photo or a certificate is actually allowed to be. Anything else
   is stored as a plain download so it can never render as a page. See the
   serve-side note in /api/doc-view — that is the real guard; this stops the
   bad type reaching storage at all. */
const INTAKE_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "image/heic", "image/heif", "application/pdf",
];
const intakeType = (t) => {
  const v = String(t || "").split(";")[0].trim().toLowerCase();
  return INTAKE_TYPES.includes(v) ? v : "application/octet-stream";
};

const intakePathOk = (p) =>
  typeof p === "string" && p.startsWith(INTAKE_PREFIX) && p.length <= 300 &&
  !p.includes("..") && !p.split("/").some((seg) => seg === "" || seg === ".");

/* Fails OPEN if KV is unreachable, the same call the PIN throttle makes: a new
   hire who cannot file their ID has to come back to the store, which is worse
   than an hour without a counter. */
async function intakeThrottled(env, request) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  /* ★ INCREMENT FIRST, THEN JUDGE THE NUMBER THAT COMES BACK. The old shape
     read a count and then decided, which on Cloudflare KV is not a counter at
     all: there is no atomic increment and get() is served from the colo cache,
     so concurrent callers all read the same stale value and the count barely
     moves. Same bug, same store, as the PIN limiter.
     ⚠️ STILL FAILS OPEN, exactly as the comment above says. null means the
     counter is unknown, and unknown never blocks a new hire from filing their
     ID — that would send them back to the store, which is worse than an hour
     without a ceiling. */
  const perIp = await bumpCounter(env, `intake:ip:${ip}`, 3600);
  if (perIp !== null && perIp > INTAKE_MAX_PER_HOUR) return true;
  const all = await bumpCounter(env, "intake:all", 3600);
  if (all !== null && all > INTAKE_MAX_ALL_PER_HOUR) return true;
  return false;
}

const HR_PROTECTED = [
  /* ⚠️ WAGES. Added Aug 13 2026 WITH its id lock in the same commit, never
     before it — see HR_ID_LOCKED. Protecting this key on its own would only
     move it behind a door that opens for any signed-in token. */
  "gcfcr-hr-pay-v1",
  "gcfcr-hr-evals", "gcfcr-hr-injuries", "gcfcr-hr-files", "gcfcr-hr-info",
  "gcfcr-hr-cfahome", "gcfcr-hr-sigs", "gcfcr-hr-docs-v1",
  "gcfcr-hr-docfiles-v1", "gcfcr-hr-docsends-v1", "gcfcr-hr-evaltpl-v1",
  "gcfcr-hr-evaltasks-v1", "gcfcr-hr-evalcopy-v1", "gcfcr-hr-pins",
  /* Not an HR key, but it belongs behind the same door: nothing in the browser
     may read the store’s cost variances straight out of KV. /api/ipo-plan is
     the only way in and it gates at tier 3. */
  "gcfcr-ipo-plans-v1",
  /* ⚠️ NOT AN HR KEY EITHER, AND IT BELONGS HERE FOR THE SAME REASON AS THE
     LINE ABOVE. `gcfcr-receipt-sends-v1` records who emailed which paid-out
     receipt TO WHICH ADDRESS. Left off this list it is served straight out of
     kv_store on the publishable key that ships in the browser bundle: a list
     of real email addresses plus a map of who sends the store's financial
     documents where. Nothing in the browser reads it — /api/receipt-email
     writes it and is the only thing that ever needs it. */
  "gcfcr-receipt-sends-v1",
  /* ⚠️ ADDED Jul 31 2026 — the SECOND HALF of the email fix. Taking the 105
     addresses out of the browser bundle that morning was real, but this key
     holds all 106 members WITH their emails, roles, start dates and status,
     and it was still world-readable straight from the database with the
     publishable key. Removing them from one door and leaving the other open
     is not a fix; it just moved where you had to look.
     Routing it here is safe: the only browser read left is HR Console's Team
     Documentation import panel, and the Worker's own `recipientFor` reads it
     on the SERVICE key, which never touches this list. */
  "gcfcr-hr-team-v1",
  /* ⚠️ ADDED Aug 4 2026, BEFORE the first demerit is filed. The Leadership
     Standards file shipped Aug 3 onto worker.js's WRITE gate and no other list.
     Probed production with the publishable key from the live bundle
     (select=key only, never record contents): gcfcr-hr-pins and
     gcfcr-hr-team-v1 returned [] while gcfcr-hr-handbook, -status, -roles and
     -added-v1 each returned their row — so a key off the schema deny list is
     readable by anyone holding the browser bundle, and this one would have been
     the moment Bri filed anything.
     Routing it here is step one of the two-part pattern; the database deny
     follows once this is live and verified.
     ⚠️ Its only caller is HRConsole and filing is gated on full(acting), so
     every writer clears the canAll check /api/hr-store applies. */
  "gcfcr-hr-leadership-v1",
  /* ⚠️ THE PTO LEDGER, Aug 14 2026 — bonus dollars and dated absences for 33
     people, world-readable until today. Full account in ptoGateRefuses.
     ⚠️ ON THIS LIST IT IS ONLY HALF PROTECTED. Landing here routes the read
     through /api/hr-store, whose bar is rank 5; the rank-6 rule that Matt
     actually asked for lives in ptoGateRefuses and is checked at all three of
     that route's gates. Neither half is sufficient alone: this list decides
     which door the read uses, that function decides who gets an answer.
     ⚠️ KVSET_NEEDS_HR IS DELIBERATELY NOT TOUCHED FOR THIS KEY. /api/kv-set
     refuses every HR_PROTECTED key outright before it looks at anything else,
     so a rule there could never fire, and an access rule that cannot fire is
     one more thing to keep true for nothing. */
  "gcfcr-pto-v1",
  /* ⚠️ FIVE LISTS MOVE TOGETHER, and this note is here because one key proved it
     the hard way. It shipped Aug 6 2026 on NONE of them, so for a day anyone who
     opened gatecityhub.com could read it from the database AND overwrite it
     without signing in. It came off every list Aug 8 with the tiles that used
     it. A new protected key needs an entry in all five, not just this one. */
  /* ★ THE TOKEN LEDGER, AND THE NOTE ABOVE IS WHY IT IS HERE ON DAY ONE. It
     went onto all five in the same commit as the leaf that writes its shape,
     before a single row exists — rather than after somebody probed for it,
     which is how the demerit file two lines up was found open. The five, for
     the next person: this list, store.js HR_PROTECTED, SEC_MUST_BE_DENIED,
     KVSET_NEEDS_HR, and supabase-schema.sql. HR_OWN_ROW_READ_ONLY is a sixth
     and only applies to the two keys a person may read their own row of. */
  "gcfcr-hr-tokens-v1",
  /* ⚠️⚠️ ADDED Aug 14 2026, AND BOTH WERE LIVE AND OPEN WHEN IT LANDED.
     `gcfcr-availability-v1` holds when 99 people can work — school nights,
     second jobs, the days somebody cannot do. `gcfcr-skills-v1` holds what 96
     people are certified on. Both answered to the publishable key that ships in
     the browser bundle, so anyone who opened the site read the whole store in
     one request. Not one record: everybody's.
     ⚠️ KEPT BYTE-IDENTICAL with store.js HR_PROTECTED. A key here and not there
     is a read that skips the Worker and hits the now-denied database directly;
     a key there and not here is a read that 403s.
     ⚠️ THE DATABASE DENY LANDED IN THE SAME COMMIT. Wages sat on both code
     lists for a day while the database still served them, and read as protected
     to anybody looking at the code.
     ⚠️ NO TIER GATE IS ADDED. /api/hr-store admits any signed-in token, so every
     leader building a rota reads exactly what they read before. This removes
     ANONYMOUS access and nothing else. */
  "gcfcr-availability-v1", "gcfcr-skills-v1",
];

/* Reduce a whole map to one person's row. Anything that is not a plain object
   is returned untouched — an array or a scalar is not this shape and guessing
   at it would corrupt the response. */
/* The roster, with contact details taken off, for a reader who is not full HR.

   🐛 gcfcr-hr-team-v1 WENT OUT WHOLE TO ANY VALID TOKEN (Aug 4 2026). hrOwnRow
   narrows six of the protected records and returns everything else untouched,
   and the roster is not one of the six — so one request from any of ~106 phones
   returned all 106 people with their EMAIL ADDRESSES. That is the same list
   that was taken out of the browser bundle on Jul 31 and denied in the database
   on the same day; this was the third door and it stayed open.

   ⚠️ FILTERED, NOT REFUSED, and the difference matters. Four browser files read
   this list — HRConsole, App, orgSeats and Leadership101 — and refusing it
   breaks all of them. What they actually READ was checked field by field before
   choosing what to strip: id, name, role and status are used everywhere and are
   already on screen anywhere a board or a directory is (a name and a job title
   are not a secret in a store where both are printed on the wall). `start` and
   `lastEval` drive App.jsx's evaluation-due logic. Email is read only by
   HR Console screens, whose users are full readers and get the unfiltered list
   anyway.
   ⇒ So contact details come off and nothing else does. A caller that loses
   email sees the same empty string it already falls back to when a member has
   none, which is why nothing breaks.

   ⚠️ ADD A FIELD TO THE ROSTER AND DECIDE HERE. This is an allowlist rather
   than a denylist on purpose: a new field is invisible to non-full readers
   until someone chooses to expose it, which is the safe direction to fail. */
/* The ONE narrowing entry point for a non-full reader. Both GET shapes on
   /api/hr-store call this and nothing else, so the batch read and the
   single-key read cannot drift into answering differently — which is exactly
   how the roster slipped through: hrOwnRow was applied faithfully in both
   places and simply had no rule for this key. */
function hrReadFilter(key, value, uid) {
  /* ⚠️ THIS RUNS ONLY FOR NON-FULL-READERS — the call site is
     `canAll ? v : hrReadFilter(...)`. Being signed in is not enough to read
     another operator's account logins, so this returns nothing at all rather
     than a filtered shape. Bri, Hannah, Matt and Nick are full readers and
     never reach this line. */
  if (key === "gcfcr-hr-team-v1") return hrRosterPublic(value);
  return hrOwnRow(key, value, uid);
}

/* ⚠️ THIS LIST IS A WHITELIST, AND THAT IS WHY `preferred` HAD TO BE ADDED HERE.
   Anything not named is STRIPPED from the roster before a non-full reader sees
   it — that is the Jul 31 fix that took 106 email addresses out of the browser
   bundle. A field the app relies on but nobody whitelists does not error, it
   silently arrives as undefined, which for a nickname means every screen quietly
   falls back to the full name and the feature looks broken rather than blocked.

   ⚠️ A NICKNAME IS NOT PERSONAL DATA THE WAY THE STRIPPED FIELDS ARE. What the
   store calls someone is said out loud on the floor all day; an email address,
   a hire date and a termination reason are not. It belongs on the same side of
   this line as `name` and `role`, and it is here for the same reason they are:
   every screen shows it. */
const HR_ROSTER_PUBLIC_FIELDS = ["id", "name", "preferred", "role", "status", "start", "lastEval"];
function hrRosterPublic(value) {
  if (!Array.isArray(value)) return value;
  return value.map((m) => {
    if (!m || typeof m !== "object") return m;
    const out = {};
    for (const f of HR_ROSTER_PUBLIC_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(m, f)) out[f] = m[f];
    }
    return out;
  });
}

function hrOwnRow(key, value, uid) {
  if (!HR_OWN_ROW_ONLY.includes(key) && !HR_OWN_ROW_READ_ONLY.includes(key)) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.prototype.hasOwnProperty.call(value, uid) ? { [uid]: value[uid] } : {};
}

const PIN_MAX_FAILS = 8;
const PIN_LOCK_TTL = 15 * 60;
/* ⚠️ THE ONLY CONTROL BELOW THAT CAN REFUSE A REAL LEADER IS THE PER-IP ONE,
   AND IT KEEPS TODAY'S EXACT NUMBERS — 8 fails, 15 minutes, the numbers every
   client already has a message for. Everything else is scoped so the door that
   closes is always one no leader is standing at: the account lane only exists
   once a caller has NAMED themselves, and the anon lane only ever counts
   devices that have never signed anyone in.
   COLD_SEARCH and PIN_ANON_ENFORCE live with the other stage flags above. */
const PIN_ACCT_MAX = 5;              // per NAMED account, per 15 min
/* ★ THE CLAIM ROUTE GETS ITS OWN, TIGHTER PAIR (Matt, Aug 10 2026: "lower the
   cap", after the end-to-end test put a number on the residual).

   ⚠️ WHY NOT JUST LOWER PIN_ACCT_MAX: it is SHARED with /api/pin-verify, which
   is the daily sign-in for ~106 people. Tightening the claim window by making
   the whole store's sign-in twitchier would trade a one-day risk for a
   permanent, everyday one, and the person it refuses is a real leader on the
   floor. Separate constants, separate counter keys (`claim:acct:` was already
   its own lane), same shape.

   ★ THE NUMBERS, AND THE ARITHMETIC BEHIND THEM. A claim code is 4 digits, so
   10,000 possibilities. At 5 tries per 15 minutes that is ~480 guesses a day
   against one named account, near 5% a day of opening it. At 3 per hour it is
   ~72 a day, about 0.7% — the same door, roughly seven times narrower.

   ⚠️ THREE IS GENEROUS FOR WHAT THIS ACTUALLY IS. Claiming is a ONE-TIME act
   and the code is the last four of your own phone. One try is the normal case;
   three covers a fumble and a "maybe it is my other number". Somebody who
   burns all three waits an hour or asks a director to set their PIN by hand,
   which is already the standing path for anyone with no number on file and now
   for every leader.
   ⚠️ WHAT ACTUALLY CLOSES THIS IS PEOPLE CLAIMING. The window exists only
   while an account is unclaimed. Rate limiting narrows it; go-live day closes
   it. Do not read these numbers as "the codes are strong". */
const CLAIM_ACCT_MAX = 3;            // per NAMED account being claimed
const CLAIM_LOCK_TTL = 60 * 60;      // …per hour, not per 15 minutes
const PIN_ANON_MAX = 25;             // STORE-WIDE, per hour, cold devices only
const PIN_ANON_WINDOW = 60 * 60;
const PIN_WALK_ALARM = 40;           // distinct wrong PIN VALUES in an hour

const PUSH_SUBS_KEY = "gcfcr-push-subs-v1";

/* ── KEYS /api/kv-set WILL NOT WRITE FOR AN ANONYMOUS CALLER ───────────────
 * `HR_PROTECTED` is an EXACT list, so every `gcfcr-hr-` key that is not on it
 * — roles, status, added-v1, writeups-v1, evals-v1 — fell straight through to
 * the untokened write. That is not a theoretical hole:
 *   • `gcfcr-hr-roles` is the map `hrFullReader` resolves off, so writing it
 *     demotes the real directors and locks them out of /api/pin-set,
 *     /api/submissions and the unfiltered HR reads.
 *   • `gcfcr-hr-status` is the terminated-employee filter /api/pin-verify
 *     trusts at sign-in.
 * The sweep's own heartbeat and census snapshot are here for the same reason:
 * an alarm anyone can overwrite with a forged all-clear is not an alarm.
 *
 * ⚠️ THIS REQUIRES A TOKEN, IT DOES NOT BLOCK THE KEY. LeadershipDev.jsx
 * legitimately writes `gcfcr-hr-roles` through this route when a signed-in
 * leader changes someone's role, so refusing the prefix outright would break
 * a real screen. Signed in, everything works exactly as it did.
 * ⚠️ Deliberately NOT the same thing as HR_PROTECTED. That list means "this
 * key belongs on /api/hr-store instead"; this one means "prove who you are
 * first". A key can need the second without moving to the first. */
/* ⚠️ `hr:` IS A SECOND HR PREFIX, and it was missed. `hr:rank-by-name:v1` is
   the name→rank map this Worker's food-safety rota trusts to decide who is
   even eligible for the walkthrough (FS_RANK_KEY, FS_MIN_RANK — see
   runFoodSafetyAssign). Anyone on the internet could rewrite it and change who
   the store assigns. `hr:slack-avatars:v1` is the other one; the Worker writes
   it on the service key, and no browser code writes it at all, so covering the
   whole prefix costs nothing.
   ⚠️ This REQUIRED the App.jsx fix that moved the sign-in publish below the
   token store. Before that, the publish always went out unauthenticated, so
   this line would have refused it on every sign-in and quietly staled the
   rota's map. Do not port one without the other. */
const KVSET_NEEDS_TOKEN = (k) =>
  k === SESSION_EPOCH_KEY ||
  k.startsWith("gcfcr-hr-") || k.startsWith("hr:") || k === PUSH_SUBS_KEY ||
  k === SWEEP_PROBE_KEY || k === SWEEP_CENSUS_SNAP_KEY ||
  /* 🐛 THE NOTIFY MAP WAS ON NONE OF THE THREE GATES (Aug 9 2026 sweep,
     finding 3). It is the map EVERY operational DM is addressed from, and an
     unauthenticated POST could rewrite it. Point the names at nothing and the
     5am security sweep computes its findings, sends nothing, and reports
     success — the store's only intrusion alarm, switched off from outside with
     no sign-in and no trace. Point them at a real roster name instead and the
     security findings, the Sunday cut report, the labor numbers, the new-hire
     announcements and the L10 recap all land in that person's inbox.
     ⚠️ NOTHING IN THE BROWSER WRITES THIS KEY. It is worker-side config, so a
     token gate costs no one anything. */
  k === NOTIFY_TARGETS_KEY ||
  /* ⚠️ THE CENSUS MAP ITSELF. The snapshot key was covered and the map it
     snapshots was not — so an untokened caller could POST an empty map here,
     and because the self-record below runs BEFORE the write, their empty map
     lands last. The sweep's "new anonymous writer" delta then reads clean
     forever. Same failure as the heartbeat: an alarm anyone can overwrite is
     not an alarm. Nothing in the browser writes this; the Worker does it on
     the service key, which never passes through this check. */
  k === "gcfcr-kvset-anon-keys-v1" ||
  /* ⚠️ THE FLAGS THAT DECIDE WHETHER A JOB ALREADY RAN (Aug 9 2026 sweep,
     finding 16). Every one of these is a scheduled job's own memory, and the
     values are ones an attacker can simply guess.
       · `{"year":2026}` to the handbook key and worker.js answers "already sent
         for 2026" on all seven December runs — Bri and Hannah never get the
         reminder. That failure has ALREADY happened here by accident, badly
         enough that the key was renamed to v2 to escape it.
       · a Monday ISO string to the trainer-tasks key skips that week's
         completion email.
       · `[]` to the onboarding key goes the other way and RE-ANNOUNCES every
         hire from the last 30 days.
     ⚠️ NOTHING IN THE BROWSER WRITES ANY OF THESE, so a token gate costs no one
     anything — verified per key by grepping every .js and .jsx in the repo, not
     assumed from the finding. That is what makes this safe to close while the
     ordinary tile keyspace deliberately stays open: the reason that door is
     still open ("132 callers would break") simply does not apply to a key with
     no caller.
     ⚠️ A JOB SILENCED THIS WAY LEAVES NO TRACE. It does not error, it reports
     success, and nobody notices for a week — which is why these are worth
     closing even though each one alone looks small. */
  k === ADOPT_STATE_KEY || k === GAP_CHECK_SENT_KEY || k === HANDBOOK_KEY ||
  k === ONBOARD_NOTIFIED_KEY || k === TRAINER_TASKS_EMAIL_SENT_KEY ||
  k === SEC_STATE_KEY;

/* ★★ A TOKEN IS NOT ENOUGH FOR THE KEYS THAT DECIDE WHO SOMEONE IS (Aug 4 2026).

   🐛 THE HOLE THE AUG 2 SWEEP LEFT HALF-OPEN. That sweep found `gcfcr-hr-roles`
   writable through this route and closed the ANONYMOUS half by adding it to
   KVSET_NEEDS_TOKEN. But `!tok` is the only test there, so ANY of the ~106
   people holding a Hub PIN could still PUT the map that decides everybody's
   rank: promote themselves to Director, or demote Hannah, Bri and Nick to no
   access at all and lock every director out with no in-app way back.
   Same door reached `gcfcr-hr-status` (who counts as terminated),
   `gcfcr-hr-added-v1`, the new `gcfcr-hr-leadership-v1` demerit file, and
   `hr:photos:v1`, where an entry is a bucket+path that /api/hub-photos will
   sign — so a forged row turns the photo route into a reader for any file in
   the private HR bucket, including uploaded IDs.

   ⚠️ EXACT KEYS, NEVER A PREFIX, AND THAT IS THE WHOLE CARE IN THIS CHANGE.
   The tempting version of this gates `gcfcr-hr-` and `hr:` wholesale. Both are
   wrong and both break the store:
     · `hr:rank-by-name:v1` is republished by App.jsx on EVERY successful
       sign-in, by every ordinary team member. The Worker's food-safety rota
       assigns people off that map. Gating `hr:` stops the rota updating.
     · `gcfcr-hr-handbook` and `-ldrhandbook` hold `acks`, and SignSection sets
       canSign={isSelf} — all 106 people write those keys when they sign their
       own handbook. Gating `gcfcr-hr-` blocks every signature in the building.
   ⇒ Only keys whose ONLY legitimate writers are already full HR readers are
   listed. Verified writer by writer: roles/status/added/leadership are written
   by HRConsole (the five HR Console people) and by LeadershipDev (Bri, rank 6);
   hr:photos:v1 has no browser writer at all — /api/my-photo writes it on the
   service key, which never passes through this check.
   ⚠️ Before adding a key here, find EVERY writer and confirm each one is a full
   HR reader. A key added on a hunch locks real people out of ordinary work, and
   that failure shows up mid-shift. */
/* ★★ THE TOKEN LEDGER IS RANK-GATED, NOT FULL-HR GATED, AND THE DIFFERENCE IS
   THE WHOLE FEATURE. Matt, Aug 11 2026: "Who can grant is a config value.
   Default to Director and above."

   `hrFullReader` is FIVE named people. Putting tokens on KVSET_NEEDS_HR below
   would have meant a Director seeing a Grant button that answered 403 — a
   config value that is a lie, which is worse than no config value.

   Rank 6 IS tier 3 IS "Director" (roleTier: rank >= 6 → tier 3; TIER_NAMES 3 =
   Director), so this is Matt's default expressed in the units the Worker has.

   ⚠️⚠️ IT STILL HAS TO BE GATED SOMEWHERE, AND HERE IS THE ONLY PLACE THAT
   COUNTS. Without a check, any of the ~106 people holding a PIN could POST the
   whole ledger map and hand themselves any balance they liked. A reward
   currency with an ungated writer is not a reward currency.
   ⚠️ A store that wants to widen or narrow this changes `tokens.grantMinTier`
   in storeConfig for the SCREEN, and this constant for the DOOR. Both, or the
   two disagree — the screen is a courtesy, this is the enforcement. */
const KVSET_MIN_RANK = { "gcfcr-hr-tokens-v1": 6 };

const KVSET_NEEDS_HR = (k) =>
  k === SESSION_EPOCH_KEY ||
  /* Who every operational DM goes to. Token alone is not enough: any of the
     ~106 people holding a PIN could otherwise redirect the security sweep and
     the labor numbers to themselves. See KVSET_NEEDS_TOKEN above. */
  k === NOTIFY_TARGETS_KEY ||
  k === "gcfcr-hr-roles" || k === "gcfcr-hr-status" ||
  k === "gcfcr-hr-added-v1" || k === "gcfcr-hr-leadership-v1" ||
  /* Preferred names. READABLE by anyone — it is merged into the roster on the
     pre-sign-in path and gating the read would stop the sign-in screen — but
     WRITABLE only by a full HR reader. The prefix alone would have let any of
     the ~106 people holding a PIN rename anybody on every screen in the Hub,
     which is not vandalism worth much but is a lie the whole store would see.
     The input lives in HR Console's Employee Details panel, which already
     requires HR Console membership, so this gate costs its real users nothing. */
  k === "gcfcr-hr-preferred-v1" ||
  /* 🐛 HANDBOOK SIGNATURES WERE FORGEABLE (Aug 7 2026). These two keys were
     never on HR_PROTECTED, so signing worked — and the reason it worked is that
     /api/kv-set would take a write from anybody holding a PIN. Any of the ~106
     could have written a signature in someone else's name, changed the date on
     one, or deleted the lot. Nothing about that was a decision; the handbook
     keys and the document-send key simply landed on different lists, and only
     one of them was noticed.
     ⚠️ THIS MAKES THE OLD SIGNING PATH FAIL ON PURPOSE. A person signing their
     own handbook now goes through /api/doc-ack, which writes only their row.
     The console's HR-side edits still come through here and still work,
     because every HR Console member is a full reader. */
  k === "gcfcr-hr-handbook" || k === "gcfcr-hr-ldrhandbook" ||
  k === HR_PHOTOS_KEY;

const b64uToBytes = (s) => {
  const pad = "=".repeat((4 - (String(s).length % 4)) % 4);
  const b64 = (String(s) + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const bytesToB64u = (buf) => {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const concatBytes = (...parts) => {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const utf8 = (s) => new TextEncoder().encode(s);

async function hmacSha256(keyBytes, dataBytes) {
  const k = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, dataBytes));
}

/* One HKDF round is all RFC 8291 ever needs — every output is ≤32 bytes, so the
   counter never goes past 0x01. Written out rather than looped for that reason. */
async function hkdf1(salt, ikm, info, length) {
  const prk = await hmacSha256(salt, ikm);
  const okm = await hmacSha256(prk, concatBytes(info, new Uint8Array([1])));
  return okm.slice(0, length);
}

/* VAPID JWT, ES256. The private key is the raw 32-byte scalar and the public
   key is the uncompressed point 0x04||x||y, so x and y are carved out of the
   public key to build the JWK — importing a bare `d` is not enough. */
async function vapidAuthHeader(env, endpoint) {
  const pub = b64uToBytes(env.VAPID_PUBLIC_KEY);
  const priv = b64uToBytes(env.VAPID_PRIVATE_KEY);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("VAPID_PUBLIC_KEY is not an uncompressed P-256 point");
  if (priv.length !== 32) throw new Error("VAPID_PRIVATE_KEY is not a 32-byte P-256 scalar");

  const jwk = {
    kty: "EC", crv: "P-256", ext: true,
    x: bytesToB64u(pub.slice(1, 33)),
    y: bytesToB64u(pub.slice(33, 65)),
    d: bytesToB64u(priv),
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);

  const aud = new URL(endpoint).origin;
  const header = bytesToB64u(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = bytesToB64u(utf8(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    /* ★ FROM storeConfig.js. The env var still wins; this is the fallback
       when a store has not set one, and it used to be Gate City's address
       hardcoded — so a clone's push notifications would have carried our
       contact address to their team's phones. */
    sub: env.VAPID_SUBJECT || `mailto:${STORE.notifyEmail}`,
  })));
  const signed = `${header}.${body}`;
  // WebCrypto returns the raw r||s pair, which is exactly what JWS ES256 wants.
  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, utf8(signed)
  ));
  return `vapid t=${signed}.${bytesToB64u(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

/* RFC 8291 §3.4. Body layout: salt(16) || rs(4) || idlen(1) || as_public(65) || ciphertext */
async function encryptPush(uaPublicB64u, authSecretB64u, plaintext) {
  const uaPublic = b64uToBytes(uaPublicB64u);
  const authSecret = b64uToBytes(authSecretB64u);

  const asKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey)); // 65 bytes, 0x04||x||y
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256)
  );

  // The auth secret salts the FIRST round; the random salt salts the second.
  const keyInfo = concatBytes(utf8("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf1(authSecret, ecdhSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf1(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf1(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);

  // 0x02 is the last-record delimiter. One record only, so it is always 0x02.
  const padded = concatBytes(utf8(plaintext), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, padded)
  );

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  return concatBytes(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

function vapidReady(env) {
  return !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

/* Returns { ok, status, gone }. `gone` means the push service says this
   endpoint is dead (404/410) and it should be dropped from storage — that is
   how a reinstalled or wiped device stops accumulating forever. */
async function sendPush(env, subscription, payloadObj) {
  const endpoint = subscription && subscription.endpoint;
  const keys = (subscription && subscription.keys) || {};
  if (!endpoint || !keys.p256dh || !keys.auth) return { ok: false, status: 0, error: "incomplete subscription" };

  const body = await encryptPush(keys.p256dh, keys.auth, JSON.stringify(payloadObj || {}));
  const auth = await vapidAuthHeader(env, endpoint);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
    },
    body,
  });
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}

const pushSubsGet = async (env) => (await sbGet(env, PUSH_SUBS_KEY)) || {};
const pushSubsSet = (env, v) => sbSet(env, PUSH_SUBS_KEY, v);

/* ★ THE ROUTING ENTRY POINT. Everything that wants to reach a person by
   RESPONSIBILITY calls this — the input register, HR events, the board
   resolver. Keyed by uid, so one person's several devices all get it and a
   shared iPad that changed hands does not. Dead endpoints prune themselves. */
/* ── TOOL ALERTS, ROUTED BY RESPONSIBILITY ───────────────────────────────
 * Matt, Jul 26: "I want the app to be smart and send push alerts to anyone who
 * is responsible phones."
 *
 * There USED to be four hardcoded personal email addresses above. They were the
 * same trap as the hardcoded Slack IDs — terminating someone in HR does not
 * touch a literal, so a departed team member keeps receiving store operational
 * mail indefinitely — and worse, they were the fallback for EVERY store, so a
 * clone's cash audit mail went to Gate City. Deleted Aug 10 2026 (sweep 28).
 * Routing is now seat -> this store's own override key -> nothing at all.
 *
 * This resolves the OWNER off the Daily Setup board instead, at send time, so
 * the alert follows the seat rather than a name typed in once. The board is the
 * same source the input register uses — `boardOwner.js` is a leaf module with
 * no React, no store.js and no import.meta.env precisely so the worker can
 * import it and there is ONE copy of the rule.
 *
 * ⚠️ ADDITIVE ON PURPOSE — THE EMAIL STILL SENDS. Push adoption is five devices
 * out of a hundred-plus, and of Monday's nine board leaders exactly one can be
 * reached today. Cutting the email now would remove the channel that works in
 * favour of one almost nobody has. Cut it when adoption is real, not before.
 */
const TOOL_OWNER_INPUT = { cleaning: "cleaning", cashaudit: "cashcounts" };

async function pushToOwners(env, tool, payloadObj) {
  const inputId = TOOL_OWNER_INPUT[tool];
  if (!inputId) return { sent: 0, skipped: "tool has no board owner" };
  try {
    const now = new Date();
    const monday = boardMondayKey(now);
    const [foh, boh] = await Promise.all([
      sbGet(env, boardKey("foh", monday)),
      sbGet(env, boardKey("boh", monday)),
    ]);
    if (!foh && !boh) return { sent: 0, skipped: "no board" };
    const owners = ownersForInput(inputId, boardShift({ foh: foh || {}, boh: boh || {} }, now));
    if (!owners) return { sent: 0, skipped: "nobody resolved" };

    /* The subscription store is the audience list and carries each person's own
       name, so matching is name → device with NO roster read. `isBoardOwner`
       resolves ambiguity to NO MATCH, so a bare "Ashley" on the board reaches
       neither Ashley rather than the wrong one. */
    const all = await pushSubsGet(env);
    const uids = new Set();
    Object.values(all).forEach((rec) => {
      if (!rec || !rec.subscription || !rec.name || rec.uid == null) return;
      if (isBoardOwner(rec.name, owners)) uids.add(String(rec.uid));
    });
    let sent = 0;
    const results = [];
    for (const uid of uids) {
      const r = await pushToUid(env, uid, payloadObj);
      if (r && Number(r.sent) > 0) sent += r.sent;
      if (r && Array.isArray(r.results)) results.push(...r.results);
    }
    return { sent, resolved: owners.names.length, reached: uids.size, results };
  } catch (e) {
    // A push failure must NEVER take the email down with it — the email is
    // still the channel most of these people actually have.
    return { sent: 0, error: String(e) };
  }
}

async function pushToUid(env, uid, payloadObj) {
  if (!vapidReady(env) || uid == null) return { sent: 0, skipped: "not configured or no uid" };
  /* ⚠️⚠️ THE FOURTH CHOKE POINT, AND IT WAS MISSING (Aug 7 2026 sweep).
     `&quiet=1` was honoured at sendSlack, sendSlackDM, postToSlackChannel and
     pushToPerson — but NOT here, the raw web-push sender. Two scheduled jobs
     call this one DIRECTLY and never touch the quiet-aware wrapper:
     `supply-reminder`, and `input-push`, which the dispatcher hands the bare
     function. So the documented dry run CLAUDE.md tells Matt to use fired real
     notifications at real phones — every leader with a late input row told
     something was overdue, on a Sunday, whenever he happened to test.
     This is the identical defect the Aug 4 sweep raised for sendSlackDM. That
     one was fixed at the Slack sender and the push sender was left behind,
     which is why the count of choke points in the comment above sendSlackDM
     said three. It is four. */
  if (env && env.__QUIET) {
    console.log(`[quiet] would push to uid ${uid}: ${payloadObj && payloadObj.title}`);
    return { sent: 0, quiet: true, wouldPush: String(uid), title: payloadObj && payloadObj.title };
  }
  const all = await pushSubsGet(env);
  const mine = Object.entries(all).filter(([, r]) => r && String(r.uid) === String(uid));
  if (!mine.length) return { sent: 0, skipped: "no devices" };

  let sent = 0;
  const dead = [];
  /* ⚠️ THE STATUS USED TO BE THROWN AWAY HERE. `sendPush` returns
     {ok, status, gone} and this loop kept only `ok`, so a refusal from Apple or
     Google was indistinguishable from any other failure — the caller saw
     `sent: 0` with nothing to act on. Same swallow-the-signal shape as the bare
     `{ok:true}` that hid the push outage for a day, one layer down. */
  const results = [];
  for (const [endpoint, rec] of mine) {
    const host = (() => { try { return new URL(endpoint).host; } catch { return "?"; } })();
    try {
      const r = await sendPush(env, rec.subscription, payloadObj);
      results.push({ service: host, status: r.status });
      if (r.ok) sent++;
      else if (r.gone) dead.push(endpoint);
    } catch (e) { /* one bad device must not stop the rest */
      // A THROW is not a refusal — it is our own encryption or VAPID signing
      // failing before the request left. Reported separately; different fix.
      results.push({ service: host, error: String((e && e.message) || e) });
    }
  }
  if (dead.length) {
    const next = { ...all };
    dead.forEach((e) => delete next[e]);
    await pushSubsSet(env, next);
  }
  return { sent, devices: mine.length, pruned: dead.length, results };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    /* ⚠️ A PUBLIC /r/<token> SHARE PAGE WAS REMOVED HERE, Aug 8 2026, with the
       two commercial tiles it served. Its register held zero rows, so no live
       link broke. Any /r/ URL now falls through to the SPA catch-all.
       ⚠️ DO NOT REBUILD IT HERE. That business has its own repo. */

    if (url.pathname === "/api/live-schedule" && request.method === "GET") {
      /* Locked Jul 31 2026: this handed the week's names and shifts, straight
         off the Google Sheet, to anyone who asked. No consumer of this route
         exists in the repo, the public pages, or CRON-JOBS.md — if something
         external does use it, it now fails loudly with a 401 instead of
         leaking, and can be given a session token. */
      const tok = await readToken(env, request.headers.get("x-hub-token"));
      if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
      const side = (url.searchParams.get("side") || "").toLowerCase();
      const day = url.searchParams.get("day") || "";
      if (side !== "foh" && side !== "boh") {
        return Response.json({ error: 'side must be "foh" or "boh"' }, { status: 400 });
      }
      const { status, body } = await fetchLiveSchedule(env, side, day);
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }

       if (url.pathname === "/api/ai-summary" && request.method === "GET") {
      /* Locked Jul 31 2026: unauthenticated, this burned Anthropic credit for
         anyone on the internet and served the leader digest — schedule and
         people detail — for any uid they typed. The cron job is unaffected:
         mornings build through /api/run-job, which has its own key. */
      const tok = await readToken(env, request.headers.get("x-hub-token"));
      if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
      if (!env.ANTHROPIC_API_KEY) {
        return Response.json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
      }
      const kv = { get: (k) => sbGet(env, k), set: (k, v) => sbSet(env, k, v) };
      const dateStr = isoOfD(nowET());
      const tier = Number(url.searchParams.get("tier") || 0);
      const uid = url.searchParams.get("uid") || null;
      /* The tier-2 digest is personal. The token names who is asking — a
         request for someone else's digest is refused, not served. */
      if (tier === 2 && uid && String(uid) !== String(tok.u)) {
        return Response.json({ ok: false, error: "you can only load your own digest" }, { status: 403 });
      }
      const jsonHeaders = { "content-type": "application/json", "cache-control": "no-store" };
      const reply = (d) => new Response(JSON.stringify(d), { headers: jsonHeaders });
      try {
        /* ⚠️ RESOLVED ONCE, ABOVE BOTH BRANCHES, AND ONE OF THEM IS THE REASON.
           The leader revalidate below runs inside `ctx.waitUntil(...)`, which
           takes a promise rather than an async body, so there is nowhere in
           there to await. Hoisting it also means one brand read per request
           instead of four, and `storeBrand` caches anyway. */
        const { storeName } = await storeBrand(env);
        // Stale-while-revalidate: serve the cached digest instantly (one read),
        // then re-check freshness in the background and rebuild the cache if the
        // underlying data changed — so a fast open never waits on data reads or
        // the model, and the digest self-heals by the next load.
        if (tier === 2 && uid) {
          const cached = await readLeaderDigest(kv, uid, dateStr);
          if (cached) {
            ctx.waitUntil(
              buildLeaderDigest(kv, env, { dateStr, prevDay: prevBizDayET(), person: { id: uid }, storeName })
                .catch((e) => console.error("leader digest revalidate failed:", e))
            );
            return reply(cached);
          }
          const fresh = await buildLeaderDigest(kv, env, { dateStr, prevDay: prevBizDayET(), person: { id: uid }, storeName });
          return reply(fresh);
        }

        const cached = await readDigest(kv, dateStr);
        if (cached) {
          ctx.waitUntil((async () => {
            let todos = [];
            try { todos = await buildTodaysTodos(env); } catch (e) { /* ok */ }
            await buildDailyDigest(kv, env, { dateStr, todos, prevDay: prevBizDayET(), storeName });
          })().catch((e) => console.error("digest revalidate failed:", e)));
          return reply(cached);
        }
        let todos = [];
        try { todos = await buildTodaysTodos(env); } catch (e) { /* digest still useful without todos */ }
        const fresh = await buildDailyDigest(kv, env, { dateStr, todos, prevDay: prevBizDayET(), storeName });
        return reply(fresh);
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 500 });
      }
    }


    if (url.pathname === "/api/tool-notify" && request.method === "POST") {
      /* Locked Jul 31 2026: unauthenticated, this was an email-and-push spam
         cannon pointed at real leaders. Every caller is a signed-in tool and
         sends the session token now. */
      const tok = await readToken(env, request.headers.get("x-hub-token"));
      if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
      try {
        const b = await request.json();
        const r = await recipientFor(env, b.tool);
        if (!r) {
          return Response.json({ ok: false, error: "unknown tool" }, { status: 400 });
        }
        const res = await sendEmail(
          env,
          r.to,
          b.subject || `${STORE.appName} notification`,
          `Hi ${r.name},\n\n${b.text || "(no details provided)"}\n\n— ${STORE.legalName}`
        );
        // Push to whoever the BOARD says owns this today, alongside the email.
        // Awaited rather than fired-and-forgotten so the response reports what
        // actually happened — a silent push is how the whole feature sat broken
        // for a day without anyone knowing.
        const pushed = await pushToOwners(env, b.tool, {
          title: b.subject || STORE.appName,
          body: b.text || "Open the Hub for details.",
          url: "/",
        });
        return Response.json({ ok: res.ok, pushed });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 500 });
      }
    }

    /* ═══ GENERAL KV WRITE THROUGH THE WORKER ═════════════════════════════
       STEP ONE OF CLOSING THE WRITE HOLE. Everything in kv_store except the HR
       keys is still writable by anyone holding the publishable key that ships in
       the bundle — the scorecard, the boards, cash, waste. Closing that at the
       database means the browser must stop writing directly first, and ~132 call
       sites do exactly that.

       ⚠️ THIS ROUTE CHANGES NOTHING ABOUT WHO CAN WRITE, DELIBERATELY. It grants
       exactly what the publishable key already grants and not one key more, so
       shipping it cannot break a single existing user or open anything new. What
       it adds is a path that WILL be the only one, once the call sites are moved
       and the policy is closed. store.js tries this first and falls back to the
       direct write, so a failure here is invisible today.

       ⚠️ HR KEYS ARE REFUSED OUTRIGHT. They have their own door at
       /api/hr-store, which authenticates and filters per person. Accepting them
       here would hand a service-key write to an unauthenticated caller and undo
       this morning's lockdown in one line.

       ⚠️ IT RECORDS WHICH KEYS ARRIVE WITHOUT A TOKEN. That list IS the
       remaining work — it names the call sites that would break the moment the
       policy closes. Without it, step two is a guess, and a guess here takes
       gatecityhub.com down during a lunch rush. */
    if (url.pathname === "/api/kv-set" && request.method === "POST") {
      try {
        /* ⚠️ A CEILING, NOT A BUDGET. Measured against the live table Aug 2
           2026: the largest stored value is 115 KB, the 99th percentile is
           28 KB, the average is 2.5 KB. 4 MB is ~35x the biggest real record,
           so no legitimate save can reach it even after years of growth —
           it exists only so an untokened caller cannot write unbounded data
           with the service key. Deliberately generous: guessing this low
           breaks a board save mid-shift, which is far worse than the abuse
           it prevents.
           ⚠️ MEASURED ON THE BODY, NOT ON content-length. A header the caller
           chooses is a limit the caller can opt out of — omit it, or send
           chunked, and a header check waves the request through. `request.json`
           already buffers the whole body, so reading the text first costs
           nothing that was not being paid anyway. */
        const raw = await request.text();
        if (raw.length > 4 * 1024 * 1024) {
          return Response.json({ ok: false, error: "too-large" }, { status: 413 });
        }
        let b = null;
        try { b = JSON.parse(raw); } catch {
          return Response.json({ ok: false, error: "bad-json" }, { status: 400 });
        }
        const k = String((b && b.key) || "");
        if (!k) return Response.json({ ok: false, error: "key required" }, { status: 400 });
        if (HR_PROTECTED.includes(k)) {
          return Response.json({ ok: false, error: "use /api/hr-store for HR keys" }, { status: 403 });
        }
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        /* ★ THE ONE CLASS OF KEY THAT IS REFUSED, NOT RECORDED (Aug 2 2026).
           See KVSET_NEEDS_TOKEN. Closing the database write policies earlier
           today made this route the ONLY write door in the building, and a key
           that decides who counts as HR cannot sit behind an open one while
           the census finishes. Ordinary tile saves are untouched. */
        if (!tok && KVSET_NEEDS_TOKEN(k)) {
          return Response.json(
            { ok: false, error: "sign-in required to write this key" },
            { status: 401 },
          );
        }
        /* See KVSET_NEEDS_HR. Signed in is not the same as allowed. This is the
           rank check /api/hr-store has always had and this route never did. */
        if (KVSET_NEEDS_HR(k) && !(tok && await hrFullReader(env, String(tok.u || "")))) {
          return Response.json(
            { ok: false, error: "full HR access required to write this key" },
            { status: 403 },
          );
        }
        /* ★ THE RANK DOOR — see KVSET_MIN_RANK. Separate from the full-HR check
           above rather than folded into it, because they answer two different
           questions: that one asks "are you one of the five", this one asks
           "are you a Director or above". The token ledger needs the second.
           ⚠️ NO TOKEN IS A REFUSAL HERE, unlike the census branch below. That
           branch exists because some legitimate callers write before sign-in;
           nothing writes a token ledger before somebody signs in, and treating
           an anonymous write as merely interesting would be the whole hole. */
        const minRank = KVSET_MIN_RANK[k];
        if (minRank != null) {
          const rank = tok ? await hrRankForUid(env, String(tok.u || "")).catch(() => 0) : 0;
          if (!(Number(rank) >= minRank)) {
            return Response.json(
              { ok: false, error: "not allowed to write this key" },
              { status: 403 },
            );
          }
        }
        if (!tok) {
          /* Recorded, NOT refused. Refusing today would break every caller that
             writes before sign-in — the rank-by-name publish during PIN verify
             is one, and there will be others nobody has found yet. Finding them
             is the point of this list. */
          try {
            const seen = (await sbGetStrict(env, "gcfcr-kvset-anon-keys-v1")) || {};
            const map = seen && typeof seen === "object" && !Array.isArray(seen) ? seen : {};
            /* The FAMILY, not the exact key — see censusFamily. Recording
               exact keys is what filled this to 60/60 and blinded it. */
            const fam = censusFamily(k);
            if (Object.keys(map).length < SWEEP_CENSUS_CAP || map[fam] != null) {
              map[fam] = (Number(map[fam]) || 0) + 1;
              await sbSet(env, "gcfcr-kvset-anon-keys-v1", map);
            }
          } catch { /* the census must never block a write */ }
        }
        await sbSet(env, k, b.value);
        /* ★ A VALID TOKEN IS RENEWED ON EVERY SAVE — twelve fresh hours,
           returned in a header store.js absorbs. Tools save constantly, so a
           device in daily use never ages out mid-shift; the census above
           counted hundreds of writes a day arriving on dead tokens, and that
           is the wall this route cannot be closed against until renewal has
           been live for a while. An EXPIRED token cannot renew itself — that
           would repeal the expiry. */
        if (tok) {
          /* Legacy census. This route and /api/whoami between them see every
             active device — whoami on every mount, this on every save — so the
             count of still-alive pre-split tokens is the number that decides
             when the old signing arm can be closed. Fire-and-forget. */
          if (tok.__legacy) ctx.waitUntil(bumpCounter(env, "legacy:session", 86400));
          return Response.json({ ok: true, authed: true },
            { headers: { "x-hub-token-refresh": await mintToken(env, tok.u, !!tok.r) } });
        }
        return Response.json({ ok: true, authed: false });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 500 });
      }
    }

    if (url.pathname === "/api/slack-notify" && request.method === "POST") {
      /* Locked Jul 31 2026: this let anyone on the internet post to the
         store's Slack — any channel the bot is in, any DM — as the Hub bot.
         Every caller is a signed-in tool; the session token is the key. */
      const tok = await readToken(env, request.headers.get("x-hub-token"));
      if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
      try {
        const b = await request.json();
        /* Set once the WORKER has chosen the recipient itself. The allowlist
           below exists to stop a signed-in browser naming an arbitrary
           destination; a recipient this file resolved out of its own config is
           not that, and running it through the allowlist anyway would refuse
           any store whose configured person is not one of the two ids hardcoded
           there — which is every store but this one. */
        let serverChose = false;
        /* ★★ `to` NAMES A PURPOSE; THE WORKER PICKS THE PERSON (Aug 7 2026,
           clone work).
           Three tiles used to post `channel: "U073LJ603NK"` — a Gate City Slack
           id, chosen by the BROWSER and taken on trust here. Two things wrong
           with that, and the clone was only the second one:

             1. The page decided who got the DM. Everything above this line is
                about not letting a signed-in person choose an arbitrary
                destination, and then three tiles handed one over anyway. It
                passed the allowlist because OUR ids were on the allowlist.
             2. A second store's Goal Submissions DM'd Bri.

           Now the tile says WHY it is messaging ("leadership", "owner") and the
           recipient is resolved here from gcfcr-notify-targets-v1, the same
           config every scheduled job already reads. A store changes who gets
           these by editing config, not by shipping a build.

           ⚠️ `to` WINS AND `channel` IS IGNORED WHEN BOTH ARE SENT. Otherwise a
           caller could name a purpose and still smuggle a destination past it.
           ⚠️ AN UNKNOWN PURPOSE IS A 400, NOT A FALLBACK. Quietly routing an
           unrecognised key to the owner would turn a typo into Matt's phone. */
        if (b.to) {
          const key = String(b.to);
          if (!Object.prototype.hasOwnProperty.call(NOTIFY_DEFAULTS, key)) {
            return Response.json({ ok: false, error: `unknown recipient "${key}"` }, { status: 400 });
          }
          const uid = await notifyTarget(env, key);
          /* Unresolvable is NOT an error the tile should retry — the roster or
             the Slack lookup is down, and the tile's own save already
             succeeded. Same "unresolved" the notify.js helpers already return. */
          if (!uid) return Response.json({ ok: true, sent: false, error: "unresolved" });
          b.channel = uid;
          serverChose = true;
        }
        if (!b.channel || !b.text) {
          return Response.json({ ok: false, error: "channel and text are required" }, { status: 400 });
        }
        /* ★★ WHERE, NOT JUST WHO (Aug 3 2026). The Jul 31 lock closed this to
           the internet and stopped there, so ANY of ~106 signed-in people
           could post as the Hub bot to any channel the bot sits in, or DM any
           person, with any text. Posting as the store's own bot is the kind of
           message people believe.
           A tier gate is the wrong tool — WasteTracker and SupplyCentral are
           used by ordinary team members and must keep working. What they never
           need is an ARBITRARY destination: every caller in the app targets one
           of a handful of fixed places. Allowlisting those keeps every real
           feature and removes the impersonation.
           ⚠️ Add a destination here when a tile legitimately needs a new one.
           A refusal is visible and cheap to fix; the alternative is a door that
           has to be trusted rather than checked. */
        /* ⚠️ THE TWO RAW IDS ARE GATE CITY'S AND ONLY GATE CITY MAY KEEP THEM
           (Aug 11 2026). They are a SAFETY NET, not routing — routing was fixed
           on Aug 7 and now resolves a purpose through notifyTarget. These stay
           so Bri and Matt keep working if the roster or avatar map fails to
           read. But left ungated they sit in a clone's allowlist too, which
           means somebody signed in at another store could post a crafted
           request straight to two people at this one. Nothing would route there
           by accident; this closes the door on doing it on purpose.
           Same STORE.fsr test the recipient fallback at the top of this file
           uses, and it disables itself the same way: standing up a clone starts
           by changing that number. */
        const SLACK_ALLOWED = [
          CHANNELS.inventory,     // WasteTracker, SupplyCentral
          CHANNELS.opsSuccess,      // supply orders, monthly reports
          CHANNELS.brand,    // notify.js
          "unresolved",               // notify.js
          ...(STORE.fsr === GATE_CITY_FSR
            ? [
                "U073LJ603NK",        // Bri — class + submission notices
                "U03KUCTRKMF",        // Matt — order confirmations
              ]
            : []),
        ];
        /* Named destinations first, then the leader rule — see slackDmIsLeader.
           The two ids in the list above stay so Bri and Matt keep working even
           if the roster or the avatar map fails to read. */
        if (!serverChose && !SLACK_ALLOWED.includes(String(b.channel)) && !(await slackDmIsLeader(env, b.channel))) {
          return Response.json({ ok: false, error: "not-allowed" }, { status: 403 });
        }
        if (!env.SLACK_BOT_TOKEN) {
          return Response.json({ ok: false, error: "SLACK_BOT_TOKEN is not set on this Worker" }, { status: 500 });
        }
        let channelId;
        try {
          channelId = await resolveChannel(env, b.channel);
        } catch (e) {
          return Response.json({ ok: false, error: `Could not look up channel: ${e.message}` }, { status: 502 });
        }
        if (!channelId) {
          return Response.json(
            { ok: false, error: `Channel "${b.channel}" not found — check the name, or make sure the bot has been invited to it` },
            { status: 404 }
          );
        }
        /* {{boh}} and friends become real @-mentions here, at the last moment
           before sending, so no tile has to hold a Slack id to tag somebody. */
        const res = await sendSlack(env, channelId, await expandMentions(env, b.text));
        const data = await res.json();
        if (!data.ok) {
          return Response.json({ ok: false, error: data.error || "slack error" }, { status: 502 });
        }
        return Response.json({ ok: true });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 500 });
      }
    }

    if (url.pathname === "/api/notify" && request.method === "POST") {
      /* Locked Jul 31 2026: unauthenticated, this sent real email from the
         store (Resend) with attacker-chosen names and recipients. Its one
         caller is HR Console, which is signed in by definition. */
      const tok = await readToken(env, request.headers.get("x-hub-token"));
      if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
      /* ★★ AND SIGNED IN IS NOT THE SAME AS ALLOWED (Aug 3 2026).
         The Jul 31 lock closed authentication and stopped there. This route
         emails a real person, from the store's own sender, telling them they
         have a document to review and sign with their leader, and pushes it to
         their phone, and copies HR. With only a session check, ANY of ~106
         PIN holders could fabricate a write-up notice naming anyone on the
         roster. The comment above says the one caller is HR Console — true,
         and HR Console is tier-gated in the BROWSER only, while the payload
         shape ships in the public bundle.
         Full-reader is the right bar and costs nothing: all five people who
         can open HR Console already clear it. */
      /* 🐛 EXCEPT IT COST TWO WHOLE FLOWS, SILENTLY (found Aug 4 2026).
         "All five people already clear it" was true of the people, and wrong
         about the CALLERS. Two kinds are raised by ordinary team members doing
         ordinary things, and both have been answering 403 and dropping on the
         floor ever since:
           · `signatureComplete` fires when someone signs their OWN handbook,
             confidentiality statement or documentation — SignSection sets
             canSign={isSelf}, so all ~106 people trigger it. Bri's "so-and-so
             signed" notice has not gone out for any of them.
           · `sign-request` and `fileEntry` fire when a Team Leader files
             write-only documentation. canDocument is rank 3; hrFullReader is
             rank 5 AND HR Console membership. So the team member is never told
             a document is waiting for their signature and it sits pending
             forever, while the leader who filed it sees no error at all.
         `injury` has the same shape: InjurySection lets a team member
         self-report, and that notice was dying too.

         ⇒ THE BAR IS PER KIND, because the kinds are not one thing. Sending is
         still refused outright for anything not listed. The recipient is
         resolved server-side from HR data either way (resolveNotifyEmails
         discards whatever the client sent), so a lower bar cannot redirect an
         email — it only decides who may cause one. */
      const b = await request.json();
      const kind = String((b && b.kind) || "");
      const NOTIFY_MIN_RANK = {
        signatureComplete: 1,   // signing your own paperwork
        injury: 1,              // self-reported injury
        "sign-request": 3,      // canDocument — Team Leader and up
        fileEntry: 3,
        writeup: 3,
        leadershipPoint: 5,     // Directors file these
        eval: 5,
        docSent: 5,
      };
      const need = NOTIFY_MIN_RANK[kind];
      if (need === undefined) {
        return Response.json({ ok: false, error: "unknown kind" }, { status: 400 });
      }
      if (await hrRankForUid(env, String(tok.u)) < need) {
        return Response.json({ ok: false, error: "not-allowed" }, { status: 403 });
      }
      try {
        /* ⚠️ `b` is already parsed ABOVE — the per-kind gate needs the kind
           before it can decide. request.json() can only be read once, so
           re-reading here would throw on every call. */
        /* ★ EMAILS RESOLVE HERE, SERVER-SIDE (Jul 31 2026). The request names
           people; HR data supplies the addresses. Whatever email the client
           sent is discarded — it shipped from a public bundle and could name
           any address as the recipient or the HR copy. */
        await resolveNotifyEmails(env, b);
        const builder = NOTIFY_JOB_BUILDERS[b.kind] || jobsGenericFallback;
        const jobs = builder(env, b);
        /* ⚠️ THE RESULTS ARE READ NOW, AND REPORTED. `allSettled` was awaited
           and thrown away, so this answered ok:true for a write-up, an injury
           notice or a signature request that Resend refused — the member never
           heard, and the leader who filed it believed they had.
           ⚠️ Counting `fulfilled` is NOT enough on its own: `sendEmail` is a
           bare fetch that resolves on a 4xx, so a refused email settles as
           fulfilled. The builders send through `sendEmailOk`, which throws, so
           a rejection here is a real failure.
           ⚠️ Reported, not thrown. The HR record itself is already saved and a
           push may still have landed, so the honest answer is "filed, but this
           many notices did not go", never a blanket failure. */
        const settled = await Promise.allSettled(jobs);
        const emailFailed = settled.filter((s) => s.status === "rejected");
        emailFailed.forEach((s) => console.error("notify email failed:", String(s.reason)));
        // Push the team member's copy as well. Awaited and REPORTED, because a
        // push that silently reaches nobody is exactly how the whole feature
        // sat broken for a day without anyone noticing.
        const t = PUSH_ON_HR[b.kind];
        const pushed = t
          /* ★ ROUTED ON THE ID. `member.id` is already in this payload and is
             the only thing that separates the two Lizbeths — the reachable
             kinds here are fileEntry, injury and signatureComplete, and all
             three used to buzz both their phones. */
          ? await pushToPerson(env, b.member?.name, { title: t.title, body: t.body, url: t.to ? `/?to=${encodeURIComponent(t.to)}` : "/" }, b.member?.id)
          : { sent: 0, skipped: "kind is not an HR event" };
        // `emailsFailed` is the whole point of reading the settled results —
        // HR Console can finally tell "filed and everyone told" from "filed,
        // but the email bounced".
        return Response.json({ ok: true, pushed, emailsSent: settled.length - emailFailed.length, emailsFailed: emailFailed.length });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 500 });
      }
    }

    // Manual trigger for testing scheduled jobs without waiting for the
    // actual cron time. Protected behind a query param match on RUN_JOB_KEY
    // so randoms can't spam your channels/Supabase.
    // Usage: /api/run-job?job=cleaning-summary&key=<RUN_JOB_KEY>
    if (url.pathname === "/api/run-job" && request.method === "GET") {
      const key = url.searchParams.get("key");
      if (!adminKeyOk(env, key)) {
        return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
      }
      const job = url.searchParams.get("job");
      /* Mutating env is safe here — Workers hand each request its own env
         object, so one quiet test cannot silence a concurrent real run. */
      if (url.searchParams.get("quiet") === "1") env.__QUIET = true;

      /* ★★ THE DOUBLE-FIRE GUARD, ON THE ROAD THE TRAFFIC ACTUALLY USES.
         `alreadyRanToday` has existed for a long time and was wired ONLY into
         handleScheduled — and `[triggers] crons` is commented out in
         wrangler.toml, because native Cloudflare Cron never deployed on this
         account. So the guard has never run in production. Every real run
         arrives here from cron-job.org, which RETRIES on a timeout or any
         non-2xx. A slow run therefore posted to Slack twice, emailed twice, and
         filed the change-fund order twice, with nothing anywhere to stop it.

         ⚠️ STAMPS BEFORE RUNNING, DELIBERATELY. A retry happens exactly when
         the first attempt already did its visible work and then timed out.
         Stamping after success would let that case double-post, which is the
         one case this exists to prevent.
         ⚠️ NEVER APPLIED TO quiet=1. A quiet test must not eat the day's stamp
         and silence the real run later.
         ⚠️ FAILS OPEN. If the KV guard itself errors, run the job — a missed
         reminder is worse than a possible duplicate.
         Repeat a real run on purpose with &force=1. Every job in CRON-JOBS.md
         fires at most once a day, so a per-day stamp costs nothing. */
      const forced = url.searchParams.get("force") === "1";
      /* labor-daypart and shift-where each fire four times a day, one per
         daypart, under ONE job name — the per-day stamp must tell the runs
         apart or breakfast's stamp silences lunch, mid and night. Every other
         job keeps its plain name, so nothing else changes.
         ⚠️ shift-where WAS ADDED TO THIS LIST AT THE SAME TIME AS THE JOB, not
         after. A four-a-day job that is missing here runs exactly once and then
         reports "already-ran-today" for the rest of the day — and it reports
         ok:true while doing it, so nothing looks broken and three quarters of
         the store never gets told where they are working. */
      const dedupJobKey = (job === "labor-daypart" || job === "shift-where")
        ? `${job}:${url.searchParams.get("dp") || ""}`
        : job;
      let ranAlready = false;
      if (job && !forced && !env.__QUIET) {
        try { ranAlready = await alreadyRanToday(env, dedupJobKey); } catch { ranAlready = false; }
      }
      if (ranAlready) {
        return Response.json({ ok: true, ran: job, skipped: "already-ran-today" });
      }

      /* ⚠️ THE WHOLE CHAIN IS WRAPPED, NOT EACH BRANCH. There are 36 job
         branches and every one of them returns its own Response; recording
         inside each would be 36 chances to forget one, and the one forgotten is
         the one that goes quiet. The chain keeps its own `return`s because it
         runs inside this function — nothing below moved. */
      const jobStartedAt = Date.now();
      const runChain = async () => {
        /* ★★ THE LAST TWO SUNDAY CHANNEL POSTS (Matt, Aug 5 2026, reviewing the
           whole schedule: "I'll remove any slack posts you suggest").
           CRON-JOBS.md has these at Sunday 8:00pm and 8:30pm, posting to
           #guardian-of-the-brand and #inventory-management. The store is CLOSED
           on Sunday. Nobody reads a channel post on a closed day, and by Monday
           morning it is buried under whatever Monday posts, so the week's
           cleaning and waste roll-ups have been landing where they cannot be
           seen.
           ⚠️ SAME GUARD AS foodsafety-weekly BELOW, deliberately and for the
           same reason: that one was fixed by changing the schedule AND teaching
           the job its own cadence, because a schedule-only fix leaves the
           mistake one mis-click away. These two now know they are Monday jobs.
           ⚠️ ANSWERS ok WHEN IT SKIPS. cron-job.org must see success, not a
           failure it keeps retrying and mailing Matt about.
           ⛔⛔ DO NOT WRITE WHAT IS CURRENTLY SCHEDULED IN THIS COMMENT, OR IN
           CRON-JOBS.md, OR ANYWHERE ELSE IN THIS REPO. Nothing here can reach
           cron-job.org, so any such claim is unverifiable the moment it is
           typed. On Aug 13 2026 that one question was answered THREE ways in a
           day — Sunday 8:00pm/8:30pm, then "no entry exists", then Matt saying
           he has both — and each answer was written down as fact before the
           next one arrived. Every one of them was a guess wearing a comment.
           🐛 THE ORIGINAL FAULT, worth keeping because it is the cheap one to
           repeat: this comment said "Monday 8:00am" while CRON-JOBS.md said
           9:30 and 10:00. Two files disagreeing about one cron expression is
           how a job lands 90 minutes early and posts a roll-up over a week
           that is not finished being counted.
           ⇒ WHAT THIS COMMENT MAY SAY is what the CODE requires, because that
           is checkable from here: both jobs REFUSE any day but Monday, and a
           refusal answers ok, so a wrong day is silent rather than loud. The
           times the runbook holds them to:
               cleaning-summary   30 9 * * 1     Mon 9:30am ET
               waste-report        0 10 * * 1    Mon 10:00am ET
           Whether an entry exists, and what day it is on, is read off the
           account and nowhere else. */
        if (job === "cleaning-summary") {
          if (!forced && nowET().getDay() !== 1) {
            return Response.json({ ok: true, ran: job, skipped: "weekly wrap-up, Mondays only, the store is closed Sunday" });
          }
          /* ⚠️ THE RESULT IS RETURNED NOW, NOT DISCARDED. Both of these post an
             announcement leaders must confirm, and that post is best-effort by
             design — so if it fails, the ONLY place that can say so is this
             response. `await run…(env);` on its own threw the answer away and a
             silent failure would look exactly like a successful run. */
          const r = await runCleaningSummary(env);
          return Response.json({ ok: true, ran: job, ...(r || {}) });
        }
        else if (job === "waste-report") {
          if (!forced && nowET().getDay() !== 1) {
            return Response.json({ ok: true, ran: job, skipped: "weekly wrap-up, Mondays only, the store is closed Sunday" });
          }
          const r = await runWasteReport(env);
          return Response.json({ ok: true, ran: job, hub: (r || {}) });
        }
        else if (job === "week-cut-report") {
          const r = await runWeekCutReport(env, forced);
          return Response.json({ ok: true, ran: job, ...r });
        }
        else if (job === "waste-input-check") {
          const r = await runWasteInputCheck(env);
          return Response.json({ ok: true, ran: job, ...r });
        }
        else if (job === "audit-order-calc") await runAuditOrderCalc(env);
        else if (job === "backup") { const r = await runBackup(env); return Response.json({ ok: true, ran: job, ...r }); }
          /* ★★ RETIRED Aug 5 2026, kept as a live no-op on purpose.
             Matt reviewed the whole schedule against five weeks of real usage
             and said "I'll remove any slack posts you suggest". These are the
             nags. The evidence they do not work is in tool_events: this has run
             every day for weeks and Ops Checklists still reached only 14 people
             in five weeks, Trainer Tasks only 8. A nag you pay for weekly that
             never forms a habit is a cost with no return, and it trains people
             to skim the channel it lands in.
             ⇒ Replaced by the Monday team scoreboard, which points the same
             information the other way: who IS using the tools, ranked by team.

             ⚠️ A NO-OP, NOT A DELETION, AND THAT IS THE WHOLE DESIGN.
             cron-job.org still calls this URL and must keep seeing ok, or it
             retries and mails Matt about a failure that is not one. Deleting the
             branch would answer "unknown job" and do exactly that.
             ⚠️ REVERSING IT IS DELETING THREE LINES. If the scoreboard turns
             out worse than the nag, this comes straight back.
             ⚠️ Matt can delete the cron-job.org entries whenever he likes; there
             is no hurry and nothing breaks either way. */
        /* ✅ BACK ON (Aug 7 2026 sweep, finding 28). Switched off with
           `retired: "replaced by the Monday team scoreboard"` — and that
           scoreboard did not exist anywhere in the repo, so for as long as this
           sat here NOTHING chased a leader who had been asked for a letter of
           recommendation and NOTHING told an applicant their application was
           due. That is exactly the complaint these reminders were built for.
           ⚠️ THE SCOREBOARD WAS NEVER A REPLACEMENT. teamScoreboard counts who
           opened the Hub; it does not chase a recommendation. Two different
           jobs — retiring one for the other was a category error, not a trade,
           and the same mistake is one line below for ops-recap. */
        else if (job === "pg-reminders") { const r = await runPgReminders(env); return Response.json({ ok: true, ran: job, ...(r || {}) }); }
        else if (job === "goal-due") { const r = await runGoalDueReminders(env); return Response.json({ ok: true, ran: job, ...(r || {}) }); }
        else if (job === "foodsafety-assign") { const r = await runFoodSafetyAssign(env); return Response.json({ ok: true, ran: job, ...r }); }
        else if (job === "eval-due-reminders") { const r = await runEvalDueReminders(env); return Response.json({ ok: true, ran: job, ...r }); }
        else if (job === "doc-chase") { const r = await runDocChase(env); return Response.json({ ok: true, ran: job, ...r }); }
        else if (job === "foodsafety-reminder") await runFoodSafetyReminder(env);
        else if (job === "foodsafety-weekly") {
          /* ★★ A WEEKLY REPORT MUST REFUSE TO POST DAILY.
             🐛 Found Aug 3 2026 by READING THE CHANNEL, not the code. This had
             posted every single morning at 7:00 for thirteen days straight,
             each one tagging @channel in #guardian-of-the-brand — so ~106
             people got a "weekly" report daily. Its window is a rolling seven
             days, so consecutive posts barely differ; Jul 26 and Jul 27 were
             word-for-word identical. That is wallpaper, and wallpaper is how a
             channel post stops being read.
             The cause was a SCHEDULE, not this code: CRON-JOBS.md documents
             Sunday, cron-job.org was firing it daily, and the job had no idea
             what day it was. Fixing only the schedule leaves the same mistake
             one mis-click away, so the job now knows its own cadence.
             ⚠️ MONDAY, not Sunday. The store is closed Sundays and channel
             posts wait for Monday — the same ruling that moved the other
             weekly wrap-ups. A Monday run's rolling seven days is exactly the
             week that just finished.
             ⚠️ `force=1` still runs it any day, so a manual check from
             /api/run-job behaves the way anyone would expect. Answers ok when
             it skips: cron-job.org must see success, not a failure to chase. */
          if (!forced && nowET().getDay() !== 1) {
            return Response.json({ ok: true, ran: job, skipped: "weekly, Mondays only" });
          }
          await runFoodSafetyWeekly(env);
        }
        else if (job === "equip-reminder-flag") await runEquipmentReminderFlag(env);
        /* ⚠️ THIS LINE DISCARDED THE JOB'S RESULT. Most siblings spread `...r`
           into the response; this one awaited and threw it away, so the push
           counts the job computes — pushed / unreachable, the only measure of
           adoption there is — never reached the caller. A job that reports
           nothing is indistinguishable from a job that did nothing. */
        else if (job === "trainer-tasks-summary") { const r = await runTrainerTasksSummary(env); return Response.json({ ok: true, ran: job, ...r }); }
        else if (job === "gap-check") { const r = await runGapCheck(env); return Response.json({ ok: true, ran: job, ...r }); }
        /* ✅ BACK ON, same finding and same reasoning as pg-reminders above.
           The daily ops-checklist recap is not something a weekly usage count
           replaces. */
        else if (job === "ops-recap") { const r = await runOpsChecklistRecap(env); return Response.json({ ok: true, ran: job, ...(r || {}) }); }
        else if (job === "ipo-weekly-reminder") await runIpoWeeklyReminder(env);
        /* `&roll-census=1` re-baselines the anonymous-writer census. Deliberate,
           reported in the findings, and refused on a dry run. See runSecuritySweep. */
        else if (job === "security-sweep") { const r = await runSecuritySweep(env, { rollCensus: url.searchParams.get("roll-census") === "1" }); return Response.json({ ok: true, ran: job, ...r }); }
        else if (job === "probe-heartbeat") {
          /* Written by .github/workflows/door-probes.yml — the outside 401
             probes. The security sweep reads this stamp and alarms when it
             goes stale, so a dead probe can never pass as an all-clear. */
          const fails = (url.searchParams.get("fails") || "").split(",").map((s) => s.trim()).filter(Boolean);
          await sbSet(env, SWEEP_PROBE_KEY, { at: new Date().toISOString(), pass: url.searchParams.get("status") === "pass", fails });
          return Response.json({ ok: true, ran: job, fails: fails.length });
        }
        else if (job === "l10-recap") { const r = await runL10Recap(env); return Response.json({ ok: true, ran: job, ...r }); }
        else if (job === "pin-hash-migrate") { const r = await runPinHashMigrate(env); return Response.json({ ok: true, ran: job, ...r }); }
        else if (job === "emails-migrate") { const r = await runEmailsMigrate(env); return Response.json({ ok: true, ran: job, ...r }); }
        else if (job === "onboarding-notice") { const r = await runOnboardingNotice(env, forced); return Response.json({ ok: true, ran: job, ...r }); }
        else if (job === "supply-reminder") { const r = await runSupplyReminder(env); return Response.json({ ok: true, ran: job, ...r }); }
        else if (job === "kia-monthly") { const r = await runKiaMileageReminder(env); return Response.json({ ok: true, ran: job, ...r }); }
        /* ⚠️ `&dry=1` COUNTS AND DELETES NOTHING. Matt's call, and the first
           real run is meant to be one: this is the only job in the Hub that
           destroys records, so the number is read before anything goes. */
        else if (job === "retention-purge") {
          const r = await runRetentionPurge(env, { dry: url.searchParams.get("dry") === "1" });
          return Response.json({ ok: true, ran: job, ...r });
        }
        // ⚠️ RESTORED — this branch was a plain `await` in the copy handed over,
        // which is what truncated the digest mid-sentence: cron-job.org cuts the
        // request at ~30s and the generation died with it. Answer immediately and
        // finish in the background so the cron's hang-up cannot kill the job.
        // Deliberately NOT .catch()-ed: a rejection should surface in Cloudflare
        // Observability rather than vanish, because from the cron's side a silent
        // failure now looks identical to a success.
        // ⚠️ CONSEQUENCE: the cron status is no longer a health signal for this
        // job — the canary is the "Updated HH:MM" stamp on the Focus Today card.
        else if (job === "ai-summary") {
          /* ⚠️ THE FEATURE FLAG IS CHECKED HERE, NOT ONLY ON THE DASHBOARD CARD.
             This job is what actually POSTS to Slack; the card only displays
             what it wrote. A store that switched AI summaries off and had only
             the card hidden would still get an @channel digest every morning,
             which is the loudest possible way for a switch to not work.
             ⚠️ Answers `ok` with a reason, exactly as the closed-Sunday skip
             does, so cron-job.org sees success rather than a failure to chase. */
          if (STORE_CONFIG.features.aiSummaries === false)
            return Response.json({ ok: true, ran: job, skipped: "aiSummaries is off for this store" });
          if (isClosedDay()) return Response.json({ ok: true, ran: job, skipped: "closed Sunday" });
          ctx.waitUntil(runDailyAiSummary(env)); return Response.json({ ok: true, ran: job, mode: "background" });
        }
        else if (job === "eos") {
          await runEosTouchIn(env, (k) => sbGet(env, k), (k, v) => sbSet(env, k, v), new Date(), url.searchParams.get("force") === "1", /* ⚠️ notifyTarget, NOT slackIdForName — eosTouchIn now passes a CONFIG KEY
             ("hr" / "leadership" / "owner"), not a person's name. Hand it the raw
             name resolver again and it will look up a Slack user called "hr". */
          (key) => notifyTarget(env, key));
          /* ⚠️ AFTER the touch-in, and its own try/catch: a push failure must
             never stop the Slack post, which is the record. */
          /* ★★ THE PUSH SAYS "L10 TOMORROW" AND ONLY TUESDAY IS TOMORROW
             (Aug 5 2026 sweep, high severity).
             pushL10TouchIn's own comment argues it needs no date because "the
             job fires the day before the meeting, so tomorrow is always
             correct". That was true of an assumed schedule and false of the real
             one: `eos` is a DAILY cron (30 7 * * *), and the meeting is
             WEDNESDAY. So the push told every director "L10 tomorrow" seven
             mornings a week, and was right on one of them.
             The touch-in beside it has gated itself to Monday since it shipped
             (`now.getDay() !== 1`). The push simply never got the same treatment.
             ⚠️ TUESDAY, NOT MONDAY. They are deliberately different days: the
             touch-in asks a director to PREPARE, which wants a couple of days;
             the push says the meeting is tomorrow, which is only true the day
             before. Two jobs, one cron, two cadences.
             ⚠️ STILL NO DATE IN THE TEXT, and the reason above still holds —
             importing nextL10 into this worker blocked a deploy with 41 errors,
             and copying the cadence here is the exact duplication l10Schedule.js
             exists to prevent. Gating the DAY is what makes "tomorrow" true.
             ⚠️ `force=1` runs it any day, same as every other gated job here. */
          let push = null;
          if (!forced && nowET().getDay() !== 2) {
            push = { skipped: "the L10 is Wednesday, this push only goes out on Tuesday" };
          } else {
            try { push = await pushL10TouchIn(env); } catch (e) { push = { error: String(e) }; }
          }
          return Response.json({ ok: true, ran: job, push });
        }
        else if (job === "slack-avatars") { const r = await runSlackAvatars(env); return Response.json({ ok: true, ran: job, ...r }); }
        else if (job === "boilout-fry") { const r = await runBoilOutFry(env); return Response.json({ ok: true, ran: job, ...r }); }
        else if (job === "boilout-henny") { const r = await runBoilOutHenny(env); return Response.json({ ok: true, ran: job, ...r }); }
        else if (job === "monthly-reports") { const r = await runMonthlyReports(env, null); return Response.json({ ok: true, ran: job, ...r }); }
        else if (job === "weekly-usage") { const r = await runWeeklyUsage(env, new Date()); return Response.json({ ok: true, ran: job, ...r }); }
        else if (job === "team-scoreboard") { const r = await runTeamScoreboard(env, forced); return Response.json({ ok: true, ran: job, ...r }); }
        else if (job === "adoption-check") { const r = await runAdoptionCheck(env); return Response.json({ ok: true, ran: job, ...r }); }
        /* THE INPUT REGISTER, DELIVERED TO PHONES. Owner resolution and the
           only-once guard all live in inputPush.js; this is just the door.
           `sbGet` is passed for BOTH kv doors because window.storage is a shim
           over kvGet, so the shared cleaning keys sit in the same store. */
        else if (job === "labor-daypart") {
          /* ?dp= names the daypart about to start, in board-period keys.
             cron-job.org (see CRON-JOBS.md): breakfast 5:40a · lunch 10:10a ·
             mid 1:40p · night 4:40p ET, Mon–Sat. Test with &quiet=1 FIRST —
             without it, real leaders get real DMs. */
          const dp = String(url.searchParams.get("dp") || "").toLowerCase();
          if (!["breakfast", "lunch", "mid", "night"].includes(dp)) {
            return Response.json({ ok: false, error: "bad dp — use breakfast|lunch|mid|night" }, { status: 400 });
          }
          const r = await runLaborDaypart(env, dp);
          return Response.json({ ok: true, ran: job, dp, ...r });
        }
        else if (job === "shift-where") {
          /* ?dp= names the daypart about to start, same four keys as
             labor-daypart. cron-job.org (see CRON-JOBS.md): breakfast 5:00a ·
             lunch 9:30a · mid 1:00p · night 4:00p ET, Mon–Sat — each one ahead
             of the labor DM for that daypart, because this one has to reach a
             team member before they leave the house, not a leader before the
             rush.
             ⚠️ TEST WITH &quiet=1 FIRST. Without it this pushes real phone
             alerts to everybody on today's board, which is the largest audience
             any job here reaches. */
          const dp = String(url.searchParams.get("dp") || "").toLowerCase();
          if (!["breakfast", "lunch", "mid", "night"].includes(dp)) {
            return Response.json({ ok: false, error: "bad dp — use breakfast|lunch|mid|night" }, { status: 400 });
          }
          const r = await runShiftWhere(env, dp);
          return Response.json({ ok: true, ran: job, dp, ...r });
        }
        else if (job === "input-push") {
          const r = await runInputPush(env, {
            // sbGetStrict, not sbGet — the only-once guard's sentinel detects
            // a THROW, and sbGet returns null for a refused read. With the
            // strict reader, a refused subs read skips this run (the next
            // cron retries) and a refused sent-guard read skips the guard
            // write instead of repeating every push and replacing the day's
            // stamps with one run's.
            kvGet: (k) => sbGetStrict(env, k),
            kvSet: (k, v) => sbSet(env, k, v),
            pushToUid,
            now: new Date(),
          });
          return Response.json({ ok: true, ran: job, ...r });
        }
        else return Response.json({ ok: false, error: "unknown job" }, { status: 400 });
        return Response.json({ ok: true, ran: job });
      };

      let jobRes;
      try {
        jobRes = await runChain();
      } catch (e) {
        /* ⚠️ THE SHAPE DID NOT CHANGE. Same 500, same body, so cron-job.org
           still sees exactly what it saw before. What is new is that the
           failure is now WRITTEN DOWN before it is returned. */
        jobRes = Response.json({ ok: false, error: String(e) }, { status: 500 });
      }
      /* ⚠️ AWAITED, NOT FIRE-AND-FORGET. A Worker stops executing once the
         response is returned, so an un-awaited write is a write that usually
         does not happen. It costs one round trip and it is the only reason any
         of this is here. */
      await noteJobRun(env, job, dedupJobKey, jobStartedAt, jobRes);
      return jobRes;
    }

    /* ═══ WHAT RAN, AND WHAT IT DID ════════════════════════════════════════
       The read side of noteJobRun. One request for every job rather than one
       per job, the same `key=in.(…)` shape the sweep's deny check uses.
       ⚠️ ADMIN KEY, SAME DOOR AS run-job ITSELF. This says which automations
       exist and when each last worked, which is a map of the store's machinery
       and not something to answer to an anonymous caller. */
    if (url.pathname === "/api/job-runs" && request.method === "GET") {
      if (!adminKeyOk(env, url.searchParams.get("key"))) {
        return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
      }
      try {
        const u = `${env.SUPABASE_URL}/rest/v1/kv_store?key=like.${encodeURIComponent(JOB_RUN_PREFIX + "*")}&select=key,value`;
        const r = await fetch(u, { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } });
        if (!r.ok) return Response.json({ ok: false, error: `kv read refused: ${r.status}` }, { status: 500 });
        const rows = await r.json();
        const runs = (Array.isArray(rows) ? rows : [])
          .map((x) => ({ key: String(x.key || "").slice(JOB_RUN_PREFIX.length), ...(x.value || {}) }))
          .sort((p, q) => String(q.at || "").localeCompare(String(p.at || "")));
        /* ⚠️ THE JOBS THAT HAVE NEVER RUN ARE THE ANSWER TO MATT'S QUESTION, so
           they are named rather than merely absent. A job missing from this
           list is either unscheduled or has never once succeeded, and both are
           worth seeing. */
        const seen = new Set(runs.map((x) => String(x.job || x.key).split(":")[0]));
        const neverRan = KNOWN_JOBS.filter((j) => !seen.has(j));
        return Response.json({ ok: true, count: runs.length, neverRan, runs },
          { headers: { "cache-control": "no-store" } });
      } catch (e) {
        return Response.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500 });
      }
    }

    /* ── WEB PUSH ────────────────────────────────────────────────────────
       These four are what App.jsx's PushToggle has always called. Every one
       of them used to fall through to env.ASSETS and return index.html. */

    /* ═══ PIN VERIFY ═══════════════════════════════════════════════════
       The Hub's PIN map (`gcfcr-hr-pins`, 106 entries, four digits each) used
       to be DOWNLOADED BY THE BROWSER on every sign-in and compared locally.
       `kv_store` has RLS enabled but a `USING (true)` policy for role `public`,
       and the anon key is compiled into the client bundle by design — so the
       entire auth model was readable by anyone who viewed source.

       This endpoint moves the COMPARISON server-side, where SUPABASE_SERVICE_KEY
       lives. It answers with a roster ID or a refusal and NEVER returns the map.

       ★ WHY IT RETURNS ONLY AN ID, not a person: the roster is `HR_TEAM` (a
       static array inside HRConsole.jsx) plus `gcfcr-hr-added-v1`, and the
       worker cannot import a .jsx component. Publishing a roster copy to KV
       would create a bootstrap hole — the first sign-in after deploy would find
       no map and NOBODY could sign in. Returning the id keeps every identity,
       role and tier decision exactly where it already is in App.jsx, so this
       change cannot alter who can open what.

       ★ THE DEFAULT-PIN FALLBACK IS DELIBERATELY NOT PORTED. App.jsx rejects
       `pin === HR_DEFAULT_PIN` before it ever calls this, so `pm[id] || DEFAULT`
       could only ever match someone with no personal PIN — who is refused
       anyway. Reproducing it here would need the full roster for no behaviour. */

    if (url.pathname === "/api/pin-verify" && request.method === "POST") {
      try {
        const b = await request.json();
        const pin = String((b && b.pin) || "").trim();
        const rememberAsked = !!(b && b.remember);   // "keep me signed in on this device" — the client only sends true when the box is ticked
        /* ⚠️ ONE id, NEVER A LIST. Accepting an array here would hand the
           attacker the 106x multiplier back through the front door, which is
           the exact thing this whole change exists to take away. */
        const namedId = b && b.id != null ? String(b.id) : "";
        if (!pin) return Response.json({ ok: false, error: "no-pin" }, { status: 400 });

        /* ⚠️ RATE LIMITING IS LOAD-BEARING HERE, unlike anywhere else in this
           worker. A four-digit PIN is 10,000 possibilities; an unauthenticated
           verify endpoint is a brute-force oracle that the old client-side
           compare never was.

           🐛 AND IT COUNTED NOTHING. This read a KV value and then wrote back
           n+1. Cloudflare KV has no atomic increment and its reads come from
           the colo cache, so concurrent guesses all read the same number and
           all wrote the same number back: 2,000 parallel POSTs ended with the
           counter at about 1. "Eight guesses" was never eight. The count now
           comes from one Postgres statement under a row lock.

           ★ INCREMENT, THEN JUDGE WHAT COMES BACK. The number already counts
           THIS request, which is why the test is `>` and not `>=` — same
           effective ceiling of 8 that App.jsx, HRConsole and DailySetup all
           already print messages for. Getting it backwards silently costs a
           real leader one guess.

           Deliberately still fails OPEN. null means the counter could not be
           reached, and unknown never blocks: locking the whole store out of the
           Hub because a counter was unreachable would BE the outage the
           attacker wanted. */
        const ip = request.headers.get("cf-connecting-ip") || "unknown";
        const dev = await readDevCookie(env, request);

        const perIp = await bumpCounter(env, `pin:ip:${ip}`, PIN_LOCK_TTL);
        if (perIp !== null && perIp > PIN_MAX_FAILS) {
          return Response.json(
            { ok: false, error: "locked", retryAfterMin: Math.ceil(PIN_LOCK_TTL / 60) },
            { status: 429 }
          );
        }

        /* ★★ THE 106x KILL. Which accounts may this one guess be tested
           against, in priority order:
             1. the caller named one       -> exactly that one, plus its own lane
             2. this device has history    -> up to 24 ids, straight off the cookie
             3. cold                       -> the full roster, budgeted, and only
                                              while COLD_SEARCH is still true */
        let candidates = null;
        let viaCookie = false;
        if (namedId) {
          candidates = [namedId];
          const acct = await bumpCounter(env, `pin:acct:${namedId}`, PIN_LOCK_TTL);
          if (acct !== null && acct > PIN_ACCT_MAX) {
            return Response.json(
              { ok: false, error: "locked", retryAfterMin: Math.ceil(PIN_LOCK_TTL / 60) },
              { status: 429 }
            );
          }
        } else if (dev && dev.i.length) {
          candidates = dev.i;
          viaCookie = true;
        } else {
          if (!COLD_SEARCH) {
            /* No comparison and no further counting. The client shows its name
               step, which every client already knows how to render. */
            return Response.json({ ok: false, error: "who" });
          }
          const anon = await bumpCounter(env, "pin:anon", PIN_ANON_WINDOW);
          /* ⚠️ NOT KEYED ON THE ADDRESS, and that is the entire point: rotating
             IPv6 or a residential proxy pool buys nothing against a store-wide
             count. And ONLY cold requests are ever refused, so an attack in
             full swing still cannot stop a leader signing in on any phone or
             iPad the Hub has already seen. */
          if (PIN_ANON_ENFORCE && anon !== null && anon > PIN_ANON_MAX) {
            return Response.json(
              { ok: false, error: "guarded", retryAfterMin: 15 }, { status: 429 });
          }
        }

        const [pinsMap, statusMap] = await Promise.all([
          sbGet(env, "gcfcr-hr-pins"),
          sbGet(env, "gcfcr-hr-status"),
        ]);
        const pm = pinsMap && typeof pinsMap === "object" ? pinsMap : {};
        const sm = statusMap && typeof statusMap === "object" ? statusMap : {};

        // Same two rules the client always applied, in the same order — only
        // the SET they run over is narrower now.
        const searchMap = candidates ? pinSubset(pm, candidates) : pm;
        let ids = (await pinOwners(searchMap, pin)).filter((id) => sm[id] !== "terminated");

        /* ⚠️⚠️ A KNOWN DEVICE IS NOT A ONE-PERSON DEVICE, AND WITHOUT THIS BLOCK
           THAT ASSUMPTION LOCKS OUT EVERY SHARED STORE iPAD.
           🐛 The narrowing above searches ONLY the ids already on this device's
           cookie. Leader A signs in on the kitchen iPad; the cookie now reads
           [A]. Leader B picks up the SAME iPad, types a perfectly correct PIN,
           and is told "PIN not recognized" — because B is not in [A] and
           nothing sent B back to a full search. Every shared iPad in the store
           would freeze onto its first user, during a rush, on promote day.
           ⇒ A cookie is a HINT, never a whitelist. When the narrow search finds
           nobody, this request is exactly as unknown as a cold one, so it is
           treated as one: same anon lane, same counting, same budget. That
           costs nothing today (COLD_SEARCH is true, so every device already
           gets the full search) and at Stage 9 it becomes the name step, which
           is the correct answer for a new person on a known iPad.
           ⚠️ ONLY the cookie path falls through. A caller who NAMED an account
           stays pinned to that one account — letting a named miss reopen the
           full roster would hand back the whole 106x multiplier by simply
           sending a wrong id. */
        if (!ids.length && viaCookie) {
          if (!COLD_SEARCH) return Response.json({ ok: false, error: "who" });
          const anon = await bumpCounter(env, "pin:anon", PIN_ANON_WINDOW);
          if (PIN_ANON_ENFORCE && anon !== null && anon > PIN_ANON_MAX) {
            return Response.json(
              { ok: false, error: "guarded", retryAfterMin: 15 }, { status: 429 });
          }
          ids = (await pinOwners(pm, pin)).filter((id) => sm[id] !== "terminated");
        }

        if (ids.length === 1) {
          /* ★ UPGRADE ON MATCH — the entire migration, in one place. A legacy
             plaintext entry that has just proved itself is rewritten as a
             salted hash. A PIN nobody uses stays readable only until its owner
             next signs in.
             ⚠️ RE-READ BEFORE WRITING. HR Console writes this same key, so
             writing back the copy fetched at the top of this request would drop
             any PIN set in between. Read-modify-write, one entry only. */
          if (pinIsLegacy(pm[ids[0]])) {
            try {
              const salt = pinNewSalt();
              const h = await pinHashHex(pin, salt);
              const fresh = (await sbGetStrict(env, "gcfcr-hr-pins")) || {};
              if (pinIsLegacy(fresh[ids[0]])) {
                fresh[ids[0]] = { h, s: salt };
                await sbSet(env, "gcfcr-hr-pins", fresh);
              }
            } catch { /* an upgrade that fails must NEVER block a sign-in */ }
          }
          // Only a SUCCESS clears the counter — otherwise one correct PIN would
          // reset the window for whoever is guessing from the same address.
          await resetCounter(env, `pin:ip:${ip}`);
          if (namedId) await resetCounter(env, `pin:acct:${namedId}`);
          /* ★ THE TOKEN CARRIES THE UID ONLY — NO TIER. The client can't know
             its tier until after this call returns (it resolves it from the
             roster and roles map afterwards), so the only tier available here
             would be one the CLIENT claimed. Signing that would be worse than
             signing nothing: it would look authoritative while meaning exactly
             as much as the localStorage value it came from. The uid is the
             server's own answer, and it is the thing per-record filtering
             actually needs. */
          /* ★ `remember` IS NO LONGER THE CALLER'S TO DECIDE. Thirty days is
             granted only when the server can SEE this is a personal device:
             exactly one person has ever signed in here, and it is this person.
             A shared iPad accumulates ids and can therefore never qualify,
             which is precisely what the checkbox text has been asking people to
             honour voluntarily since the day it was written. A device with no
             cookie always gets 12 hours — so a brute-forced session is 12
             hours, never a month. */
          const serverRemember = rememberAsked && !!dev && dev.i.length === 1 && dev.i[0] === ids[0];
          /* Told to the client so it can make them replace a PIN somebody else
             chose. ⚠️ READ OFF THE STORED RECORD, GUARDED — an old entry is
             `{h,s}` with no flag, and a legacy plaintext entry is a bare
             string. Neither may throw here, and neither means "must change". */
          const rec = pm[ids[0]];
          const mustChange = !!(rec && typeof rec === "object" && rec.mustChange);
          return Response.json(
            { ok: true, id: ids[0], mustChange, token: await mintToken(env, ids[0], serverRemember) },
            { headers: { "Set-Cookie": await devCookieHeader(env, dev, ids[0]) } }
          );
        }

        /* ── THE ATTACK BECOMES VISIBLE ─────────────────────────────────────
           A walk of the PIN space has one signature no honest store produces: a
           large number of DISTINCT wrong PIN VALUES in a short window. Real
           typos give a handful an hour; a walk gives hundreds. This survives IP
           rotation, which the per-IP counter cannot. Fire-and-forget, so it can
           never add latency to anybody's sign-in.
           ⚠️ The digest is a CENSUS BUCKET ONLY. It is never compared to a
           stored PIN, never written to gcfcr-hr-pins, and the raw PIN is not
           stored anywhere in any form. */
        ctx.waitUntil((async () => {
          try {
            const tag = (await pinHashHex(pin, "census")).slice(0, 16);
            const seen = await bumpCounter(env, `pinval:${tag}`, 3600);
            if (seen !== 1) return;                    // this value already counted this hour
            const distinct = await bumpCounter(env, "pin:distinct", 3600);
            if (distinct === null || distinct !== PIN_WALK_ALARM + 1) return;
            const stamp = new Date().toISOString().slice(0, 13);
            if (await env.GATE_CITY_KV.get(`authalarm:${stamp}`)) return;
            await env.GATE_CITY_KV.put(`authalarm:${stamp}`, "1", { expirationTtl: 7200 });
            /* ⚠️ ADDRESSED THROUGH NOTIFY_DEFAULTS.owner DIRECTLY, NOT
               notifyTarget("owner"). gcfcr-notify-targets-v1 still takes an
               anonymous write, so an attacker walking the PIN space could
               silence notifyTarget in the same session. An alarm the attack can
               switch off is not an alarm. */
            const to = await slackIdForName(env, NOTIFY_DEFAULTS.owner);
            if (to) await sendSlackDM(env, to,
              `Someone is guessing PINs. ${distinct}+ different wrong PINs in the last hour. ` +
              `Signed-in devices are unaffected. Check ${HUB_HOST}/api/gate-health?key=…`);
          } catch { /* an alarm that fails must never fail a sign-in */ }
        })());

        // ★ "ambiguous" is kept as its own answer rather than folded into a
        // generic refusal: it is the one case the person can actually fix, and
        // App.jsx has always told them to set a unique PIN. It leaks nothing an
        // attacker can use — knowing a guess matched two people is no more than
        // knowing it matched one, and both are already implied by success.
        return Response.json({ ok: false, error: ids.length > 1 ? "ambiguous" : "no-match" });
      } catch (e) {
        return Response.json({ ok: false, error: "server" }, { status: 500 });
      }
    }

    /* ═══ ADMIN PUSH SEND ══════════════════════════════════════════════
       Prove a notification actually reaches a person, on demand.

       Until this existed the ONLY push anyone could receive was the test the
       bell fires on enable, so every "did it reach them?" ended in "toggle it
       again" — which is exactly how Nick's report had to be resolved by hand.

       GET on purpose: it has to be usable from a phone, pasted into Safari.
       Guarded by RUN_JOB_KEY, the same key as every other admin action, checked
       before anything else happens. */

    /* ★ PROOF BY OUTPUT that the pieces this plan rests on are actually live.
       Reports presence, length and whether a secret is whitespace-clean. NEVER
       a value. GET on purpose, same as /api/push-send below: it has to be
       pasteable into Safari on a phone.
       ⚠️ READ THE JSON, NOT THE STATUS CODE. The SPA catch-all answers 200 with
       the app's HTML for any unknown path, so HTML at 200 means this route does
       not exist yet — it does not mean the check passed. */
    if (url.pathname === "/api/gate-health" && request.method === "GET") {
      if (!adminKeyOk(env, url.searchParams.get("key"))) {
        return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
      }
      const sk = freshKey(env, "session"), dk = freshKey(env, "doc");
      const probe = url.searchParams.get("probe");
      /* 4s, not the sign-in ceiling — this call is allowed to be slow so we can
         tell a slow counter from a broken one. */
      const cdet = { timeoutMs: 4000 };
      const probeN = probe ? await bumpCounter(env, `probe:${String(probe).slice(0, 32)}`, 300, cdet) : null;
      return Response.json({
        ok: true,
        counterRpc: probe ? (probeN === null ? "UNREACHABLE" : "ok") : "not probed",
        counterError: probe && probeN === null
          ? { status: cdet.status || null, err: cdet.err || null, body: cdet.body || null }
          : null,
        probe: probeN,
        session: { set: !!sk, len: sk ? sk.length : 0, trimmed: sk ? sk === String(env.SESSION_KEY || "") : null },
        doc:     { set: !!dk, len: dk ? dk.length : 0, trimmed: dk ? dk === String(env.DOC_KEY || "") : null },
        sameValue: !!(sk && dk && sk === dk),   // ⚠️ must be false. Two secrets, not one pasted twice.
        mintingWithNewKey: MINT_WITH_NEW_KEY,
        legacyAccepted: LEGACY_SIGNING_ACCEPTED,
        coldSearch: COLD_SEARCH,
        anonEnforcing: PIN_ANON_ENFORCE,
        epoch: await sessionEpoch(env),
        legacyTokens24h: await peekCounter(env, "legacy:session"),
        anonAttempts1h: await peekCounter(env, "pin:anon"),
        distinctWrongPins1h: await peekCounter(env, "pin:distinct"),
      }, { headers: { "cache-control": "no-store" } });
    }

    /* ★ SIGN EVERYBODY OUT, RIGHT NOW, WITHOUT ROTATING ANYTHING.
       Until this existed the only answer to "someone may have gotten in" was
       rotating RUN_JOB_KEY, which signs out all ~106 people AND breaks every
       scheduled job, so it was never going to be used in a hurry. This bumps
       one number: every session ends within about a minute, every cron line
       keeps working, and no secret changes. */
    if (url.pathname === "/api/session-epoch" && request.method === "GET") {
      if (!adminKeyOk(env, url.searchParams.get("key"))) {
        return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
      }
      const cur = Number(((await sbGet(env, SESSION_EPOCH_KEY)) || {}).epoch) || 1;
      if (url.searchParams.get("bump") !== "1") return Response.json({ ok: true, epoch: cur });
      await sbSet(env, SESSION_EPOCH_KEY, { epoch: cur + 1, at: new Date().toISOString() });
      EPOCH_CACHE = { v: cur + 1, at: Date.now() };
      return Response.json({ ok: true, epoch: cur + 1, effect: "every session ends within about 60 seconds" });
    }

    if (url.pathname === "/api/push-send" && request.method === "GET") {
      if (!adminKeyOk(env, url.searchParams.get("key"))) {
        return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
      }
      const to = (url.searchParams.get("to") || "").trim();
      if (!to) return Response.json({ ok: false, error: "to is required" }, { status: 400 });
      const text = url.searchParams.get("text") || `This is a test notification from the ${STORE.appName}.`;
      try {
        /* ★ "Test —" is prepended deliberately. A notification fired by hand
           must never be mistaken by whoever receives it for a real operational
           alert; without the marker there is nothing on their lock screen that
           distinguishes the two. */
        const r = await pushToPerson(env, to, {
          title: `Test — ${STORE.appName}`,
          body: text,
          url: "/",
        });
        /* ★ REPORTS, never just {ok:true}. `sent` = the push service accepted
           it; `reached` = how many devices we found. sent 0 / reached 1 means a
           stale subscription; reached 0 means the NAME did not resolve — and
           `pushToPerson` uses the same strict matcher as everywhere else, so an
           ambiguous first name reaches nobody rather than the wrong person.
           That distinction is the whole value of the route. */
        return Response.json({ ok: true, to, ...r });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 500 });
      }
    }

    /* ═══ PIN SET ══════════════════════════════════════════════════════
       Setting a PIN now happens server-side, because the browser no longer
       holds the map and therefore cannot do either half of the job:
         · UNIQUENESS — two people sharing a PIN makes sign-in ambiguous for
           BOTH of them, so this has to be checked against every entry, hashed
           or not. `pinOwners` is the same matcher verify uses.
         · HASHING — with a per-person salt, so the plaintext never lands in KV.

       ⚠️ NOT behind RUN_JOB_KEY, and that is a real (bounded) gap: any caller
       could set anyone's PIN. It is not a NEW exposure — `kv_store` carries a
       `USING (true)` policy and the anon key ships in the bundle, so the same
       write is already possible directly against Supabase. It closes when that
       policy does. Worth fixing together, not before.

       ⚠️ Uniqueness is deliberately NOT checked by calling /api/pin-verify — a
       non-match there counts as a failed attempt, and someone simply choosing a
       PIN would rate-limit themselves out of the building. */
    if (url.pathname === "/api/pin-set" && request.method === "POST") {
      try {
        /* ⚠️ WAS UNAUTHENTICATED — any caller could set or clear anyone's PIN.
           It was defensible only while the anon key could do the same write
           straight to Supabase; the narrowed kv policy closed that, so this
           became the last open door to the auth model. */
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        const b = await request.json();
        const id = String((b && b.id) ?? "").trim();
        const pin = String((b && b.pin) ?? "").trim();
        if (!id) return Response.json({ ok: false, error: "no-id" }, { status: 400 });
        /* ★★ WHO IS ASKING, NOT JUST WHETHER THEY ARE SIGNED IN.
           🐛 This checked only that the token was VALID. Any team member with
           any PIN could POST {id:"<owner id>", pin:"9999"} and then sign in as
           the Owner — every evaluation, injury report, personal record and all
           86 CFA Home passwords, from a tier-1 account. A full account takeover
           reachable from the phone of anyone who has ever signed in.
           You may set your own PIN, or someone else's only if you are a full HR
           reader. That is rank >= 5, which is exactly the gate HRConsole already
           puts on PinSetter (`leader = full(acting)`, FULL_MIN = 5), so no real
           user loses anything. */
        if (String(tok.u) !== id && !(await hrFullReader(env, tok.u))) {
          return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
        }
        if (!/^\d{4,6}$/.test(pin)) return Response.json({ ok: false, error: "bad-pin" }, { status: 400 });

        const live = (await sbGetStrict(env, "gcfcr-hr-pins")) || {};
        const owners = (await pinOwners(live, pin)).filter((o) => String(o) !== id);
        if (owners.length) return Response.json({ ok: false, error: "taken" });

        /* ⚠️ A PIN SOMEONE ELSE CHOSE IS MARKED, AND THE OWNER MUST REPLACE
           IT (Matt, Aug 10 2026: "yes force the change"). Otherwise whoever
           set it knows it for good, and a PIN is what puts a person's name on
           their work — a PIN a second person knows is a signature a second
           person can forge. Setting your OWN carries no mark, because there is
           nobody else to hide it from.
           ⚠️ THE FLAG IS ADDITIVE AND ITS ABSENCE MEANS "fine" (rule 1). Every
           PIN already stored predates this and has no flag; none of them may
           suddenly start demanding a change. Only records written from here on,
           by somebody else, carry it. */
        const salt = pinNewSalt();
        const byOther = String(tok.u) !== id;
        live[id] = { h: await pinHashHex(pin, salt), s: salt, ...(byOther ? { mustChange: true } : {}) };
        await sbSet(env, "gcfcr-hr-pins", live);
        return Response.json({ ok: true });
      } catch (e) {
        return Response.json({ ok: false, error: "server" }, { status: 500 });
      }
    }

    /* ═══ EMAIL A PAID-OUT RECEIPT ════════════════════════════════════
       Cindy, forwarded by Matt Aug 10 2026: "allow printing and emailing
       paid out receipts that have been uploaded into the cash portal."
       Printing shipped that morning; this is the other half.

       ★ WHY A FREE-TYPED ADDRESS IS DEFENSIBLE HERE, and this is the whole
       argument the design rests on: anybody who can open a receipt in Cash
       Audit can ALREADY save it and email it from their own phone. So
       sending from the Hub hands out no access they did not already have —
       it saves them the round trip. That holds ONLY while the sender is
       someone who could already view the file, which is why the rank gate
       below is not optional. If that gate is ever loosened, this stops
       being a convenience and becomes a way to pull private financial
       documents out of the store, so loosen the gate and you must re-argue
       this route from scratch.

       ⚠️ RANK 3 = the Team Leader floor, which is exactly Cash Audit's own
       tier 2. Matched on purpose so the set of people who can email a
       receipt is the same set who can already look at one.
       ⚠️ THE BUCKET IS PINNED TO Receipts, not "any bucket in
       STORAGE_BUCKETS". Accepting the shared list would let this route mail
       out `hr-files`, which is every uploaded ID, doctor's note and signed
       form in the store. One receipt route mails receipts.
       ⚠️ `..` REJECTED BEFORE ANYTHING ELSE, the same trap /api/doc-url
       carried: encodeURIComponent leaves dots untouched, so a path can walk
       out of its own folder.
       ⚠️ THE SEND IS CHECKED. Resend answers 401 on a rotated key, 403 on an
       unverified domain and 422 on a bad address, and a bare fetch RESOLVES
       for all three. Reporting "sent" on a 422 is how somebody believes a
       receipt reached their accountant when it never left the building. */
    if (url.pathname === "/api/receipt-email" && request.method === "POST") {
      try {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

        const roles = await sbGet(env, "gcfcr-hr-roles").catch(() => null);
        const added = await sbGet(env, HR_ADDED_KEY).catch(() => null);
        const title = hrTitleFor(String(tok.u), roles || {}, Array.isArray(added) ? added : []);
        if (hrRankOfTitle(title) < 3) {
          return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
        }

        const b = await request.json();
        const bucket = String((b && b.bucket) ?? "");
        const path = String((b && b.path) ?? "");
        const to = String((b && b.to) ?? "").trim();
        const label = String((b && b.label) ?? "").slice(0, 120);
        const note = String((b && b.note) ?? "").slice(0, 500);

        if (bucket !== "Receipts" || !path || path.includes("..")) {
          return Response.json({ ok: false, error: "not-allowed" }, { status: 403 });
        }
        /* Deliberately plain. A stricter pattern rejects real addresses, and
           the actual validation is Resend refusing to deliver — which is
           checked below rather than assumed. */
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
          return Response.json({ ok: false, error: "bad-address" }, { status: 400 });
        }

        const obj = await fetch(
          `${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`,
          { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } },
        );
        if (!obj.ok) return Response.json({ ok: false, error: "not-found" }, { status: 404 });

        const buf = await obj.arrayBuffer();
        /* ⚠️ A CAP, BECAUSE A WORKER HAS A MEMORY CEILING AND base64 IS +33%.
           A phone photo of a receipt is well under this; anything over it is
           not a receipt and would take the whole Worker down rather than fail
           one send. */
        if (buf.byteLength > 8 * 1024 * 1024) {
          return Response.json({ ok: false, error: "too-big" }, { status: 413 });
        }
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) {
          bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        const b64 = btoa(bin);
        const filename = path.split("/").pop() || "receipt";

        const who = hrPrimaryName(String(tok.u)) || "a leader";
        const receiptReplyTo = await replyToFor(env);
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          /* ⚠️ THIS ROUTE BUILDS ITS OWN RESEND BODY rather than going through
             sendEmail, so the reply-to has to be added here too. Same helper,
             so the two can never disagree about where a reply goes. */
          body: JSON.stringify({
            from: FROM,
            to: [to],
            ...(receiptReplyTo ? { replyTo: receiptReplyTo } : {}),
            subject: `Paid-out receipt${label ? ` — ${label}` : ""}`,
            text:
              `${note ? `${note}\n\n` : ""}` +
              `Receipt attached${label ? ` (${label})` : ""}.\n` +
              `Sent from the Hub by ${who}.\n\n— ${STORE.legalName}`,
            attachments: [{ filename, content: b64 }],
          }),
        });
        if (!res.ok) {
          const msg = await res.text().catch(() => "");
          return Response.json({ ok: false, error: "send-failed", detail: msg.slice(0, 200) }, { status: 502 });
        }

        /* ⚠️ LOGGED, AND THE LOG IS NOT ALLOWED TO FAIL THE SEND. The email
           has already gone; throwing here would tell the caller it failed and
           they would send it twice. Money documents leaving the building
           should leave a trail, so this is best-effort and never blocking. */
        try {
          const log = (await sbGet(env, "gcfcr-receipt-sends-v1")) || [];
          const rows = Array.isArray(log) ? log : [];
          rows.push({ at: new Date().toISOString(), by: String(tok.u), name: who, to, path, label });
          await sbSet(env, "gcfcr-receipt-sends-v1", rows.slice(-500));
        } catch (e) { /* the send already happened */ }

        return Response.json({ ok: true });
      } catch (e) {
        return Response.json({ ok: false, error: "server" }, { status: 500 });
      }
    }

    /* ═══ STAND UP A BRAND NEW STORE ══════════════════════════════════
       The very first person into a clone. Nobody has a PIN yet, so nobody
       can sign in, so nobody can create the roster — this breaks that loop
       exactly once, and then closes behind itself forever.

       ⚠️ DEAD AT GATE CITY, AND BY TWO INDEPENDENT MEASURES. There is no
       SETUP_KEY secret here, and there are ~106 PINs on file. Either one
       alone refuses. That is on purpose: a route that can create a full
       HR account should need more than one thing to go wrong.

       ⚠️ NO SECRET MEANS DISABLED, NEVER OPEN. `!env.SETUP_KEY` returns 404
       before anything else runs. The failure mode of a missing environment
       variable must be "this does not exist", never "no key required" —
       that inversion is how a setup route becomes a public account factory.

       ⚠️ "UNCLAIMED" IS MEASURED AS *ZERO PINS*, not a flag and not an
       empty roster. If any PIN exists then somebody can already sign in,
       so the store is standing and this must refuse. A flag can be missed
       by a partial write; a roster can legitimately be pre-imported before
       anybody has signed in. The PIN map is the honest test.

       ⚠️ EXECUTIVE TIES WITH OPERATOR, DELIBERATELY. Matt, Aug 10 2026:
       "make the executive level the same priority to login as operator.
       some if not most operators will not want that responsibility." So
       this accepts rank >= 7 — Executive Director, Executive, Human
       Resources, Accounts Payable and Owner — with NO ordering between
       them. Whoever gets there first stands the store up. Do not add a
       precedence rule here later; an executive doing this is the normal
       case, not the fallback.

       ⚠️ THE PIN IS THEIRS, SO IT IS NOT MARKED mustChange. They chose it
       themselves and nobody else has ever seen it. */
    if (url.pathname === "/api/store-claim" && request.method === "POST") {
      try {
        if (!env.SETUP_KEY) {
          return Response.json({ ok: false, error: "disabled" }, { status: 404 });
        }
        const ip = request.headers.get("cf-connecting-ip") || "unknown";
        const tries = await bumpCounter(env, `setup:ip:${ip}`, PIN_LOCK_TTL);
        if (tries !== null && tries > PIN_MAX_FAILS) {
          return Response.json(
            { ok: false, error: "locked", retryAfterMin: Math.ceil(PIN_LOCK_TTL / 60) },
            { status: 429 },
          );
        }

        const b = await request.json();
        const key = String((b && b.key) ?? "");
        const name = String((b && b.name) ?? "").trim();
        const role = String((b && b.role) ?? "").trim();
        const pin = String((b && b.pin) ?? "").trim();

        /* Length-checked before comparing so a wrong-length guess cannot be
           distinguished by timing alone. */
        const want = String(env.SETUP_KEY);
        if (key.length !== want.length || key !== want) {
          return Response.json({ ok: false, error: "bad-key" }, { status: 403 });
        }
        if (!name || name.split(/\s+/).length < 2) {
          return Response.json({ ok: false, error: "bad-name" }, { status: 400 });
        }
        if (!/^\d{4,6}$/.test(pin)) {
          return Response.json({ ok: false, error: "bad-pin" }, { status: 400 });
        }
        /* ⚠️ THE TITLE HAS TO BE ONE THE HUB ACTUALLY KNOWS. An unrecognised
           title scores 0, which would stand the store up with a founder who
           has TEAM MEMBER access and no way to fix it — locked out of the
           console they need, with the setup route already spent. */
        const rank = hrRankOfTitle(role);
        if (rank < 7) {
          return Response.json({ ok: false, error: "bad-role" }, { status: 400 });
        }

        const pins = (await sbGetStrict(env, "gcfcr-hr-pins")) || {};
        if (Object.keys(pins).length) {
          return Response.json({ ok: false, error: "already-set-up" }, { status: 409 });
        }

        const id = `n_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const added = (await sbGet(env, "gcfcr-hr-added-v1")) || [];
        const rows = Array.isArray(added) ? added : [];
        rows.push({
          id,
          name,
          role,
          addedAt: new Date().toISOString(),
          addedBy: "store setup",
        });
        await sbSet(env, "gcfcr-hr-added-v1", rows);

        const salt = pinNewSalt();
        /* Re-read: the roster write above is the only thing that has run, but
           another request could have raced the emptiness check. Writing the
           whole map back from the copy read before that check would erase a
           PIN created in between. */
        const livePins = (await sbGetStrict(env, "gcfcr-hr-pins")) || {};
        livePins[id] = { h: await pinHashHex(pin, salt), s: salt };
        await sbSet(env, "gcfcr-hr-pins", livePins);

        return Response.json({ ok: true, id, token: await mintToken(env, id) });
      } catch (e) {
        return Response.json({ ok: false, error: "server" }, { status: 500 });
      }
    }

    /* ═══ CLAIM YOUR ACCOUNT ══════════════════════════════════════════
       First sign-in for somebody who has never had a PIN. They prove who
       they are with the last 4 of their own phone, then choose their PIN.

       ★ WHY IT IS UNAUTHENTICATED, and why that is not a hole: the entire
       point is that this person has no PIN yet, so there is nothing to
       sign in with. It is the same class of door as /api/pin-verify and it
       carries the same locks. What keeps it narrow is that it does exactly
       one thing and refuses the moment any of it is untrue.

       ⚠️ SINGLE USE, ENFORCED BY THE PIN MAP AND NOT BY A FLAG. If this
       person already has a PIN, there is nothing to claim and the code is
       dead — so the code cannot be replayed to take over an account that
       is already in use. A flag could be missed on a partial write; the
       PIN's existence cannot.
       ⚠️ TERMINATED PEOPLE CANNOT CLAIM. Matt's standing rule is that
       terminating somebody must actually close the door, and a claim code
       minted the day they were hired would otherwise still open it months
       after they left.
       ⚠️ RATE LIMITED WITH THE SAME NUMBERS AS pin-verify. Four digits is
       10,000 guesses; without this the endpoint is a brute-force oracle
       for every account that has not been claimed yet. Per-IP uses the
       shared `pin:ip:` lane deliberately, so an attacker cannot get a
       fresh budget just by switching endpoints.
       ⚠️ FAILS OPEN ON A NULL COUNTER, same as everywhere else here: an
       unreachable counter must not lock the store out.
       ⚠️ THE CODE IS SPENT ON A RE-READ, not on the copy fetched at the
       top. Another session could have written hr-info in between, and a
       blind write-back of a stale whole map is what lost Evelyn's
       documentation. */
    if (url.pathname === "/api/pin-claim" && request.method === "POST") {
      try {
        const b = await request.json();
        const id = String((b && b.id) ?? "").trim();
        const code = String((b && b.code) ?? "").trim();
        const pin = String((b && b.pin) ?? "").trim();
        if (!id || !code) return Response.json({ ok: false, error: "no-id" }, { status: 400 });
        if (!/^\d{4,6}$/.test(pin)) return Response.json({ ok: false, error: "bad-pin" }, { status: 400 });

        const ip = request.headers.get("cf-connecting-ip") || "unknown";
        const perIp = await bumpCounter(env, `pin:ip:${ip}`, PIN_LOCK_TTL);
        if (perIp !== null && perIp > PIN_MAX_FAILS) {
          return Response.json(
            { ok: false, error: "locked", retryAfterMin: Math.ceil(PIN_LOCK_TTL / 60) },
            { status: 429 },
          );
        }
        /* ⚠️ CLAIM_*, NOT PIN_* — see the constants. Tighter than sign-in on
           purpose, and on its own counter so it cannot lock anybody out of the
           Hub itself. The retry minutes must come from the SAME constant as the
           TTL: reading one from PIN_LOCK_TTL and counting against the other
           would tell somebody to come back in 15 minutes for a door that stays
           shut for 60. */
        const acct = await bumpCounter(env, `claim:acct:${id}`, CLAIM_LOCK_TTL);
        if (acct !== null && acct > CLAIM_ACCT_MAX) {
          return Response.json(
            { ok: false, error: "locked", retryAfterMin: Math.ceil(CLAIM_LOCK_TTL / 60) },
            { status: 429 },
          );
        }

        const status = (await sbGet(env, "gcfcr-hr-status")) || {};
        if (status[id] === "terminated") {
          return Response.json({ ok: false, error: "no-match" });
        }

        const pins = (await sbGetStrict(env, "gcfcr-hr-pins")) || {};
        if (pins[id]) return Response.json({ ok: false, error: "already" });

        const info = (await sbGetStrict(env, "gcfcr-hr-info")) || {};
        const rec = info[id] && info[id].claim;
        if (!(await claimMatches(code, rec))) {
          return Response.json({ ok: false, error: "no-match" });
        }

        /* Same uniqueness rule pin-set enforces: two people must never share
           a PIN, or the Hub cannot tell their work apart. */
        const owners = (await pinOwners(pins, pin)).filter((o) => String(o) !== id);
        if (owners.length) return Response.json({ ok: false, error: "taken" });

        const salt = pinNewSalt();
        pins[id] = { h: await pinHashHex(pin, salt), s: salt };
        await sbSet(env, "gcfcr-hr-pins", pins);

        /* Spend the code. Re-read first — see the warning above. */
        const fresh = (await sbGetStrict(env, "gcfcr-hr-info")) || {};
        if (fresh[id] && fresh[id].claim) {
          const row = { ...fresh[id] };
          delete row.claim;
          fresh[id] = row;
          await sbSet(env, "gcfcr-hr-info", fresh);
        }

        /* They proved who they are and chose their own PIN, so sign them in
           rather than making them immediately type it again. */
        return Response.json({ ok: true, token: await mintToken(env, id) });
      } catch (e) {
        return Response.json({ ok: false, error: "server" }, { status: 500 });
      }
    }

    /* Remove a PIN. Same door as pin-set so the client never needs the map to
       delete an entry either. */
    if (url.pathname === "/api/pin-clear" && request.method === "POST") {
      try {
        /* ⚠️ WAS UNAUTHENTICATED — any caller could set or clear anyone's PIN.
           It was defensible only while the anon key could do the same write
           straight to Supabase; the narrowed kv policy closed that, so this
           became the last open door to the auth model. */
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        const b = await request.json();
        const id = String((b && b.id) ?? "").trim();
        if (!id) return Response.json({ ok: false, error: "no-id" }, { status: 400 });
        /* Same door as pin-set, so it needs the same lock. Clearing a PIN is
           step one of taking an account: clear it, then set your own. */
        if (String(tok.u) !== id && !(await hrFullReader(env, tok.u))) {
          return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
        }
        const live = (await sbGetStrict(env, "gcfcr-hr-pins")) || {};
        delete live[id];
        await sbSet(env, "gcfcr-hr-pins", live);
        return Response.json({ ok: true });
      } catch (e) {
        return Response.json({ ok: false, error: "server" }, { status: 500 });
      }
    }

    /* ═══ HR STORE PROXY ═══════════════════════════════════════════════
       The sensitive HR keys, read and written with the SERVICE key instead of
       the anon key, so the `kv_store` policy can stop allowing the browser to
       reach them at all.

       ★ THE ALLOWLIST IS AN ALLOWLIST, NOT A BLOCKLIST. A new HR key that
       nobody adds here fails closed — it simply won't route — which is a
       visible bug. A blocklist would fail OPEN and leak silently.

       ⚠️ THIS ENDPOINT IS NOT AUTHENTICATED, AND ON ITS OWN IT SECURES
       NOTHING. It is the prerequisite: it lets the client keep working once the
       RLS policy stops permitting anon reads of these keys. Until BOTH the
       policy is tightened AND this door carries a token, the data is exactly as
       reachable as it was — just through a different handle. Do not treat
       shipping this as having fixed anything. */
    /* ═══ PROTECTED SUBMISSIONS READ ════════════════════════════════════
       The `submissions` table is SELECT-true to anyone holding the
       publishable key that ships in the bundle. Most of it is harmless
       operational logs (walkthroughs, equipment checks) — but
       `onboarding-intake` carries a new hire's NAME, whether they are a
       MINOR, and the storage path of their uploaded ID. That combination
       must not be world-readable.

       Same two-part move that closed the HR keys on Jul 31: route the read
       through here FIRST, promote, verify, and only then narrow the table
       policy. Closing the policy before this ships would blank Hannah's
       intake list.
       ⚠️ SUB_PROTECTED must stay byte-identical to the copy in store.js —
       a tool here and not there reads the now-denied table directly and
       silently returns nothing, which looks exactly like "no new hires". */
    /* ═══ SUBMISSION WRITE ══════════════════════════════════════════════
       `submissions` accepted an INSERT from anyone holding the publishable key
       that ships in the bundle, so a stranger could file a food safety
       walkthrough, an equipment check or a trainer task that never happened.
       Gate City had a QIV falsification case open on Aug 1 — a record nobody
       can forge is not a nice-to-have here.

       Every caller is a signed-in leader (FoodSafetyWalkthrough, EquipmentLog,
       TrainerTasks, FoodQuality, GoalSubmissions, and HR Console's intake), and
       nothing submits from a signed-out phone — checked before writing this, so
       requiring a token breaks no one.

       ⚠️ ANY valid token is accepted, deliberately. These span trainers through
       directors; a tier gate here would silently drop a trainer's weekly task.
       What this removes is ANONYMOUS forgery.
       ⚠️ submitted_by IS OVERWRITTEN WITH THE TOKEN'S OWN uid-resolved name
       when the client leaves it blank, but a client-supplied name is kept —
       several tools legitimately file on behalf of someone else (HR files
       intake for a new hire). The token still proves a real person did it.
       ⚠️ SUB_WRITE_ALLOW is the allowlist. A tool not on it is refused rather
       than silently accepted, so a typo shows up instead of creating a junk
       stream nobody reads. */
    /* ═══ FILE UPLOAD ═══════════════════════════════════════════════════
       Every bucket accepted an upload from anyone holding the publishable key
       in the bundle. Five of the six are private, so that was nuisance — but
       `hub-assets` is PUBLIC, meaning a stranger could park arbitrary content
       there and get a permanent world-readable link associated with the store.

       Now: a session token is required, the bucket is allowlisted, and the
       Worker performs the upload with the service key. The file streams
       straight through — never buffered into a string — so a 13MB phone photo
       costs no more memory here than a small one.

       ⚠️ ANY valid token, deliberately. Uploads span trainers filing photo
       proof through HR filing a document; a tier gate would silently break the
       weekly cleaning checklist.
       ⚠️ upsert stays FALSE, matching the old client behaviour, so an upload
       can never quietly overwrite an existing file. */
    if (url.pathname === "/api/upload" && request.method === "POST") {
      try {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        const bucket = url.searchParams.get("bucket") || "";
        const path = url.searchParams.get("path") || "";
        if (!UPLOAD_BUCKETS.includes(bucket) || !path || path.includes("..")) {
          return Response.json({ ok: false, error: "not-allowed" }, { status: 403 });
        }
        const res = await fetch(
          `${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`,
          {
            method: "POST",
            headers: {
              apikey: env.SUPABASE_SERVICE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
              "Content-Type": request.headers.get("content-type") || "application/octet-stream",
              "x-upsert": "false",
            },
            body: request.body,
          },
        );
        if (!res.ok) {
          const msg = await res.text().catch(() => "");
          return Response.json({ ok: false, error: msg.slice(0, 300) || "upstream" }, { status: 502 });
        }
        return Response.json({ ok: true, bucket, path });
      } catch (e) {
        return Response.json({ ok: false, error: "server" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/submission" && request.method === "POST") {
      try {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        const b = await request.json();
        const tool = String((b && b.tool) || "");
        if (!SUB_WRITE_ALLOW.includes(tool)) {
          return Response.json({ ok: false, error: "not-allowed" }, { status: 403 });
        }
        /* ★ THE CLASS SURVEY IS ANONYMOUS AND THE SERVER IS WHAT MAKES IT SO.
           Bri's evaluation form says "these forms are submitted anonymously",
           and an evaluation people sign is a different evaluation. The browser
           already sends "Anonymous", but a name must not be one client bug away
           from the record: below, an empty submitted_by falls back to
           `uid:${tok.u}`, so ANY future caller that forgets the field, or sends
           "", would silently start stamping the student's id onto their own
           feedback about their instructor.
           ⚠️ Forced here, ignoring whatever arrived. Do not "simplify" this to
           trusting the client — the token still gates who may write, so we know
           it was a real person, we just refuse to record which one. */
        const row = {
          tool,
          submitted_by: tool === "class-survey" ? "Anonymous"
            : String((b && b.submitted_by) || "").trim() || `uid:${tok.u}`,
          payload: b && b.payload !== undefined ? b.payload : {},
          submitted_at: (b && b.submitted_at) || new Date().toISOString(),
        };
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/submissions`, {
          method: "POST",
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(row),
        });
        if (!res.ok) return Response.json({ ok: false, error: "upstream" }, { status: 502 });
        return Response.json({ ok: true });
      } catch (e) {
        return Response.json({ ok: false, error: "server" }, { status: 500 });
      }
    }

    /* New-hire ID upload. No token by necessity — see INTAKE_BUCKET above. */
    if (url.pathname === "/api/intake-upload" && request.method === "POST") {
      try {
        if (await intakeThrottled(env, request)) {
          return Response.json({ ok: false, error: "too-many" }, { status: 429 });
        }
        const path = url.searchParams.get("path") || "";
        if (!intakePathOk(path)) {
          return Response.json({ ok: false, error: "not-allowed" }, { status: 403 });
        }
        /* ⚠️ MEASURED ON THE BYTES, NOT ON content-length.
           🐛 This checked the header for about an hour on Aug 2 2026 — the
           exact hole that was fixed on /api/kv-set in the same sitting, and
           then rewritten here 600 lines later. A caller omits the header or
           sends chunked, `Number(null || 0)` is 0, the check passes, and the
           body streams to the private HR bucket on the SERVICE key from a
           route that by design has no token. Buffering costs one ID photo of
           memory and is the only way the limit is actually a limit. */
        const bytes = await request.arrayBuffer();
        if (bytes.byteLength > INTAKE_MAX_BYTES) {
          return Response.json({ ok: false, error: "too-large" }, { status: 413 });
        }
        if (!bytes.byteLength) {
          return Response.json({ ok: false, error: "empty" }, { status: 400 });
        }
        const res = await fetch(
          `${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(INTAKE_BUCKET)}/${path.split("/").map(encodeURIComponent).join("/")}`,
          {
            method: "POST",
            headers: {
              apikey: env.SUPABASE_SERVICE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
              // Allowlisted, never the caller's word — see intakeType. An
              // anonymous caller declaring text/html is the whole attack.
              "Content-Type": intakeType(request.headers.get("content-type")),
              "x-upsert": "false",
            },
            // The buffered bytes, not request.body — the stream was consumed
            // by the size check above.
            body: bytes,
          },
        );
        if (!res.ok) {
          /* ⚠️ The upstream body is NOT echoed here, unlike /api/upload, which
             is token-gated. This route is anonymous, and with x-upsert false a
             409 "Duplicate" answer would turn it into an existence oracle for
             other new hires' file paths. The status is enough for the page,
             which maps it to a sentence. */
          return Response.json({ ok: false, error: "upstream" }, { status: 502 });
        }
        return Response.json({ ok: true, bucket: INTAKE_BUCKET, path });
      } catch (e) {
        return Response.json({ ok: false, error: "server" }, { status: 500 });
      }
    }

    /* The intake row that tells HR the upload happened. */
    if (url.pathname === "/api/intake-submit" && request.method === "POST") {
      try {
        if (await intakeThrottled(env, request)) {
          return Response.json({ ok: false, error: "too-many" }, { status: 429 });
        }
        const b = await request.json();
        const name = String((b && b.name) || "").trim().slice(0, 120);
        if (!name) return Response.json({ ok: false, error: "name-required" }, { status: 400 });
        const sent = Array.isArray(b && b.files) ? b.files.slice(0, 12) : [];
        /* Rebuilt key by key rather than passed through, and every path
           re-checked against the same rule the upload used — a caller cannot
           point an intake row at a document it did not upload. */
        const files = sent
          .map((f) => ({
            bucket: INTAKE_BUCKET,
            path: String((f && f.path) || "").slice(0, 300),
            fileName: String((f && f.fileName) || "document").slice(0, 200),
            fileType: String((f && f.fileType) || "").slice(0, 100),
          }))
          .filter((f) => intakePathOk(f.path));
        if (!files.length) return Response.json({ ok: false, error: "no-files" }, { status: 400 });
        const row = {
          tool: INTAKE_TOOL,
          submitted_by: name,
          payload: {
            name,
            minor: (b && b.minor) === true,
            kind: String((b && b.kind) || "Document").slice(0, 80),
            files,
          },
          /* Server clock, not the page's. Nothing reads it but HR's ordering,
             and a stamp the caller chooses is a stamp the caller can fake. */
          submitted_at: new Date().toISOString(),
        };
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/submissions`, {
          method: "POST",
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(row),
        });
        if (!res.ok) return Response.json({ ok: false, error: "upstream" }, { status: 502 });
        return Response.json({ ok: true });
      } catch (e) {
        return Response.json({ ok: false, error: "server" }, { status: 500 });
      }
    }

    /* ★ THE NEW HIRE UNIFORM ORDER — ANONYMOUS BY NECESSITY.
       Hannah, Aug 8 2026, replacing her Google Form: "I would like to stop
       using Google forms and just use everything on the hub."

       The people filling this in have NO Hub sign-in. They are on the public
       onboarding page days before their PIN exists, which is why this cannot be
       a tile. Same hardening as /api/intake-submit above, for the same reason:
       throttled per IP, every field rebuilt key by key, nothing passed through,
       every length capped.

       GET returns the form itself — items, sizes, flat price, wording — so the
       static page carries no copy of its own and a size cannot drift.

       ⚠️ FILED AS tool "uniform-order" ON PURPOSE. Hannah already has a uniform
       orders tab with a fulfil button; a second list is a second thing to check
       on a busy week. `newHire: true` is what tells them apart on screen.
       ⚠️ subtotal IS THE FLAT RATE, NOT A SUM, and every line price is null.
       Her form charges $60 whatever the three items cost. HR Console adds
       subtotals across open orders, so a per-line price here would double-count
       into the number she reads at a glance. */
    if (url.pathname === "/api/newhire-uniform" && request.method === "GET") {
      return Response.json({
        ok: true,
        intro: NEWHIRE_INTRO,
        shoesAck: NEWHIRE_SHOES_ACK,
        flat: NEWHIRE_FLAT_PRICE,
        items: NEWHIRE_ITEMS,
      });
    }

    if (url.pathname === "/api/newhire-uniform" && request.method === "POST") {
      try {
        if (await intakeThrottled(env, request)) {
          return Response.json({ ok: false, error: "too-many" }, { status: 429 });
        }
        const b = await request.json();
        const name = String((b && b.name) || "").trim().slice(0, 120);
        if (!name) return Response.json({ ok: false, error: "name-required" }, { status: 400 });
        const ack = String((b && b.shoesAck) || "").trim().slice(0, 120);
        if (!ack) return Response.json({ ok: false, error: "ack-required" }, { status: 400 });

        /* Built from OUR list, never theirs. A value the list does not accept
           REFUSES the order rather than filing a blank size, because a blank
           size is something Hannah has to chase down a week later. */
        const picks = (b && b.picks) || {};
        const lines = [];
        for (const it of NEWHIRE_ITEMS) {
          const raw = picks[it.id];
          if (!newHireLineOk(it, raw)) {
            return Response.json({ ok: false, error: "bad-size", item: it.id }, { status: 400 });
          }
          lines.push({
            id: it.id, item: it.label, category: "New hire",
            price: null, only: null,
            size: String(raw).trim(), color: null, fit: null,
          });
        }

        const row = {
          tool: "uniform-order",
          submitted_by: name,
          payload: {
            name,
            newHire: true,
            lines,
            subtotal: NEWHIRE_FLAT_PRICE,
            sizeNotes: "",
            shoesAck: ack,
            comments: String((b && b.comments) || "").trim().slice(0, 600),
            at: new Date().toISOString(),
          },
          submitted_at: new Date().toISOString(),
        };
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/submissions`, {
          method: "POST",
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(row),
        });
        if (!res.ok) return Response.json({ ok: false, error: "upstream" }, { status: 502 });
        return Response.json({ ok: true });
      } catch (e) {
        return Response.json({ ok: false, error: "server" }, { status: 500 });
      }
    }

      /* ★ THE PTO SEED, BEHIND THE SAME GATE AS HR RECORDS (Aug 8 2026).
         It used to be a constant in the browser bundle, readable by anyone.
         Now: a signed-in session AND full-HR-reader, which is the five people
         on HR_CONSOLE_PEOPLE. Same class as the HR keys, because it is the
         same kind of data — pay and time off, by name.
         ⚠️ READ ONLY. There is no write here and there must not be. The import
         button in the tile writes the LEDGER through the normal kv path; this
         route only hands over the starting values to write FROM. */
      /* ★ THE CHANGE-ORDER DIAL-IN, WHICH WAS PRINTED IN THE BUNDLE (Aug 8 2026).
         🐛🐛 CashAudit.jsx carried the login id and the password as literal text
         in its JSX. That is a React file, so both shipped inside a client chunk
         that answered HTTP 200 to any anonymous request — verified against
         production before this was written. A working credential for the store
         change-order line, readable by anyone who knew the filename, sitting
         next to the standing order amounts and the delivery days.

         ⚠️ THE VALUES ARE CLOUDFLARE SECRETS, NOT CODE. CHANGE_ORDER_LOGIN and
         CHANGE_ORDER_PASSWORD are set on the Worker. That is deliberate: the
         password is being rotated because of this incident, and the new one must
         never enter git. A secret committed once is a secret in every clone,
         every branch and every backup of the repo, forever.

         ⚠️ TIER 2 AND UP, matching the tile itself — App.jsx declares cashaudit
         as tier 2. Rank >= 3 is what roleTier calls tier 2: Senior Trainer, Team
         Leader, Assistant Director, Director. A plain team member who signs in
         does not get handed the store banking credential.

         ⚠️ UNSET FAILS CLOSED AND SAYS SO. configured:false makes the tile print
         "ask Matt" rather than a blank space where a credential used to be, so a
         missing secret can never look like a working screen. */
      /* ★ THE FCR FINANCIALS, BEHIND THE SAME GATE AS THE TILE (Aug 8 2026).
         Financials is declared tier 3 with Payroll allowed (App.jsx), and tier 3
         is rank >= 6 in roleTier terms. Payroll is checked by title because it
         is an exception to rank, exactly as hrIsFullReader treats it.
         ⚠️ READ ONLY, AND NOT A LEDGER. These are the reference tables the page
         draws against. Everything the store actually types still lives in KV and
         is untouched by this route. */
      /* ★ THE PROFIT-SHARE SEED, behind the same tier 3 gate as Financials.
         Names tied to compensation — the file it came from says so itself. */
      /* ★ THE IPO QUARTER PLAN, behind the Financials gate. It names every cost
         category the store runs over benchmark and the dollar variance on each. */
      /* ★ THE IPO QUARTER PLAN — STORED PER STORE, WITH A FALLBACK (Aug 8 2026).
         Matt: "A second store needs their own and a place to edit."

         It used to be authored IN CODE. ipoPlanData.js still says so in its own
         header: "WHAT YOU AUTHOR EACH QUARTER (the ONE edit): add a block to
         QUARTER_PLANS". That is a deploy every quarter for this store, and for a
         second store it is not possible at all — they cannot edit this repo.

         ⚠️ KV WINS, CODE IS THE FLOOR. A store's own quarters override the
         built-in ones key by key, so Gate City keeps working with nothing stored
         and a new store overrides only the quarters they have authored. Rule 1:
         nothing already in KV changes shape, because nothing was there before.
         ⚠️ A FAILED KV READ FALLS BACK TO CODE RATHER THAN TO EMPTY. An empty
         plan renders as a finished quarter, which is a lie the pill would repeat
         on the dashboard. */
      /* ★ THE JUNE 2026 FOOD GAP TABLE, behind the Financials gate. It was in
         the MAIN bundle until Aug 8 2026 — itemised food-cost leakage by name
         and dollar, downloadable by anyone who loaded the site. */
      /* ★ THE SUPPLIER ROSTER, behind the Financials gate. It shipped to the
         browser until Aug 8 2026 — who this store buys from, by category, plus
         the standing contracts and their cadence. */
      if (url.pathname === "/api/expense-vendors" && request.method === "GET") {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
        const who = await hubRank(env, String(tok.u || ""));
        if (!finReader(who)) {
          return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
        }
        /* ⚠️⚠️ GATE CITY'S SUPPLIER ROSTER IS GATE CITY'S (Aug 12 2026). Both
           tables below are this restaurant's real vendors — 91 names by category
           plus 7 standing contracts with their cadence and service terms — and
           this route was handing them to WHATEVER STORE runs this Worker.

           ⚠️ AND IT DOES NOT JUST DISPLAY THEM. ExpenseTracker seeds `recurring`
           straight into that store's own gcfcr-expenses-recurring-v1 the first
           time somebody opens the tile on an empty record. So a clone does not
           merely see Gate City's contracts, it SAVES them, and from then on the
           seed never fires again and the rows look like their own.

           ⚠️ THE REPO ALREADY DECIDED THIS, FOR THE ROSTER. NEW-STORE-SETUP.md:
           "the seed only applies when the store number is Gate City's, so a
           clone gets an empty roster automatically and imports its own." That is
           the same reasoning and the same starting state — a new store begins
           empty on purpose. This route simply never got the gate, and nothing in
           NEW-STORE-SETUP.md or STORE-INTAKE.md told a clone to clear the file,
           so it would have happened silently.

           ⚠️ GATE CITY IS UNAFFECTED IN BOTH HALVES. STORE.fsr is 04010 here, so
           the tables are returned exactly as before — and the seed has not fired
           for this store in months anyway, because the record has had items in
           it since Cindy started using the tile.

           ⚠️ EMPTY, NEVER A 403. A clone asking this question gets a real answer
           that says "no hints to offer", which is precisely what fetchVendorData
           already treats an empty response as. A 403 would put an error banner on
           a working tile for a store that has done nothing wrong.

           ⚠️ STORE.fsr / GATE_CITY_FSR, matching notifyTarget's guard three
           thousand lines up, NOT storeConfig's isGateCity(). The Worker reads
           storeConfig at module load and never re-reads it — see the note on
           isGateCity — so the two literals stay apart on purpose. */
        return Response.json({
          ok: true,
          vendors: seedFor(VENDOR_HINTS, {}),
          recurring: seedFor(RECURRING_SEED, []),
        });
      }

      if (url.pathname === "/api/food-gaps-seed" && request.method === "GET") {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
        const who = await hubRank(env, String(tok.u || ""));
        if (!finReader(who)) {
          return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
        }
        return Response.json({ ok: true, seed: seedFor(FOOD_GAPS_SEED, {}) });
      }

      /* ★ THE JULY 2026 INVENTORY GAPS, behind the Financials gate. It was in a
         client chunk until Aug 8 2026 — $8,701.90 of missing product, the top
         25 items by name, cost and cases, readable by anyone who loaded the
         site. Separate from the food gaps above: that is the Food Cost
         Drilldown by subcategory, this is the Inventory Activity Report by
         item, and the two must never mix (both source files warn about it). */
      if (url.pathname === "/api/inventory-gaps-seed" && request.method === "GET") {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
        const who = await hubRank(env, String(tok.u || ""));
        if (!finReader(who)) {
          return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
        }
        return Response.json({ ok: true, seed: seedFor(INV_GAPS_SEED, {}) });
      }

      /* ★ THE FY26 OPERATOR SCORECARD, behind the Financials gate. It was in
         the Business Scorecard's own chunk until Aug 8 2026 — net profit,
         labor and food cost gaps, average wage, retention, turnover, catering
         dollars and contest rank, each sitting next to the CFA benchmark it is
         measured against. The tile was already tier 3. That gate decides what
         RENDERS; the chunk downloaded either way. */
      if (url.pathname === "/api/scorecard-seed" && request.method === "GET") {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
        const who = await hubRank(env, String(tok.u || ""));
        if (!finReader(who)) {
          return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
        }
        /* ⚠️ THE EMPTY VALUE HERE IS A BLANK SCORECARD, NOT `{}`, AND THAT IS
           THE ONE ROUTE WHERE IT HAS TO BE. Every other seed route's caller
           treats an empty payload as "nothing to seed" and carries on. This
           one does not: `{}` makes `hasSeed` false, `seedCopy()` returns null,
           and the tile renders "Loading scorecard…" permanently. The Village
           sat on that line from go-live until Aug 12 2026.
           `SCORECARD_BLANK` is derived from SCORECARD_SEED, so it carries the
           section ids and row labels the merge needs and not one figure. */
        return Response.json({ ok: true, seed: seedFor(SCORECARD_SEED, SCORECARD_BLANK) });
      }

      /* ★ THE FACILITIES PUNCH LIST. It was in the ENTRY chunk until Aug 8 2026
         — 35 open maintenance items for this building, downloadable with no
         sign-in — because facilitiesData.js was imported by App.jsx as well as
         the tile.

         ⚠️ THIS GATE IS NOT THE SAME AS THE OTHER FOUR, AND THAT IS THE POINT.
         Facilities is `tier: 3` PLUS `allowIds: ["16"]` — Brandon, added Jul 30
         so one person could use it without opening it to all nine ADs. Gating
         this route at rank >= 6 like the seed routes above would hand him a 403
         and an empty tile, with nothing on screen explaining why.
         The id lives in storeConfig.js so App.jsx and this route read ONE list.
         A second copy here is how Nick's reduced view stayed hidden all morning.

         ⚠️ SEED IS THE LIST, NOT A FALLBACK. Unlike the other seeds, the tile
         cannot render a single row without this, and its merge writes back. The
         client refuses every write until this call succeeds — see Facilities.jsx. */
      if (url.pathname === "/api/facilities-seed" && request.method === "GET") {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
        const uid = String(tok.u || "");
        const who = await hubRank(env, uid);
        /* 🐛 A DIRECTOR COULD OPEN THE TILE AND GET NOTHING (Aug 8 2026, found
           by Matt asking whether anyone's access had moved).
           The tile is `tier: 3, allow: ["Director"], allowIds: [...]`, and
           `Director` is RANK 5 in hrRoster.js, not 6. So a plain Director
           cleared the tile's `allow` arm, opened Facilities, and this route
           handed them a 403 — an empty punch list and every save refused, with
           nothing on screen saying why. Brandon is the named id and was fine;
           Daisy is a Director and was not.
           ⚠️ THIS GATE MIRRORS canUseTool FOR THIS TILE, ARM FOR ARM. tier 3 is
           rank >= 6, `allow` is the title, `allowIds` is the id list. Any of the
           three opens the tile, so any of the three must open the data. A route
           that is stricter than its tile is invisible: the tile still renders.  */
        if (!(who.rank >= 6 || who.title === "Director" || who.title === "Payroll"
              || tileAllowsId("facilities", uid))) {
          return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
        }
        return Response.json({ ok: true, seed: seedFor(FACILITIES_SEED, []), actions: seedFor(FACILITIES_ACTIONS, []) });
      }

      /* ═══ THE STORE'S SETTINGS ═══════════════════════════════════════════
         READ is open to any signed-in person, and that is deliberate rather
         than lax: the app applies this at boot so every screen shows the
         store's own name, goals and switches. Gating the read at tier 3 would
         mean a team member's Hub silently ran on Gate City's defaults while
         their director's ran on theirs — two stores in one building. Nothing
         in the record is more sensitive than what already ships in the bundle.
         ⚠️ Falls back to {} on an unreadable store, never to an error. A boot
         read that throws must not be able to keep the Hub off a phone. */
      if (url.pathname === "/api/store-config" && request.method === "GET") {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
        let stored = null;
        try { stored = await sbGet(env, STORE_CONFIG_KEY); } catch { stored = null; }
        const rec = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
        return Response.json({ ok: true, settings: rec.settings || {}, updatedAt: rec.updatedAt || "", updatedBy: rec.updatedBy || "" });
      }

      /* WRITE is tier 3 only, and by RANK rather than by title.
         ⚠️ NOT the `rank >= 6 || Payroll` full-reader idiom. That is a READ
         test, and it went wrong on this exact shape twice already — the IPO
         write let a title write a tile it cannot open, and the profit-share
         route handed data to two people whose own tab refuses to render it.
         Settings change the board, the money screens and who is notified, so
         the write is the narrower thing: rank 6 and up, the same tier 3 the
         tile itself is gated at.
         ⚠️ THE SAME VALIDATOR THE PAGE USED, for the reason the leaf exists.
         ⚠️ IT KEEPS THE LAST 10 VERSIONS IN THIS RECORD, not in a second key.
         Two keys drift, and the one time that matters is the one time somebody
         is trying to undo a bad edit. */
      if (url.pathname === "/api/store-config" && request.method === "POST") {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
        const who = await hubRank(env, String(tok.u || ""));
        if (!who || who.rank < 6) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

        let body = null;
        try { body = await request.json(); } catch { body = null; }
        const next = body && typeof body === "object" ? body.settings : null;
        const check = checkStoreSettings(next);
        if (!check.ok) return Response.json({ ok: false, error: "refused", errors: check.errors }, { status: 400 });

        /* ⚠️ READ BEFORE WRITE, AND A FAILED READ REFUSES. Saving over a record
           we could not read would drop the version history and could overwrite
           another director's change with a stale form. */
        let cur = null, readOk = true;
        try { cur = await sbGet(env, STORE_CONFIG_KEY); } catch { readOk = false; }
        if (!readOk) return Response.json({ ok: false, error: "could not read the current settings, so nothing was saved" }, { status: 503 });
        const prev = cur && typeof cur === "object" && !Array.isArray(cur) ? cur : {};
        const history = Array.isArray(prev.history) ? prev.history : [];
        const stamp = new Date().toISOString();
        const rec = {
          settings: next,
          updatedAt: stamp,
          updatedBy: String(tok.u || ""),
          /* Newest first, capped at 10. The entry stores the settings as they
             were BEFORE this save, which is what an undo needs. */
          history: [{ at: prev.updatedAt || "", by: prev.updatedBy || "", settings: prev.settings || {} }, ...history].slice(0, 10),
        };
        /* ⚠️ sbSet THROWS ON FAILURE AND RETURNS undefined ON SUCCESS. It does
           NOT return a boolean — the client's kvSet in store.js does, and
           writing this route as `if (!await sbSet(...))` reported "that did not
           save" on every successful save. Two functions with the same job and
           opposite failure conventions; check which one you are holding. */
        try {
          await sbSet(env, STORE_CONFIG_KEY, rec);
        } catch {
          return Response.json({ ok: false, error: "that did not save" }, { status: 503 });
        }
        return Response.json({ ok: true, updatedAt: stamp, warnings: check.warnings, versions: rec.history.length });
      }

      if (url.pathname === "/api/ipo-plan" && request.method === "GET") {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
        const who = await hubRank(env, String(tok.u || ""));
        if (!finReader(who)) {
          return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
        }
        let stored = null;
        try { stored = await sbGet(env, IPO_PLANS_KEY); } catch { stored = null; }
        const own = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
        return Response.json({
          ok: true,
          plans: { ...QUARTER_PLANS, ...own },
          storedQuarters: Object.keys(own).sort(),
        });
      }

      /* Writing a plan. Same gate as reading it, and the SAME validator the
         browser used before it offered to save — a check that only runs in the
         browser is a check somebody can skip with curl.
         ⚠️ REFUSES RATHER THAN REPAIRS. A half-understood plan drives the
         dashboard pill and a quarter of action items; one that saved with three
         of its four weeks would look finished and under-report the work. */
      if (url.pathname === "/api/ipo-plan" && request.method === "POST") {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
        const who = await hubRank(env, String(tok.u || ""));
        /* 🐛 WRITE, NOT READ — AND PAYROLL IS RANK 1 (Aug 10 2026, sweep finding 34).
           This POST replaces the stored quarter plans, and stored beats in-code, so
           an injected quarter drives the IPO tile AND the dashboard pill. The
           `rank >= 6 || Payroll` idiom is this repo's FULL-READER test and is right
           on the GET above — Payroll legitimately holds the Financials tile, so the
           IPO variances disclose nothing marginal. It is wrong here: the ipo tile is
           tier 3 with no allow and no allowIds, so canUseTool is false on all three
           arms for that title. It let someone WRITE a tile they cannot OPEN, and
           broke an invariant hrRoster.js states outright — "Cindy reads
           every file but was never granted a single write power".
           ⚠️ Latent, not live: nobody holds the title "Payroll" today (checked the
           live roles map, 0 of 106). It arms the day somebody is given it, which is
           exactly how the change-order gate went wrong.
           ⚠️ THE GET KEEPS ITS PREDICATE ON PURPOSE. This is the only WRITE among
           the eight routes using it; the other seven are reads and are correct. */
        if (!(who.rank >= 6)) {
          return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
        }
        let body = null;
        try { body = await request.json(); } catch { body = null; }
        const check = parseIpoPlans(JSON.stringify((body && body.plans) || null));
        if (!check.ok) return Response.json({ ok: false, error: check.error }, { status: 400 });
        /* Read-merge-write, so saving one quarter never drops the others. */
        let stored = null;
        try { stored = await sbGet(env, IPO_PLANS_KEY); } catch { stored = null; }
        const merged = { ...(stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {}), ...check.plans };
        try {
          await sbSet(env, IPO_PLANS_KEY, merged);
        } catch (e) {
          return Response.json({ ok: false, error: "Could not save: " + String(e).slice(0, 120) }, { status: 502 });
        }
        return Response.json({ ok: true, saved: check.quarters, storedQuarters: Object.keys(merged).sort() });
      }


      if (url.pathname === "/api/profitshare-seed" && request.method === "GET") {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
        const who = await hubRank(env, String(tok.u || ""));
        /* 🐛 THIS WAS `rank >= 6 || Payroll` AND THE SCREEN NEVER AGREED WITH IT
           (Aug 10 2026, sweep finding 17). The Profit Share TAB matches five
           role NAMES, and FinancialSuite's comment said in advance why: a rank
           test "would also admit Leadership Development Director, which is below
           the line Matt drew". This route used that exact rank test, so the API
           handed the pay groups and multipliers to two real people whose own tab
           refuses to render them — Bri (Leadership Development Director,
           rank 6) and Cindy (Accounts Payable, rank 7; the tab wants
           "Payroll"). Both confirmed against the live roles map, not inferred.
           ⚠️ NOW ONE DEFINITION, IMPORTED FROM THE SAME LEAF THE TAB USES. A
           gate written twice is a gate that drifts, and this one already had. */
        if (!canSeeProfitShare(who.title)) {
          return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
        }
        return Response.json({ ok: true, groupMult: GROUP_MULT, defaultGroups: DEFAULT_GROUPS });
      }

      /* Sweep finding 11. The daypart table, behind the SAME gate as the tile it
         belongs to — LaborPlanner is a tab inside Financials, which App.jsx
         declares tier 3 with Payroll allowed, and rank >= 6 is tier 3.
         ⚠️ ITS OWN ROUTE, NOT THE NORMAL STORAGE READ, AND THAT IS THE POINT.
         `gcfcr-daypart-labor-v1` has never been written; the card has always
         shown a hardcoded month while looking like saved data, which is exactly
         why Input Health sits amber. Handing these back as if they were stored
         would turn that amber green while nothing had been saved. A seed has to
         keep arriving as a seed. */
      if (url.pathname === "/api/labor-seed" && request.method === "GET") {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
        const who = await hubRank(env, String(tok.u || ""));
        if (!finReader(who)) {
          return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
        }
        return Response.json({ ok: true, dpMonths: DP_SEED_MONTHS });
      }

      /* Sweep finding 12. CEM and Smart Shop scores, behind the SAME gate as the
         tile — App.jsx declares guestxp `tier: 2` with an allow for the three
         Trainer titles, and rank >= 3 is tier 2.
         ⚠️ THE ALLOW LIST IS PART OF THE GATE, NOT DECORATION. A route stricter
         than its tile is INVISIBLE: the tile still renders, the person still
         opens it, and the data just never arrives with no error that names the
         cause. That exact shape cost a day on the Facilities lockout and again
         on /api/change-order, where Payroll could open Cash Audit and then take
         a 403. Junior Trainer and Trainer are rank 1, so without this clause
         they would open a working tile that shows nothing. */
      if (url.pathname === "/api/guest-seed" && request.method === "GET") {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
        const who = await hubRank(env, String(tok.u || ""));
        const trainerTitle = ["junior trainer", "trainer", "senior trainer"]
          .includes(String(who.title || "").trim().toLowerCase());
        if (!(who.rank >= 3 || trainerTitle)) {
          return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
        }
        return Response.json({ ok: true, cem: CEM_SEED, shop: SHOP_SEED });
      }

      if (url.pathname === "/api/fcr-data" && request.method === "GET") {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
        const who = await hubRank(env, String(tok.u || ""));
        if (!finReader(who)) {
          return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
        }
        /* ⚠️ ytdSeed ADDED Aug 9 2026 (sweep finding 5). It was written inline in
           FCRPage.jsx as SEED_YTD, so the Aug 8 move of the two imported modules
           left six months of P&L in the Financials chunk — and that commit's own
           verification sampled only the modules it had moved, so it passed.
           Only the dollars travel; the 26 line LABELS stay in the client, or the
           YTD editor renders with no rows to type into. */
        /* ★★ THE HISTORY IS ONLY SERVED TO THE STORE IT BELONGS TO.
           storeConfig calls this "the worst clone hazard in the repo": a new
           store reads Gate City's sales as their last year for a whole year,
           and every growth number and projected finish is measured against a
           restaurant they have never seen.

           ⚠️ ALL FOUR PAYLOADS, NOT JUST lySales. The hazard note names last
           year's sales because that is the one a person notices, but
           `reference` is our historical profit percentages, `projections` is
           our P&L forecast and `ytdSeed` is our January-to-June profit and
           loss. Handing a clone any of them is the same mistake in a different
           column, and the gate costs nothing extra to apply to all four.

           ⚠️ EMPTY, NOT ABSENT. The client reads `fcr.lySales` and `fcr.reference`
           with `|| {}` and already renders an em dash when growth is unknown
           (FCRPage: `growthKnown ? … : "—"`), so empty objects walk the paths
           that already exist. Dropping the keys entirely would take those
           callers somewhere less well trodden for no gain.

           ⚠️ `foreign` IS REPORTED so the screen can say WHY it is empty rather
           than looking broken. Nothing reads it yet; it is here because the
           alternative is a store staring at dashes with no explanation. */
        const ownHistory = String(STORE.fsr || "") === String(REFERENCE_FSR || "");
        return Response.json({
          ok: true,
          projections: ownHistory ? FCR_PROJECTIONS : {},
          reference: ownHistory ? FCR_REFERENCE : {},
          lySales: ownHistory ? LY_MONTHLY_SALES : {},
          ytdSeed: ownHistory ? FCR_YTD_SEED : null,
          foreign: !ownHistory,
        });
      }

      if (url.pathname === "/api/change-order" && request.method === "GET") {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
        const who = await hubRank(env, String(tok.u || ""));
        /* ⚠️ `|| Payroll` ADDED Aug 9 2026 — PAYROLL IS RANK 1, NOT RANK 3.
           The cashaudit tile is `tier: 2, allow: ["Payroll"]`, and `allow` is an
           exception to rank, not a restatement of it. Gating on rank alone let a
           Payroll-titled person open the tile and take a 403 on the credential:
           the SAME shape as the Facilities lockout on Aug 8, where a Director
           (rank 5) cleared a tier-3 tile's role arm and failed its rank-6 route.
           A ROUTE STRICTER THAN ITS TILE IS INVISIBLE — the tile still renders.
           ⚠️ NOBODY HOLDS "Payroll" TODAY. Checked the live gcfcr-hr-roles and
           the seed roster: zero. Cindy is "Accounts Payable" (rank 7). So this
           harms no one right now and is closed because the tile invites the
           title — the day someone is given it, the door is already shut. */
        if (!(who.rank >= 3 || who.title === "Payroll")) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
        const login = String(env.CHANGE_ORDER_LOGIN || "").trim();
        const password = String(env.CHANGE_ORDER_PASSWORD || "").trim();
        if (!login || !password) return Response.json({ ok: true, configured: false });
        return Response.json({ ok: true, configured: true, login, password });
      }

      /* ★ THE JULY SAFE COUNTS, OUT OF THE BUNDLE (Aug 9 2026 sweep, finding 4).
         `JULY_SEED` sat in CashAudit.jsx, so eight dated counts of a real safe —
         balances, denomination mix, the $1,000 till float, deposit sizes and a
         $900 change order — were in a chunk anyone could download with no
         account. They live in cashAuditSeed.js now, which only this file imports.

         ⚠️ SAME GATE AS THE CREDENTIAL ABOVE, AND FOR THE SAME REASON: this is
         the cashaudit tile, tier 2 with Payroll allowed. Both arms, or the route
         is stricter than the tile that opens it.

         ⚠️ THE SEED IS A BACKFILL, NOT THE LIST. CashAudit renders from its own
         ledger; these rows are only added for a date+shift the ledger does not
         already have. So a failed or forbidden fetch must yield an EMPTY seed,
         which adds nothing and writes nothing — see the note on seedJulyEntries.
         That is the safe direction, and it matters here more than anywhere: this
         file's own history includes a dropped read seeding over the real ledger
         twice, through window.storage and through kvSet. */
      if (url.pathname === "/api/cashaudit-seed" && request.method === "GET") {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
        const who = await hubRank(env, String(tok.u || ""));
        if (!(who.rank >= 3 || who.title === "Payroll")) {
          return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
        }
        return Response.json({ ok: true, seed: seedFor(CASH_AUDIT_SEED, []), note: seedFor(CASH_AUDIT_SEED_NOTE, "") });
      }

      if (url.pathname === "/api/pto-seed" && request.method === "GET") {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
        if (!(await hrFullReader(env, String(tok.u || "")))) {
          return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
        }
        return Response.json({ ok: true, seed: seedFor(PTO_SEED, {}), bonus: seedFor(PTO_BONUS_SEED, []) });
      }


    if (url.pathname === "/api/submissions" && request.method === "GET") {
      try {
        const tok = await readToken(env, url.searchParams.get("t") || request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        const tool = url.searchParams.get("tool") || "";
        if (!SUB_PROTECTED.includes(tool)) {
          return Response.json({ ok: false, error: "not-allowed" }, { status: 403 });
        }
        // Only a full HR reader sees intake — same class the HR keys use.
        if (!(await hrFullReader(env, String(tok.u || "")))) {
          return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
        }
        const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);
        const api =
          `${env.SUPABASE_URL}/rest/v1/submissions?tool=eq.${encodeURIComponent(tool)}` +
          `&select=*&order=submitted_at.desc&limit=${limit}`;
        const res = await fetch(api, {
          headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
        });
        if (!res.ok) return Response.json({ ok: false, error: "upstream" }, { status: 502 });
        return Response.json({ ok: true, rows: await res.json() });
      } catch (e) {
        return Response.json({ ok: false, error: "server" }, { status: 500 });
      }
    }

    /* ═══ THE TERMINATION ARCHIVE, BEHIND A DOOR ═══════════════════════════
       🐛🐛 528 FIRED PEOPLE WERE A PUBLIC DOWNLOAD (Aug 7 2026 sweep, critical).
       HRConsole.jsx imported TermArchive.js at module level, so Vite compiled
       all 528 records — name, date, rehire flag, and a written reason on 525 of
       them — into dist/assets/HRConsole-*.js. That chunk is a plain static file
       the app worker serves with NO sign-in and NO tier check. Confirmed live
       before the fix: HTTP 200, 261KB, no account, reasons readable verbatim.

       Two victims. Any team member who opened HR Console to set their PIN had
       it cached on their phone, and the tile is tier 1 so that is all 106 of
       them. And anyone at all could fetch it from the page source.

       ⚠️ THE UI GATE WAS NEVER THE PROBLEM. HRConsole.jsx:1566 correctly hides
       the Terminated tab from everyone below LDD. That gate runs AFTER the
       browser has already downloaded the file. Gating a render cannot unsend
       bytes — the only fix is for the bytes not to be there.

       ⚠️ HIGHER BAR THAN hrFullReader. Full read is rank 5 (Director) or
       Payroll; terminated is LDD and up, which Matt ruled explicitly on Jul 28.
       This mirrors HRConsole's canSeeTerminated, not its `full`. */
    if (url.pathname === "/api/term-archive" && request.method === "GET") {
      try {
        const tok = await readToken(env, url.searchParams.get("t") || request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        const uid = String(tok.u || "");
        /* ⚠️ MEMBERSHIP **AND** RANK, both. Rank alone is not the rule and
           getting that wrong is the exact bug the Jul 31 sweep found: Kyleeka
           is an Executive Director, rank 7, and is deliberately NOT on the HR
           Console list. A rank-only gate here would hand her the archive.
           hrFullReader owns the membership half (it refuses anyone off
           HR_CONSOLE_PEOPLE before it looks at anything else).
           ⚠️ The rank bar is 6, not HR_FULL_READ_MIN's 5. Matt ruled on Jul 28
           that terminated records stay at LDD and up, so a plain Director who
           reads every active file still cannot read this. Cindy passes on the
           Payroll carve-out — she needs terms for final pay. */
        const [member, rank, roles, added] = await Promise.all([
          hrFullReader(env, uid),
          hrRankForUid(env, uid),
          sbGet(env, "gcfcr-hr-roles").catch(() => null),
          sbGet(env, HR_ADDED_KEY).catch(() => null),
        ]);
        const payroll = hrTitleFor(uid, roles || {}, Array.isArray(added) ? added : []) === "Payroll";
        if (!member || !(rank >= 6 || payroll)) {
          return Response.json({ ok: false, error: "not-allowed" }, { status: 403 });
        }
        return Response.json({ ok: true, archive: TERM_ARCHIVE });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 500 });
      }
    }

    /* ══════════════════════════════════════════════════════════════════════
       /api/doc-ack — ONE PERSON RECORDS THEIR OWN SIGNATURE. NOTHING ELSE.

       🐛 THE BUG (Aug 7 2026 sweep, finding 17). A team member opened their own
       file, read a document HR had sent them, tapped Acknowledge, and got
       "That did not save... it will be gone if you reload. Check your
       connection." It was never the connection: `gcfcr-hr-docsends-v1` is on
       HR_PROTECTED, so the save went to /api/hr-store, fell through to the
       whole-map gate, and 403'd everyone who is not a full HR reader. The
       acknowledgment never recorded, so Sent Documents read 0 of N forever and
       HR chased people who had already signed.

       ⚠️ THE COMMENT ON THAT GATE SAYS "THIS BREAKS NOBODY, and that was
       checked... HR Console itself is reachable by exactly five people". That
       is the wrong half of the console. The SELF view is reachable by all ~106
       — anyone can enter their own PIN and open their own file — and that is
       the half that signs things.

       🐛 THE SECOND HALF, FOUND WHILE FIXING THE FIRST. Handbook signing works
       today ONLY because `gcfcr-hr-handbook` and `-ldrhandbook` were never put
       on HR_PROTECTED. Nothing deliberate — the two keys just landed on
       different lists. The side effect is that any of the ~106 people holding a
       PIN could write those maps directly through /api/kv-set: forge a
       signature in someone else's name, or erase one. Both keys are on
       KVSET_NEEDS_HR now, and every self-signature comes through here instead.

       ★ WHY A ROUTE AND NOT A LIST ENTRY. The generic doors are all-or-nothing
       about a whole map, and the own-row merge cannot help: a send is an ARRAY
       of records each holding an `acks` object, so "your row" is a field three
       levels down. This asks the one question that is actually being asked —
       "may this person sign this thing" — and can write nothing else.

       ⚠️ THE SIGNER COMES FROM THE TOKEN, NEVER FROM THE BODY. A `member` field
       in the request would just be the old hole with extra steps.
       ⚠️ NEVER WRITES OFF A READ IT DOES NOT TRUST. A missing or non-array
       sends list means the read failed or the key is gone; writing then would
       replace the whole acknowledgment trail with one record. It refuses. */
    /* ══════════════════════════════════════════════════════════════════════
       /api/my-docs — WHAT AM I STILL BEING ASKED TO SIGN?

       ⛔ WHY IT HAS TO BE A ROUTE. Bri, Aug 17 2026 and again Aug 19: "I sent an
       SOP document to sign. Nobody can see it... I don't know where these are
       going right now." The document really was sent and the signing really did
       work. Nothing told the person it was waiting, so nobody went to look.

       ⇒ The obvious fix is a count on the home screen, and the home screen
       cannot have one: `gcfcr-hr-docsends-v1` is on HR_PROTECTED, so the ~106
       people who need the count are exactly the ones who cannot read the key.
       This answers the one question they may ask about themselves, resolved
       from their token, and returns nothing about anybody else.

       ⚠️⚠️ IT LEAKS NO ROSTER. The reply carries only rows this person is a
       target of, and only the title and the date. No target list, no
       acknowledgment map, no other person's name — a team member must not be
       able to work out who else has or has not signed something.
       ⚠️ A FAILED READ IS NOT AN EMPTY ONE. `ok: false` on an unreadable key,
       so the screen can stay silent instead of telling somebody they owe
       nothing. Saying "you are all clear" off a dropped read is the lie this
       whole area already has a history of.
       ⚠️ GET, AND IT WRITES NOTHING. Reading what you owe must never be the
       thing that records it. */
    if (url.pathname === "/api/my-docs" && request.method === "GET") {
      try {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        const uid = String(tok.u || "");
        if (!uid) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

        const sends = await sbGetStrict(env, "gcfcr-hr-docsends-v1").catch(() => undefined);
        /* undefined = the read was refused. null = the key genuinely is not
           there yet, which means nothing has ever been sent and "you owe
           nothing" is the true answer. The two must not collapse. */
        if (sends === undefined) return Response.json({ ok: false, error: "unreadable" }, { status: 503 });
        const list = Array.isArray(sends) ? sends : [];

        const owed = list.filter((r) => r && r.signRequired
          && Array.isArray(r.targetIds) && r.targetIds.map(String).includes(uid)
          && !(r.acks && typeof r.acks === "object" && r.acks[uid]))
          .map((r) => ({
            id: String(r.id || ""),
            title: String(r.docTitle || "Untitled document"),
            sentAt: String(r.createdAt || ""),
          }));
        return Response.json({ ok: true, count: owed.length, docs: owed });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 500 });
      }
    }

    if (url.pathname === "/api/doc-ack" && request.method === "POST") {
      try {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        const uid = String(tok.u || "");
        if (!uid) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

        const b = await request.json().catch(() => null);
        const kind = String((b && b.kind) || "");
        const sig = String((b && b.sig) || "").trim();
        /* An empty signature is a UI bug reaching the server, not a signature.
           Storing it would show as signed and prove nothing. */
        if (!sig) return Response.json({ ok: false, error: "signature-required" }, { status: 400 });
        const nowIso = new Date().toISOString();
        const todayIso = nowIso.slice(0, 10);

        if (kind === "send") {
          return await ackOneRow(env, {
            key: "gcfcr-hr-docsends-v1", id: String((b && b.id) || ""),
            uid, sig, nowIso, missing: "no-such-document", unreadable: "sends-unreadable",
          });
        }

        /* ★★ ANNOUNCEMENTS SIGN THROUGH THIS SAME ROUTE AND THIS SAME HELPER
           (Matt, Aug 13 2026: "Reuse the write-up acknowledgement mechanism. Do
           not build a second one").
           A parallel ack route would be a second answer to "may this person
           sign this", and the two would drift the first time one of them got a
           fix — which is exactly the history of this route: every signature
           here used to be a whole-map write, so a team member who read a
           document and tapped Acknowledge got "that did not save", a permission
           refusal wearing a network error's clothes, and Sent Documents showed
           0 of N forever. One door, fixed once. */
        if (kind === "announcement") {
          return await ackOneRow(env, {
            key: ANNOUNCE_KEY, id: String((b && b.id) || ""),
            uid, sig, nowIso, missing: "no-such-announcement", unreadable: "record-unreadable",
            /* An announcement that has been withdrawn cannot be signed. The
               screen hides the button; this is the door behind it. */
            refuse: (rec) => (rec && rec.retracted && rec.retracted.at) ? "retracted" : "",
          });
        }

        /* Handbook, leadership handbook and the confidentiality statement.
           ⚠️ NOT write-once, unlike a document. Each is versioned and re-signed
           when a new version ships, and the Confidentiality Statement has a
           "Re-sign" button on screen. Overwriting THEIR OWN row is the
           behaviour those screens already promise. */
        const HB = {
          handbook:    { key: "gcfcr-hr-handbook",    field: "acks" },
          conf:        { key: "gcfcr-hr-handbook",    field: "conf" },
          ldrhandbook: { key: "gcfcr-hr-ldrhandbook", field: "acks" },
        };
        const spec = HB[kind];
        if (!spec) return Response.json({ ok: false, error: "bad-kind" }, { status: 400 });

        const cur = await sbGet(env, spec.key);
        if (!cur || typeof cur !== "object" || Array.isArray(cur)) {
          return Response.json({ ok: false, error: "record-unreadable" }, { status: 503 });
        }
        const rows = cur[spec.field] && typeof cur[spec.field] === "object" && !Array.isArray(cur[spec.field])
          ? cur[spec.field] : {};
        /* The version is read from the STORED record, never from the request —
           otherwise somebody could claim to have signed a version that does not
           exist, or an old one, and the "signed the current version" check on
           screen would believe them. `conf` carries no version. */
        const ver = cur.version && cur.version.n != null ? cur.version.n : 1;
        const row = spec.field === "conf"
          ? { date: todayIso, signature: sig }
          : { version: ver, date: todayIso, signature: sig };
        await sbSet(env, spec.key, { ...cur, [spec.field]: { ...rows, [uid]: row } });
        return Response.json({ ok: true });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 500 });
      }
    }

    /* Who the Hub cannot reach. Same door as the rest of HR and no wider:
       this is a list of team members' addresses, so full readers only. */
    if (url.pathname === "/api/email-blocked" && request.method === "GET") {
      const tok = await readToken(env, request.headers.get("x-hub-token") || url.searchParams.get("t"));
      if (!tok) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
      if (!(await hrFullReader(env, String(tok.u || "")))) {
        return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
      }
      const map = await blockedEmails(env);
      /* ⚠️ ok:false ON A FAILED LOOKUP, not an empty list, and the status stays
         200 so the client can tell this apart from being signed out. The screen
         shows nothing at all in this case rather than a clean bill. */
      if (!map) return Response.json({ ok: false, error: "could not check" });
      return Response.json({ ok: true, blocked: map });
    }

    if (url.pathname === "/api/hr-store") {
      try {
        /* ⚠️ REJECTS WHEN UNSIGNED. Before this, the endpoint answered anyone —
           it moved the door without locking it. Any valid token is accepted
           regardless of tier, DELIBERATELY: App.jsx reads `info` and `evals` to
           build a team member's OWN dashboard, so a tier-3 gate here would
           break every tier-1 device. What this removes is ANONYMOUS access.
           The token carries a server-issued uid, so per-record filtering has
           something trustworthy to filter ON when it gets built.
           ✅ JUL 28 — PER-RECORD FILTERING IS NOW BUILT, below. Any valid token
           is still ACCEPTED; what changed is what it gets back. */
        const tok = await readToken(env, url.searchParams.get("t") || request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        const uid = String(tok.u || "");
        const canAll = await hrFullReader(env, uid);

        if (request.method === "GET") {
          /* ★ BATCHED READ. Routing these keys through the worker added a
             second hop per key, and a tile that reads five of them paid five
             round trips where it used to pay five direct ones — noticeable on
             store iPads over shop wifi. The worker is already connected to
             Supabase, so fetching several keys in one request costs barely more
             than one. `?keys=a,b,c` fetches them in PARALLEL and returns a map.
             ⚠️ Each key is still checked against the allowlist individually —
             batching must not become a way to smuggle an unlisted key in. */
          const many = (url.searchParams.get("keys") || "").split(",").map((x) => x.trim()).filter(Boolean);
          if (many.length) {
            if (many.some((k) => !HR_PROTECTED.includes(k))) {
              return Response.json({ ok: false, error: "not-allowed" }, { status: 403 });
            }
            /* ⚠️ CHECKED PER KEY, so a locked key cannot ride into a batch
               beside an allowed one. */
            if (many.some((k) => hrIdLockRefuses(k, uid))) {
              return Response.json({ ok: false, error: "not-allowed" }, { status: 403 });
            }
            /* Same reason as the id lock above: a key with its own bar cannot
               ride into a batch beside an allowed one. Sequential rather than
               mapped, so the one awaited check only fires on the PTO key. */
            for (const k of many) {
              if (await ptoGateRefuses(env, k, uid, canAll)) {
                return Response.json({ ok: false, error: "not-allowed" }, { status: 403 });
              }
            }
            const vals = await Promise.all(many.map((k) => sbGet(env, k).catch(() => null)));
            const out = {};
            many.forEach((k, i) => {
              const v = vals[i] ?? null;
              out[k] = canAll ? v : hrReadFilter(k, v, uid);
            });
            return Response.json({ ok: true, values: out });
          }
          const k = url.searchParams.get("key") || "";
          if (!HR_PROTECTED.includes(k)) return Response.json({ ok: false, error: "not-allowed" }, { status: 403 });
          if (hrIdLockRefuses(k, uid)) return Response.json({ ok: false, error: "not-allowed" }, { status: 403 });
          if (await ptoGateRefuses(env, k, uid, canAll)) return Response.json({ ok: false, error: "not-allowed" }, { status: 403 });
          const v = (await sbGet(env, k)) ?? null;
          return Response.json({ ok: true, value: canAll ? v : hrReadFilter(k, v, uid) });
        }
        if (request.method === "POST") {
          const b = await request.json();
          const k = String((b && b.key) || "");
          if (!HR_PROTECTED.includes(k)) return Response.json({ ok: false, error: "not-allowed" }, { status: 403 });
          if (hrIdLockRefuses(k, uid)) return Response.json({ ok: false, error: "not-allowed" }, { status: 403 });
          /* ★ WRITES TOO, not only reads. Matt, scoping this Aug 13: "yes to
             locking writes." Without it a rank-5 Director could not read the
             ledger but could still POST one over the top of it, and the merge
             path below would not save them from it — PTO is not on
             HR_OWN_ROW_ONLY, so a write here replaces the whole ledger. */
          if (await ptoGateRefuses(env, k, uid, canAll)) return Response.json({ ok: false, error: "not-allowed" }, { status: 403 });
          /* ⚠️ NO WRITE PATH TO PINS THROUGH THIS ROUTE, for anyone, full
             reader or not. See HR_NEVER_WRITE_HERE. /api/pin-set is the only
             door, and it hashes and enforces uniqueness. */
          if (HR_NEVER_WRITE_HERE.includes(k)) {
            return Response.json({ ok: false, error: "use-pin-set" }, { status: 403 });
          }

          /* ★★ FILTERING READS WITHOUT MERGING WRITES DESTROYS DATA, AND THIS
             IS THE HALF THAT IS EASY TO FORGET. A non-full-reader now receives
             a one-row map. The client has no idea it was filtered — it edits
             that object and POSTs THE WHOLE THING back, exactly as it always
             has. Written straight through, that replaces 106 rows with 1.
             So a non-full-reader's write is MERGED into the stored value and
             touches nothing but their own row. Same family as the fallback
             that silently swallowed a failure and lost a document record.

             ⚠️ A missing own-row is a NO-OP, never a delete. The client may
             legitimately hold a map with no entry for itself (nothing on file
             yet), and reading that as "remove me" would delete real records on
             an ordinary save. Deletion stays a full-reader action. */
          /* ⚠️ THE READ FILTER MUST NOT BECOME A WRITE PATH. A non-full-reader
             now receives a one-row map for these keys, and the client cannot
             tell it was filtered — it edits that object and POSTs the whole
             thing back. Without this, the merge below would accept it and a
             leader could file-and-forget their own demerits away. Filtered on
             read, refused on write, and HR keeps writing through the whole-map
             door below because they are a full reader. */
          if (!canAll && HR_OWN_ROW_READ_ONLY.includes(k)) {
            return Response.json({ ok: false, error: "not-allowed — HR files this record" }, { status: 403 });
          }
          if (!canAll && HR_OWN_ROW_ONLY.includes(k)) {
            const storedRaw = await sbGetStrict(env, k);
            const base = storedRaw && typeof storedRaw === "object" && !Array.isArray(storedRaw) ? storedRaw : {};
            const incoming = b.value && typeof b.value === "object" && !Array.isArray(b.value) ? b.value : {};
            if (Object.prototype.hasOwnProperty.call(incoming, uid)) {
              base[uid] = incoming[uid];
              await sbSet(env, k, base);
            }
            return Response.json({ ok: true, merged: true });
          }

          /* ★★ ONE-ROW MERGE FOR ID-KEYED MAPS A FULL READER OWNS.
             THIS IS A LOST-UPDATE FIX, NOT A PERMISSION FIX — different problem
             from the own-row merge above, which is about what someone may SEE.

             🐛 Evelyn's documentation vanished (id 70, reported Jul 29 2026).
             `gcfcr-hr-files` is one map holding every person's file. Filing a
             document did a read-modify-write of THE WHOLE MAP and posted it
             back, so the stored value was simply replaced. Two leaders filing
             within a few minutes of each other each sent their own snapshot,
             and the second one landed on top — silently deleting the first
             one's entry. Both writes SUCCEEDED. There was no error to report,
             which is why "make failures loud" alone would not have saved it.
             Signature in the data: the map was last written Jul 28 16:24 while
             the newest entry inside it was dated Jul 26. A write that added
             nothing.

             ⇒ When the client says WHICH member it touched, take only that
             member's row from the payload and drop it onto the CURRENT stored
             map, server-side. Concurrent filings on different people can no
             longer collide at all, and the window for two people editing the
             SAME person shrinks to the length of one request.

             ⚠️ WHITELISTED BY KEY, NOT TRUSTED FROM THE BODY. `member` only
             means something for a map shaped { "<rosterId>": ... }; honouring
             it on any other key would invent a row in a structure that has
             none.
             ⚠️ A MISSING ROW IN THE PAYLOAD IS AN ERROR, NOT A DELETE. If the
             client names a member and then does not include them, that is a
             bug on the client, and guessing "they meant to remove it" is how a
             file gets erased. Refuse and say so. Deleting a whole person's file
             stays a full-map write, which is deliberate and rare.
             ⚠️ Do NOT extend this to `gcfcr-hr-evals` without checking its
             callers — HRConsole writes eval rows in shapes this does not
             model. */
          /* ✅ gcfcr-hr-evals ADDED Jul 29 2026, AFTER checking its callers.
             The note here used to say "do NOT extend this to gcfcr-hr-evals
             without checking its callers". Checked: all four writers in
             HRConsole (addEval, editEval, removeEval, and the approve step)
             write `{...p, [id]: [...]}` — one member's row, exactly the shape
             this models.

             It matters because evaluations carry the SAME whole-map write that
             lost Evelyn's documentation. Two leaders approving evaluations
             minutes apart would silently erase each other, and an evaluation is
             harder to notice missing than a document: nobody looks for it until
             the next review, and s6 on the L10 scorecard reads
             "evals on time" off this key, so losing one moves a company metric
             in the direction that looks good. */
          /* ✅ gcfcr-hr-docfiles-v1 ADDED Jul 30 2026, AFTER checking its
             callers. All six writers in HRConsole (fileIntake, addDoc,
             approveDoc, rejectDoc, retypeDoc, removeDoc) write
             `{...p, [id]: [...]}` — one member's row, exactly the shape this
             models. The periodic loadAll refresh only touches local state
             (setLocal), never KV, so it is not a writer.

             This key holds the uploaded-scan records (doctor's notes, IDs,
             signed forms). Same whole-map write that lost Evelyn's
             documentation on gcfcr-hr-files: two leaders filing documents
             minutes apart each sent their own snapshot and the second one
             landed on top. Worse here than a plain file entry — the record is
             the ONLY pointer to the binary in the private bucket, so a
             clobbered row orphans a real uploaded document with nothing left
             pointing at it. */
          const MEMBER_ROW_MERGE = ["gcfcr-hr-files", "gcfcr-hr-evals", "gcfcr-hr-docfiles-v1"];
          if (MEMBER_ROW_MERGE.includes(k) && b && b.member != null && b.member !== "") {
            const mid = String(b.member);
            const incoming = b.value && typeof b.value === "object" && !Array.isArray(b.value) ? b.value : {};
            if (!Object.prototype.hasOwnProperty.call(incoming, mid)) {
              return Response.json({ ok: false, error: "member-row-missing" }, { status: 400 });
            }
            const storedRaw = await sbGetStrict(env, k);
            const base = storedRaw && typeof storedRaw === "object" && !Array.isArray(storedRaw) ? storedRaw : {};
            base[mid] = incoming[mid];
            await sbSet(env, k, base);
            return Response.json({ ok: true, merged: "member-row", member: mid });
          }

          /* ★★ AN ASSIGNEE MAY SAVE THEIR OWN EVALUATION. Brandon, Aug 13 2026,
             finishing an evaluation due that day: "That did not save."
             🐛 THE TWO GATES WERE BUILT FROM OPPOSITE RULES, which is the same
             fault the Aug 7 sweep found on gcfcr-hr-leadership-v1 — fixed there,
             never fixed here. The SCREEN is deliberately for rank 4 and up, and
             HRConsole.jsx says why in as many words: "an Assistant Director is
             rank 4 and never sees that row, but they're exactly who Bri assigns
             evaluations to". The SERVER asked for full HR access, which is the
             five people on HR_CONSOLE_PEOPLE. Brandon is a Director and is not
             one of the five, so the Hub invited him to do the work and then
             refused to keep it. Live data at the time: 7 open tasks, 6 Bri's
             (she is on the list, hers saved), 1 his, due that day, still `open`.

             ⚠️ THE FIX IS THE SERVER, NOT HIS ACCESS. Adding him to
             HR_CONSOLE_PEOPLE would hand him all ~106 personnel files to solve
             one evaluation. The door that needed widening is this one.

             ⚠️⚠️ AN ARRAY, SO IT CANNOT USE MEMBER_ROW_MERGE ABOVE. That path
             assumes { "<rosterId>": data } and indexes by key. This key stores a
             LIST of tasks and the owner is a FIELD on each one, so the merge has
             to be by `assigneeId` and has to be done element by element.

             ⚠️ THE SERVER RE-READS AND RE-MERGES, never trusting the posted
             array. The caller's copy is stale the moment Bri assigns anything,
             and a wholesale write from a leader's phone would drop her new rows.
             Only tasks whose stored assigneeId is the CALLER'S are allowed to
             change; every other task is taken from storage untouched.

             ⚠️ TWO TRANSITIONS ONLY: open|returned → submitted, and
             open|returned → recommended. A non-full-reader cannot create a task,
             delete one, approve their own recommendation (that is Bri or
             Hannah's, and approveRec reassigns), reopen a submitted one, or
             touch the assignee fields. Anything else falls through to the
             full-HR gate below and is refused exactly as it was.

             ⚠️ FULL READERS ARE UNAFFECTED and skip this entirely — `canAll`
             short-circuits to the wholesale write, so Bri and Hannah's screens
             behave exactly as they did. This only adds a door that was missing. */
          if (!canAll && k === "gcfcr-hr-evaltasks-v1") {
            const incoming = Array.isArray(b && b.value) ? b.value : null;
            if (!incoming) {
              return Response.json({ ok: false, error: "evaltasks-shape" }, { status: 400 });
            }
            const storedRaw = await sbGet(env, k);
            const stored = Array.isArray(storedRaw) ? storedRaw : [];
            const byId = new Map(stored.map((t) => [String(t && t.id), t]));
            if (incoming.length !== stored.length) {
              return Response.json({ ok: false, error: "not-allowed — cannot add or remove tasks" }, { status: 403 });
            }
            const OK_FROM = ["open", "returned"];
            const OK_TO = ["submitted", "recommended"];
            const merged = [];
            for (const t of stored) {
              const id = String(t && t.id);
              const inc = byId.has(id) ? incoming.find((x) => String(x && x.id) === id) : null;
              if (!inc) {
                return Response.json({ ok: false, error: "not-allowed — task set does not match" }, { status: 403 });
              }
              /* Not this person's task: storage wins, whatever they sent. */
              if (String(t.assigneeId) !== uid) { merged.push(t); continue; }
              const same = String(inc.status) === String(t.status);
              if (same) { merged.push(t); continue; }
              if (!OK_FROM.includes(String(t.status)) || !OK_TO.includes(String(inc.status))) {
                return Response.json({ ok: false, error: "not-allowed — that status change needs HR" }, { status: 403 });
              }
              /* The owner of a task never changes on this path. Re-assignment is
                 approveRec, and that is a full-HR action. */
              if (String(inc.assigneeId) !== String(t.assigneeId)) {
                return Response.json({ ok: false, error: "not-allowed — cannot reassign" }, { status: 403 });
              }
              merged.push({ ...t, ...inc, assigneeId: t.assigneeId, assigneeName: t.assigneeName });
            }
            await sbSet(env, k, merged);
            return Response.json({ ok: true, merged: "own-eval-task", uid });
          }

          /* ★★ THE WHOLESALE REPLACE NEEDS AUTHORISATION, NOT JUST A SESSION.
             🐛 Found Aug 3 2026. Everything above this line checks WHO you are
             and never WHAT YOU MAY DO. `canAll` was consulted exactly once, at
             the HR_OWN_ROW_ONLY branch — six keys. HR_PROTECTED has fourteen.
             The other eight fell straight through to this line, which replaces
             the stored value outright, on the SERVICE key, and answers ok.
             So any of ~106 people holding a valid token — or anyone on a shared
             iPad that is still signed in — could POST
             {"key":"gcfcr-hr-team-v1","value":[]} and erase all 106 members
             with their emails, roles, start dates and status. Nothing in the
             browser writes that key, so nothing would ever put it back.
             The read path deliberately accepts a tier-1 token (a team member's
             own dashboard is built through this door), which is exactly why
             identity alone was never enough here.

             ⚠️ THIS BREAKS NOBODY, and that was checked rather than assumed.
             Every legitimate non-full-reader write already returns above:
             HR_OWN_ROW_ONLY keys take the own-row merge, and App.jsx and
             NewHireOrientation both pass `member`, so their `gcfcr-hr-files`
             writes take the member-row merge. HR Console itself is reachable
             by exactly five people (HR_CONSOLE_PEOPLE) and all five score at
             or above HR_FULL_READ_MIN — Bri 6, Hannah 7, Matt 7, Nick 8, and
             Cindy 7 via the Accounts Payable override. So every caller that
             reaches this line legitimately is already a full reader. */
          if (!canAll) {
            return Response.json(
              { ok: false, error: "not-allowed — full HR access required for a whole-map write" },
              { status: 403 },
            );
          }

          await sbSet(env, k, b.value);
          return Response.json({ ok: true });
        }
        return Response.json({ ok: false, error: "method" }, { status: 405 });
      } catch (e) {
        return Response.json({ ok: false, error: "server" }, { status: 500 });
      }
    }

    /* ═══ STORAGE PROXY ════════════════════════════════════════════════
       Every PRIVATE bucket carried `anon` SELECT + INSERT + **DELETE** with no
       path restriction, so the key inside the browser bundle could list,
       download and DESTROY every HR document, cash-audit receipt and piece of
       L101 coursework in the store. Deletion is the sharp edge — the kv_store
       hole was disclosure; this one loses the files.

       ★ THE SPLIT IS READ/DELETE vs WRITE, not "lock the bucket". Uploads
       genuinely happen without a login — `gate-city-onboarding.html` is a
       public page and trainer photo proof is submitted from the floor — so
       anon KEEPS INSERT. Viewing and deleting only ever happen inside HR
       Console, i.e. a signed-in director, so those move here and the SELECT and
       DELETE policies can then be dropped.

       Signed URLs are issued with the SERVICE key, so they keep working after
       the anon SELECT policy is gone. */
    /* ⚠️ ADDING A BUCKET HERE IS NOT OPTIONAL — IT IS WHAT MAKES IT READABLE.
       `food-safety-photos` was created Jul 28 with anon INSERT and nothing else
       (correct: uploading happens on the floor with no login, reading does not).
       That means the ONLY way to view one of those photos is this proxy, and a
       bucket missing from this list is refused `not-allowed` — while the direct
       anon fallback in `signedDocUrl` also fails, because `createSignedUrl`
       needs SELECT. The photos upload perfectly and can never be opened.
       Exactly the write-only trap flagged for `Receipts` in July. */
    /* ⚠️ MUST COVER EVERY BUCKET UPLOAD_BUCKETS ACCEPTS, or a file uploads
       successfully and can never be viewed. `hub-assets` was missing: Bri
       attached an image to a team goal, the button said "Replace image", the
       goal saved, and the picture showed as nothing for her and all 106
       viewers — including on older goals that used to work. */
    const STORAGE_BUCKETS = ["hr-files", "Receipts", "l101-coursework", "trainer-task-photos", "food-safety-photos", "hub-assets"];

    if (url.pathname === "/api/doc-url" && request.method === "GET") {
      try {
        const docTok = await readToken(env, url.searchParams.get("t") || request.headers.get("x-hub-token"));
        if (!docTok) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        const bucket = url.searchParams.get("bucket") || "";
        const path = url.searchParams.get("path") || "";
        /* ⚠️ `..` IS REJECTED BEFORE THE OWNER CHECK, NOT AFTER. The owner rule
           below compares only the FIRST path segment to the signed-in id, and
           the path is then rebuilt with encodeURIComponent — which leaves dots
           untouched, because they are unreserved. So `70/../71/private.pdf`
           passed as user 70 and resolved to 71's document. /api/upload has
           rejected `..` since it was written; these two routes never did. */
        if (!STORAGE_BUCKETS.includes(bucket) || !path || path.includes("..")) {
          return Response.json({ ok: false, error: "not-allowed" }, { status: 403 });
        }

        /* ★ THE DOCUMENTS THEMSELVES, SCOPED TO THEIR OWNER. Until now any
           signed-in person could mint a handle for ANY path in hr-files, which
           is every uploaded ID, work authorisation, doctor's note and signed
           form in the store — they only had to know the path.

           HRConsole writes these as `<rosterId>/<timestamp>-<filename>`
           (addDoc), so the first path segment IS the owner and no lookup is
           needed. A non-full-reader may open only their own.

           ⚠️ SCOPED TO hr-files ONLY. Receipts, l101-coursework and
           trainer-task-photos do not use an owner-first path, and inventing one
           for them here would refuse every legitimate open. Separate job,
           separate shape. */
        if (bucket === "hr-files") {
          const docUid = String(docTok.u || "");
          /* 🐛 SHARED APPLICATION DOCUMENTS WERE CAUGHT BY THE OWNER RULE
             (Bri, Jul 29 2026: "I have an uploaded file for the leadership
             handbook on the team trainer application that are not opening for
             my applicants").

             The owner rule reads the FIRST PATH SEGMENT as a roster id, which
             is right for everything HRConsole writes. Professional Growth
             writes something different: a document Bri publishes TO applicants
             lands at `pg-eoi/<role>/<file>`. "pg-eoi" is nobody's roster id, so
             every applicant got 403 "not-yours" — and Bri never saw it, because
             she is a full reader and full readers skip the check entirely. A
             permission bug that is invisible to the only person who can report
             it is the worst kind.

             ⚠️ THIS PREFIX IS PUBLISHED MATERIAL BY DEFINITION. A handbook or
             a form attached to an application step exists to be handed to the
             applicant. Any signed-in person may open it — that is the whole
             purpose of uploading it. It is NOT a hole in the owner rule; it is
             a different kind of file that was living in the same bucket.
             ⚠️ ONE PREFIX, NOT A PATTERN. Do not widen this to "anything not
             shaped like a roster id" — that would open every path a typo could
             produce. A new shared prefix should be a deliberate line here. */
          const SHARED_DOC_PREFIXES = ["pg-eoi/"];
          const isShared = SHARED_DOC_PREFIXES.some((pre) => String(path).startsWith(pre));
          if (!isShared && !(await hrFullReader(env, docUid))) {
            if (!docUid || String(path).split("/")[0] !== docUid) {
              return Response.json({ ok: false, error: "not-yours" }, { status: 403 });
            }
          }
        }
        /* ⚠️ Expiry is capped, not taken from the caller. A signed URL is a
           bearer token for that file — it works for anyone who has it, with no
           further auth — so a long one is a link that outlives the reason it
           was made. 300s matches what the client always asked for. */
        const expiresIn = Math.min(Number(url.searchParams.get("expires")) || 300, 900);
        const r = await fetch(
          `${env.SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`,
          {
            method: "POST",
            headers: {
              apikey: env.SUPABASE_SERVICE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ expiresIn }),
          }
        );
        if (!r.ok) {
          /* ⚠️ SAY WHAT SUPABASE SAID. Returning a bare "sign-failed" is what
             turned three debugging rounds into guesswork — the anon fallback
             hid the failure, and when it was removed all anyone saw was a
             generic alert. The status and body are the answer. */
          const detail = await r.text().catch(() => "");
          return Response.json(
            { ok: false, error: "sign-failed", status: r.status, detail: detail.slice(0, 300) },
            { status: 502 }
          );
        }
        const j = await r.json();
        /* ⚠️ THE FIELD NAME AND THE PREFIX BOTH VARY BY STORAGE VERSION —
           `signedURL` on older builds, `signedUrl` on newer, and the value is
           sometimes already absolute, sometimes rooted at /storage/v1, and
           sometimes rooted below it. Guessing produced a URL that looked fine
           and 404'd, which the anon fallback then hid completely. Handle every
           shape instead of picking one. */
        const raw = (j && (j.signedURL || j.signedUrl)) || null;
        void raw; // kept only as a liveness check on the sign call
        if (!raw) return Response.json({ ok: false, error: "sign-failed", got: Object.keys(j || {}) }, { status: 502 });
        /* ★ THE SUPABASE SIGNED URL IS NO LONGER HANDED TO THE BROWSER.
           A signed URL is a BEARER TOKEN: for its lifetime it opens the file
           for anyone holding it, with no login. Screenshot it into Slack and
           that person can read the document; it also lands in the history of a
           shared iPad. Instead we mint a handle scoped to THIS ONE FILE for
           five minutes and stream the bytes back through the worker, so the
           address bar stays on gatecityhub.com and nothing shareable exists.

           ⚠️ The handle deliberately does NOT carry the session token — putting
           that in a URL would trade a five-minute file link for a twelve-hour
           key to everything. */
        /* ⚠️ THIS WAS A SECOND COPY OF THE SIGNING SCHEME, inline, next to a
           helper written specifically to stop that happening. Now the one
           mint. */
        const handle = await docHandle(env, bucket, path, expiresIn);
        if (!handle) return Response.json({ ok: false, error: "not-allowed" }, { status: 403 });
        return Response.json({ ok: true, url: `${url.origin}/api/doc-view?h=${encodeURIComponent(handle)}` });
      } catch (e) {
        return Response.json({ ok: false, error: "server" }, { status: 500 });
      }
    }

    /* Streams one file. No session token needed — the handle IS the
       authority, it is scoped to a single bucket+path, and it expires. */
    if (url.pathname === "/api/doc-view" && request.method === "GET") {
      try {
        /* ⚠️ ONE VERIFIER, shared with the 5am sweep's self-test. The rules
           used to live inline right here, which meant nothing could test them
           except a copy. A 401 covers a bad signature, a malformed payload AND
           an expiry beyond the ceiling, all identically, so a prober learns
           nothing about which one it was. */
        const claim = await readDocHandle(env, url.searchParams.get("h") || "");
        if (claim === "expired") {
          return new Response("This link has expired. Open the document again.", { status: 410 });
        }
        if (!claim) return new Response("Not authorized", { status: 401 });
        if (!STORAGE_BUCKETS.includes(claim.b)) return new Response("Not authorized", { status: 403 });

        /* ⚠️ WITHOUT A CHROME BAR THE PERSON IS TRAPPED. Handing back a
           Supabase URL used to open an in-app browser with a back button
           because it was CROSS-ORIGIN. Now that the link is same-origin, the
           installed PWA opens it in-scope with no chrome at all and there is no
           way out. So the default response is a tiny viewer that owns its own
           Close control; `raw=1` returns the bytes it embeds. */
        /* ★ NAVIGATION GETS THE VIEWER, AN EMBED GETS THE BYTES.
           HR Console OPENS this link in a tab, so it needs a Close bar or the
           person is trapped. Cash Audit and L101 put the same URL straight into
           an <img>/<iframe> inside their own modal — and an <img> pointed at
           HTML renders as a broken-image icon, which is exactly what happened
           to the receipts viewer. `Sec-Fetch-Dest` already tells us which is
           which, so neither caller has to change. */
        const dest = request.headers.get("sec-fetch-dest") || "";
        const wantsViewer = url.searchParams.get("raw") !== "1"
          && (dest === "document" || dest === "iframe" || dest === "");
        if (wantsViewer) {
          const src = `/api/doc-view?raw=1&h=${encodeURIComponent(url.searchParams.get("h") || "")}`;
          const isPdf = /\.pdf$/i.test(String(claim.p || ""));
          return new Response(
            `<!doctype html><meta charset="utf-8">` +
            `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
            `<title>Document</title>` +
            `<style>html,body{margin:0;height:100%;background:#0F172A;font:15px -apple-system,system-ui,sans-serif}` +
            `header{position:fixed;top:0;left:0;right:0;padding:calc(env(safe-area-inset-top) + 10px) 14px 10px;` +
            `background:#13293F;color:#fff;display:flex;align-items:center;gap:12px;z-index:2}` +
            `button{font:inherit;font-weight:700;background:#fff;color:#13293F;border:0;border-radius:8px;padding:8px 14px}` +
            `main{position:absolute;inset:0;padding-top:calc(env(safe-area-inset-top) + 52px);display:flex}` +
            `img{margin:auto;max-width:100%;max-height:100%;object-fit:contain}` +
            `iframe{border:0;width:100%;height:100%}</style>` +
            `<header><button onclick="history.length>1?history.back():window.close()">\u2190 Close</button>` +
            `<span style="color:#fff;opacity:.85">Document</span></header>` +
            `<main>${isPdf ? `<iframe src="${src}"></iframe>` : `<img src="${src}" alt="Document">`}</main>`,
            { status: 200, headers: { "content-type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } }
          );
        }
        const r = await fetch(
          `${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(claim.b)}/${String(claim.p).split("/").map(encodeURIComponent).join("/")}`,
          { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
        );
        if (!r.ok) return new Response("Couldn't load that document.", { status: 502 });
        const h = new Headers();
        /* ★★ NEVER SERVE A CALLER-CHOSEN CONTENT TYPE INLINE ON THIS ORIGIN.
           🐛 Aug 2 2026. This echoed back whatever content type the uploader
           declared, with `inline` and no nosniff, from gatecityhub.com — the
           same origin that holds `gcfcr-hub-token` in localStorage. Upload a
           file declaring `text/html`, get an intake row pointing at it, and
           the moment an HR reader clicks View, that HTML runs as the Hub and
           can read the session token. Both upload routes pass the caller's
           type straight through, and /api/intake-upload needs no sign-in at
           all, so this was reachable by anyone.
           ⚠️ FIXED HERE, AT THE SERVE, ON PURPOSE. It is the one choke point
           every bucket and both upload routes pass through, so it holds even
           for the files already sitting in storage. The upload allowlist is
           belt and braces; this is the belt.
           ⚠️ Anything not on the list is served as a download, never rendered.
           `nosniff` then stops the browser second-guessing the type. */
        const SAFE_INLINE = [
          "image/jpeg", "image/png", "image/gif", "image/webp",
          "image/heic", "image/heif", "application/pdf",
        ];
        const stored = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
        const safe = SAFE_INLINE.includes(stored);
        h.set("Content-Type", safe ? stored : "application/octet-stream");
        // inline so it opens in the tab rather than downloading to Files
        h.set("Content-Disposition", safe ? "inline" : "attachment");
        h.set("X-Content-Type-Options", "nosniff");
        h.set("Cache-Control", "private, no-store");
        return new Response(r.body, { status: 200, headers: h });
      } catch (e) {
        return new Response("Couldn't load that document.", { status: 500 });
      }
    }

    if (url.pathname === "/api/doc-delete" && request.method === "POST") {
      try {
        const dtok = await readToken(env, request.headers.get("x-hub-token"));
        if (!dtok) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        const b = await request.json();
        const bucket = String((b && b.bucket) || "");
        const path = String((b && b.path) || "");
        /* ⚠️ Same `..` rejection as /api/doc-url, and it matters more here:
           this route DELETES. Without it the first-segment owner check below
           could be walked past — `70/../71/doc.pdf` reads as user 70 and
           resolves to 71's file — so any tier-1 team member with a valid
           session could destroy someone else's HR document. */
        if (!STORAGE_BUCKETS.includes(bucket) || !path || path.includes("..")) {
          return Response.json({ ok: false, error: "not-allowed" }, { status: 403 });
        }
        /* ★★ THE OWNER RULE, ADDED Jul 31 2026. Its sibling /api/doc-url has
           had this since the bucket was locked down; DELETE never got it. So
           this route checked only that you were signed in — ANY of the 106,
           at any tier, could permanently destroy ANY file in ANY bucket,
           including another person's HR documents, by posting a path.
           Deliberately STRICTER than doc-url: no shared-prefix exemption.
           `pg-eoi/` handbooks are readable by everyone by design, but nothing
           makes them DELETABLE by everyone — read and destroy are not the same
           permission and the asymmetry is on purpose.
           ⚠️ Same first-path-segment convention doc-url documents: HR uploads
           are written as `<rosterId>/<filename>`, so segment one IS the owner
           and no lookup is needed. Full HR readers (the five-person list) keep
           the reject-a-document path working. */
        if (bucket === "hr-files") {
          const duid = dtok.u ? String(dtok.u) : "";
          if (!(await hrFullReader(env, duid))) {
            if (!duid || String(path).split("/")[0] !== duid) {
              return Response.json({ ok: false, error: "not-yours" }, { status: 403 });
            }
          }
        }
        const r = await fetch(
          `${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`,
          {
            method: "DELETE",
            headers: {
              apikey: env.SUPABASE_SERVICE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            },
          }
        );
        return Response.json({ ok: r.ok });
      } catch (e) {
        return Response.json({ ok: false, error: "server" }, { status: 500 });
      }
    }

    /* ═══ YOUR OWN PHOTO ═══════════════════════════════════════════════
       Matt, Aug 3 2026: "slack is priority but add the upload photo option. it
       will encourage the team to use."

       The board and HR Console have only ever had one source of faces: Slack
       profile photos, cached into hr:slack-avatars:v1. Measured before
       building this — 62 of 99 Slack accounts have a photo, so 37 people show
       as initials on every screen and can do nothing about it from inside the
       Hub. This is the something they can do.

       ⚠️ SLACK STILL WINS ON DISPLAY, which is Matt's call and worth stating
       because it is the surprising half: a Slack photo is the picture the
       person already chose and keeps current, so it stays first. This fills
       the gap for people who have none. To flip it, swap the two sides of the
       merge in the two readers — nothing here needs to change.

       ⚠️ THE MAP IS WRITTEN HERE, NOT BY THE BROWSER, and that is the whole
       reason this route exists. hr:photos:v1 is one shared object; a client
       doing read-modify-write on it could drop or overwrite anyone else's
       entry, deliberately or by racing another save. The Worker writes ONLY
       the caller's own key, resolved from their token — a person cannot set
       somebody else's face. */
    if (url.pathname === "/api/my-photo" && request.method === "POST") {
      const tok = await readToken(env, request.headers.get("x-hub-token"));
      if (!tok) return Response.json({ ok: false, error: "signed out" }, { status: 401, headers: { "cache-control": "no-store" } });
      try {
        /* ROSTER, not the five-person HR Console list — see rosterNameForUid. */
        const myName = await rosterNameForUid(env, String(tok.u));
        if (!myName) return Response.json({ ok: false, error: "no roster name for this sign-in" }, { status: 400, headers: { "cache-control": "no-store" } });
        const b = await request.json().catch(() => null);
        const bucket = String((b && b.bucket) || "").trim();
        const path = String((b && b.path) || "").trim();
        const clear = b && b.clear === true;

        const all = (await sbGet(env, HR_PHOTOS_KEY).catch(() => null)) || {};
        const map = (all && typeof all === "object" && !Array.isArray(all)) ? { ...all } : {};
        const key = normName(myName);

        if (clear) {
          delete map[key];
        } else {
          if (!bucket || !path) return Response.json({ ok: false, error: "bucket and path are required" }, { status: 400, headers: { "cache-control": "no-store" } });
          /* Only the bucket this Worker already serves, and only under the
             photos/ prefix. Without this a caller could point their entry at
             any object in any bucket and have the Worker sign it for them —
             turning a profile picture into a way to read someone's HR file. */
          if (bucket !== HR_BUCKET) return Response.json({ ok: false, error: "wrong bucket" }, { status: 400, headers: { "cache-control": "no-store" } });
          if (!path.startsWith("photos/") || path.includes("..")) return Response.json({ ok: false, error: "bad path" }, { status: 400, headers: { "cache-control": "no-store" } });
          map[key] = { bucket, path, at: new Date().toISOString(), by: myName };
        }
        const ok = await sbSet(env, HR_PHOTOS_KEY, map);
        if (ok === false) return Response.json({ ok: false, error: "did not save" }, { status: 500, headers: { "cache-control": "no-store" } });
        return Response.json({ ok: true, name: myName, cleared: !!clear }, { headers: { "cache-control": "no-store" } });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 500, headers: { "cache-control": "no-store" } });
      }
    }

    /* Every Hub photo, already signed, in ONE request.
       ⚠️ SIGNED HERE RATHER THAN PER PICTURE IN THE BROWSER. The board draws
       up to forty faces at once; forty separate signing calls on a store iPad
       over shop wifi is the difference between a board that opens and one that
       looks broken. Handles are gatecityhub.com/api/doc-view, never a provider
       URL — same rule as every other document in the Hub. */
    if (url.pathname === "/api/hub-photos" && request.method === "GET") {
      const tok = await readToken(env, request.headers.get("x-hub-token"));
      if (!tok) return Response.json({ ok: false, error: "signed out" }, { status: 401, headers: { "cache-control": "no-store" } });
      try {
        const all = (await sbGet(env, HR_PHOTOS_KEY).catch(() => null)) || {};
        const byName = {};
        for (const k of Object.keys(all)) {
          const rec = all[k];
          if (!rec || !rec.bucket || !rec.path) continue;
          try {
            const handle = await signedHandle(env, rec.bucket, rec.path);
            if (handle) byName[k] = handle;
          } catch { /* one bad row must not empty the whole map */ }
        }
        return Response.json({ ok: true, byName }, { headers: { "cache-control": "no-store" } });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 500, headers: { "cache-control": "no-store" } });
      }
    }

    /* ═══ TRANSLATE A CLASS ════════════════════════════════════════════
       Bri, Aug 3 2026: an English/Spanish toggle on Leadership 101 and Trainer
       Orientation covering every week and all Prep Work, that "would be kind of
       a living function so as I update the classes or make changes, I would not
       have to constantly re-update the Spanish version." Matt approved it.

       ★ A STORED SPANISH COPY CANNOT MEET THAT AND WAS NEVER AN OPTION. It goes
       stale the first time she edits a sentence, and a class that quietly
       disagrees with itself in two languages is worse than one language.

       ★ SO IT IS KEYED ON THE ENGLISH ITSELF. The strings are hashed and the
       translation cached under that hash. Unchanged text is free forever; the
       first open after Bri edits a word pays for one translation and every open
       after that is free again. No re-translation per view, and nothing for her
       to remember to update. ANTHROPIC_API_KEY is already configured for the
       daily digest, so this adds no new provider, secret or bill.

       ⚠️ A FLAT ARRAY OF STRINGS GOES OUT AND A FLAT ARRAY COMES BACK. The
       course JSON is never handed to the model. Ids, types and the section
       structure are what student progress is keyed on, and a model that
       "helpfully" tidied one field name would detach every answer anyone has
       saved. The client puts the strings back where they came from.

       ⚠️ A COUNT MISMATCH IS A HARD FAILURE. If the reply does not hold exactly
       as many strings as were sent they cannot be put back in the right places,
       and returning them shifted by one would produce a class where every
       answer sits under the wrong question. */
    if (url.pathname === "/api/translate" && request.method === "POST") {
      const tok = await readToken(env, request.headers.get("x-hub-token"));
      if (!tok) return Response.json({ ok: false, error: "signed out" }, { status: 401, headers: { "cache-control": "no-store" } });
      if (!env.ANTHROPIC_API_KEY) {
        return Response.json({ ok: false, error: "translation is not configured" }, { status: 500, headers: { "cache-control": "no-store" } });
      }
      try {
        const b = await request.json().catch(() => null);
        const texts = Array.isArray(b && b.texts) ? b.texts.map((t) => String(t == null ? "" : t)) : null;
        const lang = String((b && b.lang) || "es");
        if (!texts || !texts.length) return Response.json({ ok: false, error: "texts is required" }, { status: 400, headers: { "cache-control": "no-store" } });
        if (texts.length > 400) return Response.json({ ok: false, error: "too many strings in one request" }, { status: 400, headers: { "cache-control": "no-store" } });
        if (lang !== "es") return Response.json({ ok: false, error: "only Spanish is supported" }, { status: 400, headers: { "cache-control": "no-store" } });

        const joined = JSON.stringify(texts);
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(lang + " " + joined));
        const hash = [...new Uint8Array(digest)].slice(0, 16).map((x) => x.toString(16).padStart(2, "0")).join("");
        const cacheKey = `l101:tr:${lang}:${hash}`;

        const hit = await sbGet(env, cacheKey).catch(() => null);
        if (Array.isArray(hit) && hit.length === texts.length) {
          return Response.json({ ok: true, cached: true, texts: hit }, { headers: { "cache-control": "no-store" } });
        }

        const system = [
          "You translate Chick-fil-A restaurant training material from English into Latin American Spanish.",
          "You are given a JSON array of strings. Return ONLY a JSON array of the same length, in the same order, with each string translated.",
          "Rules:",
          "- Keep the SAME number of items. Never merge, split, add or drop one. An empty string stays an empty string.",
          "- Preserve line breaks, bullet characters, numbers, times and temperatures exactly.",
          `- Do NOT translate proper nouns: Chick-fil-A, ${STORE.name}, Leadership 101, people's names, or station names such as Drive Thru.`,
          "- Food safety terms must stay precise. Where a term has an established Spanish equivalent used in restaurants, use it.",
          "- Match the register of the original: plain, direct, spoken to a team member, using tu rather than usted.",
          "- Return the raw JSON array and nothing else. No prose, no code fence.",
        ].join("\n");

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            /* ⚠️ THE SAME MODEL THE DIGEST USES, IMPORTED NOT RETYPED.
               🐛 Bri, Aug 3 2026: "the Spanish buttons are not translating my
               pages." I had typed a model string from memory instead of taking
               the one this Hub already runs on. Anthropic rejects an unknown
               model, the route threw, and the class fell back to English with a
               failure notice — which looked to her like the feature simply did
               not work. One constant now, so a model change moves both. */
            model: CLAUDE_MODEL,
            max_tokens: 8000,
            system,
            messages: [{ role: "user", content: joined }],
          }),
        });
        if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const data = await res.json();
        /* ⚠️ A TRUNCATED REPLY IS REFUSED, NOT SALVAGED. stop_reason is the only
           direct signal the model ran out of room, and a half-finished array
           parses fine while being wrong — the exact failure that cached a
           cut-off digest and posted it to the whole store on Jul 27. */
        if (data.stop_reason === "max_tokens") throw new Error("translation was cut off");
        const raw = (data.content || []).filter((x) => x.type === "text").map((x) => x.text).join("").trim();
        let outTexts = null;
        try { outTexts = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { outTexts = null; }
        if (!Array.isArray(outTexts) || outTexts.length !== texts.length) {
          throw new Error(`translation returned ${Array.isArray(outTexts) ? outTexts.length : "no"} strings for ${texts.length} sent`);
        }
        const clean = outTexts.map((t, i) => (typeof t === "string" ? t : texts[i]));
        await sbSet(env, cacheKey, clean).catch(() => {});
        return Response.json({ ok: true, cached: false, texts: clean }, { headers: { "cache-control": "no-store" } });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 500, headers: { "cache-control": "no-store" } });
      }
    }

    /* ═══ WHO IS SET UP BUT QUIET ═══════════════════════════════════════
       The three names Matt saw in the weekly digest and said "nudge them" to.
       They were only ever in a Slack message, so there was nothing in the Hub
       to act on — which is why the nudge button could not reach them.

       Same rank gate as the nudge itself: this is a list of colleagues who
       have not opened the app, which is exactly the kind of thing that should
       not be browsable by everyone.

       Answers from `quietPeople`, the same function the digest uses, so the
       screen and the Slack post can never name different people. */
    /* ═══ BOOK OR CANCEL AN INTERVIEW SLOT ═════════════════════════════════
       See PG_SLOTS_KEY for why this is a route rather than a browser write.

       ⚠️ WHO IS BOOKING COMES FROM THE TOKEN, NEVER FROM THE BODY. The client
       sends a slot id and nothing else that matters; the name and the roster
       id are read off the signed session. Otherwise anybody could book an
       interview in somebody else's name, and the first anyone would know is
       Bri sitting in a room with the wrong person.

       ⚠️ CANCELLING IS THE BOOKER OR A FULL HR READER, AND NOBODY ELSE. Matt
       asked for cancel in the first version precisely so a wrong booking is
       not stuck — the same trap that left Jose's recommendation frozen this
       morning. An applicant may release their own slot; Bri and HR may release
       anyone's. A leader who is neither gets `not-allowed`. */
    if (url.pathname === "/api/interview" && request.method === "POST") {
      const tok = await readToken(env, request.headers.get("x-hub-token"));
      if (!tok) return Response.json({ ok: false, error: "signed out" }, { status: 401, headers: { "cache-control": "no-store" } });
      try {
        const b = await request.json().catch(() => null);
        const action = String((b && b.action) || "");
        const slotId = String((b && b.slotId) || "");
        if (!slotId || (action !== "book" && action !== "cancel")) {
          return Response.json({ ok: false, error: "bad request" }, { status: 400, headers: { "cache-control": "no-store" } });
        }

        const uid = String(tok.u || "");
        /* 🐛 THIS WAS hrPrimaryName AND IT WOULD HAVE REFUSED EVERY APPLICANT.
           hrPrimaryName only knows HR_CONSOLE_PEOPLE — five people: Bri, Hannah,
           Matt, Nick and Cindy. Every actual applicant would have taken the 403
           below and seen a booking screen that could not book. rosterNameForUid
           reads the whole roster and normalises the id prefix, which is what
           "who is this uid" actually means here. Caught by checking the helper
           rather than trusting the name of it. */
        const myName = await rosterNameForUid(env, uid);
        if (!myName) return Response.json({ ok: false, error: "we could not work out who you are" }, { status: 403, headers: { "cache-control": "no-store" } });
        const mySlug = myName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

        /* Re-read HERE, as late as possible, so the gap between deciding and
           writing is as small as it can be. */
        const raw = await sbGet(env, PG_SLOTS_KEY);
        const slots = Array.isArray(raw) ? raw : [];
        const i = slots.findIndex((s) => s && String(s.id) === slotId);
        if (i < 0) return Response.json({ ok: false, error: "that time is no longer on the list" }, { status: 409, headers: { "cache-control": "no-store" } });
        const slot = slots[i];

        if (action === "book") {
          if (slot.booked) {
            return Response.json({ ok: false, error: "Somebody just took that time. Pick another one." }, { status: 409, headers: { "cache-control": "no-store" } });
          }
          /* One interview per person. Without this, tapping twice on a slow
             connection leaves them holding two and Bri short a slot, and the
             applicant's own screen can only show one of them. */
          const already = slots.find((s) => s && s.booked && String(s.booked.slug) === mySlug);
          if (already) {
            return Response.json({ ok: false, error: "You already have an interview booked. Cancel it first if you need a different time." }, { status: 409, headers: { "cache-control": "no-store" } });
          }
          slots[i] = { ...slot, booked: { uid, slug: mySlug, name: myName, role: String((b && b.role) || ""), at: new Date().toISOString() } };
          await sbSet(env, PG_SLOTS_KEY, slots);
          /* Told AFTER the write. A notification about a booking that did not
             save is worse than a booking nobody was told about. */
          try {
            const to = await notifyTarget(env, "leadership");
            if (to) await sendSlackDM(env, to, `${myName} booked an interview for ${slot.at}${slot.mins ? ` (${slot.mins} min)` : ""}.`);
          } catch { /* the booking stands either way */ }
          return Response.json({ ok: true, slot: slots[i] }, { headers: { "cache-control": "no-store" } });
        }

        // cancel
        if (!slot.booked) return Response.json({ ok: true, slot }, { headers: { "cache-control": "no-store" } });
        const mine = String(slot.booked.slug) === mySlug;
        const isHr = await hrFullReader(env, uid).catch(() => false);
        if (!mine && !isHr) {
          return Response.json({ ok: false, error: "not-allowed" }, { status: 403, headers: { "cache-control": "no-store" } });
        }
        const was = slot.booked;
        slots[i] = { ...slot, booked: null };
        await sbSet(env, PG_SLOTS_KEY, slots);
        try {
          if (!mine) {
            /* Bri released somebody else's time. That person has to be told, or
               they turn up. */
            await pushToPerson(env, was.name, {
              title: "Your interview time was released",
              body: `${slot.at} is no longer booked. Open Professional Growth to pick a new time.`,
            }, was.uid);
          } else {
            const to = await notifyTarget(env, "leadership");
            if (to) await sendSlackDM(env, to, `${myName} cancelled their interview for ${slot.at}.`);
          }
        } catch { /* the cancellation stands either way */ }
        return Response.json({ ok: true, slot: slots[i] }, { headers: { "cache-control": "no-store" } });
      } catch (e) {
        return Response.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500, headers: { "cache-control": "no-store" } });
      }
    }

    /* ═══ THE INTERNAL CALENDAR: BOOK OR CANCEL ════════════════════════════
       Stage 2 of Bri's calendar. Same shape as /api/interview above and for the
       same reasons — the decision is made HERE because two people tapping one
       time is the case a browser cannot get right — but generalised: any owner,
       any event type, with the per-type tier gate she asked for.

       ⚠️ WHO IS BOOKING COMES FROM THE TOKEN. The body carries an owner and a
       slot; the name, the id and the TIER are all read off the signed session.
       A tier from the body would let anybody book a directors-only type by
       editing one number.

       ⚠️ THE OWNER'S OWN RECORD DECIDES WHETHER THEY ARE STILL TAKING BOOKINGS
       (Matt: "stop new bookings when they leave"). Terminated, or a title that
       is no longer an owner title, refuses — and bookings already made are left
       exactly where they are, because somebody with an evaluation next week
       must not have it disappear without a person telling them. */
    if (url.pathname === "/api/calendar" && request.method === "POST") {
      const tok = await readToken(env, request.headers.get("x-hub-token"));
      if (!tok) return Response.json({ ok: false, error: "signed out" }, { status: 401, headers: { "cache-control": "no-store" } });
      try {
        const b = await request.json().catch(() => null);
        const action = String((b && b.action) || "");
        const ownerId = bareId((b && b.ownerId) || "");
        const slotId = String((b && b.slotId) || "");
        if (!ownerId || !slotId || (action !== "book" && action !== "cancel")) {
          return Response.json({ ok: false, error: "bad request" }, { status: 400, headers: { "cache-control": "no-store" } });
        }

        const uid = String(tok.u || "");
        const myName = await rosterNameForUid(env, uid);
        if (!myName) return Response.json({ ok: false, error: "we could not work out who you are" }, { status: 403, headers: { "cache-control": "no-store" } });
        const mySlug = myName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

        const key = calSlotsKey(ownerId);
        /* Re-read as late as possible, so the gap between deciding and writing
           is one request. */
        const raw = await sbGet(env, key);
        const slots = Array.isArray(raw) ? raw : [];
        const i = slots.findIndex((s) => s && String(s.id) === slotId);
        if (i < 0) return Response.json({ ok: false, error: "that time is no longer on the calendar" }, { status: 409, headers: { "cache-control": "no-store" } });
        const slot = slots[i];

        const types = calTypeList(await sbGet(env, CAL_TYPES_KEY).catch(() => null));
        const type = types.find((t) => String(t.id) === String(slot.typeId)) || null;
        const ownerRow = await rosterRowFor(env, ownerId);
        const ownerTitle = (await hubRank(env, ownerId)).title || (ownerRow && ownerRow.role) || "";
        const accepting = calOwnerAccepting({ status: (ownerRow && ownerRow.status) || "Active", role: ownerTitle });

        if (action === "book") {
          const me = await hubRank(env, uid);
          if (!calCanBookType(type, tierForRank(me.rank), accepting)) {
            return Response.json({ ok: false, error: "That is not something you can book right now." }, { status: 403, headers: { "cache-control": "no-store" } });
          }
          if (slot.booked) {
            return Response.json({ ok: false, error: "Somebody just took that time. Pick another one." }, { status: 409, headers: { "cache-control": "no-store" } });
          }
          /* One of each type per person on one owner's calendar. Without it, a
             double tap on a slow connection takes two of somebody's times.
             ⚠️ ASKED THROUGH THE SHARED RULE, on `uid` rather than the slug it
             used to compare. The booking screen shows "you already have this
             booked" off the same function, so the sentence on the screen and
             the refusal from this route can never disagree — and a nickname
             edit in HR cannot orphan somebody from their own booking. */
          const already = calHeldBy(slots, uid, slot.typeId);
          if (already) {
            return Response.json({ ok: false, error: "You already have one of these booked. Cancel it first if you need a different time." }, { status: 409, headers: { "cache-control": "no-store" } });
          }
          slots[i] = { ...slot, booked: { uid, slug: mySlug, name: myName, at: new Date().toISOString() } };
          await sbSet(env, key, slots);
          /* Told after the write, and the co-hosts are told too — a type Hannah
             shares with Bri is one she has to be in the room for. */
          const label = (type && type.label) || "a meeting";
          /* ⚠️ THE TIME IN WORDS, NOT THE STORED STRING. Every notice used to
             read "booked a 1:1 for 2026-08-20T15:00", which is the raw value of
             a datetime-local input. It is the same variable in all three
             channels, so the push, the Slack DM and the email cannot describe
             the same meeting differently. */
          const when = calWhenText(slot.at, STORE_TZ);
          const line = `${myName} booked ${label} for ${when}${slot.mins ? ` (${slot.mins} min)` : ""}.`;

          /* ★ AND AS A CALENDAR INVITE (Matt, Aug 11 2026). Built ONCE, outside
             the loop: it is identical for the owner and every co-host, and the
             UID has to be, or three people accepting the same meeting would end
             up with three separate events nobody could cancel together. */
          const ics = icsFor({
            uid: `gc-${slot.id}-${ownerId}@${HUB_HOST}`,
            summary: `${label} — ${myName}`,
            description: `${myName} booked this through the Hub.`,
            at: slot.at, mins: slot.mins, tz: STORE_TZ,
            organizer: STORE.notifyEmail, organizerName: STORE.legalName,
          });
          /* One read of each HR source for the whole loop, the same two the
             notify route reads, normalised the same way. */
          const [hrInfoRaw, hrAddedRaw] = await Promise.all([
            sbGet(env, "gcfcr-hr-info").catch(() => null),
            sbGet(env, HR_ADDED_KEY).catch(() => null),
          ]);
          const hrInf = hrInfoRaw && typeof hrInfoRaw === "object" && !Array.isArray(hrInfoRaw) ? hrInfoRaw : {};
          const hrAdd = Array.isArray(hrAddedRaw) ? hrAddedRaw : [];

          for (const who of [ownerId, ...(((type && type.coHostIds) || []).map(bareId))]) {
            const n = await rosterNameForUid(env, who).catch(() => "");
            if (!n) continue;
            /* ⚠️ ONE try PER CHANNEL, NOT ONE ROUND THE LOT. These three shared
               a single catch, so a push that threw took the Slack DM down with
               it and that person heard nothing at all. Adding email underneath
               the same catch would have made the channel Matt asked for the one
               most likely to go quiet, and quietly. */
            try { await pushToPerson(env, n, { title: "New booking", body: line }, who); } catch { /* the booking stands */ }
            try {
              const sid = await slackIdForName(env, n);
              if (sid) await sendSlackDM(env, sid, line);
            } catch { /* the booking stands */ }
            try {
              /* ⚠️ THE ADDRESS COMES FROM HR, NEVER FROM THE REQUEST. Same
                 resolver the notify route uses, for the same reason: a body
                 could otherwise name any address and the store would mail it. */
              const em = emailFromSources({ id: String(who), name: n }, hrInf, hrAdd);
              if (!em) continue;
              await sendEmailOk(env, em, `${label} — ${when}`,
                `${myName} booked ${label} with you.\n\n${when}\n${slot.mins || 30} minutes\n\n`
                + (ics ? "The invite is attached. Open it once and it goes in your calendar.\n\n" : "")
                + `— ${STORE.legalName}`,
                ics ? [{ filename: "booking.ics", content: utf8b64(ics) }] : null);
            } catch { /* the booking stands */ }
          }
          return Response.json({ ok: true, slot: slots[i] }, { headers: { "cache-control": "no-store" } });
        }

        // cancel
        if (!slot.booked) return Response.json({ ok: true, slot }, { headers: { "cache-control": "no-store" } });
        /* ⚠️ "IS THIS MINE" IS THE ID, NOT THE NAME — the same rule the book
           path above and the booking screen both ask through. On the slug this
           was a latent lockout: change somebody's "Goes by" in HR between
           booking and cancelling and their own Cancel button starts answering
           403, because the slug is built from the name and the name moved.
           `mySlug` is still written onto the booking; it is just no longer what
           decides who owns one. */
        const mine = calBookedBy(slot, uid);
        const runsIt = bareId(uid) === ownerId || calCanManageType(type, uid);
        const isHr = await hrFullReader(env, uid).catch(() => false);
        if (!mine && !runsIt && !isHr) {
          return Response.json({ ok: false, error: "not-allowed" }, { status: 403, headers: { "cache-control": "no-store" } });
        }
        const was = slot.booked;
        slots[i] = { ...slot, booked: null };
        await sbSet(env, key, slots);
        const label = (type && type.label) || "a meeting";
        try {
          if (mine) {
            /* The person who booked it cancelled. The owner and co-hosts hear. */
            const line = `${myName} cancelled ${label} on ${slot.at}.`;
            for (const who of [ownerId, ...(((type && type.coHostIds) || []).map(bareId))]) {
              const n = await rosterNameForUid(env, who);
              if (!n) continue;
              await pushToPerson(env, n, { title: "Booking cancelled", body: line }, who);
              const sid = await slackIdForName(env, n);
              if (sid) await sendSlackDM(env, sid, line);
            }
          } else {
            /* A leader released somebody else's time. That person has to hear
               it, or they turn up. */
            await pushToPerson(env, was.name, {
              title: "Your booking was cancelled",
              body: `${label} on ${slot.at} is no longer booked. Open the Hub to pick a new time.`,
            }, was.uid);
          }
        } catch { /* the cancellation stands either way */ }
        return Response.json({ ok: true, slot: slots[i] }, { headers: { "cache-control": "no-store" } });
      } catch (e) {
        return Response.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500, headers: { "cache-control": "no-store" } });
      }
    }

    /* ═══ TELLING WHOEVER IS RUNNING THE SHIFT ═════════════════════════════
       Matt, Aug 13 2026, part 3: "One-way. Team member to whoever is running
       the shift… It routes automatically to whoever the board says owns that
       shift right now. The team member does not choose a recipient and does not
       need to know who is on."

       ⚠️⚠️ THERE IS NO RECIPIENT IN THE BODY AND THERE MUST NEVER BE. The
       routing is read off the BOARD at the moment of sending. A body that could
       name a leader is a direct message to a person of your choosing, which is
       the line Matt drew: "There is no free-form chat between team members."

       ⚠️⚠️ AND THERE IS NO REPLY ACTION. A leader marks it seen with one line
       of outcome. That is a disposition, not a message back. "No reply thread
       on this one. If it needs discussion, the leader calls them."

       ⚠️ WHO IT ROUTED TO IS FROZEN ONTO THE RECORD. Never recomputed on read:
       last Tuesday's board can be rewritten, and the question this answers
       months later is "who was on when I sent it". */
    if (url.pathname === "/api/escalation" && request.method === "POST") {
      try {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        const uid = bareId(tok.u || "");
        if (!uid) return Response.json({ ok: false, error: "we could not work out who you are" }, { status: 403 });
        const b = await request.json().catch(() => null);
        const action = String((b && b.action) || "send");
        const no = (msg, code) => Response.json({ ok: false, error: msg }, { status: code, headers: { "cache-control": "no-store" } });
        const who = await hubRank(env, uid);
        const isLeader = tierForRank(who.rank) >= 3;

        const all = escList(await sbGetStrict(env, ESCALATIONS_KEY).catch(() => null));

        if (action === "send") {
          if (!escIsReason(b && b.reason)) return no("pick a reason", 400);
          const note = String((b && b.note) || "").trim();
          if (note.length > 300) return no("keep the note short — the leader is mid-rush", 400);

          /* ★★ THE ROUTER. The board for this week, this day, this daypart. */
          const now = nowET();
          const monday = boardMondayKey(now);
          const [foh, boh] = await Promise.all([
            sbGet(env, boardKey("foh", monday)).catch(() => null),
            sbGet(env, boardKey("boh", monday)).catch(() => null),
          ]);
          const duty = leadersOnDutyAt({ foh, boh }, now);

          const rec = escMake({
            id: crypto.randomUUID(), byId: uid,
            byName: (await rosterNameForUid(env, uid).catch(() => "")) || "Someone",
            at: new Date().toISOString(),
            reason: b.reason, note,
            dayIso: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
            daypart: duty.daypart,
            routedTo: duty.names,
          });
          await sbSet(env, ESCALATIONS_KEY, [rec, ...all]);

          /* ══ IT ALSO LANDS ON THEIR HR FILE, AS DOCUMENTATION ═══════════════
             Matt, Aug 14 2026: "for the tell a leader tool it needs connected
             to the hr console for documentation", and when asked automatic or
             a tap: "automatic but still notifies the leader". The Slack alert
             below is untouched; this is in addition to it.

             ⚠️⚠️ AREA "General" AND source "general", WHICH IS WHAT KEEPS IT OUT
             OF WRITE-UPS. FILE_GROUPS routes on those two and its `writeups`
             test is a CATCH-ALL, so an entry with a NEW source would land under
             "Attendance and policy incidents that moved points" — on a
             permanent record, on a screen all ~106 people read about
             themselves. That exact bug shipped once (Aug 7 2026, finding 24).

             ⚠️⚠️ ZERO POINTS AND needsPricing FALSE. Saying you are running
             late is not discipline and must never look like it. Which demerit a
             late actually earns depends on how late, which day and how much
             notice — facts this record does not hold — so it stays a human's
             call in the normal flow.

             ⚠️⚠️ MEMBER-ROW MERGE, NEVER A WHOLE-MAP WRITE. `gcfcr-hr-files` is
             ONE map holding every person's file, and a read-modify-write of the
             whole thing is what silently deleted Evelyn's documentation on
             Jul 29 2026: two leaders filed minutes apart, both writes
             SUCCEEDED, the second landed on top. This touches ONE person's row
             and leaves every other row exactly as it was read, which is the
             same shape MEMBER_ROW_MERGE enforces on the /api/hr-store door.

             ⚠️ THE ID IS DERIVED FROM THE ESCALATION so a retry cannot file it
             twice, and pendingSig is FALSE — a documentation entry must never
             ask a team member to sign for having told a leader they were late.

             ⚠️ NEVER LETS THE ESCALATION FAIL. The message reaching the leader
             is the job; the file copy is bookkeeping. If this throws, the
             escalation is already stored and the alert still goes. */
          if (rec.byId) {
            try {
              const mid = String(rec.byId);
              const filesRaw = await sbGetStrict(env, "gcfcr-hr-files");
              const files = filesRaw && typeof filesRaw === "object" && !Array.isArray(filesRaw) ? filesRaw : {};
              const row = Array.isArray(files[mid]) ? files[mid] : [];
              const entryId = "esc-" + rec.id;
              if (!row.some((e) => e && e.id === entryId)) {
                const what = escReasonLabel(rec.reason) || "Told a leader";
                const where = rec.daypart ? ` (${rec.daypart})` : "";
                const reached = rec.routedTo.length
                  ? `It reached ${rec.routedTo.join(", ")}.`
                  : "Nobody was rostered as running the shift at that moment, so it reached no one.";
                files[mid] = [{
                  id: entryId,
                  title: `Told a leader: ${what}`,
                  area: "General",
                  source: "general",
                  counseling: false,
                  step: null,
                  points: 0,
                  needsPricing: false,
                  date: rec.dayIso,
                  body: `On ${rec.dayIso}${where}, ${rec.byName || "this team member"} used Tell a Leader to report: ${what}.`
                    + (rec.note ? `\n\nWhat they said: "${rec.note}"` : "")
                    + `\n\n${reached}`
                    + "\n\nFiled automatically by the Hub as documentation. It carries no points and is not a write-up."
                    + " If this warrants an attendance write-up, file that separately from this person's record.",
                  by: "Tell a Leader · the Hub",
                  sig: null,
                  leaderSig: null,
                  pendingSig: false,
                  history: [{ at: new Date().toISOString(), by: "Tell a Leader · the Hub", action: "created" }],
                }, ...row];
                await sbSet(env, "gcfcr-hr-files", files);
              }
            } catch { /* the escalation and the alert both still stand */ }
          }

          /* ⚠️ IT IS LOGGED WHETHER OR NOT ANYBODY COULD BE REACHED. An empty
             board at 5am is a real state, and an escalation that refused to
             save because nobody was rostered would lose the one message that
             mattered most. The record says routedTo: [] and a leader still sees
             it in the list — silence is never the answer here. */
          ctx.waitUntil((async () => {
            const alert = escAlert(rec);
            for (const name of duty.names) {
              try { await pushToPerson(env, name, alert); } catch { /* the record stands */ }
            }
          })().catch(() => {}));

          return Response.json({ ok: true, escalation: rec, reached: duty.names.length },
            { headers: { "cache-control": "no-store" } });
        }

        /* ⚠️ MARKING SEEN IS A LEADER ACTION AND CARRIES ONE LINE. Not a reply
           box: the field is capped and there is exactly one of it per record. */
        if (action === "seen") {
          if (!isLeader) return no("only a leader can answer an escalation", 403);
          const id = String((b && b.id) || "");
          const i = all.findIndex((e) => e && String(e.id) === id);
          if (i < 0) return no("that is no longer on file", 404);
          const outcome = String((b && b.outcome) || "").trim().slice(0, 200);
          if (all[i].seen && all[i].seen.at) return Response.json({ ok: true, already: true }, { headers: { "cache-control": "no-store" } });
          const next = all.slice();
          next[i] = { ...all[i], seen: {
            at: new Date().toISOString(), byId: uid,
            byName: (await rosterNameForUid(env, uid).catch(() => "")) || "A leader",
            outcome,
          } };
          await sbSet(env, ESCALATIONS_KEY, next);
          return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
        }

        return no("bad request", 400);
      } catch (e) {
        return Response.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500, headers: { "cache-control": "no-store" } });
      }
    }

    /* A team member sees only their own; a leader sees the store's. Same
       widening as everywhere else in this feature, and the same reason. */
    if (url.pathname === "/api/escalations" && request.method === "GET") {
      try {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "signed out" }, { status: 401, headers: { "cache-control": "no-store" } });
        const uid = bareId(tok.u || "");
        if (!uid) return Response.json({ ok: false, error: "we could not work out who you are" }, { status: 403, headers: { "cache-control": "no-store" } });
        const who = await hubRank(env, uid);
        const isLeader = tierForRank(who.rank) >= 3;
        const all = escList(await sbGet(env, ESCALATIONS_KEY).catch(() => null));
        return Response.json({ ok: true, uid, isLeader, escalations: all.filter((e) => escVisibleTo(e, uid, isLeader)) },
          { headers: { "cache-control": "no-store" } });
      } catch (e) {
        return Response.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500, headers: { "cache-control": "no-store" } });
      }
    }

    /* ═══ THE THREAD THAT BELONGS TO ONE REQUEST ═══════════════════════════
       Matt, Aug 13 2026, part 2: "Anyone involved in that specific request can
       post to it. Nobody else can see it… When the request is resolved, the
       thread closes and stays attached to it as the record of what was agreed."

       ⚠️⚠️ THE THREAD IS FETCHED BY REQUEST ID AND THE SERVER CHECKS THE
       REQUEST, not the thread. A thread row on its own says nothing about who
       may read it; the REQUEST says whose it is and whether it is still open.
       Reading permission off the thread would mean a thread whose request was
       deleted or reassigned kept its old audience.

       ⚠️ NO LIST ROUTE, ON PURPOSE. There is no "all threads" endpoint, because
       a feed of everybody's conversations is the thing this feature is shaped
       to not be. You reach a thread through a request you can already see.

       ⚠️ APPEND ONLY, SERVER SIDE. The client sends TEXT, never the thread. A
       posted array from a phone is stale the moment anybody else replies, and
       writing it back drops their post — the read-modify-write clobber this
       repo has been bitten by on goal submissions and on HR files. */
    if (url.pathname === "/api/shift-thread") {
      try {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "signed out" }, { status: 401, headers: { "cache-control": "no-store" } });
        const uid = bareId(tok.u || "");
        if (!uid) return Response.json({ ok: false, error: "we could not work out who you are" }, { status: 403, headers: { "cache-control": "no-store" } });
        const who = await hubRank(env, uid);
        const isLeader = tierForRank(who.rank) >= 3;
        const no = (msg, code) => Response.json({ ok: false, error: msg }, { status: code, headers: { "cache-control": "no-store" } });

        /* The request is the authority on who may see this and whether it is
           still open, so it is read on every call rather than trusted from the
           body. */
        const reqIdOf = (b) => String((b && b.requestId) || url.searchParams.get("requestId") || "");
        const loadReq = async (rid) => {
          const store = readTimeOff(await sbGet(env, TIMEOFF_KEY).catch(() => null));
          return (store.requests || []).find((r) => r && String(r.id) === rid) || null;
        };

        if (request.method === "GET") {
          const rid = reqIdOf(null);
          if (!rid) return no("bad request", 400);
          const req = await loadReq(rid);
          if (!req) return no("that request is no longer on file", 404);
          if (!thrCanSee(req, uid, isLeader)) return no("that request is not yours", 403);
          const t = thrFor(await sbGet(env, THREADS_KEY).catch(() => null), rid);
          return Response.json({
            ok: true, requestId: rid,
            /* The screen needs to know WHY it cannot post, not just that it
               cannot — one sentence, from the leaf, so the button and the route
               never disagree about the reason. */
            canPost: thrCanPost(req, uid, isLeader),
            refusal: thrRefusal(req, uid, isLeader),
            posts: (t && Array.isArray(t.posts)) ? t.posts : [],
          }, { headers: { "cache-control": "no-store" } });
        }

        if (request.method === "POST") {
          const b = await request.json().catch(() => null);
          const action = String((b && b.action) || "post");
          const rid = reqIdOf(b);
          if (!rid) return no("bad request", 400);
          const req = await loadReq(rid);
          if (!req) return no("that request is no longer on file", 404);

          /* ⚠️ ONE GATE, FROM THE LEAF, FOR BOTH ACTIONS. `refusalFor` answers
             "not yours" and "already decided" in the right order, so a person
             who is not involved is never told a thread exists by being given
             the closed-thread message instead of the not-yours one. */
          const why = thrRefusal(req, uid, isLeader);
          if (why) return no(why, thrCanSee(req, uid, isLeader) ? 409 : 403);

          const all = thrRead(await sbGetStrict(env, THREADS_KEY).catch(() => null));
          /* sbGetStrict throws on a refused read; readThreads would turn the
             thrown-through null into {} and the write below would erase every
             thread in the store. So the throw is caught by the outer try and
             answered as a 500 rather than being smoothed into an empty map. */
          const cur = all[rid] && typeof all[rid] === "object" ? all[rid] : { requestId: rid, kind: "timeoff", memberId: String(req.memberId || ""), posts: [] };
          const posts = Array.isArray(cur.posts) ? cur.posts : [];

          if (action === "retract") {
            const pid = String((b && b.postId) || "");
            const i = posts.findIndex((p) => p && String(p.id) === pid);
            if (i < 0) return no("that message is no longer on file", 404);
            /* ⚠️ YOU MAY ONLY WITHDRAW YOUR OWN WORDS, leader or not. A leader
               editing a team member's message out of a record is the thing this
               feature exists to make impossible. */
            if (bareId(posts[i].byId) !== uid) return no("you can only withdraw your own message", 403);
            if (posts[i].retracted && posts[i].retracted.at) return Response.json({ ok: true, already: true }, { headers: { "cache-control": "no-store" } });
            const next = posts.slice();
            next[i] = { ...posts[i], retracted: { at: new Date().toISOString(), byId: uid } };
            await sbSet(env, THREADS_KEY, { ...all, [rid]: { ...cur, posts: next } });
            return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
          }

          const text = String((b && b.text) || "").trim();
          if (!text) return no("type something first", 400);
          if (text.length > 2000) return no("that is longer than a message on a request should be", 400);
          if (posts.length >= 200) return no("this thread is full — a request with 200 messages needs a conversation, not more typing", 409);
          const post = thrMakePost({
            id: crypto.randomUUID(), byId: uid,
            byName: (await rosterNameForUid(env, uid).catch(() => "")) || "Someone",
            at: new Date().toISOString(), text,
          });
          await sbSet(env, THREADS_KEY, { ...all, [rid]: { ...cur, posts: [...posts, post] } });
          return Response.json({ ok: true, post }, { headers: { "cache-control": "no-store" } });
        }

        return no("method", 405);
      } catch (e) {
        return Response.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500, headers: { "cache-control": "no-store" } });
      }
    }

    /* ═══ ANNOUNCEMENTS ════════════════════════════════════════════════════
       Matt, Aug 13 2026, part 1 of three. The one Slack is genuinely bad at:
       a leader posts, chooses who it reaches, and can then see WHO HAS OPENED
       IT BY NAME rather than a count.

       ⚠️⚠️ THIS IS NOT A CHAT ROUTE AND MUST NOT BECOME ONE. There is no way
       here to address one person. `create` takes an AUDIENCE, resolves it to a
       list once, and stores that list. If a future change accepts a single
       recipient id, that is a direct message, and the whole reason this feature
       is shaped like this is that Matt will not host free-form employee
       messages: "free-form employee messages in a system I host make me the
       custodian of records that get subpoenaed in a harassment or wage claim."

       ⚠️ NOTHING CROSSES STORES, AND IT IS STRUCTURAL RATHER THAN CHECKED HERE.
       Every store is its own repo, its own Worker and its own Supabase project
       — Gate City is SET-THIS-TO-THE-NEW-STORE-SUPABASE-PROJECT, the Village thowtpqfzhuxkajwimco.
       There is no shared table for an announcement to leak through, and no
       filter in this file is what stops it. A cross-store read would require
       one Worker to be handed another store's SUPABASE_URL, which is the thing
       the wrangler.toml warnings in each repo exist to prevent.

       ⚠️ EDIT AND DELETE DO NOT EXIST ON PURPOSE (Matt: "No editing a sent
       message. Post a correction instead. No deleting a sent message. Retract
       it, visibly."). `retract` flags; it never removes. A message that can
       vanish is a message that can be denied, which is the opposite of a
       record. */
    if (url.pathname === "/api/announcement" && request.method === "POST") {
      try {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        const uid = bareId(tok.u || "");
        if (!uid) return Response.json({ ok: false, error: "we could not work out who you are" }, { status: 403 });
        const b = await request.json().catch(() => null);
        const action = String((b && b.action) || "");
        const no = (msg, code) => Response.json({ ok: false, error: msg }, { status: code, headers: { "cache-control": "no-store" } });

        const who = await hubRank(env, uid);
        const isLeader = tierForRank(who.rank) >= 3;

        const list = await sbGetStrict(env, ANNOUNCE_KEY).catch(() => null);
        /* ⚠️ A FAILED READ IS NOT AN EMPTY LIST. Writing a rebuilt array on top
           of a read that failed erases every announcement in the store — the
           exact bug the rollouts tile shipped with. sbGetStrict throws rather
           than answering null, and this refuses rather than guessing. */
        if (list === null) return no("could not read the announcements just now, so nothing was changed", 503);
        const all = annList(list);

        /* ── mark it opened ──────────────────────────────────────────────
           ⚠️ OPEN IS THE ONLY THING A NON-LEADER MAY WRITE, and only their own
           row on something they were actually sent. Matt's answer, Aug 13:
           opening the ANNOUNCEMENT counts, not opening the Hub — a read list
           that fills up because people launched the app is not a read list.
           ⚠️ WRITE-ONCE. The first open is the one that means anything; a
           later re-read must not move the timestamp. */
        if (action === "open") {
          const id = String((b && b.id) || "");
          const i = all.findIndex((a) => a && String(a.id) === id);
          if (i < 0) return no("that announcement is no longer on file", 404);
          if (!annVisibleTo(all[i], uid, isLeader)) return no("that was not sent to you", 403);
          const opens = all[i].opens || {};
          /* Keyed and read by the BARE id, the same as `acks` in ackOneRow and
             the same as the read list's lookup. `uid` is already bared at the
             top of this route; going through the shared helper is what stops
             the three from drifting apart again. */
          if (annStampFor(opens, uid)) return Response.json({ ok: true, already: true }, { headers: { "cache-control": "no-store" } });
          const next = all.slice();
          next[i] = { ...all[i], opens: { ...opens, [bareId(uid)]: { at: new Date().toISOString() } } };
          await sbSet(env, ANNOUNCE_KEY, next);
          return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
        }

        /* Everything below is a leader action. */
        if (!isLeader) return no("only a Director can post or withdraw an announcement", 403);

        if (action === "create") {
          const title = String((b && b.title) || "").trim();
          const body = String((b && b.body) || "").trim();
          if (!title || !body) return no("an announcement needs a title and a message", 400);
          const ids = Array.isArray(b && b.targetIds) ? b.targetIds : [];
          /* A bound, not a rule anybody asked for. The store has ~106 people;
             a runaway list would write one enormous row. */
          if (!ids.length) return no("that reaches nobody — pick who it goes to", 400);
          if (ids.length > 400) return no("that is more people than one announcement can hold", 400);
          /* ★ THROUGH THE SHARED WRITER, so a leader's announcement and the
             scheduled scoreboard's are the same record built the same way.
             `all` is handed in because this route already read it strictly at
             the top; the helper reads for itself when nobody has. */
          const ev = await writeAnnouncement(env, {
            title, body,
            byId: uid, byName: (await rosterNameForUid(env, uid).catch(() => "")) || "A director",
            audience: (b && b.audience) || { kind: "everyone" },
            targetIds: ids,
            requiresAck: !!(b && b.requiresAck),
          }, all);
          if (!ev) return no("could not read the announcements just now, so nothing was posted", 503);
          /* ⚠️ PUSH IS BEST EFFORT AND RUNS AFTER THE ANSWER. Up to ~106 people
             is the widest fan-out in this file after the calendar; inline, the
             sender watches a spinner and one slow push takes the post down with
             it. The announcement is already saved before this runs, so a
             failure here costs alerts and never the record. */
          ctx.waitUntil((async () => {
            for (const raw of ev.targetIds) {
              try {
                await pushToUid(env, bareId(raw), {
                  title: ev.requiresAck ? "Announcement — please confirm" : "Announcement",
                  body: ev.title,
                });
              } catch { /* the announcement stands */ }
            }
          })().catch(() => {}));
          return Response.json({ ok: true, announcement: ev, sentTo: ev.targetIds.length },
            { headers: { "cache-control": "no-store" } });
        }

        if (action === "retract") {
          const id = String((b && b.id) || "");
          const i = all.findIndex((a) => a && String(a.id) === id);
          if (i < 0) return no("that announcement is no longer on file", 404);
          if (annRetracted(all[i])) return Response.json({ ok: true, already: true }, { headers: { "cache-control": "no-store" } });
          const next = all.slice();
          next[i] = { ...all[i], retracted: {
            at: new Date().toISOString(), byId: uid,
            byName: (await rosterNameForUid(env, uid).catch(() => "")) || "A director",
            why: String((b && b.why) || "").trim(),
          } };
          await sbSet(env, ANNOUNCE_KEY, next);
          return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
        }

        return no("bad request", 400);
      } catch (e) {
        return Response.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500, headers: { "cache-control": "no-store" } });
      }
    }

    /* ═══ WHAT ANNOUNCEMENTS AM I ALLOWED TO SEE? ═══════════════════════════
       ★★ THE FILTER IS SERVER-SIDE, WHICH IS THE WHOLE POINT OF THE ROUTE. A
       browser handed the full list and told to hide rows is a browser holding
       the full list. Team members get only what was sent to them; leaders get
       everything, which is Matt's ruling and is what makes this a records
       system somebody can actually answer questions from. */
    if (url.pathname === "/api/announcements-mine" && request.method === "GET") {
      try {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "signed out" }, { status: 401, headers: { "cache-control": "no-store" } });
        const uid = bareId(tok.u || "");
        if (!uid) return Response.json({ ok: false, error: "we could not work out who you are" }, { status: 403, headers: { "cache-control": "no-store" } });
        const who = await hubRank(env, uid);
        const isLeader = tierForRank(who.rank) >= 3;
        const all = annList(await sbGet(env, ANNOUNCE_KEY).catch(() => null));
        const mine = all.filter((a) => annVisibleTo(a, uid, isLeader));
        /* ⚠️ A NON-LEADER NEVER RECEIVES THE READ LIST. `opens` and `acks` name
           every colleague who has and has not read it, and that is a leader's
           view of the team, not a team member's view of each other. They get
           back only their OWN two stamps. */
        const out = isLeader ? mine : mine.map((a) => ({
          ...a,
          opens: a.opens && a.opens[uid] ? { [uid]: a.opens[uid] } : {},
          acks: a.acks && a.acks[uid] ? { [uid]: a.acks[uid] } : {},
        }));
        return Response.json({ ok: true, uid, isLeader, announcements: out },
          { headers: { "cache-control": "no-store" } });
      } catch (e) {
        return Response.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500, headers: { "cache-control": "no-store" } });
      }
    }

    /* ═══ THE INTERNAL CALENDAR: INVITATIONS ═══════════════════════════════
       Stage 2 of the invitation half. Stage 1 is calendarStore.js, which holds
       every rule this route obeys and had no callers until now.

       ★★ A SEPARATE ROUTE FROM /api/calendar ON PURPOSE. That one books and
       cancels SLOTS and it is live and busy. These are the opposite arrow — an
       organiser names a time and invites people — and bolting verbs onto the
       booking handler means surgery inside the validation that live bookings
       already depend on. Nothing above this line changed (design rule 16).

       ⚠️⚠️ EXACTLY ONE WRITER PER ROW, WHICH IS THE WHOLE DESIGN.
         gc-cal-events-v1:<organiserId>   only the organiser, and here that is
                                          always the token's own uid
         gc-cal-replies-v1:<personId>     only that person, likewise
       No request in this route ever writes a row belonging to somebody else,
       so five people answering an L10 inside the same minute cannot lose an
       answer. `organiserId` is only ever read from the body to LOOK UP an
       event, never to decide whose row gets written.

       ⛔ CO-HOSTS CAN SEE BUT NOT EDIT, DELIBERATELY, AND THIS IS THE ONE
       THING STAGE 2 LEAVES OUT. `canManageEvent` in stage 1 would let a
       co-host edit, and honouring that here would put two writers on one row
       and undo the paragraph above. Doing it properly needs the event's own
       row per editor, which is a stage of its own. Until then the organiser
       edits and a co-host reads.

       ⚠️ WHO YOU ARE COMES FROM THE TOKEN, NEVER THE BODY. Same rule the
       booking route states: a body-supplied identity would let anybody answer
       on somebody else's behalf, or organise as them.

       ⚠️ `forAt` IS READ FROM THE STORED EVENT, NEVER FROM THE BODY. It is
       what decides whether an answer still counts after a reschedule, so a
       client that could set it could record consent to a time it was never
       asked about.

       ⚠️ NO PAST/FUTURE CHECK HERE, ON PURPOSE. `at` is a datetime-local
       string with no zone, and comparing it to the Worker's UTC clock is the
       exact mistake that once "named tomorrow after 8pm Eastern" in the Team
       Directory. The screen guides the time; the Worker does not guess a zone.

       ⚠️ READS THROUGH sbGetStrict. sbGet answers null for "absent" and for
       "Supabase refused" alike, and writing a rebuilt list on top of a read
       that failed would erase every other event on that calendar. */
    if (url.pathname === "/api/calendar-event" && request.method === "POST") {
      const tok = await readToken(env, request.headers.get("x-hub-token"));
      if (!tok) return Response.json({ ok: false, error: "signed out" }, { status: 401, headers: { "cache-control": "no-store" } });
      const no = (msg, status) => Response.json({ ok: false, error: msg }, { status, headers: { "cache-control": "no-store" } });
      try {
        const b = await request.json().catch(() => null);
        const action = String((b && b.action) || "");
        const uid = bareId(tok.u || "");
        if (!uid) return no("we could not work out who you are", 403);

        /* ── an invitee answering ──────────────────────────────────────────
           The only action open to somebody who is not a calendar owner: being
           invited is what earns you the right to reply, and nothing else. */
        if (action === "reply") {
          const organiserId = bareId((b && b.organiserId) || "");
          const eventId = String((b && b.eventId) || "");
          const status = String((b && b.status) || "");
          if (!organiserId || !eventId) return no("bad request", 400);
          if (status !== CAL_ACCEPTED && status !== CAL_DECLINED) return no("bad request", 400);

          const events = calEventList(await sbGetStrict(env, calEventsKey(organiserId)));
          const ev = events.find((e) => e && String(e.id) === eventId);
          if (!ev) return no("that meeting is no longer on the calendar", 409);
          if (!calIsInvited(ev, uid)) return no("you are not on the invitation for that meeting", 403);

          const rKey = calRepliesKey(uid);
          const rows = calReplyMap(await sbGetStrict(env, rKey));
          /* ⚠️ `forAt` OFF THE STORED EVENT. See the header. */
          const reply = calMakeReply(status, {
            at: new Date().toISOString(),
            forAt: ev.at,
            proposedAt: (b && b.proposedAt) || "",
            note: (b && b.note) || "",
          });
          await sbSet(env, rKey, { ...rows, [eventId]: reply });
          return Response.json({ ok: true, reply }, { headers: { "cache-control": "no-store" } });
        }

        /* ── everything else is the organiser acting on their own calendar ── */
        const meRow = await rosterRowFor(env, uid);
        const meTitle = (await hubRank(env, uid)).title || (meRow && meRow.role) || "";
        if (!calIsOwner(meTitle)) return no("the calendar is set up by Directors, HR and the Executive Directors", 403);
        /* Somebody on their way out stops creating meetings, the same rule
           `ownerAccepting` applies to taking bookings. Meetings already on the
           calendar are left exactly where they are. */
        if (!calOwnerAccepting({ status: (meRow && meRow.status) || "Active", role: meTitle })) {
          return no("your calendar is not taking new meetings", 403);
        }

        const eKey = calEventsKey(uid);
        const events = calEventList(await sbGetStrict(env, eKey));

        if (action === "create") {
          const ids = Array.isArray(b && b.inviteeIds) ? b.inviteeIds : [];
          /* A bound, not a rule anybody asked for: a runaway list would write
             one enormous row, and the store has ~106 people in it. */
          if (ids.length > 60) return no("that is more people than one meeting can hold", 400);
          const at = String((b && b.at) || "");
          const title = String((b && b.title) || "").trim();
          if (!at || !title) return no("a meeting needs a name and a time", 400);
          const ev = calMakeEvent({
            id: crypto.randomUUID(), typeId: (b && b.typeId) || null, title, at,
            mins: (b && b.mins), organiserId: uid, inviteeIds: ids, note: (b && b.note) || "",
            /* ⚠️ THE ONLY PLACE THIS IS SET. "" means new and not yet announced;
               ABSENT means written before notifications existed and must never
               be announced. makeEvent carries it through and never invents it,
               so `update` cannot reset the stamp and re-alert 60 people about a
               typo. See needsTelling in calendarStore.js. */
            notifiedFor: "",
          });
          const stamped = calMarkTold(ev);
          /* ⚠️⚠️ THE STAMP IS WRITTEN WITH THE EVENT, BEFORE ANYONE IS TOLD, and
             that order is deliberate. Telling first and stamping after leaves a
             window where a retry re-announces to everybody, and the cost of the
             two failure modes is not symmetric: a missed alert is one person
             opening the Hub to find their meeting, which is exactly today's
             behaviour. A double alert is 60 people told twice, twice as loudly,
             about the same meeting — and the calendar is a notifications feature
             precisely so people can trust what it sends. */
          await sbSet(env, eKey, [...events, stamped]);
          if (calNeedsTelling(ev)) {
            /* The organiser's name for the message, from the roster row this
               route already read — not a second lookup, and not off the token,
               which carries an id and never a name. */
            const organiserName = (meRow && meRow.name) || "A director";
            ctx.waitUntil(tellInvitees(env, ev, organiserName).catch(() => {}));
          }
          return Response.json({ ok: true, event: stamped, telling: ev.inviteeIds.length },
            { headers: { "cache-control": "no-store" } });
        }

        const id = String((b && b.id) || "");
        const i = events.findIndex((e) => e && String(e.id) === id);
        if (i < 0) return no("that meeting is no longer on the calendar", 409);
        /* Belt and braces. `eKey` is already built from the token's uid, so a
           row belonging to somebody else is unreachable from here — this says
           so out loud rather than leaving it to be re-derived by the next
           reader. */
        if (!calOrganises(events[i], uid)) return no("that is not your meeting", 403);

        if (action === "update") {
          const ids = Array.isArray(b && b.inviteeIds) ? b.inviteeIds : events[i].inviteeIds;
          if (ids.length > 60) return no("that is more people than one meeting can hold", 400);
          /* ⚠️ THE TIME IS NOT EDITABLE HERE, and that is not tidiness. Moving
             a meeting has to undo every answer, which `reschedule` does by
             changing `at`. An update that quietly accepted a new time would
             move the meeting while leaving four accepts standing against a
             time nobody agreed to. */
          const next = calMakeEvent({
            ...events[i],
            title: (b && b.title) != null ? b.title : events[i].title,
            note: (b && b.note) != null ? b.note : events[i].note,
            inviteeIds: ids,
            at: events[i].at,
            mins: events[i].mins,
          });
          const list = events.slice();
          list[i] = next;
          await sbSet(env, eKey, list);
          return Response.json({ ok: true, event: next }, { headers: { "cache-control": "no-store" } });
        }

        if (action === "reschedule") {
          const at = String((b && b.at) || "");
          if (!at) return no("a meeting needs a time", 400);
          /* Stage 1 returns the ids to TELL. It clears nothing and neither does
             this: the new `at` is what stops the old answers counting.
             ★★ AND NOW IT ACTUALLY TELLS THEM. `reask` was the right list from
             the day it was written and there was nothing on the other end of it
             — the people whose answers had just stopped counting were re-asked
             silently and found out whenever they next opened the Hub. Moving a
             meeting is the case where being told matters MOST: an accept for
             9am Tuesday does not carry to 2pm Thursday, so somebody who is not
             told turns up to a room at the wrong time or not at all.
             ⚠️ NO SEPARATE "was it moved" TEST. `calNeedsTelling` compares the
             stamp against the new `at`, so the reschedule and the title edit are
             decided by one rule in the leaf rather than two here. */
          const { event: next, reask } = calReschedule(events[i], at, (b && b.mins) == null ? null : b.mins);
          const tell = calNeedsTelling(next);
          const stamped = tell ? calMarkTold(next) : next;
          const list = events.slice();
          list[i] = stamped;
          await sbSet(env, eKey, list);
          if (tell) {
            const organiserName = (meRow && meRow.name) || "A director";
            ctx.waitUntil(tellInvitees(env, next, organiserName).catch(() => {}));
          }
          return Response.json({ ok: true, event: stamped, reask, telling: tell ? reask.length : 0 },
            { headers: { "cache-control": "no-store" } });
        }

        if (action === "cancel") {
          /* ⚠️ THE INVITEES' REPLY ROWS ARE LEFT ALONE, for the same reason
             nothing else here touches them. An orphaned entry is harmless:
             every reader asks through the EVENT, so an answer to a meeting that
             no longer exists is never read again. */
          await sbSet(env, eKey, events.filter((_, n) => n !== i));
          return Response.json({ ok: true, removed: id }, { headers: { "cache-control": "no-store" } });
        }

        return no("bad request", 400);
      } catch (e) {
        return Response.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500, headers: { "cache-control": "no-store" } });
      }
    }

    /* ═══ THE INTERNAL CALENDAR: WHAT AM I IN? ═════════════════════════════
       ★★ THIS ROUTE EXISTS SO THE BROWSER NEVER RECEIVES SOMEBODY ELSE'S
       MEETINGS. Events are keyed by ORGANISER, so "what am I invited to" has no
       index and the only way to answer it from a browser is to fetch every
       leader's whole calendar and filter locally. That was tolerable while the
       Calendar tile was Director-only. Opening the screen to the whole store
       turns it into ~106 devices, several of them shared iPads on the floor,
       each holding every leader's meeting titles and notes — and those titles
       are things like a performance conversation with somebody named in it.

       ⚠️⚠️ THE FILTER IS THE POINT, AND IT HAS TO BE HERE. Doing it in the tile
       would hide the rows, not withhold them. Same ruling l101Instructors.js
       makes about instructor notes: if it is genuinely sensitive it moves
       behind the Worker, it does not just come off the screen.

       ⛔ IT IS NOT A SECRECY GUARANTEE ON ITS OWN AND MUST NOT BE SOLD AS ONE.
       `gc-cal-events-v1:*` and `gc-cal-replies-v1:*` are ordinary kv_store rows
       and the SELECT policy is a DENY LIST, so until those prefixes are denied
       in the database they stay readable by anyone holding the publishable key
       that ships in the bundle. This route stops the Hub from HANDING them out;
       the SQL in supabase-schema.sql is what stops them being fetched directly.
       Both halves are needed and only one of them is code.

       ⚠️ WHO IS ASKING COMES FROM THE TOKEN. A uid in the query string would
       let anybody read anybody's diary by editing a number.

       ⚠️ OTHER PEOPLE'S ANSWERS COME BACK ONLY FOR MEETINGS YOU ORGANISE. An
       invitee gets the meeting and their own answer, never the roll-call —
       "who else said no" is the organiser's question, and on a shared iPad it
       is somebody else's business. */
    if (url.pathname === "/api/calendar-mine" && request.method === "GET") {
      const tok = await readToken(env, request.headers.get("x-hub-token"));
      if (!tok) return Response.json({ ok: false, error: "signed out" }, { status: 401, headers: { "cache-control": "no-store" } });
      try {
        const uid = bareId(tok.u || "");
        if (!uid) return Response.json({ ok: false, error: "we could not work out who you are" }, { status: 403, headers: { "cache-control": "no-store" } });

        /* Who could own a calendar, so the scan is bounded by leaders rather
           than by the roster. Three reads, the same three every gate here uses.
           ⚠️ NOT FILTERED BY STATUS. Somebody on their way out stops CREATING
           meetings (that gate is on the write route); a meeting they already
           called must keep showing to the people they invited. */
        const [seed, added, roles] = await Promise.all([
          sbGet(env, "gcfcr-hr-team-v1").catch(() => null),
          sbGet(env, HR_ADDED_KEY).catch(() => null),
          sbGet(env, "gcfcr-hr-roles").catch(() => null),
        ]);
        const addedArr = Array.isArray(added) ? added : [];
        const everyone = [...(Array.isArray(seed) ? seed : []), ...addedArr]
          .filter((p) => p && p.id != null)
          .map((p) => bareId(p.id));
        const ownerIds = [...new Set(everyone)]
          .filter((id) => calIsOwner(hrTitleFor(String(id), roles || {}, addedArr)));
        /* My own row is read whether or not I am an owner: I may organise
           nothing and still have been asked to plenty. */
        const scan = [...new Set([uid, ...ownerIds])];

        const rows = await Promise.all(scan.map((id) =>
          sbGet(env, calEventsKey(id)).then((v) => ({ id, list: calEventList(v) })).catch(() => ({ id, list: [] }))));

        const mine = [];
        const invited = [];
        for (const { id, list } of rows) {
          for (const ev of list) {
            if (calOrganises(ev, uid)) mine.push(ev);
            else if (calIsInvited(ev, uid)) invited.push({ organiserId: id, event: ev });
          }
        }

        /* My own answers, and the roll-call for MY meetings only. */
        const myReplies = calReplyMap(await sbGet(env, calRepliesKey(uid)).catch(() => null));
        const need = [...new Set(mine.flatMap((e) => (e.inviteeIds || []).map(bareId)).filter(Boolean))];
        const repliesByPerson = {};
        await Promise.all(need.map((id) =>
          sbGet(env, calRepliesKey(id))
            .then((v) => { repliesByPerson[id] = calReplyMap(v); })
            .catch(() => { /* one missing answer, never the whole screen */ })));

        return Response.json(
          { ok: true, uid, mine, invited, myReplies, repliesByPerson },
          { headers: { "cache-control": "no-store" } }
        );
      } catch (e) {
        return Response.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500, headers: { "cache-control": "no-store" } });
      }
    }

    /* ═══ WHO IS ALREADY BUSY THEN? ═══════════════════════════════════════
       Bri, Aug 11 2026: "Double booking can alert the person scheduling that
       someone is already booked, but they can push the invite anyway."

       ★★ IT HAS TO BE A ROUTE, AND THAT IS A CONSEQUENCE OF /api/calendar-mine.
       A browser is only ever handed its OWN meetings now, so the person doing
       the scheduling has no way to look at anybody's diary — which is correct,
       and means the answer has to come from here.

       ⚠️⚠️ WHAT COMES BACK DEPENDS ON WHOSE DIARY IT IS. For SOMEBODY ELSE it
       is a time and nothing else: "busy 9:00 to 10:00". Never a title, never a
       note, never who else is in it. The scheduler needs to know there is a
       clash; they do not need to know that Hannah is in a performance
       conversation, and on a shared iPad that is somebody else's business.
       For the CALLER'S OWN id the title comes too, because Bri's ruling is that
       a double-booked person compares "both items" — and both of those are
       theirs to see.

       ⚠️ IT NEVER BLOCKS AND HAS NO OPINION. It answers a question. Every
       caller ends up able to send the invitation anyway, which is her sentence.

       ⚠️ AN UNANSWERED INVITATION IS NOT A COMMITMENT (Matt, Aug 12 2026), so
       it does not count as busy. `busyItems` in calendarStore is the one place
       that decides this, shared with the screen. */
    if (url.pathname === "/api/calendar-busy" && request.method === "POST") {
      const tok = await readToken(env, request.headers.get("x-hub-token"));
      if (!tok) return Response.json({ ok: false, error: "signed out" }, { status: 401, headers: { "cache-control": "no-store" } });
      try {
        const uid = bareId(tok.u || "");
        if (!uid) return Response.json({ ok: false, error: "we could not work out who you are" }, { status: 403, headers: { "cache-control": "no-store" } });
        const b = await request.json().catch(() => null);
        const at = String((b && b.at) || "");
        const mins = (b && b.mins) == null ? 30 : b.mins;
        const ids = [...new Set((Array.isArray(b && b.ids) ? b.ids : []).map(bareId).filter(Boolean))];
        if (!at) return Response.json({ ok: false, error: "bad request" }, { status: 400, headers: { "cache-control": "no-store" } });
        /* The same bound the create route puts on an invitation. */
        if (ids.length > 60) return Response.json({ ok: false, error: "too many people" }, { status: 400, headers: { "cache-control": "no-store" } });
        if (!ids.length) return Response.json({ ok: true, busy: {} }, { headers: { "cache-control": "no-store" } });

        /* Every calendar owner's events, read once for the whole question
           rather than once per person. Same bounded scan /api/calendar-mine
           uses and for the same reason: leaders, never the roster. */
        const [seed, added, roles] = await Promise.all([
          sbGet(env, "gcfcr-hr-team-v1").catch(() => null),
          sbGet(env, HR_ADDED_KEY).catch(() => null),
          sbGet(env, "gcfcr-hr-roles").catch(() => null),
        ]);
        const addedArr = Array.isArray(added) ? added : [];
        const everyone = [...(Array.isArray(seed) ? seed : []), ...addedArr]
          .filter((p) => p && p.id != null).map((p) => bareId(p.id));
        const ownerIds = [...new Set(everyone)]
          .filter((id) => calIsOwner(hrTitleFor(String(id), roles || {}, addedArr)));
        /* The people being asked about may organise nothing and still have
           accepted plenty, so their own rows are read too. */
        const scan = [...new Set([...ownerIds, ...ids])];
        const rows = await Promise.all(scan.map((id) =>
          sbGet(env, calEventsKey(id)).then((v) => ({ id, list: calEventList(v) })).catch(() => ({ id, list: [] }))));
        const allEvents = rows.flatMap((r) => r.list);

        const target = { at, mins };
        const busy = {};
        for (const id of ids) {
          const organised = allEvents.filter((e) => calOrganises(e, id));
          const invitedPairs = allEvents.filter((e) => calIsInvited(e, id)).map((e) => ({ event: e }));
          const replies = calReplyMap(await sbGet(env, calRepliesKey(id)).catch(() => null));
          const hits = calClashesFor(target, calBusyItems(organised, invitedPairs, replies));
          if (!hits.length) continue;
          /* ⚠️ THE TITLE IS STRIPPED FOR EVERYBODY BUT THE CALLER. See the
             header. This is the line that decides it. */
          busy[id] = hits.map((h) => (id === uid
            ? { at: h.at, mins: h.mins, title: h.title, why: h.why }
            : { at: h.at, mins: h.mins }));
        }
        return Response.json({ ok: true, busy }, { headers: { "cache-control": "no-store" } });
      } catch (e) {
        return Response.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500, headers: { "cache-control": "no-store" } });
      }
    }

    if (url.pathname === "/api/quiet-people" && request.method === "GET") {
      const tok = await readToken(env, request.headers.get("x-hub-token"));
      if (!tok) return Response.json({ ok: false, error: "signed out" }, { status: 401, headers: { "cache-control": "no-store" } });
      try {
        if (await hrRankForUid(env, String(tok.u)) < NUDGE_MIN_RANK) {
          return Response.json({ ok: false, error: "not allowed" }, { status: 403, headers: { "cache-control": "no-store" } });
        }
        /* Still needed below, to keep the asker out of their own list. It is a
           roster-name lookup, not part of the rank test. */
        const myName = hrPrimaryName(String(tok.u));
        const people = await quietPeople(env, new Date());
        /* Never lists the person asking. Being told you have not opened the
           app, on the app you are looking at, is nonsense. */
        const out = myName ? people.filter((p) => !isBoardOwner(p.name, { names: [myName] })) : people;
        return Response.json({ ok: true, days: 7, people: out }, { headers: { "cache-control": "no-store" } });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 500, headers: { "cache-control": "no-store" } });
      }
    }

    /* ═══ NUDGE A PERSON ════════════════════════════════════════════════
       Matt, Aug 3 2026, on the weekly digest naming three people who set the
       Hub up and never opened it: "Nudge them."

       Until now there was NO way to do that. /api/push-send exists but needs
       RUN_JOB_KEY, which only Matt holds, and it deliberately stamps "Test —"
       on the title so a hand-fired push can never be mistaken for a real
       alert. Correct for what it is; useless for actually reaching somebody.

       ⚠️ RANK 3 AND UP, resolved HERE from HR data. The session token carries
       a roster id and nothing else — no tier, deliberately, because a tier the
       client sent is one the client chose. Rank 3 is Senior Trainer / Team
       Leader and above, which is the same line the app calls tier 2: the
       people who actually chase a missing sign-off.

       ⚠️ ONE NUDGE PER PERSON PER 30 MINUTES, and the guard is only armed
       AFTER a send that reached a device. This lands on a real phone's lock
       screen. Without the limit, a row of leaders each tapping the same button
       buzzes one team member six times for the same thing, and the first
       person to be nudged twice stops reading them at all. A send that failed
       is not rate-limited, so a genuine retry is never blocked.

       ⚠️ REPORTS WHAT ACTUALLY HAPPENED. `sent` is devices the push service
       accepted; `reached` is devices found. reached 0 means the NAME did not
       resolve — nobody was messaged, and the caller must be told that rather
       than shown a tick. sent 0 with reached 1 is a dead subscription. This is
       the same honesty /api/push-send already reports and the reason that
       route was worth copying. */
    if (url.pathname === "/api/nudge" && request.method === "POST") {
      const tok = await readToken(env, request.headers.get("x-hub-token"));
      if (!tok) return Response.json({ ok: false, error: "signed out" }, { status: 401, headers: { "cache-control": "no-store" } });
      try {
        if (await hrRankForUid(env, String(tok.u)) < NUDGE_MIN_RANK) {
          return Response.json({ ok: false, error: "not allowed" }, { status: 403, headers: { "cache-control": "no-store" } });
        }
        /* Still needed below, to keep the asker out of their own list. It is a
           roster-name lookup, not part of the rank test. */
        const myName = hrPrimaryName(String(tok.u));

        const b = await request.json().catch(() => null);
        const to = String((b && b.to) || "").trim();
        const text = String((b && b.text) || "").trim().slice(0, 140);
        if (!to || !text) {
          return Response.json({ ok: false, error: "to and text are required" }, { status: 400, headers: { "cache-control": "no-store" } });
        }
        /* Nudging yourself is always a mis-tap, and it wastes the 30 minute
           window on the one person who did not need telling. */
        if (myName && isBoardOwner(to, { names: [myName] })) {
          return Response.json({ ok: false, error: "that is you" }, { status: 400, headers: { "cache-control": "no-store" } });
        }

        const rlKey = `nudge:${to.toLowerCase().replace(/\s+/g, " ")}`;
        let recent = null;
        try { recent = await env.GATE_CITY_KV.get(rlKey); } catch { recent = null; }
        if (recent) {
          return Response.json({ ok: false, error: "already nudged in the last half hour", rateLimited: true }, { status: 429, headers: { "cache-control": "no-store" } });
        }

        const r = await pushToPerson(env, to, {
          title: STORE.appName,
          body: text,
          url: "/",
        });
        if (r && Number(r.sent) > 0) {
          try { await env.GATE_CITY_KV.put(rlKey, String(myName || tok.u), { expirationTtl: 60 * 30 }); } catch { /* limit is best-effort */ }
        }
        return Response.json({ ok: true, to, ...r }, { headers: { "cache-control": "no-store" } });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 500, headers: { "cache-control": "no-store" } });
      }
    }

    /* ═══ WHICH BUILD IS LIVE ═══════════════════════════════════════════
       🐛 Matt, Aug 3 2026: "I closed my app out, signed out and in but it
       didn't update until I got home." Bri the same day, for her team.

       The cause is Cloudflare holding index.html per data centre, and three
       attempts at fixing it from the edge side went nowhere: a CDN-only
       cache-control directive, a full purge, and a Cache Rule bypassing
       everything outside /assets/. The page still answers from cache and this
       Worker never gets to stamp a validator on it. Measured, not assumed —
       and /api/ routes report a cache hit too, so that header cannot be
       trusted here as a signal of anything.

       ⇒ STOP FIGHTING THE CACHE AND LET THE APP ASK. index.html names the
       hashed entry bundle, and that filename IS the build's identity: a new
       build is always a new filename. The running app already knows which one
       it loaded. If the two disagree, the app is stale, whatever any cache in
       between believes.

       Read through ASSETS, which is the deployment itself and not a cached
       copy of it, so this answers for the build that is actually deployed. */
    if (url.pathname === "/api/build" && request.method === "GET") {
      try {
        const idx = new URL(request.url);
        idx.pathname = "/index.html";
        idx.search = "";
        const res = await env.ASSETS.fetch(new Request(idx.toString(), { method: "GET" }));
        const html = await res.text();
        const m = html.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/);
        /* No match means the shape of index.html changed. Say so rather than
           returning a null the client would have to guess the meaning of —
           a client that cannot read this must do NOTHING, never nag. */
        if (!m) return Response.json({ ok: false, error: "no entry bundle in index.html" }, { status: 500, headers: { "cache-control": "no-store" } });
        return Response.json({ ok: true, build: m[1] }, { headers: { "cache-control": "no-store" } });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 500, headers: { "cache-control": "no-store" } });
      }
    }

    /* ═══ PUBLISH A WEEK TO THE PEOPLE ON IT ══════════════════════════════
       ⚠️⚠️ THE BROWSER SENDS A DATE AND NOTHING ELSE. It does not choose the
       recipients and it does not choose the words. This route reads the saved
       schedule itself, works out who is on it, and sends each person a fixed
       message about THEIR OWN shifts.

       That is the whole security design. A route that took a list of ids and a
       body would be an "email-and-push spam cannon pointed at real leaders" —
       the exact phrase already written above /api/tool-notify, about a hole
       this Worker has had before. Roughly a hundred phones is not something a
       signed-in team member should be able to aim.

       ⚠️ AND IT CANNOT BE UNSENT, which is why the id list is checked here and
       not only in the screen. See SCHEDULE_PUBLISH_IDS.
       ⚠️ &quiet=1 IS HONOURED because pushToUid honours it, so a dry run says
       who it WOULD have reached without waking anybody. */
    if (url.pathname === "/api/schedule-publish" && request.method === "POST") {
      try {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        const me = bareUid(tok.u);
        if (!me || !SCHEDULE_PUBLISH_IDS.some((id) => bareUid(id) === me)) {
          return Response.json({ ok: false, error: "not allowed to publish" }, { status: 403 });
        }
        const b = await request.json().catch(() => null);
        const monday = String((b && b.monday) || "");
        /* ⚠️ VALIDATED, because this string becomes a storage key. */
        if (!/^\d{4}-\d{2}-\d{2}$/.test(monday)) {
          return Response.json({ ok: false, error: "bad week" }, { status: 400 });
        }
        const wk = await sbGet(env, `gcfcr-schedule-v1-${monday}`);
        if (!wk || !wk.days) {
          return Response.json({ ok: false, error: "no schedule saved for that week" }, { status: 404 });
        }

        /* Gather each person's own shifts. One push per person, never one per
           shift — four notifications for four days is how an app gets muted. */
        const byPerson = new Map();
        Object.keys(wk.days).forEach((day) => {
          const sides = (wk.days[day] || {}).sides || {};
          Object.keys(sides).forEach((side) => {
            ((sides[side] || {}).shifts || []).forEach((sh) => {
              if (!sh || sh.id == null) return;
              const id = String(sh.id);
              const row = byPerson.get(id) || { name: sh.name || "", days: [] };
              row.days.push({ day, start: Number(sh.start), end: Number(sh.end) });
              byPerson.set(id, row);
            });
          });
        });

        const clock = (m) => {
          const h = Math.floor(m / 60), mm = m % 60;
          const ap = h >= 12 ? "pm" : "am";
          const hh = (h % 12) || 12;
          return mm ? `${hh}:${String(mm).padStart(2, "0")}${ap}` : `${hh}${ap}`;
        };

        let sent = 0, skipped = 0;
        const would = [];
        for (const [id, row] of byPerson) {
          row.days.sort((a, b2) => a.day.localeCompare(b2.day));
          const body = row.days
            .map((d) => `${d.day} ${clock(d.start)}-${clock(d.end)}`)
            .join(" · ");
          const r = await pushToUid(env, id, {
            title: `Your schedule for week of ${monday}`,
            body: body || "No shifts this week.",
            url: "/",
          });
          if (r && r.wouldPush) would.push(r.wouldPush);
          if (r && r.sent) sent += r.sent; else skipped++;
        }
        return Response.json({ ok: true, people: byPerson.size, sent, skipped, would });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 500 });
      }
    }

    if (url.pathname === "/api/push-key" && request.method === "GET") {
      if (!env.VAPID_PUBLIC_KEY) {
        return Response.json({ ok: false, error: "VAPID_PUBLIC_KEY is not set on this Worker" }, { status: 500 });
      }
      return Response.json({ ok: true, key: env.VAPID_PUBLIC_KEY });
    }

    if (url.pathname === "/api/push-subscribe" && request.method === "POST") {
      /* Locked Jul 31 2026: unauthenticated, anyone could register a device
         under any roster id and receive that person's targeted alerts. */
      const tok = await readToken(env, request.headers.get("x-hub-token"));
      if (!tok) return Response.json({ ok: false, error: "unauthorized — sign in again" }, { status: 401 });
      try {
        const b = await request.json();
        const sub = b && b.subscription;
        if (!sub || !sub.endpoint) {
          return Response.json({ ok: false, error: "subscription is required" }, { status: 400 });
        }
        /* Keyed by ENDPOINT, with uid stored inside — one person can carry
           several devices, and re-subscribing from the same device overwrites
           rather than duplicating. The client re-POSTs whenever the signed-in
           user changes, which is how a shared iPad stops delivering to the
           person who used it last. */
        const all = await pushSubsGet(env);
        /* ★ THE NAME NOW COMES FROM THE ROSTER, NOT THE BROWSER (Matt, Aug 10
           2026: "fix the id 21 push sub thing").

           🐛 WHAT WENT WRONG. One stored device reads uid 21 with the name
           "Thanh Nguyen". Hannah is 21; Thanh is 55. The uid was right — it
           always is, it comes from the token — but the NAME was whatever the
           page had in localStorage when it re-POSTed. A shared iPad, Thanh
           signs out, Hannah signs in, and the subscribe fires before the cached
           identity has caught up. Exactly the stale-identity trap CLAUDE.md
           names, arriving through a field nobody was guarding.

           ⚠️ ALERTS WERE NEVER MISROUTED, and that is worth stating rather than
           implying. Delivery keys off `uid`, which was correct throughout. What
           broke is every screen that shows the NAME behind an id: the weekly
           report's quiet list resolves names from this map, so id 21 could be
           printed as Thanh, to the owner, HR and leadership.

           ⚠️ WHY NOT TRUST THE BODY AT ALL: the same reason the uid does not.
           This is the identity of a device that receives somebody's alerts, and
           the server already knows who the token belongs to. `resolveNotifyEmails`
           makes the same call for the same reason — the client's claim is a
           hint, never the record.
           ⚠️ FALLS BACK, NEVER BLANKS. An unreadable roster keeps the body's
           name rather than storing null, because a device with no name at all
           is harder to recognise than one with a stale one.
           ⚠️ SELF-HEALING. The client re-POSTs whenever the signed-in user
           changes, so the bad row corrects itself the next time anyone signs in
           on that device. Nothing here rewrites stored data by hand. */
        const trueName = await rosterNameForUid(env, String(tok.u));
        all[sub.endpoint] = {
          subscription: sub,
          /* From the TOKEN, not the body. The body's uid would let any signed-in
             caller re-point a device at someone else's alerts; the token's uid
             was issued by the server at PIN verify and names the real person. */
          uid: String(tok.u),
          name: trueName || b.name || null,
          // ⚠️ RE-APPLIED. This copy predated the fix. App.jsx sends `role`;
          // without persisting it, role-owned register rows match nobody AND
          // runInputPush's overseer exclusion (which filters on this field)
          // can never fire. Self-heals as people sign in.
          role: b.role ?? null,
          tier: b.tier ?? null,
          at: new Date().toISOString(),
        };
        await pushSubsSet(env, all);
        return Response.json({ ok: true, devices: Object.keys(all).length });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 500 });
      }
    }

    if (url.pathname === "/api/push-unsubscribe" && request.method === "POST") {
      try {
        /* Locked Aug 2 2026. /api/push-subscribe was locked Jul 31; its two
           siblings were missed, so knowing an endpoint was enough to silence
           someone else's alerts. "You have to know the endpoint" is not a
           lock — the endpoint list itself lives in gcfcr-push-subs-v1. */
        if (!(await readToken(env, request.headers.get("x-hub-token")))) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        const b = await request.json();
        if (!b || !b.endpoint) {
          return Response.json({ ok: false, error: "endpoint is required" }, { status: 400 });
        }
        const all = await pushSubsGet(env);
        if (all[b.endpoint]) {
          delete all[b.endpoint];
          await pushSubsSet(env, all);
        }
        return Response.json({ ok: true });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 500 });
      }
    }

    if (url.pathname === "/api/push-test" && request.method === "POST") {
      try {
        /* Locked Aug 2 2026, same reason as push-unsubscribe above: without
           this, anyone holding an endpoint could push arbitrary-looking
           notifications at that person's phone. */
        if (!(await readToken(env, request.headers.get("x-hub-token")))) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        if (!vapidReady(env)) {
          return Response.json({ ok: false, error: "VAPID keys are not set on this Worker" }, { status: 500 });
        }
        const b = await request.json();
        const all = await pushSubsGet(env);
        const rec = b && b.endpoint ? all[b.endpoint] : null;
        if (!rec) {
          return Response.json({ ok: false, error: "that device isn't registered — turn alerts off and on again" }, { status: 404 });
        }
        const r = await sendPush(env, rec.subscription, {
          title: STORE.appName,
          body: "Alerts are on. This is what a notification will look like.",
          url: "/",
        });
        /* A push service reporting the endpoint dead is the ONE case worth
           acting on here — it means the browser threw the subscription away
           and the person needs to re-enable, so drop it rather than leave a
           corpse that fails every future send. */
        if (r.gone) {
          delete all[b.endpoint];
          await pushSubsSet(env, all);
          return Response.json({ ok: false, error: "this device is no longer registered — turn alerts off and on again" }, { status: 410 });
        }
        return Response.json({ ok: r.ok, status: r.status });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 500 });
      }
    }

    // ── Tool-open event log ────────────────────────────────────────────
    // Answers "which tools actually get used, by whom, how often" — the
    // question kv_store CANNOT answer, because it is last-write-wins: it
    // records WHEN a tool last wrote, never HOW MANY TIMES anyone opened it.
    //
    // ⚠️ KEYED ON THE SIGNED-IN ROSTER ID, NOT A TYPED NAME. The older
    // `submissions` table takes `submitted_by` as free text, and the result
    // is one person spread across "monica g ", "Monica Garcia" and
    // "Team Member" — uncountable. uid is the roster id; `person` is stored
    // only so a human can read a row without a join.
    //
    // Fire-and-forget by design: this must NEVER be able to stop a tool from
    // opening. Any failure is swallowed and the row is simply lost.
    if (url.pathname === "/api/log-open" && request.method === "POST") {
      /* Declared out here, not inside the try, because the response below has to
         report whether there was a session and the try's scope ends before it.
         Caught by the scope check, which is the whole reason it runs. */
      let tok = null;
      try {
        const b = await request.json();
        if (!b || !b.tool) return Response.json({ ok: false }, { status: 400 });
        /* Locked Jul 31 2026 — QUIETLY. No session, no row, still 200: anyone
           could pump junk rows into the usage data, but a refused log must
           look identical to a logged one, because nothing here may ever stop
           a tool from opening. uid comes from the TOKEN so a row can never be
           filed as someone else. */
        tok = await readToken(env, request.headers.get("x-hub-token"));
        if (tok) await fetch(`${env.SUPABASE_URL}/rest/v1/tool_events`, {
          method: "POST",
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            tool: String(b.tool).slice(0, 60),
            uid: String(tok.u).slice(0, 20),
            person: b.person ? String(b.person).slice(0, 80) : null,
            tier: Number(b.tier) || 0,
          }),
        });
      } catch { /* logging must never break the app */ }
      /* Still always 200, and a tool must still open no matter what happens
         here. What changed is that the answer now SAYS whether the row was
         actually written.

         🐛 THE SILENT DROP (Aug 7 2026). `if (tok)` had no else. An expired
         session meant the row was quietly discarded and the caller was told ok.
         Nick used the Hub at the store on Tuesday, nothing was recorded, and
         the Hub then listed him under "has not opened the app" and tried to
         nudge him for it. Matt: "i know Nick used it on Tuesday at the store
         but it was trying to nudge him."

         ⚠️ `ok` STAYS TRUE ON PURPOSE. Callers treat this as fire-and-forget and
         must keep doing so — turning a dead session into a failed request here
         is how a logging call starts blocking a tile. `logged: false` is an
         observation, not an error: the client uses it to notice the session is
         dead, never to change what it just did. */
      return Response.json({ ok: true, logged: !!tok });
    }

    /* ═══ /api/stale-check — WHICH OF THESE NAMES HAS LEFT ═══════════════════
       🐛 THE LAST OF THE TERM-ARCHIVE LEAK (Aug 7 2026 sweep). This morning's
       fix took the 528 records — dates, rehire flags and the written REASON on
       525 of them — out of the browser and behind /api/term-archive. What it
       left behind was termNames.js: 517 former employees, names only, still
       compiled into a tier-1 chunk anyone could download. Milder, and not
       nothing. It shipped to every phone in the store so the setup board could
       answer one question.

       ⚠️ IT ANSWERS ONLY ABOUT NAMES THE CALLER ALREADY HAS. The board POSTs the
       names written on TODAY'S board and gets back which of those have left. It
       can never return a name that was not sent, so it cannot be used to walk
       the archive or ask "did X ever work here" about somebody the caller does
       not already see. That property is the whole design and must survive any
       future edit: never widen this to return anything the request did not
       contain.

       ⚠️ THAT INVARIANT WAS DECLARED HERE AND NOT ACTUALLY ENFORCED until Aug
       10 2026 — the loop below returned the ARCHIVE's spelling, so the reply
       routinely contained names the request did not. It now returns the
       caller's own string. If you change that back, you re-open the leak.

       ⚠️ MATCHING IS sameLeader, THE SAME FUNCTION THE BOARD USED. Not a
       re-implementation — the tile imported it from nameMatch.js and so does
       this file. Its scars come with it, which is exactly why BOTH sides must
       now carry a surname before the archive is consulted: sameLeader matches
       when either side is a bare first name, and that is what let a caller walk
       the archive one common first name at a time. With two tokens on both
       sides it requires the last initials to agree.

       ⚠️ A CAP, BECAUSE THIS IS AN UNBOUNDED LIST FROM A CLIENT. 400 names is
       far beyond any real board (a big day is ~60 cells) and stops a malformed
       or hostile caller making the Worker walk 528 records a thousand times. */
    if (url.pathname === "/api/stale-check" && request.method === "POST") {
      try {
        const tok = await readToken(env, request.headers.get("x-hub-token"));
        if (!tok) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        const b = await request.json().catch(() => null);
        const names = Array.isArray(b && b.names) ? b.names.slice(0, 400) : [];
        if (!names.length) return Response.json({ ok: true, left: [] });
        /* 🐛 THIS ROUTE BROKE THE INVARIANT ITS OWN HEADER DECLARES (Aug 10
           2026, sweep finding 10). The header above says "It can never return a
           name that was not sent" and "never widen this to return anything the
           request did not contain" — and the code then pushed `hit.name`, the
           ARCHIVE'S spelling. Combined with sameLeader, which matches when one
           side is a bare first name, that turned a yes/no question into a
           readable index of the 517-name termination archive: POST
           ["Adriana","Maria","Jessica",...] and it answers with full names of
           people the caller has never seen. A stated safety property nobody
           re-checked is how this survived — the third time that exact pattern
           has shown up in this sweep.
           ⚠️ IT ALSO FIRED WITH NO ATTACKER. 32 of 98 current first names pull a
           stranger out of the archive, so the board's own "no longer employed"
           warning could print a person nobody in the store has ever met.

           ⇒ TWO CHANGES, AND BOTH ARE NEEDED.
           1. BOTH SIDES MUST CARRY A SURNAME. A bare "Adriana" no longer
              reaches the archive at all, which is what kills both the walk and
              the false positive. sameLeader then requires the last initials to
              agree, so "Adriana C" cannot match "Adriana Arias".
           2. RETURN THE CALLER'S OWN STRING, never the archive's. The caller
              only needs "is this cell stale" — it already has the text. The
              board re-matches the reply against its own cells, so this keeps
              working unchanged while the reply stops carrying anything new.
           ⚠️ THE COST, STATED: a genuinely stale cell written as a bare first
           name is no longer flagged. That is the correct trade — it was being
           "flagged" by matching a stranger a third of the time. */
        const left = [];
        for (const raw of names) {
          const n = String(raw || "").trim();
          if (!n || nameParts(n).length < 2) continue;
          const hit = TERM_ARCHIVE.find(
            (t) => t && t.name && nameParts(t.name).length >= 2 && sameLeader(t.name, n),
          );
          if (hit && !left.includes(n)) left.push(n);
        }
        return Response.json({ ok: true, left });
      } catch {
        /* A thrown request must not take the board down. The caller treats any
           failure as "no stale names", which is Matt's ruling: skip the warning
           silently. */
        return Response.json({ ok: true, left: [] });
      }
    }

    /* ═══ /api/whoami — WHO DOES THE SERVER THINK THIS IS ════════════════════
       🐛 THE GAP THIS FILLS (Aug 7 2026). The browser keeps its identity in
       localStorage (`gcfcr-access-user`) and the server keeps its own in the
       signed token, and until now NOTHING compared the two. They can drift, and
       they have: `tool_events` shows uid 21 — Hannah, Executive Director over
       HR — carrying 20 opens under Thanh Nguyen's name across Aug 4-6, and uid
       48 carrying two different people. That uid is not a client claim;
       /api/log-open takes it from the token, and its own comment says "uid comes
       from the TOKEN so a row can never be filed as someone else". So for those
       sessions the Worker genuinely believed one person was another — and uid is
       what hrFullReader, the HR own-row read filter and /api/doc-ack all key on.

       This is the missing half: it lets the browser ask "who am I, according to
       you" and act when the answer disagrees with what it has cached.

       ⚠️ IT RETURNS THE UID AND NOTHING ELSE ABOUT THE PERSON. No name, no role,
       no tier. Those live behind gates that already exist, and a convenience
       field here would become a second source of truth for the exact thing this
       exists to stop having two of.
       ⚠️ 200 WITH signedIn:false, NOT 401. An expired session is the normal end
       of a shift, not an error, and the caller has to tell "your token is dead"
       apart from "the request failed". Collapsing those two is the whole class
       of bug being fixed here. */
    /* ══ STARS THE HUB AWARDS ON ITS OWN ═══════════════════════════════════
       POST /api/star-auto. No body. Answers { ok, awarded, balanceAdded }.

       Matt, Aug 14 2026: "i want stars to be autoassigned by the hub" and
       "dont award someone who got wrote up but keep it auto."

       ⚠️⚠️ IT AWARDS THE CALLER AND ONLY THE CALLER, AND TAKES NO PERSON ID.
       That is the whole security property. Every piece of evidence is read by
       the SERVER from the caller's own token — the browser cannot say who it is
       or what it finished. `gcfcr-hr-tokens-v1` is rank 6 to write through
       /api/kv-set for exactly this reason, and a route that accepted an id
       would be a way around that gate for anybody with curl.

       ⚠️ SAFE TO CALL A HUNDRED TIMES. Awards carry an id derived from the
       person and the thing they finished, so a second call finds it already in
       the ledger and writes nothing. The screen calls this after a successful
       training save; a retry, a double-tap or a refresh costs nothing.

       ⚠️⚠️ MEMBER-ROW MERGE, NEVER A WHOLE-MAP WRITE. The ledger is ONE map
       holding every person's entries, the same shape as gcfcr-hr-files — and a
       read-modify-write of that whole map is what silently deleted Evelyn's
       documentation on Jul 29 2026. Two writes minutes apart, both SUCCEEDED,
       the second landed on top. This touches one row.

       ⚠️ WHY NOT A CRON. A nightly job would read one training record per
       person: up to 106 subrequests against a Cloudflare limit near 50. The 5am
       sweep hit that ceiling twice this week, which is why its bundle scan is
       capped at 6 chunks. Three reads at the moment somebody finishes is the
       same answer for a fraction of the budget, and it lands while they are
       still looking at the screen. */
    if (url.pathname === "/api/star-auto" && request.method === "POST") {
      const tok = await readToken(env, request.headers.get("x-hub-token"));
      if (!tok) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
      const uid = bareId(tok.u || "");
      if (!uid) return Response.json({ ok: false, error: "we could not work out who you are" }, { status: 403 });

      try {
        const rec = await sbGet(env, hubTrainingKey(uid));
        /* Nothing finished is a real answer and not an error. */
        if (!hubHasWatched(rec)) return Response.json({ ok: true, awarded: 0, why: "nothing finished yet" });

        /* ⚠️ THE DECK KEY COMES OFF THE STORED RECORD, not from the request and
           not recomputed from their rank now. What they finished is what the
           record says they finished; a rank change next month must not turn one
           completed deck into a second award. */
        const deckKey = String((rec && rec.deckKey) || "").trim();
        if (!deckKey) return Response.json({ ok: true, awarded: 0, why: "the record does not say which path" });
        const deck = hubRequiredDeck(await hubRank(env, uid), 0);
        const deckName = (deck && deck.key === deckKey && deck.title) ? deck.title : "a training path";

        const filesRaw = await sbGet(env, "gcfcr-hr-files");
        const files = filesRaw && typeof filesRaw === "object" && !Array.isArray(filesRaw) ? filesRaw : {};
        const ledgerRaw = await sbGet(env, "gcfcr-hr-tokens-v1");
        const ledger = ledgerRaw && typeof ledgerRaw === "object" && !Array.isArray(ledgerRaw) ? ledgerRaw : {};
        const mine = Array.isArray(ledger[uid]) ? ledger[uid] : [];

        /* ⚠️ THE WINDOW IS 90 DAYS. A write-up from last year must not stop
           somebody earning forever — that is a life sentence for one late
           shift, and it would quietly make the whole feature look broken to the
           person it silenced. */
        const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

        const wanted = starAwardsFor(
          { id: uid },
          { decksDone: [{ key: deckKey, name: deckName }] },
          { fileRows: Array.isArray(files[uid]) ? files[uid] : [], sinceIso: since, alreadyAwarded: starAwardedIds(mine) },
        );
        if (!wanted.length) return Response.json({ ok: true, awarded: 0 });

        const added = [];
        for (const a of wanted) {
          /* ⚠️ makeEntry IS THE ONLY THING THAT MAY BUILD A MOVEMENT, and it
             returns null rather than a half-valid one. A null here is skipped
             rather than stored, so a bad rule can never put an unexplained
             entry in somebody's ledger. */
          const e = tkMakeEntry({ personId: uid, amount: a.amount, reason: a.reason, byId: "hub", type: TK_TYPES.EARN });
          if (!e) continue;
          e.awardId = a.awardId;   // what makes a rerun a no-op
          added.push(e);
        }
        if (!added.length) return Response.json({ ok: true, awarded: 0 });

        /* ⚠️⚠️ RE-READ IMMEDIATELY BEFORE THE WRITE, AND REPLACE ONE ROW.
           🐛 This wrote back the `ledger` object read further up, with two more
           network round-trips in between. `gcfcr-hr-tokens-v1` is ONE map
           holding every person's entries, so that was a read-modify-write of
           EVERYBODY — the exact shape that silently deleted Evelyn's
           documentation on Jul 29 2026, where two writes minutes apart both
           SUCCEEDED and the second landed on top.

           The comment at the top of this route already claimed a member-row
           merge. It was not one. That is the worst kind of wrong, because the
           next person to read it stops looking.

           It is not hypothetical: a class finishing training together puts
           several people through here inside the same second, and a star
           REDEEMED in HR Console between the read and the write would be wiped
           with no error on any screen.

           ⇒ The freshest copy is read here and only this person's row is
           replaced — the same trade the /api/hr-store member-row door makes and
           the same one boardSwap.js makes. One round trip of exposure instead
           of three.

           ⚠️ DEDUPE IS RE-CHECKED AGAINST THE FRESH ROW. Without it, two calls
           racing on the same finished deck both pass the check above and both
           write, so one award lands twice. `awardedIds` returns a SET, so this
           is `.has` and never `.includes` — which reads fine and is always
           false on a Set. */
        const freshRaw = await sbGetStrict(env, "gcfcr-hr-tokens-v1");
        const fresh = freshRaw && typeof freshRaw === "object" && !Array.isArray(freshRaw) ? freshRaw : {};
        const freshMine = Array.isArray(fresh[uid]) ? fresh[uid] : [];
        const have = starAwardedIds(freshMine);
        const toWrite = added.filter((e) => !have.has(e.awardId));
        if (!toWrite.length) return Response.json({ ok: true, awarded: 0 });

        fresh[uid] = [...toWrite, ...freshMine];
        await sbSet(env, "gcfcr-hr-tokens-v1", fresh);
        return Response.json({
          ok: true,
          awarded: toWrite.length,
          balanceAdded: toWrite.reduce((n, e) => n + e.amount, 0),
        });
      } catch {
        /* ⚠️ NEVER FAILS THE THING THAT CALLED IT. The training save has already
           landed by this point; a star that did not get awarded is worth far
           less than a screen telling somebody their training did not save. */
        return Response.json({ ok: true, awarded: 0, why: "could not check just now" });
      }
    }

    if (url.pathname === "/api/whoami" && request.method === "GET") {
      const tok = await readToken(env, request.headers.get("x-hub-token"));
      if (!tok) {
        return Response.json({ ok: true, signedIn: false }, { headers: { "cache-control": "no-store" } });
      }
      /* Legacy census — see the twin at /api/kv-set. Fires on every mount, so
         between the two of them every active device is counted once a day.
         ⚠️ A COUNTER NOBODY HAS SEEN MOVE HAS NOT BEEN TESTED. Before reading
         a 0 here as "no old tokens left", present one pre-split token on
         purpose and watch the number go up. A silent 0 read as an all-clear is
         exactly how this repo has been burned before. */
      if (tok.__legacy) ctx.waitUntil(bumpCounter(env, "legacy:session", 86400));
      /* ★★ RENEWED HERE TOO, AND THIS IS THE HALF THAT WAS MISSING (Matt,
         Aug 14 2026: "This starting to get annoying").

         Renewal used to happen on /api/kv-set alone — that is, only when
         somebody SAVED something. Opening the Hub did not renew. Reading the
         dashboard did not renew. So a person could use this app every day and
         still be thrown out, because the clock ran from their last WRITE and
         most of what anyone does here is look. A team member who opens it to
         check their schedule and saves nothing got the expired banner daily.

         ⚠️ THIS ROUTE IS THE RIGHT PLACE AND A READ ROUTE WOULD NOT BE. It runs
         from a mount-time effect in App.jsx, so it fires when a PERSON opens
         the app — not on a timer. Six things in this app poll in the
         background; renewing on any of those would mean a shared store iPad
         left sitting on the dashboard never ages out at all, which is worse
         than the bug being fixed. Opening is a person. Polling is not.

         ⚠️ AN EXPIRED TOKEN STILL CANNOT RENEW ITSELF. `readToken` already
         refused it above and returned signedIn:false, so this line is only ever
         reached by a session that was still alive. Renewal extends a live
         session; it never resurrects a dead one. Same rule as the save path. */
      return Response.json(
        { ok: true, signedIn: true, uid: String(tok.u), expires: Number(tok.e) || null, remembered: !!tok.r },
        {
          headers: {
            "cache-control": "no-store",
            "x-hub-token-refresh": await mintToken(env, tok.u, !!tok.r),
          },
        },
      );
    }

    /* ═══ /api/pin-help — "I DO NOT REMEMBER MY PIN" ═════════════════════════
       ⚠️ THIS EXISTS BECAUSE THE FIX NEEDED IT. Signing somebody out when their
       identity is in doubt is only safe if they can get back in, and until now
       a forgotten PIN had NO path at all — the only reset is HR Console, which
       five people can open, and nothing on the sign-in screen said so. Matt:
       "but what if they dont remember their pin".

       It does not reset anything. It asks a human to, which is the correct
       amount of power for an unauthenticated endpoint to have.

       ⚠️ IT ALWAYS ANSWERS ok, whatever happens — unknown name, Slack down,
       rate limited. A response that varies would turn this into a way to ask
       the Hub whether a given person works here, from outside, with no session.
       The person on the screen is told the same thing either way: somebody has
       been asked.
       ⚠️ RATE LIMITED PER IP, and it fails CLOSED rather than open, which is the
       opposite of pin-verify's limiter and deliberate. Locking the store out of
       signing in would be worse than the attack; silently dropping the fourth
       "I forgot my PIN" from one address in an hour costs nothing.
       ⚠️ NOT SENT TO CINDY even though she is in HR Console. She does not read
       Slack DMs (she is reachable by text only), so a DM to her would look like
       coverage and be nobody. Better four people who will see it. */
    if (url.pathname === "/api/pin-help" && request.method === "POST") {
      const OK = Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
      try {
        const ip = request.headers.get("cf-connecting-ip") || "unknown";
        const rlKey = `pinhelp:${ip}`;
        let asks = 0;
        try { asks = Number(await env.GATE_CITY_KV.get(rlKey)) || 0; } catch { return OK; }
        if (asks >= 3) return OK;
        try { await env.GATE_CITY_KV.put(rlKey, String(asks + 1), { expirationTtl: 3600 }); } catch { return OK; }

        const b = await request.json().catch(() => null);
        const who = String((b && b.name) || "").trim().slice(0, 80);
        if (!who) return OK;

        /* Named so a leader can act without asking a follow-up question. No
           roster lookup and no confirmation that this person exists — whoever
           reads it knows the team better than a name match does. */
        const text = `*${who}* says they cannot remember their Hub PIN and cannot sign in.\n\n`
          + `Reset it in HR Console: open their file, then Reset PIN. Tell them the new one in person.\n\n`
          + `_Sent from the Hub sign-in screen. Nobody has been signed in and nothing has changed._`;

        for (const p of PIN_HELP_TO) {
          try {
            const uid = await slackIdForName(env, p);
            if (uid) await sendSlackDM(env, uid, text);
          } catch { /* one failed DM must not stop the others */ }
        }
      } catch { /* never tells the caller anything went wrong */ }
      return OK;
    }

    // Clean document URLs: /docs/<slug> → the file in the public hub-assets
    // bucket. Path segments are encoded individually so spaces/parens work and
    // traversal can't escape the bucket prefix.
    if (url.pathname.startsWith("/docs/")) {
      const raw = decodeURIComponent(url.pathname.slice(6));
      const parts = raw.split("/");
      if (!raw || parts.some((p) => p === "" || p === "." || p === "..")) {
        return new Response("Not found", { status: 404 });
      }
      const object = DOC_MAP[raw.replace(/\.[a-z0-9]+$/i, "")] || DOC_MAP[raw] || raw;
      const upstream = await fetch(
        SUPABASE_PUBLIC + object.split("/").map(encodeURIComponent).join("/"),
        { cf: { cacheEverything: true, cacheTtl: 3600 } }
      );
      if (!upstream.ok) {
        return new Response("Document not found", {
          status: 404,
          headers: { "content-type": "text/plain" },
        });
      }
      const headers = new Headers(upstream.headers);
      headers.set("cache-control", "public, max-age=3600");
      /* ★★ SAME GUARD AS /api/doc-view, AND THIS ONE MATTERS MORE, because the
         two lines below deliberately strip the browser's other defences.
         `hub-assets` is the PUBLIC bucket, and anything a signed-in person
         uploads to it is served from here, on gatecityhub.com, inline, with
         x-frame-options and CSP removed. Store a file declaring `text/html`
         and it runs as the Hub — with `gcfcr-hub-token` in localStorage right
         there. The allowlist is what makes stripping those headers safe: a
         handbook PDF and a reading-page PNG still render, and anything else
         downloads instead of executing. */
      const DOCS_INLINE = [
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "image/heic", "image/heif", "application/pdf",
      ];
      const upType = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const inlineOk = DOCS_INLINE.includes(upType);
      headers.set("content-type", inlineOk ? upType : "application/octet-stream");
      headers.set("content-disposition", inlineOk ? "inline" : "attachment");
      headers.set("x-content-type-options", "nosniff");
      // Allow the Hub's own in-app viewer to frame these (same-origin). Supabase
      // may pass framing restrictions through; strip them so the viewer works.
      headers.delete("x-frame-options");
      headers.delete("content-security-policy");
      return new Response(upstream.body, { status: 200, headers });
    }

    /* ═══ THE MANIFEST, CARRYING THIS STORE'S NAME ════════════════════════
       `name` and `short_name` are the label under the icon on every team
       member's phone, and this route is the only place they can be made to
       say the right thing: the file is static JSON, fetched by the browser
       before any of the app has run.

       ⚠️ IT MUST BE HANDLED ABOVE THE `text/html` TEST BELOW. A manifest is
       `application/manifest+json`, so it takes the non-HTML early return and
       would go out exactly as it sits on disk.

       ⚠️ PARSED AND RE-SERIALISED, NOT STRING-PATCHED. JSON.stringify is what
       escapes a quote or a backslash in a typed store name. A hand-built
       string would ship a manifest that silently fails to parse, and a
       manifest that does not parse is an "Add to Home Screen" that quietly
       stops working — with no error anywhere a person would look.

       ⚠️ THE EDGE KEEPS NO COPY, same reasoning as the HTML below. A manifest
       cached before the store saved its identity would pin Gate City's name
       under the icon for as long as the edge held it, which is the exact
       shape of the Jul 31 stale-demo-page afternoon.

       ⚠️ FAILS OPEN to the file on disk. A manifest naming the wrong store is
       cosmetic; no manifest at all breaks installing the app. */
    if (url.pathname === "/manifest.webmanifest") {
      try {
        const raw = await (await env.ASSETS.fetch(request)).text();
        const man = JSON.parse(raw);
        const { appName, legalName } = await storeBrand(env);
        man.name = appName;
        man.short_name = appName;
        /* "The Gate City Chick-fil-A operations platform." The article is
           dropped when the legal name already carries one, so a store called
           "The Village at North Elm Chick-fil-A" does not read "The The".
           Gate City's own description comes out byte-identical to today's. */
        man.description = `${/^the\s/i.test(legalName) ? "" : "The "}${legalName} operations platform.`;
        return new Response(JSON.stringify(man, null, 2), {
          status: 200,
          headers: {
            "content-type": "application/manifest+json",
            "cache-control": "no-cache",
            "cloudflare-cdn-cache-control": "no-store",
          },
        });
      } catch {
        return env.ASSETS.fetch(request);
      }
    }

    /* ═══ HTML MUST REVALIDATE. HASHED ASSETS MUST NOT. ═══════════════════
       🐛 Jul 31 2026, and it cost most of an afternoon. The demo page kept
       serving a 12-slide deck after the 15-slide one was deployed. Everyone
       assumed "promote did not take" and re-promoted twice.

       THE ACTUAL MECHANISM, measured:
         · Two query strings never requested before BOTH came back
           `cf-cache-status: HIT` — so the edge cache key IGNORES the query
           string on this path. A `?v=` bump does nothing. CLAUDE.md said to
           use one; that advice was wrong and is corrected there now.
         · The response carried `max-age=0, must-revalidate` but NO ETag and
           NO Last-Modified. There was no validator, so "must-revalidate" had
           nothing to revalidate WITH and the edge just kept its copy.

       ⚠️ HTML ONLY. Everything Vite emits under /assets/ is content-hashed —
       a new build is a new filename — so those stay cacheable forever. Files
       in public/ (gate-city-demo.html, gate-city-onboarding.html) keep FIXED
       names across deploys, which is exactly why they need a validator.
       index.html matters most of all: it names the hashed bundles, so a stale
       one pins the whole app to an old build.

       The ETag is content-derived, so an unchanged file still answers 304 and
       costs nothing. Only a file that actually changed transfers again. */
    const assetRes = await env.ASSETS.fetch(request);
    const ctype = assetRes.headers.get("content-type") || "";

    /* ⚠️ A MISSING /assets/ FILE MUST 404, NOT RETURN THE HOMEPAGE.
       🐛 Hannah, Aug 2 2026: "Peak Reachers is down." Her tab predated a
       promote, so it asked for a chunk from the old build. That filename was
       gone, the SPA catch-all handed back index.html at HTTP 200, and the
       browser threw "Failed to fetch dynamically imported module" trying to run
       HTML as JavaScript — a confusing error for what is just a stale tab.
       Everything under /assets/ is content-hashed and generated, so a miss
       there is never a route the SPA should answer. Saying 404 plainly is both
       honest and what the browser's own module loader expects. */
    if (url.pathname.startsWith("/assets/") && ctype.includes("text/html")) {
      return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
    }
    if (!ctype.includes("text/html")) {
      /* 🐛 THE COMMENT ABOVE USED TO CLAIM HASHED ASSETS "STAY CACHEABLE
         FOREVER". THEY DID NOT. Measured live on the deployed worker:
           GET /assets/index-CxrQsIgJ.js
           cache-control: public, max-age=0, must-revalidate
         Every chunk revalidated on every single load — the entry bundle, all
         20 lazy chunks, the CSS. Returning the asset response untouched
         inherited that header, so the sentence was wrong the moment it was
         written. Caught by a performance pass measuring the real headers
         rather than reading this file.
         ⚠️ ONLY /assets/. Vite content-hashes every filename it emits there,
         so a changed file is a NEW url and a year-long immutable cache can
         never serve stale bytes. Anything else keeps whatever it had —
         public/ files have fixed names and must not be pinned. */
      if (url.pathname.startsWith("/assets/")) {
        const h = new Headers(assetRes.headers);
        h.set("cache-control", "public, max-age=31536000, immutable");
        return new Response(assetRes.body, { status: assetRes.status, headers: h });
      }
      return assetRes;
    }
    try {
      const raw = await assetRes.arrayBuffer();
      /* ⚠️ SUBSTITUTE BEFORE THE DIGEST. The ETag has to describe the bytes
         that actually go out. Hashing the file on disk instead would hand
         every store the same validator for different HTML, so whichever
         store was served first would pin its own title into everyone else's
         cache — and the 304 below would then keep it there.
         ⚠️ ONLY THE SHELL PAYS FOR THIS. The eight fixed-name pages in
         public/ keep their exact original bytes — no re-encode, no Supabase
         round trip — so their ETags are untouched by this change. */
      let body = raw;
      const text = new TextDecoder().decode(raw);
      /* Only pay for the Supabase read on a document that could actually
         change, and only re-encode when something did. At Gate City itself
         every substitution is a no-op, so the original bytes are kept and the
         ETag is exactly what it was before any of this existed. */
      if (isAppShell(text) || text.includes("Gate City")) {
        const swapped = brandHtml(text, url.pathname, await storeBrand(env));
        if (swapped !== text) body = new TextEncoder().encode(swapped);
      }
      const digest = await crypto.subtle.digest("SHA-256", body);
      const etag = `W/"${[...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("")}"`;
      const headers = new Headers(assetRes.headers);
      headers.set("cache-control", "no-cache");
      headers.set("etag", etag);
      /* ★ THE EDGE MUST NOT KEEP A COPY OF THIS PAGE, AND THAT IS A SEPARATE
         INSTRUCTION FROM THE ONE ABOVE.
         🐛 Matt, Aug 3 2026: "I closed my app out, signed out and in but it
         didn't update until I got home." Bri the same day: "some of the team
         is having trouble seeing new updates, even with updating the app."

         `cache-control: no-cache` tells the BROWSER to revalidate. The browser
         then revalidates against CLOUDFLARE, not against us — and Cloudflare
         was holding its own copy of index.html, per data centre. The store's
         edge had an old one, so every device on that wifi was pinned to an old
         build; his house was on a different edge that had the new one. Nothing
         a person can do from the app fixes that, which is why signing out and
         reinstalling looked like it did nothing. It did do nothing.

         Worse, the ETag below never ran. A cache HIT is answered by the edge
         before the Worker executes, so the validator this code exists to send
         was not reaching anybody. Measured: the live response carried
         `cf-cache-status: HIT` and NO etag header at all.

         ⚠️ NOT `cache-control: no-store`. That would stop the browser caching
         too, and then the ETag/304 below could never save a transfer — every
         open would re-download the page instead of getting a 304. We want the
         browser to keep its copy and check; we want the edge to keep nothing.
         `cloudflare-cdn-cache-control` is the edge-only directive and outranks
         `Cache-Control`; Cloudflare consumes it and strips it before the client
         sees it, so nothing downstream is confused by it.

         ⚠️ HTML AND public/ ONLY. Everything under /assets/ returned earlier,
         still immutable for a year, which is where the bandwidth actually is.
         This path serves one small document per page load. */
      headers.set("cloudflare-cdn-cache-control", "no-store");
      /* A matching validator means the caller already holds this exact byte
         sequence. 304 with no body — the point of having an ETag at all. */
      if (request.headers.get("if-none-match") === etag) {
        return new Response(null, { status: 304, headers });
      }
      return new Response(body, { status: assetRes.status, headers });
    } catch {
      /* ⚠️ FAILS OPEN. If hashing throws, serve the page. A cache header is
         worth less than the page loading at all. */
      return env.ASSETS.fetch(request);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(event, env));
  },
};
