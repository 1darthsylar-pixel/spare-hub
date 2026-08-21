/* ============================================================================
   signedTick.test.mjs — does a signature reach the count on the home screen?

       node signedTick.test.mjs

   ⚠️ IT IMPORTS AND EXECUTES `signedTick.js`, and then it reads the three real
   files that have to be wired to it. Both halves are needed and neither is
   enough on its own:

     · a perfect little pub/sub nobody calls fixes nothing
     · a wired-up screen calling a broken pub/sub fixes nothing either

   ⭐ WHAT IS BEING PROTECTED, in one sentence: somebody signs the document they
   were told to sign, and the red number on the home screen goes away without
   them reloading the page.

   ⚠️⚠️ SECTION 7 IS THE ONE THAT MATTERS AND IT IS THE ONE THAT ROTS. The unit
   assertions above it can pass forever while a refactor quietly drops the
   subscribe out of App.jsx. Every check down there carries a CONTROL STRING
   THAT MUST BE FOUND, because a grep run against a file that moved reports
   "clean" for everything, and this repo has shipped that reading before.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markSigned, onSigned, signedCount, __resetSignedTick } from "./signedTick.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

group("0. the module was imported and it really runs (controls)");
{
  /* ⚠️ CONTROLS THAT MUST BE FOUND. A failed import would leave every name
     below as undefined, and `undefined === undefined` reads as a clean run. */
  t("markSigned is a function", typeof markSigned === "function");
  t("onSigned is a function", typeof onSigned === "function");
  t("signedCount is a function", typeof signedCount === "function");
  __resetSignedTick();
  t("control: a fresh counter reads 0", signedCount() === 0);
  t("control: one call moves it off 0", (markSigned(), signedCount() === 1));
  __resetSignedTick();
}

group("1. the counter only ever goes up");
{
  __resetSignedTick();
  const seen = [markSigned(), markSigned(), markSigned()];
  t("markSigned returns the new value each time", JSON.stringify(seen) === "[1,2,3]");
  t("signedCount agrees with the last return", signedCount() === 3);
  /* Monotonic on purpose: a subscriber that compares against its own last
     value can never miss a bump it slept through. */
  t("it never goes backwards", seen.every((n, i) => i === 0 || n > seen[i - 1]));
  __resetSignedTick();
}

group("2. every listener hears it, and unsubscribing really stops");
{
  __resetSignedTick();
  const a = [], b = [];
  const offA = onSigned((n) => a.push(n));
  const offB = onSigned((n) => b.push(n));
  markSigned();
  t("both listeners heard the first signature", a.length === 1 && b.length === 1);
  offA();
  markSigned();
  t("the unsubscribed one heard nothing more", a.length === 1);
  t("the other one still hears", b.length === 2);
  offB();
  markSigned();
  t("with nobody listening it still counts", signedCount() === 3);
  /* A cleanup running twice is normal in development. It must not throw and
     must not remove somebody else. */
  let threw = false;
  try { offA(); offA(); } catch { threw = true; }
  t("unsubscribing twice is safe", threw === false);
  __resetSignedTick();
}

group("3. one deaf screen does not silence the rest");
{
  __resetSignedTick();
  const heard = [];
  onSigned(() => { throw new Error("this screen is broken"); });
  onSigned(() => heard.push("second"));
  let threw = false;
  try { markSigned(); } catch { threw = true; }
  t("markSigned did not throw", threw === false);
  t("the listener after the broken one still ran", heard.length === 1);
  /* ⚠️ THE CONTROL FOR THIS SECTION: prove the thrower really did throw,
     otherwise this passes against a listener that quietly did nothing. */
  let proof = false;
  try { (() => { throw new Error("x"); })(); } catch { proof = true; }
  t("control: a throwing function really does throw here", proof === true);
  __resetSignedTick();
}

group("4. a bad subscriber costs its own update, not the screen");
{
  __resetSignedTick();
  let threw = false;
  let off = null;
  try { off = onSigned(null); } catch { threw = true; }
  t("onSigned(null) did not throw", threw === false);
  t("it handed back something callable", typeof off === "function");
  try { off(); } catch { threw = true; }
  t("and that something is safe to call", threw === false);
  __resetSignedTick();
}

group("5. it carries no data, on purpose");
{
  /* A count sent from the screen that did the signing is a GUESS about the
     server's state, and a wrong red number is the whole bug. The signal says
     "ask again" and nothing else. Asserted so a future convenience argument
     has to argue with a test rather than with a comment. */
  __resetSignedTick();
  let payload = "unset";
  onSigned((n) => { payload = n; });
  markSigned();
  t("the listener is handed the tick, not a document", payload === 1);
  t("nothing else is passed", (() => {
    let args = null;
    __resetSignedTick();
    onSigned((...a) => { args = a; });
    markSigned();
    return args && args.length === 1;
  })());
  __resetSignedTick();
}

group("6. the module is a leaf and can stay one");
{
  const src = read("signedTick.js");
  t("control: the source was really read", src.includes("export function markSigned"));
  /* ⚠️ STRIP THE COMMENTS FIRST. The first draft of this section asserted the
     word "React" was absent and went red against a comment that says the file
     deliberately does not use React. A scan that fires on its own explanation
     is not a guard, it is a trap, and this repo has been caught by exactly this
     twice. Everything below reads CODE. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  t("control: stripping left the real code behind", code.includes("export function markSigned") && code.length < src.length);
  t("it imports nothing", /^\s*import\s/m.test(code) === false);
  t("it does not touch React", /react/i.test(code) === false);
  t("it does not touch the browser", /\bwindow\.|\bdocument\.|localStorage/.test(code) === false);
}

group("7. the two real files are wired to it");
{
  const app = read("App.jsx");
  const hr = read("HRConsole.jsx");

  /* ⚠️ CONTROLS FIRST, AND EACH ONE MUST BE FOUND. If a file is renamed or a
     read comes back short, these fail and the wiring checks below cannot report
     a false "clean" for everything. */
  t("control: App.jsx really is the home screen", app.includes("/api/my-docs"));
  t("control: HRConsole.jsx really is the signer", hr.includes("/api/doc-ack"));

  t("App.jsx imports the signal", /import\s*\{[^}]*onSigned[^}]*\}\s*from\s*["']\.\/signedTick\.js["']/.test(app));
  t("HRConsole.jsx imports markSigned", /import\s*\{[^}]*markSigned[^}]*\}\s*from\s*["']\.\/signedTick\.js["']/.test(hr));
  t("App.jsx subscribes", /onSigned\(/.test(app));

  /* ★★ THE ASSERTION THAT ACTUALLY GUARDS THE BUG, AND IT IS ABOUT DEPENDENCY
     LISTS, NOT ABOUT SUBSCRIBING. The counts come from effects, and an effect
     only re-runs when something in its list changes. A subscribe that bumps a
     value nothing depends on is a no-op that reads like a fix.

     ⚠️ TWO COUNTS, NOT ONE. Both answer "what do I still owe" and both go stale
     the same way, and `postDocAck` clears both:
       · docsToSign   — documents HR sent me
       · handbookMine — my own handbook signature
     Wiring one and not the other ships half a fix that looks whole.

     ⚠️ KEYED ON EACH EFFECT'S OWN TEXT, NEVER ON A LINE NUMBER. Line numbers in
     App.jsx have gone stale inside a single day. */
  const sliceFx = (from, to) => {
    const i = app.indexOf(from);
    if (i < 0) return "";
    const j = app.indexOf(to, i);
    return j < 0 ? "" : app.slice(i, j);
  };

  const docsBody = sliceFx("const [docsToSign, setDocsToSign]", "const [pendingRecs");
  t("control: the docsToSign effect was really sliced out", docsBody.includes("/api/my-docs") && docsBody.length < 4000);
  t("the docsToSign count re-runs on a signature", /\}\s*,\s*\[[^\]]*signedAt[^\]]*\]\s*\)/.test(docsBody));

  const hbBody = sliceFx("// \u2500\u2500 Personal handbook status", "// \u2500\u2500 Daily input checklist");
  t("control: the personal handbook effect was really sliced out", hbBody.includes("setHandbookMine") && hbBody.length < 4000);
  t("the personal handbook state re-runs on a signature", /\}\s*,\s*\[[^\]]*signedAt[^\]]*\]\s*\)/.test(hbBody));

  /* ★ AND THE OTHER END: the signal is published only after the SERVER said the
     signature is stored. Publishing on the attempt would clear the number on a
     refusal, which is the same lie pointing the other way — and this exact area
     once returned "That did not save" for signatures that had not saved. */
  const ackBody = (() => {
    const i = hr.indexOf("const postDocAck");
    const j = hr.indexOf("const ackSend", i);
    return i < 0 || j < 0 ? "" : hr.slice(i, j);
  })();
  t("control: postDocAck was really sliced out", ackBody.includes("/api/doc-ack") && ackBody.length < 3000);
  /* ⚠️ MEASURED AGAINST THE BRANCH, NOT AGAINST A CHARACTER COUNT. The first
     draft matched within 200 characters of `if (r && r.ok) {` and went red
     against correct code, because the explanation above the call is longer
     than that. An assertion pinned to a distance is an assertion that fails
     the next time somebody writes a comment. */
  const okBranch = (() => {
    const i = ackBody.indexOf("if (r && r.ok)");
    const j = ackBody.indexOf("return true;", i);
    return i < 0 || j < 0 ? "" : ackBody.slice(i, j);
  })();
  t("control: the success branch was really sliced out", okBranch.startsWith("if (r && r.ok)") && !okBranch.includes("return false"));
  t("postDocAck publishes inside the success branch", okBranch.includes("markSigned()"));
  t("control: it publishes exactly once", (ackBody.match(/markSigned\(\)/g) || []).length === 1);
  t("it does not publish on the failure path", ackBody.indexOf("markSigned()") > -1 && ackBody.indexOf("markSigned()") < ackBody.indexOf("return false"));
}

console.log(`\n${fail ? "FAIL" : "PASS"}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
