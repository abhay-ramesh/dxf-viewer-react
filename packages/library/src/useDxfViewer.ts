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
import { DxfViewerProps, EntityInfo, LayerInfo } from "./types";
import { DxfAnalyzer } from "./utils/DxfAnalyzer";

// Hook to manage the viewer logic
export const useDxfViewer = ({
  dxfContent,
  backgroundColor = 0xf0f0f0,
  entityColor = 0x0000ff,
  showGrid = true,
  showAxes = true,
  showShapeColors = true,
  defaultTool = "pan",
  onLoad,
  onError,
  onMeasureComplete,
}: DxfViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationFrameRef = useRef<number>();

  const [error, setError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
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
  const [stats, setStats] = useState<Record<string, number | string>>({});
  const [analyzedData, setAnalyzedData] = useState<any>(null);
  const [layers, setLayers] = useState<LayerInfo[]>([]);

  // Track container dimensions
  useLayoutEffect(() => {
    if (containerRef.current && !containerDimensions) {
      setContainerDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    }
  }, [containerDimensions]);

  // Resize observer
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

    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(handleContainerResize);
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, [containerDimensions]);

  // Tool sync
  useEffect(() => {
    setCurrentTool(defaultTool);
  }, [defaultTool]);

  const material = useMemo(
    () => new THREE.LineBasicMaterial({ color: entityColor }),
    [entityColor]
  );

  // Process DXF
  const {
    group,
    stats: processedStats,
    entities,
    parseError,
    dxfHeader,
    layers: processedLayers,
    layerTable,
  } = useMemo(() => {
    return processDxf(dxfContent || "", material, showShapeColors);
  }, [dxfContent, material, showShapeColors]);

  // Initial layer state
  useEffect(() => {
    if (layerTable) {
      const initialLayers = Object.entries(layerTable).map(([name, data]) => ({
        name,
        color: data.color,
        visible: true,
      }));
      setLayers(initialLayers);
    }
  }, [layerTable]);

  // Update stats state
  useEffect(() => {
    setStats(processedStats);
    if (parseError) {
      setError(
        parseError instanceof Error ? parseError.message : "Failed to parse DXF"
      );
      onError?.(
        parseError instanceof Error
          ? parseError
          : new Error("Failed to parse DXF")
      );
    } else {
      setError(null);
    }
  }, [processedStats, parseError, onError]);

  // Analyze Data
  useEffect(() => {
    if (dxfContent && entities) {
      setAnalyzedData({
        totalEntities: entities.length,
        entityTypes: Object.entries(processedStats).map(([type, count]) => ({
          type,
          count,
        })),
        closedLoops: DxfAnalyzer.findClosedLoops({ entities }),
        dxfHeader,
      });
      setIsLoaded(true);
    }
  }, [dxfContent, entities, processedStats, dxfHeader]);

  // Setup Three.js
  const { camera, center } = useMemo(() => {
    if (!containerDimensions)
      return { camera: null, center: new THREE.Vector3() };
    return setupCamera({
      containerWidth: containerDimensions.width,
      containerHeight: containerDimensions.height,
      group,
    });
  }, [group, containerDimensions]);

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

  const scene = useMemo(() => {
    return setupScene({
      backgroundColor,
      showGrid,
      showAxes,
      group,
      gridSize: 100,
      axesSize: 50,
    });
  }, [backgroundColor, showGrid, showAxes, group]);

  const controls = useMemo(() => {
    if (!camera || !renderer) return null;
    return setupControls(camera, renderer, center);
  }, [camera, renderer, center]);

  // Animation Loop
  const animate = useCallback(() => {
    if (
      !cameraRef.current ||
      !rendererRef.current ||
      !sceneRef.current ||
      !controlsRef.current
    )
      return;
    animationFrameRef.current = requestAnimationFrame(animate);
    controlsRef.current.update();
    rendererRef.current.render(sceneRef.current, cameraRef.current);
  }, []);

  const handleResize = useCallback(() => {
    if (!containerRef.current || !rendererRef.current || !cameraRef.current)
      return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const camera = cameraRef.current;

    const aspect = width / height;
    const currentHeight = camera.top - camera.bottom;
    const newWidth = currentHeight * aspect;
    const centerX = (camera.left + camera.right) / 2;

    camera.left = centerX - newWidth / 2;
    camera.right = centerX + newWidth / 2;
    camera.updateProjectionMatrix();
    rendererRef.current.setSize(width, height);
  }, []);

  // Tools Setup
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

  // Tool Activation/Deactivation
  useEffect(() => {
    if (!scene || !camera || !renderer || !controls || !group) return;
    const toolContext = { scene, camera, renderer, controls, group };

    activeTool?.deactivate(toolContext);

    const newTool = tools[currentTool];
    newTool.activate(toolContext);
    setActiveTool(newTool);

    return () => newTool.deactivate(toolContext);
  }, [currentTool, scene, camera, renderer, controls, group, tools]);

  // Event Listeners
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

  // Init Effect
  useEffect(() => {
    if (!containerRef.current || !camera || !renderer || !controls || !scene)
      return;
    const container = containerRef.current;

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;

    container.appendChild(renderer.domElement);
    animate();
    window.addEventListener("resize", handleResize);

    if (onLoad && isLoaded) {
      // Filter stats to only include numeric values
      const numericStats: Record<string, number> = {};
      Object.entries(processedStats).forEach(([key, value]) => {
        if (typeof value === "number") {
          numericStats[key] = value;
        }
      });
      onLoad(numericStats);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationFrameRef.current)
        cancelAnimationFrame(animationFrameRef.current);
      renderer.dispose();
      material.dispose();
      group.traverse((obj) => {
        if (obj instanceof THREE.Line) obj.geometry.dispose();
      });
      if (container.contains(renderer.domElement))
        container.removeChild(renderer.domElement);
    };
  }, [
    camera,
    renderer,
    controls,
    scene,
    animate,
    handleResize,
    material,
    group,
    onLoad,
    isLoaded,
    processedStats,
  ]);

  const toggleLayer = useCallback(
    (layerName: string) => {
      setLayers((prev) =>
        prev.map((layer) =>
          layer.name === layerName
            ? { ...layer, visible: !layer.visible }
            : layer
        )
      );

      if (processedLayers && processedLayers[layerName]) {
        processedLayers[layerName].visible =
          !processedLayers[layerName].visible;
      }
    },
    [processedLayers]
  );

  return {
    containerRef,
    currentTool,
    setCurrentTool,
    hoverInfo,
    selectedEntityInfo,
    measureText,
    stats,
    analyzedData,
    error,
    layers,
    toggleLayer,
    // Expose internal instances for extension
    scene: sceneRef.current,
    camera: cameraRef.current,
    renderer: rendererRef.current,
    controls: controlsRef.current,
    dxfEntities: entities,
    dxfGroup: group,
  };
};
