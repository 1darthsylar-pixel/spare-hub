/* ══════════════════════════════════════════════════════════════════════════
   ScheduleConsole.jsx — the Hub's "Lineup"

   ★ THE SYSTEM IS CALLED LINEUP (Matt, Aug 14 2026: "Lineup."). One name over
   the schedule, the daily setup board and the labor planner. A lineup is both
   the week and who stands where today, which is exactly the two halves.
   ⚠️ THE FILENAME AND THE COMPONENT NAME DID NOT CHANGE, on purpose. Renaming
   the file would churn every import for a label, and this repo already warns
   that a filename never equals a component name. The brand lives in App.jsx's
   tile registry, which is the only place a person ever reads it.

   THE LEADER SIDE OF THE SCHEDULING PLATFORM. Matt, Aug 13 2026: "for the 2
   tools. one should be for availabilty and shift swaps only. the other for
   everything else."

     Tile 1  "Lineup · My Shifts"  → Availability.jsx, mode="team"
                                     when can I work · drop and pick up
     Tile 2  "Lineup"  (this file) → everything else

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ THIS FILE IS A TAB BAR AND NOTHING ELSE. Keep it that way.
   ────────────────────────────────────────────────────────────────────────
   It owns no state worth the name, reads no key, and does no maths. Both
   halves are components that already worked before it existed and that still
   work when mounted anywhere else.

   That is rule 16 on purpose. The obvious way to do this split was to cut the
   Skills, Time off and School panels out of Availability.jsx and paste them in
   here — about six hundred lines of working screen, each one wired to a shared
   roster, a shared load and a shared save path. Every one of those wires is a
   chance to ship a panel that renders and does nothing, which is check 3's
   signature symptom and the hardest kind of bug to see in review. A shell
   costs nothing and cannot cause it.

   ⚠️ EACH HALF LOADS ITS OWN DATA, and that is the honest trade. Opening both
   tabs reads the roster twice. The alternative is a shared parent holding
   every key for both halves, which is the six-hundred-line rewrite above. If
   this ever matters, the fix is a shared loader — not a merge of the two
   screens.

   ⚠️ ACCESS IS UNCHANGED AND IS NOT DECIDED HERE. `tier` and `user` pass
   straight through, and each half applies exactly the gates it applied before:
   ScheduleBuilder still checks `owners.tileAllow.scheduleEdit` before it will
   build or save, and still checks `owners.payAccess` before it shows a dollar.
   Do not add a gate to this file — a gate in two places is a gate nobody can
   reason about.
   ══════════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { CalendarRange, SlidersHorizontal } from "lucide-react";
import Availability from "./Availability.jsx";
import ScheduleBuilder from "./ScheduleBuilder.jsx";

const INK = "#13293F";

const VIEWS = [
  ["build", "Build the week", CalendarRange],
  ["inputs", "Set up", SlidersHorizontal],
];

export default function ScheduleConsole({ tier, user }) {
  const [view, setView] = useState("build");

  return (
    <div>
      {/* ⚠️ SAME FIX AS THE TAB STRIP IN Availability.jsx, and it is here even
          though two tabs fit today: this row sits directly above that one, the
          App root clips anything wider than the screen with no way to scroll to
          it, and a third tab added later would vanish on a phone rather than
          look wrong. See the long note there. */}
      <div className="mb-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {VIEWS.map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={"inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium "
              + (view === id ? "text-white" : "bg-white text-slate-600 border border-slate-200")}
            style={view === id ? { background: INK } : null}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ⚠️⚠️ BOTH ARE MOUNTED AND UNMOUNTED, NEVER HIDDEN WITH CSS. Each one
          loads on mount and saves on its own; keeping a hidden copy alive would
          leave two components holding two versions of the same record, and the
          stale one would win the next time somebody pressed Save. */}
      {view === "build" ? <ScheduleBuilder tier={tier} user={user} /> : null}
      {view === "inputs" ? <Availability tier={tier} user={user} mode="leader" /> : null}
    </div>
  );
}
