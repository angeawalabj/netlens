# NetLens

**Understand what happens on your network — from the first SYN to the last ACK.**

NetLens is an open-source toolkit for learning and observing network protocols.
It combines an interactive protocol simulator, a live traffic dashboard,
and a structured 30-day curriculum into a single coherent project.

No account. No install for the learning tools. Open the HTML file, start learning.

---

## What's inside

| Module | What it does |
|--------|-------------|
| **Protocol Sandbox** | Step through TCP, DNS, TLS, HTTP/2, and MQTT exchanges packet by packet. Inject faults. Inspect every header field. |
| **Network X-Ray** | Live traffic dashboard. See every flow, device, and protocol. Anomaly detection flags suspicious connections. |
| **Assessment** | 90 questions across five cognitive levels — recall, analysis, troubleshooting, packet inspection, architecture decisions. |
| **Curriculum** | 30 chapters in Markdown. Starts from OSI, ends with Wireshark. Covers everything in between. |
| **Capture Engine** | Rust backend. Captures live packets via libpcap, streams JSON events over WebSocket to the dashboard. |

---

## Quick start

### Learning tools (no install)

```bash
git clone https://github.com/netlens/netlens
cd netlens

# Open any tool directly in your browser
open packages/sandbox/index.html   # Protocol Sandbox
open packages/quiz/index.html      # Assessment
```

Or start the dev server for the full experience with cross-package imports:

```bash
node --version   # Requires Node.js >= 18
npm install
npm run dev

# Opens:
#   http://localhost:3000  →  Hub
#   http://localhost:3001  →  Sandbox
#   http://localhost:3002  →  Quiz
#   http://localhost:3003  →  X-Ray (simulation mode)
```

### Live capture (requires Rust + libpcap)

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install libpcap
# Ubuntu/Debian:  sudo apt install libpcap-dev
# macOS:          xcode-select --install
# Windows:        Install Npcap from https://npcap.com

# Build
cd capture
cargo build --release

# Grant capability (Linux — avoids running as root)
sudo setcap cap_net_raw,cap_net_admin=eip ./target/release/netlens-capture

# Run
./target/release/netlens-capture

# Open the dashboard — it connects automatically
open ../packages/xray/index.html
```

---

## Project structure

```
netlens/
├── packages/
│   ├── core/       Pure business logic — protocols, quiz engine, anomaly rules
│   ├── ui/         Design system + reusable components
│   ├── sandbox/    Protocol simulator
│   ├── quiz/       Assessment application
│   ├── xray/       Network traffic dashboard
│   └── hub/        Landing page
├── capture/        Rust packet capture backend
├── curriculum/     30-day course in Markdown
│   └── fr/         French (primary)
└── docs/           Architecture and contribution guides
```

The codebase follows strict separation of concerns:

```
@netlens/core           ← Pure logic. No DOM. Testable in Node.
@netlens/ui             ← Components. No business logic.
packages/*/src/state.js ← Application state. No rendering.
packages/*/src/views/   ← Rendering only. No state mutation.
```

See `docs/architecture.md` for the full explanation.

---

## The 30-day curriculum

Four weeks, one concept at a time:

| Week | Topics |
|------|--------|
| 1 — Foundations | OSI model, TCP/IP, Ethernet, ARP, IPv4/v6, ICMP |
| 2 — Transport & Security | TCP mechanics, UDP, TLS 1.3, congestion control |
| 3 — Web Protocols | HTTP/1.1→/3, QUIC, DNS, WebSocket, WebRTC |
| 4 — Infrastructure & IoT | SSH, SFTP, SMTP, IMAP, MQTT, LoRaWAN, Wireshark |

For each protocol, three questions:
1. What problem does it solve?
2. Is it stateful or stateless?
3. What does its header look like?

Chapters are in `curriculum/fr/`. Plain Markdown — editable by anyone.

---

## Assessment

90 questions in five types:

| Type | What it tests |
|------|--------------|
| 1 — Recall | Protocol definitions and standards |
| 2 — Analysis | Why protocols behave as they do |
| 3 — Troubleshoot | Diagnose a real problem from symptoms |
| 4 — Packets | Read and interpret Wireshark output |
| 5 — Decisions | Choose the right protocol for a given context |

Four modes: Full assessment, Timed exam (45s/question), Weak spots only, Sprint (20 questions).

---

## Protocol Sandbox

Five protocols fully simulated with interactive packet inspection:

- **TCP** — 8 steps: three-way handshake, data transfer, graceful teardown
- **DNS** — 8 steps: full recursive resolution through root → TLD → authoritative
- **TLS 1.3** — 6 steps: 1-RTT handshake with ECDHE and certificate chain
- **HTTP/1.1 → HTTP/2** — 6 steps: HOL blocking vs. stream multiplexing
- **MQTT** — 8 steps: pub/sub with broker, QoS, LWT, keepalive

Fault injection for each protocol:
drop packets, inject RST, return NXDOMAIN, expire certificates, simulate auth failures.

Adding a protocol requires one new file in `packages/core/src/protocols/`.

---

## Capture Engine

The Rust backend captures live traffic and streams JSON events to the X-Ray dashboard over WebSocket. It is completely optional — the dashboard runs in simulation mode without it.

Anomaly detection rules (in `capture/src/pipeline/mod.rs`):

- High-volume transfer to unclassified protocol
- MQTT to non-standard broker port
- Cleartext HTTP with sensitive path keywords
- Traffic to a watched destination prefix (`--watch-prefix`, off by default)

Adding a detection rule is one function in the rules section.
Adding a protocol parser is one file implementing the `Parser` trait.

---

## Contributing

Read `docs/contributing.md` before opening a pull request.

The short version:
- No npm runtime dependencies
- No hardcoded colors, sizes, or protocol data outside of `@netlens/core`
- Every new detection rule needs a test
- Explanations must be readable by someone without a networking background

```bash
npm test   # Run all tests (pure Node, ~2 seconds)
```

---

## Roadmap

| Version | Focus |
|---------|-------|
| v0.1 (current) | Protocol Sandbox, Assessment, X-Ray simulation, Curriculum |
| v0.2 | QUIC protocol simulation, HTTP/3 steps, quiz keyboard shortcuts |
| v0.3 | Protocol Advisor (decision tree), PCAP export, Wireshark import |
| v0.4 | Desktop app (Tauri), native capture without sudo, macOS Network Extension |
| v1.0 | Multilingual curriculum (EN, AR, ZH), plugin SDK, community protocols |

---

## License

Apache 2.0 — free to use, modify, and distribute, including commercially.
Attribution required.

---

*Built to make the invisible visible.*
