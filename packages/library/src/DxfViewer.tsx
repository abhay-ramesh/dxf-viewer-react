import React from "react";
import { DxfViewerApi, DxfViewerProps } from "./types";
import { useDxfViewer } from "./useDxfViewer";
import { EntityInspector } from "./ui/EntityInspector";
import { ErrorBanner } from "./ui/ErrorBanner";
import { HoverTooltip } from "./ui/HoverTooltip";
import { LoadingIndicator } from "./ui/LoadingIndicator";
import { MeasureReadout } from "./ui/MeasureReadout";
import { StatsOverlay } from "./ui/StatsOverlay";
import { Toolbar, ToolbarItem } from "./ui/Toolbar";

const DEFAULT_TOOLS: ToolbarItem[] = [
  { id: "pan", label: "Pan", title: "Pan (P)" },
  { id: "select", label: "Select", title: "Select (S)" },
  { id: "measure", label: "Measure", title: "Measure (M)" },
];

/**
 * The viewer with its stock chrome.
 *
 * All of it used to live here as inline-styled JSX that a consumer could not
 * theme, move, or remove, and which shipped in every bundle regardless. Each
 * piece is now its own exported component that takes data rather than the
 * viewer, and this file only arranges them.
 *
 * Three levels of control:
 *
 *   `<DxfViewer dxfContent={dxf} />`            stock chrome
 *   `<DxfViewer dxfContent={dxf} chrome={false} />`  canvas only
 *   `<DxfViewer dxfContent={dxf}>{api => …}</DxfViewer>`  compose your own
 *
 * and below all three, `useDxfViewer` with no component at all.
 */
export const DxfViewer: React.FC<DxfViewerProps> = (props) => {
  const api = useDxfViewer(props);
  const {
    containerRef,
    currentTool,
    setCurrentTool,
    hoverInfo,
    selectedEntityInfo,
    selectedIds,
    measureText,
    measurements,
    measurementModel,
    stats,
    frameStats,
    isLoading,
    progress,
    error,
  } = api;

  const {
    width = "100%",
    height = "100%",
    className,
    style,
    chrome = true,
    toolbar,
    showDebug = false,
    showDebugInfo = false,
    interactive = true,
    children,
  } = props;

  const showDrawingInfo = showDebug || showDebugInfo;

  return (
    <div
      className={className}
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#f0f0f0",
        ...style,
      }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {children
        ? children(api)
        : chrome && (
            <>
              {interactive && (
                <Toolbar
                  items={toolbar ?? DEFAULT_TOOLS}
                  value={currentTool}
                  onChange={(id) =>
                    setCurrentTool(id as "pan" | "select" | "measure")
                  }
                />
              )}

              <MeasureReadout
                text={measureText}
                measurements={measurements}
                onRemove={(id) => measurementModel?.remove(id)}
              />

              <EntityInspector
                selection={selectedEntityInfo}
                selectedCount={selectedIds.length}
                stats={stats}
                showDrawingInfo={showDrawingInfo}
              />

              <HoverTooltip
                info={hoverInfo?.info ?? null}
                x={hoverInfo?.x ?? 0}
                y={hoverInfo?.y ?? 0}
              />

              <StatsOverlay stats={frameStats} />
              <LoadingIndicator loading={isLoading} progress={progress} />
              <ErrorBanner error={error} />
            </>
          )}
    </div>
  );
};

export type { DxfViewerApi };
