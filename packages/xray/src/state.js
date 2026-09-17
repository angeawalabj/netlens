/**
 * X-Ray — State Manager
 *
 * Manages all dashboard state.
 * Transport events → dispatch → reduce → render.
 */

import { detectAnomalies } from '@netlens/core/anomaly/engine.js'

// ─── Initial state ────────────────────────────────────

export function initialState() {
  return {
    // Data
    devices:     [],
    flows:       [],
    alerts:      [],

    // Bandwidth
    mbpsDown:    0,
    mbpsUp:      0,
    peakDown:    0,
    peakUp:      0,
    totalBytes:  0,
    tlHistory:   Array(60).fill({ down: 0, up: 0, alert: false }),
    downSpark:   Array(40).fill(0),
    upSpark:     Array(40).fill(0),

    // Transport
    wsStatus:    'disconnected',

    // UI filters
    selectedDevice:   null,
    selectedFlow:     null,
    showAlertsOnly:   false,
    showSuspectDevs:  false,
    sortBy:           'bytes',
    paused:           false,
  }
}

// ─── Actions ──────────────────────────────────────────

export const Actions = Object.freeze({
  // Transport events
  WS_STATUS:      'WS_STATUS',
  DEVICE_LIST:    'DEVICE_LIST',
  FLOW_UPDATE:    'FLOW_UPDATE',
  BW_SAMPLE:      'BW_SAMPLE',
  ALERT:          'ALERT',

  // UI
  SELECT_DEVICE:  'SELECT_DEVICE',
  SELECT_FLOW:    'SELECT_FLOW',
  TOGGLE_PAUSE:   'TOGGLE_PAUSE',
  TOGGLE_ALERTS:  'TOGGLE_ALERTS',
  TOGGLE_SUSPECT: 'TOGGLE_SUSPECT',
  SET_SORT:       'SET_SORT',
  CLEAR_ALERTS:   'CLEAR_ALERTS',
})

// ─── Reducer ──────────────────────────────────────────

export function reduce(state, action) {
  switch (action.type) {

    case Actions.WS_STATUS:
      return { ...state, wsStatus: action.payload }

    case Actions.DEVICE_LIST:
      return { ...state, devices: action.payload }

    case Actions.FLOW_UPDATE: {
      if (state.paused) return state
      const flows  = action.payload
      // Run anomaly detection on each flow
      const alerts = flows.flatMap(f => detectAnomalies(f, flows))
      return {
        ...state,
        flows,
        alerts: [...alerts, ...state.alerts].slice(0, 50),
      }
    }

    case Actions.BW_SAMPLE: {
      if (state.paused) return state
      const { mbpsDown, mbpsUp } = action.payload
      const tlEntry = {
        down:  mbpsDown,
        up:    mbpsUp,
        alert: state.flows.some(f => f.suspect),
      }
      return {
        ...state,
        mbpsDown,
        mbpsUp,
        peakDown:   Math.max(state.peakDown, mbpsDown),
        peakUp:     Math.max(state.peakUp,   mbpsUp),
        totalBytes: state.totalBytes + Math.round(mbpsDown * 125_000 / 5),
        tlHistory:  [...state.tlHistory.slice(1), tlEntry],
        downSpark:  [...state.downSpark.slice(1), mbpsDown],
        upSpark:    [...state.upSpark.slice(1), mbpsUp],
      }
    }

    case Actions.ALERT: {
      if (state.paused) return state
      return {
        ...state,
        alerts: [action.payload, ...state.alerts].slice(0, 50),
      }
    }

    case Actions.SELECT_DEVICE:
      return {
        ...state,
        selectedDevice: state.selectedDevice === action.payload ? null : action.payload,
        selectedFlow:   null,
      }

    case Actions.SELECT_FLOW:
      return {
        ...state,
        selectedFlow: state.selectedFlow === action.payload ? null : action.payload,
      }

    case Actions.TOGGLE_PAUSE:
      return { ...state, paused: !state.paused }

    case Actions.TOGGLE_ALERTS:
      return { ...state, showAlertsOnly: !state.showAlertsOnly }

    case Actions.TOGGLE_SUSPECT:
      return { ...state, showSuspectDevs: !state.showSuspectDevs }

    case Actions.SET_SORT:
      return { ...state, sortBy: action.payload }

    case Actions.CLEAR_ALERTS:
      return { ...state, alerts: [] }

    default:
      return state
  }
}

// ─── Selectors ────────────────────────────────────────

export const Selectors = {

  visibleFlows: state => {
    let flows = state.flows
    if (state.showAlertsOnly) flows = flows.filter(f => f.suspect)
    if (state.selectedDevice) {
      const dev = state.devices.find(d => d.id === state.selectedDevice)
      if (dev) flows = flows.filter(f => f.src === dev.ip || f.dst === dev.ip)
    }
    return sortFlows(flows, state.sortBy)
  },

  visibleDevices: state => {
    if (state.showSuspectDevs) return state.devices.filter(d => d.suspect)
    return state.devices
  },

  activeAlerts: state =>
    state.flows.filter(f => f.suspect).length,

  tlsCoverage: state => {
    const active    = state.flows.length
    const encrypted = state.flows.filter(f =>
      ['HTTPS','TLS','QUIC'].includes(f.proto)
    ).length
    return active ? Math.round((encrypted / active) * 100) : 0
  },

  dnsPerMin: state =>
    state.flows.filter(f => f.proto === 'DNS').length * 2,

  protoDistribution: state => {
    const map = {}
    state.flows.forEach(f => { map[f.proto] = (map[f.proto] || 0) + 1 })
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([proto, count]) => ({
        proto,
        count,
        pct: Math.round((count / Math.max(1, state.flows.length)) * 100),
      }))
  },
}

function sortFlows(flows, by) {
  const sorted = [...flows].sort((a, b) => {
    switch (by) {
      case 'bytes':   return b.bytes - a.bytes
      case 'proto':   return a.proto.localeCompare(b.proto)
      case 'dst':     return (a.host || a.dst).localeCompare(b.host || b.dst)
      case 'country': return a.country.localeCompare(b.country)
      case 'duration':return b.duration - a.duration
      default:        return 0
    }
  })
  // Suspects always float to top
  return sorted.sort((a, b) => (b.suspect ? 1 : 0) - (a.suspect ? 1 : 0))
}
