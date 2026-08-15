/* ══════════════════════════════════════════════════════════════════════════
   workerSeed.empty.js — the version a new store gets.

   ⛔ WHAT IT REPLACES IS 111 PERSONAL EMAIL ADDRESSES — gmail, icloud, a
   student address, a work one. Nobody on that list agreed to have their contact
   details copied to another restaurant's server, and no sweep this project runs
   would have found them, because every sweep greps the app and this is the
   Worker.

   ⚠️ EMPTY IS A WORKING SERVER, and every consumer was traced before emptying:
   · `ownStoreFallback` already returns null for any store but the origin, so
     an empty recipients map changes nothing even there.
   · `emailFromSources` tries the protected hr-info record FIRST and only falls
     through to the seed; an empty seed means "no address on file", which every
     caller already handles by not sending.
   · the summary copies are set behind `if (b.hrEmail)`, and an empty string is
     falsy, so no copy is sent rather than one sent to nobody.
   · the `emails-migrate` backfill iterates the seed, so it writes nothing.

   ⇒ Fill these from THIS store's own HR data, or better, do not fill them at
   all: HR Console writes `gcfcr-hr-info` as people are added, which is the live
   source of truth this seed only ever backstopped.
   ══════════════════════════════════════════════════════════════════════════ */

export const GATE_CITY_RECIPIENTS = {};

export const EMAIL_SEED = {};

export const HR_SUMMARY_EMAIL = "";
export const BRI_SUMMARY_EMAIL = "";

/* ⚠️ THE KEYS STAY, THE PEOPLE GO. Every one of these is read by name from a
   fixed path, so the key has to exist even when nobody is in it. Empty means
   "no recipient", and every caller already treats that as "do not send" rather
   than as an error. */
export const NOTIFY_DEFAULTS = {
  owner: "",
  cleaning: "",
  l10Recap: "",
  leadership: "",
  hr: "",
  boh: "",
};

/* Empty until this store knows who its own automations name. The daily sweep
   reports nothing rather than reporting somebody else's team. */
export const SWEEP_PEOPLE = [];

export const L10_ATTENDEE_DEFAULT = [];

/* ⚠️ `{}` FOR ONE AND `[]` FOR THE OTHER, MATCHING WHAT `seedFor` IS PASSED AT
   THE CALL SITE. One is keyed by year and the other is a list; a `{}` where the
   caller runs `Array.isArray` is a silently skipped seed rather than an error. */
export const PTO_SEED = {};

export const PTO_BONUS_SEED = [];

/* ⚠️ EMPTY MEANS A LOCKED-OUT TEAM MEMBER REACHES NOBODY. That is safe and it
   is not finished: fill this with THIS store's HR and leadership before anyone
   signs in, or the first person who forgets their PIN has no way back. */
export const PIN_HELP_TO = [];

export const SWEEP_EMAIL_EXTRA = [];

/* ⚠️ ROWS DROPPED, NOT RENAMED. The item ids are keys in a saved record, so a
   row kept with a new name against it would inherit somebody else's ticks. A
   store builds its own touch-in list when it has an EOS board. */
export const EOS_TOUCHIN_ITEMS = [];

export const EOS_OWNER_ORDER = [];

/* ★★ WHO MAY READ OR WRITE WAGES, ON THE SERVER. Matt, Aug 13 2026: "only Nick
   hannah and myself can see wages". Hannah 21 · Matt 33 · Nick 37.

   ⚠️⚠️ THE BROWSER LIST IS NOT A LOCK. `owners.payAccess` in ownerSeed.js
   decides what the SCREEN shows, and a screen gate is a suggestion: anybody who
   can open dev tools can call /api/hr-store directly. This list is the one that
   actually refuses, on the server, before a byte of pay is read.

   ⚠️⚠️ AND PROTECTING THE KEY ALONE WOULD NOT HAVE BEEN ENOUGH — that is a hole
   this repo has already had. /api/hr-store accepts ANY valid token by design (a
   team member's own dashboard is built through it) and then narrows the answer
   with hrReadFilter, which passes straight through anything not on a list. The
   Leadership Standards demerit file was on no list, and one GET with a Team
   Member's token returned the lot. Pay must never be that key.

   ⚠️ EMPTY MEANS NOBODY, and that is right for a clone: a second store's wages
   are not readable by anybody until they say who. */
export const PAY_ACCESS_IDS = [];

/* ★★ WHO MAY PUBLISH A WEEK TO EVERYBODY'S PHONE, ON THE SERVER.
   Mirrors `owners.tileAllow.scheduleEdit` in ownerSeed.js — Bri 17 · Hannah 21
   · Matt 33.

   ⚠️⚠️ A SECOND LIST ON PURPOSE, FOR THE SAME REASON PAY_ACCESS_IDS EXISTS.
   The browser list decides what the screen offers; it is not a lock. Publishing
   sends a notification to roughly a hundred phones and cannot be unsent, so the
   refusal has to happen where nobody can reach it.
   ⚠️ KEEP THE TWO IN STEP. If somebody joins or leaves the schedule-editing
   list, change it here as well or they will press a button that answers 403.
   ⚠️ EMPTY MEANS NOBODY PUBLISHES, which is the safe direction: a clone cannot
   notify a store it has never met. */
export const SCHEDULE_PUBLISH_IDS = [];
