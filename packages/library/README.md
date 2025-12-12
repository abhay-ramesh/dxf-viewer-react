# dxf-viewer-react

A React component library for viewing DXF (Drawing Exchange Format) files using Three.js.

![License](https://img.shields.io/npm/l/dxf-viewer-react)

## Features

- 🚀 **Fast Rendering**: Powered by Three.js for efficient 2D/3D visualization
- 🛠️ **Interactive Tools**: Built-in support for Panning, Zooming, Selecting, and Measuring
- 📏 **Measurement**: Accurate distance measurements with snapping
- 🎨 **Layer Support**: (Coming soon) Toggle visibility of DXF layers
- 📱 **Responsive**: Adapts to container size

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

```tsx
import { useState, useEffect } from 'react';
import { DxfViewer } from 'dxf-viewer-react';

function App() {
  const [dxfContent, setDxfContent] = useState<string | null>(null);

  useEffect(() => {
    // Load your DXF file content (e.g., via fetch or file input)
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
        onLoad={(stats) => console.log('DXF Loaded:', stats)}
        onError={(err) => console.error('Error loading DXF:', err)}
      />
    </div>
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `dxfContent` | `string` | **Required** | The raw string content of the DXF file. |
| `width` | `string \| number` | `"100%"` | Width of the viewer container. |
| `height` | `string \| number` | `"100%"` | Height of the viewer container. |
| `backgroundColor` | `number` | `0xf0f0f0` | Hex color code for the background scene. |
| `entityColor` | `number` | `0x0000ff` | Hex color code for the DXF lines/entities. |
| `showGrid` | `boolean` | `true` | Whether to show the background grid. |
| `showAxes` | `boolean` | `true` | Whether to show the X/Y axes helper. |
| `showDebugInfo` | `boolean` | `false` | Show overlay with debug/stats information. |
| `showShapeColors` | `boolean` | `true` | Attempt to fill closed shapes with colors. |
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
