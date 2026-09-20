import DxfParser, { IEntity } from "dxf-parser";
import {
  createOrderedLoopsFromConnectivity,
  separateOuterLoopsFromHoles,
} from "../processDxf";
import { PreparedDrawing, PreparedLoop } from "./types";

/**
 * Parse a DXF and work out its closed loops, producing only plain data.
 *
 * Everything here is deliberately free of Three.js and of the DOM, and every
 * value it returns is structured-cloneable, so this function can run on a
 * worker unchanged. Geometry construction — the part that must touch
 * Three.js — stays on the thread that owns the renderer.
 */
export function prepareDrawing(
  content: string,
  options: { showShapeColors?: boolean } = {}
): PreparedDrawing {
  const { showShapeColors = true } = options;

  if (!content.trim()) {
    return { data: { entities: [] }, loops: null };
  }

  let data;
  try {
    data = new DxfParser().parseSync(content) as PreparedDrawing["data"];
  } catch (error) {
    return {
      data: { entities: [] },
      loops: null,
      parseError:
        error instanceof Error ? error.message : "Failed to parse DXF",
    };
  }

  if (!showShapeColors) return { data, loops: null };

  const entities = (data.entities ?? []) as IEntity[];
  const indexOf = new Map<IEntity, number>();
  entities.forEach((entity, index) => indexOf.set(entity, index));

  const ordered = createOrderedLoopsFromConnectivity({ entities });
  const { outerLoops, holes } = separateOuterLoopsFromHoles(ordered);

  /** Replace object references with indices so this survives a clone. */
  const serialise = (loop: {
    entities: IEntity[];
    vertices: Array<{ x: number; y: number }>;
    area: number;
    perimeter: number;
  }): PreparedLoop => ({
    entityIndices: loop.entities
      .map((entity) => indexOf.get(entity))
      .filter((index): index is number => index !== undefined),
    vertices: loop.vertices,
    area: loop.area,
    perimeter: loop.perimeter,
  });

  return {
    data,
    loops: {
      outer: outerLoops.map(serialise),
      holes: holes.map(serialise),
    },
  };
}

/** Turn index-based loops back into entity references on the receiving side. */
export function rehydrateLoops(
  loops: PreparedLoop[],
  entities: IEntity[]
): Array<{
  entities: IEntity[];
  vertices: Array<{ x: number; y: number }>;
  area: number;
  perimeter: number;
}> {
  return loops.map((loop) => ({
    entities: loop.entityIndices
      .map((index) => entities[index])
      .filter((entity): entity is IEntity => entity !== undefined),
    vertices: loop.vertices,
    area: loop.area,
    perimeter: loop.perimeter,
  }));
}
