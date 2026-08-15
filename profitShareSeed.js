/* ══════════════════════════════════════════════════════════════════════════
   profitShareSeed.empty.js — the version a new store gets. `newstore.mjs`
   copies this over profitShareSeed.js while it builds the snapshot.

   ⚠️ WHAT COMES OUT: the `members` arrays. They named eleven leaders, and set
   beside the multiplier table on the same page they let anyone work out what
   each named person is paid. That is the one thing in this file that costs
   money if it travels: names left here would pay another store's leaders on
   this store's sheet.

   ⚠️ WHAT STAYS, AND WHY: the four tiers and the rate tables. Chick-fil-A's
   profit-share structure, not one operator's plan, and the second store kept
   them on that reasoning. ⚠️ HONEST TENSION, WRITTEN DOWN RATHER THAN SMOOTHED
   OVER: `STORE-INTAKE.md` says of profit share "no two operators do this the
   same way, so there is nothing to copy from ours." That is about the PLAN
   RULES — who qualifies, what triggers a payout — which live in KV and are not
   here. If a store's rates turn out to differ, they edit them on the screen;
   this is a seed, not the ledger.

   ⚠️⚠️ MEMBERS DO NOT MOVE INTO `ownerSeed.js` WITH THE OTHER PEOPLE, AND THAT
   WAS TRIED AND REVERSED. This file's own header says only `worker.js` may
   import it, because vite builds the client separately and a module imported
   nowhere else never reaches `dist/assets`. `ownerSeed.js` IS reachable from
   the client through storeConfig.js, so tidying these names in there would take
   compensation data that is currently Worker-only and put it in every team
   member's browser. Tidier and strictly worse.

   ⚠️ `GROUP_MULT` IS DUPLICATED FROM THE REAL FILE and that is a drift risk, so
   `newstore.mjs` asserts the two are deep-equal and refuses to build a snapshot
   if they are not. A full-file swap cannot import from the file it replaces.
   ══════════════════════════════════════════════════════════════════════════ */

export const GROUP_MULT = {
  ptad: { "0.12": 0, "0.13": 0.006010, "0.14": 0.007706, "0.15": 0.009016, "0.16": 0.010711, "0.17": 0.012407 },
  ftad: { "0.12": 0, "0.13": 0.014587, "0.14": 0.018234, "0.15": 0.021880, "0.16": 0.025527, "0.17": 0.029174 },
  dir:  { "0.12": 0, "0.13": 0.005403, "0.14": 0.006560, "0.15": 0.008104, "0.16": 0.009262, "0.17": 0.010419 },
};

/* ⚠️ EMPTY `members` IS A WORKING SEED. It is only the starting shape the
   profit-share screen writes on first use, and a store adds its own people
   there. The tier names and notes are the ladder, not anybody's staff. */
export const DEFAULT_GROUPS = [
  { id: "ptad", name: "Part-time Asst. Director", note: "30hrs/Weekly", members: [],
    mult: { ...GROUP_MULT.ptad } },
  { id: "ftad", name: "Full-time Asst. Director", note: "30hrs/Weekly", members: [],
    mult: { ...GROUP_MULT.ftad } },
  { id: "dir", name: "Director", note: "30hrs/Weekly", members: [],
    mult: { ...GROUP_MULT.dir } },
  /* protected: never auto-adjusted by the fixed-total rebalance. */
  { id: "ed", name: "Executive Director", note: "30hrs/Weekly", members: [], protected: true,
    mult: { "0.12": 0, "0.13": 0.024, "0.14": 0.027, "0.15": 0.03, "0.16": 0.033, "0.17": 0.035 } },
];
