// Two false positives from the Aug 1 sweep, reduced. BOTH must report ZERO.

// profitRebalance.js shape: a for-of loop variable, and a same-named const
// in the SIBLING else branch. Sibling blocks never shadow each other.
export function rebalance(givers, delta, tierKey, r4, took) {
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
  }
  return { ok: true };
}

// worker.js shape: a for-of loop variable `d`, and a later `const d` inside a
// completely different loop further down the same function.
export async function weeklyRollup(env, wk, today, sbGet) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const clean = { FOH: 0, BOH: 0 };
  const cleanDays = { FOH: 0, BOH: 0 };
  for (const area of ["FOH", "BOH"]) {
    for (const d of days) {
      const v = await sbGet(env, `cleaning:${wk}:${area}:${d}`);
      if (!v || typeof v !== "object") continue;
      const ticked = Object.keys(v).filter((k) => v[k] && v[k].checked).length;
      if (ticked > 0) { clean[area] += ticked; cleanDays[area] += 1; }
    }
  }
  let checklistDays = 0;
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today.getTime() - i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    const v = await sbGet(env, `gcfcr-checklists-done-${iso}-v1`);
    if (v) checklistDays += 1;
  }
  return { clean, cleanDays, checklistDays };
}
