// CHECK 6 -- cyclecheck.js
// Builds the relative-import graph across the repo and reports any cycle.
//
// Why it exists: Jul 25 --
//   ProfessionalGrowth -> Leadership101 -> HRConsole -> ProfessionalGrowth
// A cycle does NOT fail loudly. It surfaces as "Cannot access 'X' before
// initialization" and a blank white page, which is indistinguishable from the
// TDZ fault in check 4 without the error text.
//
// The standing rule this enforces: shared logic lives in a LEAF module that
// imports nothing. nameMatch.js must stay dependency-free.

import { readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { ts, loadSource, report } from "./lib/ts.mjs";

const SKIP = new Set(["node_modules", "dist", ".git", "checks", "public", ".wrangler"]);

export function listSourceFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP.has(entry) || entry.startsWith(".")) continue;
      const p = path.join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(jsx|js|mjs)$/.test(entry)) out.push(p);
    }
  };
  walk(root);
  return out;
}

function resolveSpec(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const tries = [base, base + ".js", base + ".jsx", path.join(base, "index.js"), path.join(base, "index.jsx")];
  for (const t of tries) if (existsSync(t) && statSync(t).isFile()) return t;
  return null;
}

export function cyclecheck(root, files) {
  const graph = new Map();
  for (const f of files) {
    const { sf } = loadSource(f);
    const edges = [];
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st)) continue;
      const spec = st.moduleSpecifier;
      if (!ts.isStringLiteral(spec)) continue;
      if (!spec.text.startsWith(".")) continue;
      const target = resolveSpec(f, spec.text);
      if (target) edges.push(target);
    }
    graph.set(f, edges);
  }

  const failures = [];
  const state = new Map(); // 0 unvisited, 1 on stack, 2 done
  const stack = [];
  const reported = new Set();

  const dfs = (node) => {
    state.set(node, 1);
    stack.push(node);
    for (const next of graph.get(node) || []) {
      if (state.get(next) === 1) {
        const at = stack.indexOf(next);
        const loop = stack.slice(at).concat(next).map((p) => path.relative(root, p));
        const key = [...loop].sort().join("|");
        if (!reported.has(key)) {
          reported.add(key);
          failures.push(`import cycle: ${loop.join(" -> ")}`);
        }
      } else if (!state.get(next)) {
        dfs(next);
      }
    }
    stack.pop();
    state.set(node, 2);
  };

  for (const f of files) if (!state.get(f)) dfs(f);
  return report("cyclecheck", "(repo)", failures);
}
