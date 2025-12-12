import React, { useEffect, useState } from "react";
import { useDxfViewer } from "dxf-viewer-react";
import {
  MousePointer2,
  Move,
  Ruler,
  Settings,
  Sun,
  Moon,
  AlertCircle,
  ChevronLeft,
  Maximize2,
  Layers,
  Upload
} from "lucide-react";
import "../App.css";

interface AdvancedViewerProps {
  onBack: () => void;
}

export const AdvancedViewer: React.FC<AdvancedViewerProps> = ({ onBack }) => {
  const [dxfContent, setDxfContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("No file loaded");
  const [theme, setTheme] = useState<"light" | "dark">("dark"); // Default to dark for CAD feel
  const [isLoading, setIsLoading] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes] = useState(true);
  const [commandHistory, setCommandHistory] = useState<string[]>([
    "Welcome to DXF CAD Pro",
    "Ready for input..."
  ]);

  // Initialize the headless viewer hook
  const {
    containerRef,
    currentTool,
    setCurrentTool,
    hoverInfo,
    selectedEntityInfo,
    measureText,
    error,
    analyzedData,
  } = useDxfViewer({
    dxfContent,
    showGrid,
    showAxes,
    backgroundColor: theme === "dark" ? 0x1a1a1a : 0xf9fafb,
    entityColor: theme === "dark" ? 0xffffff : 0x000000,
    width: "100%",
    height: "100%",
  });

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Load sample file on init
  useEffect(() => {
    loadDxfFile("/test.dxf", "sample_drawing.dxf");
  }, []);

  // Update command history when tool changes
  useEffect(() => {
    addToHistory(`_COMMAND: ${currentTool.toUpperCase()}`);
  }, [currentTool]);

  const addToHistory = (cmd: string) => {
    setCommandHistory(prev => [...prev.slice(-4), cmd]);
  };

  const loadDxfFile = async (path: string, name: string) => {
    setIsLoading(true);
    addToHistory(`Opening ${name}...`);
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error("Failed to fetch file");
      const text = await response.text();
      setDxfContent(text);
      setFileName(name);
      addToHistory(`Loaded ${name} successfully`);
    } catch (err) {
      console.error(err);
      addToHistory(`Error loading file`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsLoading(true);
    setFileName(file.name);
    addToHistory(`Reading file: ${file.name}`);
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === "string") {
        setDxfContent(event.target.result);
        addToHistory("File read complete");
      }
      setIsLoading(false);
    };
    reader.readAsText(file);
  };

  return (
    <div className="app-container advanced-mode">
      {/* Top Menu Bar (AutoCAD style) */}
      <div className="menubar">
        <button onClick={onBack} className="menu-btn back-btn" title="Back to Home">
          <ChevronLeft size={16} /> Home
        </button>
        <div className="menu-separator" />
        <span className="menu-item">File</span>
        <span className="menu-item">Edit</span>
        <span className="menu-item">View</span>
        <span className="menu-item">Tools</span>
        <span className="menu-item">Help</span>
        <div className="menu-file-upload">
            <label className="menu-upload-label">
                <Upload size={14} /> Open
                <input type="file" hidden accept=".dxf" onChange={handleFileUpload} />
            </label>
        </div>
        <div className="filename-display">{fileName}</div>
      </div>

      <div className="workspace">
        {/* Left Toolbar */}
        <div className="cad-toolbar">
          <button 
            className={`cad-tool-btn ${currentTool === "select" ? "active" : ""}`}
            onClick={() => setCurrentTool("select")}
            title="Select (S)"
          >
            <MousePointer2 size={20} />
          </button>
          
          <button 
            className={`cad-tool-btn ${currentTool === "pan" ? "active" : ""}`}
            onClick={() => setCurrentTool("pan")}
            title="Pan (P)"
          >
            <Move size={20} />
          </button>

          <button 
            className={`cad-tool-btn ${currentTool === "measure" ? "active" : ""}`}
            onClick={() => setCurrentTool("measure")}
            title="Measure (M)"
          >
            <Ruler size={20} />
          </button>
          
          <div className="toolbar-separator" />

          <button className="cad-tool-btn" title="Layers (Not Implemented)">
            <Layers size={20} />
          </button>
          
          <button className="cad-tool-btn" onClick={() => setShowGrid(!showGrid)} title="Toggle Grid">
            <Maximize2 size={20} style={{ opacity: showGrid ? 1 : 0.5 }} />
          </button>
        </div>

        {/* Main Viewer Area */}
        <div className="cad-viewport">
          <div className="viewport-header">
            <span>Top View [Wireframe]</span>
          </div>
          
          <div ref={containerRef} className="canvas-container" />
          
          {/* Coordinates / Status Overlay */}
          <div className="viewport-overlay-br">
            {hoverInfo && (
               <span>X: {hoverInfo.x.toFixed(2)} Y: {hoverInfo.y.toFixed(2)}</span>
            )}
          </div>

          {measureText && (
            <div className="measure-tooltip">
              {measureText}
            </div>
          )}

          {error && (
            <div className="overlay-message error">
              <AlertCircle size={48} />
              <div>{error}</div>
            </div>
          )}
          
          {isLoading && (
            <div className="loading-overlay">
              <div className="spinner" />
              <div>Loading...</div>
            </div>
          )}
        </div>

        {/* Right Properties Panel */}
        <div className="cad-properties">
          <div className="panel-header">
            <Settings size={14} /> PROPERTIES
          </div>

          <div className="panel-content">
            <div className="prop-group">
              <div className="prop-group-title">General</div>
              <div className="prop-row">
                <span className="prop-label">Color</span>
                <span className="prop-value">ByLayer</span>
              </div>
              <div className="prop-row">
                <span className="prop-label">Layer</span>
                <span className="prop-value">0</span>
              </div>
              <div className="prop-row">
                <span className="prop-label">Linetype</span>
                <span className="prop-value">Continuous</span>
              </div>
            </div>

            {selectedEntityInfo ? (
              <div className="prop-group">
                <div className="prop-group-title">Geometry</div>
                <div className="prop-row">
                  <span className="prop-label">Type</span>
                  <span className="prop-value">{selectedEntityInfo.type}</span>
                </div>
                {selectedEntityInfo.length !== undefined && (
                  <div className="prop-row">
                    <span className="prop-label">Length</span>
                    <span className="prop-value">{selectedEntityInfo.length.toFixed(4)}</span>
                  </div>
                )}
                {selectedEntityInfo.radius !== undefined && (
                  <div className="prop-row">
                    <span className="prop-label">Radius</span>
                    <span className="prop-value">{selectedEntityInfo.radius.toFixed(4)}</span>
                  </div>
                )}
                 {selectedEntityInfo.center && (
                  <>
                  <div className="prop-row">
                    <span className="prop-label">Center X</span>
                    <span className="prop-value">{selectedEntityInfo.center.x.toFixed(4)}</span>
                  </div>
                  <div className="prop-row">
                    <span className="prop-label">Center Y</span>
                    <span className="prop-value">{selectedEntityInfo.center.y.toFixed(4)}</span>
                  </div>
                  </>
                )}
              </div>
            ) : (
              <div className="prop-empty">No Selection</div>
            )}

            <div className="prop-group">
              <div className="prop-group-title">Statistics</div>
              <div className="prop-row">
                <span className="prop-label">Entities</span>
                <span className="prop-value">{analyzedData?.totalEntities || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Command Line */}
      <div className="command-line">
        <div className="command-history">
            {commandHistory.map((cmd, i) => <div key={i}>{cmd}</div>)}
        </div>
        <div className="command-input-area">
            <span className="prompt">Command:</span>
            <input type="text" className="command-input" placeholder="Type a command..." />
        </div>
        <div className="status-bar">
            <span>MODEL</span>
            <span>GRID: {showGrid ? "ON" : "OFF"}</span>
            <span>ORTHO: OFF</span>
            <span>SNAP: ON</span>
            <div className="spacer" />
            <button onClick={() => setTheme(t => t === "light" ? "dark" : "light")} className="theme-toggle-btn">
                {theme === "light" ? <Moon size={12} /> : <Sun size={12} />}
            </button>
        </div>
      </div>
    </div>
  );
};

