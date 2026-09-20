import DxfParser, {
  IArcEntity,
  ICircleEntity,
  IEllipseEntity,
  IEntity,
  IInsertEntity,
  ILineEntity,
  ILwpolylineEntity,
  IPointEntity,
  IPolylineEntity,
  ISplineEntity,
  ITextEntity,
} from "dxf-parser";
import * as THREE from "three";
import {
  processArc,
  processCircle,
  processEllipse,
  processLine,
  processPoint,
  processPolyline,
  processSpline,
  processText,
} from "./processors";
import { DxfAnalyzer } from "./utils/DxfAnalyzer";
import { DxfDocument } from "./document/DxfDocument";
import { deriveGeometry, deriveMeshGeometry } from "./document/derive";
import { BatchResult, buildBatches } from "./render/BatchBuilder";
import { rehydrateLoops } from "./pipeline/prepare";
import { PreparedDrawing } from "./pipeline/types";
import { StyleResolver } from "./style/StyleResolver";

// Type guards to safely check entity types and properties
function isLineEntity(entity: IEntity): entity is ILineEntity {
  return entity.type === "LINE";
}

function isArcEntity(entity: IEntity): entity is IArcEntity {
  return entity.type === "ARC";
}

function isEllipseEntity(entity: IEntity): entity is IEllipseEntity {
  return entity.type === "ELLIPSE";
}

function isPointEntity(entity: IEntity): entity is IPointEntity {
  return entity.type === "POINT";
}

function isTextEntity(entity: IEntity): entity is ITextEntity {
  return entity.type === "TEXT" || entity.type === "MTEXT";
}

function isPolylineEntity(entity: IEntity): entity is IPolylineEntity {
  return entity.type === "POLYLINE";
}

function isLwpolylineEntity(entity: IEntity): entity is ILwpolylineEntity {
  return entity.type === "LWPOLYLINE";
}

function isSplineEntity(entity: IEntity): entity is ISplineEntity {
  return entity.type === "SPLINE";
}

// Evaluate a point on the B-spline curve using De Boor's algorithm
function evaluateSplinePoint(
  t: number,
  controlPoints: { x: number; y: number; z?: number }[],
  degree: number,
  knots: number[]
): { x: number; y: number } | null {
  // Basic validation
  if (!controlPoints.length || !knots.length || degree < 1) return null;

  // Clamp t to valid range
  const t0 = knots[0] ?? 0;
  const tEnd = knots[knots.length - 1] ?? 0;
  t = Math.max(t0, Math.min(t, tEnd));

  // Find knot span
  let span = -1;
  for (let i = degree; i <= knots.length - degree - 2; i++) {
    const k1 = knots[i];
    const k2 = knots[i + 1];
    if (k1 !== undefined && k2 !== undefined && t >= k1 && t < k2) {
      span = i;
      break;
    }
  }

  // Handle end case
  if (t === tEnd) {
    span = knots.length - degree - 2;
  }

  // Validate span
  if (span < degree || span > controlPoints.length - 1) return null;

  // Initialize points array for De Boor's algorithm
  const points: Array<Array<{ x: number; y: number; z: number }>> = Array(
    degree + 1
  )
    .fill(null)
    .map(() => []);

  // Load initial points
  for (let i = 0; i <= degree; i++) {
    const idx = span - degree + i;
    if (idx < 0 || idx >= controlPoints.length) continue;
    const cp = controlPoints[idx];
    points[0][i] = { x: cp.x, y: cp.y, z: cp.z || 0 };
  }

  // Perform De Boor's algorithm
  for (let r = 1; r <= degree; r++) {
    for (let i = 0; i <= degree - r; i++) {
      const k1 = knots[span + 1 + i];
      const k2 = knots[span - degree + i + r];
      if (k1 === undefined || k2 === undefined) continue;

      const alphaDenom = k1 - k2;
      if (Math.abs(alphaDenom) < 1e-10) {
        points[r][i] = { ...points[r - 1][i] };
        continue;
      }

      const alpha = (t - k2) / alphaDenom;
      const p1 = points[r - 1][i];
      const p2 = points[r - 1][i + 1];
      if (!p1 || !p2) continue;

      points[r][i] = {
        x: (1 - alpha) * p1.x + alpha * p2.x,
        y: (1 - alpha) * p1.y + alpha * p2.y,
        z: (1 - alpha) * p1.z + alpha * p2.z,
      };
    }
  }

  return points[degree][0] || null;
}

function isCircleEntity(entity: IEntity): entity is ICircleEntity {
  return entity.type === "CIRCLE";
}


export interface ProcessDxfResult {
  /** Queryable model of the drawing: identity, derived geometry, lookups. */
  document: DxfDocument;
  group: THREE.Group;
  stats: Record<string, number | string>;
  entities: IEntity[];
  layers: Record<string, THREE.Group>;
  layerTable: Record<string, { color: number; colorIndex?: number }>;
  parseError: Error | null;
  dxfHeader?: Record<string, unknown>;
}

// Helper function to resolve shape color from shapeColors parameter
function resolveShapeColor(
  index: number,
  shapeColors?: 
    | string 
    | number 
    | THREE.Color 
    | Array<string | number | THREE.Color> 
    | ((index: number) => string | number | THREE.Color)
): number {
  // If shapeColors is provided, use it
  if (shapeColors !== undefined) {
    if (typeof shapeColors === 'function') {
      // Function: call with index
      const color = shapeColors(index);
      return normalizeColorToNumber(color);
    } else if (Array.isArray(shapeColors)) {
      // Array: cycle through colors
      const color = shapeColors[index % shapeColors.length];
      return normalizeColorToNumber(color);
    } else {
      // Single color: apply to all shapes
      return normalizeColorToNumber(shapeColors);
    }
  }
  
  // Fallback to auto-generated contrasting color
  return generateContrastingColor(index);
}

// Normalize color to number (hex format)
function normalizeColorToNumber(
  color: string | number | THREE.Color
): number {
  if (typeof color === 'number') {
    return color;
  }
  if (typeof color === 'string') {
    // Handle hex strings like "#ff0000" or "0xff0000"
    if (color.startsWith('#')) {
      return parseInt(color.slice(1), 16);
    }
    if (color.startsWith('0x') || color.startsWith('0X')) {
      return parseInt(color.slice(2), 16);
    }
    // Try parsing as hex number
    const parsed = parseInt(color, 16);
    if (!isNaN(parsed)) {
      return parsed;
    }
    // Fallback: try to create THREE.Color and convert
    try {
      const threeColor = new THREE.Color(color);
      return threeColor.getHex();
    } catch {
      return 0x0000ff; // Default blue
    }
  }
  if (color instanceof THREE.Color) {
    return color.getHex();
  }
  return 0x0000ff; // Default blue
}

// Generate random contrasting colors
function generateContrastingColor(index: number): number {
  const hue = (index * 137.508) % 360; // Golden angle approximation for good distribution
  const saturation = 0.7 + (index % 3) * 0.1; // Vary saturation 70-90%
  const lightness = 0.5 + (index % 2) * 0.2; // Vary lightness 50-70%

  // Convert HSL to RGB
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;

  let r = 0,
    g = 0,
    b = 0;
  if (hue >= 0 && hue < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (hue >= 60 && hue < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (hue >= 120 && hue < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (hue >= 180 && hue < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (hue >= 240 && hue < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (hue >= 300 && hue < 360) {
    r = c;
    g = 0;
    b = x;
  }

  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);

  return (r << 16) | (g << 8) | b;
}

// Create filled geometry from closed loop vertices
function createClosedShapeGeometry(
  vertices: Array<{ x: number; y: number }>
): THREE.ShapeGeometry | null {
  if (vertices.length < 3) return null;

  try {
    const shape = new THREE.Shape();

    // Remove duplicate consecutive vertices to avoid shape issues
    const cleanVertices = vertices.filter((vertex, index) => {
      if (index === 0) return true;
      const prev = vertices[index - 1];
      const distance = Math.sqrt(
        Math.pow(vertex.x - prev.x, 2) + Math.pow(vertex.y - prev.y, 2)
      );
      return distance > 0.001; // Remove vertices closer than 0.001 units
    });

    if (cleanVertices.length < 3) return null;

    // Move to first point
    shape.moveTo(cleanVertices[0].x, cleanVertices[0].y);

    // Draw lines to all other points
    for (let i = 1; i < cleanVertices.length; i++) {
      shape.lineTo(cleanVertices[i].x, cleanVertices[i].y);
    }

    // Close the shape explicitly
    shape.closePath();

    return new THREE.ShapeGeometry(shape);
  } catch (error) {
    console.warn("Failed to create shape geometry:", error);
    return null;
  }
}

// Enhanced closed shape creation using entity information
function createClosedShapeFromEntities(loop: {
  entities: IEntity[];
  vertices: Array<{ x: number; y: number }>;
}): THREE.ShapeGeometry | null {
  try {
    // If we have good vertices from tracing, use them directly
    if (loop.vertices && loop.vertices.length >= 3) {
      console.log(
        `Creating shape from ${loop.vertices.length} vertices from traced loop`
      );
      return createClosedShapeGeometry(loop.vertices);
    }

    // Fallback: create basic shape from entities
    if (loop.entities.length === 0) {
      return null;
    }

    console.log(
      `Fallback: Creating shape from ${loop.entities.length} entities`
    );

    const shape = new THREE.Shape();
    let hasMoveTo = false;

    // Process each entity simply
    for (const entity of loop.entities) {
      if (entity.type === "CIRCLE") {
        const circle = entity as ICircleEntity;
        if (circle.center && typeof circle.radius === "number") {
          if (!hasMoveTo) {
            shape.moveTo(circle.center.x + circle.radius, circle.center.y);
            hasMoveTo = true;
          }
          shape.absarc(
            circle.center.x,
            circle.center.y,
            circle.radius,
            0,
            Math.PI * 2,
            false
          );
        }
      } else if (entity.type === "ARC") {
        const arc = entity as IArcEntity;
        if (
          arc.center &&
          typeof arc.radius === "number" &&
          typeof arc.startAngle === "number" &&
          typeof arc.endAngle === "number"
        ) {
          if (!hasMoveTo) {
            const startX = arc.center.x + arc.radius * Math.cos(arc.startAngle);
            const startY = arc.center.y + arc.radius * Math.sin(arc.startAngle);
            shape.moveTo(startX, startY);
            hasMoveTo = true;
          }
          shape.absarc(
            arc.center.x,
            arc.center.y,
            arc.radius,
            arc.startAngle,
            arc.endAngle,
            false
          );
        }
      } else if (entity.type === "LINE") {
        const line = entity as ILineEntity;
        if (line.vertices && line.vertices.length >= 2) {
          if (!hasMoveTo) {
            shape.moveTo(line.vertices[0].x, line.vertices[0].y);
            hasMoveTo = true;
          }
          for (let i = 1; i < line.vertices.length; i++) {
            shape.lineTo(line.vertices[i].x, line.vertices[i].y);
          }
        }
      } else if (entity.type === "POLYLINE" || entity.type === "LWPOLYLINE") {
        const poly = entity as IPolylineEntity;
        if (poly.vertices && poly.vertices.length > 0) {
          if (!hasMoveTo) {
            shape.moveTo(poly.vertices[0].x, poly.vertices[0].y);
            hasMoveTo = true;
          }
          for (let i = 1; i < poly.vertices.length; i++) {
            shape.lineTo(poly.vertices[i].x, poly.vertices[i].y);
          }
        }
      }
    }

    if (hasMoveTo) {
      shape.closePath();
      const geometry = new THREE.ShapeGeometry(shape);
      return geometry;
    }

    return null;
  } catch (error) {
    console.warn("Failed to create shape geometry:", error);
    return null;
  }
}

// Separate outer loops from holes using improved containment analysis
export function separateOuterLoopsFromHoles(
  loops: Array<{
    entities: IEntity[];
    vertices: Array<{ x: number; y: number }>;
    area: number;
    perimeter: number;
  }>
) {
  const outerLoops: Array<{
    entities: IEntity[];
    vertices: Array<{ x: number; y: number }>;
    area: number;
    perimeter: number;
  }> = [];
  const holes: Array<{
    entities: IEntity[];
    vertices: Array<{ x: number; y: number }>;
    area: number;
    perimeter: number;
  }> = [];

  if (loops.length === 0) return { outerLoops, holes };

  // Calculate nesting level for each loop using proper containment relationships
  const nestingData = loops.map((loop) => {
    let nestingLevel = 0;

    // Count how many other loops completely contain this loop
    for (let j = 0; j < loops.length; j++) {
      if (loops[j] !== loop && isLoopContainedInLoopEnhanced(loop, loops[j])) {
        nestingLevel++;
      }
    }

    return { loop, nestingLevel };
  });

  // Geometric classification rule:
  // - Even nesting levels (0, 2, 4...) = Outer boundaries (fills)
  // - Odd nesting levels (1, 3, 5...) = Holes
  for (const { loop, nestingLevel } of nestingData) {
    const isHole = nestingLevel % 2 === 1;

    if (isHole) {
      holes.push(loop);
    } else {
      outerLoops.push(loop);
    }
  }

  return { outerLoops, holes };
}

// Check if loopA is completely contained within loopB
// function isLoopContainedInLoop(
//   loopA: { vertices: Array<{ x: number; y: number }> },
//   loopB: { vertices: Array<{ x: number; y: number }> }
// ): boolean {
//   // Test multiple points from loopA to see if they're inside loopB
//   const testIndices = [
//     0,
//     Math.floor(loopA.vertices.length * 0.25),
//     Math.floor(loopA.vertices.length * 0.5),
//     Math.floor(loopA.vertices.length * 0.75),
//     Math.floor(loopA.vertices.length * 0.9),
//   ];
//
//   let containedCount = 0;
//   let totalTests = 0;
//
//   for (const index of testIndices) {
//     if (index < loopA.vertices.length) {
//       totalTests++;
//       if (isPointInPolygon(loopA.vertices[index], loopB.vertices)) {
//         containedCount++;
//       }
//     }
//   }
//
//   // Consider contained if at least 80% of test points are inside
//   const containmentRatio = containedCount / totalTests;
//   return containmentRatio >= 0.8;
// }

// Relaxed containment test for edge cases (e.g., small holes near boundaries)
// function isLoopContainedInLoopRelaxed(
//   loopA: { vertices: Array<{ x: number; y: number }> },
//   loopB: { vertices: Array<{ x: number; y: number }> }
// ): boolean {
//   // Use more test points and lower threshold for small loops
//   const testIndices = [
//     0,
//     Math.floor(loopA.vertices.length * 0.1),
//     Math.floor(loopA.vertices.length * 0.3),
//     Math.floor(loopA.vertices.length * 0.5),
//     Math.floor(loopA.vertices.length * 0.7),
//     Math.floor(loopA.vertices.length * 0.9),
//   ];
//
//   let containedCount = 0;
//   let totalTests = 0;
//
//   for (const index of testIndices) {
//     if (index < loopA.vertices.length) {
//       totalTests++;
//       if (isPointInPolygon(loopA.vertices[index], loopB.vertices)) {
//         containedCount++;
//       }
//     }
//   }
//
//   // Lower threshold for relaxed test
//   const containmentRatio = containedCount / totalTests;
//   return containmentRatio >= 0.5;
// }

// Enhanced containment test with better point sampling and testing
function isLoopContainedInLoopEnhanced(
  loopA: { vertices: Array<{ x: number; y: number }> },
  loopB: { vertices: Array<{ x: number; y: number }> }
): boolean {
  if (loopA.vertices.length === 0 || loopB.vertices.length === 0) return false;

  // Calculate bounding boxes first for quick rejection
  const boundsA = calculateBounds(loopA.vertices);
  const boundsB = calculateBounds(loopB.vertices);

  // If A's bounding box is not inside B's bounding box, A cannot be contained in B
  if (
    boundsA.minX < boundsB.minX ||
    boundsA.maxX > boundsB.maxX ||
    boundsA.minY < boundsB.minY ||
    boundsA.maxY > boundsB.maxY
  ) {
    return false;
  }

  // Test multiple strategic points from loopA
  const testIndices = [];
  const numTests = Math.min(12, loopA.vertices.length);
  for (let i = 0; i < numTests; i++) {
    testIndices.push(Math.floor((i * loopA.vertices.length) / numTests));
  }

  let containedCount = 0;
  for (const index of testIndices) {
    if (index < loopA.vertices.length) {
      if (isPointInPolygon(loopA.vertices[index], loopB.vertices)) {
        containedCount++;
      }
    }
  }

  // Require 90% of points to be contained
  return containedCount / testIndices.length >= 0.9;
}

// Removed unused function isLoopContainedInLoopVeryRelaxed

// Helper function to calculate bounding box
function calculateBounds(vertices: Array<{ x: number; y: number }>) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const vertex of vertices) {
    minX = Math.min(minX, vertex.x);
    maxX = Math.max(maxX, vertex.x);
    minY = Math.min(minY, vertex.y);
    maxY = Math.max(maxY, vertex.y);
  }
  return { minX, maxX, minY, maxY };
}

// Removed unused function calculateCentroid

// Point-in-polygon test using improved ray casting algorithm
function isPointInPolygon(
  point: { x: number; y: number },
  polygon: Array<{ x: number; y: number }>
): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  const px = point.x;
  const py = point.y;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    // Check if point is on edge (within small tolerance)
    if (isPointOnLineSegment(point, { x: xi, y: yi }, { x: xj, y: yj })) {
      return true; // Consider points on boundary as inside
    }

    // Standard ray casting test
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

// Check if point lies on line segment (within tolerance)
function isPointOnLineSegment(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number }
): boolean {
  const tolerance = 0.01;

  // Calculate distance from point to line segment
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;

  if (lenSq === 0) {
    // Line start and end are the same point
    return Math.sqrt(A * A + B * B) < tolerance;
  }

  let param = dot / lenSq;
  param = Math.max(0, Math.min(1, param)); // Clamp to segment

  const nearestX = lineStart.x + param * C;
  const nearestY = lineStart.y + param * D;

  const distance = Math.sqrt(
    Math.pow(point.x - nearestX, 2) + Math.pow(point.y - nearestY, 2)
  );

  return distance < tolerance;
}

// Removed unused findClosedLoopsImproved function - now using DxfAnalyzer

// Removed unused tracing functions - now using DxfAnalyzer

// Removed more unused tracing helper functions

// Calculate signed area to determine winding order

// Removed unused calculatePolygonPerimeter function

// Removed unused findClosedLoopsImproved function - now using hybrid DxfAnalyzer + tracing approach

// Removed unused tracing functions - now using DxfAnalyzer directly

// Removed unused calculation functions - DxfAnalyzer handles area and perimeter

// Removed convertToTracedLoops function - using DxfAnalyzer results directly

// Find closed loops using enhanced approach: DxfAnalyzer connectivity + proper ordering
export function createOrderedLoopsFromConnectivity({
  entities,
}: {
  entities: IEntity[];
}): Array<{
  entities: IEntity[];
  vertices: Array<{ x: number; y: number }>;
  area: number;
  perimeter: number;
}> {
  // Step 1: Use DxfAnalyzer to get connected groups (all 73 groups)
  const dxfAnalyzerLoops = DxfAnalyzer.findClosedLoops({ entities });

  const orderedLoops: Array<{
    entities: IEntity[];
    vertices: Array<{ x: number; y: number }>;
    area: number;
    perimeter: number;
  }> = [];

  // Step 2: For each connected group, create properly ordered vertices
  for (const dxfLoop of dxfAnalyzerLoops) {
    // Handle single entities (circles, closed polylines) - they're already correct
    if (dxfLoop.entities.length === 1) {
      orderedLoops.push(dxfLoop);
      continue;
    }

    // For multi-entity loops, apply robust sequential ordering using graph traversal
    const orderedResult = createRobustSequentialOrder(dxfLoop.entities);

    if (orderedResult && orderedResult.vertices.length >= 3) {
      orderedLoops.push({
        entities: dxfLoop.entities, // Keep original entities from flood-fill
        vertices: orderedResult.vertices,
        area: Math.abs(orderedResult.area),
        perimeter: orderedResult.perimeter,
      });
    } else {
      // Fallback to DxfAnalyzer's vertices if sequential ordering fails
      orderedLoops.push(dxfLoop);
    }
  }

  return orderedLoops;
}

// Normalize arc angles to handle different angle representations
function normalizeArcAngle(angle: number): number {
  // Handle angles that might be in degrees vs radians
  if (Math.abs(angle) > 2 * Math.PI) {
    // Likely in degrees, convert to radians
    angle = (angle * Math.PI) / 180;
  }

  // Normalize to [0, 2π] range
  while (angle < 0) {
    angle += 2 * Math.PI;
  }
  while (angle >= 2 * Math.PI) {
    angle -= 2 * Math.PI;
  }

  return angle;
}

// Robust sequential ordering using graph traversal
function createRobustSequentialOrder(entities: IEntity[]): {
  vertices: Array<{ x: number; y: number }>;
  area: number;
  perimeter: number;
} | null {
  if (entities.length === 0) return null;

  // For single entity, handle directly
  if (entities.length === 1) {
    const vertices: Array<{ x: number; y: number }> = [];
    addEntityVerticesRobust(entities[0], vertices);
    return {
      vertices,
      area: calculateLoopArea(vertices),
      perimeter: calculateLoopPerimeter(vertices),
    };
  }

  // Build connectivity graph with tolerance-based endpoint matching
  const connectionGraph = buildConnectionGraph(entities);

  // Find sequential order using graph traversal
  const sequentialOrder = findSequentialPath(entities, connectionGraph);

  if (!sequentialOrder || sequentialOrder.length < entities.length) {
    console.warn(
      `Could not find complete sequential path. Found ${
        sequentialOrder?.length || 0
      }/${entities.length} entities`
    );
    return null;
  }

  // Generate vertices following the sequential order
  const vertices: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < sequentialOrder.length; i++) {
    const entity = sequentialOrder[i];
    const nextEntity = sequentialOrder[(i + 1) % sequentialOrder.length];

    // Add vertices from current entity, ensuring proper direction
    addEntityVerticesWithDirection(entity, nextEntity, vertices);
  }

  return {
    vertices,
    area: calculateLoopArea(vertices),
    perimeter: calculateLoopPerimeter(vertices),
  };
}

// Build connection graph between entities
function buildConnectionGraph(
  entities: IEntity[]
): Map<
  IEntity,
  Array<{ entity: IEntity; connectAtStart: boolean; connectAtEnd: boolean }>
> {
  const graph = new Map<
    IEntity,
    Array<{ entity: IEntity; connectAtStart: boolean; connectAtEnd: boolean }>
  >();
  const tolerance = 0.1;
  const arcTolerance = 0.5; // Larger tolerance for arc connections, like the previous working implementation

  // Initialize graph
  entities.forEach((entity) => {
    graph.set(entity, []);
  });

  // Find connections between entities
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const entityA = entities[i];
      const entityB = entities[j];

      const startA = getEntityStartPoint(entityA);
      const endA = getEntityEndPoint(entityA);
      const startB = getEntityStartPoint(entityB);
      const endB = getEntityEndPoint(entityB);

      // Check all possible connections
      const connections = [
        { pointA: endA, pointB: startB, aAtEnd: true, bAtStart: true },
        { pointA: endA, pointB: endB, aAtEnd: true, bAtStart: false },
        { pointA: startA, pointB: startB, aAtEnd: false, bAtStart: true },
        { pointA: startA, pointB: endB, aAtEnd: false, bAtStart: false },
      ];

      for (const conn of connections) {
        const distance = Math.sqrt(
          Math.pow(conn.pointA.x - conn.pointB.x, 2) +
            Math.pow(conn.pointA.y - conn.pointB.y, 2)
        );

        // Use larger tolerance for arc connections, like the previous working implementation
        const activeA = entityA.type === "ARC";
        const activeB = entityB.type === "ARC";
        const useTolerance = activeA || activeB ? arcTolerance : tolerance;

        if (distance <= useTolerance) {
          // Add bidirectional connection
          graph.get(entityA)!.push({
            entity: entityB,
            connectAtStart: !conn.aAtEnd,
            connectAtEnd: conn.aAtEnd,
          });
          graph.get(entityB)!.push({
            entity: entityA,
            connectAtStart: !conn.bAtStart,
            connectAtEnd: conn.bAtStart,
          });
          break; // Only record the first valid connection between these entities
        }
      }
    }
  }

  return graph;
}

// Find sequential path through all entities using graph traversal
function findSequentialPath(
  entities: IEntity[],
  graph: Map<
    IEntity,
    Array<{ entity: IEntity; connectAtStart: boolean; connectAtEnd: boolean }>
  >
): IEntity[] | null {
  // Try starting from each entity to find a complete path
  for (const startEntity of entities) {
    const path = findPathFromEntity(startEntity, entities, graph);
    if (path && path.length === entities.length) {
      return path;
    }
  }

  return null;
}

// DFS to find path starting from specific entity
function findPathFromEntity(
  startEntity: IEntity,
  allEntities: IEntity[],
  graph: Map<
    IEntity,
    Array<{ entity: IEntity; connectAtStart: boolean; connectAtEnd: boolean }>
  >
): IEntity[] | null {
  const visited = new Set<IEntity>();
  const path: IEntity[] = [];

  function dfs(currentEntity: IEntity): boolean {
    if (visited.has(currentEntity)) return false;

    visited.add(currentEntity);
    path.push(currentEntity);

    // If we've visited all entities, check if we can close the loop
    if (path.length === allEntities.length) {
      // Check if last entity connects back to first entity
      const connections = graph.get(currentEntity) || [];
      const connectsToStart = connections.some(
        (conn) => conn.entity === startEntity
      );
      return connectsToStart;
    }

    // Try connecting to unvisited entities
    const connections = graph.get(currentEntity) || [];
    for (const connection of connections) {
      if (!visited.has(connection.entity)) {
        if (dfs(connection.entity)) {
          return true;
        }
      }
    }

    // Backtrack
    visited.delete(currentEntity);
    path.pop();
    return false;
  }

  if (dfs(startEntity)) {
    return path;
  }

  return null;
}

// Add entity vertices with proper direction to ensure smooth curve fitting
function addEntityVerticesWithDirection(
  entity: IEntity,
  nextEntity: IEntity | null,
  vertices: Array<{ x: number; y: number }>
) {
  if (isLineEntity(entity)) {
    if (entity.vertices && entity.vertices.length >= 2) {
      // For lines, determine if we need to reverse based on connection to next entity
      const lineStart = entity.vertices[0];
      const lineEnd = entity.vertices[entity.vertices.length - 1];

      let useReverse = false;
      if (nextEntity && vertices.length > 0) {
        const lastVertex = vertices[vertices.length - 1];
        const distToStart = Math.sqrt(
          Math.pow(lastVertex.x - lineStart.x, 2) +
            Math.pow(lastVertex.y - lineStart.y, 2)
        );
        const distToEnd = Math.sqrt(
          Math.pow(lastVertex.x - lineEnd.x, 2) +
            Math.pow(lastVertex.y - lineEnd.y, 2)
        );

        // If we're closer to the end than the start, reverse the line
        useReverse = distToEnd < distToStart;
      }

      if (useReverse) {
        for (let i = entity.vertices.length - 1; i >= 0; i--) {
          vertices.push({ x: entity.vertices[i].x, y: entity.vertices[i].y });
        }
      } else {
        entity.vertices.forEach((vertex) => {
          vertices.push({ x: vertex.x, y: vertex.y });
        });
      }
    }
  } else if (isArcEntity(entity)) {
    const center = entity.center;
    const radius = entity.radius;

    // Normalize arc angles like the previous working implementation
    const normalizedStartAngle = normalizeArcAngle(entity.startAngle || 0);
    const normalizedEndAngle = normalizeArcAngle(
      entity.endAngle || Math.PI * 2
    );

    // Handle angle span calculation (might cross 0 degrees)
    let angleSpan = normalizedEndAngle - normalizedStartAngle;
    if (angleSpan < 0) {
      angleSpan += 2 * Math.PI;
    }

    // High detail segments for smooth curves
    const segments = Math.max(16, Math.ceil((angleSpan * 32) / Math.PI));

    // Determine direction based on connection to previous vertex
    let useReverse = false;
    if (vertices.length > 0) {
      const lastVertex = vertices[vertices.length - 1];
      const arcStart = {
        x: center.x + radius * Math.cos(normalizedStartAngle),
        y: center.y + radius * Math.sin(normalizedStartAngle),
      };
      const arcEnd = {
        x: center.x + radius * Math.cos(normalizedEndAngle),
        y: center.y + radius * Math.sin(normalizedEndAngle),
      };

      const distToStart = Math.sqrt(
        Math.pow(lastVertex.x - arcStart.x, 2) +
          Math.pow(lastVertex.y - arcStart.y, 2)
      );
      const distToEnd = Math.sqrt(
        Math.pow(lastVertex.x - arcEnd.x, 2) +
          Math.pow(lastVertex.y - arcEnd.y, 2)
      );

      // If we're closer to the arc end, traverse the arc in reverse
      useReverse = distToEnd < distToStart;
    }

    if (useReverse) {
      for (let i = segments; i >= 0; i--) {
        let angle = normalizedStartAngle + angleSpan * (i / segments);
        if (angle >= 2 * Math.PI) {
          angle -= 2 * Math.PI;
        }
        vertices.push({
          x: center.x + radius * Math.cos(angle),
          y: center.y + radius * Math.sin(angle),
        });
      }
    } else {
      for (let i = 0; i <= segments; i++) {
        let angle = normalizedStartAngle + angleSpan * (i / segments);
        if (angle >= 2 * Math.PI) {
          angle -= 2 * Math.PI;
        }
        vertices.push({
          x: center.x + radius * Math.cos(angle),
          y: center.y + radius * Math.sin(angle),
        });
      }
    }
  } else if (isPolylineEntity(entity)) {
    if (entity.vertices) {
      // For polylines, determine direction based on connection to previous vertex
      let useReverse = false;
      if (vertices.length > 0 && entity.vertices.length > 1) {
        const lastVertex = vertices[vertices.length - 1];
        const polyStart = entity.vertices[0];
        const polyEnd = entity.vertices[entity.vertices.length - 1];

        const distToStart = Math.sqrt(
          Math.pow(lastVertex.x - polyStart.x, 2) +
            Math.pow(lastVertex.y - polyStart.y, 2)
        );
        const distToEnd = Math.sqrt(
          Math.pow(lastVertex.x - polyEnd.x, 2) +
            Math.pow(lastVertex.y - polyEnd.y, 2)
        );

        useReverse = distToEnd < distToStart;
      }

      if (useReverse) {
        for (let i = entity.vertices.length - 1; i >= 0; i--) {
          vertices.push({ x: entity.vertices[i].x, y: entity.vertices[i].y });
        }
      } else {
        entity.vertices.forEach((vertex) => {
          vertices.push({ x: vertex.x, y: vertex.y });
        });
      }
    }
  } else if (isSplineEntity(entity)) {
    if (entity.controlPoints && entity.controlPoints.length >= 3) {
      // Generate vertices using De Boor's algorithm
      const degree = entity.degreeOfSplineCurve || 3;
      const knots = entity.knotValues || [];

      if (knots.length > 0) {
        // Find valid parameter range
        const tMin = knots[degree] ?? knots[0] ?? 0;
        const tMax =
          knots[knots.length - degree - 1] ?? knots[knots.length - 1] ?? 1;

        if (tMin < tMax) {
          // Generate high-detail vertices for smooth curves
          const numPoints = Math.max(50, entity.controlPoints.length * 10);

          // Determine direction based on connection to previous vertex
          let useReverse = false;
          if (vertices.length > 0) {
            const lastVertex = vertices[vertices.length - 1];
            const splineStart = evaluateSplinePoint(
              tMin,
              entity.controlPoints,
              degree,
              knots
            );
            const splineEnd = evaluateSplinePoint(
              tMax,
              entity.controlPoints,
              degree,
              knots
            );

            if (splineStart && splineEnd) {
              const distToStart = Math.sqrt(
                Math.pow(lastVertex.x - splineStart.x, 2) +
                  Math.pow(lastVertex.y - splineStart.y, 2)
              );
              const distToEnd = Math.sqrt(
                Math.pow(lastVertex.x - splineEnd.x, 2) +
                  Math.pow(lastVertex.y - splineEnd.y, 2)
              );
              useReverse = distToEnd < distToStart;
            }
          }

          const dt = (tMax - tMin) / (numPoints - 1);

          if (useReverse) {
            for (let i = numPoints; i >= 0; i--) {
              const t = tMin + i * dt;
              const point = evaluateSplinePoint(
                t,
                entity.controlPoints,
                degree,
                knots
              );
              if (point) {
                vertices.push({ x: point.x, y: point.y });
              }
            }
          } else {
            for (let i = 0; i <= numPoints; i++) {
              const t = tMin + i * dt;
              const point = evaluateSplinePoint(
                t,
                entity.controlPoints,
                degree,
                knots
              );
              if (point) {
                vertices.push({ x: point.x, y: point.y });
              }
            }
          }
        }
      } else {
        // Fallback: use control points as approximation with direction
        let useReverse = false;
        if (vertices.length > 0 && entity.controlPoints.length > 1) {
          const lastVertex = vertices[vertices.length - 1];
          const splineStart = entity.controlPoints[0];
          const splineEnd =
            entity.controlPoints[entity.controlPoints.length - 1];

          const distToStart = Math.sqrt(
            Math.pow(lastVertex.x - splineStart.x, 2) +
              Math.pow(lastVertex.y - splineStart.y, 2)
          );
          const distToEnd = Math.sqrt(
            Math.pow(lastVertex.x - splineEnd.x, 2) +
              Math.pow(lastVertex.y - splineEnd.y, 2)
          );
          useReverse = distToEnd < distToStart;
        }

        if (useReverse) {
          for (let i = entity.controlPoints.length - 1; i >= 0; i--) {
            const cp = entity.controlPoints[i];
            vertices.push({ x: cp.x, y: cp.y });
          }
        } else {
          entity.controlPoints.forEach((cp) => {
            vertices.push({ x: cp.x, y: cp.y });
          });
        }
      }
    }
  }
}

// Enhanced vertex addition for single entities - ensures maximum detail
function addEntityVerticesRobust(
  entity: IEntity,
  vertices: Array<{ x: number; y: number }>
) {
  if (isLineEntity(entity)) {
    if (entity.vertices && entity.vertices.length >= 2) {
      // Add ALL vertices from line entity
      entity.vertices.forEach((vertex) => {
        vertices.push({ x: vertex.x, y: vertex.y });
      });
    }
  } else if (isArcEntity(entity)) {
    const center = entity.center;
    const radius = entity.radius;

    // Use same normalization as in addEntityVerticesWithDirection
    const normalizedStartAngle = normalizeArcAngle(entity.startAngle || 0);
    const normalizedEndAngle = normalizeArcAngle(
      entity.endAngle || Math.PI * 2
    );

    // Handle angle span calculation (might cross 0 degrees)
    let angleSpan = normalizedEndAngle - normalizedStartAngle;
    if (angleSpan < 0) {
      angleSpan += 2 * Math.PI;
    }

    // Use same high segment count as multi-entity case for consistency
    const segments = Math.max(16, Math.ceil((angleSpan * 32) / Math.PI));

    for (let i = 0; i <= segments; i++) {
      let angle = normalizedStartAngle + angleSpan * (i / segments);

      // Ensure angle stays in valid range
      if (angle >= 2 * Math.PI) {
        angle -= 2 * Math.PI;
      }

      vertices.push({
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
      });
    }
  } else if (isPolylineEntity(entity)) {
    if (entity.vertices) {
      // Add ALL vertices from polyline entity
      entity.vertices.forEach((vertex) => {
        vertices.push({ x: vertex.x, y: vertex.y });
      });
    }
  } else if (isSplineEntity(entity)) {
    if (entity.controlPoints && entity.controlPoints.length >= 3) {
      // Generate vertices using De Boor's algorithm (same as multi-entity case)
      const degree = entity.degreeOfSplineCurve || 3;
      const knots = entity.knotValues || [];

      if (knots.length > 0) {
        // Find valid parameter range
        const tMin = knots[degree] ?? knots[0] ?? 0;
        const tMax =
          knots[knots.length - degree - 1] ?? knots[knots.length - 1] ?? 1;

        if (tMin < tMax) {
          // Generate high-detail vertices for smooth curves
          const numPoints = Math.max(50, entity.controlPoints.length * 10);
          const dt = (tMax - tMin) / (numPoints - 1);

          for (let i = 0; i <= numPoints; i++) {
            const t = tMin + i * dt;
            const point = evaluateSplinePoint(
              t,
              entity.controlPoints,
              degree,
              knots
            );
            if (point) {
              vertices.push({ x: point.x, y: point.y });
            }
          }
        }
      } else {
        // Fallback: use control points as approximation
        entity.controlPoints.forEach((cp) => {
          vertices.push({ x: cp.x, y: cp.y });
        });
      }
    }
  }
}

// Helper functions for entity endpoints
function getEntityStartPoint(entity: IEntity): { x: number; y: number } {
  if (isLineEntity(entity)) {
    return { x: entity.vertices[0].x, y: entity.vertices[0].y };
  } else if (isArcEntity(entity)) {
    // Use normalized angles like the previous working implementation
    const normalizedStartAngle = normalizeArcAngle(entity.startAngle || 0);
    return {
      x: entity.center.x + entity.radius * Math.cos(normalizedStartAngle),
      y: entity.center.y + entity.radius * Math.sin(normalizedStartAngle),
    };
  } else if (isPolylineEntity(entity)) {
    return { x: entity.vertices[0].x, y: entity.vertices[0].y };
  } else if (isSplineEntity(entity)) {
    if (entity.controlPoints && entity.controlPoints.length > 0) {
      // Try to evaluate the start point using De Boor's algorithm
      const degree = entity.degreeOfSplineCurve || 3;
      const knots = entity.knotValues || [];

      if (knots.length > 0) {
        const tMin = knots[degree] ?? knots[0] ?? 0;
        const startPoint = evaluateSplinePoint(
          tMin,
          entity.controlPoints,
          degree,
          knots
        );
        if (startPoint) {
          return startPoint;
        }
      }

      // Fallback to first control point
      return { x: entity.controlPoints[0].x, y: entity.controlPoints[0].y };
    }
  }
  return { x: 0, y: 0 };
}

function getEntityEndPoint(entity: IEntity): { x: number; y: number } {
  if (isLineEntity(entity)) {
    return { x: entity.vertices[1].x, y: entity.vertices[1].y };
  } else if (isArcEntity(entity)) {
    // Use normalized angles like the previous working implementation
    const normalizedEndAngle = normalizeArcAngle(
      entity.endAngle || Math.PI * 2
    );
    return {
      x: entity.center.x + entity.radius * Math.cos(normalizedEndAngle),
      y: entity.center.y + entity.radius * Math.sin(normalizedEndAngle),
    };
  } else if (isPolylineEntity(entity)) {
    const lastVertex = entity.vertices[entity.vertices.length - 1];
    return { x: lastVertex.x, y: lastVertex.y };
  } else if (isSplineEntity(entity)) {
    if (entity.controlPoints && entity.controlPoints.length > 0) {
      // Try to evaluate the end point using De Boor's algorithm
      const degree = entity.degreeOfSplineCurve || 3;
      const knots = entity.knotValues || [];

      if (knots.length > 0) {
        const tMax =
          knots[knots.length - degree - 1] ?? knots[knots.length - 1] ?? 1;
        const endPoint = evaluateSplinePoint(
          tMax,
          entity.controlPoints,
          degree,
          knots
        );
        if (endPoint) {
          return endPoint;
        }
      }

      // Fallback to last control point
      const lastControlPoint =
        entity.controlPoints[entity.controlPoints.length - 1];
      return { x: lastControlPoint.x, y: lastControlPoint.y };
    }
  }
  return { x: 0, y: 0 };
}

function calculateLoopArea(vertices: Array<{ x: number; y: number }>): number {
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return area / 2;
}

function calculateLoopPerimeter(
  vertices: Array<{ x: number; y: number }>
): number {
  let perimeter = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    const dx = vertices[j].x - vertices[i].x;
    const dy = vertices[j].y - vertices[i].y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  return perimeter;
}

// Create shape with geometric holes using THREE.js Shape.holes
function createShapeWithHoles(
  outerLoop: {
    entities: IEntity[];
    vertices: Array<{ x: number; y: number }>;
    area: number;
    perimeter: number;
  },
  containedHoles: Array<{
    entities: IEntity[];
    vertices: Array<{ x: number; y: number }>;
    area: number;
    perimeter: number;
  }>
): THREE.ShapeGeometry | null {
  try {
    // Create main shape from outer loop
    const mainShape = new THREE.Shape();

    if (outerLoop.vertices.length < 3) return null;

    // Clean vertices to avoid duplicate points
    const cleanVertices = outerLoop.vertices.filter((vertex, index) => {
      if (index === 0) return true;
      const prev = outerLoop.vertices[index - 1];
      const distance = Math.sqrt(
        Math.pow(vertex.x - prev.x, 2) + Math.pow(vertex.y - prev.y, 2)
      );
      return distance > 0.001; // Keep vertices that are far enough apart
    });

    // Build main shape
    mainShape.moveTo(cleanVertices[0].x, cleanVertices[0].y);
    for (let i = 1; i < cleanVertices.length; i++) {
      mainShape.lineTo(cleanVertices[i].x, cleanVertices[i].y);
    }
    mainShape.closePath();

    // Add holes to the main shape
    containedHoles.forEach((hole) => {
      if (hole.vertices.length < 3) return;

      // Clean hole vertices
      const cleanHoleVertices = hole.vertices.filter((vertex, index) => {
        if (index === 0) return true;
        const prev = hole.vertices[index - 1];
        const distance = Math.sqrt(
          Math.pow(vertex.x - prev.x, 2) + Math.pow(vertex.y - prev.y, 2)
        );
        return distance > 0.001;
      });

      if (cleanHoleVertices.length < 3) return;

      // Create hole shape
      const holeShape = new THREE.Shape();
      holeShape.moveTo(cleanHoleVertices[0].x, cleanHoleVertices[0].y);
      for (let i = 1; i < cleanHoleVertices.length; i++) {
        holeShape.lineTo(cleanHoleVertices[i].x, cleanHoleVertices[i].y);
      }
      holeShape.closePath();

      // Add as hole to main shape
      mainShape.holes.push(holeShape);
    });

    return new THREE.ShapeGeometry(mainShape);
  } catch (error) {
    console.warn("Failed to create shape with holes:", error);
    return null;
  }
}

// Find which holes are contained within each outer loop
function groupHolesWithOuterLoops(
  outerLoops: Array<{
    entities: IEntity[];
    vertices: Array<{ x: number; y: number }>;
    area: number;
    perimeter: number;
  }>,
  holes: Array<{
    entities: IEntity[];
    vertices: Array<{ x: number; y: number }>;
    area: number;
    perimeter: number;
  }>
): Array<{
  outerLoop: (typeof outerLoops)[0];
  containedHoles: typeof holes;
}> {
  const groupedShapes: Array<{
    outerLoop: (typeof outerLoops)[0];
    containedHoles: typeof holes;
  }> = [];

  outerLoops.forEach((outerLoop) => {
    const containedHoles: typeof holes = [];

    // Find holes contained within this outer loop
    holes.forEach((hole) => {
      if (isLoopContainedInLoopEnhanced(hole, outerLoop)) {
        containedHoles.push(hole);
      }
    });

    groupedShapes.push({
      outerLoop,
      containedHoles,
    });
  });

  return groupedShapes;
}

export interface ProcessOptions {
  /** Decides the colour of every stroke and fill. */
  style: StyleResolver;
  /** Build filled meshes for detected closed loops. */
  showShapeColors?: boolean;
  /**
   * Merge entities into one buffer per layer (default: true).
   *
   * Set false to keep one object per entity, which is slower to draw but
   * easier to inspect in a debugger or a Three.js scene explorer.
   */
  batching?: boolean;
  /**
   * Parse and analysis output from {@link prepareDrawing}.
   *
   * Supplying it skips both phases here, which is what lets them run
   * elsewhere — on a worker, or simply earlier.
   */
  prepared?: PreparedDrawing;
}

export function processDxf(
  dxfContent: string,
  options: ProcessOptions
): ProcessDxfResult {
  const { style, showShapeColors = true, prepared, batching = true } = options;
  const totalStartTime = performance.now();

  // Parse DXF
  const parseStartTime = performance.now();
  let entities: IEntity[] = [];
  let dxfData: {
    entities?: IEntity[];
    blocks?: Record<string, { entities: IEntity[]; name: string }>;
    header?: Record<string, unknown>;
    tables?: { layer?: { layers?: Record<string, any> } };
  } | null = null;
  let parseError: Error | null = null;
  try {
    if (prepared) {
      if (prepared.parseError) throw new Error(prepared.parseError);
      dxfData = prepared.data as any;
    } else {
      dxfData = new DxfParser().parseSync(dxfContent) as any;
    }
    entities = dxfData?.entities || [];
  } catch (error) {
    parseError =
      error instanceof Error ? error : new Error("Failed to parse DXF");
    return {
      document: new DxfDocument(),
      group: new THREE.Group(),
      stats: {},
      entities: [],
      layers: {},
      layerTable: {},
      parseError,
      dxfHeader: undefined,
    };
  }
  const parseEndTime = performance.now();

  // Only do expensive analysis if we need shape colors
  let outerLoops: Array<{
    entities: IEntity[];
    vertices: Array<{ x: number; y: number }>;
    area: number;
    perimeter: number;
  }> = [];
  let holes: Array<{
    entities: IEntity[];
    vertices: Array<{ x: number; y: number }>;
    area: number;
    perimeter: number;
  }> = [];

  if (showShapeColors) {
    if (prepared?.loops) {
      // Already analysed, possibly on another thread. Loops arrive as entity
      // indices, so they are resolved against this thread's entity array.
      outerLoops = rehydrateLoops(prepared.loops.outer, entities);
      holes = rehydrateLoops(prepared.loops.holes, entities);
    } else {
      const closedLoops = createOrderedLoopsFromConnectivity({ entities });
      const result = separateOuterLoopsFromHoles(closedLoops);
      outerLoops = result.outerLoops;
      holes = result.holes;
    }
  } else {
    // Skip shape analysis when colors are disabled for better performance
  }

  // Create a set of entities that are part of closed loops
  const closedLoopEntities = new Set();
  const entityLoopMap = new Map<IEntity, string>();

  if (showShapeColors) {
    [...outerLoops, ...holes].forEach((loop, index) => {
      const loopId = `loop_${index}`;
      loop.entities.forEach((entity) => {
        closedLoopEntities.add(entity);
        entityLoopMap.set(entity, loopId);
      });
    });
  }

  // Parse Blocks
  const blocks: Record<string, IEntity[]> = {};
  if (dxfData?.blocks) {
    Object.values(dxfData.blocks).forEach((block: any) => {
      if (block.entities) {
        blocks[block.name] = block.entities;
      }
    });
  }

  // Process entities
  const entityProcessingStartTime = performance.now();

  const stats: Record<string, number | string> = {};
  let layers: Record<string, THREE.Group> = {};
  const layerTable: Record<string, { color: number; colorIndex?: number }> = {};

  // Identity is assigned here, at the single point where entities become
  // renderables, so every id maps to exactly one object and vice versa.
  const document = new DxfDocument();
  let nextEntityId = 0;

  /**
   * Fill meshes are generated, not parsed, so they have no source entity —
   * but they are still selectable, so they still need identity.
   */
  const indexFillMesh = (
    mesh: THREE.Mesh,
    layer: string,
    type: string,
    shapeIndex: number
  ): void => {
    const id = `f${nextEntityId++}`;
    mesh.userData.id = id;
    document.add({
      id,
      type,
      layer,
      source: { type, layer } as IEntity,
      object: mesh,
      derived: deriveMeshGeometry(mesh),
      shapeIndex,
    });
  };

  // Give the resolver the raw layer table first: it owns colour resolution,
  // and layerTable below is populated from what it decides.
  style.setLayerTable(
    Object.fromEntries(
      Object.values(dxfData?.tables?.layer?.layers ?? {}).map((layer: any) => [
        layer.name,
        { color: layer.color, colorIndex: layer.colorIndex },
      ])
    )
  );

  // Initialize layers from DXF tables if available
  if (dxfData?.tables?.layer?.layers) {
    Object.values(dxfData.tables.layer.layers).forEach((layer: any) => {
      const layerName = layer.name;
      layers[layerName] = new THREE.Group();
      layers[layerName].userData = { name: layerName };

      // dxf-parser already resolves the layer's colour to 24-bit RGB; the
      // ACI index is the fallback when it could not.
      layerTable[layerName] = {
        color: style.layerColor(layerName),
        colorIndex: layer.colorIndex,
      };
    });
  }

  // Ensure default layer 0 exists
  if (!layers["0"]) {
    layers["0"] = new THREE.Group();
    layers["0"].userData = { name: "0" };
    layerTable["0"] = { color: style.layerColor("0") };
  }

  const objects: THREE.Object3D[] = [];
  const geometryCache = new Map<string, THREE.BufferGeometry>();

  // Helper function to create base object from entity
  const createObject = (
    entity: IEntity,
    material: THREE.Material
  ): THREE.Object3D | null => {
    const cacheKey = `${entity.type}-${JSON.stringify(entity)}`;
    let geometry = geometryCache.get(cacheKey);
    let object: THREE.Object3D | null = null;

    if (!geometry) {
      switch (entity.type) {
        case "LINE":
          if (isLineEntity(entity)) object = processLine(entity, material);
          break;
        case "ARC":
          if (isArcEntity(entity)) object = processArc(entity, material);
          break;
        case "CIRCLE":
          if (isCircleEntity(entity)) object = processCircle(entity, material);
          break;
        case "LWPOLYLINE":
          if (isLwpolylineEntity(entity))
            object = processPolyline(
              entity as unknown as IPolylineEntity,
              material
            );
          break;
        case "POLYLINE":
          if (isPolylineEntity(entity)) object = processPolyline(entity, material);
          break;
        case "SPLINE":
          if (isSplineEntity(entity)) object = processSpline(entity, material);
          break;
        case "ELLIPSE":
          if (isEllipseEntity(entity)) object = processEllipse(entity, material);
          break;
        case "POINT":
          if (isPointEntity(entity)) object = processPoint(entity, material);
          break;
        case "TEXT":
        case "MTEXT":
          if (isTextEntity(entity)) object = processText(entity, material);
          break;
      }

      if (object instanceof THREE.Line) {
        geometry = object.geometry;
        if (geometry) geometryCache.set(cacheKey, geometry);
      }
    }

    if (geometry && !object) {
      object = new THREE.Line(geometry, material);
    }

    return object;
  };

  // Recursive instantiation function
  const instantiateEntity = (
    entity: IEntity,
    parentMatrix: THREE.Matrix4,
    parentLayer: string,
    parentBlockName?: string
  ) => {
    // Stats
    const currentCount =
      typeof stats[entity.type] === "number"
        ? (stats[entity.type] as number)
        : 0;
    stats[entity.type] = currentCount + 1;

    // Determine Layer
    // If entity is on layer "0", it inherits parentLayer (from Insert), else it uses its own layer
    let resolvedLayer = entity.layer || "0";
    if (resolvedLayer === "0") {
      resolvedLayer = parentLayer;
    }

    // Ensure layer group exists
    if (!layers[resolvedLayer]) {
      layers[resolvedLayer] = new THREE.Group();
      layers[resolvedLayer].userData = { name: resolvedLayer };
      layerTable[resolvedLayer] = { color: 0xffffff };
    }

    if (entity.type === "INSERT") {
      const insert = entity as IInsertEntity;
      const blockName = insert.name;
      if (blocks[blockName]) {
        const blockEntities = blocks[blockName];

        // Calculate Insert Matrix
        const position = new THREE.Vector3(
          insert.position.x,
          insert.position.y,
          insert.position.z || 0
        );
        const scale = new THREE.Vector3(
          insert.xScale ?? 1,
          insert.yScale ?? 1,
          insert.zScale ?? 1
        );
        const rotation = new THREE.Euler(
          0,
          0,
          (insert.rotation || 0) * (Math.PI / 180)
        );

        const localMatrix = new THREE.Matrix4().compose(
          position,
          new THREE.Quaternion().setFromEuler(rotation),
          scale
        );
        const worldMatrix = parentMatrix.clone().multiply(localMatrix);

        // Recurse
        blockEntities.forEach((child) =>
          instantiateEntity(child, worldMatrix, resolvedLayer, blockName)
        );
      }
    } else {
      // Geometry Entity
      try {
        // Colour is decided once, here, by the resolver — the entity's own
        // colour if it carries one, otherwise its layer's.
        const entityStyle = style.resolve({
          kind: "stroke",
          type: entity.type,
          layer: resolvedLayer,
          colorIndex: (entity as { colorIndex?: number }).colorIndex,
          rgb: (entity as { color?: number }).color,
        });
        const object = createObject(entity, style.lineMaterial(entityStyle));
        if (object) {
          // Apply Transform
          object.matrixAutoUpdate = false;
          object.matrix.copy(parentMatrix);

          // User Data
          object.userData = {
            entityType: entity.type,
            isClosedLoop: closedLoopEntities.has(entity),
            loopId: entityLoopMap.get(entity),
            layer: resolvedLayer,
          };
          if (entity.type === "CIRCLE" || entity.type === "ARC") {
            const circleEntity = entity as ICircleEntity | IArcEntity;
            object.userData.center = circleEntity.center;
            object.userData.radius = circleEntity.radius;
          }

          // Ensure layer exists before adding
          if (!layers[resolvedLayer]) {
            layers[resolvedLayer] = new THREE.Group();
            layers[resolvedLayer].userData = { name: resolvedLayer };
          }
          
          const id = `e${nextEntityId++}`;
          object.userData.id = id;
          document.add({
            id,
            type: entity.type,
            layer: resolvedLayer,
            source: entity,
            object,
            derived: deriveGeometry(
              object,
              entity,
              closedLoopEntities.has(entity)
            ),
            loopId: entityLoopMap.get(entity),
            blockName: parentBlockName,
          });

          layers[resolvedLayer].add(object);
          objects.push(object);
        } else {
          console.warn(`[DXF Viewer] createObject returned null for ${entity.type}`);
        }
      } catch (err) {
        console.error(`[DXF Viewer] Failed to process entity ${entity.type}:`, err);
      }
    }
  };

  // Start processing
  let processedCount = 0;
  let failedCount = 0;
  entities.forEach((entity) => {
    try {
      instantiateEntity(entity, new THREE.Matrix4(), "0");
      processedCount++;
    } catch (error) {
      console.error(`[DXF Viewer] Failed to process entity ${entity.type}:`, error);
      failedCount++;
    }
  });

  // Group holes with their containing outer loops for geometric hole creation
  const groupedShapes = groupHolesWithOuterLoops(outerLoops, holes);

  // Create shapes with geometric holes only if showShapeColors is enabled
  if (showShapeColors) {
    groupedShapes.forEach((shapeGroup, index) => {
      try {
        // Create geometry with actual geometric holes
        const shapeWithHolesGeometry = createShapeWithHoles(
          shapeGroup.outerLoop,
          shapeGroup.containedHoles
        );

        if (shapeWithHolesGeometry) {
          const fillMaterial = style.meshMaterial(
            style.resolve({
              kind: "fill",
              type: "SHAPE_WITH_HOLES",
              layer: shapeGroup.outerLoop.entities[0]?.layer || "0",
              shapeIndex: index,
            })
          );

          // Create mesh with geometric holes
          const shapeMesh = new THREE.Mesh(
            shapeWithHolesGeometry,
            fillMaterial
          );
          shapeMesh.userData = {
            entityType: "SHAPE_WITH_HOLES",
            shapeIndex: index,
            outerArea: shapeGroup.outerLoop.area,
            perimeter: shapeGroup.outerLoop.perimeter, // Add perimeter to userData
            holeCount: shapeGroup.containedHoles.length,
            totalHoleArea: shapeGroup.containedHoles.reduce(
              (sum, hole) => sum + hole.area,
              0
            ),
            layer: shapeGroup.outerLoop.entities[0]?.layer || "0",
          };

          // Slightly offset above the grid to be visible
          shapeMesh.position.z = 0.001;

          // Add to appropriate layer
          const layerName = shapeMesh.userData.layer;
          if (!layers[layerName]) {
            layers[layerName] = new THREE.Group();
            layers[layerName].userData = { name: layerName };
          }
          layers[layerName].add(shapeMesh);
          indexFillMesh(shapeMesh, layerName, "SHAPE_WITH_HOLES", index);

          objects.push(shapeMesh);
        }
      } catch (error) {
        console.error(
          `Failed to create shape with holes for group ${index}:`,
          error
        );

        // Fallback: create without holes if geometric hole creation fails
        try {
          const fallbackGeometry = createClosedShapeFromEntities(
            shapeGroup.outerLoop
          );
          if (fallbackGeometry) {
            const fallbackMaterial = style.meshMaterial(
              style.resolve({
                kind: "fill",
                type: "SHAPE_FILL",
                layer: shapeGroup.outerLoop.entities[0]?.layer || "0",
                shapeIndex: index,
              })
            );
            const fallbackMesh = new THREE.Mesh(
              fallbackGeometry,
              fallbackMaterial
            );
            fallbackMesh.position.z = 0.001;
            fallbackMesh.userData = {
              layer: shapeGroup.outerLoop.entities[0]?.layer || "0",
            };

            const layerName = fallbackMesh.userData.layer;
            if (!layers[layerName]) {
              layers[layerName] = new THREE.Group();
              layers[layerName].userData = { name: layerName };
            }
            layers[layerName].add(fallbackMesh);
            indexFillMesh(fallbackMesh, layerName, "SHAPE_FILL", index);

            objects.push(fallbackMesh);
          }
        } catch (fallbackError) {
          console.error(
            `Fallback also failed for group ${index}:`,
            fallbackError
          );
        }
      }
    });
  } else {
    // Skip shape creation when colors are disabled for better performance
  }

  // Merge the per-entity objects into one buffer per layer.
  //
  // The objects built above are what derived geometry was read from; from
  // here on they are scaffolding. Everything downstream — picking, snapping,
  // selection — reads the document, not the scene graph, so the scene graph
  // is free to be whatever draws fastest.
  let batchResult: BatchResult | null = null;
  if (batching) {
    batchResult = buildBatches(document, style);
    for (const entity of document.all()) {
      const range = batchResult.ranges.get(entity.id);
      if (range) {
        entity.object = range.batch.object;
        entity.batchRange = range;
      }
    }
    // The scaffolding objects are no longer referenced by anything.
    Object.values(layers).forEach((layerGroup) => {
      layerGroup.children.forEach((child) => {
        (child as Partial<THREE.Mesh>).geometry?.dispose();
      });
      layerGroup.clear();
    });
    layers = batchResult.layers;
  }

  // Create main group and add layer groups
  const group = new THREE.Group();

  Object.values(layers).forEach((layerGroup) => {
    if (layerGroup && layerGroup.children.length > 0) {
      group.add(layerGroup);
    }
  });
  

  // Position the DXF content so its left bottom point is at the origin
  const box = new THREE.Box3().setFromObject(group);
  if (!box.isEmpty()) {
    // Translate the group so its left bottom point is at (0, 0, 0) - the grid origin
    // Keep z at 0 so DXF content appears on top of the grid
    group.position.set(-box.min.x, -box.min.y, 0);
    document.worldOffset.copy(group.position);
  }

  geometryCache.clear();

  // Extract DXF header information for units
  let units = "Unknown";
  let unitsFormat = "Unknown";
  let measurement = "Unknown";
  let version = "Unknown";

  if (dxfData?.header) {
    // Get $ACADVER (DXF Version)
    const acadVer = dxfData.header.$ACADVER as string;
    if (acadVer) {
      const versionMap: Record<string, string> = {
        AC1006: "R10",
        AC1009: "R11/R12",
        AC1012: "R13",
        AC1014: "R14",
        AC1015: "2000",
        AC1018: "2004",
        AC1021: "2007",
        AC1024: "2010",
        AC1027: "2013",
        AC1032: "2018",
      };
      version = versionMap[acadVer] ? `AutoCAD ${versionMap[acadVer]} (${acadVer})` : acadVer;
    }

    // Get $INSUNITS (preferred - actual drawing units)
    const insunits = dxfData.header.$INSUNITS as number;
    if (insunits !== undefined) {
      switch (insunits) {
        case 0:
          units = "Unitless";
          break;
        case 1:
          units = "Inches";
          break;
        case 2:
          units = "Feet";
          break;
        case 3:
          units = "Miles";
          break;
        case 4:
          units = "Millimeters";
          break;
        case 5:
          units = "Centimeters";
          break;
        case 6:
          units = "Meters";
          break;
        case 7:
          units = "Kilometers";
          break;
        case 8:
          units = "Microinches";
          break;
        case 9:
          units = "Mils";
          break;
        case 10:
          units = "Yards";
          break;
        case 11:
          units = "Angstroms";
          break;
        case 12:
          units = "Nanometers";
          break;
        case 13:
          units = "Microns";
          break;
        case 14:
          units = "Decimeters";
          break;
        case 15:
          units = "Decameters";
          break;
        case 16:
          units = "Hectometers";
          break;
        case 17:
          units = "Gigameters";
          break;
        case 18:
          units = "Astronomical Units";
          break;
        case 19:
          units = "Light Years";
          break;
        case 20:
          units = "Parsecs";
          break;
        default:
          units = `INSUNITS Code ${insunits}`;
      }
    } else {
      // Fallback to $LUNITS (coordinate display format)
      const lunits = dxfData.header.$LUNITS as number;
      if (lunits !== undefined) {
        switch (lunits) {
          case 1:
            units = "Scientific Format";
            break;
          case 2:
            units = "Decimal Format";
            break;
          case 3:
            units = "Engineering Format";
            break;
          case 4:
            units = "Architectural Format";
            break;
          case 5:
            units = "Fractional Format";
            break;
          case 6:
            units = "Architectural Format";
            break;
          case 7:
            units = "Fractional Format";
            break;
          default:
            units = `LUNITS Code ${lunits}`;
        }
      }
    }

    // Get $LUNITS for display format information
    const lunits = dxfData.header.$LUNITS as number;
    if (lunits !== undefined) {
      switch (lunits) {
        case 1:
          unitsFormat = "Scientific";
          break;
        case 2:
          unitsFormat = "Decimal";
          break;
        case 3:
          unitsFormat = "Engineering";
          break;
        case 4:
          unitsFormat = "Architectural";
          break;
        case 5:
          unitsFormat = "Fractional";
          break;
        case 6:
          unitsFormat = "Architectural";
          break;
        case 7:
          unitsFormat = "Fractional";
          break;
        default:
          unitsFormat = `Code ${lunits}`;
      }
    }

    // Get $MEASUREMENT (English vs Metric flag)
    const measurementFlag = dxfData.header.$MEASUREMENT as number;
    if (measurementFlag !== undefined) {
      measurement = measurementFlag === 0 ? "English" : "Metric";
    }

    // Get Extents
    if (
      dxfData.header.$EXTMIN &&
      dxfData.header.$EXTMAX &&
      typeof dxfData.header.$EXTMIN === "object" &&
      typeof dxfData.header.$EXTMAX === "object"
    ) {
      const min = dxfData.header.$EXTMIN as { x: number; y: number; z: number };
      const max = dxfData.header.$EXTMAX as { x: number; y: number; z: number };
      stats["EXT_MIN_X"] = min.x;
      stats["EXT_MIN_Y"] = min.y;
      stats["EXT_MAX_X"] = max.x;
      stats["EXT_MAX_Y"] = max.y;
    }
  }

  // Update stats
  stats["DXF_VERSION"] = version;
  stats["DXF_UNITS"] = units;
  stats["DXF_UNITS_FORMAT"] = unitsFormat;
  stats["DXF_MEASUREMENT"] = measurement;
  stats["GRID_SIZE"] = 100; // From DxfViewer.tsx GRID_SIZE constant
  stats["GRID_DIVISIONS"] = 100; // Grid divisions (hardcoded for CAD-style grid)
  stats["GRID_UNIT_SIZE"] = 1; // 100 / 100 = 1 unit per division (1:1 ratio)

  if (outerLoops.length > 0 || holes.length > 0) {
    stats["TOTAL_CLOSED_LOOPS"] = outerLoops.length + holes.length;
    if (showShapeColors) {
      stats["SHAPES_WITH_HOLES"] = groupedShapes.length;
      stats["TOTAL_HOLES"] = holes.length;
      stats["GEOMETRIC_HOLES"] = holes.length;
      stats["DETECTION_METHOD"] = "GEOMETRIC_HOLES";
    } else {
      stats["DETECTION_METHOD"] = "DISABLED";
    }
  }

  const entityProcessingEndTime = performance.now();
  const totalEndTime = performance.now();
  // Performance tracking variables kept for potential future use

  return {
    document,
    group,
    stats,
    entities,
    parseError,
    dxfHeader: dxfData?.header,
    layers,
    layerTable,
  };
}
