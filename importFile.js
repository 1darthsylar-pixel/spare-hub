/* ═══════════════════════════════════════════════════════════════════
   importFile.js — turn a dropped or picked FILE into text an import box
   can parse. One definition, for every paste box in the Hub.

   ★ WHY IT IS ITS OWN FILE. Matt, Aug 15 2026: "All uploads should be
   able to upload file instead of copy and paste ... for all upload
   boxes". This function already existed — as a private `readDroppedFile`
   inside CatalogImportBox.jsx, reachable by exactly one screen out of
   the seven that have a paste box. Design rule 8: the thing that decides
   which files the Hub accepts must not have two versions of itself, and
   it was one copy away from having them.

   ⚠️ WHAT IT IS FOR. Every caller hands the result straight to the same
   parser a PASTE goes through. This turns bytes into text and nothing
   else — no column detection, no writing, no guessing. That keeps the
   preview-and-confirm step in front of every import, which is the thing
   that stops a bad file becoming bad data.

   ⚠️ IT NEVER THROWS. Every caller is an onChange or onDrop handler, and
   an unhandled rejection in one of those is a button that silently does
   nothing — check 3's signature symptom. Every path returns an object.

   ⚠️ REFUSING LOUDLY IS A FEATURE, NOT A GAP. A format we cannot read is
   named, with the one thing to do instead. Reading a binary container's
   bytes as text produces mojibake that a column detector will happily
   turn into junk rows, and Apply would WRITE them. A silent bad import
   is far worse than an honest no.
   ═══════════════════════════════════════════════════════════════════ */

/* ⚠️ EXTENSION FIRST, MIME TYPE ONLY AS A FALLBACK. iOS hands over
   "application/octet-stream" for a .csv often enough that trusting
   `file.type` alone rejects real spreadsheets on the device most of
   these people are holding. */
const TEXT_EXT = /\.(csv|tsv|txt|tab|text)$/i;
const PDF_EXT = /\.pdf$/i;
const XLSX_EXT = /\.xlsx$/i;
/* Named separately from .xlsx because each one needs a DIFFERENT sentence
   about what to do next, and "spreadsheet" as one bucket gave people the
   wrong instruction. */
const XLS_EXT = /\.xls$/i;
const NUMBERS_EXT = /\.numbers$/i;
const DOC_EXT = /\.(pages|docx?|rtf|odt)$/i;
const IMAGE_EXT = /\.(png|jpe?g|heic|heif|gif|webp)$/i;

/** Every extension the picker should offer. One list, so the `accept`
 *  attribute and the code that reads the file can never disagree. */
export const IMPORT_ACCEPT = [
  ".csv", ".tsv", ".txt", ".tab",
  ".xlsx",
  ".pdf",
  "text/csv", "text/plain", "text/tab-separated-values",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

/** What to tell somebody, in one short line, about what they can drop.
 *  Exported so every box says the SAME thing — the instructions were the
 *  other half of Matt's ask and they were different on every screen. */
export const IMPORT_HINT = "Drop a file, pick one, or paste the rows in. Excel, CSV and PDF all work.";

/**
 * Read a File into text an import parser accepts.
 * Resolves `{ ok: true, text, note? }` or `{ ok: false, msg }`.
 */
export async function readImportFile(file) {
  if (!file) return { ok: false, msg: "" };
  const name = String(file.name || "");
  const type = String(file.type || "");

  /* ── Excel ────────────────────────────────────────────────────────
     ⚠️ THIS IS THE ONE THAT USED TO BE REFUSED, and refusing it was the
     bug. CFA Home's Employee List downloads as .xlsx, so "upload a file"
     that cannot read .xlsx does not solve the problem it was asked to
     solve. Loaded on demand — see sheetText.js. */
  if (XLSX_EXT.test(name) || /spreadsheetml\.sheet/.test(type)) {
    const { sheetToText } = await import("./sheetText.js");
    return sheetToText(file);
  }

  /* ── PDF ──────────────────────────────────────────────────────────
     Corp reports come down as PDFs and a new store often has no other
     way in. Also loaded on demand. */
  if (PDF_EXT.test(name) || type === "application/pdf") {
    const { pdfToText } = await import("./pdfText.js");
    return pdfToText(file);
  }

  /* ── Text ─────────────────────────────────────────────────────────
     A .csv or .tsv IS the text a paste would have been, so it goes
     straight through with no library at all. */
  if (TEXT_EXT.test(name) || /^text\//.test(type)) {
    try {
      const t = await file.text();
      return t && t.trim()
        ? { ok: true, text: t }
        : { ok: false, msg: "That file came through empty." };
    } catch {
      return { ok: false, msg: "That file would not open. Try pasting the rows in instead." };
    }
  }

  /* ── The honest noes, each with its own next step ─────────────────
     ⚠️ ONE SENTENCE PER FORMAT, NOT ONE FOR ALL OF THEM. "Unsupported
     file" tells somebody nothing they can act on. What each of these
     needs is genuinely different. */
  if (XLS_EXT.test(name)) {
    return {
      ok: false,
      msg: "That is the old Excel format. Open it, choose Save As, pick Excel " +
           "Workbook (.xlsx) or CSV, and send that one.",
    };
  }
  if (NUMBERS_EXT.test(name)) {
    return {
      ok: false,
      msg: "I cannot read a Numbers file. In Numbers choose File, Export To, CSV — " +
           "and use that. Exporting is not the same as saving, so do not skip it.",
    };
  }
  if (DOC_EXT.test(name)) {
    return {
      ok: false,
      msg: "I cannot read a Word or Pages file. Select the rows inside it and paste them in.",
    };
  }
  if (IMAGE_EXT.test(name) || /^image\//.test(type)) {
    return {
      ok: false,
      msg: "That is a picture, so there is no text in it to read. Send the report " +
           "itself — the CSV, Excel or PDF download.",
    };
  }
  return {
    ok: false,
    msg: "I cannot read that kind of file. Excel, CSV and PDF all work, or paste the rows in.",
  };
}
