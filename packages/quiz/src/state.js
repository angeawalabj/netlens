/**
 * Quiz State Manager
 *
 * Pure reducer pattern. All side effects (localStorage, timers)
 * are handled by controllers — never here.
 *
 * The state object is the single source of truth for the entire
 * quiz session. Given any state + action, the result is deterministic.
 */

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
} from '@netlens/core/quiz/engine.js'

import { QUESTIONS } from '@netlens/core/quiz/questions.js'

// ─── Action Types ─────────────────────────────────────

export const Actions = Object.freeze({
  // Configuration screen
  SET_MODE:        'SET_MODE',
  SET_TYPE_FILTER: 'SET_TYPE_FILTER',
  SET_WEEK_FILTER: 'SET_WEEK_FILTER',

  // Session lifecycle
  START_SESSION:   'START_SESSION',
  END_SESSION:     'END_SESSION',
  RESTART:         'RESTART',

  // During session
  TOGGLE_CHOICE:   'TOGGLE_CHOICE',
  VALIDATE:        'VALIDATE',
  SKIP:            'SKIP',
  NEXT:            'NEXT',
  JUMP_TO:         'JUMP_TO',

  // Timer
  TICK:            'TICK',
  TIMEOUT:         'TIMEOUT',
})

// ─── Screens ──────────────────────────────────────────

export const Screens = Object.freeze({
  START:    'START',
  QUESTION: 'QUESTION',
  RESULTS:  'RESULTS',
})

// ─── Initial State ────────────────────────────────────

/**
 * @param {Object} history - Persisted history {[questionId]: boolean}
 * @returns {QuizAppState}
 */
export function initialState(history = {}) {
  return {
    screen:     Screens.START,

    // Config (persisted across sessions)
    mode:       'normal',
    typeFilter: 'all',
    weekFilter: 'all',
    history,

    // Active session (null when on START or RESULTS screen)
    session:    null,

    // UI state during question
    selected:   [],       // chosen answer indices
    answered:   false,
    qStartTime: null,     // ms timestamp when question was shown
    timeLeft:   null,     // seconds remaining (exam mode)

    // Results (set after session ends)
    stats:      null,
    verdict:    null,
  }
}

// ─── Reducer ──────────────────────────────────────────

/**
 * @param {QuizAppState} state
 * @param {{ type: string, payload?: * }} action
 * @returns {QuizAppState}
 */
export function reduce(state, action) {
  switch (action.type) {

    // ── Config ──────────────────────────────────────
    case Actions.SET_MODE:
      return { ...state, mode: action.payload }

    case Actions.SET_TYPE_FILTER:
      return { ...state, typeFilter: action.payload }

    case Actions.SET_WEEK_FILTER:
      return { ...state, weekFilter: action.payload }

    // ── Session lifecycle ────────────────────────────
    case Actions.START_SESSION: {
      const session = buildSession(
        {
          mode:       state.mode,
          typeFilter: state.typeFilter,
          weekFilter: state.weekFilter,
          history:    state.history,
        },
        QUESTIONS
      )
      return {
        ...state,
        screen:     Screens.QUESTION,
        session,
        selected:   [],
        answered:   false,
        qStartTime: Date.now(),
        timeLeft:   session.timeLimit,
        stats:      null,
        verdict:    null,
      }
    }

    case Actions.END_SESSION: {
      if (!state.session) return state
      const stats   = computeStats(state.session, QUESTIONS)
      const verdict = getVerdict(stats.score)
      const history = updateHistory(state.history, state.session.results)
      return {
        ...state,
        screen:  Screens.RESULTS,
        stats,
        verdict,
        history,
      }
    }

    case Actions.RESTART:
      return {
        ...initialState(state.history),
        // Preserve config choices
        mode:       state.mode,
        typeFilter: state.typeFilter,
        weekFilter: state.weekFilter,
      }

    // ── During session ───────────────────────────────
    case Actions.TOGGLE_CHOICE: {
      if (state.answered) return state
      const q   = currentQuestion(state.session)
      if (!q) return state
      const idx = action.payload

      let selected
      if (q.multi) {
        selected = state.selected.includes(idx)
          ? state.selected.filter(i => i !== idx)
          : [...state.selected, idx]
      } else {
        selected = [idx]
      }
      return { ...state, selected }
    }

    case Actions.VALIDATE: {
      if (state.answered || state.selected.length === 0) return state
      if (!state.session) return state

      const elapsed = state.qStartTime
        ? Math.round((Date.now() - state.qStartTime) / 1000)
        : 0

      const session = submitAnswer(state.session, state.selected, elapsed)
      return { ...state, session, answered: true }
    }

    case Actions.SKIP: {
      if (!state.session) return state
      const session = skipQuestion(state.session)
      const next    = advance(session)

      if (isComplete(next)) {
        const stats   = computeStats(next, QUESTIONS)
        const verdict = getVerdict(stats.score)
        const history = updateHistory(state.history, next.results)
        return {
          ...state,
          session: next,
          screen:  Screens.RESULTS,
          stats,
          verdict,
          history,
        }
      }

      return {
        ...state,
        session:    next,
        selected:   [],
        answered:   false,
        qStartTime: Date.now(),
        timeLeft:   next.timeLimit,
      }
    }

    case Actions.NEXT: {
      if (!state.session || !state.answered) return state
      const next = advance(state.session)

      if (isComplete(next)) {
        const stats   = computeStats(next, QUESTIONS)
        const verdict = getVerdict(stats.score)
        const history = updateHistory(state.history, next.results)
        return {
          ...state,
          session: next,
          screen:  Screens.RESULTS,
          stats,
          verdict,
          history,
        }
      }

      return {
        ...state,
        session:    next,
        selected:   [],
        answered:   false,
        qStartTime: Date.now(),
        timeLeft:   next.timeLimit,
      }
    }

    case Actions.JUMP_TO: {
      if (!state.session) return state
      const session = jumpTo(state.session, action.payload)
      return {
        ...state,
        session,
        selected:   [],
        answered:   false,
        qStartTime: Date.now(),
        timeLeft:   session.timeLimit,
      }
    }

    // ── Timer ────────────────────────────────────────
    case Actions.TICK:
      if (state.timeLeft === null || state.answered) return state
      return { ...state, timeLeft: Math.max(0, state.timeLeft - 1) }

    case Actions.TIMEOUT:
      if (state.answered) return state
      return reduce(state, { type: Actions.SKIP })

    default:
      return state
  }
}

// ─── Selectors ────────────────────────────────────────

export const Selectors = {

  /** @param {QuizAppState} state */
  currentQuestion: state =>
    state.session ? currentQuestion(state.session) : null,

  /** @param {QuizAppState} state */
  progress: state => {
    if (!state.session) return 0
    const total = state.session.queue.length
    return total ? state.session.index / total : 0
  },

  /** @param {QuizAppState} state */
  score: state =>
    state.session?.results.filter(r => r.correct).length ?? 0,

  /** @param {QuizAppState} state */
  weakCount: state => {
    return Object.values(state.history).filter(v => !v).length
  },

  /** @param {QuizAppState} state */
  canValidate: state =>
    !state.answered && state.selected.length > 0,

  /** @param {QuizAppState} state */
  lastResult: state => {
    if (!state.session || !state.answered) return null
    const q = currentQuestion(state.session)
    return state.session.results.find(r => r.questionId === q?.id) ?? null
  },

  /** @param {QuizAppState} state */
  timerClass: state => {
    if (state.timeLeft === null) return ''
    if (state.timeLeft <= 10)   return 'timer--alarm'
    if (state.timeLeft <= 20)   return 'timer--warn'
    return ''
  },
}
