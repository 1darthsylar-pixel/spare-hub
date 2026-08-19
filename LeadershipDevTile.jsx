import React, { useState, useEffect } from "react";
import { kvGet, kvSet } from "./store.js";
import { leadershipDevNames, STORE } from "./storeConfig.js";
import LeadershipDev from "./LeadershipDev.jsx";
import Leadership101 from "./Leadership101.jsx";
import TrainerOrientation from "./TrainerOrientation.jsx";

// ============================================================
// LeadershipDevTile.jsx — Gate City Hub · People & Team
// Bri's tile. Three tabs: Roster (coaching + pipeline), L101,
// and Trainer Orientation.
// Split out of the old combined LeadershipTile so EOS and
// Leadership Development are separate, owner-aligned tiles.
//
// ★ RELEASE IS BRI'S SWITCH NOW, NOT A CODE CONSTANT.
// This used to read `const RELEASED = false`, so the decision to
// open her own tile to the other directors required a deploy —
// hers by rights, routed through Matt purely because it lived in
// a file. It now reads `ld:released` from storage and she flips
// it herself from the header. The constant below is only the
// value used before anyone has ever set it.
//
// ⚠️ TRAINER ORIENTATION IS THE SAME COMPONENT AS LEADERSHIP 101,
// running under a different program config (see TrainerOrientation.jsx).
// It therefore inherits this tile's access rules, her editing rights,
// its own PIN and its own progress automatically — nothing here needs
// to know it is a second program. A third one is one more line below.
//
// App renders as <Component tier={tier} user={user} />.
// ============================================================

const C = {
  ink: "#171C26",
  sub: "#5B6472",
  paper: "#F4F6F8",
  card: "#FFFFFF",
  line: "#E3E7EC",
  red: "#DD0031",
  green: "#0F766E",
};

const RELEASE_KEY = "ld:released";
const RELEASE_DEFAULT = false;              // only until she sets it once
/* Hannah and Nick added Aug 9 2026 — Hannah asked directly ("Leadership
   development is locked for me. I need access"), Matt added Nick in the same
   breath. Checked against the live roster before adding, because this gate
   matches on a NAME and a drifted spelling here is a silent lockout with no
   error anywhere: `gcfcr-hr-team-v1` holds them as exactly "Hannah"
   (tm21) and "Nick" (tm37).
   ⚠️ This grants PRE-RELEASE VISIBILITY ONLY, which is what was asked for. It
   does not widen who can flip the release switch: `canRelease` below already
   admits them by ROLE (Executive Director | HR, and Owner), so their power is
   unchanged either way.
   ⚠️ NAMES, NOT IDS, AND THAT IS THE KNOWN FLAW — the note below says so, and
   CLAUDE.md's rule is ids because names drift between the chart and HR. Left as
   names to match the file rather than half-migrate one list; the id move
   belongs with the wider routing-on-id work. */
/* ★★ BOTH LISTS MOVED TO storeConfig.js AS owners.leadershipDev (Aug 11 2026),
   with the reasoning above kept beside them there. They were the last hardcoded
   access lists in the repo, and they were Gate City's four people BY NAME
   compiled into the JavaScript a second store would ship.

   ⚠️ CALLED, NOT CAPTURED. A const here would freeze the default the moment
   this module imports, before a store's saved settings arrive — the same trap
   that made `allowIds` in App.jsx unfollowable. Every use site below asks.

   ⚠️ STILL NAMES, NOT IDS. The comparison is against `user.name` and always
   has been; the note above calls that the known flaw and defers the id move.
   Relocating the list without changing what it is compared against keeps this
   a move rather than a half-migration.

   ⚠️ A CLONE GETS BOTH EMPTY AND NEEDS TO DO NOTHING. Empty means the tile
   stays locked until their own executive releases it — `canRelease` still
   admits by ROLE — and from that moment the role test admits their directors.
   Fails closed in every direction. */
const RELEASED_MIN_TIER = 3;

const norm = (s) => String(s || "").trim().toLowerCase();

// ⚠️ ROLE, NOT JUST A NAME LIST. Bri's own rule for L101 edit rights was that
// they follow the ROLE so a newly promoted Director gets them without a code
// change — the hardcoded DIRECTORS list has exactly the problem she was trying
// to avoid. The list stays as well, so nobody who has access today loses it.
const DIRECTOR_ROLES = new Set([
  "owner", "owner/operator", "executive director", "executive director | hr",
  "human resources", "leadership development director", "director", "leadership director",
]);

const hasAccess = (tier, user, released) => {
  const name = norm(user && user.name);
  if (released) {
    return (tier ?? 0) >= RELEASED_MIN_TIER
      && (DIRECTOR_ROLES.has(norm(user && user.role)) || leadershipDevNames("directors").includes(name));
  }
  return leadershipDevNames("allowed").includes(name);
};

// Who may flip the switch. Deliberately NARROWER than who can see the tile once
// it's open — releasing it is a decision, not a side effect of having access.
const canRelease = (user) =>
  leadershipDevNames("allowed").includes(norm(user && user.name))
  || ["leadership development director", "executive director", "executive director | hr", "owner"]
       .includes(norm(user && user.role));

function LockedScreen({ released }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: C.paper }}>
      <div className="rounded-xl p-8 text-center max-w-sm" style={{ backgroundColor: C.card, border: `1px solid ${C.line}` }}>
        <div className="text-3xl mb-3">🔒</div>
        <div className="font-bold mb-1" style={{ color: C.ink, fontFamily: "'Archivo', sans-serif" }}>
          Leadership Development
        </div>
        <div className="text-sm" style={{ color: C.sub, fontFamily: "'Inter', sans-serif" }}>
          {/* The old copy said "limited to Matt and Bri until launch" even after
              launch, because nothing here knew whether it had launched. */}
          {released
            ? "This tile is for the director team."
            : "Still being built — it'll open to the director team when it's ready."}
        </div>
      </div>
    </div>
  );
}

/* ⚠️ THE DEFAULT `user` IS A GATE, NOT A LABEL. See LeadershipDev.jsx. */
export default function LeadershipDevTile({ tier = 3, user = { name: "" } }) {
  const [tab, setTab] = useState("people");
  // null = still reading. Rendering the locked screen during the read would
  // flash "you can't see this" at a director every time they open the tile.
  const [released, setReleased] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const v = await kvGet(RELEASE_KEY);
        if (live) setReleased(typeof v === "boolean" ? v : RELEASE_DEFAULT);
      } catch {
        // A storage blip must not silently open a tile that isn't meant to be
        // open — fail to the default, which is closed.
        if (live) setReleased(RELEASE_DEFAULT);
      }
    })();
    return () => { live = false; };
  }, []);

  const flip = async () => {
    const next = !released;
    const msg = next
      ? "Open Leadership Development to the director team?"
      : "Close Leadership Development again? Only you and Matt will be able to open it.";
    if (!window.confirm(msg)) return;
    setSaving(true);
    setReleased(next);
    // kvSet returns false on a refused write, never throws — the old catch
    // could not fire, so a failed flip left the screen showing a state the
    // store never took. The revert now actually runs.
    if (!(await kvSet(RELEASE_KEY, next))) setReleased(!next);
    setSaving(false);
  };

  if (released === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.paper }}>
        <div className="text-sm" style={{ color: C.sub, fontFamily: "'Inter', sans-serif" }}>Loading…</div>
      </div>
    );
  }

  if (!hasAccess(tier, user, released)) return <LockedScreen released={released} />;

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.paper, color: C.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Inter:wght@400;500;600&display=swap');
        .ldt-display { font-family: 'Archivo', sans-serif; }
        .ldt-body { font-family: 'Inter', sans-serif; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      <div className="max-w-4xl mx-auto px-4 pt-6 ldt-body">
        <div className="flex items-start gap-3 flex-wrap">
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <div className="text-xs font-semibold tracking-widest uppercase" style={{ color: C.red }}>
              {STORE.appName} · People &amp; Team
            </div>
            <h1 className="ldt-display text-2xl" style={{ fontWeight: 800 }}>Leadership Development</h1>
          </div>

          {canRelease(user) && (
            <button onClick={flip} disabled={saving}
              className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
              style={{ border: `1px solid ${released ? C.green : C.line}`,
                backgroundColor: released ? "#DCFCE7" : C.card,
                color: released ? C.green : C.sub, cursor: saving ? "default" : "pointer",
                opacity: saving ? 0.5 : 1, fontFamily: "'Inter', sans-serif" }}>
              {released ? "Open to directors" : "Not released yet"}
            </button>
          )}
        </div>

        {/* ⚠️ SAYS WHAT THE SWITCH DOES, NOT WHO IT LETS IN BY NAME. This read
            "Hannah and Kyleeka can open this tile" and "Only you and Matt",
            which is four Gate City people written into a sentence a second
            store would read on their own screen about their own leaders. The
            wording now describes the two states, which is what the person
            pressing it actually needs to know and is true at any store. */}
        {canRelease(user) && (
          <div className="text-xs mt-2" style={{ color: C.sub }}>
            {released
              ? "Every director can open this tile. Tap the button to close it again."
              : "Only the people on the pre-release list can open this tile. Tap the button when you're ready for the other directors to see it."}
          </div>
        )}

        <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
          {[
            ["people", "Roster"],
            ["l101", "Leadership 101"],
            ["orientation", "Trainer Orientation"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap"
              style={
                tab === key
                  ? { backgroundColor: C.ink, color: "#fff" }
                  : { backgroundColor: C.card, color: C.sub, border: `1px solid ${C.line}` }
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "people" && <LeadershipDev user={user} embedded />}
      {tab === "l101" && <Leadership101 user={user} embedded />}
      {tab === "orientation" && <TrainerOrientation user={user} embedded />}
    </div>
  );
}
