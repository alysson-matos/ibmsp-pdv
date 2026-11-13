// 12×12 pixel-art sprites: each character maps to a color in PAL ("." is transparent).
export const PAL: Record<string, string> = {
  k: "#1D1B26",
  w: "#FFFFFF",
  r: "#E23B2E",
  o: "#FF6418",
  y: "#F7E733",
  b: "#1C8EEA",
  l: "#9ED8FF",
  g: "#3FAE49",
  n: "#6B3F1D",
  c: "#F3D9A4",
  p: "#F28BB8",
  m: "#B8752F",
  v: "#7A3CC4",
  s: "#8A867C",
};

export const SPR: Record<string, readonly string[]> = {
  kid: [
    "...kkkkkk...",
    "..knnnnnnk..",
    ".knnccccnnk.",
    ".kncwccwcnk.",
    ".kcccccccck.",
    "..kcckkcck..",
    "...kcccck...",
    "..kkooookk..",
    ".kooooooook.",
    ".kocooooock.",
    ".kkbbkkbbkk.",
    "..kk....kk..",
  ],
  box: [
    "............",
    ".kkkkkkkkkk.",
    ".kmmmmmmmmk.",
    ".kmmmyymmmk.",
    ".kkkkkkkkkk.",
    ".kmmmmmmmmk.",
    ".kmmmmmmmmk.",
    ".kmmwwwwmmk.",
    ".kmmmmmmmmk.",
    ".kmmmmmmmmk.",
    ".kkkkkkkkkk.",
    "............",
  ],
  chart: [
    "k...........",
    "k.......kk..",
    "k.......kk..",
    "k....kk.kk..",
    "k....kk.kk..",
    "k.kk.kk.kk..",
    "k.oo.bb.yy..",
    "k.oo.bb.yy..",
    "k.oo.bb.yy..",
    "k.oo.bb.yy..",
    "kkkkkkkkkkkk",
    "............",
  ],
  disk: [
    "kkkkkkkkkkk.",
    "kbbwwwwwbbk.",
    "kbbwwwkwbbk.",
    "kbbwwwkwbbk.",
    "kbbbbbbbbbk.",
    "kbbbbbbbbbk.",
    "kbwwwwwwwbk.",
    "kbwkkkkkwbk.",
    "kbwwwwwwwbk.",
    "kbwkkkkkwbk.",
    "kkkkkkkkkkk.",
    "............",
  ],
  coin: [
    "....kkkk....",
    "..kkyyyykk..",
    ".kyywwyyyyk.",
    ".kywyyyyyyk.",
    "kyywyykyyyyk",
    "kyyyykkkyyyk",
    "kyyyyykyyyyk",
    "kyyyyyyyyyyk",
    ".kyyyyyyymk.",
    ".kyyyyyymmk.",
    "..kkmmmmkk..",
    "....kkkk....",
  ],
  cart: [
    "............",
    "kk..........",
    ".k..........",
    ".kkkkkkkkkk.",
    ".kyyyyyyyyk.",
    ".kyokyokyk..",
    ".kyyyyyyyk..",
    "..kkkkkkkk..",
    "..k.....k...",
    "..kkkkkkkk..",
    "..kk...kk...",
    "............",
  ],
  shop: [
    "............",
    ".kkkkkkkkkk.",
    "krwrwrwrwrwk",
    "krwrwrwrwrwk",
    "kkkkkkkkkkkk",
    ".kcccccccck.",
    ".kclllckkck.",
    ".kclllcknck.",
    ".kclllcknck.",
    ".kcccccknck.",
    ".kkkkkkkkkk.",
    "............",
  ],
  scan: [
    "............",
    "kkkkkkkkkkkk",
    "kwwwwwwwwwwk",
    "kwkwkkwkwkwk",
    "kwkwkkwkwkwk",
    "kwkwkkwkwkwk",
    "kwkwkkwkwkwk",
    "kwkwkkwkwkwk",
    "krrrrrrrrrrk",
    "kwwwwwwwwwwk",
    "kkkkkkkkkkkk",
    "............",
  ],
  shelf: [
    "kkkkkkkkkkkk",
    "k..........k",
    "k.oo.bb.yy.k",
    "k.oo.bb.yy.k",
    "kkkkkkkkkkkk",
    "k..........k",
    "k.vv.rr.gg.k",
    "k.vv.rr.gg.k",
    "kkkkkkkkkkkk",
    "k..........k",
    "k..........k",
    "............",
  ],
  key: [
    "............",
    "..kkkk......",
    ".kyyyyk.....",
    "kyykkyyk....",
    "kyk..kykkkkk",
    "kyk..kyyyyyk",
    "kyykkyykykyk",
    ".kyyyyk.k.k.",
    "..kkkk......",
    "............",
    "............",
    "............",
  ],
  tag: [
    "............",
    ".kkkkkkk....",
    ".kyyyyyyk...",
    ".kykkyyyyk..",
    ".kyk.kyyyyk.",
    ".kykkyyyyyyk",
    ".kyyyyyyyyk.",
    "..kyyyyyyk..",
    "...kyyyyk...",
    "....kyyk....",
    ".....kk.....",
    "............",
  ],
};

const cache = new Map<string, string>();

/**
 * Data URL of a sprite. Built as SVG text (no canvas), so the server render and the
 * browser produce the same markup.
 */
export function sprite(name: string | undefined): string {
  const key = name && SPR[name] ? name : "box";
  const hit = cache.get(key);
  if (hit) return hit;
  let rects = "";
  SPR[key]!.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const color = PAL[ch];
      if (color) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`;
    });
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges">${rects}</svg>`;
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  cache.set(key, url);
  return url;
}

/** Pixel cloud 40×14 (desktop background). */
export function drawCloud(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#fff";
  for (const [x, y, w, h] of [
    [6, 6, 28, 6],
    [10, 3, 14, 4],
    [18, 1, 10, 3],
    [2, 9, 36, 4],
    [26, 4, 8, 3],
  ] as const)
    ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#DDEFFC";
  ctx.fillRect(4, 12, 32, 1);
}
