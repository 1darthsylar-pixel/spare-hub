/* ═══════════════════════════════════════════════════════════════════
   sheetText.js — pull the rows out of a downloaded Excel file.

   ★ WHY. Matt, Aug 15 2026: "All uploads should be able to upload file
   instead of copy and paste", after finding the team import had no file
   button at all. The deeper problem was underneath it: even the boxes
   that DID take a file refused `.xlsx`, and CFA Home's Employee List
   comes down as `.xlsx`. So a new Executive Director was pointed at a
   screen holding the one file type that screen would not read.

   ⚠️ THE OLD REFUSAL HAD A STALE REASON. `readDroppedFile` turned Excel
   away with "I cannot read an Excel file", and its own comment gave the
   cause: .xlsx needs a library and the repo was under the Aug 4 npm
   dependency freeze. That freeze lifted on Aug 10. The refusal outlived
   its reason by five days and cost a store its whole roster load.

   ⚠️ THE LIBRARY IS LOADED ON DEMAND, NEVER AT MODULE SCOPE, for exactly
   the reason pdfText.js gives for pdfjs: a static import puts it in the
   entry chunk and every one of ~106 people downloads it on every cold
   load, on store wifi, to open a dashboard. The dynamic import below
   means Vite splits it into its own chunk, fetched the first time
   somebody actually picks a spreadsheet and never otherwise.

   ⚠️ `read-excel-file` RATHER THAN SheetJS, and the choice is not close.
   SheetJS's npm package has not had a real release since 0.18.5 — they
   moved distribution to their own CDN, and a CDN is not an option here
   because the Hub serves everything from its own origin. This one is
   maintained (9.3.10, Aug 2026), READ-only, and read-only is the smaller
   surface in both senses: less to download, and nothing in it can write
   a file. Design rule 5 — an established library beats a hand-rolled zip
   and XML reader, which is what the alternative was.

   ⚠️ THIS FILE IS NOT A LEAF and must not be imported by worker.js.
   Browser only, same as pdfText.js.

   ⚠️ WHAT IT CANNOT DO, SAID PLAINLY. `.xls` (the old binary format),
   `.numbers` and Google Sheets links are NOT this format and are refused
   by name upstream in importFile.js. Reading their bytes as text would
   produce noise a column detector would happily turn into junk rows, and
   a silent bad import is far worse than an honest no.
   ═══════════════════════════════════════════════════════════════════ */

/* One cell → one clean string.
   ⚠️ TABS AND NEWLINES INSIDE A CELL ARE COLLAPSED, not kept. The output
   here is tab-separated text fed to parsers that split on tabs and
   newlines, so a cell containing either would silently invent a column
   or a row. An address field with a line break in it is the realistic
   case and it appears in the real CFA Home export. */
const cell = (c) => {
  if (c == null) return "";
  /* A date cell arrives as a Date, and String(Date) is
     "Mon Aug 11 2026 00:00:00 GMT+0000 (...)" — unreadable in a column
     and nothing downstream parses it. ISO date only, no clock. */
  const s = c instanceof Date ? c.toISOString().slice(0, 10) : String(c);
  return s.replace(/[\t\r\n]+/g, " ").trim();
};

/**
 * Read a spreadsheet File into tab-separated text the import parsers already
 * accept. Resolves `{ ok, text, note }` or `{ ok: false, msg }` — it never
 * throws, because every caller is an onChange handler and an unhandled
 * rejection there is a button that silently does nothing.
 */
export async function sheetToText(file) {
  try {
    /* ⚠️⚠️ `read-excel-file/browser`, NOT `read-excel-file`. The package has NO
       "." entry in its exports map — only ./browser, ./node, ./universal and
       ./web-worker. A bare import type-checks and runs fine under Node's
       resolver but fails the Vite build outright with "Missing '.' specifier".
       Caught by the build, not by reading, which is why the import specifier is
       named here rather than left to a default. */
    const mod = await import("read-excel-file/browser");
    const readXlsx = mod.default || mod;
    const raw = await readXlsx(file);

    /* ⚠️ TWO RETURN SHAPES, AND THE SECOND ONE IS NOT DOCUMENTED WELL.
       Normally this resolves to an array of rows. On the real CFA Home
       export it resolved to `[{ sheet, data }]` instead — one entry per
       sheet, rows under `data`. Measured on Brady's actual file, not
       guessed. Handling only the first shape returned "1 row" and read
       nothing. */
    const sheets = Array.isArray(raw) && raw.length && raw[0] && Array.isArray(raw[0].data)
      ? raw
      : [{ sheet: "", data: Array.isArray(raw) ? raw : [] }];

    /* ⚠️ THE FIRST SHEET ONLY, AND IT SAYS SO WHEN THERE ARE MORE.
       Concatenating sheets would run a second header row into the middle
       of the data, which every parser here would read as a person called
       "Full Name". */
    const first = sheets[0];
    const rows = Array.isArray(first.data) ? first.data : [];
    const text = rows
      .map((r) => (Array.isArray(r) ? r.map(cell).join("\t") : cell(r)))
      /* Trailing empty rows are normal in a spreadsheet and would become
         blank lines the parsers count as rows. */
      .filter((line) => line.replace(/\t/g, "").trim())
      .join("\n");

    if (!text.trim()) {
      return {
        ok: false,
        msg: "That spreadsheet came through empty. If the rows are on a second " +
             "tab, move them to the first one and try again.",
      };
    }

    const note = sheets.length > 1
      ? `Read the first tab${first.sheet ? ` ("${first.sheet}")` : ""} of ${sheets.length}. ` +
        "Check the preview covers what you need."
      : "";
    return { ok: true, text, note };
  } catch (e) {
    return {
      ok: false,
      msg: "That spreadsheet would not open. If it is password protected, save " +
           "an unlocked copy first. If it is an older .xls file, open it and " +
           "save it as .xlsx or CSV.",
    };
  }
}
