/* ══════════════════════════════════════════════════════════════════════════
   weekCutReport.js — THE SUNDAY MESSAGE. WHAT TO CUT, AND EXACTLY WHERE.

   Matt, Aug 7 2026: "I'd like a Sunday report dm'd to me with a daily summary
   of what to cut for each daypart and area so I can make the schedule cuts",
   then, when asked how much detail: "i want to know what to cut exactly where
   so when im cutting im not guessing."

   ★ LEAF. Imports nothing. It is handed a plan from laborEngine.weekCutPlan
   and turns it into words; it cannot read storage and cannot send anything.
   The arithmetic is tested where it lives, the wording is tested here.

   ⚠️⚠️ IT SAYS WHAT THE NUMBER IS. The Aug 7 sweep found the daypart DMs
   appending "Based on Thursdays, last 4 weeks — not live" to a figure that was
   actually one day's typed plan against that day's budget. A leader who reads
   a false basis once stops believing the next one. This is a PLAN against a
   BUDGET, for days that are already rostered, and the footer says exactly that
   and nothing more.

   ⚠️ A DAY WITH NOTHING ROSTERED IS ABSENT, NOT ZERO. weekCutPlan drops it,
   and this names the missing days instead of printing "cut 0 h" — which would
   read as "Friday is fine" when the truth is nobody has built Friday yet.
   ══════════════════════════════════════════════════════════════════════════ */

const r0 = (n) => Math.round(Number(n) || 0);

/* ★ ROUND THE PARTS SO THEY ADD UP TO THE ROUNDED WHOLE.
   🐛 Without this the first real output read "Bkfst 6 · DT 2 · FC 1 · back 4",
   which is seven. Each area rounded on its own. It is the same defect App.jsx
   already carries a scar for ("front 3 · back 3 · 7 h"), and on a message whose
   entire job is "do not guess", a row that contradicts itself is worse than no
   row. Largest remainder, sign preserved. */
function apportion(total, parts) {
  const t = r0(total);
  const vals = (parts || []).map((v) => Number(v) || 0);
  const sign = vals.map((v) => (v < 0 ? -1 : 1));
  const abs = vals.map(Math.abs);
  const floors = abs.map(Math.floor);
  let left = Math.abs(t) - floors.reduce((a, b) => a + b, 0);
  /* If the parts genuinely do not describe the total, show them unadjusted
     rather than inventing units to close a gap that means something. */
  if (!Number.isFinite(left) || left < 0 || left > vals.length) return vals.map(r0);
  const order = abs.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  const out = floors.slice();
  for (let k = 0; k < order.length && left > 0; k += 1) { out[order[k][1]] += 1; left -= 1; }
  return out.map((v, i) => v * sign[i]);
}
const DAY_LABEL = { Mon: "Mon", Tue: "Tue", Wed: "Wed", Thu: "Thu", Fri: "Fri", Sat: "Sat" };
const SHORT = { Breakfast: "Bkfst", Lunch: "Lunch", Afternoon: "Aftn", Dinner: "Dinner" };

/* "2026-08-10" → "8/10". No leading zeros; this is read on a phone. */
export const md = (iso) => {
  const [, m, d] = String(iso || "").split("-");
  return m && d ? `${Number(m)}/${Number(d)}` : String(iso || "");
};

/* One daypart line. Areas are DT / FC / back when the sales mix is measurable,
   front / back when it is not.
   ⚠️ AN AREA UNDER HALF AN HOUR IS DROPPED FROM THE LINE, not printed as 0.
   "DT 0" invites somebody to go and cut nothing from drive thru. */
export function daypartLine(part, hasDtFc) {
  const amt = r0(part && part.amt);
  if (Math.abs(amt) < 1) return null;              // nothing worth walking over
  const useDtFc = hasDtFc && part.dt != null && part.fc != null;
  const raw = useDtFc ? [part.dt, part.fc, part.boh] : [part.foh, part.boh];
  const labels = useDtFc ? ["DT", "FC", "back"] : ["front", "back"];
  const share = apportion(amt, raw);
  const bits = [];
  share.forEach((v, i) => { if (Math.abs(v) >= 1) bits.push(`${labels[i]} ${Math.abs(v)}`); });
  const where = bits.length ? `  ${bits.join(" · ")}` : "";
  return `  ${SHORT[part.dp] || part.dp} ${amt > 0 ? "" : "+"}${Math.abs(amt)}${where}`;
}

/**
 * The whole DM, or null when there is nothing to say.
 *
 * `plan` is laborEngine.weekCutPlan's return. `expected` is the list of ISO
 * dates the week SHOULD have had, so days with no roster can be named.
 *
 * ⚠️ NULL WHEN NO DAY IS ROSTERED. On a Sunday before anybody has built the
 * week that is the normal state, and a message saying "nothing to cut" would
 * be actively wrong.
 */
export function weekCutMessage(plan, expected = []) {
  if (!plan || !Array.isArray(plan.days) || !plan.days.length) return null;
  const hasDtFc = plan.dtShare != null;
  const lines = [];
  const first = plan.days[0], last = plan.days[plan.days.length - 1];
  lines.push(`*Cuts for the week* · ${md(first.iso)}–${md(last.iso)}`);
  lines.push("");

  plan.days.forEach((d) => {
    const cut = r0(d.over);
    const head = cut > 0
      ? `*${DAY_LABEL[d.dow] || d.dow} ${md(d.iso)}* · cut ${cut} h`
      : cut < 0
        ? `*${DAY_LABEL[d.dow] || d.dow} ${md(d.iso)}* · ${Math.abs(cut)} h of room`
        : `*${DAY_LABEL[d.dow] || d.dow} ${md(d.iso)}* · on budget`;
    lines.push(head);
    if (cut !== 0) {
      (d.dayparts || []).forEach((p) => {
        const l = daypartLine(p, hasDtFc);
        if (l) lines.push(l);
      });
    }
  });

  /* Days the week should have had and does not. Named, because silence here
     reads as "that day is fine". */
  const got = new Set(plan.days.map((d) => d.iso));
  const missing = (expected || []).filter((iso) => !got.has(iso));
  if (missing.length) {
    lines.push("");
    lines.push(`Not built yet: ${missing.map(md).join(", ")}`);
  }

  lines.push("");
  lines.push("Scheduled hours against each day's budget. Only days already rostered.");
  return lines.join("\n");
}
