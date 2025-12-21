import React from "react";
import { DxfViewerProps } from "./types";
import { useDxfViewer } from "./useDxfViewer";

export const DxfViewer: React.FC<DxfViewerProps> = (props) => {
  const {
    containerRef,
    currentTool,
    setCurrentTool,
    hoverInfo,
    selectedEntityInfo,
    measureText,
    stats,
    error,
  } = useDxfViewer(props);

  const {
    width = "100%",
    height = "100%",
    showDebug = false,
    showDebugInfo = false,
    interactive = true,
  } = props;

  return (
    <div
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#f0f0f0",
      }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Tool buttons - only show when interactive */}
      {interactive && (
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
          >
            Pan
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
          >
            Select
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
          >
            Measure
          </button>
        </div>
      )}

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
          {measureText}
        </div>
      )}

      {/* Debug Panel */}
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
                File Info
              </div>
              <div style={{ fontSize: "0.8rem" }}>
                <div>
                  <strong>Units:</strong> {stats.DXF_UNITS || "Unknown"}
                </div>
                {stats.DXF_UNITS_FORMAT && (
                  <div>
                    <strong>Format:</strong> {stats.DXF_UNITS_FORMAT}
                  </div>
                )}
              </div>
            </div>
          )}

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
                Selection
              </div>
              <div style={{ paddingLeft: "0.5rem" }}>
                <div>Type: {selectedEntityInfo.type}</div>
                {selectedEntityInfo.length !== undefined && (
                  <div>Length: {selectedEntityInfo.length.toFixed(2)}</div>
                )}
                {selectedEntityInfo.radius !== undefined && (
                  <div>Radius: {selectedEntityInfo.radius.toFixed(2)}</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hover Info */}
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
          }}
        >
          <strong>{hoverInfo.info.type}</strong>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div
          style={{
            position: "absolute",
            top: "1rem",
            left: "1rem",
            background: "red",
            color: "white",
            padding: "1rem",
            borderRadius: "8px",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
};
