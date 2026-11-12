import { createFileRoute } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Contact, Pencil, Plus, Minus, ReceiptText, Search, Trash2, UserPlus } from "lucide-react";

import {
  adjustCustomerBalance,
  deleteCustomer,
  listCustomerMovements,
  listCustomers,
  saveCustomer,
  type Customer,
} from "@/lib/customers.functions";
import { brl, dateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { RouteError } from "@/components/route-error";
import { prefetchQuiet } from "@/lib/prefetch";
import { useCurrentStore } from "@/lib/use-current-store";

const customersQuery = queryOptions({
  queryKey: ["customers"],
  queryFn: () => listCustomers(),
});

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes e saldo — PDV - IBMemorial" },
      {
        name: "description",
        content: "Cadastre clientes com saldo antecipado para pagar as compras da loja.",
      },
    ],
  }),
  errorComponent: RouteError,
  loader: ({ context }) =>
    prefetchQuiet(context.queryClient, customersQuery.queryKey, () => listCustomers()),
  component: ClientesPage,
});

/** Accepts "10,50", "1.234,50" or "10.50". */
const parseMoney = (value: string) => {
  const v = value.trim();
  const n = Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

function ClientesPage() {
  const t = useT();
  const store = useCurrentStore();
  const { data: customers } = useSuspenseQuery(customersQuery);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CustomerForm | null>(null);
  const [adjusting, setAdjusting] = useState<Customer | null>(null);
  const [statement, setStatement] = useState<Customer | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(term) || c.notes.toLowerCase().includes(term),
    );
  }, [customers, search]);

  const totalBalance = customers.reduce((sum, c) => sum + c.balance, 0);

  return (
    <main className="mx-auto max-w-4xl p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Contact className="size-6 text-primary" /> {t("Clientes")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('Clientes com saldo antecipado. Na venda, escolha "Saldo" e identifique o cliente.')}
          </p>
        </div>
        <Button className="ml-auto" onClick={() => setEditing({ ...EMPTY_CUSTOMER })}>
          <UserPlus className="size-4" /> {t("Novo cliente")}
        </Button>
      </div>

      {store && !store.customer_balance ? (
        <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          {t(
            "A venda com saldo está desligada nesta loja. O administrador pode ligá-la em Lojas > editar loja.",
          )}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Buscar cliente")}
            className="pl-9"
          />
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm">
          <span className="text-muted-foreground">{t("Saldo total dos clientes")}: </span>
          <span className="tabular font-semibold">{brl(totalBalance)}</span>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {filtered.map((c) => (
          <li
            key={c.id}
            className={cn("flex flex-wrap items-center gap-3 px-4 py-3", !c.active && "opacity-60")}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{c.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {c.notes}
                {!c.active ? `${c.notes ? " · " : ""}${t("Inativo")}` : ""}
              </p>
            </div>
            <span className="tabular w-28 text-right text-lg font-bold text-primary">
              {brl(c.balance)}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setAdjusting(c)}>
                <Plus className="size-4" /> {t("Saldo")}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-foreground"
                aria-label={t("Extrato de {name}", { name: c.name })}
                title={t("Extrato")}
                onClick={() => setStatement(c)}
              >
                <ReceiptText className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-foreground"
                aria-label={t("Editar {name}", { name: c.name })}
                onClick={() =>
                  setEditing({
                    id: c.id,
                    name: c.name,
                    notes: c.notes,
                    active: c.active,
                    initial: "",
                  })
                }
              >
                <Pencil className="size-4" />
              </Button>
            </div>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-12 text-center text-muted-foreground">
            {customers.length === 0
              ? t("Nenhum cliente cadastrado ainda.")
              : t("Nenhum cliente encontrado.")}
          </li>
        )}
      </ul>

      <CustomerDialog form={editing} onClose={() => setEditing(null)} />
      <BalanceDialog customer={adjusting} onClose={() => setAdjusting(null)} />
      <StatementDialog customer={statement} onClose={() => setStatement(null)} />
    </main>
  );
}

/* --------------------------------- Customer --------------------------------- */

type CustomerForm = {
  id?: string;
  name: string;
  notes: string;
  active: boolean;
  /** Initial balance (new customers only), as typed. */
  initial: string;
};

const EMPTY_CUSTOMER: CustomerForm = { name: "", notes: "", active: true, initial: "" };

function CustomerDialog({
  form: initial,
  onClose,
}: {
  form: CustomerForm | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!initial} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {initial ? (
          <CustomerFormBody key={initial.id ?? "new"} initial={initial} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CustomerFormBody({ initial, onClose }: { initial: CustomerForm; onClose: () => void }) {
  const t = useT();
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveCustomer);
  const deleteFn = useServerFn(deleteCustomer);
  const [form, setForm] = useState(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const done = (message: string) => {
    queryClient.invalidateQueries({ queryKey: customersQuery.queryKey });
    toast.success(message);
    onClose();
  };

  const save = useMutation({
    mutationFn: (initial_balance: number) =>
      saveFn({
        data: {
          id: form.id,
          name: form.name,
          notes: form.notes,
          active: form.active,
          initial_balance,
        },
      }),
    onSuccess: () => done(t("Cliente salvo")),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { id: form.id! } }),
    onSuccess: () => done(t("Cliente excluído")),
    onError: (e: Error) => {
      setConfirmDelete(false);
      toast.error(e.message);
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.name.trim()) {
          toast.error(t("Informe o nome do cliente"));
          return;
        }
        const value = form.initial.trim() ? parseMoney(form.initial) : 0;
        if (Number.isNaN(value) || value < 0) {
          toast.error(t("Valor inválido"));
          return;
        }
        save.mutate(value);
      }}
    >
      <DialogHeader>
        <DialogTitle>{form.id ? t("Editar cliente") : t("Novo cliente")}</DialogTitle>
        <DialogDescription>{t("O saldo só pode ser usado nesta loja.")}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="customer-name">{t("Nome")}</Label>
          <Input
            id="customer-name"
            required
            maxLength={80}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="customer-notes">{t("Observação (telefone, grupo...)")}</Label>
          <Input
            id="customer-notes"
            maxLength={120}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        {!form.id ? (
          <div className="grid gap-2">
            <Label htmlFor="customer-initial">{t("Saldo inicial (R$)")}</Label>
            <Input
              id="customer-initial"
              inputMode="decimal"
              className="tabular"
              placeholder="0,00"
              value={form.initial}
              onChange={(e) => setForm({ ...form, initial: e.target.value })}
            />
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          <Switch
            id="customer-active"
            checked={form.active}
            onCheckedChange={(v) => setForm({ ...form, active: v })}
          />
          <Label htmlFor="customer-active">{t("Cliente ativo (pode comprar com saldo)")}</Label>
        </div>
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        {form.id ? (
          confirmDelete ? (
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {t("Confirmar exclusão")}
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" /> {t("Excluir")}
            </Button>
          )
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("Cancelar")}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {t("Salvar")}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

/* --------------------------------- Balance --------------------------------- */

function BalanceDialog({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  return (
    <Dialog open={!!customer} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {customer ? <BalanceForm key={customer.id} customer={customer} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function BalanceForm({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const t = useT();
  const queryClient = useQueryClient();
  const adjustFn = useServerFn(adjustCustomerBalance);
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");

  const amount = parseMoney(value);
  const valid = !Number.isNaN(amount) && amount > 0;
  const after = customer.balance + (valid ? (mode === "add" ? amount : -amount) : 0);

  const adjust = useMutation({
    mutationFn: () =>
      adjustFn({
        data: { customer_id: customer.id, delta: mode === "add" ? amount : -amount, reason },
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: customersQuery.queryKey });
      queryClient.invalidateQueries({ queryKey: ["customer-movements", customer.id] });
      toast.success(
        t("Novo saldo de {name}: {value}", { name: customer.name, value: brl(res.balance) }),
      );
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) {
          toast.error(t("Informe um valor"));
          return;
        }
        if (after < 0) {
          toast.error(t("O saldo do cliente não pode ficar negativo"));
          return;
        }
        adjust.mutate();
      }}
    >
      <DialogHeader>
        <DialogTitle>{t("Saldo de {name}", { name: customer.name })}</DialogTitle>
        <DialogDescription>
          {t("Saldo atual")}: <span className="tabular font-semibold">{brl(customer.balance)}</span>
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-2 gap-2">
          {(["add", "remove"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                mode === m
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "add" ? <Plus className="size-4" /> : <Minus className="size-4" />}
              {m === "add" ? t("Adicionar crédito") : t("Retirar saldo")}
            </button>
          ))}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="balance-value">{t("Valor (R$)")}</Label>
          <Input
            id="balance-value"
            autoFocus
            inputMode="decimal"
            className="tabular h-11 text-lg"
            placeholder="0,00"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="balance-reason">{t("Motivo (opcional)")}</Label>
          <Input
            id="balance-reason"
            maxLength={80}
            placeholder={mode === "add" ? t("Ex.: recarga em dinheiro") : t("Ex.: devolução")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="flex justify-between rounded-lg bg-secondary/60 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t("Saldo depois")}</span>
          <span className={cn("tabular font-semibold", after < 0 && "text-destructive")}>
            {brl(after)}
          </span>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("Cancelar")}
        </Button>
        <Button type="submit" disabled={adjust.isPending || !valid || after < 0}>
          {t("Confirmar")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/* -------------------------------- Statement -------------------------------- */

const REASON_LABEL: Record<string, string> = {
  venda: "Compra",
  credito: "Crédito",
  ajuste: "Ajuste",
  "saldo inicial": "Saldo inicial",
};

function StatementDialog({
  customer,
  onClose,
}: {
  customer: Customer | null;
  onClose: () => void;
}) {
  const t = useT();
  const listFn = useServerFn(listCustomerMovements);
  const { data: movements, isLoading } = useQuery({
    queryKey: ["customer-movements", customer?.id],
    queryFn: () => listFn({ data: { customer_id: customer!.id } }),
    enabled: !!customer,
  });

  return (
    <Dialog open={!!customer} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Extrato de {name}", { name: customer?.name ?? "" })}</DialogTitle>
          <DialogDescription>
            {t("Saldo atual")}:{" "}
            <span className="tabular font-semibold">{brl(customer?.balance ?? 0)}</span>
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
          </div>
        ) : !movements?.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("Nenhuma movimentação ainda.")}
          </p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {movements.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t(REASON_LABEL[m.reason] ?? m.reason)}</p>
                  <p className="text-xs text-muted-foreground">{dateTime(m.created_at)}</p>
                </div>
                <span
                  className={cn(
                    "tabular font-semibold",
                    m.delta < 0 ? "text-destructive" : "text-primary",
                  )}
                >
                  {m.delta > 0 ? "+" : ""}
                  {brl(m.delta)}
                </span>
                <span className="tabular w-24 text-right text-muted-foreground">
                  {brl(m.balance_after)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
