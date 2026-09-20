/**
 * Distinct colours for generated fills, when the caller has not chosen any.
 *
 * Walking the hue circle by the golden angle keeps consecutive shapes far
 * apart in hue no matter how many there are, which is what makes adjacent
 * parts in a nest legible.
 */
export function autoFillColor(index: number): number {
  const hue = (index * 137.508) % 360;
  const saturation = 0.7 + (index % 3) * 0.1;
  const lightness = 0.5 + (index % 2) * 0.2;
  return hslToRgb(hue, saturation, lightness);
}

export function hslToRgb(h: number, s: number, l: number): number {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

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
