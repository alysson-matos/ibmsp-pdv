import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Boxes, Pencil, Plus, Minus, Trash2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { exportToExcel, Pagination, SortableTh, usePagination, useSort } from "@/lib/table-tools";
import { useT } from "@/i18n";
import { RouteError } from "@/components/route-error";

import {
  adjustStock,
  deleteProduct,
  listProducts,
  saveProduct,
  type Product,
} from "@/lib/pos.functions";
import { brl } from "@/lib/format";
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

const productsQuery = queryOptions({
  queryKey: ["products"],
  queryFn: () => listProducts(),
});

export const Route = createFileRoute("/inventario")({
  head: () => ({
    meta: [
      { title: "Inventário — Guichê PDV" },
      {
        name: "description",
        content: "Cadastre produtos, defina preços e acompanhe o estoque disponível no guichê.",
      },
      { property: "og:title", content: "Inventário — Guichê PDV" },
      {
        property: "og:description",
        content: "Cadastro de produtos, preços, estoque mínimo e ajustes de entrada e saída.",
      },
    ],
  }),
  errorComponent: RouteError,
  notFoundComponent: () => <div className="p-8">Nada por aqui.</div>,
  loader: ({ context }) => context.queryClient.prefetchQuery(productsQuery),
  component: InventarioPage,
});

type FormState = {
  id?: string;
  barcode: string;
  name: string;
  price: string;
  stock: string;
  min_stock: string;
  active: boolean;
};

const PAGE_SIZE = 50;

const emptyForm: FormState = {
  barcode: "",
  name: "",
  price: "",
  stock: "0",
  min_stock: "5",
  active: true,
};

function InventarioPage() {
  const t = useT();
  const { data: products } = useSuspenseQuery(productsQuery);
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveProduct);
  const deleteFn = useServerFn(deleteProduct);
  const adjustFn = useServerFn(adjustStock);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [search, setSearch] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const saveMutation = useMutation({
    mutationFn: (data: Parameters<typeof saveProduct>[0]) => saveFn(data),
    onSuccess: () => {
      invalidate();
      setOpen(false);
      toast.success(t("Produto salvo"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success(t("Produto excluído"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Updates the stock on screen right away; the server result is reconciled once the
  // last pending click finishes, instead of reloading the whole list on every click.
  const adjustMutation = useMutation({
    mutationKey: ["adjust-stock"],
    mutationFn: (vars: { product_id: string; delta: number }) =>
      adjustFn({ data: { ...vars, reason: vars.delta > 0 ? "entrada" : "saida" } }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["products"] });
      queryClient.setQueryData<Product[]>(["products"], (old) =>
        old?.map((p) => (p.id === vars.product_id ? { ...p, stock: p.stock + vars.delta } : p)),
      );
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: ["adjust-stock"] }) === 1) {
        invalidate();
        queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      }
    },
  });

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode.includes(search.trim()),
  );

  const { sort, toggle, sorted } = useSort<Product>("name");
  const rows = sorted(filtered, {
    name: (p) => p.name,
    barcode: (p) => p.barcode,
    price: (p) => p.price,
    stock: (p) => p.stock,
    active: (p) => (p.active ? t("Ativo") : t("Inativo")),
  });
  const pagination = usePagination(rows, PAGE_SIZE);
  const toggleSort = (key: string) => {
    toggle(key);
    pagination.reset();
  };

  function exportXlsx() {
    void exportToExcel(
      "inventario",
      t("Inventário"),
      rows.map((p) => ({
        [t("Produto")]: p.name,
        [t("Código")]: p.barcode,
        [t("Preço")]: p.price,
        [t("Estoque")]: p.stock,
        [t("Estoque mínimo")]: p.min_stock,
        [t("Status")]: p.active ? t("Ativo") : t("Inativo"),
        [t("Valor total")]: p.stock * p.price,
      })),
    );
  }

  function openNew() {
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(product: Product) {
    setForm({
      id: product.id,
      barcode: product.barcode,
      name: product.name,
      price: String(product.price).replace(".", ","),
      stock: String(product.stock),
      min_stock: String(product.min_stock),
      active: product.active,
    });
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    saveMutation.mutate({
      data: {
        ...(form.id ? { id: form.id } : {}),
        barcode: form.barcode.trim(),
        name: form.name.trim(),
        price: Number(form.price.replace(",", ".")) || 0,
        stock: Number(form.stock) || 0,
        min_stock: Number(form.min_stock) || 0,
        active: form.active,
      },
    });
  }

  const lowStock = products.filter((p) => p.active && p.stock <= p.min_stock).length;

  return (
    <main className="mx-auto max-w-[1600px] p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Boxes className="size-6 text-primary" /> {t("Inventário")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("{count} produtos cadastrados", { count: products.length })}
            {lowStock > 0 && ` · ${t("{count} com estoque baixo", { count: lowStock })}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              pagination.reset();
            }}
            placeholder={t("Buscar por nome ou código")}
            className="w-64"
          />
          <Button variant="outline" onClick={exportXlsx}>
            <FileSpreadsheet className="size-4" /> {t("Exportar Excel")}
          </Button>
          <Button onClick={openNew}>
            <Plus className="size-4" /> {t("Novo produto")}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-lg">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <SortableTh label={t("Produto")} sortKey="name" sort={sort} onToggle={toggleSort} />
              <SortableTh label={t("Código")} sortKey="barcode" sort={sort} onToggle={toggleSort} />
              <SortableTh label={t("Preço")} sortKey="price" sort={sort} onToggle={toggleSort} align="right" />
              <SortableTh label={t("Estoque")} sortKey="stock" sort={sort} onToggle={toggleSort} align="center" />
              <SortableTh label={t("Status")} sortKey="active" sort={sort} onToggle={toggleSort} align="center" />
              <th className="px-4 py-3 text-right">{t("Ações")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pagination.pageRows.map((p) => {
              const low = p.stock <= p.min_stock;
              return (
                <tr key={p.id} className="hover:bg-secondary/30">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="tabular px-4 py-3 text-muted-foreground">{p.barcode}</td>
                  <td className="tabular px-4 py-3 text-right">{brl(p.price)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-7"
                        onClick={() => adjustMutation.mutate({ product_id: p.id, delta: -1 })}
                        aria-label={t("Remover uma unidade")}
                      >
                        <Minus className="size-3" />
                      </Button>
                      <span
                        className={cn(
                          "tabular inline-flex w-14 items-center justify-center gap-1 rounded px-1 py-0.5 font-semibold",
                          low ? "bg-destructive/20 text-destructive" : "text-foreground",
                        )}
                      >
                        {low && <AlertTriangle className="size-3" />}
                        {p.stock}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-7"
                        onClick={() => adjustMutation.mutate({ product_id: p.id, delta: 1 })}
                        aria-label={t("Adicionar uma unidade")}
                      >
                        <Plus className="size-3" />
                      </Button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        p.active
                          ? "bg-accent/20 text-accent"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {p.active ? t("Ativo") : t("Inativo")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(p)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMutation.mutate(p.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  {t("Nenhum produto encontrado.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination
          page={pagination.page}
          pageCount={pagination.pageCount}
          total={pagination.total}
          start={pagination.start}
          pageSize={PAGE_SIZE}
          onPageChange={pagination.setPage}
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{form.id ? t("Editar produto") : t("Novo produto")}</DialogTitle>
              <DialogDescription>
                {t("O código de barras é usado pelo leitor na tela de venda.")}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">{t("Nome")}</Label>
                <Input
                  id="name"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="barcode">{t("Código de barras")}</Label>
                <Input
                  id="barcode"
                  required
                  className="tabular"
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="price">{t("Preço (R$)")}</Label>
                  <Input
                    id="price"
                    inputMode="decimal"
                    className="tabular"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="stock">{t("Estoque")}</Label>
                  <Input
                    id="stock"
                    inputMode="numeric"
                    className="tabular"
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="min_stock">{t("Estoque mín.")}</Label>
                  <Input
                    id="min_stock"
                    inputMode="numeric"
                    className="tabular"
                    value={form.min_stock}
                    onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="active"
                  checked={form.active}
                  onCheckedChange={(v) => setForm({ ...form, active: v })}
                />
                <Label htmlFor="active">{t("Produto ativo para venda")}</Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("Cancelar")}
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {t("Salvar")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
