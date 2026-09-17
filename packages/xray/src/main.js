/**
 * X-Ray — Entry Point
 *
 * Assemble transport + store + render.
 * Ce fichier ne contient AUCUNE logique de rendu DOM.
 * Tout le rendu est dans views/render.js.
 *
 * Flux : transport.onMessage → dispatch → reduce → render(state)
 */

import { initialState, reduce, Actions } from './state.js'
import { createTransport }               from './transport/index.js'
import { render, drawTimeline }          from './views/render.js'

// ─── Store minimal ────────────────────────────────────

let _state = initialState()

function dispatch(action) {
  const next = reduce(_state, action)
  if (next === _state) return
  _state = next
  render(_state)
  drawTimeline(_state)
}

// ─── Transport ────────────────────────────────────────

// Détecte si un backend Rust est disponible
// Fallback automatique vers la simulation
const WS_URL = new URLSearchParams(window.location.search).get('ws')
              || 'ws://localhost:8765'

const transport = createTransport(
  // Passer mode='live' + url si ?ws= est dans l'URL
  window.location.search.includes('ws=')
    ? { mode: 'live', url: WS_URL }
    : { mode: 'simulation' }
)

transport.onMessage(msg => {
  switch (msg.type) {
    case 'Status':
      dispatch({ type: Actions.WS_STATUS,   payload: msg.status })
      break
    case 'DeviceList':
      dispatch({ type: Actions.DEVICE_LIST, payload: msg.devices })
      break
    case 'FlowUpdate':
      dispatch({ type: Actions.FLOW_UPDATE, payload: msg.flows })
      break
    case 'BandwidthSample':
      dispatch({ type: Actions.BW_SAMPLE,
        payload: { mbpsDown: msg.mbpsDown, mbpsUp: msg.mbpsUp } })
      break
    case 'Alert':
      dispatch({ type: Actions.ALERT, payload: msg })
      break
  }
})

transport.start()

// ─── Événements DOM ───────────────────────────────────

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]')
  if (!target) return

  const { action, payload } = target.dataset

  switch (action) {
    case 'select-device':
      dispatch({ type: Actions.SELECT_DEVICE,  payload }) ; break
    case 'select-flow':
      dispatch({ type: Actions.SELECT_FLOW,    payload }) ; break
    case 'toggle-pause':
      dispatch({ type: Actions.TOGGLE_PAUSE })            ; break
    case 'toggle-alerts':
      dispatch({ type: Actions.TOGGLE_ALERTS })           ; break
    case 'toggle-suspect':
      dispatch({ type: Actions.TOGGLE_SUSPECT })          ; break
    case 'sort':
      dispatch({ type: Actions.SET_SORT,       payload }) ; break
    case 'clear-alerts':
      dispatch({ type: Actions.CLEAR_ALERTS })            ; break
  }
})

window.addEventListener('resize', () => drawTimeline(_state))

// ─── Rendu initial ────────────────────────────────────

render(_state)
drawTimeline(_state)

// ─── Nettoyage ────────────────────────────────────────

window.addEventListener('beforeunload', () => transport.stop())
