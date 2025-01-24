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
import { setupCamera } from "./setupCamera";
import { setupControls } from "./setupControls";
import { setupScene } from "./setupScene";
import { DxfViewerProps } from "./types";

// Reusable constants and geometries
const GRID_SIZE = 1000;
const GRID_DIVISIONS = 100;
const AXES_SIZE = 500;

// Error handling functions
const handleDxfError = (
  error: unknown,
  setError: (msg: string) => void,
  onError?: (err: Error) => void
) => {
  const errorMessage =
    error instanceof Error ? error.message : "Failed to parse DXF";
  setError(errorMessage);
  onError?.(error instanceof Error ? error : new Error(errorMessage));
};

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
  const [measurePoints, setMeasurePoints] = useState<THREE.Vector3[]>([]);
  const [measureDistance, setMeasureDistance] = useState<number | null>(null);
  const [showMeasurement, setShowMeasurement] = useState(false);
  const measureLineRef = useRef<THREE.Line | null>(null);
  const measureTimeoutRef = useRef<NodeJS.Timeout>();
  const [measureMode, setMeasureMode] = useState(false);
  const [snapPoint, setSnapPoint] = useState<THREE.Vector3 | null>(null);
  const snapIndicatorRef = useRef<THREE.Mesh | null>(null);

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

  // Camera setup - memoized to avoid recalculation
  const { camera, center } = useMemo(() => {
    if (!containerRef.current) {
      return {
        camera: null,
        center: new THREE.Vector3(),
      };
    }

    return setupCamera({
      containerWidth: containerRef.current.clientWidth,
      containerHeight: containerRef.current.clientHeight,
      group,
    });
  }, [group, containerRef.current]);

  // Renderer setup - memoized to avoid recreation
  const renderer = useMemo(() => {
    if (!containerRef.current) return null;

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
    return renderer;
  }, [containerRef.current]);

  // Scene setup - already memoized, but simplified
  const scene = useMemo(() => {
    return setupScene({
      backgroundColor,
      showGrid,
      showAxes,
      group,
      gridSize: GRID_SIZE,
      gridDivisions: GRID_DIVISIONS,
      axesSize: AXES_SIZE,
    });
  }, [backgroundColor, showGrid, showAxes, group]);

  // Controls setup - memoized to avoid recreation
  const controls = useMemo(() => {
    if (!camera || !renderer) return null;
    return setupControls(camera, renderer, group, center);
  }, [camera, renderer, group, center]);

  // Animation frame handler - no change needed, already optimized
  const animate = useCallback(() => {
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const controls = controlsRef.current;

    if (!camera || !renderer || !scene || !controls) return;

    animationFrameRef.current = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }, []);

  // Resize handler - no change needed, already optimized
  const handleResize = useCallback(() => {
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const container = containerRef.current;

    if (!container || !renderer || !camera) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }, []);

  // Create snap indicator material and geometry - memoized
  const snapIndicator = useMemo(() => {
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    return new THREE.Mesh(geometry, material);
  }, []);

  // Function to find nearest point
  const findNearestPoint = useCallback(
    (point: THREE.Vector3): THREE.Vector3 | null => {
      if (!group) return null;

      let nearestPoint = null;
      let minDistance = 5; // Snap threshold

      group.traverse((object) => {
        if (object instanceof THREE.Line) {
          const positions = object.geometry.getAttribute("position");
          for (let i = 0; i < positions.count; i++) {
            const vertex = new THREE.Vector3();
            vertex.fromBufferAttribute(positions, i);
            object.localToWorld(vertex); // Convert to world coordinates

            const distance = point.distanceTo(vertex);
            if (distance < minDistance) {
              minDistance = distance;
              nearestPoint = vertex.clone();
            }
          }
        }
      });

      return nearestPoint;
    },
    [group]
  );

  // Enhanced measure click handler with snapping
  const handleMeasureClick = useCallback(
    (event: MouseEvent) => {
      if (!camera || !scene || !renderer) return;

      // Get mouse position in normalized device coordinates (-1 to +1)
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Create raycaster
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

      // Create a plane at z=0 to intersect with
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const intersectPoint = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, intersectPoint);

      // Find nearest snap point
      const snappedPoint = findNearestPoint(intersectPoint) || intersectPoint;

      setMeasurePoints((prev) => {
        const newPoints = [...prev, snappedPoint];

        // If we have two points, calculate and display distance
        if (newPoints.length === 2) {
          const distance = newPoints[0].distanceTo(newPoints[1]);
          setMeasureDistance(distance);
          setShowMeasurement(true);

          // Create or update measurement line
          const geometry = new THREE.BufferGeometry().setFromPoints(newPoints);
          const material = new THREE.LineBasicMaterial({ color: 0xff0000 });

          if (measureLineRef.current) {
            scene.remove(measureLineRef.current);
          }

          const line = new THREE.Line(geometry, material);
          measureLineRef.current = line;
          scene.add(line);

          // Set timeout to hide measurement after 5 seconds
          if (measureTimeoutRef.current) {
            clearTimeout(measureTimeoutRef.current);
          }
          measureTimeoutRef.current = setTimeout(() => {
            setShowMeasurement(false);
            if (measureLineRef.current && scene) {
              scene.remove(measureLineRef.current);
              measureLineRef.current = null;
            }
          }, 5000);

          // Reset points for next measurement
          return [];
        }

        return newPoints;
      });
    },
    [camera, scene, renderer, findNearestPoint]
  );

  // Add mouse move handler for snap preview
  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!camera || !scene || !renderer || !measureMode) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const intersectPoint = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, intersectPoint);

      // Find nearest snap point
      const nearestPoint = findNearestPoint(intersectPoint);
      setSnapPoint(nearestPoint);

      // Update snap indicator
      if (nearestPoint) {
        if (!snapIndicatorRef.current) {
          snapIndicatorRef.current = snapIndicator.clone();
          scene.add(snapIndicatorRef.current);
        }
        snapIndicatorRef.current.position.copy(nearestPoint);
        snapIndicatorRef.current.visible = true;
      } else if (snapIndicatorRef.current) {
        snapIndicatorRef.current.visible = false;
      }
    },
    [camera, scene, renderer, measureMode, findNearestPoint, snapIndicator]
  );

  // Main setup effect - now much simpler
  useEffect(() => {
    if (!containerRef.current || !camera || !renderer || !controls || !scene)
      return;

    // Handle errors
    if (parseError) {
      handleDxfError(parseError, setError, onError);
      return;
    }
    if (entities.length === 0) {
      handleDxfError(
        new Error("No entities found in DXF file"),
        setError,
        onError
      );
      return;
    }

    // Mount renderer
    containerRef.current.appendChild(renderer.domElement);

    // Store refs
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    sceneRef.current = scene;

    // Start animation and setup resize handler
    animate();
    window.addEventListener("resize", handleResize);

    // Notify load complete
    onLoad?.(stats);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
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
    camera,
    renderer,
    controls,
    scene,
    parseError,
    entities.length,
    onLoad,
    onError,
    stats,
    animate,
    handleResize,
    material,
    group,
  ]);

  // Update debug info - separate effect with proper deps
  useEffect(() => {
    if (showDebugInfo) {
      const statsText = Object.entries(stats)
        .map(([type, count]) => `${type}: ${count}`)
        .join("\n");
      setDebugInfo(`Total entities: ${entities.length}\n${statsText}`);
    }
  }, [showDebugInfo, stats, entities.length]);

  // Update controls based on measure mode
  useEffect(() => {
    if (!controls) return;

    if (measureMode) {
      controls.enabled = false;
      renderer?.domElement.addEventListener("click", handleMeasureClick);
      renderer?.domElement.addEventListener("mousemove", handleMouseMove);
    } else {
      controls.enabled = true;
      renderer?.domElement.removeEventListener("click", handleMeasureClick);
      renderer?.domElement.removeEventListener("mousemove", handleMouseMove);

      // Clear measurement and snap indicator
      if (measureLineRef.current && scene) {
        scene.remove(measureLineRef.current);
        measureLineRef.current = null;
      }
      if (snapIndicatorRef.current && scene) {
        scene.remove(snapIndicatorRef.current);
        snapIndicatorRef.current = null;
      }
      if (measureTimeoutRef.current) {
        clearTimeout(measureTimeoutRef.current);
      }
      setMeasurePoints([]);
      setMeasureDistance(null);
      setShowMeasurement(false);
      setSnapPoint(null);
    }

    return () => {
      renderer?.domElement.removeEventListener("click", handleMeasureClick);
      renderer?.domElement.removeEventListener("mousemove", handleMouseMove);
      if (measureTimeoutRef.current) {
        clearTimeout(measureTimeoutRef.current);
      }
    };
  }, [
    measureMode,
    controls,
    renderer,
    handleMeasureClick,
    handleMouseMove,
    scene,
  ]);

  return (
    <div style={{ width, height, position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Measurement toggle button */}
      <button
        onClick={() => setMeasureMode(!measureMode)}
        style={{
          position: "absolute",
          bottom: "1rem",
          left: "1rem",
          padding: "0.5rem",
          background: measureMode ? "#ff0000" : "#ffffff",
          color: measureMode ? "#ffffff" : "#000000",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        {measureMode ? "Cancel Measure" : "Measure"}
      </button>

      {/* Measurement display */}
      {showMeasurement && measureDistance !== null && (
        <div
          style={{
            position: "absolute",
            bottom: "1rem",
            left: "8rem",
            padding: "0.5rem",
            background: "#00000088",
            color: "white",
            borderRadius: "4px",
          }}
        >
          Distance: {measureDistance.toFixed(2)} units
        </div>
      )}

      {/* Existing error and debug info */}
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
