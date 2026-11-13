/**
 * Product icons of the retro look: pixel-art sprites (see SPR in sprites.ts) chosen per
 * product in Inventário. A product without a chosen icon gets one guessed from its name,
 * or the price tag.
 */

export const PRODUCT_ICONS = [
  { key: "chocolate", label: "Chocolate", words: ["chocolate", "choco", "bombom", "kitkat", "kit kat", "trufa", "barra", "snickers", "twix", "baton", "lacta", "laka", "diamante negro", "bis", "m m", "suflair", "trento", "tortuguita", "talento", "prestigio", "sonho de valsa", "ouro branco", "hersheys", "garoto", "milka", "toblerone", "ferrero"] },
  { key: "bala", label: "Bala", words: ["bala", "jujuba", "goma", "tic tac", "mentos", "drops", "fini", "halls", "freegells", "pastilha", "docile", "fruittella"] },
  { key: "pirulito", label: "Pirulito", words: ["pirulito", "chupa", "chupeta"] },
  { key: "salgadinho", label: "Salgadinho", words: ["salgadinho", "chips", "batata", "doritos", "cheetos", "fandangos", "ruffles", "pringles", "amendoim", "elma", "torcida", "cebolitos", "baconzitos"] },
  { key: "refrigerante", label: "Refrigerante", words: ["refrigerante", "refri", "coca", "guarana", "fanta", "sprite", "pepsi", "schweppes", "soda", "lata", "energetico", "monster", "red bull"] },
  { key: "agua", label: "Água", words: ["agua"] },
  { key: "suco", label: "Suco", words: ["suco", "nectar", "del valle", "valle", "achocolatado", "toddynho", "caixinha", "ades", "maguary"] },
  { key: "biscoito", label: "Biscoito", words: ["biscoito", "bolacha", "cookie", "wafer", "oreo", "trakinas"] },
  { key: "sorvete", label: "Sorvete", words: ["sorvete", "picole", "acai"] },
  { key: "chiclete", label: "Chiclete", words: ["chiclete", "chicle", "trident", "chiclets", "babaloo", "big big"] },
  { key: "pipoca", label: "Pipoca", words: ["pipoca"] },
  { key: "cafe", label: "Café", words: ["cafe", "cha", "capuccino", "cappuccino"] },
  { key: "lanche", label: "Lanche", words: ["lanche", "sanduiche", "hamburguer", "hot dog", "cachorro", "misto", "salgado", "coxinha", "pastel", "pao", "esfiha", "empada"] },
  { key: "bolo", label: "Bolo", words: ["bolo", "brownie", "torta", "doce", "brigadeiro", "cupcake", "muffin"] },
  { key: "fruta", label: "Fruta", words: ["fruta", "maca", "banana", "laranja", "uva"] },
  { key: "tag", label: "Outros", words: [] },
] as const;

export type ProductIcon = (typeof PRODUCT_ICONS)[number]["key"];
export const PRODUCT_ICON_KEYS = PRODUCT_ICONS.map((i) => i.key) as [ProductIcon, ...ProductIcon[]];

/** Lowercase without accents, so "Água" and "agua" match. */
function plain(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Icon guessed from the product name ("Coca-Cola lata" → refrigerante), or the tag. */
export function guessProductIcon(name: string): ProductIcon {
  const words = ` ${plain(name).replace(/[^a-z0-9]+/g, " ")} `;
  for (const icon of PRODUCT_ICONS) {
    // Whole words, also in the plural ("balas", "pirulitos").
    if (icon.words.some((w) => words.includes(` ${w} `) || words.includes(` ${w}s `))) {
      return icon.key;
    }
  }
  return "tag";
}

/** The icon to draw for a product: the one chosen in Inventário, or the guess. */
export function productIcon(product: { name: string; icon?: string | null }): string {
  return product.icon && PRODUCT_ICON_KEYS.includes(product.icon as ProductIcon)
    ? product.icon
    : guessProductIcon(product.name);
}
