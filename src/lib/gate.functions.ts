import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type GateRole = "admin" | "user";
export type StoreRole = "admin" | "gerente" | "operacao";

/** What the app needs to show a store: its name and design. */
export type StoreTheme = {
  id: string;
  name: string;
  color: string;
  font: string;
  logo: string | null;
  active: boolean;
  /** Sales can be paid with a balance loaded in advance for registered customers. */
  customer_balance: boolean;
  /** Direct sale: the customer leaves with the product, so there is no Expedição queue. */
  skip_shipping: boolean;
  /** Retro desktop look (Windows 95 window) instead of the default one. */
  retro_look: boolean;
};

export type Access = {
  role: GateRole;
  userName: string;
  /** Stores this person can enter (the admin sees all, including inactive ones). */
  stores: StoreTheme[];
  /** The store chosen after login, if any. */
  store: (StoreTheme & { storeRole: StoreRole }) | null;
};

// "*" instead of a column list: a column whose migration hasn't been applied yet
// (retro_look) then reads as off instead of breaking the login for everyone.
const STORE_COLUMNS = "*";

type StoreRow = Omit<StoreTheme, "retro_look"> & { retro_look?: boolean | null };

export function toStoreTheme(row: StoreRow): StoreTheme {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    font: row.font,
    logo: row.logo,
    active: row.active,
    customer_balance: row.customer_balance,
    skip_shipping: row.skip_shipping,
    retro_look: row.retro_look === true,
  };
}

export const getAccess = createServerFn({ method: "GET" }).handler(async (): Promise<Access | null> => {
  const { getGateSession, serviceSupabase, storeRoleFor } = await import("./gate.server");
  const session = await getGateSession();
  const data = session.data;
  if (!data.role) return null;

  const supabase = serviceSupabase();
  let stores: StoreTheme[];

  if (data.role === "admin") {
    const { data: rows, error } = await supabase
      .from("stores")
      .select(STORE_COLUMNS)
      .order("sort_order")
      .order("name");
    if (error) throw new Error(error.message);
    stores = (rows ?? []).map(toStoreTheme);
  } else {
    const { data: user } = await supabase
      .from("app_users")
      .select("active")
      .eq("id", data.userId ?? "")
      .maybeSingle();
    if (!user?.active) {
      // User removed or deactivated: back to the login screen.
      await session.clear();
      return null;
    }
    const { data: rows, error } = await supabase
      .from("store_members")
      .select(`stores!inner(${STORE_COLUMNS})`)
      .eq("user_id", data.userId ?? "")
      .eq("stores.active", true);
    if (error) throw new Error(error.message);
    stores = (rows ?? [])
      .map((r) => r.stores as unknown as StoreRow & { sort_order: number })
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map(toStoreTheme);
  }

  // A user with a single store goes straight into it (no picker, no switching).
  if (data.role === "user" && !data.storeId && stores.length === 1) {
    data.storeId = stores[0]!.id;
    await session.update({ ...data });
  }

  let store: Access["store"] = null;
  if (data.storeId) {
    const found = stores.find((s) => s.id === data.storeId);
    const storeRole = found ? await storeRoleFor(supabase, data, found.id) : null;
    if (found && storeRole) store = { ...found, storeRole };
    else await session.update({ ...data, storeId: undefined });
  }

  return { role: data.role, userName: data.userName ?? "", stores, store };
});

export const unlock = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ username: z.string().default(""), password: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { resolveLogin, getGateSession } = await import("./gate.server");
    const login = await resolveLogin(data.username, data.password);
    if (!login) return { ok: false };
    const session = await getGateSession();
    await session.clear();
    await session.update(login);
    return { ok: true };
  });

export const lock = createServerFn({ method: "POST" }).handler(async () => {
  const { getGateSession } = await import("./gate.server");
  const session = await getGateSession();
  await session.clear();
  return { ok: true };
});

/** Enters a store (or leaves the current one with `storeId: null`). */
export const selectStore = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ storeId: z.string().uuid().nullable() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { getGateSession, serviceSupabase, storeRoleFor } = await import("./gate.server");
    const session = await getGateSession();
    if (!session.data.role) throw new Error("Sessão expirada. Entre novamente.");

    if (data.storeId) {
      const role = await storeRoleFor(serviceSupabase(), session.data, data.storeId);
      if (!role) throw new Error("Você não tem acesso a esta loja.");
    }
    await session.update({ ...session.data, storeId: data.storeId ?? undefined });
    return { ok: true };
  });
