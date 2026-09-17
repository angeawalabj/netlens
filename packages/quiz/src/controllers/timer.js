/**
 * Timer Controller
 *
 * Manages the countdown timer in exam mode.
 * Single Responsibility: tick every second, dispatch TICK or TIMEOUT.
 *
 * Does not touch the DOM. Does not modify state directly.
 * Pure side-effect controller — drives the store via dispatch.
 */

import { Actions } from '../state.js'

/**
 * Create a timer controller.
 *
 * @param {function} dispatch
 * @returns {{ start: function, stop: function, destroy: function }}
 */
export function createTimerController(dispatch) {
  let intervalId = null

  /**
   * Start the countdown.
   * Call once when a new timed question is shown.
   */
  function start() {
    stop()
    intervalId = setInterval(() => {
      dispatch({ type: Actions.TICK })
    }, 1000)
  }

  /**
   * Stop the countdown.
   */
  function stop() {
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  /**
   * React to state changes.
   * Call after every dispatch.
   *
   * @param {import('../state.js').QuizAppState} state
   */
  function onStateChange(state) {
    // Stop timer when answered or no time limit
    if (state.answered || state.timeLeft === null) {
      stop()
      return
    }

    // Dispatch timeout when timer hits zero
    if (state.timeLeft === 0) {
      stop()
      dispatch({ type: Actions.TIMEOUT })
    }
  }

  function destroy() {
    stop()
  }

  return { start, stop, onStateChange, destroy }
}
