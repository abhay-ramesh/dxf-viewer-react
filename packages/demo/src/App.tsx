import { useEffect, useState } from "react";
import { DxfViewer } from "dxf-viewer-react";
import "./App.css";

function App() {
  console.log("🚀 App component initialized");
  const appStartTime = performance.now();

  const [dxfContent, setDxfContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [viewerSettings, setViewerSettings] = useState({
    showGrid: false,
    showAxes: true,
    showDebugInfo: false,
    showShapeColors: true,
    entityColor: "#0066cc",
    backgroundColor: "#f8f9fa",
  });

  useEffect(() => {
    loadDxfFile("/test.dxf");
  }, []);

  // Update theme colors when theme changes
  useEffect(() => {
    const themeColors = {
      light: {
        backgroundColor: "#f8f9fa",
        entityColor: "#0066cc",
      },
      dark: {
        backgroundColor: "#1a1a1a",
        entityColor: "#4da6ff",
      },
    };

    setViewerSettings((prev) => ({
      ...prev,
      backgroundColor: themeColors[theme].backgroundColor,
      entityColor: themeColors[theme].entityColor,
    }));

    // Apply theme to document
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

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
        <div className="header-main">
          <div className="brand">
            <h1 className="brand-title">DXF Viewer</h1>
            <span className="brand-subtitle">Professional CAD File Viewer</span>
          </div>

          <div className="theme-toggle">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={theme === "dark"}
                onChange={() => setTheme(theme === "light" ? "dark" : "light")}
              />
              <span className="toggle-slider"></span>
              <span className="toggle-label">Dark Mode</span>
            </label>
          </div>
        </div>

        <div className="toolbar">
          <div className="toolbar-group">
            <div className="file-controls">
              <div className="file-input-wrapper">
                <input
                  type="file"
                  accept=".dxf"
                  onChange={handleFileUpload}
                  className="file-input"
                  id="file-input"
                />
                <label htmlFor="file-input" className="file-input-label">
                  Choose File
                </label>
              </div>
              <button
                onClick={() => loadDxfFile("/test.dxf")}
                className="secondary-button"
              >
                Sample
              </button>
            </div>
          </div>

          <div className="toolbar-divider"></div>

          <div className="toolbar-group">
            <div className="settings-inline">
              <label className="setting-item">
                <input
                  type="checkbox"
                  checked={viewerSettings.showGrid}
                  onChange={handleSettingChange("showGrid")}
                />
                <span>Grid</span>
              </label>
              <label className="setting-item">
                <input
                  type="checkbox"
                  checked={viewerSettings.showAxes}
                  onChange={handleSettingChange("showAxes")}
                />
                <span>Axes</span>
              </label>
              <label className="setting-item">
                <input
                  type="checkbox"
                  checked={viewerSettings.showDebugInfo}
                  onChange={handleSettingChange("showDebugInfo")}
                />
                <span>Debug</span>
              </label>
              <label className="setting-item">
                <input
                  type="checkbox"
                  checked={viewerSettings.showShapeColors}
                  onChange={handleSettingChange("showShapeColors")}
                />
                <span>Colors</span>
              </label>
            </div>
          </div>

          <div className="toolbar-divider"></div>

          <div className="toolbar-group">
            <div className="color-controls">
              <div className="color-input-group">
                <label className="color-label">Entity</label>
                <input
                  type="color"
                  value={viewerSettings.entityColor}
                  onChange={handleSettingChange("entityColor")}
                  className="color-input"
                />
              </div>
              <div className="color-input-group">
                <label className="color-label">Background</label>
                <input
                  type="color"
                  value={viewerSettings.backgroundColor}
                  onChange={handleSettingChange("backgroundColor")}
                  className="color-input"
                />
              </div>
            </div>
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
          />
        ) : null}
      </main>
    </div>
  );
}

export default App;
