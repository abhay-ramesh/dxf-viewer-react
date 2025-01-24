import DxfParser, {
  IArcEntity,
  ICircleEntity,
  IEllipseEntity,
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
  entities: any[];
  parseError: Error | null;
}

export function processDxf(
  dxfContent: string,
  material: THREE.Material
): ProcessDxfResult {
  // Parse DXF
  let entities: any[] = [];
  let parseError: Error | null = null;
  try {
    const dxf = new DxfParser().parseSync(dxfContent);
    entities = dxf?.entities || [];
  } catch (error) {
    parseError =
      error instanceof Error ? error : new Error("Failed to parse DXF");
    return { group: new THREE.Group(), stats: {}, entities: [], parseError };
  }

  // Process entities
  const stats: Record<string, number> = {};
  const objects: THREE.Object3D[] = [];
  const geometryCache = new Map<string, THREE.BufferGeometry>();

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

      if (object) objects.push(object);
    } catch (err) {
      console.error("Failed to process entity:", entity.type, err);
    }
  });

  // Create group and add objects
  const group = new THREE.Group();
  objects.forEach((obj) => group.add(obj));
  geometryCache.clear();

  return { group, stats, entities, parseError };
}
