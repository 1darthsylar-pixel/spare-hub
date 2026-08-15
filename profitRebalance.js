/* ============================================================================
   profitRebalance.js — Gate City Hub

   Fixed-total multiplier math for Profit Share. LEAF MODULE — imports
   nothing, so it stays node-testable and can never join an import cycle.

   Matt, Aug 1 2026: "she adjusts the multiplier without adding to the
   total. The priority is executive first (don't adjust) then director
   and down."

   THE RULE: a tier's multiplier SUM never moves. Whatever one group gains,
   the groups below the executives give up — most senior giver first. The
   groups array runs junior → senior (sheet order), so givers walk from the
   top down, skipping the edited group and every protected one. Lowering a
   multiplier hands the freed share to the most senior unprotected group.
   Executives are protected: never auto-adjusted — though editing THEIR
   multiplier still rebalances everyone below, total held.

   Saved configs predate the `protected` flag, so a group whose name says
   "executive" is treated as protected too — rename-resistant enough for
   this store, and the flag wins wherever it exists.
   ============================================================================ */

const r4 = (n) => Math.round(n * 10000) / 10000;

export const isProtectedGroup = (g) =>
  !!g && (g.protected === true || /executive/i.test(g.name || ""));

/* rebalanceMult(groups, id, tierKey, rawValue)
   → { next, took: [[groupName, delta]] }   on success
   → { error: "short" | "nowhere" | "unknown group" }  when it can't be done
   `next` is a fresh groups array (mult maps copied); `took` names every
   automatic adjustment so the tile can say out loud what moved. */
export function rebalanceMult(groups, id, tierKey, rawValue) {
  const v = Math.max(0, parseFloat(rawValue) || 0);
  const edited = (groups || []).find((g) => g.id === id);
  if (!edited) return { error: "unknown group" };
  const old = Number(edited.mult?.[tierKey]) || 0;
  const delta = r4(v - old);
  const next = groups.map((g) =>
    g.id === id ? { ...g, mult: { ...g.mult, [tierKey]: v } } : { ...g, mult: { ...g.mult } }
  );
  if (delta === 0) return { next, took: [] };

  const givers = [...next].reverse().filter((g) => g.id !== id && !isProtectedGroup(g));
  const took = [];

  if (delta > 0) {
    let need = delta;
    for (const g of givers) {
      if (need <= 0) break;
      const have = Number(g.mult?.[tierKey]) || 0;
      const take = r4(Math.min(have, need));
      if (take > 0) {
        g.mult[tierKey] = r4(have - take);
        took.push([g.name, -take]);
        need = r4(need - take);
      }
    }
    if (need > 0) return { error: "short" };
  } else {
    const g = givers[0];
    if (!g) return { error: "nowhere" };
    g.mult[tierKey] = r4((Number(g.mult?.[tierKey]) || 0) - delta);
    took.push([g.name, r4(-delta)]);
  }
  return { next, took };
}
