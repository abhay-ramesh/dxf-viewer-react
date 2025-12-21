import { useDxfViewer } from "dxf-viewer-react";
import {
  AlertCircle,
  ChevronLeft,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  Grid,
  Image,
  Info,
  Layers,
  Maximize2,
  Moon,
  MousePointer2,
  Move,
  Printer,
  Ruler,
  Save,
  Settings,
  Sun,
} from "lucide-react";
import React, { useEffect, useState } from "react";
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
    "DXF Viewer initialized.",
    "Command line ready.",
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
    layers,
    toggleLayer,
    exportImage,
    stats,
  } = useDxfViewer({
    dxfContent,
    showGrid,
    showAxes,
    backgroundColor: theme === "dark" ? 0x1a1a1a : 0xf9fafb,
    entityColor: theme === "dark" ? 0xffffff : 0x000000,
    width: "100%",
    height: "100%",
  });

  const [showLayers, setShowLayers] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".menu-item-container")) {
        setActiveMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
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
    setCommandHistory((prev) => [...prev.slice(-4), cmd]);
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

  const handleExportImage = () => {
    const dataUrl = exportImage("png");
    if (dataUrl) {
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${fileName.replace(".dxf", "")}_view.png`;
      link.click();
      addToHistory("Exported image");
    } else {
      addToHistory("Failed to export image");
    }
  };

  const handlePrint = () => {
    const dataUrl = exportImage("png");
    if (dataUrl) {
      const windowContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Print - ${fileName}</title>
            <style>
              body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
              img { max-width: 100%; max-height: 100%; object-fit: contain; }
              @media print { body { -webkit-print-color-adjust: exact; } }
            </style>
          </head>
          <body>
            <img src="${dataUrl}" onload="window.print();window.close()" />
          </body>
        </html>
      `;
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(windowContent);
        printWindow.document.close();
        addToHistory("Printing...");
      }
    }
  };

  type MenuItem =
    | { type: "separator" }
    | {
        label: string;
        icon?: React.ReactNode;
        onClick?: () => void;
        shortcut?: string;
        type?: undefined;
      };

  const menuItems: { label: string; items: MenuItem[] }[] = [
    {
      label: "File",
      items: [
        {
          label: "Open...",
          icon: <FolderOpen size={14} />,
          onClick: () => fileInputRef.current?.click(),
          shortcut: "Ctrl+O",
        },
        {
          label: "Save",
          icon: <Save size={14} />,
          onClick: () => addToHistory("Save not implemented yet"),
          shortcut: "Ctrl+S",
        },
        { type: "separator" },
        {
          label: "Export Image (PNG)",
          icon: <Image size={14} />,
          onClick: handleExportImage,
        },
        {
          label: "Print",
          icon: <Printer size={14} />,
          onClick: handlePrint,
          shortcut: "Ctrl+P",
        },
      ],
    },
    {
      label: "Edit",
      items: [
        {
          label: "Undo",
          onClick: () => addToHistory("Undo not implemented"),
          shortcut: "Ctrl+Z",
        },
        {
          label: "Redo",
          onClick: () => addToHistory("Redo not implemented"),
          shortcut: "Ctrl+Y",
        },
      ],
    },
    {
      label: "View",
      items: [
        {
          label: showGrid ? "Hide Grid" : "Show Grid",
          icon: <Grid size={14} />,
          onClick: () => setShowGrid(!showGrid),
        },
        {
          label: showLayers ? "Hide Layers" : "Show Layers",
          icon: <Layers size={14} />,
          onClick: () => setShowLayers(!showLayers),
        },
        { type: "separator" },
        {
          label: "Zoom Extents",
          icon: <Maximize2 size={14} />,
          onClick: () => addToHistory("Zoom Extents not implemented"),
        },
      ],
    },
    {
      label: "Help",
      items: [
        {
          label: "Documentation",
          icon: <FileText size={14} />,
          onClick: () =>
            window.open(
              "https://github.com/abhaykvin/dxf-viewer-react",
              "_blank"
            ),
        },
        {
          label: "About",
          icon: <Info size={14} />,
          onClick: () =>
            addToHistory(
              `dxf-viewer-react v${
                process.env.npm_package_version || "0.2.0"
              } - Build 2024.1`
            ),
        },
      ],
    },
  ];

  return (
    <div className="app-container advanced-mode">
      {/* Top Menu Bar (AutoCAD style) */}
      <div className="menubar">
        <button
          onClick={onBack}
          className="menu-btn back-btn"
          title="Back to Home"
        >
          <ChevronLeft size={16} /> Home
        </button>
        <div className="menu-separator" />

        {menuItems.map((menu) => (
          <div key={menu.label} className="menu-item-container">
            <div
              className={`menu-item ${
                activeMenu === menu.label ? "active" : ""
              }`}
              onClick={() =>
                setActiveMenu(activeMenu === menu.label ? null : menu.label)
              }
            >
              {menu.label}
            </div>
            {activeMenu === menu.label && (
              <div className="menu-dropdown">
                {menu.items.map((item, index) =>
                  item.type === "separator" ? (
                    <div key={index} className="menu-dropdown-separator" />
                  ) : (
                    <div
                      key={index}
                      className="menu-dropdown-item"
                      onClick={() => {
                        item.onClick?.();
                        setActiveMenu(null);
                      }}
                    >
                      <span className="menu-dropdown-icon">{item.icon}</span>
                      <span className="menu-dropdown-label">{item.label}</span>
                      {item.shortcut && (
                        <span className="menu-dropdown-shortcut">
                          {item.shortcut}
                        </span>
                      )}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        ))}

        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept=".dxf"
          onChange={handleFileUpload}
        />

        <div className="filename-display" style={{ marginLeft: "auto" }}>
          {fileName}
        </div>
      </div>

      <div className="workspace">
        {/* Left Toolbar */}
        <div className="cad-toolbar">
          <button
            className={`cad-tool-btn ${
              currentTool === "select" ? "active" : ""
            }`}
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
            className={`cad-tool-btn ${
              currentTool === "measure" ? "active" : ""
            }`}
            onClick={() => setCurrentTool("measure")}
            title="Measure (M)"
          >
            <Ruler size={20} />
          </button>

          <div className="toolbar-separator" />

          <button
            className={`cad-tool-btn ${showLayers ? "active" : ""}`}
            onClick={() => setShowLayers(!showLayers)}
            title="Layers"
          >
            <Layers size={20} />
          </button>

          <button
            className="cad-tool-btn"
            onClick={() => setShowGrid(!showGrid)}
            title="Toggle Grid"
          >
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
              <span>
                X: {hoverInfo.x.toFixed(2)} Y: {hoverInfo.y.toFixed(2)}
              </span>
            )}
          </div>

          {measureText && <div className="measure-tooltip">{measureText}</div>}

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

          {/* Layer Manager Overlay */}
          {showLayers && (
            <div className="layer-manager">
              <div className="layer-header">
                <span>Layer Manager</span>
                <button
                  className="close-btn"
                  onClick={() => setShowLayers(false)}
                >
                  ×
                </button>
              </div>
              <div className="layer-list">
                {layers.map((layer) => (
                  <div key={layer.name} className="layer-item">
                    <button
                      className="layer-visibility"
                      onClick={() => toggleLayer(layer.name)}
                      title={layer.visible ? "Hide Layer" : "Show Layer"}
                    >
                      {layer.visible ? (
                        <Eye size={14} />
                      ) : (
                        <EyeOff size={14} color="#666" />
                      )}
                    </button>
                    <div
                      className="layer-color"
                      style={{
                        backgroundColor: `#${layer.color
                          .toString(16)
                          .padStart(6, "0")}`,
                      }}
                    />
                    <span className="layer-name">{layer.name}</span>
                  </div>
                ))}
                {layers.length === 0 && (
                  <div className="layer-empty">No layers found</div>
                )}
              </div>
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
                <span className="prop-value">
                  {selectedEntityInfo?.color || "ByLayer"}
                </span>
              </div>
              <div className="prop-row">
                <span className="prop-label">Layer</span>
                <span className="prop-value">
                  {selectedEntityInfo?.layer || "0"}
                </span>
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
                    <span className="prop-label">
                      {selectedEntityInfo.type === "Closed Loop"
                        ? "Perimeter"
                        : "Length"}
                    </span>
                    <span className="prop-value">
                      {selectedEntityInfo.length.toFixed(4)}
                    </span>
                  </div>
                )}
                {selectedEntityInfo.area !== undefined && (
                  <div className="prop-row">
                    <span className="prop-label">Area</span>
                    <span className="prop-value">
                      {selectedEntityInfo.area.toFixed(4)}
                    </span>
                  </div>
                )}
                {selectedEntityInfo.radius !== undefined && (
                  <div className="prop-row">
                    <span className="prop-label">Radius</span>
                    <span className="prop-value">
                      {selectedEntityInfo.radius.toFixed(4)}
                    </span>
                  </div>
                )}
                {selectedEntityInfo.center && (
                  <>
                    <div className="prop-row">
                      <span className="prop-label">Center X</span>
                      <span className="prop-value">
                        {selectedEntityInfo.center.x.toFixed(4)}
                      </span>
                    </div>
                    <div className="prop-row">
                      <span className="prop-label">Center Y</span>
                      <span className="prop-value">
                        {selectedEntityInfo.center.y.toFixed(4)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="prop-empty">No Selection</div>
            )}

            <div className="prop-group">
              <div className="prop-group-title">Drawing Info</div>
              {stats.DXF_VERSION && (
                <div className="prop-row">
                  <span className="prop-label">Version</span>
                  <span className="prop-value">{stats.DXF_VERSION}</span>
                </div>
              )}
              {stats.DXF_UNITS && (
                <div className="prop-row">
                  <span className="prop-label">Units</span>
                  <span className="prop-value">{stats.DXF_UNITS}</span>
                </div>
              )}
              {stats.DXF_UNITS_FORMAT && (
                <div className="prop-row">
                  <span className="prop-label">Format</span>
                  <span className="prop-value">{stats.DXF_UNITS_FORMAT}</span>
                </div>
              )}
              {stats.DXF_MEASUREMENT && (
                <div className="prop-row">
                  <span className="prop-label">System</span>
                  <span className="prop-value">{stats.DXF_MEASUREMENT}</span>
                </div>
              )}
              {stats.EXT_MIN_X !== undefined &&
                stats.EXT_MIN_Y !== undefined &&
                stats.EXT_MAX_X !== undefined &&
                stats.EXT_MAX_Y !== undefined && (
                  <div
                    className="prop-row"
                    style={{
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: "4px",
                    }}
                  >
                    <span className="prop-label">Extents</span>
                    <span className="prop-value" style={{ fontSize: "10px" }}>
                      Min: {Number(stats.EXT_MIN_X).toFixed(2)},{" "}
                      {Number(stats.EXT_MIN_Y).toFixed(2)}
                    </span>
                    <span className="prop-value" style={{ fontSize: "10px" }}>
                      Max: {Number(stats.EXT_MAX_X).toFixed(2)},{" "}
                      {Number(stats.EXT_MAX_Y).toFixed(2)}
                    </span>
                  </div>
                )}
            </div>

            <div className="prop-group">
              <div className="prop-group-title">Statistics</div>
              <div className="prop-row">
                <span className="prop-label">Total Entities</span>
                <span className="prop-value">
                  {analyzedData?.totalEntities || 0}
                </span>
              </div>
              {analyzedData?.entityTypes?.map(
                (stat: { type: string; count: number | string }) => {
                  if (stat.type === "SHAPES_WITH_HOLES") {
                    return (
                      <div className="prop-row" key={stat.type}>
                        <span className="prop-label">Filled Shapes</span>
                        <span className="prop-value">{stat.count}</span>
                      </div>
                    );
                  }
                  if (stat.type === "TOTAL_CLOSED_LOOPS") {
                    return (
                      <div className="prop-row" key={stat.type}>
                        <span className="prop-label">Total Closed Loops</span>
                        <span className="prop-value">{stat.count}</span>
                      </div>
                    );
                  }
                  if (stat.type === "TOTAL_HOLES") {
                    return (
                      <div className="prop-row" key={stat.type}>
                        <span className="prop-label">Detected Holes</span>
                        <span className="prop-value">{stat.count}</span>
                      </div>
                    );
                  }
                  return null;
                }
              )}

              <div
                className="prop-separator"
                style={{ margin: "8px 0", borderTop: "1px solid #333" }}
              />

              {analyzedData?.entityTypes?.map(
                (stat: { type: string; count: number | string }) => {
                  // Skip non-entity stats and the one we already showed
                  const skipKeys = [
                    "SHAPES_WITH_HOLES",
                    "TOTAL_HOLES",
                    "GEOMETRIC_HOLES",
                    "TOTAL_CLOSED_LOOPS",
                    "DXF_UNITS",
                    "DXF_UNITS_FORMAT",
                    "DXF_MEASUREMENT",
                    "GRID_SIZE",
                    "GRID_DIVISIONS",
                    "GRID_UNIT_SIZE",
                    "DETECTION_METHOD",
                  ];

                  if (skipKeys.includes(stat.type)) return null;

                  return (
                    <div className="prop-row" key={stat.type}>
                      <span
                        className="prop-label"
                        style={{ textTransform: "capitalize" }}
                      >
                        {stat.type.toLowerCase()}
                      </span>
                      <span className="prop-value">{stat.count}</span>
                    </div>
                  );
                }
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Command Line */}
      <div className="command-line">
        <div className="command-history">
          {commandHistory.map((cmd, i) => (
            <div key={i}>{cmd}</div>
          ))}
        </div>
        <div className="command-input-area">
          <span className="prompt">Command:</span>
          <input
            type="text"
            className="command-input"
            placeholder="Type a command..."
          />
        </div>
        <div className="status-bar">
          <span>MODEL</span>
          <span>GRID: {showGrid ? "ON" : "OFF"}</span>
          <span>ORTHO: OFF</span>
          <span>SNAP: ON</span>
          <div className="spacer" />
          <button
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            className="theme-toggle-btn"
          >
            {theme === "light" ? <Moon size={12} /> : <Sun size={12} />}
          </button>
        </div>
      </div>
    </div>
  );
};
