import { StatsOverlay, useDxfViewer } from "dxf-viewer-react";
import { ChevronLeft, Move, Ruler, Upload } from "lucide-react";
import React, { useEffect, useState } from "react";
import "../App.css";

interface SimpleViewerProps {
  onBack: () => void;
}

export const SimpleViewer: React.FC<SimpleViewerProps> = ({ onBack }) => {
  const [dxfContent, setDxfContent] = useState<string | null>(null);

  // Use headless hook with plain viewing configuration
  // All visual and interaction options are controllable: grid, axes, colors, shape fills, interactivity
  const {
    containerRef,
    currentTool,
    setCurrentTool,
    measureText,
    frameStats,
    error,
  } = useDxfViewer({
      dxfContent,
      showGrid: false, // Disable grid for clean viewing
      showAxes: false, // Disable axes for minimal interface
      showShapeColors: false, // Disable shape fills for line-only rendering
      interactive: true, // Enable interactivity (pan, zoom, select, measure)
      backgroundColor: 0xffffff, // White background
      entityColor: 0x333333, // Dark gray lines
      width: "100%",
      height: "100%",
      defaultTool: "pan",
      showStats: true,
    });

  useEffect(() => {
    // Load sample by default
    fetch("/test.dxf")
      .then((r) => r.text())
      .then(setDxfContent);
  }, []);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (typeof ev.target?.result === "string")
          setDxfContent(ev.target.result);
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="simple-viewer">
      <div className="simple-header">
        <button onClick={onBack} className="simple-back-btn">
          <ChevronLeft size={20} /> Back
        </button>
        <div className="simple-title">DXF Preview</div>
        <label className="simple-upload-btn">
          <Upload size={16} /> Open File
          <input type="file" accept=".dxf" hidden onChange={handleFile} />
        </label>
      </div>

      <div className="simple-canvas-wrapper">
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

        {/* Headless composition: the hook measures, this renders it. */}
        <StatsOverlay stats={frameStats} position="top-left" />

        {/* Floating Minimal Toolbar */}
        <div className="simple-floating-toolbar">
          <button
            className={`simple-tool-btn ${
              currentTool === "pan" ? "active" : ""
            }`}
            onClick={() => setCurrentTool("pan")}
            title="Pan"
          >
            <Move size={28} />
          </button>
          <button
            className={`simple-tool-btn ${
              currentTool === "measure" ? "active" : ""
            }`}
            onClick={() => setCurrentTool("measure")}
            title="Measure"
          >
            <Ruler size={28} />
          </button>
        </div>

        {/* Measure overlay */}
        {measureText && (
          <div className="simple-measure-pill">{measureText}</div>
        )}

        {error && <div className="simple-error">{error}</div>}
      </div>
    </div>
  );
};
