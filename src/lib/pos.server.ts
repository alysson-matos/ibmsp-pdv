/**
 * Server-side Supabase access for the PDV tables of the store chosen in the session.
 * These tables are closed to the browser (no anon/authenticated grants, RLS with no
 * policies), so every read/write goes through server functions using the service role,
 * and every query must be filtered by the returned `storeId`.
 * `scope: "manage"` = admin or the store's manager; `"any"` = anyone with access to the store.
 */
export async function getStoreSupabase(scope: "manage" | "any" = "manage") {
  const { requireStore } = await import("./gate.server");
  return requireStore(scope);
}
