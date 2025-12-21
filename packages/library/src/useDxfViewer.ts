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
  interactive = true,
  defaultTool = "pan",
  onLoad,
  onError,
  onMeasureComplete,
}: DxfViewerProps) => {
  // SSR guard - don't initialize on server
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationFrameRef = useRef<number>();
  const groupRef = useRef<THREE.Group | null>(null); // Track group reference

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

  // Track container dimensions - initialize immediately with defaults
  useLayoutEffect(() => {
    if (containerRef.current) {
      const width = containerRef.current.clientWidth || 800;
      const height = containerRef.current.clientHeight || 600;
      
      // Always set dimensions if not set, or update if changed
      if (!containerDimensions) {
        setContainerDimensions({ width, height });
      } else if (
        containerDimensions.width !== width || 
        containerDimensions.height !== height
      ) {
        setContainerDimensions({ width, height });
      }
    } else if (!containerDimensions) {
      // Set default dimensions even if container isn't ready yet
      setContainerDimensions({ width: 800, height: 600 });
      console.log("[DXF Viewer] Container dimensions set to defaults (container not ready)");
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
    if (!isMounted || !containerDimensions) return null; // SSR guard
    
    // Verify Three.js is available
    if (typeof THREE === 'undefined' || !THREE.WebGLRenderer) {
      console.error("[DXF Viewer] Three.js is not available");
      return null;
    }
    
    try {
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
        precision: "mediump",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(containerDimensions.width, containerDimensions.height);
      
      return renderer;
    } catch (error) {
      console.error("[DXF Viewer] Error creating WebGLRenderer:", error);
      return null;
    }
  }, [containerDimensions]);

  const scene = useMemo(() => {
    // Use ref to ensure we're using the correct group instance
    const currentGroup = groupRef.current || group;
    
    const newScene = setupScene({
      backgroundColor,
      showGrid,
      showAxes,
      group: currentGroup,
      gridSize: 100,
      axesSize: 50,
    });
    
    return newScene;
  }, [backgroundColor, showGrid, showAxes, group]);

  const controls = useMemo(() => {
    if (!camera || !renderer) return null;
    const controls = setupControls(camera, renderer, center);
    // Disable controls if not interactive
    if (!interactive && controls) {
      controls.enabled = false;
    }
    return controls;
  }, [camera, renderer, center, interactive]);

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
    if (interactive) {
      controlsRef.current.update();
      
      // Force camera to look straight down (2D lock)
      const camera = cameraRef.current;
      if (camera.type === 'OrthographicCamera') {
        const orthoCamera = camera as THREE.OrthographicCamera;
        // Ensure camera is always positioned above the scene looking down
        // Lock Z position to be positive (above the scene)
        if (orthoCamera.position.z < 1) {
          orthoCamera.position.z = 1;
        }
        // Force look at the target (which should be at z=0)
        const target = controlsRef.current.target;
        orthoCamera.lookAt(target);
        // Ensure up vector is correct for 2D view
        orthoCamera.up.set(0, 1, 0);
      }
    }
    rendererRef.current.render(sceneRef.current, cameraRef.current);
  }, [interactive]);

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
    
    if (!interactive) {
      // Deactivate current tool if interactivity is disabled
      if (activeTool) {
        const toolContext = { scene, camera, renderer, controls, group };
        activeTool.deactivate(toolContext);
        setActiveTool(null);
      }
      return;
    }
    
    const toolContext = { scene, camera, renderer, controls, group };

    activeTool?.deactivate(toolContext);

    const newTool = tools[currentTool];
    newTool.activate(toolContext);
    setActiveTool(newTool);

    return () => newTool.deactivate(toolContext);
  }, [currentTool, scene, camera, renderer, controls, group, tools, interactive, activeTool]);

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
    if (!canvas || !interactive) return; // Don't attach listeners if not interactive
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
    };
  }, [renderer, handleMouseDown, handleMouseMove, handleMouseUp, interactive]);

  // Init Effect - wait for all dependencies to be ready
  useEffect(() => {
    // Check if all dependencies are ready
    const allReady = containerRef.current && camera && renderer && controls && scene;
    
    if (!allReady) {
      return;
    }
    
    const container = containerRef.current;
    if (!container) return;

    // Clear any existing content
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    try {
      rendererRef.current = renderer;
      sceneRef.current = scene;
      cameraRef.current = camera;
      controlsRef.current = controls;

      container.appendChild(renderer.domElement);
      
      // Force initial render
      renderer.render(scene, camera);
      
      // Find the DXF group (not the grid group)
      const allGroups = scene.children.filter(c => c.type === 'Group');
      const gridGroup = allGroups.find(g => g.userData?.isGrid || g.children.some(ch => ch.type === 'GridHelper'));
      const dxfGroup = allGroups.find(g => g !== gridGroup);
      
      // Use the ref to ensure we're checking the correct group instance
      const currentGroup = groupRef.current || group;
      
      // Verify the group we passed is actually in the scene
      const groupInScene = scene.children.includes(currentGroup);
      
      // If group is not in scene, add it!
      // This can happen due to React's render cycle timing - the fallback fixes it
      if (!groupInScene && !dxfGroup) {
        scene.add(currentGroup);
        renderer.render(scene, camera);
      }
      
      // Re-check entity count after potential fix
      const finalDxfGroup = scene.children.find(c => c === currentGroup) || 
                           scene.children.find(c => c.type === 'Group' && c.name === 'dxf-content-group') ||
                           scene.children.filter(c => c.type === 'Group').find(g => {
                             const isGrid = g.userData?.isGrid || g.children.some(ch => ch.type === 'GridHelper');
                             return !isGrid;
                           });
      
      let finalEntityCount = 0;
      if (finalDxfGroup) {
        finalEntityCount = finalDxfGroup.children.reduce((sum, layer) => {
          const layerChildren = layer.children?.length || 0;
          return sum + layerChildren;
        }, 0);
      }
      
      // Update the stats with correct entity count
      if (finalEntityCount > 0) {
        setStats(prev => ({ ...prev, totalEntities: finalEntityCount }));
      }
      
      animate();
      window.addEventListener("resize", handleResize);
      
      return () => {
        window.removeEventListener("resize", handleResize);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        // Clean up renderer
        if (rendererRef.current) {
          rendererRef.current.dispose();
        }
      };
    } catch (error) {
      console.error("[DXF Viewer] Error during initialization:", error);
    }

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

  const exportImage = useCallback((format: "png" | "jpeg" = "png") => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current)
      return null;

    // Render one last time to ensure everything is up to date
    rendererRef.current.render(sceneRef.current, cameraRef.current);

    return rendererRef.current.domElement.toDataURL(`image/${format}`);
  }, []);

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
    exportImage,
    // Expose internal instances for extension
    scene: sceneRef.current,
    camera: cameraRef.current,
    renderer: rendererRef.current,
    controls: controlsRef.current,
    dxfEntities: entities,
    dxfGroup: group,
  };
};
