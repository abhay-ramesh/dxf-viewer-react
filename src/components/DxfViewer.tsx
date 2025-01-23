import DxfParser, {
  ICircleEntity,
  IPolylineEntity,
  ISplineEntity,
} from "dxf-parser";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

interface DxfViewerProps {
  dxfContent: string;
}

interface EntityStats {
  [key: string]: number;
}

export const DxfViewer: React.FC<DxfViewerProps> = ({ dxfContent }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [entityStats, setEntityStats] = useState<EntityStats>({});

  const processArc = (entity: any, material: THREE.Material) => {
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

  const processCircle = (entity: ICircleEntity, material: THREE.Material) => {
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

  const processPolyline = (
    entity: IPolylineEntity,
    material: THREE.Material
  ) => {
    if (!entity.vertices?.length) return null;

    const points: THREE.Vector3[] = [];
    entity.vertices.forEach((vertex: any) => {
      points.push(new THREE.Vector3(vertex.x, vertex.y, vertex.z || 0));
    });

    if (entity.closed && points.length > 0) {
      points.push(points[0].clone()); // Close the loop
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return new THREE.Line(geometry, material);
  };

  const processSpline = (entity: ISplineEntity, material: THREE.Material) => {
    if (!entity.controlPoints?.length) return null;

    const points: THREE.Vector3[] = [];
    entity.controlPoints.forEach((point: any) => {
      points.push(new THREE.Vector3(point.x, point.y, point.z || 0));
    });

    const curve = new THREE.CatmullRomCurve3(points);
    const curvePoints = curve.getPoints(50 * points.length);
    const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
    return new THREE.Line(geometry, material);
  };

  useEffect(() => {
    if (!containerRef.current) return;
    setError(null);
    setDebugInfo("");
    setEntityStats({});

    // Initialize Three.js scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    const camera = new THREE.PerspectiveCamera(
      45,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      10000
    );
    const renderer = new THREE.WebGLRenderer({ antialias: true });

    renderer.setSize(
      containerRef.current.clientWidth,
      containerRef.current.clientHeight
    );
    containerRef.current.appendChild(renderer.domElement);

    camera.position.set(0, 0, 10);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;

    const gridHelper = new THREE.GridHelper(100, 100, 0x888888, 0xcccccc);
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(50);
    scene.add(axesHelper);

    try {
      const parser = new DxfParser();
      const dxf = parser.parseSync(dxfContent);
      const stats: EntityStats = {};

      if (dxf?.entities?.length > 0) {
        const material = new THREE.LineBasicMaterial({ color: 0x0000ff });

        dxf.entities.forEach((entity: any) => {
          try {
            let object: THREE.Object3D | null = null;
            stats[entity.type] = (stats[entity.type] || 0) + 1;

            switch (entity.type) {
              case "LINE":
                if (entity.vertices?.length >= 2) {
                  const geometry = new THREE.BufferGeometry();
                  const vertices = new Float32Array([
                    entity.vertices[0].x,
                    entity.vertices[0].y,
                    entity.vertices[0].z || 0,
                    entity.vertices[1].x,
                    entity.vertices[1].y,
                    entity.vertices[1].z || 0,
                  ]);
                  geometry.setAttribute(
                    "position",
                    new THREE.BufferAttribute(vertices, 3)
                  );
                  object = new THREE.Line(geometry, material);
                }
                break;
              case "ARC":
                object = processArc(entity, material);
                break;
              case "CIRCLE":
                object = processCircle(entity, material);
                break;
              case "LWPOLYLINE":
              case "POLYLINE":
                object = processPolyline(entity, material);
                break;
              case "SPLINE":
                object = processSpline(entity, material);
                break;
              default:
                console.log("Unsupported entity type:", entity.type);
            }

            if (object) {
              scene.add(object);
            }
          } catch (entityError) {
            console.error("Error processing entity:", entity, entityError);
          }
        });

        setEntityStats(stats);
        const statsText = Object.entries(stats)
          .map(([type, count]) => `${type}: ${count}`)
          .join("\n");
        setDebugInfo(`Total entities: ${dxf.entities.length}\n${statsText}`);

        // Center and zoom camera to fit the model
        const box = new THREE.Box3().setFromObject(scene);
        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);

          camera.position.set(center.x, center.y, center.z + maxDim * 1.5);
          camera.lookAt(center);
          controls.target.copy(center);

          setDebugInfo(
            (prev) =>
              `${prev}\n\nModel dimensions:\nX: ${size.x.toFixed(
                2
              )}\nY: ${size.y.toFixed(2)}\nZ: ${size.z.toFixed(2)}`
          );
        } else {
          setDebugInfo((prev) => `${prev}\nWarning: No visible geometry found`);
        }
      } else {
        setError("No entities found in DXF file");
      }
    } catch (error) {
      console.error("Error parsing DXF:", error);
      setError(
        `Error parsing DXF: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [dxfContent]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {error && (
        <div
          style={{
            position: "absolute",
            top: "1rem",
            left: "1rem",
            background: "#ff000088",
            color: "white",
            padding: "0.5rem",
            borderRadius: "4px",
          }}
        >
          {error}
        </div>
      )}
      {debugInfo && (
        <div
          style={{
            position: "absolute",
            top: "1rem",
            right: "1rem",
            background: "#00000088",
            color: "white",
            padding: "0.5rem",
            borderRadius: "4px",
            whiteSpace: "pre-line",
            fontSize: "12px",
          }}
        >
          {debugInfo}
        </div>
      )}
    </div>
  );
};
