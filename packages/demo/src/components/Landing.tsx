import React from "react";
import { ArrowRight, Eye, Layers } from "lucide-react";
import "../App.css";

interface LandingProps {
  onNavigate: (path: string) => void;
}

export const Landing: React.FC<LandingProps> = ({ onNavigate }) => {
  return (
    <div className="landing-page">
      <div className="landing-content">
        <h1 className="landing-title">DXF Viewer React</h1>
        <p className="landing-subtitle">
          High-performance, headless DXF visualization for the web.
          <br />
          Select a mode to explore the capabilities.
        </p>

        <div className="mode-cards">
          {/* Simple Mode Card */}
          <div className="mode-card" onClick={() => onNavigate("simple")}>
            <div className="card-icon simple">
              <Eye size={48} />
            </div>
            <h2>Quick View Mode</h2>
            <p>
              Minimalist interface focused on viewing, panning, and basic
              measurement. Ideal for simple file previews and embedding.
            </p>
            <div className="card-action">
              Launch Viewer <ArrowRight size={16} />
            </div>
          </div>

          {/* Advanced Mode Card */}
          <div className="mode-card" onClick={() => onNavigate("advanced")}>
            <div className="card-icon advanced">
              <Layers size={48} />
            </div>
            <h2>Pro CAD Mode</h2>
            <p>
              Full-featured interface mimicking professional CAD software.
              Includes selection, detailed properties, layers, and command line.
            </p>
            <div className="card-action">
              Launch Pro Mode <ArrowRight size={16} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

