/* ============================================================================
   storeConfigLoad.test.mjs — does a store's own config survive a sign-in?

       node storeConfigLoad.test.mjs

   🐛 THE BUG THIS EXISTS FOR. The loader ran once, at launch, and its first
   line is "no token, give up". Anybody who opened the Hub with a lapsed
   session — the ordinary way people open it — then typed their PIN, ran the
   WHOLE session on Gate City's code defaults, because nothing ever asked
   again. It surfaced as the Tokens tile reading "Tokens" while Store Settings
   read "Stars", and the saved value was confirmed in the live database first.

   ⚠️⚠️ THE DANGEROUS REGRESSION IS THE `applied` FLAG BEING SET TOO EAGERLY.
   If a FAILED fetch marked the config as applied, one dropped request on store
   wifi would pin a whole session to the defaults with no way back — the same
   bug being fixed, wearing a different hat, and just as silent. Sections 2, 3,
   5 and 6 are all that one assertion from different angles.

   ⚠️ AND THE OPPOSITE REGRESSION IS REAL TOO. If a SUCCESSFUL apply did not
   set the flag, every sign-in would re-fetch and re-render for nothing.
   Section 4 grades that by counting requests, not by reading the flag.

   ⇒ This RUNS the real bytes rather than grepping them, per the repo rule that
   a source grep cannot tell you a function behaves. `store.js` reads
   `import.meta.env`, so a plain import cannot work in node; the module's own
   source is extracted and its two dependencies are injected.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(DIR, "storeConfigLoad.js"), "utf8");

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

/* ── 0. the control ─────────────────────────────────────────────────────── */
group("0. the module was read and its body extracted (control)");
const bodyStart = src.indexOf("const BOOT_CONFIG_TIMEOUT_MS");
t("the file is non-trivial (control)", src.length > 1000);
t("the runnable body was found", bodyStart > 0);

/* Build a fresh, isolated copy of the module for each scenario. `export` is
   stripped and the two real dependencies are injected, so what runs below is
   this file's own logic and nothing else's. */
const makeModule = (hubToken, applyStoreOverrides, fetchImpl) => {
  const body = src.slice(bodyStart).replace(/^export /gm, "");
  return new Function(
    "hubToken", "applyStoreOverrides", "fetch",
    `${body}; return { loadStoreConfig, storeConfigApplied };`,
  )(hubToken, applyStoreOverrides, fetchImpl);
};

const okRes = (settings) => ({ ok: true, json: async () => ({ ok: true, settings }) });

/* ── 1. the happy path ──────────────────────────────────────────────────── */
group("1. a good fetch applies and says so");
{
  let got = null;
  const m = makeModule(() => "tok", (s) => { got = s; return true; }, async () => okRes({ tokens: { label: "Stars" } }));
  t("it starts unapplied (control)", m.storeConfigApplied() === false);
  const r = await m.loadStoreConfig();
  t("it resolves true", r === true);
  t("it reports applied afterwards", m.storeConfigApplied() === true);
  t("and it passed the settings through untouched", got && got.tokens && got.tokens.label === "Stars");
}

/* ── 2. signed out ──────────────────────────────────────────────────────── */
group("2. no token gives up WITHOUT burning the flag");
{
  let fetches = 0;
  const m = makeModule(() => "", () => true, async () => { fetches++; return okRes({}); });
  const r = await m.loadStoreConfig();
  t("it resolves false", r === false);
  t("it never fetched", fetches === 0);
  /* ★★ THE WHOLE BUG IN ONE LINE. This is the boot call on a lapsed session.
     If it marked the config applied, the sign-in call would skip and the
     session would stay on the defaults forever, which is what used to happen. */
  t("it is still UNAPPLIED, so sign-in will retry", m.storeConfigApplied() === false);
}

/* ── 3. the server said no ──────────────────────────────────────────────── */
group("3. a 401 does not burn the flag either");
{
  const m = makeModule(() => "tok", () => true, async () => ({ ok: false, json: async () => ({}) }));
  t("it resolves false", (await m.loadStoreConfig()) === false);
  t("it is still unapplied", m.storeConfigApplied() === false);
}

/* ── 4. the ordinary case costs nothing ─────────────────────────────────── */
group("4. once applied, a second call does no work");
{
  let fetches = 0;
  const m = makeModule(() => "tok", () => true, async () => { fetches++; return okRes({}); });
  await m.loadStoreConfig();
  t("the first call fetched (control)", fetches === 1);
  const second = await m.loadStoreConfig();
  t("the second resolves false, so no re-render is triggered", second === false);
  /* Counting REQUESTS rather than reading the flag: the point of the flag is
     that a signed-in sign-in costs no network and no flash. */
  t("and it did not fetch again", fetches === 1);
}

/* ── 5. a bad shape ─────────────────────────────────────────────────────── */
group("5. a refused merge is not an apply");
{
  /* applyStoreOverrides returns false when the saved value is not a plain
     object. Treating that as applied would leave the store on defaults AND
     stop anything trying again. */
  const m = makeModule(() => "tok", () => false, async () => okRes("not-an-object"));
  t("it resolves false", (await m.loadStoreConfig()) === false);
  t("it is still unapplied", m.storeConfigApplied() === false);
}

/* ── 6. the network died ────────────────────────────────────────────────── */
group("6. a thrown fetch is survivable and retryable");
{
  const m = makeModule(() => "tok", () => true, async () => { throw new Error("offline"); });
  let threw = false;
  let r = null;
  try { r = await m.loadStoreConfig(); } catch { threw = true; }
  t("it never throws at the caller", threw === false);
  t("it resolves false", r === false);
  t("it is still unapplied, so the next sign-in retries", m.storeConfigApplied() === false);
}

/* ── 7. there is only one loader in the app ─────────────────────────────── */
group("7. main.jsx and App.jsx share it rather than copying it");
const mainSrc = fs.readFileSync(path.join(DIR, "main.jsx"), "utf8");
const appSrc = fs.readFileSync(path.join(DIR, "App.jsx"), "utf8");
t("main.jsx imports the loader", /^import \{ loadStoreConfig \} from "\.\/storeConfigLoad\.js";$/m.test(mainSrc));
/* ⚠️ STATEMENT-ANCHORED, NOT EXACT. This used to demand the import name it
   alone, so adding a SECOND export to the same statement turned it red while
   the code was correct — `storeSavedHas` joined it on Aug 16 2026 for the
   day-one panel. Still anchored on `^import ... from "./storeConfigLoad.js"`,
   because a substring match would count a comment mentioning the module, which
   has passed for an import twice in this repo. */
t("App.jsx imports the loader",
  /^import \{[^}]*\bloadStoreConfig\b[^}]*\} from "\.\/storeConfigLoad\.js";$/m.test(appSrc));
/* ⚠️ THE POINT OF THE MOVE. Two copies of a fetch-and-merge would drift, and
   the one that drifts is the one nobody is looking at. */
t("main.jsx no longer fetches the route itself", !/fetch\("\/api\/store-config"/.test(mainSrc));
t("App.jsx does not fetch the route itself", !/fetch\("\/api\/store-config"/.test(appSrc));
t("App.jsx re-renders only on a real apply", /loadStoreConfig\(\)\.then\(\(didApply\) => \{ if \(didApply\) setCfgTick/.test(appSrc));

console.log(`\n${fail} FAILED, ${pass} passed`);
process.exit(fail ? 1 : 0);
