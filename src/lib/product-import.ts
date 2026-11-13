/**
 * Reads a product spreadsheet for the Inventário import. It accepts one table with a
 * header row or several sections, each with its own header (as in "Bebidas | Quantidade
 * | Preço de Custo | PREÇO", then "Doces | Quantidade | ..."). The first column of a
 * section header is just the section name; the products' names are in that column.
 */

export type ImportedProduct = {
  /** Spreadsheet line (1-based), to point at problems. */
  line: number;
  /** Section the row came from ("Bebidas"), if the sheet has sections. */
  section: string;
  name: string;
  /** Empty = no barcode yet: the server gives it a provisional code (SEM-001...). */
  barcode: string;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  /** Why the row won't be imported, if it won't. */
  issue: "no-price" | "duplicate" | "exists" | "barcode-taken" | null;
};

export const MAX_PRODUCT_IMPORT = 2000;
export const DEFAULT_MIN_STOCK = 5;
/** Provisional barcodes for products imported without one. */
export const PROVISIONAL_PREFIX = "SEM-";

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export function productKey(name: string) {
  return fold(name).replace(/\s+/g, " ");
}

type Field = "name" | "barcode" | "price" | "cost" | "stock" | "min_stock";

/** Header cell -> field, or null when it's not a known column. */
function headerField(cell: string): Field | null {
  const h = fold(cell);
  if (!h) return null;
  if (/custo/.test(h)) return "cost";
  if (/(minimo|^min\b)/.test(h)) return "min_stock";
  if (/(quantidade|^qtd|^qtde|estoque)/.test(h)) return "stock";
  if (/(codigo|barras|\bean\b|gtin)/.test(h)) return "barcode";
  if (/(preco|valor|venda)/.test(h)) return "price";
  if (/^(nome|produto|descricao|item)\b/.test(h)) return "name";
  return null;
}

/** Spreadsheet cell -> number (accepts 4,50 and R$ 4,50). Empty = null. */
function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let v = String(value).replace(/R\$|\s/gi, "");
  if (!v) return null;
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * Grid of cells (first sheet, header: 1) -> products. `existing` are the products
 * already in the store, to flag names and barcodes that are taken.
 */
export function parseProductSheet(
  grid: unknown[][],
  existing: { name: string; barcode: string }[],
): ImportedProduct[] {
  const takenNames = new Set(existing.map((p) => productKey(p.name)));
  const takenCodes = new Set(existing.map((p) => p.barcode.trim()));
  const fileNames = new Set<string>();
  const fileCodes = new Set<string>();
  const rows: ImportedProduct[] = [];

  let cols: Partial<Record<Field, number>> | null = null;
  let section = "";

  grid.forEach((cells, idx) => {
    const text = (cells ?? []).map((c) => String(c ?? "").trim());
    if (text.every((c) => !c)) return;

    // A header row has at least two known columns (price, stock, cost, barcode...).
    const fields = text.map(headerField);
    if (fields.filter(Boolean).length >= 2) {
      cols = {};
      fields.forEach((f, i) => {
        if (f && cols![f] === undefined) cols![f] = i;
      });
      if (cols.name === undefined) {
        // The names are in the first column that isn't a known one; its header is the
        // section name ("Bebidas").
        const nameCol = fields.findIndex((f) => !f);
        cols.name = nameCol >= 0 ? nameCol : 0;
        section = text[cols.name] ?? "";
      } else {
        section = "";
      }
      return;
    }

    // Without any header: column A is the name and B the price.
    const c = cols ?? { name: 0, price: 1 };
    const name = (text[c.name ?? 0] ?? "").replace(/\s+/g, " ").slice(0, 120);
    if (!name) return;

    const price = c.price !== undefined ? parseNumber(cells[c.price]) : null;
    const cost = c.cost !== undefined ? (parseNumber(cells[c.cost]) ?? 0) : 0;
    const stock = c.stock !== undefined ? (parseNumber(cells[c.stock]) ?? 0) : 0;
    const minStock =
      c.min_stock !== undefined
        ? (parseNumber(cells[c.min_stock]) ?? DEFAULT_MIN_STOCK)
        : DEFAULT_MIN_STOCK;
    const barcode = c.barcode !== undefined ? (text[c.barcode] ?? "").replace(/\s+/g, "") : "";

    const key = productKey(name);
    let issue: ImportedProduct["issue"] = null;
    if (price === null || price < 0) issue = "no-price";
    else if (takenNames.has(key)) issue = "exists";
    else if (fileNames.has(key)) issue = "duplicate";
    else if (barcode && (takenCodes.has(barcode) || fileCodes.has(barcode))) issue = "barcode-taken";
    fileNames.add(key);
    if (barcode) fileCodes.add(barcode);

    rows.push({
      line: idx + 1,
      section,
      name,
      barcode,
      price: money(Math.max(price ?? 0, 0)),
      cost: money(Math.max(cost, 0)),
      stock: Math.max(Math.round(stock), 0),
      min_stock: Math.max(Math.round(minStock), 0),
      issue,
    });
  });
  return rows;
}
