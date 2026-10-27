/* ------------------------------------------------------------------ */
/* Notifications — safe on phones. Android Chrome and installed apps    */
/* FORBID `new Notification()` (it throws "Illegal constructor"); they  */
/* require the service worker to show it. Every function here swallows  */
/* its own errors and reports success as true/false, so a notification  */
/* problem can never take the app down.                                 */
/* ------------------------------------------------------------------ */

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

// 'unsupported' | 'default' | 'granted' | 'denied'
export function currentPermission() {
  try {
    return notificationsSupported() ? Notification.permission || "default" : "unsupported";
  } catch {
    return "unsupported";
  }
}

// Works with both the modern promise form and old callback-only browsers.
// -> permission string, or 'error' if the browser itself failed.
export async function requestNotificationPermission() {
  if (!notificationsSupported()) return "unsupported";
  try {
    const result = await new Promise((resolve, reject) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      try {
        const maybe = Notification.requestPermission(done); // old browsers call back
        if (maybe && typeof maybe.then === "function") maybe.then(done, reject); // modern browsers return a promise
        else if (maybe) done(maybe);
      } catch (e) { reject(e); }
    });
    return result || currentPermission();
  } catch {
    return "error";
  }
}

async function serviceWorkerRegistration(timeoutMs = 2500) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}

// Shows a notification. -> true if one was shown, false if it couldn't be.
export async function showAppNotification(title, { body = "", tag = "profitmind", tab = null, onClick } = {}) {
  if (currentPermission() !== "granted") return false;
  const options = { body, tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { tab } };

  // 1. The way phones require: through the service worker.
  try {
    const reg = await serviceWorkerRegistration();
    if (reg && typeof reg.showNotification === "function") {
      await reg.showNotification(title, options);
      return true;
    }
  } catch { /* fall through to the desktop path */ }

  // 2. Desktop browsers without a service worker.
  try {
    const n = new Notification(title, options);
    n.onclick = () => { try { window.focus(); if (onClick) onClick(); n.close(); } catch { /* ignore */ } };
    return true;
  } catch {
    return false;
  }
}
