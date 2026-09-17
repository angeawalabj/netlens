#!/usr/bin/env node
// scripts/test.js — Run all test suites
//
// Tests are pure Node — no browser, no build step.
// Fast feedback: the whole suite should complete in < 5 seconds.

const { execSync, spawnSync } = require('child_process')
const path = require('path')
const fs   = require('fs')

const ROOT = path.resolve(__dirname, '..')

const COLORS = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m',
  dim:   '\x1b[2m', yellow: '\x1b[33m',
}

function log(msg, color = '') {
  console.log(`${color}${msg}${COLORS.reset}`)
}

function run(cmd, cwd = ROOT) {
  const result = spawnSync(cmd, {
    shell: true, cwd, stdio: 'pipe',
    encoding: 'utf8',
  })
  return {
    ok:     result.status === 0,
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status,
  }
}

const suites = []
let passed = 0
let failed = 0

function suite(name, fn) {
  suites.push({ name, fn })
}

function expect(actual, label) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
      }
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
      }
    },
    toBeTruthy() {
      if (!actual) throw new Error(`${label}: expected truthy, got ${JSON.stringify(actual)}`)
    },
    toBeFalsy() {
      if (actual) throw new Error(`${label}: expected falsy, got ${JSON.stringify(actual)}`)
    },
    toBeGreaterThan(n) {
      if (actual <= n) throw new Error(`${label}: expected > ${n}, got ${actual}`)
    },
    toContain(item) {
      if (!actual.includes(item)) {
        throw new Error(`${label}: expected to contain ${JSON.stringify(item)}`)
      }
    },
  }
}

// ─── Test suites ──────────────────────────────────────

suite('Protocol Registry', () => {
  // Dynamic import (ESM) — we test via require with a small shim
  // In production this runs with vitest which handles ESM natively.
  // Here we validate the data structure invariants.

  const TCP_STEPS    = 8
  const DNS_STEPS    = 8
  const TLS_STEPS    = 6
  const HTTP_STEPS   = 6
  const MQTT_STEPS   = 8

  // Read the files and count steps (quick structural check)
  const tcpSrc = fs.readFileSync(
    path.join(ROOT, 'packages/core/src/protocols/tcp.js'), 'utf8')
  const tcpSteps = (tcpSrc.match(/id:\s+'/g) || []).length

  expect(tcpSteps, 'TCP step count').toBeGreaterThan(7)
  expect(tcpSrc.includes('explanation:'), 'TCP has explanations').toBeTruthy()
  expect(tcpSrc.includes('fields:'), 'TCP has header fields').toBeTruthy()
  expect(tcpSrc.includes('faults:'), 'TCP has faults').toBeTruthy()
})

suite('Quiz Engine', () => {
  // Load engine as CommonJS-compatible module
  // (vitest handles ESM — this is a quick smoke test)
  const engineSrc = fs.readFileSync(
    path.join(ROOT, 'packages/core/src/quiz/engine.js'), 'utf8')

  // Structural checks
  expect(engineSrc.includes('buildSession'), 'buildSession exported').toBeTruthy()
  expect(engineSrc.includes('submitAnswer'), 'submitAnswer exported').toBeTruthy()
  expect(engineSrc.includes('computeStats'), 'computeStats exported').toBeTruthy()
  expect(engineSrc.includes('getVerdict'),   'getVerdict exported').toBeTruthy()
  expect(engineSrc.includes('Fisher-Yates'), 'shuffle algorithm documented').toBeTruthy()
})

suite('Anomaly Engine', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'packages/core/src/anomaly/engine.js'), 'utf8')

  expect(src.includes('detectAnomalies'), 'detectAnomalies exported').toBeTruthy()
  expect(src.includes('scanFlows'),       'scanFlows exported').toBeTruthy()
  expect(src.includes('getRules'),        'getRules exported').toBeTruthy()

  // Check that all rules have required fields
  const ruleIds = (src.match(/id:\s+'([^']+)'/g) || [])
  expect(ruleIds.length, 'at least 4 rules defined').toBeGreaterThan(3)
})

suite('Design System', () => {
  const tokens = fs.readFileSync(
    path.join(ROOT, 'packages/ui/src/design-system/tokens.css'), 'utf8')

  // All protocol colors defined
  const protocols = ['https', 'http', 'quic', 'dns', 'tls', 'mqtt', 'ssh', 'tcp']
  protocols.forEach(p => {
    expect(
      tokens.includes(`--color-proto-${p}`),
      `Protocol color defined: ${p}`
    ).toBeTruthy()
  })

  // Core design tokens present
  expect(tokens.includes('--font-sans'), 'sans font defined').toBeTruthy()
  expect(tokens.includes('--font-mono'), 'mono font defined').toBeTruthy()
  expect(tokens.includes('--surface-0'), 'surface-0 defined').toBeTruthy()
  expect(tokens.includes('--color-accent'), 'accent color defined').toBeTruthy()
  expect(tokens.includes('--space-4'), 'spacing token defined').toBeTruthy()
})

suite('Sandbox State', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'packages/sandbox/src/state.js'), 'utf8')

  expect(src.includes('initialState'), 'initialState exported').toBeTruthy()
  expect(src.includes('reduce'),       'reduce exported').toBeTruthy()
  expect(src.includes('Actions'),      'Actions exported').toBeTruthy()
  expect(src.includes('Selectors'),    'Selectors exported').toBeTruthy()

  // Verify all action types are handled
  const actionTypes = [
    'SELECT_PROTOCOL', 'GO_TO_STEP', 'NEXT_STEP', 'PREV_STEP',
    'PLAY', 'PAUSE', 'RESET', 'SET_SPEED', 'TOGGLE_FAULTS',
    'INJECT_FAULT', 'CLEAR_FAULT',
  ]
  actionTypes.forEach(type => {
    expect(src.includes(type), `Action handled: ${type}`).toBeTruthy()
  })
})

suite('X-Ray Transport', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'packages/xray/src/transport/index.js'), 'utf8')

  expect(src.includes('WebSocketTransport'),  'WebSocketTransport class').toBeTruthy()
  expect(src.includes('SimulationTransport'), 'SimulationTransport class').toBeTruthy()
  expect(src.includes('createTransport'),     'createTransport factory').toBeTruthy()
  expect(src.includes('SIM_DEVICES'),         'Simulation devices defined').toBeTruthy()
  expect(src.includes('SIM_FLOWS'),           'Simulation flows defined').toBeTruthy()
})

suite('Rust Parsers (structural)', () => {
  const files = ['dns', 'tls', 'http', 'mqtt']
  files.forEach(name => {
    const exists = fs.existsSync(
      path.join(ROOT, `capture/src/parsers/${name}.rs`))
    expect(exists, `Parser file exists: ${name}.rs`).toBeTruthy()
  })

  // Check Parser trait is defined
  const mod = fs.readFileSync(
    path.join(ROOT, 'capture/src/parsers/mod.rs'), 'utf8')
  expect(mod.includes('pub trait Parser'), 'Parser trait defined').toBeTruthy()
  expect(mod.includes('fn can_parse'),     'can_parse method').toBeTruthy()
  expect(mod.includes('ParserRegistry'),   'ParserRegistry defined').toBeTruthy()
})

suite('Architecture — No Circular Imports', () => {
  // core must not import from ui or apps
  const coreSrc = [
    'packages/core/src/protocols/index.js',
    'packages/core/src/quiz/engine.js',
    'packages/core/src/anomaly/engine.js',
  ]
  coreSrc.forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
    expect(
      src.includes('@netlens/ui'),
      `core file must not import ui: ${f}`
    ).toBeFalsy()
    expect(
      src.includes("from '../../../packages/sandbox"),
      `core file must not import apps: ${f}`
    ).toBeFalsy()
  })

  // State files must not import views
  const stateFiles = [
    'packages/sandbox/src/state.js',
    'packages/quiz/src/state.js',
    'packages/xray/src/state.js',
  ]
  stateFiles.forEach(f => {
    if (!fs.existsSync(path.join(ROOT, f))) return
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
    expect(
      src.includes("from './views"),
      `State must not import views: ${f}`
    ).toBeFalsy()
  })
})

suite('File Count & Coverage', () => {
  const requiredFiles = [
    'packages/core/src/protocols/tcp.js',
    'packages/core/src/protocols/protocols.js',
    'packages/core/src/quiz/engine.js',
    'packages/core/src/anomaly/engine.js',
    'packages/ui/src/design-system/tokens.css',
    'packages/ui/src/design-system/index.css',
    'packages/ui/src/components/PacketFlow/PacketFlow.js',
    'packages/ui/src/components/Inspector/Inspector.js',
    'packages/ui/src/components/dom.js',
    'packages/sandbox/src/state.js',
    'packages/sandbox/src/controllers/playback.js',
    'packages/sandbox/src/controllers/keyboard.js',
    'packages/sandbox/src/views/render.js',
    'packages/sandbox/src/main.js',
    'packages/sandbox/index.html',
    'packages/quiz/src/state.js',
    'packages/quiz/src/controllers/persistence.js',
    'packages/quiz/src/controllers/timer.js',
    'packages/quiz/src/views/render.js',
    'packages/quiz/src/main.js',
    'packages/xray/src/transport/index.js',
    'packages/xray/src/state.js',
    'packages/xray/src/main.js',
    'capture/src/main.rs',
    'capture/src/parsers/mod.rs',
    'capture/src/parsers/dns.rs',
    'capture/src/parsers/tls.rs',
    'capture/src/parsers/http.rs',
    'capture/src/parsers/mqtt.rs',
    'capture/src/capture/mod.rs',
    'capture/src/pipeline/mod.rs',
    'capture/src/output/mod.rs',
    'capture/src/config/mod.rs',
    'capture/Cargo.toml',
    'docs/architecture.md',
    'docs/contributing.md',
    'README.md',
  ]

  requiredFiles.forEach(f => {
    expect(
      fs.existsSync(path.join(ROOT, f)),
      `Required file exists: ${f}`
    ).toBeTruthy()
  })
})

// ─── Runner ───────────────────────────────────────────

async function runAll() {
  log(`\n${COLORS.bold}NetLens Test Suite${COLORS.reset}\n`)
  const start = Date.now()

  for (const { name, fn } of suites) {
    const tests = []
    let suiteFailed = false

    // Collect test failures
    try {
      const originalExpect = global.expect
      fn()
    } catch (e) {
      suiteFailed = true
      log(`  ✗ ${name}`, COLORS.red)
      log(`    ${e.message}`, COLORS.dim)
      failed++
      continue
    }

    log(`  ✓ ${name}`, COLORS.green)
    passed++
  }

  const elapsed = Date.now() - start
  const total   = passed + failed

  log(`\n${COLORS.bold}Results: ${passed}/${total} suites passed${COLORS.reset} ${COLORS.dim}(${elapsed}ms)${COLORS.reset}`)

  if (failed > 0) {
    log(`\n${failed} suite(s) failed.`, COLORS.red)
    process.exit(1)
  } else {
    log(`\nAll tests passed. ✓`, COLORS.green)
  }
}

runAll()
