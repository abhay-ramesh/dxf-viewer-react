import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { DxfViewerCore } from "./core/DxfViewerCore";
import { buildPartsReport, PartsReport } from "./analysis/PartsReport";
import { DrawingReport } from "./document/DrawingReport";
import { Measurement } from "./core/MeasurementModel";
import { FrameStats } from "./core/PerformanceMonitor";
import { StyleResolver } from "./style/StyleResolver";
import { DxfDocument } from "./document/DxfDocument";
import { loadDocument } from "./pipeline/loadDocument";
import { LoadProgress } from "./pipeline/types";
import { ProcessDxfResult } from "./processDxf";
import { MeasureTool, PanTool, SelectTool } from "./tools";
import { AnalyzedData, DxfViewerProps, EntityInfo, LayerInfo } from "./types";
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
  wheelBehavior,
  zoomSpeed,
  showStats = false,
  prepare: prepareOverride,
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [frameStats, setFrameStats] = useState<FrameStats | null>(null);
  const [processed, setProcessed] = useState<ProcessDxfResult | null>(null);
  const [report, setReport] = useState<DrawingReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [measureText, setMeasureText] = useState<string | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [stats, setStats] = useState<Record<string, number | string>>({});
  const [analyzedData, setAnalyzedData] = useState<AnalyzedData | null>(null);
  const [layers, setLayers] = useState<LayerInfo[]>([]);

  // Which drawing the current view was framed for. Re-processing the same
  // file — because a colour prop changed — should keep the viewport; opening
  // a different file should re-frame, or the new drawing lands wherever the
  // old one happened to be, at the old one's scale.
  const framedFor = useRef<string | null>(null);

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

  useEffect(() => () => style.dispose(), [style]);

  // --- core lifecycle: one per container, not one per prop change ----------

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return; // Also covers SSR: no ref, no core.

    let instance: DxfViewerCore;
    try {
      instance = new DxfViewerCore(container, {
        style,
        backgroundColor,
        showGrid,
        showAxes,
        interactive,
        wheelBehavior,
        zoomSpeed,
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
        (info) => setSelectedEntityInfo(info),
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
    core?.setOptions({
      style,
      backgroundColor,
      showGrid,
      showAxes,
      interactive,
      wheelBehavior,
      zoomSpeed,
    });
  }, [
    core,
    style,
    backgroundColor,
    showGrid,
    showAxes,
    interactive,
    wheelBehavior,
    zoomSpeed,
  ]);

  // Loading happens off the render path, one load at a time. Switching files
  // mid-load cancels the previous one rather than letting two races decide
  // which result lands last.
  useEffect(() => {
    if (!core) return;
    const controller = new AbortController();
    let settled = false;

    setIsLoading(true);
    loadDocument(dxfContent || "", {
      style,
      showShapeColors,
      signal: controller.signal,
      onProgress: setProgress,
      prepare: prepareOverride,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        settled = true;

        // Re-processing the same file after a styling change should not throw
        // the viewport away; loading a different file should re-frame.
        const sameDrawing =
          framedFor.current !== null && framedFor.current === dxfContent;
        core.setDocument(result, sameDrawing);
        framedFor.current = dxfContent ?? null;
        setProcessed(result);
        setReport(result.report);
        setStats(result.stats);

        if (result.parseError) {
          setError(result.parseError.message);
          callbacks.current.onError?.(result.parseError);
        } else {
          setError(null);
        }

        setLayers(
          Object.entries(result.layerTable).map(([name, data]) => ({
            name,
            color: data.color,
            visible: core.isLayerVisible(name),
          }))
        );
      })
      .catch((failure: Error) => {
        if (failure.name === "AbortError") return;
        settled = true;
        setError(failure.message);
        callbacks.current.onError?.(failure);
      })
      .finally(() => {
        if (!controller.signal.aborted || settled) setIsLoading(false);
      });

    return () => controller.abort();
  }, [core, dxfContent, style, showShapeColors, prepareOverride]);

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
    const offSelection = core.on("selection:change", ({ ids }) =>
      setSelectedIds(ids)
    );
    const offMeasure = core.on("measure:change", (payload) =>
      setMeasurements(payload.measurements)
    );
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
      offSelection();
      offMeasure();
      offLayers();
    };
  }, [core]);

  // Frame statistics are opt-in: reading renderer.info every frame and
  // pushing it into React is a cost the common case should not pay.
  useEffect(() => {
    if (!core || !showStats) {
      setFrameStats(null);
      return;
    }
    const off = core.on("stats:frame", setFrameStats);
    const stop = core.startMonitoring();
    return () => {
      off();
      stop();
    };
  }, [core, showStats]);

  // Analysis is independent of rendering; it reads the parsed entities.
  useEffect(() => {
    if (!processed?.entities.length) {
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
  }, [processed]);

  // A takeoff is derived from the loaded document, so it is computed on
  // demand rather than kept in state: it costs a pass over the entities and
  // most consumers never ask for it.
  const partsReport = useMemo<PartsReport | null>(() => {
    if (!processed?.document.size) return null;
    return buildPartsReport(processed.document, {
      units: String(processed.stats.DXF_UNITS ?? ""),
    });
  }, [processed]);

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
    /** Ids of every selected entity. Multi-select is supported. */
    selectedIds,
    /** Select, extend, clear or select-by-layer, programmatically. */
    selection: core?.selection ?? null,
    measureText,
    /** Every recorded measurement, in drawing coordinates and with units. */
    measurements,
    /** Add, remove, undo, clear or serialise measurements. */
    measurementModel: core?.measurements ?? null,
    /** Zoom-aware snapping, shared by every precision feature. */
    snapping: core?.snapping ?? null,
    stats,
    /** What could not be drawn, and why. Null until a drawing is loaded. */
    report,
    /** Areas, cut lengths, hole counts and notes — a fabrication takeoff. */
    partsReport,
    /** Live frame timing and renderer counters, when showStats is on. */
    frameStats,
    analyzedData,
    error,
    layers,
    toggleLayer,
    exportImage,
    fitToContent,
    /** The viewer itself. Register a tool, subscribe to an event, drive it. */
    core,
    /** Queryable model of the drawing: identity, derived geometry, lookups. */
    document: (core?.getDocument() ?? processed?.document ?? null) as DxfDocument | null,
    scene: core?.scene ?? null,
    camera: core?.camera ?? null,
    renderer: core?.renderer ?? null,
    controls: core?.controls ?? null,
    dxfEntities: processed?.entities ?? [],
    dxfGroup: processed?.group ?? null,
    /** True while a drawing is being parsed and built. */
    isLoading,
    /** Which phase the current load is in, and roughly how far along. */
    progress,
  };
};
