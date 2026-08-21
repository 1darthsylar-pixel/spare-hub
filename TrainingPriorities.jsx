/* ══════════════════════════════════════════════════════════════════════════
   TrainingPriorities.jsx — the order this store develops people in, and
   whether the board may fill a training row on its own.

   Matt, Aug 14 2026: "can the schedule and setup auto fill the training
   positions for people when assigned to different ones? I also have a training
   priorities doc for front and back in my drive", then "Add both options".

   ⚠️ THE RULES ARE IN trainingPriorities.js AND NOTHING HERE REPEATS THEM.
   This screen loads, shows and saves. The engine reads the same module, so what
   a leader sees here and what the week is built against cannot disagree. Same
   split as StoreHours.jsx and storeHours.js, for the same reason.

   ⚠️ NOTHING IS PRE-FILLED. Gate City's list is Drinks, Desserts, Inside expo,
   Window, Bagging DT, Bagging FC, Register FC, Dining Room, Ipos — and it is
   not in this file, not as a value and not as a placeholder. A placeholder is a
   seeded value wearing a disguise: it travels into the next store's repo and it
   gets believed. Rule 18. The store pastes its own, once.

   ★ IT CHECKS EACH PRIORITY AGAINST THE REAL STATIONS, and that is the one
   thing here worth more than a text box. A priority pointing at a station this
   store does not have trains nobody, silently, for ever — the save is green,
   the list looks right, and the engine simply never matches it. Those rows are
   called out rather than accepted.
   ══════════════════════════════════════════════════════════════════════════ */
import { useMemo, useState } from "react";
import { GraduationCap, AlertTriangle, Check } from "lucide-react";
import { CARD_3D, CARD_3D_SOFT, cardSurface, accentEdge, sectionTint, shade } from "./cardStyle.js";
import { sectionsOf } from "./storeConfig.js";
import {
  TRAINING_SIDES, MODES, MODE_LABEL,
  readTraining, setList, setMode, parseList, mergeCodes, unmergeCode, moveInList,
} from "./trainingPriorities.js";
import { normCode } from "./jobCodes.js";

const INK = "#13293F", GRAY = "#6B7480", RED = "#B91C1C", GREEN = "#1F6F4A";
/* ⚠️ AMBER IS "NOT YET", RED IS "WRONG", AND THE DIFFERENCE IS THE WHOLE POINT
   OF THIS FILE'S ONE WARNING. A priority naming a station the store has not
   built yet is a plan, not a mistake — see the note at the warning itself.
   `AMBER` fills the number badge, `AMBER_TEXT` is the darker one that stays
   readable as small text on white. RED is kept for the paste error, which IS a
   mistake. */
const AMBER = "#B45309", AMBER_TEXT = "#92400E";
/* ⚠️ TWO TEALS, AND THE SECOND ONE IS NOT DECORATION. A gradient needs a darker
   end to read as a lit surface rather than a flat fill, and picking that darker
   end at each call site is how the same badge ends up three slightly different
   colours across one screen. One pair, named once. */
const ACCENT = "#0E7490", ACCENT_DEEP = "#0B5566";

/* Every station name this store actually runs on one side → the SECTION it sits
   in, normalised the same way a priority is. Module level, outside the
   component, so it can never be read in its own temporal dead zone by a useMemo
   body. Rule 7.

   ★ IT RETURNS A Map RATHER THAN A Set because the answer is now two questions
   at once: does the store run this station (`.has`), and where does it sit
   (`.get`). A second pass to work out the section would be a second way to walk
   the same data, and those drift — rule 8.

   ⚠️ FIRST DAY WINS for a station that is listed under two sections on two
   different days. That is a store-data mistake rather than something to render
   twice, and picking one quietly beats colouring the row differently depending
   on which day the loop happened to reach first. */
function stationSections(stations, side) {
  const byDay = stations && stations[side] && typeof stations[side] === "object" ? stations[side] : {};
  const out = new Map();
  Object.keys(byDay).forEach((day) => {
    (Array.isArray(byDay[day]) ? byDay[day] : []).forEach((st) => {
      const n = normCode(st && st.name);
      if (!n || out.has(n)) return;
      out.set(n, String((st && st.section) || "").trim() || "OTHER");
    });
  });
  return out;
}

/* The row's colour, from the section its station sits in.

   ⚠️⚠️ THE SAME COLOUR THE BOARD PAINTS THAT SECTION, and that is the whole
   reason it is worth doing. A leader who knows FRONT COUNTER is the blue block
   on the setup board can see at a glance that four of their top five priorities
   are all in it. Two independent palettes would have made this decoration; one
   shared one makes it information. `sectionsOf` is the shared order, `sectionTint`
   the shared palette, and neither lives in this file.

   ⚠️ A STATION THE STORE DOES NOT RUN HAS NO SECTION, so it gets no tint and
   falls through to the amber "not on your board yet" treatment instead. Giving a
   planned position a confident colour would say it belongs to an area nobody has
   put it in. */
function rowTint(code, sections, order) {
  const sec = sections.get(code);
  if (!sec) return "";
  const at = order.indexOf(sec);
  return at < 0 ? "" : sectionTint(at);
}

/* A small solid disc that reads as lit rather than flat — the rank badges, the
   header icon and the mode tick all want it.

   ⚠️⚠️ RADIAL FROM THE TOP-LEFT, NOT A `linear-gradient(145deg …)`, and that is
   not a style preference. `heroColor.test.mjs` ratchets the number of files
   hand-rolling a gradient at a hero angle, and it counts any 1xx-degree linear
   gradient in a component — a 21px badge trips it exactly like a page header
   would. Writing one here raises a number whose whole job is to only ever fall.
   ⇒ A corner highlight is also just more correct: CARD_3D's insets and
   cardSurface both light from the top-left, so a badge lit from anywhere else
   is a second light source on the same card.

   ★ ONE DEFINITION FOR ALL THREE (rule 8). Three copies of a highlight drift,
   and a drifting highlight is three subtly different discs on one screen. */
const orb = (hue) => ({
  background: hue,
  backgroundImage:
    "radial-gradient(120% 120% at 25% 20%, rgba(255,255,255,.45) 0%, rgba(255,255,255,0) 55%)",
  boxShadow: `0 1px 3px ${hue}59, inset 0 1px 0 rgba(255,255,255,.30)`,
});

export default function TrainingPriorities({ cfg, canEdit, onSave, busy, stations }) {
  const C = useMemo(() => readTraining(cfg), [cfg]);
  const [paste, setPaste] = useState({ FOH: "", BOH: "" });
  const [open, setOpen] = useState("");
  const [note, setNote] = useState("");
  /* Which side is in grouping mode, and which rows are picked. ⚠️ ONE SIDE AT
     A TIME. A pick list spanning both sides could produce a group whose members
     live on different boards, and `familyOf` is asked per side. */
  const [grouping, setGrouping] = useState("");
  const [picked, setPicked] = useState([]);

  /* ⚠️ BUILT FROM `stations`, NEVER NAMED HERE. Another store's screen checks
     against its own building. */
  const known = useMemo(() => ({
    FOH: stationSections(stations, "FOH"),
    BOH: stationSections(stations, "BOH"),
  }), [stations]);

  /* The section order each side's colours index into. Side-wide, the same list
     the setup board uses, so a section is one colour on every screen. */
  const secOrder = useMemo(() => ({
    FOH: sectionsOf((stations || {}).FOH),
    BOH: sectionsOf((stations || {}).BOH),
  }), [stations]);

  /* ★★ THE STORE SAYING "THESE ARE ONE POSITION". Matt, Aug 14 2026, choosing
     this over widening the guess: which stations are one training position is a
     fact about the building, so the store types it once (rule 18).
     ⚠️ THE ROWS ARE NOT LOST. `rawSides` keeps the list as typed, so undoing a
     group really does bring its rows back. */
  const applyMerge = async (side) => {
    if (picked.length < 2) { setNote("Pick at least two rows first."); return; }
    await onSave(mergeCodes(C, side, picked));
    setNote(`${picked.length} rows are now one position.`);
    setPicked([]); setGrouping("");
  };

  const undoMerge = async (side, code) => {
    await onSave(unmergeCode(C, side, code));
    setNote("Split back apart.");
  };

  const togglePick = (code) => setPicked(
    (list) => (list.includes(code) ? list.filter((c) => c !== code) : [...list, code]),
  );

  const applyPaste = async (side) => {
    const { codes, problems } = parseList(paste[side] || "");
    if (!codes.length) {
      setNote(`Nothing readable in that ${side} paste. Nothing was changed.`);
      return;
    }
    await onSave(setList(C, side, codes));
    setPaste((p) => ({ ...p, [side]: "" }));
    setOpen("");
    setNote(
      problems.length
        ? `Saved ${codes.length} for ${side}. ${problems.length} line${problems.length === 1 ? "" : "s"} could not be read and ${problems.length === 1 ? "was" : "were"} left out.`
        : `Saved ${codes.length} for ${side}.`
    );
  };

  /* ⚠️ `boxShadow: CARD_3D`, NEVER `...CARD_3D`. It is a box-shadow STRING, not
     a style object — spreading it sets indexed properties on the
     CSSStyleDeclaration and React throws "Indexed property setter is not
     supported", which takes the whole tab down to the crash boundary. Every
     other card in the repo spells it the way below; I did not, and only driving
     the screen in a browser found it. */
  /* ★ THE CARD CARRIES ITS OWN COLOUR NOW. Matt, Aug 14 2026, looking at this
     screen: "we can still make it look less blah. it needs some color and
     texture." It was white on white with flat grey rows.
     ⚠️ TEAL, NOT THE NEUTRAL NAVY. `ACCENT_NEUTRAL` is the strip for a card with
     nothing to say, and this one has a subject — training. The strip, the icon
     and the surface tint are the same hue on purpose, so the card reads as one
     object rather than a white box with a coloured line on it.
     ⚠️ 0.5 STRENGTH. cardSurface at full strength turns a card this size into a
     coloured block; the note at the function says the caller decides. */
  return (
    <div
      className="rounded-xl bg-white p-4"
      style={{
        boxShadow: CARD_3D,
        backgroundImage: cardSurface(ACCENT, 0.5),
        ...accentEdge(ACCENT),
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        {/* A filled roundel rather than a bare glyph. A 18px line icon on a pale
            card is the definition of blah. */}
        <span
          className="inline-flex items-center justify-center rounded-lg shrink-0"
          style={{ width: 30, height: 30, color: "#fff", ...orb(ACCENT) }}
        >
          <GraduationCap size={17} />
        </span>
        <div className="text-[15px] font-bold" style={{ color: INK }}>Training priorities</div>
      </div>
      <div className="text-xs mb-4" style={{ color: GRAY }}>
        The order to develop people in, front and back. When somebody is put on a station they
        hold no certification for, the board treats it as training and works down this list.
      </div>

      {/* ── the two modes ─────────────────────────────────────────────────
          ⚠️ SAID IN FULL SENTENCES, because one of these puts names on a board
          a leader prints and the difference has to be readable at a glance on a
          store iPad. */}
      <div className="mb-4">
        <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: GRAY }}>
          When it spots a training placement
        </div>
        <div className="flex flex-col gap-2">
          {MODES.map((m) => {
            const on = C.mode === m;
            return (
              <button
                key={m}
                disabled={!canEdit || busy}
                onClick={() => { setNote(""); onSave(setMode(C, m)); }}
                className="flex items-start gap-2 text-left rounded-lg px-3 py-2 border-2 disabled:opacity-60"
                /* ⚠️ THE SELECTED ONE IS RAISED, THE OTHER IS FLAT. A border
                   colour alone is a weak signal on a shared iPad held at arm's
                   length, and this button decides whether names get written onto
                   a printed board on their own. Depth reads before colour. */
                style={{
                  borderColor: on ? ACCENT : "#E3E7EC",
                  background: on ? "#fff" : "#FBFCFD",
                  backgroundImage: on ? cardSurface(ACCENT, 1.1) : "none",
                  boxShadow: on ? CARD_3D_SOFT : "none",
                }}
              >
                <div
                  className="mt-0.5 inline-flex items-center justify-center rounded-full shrink-0"
                  style={on
                    ? { width: 17, height: 17, color: "#fff", ...orb(ACCENT) }
                    : { width: 17, height: 17, color: "#CBD5E1", border: "1.5px solid #E3E7EC" }}
                >
                  <Check size={11} strokeWidth={3.5} style={{ opacity: on ? 1 : 0 }} />
                </div>
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: on ? ACCENT : INK }}>
                    {MODE_LABEL[m]}
                  </div>
                  <div className="text-[11px]" style={{ color: GRAY }}>
                    {m === "suggest"
                      ? "Recommended. The board still belongs to the leader, and nothing prints that nobody agreed to."
                      : "Faster, no tap. The training row is already filled when a leader opens the setup."}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── the two lists ───────────────────────────────────────────────── */}
      {TRAINING_SIDES.map((side) => {
        const list = C.sides[side] || [];
        const have = known[side];
        /* ⚠️ ONLY WARN WHEN THERE IS SOMETHING TO WARN AGAINST. A store that has
           not set its stations up yet has an empty set, and marking every row
           unknown there would be noise about a screen nobody has filled in. */
        const strays = have.size ? list.filter((c) => !have.has(c)) : [];
        return (
          <div key={side} className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: GRAY }}>
                {side === "FOH" ? "Front of house" : "Back of house"}
              </div>
              {canEdit ? (
                <div className="flex items-center gap-3">
                  {list.length > 1 ? (
                    <button
                      onClick={() => {
                        setNote(""); setPicked([]);
                        setGrouping(grouping === side ? "" : side);
                      }}
                      className="text-[12px] font-semibold"
                      style={{ color: grouping === side ? RED : ACCENT }}
                    >
                      {grouping === side ? "Stop grouping" : "Group two into one"}
                    </button>
                  ) : null}
                  <button
                    onClick={() => { setNote(""); setOpen(open === side ? "" : side); }}
                    className="text-[12px] font-semibold"
                    style={{ color: ACCENT }}
                  >
                    {open === side ? "Cancel" : (list.length ? "Replace the list" : "Paste the list")}
                  </button>
                </div>
              ) : null}
            </div>

            {/* ⚠️ IT SAYS WHAT IT IS ABOUT TO DO AND HOW MANY. Folding two rows
                into one changes what the board treats as training, so the count
                and the button are together and neither is a guess. */}
            {grouping === side ? (
              <div className="mb-1.5 flex flex-wrap items-center gap-2 rounded-lg px-2.5 py-2 text-[12px]"
                style={{ background: "#F6F8FA", color: INK }}>
                <span>Tap the rows that are really the same position.</span>
                <span className="font-semibold">{picked.length} picked</span>
                <button
                  onClick={() => applyMerge(side)}
                  disabled={busy || picked.length < 2}
                  className="ml-auto rounded-lg px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-40"
                  style={{ background: INK }}
                >
                  These are one position
                </button>
              </div>
            ) : null}

            {list.length ? (
              <ol className="flex flex-col gap-1.5">
                {list.map((code, i) => {
                  const stray = have.size && !have.has(code);
                  /* The station's own section colour, or amber for one the store
                     does not run. Never both, and never a third state. */
                  const sec = stray ? "" : rowTint(code, have, secOrder[side]);
                  const hue = stray ? AMBER : (sec || ACCENT);
                  const deep = stray ? AMBER_TEXT : (sec ? shade(sec) : ACCENT_DEEP);
                  /* The other rows this one now stands for, if the store has
                     said they are one position. ⚠️ NAMED, NOT COUNTED. "+2" is
                     a number nobody can check; the names are what let a leader
                     see the grouping is right. */
                  const folded = (C.merges[side] || []).find((g) => g[0] === code);
                  const isPicked = picked.includes(code);
                  return (
                    <li
                      key={code}
                      onClick={grouping === side ? () => togglePick(code) : undefined}
                      className={"flex items-center gap-2.5 rounded-lg pl-0 pr-2.5 py-1.5 overflow-hidden bg-white"
                        + (grouping === side ? " cursor-pointer" : "")}
                      /* ⚠️ THE TINT IS THE ROW'S BACKGROUND AND ITS EDGE, at two
                         very different strengths. A row filled at badge strength
                         is a coloured bar and the name stops being readable;
                         cardSurface fades it out across the row so the colour
                         sits under the text rather than behind it. */
                      style={{
                        boxShadow: CARD_3D_SOFT,
                        backgroundImage: cardSurface(hue, 0.9),
                        outline: isPicked ? `2px solid ${INK}` : "none",
                      }}
                    >
                      {/* The section stripe, the same idea as the board's. */}
                      <span className="self-stretch shrink-0" style={{ width: 4, background: hue }} />
                      <span
                        className="inline-flex items-center justify-center rounded-full text-[11px] font-bold shrink-0"
                        style={{ width: 21, height: 21, color: "#fff", ...orb(hue) }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-[13px] font-semibold" style={{ color: INK }}>{code}</span>
                      {folded ? (
                        <span className="flex items-center gap-1.5 text-[11px] shrink-0" style={{ color: GRAY }}>
                          <span>with {folded.slice(1).join(", ")}</span>
                          {canEdit ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); undoMerge(side, code); }}
                              disabled={busy}
                              className="font-semibold disabled:opacity-40"
                              style={{ color: ACCENT }}
                            >
                              split
                            </button>
                          ) : null}
                        </span>
                      ) : null}
                      {/* ⚠️ THE SECTION IS SHOWN, not just painted. Colour alone is
                          not readable by everyone and not readable at all on a
                          printed page, so the name carries the meaning and the
                          colour makes it quick. */}
                      {sec ? (
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider ml-auto shrink-0"
                          style={{ color: deep, opacity: 0.75 }}
                        >
                          {have.get(code)}
                        </span>
                      ) : null}
                      {stray ? (
                        <span className="text-[11px] font-semibold ml-auto shrink-0" style={{ color: AMBER }}>
                          not on your board yet
                        </span>
                      ) : null}
                      {/* ⭐⭐ MOVE THE ROW. Matt, Aug 21 2026: "these training
                          priorities regressed. i had them arranged yesterday."
                          Nothing had regressed — read from the store's own
                          record, no save had happened since Aug 14, because
                          there was no way to reorder. The screen showed a
                          numbered list and offered paste, group and split, so
                          rearranging meant retyping everything.
                          ⚠️ HIDDEN WHILE GROUPING. The row is a pick target in
                          that mode and a control inside it would eat the tap.
                          ⚠️ THE ENDS ARE DISABLED, not wrapped. A list that
                          jumps top to bottom under a mis-tap is worse than a
                          button that does nothing. */}
                      {canEdit && grouping !== side ? (
                        <span className="ml-auto flex items-center gap-0.5 shrink-0 pl-1.5">
                          {[["up", i === 0, "▲"], ["down", i === list.length - 1, "▼"]].map(([dir, off, glyph]) => (
                            <button
                              key={dir}
                              type="button"
                              aria-label={`Move ${code} ${dir}`}
                              disabled={busy || off}
                              onClick={(e) => { e.stopPropagation(); onSave(moveInList(C, side, code, dir)); }}
                              className="rounded text-[10px] leading-none disabled:opacity-25"
                              style={{ color: deep, padding: "3px 4px", cursor: off ? "default" : "pointer" }}
                            >
                              {glyph}
                            </button>
                          ))}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="text-[12px] rounded-lg px-2.5 py-2" style={{ color: GRAY, background: "#F6F8FA" }}>
                Nothing set. Nothing is treated as training on this side until there is a list.
              </div>
            )}

            {/* ⚠️⚠️ THIS USED TO BE RED AND CALLED A MISTAKE, AND MATT'S OWN LIST
                DISPROVED IT. Aug 14 2026: "inside expo is a future position for
                front counter different expo 1 and 2." So a priority naming no
                station is a perfectly ordinary thing — a position the store is
                planning — and a red alarm beside it is the tool telling an
                operator their own plan is wrong.

                ⚠️ IT IS STILL SHOWN, because a typo and a planned position look
                EXACTLY the same from here and nothing in this app can tell them
                apart. So it says the one thing that is true either way: it is
                not on the board yet, and nothing will be marked against it until
                it is. Amber, not red. Naming a state, not scolding.

                ⚠️ AND THE ENGINE ALREADY DID THE RIGHT THING WITH IT. Nobody is
                ever placed on a station that does not exist, so a future
                position simply never fires. It sits in the order, waiting, and
                starts working by itself the day the station is added — which is
                exactly what a leader planning a position would want. */}
            {strays.length ? (
              <div className="flex items-start gap-1.5 mt-1.5 text-[11px]" style={{ color: AMBER_TEXT }}>
                <AlertTriangle size={13} className="mt-px shrink-0" />
                <span>
                  {strays.length === 1 ? "That one is not" : `Those ${strays.length} are not`} on your board
                  yet. That is fine for a position you are planning — nothing is marked against
                  {strays.length === 1 ? " it" : " them"} until the station exists. If it was meant to be a
                  station you already run, check the spelling.
                </span>
              </div>
            ) : null}

            {open === side ? (
              <div className="mt-2">
                <textarea
                  value={paste[side]}
                  /* ⚠️ VALUE CAPTURED BEFORE THE UPDATER. React recycles the
                     synthetic event, so `e.target` read inside the arrow passed
                     to setPaste is already null by the time it runs. Check 5. */
                  onChange={(e) => { const v = e.target.value; setPaste((p) => ({ ...p, [side]: v })); }}
                  rows={7}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                  placeholder={"One per line, best first.\nA number in front is fine."}
                />
                <div className="text-[11px] mt-1" style={{ color: GRAY }}>
                  This replaces the whole {side} list.
                </div>
                <button
                  disabled={busy}
                  onClick={() => applyPaste(side)}
                  className="mt-2 text-[13px] font-semibold text-white rounded-lg px-3.5 py-2 disabled:opacity-50"
                  style={{ background: ACCENT }}
                >
                  {busy ? "Saving…" : `Save the ${side} list`}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}

      {note ? (
        <div className="text-[12px] font-semibold" style={{ color: note.includes("could not") ? RED : GREEN }}>
          {note}
        </div>
      ) : null}

      {!canEdit ? (
        <div className="text-[11px]" style={{ color: GRAY }}>
          A Team Leader or Director can change these.
        </div>
      ) : null}
    </div>
  );
}
