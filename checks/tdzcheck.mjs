// CHECK 4 -- tdzcheck.mjs
// Something read BEFORE its declaration, at a moment that runs during render.
//
// Three faults, all of which shipped:
//   (a) DEP ARRAYS. Jul 25 -- a useEffect named `loaded` in its dep array 45
//       lines above `const [loaded]`. Dep arrays evaluate immediately, so it
//       read the variable inside its temporal dead zone. Minified, `loaded`
//       became `I`: "Cannot access 'I' before initialization". Blank page.
//   (b) BODIES. Jul 27 -- `const courseRows = useMemo(...)` called `keyOf`,
//       declared 320 lines BELOW it in the same component. A useMemo body runs
//       during the first render, so it read keyOf in its TDZ and the whole
//       Leadership Dev tile threw. Parse-clean, scope-clean, dep-clean.
//   (c) PLAIN RENDER-BODY CONSTS. Aug 1 2026 -- `const pendingPricing =
//       TEAM_EFF.flatMap(...)` sat ABOVE `const TEAM_EFF = ...` in HR Console.
//       Not a hook, so (a)/(b) never looked at it, yet the initializer is
//       evaluated DURING render, so it read TEAM_EFF in its TDZ and crashed the
//       whole console live: "Cannot access 'Q' before initialization".
//
// useEffect / useLayoutEffect BODIES are deliberately excluded: that callback
// runs AFTER render, so a later declaration is legal there and flagging it
// would cry wolf. For the same reason (c) never flags an identifier reached
// only INSIDE a nested function within an initializer -- a handler assigned to
// a const and naming a later binding runs on click, long after render.
//
// ⚠️ BLOCK SCOPE, ADDED AUG 1 AFTER TWO FALSE POSITIVES.
// (c) shipped comparing names across the WHOLE function body, which meant a
// binding in an unrelated block counted as "declared later". Both of its only
// findings across 100 files were wrong, and both were the same shape:
//     for (const g of givers) { const have = ...g... }   // reads the LOOP var
//     else { const g = givers[0]; }                      // a SIBLING block
// A sibling block never shadows anything, and a loop variable is bound before
// its body runs. Declarations are now recorded against their enclosing block,
// a read only resolves against blocks on its own ancestor chain, and loop
// variables and catch parameters are recorded as binders that stop the search.
//
// The real fix for the code is usually to HOIST the pure helper to module
// level, not to reorder declarations inside the component.

import { ts, loadSource, lineOf, report } from "./lib/ts.mjs";

const RENDER_TIME = new Set(["useMemo", "useCallback"]);

const isFnLike = (n) =>
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n);

// Anything that opens a lexical (block) scope. A `for` header counts, because
// its loop variable is scoped to the loop and NOT to the block outside it.
const isBlockScope = (n) =>
  ts.isBlock(n) ||
  ts.isModuleBlock(n) ||
  ts.isSourceFile(n) ||
  ts.isForStatement(n) ||
  ts.isForOfStatement(n) ||
  ts.isForInStatement(n) ||
  ts.isCatchClause(n) ||
  ts.isCaseBlock(n);

// Every name a binding pattern introduces.
function namesOf(name, out = []) {
  if (!name) return out;
  if (ts.isIdentifier(name)) out.push(name.text);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name))
    for (const el of name.elements)
      if (!ts.isOmittedExpression(el)) namesOf(el.name, out);
  return out;
}

function nearestBlock(node, stopAt) {
  for (let p = node.parent; p; p = p.parent) {
    if (isBlockScope(p)) return p;
    if (p === stopAt) return stopAt;
  }
  return stopAt;
}

// Collect, for one function body:
//   decls   name -> [{ line, block }]   const/let declarations, per block
//   binders block -> Set(name)          loop variables and catch params
// Nested functions are skipped: their bindings belong to them, not to us.
function collectScopes(fnBody, sf) {
  const decls = new Map();
  const binders = new Map();

  const addDecl = (name, line, block) => {
    if (!decls.has(name)) decls.set(name, []);
    decls.get(name).push({ line, block });
  };
  const addBinder = (block, name) => {
    if (!binders.has(block)) binders.set(block, new Set());
    binders.get(block).add(name);
  };

  const walk = (n) => {
    if (isFnLike(n)) return;

    if (ts.isVariableStatement(n)) {
      const flags = n.declarationList.flags;
      if (flags & ts.NodeFlags.Let || flags & ts.NodeFlags.Const) {
        const line = lineOf(sf, n);
        const block = nearestBlock(n, fnBody);
        for (const d of n.declarationList.declarations)
          for (const name of namesOf(d.name)) addDecl(name, line, block);
      }
    }

    // A loop variable is bound to the LOOP, before the body ever runs.
    if (ts.isForStatement(n) || ts.isForOfStatement(n) || ts.isForInStatement(n)) {
      const init = n.initializer;
      if (init && ts.isVariableDeclarationList(init))
        for (const d of init.declarations)
          for (const name of namesOf(d.name)) addBinder(n, name);
    }
    if (ts.isCatchClause(n) && n.variableDeclaration)
      for (const name of namesOf(n.variableDeclaration.name)) addBinder(n, name);

    ts.forEachChild(n, walk);
  };

  ts.forEachChild(fnBody, walk);
  return { decls, binders };
}

// Walk OUT from the reading site. The first block that binds this name wins.
// Returns the declaration line if that binding is genuinely later, else null.
function resolveLater(scopes, fnBody, siteNode, name, siteLine) {
  const { decls, binders } = scopes;
  const list = decls.get(name);
  if (!list && !binders.size) return null;

  for (let p = siteNode; p; p = p.parent) {
    if (isBlockScope(p)) {
      // a loop variable or catch param here shadows everything outside
      if (binders.get(p)?.has(name)) return null;

      const here = list ? list.filter((e) => e.block === p) : [];
      if (here.length) {
        // declared at or above the read in the same block -> fine
        if (here.some((e) => e.line <= siteLine)) return null;
        return here[0].line;
      }
    }
    if (p === fnBody) break;
  }
  return null;
}

function localNames(fn) {
  const out = new Set();
  const add = (name) => namesOf(name).forEach((x) => out.add(x));
  for (const p of fn.parameters) add(p.name);
  const walk = (n) => {
    if (isFnLike(n) && n !== fn) return;
    if (ts.isVariableDeclaration(n)) add(n.name);
    ts.forEachChild(n, walk);
  };
  if (fn.body) ts.forEachChild(fn.body, walk);
  return out;
}

export function tdzcheck(file) {
  const { sf } = loadSource(file);
  const failures = [];

  const checkComponent = (fn) => {
    if (!fn.body || !ts.isBlock(fn.body)) return;
    const fnBody = fn.body;
    const scopes = collectScopes(fnBody, sf);
    if (scopes.decls.size === 0) return;

    const walk = (n) => {
      if (isFnLike(n)) return; // hooks live at component body level
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        /^use[A-Z]/.test(n.expression.text)
      ) {
        const hook = n.expression.text;
        const callLine = lineOf(sf, n);

        // (a) dep array -- evaluated immediately for EVERY hook
        const last = n.arguments[n.arguments.length - 1];
        if (last && ts.isArrayLiteralExpression(last)) {
          for (const el of last.elements) {
            if (!ts.isIdentifier(el)) continue;
            const dl = resolveLater(scopes, fnBody, n, el.text, callLine);
            if (dl) {
              failures.push(
                `L${callLine} ${hook}() dep "${el.text}" is declared later at L${dl}` +
                  ` -- dep arrays evaluate immediately`
              );
            }
          }
        }

        // (b) body -- only for hooks that RUN during render
        if (RENDER_TIME.has(hook)) {
          const cb = n.arguments[0];
          if (cb && isFnLike(cb)) {
            const shadowed = localNames(cb);
            const seen = new Set();
            const bodyWalk = (b) => {
              if (ts.isIdentifier(b)) {
                const p = b.parent;
                const isProp =
                  (ts.isPropertyAccessExpression(p) && p.name === b) ||
                  (ts.isPropertyAssignment(p) && p.name === b) ||
                  (ts.isBindingElement(p) && p.propertyName === b);
                if (!isProp && !shadowed.has(b.text) && !seen.has(b.text)) {
                  const dl = resolveLater(scopes, fnBody, n, b.text, callLine);
                  if (dl) {
                    seen.add(b.text);
                    failures.push(
                      `L${callLine} ${hook}() BODY uses "${b.text}" declared later at L${dl}` +
                        ` -- this body runs on the first render`
                    );
                  }
                }
              }
              ts.forEachChild(b, bodyWalk);
            };
            if (cb.body) bodyWalk(cb.body);
          }
        }
      }
      ts.forEachChild(n, walk);
    };
    ts.forEachChild(fnBody, walk);

    // (c) PLAIN render-body const/let. Evaluated during render, so an eager
    // read of a later binding is a TDZ crash. A function/arrow VALUE is
    // deferred and skipped whole; an identifier reached only inside a nested
    // function within the initializer is skipped too. Hook calls belong to
    // (a)/(b) and are not re-walked here.
    const plainWalk = (n) => {
      if (isFnLike(n)) return; // nested function bodies run later, not now
      if (ts.isVariableStatement(n)) {
        const flags = n.declarationList.flags;
        if (flags & ts.NodeFlags.Let || flags & ts.NodeFlags.Const) {
          const stmtLine = lineOf(sf, n);
          for (const d of n.declarationList.declarations) {
            if (!d.initializer || isFnLike(d.initializer)) continue;
            const declName = ts.isIdentifier(d.name) ? d.name.text : null;
            const seen = new Set();
            const initWalk = (b) => {
              if (isFnLike(b)) return; // deferred -- runs after render
              if (
                ts.isCallExpression(b) &&
                ts.isIdentifier(b.expression) &&
                /^use[A-Z]/.test(b.expression.text)
              ) return; // hooks are (a)/(b)'s job
              if (ts.isIdentifier(b)) {
                const p = b.parent;
                const isName =
                  (ts.isPropertyAccessExpression(p) && p.name === b) ||
                  (ts.isPropertyAssignment(p) && p.name === b) ||
                  (ts.isBindingElement(p) && p.propertyName === b) ||
                  (ts.isJsxAttribute(p) && p.name === b);
                if (!isName && b.text !== declName && !seen.has(b.text)) {
                  const dl = resolveLater(scopes, fnBody, n, b.text, stmtLine);
                  if (dl) {
                    seen.add(b.text);
                    failures.push(
                      `L${stmtLine} "${declName || "binding"}" reads "${b.text}" declared later at L${dl}` +
                        ` -- a render-time const in the temporal dead zone`
                    );
                  }
                }
              }
              ts.forEachChild(b, initWalk);
            };
            initWalk(d.initializer);
          }
        }
      }
      ts.forEachChild(n, plainWalk);
    };
    ts.forEachChild(fnBody, plainWalk);
  };

  const walk = (n) => {
    if (isFnLike(n)) checkComponent(n);
    ts.forEachChild(n, walk);
  };
  walk(sf);

  return report("tdzcheck", file, failures);
}
