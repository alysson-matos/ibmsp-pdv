import { Link, useRouter } from "@tanstack/react-router";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Collage, Desk, EASE_OUT, Sprite, Win, useClock } from "@/components/retro";
import { useTheme } from "@/hooks/use-theme";
import { useI18n, useLocale, useT, type Lang } from "@/i18n";
import type { StoreTheme } from "@/lib/gate.functions";
import { RetroContext } from "@/lib/retro";
import { StoreLogo } from "@/lib/store-theme";
import { cn } from "@/lib/utils";

/*
 * Frame of a store with "Visual retrô" on: pixel sky, Windows 95 window with tabs and a
 * taskbar with the Start menu. Stores without it use the default header in __root.tsx.
 */

const CHURCH = "Igreja Batista Memorial de São Paulo";

const RETRO_FONTS =
  "https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,500;0,600;0,700;0,800;1,800&family=Pixelify+Sans:wght@400;600;700&family=VT323&display=swap";

export type RetroTab = { to: string; label: string; sprite: string };
export type RetroMenuItem =
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

/**
 * Puts .retro on <html> while the retro shell is on screen, so dialogs and other
 * portals (rendered in <body>) get the look too, and keeps dark mode off meanwhile.
 */
function useRetroDocument() {
  const { theme } = useTheme();
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add("retro");
    root.classList.remove("dark");
    return () => {
      root.classList.remove("retro");
      root.classList.toggle("dark", theme === "dark");
    };
  }, [theme]);
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
  side,
  items,
}: {
  title: string;
  status: string;
  side: string;
  items: RetroMenuItem[];
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
          <span className="led" />
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

function Tabs({ tabs, pathname }: { tabs: RetroTab[]; pathname: string }) {
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

export function RetroAccessDenied() {
  const t = useT();
  return (
    <div className="empty">
      <Sprite name="key" size={44} />
      <b>{t("Acesso restrito")}</b>
      <span>{t("Esta área é exclusiva do gerente da loja ou do administrador.")}</span>
    </div>
  );
}

/** 404 inside the retro window (the root <Outlet />). */
export function RetroNotFound() {
  return (
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

/** The store color, used on the masthead tile and the store cards. */
function RetroStoreStyle({ color }: { color: string }) {
  const c = /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
  return c ? <style>{`:root.retro,.retro{--store:${c}}`}</style> : null;
}

export function RetroShell({
  store,
  userName,
  roleLabel,
  pathname,
  tabs,
  items,
  children,
  toaster,
}: {
  store: StoreTheme;
  userName: string;
  roleLabel: string;
  pathname: string;
  tabs: RetroTab[];
  items: RetroMenuItem[];
  /** The page (or the access-denied notice). */
  children: ReactNode;
  toaster: ReactNode;
}) {
  const router = useRouter();
  const booting = useBooting();
  useRetroDocument();

  // F1–F4 switch tabs, like the function keys of a register.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  useEffect(() => {
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
  }, [router]);

  const placeName = store.name;
  const current =
    tabs.find((tab) => (tab.to === "/" ? pathname === "/" : pathname.startsWith(tab.to)))?.label ??
    placeName;

  return (
    <RetroContext.Provider value={true}>
      <MotionConfig reducedMotion="user">
        <link rel="stylesheet" href={RETRO_FONTS} precedence="default" />
        <RetroStoreStyle color={store.color} />
        {/* display: contents, so it only scopes the .retro styles and tokens. */}
        <div className="retro contents">
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
                <Link to="/" className="flex min-w-0 flex-wrap items-center gap-4">
                  {store.logo ? <StoreLogo store={store} className="h-14 w-28 shrink-0" /> : null}
                  <Collage text={placeName.slice(0, 18)} />
                </Link>
                <div className="mast-meta">
                  <div className="mast-sub">PDV · {CHURCH}</div>
                  <span className="chip" title={userName}>
                    <i />
                    {roleLabel} · {userName}
                  </span>
                </div>
              </header>
              <Tabs tabs={tabs} pathname={pathname} />
              <div className="view">{children}</div>
            </Win>
          </Desk>
          <Taskbar
            title={`${placeName} — ${current}`}
            status={`${roleLabel} · ${userName}`}
            side={placeName}
            items={items}
          />
          {toaster}
          <canvas id="fx" className="fx" aria-hidden="true" />
        </div>
      </MotionConfig>
    </RetroContext.Provider>
  );
}
