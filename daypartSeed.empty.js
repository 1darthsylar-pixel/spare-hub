/* ── daypartSeed.empty.js ─────────────────────────────
   ⚠️ THE CLONE'S COPY. `newstore.mjs` finds every `*.empty.js` beside its real
   file and copies THIS one over daypartSeed.js in a new store. Nothing lists it;
   the filename is the whole mechanism.

   WHAT IS LEFT BEHIND: this store's June and July sales and labour hours,
   broken down by daypart.
   ⚠️ EMPTY IS A WORKING STATE, NOT A PLACEHOLDER. These same values run at the
   Village today. The readers already handle nothing: a store with no history
   renders a dash rather than a wrong number.
   ⚠️ KEEP THE EXPORT NAMES IDENTICAL. newstore.mjs refuses to build a snapshot
   if they drift, because a missing export is an import error at a new store,
   in a file nobody would think to open. */
export const DP_SEED_JULY = {};
export const DP_SEED_JUNE = {};
export const DP_SEED_MONTHS = [];
