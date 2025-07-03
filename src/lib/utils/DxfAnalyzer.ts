import {
  IArcEntity,
  ICircleEntity,
  IEntity,
  ILineEntity,
  IPolylineEntity,
} from "dxf-parser";

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

function isArcEntity(entity: IEntity): entity is IArcEntity {
  return entity.type === "ARC";
}

function isCircleEntity(entity: IEntity): entity is ICircleEntity {
  return entity.type === "CIRCLE";
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
    console.log(`=== DXF ANALYZER: Processing ${entities.length} entities ===`);

    // Handle circles separately - they are always closed loops
    const loops: ClosedLoop[] = [];
    const processedEntities: IEntity[] = [];

    // Add circles as individual closed loops
    entities.forEach((entity) => {
      if (isCircleEntity(entity)) {
        const loop = this.createCircleLoop(entity);
        if (loop) {
          loops.push(loop);
          console.log(`Added circle as closed loop`);
        }
      } else if (isArcEntity(entity) && isFullCircleArc(entity)) {
        const loop = this.createFullCircleArcLoop(entity);
        if (loop) {
          loops.push(loop);
          console.log(`Added full-circle arc as closed loop`);
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

    console.log(`Final result: ${loops.length} unique closed loops`);
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

  private static findConnectedLoops(entities: IEntity[]): ClosedLoop[] {
    const loops: ClosedLoop[] = [];

    // Try different tolerance levels
    for (const tolerance of this.FALLBACK_TOLERANCES) {
      this.TOLERANCE = tolerance;
      console.log(`Trying connectivity analysis with tolerance: ${tolerance}`);

      const connectedGroups = this.analyzeConnectivity(entities);
      console.log(`Found ${connectedGroups.length} connected groups`);

      for (const group of connectedGroups) {
        const loop = this.traceConnectedLoop(group, entities);
        if (loop && loop.entities.length >= 3) {
          loops.push(loop);
          console.log(
            `Created loop from ${loop.entities.length} connected entities`
          );
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

    console.log(
      `Analyzing ${endpoints.length} endpoints from ${entities.length} entities`
    );

    // Build connectivity graph using flood-fill
    const visited = new Set<number>();
    const connectedGroups: number[][] = [];

    for (let i = 0; i < entities.length; i++) {
      if (visited.has(i)) continue;

      // Start a new connected group
      const group: number[] = [];
      const toProcess = [i];

      while (toProcess.length > 0) {
        const current = toProcess.pop()!;
        if (visited.has(current)) continue;

        visited.add(current);
        group.push(current);

        // Find all entities connected to this one
        const currentEndpoints = endpoints.filter(
          (ep) => ep.entityIndex === current
        );

        for (const endpoint of currentEndpoints) {
          const connectedEntities = endpoints.filter(
            (ep) =>
              ep.entityIndex !== current &&
              !visited.has(ep.entityIndex) &&
              this.pointsEqual(endpoint, ep)
          );

          for (const connectedEp of connectedEntities) {
            if (!visited.has(connectedEp.entityIndex)) {
              toProcess.push(connectedEp.entityIndex);
            }
          }
        }
      }

      if (group.length >= 3) {
        // Need at least 3 entities for a meaningful loop
        connectedGroups.push(group);
        console.log(`Found connected group with ${group.length} entities`);
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
    }

    return endpoints;
  }

  private static traceConnectedLoop(
    groupIndices: number[],
    entities: IEntity[]
  ): ClosedLoop | null {
    const groupEntities = groupIndices.map((i) => entities[i]);
    const vertices: Point2D[] = [];

    // Add vertices from all entities in the group
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
