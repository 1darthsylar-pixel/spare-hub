# Gate City Hub

Internal ops platform for Gate City Chick-fil-A (FSR #04010), Greensboro NC,
around 106 team members. Live at **gatecityhub.com**.

Matt Jackson is the operator and primary builder.

This is also the **origin repo**: every other store's Hub is a scrubbed snapshot
of this one. See "Standing up a new store" below.

## Read these first

| File | What it tells you |
|---|---|
| `CLAUDE.md` | The rules. Access tiers, the rollback floor, design rules, how to work here |
| `REPO-MAP.md` | What every file does |
| `NEW-STORE-SETUP.md` | Everything a new store needs, in order |
| `STORE-INTAKE.md` | The people half: what to ask an operator for, and in what format |
| `BUILD-LOOP.md` | Process for a batch of tasks |
| `CRON-JOBS.md` | The scheduled jobs and who they reach |
| `build-log.md` | One row per task, with what was measured. The engineering history |

## Shape

React + Vite single page app served by a Cloudflare Worker.

- **Flat root. There is no `src/` directory.** Every component sits at the repo
  root: `App.jsx`, `HRConsole.jsx`, `worker.js`, and the rest.
- `index.html` is at the root. Vite serves `public/` at `/`.
- camelCase / PascalCase filenames only. Underscores silently break Vite.
- **Filename does not equal component name.** `HRConsole.jsx` exports
  `HRConsoleTile()`. Check the import line in `App.jsx`, never the component name.
- Storage is Supabase, reached through `kvGet` / `kvSet` in `store.js`.
  Cloudflare KV is used only for scheduled-job dedup.

## Deploying

Merge to `main`. Cloudflare builds and promotes on its own, about a minute
later. There is no manual promote step and nothing for anyone to click.

⚠️ **A merge reaches around 106 people in about a minute, with no human step in
between.** The six checks and a green `vite build` before the pull request are
the whole safety net, not a first opinion on the way to one.

One `vite build` gates the whole repo, so a dead import anywhere in the client
blocks the **Worker** deploy too. If a Worker fix appears to do nothing, check
that the build went green.

Rollback: Cloudflare, `gate-city-hub`, Deployments, roll back to last good. That
restores the app instantly and never touches Supabase.

⛔ **There is a rollback floor.** Never roll back past version `4bde5c34`. Doing
so signs out everyone who has signed in since, all at once, on around 106
phones. The full reason is in `CLAUDE.md`.

## Before shipping any file

```
node checks/run.mjs <files touched>
```

All six must be clean. Every one of them exists because a bug got past careful
reading. **Never edit anything in `checks/`.** If a check looks wrong, report it
and stop.

## Standing up a new store

One command. It builds their whole repo from this one.

```
node newstore.mjs ../their-hub --fsr 00746 --store "Their Name" \
                  --worker their-hub --domain theirhub.com
```

It takes a snapshot of the working tree into a fresh repo with **one commit and
no inherited history**, which is what stops this store's people and pay
travelling in `git log`. Then it sets their store number, names their Worker,
blanks the database in both places that carry it, swaps every `*.empty.js` seed
in, empties the training deck list, opens HR Console by rank, leaves this
store's docs, pages, icons and logo behind, and writes their `CLAUDE.md` and
their `SYNCED-FROM.md`.

⚠️ **It refuses rather than guesses.** It will not take this store's number or
Worker name, will not write into a non-empty directory, **will not run at all
while this repo has uncommitted changes**, and exits non-zero saying which check
failed rather than printing a summary it has not earned.

**Two things are still yours afterwards**, and it prints both: their Supabase
project, and their logo and icons.

### Keeping a store up to date

```
node drift.mjs /path/to/their-hub
```

A clone has no shared history with this repo, so `git merge` and
`git cherry-pick` cannot work. Every upstream change is a deliberate port. This
sorts every shared file into safe to adopt, needs a hand port, and their own
customisation, reading the baseline out of their `SYNCED-FROM.md`.

⚠️ **A file in the "safe to adopt" bucket is a lead, not a verdict.** The tool
compares bytes, so it cannot see that a change was half of a two-file fix. On
the first real sync, **every one of the six files that looked safe needed a
companion.**

### Checking what actually ships

```
node scrubcheck.mjs "Gate City" "Peak Reachers"      # which source line ships it
node scrubcheck.mjs --dist --count "Gate City"       # how many reach the bundle
```

⚠️ **Build a store and sweep it. Do not read the script.** Reading found nothing.
Building a real snapshot and sweeping it found five leaks that reading had
missed, including this store's logo on another store's phones and this store's
legal name signing their HR emails.

⚠️ `--dist` has no word boundaries, so a short word matches inside ordinary
words in a minified chunk. Trust multi-word terms; check a short one against the
source arm before believing it.
