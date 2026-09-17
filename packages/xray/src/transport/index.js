/**
 * X-Ray Transport Layer
 *
 * Abstracts the data source behind a single interface.
 * The application never knows if it's receiving live data
 * from the Rust backend or simulated data.
 *
 * Dependency Inversion: X-Ray app depends on this abstraction,
 * not on WebSocket or simulation directly.
 */

// ─── Transport Interface ──────────────────────────────
//
// Any transport must implement:
//   start()         → void
//   stop()          → void
//   onMessage(fn)   → unsubscribe function
//   get status()    → 'connecting' | 'connected' | 'disconnected'

// ─── WebSocket Transport ──────────────────────────────

export class WebSocketTransport {
  /**
   * @param {string} url - WebSocket URL (e.g. 'ws://localhost:8765')
   */
  constructor(url) {
    this._url       = url
    this._ws        = null
    this._listeners = new Set()
    this._status    = 'disconnected'
    this._reconnect = 2000
  }

  get status() { return this._status }

  start() {
    this._connect()
  }

  stop() {
    this._status = 'disconnected'
    this._ws?.close()
    this._ws = null
  }

  /**
   * @param {function} fn - Called with each parsed message
   * @returns {function} unsubscribe
   */
  onMessage(fn) {
    this._listeners.add(fn)
    return () => this._listeners.delete(fn)
  }

  _connect() {
    this._status = 'connecting'
    this._notify({ type: 'Status', status: 'connecting' })

    try {
      this._ws = new WebSocket(this._url)
    } catch {
      this._scheduleReconnect()
      return
    }

    this._ws.onopen = () => {
      this._status  = 'connected'
      this._reconnect = 2000
      this._notify({ type: 'Status', status: 'connected' })
    }

    this._ws.onmessage = ({ data }) => {
      try {
        this._notify(JSON.parse(data))
      } catch {
        // Malformed message — ignore
      }
    }

    this._ws.onclose = () => {
      if (this._status !== 'disconnected') {
        this._scheduleReconnect()
      }
    }

    this._ws.onerror = () => {
      this._ws?.close()
    }
  }

  _scheduleReconnect() {
    this._status = 'disconnected'
    this._notify({ type: 'Status', status: 'disconnected' })
    setTimeout(() => {
      this._reconnect = Math.min(this._reconnect * 1.5, 30000)
      this._connect()
    }, this._reconnect)
  }

  _notify(msg) {
    for (const fn of this._listeners) {
      try { fn(msg) } catch { /* listener error — do not break others */ }
    }
  }
}

// ─── Simulation Transport ─────────────────────────────

const SIM_DEVICES = [
  { id:'self',   name:'MacBook Pro',      ip:'192.168.1.10',  vendor:'Apple',   status:'up',   suspect:false },
  { id:'phone',  name:'iPhone 15 Pro',    ip:'192.168.1.11',  vendor:'Apple',   status:'up',   suspect:false },
  { id:'tv',     name:'Samsung Smart TV', ip:'192.168.1.20',  vendor:'Samsung', status:'up',   suspect:true  },
  { id:'nest',   name:'Nest Thermostat',  ip:'192.168.1.30',  vendor:'Google',  status:'up',   suspect:false },
  { id:'camera', name:'Tapo C310',        ip:'192.168.1.40',  vendor:'TP-Link', status:'warn', suspect:true  },
  { id:'tablet', name:'iPad Air',         ip:'192.168.1.12',  vendor:'Apple',   status:'down', suspect:false },
  { id:'ps5',    name:'PlayStation 5',    ip:'192.168.1.50',  vendor:'Sony',    status:'up',   suspect:false },
  { id:'router', name:'Gateway',          ip:'192.168.1.1',   vendor:'Orange',  status:'up',   suspect:false },
]

const SIM_FLOWS = [
  { id:'f1',  src:'192.168.1.10', dst:'142.250.75.110', host:'mail.google.com',      country:'IE', proto:'HTTPS', app:'Chrome',  suspect:false },
  { id:'f2',  src:'192.168.1.10', dst:'140.82.121.4',   host:'github.com',           country:'US', proto:'HTTPS', app:'VSCode',  suspect:false },
  { id:'f3',  src:'192.168.1.10', dst:'8.8.8.8',        host:'dns.google',           country:'US', proto:'DNS',   app:'System',  suspect:false },
  { id:'f4',  src:'192.168.1.11', dst:'17.253.144.10',  host:'icloud.com',           country:'US', proto:'HTTPS', app:'iOS',     suspect:false },
  { id:'f5',  src:'192.168.1.20', dst:'45.57.44.66',    host:'api.netflix.com',      country:'NL', proto:'QUIC',  app:'Netflix', suspect:false },
  { id:'f6',  src:'192.168.1.20', dst:'52.57.11.223',   host:'samsung-ads.com',      country:'DE', proto:'HTTPS', app:'SmartTV', suspect:true  },
  { id:'f7',  src:'192.168.1.30', dst:'108.177.8.102',  host:'mqtt.googleapis.com',  country:'US', proto:'MQTT',  app:'Nest',    suspect:false },
  { id:'f8',  src:'192.168.1.40', dst:'194.165.16.3',   host:'telemetry.unknown.ru', country:'RU', proto:'TLS',   app:'Camera',  suspect:true  },
  { id:'f9',  src:'192.168.1.10', dst:'104.21.45.12',   host:'cloudflare.com',       country:'US', proto:'QUIC',  app:'Chrome',  suspect:false },
  { id:'f10', src:'192.168.1.50', dst:'103.21.244.0',   host:'psn.com',              country:'US', proto:'HTTPS', app:'PSN',     suspect:false },
]

export class SimulationTransport {
  constructor() {
    this._listeners = new Set()
    this._status    = 'disconnected'
    this._intervalId = null
    this._tick      = 0
    this._flows     = SIM_FLOWS.map(f => ({ ...f, bytes: 0, duration: 0, active: true }))
  }

  get status() { return this._status }

  start() {
    this._status = 'connected'
    this._notify({ type: 'Status', status: 'connected', mode: 'simulation' })

    // Send initial device list
    this._notify({ type: 'DeviceList', devices: SIM_DEVICES })

    // Start simulation loop at 5 fps
    this._intervalId = setInterval(() => this._step(), 200)
  }

  stop() {
    clearInterval(this._intervalId)
    this._intervalId = null
    this._status = 'disconnected'
  }

  onMessage(fn) {
    this._listeners.add(fn)
    return () => this._listeners.delete(fn)
  }

  _step() {
    this._tick++

    // Simulate bandwidth
    const t     = this._tick / 50
    const down  = Math.max(0.1, 3 + Math.sin(t * Math.PI) * 7 + (Math.random() - 0.3) * 2)
    const up    = Math.max(0.05, down * 0.12 + Math.random() * 0.4)

    // Update flows
    this._flows.forEach(f => {
      if (!f.active) return
      const rate = f.suspect ? 800_000 + Math.random() * 400_000 : 8_000 + Math.random() * 80_000
      f.bytes    += Math.round(rate / 5)
      f.duration += 0.2
    })

    // Send bandwidth update
    this._notify({
      type:     'BandwidthSample',
      mbpsDown: down,
      mbpsUp:   up,
      timestamp: Date.now(),
    })

    // Send flow update every second (5 ticks)
    if (this._tick % 5 === 0) {
      this._notify({
        type:  'FlowUpdate',
        flows: this._flows
          .filter(f => f.active)
          .map(f => ({ ...f })),
      })
    }

    // Send alerts for suspicious flows
    if (this._tick % 25 === 0) {
      const suspects = this._flows.filter(f => f.suspect && f.active)
      suspects.forEach(f => {
        this._notify({
          type:        'Alert',
          severity:    f.country === 'RU' ? 'critical' : 'warning',
          flowId:      f.id,
          title:       `${f.proto} anomaly — ${f.host}`,
          description: this._alertDesc(f),
          timestamp:   Date.now(),
        })
      })
    }
  }

  _alertDesc(flow) {
    if (flow.host.includes('unknown'))
      return `Unclassified TLS destination. ${formatBytes(flow.bytes)} transferred to ${flow.country}-hosted endpoint.`
    if (flow.host.includes('ads'))
      return `ACR telemetry detected. Smart TV fingerprinting active viewing content.`
    return `Suspicious flow: ${flow.src} → ${flow.host} (${flow.country}).`
  }

  _notify(msg) {
    for (const fn of this._listeners) {
      try { fn(msg) } catch { /* */ }
    }
  }
}

// ─── Factory ──────────────────────────────────────────

/**
 * Create the appropriate transport based on configuration.
 *
 * @param {{ mode: 'live'|'simulation', url?: string }} config
 * @returns {WebSocketTransport|SimulationTransport}
 */
export function createTransport(config) {
  if (config.mode === 'live' && config.url) {
    return new WebSocketTransport(config.url)
  }
  return new SimulationTransport()
}

// ─── Helpers ──────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB'
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(0) + ' KB'
  return bytes + ' B'
}
