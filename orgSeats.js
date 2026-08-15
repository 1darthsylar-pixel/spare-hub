/* ═══════════════════════════════════════════════════════════════════
   orgSeats.js — WHO OWNS WHAT. One source, imported by both sides.

   ★ WHY THIS FILE EXISTS AT ALL.
   Matt, Jul 28 2026: "If the accountability chart is updated it should stay
   smart." It could not. The chart lived in AccountabilityChart.jsx as a
   hardcoded array, and the worker routed off a SEPARATE snapshot in KV
   (`org:seats`) that Claude typed by reading that array. Two copies of one
   fact drift, and they did — within hours the KV snapshot had FACILITIES
   under Chloe when the chart says Brandon (Chloe assists him). Nothing
   would ever have flagged it.

   Now the chart RENDERS from this file and the worker ROUTES from this
   file, so editing a seat here changes both at once and they cannot
   disagree. Same reasoning as boardOwner.js: a leaf module with no React,
   no store.js and no import.meta.env can be imported by the browser and
   the Worker alike.

   ⚠️ KEEP IT A NEAR-LEAF. It imports storeConfig.js and NOTHING ELSE.
   storeConfig is itself a strict leaf that imports nothing, so the chain
   terminates one step down and both the browser and the Worker can still run
   this file. That is the only import allowed here. The moment this pulls in
   anything the Worker can't run, the two sides split again and we are back
   where we started.

   ⚠️ `holderId` IS THE DURABLE KEY — it is the HR roster id from
   `gcfcr-hr-team-v1`. The display name is for humans and WILL drift
   (the chart says "Lizy Gonzalez", HR says "Lizbeth Gonzalez Ramos",
   both are one person). Route on the id; never match on the name.
   ═══════════════════════════════════════════════════════════════════ */

import { STORE_CONFIG } from "./storeConfig.js";

/* ★ THE SEATS ARE DATA NOW (step 2, Aug 11 2026). They live in storeConfig.js
   so a new store types its own in rather than having this file hand-edited.

   `seatOut` rebuilds the exact object this file has always exported: id,
   holder, holderId, fn, and note only when there is one.

   ⚠️⚠️ THE KEY SET AND THE KEY ORDER BOTH MATTER. These objects are spread into
   records and rendered field by field by four client tiles and the Worker. A
   stray extra key travels into whatever they build. So `list` and `area`, which
   exist for the chart grouping and the settings picker, are deliberately NOT
   passed through — they are config's business, not this file's.

   ⚠️ ONLY `ad-foh` AND `ad-boh` REACH THE CHART. The config also carries areas
   with no seat (holder null) so step 3 can offer a picker for them. Letting
   those through here would put six empty rows on the accountability chart,
   which is a visible change to a screen this step must not touch. */
const seatOut = (s) => {
  const o = { id: s.id, holder: s.holder, holderId: s.holderId, fn: s.fn };
  if (s.note) o.note = s.note;
  return o;
};
const inList = (name) => STORE_CONFIG.owners.seats.filter((s) => s.list === name).map(seatOut);

/* Assistant Director seats, exactly as the accountability chart shows them.
   `fn` is the function label the chart prints. `holderId` is present only
   where the person has been matched to an HR record — a seat without one
   still renders, it just cannot be routed to.
   ⚠️ ORDER IS THE CHART ORDER and comes from the config's own row order. */
export const AD_SEATS = {
  FOH: inList("ad-foh"),
  BOH: inList("ad-boh"),
};

/* ⚠️ WHY THE SEATS ARE NOT WRITTEN OUT BELOW ANY MORE, AND WHAT WENT WITH THEM.
   The literal FOH and BOH arrays used to sit here with the reasoning attached
   to them, including Bri's answer to the successor question (Jul 31, asked at
   Matt's instruction): "Nobody will take over Team Culture or Facilities. At
   some point, there may be ADs move into those specialties, but for now there
   are not. Those areas will be absorbed into their new roles as well."

   That is why team-culture and facilities carry a holder AND a note saying the
   function is now part of a Director role. They are not held-open seats waiting
   on a name. If an AD is ever moved into one of those specialties, that is when
   the holder changes. Both notes travelled into the config with their rows.

   One more fact that had nowhere else to live: DT is split by SHIFT, not by
   function. Lulani runs PM and Monica runs daytime, which is why there are two
   drive thru seats rather than one. */

/* Equipment is not printed as an AD seat on the chart — it sits with BOH,
   which Brandon directs — but it IS a routable owner, so it lives in the config
   under list "extra". Anything the Hub needs to notify about must have a seat. */
export const EXTRA_SEATS = inList("extra");

/* Which seat a Hub tool belongs to.
   ⚠️ DELIBERATELY ONLY `foodsafety` AND `equipment`.
   `cleaning` and `cashaudit` are resolved PER DAY off the Daily Setup board
   by pushToOwners/ownersForInput — that is Matt's own rule ("audit is by open
   and closing leaders"), and it is day-accurate where a fixed seat holder is
   not. Adding them here would give the Hub two opinions about the same person
   again, which is the entire bug this file exists to prevent. */
export const TOOL_SEAT = STORE_CONFIG.owners.toolArea;

/* Where a seat escalates when its holder is gone or inactive. BOH functions
   roll up to the BOH director; the director seats have nowhere above them
   inside this file, so they return null and the caller falls back.
   ★ Built from the config's own rows now, so a seat and its escalation cannot
   be edited in two places and disagree.
   ⚠️ THE OLD MAP LISTED ONLY SEVEN SEATS and everything else fell through the
   `?? null` below to null. Every row carries the field now, so an absent key
   and an explicit null both still read as null. Same answer, one home. */
const ESCALATES_TO = STORE_CONFIG.owners.seats.reduce((m, s) => {
  m[s.id] = s.escalatesTo ?? null;
  return m;
}, {});

function allSeats() {
  return [].concat(AD_SEATS.FOH, AD_SEATS.BOH, EXTRA_SEATS);
}

/** Seat record for a seat id, or null. */
export function seatById(seatId) {
  if (!seatId) return null;
  const hit = allSeats().find((s) => s.id === seatId);
  if (!hit) return null;
  return Object.assign({}, hit, { escalatesTo: ESCALATES_TO[hit.id] ?? null });
}

/** Seat record for a Hub tool id, or null if that tool isn't seat-routed. */
export function seatForTool(tool) {
  return seatById(TOOL_SEAT[tool]);
}
