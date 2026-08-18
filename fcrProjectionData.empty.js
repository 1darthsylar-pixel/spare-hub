/* ── fcrProjectionData.empty.js ─────────────────────────────
   ⚠️ THE CLONE'S COPY. `newstore.mjs` finds every `*.empty.js` beside its real
   file and copies THIS one over fcrProjectionData.js in a new store. Nothing lists it;
   the filename is the whole mechanism.

   WHAT IS LEFT BEHIND: eighteen months of this store's complete profit and
   loss — every expense line and the real month-end net profit.
   ⚠️ worker.js ALREADY WITHHOLDS THIS FROM A CLONE at /api/fcr-data, by
   comparing the store's own fsr against REFERENCE_FSR. That gate works and
   stays. This file is the other half: a gate stops it being SERVED, and this
   stops it being SHIPPED at all. Two independent things have to fail.
   ⚠️ EMPTY IS A WORKING STATE, NOT A PLACEHOLDER. These same values run at the
   Village today. The readers already handle nothing: a store with no history
   renders a dash rather than a wrong number.
   ⚠️ KEEP THE EXPORT NAMES IDENTICAL. newstore.mjs refuses to build a snapshot
   if they drift, because a missing export is an import error at a new store,
   in a file nobody would think to open. */
export const FCR_PROJECTIONS = {};
