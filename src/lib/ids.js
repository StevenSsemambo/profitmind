/* Unique numeric ids. Numeric so existing <select> values and Number(id)
   lookups keep working, but never reused after a delete (the old
   max+1 approach handed a deleted product's id to the next new one,
   which silently re-attached old sales history to it).
   Date.now()*1000 + 0..999 stays below Number.MAX_SAFE_INTEGER until the
   year 2255. */
let last = 0;
export function newId() {
  let id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  if (id <= last) id = last + 1;
  last = id;
  return id;
}
