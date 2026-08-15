/* ══════════════════════════════════════════════════════════════════════════
   teamScoreboard.js — WHO IS USING THE HUB, BY TEAM.

   Matt, Aug 5 2026, to Hannah and Bri: "use the six Peak Reachers teams as the
   unit. Score tool compliance." Then Aug 7: "i want it to show top to bottom
   and all tool usage. i am overriding", and "I do want to see if a task isn't
   done."

   ★ LEAF. Imports nothing. It is handed the teams and the usage and turns them
   into a ranking and a message. It cannot read storage and cannot send
   anything, which is what makes the arithmetic testable without a single real
   Slack post.

   ═══ WHAT WAS AGREED, AND BY WHOM ═════════════════════════════════════════
   · Bri, Aug 5: "there are not additional tools. Trainer Tasks and Checklists
     are the primary items… for Senior Leaders (TLs and ADs) if there was a way
     to gauge documentation participation that might be worth including." She
     also killed the $500: "if we go overboard with incentives then we are just
     training our leaders to meet us with their responsibilities because
     they're getting rewarded rather than because it's their job." Matt dropped
     it the same hour. THERE IS NO MONEY ATTACHED TO THIS AND THERE SHOULD NOT
     BE.
   · Hannah, Aug 5, on HR grounds: "as long as it is displaying those that are
     doing well and not highlighting the poor performers, it is ok from an HR
     angle." ⚠️ MATT OVERRODE THIS ON AUG 7 and reports Hannah agreed in person.
     Both are recorded here on purpose: the ranking now runs top to bottom, and
     if that is ever questioned this comment is where the decision lives.
   · Still true even under the override: a TEAM appears at the bottom, a PERSON
     never does. Naming individuals is reserved for the top. That is the line
     that survived, and nothing here should cross it without Hannah again.

   ═══ TWO TRAPS MATT NAMED HIMSELF, BOTH HANDLED HERE ══════════════════════
   1. "Per person, not per team. Teams run 11 to 16 people. Raw counts hand it
      to the Rush Masters before anyone starts." So the ranking is a SHARE of
      the team, not a total. On real Aug 2026 data this matters immediately:
      the Nuggets are the smallest team and lead at 82%, while raw opens would
      have handed it to the Rush Masters on headcount alone.
   2. "Only tools that person can actually reach. A team member cannot open
      Financials." Scoring somebody on a tool their role cannot open punishes
      them for their job title. The caller passes `reachable` per person and
      anyone with none is dropped from their team's denominator rather than
      counted as a failure.

   ⚠️ THIS COUNTS OPENS, NOT COMPLETIONS, AND THAT IS A KNOWN GAP. Matt's own
   note says "Opening Ops Checklists and signing nothing is not compliance."
   Completion lives in each tool's own records, not in tool_events, so it is a
   real join that does not exist yet. Counting opens and calling it compliance
   would be the same class of lie as a labor number whose basis is wrong, so
   the message says "opened" and never "completed". Wiring completion is the
   next layer, not a rename of this one.
   ══════════════════════════════════════════════════════════════════════════ */

const pct = (n, d) => (d > 0 ? Math.round((100 * n) / d) : 0);

/**
 * Rank the teams.
 *
 * `teams`    — [{ name, members: [hrId] }]
 * `activity` — { [hrId]: { tools: n } }, already limited to the window
 * `reachable`— optional { [hrId]: n }, how many tools that person's role can
 *              open. Somebody with 0 is not scored; see trap 2 above.
 *
 * Returns rows sorted best first, each { name, people, using, pct, avgTools }.
 * ⚠️ A TEAM WITH NOBODY SCOREABLE IS DROPPED, not shown at 0%. "0% of nobody"
 * is not a result, and a team that appears bottom because its members were
 * excluded would be the worst possible first impression of this post.
 */
export function rankTeams(teams, activity, reachable) {
  const act = activity || {};
  const rows = [];
  for (const t of teams || []) {
    if (!t || !Array.isArray(t.members)) continue;
    const scoreable = t.members.filter((id) => {
      if (!id) return false;
      if (!reachable) return true;
      return (Number(reachable[id]) || 0) > 0;
    });
    if (!scoreable.length) continue;
    let using = 0, tools = 0;
    for (const id of scoreable) {
      const a = act[id];
      const n = a ? Number(a.tools) || 0 : 0;
      if (n > 0) using += 1;
      tools += n;
    }
    rows.push({
      name: String(t.name || "Team"),
      people: scoreable.length,
      using,
      pct: pct(using, scoreable.length),
      avgTools: Math.round((tools / scoreable.length) * 10) / 10,
    });
  }
  /* Share first, then depth, then name. The name tiebreak is not cosmetic: two
     teams on identical numbers must not swap places week to week for no
     reason, because a team that "dropped" without changing anything is how
     people stop believing a scoreboard. */
  return rows.sort((a, b) => b.pct - a.pct || b.avgTools - a.avgTools || a.name.localeCompare(b.name));
}

/**
 * The people to name. Top team only, and only those who actually used it.
 *
 * ⚠️ NEVER RETURNS ANYONE FROM A TEAM THAT IS NOT FIRST. This is the half of
 * Hannah's ruling that survived Matt's override, and it is enforced here
 * rather than left to the caller to remember.
 */
export function topPeople(rows, teams, activity, names, limit = 3) {
  if (!rows || !rows.length) return [];
  const winner = (teams || []).find((t) => t && t.name === rows[0].name);
  if (!winner || !Array.isArray(winner.members)) return [];
  const act = activity || {};
  return winner.members
    .map((id) => ({ id, tools: (act[id] && Number(act[id].tools)) || 0 }))
    .filter((x) => x.tools > 0 && names && names[x.id])
    .sort((a, b) => b.tools - a.tools)
    .slice(0, limit)
    .map((x) => names[x.id]);
}

/* ⚠️ THE HEADING IS ALSO THE ANNOUNCEMENT'S TITLE. Exported so the Worker does
   not retype it into the Hub post and let the two drift apart. */
export const SCOREBOARD_TITLE = "Hub use last week, by team";

/**
 * The post, or null when there is nothing honest to say.
 *
 * ⚠️ NULL WHEN NOBODY USED THE HUB AT ALL. A scoreboard of seven zeroes is not
 * a scoreboard, it is an outage report, and posting it would read as the store
 * failing when the likelier cause is that the week has not happened yet.
 *
 * ★ `opts.plain` DROPS SLACK'S ASTERISKS AND THE HEADING, for the Hub.
 * Aug 13 2026: this scoreboard now posts in BOTH places (Matt: "start with the
 * team scoreboard"). Slack renders `*bold*`; the announcement body is plain
 * text in a `pre-wrap` div, where the same string reads "*The Nuggets* — 82%"
 * with the asterisks showing.
 *
 * ⚠️⚠️ ONE FUNCTION, ONE SET OF WORDS, AND THAT IS THE WHOLE POINT OF THE FLAG.
 * The obvious alternatives are both worse: a second `scoreboardHubMessage`
 * would be design rule 8 (two copies of the sentences, drifting the first time
 * one gets a fix, and this post is READ BY THE WHOLE STORE in two places at
 * once so a drift is visible to everyone), and stripping asterisks with a regex
 * afterwards would silently eat a real one out of a team's name. The flag
 * changes the MARKUP and nothing else; every sentence is written once.
 *
 * ⚠️ THE HEADING IS DROPPED IN PLAIN MODE because an announcement already draws
 * its title above the body. Repeating it is the same line twice on one card.
 */
export function scoreboardMessage(rows, opts = {}) {
  if (!rows || !rows.length) return null;
  if (!rows.some((r) => r.using > 0)) return null;

  const plain = !!opts.plain;
  const b = (s) => (plain ? String(s) : `*${s}*`);

  const lines = [];
  if (!plain) {
    lines.push(b(SCOREBOARD_TITLE));
    lines.push("");
  }
  rows.forEach((r, i) => {
    /* The leader is named, everyone else is a number. No medals down the list —
       Matt asked for top to bottom, not for a podium. */
    const mark = i === 0 ? "🏆 " : `${i + 1}. `;
    lines.push(`${mark}${b(r.name)} — ${r.pct}% used the Hub  ·  ${r.using} of ${r.people}`);
  });

  const people = opts.people || [];
  if (people.length) {
    lines.push("");
    lines.push(
      people.length === 1
        ? `Most tools opened on ${rows[0].name}: ${b(people[0])}.`
        : `Leading the way on ${rows[0].name}: ${people.map((n) => b(n)).join(", ")}.`,
    );
  }

  lines.push("");
  /* Says what the number IS. The Aug 7 sweep found a labor DM whose stated
     basis was wrong, and a leader who reads a false basis once stops believing
     the next one. This counts tools opened, so it says tools opened. */
  lines.push("Counts how many people on each team opened any Hub tool in the last 7 days.");
  return lines.join("\n");
}
