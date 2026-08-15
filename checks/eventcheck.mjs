// CHECK 5 -- eventcheck.js
// Flags a synthetic event read INSIDE a state updater function.
//
// Why it exists: Jul 25, Bri's prep-work field threw on every keystroke.
//   onChange={(e) => setNewPrep((d) => ({ ...d, [id]: e.target.value }))}
// React can run that updater after the handler returns, twice under StrictMode.
// By then the event is recycled and e.target is null.
//
// The fix is always the same shape -- capture the value BEFORE the updater:
//   const v = e.target.value; setX(d => ...v...)
//
// Running this across the Hub the first time found four more, unreported, in
// Planner's non-ops editor and month-draft fields.

import { ts, loadSource, lineOf, report } from "./lib/ts.mjs";

const isFnLike = (n) =>
  ts.isFunctionExpression(n) || ts.isArrowFunction(n);

const EVENTISH = /^(e|ev|evt|event)$/;

export function eventcheck(file) {
  const { sf } = loadSource(file);
  const failures = [];

  const walk = (n) => {
    // a call that looks like a state setter: setSomething(...)
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      /^set[A-Z]/.test(n.expression.text)
    ) {
      const arg = n.arguments[0];
      if (arg && isFnLike(arg)) {
        // any <ident>.target read inside the updater body
        const hunt = (b) => {
          if (
            ts.isPropertyAccessExpression(b) &&
            b.name.text === "target" &&
            ts.isIdentifier(b.expression)
          ) {
            const base = b.expression.text;
            // ignore if the updater itself declares that name
            const declaredHere = arg.parameters.some(
              (p) => ts.isIdentifier(p.name) && p.name.text === base
            );
            if (!declaredHere && (EVENTISH.test(base) || /[Ee]vent$/.test(base))) {
              failures.push(
                `L${lineOf(sf, b)} "${base}.target" read inside ${n.expression.text}() updater` +
                  ` -- the event is recycled by then. Capture the value first.`
              );
            }
          }
          ts.forEachChild(b, hunt);
        };
        if (arg.body) hunt(arg.body);
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);

  return report("eventcheck", file, failures);
}
