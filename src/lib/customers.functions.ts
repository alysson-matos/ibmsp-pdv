import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type Customer = {
  id: string;
  name: string;
  notes: string;
  balance: number;
  active: boolean;
};

export type BalanceMovement = {
  id: string;
  delta: number;
  balance_after: number;
  reason: string;
  sale_id: string | null;
  created_at: string;
};

const num = (v: unknown) => Number(v ?? 0);

function translate(message: string) {
  if (message.includes("customers_balance_not_negative")) {
    return "O saldo do cliente não pode ficar negativo";
  }
  if (message.includes("Cliente nao encontrado")) return "Cliente não encontrado";
  return message;
}

/** Customers of the current store. Anyone in the store can read them (needed to sell). */
export const listCustomers = createServerFn({ method: "GET" }).handler(
  async (): Promise<Customer[]> => {
    const { getStoreSupabase } = await import("./pos.server");
    const { supabase, storeId } = await getStoreSupabase("any");
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, notes, balance, active")
      .eq("store_id", storeId)
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((c) => ({ ...c, balance: num(c.balance) }));
  },
);

export const saveCustomer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1, "Informe o nome do cliente").max(80),
        notes: z.string().trim().max(120).default(""),
        active: z.boolean().default(true),
        /** Only for new customers: balance loaded at registration. */
        initial_balance: z.number().min(0).default(0),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { getStoreSupabase } = await import("./pos.server");
    const { supabase, storeId } = await getStoreSupabase("manage");
    const payload = { name: data.name, notes: data.notes, active: data.active };

    if (data.id) {
      const { error } = await supabase
        .from("customers")
        .update(payload)
        .eq("id", data.id)
        .eq("store_id", storeId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: created, error } = await supabase
      .from("customers")
      .insert({ ...payload, store_id: storeId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (data.initial_balance > 0) {
      const { error: balanceError } = await supabase.rpc("adjust_customer_balance", {
        _store_id: storeId,
        _customer_id: created.id,
        _delta: data.initial_balance,
        _reason: "saldo inicial",
      });
      if (balanceError) throw new Error(translate(balanceError.message));
    }
    return { id: created.id };
  });

/** Adds (positive) or removes (negative) balance. The balance never goes below zero. */
export const adjustCustomerBalance = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        customer_id: z.string().uuid(),
        delta: z
          .number()
          .refine((v) => v !== 0, "Informe um valor")
          .refine((v) => Math.abs(v) < 100_000_000, "Valor muito alto"),
        reason: z.string().trim().max(80).default(""),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { getStoreSupabase } = await import("./pos.server");
    const { supabase, storeId } = await getStoreSupabase("manage");
    const { data: balance, error } = await supabase.rpc("adjust_customer_balance", {
      _store_id: storeId,
      _customer_id: data.customer_id,
      _delta: Math.round(data.delta * 100) / 100,
      _reason: data.reason || (data.delta > 0 ? "credito" : "ajuste"),
    });
    if (error) throw new Error(translate(error.message));
    return { balance: num(balance) };
  });

export const deleteCustomer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { getStoreSupabase } = await import("./pos.server");
    const { supabase, storeId } = await getStoreSupabase("manage");

    const { count, error: countError } = await supabase
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", data.id)
      .eq("store_id", storeId);
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) > 0) {
      throw new Error("Este cliente já tem compras. Desative-o em vez de excluir.");
    }

    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", data.id)
      .eq("store_id", storeId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Balance statement of a customer (most recent first). */
export const listCustomerMovements = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ customer_id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<BalanceMovement[]> => {
    const { getStoreSupabase } = await import("./pos.server");
    const { supabase, storeId } = await getStoreSupabase("manage");
    const { data: rows, error } = await supabase
      .from("customer_balance_movements")
      .select("id, delta, balance_after, reason, sale_id, created_at, customers!inner(store_id)")
      .eq("customer_id", data.customer_id)
      .eq("customers.store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      delta: num(r.delta),
      balance_after: num(r.balance_after),
      reason: r.reason,
      sale_id: r.sale_id,
      created_at: r.created_at,
    }));
  });
