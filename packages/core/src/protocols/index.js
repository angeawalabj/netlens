/**
 * Protocol Registry
 *
 * Single source of truth for all protocol definitions.
 * Adding a protocol = creating one file + one import here.
 * Nothing else changes.
 *
 * Each protocol module exports a Protocol object
 * conforming to the Protocol interface defined below.
 */

import { TCP }  from './tcp.js'
import { DNS }  from './dns.js'
import { TLS }  from './tls.js'
import { HTTP } from './http.js'
import { MQTT } from './mqtt.js'

/**
 * @typedef {Object} ProtocolStep
 * @property {string}   id          - Unique identifier
 * @property {string}   direction   - 'client-to-server' | 'server-to-client'
 * @property {string}   label       - Short packet name (e.g. 'SYN')
 * @property {string}   sublabel    - Technical detail (e.g. 'seq=0 win=64240')
 * @property {string}   fromActor   - Actor id that sends
 * @property {string}   toActor     - Actor id that receives
 * @property {string}   phase       - Phase name (e.g. 'Handshake')
 * @property {string}   color       - Hex color for this step
 * @property {string}   explanation - Plain-language explanation
 * @property {Object}   fields      - Header fields key→value
 */

/**
 * @typedef {Object} ProtocolActor
 * @property {string} id      - Unique identifier
 * @property {string} label   - Display label (e.g. 'CLIENT')
 * @property {string} address - IP or role description
 */

/**
 * @typedef {Object} ProtocolFault
 * @property {string} id          - Unique identifier
 * @property {string} label       - Short description
 * @property {number} targetStep  - Step index where fault applies
 * @property {string} effect      - What happens when fault is injected
 */

/**
 * @typedef {Object} Protocol
 * @property {string}          id       - Unique identifier
 * @property {string}          label    - Display name
 * @property {string}          subtitle - One-line description
 * @property {string}          color    - Primary color
 * @property {string}          rfc      - RFC number(s)
 * @property {string}          layer    - OSI layer description
 * @property {ProtocolActor[]} actors   - Participants
 * @property {ProtocolFault[]} faults   - Injectable faults
 * @property {ProtocolStep[]}  steps    - Exchange steps
 */

/** @type {Map<string, Protocol>} */
const REGISTRY = new Map([
  [TCP.id,  TCP],
  [DNS.id,  DNS],
  [TLS.id,  TLS],
  [HTTP.id, HTTP],
  [MQTT.id, MQTT],
])

/**
 * Get a protocol by id.
 * @param {string} id
 * @returns {Protocol}
 * @throws {Error} if protocol not found
 */
export function getProtocol(id) {
  const proto = REGISTRY.get(id)
  if (!proto) throw new Error(`Protocol not found: "${id}"`)
  return proto
}

/**
 * Get all protocols in insertion order.
 * @returns {Protocol[]}
 */
export function getAllProtocols() {
  return [...REGISTRY.values()]
}

/**
 * Check if a protocol exists.
 * @param {string} id
 * @returns {boolean}
 */
export function hasProtocol(id) {
  return REGISTRY.has(id)
}

/**
 * Get the phases for a protocol (deduplicated, in order).
 * @param {string} protocolId
 * @returns {string[]}
 */
export function getPhases(protocolId) {
  const proto = getProtocol(protocolId)
  return [...new Set(proto.steps.map(s => s.phase))]
}

/**
 * Get steps belonging to a specific phase.
 * @param {string} protocolId
 * @param {string} phase
 * @returns {ProtocolStep[]}
 */
export function getStepsByPhase(protocolId, phase) {
  const proto = getProtocol(protocolId)
  return proto.steps.filter(s => s.phase === phase)
}
