/* backupWalk.test.mjs — does the nightly file backup actually see the store?

   ⚠️ THE ASSERTION THAT MATTERS IS SECTION 2, AND IT IS A CONTROL. It rebuilds
   the OLD flat listing and proves it finds almost nothing against the same
   fixture. Without it, section 3 passing would be equally consistent with a
   fixture that has no folders in it, which is exactly how the real bug shipped
   green for weeks. A test that passes both ways is not a test. */
import { walkBucket, isFolderRow, isObjectRow } from "./backupWalk.js";

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

/* A fake bucket with Supabase's FOLDER-SCOPED semantics, which is the whole
   thing under test. Given a flat set of paths it answers, for one prefix: the
   objects sitting directly at that level, plus one placeholder per folder. It
   does NOT return anything deeper, because the real API does not either. */
function fakeBucket(paths, pageSize = 100) {
  let calls = 0;
  const list = async (prefix, offset) => {
    calls++;
    const under = paths.filter((p) => p.startsWith(prefix));
    const objects = [], folders = new Set();
    for (const p of under) {
      const rest = p.slice(prefix.length);
      const cut = rest.indexOf("/");
      if (cut < 0) objects.push(rest);
      else folders.add(rest.slice(0, cut));
    }
    const rows = [
      ...[...folders].sort().map((n) => ({ name: n, id: null, metadata: null })),
      ...objects.sort().map((n) => ({ name: n, id: n, metadata: { size: n.length }, updated_at: "2026-08-21T03:00:00Z" })),
    ];
    return rows.slice(offset, offset + pageSize);
  };
  return { list, calls: () => calls };
}

/* The store's real shape, measured from storage.objects on Aug 21 2026.
   ⚠️ INVENTED FILENAMES, REAL STRUCTURE. Roster ids and document names are the
   store's own data and must never be typed into a file that travels. */
const REAL_SHAPE = [
  "logo.png", "icon-192.png", "icon-512.png",          // hub-assets top level
  "brand/mark.svg", "brand/wordmark.svg",              // hub-assets in a folder
  "tm16/handbook.pdf", "tm16/policy-2026.pdf",         // hr-files, per member
  "tm41/handbook.pdf",
  "sop/opening.pdf", "sop/closing.pdf",                // the SOP library
  "2026-08/short-0814.jpg",                            // cash audit
  "team-goals/q3.png",
];

group("0. the module imported and really runs (controls)");
{
  t("walkBucket is a function", typeof walkBucket === "function");
  t("isFolderRow is a function", typeof isFolderRow === "function");
  t("isObjectRow is a function", typeof isObjectRow === "function");
  t("a folder row is not an object row", isFolderRow({ name: "sop", metadata: null }) && !isObjectRow({ name: "sop", metadata: null }));
  t("an object row is not a folder row", isObjectRow({ name: "a.pdf", metadata: { size: 1 } }) && !isFolderRow({ name: "a.pdf", metadata: { size: 1 } }));
}

group("1. the fixture itself behaves like Supabase (control)");
{
  const { list } = fakeBucket(REAL_SHAPE);
  const top = await list("", 0);
  t("control: the fixture really is folder-scoped", top.some((r) => !r.metadata) && top.some((r) => r.metadata));
  t("control: it hides what is inside a folder", !top.some((r) => String(r.name).includes("/")));
  const inSop = await list("sop/", 0);
  t("control: it reveals that folder when asked", inSop.length === 2 && inSop.every((r) => !!r.metadata));
}

group("2. ⛔ THE OLD BEHAVIOUR, REBUILT — it finds almost nothing");
{
  /* This is the shipped code's whole listing, in three lines. */
  const { list } = fakeBucket(REAL_SHAPE);
  const flat = (await list("", 0)).filter(isObjectRow).map((r) => r.name);
  t("control: the old way found SOMETHING, so this proves a contrast", flat.length > 0);
  t("the old way finds 3 of 12", flat.length === 3 && REAL_SHAPE.length === 12);
  t("it misses every HR document", !flat.some((n) => n.startsWith("tm")));
  t("it misses the whole SOP library", !flat.some((n) => n.includes("sop")));
}

group("3. the walk finds every object");
{
  const { list } = fakeBucket(REAL_SHAPE);
  const got = await walkBucket(list, { label: "hr-files" });
  const names = got.map((o) => o.name).sort();
  t("it finds all 12", got.length === 12);
  t("every path is the FULL path from the bucket root", names.join("|") === [...REAL_SHAPE].sort().join("|"));
  t("nothing is listed twice", new Set(names).size === names.length);
  t("no folder became a file", !got.some((o) => o.name.endsWith("/")));
  t("sizes and dates come through", got.every((o) => Number.isFinite(o.size) && o.updatedAt === "2026-08-21T03:00:00Z"));
}

group("4. paging, at a page size that forces several rounds");
{
  const many = Array.from({ length: 250 }, (_, i) => `tm${i}/handbook.pdf`);
  const { list, calls } = fakeBucket(many, 100);
  const got = await walkBucket(list, { pageSize: 100, label: "hr-files" });
  t("every one of 250 nested files is found", got.length === 250);
  t("it really paged rather than getting lucky", calls() > 250);
}

group("5. ⛔ it refuses rather than truncating");
{
  const many = Array.from({ length: 60 }, (_, i) => `f${i}.pdf`);
  let threw = "";
  try { await walkBucket(fakeBucket(many).list, { maxFiles: 10, label: "hr-files" }); }
  catch (e) { threw = String(e.message); }
  t("past the runaway cap it throws", threw.includes("passed 10 objects"));
  t("and the message says it is refusing a partial", threw.includes("refusing to write a partial manifest"));

  let deep = "";
  const nested = ["a/b/c/d/e/f/g/h.pdf"];
  try { await walkBucket(fakeBucket(nested).list, { maxDepth: 3, label: "hr-files" }); }
  catch (e) { deep = String(e.message); }
  t("past the depth cap it throws", deep.includes("nests deeper than 3"));

  let bad = "";
  try { await walkBucket(async () => null, { label: "hr-files" }); }
  catch (e) { bad = String(e.message); }
  t("a listing that is not an array throws", bad.includes("gave no array"));
  t("⚠️ it never returns a short list quietly", threw !== "" && deep !== "" && bad !== "");
}

group("6. an empty bucket is a real answer, not a failure");
{
  const got = await walkBucket(fakeBucket([]).list, { label: "hub-assets" });
  t("an empty bucket returns []", Array.isArray(got) && got.length === 0);
}

console.log(`\n${fail ? "FAIL" : "PASS"}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
