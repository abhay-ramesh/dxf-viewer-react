import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { processDxf } from "./processDxf";
import { setupCamera } from "./setupCamera";
import { setupControls } from "./setupControls";
import { setupScene } from "./setupScene";
import { MeasureTool, PanTool, SelectTool, Tool } from "./tools";
import { DxfViewerProps } from "./types";
import { DxfAnalyzer } from "./utils/DxfAnalyzer";

// Reusable constants and geometries
const GRID_SIZE = 100;

const AXES_SIZE = 50;

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
  showShapeColors = true,
  onLoad,
  onError,
  defaultTool = "pan",
  onMeasureComplete,
  showDebug = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationFrameRef = useRef<number>();
  const [error, setError] = useState<string | null>(null);
  const [containerDimensions, setContainerDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [currentTool, setCurrentTool] = useState<"pan" | "select" | "measure">(
    defaultTool
  );
  const [activeTool, setActiveTool] = useState<Tool | null>(null);
  const [selectedEntityInfo, setSelectedEntityInfo] =
    useState<EntityInfo | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    info: EntityInfo;
    x: number;
    y: number;
  } | null>(null);
  const [measureText, setMeasureText] = useState<string | null>(null);

  // Track container dimensions when mounted (useLayoutEffect runs synchronously)
  useLayoutEffect(() => {
    if (containerRef.current && !containerDimensions) {
      setContainerDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    }
  }, [containerDimensions]);

  // Update container dimensions on resize for orthographic camera
  useLayoutEffect(() => {
    if (!containerRef.current || !containerDimensions) return;

    const handleContainerResize = () => {
      if (containerRef.current) {
        const newWidth = containerRef.current.clientWidth;
        const newHeight = containerRef.current.clientHeight;

        if (
          newWidth !== containerDimensions.width ||
          newHeight !== containerDimensions.height
        ) {
          setContainerDimensions({ width: newWidth, height: newHeight });
        }
      }
    };

    // Use ResizeObserver for better performance if available
    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(handleContainerResize);
      resizeObserver.observe(containerRef.current);

      return () => resizeObserver.disconnect();
    }
  }, [containerDimensions]);

  // Sync currentTool with defaultTool prop changes
  useEffect(() => {
    setCurrentTool(defaultTool);
  }, [defaultTool]);

  // Create material outside of useEffect
  const material = useMemo(
    () => new THREE.LineBasicMaterial({ color: entityColor }),
    [entityColor]
  );

  // Process DXF content
  const { group, stats, entities, parseError, dxfHeader } = useMemo(() => {
    return processDxf(dxfContent || "", material, showShapeColors);
  }, [dxfContent, material, showShapeColors]);

  // Camera setup - memoized to avoid recalculation
  const { camera, center } = useMemo(() => {
    if (!containerDimensions) {
      return {
        camera: null,
        center: new THREE.Vector3(),
      };
    }

    return setupCamera({
      containerWidth: containerDimensions.width,
      containerHeight: containerDimensions.height,
      group,
    });
  }, [group, containerDimensions]);

  // Renderer setup - memoized to avoid recreation
  const renderer = useMemo(() => {
    if (!containerDimensions) return null;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      precision: "mediump",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(containerDimensions.width, containerDimensions.height);

    return renderer;
  }, [containerDimensions]);

  // Scene setup - already memoized, but simplified
  const scene = useMemo(() => {
    return setupScene({
      backgroundColor,
      showGrid,
      showAxes,
      group,
      gridSize: GRID_SIZE,
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

  // Resize handler - orthographic camera only
  const handleResize = useCallback(() => {
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const container = containerRef.current;

    if (!container || !renderer || !camera) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // For orthographic camera, adjust frustum to maintain aspect ratio
    const aspect = width / height;
    const currentHeight = camera.top - camera.bottom;

    // Keep current zoom level, adjust aspect ratio
    const newWidth = currentHeight * aspect;
    const centerX = (camera.left + camera.right) / 2;

    camera.left = centerX - newWidth / 2;
    camera.right = centerX + newWidth / 2;

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
      measure: new MeasureTool(onMeasureComplete, undefined, (text) =>
        setMeasureText(text)
      ),
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
    const newTool = tools[currentTool as keyof typeof tools];
    newTool.activate(toolContext);
    setActiveTool(newTool);

    return () => newTool.deactivate(toolContext);
  }, [currentTool, scene, camera, renderer, controls, group, tools]);

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

    // Capture the current container reference for cleanup
    const container = containerRef.current;

    // Handle errors
    if (parseError) {
      handleDxfError(parseError, setError, onError);
      return;
    }

    // Set refs for use in other effects
    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;

    // Append renderer to container
    container.appendChild(renderer.domElement);

    // Start animation loop
    animate();

    // Add resize listener
    window.addEventListener("resize", handleResize);

    // Call onLoad with stats if provided
    if (onLoad) {
      // Filter stats to only include numeric values
      const numericStats: Record<string, number> = {};
      Object.entries(stats).forEach(([key, value]) => {
        if (typeof value === "number") {
          numericStats[key] = value;
        }
      });
      onLoad(numericStats);
    }

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

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
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
    showDebugInfo,
  ]);

  // Analyze DXF for closed loops
  const analyzedData = useMemo(() => {
    if (!dxfContent || !entities) return null;
    return {
      totalEntities: entities.length,
      entityTypes: Object.entries(stats).map(([type, count]) => ({
        type,
        count,
      })),
      closedLoops: DxfAnalyzer.findClosedLoops({ entities }),
      dxfHeader,
    };
  }, [dxfContent, entities, stats, dxfHeader]);

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
          background: "rgba(255, 255, 255, 0.95)",
          padding: "0.5rem",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
          border: "1px solid rgba(0, 0, 0, 0.1)",
        }}
      >
        <button
          onClick={() => setCurrentTool("pan")}
          style={{
            padding: "0.5rem 0.75rem",
            background: currentTool === "pan" ? "#0066cc" : "transparent",
            color: currentTool === "pan" ? "#ffffff" : "#333333",
            border: currentTool === "pan" ? "none" : "1px solid #e0e0e0",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "0.875rem",
            fontWeight: "500",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
          }}
          onMouseEnter={(e) => {
            if (currentTool !== "pan") {
              e.currentTarget.style.background = "#f5f5f5";
            }
          }}
          onMouseLeave={(e) => {
            if (currentTool !== "pan") {
              e.currentTarget.style.background = "transparent";
            }
          }}
        >
          ⭐ Pan
        </button>
        <button
          onClick={() => setCurrentTool("select")}
          style={{
            padding: "0.5rem 0.75rem",
            background: currentTool === "select" ? "#0066cc" : "transparent",
            color: currentTool === "select" ? "#ffffff" : "#333333",
            border: currentTool === "select" ? "none" : "1px solid #e0e0e0",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "0.875rem",
            fontWeight: "500",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
          }}
          onMouseEnter={(e) => {
            if (currentTool !== "select") {
              e.currentTarget.style.background = "#f5f5f5";
            }
          }}
          onMouseLeave={(e) => {
            if (currentTool !== "select") {
              e.currentTarget.style.background = "transparent";
            }
          }}
        >
          🎯 Select
        </button>
        <button
          onClick={() => setCurrentTool("measure")}
          style={{
            padding: "0.5rem 0.75rem",
            background: currentTool === "measure" ? "#0066cc" : "transparent",
            color: currentTool === "measure" ? "#ffffff" : "#333333",
            border: currentTool === "measure" ? "none" : "1px solid #e0e0e0",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "0.875rem",
            fontWeight: "500",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
          }}
          onMouseEnter={(e) => {
            if (currentTool !== "measure") {
              e.currentTarget.style.background = "#f5f5f5";
            }
          }}
          onMouseLeave={(e) => {
            if (currentTool !== "measure") {
              e.currentTarget.style.background = "transparent";
            }
          }}
        >
          📏 Measure
        </button>
      </div>

      {/* Measurement Display */}
      {measureText && (
        <div
          style={{
            position: "absolute",
            bottom: "1rem",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0, 0, 0, 0.9)",
            color: "white",
            padding: "0.75rem 1.25rem",
            borderRadius: "8px",
            fontFamily: "monospace",
            fontSize: "0.875rem",
            fontWeight: "500",
            zIndex: 1000,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
            whiteSpace: "nowrap",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span>📏</span>
          {measureText}
        </div>
      )}

      {/* Consolidated Debug Panel */}
      {(showDebug || showDebugInfo || selectedEntityInfo) && (
        <div
          style={{
            position: "absolute",
            top: "1rem",
            right: "1rem",
            background: "rgba(255, 255, 255, 0.95)",
            color: "#333333",
            padding: "1rem",
            borderRadius: "12px",
            fontFamily: "system-ui, -apple-system, sans-serif",
            fontSize: "0.875rem",
            minWidth: "280px",
            maxWidth: "380px",
            maxHeight: "calc(100% - 2rem)",
            overflowY: "auto",
            zIndex: 1000,
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
            border: "1px solid rgba(0, 0, 0, 0.1)",
            backdropFilter: "blur(10px)",
          }}
        >
          {/* File & Grid Information Section */}
          {(showDebug || showDebugInfo) && (
            <div style={{ marginBottom: "1rem" }}>
              <div
                style={{
                  borderBottom: "2px solid #0066cc",
                  paddingBottom: "0.5rem",
                  marginBottom: "0.75rem",
                  fontWeight: "600",
                  fontSize: "1rem",
                  color: "#0066cc",
                }}
              >
                📋 File & Grid Information
              </div>
              <div style={{ fontSize: "0.8rem" }}>
                <div style={{ marginBottom: "0.25rem" }}>
                  <strong>Drawing Units:</strong> {stats.DXF_UNITS || "Unknown"}
                </div>
                {stats.DXF_UNITS_FORMAT &&
                  stats.DXF_UNITS_FORMAT !== "Unknown" && (
                    <div style={{ marginBottom: "0.25rem" }}>
                      <strong>Units Format:</strong> {stats.DXF_UNITS_FORMAT}
                    </div>
                  )}
                {stats.DXF_MEASUREMENT &&
                  stats.DXF_MEASUREMENT !== "Unknown" && (
                    <div style={{ marginBottom: "0.25rem" }}>
                      <strong>Measurement System:</strong>{" "}
                      {stats.DXF_MEASUREMENT}
                    </div>
                  )}
                <div style={{ marginBottom: "0.25rem" }}>
                  <strong>Grid Size:</strong> {stats.GRID_SIZE} units
                </div>
                <div style={{ marginBottom: "0.25rem" }}>
                  <strong>Grid Divisions:</strong> {stats.GRID_DIVISIONS}
                </div>
                <div style={{ marginBottom: "0.25rem" }}>
                  <strong>Grid Unit Size:</strong> {stats.GRID_UNIT_SIZE}{" "}
                  units/division
                </div>
              </div>
            </div>
          )}

          {/* Entity Statistics Section */}
          {(showDebug || showDebugInfo) && analyzedData && (
            <>
              <div style={{ marginBottom: "1rem" }}>
                <div
                  style={{
                    borderBottom: "2px solid #0066cc",
                    paddingBottom: "0.5rem",
                    marginBottom: "0.75rem",
                    fontWeight: "600",
                    fontSize: "1rem",
                    color: "#0066cc",
                  }}
                >
                  📊 Entity Statistics
                </div>
                <div style={{ marginBottom: "0.5rem" }}>
                  <strong>Total Entities:</strong> {analyzedData.totalEntities}
                </div>
                <div>
                  {analyzedData.entityTypes.map(({ type, count }) => (
                    <div key={type} style={{ paddingLeft: "1rem" }}>
                      {type}: {count}
                    </div>
                  ))}
                </div>
              </div>

              {/* Closed Loops Section */}
              <div style={{ marginBottom: "1rem" }}>
                <div
                  style={{
                    borderBottom: "2px solid #0066cc",
                    paddingBottom: "0.5rem",
                    marginBottom: "0.75rem",
                    fontWeight: "600",
                    fontSize: "1rem",
                    color: "#0066cc",
                  }}
                >
                  🔄 Closed Loops ({analyzedData.closedLoops.length})
                </div>
                {analyzedData.closedLoops.map((loop, index) => (
                  <div
                    key={index}
                    style={{
                      marginBottom: "0.75rem",
                      padding: "0.75rem",
                      borderLeft: "4px solid #0066cc",
                      background: "rgba(0, 102, 204, 0.1)",
                      borderRadius: "0 6px 6px 0",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: "600",
                        marginBottom: "0.5rem",
                        color: "#0066cc",
                      }}
                    >
                      Loop {index + 1}
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.25rem",
                      }}
                    >
                      <div>
                        <strong>Entities:</strong> {loop.entities.length}
                      </div>
                      <div>
                        <strong>Area:</strong> {loop.area.toFixed(2)} units²
                      </div>
                      <div>
                        <strong>Perimeter:</strong> {loop.perimeter.toFixed(2)}{" "}
                        units
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Selected Entity Section */}
          {selectedEntityInfo && (
            <div>
              <div
                style={{
                  borderBottom: "2px solid #0066cc",
                  paddingBottom: "0.5rem",
                  marginBottom: "0.75rem",
                  fontWeight: "600",
                  fontSize: "1rem",
                  color: "#0066cc",
                }}
              >
                🎯 Selected Entity
              </div>
              <div style={{ paddingLeft: "0.5rem" }}>
                <div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>
                  Type: {selectedEntityInfo.type}
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
            </div>
          )}
        </div>
      )}

      {/* Keep the hover info separate as it follows the cursor */}
      {hoverInfo && (
        <div
          style={{
            position: "absolute",
            top: `${hoverInfo.y + 20}px`,
            left: `${hoverInfo.x + 20}px`,
            background: "rgba(0, 0, 0, 0.9)",
            color: "white",
            padding: "0.5rem 0.75rem",
            borderRadius: "6px",
            fontSize: "0.75rem",
            fontWeight: "500",
            pointerEvents: "none",
            zIndex: 1001,
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            backdropFilter: "blur(8px)",
            whiteSpace: "nowrap",
          }}
        >
          <strong>{hoverInfo.info.type}</strong>
          {hoverInfo.info.length !== undefined && (
            <span> • Length: {hoverInfo.info.length.toFixed(1)}</span>
          )}
          {hoverInfo.info.radius !== undefined && (
            <span> • Radius: {hoverInfo.info.radius.toFixed(1)}</span>
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
            background: "rgba(220, 53, 69, 0.95)",
            color: "white",
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            fontSize: "0.875rem",
            fontWeight: "500",
            boxShadow: "0 4px 12px rgba(220, 53, 69, 0.3)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            backdropFilter: "blur(10px)",
            maxWidth: "300px",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span>⚠️</span>
          {error}
        </div>
      )}
    </div>
  );
};
