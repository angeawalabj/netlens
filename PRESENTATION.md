# NetLens — Protocol Intelligence for Engineers

> Open-source toolkit for learning, observing, and debugging network protocols.
> Simulate TCP handshakes. Capture live traffic. Understand what happens on your network.

---

## One-liner

**NetLens makes network protocols visible** — an interactive simulator, a live traffic dashboard, and a 90-question assessment, built as a zero-dependency open-source toolkit.

---

## For a Portfolio

### Project Summary

NetLens is a full-stack open-source project combining a browser-based protocol learning platform with a Rust packet capture engine. It was built to solve a specific gap: most network learning resources are either theoretical (textbooks) or too raw (Wireshark). NetLens sits in between — it translates live network traffic and protocol exchanges into plain-language, step-by-step explanations.

### What I Built

**Frontend (Vanilla JS, no framework)**
- Protocol Sandbox: interactive step-by-step simulator for TCP, DNS, TLS 1.3, HTTP/2, and MQTT — with fault injection (drop packets, inject RST, expire certificates)
- Network X-Ray: real-time dashboard showing live connections, protocol distribution, bandwidth timeline, and anomaly alerts
- Assessment: 90 questions across 5 cognitive levels — from recall to architecture decisions — with adaptive weak-spot retesting
- Hub: landing page tying all modules together

**Backend (Rust)**
- libpcap capture engine with protocol parsers (DNS, TLS/SNI, HTTP, MQTT)
- Flow correlation, anomaly detection rules, WebSocket event streaming
- Single binary (~500 KB), links against system libpcap; 4 direct crates (pcap, serde, serde_json, base64), no async runtime

**Architecture**
- Strict separation of concerns: core logic (zero DOM), UI components (zero business logic), application state (pure reducers), views (rendering only)
- Open/Closed design: adding a protocol = one file. Adding a detection rule = one function
- 65 files, 9 JS test suites + 25 Rust unit tests, 0 npm runtime dependencies

### Technical Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| UI    | Vanilla JS + ES Modules | No framework overhead — contribuable by anyone who finished the curriculum |
| Styling | CSS Custom Properties | Single source of truth for all design tokens |
| State | Reducer pattern (hand-rolled) | Predictable, testable, no external library |
| Capture | Rust + libpcap + pnet | Memory-safe packet parsing at line rate |
| Transport | WebSocket (hand-rolled) | Zero async runtime for simple broadcast |
| Build | esbuild | Bundles to standalone HTML — deploy anywhere |
| Tests | Node + vitest | Pure logic tests, no browser required |

### Key Design Decisions

**Why no framework?**
The target audience is engineers learning networking. The codebase should be readable by someone who just finished the 30-day curriculum. React adds a mental model that has nothing to do with network protocols.

**Why Rust for the capture backend?**
Memory safety is non-negotiable when parsing untrusted network packets. A malformed packet should cause a parse error, not a buffer overflow. Rust gives this guarantee at compile time.

**Why a monorepo with npm workspaces?**
Strict separation between `@netlens/core` (pure logic), `@netlens/ui` (components), and the four application packages prevents accidental coupling. If core imports anything from ui, the architecture tests fail.

---

## For LinkedIn

**🔧 Built NetLens — an open-source network protocol learning toolkit**

After spending months debugging network issues and wishing I had better tooling for understanding *why* things fail, I built NetLens.

It's three things:
- A protocol sandbox where you step through TCP, TLS, and DNS exchanges packet by packet
- A live traffic dashboard (Rust backend + WebSocket) that explains what's on your network in plain English
- A 90-question assessment that tests whether you can actually diagnose problems — not just recall definitions

Built entirely without frontend frameworks (vanilla JS, CSS custom properties, pure reducer state). The Rust capture engine uses libpcap for packet capture and streams JSON events over WebSocket.

**What I'm most proud of:** the architecture. Adding a new protocol requires one file. Adding a detection rule requires one function. The core logic has zero DOM dependencies and runs in Node for testing. 65 files, 9 JS test suites + 25 Rust unit tests, 0 npm runtime dependencies.

Open source, Apache 2.0: github.com/netlens/netlens

#OpenSource #Networking #Rust #WebDevelopment #DevTools

---

## For a CV / Resume

**NetLens** — Protocol Learning & Monitoring Toolkit *(Open Source, Apache 2.0)*
`Rust` `JavaScript` `libpcap` `WebSocket` `CSS`

- Built a browser-based interactive simulator for TCP, DNS, TLS 1.3, HTTP/2, and MQTT with fault injection and header inspection
- Implemented a Rust packet capture engine using libpcap, with hand-rolled Ethernet/IP/TCP/UDP parsing, streaming JSON events over a hand-rolled WebSocket server
- Designed an anomaly detection pipeline (DGA patterns, ACR telemetry, cleartext credentials, unusual egress) with an extensible rule registry
- Architected a zero-dependency monorepo with strict separation between pure business logic, UI components, and application state — enforced by architecture tests
- 65 source files · 9 JS test suites + 25 Rust unit tests · 0 npm runtime dependencies · single-binary Rust backend (~500 KB)

---

## For a GitHub README Badge Section

```markdown
![License](https://img.shields.io/badge/license-Apache%202.0-blue)
![Version](https://img.shields.io/badge/version-0.1--alpha-orange)
![Tests](https://img.shields.io/badge/tests-9%2F9%20passing-brightgreen)
![Dependencies](https://img.shields.io/badge/runtime%20deps-0-brightgreen)
![Rust](https://img.shields.io/badge/rust-1.75%2B-orange)
![Node](https://img.shields.io/badge/node-18%2B-green)
```

---

## For a Technical Talk / Presentation

### Title
**"Making Network Protocols Visible: Building a Protocol Observatory in Rust + Vanilla JS"**

### Abstract
Most developers treat the network as a black box. They know HTTP exists, they've heard of TCP, and they cargo-cult configuration they find on Stack Overflow. This talk walks through building NetLens — an open-source toolkit that makes protocols observable.

Three parts:
1. **Architecture decisions** — Why no framework? Why Rust? How do you enforce clean architecture with nothing but import rules and test assertions?
2. **The hard parts** — Parsing TLS SNI from raw bytes, implementing a WebSocket server in 80 lines of Rust, making anomaly detection rules extensible without an event system
3. **What I learned** — The difference between knowing a protocol and being able to explain it to a non-expert is larger than expected. Wireshark is not a learning tool.

### Key Takeaways
- Reducer patterns don't require Redux — they require discipline
- libpcap + Rust is genuinely approachable for application developers
- Architecture tests (asserting no circular imports, no DOM in core) catch design drift before it becomes technical debt
- "No framework" is a valid choice when the codebase IS the educational product

---

## Project Stats

| Metric | Value |
|--------|-------|
| Source files | 65 |
| Lines of JavaScript | ~5,900 |
| Lines of Rust | ~1,800 |
| Lines of CSS | ~1,700 |
| Test suites | 9 JS + 25 Rust unit tests |
| Test assertions | ~80 (JS) |
| npm runtime dependencies | 0 |
| Protocols simulated | 5 (TCP, DNS, TLS 1.3, HTTP/2, MQTT) |
| Assessment questions | 90 |
| Curriculum chapters | 30 |
| Rust binary size (release) | ~500 KB |
| Time to first render | < 100ms (no bundle to fetch) |

---

## Roadmap (for portfolio context)

The v0.1 alpha covers the core learning loop. The roadmap targets two gaps:

**v0.3 — Protocol Advisor**: A decision tree that recommends protocols based on constraints (latency, reliability, battery life, device count). The gap it fills: engineers cargo-cult protocol choices without understanding tradeoffs.

**v0.4 — Desktop app (Tauri)**: Removes the `sudo` requirement for capture by using macOS Network Extension. Target: install once, run as a normal user. This is the difference between a developer tool and a tool that non-developers can use.

**v1.0 — Multilingual**: French is the primary language today. Arabic and Chinese are the planned additions — targeting African and Asian engineering programs where English-only resources are a barrier.
