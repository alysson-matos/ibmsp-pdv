import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PackageCheck, PackageSearch, Undo2, User } from "lucide-react";

import {
  listShipping,
  setSaleStatus,
  SALE_STATUS_LABEL,
  type Sale,
  type SaleStatus,
} from "@/lib/pos.functions";
import { brl, dateTime, PAYMENT_LABEL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { RouteError } from "@/components/route-error";

const shippingQuery = queryOptions({
  queryKey: ["shipping"],
  queryFn: () => listShipping(),
});

export const Route = createFileRoute("/expedicao")({
  head: () => ({
    meta: [
      { title: "Expedição — Separação e entrega das compras" },
      {
        name: "description",
        content:
          "Lista as compras com os produtos a separar, identificadas pelo nome do comprador, e marca a entrega na retirada.",
      },
      { property: "og:title", content: "Expedição — Separação e entrega das compras" },
      {
        property: "og:description",
        content: "Separe os produtos de cada compra e marque como entregue na retirada do comprador.",
      },
    ],
  }),
  errorComponent: RouteError,
  notFoundComponent: () => <div className="p-8">Nada por aqui.</div>,
  component: ExpedicaoPage,
});

function useFilters(t: (s: string, vars?: Record<string, string | number>) => string): { key: SaleStatus | "abertas"; label: string }[] {
  return [
    { key: "abertas", label: t("Em aberto") },
    { key: "pendente", label: t("A separar") },
    { key: "separado", label: t("Separado") },
    { key: "entregue", label: t("Entregues") },
  ];
}

const statusStyle: Record<SaleStatus, string> = {
  pendente: "border-primary/50 bg-primary/15 text-primary",
  separado: "border-accent/50 bg-accent/15 text-accent",
  entregue: "border-border bg-secondary text-muted-foreground",
};

function ExpedicaoPage() {
  const t = useT();
  const { data: sales } = useSuspenseQuery(shippingQuery);
  const queryClient = useQueryClient();
  const updateFn = useServerFn(setSaleStatus);

  const [filter, setFilter] = useState<SaleStatus | "abertas">("abertas");
  const [search, setSearch] = useState("");
  const FILTERS = useFilters(t);

  const mutation = useMutation({
    mutationFn: (vars: { id: string; status: SaleStatus }) => updateFn({ data: vars }),
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ["shipping"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast.success(t("Compra marcada como {status}", { status: t(SALE_STATUS_LABEL[vars.status]).toLowerCase() }));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sales.filter((sale) => {
      const byStatus =
        filter === "abertas" ? sale.status !== "entregue" : sale.status === filter;
      if (!byStatus) return false;
      if (!term) return true;
      return (
        sale.customer_name.toLowerCase().includes(term) ||
        sale.items.some(
          (i) =>
            i.product_name.toLowerCase().includes(term) || (i.barcode ?? "").includes(term),
        )
      );
    });
  }, [sales, filter, search]);

  const pendentes = sales.filter((s) => s.status === "pendente").length;
  const separados = sales.filter((s) => s.status === "separado").length;

  return (
    <main className="mx-auto max-w-[1200px] space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t("Expedição")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("{pendentes} compra(s) a separar · {separados} pronta(s) para retirada", { pendentes, separados })}
          </p>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Buscar por comprador, produto ou código")}
          className="h-10 w-full sm:w-80"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition-colors",
              filter === f.key
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="grid place-items-center gap-2 rounded-xl border border-border bg-card px-4 py-20 text-center text-muted-foreground">
          <PackageSearch className="size-10 opacity-40" />
          <p className="text-sm">{t("Nenhuma compra nesta lista.")}</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {filtered.map((sale) => (
            <li key={sale.id}>
              <ShippingCard
                sale={sale}
                busy={mutation.isPending}
                onChange={(status) => mutation.mutate({ id: sale.id, status })}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function ShippingCard({
  sale,
  busy,
  onChange,
}: {
  sale: Sale;
  busy: boolean;
  onChange: (status: SaleStatus) => void;
}) {
  const t = useT();
  return (
    <article className="flex h-full flex-col rounded-xl border border-border bg-card p-4 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-base font-semibold">
            <User className="size-4 shrink-0 text-primary" />
            {sale.customer_name || t("Sem nome")}
          </p>
          <p className="tabular text-xs text-muted-foreground">
            {dateTime(sale.created_at)} · {t(PAYMENT_LABEL[sale.payment_method] ?? sale.payment_method)} · {brl(sale.total)}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium",
            statusStyle[sale.status],
          )}
        >
          {t(SALE_STATUS_LABEL[sale.status])}
        </span>
      </div>

      <ul className="mt-3 flex-1 space-y-1.5 border-t border-border pt-3 text-sm">
        {sale.items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate">
                <span className="tabular font-semibold text-primary">{item.quantity}×</span>{" "}
                {item.product_name}
              </span>
              <span className="tabular block text-xs text-muted-foreground">
                {item.barcode ?? t("sem código")}
              </span>
            </span>
            <span className="tabular text-muted-foreground">{brl(item.subtotal)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        {sale.status === "pendente" && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onChange("separado")}>
            <PackageSearch className="size-4" /> {t("Marcar separado")}
          </Button>
        )}
        {sale.status !== "entregue" && (
          <Button size="sm" disabled={busy} onClick={() => onChange("entregue")}>
            <PackageCheck className="size-4" /> {t("Marcar entregue")}
          </Button>
        )}
        {sale.status === "entregue" && (
          <>
            <span className="text-xs text-muted-foreground">
              {t("Entregue {date}", { date: sale.delivered_at ? dateTime(sale.delivered_at) : "" })}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => onChange("pendente")}
              className="ml-auto"
            >
              <Undo2 className="size-4" /> {t("Reabrir")}
            </Button>
          </>
        )}
        {sale.status === "separado" && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onChange("pendente")}>
            <Undo2 className="size-4" /> {t("Voltar")}
          </Button>
        )}
      </div>
    </article>
  );
}
