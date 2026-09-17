/**
 * Playback Controller
 *
 * Manages the auto-play timer.
 * Single Responsibility: advance steps automatically at a given speed.
 *
 * Does not touch the DOM.
 * Does not know about rendering.
 * Receives a dispatch function, calls it on each tick.
 */

import { Actions, Selectors } from '../state.js'

/**
 * Create a playback controller.
 *
 * @param {function} getState  - Returns current SandboxState
 * @param {function} dispatch  - Dispatches an action
 * @returns {{ start: function, stop: function, destroy: function }}
 */
export function createPlaybackController(getState, dispatch) {
  let timerId = null

  /**
   * Schedule the next step tick.
   * Uses the current state speed at time of tick — so speed
   * changes take effect on the next tick automatically.
   */
  function scheduleTick() {
    const state = getState()
    if (!state.isPlaying) return

    timerId = setTimeout(() => {
      const current = getState()
      if (!current.isPlaying) return

      if (Selectors.isComplete(current)) {
        dispatch({ type: Actions.PAUSE })
        return
      }

      dispatch({ type: Actions.NEXT_STEP })

      // Check again after dispatch (state may have changed)
      if (!Selectors.isComplete(getState())) {
        scheduleTick()
      }
    }, state.speedMs)
  }

  /**
   * Start playback. Idempotent — safe to call if already playing.
   */
  function start() {
    stop() // Clear any existing timer first
    dispatch({ type: Actions.PLAY })
    scheduleTick()
  }

  /**
   * Stop playback.
   */
  function stop() {
    clearTimeout(timerId)
    timerId = null
  }

  /**
   * Handle state change — stop timer if state says not playing.
   * Call this whenever state changes.
   * @param {object} state
   */
  function onStateChange(state) {
    if (!state.isPlaying && timerId !== null) {
      stop()
    }
  }

  /**
   * Clean up timer on component unmount.
   */
  function destroy() {
    stop()
  }

  return { start, stop, onStateChange, destroy }
}
