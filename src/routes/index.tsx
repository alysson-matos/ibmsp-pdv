import { createFileRoute, Link } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ScanBarcode,
  Trash2,
  Plus,
  Minus,
  Banknote,
  CreditCard,
  QrCode,
  Wallet,
  CheckCircle2,
  ShoppingCart,
  PiggyBank,
  X,
} from "lucide-react";

import {
  checkout,
  listOperators,
  listProducts,
  PAYMENT_METHODS,
  type PaymentMethod,
  type Product,
  type Sale,
} from "@/lib/pos.functions";
import { brl, PAYMENT_LABEL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import logoAsset from "@/assets/logo-ibmemorial.png.asset.json";
import { useT } from "@/i18n";
import { RouteError } from "@/components/route-error";
import { prefetchQuiet } from "@/lib/prefetch";
import { listCustomers, type Customer } from "@/lib/customers.functions";
import { useCurrentStore } from "@/lib/use-current-store";


const productsQuery = queryOptions({
  queryKey: ["products"],
  queryFn: () => listProducts(),
});

const operatorsQuery = queryOptions({
  queryKey: ["operators"],
  queryFn: () => listOperators(),
});

const customersQuery = queryOptions({
  queryKey: ["customers"],
  queryFn: () => listCustomers(),
});

const OPERATOR_STORAGE_KEY = "pdv:operator-id";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PDV - IBMemorial — Venda com leitor de código de barras" },
      {
        name: "description",
        content:
          "PDV - IBMemorial: leia o código de barras, confira os produtos, o valor final e escolha a forma de pagamento.",
      },
      { property: "og:title", content: "PDV - IBMemorial — Venda com leitor de código de barras" },
      {
        property: "og:description",
        content: "Leitura de código de barras, carrinho, total e formas de pagamento em uma só tela.",
      },
      { property: "og:url", content: "https://ibmsp-pdv.lovable.app/" },
      { property: "og:image", content: `https://ibmsp-pdv.lovable.app${logoAsset.url}` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: `https://ibmsp-pdv.lovable.app${logoAsset.url}` },
    ],
    links: [{ rel: "canonical", href: "https://ibmsp-pdv.lovable.app/" }],
  }),

  errorComponent: RouteError,
  notFoundComponent: NotFound,
  loader: ({ context }) =>
    Promise.all([
      prefetchQuiet(context.queryClient, productsQuery.queryKey, () => listProducts()),
      prefetchQuiet(context.queryClient, operatorsQuery.queryKey, () => listOperators()),
    ]),
  component: PdvPage,
});

function NotFound() {
  const t = useT();
  return <div className="p-8">{t("Nada por aqui.")}</div>;
}

type CartLine = { product: Product; quantity: number };

const paymentIcons: Record<PaymentMethod, typeof Banknote> = {
  dinheiro: Banknote,
  debito: CreditCard,
  credito: Wallet,
  pix: QrCode,
  saldo: PiggyBank,
};

function PdvPage() {
  const t = useT();
  const { data: products } = useSuspenseQuery(productsQuery);
  const { data: operators } = useSuspenseQuery(operatorsQuery);
  const queryClient = useQueryClient();
  const checkoutFn = useServerFn(checkout);
  const store = useCurrentStore();
  const balanceEnabled = !!store?.customer_balance;
  const paymentMethods = PAYMENT_METHODS.filter((m) => m !== "saldo" || balanceEnabled);
  const { data: customers = [] } = useQuery({ ...customersQuery, enabled: balanceEnabled });

  const [cart, setCart] = useState<CartLine[]>([]);
  const [scan, setScan] = useState("");
  const [discount, setDiscount] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("credito");
  const [received, setReceived] = useState("");
  const [customer, setCustomer] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [operatorId, setOperatorId] = useState("");
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);

  const focusScanner = () => scanRef.current?.focus();
  useEffect(() => {
    focusScanner();
  }, [lastSale]);


  const activeOperators = useMemo(() => operators.filter((o) => o.active), [operators]);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(OPERATOR_STORAGE_KEY) : null;
    if (saved && activeOperators.some((o) => o.id === saved)) setOperatorId(saved);
  }, [activeOperators]);

  function chooseOperator(id: string) {
    setOperatorId(id);
    if (typeof window !== "undefined") localStorage.setItem(OPERATOR_STORAGE_KEY, id);
  }

  const activeProducts = useMemo(() => products.filter((p) => p.active), [products]);

  const suggestions = useMemo(() => {
    const term = scan.trim().toLowerCase();
    if (term.length < 2) return [];
    return activeProducts
      .filter((p) => p.name.toLowerCase().includes(term) || p.barcode.includes(term))
      .slice(0, 6);
  }, [scan, activeProducts]);

  const subtotal = cart.reduce((sum, l) => sum + l.product.price * l.quantity, 0);
  const discountValue = Math.min(Math.max(Number(discount.replace(",", ".")) || 0, 0), subtotal);
  const total = subtotal - discountValue;
  const receivedValue = Number(received.replace(",", ".")) || 0;
  const change = payment === "dinheiro" && receivedValue > 0 ? receivedValue - total : 0;

  const payWithBalance = payment === "saldo";
  const selectedCustomer = payWithBalance
    ? (customers.find((c) => c.id === customerId && c.active) ?? null)
    : null;
  const balanceShort = selectedCustomer ? selectedCustomer.balance < total : false;
  const buyerMissing = payWithBalance ? !selectedCustomer : !customer.trim();

  function addProduct(product: Product) {
    setLastSale(null);
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      const currentQty = existing?.quantity ?? 0;
      if (product.stock <= 0) {
        toast.error(t("{name} está sem estoque e não pode ser vendido", { name: product.name }));
        return prev;
      }
      if (currentQty + 1 > product.stock) {
        toast.error(
          t("Estoque insuficiente: restam {stock} un. de {name}", {
            stock: product.stock,
            name: product.name,
          }),
        );
        return prev;
      }
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = scan.trim();
    if (!code) return;

    const byBarcode = activeProducts.find((p) => p.barcode === code);
    const match = byBarcode ?? (suggestions.length === 1 ? suggestions[0] : undefined);

    if (!match) {
      toast.error(t('Produto não encontrado para "{code}"', { code }));
      return;
    }
    addProduct(match);
    setScan("");
  }

  function setQuantity(productId: string, quantity: number) {
    setCart((prev) =>
      prev.flatMap((l) => {
        if (l.product.id !== productId) return [l];
        if (quantity <= 0) return [];
        if (quantity > l.product.stock) {
          toast.error(
            t("Restam apenas {stock} un. de {name}", {
              stock: l.product.stock,
              name: l.product.name,
            }),
          );
          return [l];
        }
        return [{ ...l, quantity }];
      }),
    );
  }

  const mutation = useMutation({
    mutationFn: (vars: {
      items: { product_id: string; quantity: number }[];
      payment_method: PaymentMethod;
      customer_name: string;
      customer_id: string | null;
      operator_id: string;
      discount: number;
      amount_received: number | null;
    }) => checkoutFn({ data: vars }),
    onSuccess: (sale) => {
      setLastSale(sale);
      setCart([]);
      setDiscount("");
      setReceived("");
      setCustomer("");
      setCustomerId(null);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["shipping"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      toast.success(t("Venda finalizada!"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function finalize() {
    if (cart.length === 0) {
      toast.error(t("Adicione produtos ao carrinho"));
      return;
    }
    if (payWithBalance && !selectedCustomer) {
      toast.error(t("Selecione o cliente para pagar com saldo"));
      return;
    }
    if (payWithBalance && balanceShort) {
      toast.error(
        t("Saldo insuficiente: {name} tem {balance}", {
          name: selectedCustomer!.name,
          balance: brl(selectedCustomer!.balance),
        }),
      );
      return;
    }
    if (!payWithBalance && !customer.trim()) {
      toast.error(t("Informe o nome do comprador"));
      return;
    }
    if (!operatorId) {
      toast.error(t("Selecione o operador da venda"));
      return;
    }
    if (payment === "dinheiro" && received && receivedValue < total) {
      toast.error(t("Valor recebido menor que o total"));
      return;
    }
    mutation.mutate({
      items: cart.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
      payment_method: payment,
      customer_name: payWithBalance ? selectedCustomer!.name : customer.trim(),
      customer_id: payWithBalance ? selectedCustomer!.id : null,
      operator_id: operatorId,
      discount: discountValue,
      amount_received: payment === "dinheiro" && received ? receivedValue : null,
    });
  }

  function newSale() {
    setCart([]);
    setScan("");
    setDiscount("");
    setReceived("");
    setCustomer("");
    setCustomerId(null);
    setPayment("credito");
    setLastSale(null);
    requestAnimationFrame(focusScanner);
  }

  const shortcutRef = useRef({ finalize, newSale, balanceEnabled });
  shortcutRef.current = { finalize, newSale, balanceEnabled };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey) return;
      const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
      // Alt (Option on Mac) or, on Mac only, Control as an alternative.
      const altOnly = e.altKey && !e.ctrlKey;
      const macCtrl = isMac && e.ctrlKey && !e.altKey;
      if (!altOnly && !macCtrl) return;
      // Use the physical key (e.code): on Mac, Option changes e.key into
      // special characters (¡, ∫, ç, ƒ, dead keys), so e.key never matches.
      const codeMap: Record<string, string> = {
        Digit1: "1", Digit2: "2", Digit3: "3", Digit4: "4", Digit5: "5",
        Numpad1: "1", Numpad2: "2", Numpad3: "3", Numpad4: "4", Numpad5: "5",
        KeyB: "b", KeyC: "c", KeyF: "f", KeyN: "n",
      };
      const key = codeMap[e.code] ?? e.key.toLowerCase();
      const paymentByKey: Record<string, PaymentMethod> = {
        "1": "credito",
        "2": "debito",
        "3": "pix",
        "4": "dinheiro",
        ...(shortcutRef.current.balanceEnabled ? { "5": "saldo" as const } : {}),
      };
      if (paymentByKey[key]) {
        e.preventDefault();
        setPayment(paymentByKey[key]);
        return;
      }
      if (key === "b") {
        e.preventDefault();
        scanRef.current?.focus();
        scanRef.current?.select();
        return;
      }
      if (key === "c") {
        e.preventDefault();
        customerRef.current?.focus();
        customerRef.current?.select();
        return;
      }
      if (key === "f") {
        e.preventDefault();
        shortcutRef.current.finalize();
        return;
      }
      if (key === "n") {
        e.preventDefault();
        shortcutRef.current.newSale();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);



  return (
    <main className="mx-auto grid max-w-[1600px] gap-4 p-4 lg:grid-cols-[1fr_400px]">
      <h1 className="sr-only">{t("PDV")} - IBMemorial</h1>




      <section className="flex flex-col gap-4">
        <form
          onSubmit={handleScanSubmit}
          className="rounded-xl border border-border bg-card p-4 shadow-lg"
        >
          <Label htmlFor="scan" className="text-xs uppercase tracking-widest text-muted-foreground">
            {t("Leitor de código de barras")}
          </Label>
          <div className="mt-2 flex items-center gap-3 rounded-lg border-2 border-primary/40 bg-background px-3 focus-within:border-primary">
            <ScanBarcode className="size-6 shrink-0 text-primary" />
            <Input
              id="scan"
              ref={scanRef}
              autoFocus
              autoComplete="off"
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              placeholder={t("Passe o produto no leitor ou digite o código / nome")}
              className="tabular h-14 border-0 bg-transparent text-lg shadow-none focus-visible:ring-0"
            />
            <Button type="submit" size="sm" className="shrink-0">
              {t("Adicionar")}
            </Button>
          </div>

          {suggestions.length > 0 && (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {suggestions.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      addProduct(p);
                      setScan("");
                      focusScanner();
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-left transition-colors hover:border-primary/60 hover:bg-secondary"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="tabular block text-xs text-muted-foreground">{p.barcode}</span>
                    </span>
                    <span className="tabular text-sm font-semibold text-primary">{brl(p.price)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>

        <div className="min-h-[320px] rounded-xl border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest">
              <ShoppingCart className="size-4 text-primary" /> {t("Carrinho")}
            </h2>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setCart([])}>
                {t("Limpar")}
              </Button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="grid place-items-center gap-2 px-4 py-16 text-center text-muted-foreground">
              <ScanBarcode className="size-10 opacity-40" />
              <p className="text-sm">{t("Nenhum item. Passe o primeiro produto no leitor.")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {cart.map((line) => (
                <li key={line.product.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{line.product.name}</p>
                    <p className="tabular text-xs text-muted-foreground">
                      {line.product.barcode} · {brl(line.product.price)} un.
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => setQuantity(line.product.id, line.quantity - 1)}
                      aria-label={t("Diminuir quantidade")}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <span className="tabular w-8 text-center text-base font-semibold">
                      {line.quantity}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => setQuantity(line.product.id, line.quantity + 1)}
                      aria-label={t("Aumentar quantidade")}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  <span className="tabular w-24 text-right font-semibold">
                    {brl(line.product.price * line.quantity)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setQuantity(line.product.id, 0)}
                    aria-label={t("Remover item")}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lastSale && <Receipt sale={lastSale} onNew={newSale} />}
      </section>

      <aside className="flex h-fit flex-col gap-4 lg:sticky lg:top-[4.5rem]">
        <div className="rounded-xl border border-border bg-card p-4 shadow-lg">
          <Label htmlFor="operator" className="text-xs uppercase tracking-widest text-muted-foreground">
            {t("Operador da venda")} <span className="text-destructive">*</span>
          </Label>

          {activeOperators.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("Nenhum operador cadastrado.")}{" "}
              <Link to="/operadores" className="text-primary underline">
                {t("Cadastrar operadores")}
              </Link>
            </p>
          ) : (
            <select
              id="operator"
              required
              aria-required="true"
              aria-invalid={!operatorId}
              value={operatorId}
              onChange={(e) => chooseOperator(e.target.value)}
              className={cn(
                "mt-2 h-[3.75rem] w-full rounded-lg border-2 bg-background px-3 text-base",
                operatorId ? "border-primary/40" : "border-destructive/60",
              )}
            >
              <option value="">{t("Selecione o operador")}</option>
              {activeOperators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          {!operatorId && activeOperators.length > 0 && (
            <p className="mt-2 text-xs text-destructive">{t("Obrigatório selecionar o operador.")}</p>

          )}
        </div>

        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-lg">
        <div className="space-y-1">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{t("Subtotal")}</span>
            <span className="tabular">{brl(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <Label htmlFor="discount">{t("Desconto")}</Label>
            <Input
              id="discount"
              inputMode="decimal"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              placeholder={t("0,00")}
              className="tabular h-8 w-28 text-right"
            />
          </div>
        </div>

        <div className="rounded-lg bg-secondary/60 p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{t("Total a pagar")}</p>
          <p className="tabular mt-1 text-4xl font-bold text-primary">{brl(total)}</p>
        </div>

        <div>
          <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
            {t("Forma de pagamento")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {paymentMethods.map((method, idx) => {
              const Icon = paymentIcons[method];
              return (
                <button
                  key={method}
                  type="button"
                  title={t("Atalho: Alt+{n}", { n: idx + 1 })}
                  onClick={() => setPayment(method)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition-colors",
                    payment === method
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {t(PAYMENT_LABEL[method] ?? method)}
                  <kbd className="ml-auto rounded border border-border px-1 text-[10px] text-muted-foreground">
                    {t("Alt+{n}", { n: idx + 1 })}
                  </kbd>
                </button>
              );
            })}
          </div>
        </div>


        {payWithBalance ? (
          <CustomerBalancePicker
            customers={customers}
            selected={selectedCustomer}
            search={customer}
            onSearch={setCustomer}
            onSelect={(c) => {
              setCustomerId(c?.id ?? null);
              setCustomer(c ? c.name : "");
            }}
            total={total}
            inputRef={customerRef}
          />
        ) : (
          <div className="space-y-2">
            <Label htmlFor="customer" className="text-xs uppercase tracking-widest text-muted-foreground">
              {t("Nome do comprador")} <span className="text-destructive">*</span>{" "}
              <kbd className="rounded border border-border px-1 text-[10px] normal-case">{t("Alt+C")}</kbd>
            </Label>
            <Input
              id="customer"
              ref={customerRef}

              required
              aria-required="true"
              aria-invalid={!customer.trim()}
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder={t("Quem vai retirar os produtos")}
              className={cn("h-11", !customer.trim() && "border-destructive/60")}
            />
            {!customer.trim() && (
              <p className="text-xs text-destructive">{t("Obrigatório informar o comprador.")}</p>
            )}
          </div>
        )}

        {payment === "dinheiro" && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <Label htmlFor="received" className="text-xs uppercase tracking-widest text-muted-foreground">
              {t("Valor recebido")}
            </Label>
            <Input
              id="received"
              inputMode="decimal"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              placeholder={t("0,00")}
              className="tabular h-11 text-lg"
            />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("Troco")}</span>
              <span className={cn("tabular font-semibold", change < 0 && "text-destructive")}>
                {brl(Math.max(change, 0))}
              </span>
            </div>
          </div>
        )}

        <Button
          size="lg"
          className="h-14 text-base font-semibold"
          disabled={
            cart.length === 0 ||
            mutation.isPending ||
            !operatorId ||
            buyerMissing ||
            (payWithBalance && balanceShort)
          }
          onClick={finalize}
        >
          {mutation.isPending ? t("Finalizando...") : t("Finalizar venda (Alt+F)")}
        </Button>

        <Button variant="outline" className="h-11" onClick={newSale}>
          {t("Nova venda (Alt+N)")}
        </Button>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t(
            "Atalhos: Alt+1 Crédito · Alt+2 Débito · Alt+3 Pix · Alt+4 Dinheiro · Alt+B leitor · Alt+C comprador · Alt+F finalizar · Alt+N nova venda",
          )}
          {balanceEnabled ? ` · ${t("Alt+5 Saldo")}` : ""}
        </p>

        </div>
      </aside>
    </main>
  );
}

function Receipt({ sale, onNew }: { sale: Sale; onNew: () => void }) {
  const t = useT();
  return (
    <div className="rounded-xl border border-accent/50 bg-accent/10 p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-accent">
          <CheckCircle2 className="size-5" /> {t("Venda registrada")}
        </h2>
        <Button size="sm" variant="outline" onClick={onNew}>
          {t("Nova venda")}
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("Comprador")}: <span className="font-semibold text-foreground">{sale.customer_name}</span> ·{" "}
        {t("Operador")}: <span className="font-semibold text-foreground">{sale.operator_name || "—"}</span> ·{" "}
        {t("retirada na expedição")}
      </p>
      <ul className="mt-3 space-y-1 text-sm">
        {sale.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-4">
            <span className="truncate">
              {item.quantity}× {item.product_name}
            </span>
            <span className="tabular">{brl(item.subtotal)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 border-t border-border pt-3 text-sm">
        {sale.discount > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>{t("Desconto")}</span>
            <span className="tabular">-{brl(sale.discount)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold">
          <span>{t("Total")} · {t(PAYMENT_LABEL[sale.payment_method] ?? sale.payment_method)}</span>
          <span className="tabular">{brl(sale.total)}</span>
        </div>
        {sale.payment_method === "dinheiro" && sale.amount_received != null && (
          <div className="flex justify-between text-muted-foreground">
            <span>{t("Recebido {value} · Troco", { value: brl(sale.amount_received) })}</span>
            <span className="tabular">{brl(sale.change_amount)}</span>
          </div>
        )}
        {sale.customer_balance_after != null && (
          <div className="flex justify-between text-muted-foreground">
            <span>{t("Saldo restante de {name}", { name: sale.customer_name })}</span>
            <span className="tabular font-semibold text-foreground">
              {brl(sale.customer_balance_after)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function CustomerBalancePicker({
  customers,
  selected,
  search,
  onSearch,
  onSelect,
  total,
  inputRef,
}: {
  customers: Customer[];
  selected: Customer | null;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (customer: Customer | null) => void;
  total: number;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const t = useT();
  const term = search.trim().toLowerCase();
  const matches = useMemo(() => {
    const active = customers.filter((c) => c.active);
    if (!term) return active.slice(0, 6);
    return active
      .filter((c) => c.name.toLowerCase().includes(term) || c.notes.toLowerCase().includes(term))
      .slice(0, 6);
  }, [customers, term]);

  if (selected) {
    const after = selected.balance - total;
    const short = after < 0;
    return (
      <div
        className={cn(
          "space-y-2 rounded-lg border-2 p-3",
          short ? "border-destructive/60 bg-destructive/5" : "border-primary/40",
        )}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {t("Cliente")}
            </p>
            <p className="truncate text-base font-semibold">{selected.name}</p>
            {selected.notes ? (
              <p className="truncate text-xs text-muted-foreground">{selected.notes}</p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground"
            aria-label={t("Trocar cliente")}
            onClick={() => {
              onSelect(null);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t("Saldo disponível")}</span>
          <span className="tabular text-lg font-bold text-primary">{brl(selected.balance)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t("Saldo após a compra")}</span>
          <span className={cn("tabular font-semibold", short && "text-destructive")}>
            {brl(after)}
          </span>
        </div>
        {short ? (
          <p className="text-xs font-medium text-destructive">
            {t("Saldo insuficiente. Faltam {value}.", { value: brl(-after) })}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="customer" className="text-xs uppercase tracking-widest text-muted-foreground">
        {t("Cliente com saldo")} <span className="text-destructive">*</span>{" "}
        <kbd className="rounded border border-border px-1 text-[10px] normal-case">{t("Alt+C")}</kbd>
      </Label>
      <Input
        id="customer"
        ref={inputRef}
        autoComplete="off"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches.length === 1) {
            e.preventDefault();
            onSelect(matches[0]!);
          }
        }}
        placeholder={t("Buscar cliente pelo nome")}
        className="h-11 border-destructive/60"
      />
      {customers.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("Nenhum cliente cadastrado.")}{" "}
          <Link to="/clientes" className="text-primary underline">
            {t("Cadastrar clientes")}
          </Link>
        </p>
      ) : matches.length === 0 ? (
        <p className="text-xs text-destructive">{t("Nenhum cliente encontrado.")}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.name}</span>
                  {c.notes ? (
                    <span className="block truncate text-xs text-muted-foreground">{c.notes}</span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "tabular shrink-0 font-semibold",
                    c.balance < total ? "text-destructive" : "text-primary",
                  )}
                >
                  {brl(c.balance)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
