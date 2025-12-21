import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";
import "./App.css";
import { AdvancedViewer } from "./components/AdvancedViewer";
import { Landing } from "./components/Landing";
import { SimpleViewer } from "./components/SimpleViewer";

// Wrapper components to pass navigation
const LandingWrapper = () => {
  const navigate = useNavigate();
  return <Landing onNavigate={(path) => navigate(path)} />;
};

const SimpleViewerWrapper = () => {
  const navigate = useNavigate();
  return <SimpleViewer onBack={() => navigate("/")} />;
};

const AdvancedViewerWrapper = () => {
  const navigate = useNavigate();
  return <AdvancedViewer onBack={() => navigate("/")} />;
      };

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingWrapper />} />
        <Route path="/simple" element={<SimpleViewerWrapper />} />
        <Route path="/advanced" element={<AdvancedViewerWrapper />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
