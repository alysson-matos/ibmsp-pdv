import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type Product = {
  id: string;
  barcode: string;
  name: string;
  price: number;
  stock: number;
  min_stock: number;
  active: boolean;
};

export type SaleItem = {
  id: string;
  product_name: string;
  barcode: string | null;
  unit_price: number;
  quantity: number;
  subtotal: number;
};

export const SALE_STATUSES = ["pendente", "separado", "entregue"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  pendente: "A separar",
  separado: "Separado",
  entregue: "Entregue",
};

export type Operator = {
  id: string;
  name: string;
  active: boolean;
};

export type Sale = {
  id: string;
  customer_name: string;
  operator_id: string | null;
  operator_name: string;
  status: SaleStatus;
  delivered_at: string | null;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: PaymentMethod;
  amount_received: number | null;
  change_amount: number;
  created_at: string;
  items: SaleItem[];
};

export const PAYMENT_METHODS = ["credito", "debito", "pix", "dinheiro"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const num = (v: unknown) => Number(v ?? 0);

export const listProducts = createServerFn({ method: "GET" }).handler(async (): Promise<Product[]> => {
  const { getServerSupabase } = await import("./pos.server");
  const { data, error } = await (await getServerSupabase("any"))
    .from("products")
    .select("id, barcode, name, price, stock, min_stock, active")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((p) => ({
    id: p.id,
    barcode: p.barcode,
    name: p.name,
    price: num(p.price),
    stock: p.stock,
    min_stock: p.min_stock,
    active: p.active,
  }));
});

const productInput = z.object({
  id: z.string().uuid().optional(),
  barcode: z.string().trim().min(1, "Informe o código de barras"),
  name: z.string().trim().min(1, "Informe o nome"),
  price: z.number().min(0),
  stock: z.number().int().min(0),
  min_stock: z.number().int().min(0),
  active: z.boolean(),
});

export const saveProduct = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => productInput.parse(data))
  .handler(async ({ data }) => {
    const { getServerSupabase } = await import("./pos.server");
    const supabase = await getServerSupabase();
    const payload = {
      barcode: data.barcode,
      name: data.name,
      price: data.price,
      stock: data.stock,
      min_stock: data.min_stock,
      active: data.active,
    };

    if (data.id) {
      const { error } = await supabase.from("products").update(payload).eq("id", data.id);
      if (error) throw new Error(traduzErro(error.message));
      return { id: data.id };
    }

    const { data: created, error } = await supabase
      .from("products")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(traduzErro(error.message));
    return { id: created.id };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { getServerSupabase } = await import("./pos.server");
    const { error } = await (await getServerSupabase()).from("products").delete().eq("id", data.id);
    if (error) throw new Error("Não foi possível excluir. Se o produto já tem vendas, desative-o.");
    return { ok: true };
  });

export const adjustStock = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        product_id: z.string().uuid(),
        delta: z.number().int().refine((v) => v !== 0, "Informe uma quantidade"),
        reason: z.string().trim().min(1).default("ajuste"),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { getServerSupabase } = await import("./pos.server");
    const supabase = await getServerSupabase();

    const { data: product, error: readError } = await supabase
      .from("products")
      .select("stock")
      .eq("id", data.product_id)
      .single();
    if (readError) throw new Error(readError.message);

    const next = product.stock + data.delta;
    if (next < 0) throw new Error("O estoque não pode ficar negativo");

    const { error } = await supabase
      .from("products")
      .update({ stock: next })
      .eq("id", data.product_id);
    if (error) throw new Error(error.message);

    await supabase
      .from("stock_movements")
      .insert({ product_id: data.product_id, delta: data.delta, reason: data.reason });

    return { stock: next };
  });

export const checkout = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        items: z
          .array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().positive() }))
          .min(1, "Carrinho vazio"),
        payment_method: z.enum(PAYMENT_METHODS),
        customer_name: z.string().trim().min(1, "Informe o nome do comprador"),
        operator_id: z.string().uuid("Selecione o operador"),
        discount: z.number().min(0).default(0),
        amount_received: z.number().min(0).nullable().default(null),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<Sale> => {
    const { getServerSupabase } = await import("./pos.server");
    const supabase = await getServerSupabase("any");

    const args = {
      _items: data.items,
      _payment_method: data.payment_method,
      _customer_name: data.customer_name,
      _operator_id: data.operator_id,
      _discount: data.discount,
      ...(data.amount_received != null ? { _amount_received: data.amount_received } : {}),
    };

    const { data: saleId, error } = await supabase.rpc("checkout_sale", args);
    if (error) throw new Error(traduzErro(error.message));

    return await fetchSale(supabase, saleId as unknown as string);
  });

export const listShipping = createServerFn({ method: "GET" }).handler(async (): Promise<Sale[]> => {
  const { getServerSupabase } = await import("./pos.server");
  const { data, error } = await (await getServerSupabase("any"))
    .from("sales")
    .select(
      "id, customer_name, operator_id, operator_name, status, delivered_at, subtotal, discount, total, payment_method, amount_received, change_amount, created_at, sale_items(id, product_name, barcode, unit_price, quantity, subtotal)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapSale(row as unknown as Record<string, unknown>));
});

export const setSaleStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(SALE_STATUSES) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { getServerSupabase } = await import("./pos.server");
    const { error } = await (await getServerSupabase("any"))
      .from("sales")
      .update({
        status: data.status,
        delivered_at: data.status === "entregue" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const salesFilter = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  payment_method: z.enum(["todas", ...PAYMENT_METHODS]).default("todas"),
  operator_id: z.string().default("todos"),
  tz_offset: z.number().default(0),
});

export const listSales = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => salesFilter.parse(data ?? {}))
  .handler(async ({ data }): Promise<Sale[]> => {
    const { getServerSupabase } = await import("./pos.server");
    const supabase = await getServerSupabase();

    let query = supabase
      .from("sales")
      .select(
        "id, customer_name, operator_id, operator_name, status, delivered_at, subtotal, discount, total, payment_method, amount_received, change_amount, created_at, sale_items(id, product_name, barcode, unit_price, quantity, subtotal)",
      )
      .order("created_at", { ascending: false })
      .limit(300);

    // from/to are local calendar dates; convert to absolute instants using the client offset
    const startOf = (day: string) =>
      new Date(Date.parse(`${day}T00:00:00Z`) + data.tz_offset * 60000).toISOString();
    const endOf = (day: string) =>
      new Date(Date.parse(`${day}T23:59:59.999Z`) + data.tz_offset * 60000).toISOString();

    if (data.from) query = query.gte("created_at", startOf(data.from));
    if (data.to) query = query.lte("created_at", endOf(data.to));
    if (data.payment_method !== "todas") query = query.eq("payment_method", data.payment_method);
    if (data.operator_id && data.operator_id !== "todos")
      query = query.eq("operator_id", data.operator_id);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return (rows ?? []).map((row) => mapSale(row));
  });

function mapSale(row: Record<string, unknown>): Sale {
  const items = (row["sale_items"] ?? []) as Record<string, unknown>[];
  return {
    id: row["id"] as string,
    customer_name: (row["customer_name"] as string | null) ?? "",
    operator_id: (row["operator_id"] as string | null) ?? null,
    operator_name: (row["operator_name"] as string | null) ?? "",
    status: ((row["status"] as string | null) ?? "pendente") as SaleStatus,
    delivered_at: (row["delivered_at"] as string | null) ?? null,
    subtotal: num(row["subtotal"]),
    discount: num(row["discount"]),
    total: num(row["total"]),
    payment_method: row["payment_method"] as PaymentMethod,
    amount_received: row["amount_received"] == null ? null : num(row["amount_received"]),
    change_amount: num(row["change_amount"]),
    created_at: row["created_at"] as string,
    items: items.map((i) => ({
      id: i["id"] as string,
      product_name: i["product_name"] as string,
      barcode: (i["barcode"] as string | null) ?? null,
      unit_price: num(i["unit_price"]),
      quantity: i["quantity"] as number,
      subtotal: num(i["subtotal"]),
    })),
  };
}

async function fetchSale(
  supabase: Awaited<ReturnType<typeof import("./pos.server").getServerSupabase>>,
  id: string,
): Promise<Sale> {
  const { data, error } = await supabase
    .from("sales")
    .select(
      "id, customer_name, operator_id, operator_name, status, delivered_at, subtotal, discount, total, payment_method, amount_received, change_amount, created_at, sale_items(id, product_name, barcode, unit_price, quantity, subtotal)",
    )
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return mapSale(data as unknown as Record<string, unknown>);
}

function traduzErro(message: string) {
  if (message.includes("duplicate key") && message.includes("barcode")) {
    return "Já existe um produto com esse código de barras";
  }
  return message;
}

export const listOperators = createServerFn({ method: "GET" }).handler(async (): Promise<Operator[]> => {
  const { getServerSupabase } = await import("./pos.server");
  const { data, error } = await (await getServerSupabase("any"))
    .from("operators")
    .select("id, name, active")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Operator[];
});

export const saveOperator = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1, "Informe o nome do operador"),
        active: z.boolean().default(true),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { getServerSupabase } = await import("./pos.server");
    const supabase = await getServerSupabase();
    const payload = { name: data.name, active: data.active };

    if (data.id) {
      const { error } = await supabase.from("operators").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: created, error } = await supabase
      .from("operators")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deleteOperator = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { getServerSupabase } = await import("./pos.server");
    const { error } = await (await getServerSupabase()).from("operators").delete().eq("id", data.id);
    if (error) throw new Error("Não foi possível excluir. Se o operador já tem vendas, desative-o.");
    return { ok: true };
  });

export type StockMovement = {
  id: string;
  product_id: string;
  product_name: string;
  barcode: string | null;
  delta: number;
  reason: string;
  customer_name: string | null;
  operator_name: string | null;
  created_at: string;
};

export const listStockMovements = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        tz_offset: z.number().default(0),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }): Promise<StockMovement[]> => {
    const { getServerSupabase } = await import("./pos.server");
    const supabase = await getServerSupabase();

    let query = supabase
      .from("stock_movements")
      .select(
        "id, product_id, delta, reason, created_at, products(name, barcode), sales(customer_name, operator_name)",
      )
      .order("created_at", { ascending: false })
      .limit(500);

    const startOf = (day: string) =>
      new Date(Date.parse(`${day}T00:00:00Z`) + data.tz_offset * 60000).toISOString();
    const endOf = (day: string) =>
      new Date(Date.parse(`${day}T23:59:59.999Z`) + data.tz_offset * 60000).toISOString();

    if (data.from) query = query.gte("created_at", startOf(data.from));
    if (data.to) query = query.lte("created_at", endOf(data.to));

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return (rows ?? []).map((row) => {
      const r = row as unknown as Record<string, unknown>;
      const product = (r["products"] ?? {}) as Record<string, unknown>;
      const sale = (r["sales"] ?? {}) as Record<string, unknown>;
      return {
        customer_name: (sale["customer_name"] as string | null) || null,
        operator_name: (sale["operator_name"] as string | null) || null,
        id: r["id"] as string,
        product_id: r["product_id"] as string,
        product_name: (product["name"] as string | null) ?? "Produto removido",
        barcode: (product["barcode"] as string | null) ?? null,
        delta: Number(r["delta"] ?? 0),
        reason: (r["reason"] as string | null) ?? "",
        created_at: r["created_at"] as string,
      };
    });
  });
