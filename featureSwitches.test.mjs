/* ============================================================================
   featureSwitches.test.mjs — do the Store Settings feature switches move
   anything?

       node featureSwitches.test.mjs

   ⚠️⚠️ THE BUG. FinancialSuite.jsx built its tab list at MODULE LEVEL from
   `STORE_CONFIG.features[...]`. That is wrong twice:

     · STORE_CONFIG is the frozen CODE DEFAULTS. `applyStoreOverrides` never
       touches it — it builds LIVE, which is what `storeCfg()` reads.
     · a module-level const is evaluated at import, before main.jsx has fetched
       anything.

   So a store could switch Profit share or PTO off on the settings screen, the
   setting would save correctly, and the tab would not move. A switch that saves
   and changes nothing is worse than no switch: it reads as done.

   Found Aug 13 2026 while setting profit share off for a store that had asked
   for it off in writing on 11 Aug.

   ⚠️ THE CONTROL IS THE INTERESTING ASSERTION. This file proves the OLD
   approach could not have worked — STORE_CONFIG stays frozen across an override
   — and that the new one does. Without that pair, "it reads false" proves
   nothing about which of the two paths was used.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const t = (label, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL  ${label}`); } };
const group = (n) => console.log(`\n── ${n}`);

const src = fs.readFileSync(path.join(DIR, "FinancialSuite.jsx"), "utf8");
const { storeCfg, applyStoreOverrides, STORE_CONFIG } =
  await import(`file://${path.join(DIR, "storeConfig.js")}`);

/* ═══ THE LIVE READ ═══════════════════════════════════════════════════════ */
group("a saved setting reaches storeCfg");
{
  const shipped = storeCfg("features.profitShare");
  t("the flag has a shipped value", typeof shipped === "boolean");

  applyStoreOverrides({ features: { profitShare: false } });
  t("switching it OFF is visible to storeCfg", storeCfg("features.profitShare") === false);
  /* ⚠️ THE ASSERTION THAT NAMES THE BUG. The old code read this object, and
     this object does not move. Had it stayed, the line above could be false
     while the store's setting was saved and correct. */
  t("STORE_CONFIG DOES NOT MOVE — the old read could never have seen it",
    STORE_CONFIG.features.profitShare === shipped);

  applyStoreOverrides({ features: { profitShare: true } });
  t("switching it ON is visible too (control)", storeCfg("features.profitShare") === true);

  /* the other switches must not be disturbed by one override */
  applyStoreOverrides({ features: { profitShare: false } });
  t("turning one off leaves PTO alone", storeCfg("features.pto") === true);
  t("turning one off leaves the team site alone", storeCfg("features.teamSite") === true);

  applyStoreOverrides(STORE_CONFIG);
  t("restoring the defaults puts it back", storeCfg("features.profitShare") === shipped);
}

/* ═══ THE SOURCE ══════════════════════════════════════════════════════════ */
group("FinancialSuite.jsx reads it the right way");
{
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  t("no module-level TABS built from the frozen defaults",
    !/STORE_CONFIG\.features\[/.test(code));
  t("no `const TABS =` survives", !/^const TABS\s*=/m.test(code));
  t("storeCfg is imported", /import \{[^}]*\bstoreCfg\b[^}]*\} from "\.\/storeConfig\.js"/.test(src));
  /* ⚠️ INSIDE the useMemo, not above it. Above it is the same trap wearing a
     different hat: evaluated once, at import. */
  const memo = code.match(/const tabs = useMemo\([\s\S]*?\[user\]\s*\);/);
  t("the tabs memo was found", !!memo);
  t("THE FEATURE TEST IS INSIDE THE RENDER-TIME MEMO",
    !!memo && /storeCfg\(`features\.\$\{t\.feature\}`\) !== false/.test(memo[0]));
  t("it filters ALL_TABS now", !!memo && /ALL_TABS\.filter/.test(memo[0]));
  /* CONTROL: the file really was read and these greps can find things */
  t("CONTROL — the profit share tab is still declared",
    /id: "profitshare"[\s\S]{0,120}feature: "profitShare"/.test(src));
  t("CONTROL — the PTO tab is still declared",
    /id: "pto"[\s\S]{0,120}feature: "pto"/.test(src));
}

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
