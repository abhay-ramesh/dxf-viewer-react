# DXF Viewer Architecture Flow

```mermaid
graph TB
    %% Input Layer
    DXF[DXF File/String Content] -->|dxfContent prop| ReactComponent[DxfViewer React Component]
    
    %% React Layer
    ReactComponent -->|uses| useDxfHook[useDxfViewer Hook]
    ReactComponent -->|renders| Container[HTML Container Div]
    
    %% Parsing & Processing Layer
    useDxfHook -->|dxfContent| ParseDXF[processDxf Function]
    ParseDXF -->|parseSync| DxfParser[DxfParser Library]
    DxfParser -->|returns| ParsedData[Parsed DXF Data<br/>entities, blocks, tables, header]
    
    %% Entity Processing
    ParsedData -->|entities| EntityRouter{Entity Type Router}
    EntityRouter -->|LINE| ProcessLine[processLine<br/>THREE.Line]
    EntityRouter -->|ARC| ProcessArc[processArc<br/>THREE.EllipseCurve]
    EntityRouter -->|CIRCLE| ProcessCircle[processCircle<br/>THREE.EllipseCurve]
    EntityRouter -->|POLYLINE| ProcessPolyline[processPolyline<br/>THREE.Line]
    EntityRouter -->|LWPOLYLINE| ProcessPolyline
    EntityRouter -->|SPLINE| ProcessSpline[processSpline<br/>De Boor's Algorithm]
    EntityRouter -->|ELLIPSE| ProcessEllipse[processEllipse<br/>THREE.EllipseCurve]
    EntityRouter -->|POINT| ProcessPoint[processPoint<br/>THREE.LineSegments]
    EntityRouter -->|TEXT| ProcessText[processText<br/>THREE.LineSegments]
    
    ProcessLine --> THREEObjects[THREE.js Objects]
    ProcessArc --> THREEObjects
    ProcessCircle --> THREEObjects
    ProcessPolyline --> THREEObjects
    ProcessSpline --> THREEObjects
    ProcessEllipse --> THREEObjects
    ProcessPoint --> THREEObjects
    ProcessText --> THREEObjects
    
    %% Layer Organization
    THREEObjects -->|group by layer| LayerGroups[Layer Groups<br/>THREE.Group per Layer]
    LayerGroups -->|add to| MainGroup[Main DXF Group<br/>THREE.Group]
    
    %% Shape Analysis (Optional)
    ParsedData -->|if showShapeColors| Analyzer[DxfAnalyzer]
    Analyzer -->|findClosedLoops| ClosedLoops[Closed Loop Detection]
    ClosedLoops -->|separateOuterLoopsFromHoles| ShapeGeometry[ShapeGeometry Creation<br/>THREE.ShapeGeometry]
    ShapeGeometry -->|add filled shapes| MainGroup
    
    %% Stats Collection
    ParseDXF -->|collect stats| Stats[Entity Statistics<br/>counts, units, formats]
    Stats --> useDxfHook
    
    %% Three.js Scene Setup
    useDxfHook -->|containerDimensions| SetupCamera[setupCamera]
    MainGroup -->|bounding box| SetupCamera
    SetupCamera -->|calculate| Camera[OrthographicCamera<br/>position, zoom, view frustum]
    SetupCamera -->|center point| Center[Scene Center Vector3]
    
    useDxfHook -->|backgroundColor, showGrid, showAxes| SetupScene[setupScene]
    MainGroup -->|add group| SetupScene
    SetupScene -->|creates| Scene[THREE.Scene<br/>+ Grid + Axes + DXF Group]
    
    useDxfHook -->|containerDimensions| CreateRenderer[Create WebGLRenderer]
    CreateRenderer -->|domElement| Renderer[THREE.WebGLRenderer<br/>Canvas Element]
    
    Camera -->|camera, renderer| SetupControls[setupControls]
    Center -->|target| SetupControls
    SetupControls -->|creates| Controls[OrbitControls<br/>Pan, Zoom, 2D Lock]
    
    %% Rendering Loop
    Scene -->|scene| RenderLoop[Animation Loop<br/>requestAnimationFrame]
    Camera -->|camera| RenderLoop
    Renderer -->|render| RenderLoop
    Controls -->|update| RenderLoop
    RenderLoop -->|render| Canvas[WebGL Canvas]
    Canvas -->|appended to| Container
    Container -->|displays| Screen[Screen Display]
    
    %% Tool System
    useDxfHook -->|creates| Tools{Interactive Tools}
    Tools -->|pan| PanTool[PanTool<br/>OrbitControls panning]
    Tools -->|select| SelectTool[SelectTool<br/>Raycasting + Hover Info]
    Tools -->|measure| MeasureTool[MeasureTool<br/>Distance Calculation]
    
    PanTool -->|mouse events| EventHandlers[Mouse Event Handlers]
    SelectTool -->|mouse events| EventHandlers
    MeasureTool -->|mouse events| EventHandlers
    
    EventHandlers -->|onMouseDown/Move/Up| Tools
    Tools -->|updates| Scene
    Tools -->|shows| UIOverlays[UI Overlays<br/>Hover Info, Selection, Measurements]
    
    %% State Management
    useDxfHook -->|returns| State[React State]
    State -->|currentTool| ReactComponent
    State -->|hoverInfo| ReactComponent
    State -->|selectedEntityInfo| ReactComponent
    State -->|measureText| ReactComponent
    State -->|stats| ReactComponent
    State -->|error| ReactComponent
    
    %% Resize Handling
    Container -->|ResizeObserver| ResizeHandler[Resize Handler]
    ResizeHandler -->|update| Camera
    ResizeHandler -->|update| Renderer
    
    %% Callbacks
    useDxfHook -->|onLoad| OnLoadCallback[onLoad Callback]
    useDxfHook -->|onError| OnErrorCallback[onError Callback]
    useDxfHook -->|onMeasureComplete| OnMeasureCallback[onMeasureComplete Callback]
    
    %% Styling
    classDef input fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef react fill:#61dafb,stroke:#20232a,stroke-width:2px
    classDef processing fill:#fff4e6,stroke:#e65100,stroke-width:2px
    classDef threejs fill:#ff6b6b,stroke:#c92a2a,stroke-width:2px
    classDef tools fill:#51cf66,stroke:#2f9e44,stroke-width:2px
    classDef output fill:#d0bfff,stroke:#5f3dc4,stroke-width:2px
    
    class DXF,ReactComponent,Container input
    class useDxfHook,State react
    class ParseDXF,DxfParser,ParsedData,EntityRouter,ProcessLine,ProcessArc,ProcessCircle,ProcessPolyline,ProcessSpline,ProcessEllipse,ProcessPoint,ProcessText,Analyzer,ClosedLoops,ShapeGeometry,Stats processing
    class THREEObjects,LayerGroups,MainGroup,SetupCamera,SetupScene,SetupControls,Camera,Scene,CreateRenderer,Renderer,Controls,RenderLoop,Canvas threejs
    class Tools,PanTool,SelectTool,MeasureTool,EventHandlers tools
    class Screen,UIOverlays output
```

## Detailed Flow Description

### 1. **Input & React Component**

- User provides DXF file content as string via `dxfContent` prop
- `DxfViewer` component wraps the viewer logic
- Component creates a container div for the canvas

### 2. **DXF Parsing**

- `processDxf` function receives DXF string
- Uses `DxfParser` library to parse DXF format
- Extracts entities, blocks, layer tables, and header information
- Handles parse errors gracefully

### 3. **Entity Processing**

- Each entity type is routed to appropriate processor:

  - **Lines**: Direct vertex mapping to `THREE.Line`
  - **Arcs/Circles**: Converted using `THREE.EllipseCurve`
  - **Polylines**: Vertex array to `THREE.Line`
  - **Splines**: De Boor's algorithm evaluation for B-spline curves
  - **Ellipses**: Ellipse curve with rotation
  - **Points**: Rendered as small crosses
  - **Text**: Rendered as bounding boxes

### 4. **Layer Organization**

- Entities grouped by layer into `THREE.Group` objects
- Layer colors applied based on DXF layer table
- All layer groups added to main DXF group

### 5. **Shape Analysis (Optional)**

- `DxfAnalyzer` finds closed loops using connectivity analysis
- Separates outer loops from holes using containment testing
- Creates `THREE.ShapeGeometry` for filled shapes
- Only runs when `showShapeColors` is enabled (performance optimization)

### 6. **Scene Setup**

- **Camera**: `setupCamera` creates orthographic camera positioned above scene

  - Calculates bounding box of DXF content
  - Sets view frustum based on content size and container aspect ratio
  - Positions camera to look straight down (2D view)
  
- **Scene**: `setupScene` creates THREE.Scene with:

  - Background color
  - Optional grid (major/minor divisions)
  - Optional axes helper
  - DXF content group
  
- **Renderer**: Creates `THREE.WebGLRenderer` with:

  - Antialiasing enabled
  - High-performance power preference
  - Pixel ratio optimization
  - Canvas sized to container

- **Controls**: `setupControls` configures `OrbitControls` for:

  - Pan (mouse drag)
  - Zoom (mouse wheel)
  - Rotation disabled (2D lock)
  - Touch support

### 7. **Rendering Loop**

- Animation loop using `requestAnimationFrame`
- Each frame:

  1. Updates controls (pan/zoom)
  2. Locks camera to 2D view (looking straight down)
  3. Renders scene to canvas
- Canvas element appended to container div

### 8. **Interactive Tools**

- **Pan Tool**: Uses OrbitControls panning
- **Select Tool**: Raycasting to detect entity intersections

  - Shows hover info overlay
  - Displays selected entity details
- **Measure Tool**: Calculates distances between points

  - Shows measurement text overlay
  - Triggers `onMeasureComplete` callback

### 9. **State Management**

- React hooks manage:

  - Current active tool
  - Hover information
  - Selected entity details
  - Measurement text
  - File statistics
  - Error states
- State updates trigger UI re-renders

### 10. **Event Handling**

- Mouse events (down, move, up) routed to active tool
- Tools interact with scene via raycasting
- UI overlays updated based on tool interactions

### 11. **Resize Handling**

- `ResizeObserver` monitors container size changes
- Updates camera view frustum to maintain aspect ratio
- Resizes renderer canvas to match container

### 12. **Output**

- WebGL canvas rendered in browser
- UI overlays for tools, measurements, debug info
- Displayed in user's browser window

## Key Design Decisions

1. **Orthographic Camera**: Ensures true 2D CAD view without perspective distortion
2. **Layer-based Organization**: Maintains DXF layer structure in Three.js groups
3. **Optional Shape Analysis**: Only processes closed loops when needed for performance
4. **Tool System**: Extensible architecture for adding new interactive tools
5. **SSR Compatibility**: Guards prevent server-side rendering issues
6. **Error Handling**: Graceful degradation when parsing fails
