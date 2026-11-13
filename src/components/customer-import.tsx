import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet } from "lucide-react";

import {
  customerKey,
  importCustomers,
  MAX_IMPORT_ROWS,
  type Customer,
} from "@/lib/customers.functions";
import { brl } from "@/lib/format";
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

type ParsedRow = {
  line: number;
  name: string;
  notes: string;
  balance: number;
  /** Why the row won't be imported, if it won't. */
  issue: "invalid-balance" | "duplicate" | "exists" | null;
};

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const NAME_HEADER = /^(nome|name|cliente|clientes)\b/;
const BALANCE_HEADER = /(saldo|valor|credito|balance)/;
const NOTES_HEADER = /(obs|telefone|celular|fone|whats|contato|grupo|email|e-mail|nota)/;

/** Spreadsheet cell -> balance. Empty means zero; null means it can't be read. */
function parseBalance(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number")
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  let v = String(value).replace(/R\$|\s/gi, "");
  if (!v) return 0;
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

async function readSheet(file: File, existing: Customer[]): Promise<ParsedRow[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer());
  const sheet = workbook.Sheets[workbook.SheetNames[0]!];
  if (!sheet) return [];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: true,
  });
  if (grid.length === 0) return [];

  // With a header row the columns are found by name; without one, column A is the
  // name and column B (if any) the balance.
  const header = (grid[0] ?? []).map((cell) => fold(String(cell ?? "")));
  let nameCol = header.findIndex((h) => NAME_HEADER.test(h));
  let balanceCol = header.findIndex((h) => BALANCE_HEADER.test(h));
  let notesCol = header.findIndex((h) => NOTES_HEADER.test(h));
  const hasHeader = nameCol >= 0;
  if (!hasHeader) {
    nameCol = 0;
    balanceCol = 1;
    notesCol = -1;
  }

  const taken = new Set(existing.map((c) => customerKey(c.name)));
  const inFile = new Set<string>();
  const rows: ParsedRow[] = [];

  grid.slice(hasHeader ? 1 : 0).forEach((cells, idx) => {
    const name = String(cells[nameCol] ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (!name) return;
    const balance = balanceCol >= 0 ? parseBalance(cells[balanceCol]) : 0;
    const notes =
      notesCol >= 0
        ? String(cells[notesCol] ?? "")
            .trim()
            .slice(0, 120)
        : "";
    const key = customerKey(name);

    let issue: ParsedRow["issue"] = null;
    if (balance === null || balance < 0) issue = "invalid-balance";
    else if (taken.has(key)) issue = "exists";
    else if (inFile.has(key)) issue = "duplicate";
    inFile.add(key);

    rows.push({
      line: idx + (hasHeader ? 2 : 1),
      name,
      notes,
      balance: balance ?? 0,
      issue,
    });
  });
  return rows;
}

export async function downloadTemplate() {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Nome", "Saldo", "Observação"],
    ["Maria Silva", 50, "(11) 99999-0000"],
    ["João Souza", "", "Grupo de jovens"],
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Clientes");
  XLSX.writeFile(book, "modelo-clientes.xlsx");
}

export function CustomerImportButton({ customers }: { customers: Customer[] }) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    try {
      const parsed = await readSheet(file, customers);
      if (parsed.length === 0) {
        toast.error(t("Nenhum nome encontrado na planilha."));
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
        <FileSpreadsheet className="size-4" />
        {reading ? t("Lendo...") : t("Importar Excel")}
      </Button>
      <Dialog open={!!rows} onOpenChange={(open) => !open && setRows(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {rows ? (
            <ImportPreview rows={rows} fileName={fileName} onClose={() => setRows(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

const ISSUE_LABEL: Record<NonNullable<ParsedRow["issue"]>, string> = {
  "invalid-balance": "Saldo inválido",
  duplicate: "Repetido na planilha",
  exists: "Já cadastrado",
};

function ImportPreview({
  rows,
  fileName,
  onClose,
}: {
  rows: ParsedRow[];
  fileName: string;
  onClose: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const importFn = useServerFn(importCustomers);

  const valid = rows.filter((r) => !r.issue);
  const skipped = rows.length - valid.length;
  const totalBalance = valid.reduce((sum, r) => sum + r.balance, 0);

  const run = useMutation({
    mutationFn: () =>
      importFn({
        data: { rows: valid.map(({ name, notes, balance }) => ({ name, notes, balance })) },
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(
        res.skipped
          ? t("{n} clientes importados ({skipped} já existiam)", {
              n: res.created,
              skipped: res.skipped,
            })
          : t("{n} clientes importados", { n: res.created }),
      );
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("Importar clientes")}</DialogTitle>
        <DialogDescription>
          {fileName} ·{" "}
          {t(
            "Só o nome é obrigatório. Colunas reconhecidas: Nome, Saldo e Observação (ou Telefone).",
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="bg-secondary/60 px-3 py-2">
          <p className="text-xs text-muted-foreground">{t("Serão importados")}</p>
          <p className="tabular text-xl font-bold text-navy">{valid.length}</p>
        </div>
        <div className="bg-secondary/60 px-3 py-2">
          <p className="text-xs text-muted-foreground">{t("Saldo somado")}</p>
          <p className="tabular text-xl font-bold">{brl(totalBalance)}</p>
        </div>
        <div className="bg-secondary/60 px-3 py-2">
          <p className="text-xs text-muted-foreground">{t("Ignorados")}</p>
          <p className={cn("tabular text-xl font-bold", skipped > 0 && "text-destructive")}>
            {skipped}
          </p>
        </div>
      </div>

      {valid.length > MAX_IMPORT_ROWS ? (
        <p className="mt-3 text-sm text-destructive">
          {t("Importe no máximo {n} clientes por vez.", { n: MAX_IMPORT_ROWS })}
        </p>
      ) : null}

      <div className="mt-4 max-h-80 overflow-auto border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="thead-z">
              <th className="px-3 py-2 font-medium">{t("Linha")}</th>
              <th className="px-3 py-2 font-medium">{t("Nome")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Saldo")}</th>
              <th className="px-3 py-2 font-medium">{t("Situação")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.slice(0, 300).map((r) => (
              <tr key={r.line} className={cn(r.issue && "text-muted-foreground")}>
                <td className="tabular px-3 py-1.5">{r.line}</td>
                <td className="px-3 py-1.5">
                  <span className="block max-w-56 truncate">{r.name}</span>
                  {r.notes ? (
                    <span className="block max-w-56 truncate text-xs text-muted-foreground">
                      {r.notes}
                    </span>
                  ) : null}
                </td>
                <td className="tabular px-3 py-1.5 text-right">{brl(r.balance)}</td>
                <td className={cn("px-3 py-1.5 text-xs", r.issue && "text-destructive")}>
                  {r.issue ? t(ISSUE_LABEL[r.issue]) : t("OK")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 300 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            {t("Mostrando 300 de {n} linhas.", { n: rows.length })}
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
            disabled={run.isPending || valid.length === 0 || valid.length > MAX_IMPORT_ROWS}
            onClick={() => run.mutate()}
          >
            {run.isPending ? t("Importando...") : t("Importar {n} clientes", { n: valid.length })}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
