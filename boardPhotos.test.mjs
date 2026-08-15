/* ============================================================================
   boardPhotos.test.mjs — a Hub-uploaded photo has to reach a board CELL.

       node boardPhotos.test.mjs

   Matt, Aug 14 2026, looking at the setup board: "they still need their profile
   pick instead of initials."

   ═══ THE BUG, WHICH LOOKED LIKE NOTHING ══════════════════════════════════
   Two photo maps feed the board and only one of them was re-keyed.

     hr:slack-avatars:v1  keyed on a SLACK HANDLE, run through fsPhotoMap,
                          which re-registers each photo under every name key
                          its owner alone answers to.
     /api/hub-photos      keyed on the SQUASHED FULL NAME ("silastuggy"),
                          spread into the map RAW.

   The board writes FIRST names into cells — "Silas T" — so the lookup asked for
   "silast" and "silas". Neither is a key in the raw map. Every one of the nine
   people who uploaded their own photo in the Hub drew initials on every board,
   and nothing anywhere reported it, because initials are a legitimate answer.

   ⚠️ THE ASSERTION THAT MATTERS is not "the photo is in the map". It is "the
   string the board actually puts in a cell finds the photo". A test that looked
   the photo up by full name would have passed the whole time the bug was live.

   ⚠️ NAMES LIVE IN THIS TEST, NOT IN THE MODULES. These are read from the live
   roster and the live photo map, Aug 14 2026.
   ============================================================================ */
import fs from "node:fs";
import { normName } from "./nameMatch.js";

let pass = 0; const fails = [];
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra ? "  " + extra : ""}`); }
};
const group = (n) => console.log(`\n── ${n}`);

/* ── the three helpers, copied in shape from DailySetup.jsx ──────────────
   ⚠️ DailySetup.jsx is a React component file and cannot be imported by a node
   test, so these mirror it. That is a real weakness and it is stated rather
   than hidden: if the copies drift, this test grades the wrong thing. They are
   ten lines of pure string work and the assertions below are about the SHAPES
   the two maps arrive in, which is the part that actually broke. */
const fsNameKeys = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  const out = [normName(parts.join("")), normName(parts[0])];
  if (parts[1]) out.push(normName(parts[0] + parts[1][0]));
  return [...new Set(out.filter(Boolean))];
};
const fsSharedKeys = (team) => {
  const owners = new Map();
  team.forEach((n) => fsNameKeys(n).forEach((k) => owners.set(k, (owners.get(k) || 0) + 1)));
  const shared = new Set();
  owners.forEach((c, k) => { if (c > 1) shared.add(k); });
  return shared;
};
const fsAvatarByName = (byName, team) => {
  const map = {};
  if (!byName) return map;          // the real one guards this; so must the copy
  const shared = fsSharedKeys(team);
  team.forEach((n) => {
    const url = byName[normName(n)];
    if (!url) return;
    fsNameKeys(n).forEach((k) => { if (!shared.has(k)) map[k] = url; });
  });
  return map;
};
const fsPhotoMap = (raw, team) => {
  const shared = fsSharedKeys(team);
  const safe = {};
  Object.keys(raw || {}).forEach((k) => { if (!shared.has(k)) safe[k] = raw[k]; });
  return { ...safe, ...fsAvatarByName(raw, team) };
};
/* What `avatarOf` does: direct key, then the three derived keys. */
const lookup = (cellName, map) => {
  const direct = map[normName(cellName)];
  if (direct) return direct;
  for (const k of fsNameKeys(cellName)) if (map[k]) return map[k];
  return null;
};

/* The nine people who have uploaded a photo in the Hub, read from
   hr:photos:v1 on Aug 14 2026, and how the board writes each of them. */
const UPLOADED = [
  ["Adriana Carrera Reyes", "Adriana C"],
  ["Andrea Baca Ramirez", "Andrea"],
  ["Benjamin Underwood", "Benjamin U"],
  ["Brooke Southern", "Brooke"],
  ["Fatima Castellanos-Olivares", "Fatima"],
  ["Jessica Acuna", "Jessica"],
  ["Jose Mendez Olayo", "Jose M"],
  ["Nicole Garcia", "Nicole"],
  ["Tashiana Cortes Campos", "Tashiana"],
];
/* Enough of the real roster to make the ambiguity real: two Adrianas, two
   Underwoods, three Joses, two Garcias. */
const TEAM = [
  "Adriana Arias Hurtado", "Adriana Carrera Reyes", "Andrea Baca Ramirez",
  "Benjamin Underwood", "Griffin Underwood", "Brooke Southern",
  "Fatima Castellanos-Olivares", "Jessica Acuna", "Jose Mendez Olayo",
  "Jose Arias Cortez", "Josue Dominguez", "Nicole Garcia", "Valeria Garcia",
  "Tashiana Cortes Campos", "Silas Tuggy", "Karis Tuggy", "Chloe Jackson",
];
/* What /api/hub-photos answers with: squashed full name → a signed handle. */
const HUB_RAW = Object.fromEntries(UPLOADED.map(([full]) => [normName(full), `/photo/${normName(full)}`]));

group("0. controls — the shapes really are what the bug depended on");
{
  ok("normName squashes spaces", normName("Jessica Acuna") === "jessicaacuna");
  ok("★ the hub map really is keyed that way", HUB_RAW.jessicaacuna === "/photo/jessicaacuna");
  ok("★ and a board cell is NOT that string", normName("Jessica") !== "jessicaacuna");
  ok("nine people have uploaded one", Object.keys(HUB_RAW).length === 9);
}

group("1. 🐛 THE OLD MERGE — spread raw, and the cells find nothing");
{
  const before = { ...HUB_RAW };
  const found = UPLOADED.filter(([, cell]) => lookup(cell, before));
  console.log("        cells that resolved: " + (found.length ? found.map(([, c]) => c).join(", ") : "none"));
  ok("★ not one board cell found its photo", found.length === 0, String(found.length));
  ok("the full name DID resolve, which is why this went unnoticed",
    !!lookup("Jessica Acuna", before));
}

group("2. ★ THE FIX — same re-keying the Slack map already went through");
{
  const after = fsPhotoMap(HUB_RAW, TEAM);
  const missing = UPLOADED.filter(([, cell]) => !lookup(cell, after));
  missing.forEach(([full, cell]) => console.log(`        still missing: "${cell}" (${full})`));
  ok("★ every uploaded photo reaches its board cell", missing.length === 0, String(missing.length));
  UPLOADED.forEach(([full, cell]) => {
    ok(`"${cell}" → ${full}`, lookup(cell, after) === `/photo/${normName(full)}`);
  });
  ok("the full name still resolves too", !!lookup("Jessica Acuna", after));
}

group("3. ⚠️ AND IT MUST NOT DRAW THE WRONG FACE");
{
  const after = fsPhotoMap(HUB_RAW, TEAM);
  /* Two Adrianas are on this roster and only one has uploaded a photo. A bare
     "Adriana" cell must fall back to initials rather than pick one. This is the
     exact bug Bri reported on Aug 7 2026 about the Slack map. */
  ok("★ a bare shared first name resolves to NOTHING", lookup("Adriana", after) === null,
    String(lookup("Adriana", after)));
  ok("★ but the disambiguated cell still works",
    lookup("Adriana C", after) === "/photo/" + normName("Adriana Carrera Reyes"));
  ok("★ and the OTHER Adriana gets no photo at all", lookup("Adriana A", after) === null);

  /* Same test one level down: "Benjamin U" and "Griffin U" are different
     people, and only the first-plus-initial key separates them. */
  ok("Benjamin U resolves", !!lookup("Benjamin U", after));
  ok("Griffin U, who has no photo, resolves to nothing", lookup("Griffin U", after) === null);

  /* Three Joses. "Jose M" is unique; bare "Jose" is not. */
  ok("★ bare Jose is ambiguous and gets nothing", lookup("Jose", after) === null);
  ok("Jose M resolves", lookup("Jose M", after) === "/photo/" + normName("Jose Mendez Olayo"));
}

group("4. Slack still wins, and neither map can wipe the other");
{
  const slack = { silastuggy: "/slack/silas", jessicaacuna: "/slack/jessica" };
  const merged = { ...fsPhotoMap(HUB_RAW, TEAM), ...fsPhotoMap(slack, TEAM) };
  ok("★ Slack beats an upload for the same person",
    lookup("Jessica", merged) === "/slack/jessica");
  ok("★ an upload still fills a gap Slack does not cover",
    lookup("Brooke", merged) === "/photo/" + normName("Brooke Southern"));
  ok("somebody only Slack knows still resolves", lookup("Silas T", merged) === "/slack/silas");
  ok("somebody in neither map gets nothing", lookup("Chloe J", merged) === null);
}

group("5. empty and junk are working states");
{
  ok("an empty hub map yields an empty result",
    Object.keys(fsPhotoMap({}, TEAM)).length === 0);
  ok("a null hub map does not throw", Object.keys(fsPhotoMap(null, TEAM)).length === 0);
  ok("an empty roster yields nothing rather than throwing",
    Object.keys(fsPhotoMap(HUB_RAW, [])).length === 9);
  ok("and a cell still resolves to nothing then", lookup("Jessica", fsPhotoMap(HUB_RAW, [])) === null);
}

group("6. ⚠️ THE COPIES ABOVE ARE A COPY — so the real call site is asserted too");
{
  /* This is the weak seam in this file and it is guarded rather than hoped
     about. DailySetup.jsx cannot be imported by node, so the helpers above are
     mirrors. What CANNOT be mirrored is the one line the fix lives on, so it is
     read out of the real file. If somebody reverts it to the raw spread, this
     goes red even though every behavioural assertion above still passes. */
  const src = fs.readFileSync(new URL("./DailySetup.jsx", import.meta.url), "utf8");
  ok("DailySetup.jsx was read (control)", src.length > 100000, String(src.length));
  ok("★ the hub map goes through fsPhotoMap at the merge",
    src.includes("setAvatars({ ...fsPhotoMap(d.byName), ...slackByName })"));
  ok("★ and the raw spread is gone",
    !src.includes("setAvatars({ ...d.byName, ...slackByName })"));
  ok("the real fsAvatarByName still guards a null map",
    /function fsAvatarByName\([^)]*\)\s*\{\s*const map = \{\};\s*if \(!slackByName\) return map;/.test(src));
  ok("and the real fsNameKeys still builds three keys",
    /function fsNameKeys\(name\)/.test(src) && src.includes("out.push(norm(parts[0] + parts[1][0]))"));
}

if (fails.length) {
  console.log(`\nboardPhotos: ${pass} passed, ${fails.length} FAILED`);
  process.exit(1);
}
console.log(`\nboardPhotos: ${pass} passed`);
