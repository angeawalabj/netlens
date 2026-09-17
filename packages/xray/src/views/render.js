/**
 * X-Ray — Views / Render
 *
 * Toutes les mutations DOM du dashboard X-Ray.
 * Single Responsibility : lire l'état, mettre à jour le DOM.
 *
 * Ce module n'importe JAMAIS depuis main.js (évite le cycle).
 * main.js importe depuis ce fichier.
 */

import { Selectors }  from '../state.js'
import { formatBytes, formatDuration, formatTimestamp, toggleClass }
  from '@netlens/ui/components/dom.js'

// ─── Constantes ───────────────────────────────────────

const PROTO_COLORS = {
  HTTPS:'#22c55e', QUIC:'#a855f7', DNS:'#22d3ee',
  MQTT: '#f97316', TLS: '#818cf8', HTTP:'#f59e0b',
  SSH:  '#f59e0b', UNKNOWN:'#ef4444',
}

const FLAGS = {
  IE:'🇮🇪', US:'🇺🇸', NL:'🇳🇱', DE:'🇩🇪',
  CN:'🇨🇳', RU:'🇷🇺', GB:'🇬🇧', FR:'🇫🇷', JP:'🇯🇵',
}

// ─── Pass de rendu complet ────────────────────────────

/**
 * @param {import('../state.js').XRayState} state
 */
export function render(state) {
  renderMetrics(state)
  renderDevices(state)
  renderConnections(state)
  renderAlerts(state)
  renderProtoDist(state)
  renderTopbarStatus(state)
}

// ─── Métriques ────────────────────────────────────────

function renderMetrics(state) {
  setText('mDown',   state.mbpsDown.toFixed(1) + ' Mb/s')
  setText('mUp',     state.mbpsUp.toFixed(2)   + ' Mb/s')
  setText('mConns',  String(state.flows.length))
  setText('mDNS',    String(Selectors.dnsPerMin(state)))
  setText('mBytes',  formatBytes(state.totalBytes))
  setText('peakDown',state.peakDown.toFixed(1))
  setText('peakUp',  state.peakUp.toFixed(2))

  const alerts = Selectors.activeAlerts(state)
  const mAl    = document.getElementById('mAlerts')
  if (mAl) {
    mAl.textContent = String(alerts)
    mAl.className   = 'metric__val' + (alerts > 0 ? ' metric__val--danger' : '')
  }

  const tlsPct = Selectors.tlsCoverage(state)
  const mTLS   = document.getElementById('mTLS')
  if (mTLS) {
    mTLS.textContent = tlsPct + '%'
    mTLS.className   = 'metric__val ' +
      (tlsPct >= 80 ? 'metric__val--success'
        : tlsPct >= 60 ? 'metric__val--warn'
        : 'metric__val--danger')
  }

  drawSparklines(state)
}

function drawSparklines(state) {
  drawSparkline('spDown', state.downSpark, '#22c55e')
  drawSparkline('spUp',   state.upSpark,   '#3b82f6')
}

function drawSparkline(id, data, color) {
  const cv  = document.getElementById(id)
  if (!cv) return
  const W   = cv.width
  const H   = cv.height
  const ctx = cv.getContext('2d')
  const max = Math.max(...data, 0.1)
  ctx.clearRect(0, 0, W, H)
  ctx.beginPath()
  data.forEach((v, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - (v / max) * (H - 2) - 1
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke()
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath()
  ctx.fillStyle = color + '22'; ctx.fill()
}

// ─── Timeline canvas ──────────────────────────────────

export function drawTimeline(state) {
  const cv = document.getElementById('tlCanvas')
  if (!cv) return

  const W = cv.offsetWidth
  const H = cv.offsetHeight
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H }

  const ctx    = cv.getContext('2d')
  const data   = state.tlHistory
  const len    = data.length
  const maxVal = Math.max(12, state.peakDown * 1.2)
  const pad    = { l:44, r:8, t:6, b:4 }
  const cW     = W - pad.l - pad.r
  const cH     = H - pad.t - pad.b

  ctx.clearRect(0, 0, W, H)

  ;[0, .25, .5, .75, 1].forEach(p => {
    const y = pad.t + cH * (1 - p)
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y)
    ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.lineWidth = .5; ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.font = '9px IBM Plex Mono,monospace'
    ctx.textAlign = 'right'
    ctx.fillText((maxVal * p).toFixed(1), pad.l - 4, y + 3)
  })

  data.forEach((d, i) => {
    if (!d.alert) return
    const x = pad.l + (i / (len - 1)) * cW
    ctx.fillStyle = 'rgba(239,68,68,.07)'
    ctx.fillRect(x - cW / len / 2, pad.t, cW / len, cH)
  })

  // Download fill
  ctx.beginPath()
  data.forEach((d, i) => {
    const x = pad.l + (i / (len - 1)) * cW
    const y = pad.t + cH * (1 - d.down / maxVal)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.lineTo(pad.l + cW, pad.t + cH); ctx.lineTo(pad.l, pad.t + cH); ctx.closePath()
  const gd = ctx.createLinearGradient(0, pad.t, 0, pad.t + cH)
  gd.addColorStop(0, 'rgba(34,197,94,.2)'); gd.addColorStop(1, 'rgba(34,197,94,.02)')
  ctx.fillStyle = gd; ctx.fill()

  // Lignes download + upload
  ;[
    { data: data.map(d => d.down), color: '#22c55e', width: 1.5 },
    { data: data.map(d => d.up),   color: '#3b82f6', width: 1   },
  ].forEach(({ data: vals, color, width }) => {
    ctx.beginPath()
    vals.forEach((v, i) => {
      const x = pad.l + (i / (len - 1)) * cW
      const y = pad.t + cH * (1 - v / maxVal)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke()
  })
}

// ─── Devices ──────────────────────────────────────────

function renderDevices(state) {
  const list  = document.getElementById('deviceList')
  const count = document.getElementById('devCount')
  if (!list) return

  const devices = Selectors.visibleDevices(state)
  if (count) count.textContent = devices.filter(d => d.status !== 'down').length

  list.innerHTML = devices.map(d => {
    const flows = state.flows.filter(f => f.src === d.ip)
    const bw    = flows.reduce((s, f) => s + (f.bytes / Math.max(1, f.duration)), 0)
    const sel   = state.selectedDevice === d.id
    return `
      <div class="device-row ${sel ? 'device-row--selected' : ''} ${d.suspect ? 'device-row--suspect' : ''}"
           data-action="select-device" data-payload="${d.id}">
        <div class="device-row__status device-row__status--${d.status}"></div>
        <div class="device-row__info">
          <div class="device-row__name">${d.name}${d.suspect ? ' ⚑' : ''}</div>
          <div class="device-row__meta font-mono">${d.ip} · ${d.vendor}</div>
        </div>
        <div class="device-row__bw font-mono ${bw > 200_000 ? 'device-row__bw--high' : ''}">
          ${d.status !== 'down' ? formatBytes(bw) + '/s' : '—'}
        </div>
      </div>`
  }).join('')
}

// ─── Connexions ───────────────────────────────────────

function renderConnections(state) {
  const tbody = document.getElementById('connRows')
  const count = document.getElementById('connCount')
  if (!tbody) return

  const flows = Selectors.visibleFlows(state)
  if (count) count.textContent = flows.length

  tbody.innerHTML = flows.map(f => {
    const color = PROTO_COLORS[f.proto] || PROTO_COLORS.UNKNOWN
    const sel   = state.selectedFlow === f.id
    return `
      <div class="ct-row ${f.suspect ? 'ct-row--alert' : ''} ${sel ? 'ct-row--selected' : ''}"
           data-action="select-flow" data-payload="${f.id}">
        <div class="ct-cell">
          <span class="proto-badge"
            style="color:${color};border-color:${color}44;background:${color}10">${f.proto}</span>
        </div>
        <div class="ct-cell ct-cell--mono truncate" title="${f.src}">${f.src}</div>
        <div class="ct-cell ct-cell--mono truncate" title="${f.host || f.dst}">${f.host || f.dst}</div>
        <div class="ct-cell ct-cell--center">${FLAGS[f.country] || f.country}</div>
        <div class="ct-cell ct-cell--right ct-cell--mono ${f.bytes > 50e6 ? 'ct-cell--warn' : ''}">
          ${formatBytes(f.bytes)}
        </div>
        <div class="ct-cell ct-cell--right ct-cell--mono ct-cell--dim">
          ${formatDuration(Math.round(f.duration || 0))}
        </div>
        <div class="ct-cell ct-cell--center">
          ${f.suspect ? '<span class="flag-alert">⚑</span>' : ''}
        </div>
      </div>`
  }).join('')
}

// ─── Alertes ──────────────────────────────────────────

function renderAlerts(state) {
  const stream = document.getElementById('alertStream')
  const count  = document.getElementById('alertCount')
  if (!stream) return
  if (count) count.textContent = state.alerts.length

  if (!state.alerts.length) {
    stream.innerHTML = `
      <div class="alert-item alert-item--info">
        <div class="alert-item__top">
          <span class="severity-badge severity-badge--info">INFO</span>
          <span class="alert-item__time font-mono">${formatTimestamp(Date.now())}</span>
        </div>
        <div class="alert-item__title">No alerts</div>
        <div class="alert-item__desc font-mono">All connections within expected parameters.</div>
      </div>`
    return
  }

  stream.innerHTML = state.alerts.slice(0, 15).map(a => `
    <div class="alert-item alert-item--${a.severity}"
         ${a.flowId ? `data-action="select-flow" data-payload="${a.flowId}"` : ''}>
      <div class="alert-item__top">
        <span class="severity-badge severity-badge--${a.severity}">${a.severity.toUpperCase()}</span>
        <span class="alert-item__time font-mono">${formatTimestamp(a.timestamp)}</span>
      </div>
      <div class="alert-item__title">${a.title}</div>
      <div class="alert-item__desc font-mono">${a.description}</div>
    </div>`).join('')
}

// ─── Distribution protocoles ──────────────────────────

function renderProtoDist(state) {
  const el = document.getElementById('protoDist')
  if (!el) return

  const dist = Selectors.protoDistribution(state)
  el.innerHTML = dist.slice(0, 6).map(({ proto, pct }) => {
    const color = PROTO_COLORS[proto] || PROTO_COLORS.UNKNOWN
    return `
      <div class="pd-row">
        <span class="pd-name font-mono">${proto}</span>
        <div class="pd-bar-wrap">
          <div class="pd-bar" style="width:${pct}%;background:${color}"></div>
        </div>
        <span class="pd-pct font-mono">${pct}%</span>
      </div>`
  }).join('')
}

// ─── Status topbar ────────────────────────────────────

function renderTopbarStatus(state) {
  const badge   = document.getElementById('wsBadge')
  const btnPause = document.getElementById('btnPause')

  if (badge) {
    const labels = {
      connected:    '◉ LIVE',
      connecting:   '◌ Connecting…',
      disconnected: '○ Disconnected',
    }
    badge.textContent = labels[state.wsStatus] || '○ —'
    toggleClass(badge, 'live-badge--dim', state.wsStatus !== 'connected')
  }
  if (btnPause) {
    toggleClass(btnPause, 'btn--active', state.paused)
    btnPause.textContent = state.paused ? '▶ Resume' : '⏸ Pause'
  }
}

// ─── Utilitaire ───────────────────────────────────────

function setText(id, text) {
  const el = document.getElementById(id)
  if (el) el.textContent = text
}
