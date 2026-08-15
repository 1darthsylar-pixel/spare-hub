# Where this repo came from, and how to sync it

This repo is a **scrubbed snapshot** of another store's Hub, not a fork. It has
**no shared git history with the origin repo, on purpose** — that is what stops
the origin store's people, pay and sales travelling in `git log`.

The cost of that choice is that `git merge` and `git cherry-pick` **cannot work
here.** There is no common ancestor. Every upstream change is a deliberate port.

**This file is the only record of what this repo is missing.** Keep it current or
nobody can answer that question again.

---

## Baseline

| | |
|---|---|
| Origin repo | `1darthsylar-pixel/gate-city-hub` |
| **Code baseline** | **`d6965ec`** |
| Snapshot taken by | `newstore.mjs` |
| Store | SET-THIS-TO-THE-STORE-NAME · FSR `00000` |

⚠️ **`d6965ec` IS THE NUMBER THAT MATTERS.** Everything upstream
after it is drift. In the origin repo, `node drift.mjs /path/to/this/repo` reads
this row and sorts every shared file into what is safe to adopt, what needs a
hand port, and what this store has customised. **It refuses to classify anything
if this row is missing or malformed**, so do not reformat it.

⚠️ **THIS SNAPSHOT WAS TAKEN AT ONE COMMIT, WHICH IS THE ONLY TIME THAT IS TRUE.**
The moment anything here is edited, one sha stops describing this repo. That is
expected and it is what the three buckets are for. **Diff the file. Believe the
diff.**

---

## Synced since the snapshot

Nothing yet. Add a row per port, in the same commit as the port.

| Date | What | Why it was worth porting |
|---|---|---|
| | | |

---

## How to sync, when you do

1. **Read the gap first.** In the origin repo: `node drift.mjs /path/to/this/repo`.
   Then `git log <baseline>..origin/main` for the why. Decide per change, never
   in bulk.
2. ⚠️ **A FILE IN THE "SAFE TO ADOPT" BUCKET IS A LEAD, NOT A VERDICT.** The tool
   compares bytes, so it cannot see that an upstream change was **half of a
   two-file fix**. Before adopting anything, run `git show --stat <commit>` on
   the commit it came from and check whether the other files in it are already
   here. This is not theoretical: on the first real sync **every one of the six
   files that looked safe needed a companion** — one imported a module this repo
   did not have, one needed a helper that did not exist here, and two were
   comment-only changes whose real content was a missing test file.
3. **Check every import resolves here before adopting a file.** A dead import
   fails the one `vite build` that gates the whole repo, **including the
   Worker**, so a client-side mistake stops a server-side deploy.
4. **Prefer adopting a whole file over replaying a diff** when upstream has
   restructured it. Patches onto scrubbed files conflict in exactly the scrubbed
   regions, which is the signal to stop and look, not to resolve quickly.
5. **Re-scrub every adopted file.** Upstream keeps its own people and figures
   legitimately, so assume each adopted file carries some. Check rather than
   remember, and check the WHOLE file rather than the diff.
6. ⛔ **NEVER SYNC THESE. They are this store's, and copying them undoes the
   handover:** `.env`, `wrangler.toml`, `storeConfig.js` identity, `CLAUDE.md`,
   this file, and every file the snapshot deliberately left behind.
7. **Then prove it, or the sync is not finished:**
   ```
   node checks/run.mjs <files touched>
   npx vite build && node scrubcheck.mjs --dist --count "<origin store name>"
   ```
   ⚠️ Give every sweep a **control string that must be FOUND**. A grep against a
   path that does not exist reports clean for everything, which is how "gone
   from every chunk" once meant "I looked nowhere".
8. **Update the baseline row and the table above in the same commit as the port.**
   A stale record here is worse than none, because the next session trusts it.
