import { useSession } from "@tanstack/react-start/server";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { redirect } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type GateRole = "admin" | "user";
/** Access level inside a store. The admin always has "admin" in every store. */
export type StoreRole = "admin" | "gerente" | "operacao";

export type GateSession = {
  role?: GateRole;
  /** app_users.id for regular users; absent for the admin. */
  userId?: string;
  userName?: string;
  /** Store chosen after login. */
  storeId?: string | undefined;
};

function sessionConfig() {
  return {
    password: process.env["SESSION_SECRET"]!,
    name: "pdv-gate",
    maxAge: 60 * 60 * 12,
    cookie: {
      httpOnly: true,
      // The app can run inside a cross-site iframe (preview), where only
      // SameSite=None; Secure cookies are sent back.
      secure: true,
      sameSite: "none" as const,
      path: "/",
    },
  };
}

export function getGateSession() {
  return useSession<GateSession>(sessionConfig());
}

/** Service-role client, without any access check. Callers must check access first. */
export function serviceSupabase() {
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

export type ServiceSupabase = ReturnType<typeof serviceSupabase>;

function matches(input: string, expected: string | undefined) {
  if (!expected) return false;
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = scryptSync(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

export const ADMIN_USERNAME = "admin";

/** Checks the credentials. The user name "admin" means the admin password. */
export async function resolveLogin(
  username: string,
  password: string,
): Promise<Pick<GateSession, "role" | "userId" | "userName"> | null> {
  const name = username.trim().toLowerCase();
  if (name === ADMIN_USERNAME) {
    return matches(password, process.env["ADMIN_PASSWORD"])
      ? { role: "admin", userName: "Administrador" }
      : null;
  }

  const { data: user } = await serviceSupabase()
    .from("app_users")
    .select("id, display_name, password_hash, active")
    .eq("username", name)
    .maybeSingle();
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) return null;
  return { role: "user", userId: user.id, userName: user.display_name };
}

export type StoreAccess = {
  role: GateRole;
  userId: string | null;
  storeId: string;
  storeRole: StoreRole;
};

/** Store role of the logged-in person in a store, or null without access. */
export async function storeRoleFor(
  supabase: ServiceSupabase,
  session: GateSession,
  storeId: string,
): Promise<StoreRole | null> {
  if (session.role === "admin") {
    const { data } = await supabase.from("stores").select("id").eq("id", storeId).maybeSingle();
    return data ? "admin" : null;
  }
  if (session.role !== "user" || !session.userId) return null;

  const { data } = await supabase
    .from("store_members")
    .select("role, stores!inner(active), app_users!inner(active)")
    .eq("store_id", storeId)
    .eq("user_id", session.userId)
    .eq("stores.active", true)
    .eq("app_users.active", true)
    .maybeSingle();
  if (!data) return null;
  return data.role === "gerente" ? "gerente" : "operacao";
}

const backToStart = () => redirect({ to: "/", reloadDocument: true });

/**
 * Store context for PDV data. Redirects to the start (login or store picker) when the
 * session expired, no store is chosen, or the access to the store was removed.
 * `scope: "manage"` = admin or the store's manager (gerente).
 */
export async function requireStore(scope: "manage" | "any") {
  const session = await getGateSession();
  const data = session.data;
  if (!data.role) throw backToStart();
  if (!data.storeId) throw backToStart();

  const supabase = serviceSupabase();
  const storeRole = await storeRoleFor(supabase, data, data.storeId);
  if (!storeRole) {
    await session.update({ ...data, storeId: undefined });
    throw backToStart();
  }
  if (scope === "manage" && storeRole === "operacao") {
    throw new Error("Acesso restrito ao gerente da loja.");
  }
  return { supabase, storeId: data.storeId, storeRole };
}

/** Only the admin password: manages stores and users. */
export async function requireAdmin() {
  const session = await getGateSession();
  if (!session.data.role) throw backToStart();
  if (session.data.role !== "admin") throw new Error("Acesso restrito ao administrador.");
  return serviceSupabase();
}
