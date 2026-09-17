/**
 * Keyboard Controller
 *
 * Maps keyboard events to sandbox actions.
 * Single Responsibility: translate keyboard input to dispatched actions.
 *
 * No DOM rendering. No state management. Pure event mapping.
 */

import { Actions } from '../state.js'
import { getAllProtocols } from '@netlens/core/protocols'

/**
 * @typedef {Object} KeyboardController
 * @property {function} destroy - Remove event listeners
 */

/**
 * Create a keyboard controller.
 *
 * @param {function} dispatch       - Action dispatcher
 * @param {function} togglePlay     - Toggle play/pause
 * @returns {KeyboardController}
 */
export function createKeyboardController(dispatch, togglePlay) {
  const protocols = getAllProtocols()

  /**
   * @param {KeyboardEvent} event
   */
  function handleKeydown(event) {
    // Do not intercept when user is typing in an input
    if (isTyping(event.target)) return

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault()
        dispatch({ type: Actions.NEXT_STEP })
        break

      case 'ArrowLeft':
        event.preventDefault()
        dispatch({ type: Actions.PREV_STEP })
        break

      case ' ':
        event.preventDefault()
        togglePlay()
        break

      case 'r':
      case 'R':
        dispatch({ type: Actions.RESET })
        break

      case 'f':
      case 'F':
        dispatch({ type: Actions.TOGGLE_FAULTS })
        break

      case 'Escape':
        dispatch({ type: Actions.CLEAR_FAULT })
        dispatch({ type: Actions.PAUSE })
        break

      default:
        // Number keys 1–9 → select protocol by position
        if (event.key >= '1' && event.key <= '9') {
          const index = parseInt(event.key, 10) - 1
          const proto = protocols[index]
          if (proto) {
            dispatch({ type: Actions.SELECT_PROTOCOL, payload: proto.id })
          }
        }
        break
    }
  }

  document.addEventListener('keydown', handleKeydown)

  function destroy() {
    document.removeEventListener('keydown', handleKeydown)
  }

  return { destroy }
}

/**
 * Check if the user is currently typing in a form element.
 * @param {EventTarget} target
 * @returns {boolean}
 */
function isTyping(target) {
  if (!(target instanceof Element)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' ||
         target.isContentEditable
}
