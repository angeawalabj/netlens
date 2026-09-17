/**
 * Sandbox — Main Entry Point
 *
 * Assembles controllers, state, and rendering into a working application.
 * This is the only file that knows about all the other modules.
 *
 * Dependency flow (strict — no cycles allowed):
 *
 *   @netlens/core  ←  state.js
 *   state.js       ←  controllers/*
 *   state.js       ←  views/render.js
 *   controllers/*  ←  main.js
 *   views/*        ←  main.js
 *   main.js        (top of tree — imports everything, exports nothing)
 *
 * Rule: if module A imports module B, B must not import A.
 */

import { initialState, reduce, Actions } from './state.js'
import { createPlaybackController } from './controllers/playback.js'
import { createKeyboardController } from './controllers/keyboard.js'
import { mount, render }            from './views/render.js'

// ─── Store ────────────────────────────────────────────
// Simple store — holds state, notifies subscribers on change.
// Not a framework. Exactly the complexity we need, nothing more.

let _state      = initialState()
const listeners = new Set()

function getState() {
  return _state
}

function dispatch(action) {
  const next = reduce(_state, action)
  if (next === _state) return  // No change — skip render
  _state = next
  notify()
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify() {
  for (const fn of listeners) fn(_state)
}

// ─── Boot ─────────────────────────────────────────────

function togglePlay() {
  if (getState().isPlaying) {
    dispatch({ type: Actions.PAUSE })
    playback.stop()
  } else {
    playback.start()
  }
}

// Playback controller
const playback = createPlaybackController(getState, dispatch)

// Keyboard controller
const keyboard = createKeyboardController(dispatch, togglePlay)

// Mount UI components and wire event handlers
mount({
  onStepClick: (index) => dispatch({ type: Actions.GO_TO_STEP, payload: index }),
  onFaultClick:(id)    => dispatch({ type: Actions.INJECT_FAULT, payload: id }),
})

// Subscribe render to state changes
subscribe(state => {
  playback.onStateChange(state)
  render(state)
})

// ─── DOM Event Wiring ─────────────────────────────────
// These are the only direct DOM event bindings in the app.
// They all delegate to dispatch() — keeping event handling thin.

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]')
  if (!target) return

  const action  = target.dataset.action
  const payload = target.dataset.payload

  switch (action) {
    case 'select-proto':
      dispatch({ type: Actions.SELECT_PROTOCOL, payload })
      break
    case 'play':
      togglePlay()
      break
    case 'next':
      dispatch({ type: Actions.NEXT_STEP })
      break
    case 'prev':
      dispatch({ type: Actions.PREV_STEP })
      break
    case 'reset':
      playback.stop()
      dispatch({ type: Actions.RESET })
      break
    case 'set-speed':
      dispatch({ type: Actions.SET_SPEED, payload: parseInt(payload, 10) })
      break
    case 'toggle-faults':
      dispatch({ type: Actions.TOGGLE_FAULTS })
      break
  }
})

// ─── Initial render ───────────────────────────────────

render(_state)

// ─── Cleanup on page unload ───────────────────────────

window.addEventListener('beforeunload', () => {
  playback.destroy()
  keyboard.destroy()
})
