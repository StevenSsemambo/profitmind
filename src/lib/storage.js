/* ------------------------------------------------------------------ */
/* Storage — the original build (an in-chat Claude artifact) used a     */
/* host-provided `window.storage` key/value API. Outside that host      */
/* there's no such thing, so this is a drop-in replacement with the      */
/* same async get/set/delete shape, backed by the browser's own          */
/* localStorage. It's swapped in everywhere the app used to reach for   */
/* `window.storage` directly, so the rest of the app didn't need to      */
/* change shape at all.                                                 */
/*                                                                       */
/* `shared` is accepted for interface compatibility but has no real      */
/* meaning on a single device with no backend — everything is local     */
/* to this browser. If this app grows a real backend later, swap this   */
/* file out for one that calls your API and every caller keeps working. */
/* ------------------------------------------------------------------ */
const PREFIX = "profitmind:";

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export const storage = {
  async get(key) {
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      if (raw === null) return null;
      return { key, value: raw, shared: false };
    } catch {
      return null;
    }
  },

  async set(key, value) {
    try {
      window.localStorage.setItem(PREFIX + key, value);
      return { key, value, shared: false };
    } catch {
      return null;
    }
  },

  async delete(key) {
    try {
      window.localStorage.removeItem(PREFIX + key);
      return { key, deleted: true, shared: false };
    } catch {
      return null;
    }
  },

  async list(prefix = "") {
    try {
      const keys = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(PREFIX + prefix)) keys.push(k.slice(PREFIX.length));
      }
      return { keys, prefix, shared: false };
    } catch {
      return null;
    }
  },

  _safeParse: safeParse,
};

export const STORAGE_KEY = "profitmind-data";
