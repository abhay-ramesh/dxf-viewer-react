/**
 * AutoCAD Color Index -> RGB.
 *
 * Indices 0-9 and 250-255 are the exact AutoCAD values. 10-249 are generated
 * from AutoCAD's 24-hue x 10-shade structure using HSV, which reproduces the
 * palette closely but not bit-exactly.
 *
 * This is a fallback. dxf-parser resolves a true 24-bit `color` on layers and
 * on entities that carry one, and that value is preferred wherever present;
 * the index is only consulted when it is all the file gives us.
 */

const EXACT: Record<number, number> = {
  0: 0x000000, // ByBlock — resolved before it ever reaches here
  1: 0xff0000,
  2: 0xffff00,
  3: 0x00ff00,
  4: 0x00ffff,
  5: 0x0000ff,
  6: 0xff00ff,
  7: 0xffffff,
  8: 0x808080,
  9: 0xc0c0c0,
  250: 0x333333,
  251: 0x505050,
  252: 0x696969,
  253: 0x828282,
  254: 0xbebebe,
  255: 0xffffff,
};

/** Shade ladder within one hue: [saturation, value]. */
const SHADES: Array<[number, number]> = [
  [1.0, 1.0],
  [0.5, 1.0],
  [1.0, 0.75],
  [0.5, 0.75],
  [1.0, 0.5],
  [0.5, 0.5],
  [1.0, 0.35],
  [0.5, 0.35],
  [1.0, 0.25],
  [0.5, 0.25],
];

function hsvToRgb(h: number, s: number, v: number): number {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const byte = (value: number) => Math.round((value + m) * 255);
  return (byte(r) << 16) | (byte(g) << 8) | byte(b);
}

const cache = new Map<number, number>();

export function aciToRgb(index: number): number {
  const i = Math.trunc(index);
  const exact = EXACT[i];
  if (exact !== undefined) return exact;
  if (i < 10 || i > 249) return 0xffffff;

  const cached = cache.get(i);
  if (cached !== undefined) return cached;

  const offset = i - 10;
  const hue = Math.floor(offset / 10) * 15;
  const [saturation, value] = SHADES[offset % 10];
  const rgb = hsvToRgb(hue, saturation, value);
  cache.set(i, rgb);
  return rgb;
}

/** 256 means "inherit from the layer" in every DXF colour field. */
export const COLOR_BY_LAYER = 256;
/** 0 means "inherit from the containing block". */
export const COLOR_BY_BLOCK = 0;
