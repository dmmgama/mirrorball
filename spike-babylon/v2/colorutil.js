// v2/colorutil.js — util única de cor da Fase 8 (sala real). ES module, sem estado.
//
// `toGrey(r,g,b)` — luminância Rec.709 (0.2126r+0.7152g+0.0722b), devolve [g,g,g].
// `applyColorToggle(CONFIG, r,g,b)` — se `CONFIG.colorOn===false` colapsa para toGrey(); senão
// devolve [r,g,b] inalterado. É a ÚNICA porta por onde as cores NOVAS da sala (wash, chapéus, chão
// de madeira, spots com spotColorOn) passam antes de serem escritas num material/luz — assim o
// toggle 'cor (0/1)' atua AO VIVO (por frame), sem exigir rebuild.
//
// `hueToRgb(hueDeg, sat=1, val=1)` — HSV→RGB simples (mesma fórmula usada em main.js/fixtures.js
// para os focos coloridos), reutilizada aqui para o matiz do wash e o dourado dos chapéus.

export function toGrey(r, g, b) {
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [y, y, y];
}

export function applyColorToggle(CONFIG, r, g, b) {
  if (CONFIG && CONFIG.colorOn === false) return toGrey(r, g, b);
  return [r, g, b];
}

export function hueToRgb(hueDeg, sat, val) {
  const s = sat == null ? 1 : sat, v = val == null ? 1 : val;
  const h = ((hueDeg % 360) + 360) % 360 / 60;
  const c = v * s, x = c * (1 - Math.abs((h % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 1) { r = c; g = x; } else if (h < 2) { r = x; g = c; } else if (h < 3) { g = c; b = x; }
  else if (h < 4) { g = x; b = c; } else if (h < 5) { r = x; b = c; } else { r = c; b = x; }
  return [r + m, g + m, b + m];
}
