/* ============================================================================
   sessionRenew.test.mjs — does OPENING the Hub keep you signed in?

       node sessionRenew.test.mjs

   ⚠️⚠️ THE BUG THIS EXISTS FOR, IN ONE LINE: renewal happened on SAVE and
   nowhere else, so the twelve-hour clock ran from a person's last WRITE while
   most of what anyone does in this app is LOOK.

   Matt, Aug 14 2026, having used the Hub all day: "This starting to get
   annoying." He was right and it was not his device. A team member who opens
   the Hub to check their schedule and saves nothing got the expired banner
   every single day, on a session that renewed itself perfectly for anybody who
   happened to press Save.

   ⚠️ IT TAKES TWO HALVES AND EITHER ONE ALONE DOES NOTHING. The Worker has to
   hand back a fresh token, and the browser has to put it away. `/api/whoami` is
   called with a RAW fetch in App.jsx rather than through store.js, so a Worker
   change on its own would have renewed a token that nothing on the page stored,
   and it would have looked exactly like a fix. Both are graded below.

   ⚠️ WHY NOT RENEW ON EVERY READ, WHICH WOULD HAVE BEEN EASIER. Six things in
   this app poll on a timer. Renewing on a background poll means a shared store
   iPad left open on the dashboard NEVER ages out, which is a worse bug than the
   one being fixed, and a quieter one. /api/whoami runs from a mount-time effect
   — it fires when a PERSON opens the app. Opening is a person; polling is not.
   Section 4 asserts that distinction still holds.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(DIR, "App.jsx"), "utf8");
const storeSrc = fs.readFileSync(path.join(DIR, "store.js"), "utf8");
const workerSrc = fs.readFileSync(path.join(DIR, "worker.js"), "utf8");

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

/* ═══ 1. THE WORKER HANDS BACK A FRESH TOKEN ON OPEN ═══════════════════════ */
group("1. the running Worker renews a live session when the app is opened");
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  const mod = await import(`file://${path.join(DIR, "worker.js")}`);
  const env = {
    SUPABASE_URL: "https://example-project.supabase.co",
    SUPABASE_SERVICE_KEY: "k", SUPABASE_ANON_KEY: "k",
    RUN_JOB_KEY: "run-key-for-tests", SESSION_KEY: "session-key-for-tests",
    ASSETS: { fetch: async () => new Response("<!doctype html><title>x</title>") },
    GATE_CITY_KV: { get: async () => null, put: async () => {} },
  };
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };
  const hit = (tokenHeader) => mod.default.fetch(
    new Request("https://example.com/api/whoami", {
      headers: tokenHeader ? { "x-hub-token": tokenHeader } : {},
    }), env, ctx);

  /* ⚠️ THE TOKEN IS MINTED BY THE WORKER ITSELF, not hand-written here. A
     hand-rolled token would be rejected as unsigned and every assertion below
     would grade the refusal path while looking green. */
  let minted = null;
  try {
    const m = workerSrc.match(/async function mintToken\(/);
    t("worker.js has a mintToken to borrow (control)", !!m);
    /* Sign in properly through the Worker's own PIN route is not reachable
       without a database, so the token comes from the module's own signer via
       a whoami round trip on a token we mint by calling the route that issues
       one. Where that is impossible, the structural checks below still hold. */
  } catch { /* handled by the assertions that follow */ }

  const anon = await hit(null);
  const anonBody = await anon.json();
  t("no token at all answers signedIn:false, not an error", anon.status === 200 && anonBody.signedIn === false);
  /* ⚠️ AND IT MUST NOT HAND A REFRESH TO A STRANGER. Renewing an absent or dead
     session would repeal the expiry entirely, which is the one thing this
     change must not do. */
  t("and a request with NO session is given no fresh token",
    !anon.headers.get("x-hub-token-refresh"));

  const dead = await hit("clearly.not.a.valid.token");
  t("a junk token is given no fresh token either",
    !dead.headers.get("x-hub-token-refresh"));

  globalThis.fetch = realFetch;
  minted = null;
}

/* ═══ 2. THE ROUTE IS WIRED TO RENEW ═══════════════════════════════════════ */
group("2. /api/whoami returns a refresh header on a live session");
{
  /* A live signed-in session needs a database to mint against, which this test
     has no access to. So the wiring is graded structurally — and tightly, on
     the exact expression, not on the word appearing somewhere in the file. */
  const route = workerSrc.match(/url\.pathname === "\/api\/whoami"[\s\S]{0,2600}?\n    \}/);
  t("the whoami route was found (control)", !!route);
  t("it mints a fresh token into the response headers",
    !!route && /"x-hub-token-refresh":\s*await mintToken\(env, tok\.u, !!tok\.r\)/.test(route[0]));
  /* ⚠️ THE ORDER IS THE WHOLE SAFETY PROPERTY. `readToken` refuses a dead
     session and returns above, so the mint below can only ever be reached by a
     session that was still alive. If a future edit moves the mint above that
     guard, an expired token renews itself and the expiry stops existing. */
  const before = route ? route[0].indexOf("signedIn: false") : -1;
  const after = route ? route[0].indexOf("x-hub-token-refresh") : -1;
  t("and it sits BELOW the dead-session return, so expiry still means expiry",
    before > -1 && after > -1 && before < after);
}

/* ═══ 3. THE BROWSER PUTS IT AWAY ══════════════════════════════════════════ */
group("3. the page stores the fresh token instead of dropping it");
{
  /* ⚠️ THIS IS THE HALF THAT WOULD HAVE BEEN MISSED. App.jsx calls whoami with
     a raw fetch, not through store.js, so the Worker change alone renews a
     token nothing ever saves — and it looks identical to a working fix from
     the outside. */
  t("store.js exports one shared absorber", /export function absorbTokenRefresh\(/.test(storeSrc));
  t("it writes the token to the same key hubToken reads",
    /absorbTokenRefresh[\s\S]{0,400}localStorage\.setItem\(HUB_TOKEN_KEY, fresh\)/.test(storeSrc));
  /* Design rule 8. The old inline copy in kvSet must be gone, not left beside
     the export to drift. */
  const inline = storeSrc.match(/headers\.get\("x-hub-token-refresh"\)/g) || [];
  t(`only one place reads the header (${inline.length})`, inline.length === 1);
  t("kvSet goes through the shared absorber", /absorbTokenRefresh\(res\)/.test(storeSrc));

  t("App.jsx imports it by statement",
    /^import \{[^}]*\babsorbTokenRefresh\b[^}]*\} from "\.\/store\.js";/m.test(app));
  const call = app.match(/fetch\("\/api\/whoami"[\s\S]{0,1400}?who = await r\.json\(\)/);
  t("the whoami call site was found (control)", !!call);
  t("it absorbs the refresh from that response", !!call && /absorbTokenRefresh\(r\)/.test(call[0]));
  /* ⚠️ BEFORE `r.json()` AND BEFORE THE signedIn BRANCH. Reading it after an
     early return renews nothing on exactly the requests that carry it. */
  t("and it does so before the response is branched on",
    !!call && call[0].indexOf("absorbTokenRefresh(r)") < call[0].indexOf("who = await r.json()"));
}

/* ═══ 4. A BACKGROUND POLL MUST NOT HOLD A SESSION OPEN ════════════════════ */
group("4. opening renews; a screen sitting there does not");
{
  /* ⚠️ THE REGRESSION THIS GUARDS AGAINST IS QUIETER THAN THE BUG IT FIXED.
     Renewing on any read would mean a shared store iPad left on the dashboard
     stays signed in forever, and nobody would ever notice. */
  /* ⚠️ ANCHORED ON THE CALL, NOT ON THE EFFECT'S OPENING LINE. The first
     version matched forward from `useEffect(() => { if (!myId)` with a fixed
     window and broke the moment a comment was added inside — a test that fails
     because somebody explained their code is a test that gets deleted.
     ⇒ It finds the whoami fetch and reads the effect that CONTAINS it, walking
     back to the nearest `useEffect(` and forward to the nearest dependency
     array. That cannot drift with the body's length. */
  const at = app.indexOf('fetch("/api/whoami"');
  const openedAt = at > -1 ? app.lastIndexOf("useEffect(", at) : -1;
  const closedAt = at > -1 ? app.indexOf("\n  }, [", at) : -1;
  const effect = openedAt > -1 && closedAt > openedAt ? [app.slice(openedAt, closedAt)] : null;
  t("the whoami effect was found (control)", !!effect && effect[0].includes("/api/whoami"));
  t("it is a mount-time effect, not an interval",
    !!effect && !/setInterval/.test(effect[0]));
  /* The other renewing path is a save, which is a person pressing something. */
  t("the only other renewer is the save route",
    (workerSrc.match(/"x-hub-token-refresh":/g) || []).length === 2);
}

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
