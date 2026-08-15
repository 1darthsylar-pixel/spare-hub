/* ============================================================================
   replyTo.test.mjs — does a reply to a Hub email reach a person?

       node replyTo.test.mjs

   ⚠️⚠️ THE GAP. Every email this Hub sends says it is from `notifyEmail`, and
   that is a sending identity, not a mailbox — the domain has no MX. So a team
   member who hits Reply on "You have a document to sign" writes into a void.

   🐛 THE SAME SHAPE ALREADY COST TWO DAYS IN THE BOOKS APP (11 Aug 2026):
   replies went to an address with no MX, Gmail retried for 46 hours, and the
   sender got a bounce two days later if they noticed at all.

   ⚠️ THE TRAP THIS NEARLY WALKED INTO. The obvious build is a Store Settings
   field read as `STORE.identity.replyToEmail` at the send site. That compiles,
   looks dynamic, and returns the DEPLOYED DEFAULT forever, because
   `applyStoreOverrides` runs in the browser and never in the Worker. The
   setting would save perfectly and do nothing — the third time that same trap
   appeared in one day. So it rides on `storeBrand`, the Worker's single live
   read of saved settings, and this file asserts that.

   ⚠️ AND THE FIELD NAME IS `replyTo`, CAMEL CASE, verified against Resend's own
   API reference rather than guessed. Getting it wrong is not cosmetic: the
   wrong key is either ignored (replies still vanish) or rejected (every email
   from the store stops).
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(DIR, "worker.js"), "utf8");
const cfgSrc = fs.readFileSync(path.join(DIR, "storeConfig.js"), "utf8");
const settingsSrc = fs.readFileSync(path.join(DIR, "StoreSettings.jsx"), "utf8");
const { checkStoreSettings } = await import(`file://${path.join(DIR, "storeSettingsImport.js")}`);
const { storeCfg } = await import(`file://${path.join(DIR, "storeConfig.js")}`);

let pass = 0, fail = 0;
const t = (label, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL  ${label}`); } };
const group = (n) => console.log(`\n── ${n}`);
const code = worker.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ═══ THE SETTING ═════════════════════════════════════════════════════════ */
group("the setting exists and defaults to blank");
{
  t("identity.replyToEmail is defined", /replyToEmail:\s*"/.test(cfgSrc));
  /* ⚠️ BLANK, NOT A GUESSED ADDRESS. Nobody invents a mailbox for a store. */
  t("it ships blank", storeCfg("identity.replyToEmail", null) === "");
  t("CONTROL — the send-from address is still set", !!storeCfg("identity.notifyEmail"));
  /* mergeDeep only fills keys the defaults already know, so the default has to
     exist or a saved value could never reach the app at all. */
  t("it is on the Store Settings screen", /identity\.replyToEmail/.test(settingsSrc));
}

/* ═══ THE READ ════════════════════════════════════════════════════════════ */
group("the Worker reads the SAVED value, not the deployed default");
{
  t("storeBrand carries it", /replyTo = brandStr\(s\.identity && s\.identity\.replyToEmail/.test(code));
  t("and caches it with the rest", /brandCache = \{[^}]*replyTo\s*\}/.test(code));
  t("the code default is only the fallback",
    /replyTo = brandStr\(STORE_CONFIG\.identity && STORE_CONFIG\.identity\.replyToEmail, ""\)/.test(code));
  /* ⚠️ THE ASSERTION THAT CATCHES THE TRAP. No send site may read STORE.* for
     this, because that is the deployed default forever in the Worker. */
  t("NO SEND SITE READS STORE.identity.replyToEmail", !/STORE\.identity\.replyToEmail/.test(code));
  t("one helper, not two reads", (code.match(/async function replyToFor/g) || []).length === 1);
}

/* ═══ BOTH SEND SITES ═════════════════════════════════════════════════════ */
group("every Resend body gets it");
{
  const sites = (code.match(/https:\/\/api\.resend\.com\/emails/g) || []).length;
  t(`this Worker builds ${sites} Resend requests (control)`, sites === 2);
  /* ⚠️ A REPLY-TO ON ONE OF TWO SEND SITES IS THE BUG WEARING ITS OWN FIX. */
  t("BOTH call the helper", (code.match(/replyToFor\(env\)/g) || []).length >= 2);
  t("sendEmail sets it", /if \(replyTo\) body\.replyTo = replyTo;/.test(code));
  t("the receipt route sets it", /receiptReplyTo \? \{ replyTo: receiptReplyTo \}/.test(code));
  /* ⚠️ `replyTo`, NOT `reply_to`. Verified against Resend's API reference. */
  t("the field is camelCase replyTo", !/reply_to/.test(code));
  /* added, never swapped in — a store with no reply-to sends what it sent before */
  t("it is omitted when blank, not sent empty", /if \(replyTo\) body\.replyTo/.test(code));
  t("sendEmail is async now", /async function sendEmail\(/.test(code));
  t("every caller already awaited it",
    (code.match(/await sendEmail\(/g) || []).length === (code.match(/[^.\w]sendEmail\(/g) || []).length - 1);
}

/* ═══ A TYPO MUST NOT SAVE ════════════════════════════════════════════════ */
group("the validator");
{
  const errs = (s) => checkStoreSettings(s).errors;
  /* ⚠️ CONTROL FIRST. A validator that rejected everything would satisfy every
     "it refuses" assertion below and block every save in the app. */
  t("a good address saves", errs({ identity: { replyToEmail: "matt@example.com" } }).length === 0);
  t("BLANK SAVES — it means send no reply-to", errs({ identity: { replyToEmail: "" } }).length === 0);
  t("whitespace only saves as blank", errs({ identity: { replyToEmail: "   " } }).length === 0);
  t("a settings record without the key is fine", errs({ identity: { name: "X" } }).length === 0);

  t("a typo is refused", errs({ identity: { replyToEmail: "matt@example" } }).length === 1);
  t("no at-sign is refused", errs({ identity: { replyToEmail: "matt.example.com" } }).length === 1);
  t("a space is refused", errs({ identity: { replyToEmail: "matt @example.com" } }).length === 1);
  t("a non-string is refused", errs({ identity: { replyToEmail: 42 } }).length === 1);
  t("the refusal says what is wrong",
    /reply-to/i.test(errs({ identity: { replyToEmail: "nope" } })[0] || ""));
}

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
