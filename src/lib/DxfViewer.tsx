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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
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
import { DxfViewerProps } from "./types";

// Reusable constants and geometries
const CAMERA_FOV = 45;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 10000;
const INITIAL_CAMERA_POSITION = new THREE.Vector3(0, 0, 100);
const GRID_SIZE = 1000;
const GRID_DIVISIONS = 100;
const AXES_SIZE = 500;

const gridGeometry = new THREE.PlaneGeometry(
  GRID_SIZE,
  GRID_SIZE,
  GRID_DIVISIONS,
  GRID_DIVISIONS
);
const gridMaterial = new THREE.MeshBasicMaterial({
  color: 0x444444,
  opacity: 0.5,
  transparent: true,
  wireframe: true,
});

export const DxfViewer: React.FC<DxfViewerProps> = ({
  dxfContent,
  backgroundColor = 0xf0f0f0,
  entityColor = 0x0000ff,
  width = "100%",
  height = "100%",
  showGrid = true,
  showAxes = true,
  showDebugInfo = false,
  onLoad,
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationFrameRef = useRef<number>();
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>("");

  // Parse DXF outside of useEffect
  const { entities, parseError } = useMemo(() => {
    try {
      const dxf = new DxfParser().parseSync(dxfContent);
      return { entities: dxf?.entities || [], parseError: null };
    } catch (error) {
      return { entities: [], parseError: error };
    }
  }, [dxfContent]);

  // Create material outside of useEffect
  const material = useMemo(
    () => new THREE.LineBasicMaterial({ color: entityColor }),
    [entityColor]
  );

  // Process entities and create group
  const { group, stats } = useMemo(() => {
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

    const group = new THREE.Group();
    objects.forEach((obj) => group.add(obj));
    geometryCache.clear();

    return { group, stats };
  }, [entities, material]);

  // Calculate camera position and box
  const { cameraPosition, center } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) {
      return {
        cameraPosition: INITIAL_CAMERA_POSITION.clone(),
        center: new THREE.Vector3(),
      };
    }

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    // Position camera directly above the center
    const cameraPosition = new THREE.Vector3(
      center.x,
      center.y,
      center.z + maxDim * 1.5
    );

    return { cameraPosition, center };
  }, [group]);

  // Create scene with helpers
  const scene = useMemo(() => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(backgroundColor);

    if (showGrid) {
      const grid = new THREE.Mesh(gridGeometry, gridMaterial);
      grid.rotation.x = -Math.PI / 2;
      scene.add(grid);
    }

    if (showAxes) {
      const axesHelper = new THREE.AxesHelper(AXES_SIZE);
      scene.add(axesHelper);
    }

    scene.add(group);
    return scene;
  }, [backgroundColor, showGrid, showAxes, group]);

  // Handle resize with debouncing
  const handleResize = useCallback(() => {
    if (!containerRef.current || !rendererRef.current || !cameraRef.current)
      return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    cameraRef.current.aspect = width / height;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(width, height);
  }, []);

  // Update debug info
  useEffect(() => {
    if (showDebugInfo) {
      const statsText = Object.entries(stats)
        .map(([type, count]) => `${type}: ${count}`)
        .join("\n");
      setDebugInfo(`Total entities: ${entities.length}\n${statsText}`);
    }
  }, [showDebugInfo, stats, entities.length]);

  // Main setup effect
  useEffect(() => {
    if (!containerRef.current) return;
    if (parseError) {
      setError(
        parseError instanceof Error ? parseError.message : "Failed to parse DXF"
      );
      onError?.(
        parseError instanceof Error
          ? parseError
          : new Error("Failed to parse DXF")
      );
      return;
    }
    if (entities.length === 0) {
      setError("No entities found in DXF file");
      onError?.(new Error("No entities found in DXF file"));
      return;
    }

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      CAMERA_NEAR,
      CAMERA_FAR
    );
    camera.position.copy(cameraPosition);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      precision: "mediump",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(
      containerRef.current.clientWidth,
      containerRef.current.clientHeight
    );
    rendererRef.current = renderer;
    containerRef.current.appendChild(renderer.domElement);

    // Controls setup
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enableZoom = true;
    controls.zoomSpeed = 0.85;
    controls.rotateSpeed = 0.85;
    controls.panSpeed = 0.85;
    controls.target.copy(center);
    controlsRef.current = controls;

    sceneRef.current = scene;

    // Update stats
    onLoad?.(stats);

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(handleResize, 100);
    };
    window.addEventListener("resize", debouncedResize);

    return () => {
      window.removeEventListener("resize", debouncedResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      renderer.dispose();
      material.dispose();
      group.traverse((obj) => {
        if (obj instanceof THREE.Line) {
          obj.geometry.dispose();
        }
      });

      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [
    entities,
    parseError,
    scene,
    stats,
    onLoad,
    onError,
    handleResize,
    material,
    cameraPosition,
    center,
  ]);

  return (
    <div style={{ width, height, position: "relative" }}>
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
      {showDebugInfo && debugInfo && (
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
