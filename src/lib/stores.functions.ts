import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { toStoreTheme, type StoreTheme } from "./gate.functions";
import { STORE_FONT_KEYS, type StoreFont } from "./store-theme";

export type MemberRole = "gerente" | "operacao";
export const MEMBER_ROLES = ["operacao", "gerente"] as const;

export type AdminStore = StoreTheme & { sort_order: number };

export type AdminUser = {
  id: string;
  username: string;
  display_name: string;
  active: boolean;
  /** store_id -> access level */
  access: Record<string, MemberRole>;
};

/** Logos are resized in the browser before upload; this is a safety cap on the data URL. */
const MAX_LOGO_CHARS = 400_000;

export const adminListStores = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminStore[]> => {
    const { requireAdmin } = await import("./gate.server");
    const supabase = await requireAdmin();
    const { data, error } = await supabase
      .from("stores")
      // "*": see STORE_COLUMNS in gate.functions.ts.
      .select("*")
      .order("sort_order")
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({ ...toStoreTheme(row), sort_order: row.sort_order }));
  },
);

const storeInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Informe o nome da loja").max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida"),
  font: z.enum(STORE_FONT_KEYS as [StoreFont, ...StoreFont[]]),
  logo: z
    .string()
    .startsWith("data:image/", "Imagem inválida")
    .max(MAX_LOGO_CHARS, "Imagem muito grande")
    .nullable(),
  active: z.boolean(),
  customer_balance: z.boolean().default(false),
  skip_shipping: z.boolean().default(false),
  // Only sent when it changes, so stores can still be saved before the column exists.
  retro_look: z.boolean().optional(),
  sort_order: z.number().int().default(0),
});

export const saveStore = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => storeInput.parse(data))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./gate.server");
    const supabase = await requireAdmin();
    const { id, retro_look, ...rest } = data;
    const payload = retro_look === undefined ? rest : { ...rest, retro_look };

    if (id) {
      const { error } = await supabase.from("stores").update(payload).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: created, error } = await supabase
      .from("stores")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deleteStore = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./gate.server");
    const supabase = await requireAdmin();

    // Only empty stores can be deleted; otherwise sales history would be lost.
    const counts = await Promise.all(
      (["sales", "products", "operators"] as const).map((table) =>
        supabase.from(table).select("id", { count: "exact", head: true }).eq("store_id", data.id),
      ),
    );
    for (const res of counts) if (res.error) throw new Error(res.error.message);
    if (counts.some((res) => (res.count ?? 0) > 0)) {
      throw new Error(
        "Esta loja já tem produtos, operadores ou vendas. Desative-a em vez de excluir.",
      );
    }
    const { error } = await supabase.from("stores").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListUsers = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminUser[]> => {
    const { requireAdmin } = await import("./gate.server");
    const supabase = await requireAdmin();
    const { data, error } = await supabase
      .from("app_users")
      .select("id, username, display_name, active, store_members(store_id, role)")
      .order("display_name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((u) => ({
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      active: u.active,
      access: Object.fromEntries(
        (u.store_members ?? []).map((m) => [
          m.store_id,
          m.role === "gerente" ? "gerente" : "operacao",
        ]),
      ),
    }));
  },
);

const USERNAME_RULE = /^[a-z0-9._-]{2,32}$/;

export const saveUser = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        username: z
          .string()
          .trim()
          .toLowerCase()
          .regex(USERNAME_RULE, "Usuário: 2 a 32 letras minúsculas, números, ponto, hífen ou _"),
        display_name: z.string().trim().min(1, "Informe o nome").max(60),
        /** Required for new users; empty keeps the current password. */
        password: z.string().default(""),
        active: z.boolean().default(true),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { requireAdmin, hashPassword, ADMIN_USERNAME } = await import("./gate.server");
    const supabase = await requireAdmin();
    if (data.username === ADMIN_USERNAME) throw new Error('O usuário "admin" é reservado.');
    if (data.password && data.password.length < 4) {
      throw new Error("A senha precisa ter pelo menos 4 caracteres.");
    }
    if (!data.id && !data.password) throw new Error("Defina uma senha para o novo usuário.");

    const payload = {
      username: data.username,
      display_name: data.display_name,
      active: data.active,
      ...(data.password ? { password_hash: hashPassword(data.password) } : {}),
    };

    const result = data.id
      ? await supabase.from("app_users").update(payload).eq("id", data.id).select("id").single()
      : await supabase
          .from("app_users")
          .insert({ ...payload, password_hash: payload.password_hash! })
          .select("id")
          .single();
    if (result.error) {
      if (result.error.message.includes("duplicate key")) {
        throw new Error("Já existe um usuário com esse nome de acesso.");
      }
      throw new Error(result.error.message);
    }
    return { id: result.data.id };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./gate.server");
    const supabase = await requireAdmin();
    const { error } = await supabase.from("app_users").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Gives (role) or removes (null) a user's access to a store. */
export const setStoreAccess = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        store_id: z.string().uuid(),
        role: z.enum(MEMBER_ROLES).nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./gate.server");
    const supabase = await requireAdmin();
    const { error } = data.role
      ? await supabase
          .from("store_members")
          .upsert({ user_id: data.user_id, store_id: data.store_id, role: data.role })
      : await supabase
          .from("store_members")
          .delete()
          .eq("user_id", data.user_id)
          .eq("store_id", data.store_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
