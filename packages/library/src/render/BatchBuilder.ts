import * as THREE from "three";
import { DxfDocument } from "../document/DxfDocument";
import { EntityId, IndexedEntity } from "../document/types";
import { StyleResolver } from "../style/StyleResolver";
import { InteractionState } from "../style/types";

/** Where one entity's vertices live inside a shared buffer. */
export interface BatchRange {
  batch: Batch;
  start: number;
  count: number;
  /**
   * The colour this entity was built with.
   *
   * Remembered rather than recomputed, so returning to "normal" restores
   * exactly what was drawn — the same reason the unbatched path remembered
   * the base material instead of asking the resolver again.
   */
  baseColor: [number, number, number];
}

export interface Batch {
  /** The layer this batch belongs to, so visibility still works per layer. */
  layer: string;
  kind: "stroke" | "fill";
  object: THREE.LineSegments | THREE.Mesh;
  geometry: THREE.BufferGeometry;
  colors: THREE.BufferAttribute;
}

export interface BatchResult {
  /** One group per layer, each holding that layer's batches. */
  layers: Record<string, THREE.Group>;
  batches: Batch[];
  ranges: Map<EntityId, BatchRange>;
}

/**
 * Merge every entity into a handful of buffers.
 *
 * The viewer drew one object per entity: 940 draw calls for 31,000 vertices,
 * which is the wrong way round — that many vertices is nothing for a GPU, and
 * that many draw calls is most of the frame. Merging by layer turns it into
 * one call per layer.
 *
 * The thing that makes this possible without losing per-entity behaviour is
 * that colour lives in a **vertex attribute** rather than in a material.
 * Selecting an entity rewrites its slice of that attribute, so a thousand
 * entities can share one buffer and one material and still highlight
 * individually. This is exactly why selection had to stop being a swapped
 * material first: there is no per-object material left to swap.
 */
export function buildBatches(
  document: DxfDocument,
  style: StyleResolver
): BatchResult {
  const byLayer = new Map<string, IndexedEntity[]>();
  for (const entity of document.all()) {
    const bucket = byLayer.get(entity.layer);
    if (bucket) bucket.push(entity);
    else byLayer.set(entity.layer, [entity]);
  }

  const layers: Record<string, THREE.Group> = {};
  const batches: Batch[] = [];
  const ranges = new Map<EntityId, BatchRange>();

  for (const [layer, entities] of byLayer) {
    const group = new THREE.Group();
    group.name = `layer:${layer}`;
    group.userData = { name: layer };
    layers[layer] = group;

    const strokes = entities.filter((e) => e.derived.segments.length > 0);
    const fills = entities.filter((e) => e.derived.triangles?.length);

    const strokeBatch = buildStrokeBatch(layer, strokes, style, ranges);
    if (strokeBatch) {
      group.add(strokeBatch.object);
      batches.push(strokeBatch);
    }

    const fillBatch = buildFillBatch(layer, fills, style, ranges);
    if (fillBatch) {
      group.add(fillBatch.object);
      batches.push(fillBatch);
    }
  }

  return { layers, batches, ranges };
}

function buildStrokeBatch(
  layer: string,
  entities: IndexedEntity[],
  style: StyleResolver,
  ranges: Map<EntityId, BatchRange>
): Batch | null {
  let vertexCount = 0;
  for (const entity of entities) vertexCount += entity.derived.segments.length / 2;
  if (!vertexCount) return null;

  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);

  const geometry = new THREE.BufferGeometry();
  const batch: Batch = {
    layer,
    kind: "stroke",
    geometry,
    colors: new THREE.BufferAttribute(colors, 3),
    object: null as unknown as THREE.LineSegments,
  };

  let vertex = 0;
  for (const entity of entities) {
    const segments = entity.derived.segments;
    const start = vertex;
    const color = resolveColor(entity, style, "normal");

    for (let i = 0; i + 1 < segments.length; i += 2) {
      positions[vertex * 3] = segments[i];
      positions[vertex * 3 + 1] = segments[i + 1];
      positions[vertex * 3 + 2] = 0;
      colors[vertex * 3] = color.r;
      colors[vertex * 3 + 1] = color.g;
      colors[vertex * 3 + 2] = color.b;
      vertex++;
    }

    ranges.set(entity.id, {
      batch,
      start,
      count: vertex - start,
      baseColor: [color.r, color.g, color.b],
    });
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", batch.colors);

  batch.object = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ vertexColors: true })
  );
  batch.object.name = `batch:${layer}:stroke`;
  batch.object.matrixAutoUpdate = false;
  return batch;
}

function buildFillBatch(
  layer: string,
  entities: IndexedEntity[],
  style: StyleResolver,
  ranges: Map<EntityId, BatchRange>
): Batch | null {
  let vertexCount = 0;
  for (const entity of entities) {
    vertexCount += (entity.derived.triangles?.length ?? 0) / 2;
  }
  if (!vertexCount) return null;

  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);

  const geometry = new THREE.BufferGeometry();
  const batch: Batch = {
    layer,
    kind: "fill",
    geometry,
    colors: new THREE.BufferAttribute(colors, 3),
    object: null as unknown as THREE.Mesh,
  };

  let vertex = 0;
  for (const entity of entities) {
    const triangles = entity.derived.triangles!;
    const start = vertex;
    const color = resolveColor(entity, style, "normal");

    for (let i = 0; i + 1 < triangles.length; i += 2) {
      positions[vertex * 3] = triangles[i];
      positions[vertex * 3 + 1] = triangles[i + 1];
      // Fills sit just behind strokes so outlines stay legible on top.
      positions[vertex * 3 + 2] = -0.001;
      colors[vertex * 3] = color.r;
      colors[vertex * 3 + 1] = color.g;
      colors[vertex * 3 + 2] = color.b;
      vertex++;
    }

    ranges.set(entity.id, {
      batch,
      start,
      count: vertex - start,
      baseColor: [color.r, color.g, color.b],
    });
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", batch.colors);

  batch.object = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    })
  );
  batch.object.name = `batch:${layer}:fill`;
  batch.object.matrixAutoUpdate = false;
  return batch;
}

const _color = new THREE.Color();

function resolveColor(
  entity: IndexedEntity,
  style: StyleResolver,
  state: InteractionState
): THREE.Color {
  const isFill = (entity.derived.triangles?.length ?? 0) > 0;
  const resolved = style.resolve(
    {
      kind: isFill ? "fill" : "stroke",
      type: entity.type,
      layer: entity.layer,
      colorIndex: (entity.source as { colorIndex?: number }).colorIndex,
      rgb: (entity.source as { color?: number }).color,
      shapeIndex: entity.shapeIndex,
    },
    state
  );
  return _color.setHex(resolved.color);
}

/**
 * Recolour one entity in place.
 *
 * Writing into the shared attribute is what replaces swapping a material, and
 * costs only that entity's vertices — a handful — regardless of how many
 * entities share the buffer.
 */
export function paintEntity(
  entity: IndexedEntity,
  range: BatchRange,
  style: StyleResolver,
  state: InteractionState
): void {
  const [r, g, b] =
    state === "normal"
      ? range.baseColor
      : toTriple(resolveColor(entity, style, state));

  const array = range.batch.colors.array as Float32Array;
  for (let i = 0; i < range.count; i++) {
    const offset = (range.start + i) * 3;
    array[offset] = r;
    array[offset + 1] = g;
    array[offset + 2] = b;
  }
  range.batch.colors.needsUpdate = true;
}

function toTriple(color: THREE.Color): [number, number, number] {
  return [color.r, color.g, color.b];
}
