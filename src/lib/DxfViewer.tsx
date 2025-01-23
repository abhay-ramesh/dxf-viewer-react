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
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationFrameRef = useRef<number>();
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>("");

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize Three.js scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(backgroundColor);

    // Camera setup with better initial parameters
    const camera = new THREE.PerspectiveCamera(
      45, // FOV
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      10000 // Increased far plane for better visibility
    );
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    rendererRef.current = renderer;

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(
      containerRef.current.clientWidth,
      containerRef.current.clientHeight
    );
    containerRef.current.appendChild(renderer.domElement);

    // Initial camera position
    camera.position.set(0, 0, 100); // Simple initial position
    camera.lookAt(0, 0, 0);

    // Controls setup
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;

    // Configure controls - simplified
    controls.enableDamping = false; // Disable damping for direct response
    controls.screenSpacePanning = true;
    controls.enableRotate = true;
    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 1.0;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };

    // Grid and Axes
    if (showGrid) {
      const gridHelper = new THREE.GridHelper(1000, 100, 0x888888, 0xcccccc);
      scene.add(gridHelper);
    }

    if (showAxes) {
      const axesHelper = new THREE.AxesHelper(500);
      scene.add(axesHelper);
    }

    // Process DXF
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

        // Process entities
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

        // Update debug info
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

          // Simple camera positioning
          camera.position.set(
            center.x,
            center.y - maxDim * 2,
            center.z + maxDim * 2
          );
          camera.lookAt(center);
          controls.target.copy(center);

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

    // Animation loop
    const animate = () => {
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current)
        return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();

      rendererRef.current.setSize(width, height);
      rendererRef.current.setPixelRatio(window.devicePixelRatio);
    };
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
      if (containerRef.current && rendererRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
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
          <div style={{ marginTop: "0.5rem", fontSize: "10px", opacity: 0.8 }}>
            Mouse: Left = Rotate, Right = Pan, Wheel = Zoom
          </div>
        </div>
      )}
    </div>
  );
};
