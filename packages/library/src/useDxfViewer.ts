import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { DxfViewerCore } from "./core/DxfViewerCore";
import { StyleResolver } from "./style/StyleResolver";
import { DxfDocument } from "./document/DxfDocument";
import { processDxf } from "./processDxf";
import { MeasureTool, PanTool, SelectTool } from "./tools";
import { DxfViewerProps, EntityInfo, LayerInfo } from "./types";
import { DxfAnalyzer } from "./utils/DxfAnalyzer";

/**
 * React binding over {@link DxfViewerCore}.
 *
 * The core owns the WebGL context, scene, camera and controls for the
 * lifetime of the container element. This hook only feeds props into it and
 * mirrors its events back out as React state — so changing a prop updates the
 * viewer instead of rebuilding it, and pan/zoom survive every prop change.
 */
export const useDxfViewer = ({
  dxfContent,
  backgroundColor = 0xf0f0f0,
  entityColor,
  hoverColor,
  selectionColor,
  layerColors,
  showGrid = true,
  showAxes = true,
  showShapeColors = true,
  shapeColors,
  interactive = true,
  defaultTool = "pan",
  onLoad,
  onError,
  onMeasureComplete,
}: DxfViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [core, setCore] = useState<DxfViewerCore | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [currentTool, setCurrentTool] = useState<"pan" | "select" | "measure">(
    defaultTool
  );
  const [selectedEntityInfo, setSelectedEntityInfo] =
    useState<EntityInfo | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    info: EntityInfo;
    x: number;
    y: number;
  } | null>(null);
  const [measureText, setMeasureText] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, number | string>>({});
  const [analyzedData, setAnalyzedData] = useState<unknown>(null);
  const [layers, setLayers] = useState<LayerInfo[]>([]);

  // Callbacks live in a ref so a consumer passing inline arrow functions does
  // not tear down and rebuild the tools on every render.
  const callbacks = useRef({ onLoad, onError, onMeasureComplete });
  callbacks.current = { onLoad, onError, onMeasureComplete };

  // One resolver decides every colour: strokes, fills, hover, selection.
  // With no entityColor supplied it honours the drawing's own ByLayer
  // colours, the way a CAD application does.
  const style = useMemo(
    () =>
      new StyleResolver({
        backgroundColor,
        entityColor,
        shapeColors,
        hoverColor,
        selectionColor,
        layerColors,
      }),
    [
      backgroundColor,
      entityColor,
      shapeColors,
      hoverColor,
      selectionColor,
      layerColors,
    ]
  );

  // Still synchronous, still on the main thread — moving this to a worker is
  // the next step. Nothing downstream assumes it is synchronous.
  const processed = useMemo(
    () => processDxf(dxfContent || "", { style, showShapeColors }),
    [dxfContent, style, showShapeColors]
  );

  useEffect(() => () => style.dispose(), [style]);

  // --- core lifecycle: one per container, not one per prop change ----------

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return; // Also covers SSR: no ref, no core.

    let instance: DxfViewerCore;
    try {
      instance = new DxfViewerCore(container, {
        backgroundColor,
        showGrid,
        showAxes,
        interactive,
      });
    } catch (err) {
      const failure =
        err instanceof Error ? err : new Error("Failed to start the viewer");
      setError(failure.message);
      callbacks.current.onError?.(failure);
      return;
    }

    instance.registerTool(new PanTool());
    instance.registerTool(
      new SelectTool(
        (info) => {
          setSelectedEntityInfo(info);
          instance.emit("selection:change", {
            ids: [],
            primary: info,
          });
        },
        (info, x, y) => setHoverInfo(info ? { info, x, y } : null)
      )
    );
    instance.registerTool(
      new MeasureTool(
        (distance) => callbacks.current.onMeasureComplete?.(distance),
        undefined,
        (text) => setMeasureText(text)
      )
    );

    setCore(instance);
    return () => {
      instance.dispose();
      setCore(null);
    };
    // Constructed once. Later prop changes are applied through setOptions
    // below rather than by rebuilding the viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- props -> core -------------------------------------------------------

  useEffect(() => {
    core?.setOptions({ backgroundColor, showGrid, showAxes, interactive });
  }, [core, backgroundColor, showGrid, showAxes, interactive]);

  useEffect(() => {
    if (!core) return;
    // Re-processing the same file after a styling change should not throw the
    // user's viewport away; loading a different file should re-frame.
    core.setDocument(processed, core.getDocument().size > 0 && !!dxfContent);

    setStats(processed.stats);
    if (processed.parseError) {
      setError(processed.parseError.message);
      callbacks.current.onError?.(processed.parseError);
    } else {
      setError(null);
    }

    setLayers(
      Object.entries(processed.layerTable).map(([name, data]) => ({
        name,
        color: data.color,
        visible: core.isLayerVisible(name),
      }))
    );
  }, [core, processed, dxfContent]);

  useEffect(() => setCurrentTool(defaultTool), [defaultTool]);

  useEffect(() => {
    core?.setTool(interactive ? currentTool : null);
  }, [core, currentTool, interactive]);

  // --- core -> React -------------------------------------------------------

  useEffect(() => {
    if (!core) return;
    const offLoaded = core.on("document:loaded", ({ stats: numericStats }) => {
      callbacks.current.onLoad?.(numericStats);
    });
    const offLayers = core.on("layers:change", () => {
      setLayers((previous) =>
        previous.map((layer) => ({
          ...layer,
          visible: core.isLayerVisible(layer.name),
        }))
      );
    });
    return () => {
      offLoaded();
      offLayers();
    };
  }, [core]);

  // Analysis is independent of rendering; it reads the parsed entities.
  useEffect(() => {
    if (!dxfContent || !processed.entities.length) {
      setAnalyzedData(null);
      return;
    }
    setAnalyzedData({
      totalEntities: processed.entities.length,
      entityTypes: Object.entries(processed.stats).map(([type, count]) => ({
        type,
        count,
      })),
      closedLoops: DxfAnalyzer.findClosedLoops({ entities: processed.entities }),
      dxfHeader: processed.dxfHeader,
    });
  }, [dxfContent, processed]);

  // --- imperative API ------------------------------------------------------

  const toggleLayer = useCallback(
    (layerName: string) => core?.toggleLayer(layerName),
    [core]
  );

  const exportImage = useCallback(
    (format: "png" | "jpeg" = "png", scale = 1) =>
      core?.exportImage(format, scale) ?? null,
    [core]
  );

  const fitToContent = useCallback(() => core?.fitToContent(), [core]);

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
    fitToContent,
    /** The viewer itself. Register a tool, subscribe to an event, drive it. */
    core,
    /** Queryable model of the drawing: identity, derived geometry, lookups. */
    document: (core?.getDocument() ?? processed.document) as DxfDocument,
    scene: core?.scene ?? null,
    camera: core?.camera ?? null,
    renderer: core?.renderer ?? null,
    controls: core?.controls ?? null,
    dxfEntities: processed.entities,
    dxfGroup: processed.group,
  };
};
