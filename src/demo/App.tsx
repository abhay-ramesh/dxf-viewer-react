import { useEffect, useState } from "react";
import { DxfViewer } from "../lib";
import "./App.css";

function App() {
  console.log("🚀 App component initialized");
  const appStartTime = performance.now();

  const [dxfContent, setDxfContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerSettings, setViewerSettings] = useState({
    showGrid: true,
    showAxes: true,
    showDebugInfo: false,
    showShapeColors: true,
    entityColor: "#0066cc",
    backgroundColor: "#f8f9fa",
  });

  useEffect(() => {
    loadDxfFile("/test.dxf");
  }, []);

  useEffect(() => {
    if (!isLoading) {
      const appEndTime = performance.now();
      console.log(
        `⏱️ TOTAL app initialization took: ${(
          appEndTime - appStartTime
        ).toFixed(2)}ms`
      );
    }
  }, [isLoading, appStartTime]);

  const loadDxfFile = async (path: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const content = await response.text();
      setDxfContent(content);
    } catch (error) {
      console.error("Error loading DXF file:", error);
      setError(
        error instanceof Error ? error.message : "Failed to load DXF file"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content === "string") {
        setDxfContent(content);
      }
    };
    reader.onerror = () => {
      setError(`Failed to read ${file.name}`);
    };
    reader.readAsText(file);
  };

  const handleSettingChange = (key: keyof typeof viewerSettings) => {
    if (key === "entityColor" || key === "backgroundColor") {
      return (e: React.ChangeEvent<HTMLInputElement>) => {
        setViewerSettings((prev) => ({ ...prev, [key]: e.target.value }));
      };
    }
    return () => {
      setViewerSettings((prev) => ({ ...prev, [key]: !prev[key] }));
    };
  };

  return (
    <div className="app">
      <header className="header">
        <h1>DXF Viewer Demo</h1>
        <div className="controls">
          <div className="file-controls">
            <input
              type="file"
              accept=".dxf"
              onChange={handleFileUpload}
              className="file-input"
            />
            <button
              onClick={() => loadDxfFile("/test.dxf")}
              className="reset-button"
            >
              Reset to test.dxf
            </button>
          </div>
          <div className="settings">
            <label>
              <input
                type="checkbox"
                checked={viewerSettings.showGrid}
                onChange={handleSettingChange("showGrid")}
              />
              Show Grid
            </label>
            <label>
              <input
                type="checkbox"
                checked={viewerSettings.showAxes}
                onChange={handleSettingChange("showAxes")}
              />
              Show Axes
            </label>
            <label>
              <input
                type="checkbox"
                checked={viewerSettings.showDebugInfo}
                onChange={handleSettingChange("showDebugInfo")}
              />
              Show Debug Info
            </label>
            <label>
              <input
                type="checkbox"
                checked={viewerSettings.showShapeColors}
                onChange={handleSettingChange("showShapeColors")}
              />
              Show Shape Colors
            </label>
            <label>
              Entity Color:
              <input
                type="color"
                value={viewerSettings.entityColor}
                onChange={handleSettingChange("entityColor")}
              />
            </label>
            <label>
              Background:
              <input
                type="color"
                value={viewerSettings.backgroundColor}
                onChange={handleSettingChange("backgroundColor")}
              />
            </label>
          </div>
        </div>
      </header>
      <main className="viewer-container">
        {error ? (
          <div className="error">{error}</div>
        ) : isLoading ? (
          <div className="loading">Loading DXF file...</div>
        ) : dxfContent ? (
          <DxfViewer
            dxfContent={dxfContent}
            {...viewerSettings}
            onLoad={() => {}}
            onError={(error) => setError(error.message)}
            showDebug={true}
          />
        ) : null}
      </main>
    </div>
  );
}

export default App;
