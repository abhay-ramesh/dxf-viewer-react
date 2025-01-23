import DxfParser from "dxf-parser";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import {
  processArc,
  processCircle,
  processLine,
  processPolyline,
  processSpline,
} from "./processors";
import { DxfViewerProps, EntityStats } from "./types";

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
  const controlsRef = useRef<OrbitControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>("");

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize Three.js scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(backgroundColor);

    const camera = new THREE.PerspectiveCamera(
      45,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      10000
    );

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(
      containerRef.current.clientWidth,
      containerRef.current.clientHeight
    );
    containerRef.current.appendChild(renderer.domElement);

    // Set up camera and controls
    camera.position.set(0, 0, 10);
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;

    // Configure controls for smoother interaction
    controls.enableDamping = true;
    controls.dampingFactor = 0.1; // Increased for more stability
    controls.screenSpacePanning = true;
    controls.enableRotate = true;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.5; // Reduced for more control
    controls.panSpeed = 0.5; // Reduced for more control
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };

    // Add key bindings for reset
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "r" || event.key === "R") {
        if (controlsRef.current) {
          controlsRef.current.reset();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    if (showGrid) {
      const gridHelper = new THREE.GridHelper(100, 100, 0x888888, 0xcccccc);
      gridHelper.position.set(0, 0, 0);
      scene.add(gridHelper);
    }

    if (showAxes) {
      const axesHelper = new THREE.AxesHelper(50);
      scene.add(axesHelper);
    }

    try {
      const parser = new DxfParser();
      const dxf = parser.parseSync(dxfContent);
      const stats: EntityStats = {};

      if (dxf?.entities?.length > 0) {
        const material = new THREE.LineBasicMaterial({
          color: entityColor,
          linewidth: 1,
          linecap: "round",
          linejoin: "round",
        });

        dxf.entities.forEach((entity) => {
          try {
            let object: THREE.Object3D | null = null;
            stats[entity.type] = (stats[entity.type] || 0) + 1;

            switch (entity.type) {
              case "LINE":
                object = processLine(entity, material);
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

        onLoad?.(stats);

        if (showDebugInfo) {
          const statsText = Object.entries(stats)
            .map(([type, count]) => `${type}: ${count}`)
            .join("\n");
          setDebugInfo(`Total entities: ${dxf.entities.length}\n${statsText}`);
        }

        // Center and zoom camera to fit the model
        const box = new THREE.Box3().setFromObject(scene);
        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const distance = maxDim * 1.5;

          // Position camera to see the entire model
          camera.position.set(center.x, center.y, center.z + distance);
          camera.lookAt(center);
          controls.target.copy(center);

          // Set reasonable zoom limits based on model size
          const minZoom = maxDim * 0.1;
          const maxZoom = maxDim * 10;

          controls.minDistance = minZoom;
          controls.maxDistance = maxZoom;

          // Store initial position for reset
          controls.saveState();

          if (showDebugInfo) {
            setDebugInfo(
              (prev) =>
                `${prev}\n\nModel dimensions:\nX: ${size.x.toFixed(
                  2
                )}\nY: ${size.y.toFixed(2)}\nZ: ${size.z.toFixed(2)}`
            );
          }
        } else if (showDebugInfo) {
          setDebugInfo((prev) => `${prev}\nWarning: No visible geometry found`);
        }
      } else {
        const error = new Error("No entities found in DXF file");
        setError(error.message);
        onError?.(error);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      console.error("Error parsing DXF:", err);
      setError(err.message);
      onError?.(err);
    }

    // Smooth animation loop with fixed time step
    let lastTime = 0;
    const fixedTimeStep = 1000 / 60; // 60 FPS
    let animationFrameId: number;

    const animate = (currentTime: number) => {
      animationFrameId = requestAnimationFrame(animate);

      const deltaTime = currentTime - lastTime;
      if (deltaTime >= fixedTimeStep) {
        controls.update();
        renderer.render(scene, camera);
        lastTime = currentTime;
      }
    };
    animate(0);

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
    };
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeyDown);
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      controls.dispose();
    };
  }, [
    dxfContent,
    backgroundColor,
    entityColor,
    showGrid,
    showAxes,
    showDebugInfo,
    onLoad,
    onError,
  ]);

  const containerStyle: React.CSSProperties = {
    width,
    height,
    position: "relative",
  };

  return (
    <div style={containerStyle}>
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
          <div style={{ marginTop: "0.5rem", fontSize: "10px", opacity: 0.8 }}>
            Press 'R' to reset view
          </div>
        </div>
      )}
    </div>
  );
};
