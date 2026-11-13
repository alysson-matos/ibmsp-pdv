import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  checkout,
  PAYMENT_METHODS,
  type PaymentMethod,
  type Product,
  type Sale,
} from "@/lib/pos.functions";
import { brl, PAYMENT_LABEL } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EASE_OUT, Seg, Sprite, useTween } from "@/components/retro";
import { confetti, fly, reducedMotion, replay } from "@/lib/fx";
import { cn } from "@/lib/utils";
import logoAsset from "@/assets/logo-ibmemorial.png.asset.json";
import { useLocale, useT } from "@/i18n";
import { RouteError } from "@/components/route-error";
import { prefetchQuiet } from "@/lib/prefetch";
import { type Customer } from "@/lib/customers.functions";
import {
  customersQuery,
  operatorsQuery,
  OPERATOR_STORAGE_KEY,
  productsQuery,
} from "@/lib/pdv-queries";
import { useCurrentStore } from "@/lib/use-current-store";

type CartLine = { product: Product; quantity: number };

/** How many product cards are drawn at once; the search narrows the rest down. */
const MAX_CARDS = 60;
const LINE = { duration: 0.2, ease: EASE_OUT };
const QUICK_CASH = [10, 20, 50, 100];

const parseMoney = (text: string) => Number(text.replace(",", ".")) || 0;
const moneyInput = (value: number) => value.toFixed(2).replace(".", ",");

/** Lowercase without accents, so "joao" finds "João". */
function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * PDV in the retro look (stores with "Visual retrô"): product grid, order on the
 * right, segmented payment and the receipt in a dialog. The route is in routes/index.tsx.
 */
export function PdvRetro() {
  const t = useT();
  const { data: products } = useSuspenseQuery(productsQuery);
  const { data: operators } = useSuspenseQuery(operatorsQuery);
  const queryClient = useQueryClient();
  const checkoutFn = useServerFn(checkout);
  const store = useCurrentStore();
  const balanceEnabled = !!store?.customer_balance;
  // Stores that sell with customer balance only take balance; the others never do.
  const paymentMethods = PAYMENT_METHODS.filter((m) => m !== "saldo");
  const { data: customers = [] } = useQuery({ ...customersQuery, enabled: balanceEnabled });

  const [cart, setCart] = useState<CartLine[]>([]);
  const [scan, setScan] = useState("");
  const [discount, setDiscount] = useState("");
  const [paymentChoice, setPayment] = useState<PaymentMethod>("credito");
  const payment: PaymentMethod = balanceEnabled
    ? "saldo"
    : paymentChoice === "saldo"
      ? "credito"
      : paymentChoice;
  const [received, setReceived] = useState("");
  const [customer, setCustomer] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [operatorId, setOperatorId] = useState("");
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [pluses, setPluses] = useState<{ id: number; text: string }[]>([]);
  const plusSeq = useRef(0);
  const scanRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);

  const focusScanner = () => scanRef.current?.focus();
  useEffect(() => {
    if (!lastSale) focusScanner();
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

  const activeProducts = useMemo(
    () =>
      products
        .filter((p) => p.active)
        .sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0) || a.name.localeCompare(b.name)),
    [products],
  );

  // What the search box matches: every product while it's empty.
  const matches = useMemo(() => {
    const term = normalize(scan.trim());
    if (!term) return activeProducts;
    return activeProducts.filter(
      (p) => normalize(p.name).includes(term) || p.barcode.includes(term),
    );
  }, [scan, activeProducts]);
  const shown = matches.slice(0, MAX_CARDS);

  const subtotal = cart.reduce((sum, l) => sum + l.product.price * l.quantity, 0);
  const discountValue = Math.min(Math.max(parseMoney(discount), 0), subtotal);
  const total = subtotal - discountValue;
  const receivedValue = parseMoney(received);
  const change = payment === "dinheiro" && receivedValue > 0 ? receivedValue - total : 0;
  const itemCount = cart.reduce((sum, l) => sum + l.quantity, 0);
  const shownTotal = useTween(Math.round(total * 100), 240) / 100;

  const payWithBalance = payment === "saldo";
  const selectedCustomer = payWithBalance
    ? (customers.find((c) => c.id === customerId && c.active) ?? null)
    : null;
  const balanceShort = selectedCustomer ? selectedCustomer.balance < total : false;

  /** Adds one unit. `card` is the product card that was tapped: its picture flies to the order. */
  function addProduct(product: Product, card?: HTMLElement | null) {
    const inCart = cart.find((l) => l.product.id === product.id)?.quantity ?? 0;
    if (product.stock <= 0) {
      replay(card, "shake");
      toast.error(t("{name} está sem estoque e não pode ser vendido", { name: product.name }));
      return;
    }
    if (inCart + 1 > product.stock) {
      replay(card, "shake");
      toast.error(
        t("Estoque insuficiente: restam {stock} un. de {name}", {
          stock: product.stock,
          name: product.name,
        }),
      );
      return;
    }
    setCart((prev) =>
      prev.some((l) => l.product.id === product.id)
        ? prev.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l))
        : [...prev, { product, quantity: 1 }],
    );
    // The floater removes itself when its animation ends, so it is only added when
    // animations run.
    if (!reducedMotion()) {
      const id = ++plusSeq.current;
      setPluses((list) => [...list, { id, text: "+" + brl(product.price) }]);
    }
    // Keep the scanner ready: a barcode read right after a tap must not land on the card.
    focusScanner();

    const box = document.getElementById("cartBox")?.getBoundingClientRect();
    const cartVisible = box ? box.top < innerHeight && box.bottom > 0 : false;
    const target = document.getElementById(cartVisible ? "cartIcon" : "miniIcon");
    if (card) fly(card.querySelector("img"), target, () => replay(target, "bump"));
    else replay(target, "bump");
  }

  /**
   * Adds the product with this exact barcode or, from the 2nd character typed, the only
   * product whose name or code contains the text. Returns false when nothing matches.
   */
  function submitCode(code: string): boolean {
    const term = normalize(code);
    const byBarcode = activeProducts.find((p) => p.barcode === code);
    const found =
      code.length >= 2
        ? activeProducts.filter((p) => normalize(p.name).includes(term) || p.barcode.includes(term))
        : [];
    const match = byBarcode ?? (found.length === 1 ? found[0] : undefined);

    if (!match) {
      replay(scanRef.current, "shake");
      toast.error(t('Produto não encontrado para "{code}"', { code }));
      return false;
    }
    addProduct(match, document.querySelector<HTMLElement>(`[data-product="${match.id}"]`));
    return true;
  }

  function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = scan.trim();
    if (code && submitCode(code)) setScan("");
  }

  function setQuantity(line: CartLine, quantity: number) {
    if (quantity > line.product.stock) {
      toast.error(
        t("Restam apenas {stock} un. de {name}", {
          stock: line.product.stock,
          name: line.product.name,
        }),
      );
      return;
    }
    setCart((prev) =>
      prev.flatMap((l) =>
        l.product.id !== line.product.id ? [l] : quantity <= 0 ? [] : [{ ...l, quantity }],
      ),
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
    },
    onError: (error: Error) => {
      replay(ctaRef.current, "shake");
      toast.error(error.message);
    },
  });

  /** Why the sale can't be finished yet (shown on the button itself), or null. */
  const blocker: string | null =
    cart.length === 0
      ? ""
      : !operatorId
        ? t("Selecione o operador")
        : payWithBalance && !selectedCustomer
          ? t("Escolha o cliente")
          : payWithBalance && balanceShort
            ? t("Saldo insuficiente")
            : !payWithBalance && !customer.trim()
              ? t("Informe o nome do comprador")
              : payment === "dinheiro" && received && receivedValue < total
                ? t("Valor recebido menor que o total")
                : null;
  const canFinish = blocker === null && !mutation.isPending;

  // Sheen: crosses the button once when it becomes enabled.
  const [sheen, setSheen] = useState(0);
  const wasReady = useRef(canFinish);
  useEffect(() => {
    if (canFinish && !wasReady.current) setSheen((k) => k + 1);
    wasReady.current = canFinish;
  }, [canFinish]);

  function finalize() {
    if (mutation.isPending) return;
    if (blocker !== null) {
      replay(ctaRef.current, "shake");
      toast.error(blocker || t("Adicione produtos ao carrinho"));
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

  const shortcutRef = useRef({ finalize, newSale, submitCode, balanceEnabled });
  shortcutRef.current = { finalize, newSale, submitCode, balanceEnabled };

  // While the receipt is open, a barcode read starts the next sale: the digits are
  // collected here (the dialog holds the focus) and Enter closes the receipt and adds
  // the product, instead of only pressing "Próxima venda" and losing the scan.
  const receiptOpen = !!lastSale;
  useEffect(() => {
    if (!receiptOpen) return;
    let buffer = "";
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length === 1 && e.key !== " ") {
        e.preventDefault();
        buffer += e.key;
        return;
      }
      if (e.key === "Enter" && buffer) {
        e.preventDefault();
        e.stopPropagation();
        const code = buffer;
        buffer = "";
        shortcutRef.current.newSale();
        if (!shortcutRef.current.submitCode(code)) setScan(code);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [receiptOpen]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // "/" jumps to the search and Ctrl+Enter finishes, as on the register keyboard.
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? "";
      if (
        e.key === "/" &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !/INPUT|SELECT|TEXTAREA/.test(tag)
      ) {
        e.preventDefault();
        scanRef.current?.focus();
        return;
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        shortcutRef.current.finalize();
        return;
      }
      if (e.metaKey) return;
      const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
      // Alt (Option on Mac) or, on Mac only, Control as an alternative.
      const altOnly = e.altKey && !e.ctrlKey;
      const macCtrl = isMac && e.ctrlKey && !e.altKey;
      if (!altOnly && !macCtrl) return;
      // Use the physical key (e.code): on Mac, Option changes e.key into
      // special characters (¡, ∫, ç, ƒ, dead keys), so e.key never matches.
      const codeMap: Record<string, string> = {
        Digit1: "1",
        Digit2: "2",
        Digit3: "3",
        Digit4: "4",
        Numpad1: "1",
        Numpad2: "2",
        Numpad3: "3",
        Numpad4: "4",
        KeyB: "b",
        KeyC: "c",
        KeyF: "f",
        KeyN: "n",
      };
      const key = codeMap[e.code] ?? e.key.toLowerCase();
      const paymentByKey: Record<string, PaymentMethod> = {
        "1": "credito",
        "2": "debito",
        "3": "pix",
        "4": "dinheiro",
      };
      if (paymentByKey[key] && !shortcutRef.current.balanceEnabled) {
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

  const items = (n: number) => `${n} ${n === 1 ? t("item") : t("itens")}`;
  const term = scan.trim();

  return (
    <>
      <h1 className="sr-only">{t("PDV")} - IBMemorial</h1>
      <div className="pos">
        <section aria-label={t("Produtos")}>
          <form onSubmit={handleScanSubmit} className="scanbar">
            <input
              id="scan"
              ref={scanRef}
              className="input"
              type="search"
              autoFocus
              autoComplete="off"
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              placeholder={t("Passe o produto no leitor ou digite o código / nome") + "  ( / )"}
              aria-label={t("Leitor de código de barras")}
            />
            <button type="submit" className="btn blue">
              <Sprite name="scan" size={22} />
              {t("Adicionar")}
            </button>
          </form>

          <h2 className="cathead" key={term ? "busca" : "todos"}>
            <Sprite name={term ? "scan" : "tag"} size={30} />
            {term ? t("Resultado da busca") : t("Produtos")}
            <span className="n">{items(matches.length)}</span>
          </h2>
          {shown.length ? (
            <div className="prod-grid">
              {shown.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  inCart={cart.find((l) => l.product.id === p.id)?.quantity ?? 0}
                  onAdd={addProduct}
                />
              ))}
            </div>
          ) : (
            <div className="empty">
              <Sprite name="scan" size={40} style={{ opacity: 0.5 }} />
              {term
                ? t('Nenhum produto com "{term}".', { term })
                : t("Nenhum produto ativo. Cadastre os produtos no Inventário.")}
            </div>
          )}
          {matches.length > shown.length ? (
            <p className="hint mt-3">
              {t("Mostrando {shown} de {total}. Digite o nome ou o código para achar os outros.", {
                shown: shown.length,
                total: matches.length,
              })}
            </p>
          ) : null}
        </section>

        <aside className="cart bevel" id="cartBox" aria-label={t("Pedido")}>
          <div className="cart-head">
            <Sprite id="cartIcon" name="cart" size={24} />
            {t("PEDIDO")}
            {cart.length > 0 && (
              <button type="button" onClick={() => setCart([])}>
                {t("Limpar")}
              </button>
            )}
            <span className="count">{items(itemCount)}</span>
          </div>
          <div className="cart-body sunken">
            <AnimatePresence initial={false}>
              {cart.map((line) => (
                <CartRow key={line.product.id} line={line} onQuantity={setQuantity} />
              ))}
            </AnimatePresence>
            {cart.length === 0 && (
              <div className="empty">
                <Sprite name="cart" size={40} style={{ opacity: 0.5 }} />
                <span>{t("Toque nos produtos ou passe no leitor para montar o pedido.")}</span>
              </div>
            )}
          </div>
          <div className="cart-total">
            <span className="label">{t("Total a pagar")}</span>
            <span className="big num" aria-live="polite">
              {brl(shownTotal)}
            </span>
            {pluses.map((p) => (
              <span
                key={p.id}
                className="plus"
                aria-hidden="true"
                onAnimationEnd={() => setPluses((list) => list.filter((x) => x.id !== p.id))}
              >
                {p.text}
              </span>
            ))}
          </div>

          <div className="pay">
            <label className="field" htmlFor="operator">
              <span>
                {t("Operador da venda")} <span className="text-destructive">*</span>
              </span>
              {activeOperators.length === 0 ? (
                <span className="hint font-medium">
                  {t("Nenhum operador cadastrado.")}{" "}
                  <Link to="/operadores" className="text-navy underline">
                    {t("Cadastrar operadores")}
                  </Link>
                </span>
              ) : (
                <select
                  id="operator"
                  className="input"
                  required
                  aria-required="true"
                  aria-invalid={!operatorId}
                  value={operatorId}
                  onChange={(e) => chooseOperator(e.target.value)}
                >
                  <option value="">{t("Selecione o operador")}</option>
                  {activeOperators.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              )}
            </label>

            <div className="payrow">
              <span>{t("Subtotal")}</span>
              <span className="num">{brl(subtotal)}</span>
            </div>
            <label className="payrow" htmlFor="discount">
              <span>{t("Desconto")}</span>
              <input
                id="discount"
                className="input num"
                inputMode="decimal"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder={t("0,00")}
                style={{ width: 120, textAlign: "right", fontSize: 20 }}
              />
            </label>

            {!balanceEnabled && (
              <Seg
                options={paymentMethods.map((m) => [m, t(PAYMENT_LABEL[m] ?? m)] as const)}
                value={payment}
                onChange={setPayment}
                label={t("Forma de pagamento")}
              />
            )}

            <div className="paypanel">
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
                <label className="field" htmlFor="customer">
                  <span>
                    {t("Nome do comprador")} <span className="text-destructive">*</span>{" "}
                    <kbd>{t("Alt+C")}</kbd>
                  </span>
                  <input
                    id="customer"
                    ref={customerRef}
                    className="input"
                    required
                    aria-required="true"
                    aria-invalid={cart.length > 0 && !customer.trim()}
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value)}
                    placeholder={t("Quem vai retirar os produtos")}
                  />
                </label>
              )}

              {payment === "dinheiro" && (
                <>
                  <label className="field" htmlFor="received">
                    {t("Valor recebido")}
                    <input
                      id="received"
                      className="input num"
                      inputMode="decimal"
                      value={received}
                      onChange={(e) => setReceived(e.target.value)}
                      placeholder={t("0,00")}
                      style={{ fontSize: 22 }}
                    />
                  </label>
                  <div className="quick">
                    {QUICK_CASH.map((v) => (
                      <button
                        key={v}
                        type="button"
                        className="btn sm"
                        onClick={() => setReceived(moneyInput(v))}
                      >
                        {brl(v)}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => setReceived(moneyInput(total))}
                    >
                      {t("Valor exato")}
                    </button>
                  </div>
                  <div className="troco">
                    <span>{t("Troco")}</span>
                    <span className="num" style={{ color: change < 0 ? "var(--bad)" : undefined }}>
                      {change < 0
                        ? t("faltam {value}", { value: brl(-change) })
                        : brl(Math.max(change, 0))}
                    </span>
                  </div>
                </>
              )}
              {payment === "pix" && (
                <div className="hint">{t("Confirme o Pix antes de finalizar.")}</div>
              )}
              {(payment === "credito" || payment === "debito") && (
                <div className="hint">
                  {t("Passe o cartão na maquininha e finalize depois da aprovação.")}
                </div>
              )}
            </div>

            <button
              ref={ctaRef}
              type="button"
              className="btn primary cta"
              disabled={!canFinish}
              onClick={finalize}
            >
              {mutation.isPending
                ? t("Finalizando...")
                : blocker
                  ? blocker
                  : cart.length
                    ? `${t("Finalizar venda")} · ${brl(total)}`
                    : t("Finalizar venda")}
              {sheen > 0 && <span key={sheen} className="sheen" aria-hidden="true" />}
            </button>
            <button type="button" className="btn" onClick={newSale}>
              {t("Nova venda (Alt+N)")}
            </button>

            <div className="hint">
              {balanceEnabled
                ? t(
                    "Atalhos: / busca · Ctrl+Enter ou Alt+F finaliza · Alt+C cliente · Alt+N nova venda",
                  )
                : t(
                    "Atalhos: / busca · Ctrl+Enter ou Alt+F finaliza · Alt+1–4 pagamento · Alt+C comprador · Alt+N nova venda",
                  )}
            </div>
          </div>
        </aside>
      </div>

      <div className="minibar">
        <Sprite id="miniIcon" name="cart" size={24} />
        <span>{items(itemCount)}</span>
        <span className="num">{brl(shownTotal)}</span>
        <button
          type="button"
          className="btn sm primary"
          onClick={() =>
            document
              .getElementById("cartBox")
              ?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" })
          }
        >
          {t("Pagar")}
        </button>
      </div>

      <Dialog open={!!lastSale} onOpenChange={(open) => !open && newSale()}>
        <DialogContent ok className="max-w-[440px]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("Venda registrada")}</DialogTitle>
          </DialogHeader>
          {lastSale ? (
            <Receipt sale={lastSale} storeName={store?.name ?? "PDV"} onNew={newSale} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProductCard({
  product: p,
  inCart,
  onAdd,
}: {
  product: Product;
  inCart: number;
  onAdd: (product: Product, card: HTMLElement) => void;
}) {
  const t = useT();
  const out = p.stock <= 0;
  const low = !out && p.stock <= p.min_stock;
  const left = p.stock - inCart;
  return (
    <button
      type="button"
      data-product={p.id}
      className={cn("prod", low && "low")}
      disabled={out}
      onClick={(e) => onAdd(p, e.currentTarget)}
      aria-label={`${p.name}, ${brl(p.price)}, ${
        out ? t("esgotado") : t("{n} em estoque", { n: left })
      }`}
      title={p.barcode}
    >
      <span className={cn("in-cart", inCart > 0 && "on")} aria-hidden="true">
        {inCart || ""}
      </span>
      <Sprite name="tag" />
      <b>{p.name}</b>
      <span className="price">{brl(p.price)}</span>
      <span className="stk" aria-hidden="true">
        {out ? t("ESGOTADO") : t("est {n}", { n: left })}
      </span>
    </button>
  );
}

function CartRow({
  line,
  onQuantity,
}: {
  line: CartLine;
  onQuantity: (line: CartLine, quantity: number) => void;
}) {
  const t = useT();
  const { product: p, quantity } = line;
  return (
    <motion.div
      style={{ overflow: "hidden" }}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1, transition: LINE }}
      exit={{ height: 0, opacity: 0, transition: LINE }}
    >
      <motion.div
        className="line-in"
        initial={{ x: -12 }}
        animate={{ x: 0, transition: LINE }}
        exit={{ x: 40, transition: LINE }}
      >
        <Sprite name="tag" size={28} />
        <div>
          <div className="nm">{p.name}</div>
          <div className="sub">
            {brl(p.price)} {t("un")}
          </div>
        </div>
        <div className="qty">
          <button
            type="button"
            aria-label={`${t("Diminuir quantidade")}: ${p.name}`}
            onClick={() => onQuantity(line, quantity - 1)}
          >
            −
          </button>
          <span className="q" aria-live="polite">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={quantity}
                initial={{ y: "-70%", opacity: 0 }}
                animate={{ y: 0, opacity: 1, transition: LINE }}
                exit={{ opacity: 0, transition: { duration: 0 } }}
              >
                {quantity}
              </motion.span>
            </AnimatePresence>
          </span>
          <button
            type="button"
            aria-label={`${t("Aumentar quantidade")}: ${p.name}`}
            onClick={() => onQuantity(line, quantity + 1)}
          >
            +
          </button>
        </div>
        <span className="lt">{brl(p.price * quantity)}</span>
        <button
          type="button"
          className="rm"
          aria-label={`${t("Remover item")}: ${p.name}`}
          onClick={() => onQuantity(line, 0)}
        >
          ×
        </button>
      </motion.div>
    </motion.div>
  );
}

function Receipt({ sale, storeName, onNew }: { sale: Sale; storeName: string; onNew: () => void }) {
  const t = useT();
  const locale = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      const dlg = ref.current?.closest(".dlg")?.getBoundingClientRect();
      if (dlg) confetti(dlg.left + dlg.width / 2, dlg.top + 40);
    }, 80);
    return () => clearTimeout(timer);
  }, []);

  const when = new Date(sale.created_at);
  return (
    <>
      <div className="receipt" ref={ref} aria-label={t("Comprovante")}>
        <div className="hd">{storeName.toUpperCase()} · PDV</div>
        <div className="r">
          <span>
            {when.toLocaleDateString(locale)}{" "}
            {when.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span>#{sale.id.slice(0, 6).toUpperCase()}</span>
        </div>
        {sale.items.map((item) => (
          <div className="r" key={item.id}>
            <span>
              {item.quantity}× {item.product_name}
            </span>
            <span>{brl(item.subtotal)}</span>
          </div>
        ))}
        {sale.discount > 0 && (
          <div className="r">
            <span>{t("Desconto")}</span>
            <span>-{brl(sale.discount)}</span>
          </div>
        )}
        <div className="r tot">
          <span>{t("TOTAL")}</span>
          <span>{brl(sale.total)}</span>
        </div>
        <div className="r">
          <span>{t(PAYMENT_LABEL[sale.payment_method] ?? sale.payment_method)}</span>
          <span>
            {sale.payment_method === "dinheiro" && sale.amount_received == null
              ? `${t("Troco").toLowerCase()} ${brl(sale.change_amount)}`
              : ""}
          </span>
        </div>
        {sale.payment_method === "dinheiro" && sale.amount_received != null && (
          <div className="r">
            <span>{t("Recebido {value} · Troco", { value: brl(sale.amount_received) })}</span>
            <span>{brl(sale.change_amount)}</span>
          </div>
        )}
        {sale.customer_balance_after != null && (
          <div className="r">
            <span>{t("Saldo restante de {name}", { name: sale.customer_name })}</span>
            <span>{brl(sale.customer_balance_after)}</span>
          </div>
        )}
      </div>
      <div className="hint">
        {t("Comprador")}: <b className="text-ink">{sale.customer_name}</b> · {t("Operador")}:{" "}
        <b className="text-ink">{sale.operator_name || "—"}</b> ·{" "}
        {sale.status === "entregue" ? t("entregue ao cliente") : t("retirada na expedição")}
      </div>
      <div className="dlg-actions">
        <button type="button" className="btn primary" autoFocus onClick={onNew}>
          {t("Próxima venda")}
        </button>
      </div>
    </>
  );
}

const MIN_SEARCH = 3;

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
  const term = normalize(search.trim());
  const [highlight, setHighlight] = useState(0);
  // Suggestions start at the 3rd letter typed; names starting with the term come first.
  const matches = useMemo(() => {
    if (term.length < MIN_SEARCH) return [];
    return customers
      .filter((c) => c.active)
      .map((c) => ({ c, name: normalize(c.name), notes: normalize(c.notes) }))
      .filter(({ name, notes }) => name.includes(term) || notes.includes(term))
      .sort((a, b) => Number(!a.name.startsWith(term)) - Number(!b.name.startsWith(term)))
      .slice(0, 8)
      .map(({ c }) => c);
  }, [customers, term]);
  const active = Math.min(highlight, Math.max(matches.length - 1, 0));

  if (selected) {
    const after = selected.balance - total;
    const short = after < 0;
    return (
      <>
        <div className="buyer">
          <div className="min-w-0">
            <div className="font-bold">{selected.name}</div>
            {selected.notes ? <div className="hint truncate">{selected.notes}</div> : null}
          </div>
          <div>
            <div className="label text-right">{t("Saldo")}</div>
            <div className="bal num">{brl(selected.balance)}</div>
          </div>
          <div className={cn("after", short && "neg")}>
            <span>{short ? t("Saldo insuficiente — faltam") : t("Saldo após a compra")}</span>
            <span className="num" style={{ fontSize: 18 }}>
              {brl(Math.abs(after))}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="btn sm"
          style={{ justifySelf: "start" }}
          onClick={() => {
            onSelect(null);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          {t("Trocar cliente")}
        </button>
      </>
    );
  }

  return (
    <>
      <label className="field" htmlFor="customer">
        <span>
          {t("Cliente")} <span className="text-destructive">*</span> <kbd>{t("Alt+C")}</kbd>
        </span>
        <input
          id="customer"
          ref={inputRef}
          className="input"
          type="search"
          autoComplete="off"
          role="combobox"
          aria-expanded={matches.length > 0}
          aria-controls="customer-suggestions"
          value={search}
          onChange={(e) => {
            onSearch(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && matches.length) {
              e.preventDefault();
              setHighlight((active + 1) % matches.length);
            } else if (e.key === "ArrowUp" && matches.length) {
              e.preventDefault();
              setHighlight((active - 1 + matches.length) % matches.length);
            } else if ((e.key === "Enter" || e.key === "Tab") && matches[active]) {
              e.preventDefault();
              onSelect(matches[active]);
            }
          }}
          placeholder={t("Digite o nome do cliente")}
        />
      </label>
      {customers.length === 0 ? (
        <div className="hint">
          {t("Nenhum cliente cadastrado.")}{" "}
          <Link to="/clientes" className="text-navy underline">
            {t("Cadastrar clientes")}
          </Link>
        </div>
      ) : term.length < MIN_SEARCH ? (
        <div className="hint">{t("Digite pelo menos 3 letras para buscar.")}</div>
      ) : matches.length === 0 ? (
        <div className="hint font-bold text-destructive">{t("Nenhum cliente encontrado.")}</div>
      ) : (
        <div id="customer-suggestions" role="listbox" className="results" key={term}>
          {matches.map((c, idx) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={idx === active}
              tabIndex={-1}
              className={cn("res", c.balance < total && "low")}
              style={{ animationDelay: `${Math.min(idx, 8) * 30}ms` }}
              onMouseEnter={() => setHighlight(idx)}
              onClick={() => onSelect(c)}
            >
              <span className="min-w-0 font-semibold">
                {c.name}
                {c.notes ? (
                  <span className="hint block truncate font-medium">{c.notes}</span>
                ) : null}
              </span>
              <span className="num">{brl(c.balance)}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
