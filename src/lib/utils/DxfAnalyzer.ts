import { Vector2 } from "three";
import {
  EntityTypes,
  IArcEntity,
  ICircleEntity,
  ILineEntity,
  IPolylineEntity,
} from "../types";

interface Point2D {
  x: number;
  y: number;
}

interface ClosedLoop {
  entities: Array<keyof EntityTypes>;
  vertices: Point2D[];
  area: number;
  perimeter: number;
}

export class DxfAnalyzer {
  private static TOLERANCE = 0.0001;

  static findClosedLoops(dxf: {
    entities: Array<keyof EntityTypes>;
  }): ClosedLoop[] {
    if (!dxf?.entities) return [];

    const entities = dxf.entities;
    const loops: ClosedLoop[] = [];
    const visited = new Set<keyof EntityTypes>();

    entities.forEach((entity) => {
      if (visited.has(entity)) return;

      const loop = this.traceLoop(entity, entities, visited);
      if (loop) {
        loops.push(loop);
      }
    });

    return loops;
  }

  private static traceLoop(
    startEntity: keyof EntityTypes,
    allEntities: Array<keyof EntityTypes>,
    visited: Set<keyof EntityTypes>
  ): ClosedLoop | null {
    const loopEntities: Array<keyof EntityTypes> = [];
    const vertices: Point2D[] = [];
    let currentEntity = startEntity;
    let startPoint = this.getStartPoint(currentEntity);
    const originalStartPoint = { ...startPoint };

    while (currentEntity) {
      visited.add(currentEntity);
      loopEntities.push(currentEntity);

      // Add vertices based on entity type
      this.addEntityVertices(currentEntity, vertices);

      const endPoint = this.getEndPoint(currentEntity);

      // Check if we've closed the loop
      if (
        this.pointsEqual(endPoint, originalStartPoint) &&
        loopEntities.length > 1
      ) {
        const area = this.calculateArea(vertices);
        const perimeter = this.calculatePerimeter(vertices);
        return {
          entities: loopEntities,
          vertices,
          area,
          perimeter,
        };
      }

      // Find next connected entity
      currentEntity = this.findNextEntity(
        endPoint,
        allEntities,
        visited,
        currentEntity
      );
      if (!currentEntity) break;

      startPoint = this.getStartPoint(currentEntity);
    }

    return null;
  }

  private static addEntityVertices(
    entity: keyof EntityTypes,
    vertices: Point2D[]
  ) {
    switch (entity.type) {
      case "LINE": {
        const lineEntity = entity as ILineEntity;
        vertices.push(
          { x: lineEntity.vertices[0].x, y: lineEntity.vertices[0].y },
          { x: lineEntity.vertices[1].x, y: lineEntity.vertices[1].y }
        );
        break;
      }
      case "POLYLINE": {
        const polyEntity = entity as IPolylineEntity;
        polyEntity.vertices.forEach((vertex) => {
          vertices.push({ x: vertex.x, y: vertex.y });
        });
        break;
      }
      case "ARC":
      case "CIRCLE": {
        const circularEntity = entity as IArcEntity | ICircleEntity;
        const center = new Vector2(
          circularEntity.center.x,
          circularEntity.center.y
        );
        const radius = circularEntity.radius;
        const startAngle =
          entity.type === "ARC" ? (entity as IArcEntity).startAngle : 0;
        const endAngle =
          entity.type === "ARC" ? (entity as IArcEntity).endAngle : Math.PI * 2;
        const segments = 32;

        for (let i = 0; i <= segments; i++) {
          const angle = startAngle + (endAngle - startAngle) * (i / segments);
          vertices.push({
            x: center.x + radius * Math.cos(angle),
            y: center.y + radius * Math.sin(angle),
          });
        }
        break;
      }
    }
  }

  private static getStartPoint(entity: keyof EntityTypes): Point2D {
    switch (entity.type) {
      case "LINE": {
        const lineEntity = entity as ILineEntity;
        return { x: lineEntity.vertices[0].x, y: lineEntity.vertices[0].y };
      }
      case "POLYLINE": {
        const polyEntity = entity as IPolylineEntity;
        return { x: polyEntity.vertices[0].x, y: polyEntity.vertices[0].y };
      }
      case "ARC":
      case "CIRCLE": {
        const circularEntity = entity as IArcEntity | ICircleEntity;
        const startAngle =
          entity.type === "ARC" ? (entity as IArcEntity).startAngle : 0;
        return {
          x:
            circularEntity.center.x +
            circularEntity.radius * Math.cos(startAngle),
          y:
            circularEntity.center.y +
            circularEntity.radius * Math.sin(startAngle),
        };
      }
      default:
        return { x: 0, y: 0 };
    }
  }

  private static getEndPoint(entity: keyof EntityTypes): Point2D {
    switch (entity.type) {
      case "LINE": {
        const lineEntity = entity as ILineEntity;
        return { x: lineEntity.vertices[1].x, y: lineEntity.vertices[1].y };
      }
      case "POLYLINE": {
        const polyEntity = entity as IPolylineEntity;
        const lastVertex = polyEntity.vertices[polyEntity.vertices.length - 1];
        return { x: lastVertex.x, y: lastVertex.y };
      }
      case "ARC":
      case "CIRCLE": {
        const circularEntity = entity as IArcEntity | ICircleEntity;
        const endAngle =
          entity.type === "ARC" ? (entity as IArcEntity).endAngle : Math.PI * 2;
        return {
          x:
            circularEntity.center.x +
            circularEntity.radius * Math.cos(endAngle),
          y:
            circularEntity.center.y +
            circularEntity.radius * Math.sin(endAngle),
        };
      }
      default:
        return { x: 0, y: 0 };
    }
  }

  private static findNextEntity(
    point: Point2D,
    entities: Array<keyof EntityTypes>,
    visited: Set<keyof EntityTypes>,
    currentEntity: keyof EntityTypes
  ): keyof EntityTypes | null {
    return (
      entities.find(
        (entity) =>
          !visited.has(entity) &&
          entity !== currentEntity &&
          this.pointsEqual(this.getStartPoint(entity), point)
      ) || null
    );
  }

  private static pointsEqual(p1: Point2D, p2: Point2D): boolean {
    return (
      Math.abs(p1.x - p2.x) < this.TOLERANCE &&
      Math.abs(p1.y - p2.y) < this.TOLERANCE
    );
  }

  private static calculateArea(vertices: Point2D[]): number {
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length;
      area += vertices[i].x * vertices[j].y;
      area -= vertices[j].x * vertices[i].y;
    }
    return Math.abs(area) / 2;
  }

  private static calculatePerimeter(vertices: Point2D[]): number {
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
