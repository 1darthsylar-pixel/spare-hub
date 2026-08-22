// aiSummary.js — Daily ops digest for the Hub
// -----------------------------------------------------------------------------
// Generates a natural-language "state of the store this morning" summary from
// the Hub's own KV data, caches it once per day, and serves BOTH surfaces:
//   1) the morning Slack post  (worker.js JOB 8)
//   2) the Today block         (worker.js GET /api/ai-summary)
//
// Generated ONCE by the morning job, cached under ai-summary:{YYYY-MM-DD}. The
// Today block reads that cache — no second API call, instant render.
//
// Runs in the Worker, so it takes a `kv` interface { get, set } that worker.js
// wires from its existing sbGet/sbSet helpers, plus the already-computed
// `todos` list from worker.js buildTodaysTodos() (no key logic duplicated here).
//
// LEADER (tier-2) digest: a SECOND, per-person path lives at the bottom of this
// file (buildLeaderDigest / getLeaderDigest). It is cached separately per leader
// and NEVER touches the director cache/prompt above — directors are unaffected.
// -----------------------------------------------------------------------------

import { eosPeriod } from "./eosPeriod.js";
import { SL_METRIC_DEFS, SL_LEAD_SLOTS, SL_DAYPART_KEYS, slParseMSS, slFmtMSS, slCreditedFor, slOwnerTagsFor, SCAN_GREEN, SCAN_AMBER, TX_BANDS_FALLBACK, SOS_GREEN, SOS_RED, AHA_GREEN, AHA_RED } from "./slScorecardDefs.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// claude-sonnet-5 = best prose. Swap to claude-haiku-4-5-20251001 for lower cost
// on a task this simple. Docs: https://docs.claude.com/en/api/overview
export const MODEL = "claude-sonnet-5";
/* 🐛🐛 600 WAS NOT ENOUGH AND THE DIGEST HAS BEEN THE FALLBACK LIST FOR DAYS.
   Hannah, Aug 11 2026: "the AI summary isn't showing who ran the best shifts for
   each area on the previous business day anymore. We want that feature back".

   Nothing was wrong with the feature. Every stored digest carries
   `degraded: "cut off by the token limit"` — Aug 8, 9, 10 and 11, three of them
   reading "0 of ~8 bullets", meaning the model spent the whole budget without
   completing a single bullet. digestShortfall then correctly refused the
   fragment, retried once, and fell back to plainDigest.

   ⚠️ AND plainDigest HAS NO RECOGNITION LINE. It prints off-goal metrics,
   equipment and todos, and deliberately nothing else — so the
   shoutout is the FIRST thing lost every time the model call comes up short,
   while the rest of the digest still looks broadly right. That is exactly what
   Hannah saw: a summary that reads fine and has quietly stopped naming anybody.
   The facts were never missing. `bestShifts` was populated correctly on every
   one of those days, with real names in it.

   ⚠️ THE SHOUTOUT IS THE FIRST BULLET THE PROMPT ASKS FOR, so "0 bullets"
   means it was the first casualty, not a coincidence. */
const MAX_TOKENS = 2000;

function pct(n) { return n == null ? null : Math.round(Number(n) * 10) / 10; }

// Bump when either SYSTEM_PROMPT changes. It rides in `facts`, so it lands in
// the cache `sig` — which means a prompt edit invalidates the cached digest the
// same way a data change does. Without this, editing the wording below has NO
// visible effect until the underlying numbers happen to move.
/* ⚠️ BUMP THIS WHENEVER THE PROMPT CHANGES. It rides in the cache signature, so
   a stale digest written under the old prompt is invalidated the moment this
   moves. Forgetting it means today's readers keep yesterday's shape of briefing
   and the change looks like it did not ship.
   ⚠️⚠️ AND WHENEVER ANYTHING ELSE ABOUT GENERATION CHANGES, not only the wording.
   MAX_TOKENS is not part of `facts`, so raising it changes nothing for a day
   that already has a cached digest: the sig still matches and the cache is
   returned. Today's degraded digest would have sat there until the numbers
   happened to move, and the fix would have looked like it did not ship — the
   precise failure the paragraph above describes, reached by a different door.
   4 = the Aug 4 2026 rebuild: recognition first, then 3-5 opportunities.
   5 = Aug 11 2026, MAX_TOKENS 600 → 2000. Same prompt, new budget. */
/* 6 = trainer tasks left the Morning Ops Digest (Bri, Aug 11 2026). This sits
   inside `facts`, which IS the cache signature, so bumping it regenerates every
   cached digest instead of serving yesterday's wording with today's rules.
   7 = Aug 13 2026, the store's own name replaced a hardcoded one in both
   prompts, and the two example first names came out with it.
   ⚠️ THE NAME ITSELF ALSO RIDES IN `facts`, one line below this, and that is a
   SEPARATE mechanism from this counter rather than a belt on the same braces.
   This number moves when WE change the wording; the name moves when THE STORE
   renames itself in Store Settings. Without the second one a store could
   rename itself and keep reading a digest written under the old name until its
   numbers happened to move. */
const PROMPT_VERSION = 7;

// Mirrors App.jsx KPI_ROWS (same ids, same labels, same formatting) so the
// digest and the dashboard strip read one feed and describe it identically.
// s4 (SOS) and s7 (promotion-ready) live in the full EOS tile, not here.
// Goals print at their PUBLISHED precision (27.56%, not 27.6%) — the strip shows
// the exact goal, and a digest quoting a different one reads like a second source.
const exact = (v) => String(Math.round(Number(v) * 100) / 100);
const METRIC_ROWS = [
  { id: "s1", label: "sales growth",  fmt: (v) => `${v > 0 ? "+" : ""}${pct(v)}%`, gfmt: (v) => `${exact(v)}%`,  goalPrefix: "+" },
  { id: "s2", label: "food cost",     fmt: (v) => `${pct(v)}%`,        gfmt: (v) => `${exact(v)}%`, goalPrefix: "\u2264" },
  { id: "s3", label: "labor",         fmt: (v) => `${pct(v)}%`,        gfmt: (v) => `${exact(v)}%`, goalPrefix: "\u2264" },
  { id: "s5", label: "turnover",      fmt: (v) => `${pct(v)}%`,        gfmt: (v) => `${exact(v)}%`, goalPrefix: "\u2264" },
  { id: "s6", label: "evals on-time", fmt: (v) => `${Math.round(v)}%`, gfmt: (v) => `${exact(v)}%`, goalPrefix: "\u2265" },
  { id: "s8", label: "cash variance", fmt: (v) => `$${exact(Math.abs(v))}`, gfmt: (v) => `$${exact(v)}`, goalPrefix: "\u2264" },
];

// ---- data collection --------------------------------------------------------
// Compact, model-ready snapshot. Only raw facts — the model writes the prose.
/* ═══ WHO RAN THE BEST SHIFT YESTERDAY, PER AREA ═══════════════════════════
   Matt, Aug 4 2026: "I want the leaders to be recognized for best shift in dt,
   foh and boh for last days data entry."

   ⚠️ IT READS THE SAME TABLE THE SCORECARD SCORES FROM. slScorecardDefs owns
   which metrics belong to which lead slot, so a leader is credited here exactly
   as they are credited on their own Scorecard. A second opinion about who did
   well would be worse than no opinion — the two would disagree in public.

   ⚠️ IT NAMES NOBODY WHEN THE DAY IS THIN. An area with no numbers entered, or
   nobody in the slot, is skipped rather than crowned. Recognition that goes to
   whoever happened to be scheduled is worth nothing, and the team works out the
   difference in about a week.

   Scored green 2, amber 1, red 0, averaged across everything that person owned
   that day. Ties go to whoever was credited on more metrics — a clean sweep of
   four beats a clean sweep of one.  */
async function bestShiftsByArea(kv, prevDay, carsGoal) {
  const out = {};
  let day = null;
  try { day = await kv.get(SL_DAILY(prevDay)); } catch { return out; }
  if (!day || typeof day !== "object") return out;

  const tally = {};                      // area -> id -> {name, pts, n}
  SL_DAYPARTS.forEach((dpKey) => {
    const e = day[dpKey];
    if (!e) return;
    for (const slot of SL_LEAD_SLOTS) {
      const who = e[slot.field];
      if (!who) continue;
      for (const m of SL_METRIC_DEFS) {
        if (m.owner !== slot.owner) continue;
        const raw = e[m.key];
        const n = m.score === "sosTime" ? slParseMSS(raw)
          : (raw === "" || raw === null || raw === undefined ? null : Number(raw));
        if (n === null || Number.isNaN(n)) continue;
        const rag = slRag(m, n, carsGoal);
        if (rag === "gray") continue;
        const area = (tally[slot.owner] = tally[slot.owner] || {});
        const row = (area[String(who)] = area[String(who)] || { id: String(who), pts: 0, n: 0 });
        row.pts += rag === "green" ? 2 : rag === "amber" ? 1 : 0;
        row.n += 1;
      }
    }
  });

  /* Ids are what the Scorecard stores; a shoutout has to say a name. Read once,
     and if the roster will not load nobody is named — a recognition line reading
     "tm27 ran the best drive-thru" is worse than no line. */
  let byId = {};
  try {
    const roster = await kv.get("gcfcr-hr-team-v1");
    if (Array.isArray(roster)) {
      for (const m of roster) {
        if (m && m.id) byId[String(m.id).trim().toLowerCase().replace(/^tm/, "")] = m.name;
      }
    }
  } catch { /* nobody gets named */ }
  const nameOf = (id) => byId[String(id || "").trim().toLowerCase().replace(/^tm/, "")] || "";

  for (const [area, people] of Object.entries(tally)) {
    const ranked = Object.values(people)
      .filter((r) => r.n > 0)
      .sort((a, b) => (b.pts / b.n) - (a.pts / a.n) || b.n - a.n);
    const top = ranked[0];
    if (!top) continue;
    /* 🐛 THIS BAR WAS TOO HIGH AND ONLY THE KITCHEN EVER GOT NAMED (Matt, Aug 4
       2026, reading the first live digest: "Missing the front leads").
       It required half marks — an average of 1 out of 2 — which the kitchen
       clears on a normal day because its three metrics run green, while
       drive-thru and front counter each pair a speed metric that is usually
       amber with a volume metric graded against goal that is often red. Average
       0.5, filtered out, every single day. So a rule written to avoid faint
       praise quietly turned a three-area shoutout into a kitchen award.
       ⇒ The bar is now "scored something above red at least once". This is a
       RELATIVE award — best shift in that area — so the best of a rough day
       still ran the best shift. It stays silent only when an area was red
       across the board, which is the one case where naming somebody would be
       an insult dressed as praise. */
    if (top.pts <= 0) continue;
    const name = nameOf(top.id);
    if (!name) continue;
    out[area] = { name, score: Math.round((top.pts / top.n) * 50), metrics: top.n, of: ranked.length };
  }
  return out;
}

async function collectFacts(kv, dateStr, todos, prevDay, storeName) {
  const facts = {
    date: dateStr,
    promptVersion: PROMPT_VERSION,
    /* ⚠️ IN `facts` BECAUSE `facts` IS THE CACHE SIGNATURE, not because the
       model reads it from here — it does not, it reads it from the system
       prompt. This is the ONLY thing that makes a rename take effect: without
       it, a store that changes its name in Store Settings keeps being served a
       cached digest written under the old one until its numbers happen to move.
       ⚠️ `|| null` so an absent name is one stable value. `undefined` is
       dropped by JSON.stringify and "" is not, so a store with no name set
       would otherwise flip signature the moment one arrived, which is right,
       and flip it again on every read where the brand lookup timed out, which
       is not. */
    storeName: storeName || null,
    offGoal: [], onGoal: [], notReporting: [],
    equipment: null, todos: todos || [],
    bestShifts: {},
  };

  /* Yesterday's best shift per area. Failing to read it must never cost the
     rest of the digest — a missing shoutout is a quiet day, a thrown error is
     no briefing at all. */
  if (prevDay) {
    try {
      const goalsObj = (await kv.get(SL_GOALS)) || {};
      const rawCars = goalsObj.cars;
      let carsGoal = SL_CARS_GOAL_DEFAULT;
      if (typeof rawCars === "number" && !Number.isNaN(rawCars)) carsGoal = rawCars;
      else if (rawCars && typeof rawCars === "object") {
        const ns = Object.values(rawCars).map(Number).filter((n) => !Number.isNaN(n) && n > 0);
        if (ns.length) carsGoal = ns.reduce((a, b) => a + b, 0) / ns.length;
      } else if (rawCars != null && rawCars !== "" && !Number.isNaN(Number(rawCars))) carsGoal = Number(rawCars);
      facts.bestShifts = await bestShiftsByArea(kv, prevDay, carsGoal);
      facts.bestShiftsDay = prevDay;
    } catch { /* quiet day */ }
  }

  // Financial + HR + cash — from the consolidated EOS scorecard that FCRPage /
  // HRConsole / CashAudit already publish to.
  //
  // ⚠️ SAME KEY AS THE DASHBOARD KPI STRIP (App.jsx reads eos:scorecard:{period}
  // too). METRIC_ROWS mirrors App.jsx KPI_ROWS row-for-row, so the digest and the
  // strip can never disagree about which numbers matter or what their goals are.
  // Severity is NOT invented here: producers publish `hit` per row and the strip
  // colours from it, so the digest sorts on the SAME flag. Binary on purpose —
  // matching the Company Health ring, which is deliberately not weighted.
  try {
    const sc = (await kv.get(`eos:scorecard:${eosPeriod()}`)) || {};
    for (const m of METRIC_ROWS) {
      const cell = sc[m.id] || {};
      const a = cell.actual;
      const hasActual = a !== null && a !== undefined && String(a).trim() !== "";
      if (!hasActual) { facts.notReporting.push(m.label); continue; }

      // ⚠️ PRODUCERS PUBLISH DISPLAY STRINGS, NOT NUMBERS — "29.2%", "$14.00",
      // "+9.3%", "\u2264 8%" — because EOSTile renders them as text. Number("29.2%")
      // is NaN, so formatting them here produced "NaN%" in the digest while the
      // dashboard strip, reading the SAME key, showed the real figure. The model
      // was then handed NaN values and dutifully reported the store's numbers as
      // invalid readings.
      //
      // App.jsx hit this exact bug in July and fixed it the same way: show what
      // was published, and only format when a producer sends a raw number. The
      // two surfaces read one feed, so they must also parse it identically.
      const show = (v, f) => {
        if (typeof v === "number") return Number.isFinite(v) ? f(v) : null;
        const t = String(v).trim();
        return t === "" ? null : t;
      };

      const value = show(a, m.fmt);
      if (value === null) { facts.notReporting.push(m.label); continue; }

      const g = cell.goal;
      const goalShown = (g === null || g === undefined || String(g).trim() === "") ? null : show(g, m.gfmt);
      const entry = {
        metric: m.label,
        // A published goal usually arrives WITH its comparator ("\u2264 8%"). Prefixing
        // that again yields "\u2264\u2264 8%", so only add one when it's missing.
        goal: goalShown === null
          ? null
          : (/^[+\u2264\u2265<>=-]/.test(goalShown) ? goalShown : `${m.goalPrefix}${goalShown}`),
        value,
      };
      (cell.hit === true ? facts.onGoal : facts.offGoal).push(entry);
    }
  } catch (e) { facts.metricsError = String(e); }

  /* ⚠️ TRAINER WEEKLY CLEANING IS NO LONGER READ HERE (Bri, Aug 11 2026):
     "remove it from the Morning Ops Digest — please move it to @trainers
     instead." JOB 6 still writes gcfcr-trainer-tasks-v1 and still posts the
     list; it posts to #trainers now, and the per-trainer pushes are unchanged.
     Nothing about the data went away, only this digest's use of it.
     ⚠️ THE LEADER DIGEST NO LONGER MENTIONS IT EITHER. It was deliberately
     left in place on the first pass, because she had named the Morning Ops
     Digest and only that, and removing more on an inference about a scheduled
     job is not a call to make quietly. Asked, and she answered: "Remove it
     from the digest directors get." Both are gone now, on her word rather
     than on a guess. */

  // Equipment weekly reminder — flag AND stamp, see equipmentReminder().
  try {
    const msg = await equipmentReminder(kv, dateStr);
    if (msg) facts.equipment = { active: true, message: msg };
  } catch (e) { /* skip */ }

  return facts;
}

/* ── Is the equipment log actually outstanding? ──────────────────────────
   ★ THE FLAG ALONE IS NOT THE TRUTH, AND TRUSTING IT COST 11 DAYS.
   `gcfcr-equip-reminder-v1` is RAISED by the Monday `equip-reminder-flag`
   job. Until Jul 28 2026 nothing ever lowered it, so it sat `active:true`
   from Jul 17 to Jul 28 and this digest repeated "Equipment Check Log needs
   to be completed this week" every single morning — including the day AFTER
   a log was submitted. The in-app banner hid it by self-expiring after seven
   days; the digest had no such guard, so the digest was the only place the
   staleness showed and nobody could trace it back.

   EquipmentLog.jsx now clears the flag on submit. This is the belt to that
   braces: the STAMP is the record of work actually done, so even if a
   clearer is ever missed again, a log filed this week suppresses the nag.
   Reminder fires only when the flag is up AND no stamp exists for this week.

   Date-only UTC arithmetic on an already-ET `dateStr`, so DST can't shift
   which week a day belongs to. */
function mondayIsoOf(iso) {
  const parts = String(iso || "").split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const dow = dt.getUTCDay();                      // 0 Sun … 6 Sat
  dt.setUTCDate(dt.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return dt.toISOString().slice(0, 10);
}

async function equipmentReminder(kv, dateStr) {
  let flag = null;
  try { flag = await kv.get("gcfcr-equip-reminder-v1"); } catch (e) { return null; }
  if (!flag || !flag.active) return null;
  try {
    const st = await kv.get("gcfcr-equip-stamp-v1");
    const wk = mondayIsoOf(dateStr);
    if (st && st.iso && wk && mondayIsoOf(st.iso) === wk) return null;  // done this week
  } catch (e) { /* unreadable stamp: fall through to the flag, never silently hide a real miss */ }
  return flag.message || "Equipment Check Log needs to be completed this week.";
}

// ---- prompt -----------------------------------------------------------------
/* ⚠️⚠️ THE STORE'S NAME IS AN ARGUMENT, NEVER A CONST IN THIS FILE, and the
   reason is not tidiness. This string is INSTRUCTIONS TO A MODEL, so a name
   left here does not print wrong at another store, it makes the AI believe it
   is briefing a different restaurant and write accordingly. That is the one
   kind of hardcoded name that survives every visual check, because the output
   looks completely normal.
   ⚠️ AND A CONST WOULD BE WRONG EVEN HERE. The name is resolved per request in
   worker.js and handed in, so a store renaming itself in Store Settings takes
   effect on the next digest. Capturing it at import would freeze whatever was
   deployed. */
const storeClause = (storeName) => (storeName ? ` (${storeName})` : "");

/* ⚠️ NO NAME IS A WORKING STATE, and it is the right failure. With the name
   missing the model is told "a single Chick-fil-A restaurant" and briefs the
   numbers it was given, which is correct and merely anonymous. Substituting a
   guess would be confidently wrong to a director at 5am. */
const SYSTEM_PROMPT = (storeName) => `You are the operations briefer for a single Chick-fil-A restaurant${storeClause(storeName)}. You receive a JSON snapshot of the store's own data and write ONE short digest a director reads on the Hub dashboard.

The snapshot has already classified every metric for you:
- "offGoal" — measured and MISSING its goal. These are the real problems.
- "onGoal" — measured and meeting its goal. These are NOT problems.
- "notReporting" — no number entered yet. Not a problem either; the data just isn't in.

"bestShifts" names who ran the best shift YESTERDAY in each area — dt (drive-thru), foh (front counter), boh (kitchen). It is already scored and already filtered: an area only appears when somebody genuinely earned it. "metrics" is how many numbers they were judged on and "of" is how many leaders were in that area.

Rules:
- Do NOT open with a greeting, salutation, or the reader's name ("Good morning", "Hi <name>", etc.), and do not reference any time of day. This digest is generated once and displayed all day; the dashboard renders its own time-aware greeting above it. Start directly with the substance.
- Write the digest as a BULLET LIST — 4 to 7 bullets, each on its own line beginning with "• ". Nothing else: no intro line, no closing line, no headers, no numbering, no markdown bold or italics.
- One idea per bullet, one short line each (roughly 12 to 25 words). Never let a bullet run to a second idea — split it or drop the weaker half.
- START WITH THE PEOPLE. If "bestShifts" has anyone in it, the FIRST bullet names them and what they ran well — one bullet covering all the areas that have somebody, e.g. "<first name> ran the best kitchen yesterday and <first name> the best front counter." Use first names. Say the thing they actually did well, not a score. NEVER print the numeric score, the word "points", or the raw area codes dt/foh/boh — say drive-thru, front counter, kitchen.
- If "bestShifts" is empty, do not mention it, do not apologise for it, and do not say nobody qualified. Go straight to the work.
- THEN THE OPPORTUNITIES, 3 to 5 of them, worst first. These come from "offGoal" and then the operational items that need action (open todos, equipment). A director should be able to read the first opportunity and know the biggest thing on the board.
- Everything on goal is compressed into ONE final bullet, or left out entirely.
- TONE: talk to leaders like a coach who respects them, not a compliance report. Name the opportunity and the size of it, then stop — no pep talk, no exclamation marks, no "let's crush it". Confidence, not cheerleading. The recognition bullet carries the warmth; the rest stays factual.
- NEVER describe an "onGoal" metric as a concern, a gap, or something to watch, however small the number looks. It is meeting the store's goal. Do not editorialise about it.
- The classification is authoritative — never re-judge it, and never invent CFA benchmarks or thresholds of your own.
- State off-goal numbers with their goal (e.g. "food cost is running 28.5% against a 27.56% goal"). The todos list is already phrased — fold it in naturally, don't repeat it verbatim.
- Do not mention "notReporting" metrics, missing data, nulls, or anything the store simply hasn't entered yet. Say nothing rather than noting an absence.
- Warm, direct, factual. No hype, no filler, no sign-off.`;

/* ⚠️ `system` IS REQUIRED NOW, AND THE DEFAULT WAS DELETED ON PURPOSE. It used
   to default to SYSTEM_PROMPT, which was a string. SYSTEM_PROMPT is a function
   of the store name now, so a surviving default would have handed the model
   the SOURCE OF A FUNCTION as its instructions — a failure that produces a
   digest-shaped nonsense answer rather than an error. Every caller passes the
   resolved string. */
async function generateDigest(facts, env, system) {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: "Store snapshot:\n" + JSON.stringify(facts, null, 2) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  /* ⚠️ `stop_reason` was being thrown away. It is the only direct signal that a
     response was cut off rather than finished, and on 27 Jul a digest that
     stopped mid-sentence — "Labor is running 22.5% against a 20." — was cached
     and posted to @channel over five real problems it never got to. */
  return { text, stopReason: data.stop_reason || null };
}

/* ═══ THE DIGEST IS CHECKED BEFORE IT IS TRUSTED ══════════════════════════
   Jul 27 2026. The stored digest for that morning was 38 characters against
   629 the day before. It read as a complete sentence — it even ended in a
   full stop — so no punctuation heuristic would have caught it. What gave it
   away was the FACTS: five metrics off goal, trainer tasks at 1 of 11, an open
   equipment log, and the digest mentioned one of them.

   ⇒ The check is not "does this look like prose". It is "does the digest
   account for the problems the facts contain". */
function expectedBullets(facts) {
  // Every off-goal metric earns a bullet, plus one apiece for the operational
  // items the prompt asks for, plus one closing line for everything on goal.
  return (facts.offGoal || []).length
    + (facts.equipment ? 1 : 0)
    + ((facts.todos || []).length ? 1 : 0)
    + ((facts.onGoal || []).length ? 1 : 0)
    /* The recognition bullet counts too. Without this the check under-counts by
       one on any day somebody earned a shoutout, and a digest that dropped a
       real problem to make room for it would read as complete. */
    + (Object.keys(facts.bestShifts || {}).length ? 1 : 0);
}

function digestShortfall(text, facts, stopReason) {
  const bullets = String(text || "").split("\n").filter((l) => l.trim().startsWith("•")).length;
  const want = expectedBullets(facts);
  if (stopReason === "max_tokens") return `cut off by the token limit (${bullets} of ~${want} bullets)`;
  if (!bullets) return "no bullets at all";
  /* Allowed to be shorter than `want` — the prompt deliberately compresses
     on-goal metrics and may merge related items. Half is the line: below that
     it is not editing, it is missing. */
  if (want >= 3 && bullets * 2 < want) return `${bullets} bullet(s) for ${want} reportable items`;
  return null;
}

/* The honest fallback. Not prose, and not trying to be — if the model cannot
   produce a complete digest, a director is better served by the plain list
   than by a confident-sounding fragment that omits four of five problems. */
function plainDigest(facts) {
  const lines = [];
  for (const m of facts.offGoal || []) {
    lines.push(`• ${m.metric}: ${m.value}${m.goal ? ` against a goal of ${m.goal}` : ""}`);
  }
  if (facts.equipment) lines.push(`• ${facts.equipment.message || "Equipment Check Log needs completing this week."}`);
  for (const t of (facts.todos || []).slice(0, 3)) {
    lines.push(`• ${typeof t === "string" ? t : (t.text || t.label || "Open item")}`);
  }
  if ((facts.onGoal || []).length) {
    lines.push(`• Meeting goal: ${(facts.onGoal || []).map((m) => m.metric).join(", ")}.`);
  }
  if (!lines.length) lines.push("• Nothing off goal on the board this morning.");
  return lines.join("\n");
}

// ---- public API -------------------------------------------------------------
// Self-healing cache: each cached digest stores a `sig` — a signature of the
// facts it was written from. build/get re-collect facts on every call (cheap KV
// reads) and compare; the expensive model call runs ONLY when the inputs
// actually changed. So entering Saturday's numbers mid-morning invalidates the
// stale digest on the next dashboard load instead of it lingering all day. The
// morning job (force:true) always regenerates and refreshes the stored sig.
/* ⚠️ `storeName` IS HANDED IN, NEVER LOOKED UP HERE. The Worker's one answer
   to "what is this store called" is `storeBrand(env)`, which reads the store's
   saved Store Settings and falls back to the deployed config. It lives in
   worker.js, and worker.js imports THIS file, so importing it back would be a
   cycle. Passing it in keeps one definition (design rule 8) instead of a second
   one here that would drift from the first. */
export async function buildDailyDigest(kv, env, { dateStr, todos = [], prevDay = null, storeName = null, force = false } = {}) {
  const cacheKey = `ai-summary:${dateStr}`;
  const facts = await collectFacts(kv, dateStr, todos, prevDay, storeName);
  const sig = JSON.stringify(facts);
  if (!force) {
    const cached = await kv.get(cacheKey);
    if (cached && cached.text && cached.sig === sig) return cached;
  }
  /* ⚠️ ONE RETRY, THEN THE PLAIN LIST. A truncated digest used to be cached
     for the rest of the day (the dashboard path never forces a regenerate) AND
     posted to @channel, so a single bad generation reached the whole team and
     then stayed on the dashboard behind them. */
  let { text, stopReason } = await generateDigest(facts, env, SYSTEM_PROMPT(storeName));
  let short = digestShortfall(text, facts, stopReason);
  let degraded = null;
  if (short) {
    try {
      const retry = await generateDigest(facts, env, SYSTEM_PROMPT(storeName));
      const stillShort = digestShortfall(retry.text, facts, retry.stopReason);
      if (!stillShort) { text = retry.text; short = null; }
      else short = stillShort;
    } catch (e) { /* keep the first attempt's shortfall */ }
  }
  /* ⚠️ KEEP WHAT THE MODEL ACTUALLY SAID BEFORE REPLACING IT. `degraded` alone
     records that the call came up short and says nothing about why, so
     diagnosing this meant inferring the cause from a bullet count — "0 of ~8"
     — rather than reading it. The first 300 characters answer in one look
     whether the budget went on prose, on a preamble, or on nothing at all. */
  let sample = null;
  if (short) {
    sample = String(text || "").slice(0, 300);
    degraded = short;
    text = plainDigest(facts);
  }

  const payload = { date: dateStr, text, generatedAt: new Date().toISOString(), sig,
    // Recorded so a degraded morning is findable afterwards rather than being
    // indistinguishable from a quiet one.
    ...(degraded ? { degraded, degradedSample: sample } : {}) };
  await kv.set(cacheKey, payload);
  return payload;
}

export async function getDigest(kv, env, dateStr, todos = []) {
  return buildDailyDigest(kv, env, { dateStr, todos });
}

// Fast path: read the cached digest with a SINGLE KV get — no facts collection,
// no model call. worker.js serves this instantly and kicks buildDailyDigest to
// the background (ctx.waitUntil), so the open never waits on data reads or the
// model, and the cache still self-heals by the next load.
export async function readDigest(kv, dateStr) {
  const cached = await kv.get(`ai-summary:${dateStr}`);
  return cached && cached.text ? cached : null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   LEADER (tier-2) digest — per person, cached separately; the director path
   above is untouched. Content: if the leader led the prior business day, THEIR
   own Leader Scorecard metrics from that day; either way, the standing
   operational reminders (Daily Cleaning, Food Safety) plus any active
   equipment / trainer nudge. worker.js routes tier-2 requests here and passes
   { id } + the prior business-day key (worker.js owns the date logic).

   The scorecard read MIRRORS ShiftLeaderScorecard.jsx exactly:
     key    gcfcr-sl-daily-{YYYY-MM-DD}-v1
     shape  { breakfast:{...}, lunch:{...}, afternoon:{...}, dinner:{...} }
     each daypart: { dtLeadId, fohLeadId, bohLeadId, bohLead2Id, dtSos, fcSos,
                     cars, aha, transactions, txNoAha, goodScans }
     "led"  = person's id fills ANY of the four lead slots in ANY daypart
     credit FOH lead → dtSos, fcSos · BOH lead → sos · both leads → cars, aha
   ═════════════════════════════════════════════════════════════════════════ */

const SL_DAILY = (d) => `gcfcr-sl-daily-${d}-v1`;
const SL_GOALS = "gcfcr-sl-goals-v1";
/* ⚠️ WAS A LOCAL COPY OF THE SAME FOUR STRINGS — see SL_DAYPARTS in the leaf. */
const SL_DAYPARTS = SL_DAYPART_KEYS;
/* 🐛 THIS FILE USED TO OWN A SECOND COPY OF THIS TABLE AND IT HAD DRIFTED
   (Aug 4 2026). It credited DT SOS to the FRONT COUNTER lead — the Scorecard
   owns it under "dt" — so a front counter lead was told their drive-thru time
   ran slow when it was somebody else's number, and the person actually marked
   down never heard. It also carried a "Total SOS" metric the Scorecard does not
   have, and gave DT Cars and AHA an owner of "both".
   ⇒ One table now, in slScorecardDefs.js. Do not re-declare it here. */
const SL_METRICS = SL_METRIC_DEFS;
const SL_CARS_GOAL_DEFAULT = 165;
/* ⚠️ NO LOCAL COPY. These were declared here at SOS_RED = 210 while the
   Scorecard had moved to 300 on Jul 25, so the digest called a 4:00 shift RED
   that the Scorecard called amber — about the same leader, the same morning.
   They come from slScorecardDefs.js now, the same leaf the metric table and the
   scan/transaction bands already come from. Do not re-declare them here. */
const RAG_WORD = { green: "on track", amber: "watch", red: "off track", gray: "no data" };

/* ⚠️ slParseMSS and slFmtMSS moved to the leaf — imported above. Two copies of
   the M:SS reader is how one side starts averaging blanks as zero. */
// mirror ShiftLeaderScorecard scoreMetric → RAG word only (digest shows value + status)
function slRag(m, value, carsGoal) {
  if (value === null || value === undefined || value === "") return "gray";
  if (m.score === "sosTime") {
    const v = Number(value);
    if (Number.isNaN(v)) return "gray";
    if (v < SOS_GREEN) return "green";
    if (v <= SOS_RED) return "amber";
    return "red";
  }
  if (m.score === "ahaPct") {
    const v = Number(value);
    if (Number.isNaN(v)) return "gray";
    if (v >= AHA_GREEN) return "green";
    if (v >= AHA_RED) return "amber";
    return "red";
  }
  /* 🐛 THESE TWO FELL THROUGH TO THE CARS RATIO AND WERE GRADED NONSENSE
     (Aug 4 2026). Good Scans at 99% divided by a 165-car goal is 0.6, so a
     near-perfect number graded RED. Trans w/o AHA is a miss count where zero is
     perfect, and dividing it by a car goal grades a great shift as a disaster.
     It hid because the digest used to carry a shorter metric list that excluded
     both; unifying that list exposed it, and the first symptom was a kitchen
     lead who could never be recognised however well they ran the shift.
     ⚠️ Thresholds come from slScorecardDefs so this grades identically to the
     Scorecard. A leader must never be told two different things about the same
     number by two different screens. */
  if (m.score === "scanPct") {
    const v = Number(value);
    if (Number.isNaN(v)) return "gray";
    if (v >= SCAN_GREEN) return "green";
    if (v >= SCAN_AMBER) return "amber";
    return "red";
  }
  if (m.score === "txCount") {
    const v = Number(value);
    if (Number.isNaN(v)) return "gray";
    /* ⚠️ Bands are PER DAYPART and this function is not told which one. The
       digest averages a metric across the day before grading it, so the
       fallback band (lunch's, the widest) is the honest choice — grading a
       day-average against breakfast's tight band would mark good days red. */
    const b = TX_BANDS_FALLBACK;
    if (v <= b.green) return "green";
    if (v <= b.amber) return "amber";
    return "red";
  }

  // ratio (cars), higher is better, vs goal
  const v = Number(value), g = Number(carsGoal);
  if (Number.isNaN(v) || Number.isNaN(g) || g === 0) return "gray";
  const r = v / g;
  if (r >= 1.0) return "green";
  if (r >= 0.92) return "amber";
  return "red";
}

async function collectLeaderFacts(kv, dateStr, prevDay, person, storeName) {
  // promptVersion rides here for the same reason it does in collectFacts — it
  // lands in the cache `sig`, so editing LEADER_SYSTEM_PROMPT invalidates cached
  // leader digests immediately instead of waiting for the date key to roll over.
  // storeName rides here for the same reason again: a store renaming itself
  // must refresh these too, not only the director digest.
  const facts = { date: dateStr, promptVersion: PROMPT_VERSION, storeName: storeName || null, prevDay, led: false, metrics: [], reminders: {} };

  // ── prior-day Leader Scorecard credit for THIS person ──
  try {
    const day = (await kv.get(SL_DAILY(prevDay))) || null;
    const goalsObj = (await kv.get(SL_GOALS)) || {};
    /* R2, editor-vs-renderer census (Jul 31): goals are PER-DAYPART maps now
       ({ breakfast: 100, lunch: 160, ... }) — the Scorecard's own seed ships
       that shape. This line still assumed the legacy flat number, so
       Number({...}) was NaN and every DT Cars digest line tagged "no data".
       Tolerate both shapes like the Scorecard's goalFor: a number is itself;
       a map averages its numeric dayparts — the digest's value is itself a
       cross-daypart average, so it should face the same kind of goal. */
    const rawCars = goalsObj.cars;
    let carsGoal = SL_CARS_GOAL_DEFAULT;
    if (typeof rawCars === "number" && !Number.isNaN(rawCars)) {
      carsGoal = rawCars;
    } else if (rawCars && typeof rawCars === "object") {
      const ns = Object.values(rawCars).map(Number).filter((n) => !Number.isNaN(n) && n > 0);
      if (ns.length) carsGoal = ns.reduce((a, b) => a + b, 0) / ns.length;
    } else if (rawCars != null && rawCars !== "" && !Number.isNaN(Number(rawCars))) {
      carsGoal = Number(rawCars);
    }
    if (day && typeof day === "object") {
      const bucket = {}; // metricKey → [values]
      let led = false;
      SL_DAYPARTS.forEach((dpKey) => {
        const e = day[dpKey];
        if (!e) return;
        /* 🐛 READ TWO OF THE FOUR SLOTS (Aug 4 2026). The board fills dtLeadId,
           fohLeadId, bohLeadId AND bohLead2Id; this looked only at the middle
           two. A drive-thru lead, and the second BOH lead, got a morning digest
           with no mention of the shift they had just run — "led" never went
           true for them, so the whole metrics block was skipped in silence. */
        if (slOwnerTagsFor(e, person.id).size > 0) led = true;
        SL_METRICS.forEach((m) => {
          if (!slCreditedFor(e, person.id, m)) return;
          const n = m.score === "sosTime"
            ? slParseMSS(e[m.key])
            : (e[m.key] === "" || e[m.key] === null || e[m.key] === undefined ? null : Number(e[m.key]));
          if (n === null || Number.isNaN(n)) return;
          (bucket[m.key] = bucket[m.key] || []).push(n);
        });
      });
      facts.led = led;
      if (led) {
        facts.metrics = SL_METRICS.map((m) => {
          const vals = bucket[m.key] || [];
          if (!vals.length) return null;
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          const rounded = m.score === "sosTime"
            ? Math.round(avg)
            : (m.dir === "low" ? Math.round(avg) : Math.round(avg * 10) / 10);
          const display = m.score === "sosTime" ? slFmtMSS(rounded) : `${rounded}${m.unit}`;
          return { label: m.label, value: display, status: RAG_WORD[slRag(m, rounded, carsGoal)] };
        }).filter(Boolean);
      }
    }
  } catch (e) { /* skip metrics on any error — reminders still send */ }

  // ── operational reminders (standing + data-driven) ──
  const reminders = { dailyCleaning: true, foodSafety: true };
  try {
    const msg = await equipmentReminder(kv, dateStr);
    if (msg) reminders.equipment = msg;
  } catch (e) { /* skip */ }
  /* ⚠️ NO TRAINER REMINDER HERE EITHER (Bri, Aug 11 2026, asked directly and
     answered directly): "Remove it from the digest directors get — I'll have
     eyes on it personally through the new channel." The list lives in
     #trainers now, and a director reading the same thing twice is how a
     channel stops being read. JOB 6 still writes gcfcr-trainer-tasks-v1 and
     still posts the list; the per-trainer pushes are untouched, which she
     confirmed she wanted kept. */
  facts.reminders = reminders;

  return facts;
}

/* Same rule as SYSTEM_PROMPT above, and the same `storeClause`: one definition
   of how a store's name is written into a prompt, so the two cannot drift. */
const LEADER_SYSTEM_PROMPT = (storeName) => `You are the briefer for a shift leader at a single Chick-fil-A restaurant${storeClause(storeName)}. You receive a JSON snapshot for ONE leader and write ONE short digest they read on the Hub, addressed to them directly ("you" / "your").

Rules:
- Do NOT open with a greeting, salutation, or the reader's name ("Good morning", "Hi", etc.), and do not reference any time of day. This digest is cached and displayed all day; the dashboard renders its own time-aware greeting above it. Start directly with the substance.
- Write the digest as a BULLET LIST — 3 to 6 bullets, each on its own line beginning with "• ". Nothing else: no intro line, no closing line, no headers, no numbering, no markdown bold or italics.
- One idea per bullet, one short line each (roughly 12 to 25 words).
- If "metrics" has entries, these are the leader's OWN numbers from the last day they led. The FIRST bullet is anything marked "off track", then "watch", then one bullet acknowledging what's "on track". State each number plainly (e.g. "your DT SOS ran 2:14"). Do NOT print the literal status words "on track / watch / off track" — phrase the standing naturally.
- If "led" is false or "metrics" is empty, do not mention metrics at all — go straight to the reminders.
- Always fold in the reminders present: dailyCleaning → remind them to complete the Daily Cleaning sign-offs; foodSafety → remind them about the Food Safety walkthrough; equipment → mention if present.
- If a value is null or absent, silently skip it — never mention missing data or the word "null".
- Warm, direct, factual. No hype, no filler, no sign-off.`;

/* `storeName` handed in for the same reason as buildDailyDigest above. */
export async function buildLeaderDigest(kv, env, { dateStr, prevDay, person, storeName = null, force = false } = {}) {
  const cacheKey = `ai-summary:leader:${person.id}:${dateStr}`;
  const facts = await collectLeaderFacts(kv, dateStr, prevDay, person, storeName);
  const sig = JSON.stringify(facts);
  if (!force) {
    const cached = await kv.get(cacheKey);
    if (cached && cached.text && cached.sig === sig) return cached;
  }
  /* ⚠️ generateDigest now returns { text, stopReason }. Destructured here too —
     leaving `const text = await …` would have cached the whole object and the
     leader digest would render "[object Object]". The leader digest is short
     enough that a token cut is unlikely, but a cut is a cut: retry once, and if
     it is still truncated keep the text rather than inventing a fallback, since
     this path has no plain-list equivalent. */
  let { text, stopReason } = await generateDigest(facts, env, LEADER_SYSTEM_PROMPT(storeName));
  if (stopReason === "max_tokens") {
    try {
      const retry = await generateDigest(facts, env, LEADER_SYSTEM_PROMPT(storeName));
      if (retry.stopReason !== "max_tokens") text = retry.text;
    } catch (e) { /* keep what we have */ }
  }
  const payload = { date: dateStr, text, generatedAt: new Date().toISOString(), scope: "leader", sig };
  await kv.set(cacheKey, payload);
  return payload;
}

export async function getLeaderDigest(kv, env, dateStr, prevDay, person) {
  return buildLeaderDigest(kv, env, { dateStr, prevDay, person });
}

// Fast path for the per-leader digest — single KV get, same as readDigest.
export async function readLeaderDigest(kv, personId, dateStr) {
  const cached = await kv.get(`ai-summary:leader:${personId}:${dateStr}`);
  return cached && cached.text ? cached : null;
}
