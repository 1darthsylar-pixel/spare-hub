import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import UpdateBar from "./UpdateBar.jsx";
import "./index.css";
import { kvGet, kvGetResult, kvSet } from "./store";
import { loadStoreConfig } from "./storeConfigLoad.js";

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

   ⚠️ IT RUNS BEFORE render(), AND THAT IS THE WHOLE POINT. The reads inside the
   app go through storeCfg() at use time now, so a late apply would still be
   picked up on the next render — but a value applied AFTER first paint means
   the store's own name flashes as "Gate City" first. Awaiting it here costs one
   request against a Worker route and removes that flash.

   ⚠️⚠️ SIGNED OUT USED TO MEAN DEFAULTS FOREVER, AND THAT WAS A BUG (fixed
   Aug 15 2026). This paragraph used to say re-applying after sign-in was "a
   later refinement rather than a gap — the app re-renders on sign-in anyway".
   Re-rendering reads LIVE, and when this call bails on a missing token LIVE was
   never populated, so every render after sign-in was just as wrong as the
   first. The whole session ran on Gate City's settings.
   ⇒ `App.jsx` calls `loadStoreConfig` again the moment a PIN is accepted. The
   `applied` flag in that module makes this call the only one that does any work
   in the ordinary case. See storeConfigLoad.js for the full story. */

loadStoreConfig().finally(() => {
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
