/**
 * Sandbox State Manager
 *
 * Implements a strict reducer pattern.
 * State is immutable — every action returns a new state object.
 *
 * Rule: the UI never modifies state directly.
 *       It dispatches an action, receives a new state, re-renders.
 *
 * This makes the application fully predictable and testable:
 * given state S and action A, the result is always the same.
 */

import { getAllProtocols } from '@netlens/core/protocols'

// ─── Initial State ────────────────────────────────────

/**
 * @returns {SandboxState}
 */
export function initialState() {
  const protocols = getAllProtocols()
  return {
    // Protocol selection
    protocolId:   protocols[0]?.id ?? 'tcp',

    // Playback
    currentStep:  -1,
    isPlaying:    false,
    speedMs:      1000,

    // Fault injection
    faultMode:    false,
    activeFault:  null,
  }
}

/**
 * @typedef {Object} SandboxState
 * @property {string}      protocolId
 * @property {number}      currentStep   - -1 = before start
 * @property {boolean}     isPlaying
 * @property {number}      speedMs
 * @property {boolean}     faultMode
 * @property {object|null} activeFault
 */

// ─── Action Types ─────────────────────────────────────

export const Actions = Object.freeze({
  SELECT_PROTOCOL: 'SELECT_PROTOCOL',
  GO_TO_STEP:      'GO_TO_STEP',
  NEXT_STEP:       'NEXT_STEP',
  PREV_STEP:       'PREV_STEP',
  PLAY:            'PLAY',
  PAUSE:           'PAUSE',
  RESET:           'RESET',
  SET_SPEED:       'SET_SPEED',
  TOGGLE_FAULTS:   'TOGGLE_FAULTS',
  INJECT_FAULT:    'INJECT_FAULT',
  CLEAR_FAULT:     'CLEAR_FAULT',
})

// ─── Reducer ──────────────────────────────────────────

/**
 * Pure state transition function.
 * @param {SandboxState} state
 * @param {{ type: string, payload?: * }} action
 * @returns {SandboxState}
 */
export function reduce(state, action) {
  switch (action.type) {

    case Actions.SELECT_PROTOCOL:
      return {
        ...initialState(),
        protocolId: action.payload,
        speedMs:    state.speedMs,
        faultMode:  state.faultMode,
      }

    case Actions.GO_TO_STEP:
      return {
        ...state,
        currentStep: action.payload,
        isPlaying:   false,
      }

    case Actions.NEXT_STEP: {
      const proto   = getProtocolById(state.protocolId)
      const maxStep = proto ? proto.steps.length - 1 : 0
      const next    = Math.min(state.currentStep + 1, maxStep)
      return {
        ...state,
        currentStep: next,
        isPlaying:   next < maxStep ? state.isPlaying : false,
      }
    }

    case Actions.PREV_STEP:
      return {
        ...state,
        currentStep: Math.max(state.currentStep - 1, 0),
        isPlaying:   false,
      }

    case Actions.PLAY:
      return {
        ...state,
        isPlaying:   true,
        currentStep: state.currentStep === getMaxStep(state.protocolId)
          ? -1
          : state.currentStep,
      }

    case Actions.PAUSE:
      return { ...state, isPlaying: false }

    case Actions.RESET:
      return {
        ...initialState(),
        protocolId: state.protocolId,
        speedMs:    state.speedMs,
        faultMode:  state.faultMode,
      }

    case Actions.SET_SPEED:
      return { ...state, speedMs: action.payload }

    case Actions.TOGGLE_FAULTS:
      return {
        ...state,
        faultMode:   !state.faultMode,
        activeFault: null,
      }

    case Actions.INJECT_FAULT: {
      const proto  = getProtocolById(state.protocolId)
      const fault  = proto?.faults.find(f => f.id === action.payload)
      if (!fault) return state
      // Toggle off if same fault clicked again
      if (state.activeFault?.id === fault.id) {
        return { ...state, activeFault: null }
      }
      return {
        ...state,
        activeFault: fault,
        currentStep: fault.targetStep,
        isPlaying:   false,
      }
    }

    case Actions.CLEAR_FAULT:
      return { ...state, activeFault: null }

    default:
      return state
  }
}

// ─── Selectors ────────────────────────────────────────

/**
 * Derive computed values from state.
 * Selectors are pure functions — no side effects.
 */

export const Selectors = {

  /** @param {SandboxState} state */
  protocol: state => getProtocolById(state.protocolId),

  /** @param {SandboxState} state */
  currentStep: state => {
    const proto = getProtocolById(state.protocolId)
    return proto?.steps[state.currentStep] ?? null
  },

  /** @param {SandboxState} state */
  phases: state => {
    const proto = getProtocolById(state.protocolId)
    if (!proto) return []
    return [...new Set(proto.steps.map(s => s.phase))]
  },

  /** @param {SandboxState} state */
  currentPhase: state => {
    const step = Selectors.currentStep(state)
    return step?.phase ?? null
  },

  /** @param {SandboxState} state */
  progress: state => {
    const proto = getProtocolById(state.protocolId)
    if (!proto || proto.steps.length === 0) return 0
    return Math.max(0, (state.currentStep + 1) / proto.steps.length)
  },

  /** @param {SandboxState} state */
  canGoNext: state => {
    const proto = getProtocolById(state.protocolId)
    return proto ? state.currentStep < proto.steps.length - 1 : false
  },

  /** @param {SandboxState} state */
  canGoPrev: state => state.currentStep > 0,

  /** @param {SandboxState} state */
  isComplete: state => {
    const proto = getProtocolById(state.protocolId)
    return proto ? state.currentStep >= proto.steps.length - 1 : false
  },
}

// ─── Helpers ──────────────────────────────────────────

function getProtocolById(id) {
  return getAllProtocols().find(p => p.id === id) ?? null
}

function getMaxStep(protocolId) {
  const proto = getProtocolById(protocolId)
  return proto ? proto.steps.length - 1 : 0
}
