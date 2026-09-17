/**
 * X-Ray — Filter Controller
 *
 * Gère les actions UI de filtrage et de tri.
 * Single Responsibility : traduire les interactions utilisateur en actions.
 *
 * Ne touche pas au DOM, ne modifie pas l'état directement.
 */

import { Actions } from '../state.js'

/**
 * @param {function} dispatch
 */
export function createFilterController(dispatch) {
  return {
    toggleAlertsOnly:  ()    => dispatch({ type: Actions.TOGGLE_ALERTS }),
    toggleSuspectDevs: ()    => dispatch({ type: Actions.TOGGLE_SUSPECT }),
    setSort:           col   => dispatch({ type: Actions.SET_SORT,      payload: col }),
    selectDevice:      id    => dispatch({ type: Actions.SELECT_DEVICE, payload: id }),
    selectFlow:        id    => dispatch({ type: Actions.SELECT_FLOW,   payload: id }),
    clearAlerts:       ()    => dispatch({ type: Actions.CLEAR_ALERTS }),
    togglePause:       ()    => dispatch({ type: Actions.TOGGLE_PAUSE }),
  }
}
