/* ══════════════════════════════════════════════════════════════════════════
   backupWalk.js — LIST EVERY OBJECT IN A BUCKET, INCLUDING THE ONES IN FOLDERS.

   🐛🐛 THE BUG THIS EXISTS FOR, MEASURED ON THE LIVE STORE Aug 21 2026.
   `backupListBucket` asked Supabase for `prefix: ""` once per bucket and never
   descended. Supabase's storage list is FOLDER-SCOPED: at `""` it returns the
   objects sitting at the top level, plus one placeholder row per folder. The
   old loop skipped the placeholders (correctly, they are not objects) and
   stopped. So anything inside a folder was never listed, never copied, and
   never missed.

   ⇒ Counted against the store's own `storage.objects` the day this was found:

        bucket                files   in a folder   backed up
        hr-files                436           436           0
        l101-coursework          44            44           0
        Receipts                 41            41           0
        food-safety-photos       27            27           0
        trainer-task-photos      26            26           0
        hub-assets               21             2          19
        TOTAL                   595           576          19

   ⭐ **19 of 595, and the manifest said `ok`.** Every HR document the store has
   ever uploaded is in the zero column, because `HRConsole.jsx` writes them
   under `<member id>/`. Nearly every upload path in the app writes into a
   folder, so the one bucket with anything at its top level is the one holding
   logos.

   ⚠️⚠️ THIS IS THE SAME FAILURE THE TABLE HALF OF THE BACKUP ALREADY FIXED,
   ONE FLOOR DOWN. That half's own comment says a single unpaged GET "would
   have saved 1,000 of 1,379 keys, answered ok: true with a confident row
   count, and written a file that LOOKS like a backup. Nobody finds out until
   the day they need it." A folder is the same trap wearing different clothes:
   not a cap this time, a horizon.

   ⚠️ IT IS A LEAF ON PURPOSE — no imports, no fetch, no Worker globals. The
   walk lives here rather than in `worker.js` because nothing in `checks/` can
   import `worker.js`, which is precisely why a backup that copied 3% of the
   store shipped green. The caller injects the listing; this file decides where
   to look and when to refuse. See `backupWalk.test.mjs`.
   ══════════════════════════════════════════════════════════════════════════ */

/* ⚠️ A FOLDER PLACEHOLDER HAS NO `metadata`, AND THAT IS THE ONLY THING THAT
   TELLS THE TWO APART. Supabase returns `{ name, metadata: null, id: null }`
   for a folder and `{ name, metadata: { size, mimetype }, updated_at }` for an
   object. The old code already used this test to SKIP folders; the only change
   is that a folder is now somewhere to go rather than something to ignore. */
export const isFolderRow = (row) => !!(row && row.name && !row.metadata);
export const isObjectRow = (row) => !!(row && row.name && row.metadata);

/** Walk one bucket breadth-first and return every object under it.
 *
 *  `list(prefix, offset)` must return one raw page, exactly as the storage API
 *  gives it. It is injected so this file never learns what a fetch is.
 *
 *  Returns `[{ name, size, updatedAt }]` where `name` is the FULL path from the
 *  bucket root ("tm16/handbook.pdf"), which is what both the copy and the R2
 *  key already expect.
 *
 *  ⛔ IT THROWS RATHER THAN RETURNING WHAT IT MANAGED TO GET. Same rule as the
 *  table half, and for the same reason: a partial backup that reports success
 *  is worse than none, because it stops anybody looking for the real one.
 */
export async function walkBucket(list, opts = {}) {
  const pageSize = Number(opts.pageSize) || 100;
  const maxFiles = Number(opts.maxFiles) || 20000;
  /* A runaway guard, not a shape rule. Nothing in this app nests anywhere near
     this deep; the cap exists so a listing that somehow returns itself as its
     own child fails loudly instead of looping until the Worker is killed. */
  const maxDepth = Number(opts.maxDepth) || 12;
  const label = opts.label ? String(opts.label) : "bucket";

  const out = [];
  /* Breadth-first, so the shallow files land in the manifest first and a
     refusal deep in one folder still names the level it died at. */
  const queue = [{ prefix: "", depth: 0 }];
  /* ⚠️ A PREFIX IS VISITED ONCE. Two placeholders naming one folder is not a
     shape we have seen, but re-walking it would double every file under it in
     the manifest, and a manifest that lists a file twice is a manifest nobody
     can count. */
  const seen = new Set([""]);

  while (queue.length) {
    const { prefix, depth } = queue.shift();
    if (depth > maxDepth) {
      throw new Error(`${label} nests deeper than ${maxDepth} at "${prefix}"; refusing to write a partial manifest`);
    }

    for (let offset = 0; ; offset += pageSize) {
      if (out.length > maxFiles) {
        throw new Error(`${label} passed ${maxFiles} objects; refusing to write a partial manifest`);
      }
      const page = await list(prefix, offset);
      if (!Array.isArray(page)) throw new Error(`${label} listing gave no array at "${prefix}"`);

      for (const row of page) {
        if (isObjectRow(row)) {
          out.push({
            name: prefix + String(row.name),
            size: Number(row.metadata.size) || 0,
            updatedAt: String(row.updated_at || ""),
          });
        } else if (isFolderRow(row)) {
          const next = prefix + String(row.name) + "/";
          if (!seen.has(next)) { seen.add(next); queue.push({ prefix: next, depth: depth + 1 }); }
        }
        /* Anything else is a row shape we do not understand. It is skipped
           rather than guessed at, and it cannot be silently lost: an object we
           failed to recognise simply is not in the manifest, and the manifest
           is what a restore reads. If that ever matters it shows up as a count
           that does not match the bucket, which is the check to run. */
      }

      /* ⚠️⚠️ THE CAP IS CHECKED TWICE, AND THE SECOND ONE IS THE REAL GUARD.
         Checked only at the top of this loop it fires a page LATE, and never at
         all when one page already holds everything — a `limit` larger than the
         bucket means the first page returns the lot, `page.length < pageSize`
         breaks, and the cap is never consulted again. That is a runaway guard
         that silently permits the runaway. Found by `backupWalk.test.mjs`
         section 5, which is the whole reason this walk is a leaf. */
      if (out.length > maxFiles) {
        throw new Error(`${label} passed ${maxFiles} objects; refusing to write a partial manifest`);
      }

      if (page.length < pageSize) break;
    }
  }

  return out;
}
