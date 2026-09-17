/**
 * Quiz — Main Entry Point
 *
 * Wires store, controllers, and rendering together.
 * All DOM event bindings live here — thin and declarative.
 */

import { initialState, reduce, Actions, Screens } from './state.js'
import { createTimerController }                  from './controllers/timer.js'
import { loadHistory, saveHistory, countWeak }    from './controllers/persistence.js'
import { render }                                  from './views/render.js'

// ─── Store ────────────────────────────────────────────

let _state = initialState(loadHistory())

function getState() { return _state }

function dispatch(action) {
  const next = reduce(_state, action)
  if (next === _state) return
  _state = next

  // Persist history whenever it changes
  if (_state.history !== getState().history || action.type === Actions.NEXT) {
    saveHistory(_state.history)
  }

  timer.onStateChange(_state)
  render(_state)
}

// ─── Controllers ──────────────────────────────────────

const timer = createTimerController(dispatch)

// ─── DOM Event Delegation ─────────────────────────────
// Single listener on document — handles all interactions.
// Each button declares its intent via data-action attribute.

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]')
  if (!target) return

  const action  = target.dataset.action
  const payload = target.dataset.payload

  switch (action) {
    case 'set-mode':
      dispatch({ type: Actions.SET_MODE, payload })
      break

    case 'set-type-filter':
      dispatch({ type: Actions.SET_TYPE_FILTER, payload })
      break

    case 'set-week-filter':
      dispatch({ type: Actions.SET_WEEK_FILTER, payload })
      break

    case 'start':
      dispatch({ type: Actions.START_SESSION })
      if (_state.session?.timeLimit) timer.start()
      break

    case 'toggle-choice':
      dispatch({ type: Actions.TOGGLE_CHOICE, payload: parseInt(payload, 10) })
      break

    case 'validate':
      dispatch({ type: Actions.VALIDATE })
      timer.stop()
      break

    case 'next':
      dispatch({ type: Actions.NEXT })
      if (_state.screen === Screens.QUESTION && _state.session?.timeLimit) {
        timer.start()
      }
      break

    case 'skip':
      dispatch({ type: Actions.SKIP })
      if (_state.session?.timeLimit) timer.start()
      break

    case 'jump':
      dispatch({ type: Actions.JUMP_TO, payload: parseInt(payload, 10) })
      if (_state.session?.timeLimit) timer.start()
      break

    case 'restart':
      timer.stop()
      dispatch({ type: Actions.RESTART })
      break

    case 'review-wrong':
      timer.stop()
      dispatch({ type: Actions.RESTART })
      dispatch({ type: Actions.SET_MODE, payload: 'weak' })
      dispatch({ type: Actions.START_SESSION })
      if (_state.session?.timeLimit) timer.start()
      break

    case 'go-start':
      timer.stop()
      dispatch({ type: Actions.RESTART })
      break
  }
})

// ─── Keyboard shortcuts ───────────────────────────────

document.addEventListener('keydown', event => {
  if (event.target.closest('input, textarea, select')) return
  if (_state.screen !== Screens.QUESTION) return

  switch (event.key) {
    case 'Enter':
      if (!_state.answered && _state.selected.length > 0) {
        dispatch({ type: Actions.VALIDATE })
        timer.stop()
      } else if (_state.answered) {
        dispatch({ type: Actions.NEXT })
        if (_state.session?.timeLimit) timer.start()
      }
      break

    case ' ':
      event.preventDefault()
      if (!_state.answered) {
        dispatch({ type: Actions.SKIP })
        if (_state.session?.timeLimit) timer.start()
      }
      break

    default:
      // A–E keys select choices
      if (event.key >= 'a' && event.key <= 'e') {
        const idx = event.key.charCodeAt(0) - 97 // a=0, b=1...
        dispatch({ type: Actions.TOGGLE_CHOICE, payload: idx })
      }
      break
  }
})

// ─── Initial render ───────────────────────────────────

render(_state)

// ─── Cleanup ──────────────────────────────────────────

window.addEventListener('beforeunload', () => {
  timer.destroy()
  saveHistory(_state.history)
})
