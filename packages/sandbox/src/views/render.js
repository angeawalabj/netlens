/**
 * Sandbox Render
 *
 * Orchestrates all DOM updates for the sandbox application.
 * Single Responsibility: translate state into DOM mutations.
 *
 * Rule: this module reads state, calls UI components.
 *       It never modifies state.
 */

import { getAllProtocols, getProtocol } from '@netlens/core/protocols'
import { PacketFlow }   from '@netlens/ui/components/PacketFlow/PacketFlow.js'
import { Inspector }    from '@netlens/ui/components/Inspector/Inspector.js'
import { requireElement, toggleClass } from '@netlens/ui/components/dom.js'
import { Selectors }    from '../state.js'

// ─── Mount once ───────────────────────────────────────

let packetFlow = null
let inspector  = null
let mounted    = false

/**
 * Mount component instances into the DOM.
 * Call once after the HTML shell is loaded.
 *
 * @param {object} options
 * @param {function} options.onStepClick
 * @param {function} options.onFaultClick
 */
export function mount({ onStepClick, onFaultClick }) {
  if (mounted) return
  mounted = true

  packetFlow = PacketFlow({
    container:   requireElement('#flowArea'),
    onStepClick,
  })

  inspector = Inspector({
    container:   requireElement('#inspectorBody'),
    titleEl:     requireElement('#inspectorProto'),
    onFaultClick,
  })

  renderProtocolList()
}

// ─── Render functions ────────────────────────────────

/**
 * Full render pass — call after every state change.
 * @param {import('../state.js').SandboxState} state
 * @param {function} dispatch
 */
export function render(state) {
  renderProtocolList(state)
  renderPhaseStrip(state)
  renderPacketFlow(state)
  renderInspector(state)
  renderControls(state)
  renderSessionInfo(state)
}

// ── Protocol sidebar ──────────────────────────────────

function renderProtocolList(state) {
  const list = document.getElementById('protoList')
  if (!list) return

  const protocols = getAllProtocols()
  list.innerHTML   = protocols.map(p => {
    const isActive = p.id === state?.protocolId
    return `
      <div class="proto-item ${isActive ? 'proto-item--active' : ''}"
           data-proto="${p.id}"
           style="${isActive ? `border-left-color:${p.color}` : ''}">
        <div class="proto-item__icon"
             style="background:${p.color}18;color:${p.color}">${p.id.slice(0,2).toUpperCase()}</div>
        <div class="proto-item__info">
          <div class="proto-item__name" style="${isActive ? `color:${p.color}` : ''}">${p.label}</div>
          <div class="proto-item__meta">${p.layer.split('—')[0].trim()}</div>
        </div>
        <div class="proto-item__count">${p.steps.length}</div>
      </div>`
  }).join('')
}

// ── Phase strip ───────────────────────────────────────

function renderPhaseStrip(state) {
  const strip = document.getElementById('phaseStrip')
  if (!strip) return

  const phases      = Selectors.phases(state)
  const currentPhase = Selectors.currentPhase(state)

  strip.innerHTML = phases.map(phase => {
    const isActive = phase === currentPhase
    const isDone   = isDonePhase(state, phase)
    return `
      <div class="phase-tab ${isActive ? 'phase-tab--active' : ''} ${isDone && !isActive ? 'phase-tab--done' : ''}"
           data-phase="${phase}">
        ${isDone && !isActive ? '✓ ' : ''}${phase}
      </div>`
  }).join('')
}

function isDonePhase(state, phase) {
  const proto = getProtocol(state.protocolId)
  const phaseSteps = proto.steps.filter(s => s.phase === phase)
  return phaseSteps.every(s => proto.steps.indexOf(s) < state.currentStep)
}

// ── PacketFlow ────────────────────────────────────────

function renderPacketFlow(state) {
  if (!packetFlow) return
  const proto = getProtocol(state.protocolId)
  packetFlow.render({
    actors:      proto.actors,
    steps:       proto.steps,
    currentStep: state.currentStep,
    activeFault: state.activeFault,
  })
}

// ── Inspector ─────────────────────────────────────────

function renderInspector(state) {
  if (!inspector) return
  const proto = getProtocol(state.protocolId)
  const step  = proto.steps[state.currentStep] ?? null

  inspector.render({
    step,
    faults:      proto.faults,
    activeFault: state.activeFault,
    faultMode:   state.faultMode,
  })
}

// ── Controls ──────────────────────────────────────────

function renderControls(state) {
  const proto    = getProtocol(state.protocolId)
  const total    = proto.steps.length
  const progress = Selectors.progress(state)

  // Progress bar
  const fill  = document.getElementById('ctrlFill')
  if (fill) fill.style.width = Math.max(0, progress * 100) + '%'

  // Label
  const label = document.getElementById('ctrlLabel')
  if (label) {
    label.textContent = state.currentStep >= 0
      ? `Step ${state.currentStep + 1} of ${total}  ·  ${Selectors.currentPhase(state)}`
      : `${proto.label}  ·  ${total} steps — press Space to start`
  }

  // Buttons
  const btnPrev = document.getElementById('btnPrev')
  const btnNext = document.getElementById('btnNext')
  const btnPlay = document.getElementById('btnPlay')

  if (btnPrev) btnPrev.disabled = !Selectors.canGoPrev(state)
  if (btnNext) btnNext.disabled = !Selectors.canGoNext(state)
  if (btnPlay) btnPlay.textContent = state.isPlaying ? '⏸' : '▶'

  // Fault toggle
  const faultBtn = document.getElementById('btnFault')
  if (faultBtn) {
    toggleClass(faultBtn, 'btn--ghost--danger--active', state.faultMode)
    faultBtn.textContent = state.faultMode ? '⚡ Faults ON' : '⚡ Faults'
  }

  // Speed buttons
  document.querySelectorAll('[data-speed]').forEach(btn => {
    const speed = parseInt(btn.dataset.speed, 10)
    toggleClass(btn, 'speed-btn--active', speed === state.speedMs)
  })
}

// ── Session info (sidebar) ────────────────────────────

function renderSessionInfo(state) {
  const proto = getProtocol(state.protocolId)

  const els = {
    sessStep:    document.getElementById('sessStep'),
    sessPhase:   document.getElementById('sessPhase'),
    sessFault:   document.getElementById('sessFault'),
    sessRFC:     document.getElementById('sessRFC'),
  }

  if (els.sessStep) {
    els.sessStep.textContent = state.currentStep >= 0
      ? `${state.currentStep + 1} / ${proto.steps.length}`
      : '—'
  }
  if (els.sessPhase) {
    els.sessPhase.textContent = Selectors.currentPhase(state) ?? '—'
  }
  if (els.sessFault) {
    els.sessFault.textContent = state.activeFault?.label ?? 'none'
    els.sessFault.style.color = state.activeFault
      ? 'var(--color-danger-light)'
      : 'var(--text-3)'
  }
  if (els.sessRFC) {
    els.sessRFC.textContent = proto.rfc
  }
}
