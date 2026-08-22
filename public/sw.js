/*
  Hub service worker.

  ⚠️ NO STORE NAME ANYWHERE IN THIS FILE, AND IT IS A RULE, NOT A STYLE CHOICE.
  This file is served VERBATIM from public/. The Worker rebrands HTML on the way
  out and generates the manifest per store, but it returns anything that is not
  text/html untouched — so a store name written here is the ORIGIN store's name,
  shipped to every clone, with nothing able to swap it. Found Aug 12 2026 while
  checking why the origin store's name was still reaching a second store.

  ⚠️ THAT APPLIES TO THE COMMENTS TOO, WHICH IS EASY TO MISS. Everywhere else in
  this repo a comment is stripped by the bundler and never leaves the build.
  This file is not bundled, so every word here is downloadable text at every
  store. Naming the origin store in a comment would break the rule the comment
  is stating.

  Deliberately conservative: this app deploys often and must NEVER serve a
  stale build. Strategy:
    - HTML / navigations: NETWORK-ONLY, with a plain offline NOTICE on failure.

      ⚠️ v2 kept a copy of index.html as an offline fallback and served it when
      the network failed. That is what produced a BLANK HOME-SCREEN APP on
      Jul 26 while the same URL loaded fine in the browser: index.html is the
      only UNHASHED file in the build, so a cached copy from an older deploy
      points at Vite asset filenames that no longer exist. The scripts 404,
      React never mounts, and the person gets a grey screen with no header and
      nothing to act on.

      A blank screen is the worst possible failure — it is indistinguishable
      from the app being broken, and it strands whoever is mid-shift. Opening
      offline was never worth much here anyway: every screen in the Hub reads
      remote data, so an "offline" launch shows empty tiles at best. Traded
      away deliberately.
    - Static assets (Vite's hashed JS/CSS, icons): STALE-WHILE-REVALIDATE.
      Hashed filenames change per build, so this is safe and fast.
  Bump CACHE_VERSION on any change to this file to retire old caches.
*/
// ⚠️ BUMPED v2 → v3 ON PURPOSE. activate deletes every cache not matching the
// current version, so this bump is what PURGES THE POISONED SHELL from devices
// that already have one. Without the bump, the bad copy survives the fix.
// ⚠️ v3 → v4 Aug 12 2026, following this file's own standing rule at the top:
// bump on ANY change here. Nothing about this edit poisons a cache — it changed
// two strings and some comments — so the honest reason is the rule, not a
// finding. The cost is one re-fetch of icons and already-hashed assets per
// device, and deciding a written rule does not apply this once is exactly how
// the poisoned shell survived a fix before.
const CACHE_VERSION = "gch-v4";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
// SHELL_CACHE is gone — nothing writes it and nothing reads it. Left out
// rather than emptied so it cannot be reintroduced by accident.

// Never cache API traffic or the doc proxy — always live.
const BYPASS = [/^\/api\//, /^\/docs\//];

self.addEventListener("install", (event) => {
  // Take over as soon as installed; don't wait for old tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isBypass(url) {
  return BYPASS.some((re) => re.test(url.pathname));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET; let the network deal with everything else.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Same-origin only. Cross-origin (Supabase, CDNs) goes straight to network.
  if (url.origin !== self.location.origin) return;

  // API and document-proxy routes are never intercepted.
  if (isBypass(url)) return;

  // Navigations / HTML documents → network-first.
  const isHTML =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isHTML) {
    event.respondWith(
      (async () => {
        try {
          // Nothing is cached here. The live document is the only document.
          return await fetch(req);
        } catch (err) {
          /* Say so, in words, instead of rendering a shell that may be dead.
             Served as a real 200 so the browser paints it rather than showing
             its own error page, and it reloads itself when the tab is revisited
             so the person does not have to know to pull-to-refresh. */
          return new Response(
            `<!doctype html><meta charset="utf-8">` +
            `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
            /* The tab and task-switcher label for this notice. It says what the
               page says rather than naming the store, because this file cannot
               know which store it is running at. */
            `<title>Can\u2019t reach the Hub</title>` +
            `<body style="margin:0;font:16px -apple-system,system-ui,sans-serif;background:#13293F;color:#fff;` +
            `display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center">` +
            `<div style="padding:28px;max-width:320px">` +
            `<div style="font-size:17px;font-weight:800;margin-bottom:8px">Can\u2019t reach the Hub</div>` +
            `<div style="opacity:.75;line-height:1.5">Check your connection. This page will reload itself when you come back.</div>` +
            `</div>` +
            `<script>addEventListener("visibilitychange",function(){if(!document.hidden)location.reload()})<\/script>`,
            { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
          );
        }
      })()
    );
    return;
  }

  // Static assets → stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })()
  );
});

/*
  Web push — iOS 16.4+ delivers this to home-screen-installed PWAs, no App
  Store required. Wire the subscription to your existing notify worker when
  you're ready to turn it on; the handlers below are inert until you do.
*/
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Hub", body: event.data ? event.data.text() : "" };
  }
  /* ⚠️ THESE TWO FALLBACKS ARE ALMOST NEVER REACHED, WHICH IS WHY A PLAIN WORD
     IS THE RIGHT ANSWER AND NOT A COMPROMISE. Checked rather than assumed: all
     18 push call sites in worker.js pass their own `title`, and sendPush always
     JSON-encodes the payload, so `data.title` is set on every real push. These
     fire only for a malformed payload the Worker does not send.

     ⚠️ AND THE STORE'S NAME IS ALREADY ON THE NOTIFICATION ANYWAY. The OS draws
     the app name above the title from the WEB MANIFEST, and the Worker builds
     that per store at /manifest.webmanifest. So the store is named correctly on
     every notification without this file knowing anything about it.

     ⚠️ A PER-STORE VALUE HERE WAS CONSIDERED AND REJECTED. It would mean caching
     the manifest name at install and reading it back inside the push handler —
     roughly ten lines, in the one file where a mistake takes the installed app
     down for everybody, to improve a branch that does not run. Rule 4. */
  const title = data.title || "Hub";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/* 🐛🐛 THE TAP USED TO CLOSE THE NOTIFICATION AND MOVE NOTHING. Matt, Aug 22
   2026, off a watch photo of the scheduled-jobs alert: "When I open on my phone
   it disappeared. When opening it should take you to the message."

   ⛔⛔ THE OLD LINE WAS `if (client.url.includes(target) && "focus" in client)
   return client.focus();` and **every URL contains "/"**. With the target
   defaulted to "/" the first open Hub window matched every single time, so the
   notification closed, an old tab took focus, and nothing navigated. The
   message was gone and you were looking at whatever you had been looking at.
   ⇒ That is exactly "it disappeared".

   ⚠️⚠️ AND FOCUS ALONE COULD NOT HAVE WORKED EVEN WITH A REAL TARGET. `App.jsx`
   reads `?to=` in a `useEffect` with an EMPTY dependency list, so it fires on
   MOUNT and never again. Focusing a tab that is already mounted re-runs
   nothing at all. `client.navigate()` is the whole difference.

   ⚠️ NAVIGATE IS TRIED, NEVER REQUIRED. It is unavailable on some clients and
   rejects on a cross-origin target; either way the focus below still runs, so
   the worst case is the old behaviour rather than a dead tap.
   ⚠️ ONE WINDOW, NEVER A SECOND. `openWindow` only runs when there was nothing
   to navigate — a notification that spawns a duplicate tab every time is its
   own complaint.
   ★ `pushTap.test.mjs` RUNS this handler against fake clients, because a grep
   cannot tell you whether a tap moves. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if (!("focus" in client)) continue;
        if ("navigate" in client) {
          try { await client.navigate(target); } catch (e) { /* focus still helps */ }
        }
        return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })()
  );
});
