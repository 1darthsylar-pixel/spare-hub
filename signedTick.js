/* ══════════════════════════════════════════════════════════════════════════
   signedTick.js — "I JUST SIGNED SOMETHING." ONE SENTENCE, SAID ONCE.

   🐛 THE BUG THIS EXISTS FOR. Bri, Aug 21 2026, reported the red digit on the
   People card carried no wording. That half was fixed in #871. The half left
   behind is worse for the person holding the phone: they sign the document
   they were told to sign, go back to the home screen, and the red number is
   still there. It stays until the page is reloaded.

   ⇒ Nothing is broken underneath. The signature really is stored. The home
   screen's count comes from /api/my-docs, and that read only re-runs when
   `user` changes. Signing does not change `user`. So the screen is showing a
   true answer to a question it asked before the signature existed.

   ⚠️⚠️ AND "IT DID NOT SAVE" IS EXACTLY WHAT IT LOOKS LIKE. That reading is
   not a stretch, it is the obvious one, and this area already has a history of
   it: every signature here once failed for real with a permission error
   wearing a network error's clothes. Somebody who lived through that and now
   sees the number stay put has no way to tell the two apart.

   ⛔ THE CAUSE IS THAT NO SIGNAL EXISTS, so that is what this file adds. Not a
   poll, not a refresh button, not "reload after signing" written into two
   screens and forgotten in the third. One sentence, published once, by
   whichever screen recorded the signature.

   ⚠️ IT IS A LEAF ON PURPOSE — no imports, no React, no browser. `checks/`
   runs plain `node`, so anything that decides behaviour has to be reachable
   from there or it is never tested. See `signedTick.test.mjs`.

   ⚠️ IT CARRIES NO DATA, AND THAT IS DELIBERATE. It does not say WHICH
   document, or how many are left. A count sent from the screen that did the
   signing is a guess about the server's state, and a wrong red number is the
   thing being fixed. This says only "ask again", and the answer still comes
   from /api/my-docs.
   ══════════════════════════════════════════════════════════════════════════ */

/* Monotonic, never reset. A subscriber that compares against its own last
   value can therefore never miss a bump it slept through, and React re-renders
   on a changed number without needing the value to mean anything. */
let ticks = 0;

/* A Set, not an array, so a component that subscribes twice through a double
   mount does not get told twice. */
const listeners = new Set();

/** How many signatures have been announced this page load. Tests read it;
    nothing in the app should need it. */
export const signedCount = () => ticks;

/* ⚠️ ONE LISTENER THROWING MUST NOT SILENCE THE REST. A subscriber is a screen,
   and screens fail in ways that have nothing to do with the next screen along.
   The whole point of this file is that a signature reaches EVERY count that
   cares, so a bad listener costs its own update and no one else's. */
export function markSigned() {
  ticks += 1;
  for (const fn of Array.from(listeners)) {
    try { fn(ticks); } catch { /* one deaf screen, not all of them */ }
  }
  return ticks;
}

/** Subscribe. Returns the unsubscribe, so a React effect can return it
    directly. Ignores anything that is not a function rather than throwing,
    because a broken caller here would take down the screen it is mounted in.
    ⚠️ The unsubscribe is safe to call twice — Set.delete on a missing member
    is a no-op, and a cleanup running twice is normal in development. */
export function onSigned(fn) {
  if (typeof fn !== "function") return () => {};
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Test-only reset. Nothing in the app calls this: the counter is meant to
    outlive every screen for the whole page load. */
export function __resetSignedTick() {
  ticks = 0;
  listeners.clear();
}
