/* ══════════════════════════════════════════════════════════════════════════
   facilitiesSeed.empty.js — the version a new store gets. `newstore.mjs`
   copies this over facilitiesSeed.js while it builds the snapshot.

   ⚠️ WHAT IT REPLACES IS ONE BUILDING'S PUNCH LIST, not a template. Thirty-five
   open items about one restaurant's canopy lights, bollards, penny tile and
   dumpster pin, each with a named contractor against it, plus four actions
   naming the operator, the CFA facilities rep and the contractor's contact by
   first name. None of it is true anywhere else, and a list of repairs that have
   never been needed is worse than an empty one: somebody works it.

   ⚠️ THE SECOND STORE PROVED THIS THE HARD WAY. Their punch-list header still
   asserted "19 items · assigned to Sterling · work orders being issued" over a
   list with nothing in it. A heading stating a count the list below contradicts
   is the kind of wrong that still looks reasonable, and it survived one sweep
   because an earlier pass had taken a phone number out of the same header and
   left a note that read as settled.

   ⚠️ EMPTY IS A WORKING TILE. Facilities writes only when somebody taps Save,
   so an empty seed means the store enters its own first item and nothing is
   ever seeded behind them.
   ══════════════════════════════════════════════════════════════════════════ */

export const SEED = [];

export const ACTIONS = [];
