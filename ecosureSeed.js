/* ── ecosureSeed.empty.js ───────────────────────────────────────────────────
   THE CLONE'S COPY. `newstore.mjs` finds every `*.empty.js` beside its real
   file and copies THIS one over `ecosureSeed.js` in a new store.

   WHAT IS LEFT BEHIND: this store's real Ecosure round — the date, the finding
   codes, the severities and the inspector's wording of each finding.

   ⚠️⚠️ THIS IS THE ONE OF THESE FILES THAT REACHED A BROWSER. The others are
   read by `worker.js` alone and are gated there. `ECOSURE_SEED` is imported by
   `FoodSafetyWalkthrough.jsx`, so it is bundled and shipped, and Gate City's
   Q2-2026 findings were measured inside `guilford-hub`'s built assets on Aug 18
   2026. Grep a clone's `dist/` for the round id before believing otherwise.

   ⚠️ EMPTY IS A WORKING STATE. `FoodSafetyWalkthrough` seeds its state from this
   and the Village has run on `{}` since it was scrubbed by hand. */
export const ECOSURE_SEED = {};
