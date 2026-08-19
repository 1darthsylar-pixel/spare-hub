import React, { useState, useEffect, useRef, useMemo } from "react";
/* The one raised look, shared with every tool — see cardStyle.js. */
import { CARD_3D, CARD_3D_SOFT, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
/* Leaf module. The same walker discipline the classes and Prep Work use — see
   the APPLICATIONS block in courseTranslate.js for why the index matters. */
import { collectAppStrings, applyAppStrings } from "./courseTranslate.js";
import { effectiveRole } from "./accessOverrides.js";
import { adminNames, programLabel, STORE } from "./storeConfig.js";
import { kvGet, kvGetResult, kvSet, uploadDoc, signedDocUrl, hubToken } from "./store.js";
/* The internal calendar, for the interview step. ⚠️ THE RULES ARE THE LEAF'S,
   not this file's — the same functions the Calendar tile, Our Teams and
   /api/calendar ask, so "is this slot mine" cannot mean two things. */
import { TYPES_KEY as CAL_TYPES_KEY, slotsKey as calSlotsKey, typeList as calTypeList,
  heldBy as calHeldBy, openSlots as calOpenSlots,
  durationText, joinDuration } from "./calendarStore.js";
// ★ The name-matching rules moved to their own leaf module so HRConsole can
// import them WITHOUT importing this file — which is what let this page finally
// import the class below. See nameMatch.js for why that mattered.
import { normName, nameParts, sameLeader, recMatches, slackIdForLeader,
  resolveLeaderId, stampRecIds, bareId } from "./nameMatch.js";
// ⚠️ SAFE ONLY BECAUSE OF THE ABOVE. Before the extraction this closed a cycle:
// ProfessionalGrowth → Leadership101 → HRConsole → ProfessionalGrowth.
import Leadership101 from "./Leadership101.jsx";

/**
 * ProfessionalGrowth — the role-application pipelines (Team Trainer,
 * Team Leader, Assistant Director). Replaces the Wix Professional Growth page
 * and Bri's email + multiple-Google-Forms process.
 *
 * Built to Bri's spec (Jul 22):
 *  • Every role starts with an Expression of Interest, then STRICTLY SEQUENTIAL
 *    steps — nothing unlocks until the step before it is complete.
 *  • Everything AUTOSAVES so an applicant can stop and resume.
 *  • Applicants edit freely before submitting, never after.
 *  • Slack notifications to Bri at the EOI milestone and on submission.
 *  • THREE different permission models — deliberately NOT flattened:
 *      Trainer          → all leaders may see status
 *      Team Leader      → only Assistant Directors and up may see status
 *      Assistant Dir.   → nobody outside Bri / Ex.Directors / Owner sees anything
 *
 * Recommendation portal (Team Leader step 2): because every leader already has
 * a Hub login, a requested leader gets the task INSIDE the Hub rather than via
 * an emailed link — fewer moving parts and no second login. The applicant only
 * ever sees "Completed by {name}" / "In progress by {name}".
 *
 * Storage
 *  gc-pg-config-v1                  editable content (EOI items, Calendly, PINs)
 *  gc-pg-app-v1:<role>:<slug>       one application per person per role
 *  gc-pg-index-v1                   list for reviewers; merged on write so two
 *                                   applicants saving at once can't clobber it
 * Uploads go to the PRIVATE hr-files bucket and are read back through signed
 * URLs — recommendation letters and EI assessments are personal.
 */

const CONFIG_KEY = "gc-pg-config-v1";
const INDEX_KEY = "gc-pg-index-v1";
const appKey = (role, slug) => `gc-pg-app-v1:${role}:${slug}`;
const USER_KEY = "gcfcr-access-user";
const DIR_KEY = "gc-team-directory-v1";
const DOC_BUCKET = "hr-files";

// Name allowlist PLUS a role fallback. Name-only gating silently locked Bri out
// of her own admin panel: the Hub knows her as "Bri", not "Brianna Moore".
// The role fallback is the durable fix — a newly-appointed LD Director inherits
// access automatically, and a name change can't lock the owner out again.
// Hannah, Jul 25: "I need access to see application submissions on peak
// reachers. Anything that overlaps my HR world, I need eyes on."
// She was locked out by a role-string miss, not by design: her HR role reads
// "Executive Director | HR", and `ADMIN_ROLES` only held the bare
// "executive director". Both her name and every spelling of the role are now
// listed, so a future title edit can't quietly remove her again.
/* ★ THE NAME LIST NOW COMES FROM storeConfig —
   owners.adminNames.professionalGrowth.
   ⚠️ ITS OWN KEY, five entries, and it must stay narrower than Team Resources'
   six. This is the same "looks like the shared one minus an entry, and that is
   the point" reasoning as the role list below: Kyleeka is not named here and
   levelling all four adminNames keys up to the longest would add her to the
   tile holding people's promotion applications and recommendations.
   ⚠️ READ INSIDE THE GATE, NOT INTO A `const` UP HERE, or it captures the
   baked-in default before a store's saved settings are merged. */
/* ⚠️⚠️ THIS TILE DELIBERATELY DOES *NOT* USE adminRoles.TEAM_TOOL_ADMIN_ROLES,
   and the difference is one role: `director`.
   Matt, Aug 7 2026, asked whether a plain Director should administer this tile
   alongside Member Vote, Team Goals, Goal Submissions, Team Resources and Team
   Directory: "not PG". This tile holds people's promotion applications and
   their recommendations, which is a more sensitive thing than a handbook link.
   ⚠️ THIS LIST LOOKS LIKE THE SHARED ONE MINUS AN ENTRY, AND THAT IS THE POINT.
   Do not "finish the refactor" by pointing this at the shared array. It was
   left out by a decision, not by an oversight. */
const ADMIN_ROLES = new Set(["owner", "owner/operator", "executive director",
  "executive director | hr", "human resources", "leadership development director"]);
const AD_UP = new Set(["Assistant Director", "Manager", "Director", "Leadership Development Director",
  "Leadership Director", "Executive Director", "Executive", "Human Resources", "Owner"]);
const LEADERS = new Set(["Team Leader", "Junior Team Leader", "Senior Team Leader", ...AD_UP]);

const norm = (s) => (s || "").trim().toLowerCase();
// ⚠️ MUST stay byte-identical to normName in worker.js / HRConsole.jsx / App.jsx —
// the Slack ID map is keyed with it.
const slugify = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function getViewer() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }

// 🐛 THE RECOMMENDATION-VISIBILITY BUG (Bri, Jul 24): "my Assistant Directors
// and Team Leaders [aren't] getting notifications or being able to see
// recommendation requests in the Team Leaders applications."
//
// CAUSE — TWO NAME SHAPES. The applicant picks leaders from the Meet Our Teams
// directory, which stores SHORT names ("Thanh", "Ashley R."). The signed-in
// person comes from the HR roster via gcfcr-access-user, which stores FULL ones
// ("Thanh Nguyen"). RecInbox compared them with an EXACT lowercase match, so
// "thanh" never equalled "thanh nguyen", `tasks` was always empty, and
// `if (!tasks.length) return null` meant the leader saw NOTHING AT ALL — no
// panel, no empty state, no clue anything had been asked of them.
//
// ⚠️ MATCHING MUST NOT BE LOOSE HERE. A recommendation is confidential; showing
// one to the wrong person is far worse than showing none. So this is deliberately
// STRICTER than the fuzzy matching used elsewhere in the Hub:
//   • first names must match, always
//   • if BOTH sides carry a last initial, that must match too — which is what
//     keeps "Ashley R." and "Ashley Vega" apart
//   • only when one side is first-name-only does the first name alone suffice



// Directory → the leader list the picker uses, ids only.
function leadersFromDirectory(dir) {
  const out = [];
  ((dir && dir.teams) || []).forEach((t) => ((t && t.people) || []).forEach((p) => {
    if (p && p.name && (p.tier === "ad" || p.tier === "tl") && p.hrId != null && String(p.hrId) !== "") {
      out.push({ name: p.name, hrId: String(p.hrId) });
    }
  }));
  return out;
}

/* Walks every application in the index and repairs what it can.
 * ⚠️ RE-READS each application immediately before writing and patches ONLY the
 * recs array — an applicant could be editing at the same moment, and a repair
 * that eats their answers would be far worse than the problem it fixes.
 * `updatedAt` is deliberately NOT bumped: this is a repair, not an edit, and a
 * stalled application should not look freshly touched because of it.
 * ★ Jul 27: this was also filtered to `role === "team-leader"`, so a
 * recommendation on a Trainer or Assistant Director application never got an
 * id stamped and stayed on the name rule forever. Widened with RecInbox. */
async function backfillRecIds() {
  try {
    const leaders = leadersFromDirectory(await kvGet(DIR_KEY));
    if (!leaders.length) return 0;
    const idx = (await kvGet(INDEX_KEY)) || [];
    let total = 0;
    for (const e of idx.filter((x) => x && x.role && x.slug)) {
      try {
        const app = await kvGet(appKey(e.role, e.slug));
        const sd = (app && app.steps && app.steps.l2) || {};
        if (!Array.isArray(sd.recs) || !sd.recs.length) continue;
        if (!stampRecIds(sd.recs, leaders).changed) continue;      // nothing to do — no write

        const fresh = await kvGet(appKey(e.role, e.slug));         // re-read, then patch
        const fsd = (fresh && fresh.steps && fresh.steps.l2) || {};
        const { recs, changed } = stampRecIds(fsd.recs || [], leaders);
        if (!changed) continue;
        await kvSet(appKey(e.role, e.slug), { ...fresh, steps: { ...(fresh.steps || {}), l2: { ...fsd, recs } } });
        total += changed;
      } catch { /* one bad application must not stop the rest */ }
    }
    return total;
  } catch { return 0; }
}

/* ⚠️ `effectiveRole`, NOT `v.role` — see accessOverrides.js. Without this an
   Executive Director reads every application and every recommendation letter by
   role alone, which is the access Bri asked to remove for one named person on
   Jul 28. Her HR title is untouched. */
const isAdmin = (v) => !!v && (adminNames("professionalGrowth").includes(norm(v.name)) || ADMIN_ROLES.has(norm(effectiveRole(v))));

const C = { red: "#E51636", redDeep: "#B21230", navy: "#1A2238", ink: "#141821", sub: "#5B6474",
  line: "#E7E9EF", paper: "#F6F4EF", card: "#FFFFFF", gold: "#E8B23A", green: "#2E9E5B" };
const FONT = "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif";

// ── role definitions ────────────────────────────────────────────────────────
// Structure is fixed (it's the process); wording Bri may want to change lives
// in the editable config.
const ROLES = {
  trainer: {
    label: "Team Trainer", icon: "🌱", statusAudience: "leaders",
    eoiNotify: (n) => `${n} has completed the Trainer Expression of Interest form and is ready to be assigned the Leadership Skills Pathway plan!`,
    eoiPrompt: "Thank you for expressing interest in the role of Team Trainer! There are a few steps to competing this application, including taking the first class of Leadership 101. The application can take time, so plan accordingly if there is a due date set. Once everything is completed, you may schedule an interview and your full application will be reviewed!",
    submitPrompt: "Thank you for submitting your Trainer Application! Once your interview is complete, you will be given a decision to continue with Leadership 101 (requirement before entrance into the leadership team) or receive feedback for areas to continue improving upon. Regardless of this decision, your application will remain in your file. If you have additional questions, please contact the Leadership Development Director.",
    submitNotify: (n) => `${n} has submitted a Trainer application and is ready to review!`,
    steps: [
      { id: "t1", type: "text", title: "Tell us about your leadership style",
        body: "What leadership skills do you feel come naturally and what areas do you feel you want to grow in as you begin pursuing a leadership role?" },
      { id: "t2", type: "check", title: "Complete the 'Leadership Skills' Pathway plan",
        body: "This has been assigned to you. If you need a reset on your password, please reach out to a Director. Once you have completed the Pathway plan, mark as complete. This will be checked for completion and a sufficient timestamp. This plan should take 30-45 minutes to complete." },
      { id: "t3", type: "l101", title: "Complete W1 of Leadership 101",
        body: "Keep in mind that this is only the first week of the course, but for the purposes of this application you will only be taking week 1. You are required to participate in the activities and discussion questions, but you are NOT required to complete the assignment given for week 2. This class is roughly 45 minutes. Once complete and ready for review, mark as complete." },
      { id: "t4", type: "calendly", title: "Schedule an interview",
        body: "Schedule an interview using Calendly! If the timeframes available do not work for you, message the Leadership Development Director." },
    ],
  },
  "team-leader": {
    label: "Team Leader", icon: "🧭", statusAudience: "ad",
    eoiNotify: (n) => `${n} has completed the Team Leader Expression of Interest form!`,
    eoiPrompt: "Thank you for expressing interest in the role of Team Leader! Once all steps are completed your full application will be reviewed!",
    submitPrompt: "Thank you for submitting your Team Leader Application! Once your interview is complete, you will be given a decision to and receive any feedback. If you have additional questions, please contact the Leadership Development Director.",
    submitNotify: (n) => `${n} has submitted a Team Leader application and is ready to review!`,
    steps: [
      { id: "l1", type: "text", title: "Tell us about your growth as a leader",
        body: "How have you developed certain skills since becoming a Trainer? What areas do you feel you need to continue developing as you pursue more responsibility in a different leadership role? Be as detailed as you would like!" },
      { id: "l2", type: "recs", title: "Two letters of recommendation",
        body: "Upload 2 letters of recommendation from Senior Leaders. At least one recommendation needs to be from an Assistant Director. The other can be from an Assistant Director or a Team Leader. Select two leaders to complete these recommendations. They will be notified in the Hub. You will not be able to see the contents of these recommendations, only the status." },
      { id: "l3", type: "calendly", title: "Schedule an interview",
        body: "Schedule an interview using Calendly! If the timeframes available do not work for you, message the Leadership Development Director." },
    ],
  },
  "assistant-director": {
    label: "Assistant Director", icon: "⛰️", statusAudience: "none",
    eoiNotify: (n) => `${n} has submitted an Assistant Director application and is ready to receive a copy of Emotional Intelligence!`,
    eoiPrompt: "Thank you for expressing interest in the role of Assistant Director! The first step is to receive a copy of Emotional Intelligence from a Director. There are copies available in the office. Please pick one up on your next shift and message the Leadership Development Director to communicate you have it. If there are no copies available, let a Director know and one will be ordered for you!\n\nThis book is not meant to be read cover to cover, but is meant to be used in combination with the assessment in the back. Take the assessment using the code in the back of the book FIRST and upload the results.",
    submitPrompt: "Thank you for submitting your Assistant Director Application! Once your interview is complete, you will be given a decision to and receive any feedback. If you have additional questions, please contact the Leadership Development Director.",
    submitNotify: (n) => `${n} has submitted an Assistant Director application and is ready to review!`,
    steps: [
      { id: "a1", type: "upload", title: "Upload your Emotional Intelligence assessment results", multiple: false },
      { id: "a2", type: "choice", title: "Which two categories were your lowest scoring?",
        body: "Using your results, check the boxes for the lowest two.", pick: 2,
        options: ["Self-Awareness", "Self-Management", "Social Awareness", "Relationship Management"] },
      { id: "a3", type: "upload", title: "Complete and upload your EQ Action Plan",
        body: "Read Chapters 1-4 and complete the EQ Action Plan at the end of Chapter 4 based on the two lowest scores you indicated.", multiple: false },
      { id: "a4", type: "chapters", title: "Read the two chapters that correspond", dependsOn: "a2",
        body: "Based on the two categories you selected, read the two chapters that correspond." },
      { id: "a5", type: "text", title: "How will you develop these areas?",
        body: "What are 2-3 practical ways you can begin developing these two areas?" },
      { id: "a6", type: "calendly", title: "Schedule an interview",
        body: "Schedule an interview using Calendly! If the timeframes available do not work for you, message the Leadership Development Director." },
    ],
  },
};
const CHAPTERS = {
  "Self-Awareness": "Self-Awareness Strategies — Chapter 5",
  "Self-Management": "Self-Management Strategies — Chapter 6",
  "Social Awareness": "Social Awareness Strategies — Chapter 7",
  "Relationship Management": "Relationship Management Strategies — Chapter 8",
};
/* The four keys in one fixed order, so a translated chapter list can be paired
   back to the ENGLISH category the applicant actually has saved. Read the
   chapters note in courseTranslate.js before changing either. */
const CHAPTER_KEYS = Object.keys(CHAPTERS);
/** The chapter line to show for a saved (always English) category pick. */
const chapterLabel = (chapters, pick) => {
  const i = CHAPTER_KEYS.indexOf(pick);
  return (i >= 0 && chapters && chapters[i]) || CHAPTERS[pick] || pick;
};

// ── editable content (Bri fills these in; no redeploy needed) ───────────────
const RESOURCES_KEY = "gc-team-resources-v3";   // Bri's Resources page list

/* Blank override = route by purpose, so the worker picks this store's person. */
const notifyTo = (cfg) => {
  const override = String((cfg && cfg.notifyChannel) || "").trim();
  return override ? { channel: override } : { to: "leadership" };
};

const DEFAULT_CONFIG = {
  /* ⚠️⚠️ BLANK ON PURPOSE, AND IT USED TO BE GATE CITY'S OWN LINK (Bri, Aug 12
     2026, settling the L101 template strip: "a blank field the store fills in,
     not a generic link").

     🐛 WHAT IT DID BEFORE. `https://calendly.com/cfagatecityld/interview` is
     Gate City's Leadership Development calendar. A new store standing up their
     Hub shipped that default, and their applicants pressing "Open Calendly"
     booked interviews onto BRI'S calendar. Nothing errors and the button
     works, which is the worst shape for this kind of leak: the store finds out
     when a stranger turns up in her day.

     ⚠️ GATE CITY IS UNAFFECTED AND THIS WAS MEASURED, NOT ASSUMED. The live
     gc-pg-config-v1 record already carries `calendly` set to that same URL
     explicitly, so the stored config supplies it and this default was never
     what Gate City was reading. Verified against the row before the change.

     ⚠️ EMPTY HAS A RENDER OF ITS OWN. The interview step no longer draws an
     anchor with `href=""`, which is a button that reloads the page. See the
     `step.type === "calendly"` branch. */
  calendly: "",
  /* Bri, Aug 10 2026: "I want to also link certain calendar types to
     applications like where I currently have Calendly linked."
     ⚠️ ABSENT MEANS THE OLD BEHAVIOUR, which is why it is a map of role → type
     rather than one setting. An existing config has no such key, so every
     application keeps working exactly as it does now until she picks one, and
     she can move the AD application onto the calendar while Trainer stays on
     Calendly. Design rules 1 and 16. */
  interviewType: {},                       // { [role]: calendar type id }
  // Per-role copy Bri can rewrite herself. Empty string = fall back to the
  // hardcoded ROLES text, so nothing is ever blank if she hasn't touched it.
  copy: {},                                // { [role]: { eoiPrompt, submitPrompt } }
  // Bri, Jul 23: an open/close toggle per application, hers + HR + Ex.Directors.
  // Stored as CLOSED rather than OPEN so an absent key means open — existing
  // config keeps working untouched and a new role defaults to available.
  closed: {},                              // { [role]: true }
  /* Bri, Jul 23 — scheduling. Per role:
       due    "2026-08-15"        the application's due date
       openAt "2026-08-01T09:00"  optional scheduled OPEN
       closeAt"2026-08-15T17:00"  optional scheduled CLOSE
     `closed` stays as the manual override and always wins, so she can shut
     something immediately without unpicking a schedule. A window with only a
     closeAt is her "toggle open until a close is set". Windows are judged
     CLIENT-SIDE at render — no job has to run for a form to open or shut. */
  due: {},                                 // { [role]: "YYYY-MM-DD" }
  window: {},                              // { [role]: { openAt, closeAt } }
  /* 🐛 WAS A GATE CITY SLACK ID (Aug 10 2026, sweep finding 37) — the last tile
     still naming a person from the browser. GoalSubmissions, L101Week and
     WasteTracker were all converted on Aug 7; this one was missed, so every
     Expression of Interest and promotion application at a SECOND store would
     have DM'd Bri here, or 404'd and died in the notify log.
     ⚠️ BLANK NOW, AND BLANK MEANS "ROUTE BY PURPOSE" — the worker resolves
     `to: "leadership"` from that store's own config. Kept as an optional
     override so an operator can still point it somewhere specific from the
     settings input, which is what it was for; it just no longer DEFAULTS to
     one store's person. */
  notifyChannel: "",
  l101Pin: "",                             // current class PIN (Trainer step 3)
  l101Link: "",                            // direct link to the class entrance page
  recQuestions: [
    { id: "q1", label: "How long have you worked with this team member, and in what capacity?" },
    { id: "q2", label: "Describe their readiness for the Team Leader role." },
  ],
  eoi: {
    trainer: [], "team-leader": [], "assistant-director": [],
  },
};
// EOI item shapes: {id, kind:"question", label} | {id, kind:"read", label, body, docSlug}

// Copy resolution: Bri's edit wins, the ROLES default fills in otherwise.
/* Is a role accepting applications right now?
   Manual close wins outright; then a scheduled window; open otherwise.
   Returns why, so the picker can say something truthful rather than just
   greying out. */
function roleWindow(cfg, roleKey, now = new Date()) {
  if ((cfg.closed || {})[roleKey]) return { open: false, reason: "closed" };
  const w = (cfg.window || {})[roleKey] || {};
  if (w.openAt && now < new Date(w.openAt)) return { open: false, reason: "before", at: w.openAt };
  if (w.closeAt && now > new Date(w.closeAt)) return { open: false, reason: "after", at: w.closeAt };
  return { open: true, reason: "open", closesAt: w.closeAt || null };
}

const fmtWhen = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

/* ★ STEP WORDING IS BRI'S, NOT THE CODE'S (Jul 27).
   She asked: "I thought I had the ability to edit application steps, if I don't
   can I have that built? I need to edit text for the Pathway step." She could
   already edit the role-level copy and the Expression of Interest items — the
   individual STEP titles and bodies were the one thing still hardcoded, which
   is exactly the sort of wording that goes stale (in this case: how to reach
   Pathway, now that CFA Home logins live in each person's file).

   Same shape as `roleCopy`: an override wins, the code default is the fallback,
   so nothing changes until she saves something.

   ⚠️ ONLY `title` AND `body` ARE EDITABLE. A step's `type` decides what it DOES
   (text · check · l101 · calendly · recs · upload · choice) and its `id` is the
   key every stored application writes its answer under — `app.steps[id]`.
   Letting either be edited would break live applications silently, so the
   editor exposes neither. */
/* ═══ THE STEP LIST IS BRI'S NOW (Bri, Aug 8 2026) ═══════════════════════════
   "Can I have the ability to add/delete/reorder steps for applications?… I want
   full autonomy to start a new role application from the expression of interest
   all the way through adding whichever types of steps I need."

   This is the first half: add, delete and reorder on the applications that
   already exist. Whole new roles from scratch are a second build — a new role
   needs its own notification wiring, expression-of-interest copy, status
   audience and per-type behaviour, and shipping half of that would replace a
   working screen with an unfinished one (design rule 16).

   ★ HOW IT RESOLVES. The code list in ROLES is the seed. `cfg.stepPlan[role]`
   is an array of ids that says which steps exist and in what order, and
   `cfg.stepNew[role][id]` holds the definition of any step SHE created. No
   stepPlan for a role means exactly today's behaviour, so an application in
   flight right now is untouched. Design rule 1.

   ⚠️ IDS ARE STILL NEVER EDITABLE, and neither is a seeded step's type. An id
   is the key every stored application writes its answer under (`app.steps[id]`),
   so re-using or renaming one would silently attach an old answer to a new
   question. New steps get a timestamped id that cannot collide with a seed's.

   ⚠️ DELETING A STEP DOES NOT DELETE ANSWERS. A removed step simply stops being
   asked; anything already answered under its id stays in the record, and
   submitted applications carry their own question snapshot anyway (see the
   snapshot note on the recommendation record). So a delete is recoverable by
   re-adding, and can never blank somebody's submitted work.

   ⚠️ ONE RESOLVER, READ BY BOTH THE APPLICANT VIEW AND THE EDITOR. This file
   already carries the scar of an editor and a renderer disagreeing about a
   shape; they call the same function here so they cannot. */
const NEW_STEP_TYPES = [
  { type: "text",   label: "Written answer",   hint: "They type a response." },
  { type: "check",  label: "Tick to confirm",  hint: "They mark it done when finished." },
  { type: "upload", label: "Upload a file",    hint: "They attach a document or photo." },
];
/* ⚠️ THE OTHER FOUR TYPES CAN BE REORDERED AND REMOVED BUT NOT CREATED.
   `l101` embeds a class, `calendly` an external booking, `recs` drives the
   recommendation portal, and `chapters` reads another step's answer through
   `dependsOn`. Each needs wiring a picker cannot supply, and a new one of those
   would render as a step that looks real and does nothing. */
function stepsFor(cfg, roleKey) {
  const seeded = ((ROLES[roleKey] || {}).steps) || [];
  const plan = (((cfg && cfg.stepPlan) || {})[roleKey]) || null;
  if (!Array.isArray(plan)) return seeded;              // never configured = as it was
  const made = (((cfg && cfg.stepNew) || {})[roleKey]) || {};
  const bySeed = new Map(seeded.map((s) => [s.id, s]));
  const out = [];
  for (const id of plan) {
    const s = bySeed.get(id) || made[id];
    if (s && s.type) out.push(s);                       // an id with no definition drops out
  }
  return out;
}

function stepCopy(cfg, roleKey, stepId, field, fallback) {
  const v = ((((cfg && cfg.steps) || {})[roleKey] || {})[stepId] || {})[field];
  const t = String(v == null ? "" : v).trim();
  return t || fallback || "";
}

function roleCopy(cfg, roleKey, field) {
  const c = ((cfg && cfg.copy) || {})[roleKey] || {};
  const v = (c[field] || "").trim();
  return v || (ROLES[roleKey] || {})[field] || "";
}

/* ═══ EVERY WORD ON ONE APPLICATION, IN ONE OBJECT ═══════════════════════════
   Built so the English screen and the Spanish screen render from the SAME
   shape. There is no "if Spanish" branch anywhere below: the page picks which
   of these two objects to hand down, and one code path draws both. This file
   already carries the scar of an editor and a renderer disagreeing about a
   shape; a second copy of the drawing code in another language would be that
   again, except only findable by someone who reads Spanish.

   ⚠️ AUTHORED WORDS ONLY. Ids, types, `pick`, `dependsOn`, document pointers
   and everything the applicant has typed are not here and are never sent
   anywhere. The overrides are resolved FIRST, so what gets translated is what
   Bri actually wrote, not the code's fallback wording underneath it.

   ⚠️ `steps` IS ALIGNED TO stepsFor(cfg, roleKey) BY INDEX. Callers pair the
   two by position. Same list, same order, both derived from the one resolver.

   ⚠️ Job titles stay English on purpose — see UI_ES. */
function appView(cfg, roleKey) {
  const steps = stepsFor(cfg, roleKey);
  return {
    eoiPrompt: roleCopy(cfg, roleKey, "eoiPrompt"),
    submitPrompt: roleCopy(cfg, roleKey, "submitPrompt"),
    eoi: (((cfg && cfg.eoi) || {})[roleKey] || []).map((it) => ({
      label: String((it && it.label) || ""),
      body: String((it && it.body) || ""),
    })),
    steps: steps.map((s) => ({
      title: stepCopy(cfg, roleKey, s.id, "title", s.title),
      body: stepCopy(cfg, roleKey, s.id, "body", s.body),
      options: Array.isArray(s.options) ? s.options.map((o) => String(o == null ? "" : o)) : [],
    })),
    // Only when a chapters step is actually on this application.
    chapters: steps.some((s) => s && s.type === "chapters") ? CHAPTER_KEYS.map((k) => CHAPTERS[k]) : [],
  };
}

// The Resources page list, for the read-and-agree picker.
// ⚠️ VERIFIED against TeamResources.jsx Jul 23 — the FIELD IS `file`, not
// `docSlug`/`slug`/`doc`. An earlier guess at those three names is exactly why
// this dropdown rendered empty for Bri. The store is a plain ARRAY under
// `gc-team-resources-v3`; each item is {id, label, kind, cat} plus `file` when
// kind==="pdf" (resolved by the worker at /docs/<file>) or `url` when
// kind==="link". kind==="pending" has neither and is skipped — there is nothing
// to open yet.
async function loadResourceOptions() {
  try {
    const raw = await kvGet(RESOURCES_KEY);
    const list = Array.isArray(raw) ? raw : [];
    return list.map((r) => {
      if (r.kind === "pdf" && r.file) return { value: r.file, kind: "pdf", label: r.label || r.file };
      if (r.kind === "link" && r.url) return { value: r.url, kind: "link", label: r.label || r.url };
      return null;
    }).filter(Boolean);
  } catch { return []; }
}

/* Result-style: ok:false means the read FAILED. loadConfig used to return
   DEFAULT_CONFIG for both "nothing stored" and "could not reach it", so one
   admin edit after a dropped read would save the defaults — wiping Bri's
   authored EOI forms, role copy, step copy, recommendation questions, due
   dates and windows for all three pipelines. */
async function loadConfigResult() {
  const r = await kvGetResult(CONFIG_KEY);
  const v = r.value;
  return { ok: r.ok, cfg: v ? { ...DEFAULT_CONFIG, ...v, eoi: { ...DEFAULT_CONFIG.eoi, ...(v.eoi || {}) } } : DEFAULT_CONFIG };
}
// kvSet returns false rather than throw — the old .catch was dead code, and
// the caller now checks this boolean instead of assuming.
const saveConfig = (c) => kvSet(CONFIG_KEY, c);

// Index is shared, so re-read and merge immediately before writing rather than
// blind-overwriting — two applicants saving at the same moment must not clobber
// each other's entry.
async function upsertIndex(entry) {
  try {
    /* ★★ A FAILED READ USED TO COLLAPSE THE WHOLE INDEX TO ONE ENTRY.
       🐛 This was `(await kvGet(INDEX_KEY)) || []`, and kvGet returns null for
       BOTH "nothing stored" and "the read failed". `upsertIndex` is called
       from the applicant autosave, so it runs on essentially every keystroke —
       one dropped read reduced gc-pg-index-v1 to a single element.
       That index is the ONLY enumeration path: HR Console lists pending
       applications by mapping over it. So every other Trainer, Team Leader and
       AD application became invisible and unreviewable, silently. This is the
       same shape as what Bri reported on Jul 29.
       ⇒ On a failed read, do NOT write. Losing one autosave tick is nothing;
       the next keystroke saves it. Losing the index loses everyone. */
    const cur = await kvGetResult(INDEX_KEY);
    if (!cur.ok) return false;
    const list = Array.isArray(cur.value) ? cur.value : [];
    const k = `${entry.role}:${entry.slug}`;
    const next = list.filter((e) => `${e.role}:${e.slug}` !== k).concat([entry]);
    return await kvSet(INDEX_KEY, next);
  } catch { return false; }
}

/* Where a notification that DID NOT SEND gets written down.
   🐛 Bri, Jul 29 2026: "I had someone submit a Trainer Expression of Interest
   form (Ashley Valadez) but I was not notified. I can't miss these coming in."

   Ashley's submission itself was fine — her status moved to in_progress on Jul
   28 at 15:16 and her answers are all stored. The DM never reached Bri, and
   THERE IS NO WAY TO FIND OUT WHY, because every caller did
   `await notifySlack(...)` and threw the boolean away. Sent and failed looked
   identical afterwards. The endpoint itself works — tested end to end Jul 29.

   ⚠️ THE FIX IS NOT "MAKE SLACK MORE RELIABLE", IT IS "STOP LOSING THE
   ANSWER". Any delivery can fail. What made this unrecoverable is that nothing
   recorded the failure, so nobody could resend, and the only person who could
   notice was the one person who never got told. */
const NOTIFY_LOG_KEY = "gc-pg-notify-log-v1";
const NOTIFY_LOG_MAX = 40;

async function logNotifyFailure(entry) {
  try {
    // ⚠️ kvGetResult: a failed read used to arrive as [] and the write then
    // wiped the whole recovery log. Dropping ONE line beats losing the log
    // that exists to make missed notifications recoverable.
    const r = await kvGetResult(NOTIFY_LOG_KEY);
    if (!r.ok) return;
    const list = Array.isArray(r.value) ? r.value : [];
    await kvSet(NOTIFY_LOG_KEY, [entry, ...list].slice(0, NOTIFY_LOG_MAX));
  } catch { /* the record is best-effort; it must never block a submission */ }
}

/* `about` = a human sentence for the failure log. Optional so existing callers
   keep working, but every caller here passes one — a log entry reading only
   "a notification failed" is barely better than no log at all. */
/* `target` is either a purpose — { to: "leadership" }, which the WORKER resolves
   against this store's config — or a literal channel/user id, which only the
   recommendation-request DM uses because it has already resolved one specific
   leader off the roster. A bare string stays a channel, so that call site did
   not have to change. */
async function notifySlack(target, text, about) {
  const addr = typeof target === "string" ? { channel: target } : (target || {});
  const haveAddr = !!(addr.channel || addr.to);
  if (!haveAddr || !text) {
    await logNotifyFailure({ at: new Date().toISOString(), about: about || "unknown", error: !haveAddr ? "no notification channel is configured" : "empty message" });
    return false;
  }
  let error = null;
  try {
    const r = await fetch("/api/slack-notify", {
      method: "POST", headers: { "content-type": "application/json", "x-hub-token": hubToken() },
      body: JSON.stringify({ ...addr, text }),
    });
    const d = await r.json().catch(() => null);
    if (d && d.ok) return true;
    error = (d && d.error) || `HTTP ${r.status}`;
  } catch (e) { error = String((e && e.message) || e); }
  console.error("slack notify failed:", error, "about:", about, "addressed:", JSON.stringify(addr));
  await logNotifyFailure({ at: new Date().toISOString(), about: about || "unknown", error, text });
  return false;
}

/* ═══ INTERVIEW SLOTS — THE INTERNAL CALENDAR (Bri, Aug 7 2026) ═════════════
   "Can we make an internal calendar system to schedule meetings, send
   reminders, have applicants schedule interviews, etc? We currently use
   Calendly… I can send specifics if this is possible, just tell me where to
   start."

   Interviews first. It is the only thing Calendly does inside the Hub — the
   one step on each of the three applications — and it works end to end on its
   own. Meetings wait for her specifics rather than being guessed at.

   ★ NOTHING CHANGES UNTIL SHE ADDS A SLOT. An empty list means the step
   behaves exactly as it does today: Open Calendly, then Mark as completed. So
   this ships without touching anyone mid-application, and the Calendly link
   stays as the fallback until she says she is off it. Design rules 1 and 16.

   ★ THE SLOT LIST IS THE ONLY RECORD OF WHO HAS AN INTERVIEW. The step's own
   `done` flag is not consulted once slots exist — `slotDone` reads the list
   instead. That is what makes Bri cancelling a booking actually mean
   something: the applicant's step goes back to incomplete on its own, with no
   second record to keep in step and nothing to migrate. This file already
   carries the scar of two records disagreeing about the same fact.

   ⚠️ BOOKING AND CANCELLING GO THROUGH THE WORKER, never straight to KV. Two
   people tapping the same time is the one case a browser check cannot get
   right. See /api/interview. */
const SLOTS_KEY = "gc-pg-slots-v1";
const slotList = (slots) => (Array.isArray(slots) ? slots.filter(Boolean) : []);
const mySlot = (slots, slug) =>
  slotList(slots).find((s) => s.booked && String(s.booked.slug) === String(slug)) || null;
const freeSlots = (slots) => slotList(slots).filter((s) => !s.booked);
/* Sorted by when, so "the next available time" is the first thing offered. */
const bySoonest = (a, b) => String((a && a.at) || "").localeCompare(String((b && b.at) || ""));

/* ═══ STAGE 4 — THE INTERVIEW STEP POINTS AT THE REAL CALENDAR ══════════════
   Bri, Aug 10 2026: "I want to also link certain calendar types to applications
   like where I currently have Calendly linked. I want to add the internal
   calendar."

   ★ THREE ARMS, IN THIS ORDER, AND THE ORDER IS THE WHOLE DESIGN:
     1. a CALENDAR TYPE is set for this role  → book against that owner's real
        calendar, so a time she publishes once shows up here AND in her month,
        and an interview cannot collide with a coaching session.
     2. else the standalone gc-pg-slots-v1 list still has slots → the picker
        exactly as it shipped on Aug 7.
     3. else → the Calendly link and Mark as completed, exactly as before that.

   ⚠️ ARM 2 IS NOT DEAD CODE, IT IS DESIGN RULE 1. That key is empty in
   production today, so nothing would break if it were dropped — but it is the
   difference between an applicant's booking surviving this deploy and it
   silently vanishing if anybody publishes a slot in the window before it lands.
   Six lines to be certain, against a step somebody's promotion depends on.

   ⚠️ WHICH SLOTS ARE "MINE" IS A DIFFERENT TEST ON EACH ARM, and getting that
   wrong is how somebody loses their own booking. The calendar matches the
   signed-in ID (`bookedBy`), which is what /api/calendar writes off the token.
   The old list matches the name SLUG, which is what /api/interview writes.
   Neither is asked the other's question. */
const interviewFor = (cfg, role) => String(((cfg && cfg.interviewType) || {})[role] || "").trim();

/* One resolved answer for "what times can this applicant pick, and which is
   already theirs". Pure, module level (design rule 7). */
function interviewSlots(iv, slug, uid) {
  const src = (iv && iv.slots) || [];
  if (iv && iv.cal) {
    return { held: calHeldBy(src, uid, iv.typeId), open: calOpenSlots(src, iv.typeId) };
  }
  return { held: mySlot(src, slug), open: freeSlots(src).slice().sort(bySoonest) };
}

// ── step completion ─────────────────────────────────────────────────────────
function stepComplete(step, sd) {
  if (!sd) return false;
  switch (step.type) {
    case "text": return !!(sd.text || "").trim();
    case "upload": return Array.isArray(sd.files) && sd.files.length > 0;
    case "choice": return Array.isArray(sd.choices) && sd.choices.length === step.pick;
    case "recs": return Array.isArray(sd.recs) && sd.recs.filter((r) => r.status === "completed").length >= 2;
    default: return !!sd.done;   // check / l101 / calendly / chapters
  }
}

/* Is this step done, taking interview slots into account?
   ⚠️ ONE FUNCTION, READ BY THE UNLOCK TEST, THE SUBMIT TEST AND THE CARD. Three
   places decide "is this finished", and an interview that counted as done in
   one of them and not the others is how somebody ends up unable to submit with
   nothing on screen explaining why.

   ⚠️ ONCE THERE ARE TIMES, THE BOOKING IS THE ONLY RECORD. The step's own
   `done` flag stops being consulted, which is what makes Bri cancelling a
   booking actually mean something — the applicant's step goes back to
   incomplete on its own, with no second record to keep in step. Unchanged from
   Aug 7; it just now asks the calendar when the calendar is the source. */
const stepDone = (step, sd, iv, slug, uid) =>
  (step && step.type === "calendly" && slotList(iv && iv.slots).length)
    ? !!interviewSlots(iv, slug, uid).held
    : stepComplete(step, sd);

/* ═══ THE WORDS AROUND THE WORDS ════════════════════════════════════════════
   Buttons, placeholders and status lines. These are NOT sent to the
   translator, for two reasons: they never change unless somebody edits this
   file, so paying to translate them on every open would be paying for the same
   answer forever; and a button whose label arrives over the network is a
   button that reads "undefined" when the wifi drops. A fixed list is instant,
   free, and works offline.

   ⚠️ SPANISH IS SPREAD OVER ENGLISH, so a key that only exists in UI_EN falls
   back to English rather than rendering blank. Add a key to UI_EN and forget
   UI_ES and the screen is imperfect; without this it would be EMPTY, and only
   somebody reading Spanish would ever see it.

   ⚠️ JOB TITLES AND FORM NAMES STAY ENGLISH ON PURPOSE. Assistant Director,
   Team Leader, Leadership Development Director, Leadership 101, Expression of
   Interest. These are what the schedule, Slack and Bri call them, so a
   translated version would make it HARDER to work out who to pick or what to
   look for. Same reasoning as the worker's "do not translate station names
   such as Drive Thru". */
const UI_EN = {
  back: "← All roles",
  saved: "Saved ✓",
  saveErr: "Your last change did not save — it is still on this screen, and the next change retries. If this keeps showing, check the wifi before closing.",
  closed: (label) => `Applications for ${label} have closed. Yours was already underway, so you can finish and submit it — it will be reviewed in the next open window.`,
  eoiStart: "Start by completing the Expression of Interest below. Once it's submitted, the rest of the application unlocks.",
  eoiMissing: (label) => `The Expression of Interest form for ${label} hasn't been written yet. The Leadership Development Director will add it shortly.`,
  openDoc: "Open the document ↗",
  docFailed: "Couldn't open that document — let the Leadership Development Director know.",
  agree: "I have read and agree",
  yourAnswer: "Your answer…",
  submitting: "Submitting…",
  submitEoi: "Submit Expression of Interest",
  submitApp: "Submit application!",
  submitBlocked: "Complete every step to submit",
  confirmSubmit: "Submit your application? You won't be able to edit it afterward.",
  loadingApp: "Loading your application…",
  appFailed: "Your application could not load, so this page is staying closed — opening it blank could erase what you have already written. Nothing was changed. Check the wifi, tap ← All roles, and open it again.",
  locked: "LOCKED",
  lockedHint: "Finish the step above to unlock this one.",
  uploading: "Uploading…",
  chooseFile: "Choose a file",
  selectedCount: (n, m) => `${n} of ${m} selected`,
  chaptersLocked: "Complete the previous step to see your chapters.",
  markedDone: "✓ Marked complete",
  markDone: "Mark as completed",
  pinBefore: "The PIN to enter this class is",
  pinMissing: "— ask the Leadership Development Director",
  openL101: "Open Leadership 101 →",
  classEntrance: "Class entrance page ↗",
  l101Before: "Open",
  l101After: "and enter the PIN above.",
  openCalendly: "Open Calendly ↗",
  noBookingLink: "Your store has not added a booking link yet. Message the Leadership Development Director to set up your interview.",
  recDone: (n) => `Completed by ${n}`,
  recPending: (n) => `In progress by ${n}`,
  recWaiting: "Waiting on your selections.",
  recNeedAD: "At least one recommendation must come from an Assistant Director — choose one below.",
  recChoose: "Choose a leader…",
  recRequest: "Request",
  interviewBooked: "Your interview is booked",
  interviewChange: "Cancel and pick a different time",
  interviewPick: "Choose a time that works for you:",
  interviewNone: "No interview times are open right now. The Leadership Development Director will add more.",
  minutes: "min",
  hours: "hr",
  working: "Working…",
  withdraw: "Cancel and ask someone else",
  confirmWithdraw: (n) => `Cancel the request to ${n}?\n\nThey will be told it is no longer needed, and you can then ask a different leader.`,
  recWithdrawnTitle: "Cancelled",
  trLoading: "Translating…",
  trFailed: "Couldn't translate. Showing the English version.",
};
const UI_ES = {
  back: "← Todos los puestos",
  saved: "Guardado ✓",
  saveErr: "Tu último cambio no se guardó. Sigue en esta pantalla y el siguiente cambio lo intenta otra vez. Si esto continúa, revisa el wifi antes de cerrar.",
  closed: (label) => `Las solicitudes para ${label} ya cerraron. La tuya ya estaba en curso, así que puedes terminarla y enviarla. Se revisará en el próximo periodo abierto.`,
  eoiStart: "Empieza completando el formulario Expression of Interest que está abajo. Al enviarlo se desbloquea el resto de la solicitud.",
  eoiMissing: (label) => `El formulario Expression of Interest para ${label} todavía no está escrito. El Leadership Development Director lo agregará pronto.`,
  openDoc: "Abrir el documento ↗",
  docFailed: "No se pudo abrir ese documento. Avísale al Leadership Development Director.",
  agree: "He leído y estoy de acuerdo",
  yourAnswer: "Tu respuesta…",
  submitting: "Enviando…",
  submitEoi: "Enviar Expression of Interest",
  submitApp: "¡Enviar solicitud!",
  submitBlocked: "Completa todos los pasos para enviar",
  confirmSubmit: "¿Enviar tu solicitud? Después no vas a poder editarla.",
  loadingApp: "Cargando tu solicitud…",
  appFailed: "Tu solicitud no se pudo cargar, así que esta página se queda cerrada. Abrirla en blanco podría borrar lo que ya escribiste. No se cambió nada. Revisa el wifi, toca ← Todos los puestos y ábrela otra vez.",
  locked: "BLOQUEADO",
  lockedHint: "Termina el paso de arriba para desbloquear este.",
  uploading: "Subiendo…",
  chooseFile: "Elige un archivo",
  selectedCount: (n, m) => `${n} de ${m} seleccionados`,
  chaptersLocked: "Completa el paso anterior para ver tus capítulos.",
  markedDone: "✓ Marcado como completo",
  markDone: "Marcar como completado",
  pinBefore: "El PIN para entrar a esta clase es",
  pinMissing: "— pregúntale al Leadership Development Director",
  openL101: "Abrir Leadership 101 →",
  classEntrance: "Página de entrada a la clase ↗",
  l101Before: "Abre",
  l101After: "y escribe el PIN de arriba.",
  openCalendly: "Abrir Calendly ↗",
  noBookingLink: "Tu tienda todavía no ha agregado un enlace para agendar. Escríbele al Leadership Development Director para programar tu entrevista.",
  recDone: (n) => `Completada por ${n}`,
  recPending: (n) => `En proceso con ${n}`,
  recWaiting: "Falta que elijas.",
  recNeedAD: "Al menos una recomendación tiene que venir de un Assistant Director. Elige uno abajo.",
  recChoose: "Elige un líder…",
  recRequest: "Solicitar",
  interviewBooked: "Tu entrevista está agendada",
  interviewChange: "Cancelar y elegir otra hora",
  interviewPick: "Elige la hora que mejor te funcione:",
  interviewNone: "Por ahora no hay horas disponibles para entrevista. El Leadership Development Director agregará más.",
  minutes: "min",
  hours: "h",
  working: "Un momento…",
  withdraw: "Cancelar y pedirle a otro líder",
  confirmWithdraw: (n) => `¿Cancelar la solicitud a ${n}?\n\nSe le avisará que ya no es necesaria, y después puedes pedírsela a otro líder.`,
  recWithdrawnTitle: "Canceladas",
  trLoading: "Traduciendo…",
  trFailed: "No se pudo traducir. Mostrando la versión en inglés.",
};
const UI = { en: UI_EN, es: { ...UI_EN, ...UI_ES } };
const uiFor = (lang) => UI[lang] || UI.en;

// ── ui atoms ────────────────────────────────────────────────────────────────
function Btn({ children, onClick, kind = "ghost", small, disabled, as, href }) {
  const kinds = {
    solid: { background: C.red, color: "#fff", border: "none" },
    ghost: { background: "#fff", color: C.sub, border: `1px solid ${C.line}` },
    good: { background: C.green, color: "#fff", border: "none" },
  };
  const style = { cursor: disabled ? "default" : "pointer", fontFamily: FONT, fontWeight: 700,
    borderRadius: 10, padding: small ? "6px 12px" : "10px 16px", fontSize: small ? 13 : 14.5,
    opacity: disabled ? 0.5 : 1, textDecoration: "none", display: "inline-block", ...kinds[kind] };
  if (as === "a") return <a href={href} target="_blank" rel="noopener noreferrer" style={style}>{children}</a>;
  return <button onClick={onClick} disabled={disabled} style={style}>{children}</button>;
}
const inp = { fontFamily: FONT, fontSize: 14.5, padding: "10px 12px", borderRadius: 10,
  border: `1px solid ${C.line}`, color: C.ink, background: "#fff", outline: "none", width: "100%", boxSizing: "border-box" };
const ta = { ...inp, minHeight: 120, resize: "vertical", lineHeight: 1.5 };
/* Small square control for the step reorder/remove row. Module level beside
   the other two so it is one object rather than one per render. */
const btnGhost = { fontFamily: FONT, fontSize: 12, lineHeight: 1, padding: "5px 8px",
  borderRadius: 7, border: `1px solid ${C.line}`, background: "#fff", color: C.sub, cursor: "pointer" };

function Banner({ tone = "info", children }) {
  const t = { info: { bg: "#EEF2FA", fg: C.navy }, good: { bg: "#E7F6EC", fg: "#166534" },
    warn: { bg: "#FEF3C7", fg: "#92400E" } }[tone];
  return <div style={{ background: t.bg, color: t.fg, borderRadius: 12, padding: "14px 16px",
    fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap", marginBottom: 16 }}>{children}</div>;
}

/* EN / ES, matching the pills on the classes and Prep Work so it is the same
   control in all three places. Reading only — nothing an applicant has typed
   is touched, and nothing is written back in either language. */
function LangToggle({ lang, onPick }) {
  return (
    <div style={{ display: "flex", gap: 5 }}>
      {[["en", "EN"], ["es", "ES"]].map(([v, label]) => (
        <button key={v} type="button" onClick={() => onPick(v)}
          aria-pressed={lang === v}
          style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 800, lineHeight: 1, cursor: "pointer",
            borderRadius: 999, padding: "5px 11px",
            border: `1px solid ${lang === v ? C.navy : C.line}`,
            background: lang === v ? C.navy : "#fff", color: lang === v ? "#fff" : C.sub }}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ── the applicant's step card ───────────────────────────────────────────────
/* `text` is this step's words already resolved (Bri's overrides applied) and
   already in the reader's language — see appView. `chapters` is the whole
   application's chapter list, paired back to an English pick by chapterLabel.
   ⚠️ `text.options` IS FOR DISPLAY ONLY. What gets SAVED is step.options[i],
   which is always English, so switching language never changes what is stored
   and never unselects what is already picked. */
/* `t` defaults to English rather than being required. A step card that threw
   on a missing prop would blank the whole application page, and a button that
   reads English on a Spanish screen is a far smaller problem than that. */
function StepCard({ step, index, unlocked, done, data, app, cfg, locked, onChange, dirLeaders, onRequestRecs, onWithdrawRec, onOpenL101, text, chapters, iv, slug, uid, onBookSlot, onCancelSlot, t = UI_EN }) {
  /* StepCard used to resolve Bri's title/body overrides itself, off `app.role`.
     The page resolves them now, because the same resolved words are what gets
     translated — two resolvers would mean the Spanish screen could show one
     wording and the English screen another. `text` always arrives filled in;
     the fallbacks below are only for a step whose title or body is blank. */
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const sd = data || {};
  const tx = text || {};
  const shownOptions = Array.isArray(tx.options) ? tx.options : [];

  const pickFile = async (file) => {
    if (!file) return;
    setErr(""); setBusy(true);
    try {
      const path = `pg/${app.role}/${app.slug}/${step.id}-${Date.now()}-${file.name}`;
      const ref = await uploadDoc(DOC_BUCKET, path, file);
      onChange({ ...sd, files: [...(sd.files || []), { ...ref, fileName: file.name }] });
    } catch (e) { setErr(e.message || String(e)); }
    setBusy(false);
  };

  const body = (
    <>
      {(tx.body || step.body) &&
        <p style={{ color: C.sub, fontSize: 14, lineHeight: 1.55, margin: "0 0 12px", whiteSpace: "pre-wrap" }}>
          {tx.body || step.body}
        </p>}

      {step.type === "text" && (
        <textarea value={sd.text || ""} disabled={locked} placeholder={t.yourAnswer}
          onChange={(e) => onChange({ ...sd, text: e.target.value })} style={ta} />
      )}

      {step.type === "upload" && (
        <div>
          {(sd.files || []).map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "#F4F6FA",
              borderRadius: 10, padding: "8px 12px", marginBottom: 8, fontSize: 13.5 }}>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📄 {f.fileName}</span>
              {!locked && <button onClick={() => onChange({ ...sd, files: sd.files.filter((_, j) => j !== i) })}
                style={{ border: "none", background: "#FBEAED", color: C.redDeep, borderRadius: 8, width: 28, height: 28, cursor: "pointer" }}>×</button>}
            </div>
          ))}
          {!locked && (
            <label style={{ ...inp, width: "auto", display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 600, color: C.sub }}>
              📎 {busy ? t.uploading : t.chooseFile}
              <input type="file" style={{ display: "none" }} onChange={(e) => pickFile(e.target.files && e.target.files[0])} />
            </label>
          )}
        </div>
      )}

      {/* ⚠️ `opt` IS THE STORED VALUE AND IS ALWAYS ENGLISH. Only the label
          swaps. If the click handler ever saved the shown label instead,
          somebody could pick two in Spanish, flip to EN, and find nothing
          selected while the picker was already full — a screen with no way
          out. The two arrays are the same length in the same order because
          applyAppStrings refuses any reply that is not. */}
      {step.type === "choice" && (
        <div style={{ display: "grid", gap: 8 }}>
          {step.options.map((opt, oi) => {
            const on = (sd.choices || []).includes(opt);
            const full = (sd.choices || []).length >= step.pick;
            return (
              <button key={opt} disabled={locked || (!on && full)}
                onClick={() => onChange({ ...sd, choices: on ? sd.choices.filter((c) => c !== opt) : [...(sd.choices || []), opt] })}
                style={{ textAlign: "left", fontFamily: FONT, fontSize: 14.5, fontWeight: on ? 700 : 500,
                  border: `1px solid ${on ? C.red : C.line}`, background: on ? "#FBEAED" : "#fff", color: on ? C.redDeep : C.ink,
                  borderRadius: 10, padding: "11px 14px", cursor: locked || (!on && full) ? "default" : "pointer",
                  opacity: !on && full ? 0.5 : 1 }}>
                {on ? "☑" : "☐"} {shownOptions[oi] || opt}
              </button>
            );
          })}
          <div style={{ fontSize: 12.5, color: C.sub }}>{t.selectedCount((sd.choices || []).length, step.pick)}</div>
        </div>
      )}

      {step.type === "chapters" && (() => {
        const picks = ((app.steps || {})[step.dependsOn] || {}).choices || [];
        return (
          <div>
            {picks.length === 0
              ? <p style={{ color: C.sub, fontSize: 13.5 }}>{t.chaptersLocked}</p>
              : <ul style={{ margin: "0 0 14px", paddingLeft: 20, color: C.ink, fontSize: 14.5, lineHeight: 1.9 }}>
                  {picks.map((p) => <li key={p}><strong>{chapterLabel(chapters, p)}</strong></li>)}
                </ul>}
            {!locked && <Btn kind={sd.done ? "good" : "solid"} onClick={() => onChange({ ...sd, done: !sd.done })}>
              {sd.done ? t.markedDone : t.markDone}
            </Btn>}
          </div>
        );
      })()}

      {step.type === "l101" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ background: "#F4F6FA", borderRadius: 10, padding: "12px 14px", fontSize: 14 }}>
            {t.pinBefore} <strong style={{ letterSpacing: ".08em" }}>{cfg.l101Pin || t.pinMissing}</strong>
          </div>
          {/* Bri, Jul 25: "Step 3, lets link it." Opens the class in place rather
              than describing where to find it — an instruction to go and find a
              page is a step someone can get wrong. `cfg.l101Link` still works if
              an external URL is ever set, and the written directions remain as
              the last fallback so this step is never a dead end. */}
          {/* Bri, Jul 25: "not showing a portal to the class for Step 3. Only
              seeing the pin that is set." The parent's callback only exists when
              PeakReachers renders this page — opened from the tile it was undefined
              and she got the PIN and nothing else. Now the class opens IN PLACE
              from either route, and the callback is preferred when present so
              the Team Site keeps its own back-navigation. */}
          {/* 🐛 Bri, Jul 26: "The button is visible on the Step 3 entrance for
              the class through the app, but it's not connecting and taking me
              anywhere." The else branch called setInlineL101 — which is state
              belonging to ProfessionalGrowth, NOT to StepCard. StepCard is a
              separate top-level function and never received it, so the click
              threw a ReferenceError, React logged it, and the page sat still.
              Parse-clean and completely dead. ⇒ scope.js exists for this class.
              StepCard now takes ONE resolved callback and owns no routing
              decision; the parent decides how the class opens. */}
          {onOpenL101 && <Btn kind="ghost" onClick={onOpenL101}>{t.openL101}</Btn>}
          {cfg.l101Link && <Btn as="a" href={cfg.l101Link} kind="ghost">{t.classEntrance}</Btn>}
          {!onOpenL101 && !cfg.l101Link && (
            <div style={{ fontSize: 13, color: "#5b6b82", lineHeight: 1.5 }}>
              {t.l101Before} <strong>{programLabel()} &rarr; Growth &amp; Development &rarr; Leadership 101</strong> {t.l101After}
            </div>
          )}
          {!locked && <div><Btn kind={sd.done ? "good" : "solid"} onClick={() => onChange({ ...sd, done: !sd.done })}>
            {sd.done ? t.markedDone : t.markDone}</Btn></div>}
        </div>
      )}

      {/* ★ THE PICKER REPLACES CALENDLY ONLY ONCE THERE ARE TIMES TO PICK.
          No slots means this renders exactly what it always did, so nothing
          changes for anyone mid-application until Bri publishes her first one. */}
      {step.type === "calendly" && slotList(iv && iv.slots).length > 0 && (
        <InterviewPicker iv={iv} slug={slug} uid={uid} locked={locked} t={t}
          onBook={onBookSlot} onCancel={onCancelSlot} />
      )}
      {/* ⚠️ NO LINK IS A THIRD STATE, NOT AN EMPTY SECOND ONE. `cfg.calendly`
          defaults to "" now (see DEFAULT_CONFIG), and `href=""` renders a
          button that reloads the page instead of opening anything — a dead
          control the applicant would press twice and then give up on.
          ⚠️ MARK AS COMPLETED STAYS AVAILABLE in both branches. The interview
          itself happens away from the Hub, so a store booking by text message
          must still be able to finish the step. Blocking it would strand the
          application on a screen the applicant cannot clear. */}
      {step.type === "calendly" && slotList(iv && iv.slots).length === 0 && (
        <div style={{ display: "grid", gap: 12 }}>
          {String(cfg.calendly || "").trim()
            ? <div><Btn as="a" href={cfg.calendly} kind="solid">{t.openCalendly}</Btn></div>
            : <div style={{ fontSize: 13, color: "#5b6b82", lineHeight: 1.5 }}>{t.noBookingLink}</div>}
          {!locked && <div><Btn kind={sd.done ? "good" : "ghost"} onClick={() => onChange({ ...sd, done: !sd.done })}>
            {sd.done ? t.markedDone : t.markDone}</Btn></div>}
        </div>
      )}

      {step.type === "recs" && (
        <RecStep sd={sd} locked={locked} leaders={dirLeaders} onChange={onChange}
          onRequest={onRequestRecs} onWithdraw={onWithdrawRec} t={t} />
      )}

      {err && <div style={{ color: C.redDeep, background: "#FBEAED", borderRadius: 8, padding: "8px 10px", fontSize: 13, marginTop: 10 }}>{err}</div>}

      {(step.type === "check") && !locked && (
        <Btn kind={sd.done ? "good" : "solid"} onClick={() => onChange({ ...sd, done: !sd.done })}>
          {sd.done ? t.markedDone : t.markDone}
        </Btn>
      )}
    </>
  );

  return (
    <div style={{ background: C.card, border: `1px solid ${done ? C.green : C.line}`, borderRadius: 16,
      padding: 18, marginBottom: 14, opacity: unlocked ? 1 : 0.55 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
          background: done ? C.green : unlocked ? C.navy : "#C6CBD6", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14 }}>
          {done ? "✓" : index + 1}
        </span>
        <div style={{ fontWeight: 800, fontSize: 16, color: C.ink, flex: 1 }}>{tx.title || step.title}</div>
        {!unlocked && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sub, background: "#EEF0F4", padding: "3px 9px", borderRadius: 20 }}>{t.locked}</span>}
      </div>
      {unlocked ? body : <p style={{ color: C.sub, fontSize: 13.5, margin: 0 }}>{t.lockedHint}</p>}
    </div>
  );
}

/* Job titles stay English everywhere, and in ONE place — see the note in
   UI_ES. This used to be written out twice inside RecStep, in a row renderer
   and in a dropdown option, which is exactly how two spellings of the same
   label start to drift. */
const TIER_LABEL = { ad: "Assistant Director", tl: "Team Leader" };
const tierName = (tier) => TIER_LABEL[tier] || TIER_LABEL.tl;

/* ── Bri picks which calendar each application books into ────────────────────
   ★ MODULE LEVEL, outside the admin screen (design rule 7).
   ⚠️ IT LISTS EVERY EVENT TYPE IN THE STORE, not only hers. Hannah runs
   Evaluations and co-hosts Leadership Interviews; an application that could
   only ever point at the signed-in person's own types would make it impossible
   to send Trainer applicants to whoever is actually doing those interviews. */
function CalTypePicker({ cfg, setCfg }) {
  const [types, setTypes] = useState(null);          // null = still loading
  useEffect(() => { let live = true; (async () => {
    try { const v = await kvGet(CAL_TYPES_KEY); if (live) setTypes(calTypeList(v)); }
    catch { if (live) setTypes([]); }
  })(); return () => { live = false; }; }, []);

  const set = (roleKey, id) =>
    setCfg({ ...cfg, interviewType: { ...(cfg.interviewType || {}), [roleKey]: id } });

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 2 }}>Where each interview is booked</div>
      <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.5, marginBottom: 8 }}>
        Pick an event type and applicants book a real time on that person&rsquo;s calendar.
        Leave it on Calendly and nothing changes.
      </div>
      {types === null ? (
        <div style={{ fontSize: 13, color: C.sub }}>Loading event types&hellip;</div>
      ) : types.length === 0 ? (
        <div style={{ fontSize: 13, color: C.sub }}>
          No event types exist yet. Make one in the Calendar tile first, then come back.
        </div>
      ) : Object.entries(ROLES).map(([key, r]) => (
        <label key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7, fontSize: 13, fontWeight: 600, color: C.sub }}>
          <span style={{ minWidth: 150 }}>{r.icon} {r.label}</span>
          <select value={((cfg.interviewType || {})[key]) || ""} onChange={(e) => set(key, e.target.value)}
            style={{ ...inp, width: "auto", flex: 1 }}>
            <option value="">Calendly (as it is now)</option>
            {types.filter((x) => x.active !== false).map((x) => (
              <option key={x.id} value={x.id}>{x.label}</option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

/* ── the applicant picks a time ──────────────────────────────────────────────
   ⚠️ THE SERVER'S ANSWER IS THE ONLY ANSWER. This never marks itself booked
   optimistically: the list it renders comes back from /api/interview, so a
   slot somebody else took a second earlier shows as taken rather than as
   "yours" until the next reload. A double booking that both people believe in
   is the failure this whole route exists to prevent. */
function InterviewPicker({ iv, slug, uid, locked, t, onBook, onCancel }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  /* ⚠️ ONE RESOLVER, SHARED WITH stepDone. The card saying "you are booked"
     and the Submit button agreeing that the step is finished must come from the
     same answer, or somebody is looking at their confirmed interview unable to
     submit and with nothing on screen explaining why. */
  const { held, open } = interviewSlots(iv, slug, uid);

  const run = async (fn, id) => {
    setErr(""); setBusy(id);
    const msg = await fn(id);
    setBusy("");
    if (msg) setErr(msg);
  };

  if (held) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ background: "#E7F6EC", border: "1px solid #BBE5C8", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontWeight: 800, fontSize: 14.5, color: "#166534" }}>{t.interviewBooked}</div>
          <div style={{ fontSize: 14, color: "#166534", marginTop: 2 }}>
            {fmtWhen(held.at)}{held.mins ? ` · ${durationText(held.mins, { hr: t.hours, min: t.minutes })}` : ""}
          </div>
        </div>
        {!locked && (
          <div><Btn kind="ghost" small disabled={busy === held.id}
            onClick={() => run(onCancel, held.id)}>
            {busy === held.id ? t.working : t.interviewChange}
          </Btn></div>
        )}
        {err && <div style={{ color: C.redDeep, background: "#FBEAED", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>{err}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {open.length === 0 ? (
        <div style={{ fontSize: 13.5, color: C.sub }}>{t.interviewNone}</div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: C.sub }}>{t.interviewPick}</div>
          {open.map((s) => (
            <button key={s.id} type="button" disabled={locked || !!busy}
              onClick={() => run(onBook, s.id)}
              style={{ textAlign: "left", fontFamily: FONT, fontSize: 14.5, fontWeight: 600,
                border: `1px solid ${C.line}`, background: "#fff", color: C.ink, borderRadius: 10,
                padding: "11px 14px", cursor: locked || busy ? "default" : "pointer",
                opacity: busy && busy !== s.id ? 0.5 : 1 }}>
              {busy === s.id ? t.working : fmtWhen(s.at)}
              {s.mins ? <span style={{ color: C.sub, fontWeight: 500 }}> · {durationText(s.mins, { hr: t.hours, min: t.minutes })}</span> : null}
            </button>
          ))}
        </>
      )}
      {err && <div style={{ color: C.redDeep, background: "#FBEAED", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>{err}</div>}
    </div>
  );
}

// ── recommendation step (applicant side) ────────────────────────────────────
/* ═══ WITHDRAW AND ASK SOMEBODY ELSE (Bri, Aug 10 2026) ═════════════════════
   "José is trying to resend using the function we made that's supposed to give
   them an option to select another leader for recommendation, but he's not got
   that option. Has it disappeared or is it not functioning properly?"

   It had never existed. Two requests made the picker vanish for good, and
   there was no cancel, no decline and no swap — so ONE leader who never opens
   the Hub could freeze an application with a due date on it, permanently, and
   nobody on any screen could do a thing about it. That is what happened to
   Jose Arias Cortez, whose Team Leader application is dated the 15th.

   ★ WITHDRAWN REQUESTS MOVE OUT OF `recs`, THEY ARE NOT MARKED IN IT. This is
   the whole design and it is not a shortcut. FIVE separate readers treat
   "status is not completed" as "still outstanding":
     · this file's RecInbox, which lists the leader's tasks
     · App.jsx, which paints the badge count
     · HRConsole.jsx, which shows the leader a banner
     · HRConsole.jsx again, in Bri's read-only application view
     · worker.js, whose scheduled job DMs the leader a REMINDER
   A `status: "withdrawn"` would have read as outstanding in every one of them,
   so a cancelled request would have kept a task in someone's inbox, kept a
   number on a badge, and had a cron job chase them about it every day forever.
   Fixing that meant editing three multi-session files at once. Moving the
   record instead means every one of those readers stops seeing it and is
   already correct, with no change to any of them.

   ⚠️ NOTHING IS DELETED. The record moves to `sd.withdrawn` with a timestamp,
   so who was asked and dropped is still on the application. Old records have
   no such key and every read of it is guarded — design rule 1.

   ⚠️ A COMPLETED RECOMMENDATION CAN NEVER BE WITHDRAWN. That is a leader's
   written work, and the applicant is not allowed to see it, let alone destroy
   it. The control does not render on a completed row and the handler refuses
   one as well.

   ⚠️ A WITHDRAWN LEADER BECOMES SELECTABLE AGAIN. The dropdown excludes people
   with a LIVE request, which is what "over-excluding is the safe direction"
   below was ever about; a cancelled one is not live. Keeping them out forever
   would make a mis-tap unrecoverable, and there are only so many Assistant
   Directors. */
function RecStep({ sd, locked, leaders, onChange, onRequest, onWithdraw = () => {}, t = UI_EN }) {
  const recs = sd.recs || [];
  const gone = Array.isArray(sd.withdrawn) ? sd.withdrawn : [];
  const [sel, setSel] = useState("");

  const withdraw = (i) => {
    const r = recs[i];
    if (!r || r.status === "completed" || locked) return;   // refuses, not just hidden
    if (!window.confirm(t.confirmWithdraw(r.leaderName))) return;
    onChange({
      ...sd,
      recs: recs.filter((_, j) => j !== i),
      withdrawn: [...gone, { ...r, status: "withdrawn", withdrawnAt: new Date().toISOString() }],
    });
    onWithdraw(r);
  };

  const canPick = recs.length < 2 && !locked;
  /* ★ IDENTITY BY HR ID, NAME ONLY AS A FALLBACK (Bri's mandate: "if a new
     team member is added I want them to flow seamlessly into all of the
     functions we have in place… let's do it right the first time").
     This list used to dedupe and select on the NAME alone, which breaks three
     ways that all look like a UI glitch rather than a data bug:
       · a leader RENAMED in the directory stops matching the frozen
         `leaderName` on their own in-progress request, so they reappear in
         the dropdown and can be asked twice;
       · two leaders who genuinely share a name are indistinguishable —
         `leaders.find(x => x.name === sel)` returns whichever comes first;
       · the roster really does hold near-collisions (tm26 Lizbeth Gonzalez
         and tm27 Lizbeth are two different people).
     Every rec already carries `leaderId`; it just wasn't being used here.
     Leaders without an hrId keep the old name behaviour rather than
     disappearing from the list. */
  const leaderKey = (l) => (l && l.hrId != null && String(l.hrId) !== "" ? `id:${l.hrId}` : `nm:${norm(l && l.name)}`);
  /* ⚠️ MATCH ON EITHER SIDE, NOT ON ONE KEY. A request written before Jul 24
     carries only `leaderName`, while the leader now carries an hrId — keying
     both as a single value would make the legacy rec stop matching and the
     leader would be offered a second time. So collect ids AND names, and
     exclude a leader if EITHER hits. Over-excluding is the safe direction: a
     missing option is a question, a duplicate request is a real mess. */
  const chosenIds = new Set(recs.filter((r) => r && r.leaderId != null && String(r.leaderId) !== "").map((r) => String(r.leaderId)));
  const chosenNames = new Set(recs.map((r) => norm(r && r.leaderName)).filter(Boolean));
  const isChosen = (l) =>
    (l && l.hrId != null && String(l.hrId) !== "" && chosenIds.has(String(l.hrId))) ||
    chosenNames.has(norm(l && l.name));
  const needAD = recs.length === 1 && recs[0].leaderTier !== "ad";
  const pool = leaders.filter((l) => !isChosen(l) && (!needAD || l.tier === "ad"));
  /* ⚠️ ONE ROW RENDERER. There were two of these, in two branches, and they had
     already drifted: one showed the leader's title and a green badge when the
     recommendation was in, the other always said "in progress" and showed no
     title. Which one you saw depended on how many requests you had made. */
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {recs.map((r, i) => {
        const done = r.status === "completed";
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#F4F6FA", borderRadius: 10, padding: "11px 14px" }}>
            <span style={{ flex: 1, minWidth: 150, fontSize: 14 }}>
              {r.leaderName} <span style={{ color: C.sub }}>({tierName(r.leaderTier)})</span>
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 20, padding: "3px 10px",
              background: done ? "#E7F6EC" : "#FEF3C7", color: done ? "#166534" : "#92400E" }}>
              {done ? t.recDone(r.leaderName) : t.recPending(r.leaderName)}
            </span>
            {!done && !locked && (
              <button type="button" onClick={() => withdraw(i)}
                style={{ ...btnGhost, fontSize: 12, padding: "5px 10px" }}>{t.withdraw}</button>
            )}
          </div>
        );
      })}

      {/* Kept so the record shows who was asked and dropped. Muted, because it
          is history rather than something to act on. */}
      {gone.length > 0 && (
        <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.6 }}>
          {t.recWithdrawnTitle}: {gone.map((r) => (r && r.leaderName) || "—").join(", ")}
        </div>
      )}

      {locked && recs.length < 2 && <p style={{ color: C.sub, fontSize: 13, margin: 0 }}>{t.recWaiting}</p>}

      {canPick && needAD && <div style={{ fontSize: 13, color: "#92400E", background: "#FEF3C7", borderRadius: 8, padding: "8px 10px" }}>
        {t.recNeedAD}
      </div>}
      {canPick && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ ...inp, flex: 1, minWidth: 200 }}>
            <option value="">{t.recChoose}</option>
            {pool.map((l) => <option key={leaderKey(l)} value={leaderKey(l)}>{l.name} — {tierName(l.tier)}</option>)}
          </select>
          <Btn kind="solid" disabled={!sel} onClick={() => {
            // Resolve by the SAME key the option carried — never by name.
            const l = leaders.find((x) => leaderKey(x) === sel); if (!l) return;
            // leaderName is kept for display and for older readers; leaderId is
            // what identity now hangs off.
            const next = [...recs, { leaderName: l.name, leaderId: l.hrId || null, leaderTier: l.tier,
              status: "in_progress", requestedAt: new Date().toISOString() }];
            onChange({ ...sd, recs: next });
            onRequest(l);
            setSel("");
          }}>{t.recRequest}</Btn>
        </div>
      )}
    </div>
  );
}

// ── leader's inbox: recommendations they've been asked to write ─────────────
function RecInbox({ viewer, cfg, onDone }) {
  const [tasks, setTasks] = useState([]);
  const [open, setOpen] = useState(null);
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  /* ★ THE DIRECTORY IS PART OF THE MATCH NOW (Matt, Aug 9 2026: "We have alot
     of Hispanic workers and this is very common"). Spanish names carry two
     surnames, so a request frozen as "Jose Arias" and a viewer named "Jose
     Arias Cortez" are the SAME person — while "Lizbeth Gonzalez" and "Lizbeth
     Gonzalez Ramos" are two. Only the roster can tell those apart, so
     recMatches is handed it and refuses only on a real collision.
     ⚠️ Declared with the other useStates, above the `!tasks.length` early
     return, so the hook order can never shift. */
  const [dirLeaders, setDirLeaders] = useState([]);

  useEffect(() => { (async () => {
    // Repair first, then match — so an old request that has just been given an
    // id shows up on THIS load rather than the next one.
    await backfillRecIds();
    const idx = (await kvGet(INDEX_KEY)) || [];
    /* Same source backfillRecIds uses, so the repair above and the match below
       are reading one directory rather than two snapshots of it. */
    const leaders = leadersFromDirectory(await kvGet(DIR_KEY));
    setDirLeaders(leaders);
    const mine = [];
    /* ★ EVERY PIPELINE, NOT JUST TEAM LEADER (Bri, Jul 27).
       This used to read `idx.filter(x => x.role === "team-leader")`. Bri runs
       three pipelines — Trainer, Team Leader and Assistant Director — so a
       recommendation requested on either of the other two was invisible here
       FOREVER, while the Peak Reachers badge counted it. That is exactly what
       she reported: "only a single icon showing an alert, no area to complete
       them." The badge was right and this panel was blind. */
    for (const e of idx) {
      const app = await kvGet(appKey(e.role, e.slug));
      const recs = ((app && app.steps && app.steps.l2) || {}).recs || [];
      const r = recs.find((x) => recMatches(x, viewer, leaders) && x.status !== "completed");
      if (r) mine.push({ entry: e, app });
    }
    setTasks(mine);
  })(); }, [viewer.name]);

  if (!tasks.length) return null;

  /* ⚠️ A SLUG IS NO LONGER UNIQUE IN THIS LIST. One person can hold a Trainer
     AND a Team Leader application at the same time, so every key, every open/
     close toggle and every removal has to be role+slug. Keying on the slug
     alone would collapse two separate requests into one row and close the
     wrong one on submit. */
  const taskKey = (t) => `${t.entry.role}:${t.entry.slug}`;

  const submit = async (t) => {
    setBusy(true);
    /* ⚠️ THE ROLE COMES FROM THE TASK, NOT A LITERAL. Both of these read
       `appKey("team-leader", …)` before Jul 27. With the role filter gone, that
       would have loaded one application and written the answers into a
       different one — or created a phantom team-leader record for someone who
       never applied for it. */
    const role = t.entry.role;
    /* kvGetResult, not kvGet — a failed read came back null here, which threw
       on app.steps and left the button stuck on "Sending…" with no message.
       Worse, anything built off that null would have replaced the whole
       application record. A refused submit keeps the answers on screen. */
    const appR = await kvGetResult(appKey(role, t.entry.slug));
    if (!appR.ok || !appR.value) {
      setBusy(false);
      window.alert("The application record did not load — check the wifi and hit Submit again. Your answers are still here.");
      return;
    }
    const app = appR.value;
    const sd = (app.steps && app.steps.l2) || {};
    // Same matcher as the lookup above — if these two ever disagree, a leader
    // could open a request and then fail to mark it complete.
    /* ★ SNAPSHOT THE QUESTIONS ONTO THE RECORD, not just the answers.
       Answers are keyed by question id, and Bri can edit her recommendation
       questions at any time — so pairing an old answer against today's question
       list would eventually caption someone's words with a question they were
       never asked. Storing the labels as they stood at submission makes each
       recommendation self-describing and permanently readable. Same reasoning
       as storing item titles with L101 progress records. */
    const askedQs = (cfg.recQuestions || []).map((q) => ({ id: q.id, label: q.label }));
    /* ⚠️ THE ROSTER GOES IN HERE TOO, AND THIS IS THE DANGEROUS ONE. This line
       stamps `completed` plus the opener's answers onto EVERY matching rec, so
       a loose match here is what let the wrong Lizbeth close a confidential
       recommendation the other one never saw. */
    const recs = (sd.recs || []).map((r) => recMatches(r, viewer, dirLeaders)
      ? { ...r, status: "completed", completedAt: new Date().toISOString(), answers, questions: askedQs } : r);
    const next = { ...app, steps: { ...(app.steps || {}), l2: { ...sd, recs } }, updatedAt: new Date().toISOString() };
    /* The Slack ping, the form close and the task removal all announce "this
       recommendation is done" — none of them may happen unless the write
       actually landed. kvSet returns false on failure, it never throws. */
    const ok = await kvSet(appKey(role, t.entry.slug), next);
    if (ok === false) {
      setBusy(false);
      window.alert("Your recommendation did not save — check the wifi and hit Submit again. Your answers are still here.");
      return;
    }
    await notifySlack(notifyTo(cfg), `${viewer.name} has completed a recommendation for ${t.entry.name}'s ${(ROLES[role] || {}).label || role} application.`, `${viewer.name} completed a recommendation for ${t.entry.name}`);
    setBusy(false); setOpen(null); setAnswers({});
    setTasks(tasks.filter((x) => taskKey(x) !== taskKey(t)));
    onDone && onDone();
  };

  return (
    <div style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 16, padding: 18, marginBottom: 20 }}>
      <div style={{ fontWeight: 800, fontSize: 16, color: "#92400E", marginBottom: 4 }}>✍️ Recommendations requested from you</div>
      <p style={{ color: "#92400E", fontSize: 13.5, margin: "0 0 12px" }}>Your answers are confidential — the applicant only sees that you've completed it.</p>
      {tasks.map((t) => (
        <div key={taskKey(t)} style={{ background: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, fontWeight: 700 }}>{t.entry.name}
              {/* Which application this is for. With three pipelines in one
                  list, the name alone doesn't say what you're recommending
                  them for — and the same person can appear twice. */}
              <span style={{ color: C.sub, fontWeight: 500 }}> · {(ROLES[t.entry.role] || {}).label || t.entry.role}</span>
            </div>
            <Btn small kind={open === taskKey(t) ? "ghost" : "solid"} onClick={() => setOpen(open === taskKey(t) ? null : taskKey(t))}>
              {open === taskKey(t) ? "Close" : "Write it"}
            </Btn>
          </div>
          {open === taskKey(t) && (
            <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
              {(cfg.recQuestions || []).map((q) => (
                <label key={q.id} style={{ fontSize: 13.5, fontWeight: 600, color: C.sub }}>{q.label}
                  <textarea value={answers[q.id] || ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    style={{ ...ta, minHeight: 90, marginTop: 6 }} />
                </label>
              ))}
              <div><Btn kind="solid" disabled={busy} onClick={() => submit(t)}>{busy ? "Submitting…" : "Submit recommendation"}</Btn></div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── main ────────────────────────────────────────────────────────────────────
// `onOpenL101` — passed by PeakReachers, which renders BOTH this page and the class.
// ⚠️ THE CLASS IS DELIBERATELY *NOT* IMPORTED HERE. Leadership101 imports
// loadHRTeam from HRConsole, and HRConsole imports recMatches from this file —
// importing it would close that circle and break the build. Handing the door
// down as a callback from the parent that already holds both is the way round
// it. Undefined when this page is opened from anywhere else, and step 3 falls
// back to a written instruction.
// Re-exported so nothing that imported these from this file breaks.
export { sameLeader, recMatches, resolveLeaderId, stampRecIds };

export default function ProfessionalGrowth({ onBack, onOpenL101 }) {
  // Opened in place when no parent offered a route to the class.
  const [inlineL101, setInlineL101] = useState(false);
  // Resolved HERE, once, so StepCard is handed something that always works.
  // PeakReachers's own callback wins when present (it keeps its back-navigation);
  // from the App tile there is no parent route, so we open in place instead.
  const openL101 = onOpenL101 || (() => setInlineL101(true));
  const [cfg, setCfg] = useState(null);
  // cfgFailedRef: the config read failed — admin edits refuse (saving would
  // write the defaults over Bri's authored config). appFailed: this person's
  // application read failed — the form refuses to render as blank, or the
  // next keystroke would autosave emptiness over their whole application.
  // saveErr: an autosave write came back false after a clean load.
  const cfgFailedRef = useRef(false);
  const [appFailed, setAppFailed] = useState(false);
  const [saveErr, setSaveErr] = useState(false);
  const [role, setRole] = useState(null);
  const [app, setApp] = useState(null);
  const [leaders, setLeaders] = useState([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const skip = useRef(true);

  /* ── THE APPLICATION IN SPANISH ────────────────────────────────────────
     Bri, Aug 3 2026: "In my opinion it is worth the investment to also make
     the Spanish option available for all of our applications… We have a large
     portion of our team that speaks Spanish and this would be a helpful tool
     to include them."

     ⚠️ ENGLISH IS THE ONLY THING SAVED. `view` is what the config actually
     says; `trEs` is a translated COPY held in memory for as long as this
     screen is open. Nothing here is ever written back, so a translation can
     never overwrite Bri's wording, and nothing an applicant typed is sent
     anywhere. The toggle changes what is DRAWN and nothing else.

     ⚠️ NOT PERSISTED, on purpose. Every open starts in English, same as the
     class and Prep Work toggles. A remembered language would be one more piece
     of stored state to get wrong on a shared iPad, where the next person to
     pick it up is usually not the person who set it. */
  /* Interview slots. Held here rather than inside the step card because the
     unlock test and the Submit button both need them — see stepDone. */
  /* `iv` is the resolved answer to "where do this role's interview times come
     from": { slots, cal, typeId, ownerId }. `cal` false means the old
     standalone list, which is arm 2 — see interviewFor above. */
  const [iv, setIv] = useState({ slots: [], cal: false, typeId: "", ownerId: "" });
  const loadIv = async (roleKey, config) => {
    const typeId = interviewFor(config, roleKey);
    if (typeId) {
      try {
        const types = calTypeList(await kvGet(CAL_TYPES_KEY));
        const type = types.find((x) => String(x.id) === typeId) || null;
        /* ⚠️ A TYPE SHE LATER DELETED FALLS BACK, it does not strand the step.
           The applicant sees the old list or Calendly rather than an interview
           step that offers nothing and cannot be finished. */
        if (type && type.ownerId) {
          const rows = await kvGet(calSlotsKey(type.ownerId));
          return { slots: Array.isArray(rows) ? rows : [], cal: true,
            typeId, ownerId: bareId(type.ownerId) };
        }
      } catch { /* fall through to the old list */ }
    }
    try {
      const v = await kvGet(SLOTS_KEY);
      return { slots: Array.isArray(v) ? v : [], cal: false, typeId: "", ownerId: "" };
    } catch { return { slots: [], cal: false, typeId: "", ownerId: "" }; }
  };
  useEffect(() => { let live = true; (async () => {
    // no slots on either arm = today's behaviour, never a broken step
    const next = await loadIv(role, cfg);
    if (live) setIv(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })(); return () => { live = false; }; }, [role, cfg && cfg.interviewType && cfg.interviewType[role]]);

  const [lang, setLang] = useState("en");
  const [trEs, setTrEs] = useState(null);
  const [trState, setTrState] = useState("");     // "" | "loading" | "failed"

  // Stable identity so the effect below re-runs on a real change, not per render.
  const view = useMemo(() => (cfg && role ? appView(cfg, role) : null), [cfg, role]);

  useEffect(() => {
    if (lang !== "es" || !view) return undefined;
    let alive = true;
    setTrEs(null); setTrState("loading");
    (async () => {
      try {
        const texts = collectAppStrings(view);
        if (!texts.length) { if (alive) setTrState(""); return; }
        const r = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
          body: JSON.stringify({ lang: "es", texts }),
        });
        const d = await r.json().catch(() => null);
        if (!alive) return;
        if (!r.ok || !d || d.ok !== true) { setTrState("failed"); return; }
        /* Null here means the reply did not hold one string per string sent.
           Showing English is the right answer: a list put back shifted by one
           reads as a finished translation while every instruction sits under
           the wrong step. */
        const built = applyAppStrings(view, d.texts);
        if (!built) { setTrState("failed"); return; }
        setTrEs(built); setTrState("");
      } catch { if (alive) setTrState("failed"); }
    })();
    return () => { alive = false; };
  }, [lang, view]);

  const viewer = getViewer();
  const admin = isAdmin(viewer);
  /* CLOSED MEANS "NO NEW APPLICANTS", not "everyone out" — Bri, Jul 23:
     "If someone is already in the process, they can continue." So the picker
     needs to know which roles this person already has an application for
     BEFORE it decides to block. Read from the index; on any failure the set is
     empty, which fails toward blocking a NEW applicant rather than locking out
     someone mid-application... so the guard below is written the safe way
     round: an existing application is checked first and an index read that
     comes back empty only ever affects people who have nothing in flight. */
  const [myRoles, setMyRoles] = useState(null); // null = not loaded yet
  useEffect(() => { let live = true; (async () => {
    try {
      const list = (await kvGet(INDEX_KEY)) || [];
      const mine = slugify((viewer && viewer.name) || "");
      if (live) setMyRoles(new Set(list.filter((x) => x.slug === mine).map((x) => x.role)));
    } catch { if (live) setMyRoles(new Set()); }
  })(); return () => { live = false; }; }, [viewer && viewer.name]);

  useEffect(() => { (async () => {
    const cfgR = await loadConfigResult();
    cfgFailedRef.current = !cfgR.ok;
    setCfg(cfgR.cfg);
    try {
      const d = await kvGet(DIR_KEY);
      const out = [];
      (d && d.teams ? d.teams : []).forEach((t) => (t.people || []).forEach((p) => {
        // hrId comes from TeamDirectory's enrichWithHR. It can be null when a
        // name never resolved to an HR record — carried through as null rather
        // than dropped, so the caller can tell "no id" from "not looked up".
        if ((p.tier === "ad" || p.tier === "tl") && p.name) {
          out.push({ name: p.name, tier: p.tier, hrId: p.hrId == null ? null : String(p.hrId) });
        }
      }));
      setLeaders(out.sort((a, b) => a.name.localeCompare(b.name)));
    } catch { /* directory optional */ }
  })(); }, []);

  // load this person's application for the chosen role
  useEffect(() => { (async () => {
    if (!role || !viewer) { setApp(null); setAppFailed(false); return; }
    const slug = slugify(viewer.name);
    /* kvGetResult — a failed read used to seed a BLANK application here, and
       the next keystroke autosaved that blank over every EOI answer, every
       step, and the recommendations leaders had already written onto the
       record. On ok:false the form refuses to open instead. */
    const r = await kvGetResult(appKey(role, slug));
    if (!r.ok) { setAppFailed(true); setApp(null); return; }
    setAppFailed(false);
    skip.current = true;
    setApp(r.value || { role, slug, name: viewer.name, status: "new", eoi: {}, steps: {}, updatedAt: null });
  })(); }, [role, viewer && viewer.name]);

  // autosave
  useEffect(() => {
    if (!app || !role) return;
    if (skip.current) { skip.current = false; return; }
    let live = true;
    (async () => {
      const rec = { ...app, updatedAt: new Date().toISOString() };
      const ok = await kvSet(appKey(role, app.slug), rec);
      /* The index is the ONLY path HR Console enumerates applications through
         — a record that saves but misses the index is invisible to Bri, so
         "Saved" may only show when BOTH landed. upsertIndex already refuses
         on a failed read; a false from either raises the banner instead, and
         the next keystroke retries both. */
      const idxOk = ok === false ? false
        : await upsertIndex({ role, slug: app.slug, name: app.name, status: rec.status, updatedAt: rec.updatedAt });
      if (!live) return;
      if (ok !== false && idxOk !== false) {
        setSaveErr(false);
        setSaved(true); setTimeout(() => setSaved(false), 1300);
      } else {
        setSaveErr(true);
      }
    })();
    return () => { live = false; };
  }, [app, role]);

  /* The two things every render below reads. `shown` falls back to English on
     its own while a translation is loading or if one failed, so there is no
     state in which the screen has no words. */
  const T = uiFor(lang);
  const shown = (lang === "es" && trEs) ? trEs : view;

  // Full-screen takeover, after every hook. Back returns to the application at
  // the step they left, not to the tile — losing your place mid-application is
  // exactly the friction Step 3 was meant to remove.
  if (inlineL101) {
    return <Leadership101 onBack={() => setInlineL101(false)} />;
  }

  if (!cfg) return <div style={{ fontFamily: FONT, padding: 40, color: C.sub }}>Loading…</div>;

  if (!viewer) return (
    <Shell onBack={onBack} title="Professional Growth">
      <Banner tone="warn">Please sign in to the Hub to view or start an application.</Banner>
    </Shell>
  );

  // ── role picker ──
  if (!role) {
    return (
      <Shell onBack={onBack} title="Professional Growth" saved={saved}>
        <Hero />
        <RecInbox viewer={viewer} cfg={cfg} />
        <p style={{ color: C.sub, fontSize: 14.5, lineHeight: 1.55, margin: "0 0 16px" }}>
          Ready for your next step? Choose the role you'd like to pursue. Each application saves as you go, so you can stop and pick up where you left off.
        </p>
        <div style={{ display: "grid", gap: 12 }}>
          {Object.entries(ROLES).map(([key, r]) => {
            const win = roleWindow(cfg, key);
            const shut = !win.open;
            // Closed blocks NEW applicants only. Anyone who already has an
            // application on this role keeps going, and an admin always gets
            // in (otherwise closing one locks Bri out of its own settings).
            // While the index is still loading (myRoles === null) nobody is
            // blocked — a slow read must never bounce someone mid-application.
            const started = myRoles === null || myRoles.has(key);
            const canOpen = !shut || admin || started;
            return (
              <button key={key} onClick={() => canOpen && setRole(key)} disabled={!canOpen}
                style={{ display: "flex", alignItems: "center", gap: 15,
                  background: shut ? "#FAFAF8" : C.card, border: `1px solid ${C.line}`,
                  borderLeft: `3px solid ${shut ? C.sub : C.red}`, borderTop: `3px solid ${shut ? C.sub : C.red}`, borderRadius: 16,
                  padding: "16px 18px", cursor: canOpen ? "pointer" : "default",
                  opacity: shut && !canOpen ? 0.7 : 1, fontFamily: FONT, textAlign: "left" }}>
                <span style={{ width: 48, height: 48, borderRadius: 13, background: shut && !canOpen ? "#EFEFEC" : "#FBE7EC", display: "flex",
                  alignItems: "center", justifyContent: "center", fontSize: 23, flexShrink: 0 }}>{r.icon}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block", fontWeight: 800, fontSize: 17, color: shut ? C.sub : C.ink }}>{r.label}</span>
                  <span style={{ display: "block", fontSize: 13, color: C.sub, marginTop: 2 }}>
                    {shut
                      ? (admin ? `${win.reason === "before" ? "Opens " + fmtWhen(win.at) : win.reason === "after" ? "Closed " + fmtWhen(win.at) : "Closed to new applicants"} — you can still open it`
                        : started ? "Closed to new applicants · you already started, so you can finish"
                        : win.reason === "before" ? `Opens ${fmtWhen(win.at)}`
                        : win.reason === "after" ? `Closed ${fmtWhen(win.at)}`
                        : "Not accepting new applications right now")
                      : `${stepsFor(cfg, key).length} steps · start or continue${(cfg.due || {})[key] ? " · due " + (cfg.due || {})[key] : ""}${win.closesAt ? " · closes " + fmtWhen(win.closesAt) : ""}`}
                  </span>
                </span>
                {shut && !canOpen
                  ? <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".05em", color: C.sub, background: "#EFEFEC", borderRadius: 20, padding: "3px 10px" }}>CLOSED</span>
                  : <span style={{ color: shut ? C.sub : C.red, fontWeight: 800, fontSize: 17 }}>→</span>}
              </button>
            );
          })}
        </div>
        {admin && <AdminPanel cfg={cfg} setCfg={(c) => {
          // Refuse after a failed config load — one edit would save the
          // DEFAULTS over Bri's authored forms, copy and windows.
          if (cfgFailedRef.current) {
            window.alert("Settings did not load, so editing is off — saving now would erase the real configuration. Check the wifi and refresh.");
            return;
          }
          const prev = cfg;
          setCfg(c);
          saveConfig(c).then((ok) => {
            if (ok === false) {
              setCfg(prev);
              window.alert("That settings change did not save — check the wifi and make it again.");
            }
          });
        }} />}
      </Shell>
    );
  }

  // ── one role's application ──
  const R = ROLES[role];

  // The application loads in an effect, so `app` is still null on the very
  // first render after a role is picked. Everything below dereferences it
  // (eoiReady, allDone, setStep), so the guard MUST sit here — the one inside
  // the JSX below never got the chance to run, which is what turned the page
  // blank the moment anyone tapped a role.
  if (!app) {
    return (
      <Shell onBack={() => setRole(null)} backLabel={T.back} title={R.label}>
        {appFailed ? (
          <Banner tone="warn">{T.appFailed}</Banner>
        ) : (
          <div style={{ color: C.sub, padding: "20px 0" }}>{T.loadingApp}</div>
        )}
      </Shell>
    );
  }

  const eoiItems = (cfg.eoi && cfg.eoi[role]) || [];
  /* 🐛 THE STEP LIST BRI ACTUALLY CONFIGURED, USED EVERYWHERE (Aug 10 2026).
     `allDone` and the unlock test below both read `R.steps` — the code's
     SEEDED list — while the cards rendered from `stepsFor`. Those are the same
     list only until she uses the add/delete/reorder she got on Aug 8, and then:
       · delete a step and the Submit button waits forever on a step that is no
         longer shown, so the applicant can never submit and nothing on screen
         says why;
       · reorder and `slice(0, i)` walks the OLD order, so the wrong step has
         to be finished before the next one opens.
     One list now, resolved once, read by the count, the unlock test, the
     submit test and the translation. Her saved config has no stepPlan yet
     (checked, Aug 10), so this was latent rather than live. */
  const planSteps = stepsFor(cfg, role);
  const locked = app && app.status === "submitted";
  const setStep = (id, sd) => setApp({ ...app, steps: { ...(app.steps || {}), [id]: sd } });

  const eoiReady = eoiItems.length === 0
    ? true
    : eoiItems.every((it) => it.kind === "read" ? !!(app.eoi || {})[it.id] : !!((app.eoi || {})[it.id] || "").trim());

  const submitEoi = async () => {
    setBusy(true);
    setApp({ ...app, status: "in_progress", eoiSubmittedAt: new Date().toISOString() });
    await notifySlack(notifyTo(cfg), R.eoiNotify(viewer.name), `${viewer.name} submitted the ${R.label} Expression of Interest`);
    setBusy(false);
  };

  /* ★ ONE CALL FOR "IS THIS STEP DONE", used by the submit test, the unlock
     test and each card, so an interview can never count as finished in one of
     them and not the others. */
  const isDone = (s) => stepDone(s, (app.steps || {})[s.id], iv, app.slug, viewer && viewer.id);
  const allDone = planSteps.every(isDone);

  /* Book or release a time. Returns an error message to show, or "" when it
     worked — the picker renders whatever comes back rather than guessing.
     ⚠️ THE WHOLE LIST IS RE-READ AFTER EITHER ONE, not patched locally. The
     server is the only thing that knows what is still free, and a local patch
     would show a slot as yours that somebody else had already taken. */
  const refreshSlots = async () => {
    try { setIv(await loadIv(role, cfg)); } catch { /* keep what we had */ }
  };
  /* ⚠️ THE ROUTE FOLLOWS THE ARM. A calendar booking must go through
     /api/calendar so it lands on the owner's real diary and she is told; the
     old standalone list only /api/interview knows about. Sending either one to
     the other's route would 404 the slot and read to the applicant as "that
     time is gone". */
  const slotAction = async (action, slotId) => {
    try {
      const r = iv.cal
        ? await fetch("/api/calendar", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
            body: JSON.stringify({ action, slotId, ownerId: iv.ownerId }),
          })
        : await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
        body: JSON.stringify({ action, slotId, role }),
      });
      const d = await r.json().catch(() => null);
      await refreshSlots();
      if (!r.ok || !d || d.ok !== true) return (d && d.error) || "That did not go through. Try again.";
      return "";
    } catch {
      await refreshSlots();
      return "That did not go through. Check the wifi and try again.";
    }
  };
  const bookSlot = (slotId) => slotAction("book", slotId);
  const cancelSlot = (slotId) => slotAction("cancel", slotId);
  const submitApp = async () => {
    if (!window.confirm(T.confirmSubmit)) return;
    setBusy(true);
    setApp({ ...app, status: "submitted", submittedAt: new Date().toISOString() });
    await notifySlack(notifyTo(cfg), R.submitNotify(viewer.name), `${viewer.name} submitted their ${R.label} application`);
    setBusy(false);
  };

  /* Bri, Jul 23: "the leaders are not seeing the request." This only ever
     posted to a CHANNEL — the leader themselves was never told, so requests sat
     unanswered by people who had no idea they existed. Now it DMs them.
     Their Slack ID comes from the same `hr:slack-avatars:v1` map the worker
     uses; /api/slack-notify DMs a person when the channel is their Uxxxx id.
     The channel post stays as the audit trail. A missing ID is reported, not
     guessed at — a DM to the wrong person is worse than no DM. */
  const requestRec = async (leader) => {
    const due = (cfg.due || {})[role];
    const line = `${viewer.name} has asked you for a ${R.label} recommendation.`
      + (due ? ` It's needed by ${due}.` : "")
      + `\n\nOpen Professional Growth in ${STORE.appName} to write it.`;
    let dmd = false;
    let why = "no Slack ID on file";
    try {
      const map = await kvGet("hr:slack-avatars:v1");
      const uid = slackIdForLeader(leader.name, map && map.idByName);
      /* 🐛 `dmd = true` USED TO SIT AFTER THIS AWAIT, UNCONDITIONALLY (Aug 4
         2026). notifySlack returns false on refusal and never throws, so a
         refused DM set dmd anyway and the audit post below then claimed the
         message went out. Which is the SAME defect this whole notify block was
         written to fix in July — the boolean was thrown away again, one
         function further along.
         ⚠️ It is refused today for every real recommender: the destination
         allowlist on /api/slack-notify permits only Bri's and Matt's DMs, and
         every leader in the picker is an AD or Team Leader. So the applicant
         saw "sent", the leader was never told, and the channel said it went.
         The delivery still needs the allowlist widening, which is Matt's call.
         This half stops the lying, so the failure is at least visible. */
      if (uid) { dmd = await notifySlack(uid, line, `recommendation request DM to ${leader.name}`); if (!dmd) why = "the Hub refused to send it"; }
    } catch (e) { why = "the DM errored"; }
    await notifySlack(notifyTo(cfg),
      `${viewer.name} has requested a ${R.label} recommendation from ${leader.name}.`
      + (dmd ? "" : ` ⚠️ Couldn't DM them — ${why}, so please tell them directly.`),
      `${viewer.name} requested a recommendation from ${leader.name}`);
  };

  /* The other half of requestRec, and it matters as much. A leader who was
     asked and then dropped would otherwise be left with a DM telling them to
     write something that has quietly disappeared out of their inbox.
     ⚠️ TOLD AFTER THE FACT, NEVER BEFORE IT. The application is already saved
     by the time this runs, so a refused DM or a dead network cannot leave the
     request half-withdrawn. Same order as requestRec, for the same reason.
     ⚠️ THE CHANNEL POST IS THE AUDIT TRAIL and goes out either way, so Bri can
     see somebody being asked and un-asked even when no DM could be delivered.
     It is also the only control on this: withdraw is deliberately not capped or
     rate-limited, and every use of it lands in front of her. */
  const withdrawRec = async (rec) => {
    const name = (rec && rec.leaderName) || "a leader";
    const line = `${viewer.name} has withdrawn the ${R.label} recommendation they asked you for. Nothing is needed from you.`;
    let dmd = false;
    let why = "no Slack ID on file";
    try {
      const map = await kvGet("hr:slack-avatars:v1");
      const uid = slackIdForLeader(name, map && map.idByName);
      if (uid) { dmd = await notifySlack(uid, line, `recommendation withdrawal DM to ${name}`); if (!dmd) why = "the Hub refused to send it"; }
    } catch (e) { why = "the DM errored"; }
    await notifySlack(notifyTo(cfg),
      `${viewer.name} withdrew their ${R.label} recommendation request to ${name}.`
      + (dmd ? "" : ` ⚠️ Couldn't DM them — ${why}, so they may still think it is owed.`),
      `${viewer.name} withdrew a recommendation request to ${name}`);
  };

  return (
    <Shell onBack={() => setRole(null)} backLabel={T.back} title={R.label} saved={saved} savedLabel={T.saved}
      right={<LangToggle lang={lang} onPick={setLang} />}>
      {!app ? <div style={{ color: C.sub }}>{T.loadingApp}</div> : (
        <>
          {/* Only ever shown while ES is picked. English never waits on a
              network call, so it can never be the language that is missing. */}
          {lang === "es" && trState === "loading" && (
            <div style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>{T.trLoading}</div>
          )}
          {lang === "es" && trState === "failed" && (
            <Banner tone="warn">{T.trFailed}</Banner>
          )}
          {saveErr && <Banner tone="warn">{T.saveErr}</Banner>}
          {app.status === "submitted" && <Banner tone="good">{(shown || {}).submitPrompt}</Banner>}

          {/* ★ THE WINDOW CLOSED WHILE THEY WERE PARTWAY THROUGH (Bri, Jul 27).
              Closing a role blocks NEW applicants only — anyone already in the
              process keeps going. But nothing told them that, so someone who
              opened their half-finished application after the close date had no
              way to know whether they were still in it. Silence there reads as
              "don't bother", which is the opposite of the rule.
              ⚠️ NOT SHOWN once submitted — they're done, and a red-tinted
              notice under a green "we've got it" is just alarming. */}
          {app.status !== "submitted" && !roleWindow(cfg, role).open && (
            <Banner tone="warn">{T.closed(R.label)}</Banner>
          )}

          {app.status === "new" ? (
            <>
              <Banner tone="info">{T.eoiStart}</Banner>
              {eoiItems.length === 0 ? (
                <Banner tone="warn">{T.eoiMissing(R.label)}</Banner>
              ) : (
                <div style={{ display: "grid", gap: 14 }}>
                  {/* ⚠️ `it` STAYS THE REAL ITEM. Only the two text fields come
                      from `shown`; the id the answer saves under and the
                      document pointers are read off the config item, so a
                      translation can never move an answer or break a link. */}
                  {eoiItems.map((it, ei) => {
                    const tx = ((shown || {}).eoi || [])[ei] || {};
                    return (
                    <div key={it.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D, padding: 16 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{tx.label || it.label}</div>
                      {it.kind === "read" ? (
                        <>
                          {(tx.body || it.body) && <p style={{ color: C.sub, fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{tx.body || it.body}</p>}
                          {(it.docPath || it.docSlug || it.docUrl) && (
                            <div style={{ margin: "8px 0" }}>
                              {it.docPath ? (
                                // Signed at click time, never stored — a URL saved
                                // months ago would have expired by the time someone
                                // opened this form.
                                <Btn kind="ghost" small onClick={async () => {
                                  const u = await signedDocUrl(DOC_BUCKET, it.docPath, 600);
                                  if (u) window.open(u, "_blank", "noopener,noreferrer");
                                  else window.alert(T.docFailed);
                                }}>{T.openDoc}</Btn>
                              ) : it.docUrl ? (
                                <Btn as="a" href={it.docUrl} target="_blank" rel="noopener noreferrer" kind="ghost" small>{T.openDoc}</Btn>
                              ) : (
                                <Btn as="a" href={`/docs/${it.docSlug}`} kind="ghost" small>{T.openDoc}</Btn>
                              )}
                            </div>
                          )}
                          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                            <input type="checkbox" checked={!!(app.eoi || {})[it.id]}
                              onChange={(e) => setApp({ ...app, eoi: { ...(app.eoi || {}), [it.id]: e.target.checked } })} />
                            {T.agree}
                          </label>
                        </>
                      ) : (
                        <textarea value={(app.eoi || {})[it.id] || ""} placeholder={T.yourAnswer}
                          onChange={(e) => setApp({ ...app, eoi: { ...(app.eoi || {}), [it.id]: e.target.value } })} style={ta} />
                      )}
                    </div>
                    );
                  })}
                  <div><Btn kind="solid" disabled={!eoiReady || busy} onClick={submitEoi}>
                    {busy ? T.submitting : T.submitEoi}</Btn></div>
                </div>
              )}
            </>
          ) : (
            <>
              <Banner tone="info">{(shown || {}).eoiPrompt}</Banner>
              {planSteps.map((s, i) => {
                const prevDone = planSteps.slice(0, i).every(isDone);
                return (
                  <StepCard key={s.id} step={s} index={i} unlocked={prevDone} locked={locked} onOpenL101={openL101}
                    done={isDone(s)} data={(app.steps || {})[s.id]}
                    app={app} cfg={cfg} dirLeaders={leaders}
                    text={((shown || {}).steps || [])[i]} chapters={(shown || {}).chapters} t={T}
                    iv={iv} slug={app.slug} uid={viewer && viewer.id} onBookSlot={bookSlot} onCancelSlot={cancelSlot}
                    onChange={(sd) => setStep(s.id, sd)} onRequestRecs={requestRec} onWithdrawRec={withdrawRec} />
                );
              })}
              {!locked && (
                <div style={{ marginTop: 8 }}>
                  <Btn kind="solid" disabled={!allDone || busy} onClick={submitApp}>
                    {busy ? T.submitting : allDone ? T.submitApp : T.submitBlocked}
                  </Btn>
                </div>
              )}
            </>
          )}
        </>
      )}
    </Shell>
  );
}

/* ── Bri publishes the times ─────────────────────────────────────────────────
   ⚠️ ADDING AND REMOVING AN EMPTY SLOT IS A PLAIN KV WRITE; RELEASING A BOOKED
   ONE IS NOT. Cancelling somebody's interview has to tell them, and it has to
   go through the same server check that decides who may cancel what — so it
   uses /api/interview like the applicant does, rather than editing the list
   here and leaving the person to turn up to nothing.
   ⚠️ A SLOT SOMEBODY HOLDS CANNOT BE DELETED OUTRIGHT, only released. Deleting
   it would erase the fact that an interview existed while the applicant's
   screen still said it did. */
function InterviewAdmin() {
  const [slots, setSlots] = useState(null);      // null = still loading
  const [failed, setFailed] = useState(false);
  const [at, setAt] = useState("");
  const [hrs, setHrs] = useState("0");
  const [mins, setMins] = useState("30");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const load = async () => {
    const r = await kvGetResult(SLOTS_KEY);
    /* A failed read must not look like an empty diary — adding to that would
       save one slot over every slot she already published. */
    if (!r.ok) { setFailed(true); setSlots([]); return; }
    setFailed(false);
    setSlots(Array.isArray(r.value) ? r.value : []);
  };
  useEffect(() => { load(); }, []);

  const save = async (next) => {
    setErr("");
    const prev = slots;
    setSlots(next);
    const ok = await kvSet(SLOTS_KEY, next);
    if (ok === false) { setSlots(prev); setErr("That did not save. Check the wifi and try again."); }
  };

  const add = () => {
    const when = at.trim();
    if (!when) return;
    /* ⚠️ THE SAME CLAMP AS EVERY OTHER DURATION IN THE CALENDAR. This one
       stopped at 240 while the event writer stopped at 480; one shared helper
       means a form and a writer cannot disagree about what is allowed. */
    const m = joinDuration(hrs, mins);
    save([...(slots || []), { id: `s${Date.now()}`, at: when, mins: m, booked: null }]);
    setAt("");
  };

  const release = async (id) => {
    setErr(""); setBusy(id);
    try {
      const r = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
        body: JSON.stringify({ action: "cancel", slotId: id }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || d.ok !== true) setErr((d && d.error) || "That did not go through.");
    } catch { setErr("That did not go through. Check the wifi."); }
    setBusy("");
    await load();
  };

  if (slots === null) return <div style={{ color: C.sub, fontSize: 13.5 }}>Loading…</div>;
  const sorted = slots.slice().sort(bySoonest);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {failed && <Banner tone="warn">
        The interview times could not be loaded, so this list may be showing nothing when there
        is something. Adding a time now could overwrite what is already there. Refresh before editing.
      </Banner>}
      <div style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.5 }}>
        Add the times you are free. Applicants see only the open ones and can take one each.
        Until you add a time here, the interview step falls back to your booking link, and to
        a "message the Leadership Development Director" note if no link is set.
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)}
          style={{ ...inp, width: "auto", flex: "none" }} aria-label="Interview date and time" />
        <input type="number" min="0" max="8" step="1" value={hrs} onChange={(e) => setHrs(e.target.value)}
          style={{ ...inp, width: 64 }} aria-label="Hours" />
        <span style={{ fontSize: 13, color: C.sub }}>hr</span>
        <input type="number" min="0" max="59" step="5" value={mins} onChange={(e) => setMins(e.target.value)}
          style={{ ...inp, width: 90, flex: "none" }} aria-label="Length in minutes" />
        <span style={{ fontSize: 13, color: C.sub }}>minutes</span>
        <Btn kind="solid" small disabled={!at.trim() || failed} onClick={add}>+ Add time</Btn>
      </div>

      {err && <div style={{ color: C.redDeep, background: "#FBEAED", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>{err}</div>}

      {sorted.length === 0 ? (
        <div style={{ fontSize: 13.5, color: C.sub }}>No times added yet.</div>
      ) : sorted.map((s) => (
        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          background: s.booked ? "#F4F6FA" : C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 14px" }}>
          <span style={{ flex: 1, minWidth: 170, fontSize: 14, fontWeight: 600 }}>
            {fmtWhen(s.at)} <span style={{ color: C.sub, fontWeight: 400 }}>· {durationText(s.mins || 30)}</span>
          </span>
          {s.booked ? (
            <>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "#166534", background: "#E7F6EC", borderRadius: 20, padding: "3px 10px" }}>
                {s.booked.name}
              </span>
              <button type="button" disabled={busy === s.id} onClick={() => release(s.id)} style={btnGhost}>
                {busy === s.id ? "Working…" : "Release"}
              </button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 12.5, color: C.sub }}>open</span>
              <button type="button" onClick={() => save(slots.filter((x) => x.id !== s.id))} style={btnGhost}>Remove</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ── admin: editable content + applicant review ──────────────────────────────
function AdminPanel({ cfg, setCfg }) {
  const [tab, setTab] = useState(null);
  const [idx, setIdx] = useState([]);
  /* Notifications that did not send. Bri is the only person who would notice
     one going missing, and she notices by NOT being told — which is no signal
     at all. This puts the miss where she is already looking. */
  const [notifyFails, setNotifyFails] = useState([]);
  useEffect(() => { (async () => setIdx((await kvGet(INDEX_KEY)) || []))(); }, []);
  useEffect(() => { (async () => {
    const l = await kvGet(NOTIFY_LOG_KEY);
    setNotifyFails(Array.isArray(l) ? l : []);
  })(); }, []);
  const clearNotifyFails = async () => {
    // Write first, clear the banner second — kvSet returns false rather than
    // throw, and the old order emptied the on-screen list even when the log
    // stayed on disk, so the "handled" dismissal silently un-dismissed on the
    // next reload.
    const ok = await kvSet(NOTIFY_LOG_KEY, []);
    if (ok === false) {
      window.alert("Couldn't clear the list — check the wifi and try again.");
      return;
    }
    setNotifyFails([]);
  };
  const setEoi = (role, items) => setCfg({ ...cfg, eoi: { ...(cfg.eoi || {}), [role]: items } });
  const setCopy = (role, field, val) => setCfg({ ...cfg, copy: { ...(cfg.copy || {}), [role]: { ...((cfg.copy || {})[role] || {}), [field]: val } } });
  /* Bri, Jul 27: "I thought I had the ability to edit application steps… I need
     to edit text for the Pathway step." Same shape as setCopy, one level deeper:
     cfg.steps[role][stepId][field]. ⚠️ `field` is only ever "title" or "body" —
     see stepCopy for why type and id are deliberately not editable. */
  const setStepCopy = (role, stepId, field, val) => setCfg({
    ...cfg,
    steps: {
      ...(cfg.steps || {}),
      [role]: {
        ...((cfg.steps || {})[role] || {}),
        [stepId]: { ...(((cfg.steps || {})[role] || {})[stepId] || {}), [field]: val },
      },
    },
  });
  /* ── ADD, DELETE AND REORDER STEPS (Bri, Aug 8 2026). See stepsFor. ──────
     ⚠️ WRITES THE WHOLE PLAN EVERY TIME, starting from what is on screen. The
     plan is the order AND the membership, so a partial write is a reordering
     that loses a step. */
  const setPlan = (role, ids) => setCfg({
    ...cfg,
    stepPlan: { ...(cfg.stepPlan || {}), [role]: ids },
  });
  const planOf = (role) => stepsFor(cfg, role).map((s) => s.id);
  const moveStep = (role, i, d) => {
    const ids = planOf(role); const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setPlan(role, ids);
  };
  /* ⚠️ THE CONFIRM SAYS WHAT IS AND IS NOT LOST, because "delete" on an
     application step reads like it takes people's answers with it. It does not:
     the step stops being asked and anything already answered stays in the
     record, so re-adding brings it back. */
  const removeStep = (role, st) => {
    if (!window.confirm(
      `Remove "${stepCopy(cfg, role, st.id, "title", st.title)}" from the ${(ROLES[role] || {}).label || role} application?\n\n` +
      "Nobody's answers are deleted. The step just stops being asked, and adding it back brings it to the end."
    )) return;
    setPlan(role, planOf(role).filter((id) => id !== st.id));
  };
  /* ⚠️ A TIMESTAMPED ID, NEVER A COUNTER. Ids are the keys stored applications
     write answers under, so a reused "t5" would attach an old applicant's
     answer to a brand new question. */
  const addStep = (role, type) => {
    const meta = NEW_STEP_TYPES.find((t) => t.type === type);
    if (!meta) return;
    const id = `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    setCfg({
      ...cfg,
      stepNew: {
        ...(cfg.stepNew || {}),
        [role]: { ...((cfg.stepNew || {})[role] || {}),
                  [id]: { id, type, title: `New ${meta.label.toLowerCase()}`, body: "" } },
      },
      stepPlan: { ...(cfg.stepPlan || {}), [role]: [...planOf(role), id] },
    });
  };

  const moveEoi = (role, items, i, d) => {
    const j = i + d; if (j < 0 || j >= items.length) return;
    const next = items.slice(); [next[i], next[j]] = [next[j], next[i]];
    setEoi(role, next);
  };
  const [resOpts, setResOpts] = useState([]);
  const [busyUp, setBusyUp] = useState(null);
  useEffect(() => { (async () => setResOpts(await loadResourceOptions()))(); }, []);
  // Upload straight into the docs bucket and store the resulting path as the
  // slug, so the applicant's "Open the document" button works immediately.
  const uploadFor = async (role, items, it, file) => {
    if (!file) return;
    setBusyUp(it.id);
    try {
      const path = `pg-eoi/${role}/${Date.now()}-${file.name}`;
      await uploadDoc(DOC_BUCKET, path, file);
      setEoi(role, items.map((x) => x.id === it.id ? { ...x, docPath: path, docFile: file.name, docSlug: "" } : x));
    } catch { window.alert("That upload didn't go through — try again, or pick from Resources."); }
    finally { setBusyUp(null); }
  };

  return (
    <div style={{ marginTop: 30, borderTop: `1px solid ${C.line}`, paddingTop: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".07em", textTransform: "uppercase", color: C.sub, marginBottom: 10 }}>
        Leadership Development tools
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {[["settings", "Settings"], ["eoi", "Expression of Interest forms"], ["interviews", "Interview times"], ["apps", `Applications (${idx.length})`]].map(([k, l]) => (
          <Btn key={k} small kind={tab === k ? "solid" : "ghost"} onClick={() => setTab(tab === k ? null : k)}>{l}</Btn>
        ))}
      </div>

      {/* ⚠️ SHOWN ON EVERY TAB, not just Applications. A missed notification is
          not a fact about one screen, and burying it behind a tab is the same
          shape as the bug: information that exists but never reaches the person
          who needs it. */}
      {notifyFails.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Banner tone="warn">
            <strong>{notifyFails.length} notification{notifyFails.length === 1 ? "" : "s"} did not send.</strong>
            {" "}These happened and nobody was told. Check the applications below for anything you have not seen.
            <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {notifyFails.slice(0, 8).map((f, i) => (
                <li key={i} style={{ fontSize: 12.5, marginBottom: 2 }}>
                  {f.about || "unknown"} — {String(f.at || "").slice(0, 16).replace("T", " ")} ({f.error || "no reason recorded"})
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 10 }}>
              <Btn small kind="ghost" onClick={clearNotifyFails}>I have handled these — clear the list</Btn>
            </div>
          </Banner>
        </div>
      )}

      {tab === "interviews" && <InterviewAdmin />}

      {tab === "settings" && (
        <div style={{ display: "grid", gap: 12, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D, padding: 16 }}>
          {[["calendly", "Calendly link (all roles)"], ["l101Pin", "Current Leadership 101 class PIN"],
            ["l101Link", "Link to the L101 class entrance page"], ["notifyChannel", "Slack channel or user ID for notifications"]].map(([k, l]) => (
            <label key={k} style={{ fontSize: 13, fontWeight: 600, color: C.sub }}>{l}
              <input value={cfg[k] || ""} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} style={{ ...inp, marginTop: 5 }} />
            </label>
          ))}
          {/* ★ BRI'S "link certain calendar types to applications". One picker
              per application, so she can move one across at a time.
              ⚠️ "Calendly" IS A REAL CHOICE HERE, not just the default — it is
              how she comes back off the internal calendar if she needs to. */}
          <CalTypePicker cfg={cfg} setCfg={setCfg} />

          <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginTop: 6 }}>Recommendation questions (Team Leader)</div>
          {(cfg.recQuestions || []).map((q, i) => (
            <div key={q.id} style={{ display: "flex", gap: 8 }}>
              <input value={q.label} onChange={(e) => setCfg({ ...cfg, recQuestions: cfg.recQuestions.map((x) => x.id === q.id ? { ...x, label: e.target.value } : x) })} style={inp} />
              <button onClick={() => setCfg({ ...cfg, recQuestions: cfg.recQuestions.filter((x) => x.id !== q.id) })}
                style={{ border: "none", background: "#FBEAED", color: C.redDeep, borderRadius: 8, width: 34, cursor: "pointer" }}>×</button>
            </div>
          ))}
          <div><Btn small onClick={() => setCfg({ ...cfg, recQuestions: [...(cfg.recQuestions || []), { id: `q${Date.now()}`, label: "" }] })}>+ Add question</Btn></div>
        </div>
      )}

      {tab === "eoi" && (
        <div style={{ display: "grid", gap: 16 }}>
          {Object.entries(ROLES).map(([key, r]) => {
            const items = (cfg.eoi && cfg.eoi[key]) || [];
            return (
              <div key={key} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D, padding: 16 }}>
                <div style={{ fontWeight: 800, marginBottom: 10 }}>{r.icon} {r.label}</div>
                {items.map((it, ii) => (
                  <div key={it.id} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                      {[["question", "Question"], ["read", "Read & agree"]].map(([k, l]) => (
                        <button key={k} onClick={() => setEoi(key, items.map((x) => x.id === it.id ? { ...x, kind: k } : x))}
                          style={{ border: `1px solid ${it.kind === k ? C.red : C.line}`, background: it.kind === k ? "#FBEAED" : "#fff",
                            color: it.kind === k ? C.redDeep : C.sub, borderRadius: 20, padding: "3px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{l}</button>
                      ))}
                      <div style={{ flex: 1 }} />
                      <button onClick={() => moveEoi(key, items, ii, -1)} disabled={ii === 0} title="Move up"
                        style={{ border: `1px solid ${C.line}`, background: "#fff", borderRadius: 8, width: 30, height: 28, cursor: ii === 0 ? "default" : "pointer", opacity: ii === 0 ? .35 : 1 }}>▲</button>
                      <button onClick={() => moveEoi(key, items, ii, 1)} disabled={ii === items.length - 1} title="Move down"
                        style={{ border: `1px solid ${C.line}`, background: "#fff", borderRadius: 8, width: 30, height: 28, cursor: ii === items.length - 1 ? "default" : "pointer", opacity: ii === items.length - 1 ? .35 : 1 }}>▼</button>
                      <button onClick={() => setEoi(key, items.filter((x) => x.id !== it.id))}
                        style={{ border: "none", background: "#FBEAED", color: C.redDeep, borderRadius: 8, width: 30, height: 28, cursor: "pointer" }}>×</button>
                    </div>
                    <input value={it.label} placeholder={it.kind === "read" ? "Heading" : "Question"}
                      onChange={(e) => setEoi(key, items.map((x) => x.id === it.id ? { ...x, label: e.target.value } : x))} style={inp} />
                    {it.kind === "read" && (
                      <>
                        <textarea value={it.body || ""} placeholder="Text for them to read"
                          onChange={(e) => setEoi(key, items.map((x) => x.id === it.id ? { ...x, body: e.target.value } : x))}
                          style={{ ...ta, minHeight: 80, marginTop: 8 }} />
                        {/* Bri's ask: stop making her type a slug. Pick from the
                            Resources page, upload a file, or type one by hand. */}
                        <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: C.sub }}>Attach a document</div>
                        <select value={resOpts.some((o) => o.value === (it.docUrl || it.docSlug)) ? (it.docUrl || it.docSlug) : ""}
                          onChange={(e) => {
                            const o = resOpts.find((x) => x.value === e.target.value);
                            setEoi(key, items.map((x) => x.id === it.id ? {
                              ...x,
                              docSlug: o && o.kind === "pdf" ? o.value : "",
                              docUrl: o && o.kind === "link" ? o.value : "",
                              docPath: "", docFile: "",
                            } : x));
                          }}
                          style={{ ...inp, marginTop: 6 }}>
                          <option value="">— Choose from Resources —</option>
                          {resOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                          <label style={{ fontSize: 12.5, fontWeight: 700, color: C.red, cursor: busyUp === it.id ? "default" : "pointer" }}>
                            {busyUp === it.id ? "Uploading…" : "⬆ Upload from this device"}
                            <input type="file" style={{ display: "none" }} disabled={busyUp === it.id}
                              onChange={(e) => uploadFor(key, items, it, e.target.files && e.target.files[0])} />
                          </label>
                          {it.docFile && <span style={{ fontSize: 12.5, color: C.sub }}>📄 {it.docFile}</span>}
                        </div>
                        <input value={it.docSlug || ""} placeholder="…or type a /docs name by hand"
                          onChange={(e) => setEoi(key, items.map((x) => x.id === it.id ? { ...x, docSlug: e.target.value } : x))}
                          style={{ ...inp, marginTop: 6 }} />
                      </>
                    )}
                  </div>
                ))}
                <Btn small kind="solid" onClick={() => setEoi(key, [...items, { id: `e${Date.now()}`, kind: "question", label: "" }])}>+ Add item</Btn>

                <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>
                      {(cfg.closed || {})[key] ? "Closed to applicants" : "Open for applications"}
                    </div>
                    <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
                      Closing hides it from everyone except you, HR and the Executive Directors. Anything already submitted stays on file.
                    </div>
                  </div>
                  <Btn small kind={(cfg.closed || {})[key] ? "solid" : "ghost"}
                    onClick={() => setCfg({ ...cfg, closed: { ...(cfg.closed || {}), [key]: !(cfg.closed || {})[key] } })}>
                    {(cfg.closed || {})[key] ? "Open it" : "Close it"}
                  </Btn>
                </div>

                <div style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 12, display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: C.sub, letterSpacing: ".04em", textTransform: "uppercase" }}>Dates</div>
                  <label style={{ fontSize: 12.5, color: C.sub, fontWeight: 600 }}>Due date — drives the reminders</label>
                  <input type="date" value={(cfg.due || {})[key] || ""}
                    onChange={(e) => setCfg({ ...cfg, due: { ...(cfg.due || {}), [key]: e.target.value } })} style={inp} />
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <label style={{ fontSize: 12.5, color: C.sub, fontWeight: 600 }}>Opens (optional)</label>
                      <input type="datetime-local" value={((cfg.window || {})[key] || {}).openAt || ""}
                        onChange={(e) => setCfg({ ...cfg, window: { ...(cfg.window || {}), [key]: { ...((cfg.window || {})[key] || {}), openAt: e.target.value } } })}
                        style={inp} />
                    </div>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <label style={{ fontSize: 12.5, color: C.sub, fontWeight: 600 }}>Closes (optional)</label>
                      <input type="datetime-local" value={((cfg.window || {})[key] || {}).closeAt || ""}
                        onChange={(e) => setCfg({ ...cfg, window: { ...(cfg.window || {}), [key]: { ...((cfg.window || {})[key] || {}), closeAt: e.target.value } } })}
                        style={inp} />
                    </div>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.sub, lineHeight: 1.45 }}>
                    Leave both blank to stay open until you close it by hand. Set only a closing time and it runs from now until then.
                    Closing it above always wins, whatever the dates say.
                  </div>
                </div>

                <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 12, display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: C.sub, letterSpacing: ".04em", textTransform: "uppercase" }}>Messages</div>
                  <label style={{ fontSize: 12.5, color: C.sub, fontWeight: 600 }}>Shown after the Expression of Interest, above the steps</label>
                  <textarea value={((cfg.copy || {})[key] || {}).eoiPrompt || ""} placeholder={(ROLES[key] || {}).eoiPrompt || ""}
                    onChange={(e) => setCopy(key, "eoiPrompt", e.target.value)} style={{ ...ta, minHeight: 80 }} />
                  <label style={{ fontSize: 12.5, color: C.sub, fontWeight: 600 }}>Shown after the whole application is submitted</label>
                  <textarea value={((cfg.copy || {})[key] || {}).submitPrompt || ""} placeholder={(ROLES[key] || {}).submitPrompt || ""}
                    onChange={(e) => setCopy(key, "submitPrompt", e.target.value)} style={{ ...ta, minHeight: 70 }} />
                  {/* ★ ADD A STEP. Only the three types that need no wiring —
                      see NEW_STEP_TYPES for why the other four can be moved and
                      removed but not created. */}
                  <div style={{ border: `1px dashed ${C.line}`, borderRadius: 10, padding: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 6 }}>Add a step</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {NEW_STEP_TYPES.map((t) => (
                        <button key={t.type} type="button" onClick={() => addStep(key, t.type)}
                          title={t.hint} style={{ ...btnGhost, fontWeight: 700 }}>+ {t.label}</button>
                      ))}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.sub, marginTop: 7, lineHeight: 1.45 }}>
                      It lands at the bottom. Give it a heading and instructions, then move it
                      with the arrows. Interviews, Leadership 101 and recommendation steps can be
                      moved or removed but not created here, because each one is wired to
                      something outside the form.
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: C.sub }}>Leave blank to keep the wording shown in grey.</div>
                </div>

                {/* ★ THE STEPS THEMSELVES. Each one's heading and instructions,
                    in the order the applicant sees them. What a step DOES is
                    fixed — the type is shown as a read-only tag so she can tell
                    them apart without being able to change behaviour. */}
                <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 12, display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: C.sub, letterSpacing: ".04em", textTransform: "uppercase" }}>Steps</div>
                  {stepsFor(cfg, key).map((st, si) => (
                    <div key={st.id} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: C.sub }}>STEP {si + 1}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: C.sub, border: `1px solid ${C.line}`, borderRadius: 5, padding: "1px 6px", textTransform: "uppercase" }}>{st.type}</span>
                        {/* ★ REORDER AND REMOVE (Bri, Aug 8 2026). The arrows sit
                            on the step itself so "move this one" means the thing
                            you are looking at. */}
                        <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                          <button type="button" onClick={() => moveStep(key, si, -1)} aria-label="Move step up"
                            style={{ ...btnGhost, opacity: si === 0 ? 0.35 : 1 }}>↑</button>
                          <button type="button" onClick={() => moveStep(key, si, 1)} aria-label="Move step down"
                            style={{ ...btnGhost, opacity: si === stepsFor(cfg, key).length - 1 ? 0.35 : 1 }}>↓</button>
                          <button type="button" onClick={() => removeStep(key, st)} aria-label="Remove step"
                            style={{ ...btnGhost, color: C.red, borderColor: "#F3D6C4" }}>✕</button>
                        </span>
                      </div>
                      <input value={(((cfg.steps || {})[key] || {})[st.id] || {}).title || ""} placeholder={st.title || ""}
                        onChange={(e) => { const v = e.target.value; setStepCopy(key, st.id, "title", v); }}
                        style={{ ...inp, fontWeight: 700 }} />
                      <textarea value={(((cfg.steps || {})[key] || {})[st.id] || {}).body || ""} placeholder={st.body || "No instructions on this step yet"}
                        onChange={(e) => { const v = e.target.value; setStepCopy(key, st.id, "body", v); }}
                        style={{ ...ta, minHeight: 80 }} />
                    </div>
                  ))}
                  <div style={{ fontSize: 12, color: C.sub }}>
                    Leave a box blank to keep the wording shown in grey. What each step does — and the order — is fixed; only the words change.
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "apps" && <AppReview idx={idx} setIdx={setIdx} cfg={cfg} />}
    </div>
  );
}

function AppReview({ idx, setIdx, cfg }) {
  const [open, setOpen] = useState(null);
  const [data, setData] = useState(null);
  const [links, setLinks] = useState({});
  const load = async (e) => {
    setOpen(`${e.role}:${e.slug}`);
    const a = await kvGet(appKey(e.role, e.slug));
    setData(a);
    const out = {};
    for (const [sid, sd] of Object.entries((a && a.steps) || {})) {
      for (const f of (sd.files || [])) out[f.path] = await signedDocUrl(f.bucket, f.path, 600);
    }
    setLinks(out);
  };
  // Removes the record AND the index entry. Nothing is auto-expired anywhere —
  // an application only ever leaves by someone pressing this.
  const remove = async (e) => {
    if (!window.confirm(`Delete ${e.name}'s ${(ROLES[e.role] || {}).label || e.role} application? This can't be undone.`)) return;
    /* ⚠️ INDEX FIRST, and bail if it cannot be read. The old order deleted the
       record, then read the index blind — a FAILED read arrived as [], and the
       write below wiped every application registration, the only enumeration
       HR Console has (the exact invisible-applications shape Bri reported
       Jul 29). saveIndexEntry was fixed then; this remove path was missed.
       kvSet also returns false, never throws, so the old catch was dead. */
    const idxR = await kvGetResult(INDEX_KEY);
    if (!idxR.ok) { window.alert("Couldn't delete that — the list could not be read, so nothing was touched. Try again."); return; }
    const cur = Array.isArray(idxR.value) ? idxR.value : [];
    if (!(await kvSet(appKey(e.role, e.slug), null))) { window.alert("Couldn't delete that — try again. Nothing was changed."); return; }
    const next = cur.filter((x) => `${x.role}:${x.slug}` !== `${e.role}:${e.slug}`);
    if (!(await kvSet(INDEX_KEY, next))) { window.alert("The application was removed but the list entry didn't update — run the delete once more to clear it."); return; }
    setIdx(next);
    setOpen(null); setData(null);
  };

  if (!idx.length) return <p style={{ color: C.sub, fontSize: 14 }}>No applications yet.</p>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {idx.map((e) => (
        <div key={`${e.role}:${e.slug}`} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{e.name}</div>
              <div style={{ fontSize: 12.5, color: C.sub }}>{(ROLES[e.role] || {}).label} · {e.status === "submitted" ? "Submitted" : "In progress"}</div>
            </div>
            <Btn small onClick={() => (open === `${e.role}:${e.slug}` ? setOpen(null) : load(e))}>
              {open === `${e.role}:${e.slug}` ? "Close" : "Review"}
            </Btn>
          </div>
          {open === `${e.role}:${e.slug}` && data && (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {/* Bri could only see completed steps — the Expression of Interest
                  she actually screens on was never shown. Rendered first, since
                  it's the first thing they filled in. */}
              {(() => {
                const items = ((cfg && cfg.eoi) || {})[e.role] || [];
                const ans = data.eoi || {};
                if (!items.length) return null;
                return (
                  <div style={{ borderLeft: `3px solid ${C.red}`, borderTop: `3px solid ${C.red}`, paddingLeft: 12, background: "#FDF7F8", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontWeight: 800, fontSize: 13.5, color: C.redDeep, marginBottom: 6 }}>Expression of Interest</div>
                    {items.map((it) => {
                      const v = ans[it.id];
                      return (
                        <div key={it.id} style={{ marginBottom: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{it.label}</div>
                          {it.kind === "read"
                            ? <div style={{ fontSize: 13, color: v ? C.green : C.sub }}>{v ? "✓ Read and agreed" : "Not agreed"}</div>
                            : <div style={{ fontSize: 13.5, color: v ? C.ink : C.sub, whiteSpace: "pre-wrap" }}>{v || "— no answer —"}</div>}
                        </div>
                      );
                    })}
                    {data.eoiSubmittedAt && <div style={{ fontSize: 12, color: C.sub }}>Submitted {new Date(data.eoiSubmittedAt).toLocaleDateString()}</div>}
                  </div>
                );
              })()}
              {stepsFor(cfg, e.role).map((s) => {
                const sd = (data.steps || {})[s.id] || {};
                return (
                  <div key={s.id} style={{ borderLeft: `3px solid ${C.line}`, borderTop: `3px solid ${C.line}`, paddingLeft: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{s.title}</div>
                    {sd.text && <div style={{ fontSize: 13.5, color: C.ink, whiteSpace: "pre-wrap", marginTop: 4 }}>{sd.text}</div>}
                    {sd.choices && <div style={{ fontSize: 13.5, color: C.ink, marginTop: 4 }}>{sd.choices.join(" · ")}</div>}
                    {(sd.files || []).map((f) => (
                      <div key={f.path} style={{ marginTop: 4 }}>
                        {links[f.path] ? <a href={links[f.path]} target="_blank" rel="noopener noreferrer" style={{ color: C.red, fontSize: 13.5 }}>📄 {f.fileName}</a>
                          : <span style={{ fontSize: 13.5, color: C.sub }}>📄 {f.fileName}</span>}
                      </div>
                    ))}
                    {(sd.recs || []).map((r, i) => {
                      // 🐛 Bri, Jul 26: "I can only see the answers, not the
                      // questions." Was Object.values(r.answers), which threw the
                      // keys away and left bare paragraphs with nothing saying
                      // what was asked. Resolution order: the record's own
                      // snapshot, then today's question list for recommendations
                      // written before snapshots existed, then ANY answer whose
                      // question can't be resolved at all — captioned honestly
                      // rather than dropped. A written recommendation must never
                      // vanish from the review because a question was renamed.
                      const asked = (Array.isArray(r.questions) && r.questions.length)
                        ? r.questions
                        : (cfg.recQuestions || []);
                      const shown = new Set(asked.map((q) => q.id));
                      const orphans = Object.keys(r.answers || {}).filter((k) => !shown.has(k));
                      return (
                        <div key={i} style={{ marginTop: 8, fontSize: 13 }}>
                          <strong>{r.leaderName}</strong> — {r.status === "completed" ? "completed" : "in progress"}
                          {r.answers && asked.map((q) => (r.answers[q.id] ? (
                            <div key={q.id} style={{ marginTop: 6 }}>
                              <div style={{ fontWeight: 700, color: C.ink, fontSize: 12.5 }}>{q.label}</div>
                              <div style={{ color: C.sub, whiteSpace: "pre-wrap", marginTop: 2 }}>{r.answers[q.id]}</div>
                            </div>
                          ) : null))}
                          {orphans.map((k) => (
                            <div key={k} style={{ marginTop: 6 }}>
                              <div style={{ fontWeight: 700, color: C.sub, fontSize: 12.5, fontStyle: "italic" }}>Answer to a question no longer in use</div>
                              <div style={{ color: C.sub, whiteSpace: "pre-wrap", marginTop: 2 }}>{r.answers[k]}</div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                    {/* Withdrawn requests, so a leader who was asked and dropped
                        is still on the record rather than only in the Slack
                        audit post. See the withdraw note in RecStep for why
                        these live outside `recs`. */}
                    {Array.isArray(sd.withdrawn) && sd.withdrawn.length > 0 && (
                      <div style={{ marginTop: 8, fontSize: 12.5, color: C.sub }}>
                        Cancelled: {sd.withdrawn.map((r) => (r && r.leaderName) || "—").join(", ")}
                      </div>
                    )}
                    {sd.done && !sd.text && !sd.files && <div style={{ fontSize: 13, color: C.green }}>✓ marked complete</div>}
                  </div>
                );
              })}
              {/* Manual delete only — Bri asked that applications stay on file
                  until she removes one herself (promoted or terminated). */}
              <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
                <button onClick={() => remove(e)}
                  style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.redDeep, borderRadius: 9,
                    padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                  Delete this application
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── chrome ──────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <div style={{ background: `linear-gradient(120deg, ${C.red} 0%, ${C.redDeep} 30%, ${C.navy} 55%)`,
      borderRadius: 22, padding: "28px 26px", color: "#fff", position: "relative", overflow: "hidden", marginBottom: 20 }}>
      <div style={{ position: "absolute", right: -40, top: -40, width: 170, height: 170, borderRadius: "50%", background: "rgba(255,255,255,.08)" }} />
      <div style={{ fontSize: 28 }}>🚀</div>
      <div style={{ fontWeight: 800, fontSize: 26, letterSpacing: "-.02em", marginTop: 8 }}>Professional Growth</div>
      <div style={{ fontSize: 14.5, color: "rgba(255,255,255,.85)", marginTop: 5, maxWidth: 430, lineHeight: 1.5 }}>
        Your path forward — apply for your next role, one step at a time.
      </div>
    </div>
  );
}

function Shell({ children, onBack, backLabel = "← Back", title, saved, savedLabel = "Saved ✓", right }) {
  return (
    <div style={{ fontFamily: FONT, background: C.paper, minHeight: "100vh", color: C.ink }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');`}</style>
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "rgba(246,244,239,.92)", backdropFilter: "blur(8px)",
        borderBottom: `1px solid ${C.line}`, padding: "12px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        {onBack && <button onClick={onBack} style={{ border: "none", background: "none", color: C.sub, fontFamily: FONT,
          fontSize: 14, cursor: "pointer", fontWeight: 600 }}>{backLabel}</button>}
        <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
        <div style={{ flex: 1 }} />
        {saved && <span style={{ color: C.green, fontSize: 12.5, fontWeight: 600 }}>{savedLabel}</span>}
        {right}
      </div>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 20px 60px" }}>{children}</div>
    </div>
  );
}
