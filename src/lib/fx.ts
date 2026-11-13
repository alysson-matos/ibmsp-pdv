// Imperative effects (WAAPI/canvas). All of them respect prefers-reduced-motion.

export const reducedMotion = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Restarts a global CSS class animation (shake, bump). */
export function replay(el: Element | null | undefined, cls: string): void {
  if (!el || reducedMotion()) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
  el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
}

/** Counts from one number to another (cubic ease-out). Returns a cancel function. */
export function tweenNumber(
  from: number,
  to: number,
  ms: number,
  onFrame: (v: number) => void,
): () => void {
  if (reducedMotion() || from === to) {
    onFrame(to);
    return () => {};
  }
  const t0 = performance.now();
  let raf = 0;
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    onFrame(Math.round(from + (to - from) * e));
    if (k < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/** A clone of the sprite flies in an arc to the target (340–560 ms). */
export function fly(fromImg: HTMLImageElement | null, toEl: Element | null, done?: () => void) {
  if (reducedMotion() || !fromImg || !toEl) {
    done?.();
    return;
  }
  const a = fromImg.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  const wrap = document.createElement("div");
  wrap.className = "flyer";
  Object.assign(wrap.style, {
    left: a.left + "px",
    top: a.top + "px",
    width: a.width + "px",
    height: a.height + "px",
  });
  const img = new Image();
  img.src = fromImg.src;
  img.alt = "";
  img.style.cssText = "width:100%;height:100%;image-rendering:pixelated";
  wrap.append(img);
  document.body.append(wrap);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const lift = Math.min(90, Math.max(40, Math.abs(dx) * 0.18));
  const D = Math.min(560, Math.max(340, Math.hypot(dx, dy) * 0.55));
  wrap.animate([{ transform: "translateX(0)" }, { transform: `translateX(${dx}px)` }], {
    duration: D,
    easing: "cubic-bezier(.4,0,.6,1)",
    fill: "forwards",
  });
  img.animate(
    [
      { transform: "translateY(0) scale(1) rotate(0)" },
      {
        transform: `translateY(${-lift}px) scale(.85) rotate(-12deg)`,
        offset: 0.32,
        easing: "cubic-bezier(.55,0,1,.45)",
      },
      { transform: `translateY(${dy}px) scale(.42) rotate(8deg)`, opacity: 0.9 },
    ],
    { duration: D, easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" },
  ).onfinish = () => {
    wrap.remove();
    done?.();
  };
}

let confettiRaf = 0;
/** Pixel confetti — only when a sale is completed. Draws on the #fx canvas. */
export function confetti(x: number, y: number): void {
  if (reducedMotion()) return;
  const cv = document.getElementById("fx") as HTMLCanvasElement | null;
  const ctx = cv?.getContext("2d");
  if (!cv || !ctx) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = innerWidth * dpr;
  cv.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cols = ["#FF6418", "#1C8EEA", "#F7E733", "#7A3CC4", "#F6C9DA", "#2BA6D9", "#1D1B26"];
  const P = Array.from({ length: 90 }, () => {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
    const sp = 5 + Math.random() * 7;
    return {
      x,
      y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      s: 4 + ((Math.random() * 3) | 0) * 2,
      c: cols[(Math.random() * cols.length) | 0]!,
      life: 0,
      max: 50 + Math.random() * 30,
    };
  });
  cancelAnimationFrame(confettiRaf);
  const tick = () => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    let alive = 0;
    for (const p of P) {
      if (p.life++ > p.max) continue;
      alive++;
      p.vy += 0.32;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
      ctx.fillStyle = p.c;
      ctx.fillRect(Math.round(p.x / 2) * 2, Math.round(p.y / 2) * 2, p.s, p.s);
    }
    if (alive) confettiRaf = requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  };
  tick();
}
