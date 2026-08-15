/* ══════════════════════════════════════════════════════════════════════════
   hrTeam.js — THE ROSTER SEED AND ITS LOADERS, OUT OF HRConsole.jsx.

   ★ NEAR-LEAF. Imports ONLY store.js. Nothing here may import a component.
   App.jsx needs TEAM, the live-roster loaders, the default PIN and the
   handbook exemption during its own first render — and importing them from
   HRConsole.jsx dragged the whole 5,000-line console into the first-paint
   bundle, which is why it could never be lazy. This file is the small door.
   HRConsole re-exports everything below unchanged, so existing importers
   keep working; new code should import from HERE.

   ⚠️ hrRoster.js stays the STRICT leaf (imports nothing, shared with the
   worker). This file needs kvGetResult, so it cannot live there. ══ */
import { kvGetResult } from "./store.js";
/* storeConfig.js imports nothing, so the graph stays a DAG and no cycle is
   possible — cyclecheck proves it on every run. hrRoster.js already imports it
   for the same reason. Nothing else may be added to this import. */
import { isGateCity, handbookExemptIds } from "./storeConfig.js";

/* ═══ EMPTY, AND IT STAYS EMPTY ═══════════════════════════════════════════
   ⚠️⚠️ DO NOT PUT PEOPLE BACK IN HERE. THERE IS NOWHERE ELSE THIS BELONGS.

   This held Gate City's 106 people until Aug 11 2026. It was the BASE the
   roster was built from, and it was compiled into the main JavaScript file
   every visitor to the site downloads WITHOUT SIGNING IN — measured, all 106
   names found in a public chunk. Real people's names and job titles, readable
   by anyone who opened the page, and they would have followed into any second
   store's copy of this code.

   ⇒ THE ROSTER LIVES IN gcfcr-hr-added-v1 NOW, for every store including this
   one. It was moved there through a button in HR Console rather than by hand,
   and the copy was checked before this list was emptied: 110 rows stored, 110
   distinct ids, no incomplete rows, and an md5 over every id, name and role
   identical between the stored copy and the code that used to hold it.

   ⚠️ ITS TWIN WENT AT THE SAME TIME. hrRoster.js HR_SEED_ROLES held id → role
   for the same 106 and is now `{}` as well. They were keyed by the same ids and
   had to go together: emptying one and not the other leaves the Worker
   resolving a title the browser never shows, or the reverse, with neither side
   complaining.

   ⚠️ EMPTY IS SAFE, AND WAS TESTED RATHER THAN ASSUMED. Every reader still
   answers, nothing throws, and `hrIsFullReader` fails CLOSED — an unknown id
   gets no access rather than all of it.

   ⚠️ THE isGateCity() GATE BELOW IS NOW BELT AND BRACES. With this at zero it
   changes nothing, and it is kept deliberately: if anybody ever pastes a seed
   back in for a one-off, the gate stops it reaching a second store. */
const RAW_TEAM = [];

// Every existing "Manager" is now an Assistant Director (spec). HR/Exec title edits layer on top.
const TEAM = RAW_TEAM.map((m) => ({ ...m, role: m.role === "Manager" ? "Assistant Director" : m.role }));

export { RAW_TEAM, TEAM };

export const HR_DEFAULT_PIN = "1234";

/* ★ THE LIST MOVED TO STORE_CONFIG.owners.handbookExempt (Aug 11 2026), with
   Hannah's Jul 23 ruling kept beside it there: "Change Kyleeka's file in HR
   console to handbook signed instead of handbook exempt." Kyleeka is 23; only
   Nick (37) stays exempt.
   ⚠️ READ AT CALL TIME. A `new Set([...])` here would be built when this module
   imports, before a store's saved settings arrive, so a second store would
   exempt whoever happens to hold id 37 on their own roster and nothing they
   saved would change it.
   ⚠️ EMPTY MEANS EVERYBODY SIGNS, which is the safe direction: a store that has
   made no exception asks for a signature rather than quietly skipping one. */
const isHbExempt = (id) => handbookExemptIds().includes(String(id));
export { isHbExempt };

export const ROSTER_ADD_KEY = "gcfcr-hr-added-v1";

// The LIVE roster: seed + anyone added since. Any tool doing a PIN lookup or a
// roster-wide count must use this, not the HR_TEAM seed export, or it will not
// see a single person hired after the Hub went up.
export async function loadHRTeam() {
  return (await loadHRTeamResult()).team;
}
/* Result-style twin for callers that WRITE off the roster. loadHRTeam cannot
   tell "nobody added yet" from "the read failed" — kvGet returns null for
   both — so on a dropped read it hands back the 106-person SEED and looks
   fine. Any publisher that rebuilds a shared record from that (the sign-in
   rank map, Team Docs enrichment) would silently drop everyone hired since
   the Hub went up. ok:false = do not publish, do not stamp ids. */
/* ══════════════════════════════════════════════════════════════════════════
   PREFERRED NAMES — { "<roster id>": "Lupe" }.

   Matt, Aug 7 2026: "Should we add a preferred name or nickname spot to avoid
   confusion" → "seen everywhere".

   ⚠️ A SEPARATE MAP, NOT A FIELD ON THE ROSTER RECORD, and that is forced by
   where the roster comes from. 106 of the people here are the TEAM seed, which
   lives in this file's source — there is no edit path to a seeded person's
   record at all, so a `preferred` typed into HR Console would have nowhere to
   go. This is the same shape gcfcr-hr-roles already uses to override a seeded
   person's title: an id-keyed map, merged on read.

   ⚠️ NOT gcfcr-hr-info, which was the obvious first answer and is wrong. That
   key is on HR_OWN_ROW_ONLY, so a person can only read their OWN row — a
   nickname stored there would be invisible on every screen that shows anyone
   else, which is every screen this was asked for.

   ⚠️ NOT HR-PROTECTED, deliberately. What the store calls somebody is said out
   loud on the floor all day, and this read happens in the same pre-sign-in
   Promise.all as /api/pin-verify. Gating it would stop the sign-in screen, the
   same trap the Jul 31 email fix hit. */
export const ROSTER_PREF_KEY = "gcfcr-hr-preferred-v1";

/* ⚠️⚠️ ONE ROW PER PERSON, FIRST ONE WINS. This exists for the roster
   migration: the 106 people below are moving out of this file and into
   gcfcr-hr-added-v1, and for the window between the write and the deletion
   they are in BOTH. Without this, everybody in the store would appear twice —
   twice on the roster, twice in every count, twice in the HR list.

   ★ IT MAKES THE MIGRATION INVISIBLE, WHICH IS THE POINT. The seed rows and
   the written rows are byte-identical (same id, same name, same role — checked
   across all 106 before any of this was written), so after the copy the screen
   shows exactly what it showed before. That means the risky step and the
   visible step are separated: nothing a leader sees changes until the code
   list is emptied, and if the copy is wrong it can be seen and fixed while the
   code copy is still standing behind it.

   ⚠️ FIRST WINS, AND THE ORDER IS `[...seed, ...added]`, so during the window
   the SEED row is the one kept. Afterwards the seed is empty and the stored
   row is kept. Identical either way, and that is checked rather than assumed.

   ⚠️ A ROW WITH NO id IS DROPPED, not kept under "". An id is how every HR
   record in the Hub is keyed — evaluations, PINs, files. A row that cannot be
   keyed cannot own any of them, and letting a blank one through would collide
   every such row onto one person.
   ★ MODULE LEVEL AND PURE (design rule 7). */
function dedupeById(rows) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const out = [];
  for (const m of rows) {
    if (!m) continue;
    const id = String(m.id == null ? "" : m.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(m);
  }
  return out;
}

/* ★★ WHICH SEED PEOPLE ARE NOT YET IN STORAGE — the whole of the migration's
   thinking, in one pure function so it can be tested without a screen.

   The 106 in this file are moving into gcfcr-hr-added-v1 so they stop shipping
   inside the JavaScript every visitor downloads. This answers "what is left to
   copy", which makes the button that calls it idempotent: run it twice and the
   second run has nothing to do.

   ⚠️ COMPARED BY id AND NOTHING ELSE. Names get edited, nicknames get added,
   titles change. The id is the only thing every HR record in the Hub is keyed
   by, so it is the only safe thing to match on. Matching on name would copy
   somebody in twice the day they got married.
   ★ MODULE LEVEL AND PURE (design rule 7). */
export function rosterRowsMissingFromStorage(seed, stored) {
  /* ⚠️ `!m ||` AND NOT `m &&`. `m && m.id == null ? "" : m.id` reads as if it
     guards the null row and does not: when m is null the condition is falsy,
     so it takes the else arm and reads m.id off null. Caught by a test that
     passed a null row, not by eye. */
  const have = new Set(
    (Array.isArray(stored) ? stored : [])
      .map((m) => (!m || m.id == null ? "" : String(m.id)))
      .filter(Boolean),
  );
  return (Array.isArray(seed) ? seed : []).filter(
    (m) => m && m.id != null && String(m.id) !== "" && !have.has(String(m.id)),
  );
}

export async function loadHRTeamResult() {
  /* Both reads at once — this runs on the sign-in path and a second round trip
     there is felt. */
  const [r, p] = await Promise.all([
    kvGetResult(ROSTER_ADD_KEY),
    kvGetResult(ROSTER_PREF_KEY).catch(() => ({ ok: false, value: null })),
  ]);
  const added = r.value;
  /* ⚠️⚠️ THE SEED IS GATE CITY'S 106 PEOPLE, AND ONLY GATE CITY GETS IT.
     This used to be `[...TEAM, ...added]` unconditionally, which meant a second
     store installing the Hub saw Gate City's whole roster by name, permanently,
     with their own team underneath — the hazard this file's header has warned
     about since Aug 7. Everyone else starts empty and imports their team into
     gcfcr-hr-added-v1, which already has a write path through TeamImportBox.

     ⚠️ ASKED HERE AND NOT AT MODULE LEVEL. `TEAM` is built when this file
     imports, before any saved setting has arrived. This loader is async and
     runs after the config boots, so the answer is current. Gating the constant
     instead would capture the default and prove nothing. */
  const seed = isGateCity() ? TEAM : [];
  const base = dedupeById(Array.isArray(added) && added.length ? [...seed, ...added] : seed);

  /* ⚠️ `ok` TRACKS THE ROSTER READ ONLY, NEVER THE NICKNAME READ. Callers use
     ok:false to mean "do not publish, do not stamp ids". A missing nickname map
     is not a failed roster — reporting it as one would stop the sign-in rank
     map and Team Docs enrichment over a cosmetic key. Worst case here is that
     somebody shows up under their full name for one load. */
  const pref = p && p.ok && p.value && typeof p.value === "object" && !Array.isArray(p.value)
    ? p.value : null;
  if (!pref) return { ok: r.ok, team: base };

  return {
    ok: r.ok,
    /* Only the people who HAVE one get a new object. Everyone else is passed
       through by reference, so this stays cheap and TEAM is never mutated. */
    team: base.map((m) => {
      if (!m || m.id == null) return m;
      const v = String(pref[String(m.id)] || "").trim();
      return v ? { ...m, preferred: v } : m;
    }),
  };
}

