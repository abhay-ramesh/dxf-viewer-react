import { DxfDocument } from "../document/DxfDocument";
import { EntityId, IndexedEntity } from "../document/types";

export interface Part {
  id: EntityId;
  layer: string;
  /** Enclosed area in square drawing units. */
  area: number;
  /** Outline length in drawing units. */
  perimeter: number;
  /** Width and height of the part's bounding box. */
  width: number;
  height: number;
  /** How many closed loops sit inside this one. */
  holes: number;
  /** Combined area of those holes. */
  holeArea: number;
  /** Area minus holes: what the part actually weighs. */
  netArea: number;
  /** Perimeter plus every hole's perimeter: what the cutter travels. */
  cutLength: number;
}

export interface BlockCount {
  name: string;
  count: number;
}

export interface PartsReport {
  parts: Part[];
  /** Drawing units, when the file declared them. */
  units?: string;
  totals: {
    parts: number;
    area: number;
    netArea: number;
    cutLength: number;
    holes: number;
  };
  /** Per-layer subtotals, because layers usually mean material or operation. */
  byLayer: Array<{
    layer: string;
    parts: number;
    netArea: number;
    cutLength: number;
  }>;
  /** How many times each block is placed — a symbol and fixture count. */
  blocks: BlockCount[];
  /** Every piece of text in the drawing, in reading order. */
  notes: string[];
}

/**
 * What is actually in the drawing, as numbers someone can quote from.
 *
 * Most DXF viewers draw lines and stop. This one already separates closed
 * outlines from the holes inside them, and computes area and perimeter for
 * each — which happens to be exactly the information a laser shop, a
 * sheet-metal estimator or a CNC programmer needs and currently recovers by
 * hand.
 *
 * Nothing here is new geometry: it is the existing document, arranged for a
 * quote.
 */
export function buildPartsReport(
  document: DxfDocument,
  options: { units?: string } = {}
): PartsReport {
  const fills = document.filter(
    (entity) => (entity.derived.triangles?.length ?? 0) > 0 && !!entity.derived.area
  );

  const parts: Part[] = fills
    .map(toPart)
    .sort((a, b) => b.netArea - a.netArea);

  const totals = parts.reduce(
    (sum, part) => ({
      parts: sum.parts + 1,
      area: sum.area + part.area,
      netArea: sum.netArea + part.netArea,
      cutLength: sum.cutLength + part.cutLength,
      holes: sum.holes + part.holes,
    }),
    { parts: 0, area: 0, netArea: 0, cutLength: 0, holes: 0 }
  );

  const layerTotals = new Map<
    string,
    { layer: string; parts: number; netArea: number; cutLength: number }
  >();
  for (const part of parts) {
    const entry = layerTotals.get(part.layer) ?? {
      layer: part.layer,
      parts: 0,
      netArea: 0,
      cutLength: 0,
    };
    entry.parts++;
    entry.netArea += part.netArea;
    entry.cutLength += part.cutLength;
    layerTotals.set(part.layer, entry);
  }

  return {
    parts,
    units: options.units && options.units !== "Unitless" ? options.units : undefined,
    totals,
    byLayer: [...layerTotals.values()].sort((a, b) => b.netArea - a.netArea),
    blocks: countBlocks(document),
    notes: collectNotes(document),
  };
}

function toPart(entity: IndexedEntity): Part {
  const { bbox, area = 0, length: perimeter = 0 } = entity.derived;
  // The shape builder already separated outlines from the holes inside them,
  // so the counts are exact rather than inferred from bounding boxes.
  const holes = entity.derived.holes ?? 0;
  const holeArea = entity.derived.holeArea ?? 0;
  const holePerimeter = entity.derived.holePerimeter ?? 0;

  return {
    id: entity.id,
    layer: entity.layer,
    area,
    perimeter,
    width: bbox.max.x - bbox.min.x,
    height: bbox.max.y - bbox.min.y,
    holes,
    holeArea,
    netArea: Math.max(0, area - holeArea),
    cutLength: perimeter + holePerimeter,
  };
}

function countBlocks(document: DxfDocument): BlockCount[] {
  // An INSERT expands into its block's entities, so the block's name is
  // counted once per placement by looking at distinct placements rather than
  // at every expanded child.
  const perBlock = new Map<string, Set<string>>();
  for (const entity of document.all()) {
    if (!entity.blockName) continue;
    const placements = perBlock.get(entity.blockName) ?? new Set<string>();
    // Entities of one placement share an origin; distinct placements do not.
    placements.add(
      `${entity.derived.bbox.min.x.toFixed(4)}:${entity.derived.bbox.min.y.toFixed(4)}`
    );
    perBlock.set(entity.blockName, placements);
  }

  return [...perBlock.entries()]
    .map(([name, placements]) => ({ name, count: placements.size }))
    .sort((a, b) => b.count - a.count);
}

function collectNotes(document: DxfDocument): string[] {
  return document
    .filter((entity) => !!entity.text?.trim())
    // Top to bottom, then left to right: how a drawing is read.
    .sort(
      (a, b) =>
        b.derived.bbox.max.y - a.derived.bbox.max.y ||
        a.derived.bbox.min.x - b.derived.bbox.min.x
    )
    .map((entity) => entity.text!.trim());
}

/** The report as CSV, which is how an estimate leaves the building. */
export function partsReportToCsv(report: PartsReport): string {
  const unit = report.units ? ` (${report.units})` : "";
  const rows = [
    [
      "part",
      "layer",
      `width${unit}`,
      `height${unit}`,
      `area${unit}2`,
      `holes`,
      `net area${unit}2`,
      `cut length${unit}`,
    ].join(","),
  ];

  report.parts.forEach((part, index) => {
    rows.push(
      [
        index + 1,
        escapeCsv(part.layer),
        part.width.toFixed(3),
        part.height.toFixed(3),
        part.area.toFixed(3),
        part.holes,
        part.netArea.toFixed(3),
        part.cutLength.toFixed(3),
      ].join(",")
    );
  });

  rows.push(
    [
      "TOTAL",
      "",
      "",
      "",
      report.totals.area.toFixed(3),
      report.totals.holes,
      report.totals.netArea.toFixed(3),
      report.totals.cutLength.toFixed(3),
    ].join(",")
  );

  return rows.join("\n");
}

function escapeCsv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
