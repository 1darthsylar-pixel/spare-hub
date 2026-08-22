/* ═══════════════════════════════════════════════════════════════════════════
   THE PHOTO CARD WOULD NOT GO AWAY — AND ONLY AT ONE STORE

   Matt, Aug 22 2026, off a Village dashboard screenshot showing the card with
   his own picture in it, a Change button and a Remove button:
   *"My promo for the picture won't go away."*

   ⭐ THE FIX ALREADY EXISTED AND HAD NOT TRAVELLED. Measured across all four
   repos: three carry `if (slack || mine) return null;` and the Village alone
   carried `if (slack) return null;`.

   ⛔⛔ AND THE VILLAGE IS THE ONE STORE WHERE THAT IS TOTAL. It has no Slack at
   all, so `slack` is always empty, so the card **never hid for anybody** — not
   for the person who had just used it, not for anyone, ever. Roughly 128
   people with a permanent card on their dashboard.

   ⚠️⚠️ AND A COMMENT HAD BEEN WRITTEN TO DEFEND IT. The Village's copy argued
   *"★ IT DOES NOT BECOME A NAG, BECAUSE IT ALREADY CHANGES SHAPE."* The
   origin's copy says the opposite in its own words: *"a prompt everyone sees
   every day is one nobody reads... It disappears by itself the moment a photo
   lands."* ⇒ **A comment asserting something is worth nothing on its own**, and
   a passing test proves the code matches the assertion, never that the
   assertion matches the ask. The person looking at the screen settled it.

   ⚠️ THE TRADE-OFF IS NAMED RATHER THAN BUILT AROUND. Once the card hides,
   Change and Remove are not reachable from anywhere. That is how the other
   three stores have always worked and nobody has asked for it back, so
   inventing a second home for those buttons would be building for a problem
   that does not exist. **If somebody asks, the place is the self-view in
   HRConsole, beside `SelfPinChange`.**
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (label, cond, extra = "") => {
  if (cond) { pass++; } else { fail++; console.log(`  FAILED: ${label}${extra ? "  (" + extra + ")" : ""}`); }
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
                      .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + " ");

const RAW = readFileSync(new URL("./MyPhoto.jsx", import.meta.url), "utf8");
const SRC = strip(RAW);
const APP = strip(readFileSync(new URL("./App.jsx", import.meta.url), "utf8"));

// ── controls ────────────────────────────────────────────────────────────────
ok("★ control — MyPhoto was read", RAW.length > 4000, String(RAW.length));
ok("★ control — comments really were stripped, so an explanation cannot pass for code",
  /Matt, Aug 3 2026/.test(RAW) && !/Matt, Aug 3 2026/.test(SRC));
ok("★ control — App.jsx was read", APP.length > 100000);
const gates = (SRC.match(/return null;/g) || []).length;
ok("★ control — the gate really was found", gates >= 3, `${gates} early returns`);

// ── 1 · the card is an invitation and it goes when it is answered ───────────
ok("★★ it hides for a photo the person uploaded HERE, not only a Slack one",
  /if\s*\(\s*slack\s*\|\|\s*mine\s*\)\s*return null;/.test(SRC),
  "a store with no Slack never hides it at all");
/* ⚠️⚠️ BOTH OF THESE MEASURE THE THING, NOT A PROXY, AND THEY DID NOT AT FIRST.
   The first version checked the GATE for `mine === null` and the FILE for a
   count of `setMine("")`. Both controls PASSED against broken code: the gate
   still says `mine === null` when `mine` can never be null, and there are other
   `setMine("")` calls in the file that keep any count satisfied. **A guard that
   counts a string is vouching for the string.** */
ok("★★ and it renders NOTHING until BOTH answers are in",
  /slack === null\s*\|\|\s*mine === null/.test(SRC) &&
  /const \[mine, setMine\] = useState\(null\)/.test(SRC),
  "a card that appears and then vanishes reads as broken — the file says so itself");

/* ⚠️ AN UNKNOWN ANSWER MUST FAIL TOWARDS SHOWING IT, NOT HIDING IT. A dropped
   read that left `mine` unknown forever would silently stop asking the people
   this card exists for, and nothing on screen would say so. */
const loadAt = SRC.indexOf("const load = async ()");
const loadEnd = SRC.indexOf("\n  };", loadAt);
const loadBody = loadAt >= 0 && loadEnd > loadAt ? SRC.slice(loadAt, loadEnd) : "";
ok("★ control — the load function really was sliced",
  loadBody.length > 150 && /hub-photos/.test(loadBody), `${loadBody.length} chars`);
/* ⚠️ ON THE SAME LINE, NOT "SOMEWHERE IN THE FILE". A character class around
   `return;` cannot say "not preceded by a settle" — my first attempt matched
   `setMine(""); return;` too and accused correct code. The shape that is right
   is `{ setMine(""); return; }`, and the shape that is the bug is a `return;`
   with nothing settling it, so the line is the unit. */
const bare = loadBody.split("\n")
  .filter((l) => /\breturn\s*;/.test(l) && !/setMine\(/.test(l));
ok("★★ every exit from the load settles the answer, none of them bare",
  bare.length === 0,
  bare.length ? bare.map((l) => l.trim()).join(" | ") + " — leaves it unknown, which hides the card forever" : "");

// ── 2 · the dashboard still renders it ──────────────────────────────────────
ok("★ the dashboard still offers it", /<MyPhoto\s+user=\{user\}\s*\/>/.test(APP));
ok("★ and only when signed in and not inside a section",
  /signedIn && !openSection && !searching && <MyPhoto/.test(APP));

// ── 3 · nothing about the upload rules moved ────────────────────────────────
ok("the 5MB ceiling is untouched", /MAX_BYTES\s*=\s*5\s*\*\s*1024\s*\*\s*1024/.test(SRC));
ok("★★ nothing is written from the browser — the Worker still owns the map",
  /\/api\/my-photo/.test(SRC) && !/kvSet\(/.test(SRC));
ok("★★ Slack still wins on display, which is Matt's own call",
  /slack-avatars/.test(SRC));

// ── 4 · the stale argument is gone ──────────────────────────────────────────
/* ⚠️⚠️ IT LOOKS FOR THE ASSERTING FORM, NOT THE WORDS. The first version
   forbade the bare phrase and then failed on the CORRECTED file, because the
   new comment QUOTES the old sentence to explain why it went. A scan that
   cannot tell an explanation from a claim will flip every time somebody
   documents the thing being graded — `hubCopies.test.mjs` already records
   exactly this, and it happened three more times in one morning. ⇒ `★ ` is
   this repo's own marker for a stated rule, so an asserting comment carries it
   and a quotation does not. */
ok("★★ no comment still ASSERTS that this card does not become a nag",
  !/★\s*IT DOES NOT BECOME A NAG/i.test(RAW),
  "a stale argument sends the next session to undo the fix");
ok("★ control — and the check can still see the phrase when it is asserted",
  /★\s*IT DOES NOT BECOME A NAG/i.test("     ★ IT DOES NOT BECOME A NAG, BECAUSE IT ALREADY CHANGES SHAPE."));

console.log(`myPhotoNag: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
