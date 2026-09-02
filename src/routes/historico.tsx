import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { ReceiptText, ChevronDown } from "lucide-react";

import { listSales, PAYMENT_METHODS, type PaymentMethod } from "@/lib/pos.functions";
import { brl, dateTime, PAYMENT_LABEL, todayISO } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Filters = { from: string; to: string; payment_method: "todas" | PaymentMethod };

const salesQuery = (filters: Filters) =>
  queryOptions({
    queryKey: ["sales", filters],
    queryFn: () => listSales({ data: filters }),
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
  const today = todayISO();
  const [filters, setFilters] = useState<Filters>({
    from: today,
    to: today,
    payment_method: "todas",
  });
  const { data: sales } = useSuspenseQuery(salesQuery(filters));
  const [openId, setOpenId] = useState<string | null>(null);

  const revenue = sales.reduce((sum, s) => sum + s.total, 0);
  const byMethod = PAYMENT_METHODS.map((m) => ({
    method: m,
    total: sales.filter((s) => s.payment_method === m).reduce((sum, s) => sum + s.total, 0),
  }));

  return (
    <main className="mx-auto max-w-[1600px] p-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <ReceiptText className="size-6 text-primary" /> Histórico de vendas
      </h1>

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
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Itens</th>
              <th className="px-4 py-3">Pagamento</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sales.map((sale) => (
              <Fragment key={sale.id}>
                <tr
                  onClick={() => setOpenId(openId === sale.id ? null : sale.id)}
                  className="cursor-pointer hover:bg-secondary/30"
                >
                  <td className="tabular px-4 py-3">{dateTime(sale.created_at)}</td>
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
                    <td colSpan={5} className="px-6 py-4">
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
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  Nenhuma venda no período selecionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
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
