/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./*.{js,jsx}"],
  /* ⚠️ NOT A CLASS ANYBODY WROTE. Tailwind scans the raw TEXT of every file in
     `content`, so a regex character class reads to it exactly like an arbitrary
     property. `/[-:,]+$/` in FOHAutoAssign.js became the candidate `[-:,]`,
     which Tailwind emitted as

         .\[-\:\2c \] { -: ,; }

     — a declaration whose property is a bare hyphen. esbuild rejected it on
     every build ("Expected identifier but found \"-\"") and dropped it, so the
     only symptom was a warning nobody could place.
     ⚠️ BLOCKED HERE RATHER THAN REWRITING THE REGEX. The regex lives in
     FOHAutoAssign.js, an ENGINE file: changes there only take effect on
     re-import, which rebuilds the day and wipes leaders' manual board edits.
     Putting a cosmetic diff into a file with that deploy rule attached is a
     bad trade when Tailwind has a one-line facility for exactly this.
     ⚠️ IF THIS WARNING COMES BACK it will be a NEW regex, not this one. Build
     with `cssMinify: false`, find the malformed rule in the emitted CSS, and
     unescape its selector to get the string to add here. */
  blocklist: ["[-:,]"],
  theme: {
    extend: {},
  },
  plugins: [],
};
