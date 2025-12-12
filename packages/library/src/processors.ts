import {
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

export const processLine = (
  entity: ILineEntity,
  material: THREE.Material
): THREE.Object3D | null => {
  if (!entity.vertices?.length || entity.vertices.length < 2) return null;

  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    entity.vertices[0].x,
    entity.vertices[0].y,
    entity.vertices[0].z || 0,
    entity.vertices[1].x,
    entity.vertices[1].y,
    entity.vertices[1].z || 0,
  ]);
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  return new THREE.Line(geometry, material);
};

export const processArc = (
  entity: IArcEntity,
  material: THREE.Material
): THREE.Object3D | null => {
  if (!entity.center || !entity.radius) return null;

  const curve = new THREE.EllipseCurve(
    entity.center.x,
    entity.center.y,
    entity.radius,
    entity.radius,
    entity.startAngle || 0,
    entity.endAngle || Math.PI * 2,
    false,
    0
  );

  const points = curve.getPoints(50);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, material);
};

export const processCircle = (
  entity: ICircleEntity,
  material: THREE.Material
): THREE.Object3D | null => {
  if (!entity.center || !entity.radius) return null;

  const curve = new THREE.EllipseCurve(
    entity.center.x,
    entity.center.y,
    entity.radius,
    entity.radius,
    0,
    Math.PI * 2,
    false,
    0
  );

  const points = curve.getPoints(50);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, material);
};

export const processPolyline = (
  entity: IPolylineEntity,
  material: THREE.Material
): THREE.Object3D | null => {
  if (!entity.vertices?.length) return null;

  const points: THREE.Vector3[] = [];
  entity.vertices.forEach((vertex) => {
    points.push(new THREE.Vector3(vertex.x, vertex.y, vertex.z || 0));
  });

  if (entity.shape === true && points.length > 0) {
    points.push(points[0].clone()); // Close the loop
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, material);
};

export const processSpline = (
  entity: ISplineEntity,
  material: THREE.Material
): THREE.Object3D | null => {
  if (!entity.controlPoints?.length) return null;

  // Get spline parameters
  const controlPoints = entity.controlPoints;
  const degree = entity.degreeOfSplineCurve || 3;
  const knots = entity.knotValues || [];
  const closed = Boolean((entity as { closed?: boolean }).closed);

  // Basic validation
  if (!controlPoints.length || !knots.length) return null;

  // Find valid parameter range
  const tMin = knots[degree] ?? knots[0] ?? 0;
  const tMax = knots[knots.length - degree - 1] ?? knots[knots.length - 1] ?? 1;

  if (tMin >= tMax) return null;

  // Generate points using De Boor's algorithm
  const numPoints = Math.max(200, controlPoints.length * 20);
  const dt = (tMax - tMin) / (numPoints - 1);
  const points: THREE.Vector3[] = [];

  for (let i = 0; i <= numPoints; i++) {
    const t = tMin + i * dt;
    const point = evaluatePoint(t, controlPoints, degree, knots);
    if (point) {
      points.push(new THREE.Vector3(point.x, point.y, point.z || 0));
    }
  }

  // Handle closed splines
  if (closed && points.length > 0) {
    points.push(points[0].clone());
  }

  // Create geometry
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, material);
};

/**
 * Evaluate a point on the B-spline curve using De Boor's algorithm.
 */
function evaluatePoint(
  t: number,
  controlPoints: { x: number; y: number; z?: number }[],
  degree: number,
  knots: number[]
): { x: number; y: number; z?: number } | null {
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

export const processEllipse = (
  entity: IEllipseEntity,
  material: THREE.Material
): THREE.Object3D | null => {
  if (!entity.center || !entity.majorAxisEndPoint || !entity.axisRatio)
    return null;

  // Calculate major axis vector and length
  const dx = entity.majorAxisEndPoint.x - entity.center.x;
  const dy = entity.majorAxisEndPoint.y - entity.center.y;
  const majorRadius = Math.sqrt(dx * dx + dy * dy);
  const minorRadius = majorRadius * entity.axisRatio;
  const rotation = Math.atan2(dy, dx);
  const startAngle = entity.startAngle || 0;
  const endAngle = entity.endAngle || Math.PI * 2;

  // Create ellipse curve
  const curve = new THREE.EllipseCurve(
    entity.center.x,
    entity.center.y,
    majorRadius,
    minorRadius,
    startAngle,
    endAngle,
    false,
    rotation
  );

  // Generate points with higher resolution for smoother curves
  const numPoints = Math.max(50, Math.ceil(majorRadius * 2));
  const points = curve.getPoints(numPoints);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, material);
};

export const processPoint = (
  entity: IPointEntity,
  material: THREE.Material
): THREE.Object3D | null => {
  if (!entity.position) return null;

  // Create a small cross to represent the point
  const size = 0.5;
  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    // Horizontal line
    entity.position.x - size,
    entity.position.y,
    entity.position.z || 0,
    entity.position.x + size,
    entity.position.y,
    entity.position.z || 0,
    // Vertical line
    entity.position.x,
    entity.position.y - size,
    entity.position.z || 0,
    entity.position.x,
    entity.position.y + size,
    entity.position.z || 0,
  ]);

  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  return new THREE.LineSegments(geometry, material);
};

export const processText = (
  entity: ITextEntity,
  material: THREE.Material
): THREE.Object3D | null => {
  if (!entity.startPoint) return null;

  const text = entity.text || "";
  const height = entity.textHeight || 1;
  const rotation = entity.rotation || 0;

  // Create a simple line box to represent text bounds
  const width = height * text.length * 0.6; // Approximate width based on height
  const geometry = new THREE.BufferGeometry();
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  const vertices = new Float32Array([
    // Bottom line
    entity.startPoint.x,
    entity.startPoint.y,
    entity.startPoint.z || 0,
    entity.startPoint.x + width * cos,
    entity.startPoint.y + width * sin,
    entity.startPoint.z || 0,
    // Right line
    entity.startPoint.x + width * cos,
    entity.startPoint.y + width * sin,
    entity.startPoint.z || 0,
    entity.startPoint.x + width * cos - height * sin,
    entity.startPoint.y + width * sin + height * cos,
    entity.startPoint.z || 0,
    // Top line
    entity.startPoint.x + width * cos - height * sin,
    entity.startPoint.y + width * sin + height * cos,
    entity.startPoint.z || 0,
    entity.startPoint.x - height * sin,
    entity.startPoint.y + height * cos,
    entity.startPoint.z || 0,
    // Left line
    entity.startPoint.x - height * sin,
    entity.startPoint.y + height * cos,
    entity.startPoint.z || 0,
    entity.startPoint.x,
    entity.startPoint.y,
    entity.startPoint.z || 0,
  ]);

  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  return new THREE.LineSegments(geometry, material);
};
