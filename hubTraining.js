/* ═══════════════════════════════════════════════════════════════════
   hubTraining.js — THE FIVE HUB TRAINING DECKS. One source, two callers.

   ★ WHY THIS FILE EXISTS.
   The deck list lived inside TrainingSite.jsx. Then App.jsx needed the
   same list, to know which deck to REQUIRE of someone on their first
   sign-in (Matt, Aug 10 2026: "make it a requirement or to do first,
   everyone's first login"). Two copies of "which deck is yours" would
   drift, and the drift would be silent: the tile would offer one deck
   while the gate demanded another, and the person would watch the wrong
   video and still be blocked. Same reasoning as orgSeats.js and
   boardOwner.js.

   ⚠️ KEEP IT A LEAF. NO IMPORTS, EVER. Not React, not store.js, not
   hrRoster.js. `deckFor` takes rank and tier as plain numbers precisely
   so this file never has to reach for the roster — each caller resolves
   identity with whatever it already imports. The moment this pulls
   something in, it stops being safely importable from both sides.
   ═══════════════════════════════════════════════════════════════════ */

/* ⚠️ NO `.html` ON THESE HREFS. Measured Aug 10 2026 against production:
   `/training-director.html` answers **307** to the extension-less path, while
   `/training-director` answers **200** and serves a byte-identical deck. Every
   tap was paying a redirect, on store wifi, for nothing. Same finding already
   written into OnboardingLauncher.jsx for the onboarding link.
   ⚠️ Do NOT "tidy" these to match the filenames on disk. Those still end in
   .html; these are URLs, and the clean URL is the fast one. */

/* ⚠️ `covers` IS THE TILE LIST FOR THAT LEVEL, TAKEN FROM App.jsx's SECTIONS,
   AND `desc` IS BUILT FROM IT so the two can never disagree. Rechecked Aug 10
   2026 and it had drifted badly: Team Member taught "Food Safety · Waste
   Tracker" and BOTH ARE TIER 2, and Director taught TeamDocs, which had been
   deleted from the repo. Fourteen live tiles were covered by nothing.
   ⇒ When a tile is added to SECTIONS in App.jsx, add it here. That is the
   whole maintenance rule. */

/* ⚠️ TWO DIFFERENT GATES, AND EACH IS THE RIGHT INSTRUMENT FOR ITS DECK.
   · The first two gate on TIER, because tier is what opens the tiles they
     teach, and it already picks up the `allow`-listed trainers.
   · The top three gate on RANK, because tier cannot tell them apart:
     roleTier() is `rank >= 6 ? 3 : rank >= 3 ? 2 : 1`, so Leadership
     Development Director, Executive Director and Owner all collapse into
     tier 3.

   🐛 AND THE OLD PURE-TIER TEST LOCKED DIRECTORS OUT OF DIRECTOR TRAINING.
   Measured in the browser signed in as Brandon: only TEAM MEMBER and LEADER
   appeared. "Director" is rank 5, and tier 3 starts at rank 6, so the deck
   built for that title was invisible to everyone holding it — Brandon and
   Daisy. The tiles never showed this because the Director-only ones carry
   `allow: ["Director"]` as a named exception; the deck list had no such
   escape. Hence `minRank: 5`.
   ⚠️ Do NOT "simplify" these back to a single test. */
export const HUB_DECKS = [
  /* ⚠️ EMPTY ON PURPOSE, AND EMPTY IS A WORKING STATE. The origin store's five
     deck pages did not come across with this snapshot, and an unknown path here
     answers 200 with the app rather than failing, so a leftover link would open
     a second dashboard instead of a video. Empty means first sign-in asks for
     nothing at all, which is the right behaviour until this store has decks of
     its own. Add them here when it does; the shape of an entry is in the origin
     repo's copy of this file. */
].map((d) => Object.assign({}, d, { desc: d.covers.join(" · ") }));

/** Every deck this person may watch, highest last. `tier` may be undefined
    (admin preview), which shows all of them — the behaviour the tile had. */
export function decksFor(rank, tier) {
  if (typeof tier !== "number") return HUB_DECKS;
  const r = Number(rank) || 0;
  return HUB_DECKS.filter((d) => (d.minRank ? r >= d.minRank : d.tier <= tier));
}

/** The ONE deck this person is required to watch: the highest they can see.
    ⚠️ Highest, not lowest. Each deck says at its start that it assumes the
    ones below it, and a Director being made to sit through Team Member
    training would be the fastest way to make this gate resented. Returns
    null only if somehow nothing matches, and the caller must treat null as
    "nothing to require" rather than as a reason to block. */
export function requiredDeck(rank, tier) {
  const list = decksFor(rank, typeof tier === "number" ? tier : 1);
  return list.length ? list[list.length - 1] : null;
}

/* ⚠️ ONE KEY PER PERSON, DELIBERATELY, NOT ONE MAP KEYED BY ID.
   A single `{id: record}` map would be written by up to 106 browsers, and
   /api/kv-set's member-row merge is an ALLOWLIST of three HR keys
   (MEMBER_ROW_MERGE in worker.js) — a new key falls through to the wholesale
   replace. That is exactly the write that lost Evelyn's documentation: two
   people finishing minutes apart, each sending their own snapshot, second one
   lands on top. Per-person keys cannot race with each other at all, and they
   need no worker change.
   ⚠️ The trade, stated plainly: "who has not done it yet" costs a read per
   person, so a roster view is NOT free here. Nobody has asked for one. If one
   is ever wanted, add a server-side roll-up — do not switch this to a shared
   map. */
export const trainingKey = (id) => `gcfcr-hub-training-${String(id)}-v1`;

/** The stored shape. Keep every field optional on READ — see rule 1. */
export function trainingRecord({ deckKey, name, role }) {
  return {
    deck: deckKey || "",
    at: new Date().toISOString(),
    name: name || "",
    role: role || "",
    v: 1,
  };
}

/** True when a stored record means "this person has watched their deck".
    ⚠️ Guarded rather than trusting the shape: this key is new, so today every
    read is a miss, but a record written by v1 must still read as done after
    the shape grows. Anything object-shaped with an `at` counts. */
export function hasWatched(rec) {
  return !!(rec && typeof rec === "object" && rec.at);
}
