// TermArchive.empty.js — the version a new store gets. `newstore.mjs` copies
// this over TermArchive.js while it builds the snapshot.
//
// ⚠️⚠️ THE FILE THIS REPLACES IS THE MOST SENSITIVE ONE IN THE REPO. It is
// 4,000 lines of one store's real termination records: every person who has
// left since 2021, the date, whether they are eligible for rehire, and a
// free-text note saying why they were let go. "no call/no show for the second
// time", "termed for attendance first 30 days". Those are real people, and none
// of them agreed to have that travel to another restaurant.
//
// ⚠️ IT IS IMPORTED BY worker.js ONLY, so it never reaches a browser bundle and
// a client-side name sweep will not find it. That is exactly why it needs to be
// on the swap list rather than left to a grep: the safest-looking file here is
// the one carrying the worst of it.
//
// ⚠️ AN EMPTY ARRAY IS THE HONEST ANSWER to "who has left this store" before
// anyone has, and every reader already handles it: the route answers
// `{ archive: [] }` and the Terminated tab renders nothing.
//
// ⇒ Fill this only from THIS store's own records, if at all. It is a historical
// import from spreadsheet tabs, not a live system. Somebody leaving today goes
// through the status flag in KV and needs nothing here.
export const TERM_ARCHIVE = [];
