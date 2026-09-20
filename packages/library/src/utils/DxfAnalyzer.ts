import {
  IArcEntity,
  ICircleEntity,
  IEntity,
  ILineEntity,
  ILwpolylineEntity,
  IPolylineEntity,
  ISplineEntity,
} from "dxf-parser";
import { PointIndex } from "./PointIndex";

interface Point2D {
  x: number;
  y: number;
}

interface ClosedLoop {
  entities: IEntity[];
  vertices: Point2D[];
  area: number;
  perimeter: number;
}

interface Endpoint {
  x: number;
  y: number;
  entityIndex: number;
  isStart: boolean;
}

// Type guards for entity types
function isLineEntity(entity: IEntity): entity is ILineEntity {
  return entity.type === "LINE";
}

function isPolylineEntity(entity: IEntity): entity is IPolylineEntity {
  return entity.type === "POLYLINE" || entity.type === "LWPOLYLINE";
}

function isLwpolylineEntity(entity: IEntity): entity is ILwpolylineEntity {
  return entity.type === "LWPOLYLINE";
}

function isArcEntity(entity: IEntity): entity is IArcEntity {
  return entity.type === "ARC";
}

function isCircleEntity(entity: IEntity): entity is ICircleEntity {
  return entity.type === "CIRCLE";
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

// Helper function to check if an arc is a full circle
function isFullCircleArc(entity: IArcEntity): boolean {
  if (!entity.startAngle || !entity.endAngle) return false;
  const angleDiff = Math.abs(entity.endAngle - entity.startAngle);
  // Check both radians and degrees (some DXF files might have degree values)
  return angleDiff >= 2 * Math.PI - 0.01 || angleDiff >= 360 - 0.1;
}

export class DxfAnalyzer {
  // Use precise tolerance for exact connections
  private static TOLERANCE = 0.01;
  private static FALLBACK_TOLERANCES = [0.01, 0.1, 0.5, 1.0];

  static findClosedLoops(dxf: { entities: IEntity[] }): ClosedLoop[] {
    if (!dxf?.entities) return [];

    const entities = dxf.entities;

    // Handle circles separately - they are always closed loops
    const loops: ClosedLoop[] = [];
    const processedEntities: IEntity[] = [];

    // Add circles and closed polylines as individual closed loops
    entities.forEach((entity) => {
      if (isCircleEntity(entity)) {
        const loop = this.createCircleLoop(entity);
        if (loop) {
          loops.push(loop);
        }
      } else if (isArcEntity(entity) && isFullCircleArc(entity)) {
        const loop = this.createFullCircleArcLoop(entity);
        if (loop) {
          loops.push(loop);
        }
      } else if (isSplineEntity(entity) && this.isClosedSpline(entity)) {
        const loop = this.createSplineLoop(entity);
        if (loop) {
          loops.push(loop);
        }
      } else if (
        isLwpolylineEntity(entity) &&
        this.isClosedLwpolyline(entity)
      ) {
        const loop = this.createLwpolylineLoop(entity);
        if (loop) {
          loops.push(loop);
        }
      } else if (
        isPolylineEntity(entity) &&
        entity.type === "POLYLINE" &&
        this.isClosedRegularPolyline(entity as IPolylineEntity)
      ) {
        const loop = this.createPolylineLoop(entity as IPolylineEntity);
        if (loop) {
          loops.push(loop);
        }
      } else {
        processedEntities.push(entity);
      }
    });

    // Process remaining entities with connectivity analysis
    if (processedEntities.length > 0) {
      const connectedLoops = this.findConnectedLoops(processedEntities);
      loops.push(...connectedLoops);
    }

    return loops;
  }

  private static createCircleLoop(entity: ICircleEntity): ClosedLoop | null {
    if (!entity.center || typeof entity.radius !== "number") return null;

    const vertices: Point2D[] = [];
    const center = entity.center;
    const radius = entity.radius;
    const segments = 32;

    for (let i = 0; i <= segments; i++) {
      const angle = (2 * Math.PI * i) / segments;
      vertices.push({
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
      });
    }

    return {
      entities: [entity],
      vertices,
      area: Math.PI * radius * radius,
      perimeter: 2 * Math.PI * radius,
    };
  }

  private static createFullCircleArcLoop(
    entity: IArcEntity
  ): ClosedLoop | null {
    if (!entity.center || typeof entity.radius !== "number") return null;

    const vertices: Point2D[] = [];
    const center = entity.center;
    const radius = entity.radius;
    const segments = 32;

    for (let i = 0; i <= segments; i++) {
      const angle = (2 * Math.PI * i) / segments;
      vertices.push({
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
      });
    }

    return {
      entities: [entity],
      vertices,
      area: Math.PI * radius * radius,
      perimeter: 2 * Math.PI * radius,
    };
  }

  private static isClosedSpline(entity: ISplineEntity): boolean {
    if (!entity.controlPoints || entity.controlPoints.length < 3) return false;

    // Check if spline is marked as closed in DXF data
    const splineWithClosed = entity as ISplineEntity & {
      closed?: boolean | number;
    };
    const isClosedFlag =
      (typeof splineWithClosed.closed === "boolean" &&
        splineWithClosed.closed === true) ||
      (typeof splineWithClosed.closed === "number" &&
        splineWithClosed.closed === 1);

    // Also check if first and last control points are the same (geometric closure)
    const firstPoint = entity.controlPoints[0];
    const lastPoint = entity.controlPoints[entity.controlPoints.length - 1];
    const isGeometricallylosed =
      firstPoint &&
      lastPoint &&
      Math.abs(firstPoint.x - lastPoint.x) < 0.001 &&
      Math.abs(firstPoint.y - lastPoint.y) < 0.001;

    // For splines, assume they're closed if they have enough control points
    // (since user expects everything in DXF to be closed)
    return (
      isClosedFlag || isGeometricallylosed || entity.controlPoints.length >= 4
    );
  }

  private static isClosedPolyline(
    entity: IPolylineEntity | ILwpolylineEntity
  ): boolean {
    if (!entity.vertices || entity.vertices.length < 3) return false;

    // Handle LWPOLYLINE and POLYLINE separately due to different structures
    if (entity.type === "LWPOLYLINE") {
      return this.isClosedLwpolyline(entity as ILwpolylineEntity);
    } else if (entity.type === "POLYLINE") {
      return this.isClosedRegularPolyline(entity as IPolylineEntity);
    }

    return false;
  }

  private static isClosedLwpolyline(entity: ILwpolylineEntity): boolean {
    // LWPOLYLINE uses 'shape' property (lwpolyline.js line 20)
    // entity.shape = ((curr.value & 1) === 1) - boolean true/false
    const isClosedByShape = entity.shape === true;

    // Check geometric closure for LWPOLYLINE vertices
    let isGeometricallyClosed = false;
    if (entity.vertices && entity.vertices.length >= 3) {
      const first = entity.vertices[0];
      const last = entity.vertices[entity.vertices.length - 1];

      if (
        first &&
        last &&
        typeof first.x === "number" &&
        typeof first.y === "number" &&
        typeof last.x === "number" &&
        typeof last.y === "number"
      ) {
        const distance = Math.sqrt(
          Math.pow(first.x - last.x, 2) + Math.pow(first.y - last.y, 2)
        );
        isGeometricallyClosed = distance < 0.001;
      }
    }

    const result = isClosedByShape || isGeometricallyClosed;
    return result;
  }

  private static isClosedRegularPolyline(entity: IPolylineEntity): boolean {
    // POLYLINE also uses 'shape' property (polyline.js line 29)
    // entity.shape = (curr.value & 1) !== 0 - boolean true/false
    const isClosedByShape = entity.shape === true;

    // Note: POLYLINE vertices are IVertexEntity objects, more complex structure
    const result = isClosedByShape;
    return result;
  }

  private static createSplineLoop(entity: ISplineEntity): ClosedLoop | null {
    if (!entity.controlPoints || entity.controlPoints.length < 3) return null;

    const vertices: Point2D[] = [];
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

    if (vertices.length < 3) return null;

    const area = this.calculateArea(vertices);
    const perimeter = this.calculatePerimeter(vertices);

    return {
      entities: [entity],
      vertices,
      area: Math.abs(area),
      perimeter,
    };
  }

  private static createLwpolylineLoop(
    entity: ILwpolylineEntity
  ): ClosedLoop | null {
    if (!entity.vertices || entity.vertices.length < 3) return null;

    const vertices: Point2D[] = [];

    // LWPOLYLINE vertices are {x, y, z?, startWidth, endWidth, bulge}
    entity.vertices.forEach((vertex) => {
      vertices.push({ x: vertex.x, y: vertex.y });
    });

    if (vertices.length < 3) return null;

    const area = this.calculateArea(vertices);
    const perimeter = this.calculatePerimeter(vertices);

    return {
      entities: [entity],
      vertices,
      area: Math.abs(area),
      perimeter,
    };
  }

  private static createPolylineLoop(
    entity: IPolylineEntity
  ): ClosedLoop | null {
    if (!entity.vertices || entity.vertices.length < 3) return null;

    const vertices: Point2D[] = [];

    // POLYLINE vertices are IVertexEntity objects with more complex structure
    entity.vertices.forEach((vertex) => {
      if (typeof vertex.x === "number" && typeof vertex.y === "number") {
        vertices.push({ x: vertex.x, y: vertex.y });
      }
    });

    if (vertices.length < 3) return null;

    const area = this.calculateArea(vertices);
    const perimeter = this.calculatePerimeter(vertices);

    return {
      entities: [entity],
      vertices,
      area: Math.abs(area),
      perimeter,
    };
  }

  private static findConnectedLoops(entities: IEntity[]): ClosedLoop[] {
    const loops: ClosedLoop[] = [];

    // Try different tolerance levels
    for (const tolerance of this.FALLBACK_TOLERANCES) {
      this.TOLERANCE = tolerance;

      const connectedGroups = this.analyzeConnectivity(entities);

      for (const group of connectedGroups) {
        const loop = this.traceConnectedLoop(group, entities);
        if (loop && loop.entities.length >= 1) {
          loops.push(loop);
        }
      }

      // If we found good results, don't try larger tolerances
      if (loops.length > 50) break;
    }

    return this.removeDuplicateLoops(loops);
  }

  private static analyzeConnectivity(entities: IEntity[]): number[][] {
    // Extract all endpoints from entities
    const endpoints: Endpoint[] = [];

    entities.forEach((entity, index) => {
      const entityEndpoints = this.getEntityEndpoints(entity, index);
      endpoints.push(...entityEndpoints);
    });

    if (endpoints.length < 4) {
      return [];
    }

    // Bucket endpoints spatially and by owning entity, so the flood fill
    // below is a constant-time lookup per endpoint rather than a scan of
    // every endpoint in the drawing.
    const index = new PointIndex<Endpoint>(this.TOLERANCE);
    index.addAll(endpoints);

    const byEntity = new Map<number, Endpoint[]>();
    for (const endpoint of endpoints) {
      const bucket = byEntity.get(endpoint.entityIndex);
      if (bucket) bucket.push(endpoint);
      else byEntity.set(endpoint.entityIndex, [endpoint]);
    }

    // Build connectivity graph using flood-fill
    const visited = new Set<number>();
    const connectedGroups: number[][] = [];

    for (let i = 0; i < entities.length; i++) {
      if (visited.has(i)) continue;

      const group: number[] = [];
      const toProcess = [i];

      while (toProcess.length > 0) {
        const current = toProcess.pop()!;
        if (visited.has(current)) continue;

        visited.add(current);
        group.push(current);

        for (const endpoint of byEntity.get(current) ?? []) {
          for (const neighbour of index.near(endpoint.x, endpoint.y)) {
            if (
              neighbour.entityIndex !== current &&
              !visited.has(neighbour.entityIndex)
            ) {
              toProcess.push(neighbour.entityIndex);
            }
          }
        }
      }

      if (group.length >= 1) {
        // Include single entities that might be closed shapes (like
        // LWPOLYLINE). Multi-entity groups need at least 3 entities for
        // meaningful loops.
        connectedGroups.push(group);
      }
    }

    return connectedGroups;
  }

  private static getEntityEndpoints(
    entity: IEntity,
    index: number
  ): Endpoint[] {
    const endpoints: Endpoint[] = [];

    if (isLineEntity(entity)) {
      if (entity.vertices && entity.vertices.length >= 2) {
        const start = entity.vertices[0];
        const end = entity.vertices[entity.vertices.length - 1];

        if (
          start &&
          typeof start.x === "number" &&
          typeof start.y === "number"
        ) {
          endpoints.push({
            x: start.x,
            y: start.y,
            entityIndex: index,
            isStart: true,
          });
        }
        if (end && typeof end.x === "number" && typeof end.y === "number") {
          endpoints.push({
            x: end.x,
            y: end.y,
            entityIndex: index,
            isStart: false,
          });
        }
      }
    } else if (isArcEntity(entity) && !isFullCircleArc(entity)) {
      if (entity.center && typeof entity.radius === "number") {
        // Calculate arc endpoints more precisely
        const startAngle = entity.startAngle || 0;
        const endAngle = entity.endAngle || 0;

        const startPoint = {
          x: entity.center.x + entity.radius * Math.cos(startAngle),
          y: entity.center.y + entity.radius * Math.sin(startAngle),
        };

        const endPoint = {
          x: entity.center.x + entity.radius * Math.cos(endAngle),
          y: entity.center.y + entity.radius * Math.sin(endAngle),
        };

        endpoints.push({ ...startPoint, entityIndex: index, isStart: true });
        endpoints.push({ ...endPoint, entityIndex: index, isStart: false });
      }
    } else if (isPolylineEntity(entity)) {
      if (entity.vertices && entity.vertices.length >= 2) {
        const start = entity.vertices[0];
        const end = entity.vertices[entity.vertices.length - 1];

        if (
          start &&
          typeof start.x === "number" &&
          typeof start.y === "number"
        ) {
          endpoints.push({
            x: start.x,
            y: start.y,
            entityIndex: index,
            isStart: true,
          });
        }
        if (end && typeof end.x === "number" && typeof end.y === "number") {
          endpoints.push({
            x: end.x,
            y: end.y,
            entityIndex: index,
            isStart: false,
          });
        }
      }
    } else if (isSplineEntity(entity)) {
      if (entity.controlPoints && entity.controlPoints.length > 0) {
        const degree = entity.degreeOfSplineCurve || 3;
        const knots = entity.knotValues || [];

        if (knots.length > 0) {
          // Try to evaluate the start and end points using De Boor's algorithm
          const tMin = knots[degree] ?? knots[0] ?? 0;
          const tMax =
            knots[knots.length - degree - 1] ?? knots[knots.length - 1] ?? 1;

          const startPoint = evaluateSplinePoint(
            tMin,
            entity.controlPoints,
            degree,
            knots
          );
          const endPoint = evaluateSplinePoint(
            tMax,
            entity.controlPoints,
            degree,
            knots
          );

          if (startPoint) {
            endpoints.push({
              x: startPoint.x,
              y: startPoint.y,
              entityIndex: index,
              isStart: true,
            });
          }

          if (endPoint) {
            endpoints.push({
              x: endPoint.x,
              y: endPoint.y,
              entityIndex: index,
              isStart: false,
            });
          }
        } else {
          // Fallback to first and last control points
          const start = entity.controlPoints[0];
          const end = entity.controlPoints[entity.controlPoints.length - 1];

          if (
            start &&
            typeof start.x === "number" &&
            typeof start.y === "number"
          ) {
            endpoints.push({
              x: start.x,
              y: start.y,
              entityIndex: index,
              isStart: true,
            });
          }
          if (end && typeof end.x === "number" && typeof end.y === "number") {
            endpoints.push({
              x: end.x,
              y: end.y,
              entityIndex: index,
              isStart: false,
            });
          }
        }
      }
    }

    return endpoints;
  }

  private static traceConnectedLoop(
    groupIndices: number[],
    entities: IEntity[]
  ): ClosedLoop | null {
    const groupEntities = groupIndices.map((i) => entities[i]);

    // Handle single entities that can form closed loops
    if (groupEntities.length === 1) {
      const entity = groupEntities[0];

      // Check if this single entity represents a closed shape
      if (isPolylineEntity(entity)) {
        const isClosed = this.isClosedPolyline(entity);

        if (isClosed) {
          const vertices: Point2D[] = [];
          this.addEntityVertices(entity, vertices);

          if (vertices.length >= 3) {
            const area = this.calculateArea(vertices);
            const perimeter = this.calculatePerimeter(vertices);

            return {
              entities: groupEntities,
              vertices,
              area: Math.abs(area),
              perimeter,
            };
          }
        }
      }

      // Single entities that aren't closed shapes should be skipped
      return null;
    }

    if (groupEntities.length === 0) {
      return null;
    }

    const vertices: Point2D[] = [];

    // Add vertices from all entities in the group (no complex ordering)
    for (const entity of groupEntities) {
      this.addEntityVertices(entity, vertices);
    }

    if (vertices.length < 3) return null;

    const area = this.calculateArea(vertices);
    const perimeter = this.calculatePerimeter(vertices);

    return {
      entities: groupEntities,
      vertices,
      area: Math.abs(area),
      perimeter,
    };
  }

  private static addEntityVertices(entity: IEntity, vertices: Point2D[]) {
    if (isLineEntity(entity)) {
      if (entity.vertices && entity.vertices.length >= 2) {
        entity.vertices.forEach((vertex) => {
          vertices.push({ x: vertex.x, y: vertex.y });
        });
      }
    } else if (isPolylineEntity(entity)) {
      if (entity.vertices) {
        entity.vertices.forEach((vertex) => {
          vertices.push({ x: vertex.x, y: vertex.y });
        });
      }
    } else if (isArcEntity(entity)) {
      if (entity.center && typeof entity.radius === "number") {
        const center = entity.center;
        const radius = entity.radius;
        const startAngle = entity.startAngle || 0;
        const endAngle = entity.endAngle || Math.PI * 2;

        const segments = Math.max(
          8,
          Math.ceil((Math.abs(endAngle - startAngle) * 16) / Math.PI)
        );

        for (let i = 0; i <= segments; i++) {
          const angle = startAngle + (endAngle - startAngle) * (i / segments);
          vertices.push({
            x: center.x + radius * Math.cos(angle),
            y: center.y + radius * Math.sin(angle),
          });
        }
      }
    } else if (isSplineEntity(entity)) {
      if (entity.controlPoints && entity.controlPoints.length >= 3) {
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

  private static removeDuplicateLoops(loops: ClosedLoop[]): ClosedLoop[] {
    const uniqueLoops: ClosedLoop[] = [];

    for (const loop of loops) {
      const entityIds = loop.entities
        .map((e) => `${e.type}-${JSON.stringify(e)}`)
        .sort();
      const signature = entityIds.join("|");

      const isDuplicate = uniqueLoops.some((existing) => {
        const existingIds = existing.entities
          .map((e) => `${e.type}-${JSON.stringify(e)}`)
          .sort();
        const existingSignature = existingIds.join("|");
        return signature === existingSignature;
      });

      if (!isDuplicate) {
        uniqueLoops.push(loop);
      }
    }

    return uniqueLoops;
  }

  private static pointsEqual(p1: Point2D, p2: Point2D): boolean {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy) <= this.TOLERANCE;
  }

  private static calculateArea(vertices: Point2D[]): number {
    if (vertices.length < 3) return 0;

    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length;
      area += vertices[i].x * vertices[j].y;
      area -= vertices[j].x * vertices[i].y;
    }
    return area / 2;
  }

  private static calculatePerimeter(vertices: Point2D[]): number {
    if (vertices.length < 2) return 0;

    let perimeter = 0;
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length;
      const dx = vertices[j].x - vertices[i].x;
      const dy = vertices[j].y - vertices[i].y;
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }
    return perimeter;
  }
}
