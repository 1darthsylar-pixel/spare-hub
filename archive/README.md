# archive

Code that is no longer wired to anything but is NOT safe to delete.

Nothing here is imported, bundled or served. `vite build` never sees it — a
file only enters the bundle by being imported, and nothing imports these.

## Why keep it

Deleting a file removes the answer to "how did this work before". These are
kept because someone will ask.

| File | Why it is here |
|---|---|
| `hrAutomations.js` | Backend HR automation, reached via `?job=hr`. That route no longer exists in `worker.js` — verified Jul 29 2026, zero references anywhere in the repo. Kept rather than deleted because it is the only written record of how HR automation was built, and rebuilding it from scratch would repeat decisions that were already made once. |

## Before deleting anything from here

Check by IMPORT STATEMENT, not by substring, and check BOTH quote styles.
A scan for `from "./thing.js"` misses `from './thing.js'` and misses a
multi-line import where the `from` sits on its own line. Three files were
wrongly called orphans that way on Jul 29 2026 — `FOHAutoAssign.js`,
`BOHAutoAssign.js` and `productivityTiers.js` are all live and all three
looked dead to a careless grep.
