// CHECK 3 -- scope.js
// Reports every identifier that resolves to nothing in any enclosing scope.
//
// Why it exists: `canReconcile` was defined inside ReceiptsScreen and used in
// MileageScreen. A parse check cannot see name resolution.
//
// THE RULE THAT MATTERS MOST (Jul 27, learned by shipping a crash):
//   ANY unbound identifier FAILS and EVERY one is printed.
// The old version only listed "suspicious" names, counted the rest, and exited
// zero. `progress` was a plain lowercase noun, so the Leadership 101 crash was
// detected, hidden inside a count, and shipped. Suspicion now only decides the
// ORDER of the output, never whether something is reported.
// Noise is an acceptable failure mode. Silence is not.

import { ts, loadSource, lineOf, report } from "./lib/ts.mjs";

const GLOBALS = new Set([
  // language
  "undefined","NaN","Infinity","globalThis","Object","Array","String","Number",
  "Boolean","Symbol","BigInt","Math","JSON","Date","RegExp","Error","TypeError",
  "RangeError","SyntaxError","Promise","Map","Set","WeakMap","WeakSet","Proxy",
  "Reflect","Intl","Function","parseInt","parseFloat","isNaN","isFinite",
  "encodeURIComponent","decodeURIComponent","encodeURI","decodeURI","structuredClone",
  "ArrayBuffer","DataView","Uint8Array","Uint16Array","Uint32Array","Int8Array",
  "Int16Array","Int32Array","Float32Array","Float64Array","TextEncoder","TextDecoder",
  "atob","btoa","queueMicrotask","AggregateError",
  // browser
  "window","document","navigator","location","history","screen","console",
  "localStorage","sessionStorage","fetch","Request","Response","Headers","FormData",
  "URL","URLSearchParams","Blob","File","FileReader","Image","Audio","Notification",
  "setTimeout","clearTimeout","setInterval","clearInterval","requestAnimationFrame",
  "cancelAnimationFrame","alert","confirm","prompt","Event","CustomEvent",
  "AbortController","AbortSignal","MutationObserver","IntersectionObserver",
  "ResizeObserver","WebSocket","Worker","crypto","performance","matchMedia",
  "getComputedStyle","scrollTo","open","close","print","caches","indexedDB",
  "ServiceWorkerRegistration","PushManager","HTMLElement","Node","DOMParser",
  // worker / node runtime
  "process","Buffer","require","module","exports","__dirname","__filename",
  "addEventListener","removeEventListener","self","caches","importScripts",
  "clients","skipWaiting","ExtendableEvent",
]);

const SUSPICIOUS = /^[A-Z]|^(set|on|handle|use|get|load|save|open|close|toggle|mut|do|run|fetch|send|post)[A-Z]/;

const isFnLike = (n) =>
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n) ||
  ts.isConstructorDeclaration(n) ||
  ts.isGetAccessor(n) ||
  ts.isSetAccessor(n);

const opensScope = (n) =>
  isFnLike(n) ||
  ts.isSourceFile(n) ||
  ts.isBlock(n) ||
  ts.isModuleBlock(n) ||
  ts.isForStatement(n) ||
  ts.isForOfStatement(n) ||
  ts.isForInStatement(n) ||
  ts.isCatchClause(n) ||
  ts.isCaseBlock(n) ||
  ts.isClassDeclaration(n) ||
  ts.isClassExpression(n);

function newScope(parent) {
  return { parent, names: new Set() };
}
function declare(scope, name) {
  if (name) scope.names.add(name);
}
function resolves(scope, name) {
  for (let s = scope; s; s = s.parent) if (s.names.has(name)) return true;
  return GLOBALS.has(name);
}

// Record every name a binding pattern introduces.
// A renamed destructure `const { mine: myInputs } = x` binds ONLY the alias.
// The property KEY binds nothing -- it is skipped on the reference side too.
function bindName(scope, name) {
  if (!name) return;
  if (ts.isIdentifier(name)) return declare(scope, name.text);
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const el of name.elements) {
      if (ts.isOmittedExpression(el)) continue;
      bindName(scope, el.name);
    }
  }
}

// Pre-declare everything declared DIRECTLY in this scope before walking into it,
// so a function used above its declaration is not a false positive.
// Ordering faults are check 4's job, not this one's.
function hoist(node, scope) {
  const consider = (n) => {
    if (ts.isVariableStatement(n)) {
      for (const d of n.declarationList.declarations) bindName(scope, d.name);
    } else if (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) {
      declare(scope, n.name && n.name.text);
    } else if (ts.isImportDeclaration(n) && n.importClause) {
      const c = n.importClause;
      if (c.name) declare(scope, c.name.text);
      if (c.namedBindings) {
        if (ts.isNamespaceImport(c.namedBindings)) declare(scope, c.namedBindings.name.text);
        else for (const s of c.namedBindings.elements) declare(scope, s.name.text);
      }
    } else if (ts.isLabeledStatement(n)) {
      declare(scope, n.label.text);
    }
  };

  if (ts.isSourceFile(node) || ts.isBlock(node) || ts.isModuleBlock(node)) {
    node.statements.forEach(consider);
  } else if (isFnLike(node)) {
    for (const p of node.parameters) bindName(scope, p.name);
    if (node.name && ts.isIdentifier(node.name)) declare(scope, node.name.text);
    if (node.body && ts.isBlock(node.body)) node.body.statements.forEach(consider);
  } else if (ts.isForStatement(node)) {
    if (node.initializer && ts.isVariableDeclarationList(node.initializer))
      for (const d of node.initializer.declarations) bindName(scope, d.name);
  } else if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
    if (ts.isVariableDeclarationList(node.initializer))
      for (const d of node.initializer.declarations) bindName(scope, d.name);
  } else if (ts.isCatchClause(node)) {
    if (node.variableDeclaration) bindName(scope, node.variableDeclaration.name);
  } else if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
    if (node.name) declare(scope, node.name.text);
  } else if (ts.isCaseBlock(node)) {
    for (const cl of node.clauses) cl.statements.forEach(consider);
  }
}

// Is this identifier a REFERENCE, or is it a name in a declaration / a property
// key / a JSX attribute name? Only references can be unbound.
function isReference(node) {
  const p = node.parent;
  if (!p) return false;

  if (ts.isPropertyAccessExpression(p) && p.name === node) return false;
  if (ts.isQualifiedName(p) && p.right === node) return false;
  if (ts.isPropertyAssignment(p) && p.name === node) return false;
  if (ts.isPropertySignature(p) && p.name === node) return false;
  if (ts.isMethodDeclaration(p) && p.name === node) return false;
  if (ts.isPropertyDeclaration(p) && p.name === node) return false;
  if (ts.isEnumMember(p) && p.name === node) return false;
  if (ts.isBindingElement(p) && (p.propertyName === node || p.name === node)) return false;
  if (ts.isVariableDeclaration(p) && p.name === node) return false;
  if (ts.isParameter(p) && p.name === node) return false;
  if (ts.isFunctionDeclaration(p) && p.name === node) return false;
  if (ts.isFunctionExpression(p) && p.name === node) return false;
  if (ts.isClassDeclaration(p) && p.name === node) return false;
  if (ts.isClassExpression(p) && p.name === node) return false;
  if (ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p)) return false;
  if (ts.isExportSpecifier(p)) return false;
  if (ts.isLabeledStatement(p) && p.label === node) return false;
  if ((ts.isBreakStatement(p) || ts.isContinueStatement(p)) && p.label === node) return false;
  if (ts.isJsxAttribute(p) && p.name === node) return false;
  if (ts.isMetaProperty(p)) return false;
  if (ts.isTypeReferenceNode(p) || ts.isTypeQueryNode(p)) return false;

  // JSX tags: <div> is intrinsic, <TeamCard> is a real reference.
  if (ts.isJsxClosingElement(p)) return false;
  if (
    (ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p)) &&
    p.tagName === node
  ) {
    return /^[A-Z]/.test(node.text);
  }
  return true;
}

export function scopecheck(file) {
  const { sf } = loadSource(file);
  const hits = [];
  const seen = new Set();

  const walk = (node, scope) => {
    let s = scope;
    if (opensScope(node)) {
      s = newScope(scope);
      hoist(node, s);
    }
    if (ts.isIdentifier(node) && isReference(node)) {
      const name = node.text;
      if (!resolves(s, name)) {
        const line = lineOf(sf, node);
        const key = `${name}:${line}`;
        if (!seen.has(key)) {
          seen.add(key);
          hits.push({ name, line, suspicious: SUSPICIOUS.test(name) });
        }
      }
    }
    ts.forEachChild(node, (c) => walk(c, s));
  };

  const root = newScope(null);
  hoist(sf, root);
  ts.forEachChild(sf, (c) => walk(c, root));

  // Suspicious names sort to the top. EVERY hit is reported and EVERY hit fails.
  hits.sort((a, b) => (b.suspicious - a.suspicious) || (a.line - b.line));
  const failures = hits.map(
    (h) => `L${h.line} "${h.name}" is not defined in any enclosing scope${h.suspicious ? "  <-- suspicious" : ""}`
  );
  return report("scope", file, failures);
}
