import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Boxes, Pencil, Plus, Minus, Trash2, AlertTriangle } from "lucide-react";

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
  errorComponent: ({ error }) => (
    <div role="alert" className="p-8 text-destructive">
      {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-8">Nada por aqui.</div>,
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

const emptyForm: FormState = {
  barcode: "",
  name: "",
  price: "",
  stock: "0",
  min_stock: "5",
  active: true,
};

function InventarioPage() {
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
      toast.success("Produto salvo");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Produto excluído");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const adjustMutation = useMutation({
    mutationFn: (vars: { product_id: string; delta: number }) =>
      adjustFn({ data: { ...vars, reason: vars.delta > 0 ? "entrada" : "saida" } }),
    onSuccess: () => invalidate(),
    onError: (error: Error) => toast.error(error.message),
  });

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode.includes(search.trim()),
  );

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
            <Boxes className="size-6 text-primary" /> Inventário
          </h1>
          <p className="text-sm text-muted-foreground">
            {products.length} produtos cadastrados
            {lowStock > 0 && ` · ${lowStock} com estoque baixo`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou código"
            className="w-64"
          />
          <Button onClick={openNew}>
            <Plus className="size-4" /> Novo produto
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-lg">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3 text-right">Preço</th>
              <th className="px-4 py-3 text-center">Estoque</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((p) => {
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
                        aria-label="Remover uma unidade"
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
                        aria-label="Adicionar uma unidade"
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
                      {p.active ? "Ativo" : "Inativo"}
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
                  Nenhum produto encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{form.id ? "Editar produto" : "Novo produto"}</DialogTitle>
              <DialogDescription>
                O código de barras é usado pelo leitor na tela de venda.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="barcode">Código de barras</Label>
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
                  <Label htmlFor="price">Preço (R$)</Label>
                  <Input
                    id="price"
                    inputMode="decimal"
                    className="tabular"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="stock">Estoque</Label>
                  <Input
                    id="stock"
                    inputMode="numeric"
                    className="tabular"
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="min_stock">Estoque mín.</Label>
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
                <Label htmlFor="active">Produto ativo para venda</Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
