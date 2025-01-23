import { useEffect, useState } from "react";
import { DxfViewer } from "../lib";
import "./App.css";

function App() {
  const [dxfContent, setDxfContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entityStats, setEntityStats] = useState<Record<string, number>>({});
  const [viewerSettings, setViewerSettings] = useState({
    showGrid: true,
    showAxes: true,
    showDebugInfo: true,
    entityColor: "#0000ff",
    backgroundColor: "#f0f0f0",
  });

  useEffect(() => {
    loadDxfFile("/test.dxf");
  }, []);

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
            onLoad={setEntityStats}
            onError={(error) => setError(error.message)}
          />
        ) : null}
      </main>
      <footer className="footer">
        {Object.keys(entityStats).length > 0 && (
          <div className="stats">
            <h3>Entity Statistics</h3>
            <ul>
              {Object.entries(entityStats).map(([type, count]) => (
                <li key={type}>
                  {type}: {count}
                </li>
              ))}
            </ul>
          </div>
        )}
      </footer>
    </div>
  );
}

export default App;
