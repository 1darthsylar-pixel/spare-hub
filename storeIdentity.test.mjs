/* ============================================================================
   storeIdentity.test.mjs — does this store's app say it is SOMEBODY ELSE?

       node storeIdentity.test.mjs

   ⛔⛔ THE BUG THIS GRADES. Every clone is a scrubbed snapshot of the origin
   store's Hub, and `public/manifest.webmanifest` came across untouched:

       "name": "Gate City Hub"
       "description": "The Gate City Chick-fil-A operations platform."

   and its first icon pointed at an `appleTouchIcon.png` still sitting in
   `public/`, which is the origin's mentorship-programme logo.

   ⇒ A phone installing a clone's Hub got another restaurant's name over every
   push notification and another restaurant's mark as its app icon. Nothing
   errored, nothing showed in a diff, and it survived every scrub because the
   scrub read JavaScript.

   ★ Design rule 18: "would another operator have to change this, and can they
   change it without a developer?" Yes and no.

   ⚠️⚠️ IT ASKS THE RIGHT QUESTION, AND MY FIRST TWO DRAFTS DID NOT.
   Draft one compared the manifest against the first `name:` in storeConfig.js
   — at the Village that is a STATION, "Primary Fries". Draft two demanded the
   manifest contain the store's full legal name, which failed "The Village Hub"
   against "The Village at North Elm", a perfectly good short form. Both were
   the assertion being wrong, not the code.
   ⇒ The real question is not "does it name itself correctly". It is "does it
   name SOMEBODY ELSE", and the file can tell which repo is the origin exactly
   the way `storeConfig.js` already does: by store number.

   ⚠️ A PLACEHOLDER IS A PASS, ON PURPOSE. `SET-THIS-TO-THE-STORE-NAME` is
   loudly wrong and gets fixed. Another store's real name is plausibly wrong and
   gets believed.
   ============================================================================ */
import { readFileSync, existsSync } from "node:fs";

let pass = 0, fail = 0;
const t = (label, cond, extra) => {
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}${cond || !extra ? "" : `  ${extra}`}`);
  if (cond) pass++; else fail++;
};

const CFG = readFileSync(new URL("./storeConfig.js", import.meta.url), "utf8");
const MAN = JSON.parse(readFileSync(new URL("./public/manifest.webmanifest", import.meta.url), "utf8"));

/* The origin store, named the same way storeConfig tells itself apart. */
const ORIGIN_FSR = "04010";
const ORIGIN_WORDS = ["Gate City"];
const fsr = (CFG.match(/fsr:\s*"([^"]+)"/) || [])[1] || "";
const isOrigin = fsr === ORIGIN_FSR;

console.log("\n── controls");
t("storeConfig.js was really read", CFG.length > 1000);
t("the manifest parsed and names itself", !!MAN && typeof MAN.name === "string" && MAN.name.length > 0);
t("control: the manifest carries an icon list", Array.isArray(MAN.icons) && MAN.icons.length > 0);
t("control: this repo states a store number", !!fsr, `fsr = ${fsr || "(none)"}`);
console.log(`        this repo is ${isOrigin ? "THE ORIGIN" : "a clone"} (fsr ${fsr})`);

if (isOrigin) {
  console.log("\n── the origin may name itself, and owns its own artwork");
  t("★ the origin's manifest names the origin", ORIGIN_WORDS.some((w) => MAN.name.includes(w)));
  t("control: so this file is not vacuous on the origin", MAN.name.length > 3);
} else {
  console.log("\n── a clone must not carry the origin's identity");
  for (const w of ORIGIN_WORDS) {
    t(`★★ the manifest name does not say "${w}"`, !MAN.name.includes(w), `name = ${MAN.name}`);
    t(`★★ nor short_name`, !String(MAN.short_name || "").includes(w));
    t(`★★ nor the description`, !String(MAN.description || "").includes(w), `description = ${MAN.description}`);
  }
  /* ⚠️ THE ORIGIN'S EXACT FILENAME, not "any png". A store adding its OWN
     artwork later is the goal, not a failure. What must never sit here is the
     file the snapshot carried across, which the manifest points at. */
  t("★ the snapshot's appleTouchIcon is not here",
    !existsSync(new URL("./public/appleTouchIcon.png", import.meta.url)),
    "that file is the origin store's programme logo and the manifest points at it");
}

console.log(`\n${fail ? "FAIL" : "PASS"}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
