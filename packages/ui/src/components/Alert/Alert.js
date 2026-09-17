/**
 * Alert Component — rendu d'un item d'alerte
 */
import { createElement } from '../dom.js'

const SEV_CLASS = {
  critical: 'severity-badge--critical',
  warning:  'severity-badge--warning',
  info:     'severity-badge--info',
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.container
 * @param {function=}   opts.onSelect - appelé avec flowId au clic
 */
export function Alert({ container, onSelect }) {

  function renderOne({ severity, title, description, timestamp, flowId }) {
    const item = createElement('div', {
      className: `alert-item alert-item--${severity}`,
    })
    if (flowId && onSelect) {
      item.style.cursor = 'pointer'
      item.addEventListener('click', () => onSelect(flowId))
    }

    const top = createElement('div', { className: 'alert-item__top' })
    top.appendChild(createElement('span', {
      className:   `severity-badge ${SEV_CLASS[severity] || SEV_CLASS.info}`,
      textContent: severity.toUpperCase(),
    }))
    top.appendChild(createElement('span', {
      className:   'alert-item__time font-mono',
      textContent: formatTimestamp(timestamp),
    }))
    item.appendChild(top)
    item.appendChild(createElement('div', {
      className: 'alert-item__title', textContent: title,
    }))
    item.appendChild(createElement('div', {
      className: 'alert-item__desc font-mono', textContent: description,
    }))
    return item
  }

  /**
   * Vider et re-rendre toute la liste
   * @param {object[]} alerts
   */
  function render(alerts) {
    container.innerHTML = ''
    if (!alerts.length) {
      container.appendChild(renderOne({
        severity:    'info',
        title:       'No alerts',
        description: 'All connections within expected parameters.',
        timestamp:   Date.now(),
      }))
      return
    }
    alerts.slice(0, 15).forEach(a => container.appendChild(renderOne(a)))
  }

  function clear() { container.innerHTML = '' }

  return { render, clear }
}

function formatTimestamp(ts) {
  const d = new Date(ts)
  return [
    d.getHours().toString().padStart(2, '0'),
    d.getMinutes().toString().padStart(2, '0'),
    d.getSeconds().toString().padStart(2, '0'),
  ].join(':')
}
