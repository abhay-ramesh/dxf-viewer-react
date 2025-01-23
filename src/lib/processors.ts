import {
  IArcEntity,
  ICircleEntity,
  ILineEntity,
  IPolylineEntity,
  ISplineEntity,
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

  const points: THREE.Vector3[] = [];
  entity.controlPoints.forEach((point) => {
    points.push(new THREE.Vector3(point.x, point.y, point.z || 0));
  });

  const curve = new THREE.CatmullRomCurve3(points);
  const curvePoints = curve.getPoints(50 * points.length);
  const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
  return new THREE.Line(geometry, material);
};
