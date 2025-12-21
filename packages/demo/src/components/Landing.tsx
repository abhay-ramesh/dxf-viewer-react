import { ArrowRight, Eye, Layers } from "lucide-react";
import React from "react";
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
          A high-performance, Three.js-based DXF visualization library for React
          applications.
          <br />
          Explore the capabilities below.
        </p>

        <div className="mode-cards">
          {/* Simple Mode Card */}
          <div className="mode-card" onClick={() => onNavigate("simple")}>
            <div className="card-icon simple">
              <Eye size={48} />
            </div>
            <h2>Quick Preview</h2>
            <p>
              A lightweight interface focused on essential viewing, panning, and
              measurement. Ideal for quick file inspections and simple
              embedding.
            </p>
            <div className="card-action">
              Open Viewer <ArrowRight size={16} />
            </div>
          </div>

          {/* Advanced Mode Card */}
          <div className="mode-card" onClick={() => onNavigate("advanced")}>
            <div className="card-icon advanced">
              <Layers size={48} />
            </div>
            <h2>Advanced CAD</h2>
            <p>
              A comprehensive interface demonstrating the full power of the
              library. Features layer management, entity inspection, advanced
              snapping, and more.
            </p>
            <div className="card-action">
              Launch Advanced Mode <ArrowRight size={16} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
