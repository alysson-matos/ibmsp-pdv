const LAST_RESTART_KEY = "pdv:last-restart";
const MIN_INTERVAL_MS = 5_000;

/**
 * Reloads the app from the start ("/"), which shows the login or the store picker.
 *
 * Used when the server session no longer matches what the page shows (expired
 * session, store switched). Re-running loaders in place isn't enough there: the
 * mounted store pages keep refetching, failing and invalidating the router, so the
 * new access never gets committed and the tab loops forever.
 *
 * Automatic restarts are throttled so a page that keeps failing can't reload in a
 * loop; returns false when skipped. `force` is for explicit user actions.
 */
export function restartApp({ force = false } = {}): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(window.sessionStorage.getItem(LAST_RESTART_KEY) ?? 0);
    if (!force && Date.now() - last < MIN_INTERVAL_MS) return false;
    window.sessionStorage.setItem(LAST_RESTART_KEY, String(Date.now()));
  } catch {
    /* storage blocked: restart anyway */
  }
  window.location.replace("/");
  return true;
}
