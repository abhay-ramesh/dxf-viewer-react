/**
 * Turn DXF's two text encodings into plain lines.
 *
 * TEXT uses `%%`-escapes inherited from the earliest versions of the format.
 * MTEXT adds a richer inline language for fonts, heights, stacking and
 * paragraph breaks. Neither is optional: the string on a dimension is
 * literally `\A1;%%C22.00`, and rendering that verbatim shows the reader the
 * escape codes instead of the measurement.
 */

/** `%%`-escapes, shared by TEXT and MTEXT. */
const OVERRIDES: Record<string, string> = {
  c: "⌀", // %%c — diameter
  d: "°", // %%d — degrees
  p: "±", // %%p — plus/minus
  "%": "%", // %%% — a literal percent
  o: "", // %%o — overscore toggle, not rendered
  u: "", // %%u — underscore toggle, not rendered
};

export interface DecodedText {
  /** One entry per line; MTEXT can contain paragraph breaks. */
  lines: string[];
  /** Height multiplier requested inline by `\H`, if any. */
  heightFactor?: number;
}

/** Resolve `%%` escapes. Applies to both TEXT and MTEXT. */
export function decodeOverrides(raw: string): string {
  return raw.replace(/%%(.)/g, (whole, code: string) => {
    const replacement = OVERRIDES[code.toLowerCase()];
    return replacement === undefined ? whole : replacement;
  });
}

/**
 * Decode a TEXT entity's string.
 *
 * TEXT is a single line: any `\P` in it is literal, not a break.
 */
export function decodeText(raw: string): DecodedText {
  return { lines: [decodeOverrides(raw)] };
}

/**
 * Decode an MTEXT entity's string.
 *
 * Handles the codes that change what the reader sees, and strips the ones
 * that only change how it looks in a way a stroke font cannot express
 * (fonts, colour, obliquing, tracking).
 */
export function decodeMText(raw: string): DecodedText {
  let heightFactor: number | undefined;
  let out = "";

  for (let i = 0; i < raw.length; i++) {
    const character = raw[i];

    if (character === "\\") {
      const code = raw[i + 1];

      // Escaped literals.
      if (code === "\\" || code === "{" || code === "}") {
        out += code;
        i++;
        continue;
      }

      // A paragraph break is the one code that changes the layout.
      if (code === "P") {
        out += "\n";
        i++;
        continue;
      }

      // Non-breaking space.
      if (code === "~") {
        out += " ";
        i++;
        continue;
      }

      // `\S upper ^ lower ;` — a stacked fraction or tolerance. Rendered on
      // one line as `upper/lower`, which reads correctly even though it is
      // not stacked.
      if (code === "S") {
        const end = raw.indexOf(";", i + 2);
        const body = raw.slice(i + 2, end === -1 ? undefined : end);
        out += body.replace(/[\^#]/, "/");
        i = end === -1 ? raw.length : end;
        continue;
      }

      // `\H2.5x;` or `\H2.5;` — a height change. Remembered, not applied
      // per-run: a stroke font drawn at one size per entity is close enough,
      // and the alternative is a layout engine.
      if (code === "H") {
        const end = raw.indexOf(";", i + 2);
        const value = Number.parseFloat(raw.slice(i + 2, end));
        if (Number.isFinite(value) && !heightFactor) heightFactor = value;
        i = end === -1 ? raw.length : end;
        continue;
      }

      // Everything else that takes a `;`-terminated argument: \A \C \f \F
      // \Q \T \W \pxq and friends. Consumed and dropped.
      if (code && /[ACcFfQTWpq]/.test(code)) {
        const end = raw.indexOf(";", i + 2);
        i = end === -1 ? raw.length : end;
        continue;
      }

      // An unknown escape: drop the backslash, keep the character.
      i++;
      if (code) out += code;
      continue;
    }

    // Grouping braces carry formatting scope, not content.
    if (character === "{" || character === "}") continue;

    out += character;
  }

  return {
    lines: decodeOverrides(out).split("\n"),
    heightFactor,
  };
}

/** Decode by entity type. */
export function decodeEntityText(type: string, raw: string): DecodedText {
  return type === "MTEXT" ? decodeMText(raw) : decodeText(raw);
}
