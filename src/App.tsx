import { useEffect, useState } from "react";
import "./App.css";
import { DxfViewer } from "./components/DxfViewer";

function App() {
  const [dxfContent, setDxfContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string>("test.dxf");

  useEffect(() => {
    loadDxfFile("/test.dxf", "test.dxf");
  }, []);

  const loadDxfFile = async (path: string, fileName: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const content = await response.text();
      setDxfContent(content);
      setCurrentFileName(fileName);
    } catch (error) {
      console.error("Error loading DXF file:", error);
      setError(
        `Failed to load ${fileName}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      setDxfContent("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content === "string") {
        setDxfContent(content);
        setCurrentFileName(file.name);
      }
      setIsLoading(false);
    };
    reader.onerror = () => {
      setError(`Failed to read ${file.name}`);
      setIsLoading(false);
    };
    reader.readAsText(file);
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#ffffff",
      }}
    >
      <div
        style={{
          padding: "1rem",
          borderBottom: "1px solid #eee",
          display: "flex",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <input
          type="file"
          accept=".dxf"
          onChange={handleFileUpload}
          style={{ flex: "1" }}
        />
        <button
          onClick={() => loadDxfFile("/test.dxf", "test.dxf")}
          style={{
            padding: "0.5rem 1rem",
            background: "#0066cc",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Reset to test.dxf
        </button>
        <div style={{ color: "#666" }}>Current: {currentFileName}</div>
      </div>
      <div style={{ flex: 1, position: "relative" }}>
        {error ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#ff0000",
              padding: "1rem",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        ) : isLoading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#666",
            }}
          >
            Loading {currentFileName}...
          </div>
        ) : dxfContent ? (
          <DxfViewer dxfContent={dxfContent} />
        ) : null}
      </div>
    </div>
  );
}

export default App;
