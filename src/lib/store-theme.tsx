import logoAsset from "@/assets/logo-ibmemorial.png.asset.json";
import { cn } from "@/lib/utils";

/** Fonts a store can use. Keys are stored in the database. */
export const STORE_FONTS = {
  "space-grotesk": { label: "Moderna", family: "Space Grotesk" },
  nunito: { label: "Amigável", family: "Nunito" },
  poppins: { label: "Geométrica", family: "Poppins" },
  "playfair-display": { label: "Elegante", family: "Playfair Display" },
  "baloo-2": { label: "Divertida", family: "Baloo 2" },
} as const;
export type StoreFont = keyof typeof STORE_FONTS;
export const STORE_FONT_KEYS = Object.keys(STORE_FONTS) as StoreFont[];

export const DEFAULT_STORE_COLOR = "#64a99c";

type ThemeLike = { name: string; color: string; font: string; logo: string | null };

function fontFamily(font: string) {
  return (STORE_FONTS[font as StoreFont] ?? STORE_FONTS["space-grotesk"]).family;
}

/** CSS font-family value for a store font. */
export function storeFontStack(font: string) {
  return `"${fontFamily(font)}", "Space Grotesk", ui-sans-serif, system-ui, sans-serif`;
}

export function fontHref(fonts: string[]) {
  const families = [...new Set(fonts.map(fontFamily))]
    .filter((f) => f !== "Space Grotesk") // already loaded by the root
    .map((f) => `family=${f.replace(/ /g, "+")}:wght@400;500;600;700`);
  return families.length
    ? `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`
    : null;
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Dark or white text, whichever reads better on the given color. */
export function textOn(hex: string) {
  const l = luminance(hex);
  const onWhite = 1.05 / (l + 0.05);
  const onDark = (l + 0.05) / 0.06;
  return onDark >= onWhite ? "oklch(0.18 0.02 250)" : "oklch(0.99 0 0)";
}

/** Loads a set of store fonts (used where several stores are shown at once). */
export function StoreFonts({ fonts }: { fonts: string[] }) {
  const href = fontHref(fonts);
  return href ? <link rel="stylesheet" href={href} precedence="default" /> : null;
}

/**
 * Marks the page with the store in use. The app has a single look (the retro
 * desktop); the store only brings its color, exposed as --store and used on the
 * masthead tile and the store cards. Its logo is shown by StoreLogo.
 */
export function StoreThemeStyle({ store }: { store: ThemeLike }) {
  const c = /^#[0-9a-fA-F]{6}$/.test(store.color) ? store.color : DEFAULT_STORE_COLOR;
  return <style>{`:root{--store:${c}}`}</style>;
}

/** The store's own logo, or the church logo painted in the store color. */
export function StoreLogo({ store, className }: { store: ThemeLike; className?: string }) {
  if (store.logo) {
    return <img src={store.logo} alt={store.name} className={cn("object-contain", className)} />;
  }
  const url = `url(${logoAsset.url})`;
  return (
    <div
      role="img"
      aria-label={store.name}
      className={className}
      style={{
        maskImage: url,
        WebkitMaskImage: url,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        backgroundColor: store.color || DEFAULT_STORE_COLOR,
      }}
    />
  );
}

/** Resizes an uploaded image in the browser so the stored logo stays small. */
export function resizeLogo(file: File, maxSide = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Imagem inválida"));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        // PNG keeps transparency; WebP is used when it comes out smaller.
        const png = canvas.toDataURL("image/png");
        const webp = canvas.toDataURL("image/webp", 0.9);
        resolve(webp.startsWith("data:image/webp") && webp.length < png.length ? webp : png);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
