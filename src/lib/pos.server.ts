import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Server-side Supabase client for the PDV tables.
 * These tables are closed to the browser (no anon/authenticated grants, RLS with no
 * policies), so every read/write goes through server functions using the service role.
 */
export function getServerSupabase() {
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
  const url = process.env["SUPABASE_URL"]!;

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}
