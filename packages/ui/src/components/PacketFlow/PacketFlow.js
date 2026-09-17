/**
 * PacketFlow Component
 *
 * Renders a protocol exchange diagram.
 * Single Responsibility: draw actors and packet arrows.
 *
 * This component knows NOTHING about specific protocols.
 * It receives generic step data and renders it.
 * TCP, DNS, MQTT — all the same to this component.
 *
 * @module PacketFlow
 */

import { createElement, formatProtocolColor } from '../dom.js'

// ─── CSS ──────────────────────────────────────────────
// Injected once on first mount
let styleInjected = false

function injectStyles() {
  if (styleInjected) return
  styleInjected = true

  const style = document.createElement('style')
  style.textContent = `
    .pf-actors {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding: 0 60px 16px;
      position: relative;
    }
    .pf-actor {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }
    .pf-actor__chip {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      font-weight: var(--weight-medium);
      padding: 5px 14px;
      border-radius: var(--radius-sm);
      border: 1px solid;
      letter-spacing: var(--tracking-wide);
    }
    .pf-actor__addr {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-3);
    }
    .pf-steps {
      padding: 0 24px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .pf-step {
      display: flex;
      align-items: center;
      height: 44px;
      border-radius: var(--radius);
      cursor: pointer;
      transition: background var(--transition-fast);
      position: relative;
    }
    .pf-step:hover,
    .pf-step--active {
      background: rgba(255,255,255,0.03);
    }
    .pf-step--active {
      background: rgba(59,130,246,0.05);
    }
    .pf-step__index {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-3);
      width: 32px;
      text-align: right;
      flex-shrink: 0;
      padding-right: 8px;
    }
    .pf-step--active .pf-step__index {
      color: var(--color-accent-light);
    }
    .pf-step__wire {
      flex: 1;
      position: relative;
      height: 44px;
    }
    .pf-wire-line {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      height: 1px;
      transition: background var(--transition-normal);
    }
    .pf-wire-arrow {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      font-size: 9px;
      transition: color var(--transition-normal);
    }
    .pf-packet-pill {
      position: absolute;
      top: 50%;
      transform: translateY(-50%) translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      pointer-events: none;
    }
    .pf-packet-pill__label {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      font-weight: var(--weight-bold);
      padding: 3px 10px;
      border-radius: 20px;
      border: 1px solid;
      white-space: nowrap;
      letter-spacing: var(--tracking-wide);
      transition: all var(--transition-normal);
    }
    .pf-packet-pill__sub {
      font-family: var(--font-mono);
      font-size: 9px;
      color: var(--text-3);
      white-space: nowrap;
    }
    .pf-step__phase {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-3);
      width: 100px;
      flex-shrink: 0;
      text-align: right;
      padding-right: 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `
  document.head.appendChild(style)
}

// ─── Actor color map ──────────────────────────────────

const ACTOR_COLORS = {
  client:   { border: 'rgba(59,130,246,.4)',  color: '#93c5fd', bg: 'rgba(59,130,246,.06)'  },
  server:   { border: 'rgba(34,197,94,.4)',   color: '#86efac', bg: 'rgba(34,197,94,.06)'   },
  broker:   { border: 'rgba(249,115,22,.4)',  color: '#fdba74', bg: 'rgba(249,115,22,.06)'  },
  resolver: { border: 'rgba(59,130,246,.3)',  color: '#93c5fd', bg: 'rgba(59,130,246,.04)'  },
  root:     { border: 'rgba(239,68,68,.3)',   color: '#fca5a5', bg: 'rgba(239,68,68,.04)'   },
  tld:      { border: 'rgba(245,158,11,.3)',  color: '#fde68a', bg: 'rgba(245,158,11,.04)'  },
  auth:     { border: 'rgba(168,85,247,.3)',  color: '#c4b5fd', bg: 'rgba(168,85,247,.04)'  },
}

function actorStyle(actorId) {
  return ACTOR_COLORS[actorId] || {
    border: 'rgba(255,255,255,.1)', color: 'var(--text-2)', bg: 'rgba(255,255,255,.03)',
  }
}

// ─── Position helpers ─────────────────────────────────

/**
 * Compute the X position (%) of an actor within the flow area.
 * @param {string}   actorId
 * @param {import('@netlens/core/protocols').ProtocolActor[]} actors
 * @returns {number} 0–100
 */
function actorXPercent(actorId, actors) {
  const index = actors.findIndex(a => a.id === actorId)
  if (index < 0) return 50
  if (actors.length === 1) return 50
  return 8 + (index / (actors.length - 1)) * 84
}

// ─── Component ───────────────────────────────────────

/**
 * Create a PacketFlow component.
 *
 * @param {object} options
 * @param {HTMLElement} options.container - Mount target
 * @param {function(number): void} options.onStepClick - Called with step index
 * @returns {{ render: function, destroy: function }}
 */
export function PacketFlow({ container, onStepClick }) {
  injectStyles()

  // Internal state
  let _actors  = []
  let _steps   = []
  let _current = -1
  let _fault   = null

  // DOM structure
  const actorsRow = createElement('div', { className: 'pf-actors' })
  const stepsRow  = createElement('div', { className: 'pf-steps'  })
  container.appendChild(actorsRow)
  container.appendChild(stepsRow)

  // ── Render actors ────────────────────────────────────
  function renderActors() {
    actorsRow.innerHTML = ''
    _actors.forEach(actor => {
      const style = actorStyle(actor.id)
      const chip = createElement('div', {
        className: 'pf-actor__chip',
        style:     `border-color:${style.border};color:${style.color};background:${style.bg}`,
        textContent: actor.label,
      })
      const addr = createElement('div', {
        className:   'pf-actor__addr',
        textContent: actor.address,
      })
      const wrap = createElement('div', { className: 'pf-actor' })
      wrap.appendChild(chip)
      wrap.appendChild(addr)
      actorsRow.appendChild(wrap)
    })
  }

  // ── Render steps ─────────────────────────────────────
  function renderSteps() {
    stepsRow.innerHTML = ''

    _steps.forEach((step, i) => {
      const done   = i < _current
      const active = i === _current
      const isFault = _fault?.targetStep === i

      const fromX = actorXPercent(step.fromActor, _actors)
      const toX   = actorXPercent(step.toActor,   _actors)
      const midX  = (fromX + toX) / 2

      const lineLeft  = Math.min(fromX, toX)
      const lineWidth = Math.abs(toX - fromX)

      const rawColor  = isFault ? 'var(--color-danger)' : step.color
      const opacity   = done ? 0.5 : active ? 1 : 0.3
      const lineColor = (done || active) ? rawColor : 'var(--border)'

      const label = isFault
        ? (_fault?.label ?? 'FAULT')
        : step.label

      const labelBg = active
        ? `${step.color}18`
        : 'transparent'

      // Row
      const row = createElement('div', {
        className: [
          'pf-step',
          active ? 'pf-step--active' : '',
          done   ? 'pf-step--done'   : '',
        ].filter(Boolean).join(' '),
        style: `opacity:${opacity}`,
      })
      row.addEventListener('click', () => onStepClick?.(i))

      // Index
      row.appendChild(createElement('div', {
        className:   'pf-step__index',
        textContent: String(i + 1),
      }))

      // Wire
      const wire = createElement('div', { className: 'pf-step__wire' })

      // Horizontal line
      const line = createElement('div', {
        className: 'pf-wire-line',
        style: `left:${lineLeft}%;width:${lineWidth}%;background:${lineColor}`,
      })
      wire.appendChild(line)

      // Arrowhead
      const isRTL = toX < fromX
      const arrow = createElement('div', {
        className:   'pf-wire-arrow',
        textContent: '▶',
        style: [
          `color:${lineColor}`,
          `${isRTL ? 'left' : 'right'}:${isRTL ? toX : (100 - toX)}%`,
          isRTL ? 'transform:translateY(-50%) scaleX(-1)' : 'transform:translateY(-50%)',
        ].join(';'),
      })
      wire.appendChild(arrow)

      // Packet pill
      const pill = createElement('div', {
        className: 'pf-packet-pill',
        style:     `left:${midX}%`,
      })
      const pillLabel = createElement('div', {
        className:   `pf-packet-pill__label${isFault ? ' pf-packet-pill__label--fault' : ''}`,
        textContent: label,
        style: [
          `color:${(done || active) ? rawColor : 'var(--text-3)'}`,
          `border-color:${(done || active) ? rawColor : 'var(--border)'}`,
          `background:${active ? labelBg : 'transparent'}`,
        ].join(';'),
      })
      const pillSub = createElement('div', {
        className:   'pf-packet-pill__sub',
        textContent: step.sublabel,
      })
      pill.appendChild(pillLabel)
      pill.appendChild(pillSub)
      wire.appendChild(pill)

      row.appendChild(wire)

      // Phase label
      row.appendChild(createElement('div', {
        className:   'pf-step__phase',
        textContent: step.phase,
      }))

      stepsRow.appendChild(row)
    })
  }

  // ── Public API ────────────────────────────────────────

  /**
   * Update the component with new data.
   * @param {object} props
   * @param {import('@netlens/core/protocols').ProtocolActor[]} props.actors
   * @param {import('@netlens/core/protocols').ProtocolStep[]}  props.steps
   * @param {number}                                            props.currentStep
   * @param {object|null}                                       props.activeFault
   */
  function render({ actors, steps, currentStep, activeFault }) {
    const actorsChanged = actors !== _actors
    _actors  = actors
    _steps   = steps
    _current = currentStep
    _fault   = activeFault

    if (actorsChanged) renderActors()
    renderSteps()
  }

  function destroy() {
    actorsRow.remove()
    stepsRow.remove()
  }

  return { render, destroy }
}
