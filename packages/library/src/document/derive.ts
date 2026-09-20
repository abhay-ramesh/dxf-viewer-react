import { IEntity } from "dxf-parser";
import * as THREE from "three";
import { DerivedGeometry } from "./types";

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/**
 * How many vertices to step between length samples.
 *
 * THREE.LineSegments stores disjoint pairs (a-b, c-d), so only even-indexed
 * gaps are real segments. Everything else is a continuous strip.
 */
function segmentStride(object: THREE.Object3D): number {
  return object instanceof THREE.LineSegments ? 2 : 1;
}

/** Shoelace area of a closed 2D ring. Sign is dropped; callers want magnitude. */
function ringArea(points: THREE.Vector3[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * Read an object's positions into document space.
 *
 * Objects carry the INSERT transform on `object.matrix` (with
 * matrixAutoUpdate off), and nothing above them contributes a transform except
 * the whole-document origin shift, which is deliberately excluded here.
 */
function documentSpacePoints(object: THREE.Object3D): THREE.Vector3[] {
  const geometry = (object as THREE.Mesh | THREE.Line).geometry;
  if (!geometry) return [];
  const positions = geometry.getAttribute("position");
  if (!positions) return [];

  const points: THREE.Vector3[] = [];
  for (let i = 0; i < positions.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(positions, i);
    points.push(p.applyMatrix4(object.matrix));
  }
  return points;
}

/**
 * Flatten an entity into disjoint line segments, in document space.
 *
 * This one array is what hit-testing, snapping and batched rendering all read
 * from. Keeping it per entity — rather than reading back from the rendered
 * object — is what lets the renderer merge a thousand entities into one
 * buffer without any of those three losing track of which entity is which.
 *
 * Layout is flat pairs: [ax, ay, bx, by, ...], two vertices per segment.
 */
function toSegments(points: THREE.Vector3[], closed: boolean): Float32Array {
  if (points.length < 2) return new Float32Array(0);

  const segmentCount = closed ? points.length : points.length - 1;
  const out = new Float32Array(segmentCount * 4);
  for (let i = 0; i < segmentCount; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    out[i * 4] = a.x;
    out[i * 4 + 1] = a.y;
    out[i * 4 + 2] = b.x;
    out[i * 4 + 3] = b.y;
  }
  return out;
}

/** Drop the z of already-transformed points, keeping [x, y, x, y, ...]. */
function flatten2D(points: THREE.Vector3[]): Float32Array {
  const out = new Float32Array(points.length * 2);
  points.forEach((point, index) => {
    out[index * 2] = point.x;
    out[index * 2 + 1] = point.y;
  });
  return out;
}

/** Disjoint pairs stay pairs; a strip would be wrong to close or chain. */
function pairsToSegments(points: THREE.Vector3[]): Float32Array {
  const segmentCount = Math.floor(points.length / 2);
  const out = new Float32Array(segmentCount * 4);
  for (let i = 0; i < segmentCount; i++) {
    const a = points[i * 2];
    const b = points[i * 2 + 1];
    out[i * 4] = a.x;
    out[i * 4 + 1] = a.y;
    out[i * 4 + 2] = b.x;
    out[i * 4 + 3] = b.y;
  }
  return out;
}

/**
 * Compute every geometry fact a consumer might ask for, once, at build time.
 *
 * This replaces re-deriving length from buffer attributes and centre from a
 * recomputed bounding sphere on every hover and every click.
 */
export function deriveGeometry(
  object: THREE.Object3D,
  source: IEntity,
  isClosedLoop: boolean
): DerivedGeometry {
  const points = documentSpacePoints(object);

  const bbox = new THREE.Box3();
  points.forEach((p) => bbox.expandByPoint(p));
  const center = bbox.isEmpty()
    ? new THREE.Vector3()
    : bbox.getCenter(new THREE.Vector3());

  const closed = isClosedLoop || object instanceof THREE.LineLoop;

  // A mesh is a filled area: it has triangles, not an outline to be near.
  // SOLID arrives here rather than through deriveMeshGeometry because it is
  // a real parsed entity, not a generated fill.
  if (object instanceof THREE.Mesh) {
    return {
      bbox,
      center,
      vertexCount: points.length,
      closed: true,
      segments: new Float32Array(0),
      triangles: flatten2D(points),
    };
  }

  const derived: DerivedGeometry = {
    bbox,
    center,
    vertexCount: points.length,
    closed,
    segments:
      object instanceof THREE.LineSegments
        ? pairsToSegments(points)
        : toSegments(points, object instanceof THREE.LineLoop),
  };

  if (points.length > 1) {
    const stride = segmentStride(object);
    const isLoop = object instanceof THREE.LineLoop;
    let length = 0;
    for (let i = 0; i + 1 < points.length; i += stride) {
      length += points[i].distanceTo(points[i + 1]);
    }
    if (isLoop) {
      length += points[points.length - 1].distanceTo(points[0]);
    }
    derived.length = length;

    derived.startPoint = points[0].clone();
    derived.endPoint = points[points.length - 1].clone();
  }

  // The parsed entity knows things the buffer cannot: a tessellated circle's
  // true centre and radius, for instance.
  const withCircle = source as IEntity & {
    center?: { x: number; y: number; z?: number };
    radius?: number;
  };
  if (typeof withCircle.radius === "number") {
    derived.radius = withCircle.radius;
  }
  if (withCircle.center) {
    derived.center = _v1
      .set(withCircle.center.x, withCircle.center.y, withCircle.center.z ?? 0)
      .applyMatrix4(object.matrix)
      .clone();
  }

  if (source.type === "CIRCLE" && typeof withCircle.radius === "number") {
    derived.area = Math.PI * withCircle.radius * withCircle.radius;
    derived.length = 2 * Math.PI * withCircle.radius;
    derived.closed = true;
  } else if (derived.closed && points.length > 2) {
    derived.area = ringArea(points);
  }

  return derived;
}

/**
 * Derived geometry for a generated fill mesh, which has no source entity.
 */
export function deriveMeshGeometry(mesh: THREE.Mesh): DerivedGeometry {
  const bbox = new THREE.Box3().setFromObject(mesh);
  _v2.set(0, 0, 0);
  return {
    bbox,
    center: bbox.isEmpty() ? _v2.clone() : bbox.getCenter(new THREE.Vector3()),
    area: (mesh.userData.outerArea as number) ?? undefined,
    length: (mesh.userData.perimeter as number) ?? undefined,
    closed: true,
    // A filled area has no outline to be near: you are either inside it or
    // you are not, so it carries triangles rather than segments.
    segments: new Float32Array(0),
    triangles: toTriangles(mesh),
  };
}

/** Flatten a mesh into [ax, ay, bx, by, cx, cy, ...] in document space. */
function toTriangles(mesh: THREE.Mesh): Float32Array {
  const geometry = mesh.geometry;
  const positions = geometry?.getAttribute("position");
  if (!positions) return new Float32Array(0);

  const index = geometry.getIndex();
  const count = index ? index.count : positions.count;
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const vertex = index ? index.getX(i) : i;
    out[i * 2] = positions.getX(vertex) + mesh.position.x;
    out[i * 2 + 1] = positions.getY(vertex) + mesh.position.y;
  }
  return out;
}
