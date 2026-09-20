import { describe, expect, it } from "bun:test";
import {
  decodeMText,
  decodeOverrides,
  decodeText,
} from "../src/text/decode";
import {
  alignFromAttachment,
  horizontalAlignFromCode,
  layoutText,
  verticalAlignFromCode,
} from "../src/text/layout";
import {
  advanceFor,
  glyphFor,
  measure,
  SUPPORTED_CHARACTERS,
} from "../src/text/strokeFont";
import { loadFixture, run } from "./helpers";

describe("stroke font", () => {
  it("has a glyph for every printable ASCII character", () => {
    for (let code = 32; code <= 126; code++) {
      const character = String.fromCharCode(code);
      expect(glyphFor(character)).not.toBeNull();
    }
  });

  it("covers the symbols DXF escapes produce", () => {
    for (const symbol of ["°", "±", "⌀"]) {
      expect(glyphFor(symbol)).not.toBeNull();
    }
  });

  it("returns null for characters it cannot draw", () => {
    expect(glyphFor("漢")).toBeNull();
    // Missing characters still advance, so the rest of the line stays put.
    expect(advanceFor("漢")).toBe(advanceFor(" "));
  });

  it("normalises glyphs so cap height is 1", () => {
    for (const character of SUPPORTED_CHARACTERS) {
      const glyph = glyphFor(character)!;
      for (const stroke of glyph.strokes) {
        for (let i = 1; i < stroke.length; i += 2) {
          // Ascenders reach 1, descenders reach -0.25.
          expect(stroke[i]).toBeLessThanOrEqual(1.0001);
          expect(stroke[i]).toBeGreaterThanOrEqual(-0.2501);
        }
      }
    }
  });

  it("draws space as advance without strokes", () => {
    expect(glyphFor(" ")!.strokes).toEqual([]);
    expect(advanceFor(" ")).toBeGreaterThan(0);
  });

  it("measures a string as the sum of its advances", () => {
    expect(measure("AB")).toBeCloseTo(advanceFor("A") + advanceFor("B"), 10);
    expect(measure("")).toBe(0);
  });
});

describe("decoding DXF text", () => {
  it("resolves %% escapes", () => {
    expect(decodeOverrides("%%c22")).toBe("⌀22");
    expect(decodeOverrides("45%%d")).toBe("45°");
    expect(decodeOverrides("%%p0.5")).toBe("±0.5");
    expect(decodeOverrides("100%%%")).toBe("100%");
  });

  it("accepts either case", () => {
    expect(decodeOverrides("%%C1 %%D2")).toBe("⌀1 °2");
  });

  it("leaves unknown escapes alone", () => {
    expect(decodeOverrides("%%z")).toBe("%%z");
  });

  it("treats TEXT as a single line", () => {
    expect(decodeText("A\\PB").lines).toEqual(["A\\PB"]);
  });

  it("breaks MTEXT paragraphs", () => {
    expect(decodeMText("FIRST\\PSECOND").lines).toEqual(["FIRST", "SECOND"]);
  });

  it("strips the alignment code dimension text carries", () => {
    // This is verbatim what a real dimension contains.
    expect(decodeMText("\\A1;%%C22.00").lines).toEqual(["⌀22.00"]);
  });

  it("drops formatting codes that a stroke font cannot express", () => {
    expect(decodeMText("{\\fArial|b0|i0;HELLO}").lines).toEqual(["HELLO"]);
    expect(decodeMText("\\C1;RED").lines).toEqual(["RED"]);
    expect(decodeMText("\\W0.8;WIDE").lines).toEqual(["WIDE"]);
  });

  it("reads an inline height factor", () => {
    expect(decodeMText("\\H2.5x;BIG").heightFactor).toBe(2.5);
  });

  it("flattens stacked fractions into something readable", () => {
    expect(decodeMText("\\S1^2;").lines).toEqual(["1/2"]);
    expect(decodeMText("\\S+0.1#-0.1;").lines).toEqual(["+0.1/-0.1"]);
  });

  it("unescapes literal braces and backslashes", () => {
    expect(decodeMText("\\{brace\\}").lines).toEqual(["{brace}"]);
    expect(decodeMText("back\\\\slash").lines).toEqual(["back\\slash"]);
  });

  it("turns a non-breaking space into a space", () => {
    expect(decodeMText("A\\~B").lines).toEqual(["A B"]);
  });

  it("survives a malformed escape at the end of the string", () => {
    expect(() => decodeMText("text\\H")).not.toThrow();
    expect(() => decodeMText("text\\")).not.toThrow();
  });
});

describe("alignment codes", () => {
  it("maps DXF horizontal codes", () => {
    expect(horizontalAlignFromCode(0)).toBe("left");
    expect(horizontalAlignFromCode(1)).toBe("center");
    expect(horizontalAlignFromCode(2)).toBe("right");
    expect(horizontalAlignFromCode(4)).toBe("center"); // middle
    expect(horizontalAlignFromCode(undefined)).toBe("left");
  });

  it("maps DXF vertical codes", () => {
    expect(verticalAlignFromCode(0)).toBe("baseline");
    expect(verticalAlignFromCode(1)).toBe("bottom");
    expect(verticalAlignFromCode(2)).toBe("middle");
    expect(verticalAlignFromCode(3)).toBe("top");
  });

  it("unpacks MTEXT attachment points into both axes", () => {
    expect(alignFromAttachment(1)).toEqual({
      horizontal: "left",
      vertical: "top",
    });
    expect(alignFromAttachment(5)).toEqual({
      horizontal: "center",
      vertical: "middle",
    });
    expect(alignFromAttachment(9)).toEqual({
      horizontal: "right",
      vertical: "bottom",
    });
    expect(alignFromAttachment(undefined)).toEqual({
      horizontal: "left",
      vertical: "top",
    });
  });
});

describe("text layout", () => {
  const bounds = (segments: Float32Array) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < segments.length; i += 2) {
      minX = Math.min(minX, segments[i]);
      maxX = Math.max(maxX, segments[i]);
      minY = Math.min(minY, segments[i + 1]);
      maxY = Math.max(maxY, segments[i + 1]);
    }
    return { minX, maxX, minY, maxY };
  };

  it("produces segments, not a rectangle", () => {
    const layout = layoutText({ text: "A", height: 10, x: 0, y: 0 });
    // The letter A is three strokes, not the four of a box.
    expect(layout.segments.length / 4).toBeGreaterThan(4);
  });

  it("puts the baseline at the anchor and cap height above it", () => {
    const { segments } = layoutText({ text: "H", height: 10, x: 0, y: 0 });
    const box = bounds(segments);
    expect(box.minY).toBeCloseTo(0, 6);
    expect(box.maxY).toBeCloseTo(10, 6);
  });

  it("scales with the text height", () => {
    const small = layoutText({ text: "MM", height: 5, x: 0, y: 0 });
    const large = layoutText({ text: "MM", height: 10, x: 0, y: 0 });
    expect(large.width).toBeCloseTo(small.width * 2, 6);
  });

  it("stretches by the width factor without changing height", () => {
    const narrow = layoutText({ text: "MM", height: 10, x: 0, y: 0 });
    const wide = layoutText({
      text: "MM",
      height: 10,
      x: 0,
      y: 0,
      widthFactor: 2,
    });
    expect(wide.width).toBeCloseTo(narrow.width * 2, 6);
    expect(bounds(wide.segments).maxY).toBeCloseTo(
      bounds(narrow.segments).maxY,
      6
    );
  });

  it("centres on the anchor when asked", () => {
    const { segments } = layoutText({
      text: "WIDE",
      height: 10,
      x: 100,
      y: 0,
      horizontalAlign: "center",
    });
    const box = bounds(segments);
    expect((box.minX + box.maxX) / 2).toBeCloseTo(100, 4);
  });

  it("right-aligns to the anchor", () => {
    const { segments } = layoutText({
      text: "WIDE",
      height: 10,
      x: 100,
      y: 0,
      horizontalAlign: "right",
    });
    expect(bounds(segments).maxX).toBeLessThanOrEqual(100.001);
  });

  it("hangs from the anchor when top-aligned", () => {
    const { segments } = layoutText({
      text: "H",
      height: 10,
      x: 0,
      y: 50,
      verticalAlign: "top",
    });
    expect(bounds(segments).maxY).toBeCloseTo(50, 4);
  });

  it("rotates about the anchor", () => {
    const upright = layoutText({ text: "AB", height: 10, x: 0, y: 0 });
    const turned = layoutText({
      text: "AB",
      height: 10,
      x: 0,
      y: 0,
      rotation: Math.PI / 2,
    });
    const a = bounds(upright.segments);
    const b = bounds(turned.segments);
    // What was wide becomes tall.
    expect(b.maxY - b.minY).toBeCloseTo(a.maxX - a.minX, 4);
    expect(b.maxX - b.minX).toBeCloseTo(a.maxY - a.minY, 4);
  });

  it("stacks MTEXT lines downward", () => {
    const layout = layoutText({
      text: "ONE\\PTWO",
      type: "MTEXT",
      height: 10,
      x: 0,
      y: 0,
    });
    expect(layout.lines).toEqual(["ONE", "TWO"]);
    // Two lines occupy more than one line's height.
    expect(layout.height).toBeGreaterThan(10);
  });

  it("returns nothing for an empty string", () => {
    expect(layoutText({ text: "", height: 10, x: 0, y: 0 }).segments.length).toBe(
      0
    );
    expect(
      layoutText({ text: "   ", height: 10, x: 0, y: 0 }).segments.length
    ).toBe(0);
  });
});

describe("text in a drawing", () => {
  it("draws every text entity in the fixture", async () => {
    const { document, report } = run(await loadFixture("text.dxf"));
    const texts = document.filter((e) => e.type === "TEXT" || e.type === "MTEXT");
    expect(texts.length).toBe(5);
    expect(report.isComplete).toBe(true);
  });

  it("keeps the decoded string on the entity, so it survives batching", async () => {
    const { document } = run(await loadFixture("text.dxf"));
    const strings = document.filter((e) => e.text).map((e) => e.text);
    expect(strings).toContain("PLATE A");
    expect(strings).toContain("R12.5 °45 ⌀30");
    expect(strings).toContain("⌀22.00");
  });

  it("makes the drawing's text searchable", async () => {
    const { document } = run(await loadFixture("text.dxf"));
    expect(document.findText("plate").length).toBe(1);
    expect(document.findText("LINE").length).toBe(1);
    expect(document.findText("nothing here").length).toBe(0);
    expect(document.findText("").length).toBe(0);
  });

  it("honours alignment recorded in the file", async () => {
    const { document } = run(await loadFixture("text.dxf"));
    // "R12.5 °45 ⌀30" is centre/middle aligned on its second point (50, 20).
    const centred = document.filter((e) => e.text?.startsWith("R12.5"))[0];
    const box = centred.derived.bbox;
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(50, 0);
    expect((box.min.y + box.max.y) / 2).toBeCloseTo(20, 0);
  });

  it("rotates text recorded at an angle", async () => {
    const { document } = run(await loadFixture("text.dxf"));
    const rotated = document.filter((e) => e.text === "ROTATED")[0];
    const box = rotated.derived.bbox;
    // Ninety degrees: taller than it is wide.
    expect(box.max.y - box.min.y).toBeGreaterThan(box.max.x - box.min.x);
  });

  it("gives text geometry that batches like everything else", async () => {
    const { document } = run(await loadFixture("text.dxf"));
    for (const entity of document.filter((e) => e.text)) {
      expect(entity.derived.segments.length).toBeGreaterThan(0);
      expect(entity.batchRange).toBeDefined();
    }
  });
});
