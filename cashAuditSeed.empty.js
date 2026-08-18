/* ── cashAuditSeed.empty.js ─────────────────────────────
   ⚠️ THE CLONE'S COPY. `newstore.mjs` finds every `*.empty.js` beside its real
   file and copies THIS one over cashAuditSeed.js in a new store. Nothing lists it;
   the filename is the whole mechanism.

   WHAT IS LEFT BEHIND: eight of this store's real cash counts, each naming
   the leader who counted it and what the till was over or short by.
   ⚠️ EMPTY IS A WORKING STATE, NOT A PLACEHOLDER. These same values run at the
   Village today. The readers already handle nothing: a store with no history
   renders a dash rather than a wrong number.
   ⚠️ KEEP THE EXPORT NAMES IDENTICAL. newstore.mjs refuses to build a snapshot
   if they drift, because a missing export is an import error at a new store,
   in a file nobody would think to open. */
export const NOTE = "Imported from $ Audit Sheet";
export const SEED = [];
