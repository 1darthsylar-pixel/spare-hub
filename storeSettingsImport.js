/* ══════════════════════════════════════════════════════════════════════════
   storeSettingsImport.js — VALIDATE A STORE'S SAVED SETTINGS.

   ★ LEAF. Imports nothing. A settings object in, a verdict out. No storage, no
   React, no config. It is imported by the settings page AND by worker.js, so
   anything it pulls in gets pulled into both.

   ═══ WHY IT EXISTS ════════════════════════════════════════════════════════
   Matt, Aug 11 2026: "Standing up the Hub for another operator currently means
   me hand editing JavaScript files."

   Those settings now come from a screen instead, which means they arrive from a
   browser. A check that only runs in the browser is a check somebody can skip
   with curl, so the page and the route share this one.

   ═══ IT REFUSES RATHER THAN REPAIRS ═══════════════════════════════════════
   ⚠️ EVERY FAILURE RETURNS A REASON AND STORES NOTHING. A half-understood
   settings record is worse than a rejected one: these values drive the board,
   the money screens and who gets notified. A store that sees its save refused
   will fix it. A store running on a silently repaired hybrid will not know.

   ⚠️ IT ONLY CHECKS WHAT IT KNOWS. Anything the caller includes that is not
   named here is passed through untouched, because the merge in storeConfig.js
   already ignores keys the defaults do not have. Guessing which unknown fields
   matter is how an editor starts deleting data it did not understand.

   ═══ THE STATION RULE, AND WHY IT IS ON `id` ══════════════════════════════
   ⚠️⚠️ THE OBVIOUS RULE WAS "no duplicate station NAME on the same day" AND IT
   WOULD HAVE REFUSED GATE CITY'S OWN BOARD. Measured, not assumed: the live
   board carries 18 duplicate-name cases, every day, in both houses —
   "ASSISTANT DIRECTOR" twice on every FOH day, "Loader / Filter / Thaw" and
   "Assistant Director" twice on every BOH day. That is how the board says two
   people work the same role: a second row with the same name.
   ⇒ The rule is on `id`, which is what actually has to be unique, and Matt
   confirmed it (Aug 11 2026: "yes use the id"). A duplicate id would make two
   rows the same row to every engine that keys off it.
   ══════════════════════════════════════════════════════════════════════════ */

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/* A percentage-style goal, stored as a fraction (0.08 = 8%). Matt's rule: no
   goal above 100%. Zero is allowed — a store may legitimately target zero. */
const PCT_GOALS = ["food", "turnover", "salesGrowth", "evalsOnTime"];

/** Minutes from midnight, 0 to 1440. */
const okMinute = (v) => isNum(v) && v >= 0 && v <= 1440;

/* ═══ THE THREE HELPERS THE EDITOR AND ITS TESTS BOTH USE ═════════════════
   ⚠️ THEY LIVE HERE RATHER THAN IN StoreSettings.jsx BECAUSE THEY WERE ABOUT
   TO EXIST TWICE. The page had its own copies and the test copied them again
   to exercise them — and the copies immediately drifted: a fix to the page's
   version left the test running the old logic and reporting a failure that was
   already fixed. That is design rule 8 with a live example attached. One
   definition, imported by both. */

/** Read a dotted path out of a plain object. */
export const atPath = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

/** Write a dotted path into a COPY, creating objects on the way down. */
export function setPath(obj, path, value) {
  const keys = path.split(".");
  const out = { ...(obj || {}) };
  let cur = out;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = { ...(cur[keys[i]] || {}) };
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return out;
}

/**
 * Drop anything that now equals the code default, so the stored record is only
 * what this store actually changed. A store that types a value and then types
 * the original back stores nothing.
 *
 * ⚠️ `undefined` MEANS "NO OVERRIDE", NOT "OVERRIDE WITH NOTHING". Clearing a
 * number box sets the field undefined; keeping the key left an empty
 * `{financial:{}}` shell behind, so the page showed a pending change with
 * nothing in it and a save wrote a record meaning the same as none.
 */
export function pruneDefaults(over, base) {
  if (over == null || typeof over !== "object" || Array.isArray(over)) return over;
  const out = {};
  for (const k of Object.keys(over)) {
    const o = over[k], b = base == null ? undefined : base[k];
    if (o === undefined) continue;
    if (isPlain(o) && isPlain(b)) {
      const inner = pruneDefaults(o, b);
      if (inner && Object.keys(inner).length) out[k] = inner;
    } else if (JSON.stringify(o) !== JSON.stringify(b)) {
      out[k] = o;
    }
  }
  return out;
}

/**
 * checkStoreSettings(settings) -> { ok, errors: [string], warnings: [string] }
 *
 * `ok` false means STORE NOTHING. Errors are written for the person typing,
 * not for an engineer: they name the field and what is wrong with it.
 */
export function checkStoreSettings(settings) {
  const errors = [];
  const warnings = [];
  if (!isPlain(settings)) return { ok: false, errors: ["That is not a settings record."], warnings };

  /* ── identity ────────────────────────────────────────────────────────── */
  const id = settings.identity;
  if (id !== undefined) {
    if (!isPlain(id)) errors.push("Identity is not filled in correctly.");
    else {
      if ("name" in id && (typeof id.name !== "string" || !id.name.trim()))
        errors.push("The store name cannot be empty.");
      if ("fsr" in id && (typeof id.fsr !== "string" || !id.fsr.trim()))
        errors.push("The store number cannot be empty.");
      if ("timezone" in id && (typeof id.timezone !== "string" || !id.timezone.includes("/")))
        errors.push("The timezone should look like America/New_York.");
      /* ⚠️ A WARNING, NOT AN ERROR. Nothing in this repo can see the
         cron-job.org account setting, and a mismatch moves every scheduled job
         four or five hours depending on daylight saving. It is worth saying
         out loud on every timezone change and it must not block a save. */
      if ("timezone" in id)
        warnings.push("Check the scheduled-jobs account uses this same timezone, or every job runs hours out.");
      if ("domain" in id && typeof id.domain === "string" && /^https?:\/\//i.test(id.domain))
        errors.push("The web address should not start with http:// or https://.");
      /* ⚠️ BLANK IS ALLOWED AND MEANS "SEND NO REPLY-TO". A typo is not: this
         address exists so a reply reaches a person, and a misspelt one fails
         exactly the way the missing one did — silently, at the far end, days
         later. Checked here rather than at the send site, because by then the
         mail has already gone. */
      if ("replyToEmail" in id) {
        const r = id.replyToEmail;
        if (typeof r !== "string") errors.push("The reply-to address is not filled in correctly.");
        else if (r.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.trim()))
          errors.push("The reply-to address does not look like an email address.");
      }
    }
  }

  /* ── financial ───────────────────────────────────────────────────────── */
  const fin = settings.financial;
  if (fin !== undefined) {
    if (!isPlain(fin)) errors.push("The financial settings are not filled in correctly.");
    else {
      if ("feeShare" in fin && (!isNum(fin.feeShare) || fin.feeShare < 0 || fin.feeShare > 1))
        errors.push("The fee share must be between 0% and 100%.");
      if ("mileageRate" in fin && (!isNum(fin.mileageRate) || fin.mileageRate < 0))
        errors.push("The mileage rate cannot be negative.");
      if ("paperBand" in fin && (!isNum(fin.paperBand) || fin.paperBand < 0))
        errors.push("The paper band cannot be negative.");
      if ("goals" in fin) {
        if (!isPlain(fin.goals)) errors.push("The goals are not filled in correctly.");
        else {
          for (const g of PCT_GOALS) {
            if (!(g in fin.goals)) continue;
            const v = fin.goals[g];
            if (!isNum(v) || v < 0) errors.push(`The ${g} goal must be a number and cannot be negative.`);
            /* ⚠️ STORED AS A FRACTION. 0.08 is 8%. Anything above 1 is somebody
               typing 8 when they meant 8%, which would grade every month green
               forever — the exact silent-wrong-answer this refuses. */
            else if (v > 1) errors.push(`The ${g} goal looks like a whole percent. Enter 8% as 0.08.`);
          }
          /* Paper is a percent typed as a percent (3.27 means 3.27%), unlike the
             four above. Different unit, so a different bound, and saying so
             here is cheaper than somebody discovering it from a red row. */
          if ("paper" in fin.goals) {
            const p = fin.goals.paper;
            if (!isNum(p) || p < 0) errors.push("The paper goal must be a number and cannot be negative.");
            else if (p > 100) errors.push("The paper goal cannot be above 100%.");
          }
        }
      }
    }
  }

  /* ── features ────────────────────────────────────────────────────────── */
  const feat = settings.features;
  if (feat !== undefined) {
    if (!isPlain(feat)) errors.push("The feature switches are not filled in correctly.");
    else for (const [k, v] of Object.entries(feat))
      if (typeof v !== "boolean") errors.push(`The ${k} switch must be on or off.`);
  }

  /* ── retention ───────────────────────────────────────────────────────── */
  /* ⚠️⚠️ THE ONLY SETTING IN THIS FILE THAT DESTROYS DATA WHEN IT IS WRONG, and
     the only one with a floor. Every other bad value here shows a wrong number
     on a screen until somebody fixes it. A wrong number in THIS box is fed to
     a scheduled purge that permanently deletes the messages ~106 people sent
     each other, and there is no undo.

     THE TYPO IT EXISTS FOR: typing `1` meaning one year. That deletes every
     message older than a day, on a schedule, quietly. 30 is low enough that no
     real records policy touches it and high enough that the plausible slips —
     1, 7, 12 — are all caught. Matt asked for this floor by name.

     ⚠️ BLANK IS STILL VALID AND ALWAYS WILL BE. Blank means "use the default"
     (indefinite for announcements and shift threads, 365 for escalations), and
     a store that wants to keep everything must not have to type a number. */
  const ret = settings.retention;
  if (ret !== undefined) {
    if (!isPlain(ret)) errors.push("The message retention settings are not filled in correctly.");
    else {
      const LABELS = {
        announcements: "Announcements",
        shiftThreads: "Shift threads",
        escalations: "Escalations",
      };
      for (const k of Object.keys(LABELS)) {
        if (!(k in ret)) continue;
        const v = ret[k];
        if (v === null || v === undefined || String(v).trim() === "") continue; // blank = default
        const n = Number(String(v).trim());
        if (!Number.isFinite(n)) {
          errors.push(`${LABELS[k]} must be a number of days, or blank to keep them.`);
        } else if (!Number.isInteger(n)) {
          errors.push(`${LABELS[k]} must be a whole number of days.`);
        } else if (n < 30) {
          errors.push(`${LABELS[k]} cannot be less than 30 days. Messages older than this are deleted for good, so ${n} would delete almost everything. Leave it blank to keep them.`);
        } else if (n > 3650) {
          errors.push(`${LABELS[k]} cannot be more than 3650 days. Leave it blank to keep them forever.`);
        }
      }
    }
  }

  /* ── owners ──────────────────────────────────────────────────────────── */
  const own = settings.owners;
  if (own !== undefined) {
    if (!isPlain(own)) errors.push("The area owners are not filled in correctly.");
    else if ("seats" in own) {
      if (!Array.isArray(own.seats)) errors.push("The area owners list is not a list.");
      else {
        const seen = new Set();
        own.seats.forEach((s, i) => {
          if (!isPlain(s)) { errors.push(`Area ${i + 1} is not filled in correctly.`); return; }
          if (typeof s.id !== "string" || !s.id.trim()) errors.push(`Area ${i + 1} has no id.`);
          else if (seen.has(s.id)) errors.push(`Two areas share the id "${s.id}".`);
          else seen.add(s.id);
          /* ⚠️ NOBODY IS A VALID ANSWER and must stay one (Matt's own rule).
             A null holder says the routing layer has not been told who owns
             this, which is true and useful. Only a WRONG TYPE is an error. */
          if ("holder" in s && s.holder !== null && typeof s.holder !== "string")
            errors.push(`Area "${s.id || i + 1}" has an owner that is not a name.`);
        });
      }
    }
  }

  /* ── stations ────────────────────────────────────────────────────────── */
  const st = settings.stations;
  if (st !== undefined) {
    if (!isPlain(st)) errors.push("The stations are not filled in correctly.");
    else for (const house of ["FOH", "BOH"]) {
      if (!(house in st)) continue;
      if (!isPlain(st[house])) { errors.push(`${house} stations are not filled in correctly.`); continue; }
      for (const [day, list] of Object.entries(st[house])) {
        if (!Array.isArray(list)) { errors.push(`${house} ${day} is not a list of stations.`); continue; }
        const seen = new Set();
        list.forEach((s, i) => {
          const where = `${house} ${day}, station ${i + 1}`;
          if (!isPlain(s)) { errors.push(`${where} is not filled in correctly.`); return; }
          if (typeof s.id !== "string" || !s.id.trim()) errors.push(`${where} has no id.`);
          else if (seen.has(s.id)) errors.push(`${house} ${day} has two stations with the id "${s.id}".`);
          else seen.add(s.id);
          if (typeof s.name !== "string" || !s.name.trim()) errors.push(`${where} has no name.`);
          if (s.hours === null || s.hours === undefined) return;   // no posted hours is legal
          if (!Array.isArray(s.hours)) { errors.push(`${where} has hours that are not a list.`); return; }
          s.hours.forEach((b, bi) => {
            const w2 = `${s.name || where}, block ${bi + 1}`;
            if (!isPlain(b) || !okMinute(b.start) || !okMinute(b.end))
              { errors.push(`${w2} has a start or end time that is not a real time.`); return; }
            if (b.end <= b.start) errors.push(`${w2} ends before it starts.`);
          });
        });
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * changedPaths(before, after) -> ["financial.goals.paper", …]
 *
 * What a save would actually change, for the confirm screen. Matt's rule: show
 * what changed and require a confirm before saving.
 *
 * ⚠️ ARRAYS COMPARE WHOLE, matching how the merge applies them. A station list
 * that differs anywhere is one change to the list, not forty changes to rows,
 * because that is what saving it does.
 */
export function changedPaths(before, after, prefix = "") {
  const out = [];
  const a = isPlain(before) ? before : {};
  const b = isPlain(after) ? after : {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const path = prefix ? `${prefix}.${k}` : k;
    const av = a[k], bv = b[k];
    /* 🐛 IT USED TO REQUIRE BOTH SIDES TO BE OBJECTS, and a store's FIRST edit
       to a section has nothing on the `before` side at all. So changing one
       goal reported "financial" rather than "financial.goals.paper", and the
       confirm screen said "Financial changed" — which is not a confirm. A
       director cannot tell the fee share from the food goal in that sentence,
       and the whole point of the screen is that they can.
       Recurse whenever EITHER side is an object and the other is an object or
       simply absent; the absent one reads as {}. */
    const objectish = (v) => isPlain(v) || v === undefined;
    if ((isPlain(av) || isPlain(bv)) && objectish(av) && objectish(bv))
      out.push(...changedPaths(av || {}, bv || {}, path));
    else if (JSON.stringify(av) !== JSON.stringify(bv)) out.push(path);
  }
  return out.sort();
}
