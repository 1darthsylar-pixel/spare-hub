import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import UpdateBar from "./UpdateBar.jsx";
import "./index.css";
import { kvGet, kvGetResult, kvSet, hubToken } from "./store";
import { applyStoreOverrides } from "./storeConfig.js";

// Redirect the artifact-style window.storage API to the shared store,
// so tools written against window.storage persist for the whole team.
if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    get: async (key) => {
      const v = await kvGet(key);
      return v == null ? null : { value: JSON.stringify(v) };
    },
    /* Same read, reporting whether it actually reached the database:
       { ok, value } with `value` already JSON-encoded like `get` returns it.
       ⚠️ `ok:false` means DO NOT SEED and DO NOT SAVE — see kvGetResult in
       store.js. `get` cannot express that; it returns null for both. */
    getResult: async (key) => {
      const r = await kvGetResult(key);
      return { ok: r.ok, value: r.value == null ? null : JSON.stringify(r.value) };
    },
    /* ★★ RETURNS THE REAL RESULT. This used to `await kvSet(...)` and then
       `return true` no matter what came back.
       🐛 kvSet reports a refused write by RETURNING FALSE, not by throwing, so
       every tile on window.storage — Daily Setup, Cash Audit, Weekly Cleaning,
       Equipment Log, Food Safety, IPO Checklist — was told every save worked.
       DailySetup even has a "Couldn't save" warning built on this boolean; it
       could never fire. A leader on dropped wifi read "saved for everyone" for
       a board that reached nothing. */
    set: async (key, value) => kvSet(key, JSON.parse(value)),
    delete: async (key) => kvSet(key, null),
    list: async () => ({ keys: [] }),
  };
}

/* ═══ THE STORE'S OWN SETTINGS, BEFORE FIRST PAINT ═══════════════════════════
   Step 3, Aug 11 2026. Applies whatever the store saved in the settings screen
   over the code defaults, so every screen renders with the store's own name,
   goals and switches rather than Gate City's.

   ⚠️ IT NEVER BLOCKS THE APP. Not on a failed fetch, not on a 401, not on a
   slow network, not on a bad shape. Every one of those falls through to the
   code defaults and the Hub opens exactly as it does today. A settings read is
   a nicety; a leader standing at the board mid-rush is not going to wait for it
   and must never be shown a blank screen because of it.

   ⚠️ IT RUNS BEFORE render(), AND THAT IS THE WHOLE POINT. The reads inside the
   app go through storeCfg() at use time now, so a late apply would still be
   picked up on the next render — but a value applied AFTER first paint means
   the store's own name flashes as "Gate City" first. Awaiting it here costs one
   request against a Worker route and removes that flash.

   ⚠️ SIGNED OUT MEANS DEFAULTS, AND THAT IS CORRECT. The route needs a session
   token, so the sign-in screen renders on the code defaults. Nothing on it
   depends on a store's settings, and re-applying after sign-in is a later
   refinement rather than a gap — the app re-renders on sign-in anyway. */
/* ⚠️⚠️ THE TIMEOUT IS THE LOAD-BEARING PART, NOT THE try/catch. A try/catch
   handles a fetch that FAILS. It does nothing for one that HANGS — and a hung
   request here means render() is never reached and the Hub is a white screen,
   which is far worse than the stale-name flash this whole function exists to
   avoid. Store wifi drops mid-request often enough that this is a when, not an
   if. Two and a half seconds, then give up and open on the defaults. */
const BOOT_CONFIG_TIMEOUT_MS = 2500;

async function bootStoreConfig() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BOOT_CONFIG_TIMEOUT_MS);
  try {
    const token = hubToken();
    if (!token) return;
    const res = await fetch("/api/store-config", { headers: { "x-hub-token": token }, signal: ctrl.signal });
    if (!res.ok) return;
    const body = await res.json();
    if (body && body.ok) applyStoreOverrides(body.settings);
  } catch {
    /* Deliberately silent, and that covers the abort too. See the note above:
       the defaults are a working Hub. */
  } finally {
    clearTimeout(timer);
  }
}

bootStoreConfig().finally(() => {
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
      {/* Sits outside App on purpose: it has nothing to do with the dashboard,
          it must survive whatever App is rendering, and App.jsx is edited by
          more than one session so the smaller its diff the better. */}
      <UpdateBar />
    </React.StrictMode>
  );
});

/* PWA service worker. Network-first on pages, so nothing is served from a
   local cache that could be stale.

   ⚠️ THE SENTENCE THAT USED TO BE HERE WAS WRONG, AND IT MATTERED. It read
   "a Cloudflare promote is always picked up on the next load — this can never
   serve a stale build." Network-first only guarantees we ASK the network. It
   says nothing about what the network answers with, and on Aug 3 2026 the
   answer was an old index.html held by Cloudflare's edge for the store's
   location. Matt: "I closed my app out, signed out and in but it didn't update
   until I got home." That comment is exactly why the service worker was the
   first suspect and the last place the problem actually was. UpdateBar above
   is the real backstop. */
// Also the prerequisite for iOS home-screen web push.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}
