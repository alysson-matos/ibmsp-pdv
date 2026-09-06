import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { ReceiptText, ChevronDown, Boxes, PackageSearch, FileSpreadsheet } from "lucide-react";
import { exportToExcel, SortableTh, useSort } from "@/lib/table-tools";
import { Button } from "@/components/ui/button";

import {
  listOperators,
  listProducts,
  listSales,
  listStockMovements,
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@/lib/pos.functions";
import { brl, dateTime, PAYMENT_LABEL, todayISO } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Filters = {
  from: string;
  to: string;
  payment_method: "todas" | PaymentMethod;
  operator_id: string;
  tz_offset: number;
};

const productsQuery = queryOptions({
  queryKey: ["products"],
  queryFn: () => listProducts(),
});

const operatorsQuery = queryOptions({
  queryKey: ["operators"],
  queryFn: () => listOperators(),
});

const salesQuery = (filters: Filters) =>
  queryOptions({
    queryKey: ["sales", filters],
    queryFn: () => listSales({ data: filters }),
  });

const movementsQuery = (range: { from: string; to: string; tz_offset: number }) =>
  queryOptions({
    queryKey: ["stock-movements", range],
    queryFn: () => listStockMovements({ data: range }),
  });


export const Route = createFileRoute("/historico")({
  head: () => ({
    meta: [
      { title: "Histórico de vendas — Guichê PDV" },
      {
        name: "description",
        content: "Consulte as vendas do guichê por data e forma de pagamento, com totais do período.",
      },
      { property: "og:title", content: "Histórico de vendas — Guichê PDV" },
      {
        property: "og:description",
        content: "Vendas, itens, formas de pagamento e faturamento do período em um só lugar.",
      },
    ],
  }),
  errorComponent: ({ error }) => (
    <div role="alert" className="p-8 text-destructive">
      {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-8">Nada por aqui.</div>,
  component: HistoricoPage,
});

function HistoricoPage() {
  const [tab, setTab] = useState<"vendas" | "estoque" | "relatorio">("vendas");

  const tabs = [
    { id: "vendas", label: "Histórico de vendas", icon: ReceiptText },
    { id: "estoque", label: "Controle de estoque", icon: Boxes },
    { id: "relatorio", label: "Relatório do estoque", icon: PackageSearch },
  ] as const;

  return (
    <main className="mx-auto max-w-[1600px] p-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <ReceiptText className="size-6 text-primary" /> Histórico
      </h1>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
              tab === id
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "vendas" && <SalesTab />}
      {tab === "estoque" && <StockTab />}
      {tab === "relatorio" && <StockReportTab />}
    </main>
  );
}

function SalesTab() {
  const today = todayISO();
  const [filters, setFilters] = useState<Filters>({
    from: today,
    to: today,
    payment_method: "todas",
    operator_id: "todos",
    tz_offset: new Date().getTimezoneOffset(),
  });
  const { data: sales } = useSuspenseQuery(salesQuery(filters));
  const { data: operators } = useSuspenseQuery(operatorsQuery);
  const [openId, setOpenId] = useState<string | null>(null);

  const revenue = sales.reduce((sum, s) => sum + s.total, 0);
  const byMethod = PAYMENT_METHODS.map((m) => ({
    method: m,
    total: sales.filter((s) => s.payment_method === m).reduce((sum, s) => sum + s.total, 0),
  }));

  const { sort, toggle, sorted } = useSort<(typeof sales)[number]>("date", "desc");
  const rows = sorted(sales, {
    date: (s) => s.created_at,
    customer: (s) => s.customer_name,
    operator: (s) => s.operator_name,
    items: (s) => s.items.reduce((sum, i) => sum + i.quantity, 0),
    payment: (s) => PAYMENT_LABEL[s.payment_method] ?? s.payment_method,
    total: (s) => s.total,
  });

  return (
    <>


      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="from" className="text-xs uppercase tracking-widest text-muted-foreground">
            De
          </Label>
          <Input
            id="from"
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            className="tabular w-40"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="to" className="text-xs uppercase tracking-widest text-muted-foreground">
            Até
          </Label>
          <Input
            id="to"
            type="date"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            className="tabular w-40"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="operator" className="text-xs uppercase tracking-widest text-muted-foreground">
            Operador
          </Label>
          <select
            id="operator"
            value={filters.operator_id}
            onChange={(e) => setFilters({ ...filters, operator_id: e.target.value })}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="todos">Todos</option>
            {operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["todas", ...PAYMENT_METHODS] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setFilters({ ...filters, payment_method: m })}
              className={cn(
                "rounded-md border px-3 py-2 text-sm transition-colors",
                filters.payment_method === m
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "todas" ? "Todas" : PAYMENT_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <ExportButton
          onClick={() =>
            exportToExcel(
              "historico-vendas",
              "Vendas",
              rows.map((s) => ({
                Data: dateTime(s.created_at),
                Comprador: s.customer_name || "",
                Operador: s.operator_name || "",
                Itens: s.items.reduce((sum, i) => sum + i.quantity, 0),
                Produtos: s.items.map((i) => `${i.quantity}× ${i.product_name}`).join(", "),
                Pagamento: PAYMENT_LABEL[s.payment_method] ?? s.payment_method,
                Desconto: s.discount,
                Total: s.total,
              })),
            )
          }
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Vendas" value={String(sales.length)} highlight />
        <SummaryCard label="Faturamento" value={brl(revenue)} highlight />
        {byMethod.map((m) => (
          <SummaryCard key={m.method} label={PAYMENT_LABEL[m.method]!} value={brl(m.total)} />
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <SortableTh label="Data" sortKey="date" sort={sort} onToggle={toggle} />
              <SortableTh label="Comprador" sortKey="customer" sort={sort} onToggle={toggle} />
              <SortableTh label="Operador" sortKey="operator" sort={sort} onToggle={toggle} />
              <SortableTh label="Itens" sortKey="items" sort={sort} onToggle={toggle} />
              <SortableTh label="Pagamento" sortKey="payment" sort={sort} onToggle={toggle} />
              <SortableTh label="Total" sortKey="total" sort={sort} onToggle={toggle} align="right" />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((sale) => (
              <Fragment key={sale.id}>
                <tr
                  onClick={() => setOpenId(openId === sale.id ? null : sale.id)}
                  className="cursor-pointer hover:bg-secondary/30"
                >
                  <td className="tabular px-4 py-3">{dateTime(sale.created_at)}</td>
                  <td className="px-4 py-3">{sale.customer_name || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{sale.operator_name || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {sale.items.reduce((s, i) => s + i.quantity, 0)} un.
                  </td>
                  <td className="px-4 py-3">{PAYMENT_LABEL[sale.payment_method]}</td>
                  <td className="tabular px-4 py-3 text-right font-semibold">{brl(sale.total)}</td>
                  <td className="px-4 py-3 text-right">
                    <ChevronDown
                      className={cn(
                        "inline size-4 text-muted-foreground transition-transform",
                        openId === sale.id && "rotate-180",
                      )}
                    />
                  </td>
                </tr>
                {openId === sale.id && (
                  <tr className="bg-secondary/20">
                    <td colSpan={7} className="px-6 py-4">
                      <ul className="space-y-1">
                        {sale.items.map((item) => (
                          <li key={item.id} className="flex justify-between gap-4">
                            <span>
                              {item.quantity}× {item.product_name}{" "}
                              <span className="tabular text-muted-foreground">
                                ({brl(item.unit_price)} un.)
                              </span>
                            </span>
                            <span className="tabular">{brl(item.subtotal)}</span>
                          </li>
                        ))}
                      </ul>
                      {sale.discount > 0 && (
                        <p className="mt-2 text-muted-foreground">
                          Desconto aplicado: <span className="tabular">{brl(sale.discount)}</span>
                        </p>
                      )}
                      {sale.payment_method === "dinheiro" && sale.amount_received != null && (
                        <p className="mt-1 text-muted-foreground">
                          Recebido <span className="tabular">{brl(sale.amount_received)}</span> ·
                          Troco <span className="tabular">{brl(sale.change_amount)}</span>
                        </p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {sales.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  Nenhuma venda no período selecionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StockTab() {
  const today = todayISO();
  const [range, setRange] = useState({
    from: today,
    to: today,
    tz_offset: new Date().getTimezoneOffset(),
  });
  const { data: movements } = useSuspenseQuery(movementsQuery(range));

  
  const saidas = movements.filter((m) => m.delta < 0).reduce((s, m) => s + Math.abs(m.delta), 0);

  const { sort, toggle, sorted } = useSort<(typeof movements)[number]>("date", "desc");
  const rows = sorted(movements, {
    date: (m) => m.created_at,
    product: (m) => m.product_name,
    barcode: (m) => m.barcode,
    customer: (m) => m.customer_name,
    operator: (m) => m.operator_name,
    delta: (m) => m.delta,
    current: (m) => m.current_stock,
  });

  return (
    <>
      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="mfrom" className="text-xs uppercase tracking-widest text-muted-foreground">
            De
          </Label>
          <Input
            id="mfrom"
            type="date"
            value={range.from}
            onChange={(e) => setRange({ ...range, from: e.target.value })}
            className="tabular w-40"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="mto" className="text-xs uppercase tracking-widest text-muted-foreground">
            Até
          </Label>
          <Input
            id="mto"
            type="date"
            value={range.to}
            onChange={(e) => setRange({ ...range, to: e.target.value })}
            className="tabular w-40"
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <SummaryCard label="Movimentações" value={String(movements.length)} highlight />
          <SummaryCard label="Saídas" value={`-${saidas}`} />
          <ExportButton
            onClick={() =>
              exportToExcel(
                "controle-estoque",
                "Controle de estoque",
                rows.map((m) => ({
                  Data: dateTime(m.created_at),
                  Produto: m.product_name,
                  Código: m.barcode || "",
                  Comprador: m.customer_name || "",
                  Operador: m.operator_name || "",
                  Quantidade: m.delta,
                  "Estoque atual": m.current_stock ?? "",
                })),
              )
            }
          />
        </div>
      </div>


      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <SortableTh label="Data" sortKey="date" sort={sort} onToggle={toggle} />
              <SortableTh label="Produto" sortKey="product" sort={sort} onToggle={toggle} />
              <SortableTh label="Código" sortKey="barcode" sort={sort} onToggle={toggle} />
              <SortableTh label="Comprador" sortKey="customer" sort={sort} onToggle={toggle} />
              <SortableTh label="Operador" sortKey="operator" sort={sort} onToggle={toggle} />
              <SortableTh label="Quantidade" sortKey="delta" sort={sort} onToggle={toggle} align="right" />
              <SortableTh label="Estoque atual" sortKey="current" sort={sort} onToggle={toggle} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((m) => (
              <tr key={m.id} className="hover:bg-secondary/30">
                <td className="tabular px-4 py-3">{dateTime(m.created_at)}</td>
                <td className="px-4 py-3">{m.product_name}</td>
                <td className="tabular px-4 py-3 text-muted-foreground">{m.barcode || "—"}</td>
                <td className="px-4 py-3">{m.customer_name || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{m.operator_name || "—"}</td>
                <td
                  className={cn(
                    "tabular px-4 py-3 text-right font-semibold",
                    m.delta > 0 ? "text-primary" : "text-destructive",
                  )}
                >
                  {m.delta > 0 ? `+${m.delta}` : m.delta}
                </td>
                <td className="tabular px-4 py-3 text-right">
                  {m.current_stock ?? "—"}
                </td>
              </tr>
            ))}
            {movements.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  Nenhuma movimentação no período selecionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}


function StockReportTab() {
  const { data: products } = useSuspenseQuery(productsQuery);
  const active = products.filter((p) => p.active);

  const totalUnits = active.reduce((s, p) => s + p.stock, 0);
  const totalValue = active.reduce((s, p) => s + p.stock * p.price, 0);
  const lowStock = active.filter((p) => p.stock <= p.min_stock).length;

  const { sort, toggle, sorted } = useSort<(typeof active)[number]>("name");
  const rows = sorted(active, {
    name: (p) => p.name,
    barcode: (p) => p.barcode,
    price: (p) => p.price,
    stock: (p) => p.stock,
    value: (p) => p.stock * p.price,
  });

  return (
    <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Produtos ativos" value={String(active.length)} highlight />
        <SummaryCard label="Total em estoque" value={`${totalUnits} un.`} highlight />
        <SummaryCard label="Valor do estoque" value={brl(totalValue)} />
        <SummaryCard label="Estoque baixo" value={String(lowStock)} />
      </div>

      <div className="mt-4 flex justify-end">
        <ExportButton
          onClick={() =>
            exportToExcel(
              "relatorio-estoque",
              "Relatório do estoque",
              rows.map((p) => ({
                Produto: p.name,
                Código: p.barcode,
                Preço: p.price,
                Estoque: p.stock,
                "Valor total": p.stock * p.price,
              })),
            )
          }
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <SortableTh label="Produto" sortKey="name" sort={sort} onToggle={toggle} />
              <SortableTh label="Código" sortKey="barcode" sort={sort} onToggle={toggle} />
              <SortableTh label="Preço" sortKey="price" sort={sort} onToggle={toggle} align="right" />
              <SortableTh label="Estoque" sortKey="stock" sort={sort} onToggle={toggle} align="right" />
              <SortableTh label="Valor total" sortKey="value" sort={sort} onToggle={toggle} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-secondary/30">
                <td className="px-4 py-3">{p.name}</td>
                <td className="tabular px-4 py-3 text-muted-foreground">{p.barcode}</td>
                <td className="tabular px-4 py-3 text-right">{brl(p.price)}</td>
                <td
                  className={cn(
                    "tabular px-4 py-3 text-right font-semibold",
                    p.stock === 0
                      ? "text-destructive"
                      : p.stock <= p.min_stock
                        ? "text-amber-500"
                        : "",
                  )}
                >
                  {p.stock}
                </td>
                <td className="tabular px-4 py-3 text-right">{brl(p.stock * p.price)}</td>
              </tr>
            ))}
            {active.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  Nenhum produto ativo.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t border-border">
            <tr className="bg-secondary/30 font-semibold">
              <td className="px-4 py-3" colSpan={3}>
                Total
              </td>
              <td className="tabular px-4 py-3 text-right">{totalUnits}</td>
              <td className="tabular px-4 py-3 text-right">{brl(totalValue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4",
        highlight && "border-primary/40 bg-primary/10",
      )}
    >
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn("tabular mt-1 text-xl font-bold", highlight && "text-primary")}>{value}</p>
    </div>
  );
}
