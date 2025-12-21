# React 18/19 Compatibility Guide

This document outlines how `dxf-viewer-react` maintains compatibility with both React 18 and React 19, following patterns used by industry-leading libraries.

## 📚 How Top Libraries Handle React 18→19 Compatibility

### 1. **Peer Dependencies Pattern** (Industry Standard)

**Best Practice**: Use range syntax that supports both versions

```json
"peerDependencies": {
  "react": ">=18 <20",
  "react-dom": ">=18 <20"
}
```

**Examples from popular libraries:**

- **React Three Fiber**: `"react": "^18.0.0 || ^19.0.0"`
- **Framer Motion**: `"react": ">=18.0.0"`
- **React Spring**: `"react": "^18.0.0 || ^19.0.0"`
- **Zustand**: `"react": ">=18.0.0"`

**Why `>=18 <20` is better:**

- ✅ Supports React 18.x and 19.x
- ✅ Automatically supports future 19.x patches
- ✅ Blocks React 20 (future-proof)
- ✅ No breaking changes for users

---

### 2. **SSR Safety Pattern** (Next.js Compatible)

**Pattern**: Never access browser APIs at module scope

```typescript
// ❌ BAD - Breaks SSR
const canvas = document.createElement('canvas')

// ✅ GOOD - SSR safe
const MyComponent = () => {
  const [isMounted, setIsMounted] = useState(false)
  
  useEffect(() => {
    setIsMounted(true)
  }, [])
  
  if (!isMounted) return null
  
  const canvas = document.createElement('canvas')
  // ...
}
```

**Libraries using this pattern:**

- **React Three Fiber**: Uses `useFrame` hook (client-only)
- **Framer Motion**: Checks `typeof window !== 'undefined'`
- **React Spring**: SSR guards in all hooks

---

### 3. **Idempotent Effects Pattern** (React 19 Safe)

**Pattern**: Effects must be safe to run multiple times

```typescript
// ❌ BAD - Breaks with React 19's effect replay
useEffect(() => {
  startAnimationLoop() // Runs multiple times!
}, [])

// ✅ GOOD - Idempotent
const runningRef = useRef(false)

useEffect(() => {
  if (runningRef.current) return
  
  runningRef.current = true
  const frameId = requestAnimationFrame(animate)
  
  return () => {
    runningRef.current = false
    cancelAnimationFrame(frameId)
  }
}, [])
```

**Libraries using this pattern:**

- **React Three Fiber**: Uses refs to track initialization
- **React Spring**: Idempotent effect cleanup
- **Zustand**: Safe effect subscriptions

---

### 4. **Refs Over Globals Pattern** (Concurrent Safe)

**Pattern**: Never use module-level variables

```typescript
// ❌ BAD - Breaks concurrent rendering
let renderer: THREE.WebGLRenderer

// ✅ GOOD - Uses refs
const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
```

**Libraries using this pattern:**

- **React Three Fiber**: All Three.js objects in refs
- **Framer Motion**: Animation refs
- **React Spring**: Spring refs

---

### 5. **Cleanup Pattern** (Memory Leak Prevention)

**Pattern**: Comprehensive cleanup in effect return

```typescript
useEffect(() => {
  // Setup
  const renderer = new THREE.WebGLRenderer()
  const frameId = requestAnimationFrame(animate)
  window.addEventListener('resize', handleResize)
  
  return () => {
    // Cleanup (idempotent)
    cancelAnimationFrame(frameId)
    window.removeEventListener('resize', handleResize)
    renderer.dispose()
    
    // Remove from DOM
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement)
    }
    
    // Clear refs
    rendererRef.current = null
  }
}, [])
```

**Libraries using this pattern:**

- **React Three Fiber**: Comprehensive Three.js cleanup
- **Framer Motion**: Animation cleanup
- **React Spring**: Spring cleanup

---

### 6. **Window Access Pattern** (SSR Safe)

**Pattern**: Always guard window/document access

```typescript
// ❌ BAD - Breaks SSR
const pixelRatio = window.devicePixelRatio

// ✅ GOOD - SSR safe
const pixelRatio = typeof window !== 'undefined' 
  ? window.devicePixelRatio 
  : 1
```

---

### 7. **Client-Only Entry Pattern** (Optional but Recommended)

**Pattern**: Separate client-only entry point

```
my-lib/
  ├─ index.ts        ← SSR-safe exports
  ├─ client.tsx      ← Browser-only components
  └─ package.json
```

**Usage:**

```typescript
// SSR-safe
import { useDxfViewer } from 'dxf-viewer-react'

// Client-only
import { DxfViewer } from 'dxf-viewer-react/client'
```

**Libraries using this pattern:**

- **React Three Fiber**: `@react-three/fiber` (client-only)
- **Framer Motion**: `framer-motion` (client-only)
- **React Spring**: `@react-spring/web` (client-only)

---

## 🎯 Our Implementation

### ✅ What We've Implemented

1. **Peer Dependencies**: `>=18 <20` ✅
2. **SSR Guards**: `isMounted` state ✅
3. **Idempotent Effects**: Refs track initialization ✅
4. **Refs Over Globals**: All Three.js objects in refs ✅
5. **Comprehensive Cleanup**: Full GPU resource disposal ✅
6. **Window Access Guards**: All browser APIs guarded ✅

### 📋 Testing Matrix

To ensure compatibility, test in:

| Environment | React 18 | React 19 |
|------------|---------|---------|
| Vite        | ✅       | ✅       |
| Next.js     | ✅       | ✅       |
| Create React App | ✅ | ✅       |
| Remix       | ✅       | ✅       |

---

## 🔍 Real-World Examples

### React Three Fiber (R3F)

```json
{
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  }
}
```

**Key patterns:**

- Client-only component (`Canvas`)
- Refs for all Three.js objects
- Idempotent effect cleanup
- SSR guards in hooks

### Framer Motion

```json
{
  "peerDependencies": {
    "react": ">=18.0.0"
  }
}
```

**Key patterns:**

- Window access guards
- Effect cleanup
- Ref-based state management

### Zustand

```json
{
  "peerDependencies": {
    "react": ">=18.0.0"
  }
}
```

**Key patterns:**

- No DOM access
- Pure React hooks
- SSR-safe by default

---

## 🚀 Best Practices Summary

1. **Peer deps**: `>=18 <20` (not `^18.0.0 || ^19.0.0`)
2. **SSR guards**: Always check `typeof window !== 'undefined'`
3. **Idempotent effects**: Use refs to track initialization
4. **Refs over globals**: Never module-level state
5. **Comprehensive cleanup**: Dispose all resources
6. **Window guards**: All browser APIs protected
7. **Test matrix**: Test both React 18 and 19

---

## 📖 References

- [React 19 Upgrade Guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)
- [React Three Fiber](https://github.com/pmndrs/react-three-fiber)
- [Framer Motion](https://github.com/framer/motion)
- [React Spring](https://github.com/pmndrs/react-spring)
