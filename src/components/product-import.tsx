import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileUp } from "lucide-react";

import { importProducts, type Product } from "@/lib/pos.functions";
import {
  MAX_PRODUCT_IMPORT,
  parseProductSheet,
  PROVISIONAL_PREFIX,
  type ImportedProduct,
} from "@/lib/product-import";
import { productIcon } from "@/lib/product-icons";
import { brl } from "@/lib/format";
import { Sprite } from "@/components/retro";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { useRetro } from "@/lib/retro";

async function readSheet(file: File, existing: Product[]): Promise<ImportedProduct[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer());
  const sheet = workbook.Sheets[workbook.SheetNames[0]!];
  if (!sheet) return [];
  // blankrows: true keeps the line numbers equal to the spreadsheet's.
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: true,
    defval: "",
    raw: true,
  });
  return parseProductSheet(grid, existing);
}

async function downloadTemplate() {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Produto", "Código de barras", "Quantidade", "Preço de custo", "Preço", "Estoque mínimo"],
    ["Coca-Cola lata 350ml", "7894900011517", 24, 3.05, 5, 6],
    ["Bala de goma", "", 50, 0.89, 2, ""],
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Produtos");
  XLSX.writeFile(book, "modelo-produtos.xlsx");
}

export function ProductImportButton({ products }: { products: Product[] }) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportedProduct[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    try {
      const parsed = await readSheet(file, products);
      if (parsed.length === 0) {
        toast.error(t("Nenhum produto encontrado na planilha."));
        return;
      }
      setFileName(file.name);
      setRows(parsed);
    } catch (e) {
      console.error(e);
      toast.error(t("Não foi possível ler o arquivo. Use uma planilha .xlsx, .xls ou .csv."));
    } finally {
      setReading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv,.ods"
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Button variant="outline" disabled={reading} onClick={() => inputRef.current?.click()}>
        <FileUp className="size-4" />
        {reading ? t("Lendo...") : t("Importar planilha")}
      </Button>
      <Dialog open={!!rows} onOpenChange={(open) => !open && setRows(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          {rows ? (
            <ImportPreview rows={rows} fileName={fileName} onClose={() => setRows(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

const ISSUE_LABEL: Record<NonNullable<ImportedProduct["issue"]>, string> = {
  "no-price": "Sem preço",
  duplicate: "Repetido na planilha",
  exists: "Já cadastrado",
  "barcode-taken": "Código já usado",
};

function ImportPreview({
  rows,
  fileName,
  onClose,
}: {
  rows: ImportedProduct[];
  fileName: string;
  onClose: () => void;
}) {
  const retro = useRetro();
  const t = useT();
  const queryClient = useQueryClient();
  const importFn = useServerFn(importProducts);

  const valid = rows.filter((r) => !r.issue);
  const skipped = rows.length - valid.length;
  const withoutCode = valid.filter((r) => !r.barcode).length;
  const box = retro ? "bg-secondary/60 px-3 py-2" : "rounded-lg bg-secondary/60 px-3 py-2";

  const run = useMutation({
    mutationFn: () =>
      importFn({
        data: {
          rows: valid.map(({ name, barcode, price, cost, stock, min_stock }) => ({
            name,
            barcode,
            price,
            cost,
            stock,
            min_stock,
          })),
        },
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      toast.success(
        res.skipped
          ? t("{n} produtos importados ({skipped} já existiam)", {
              n: res.created,
              skipped: res.skipped,
            })
          : t("{n} produtos importados", { n: res.created }),
      );
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("Importar produtos")}</DialogTitle>
        <DialogDescription>
          {fileName} ·{" "}
          {t(
            "Colunas reconhecidas: Produto, Código de barras, Quantidade, Preço de custo, Preço e Estoque mínimo. Pode ter várias seções, cada uma com seu cabeçalho.",
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className={box}>
          <p className="text-xs text-muted-foreground">{t("Serão importados")}</p>
          <p
            className={cn("tabular text-xl font-bold", retro ? "text-navy" : "text-primary")}
          >
            {valid.length}
          </p>
        </div>
        <div className={box}>
          <p className="text-xs text-muted-foreground">{t("Sem código de barras")}</p>
          <p className="tabular text-xl font-bold">{withoutCode}</p>
        </div>
        <div className={box}>
          <p className="text-xs text-muted-foreground">{t("Ignorados")}</p>
          <p className={cn("tabular text-xl font-bold", skipped > 0 && "text-destructive")}>
            {skipped}
          </p>
        </div>
      </div>

      {withoutCode > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {t(
            "Produtos sem código recebem um código provisório ({prefix}001, {prefix}002...). Busque \"{prefix}\" no Inventário para achar os que faltam e troque pelo código real ao editar o produto.",
            { prefix: PROVISIONAL_PREFIX },
          )}
        </p>
      ) : null}

      {valid.length > MAX_PRODUCT_IMPORT ? (
        <p className="mt-3 text-sm text-destructive">
          {t("Importe no máximo {n} produtos por vez.", { n: MAX_PRODUCT_IMPORT })}
        </p>
      ) : null}

      <div
        className={cn(
          "mt-4 max-h-80 overflow-auto border border-border",
          !retro && "rounded-lg",
        )}
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr
              className={
                retro
                  ? "thead-z"
                  : "border-b border-border text-left text-xs uppercase tracking-widest text-muted-foreground"
              }
            >
              <th className="px-3 py-2 font-medium">{t("Linha")}</th>
              <th className="px-3 py-2 font-medium">{t("Produto")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Qtd.")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Custo")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Preço")}</th>
              <th className="px-3 py-2 font-medium">{t("Código")}</th>
              <th className="px-3 py-2 font-medium">{t("Situação")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.slice(0, 500).map((r) => (
              <tr key={r.line} className={cn(r.issue && "text-muted-foreground")}>
                <td className="tabular px-3 py-1.5">{r.line}</td>
                <td className="px-3 py-1.5">
                  <span className="flex items-center gap-2">
                    {retro ? <Sprite name={productIcon(r)} size={20} /> : null}
                    <span className="block max-w-60 truncate">{r.name}</span>
                  </span>
                  {r.section ? (
                    <span className="block text-xs text-muted-foreground">{r.section}</span>
                  ) : null}
                </td>
                <td className="tabular px-3 py-1.5 text-right">{r.stock}</td>
                <td className="tabular px-3 py-1.5 text-right">{r.cost > 0 ? brl(r.cost) : "—"}</td>
                <td className="tabular px-3 py-1.5 text-right">{brl(r.price)}</td>
                <td className="tabular px-3 py-1.5 text-xs">
                  {r.barcode || <span className="text-muted-foreground">{t("provisório")}</span>}
                </td>
                <td className={cn("px-3 py-1.5 text-xs", r.issue && "text-destructive")}>
                  {r.issue ? t(ISSUE_LABEL[r.issue]) : t("OK")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 500 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            {t("Mostrando 500 de {n} linhas.", { n: rows.length })}
          </p>
        ) : null}
      </div>

      <DialogFooter className="mt-4 gap-2 sm:justify-between">
        <Button type="button" variant="ghost" onClick={() => void downloadTemplate()}>
          <Download className="size-4" /> {t("Baixar modelo")}
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("Cancelar")}
          </Button>
          <Button
            type="button"
            disabled={run.isPending || valid.length === 0 || valid.length > MAX_PRODUCT_IMPORT}
            onClick={() => run.mutate()}
          >
            {run.isPending ? t("Importando...") : t("Importar {n} produtos", { n: valid.length })}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
