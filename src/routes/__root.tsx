import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
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
} from "lucide-react";

import { getRole, unlock, lock, type GateRole } from "../lib/gate.functions";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import logoAsset from "@/assets/logo-ibmemorial.png.asset.json";
import { LanguageProvider, useI18n, useT, type Lang } from "@/i18n";

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

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Esta página não carregou
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Ir para o PDV
          </a>
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

  loader: () => getRole(),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
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
  { to: "/", label: "PDV", icon: ScanBarcode, adminOnly: false },
  { to: "/expedicao", label: "Expedição", icon: PackageCheck, adminOnly: false },
  { to: "/historico", label: "Histórico", icon: ReceiptText, adminOnly: true },
  { to: "/inventario", label: "Inventário", icon: Boxes, adminOnly: true },
  { to: "/operadores", label: "Operadores", icon: Users, adminOnly: true },
] as const;

function UnlockScreen() {
  const router = useRouter();
  const t = useT();
  const unlockFn = useServerFn(unlock);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await unlockFn({ data: { password } });
      if (!res.ok) {
        setError(t("Senha incorreta."));
        setPassword("");
        return;
      }
      await router.invalidate();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-4">
      <img
        src={logoAsset.url}
        alt="PDV - IBMemorial"
        className="w-full max-w-[23.8rem] object-contain"
      />
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg"
      >
        <div className="flex items-center gap-3 text-primary">
          <Lock className="size-5" />
          <div className="ml-auto">
            <LanguageSwitcher />
          </div>
        </div>

        <h1 className="mt-4 text-lg font-semibold text-foreground">{t("Acesso restrito")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Digite a senha para entrar no sistema.")}
        </p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("Senha")}
          className="mt-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
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

function AccessDenied() {
  const t = useT();
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h2 className="text-lg font-semibold text-foreground">{t("Acesso restrito")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("Esta área é exclusiva do administrador. Saia e entre com a senha de admin.")}
      </p>
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const role = Route.useLoaderData() as GateRole | null;
  const router = useRouter();
  const lockFn = useServerFn(lock);
  const [signingOut, setSigningOut] = useState(false);

  if (!role || signingOut) return <UnlockScreen />;

  const isAdmin = role === "admin";
  const visibleNav = navItems.filter((item) => isAdmin || !item.adminOnly);
  const currentPath = router.state.location.pathname;
  const blocked =
    !isAdmin && navItems.some((item) => item.adminOnly && currentPath.startsWith(item.to));

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
          <div className="mx-auto flex h-20 max-w-[1600px] items-center gap-6 px-4">
            <Link to="/" className="flex items-center gap-2">
              <img src={logoAsset.url} alt="PDV - IBMemorial" className="h-14 w-auto object-contain" />
              <span className="sr-only">PDV - IBMemorial</span>
            </Link>

            <nav className="flex items-center gap-1">
              {visibleNav.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  activeOptions={{ exact: to === "/" }}
                  className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  activeProps={{ className: "bg-secondary !text-foreground font-semibold" }}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground">
                <ShieldCheck className="size-3.5" />
                {isAdmin ? "Admin" : "Operação"}
              </span>
              <button
                onClick={async () => {
                  // Unmount protected routes before clearing the server session so
                  // their active queries cannot refetch with an expired session.
                  flushSync(() => setSigningOut(true));
                  try {
                    await queryClient.cancelQueries();
                    queryClient.clear();
                    await lockFn();
                    await router.invalidate();
                  } catch (error) {
                    console.error(error);
                    setSigningOut(false);
                  }
                }}
                disabled={signingOut}
                className="flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <LogOut className="size-3.5" />
                Sair
              </button>
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
