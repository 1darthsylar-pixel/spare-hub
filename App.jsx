import { useState, useEffect, useCallback, useLayoutEffect, useRef, lazy, Suspense } from "react";
/* The raised-card look, one definition — see cardStyle.js. It was written out
   13 times in this file and had drifted from the setup cards. */
import { CARD_3D, accentEdge, cardSurface, cardSurfaceBack, CARD_3D_SOFT } from "./cardStyle.js";
/* ★ TOOLS LOAD WHEN OPENED, NOT WHEN THE DASHBOARD DOES.
   Matt, Jul 30 2026: "the hub seems a little laggy when opening."

   Measured, not guessed: the network was never the problem — 660 kB gzipped
   arrives in 0.7s. The cost was that ALL of it had to be parsed and executed
   before anything painted, because every tool lived in one 2,395 kB file. HR
   Console alone is 348 kB of source; Daily Setup 144 kB. None of it is on
   screen when you open the Hub.

   ⚠️ EVERY TOOL IS LAZY NOW (Jul 31 2026). The last four holdouts —
   HRConsole, FinancialSuite, ShiftLeaderScorecard, Facilities — stayed static
   because the dashboard needs a handful of their VALUES at first render.
   Those values moved to leaf modules (hrTeam.js, hrRoster.js, finShared.js,
   slScore.js, facilitiesData.js) and the dashboard reads THOSE; the tools
   re-import the same leaves, so there is still exactly one copy of each.
   The two month-card readers (monthLaborCard, monthFoodCostPct) are dynamic
   imports inside the effects that call them — they run long after paint.
   ⚠️ MountainBackdrop, PeakReachersBadge and RankClimb stay static too. They
   are the dashboard's own artwork — lazy-loading something that renders
   immediately just adds a flash of nothing.
   ⚠️ A LAZY COMPONENT MUST SIT UNDER A Suspense BOUNDARY or React throws. The
   only place these render is the active-tool view, so there is exactly one
   boundary and it wraps that. */
import ToolBoundary from "./ToolBoundary.jsx";
import { kvGet, kvSet, kvGetResult, kvGetMany, HUB_TOKEN_KEY, hubToken, absorbTokenRefresh } from "./store.js";
/* ★ ONE MATCHER, NOT TWO (Jul 27). The pending-recommendation badge below used
   to compare `normName(rec.leaderName)` to the signed-in name — its own rule,
   name-only, ignoring `leaderId` entirely — while ProfessionalGrowth's RecInbox
   used `recMatches`, which is id-first. Two rules over one dataset meant the
   badge could say "1" while the panel showed nothing, which is precisely what
   Bri reported. nameMatch.js is a dependency-free leaf, so importing it here
   closes no cycle. */
import { recMatches, normName, bareId } from "./nameMatch.js";
/* ★ THE RULE, NOT A COPY OF IT. Bri, Aug 10 2026: "it would be helpful for
   Directors, HR, and Ex Directors that have this function to have a small
   calendar icon at the very top of the Hub by their sign in name."
   "that have this function" is exactly `isCalendarOwner`, which already exists
   and which the tile, the Worker and Team Directory all ask. Spelling the role
   list out again here would be the thing adminRoles.js was written to stop.
   ⚠️ SAFE TO IMPORT EAGERLY. calendarStore.js is a leaf that reaches only two
   other leaves — no React, no store.js, no component. The TILE stays lazy. */
/* ⚠️ `awaitingReply` COMES FROM THE LEAF TOO, for the badge below. Writing
   "invited, still ahead, no answer yet" a second time here is exactly how
   the last header badge came to disagree with the panel it pointed at. */
import { isCalendarOwner, awaitingReply } from "./calendarStore.js";
import NudgeButton from "./NudgeButton.jsx";
import QuietPeople from "./QuietPeople.jsx";
import MyPhoto from "./MyPhoto.jsx";
const PeakReachers = lazy(() => import("./PeakReachers.jsx"));
const StoreSettings = lazy(() => import("./StoreSettings.jsx"));
const Announcements = lazy(() => import("./Announcements.jsx"));
const Escalate = lazy(() => import("./Escalate.jsx"));
const TrainingSite = lazy(() => import("./TrainingSite.jsx"));
const WasteTracker = lazy(() => import("./WasteTracker.jsx"));
const FoodSafety = lazy(() => import("./FoodSafetyWalkthrough.jsx"));
const FoodQuality = lazy(() => import("./FoodQuality.jsx"));
const SupplyCentral = lazy(() => import("./SupplyCentral.jsx"));
const EquipmentLog = lazy(() => import("./EquipmentLog.jsx"));
const DailyCleaning = lazy(() => import("./DailyCleaning.jsx"));
const HRConsole = lazy(() => import("./HRConsole.jsx"));
import { hrRankOfTitle } from "./hrRoster.js";
import { requiredDeck, trainingKey, trainingRecord, hasWatched } from "./hubTraining.js";
import { HR_DEFAULT_PIN, loadHRTeam, loadHRTeamResult, isHbExempt } from "./hrTeam.js";
const CashAudit = lazy(() => import("./CashAudit.jsx"));
const DailySetup = lazy(() => import("./DailySetup.jsx"));
const IPOActionItems = lazy(() => import("./IPOActionItems.jsx"));
import { ipoQuarter } from "./ipoPlan.js";
const ThawAllocation = lazy(() => import("./ThawAllocation.jsx"));
const BusinessScorecard = lazy(() => import("./BusinessScorecard.jsx"));
const GuestExperience = lazy(() => import("./GuestExperience.jsx"));
const FinancialSuite = lazy(() => import("./FinancialSuite.jsx"));
import { LAST_TAB_KEY as FIN_LAST_TAB_KEY } from "./finShared.js";
/* Leaf, for the same reason finShared.js above is one: the home screen needs the
   answer without importing the tile. See goalsWindow.js. */
import { SUB_KEY as GOAL_SUB_KEY, goalsOwed } from "./goalsWindow.js";
const OpsChecklists = lazy(() => import("./OpsChecklists.jsx"));
const EOSTile = lazy(() => import("./EOSTile.jsx"));
const UniformOrder = lazy(() => import("./UniformOrder.jsx"));
const L101Template = lazy(() => import("./L101Template.jsx"));
const LeadershipDevTile = lazy(() => import("./LeadershipDevTile.jsx"));
const CalendarTile = lazy(() => import("./CalendarTile.jsx"));
/* The Hub explaining itself. Lazy like every other tile — it is a reading
   surface nobody opens twice a day, so it must cost the home screen nothing. */
const ManualTile = lazy(() => import("./ManualTile.jsx"));
const TokensTile = lazy(() => import("./TokensTile.jsx"));
const OnboardingLauncher = lazy(() => import("./OnboardingLauncher.jsx"));
const ShiftLeaderScorecard = lazy(() => import("./ShiftLeaderScorecard.jsx"));
import { SEASON_START as SL_SEASON_START, scoreBand as slBand, scoreColor as slBandColor } from "./slScore.js";
const NewHireOrientation = lazy(() => import("./NewHireOrientation.jsx"));
const TrainerTasks = lazy(() => import("./TrainerTasks.jsx"));
import MountainBackdrop from "./MountainBackdrop.jsx";
import PeakReachersBadge from "./PeakReachersBadge.jsx";
import RankClimb from "./RankClimb.jsx";
const Facilities = lazy(() => import("./Facilities.jsx"));
/* THE TEAM SIDE of the scheduling platform — when I can work, and dropping or
   picking up a shift. Lazy on purpose: nothing on the dashboard reads these
   keys, so the chunk is only fetched by somebody who opens the tile.
   ⚠️ `mode="team"` IS SET AT THE CALL SITE, not inside the component. The same
   file also renders the leader tabs inside ScheduleConsole. */
const Availability = lazy(() => import("./Availability.jsx"));
/* THE LEADER SIDE — building the week, plus the setup behind it (skills, time
   off, the school calendar and the minor limits). Matt, Aug 13 2026: "one
   should be for availabilty and shift swaps only. the other for everything
   else." ScheduleConsole is a tab bar over ScheduleBuilder and Availability. */
const ScheduleConsole = lazy(() => import("./ScheduleConsole.jsx"));
/* ⚠️ facilitiesData.js IS GONE (Aug 8 2026). This import is why the punch list
   was in the ENTRY chunk rather than behind a lazy tile: the dashboard pill
   needed the seed to count against, so every anonymous visitor downloaded 35
   open maintenance items for the building. The pill fetches it now.
   storeConfig is the one home for per-tile person exceptions, so App.jsx and
   worker.js cannot disagree about who may open Facilities.
   ⚠️ `tileAllowIds` IS A CALL, NOT A CONST, AND SECTIONS IS WHY. That tool list
   is a module-level const, so the old `allowIds: TILE_ALLOW_IDS.facilities`
   captured Gate City's list the moment this file imported, before any saved
   setting could arrive. Tool entries name their list with `allowIdsFrom` now
   and toolAllowsId resolves it at use time. */
import { tileAllowIds, STORE, storeCfg, programLabel, tokenLabel } from "./storeConfig.js";
/* The store's saved settings. Same loader main.jsx runs at boot, imported here
   rather than copied so there is one fetch-and-merge in the app (design rule 8)
   — and it lives in its own file because main.jsx imports THIS one. */
import { loadStoreConfig } from "./storeConfigLoad.js";
import { onSigned } from "./signedTick.js";
import { loadItemGaps, priorMonthGaps } from "./foodItemGaps.js";
import { eosPeriod } from "./eosPeriod.js";
import { METRIC_PLAYBOOKS } from "./metricPlaybooks.js";
/* Playbook panel is off the dashboard for now — see its render site below.
   The content stays imported and intact; only the display is gated. */
const SHOW_METRIC_PLAYBOOKS = false;
import { buildRows as buildInputRows, forPerson as inputsForPerson, byOwner as inputsByOwner, readExtras as readInputExtras, isOverseer, statusByTool as inputStatusByTool, byArea as inputsByArea, bridgeCandidates as inputBridge, byCadence as inputsByCadence, cadenceBucket, CADENCE_BUCKETS, CADENCE_LABEL } from "./inputRegistry.js";


// ── Access tiers ──────────────────────────────────────────────────
// 1 = Team Member · 2 = Leader · 3 = Director
// PRIMARY login is each person's personal PIN, set in the HR Console
// (gcfcr-hr-pins). Their role decides their tier automatically:
//   Team Member / Trainer                       → 1
//   Team Leader / Assistant Director / Director → 2
//   LDD / HR / Executive Director / Owner       → 3
/* ⛔⛔ IT MUST BE `hrRankOfTitle`, NEVER THE RAW MAP, AND THIS FILE HAD THE RAW
   MAP UNTIL Aug 19 2026.

   `HR_RANK_BY_TITLE` is only the BUILT-IN ladder. `hrRankOfTitle` is that ladder
   PLUS the titles a store has named for itself in `hr.extraTitles` — Kitchen
   Director, Talent Director, Hospitality Director at the Village. hrRoster.js
   added that fallback and said why: "every one of those scored 0 here, which is
   Limited."

   ⇒ THE FIX LANDED THERE AND NEVER REACHED HERE, so the two disagreed:

     Kitchen Director   hrRankOfTitle -> rank 5 -> tier 2, Leader
                        this file     -> rank 0 -> tier 1, Team Member

   ⛔ A LEADER SIGNED IN AND GOT THE TEAM MEMBER HUB. HR said one thing, the
   tile grid did another, and nothing errored — which is why it survived. It is
   the reported Village symptom: "until those titles are set they sign in and
   see almost nothing."

   ⚠️ UNKNOWN IS STILL 0 AND 0 IS STILL TIER 1. This widens nothing. A title in
   neither the built-in ladder nor the store's own list fails closed exactly as
   before, and `hrRankOfTitle` keeps the built-in map winning so a store can add
   a name the Hub does not have but never redefine one it does. */
const roleTier = (role) => {
  const r = hrRankOfTitle(role);
  return r >= 6 ? 3 : r >= 3 ? 2 : 1;
};

/* ═══════════════════════════════════════════════════════════════════
   PER-PERSON ROLE CLAMP — what someone's SESSION is, regardless of HR.

   Hannah, Jul 28 2026: "we only want Kyleeka to see what a team member would
   see in the Hub if she ever decides to sign in."
   Bri the same day: remove her Executive Director permissions across
   Leadership Development, the 101 class, Peak Reachers and applications —
   "her role will not be changed in HR, but these permissions should be
   specific to her." (She is leaving at the end of August.)

   ★ WHY IT CLAMPS THE ROLE AND NOT THE TILE LIST. `ONLY_TOOLS` below narrows
   WHICH TILES a person sees, which is right for Nick — he wants a short feed.
   It is the wrong tool here: Bri does NOT want Kyleeka locked out of Peak
   Reachers or Leadership 101, she wants her to SEE them AS A TEAM MEMBER.
   Those tiles are open to everyone, so she would still get in and the
   component's OWN role check would keep granting her edit rights — the same
   both-halves failure that bit Cindy's onboarding access.

   ★ CLAMPING AT THE IDENTITY LAYER FIXES IT EVERYWHERE AT ONCE. Both places
   that build a session (the PIN grant and the role-refresh effect) derive the
   stored user AND the tier from `role`, so one substitution here means every
   component reading the signed-in person sees a Team Member — with no
   per-component change and nothing to keep in sync.

   ⚠️ HR IS NOT TOUCHED. Her record still reads Executive Director, which is
   exactly what Bri asked for; TeamDirectory and HR Console read HR directly
   and are unaffected. This governs the SESSION only.
   ⚠️ It self-heals: a session cached before this shipped carries the old role,
   and the refresh effect rewrites it on the next load because the clamped role
   differs from the stored one. */
/* ── HISTORY, KEPT ON PURPOSE (same rule as accessOverrides.js) ──────────
   Jul 28 2026 — Kyleeka (id 23) was clamped to "Team Member" here at
   Hannah's and Bri's request.
   Jul 29 2026 — LIFTED in accessOverrides.js ("Restore Kyleeka's access") after
   the three of them agreed, and both Hannah and Bri were told it was done.
   Jul 30 2026 — ⚠️ IT WAS NOT DONE. That commit emptied the OVERRIDES map in
   accessOverrides.js and left THIS clamp in place, so every session still
   judged her a Team Member. Hannah reported exactly that on Jul 29 ("she can
   sign in but it is showing team member access") and the answer she got was to
   reload and sign in again, which could never have fixed it. Clearing it here
   now.

   ★ THE LESSON, WHICH IS WHY THIS COMMENT IS LONG. There are TWO ways to judge
   somebody by something other than their HR title: this map, which governs the
   SESSION, and OVERRIDES in accessOverrides.js, which governs role-based gates.
   Changing one and not the other looks finished and is not. Whenever either
   moves, grep for the person's id AND their name across both files. */
const ROLE_CLAMP = {};   // Empty. Nobody's session role is clamped.
const effectiveRole = (id, role) => ROLE_CLAMP[String(id)] || role;
// Per-tile role exceptions: a tool may list `allow: [roles]` that can open it
// even when the person's tier is below tool.tier (e.g. Junior Trainers →
// Waste & Donations). Keeps the exception scoped to that one tile instead of
// raising the person's whole access tier.
// Payroll (Office Manager) rides this same exception: Cash Audit + Financials
// only, by role, while staying tier 1 everywhere else. Deliberately NOT a 4th
// tier — canUseTool below is a `>=` test, so a tier of 4 would clear EVERY tile
// in the Hub, which is the opposite of a scoped grant. HR Console is tier 1
// already and self-gates internally, so it needs no allow entry.
const toolAllows = (tool, role) => Array.isArray(tool && tool.allow) && !!role && tool.allow.includes(role);

// Per-person NARROWING — the mirror image of `allow` above. `allow` widens
// access below tier; ONLY_TOOLS clamps it: whoever is listed here sees exactly
// these tiles and nothing else, whatever their tier. A `>=` test cannot express
// "fewer", so a tier 3 who wants a short dashboard needs this instead.
// Keyed by roster id rather than role, matching how the rest of the Hub singles
// people out (ProfitShare's PROFIT_EDIT_IDS, this file's onboarding gate).
//
// EMPTY ON PURPOSE, AND THE MECHANISM STAYS. Nobody is narrowed right now.
// Kept because the next person who asks for a short view should get a one-line
// answer, not a rebuild.
//
/* ⚠️ IF SOMEONE IS ADDED BACK, HR CONSOLE GOES ON THEIR LIST. It is where a
   person sets their own PIN, and a PIN is the only way into the Hub. Leaving it
   off strands them unable to recover their own access.
   ⚠️ AND IT HAS TO BE EDITED HERE. onlyFor() returns before canUseTool reaches
   the tier test or allowIds, so a tool a narrowed person has asked for appears
   ONLY if it is added to their set. Listing them in the tile's allowIds alone
   shows nothing, with no error and nothing to grep for. Two places, one person,
   and the second place is easy to miss. */

/* 🐛 NICK WAS HERE UNTIL AUG 8 2026, AND FINDING THAT TOOK TOO LONG.
   His set was four tool ids — his own Jul 30
   request for a feed without clutter, never a restriction on him. Matt, Aug 6:
   "nick as owner has the right to full access but he only chooses this
   dashboard view." Aug 8 he asked for the full view back, so he came off.

   ⚠️ WHAT MADE IT HARD TO FIND, worth knowing before the next one of these.
   The reported symptom was every category card reading "1 tool" — four tools
   spread across four sections, so each section rendered its count as 1. That
   reads like a broken count, not a narrowing list.
   Two whole mechanisms got checked first and BOTH looked innocent: he is HR
   rank 8 and clears every tier gate, and he is not in accessOverrides.js. He
   never could have been. onlyFor() returns above the tier test, and
   accessOverrides is a DIFFERENT deny list in a DIFFERENT file.
   ⚠️ THERE ARE TWO NARROWING MECHANISMS IN THIS REPO. Check both. Rank and the
   override file being clean does not mean a person is unnarrowed. */
const ONLY_TOOLS = {};
const onlyFor = (person) => (person && ONLY_TOOLS[String(person.id)]) || null;

// `person` is the signed-in {id, role}, or null when signed out. Order matters:
// a narrowing list beats both the tier test and the `allow` exception.
/* `allowIds` — access for a NAMED person, by HR roster id, the same key
   ONLY_TOOLS uses. `allow` can only widen by ROLE, and "Assistant Director"
   would open a tile to all nine ADs when Matt asked for one person (Brandon
   on Facilities, Jul 30 2026). Ids, never names — names drift between the
   chart and HR ("Lizy" vs "Lizbeth") and a drifted name is silent lockout. */
/* 🐛🐛 THIS ARM HAS NEVER LET ANYBODY IN, AND THREE TILES DEPEND ON IT.
   Matt, Aug 11 2026: "Bri is asking for access to The LD him clone. Please fix
   that." She is on the list — `l101tpl: ["17", "33"]` — and was still locked out.

   THE TWO ID SHAPES. The HR roster stores Bri as `tm17`; the sign-in hands
   `{ id: m.id }` straight off that roster, so this received "tm17" and compared
   it against "17". `String()` does not close that gap, and the mismatch is
   silent: the tile simply is not on the dashboard, with nothing to grep for.

   ⚠️ storeConfig.js WARNS ABOUT EXACTLY THIS, IN ITS OWN WORDS, forty lines
   above the list: "HR roster id ('tm16'). TILE_ALLOW_IDS further down this same
   file uses the bare number ('16') for the same person." The note was right and
   the comparison never honoured it.

   ⚠️ IT IS NOT JUST HER TILE. Measured against the real roster, all three
   allowIds tiles admitted NOBODY:
     · l101tpl     tier 4, no other arm → Bri and Matt shut out
     · orientation tier 4, no other arm → five people shut out, unreported
     · facilities  tier 3 + allow:["Director"] → Brandon still got in by ROLE,
       which is why this never surfaced there and why it stayed hidden so long
   Two of the three are tier 4, and nobody is tier 4, so for those this list is
   the only door and it was bolted.

   ⇒ BOTH SIDES THROUGH `bareId`, the leaf every other id comparison in this
   repo already uses (calendarStore, TeamDirectory, the Worker). Not a local
   `.replace(/^tm/, "")` here, which would be a fourth copy of one rule and the
   thing design rule 8 exists to stop.
   ⚠️ AN EMPTY ID MATCHES NOTHING. `bareId(undefined)` is "", and a blank entry
   in a list would otherwise open a tile to a signed-out person. */
/* ⚠️ RESOLVED BY NAME, NOT FROM A CAPTURED LIST (Aug 11 2026). `allowIdsFrom`
   holds the KEY of the list in storeConfig; the list itself is fetched here,
   when somebody actually asks. It used to be `tool.allowIds`, an array copied
   into the module-level SECTIONS const at import — so a store could save its
   own exceptions and the gate would never see them.
   ⚠️ ONE SOURCE, NOT A FALLBACK CHAIN. There is deliberately no "or the old
   allowIds" arm here. An access list that consults two places widens to
   whichever is more generous, so removing somebody from the live list would
   not remove them. `allowIdsFrom` is the only way in.
   ⚠️ AN EMPTY ID MATCHES NOTHING. `bareId(undefined)` is "", and a blank entry
   in a list would otherwise open a tile to a signed-out person. */
const toolAllowsId = (tool, person) => {
  const me = bareId(person && person.id);
  if (!me || !tool || !tool.allowIdsFrom) return false;
  return tileAllowIds(tool.allowIdsFrom).some((id) => bareId(id) === me);
};
const canUseTool = (tool, userTier, person) => {
  /* ★ FEATURE FLAGS COME FIRST, ABOVE EVERY GRANT (step 2, Aug 11 2026). A tile
     tagged with `feature` disappears when the store has switched that feature
     off, and it disappears for EVERYBODY — before onlyFor, before the tier
     test, before the role and id exceptions. A store that said no to a feature
     has said no to it, and an access grant should not be able to reopen
     something the store does not run.
     ⚠️ ONE CHOKEPOINT, DELIBERATELY. Every surface that asks "may this person
     open this tile" comes through here — the section grid, the search results
     and the pinned row — so the flag cannot be honoured in one place and
     forgotten in another. That is the exact shape of Nick's reduced view,
     where one person's access lived in one file and was invisible from every
     other.
     ⚠️ `!== false` NOT `=== true`, so a tile tagged with a feature nobody has
     configured stays VISIBLE. A missing setting must never silently remove a
     tool from a working store; only an explicit false does. */
  if (tool.feature && storeCfg(`features.${tool.feature}`) === false) return false;
  const only = onlyFor(person);
  if (only) return only.has(tool.id);
  return userTier >= tool.tier || toolAllows(tool, person ? person.role : null) || toolAllowsId(tool, person);
};

// Personal PINs are now the ONLY way in. Each person's PIN (set in the HR
// Console) identifies exactly one active team member; the moment someone is
// marked Terminated, the registry lookup below stops matching their PIN, so
// termination removes Hub access with no separate step. The old shared
// 1111/2222/3333 tier PINs were removed once everyone had a personal PIN —
// a terminated person could otherwise still get in with a shared code.
//
// ⚠️ THE ROSTER IS NOT `HR_TEAM` ANYMORE — USE `loadHRTeam()`.
// HR_TEAM is HR Console's SEED array (the original 106) and is still exported
// so nothing breaks at module load, but it does NOT contain anyone hired since
// the Hub went up. HR Console can now add people (gcfcr-hr-added-v1), and
// loadHRTeam() returns seed + additions. Filter HR_TEAM here instead and a new
// hire's PIN matches nobody: they'd have a file and a PIN and still be unable
// to sign in, with "PIN not recognized" as the only clue. Both lookups below
// were already inside async functions, so this costs one await each.
const TIER_NAMES = { 1: "Team Member", 2: "Leader", 3: "Director" };

/* ⚠️⚠️ A FEATURE THE STORE SWITCHED OFF IS NOT "LOCKED", IT DOES NOT EXIST.
   Bri, Aug 11 2026: "I see the tokens section, but can't access and don't see
   where it would be documented in HR." Tokens ships `features.tokens: false`,
   so canUseTool correctly refused her — and these two lists render exactly what
   canUseTool refused, as a locked tile with a padlock.

   Locked means "you could have this with more access", which is a promise. A
   switched-off feature is not coming with a promotion; it is not part of this
   store's Hub at all, and showing it sends somebody to ask HR for access to a
   thing nobody can grant. Which is precisely what Bri did.
   ⇒ The flag is checked here too, ahead of the access test. */
const featureOn = (t) => !(t && t.feature) || storeCfg(`features.${t.feature}`) !== false;

/* Eval cadence — 6 months from the most recent evaluation, or from the hire
   date for someone never evaluated. Matt ruled 6 months on July 17, so all
   three places that answer "is this eval on time?" now compute it identically:
   here (the dashboard badge), worker.js's buildTodaysTodos() (the 7am Slack
   digest), and HRConsole's EOS scorecard row s6 ("Evals on-time"), which used
   to be on a 90-day clock and was the reason the strip and the badge disagreed.
   Kept as setMonth(+6) in all three — NOT a day constant. 6 months is 181–184
   days depending on where you start, so a `182 * DAY` shortcut would drift
   these three apart again by exactly the amount nobody would notice. */
const EVAL_CADENCE_MONTHS = 6;
// Sign-in persists on the device (localStorage) so the team logs in once,
// then daily tiles open with no PIN until they sign out.
const TIER_KEY = "gcfcr-access-tier";
const USER_KEY = "gcfcr-access-user";
/* ONE reader for the cached identity — both state initialisers below use it, so
   "is there a person saved on this device" can never mean two things (design
   rule 8). Module level, so nothing can read it in a dead zone (rule 7). */
const readStoredUser = () => {
  try { return JSON.parse(localStorage.getItem(USER_KEY)) || null; } catch { return null; }
};
/* Bri, Jul 23: "in my personal settings [can I] pin certain tiles or tools at
   the top of my homepage". Keyed PER PERSON, not per device — the Hub is used
   on shared iPads, and one leader's pins appearing under another's login would
   read as the Hub deciding what matters to them. Falls back to a shared key
   only when nobody is signed in, which can't happen on the landing grid. */
const PIN_KEY_FOR = (u) => `gcfcr-pinned-tools:${(u && u.id) || "anon"}`;
/* ⚠️ localStorage ALONE IS NOT ENOUGH (Matt, Jul 27: "every time you log out
   you have to fix it"). The installed home-screen PWA and Safari keep SEPARATE
   localStorage — same app, two stores — so pins made in one are genuinely
   absent in the other, and re-pinning writes to whichever context you happen
   to be in. Nothing in signOut was clearing them; the two copies simply never
   met. Pins now live in KV under the same per-person key, so they follow the
   PERSON to any context or device. localStorage is kept purely as an instant
   paint cache so the pinned row doesn't flash empty on every launch. */
const PIN_KV_FOR = (u) => `gcfcr-pinned-tools:${(u && u.id) || "anon"}`;

// normName is imported from nameMatch.js at the top of this file. It used to be
// copied here, under a comment telling you to keep it byte-identical to the
// copies in worker.js and HRConsole.jsx — but both of those now import it too,
// so the comment was describing a rule nobody was following any more. One
// definition, in the leaf module, is the rule. The Slack maps are keyed with it.
const LAST_TOOL_KEY = "gcfcr-last-tool";

// ── name → rank, published for worker.js ──────────────────────────────────
// The food safety rota runs in the WORKER, which cannot import HRConsole and so
// has no roster at all. It was reading `gcfcr-hr-roles` — a map of role
// OVERRIDES keyed by roster ID — with a NAME off the DailySetup board, so every
// lookup missed and the rota told #guardian-of-the-brand "nobody could be
// assigned" every single morning. This publishes what it actually needs.
//
// THREE KEY FORMS PER PERSON, because the board and HR write names differently:
// full ("thanhnguyen"), first only ("thanh"), and first + last initial
// ("thanhn"). Matching on one form alone is what broke the directory sync
// earlier today for exactly the same reason.
//
// A key shared by two people is dropped ONLY if their ranks DIFFER — if two
// Ashleys are both rank 2 the answer is the same either way, so the collision
// is harmless. Where it does differ, dropping is the safe move: under-assigning
// is recoverable, naming the wrong person in a channel is not.
const RANK_BY_NAME_KEY = "hr:rank-by-name:v1";
const rankNameKeys = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  const out = [normName(parts.join(""))];
  out.push(normName(parts[0]));
  if (parts[1]) out.push(normName(parts[0] + parts[1][0]));
  return [...new Set(out.filter(Boolean))];
};
function buildRankByName(roster, rolesMap) {
  const out = {};
  const clash = new Set();
  for (const m of roster || []) {
    const role = (rolesMap || {})[m.id] || m.role;
    /* ⚠️ THE SAME LOOKUP AS `roleTier`, for the same reason. Reading the raw map
       here left everybody on a store-named title out of this index entirely,
       because `if (!r) continue` drops a rank of 0. */
    const r = hrRankOfTitle(role);
    if (!r) continue;
    for (const k of rankNameKeys(m.name)) {
      if (out[k] === undefined) out[k] = r;
      else if (out[k] !== r) clash.add(k);
    }
  }
  clash.forEach((k) => delete out[k]);
  return out;
}

/* Name search for the sign-in name step (see `needName` in the PIN card).
   ⚠️ MODULE LEVEL ON PURPOSE. A helper declared inside the component can be
   read in its temporal dead zone by anything that runs during the first
   render, which is design rule 7 and has taken a whole tile down before.
   Matches on the NORMALISED string, which strips case, accents and spaces, so
   "jose" and "garcia" both find "José García". Much of this roster carries two
   surnames, so the short form has to find the same person — searching only the
   leading token would hide people from their own sign-in.
   ⚠️ THIS PICKS A NAME, IT NEVER PROVES ONE. Everything it returns is already
   on the device (the roster loads client-side today), and the PIN is still the
   only thing that signs anybody in. Capped at 8 so the list cannot push the
   PIN field off a phone screen. */
const matchNames = (list, q) => {
  const n = normName(q);
  if (!n) return [];
  return (list || [])
    .filter((m) => m && m.name && normName(m.name).includes(n))
    .slice(0, 8);
};

const RED = "#DD0031";
const TEAL = "#0F766E";
const NAVY = "#1E3A8A";
const LEAD = "#3730A3"; // Leadership section accent (indigo — same blue family as People/Team)
/* ⛔⛔ ONE RHYTHM FOR EVERY TILE ROW, AND `auto-fill` IS THE WHOLE POINT.

   Matt, Aug 20 2026, off a laptop screenshot: "On the home pages the pinned
   tools are too long and don't match."

   ⚠️⚠️ `auto-fit` COLLAPSES THE EMPTY TRACKS, so a row's tile width depends on
   HOW MANY TILES THAT ROW HAPPENS TO HAVE. Measured that day, three rows stacked
   on one screen, each with its own width:

     Start here   2 tools    -> 2 tracks  -> half-width tiles
     Pinned       3 tools    -> 3 tracks  -> third-width tiles
     Sections     6 tiles    -> 4 tracks  -> quarter-width tiles

   Nothing was wrong with any row on its own. They were wrong TOGETHER, which is
   why it reads as "don't match" rather than as a bug in one place.

   ⇒ `auto-fill` KEEPS the empty tracks, so every row uses the same track width
   and a short row simply ends early. The rows line up into one column.

   ⚠️ AND THE THREE HOME ROWS WERE THE ODD ONES OUT, NOT THE MAJORITY. The
   section drill-down, the locked list and the search results were already
   `auto-fill, minmax(240px, 1fr), gap 12`. The home page carried `auto-fit,
   minmax(230px, 1fr), gap 14` — a second rhythm ten pixels and two pixels away
   from the first, close enough that nobody spotted it and far enough that the
   tiles changed size when you drilled into a section.

   ⛔ USE THIS OBJECT. Do not retype the grid. That is how the two rhythms got
   there, and `tileGrid.test.mjs` fails on any tile grid that spells its own.
   ⚠️ The column COUNT does not change at this page width: 4 columns either way
   (4x240+3x12 = 1008, and 5 would need 1248). Only the rhythm was unified. */
/* ⭐⭐ ONE PAGE WIDTH, NAMED ONCE.

   Matt, Aug 19 2026, off a laptop screenshot: "I would like the side by side if
   possible for the more compact look."

   The page was capped at 860. The tile grid is `auto-fill minmax(240px, 1fr)`
   with a 12px gap, so 860 fits exactly THREE columns and the rest of a laptop
   screen was white — more rows than necessary, and more scrolling. At 1200 the
   same grid fits FOUR.

   ⚠️⚠️ THE FAILURE THIS GUARDS IS NOT THE NUMBER, IT IS THE PAIR. The header and
   the page body are two separate `maxWidth` declarations wrapping two separate
   blocks, and if they drift the store name stops lining up with the content
   under it — a misalignment that looks like a rendering bug and shows in no
   diff. `pageWidth.test.mjs` fails if they ever disagree, which is why this is a
   named constant rather than 1200 typed twice.

   ⚠️ IT IS A CAP, NOT A WIDTH. Nothing is stretched; a narrow window is
   unaffected. */
const PAGE_MAX = 1200;

const TILE_GRID = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 };

const INK = "#13293F";
const INKGRAD = "linear-gradient(120deg,#1D4266 0%,#0B1826 55%)"; // dual-shade masthead
const PEAK = "#1B2A4A"; // Peak Reachers navy (from the program logo)
const VIOLET = "#7C3AED"; // Weekly Operations section accent

// ── KPI strip config ─────────────────────────────────────────────
// The strip READS the published EOS scorecard feed (eos:scorecard:{period})
// — the same key EOSTile merges. Producers (FCRPage, CashAudit, HRConsole)
// publish {actual, goal, hit} per row; the strip only reads. So goals never
// drift from what's published, and only the label + number format live here.
// A row with no published actual renders a calm "—", never a typed number.
// SOS (s4) and promotion-ready (s7) stay in the full EOS tile, not the strip.
// Derived from the date — single source of truth in eosPeriod.js, shared with
// FCRPage/HRConsole/EOSTile/aiSummary so readers and writers can never disagree
// about which quarter's key to touch. Rolls automatically; nothing to bump.
/* Food cost goal — the IPO / Top-20% peer benchmark. Deliberately FLAT: it is
   a benchmark, not a volume-derived target (real movement across a year is
   ~0.2 pts, and the true driver is product mix, which no sales forecast
   predicts). Used only as a FALLBACK — if the EOS scorecard has published an
   s2 goal, that wins, so the dashboard and the L10 board can't disagree. */
/* ★ FROM storeConfig.js (step 2, Aug 11 2026). Same 0.2756.
   ⚠️ STILL ONLY THE FALLBACK. The published s2 goal above wins when there is
   one, exactly as before — this moved where the fallback is written, not which
   number is preferred.
   ⚠️ THE PROJECTION DATA ALSO HOLDS 0.2756, EIGHTEEN TIMES, AND THOSE ARE NOT
   THIS. Each one is a HISTORICAL SNAPSHOT of that month's goal sitting beside
   that month's actuals. Pointing them here would restate eighteen closed months
   the next time this number changes. Leave them alone. */
const foodGoalBenchmark = () => storeCfg("financial.goals.food");

/* ── DOLLAR IMPACT ON A TODAY ROW ────────────────────────────────────────────
   Matt, Aug 4 2026: put the money on the Today rows where a real number exists.

   ⚠️ ONLY WHERE THE NUMBER ALREADY EXISTS. Every figure below comes out of
   `moneyCard`, which the dashboard already fetches for the Labor and Food cards.
   No new read, no new key, and above all no assumed rate: there is no "hours x
   wage" here, because inventing a wage would produce a confident number nobody
   could check. A row with no honest source gets no line at all.

   ⚠️ THESE NAME THE FIGURE, THEY DO NOT BLAME THE MISS. "labor over goal" is
   what the number IS. It is the area's standing variance, not the cost of the
   one missing entry, and the wording has to stay on the right side of that. The
   item-gaps row is the only one where the number and the row are the same
   subject, which is why it reads plainly as the variance.

   ⚠️ TIER 2 AND UP ONLY, by consequence rather than by a gate here. `moneyCard`
   is never fetched below tier 2, so a team member gets `null` and every row
   renders exactly as it did before. That is the intended degradation. */

/* The published food goal wins over the flat benchmark, so the dashboard and the
   L10 board cannot disagree.
   ⚠️ ONE DEFINITION. This rule was written inline inside the Labor/Food card and
   is now needed in a second place; a second copy is exactly how two surfaces
   start quoting different goals for the same month. */
function foodGoalPct(sc) {
  return (sc && sc.s2 && typeof sc.s2.goal === "number") ? sc.s2.goal / 100 : foodGoalBenchmark();
}

/* Food dollars over goal, month to date. Full MTD sales on purpose, not a
   payroll window: food cost is not tied to the hours-through date. Same
   definition the Food card renders, so the two can never disagree. */
function foodOverDollars(food, sc) {
  if (!food || food.foodPct == null || !(food.salesTotal > 0)) return null;
  return (food.foodPct - foodGoalPct(sc)) * food.salesTotal;
}

/* The impact for one Today row, or undefined. Pure, module level, and it answers
   undefined for every row not listed rather than reaching for something close. */
function rowImpact(tile, money, sc) {
  if (!money) return undefined;
  const at = (amount, note) =>
    (Number.isFinite(amount) && amount > 0) ? { amount, note } : undefined;
  if (tile === "itemgaps") return money.gaps ? at(Number(money.gaps.total), "food variance") : undefined;
  if (tile === "eom") return at(foodOverDollars(money.food, sc), "food over goal");
  if (tile === "hours" || tile === "wages") {
    return money.labor ? at(Number(money.labor.laborOver), "labor over goal") : undefined;
  }
  return undefined;
}

const EOS_PERIOD = eosPeriod();
const kpiPct = (v) => `${v.toFixed(1)}%`;
/* ── WHAT DAY IS EACH NUMBER FROM? ─────────────────────────────────
   FCRPage stamps `asOf` (the last day a figure actually covers) onto the rows
   it publishes, and has done since Jul 23 — nothing has ever rendered it.
   That got sharper on Jul 28: the labor % can now be HELD deliberately, which
   means FCRPage stops publishing and the last good figure stays in this feed.
   A held number and a live one were pixel-identical here.
   ⚠️ NOT SHOWN INSIDE THE CELL. Six cells sit three-across on a phone; a fourth
   line would either grow every cell or truncate the date it exists to show.
   It goes on one shared line UNDER the grid, which costs nothing when no row
   carries a date — the usual case — and never clips.
   ⚠️ NO "IS IT STALE" THRESHOLD. How many days is too many is a cadence nobody
   has set; inventing one would put a warning on the dashboard on a rule Matt
   never agreed. State the date, let him judge. */
const asOfLabel = (iso) => {
  if (!iso || typeof iso !== "string") return null;
  const d = new Date(iso + "T12:00:00");   // bare ISO parses as UTC and renders the day BEFORE in ET
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/* ★ HOW OLD IS THIS NUMBER (Aug 4 2026).
   The producers guard hard against publishing a number they cannot trust, and
   that is right. What nothing covered is the other side of a correct refusal:
   the last good value stays on the shared scorecard and no screen says how old
   it is. A blocked publish is silent, and turnover is the worst case because a
   starved read fails toward ZERO and zero is the best possible turnover score.

   ⚠️ `at` IS NOT `asOf`. They are different facts and both are worth having.
   `asOf` is the last day the figure COVERS. `at` is when it was written. A
   turnover figure can cover a rolling 90 days and still have been published
   three weeks ago; only `at` catches that.

   ⚠️ 14 DAYS, and the number is a judgment not a law. Turnover is a rolling
   90-day figure that moves slowly, so a normal week must never trip this or the
   caption becomes noise people learn to skim. Short enough that a blocked
   publish surfaces well before a quarter closes.

   ⚠️ NO `at` MEANS UNKNOWN, NOT STALE. Rows written before this shipped carry
   no stamp, and calling them stale would light up the strip on day one for
   every metric at once. Old records must keep reading. */
const STALE_AFTER_DAYS = 14;
const staleDaysSince = (iso, now = Date.now()) => {
  if (!iso || typeof iso !== "string") return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const days = Math.floor((now - t) / 86400000);
  return days >= STALE_AFTER_DAYS ? days : null;
};
const KPI_ROWS = [
  // dest = the tool that PRODUCES this number (tab = FinancialSuite tab where
  // it applies). Tapping a cell opens the source tool — the place you'd go to
  // investigate the number or enter the missing data — not the EOS scorecard.
  //
  // ★ `basis` = THE WINDOW THIS NUMBER COVERS, and it is only set on the rows
  // that DISAGREE with the strip header. Four of the six really are month to
  // date, so the header says so once and those four stay quiet; tagging all six
  // would print "month to date" five times on one strip and teach directors to
  // stop reading the line that matters. The two exceptions, verified against
  // the code that publishes them rather than against the label:
  //   s5 Turnover      HRConsole computes a ROLLING 90-DAY separation rate
  //                    (seps in the last 90 days ÷ everyone employed in that
  //                    window). Never a monthly figure, and never annualised.
  //   s6 Evals on-time HRConsole asks, of the people who can be assessed, how
  //                    many are not yet past due RIGHT NOW. It is a snapshot of
  //                    the roster today, not anything that accrues over a month.
  // s8 Cash is NOT an exception even though it sits in the same row: CashAudit
  // deliberately publishes the CURRENT MONTH's variance, not the month being
  // viewed in its dropdown. So it belongs under the header with the other three.
  { id: "s1", label: "Sales", fmt: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`, dest: "financials", tab: "sales" },
  { id: "s2", label: "Food", fmt: kpiPct, dest: "financials", tab: "foodcost" },
  { id: "s3", label: "Labor", fmt: kpiPct, dest: "financials", tab: "labor" },
  { id: "s5", label: "Turnover", fmt: kpiPct, dest: "hr", basis: "last 90 days" },
  { id: "s6", label: "Evals on-time", fmt: (v) => `${Math.round(v)}%`, dest: "hr", basis: "right now" },
  { id: "s8", label: "Cash", fmt: (v) => `$${Math.abs(Math.round(v))}`, dest: "cashaudit" },
];
/* ⭐ A GLYPH PER METRIC. Matt, Aug 20 2026: "for the key metrics I'd like some
   glyphs in each box. It's a lot of white so I think that can definitely
   improve."

   ⚠️⚠️ IT SITS IN THE WHITE, IT DOES NOT COMPETE WITH THE NUMBER. The label is
   top-left and the figure under it, so the empty half of every cell is the top
   RIGHT. The glyph goes there, in the cell's own tone at low opacity, large
   enough to fill the space and faint enough that a director still reads 29.40%
   first. A solid icon in a tinted chip would have made six new focal points on
   a strip whose whole job is six numbers.

   ⚠️ ITS OWN MAP, NOT THE TOOL ICON MAP. `Icon` is keyed by TOOL id and its own
   comment records what an unmapped id costs — a tile-shaped hole that reads as
   a screen still loading. A KPI is not a tool, and borrowing that map would
   have put six non-tool keys into the thing that guards tools.

   ⚠️ EVERY ROW HAS ONE, AND A MISSING ONE DRAWS NOTHING RATHER THAN A BOX.
   `kpiGrid.test.mjs` fails if a KPI row has no glyph. */
const KPI_GLYPH = {
  /* Sales: a line going up. */
  s1: <><path d="M3 17l6-6 4 4 8-8" /><path d="M17 7h4v4" /></>,
  /* Food: a plate with cutlery. */
  s2: <><path d="M4 3v7a2 2 0 0 0 2 2 2 2 0 0 0 2-2V3" /><path d="M6 12v9" /><path d="M17 3c-1.7 1.2-2.5 3-2.5 5.5 0 1.9.8 3 2.5 3.5" /><path d="M17 3v18" /></>,
  /* Labor: a person and a clock, which is what labor cost is made of. */
  s3: <><path d="M9 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" /><path d="M2 21v-2a5 5 0 0 1 5-5h3" /><circle cx="17" cy="16" r="5" /><path d="M17 14v2l1.5 1" /></>,
  /* Turnover: somebody walking out of a door. */
  s5: <><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></>,
  /* Evals on-time: a clipboard with a tick. */
  s6: <><path d="M9 3h6v3H9z" /><path d="M15 4.5h2A2 2 0 0 1 19 6.5V20a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h2" /><path d="M9 14l2 2 4-4" /></>,
  /* Cash: a note. */
  s8: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>,
};


// ── Company Health ring ───────────────────────────────────────────
// A single glance number for directors: of the store metrics that ARE
// reporting, how many are on goal. Reads the SAME eos:scorecard feed as the
// KPI strip — no new source, no new math a producer doesn't already publish.
//
// Deliberately BINARY, not weighted. Each row already publishes hit:true/false;
// the ring counts greens over reporters. A weighted 0–100 would need per-row
// distance-to-goal and hand-picked weights we don't have — and a number nobody
// can reconstruct in an L10 is worse than an honest "4 of 5 on goal".
//
// ⚠️ MISSING ≠ ZERO. A row with no published actual (not yet entered — normal
// on any open day under closed-days-only entry) DROPS OUT of the denominator;
// it does not score zero. So the ring reads "3 of 3 reporting" mid-month, not
// "3 of 5" with two phantom misses, and it does NOT sag on a closed day and
// recover Monday — which would teach directors to ignore it. No reporters at
// all → score is null → the whole card doesn't render (never a fake 0).
//
// Six rows, every one of which publishes a real hit today: Sales(s1), Food(s2),
// Labor(s3) from FCRPage; Turnover(s5), Evals(s6) from HRConsole; Cash(s8) from
// CashAudit.
// NOT People/Compliance (nothing computes them) and NOT Facilities yet (its %
// lives in gcfcr-facilities-punchlist-v1, outside this feed — a later row).
//
// 🐛 CASH WAS MISSING AND THE CARD READ "4 of 5" UNDER A STRIP OF SIX
// (Matt, Aug 4 2026: "company health is off"). The KPI strip above renders six
// tiles including Cash (s8), and this list had five. So the one metric left out
// of the health score was a red one, and the ring read 80 when the same page
// showed four greens and two reds.
// ⚠️ A HEALTH NUMBER THAT QUIETLY DROPS A RED METRIC IS WORSE THAN A LOWER ONE.
// It is the number a director glances at and acts on, and it was flattering
// itself by exactly the metric that needed attention. Adding s8 moved today's
// score from 80 to 67 on the same data, which is the point.
// ⚠️ Keep this list and the KPI strip in step. They read the same eos:scorecard
// feed and describe the same board; a row on one and not the other is this bug.
const HEALTH_ROWS = [
  { id: "s1", label: "Sales" },
  { id: "s2", label: "Food" },
  { id: "s3", label: "Labor" },
  { id: "s5", label: "Turnover" },
  { id: "s6", label: "Evals" },
  { id: "s8", label: "Cash" },
];
function computeHealth(scorecard) {
  if (!scorecard || typeof scorecard !== "object") return null;
  let reporting = 0, hits = 0;
  const rows = HEALTH_ROWS.map((r) => {
    const cell = scorecard[r.id] || null;
    const a = cell && cell.actual;
    const hasActual = a !== null && a !== undefined && String(a).trim() !== "";
    if (!hasActual) return { ...r, reporting: false, hit: null };
    reporting++;
    const hit = cell.hit === true;
    if (hit) hits++;
    return { ...r, reporting: true, hit };
  });
  if (reporting === 0) return null; // nothing measured → no ring, not a 0
  return { pct: Math.round((hits / reporting) * 100), reporting, hits, total: HEALTH_ROWS.length, rows };
}

// ── Icons — single-stroke, keyed by tool id ──────────────────────
function Icon({ id, color, size = 22 }) {
  const paths = {
    onboarding: (
      <>
        <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </>
    ),
    eos: (
      <>
        <path d="M8 3l4 8 5-5 5 15H2L8 3z" />
      </>
    ),
    /* ⚠️ AN UNMAPPED id RENDERS AN EMPTY SQUARE, SILENTLY. `{paths[id]}` on an
       id with no entry is `undefined`, which React draws as nothing, so the
       tile keeps its coloured tile-shaped hole and looks like a loading state
       that never finishes (Matt, Aug 5 2026, screenshot of New Store Setup with
       a blank chip). Registering a tool and forgetting this map is a two-file
       mistake nothing warns about. */
    /* Without an entry here the tile draws an empty svg in a tinted box and
       reads as a card that failed to load — the two-file mistake this map's own
       comment warns about. A document with a corner turned: a copy. */
    l101tpl: (
      <>
        <path d="M14.5 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V7.5z" />
        <path d="M14.5 3.5v4h4" />
        <path d="M8.5 12.5h7" />
        <path d="M8.5 16h4.5" />
      </>
    ),
    /* 🐛 FOUR TILES WERE DRAWING AN EMPTY BOX (Matt, Aug 11 2026: "The new tools
       in the job don't have glyphs"). Exactly the two-file mistake the comment
       above warns about, four more times: the tool was registered in SECTIONS
       and nobody added it here, so each rendered a tinted square with an empty
       svg in it and read as a card still loading.
       ⚠️ A TOOL HAS NO FALLBACK. A section without an `icon` drops back to the
       coloured swatch a few hundred lines below; a tool draws whatever
       `paths[id]` holds, and for an unknown id that is nothing at all. So this
       map is not decoration for a tile, it is the tile's only glyph. */
    /* A coin. Registered in the SAME commit as the tile, because four tiles
       shipped without one this morning and each drew an empty box. */
    tokens: (
      <>
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
        <path d="M14.6 9.2a2.7 2.7 0 0 0-2.6-1.7c-1.4 0-2.5.8-2.5 1.9 0 2.6 5.2 1.4 5.2 4.1 0 1.2-1.2 2-2.7 2a2.8 2.8 0 0 1-2.7-1.8" />
        <path d="M12 6.2v1.3" />
        <path d="M12 15.5v1.3" />
      </>
    ),
    /* A calendar: a page with its two hanging tabs and the week rule. */
    calendar: (
      <>
        <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" />
        <path d="M8 3v4" />
        <path d="M16 3v4" />
        <path d="M4 10h16" />
      </>
    ),
    /* An open book: the manual. */
    manual: (
      <>
        <path d="M12 7.5C10.5 6 8.6 5.3 6 5.3c-.9 0-1.6.1-2 .2v13c.4-.1 1.1-.2 2-.2 2.6 0 4.5.7 6 2.2" />
        <path d="M12 7.5c1.5-1.5 3.4-2.2 6-2.2.9 0 1.6.1 2 .2v13c-.4-.1-1.1-.2-2-.2-2.6 0-4.5.7-6 2.2" />
        <path d="M12 7.5v13" />
      </>
    ),
    /* A clipboard with a tick: the shift leader's scorecard. */
    /* A cog: store settings. */
    storesettings: (
      <>
        <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
      </>
    ),
    uniform: (
      <>
        <path d="M9 3.5l3 2 3-2 5 2.8-2.2 4.2L16 9.6V20.5H8V9.6l-1.8.9L4 6.3z" />
      </>
    ),
    leadershipdev: (
      <>
        <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21.4 8 14 2 9.4h7.6z" />
      </>
    ),
    /* A ticked box: the shift leader's scorecard.
       🐛 `shiftleader` WAS IN THIS OBJECT TWICE, ~20 lines apart, and Vite
       warned on every boot. The later one wins in a JavaScript object literal,
       so the clipboard-with-a-tick written above was DEAD CODE and these paths
       are what the tile has actually been rendering.
       ⚠️ THE LIVE PATHS WERE KEPT ON PURPOSE, not the dead ones. Deleting the
       duplicate the other way round would have silently changed a tile icon for
       everybody, which is a visible change dressed up as a lint fix. The
       clipboard version is in this file's history if it is ever wanted back.
       Graded by dupKeys.test.mjs. */
    shiftleader: (
      <>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),

    dailysetup: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </>
    ),
    cleaning: (
      <>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
    trainertasks: (
      <>
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" ry="1" />
        <path d="M9 14l2 2 4-4" />
      </>
    ),
    food: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
    foodquality: (
      <>
        <circle cx="12" cy="8" r="6" />
        <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
      </>
    ),
    equip: (
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    ),
    supply: (
      <>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </>
    ),
    waste: (
      <>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </>
    ),
    cashaudit: (
      <>
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <line x1="8" y1="7" x2="16" y2="7" />
        <line x1="8" y1="12" x2="8" y2="12.01" />
        <line x1="12" y1="12" x2="12" y2="12.01" />
        <line x1="16" y1="12" x2="16" y2="12.01" />
        <line x1="8" y1="16" x2="8" y2="16.01" />
        <line x1="12" y1="16" x2="12" y2="16.01" />
        <line x1="16" y1="16" x2="16" y2="16.01" />
      </>
    ),
    thaw: (
      <>
        <line x1="12" y1="2" x2="12" y2="22" />
        <line x1="3.3" y1="7" x2="20.7" y2="17" />
        <line x1="20.7" y1="7" x2="3.3" y2="17" />
        <path d="M12 2l-2 3h4l-2-3zM12 22l-2-3h4l-2 3z" />
      </>
    ),
    financials: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M12 11v6M9.5 12.5h3.5a1.25 1.25 0 0 1 0 2.5H10a1.25 1.25 0 0 0 0 2.5h4.5" />
      </>
    ),
    scorecard: (
      <>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </>
    ),
    guestxp: (
      <>
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        <path d="M8 13l2.5-2.5 2 2L16 9" />
      </>
    ),
    ipo: (
      <>
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <line x1="4" y1="22" x2="4" y2="15" />
      </>
    ),
    /* ⏰ AVAILABILITY & SKILLS — a clock, because the question the tile answers
       is "when". Deliberately NOT a calendar: the Calendar tile and the weekly
       section glyph are both calendars already, and three calendars in one list
       is three tiles nobody can tell apart at a glance. */
    availability: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6.8V12l3.4 2" />
      </>
    ),
    /* 🗓 SCHEDULE — a frame with rows of shift bars in it, which is what the
       week grid actually looks like. Distinct from `sec:weekly` (a bare
       calendar) because this sits in the Leadership list beside it. */
    schedule: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 8.6h18M8 2.5v3.5M16 2.5v3.5" />
        <path d="M6.2 12h6M6.2 15.8h4M14.6 12h3.2M13 15.8h4.8" />
      </>
    ),

    /* 🐛 A TOOL WITH NO GLYPH RENDERS AN EMPTY SVG inside a tinted box —
       `paths[id]` is undefined and the component draws whatever that is, which
       is nothing. It reads as a tile that failed to load rather than a tile
       without an icon. Registering a tool and forgetting this map is a two-file
       mistake nothing warns about. */

    /* ── SECTION GLYPHS ──────────────────────────────────────────────────
       Matt, Aug 7 2026, on the dashboard: "the emblems in tools".

       🐛 The five section cards drew a plain 11px square in the section colour
       inside the same 30x30 tinted box the tool tiles use for a real glyph. Next
       to a wrench and a shield that reads as an unfinished placeholder, not a
       design. They never called Icon at all.

       ⚠️ KEYED `sec:*` SO THEY CANNOT COLLIDE WITH A TOOL ID. A section called
       "money" and a tool called "money" would otherwise fight over one key, and
       the loser would silently render the wrong picture. */
    "sec:daily": (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    "sec:weekly": (
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 10h18M8 2v4M16 2v4" />
      </>
    ),
    "sec:money": (
      <>
        <path d="M12 2v20" />
        <path d="M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.5c0 4.5 10 2.5 10 7 0 1.9-2.2 3-5 3s-5-1.1-5-3" />
      </>
    ),
    "sec:people": (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
        <path d="M16.5 5.6a3.2 3.2 0 0 1 0 6.2" />
        <path d="M18 20a6.2 6.2 0 0 0-3-5.3" />
      </>
    ),
    /* A summit flag rather than a star or a crown. Peak Reachers is the
       store's own language for the leadership climb and the dashboard already
       carries the mountain backdrop; a star here would be a second metaphor
       for the same thing. */
    "sec:leadership": (
      <>
        <path d="M6 21V3" />
        <path d="M6 4h9l-2 3 2 3H6" />
        <path d="M3 21h8" />
      </>
    ),

    /* A megaphone. ⚠️ REGISTERED BECAUSE I SHIPPED THE TILE WITHOUT ONE AND IT
       DREW AN EMPTY BOX ON MATT'S PHONE — the exact failure the note at the top
       of this map already described ("four tiles shipped without one this
       morning and each drew an empty box"), repeated by me the same day. A tool
       id with no entry here has no glyph and no fallback. */
    announce: (
      <>
        <path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z" />
        <path d="M16 8.5a4.5 4.5 0 0 1 0 7" />
        <path d="M19 6a8 8 0 0 1 0 12" />
      </>
    ),

    /* A hand raised. Registered IN THE SAME COMMIT as the tile, which is the
       lesson from `announce` three lines up. */
    escalate: (
      <>
        <path d="M12 3v10" />
        <path d="M8.5 6.5 12 3l3.5 3.5" />
        <path d="M5 14v3a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4v-3" />
      </>
    ),

    teamsite: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    training: (
      <>
        <path d="M22 10L12 5 2 10l10 5 10-5z" />
        <path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5" />
      </>
    ),
    leadertraining: (
      <>
        <circle cx="12" cy="12" r="10" />
        <polygon points="10 8 16 12 10 16 10 8" />
      </>
    ),
    hr: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="2" />
        <path d="M15 8h4M15 12h4" />
        <path d="M5.5 16c.6-1.6 6.4-1.6 7 0" />
      </>
    ),
    facilities: (
      <>
        <path d="M3 21h18" />
        <path d="M5 21V8l7-5 7 5v13" />
        <path d="M10 21v-6h4v6" />
        <path d="M9 11h.01M15 11h.01" />
      </>
    ),
    orientation: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M15.6 8.4l-2.2 5-5 2.2 2.2-5 5-2.2z" />
      </>
    ),
    opschecklists: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M6.5 8.2l1.4 1.4 2.8-2.8" />
        <path d="M6.5 15.2l1.4 1.4 2.8-2.8" />
        <path d="M13.5 8h4.5M13.5 15h4.5" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[id]}
    </svg>
  );
}

/* ★ ROUND THE PARTS SO THEY ADD UP TO THE ROUNDED WHOLE (Matt, Aug 5 2026,
   screenshot: the card said "Cut ~21 hrs today" with FRONT 13 and BACK 9).

   Each figure was rounded on its own, so 21.4 became 21 while 12.6 and 8.8
   became 13 and 9. Thirteen and nine is twenty-two. Every breakdown on the card
   summed to 22 while the headline said 21, and Dinner read "front 3 · back 3 ·
   7 h".

   ⚠️ THIS IS THE EXACT CONTRADICTION THE SPLIT WAS BUILT TO AVOID. The comment
   on monthLaborCard's per-area variance says the two tiles add up to the
   headline, "so a leader reading 'cut 21' and then 'front 11, back 10' sees one
   consistent story". Rounding quietly broke that promise, on a card people act
   on mid-shift.

   Largest remainder: round everything down, then hand the leftover units to
   whichever parts were closest to rounding up. The parts always sum to the
   total, and no part moves by more than one hour from its true value.

   ⚠️ TOTAL IS ROUNDED FIRST AND IS THE AUTHORITY. Summing the rounded parts
   instead would make the headline drift from the number the labor maths
   actually produced, which is the wrong one to bend. */
function apportion(total, parts) {
  const t = Math.round(Number(total) || 0);
  const vals = (parts || []).map((p) => Number(p) || 0);
  const sign = vals.map((v) => (v < 0 ? -1 : 1));
  const abs = vals.map(Math.abs);
  const floors = abs.map(Math.floor);
  let left = Math.abs(t) - floors.reduce((a, b) => a + b, 0);
  /* Guard: if the parts genuinely do not describe the total — a caller bug, or
     a total from a different basis — do not invent units to close the gap.
     Better a visible mismatch than a fabricated one. */
  if (!Number.isFinite(left) || Math.abs(left) > vals.length) return vals.map(Math.round);
  const order = abs.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  const out = floors.slice();
  for (let k = 0; k < order.length && left > 0; k += 1) { out[order[k][1]] += 1; left -= 1; }
  return out.map((v, i) => v * sign[i]);
}

// ── Sections & tools ──────────────────────────────────────────────
// NOTE: Sales Allocation, Labor Planner, Food Cost Tracker, and FCR
// Projections were each their own tile. They're now combined into one
// "Financials" tile (tab bar inside FinancialSuite.jsx), which also
// adds Profit Share — previously not registered on the dashboard at all.
/* n with a noun, pluralised. "1 overdue evaluation", "3 overdue evaluations".
   Module level on purpose: it is called from the section-card render ~3,000
   lines below, and a helper declared inside the component can be read in its
   temporal dead zone by anything that runs during the first render. */
/* How long "I'm on shift, remind me later" actually holds. One shift.
   🐛 IT USED TO BE SESSION-ONLY REACT STATE, and on a phone with the Hub added
   to the home screen that is worth about ten seconds: the app reloads whenever
   iOS resumes it, and the reload wiped the flag. So the gate came straight back
   every single time Matt reopened the Hub. Paired with the confirm button being
   stuck grey (see the gate below), he had NO working way out at all.
   ⚠️ STILL NAGS, WHICH IS THE POINT — it returns next shift, and every shift
   after, until they watch it. It just is not useless in between now. */
const TRAIN_SNOOZE_MS = 4 * 60 * 60 * 1000;

const countLabel = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const SECTIONS = [
  {
    label: "Daily Operations",
    icon: "sec:daily",
    color: TEAL,
    tools: [
      /* ★ LINEUP — the brand for the scheduling, setup and labor system.
         Matt, Aug 14 2026: "i want a name for our scheduling, setup and labor
         planner system... so we can brand it", then "Lineup."

         ⚠️ ONLY THE `name` MOVES. Every `id` stays exactly as it was —
         "dailysetup", "schedule", "availability" — because ids are what
         `allowIdsFrom`, `owners.tileAllow` and the saved `lastTool` all key on.
         Renaming an id would silently close a tile to the people allowed on it.

         ⚠️ THE FAMILIAR WORD IS KEPT ON THE RIGHT OF THE DOT. Leaders have
         called this "the setup" for a year and team members know "my shifts".
         A brand that costs somebody the name they already use is a worse brand.

         ⚠️ THIS IS NOT A RULE 18 PROBLEM, and the difference is worth stating
         because it looks like one. "Peak Reachers" was GATE CITY'S programme
         name and had to become a setting. "Lineup" is the HUB'S name for its
         own feature, identical at every store, so it belongs in the source the
         same way "HR Console" and "Ops Checklists" do. Do not turn it into a
         setting. */
      { id: "dailysetup", name: "Lineup · Daily Setup", desc: "Assign FOH & BOH stations by day and shift", tier: 1, Component: DailySetup },
      { id: "opschecklists", color: "#0891B2", name: "Ops Checklists", desc: "Shift-tagged Leader, FOH & BOH checklists", tier: 2, allow: ["Junior Trainer", "Trainer", "Senior Trainer"], Component: OpsChecklists },
      { id: "food", color: "#0F766E", name: "Food Safety", desc: "Run the biweekly Safety Walk", tier: 2, allow: ["Junior Trainer", "Trainer", "Senior Trainer"], Component: FoodSafety },
      { id: "waste", name: "Waste & Donations", desc: "Log waste, donations and inventory", tier: 2, allow: ["Junior Trainer", "Trainer", "Senior Trainer"], Component: WasteTracker },
      { id: "cleaning", name: "Daily Cleaning", desc: "Sign off FOH & BOH cleaning tasks", tier: 1, Component: DailyCleaning },
    ],
  },
  {
    label: "Weekly Operations",
    icon: "sec:weekly",
    color: VIOLET,
    tools: [
      { id: "trainertasks", color: "#EA580C", name: "Trainer Tasks", desc: "Submit your cleaning task with photo proof, once a fortnight", tier: 2, allow: ["Junior Trainer", "Trainer", "Senior Trainer"], Component: TrainerTasks },
      { id: "foodquality", color: "#2B2720", name: "Food Quality", desc: "Weekly QIV sweep — 58 scored checkpoints", tier: 2, allow: ["Junior Trainer", "Trainer", "Senior Trainer"], Component: FoodQuality },
      { id: "equip", name: "Equipment Log", desc: "Check equipment and temps each shift", tier: 2, allow: ["Junior Trainer", "Trainer", "Senior Trainer"], Component: EquipmentLog },
      { id: "supply", name: "Supply Central", desc: "Order supplies and check pars", tier: 2, allow: ["Junior Trainer", "Trainer", "Senior Trainer"], Component: SupplyCentral },
      { id: "thaw", name: "Thaw Allocation", desc: "Reference the monthly thaw cabinet map", tier: 2, allow: ["Junior Trainer", "Trainer", "Senior Trainer"], Component: ThawAllocation },
      /* Brandon (id 16) co-owns Facilities — Matt, Jul 30 2026. The allowIds
         grant works TODAY while HR still says Assistant Director; once his
         title flips to Director on Monday the allow:["Director"] covers him
         and the id entry becomes redundant but harmless. Leave it — it also
         survives any future title change. */
      /* allowIds comes from storeConfig so the tile gate and /api/facilities-seed
         read ONE list. Two copies of one person's access is what made Nick's
         reduced view take a morning to find. */
      { id: "facilities", name: "Facilities", desc: "Punch list, work orders and vendor contacts", tier: 3, allow: ["Director"], allowIdsFrom: "facilities", Component: Facilities },
    ],
  },
  {
    /* ★ RENAMED FROM "Money" (Matt, Aug 11 2026: "should guest experience be in
       money?"). He was right, and the tile was not the problem: THREE of the
       five here are not money. Guest scores, six-pillar goals and an action
       checklist are performance. The giveaway was that Guest Experience is the
       only tile in this section a trainer can open, so a section called Money
       was partly visible to people with no money access at all.
       ⚠️ THE ICON KEY `sec:money` DELIBERATELY DID NOT CHANGE. It is what draws
       the glyph and what the four branches below now match on; renaming it
       would be a second change wearing the first one's clothes. */
    label: "The Numbers",
    icon: "sec:money",
    color: RED,
    tools: [
      { id: "cashaudit", name: "Cash Audit", desc: "Audit the safe and log overages", tier: 2, allow: ["Payroll"], Component: CashAudit },
      /* ★ DIRECTORS ADDED Aug 10 2026. Matt, looking at Brandon's
         phone: "Director should see these things but just not the profit share
         or PTO. The other things in financial though."
         Director is rank 5 and tier 3 starts at rank 6, so all three of these
         were locked to him. `allow` opens exactly these three by title rather
         than moving Director to tier 3, which would have handed them every
         tier-3 tile in the Hub. Two people hold the title.
         ⚠️ THE THREE MATCHING WORKER ROUTES WERE WIDENED IN THE SAME COMMIT
         (fcr-data, labor-seed, food-gaps-seed, inventory-gaps-seed,
         expense-vendors, scorecard-seed, ipo-plan GET). A tile that opens onto
         a 403 is worse than a locked tile — that is the Facilities lockout of
         Aug 8, repeated. See isDirector in finShared.js.
         ⚠️ Profit Share needs nothing here: PROFIT_ROLES already excludes
         Director, so that tab does not render for them. PTO is hidden inside
         FinancialSuite. The `desc` still says "profit share" for the people who
         do get it. */
      { id: "financials", name: "Financials", desc: "Sales, labor, food cost, FCR & profit share", tier: 3, allow: ["Payroll", "Director"], Component: FinancialSuite },
      { id: "scorecard", color: "#13293F", name: "Business Scorecard", desc: "Track goals across all six pillars", tier: 3, allow: ["Director"], Component: BusinessScorecard },
      // tier 3 → 2 (Jul 27): shift leaders read guest feedback beside their own
      // scoreboard. Editing stays with directors — enforced INSIDE the component
      // via its `tier` prop, not by this registration. Ship both files together:
      // this line alone would make the tile visible AND editable to leaders.
      { id: "guestxp", color: "#0E4D64", name: "Guest Experience", desc: "CEM survey & Smart Shop scores, month over month", tier: 2, allow: ["Junior Trainer", "Trainer", "Senior Trainer"], Component: GuestExperience },
      /* ⚠️ A DIRECTOR MAY WORK THIS CHECKLIST BUT NOT REPLACE THE QUARTER PLAN.
         Ticks save through window.storage, so the tile is fully usable; pasting
         a new quarter goes to POST /api/ipo-plan, which stays at rank >= 6 on
         purpose — stored plans beat the in-code ones and drive the dashboard
         pill as well as this tile. */
      { id: "ipo", color: "#B4830F", name: "IPO Action Items", desc: "Work the IPO action item checklist", tier: 3, allow: ["Director"], Component: IPOActionItems },
    ],
  },
  {
    label: "People & Team",
    icon: "sec:people",
    color: NAVY,
    tools: [
      // For everyone (tier 1) — what a team member opens this section for.
      /* `feature: "teamSite"` — a store that does not run a team site gets no
         tile. The team GOALS panel is nested inside this one, so it goes with
         it; that is why there is no separate flag for goals. */
      /* ⚠️ `get name()`, NOT A STRING. `SECTIONS` is a module-level const built
         at import, before a store's saved settings merge, so a plain
         `name: programLabel()` would freeze the deployed value. The getter runs
         on every read, and every consumer stays untouched: the tile title, the
         A-Z sort, the search filter and the dashboard list all read `.name`. */
      { id: "teamsite", get name() { return programLabel(); }, desc: "Find announcements and team info", tier: 1, feature: "teamSite", Component: PeakReachers },
      { id: "training", color: "#7E22CE", name: "Team Training", desc: "Complete training paths and modules", tier: 1, Component: TrainingSite },
      /* ★ ANNOUNCEMENTS (Matt, Aug 13 2026, part 1 of messaging). TIER 1 ON
         PURPOSE: everyone RECEIVES announcements, so everyone needs the screen
         that shows them and the button that confirms one. POSTING is a
         different question and is gated in the Worker, not here — /api/announcement
         refuses `create` and `retract` below tier 3, and the compose box only
         renders for a leader. A tile gated to Directors would have hidden the
         confirmation button from the exact people asked to tap it, which is the
         Facilities lockout in reverse.
         ⚠️ IT SITS IN "People & Team" WITH THE OTHER TIER-1 TOOLS, for the same
         reason the Calendar moved out of Leadership: a tile everyone opens does
         not belong under the heading for director tools. */
      { id: "announce", color: "#B45309", name: "Announcements", desc: "What the store has been told, and what you still need to confirm", tier: 1, Component: Announcements },
      /* ★ TELL A LEADER (Matt, Aug 13 2026, part 3 of messaging). TIER 1, AND
         THE TIER IS THE FEATURE: the whole point is that a team member running
         late at 5:40am can reach whoever is on without knowing who that is. A
         gate here would leave them ringing a store phone nobody answers during
         a rush, which is the situation this replaces.
         ⚠️ THE SAME TILE SHOWS TWO DIFFERENT SCREENS. Everybody gets the send
         form. A leader also gets the store's list and the one line of outcome,
         and that split is decided by the SERVER — /api/escalations filters
         through escalations.js and simply does not send a team member anybody
         else's row. Widening this tier could not widen what anyone can read.
         ⚠️ NO `allow:` LIST AND NO FEATURE FLAG. A second store does not get to
         turn off the way its team says "I cannot make it"; the routing already
         adapts on its own, because it reads that store's board. */
      { id: "escalate", color: "#8C2F39", name: "Tell a Leader", desc: "Running late, cannot make it, or something is broken", tier: 1, Component: Escalate },
      /* ★ MOVED OUT OF "Leadership" Aug 13 2026 (Matt: "move it"). It went
         tier 1 the day before, and a tile everyone can open sitting under a
         heading that means "director tools" is a heading that lies to five out
         of six readers. The section note above Leadership says in as many words
         that it exists so a team member's landing card stays short and unlocked;
         one tier-1 tile in there is exactly what that was written to prevent.
         ⚠️ PLACEMENT ONLY. Same tier, same allow, same component — nothing about
         who can open it changed, so this cannot re-close it for anybody. */
      /* ★★ TIER 1 SINCE Aug 12 2026 (Matt: "open it to everyone"), AND THE TILE
         SHOWS TWO DIFFERENT THINGS. Anyone can be invited to a meeting, so
         anyone needs somewhere to say yes or no; at tier 3 an invited team
         member had nowhere to answer and the organiser waited on a reply that
         could never come. A non-owner opens straight onto Meetings. Publishing
         bookable times, event types and the month view stay owner-only inside
         CalendarTile, gated on `isCalendarOwner` rather than on this number.
         ⚠️ THE TIER IS NOT WHAT KEEPS ANYONE'S DIARY PRIVATE. The screen asks
         /api/calendar-mine and is handed only the meetings that person is in,
         so widening this could not widen what anybody can see. If that ever
         stops being true, this line is not the fix.
         ⚠️ `allow: ["Director"]` STAYS. It is redundant against tier 1 today and
         costs nothing, and removing it would silently re-close the tile for a
         Director if the tier ever moved back up. */
      { id: "calendar", color: "#2F5D50", name: "Calendar", desc: "Meetings you are invited to, and the times people can book", tier: 1, allow: ["Director"], Component: CalendarTile },
      { id: "hr", color: "#223C6A", name: "HR Console", desc: "View your profile and set your PIN", tier: 1, Component: HRConsole },
      /* ⏳ TIER 4 IS THE ALPHA GATE, NOT THE DESIGN. Matt, Aug 13 2026: "only
         nick, hannah, bri and myself have access to this rn / this is alpha
         phase". Tier 4 is above every tier roleTier can return, so no rank
         opens this and `owners.tileAllow.schedule` in ownerSeed.js is the only
         way in — the same shape Orientation and the L101 template already use.
         ⚠️⚠️ THIS SCREEN IS WRITTEN TO BE TIER 1 and belongs there when the
         alpha ends: every team member sets their own hours, and a gate above
         them puts availability back on paper. It is held here ONLY because
         merging it open would drop an unproven screen on ~106 people about a
         minute later, with no human step in between.
         ⇒ TO END THE ALPHA: set this back to `tier: 1`, drop `allowIdsFrom`,
         and delete the `schedule` list in ownerSeed.js in the SAME commit.
         ⚠️ THIS TILE IS NOW THE TEAM HALF ONLY — availability and shift swaps.
         (It used to carry Skills, Time off and the School calendar too; those
         moved to the Schedule console's Set up tab, Aug 13 2026.) Everything a
         leader configures lives over there, which is why this half is the one
         written to be tier 1.
         ⚠️ NO `mode` PROP IS PASSED AND NONE IS NEEDED. The tile registry hands
         every Component the same fixed prop list, so `mode` DEFAULTS to "team"
         inside Availability and only ScheduleConsole passes "leader". Adding a
         per-tile props bag to the registry to say the default out loud would
         change how all thirty-odd tiles are rendered, to no effect. */
      /* ★ LINEUP. See the note on the dailysetup tile for why the id is
         untouched and why this is not a rule 18 setting.

         ⚠️⚠️ THE OLD WORDS STAY IN THE DESCRIPTIONS, AND THAT IS LOAD-BEARING.
         The tool search matches `name` OR `desc` (see `results` further down),
         so a rename that drops a word drops the search term with it. Before
         this line said "availability", typing that found NOTHING — and
         "schedule" found nothing either until the sibling tile's description
         gained the word. A leader who cannot find a tool by the name they have
         always used will conclude it was taken away. */
      /* ★★ TIER 1 SINCE Aug 14 2026, WHICH ENDS HALF THE ALPHA GATE.
         Matt: "how does the team see it and they need to only see their own.
         hannah, nick, bri and myself can see and edit the full schedule."

         This tile was tier 4 behind `allowIdsFrom: "schedule"` for the alpha,
         and ownerSeed.js's own note said it would go back to tier 1 when that
         ended. This is that. The SIBLING tile below ("Lineup") keeps the gate,
         so the full schedule is still Bri, Hannah, Matt and Nick.

         ⚠️ OWN-ONLY IS ENFORCED INSIDE THE COMPONENT, NOT BY THIS LINE.
         Availability in team mode builds its shift list by filtering on the
         viewer's own roster id, and every leader panel it carries is behind
         `canSeeTeam` (tier 2) or `canEditAll` (tier 3). A tier 1 person sees
         their own shifts, their own availability, and the drop board. They
         cannot see the roster, the skills, or anybody's approvals.
         ⚠️ SO DO NOT MOVE A LEADER PANEL OUT FROM BEHIND THOSE TWO FLAGS. This
         tile is now open to ~106 people and the tier check is the only thing
         between them and everybody's records. */
      { id: "availability", color: "#0E7490", name: "Lineup · My Shifts", desc: "Set your availability, drop or pick up a shift", tier: 1, Component: Availability },
      /* ★ TOKENS — TIER 1 AND FLAGGED OFF (Matt, Aug 11 2026: "This is a Hub
         feature, per store, off by default").
         ⚠️ `feature: "tokens"` is the whole switch. canUseTool checks
         `storeCfg("features.tokens") === false` ABOVE every other arm, so a
         store that said no never sees this tile at any tier — and Gate City
         ships with it false, so nothing changes here until somebody turns it on.
         ⚠️ TIER 1 IS RIGHT even though only Directors can grant. A currency
         nobody can see the balance of is not a reward; the tile shows a team
         member their own total and hides the leader panel from them. */
      /* ⚠️ `get name()`, NOT A STRING, for the same reason as the team site tile
         above: `SECTIONS` is a module-level const built at import, before a
         store's saved settings merge, so `name: tokenLabel()` would freeze the
         deployed default. The tile said "Tokens" no matter what the store had
         saved, while every screen behind it said the store's own word.
         ⚠️ THE STORED LABEL IS LOWERCASE ON PURPOSE — it goes into sentences
         like "Not enough stars." — so the first letter is raised here rather
         than stored capitalised. `.name` is read by the tile title, the A-Z
         sort, the search filter and the dashboard list, and all four want a
         real string, so this is not a CSS `textTransform` job. */
      { id: "tokens", color: "#8A6A1F", get name() { const w = tokenLabel(); return w.charAt(0).toUpperCase() + w.slice(1); }, desc: "See your balance and what you can get", tier: 1, feature: "tokens", Component: TokensTile },
      /* Tier 1 on purpose: every team member orders their own uniform, and the
         old route was a Google Form anybody could open. Gating it above the
         people who use it would just send them back to the outside form. */
      { id: "uniform", color: "#0F766E", name: "Uniform Order", desc: "Order your polo, pants and belt", tier: 1, Component: UniformOrder },
    ],
  },
  {
    // Split out of the old "People & Team" pile: member-facing tools stay in
    // "Team" (above), the tier-3 director tools live here so the landing card a
    // team member sees is short and unlocked, and directors get one focused
    // Leadership card. Scorecard first — it's the daily open. Indigo, kept in
    // the same blue family as Team to signal the shared origin.
    label: "Leadership",
    icon: "sec:leadership",
    color: LEAD,
    tools: [
      // tier 2 — shift leaders can OPEN this, but ShiftLeaderScorecard reads the
      // `tier` prop passed below and renders VIEW-ONLY for anyone under 3: no
      // Daily Entry, no Save Day, no Set goals, no Roster, no lead override.
      // Entry stays with directors. Do NOT drop this to tier 1 — team members
      // are deliberately kept off leader scoring entirely.
      { id: "shiftleader", color: "#3730A3", name: "Shift Leader Scorecard", desc: "Weekly per-leader scoring", tier: 2, Component: ShiftLeaderScorecard },
      { id: "leadershipdev", name: "Leadership Dev", desc: "Roster, coaching, pipeline & Leadership 101", tier: 3, Component: LeadershipDevTile },
      /* ⏳ TIER 4, SAME ALPHA GATE AS Availability ABOVE — one list covers both,
         so the two tiles can never drift into different testers. Building the
         week is a Director decision anyway, and the component still checks
         tier >= 3 inside and refuses with a reason rather than an empty screen.
         ⚠️ IT DOES NOT WRITE TO THE BOARD. Daily Setup neither reads nor is read
         by the schedule key, so a bad week here cannot reach a live shift.
         Publishing to the board is its own step and its own decision. */
      /* ★ LINEUP — the front door of the system, so this one carries the name
         on its own with no qualifier. See the note on the dailysetup tile.
         ⚠️ The description gained "training" because the Training tab is new;
         it did not gain a word about the board, because pulling a Lineup week
         into Daily Setup is still locked (HUB_SCHEDULE_PULL_READY). */
      { id: "schedule", color: "#0E7490", name: "Lineup", desc: "Build the week's schedule, and set up skills, training, hours, time off and minor limits", tier: 4, allowIdsFrom: "schedule", Component: ScheduleConsole },
      /* ★ THE INTERNAL CALENDAR (Bri, Aug 10 2026). Owners are Directors, HR
         and the Executive Directors — tier 3 covers HR, the EDs, Bri and Nick;
         `allow` adds the plain Directors, who are rank 5 and therefore tier 2.
         ⚠️ THE SAME SET calendarStore calls an owner. If one changes, change
         both — the tile decides who can OPEN it and the leaf decides who can
         own a type, and a tile that opens onto a screen that refuses you is
         the Facilities lockout again. */
      /* ★ THE UNWIRED L101 COPY (Bri, Aug 7 2026, priority with a Sept 1 date).
         tier 4 means the tier arm can NEVER open it — canUseTool is a `>=` test
         and nobody is tier 4 — so TILE_ALLOW_IDS is the only way in. Same shape
         the removed rollouts tile used, and for the same reason: this is one
         person's working copy, not a tile the store browses.
         ⚠️ SEPARATE TILE ON PURPOSE. It shares a name with the live class and a
         leader must never open the wrong one; sitting it beside Leadership Dev
         with "Store Template" in the name is what keeps them apart. */
      { id: "l101tpl", color: "#7E22CE", name: "L101 — Store Template", desc: "Unwired copy for a new store — edit freely", tier: 4, allowIdsFrom: "l101tpl", Component: L101Template },
      /* ★ DIRECTORS SEE EOS (Daisy, Aug 6 2026: "I was logging into the EOS on
         the hubs leadership tab but it still says my access is only leader and
         not Director").
         Her title is right — she is stored as Director. Director is rank 5,
         and roleTier only reaches tier 3 at rank 6, so a Director is tier 2
         and this tile is tier 3. Not a stale cache and not a wrong title: the
         thresholds simply do not put a Director here.
         The scoped exception is the fix rather than raising Director to rank 6,
         which would hand every Director tier 3 on EVERY tile at once.
         ⚠️ EOSTile HAS ITS OWN SECOND GATE and this alone does nothing but
         show her a locked screen — see ALLOWED_NAMES in EOSTile.jsx, which had
         to change with it. Two doors; opening one is not access. */
      { id: "eos", name: "EOS", desc: "Rocks, metrics, issues & Level 10 meetings", tier: 3, allow: ["Director"], Component: EOSTile },
      /* ★ THE STORE'S OWN SETUP, AS DATA (step 3, Aug 11 2026). Identity, area
         owners, feature switches and the numbers, typed once instead of hand
         edited into JavaScript files.
         ⚠️ TIER 3 AND NO OTHER ARM. No `allow`, no `allowIds` — deliberately
         narrower than every other director tile. This page changes the board,
         the money screens, who is notified and which parts of the Hub exist,
         for everybody. A role or a named exception widening it is exactly the
         shape of the two access bugs already written up in this file, and there
         is no request for one.
         ⚠️ StoreSettings refuses again on tier below 3 rather than trusting
         this. A second refusal costs nothing here and a missed one costs
         everything. */
      { id: "storesettings", name: "Store Settings", desc: "Store name, owners, features and goals", tier: 3, Component: StoreSettings },
      /* ★ THE HUB EXPLAINING ITSELF (Matt, Aug 11 2026: "i cant even keep uup
         with the hubs capabilties", then "this needs to be for every store
         operator that signs up").
         ⚠️ TIER 1 ON PURPOSE, and it is the only tile in this section that is.
         A manual only a Director can read is not onboarding — a new team member
         should be able to find out what the four tools they hold are for. It
         shows each person only what they can already open, so opening it wide
         reveals nothing (see ManualTile.jsx). */
      { id: "manual", color: "#3F4A63", name: "Manual", desc: "What every tool you can open is for", tier: 1, Component: ManualTile },
      /* ⚠️ TWO COMMERCIAL TILES WERE REMOVED HERE, Aug 8 2026. They sold and
         administered a SEPARATE BUSINESS from inside a Chick-fil-A store's ops
         app. Matt's call: that company's material does not belong in this repo
         and an audit of it is a live concern.
         Nothing was stranded — its register key held zero rows — and the text
         moved to that business's own repo.
         ⚠️ DO NOT BRING THAT COMPANY'S MATERIAL BACK HERE. It has its own repo.
         build-log.md carries the detail; this comment deliberately does not. */
    ],
  },
];
/* ═══ WHICH SECTIONS THIS PERSON CAN SEE ════════════════════════════════════
   ★ ONE DEFINITION, TWO READERS: the dashboard grid and the Manual tile.
   🐛 THE MANUAL NEEDED THIS AND ALMOST GOT A COPY. `shownSections` below is
   declared AFTER the `if (activeTool)` early return, so referencing it from the
   tool render throws "Cannot access before initialization" — a blank page, and
   NONE of the six checks can see it: tdzcheck reads useMemo and useCallback
   bodies, not JSX sitting above a later const. Found by reading, not by a green
   tick. The tempting fix was to inline the filter at the call site, which is a
   second opinion about access in the last file anyone would check.
   ⚠️ MODULE LEVEL, so it cannot be in a dead zone anywhere (design rule 7).
   ⚠️ FILTER ONLY, NO SORT. The dashboard's ordering is a dashboard concern and
   layers on top; the manual reads in the Hub's own section order. */
const sectionsFor = (userTier, person) =>
  SECTIONS.map((s) => ({ ...s, tools: s.tools.filter((t) => canUseTool(t, userTier, person)) }))
    .filter((s) => s.tools.length > 0);


/* ── Tools that live INSIDE HR Console, not on the landing grid ──────
   Hannah, Jul 30 2026: "Please move the onboarding link and orientation link to
   HR console." These two are no longer tiles. HR Console draws a button for each
   one it is handed and renders it as a panel.

   They stay described HERE, in the same shape as a tile, for one reason: access
   is decided by canUseTool, exactly as it was when they were tiles. HR Console
   never re-implements the rule, so there is nothing to drift.

   ⚠️ Do NOT move these into SECTIONS to "put them back" — they would then show
   BOTH as a tile and inside HR Console.

   Orientation: tier 4 is reachable by nobody (roleTier tops out at 3), so the id
   list IS the access list — Bri 17 · Hannah 21 · Matt 33 · Nick 37 · Thanh 55.
   ⚠️ Nick's ONLY_TOOLS set keeps BOTH "hr" and "orientation": a narrowing list
   beats every grant, and he now needs "hr" to reach Orientation at all. */
const HR_PANEL_TOOLS = [
  /* allowIds comes from storeConfig now, the same one home Facilities and
     l101tpl already read. It was typed inline here, which put one tile's
     access list somewhere no other file could see it. Same five people. */
  { id: "orientation", name: "Orientation", desc: "Run orientation and file completion records", tier: 4, allowIdsFrom: "orientation", Component: NewHireOrientation },
  { id: "onboarding", name: "Onboarding Link", desc: "Grab the new-hire onboarding link to send", tier: 3, allow: ["Payroll"], Component: OnboardingLauncher },
];

/* Module level and a plain function, not a hook or a memo: it is called during
   render and must not read anything declared later in the component. */
const hrLaunchersFor = (userTier, person) =>
  HR_PANEL_TOOLS.filter((t) => canUseTool(t, userTier, person)).map((t) => {
    const C = t.Component;
    return { id: t.id, name: t.name, desc: t.desc, node: <C tier={userTier} user={person} /> };
  });

const toolById = (id) => {
  for (const s of SECTIONS) {
    const t = s.tools.find((x) => x.id === id);
    if (t) return t;
  }
  return null;
};
const colorFor = (tool) =>
  tool.color || SECTIONS.find((s) => s.tools.some((t) => t.id === tool.id))?.color || INK;
/* ⭐⭐ SIGNING IN WITHOUT PICKING A TOOL. Matt, twice: "I still want to log in
   without going into a tool."

   ⛔ `openTool` IS THE ONLY DOOR TO THE PIN CARD, and it takes a tool. So the
   whole sign-in flow was: tap something you may not even want, get refused,
   type your PIN, land INSIDE that tool, and back out to reach the dashboard.
   The signed-out header offered nothing at all.

   ⇒ A tool-shaped sentinel, so the card it opens is the same card rather than a
   second one that drifts. It is never registered in SECTIONS, never rendered as
   a tile, and never becomes `activeTool` — `grant` drops it, which is what
   lands somebody on the dashboard instead of in a screen.

   ⚠️⚠️ IT MUST NOT GO THROUGH `canUseTool`, AND THAT IS NOT A SHORTCUT. That
   function short-circuits on `onlyFor(person)` and answers `only.has(tool.id)`
   — so for anybody with a narrowed view (Nick's reduced Hub is the live
   example) an unregistered id answers FALSE, and the one person most likely to
   be confused by the old flow could not sign in at all. Signing in is not a
   tool grant; it is the thing that HAPPENS BEFORE one. */
const SIGN_IN_TOOL = { id: "__signin", name: "Sign in", tier: 1, color: INK };
const isSignIn = (t) => !!t && t.id === SIGN_IN_TOOL.id;

// ── Daily-checklist helpers ──────────────────────────────────────
const pad2 = (v) => String(v).padStart(2, "0");
const isoOfD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const prevBizDay = () => {
  const d = new Date(); d.setDate(d.getDate() - 1);
  while (d.getDay() === 0) d.setDate(d.getDate() - 1);
  return isoOfD(d);
};
const shiftYm = (ym, delta) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};

// ── Tile ──────────────────────────────────────────────────────────
function Tile({ tool, color, locked, badge, onClick, pinMode, isPinned, onTogglePin, inputStatus }) {
  return (
    <button
      onClick={pinMode && onTogglePin ? (e) => { e.stopPropagation(); onTogglePin(tool.id); } : onClick}
      style={{
        /* The tile face carries a breath of the tool's own colour, graded from
           the lit corner — see cardSurface. It was a flat 4% tint, which under a
           shadow still reads flat. */
        /* 🐛 THE START-HERE TILES CAME OUT DIFFERENT WIDTHS (Matt, Aug 4 2026).
           The grid gives every cell an equal column, but this is a <button>, and
           a button does not stretch to fill its cell — it sizes to its own text.
           So a tile with a long line was wide and a short one was narrow, in a
           grid that was doing its job perfectly. `height: 100%` was already here
           for the same reason on the vertical axis; the horizontal half was
           simply never added. */
        width: "100%",
        textAlign: "left", background: cardSurface(color), cursor: "pointer",
        border: "1px solid #E5E7EB",
        /* ★ TOP AND LEFT, in the tool's own colour (Matt, Aug 4 2026: "I love
           the gradient details on the side if the tools… still want the same on
           top for the 3d view"). The left edge has always been here; the top is
           what makes the corner read as lit rather than as a stripe down one
           side. Same two edges CARD_3D's inset highlights run along, so the
           colour and the light agree instead of fighting. */
        ...accentEdge(color, 3),
        borderRadius: 12, padding: "9px 13px",
        opacity: locked ? 0.62 : 1,
        // height 100% makes every tile fill its grid row, so a card whose
        // description happens to be short doesn't sit shorter than its neighbours.
        height: "100%",
        display: "flex", alignItems: "center", gap: 10,
        boxShadow: CARD_3D,
      }}
    >
      <span
        style={{
          width: 30, height: 30, flexShrink: 0,
          borderRadius: 9, background: `${color}14`,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Icon id={tool.id} color={color} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: INK, lineHeight: 1.25 }}>{tool.name}</div>
        {/* SLIMMER — Jul 26. Descriptions are clamped to ONE line and reserve
            exactly one, which is what halves the card height. The reservation
            still matters: without it a tile with no description sits shorter
            than its neighbours and the grid goes ragged again. Was 2 lines /
            2.8em. The clamp means a long description truncates rather than
            wrapping, so keep tool.desc short — the ones that would clip are
            already trimmed. */}
        {/* ★ ONE LINE, TWO JOBS. When this tool needs something it says so;
            otherwise it describes itself. Matt, Jul 29 2026: "group input health
            items with each tool or area". Inputs and tools were two mental
            models for one store — a register row said food invoices were
            missing and you had to know Financials is where they live.
            ⚠️ THE SAME ROW, NOT AN EXTRA ONE. A tile with something to say is
            exactly the height of one without, so the grid cannot shuffle at the
            moment the store falls behind — which is when it most needs to be
            easy to read. The reserved min-height is what has always kept these
            cards level and still does. */}
        <div style={{
          fontSize: (inputStatus && !locked) ? 11.5 : 12,
          fontWeight: (inputStatus && !locked) ? 800 : 400,
          color: (inputStatus && !locked)
            ? (inputStatus.tone === "offgoal" ? RED : "#B45309")
            : "#6B7280",
          marginTop: 1, lineHeight: 1.35,
          display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 1,
          overflow: "hidden", minHeight: "1.35em",
        }}>{(inputStatus && !locked) ? inputStatus.text : tool.desc}</div>
        {/* ★ WHAT THIS TOOL NEEDS, ON THE TOOL (Matt, Jul 29 2026: "group input
            health items with each tool or area"). Inputs and tools were two
            mental models for one store — a register row said food invoices were
            missing and you had to know Financials is where they live. The tile
            now says it where you are already looking.
            ⚠️ REPLACES THE DESCRIPTION LINE rather than adding a third, so a
            tile with something to say is exactly the same height as one
            without. Growing the card would push the grid around every time the
            store fell behind, which is the moment it should be easiest to read. */}

      </div>
      {/* ⏳ COMING SOON, AND IT IS NOT A LOCK. A padlock says "your rank is too
          low" and sends somebody to the PIN card to try a PIN that cannot work.
          This says "the store does not have it yet", which no PIN changes, so it
          gets its own badge and a clock rather than a padlock.

          ⚠️⚠️ BROUGHT HOME FROM THE VILLAGE, Aug 13 2026, AND THAT DIRECTION IS
          THE POINT. The Village needed it first (Matt: "rn scheduling is only
          for gate city. it can say coming soon"), built it there, and it never
          came back — so Guilford, cloned from HERE, would have started without
          it and the next store after that too. A clone is a snapshot of Gate
          City; anything left only in a clone is lost to every store that
          follows. Same shape as the `/appleTouchIcon.png` 404 the same night,
          where the copy could install to a desktop and the original could not.

          ⚠️ GATE CITY MARKS NOTHING `soon` AND SHOULD NOT. It is the origin
          store and has every tool. This is here so a CLONE inherits a working
          mechanism instead of re-inventing one. A `soon` tile must still open
          onto a real page — a Coming soon card that opens onto nothing is the
          bug TeamResources.jsx documents at length.

          ⚠️ CHECKED BEFORE `locked` so the two can never both render. */}
      {tool.soon ? (
        <span
          style={{
            display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
            fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em",
            color, background: `${color}12`,
            borderRadius: 999, padding: "4px 9px", whiteSpace: "nowrap",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          SOON
        </span>
      ) : locked && (
        <span
          style={{
            display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
            fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em",
            color, background: `${color}12`,
            borderRadius: 999, padding: "4px 9px", whiteSpace: "nowrap",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          {TIER_NAMES[tool.tier]}
        </span>
      )}
      {pinMode && !locked && (
        <span aria-hidden style={{
          minWidth: 22, height: 22, borderRadius: 999, flexShrink: 0, marginRight: 6,
          background: isPinned ? "#14243D" : "#fff", color: isPinned ? "#fff" : "#5B6474",
          border: "1px solid #E4E3DD", fontSize: 12, fontWeight: 900,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>{isPinned ? "★" : "☆"}</span>
      )}
      {!locked && badge > 0 && (
        <span
          style={{
            minWidth: 22, height: 22, borderRadius: 999, background: RED, color: "#fff", flexShrink: 0,
            fontSize: 11.5, fontWeight: 900, display: "inline-flex",
            alignItems: "center", justifyContent: "center", padding: "0 7px",
          }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}


// ── Notifications toggle ──────────────────────────────────────────
// Web push to a team member's phone. Works only in an INSTALLED PWA on iOS
// (Apple requires the home-screen install before it will grant permission),
// and anywhere on Android/desktop. The bell hides itself entirely on browsers
// that can't do push, so nobody is offered something that won't work.
const PUSH_LAST_KEY = "gcfcr-push-endpoint";

function urlB64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const pushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

// iOS only allows notification permission from a home-screen install.
const isStandalone = () =>
  (typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      window.navigator.standalone === true)) || false;

const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

function PushToggle({ user, tier }) {
  const [state, setState] = useState("checking"); // checking·off·on·denied·needs-install·unsupported
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      if (!pushSupported()) { if (live) setState("unsupported"); return; }
      if (isIOS() && !isStandalone()) { if (live) setState("needs-install"); return; }
      if (Notification.permission === "denied") { if (live) setState("denied"); return; }
      try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        /* ⚠️ ONE RE-CHECK BEFORE PAINTING "OFF". `serviceWorker.ready` resolving
           is not the same as the push subscription being restored — on an iOS
           cold start after a force-quit this transiently returns null, the bell
           reads "alerts off", and the person re-enables. That is not just
           cosmetic: every re-toggle MINTS A NEW SUBSCRIPTION, which is a large
           part of why the store accumulated duplicate and dead records.
           Confirmed intermittent (Jul 27), which is what a race looks like. */
        if (!sub) {
          await new Promise((r) => setTimeout(r, 700));
          try { sub = await reg.pushManager.getSubscription(); } catch {}
        }
        if (live) setState(sub ? "on" : "off");
      } catch { if (live) setState("off"); }
    })();
    return () => { live = false; };
  }, []);

  // Keep the stored subscription pointed at the CURRENT person. Without this a
  // shared iPad would keep delivering a previous user's targeted alerts.
  useEffect(() => {
    if (state !== "on" || !user) return;
    let live = true;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub || !live) return;
        await fetch("/api/push-subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            uid: user?.id ?? null,
            name: user?.name ?? null,
            // ROLE lets the worker route role-owned register rows (sales, wages,
            // evals, PTO) to the right phone. The subscription record is the
            // only per-person identity the worker can see — it has no roster —
            // so without this those rows can never be delivered. Re-POSTed on
            // every [state, user, tier] change, so it back-fills itself as
            // people sign in; no migration needed.
            role: user?.role ?? null,
            tier,
          }),
        });
      } catch { /* non-fatal */ }
    })();
    return () => { live = false; };
  }, [state, user, tier]);

  const enable = async () => {
    setBusy(true); setNote("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        setBusy(false);
        return;
      }
      const keyRes = await fetch("/api/push-key").then((r) => r.json());
      if (!keyRes.ok || !keyRes.key) throw new Error("Notifications aren't configured on the server yet.");

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(keyRes.key),
        });
      }
      const res = await fetch("/api/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          uid: user?.id ?? null,
          name: user?.name ?? null,
          role: user?.role ?? null,   // see the note on the refresh path above
          tier,
        }),
      }).then((r) => r.json());
      if (!res.ok) throw new Error(res.error || "Could not save your device.");

      try { localStorage.setItem(PUSH_LAST_KEY, sub.endpoint); } catch {}
      setState("on");
      // Send one immediately so they SEE it work rather than taking our word.
      fetch("/api/push-test", {
        method: "POST",
        // Token required since Aug 2 — see the lock on this route in worker.js.
        headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
    } catch (e) {
      setNote(String(e.message || e));
    }
    setBusy(false);
  };

  const disable = async () => {
    setBusy(true); setNote("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push-unsubscribe", {
          method: "POST",
          // Token required since Aug 2 — see the lock on this route in worker.js.
          headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setNote(String(e.message || e));
    }
    setBusy(false);
  };

  if (state === "unsupported" || state === "checking") return null;

  const label =
    state === "on" ? "Alerts on"
      : state === "denied" ? "Alerts blocked"
        : state === "needs-install" ? "Add to Home Screen"
          : "Turn on alerts";

  const onClick = () => {
    if (busy) return;
    if (state === "on") return disable();
    if (state === "denied") {
      setNote("Notifications are blocked for this app in your device Settings. Turn them back on there, then tap again.");
      return;
    }
    if (state === "needs-install") {
      setNote("On iPhone, notifications only work once the Hub is installed: Share → Add to Home Screen, then open it from that icon.");
      return;
    }
    return enable();
  };

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        onClick={onClick}
        disabled={busy}
        title={label}
        style={{
          background: state === "on" ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.12)",
          border: "1px solid rgba(255,255,255,0.25)",
          color: "#fff", borderRadius: 999, padding: "6px 12px",
          fontSize: 12, fontWeight: 700, cursor: busy ? "default" : "pointer",
          whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6,
          opacity: busy ? 0.6 : 1,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          {state !== "on" && <line x1="3" y1="3" x2="21" y2="21" />}
        </svg>
        {label}
      </button>
      {note && (
        <div
          onClick={() => setNote("")}
          style={{
            /* ★ JUL 26 — position:FIXED AND CENTRED, NOT absolute/right:0.
               The bell sits near the LEFT of the header, so `right: 0` anchored
               a 260px panel to the button's right edge and it extended LEFT,
               off the viewport, on a phone. Matt saw only the tail of the
               sentence — "…match the expected" — overlapping the header and the
               All tools button. Same failure as Jul 24; the fix either
               regressed or never reached this file.
               Fixed + centred + viewport-capped width cannot clip, wherever
               the bell ends up. */
            position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)",
            zIndex: 3000, width: "min(340px, calc(100vw - 24px))", maxWidth: "calc(100vw - 24px)",
            background: "#fff", color: "#111827", borderRadius: 10,
            border: "1px solid #E5E7EB", boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            padding: "10px 12px", fontSize: 12, lineHeight: 1.45, cursor: "pointer",
          }}
        >
          {note}
          <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: "#6B7280" }}>Tap to dismiss</div>
        </div>
      )}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────
export default function App() {
  /* 🐛 A SAVED TIER WITH NO SAVED PERSON IS NOT A SESSION (Aug 9 2026).
     These two keys are written by `grant`, one after the other, and nothing
     ever checked that they agreed. When `gcfcr-access-tier` survived and
     `gcfcr-access-user` did not, `signedIn` (which is `tier > 0`) said yes and
     `canUseTool` opened every tile on `userTier >= tool.tier` alone — while
     every gate that asks WHO you are quietly failed. On a real iPad that meant
     Cash Audit crashing outright on `user.role`, and EOS and Leadership Dev
     both telling MATT the tile was limited to Matt and Bri.
     ⚠️ THE STALE-CACHE CLASS CLAUDE.md WARNS ABOUT, in its worst shape: not a
     wrong value, but half a session. Identity was already re-resolved at mount,
     yet that effect returns early on `if (!user || !user.id)` — so the one
     state that needed repairing was the exact state it skipped.
     ⇒ No identity, no tier. They sign in once and both keys are rewritten
     together. Deliberately NOT clearing the key here: an initialiser should not
     have side effects, and returning 0 is enough for every reader. */
  const [tier, setTier] = useState(() => {
    const who = readStoredUser();
    return who && who.id ? (Number(localStorage.getItem(TIER_KEY)) || 0) : 0;
  });
  const [user, setUser] = useState(readStoredUser);
  const [activeTool, setActiveTool] = useState(null);
  /* ★ "Saved" used to be shown even when the save went through with no valid
     session. The record really does store, so this is a NOTE, not an error —
     it tells the person their sign-in lapsed so the work lands under their name
     next time. Fired from store.js on `authed:false`.
     ⚠️ Deliberately NOT the HR `hub:session-expired` event, which means "no HR
     data can load" and paints HR Console red. This is the quiet version. */
  const [saveSignedOut, setSaveSignedOut] = useState(false);
  useEffect(() => {
    const onAnon = () => setSaveSignedOut(true);
    window.addEventListener("hub:save-signed-out", onAnon);
    return () => window.removeEventListener("hub:save-signed-out", onAnon);
  }, []);
  // Optional props payload for the active tool — set by openTool(tool, props)
  // when something deep-links into a tool (see openTool). Null for a normal tap.
  const [toolProps, setToolProps] = useState(null);
  // Dashboard daypart breakdown, collapsed by default — see the Labor card.
  const [dashDayparts, setDashDayparts] = useState(false);
  const [pinTool, setPinTool] = useState(null); // tool awaiting PIN
  /* ★ BUMPED WHEN A STORE'S SAVED SETTINGS ARRIVE AFTER SIGN-IN, and read by
     nothing. Its only job is to make React render again: `applyStoreOverrides`
     merges into module state that React cannot see, so without this the config
     would be correct and the screen would still be showing the defaults. See
     `grant` below and storeConfigLoad.js. */
  const [cfgTick, setCfgTick] = useState(0);
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false); // "keep me signed in on this device" — OFF by default so shared iPads stay at 12h
  /* ── THE NAME STEP — SHIPPED DORMANT, ON PURPOSE ──────────────────────────
     One sign-in request tests one account instead of all ~106. To do that the
     server has to know WHO is being claimed, so when it does not recognise the
     device it answers `who` and this card asks for a name first.
     ⚠️ NOTHING BELOW RUNS TODAY. The worker only answers `who` after the later
     stage that turns the cold search off. Shipping the screen FIRST is the
     entire point of the ordering: the flip is then one line in worker.js, and
     never a store-wide sign-in outage, because the client that knows how to
     answer is already on every phone and every iPad.
     ⚠️ Declared here, above every hook, so nothing can read them in their dead
     zone (design rule 7). They are read by the PIN card's JSX far below. */
  /* ═══ FIRST TIME HERE — CLAIM YOUR ACCOUNT ═══════════════════════
     Somebody who has never had a PIN proves who they are with the last 4
     of their own phone, then picks their PIN. See claimCode.js for why
     the last 4 is a one-time code and never the PIN itself.
     ⚠️ THE CODE IS CHECKED ON THE SERVER, ALWAYS. Nothing about anybody's
     phone is sent to the browser — /api/pin-claim reads the hashed record
     with the service key and answers yes or no. If this ever starts
     comparing in the browser, the whole point is gone. */
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimId, setClaimId] = useState("");        // roster id they picked
  const [claimQuery, setClaimQuery] = useState("");
  const [claimCode, setClaimCode] = useState("");
  const [claimPin, setClaimPin] = useState("");
  const [claimErr, setClaimErr] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimRoster, setClaimRoster] = useState([]);

  /* Opening it needs the roster, and only the roster — the same list the
     name step already uses. No phone numbers, no codes. */
  const openClaim = async () => {
    setClaimOpen(true); setClaimErr(""); setClaimId(""); setClaimQuery("");
    setClaimCode(""); setClaimPin("");
    if (claimRoster.length) return;
    try {
      const r = await loadHRTeamResult();
      if (r.ok) setClaimRoster(r.team);
      else setClaimErr("Couldn't load the team list. Check your connection.");
    } catch { setClaimErr("Couldn't load the team list. Check your connection."); }
  };

  const submitClaim = async () => {
    if (claimBusy) return;
    if (!claimId) { setClaimErr("Find your name first."); return; }
    const code = claimCode.replace(/\D/g, "");
    if (code.length !== 4) { setClaimErr("Enter the last 4 numbers of your phone."); return; }
    if (!/^\d{4,6}$/.test(claimPin)) { setClaimErr("Your new PIN must be 4 to 6 numbers."); return; }
    setClaimBusy(true);
    try {
      const r = await fetch("/api/pin-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id: String(claimId), code, pin: claimPin }),
      }).then((x) => x.json());
      if (!r || !r.ok) {
        /* ⚠️ EVERY REFUSAL GETS A SENTENCE SOMEBODY CAN ACT ON. "no-match"
           deliberately does NOT say whether the name or the number was
           wrong — that distinction is only useful to somebody guessing. */
        const m = {
          locked: `Too many tries. Wait about ${(r && r.retryAfterMin) || 15} minutes.`,
          already: "You already have a PIN. Sign in with it, or ask a director to reset it.",
          taken: "Somebody already uses that PIN. Pick a different one.",
          "no-match": "That did not match. Check the last 4 of your phone, or ask a director.",
        };
        setClaimErr(m[r && r.error] || "That did not work. Try again, or ask a director.");
        setClaimBusy(false);
        return;
      }
      try { localStorage.setItem(HUB_TOKEN_KEY, r.token); } catch {}
      /* Straight into the normal sign-in path with the PIN they just chose,
         so identity, role, tier and the tool gate all resolve exactly where
         they always do rather than in a second copy here. */
      setClaimOpen(false);
      setPin(claimPin);
      setPinNameId(String(claimId));
      setClaimBusy(false);
      setTimeout(() => submitPin(), 0);
    } catch {
      setClaimErr("That did not work. Check your connection and try again.");
      setClaimBusy(false);
    }
  };

  /* ═══ STANDING UP A BRAND NEW STORE ══════════════════════════════
     The very first person into a clone. See NEW-STORE-SETUP.md.
     ⚠️ DELIBERATELY ONE LEVEL DOWN, inside the "first time here" sheet
     rather than on the sign-in card. At Gate City this route is dead
     twice over (no SETUP_KEY secret, ~106 PINs on file), so a visible
     link here would be permanent noise for 106 people who can never use
     it. Somebody standing up a clone is reading the setup doc, which
     says exactly where to find this.
     ⚠️ THE ROLES OFFERED ARE RANK 7 AND 8 ONLY, and they are EQUAL. Matt:
     "make the executive level the same priority to login as operator.
     some if not most operators will not want that responsibility." No
     ordering, no "Operator first". The server enforces the same floor. */
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupKey, setSetupKey] = useState("");
  const [setupName, setSetupName] = useState("");
  const [setupRole, setSetupRole] = useState("Executive Director");
  const [setupPin, setSetupPin] = useState("");
  const [setupErr, setSetupErr] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);

  const submitSetup = async () => {
    if (setupBusy) return;
    if (!setupKey.trim()) { setSetupErr("Paste the setup key."); return; }
    if (setupName.trim().split(/\s+/).length < 2) { setSetupErr("Enter your first and last name."); return; }
    if (!/^\d{4,6}$/.test(setupPin)) { setSetupErr("Your PIN must be 4 to 6 numbers."); return; }
    setSetupBusy(true);
    try {
      const r = await fetch("/api/store-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ key: setupKey.trim(), name: setupName.trim(), role: setupRole, pin: setupPin }),
      }).then((x) => x.json());
      if (!r || !r.ok) {
        const m = {
          disabled: "Setup is not switched on for this store. Add the SETUP_KEY secret in Cloudflare first.",
          "bad-key": "That setup key is not right.",
          "already-set-up": "This store is already set up. Sign in with your PIN, or use First time here.",
          "bad-name": "Enter your first and last name.",
          "bad-role": "Pick one of the roles listed.",
          "bad-pin": "Your PIN must be 4 to 6 numbers.",
          locked: `Too many tries. Wait about ${(r && r.retryAfterMin) || 15} minutes.`,
        };
        setSetupErr(m[r && r.error] || "That did not work. Check the key and try again.");
        setSetupBusy(false);
        return;
      }
      try { localStorage.setItem(HUB_TOKEN_KEY, r.token); } catch {}
      /* Hand back to the normal sign-in path with the PIN they just chose, so
         identity, role and the tool gate resolve in one place as always. */
      setSetupOpen(false); setClaimOpen(false);
      setPin(setupPin);
      setPinNameId(String(r.id));
      setSetupBusy(false);
      setTimeout(() => submitPin(), 0);
    } catch {
      setSetupErr("That did not work. Check your connection and try again.");
      setSetupBusy(false);
    }
  };

  const [needName, setNeedName] = useState(false);    // server does not know this device yet
  const [pinNameId, setPinNameId] = useState("");     // roster id the person tapped
  const [nameChoices, setNameChoices] = useState([]); // roster the SAME sign-in call already fetched — no second trip
  const [nameQuery, setNameQuery] = useState("");     // what they typed into the search box
  const [busy, setBusy] = useState(false);
  const [lockedOpen, setLockedOpen] = useState(false);
  const [openSection, setOpenSection] = useState(null); // null = 3-tile landing · label = drilled into a section
  /* ═══════════════════════════════════════════════════════════════
     WRITE-UP ACKNOWLEDGEMENT GATE
     Matt, Jul 24: Nation locks a team member out until they've reviewed
     pending corrective action. The Hub filed it and emailed them, but a
     leader had no way to know whether it was ever actually read.

     ★ SCOPE, SETTLED AND NOT TO BE RELITIGATED: this blocks the DASHBOARD,
     NOT THE DAY. A hard lock would mean somebody mid-shift cannot reach the
     schedule or their checklists because of a pending write-up — that
     punishes the restaurant to enforce an HR step. So there is a deliberate
     "I'm on shift" escape. It is session-only state, never persisted, so the
     gate returns on the next launch and keeps returning until they sign.
     Nagging is the point here; locking someone out of their job is not.

     ★ WHAT TRIGGERS IT: entries in `gcfcr-hr-files` carrying `pendingSig`,
     which HRConsole sets when a leader files documentation WITHOUT the team
     member's signature. That flag already exists and already means exactly
     "this person has not acknowledged this" — nothing new is invented, and
     `adjust` entries (point adjustments) never carry it, so they can't gate
     anybody. General documentation is included ONLY when a signature was
     asked for, which is the honest reading of "pending acknowledgement".

     ⚠️ HOOKS LIVE HERE, WITH THE OTHERS, ABOVE THE SINGLE RETURN — see the
     warning above about the Jul 23 outage. */
  const [ackDocs, setAckDocs] = useState([]);
  const [ackDeferred, setAckDeferred] = useState(false);   // session-only, deliberately not persisted
  const [ackErr, setAckErr] = useState("");                // save failure shown inside the gate
  const [ackSig, setAckSig] = useState("");
  const [ackBusy, setAckBusy] = useState(false);
  useEffect(() => { let live = true; (async () => {
    if (!user || user.id == null) { if (live) { setAckDocs([]); setAckDeferred(false); } return; }
    try {
      const files = (await kvGet("gcfcr-hr-files")) || {};
      const mine = Array.isArray(files[user.id]) ? files[user.id] : [];
      const open = mine.filter((f) => f && f.pendingSig && !f.removed);
      if (live) setAckDocs(open);
    } catch { if (live) setAckDocs([]); }
  })(); return () => { live = false; }; }, [user]);

  /* ═══════════════════════════════════════════════════════════════
     REPLACE A PIN SOMEBODY ELSE CHOSE
     Matt, Aug 10 2026: "yes force the change."

     ★ WHY: a PIN is what puts a person's name on their work, so a PIN a
     second person knows is a signature a second person can write. When a
     director sets somebody's PIN — a reset, or a leader who gets no claim
     code — that director knows it until it is replaced.

     ⚠️ IT SNOOZES RATHER THAN LOCKS, and that is a decision made twice
     today at some cost. The training gate shipped this morning with no
     working escape and stranded Matt behind a modal on a live floor. The
     same shape is right here: it blocks the dashboard, never an open
     tool, and it comes back until the PIN is actually replaced. A person
     opening the Hub mid-rush to check the board must not be stuck.
     ⚠️ SESSION-ONLY DEFER, deliberately, unlike training's four hours.
     This is a security step and it takes ten seconds, so it returns on
     the next launch rather than tomorrow.
     ⚠️ HOOKS LIVE HERE, ABOVE THE SINGLE RETURN — Jul 23 outage note. */
  const [mustChange, setMustChange] = useState(false);
  const [mcDeferred, setMcDeferred] = useState(false);
  const [mcPin, setMcPin] = useState("");
  const [mcPin2, setMcPin2] = useState("");
  const [mcErr, setMcErr] = useState("");
  const [mcBusy, setMcBusy] = useState(false);

  const mcSave = async () => {
    if (mcBusy || !user || user.id == null) return;
    const a = mcPin.trim();
    if (!/^\d{4,6}$/.test(a)) { setMcErr("Use 4 to 6 numbers."); return; }
    if (a !== mcPin2.trim()) { setMcErr("The two PINs do not match."); return; }
    setMcBusy(true);
    try {
      const r = await fetch("/api/pin-set", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-token": localStorage.getItem(HUB_TOKEN_KEY) || "",
        },
        body: JSON.stringify({ id: String(user.id), pin: a }),
      }).then((x) => x.json());
      /* ⚠️ THE SERVER'S ANSWER IS READ, not assumed. `taken` is a real
         outcome — two people must never share a PIN — and treating a
         refusal as success would clear this gate while the old PIN, the
         one somebody else knows, stayed live. */
      if (!r || !r.ok) {
        setMcErr(r && r.error === "taken"
          ? "Somebody already uses that PIN. Pick a different one."
          : "That did not save. Check the wifi and try once more.");
        setMcBusy(false);
        return;
      }
      setMcErr(""); setMcPin(""); setMcPin2("");
      setMustChange(false);
    } catch {
      setMcErr("That did not save. Check the wifi and try once more.");
    }
    setMcBusy(false);
  };

  /* ═══════════════════════════════════════════════════════════════
     HUB TRAINING GATE — watch your deck once
     Matt, Aug 10 2026: "make it a requirement or to do first, everyone's
     first login."

     ★ SCOPE, TAKEN FROM THE PRECEDENT DIRECTLY ABOVE AND NOT RE-ARGUED:
     this blocks the DASHBOARD, not the day. The write-up gate settled
     this exact question ("a hard lock would mean somebody mid-shift
     cannot reach the schedule because of a pending HR step"), and a
     training video is a weaker reason to lock someone out than a
     write-up is. So it has the same "I'm on shift" escape, session-only,
     which means it comes back every launch until they watch it. Nagging
     is the point; locking somebody out of their job is not.

     ★ WHICH DECK: the HIGHEST one they can open, from hubTraining.js.
     Not the lowest — every deck says at its start that it assumes the
     ones below it, and making a Director sit through Team Member
     training is the fastest way to make this resented.

     ⚠️ THE WRITE-UP GATE WINS. `trainOpen` requires `!ackOpen`, so
     nobody is ever shown two gates stacked, and the one with real HR
     consequences is the one they answer first.

     ⚠️ FAILS OPEN, DELIBERATELY. `trainDone` starts null meaning "not
     known yet" and the gate only opens on an explicit `false`. A failed
     read on store wifi must not gate 106 people out of their dashboard
     over a training video. Same reasoning as the terminated-id check in
     the worker.

     ⚠️ HOOKS LIVE HERE, WITH THE OTHERS, ABOVE THE SINGLE RETURN — see
     the warning above about the Jul 23 outage. */
  const [trainDone, setTrainDone] = useState(null);   // null = unknown, never gate on it
  /* Snoozed-until, per person, so a shared iPad does not carry one leader's
     snooze over to the next person who signs in. */
  const trainSnoozeKey = user && user.id != null ? `gcfcr-train-snooze-${user.id}` : "";
  const [trainDeferred, setTrainDeferred] = useState(false);
  useEffect(() => {
    if (!trainSnoozeKey) { setTrainDeferred(false); return; }
    try {
      const until = Number(localStorage.getItem(trainSnoozeKey) || 0);
      setTrainDeferred(until > Date.now());
    } catch { setTrainDeferred(false); }
  }, [trainSnoozeKey]);
  const snoozeTraining = () => {
    setTrainDeferred(true);
    try {
      if (trainSnoozeKey) localStorage.setItem(trainSnoozeKey, String(Date.now() + TRAIN_SNOOZE_MS));
    } catch (e) { /* private mode: it still holds for this session */ }
  };
  const [trainErr, setTrainErr] = useState("");
  const [trainBusy, setTrainBusy] = useState(false);
  /* ⚠️ PERSISTED IN localStorage, AND IT WAS sessionStorage UNTIL IT FAILED
     ON A LIVE STORE.
     🐛 Round one: plain useState. A blocked popup or an iPad reusing the tab
     navigates the Hub away, React remounts, the flag resets. Moved to
     sessionStorage.
     🐛🐛 Round two, Aug 10 2026, reported by Matt with a screenshot mid-service:
     "I watched and it won't go away." The Hub is on his home screen, so it runs
     STANDALONE. Opening the deck there hands off to Safari rather than opening a
     tab in the same context, and coming back the standalone app had been
     reloaded with sessionStorage gone. He watched the whole thing and the button
     that clears the gate was still grey.
     ⇒ localStorage, which survives that trip, AND the confirm button no longer
     depends on this at all (see the button). This flag is now only good for the
     "Open it again" label. Cleared on success so it does not outlive its use.
     ⚠️ Keyed by person so a second leader on a shared iPad does not inherit the
     first one's progress. */
  const trainOpenKey = user && user.id != null ? `gcfcr-train-opened-${user.id}` : "";
  const [trainOpened, setTrainOpened] = useState(false);
  useEffect(() => {
    if (!trainOpenKey) { setTrainOpened(false); return; }
    /* ⚠️ localStorage, NOT sessionStorage. sessionStorage did not survive the
       standalone-app round trip out to Safari and back, which is the bug above.
       It is cleared on success anyway, so it does not outlive its purpose. */
    try { setTrainOpened(localStorage.getItem(trainOpenKey) === "1"); }
    catch { setTrainOpened(false); }
  }, [trainOpenKey]);
  const markTrainOpened = () => {
    setTrainOpened(true);
    try { if (trainOpenKey) localStorage.setItem(trainOpenKey, "1"); } catch (e) { /* private mode */ }
  };
  useEffect(() => { let live = true; (async () => {
    if (!user || user.id == null) { if (live) { setTrainDone(null); setTrainOpened(false); } return; }
    try {
      const rec = await kvGet(trainingKey(user.id));
      if (live) setTrainDone(hasWatched(rec));
    } catch { if (live) setTrainDone(null); }   // unknown, not "not done"
  })(); return () => { live = false; }; }, [user]);

  /* Marking it watched. ⚠️ THE WRITE'S BOOLEAN IS CHECKED. kvSet reports a
     refusal by RETURNING FALSE and never throwing, so a catch cannot see it —
     the write-up gate shipped that exact bug once and someone walked away
     believing they had signed. If the save does not land, the gate stays up
     and says so. */
  const trainMarkWatched = async () => {
    if (trainBusy || !user || user.id == null) return;
    const deck = requiredDeck(hrRankOfTitle(effectiveRole(user.id, user.role)), tier);
    setTrainBusy(true);
    try {
      const ok = await kvSet(
        trainingKey(user.id),
        trainingRecord({ deckKey: deck ? deck.key : "", name: user.name, role: user.role }),
      );
      if (!ok) {
        setTrainErr("That did not save. Check the wifi and press it once more.");
        setTrainBusy(false);
        return;
      }
      setTrainErr("");
      setTrainDone(true);
      try { if (trainOpenKey) localStorage.removeItem(trainOpenKey); } catch (e) { /* private mode */ }
      /* ★ THE HUB AWARDS THE STARS ITSELF, HERE, RATHER THAN ON A CRON.
         Matt, Aug 14 2026: "i want stars to be autoassigned by the hub."
         ⚠️ THE SERVER DECIDES EVERYTHING. This sends no id, no deck and no
         amount — /api/star-auto reads all of it from this person's own token,
         because the ledger is rank 6 to write and a route that trusted the
         browser would be a way around that gate for anybody with curl.
         ⚠️ AFTER THE SAVE IS CONFIRMED, NEVER BEFORE. The `!ok` guard above has
         already returned; a star for training that did not save is worse than
         no star.
         ⚠️ AND IT NEVER BLOCKS OR FAILS THIS FUNCTION. The training record is
         the thing that matters and it is already stored. A missed star is worth
         far less than a screen telling somebody their training did not save, so
         the call is fire-and-forget and its errors are swallowed on purpose.
         Safe to call twice: awards carry an id, so a rerun writes nothing. */
      fetch("/api/star-auto", { method: "POST", headers: { "x-hub-token": hubToken() } })
        .catch(() => { /* the training record stands */ });
    } catch {
      setTrainErr("That did not save. Check the wifi and press it once more.");
    }
    setTrainBusy(false);
  };

  /* Signing writes the member's own signature onto every pending entry and
     clears the flag, appending to each entry's history so the audit trail
     shows WHO acknowledged and WHEN — the same stamp shape HRConsole uses.
     ⚠️ RE-READS immediately before writing. Another session or a leader could
     have filed something in the meantime, and a blind overwrite of the whole
     `gcfcr-hr-files` map would delete it. */
  const ackSignAll = async () => {
    const sig = ackSig.trim();
    if (!sig || ackBusy || !user || user.id == null) return;
    setAckBusy(true);
    try {
      /* ⚠️ kvGetResult, and the write's boolean is CHECKED. The old kvGet
         turned a FAILED re-read (routine on store wifi, or an expired HR
         session token) into {}, which made `mine` [] — and the member-row
         write below then replaced the signer's WHOLE document row with [].
         IDs, doctor's notes, write-ups, prior signatures, gone for that
         person. And kvSet reports refusal by RETURNING FALSE, never throwing,
         so the catch could not fire and a failed save still cleared the gate:
         the person walked away believing they signed while pendingSig stayed
         true for HR. Now: failed read = no write at all; failed write = the
         gate stays up and says so. */
      const r = await kvGetResult("gcfcr-hr-files");
      if (!r.ok) {
        setAckErr("That did not go through — nothing was signed. Check the wifi and press it once more.");
        setAckBusy(false);
        return;
      }
      const files = (r.value && typeof r.value === "object") ? r.value : {};
      const mine = Array.isArray(files[user.id]) ? files[user.id] : [];
      const at = new Date().toISOString();
      const next = mine.map((f) => (f && f.pendingSig && !f.removed)
        ? { ...f, sig, pendingSig: false,
            history: [...(Array.isArray(f.history) ? f.history : []),
                      { at, by: `${user.name} · acknowledged in Hub`, action: "acknowledged" }] }
        : f);
      /* 3rd arg = the ONE roster row this touches, so the worker merges that row
         into the stored map instead of replacing it (see the member-row branch
         in worker.js). The re-read above narrows the race to the gap between
         reading and writing; naming the member closes it, because the server
         never looks at the 105 rows we are not changing. Evelyn's documentation
         was lost to exactly this, from HRConsole's side of the same map. */
      const ok = await kvSet("gcfcr-hr-files", { ...files, [user.id]: next }, user.id);
      if (!ok) {
        setAckErr("That did not go through — nothing was signed. Check the wifi and press it once more.");
        setAckBusy(false);
        return;
      }
      setAckErr("");
      setAckDocs([]);
      setAckSig("");
    } catch {
      setAckErr("That did not go through — nothing was signed. Check the wifi and press it once more.");
    }
    setAckBusy(false);
  };
  /* ⚠️ THESE HOOKS MUST STAY ABOVE EVERY EARLY RETURN IN THIS COMPONENT.
     They were briefly declared further down, BELOW `if (activeTool) return (…)`.
     On the dashboard all hooks ran; the moment a tool was opened the component
     returned early and React saw fewer hooks than the render before — it threw,
     and EVERY tool rendered blank while the dashboard looked fine. */
  /* Matt, Jul 31: "When backing out from a tool can it bring you back to the
     same place on the Home Screen so you don't have to scroll to the bottom
     again." Same save/restore pattern PeakReachers uses for its sub-pages:
     openTool stamps the scroll, this restores it when activeTool clears, and
     a tool always opens at its own top. useLayoutEffect so the jump happens
     before paint — an after-paint scroll flashes the top of the page first. */
  const dashScrollY = useRef(0);
  /* 🐛 REPORTED A THIRD TIME (Matt, Aug 7 2026: "when you back out of a tool it
     still takes you to the top of the dashboard. really annoying"), and the
     first two fixes were both aimed at the wrong transition.

     ⚠️ THE TOOL PATH WAS ALREADY WORKING. Measured in the browser rather than
     read: scroll to 1600 → open Equipment Log → back → lands at 1640. What is
     broken is the SECTION path — scroll to 1500 → open "Daily Operations" →
     "← All tools" → lands at 0. Opening a section never touched activeTool, so
     nothing stamped and nothing restored, and the two earlier attempts kept
     hardening a restore that already fired.

     ⚠️ TWO REFS, NOT ONE, and this is the part one ref gets silently wrong.
     Going dashboard → section → tool → back → back, a single ref is overwritten
     by the tool open (which stamps the SECTION's scroll, usually 0) and the
     dashboard's real position is gone by the time you get back to it. So the
     dashboard's position and the section's position are stamped separately. */
  const sectionScrollY = useRef(0);
  /* ★ WHERE "BACK" GOES WHEN YOU ARRIVED FROM ANOTHER TOOL (Matt, Aug 12 2026:
     "Hitting back inside here takes you to the menu. Also make sure backing out
     of a tool doesn't take you to the top of the top home").
     The Manual lists every tool with its own Open button, so opening one from
     there REPLACES the Manual. Back then had nowhere to return to and fell all
     the way out to the dashboard — the two scroll refs above cannot help,
     because the surface being left was not the dashboard or a section.
     ⚠️ ONE STEP, NOT A STACK. Tool A → B → C returns to B, then to the surface
     B was opened from. A full history would let a loop (Manual → tool → Manual)
     trap somebody with no way out to the dashboard. */
  const fromTool = useRef(null);
  /* What we were looking at last render, so this effect can tell "opened
     something" (go to its top) from "came back" (restore). Without it, coming
     back from a tool INTO a section is indistinguishable from opening that
     section, and one of the two always gets the wrong behaviour. */
  const prevView = useRef({ tool: null, section: null });
  useLayoutEffect(() => {
    const prev = prevView.current;
    const nowTool = activeTool ? (activeTool.id || "open") : null;
    const nowSection = openSection || null;
    prevView.current = { tool: nowTool, section: nowSection };

    // Went deeper. A thing you just opened always starts at its own top.
    if ((nowTool && !prev.tool) || (nowSection && !prev.section)) {
      window.scrollTo(0, 0);
      return;
    }
    if (nowTool) return;                    // still inside a tool, nothing to do

    /* Came back. Restore the position of whichever surface we landed on — the
       section list if we are still in one, otherwise the dashboard. */
    const y = nowSection ? sectionScrollY.current : dashScrollY.current;
    if (!(y > 0)) return;
    /* 🐛 REPORTED TWICE, AND THE SECOND FIX WAS STILL A GUESS (Matt, Aug 6
       2026: "when I back out of a tool it still sends me to the top").
       The dashboard has just REMOUNTED and its cards are still fetching, so at
       this moment the page is SHORT and the browser clamps any jump to the
       little height that exists. Attempt one was a single scrollTo. Attempt two
       re-applied on every frame for two seconds — which only works if the page
       finishes growing inside two seconds, and this dashboard makes about
       twenty database reads before it reaches full height. On store wifi it
       does not, so the restore quietly gave up and left him at the top.
       ⇒ STOP GUESSING A DURATION AND WATCH FOR THE THING ITSELF. A
       ResizeObserver fires exactly when the page grows, so the scroll is
       re-applied on the event that was defeating it rather than on a timer
       racing it. It settles the moment the target is actually reachable.
       ⚠️ THREE WAYS OUT, because an observer that never disconnects is a leak
       and a restore that fights the user is worse than no restore:
         · the target is reached  · the user touches the screen  · 10s cap
       ⚠️ scrollingElement, not documentElement: iOS Safari reports the scroll
       height on one and not always the other, and getting this wrong makes
       "can we reach the target yet" answer no forever. */
    let done = false;
    let ro = null;
    const finish = () => {
      if (done) return;
      done = true;
      if (ro) ro.disconnect();
      clearTimeout(cap);
      window.removeEventListener("wheel", finish);
      window.removeEventListener("touchstart", finish);
    };
    /* ⚠️ THE ONLY REASON TO STOP EARLY IS HAVING ARRIVED. My first version of
       this also stopped when the page was too short to reach `y` — reasoning
       that the target was unreachable. That check fires on the FIRST call,
       because at that instant the dashboard is short: it is exactly the state
       this effect exists to survive, and it killed the restore before the page
       had loaded anything. Caught by simulating a page that grows over four
       seconds; it would not have shown up in any amount of reading.
       A page that genuinely never gets tall enough is handled by the 10s cap,
       and scrollTo clamps harmlessly in the meantime. */
    const apply = () => {
      if (done) return;
      window.scrollTo(0, y);
      if (Math.abs(window.scrollY - y) < 2) finish();
    };
    const cap = setTimeout(finish, 10000);
    window.addEventListener("wheel", finish, { passive: true, once: true });
    window.addEventListener("touchstart", finish, { passive: true, once: true });
    if (typeof ResizeObserver === "function") {
      ro = new ResizeObserver(apply);
      ro.observe(document.body);
    }
    apply();
    return finish;
    /* ⚠️ openSection BELONGS IN HERE. I wrote the whole two-ref fix above and
       left this array as [activeTool], so the effect never re-ran when a
       section opened or closed and the restore simply did not happen. It LOOKED
       fixed, because a section list is short and the browser clamps the old
       scroll to the top on its own — the exact symptom being fixed, produced by
       a different cause. Caught by patching window.scrollTo and seeing it never
       called, not by re-reading the code. */
  }, [activeTool, openSection]);
  /* Bri, Jul 23: leaders had no idea a recommendation had been requested.
     They're now DM'd, and this puts the count in front of them every time they
     open the Hub — a DM can be missed, a badge on the tile can't. */
  /* ── GOALS THIS AD STILL OWES ────────────────────────────────────────────
     Bri, Jul 30 2026: a due banner for ADs in the last five days of the month,
     "with an Alert trail similar to the applications that starts on Peak
     Reachers, then the Team Goals, and lands on Submissions (AD Only)."

     ★ COUNTED ONCE, HERE, EXACTLY LIKE pendingRecs BELOW. The trail is three
     screens deep; three screens each working out the answer for themselves is
     three chances to disagree about whether somebody owes a goal, and the one
     that disagrees is the one nobody notices. The rule itself lives in
     GoalSubmissions beside the window it depends on — this only carries the
     number.
     ⚠️ ZERO ON ANY FAILURE. A read that fails must not paint a red number on
     the home screen of every Assistant Director. */
  const [goalsDue, setGoalsDue] = useState(0);
  useEffect(() => { let live = true; (async () => {
    if (!user || !user.id) { if (live) setGoalsDue(0); return; }
    try {
      const [subs, dir] = await Promise.all([
        kvGet(GOAL_SUB_KEY).catch(() => null),
        kvGet("gc-team-directory-v1").catch(() => null),
      ]);
      const r = goalsOwed(subs, (dir && dir.teams) || [], user, new Date());
      if (live) setGoalsDue(r.owed);
    } catch { if (live) setGoalsDue(0); }
  })(); return () => { live = false; }; }, [user]);

/* ── "I JUST SIGNED SOMETHING" ─────────────────────────────────────────────
     🐛 Bri, Aug 21 2026 reported the red digit carried no wording. That was
     fixed. This is the half left behind, and it is the half a person feels:
     they sign the document, come back here, and the red number is still there
     until they reload the page.

     ⚠️⚠️ NOTHING IS BROKEN UNDERNEATH — the signature really is stored. Both
     counts below come from reads that only re-run when `user` or `tier`
     changes, and signing changes neither. So the screen is showing a true
     answer to a question it asked before the signature existed.

     ⛔ AND "IT DID NOT SAVE" IS THE OBVIOUS READING, not a stretch. Every
     signature in this area once failed for real, with a permission refusal
     wearing a network error's clothes. Somebody who lived through that and
     now watches the number sit still has no way to tell the two apart.

     ⇒ `signedTick.js` is the signal, published by whichever screen recorded
     the signature. It carries NO count — a number sent from the signing screen
     is a guess about the server's state, and a wrong red number is the bug.
     It says "ask again", and the answer still comes from the server.
     ⚠️ THE SUBSCRIBE IS NOT THE FIX. Putting `signedAt` in the dependency
     lists below is. A subscription that bumps a value nothing depends on is a
     no-op that reads like a repair, which is why the test asserts the lists
     and not the subscribe. */
  const [signedAt, setSignedAt] = useState(0);
  useEffect(() => onSigned((n) => setSignedAt(n)), []);

/* ── DOCUMENTS THIS PERSON HAS BEEN ASKED TO SIGN ────────────────────────
     Bri, Aug 17 2026 and again Aug 19: "I sent an SOP document to sign. Nobody
     can see it... I don't know where these are going right now."

     The document really was sent and the signing really did work. Nothing told
     the person it was waiting, so nobody went to look. This is what tells them.

     ⚠️⚠️ IT GOES THROUGH /api/my-docs AND CANNOT READ THE KEY DIRECTLY.
     `gcfcr-hr-docsends-v1` is on HR_PROTECTED, so the ~106 people who need this
     count are exactly the people who may not read it. The route answers only
     for the person holding the token and returns nobody else's row.
     ⚠️ ZERO ON ANY FAILURE, the same rule goalsDue states above. A red number on
     a hundred home screens off a dropped read is worse than no number.
     ⚠️ AND SILENT IS NOT "ALL CLEAR" — the route distinguishes a refused read
     from an empty one, and both land here as zero on purpose, because the home
     screen is not the place to report that a database is unreachable. */
  const [docsToSign, setDocsToSign] = useState(0);
  useEffect(() => { let live = true; (async () => {
    if (!user || !user.id) { if (live) setDocsToSign(0); return; }
    try {
      const r = await fetch("/api/my-docs", { headers: { "x-hub-token": hubToken() } }).then((x) => x.json());
      if (live) setDocsToSign(r && r.ok && Number.isFinite(Number(r.count)) ? Number(r.count) : 0);
    } catch { if (live) setDocsToSign(0); }
  })(); return () => { live = false; }; }, [user, signedAt]);

  const [pendingRecs, setPendingRecs] = useState(0);
  useEffect(() => { let live = true; (async () => {
    if (!user || !user.name) { if (live) setPendingRecs(0); return; }
    try {
      const idx = (await kvGet("gc-pg-index-v1")) || [];
      /* ⚠️ ONE ROUND TRIP PER APPLICATION, IN SEQUENCE — that was the bug.
         Matt, Jul 30 2026: "the hub seems a little laggy when opening."

         This loop awaited inside itself, so five applications meant five
         database reads one after another before the dashboard could finish
         mounting, and it grows with every application anyone ever submits. The
         reads do not depend on each other at all; they were serial only because
         `for … await` reads naturally.
         ⚠️ A FAILED READ MUST NOT LOSE THE WHOLE BADGE. allSettled, not all —
         one unreadable application should cost its own count, not everybody
         else's. */
      /* ⇒ AND NOW ONE TRIP FOR ALL OF THEM (Aug 2 2026). Parallel was the right
         first fix, but it was still one REQUEST per application and the count
         grows forever, so on store wifi it filled the browser's ~6-at-a-time
         budget and pushed the rest of the dashboard's reads into a queue.
         The failure rule above is unchanged: kvGetMany reports per key, so an
         unreadable application still costs only its own count. */
      const appKeys = idx.map((row) => `gc-pg-app-v1:${row.role}:${row.slug}`);
      const appReads = await kvGetMany(appKeys);
      const apps = appKeys.map((k) => appReads[k]?.value ?? null);
      let n = 0;
      for (const app of apps) {
        /* ⚠️ NO `status === "submitted"` SKIP ANY MORE. RecInbox has never had
           one, so a submitted application with a still-pending recommendation
           showed a task in the panel and nothing on the badge. In practice the
           recs step gates submission, so this changes nothing in the normal
           flow — but where the two could differ, surfacing the work beats
           hiding it. */
        if (!app) continue;
        for (const sd of Object.values(app.steps || {})) {
          for (const rc of (sd.recs || [])) {
            if (rc && rc.status !== "completed" && recMatches(rc, user)) n += 1;
          }
        }
      }
      if (live) setPendingRecs(n);
    } catch { if (live) setPendingRecs(0); }
  })(); return () => { live = false; }; }, [user]);

  const [pinned, setPinned] = useState([]);
  const [pinMode, setPinMode] = useState(false);
  // Set the moment anyone taps a star. The KV fetch below is async, so without
  // this a slow answer could land AFTER a pin and overwrite it with the old
  // list — the tap would silently undo itself.
  const pinsTouched = useRef(false);
  // Re-read whenever the signed-in person changes, so switching logins on a
  // shared iPad swaps the pins rather than inheriting them. Local cache paints
  // first, KV is the source of truth and reconciles a moment later.
  useEffect(() => {
    pinsTouched.current = false;
    let live = true;
    try { setPinned(JSON.parse(localStorage.getItem(PIN_KEY_FOR(user))) || []); }
    catch { setPinned([]); }
    if (!user || !user.id) return;
    (async () => {
      try {
        const remote = await kvGet(PIN_KV_FOR(user));
        // Only apply if nothing was pinned while we waited, and only if the
        // person actually HAS a stored list — a missing key means "never
        // pinned on any device", which must not wipe a local list that this
        // device is about to publish.
        if (!live || pinsTouched.current || !Array.isArray(remote)) return;
        setPinned(remote);
        try { localStorage.setItem(PIN_KEY_FOR(user), JSON.stringify(remote)); } catch {}
      } catch { /* offline or KV down — the cached list stays, which is right */ }
    })();
    return () => { live = false; };
  }, [user]);
  const togglePin = (id) => setPinned((cur) => {
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    pinsTouched.current = true;
    // Cache first so the next launch paints instantly even offline, then
    // publish. Fire-and-forget: a failed write must never block the tap.
    try { localStorage.setItem(PIN_KEY_FOR(user), JSON.stringify(next)); } catch {}
    if (user && user.id) { try { kvSet(PIN_KV_FOR(user), next); } catch {} }
    return next;
  });

  const [lastTool, setLastTool] = useState(() => {
    try { return localStorage.getItem(LAST_TOOL_KEY) || null; } catch { return null; }
  });
  const [pulse, setPulse] = useState({ evalsDue: 0, evalsOverdue: 0, handbookUnsigned: 0, handbookTotal: 0, handbookSigned: 0 });
  const [pulseLoaded, setPulseLoaded] = useState(false); // director pulse has fetched at least once (gates the green "clear" badge)
  const [daily, setDaily] = useState(null); // { pbd, pbdLabel, sales, hours, giveaways, eomYm, scorecard } — pbd = raw ISO prev business day, for deep-linking a task to that date
  const [handbookMine, setHandbookMine] = useState(null); // null=loading · "none" (no handbook) · "signed" · "unsigned"
  const [query, setQuery] = useState("");
  const [digest, setDigest] = useState(null); // AI morning digest { date, text, generatedAt }
  const [digestOpen, setDigestOpen] = useState(false); // digest expanded vs. condensed preview
  const [healthOpen, setHealthOpen] = useState(false); // Company Health ring expanded to per-metric breakdown
  const [playbookOpen, setPlaybookOpen] = useState(false); // "how to work the red numbers" strip under the KPI grid
  const [scorecard, setScorecard] = useState(null); // EOS scorecard feed {rowId:{actual,goal,hit}} for the KPI strip
  const [moneyCard, setMoneyCard] = useState(null); // { labor, food, gaps } for the landing LABOR + FOOD cards
  const [slBoard, setSlBoard] = useState(null); // Shift Leader Scorecard rollup {updated, leaders:{[hrId]:{name,composite,rag,...}}} for the top-leaders board
  const [inputExtras, setInputExtras] = useState(null); // input-register reads that no other effect already makes (cleaning, drivers, team goals, PTO stamp)
  const [inputsOpen, setInputsOpen] = useState(false);  // input register panel expanded
  const [inputsView, setInputsView] = useState("needs"); // "needs" · "cadence" · "area" · "owner"
  /* ★ WHICH CADENCE SECTIONS ARE COLLAPSED (Matt, Aug 5 2026: "all collapsible.
     Daily, weekly and monthly").
     ⚠️ IT STORES THE COLLAPSED ONES, NOT THE OPEN ONES. Everything starts open,
     so an empty set is the correct initial state and a bucket added later cannot
     arrive already hidden. The other way round, a new section would be invisible
     until somebody thought to open it, which is how a row nobody reads turns
     into a job nobody does. */
  const [cadenceShut, setCadenceShut] = useState(() => new Set());

  // ── Director pulse: evals due + handbook signatures — BOTH from HR Console
  // ⚠️ Evals due USED to be computed from Team Documentation's roster
  // (gcfcr-hr-team-v1, via window.storage, using each member's lastEval/start).
  // Team Documentation is being retired and is the ONLY writer of that key — so
  // the moment the tile is cut, that key freezes and this badge reports evals
  // due against a dead roster forever, on the dashboard, silently. Evals live in
  // HR Console now (gcfcr-hr-evals), so that's the source. Same 6-month cadence,
  // same overdue/due-this-week split. worker.js's buildTodaysTodos() uses the
  // identical rule — if you change one, change all three (see EVAL_CADENCE_MONTHS).
  useEffect(() => {
    if (tier < 3) return;
    let alive = true;
    (async () => {
      try {
        /* Mixed on purpose: evals and info are PROTECTED keys and still ride the
           worker's own batched door, handbook and status are plain and go in the
           single direct query. kvGetMany sorts that out, so this stays one call
           either way. */
        const [dashReads, roster] = await Promise.all([
          kvGetMany(["gcfcr-hr-evals", "gcfcr-hr-info", "gcfcr-hr-handbook", "gcfcr-hr-status"]),
          loadHRTeam(),
        ]);
        const evalsRaw = dashReads["gcfcr-hr-evals"]?.value ?? null;
        const infoRaw = dashReads["gcfcr-hr-info"]?.value ?? null;
        const hb = dashReads["gcfcr-hr-handbook"]?.value ?? null;
        const stRaw = dashReads["gcfcr-hr-status"]?.value ?? null;
        const evalsBy = evalsRaw || {};
        const infoBy = infoRaw || {};
        const sm = stRaw || {};
        const nowMs = Date.now();

        let evalsDue = 0, evalsOverdue = 0;
        roster.forEach((m) => {
          if (sm[m.id] === "terminated") return;
          // Most recent evaluation on file.
          let last = null;
          (evalsBy[m.id] || []).forEach((ev) => {
            const t = Date.parse((ev && ev.date) || "");
            if (!Number.isNaN(t) && (last === null || t > last)) last = t;
          });
          // Never evaluated → measure from hire date, so a new hire gets a grace
          // period instead of reading as overdue on day one.
          let basis = last;
          if (basis === null) {
            const h = Date.parse(((infoBy[m.id] || {}).hireDate) || "");
            basis = Number.isNaN(h) ? null : h;
          }
          // No eval AND no hire date = nothing to measure from. Not assessable —
          // counting them would invent a due date out of nothing.
          if (basis === null) return;
          const due = new Date(basis);
          due.setMonth(due.getMonth() + EVAL_CADENCE_MONTHS);
          const days = (due.getTime() - nowMs) / 86400000;
          if (days < 0) evalsOverdue++;      // past due → red
          else if (days <= 7) evalsDue++;     // due within a week → amber
        });

        // Handbook signatures — loadHRTeam(), not the HR_TEAM seed, or the
        // denominator quietly misses every new hire.
        let handbookUnsigned = 0, handbookTotal = 0, handbookSigned = 0;
        if (hb && hb.version) {
          const acks = hb.acks || {};
          const eligible = roster.filter((m) => sm[m.id] !== "terminated" && !isHbExempt(m.id));
          handbookTotal = eligible.length;
          handbookUnsigned = eligible.filter(
            (m) => !acks[m.id] || acks[m.id].version !== hb.version.n
          ).length;
          handbookSigned = handbookTotal - handbookUnsigned;
        }
        if (alive) { setPulse({ evalsDue, evalsOverdue, handbookUnsigned, handbookTotal, handbookSigned }); setPulseLoaded(true); }
      } catch {}
    })();
    return () => { alive = false; };
  }, [tier]);

  // ── Personal handbook status — runs for everyone signed in, so the
  // climb can show each person their OWN state, not just the director rollup.
  useEffect(() => {
    if (!user || tier < 1) { setHandbookMine(null); return; }
    let alive = true;
    (async () => {
      try {
        const hb = await kvGet("gcfcr-hr-handbook");
        let mine = "none";
        if (hb && hb.version) {
          const a = (hb.acks || {})[user.id];
          mine = a && a.version === hb.version.n ? "signed" : "unsigned";
        }
        if (alive) setHandbookMine(mine);
      } catch {}
    })();
    return () => { alive = false; };
    /* `signedAt` for the same reason as docsToSign above: signing your own
       handbook does not change `user` or `tier`, so without it this stays
       "unsigned" until the page is reloaded. */
  }, [user, tier, signedAt]);

  // ── Daily input checklist — chips vanish as each item is submitted
  useEffect(() => {
    if (tier < 3 || activeTool) return;
    let alive = true;
    (async () => {
      try {
        const pbd = prevBizDay();
        const ymP = pbd.slice(0, 7);
        const nowD = new Date();
        const ymT = isoOfD(nowD).slice(0, 7);
        /* ONE trip for these five instead of five (Aug 2 2026). They were
           already fired together, but a browser only runs ~6 requests to one
           host at a time, so on store wifi the tail of the dashboard's ~20
           reads sat in a queue. `.value ?? null` keeps the exact old shape —
           every one of these previously caught a failure into null. */
        const kSa = `gcfcr-salesalloc-${ymP}-v1`;
        const kPl = `gcfcr-planner-${ymP}-v1`;
        const kFc = `gcfcr-foodcost-${ymP}-v1`;
        const kSl = `gcfcr-sl-daily-${pbd}-v1`;
        const kMtd = `gcfcr-fcr-mtd-${ymP}-v1`;
        const dayReads = await kvGetMany([kSa, kPl, kFc, kSl, kMtd]);
        const sa = dayReads[kSa]?.value ?? null;
        const pl = dayReads[kPl]?.value ?? null;
        const fc = dayReads[kFc]?.value ?? null;
        const sl = dayReads[kSl]?.value ?? null;
        const mtd = dayReads[kMtd]?.value ?? null;
        const saDay = (sa && sa.days && sa.days[pbd]) || null;
        const sales = !!saDay && Object.values(saDay).some((v) => Number(v) > 0);
        const plDay = (pl && pl.days && pl.days[pbd]) || {};
        const hours = plDay.foh !== undefined || plDay.boh !== undefined;
        const gvMap = (fc && fc.giveaways) || {};
        const giveaways = gvMap[pbd] !== undefined;
        // ⚠️ ENTERED ≠ COMPLETE. Giveaways are RUNNING MTD TOTALS and the Food
        // Cost Tracker reads only the LATEST-dated entry, so if the newest row
        // has food or paper sitting at 0 after an earlier row had a real
        // number, that side's credit is gone for the WHOLE MONTH and food or
        // paper % reads high everywhere downstream. A running total that fell
        // back to zero is a blank field, not a real figure — flag it red.
        const gvIsos = Object.keys(gvMap).sort();
        const gvLatest = gvIsos.length ? gvMap[gvIsos[gvIsos.length - 1]] : null;
        const gvPeak = (side) => gvIsos.reduce((m, iso) => Math.max(m, Number((gvMap[iso] || {})[side]) || 0), 0);
        const gvZeroSides = !gvLatest ? [] : ["food", "paper"].filter(
          (side) => (Number(gvLatest[side]) || 0) === 0 && gvPeak(side) > 0
        );
        // Shift Leader Scorecard — "entered" = at least one metric typed for any
        // daypart of the prev business day. Lenient by design: only nags when the
        // day is completely blank. Never flagged before the 7/13 data-start.
        const SL_METRIC_KEYS = ["dtSos", "fcSos", "txNoAha", "cars", "aha"];
        const slEntered = !!sl && typeof sl === "object" && Object.values(sl).some(
          (dp) => dp && typeof dp === "object" && SL_METRIC_KEYS.some((k) => dp[k] !== undefined && dp[k] !== "")
        );
        const scorecard = pbd < SL_SEASON_START ? true : slEntered;
        // ── MTD PAYROLL — the input labor % actually rides on, and the one the
        // register never watched. Nothing was watching whether the real payroll
        // had been posted.
        //
        // ⚠️ THIS COMMENT USED TO SAY the "hours" row above was "the PLANNER's
        // SCHEDULED hours, a different number entirely". That is wrong, and the
        // claim was copied from here into inputRegistry.js before Matt's Aug 7
        // question surfaced it. That row's own source and how lines both say
        // actual punch hours, NOT the schedule, and LaborPlanner has no hours
        // input at all — `editMtdField` exists in exactly one file, FCRPage.jsx,
        // where wages, hours, OT and PTO are all typed together. Both rows point
        // at the FCR now. What is still genuinely different is the CADENCE:
        // this one watches whether payroll has posted for the month.
        //
        // The staleness test is not "is it blank" — it is whether the payroll
        // window has fallen behind the sales window. That mismatch is exactly
        // what makes labor publish HIGH (whole payroll over short sales), and
        // FCRPage already computes the same signal for its publish guard.
        const salesIsos = (sa && sa.days ? Object.keys(sa.days) : []).filter(
          (d) => Object.values(sa.days[d] || {}).some((v) => Number(v) > 0)
        ).sort();
        const lastSalesIso = salesIsos.length ? salesIsos[salesIsos.length - 1] : null;
        const wagesEntered = !!(mtd && Number(mtd.wages) > 0);
        const wagesThrough = (mtd && mtd.hoursThrough) || null;

        // ── FOOD + PAPER INVOICES. Deliveries are not daily, so this can never
        // be a daily nag — it is a "when did one last land" status. undefined
        // means the record could not be read at all, which the register shows
        // as not-tracked rather than inventing a miss.
        // ⚠️ SPLIT THREE WAYS (Matt, Jul 25: "I still don't have a nudge for
        // food, paper and transfers"). One combined date was indistinguishable
        // from no nudge: FoodCostTracker writes invoices AND transfers into the
        // same `entries[]` (its card is titled "Invoices & Transfers"), so a
        // single paper transfer marked the whole thing entered while food
        // invoices sat untouched for a week. Categories are FoodCostTracker's
        // own CATS ids — food/produce/bread/qic are the food side, paper is the
        // paper side, tfood/tpaper are the transfers. kitchen + cleaning are
        // deliberately in none of the three: they're supplies, not food or
        // paper cost, and counting them would put the old false-green back.
        const lastOf = (cats) => {
          if (!Array.isArray(fc && fc.entries)) return undefined;
          const d = fc.entries
            .filter((e) => e && e.date && cats.includes(e.cat))
            .map((e) => e.date).sort();
          return d.length ? d[d.length - 1] : null;
        };
        const lastFoodInvIso  = lastOf(["food", "produce", "bread", "qic"]);
        const lastPaperInvIso = lastOf(["paper"]);
        const lastTransferIso = lastOf(["tfood", "tpaper"]);
        // Kept: nothing reads it now that the register row is split, but it is
        // cheap and any other consumer that appears still gets the old meaning.
        const invDates = Array.isArray(fc && fc.entries)
          ? fc.entries.map((e) => e && e.date).filter(Boolean).sort()
          : null;
        const lastInvoiceIso = invDates === null ? undefined : (invDates.length ? invDates[invDates.length - 1] : null);

        // EOM window: last business day of this month, or the 1st–3rd (prior month)
        let eomYm = null;
        const lastD = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 0);
        while (lastD.getDay() === 0) lastD.setDate(lastD.getDate() - 1);
        if (isoOfD(nowD) === isoOfD(lastD)) {
          const r = ymP === ymT ? fc : await kvGet(`gcfcr-foodcost-${ymT}-v1`).catch(() => null);
          if (!(r && r.endFood) || !(r && r.endPaper)) eomYm = ymT;
        } else if (nowD.getDate() <= 3) {
          const ymPrev = shiftYm(ymT, -1);
          const r = ymP === ymPrev ? fc : await kvGet(`gcfcr-foodcost-${ymPrev}-v1`).catch(() => null);
          if (!(r && r.endFood) || !(r && r.endPaper)) eomYm = ymPrev;
        }
        // Beginning-of-month guest-scores reminder. On the 1st–7th, if NEITHER
        // the CEM nor the Smart Shop history has an entry for the PRIOR month,
        // nudge to upload last month's guest scores. Self-clears the moment
        // either is entered (same self-clearing pattern as eomYm). Both tiles
        // key their entries by "YYYY-MM" id, so we match the prior month's ym.
        let guestYm = null;
        if (nowD.getDate() <= 7) {
          const ymPrev = shiftYm(ymT, -1);
          const guestReads = await kvGetMany(["gcfcr-cem-v2", "gcfcr-smartshop-v1"]);
          const cemArr = guestReads["gcfcr-cem-v2"]?.value ?? null;
          const ssArr = guestReads["gcfcr-smartshop-v1"]?.value ?? null;
          const hasCem = Array.isArray(cemArr) && cemArr.some((e) => e && e.id === ymPrev);
          const hasSs = Array.isArray(ssArr) && ssArr.some((e) => e && e.id === ymPrev);
          if (!hasCem && !hasSs) guestYm = ymPrev;
        }
        const pbdLabel = new Date(pbd + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });

        // ── IPO + Facilities open counts (Today-block pills) ──────────
        // ⚠️ THE TWO TILES USE DIFFERENT STORES. Don't "simplify" both to kvGet.
        //
        // IPOActionItems persists to window.storage with shared=true — NOT
        // Supabase kv — so kvGet finds nothing and the pill would silently
        // read 0 open and hide itself with items outstanding. Read it the
        // same way the tile writes it. There is deliberately no localStorage
        // fallback: the tile has none either, so inventing one here would
        // report a different number than the tile shows.
        //
        // Key + weeks come from the shared ipoPlan.js (same source the tile and
        // the worker reminder use), so the pill rolls per quarter automatically
        // and always counts against the SAME plan the screen renders.
        // Quarter-long by design: no date gate. It disappears at zero.
        let ipoOpen = null;
        try {
          /* ⚠️ THE PLAN COMES OVER THE NETWORK NOW (Aug 8 2026). It used to be
             compiled into THIS bundle — the entry chunk every anonymous visitor
             downloads — purely so this block could count checkboxes. The count
             needed the shape; the dollar variances came along with it. See
             ipoPlanData.js.
             ⚠️ A REFUSED FETCH LEAVES NO PILL, WHICH IS CORRECT. Anyone below
             tier 3 gets a 403 here, and they should not be seeing an IPO count
             on their dashboard anyway. The catch below already turns any failure
             into no pill rather than a false zero. */
          const pr = await fetch("/api/ipo-plan", { headers: { "x-hub-token": hubToken() } });
          const pj = await pr.json().catch(() => null);
          const ipo = ipoQuarter(new Date(), (pj && pj.ok && pj.plans) || {});
          const r = await window.storage.get(ipo.key, true);
          const checked = r && r.value ? JSON.parse(r.value) || {} : {};
          let total = 0, done = 0;
          ipo.weeks.forEach((w) => w.cats.forEach((c) => {
            c.items.forEach((_, i) => { total++; if (checked[`${c.id}-${i}`]) done++; });
          }));
          ipoOpen = total - done;
        } catch { ipoOpen = null; } // unreadable → no pill, never a false "N open"

        /* Facilities IS on kvGet, and it still needs the seed to count against,
           because kvGet returns null until someone edits a row — without it a
           cold store reads 0 open and hides 35 real items.
           ⚠️ THE SEED COMES OVER THE NETWORK NOW (Aug 8 2026). It used to be
           imported from facilitiesData.js, which is exactly why the punch list
           shipped in the entry chunk to anyone who loaded the site.
           ⚠️ NO SEED MEANS NO PILL, NEVER A ZERO. facOpen stays null on any
           failure, which is the existing "render nothing" path. A pill reading
           0 open while 35 items are open is worse than no pill: it is a wrong
           answer nobody would think to question. */
        let facOpen = null;
        try {
          const fr = await fetch("/api/facilities-seed", { headers: { "x-hub-token": hubToken() } });
          const fd = await fr.json().catch(() => null);
          if (fd && fd.ok && Array.isArray(fd.seed) && Array.isArray(fd.actions)) {
            const f = await kvGet("gcfcr-facilities-punchlist-v1").catch(() => null);
            const fi = (f && Array.isArray(f.items) ? f.items : fd.seed) || [];
            const fa = (f && Array.isArray(f.actions) ? f.actions : fd.actions) || [];
            facOpen = fi.filter((x) => x.status !== "done").length + fa.filter((x) => x.status !== "done").length;
          }
        } catch { facOpen = null; }

        if (alive) setDaily({ pbd, pbdLabel, sales, hours, giveaways, gvZeroSides, eomYm, guestYm, scorecard, ipoOpen, facOpen,
                              wagesEntered, wagesThrough, lastSalesIso, lastInvoiceIso,
                              lastFoodInvIso, lastPaperInvIso, lastTransferIso });
      } catch {}
    })();
    return () => { alive = false; };
  }, [tier, activeTool]);

  // ── Input register extras ─────────────────────────────────────
  // The reads no other effect already makes: today's cleaning sign-offs, the
  // approved-drivers list, this month's team goals, and PTO's own updatedAt
  // stamp. Everything else the register needs is already loaded by the `daily`
  // and pulse effects above and is reused rather than fetched twice.
  //
  // Deliberately NOT gated on tier >= 3. Payroll is tier 1 and owns the PTO
  // row; leaders are tier 2 and own cleaning. Gating this the way the director
  // pulse is gated would mean the only people who ever saw their own inputs
  // were the directors who already see everything.
  useEffect(() => {
    if (!user || activeTool) return;
    let alive = true;
    (async () => {
      /* `paperSeedFor` — Jul 28 2026. The register used to call a week "Paper
         cost % not entered" while the Shift Leader Scorecard was showing a
         live month-to-date figure for it. Same number, two verdicts.

         ⚠️ THE READER IS INJECTED FROM HERE ON PURPOSE. inputRegistry.js
         imports boardOwner.js and nothing else so worker.js can import it
         safely; importing FoodCostTracker.jsx there would drag React and
         store.js into the worker bundle. App.jsx already imports
         monthFoodCostPct, so it hands that reader down and the registry stays
         a leaf. Returns PERCENT POINTS (3.78), not a ratio — that is what the
         register's PAPER_GOAL is in. */
      const paperSeedFor = async (ym) => {
        // Dynamic import: this reader is why FoodCostTracker used to sit in
        // the first-paint bundle. It runs long after paint, so it can load then.
        const { monthFoodCostPct } = await import("./FoodCostTracker.jsx");
        const r = await monthFoodCostPct(ym).catch(() => null);
        return r && r.paperPct != null && isFinite(r.paperPct) ? r.paperPct * 100 : null;
      };
      const x = await readInputExtras({ kvGet, paperSeedFor }).catch(() => null);
      if (alive && x) setInputExtras(x);
    })();
    return () => { alive = false; };
  }, [user, activeTool]);

  // ── AI morning digest (director landing) — reads the cached digest the
  // Worker generates each morning (JOB 8). The endpoint builds on demand if
  // the job hasn't run yet, so this is safe to call anytime. Never blocks the
  // dashboard: on any error the card simply doesn't render.
  useEffect(() => {
    if (tier < 2 || !user || activeTool) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/ai-summary?uid=${encodeURIComponent(user.id)}&tier=${tier}`, {
          headers: { "x-hub-token": hubToken() },
        });
        if (!res.ok) return;
        const d = await res.json();
        if (alive && d && d.text) setDigest(d);
      } catch {}
    })();
    return () => { alive = false; };
  }, [tier, user, activeTool]);

  // ── KPI strip — reads the published EOS scorecard feed (the SAME
  // eos:scorecard:{period} key EOSTile merges). Read-only: producers publish.
  // Missing rows render as a calm "—", never a placeholder number. Never
  // blocks the dashboard — on any error the strip simply shows dashes.
  useEffect(() => {
    if (tier < 3 || activeTool) return;
    let alive = true;
    (async () => {
      try {
        const sc = await kvGet(`eos:scorecard:${EOS_PERIOD}`);
        if (alive && sc && typeof sc === "object") setScorecard(sc);
      } catch {}
    })();
    return () => { alive = false; };
  }, [tier, activeTool]);

  // ── Top leaders board — reads the Shift Leader Scorecard rollup
  // (gcfcr-sl-eos-rollup-v1, the SAME key EOSTile + the LD tile read). Every
  // leader here is already scored + RAG'd by the scorecard; we just rank the
  // top few. ⚠️ TIER-GATED AT 2 (was "all tiers, no gate"): leader scoring is
  // not for team members — they were seeing named leaders ranked by a score
  // they have no context for. Tier 1 never fetches it and never renders it.
  // Read-only, non-blocking: any error → no board, never a broken dashboard.
  useEffect(() => {
    if (activeTool) return;
    if (tier < 2) return;
    let alive = true;
    (async () => {
      try {
        const b = await kvGet("gcfcr-sl-eos-rollup-v1");
        if (alive && b && typeof b === "object") setSlBoard(b);
      } catch {}
    })();
    return () => { alive = false; };
  }, [activeTool, tier]);

  // ── LABOR + FOOD cards (tiers 2–3) — the two numbers that replaced the
  // aggregate Handbook climb. Three reads, all read-only, all from tiles that
  // already own these figures:
  //   • monthLaborCard  (Planner)          → MTD labor $ + this weekday's
  //                                          average hours over schedule
  //   • monthFoodCostPct(FoodCostTracker)  → live food % and the MTD sales it
  //                                          is measured against
  //   • loadItemGaps    (foodItemGaps.js)  → last month's over-target
  //                                          subcategories, the focus areas
  // Nothing is computed here that a tile doesn't already compute — the card
  // must never be able to disagree with the tool it links to. Any failure
  // leaves that half null and the card simply renders less, never a wrong
  // number and never a broken dashboard.
  useEffect(() => {
    if (tier < 2 || activeTool) return;
    let alive = true;
    (async () => {
      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [labor, food, all] = await Promise.all([
        import("./LaborPlanner.jsx").then((m) => m.monthLaborCard(ym, now.getDay())).catch(() => null),
        import("./FoodCostTracker.jsx").then((m) => m.monthFoodCostPct(ym)).catch(() => null),
        /* ⚠️ THE SEED COMES OVER THE NETWORK NOW (Aug 8 2026). It used to be
           compiled into THIS bundle — the entry chunk every anonymous visitor
           downloads — so seven lines of itemised food-cost leakage shipped to
           the public. A 403 here just means fewer historical months on the
           card, which is the right outcome for someone below tier 3. */
        (async () => {
          let seed = {};
          try {
            const gr = await fetch("/api/food-gaps-seed", { headers: { "x-hub-token": hubToken() } });
            const gj = await gr.json().catch(() => null);
            seed = (gj && gj.ok && gj.seed) || {};
          } catch { seed = {}; }
          return loadItemGaps(kvGet, seed).catch(() => null);
        })(),
      ]);
      if (!alive) return;
      setMoneyCard({ labor, food, gaps: all ? priorMonthGaps(all, ym) : null });
    })();
    return () => { alive = false; };
  }, [tier, activeTool]);
  // it's how a Today-block row can deep-link INTO a tool's state (e.g. the
  // leader-scorecard task opening on the day it's nagging about instead of
  // dumping you on today and making you tap ‹ back). Cleared whenever a tool
  // opens without one, so a normal tap from the grid never inherits a stale
  // payload from an earlier deep-link.
  /* Records that someone opened a tool, so "which tools actually get used,
     by whom, how often" is answerable. kv_store can't answer it — it stores
     the LAST write, never a count.
     Sends the roster id rather than a typed name: the older `submissions`
     table takes free text and one person ended up split across "monica g ",
     "Monica Garcia" and "Team Member", which makes counting impossible.
     Silent by construction — no await at the call site, no state, no toast.
     A logging outage must be invisible to whoever is trying to work. */
  const logOpen = (toolId) => {
    if (!user || !user.id) return; // signed-out taps aren't attributable
    try {
      fetch("/api/log-open", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
        body: JSON.stringify({ tool: toolId, uid: user.id, person: user.name, tier }),
        keepalive: true, // survives the view swap that follows immediately
      }).catch(() => {});
    } catch { /* never surfaces */ }
  };

  /* ⚠️ ONE CLOSE PATH FOR BOTH BACK BUTTONS — the header's and the crash
     boundary's. Two copies of this is how the boundary's back keeps the old
     behaviour after the header's is fixed, and a crashed tool is exactly when
     somebody is least able to work around it. */
  const closeTool = () => {
    const back = fromTool.current;
    fromTool.current = null;
    setToolProps(null);
    setActiveTool(back || null);
  };

  const openTool = (tool, props) => {
    /* Stamp BEFORE anything renders — covers the direct open and the
       PIN-prompt path, since both route through here first.
       ⚠️ INTO THE SURFACE WE ARE ACTUALLY LEAVING. A tool opened from inside a
       section must not overwrite the dashboard's stamp, or backing all the way
       out lands at the top — which is the bug this pair of refs exists for. */
    /* ⚠️ ARRIVING FROM ANOTHER TOOL STAMPS NEITHER SCROLL REF. The position on
       screen belongs to the tool we are leaving, and writing it into the
       dashboard's ref is what made backing out land in the wrong place. */
    if (activeTool && activeTool.id !== tool.id) {
      fromTool.current = activeTool;
    } else {
      fromTool.current = null;
      if (openSection) sectionScrollY.current = window.scrollY;
      else dashScrollY.current = window.scrollY;
    }
    try { localStorage.setItem(LAST_TOOL_KEY, tool.id); } catch {}
    setLastTool(tool.id);
    setToolProps(props || null);
    if (canUseTool(tool, tier, user)) {
      // Usage log. Fire-and-forget — no await, no error surface, nothing
      // downstream of it. If this line ever blocks a tile from opening it
      // has failed at its only job. Only counts people who actually GOT IN:
      // a blocked tap falls through to the PIN prompt below and is not a use.
      logOpen(tool.id);
      setActiveTool(tool);
    } else {
      setPin("");
      setPinErr("");
      /* Every open of the PIN card starts clean. This is the ONE entry point
         for it, so clearing here covers Cancel, the backdrop tap and tapping a
         second tile — in one place instead of three that can drift apart
         (design rule 8). A name picked for one tile must never be sitting
         there, already chosen, when somebody else picks up the iPad. */
      setNeedName(false);
      setPinNameId("");
      setNameChoices([]);
      setNameQuery("");
      setPinTool(tool);
    }
  };

  /* 🐛 A PUSH TOLD YOU TO DO SOMETHING AND THEN DROPPED YOU ON THE DASHBOARD
     (Matt, Aug 4 2026: "I got a push notification for a doc that needs signed
     but it didn't take me to it").
     The Hub has never read anything off the URL — every notification opened "/"
     and left you to find the thing yourself, which is the work the notification
     was supposed to save.

     ⇒ `?to=<toolId>` opens that tool once, on load. Deliberately the smallest
     possible thing: one parameter, one lookup, no router, no history stack, no
     shareable deep links to build a habit around. It exists so a notification
     can finish its sentence.

     ⚠️ THE PARAMETER IS STRIPPED IMMEDIATELY. Left in the address bar, every
     later refresh would re-open that tool and a leader could not get back to
     the dashboard without editing a URL. replaceState so it never enters
     history either.
     ⚠️ Runs ONCE, with an empty dep list, and goes through openTool rather than
     setActiveTool — openTool carries the access check, the usage log and the
     PIN prompt. Bypassing it would let a push walk somebody past a gate. */
  useEffect(() => {
    let id = "";
    try { id = new URLSearchParams(window.location.search).get("to") || ""; } catch { return; }
    if (!id) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("to");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    } catch { /* the open still matters more than the tidy-up */ }
    const t = toolById(id);
    if (t) openTool(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grant = (t, person) => {
    setTier(t);
    localStorage.setItem(TIER_KEY, String(t));
    if (person) {
      setUser(person);
      localStorage.setItem(USER_KEY, JSON.stringify(person));
    }
    /* ⚠️ THE SENTINEL IS NOT A SCREEN. Opening it would put an unregistered id
       through the tile chrome, and `Icon` renders an unmapped id as an empty
       square — a tile-shaped hole that reads as a screen still loading. Null
       lands on the dashboard, which is the whole point of the button. */
    setActiveTool(isSignIn(pinTool) ? null : pinTool);
    setPinTool(null);
    /* ★★ THE STORE'S OWN SETTINGS, IF THE BOOT CALL NEVER GOT THEM.
       🐛 Opening the Hub with a lapsed session made main.jsx's loader bail on
       the missing token, and nothing ever tried again — so the whole session
       ran on the ORIGIN STORE'S code defaults. Signing in is exactly the moment
       a token starts existing, so it is the moment to ask again.

       ⚠️ NOT AWAITED, ON PURPOSE. Nobody waits after typing a PIN. Access is
       granted on the lines above and the settings catch up a moment later;
       making this block the grant would put a network round trip between a
       leader and the board they just unlocked, which is the trade main.jsx
       already refused at boot.

       ⚠️ IT COSTS NOTHING IN THE NORMAL CASE. `loadStoreConfig` returns
       immediately once a boot apply has succeeded, so this only does real work
       in the case that was broken.

       ⚠️ THE TICK IS THE POINT. `applyStoreOverrides` merges into module state
       React cannot see, so without a state change the config would be right and
       the screen would still show the defaults — which is the bug, one step
       later. Only a REAL apply resolves true, so a failed fetch renders
       nothing extra. */
    loadStoreConfig().then((didApply) => { if (didApply) setCfgTick((n) => n + 1); });
  };

  const submitPin = async () => {
    if (busy) return;

    // 1 · Default HR PIN can't identify anyone
    if (pin === HR_DEFAULT_PIN) {
      setPinErr("That's the default PIN — open the HR Console, find your name, and set your personal PIN first.");
      return;
    }

    // 2 · Personal PIN — look the person up in the HR registry
    setBusy(true);
    try {
      // ⚠️ THE ROSTER MUST BE loadHRTeam(), NOT HR_TEAM.
      // HR_TEAM is HR Console's seed array. Anyone added through HR Console's
      // "+ Add team member" lives in gcfcr-hr-added-v1 and is NOT in it. Filter
      // the seed here and a new hire's PIN matches nobody — they'd be told "PIN
      // not recognized" while holding a PIN their own file says is set. This is
      // the whole reason the roster split blocked cutting the Team Docs tile.
      // slackMap.idByName is written by the worker's `slack-avatars` job and is
      // the ONLY place the Hub learns a person's Slack user ID — the HR roster
      // has no shared key with Slack. Resolved once here at sign-in so every
      // downstream gate compares stable IDs instead of name strings.
      // ★ THE PIN MAP IS NO LONGER DOWNLOADED. It used to be fetched here in
      // full — 106 four-digit PINs — and compared in the browser, which meant
      // the Hub's entire auth model was handed to every device that signed
      // anyone in, and was readable by anyone who opened the bundle (kv_store
      // carries a `USING (true)` policy and the anon key ships in the client).
      //
      // `/api/pin-verify` now does the comparison server-side with the service
      // key and answers with a roster ID or a refusal. Everything below this
      // line is unchanged: the roster, the role override, the tier, the tool
      // gate and the slackId all still resolve HERE, so who can open what
      // cannot have shifted.
      const [verify, rolesR, rosterR, slackMap] = await Promise.all([
        fetch("/api/pin-verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          /* ⚠️ EXPLICIT. The gc_dev device cookie is what lets the worker
             narrow the PIN search without asking anybody anything, and it only
             rides along if credentials are sent. Same-origin is the browser
             default here, but this line is not decoration: the day this fetch
             gets a header or a mode option added, the default is exactly the
             kind of thing that changes underneath and fails silently. */
          credentials: "same-origin",
          /* ★ ONE id, and only when the person actually picked a name. The
             worker then compares against that ONE account instead of ~106,
             which is the whole amplification kill. Sending nothing is still
             valid and is what happens on every sign-in today. */
          body: JSON.stringify(pinNameId
            ? { pin, remember: rememberDevice, id: String(pinNameId) }
            : { pin, remember: rememberDevice }),
        }).then((r) => r.json()),
        kvGetResult("gcfcr-hr-roles"), loadHRTeamResult(),
        kvGet("hr:slack-avatars:v1").catch(() => null),
      ]);
      const rm = rolesR.value || {};
      const roster = rosterR.team;
      // Refreshed on every successful sign-in, which happens many times a day —
      // so the worker's copy is never more than a shift stale. Fire-and-forget:
      // a failed publish must never block somebody logging in (kvSet returns
      // false rather than throw — the old catch here was dead code).
      // ⚠️ Publishes ONLY off reads that SUCCEEDED — BOTH of them. The roles
      // gate landed first; the verification pass then caught the same hole on
      // the ROSTER side: loadHRTeam hands back the static seed on a failed
      // read, so the map would rebuild without anyone hired since launch, and
      // the worker's rota assigns people off this map. A skipped publish just
      // leaves the worker's last good copy standing.
      // ⚠️ THE PUBLISH ITSELF MOVED BELOW THE TOKEN STORE — see the note there.
      // The terminated filter and the duplicate-PIN check now happen inside the
      // worker, against the same two keys, in the same order.
      if (verify && verify.error === "locked") {
        setPinErr(`Too many incorrect PINs. Try again in about ${verify.retryAfterMin || 15} minutes.`);
        return;
      }
      /* ★ THE SERVER DOES NOT KNOW THIS DEVICE. Show the name step, built from
         the roster THIS SAME Promise.all already fetched — no extra round trip,
         no new screen, and no URL change, because the Hub has no routing.
         ⚠️ A FAILED ROSTER READ MUST NOT BECOME A SHORT LIST. loadHRTeamResult
         hands back the static seed when the read fails, and the seed has nobody
         hired since launch. A new hire searching a seed roster would not find
         their own name and would have no way forward at all, so say what
         actually went wrong instead — the same sentence the roster failure
         below already uses. */
      if (verify && verify.error === "who") {
        if (!rosterR.ok) {
          setPinErr("Couldn't load the team roster — check your connection and try again.");
          return;
        }
        setNameChoices(rosterR.team);
        setNeedName(true);
        setPinErr("");
        return;
      }
      /* Store-wide pause on sign-ins from devices the Hub has never seen. It
         cannot fire for anyone holding a phone or an iPad that has signed in
         before, which is the point — the closed door is always one no leader
         is standing at. */
      if (verify && verify.error === "guarded") {
        setPinErr("Sign-in is paused for a few minutes. Use a store iPad, or ask a director.");
        return;
      }
      /* ★ KEEP THE SIGNED TOKEN. It is what `/api/hr-store` now requires, so
         without this line every protected HR read 401s and the console, the
         profile and the dashboard all come back empty. Written before the tool
         gate below, because a person can be refused a TOOL and still be a
         legitimately signed-in user whose own dashboard needs to load. */
      /* ⚠️ A PIN SOMEBODY ELSE CHOSE. The worker marks it (see /api/pin-set)
         and reports it here, and the gate below makes them replace it. Read on
         EVERY sign-in rather than stored once: a director can reset somebody's
         PIN at any time, and the very next sign-in has to pick that up. */
      setMustChange(!!(verify && verify.mustChange));
      if (verify && verify.ok && verify.token) {
        try { localStorage.setItem(HUB_TOKEN_KEY, verify.token); } catch {}
      }
      /* ★ PUBLISHED AFTER THE TOKEN IS STORED, AND THAT ORDER IS THE POINT.
         🐛 This ran 13 lines earlier, above the token store. `kvSet` reads
         `hubToken()` synchronously while it builds the fetch options — before
         its first await — so the publish always went out on the token from
         BEFORE this sign-in. On a fresh device or an expired session that is no
         token at all, which is the entire reason `hr:rank-by-name:v1` sat at
         148 anonymous writes in the kv-set census. It was never a stray caller;
         it was this line, every single sign-in.
         ⚠️ Now that it is authenticated, the worker refuses this key without a
         token (KVSET_NEEDS_TOKEN covers the `hr:` prefix). The two changes ship
         together: closing that door with the publish still up here would fail
         every sign-in's publish and quietly stale the food-safety rota's map.
         ⚠️ Still publishes ONLY off reads that SUCCEEDED — both of them.
         loadHRTeam hands back the static seed on a failed read, so the map
         would rebuild without anyone hired since launch, and the worker's rota
         assigns people off this map. A skipped publish leaves the worker's last
         good copy standing. */
      if (rolesR.ok && rosterR.ok) kvSet(RANK_BY_NAME_KEY, buildRankByName(roster, rm));
      const matches = verify && verify.ok
        ? roster.filter((m) => String(m.id) === String(verify.id))
        : [];

      if (matches.length === 1) {
        const m = matches[0];
        const role = effectiveRole(m.id, rm[m.id] || m.role);
        const t = roleTier(role);
        if (isSignIn(pinTool) || canUseTool(pinTool, t, { id: m.id, role })) {
          // slackId is passed through so TeamDirectory (and anything else
          // gating on identity) can key off the Slack user ID rather than a
          // display-name string. Null until the HR roster carries the field.
          const slackId = m.slackId
            || ((slackMap && slackMap.idByName) ? slackMap.idByName[normName(m.name)] : null)
            || null;
          grant(t, { id: m.id, name: m.name, role, slackId });
        } else if (onlyFor({ id: m.id, role })) {
          // Their tier is irrelevant here, so the tier sentence below would read
          // as nonsense ("Your access is Director — this tool needs Director").
          setPinErr("This tool isn't part of your Hub access.");
        } else {
          setPinErr(`Your access is ${TIER_NAMES[t]} — this tool needs ${TIER_NAMES[pinTool.tier]}.`);
        }
      } else if (verify && verify.error === "ambiguous") {
        setPinErr("That PIN matches more than one person — set a unique PIN in the HR Console.");
      } else if (verify && verify.ok) {
        // The worker matched an id the local roster doesn't carry. Only happens
        // if `gcfcr-hr-added-v1` is unreadable from this device, so say that
        // rather than "PIN not recognized" — the PIN was in fact correct.
        setPinErr("Couldn't load the team roster — check your connection and try again.");
      } else {
        setPinErr("PIN not recognized.");
      }
    } catch {
      setPinErr("Couldn't reach the PIN registry — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    setTier(0);
    // The signed token goes with the session it belonged to.
    try { localStorage.removeItem(HUB_TOKEN_KEY); } catch {}
    setUser(null);
    localStorage.removeItem(TIER_KEY);
    localStorage.removeItem(USER_KEY);
    fromTool.current = null;   // signing out leaves; it never walks back in
    setActiveTool(null);
  };

  /* ═══ THE BROWSER AND THE SERVER MUST AGREE ON WHO YOU ARE ═════════════════
     🐛 THEY DID NOT, AND NOBODY WAS CHECKING (Aug 7 2026). Identity lives in
     localStorage here and in the signed token on the server, and until
     /api/whoami existed nothing compared them. `tool_events` shows uid 21 —
     Hannah, Executive Director over HR — carrying 20 opens under Thanh Nguyen's
     name across Aug 4-6, and uid 48 carrying two different people. That uid is
     read off the TOKEN, so the Worker genuinely believed one person was
     another — and uid is what the HR full-reader check, the own-row read filter
     and /api/doc-ack all key on.

     Three symptoms in one day, one root cause: Nick was nudged for not opening
     the Hub right after using it at the store (his session was dead, so nothing
     logged), the quiet-people card vanished, and Thania was told to check her
     connection when her uniform order was refused.

     ⚠️ ON DOUBT WE GO TO SIGNED OUT, NOT TO A REDUCED TIER. That corrects my own
     first design. "Signed in as nobody" is a state this app has never been in —
     there are eight unguarded `user.name` reads — so inventing it would trade a
     wrong identity for a white screen. Signed out is a state everything already
     handles. What stops it being a lockout is /api/pin-help, which is exactly
     why that shipped alongside it.
     ⚠️ SILENCE IS NOT AGREEMENT. A failed or unparseable whoami changes nothing.
     Acting on a dropped request would sign the whole store out every time the
     store wifi blinked, which is a far worse bug than the one being fixed. */
  const [sessionDoubt, setSessionDoubt] = useState(null);   // null | "expired" | "mismatch"
  const myId = user && user.id;

  /* ═══ HOW MANY INVITATIONS ARE WAITING ON ME ═══════════════════════════════
     Bri, Aug 13 2026: "a numbers icon next to the calendar icon at the top that
     indicates how many schedule requests are pending", then "Keep the count
     just on my own."

     ⚠️⚠️ THE COUNT IS `awaitingReply` FROM THE LEAF, NOT A FILTER WRITTEN HERE,
     and the comment at the top of this file is the reason. The last badge in
     this header had its own rule — name-only, ignoring the id — while the panel
     it pointed at used `recMatches`. The badge said "1" and the panel showed
     nothing, and Bri is the one who reported it. A second badge with a second
     rule over one dataset would be the same bug wearing a calendar.

     ⚠️ AND IT IS A NARROWER QUESTION THAN THE PANEL ANSWERS. CalendarInvites'
     "Waiting on you" section lists every upcoming invitation and prints each
     one's status, accepted ones included. `awaitingReply` counts only the ones
     with no answer at all, which is what "pending" means and what a number on
     an icon has to mean — a badge showing 5 when 3 are already accepted is a
     badge people learn to ignore. The panel now prints this same number beside
     its heading, from this same function, so the two cannot drift.

     ⚠️ OWNER-ONLY, WHICH IS HER RULING AND ALSO THE ICON'S OWN GATE. This runs
     behind `isCalendarOwner`, so ~106 devices do not each fetch a calendar on
     every dashboard load to render nothing.
     ⚠️ FAILS TO ZERO, NEVER TO A GUESS. A refused or dropped read leaves the
     badge off rather than showing a stale or invented number. */
  /* 🐛 AND IT ONLY EVER RAN ONCE. Matt, Aug 19 2026: "I accepted the meeting
     but the alert won't clear." This effect is keyed on `[user]`, so the count
     was fetched when the Hub loaded and never again — correct when it was
     drawn, stale from the next tap onwards, and clearable only by a full
     reload. Answering happens in CalendarInvites, several screens away, and
     nothing told the header.
     ⇒ ONE FETCH, TWO TRIGGERS: sign-in, and the tile saying somebody answered.
     ⚠️ THE COUNT IS STILL COMPUTED HERE, through the same `awaitingReply`. The
     event carries no number — it says "ask again" and nothing else — because a
     count sent from the tile would be a second answer to the same question, and
     this file already records what two answers to one question cost. */
  const [calPending, setCalPending] = useState(0);
  const refreshCalPending = useCallback(async () => {
    if (!user || !isCalendarOwner(user.role)) { setCalPending(0); return; }
    try {
      const r = await fetch("/api/calendar-mine", { headers: { "x-hub-token": hubToken() }, cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!d || !d.ok) return;
      const evs = (Array.isArray(d.invited) ? d.invited : []).map((x) => x && x.event).filter(Boolean);
      setCalPending(awaitingReply(evs, d.uid, d.myReplies).length);
    } catch { /* the badge stays as it is — never invented, never guessed */ }
  }, [user]);
  useEffect(() => { refreshCalPending(); }, [refreshCalPending]);
  useEffect(() => {
    const onAnswered = () => { refreshCalPending(); };
    window.addEventListener("hub:calendar-answered", onAnswered);
    return () => window.removeEventListener("hub:calendar-answered", onAnswered);
  }, [refreshCalPending]);
  useEffect(() => {
    if (!myId) return undefined;
    let alive = true;
    (async () => {
      let who = null;
      try {
        const r = await fetch("/api/whoami", { headers: { "x-hub-token": hubToken() }, cache: "no-store" });
        /* ★★ OPENING THE HUB NOW EXTENDS THE SESSION, and until Aug 14 2026 it
           did not. Renewal only ever happened on a SAVE, so the twelve-hour
           clock ran from somebody's last WRITE — and most of what anyone does
           here is look. Matt got the expired banner while using the app daily;
           a team member who opens it to check a schedule and saves nothing got
           it every single day.
           ⚠️ THIS MUST RUN BEFORE THE `signedIn === false` BRANCH BELOW. The
           header only comes back on a session that was still alive, so reading
           it after an early return would renew nothing on exactly the requests
           that carry it.
           ⚠️ AND IT IS THE SHARED HELPER, NOT A SECOND COPY. This is a raw
           fetch rather than a trip through store.js, which is why the Worker
           could renew a token that nothing on this page ever stored. */
        absorbTokenRefresh(r);
        who = await r.json();
      } catch { return; }                       // silence is not agreement
      if (!alive || !who || who.ok !== true) return;
      if (who.signedIn === false) { setSessionDoubt("expired"); signOut(); return; }
      if (String(who.uid) !== String(myId)) { setSessionDoubt("mismatch"); signOut(); return; }
      /* 🐛 THE BANNER HAD NO WAY OFF THE SCREEN (Matt, Aug 10 2026: "I signed
         out and in but still have this"). `sessionDoubt` was set in the two
         lines above and cleared nowhere, so the notice outlived the very
         sign-in it was asking for. He did exactly what it told him to do and it
         stayed, which reads as "it did not work" — and the only thing that
         actually cleared it was a full page reload, because remounting is what
         reset the useState.
         ⚠️ CLEARED HERE AND ONLY HERE, because this is the one moment the Hub
         KNOWS the doubt is answered: the Worker has confirmed a live session
         and confirmed it belongs to the person on screen. Clearing it on
         sign-in instead would only prove somebody typed a PIN, which is what
         the banner already assumed and is not the same thing.
         ⚠️ A FAILED whoami STILL CLEARS NOTHING. Both returns above this line
         leave it standing. Silence is not agreement in either direction: a
         blink of store wifi must not wipe a warning any more than it should
         raise one. */
      setSessionDoubt(null);
    })();
    return () => { alive = false; };
  }, [myId]);

  // ── Role refresh on mount ─────────────────────────────────────────
  // `user` and `tier` are restored from localStorage at the top of this
  // component, which makes them a SNAPSHOT of whoever signed in last, frozen
  // at the moment they typed their PIN. A role change in HR Console never
  // reaches them: canUseTool compares tool.allow against the stale role
  // string, so a promoted person keeps their old access until they happen to
  // sign out. Closing the app does NOT help — localStorage survives that.
  // (Found Jul 24: Katia was set to Junior Trainer in HR and Trainer Tasks +
  // Equipment Log were allow-listed correctly, and she still couldn't see
  // them. Two deploys chasing a bug that wasn't in the code.)
  //
  // This re-resolves role and tier from HR once per mount, using the SAME
  // precedence as the sign-in path above: the gcfcr-hr-roles override beats
  // the roster's own role. It also catches someone terminated since they last
  // signed in — the PIN lookup already blocks them, but only AT sign-in, so a
  // cached session outlived the termination.
  //
  // FAIL-SAFE: any error, or a roster that comes back empty, leaves the cached
  // values untouched. A network blip must never lock the store out mid-shift.
  // The failure mode we accept is "keeps old access a little longer", never
  // "nobody can open anything".
  useEffect(() => {
    if (!user || !user.id) return;
    let alive = true;
    (async () => {
      try {
        /* roles + status in one trip; the roster has its own loader and still
           runs alongside. Both keys are read again by other effects on the same
           mount — the in-flight dedupe in store.js collapses those too. */
        const [idReads, roster] = await Promise.all([
          kvGetMany(["gcfcr-hr-roles", "gcfcr-hr-status"]),
          loadHRTeam(),
        ]);
        const rolesMap = idReads["gcfcr-hr-roles"]?.value ?? null;
        const statusMap = idReads["gcfcr-hr-status"]?.value ?? null;
        if (!alive || !Array.isArray(roster) || roster.length === 0) return;
        const me = roster.find((m) => String(m.id) === String(user.id));
        if (!me) return;
        if ((statusMap || {})[me.id] === "terminated") {
          setTier(0);
          setUser(null);
          localStorage.removeItem(TIER_KEY);
          localStorage.removeItem(USER_KEY);
          /* ⚠️ THE SERVER SESSION HAS TO GO TOO, and it was being left behind.
             This cleared the browser's idea of who they are, so the Hub looked
             signed out — but `gcfcr-hub-token` stayed on the device, and that
             token is what /api/hr-store, /api/upload and every protected route
             actually trust. It is valid for 12 hours, or 30 days if they ever
             ticked "keep me signed in". So a terminated person's device kept a
             live server session while the screen showed a sign-in box.
             Termination is supposed to remove access in one step; this is the
             half that was missing. */
          try { localStorage.removeItem(HUB_TOKEN_KEY); } catch {}
          fromTool.current = null;   // access removed: leave, do not go back in
          setActiveTool(null);
          return;
        }
        const role = effectiveRole(me.id, (rolesMap || {})[me.id] || me.role);
        if (!role) return;
        /* ★ THE TIER IS RE-DERIVED WHETHER OR NOT THE ROLE STRING MOVED.
           This used to `return` early when `role === user.role`, which meant a
           cached tier was only ever corrected as a side effect of a job-title
           change. A tier that was wrong while the title was right survived
           every reload, forever. That is the mechanism behind "a stale
           localStorage snapshot has burned two deploys": identity IS
           re-resolved at mount, but the fix was being skipped before it ran.
           It also matters without any tampering — change a threshold in
           roleTier and nobody's tier updates until their title happens to
           change. The roster is the source of truth; localStorage is a cache,
           so the cache gets rewritten from the source every mount. */
        const t = roleTier(role);
        if (role !== user.role) {
          const next = { ...user, name: me.name || user.name, role };
          setUser(next);
          localStorage.setItem(USER_KEY, JSON.stringify(next));
        }
        setTier(t);
        localStorage.setItem(TIER_KEY, String(t));
      } catch { /* keep the cached session — see FAIL-SAFE above */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const badgeFor = (id) => {
    /* ⚠️ The pending-recommendation count is checked BEFORE the tier gate on
       purpose. Professional Growth lives inside Peak Reachers, and the people
       being asked for recommendations are Team Leaders — tier BELOW 3. Gating
       this like the others would hide the badge from exactly the people it
       exists for, which is the bug Bri reported in the first place. */
    /* Both counts ride the same tile and for the same reason — Assistant
       Directors are tier 2, so anything below the gate never reaches them. */
    if (id === "teamsite" && (pendingRecs > 0 || goalsDue > 0)) return pendingRecs + goalsDue;
    /* ⚠️⚠️ ABOVE THE TIER GATE, and this is the third time this file has had to
       say so. A document sent for signature goes to EVERYBODY — the HR Console
       tile is tier 1 for exactly that reason ("View your profile and set your
       PIN") — so putting this below `tier < 3` would hide the badge from every
       single person it exists for and leave it showing only to the five people
       who sent the thing. */
    if (id === "hr" && docsToSign > 0) return docsToSign + (tier >= 3 ? pulse.handbookUnsigned + pulse.evalsDue : 0);
    if (tier < 3) return 0;
    if (id === "hr") return pulse.handbookUnsigned + pulse.evalsDue;
    return 0;
  };

  // ── Active tool view ────────────────────────────────────────────
  if (activeTool) {
    const accent = colorFor(activeTool);
    return (
      <div style={{ fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif", minHeight: "100vh", background: "#F3F4F6" }}>
        <div
          style={{
            position: "sticky", top: 0, zIndex: 50, background: "#fff",
            borderBottom: `3px solid ${accent}`, padding: "10px 14px",
            display: "flex", alignItems: "center", gap: 12,
          }}
        >
          <button
            onClick={closeTool}
            style={{
              background: "#F3F4F6", border: "none", borderRadius: 10,
              padding: "8px 14px", fontSize: 13.5, fontWeight: 800,
              color: "#374151", cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            ← Tools
          </button>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <Icon id={activeTool.id} color={accent} size={18} />
            <span style={{ fontSize: 15, fontWeight: 800, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {activeTool.name}
            </span>
          </span>
        </div>
        {/* The fallback is deliberately plain text in the tool's own accent, not
            a spinner: on a fast connection it is gone before it registers, and
            on a slow one a word beats an animation that looks like a hang. */}
        {/* ⚠️ THE BOUNDARY WRAPS Suspense, NOT THE OTHER WAY ROUND. A lazy
            chunk that fails to download throws too, and that throw has to land
            somewhere. Inside-out, the failed import would escape and blank the
            app — which is the exact failure this is here to stop. */}
        <ToolBoundary name={activeTool.name} resetKey={activeTool.id} onBack={closeTool}>
          <Suspense fallback={
            <div style={{ padding: "28px 16px", fontSize: 14, fontWeight: 700, color: accent }}>
              Loading {activeTool.name}…
            </div>
          }>
            {/* `launchers` only means anything to HR Console. Spread conditionally
                rather than passed always, so every other tool keeps the prop list
                it had before. */}
            <activeTool.Component tier={tier} user={user} pendingRecs={pendingRecs} goalsDue={goalsDue}
              /* ★ CROSS-TOOL NAVIGATION, from the one place that owns it.
                 Matt, Aug 4 2026: "can the food safety here be a link to the
                 tool?" The Hub has no router, so a tool cannot navigate to
                 another tool by itself — this hands every tool the same
                 callback the dashboard uses, which means the access check, the
                 usage log and the PIN prompt all still apply. A tool must never
                 be able to open another one past a gate. */
              onOpenTool={(id) => { const t = toolById(id); if (t) openTool(t); }}
              {...(activeTool.id === "hr" ? { launchers: hrLaunchersFor(tier, user) } : {})}
              /* ★★ THE MANUAL IS HANDED THE DASHBOARD'S OWN ANSWER, NOT THE RAW
                 LIST. `shownSections` is SECTIONS already filtered through
                 canUseTool for this person, so the manual can only ever describe
                 tools the home screen is also showing them. Passing SECTIONS and
                 filtering inside the tile would be a second opinion about access,
                 in the last file anyone would think to check. */
              {...(activeTool.id === "manual" ? { sections: sectionsFor(tier, user) } : {})}
              {...(toolProps || {})} />
          </Suspense>
        </ToolBoundary>
      </div>
    );
  }

  // ── Landing grid ────────────────────────────────────────────────
  const signedIn = tier > 0;
  /* ⚠️ DECLARED HERE, NOT WITH THE OTHER ACK STATE ABOVE — it reads `signedIn`,
     which is a const declared on the line above. Referencing it earlier is a
     temporal-dead-zone error ("Cannot access 'signedIn' before initialization")
     and would white-screen the whole app rather than fail visibly. */
  const ackOpen = signedIn && !activeTool && ackDocs.length > 0 && !ackDeferred;
  /* ⚠️ `trainDone === false`, NOT `!trainDone`. null means the read has not
     come back (or failed), and `!null` is true — that one character is the
     difference between "we know they have not watched it" and "we could not
     reach Supabase", and the second must never gate anybody.
     ⚠️ `!ackOpen` so the write-up gate is always answered first. */
  const trainDeck = signedIn
    ? requiredDeck(hrRankOfTitle(effectiveRole(user && user.id, user && user.role)), tier)
    : null;
  /* ⚠️ ORDER OF PRECEDENCE, AND IT IS DELIBERATE: a write-up first (real HR
     consequences), then the PIN somebody else knows (security), then training
     (a nudge). Nobody is ever shown two gates stacked on top of each other. */
  const mcOpen = signedIn && !activeTool && !ackOpen && !mcDeferred && mustChange;
  const trainOpen =
    signedIn && !activeTool && !ackOpen && !mcOpen && !trainDeferred && trainDone === false && !!trainDeck;

  // Float the last-used tool to the front of its section
  const sortTools = (tools) => {
    if (!lastTool) return tools;
    const i = tools.findIndex((t) => t.id === lastTool);
    if (i <= 0) return tools;
    const arr = [...tools];
    const [t] = arr.splice(i, 1);
    arr.unshift(t);
    return arr;
  };

  // Signed in: sections show only unlocked tools; locked tools collapse below.
  // Signed out: full grid with lock badges (we don't know the role yet).
  /* ⚠️⚠️ THE SIGNED-OUT BRANCH FILTERS TOO, AND IT DID NOT UNTIL 13 Aug 2026.
     It handed back raw SECTIONS, so a tile the store has switched OFF was drawn
     on the sign-in screen with a lock and a "Team Member" badge — an invitation
     to sign in and unlock a thing that does not exist. Signing in then made it
     vanish, because `canUseTool` has always applied the flag. Matt, off two
     screenshots: Tokens showed locked while signed out and was gone the moment
     he signed in as a Director.
     ⚠️ `featureOn`, NOT `canUseTool`. Signed out there is no role to judge, and
     showing every tool behind a lock is the POINT of this branch. The only
     thing that must never appear is a feature the store turned off, because no
     amount of signing in will ever reveal it.
     ⚠️ AND EMPTY SECTIONS GO, matching `sectionsFor` above. A section card whose
     every tool is switched off should not be a card. */
  const shownSections = signedIn
    ? sectionsFor(tier, user).map((s) => ({ ...s, tools: sortTools(s.tools) }))
    : SECTIONS.map((s) => ({ ...s, tools: s.tools.filter(featureOn) }))
        .filter((s) => s.tools.length > 0);
  // Pins are stored as ids and resolved through the SAME access check as
  // everything else, so a pin can never surface a tool someone has lost access
  // to — and an id left behind by a deleted tile simply drops out.
  const pinnedTools = signedIn
    ? pinned.map((id) => {
        for (const s of SECTIONS) {
          const t = s.tools.find((x) => x.id === id);
          if (t) return canUseTool(t, tier, user) ? { ...t, color: t.color || s.color } : null;
        }
        return null;
      }).filter(Boolean)
    : [];

  // A narrowed person (ONLY_TOOLS) is not "locked out" of the rest of the Hub —
  // the rest of the Hub is simply not theirs. Listing 40 padlocks would be the
  // exact clutter the narrowing exists to remove, so it collapses to nothing.
  const lockedTools = signedIn && !onlyFor(user)
    ? SECTIONS.flatMap((s) => s.tools.filter((t) => featureOn(t) && !canUseTool(t, tier, user)).map((t) => ({ ...t, color: t.color || s.color })))
    : [];

  // Personalized greeting
  const weekday = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const hr = new Date().getHours();
  const greeting = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  const firstName = user ? user.name.split(" ")[0] : null;

  // Today status rows — PRODUCED BY THE INPUT REGISTER (inputRegistry.js).
  //
  // This block used to compute staleness inline for eight signals and know
  // nothing about the rest, which is how anything outside that list could go
  // stale in silence. The same eight readers are still the source of truth —
  // they were correct and were reused verbatim, not rewritten — but they now
  // arrive through one list that also carries cleaning, the drivers list, team
  // goals and the food item gaps, and that names an OWNER for every row.
  //
  // OWNERSHIP: everyone sees the inputs they own and only those. The Executive
  // Director seat sees the whole board plus anything unowned, so nothing can
  // fall in a gap because no one was assigned it. Owners are ROLES, never
  // names — see the note in inputRegistry.js about why.
  //
  // tone: red = already distorting a published number, amber = attention.
  const AMBER = "#B45309";
  const GREEN = "#0F766E";
  /* ⚠️ NOT A NEW COLOUR (Matt, Aug 5 2026: "Use the existing palette. No new
     colors"). This is the Hub's IPO gold, already used by name on this very
     screen and by the IPO tile itself. AMBER above is the burnt orange the
     Today block has always worn, so the three levels are RED, AMBER and GOLD —
     all three already in this file. */
  const GOLD = "#B4830F";
  /* One place decides what a level looks like. Unknown falls to GOLD, matching
     the level stamp, so a row can never come out colourless. */
  const levelColor = (lv) => (lv === "red" ? RED : lv === "orange" ? AMBER : GOLD);
  const inputRows = buildInputRows({
    daily,
    pulse,
    extras: inputExtras,
    moneyGaps: moneyCard ? moneyCard.gaps : null,
  });
  // TODAY IS DATED ONLY. Standing lists (IPO, facilities) come back separately
  // and render in the register below — they are running counts with no date, and
  // a row that is true every day for a quarter makes the whole block skimmable.
  /* `board` = every row, yours sorted first and each stamped `mine`. The
     register shows the WHOLE store to everyone (Matt, Jul 29: "I want everyone
     to see what they own but I want the whole picture"); `needs` stays yours
     alone because that is what the Today block acts on. */
  const { mine: myInputs, needs: myInputNeeds, open: myOpenLists, board: allInputs } = inputsForPerson(inputRows, user, tier);
  /* Input status per tool, so a tile can say what it needs. Built from the WHOLE
     board rather than just this person's rows: a tile marked "2 need you" when
     the rows belong to somebody else would be a lie, but a tile that stays clean
     while the store is behind is worse — it is the dashboard telling you
     everything is fine. Ownership is shown on the row, not on the tile. */
  /* Plain call, not useMemo — this file does not import it, and one pass over
     ~31 rows on a render that is already doing far more is not worth a hook. */
  const toolInputStatusRaw = inputStatusByTool(allInputs);
  /* ⛔ A RED DIGIT IS NOT AN ALERT. Bri, Aug 19 2026, on the badge shipped an
     hour earlier: "I see a red digit, but I don't see any wording that tells me
     where to go" and "I still don't know where these are able to be viewed and
     signed."

     She is right, and the count on its own was half a feature. A number tells
     somebody that something is true; it does not tell them what to do about it,
     and a team member who has never opened HR Console has no reason to think a
     policy document lives behind a tile called "View your profile and set your
     PIN".

     ⇒ IT REUSES THE ROW THAT ALREADY EXISTS. `inputStatus` is the tile line
     that says what a tool needs instead of describing the tool — Matt's "group
     input health items with each tool or area" from Jul 29. A document waiting
     for a signature is exactly that shape, so it goes there rather than
     becoming a second banner competing with the first.
     ⚠️ IT DOES NOT OVERWRITE A REAL INPUT WARNING. If the tile already has
     something to say, that stays; this only fills an empty line. Two claims on
     one row and the louder one wins is how a store stops reading either. */
  /* 🐛 AND IT NO LONGER YIELDS. This read `docsToSign > 0 && !toolInputStatusRaw.hr`,
     so the one line naming the signing screen was suppressed the moment HR had
     anything else to say — which on a busy week is always.

     The comment above argues that two claims on one row means a store reads
     neither, and that argument is right. It just picks the wrong winner here:
     a document waiting for a signature is the LOUDER claim, because it is the
     one that turns the badge red and the only one a person cannot discover any
     other way. Everything else HR reports can be found by opening HR. */
  const toolInputStatus = docsToSign > 0
    ? { ...toolInputStatusRaw, hr: {
        tone: "offgoal",
        text: docsToSign === 1
          ? "1 document waiting for you to sign — open your own file"
          : `${docsToSign} documents waiting for you to sign — open your own file`,
      } }
    : toolInputStatusRaw;
  /* Inputs a vendor bridge could import — the pitch to Nick and Corp. */
  const bridge = inputBridge(allInputs);
  /* Which Hub section a row's tool lives in. ONE definition — SECTIONS, right
     here, the same list that draws the grid — so an area can never disagree
     with where a tile actually sits. */
  const areaOfRow = (r) => {
    for (const sec of SECTIONS) if (sec.tools.some((t) => t.id === r.tile)) return sec.label;
    return "Other";
  };

  /* ★ TODAY'S TOOLS, WITHOUT MOVING ANYTHING.
     Matt, Jul 29 2026, asked whether the prioritised tool could come first. A
     dashboard that reorders itself every day is harder to learn, and leaders
     find things by POSITION on a shared iPad — muscle memory is worth more than
     optimal ordering. So the grid below never moves. This floats the few tools
     that need action into their own strip above it.

     ⚠️ OFF-GOAL FIRST, THEN MOST-LATE. Off goal is a number missing target,
     which no amount of typing fixes; needs-you clears when somebody enters
     something. Putting the quick wins above the expensive problem is how the
     expensive problem gets ignored.
     ⚠️ CAPPED AT FOUR. "Everything that needs attention" on a bad week is the
     whole grid again, which is the same as no priority at all.
     ⚠️ Only tools this person can actually OPEN. Pointing somebody at a locked
     tile is worse than saying nothing. */
  /* ★ YOURS FIRST — Matt, Jul 30 2026: "everyone to have their own personal
     view of the dashboard prioritizing what they have or need for the
     day/week." The strip is that view: tools holding an input THIS person
     owns rank above tools waiting on someone else, and carry a "Yours" tag.
     The grid below still never moves — the personalisation lives entirely in
     this strip, so two people sharing an iPad still find every tile where it
     always is. myInputNeeds is already this person's list (forPerson stamps
     ownership), so "mine" here can never disagree with the register. */
  const myTileIds = new Set(myInputNeeds.map((r) => r.tile));
  const startHereTools = signedIn
    ? Object.entries(toolInputStatus)
        .map(([id, st]) => {
          for (const sec of SECTIONS) {
            const t = sec.tools.find((x) => x.id === id);
            if (t) return canUseTool(t, tier, user) ? { tool: { ...t, color: t.color || sec.color }, st, mine: myTileIds.has(id) } : null;
          }
          return null;
        })
        .filter(Boolean)
        .sort((a, b) =>
          (b.mine === true) - (a.mine === true) ||
          (b.st.tone === "offgoal") - (a.st.tone === "offgoal") ||
          (b.st.late || 0) - (a.st.late || 0) ||
          a.tool.name.localeCompare(b.tool.name))
        .slice(0, 4)
    : [];

  const statusRows = myInputNeeds.map((r) => ({
    tone: r.tone, text: r.text, sub: r.sub, id: r.tile, tab: r.tab, props: r.props,
    /* ★ THREE LEVELS, NOT TWO (Matt, Aug 5 2026: "Today's Priorities rows
       currently read flat. Give them three levels: red for overdue or blocking,
       orange for due today, yellow for watch").
       The rows only ever carried "red" or "amber", and the only thing wearing
       either was an 8px dot — so twenty rows of unlike urgency rendered as one
       white list. `level` is what the row is drawn from now.
         red    — already tone "red": evaluations overdue, a giveaway total
                  reset to $0, payroll not covering entered sales. Overdue or
                  blocking, exactly as asked.
         orange — an amber row on a DAILY input. A daily input that is not
                  entered is, literally, due today.
         yellow — everything else amber: weekly, monthly and ongoing. Watch.
       ⚠️ SPLIT ON cadenceBucket, NOT ON A LIST I WROTE. The register already
       sorts these rows by cadence for the input-health screen, so this reuses
       that one decision instead of adding a second, private opinion about
       urgency that would immediately start disagreeing with it. A new input
       added later lands in the right level with nothing to update here.
       ⚠️ THE ROW CARRIES ITS OWN cadence. push() builds a row as
       { ...definition, ...state }, so `r` already holds the registry's cadence
       string and cadenceBucket can read it straight off the row.
       ⚠️ ANYTHING UNRECOGNISED FALLS TO yellow, never to nothing. A row with a
       tone this does not know about must still be visible and still be the
       lowest of the three, not invisible. */
    level: r.tone === "red" ? "red" : cadenceBucket(r) === "daily" ? "orange" : "yellow",
    /* Optional. undefined for most rows, and undefined is the correct answer for
       any row with no honest figure. See rowImpact.
       🐛 `r.id`, NOT `r.tile`. Shipped keyed on r.tile and the line never once
       appeared (Matt, Aug 4 2026: "i dont see the change"). Two different ids
       live on one row: `id` is the registry row, "itemgaps" or "hours", and
       `tile` is the TOOL it opens. All four of these rows open the same tool,
       so r.tile is "financials" every time and no case ever matched. The line
       below this one renames tile to id for openTool, which is what made the
       wrong field look like the right one while reading. */
    impact: rowImpact(r.id, moneyCard, scorecard),
  }));
  // Urgency order: red (overdue) floats above amber, regardless of push order.
  // Stable sort keeps within-tone order as-is. No truncation — every open item
  // stays visible; hiding rows would let a real miss slip past an operator.
  // Every Today row is a deep-link: tapping one calls openTool(), which pops the
  // PIN dialog when the tool is out of reach. The rows are built from a bare
  // `tier >= 3` test that knows nothing about `allow` or ONLY_TOOLS, so drop any
  // row whose tool this person cannot actually open. A row with no matching tile
  // (id that no longer exists) is left alone rather than silently discarded.
  const rowTool = (id) => {
    for (const s of SECTIONS) {
      const t = s.tools.find((x) => x.id === id);
      if (t) return t;
    }
    return null;
  };
  const reachableRows = statusRows.filter((r) => {
    const t = rowTool(r.id);
    return !t || canUseTool(t, tier, user);
  });
  statusRows.length = 0;
  statusRows.push(...reachableRows);

  /* Sorted on the level the row is DRAWN with, so the order on screen and the
     colours on screen can never tell different stories. The old rank ran on
     `tone`, which had no idea orange and yellow existed. */
  const LEVEL_RANK = { red: 0, orange: 1, yellow: 2 };
  statusRows.sort((a, b) => (LEVEL_RANK[a.level] ?? 9) - (LEVEL_RANK[b.level] ?? 9));
  // Hybrid: one green all-clear line when nothing needs attention (and data has loaded).
  //
  // ⚠️ THE GREEN LINE NAMES ITS SCOPE ON PURPOSE — DON'T SHORTEN IT BACK TO
  // "You're all caught up". It now speaks for the inputs THIS PERSON OWNS, which
  // is a narrower and therefore honest claim; it still does not speak for the
  // store. Several inputs remain untracked by design (see the grey rows in the
  // register) and worker.js's buildTodaysTodos() still pushes "• {weekday}
  // stations — check Daily Setups" as its first line every single day, so the
  // digest below always has something to say. The two are not in conflict —
  // this line is about entries, that one is about the board.
  const allClear = !!user && statusRows.length === 0 && (!!daily || !!inputExtras);
  /* The worst level on the board, for the Today box's own edge. statusRows is
     already sorted worst-first, so this is row zero. Optional on purpose: the
     render guard makes an empty list unreachable here, but this is the landing
     page and a blank one is the worst thing this file can do, so it falls back
     to the lowest level rather than reading through undefined. */
  const worstLevel = statusRows[0]?.level || "yellow";

  // Quick actions — shortcuts, not status
  //
  // The stations chip used to read `${weekday} stations` and open DailySetup on
  // whatever day the tile picked for itself. Two problems, both fixed here:
  //
  //  1 · SUNDAY LIED. DailySetup's DAYS array is Mon–Sat, so on a Sunday its
  //      day state falls back to "Monday" — while this chip still said "Sunday
  //      stations". It has always opened a different day than it named.
  //  2 · EVENINGS POINT BACKWARD. By late afternoon today's setup has already
  //      run; the board worth opening is tomorrow's.
  //
  // The chip now names the day it will actually open and passes it explicitly
  // as initialDay, so the label and the board can't disagree again.
  //
  // SATURDAY IS DELIBERATELY LEFT ALONE at any hour: "tomorrow" is Sunday
  // (closed, not on the board), and the real next board day is NEXT week's
  // Monday — which needs DailySetup's weekOffset too, not just a day name.
  // Better an honest "Saturday stations" than a chip that quietly opens the
  // Monday that already happened.
  const dow = new Date().getDay(); // 0 = Sun · 6 = Sat
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const boardDay =
    dow === 0 ? { name: "Monday", ahead: true }            // Sunday → the week's first open day
    : dow === 6 ? { name: "Saturday", ahead: false }       // Saturday → today, see above
    : hr >= 14 ? { name: DAY_NAMES[dow + 1], ahead: true } // Mon–Fri afternoon → tomorrow
    : { name: weekday, ahead: false };                     // Mon–Fri morning → today
  const quickActions = [{
    id: "dailysetup",
    label: `${boardDay.name} stations`,
    /* ⚠️ SAME NAME AS THE TILE THIS OPENS. A quick action whose subtitle names
       a tile that no longer exists by that name sends somebody hunting. */
    sub: boardDay.ahead ? "Lineup · Daily Setup · next" : "Lineup · Daily Setup",
    props: { initialDay: boardDay.name },
  }];
  const lastToolObj = lastTool ? toolById(lastTool) : null;
  if (lastToolObj && lastToolObj.id !== "dailysetup" && tier >= lastToolObj.tier) {
    quickActions.push({ id: lastToolObj.id, label: `Resume ${lastToolObj.name}`, sub: "Recent" });
  }

  // Search — jump to any tool by name/description. Locked tools stay in the
  // results (shown with a lock), so search never feels like it's hiding things.
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const results = searching
    ? SECTIONS.flatMap((s) =>
        s.tools
          .filter((t) => t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q))
          .map((t) => ({ ...t, color: t.color || s.color }))
      )
    : [];

  return (
    <div style={{ fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif", minHeight: "100vh", background: "#F3F4F6", paddingBottom: 60, position: "relative", overflow: "hidden" }}>

      <MountainBackdrop />

      {/* ── Write-up acknowledgement gate ──────────────────────────────
          Sits over the dashboard, never over an open tool (`ackOpen` checks
          `!activeTool`), so anyone already working keeps working. */}
      {ackOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(17,24,39,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, maxWidth: 560, width: "100%", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}>
            <div style={{ background: "#7F1D1D", color: "#fff", padding: "16px 20px", borderRadius: "16px 16px 0 0" }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, opacity: 0.85 }}>PLEASE REVIEW</div>
              <div style={{ fontSize: 19, fontWeight: 800, marginTop: 2 }}>
                {ackDocs.length === 1 ? "You have a document to review" : `You have ${ackDocs.length} documents to review`}
              </div>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.5, marginTop: 0 }}>
                Your leader has filed the {ackDocs.length === 1 ? "note" : "notes"} below. Read {ackDocs.length === 1 ? "it" : "them"} and sign to confirm you've seen {ackDocs.length === 1 ? "it" : "them"}.
                Signing means you have read it — it does not mean you agree with it. If you disagree, sign and then speak to HR.
              </p>
              {ackDocs.map((d, i) => (
                <div key={d.id || i} style={{ border: "1px solid #E5E7EB", borderLeft: "3px solid #B91C1C", borderTop: "3px solid #B91C1C", borderRadius: 10, padding: "12px 14px", marginBottom: 10, background: "#FEF2F2" }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>{d.title}</div>
                  <div style={{ fontSize: 12, color: "#6B7280", margin: "2px 0 8px" }}>{d.date}{d.by ? ` · filed by ${d.by}` : ""}</div>
                  <div style={{ fontSize: 14, color: "#374151", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{d.body}</div>
                </div>
              ))}
              <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#374151", letterSpacing: 0.5, marginTop: 14 }}>TYPE YOUR FULL NAME TO SIGN</label>
              <input value={ackSig} onChange={(e) => setAckSig(e.target.value)} placeholder={user && user.name ? user.name : "Your full name"}
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", fontSize: 15, border: "1px solid #D1D5DB", borderRadius: 10, marginTop: 6 }} />
              {ackErr && (
                <div style={{ marginTop: 10, borderRadius: 8, padding: "9px 12px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13, fontWeight: 700 }}>
                  {ackErr}
                </div>
              )}
              <button onClick={ackSignAll} disabled={!ackSig.trim() || ackBusy}
                style={{ width: "100%", marginTop: 12, padding: "13px 16px", fontSize: 15, fontWeight: 800, color: "#fff", background: "#B91C1C", border: "none", borderRadius: 10, opacity: (!ackSig.trim() || ackBusy) ? 0.45 : 1 }}>
                {ackBusy ? "Saving…" : ackDocs.length === 1 ? "I have read this" : "I have read these"}
              </button>
              {/* ★ THE ESCAPE. Deliberate, and the reason this is a gate and not
                  a lockout: someone opening the Hub mid-rush to check the board
                  must not be stuck behind a write-up. Session-only — it is back
                  on the next launch, and every launch after, until they sign. */}
              <button onClick={() => setAckDeferred(true)}
                style={{ width: "100%", marginTop: 8, padding: "11px 16px", fontSize: 14, fontWeight: 700, color: "#6B7280", background: "transparent", border: "none" }}>
                I'm on shift — remind me later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Standing up a brand new store ─────────────────────────────
          Dead at Gate City twice over: no SETUP_KEY secret, and ~106 PINs
          on file. Either alone makes the server refuse. */}
      {setupOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(17,24,39,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, maxWidth: 460, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}>
            <div style={{ background: "#065F46", color: "#fff", padding: "16px 20px", borderRadius: "16px 16px 0 0" }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, opacity: 0.85 }}>NEW STORE</div>
              <div style={{ fontSize: 19, fontWeight: 800, marginTop: 2 }}>Set up this Hub</div>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.5, marginTop: 0 }}>
                This runs once, for the first person in. You will build the team
                from here afterwards. The Operator or an executive can do this,
                whoever gets here first.
              </p>
              <input value={setupKey} onChange={(e) => { const v = e.target.value; setSetupKey(v); }}
                type="password" placeholder="Setup key"
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", fontSize: 15, border: "1px solid #D1D5DB", borderRadius: 10 }} />
              <input value={setupName} onChange={(e) => { const v = e.target.value; setSetupName(v); }}
                placeholder="Your first and last name"
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", fontSize: 15, border: "1px solid #D1D5DB", borderRadius: 10, marginTop: 8 }} />
              <select value={setupRole} onChange={(e) => { const v = e.target.value; setSetupRole(v); }}
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", fontSize: 15, border: "1px solid #D1D5DB", borderRadius: 10, marginTop: 8, background: "#fff" }}>
                <option>Executive Director</option>
                <option>Human Resources</option>
                <option>Accounts Payable</option>
                <option>Executive</option>
                <option>Owner</option>
              </select>
              <input value={setupPin} onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setSetupPin(v); }}
                inputMode="numeric" type="password" placeholder="Choose your PIN (4 to 6 numbers)"
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", fontSize: 15, border: "1px solid #D1D5DB", borderRadius: 10, marginTop: 8 }} />
              {setupErr && (
                <div style={{ marginTop: 10, borderRadius: 8, padding: "9px 12px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13, fontWeight: 700 }}>
                  {setupErr}
                </div>
              )}
              <button onClick={submitSetup} disabled={setupBusy}
                style={{ width: "100%", marginTop: 12, padding: "13px 16px", fontSize: 15, fontWeight: 800, color: "#fff", background: "#065F46", border: "none", borderRadius: 10, opacity: setupBusy ? 0.5 : 1, cursor: "pointer" }}>
                {setupBusy ? "Setting up…" : "Set up this store"}
              </button>
              <button onClick={() => setSetupOpen(false)}
                style={{ width: "100%", marginTop: 6, padding: "11px 16px", fontSize: 14, fontWeight: 700, color: "#6B7280", background: "transparent", border: "none", cursor: "pointer" }}>
                Cancel
              </button>
              <p style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 10, lineHeight: 1.45, textAlign: "center" }}>
                The setup key is the SETUP_KEY secret in this store's Cloudflare
                settings. It stops working the moment anybody has a PIN.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── First time here: claim your account ───────────────────────
          Sits over the sign-in card. Nothing here is secret: it shows the
          roster (already public) and sends the code to the server, which
          holds the only copy of the hash. */}
      {claimOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(17,24,39,0.78)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, maxWidth: 460, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}>
            <div style={{ background: INK, color: "#fff", padding: "16px 20px", borderRadius: "16px 16px 0 0" }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, opacity: 0.85 }}>FIRST TIME HERE</div>
              <div style={{ fontSize: 19, fontWeight: 800, marginTop: 2 }}>Set up your PIN</div>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.5, marginTop: 0 }}>
                Find your name, confirm the last 4 numbers of your phone, then
                pick a PIN only you know.
              </p>

              {claimId ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F3F4F6", borderRadius: 10, padding: "10px 12px" }}>
                  <span style={{ fontWeight: 800, fontSize: 15, color: "#111827", flex: 1 }}>
                    {(claimRoster.find((m) => String(m.id) === String(claimId)) || {}).name || ""}
                  </span>
                  <button onClick={() => { setClaimId(""); setClaimQuery(""); }}
                    style={{ background: "none", border: "none", color: "#6B7280", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <input value={claimQuery} onChange={(e) => { const v = e.target.value; setClaimQuery(v); }}
                    placeholder="Type your name"
                    style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", fontSize: 15, border: "1px solid #D1D5DB", borderRadius: 10 }} />
                  {/* Same matcher the sign-in name step uses, so one spelling
                      rule applies everywhere rather than two that drift. */}
                  {claimQuery.trim().length >= 2 && (
                    <div style={{ marginTop: 8, maxHeight: 190, overflowY: "auto", border: "1px solid #E5E7EB", borderRadius: 10 }}>
                      {matchNames(claimRoster, claimQuery).slice(0, 12).map((m) => (
                        <button key={m.id} onClick={() => { setClaimId(String(m.id)); setClaimErr(""); }}
                          style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none",
                                   borderBottom: "1px solid #F3F4F6", padding: "10px 12px", fontSize: 14.5, cursor: "pointer" }}>
                          {m.name}
                        </button>
                      ))}
                      {!matchNames(claimRoster, claimQuery).length && (
                        <div style={{ padding: "10px 12px", fontSize: 13, color: "#6B7280" }}>
                          No match. Ask a director to add you.
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <input value={claimCode} onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 4); setClaimCode(v); }}
                inputMode="numeric" placeholder="Last 4 of your phone"
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", fontSize: 15, border: "1px solid #D1D5DB", borderRadius: 10, marginTop: 10 }} />
              <input value={claimPin} onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setClaimPin(v); }}
                inputMode="numeric" type="password" placeholder="Choose your PIN (4 to 6 numbers)"
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", fontSize: 15, border: "1px solid #D1D5DB", borderRadius: 10, marginTop: 8 }} />

              {claimErr && (
                <div style={{ marginTop: 10, borderRadius: 8, padding: "9px 12px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13, fontWeight: 700 }}>
                  {claimErr}
                </div>
              )}
              <button onClick={submitClaim} disabled={claimBusy}
                style={{ width: "100%", marginTop: 12, padding: "13px 16px", fontSize: 15, fontWeight: 800, color: "#fff", background: INK, border: "none", borderRadius: 10, opacity: claimBusy ? 0.5 : 1, cursor: "pointer" }}>
                {claimBusy ? "Setting up…" : "Set up my PIN"}
              </button>
              <button onClick={() => setClaimOpen(false)}
                style={{ width: "100%", marginTop: 6, padding: "11px 16px", fontSize: 14, fontWeight: 700, color: "#6B7280", background: "transparent", border: "none", cursor: "pointer" }}>
                Cancel
              </button>
              <p style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 10, lineHeight: 1.45, textAlign: "center" }}>
                No phone number is stored in the Hub. If yours is not on file, a
                director sets your PIN instead.
              </p>
              {/* The way in for a brand new store. See the state block for why
                  it lives down here and not on the sign-in card. */}
              <button onClick={() => { setSetupOpen(true); setSetupErr(""); }}
                style={{ display: "block", margin: "6px auto 0", background: "none", border: "none", padding: 4,
                         fontSize: 11.5, fontWeight: 700, color: "#9CA3AF", cursor: "pointer", textDecoration: "underline" }}>
                Setting up a new store?
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Replace a PIN somebody else chose ─────────────────────────
          Sits over the dashboard, never over an open tool, and yields to
          the write-up gate. See the state block for why it snoozes. */}
      {mcOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9997, background: "rgba(17,24,39,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, maxWidth: 460, width: "100%", boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}>
            <div style={{ background: "#B45309", color: "#fff", padding: "16px 20px", borderRadius: "16px 16px 0 0" }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, opacity: 0.85 }}>ONE QUICK THING</div>
              <div style={{ fontSize: 19, fontWeight: 800, marginTop: 2 }}>Pick your own PIN</div>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.5, marginTop: 0 }}>
                Someone set this PIN up for you, so they know it. Choose one only
                you know. Everything you do in the Hub is filed under your name,
                so this is what keeps your work yours.
              </p>
              <input value={mcPin} onChange={(e) => { const v = e.target.value; setMcPin(v); }}
                inputMode="numeric" type="password" placeholder="New PIN (4 to 6 numbers)"
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", fontSize: 15, border: "1px solid #D1D5DB", borderRadius: 10 }} />
              <input value={mcPin2} onChange={(e) => { const v = e.target.value; setMcPin2(v); }}
                inputMode="numeric" type="password" placeholder="Type it again"
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", fontSize: 15, border: "1px solid #D1D5DB", borderRadius: 10, marginTop: 8 }} />
              {mcErr && (
                <div style={{ marginTop: 10, borderRadius: 8, padding: "9px 12px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13, fontWeight: 700 }}>
                  {mcErr}
                </div>
              )}
              <button onClick={mcSave} disabled={mcBusy}
                style={{ width: "100%", marginTop: 12, padding: "13px 16px", fontSize: 15, fontWeight: 800, color: "#fff", background: "#B45309", border: "none", borderRadius: 10, opacity: mcBusy ? 0.5 : 1, cursor: "pointer" }}>
                {mcBusy ? "Saving…" : "Save my PIN"}
              </button>
              {/* Same escape as every other gate here, and for the same reason:
                  nobody gets stuck behind a modal mid-shift. Session only, so it
                  is back on the next launch until the PIN is actually replaced. */}
              <button onClick={() => setMcDeferred(true)}
                style={{ width: "100%", marginTop: 6, padding: "11px 16px", fontSize: 14, fontWeight: 700, color: "#6B7280", background: "transparent", border: "none", cursor: "pointer" }}>
                I'm on shift — remind me later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hub training gate ──────────────────────────────────────────
          Sits over the dashboard, never over an open tool (`trainOpen`
          checks `!activeTool`), and never on top of the write-up gate
          (`!ackOpen`). Anyone already working keeps working. */}
      {trainOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9997, background: "rgba(17,24,39,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, maxWidth: 520, width: "100%", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}>
            {/* ⚠️ THE GREETING USES THE FIRST NAME ONLY, AND FALLS BACK.
                Matt, Aug 10 2026: "I want a welcome to your personal hub
                message or something like that." This is the moment for it —
                it is literally the first thing anyone sees on their first
                sign-in. Worded to work for a new hire AND for Hannah, who has
                used the Hub for months and is only seeing this gate for the
                first time: it welcomes them to THEIR Hub, not to the Hub.
                ⚠️ Two-surname names are the norm on this team, so `.split(" ")[0]`
                is the right cut — it takes the given name and never guesses at
                which of the two surnames to use. */}
            <div style={{ background: trainDeck.color, color: "#fff", padding: "18px 20px", borderRadius: "16px 16px 0 0" }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, opacity: 0.85 }}>WELCOME</div>
              <div style={{ fontSize: 21, fontWeight: 800, marginTop: 3, lineHeight: 1.2 }}>
                {user && user.name ? `${String(user.name).trim().split(" ")[0]}, this is your Hub` : "This is your Hub"}
              </div>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.5, marginTop: 0 }}>
                It is set up for you already. Everything below is open to you
                right now, and nothing else is in your way.
              </p>
              <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.5, marginTop: 0 }}>
                Watch the short walkthrough once, about two minutes, so you are
                not hunting for things mid-shift.
              </p>
              <div style={{ border: "1px solid #E5E7EB", borderLeft: `3px solid ${trainDeck.color}`, borderTop: `3px solid ${trainDeck.color}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                <span style={{ display: "inline-block", fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: "#fff", background: trainDeck.color, borderRadius: 999, padding: "2px 8px", marginBottom: 6 }}>
                  {trainDeck.badge}
                </span>
                <div style={{ fontWeight: 800, fontSize: 16, color: "#111827" }}>{trainDeck.title}</div>
                <div style={{ fontSize: 13, color: "#6B7280", marginTop: 3, lineHeight: 1.4 }}>{trainDeck.desc}</div>
              </div>
              {/* Opening the deck is what flips the confirm button on. It is not
                  proof they watched it — nothing can be, it opens in its own tab
                  — but it does stop "I have watched it" being the one button on
                  screen, which is what makes a gate get clicked through blind. */}
              <button
                onClick={() => { markTrainOpened(); window.open(trainDeck.href, "_blank", "noopener"); }}
                style={{ width: "100%", padding: "13px 16px", fontSize: 15, fontWeight: 800, color: "#fff", background: trainDeck.color, border: "none", borderRadius: 10, cursor: "pointer" }}>
                {trainOpened ? "Open it again" : "Watch it now"}
              </button>
              {trainErr && (
                <div style={{ marginTop: 10, borderRadius: 8, padding: "9px 12px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13, fontWeight: 700 }}>
                  {trainErr}
                </div>
              )}
              {/* 🐛🐛 THIS BUTTON WAS DISABLED UNTIL `trainOpened` WAS TRUE, AND IT
                  STRANDED MATT ON A LIVE STORE (Aug 10 2026, reported with a
                  screenshot: "I watched and it won't go away").

                  WHY IT STRANDED HIM: the Hub is added to the home screen, so it
                  runs STANDALONE. `window.open(deck, "_blank")` there does not
                  open a background tab in the same context — it hands off to
                  Safari, and coming back the standalone app had been reloaded.
                  React remounted and the flag was gone. sessionStorage was
                  supposed to carry it across exactly that trip and does not
                  survive it in standalone. So he watched the whole deck, came
                  back, and the only button that could clear the gate was grey.

                  ⚠️ NEVER GATE THE ESCAPE FROM A BLOCKING DIALOG ON STATE THAT
                  A NAVIGATION CAN DESTROY. The "you must open it first" rule was
                  a nicety — it stopped blind clicking. Being stuck behind a modal
                  on 106 phones during a lunch rush is not a nicety. If the two
                  ever conflict again, the nicety loses.

                  The Watch button still records that they opened it, and the
                  label below still reflects it. Nothing is gated on it. */}
              <button onClick={trainMarkWatched} disabled={trainBusy}
                style={{ width: "100%", marginTop: 8, padding: "12px 16px", fontSize: 14.5, fontWeight: 800, color: "#fff", background: "#1E9E57", border: "none", borderRadius: 10, cursor: "pointer", opacity: trainBusy ? 0.5 : 1 }}>
                {trainBusy ? "Saving…" : "I have watched it"}
              </button>
              {/* ★ THE ESCAPE, same as the write-up gate and for the same reason:
                  somebody opening the Hub mid-rush to check the board must not be
                  stuck behind a video. Session-only — it is back on the next
                  launch, and every launch after, until they watch it. */}
              <button onClick={snoozeTraining}
                style={{ width: "100%", marginTop: 6, padding: "11px 16px", fontSize: 14, fontWeight: 700, color: "#6B7280", background: "transparent", border: "none", cursor: "pointer" }}>
                I'm on shift — remind me later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      {saveSignedOut && (
        <div style={{ position: "relative", zIndex: 2, background: "#FEF3C7", color: "#92400E", borderBottom: "1px solid #FCD34D", padding: "9px 16px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <span>Your sign-in expired. Your work saved, but sign in again so it is recorded under your name.</span>
          <button onClick={() => setSaveSignedOut(false)}
            style={{ background: "none", border: "1px solid #FCD34D", color: "#92400E", borderRadius: 6, padding: "2px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Dismiss</button>
        </div>
      )}
      <div style={{ position: "relative", zIndex: 1, background: INKGRAD, color: "#fff", padding: "46px 20px 18px", borderBottom: `3px solid ${RED}` }}>
        <div style={{ maxWidth: PAGE_MAX, margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 12, rowGap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <PeakReachersBadge size={42} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", opacity: 0.75, whiteSpace: "nowrap" }}>
                {STORE.name.toUpperCase()} FSR · #{STORE.fsr}
              </div>
              <div style={{ fontSize: "clamp(19px, 5.5vw, 26px)", fontWeight: 800, letterSpacing: "-0.01em", marginTop: 3, whiteSpace: "nowrap" }}>
                {STORE.appName}
              </div>
            </div>
          </div>
          {/* ⭐⭐ THE WAY IN, ON THE SCREEN SOMEBODY LANDS ON. Matt, twice:
              "I still want to log in without going into a tool."

              🐛 THE SIGNED-OUT HEADER HAD NOTHING ON IT AT ALL. Every control
              here sits behind `signedIn`, so a person opening the Hub saw the
              store name and a list of sections and no way to identify
              themselves. The only door was to tap a tool, be refused, type a
              PIN, and land inside a tool they may not have wanted — then back
              out to reach the dashboard.

              ⚠️ IT OPENS THE SAME CARD, not a second one. A separate sign-in
              screen is two places to keep the name step, the ambiguous-PIN
              message and the lockout copy in step, and they would drift. */}
          {!signedIn && (
            <button
              onClick={() => { setPin(""); setPinErr(""); setNeedName(false); setPinNameId(""); setNameChoices([]); setNameQuery(""); setPinTool(SIGN_IN_TOOL); }}
              style={{
                background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.32)",
                color: "#fff", borderRadius: 999, padding: "7px 16px",
                fontSize: 13, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              Sign in
            </button>
          )}
          {signedIn && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* ★ BRI'S CALENDAR ICON, by the sign-in name. Opens the Calendar
                tool, which is the only way to get anywhere in a Hub with no URL
                routing — there is nothing to navigate TO.
                ⚠️ SHOWN ON THE SAME TEST THAT DECIDES WHO CAN OWN A CALENDAR,
                so an icon can never appear for somebody the tile would then
                refuse. That mismatch is the Facilities lockout, and the tile
                registration above carries the matching warning. */}
            {user && isCalendarOwner(user.role) && (
              /* ⚠️ THE WRAPPER EXISTS ONLY TO HANG THE COUNT OFF. `position:
                 relative` has to sit on something that is NOT the button, or the
                 badge is clipped by the button's own `borderRadius: 999`. */
              <div style={{ position: "relative", flex: "0 0 auto", display: "flex" }}>
              <button
                onClick={() => { const t = toolById("calendar"); if (t) openTool(t); }}
                title={calPending ? `Calendar — ${calPending} waiting on you` : "Calendar"}
                aria-label={calPending ? `Calendar, ${calPending} invitations waiting on you` : "Calendar"}
                style={{
                  background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)",
                  color: "#fff", borderRadius: 999, width: 32, height: 32, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flex: "0 0 auto",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </button>
              {/* ★ THE COUNT (Bri, Aug 13 2026). Nothing at all at zero — a grey
                  "0" is a thing to check that never has an answer, and it would
                  sit in the header of every director's Hub all day.
                  ⚠️ CAPPED AT 9+. The bubble is 16px against a 32px button; a
                  three-digit number would either overflow the header or shrink
                  the text past reading. Anybody with ten unanswered invitations
                  does not need the exact figure, they need to open it.
                  ⚠️ `pointer-events: none` so the badge can never swallow the tap
                  that opens the calendar — the one thing a person is trying to do
                  when they notice it. The count is also in the button's own
                  title and aria-label, so it is not colour-and-shape only. */}
              {calPending > 0 && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute", top: -4, right: -4, minWidth: 16, height: 16,
                    padding: "0 4px", borderRadius: 999, background: RED, color: "#fff",
                    fontSize: 10.5, fontWeight: 800, lineHeight: "16px", textAlign: "center",
                    border: "1.5px solid #14243D", pointerEvents: "none", boxSizing: "border-box",
                  }}
                >
                  {calPending > 9 ? "9+" : calPending}
                </span>
              )}
              </div>
            )}
            <PushToggle user={user} tier={tier} />
            <button
              onClick={signOut}
              style={{
                background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)",
                color: "#fff", borderRadius: 999, padding: "6px 14px",
                fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {user ? `${user.name.split(" ")[0]} · ${TIER_NAMES[tier]}` : TIER_NAMES[tier]} · Sign out
            </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: PAGE_MAX, margin: "0 auto", padding: "16px 14px 0", position: "relative", zIndex: 1 }}>

        {/* ── Search ──────────────────────────────────────────────── */}
        {!openSection && signedIn && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: cardSurface(PEAK, 0.5), border: "1px solid #E5E7EB", ...accentEdge(PEAK, 3), borderRadius: 12, padding: "10px 14px", marginBottom: 16, boxShadow: CARD_3D }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tools…"
              style={{ flex: 1, border: "none", outline: "none", fontSize: 15, fontWeight: 600, color: INK, background: "transparent" }}
            />
            {searching && (
              <button
                onClick={() => setQuery("")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 18, fontWeight: 700, lineHeight: 1, padding: "0 2px" }}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* ── Greeting ────────────────────────────────────────────── */}
        {firstName && !openSection && !searching && (
          <div style={{ fontSize: 20, fontWeight: 800, color: INK, marginBottom: 14, letterSpacing: "-0.01em" }}>
            {greeting}, {firstName}.
          </div>
        )}

        {/* ⚠️ NOT GATED ON signedIn, AND THAT IS THE POINT. By the time this
            shows we have just signed them out, so anything gated on being
            signed in would clear the doubt and its explanation in the same
            breath and leave somebody staring at a PIN box wondering what
            happened. It is the one thing on this screen that has to survive
            losing the session it is describing. */}
        {sessionDoubt && !searching && (
          <div style={{ border: "1px solid #E5E7EB", ...accentEdge("#B45309", 3), borderRadius: 12, background: "#fff", boxShadow: CARD_3D, padding: "13px 15px", marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: INK, marginBottom: 4 }}>
              {sessionDoubt === "expired" ? "Your sign-in expired" : "We are not sure who is signed in on this device"}
            </div>
            <div style={{ fontSize: 12.5, color: "#4B5563", lineHeight: 1.5 }}>
              {sessionDoubt === "expired"
                ? "Nothing is wrong and nothing was lost. The Hub kept showing your name after the sign-in ran out, so anything you saved in that time may have been refused. Enter your PIN to carry on."
                : "This device was signed in as somebody else, so the Hub signed out to be safe. Nothing of yours was changed. Enter your PIN to get your own view back."}
            </div>
          </div>
        )}

        {/* ⚠️⚠️ SIGNED IN WITH NO ROLE — SAY SO INSTEAD OF QUIETLY LOCKING THINGS.
            Matt, Aug 13 2026: "profit share dissapeard form the gate city hub."
            Every gate in FinancialSuite was correct and his roster role
            (Executive Director) passes all three; what his phone held was a
            cached identity with NO role, and signing out and back in fixed it.

            🐛 THE DEFECT IS NOT THE GATE, IT IS THAT THIS STATE IS SILENT. The
            identity effect above re-reads the roster on every mount, and it has
            FOUR paths that leave the cached value in place without a word — the
            roster not being an array, the person not being found on it, no role
            resolving, and the catch. Any of them, on a device whose cached user
            has no `role`, and every role-gated surface simply denies: the Profit
            Share tab vanishes, `allow:` tiles vanish, and it reads exactly like
            somebody switched a feature off. It looks like a settings change, so
            that is where the next hour gets spent. It cost me one today.

            ⚠️ IT FAILS CLOSED AND MUST KEEP FAILING CLOSED. This does not open
            anything or guess a role — showing Profit Share to an unconfirmed
            identity would be the actual security bug. It only tells the person
            what happened and what fixes it, which turns a silent wrong state
            into a reported one (design rule 1's "a visible error gets reported,
            a silently malformed record does not").

            ⚠️ NARROW ON PURPOSE: signed in, AND no role at all. A network blip
            on a device that has a cached role changes nothing and shows nothing,
            which is why this is not wired to the read failing. */}
        {signedIn && user && !String(user.role || "").trim() && !searching && (
          <div style={{ border: "1px solid #E5E7EB", ...accentEdge("#B45309", 3), borderRadius: 12, background: "#fff", boxShadow: CARD_3D, padding: "13px 15px", marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: INK, marginBottom: 4 }}>
              Some tools are hidden right now
            </div>
            <div style={{ fontSize: 12.5, color: "#4B5563", lineHeight: 1.5 }}>
              The Hub knows your name but could not read your job title, so anything
              that depends on it is hidden. Nothing has been switched off and nothing
              of yours was changed. Sign out and back in with your PIN to fix it.
            </div>
            <button
              onClick={signOut}
              style={{ marginTop: 10, background: NAVY, color: "#fff", border: "none", borderRadius: 9, padding: "9px 15px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
            >
              Sign out
            </button>
          </div>
        )}

        {/* ── KPI strip — live store metrics from the EOS scorecard feed.
              Reads actual + goal + hit per row; a row with no published
              number shows a calm "—". Tapping any cell opens the EOS tile. ─ */}
        {!openSection && !searching && tier >= 3 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", color: "#9CA3AF", textTransform: "uppercase" }}>Key metrics</span>
              {/* ⚠️ SAYS WHAT THE NUMBERS ARE, NOT WHICH EOS QUARTER THEY WERE FILED
                    UNDER (Nick, Aug 7 2026: wants this to say MTD). It read
                    "Q3 · FY26", which is the EOS reporting period — but Sales,
                    Food and Labor are all month-to-date figures published by
                    FCRPage, and the line under this strip already says "as of
                    Aug 6". A quarter label over monthly numbers is the same
                    wrong-basis problem the labor DMs had, and a reader who
                    catches it once stops trusting the next one.

                    ⚠️ "MTD", NOT "Month to date" (Matt, Aug 7 2026: "i want it
                    to say MTD"). It shipped spelled out and he wanted the
                    abbreviation. Everyone reading this strip is a director who
                    says MTD out loud every day, and the short form leaves the
                    Key metrics label room on a narrow phone.

                    ⚠️ THIS HEADER IS TRUE FOR FOUR OF THE SIX, NOT ALL SIX, and
                    that is handled in the cells rather than here. Turnover is a
                    rolling 90-day rate and Evals on-time is a snapshot of the
                    roster today; both carry their own window under the goal (see
                    `basis` in KPI_ROWS). Swapping this to something vague enough
                    to cover all six — "Key numbers", "Latest" — would have made
                    the four that ARE month to date stop saying so, which is the
                    fact Nick asked for. Label the exceptions, not the rule. */}
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", color: "#9CA3AF", whiteSpace: "nowrap" }}>MTD</span>
            </div>
            {/* 2 rows × 3, NOT a horizontal scroll. Six 96px cells don't fit a
                phone: the strip landed scrolled with Sales/Food/Labor — the
                three that actually drive a decision — off the left edge, and
                the leftmost visible cell sliced in half. A grid shows all six
                at once and never depends on a swipe. minmax(0,1fr) lets a cell
                shrink below its content width, so nothing clips. */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
              {KPI_ROWS.map((row) => {
                const cell = (scorecard && scorecard[row.id]) || null;
                // Producers (FCRPage, HRConsole, CashAudit) publish DISPLAY
                // STRINGS for EOSTile — "29.2%", "≤ 8%", "$2,890", "+9.2%" —
                // which EOSTile renders as text. This strip used to do
                // Number(cell.actual), and Number("29.2%") is NaN, so EVERY
                // cell rendered "—" no matter what was published. Show what was
                // published verbatim (it's already formatted, and it keeps the
                // "≤" on goals), and only fall back to row.fmt() if a producer
                // ever sends a raw number instead.
                const show = (v) => {
                  if (v === null || v === undefined) return null;
                  if (typeof v === "number") return Number.isFinite(v) ? row.fmt(v) : null;
                  const s = String(v).trim();
                  return s === "" ? null : s;
                };
                const val = show(cell && cell.actual);
                const goalStr = show(cell && cell.goal);
                const hasVal = val !== null;
                const tone = !hasVal ? "#9CA3AF" : cell.hit === true ? GREEN : cell.hit === false ? RED : INK;
                return (
                  <button
                    key={row.id}
                    onClick={() => {
                      // Open the tool that OWNS this number — Financials for
                      // Sales/Food/Labor (landing on the right tab), HR Console
                      // for Turnover/Evals, Cash Audit for Cash. Works the same
                      // whether the cell is red (investigate), green (verify)
                      // or "—" (that tool is where the data gets entered).
                      if (row.tab) { try { localStorage.setItem(FIN_LAST_TAB_KEY, row.tab); } catch {} }
                      openTool(toolById(row.dest));
                    }}
                    style={{
                      flexShrink: 0, minWidth: 96, textAlign: "left", cursor: "pointer",
                      background: cardSurface(), border: "1px solid #E5E7EB",
                      /* ★ TOP AND LEFT, in the metric's own colour (Matt, Aug 4
                         2026: "add the left side 3d view to key metrics"). The
                         inset highlight in CARD_3D alone did not read on these:
                         they carry a 1px grey border on every side, which sits
                         visually on top of a soft inset. The cards below already
                         speak this language — Company Health and TODAY both wear
                         a coloured left bar — so this borrows it rather than
                         inventing a third treatment.
                         Left padding trimmed by the 3px the border takes, so the
                         tiles stay the size they were. */
                      borderTop: `3px solid ${tone}`, borderLeft: `3px solid ${tone}`,
                      borderRadius: 12,
                      padding: "9px 12px 10px 9px", boxShadow: CARD_3D,
                      /* ⚠️ RELATIVE, SO THE GLYPH CAN SIT IN THE EMPTY HALF.
                         `overflow: hidden` keeps a glyph that overhangs the
                         rounded corner inside it rather than square against it. */
                      position: "relative", overflow: "hidden",
                    }}
                  >
                    {/* ⭐ THE GLYPH. Top right, in the cell's own tone, faint.
                        `aria-hidden` because it says nothing the label does not
                        already say out loud, and a screen reader announcing
                        "image" before every number would be noise. */}
                    {KPI_GLYPH[row.id] && (
                      <svg
                        aria-hidden="true" width="34" height="34" viewBox="0 0 24 24" fill="none"
                        stroke={tone} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                        style={{ position: "absolute", top: 6, right: 6, opacity: hasVal ? 0.16 : 0.10, pointerEvents: "none" }}
                      >
                        {KPI_GLYPH[row.id]}
                      </svg>
                    )}
                    <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.03em", color: "#6B7280", whiteSpace: "nowrap" }}>{row.label}</div>
                    <div style={{ fontSize: 19, fontWeight: 900, color: tone, marginTop: 3, whiteSpace: "nowrap" }}>{hasVal ? val : "—"}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9CA3AF", marginTop: 2, whiteSpace: "nowrap", minHeight: 13 }}>
                      {goalStr ? `goal ${goalStr}` : ""}
                    </div>
                    {/* ★ Only the rows whose window is NOT the header's. Wraps on
                        purpose — this is the least important line in the cell, so
                        it gives way on a narrow phone instead of clipping the way
                        a nowrap line would. Rendered even when the value is "—":
                        the window is a fact about the metric, not about today's
                        number, and a reader deciding whether to chase a blank
                        still wants to know what it would have covered. */}
                    {row.basis ? (
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: "#B6BCC6", marginTop: 1, lineHeight: 1.25 }}>
                        {row.basis}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {(() => {
              const dated = KPI_ROWS
                .map((row) => {
                  const cell = (scorecard && scorecard[row.id]) || {};
                  return { label: row.label, when: asOfLabel(cell.asOf), held: !!cell.held, stale: staleDaysSince(cell.at) };
                })
                .filter((x) => x.when || x.held || x.stale);
              if (!dated.length) return null;
              /* ⚠️ STALE JOINS `held` IN THE RED, and does not get a colour of
                 its own. They are the same message to a reader: do not trust
                 this number yet. A third colour on one caption line would be
                 three things to learn instead of two. */
              const anyOld = dated.some((x) => x.held || x.stale);
              return (
                <div style={{ fontSize: 10.5, fontWeight: 700, color: anyOld ? "#B91C1C" : "#9CA3AF", marginTop: 7, lineHeight: 1.4 }}>
                  {/* Stale wins the wording when both apply: how old it is
                      matters more than which day it happens to cover. */}
                  {dated.map((x) => (
                    x.stale ? `${x.label} last published ${x.stale} days ago`
                            : `${x.label} ${x.held ? "held" : "as of"}${x.when ? ` ${x.when}` : ""}`
                  )).join(" · ")}
                </div>
              );
            })()}
          </div>
        )}

        {/* ★ THE TOOLS SIT DIRECTLY UNDER THE KEY METRICS (Nick, Aug 8 2026:
           "Please move these up, directly under the key metrics. And move the
           Leader Scorecard to the bottom of my dashboard."). Matt: apply it to
           every view, not just his.
           Pinned and the section grid used to sit twelve blocks down, below the
           playbooks, the health ring, today's status, input health, the digest,
           the leader board and the money cards — so reaching any TOOL meant
           scrolling past every READOUT. The readouts are still all here, just
           below the thing people open the Hub to do.
           ⚠️ ORDER ONLY. Not one render condition changed. Every block from the
           search bar down is gated on !openSection, so with a tool open none of
           this renders and the open-tool view is byte-identical to before.
           🐛 THIS COMMENT SHIPPED AS VISIBLE TEXT (Aug 8 2026). It went in as a
           bare block comment instead of one wrapped in braces. Among JSX
           CHILDREN an unwrapped block comment is not a comment at all, it is a
           text node. Eleven lines of it printed on every dashboard in the
           store, under the KPI cards, until Matt sent a screenshot.
           (Writing THIS note then broke the build a second time, because the
           first draft quoted the two delimiters literally and the closing one
           ended the comment early. Describe them, never type them.)
           ⚠️ ALL SIX CHECKS PASSED ON IT, and they were right to: it parses,
           every name resolves, no hook moved. Valid JSX that renders the wrong
           thing is outside what they can see. The build was green too.
           ⚠️ THE TELL WAS AVAILABLE AND I DID NOT LOOK. I verified this deploy
           by byte-comparing the bundle and grepping for leaked figures, both of
           which passed. Neither one can see the page. A change to what RENDERS
           needs someone to look at what rendered. */}
        {/* ── Pinned ───────────────────────────────────────────────
            Bri's ask. Sits ABOVE the section grid and only renders when the
            person has pins, so it costs nothing for everyone who doesn't use
            it. "Edit pins" flips every tile into a pick-list rather than
            adding a second control to each card. */}
        {signedIn && !openSection && !searching && (pinnedTools.length > 0 || pinMode) && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "#5B6474" }}>Pinned</div>
              <div style={{ flex: 1 }} />
              <button onClick={() => setPinMode((v) => !v)}
                style={{ border: "1px solid #E4E3DD", background: pinMode ? "#14243D" : "#fff", color: pinMode ? "#fff" : "#5B6474",
                  borderRadius: 20, padding: "4px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                {pinMode ? "Done" : "Edit pins"}
              </button>
            </div>
            {pinnedTools.length === 0 ? (
              <div style={{ fontSize: 13.5, color: "#5B6474", padding: "2px 0 4px" }}>
                Tap any tile below to pin it here.
              </div>
            ) : (
              <div style={TILE_GRID}>
                {pinnedTools.map((tool) => (
                  <Tile key={tool.id} tool={tool} color={tool.color} badge={badgeFor(tool.id)} inputStatus={toolInputStatus[tool.id]}
                    pinMode={pinMode} isPinned onTogglePin={togglePin}
                    onClick={() => openTool(tool)} />
                ))}
              </div>
            )}
          </div>
        )}
        {signedIn && !openSection && !searching && pinnedTools.length === 0 && !pinMode && (
          <div style={{ marginBottom: 14, textAlign: "right" }}>
            <button onClick={() => setPinMode(true)}
              style={{ border: "1px solid #E4E3DD", background: "#fff", color: "#5B6474", borderRadius: 20, padding: "4px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              Pin tiles
            </button>
          </div>
        )}

        {/* ── 3-tile landing → drill into a section ──────────────── */}
        {!openSection && !searching ? (
          /* ⚠️ marginBottom EXISTS BECAUSE THIS IS NO LONGER THE LAST BLOCK
             (Aug 8 2026). The grid sat at the very bottom of the dashboard for
             its whole life, so it never needed to space itself from anything.
             Moving it under the KPI strip put Company Health directly beneath
             it and the two rendered flush against each other. 18 matches the
             Pinned block above it. */
          <div style={{ ...TILE_GRID, marginBottom: 18 }}>
            {shownSections.map((section) => {
              /* 🐛 `featureOn` WAS MISSING HERE (Matt, Aug 12 2026: "Why is
                 something locked for me. I should see everything."). He is the
                 owner at tier 3 and the People & Team card read "4 tools · 1
                 locked". The one was Tokens, which this store ships switched OFF —
                 so nothing was locked and there was nothing to unlock.
                 ⚠️ THE RULE ALREADY EXISTED AND THIS COUNT DID NOT FOLLOW IT. See
                 featureOn's own note: a feature the store switched off is not
                 locked, it does not exist, and calling it locked sends somebody to
                 ask HR for access to a thing nobody can grant — which is exactly
                 what Bri did on Aug 11.
                 ⚠️ SO THE NUMBER POINTED AT NOTHING. Opening the section showed no
                 "Locked here" block at all, because that list filters correctly —
                 a padlock you cannot find is worse than a padlock.

                 ⚠️⚠️ THIS COMMENT SAID "AND ONLY HERE" AND THAT WAS WRONG WITHIN A
                 DAY. `shownSections`'s signed-out branch was missing it too, found
                 Aug 13. The same question — "has the store switched this feature
                 off?" — is asked at FOUR surfaces now, and it has been answered
                 wrongly at three of them on three separate days:
                   · `canUseTool`      the chokepoint, correct since Aug 11
                   · `lockedTools` / `sectionLocked`   fixed Aug 11
                   · this count                        fixed Aug 12
                   · `shownSections` signed out        fixed Aug 13
                 ⚠️ IF YOU ADD A FIFTH SURFACE THAT DECIDES WHAT TO DRAW, IT NEEDS
                 THE FLAG. Not because of a rule, because this has now cost four
                 days. Anything that renders a tile, counts one, or names one goes
                 through `canUseTool` or `featureOn` — never through raw SECTIONS. */
              const lockedCount = onlyFor(user) ? 0 : SECTIONS.find((s) => s.label === section.label).tools.filter((t) => signedIn && featureOn(t) && !canUseTool(t, tier, user)).length;
              // Per-category urgency: a count plus a severity tone —
              //   red   = something overdue / urgent
              //   amber = needs attention (due soon, not yet entered)
              //   green = monitored and currently clear
              //   null  = not monitored (no badge at all)
              // Only People & Team and Money are monitored; the other sections
              // have no computed signal, so they never show a status badge.
              let badge = 0;
              let badgeTone = null; // "red" | "amber" | "green" | null
              /* ★ THE MOST URGENT REAL ITEM, NOT A TOOL COUNT (Matt, Aug 5 2026:
                 "Replace the count with the most urgent real item in that
                 section when one exists, falling back to the count when nothing
                 is outstanding").
                 "People & Team · 3 tools" is true and useless. It is the same
                 sentence every day whether three evaluations are overdue or
                 none are, so the card can only ever be read as decoration. A
                 leader scanning this on a shared iPad needs it to say what is
                 wrong, or say nothing.
                 ⚠️ ONE ITEM, AND IT IS signals[0]. The array is ordered
                 most-urgent-first and only the head is shown. Joining them is
                 exactly what this replaced: "1 overdue · 2 due this week · 1
                 unsigned" is a list to parse, not an answer.
                 ⚠️ NO NEW DATA, NO NEW READ. Every signal below comes off
                 `pulse`, `pendingRecs` and `daily`, all of which this page
                 already holds. Sections with no cheap signal keep the count,
                 which is why the fallback stays rather than becoming an empty
                 line. */
              const signals = [];
              // The one line under the section name. Still named badgeLabel
              // because the pill beside it is the same signal counted; it now
              // holds signals[0] rather than every signal joined. Empty means
              // nothing is outstanding, and the render falls back to the tool
              // count.
              let badgeLabel = "";
              /* 🐛 THE LABEL NEVER MATCHED. This read `section.label === "Team"`,
                 but the section is called "People & Team" — so this whole badge
                 has never rendered once. Overdue evaluations, evaluations due
                 this week and unsigned handbooks were all being counted and then
                 silently thrown away. */
              /* ⚠️⚠️ MATCHED ON THE ICON KEY, NOT THE LABEL, AND THE SCAR IS
                 TEN LINES ABOVE: "🐛 THE LABEL NEVER MATCHED. This read
                 section.label === 'Team'". A section's label is display text —
                 it got renamed once and this branch silently stopped firing,
                 with no error and nothing on screen to notice. Renaming Money
                 to The Numbers today would have done it a second time, killing
                 the daily-entry badge for every Director. `icon` is a stable
                 key nobody edits for wording. */
              if (section.icon === "sec:people" && tier >= 3) {
                badge = pulse.evalsOverdue + pulse.evalsDue + pulse.handbookUnsigned;
                badgeTone = badge > 0 ? (pulse.evalsOverdue > 0 ? "red" : "amber") : pulseLoaded ? "green" : null;
                /* Order is the urgency claim: something already late outranks
                   something due, which outranks paperwork nobody is waiting on.
                   Each names its own unit — "1 overdue" never said overdue
                   what. */
                if (pulse.evalsOverdue > 0) signals.push(countLabel(pulse.evalsOverdue, "overdue evaluation", "overdue evaluations"));
                if (pulse.evalsDue > 0) signals.push(`${countLabel(pulse.evalsDue, "evaluation", "evaluations")} due this week`);
                if (pulse.handbookUnsigned > 0) signals.push(countLabel(pulse.handbookUnsigned, "unsigned handbook", "unsigned handbooks"));
              }
              /* ★ THE ALERT TRAIL STARTS HERE (Bri, Jul 27): "it needs to start
                 on the main tile 'People & Team' or it will not be caught by the
                 leaders." A pending recommendation sat three screens deep with a
                 badge only on the middle one, so nobody tripped over it.
                 ⚠️ OUTSIDE THE `tier >= 3` GATE ON PURPOSE — the people asked for
                 recommendations are Team Leaders, tier BELOW 3. Folding this into
                 the block above would hide it from exactly the people it is for,
                 which is the same mistake `badgeFor` already documents. */
              if (section.icon === "sec:people" && pendingRecs > 0) {
                badge += pendingRecs;
                badgeTone = badgeTone === "red" ? "red" : "amber";
                signals.push(`${countLabel(pendingRecs, "recommendation", "recommendations")} to write`);
              }
              /* ★ AND THE SAME TRAIL FOR MONTHLY GOALS (Bri, Jul 30): "an Alert
                 trail similar to the applications that starts on Peak Reachers,
                 then the Team Goals, and lands on Submissions (AD Only)."
                 ⚠️ OUTSIDE THE `tier >= 3` GATE, for the same reason as the line
                 above: Assistant Directors are tier 2, so anything inside that
                 block is invisible to every person this is for. */
              if (section.icon === "sec:people" && goalsDue > 0) {
                badge += goalsDue;
                badgeTone = badgeTone === "red" ? "red" : "amber";
                signals.push(`${countLabel(goalsDue, "team goal", "team goals")} to submit`);
              }
              /* ★ AND A DOCUMENT WAITING FOR A SIGNATURE, on the same trail.
                 ⚠️ RED, NOT AMBER. The other two on this section are work
                 somebody owes by a date. This one is a policy they have been
                 asked to read and have not, which is the one on this screen
                 that can matter to the store rather than only to them.
                 ⚠️ OUTSIDE THE TIER GATE, same as the two above and for a
                 stronger reason: this reaches every tier there is. */
              if (section.icon === "sec:people" && docsToSign > 0) {
                badge += docsToSign;
                badgeTone = "red";
                /* 🐛🐛 UNSHIFT, NOT PUSH, AND THAT ONE WORD IS THE BUG.
                   Bri, Aug 21 2026: "I see a red digit, but I don't see any
                   wording that tells me where to go."

                   Only `signals[0]` is ever rendered — see badgeLabel below.
                   This was the SIXTH signal pushed onto People, behind overdue
                   evaluations, evaluations due, unsigned handbooks, pending
                   recommendations and team goals. And it is the only one that
                   sets the tone UNCONDITIONALLY.

                   ⇒ So a leader with one document to sign and two evaluations
                   due saw a RED badge reading "2 evaluations due this month".
                   The redness came from the document. The wording came from
                   something else. Nothing on the screen named the thing that
                   made it red, which is exactly what she reported.

                   ⚠️ THE RULE, NOT THE SPECIAL CASE: whatever set the tone has
                   to be what the line says. This is the only signal here that
                   forces red on its own, so it is the only one that has to
                   lead. If a second one ever does, it needs the same
                   treatment and this comment is the reason why. */
                signals.unshift(`${countLabel(docsToSign, "document", "documents")} to sign`);
              }
              if (section.icon === "sec:money" && tier >= 3 && daily) {
                badge = (!daily.sales ? 1 : 0) + (!daily.hours ? 1 : 0) + (!daily.giveaways ? 1 : 0) + ((daily.gvZeroSides || []).length ? 1 : 0) + (daily.eomYm ? 1 : 0) + (daily.guestYm ? 1 : 0);
                badgeTone = badge > 0 ? "amber" : "green";
                /* Same running order the count above already sums in, so the
                   headline and the number can never tell different stories.
                   Yesterday's three entries first because everything
                   downstream waits on them, then the anomaly, then the two
                   month-boundary ones. */
                if (!daily.sales) signals.push("Sales not entered");
                if (!daily.hours) signals.push("Hours not entered");
                if (!daily.giveaways) signals.push("Giveaways not entered");
                /* gvZeroSides holds "food" / "paper" lowercase, and this line
                   starts the card's only sentence, so it is capitalised here
                   rather than in the loader — the loader's values are used
                   mid-sentence elsewhere. */
                if ((daily.gvZeroSides || []).length) {
                  const sides = (daily.gvZeroSides || []).join(" and ");
                  signals.push(`${sides.charAt(0).toUpperCase()}${sides.slice(1)} showing zero`);
                }
                if (daily.eomYm) signals.push("Month-end counts not entered");
                if (daily.guestYm) signals.push("Guest scores not entered");
              }
              /* The fallback lives here, not in the JSX, so there is one place
                 that decides what this line says. */
              badgeLabel = signals[0] || "";
              const toneColor = badgeTone === "red" ? RED : badgeTone === "amber" ? AMBER : badgeTone === "green" ? GREEN : null;
              return (
                <button
                  key={section.label}
                  /* Stamp where the dashboard was before drilling in. This is
                     the transition that was never stamped, which is why backing
                     out of a section always landed at the top. */
                  onClick={() => { dashScrollY.current = window.scrollY; setOpenSection(section.label); }}
                  style={{
                    /* The section card is the layer the tool tiles sit ON, so it
                       takes the BACK surface — lit from the opposite corner and
                       fading to nothing, so the tiles standing on it catch the
                       light and it does not compete with them. Accent on the top
                       and left like everything else. */
                    textAlign: "left", background: cardSurfaceBack(section.color), cursor: "pointer",
                    border: "1px solid #E5E7EB", ...accentEdge(section.color, 3),
                    // Severity rides the TOP border, identity rides the LEFT.
                    // Money's section color IS red, so a red left border above a
                    // green all-clear check read as a contradiction. Recoloring
                    // the left border would fix the clash by destroying the
                    // section coding — so severity moves to the top edge, which
                    // is already how the KPI cells above signal pass/miss.
                    // Unmonitored sections get no top rule at all.
                    // ⚠️ ALWAYS 3px. Matt, Jul 25: "I really want these the same
                    // size." A monitored section drew a 3px severity rule and an
                    // unmonitored one drew 1px, so the five cards sat at three
                    // different heights depending on what happened to be flagged
                    // that morning — the grid looked broken rather than informative.
                    // Unmonitored keeps the plain border colour, so nothing gains a
                    // stripe it hasn't earned; only the thickness is equalised.
                    /* 🐛 THE TWO EDGES DISAGREED, AND IT LOOKED LIKE A MISTAKE
                       (Matt, Aug 4 2026, looking at the live dashboard).
                       The rule above was deliberate — severity on the top,
                       identity on the left — and it made sense when these were
                       the only cards with coloured edges. Every card in the Hub
                       now carries a matching top-and-left accent, so Money
                       showing a teal top over a red left stopped reading as
                       information and started reading as a bug.
                       ⇒ Both edges carry the section colour. Severity is not
                       lost: the badge on the right already says it, in the same
                       tones, and says it in words and a count rather than a
                       stripe somebody has to decode.
                       ⚠️ STILL ALWAYS 3px, which is the part that matters. Matt,
                       Jul 25: "I really want these the same size." A monitored
                       section used to draw 3px and an unmonitored one 1px, so
                       the cards sat at different heights depending on what
                       happened to be flagged that morning. */
                    borderTop: `3px solid ${section.color}`,
                    // SLIMMER — Jul 26. Padding and the row gap tightened to match
                    // the tile cards. The equal-height machinery above (always-3px
                    // top border, reserved badge height) is untouched — that is what
                    // keeps the five cards identical, and shrinking them must not
                    // reintroduce the ragged grid it was built to fix.
                    borderRadius: 12, padding: "9px 13px",
                    boxShadow: CARD_3D,
                    // ★ Jul 26 — SAME SHAPE AS Tile, not just the same padding.
                    // These read as a different kind of card while they stacked
                    // two rows against the tiles' one. Now: colour chip left,
                    // title over one meta line, status right — the identical
                    // three-slot row Tile uses, so the whole grid is one object.
                    display: "flex", alignItems: "center", gap: 10,
                  }}
                >
                  {/* Mirrors Tile's 30px icon square, so both card types sit at
                      the same height without either one hard-coding a pixel
                      total. Change the icon size in Tile and change it here. */}
                  <span style={{
                    width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                    background: `${section.color}14`,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {/* 🐛 THIS WAS AN 11px COLOURED SQUARE (Matt, Aug 7 2026:
                        "the emblems in tools"). The tool tiles directly below
                        these cards put a real glyph in the same 30x30 tinted
                        box, so a bare swatch next to a wrench and a shield read
                        as a placeholder somebody forgot to finish rather than a
                        deliberate choice.
                        ⚠️ FALLS BACK TO THE SQUARE. Icon renders whatever
                        `paths[id]` holds, and for an unknown id that is nothing
                        at all — an empty svg in a tinted box, which is exactly
                        the bug that left one tile blank until its glyph was
                        added. A section added later without an `icon` gets the
                        old swatch rather than an empty hole. */}
                    {section.icon
                      ? <Icon id={section.icon} color={section.color} size={18} />
                      : <span style={{ width: 11, height: 11, borderRadius: 3, background: section.color }} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* ⚠️ ONE LINE, ENFORCED. "Weekly Operations" wrapped to two
                        while "Daily Operations" fit on one, so that card sat
                        taller than the rest — the ragged grid coming back
                        through the title instead of the border. nowrap makes
                        the height independent of the name's length. */}
                    <div style={{ fontSize: 14.5, fontWeight: 800, color: INK, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{section.label}</div>
                    {/* One clamped line, same as Tile's description, so a long
                        badge label can never make one card taller than the rest. */}
                    <div style={{
                      fontSize: 12, color: "#6B7280", marginTop: 1, lineHeight: 1.35,
                      display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 1,
                      overflow: "hidden", minHeight: "1.35em",
                    }}>
                      {/* ★ THE ITEM REPLACES THE COUNT, it does not join it.
                          "3 tools · 1 overdue evaluation" buries the only part
                          worth reading behind the part that never changes. */}
                      {badgeLabel || `${section.tools.length} tool${section.tools.length === 1 ? "" : "s"}`}
                      {lockedCount > 0 ? ` · ${lockedCount} locked` : ""}
                    </div>
                  </div>
                  {/* The right slot Tile gives its locked pill. Severity keeps
                      priority over the affordance: a section that is reporting
                      shows its count or its all-clear check, and only a quiet
                      one shows "Open →". The whole card is a button either way,
                      so nothing becomes unreachable when the badge takes the slot.
                      ⚠️ 20px matches the chip and the type — the always-3px top
                      border above is what actually equalises these five, and
                      that is deliberately untouched. */}
                  {toneColor && badgeTone !== "green" ? (
                    <span style={{ minWidth: 20, height: 20, borderRadius: 999, background: toneColor, color: "#fff", fontSize: 12, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 7px", flexShrink: 0 }}>
                      {badge}
                    </span>
                  ) : badgeTone === "green" ? (
                    <span style={{ width: 20, height: 20, borderRadius: 999, background: `${GREEN}18`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    </span>
                  ) : (
                    /* ★ "Open →" REMOVED, and the 20px it occupied is RESERVED.
                       It was costing the title ~60px of the middle column,
                       which is what forced "Weekly Operations" onto two lines.
                       The whole card is a button and the tiles carry no such
                       label, so the affordance was redundant — but the space
                       still has to be held, or a card with a badge would give
                       its title less room than one without and the two would
                       wrap differently. Reserved, not removed. */
                    <span style={{ width: 20, height: 20, flexShrink: 0 }} />
                  )}
                </button>
              );
            })}
          </div>
        ) : openSection ? (
          (() => {
            const section = shownSections.find((s) => s.label === openSection) || SECTIONS.find((s) => s.label === openSection);
            const sectionLocked = signedIn && !onlyFor(user)
              ? SECTIONS.find((s) => s.label === openSection).tools.filter((t) => featureOn(t) && !canUseTool(t, tier, user)).map((t) => ({ ...t, color: section.color }))
              : [];
            return (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <button
                    onClick={() => setOpenSection(null)}
                    style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "8px 14px", fontSize: 13.5, fontWeight: 800, color: "#374151", cursor: "pointer" }}
                  >
                    ← All tools
                  </button>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: section.color }} />
                  <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: INK }}>
                    {section.label}
                  </span>
                </div>
                <div style={TILE_GRID}>
                  {(section.tools || []).map((tool) => (
                    <Tile
                      key={tool.id}
                      tool={tool}
                      color={section.color}
                      locked={!canUseTool(tool, tier, user)}
                      badge={badgeFor(tool.id)}
                      inputStatus={toolInputStatus[tool.id]}
                      pinMode={pinMode}
                      isPinned={pinned.includes(tool.id)}
                      onTogglePin={togglePin}
                      onClick={() => openTool(tool)}
                    />
                  ))}
                </div>
                {sectionLocked.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <button
                      onClick={() => setLockedOpen(!lockedOpen)}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: "4px 0", marginBottom: lockedOpen ? 10 : 0 }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6B7280" }}>
                        Locked here ({sectionLocked.length})
                      </span>
                      <span style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 700 }}>
                        {lockedOpen ? "hide ▲" : "show ▼"}
                      </span>
                    </button>
                    {lockedOpen && (
                      <div style={TILE_GRID}>
                        {sectionLocked.map((tool) => (
                          <Tile key={tool.id} tool={tool} color={tool.color} locked badge={0} onClick={() => openTool(tool)} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()
        ) : null}

        {/* ── Metric playbooks — "how to work the red numbers" ────────
              const misses = KPI_ROWS.filter((row) => {
                const cell = (scorecard && scorecard[row.id]) || null;
                const hasVal = cell && cell.actual !== null && cell.actual !== undefined && String(cell.actual).trim() !== "";
                return hasVal && cell.hit === false && METRIC_PLAYBOOKS[row.id];
              });
              if (misses.length === 0) return null;
              return (
                <div style={{ marginTop: 8, background: cardSurface(PEAK, 0.4), border: "1px solid #E5E7EB", ...accentEdge(PEAK, 3), borderRadius: 12, boxShadow: CARD_3D_SOFT }}>
                  <button
                    onClick={() => setPlaybookOpen((v) => !v)}
                    style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: RED, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 800, color: INK }}>
                      How to work the red number{misses.length === 1 ? "" : "s"}
                    </span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: "#9CA3AF" }}>{playbookOpen ? "hide ▲" : "show ▾"}</span>
                  </button>
                  {playbookOpen && misses.map((row) => {
                    const pb = METRIC_PLAYBOOKS[row.id];
                    return (
                      <div key={row.id} style={{ borderTop: "1px solid #EEF0F2", padding: "10px 14px 12px" }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: RED }}>{pb.label} · {pb.when}</div>
                        {pb.steps.map((s, i) => (
                          <div key={i} style={{ display: "flex", gap: 8, marginTop: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: "#9CA3AF", flexShrink: 0 }}>{i + 1}.</span>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: INK, lineHeight: 1.45 }}>{s}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Metric playbooks — "how to work the red numbers" ────────
              Static teaching checklists (metricPlaybooks.js), shown ONLY for
              rows that are a REAL miss right now: a published actual AND
              hit === false AND a playbook exists. A blank/closed-day metric
              never appears (inherits the closed-days rule for free); zero
              height when everything is on goal. */}
        {/* ⛔ OFF THE DASHBOARD (Matt, Aug 4 2026: "Let's remove how the red
            numbers work for now"). Gated, not deleted — "for now" is not
            "never" and metricPlaybooks.js is real written content. Flip
            SHOW_METRIC_PLAYBOOKS to bring it back exactly as it was.
            ⚠️ THE GATE GOES HERE, on the LIVE condition. The block of prose
            directly above is a COMMENTED-OUT copy of this same code, and an
            edit landing in that copy compiles as a comment right up until its
            closing marker lands early and takes the rest of the file with it.
            Cost one run to learn. */}
        {SHOW_METRIC_PLAYBOOKS && !openSection && !searching && tier >= 3 && (() => {
          const misses = KPI_ROWS.filter((row) => {
            const cell = (scorecard && scorecard[row.id]) || null;
            const hasVal = cell && cell.actual !== null && cell.actual !== undefined && String(cell.actual).trim() !== "";
            return hasVal && cell.hit === false && METRIC_PLAYBOOKS[row.id];
          });
          if (misses.length === 0) return null;
          return (
            <div style={{ marginTop: 10, background: cardSurface(PEAK, 0.5), border: "1px solid #E5E7EB", ...accentEdge(PEAK, 3), borderRadius: 12, boxShadow: CARD_3D }}>
              <button
                onClick={() => setPlaybookOpen((v) => !v)}
                style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 999, background: RED, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 800, color: INK }}>
                  How to work the red number{misses.length === 1 ? "" : "s"}
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "#9CA3AF" }}>{playbookOpen ? "hide ▲" : "show ▾"}</span>
              </button>
              {playbookOpen && misses.map((row) => {
                const pb = METRIC_PLAYBOOKS[row.id];
                return (
                  <div key={row.id} style={{ borderTop: "1px solid #EEF0F2", padding: "10px 14px 12px" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: RED }}>{pb.label} · {pb.when}</div>
                    {pb.steps.map((s, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, marginTop: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#9CA3AF", flexShrink: 0 }}>{i + 1}.</span>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: INK, lineHeight: 1.45 }}>{s}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── Company Health ring ─────────────────────────────────────
              One glance number: of the metrics reporting, how many on goal.
              Same eos:scorecard feed as the strip above. Renders only when at
              least one row is reporting (computeHealth → null otherwise), so it
              never shows a fake 0 on a cold or fully-unentered feed. Tapping
              opens the EOS tile, same as the strip cells. ─ */}
        {!openSection && !searching && tier >= 3 && (() => {
          const h = computeHealth(scorecard);
          if (!h) return null;
          // Band on the SAME thresholds the strip/section badges use: a store
          // clearing most of its goals reads green; missing more than half reads
          // red. Amber between. Purely a color for the number — the honest data
          // is the "N of M on goal" line under it, which is never a judgment.
          const band = h.pct >= 80 ? GREEN : h.pct >= 50 ? "#B45309" : RED;
          const C = 2 * Math.PI * 34; // ring circumference, r=34
          const dash = (h.pct / 100) * C;
          return (
            <div
              style={{
                background: "#fff", border: "1px solid #E5E7EB", borderLeft: `3px solid ${band}`, borderTop: `3px solid ${band}`,
                borderRadius: 14, marginBottom: 14, boxShadow: CARD_3D_SOFT, overflow: "hidden",
              }}
            >
              <button
                onClick={() => setHealthOpen((v) => !v)}
                style={{
                  width: "100%", textAlign: "left", cursor: "pointer", background: "transparent", border: "none",
                  padding: "16px 18px", display: "flex", alignItems: "center", gap: 18,
                }}
              >
                <div style={{ position: "relative", width: 84, height: 84, flexShrink: 0 }}>
                  <svg width="84" height="84" viewBox="0 0 84 84">
                    <defs>
                      <linearGradient id={`hgrad-${band.replace("#","")}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={band} stopOpacity="0.75" />
                        <stop offset="100%" stopColor={band} />
                      </linearGradient>
                      <filter id="hglow" x="-40%" y="-40%" width="180%" height="180%">
                        <feGaussianBlur stdDeviation="2.4" result="b" />
                        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                    </defs>
                    <circle cx="42" cy="42" r="34" fill="none" stroke="#EEF0F2" strokeWidth="9" strokeLinecap="round" />
                    <circle
                      cx="42" cy="42" r="34" fill="none" stroke={`url(#hgrad-${band.replace("#","")})`} strokeWidth="9" strokeLinecap="round"
                      strokeDasharray={`${dash} ${C - dash}`} transform="rotate(-90 42 42)" filter="url(#hglow)"
                    />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 24, fontWeight: 900, color: band, lineHeight: 1 }}>{h.pct}</span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: "#9CA3AF", letterSpacing: "0.06em" }}>OF 100</span>
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", color: "#9CA3AF", textTransform: "uppercase" }}>Company Health</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: INK, marginTop: 3, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span>{h.hits} of {h.reporting} on goal</span>
                    {(() => {
                      // Plain-language handle so "what does 60 mean?" is answered on
                      // screen. Same word-set as the leader scorecard, on the 0-100
                      // health scale: Strong 80+ · On track 60-79 · Watch 40-59 ·
                      // Needs work under 40.
                      const w = h.pct >= 80 ? "Strong" : h.pct >= 60 ? "On track" : h.pct >= 40 ? "Watch" : "Needs work";
                      return <span style={{ fontSize: 12.5, fontWeight: 800, color: band }}>{w}</span>;
                    })()}
                  </div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "#9CA3AF", marginTop: 2 }}>
                    {h.reporting < h.total ? `${h.reporting} of ${h.total} metrics reporting` : "all metrics reporting"} · {healthOpen ? "hide ▲" : "which ones ▾"}
                  </div>
                </div>
              </button>
              {healthOpen && (
                <div style={{ borderTop: "1px solid #EEF0F2", padding: "10px 18px 14px" }}>
                  {h.rows.map((r) => {
                    const rowColor = !r.reporting ? "#9CA3AF" : r.hit ? GREEN : RED;
                    const rowText = !r.reporting ? "Not reporting yet" : r.hit ? "On goal" : "Off goal";
                    return (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>{r.label}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: rowColor, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: rowColor }}>{rowText}</span>
                        </span>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => openTool(toolById("eos"))}
                    style={{
                      marginTop: 8, background: "transparent", border: "none", cursor: "pointer", padding: "4px 0",
                      fontSize: 12.5, fontWeight: 800, color: PEAK,
                    }}
                  >
                    Open EOS →
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Today status block ──────────────────────────────────── */}
        {!openSection && !searching && (statusRows.length > 0 || allClear) && (
          /* ⚠️ THE BOX AGREES WITH ITS WORST ROW. It was hardcoded to AMBER
             whenever anything was outstanding, so a red row — an evaluation
             overdue, a giveaway total reset to $0 — sat inside an amber box
             telling the room it was an amber sort of day. statusRows is already
             sorted worst-first, so row zero IS the worst level and there is
             nothing to scan for.
             ⚠️ The box keeps NO tint of its own now. The rows carry the tint,
             and an amber wash under three differently-tinted rows muddied all
             three. White behind them, colour on them. */
          <div style={{ background: allClear ? `${GREEN}0A` : "#fff", border: "1px solid #E5E7EB", borderLeft: `3px solid ${allClear ? GREEN : levelColor(worstLevel)}`, borderTop: `3px solid ${allClear ? GREEN : levelColor(worstLevel)}`, borderRadius: 14, marginBottom: 14, boxShadow: CARD_3D, overflow: "hidden" }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", color: allClear ? GREEN : AMBER, textTransform: "uppercase", padding: "12px 14px 2px" }}>Today</div>
            {allClear ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px 13px" }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: GREEN, flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>Entries, evals and open lists are clear</span>
              </div>
            ) : (
              statusRows.map((r, i) => {
                const dot = levelColor(r.level);
                /* ★ THE ROW WEARS ITS LEVEL (Matt, Aug 5 2026: "Today's
                   Priorities rows currently read flat").
                   They were flat for a plain reason: the ONLY thing carrying
                   severity was an 8px dot, so an evaluation three weeks overdue
                   and a reminder to paste last month's AHA rendered as the same
                   white line. Now the row carries a tint of its own level and an
                   inset bar down its left edge, so the shape of the list reads
                   from across the counter before a word of it is read.
                   🐛 THE ROW HAD ITS OWN 3px BAR AND IT HAD TO GO (Matt, Aug 6
                   2026: "the today box underneath sticks out and looks a little
                   buggy"). The card ALREADY carries a 3px coloured border down
                   its left edge — that is the Hub's card language everywhere,
                   from Aug 4: "i want to see the back on the left and top". An
                   inset bar on every row stacked a second 3px stripe just inside
                   the first, so the left edge read as 6px of doubled rule, in TWO
                   DIFFERENT COLOURS whenever a row's level differed from the
                   card's worst. I flagged this exact risk while building it and
                   shipped it anyway.
                   The tint and the dot carry the level on their own, so the bar
                   was belt-and-braces that cost the card its edge.
                   ⚠️ 14 ON THE TINT — about 8%, up from 6% now that the bar is
                   not helping. Enough to separate three levels at arm's length on
                   an iPad, not enough to fight the text. Heavier and a list of
                   yellows starts looking like a warning in its own right. */
                return (
                  <button
                    key={r.text}
                    onClick={() => {
                      if (r.tab) { try { localStorage.setItem(FIN_LAST_TAB_KEY, r.tab); } catch {} }
                      openTool(toolById(r.id), r.props);
                    }}
                    style={{
                      width: "100%", textAlign: "left", background: `${dot}14`, cursor: "pointer",
                      border: "none", borderTop: i === 0 ? "none" : "1px solid #F1F3F5",
                      display: "flex", alignItems: "center", gap: 10, padding: "11px 14px",
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: INK }}>{r.text}</span>
                    {/* The sub-label and the money stack on the right. A column
                        wrapper is the only change to this side; the sub-label
                        itself is untouched, and a row with no impact renders one
                        child exactly as it did before. */}
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: dot, whiteSpace: "nowrap" }}>{r.sub} →</span>
                      {/* ⚠️ GUARDED ON THE VALUE, NOT ON THE KEY. A zero, a NaN
                          or a null must render nothing at all: "$0 food variance"
                          under a red row would read as a measured result rather
                          than as an absent number. rowImpact already refuses
                          those, and this repeats the test rather than trusting
                          it, because the render is the last place that can stop
                          a wrong figure reaching a leader.
                          No new colour: the row's own tone, dimmed. */}
                      {r.impact && Number.isFinite(r.impact.amount) && r.impact.amount > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: dot, opacity: 0.72, whiteSpace: "nowrap", marginTop: 1 }}>
                          {`$${Math.round(r.impact.amount).toLocaleString("en-US")} ${r.impact.note}`}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* ── Input health ────────────────────────────────────────
              The full register behind the Today block. Today shows what needs
              doing; this shows everything that is tracked, what it is not
              tracking, and — for the Executive Director seat — who owns what.

              Renders nothing for a person who owns no inputs. An empty panel
              is worse than no panel: it teaches people the thing is irrelevant
              to them, and then they stop reading the one that isn't. */}
        {!openSection && !searching && user && myInputs.length > 0 && (() => {
          // NO "N need you" HERE. It duplicated the Today block sitting directly
          // above — same rows, same count, two cards apart. This line describes
          // SCOPE (how much is watched); Today describes urgency.
          const openN  = myOpenLists.length;
          const untrN  = myInputs.filter((r) => r.state === "untracked").length;
          const trackN = myInputs.length - untrN - openN;
          const overseer = isOverseer(user);
          /* "offgoal" = the input IS entered and on time, but the number misses
             its target. Its own colour and word on purpose: green would call a
             cost overrun fine (paper cost read "CURRENT · 3.78%" against a
             3.27% goal), and "Needs you" would blame someone for a result and
             drag it into the Today block, which is for things that clear when
             a person acts. This one does not clear by being re-entered. */
          const CHIP = { late: AMBER, ok: GREEN, open: AMBER, offgoal: RED, info: "#6B7480", untracked: "#9AA3AE" };
          const CHIP_WORD = { late: "Needs you", ok: "Current", open: "Open", offgoal: "Off goal", info: "For reference", untracked: "Not tracked" };

          const Row = (r, key) => {
            const c = CHIP[r.state] || "#9AA3AE";
            // Off-goal rows tap through to the tile that holds the number, so
            // the next question — why — is one tap away rather than a hunt.
            const tappable = r.state === "late" || r.state === "open" || r.state === "offgoal";
            const body = (
              <>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: INK }}>
                    {r.label}
                    {/* ⚠️ NAME WHO IT BELONGS TO ON EVERY ROW THAT IS NOT YOURS.
                        Showing the whole store to everyone is only useful if a
                        row also says who to chase — otherwise it is a longer
                        list with no more meaning, which is worse than the short
                        one. "Yours" is the marker that keeps your own work
                        findable inside it. */}
                    {/* 🐛 "YOURS" MEANT NOTHING ON THE OVERSEER'S SCREEN (Matt,
                        Aug 7 2026, looking at his own dashboard with Equipment
                        Log, Food Quality and Food Safety all badged YOURS at
                        once). ownsRow short-circuits on `isOverseer(person)` and
                        returns true for EVERY row, so the badge said Yours about
                        all of them and "yours first" sorted nothing.
                        inputRegistry already carries the scar in words: it
                        "reads as everything is waiting on me".
                        ⇒ For an overseer, show WHO IT ACTUALLY BELONGS TO. He
                        asked to see what is not done, and a name is the half
                        that makes that actionable — the question after "this is
                        late" is always "who do I ask".
                        ⚠️ DISPLAY ONLY. `mine` still decides what the Today block
                        acts on and where the late push routes, and none of that
                        moves. This changes one badge, not who is responsible for
                        anything. */}
                    {r.mine && !overseer ? (
                      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", color: PEAK, marginLeft: 7, textTransform: "uppercase" }}>Yours</span>
                    ) : (r.owner && r.owner.label) ? (
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#9AA3AE", marginLeft: 7 }}>· {r.owner.label}</span>
                    ) : null}
                  </span>
                  <span style={{ display: "block", fontSize: 11.5, color: "#6B7480", marginTop: 1 }}>
                    {r.cadence}{r.note ? ` · ${r.note}` : ""}
                  </span>
                  {/* ★ WHERE THE NUMBER COMES FROM. Matt, Jul 29: "when this goes
                      to a second store this needs to tell the OPERATOR and ops
                      director exactly what to do and where to get it."
                      Knowing a row is late is useless to somebody who does not
                      know which report to open. Half of these live outside the
                      Hub entirely — CFA Now, Signal, CFA Supply, a time punch
                      report — and that knowledge existed nowhere but in Matt's
                      head.
                      ⚠️ ONLY ON ROWS THAT NEED ACTION. Printing the source under
                      every green row turns the register into a wall of text and
                      buries the two lines that matter. A row that is current
                      does not need telling where to go. */}
                  {r.how && (r.state === "late" || r.state === "open" || r.state === "offgoal" || r.state === "untracked") ? (
                    <span style={{ display: "block", fontSize: 11, color: "#8A93A0", marginTop: 3, lineHeight: 1.35 }}>
                      {r.how}
                    </span>
                  ) : null}
                  {/* ★ WHY IT MATTERS. Matt, Jul 29: it has to teach a new ops
                      director the job, not just list what is late. "Food
                      invoices not entered" means nothing to somebody who does
                      not know it makes food cost read LOW — which looks like
                      good news and is the reason nobody chases it.
                      ⚠️ Only on rows that need action, same as the source line.
                      A green board must stay readable at a glance. */}
                  {/* ★ VENDOR BRIDGE CANDIDATE. Matt, Jul 30 2026: he wants
                      anything importable to stand out so he can pitch it to Nick
                      and Corp. Shown on EVERY bridgeable row regardless of state
                      — unlike the source and consequence lines, which only appear
                      when a row needs action. The pitch is about the shape of the
                      work, not about whether today's number is late. */}
                  {r.bridge ? (
                    <span style={{ display: "inline-block", fontSize: 10, fontWeight: 800, letterSpacing: "0.04em",
                                   color: "#1E3A8A", background: "#EFF6FF", border: "1px solid #BFDBFE",
                                   borderRadius: 5, padding: "1px 6px", marginTop: 3 }}>
                      ⇄ {r.bridge} could send this
                    </span>
                  ) : null}
                  {r.feeds && (r.state === "late" || r.state === "offgoal" || r.state === "untracked") ? (
                    <span style={{ display: "block", fontSize: 11, color: "#A3ABB6", marginTop: 2, lineHeight: 1.35, fontStyle: "italic" }}>
                      {r.feeds}
                    </span>
                  ) : null}
                </span>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", color: c, textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {CHIP_WORD[r.state]}{tappable ? " →" : ""}
                </span>
              </>
            );
            /* ★ THE BOX CARRIES THE COLOUR UNTIL THE INPUT IS DONE.
               Matt, Aug 7 2026: "for the daily inputs add color in the boxes
               until completed?"

               Before this, every row in the register was the same flat white
               line and the only colour was the small word on the far right —
               so on a phone the thing you scan first, the shape of the row,
               said nothing at all.

               ⚠️ ONLY ROWS THAT NEED SOMEBODY. `tappable` is already exactly
               that set (late, open, off goal), which is why it is reused here
               instead of a second list that could drift from it. A row that is
               Current gets NO tint and goes back to plain white — that is the
               "until completed" half of the ask, and it is the half that makes
               the colour mean anything. This file already carries the scar for
               the opposite instinct two hundred lines up: colouring every row
               "turns the register into a wall of text and buries the two lines
               that matter".
               ⚠️ NO NEW COLOURS. `c` is the row's own chip colour, the one the
               word on the right is already wearing, at 6% for the fill. Same
               8-digit-hex trick the Today box uses for its green.
               ⚠️ THE TRANSPARENT LEFT BORDER IS LOAD-BEARING. Untinted rows
               keep the same 3px so text does not shift sideways as rows change
               state — without it a board going green visibly jumps. */
            const style = {
              width: "100%", textAlign: "left", border: "none",
              background: tappable ? `${c}0F` : "none",
              borderTop: "1px solid #F1F3F5",
              borderLeft: `3px solid ${tappable ? c : "transparent"}`,
              display: "flex", alignItems: "center",
              gap: 10, padding: "10px 14px 10px 11px",
              cursor: tappable ? "pointer" : "default",
            };
            return tappable ? (
              <button key={key} style={style} onClick={() => {
                if (r.tab) { try { localStorage.setItem(FIN_LAST_TAB_KEY, r.tab); } catch {} }
                openTool(toolById(r.tile), r.props);
              }}>{body}</button>
            ) : (
              <div key={key} style={style}>{body}</div>
            );
          };

          return (
            <div style={{ background: cardSurface(PEAK, 0.5), border: "1px solid #E5E7EB", borderLeft: `3px solid ${PEAK}`, borderTop: `3px solid ${PEAK}`, borderRadius: 14, marginBottom: 14, boxShadow: CARD_3D, overflow: "hidden" }}>
              <button
                onClick={() => setInputsOpen((v) => !v)}
                style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "12px 14px" }}
              >
                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", color: PEAK, textTransform: "uppercase" }}>Input health</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: INK }}>
                    {`${trackN} tracked`}
                    <span style={{ fontWeight: 600, color: "#6B7480" }}>
                      {`${openN ? ` · ${openN} open list${openN === 1 ? "" : "s"}` : ""}${untrN ? ` · ${untrN} not tracked` : ""}`}
                    </span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: PEAK }}>{inputsOpen ? "hide ▲" : "view ▾"}</span>
                </div>
              </button>

              {inputsOpen && (
                <div>
                  {/* ★ WHAT THE WORDS MEAN. Matt, Jul 29: it has to be usable by
                      a new ops director on day one, at a second store, with
                      nobody to ask.

                      Every row ends in one of six words — Current, Needs you,
                      Off goal, Open, Not tracked, For reference — and not one of
                      them was ever defined anywhere. They are obvious only to
                      the person who built them. "Off goal" and "Needs you" look
                      like the same kind of bad until you know one clears when
                      you type something and the other does not.

                      ⚠️ ALWAYS VISIBLE, NOT DISMISSIBLE. A first-time reader
                      dismisses things before they know whether they needed them,
                      and this is precisely for the person who has not learned
                      the screen yet. It costs one line. */}
                  <div style={{ padding: "0 14px 9px", fontSize: 11, color: "#9AA3AE", lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 800, color: PEAK }}>Needs you</span> = enter it and the row clears ·{" "}
                    <span style={{ fontWeight: 800, color: RED }}>Off goal</span> = entered, but the number missed target ·{" "}
                    <span style={{ fontWeight: 800, color: "#9AA3AE" }}>Not tracked</span> = nothing has ever been recorded ·{" "}
                    <span style={{ fontWeight: 800 }}>Yours</span> = you own it. Tap any row to open the tool that holds it.
                  </div>

                  {/* ★ THE PITCH, IN ONE LINE. Matt takes this to Nick and Corp.
                      Deliberately states the ASK as "stop retyping data CFA
                      already has" rather than "build us an integration" — the
                      first is a cost argument with evidence behind it, the second
                      is a favour. The count comes from the rows themselves, so it
                      cannot drift from what the register actually shows. */}
                  {bridge.count > 0 && (
                    <div style={{ margin: "0 14px 10px", padding: "9px 11px", borderRadius: 9,
                                  background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: "#1E3A8A" }}>
                        ⇄ {bridge.count} of {bridge.total} inputs are hand-keyed from systems that already hold the data
                      </div>
                      <div style={{ fontSize: 11, color: "#1E40AF", marginTop: 3, lineHeight: 1.45 }}>
                        {bridge.systems.map((sysName) => `${sysName} (${bridge.bySystem[sysName].length})`).join(" · ")}
                      </div>
                      <div style={{ fontSize: 10.5, color: "#3B5BA5", marginTop: 4, lineHeight: 1.45 }}>
                        Every one of these is a number a person retypes into the Hub from a Chick-fil-A
                        system. A vendor bridge would not create new data — it would stop the copying.
                      </div>
                    </div>
                  )}

                  {/* The toggle is for EVERYONE now, not just the overseer. The
                      whole point of showing the whole store is that anybody can
                      ask "who owns what" — gating the grouping put the answer
                      behind the seat least likely to need to ask. */}
                  {(
                    <div style={{ display: "flex", gap: 6, padding: "0 14px 10px" }}>
                      {[["needs", "All inputs"], ["cadence", "How often"], ["area", "By area"], ["owner", "By owner"]].map(([k, lab]) => (
                        <button key={k} onClick={() => setInputsView(k)}
                          style={{ fontSize: 11.5, fontWeight: 800, padding: "5px 10px", borderRadius: 999, cursor: "pointer",
                                   border: `1px solid ${inputsView === k ? PEAK : "#E5E7EB"}`,
                                   background: inputsView === k ? PEAK : "#fff",
                                   color: inputsView === k ? "#fff" : "#6B7480" }}>{lab}</button>
                      ))}
                    </div>
                  )}

                  {/* Open lists first — they were the two rows crowding Today,
                      and they read as a backlog to work down, not a to-do. */}
                  {inputsView !== "owner" && myOpenLists.length > 0 && (
                    <div>
                      <div style={{ padding: "9px 14px 5px", borderTop: "1px solid #F1F3F5", background: "#FAFBFC",
                                    fontSize: 11.5, fontWeight: 800, letterSpacing: "0.06em", color: PEAK, textTransform: "uppercase" }}>
                        Open lists
                      </div>
                      {myOpenLists.map((r, i) => Row(r, `open-${r.id}-${i}`))}
                    </div>
                  )}

                  {inputsView === "cadence"
                    ? (() => {
                        const groups = inputsByCadence(allInputs);
                        return CADENCE_BUCKETS.map((b) => {
                          const items = groups[b] || [];
                          if (!items.length) return null;   // an empty heading teaches people to skim
                          const shut = cadenceShut.has(b);
                          /* ⚠️ THE COUNT THAT MATTERS STAYS ON THE HEADER, so
                             collapsing a section can hide the detail but never
                             the fact that something in it needs doing. Hiding a
                             real miss is the one thing this whole panel exists
                             to prevent. */
                          const late = items.filter((r) => r.state === "late").length;
                          const off = items.filter((r) => r.state === "offgoal").length;
                          return (
                            <div key={b}>
                              <button
                                type="button"
                                onClick={() => setCadenceShut((prev) => {
                                  /* A NEW Set, never a mutated one. React compares
                                     by identity, and mutating in place renders
                                     nothing while looking correct. */
                                  const next = new Set(prev);
                                  if (next.has(b)) next.delete(b); else next.add(b);
                                  return next;
                                })}
                                style={{
                                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                                  padding: "9px 14px 8px", borderTop: "1px solid #F1F3F5",
                                  background: "#FAFBFC", border: "none", cursor: "pointer",
                                  textAlign: "left", fontFamily: "inherit",
                                }}
                              >
                                <span style={{ fontSize: 10, color: "#9AA3AE", width: 9 }}>{shut ? "▶" : "▼"}</span>
                                <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.06em", color: PEAK, textTransform: "uppercase" }}>{CADENCE_LABEL[b]}</span>
                                <span style={{ fontSize: 11.5, color: "#6B7480" }}>
                                  {items.length} input{items.length === 1 ? "" : "s"}
                                  {off ? ` · ${off} off goal` : ""}
                                  {late ? ` · ${late} need${late === 1 ? "s" : ""} you` : ""}
                                </span>
                              </button>
                              {!shut && items.map((r, i) => Row(r, `cad-${b}-${r.id}-${i}`))}
                            </div>
                          );
                        });
                      })()
                    : inputsView === "area"
                    ? inputsByArea(allInputs, areaOfRow).map((g) => (
                        <div key={g.label}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px 5px", borderTop: "1px solid #F1F3F5", background: "#FAFBFC" }}>
                            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.06em", color: PEAK, textTransform: "uppercase" }}>{g.label}</span>
                            <span style={{ fontSize: 11.5, color: "#6B7480" }}>
                              {g.items.length} input{g.items.length === 1 ? "" : "s"}
                              {g.offgoal ? ` · ${g.offgoal} off goal` : ""}
                              {g.late ? ` · ${g.late} late` : ""}
                            </span>
                          </div>
                          {g.items.map((r, i) => Row(r, `area-${g.label}-${r.id}-${i}`))}
                        </div>
                      ))
                    : inputsView === "owner"
                    ? inputsByOwner(allInputs).map((g) => (
                        <div key={g.label}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px 5px", borderTop: "1px solid #F1F3F5", background: "#FAFBFC" }}>
                            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.06em", color: PEAK, textTransform: "uppercase" }}>{g.label}</span>
                            <span style={{ fontSize: 11.5, color: "#6B7480" }}>
                              {g.items.length} input{g.items.length === 1 ? "" : "s"}{g.late ? ` · ${g.late} late` : ""}
                            </span>
                            {/* ★ NUDGE THE PERSON THE ROW ALREADY NAMES (Matt,
                                Aug 3 2026: "Nudge them"). Shown only where it
                                can actually work and actually help:
                                  · a SINGLE named person — a role, a shift or
                                    a co-owned pair has nobody specific to push
                                    to, and guessing one would be worse than
                                    offering nothing;
                                  · something genuinely LATE — there is no such
                                    thing as a useful nudge about a green row;
                                  · tier 2 and up, matching the Worker's own
                                    rank gate, which is the real one. This test
                                    only hides a button that would be refused;
                                  · never yourself, which is always a mis-tap
                                    and burns the half-hour limit on the one
                                    person who did not need telling.
                                The message carries the row's OWN sentence, so
                                it says what is outstanding rather than "check
                                the Hub". */}
                            {(() => {
                              const own = g.items[0] && g.items[0].owner;
                              const solo = own && own.kind === "person" && !own.names && own.name ? own.name : null;
                              const late = g.items.find((i) => i.state === "late");
                              if (!solo || !late || tier < 2) return null;
                              if (user && user.name && normName(user.name) === normName(solo)) return null;
                              return <NudgeButton name={solo} what={late.text} />;
                            })()}
                          </div>
                          {g.items.map((r, i) => Row(r, `${g.label}-${r.id}-${i}`))}
                        </div>
                      ))
                    : (() => {
                        /* ⛔⛔ A BAND IS A HEADING, NOT A DIVIDER. IT MUST NAME
                           WHAT FOLLOWS IT.

                           Matt, Aug 21 2026, off his own dashboard. The "Open
                           lists" band above sits over ONE open list. In THIS
                           view every ordinary input then followed it with no
                           band of its own, so Daily sales, Labor hours and
                           Daily food cost were stacked under a heading reading
                           OPEN LISTS and read as open lists.

                           ⚠️ THE OTHER THREE VIEWS WERE NEVER WRONG, and that is
                           why this went unseen. Cadence, area and owner each
                           head every group they draw, so the open-lists band is
                           always closed off by the next heading. Only the
                           default view left it orphaned, and the default view
                           is the one everybody lands on.

                           ⚠️ THE COUNT IS OF THE ROWS THIS BAND HEADS, never of
                           the panel. That is what the other three bands do, and
                           for anybody who is not an overseer the two numbers
                           genuinely differ: the header counts THEIR inputs, the
                           list draws the whole board. A band that borrowed the
                           header's figure would print a number that does not
                           match what is under it. */
                        const rest = allInputs.filter((r) => r.state !== "open");
                        if (!rest.length) return null;   // an empty heading teaches people to skim
                        const late = rest.filter((r) => r.state === "late").length;
                        const off  = rest.filter((r) => r.state === "offgoal").length;
                        const untr = rest.filter((r) => r.state === "untracked").length;
                        return (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px 5px", borderTop: "1px solid #F1F3F5", background: "#FAFBFC" }}>
                              <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.06em", color: PEAK, textTransform: "uppercase" }}>
                                {myOpenLists.length ? "Everything else" : "All inputs"}
                              </span>
                              <span style={{ fontSize: 11.5, color: "#6B7480" }}>
                                {rest.length - untr} input{rest.length - untr === 1 ? "" : "s"}
                                {off ? ` · ${off} off goal` : ""}
                                {late ? ` · ${late} need${late === 1 ? "s" : ""} you` : ""}
                                {untr ? ` · ${untr} not tracked` : ""}
                              </span>
                            </div>
                            {rest.map((r, i) => Row(r, `${r.id}-${i}`))}
                          </div>
                        );
                      })()}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Morning digest — condensed to a "focus today" preview with an
              expandable full briefing, so it no longer eats a whole screen ─ */}
        {/* ⚠️ `aiSummaries` GATES THE CARD *AND* THE 7AM JOB, and both are
             needed. The job is what posts to Slack; this card only displays
             what it wrote. Gating one alone leaves a store that switched the
             feature off either getting a daily post it did not ask for, or
             staring at a card that never updates. See worker.js, job
             "ai-summary", for the other half. */}
        {storeCfg("features.aiSummaries") !== false && !openSection && !searching && tier >= 2 && digest && digest.text && (() => {
          const full = digest.text.trim();
          // ── "Updated {time}" — the digest is written ONCE by JOB 8 and served
          // all day, so the card has to say WHEN it was written or it silently
          // claims to be current at 6pm.
          //
          // Deliberately NOT an "as of {business day}" stamp: aiSummary.js's
          // collectFacts MIXES windows — eos:scorecard is quarter-to-date,
          // trainer tasks + equipment are this week, todos are prev-business-day,
          // evals/handbook are now. No single as-of date is true of the whole
          // card. generatedAt is the one honest claim it can make.
          //
          // ET, not browser-local: the store's clock is the one that matters.
          // If digest.date isn't today (a carried-over cache), show the date too
          // — that's the exact lie this stamp exists to prevent. Unparseable or
          // missing generatedAt → no stamp at all, never a wrong one.
          const gAt = digest.generatedAt ? new Date(digest.generatedAt) : null;
          const gOk = gAt && !Number.isNaN(gAt.getTime());
          const sameDay = !digest.date || digest.date === isoOfD(new Date());
          const stamp = !gOk ? null : gAt.toLocaleString("en-US", {
            timeZone: "America/New_York",
            ...(sameDay ? {} : { month: "short", day: "numeric" }),
            hour: "numeric", minute: "2-digit",
          });
          // Preview = the lead item only. The digest is now a BULLET LIST whose
          // first bullet is, by prompt contract, the single most consequential
          // thing on the board — so the collapsed card shows exactly that.
          //
          // Must be line-aware, not sentence-aware: bullets aren't required to
          // end in punctuation, so the old first-sentence regex would find no
          // terminator and fall back to a blind 170-char slice, cutting a bullet
          // mid-word. The prose branch is kept for any digest cached before the
          // bullet prompt shipped.
          const lines = full.split("\n").map((l) => l.trim()).filter(Boolean);
          const bulletCount = lines.filter((l) => /^[•\-*]\s/.test(l)).length;
          const isBullets = bulletCount >= 2;
          const m = full.slice(0, 200).match(/^[\s\S]*?[.!?](?=\s|$)/);
          const preview = (isBullets ? lines[0] : (m ? m[0] : full.slice(0, 170))).trim();
          const isLong = full.length > preview.length + 4;
          const shown = digestOpen || !isLong ? full : preview + " …";
          return (
            <div style={{ background: cardSurface(PEAK, 0.5), border: "1px solid #E5E7EB", borderLeft: `3px solid ${PEAK}`, borderTop: `3px solid ${PEAK}`, borderRadius: 14, padding: "13px 16px", marginBottom: 14, boxShadow: CARD_3D }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={PEAK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8-4.9-3.6-4.9 3.6 1.9-5.8L4 8.8h6.1z" />
                </svg>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", color: PEAK, textTransform: "uppercase" }}>Focus Today</span>
                {stamp && (
                  <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, color: "#9CA3AF", whiteSpace: "nowrap" }}>
                    Updated {stamp}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: INK, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{shown}</div>
              {isLong && (
                <button
                  onClick={() => setDigestOpen((o) => !o)}
                  style={{ marginTop: 8, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 800, color: PEAK }}
                >
                  {digestOpen ? "Show less ▲" : "Full briefing →"}
                </button>
              )}
            </div>
          );
        })()}

        {/* ── Peak Reachers · your leadership climb (tiers 1–2) ──────────
              Hidden for directors: they're always at the summit and already
              get the aggregate handbook climb below, so showing both stacked
              two near-identical mountains. Tiers 1–2 keep it — the path ahead
              is the whole point for them. ─────────────────────────────── */}

        {!openSection && !searching && signedIn && user && tier < 3 && (
          <RankClimb role={user.role} rank={hrRankOfTitle(user.role)} />
        )}

        {/* ── LABOR + FOOD — the two money cards (tiers 2–3) ──────────────
              REPLACED the aggregate "Handbook climb" summit card (Matt,
              Jul 24 2026). The handbook NUDGE is untouched and still lives in
              two places: the personal "sign your handbook" card just below for
              tiers 1–2, and the unsigned count in the People & Team section
              badge. What went away is only the directors' progress mountain.

              Tier 2 sees these as well as tier 3 — deliberate. These numbers
              are a teaching surface: leaders act on hours during the shift,
              so the person who can actually cut the hours has to be able to
              see them. ─────────────────────────────────────────────────── */}
        {!openSection && !searching && tier >= 2 && moneyCard && (moneyCard.labor || moneyCard.food) && (() => {
          const L = moneyCard.labor, F = moneyCard.food, G = moneyCard.gaps;
          const money0 = (v) => `$${Math.round(Number(v) || 0).toLocaleString("en-US")}`;
          /* ⚠️ THESE TWO NOW COME FROM THE SHARED HELPERS at the top of the file.
             The rule was written out here, and the Today rows needed the same two
             answers; a second copy is how one surface starts quoting a different
             goal, or a different denominator, for the same month.
             Behaviour is unchanged. foodGoalPct still prefers a published s2 goal
             and falls back to the flat benchmark. foodOverDollars still measures
             against FULL MTD sales rather than a payroll window, because food
             cost is not tied to the hours-through date. Labor is, which is why
             the two cards deliberately do not share a denominator. */
          const goal = foodGoalPct(scorecard);
          const foodOver = foodOverDollars(F, scorecard);
          /* ⚠️⚠️ TODAY'S NUMBER, NOT THE WEEKDAY AVERAGE (corrected Aug 7 2026).
             🐛 This read `L.dowAvgOver` — the average across this month's
             Thursdays — under a headline that says "Cut ~N hrs today", while
             the daypart rows underneath were built from `L.todayOver`, today's
             own plan. Two bases, one card. When they differed by more than
             four hours the apportion guard below fired and the four rows
             visibly stopped adding up to the headline directly above them.
             Matt, Aug 7 2026: "i want to know what to cut exactly where so when
             im cutting im not guessing." You cannot cut a typical Thursday.
             ⚠️ NULL WHEN TODAY HAS NO SCHEDULE, deliberately. Falling back to
             the average there would put a number on the card for a day nobody
             has rostered, which is the exact thing the `ops <= 0` guard in the
             engine exists to prevent. */
          const over = L && L.todayOver != null ? L.todayOver : null;
          // ★ COLOUR CONVENTION (Matt, Jul 24 2026) — borderLEFT = identity,
          // borderTOP = severity. The same rule the KPI strip and the section
          // cards already use. Before this, Labor was navy only because it
          // inherited the Handbook climb card it replaced and Food was red
          // only because red is the Money section colour — so two cards that
          // were BOTH missing goal looked like one calm and one urgent.
          // Identity is now navy on both; the top edge carries how it's doing,
          // and flips to green on its own when a card comes in under goal.
          const toneOf = (v) => (v == null ? "#E5E7EB" : v > 0 ? RED : GREEN);
          const Card = ({ tone: t, eyebrow, children }) => (
            <div style={{ background: cardSurface(t, 0.5), border: "1px solid #E5E7EB",
              /* 🐛 THE TWO EDGES WERE DIFFERENT COLOURS (Matt, Aug 4 2026,
                 looking at the live dashboard). Top took the status tone —
                 green under goal, red over — and left took brand navy, so one
                 corner carried two unrelated signals and read as a mistake.
                 Both now carry the TONE, because the status is the thing worth
                 seeing from across a room. The navy was decoration; the colour
                 telling you whether labor is over or under is not. */
              ...accentEdge(t, 3),
              borderRadius: 14, padding: "14px 16px 13px", boxShadow: CARD_3D }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", color: PEAK, textTransform: "uppercase", marginBottom: 6 }}>{eyebrow}</div>
              {children}
            </div>
          );
          const Link = ({ tab, dest, text, color }) => (
            <button
              onClick={() => {
                if (tab) { try { localStorage.setItem(FIN_LAST_TAB_KEY, tab); } catch {} }
                openTool(toolById(dest));
              }}
              style={{ background: "none", border: "none", padding: 0, marginTop: 10, cursor: "pointer", fontSize: 12, fontWeight: 800, color, whiteSpace: "nowrap" }}
            >
              {text}
            </button>
          );
          return (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12, marginBottom: 16 }}>
              {L && (
                <Card tone={L.laborTrusted === false ? undefined : toneOf(L.laborOver)} eyebrow="Labor · month to date">
                  {/* ★ AN UNTRUSTED PAYROLL WINDOW WITHHOLDS THE HEADLINE
                      (Aug 5 2026 sweep). The FCR page already refuses to state
                      labor % when the hours-through date is in doubt, and the
                      scorecard row is withheld too — but this card, the one
                      everybody opens first, went on printing a confident dollar
                      figure with a green or red tone. Two screens, one month,
                      two verdicts, and the loud one was wrong.
                      ⚠️ Only the headline and the percentage go. The paid-hours
                      line below is computed from payroll, not from the window,
                      so it stays: hiding a number that is fine teaches people
                      the card is broken rather than cautious.
                      ⚠️ `=== false` on purpose. An older cached card with no
                      flag at all must keep rendering exactly as before. */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em", color: L.laborTrusted === false ? "#9CA3AF" : (L.laborOver != null && L.laborOver > 0 ? RED : GREEN) }}>
                      {L.laborTrusted === false || L.laborOver == null ? "—" : `${L.laborOver > 0 ? "" : "−"}${money0(Math.abs(L.laborOver))}`}
                    </span>
                    <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700 }}>
                      {L.laborTrusted === false
                        ? "hours-through date needs confirming"
                        : L.laborOver == null ? "no payroll basis yet" : L.laborOver > 0 ? "over goal" : "under goal"}
                    </span>
                  </div>
                  {/* Non-ops are IN these figures, not beside them — a payroll
                      total doesn't split training/meeting pay out, and Matt
                      ruled they belong in the picture. Said out loud so nobody
                      adds them a second time. */}
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                    {L.laborTrusted === false
                      ? "Labor % is not reliable until the date is confirmed"
                      : L.laborPct != null && L.laborGoal != null
                      ? `${(L.laborPct * 100).toFixed(2)}% vs ${(L.laborGoal * 100).toFixed(2)}% goal`
                      : "Training and meeting hours included"}
                    {L.laborPaid != null
                      ? ` · ${money0(L.laborPaid)} ${L.laborSource === "actual" ? "paid" : "scheduled"}${L.mtdHours > 0 ? ` on ${Math.round(L.mtdHours).toLocaleString("en-US")} hrs` : ""}`
                      : ""}
                  </div>
                  <div style={{ borderTop: "1px solid #EEF0F2", marginTop: 10, paddingTop: 9 }}>
                    {over == null ? (
                      <div style={{ fontSize: 13, color: "#9CA3AF" }}>No {weekday} hours scheduled yet this month.</div>
                    ) : (
                      <>
                        {/* ★ MATT RULED, Jul 24 2026: NON-OPS ARE IN THE HOURS-TO-CUT
                            FIGURE. "The non ops hrs are part of the whole picture and
                            need to be a part of the formula for hrs to cut. That's how
                            all stores function." Every hour on the schedule is paid, so
                            every hour counts against the budget — training and meeting
                            time is a schedulable lever like any other. DO NOT reintroduce
                            an operational-only "floor" figure next to this one; a second
                            number here competes with the instruction and was removed for
                            exactly that reason. The composition line below is a
                            breakdown, not an alternative target. */}
                        <div style={{ fontSize: 17, fontWeight: 900, color: over > 0.5 ? RED : GREEN, letterSpacing: "-0.01em" }}>
                          {over > 0.5
                            ? `Cut ~${Math.round(over)} hrs today`
                            : Math.abs(over) < 0.5 ? "On budget today" : `${Math.abs(over).toFixed(1)} hrs of room today`}
                        </div>
                        {/* ★ THE TRAINING/MEETING COMPOSITION IS DIRECTORS ONLY
                            (Matt, Jul 31 2026: "I don't want the team to see
                            that. I just want them to see how many hrs to cut").
                            Tier 2 is the floor leader who acts on the number —
                            they get the target and nothing to argue with. Tier
                            3 is the director group, who need to know that the
                            standing block, not the floor, is what puts the day
                            over. Same number for both; only the reason why is
                            gated. */}
                        <div style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 3 }}>
                          {weekday}s average {over > 0 ? "+" : ""}{over.toFixed(1)} hrs vs budget
                          {tier >= 3 && L.dowAvgNonOp != null && L.dowAvgNonOp > 0
                            ? `, including ${L.dowAvgNonOp.toFixed(1)} hrs training / meetings`
                            : ""}
                          {" "}· {L.dowDays} {weekday}{L.dowDays === 1 ? "" : "s"} this month.
                        </div>
                        {/* ★ WHERE THE CUT COMES FROM (Matt, Jul 31 2026).
                            Each house against its own budget slice, carrying
                            its apportioned share of the standing non-op block
                            — so these two ADD UP TO THE HEADLINE exactly. A
                            leader reads "cut 21" then "front 11, back 10" and
                            it reconciles. See LaborPlanner.jsx for why the earlier
                            ops-only version was replaced.
                            Rendered only when the split exists — a month with
                            no FOH/BOH hours typed shows the headline alone
                            rather than two zeros that look like a verdict. */}
                        {(L.dowAvgOverFoh != null || L.dowAvgOverBoh != null) && (
                          <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
                            {/* ★ THREE TILES WHEN THE SALES MIX IS KNOWN (Matt,
                                Aug 6 2026: "the cut hrs still doesnt show how
                                mch to cut for dt vs fc").
                                "Cut 13 up front" never said which side to take
                                it off, and those are two different decisions
                                with two different people on them. When the
                                drive-thru share is measurable the front tile
                                becomes two — DRIVE THRU and FRONT COUNTER —
                                and Back is unchanged.
                                ⚠️ FALLS BACK TO Front/Back, NOT TO A GUESS.
                                dtShareOfFoh refuses to answer on fewer than 14
                                days of sales, and on that answer this shows the
                                old two tiles rather than inventing a split. The
                                three still apportion to the same headline. */}
                            {(L.dowAvgOverDt != null && L.dowAvgOverFc != null
                              ? [
                                  { label: "Drive Thru", v: L.dowAvgOverDt },
                                  { label: "Front Ctr", v: L.dowAvgOverFc },
                                  { label: "Back", v: L.dowAvgOverBoh },
                                ]
                              : [
                                  { label: "Front", v: L.dowAvgOverFoh },
                                  { label: "Back", v: L.dowAvgOverBoh },
                                ]
                            ).map(({ label, v }, i, all) => {
                              /* ⚠️ THE PAIR IS ROUNDED TOGETHER, NOT SEPARATELY.
                                 Rounding each on its own printed FRONT 13 and
                                 BACK 9 under a headline of 21. `shown` is what
                                 the tile prints; `v` still decides the colour
                                 and the wording, because a true 0.6 is a cut
                                 even if it displays as 1. */
                              const shown = apportion(over, all.map((x) => x.v))[i];
                              return (
                              <div key={label} style={{ flex: 1,
                                /* These sit INSIDE the labor card, so they take the
                                   shallow depth and a strip in their own status
                                   colour — red when there are hours to cut, green
                                   when there is room. They were the last plain white
                                   boxes on the dashboard. */
                                background: cardSurface(v == null ? "#9CA3AF" : v > 0.5 ? RED : GREEN, 0.4),
                                border: "1px solid #E5E7EB",
                                ...accentEdge(v == null ? "#D1D5DB" : v > 0.5 ? RED : GREEN, 3),
                                borderRadius: 9, padding: "7px 9px", boxShadow: CARD_3D_SOFT }}>
                                <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.1em", color: "#9CA3AF", textTransform: "uppercase" }}>{label}</div>
                                <div style={{ fontSize: 14.5, fontWeight: 900, letterSpacing: "-0.01em", marginTop: 1, color: v == null ? "#9CA3AF" : v > 0.5 ? RED : GREEN }}>
                                  {v == null
                                    ? "—"
                                    : v > 0.5 ? `Cut ~${shown} hrs`
                                    : Math.abs(v) < 0.5 ? "On budget"
                                    : `+${Math.abs(v).toFixed(1)} hrs room`}
                                </div>
                              </div>
                              );
                            })}
                          </div>
                        )}
                        {/* ★ THE DAYPART SPLIT, WITHOUT LEAVING THE DASHBOARD
                            (Matt, Aug 4 2026: "The daypart cuts should be
                            viewable here without going to the planner").
                            Same numbers the Planner shows, computed once in
                            monthLaborCard so the two surfaces cannot drift into
                            disagreeing about where a cut should land — which
                            they already did once today over standing ops.
                            Collapsed by default: the day total is the headline
                            and this is the follow-up question. */}
                        {(L.todayByDaypart || []).length > 0 && (
                          <div style={{ marginTop: 9 }}>
                            <button
                              type="button"
                              onClick={() => setDashDayparts((v) => !v)}
                              style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                                fontSize: 11.5, fontWeight: 800, color: PEAK, fontFamily: "inherit" }}>
                              {dashDayparts ? "hide by daypart ▲" : "by daypart ▾"}
                            </button>
                            {dashDayparts && (
                              <div style={{ marginTop: 6 }}>
                                {(() => {
                                  /* ⚠️ DECLARED ONCE, BEFORE THE ROWS, AND THE
                                     ROWS READ IT. dayShown apportions today's
                                     variance across the four dayparts in one
                                     pass, so they sum to the headline instead of
                                     each rounding its own way to 18 under a 17.
                                     ⚠️ THE DT SHARE IS DERIVED FROM THE TILES,
                                     not recomputed (Matt: "for fc and dt"). The
                                     two numbers above already carry the real
                                     sales mix; dividing them gives the same
                                     share without a second source that could
                                     disagree with the tiles sitting right there.
                                     Null when the mix is unmeasurable, and then
                                     the rows fall back to front/back exactly as
                                     they did. */
                                  const dayShown = apportion(over, L.todayByDaypart.map((r) => r.amt));
                                  const dtPlusFc = (L.dowAvgOverDt || 0) + (L.dowAvgOverFc || 0);
                                  const dtShare = (L.dowAvgOverDt != null && L.dowAvgOverFc != null && dtPlusFc !== 0)
                                    ? L.dowAvgOverDt / dtPlusFc
                                    : null;
                                  return L.todayByDaypart.map((r, di) => {
                                  /* ⚠️ front + back MUST EQUAL the row's hours.
                                     Rounded apart, Dinner printed "front 3 ·
                                     back 3 · 7 h" — a row that contradicts
                                     itself on the same line.
                                     🐛 AND THE ROWS MUST SUM TO THE HEADLINE
                                     (Matt, Aug 6 2026, off a live screenshot).
                                     Each row rounded its own total, so 4+5+3+6
                                     printed 18 under a headline of "Cut ~17".
                                     Same bug as the front/back tiles had, one
                                     level down. dayShown apportions the day's
                                     variance across the dayparts ONCE, so the
                                     four rows add up to the number at the top,
                                     and front/back then split that shown value
                                     rather than the raw one. */
                                  /* Three parts when the mix is known, two when it
                                     is not. apportion runs over whichever list is
                                     in play, so the row still equals its own total
                                     either way. */
                                  const parts = dtShare != null
                                    ? [r.foh * dtShare, r.foh * (1 - dtShare), r.boh]
                                    : [r.foh, r.boh];
                                  const shown = apportion(dayShown[di], parts);
                                  const labels = dtShare != null ? ["DT", "FC", "back"] : ["front", "back"];
                                  const word = (x, n) => Math.abs(x) < 0.5 ? "—" : x > 0 ? `${n}` : `+${Math.abs(n)}`;
                                  const tone = (x) => Math.abs(x) < 0.5 ? "#9CA3AF" : x > 0 ? RED : GREEN;
                                  return (
                                    <div key={r.dp} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
                                      fontSize: 12, padding: "3px 0", borderTop: "1px solid #EEF0F2" }}>
                                      <span style={{ fontWeight: 700, color: INK }}>{r.dp}</span>
                                      <span style={{ color: "#6B7280" }}>
                                        {/* ⚠️ A span, not React.Fragment. This file
                                            uses the new JSX transform and never
                                            imports React, so React.Fragment is an
                                            unbound name — the scope check caught
                                            it before it shipped. */}
                                        {labels.map((lab, pi) => (
                                          <span key={lab}>
                                            {pi > 0 ? "  ·  " : ""}
                                            {lab} <b style={{ color: tone(parts[pi]) }}>{word(parts[pi], shown[pi])}</b>
                                          </span>
                                        ))}
                                        {/* ★ SAYS WHAT THE NUMBER IS (Matt: "i
                                            can't see how much to cut from each
                                            daypart"). It was a bare "4 h" at the
                                            end of a row, which reads as the
                                            hours worked, not the hours to cut.
                                            The word is the whole fix. */}
                                        {"  ·  "}<b style={{ color: tone(r.amt) }}>
                                          {Math.abs(r.amt) < 0.5 ? "on budget"
                                            : r.amt > 0 ? `cut ${dayShown[di]} h`
                                            : `+${Math.abs(dayShown[di])} h room`}
                                        </b>
                                      </span>
                                    </div>
                                  );
                                  });
                                })()}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <Link tab="labor" dest="financials" text="Labor planner →" color={PEAK} />
                </Card>
              )}
              {F && (
                <Card tone={toneOf(foodOver)} eyebrow="Food · month to date">
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em", color: foodOver != null && foodOver > 0 ? RED : GREEN }}>
                      {foodOver == null ? "—" : `${foodOver > 0 ? "" : "−"}${money0(Math.abs(foodOver))}`}
                    </span>
                    <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700 }}>
                      {foodOver == null ? "no sales basis yet" : foodOver > 0 ? "over goal" : "under goal"}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                    {(F.foodPct * 100).toFixed(2)}% vs {(goal * 100).toFixed(2)}% goal
                  </div>
                  {G && (
                    <div style={{ borderTop: "1px solid #EEF0F2", marginTop: 10, paddingTop: 9 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#9CA3AF", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 5 }}>
                        Focus areas · {G.label}{G.stale ? " (latest on file)" : ""}
                      </div>
                      {G.items.slice(0, 3).map((it, i) => (
                        <div key={it.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", borderTop: i === 0 ? "none" : "1px solid #F4F6F7" }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: RED, flexShrink: 0 }}>{money0(it.gap)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Link tab="foodcost" dest="financials" text="Food cost →" color={PEAK} />
                </Card>
              )}
            </div>
          );
        })()}

        {!openSection && !searching && tier > 0 && tier < 3 && handbookMine && handbookMine !== "none" && (
          <div style={{ background: cardSurface(PEAK, 0.5), border: "1px solid #E5E7EB", borderLeft: `3px solid ${PEAK}`, borderTop: `3px solid ${PEAK}`, borderRadius: 14, padding: "16px 18px", marginBottom: 16, boxShadow: CARD_3D }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", color: PEAK, textTransform: "uppercase", marginBottom: 8 }}>{programLabel()}</div>
            {handbookMine === "signed" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 24, height: 24, borderRadius: 999, background: `${GREEN}18`, color: GREEN, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                </span>
                <span style={{ fontSize: 15, fontWeight: 800, color: INK }}>You've signed the handbook — you're at the summit.</span>
              </div>
            ) : (
              <button
                onClick={() => openTool(toolById("hr"))}
                style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 999, background: `${AMBER}18`, color: AMBER, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 15, fontWeight: 900 }}>!</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: INK }}>Start your climb — sign your handbook</span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: PEAK, whiteSpace: "nowrap" }}>HR Console →</span>
              </button>
            )}
          </div>
        )}

        {/* ── Quick actions ───────────────────────────────────────── */}
        {!openSection && !searching && (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 16 }}>
            {quickActions.map((c) => {
              const tool = toolById(c.id);
              const color = colorFor(tool);
              return (
                <button
                  key={c.id + c.label}
                  onClick={() => openTool(tool)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0,
                    background: cardSurface(color, 0.5), border: "1px solid #E5E7EB", borderLeft: `3px solid ${color}`, borderTop: `3px solid ${color}`,
                    borderRadius: 999, padding: "8px 14px 8px 12px", cursor: "pointer",
                    boxShadow: CARD_3D_SOFT,
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: INK, whiteSpace: "nowrap" }}>{c.label}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color, whiteSpace: "nowrap" }}>{c.sub} →</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Search results ──────────────────────────────────────── */}
        {!openSection && searching && (
          results.length > 0 ? (
            <div style={TILE_GRID}>
              {results.map((tool) => (
                <Tile
                  key={tool.id}
                  tool={tool}
                  color={tool.color}
                  locked={!canUseTool(tool, tier, user)}
                  badge={canUseTool(tool, tier, user) ? badgeFor(tool.id) : 0}
                  onClick={() => openTool(tool)}
                />
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", color: "#9CA3AF", fontSize: 14, fontWeight: 600, padding: "28px 0" }}>
              No tools match “{query.trim()}”.
            </div>
          )
        )}

        {/* ── Start here ───────────────────────────────────────────
            Matt asked whether the prioritised tool could come first. The grid
            below deliberately does NOT reorder — leaders find tools by position
            on a shared iPad, and a dashboard that rearranges itself daily is
            harder to learn than one that is occasionally suboptimal. This gives
            today's work a home of its own instead.
            ⚠️ RENDERS NOTHING WHEN THERE IS NOTHING. On a clean day the
            dashboard looks exactly as it does now. A "Start here" header over an
            empty space would be a permanent reminder that the feature exists,
            which is not the same as being useful. */}
        {/* People who set the Hub up and have gone quiet. Sits above Start
            here because it is the same question — what needs you today — just
            about a person rather than a tool. Renders nothing when the list is
            empty, so a good week costs no space. */}
        {/* Renders ONLY for someone with no photo on Slack and none uploaded,
            and disappears the moment they add one. Matt wanted it to encourage
            the team to use the Hub, and a prompt everyone sees every day is one
            nobody reads. */}
        {/* ⚠️ NO WRAPPER HERE. MyPhoto renders null for anyone who already has
            a face, so a card around it would leave 62 people staring at an
            empty bordered box every day. It carries its own frame. */}
        {signedIn && !openSection && !searching && <MyPhoto user={user} />}

        {signedIn && !openSection && !searching && <QuietPeople tier={tier} />}

        {signedIn && !openSection && !searching && startHereTools.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "#5B6474" }}>Start here</div>
              <div style={{ fontSize: 12, color: "#9AA3AE" }}>
                {startHereTools.length === 1 ? "1 tool needs something today" : `${startHereTools.length} tools need something today`}
                {startHereTools.some((x) => x.mine) ? " · yours first" : ""}
              </div>
            </div>
            <div style={TILE_GRID}>
              {startHereTools.map(({ tool, mine }) => (
                <div key={`sh-${tool.id}`} style={{ position: "relative" }}>
                  {/* Same "Yours" voice as the register rows — one word, same
                      colour, so the strip and the register read as one system. */}
                  {mine && (
                    <div style={{ position: "absolute", top: 8, right: 10, zIndex: 1, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", color: PEAK, textTransform: "uppercase", pointerEvents: "none" }}>Yours</div>
                  )}
                  <Tile tool={tool} color={tool.color} badge={badgeFor(tool.id)}
                    inputStatus={toolInputStatus[tool.id]} onClick={() => openTool(tool)} />
                </div>
              ))}
            </div>
          </div>
        )}


        {/* ── Top leaders — the Shift Leader Scorecard's top 3 FRONT + top 3
              BACK, all tiers ────────────────────────────────────────────
              Reads gcfcr-sl-eos-rollup-v1 (published by the scorecard). Ranks
              scored leaders by composite (1–5), then splits by station: Front =
              dt|foh, Back = boh, each top 3. station:null drops out of both (no
              Unassigned bucket). Shows name · score · RAG dot, taps through to
              the full scorecard. Renders only when at least one leader has a
              composite — a cold or unscored feed shows nothing, never an empty
              "board". PRESENTATIONAL: the rollup is read/scored exactly as
              before, only the display is grouped. ─────────────────────────── */}
        {tier >= 2 && !openSection && !searching && slBoard && slBoard.leaders && (() => {
          const RAG_COLOR = { red: RED, amber: AMBER, green: GREEN };
          const ranked = Object.values(slBoard.leaders)
            .filter((l) => l && typeof l.composite === "number")
            .sort((a, b) => b.composite - a.composite);
          if (ranked.length === 0) return null;
          // ShiftLeaderScorecard publishes station as OWNER_LABEL — "DT"/"FOH"/
          // "BOH" (uppercase display strings), NOT lowercase. Normalize before
          // matching so the split actually fires; a mismatch here silently
          // dropped every leader into neither bucket (→ combined-5 fallback).
          const stn = (l) => (typeof l.station === "string" ? l.station.toLowerCase() : "");
          const front = ranked.filter((l) => stn(l) === "dt" || stn(l) === "foh").slice(0, 3);
          const back = ranked.filter((l) => stn(l) === "boh").slice(0, 3);
          // Split into Front/Back when the rollup carries a usable station on at
          // least one leader. If NONE do, fall back to a single combined top-5 so
          // the board never silently disappears — it upgrades to Front/Back on
          // its own the moment station data flows. (When a split IS in effect,
          // station null/blank still drops out of both — no Unassigned bucket.)
          const split = front.length > 0 || back.length > 0;
          // ⚠️ BAND WORD IMPORTED, NOT REDEFINED. scoreBand/scoreColor come from
          // ShiftLeaderScorecard so the board and the scorecard can never drift
          // apart — one edit to the words changes both surfaces. A leader who
          // reads "Climbing" here and something else one tap later would learn
          // to trust neither.
          // The word is STACKED UNDER the score rather than sitting inline next
          // to the name: names here already ellipsis-truncate ("Adriana Carrera
          // Reyes"), and a 15-character band like "Finding footing" inline would
          // eat the name entirely on a phone. Stacked keeps the full name AND
          // pairs the word with the number it describes.
          const Row = (l, i) => {
            const dot = RAG_COLOR[l.rag] || "#9CA3AF";
            const band = slBand(l.composite);
            return (
              <div key={l.name + i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: i === 0 ? "none" : "1px solid #EEF0F2" }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: "#9CA3AF", width: 16, flexShrink: 0 }}>{i + 1}</span>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</span>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0, lineHeight: 1.15 }}>
                  <span style={{ fontSize: 14, fontWeight: 900, color: INK }}>{l.composite.toFixed(1)}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: slBandColor(l.composite), whiteSpace: "nowrap" }}>{band.word}</span>
                </span>
              </div>
            );
          };
          const GroupLabel = ({ text }) => (
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: "#9CA3AF", textTransform: "uppercase", marginTop: 10, marginBottom: 2 }}>{text}</div>
          );
          return (
            <div style={{ background: cardSurface(PEAK, 0.5), border: "1px solid #E5E7EB", borderLeft: `3px solid ${PEAK}`, borderTop: `3px solid ${PEAK}`, borderRadius: 14, padding: "14px 16px 12px", marginBottom: 14, boxShadow: CARD_3D }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", color: PEAK, textTransform: "uppercase" }}>Top Leaders</span>
                <button
                  onClick={() => openTool(toolById("shiftleader"))}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 800, color: PEAK, whiteSpace: "nowrap" }}
                >
                  Scorecard →
                </button>
              </div>
              {/* Defining line — Daisy's ask (Jul 22). Without it the board is a
                  name next to a number, which reads as a verdict on the person;
                  leaders were already misreading the 1-5 as HR discipline points.
                  Same wording as the scorecard's own explainer so the two
                  surfaces say one thing. Deliberately says what the score IS
                  rather than promising what it will never feed. */}
              <div style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.45, marginTop: -4, marginBottom: 4 }}>
                Shift metrics scored 1–5 from the days each leader ran — coaching signal, not an HR record.
              </div>
              {split ? (
                <>
                  {front.length > 0 && (
                    <>
                      <GroupLabel text="Front" />
                      {front.map(Row)}
                    </>
                  )}
                  {back.length > 0 && (
                    <>
                      <GroupLabel text="Back" />
                      {back.map(Row)}
                    </>
                  )}
                </>
              ) : (
                ranked.slice(0, 5).map(Row)
              )}
            </div>
          );
        })()}
      </div>

      {/* ── PIN modal ───────────────────────────────────────────── */}
      {pinTool && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(19,41,63,0.55)", zIndex: 100,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
          onClick={(e) => e.target === e.currentTarget && setPinTool(null)}
        >
          <div
            style={{
              background: "#fff", borderRadius: 16, borderTop: `3px solid ${colorFor(pinTool)}`,
              padding: "22px 20px", width: "100%", maxWidth: 340,
              boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* ⚠️ NO ICON FOR THE SENTINEL. `Icon` is keyed by tool id and its
                  own note records what an unmapped one costs: an empty square
                  that reads as something still loading. */}
              {!isSignIn(pinTool) && (
                <span
                  style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: `${colorFor(pinTool)}14`,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Icon id={pinTool.id} color={colorFor(pinTool)} />
                </span>
              )}
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 800, color: INK }}>
                  {isSignIn(pinTool) ? "Sign in" : pinTool.name}
                </div>
                <div style={{ fontSize: 12, color: "#6B7280" }}>
                  {/* ⚠️ "Requires Director access" ON A PLAIN SIGN-IN IS A LIE,
                      and a discouraging one: this card takes anybody's PIN and
                      gives them whatever their own access is. */}
                  {isSignIn(pinTool)
                    ? "Type your PIN. You will land on your dashboard."
                    : `Requires ${TIER_NAMES[pinTool.tier]} access.`}
                </div>
              </div>
            </div>
            {/* ── THE NAME STEP ───────────────────────────────────────────────
                Only ever rendered after the server has answered `who`, which it
                does not do yet. Same card, same PIN field, same Unlock button:
                one extra tap, once per device, and then the device cookie means
                it is never asked again. That "never again" is the requirement —
                a step that reappeared during a lunch rush would be worse than
                the problem it fixes. */}
            {needName && (
              <div style={{ marginTop: 14 }}>
                {pinNameId ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, padding: "9px 11px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700 }}>Signing in as</div>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {/* ⚠️ Falls back to empty, never to the raw id. A stale
                            pick can only ever show nothing, not a number. */}
                        {(nameChoices.find((m) => String(m.id) === String(pinNameId)) || {}).name || ""}
                      </div>
                    </div>
                    <button
                      onClick={() => { setPinNameId(""); setNameQuery(""); setPinErr(""); }}
                      style={{ background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 700, color: RED, cursor: "pointer", flexShrink: 0 }}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: INK, marginBottom: 6 }}>
                      Find your name first
                    </div>
                    <input
                      autoFocus
                      value={nameQuery}
                      onChange={(e) => { setNameQuery(e.target.value); setPinErr(""); }}
                      placeholder="Type your name"
                      style={{
                        width: "100%", boxSizing: "border-box", fontSize: 14,
                        padding: "9px 11px", border: "2px solid #E5E7EB",
                        borderRadius: 10, outline: "none",
                      }}
                    />
                    {nameQuery ? (() => {
                      /* Computed ONCE. Calling the filter twice — once to test
                         for empty and once to map — is how a list and its own
                         "no match" message drift apart. */
                      const hits = matchNames(nameChoices, nameQuery);
                      if (!hits.length) {
                        return (
                          <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 8, textAlign: "center" }}>
                            No match. Try just your first name.
                          </div>
                        );
                      }
                      return (
                        <div style={{ maxHeight: 168, overflowY: "auto", marginTop: 8, border: "1px solid #E5E7EB", borderRadius: 10 }}>
                          {hits.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => { setPinNameId(String(m.id)); setPinErr(""); }}
                              style={{
                                display: "block", width: "100%", textAlign: "left",
                                background: "none", border: "none", borderBottom: "1px solid #F3F4F6",
                                padding: "10px 11px", fontSize: 13.5, fontWeight: 700,
                                color: INK, cursor: "pointer",
                              }}
                            >
                              {m.name}
                            </button>
                          ))}
                        </div>
                      );
                    })() : null}
                  </>
                )}
              </div>
            )}
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setPinErr(""); }}
              onKeyDown={(e) => e.key === "Enter" && submitPin()}
              placeholder="PIN"
              style={{
                marginTop: 14, width: "100%", boxSizing: "border-box",
                fontSize: 22, fontWeight: 800, letterSpacing: "0.3em", textAlign: "center",
                padding: "10px 12px", border: pinErr ? `2px solid ${RED}` : "2px solid #E5E7EB",
                borderRadius: 10, outline: "none",
              }}
            />
            {pinErr && (
              <div style={{ fontSize: 12, fontWeight: 700, color: RED, marginTop: 8, textAlign: "center" }}>
                {pinErr}
              </div>
            )}
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 10, textAlign: "center", lineHeight: 1.4 }}>
              Use your personal PIN.
            </div>
            {/* ⚠️ REPLACED "open the HR Console and set it there", which was
                advice nobody below a director could follow — HR Console is
                gated, so a brand new team member reading that had nowhere to
                go. This is the way in for somebody who has never had a PIN. */}
            <button
              onClick={openClaim}
              style={{ display: "block", margin: "8px auto 0", background: "none", border: "none", padding: 4,
                       fontSize: 12.5, fontWeight: 700, color: RED, cursor: "pointer", textDecoration: "underline" }}>
              First time here? Set up your PIN
            </button>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 14, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0, cursor: "pointer" }}
              />
              <span style={{ fontSize: 12.5, color: "#374151", lineHeight: 1.4 }}>
                Keep me signed in on this device
                <span style={{ display: "block", fontSize: 11, color: "#9CA3AF" }}>
                  Only on your own phone, never a shared store iPad.
                </span>
              </span>
            </label>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button
                onClick={() => setPinTool(null)}
                style={{ flex: 1, background: "#F3F4F6", border: "none", borderRadius: 10, padding: "11px 0", fontSize: 13.5, fontWeight: 700, color: "#374151", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={submitPin}
                disabled={busy}
                style={{ flex: 1, background: RED, border: "none", borderRadius: 10, padding: "11px 0", fontSize: 13.5, fontWeight: 800, color: "#fff", cursor: "pointer", opacity: busy ? 0.6 : 1 }}
              >
                {busy ? "Checking…" : "Unlock"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
