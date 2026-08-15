/* ═══════════════════════════════════════════════════════════════════
   pdfText.js — pull the rows out of a downloaded PDF.

   ★ WHY. Matt, Aug 10 2026: "for a new store we have to assume they
   don't use Claude, so the paste boxes need to accept the downloaded
   PDF or files from wherever they are getting them." Corp reports come
   down as PDFs and a new store has no other way in.

   ⚠️ pdfjs IS LOADED ON DEMAND, NEVER AT MODULE SCOPE. It is about a
   megabyte. A static import would put it in the entry chunk and every
   one of ~106 people would download it on every cold load, on store
   wifi, to open a dashboard — for a feature two tiles use and only when
   somebody actually picks a PDF. The dynamic import below means Vite
   splits it into its own chunk that is fetched the first time a PDF is
   dropped and never otherwise.

   ⚠️ THIS FILE IS NOT A LEAF and must not be imported by worker.js.
   It reaches for pdfjs and a Worker URL, neither of which exists in a
   Cloudflare Worker. Browser only.

   ⚠️ WHAT IT CANNOT DO, SAID PLAINLY. A PDF has no columns. It has
   glyphs at coordinates. This reconstructs rows from those coordinates,
   which works on the report-style PDFs corp produces and will NOT work
   on a scanned page (no text layer at all) or a heavily designed one.
   That is why the import box still shows the parsed preview and the
   column mapper before anything is written: the human confirms, every
   time. Never make a PDF import skip that step.
   ═══════════════════════════════════════════════════════════════════ */

let _pdfjs = null;

/* One load, reused. The worker URL is resolved through Vite's `?url`
   so it is hashed and served from our own origin like every other
   asset — no CDN, which also keeps it inside the CSP. */
async function loadPdfjs() {
  if (_pdfjs) return _pdfjs;
  const [lib, worker] = await Promise.all([
    import("pdfjs-dist/build/pdf.mjs"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  lib.GlobalWorkerOptions.workerSrc = worker.default;
  _pdfjs = lib;
  return lib;
}

/* Two glyphs belong to the same ROW when their baselines are within
   this many PDF units. Report rows sit 10-14 units apart and the
   glyphs inside one row rarely differ by more than 1, so 3 separates
   rows without splitting a row that has a slightly raised character. */
const ROW_TOLERANCE = 3;

/* A horizontal gap this wide means a new COLUMN rather than a space.
   Tuned to be forgiving: too small and every word becomes its own
   column; too large and two columns merge into one cell. The column
   mapper downstream can survive extra columns far better than merged
   ones, so this errs small. */
const COL_GAP = 12;

/** Rebuild tab-separated rows from one page's positioned text. */
function pageToRows(items) {
  const rows = [];
  for (const it of items) {
    const str = typeof it.str === "string" ? it.str : "";
    if (!str.trim()) continue;
    /* transform is [a,b,c,d,e,f]; e is x and f is y. */
    const t = Array.isArray(it.transform) ? it.transform : [1, 0, 0, 1, 0, 0];
    const x = Number(t[4]) || 0;
    const y = Number(t[5]) || 0;
    const row = rows.find((r) => Math.abs(r.y - y) <= ROW_TOLERANCE);
    if (row) row.cells.push({ x, str });
    else rows.push({ y, cells: [{ x, str }] });
  }
  /* PDF y grows upward, so a bigger y is higher on the page: sort
     descending to read top to bottom. */
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    r.cells.sort((a, b) => a.x - b.x);
    let line = "";
    let prevEnd = null;
    for (const c of r.cells) {
      if (prevEnd === null) line = c.str;
      else line += (c.x - prevEnd > COL_GAP ? "\t" : " ") + c.str;
      /* No width on the item here, so approximate the glyph run's end
         from its start. Only the GAP matters, not the exact edge. */
      prevEnd = c.x + c.str.length * 4.6;
    }
    return line.replace(/[ \t]+$/g, "");
  });
}

/**
 * Read a PDF File into tab-separated text the import parsers already accept.
 * Resolves `{ ok, text }` or `{ ok: false, msg }` — it never throws, because
 * every caller is an onChange handler and an unhandled rejection there is a
 * button that silently does nothing.
 */
export async function pdfToText(file, { maxPages = 40 } = {}) {
  try {
    const pdfjs = await loadPdfjs();
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const pages = Math.min(doc.numPages, maxPages);
    const out = [];
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      out.push(...pageToRows(content.items || []));
    }
    /* ⚠️ A PDF WITH NO TEXT LAYER READS AS ZERO ROWS AND MUST SAY SO.
       Scans and photographed pages hit this. Returning "" would land an
       empty box and look like the app did nothing. */
    const text = out.join("\n").trim();
    if (!text) {
      return {
        ok: false,
        msg: "That PDF has no text in it — it is probably a scan or a photo. " +
             "Ask for the CSV or Excel version of the report instead.",
      };
    }
    const note = doc.numPages > pages
      ? `Read the first ${pages} pages of ${doc.numPages}. Check the preview covers what you need.`
      : "";
    return { ok: true, text, note };
  } catch (e) {
    return {
      ok: false,
      msg: "That PDF would not open. If it is password protected, save an " +
           "unlocked copy first, or use the CSV version of the report.",
    };
  }
}
