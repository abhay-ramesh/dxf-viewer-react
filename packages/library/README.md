# dxf-viewer-react

A React component library and hook for viewing DXF (Drawing Exchange Format) files using Three.js.

![License](https://img.shields.io/npm/l/dxf-viewer-react)

## Features

- **Fast Rendering**: Powered by Three.js for efficient 2D/3D visualization
- **Headless Hook**: `useDxfViewer` hook for complete UI control
- **Ready-to-use Component**: `<DxfViewer />` for quick integration
- **Interactive Tools**: Built-in support for Panning, Zooming, Selecting, and Measuring
- **Advanced Snapping**: Endpoint, Midpoint, Center, Intersection, and Nearest snapping
- **Layer Support**: Toggle visibility of DXF layers and view layer colors
- **Block Support**: Renders nested blocks and inserts correctly
- **Closed Loop Detection**: Automatically detects and fills closed shapes
- **Responsive**: Adapts to container size

## Installation

```bash
npm install dxf-viewer-react three
# or
pnpm add dxf-viewer-react three
# or
yarn add dxf-viewer-react three
```

> **Note**: `three` is a peer dependency and must be installed alongside this library.

## Usage

### 1. Basic Component (Quick Start)

```tsx
import { useState, useEffect } from 'react';
import { DxfViewer } from 'dxf-viewer-react';

function App() {
  const [dxfContent, setDxfContent] = useState<string | null>(null);

  useEffect(() => {
    fetch('/path/to/your/file.dxf')
      .then(res => res.text())
      .then(text => setDxfContent(text));
  }, []);

  if (!dxfContent) return <div>Loading...</div>;

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <DxfViewer 
        dxfContent={dxfContent}
        width="100%"
        height="100%"
        backgroundColor={0xf0f0f0}
        entityColor={0x0000ff}
        showGrid={true}
        showAxes={true}
      />
    </div>
  );
}
```

### 2. Headless Hook (Custom UI)

```tsx
import { useDxfViewer } from 'dxf-viewer-react';

function MyCustomViewer({ dxfString }) {
  const { 
    containerRef, 
    setCurrentTool, 
    measureText 
  } = useDxfViewer({ dxfContent: dxfString });

  return (
    <div className="viewer-wrapper">
      <div ref={containerRef} className="canvas-container" />
      
      <div className="toolbar">
        <button onClick={() => setCurrentTool('pan')}>Pan</button>
        <button onClick={() => setCurrentTool('measure')}>Measure</button>
      </div>

      {measureText && <div className="overlay">{measureText}</div>}
    </div>
  );
}
```

### 3. Plain Viewing Mode (Minimal, PNG-like)

For a clean, minimal viewing experience without grids, axes, shape fills, or interactivity:

```tsx
import { DxfViewer } from 'dxf-viewer-react';

function PlainViewer({ dxfString }) {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <DxfViewer 
        dxfContent={dxfString}
        backgroundColor={0xffffff}
        entityColor={0x000000}
        showGrid={false}
        showAxes={false}
        showShapeColors={false}
        interactive={false}
        width="100%"
        height="100%"
      />
    </div>
  );
}
```

### 4. Extending Functionality (Advanced)

The `useDxfViewer` hook exposes internal Three.js instances, allowing you to add custom objects, markers, or event listeners.

```tsx
import { useEffect } from 'react';
import { useDxfViewer } from 'dxf-viewer-react';
import * as THREE from 'three';

function AdvancedViewer({ dxfString }) {
  const { 
    containerRef, 
    scene,      // The THREE.Scene instance
    camera,     // The THREE.OrthographicCamera instance
    renderer,   // The THREE.WebGLRenderer instance
    dxfGroup    // The THREE.Group containing the DXF entities
  } = useDxfViewer({ dxfContent: dxfString });

  // Example: Add a custom marker to the scene
  useEffect(() => {
    if (!scene) return;

    const markerGeometry = new THREE.SphereGeometry(5, 32, 32);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    
    // Position at origin or any coordinate
    marker.position.set(0, 0, 0);
    
    scene.add(marker);

    // Cleanup
    return () => {
      scene.remove(marker);
      markerGeometry.dispose();
      markerMaterial.dispose();
    };
  }, [scene]);

  return <div ref={containerRef} style={{ width: '100%', height: '100vh' }} />;
}
```

## Props / Hook Options

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `dxfContent` | `string` | **Required** | The raw string content of the DXF file. |
| `width` | `string \| number` | `"100%"` | Width of the viewer container (Component only). |
| `height` | `string \| number` | `"100%"` | Height of the viewer container (Component only). |
| `backgroundColor` | `number` | `0xf0f0f0` | Hex color code for the background scene. Set to `0xffffff` for white background. |
| `entityColor` | `number` | `0x0000ff` | Hex color code for the DXF lines/entities. Set to `0x000000` for black lines. |
| `showGrid` | `boolean` | `true` | Whether to show the background grid. Set to `false` for clean viewing. |
| `showAxes` | `boolean` | `true` | Whether to show the X/Y axes helper. Set to `false` to hide axes. |
| `showDebugInfo` | `boolean` | `false` | Show overlay with debug/stats information. |
| `showShapeColors` | `boolean` | `true` | Whether to fill closed shapes with colors. Set to `false` for line-only rendering. |
| `interactive` | `boolean` | `true` | Enable interactivity (pan, zoom, select, measure). Set to `false` for static viewing. |
| `defaultTool` | `"pan" \| "select" \| "measure"` | `"pan"` | The tool active by default on load. |
| `onLoad` | `(stats: any) => void` | `undefined` | Callback fired when DXF is successfully parsed and loaded. |
| `onError` | `(error: Error) => void` | `undefined` | Callback fired when DXF parsing fails. |
| `onMeasureComplete` | `(dist: number, p1: Vector3, p2: Vector3) => void` | `undefined` | Callback fired after a measurement is completed. |

## Development

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Run dev server: `pnpm dev`
4. Build library: `pnpm build:lib`

## License

MIT
