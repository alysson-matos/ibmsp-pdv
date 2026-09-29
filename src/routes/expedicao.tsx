import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type ComponentType } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  PackageCheck,
  PackageOpen,
  PackageSearch,
  Truck,
  Undo2,
  User,
} from "lucide-react";

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
import { prefetchQuiet } from "@/lib/prefetch";

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
        content:
          "Separe os produtos de cada compra e marque como entregue na retirada do comprador.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: RouteError,
  notFoundComponent: () => <div className="p-8">Nada por aqui.</div>,
  loader: ({ context }) =>
    prefetchQuiet(context.queryClient, shippingQuery.queryKey, () => listShipping()),
  component: ExpedicaoPage,
});

const byOldest = (a: Sale, b: Sale) => a.created_at.localeCompare(b.created_at);

function matches(sale: Sale, term: string) {
  if (!term) return true;
  return (
    sale.customer_name.toLowerCase().includes(term) ||
    sale.items.some(
      (i) => i.product_name.toLowerCase().includes(term) || (i.barcode ?? "").includes(term),
    )
  );
}

function ExpedicaoPage() {
  const t = useT();
  const { data: sales } = useSuspenseQuery(shippingQuery);
  const queryClient = useQueryClient();
  const updateFn = useServerFn(setSaleStatus);

  const [search, setSearch] = useState("");
  const [showDelivered, setShowDelivered] = useState(false);

  // Moves the card to its new queue immediately; the list is reloaded from the
  // server once the last pending change finishes.
  const mutation = useMutation({
    mutationKey: ["sale-status"],
    mutationFn: (vars: { id: string; status: SaleStatus }) => updateFn({ data: vars }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["shipping"] });
      queryClient.setQueryData<Sale[]>(["shipping"], (old) =>
        old?.map((s) =>
          s.id === vars.id
            ? {
                ...s,
                status: vars.status,
                delivered_at: vars.status === "entregue" ? new Date().toISOString() : null,
              }
            : s,
        ),
      );
    },
    onSuccess: (_r, vars) => {
      toast.success(
        t("Compra marcada como {status}", {
          status: t(SALE_STATUS_LABEL[vars.status]).toLowerCase(),
        }),
      );
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: ["sale-status"] }) === 1) {
        queryClient.invalidateQueries({ queryKey: ["shipping"] });
        queryClient.invalidateQueries({ queryKey: ["sales"] });
      }
    },
  });
  const move = (id: string, status: SaleStatus) => mutation.mutate({ id, status });

  const { toPack, toDeliver, delivered } = useMemo(() => {
    const term = search.trim().toLowerCase();
    const visible = sales.filter((s) => matches(s, term));
    return {
      toPack: visible.filter((s) => s.status === "pendente").sort(byOldest),
      toDeliver: visible.filter((s) => s.status === "separado").sort(byOldest),
      delivered: visible
        .filter((s) => s.status === "entregue")
        .sort((a, b) => (b.delivered_at ?? "").localeCompare(a.delivered_at ?? "")),
    };
  }, [sales, search]);

  return (
    <main className="mx-auto max-w-[1600px] space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t("Expedição")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("{pendentes} compra(s) a separar · {separados} pronta(s) para retirada", {
              pendentes: toPack.length,
              separados: toDeliver.length,
            })}
          </p>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Buscar por comprador, produto ou código")}
          className="h-10 w-full sm:w-80"
        />
      </div>

      <div className="grid items-start gap-4 md:grid-cols-2">
        <QueueColumn
          title={t("SEPARAR")}
          icon={PackageOpen}
          tone="primary"
          sales={toPack}
          renderActions={(sale) => (
            <>
              <Button className="flex-1" onClick={() => move(sale.id, "separado")}>
                <PackageSearch className="size-4" /> {t("Marcar separado")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => move(sale.id, "entregue")}>
                {t("Entregar agora")}
              </Button>
            </>
          )}
        />
        <QueueColumn
          title={t("ENTREGAR")}
          icon={Truck}
          tone="accent"
          sales={toDeliver}
          renderActions={(sale) => (
            <>
              <Button className="flex-1" onClick={() => move(sale.id, "entregue")}>
                <PackageCheck className="size-4" /> {t("Marcar entregue")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => move(sale.id, "pendente")}>
                <Undo2 className="size-4" /> {t("Voltar")}
              </Button>
            </>
          )}
        />
      </div>

      <section className="rounded-xl border border-border bg-card">
        <button
          type="button"
          onClick={() => setShowDelivered((v) => !v)}
          aria-expanded={showDelivered}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <span>
            {t("Entregues recentes")} ({delivered.length})
          </span>
          <ChevronDown
            className={cn("size-4 transition-transform", showDelivered && "rotate-180")}
          />
        </button>
        {showDelivered && (
          <ul className="divide-y divide-border border-t border-border">
            {delivered.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                {t("Nenhuma compra nesta lista.")}
              </li>
            )}
            {delivered.map((sale) => (
              <li key={sale.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span className="font-medium">{sale.customer_name || t("Sem nome")}</span>
                <span className="tabular text-xs text-muted-foreground">
                  {t("Entregue {date}", {
                    date: sale.delivered_at ? dateTime(sale.delivered_at) : "",
                  })}{" "}
                  · {brl(sale.total)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => move(sale.id, "pendente")}
                >
                  <Undo2 className="size-4" /> {t("Reabrir")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

const toneStyle = {
  primary: { bar: "border-t-primary", icon: "text-primary", badge: "bg-primary/15 text-primary" },
  accent: { bar: "border-t-accent", icon: "text-accent", badge: "bg-accent/15 text-accent" },
} as const;

function QueueColumn({
  title,
  icon: Icon,
  tone,
  sales,
  renderActions,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  tone: keyof typeof toneStyle;
  sales: Sale[];
  renderActions: (sale: Sale) => React.ReactNode;
}) {
  const t = useT();
  const style = toneStyle[tone];
  return (
    <section
      className={cn(
        "flex flex-col rounded-xl border border-t-4 border-border bg-secondary/30",
        style.bar,
      )}
    >
      <header className="flex items-center gap-2 px-4 py-3">
        <Icon className={cn("size-5", style.icon)} />
        <h2 className="text-sm font-bold tracking-widest">{title}</h2>
        <span
          className={cn(
            "tabular ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold",
            style.badge,
          )}
        >
          {sales.length}
        </span>
      </header>
      {sales.length === 0 ? (
        <div className="grid place-items-center gap-2 px-4 pb-10 pt-6 text-center text-muted-foreground">
          <PackageSearch className="size-8 opacity-40" />
          <p className="text-sm">{t("Fila vazia")}</p>
        </div>
      ) : (
        <ol className="space-y-3 px-3 pb-3">
          {sales.map((sale, index) => (
            <li key={sale.id}>
              <QueueCard sale={sale} position={index + 1}>
                {renderActions(sale)}
              </QueueCard>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function QueueCard({
  sale,
  position,
  children,
}: {
  sale: Sale;
  position: number;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="tabular grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-muted-foreground">
          {position}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-base font-semibold">
            <User className="size-4 shrink-0 text-primary" />
            {sale.customer_name || t("Sem nome")}
          </p>
          <p className="tabular text-xs text-muted-foreground">
            {dateTime(sale.created_at)} ·{" "}
            {t(PAYMENT_LABEL[sale.payment_method] ?? sale.payment_method)} · {brl(sale.total)}
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
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

      <div className="mt-4 flex flex-wrap items-center gap-2">{children}</div>
    </article>
  );
}
