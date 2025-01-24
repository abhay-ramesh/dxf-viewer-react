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

// Add new types at the top
type MeasureMode = "none" | "distance" | "angle" | "select";

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
  const [measureMode, setMeasureMode] = useState<MeasureMode>("none");
  const [selectedEntities, setSelectedEntities] = useState<THREE.Object3D[]>(
    []
  );
  const [measureValue, setMeasureValue] = useState<string | null>(null);
  const measurePolygonRef = useRef<THREE.Line | null>(null);
  const selectionBoxRef = useRef<THREE.Line | null>(null);
  const startPointRef = useRef<THREE.Vector2 | null>(null);
  const [snapPoint, setSnapPoint] = useState<THREE.Vector3 | null>(null);
  const snapIndicatorRef = useRef<THREE.Mesh | null>(null);

  // Add cursor state for visual feedback
  const [cursor, setCursor] = useState<string>("default");
  const [measureGuide, setMeasureGuide] = useState<THREE.Line | null>(null);
  const [measureText, setMeasureText] = useState<string>("");
  const [mousePosition, setMousePosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

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
  const { camera, cameraPosition, center } = useMemo(() => {
    if (!containerRef.current) {
      return {
        camera: null,
        cameraPosition: INITIAL_CAMERA_POSITION.clone(),
        center: new THREE.Vector3(),
      };
    }

    const box = new THREE.Box3().setFromObject(group);
    const center = box.isEmpty()
      ? new THREE.Vector3()
      : box.getCenter(new THREE.Vector3());

    const size = box.isEmpty()
      ? new THREE.Vector3(100, 100, 100)
      : box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const cameraPosition = new THREE.Vector3(
      center.x,
      center.y,
      center.z + maxDim * 1.5
    );

    const camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      CAMERA_NEAR,
      CAMERA_FAR
    );
    camera.position.copy(cameraPosition);

    return { camera, cameraPosition, center };
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
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(backgroundColor);

    if (showGrid) {
      // Create a grid helper instead of plane geometry
      const grid = new THREE.GridHelper(
        GRID_SIZE,
        GRID_DIVISIONS,
        0x888888, // Main grid lines
        0x444444 // Secondary grid lines
      );
      // Rotate grid to XY plane (default is XZ)
      grid.rotation.x = Math.PI / 2;
      scene.add(grid);
    }

    if (showAxes) {
      const axesHelper = new THREE.AxesHelper(AXES_SIZE);
      scene.add(axesHelper);
    }

    scene.add(group);
    return scene;
  }, [backgroundColor, showGrid, showAxes, group]);

  // Controls setup - memoized to avoid recreation
  const controls = useMemo(() => {
    if (!camera || !renderer) return null;

    const controls = new OrbitControls(camera, renderer.domElement);
    const size = new THREE.Box3()
      .setFromObject(group)
      .getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // Basic settings
    controls.enableDamping = false;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.enableRotate = true;

    // Control speeds
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 1.0;
    controls.rotateSpeed = 0.8;

    // AutoCAD-style mouse controls
    controls.mouseButtons = {
      MIDDLE: THREE.MOUSE.PAN, // Middle mouse button for pan
      RIGHT: THREE.MOUSE.ROTATE, // Shift + Middle mouse for rotate
      LEFT: null, // Left mouse reserved for selection/measurement
    };

    // AutoCAD-style touch controls
    controls.touches = {
      TWO: THREE.TOUCH.PAN, // Two finger drag to pan
      ONE: null, // One finger reserved for selection/measurement
    };

    // Add keyboard modifier for rotation (Shift key)
    let isShiftDown = false;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        isShiftDown = true;
        controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
        controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        isShiftDown = false;
        controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
        controls.touches.TWO = THREE.TOUCH.PAN;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Add mouse wheel zoom
    const handleWheel = (event: WheelEvent) => {
      if (!controls.enabled) return;

      event.preventDefault();
      const delta = -event.deltaY;
      const zoomScale = 1.1;

      if (delta > 0) {
        controls.dollyIn(zoomScale);
      } else {
        controls.dollyOut(zoomScale);
      }
      controls.update();
    };
    renderer.domElement.addEventListener("wheel", handleWheel, {
      passive: false,
    });

    // Cleanup function to remove event listeners
    controls.dispose = () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      OrbitControls.prototype.dispose.call(controls);
    };

    // Pan settings
    controls.screenSpacePanning = true;
    controls.target.copy(center);

    return controls;
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

  // Function to calculate angle between three points
  const calculateAngle = (
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    p3: THREE.Vector3
  ) => {
    const v1 = new THREE.Vector3().subVectors(p1, p2);
    const v2 = new THREE.Vector3().subVectors(p3, p2);
    return v1.angleTo(v2) * (180 / Math.PI);
  };

  // Enhanced measure click handler
  const handleMeasureClick = useCallback(
    (event: MouseEvent) => {
      if (!camera || !scene || !renderer) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const intersectPoint = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, intersectPoint);

      const snappedPoint = findNearestPoint(intersectPoint) || intersectPoint;

      setMeasurePoints((prev) => {
        const newPoints = [...prev, snappedPoint];

        switch (measureMode) {
          case "distance":
            if (newPoints.length === 2) {
              const distance = newPoints[0].distanceTo(newPoints[1]);
              setMeasureValue(`Distance: ${distance.toFixed(2)} units`);

              const geometry = new THREE.BufferGeometry().setFromPoints(
                newPoints
              );
              const material = new THREE.LineBasicMaterial({ color: 0xff0000 });

              if (measureLineRef.current) {
                scene.remove(measureLineRef.current);
              }

              const line = new THREE.Line(geometry, material);
              measureLineRef.current = line;
              scene.add(line);

              if (measureTimeoutRef.current) {
                clearTimeout(measureTimeoutRef.current);
              }
              measureTimeoutRef.current = setTimeout(() => {
                setMeasureValue(null);
                if (measureLineRef.current && scene) {
                  scene.remove(measureLineRef.current);
                  measureLineRef.current = null;
                }
              }, 5000);

              return [];
            }
            break;

          case "angle":
            if (newPoints.length === 3) {
              const angle = calculateAngle(
                newPoints[0],
                newPoints[1],
                newPoints[2]
              );
              setMeasureValue(`Angle: ${angle.toFixed(1)}°`);

              const geometry = new THREE.BufferGeometry().setFromPoints(
                newPoints
              );
              const material = new THREE.LineBasicMaterial({ color: 0xff0000 });

              if (measureLineRef.current) {
                scene.remove(measureLineRef.current);
              }

              const line = new THREE.Line(geometry, material);
              measureLineRef.current = line;
              scene.add(line);

              if (measureTimeoutRef.current) {
                clearTimeout(measureTimeoutRef.current);
              }
              measureTimeoutRef.current = setTimeout(() => {
                setMeasureValue(null);
                if (measureLineRef.current && scene) {
                  scene.remove(measureLineRef.current);
                  measureLineRef.current = null;
                }
              }, 5000);

              return [];
            }
            break;

          case "select":
            const intersects = raycaster.intersectObjects(group.children, true);
            if (intersects.length > 0) {
              const selected = intersects[0].object;
              setSelectedEntities((prev) => {
                if (event.shiftKey) {
                  const isSelected = prev.includes(selected);
                  return isSelected
                    ? prev.filter((obj) => obj !== selected)
                    : [...prev, selected];
                } else {
                  return [selected];
                }
              });
            } else if (!event.shiftKey) {
              setSelectedEntities([]);
            }
            return [];
        }

        return newPoints;
      });
    },
    [camera, scene, renderer, measureMode, findNearestPoint, group]
  );

  // Update selection visuals
  useEffect(() => {
    selectedEntities.forEach((entity) => {
      if (entity instanceof THREE.Line) {
        const originalMaterial = entity.material as THREE.LineBasicMaterial;
        entity.material = new THREE.LineBasicMaterial({
          color: 0xff0000,
          linewidth: originalMaterial.linewidth,
        });
      }
    });

    return () => {
      selectedEntities.forEach((entity) => {
        if (entity instanceof THREE.Line) {
          entity.material = material;
        }
      });
    };
  }, [selectedEntities, material]);

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

  // Enhanced mouse move handler
  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!camera || !scene || !renderer || measureMode === "none") return;

      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const intersectPoint = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, intersectPoint);

      const snappedPoint = findNearestPoint(intersectPoint) || intersectPoint;

      switch (measureMode) {
        case "select":
          const intersects = raycaster.intersectObjects(group.children, true);
          setCursor(intersects.length > 0 ? "pointer" : "default");
          break;
        case "distance":
        case "angle":
          setCursor("crosshair");
          break;
      }

      if (measurePoints.length > 0) {
        if (measureGuide) {
          scene.remove(measureGuide);
        }

        let points: THREE.Vector3[] = [];
        switch (measureMode) {
          case "distance":
            points = [measurePoints[0], snappedPoint];
            const distance = measurePoints[0].distanceTo(snappedPoint);
            setMeasureText(`${distance.toFixed(2)} units`);
            break;
          case "angle":
            if (measurePoints.length === 1) {
              points = [measurePoints[0], snappedPoint];
            } else if (measurePoints.length === 2) {
              points = [measurePoints[0], measurePoints[1], snappedPoint];
              const angle = calculateAngle(
                measurePoints[0],
                measurePoints[1],
                snappedPoint
              );
              setMeasureText(`${angle.toFixed(1)}°`);
            }
            break;
        }

        if (points.length > 0) {
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const material = new THREE.LineBasicMaterial({
            color: 0xff0000,
            opacity: 0.5,
            transparent: true,
          });

          const guide = new THREE.Line(geometry, material);
          scene.add(guide);
          setMeasureGuide(guide);
        }
      }
    },
    [
      camera,
      scene,
      renderer,
      measureMode,
      measurePoints,
      findNearestPoint,
      group,
      calculateAngle,
    ]
  );

  // Update controls based on measure mode
  useEffect(() => {
    if (!controls || !renderer?.domElement) return;

    controls.enabled = measureMode === "none";

    if (measureMode !== "none") {
      renderer.domElement.addEventListener("mousemove", handleMouseMove);
      renderer.domElement.addEventListener("click", handleMeasureClick);
    } else {
      renderer.domElement.removeEventListener("mousemove", handleMouseMove);
      renderer.domElement.removeEventListener("click", handleMeasureClick);

      // Clear measurements
      if (measureGuide && scene) {
        scene.remove(measureGuide);
        setMeasureGuide(null);
      }
      setMeasurePoints([]);
      setMeasureText("");
      setCursor("default");
    }

    return () => {
      renderer.domElement.removeEventListener("mousemove", handleMouseMove);
      renderer.domElement.removeEventListener("click", handleMeasureClick);
    };
  }, [
    measureMode,
    controls,
    renderer,
    scene,
    handleMouseMove,
    handleMeasureClick,
  ]);

  // Update container cursor
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.cursor = cursor;
    }
  }, [cursor]);

  return (
    <div style={{ width, height, position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Mode indicator */}
      <div
        style={{
          position: "absolute",
          top: "1rem",
          left: "50%",
          transform: "translateX(-50%)",
          padding: "0.5rem",
          background: "#00000088",
          color: "white",
          borderRadius: "4px",
          display: measureMode !== "none" ? "block" : "none",
        }}
      >
        {measureMode.charAt(0).toUpperCase() + measureMode.slice(1)} Mode
        {measureText && ` - ${measureText}`}
      </div>

      {/* Measurement mode buttons */}
      <div
        style={{
          position: "absolute",
          bottom: "1rem",
          left: "1rem",
          display: "flex",
          gap: "0.5rem",
        }}
      >
        {(["none", "select", "distance", "angle"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => {
              setMeasureMode(mode);
              setMeasurePoints([]);
              setMeasureText("");
              if (measureGuide && scene) {
                scene.remove(measureGuide);
                setMeasureGuide(null);
              }
            }}
            style={{
              padding: "0.5rem",
              background: measureMode === mode ? "#ff0000" : "#ffffff",
              color: measureMode === mode ? "#ffffff" : "#000000",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            {mode === "none"
              ? "Pan"
              : mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      {/* Measurement value display */}
      {measureValue && (
        <div
          style={{
            position: "absolute",
            bottom: "1rem",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "0.5rem",
            background: "#00000088",
            color: "white",
            borderRadius: "4px",
          }}
        >
          {measureValue}
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
