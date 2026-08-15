// CHECK 2 -- hookcheck.js
// Flags any use*() call that sits AFTER an early return at function-body level.
//
// Why it exists: Jul 23 outage. The pinned-tiles hooks were placed below
//   if (activeTool) return (...)
// in App.jsx. The dashboard rendered fine and EVERY tool went blank, because
// the hook order changed between renders.
//
// Known false positive, do not "fix" it: `useCount` in HRConsole's
// TemplateEditor is a plain arrow function named like a hook.

import { ts, loadSource, lineOf, report } from "./lib/ts.mjs";

const IGNORE = new Set(["useCount"]);

const isFnLike = (n) =>
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n);

function containsReturn(node) {
  // A nested function or class declared at body level is NOT an early return.
  // Missing this reported 18 false findings across CashAudit, DailySetup and
  // PTOTracker, all of which are legal code.
  if (isFnLike(node) || ts.isClassDeclaration(node)) return false;
  let found = false;
  const walk = (n) => {
    if (found) return;
    if (isFnLike(n) || ts.isClassDeclaration(n)) return; // a return inside a nested function is not ours
    if (ts.isReturnStatement(n)) {
      found = true;
      return;
    }
    ts.forEachChild(n, walk);
  };
  ts.forEachChild(node, walk);
  return found;
}

function hookCallsIn(node, sf, out) {
  const walk = (n, root) => {
    // a hook inside a nested function belongs to THAT component, not this one
    if (!root && (isFnLike(n) || ts.isClassDeclaration(n))) return;
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      /^use[A-Z]/.test(n.expression.text) &&
      !IGNORE.has(n.expression.text)
    ) {
      out.push({ name: n.expression.text, line: lineOf(sf, n) });
      // do not descend into the hook's own callback arguments
      return;
    }
    ts.forEachChild(n, (c) => walk(c, false));
  };
  walk(node, true);
}

export function hookcheck(file) {
  const { sf } = loadSource(file);
  const failures = [];

  const visitFn = (fn) => {
    const body = fn.body;
    if (!body || !ts.isBlock(body)) return;
    const stmts = body.statements;
    let sawReturn = false;
    let returnLine = 0;

    for (const st of stmts) {
      // a nested component/helper declared here is not part of THIS hook order
      if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) continue;
      if (sawReturn) {
        const hooks = [];
        hookCallsIn(st, sf, hooks);
        for (const h of hooks) {
          failures.push(
            `L${h.line} ${h.name}() runs after an early return on L${returnLine}` +
              ` -- hook order changes between renders`
          );
        }
        continue;
      }
      if (ts.isReturnStatement(st)) {
        // a trailing return is normal; only flag if statements follow
        sawReturn = true;
        returnLine = lineOf(sf, st);
      } else if (containsReturn(st)) {
        sawReturn = true;
        returnLine = lineOf(sf, st);
      }
    }
  };

  const walk = (n) => {
    if (isFnLike(n)) visitFn(n);
    ts.forEachChild(n, walk);
  };
  walk(sf);

  return report("hookcheck", file, failures);
}
