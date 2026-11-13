import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouterState,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useServerFn } from "@tanstack/react-start";
import {
  ScanBarcode,
  Boxes,
  ReceiptText,
  PackageCheck,
  Users,
  Lock,
  LogOut,
  ShieldCheck,
  Sun,
  Moon,
  Store,
  ArrowLeftRight,
  Settings2,
  Contact,
} from "lucide-react";

import { getAccess, unlock, lock, selectStore, type Access } from "../lib/gate.functions";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import logoAsset from "@/assets/logo-ibmemorial.png.asset.json";
import { LanguageProvider, useI18n, useT, type Lang } from "@/i18n";
import { ThemeProvider, themeInitScript, useTheme } from "@/hooks/use-theme";
import { RouteError } from "@/components/route-error";
import { restartApp } from "@/lib/restart-app";
import { StoreFonts, StoreLogo, StoreThemeStyle, storeFontStack } from "@/lib/store-theme";
import { useRetro } from "@/lib/retro";
import {
  RetroAccessDenied,
  RetroNotFound,
  RetroShell,
  type RetroMenuItem,
} from "@/components/retro-shell";

// The logo file is white on transparent; it's used as a mask so it can be painted
// in the church color (#64a99c) and stay visible in both light and dark mode.
const logoMask = {
  maskImage: `url(${logoAsset.url})`,
  WebkitMaskImage: `url(${logoAsset.url})`,
  maskSize: "contain",
  WebkitMaskSize: "contain",
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
  maskPosition: "center",
  WebkitMaskPosition: "center",
  backgroundColor: "#64a99c",
} as const;

function Logo({ className }: { className?: string }) {
  return <div role="img" aria-label="PDV - IBMemorial" className={className} style={logoMask} />;
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const t = useT();
  const label = theme === "dark" ? t("Modo claro") : t("Modo escuro");
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="flex items-center justify-center rounded-md border border-input p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      className="flex items-center gap-1 rounded-md border border-input p-0.5"
      role="group"
      aria-label={t("Idioma")}
    >
      {(["pt", "en"] as Lang[]).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          className={`rounded px-2 py-1 text-xs font-semibold uppercase transition-colors ${
            lang === code
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {code === "pt" ? "PT" : "EN"}
        </button>
      ))}
    </div>
  );
}

function NotFoundComponent() {
  // A store with the retro look shows it inside its window.
  if (useRetro()) return <RetroNotFound />;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ir para o PDV
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "PDV - IBMemorial" },
      {
        name: "description",
        content:
          "PDV - IBMemorial: ponto de venda com leitor de código de barras, controle de inventário e histórico de vendas.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "PDV - IBMemorial" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap",
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
  }),

  loader: () => getAccess(),
  // Access only changes on login, logout, store switch or admin edits, which all
  // call router.invalidate(); it isn't reloaded on every navigation.
  staleTime: Infinity,
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: RouteError,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const navItems = [
  {
    to: "/",
    label: "PDV",
    icon: ScanBarcode,
    sprite: "cart",
    manageOnly: false,
    balanceOnly: false,
    shippingOnly: false,
  },
  {
    to: "/expedicao",
    label: "Expedição",
    icon: PackageCheck,
    sprite: "box",
    manageOnly: false,
    balanceOnly: false,
    shippingOnly: true,
  },
  {
    to: "/historico",
    label: "Histórico",
    icon: ReceiptText,
    sprite: "chart",
    manageOnly: true,
    balanceOnly: false,
    shippingOnly: false,
  },
  {
    to: "/inventario",
    label: "Inventário",
    icon: Boxes,
    sprite: "shelf",
    manageOnly: true,
    balanceOnly: false,
    shippingOnly: false,
  },
  {
    to: "/clientes",
    label: "Clientes",
    icon: Contact,
    sprite: "coin",
    manageOnly: true,
    balanceOnly: true,
    shippingOnly: false,
  },
  {
    to: "/operadores",
    label: "Operadores",
    icon: Users,
    sprite: "kid",
    manageOnly: true,
    balanceOnly: false,
    shippingOnly: false,
  },
] as const;

const ADMIN_PATH = "/lojas";

function UnlockScreen() {
  const router = useRouter();
  const t = useT();
  const unlockFn = useServerFn(unlock);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await unlockFn({ data: { username, password } });
      if (!res.ok) {
        setError(t("Usuário ou senha incorretos."));
        setPassword("");
        return;
      }
      await router.invalidate();
    } catch {
      setError(t("Não foi possível conectar. Tente novamente."));
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-4">
      <Logo className="aspect-[2/1] w-full max-w-[23.8rem]" />
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg"
      >
        <div className="flex items-center gap-3 text-primary">
          <Lock className="size-5" />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>

        <h1 className="mt-4 text-lg font-semibold text-foreground">{t("Acesso restrito")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("Entre com seu usuário e senha.")}</p>
        <input
          type="text"
          autoFocus
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={t("Usuário")}
          aria-label={t("Usuário")}
          className={inputClass}
        />
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("Senha")}
          aria-label={t("Senha")}
          className={inputClass}
        />
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        <button
          type="submit"
          disabled={loading || password.length === 0}
          className="mt-4 w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? t("Verificando...") : t("Entrar")}
        </button>
      </form>
    </div>
  );
}

function SignOutButton({ onSignOut, disabled }: { onSignOut: () => void; disabled: boolean }) {
  const t = useT();
  return (
    <button
      onClick={onSignOut}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <LogOut className="size-3.5" />
      <span className="hidden sm:inline">{t("Sair")}</span>
    </button>
  );
}

function StorePicker({ access, onSignOut }: { access: Access; onSignOut: () => void }) {
  const t = useT();
  const router = useRouter();
  const { queryClient } = Route.useRouteContext();
  const selectFn = useServerFn(selectStore);
  const [entering, setEntering] = useState<string | null>(null);
  const [error, setError] = useState("");
  const isAdmin = access.role === "admin";

  async function enter(storeId: string) {
    setEntering(storeId);
    setError("");
    try {
      // Cached data belongs to the previous store.
      await queryClient.cancelQueries();
      queryClient.clear();
      await selectFn({ data: { storeId } });
      await router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEntering(null);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <StoreFonts fonts={access.stores.map((s) => s.font)} />
      <div className="mx-auto flex max-w-5xl items-center gap-2">
        <Logo className="h-10 w-20 md:h-14 md:w-28" />
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <LanguageSwitcher />
          <SignOutButton onSignOut={onSignOut} disabled={false} />
        </div>
      </div>

      <main className="mx-auto mt-8 max-w-5xl">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Store className="size-6 text-primary" /> {t("Escolha a loja")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Olá, {name}. Em qual loja você vai trabalhar agora?", { name: access.userName })}
        </p>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {access.stores.map((store) => (
            <button
              key={store.id}
              type="button"
              disabled={entering !== null}
              onClick={() => enter(store.id)}
              style={{ borderColor: store.color, fontFamily: storeFontStack(store.font) }}
              className="relative flex flex-col items-center gap-4 overflow-hidden rounded-2xl border-2 bg-card p-6 pt-8 text-center shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
            >
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-2"
                style={{ backgroundColor: store.color }}
              />
              <StoreLogo store={store} className="h-20 w-40" />
              <span className="text-xl font-bold" style={{ color: store.color }}>
                {store.name}
              </span>
              {!store.active ? (
                <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                  {t("Inativa")}
                </span>
              ) : null}
              {entering === store.id ? (
                <span className="text-xs text-muted-foreground">{t("Entrando...")}</span>
              ) : null}
            </button>
          ))}

          {isAdmin ? (
            <Link
              to={ADMIN_PATH}
              className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border p-6 text-center text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <Settings2 className="size-8" />
              <span className="font-semibold">{t("Gerenciar lojas e usuários")}</span>
            </Link>
          ) : null}
        </div>

        {access.stores.length === 0 && !isAdmin ? (
          <p className="mt-6 rounded-xl border border-border bg-card px-4 py-12 text-center text-muted-foreground">
            {t("Você ainda não tem acesso a nenhuma loja. Peça ao administrador para liberar.")}
          </p>
        ) : null}
      </main>
    </div>
  );
}

function AccessDenied() {
  const t = useT();
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h2 className="text-lg font-semibold text-foreground">{t("Acesso restrito")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("Esta área é exclusiva do gerente da loja ou do administrador.")}
      </p>
    </div>
  );
}

function RootComponent() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <RootShellContent />
      </LanguageProvider>
    </ThemeProvider>
  );
}

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  );
}

function RootShellContent() {
  const { queryClient } = Route.useRouteContext();
  const access = Route.useLoaderData() as Access | null;
  const router = useRouter();
  // The page on screen, not the one being navigated to: useLocation() switches to the
  // new path as soon as a navigation starts, while <Outlet /> still shows the old route.
  // From the store picker to /lojas that rendered the PDV without a store for a moment,
  // its product query failed with "Sessão expirada" and the app restarted to the picker.
  const pathname = useRouterState({
    select: (s) => (s.resolvedLocation ?? s.location).pathname,
  });
  const t = useT();
  const lockFn = useServerFn(lock);
  const selectFn = useServerFn(selectStore);
  const [signingOut, setSigningOut] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Unmount the store pages before changing the server session so their active
  // queries can't refetch in between (with an expired session or the wrong store).
  async function resetSession(setBusy: (v: boolean) => void, action: () => Promise<unknown>) {
    flushSync(() => setBusy(true));
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await action();
      await router.invalidate();
    } catch (error) {
      console.error(error);
    } finally {
      setBusy(false);
    }
  }
  const signOut = () => resetSession(setSigningOut, () => lockFn());
  // Keep pages unmounted until access is refreshed; a full reload would abort
  // pending server calls and turn a successful switch into a Failed to fetch.
  async function leaveStore() {
    flushSync(() => setLeaving(true));
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await selectFn({ data: { storeId: null } });
      await router.invalidate();
      await router.navigate({ to: "/" });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Sessão expirada")) {
        restartApp();
        return;
      }
      // A failed connection must not strand the app on the switching spinner.
    } finally {
      setLeaving(false);
    }
  }

  if (!access || signingOut) return <UnlockScreen />;
  if (leaving) return <Spinner />;

  const isAdmin = access.role === "admin";
  const store = access.store;
  const currentPath = pathname;
  const onAdminPage = currentPath.startsWith(ADMIN_PATH);

  if (!store && !(isAdmin && onAdminPage)) {
    return (
      <QueryClientProvider client={queryClient}>
        <StorePicker access={access} onSignOut={signOut} />
        <Toaster position="top-center" richColors />
      </QueryClientProvider>
    );
  }

  const canManage = !!store && store.storeRole !== "operacao";
  const visibleNav = store
    ? navItems.filter(
        (item) =>
          (canManage || !item.manageOnly) &&
          (store.customer_balance || !item.balanceOnly) &&
          (!store.skip_shipping || !item.shippingOnly),
      )
    : [];
  // A user with a single store was sent straight into it; there's nothing to switch to.
  const canSwitch = isAdmin || access.stores.length > 1;
  const blocked = onAdminPage
    ? !isAdmin
    : !canManage && navItems.some((item) => item.manageOnly && currentPath.startsWith(item.to));

  const roleLabel = isAdmin
    ? t("Admin")
    : store?.storeRole === "gerente"
      ? t("Gerente")
      : t("Operação");

  if (store?.retro_look) {
    const tabs = [
      ...visibleNav.map((item) => ({ to: item.to, label: t(item.label), sprite: item.sprite })),
      ...(isAdmin ? [{ to: ADMIN_PATH, label: t("Lojas"), sprite: "shop" }] : []),
    ];
    const items: RetroMenuItem[] = [
      ...tabs.map((tab) => ({ kind: "link" as const, ...tab })),
      { kind: "sep" },
      ...(canSwitch
        ? [
            {
              kind: "action" as const,
              label: t("Trocar loja"),
              sprite: "disk",
              onClick: leaveStore,
            },
          ]
        : []),
      { kind: "action", label: t("Sair"), sprite: "key", onClick: signOut },
    ];
    return (
      <QueryClientProvider client={queryClient}>
        <RetroShell
          store={store}
          userName={access.userName}
          roleLabel={roleLabel}
          pathname={pathname}
          tabs={tabs}
          items={items}
          toaster={<Toaster position="top-center" />}
        >
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          {blocked ? <RetroAccessDenied /> : <Outlet />}
        </RetroShell>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      {store ? <StoreThemeStyle store={store} /> : null}
      {/* overflow-x-clip keeps the page from sliding sideways on phones; unlike
          overflow-hidden it doesn't break the sticky header. */}
      <div className="min-h-screen overflow-x-clip bg-background">
        <header className="sticky top-0 z-30 border-t-4 border-b border-t-primary border-b-border bg-card/80 backdrop-blur">
          {/* On phones the menu drops to its own row and scrolls sideways by itself. */}
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 md:h-20 md:flex-nowrap md:py-0">
            <Link to={store ? "/" : ADMIN_PATH} className="flex min-w-0 items-center gap-3">
              {store ? (
                <StoreLogo store={store} className="h-10 w-20 shrink-0 md:h-14 md:w-28" />
              ) : (
                <Logo className="h-10 w-20 shrink-0 md:h-14 md:w-28" />
              )}
              <span className="max-w-40 truncate text-sm font-bold text-primary md:text-base">
                {store ? store.name : t("Administração")}
              </span>
            </Link>

            <nav className="order-last -mx-4 flex w-[calc(100%+2rem)] items-center gap-1 overflow-x-auto px-4 pb-1 md:order-none md:mx-0 md:w-auto md:overflow-visible md:px-0 md:pb-0">
              {visibleNav.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  activeOptions={{ exact: to === "/" }}
                  className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  activeProps={{ className: "bg-secondary !text-foreground font-semibold" }}
                >
                  <Icon className="size-4" />
                  {t(label)}
                </Link>
              ))}
              {isAdmin ? (
                <Link
                  to={ADMIN_PATH}
                  className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  activeProps={{ className: "bg-secondary !text-foreground font-semibold" }}
                >
                  <Settings2 className="size-4" />
                  {t("Lojas")}
                </Link>
              ) : null}
            </nav>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <ThemeToggle />
              <LanguageSwitcher />
              <span
                className="hidden items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground xl:flex"
                title={access.userName}
              >
                <ShieldCheck className="size-3.5" />
                {roleLabel}
              </span>

              {canSwitch ? (
                <button
                  onClick={leaveStore}
                  title={store ? t("Trocar loja") : t("Escolher loja")}
                  className="flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <ArrowLeftRight className="size-3.5" />
                  <span className="hidden sm:inline">
                    {store ? t("Trocar loja") : t("Escolher loja")}
                  </span>
                </button>
              ) : null}

              <SignOutButton onSignOut={signOut} disabled={signingOut} />
            </div>
          </div>
        </header>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        {blocked ? <AccessDenied /> : <Outlet />}
      </div>
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
