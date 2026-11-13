import { motion } from "motion/react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { tweenNumber } from "@/lib/fx";
import { drawCloud, sprite } from "@/lib/sprites";
import { cn } from "@/lib/utils";

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_POP = [0.34, 1.56, 0.64, 1] as const;

export function Sprite({
  name,
  size = 48,
  className,
  style,
  alt = "",
  id,
}: {
  name: string | undefined;
  size?: number;
  className?: string;
  style?: CSSProperties;
  alt?: string;
  id?: string;
}) {
  return (
    <img
      id={id}
      className={cn("sprite", className)}
      src={sprite(name)}
      alt={alt}
      width={size}
      height={size}
      style={style}
    />
  );
}

/** Integer that counts up/down to the new value. */
export function useTween(value: number, ms: number): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    return tweenNumber(from.current, value, ms, (v) => {
      from.current = v;
      setShown(v);
    });
  }, [value, ms]);
  return shown;
}

/** Segmented control (radiogroup) with a sliding indicator. ← → change the option. */
export function Seg<K extends string>({
  options,
  value,
  onChange,
  label,
  className,
  style,
  color = "var(--z-blue)",
}: {
  options: readonly (readonly [K, ReactNode])[];
  value: K;
  onChange: (k: K) => void;
  label: string;
  className?: string;
  style?: CSSProperties;
  color?: string;
}) {
  const layoutId = useId();
  const refs = useRef(new Map<K, HTMLButtonElement>());
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const keys = options.map((o) => o[0]);
    const i = (keys.indexOf(value) + (e.key === "ArrowRight" ? 1 : -1) + keys.length) % keys.length;
    const next = keys[i]!;
    onChange(next);
    refs.current.get(next)?.focus();
  };
  return (
    <div
      className={cn("seg", className)}
      role="radiogroup"
      aria-label={label}
      style={{ gridTemplateColumns: `repeat(${options.length},1fr)`, ...style }}
      onKeyDown={onKey}
    >
      {options.map(([k, l]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={k === value}
          tabIndex={k === value ? 0 : -1}
          ref={(el) => {
            if (el) refs.current.set(k, el);
            else refs.current.delete(k);
          }}
          onClick={() => onChange(k)}
        >
          {k === value && (
            <motion.span
              className="seg-ind"
              layoutId={layoutId}
              style={{ background: color }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
            />
          )}
          {l}
        </button>
      ))}
    </div>
  );
}

function Cloud({ className, style }: { className: string; style: CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawCloud(ref.current);
  }, []);
  return (
    <canvas
      ref={ref}
      className={className}
      width={40}
      height={14}
      style={style}
      aria-hidden="true"
    />
  );
}

/** Pixel sky with hills and drifting clouds; everything else sits on top of it. */
export function Desk({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("desk", className)}>
      <Cloud className="cloud" style={{ left: "6%", top: 30, width: 200 }} />
      <Cloud className="cloud cloud2" style={{ right: "8%", top: 110, width: 160 }} />
      {children}
    </div>
  );
}

/** Newspaper-cutout title: each letter is a tile with its own color, font and tilt. */
export function Collage({ text, tail }: { text: string; tail?: string | undefined }) {
  const letters = [...text];
  return (
    <h1 className="collage" aria-label={tail ? `${text} ${tail}` : text}>
      {letters.map((l, i) =>
        l === " " ? (
          <span key={i} className="cl-gap" aria-hidden="true" />
        ) : (
          <span
            key={i}
            className={`cl cl-${(i % 7) + 1}`}
            style={{ "--i": i } as CSSProperties}
            aria-hidden="true"
          >
            {l}
          </span>
        ),
      )}
      {tail ? (
        <span
          className="cl cl-z"
          style={{ "--i": letters.length + 1 } as CSSProperties}
          aria-hidden="true"
        >
          {tail}
        </span>
      ) : null}
    </h1>
  );
}

/** A Windows 95-style window: beveled frame, gradient title bar and paper body. */
export function Win({
  title,
  children,
  className,
  bodyClassName,
  menubar,
  label,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  menubar?: ReactNode;
  label?: string;
}) {
  return (
    <section className={cn("win bevel", className)} aria-label={label}>
      <div className="titlebar">
        <span className="zlogo zlogo-sm" aria-hidden="true">
          M
        </span>
        <span className="tb-title">{title}</span>
        <div className="tb-btns" aria-hidden="true">
          <span className="bevel">_</span>
          <span className="bevel">□</span>
          <span className="bevel">×</span>
        </div>
      </div>
      {menubar}
      <div className={cn("win-body", bodyClassName)}>{children}</div>
    </section>
  );
}

export function useClock(locale: string): string {
  const [now, setNow] = useState("");
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    setNow(fmt());
    const t = setInterval(() => setNow(fmt()), 15000);
    return () => clearInterval(t);
  }, [locale]);
  return now;
}
