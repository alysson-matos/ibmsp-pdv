import { COMMON } from "./common";
import { PDV } from "./pdv";
import { EXPEDICAO } from "./expedicao";
import { HISTORICO } from "./historico";
import { INVENTARIO } from "./inventario";
import { OPERADORES } from "./operadores";

export const EN: Record<string, string> = {
  ...COMMON,
  ...PDV,
  ...EXPEDICAO,
  ...HISTORICO,
  ...INVENTARIO,
  ...OPERADORES,
};
