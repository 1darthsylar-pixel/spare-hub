/* ═══ THE STORE'S OWN SETTINGS, FETCHED AND APPLIED ═════════════════════════
   Moved out of main.jsx on Aug 15 2026 so it has TWO callers instead of one,
   which is the whole fix. It lives in its own file rather than being exported
   from main.jsx because main.jsx imports App.jsx, so App.jsx importing back
   would be a cycle.

   🐛 THE BUG THIS EXISTS FOR, MEASURED RATHER THAN GUESSED. This ran once, at
   launch, and its first line is "no token, give up". So anybody who opened the
   Hub with a lapsed session — which is the ordinary way people open it — then
   typed their PIN, ran the WHOLE session on Gate City's code defaults. Nothing
   re-fetched. main.jsx said this was fine because "the app re-renders on
   sign-in anyway", and that is the mistake: re-rendering reads LIVE, and LIVE
   was never populated, so every render after sign-in was just as wrong as the
   first.

   Found from a screenshot: the Tokens tile read "Tokens" while Store Settings
   read "Stars". Both were correct. The tile reads the merged config, the
   settings screen fetches its own copy, and the merged config had never been
   built. The saved value was confirmed in the live database first —
   `tokens.label: "Stars"`, saved 08:20 that morning — so the save was never in
   question.

   ⚠️⚠️ THE WORD IS THE SMALL HALF. Every setting a store saved was ignored for
   that session: goals, stations, area owners, names. At a CLONE that means
   running on Gate City's, which is the exact failure design rule 18 exists to
   stop, reached through the most common action in the app.

   ⚠️ IT NEVER BLOCKS THE APP. Not on a failed fetch, not on a 401, not on a
   slow network, not on a bad shape. Every one of those falls through to the
   code defaults and the Hub opens exactly as it does today. A settings read is
   a nicety; a leader standing at the board mid-rush is not going to wait for it
   and must never be shown a blank screen because of it.

   ⚠️⚠️ THE TIMEOUT IS THE LOAD-BEARING PART, NOT THE try/catch. A try/catch
   handles a fetch that FAILS. It does nothing for one that HANGS — and a hung
   request at boot means render() is never reached and the Hub is a white
   screen, which is far worse than the stale-name flash this exists to avoid.
   Store wifi drops mid-request often enough that this is a when, not an if. */
import { hubToken } from "./store.js";
import { applyStoreOverrides } from "./storeConfig.js";

const BOOT_CONFIG_TIMEOUT_MS = 2500;

/* ★★ ONCE PER SESSION, AND THIS FLAG IS WHY THE SIGN-IN CALL IS FREE.
   A successful boot apply sets this, so the sign-in caller below does nothing
   at all in the ordinary case — no second request, no re-render, no flash. It
   only does work in the one case that was broken: booted signed out, so the
   boot call bailed before it fetched anything.

   ⚠️ ONLY A REAL APPLY SETS IT. A failed fetch, a 401 or a bad shape leaves it
   false, so the next caller tries again. Setting it on every attempt would
   turn one dropped request into a whole session on the wrong settings, which
   is the bug being fixed wearing a different hat. */
let applied = false;

/** Has a store's saved config actually been merged in this session? */
export function storeConfigApplied() {
  return applied;
}

/* ★★ WHICH TOP-LEVEL SETTINGS THIS STORE HAS ACTUALLY SAVED, as opposed to
   inherited. Needed by the day-one "Start here" panel, which has to answer
   "has this store set its own stations yet" — and CANNOT ask the merged config,
   because the merged config always has stations: the origin store's. Reading
   `storeCfg("stations")` would report every brand-new store as finished.
   ⚠️ SAVED KEYS, NOT VALUES. This is a "have they been here yet" question, so
   the names are enough and copying the values would put a second, staler copy
   of a store's settings in module state beside the real one.
   ⚠️ EMPTY UNTIL AN APPLY SUCCEEDS, which is the safe direction: an unanswered
   question shows the step rather than ticking it. A store that has genuinely
   saved nothing and a store whose settings failed to load look the same here,
   and both should be told to go and set their stations. */
let savedKeys = [];

/** Did this store save its own settings under this top-level key? */
export function storeSavedHas(key) {
  return savedKeys.includes(String(key || ""));
}

/** Fetch the store's saved settings and merge them over the code defaults.
 *  Resolves true only when something was really applied, so a caller can
 *  decide whether it needs to re-render. Never throws and never blocks. */
export async function loadStoreConfig() {
  if (applied) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BOOT_CONFIG_TIMEOUT_MS);
  try {
    const token = hubToken();
    if (!token) return false;
    const res = await fetch("/api/store-config", { headers: { "x-hub-token": token }, signal: ctrl.signal });
    if (!res.ok) return false;
    const body = await res.json();
    if (body && body.ok && applyStoreOverrides(body.settings)) {
      applied = true;
      /* Recorded only on a real apply, for the same reason `applied` is. */
      savedKeys = body.settings && typeof body.settings === "object"
        ? Object.keys(body.settings) : [];
      return true;
    }
    return false;
  } catch {
    /* Deliberately silent, and that covers the abort too. See the note above:
       the defaults are a working Hub. */
    return false;
  } finally {
    clearTimeout(timer);
  }
}
