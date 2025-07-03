import DxfParser, {
  IArcEntity,
  ICircleEntity,
  IEllipseEntity,
  IEntity,
  ILineEntity,
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

export interface ProcessDxfResult {
  group: THREE.Group;
  stats: Record<string, number>;
  entities: IEntity[];
  parseError: Error | null;
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
    const shape = new THREE.Shape();
    let currentPoint = loop.vertices[0];
    shape.moveTo(currentPoint.x, currentPoint.y);

    // Process each entity in the loop
    let vertexIndex = 0;

    for (const entity of loop.entities) {
      if (entity.type === "ARC") {
        // Handle arcs with proper curves
        const arc = entity as IArcEntity;
        if (
          arc.center &&
          arc.radius &&
          arc.startAngle !== undefined &&
          arc.endAngle !== undefined
        ) {
          // Calculate arc parameters
          const centerX = arc.center.x;
          const centerY = arc.center.y;
          const radius = arc.radius;
          const startAngle = arc.startAngle;
          let endAngle = arc.endAngle;

          // Ensure proper angle direction for shape creation
          if (endAngle < startAngle) {
            endAngle += Math.PI * 2;
          }

          // Use absarc for proper arc creation in shapes
          shape.absarc(centerX, centerY, radius, startAngle, endAngle, false);

          // Update current point to arc end
          currentPoint = {
            x: centerX + radius * Math.cos(endAngle),
            y: centerY + radius * Math.sin(endAngle),
          };
        } else {
          // Fallback to line segments for malformed arcs
          const arcVertices = loop.vertices.slice(
            vertexIndex,
            vertexIndex + 32
          );
          for (let i = 1; i < arcVertices.length; i++) {
            shape.lineTo(arcVertices[i].x, arcVertices[i].y);
          }
          vertexIndex += 32;
        }
      } else if (entity.type === "CIRCLE") {
        // Handle full circles
        const circle = entity as ICircleEntity;
        if (circle.center && circle.radius) {
          shape.absarc(
            circle.center.x,
            circle.center.y,
            circle.radius,
            0,
            Math.PI * 2,
            false
          );
        }
      } else if (entity.type === "LINE") {
        // Handle lines
        const line = entity as ILineEntity;
        if (line.vertices && line.vertices.length >= 2) {
          shape.lineTo(line.vertices[1].x, line.vertices[1].y);
          currentPoint = { x: line.vertices[1].x, y: line.vertices[1].y };
        }
        vertexIndex += 2;
      } else if (entity.type === "POLYLINE" || entity.type === "LWPOLYLINE") {
        // Handle polylines
        const poly = entity as IPolylineEntity;
        if (poly.vertices) {
          for (let i = 1; i < poly.vertices.length; i++) {
            shape.lineTo(poly.vertices[i].x, poly.vertices[i].y);
            currentPoint = { x: poly.vertices[i].x, y: poly.vertices[i].y };
          }
          vertexIndex += poly.vertices.length;
        }
      } else if (entity.type === "SPLINE") {
        // Handle splines with smooth curves
        const spline = entity as ISplineEntity;
        if (spline.controlPoints && spline.controlPoints.length >= 3) {
          const degree = spline.degreeOfSplineCurve || 3;
          const knots = spline.knotValues || [];

          if (knots.length > 0) {
            // Use B-spline evaluation for smooth curves
            const tMin = knots[degree] ?? knots[0] ?? 0;
            const tMax =
              knots[knots.length - degree - 1] ?? knots[knots.length - 1] ?? 1;

            if (tMin < tMax) {
              const numPoints = Math.max(20, spline.controlPoints.length * 5);
              const dt = (tMax - tMin) / (numPoints - 1);

              for (let i = 1; i <= numPoints; i++) {
                const t = tMin + i * dt;
                const point = evaluateSplinePoint(
                  t,
                  spline.controlPoints,
                  degree,
                  knots
                );
                if (point) {
                  shape.lineTo(point.x, point.y);
                  currentPoint = { x: point.x, y: point.y };
                }
              }
            }
          } else {
            // Fallback: use control points as line segments
            for (let i = 1; i < spline.controlPoints.length; i++) {
              const cp = spline.controlPoints[i];
              shape.lineTo(cp.x, cp.y);
              currentPoint = { x: cp.x, y: cp.y };
            }
          }
        }

        // Skip ahead in vertex array (splines use many vertices)
        const splineVertexCount = Math.min(
          50,
          loop.vertices.length - vertexIndex
        );
        vertexIndex += splineVertexCount;
      } else {
        // Fallback for other entity types - use vertices
        const remainingVertices = loop.vertices.slice(vertexIndex);
        const entityVertexCount = Math.min(10, remainingVertices.length);
        for (let i = 1; i < entityVertexCount; i++) {
          shape.lineTo(remainingVertices[i].x, remainingVertices[i].y);
        }
        vertexIndex += entityVertexCount;
      }
    }

    // Close the shape
    shape.closePath();

    return new THREE.ShapeGeometry(shape);
  } catch (error) {
    console.warn("Failed to create enhanced shape geometry:", error);
    // Fallback to simple vertex-based creation
    return createClosedShapeGeometry(loop.vertices);
  }
}

// Evaluate a point on the B-spline curve using De Boor's algorithm
// This is adapted from processors.ts but simplified for our needs
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

// Separate outer loops from holes using improved containment analysis
function separateOuterLoopsFromHoles(
  loops: Array<{
    entities: IEntity[];
    vertices: Array<{ x: number; y: number }>;
    area: number;
    perimeter: number;
  }>
) {
  const outerLoops: typeof loops = [];
  const holes: typeof loops = [];

  if (loops.length === 0) return { outerLoops, holes };

  // Sort loops by area (largest first) - outer boundaries are typically larger
  const sortedLoops = [...loops].sort(
    (a, b) => Math.abs(b.area) - Math.abs(a.area)
  );

  console.log("=== IMPROVED CONTAINMENT ANALYSIS ===");
  console.log(`Total loops to classify: ${sortedLoops.length}`);

  // Calculate area statistics for better classification
  const areas = sortedLoops.map((loop) => Math.abs(loop.area));
  const totalArea = areas.reduce((sum, area) => sum + area, 0);
  const avgArea = totalArea / areas.length;
  const medianArea = areas[Math.floor(areas.length / 2)];
  const maxArea = Math.max(...areas);

  console.log(
    `Area stats: max=${maxArea.toFixed(2)}, avg=${avgArea.toFixed(
      2
    )}, median=${medianArea.toFixed(2)}`
  );

  // Process loops in order of size (largest first)
  for (let i = 0; i < sortedLoops.length; i++) {
    const currentLoop = sortedLoops[i];
    const currentArea = Math.abs(currentLoop.area);
    let isHole = false;

    // Test containment against ALL previously classified outer loops
    for (const outerLoop of outerLoops) {
      if (isLoopContainedInLoopEnhanced(currentLoop, outerLoop)) {
        isHole = true;
        break;
      }
    }

    // If no containment found, apply enhanced heuristics
    if (!isHole && outerLoops.length > 0) {
      // Strong area-based heuristic: very small loops are likely holes
      const areaRatio = currentArea / maxArea;
      if (areaRatio < 0.1) {
        isHole = true;
        console.log(
          `Loop ${
            i + 1
          }: Classified as hole by strong area heuristic (ratio=${areaRatio.toFixed(
            4
          )})`
        );
      }
      // Medium area heuristic: check if significantly smaller than median outer loop
      else if (outerLoops.length > 5) {
        const outerAreas = outerLoops.map((loop) => Math.abs(loop.area));
        const avgOuterArea =
          outerAreas.reduce((sum, area) => sum + area, 0) / outerAreas.length;
        if (currentArea < avgOuterArea * 0.2) {
          isHole = true;
          console.log(
            `Loop ${i + 1}: Classified as hole by relative size heuristic`
          );
        }
      }
    }

    // Apply winding order heuristic as final check
    if (!isHole && outerLoops.length > 3) {
      const currentWinding = isClockwise(currentLoop.vertices);
      const outerWindings = outerLoops.map((loop) =>
        isClockwise(loop.vertices)
      );
      const majorityClockwise =
        outerWindings.filter(Boolean).length > outerWindings.length / 2;

      // If this loop has opposite winding from majority of outer loops, it might be a hole
      if (currentWinding !== majorityClockwise) {
        // Try relaxed containment test
        for (const outerLoop of outerLoops) {
          if (isLoopContainedInLoopVeryRelaxed(currentLoop, outerLoop)) {
            isHole = true;
            console.log(
              `Loop ${
                i + 1
              }: Classified as hole by winding + relaxed containment`
            );
            break;
          }
        }
      }
    }

    // Final classification
    if (isHole) {
      holes.push(currentLoop);
    } else {
      outerLoops.push(currentLoop);
    }

    // Debug info
    const areaRatio = (currentArea / maxArea).toFixed(4);
    const windingInfo = isClockwise(currentLoop.vertices) ? "CW" : "CCW";
    const classification = isHole ? "HOLE" : "OUTER";

    console.log(
      `Loop ${i + 1}: Area=${currentArea.toFixed(
        2
      )} (ratio=${areaRatio}), ${windingInfo}, Type=${classification}`
    );
  }

  console.log("=== END CONTAINMENT ANALYSIS ===");

  return { outerLoops, holes };
}

// Check if loopA is completely contained within loopB
function isLoopContainedInLoop(
  loopA: { vertices: Array<{ x: number; y: number }> },
  loopB: { vertices: Array<{ x: number; y: number }> }
): boolean {
  // Test multiple points from loopA to see if they're inside loopB
  const testIndices = [
    0,
    Math.floor(loopA.vertices.length * 0.25),
    Math.floor(loopA.vertices.length * 0.5),
    Math.floor(loopA.vertices.length * 0.75),
    Math.floor(loopA.vertices.length * 0.9),
  ];

  let containedCount = 0;
  let totalTests = 0;

  for (const index of testIndices) {
    if (index < loopA.vertices.length) {
      totalTests++;
      if (isPointInPolygon(loopA.vertices[index], loopB.vertices)) {
        containedCount++;
      }
    }
  }

  // Consider contained if at least 80% of test points are inside
  const containmentRatio = containedCount / totalTests;
  return containmentRatio >= 0.8;
}

// Relaxed containment test for edge cases (e.g., small holes near boundaries)
function isLoopContainedInLoopRelaxed(
  loopA: { vertices: Array<{ x: number; y: number }> },
  loopB: { vertices: Array<{ x: number; y: number }> }
): boolean {
  // Use more test points and lower threshold for small loops
  const testIndices = [
    0,
    Math.floor(loopA.vertices.length * 0.1),
    Math.floor(loopA.vertices.length * 0.3),
    Math.floor(loopA.vertices.length * 0.5),
    Math.floor(loopA.vertices.length * 0.7),
    Math.floor(loopA.vertices.length * 0.9),
  ];

  let containedCount = 0;
  let totalTests = 0;

  for (const index of testIndices) {
    if (index < loopA.vertices.length) {
      totalTests++;
      if (isPointInPolygon(loopA.vertices[index], loopB.vertices)) {
        containedCount++;
      }
    }
  }

  // Lower threshold for relaxed test
  const containmentRatio = containedCount / totalTests;
  return containmentRatio >= 0.5;
}

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

// Very relaxed containment test for edge cases
function isLoopContainedInLoopVeryRelaxed(
  loopA: { vertices: Array<{ x: number; y: number }> },
  loopB: { vertices: Array<{ x: number; y: number }> }
): boolean {
  if (loopA.vertices.length === 0 || loopB.vertices.length === 0) return false;

  // Test center point and a few edge points
  const centerA = calculateCentroid(loopA.vertices);
  let containedCount = 0;
  let totalTests = 1;

  // Test center point
  if (isPointInPolygon(centerA, loopB.vertices)) {
    containedCount++;
  }

  // Test a few vertices
  const testIndices = [
    0,
    Math.floor(loopA.vertices.length * 0.33),
    Math.floor(loopA.vertices.length * 0.66),
  ];
  for (const index of testIndices) {
    if (index < loopA.vertices.length) {
      totalTests++;
      if (isPointInPolygon(loopA.vertices[index], loopB.vertices)) {
        containedCount++;
      }
    }
  }

  // Very low threshold for very relaxed test
  return containedCount / totalTests >= 0.3;
}

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

// Helper function to calculate centroid
function calculateCentroid(vertices: Array<{ x: number; y: number }>) {
  let x = 0,
    y = 0;
  for (const vertex of vertices) {
    x += vertex.x;
    y += vertex.y;
  }
  return { x: x / vertices.length, y: y / vertices.length };
}

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

// Improved closed loop detection with better tolerance and connection logic
function findClosedLoopsImproved(entities: IEntity[]): Array<{
  entities: IEntity[];
  vertices: Array<{ x: number; y: number }>;
  area: number;
  perimeter: number;
}> {
  const loops: Array<{
    entities: IEntity[];
    vertices: Array<{ x: number; y: number }>;
    area: number;
    perimeter: number;
  }> = [];

  const visited = new Set<IEntity>();
  const TOLERANCE = 0.001; // Increased tolerance for better connection detection

  // Handle standalone circles and closed polylines first
  entities.forEach((entity) => {
    if (entity.type === "CIRCLE" && !visited.has(entity)) {
      visited.add(entity);
      const circle = entity as ICircleEntity;
      if (circle.center && circle.radius) {
        const vertices: Array<{ x: number; y: number }> = [];
        const segments = 32;
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          vertices.push({
            x: circle.center.x + circle.radius * Math.cos(angle),
            y: circle.center.y + circle.radius * Math.sin(angle),
          });
        }
        const area = Math.PI * circle.radius * circle.radius;
        const perimeter = 2 * Math.PI * circle.radius;
        loops.push({
          entities: [entity],
          vertices,
          area,
          perimeter,
        });
        console.log(`Found standalone circle with radius ${circle.radius}`);
      }
    }

    // Handle closed polylines (with shape flag set)
    if (
      (entity.type === "POLYLINE" || entity.type === "LWPOLYLINE") &&
      !visited.has(entity)
    ) {
      const poly = entity as IPolylineEntity;
      if (poly.shape === true || poly.vertices?.length > 2) {
        // Check if first and last vertices are close (indicating closed polyline)
        const firstVertex = poly.vertices[0];
        const lastVertex = poly.vertices[poly.vertices.length - 1];
        const isExplicitlyClosed = poly.shape === true;
        const isImplicitlyClosed =
          firstVertex &&
          lastVertex &&
          Math.abs(firstVertex.x - lastVertex.x) < TOLERANCE &&
          Math.abs(firstVertex.y - lastVertex.y) < TOLERANCE;

        if (isExplicitlyClosed || isImplicitlyClosed) {
          visited.add(entity);
          const vertices: Array<{ x: number; y: number }> = [];
          poly.vertices.forEach((vertex) => {
            vertices.push({ x: vertex.x, y: vertex.y });
          });

          // Ensure closure
          if (!isImplicitlyClosed && vertices.length > 0) {
            vertices.push({ x: vertices[0].x, y: vertices[0].y });
          }

          const area = calculatePolygonArea(vertices);
          const perimeter = calculatePolygonPerimeter(vertices);
          loops.push({
            entities: [entity],
            vertices,
            area,
            perimeter,
          });
          console.log(
            `Found closed polyline with ${poly.vertices.length} vertices`
          );
        }
      }
    }
  });

  // Handle other entities by tracing connections with multiple tolerance attempts
  entities.forEach((startEntity) => {
    if (visited.has(startEntity) || startEntity.type === "CIRCLE") return;

    // Try with standard tolerance first
    let loop = traceLoopImproved(startEntity, entities, visited, TOLERANCE);

    // If no loop found, try with increased tolerance for difficult connections
    if (!loop && !visited.has(startEntity)) {
      loop = traceLoopImproved(startEntity, entities, visited, TOLERANCE * 3);
    }

    // If still no loop found but entity has potential, try very relaxed tolerance
    if (
      !loop &&
      !visited.has(startEntity) &&
      (startEntity.type === "ARC" || startEntity.type === "LINE")
    ) {
      loop = traceLoopImproved(startEntity, entities, visited, TOLERANCE * 10);
    }

    if (loop) {
      loops.push(loop);
      console.log(
        `Found traced loop with ${
          loop.entities.length
        } entities, area: ${loop.area.toFixed(2)}`
      );
    } else if (!visited.has(startEntity)) {
      // Mark orphaned entities as visited to avoid infinite attempts
      visited.add(startEntity);
    }
  });

  console.log(
    `Total loops found: ${loops.length} (${
      entities.filter((e) => e.type === "CIRCLE").length
    } circles + ${
      loops.length - entities.filter((e) => e.type === "CIRCLE").length
    } traced)`
  );

  // Check for missed entities that might form simple shapes
  const unvisitedCount = entities.filter((e) => !visited.has(e)).length;
  if (unvisitedCount > 0) {
    console.log(
      `Warning: ${unvisitedCount} entities not included in any closed loop`
    );

    // Try to find very small closed paths with extremely relaxed tolerances
    const unvisited = entities.filter((e) => !visited.has(e));
    unvisited.forEach((startEntity) => {
      if (visited.has(startEntity)) return;

      // Try with very large tolerance for tiny disconnected segments
      const loop = traceLoopImproved(
        startEntity,
        entities,
        visited,
        TOLERANCE * 50
      );
      if (loop && loop.entities.length >= 3) {
        loops.push(loop);
        console.log(
          `Found additional loop with extreme tolerance: ${
            loop.entities.length
          } entities, area: ${loop.area.toFixed(2)}`
        );
      }
    });
  }

  return loops;
}

// Direct approach: treat each entity as potentially closed without complex tracing
function findAllClosedShapesDirectly(entities: IEntity[]): Array<{
  entities: IEntity[];
  vertices: Array<{ x: number; y: number }>;
  area: number;
  perimeter: number;
}> {
  const loops: Array<{
    entities: IEntity[];
    vertices: Array<{ x: number; y: number }>;
    area: number;
    perimeter: number;
  }> = [];

  console.log("=== DIRECT CLOSED SHAPE DETECTION ===");

  entities.forEach((entity, index) => {
    let isClosedShape = false;
    const vertices: Array<{ x: number; y: number }> = [];

    switch (entity.type) {
      case "CIRCLE": {
        const circle = entity as ICircleEntity;
        if (circle.center && circle.radius) {
          isClosedShape = true;
          const segments = 32;
          for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            vertices.push({
              x: circle.center.x + circle.radius * Math.cos(angle),
              y: circle.center.y + circle.radius * Math.sin(angle),
            });
          }
          console.log(`Entity ${index}: CIRCLE (radius=${circle.radius})`);
        }
        break;
      }

      case "POLYLINE":
      case "LWPOLYLINE": {
        const poly = entity as IPolylineEntity;
        if (poly.vertices && poly.vertices.length >= 3) {
          // Check various closed indicators
          const polyAny = poly as any;
          const hasShapeFlag = polyAny.shape === true;
          const hasClosedFlag = polyAny.closed === true;
          const hasShapeFlagAsNumber = polyAny.shape === 1;

          // Check if first/last vertices are same (geometric closure)
          const first = poly.vertices[0];
          const last = poly.vertices[poly.vertices.length - 1];
          const isGeometricallylosed =
            first &&
            last &&
            Math.abs(first.x - last.x) < 0.001 &&
            Math.abs(first.y - last.y) < 0.001;

          isClosedShape =
            hasShapeFlag ||
            hasClosedFlag ||
            hasShapeFlagAsNumber ||
            isGeometricallylosed;

          if (isClosedShape) {
            poly.vertices.forEach((vertex) => {
              vertices.push({ x: vertex.x, y: vertex.y });
            });
            console.log(
              `Entity ${index}: ${entity.type} (${poly.vertices.length} vertices, shape=${polyAny.shape}, closed=${polyAny.closed})`
            );
          }
        }
        break;
      }

      case "ELLIPSE": {
        const ellipse = entity as IEllipseEntity;
        if (ellipse.center && ellipse.majorAxisEndPoint && ellipse.axisRatio) {
          isClosedShape = true;
          // Generate ellipse vertices
          const segments = 32;
          const dx = ellipse.majorAxisEndPoint.x - ellipse.center.x;
          const dy = ellipse.majorAxisEndPoint.y - ellipse.center.y;
          const majorRadius = Math.sqrt(dx * dx + dy * dy);
          const minorRadius = majorRadius * ellipse.axisRatio;
          const rotation = Math.atan2(dy, dx);

          for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const x = majorRadius * Math.cos(angle);
            const y = minorRadius * Math.sin(angle);
            // Apply rotation
            const rotatedX = x * Math.cos(rotation) - y * Math.sin(rotation);
            const rotatedY = x * Math.sin(rotation) + y * Math.cos(rotation);
            vertices.push({
              x: ellipse.center.x + rotatedX,
              y: ellipse.center.y + rotatedY,
            });
          }
          console.log(`Entity ${index}: ELLIPSE`);
        }
        break;
      }

      case "SPLINE": {
        const spline = entity as ISplineEntity;
        if (spline.controlPoints && spline.controlPoints.length >= 3) {
          // Check if spline is closed
          const splineWithClosed = spline as ISplineEntity & {
            closed?: boolean | number;
          };
          const isClosedSpline =
            splineWithClosed.closed === true ||
            Number(splineWithClosed.closed) === 1;

          // Also check if first and last control points are the same (geometric closure)
          const firstPoint = spline.controlPoints[0];
          const lastPoint =
            spline.controlPoints[spline.controlPoints.length - 1];
          const isGeometricallylosed =
            firstPoint &&
            lastPoint &&
            Math.abs(firstPoint.x - lastPoint.x) < 0.001 &&
            Math.abs(firstPoint.y - lastPoint.y) < 0.001;

          // For SPLINEs, assume they're closed if they have enough control points
          // (since user said everything in DXF is closed)
          isClosedShape =
            isClosedSpline ||
            isGeometricallylosed ||
            spline.controlPoints.length >= 4;

          if (isClosedShape) {
            // Use the same spline evaluation from processors.ts
            const degree = spline.degreeOfSplineCurve || 3;
            const knots = spline.knotValues || [];

            if (knots.length > 0) {
              // Find valid parameter range
              const tMin = knots[degree] ?? knots[0] ?? 0;
              const tMax =
                knots[knots.length - degree - 1] ??
                knots[knots.length - 1] ??
                1;

              if (tMin < tMax) {
                // Generate vertices using De Boor's algorithm
                const numPoints = Math.max(
                  50,
                  spline.controlPoints.length * 10
                );
                const dt = (tMax - tMin) / (numPoints - 1);

                for (let i = 0; i <= numPoints; i++) {
                  const t = tMin + i * dt;
                  const point = evaluateSplinePoint(
                    t,
                    spline.controlPoints,
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
              spline.controlPoints.forEach((cp) => {
                vertices.push({ x: cp.x, y: cp.y });
              });
            }

            console.log(
              `Entity ${index}: SPLINE (${spline.controlPoints.length} control points, closed=${splineWithClosed.closed})`
            );
          }
        }
        break;
      }

      // For other entity types, check for potential closed shapes
      default: {
        // Check for any entity with vertices that might be closed
        const entityAny = entity as any;
        const hasVertices = entityAny.vertices;
        const hasShape = entityAny.shape;
        if (hasVertices && hasShape) {
          console.log(
            `Entity ${index}: ${entity.type} (potential closed shape with ${entityAny.vertices?.length} vertices)`
          );
        }
        break;
      }
    }

    if (isClosedShape && vertices.length >= 3) {
      const area = calculatePolygonArea(vertices);
      const perimeter = calculatePolygonPerimeter(vertices);
      loops.push({
        entities: [entity],
        vertices,
        area,
        perimeter,
      });
    }
  });

  console.log("=== END DIRECT DETECTION ===");
  return loops;
}

function traceLoopImproved(
  startEntity: IEntity,
  allEntities: IEntity[],
  visited: Set<IEntity>,
  tolerance: number
): {
  entities: IEntity[];
  vertices: Array<{ x: number; y: number }>;
  area: number;
  perimeter: number;
} | null {
  const loopEntities: IEntity[] = [];
  const vertices: Array<{ x: number; y: number }> = [];
  let currentEntity: IEntity | null = startEntity;
  const startPoint = getEntityStartPoint(currentEntity);
  const originalStartPoint = { ...startPoint };

  while (currentEntity) {
    visited.add(currentEntity);
    loopEntities.push(currentEntity);

    // Add vertices from entity
    addEntityVerticesImproved(currentEntity, vertices);

    const endPoint = getEntityEndPoint(currentEntity);

    // Check if we've closed the loop
    if (
      pointsEqualWithTolerance(endPoint, originalStartPoint, tolerance) &&
      loopEntities.length > 1
    ) {
      const area = calculatePolygonArea(vertices);
      const perimeter = calculatePolygonPerimeter(vertices);
      return {
        entities: loopEntities,
        vertices,
        area,
        perimeter,
      };
    }

    // Find next connected entity (check both start and end point connections)
    currentEntity = findNextConnectedEntity(
      endPoint,
      allEntities,
      visited,
      currentEntity,
      tolerance
    );
    if (!currentEntity) break;
  }

  return null;
}

function getEntityStartPoint(entity: IEntity): { x: number; y: number } {
  switch (entity.type) {
    case "LINE": {
      const line = entity as ILineEntity;
      return { x: line.vertices[0].x, y: line.vertices[0].y };
    }
    case "ARC": {
      const arc = entity as IArcEntity;
      // Normalize arc angles and handle potential angle issues
      const normalizedStartAngle = normalizeArcAngle(arc.startAngle);
      const point = {
        x: arc.center.x + arc.radius * Math.cos(normalizedStartAngle),
        y: arc.center.y + arc.radius * Math.sin(normalizedStartAngle),
      };
      return point;
    }
    case "POLYLINE":
    case "LWPOLYLINE": {
      const poly = entity as IPolylineEntity;
      return { x: poly.vertices[0].x, y: poly.vertices[0].y };
    }
    default:
      return { x: 0, y: 0 };
  }
}

function getEntityEndPoint(entity: IEntity): { x: number; y: number } {
  switch (entity.type) {
    case "LINE": {
      const line = entity as ILineEntity;
      return { x: line.vertices[1].x, y: line.vertices[1].y };
    }
    case "ARC": {
      const arc = entity as IArcEntity;
      // Normalize arc angles and handle potential angle issues
      const normalizedEndAngle = normalizeArcAngle(arc.endAngle);
      const point = {
        x: arc.center.x + arc.radius * Math.cos(normalizedEndAngle),
        y: arc.center.y + arc.radius * Math.sin(normalizedEndAngle),
      };
      return point;
    }
    case "POLYLINE":
    case "LWPOLYLINE": {
      const poly = entity as IPolylineEntity;
      const lastVertex = poly.vertices[poly.vertices.length - 1];
      return { x: lastVertex.x, y: lastVertex.y };
    }
    default:
      return { x: 0, y: 0 };
  }
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

function addEntityVerticesImproved(
  entity: IEntity,
  vertices: Array<{ x: number; y: number }>
) {
  switch (entity.type) {
    case "LINE": {
      const line = entity as ILineEntity;
      vertices.push(
        { x: line.vertices[0].x, y: line.vertices[0].y },
        { x: line.vertices[1].x, y: line.vertices[1].y }
      );
      break;
    }
    case "ARC": {
      const arc = entity as IArcEntity;
      const normalizedStartAngle = normalizeArcAngle(arc.startAngle);
      const normalizedEndAngle = normalizeArcAngle(arc.endAngle);

      // Handle angle span calculation (might cross 0 degrees)
      let angleSpan = normalizedEndAngle - normalizedStartAngle;
      if (angleSpan < 0) {
        angleSpan += 2 * Math.PI;
      }

      const segments = Math.max(8, Math.ceil((angleSpan * 16) / Math.PI));

      for (let i = 0; i <= segments; i++) {
        let angle = normalizedStartAngle + angleSpan * (i / segments);

        // Ensure angle stays in valid range
        if (angle >= 2 * Math.PI) {
          angle -= 2 * Math.PI;
        }

        vertices.push({
          x: arc.center.x + arc.radius * Math.cos(angle),
          y: arc.center.y + arc.radius * Math.sin(angle),
        });
      }
      break;
    }
    case "POLYLINE":
    case "LWPOLYLINE": {
      const poly = entity as IPolylineEntity;
      poly.vertices.forEach((vertex) => {
        vertices.push({ x: vertex.x, y: vertex.y });
      });
      break;
    }
  }
}

function findNextConnectedEntity(
  point: { x: number; y: number },
  entities: IEntity[],
  visited: Set<IEntity>,
  currentEntity: IEntity,
  tolerance: number
): IEntity | null {
  // Try with regular tolerance first
  let bestMatch = findEntityAtPoint(
    point,
    entities,
    visited,
    currentEntity,
    tolerance
  );

  // If no match found and we're dealing with arcs, try larger tolerance
  if (
    !bestMatch &&
    (currentEntity.type === "ARC" || entities.some((e) => e.type === "ARC"))
  ) {
    bestMatch = findEntityAtPoint(
      point,
      entities,
      visited,
      currentEntity,
      tolerance * 5
    );
    if (bestMatch) {
      console.log(
        `Found arc connection with increased tolerance: ${tolerance * 5}`
      );
    }
  }

  return bestMatch;
}

function findEntityAtPoint(
  point: { x: number; y: number },
  entities: IEntity[],
  visited: Set<IEntity>,
  currentEntity: IEntity,
  tolerance: number
): IEntity | null {
  let bestEntity: IEntity | null = null;
  let bestDistance = tolerance;

  for (const entity of entities) {
    if (visited.has(entity) || entity === currentEntity) continue;

    const startPoint = getEntityStartPoint(entity);
    const endPoint = getEntityEndPoint(entity);

    // Calculate distances to both start and end points
    const startDistance = Math.sqrt(
      Math.pow(point.x - startPoint.x, 2) + Math.pow(point.y - startPoint.y, 2)
    );
    const endDistance = Math.sqrt(
      Math.pow(point.x - endPoint.x, 2) + Math.pow(point.y - endPoint.y, 2)
    );

    // Find the closest connection within tolerance
    const minDistance = Math.min(startDistance, endDistance);
    if (minDistance < bestDistance) {
      bestDistance = minDistance;
      bestEntity = entity;
    }
  }

  // If no close match found and we're dealing with lines/arcs, try reverse direction matching
  if (!bestEntity && tolerance > 0.001) {
    for (const entity of entities) {
      if (visited.has(entity) || entity === currentEntity) continue;

      if (entity.type === "LINE") {
        const line = entity as ILineEntity;
        // Try connecting to the line in reverse direction
        const reverseStartDistance = Math.sqrt(
          Math.pow(point.x - line.vertices[1].x, 2) +
            Math.pow(point.y - line.vertices[1].y, 2)
        );
        const reverseEndDistance = Math.sqrt(
          Math.pow(point.x - line.vertices[0].x, 2) +
            Math.pow(point.y - line.vertices[0].y, 2)
        );

        const minReverseDistance = Math.min(
          reverseStartDistance,
          reverseEndDistance
        );
        if (minReverseDistance < bestDistance) {
          bestDistance = minReverseDistance;
          bestEntity = entity;
        }
      }
    }
  }

  return bestEntity;
}

function pointsEqualWithTolerance(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  tolerance: number
): boolean {
  return Math.abs(p1.x - p2.x) < tolerance && Math.abs(p1.y - p2.y) < tolerance;
}

function calculatePolygonArea(
  vertices: Array<{ x: number; y: number }>
): number {
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return Math.abs(area) / 2;
}

// Calculate signed area to determine winding order
function calculateSignedPolygonArea(
  vertices: Array<{ x: number; y: number }>
): number {
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return area / 2;
}

// Check if polygon is wound clockwise (negative area) or counterclockwise (positive area)
function isClockwise(vertices: Array<{ x: number; y: number }>): boolean {
  return calculateSignedPolygonArea(vertices) < 0;
}

function calculatePolygonPerimeter(
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

export function processDxf(
  dxfContent: string,
  material: THREE.Material
): ProcessDxfResult {
  // Parse DXF
  let entities: IEntity[] = [];
  let parseError: Error | null = null;
  try {
    const dxf = new DxfParser().parseSync(dxfContent);
    entities = dxf?.entities || [];
  } catch (error) {
    parseError =
      error instanceof Error ? error : new Error("Failed to parse DXF");
    return { group: new THREE.Group(), stats: {}, entities: [], parseError };
  }

  // Debug entity counts by type
  const entityCounts: Record<string, number> = {};
  entities.forEach((entity) => {
    entityCounts[entity.type] = (entityCounts[entity.type] || 0) + 1;
  });
  console.log("Entity type counts:", entityCounts);

  // Check for unclosed polylines that might form closed shapes
  let unclosedPolylineCount = 0;
  let closedPolylineCount = 0;
  entities.forEach((entity) => {
    if (entity.type === "POLYLINE" || entity.type === "LWPOLYLINE") {
      const poly = entity as IPolylineEntity;
      if (poly.shape === true) {
        closedPolylineCount++;
      } else if (poly.vertices && poly.vertices.length > 2) {
        const first = poly.vertices[0];
        const last = poly.vertices[poly.vertices.length - 1];
        const distance = Math.sqrt(
          Math.pow(first.x - last.x, 2) + Math.pow(first.y - last.y, 2)
        );
        if (distance < 0.01) {
          closedPolylineCount++;
        } else {
          unclosedPolylineCount++;
        }
      }
    }
  });
  console.log(
    `Polyline analysis: ${closedPolylineCount} closed, ${unclosedPolylineCount} unclosed`
  );

  // Debug: Check what we're actually getting from DXF parser
  console.log(`=== DXF PARSING DEBUG ===`);
  console.log(`Total entities from parser: ${entities.length}`);

  // Group entities by type with detailed info
  const entityDetails: Record<string, any[]> = {};
  entities.forEach((entity, index) => {
    if (!entityDetails[entity.type]) {
      entityDetails[entity.type] = [];
    }
    entityDetails[entity.type].push({
      index,
      entity,
      hasShapeFlag: (entity as any).shape,
      hasVertices: !!(entity as any).vertices,
      vertexCount: (entity as any).vertices?.length || 0,
      hasCenter: !!(entity as any).center,
      hasRadius: !!(entity as any).radius,
    });
  });

  Object.entries(entityDetails).forEach(([type, details]) => {
    console.log(`${type}: ${details.length} entities`);
    if (type === "POLYLINE" || type === "LWPOLYLINE") {
      const withShapeFlag = details.filter(
        (d) => d.hasShapeFlag === true
      ).length;
      const withVertices = details.filter((d) => d.hasVertices).length;
      console.log(`  - With shape=true: ${withShapeFlag}`);
      console.log(`  - With vertices: ${withVertices}`);
      console.log(
        `  - Sample vertex counts: ${details
          .slice(0, 5)
          .map((d) => d.vertexCount)
          .join(", ")}`
      );
    }
  });
  console.log(`=== END DXF DEBUG ===`);

  // Find closed loops for filling with improved detection
  const closedLoops = findClosedLoopsImproved(entities);
  console.log(`Found ${closedLoops.length} total closed loops`);

  // Since user says everything in DXF is closed, try alternative approach
  const directClosedLoops = findAllClosedShapesDirectly(entities);
  console.log(
    `Direct approach found: ${directClosedLoops.length} closed shapes`
  );

  // Use the approach that finds more loops
  const bestLoops =
    directClosedLoops.length > closedLoops.length
      ? directClosedLoops
      : closedLoops;
  console.log(
    `Using ${
      bestLoops === directClosedLoops ? "direct" : "improved"
    } approach with ${bestLoops.length} loops`
  );

  // Separate outer loops from holes
  const { outerLoops, holes } = separateOuterLoopsFromHoles(bestLoops);
  console.log(
    `Identified ${outerLoops.length} outer loops and ${holes.length} holes`
  );

  // Debug classification details
  console.log("=== LOOP CLASSIFICATION DEBUG ===");
  outerLoops.forEach((loop, i) => {
    console.log(
      `OUTER ${i + 1}: Area=${loop.area.toFixed(2)}, Entities=${
        loop.entities.length
      }, Perimeter=${loop.perimeter.toFixed(2)}`
    );
  });
  holes.forEach((hole, i) => {
    console.log(
      `HOLE ${i + 1}: Area=${hole.area.toFixed(2)}, Entities=${
        hole.entities.length
      }, Perimeter=${hole.perimeter.toFixed(2)}`
    );
  });
  console.log("=== END DEBUG ===");

  // Create a set of entities that are part of closed loops
  const closedLoopEntities = new Set();
  closedLoops.forEach((loop) => {
    loop.entities.forEach((entity) => {
      closedLoopEntities.add(entity);
    });
  });

  // Process entities
  const stats: Record<string, number> = {};
  const objects: THREE.Object3D[] = [];
  const geometryCache = new Map<string, THREE.BufferGeometry>();

  // Process regular entities (lines only)
  entities.forEach((entity) => {
    try {
      let object: THREE.Object3D | null = null;
      stats[entity.type] = (stats[entity.type] || 0) + 1;

      const cacheKey = `${entity.type}-${JSON.stringify(entity)}`;
      let geometry = geometryCache.get(cacheKey);

      if (!geometry) {
        switch (entity.type) {
          case "LINE":
            object = processLine(entity as ILineEntity, material);
            break;
          case "ARC":
            object = processArc(entity as IArcEntity, material);
            break;
          case "CIRCLE":
            object = processCircle(entity as ICircleEntity, material);
            break;
          case "LWPOLYLINE":
          case "POLYLINE":
            object = processPolyline(entity as IPolylineEntity, material);
            break;
          case "SPLINE":
            object = processSpline(entity as ISplineEntity, material);
            break;
          case "ELLIPSE":
            object = processEllipse(entity as IEllipseEntity, material);
            break;
          case "POINT":
            object = processPoint(entity as IPointEntity, material);
            break;
          case "TEXT":
          case "MTEXT":
            object = processText(entity as ITextEntity, material);
            break;
        }

        if (object instanceof THREE.Line) {
          geometry = object.geometry;
          if (geometry) geometryCache.set(cacheKey, geometry);
        }
      }

      if (geometry) {
        object = new THREE.Line(geometry, material);
      }

      if (object) {
        // Add userData to track if this entity is part of a closed loop
        object.userData = {
          entityType: entity.type,
          isClosedLoop: closedLoopEntities.has(entity),
        };
        objects.push(object);
      }
    } catch (err) {
      console.error("Failed to process entity:", entity.type, err);
    }
  });

  // Process outer loops - create filled shapes
  outerLoops.forEach((loop, index) => {
    try {
      // Create filled geometry
      const shapeGeometry = createClosedShapeFromEntities(loop);
      if (shapeGeometry) {
        // Generate contrasting color for this shape
        const fillColor = generateContrastingColor(index);

        // Create filled material with some transparency
        const fillMaterial = new THREE.MeshBasicMaterial({
          color: fillColor,
          opacity: 0.7,
          transparent: true,
          side: THREE.DoubleSide,
        });

        // Create filled mesh
        const fillMesh = new THREE.Mesh(shapeGeometry, fillMaterial);
        fillMesh.userData = {
          entityType: "CLOSED_LOOP_FILL",
          loopIndex: index,
          area: loop.area,
          perimeter: loop.perimeter,
        };

        // Slightly offset the fill behind the lines to avoid z-fighting
        fillMesh.position.z = -0.001;

        objects.push(fillMesh);

        console.log(
          `Created filled shape ${index + 1} with color #${fillColor
            .toString(16)
            .padStart(6, "0")}`
        );
      }
    } catch (error) {
      console.error(`Failed to create filled shape for loop ${index}:`, error);
    }
  });

  // Process holes - create transparent/background fills to cut out areas
  holes.forEach((hole, index) => {
    try {
      // Create hole geometry
      const holeGeometry = createClosedShapeFromEntities(hole);
      if (holeGeometry) {
        // Create transparent/background material to "cut out" the hole
        const holeMaterial = new THREE.MeshBasicMaterial({
          color: 0xffffff, // White background color
          opacity: 0.95, // Nearly opaque to effectively cut out the area
          transparent: true,
          side: THREE.DoubleSide,
        });

        // Create hole mesh
        const holeMesh = new THREE.Mesh(holeGeometry, holeMaterial);
        holeMesh.userData = {
          entityType: "HOLE_FILL",
          holeIndex: index,
          area: hole.area,
          perimeter: hole.perimeter,
        };

        // Position hole slightly above the main fills to create cutout effect
        holeMesh.position.z = 0.0005;

        objects.push(holeMesh);

        console.log(`Created hole cutout ${index + 1}`);
      }
    } catch (error) {
      console.error(`Failed to create hole cutout for hole ${index}:`, error);
    }
  });

  // Create group and add objects
  const group = new THREE.Group();
  objects.forEach((obj) => group.add(obj));
  geometryCache.clear();

  // Update stats
  if (outerLoops.length > 0 || holes.length > 0) {
    stats["FILLED_SHAPES"] = outerLoops.length;
    stats["HOLE_CUTOUTS"] = holes.length;
    stats["TOTAL_CLOSED_LOOPS"] = bestLoops.length;
    stats["TOTAL_FILLS"] = outerLoops.length + holes.length;
    stats["DETECTION_METHOD"] =
      bestLoops === directClosedLoops ? "DIRECT" : "TRACED";
  }

  return { group, stats, entities, parseError };
}
