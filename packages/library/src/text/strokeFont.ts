/**
 * A single-stroke vector font.
 *
 * CAD text is not typeset text. AutoCAD's default font, txt.shx, is a stroke
 * font: every glyph is a set of open polylines with no fill and no outline.
 * Drawing DXF text with one is therefore *more* faithful than using a TrueType
 * face, and it has three properties that matter here:
 *
 *   - it produces line segments, so text merges into the same batched buffers
 *     as the rest of the drawing instead of adding a draw call each;
 *   - it scales to any zoom without going blurry, unlike a canvas texture;
 *   - it needs no font file, no canvas and no DOM, so it works in Node and in
 *     a worker exactly as it does in a browser.
 *
 * Glyphs are authored on an integer grid to keep the data legible:
 *
 *      y = 8  cap height / ascender
 *      y = 5  x-height
 *      y = 0  baseline
 *      y = -2 descender
 *
 * Each glyph is `advance:stroke|stroke|...` where a stroke is a space-
 * separated list of `x,y` points. Coordinates are divided by CAP_HEIGHT at
 * decode time, so a glyph's height is 1 and the caller scales by the DXF text
 * height.
 */

const CAP_HEIGHT = 8;

/** Authored glyph data. Keys are the characters themselves. */
const GLYPHS: Record<string, string> = {
  " ": "5:",
  "!": "3:1,8 1,2|1,0 1,1",
  '"': "4:1,8 1,6|3,8 3,6",
  "#": "7:1,6 6,6|1,2 6,2|2,8 2,0|5,8 5,0",
  $: "7:6,7 1,7 1,4 6,4 6,1 1,1|3,8 3,0",
  "%": "7:1,8 1,6|5,2 5,0|6,8 0,0|1,8 1,6 3,6 3,8 1,8|4,2 4,0 6,0 6,2 4,2",
  "&": "7:6,0 2,4 2,6 3,7 4,7 5,6 5,5 1,2 1,1 2,0 4,0 6,2",
  "'": "3:1,8 1,6",
  "(": "4:3,8 1,5 1,3 3,0",
  ")": "4:1,8 3,5 3,3 1,0",
  "*": "6:2,7 4,3|4,7 2,3|1,5 5,5",
  "+": "6:3,7 3,1|1,4 5,4",
  ",": "3:2,1 2,0 1,-2",
  "-": "6:1,4 5,4",
  ".": "3:1,0 1,1",
  "/": "6:1,0 5,8",
  "0": "7:2,0 4,0 5,1 5,7 4,8 2,8 1,7 1,1 2,0|1,1 5,7",
  "1": "5:1,6 3,8 3,0|1,0 5,0",
  "2": "7:1,7 2,8 4,8 5,7 5,5 1,1 1,0 5,0",
  "3": "7:1,8 5,8 5,5 3,4 5,3 5,1 4,0 2,0 1,1",
  "4": "7:4,0 4,8 1,3 6,3",
  "5": "7:5,8 1,8 1,5 4,5 5,4 5,1 4,0 2,0 1,1",
  "6": "7:5,7 4,8 2,8 1,7 1,1 2,0 4,0 5,1 5,3 4,4 2,4 1,3",
  "7": "7:1,8 5,8 3,0",
  "8": "7:2,4 1,5 1,7 2,8 4,8 5,7 5,5 4,4 2,4 1,3 1,1 2,0 4,0 5,1 5,3 4,4",
  "9": "7:1,1 2,0 4,0 5,1 5,7 4,8 2,8 1,7 1,5 2,4 4,4 5,5",
  ":": "3:1,5 1,6|1,0 1,1",
  ";": "3:2,5 2,6|2,1 2,0 1,-2",
  "<": "6:5,7 1,4 5,1",
  "=": "6:1,5 5,5|1,3 5,3",
  ">": "6:1,7 5,4 1,1",
  "?": "6:1,7 2,8 4,8 5,7 5,5 3,4 3,2|3,0 3,1",
  "@": "8:5,3 3,3 3,5 5,5 5,2 6,1 4,0 2,0 1,1 1,7 2,8 5,8 6,7",
  A: "7:1,0 1,6 2,8 4,8 5,6 5,0|1,3 5,3",
  B: "7:1,0 1,8 4,8 5,7 5,5 4,4 1,4|4,4 5,3 5,1 4,0 1,0",
  C: "7:5,7 4,8 2,8 1,7 1,1 2,0 4,0 5,1",
  D: "7:1,0 1,8 4,8 5,7 5,1 4,0 1,0",
  E: "6:5,8 1,8 1,0 5,0|1,4 4,4",
  F: "6:5,8 1,8 1,0|1,4 4,4",
  G: "7:5,7 4,8 2,8 1,7 1,1 2,0 4,0 5,1 5,3 3,3",
  H: "7:1,8 1,0|5,8 5,0|1,4 5,4",
  I: "4:1,8 3,8|2,8 2,0|1,0 3,0",
  J: "6:5,8 5,1 4,0 2,0 1,1",
  K: "7:1,8 1,0|5,8 1,3|2,4 5,0",
  L: "6:1,8 1,0 5,0",
  M: "8:1,0 1,8 3,4 5,8 5,0",
  N: "7:1,0 1,8 5,0 5,8",
  O: "7:2,0 4,0 5,1 5,7 4,8 2,8 1,7 1,1 2,0",
  P: "7:1,0 1,8 4,8 5,7 5,5 4,4 1,4",
  Q: "7:2,0 4,0 5,1 5,7 4,8 2,8 1,7 1,1 2,0|3,2 5,0",
  R: "7:1,0 1,8 4,8 5,7 5,5 4,4 1,4|3,4 5,0",
  S: "7:5,7 4,8 2,8 1,7 1,5 2,4 4,4 5,3 5,1 4,0 2,0 1,1",
  T: "6:1,8 5,8|3,8 3,0",
  U: "7:1,8 1,1 2,0 4,0 5,1 5,8",
  V: "7:1,8 3,0 5,8",
  W: "8:1,8 2,0 3,4 4,0 5,8",
  X: "7:1,8 5,0|1,0 5,8",
  Y: "7:1,8 3,4 5,8|3,4 3,0",
  Z: "7:1,8 5,8 1,0 5,0",
  "[": "4:3,8 1,8 1,0 3,0",
  "\\": "6:1,8 5,0",
  "]": "4:1,8 3,8 3,0 1,0",
  "^": "6:1,6 3,8 5,6",
  _: "6:1,0 5,0",
  "`": "3:1,8 3,6",
  a: "6:1,4 4,5 5,4 5,0|5,1 4,0 2,0 1,1 2,2 5,2",
  b: "6:1,8 1,0|1,4 2,5 4,5 5,4 5,1 4,0 2,0 1,1",
  c: "6:5,4 4,5 2,5 1,4 1,1 2,0 4,0 5,1",
  d: "6:5,8 5,0|5,4 4,5 2,5 1,4 1,1 2,0 4,0 5,1",
  e: "6:1,2 5,2 5,4 4,5 2,5 1,4 1,1 2,0 4,0 5,1",
  f: "5:4,8 3,8 2,7 2,0|1,5 4,5",
  g: "6:5,5 5,-1 4,-2 2,-2 1,-1|5,4 4,5 2,5 1,4 1,3 2,2 4,2 5,3",
  h: "6:1,8 1,0|1,4 2,5 4,5 5,4 5,0",
  i: "3:1,7 1,8|1,5 1,0",
  j: "4:3,7 3,8|3,5 3,-1 2,-2 1,-2",
  k: "6:1,8 1,0|4,5 1,2|2,3 5,0",
  l: "3:1,8 1,1 2,0",
  m: "8:1,5 1,0|1,4 2,5 3,4 3,0|3,4 4,5 5,4 5,0",
  n: "6:1,5 1,0|1,4 2,5 4,5 5,4 5,0",
  o: "6:2,0 4,0 5,1 5,4 4,5 2,5 1,4 1,1 2,0",
  p: "6:1,5 1,-2|1,4 2,5 4,5 5,4 5,1 4,0 2,0 1,1",
  q: "6:5,5 5,-2|5,4 4,5 2,5 1,4 1,1 2,0 4,0 5,1",
  r: "5:1,5 1,0|1,3 2,5 4,5",
  s: "6:5,4 4,5 2,5 1,4 2,3 4,3 5,2 4,0 2,0 1,1",
  t: "5:2,8 2,1 3,0|1,5 4,5",
  u: "6:1,5 1,1 2,0 4,0 5,1|5,5 5,0",
  v: "6:1,5 3,0 5,5",
  w: "8:1,5 2,0 3,3 4,0 5,5",
  x: "6:1,5 5,0|1,0 5,5",
  y: "6:1,5 3,0|5,5 2,-2",
  z: "6:1,5 5,5 1,0 5,0",
  "{": "5:4,8 2,7 2,5 1,4 2,3 2,1 4,0",
  "|": "3:1,8 1,-2",
  "}": "5:1,8 3,7 3,5 4,4 3,3 3,1 1,0",
  "~": "7:1,4 2,5 4,3 5,4",
  // Symbols DXF writes with its own escapes, decoded before lookup.
  "°": "5:2,8 1,7 2,6 3,7 2,8",
  "±": "6:3,7 3,1|1,4 5,4|1,0 5,0",
  "⌀": "7:2,0 4,0 5,1 5,7 4,8 2,8 1,7 1,1 2,0|1,1 5,7",
};

export interface Glyph {
  /** Horizontal advance, in em units where cap height is 1. */
  advance: number;
  /** Open polylines. Each is a flat [x, y, x, y, ...] list. */
  strokes: Float32Array[];
}

const cache = new Map<string, Glyph | null>();

function decode(spec: string): Glyph {
  const [advanceText, strokeText = ""] = spec.split(":");
  const strokes: Float32Array[] = [];

  for (const stroke of strokeText.split("|")) {
    if (!stroke) continue;
    const points = stroke.split(" ").filter(Boolean);
    const flat = new Float32Array(points.length * 2);
    points.forEach((point, index) => {
      const [x, y] = point.split(",");
      flat[index * 2] = Number(x) / CAP_HEIGHT;
      flat[index * 2 + 1] = Number(y) / CAP_HEIGHT;
    });
    strokes.push(flat);
  }

  return { advance: Number(advanceText) / CAP_HEIGHT, strokes };
}

/** The glyph for a character, or null if the font has none. */
export function glyphFor(character: string): Glyph | null {
  const cached = cache.get(character);
  if (cached !== undefined) return cached;

  const spec = GLYPHS[character];
  const glyph = spec ? decode(spec) : null;
  cache.set(character, glyph);
  return glyph;
}

/** Advance width of a character, falling back to the space width. */
export function advanceFor(character: string): number {
  return (glyphFor(character) ?? glyphFor(" ")!).advance;
}

/** Width of a string in em units, before scaling by text height. */
export function measure(text: string): number {
  let width = 0;
  for (const character of text) width += advanceFor(character);
  return width;
}

export const FONT_METRICS = {
  capHeight: 1,
  xHeight: 5 / CAP_HEIGHT,
  descender: -2 / CAP_HEIGHT,
  /** Extra space between lines, as a multiple of height. */
  lineGap: 1.6,
} as const;

/** Characters the font can draw. Exposed for tests and diagnostics. */
export const SUPPORTED_CHARACTERS = Object.keys(GLYPHS);
