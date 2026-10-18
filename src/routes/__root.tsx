import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
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
} from "lucide-react";

import { getRole, unlock, lock, type GateRole } from "../lib/gate.functions";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import logoAsset from "@/assets/logo-ibmemorial.png.asset.json";
import { LanguageProvider, useI18n, useT, type Lang } from "@/i18n";
import { ThemeProvider, themeInitScript, useTheme } from "@/hooks/use-theme";
import { RouteError } from "@/components/route-error";

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

  loader: () => getRole(),
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
  return (
    <ThemeProvider>
      <LanguageProvider>
        <RootShellContent />
      </LanguageProvider>
    </ThemeProvider>
  );
}

function RootShellContent() {
  const { queryClient } = Route.useRouteContext();
  const role = Route.useLoaderData() as GateRole | null;
  const router = useRouter();
  const t = useT();
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
      {/* overflow-x-clip keeps the page from sliding sideways on phones; unlike
          overflow-hidden it doesn't break the sticky header. */}
      <div className="min-h-screen overflow-x-clip bg-background">
        <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
          {/* On phones the menu drops to its own row and scrolls sideways by itself. */}
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 md:h-20 md:flex-nowrap md:py-0">
            <Link to="/" className="flex items-center gap-2">
              <Logo className="h-10 w-20 md:h-14 md:w-28" />
              <span className="sr-only">PDV - IBMemorial</span>
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
            </nav>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <ThemeToggle />
              <LanguageSwitcher />
              <span className="hidden items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground sm:flex">
                <ShieldCheck className="size-3.5" />
                {isAdmin ? t("Admin") : t("Operação")}
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
                <span className="hidden sm:inline">{t("Sair")}</span>
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
