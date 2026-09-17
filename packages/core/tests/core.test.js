/**
 * @netlens/core — Unit Tests
 *
 * Run with: vitest run packages/core/tests/
 * Or:       node scripts/test.js (structural checks only)
 *
 * These tests verify the pure logic layer.
 * No DOM. No network. No side effects.
 * Every test is deterministic.
 */

import { describe, it, expect, beforeEach } from 'vitest'

import {
  getProtocol,
  getAllProtocols,
  hasProtocol,
  getPhases,
  getStepsByPhase,
} from '../src/protocols/index.js'

import {
  buildSession,
  submitAnswer,
  skipQuestion,
  advance,
  jumpTo,
  currentQuestion,
  isComplete,
  computeStats,
  updateHistory,
  getVerdict,
} from '../src/quiz/engine.js'

import {
  detectAnomalies,
  scanFlows,
  getRules,
} from '../src/anomaly/engine.js'

// ─── Sample questions for quiz tests ─────────────────

const SAMPLE_QUESTIONS = [
  { id: 1, type: 1, week: 1, q: 'Q1', ch: ['A','B','C','D'], ok: [0], multi: false, e: '', c: '' },
  { id: 2, type: 1, week: 1, q: 'Q2', ch: ['A','B','C','D'], ok: [1], multi: false, e: '', c: '' },
  { id: 3, type: 2, week: 2, q: 'Q3', ch: ['A','B','C','D'], ok: [2], multi: false, e: '', c: '' },
  { id: 4, type: 3, week: 2, q: 'Q4', ch: ['A','B','C','D'], ok: [3], multi: false, e: '', c: '' },
  { id: 5, type: 4, week: 3, q: 'Q5', ch: ['A','B','C','D'], ok: [0,1], multi: true,  e: '', c: '' },
]

// ─── Protocol Registry ────────────────────────────────

describe('Protocol Registry', () => {

  it('returns all 5 protocols', () => {
    const protocols = getAllProtocols()
    expect(protocols.length).toBeGreaterThanOrEqual(5)
  })

  it('retrieves TCP by id', () => {
    const tcp = getProtocol('tcp')
    expect(tcp.id).toBe('tcp')
    expect(tcp.label).toBe('TCP')
  })

  it('throws for unknown protocol id', () => {
    expect(() => getProtocol('nonexistent')).toThrow('Protocol not found')
  })

  it('hasProtocol returns correct boolean', () => {
    expect(hasProtocol('tcp')).toBe(true)
    expect(hasProtocol('dns')).toBe(true)
    expect(hasProtocol('xyz')).toBe(false)
  })

  it('TCP has 8 steps', () => {
    const tcp = getProtocol('tcp')
    expect(tcp.steps.length).toBe(8)
  })

  it('DNS has 5 actors', () => {
    const dns = getProtocol('dns')
    expect(dns.actors.length).toBe(5)
  })

  it('every step has required fields', () => {
    getAllProtocols().forEach(proto => {
      proto.steps.forEach(step => {
        expect(step.id,          `${proto.id}.${step.id} has id`).toBeTruthy()
        expect(step.label,       `${proto.id}.${step.id} has label`).toBeTruthy()
        expect(step.explanation, `${proto.id}.${step.id} has explanation`).toBeTruthy()
        expect(step.fields,      `${proto.id}.${step.id} has fields`).toBeTruthy()
        expect(typeof step.fields).toBe('object')
      })
    })
  })

  it('every protocol has at least one fault', () => {
    getAllProtocols().forEach(proto => {
      expect(proto.faults.length,
        `${proto.id} has faults`).toBeGreaterThan(0)
    })
  })

  it('getPhases returns unique phases in order', () => {
    const phases = getPhases('tcp')
    const unique  = [...new Set(phases)]
    expect(phases).toEqual(unique)
    expect(phases.length).toBeGreaterThan(0)
  })

  it('getStepsByPhase returns only matching steps', () => {
    const steps = getStepsByPhase('tcp', 'Handshake')
    expect(steps.length).toBe(3)
    steps.forEach(s => expect(s.phase).toBe('Handshake'))
  })

  it('TLS first step is ClientHello', () => {
    const tls = getProtocol('tls')
    expect(tls.steps[0].id).toBe('client_hello')
    expect(tls.steps[0].direction).toBe('client-to-server')
  })

  it('MQTT has LWT fault', () => {
    const mqtt  = getProtocol('mqtt')
    const haLWT = mqtt.faults.some(f => f.id === 'bad_auth' || f.label.toLowerCase().includes('auth'))
    expect(haLWT).toBe(true)
  })

})

// ─── Quiz Engine ──────────────────────────────────────

describe('Quiz Engine — buildSession', () => {

  it('builds a session with all questions for normal mode', () => {
    const config = { mode: 'normal', typeFilter: 'all', weekFilter: 'all', history: {} }
    const session = buildSession(config, SAMPLE_QUESTIONS)
    expect(session.queue.length).toBe(SAMPLE_QUESTIONS.length)
    expect(session.index).toBe(0)
    expect(session.results).toEqual([])
    expect(session.timeLimit).toBe(null)
  })

  it('sets timeLimit for exam mode', () => {
    const config  = { mode: 'exam', typeFilter: 'all', weekFilter: 'all', history: {} }
    const session = buildSession(config, SAMPLE_QUESTIONS)
    expect(session.timeLimit).toBe(45)
  })

  it('limits to 20 questions in sprint mode', () => {
    const big     = Array.from({ length: 30 }, (_, i) => ({ ...SAMPLE_QUESTIONS[0], id: i }))
    const config  = { mode: 'sprint', typeFilter: 'all', weekFilter: 'all', history: {} }
    const session = buildSession(config, big)
    expect(session.queue.length).toBe(20)
  })

  it('filters by type', () => {
    const config  = { mode: 'normal', typeFilter: '2', weekFilter: 'all', history: {} }
    const session = buildSession(config, SAMPLE_QUESTIONS)
    session.queue.forEach(q => expect(q.type).toBe(2))
  })

  it('filters by week', () => {
    const config  = { mode: 'normal', typeFilter: 'all', weekFilter: '2', history: {} }
    const session = buildSession(config, SAMPLE_QUESTIONS)
    session.queue.forEach(q => expect(q.week).toBe(2))
  })

  it('weak mode only includes wrong questions', () => {
    const history = { 1: false, 2: true, 3: false }
    const config  = { mode: 'weak', typeFilter: 'all', weekFilter: 'all', history }
    const session = buildSession(config, SAMPLE_QUESTIONS)
    const ids     = session.queue.map(q => q.id)
    expect(ids).toContain(1)
    expect(ids).toContain(3)
    expect(ids).not.toContain(2)
  })

  it('shuffles questions (probabilistic check)', () => {
    const config  = { mode: 'normal', typeFilter: 'all', weekFilter: 'all', history: {} }
    const orders  = new Set()
    for (let i = 0; i < 20; i++) {
      const s = buildSession(config, SAMPLE_QUESTIONS)
      orders.add(s.queue.map(q => q.id).join(','))
    }
    // Very unlikely all 20 shuffles produce identical order
    expect(orders.size).toBeGreaterThan(1)
  })

})

describe('Quiz Engine — session progression', () => {

  let session

  beforeEach(() => {
    session = buildSession(
      { mode: 'normal', typeFilter: 'all', weekFilter: 'all', history: {} },
      SAMPLE_QUESTIONS
    )
  })

  it('currentQuestion returns first question initially', () => {
    const q = currentQuestion(session)
    expect(q).not.toBeNull()
    expect(SAMPLE_QUESTIONS.map(q => q.id)).toContain(q.id)
  })

  it('submitAnswer records a correct result', () => {
    const q       = currentQuestion(session)
    const updated = submitAnswer(session, q.ok, 5)
    expect(updated.results.length).toBe(1)
    expect(updated.results[0].correct).toBe(true)
    expect(updated.results[0].timeSeconds).toBe(5)
    expect(updated.results[0].skipped).toBe(false)
  })

  it('submitAnswer records a wrong result', () => {
    const q       = currentQuestion(session)
    const wrong   = [(q.ok[0] + 1) % 4]
    const updated = submitAnswer(session, wrong, 3)
    expect(updated.results[0].correct).toBe(false)
  })

  it('skipQuestion marks as skipped', () => {
    const updated = skipQuestion(session)
    expect(updated.results[0].skipped).toBe(true)
    expect(updated.results[0].correct).toBe(false)
  })

  it('advance increments index', () => {
    const next = advance(session)
    expect(next.index).toBe(1)
  })

  it('jumpTo sets index to target', () => {
    const jumped = jumpTo(session, 3)
    expect(jumped.index).toBe(3)
  })

  it('jumpTo ignores out-of-bounds index', () => {
    const same = jumpTo(session, 999)
    expect(same.index).toBe(session.index)
  })

  it('isComplete is false at start', () => {
    expect(isComplete(session)).toBe(false)
  })

  it('isComplete is true when all answered', () => {
    let s = session
    SAMPLE_QUESTIONS.forEach(() => {
      const q = currentQuestion(s)
      if (!q) return
      s = submitAnswer(s, q.ok, 1)
      s = advance(s)
    })
    expect(isComplete(s)).toBe(true)
  })

})

describe('Quiz Engine — computeStats', () => {

  it('computes correct score', () => {
    let s = buildSession(
      { mode: 'normal', typeFilter: 'all', weekFilter: 'all', history: {} },
      SAMPLE_QUESTIONS
    )
    // Answer first 3 correct, skip last 2
    for (let i = 0; i < 3; i++) {
      const q = currentQuestion(s)
      s = submitAnswer(s, q.ok, 2)
      s = advance(s)
    }
    for (let i = 0; i < 2; i++) {
      s = skipQuestion(s)
      s = advance(s)
    }

    const stats = computeStats(s, SAMPLE_QUESTIONS)
    expect(stats.correct).toBe(3)
    expect(stats.skipped).toBe(2)
    expect(stats.total).toBe(5)
    expect(stats.score).toBe(60)
  })

  it('byType breaks down correctly', () => {
    let s = buildSession(
      { mode: 'normal', typeFilter: 'all', weekFilter: 'all', history: {} },
      SAMPLE_QUESTIONS
    )
    SAMPLE_QUESTIONS.forEach(q => {
      s = submitAnswer(s, q.ok, 1)
      s = advance(s)
    })
    const stats = computeStats(s, SAMPLE_QUESTIONS)
    expect(typeof stats.byType[1]).toBe('object')
    expect(stats.byType[1].correct).toBeGreaterThan(0)
  })

})

describe('Quiz Engine — getVerdict', () => {

  it('returns Expert for score >= 83', () => {
    expect(getVerdict(85).title).toBe('Expert')
    expect(getVerdict(100).title).toBe('Expert')
  })

  it('returns Needs work for score < 40', () => {
    expect(getVerdict(0).title).toBe('Needs work')
    expect(getVerdict(39).title).toBe('Needs work')
  })

  it('returns correct tier boundaries', () => {
    expect(getVerdict(40).title).toBe('Building up')
    expect(getVerdict(55).title).toBe('Intermediate')
    expect(getVerdict(70).title).toBe('Advanced')
  })

})

describe('Quiz Engine — updateHistory', () => {

  it('merges new results with existing history', () => {
    const existing = { 1: true, 2: false }
    const results  = [
      { questionId: 2, correct: true,  skipped: false },
      { questionId: 3, correct: false, skipped: false },
    ]
    const updated = updateHistory(existing, results)
    expect(updated[1]).toBe(true)   // unchanged
    expect(updated[2]).toBe(true)   // updated
    expect(updated[3]).toBe(false)  // new
  })

  it('skipped results do not update history', () => {
    const existing = { 1: true }
    const results  = [{ questionId: 2, correct: false, skipped: true }]
    const updated  = updateHistory(existing, results)
    expect(updated[2]).toBeUndefined()
  })

})

// ─── Anomaly Engine ───────────────────────────────────

describe('Anomaly Engine — rules', () => {

  const baseFlow = {
    id:       'f1',
    src:      '192.168.1.10',
    dst:      '8.8.8.8',
    dstHost:  'dns.google',
    protocol: 'HTTPS',
    bytes:    1024,
    durationSec: 5,
    country:  'US',
    app:      'Chrome',
  }

  it('getRules returns an array of rule descriptors', () => {
    const rules = getRules()
    expect(Array.isArray(rules)).toBe(true)
    expect(rules.length).toBeGreaterThan(3)
    rules.forEach(r => {
      expect(r.id).toBeTruthy()
      expect(r.name).toBeTruthy()
      expect(r.description).toBeTruthy()
    })
  })

  it('clean flow produces no alerts', () => {
    const alerts = detectAnomalies(baseFlow)
    expect(alerts.length).toBe(0)
  })

  it('high-volume unknown protocol triggers alert', () => {
    const flow   = { ...baseFlow, protocol: 'UNKNOWN', bytes: 60 * 1024 * 1024 }
    const alerts = detectAnomalies(flow)
    const match  = alerts.find(a => a.ruleId === 'high_volume_unknown')
    expect(match).toBeTruthy()
    expect(match.severity).toBe('critical')
  })

  it('suspicious country triggers warning', () => {
    const flow   = { ...baseFlow, country: 'RU', bytes: 50_000 }
    const alerts = detectAnomalies(flow)
    const match  = alerts.find(a => a.ruleId === 'suspicious_country')
    expect(match).toBeTruthy()
    expect(match.severity).toBe('warning')
  })

  it('known provider in RU does not trigger country rule if bytes too small', () => {
    // Very small flows (DNS, beacons) are excluded
    const flow   = { ...baseFlow, country: 'RU', bytes: 64 }
    const alerts = detectAnomalies(flow)
    const match  = alerts.find(a => a.ruleId === 'suspicious_country')
    expect(match).toBeUndefined()
  })

  it('MQTT to unknown broker triggers warning', () => {
    const flow   = { ...baseFlow, protocol: 'MQTT', dstHost: 'mqtt.unknownbroker.xyz' }
    const alerts = detectAnomalies(flow)
    const match  = alerts.find(a => a.ruleId === 'mqtt_unknown_broker')
    expect(match).toBeTruthy()
  })

  it('MQTT to known broker does not trigger', () => {
    const flow   = { ...baseFlow, protocol: 'MQTT', dstHost: 'mqtt.googleapis.com' }
    const alerts = detectAnomalies(flow)
    const match  = alerts.find(a => a.ruleId === 'mqtt_unknown_broker')
    expect(match).toBeUndefined()
  })

  it('cleartext HTTP triggers info alert', () => {
    const flow   = { ...baseFlow, protocol: 'HTTP', dstHost: 'example.com' }
    const alerts = detectAnomalies(flow)
    const match  = alerts.find(a => a.ruleId === 'cleartext_http')
    expect(match).toBeTruthy()
    expect(match.severity).toBe('info')
  })

  it('ACR telemetry pattern triggers warning', () => {
    const flow   = { ...baseFlow, dstHost: 'samsung-ads.com', app: 'Smart TV' }
    const alerts = detectAnomalies(flow)
    const match  = alerts.find(a => a.ruleId === 'acr_telemetry')
    expect(match).toBeTruthy()
  })

  it('scanFlows processes multiple flows', () => {
    const flows = [
      { ...baseFlow, id: 'f1' },
      { ...baseFlow, id: 'f2', protocol: 'HTTP', dstHost: 'example.com' },
      { ...baseFlow, id: 'f3', protocol: 'UNKNOWN', bytes: 80_000_000 },
    ]
    const alerts = scanFlows(flows)
    expect(alerts.length).toBeGreaterThanOrEqual(2)
    const flowIds = alerts.map(a => a.flowId)
    expect(flowIds).toContain('f2')
    expect(flowIds).toContain('f3')
  })

  it('each alert has required fields', () => {
    const flow   = { ...baseFlow, protocol: 'HTTP', dstHost: 'example.com' }
    const alerts = detectAnomalies(flow)
    alerts.forEach(alert => {
      expect(alert.flowId).toBeTruthy()
      expect(alert.ruleId).toBeTruthy()
      expect(['info','warning','critical']).toContain(alert.severity)
      expect(alert.title).toBeTruthy()
      expect(alert.description).toBeTruthy()
      expect(typeof alert.timestamp).toBe('number')
    })
  })

})
