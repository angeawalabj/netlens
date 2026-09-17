/**
 * Inspector Component
 *
 * Displays header fields and explanation for a selected protocol step.
 * Single Responsibility: render packet details from data.
 *
 * Knows nothing about which protocol it is displaying.
 * Receives a step object, renders its fields.
 */

import { createElement, clearChildren } from '../dom.js'

let styleInjected = false

function injectStyles() {
  if (styleInjected) return
  styleInjected = true
  const style = document.createElement('style')
  style.textContent = `
    .inspector__empty {
      display:         flex;
      flex-direction:  column;
      align-items:     center;
      justify-content: center;
      height:          100%;
      gap:             12px;
      padding:         24px;
      text-align:      center;
    }
    .inspector__empty-icon {
      width:            36px;
      height:           36px;
      border-radius:    50%;
      border:           1px solid var(--border);
      display:          flex;
      align-items:      center;
      justify-content:  center;
      font-size:        14px;
      color:            var(--text-3);
    }
    .inspector__empty-text {
      font-size:   var(--text-sm);
      color:       var(--text-3);
      line-height: var(--leading-relaxed);
    }
    .inspector__header {
      padding:       var(--space-4) var(--space-4) var(--space-3);
      border-bottom: 1px solid var(--border);
      flex-shrink:   0;
    }
    .inspector__packet-name {
      font-family:     var(--font-mono);
      font-size:       var(--text-xl);
      font-weight:     var(--weight-semibold);
      color:           var(--text-1);
      margin-bottom:   4px;
      letter-spacing:  var(--tracking-tight);
    }
    .inspector__packet-sub {
      font-family: var(--font-mono);
      font-size:   var(--text-xs);
      color:       var(--text-3);
    }
    .inspector__phase-tag {
      display:         inline-flex;
      margin-top:      8px;
      font-family:     var(--font-mono);
      font-size:       var(--text-xs);
      font-weight:     var(--weight-medium);
      padding:         2px 8px;
      border-radius:   var(--radius-sm);
      letter-spacing:  var(--tracking-wide);
    }
    .inspector__explanation {
      padding:      var(--space-3) var(--space-4);
      font-size:    var(--text-sm);
      color:        var(--text-2);
      line-height:  var(--leading-relaxed);
      border-bottom:1px solid var(--border);
      border-left:  2px solid var(--color-accent);
    }
    .inspector__explanation--fault {
      border-left-color: var(--color-danger);
    }
    .inspector__fields-heading {
      font-family:     var(--font-mono);
      font-size:       9px;
      color:           var(--text-3);
      letter-spacing:  var(--tracking-widest);
      text-transform:  uppercase;
      padding:         var(--space-2) var(--space-4) var(--space-1);
    }
    .inspector__field {
      display:       grid;
      grid-template-columns: 44% 1fr;
      gap:           var(--space-2);
      padding:       5px var(--space-4);
      border-bottom: 1px solid rgba(255,255,255,0.025);
      transition:    background var(--transition-fast);
    }
    .inspector__field:hover {
      background: rgba(255,255,255,0.02);
    }
    .inspector__field:last-child {
      border-bottom: none;
    }
    .inspector__field-key {
      font-family: var(--font-mono);
      font-size:   var(--text-xs);
      color:       var(--text-3);
      word-break:  break-word;
    }
    .inspector__field-value {
      font-family: var(--font-mono);
      font-size:   var(--text-xs);
      color:       var(--text-2);
      word-break:  break-all;
      line-height: var(--leading-snug);
    }
    .inspector__field-value--highlight {
      color: var(--color-accent-light);
    }
    .inspector__field-value--success {
      color: var(--color-success-light);
    }
    .inspector__fault-section {
      border-top: 1px solid var(--border);
      padding:    var(--space-3) var(--space-4);
    }
    .inspector__fault-heading {
      font-family:    var(--font-mono);
      font-size:      var(--text-xs);
      color:          var(--color-danger-light);
      letter-spacing: var(--tracking-wide);
      text-transform: uppercase;
      margin-bottom:  var(--space-2);
      display:        flex;
      align-items:    center;
      gap:            var(--space-1);
    }
    .inspector__fault-btn {
      display:       flex;
      align-items:   center;
      gap:           var(--space-2);
      width:         100%;
      padding:       6px 10px;
      margin-bottom: var(--space-1);
      border-radius: var(--radius-sm);
      border:        1px solid rgba(239,68,68,0.15);
      background:    none;
      color:         var(--color-danger-light);
      font-family:   var(--font-mono);
      font-size:     var(--text-xs);
      text-align:    left;
      transition:    all var(--transition-fast);
    }
    .inspector__fault-btn:hover {
      background:    var(--color-danger-bg);
      border-color:  rgba(239,68,68,0.4);
    }
    .inspector__fault-btn--active {
      background:    var(--color-danger-bg);
      border-color:  var(--color-danger);
      font-weight:   var(--weight-medium);
    }
    .inspector__fault-effect {
      font-family:   var(--font-mono);
      font-size:     10px;
      color:         var(--color-warning-light);
      padding:       4px 10px 8px;
      line-height:   var(--leading-normal);
    }
    .inspector__fault-btn-step {
      margin-left: auto;
      font-size:   9px;
      opacity:     0.5;
    }
  `
  document.head.appendChild(style)
}

// ─────────────────────────────────────────────────────

/**
 * Determine value CSS class based on content.
 * Special prefix characters signal semantic meaning.
 * @param {string} value
 * @returns {string}
 */
function valueClass(value) {
  const v = String(value)
  if (v.startsWith('⚡') || v.startsWith('🔐')) return 'inspector__field-value--highlight'
  if (v.includes('Success') || v.startsWith('1 ') || v.includes('Active')) {
    return 'inspector__field-value--success'
  }
  return ''
}

// ─────────────────────────────────────────────────────

/**
 * Create an Inspector component.
 *
 * @param {object} options
 * @param {HTMLElement} options.container   - Mount target
 * @param {HTMLElement} options.titleEl     - Element to update with protocol name
 * @param {function}    options.onFaultClick - Called with faultId
 * @returns {{ render: function }}
 */
export function Inspector({ container, titleEl, onFaultClick }) {
  injectStyles()

  let _step        = null
  let _faults      = []
  let _activeFault = null
  let _faultMode   = false

  function renderEmpty() {
    clearChildren(container)
    if (titleEl) titleEl.textContent = ''

    const wrap = createElement('div', { className: 'inspector__empty' })
    wrap.appendChild(createElement('div', {
      className:   'inspector__empty-icon',
      textContent: '⬡',
    }))
    wrap.appendChild(createElement('div', {
      className:   'inspector__empty-text',
      innerHTML:   'Select a step<br>to inspect its headers',
    }))
    container.appendChild(wrap)
  }

  function renderStep() {
    clearChildren(container)

    const step     = _step
    const isFault  = _activeFault !== null
    const color    = isFault ? 'var(--color-danger)' : step.color

    if (titleEl) titleEl.textContent = step.label

    // ── Header ────────────────────────────────────────
    const header = createElement('div', { className: 'inspector__header' })

    header.appendChild(createElement('div', {
      className:   'inspector__packet-name',
      textContent: isFault ? '⚡ ' + _activeFault.label : step.label,
      style:       `color:${color}`,
    }))
    header.appendChild(createElement('div', {
      className:   'inspector__packet-sub',
      textContent: step.sublabel,
    }))

    const phaseTag = createElement('div', {
      className:   'inspector__phase-tag',
      textContent: step.phase,
      style:       `background:${color}18;color:${color};border:1px solid ${color}44`,
    })
    header.appendChild(phaseTag)
    container.appendChild(header)

    // ── Explanation ───────────────────────────────────
    const expl = createElement('div', {
      className: 'inspector__explanation' +
                 (isFault ? ' inspector__explanation--fault' : ''),
    })
    if (isFault) {
      expl.innerHTML = `<strong>Injected fault:</strong> ${_activeFault.label}<br><br>` +
                       `<em>Effect:</em> ${_activeFault.effect}`
    } else {
      expl.textContent = step.explanation
    }
    container.appendChild(expl)

    // ── Fields ────────────────────────────────────────
    container.appendChild(createElement('div', {
      className:   'inspector__fields-heading',
      textContent: 'Packet Fields',
    }))

    for (const [key, value] of Object.entries(step.fields)) {
      const row = createElement('div', { className: 'inspector__field' })

      row.appendChild(createElement('span', {
        className:   'inspector__field-key',
        textContent: key,
      }))
      row.appendChild(createElement('span', {
        className:   'inspector__field-value ' + valueClass(value),
        textContent: String(value),
      }))
      container.appendChild(row)
    }

    // ── Fault injection panel ─────────────────────────
    if (_faultMode && _faults.length > 0) {
      const section = createElement('div', { className: 'inspector__fault-section' })

      section.appendChild(createElement('div', {
        className:   'inspector__fault-heading',
        textContent: '⚡ Fault Injection',
      }))

      for (const fault of _faults) {
        const isActive = _activeFault?.id === fault.id
        const btn = createElement('button', {
          className:   'inspector__fault-btn' +
                       (isActive ? ' inspector__fault-btn--active' : ''),
          textContent: fault.label,
        })
        btn.appendChild(createElement('span', {
          className:   'inspector__fault-btn-step',
          textContent: `→ step ${fault.targetStep + 1}`,
        }))
        btn.addEventListener('click', () => onFaultClick?.(fault.id))
        section.appendChild(btn)

        if (isActive) {
          section.appendChild(createElement('div', {
            className:   'inspector__fault-effect',
            textContent: `Effect: ${fault.effect}`,
          }))
        }
      }

      container.appendChild(section)
    }
  }

  /**
   * Update the inspector.
   * @param {object}      props
   * @param {object|null} props.step        - Current protocol step or null
   * @param {object[]}    props.faults      - Protocol fault list
   * @param {object|null} props.activeFault - Currently injected fault
   * @param {boolean}     props.faultMode   - Whether fault panel is shown
   */
  function render({ step, faults, activeFault, faultMode }) {
    _step        = step
    _faults      = faults      ?? []
    _activeFault = activeFault ?? null
    _faultMode   = faultMode   ?? false

    if (!_step) {
      renderEmpty()
    } else {
      renderStep()
    }
  }

  return { render }
}
