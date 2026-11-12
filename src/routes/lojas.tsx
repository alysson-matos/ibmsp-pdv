import { createFileRoute, useRouter } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Store, UserPlus, Pencil, Trash2, Plus, ImagePlus, X, KeyRound } from "lucide-react";

import {
  adminListStores,
  adminListUsers,
  deleteStore,
  deleteUser,
  saveStore,
  saveUser,
  setStoreAccess,
  type AdminStore,
  type AdminUser,
  type MemberRole,
} from "@/lib/stores.functions";
import {
  DEFAULT_STORE_COLOR,
  STORE_FONTS,
  STORE_FONT_KEYS,
  StoreFonts,
  StoreLogo,
  resizeLogo,
  storeFontStack,
  textOn,
} from "@/lib/store-theme";
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

const storesQuery = queryOptions({
  queryKey: ["admin-stores"],
  queryFn: () => adminListStores(),
});

const usersQuery = queryOptions({
  queryKey: ["admin-users"],
  queryFn: () => adminListUsers(),
});

export const Route = createFileRoute("/lojas")({
  head: () => ({
    meta: [
      { title: "Lojas e usuários — PDV - IBMemorial" },
      {
        name: "description",
        content: "Cadastre as lojas, o visual de cada uma e quem pode acessar cada loja.",
      },
    ],
  }),
  errorComponent: RouteError,
  loader: ({ context }) =>
    Promise.all([
      prefetchQuiet(context.queryClient, storesQuery.queryKey, () => adminListStores()),
      prefetchQuiet(context.queryClient, usersQuery.queryKey, () => adminListUsers()),
    ]),
  component: LojasPage,
});

const PRESET_COLORS = [
  "#64a99c",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0f172a",
];

function LojasPage() {
  const t = useT();
  const { data: stores } = useSuspenseQuery(storesQuery);
  const { data: users } = useSuspenseQuery(usersQuery);
  const [editingStore, setEditingStore] = useState<StoreForm | null>(null);
  const [editingUser, setEditingUser] = useState<UserForm | null>(null);

  return (
    <main className="mx-auto max-w-6xl p-4">
      <StoreFonts fonts={stores.map((s) => s.font)} />

      <section>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Store className="size-6 text-primary" /> {t("Lojas")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Cada loja tem seus próprios produtos, operadores, vendas e visual.")}
            </p>
          </div>
          <Button
            className="ml-auto"
            onClick={() => setEditingStore({ ...EMPTY_STORE, sort_order: stores.length })}
          >
            <Plus className="size-4" /> {t("Nova loja")}
          </Button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => (
            <div
              key={store.id}
              className={cn(
                "relative flex items-center gap-4 overflow-hidden rounded-xl border-2 bg-card p-4 pt-5",
                !store.active && "opacity-60",
              )}
              style={{ borderColor: store.color }}
            >
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-1.5"
                style={{ backgroundColor: store.color }}
              />
              <StoreLogo store={store} className="h-14 w-20 shrink-0" />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-lg font-bold"
                  style={{ color: store.color, fontFamily: storeFontStack(store.font) }}
                >
                  {store.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(STORE_FONTS[store.font as keyof typeof STORE_FONTS]?.label ?? "Moderna")}
                  {" · "}
                  {store.active ? t("Ativa") : t("Inativa")}
                  {store.customer_balance ? ` · ${t("Venda com saldo")}` : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={t("Editar {name}", { name: store.name })}
                onClick={() => setEditingStore({ ...store })}
              >
                <Pencil className="size-4" />
              </Button>
            </div>
          ))}
          {stores.length === 0 && (
            <p className="col-span-full rounded-xl border border-border bg-card px-4 py-12 text-center text-muted-foreground">
              {t("Nenhuma loja cadastrada ainda.")}
            </p>
          )}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-bold">
              <KeyRound className="size-6 text-primary" /> {t("Usuários e acessos")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Operação: vende e faz a expedição. Gerente: também vê histórico, inventário e operadores da loja.",
              )}
            </p>
          </div>
          <Button className="ml-auto" onClick={() => setEditingUser({ ...EMPTY_USER })}>
            <UserPlus className="size-4" /> {t("Novo usuário")}
          </Button>
        </div>

        <AccessMatrix stores={stores} users={users} onEdit={(u) => setEditingUser(toUserForm(u))} />
      </section>

      <StoreDialog form={editingStore} onClose={() => setEditingStore(null)} />
      <UserDialog form={editingUser} onClose={() => setEditingUser(null)} />
    </main>
  );
}

/* ---------------------------------- Access ---------------------------------- */

function AccessMatrix({
  stores,
  users,
  onEdit,
}: {
  stores: AdminStore[];
  users: AdminUser[];
  onEdit: (u: AdminUser) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const accessFn = useServerFn(setStoreAccess);

  const access = useMutation({
    mutationFn: (vars: { user_id: string; store_id: string; role: MemberRole | null }) =>
      accessFn({ data: vars }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: usersQuery.queryKey });
      const previous = queryClient.getQueryData<AdminUser[]>(usersQuery.queryKey);
      queryClient.setQueryData<AdminUser[]>(usersQuery.queryKey, (list) =>
        list?.map((u) => {
          if (u.id !== vars.user_id) return u;
          const next = { ...u.access };
          if (vars.role) next[vars.store_id] = vars.role;
          else delete next[vars.store_id];
          return { ...u, access: next };
        }),
      );
      return { previous };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(usersQuery.queryKey, ctx.previous);
      toast.error(e.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: usersQuery.queryKey }),
  });

  if (users.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-border bg-card px-4 py-12 text-center text-muted-foreground">
        {t(
          "Nenhum usuário cadastrado ainda. Crie um usuário e marque as lojas que ele pode acessar.",
        )}
      </p>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-widest text-muted-foreground">
            <th className="sticky left-0 bg-card px-4 py-3 font-medium">{t("Usuário")}</th>
            {stores.map((s) => (
              <th key={s.id} className="px-3 py-3 font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </span>
              </th>
            ))}
            <th className="px-3 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {users.map((u) => (
            <tr key={u.id} className={cn(!u.active && "opacity-60")}>
              <td className="sticky left-0 bg-card px-4 py-2">
                <p className="font-medium">{u.display_name}</p>
                <p className="text-xs text-muted-foreground">
                  {u.username}
                  {!u.active ? ` · ${t("Inativo")}` : ""}
                </p>
              </td>
              {stores.map((s) => (
                <td key={s.id} className="px-3 py-2">
                  <select
                    aria-label={t("Acesso de {user} em {store}", {
                      user: u.display_name,
                      store: s.name,
                    })}
                    value={u.access[s.id] ?? ""}
                    onChange={(e) =>
                      access.mutate({
                        user_id: u.id,
                        store_id: s.id,
                        role: (e.target.value || null) as MemberRole | null,
                      })
                    }
                    className={cn(
                      "h-9 rounded-md border border-border bg-background px-2 text-sm",
                      !u.access[s.id] && "text-muted-foreground",
                    )}
                  >
                    <option value="">{t("Sem acesso")}</option>
                    <option value="operacao">{t("Operação")}</option>
                    <option value="gerente">{t("Gerente")}</option>
                  </select>
                </td>
              ))}
              <td className="px-3 py-2 text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-foreground"
                  aria-label={t("Editar {name}", { name: u.display_name })}
                  onClick={() => onEdit(u)}
                >
                  <Pencil className="size-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------- Stores ---------------------------------- */

type StoreForm = Omit<AdminStore, "id"> & { id?: string };

const EMPTY_STORE: StoreForm = {
  name: "",
  color: DEFAULT_STORE_COLOR,
  font: "space-grotesk",
  logo: null,
  active: true,
  customer_balance: false,
  sort_order: 0,
};

function StoreDialog({ form: initial, onClose }: { form: StoreForm | null; onClose: () => void }) {
  return (
    <Dialog open={!!initial} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {initial ? (
          <StoreFormBody key={initial.id ?? "new"} initial={initial} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function StoreFormBody({ initial, onClose }: { initial: StoreForm; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveStore);
  const deleteFn = useServerFn(deleteStore);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<StoreForm>(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const done = (message: string) => {
    queryClient.invalidateQueries({ queryKey: storesQuery.queryKey });
    // The header, picker and theme come from the root loader.
    void router.invalidate();
    toast.success(message);
    onClose();
  };

  const save = useMutation({
    mutationFn: () => saveFn({ data: { ...form, name: form.name.trim() } }),
    onSuccess: () => done(t("Loja salva")),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { id: form.id! } }),
    onSuccess: () => done(t("Loja excluída")),
    onError: (e: Error) => {
      setConfirmDelete(false);
      toast.error(e.message);
    },
  });

  async function onLogo(file: File | undefined) {
    if (!file) return;
    try {
      setForm((f) => ({ ...f, logo: null }));
      const logo = await resizeLogo(file);
      setForm((f) => ({ ...f, logo }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  const previewName = form.name.trim() || t("Nome da loja");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.name.trim()) {
          toast.error(t("Informe o nome da loja"));
          return;
        }
        save.mutate();
      }}
    >
      <DialogHeader>
        <DialogTitle>{form.id ? t("Editar loja") : t("Nova loja")}</DialogTitle>
        <DialogDescription>
          {t("O visual escolhido aparece para todos que entrarem nesta loja.")}
        </DialogDescription>
      </DialogHeader>

      {/* Live preview */}
      <div
        className="mt-4 overflow-hidden rounded-xl border-2 bg-background"
        style={{ borderColor: form.color, fontFamily: storeFontStack(form.font) }}
      >
        <div className="h-1.5" style={{ backgroundColor: form.color }} />
        <div className="flex items-center gap-3 p-3">
          <StoreLogo store={{ ...form, name: previewName }} className="h-12 w-20 shrink-0" />
          <span className="truncate text-lg font-bold" style={{ color: form.color }}>
            {previewName}
          </span>
          <span
            className="ml-auto rounded-md px-3 py-1.5 text-sm font-semibold"
            style={{ backgroundColor: form.color, color: textOn(form.color) }}
          >
            {t("Finalizar venda")}
          </span>
        </div>
      </div>

      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="store-name">{t("Nome")}</Label>
          <Input
            id="store-name"
            required
            maxLength={60}
            placeholder={t("Ex.: Jovens, G.P.S., Z")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div className="grid gap-2">
          <Label>{t("Cor principal")}</Label>
          <div className="flex flex-wrap items-center gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => setForm({ ...form, color: c })}
                className={cn(
                  "size-8 rounded-full border-2 transition-transform hover:scale-110",
                  form.color.toLowerCase() === c ? "border-foreground" : "border-transparent",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="size-8 cursor-pointer rounded-md border border-border bg-transparent"
              />
              {t("Outra")}
            </label>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="store-font">{t("Estilo de letra")}</Label>
          <StoreFonts fonts={STORE_FONT_KEYS} />
          <div className="flex flex-wrap gap-2" id="store-font">
            {STORE_FONT_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setForm({ ...form, font: key })}
                aria-pressed={form.font === key}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  form.font === key
                    ? "border-primary bg-secondary font-semibold text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
                style={{ fontFamily: storeFontStack(key) }}
              >
                {t(STORE_FONTS[key].label)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <Label>{t("Logo")}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void onLogo(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="size-4" /> {form.logo ? t("Trocar imagem") : t("Enviar imagem")}
            </Button>
            {form.logo ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setForm({ ...form, logo: null })}
              >
                <X className="size-4" /> {t("Usar logo padrão")}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                {t("Sem imagem, usa o logo da igreja na cor da loja.")}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-border p-3">
          <Switch
            id="store-balance"
            checked={form.customer_balance}
            onCheckedChange={(v) => setForm({ ...form, customer_balance: v })}
          />
          <div className="grid gap-1">
            <Label htmlFor="store-balance">{t("Venda com saldo do cliente")}</Label>
            <p className="text-xs text-muted-foreground">
              {t(
                "Permite cadastrar clientes com saldo antecipado e pagar a venda com esse saldo. O saldo nunca fica negativo.",
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="store-active"
            checked={form.active}
            onCheckedChange={(v) => setForm({ ...form, active: v })}
          />
          <Label htmlFor="store-active">{t("Loja ativa (aparece para os usuários)")}</Label>
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

/* ---------------------------------- Users ---------------------------------- */

type UserForm = {
  id?: string;
  username: string;
  display_name: string;
  password: string;
  active: boolean;
};

const EMPTY_USER: UserForm = { username: "", display_name: "", password: "", active: true };

const toUserForm = (u: AdminUser): UserForm => ({
  id: u.id,
  username: u.username,
  display_name: u.display_name,
  password: "",
  active: u.active,
});

function UserDialog({ form: initial, onClose }: { form: UserForm | null; onClose: () => void }) {
  return (
    <Dialog open={!!initial} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {initial ? (
          <UserFormBody key={initial.id ?? "new"} initial={initial} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function UserFormBody({ initial, onClose }: { initial: UserForm; onClose: () => void }) {
  const t = useT();
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveUser);
  const deleteFn = useServerFn(deleteUser);
  const [form, setForm] = useState<UserForm>(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const done = (message: string) => {
    queryClient.invalidateQueries({ queryKey: usersQuery.queryKey });
    toast.success(message);
    onClose();
  };

  const save = useMutation({
    mutationFn: () => saveFn({ data: form }),
    onSuccess: () => done(t("Usuário salvo")),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { id: form.id! } }),
    onSuccess: () => done(t("Usuário excluído")),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <DialogHeader>
        <DialogTitle>{form.id ? t("Editar usuário") : t("Novo usuário")}</DialogTitle>
        <DialogDescription>
          {t("Depois de salvar, escolha na tabela as lojas que este usuário pode acessar.")}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="user-name">{t("Nome")}</Label>
          <Input
            id="user-name"
            required
            maxLength={60}
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="user-login">{t("Usuário (para entrar)")}</Label>
          <Input
            id="user-login"
            required
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="off"
            placeholder="ex.: maria.silva"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="user-password">{form.id ? t("Nova senha") : t("Senha")}</Label>
          <Input
            id="user-password"
            type="password"
            autoComplete="new-password"
            required={!form.id}
            minLength={4}
            placeholder={form.id ? t("Deixe em branco para manter a atual") : ""}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-3">
          <Switch
            id="user-active"
            checked={form.active}
            onCheckedChange={(v) => setForm({ ...form, active: v })}
          />
          <Label htmlFor="user-active">{t("Usuário ativo (pode entrar)")}</Label>
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
