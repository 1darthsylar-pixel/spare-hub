// Shared helper for the Gate City Hub pre-ship checks.
// Finds the TypeScript compiler wherever it happens to live, and gives every
// check the same file-loading and reporting shape.

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

function findTypeScript() {
  // 1. normal resolution (local node_modules, then NODE_PATH)
  try {
    return require("typescript");
  } catch {}
  // 2. the global npm root
  try {
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    const p = path.join(root, "typescript", "lib", "typescript.js");
    if (existsSync(p)) return require(p);
  } catch {}
  console.error(
    [
      "",
      "  Could not find the TypeScript compiler.",
      "  These checks parse JSX with it. Install it once:",
      "",
      "      npm install -g typescript",
      "",
    ].join("\n")
  );
  process.exit(2);
}

export const ts = findTypeScript();

export function loadSource(file) {
  const text = readFileSync(file, "utf8");
  return {
    text,
    sf: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
  };
}

export function lineOf(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

// Every check returns { name, file, failures: [ "L12 ..." ] }.
// The runner decides the exit code. A check NEVER suppresses a finding to
// stay quiet -- silence is the failure mode that cost us Leadership 101.
export function report(name, file, failures) {
  return { name, file, failures };
}
