import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { EN } from "./dict";

export type Lang = "pt" | "en";

const STORAGE_KEY = "pdv-lang";

type Ctx = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (pt: string, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<Ctx | null>(null);

function interpolate(text: string, vars?: Record<string, string | number>) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("pt");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "pt" || stored === "en") setLangState(stored);
  }, []);

  const value = useMemo<Ctx>(() => {
    const setLang = (next: Lang) => {
      setLangState(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
    };
    const t = (pt: string, vars?: Record<string, string | number>) =>
      interpolate(lang === "en" ? (EN[pt] ?? pt) : pt, vars);
    return { lang, setLang, t };
  }, [lang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(LanguageContext);
  if (ctx) return ctx;
  return {
    lang: "pt",
    setLang: () => {},
    t: (pt, vars) => interpolate(pt, vars),
  };
}

export function useT() {
  return useI18n().t;
}

export function useLocale() {
  return useI18n().lang === "en" ? "en-US" : "pt-BR";
}
