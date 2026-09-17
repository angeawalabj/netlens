/**
 * Anomaly Detection Engine
 *
 * Pure rule-based detection. No I/O, no side effects.
 * Each rule is an independent function — easy to add,
 * easy to test, easy to disable.
 *
 * Open/Closed principle: add new rules without
 * modifying existing ones.
 */

// ─── Types ────────────────────────────────────────────

/**
 * @typedef {Object} Flow
 * @property {string} id
 * @property {string} src        - Source IP
 * @property {string} dst        - Destination IP
 * @property {string} dstHost    - Resolved hostname or empty
 * @property {string} protocol   - HTTPS | HTTP | DNS | TLS | MQTT | ...
 * @property {number} bytes      - Total bytes
 * @property {number} durationSec
 * @property {string} country    - 2-letter country code
 * @property {string} app        - Guessed application name
 */

/**
 * @typedef {Object} AnomalyAlert
 * @property {string}   flowId
 * @property {string}   ruleId
 * @property {'info'|'warning'|'critical'} severity
 * @property {string}   title
 * @property {string}   description
 * @property {number}   timestamp
 */

/**
 * @typedef {Object} Rule
 * @property {string}   id
 * @property {string}   name
 * @property {string}   description
 * @property {function(Flow, Flow[]): AnomalyAlert|null} detect
 */

// ─── Rule Registry ────────────────────────────────────

/** @type {Rule[]} */
const RULES = [

  {
    id:          'high_volume_unknown',
    name:        'High-volume unclassified flow',
    description: 'Large data transfer to an unclassified or unknown host',
    detect(flow) {
      const THRESHOLD_BYTES = 50 * 1024 * 1024 // 50 MB
      if (flow.bytes < THRESHOLD_BYTES) return null
      if (flow.protocol !== 'TLS' && flow.protocol !== 'UNKNOWN') return null
      if (flow.dstHost && isKnownProvider(flow.dstHost)) return null
      return {
        flowId:      flow.id,
        ruleId:      'high_volume_unknown',
        severity:    'critical',
        title:       `High-volume transfer to unclassified host`,
        description: `${flow.src} → ${flow.dstHost || flow.dst} · ` +
                     `${formatBytes(flow.bytes)} over ${flow.protocol}. ` +
                     `Host is not in known-provider list.`,
        timestamp:   Date.now(),
      }
    },
  },

  {
    id:          'suspicious_country',
    name:        'Connection to high-risk jurisdiction',
    description: 'Flow to a country with known adversarial infrastructure',
    detect(flow) {
      const HIGH_RISK = new Set(['RU', 'KP', 'IR'])
      if (!HIGH_RISK.has(flow.country)) return null
      // Exclude very small flows (beacons, DNS)
      if (flow.bytes < 1024) return null
      return {
        flowId:      flow.id,
        ruleId:      'suspicious_country',
        severity:    'warning',
        title:       `Connection to ${flow.country}-hosted endpoint`,
        description: `${flow.src} → ${flow.dstHost || flow.dst} (${flow.country}) · ` +
                     `${formatBytes(flow.bytes)} transferred. Verify this is expected.`,
        timestamp:   Date.now(),
      }
    },
  },

  {
    id:          'mqtt_unknown_broker',
    name:        'MQTT to unrecognized broker',
    description: 'MQTT traffic to a host outside known IoT cloud providers',
    detect(flow) {
      if (flow.protocol !== 'MQTT') return null
      const KNOWN_BROKERS = [
        'mqtt.googleapis.com',
        'mqtt.amazonaws.com',
        'mqtt.azure.com',
        'mqtt.nest.com',
        'iot.eclipse.org',
        'broker.hivemq.com',
      ]
      const host = flow.dstHost.toLowerCase()
      if (KNOWN_BROKERS.some(k => host.includes(k))) return null
      return {
        flowId:      flow.id,
        ruleId:      'mqtt_unknown_broker',
        severity:    'warning',
        title:       `MQTT to unrecognized broker`,
        description: `${flow.src} (${flow.app}) → ${flow.dstHost || flow.dst}. ` +
                     `Host is not in known MQTT provider list.`,
        timestamp:   Date.now(),
      }
    },
  },

  {
    id:          'cleartext_http',
    name:        'Unencrypted HTTP connection',
    description: 'HTTP (not HTTPS) connection detected',
    detect(flow) {
      if (flow.protocol !== 'HTTP') return null
      return {
        flowId:      flow.id,
        ruleId:      'cleartext_http',
        severity:    'info',
        title:       `Cleartext HTTP — ${flow.dstHost || flow.dst}`,
        description: `${flow.src} → ${flow.dstHost || flow.dst} over plain HTTP. ` +
                     `Credentials and content are transmitted unencrypted.`,
        timestamp:   Date.now(),
      }
    },
  },

  {
    id:          'acr_telemetry',
    name:        'Smart TV ACR telemetry',
    description: 'Automatic Content Recognition fingerprinting detected',
    detect(flow) {
      const ACR_PATTERNS = ['samba.tv', 'acr.', 'samsung-ads', 'smarttv-analytics']
      const host = flow.dstHost.toLowerCase()
      if (!ACR_PATTERNS.some(p => host.includes(p))) return null
      return {
        flowId:      flow.id,
        ruleId:      'acr_telemetry',
        severity:    'warning',
        title:       `ACR telemetry — ${flow.app}`,
        description: `${flow.app} is sending viewing fingerprint data to ` +
                     `${flow.dstHost}. This identifies what content is on screen ` +
                     `without your explicit consent.`,
        timestamp:   Date.now(),
      }
    },
  },

  {
    id:          'dns_dga_pattern',
    name:        'Potential DGA (Domain Generation Algorithm)',
    description: 'Rapid sequence of NXDOMAIN responses suggesting malware DGA',
    detect(flow, allFlows) {
      if (flow.protocol !== 'DNS') return null
      // Count NXDOMAIN-like patterns in recent DNS flows
      // In simulation: detect by hostname entropy heuristic
      const entropy = hostnameEntropy(flow.dstHost)
      if (entropy < 3.5) return null
      if (flow.bytes > 1000) return null // Real DGA queries are tiny
      return {
        flowId:      flow.id,
        ruleId:      'dns_dga_pattern',
        severity:    'critical',
        title:       `Possible DGA query — ${flow.dstHost}`,
        description: `High-entropy hostname queried by ${flow.src}. ` +
                     `Pattern consistent with Domain Generation Algorithm ` +
                     `used by botnet malware for C2 communication.`,
        timestamp:   Date.now(),
      }
    },
  },

]

// ─── Public API ───────────────────────────────────────

/**
 * Run all detection rules against a single flow.
 * Returns all triggered alerts.
 *
 * @param {Flow}   flow
 * @param {Flow[]} allFlows - Context for rules that need it
 * @returns {AnomalyAlert[]}
 */
export function detectAnomalies(flow, allFlows = []) {
  return RULES
    .map(rule => {
      try {
        return rule.detect(flow, allFlows)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

/**
 * Run detection across all flows.
 * @param {Flow[]} flows
 * @returns {AnomalyAlert[]}
 */
export function scanFlows(flows) {
  return flows.flatMap(flow => detectAnomalies(flow, flows))
}

/**
 * Get all registered rule definitions (without detect functions).
 * Useful for displaying rule documentation.
 * @returns {Array<{id, name, description}>}
 */
export function getRules() {
  return RULES.map(({ id, name, description }) => ({ id, name, description }))
}

// ─── Helpers ──────────────────────────────────────────

const KNOWN_PROVIDERS = [
  'google.com', 'googleapis.com', 'apple.com', 'icloud.com',
  'microsoft.com', 'amazon.com', 'amazonaws.com', 'cloudflare.com',
  'fastly.com', 'akamai.com', 'netflix.com', 'github.com',
  'stripe.com', 'twilio.com', 'sendgrid.com', 'slack.com',
]

function isKnownProvider(host) {
  const h = host.toLowerCase()
  return KNOWN_PROVIDERS.some(p => h.endsWith(p) || h === p)
}

function formatBytes(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB'
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(0) + ' KB'
  return bytes + ' B'
}

/**
 * Compute Shannon entropy of a hostname.
 * High entropy = random-looking = potential DGA.
 * @param {string} hostname
 * @returns {number}
 */
function hostnameEntropy(hostname) {
  if (!hostname) return 0
  const label = hostname.split('.')[0] || hostname
  const freq  = {}
  for (const ch of label) freq[ch] = (freq[ch] || 0) + 1
  return Object.values(freq).reduce((sum, count) => {
    const p = count / label.length
    return sum - p * Math.log2(p)
  }, 0)
}
