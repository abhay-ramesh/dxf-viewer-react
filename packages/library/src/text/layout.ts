import { decodeEntityText } from "./decode";
import { advanceFor, FONT_METRICS, glyphFor, measure } from "./strokeFont";

/** Where the anchor point sits relative to the text block. */
export type HorizontalAlign = "left" | "center" | "right";
export type VerticalAlign = "baseline" | "bottom" | "middle" | "top";

export interface TextLayoutOptions {
  text: string;
  /** Entity type, which decides how the string is decoded. */
  type?: string;
  /** Cap height in drawing units. */
  height: number;
  /** Anchor, in drawing units. */
  x: number;
  y: number;
  /** Rotation about the anchor, in radians. */
  rotation?: number;
  /** Horizontal stretch. DXF calls this the width factor. */
  widthFactor?: number;
  horizontalAlign?: HorizontalAlign;
  verticalAlign?: VerticalAlign;
}

export interface TextLayout {
  /** Flat segment pairs: [ax, ay, bx, by, ...] in drawing units. */
  segments: Float32Array;
  /** Bounding box of the laid-out text, before rotation. */
  width: number;
  height: number;
  /** The decoded lines, useful for search and accessibility. */
  lines: string[];
}

/**
 * Turn a text entity into line segments.
 *
 * The output is the same shape as every other entity's geometry, which is the
 * point: text then batches, hit-tests and snaps through the paths that
 * already exist, instead of needing a parallel system of textured quads.
 */
export function layoutText(options: TextLayoutOptions): TextLayout {
  const {
    text,
    type = "TEXT",
    height,
    x,
    y,
    rotation = 0,
    widthFactor = 1,
    horizontalAlign = "left",
    verticalAlign = "baseline",
  } = options;

  const decoded = decodeEntityText(type, text ?? "");
  const lines = decoded.lines;
  const scale = height * (decoded.heightFactor ?? 1);
  const lineHeight = scale * FONT_METRICS.lineGap;

  const lineWidths = lines.map((line) => measure(line) * scale * widthFactor);
  const blockWidth = Math.max(0, ...lineWidths);
  const blockHeight = lines.length ? (lines.length - 1) * lineHeight + scale : 0;

  // Vertical origin: the baseline of the first line.
  let originY = 0;
  if (verticalAlign === "top") originY = -scale;
  else if (verticalAlign === "middle") originY = -scale / 2;
  else if (verticalAlign === "bottom") originY = blockHeight - scale;

  const points: number[] = [];
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  /** Local text-space to world, applying alignment then rotation. */
  const place = (localX: number, localY: number): [number, number] => [
    x + localX * cos - localY * sin,
    y + localX * sin + localY * cos,
  ];

  lines.forEach((line, lineIndex) => {
    const lineWidth = lineWidths[lineIndex];
    let penX = 0;
    if (horizontalAlign === "center") penX = -lineWidth / 2;
    else if (horizontalAlign === "right") penX = -lineWidth;

    const baseline = originY - lineIndex * lineHeight;

    for (const character of line) {
      const glyph = glyphFor(character);
      const advance = advanceFor(character) * scale * widthFactor;

      if (glyph) {
        for (const stroke of glyph.strokes) {
          for (let i = 0; i + 3 < stroke.length; i += 2) {
            const [ax, ay] = place(
              penX + stroke[i] * scale * widthFactor,
              baseline + stroke[i + 1] * scale
            );
            const [bx, by] = place(
              penX + stroke[i + 2] * scale * widthFactor,
              baseline + stroke[i + 3] * scale
            );
            points.push(ax, ay, bx, by);
          }
        }
      }
      penX += advance;
    }
  });

  return {
    segments: new Float32Array(points),
    width: blockWidth,
    height: blockHeight,
    lines,
  };
}

/** DXF horizontal alignment codes (group 72). */
export function horizontalAlignFromCode(code: number | undefined): HorizontalAlign {
  switch (code) {
    case 1:
    case 4: // middle
      return "center";
    case 2:
      return "right";
    default:
      return "left";
  }
}

/** DXF vertical alignment codes (group 73). */
export function verticalAlignFromCode(code: number | undefined): VerticalAlign {
  switch (code) {
    case 1:
      return "bottom";
    case 2:
      return "middle";
    case 3:
      return "top";
    default:
      return "baseline";
  }
}

/**
 * MTEXT attachment points (group 71) pack both axes into one number:
 * 1-3 top, 4-6 middle, 7-9 bottom; left, centre, right within each.
 */
export function alignFromAttachment(attachment: number | undefined): {
  horizontal: HorizontalAlign;
  vertical: VerticalAlign;
} {
  const point = attachment && attachment >= 1 && attachment <= 9 ? attachment : 1;
  const horizontal: HorizontalAlign =
    point % 3 === 1 ? "left" : point % 3 === 2 ? "center" : "right";
  const vertical: VerticalAlign =
    point <= 3 ? "top" : point <= 6 ? "middle" : "bottom";
  return { horizontal, vertical };
}
