# NetLens — Architecture

This document explains the structural decisions in the codebase.
It answers the question every contributor should ask first:
*"Why is it built this way?"*

---

## Guiding Principles

### 1. Separation of Concerns

The codebase is divided into four layers, each with a single
responsibility. A module in one layer must not depend on a module
in a layer above it.

```
@netlens/core          ← pure logic, no DOM, no I/O
@netlens/ui            ← reusable components, no business logic
packages/*/src/state   ← application state, no rendering
packages/*/src/views   ← rendering only, no state mutation
```

**Consequence:** you can run and test `@netlens/core` in Node
without a browser. You can change the design system without
touching business logic.

### 2. Single Source of Truth

Every piece of data lives in exactly one place.

- Protocol data → `packages/core/src/protocols/<name>.js`
- Quiz questions → `packages/core/src/quiz/questions.js`
- CSS variables  → `packages/ui/src/design-system/tokens.css`
- App state      → `packages/*/src/state.js`

If you find yourself duplicating data, it belongs in core.

### 3. Unidirectional Data Flow

```
User event → dispatch(action) → reduce(state, action) → render(state)
```

State never mutates directly. Every state change produces a new
state object. Rendering is always a pure function of state.

**Consequence:** given any bug, you can reproduce it by replaying
a sequence of actions. You can test every UI state by constructing
a state object directly.

### 4. Open/Closed for Extension

Adding a protocol → create one file, add one import.  
Adding a detection rule → create one function, add to RULES array.  
Adding a quiz question → add one object to questions array.  

Existing code does not change.

### 5. Explicit Dependencies

No global variables. No singletons. Every module declares its
dependencies through imports. If a module needs something, it
receives it as a parameter.

---

## Package Structure

```
netlens/
├── packages/
│   ├── core/        Pure business logic (protocols, quiz, anomaly)
│   ├── ui/          Design system + reusable components
│   ├── sandbox/     Protocol simulator application
│   ├── quiz/        Assessment application
│   ├── xray/        Network dashboard application
│   └── hub/         Landing page
└── capture/         Rust packet capture backend
```

### @netlens/core

No DOM. No network. No side effects.
Every export is a pure function or a data structure.

```
protocols/index.js   ← Protocol registry + typed getters
protocols/tcp.js     ← TCP data (one file per protocol)
quiz/engine.js       ← Quiz session logic (pure reducer)
quiz/questions.js    ← Question bank (data only)
anomaly/engine.js    ← Detection rules (rule registry)
```

**Test strategy:** `vitest` in Node. No browser required.

### @netlens/ui

Knows about the DOM. Does not know about any protocol or quiz.
Components receive data as parameters, emit events via callbacks.

```
design-system/
  tokens.css         ← All CSS variables (single source)
  index.css          ← Reset + base + atomic components

components/
  PacketFlow/        ← Renders packet exchange diagram
  Inspector/         ← Renders packet header fields
  QuizCard/          ← Renders a question card
  Timeline/          ← Renders bandwidth chart
  Alert/             ← Renders alert item
  dom.js             ← Shared DOM utilities
```

**Test strategy:** render component into a jsdom element, assert
resulting HTML structure.

### Application packages (sandbox, quiz, xray, hub)

Each application follows the same structure:

```
src/
  state.js           ← Reducer + selectors + action types
  controllers/       ← Side effects (timers, WebSocket, keyboard)
  views/
    render.js        ← Translates state into DOM mutations
  main.js            ← Wires everything together (entry point)
index.html           ← HTML shell (no inline logic)
src/<app>.css        ← App-specific layout styles
```

**Invariant:** `main.js` is the only module that imports both
controllers and views. Controllers never import views.
Views never import controllers.

---

## Rust Capture Backend

The capture backend is a separate binary that streams JSON events
over WebSocket. The frontend is completely decoupled from it — if
the backend is unavailable, the Simulation transport activates
automatically.

### WebSocket Message Protocol

All messages are JSON with a `type` field:

```
// Backend → Frontend
{ type: 'Status',         status: 'connected'|'disconnected' }
{ type: 'DeviceList',     devices: Device[] }
{ type: 'FlowUpdate',     flows: Flow[] }
{ type: 'BandwidthSample',mbpsDown: number, mbpsUp: number, timestamp: number }
{ type: 'Alert',          severity, flowId, title, description, timestamp }
```

### Parser Extension

To add a new protocol parser:

1. Create `capture/src/parsers/<protocol>.rs`
2. Implement the `Parser` trait
3. Register in `capture/src/parsers/mod.rs`

The capture pipeline and WebSocket output do not change.

---

## Adding a Protocol to the Sandbox

1. Create `packages/core/src/protocols/quic.js`
   - Export a `QUIC` object conforming to the `Protocol` type
   - Define `actors`, `faults`, and `steps`
   - Zero rendering logic — data only

2. Register in `packages/core/src/protocols/index.js`
   ```js
   import { QUIC } from './quic.js'
   const REGISTRY = new Map([
     // ...existing entries...
     [QUIC.id, QUIC],
   ])
   ```

3. Done. The sandbox, protocol list, and phase strip
   update automatically.

---

## CSS Architecture

One CSS file per scope:

```
tokens.css     → design tokens (colors, spacing, type)
index.css      → reset + base + atomic components
sandbox.css    → sandbox layout only
quiz.css       → quiz layout only
xray.css       → xray layout only
```

**Rule:** never reference a hardcoded color, size, or font outside
of tokens.css. If a value appears twice, it belongs in tokens.

---

## Testing Strategy

```
Unit tests (Node, no browser)
  @netlens/core      ← All reducers, selectors, and pure functions
  Quiz engine        ← Session build, answer validation, stats
  Anomaly rules      ← Each rule independently

Component tests (jsdom)
  PacketFlow         ← Renders correct number of steps
  Inspector          ← Shows correct field count
  QuizCard           ← Answer selection state

Integration tests (PCAP fixtures)
  Rust parsers       ← Parse known-good captures
  Anomaly detection  ← Known-bad captures trigger correct rules
```
