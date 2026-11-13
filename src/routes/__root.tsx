import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useLocation,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useServerFn } from "@tanstack/react-start";

import { getAccess, unlock, lock, selectStore, type Access } from "../lib/gate.functions";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { LanguageProvider, useI18n, useLocale, useT, type Lang } from "@/i18n";
import { RouteError } from "@/components/route-error";
import { Collage, Desk, EASE_OUT, Sprite, Win, useClock } from "@/components/retro";
import { restartApp } from "@/lib/restart-app";
import { StoreLogo, StoreThemeStyle } from "@/lib/store-theme";
import { cn } from "@/lib/utils";

const CHURCH = "Igreja Batista Memorial de São Paulo";

function NotFoundComponent() {
  return (
    // Rendered inside the main window (the root <Outlet />), so no desktop of its own.
    <div className="empty">
      <Sprite name="box" size={48} />
      <b className="num" style={{ fontSize: 46, lineHeight: 1 }}>
        404
      </b>
      <span>A página que você procura não existe ou foi movida.</span>
      <Link to="/" className="btn primary">
        Ir para o PDV
      </Link>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#1C8EEA" },
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
        href: "https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,500;0,600;0,700;0,800;1,800&family=Pixelify+Sans:wght@400;600;700&family=VT323&display=swap",
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
  {
    to: "/",
    label: "PDV",
    sprite: "cart",
    manageOnly: false,
    balanceOnly: false,
    shippingOnly: false,
  },
  {
    to: "/expedicao",
    label: "Expedição",
    sprite: "box",
    manageOnly: false,
    balanceOnly: false,
    shippingOnly: true,
  },
  {
    to: "/historico",
    label: "Histórico",
    sprite: "chart",
    manageOnly: true,
    balanceOnly: false,
    shippingOnly: false,
  },
  {
    to: "/inventario",
    label: "Inventário",
    sprite: "shelf",
    manageOnly: true,
    balanceOnly: false,
    shippingOnly: false,
  },
  {
    to: "/clientes",
    label: "Clientes",
    sprite: "coin",
    manageOnly: true,
    balanceOnly: true,
    shippingOnly: false,
  },
  {
    to: "/operadores",
    label: "Operadores",
    sprite: "kid",
    manageOnly: true,
    balanceOnly: false,
    shippingOnly: false,
  },
] as const;

const ADMIN_PATH = "/lojas";

type TabItem = { to: string; label: string; sprite: string };
type MenuItem =
  | { kind: "link"; to: string; label: string; sprite: string }
  | { kind: "action"; label: string; sprite: string; onClick: () => void }
  | { kind: "sep" };

/** F1–F4 open the first four tabs (F5 and up are left to the browser). */
const FKEYS = ["F1", "F2", "F3", "F4"];

/** Plays the window-opening and letter-pasting animation once, on first load. */
function useBooting() {
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setBooting(false), 1200);
    return () => clearTimeout(timer);
  }, []);
  return booting;
}

function LangButtons() {
  const { lang, setLang, t } = useI18n();
  return (
    <span role="group" aria-label={t("Idioma")}>
      {(["pt", "en"] as Lang[]).map((code) => (
        <button key={code} type="button" onClick={() => setLang(code)} aria-pressed={lang === code}>
          {code.toUpperCase()}
        </button>
      ))}
    </span>
  );
}

/** Taskbar with the Start menu, the title of the open window and the tray. */
function Taskbar({
  title,
  status,
  online = true,
  side,
  items,
}: {
  title: string;
  status: string;
  online?: boolean;
  side: string;
  items: MenuItem[];
}) {
  const t = useT();
  const clock = useClock(useLocale());
  const [menu, setMenu] = useState(false);
  const startRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    const close = (e: MouseEvent) => {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !startRef.current?.contains(e.target as Node)
      )
        setMenu(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setMenu(false);
        startRef.current?.focus();
      }
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", esc, true);
    };
  }, [menu]);

  return (
    <>
      <footer className="taskbar" aria-label={t("Barra de tarefas")}>
        <button
          ref={startRef}
          className="btn start"
          aria-haspopup="true"
          aria-expanded={menu}
          disabled={items.length === 0}
          onClick={() => setMenu((m) => !m)}
        >
          <span className="zlogo" aria-hidden="true">
            M
          </span>
          {t("Iniciar")}
        </button>
        <div className="task-sep" aria-hidden="true" />
        <div className="task-title sunken">{title}</div>
        <div className="tray sunken">
          <span className={cn("led", !online && "off")} />
          <span className="st" role="status" aria-live="polite">
            {status}
          </span>
          <LangButtons />
          <span className="clock num">{clock}</span>
        </div>
      </footer>
      <AnimatePresence>
        {menu && (
          <motion.div
            ref={menuRef}
            className="startmenu bevel"
            initial={{ clipPath: "inset(100% 0 0 0)", opacity: 0 }}
            animate={{ clipPath: "inset(0% 0 0 0)", opacity: 1 }}
            exit={{ clipPath: "inset(100% 0 0 0)", opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
          >
            <div className="side">{side}</div>
            <ul>
              {items.map((item, i) =>
                item.kind === "sep" ? (
                  <li key={i}>
                    <hr />
                  </li>
                ) : item.kind === "link" ? (
                  <li key={i}>
                    <Link to={item.to} onClick={() => setMenu(false)}>
                      <Sprite name={item.sprite} size={22} />
                      {item.label}
                    </Link>
                  </li>
                ) : (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => {
                        setMenu(false);
                        item.onClick();
                      }}
                    >
                      <Sprite name={item.sprite} size={22} />
                      {item.label}
                    </button>
                  </li>
                ),
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function UnlockScreen() {
  const router = useRouter();
  const t = useT();
  const booting = useBooting();
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
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Desk className={cn("center", booting && "booting")}>
        <div style={{ position: "relative", zIndex: 2 }}>
          <Collage text="PDV" tail="M" />
        </div>
        <Win className="narrow" title={`LOGIN.EXE — ${t("Acesso restrito")}`}>
          <form onSubmit={onSubmit} className="grid gap-3 p-4">
            <div className="flex items-center gap-3">
              <Sprite name="key" size={44} />
              <div>
                <b>{t("Acesso restrito")}</b>
                <div className="hint">{t("Entre com seu usuário e senha.")}</div>
              </div>
            </div>
            <label className="field">
              {t("Usuário")}
              <input
                className="input"
                type="text"
                autoFocus
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label className="field">
              {t("Senha")}
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error ? (
              <p role="alert" className="text-xs font-bold text-destructive">
                {error}
              </p>
            ) : null}
            <div className="dlg-actions">
              <button
                type="submit"
                className="btn primary"
                disabled={loading || password.length === 0}
              >
                {loading ? t("Verificando...") : t("Entrar")}
              </button>
            </div>
          </form>
        </Win>
      </Desk>
      <Taskbar
        title={`PDV — ${CHURCH}`}
        status={t("Aguardando login")}
        online={false}
        side="PDV"
        items={[]}
      />
    </>
  );
}

function StorePicker({ access, onSignOut }: { access: Access; onSignOut: () => void }) {
  const t = useT();
  const router = useRouter();
  const booting = useBooting();
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

  const items: MenuItem[] = [
    ...(isAdmin
      ? [
          {
            kind: "link" as const,
            to: ADMIN_PATH,
            label: t("Gerenciar lojas e usuários"),
            sprite: "shop",
          },
          { kind: "sep" as const },
        ]
      : []),
    { kind: "action", label: t("Sair"), sprite: "key", onClick: onSignOut },
  ];

  return (
    <>
      <Desk className={cn(booting && "booting")}>
        <Win title={`LOJAS.EXE — ${t("Escolha a loja")}`} label={t("Escolha a loja")}>
          <header className="mast">
            <Collage text="PDV" tail="M" />
            <div className="mast-meta">
              <div className="mast-sub">{CHURCH}</div>
              <span className="chip">
                <i />
                {access.userName}
              </span>
            </div>
          </header>
          <main className="view">
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <Sprite name="shop" size={30} /> {t("Escolha a loja")}
            </h2>
            <p className="hint mt-1">
              {t("Olá, {name}. Em qual loja você vai trabalhar agora?", { name: access.userName })}
            </p>
            {error ? (
              <p role="alert" className="mt-3 text-sm font-bold text-destructive">
                {error}
              </p>
            ) : null}

            <div className="storecards mt-5">
              {access.stores.map((store, k) => (
                <button
                  key={store.id}
                  type="button"
                  className="storecard"
                  disabled={entering !== null}
                  onClick={() => enter(store.id)}
                  style={{ "--rc": store.color, "--k": k } as CSSProperties}
                >
                  <StoreLogo store={store} className="h-16 w-32" />
                  <b>{store.name}</b>
                  {!store.active ? <span className="pill off">{t("Inativa")}</span> : null}
                  {entering === store.id ? <span className="hint">{t("Entrando...")}</span> : null}
                </button>
              ))}

              {isAdmin ? (
                <Link to={ADMIN_PATH} className="storecard dashed">
                  <Sprite name="shop" size={44} />
                  <span className="font-bold">{t("Gerenciar lojas e usuários")}</span>
                </Link>
              ) : null}
            </div>

            {access.stores.length === 0 && !isAdmin ? (
              <div className="empty panel mt-5">
                <Sprite name="key" size={40} />
                {t("Você ainda não tem acesso a nenhuma loja. Peça ao administrador para liberar.")}
              </div>
            ) : null}
          </main>
        </Win>
      </Desk>
      <Taskbar
        title={`PDV — ${t("Escolha a loja")}`}
        status={access.userName}
        side="PDV"
        items={items}
      />
    </>
  );
}

function AccessDenied() {
  const t = useT();
  return (
    <div className="empty">
      <Sprite name="key" size={44} />
      <b>{t("Acesso restrito")}</b>
      <span>{t("Esta área é exclusiva do gerente da loja ou do administrador.")}</span>
    </div>
  );
}

function RootComponent() {
  return (
    <LanguageProvider>
      <MotionConfig reducedMotion="user">
        <RootShellContent />
        <canvas id="fx" className="fx" aria-hidden="true" />
      </MotionConfig>
    </LanguageProvider>
  );
}

function Spinner() {
  return (
    <Desk className="center">
      <div className="size-8 animate-spin rounded-full border-4 border-white/50 border-t-white" />
    </Desk>
  );
}

function Tabs({ tabs, pathname }: { tabs: TabItem[]; pathname: string }) {
  const t = useT();
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
  return (
    <nav className="tabs" aria-label={t("Seções")}>
      {tabs.map((tab, i) => (
        <Link
          key={tab.to}
          to={tab.to}
          className="tab"
          aria-selected={isActive(tab.to)}
          aria-current={isActive(tab.to) ? "page" : undefined}
        >
          <Sprite name={tab.sprite} size={20} />
          {tab.label} {FKEYS[i] ? <kbd>{FKEYS[i]}</kbd> : null}
        </Link>
      ))}
    </nav>
  );
}

function RootShellContent() {
  const { queryClient } = Route.useRouteContext();
  const access = Route.useLoaderData() as Access | null;
  const router = useRouter();
  const pathname = useLocation({ select: (l) => l.pathname });
  const t = useT();
  const booting = useBooting();
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
  // Full reload instead of invalidating in place: the store pages still mounted
  // would refetch without a store, fail and keep re-invalidating the router.
  async function leaveStore() {
    flushSync(() => setLeaving(true));
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await selectFn({ data: { storeId: null } });
    } catch (error) {
      console.error(error);
    }
    restartApp({ force: true });
  }

  const isAdmin = access?.role === "admin";
  const store = access?.store ?? null;
  const canManage = !!store && store.storeRole !== "operacao";
  const tabs: TabItem[] = [
    ...(store
      ? navItems.filter(
          (item) =>
            (canManage || !item.manageOnly) &&
            (store.customer_balance || !item.balanceOnly) &&
            (!store.skip_shipping || !item.shippingOnly),
        )
      : []
    ).map((item) => ({ to: item.to, label: t(item.label), sprite: item.sprite })),
    ...(isAdmin ? [{ to: ADMIN_PATH, label: t("Lojas"), sprite: "shop" }] : []),
  ];

  // F1–F4 switch tabs, like the function keys of a register.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const shellActive = !!access && !signingOut && !leaving;
  useEffect(() => {
    if (!shellActive) return;
    const onKey = (e: KeyboardEvent) => {
      const tab = tabsRef.current[FKEYS.indexOf(e.key)];
      if (!tab || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      // Not while a dialog is open (an unsaved form would be thrown away), nor on key
      // repeat, nor to the tab already on screen.
      if (e.repeat || document.querySelector('[role="dialog"]')) return;
      if (router.state.location.pathname === tab.to) return;
      void router.navigate({ to: tab.to });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router, shellActive]);

  if (!access || signingOut) return <UnlockScreen />;
  if (leaving) return <Spinner />;

  const onAdminPage = pathname.startsWith(ADMIN_PATH);

  if (!store && !(isAdmin && onAdminPage)) {
    return (
      <QueryClientProvider client={queryClient}>
        <StorePicker access={access} onSignOut={signOut} />
        <Toaster position="top-center" />
      </QueryClientProvider>
    );
  }

  // A user with a single store was sent straight into it; there's nothing to switch to.
  const canSwitch = isAdmin || access.stores.length > 1;
  const blocked = onAdminPage
    ? !isAdmin
    : !canManage && navItems.some((item) => item.manageOnly && pathname.startsWith(item.to));

  const roleLabel = isAdmin
    ? t("Admin")
    : store?.storeRole === "gerente"
      ? t("Gerente")
      : t("Operação");

  const placeName = store ? store.name : t("Administração");
  const current =
    tabs.find((tab) => (tab.to === "/" ? pathname === "/" : pathname.startsWith(tab.to)))?.label ??
    placeName;
  const switchLabel = store ? t("Trocar loja") : t("Escolher loja");

  const items: MenuItem[] = [
    ...tabs.map((tab) => ({ kind: "link" as const, ...tab })),
    { kind: "sep" },
    ...(canSwitch
      ? [{ kind: "action" as const, label: switchLabel, sprite: "disk", onClick: leaveStore }]
      : []),
    { kind: "action", label: t("Sair"), sprite: "key", onClick: signOut },
  ];

  return (
    <QueryClientProvider client={queryClient}>
      {store ? <StoreThemeStyle store={store} /> : null}
      <Desk className={cn(booting && "booting")}>
        <Win
          label={placeName}
          title={`PDV_MEMORIAL.EXE — ${placeName}`}
          menubar={
            <div className="menubar" aria-hidden="true">
              <span>
                <u>A</u>rquivo
              </span>
              <span>
                <u>C</u>aixa
              </span>
              <span>
                <u>E</u>xibir
              </span>
              <span>
                Aj<u>u</u>da
              </span>
            </div>
          }
        >
          <header className="mast">
            <Link
              to={store ? "/" : ADMIN_PATH}
              className="flex min-w-0 flex-wrap items-center gap-4"
            >
              {store?.logo ? <StoreLogo store={store} className="h-14 w-28 shrink-0" /> : null}
              <Collage text={placeName.slice(0, 18)} tail={store ? undefined : "M"} />
            </Link>
            <div className="mast-meta">
              <div className="mast-sub">PDV · {CHURCH}</div>
              <span className="chip" title={access.userName}>
                <i />
                {roleLabel} · {access.userName}
              </span>
            </div>
          </header>
          <Tabs tabs={tabs} pathname={pathname} />
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <div className="view">{blocked ? <AccessDenied /> : <Outlet />}</div>
        </Win>
      </Desk>
      <Taskbar
        title={`${placeName} — ${current}`}
        status={`${roleLabel} · ${access.userName}`}
        side={placeName}
        items={items}
      />
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
