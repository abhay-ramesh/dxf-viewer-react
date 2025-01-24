import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { processDxf } from "./processDxf";
import { setupCamera } from "./setupCamera";
import { setupControls } from "./setupControls";
import { setupScene } from "./setupScene";
import { MeasureTool, PanTool, SelectTool, Tool } from "./tools";
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

interface EntityInfo {
  type: string;
  length?: number;
  radius?: number;
  center?: THREE.Vector3;
  startPoint?: THREE.Vector3;
  endPoint?: THREE.Vector3;
  vertices?: number;
}

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
  defaultTool = "pan",
  onMeasureComplete,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationFrameRef = useRef<number>();
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [activeTool, setActiveTool] = useState<Tool | null>(null);
  const [selectedEntityInfo, setSelectedEntityInfo] =
    useState<EntityInfo | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    info: EntityInfo;
    x: number;
    y: number;
  } | null>(null);

  // Create material outside of useEffect
  const material = useMemo(
    () => new THREE.LineBasicMaterial({ color: entityColor }),
    [entityColor]
  );

  // Process DXF content
  const { group, stats, entities, parseError } = useMemo(
    () => processDxf(dxfContent, material),
    [dxfContent, material]
  );

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

  // Create tools with info callback
  const tools = useMemo(
    () => ({
      pan: new PanTool(),
      select: new SelectTool(
        (info) => setSelectedEntityInfo(info),
        (info, x, y) => setHoverInfo(info ? { info, x, y } : null)
      ),
      measure: new MeasureTool(onMeasureComplete),
    }),
    [onMeasureComplete]
  );

  // Handle tool changes
  useEffect(() => {
    if (!scene || !camera || !renderer || !controls || !group) return;

    const toolContext = { scene, camera, renderer, controls, group };

    // Deactivate current tool
    activeTool?.deactivate(toolContext);

    // Activate new tool
    const newTool = tools[defaultTool];
    newTool.activate(toolContext);
    setActiveTool(newTool);

    return () => newTool.deactivate(toolContext);
  }, [defaultTool, scene, camera, renderer, controls, group, tools]);

  // Handle mouse events
  const handleMouseDown = useCallback(
    (event: MouseEvent) => {
      if (!scene || !camera || !renderer || !controls || !group || !activeTool)
        return;
      activeTool.onMouseDown?.(event, {
        scene,
        camera,
        renderer,
        controls,
        group,
      });
    },
    [scene, camera, renderer, controls, group, activeTool]
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!scene || !camera || !renderer || !controls || !group || !activeTool)
        return;
      activeTool.onMouseMove?.(event, {
        scene,
        camera,
        renderer,
        controls,
        group,
      });
    },
    [scene, camera, renderer, controls, group, activeTool]
  );

  const handleMouseUp = useCallback(
    (event: MouseEvent) => {
      if (!scene || !camera || !renderer || !controls || !group || !activeTool)
        return;
      activeTool.onMouseUp?.(event, {
        scene,
        camera,
        renderer,
        controls,
        group,
      });
    },
    [scene, camera, renderer, controls, group, activeTool]
  );

  // Add event listeners
  useEffect(() => {
    const canvas = renderer?.domElement;
    if (!canvas) return;

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
    };
  }, [renderer, handleMouseDown, handleMouseMove, handleMouseUp]);

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

  return (
    <div style={{ width, height, position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Tool buttons */}
      <div
        style={{
          position: "absolute",
          bottom: "1rem",
          left: "1rem",
          display: "flex",
          gap: "0.5rem",
        }}
      >
        <button
          onClick={() => setActiveTool(tools.pan)}
          style={{
            padding: "0.5rem",
            background: activeTool?.type === "pan" ? "#ff0000" : "#ffffff",
            color: activeTool?.type === "pan" ? "#ffffff" : "#000000",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Pan
        </button>
        <button
          onClick={() => setActiveTool(tools.select)}
          style={{
            padding: "0.5rem",
            background: activeTool?.type === "select" ? "#ff0000" : "#ffffff",
            color: activeTool?.type === "select" ? "#ffffff" : "#000000",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Select
        </button>
        <button
          onClick={() => setActiveTool(tools.measure)}
          style={{
            padding: "0.5rem",
            background: activeTool?.type === "measure" ? "#ff0000" : "#ffffff",
            color: activeTool?.type === "measure" ? "#ffffff" : "#000000",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Measure
        </button>
      </div>

      {/* Hover Info Display */}
      {hoverInfo && (
        <div
          style={{
            position: "absolute",
            top: `${hoverInfo.y + 20}px`,
            left: `${hoverInfo.x + 20}px`,
            background: "#00000088",
            color: "white",
            padding: "0.25rem 0.5rem",
            borderRadius: "4px",
            fontSize: "12px",
            pointerEvents: "none",
            zIndex: 1000,
          }}
        >
          {hoverInfo.info.type}
          {hoverInfo.info.length !== undefined && (
            <span> - Length: {hoverInfo.info.length.toFixed(1)}</span>
          )}
          {hoverInfo.info.radius !== undefined && (
            <span> - Radius: {hoverInfo.info.radius.toFixed(1)}</span>
          )}
        </div>
      )}

      {/* Debug Info */}
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

      {/* Selected Entity Info */}
      {selectedEntityInfo && (
        <div
          style={{
            position: "absolute",
            top: showDebugInfo ? "5rem" : "1rem",
            right: "1rem",
            background: "#00000088",
            color: "white",
            padding: "0.5rem",
            borderRadius: "4px",
            fontSize: "12px",
            minWidth: "200px",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
            {selectedEntityInfo.type}
          </div>
          {selectedEntityInfo.length !== undefined && (
            <div>Length: {selectedEntityInfo.length.toFixed(2)}</div>
          )}
          {selectedEntityInfo.radius !== undefined && (
            <div>Radius: {selectedEntityInfo.radius.toFixed(2)}</div>
          )}
          {selectedEntityInfo.vertices !== undefined && (
            <div>Vertices: {selectedEntityInfo.vertices}</div>
          )}
          {selectedEntityInfo.center && (
            <div>
              Center: ({selectedEntityInfo.center.x.toFixed(1)},
              {selectedEntityInfo.center.y.toFixed(1)})
            </div>
          )}
          {selectedEntityInfo.startPoint && (
            <div>
              Start: ({selectedEntityInfo.startPoint.x.toFixed(1)},
              {selectedEntityInfo.startPoint.y.toFixed(1)})
            </div>
          )}
          {selectedEntityInfo.endPoint && (
            <div>
              End: ({selectedEntityInfo.endPoint.x.toFixed(1)},
              {selectedEntityInfo.endPoint.y.toFixed(1)})
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
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
    </div>
  );
};
