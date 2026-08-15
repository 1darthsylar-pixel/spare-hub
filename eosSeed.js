/* ══════════════════════════════════════════════════════════════════════════
   eosSeed.empty.js — the version a new store gets. `newstore.mjs` copies this
   over eosSeed.js while it builds the snapshot.

   ⚠️ EMPTY IS A WORKING TILE AND IS WHAT THE SECOND STORE RUNS. `READINESS`
   feeds a readiness section that renders only when it has rows, and the
   injected issue is a one-time seed into `eos:issues` that simply never fires.
   Both are gated on the store number anyway, so an empty array here changes
   nothing about behaviour and everything about what ships.

   ⇒ Do NOT paste the origin store's entries back in. Those are five named
   directors, their setup items, one person's measured hours, a facilitator
   rotation by name, and an issue calling a named leader a bus-factor risk.
   A store fills its own readiness in through the tile, where it is stored
   behind the gate like every other record.
   ══════════════════════════════════════════════════════════════════════════ */

export const INJECT_ISSUES = [];

export const READINESS = [];
