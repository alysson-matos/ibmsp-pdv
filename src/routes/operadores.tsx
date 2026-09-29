import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Users, Trash2, Pencil } from "lucide-react";

import { deleteOperator, listOperators, saveOperator } from "@/lib/pos.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

const operatorsQuery = queryOptions({
  queryKey: ["operators"],
  queryFn: () => listOperators(),
});

export const Route = createFileRoute("/operadores")({
  head: () => ({
    meta: [
      { title: "Operadores do guichê — Guichê PDV" },
      {
        name: "description",
        content:
          "Cadastre e gerencie os operadores que atendem no guichê e podem ser vinculados a cada venda.",
      },
      { property: "og:title", content: "Operadores do guichê — Guichê PDV" },
      {
        property: "og:description",
        content: "Lista de operadores ativos e inativos para identificar quem realizou cada venda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div role="alert" className="p-8 text-destructive">
      {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-8">Nada por aqui.</div>,
  loader: ({ context }) => context.queryClient.prefetchQuery(operatorsQuery),
  component: OperadoresPage,
});

function OperadoresPage() {
  const t = useT();
  const { data: operators } = useSuspenseQuery(operatorsQuery);
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveOperator);
  const deleteFn = useServerFn(deleteOperator);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["operators"] });

  const save = useMutation({
    mutationFn: (vars: { id?: string; name: string; active: boolean }) => saveFn({ data: vars }),
    onSuccess: () => {
      refresh();
      setName("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      refresh();
      toast.success(t("Operador excluído"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const commitEdit = (op: { id: string; name: string; active: boolean }) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      toast.error(t("Informe o nome do operador"));
      return;
    }
    if (trimmed === op.name) {
      setEditingId(null);
      return;
    }
    save.mutate(
      { id: op.id, name: trimmed, active: op.active },
      {
        onSuccess: () => {
          setEditingId(null);
          toast.success(t("Nome atualizado"));
        },
      },
    );
  };


  return (
    <main className="mx-auto max-w-3xl p-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Users className="size-6 text-primary" /> {t("Operadores")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("Cada venda é registrada com o operador que realizou o atendimento.")}
      </p>

      <form
        className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) {
            toast.error(t("Informe o nome do operador"));
            return;
          }
          save.mutate({ name: name.trim(), active: true });
        }}
      >
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="name" className="text-xs uppercase tracking-widest text-muted-foreground">
            {t("Novo operador")}
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("Nome do operador")}
          />
        </div>
        <Button type="submit" disabled={save.isPending}>
          {t("Adicionar")}
        </Button>
      </form>

      <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {operators.map((op) => (
          <li key={op.id} className="flex items-center gap-3 px-4 py-3">
            {editingId === op.id ? (
              <>
                <Input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit(op);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="flex-1"
                  aria-label={t("Editar nome de {name}", { name: op.name })}
                />
                <Button size="sm" disabled={save.isPending} onClick={() => commitEdit(op)}>
                  {t("Salvar")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                  {t("Cancelar")}
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 font-medium">{op.name}</span>
                <span
                  className={cn(
                    "rounded-md px-2 py-1 text-xs",
                    op.active ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {op.active ? t("Ativo") : t("Inativo")}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => save.mutate({ id: op.id, name: op.name, active: !op.active })}
                >
                  {op.active ? t("Desativar") : t("Ativar")}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-foreground"
                  aria-label={t("Editar {name}", { name: op.name })}
                  onClick={() => {
                    setEditingId(op.id);
                    setEditingName(op.name);
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  aria-label={t("Excluir {name}", { name: op.name })}
                  onClick={() => remove.mutate(op.id)}
                >
                  <Trash2 className="size-4" />
                </Button>

              </>
            )}
          </li>
        ))}
        {operators.length === 0 && (
          <li className="px-4 py-12 text-center text-muted-foreground">
            {t("Nenhum operador cadastrado ainda.")}
          </li>
        )}
      </ul>
    </main>
  );
}
