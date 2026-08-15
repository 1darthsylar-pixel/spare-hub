// CHECK 1 -- validate.js
// Parses the file as TSX and reports every parse diagnostic.
//
// Rules earned the hard way:
//   * ScriptKind.TSX, always. A .js parse of a JSX file lies.
//   * Do NOT filter "Cannot find name". That filter once hid a whole missing
//     import block in L101CateringModule.
//   * A worker .js parsed with `node --check` is read as CommonJS and can PASS
//     a broken ES module. This check does not use node --check at all.

import { ts, loadSource, report } from "./lib/ts.mjs";

export function validate(file) {
  const { sf } = loadSource(file);
  const diags = sf.parseDiagnostics || [];
  const failures = diags.map((d) => {
    const pos = d.start != null ? sf.getLineAndCharacterOfPosition(d.start) : null;
    const where = pos ? `L${pos.line + 1}:${pos.character + 1}` : "L?";
    return `${where} ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`;
  });
  return report("validate", file, failures);
}
