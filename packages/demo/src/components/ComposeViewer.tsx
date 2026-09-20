import {
  DxfViewer,
  MeasureReadout,
  PartsPanel,
  StatsOverlay,
  Toolbar,
} from "dxf-viewer-react";
import { ChevronLeft } from "lucide-react";
import React, { useEffect, useState } from "react";

type Mode = "chrome" | "bare" | "composed";

const MODES: Array<{ id: Mode; label: string; hint: string }> = [
  { id: "chrome", label: "Stock chrome", hint: "<DxfViewer />" },
  { id: "bare", label: "Canvas only", hint: "chrome={false}" },
  { id: "composed", label: "Composed", hint: "{api => ...}" },
];

/**
 * The three levels of control the component now offers, side by side.
 *
 * Every piece of chrome is an exported component taking plain data, so the
 * "composed" mode below rearranges the same parts the stock mode uses.
 */
export const ComposeViewer: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [dxfContent, setDxfContent] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("chrome");

  useEffect(() => {
    fetch("/test.dxf")
      .then((r) => r.text())
      .then(setDxfContent);
  }, []);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid #e5e5e5",
          font: "500 0.875rem system-ui, sans-serif",
        }}
      >
        <button
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
            background: "none",
            border: "none",
            cursor: "pointer",
            font: "inherit",
          }}
        >
          <ChevronLeft size={18} /> Back
        </button>
        <strong>Composition</strong>
        <div style={{ display: "flex", gap: "0.5rem", marginLeft: "auto" }}>
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              title={m.hint}
              style={{
                padding: "0.375rem 0.75rem",
                borderRadius: "6px",
                border: mode === m.id ? "none" : "1px solid #ddd",
                background: mode === m.id ? "#0066cc" : "transparent",
                color: mode === m.id ? "#fff" : "#333",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0 }}>
        {mode === "chrome" && (
          <DxfViewer
            dxfContent={dxfContent}
            backgroundColor={0xffffff}
            entityColor={0x333333}
            showGrid={false}
            showAxes={false}
            showDebugInfo
            showStats
          />
        )}

        {mode === "bare" && (
          <DxfViewer
            dxfContent={dxfContent}
            backgroundColor={0xffffff}
            entityColor={0x333333}
            showGrid={false}
            showAxes={false}
            chrome={false}
          />
        )}

        {mode === "composed" && (
          <DxfViewer
            dxfContent={dxfContent}
            backgroundColor={0xffffff}
            entityColor={0x333333}
            showGrid={false}
            showAxes={false}
            showStats
          >
            {(api) => (
              <>
                {/* The same stock parts, rearranged. */}
                <Toolbar
                  items={[
                    { id: "pan", label: "Pan" },
                    { id: "select", label: "Select" },
                    { id: "measure", label: "Measure" },
                  ]}
                  value={api.currentTool}
                  onChange={(id) => api.setCurrentTool(id as "pan")}
                  placement="top-left"
                />
                <StatsOverlay stats={api.frameStats} position="bottom-right" />

                <MeasureReadout
                  text={api.measureText}
                  measurements={api.measurements}
                  onRemove={(id) => api.measurementModel?.remove(id)}
                  placement="bottom-left"
                />
                {/* The takeoff: areas, hole counts and cut length. */}
                <PartsPanel
                  report={api.partsReport}
                  placement="top-right"
                  onExport={(csv, filename) => {
                    const url = URL.createObjectURL(
                      new Blob([csv], { type: "text/csv" })
                    );
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = filename;
                    link.click();
                    URL.revokeObjectURL(url);
                  }}
                />
              </>
            )}
          </DxfViewer>
        )}
      </div>
    </div>
  );
};
