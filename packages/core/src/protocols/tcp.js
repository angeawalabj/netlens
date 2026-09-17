/**
 * TCP Protocol Definition
 *
 * Pure data. No rendering logic.
 * This file has one reason to change:
 * the TCP protocol content needs updating.
 */

/** @type {import('./index.js').Protocol} */
export const TCP = {
  id:       'tcp',
  label:    'TCP',
  subtitle: 'Transmission Control Protocol',
  color:    '#3b82f6',
  rfc:      'RFC 793 · RFC 9293',
  layer:    'Layer 4 — Transport',

  actors: [
    { id: 'client', label: 'CLIENT', address: '192.168.1.10:49152' },
    { id: 'server', label: 'SERVER', address: '142.250.75.110:443'  },
  ],

  faults: [
    {
      id:         'drop_synack',
      label:      'Drop SYN-ACK',
      targetStep: 1,
      effect:     'Client timeout → retransmits SYN after RTO expires',
    },
    {
      id:         'inject_rst',
      label:      'Inject RST',
      targetStep: 2,
      effect:     'Immediate abort — no graceful close, connection torn',
    },
    {
      id:         'window_zero',
      label:      'Window = 0',
      targetStep: 4,
      effect:     'Sender stalls — zero-window probe sent after persist timer',
    },
  ],

  steps: [
    {
      id:          'syn',
      direction:   'client-to-server',
      label:       'SYN',
      sublabel:    'seq=0  win=64240',
      fromActor:   'client',
      toActor:     'server',
      phase:       'Handshake',
      color:       '#3b82f6',
      explanation: `The client picks a random Initial Sequence Number (ISN) and
sets SYN=1. The window field advertises how much receive buffer space
is available. The MSS option negotiates the maximum segment size
for this connection — both sides will never send larger segments.`,
      fields: {
        'Flags':          'SYN=1  ACK=0',
        'Seq Number':     '0  (ISN — randomly chosen at connection init)',
        'Ack Number':     '0  (ignored when ACK=0)',
        'Window':         '64240 bytes',
        'Options':        'MSS=1460  SACK_PERM  Timestamps  WScale=7',
        'Header length':  '60 bytes (with options)',
      },
    },
    {
      id:          'synack',
      direction:   'server-to-client',
      label:       'SYN-ACK',
      sublabel:    'seq=0  ack=1',
      fromActor:   'server',
      toActor:     'client',
      phase:       'Handshake',
      color:       '#22c55e',
      explanation: `Server acknowledges the client SYN (ack = client_ISN + 1,
meaning "I expect byte 1 from you next") and sends its own ISN.
Both sequence spaces are now synchronized — this is what
SYNchronize means. The SYN flag consumes one sequence number.`,
      fields: {
        'Flags':      'SYN=1  ACK=1',
        'Seq Number': '0  (server ISN — independently chosen)',
        'Ack Number': '1  (client_ISN + 1 — next expected byte)',
        'Window':     '65535 bytes',
        'Options':    'MSS=1460  SACK_PERM  Timestamps  WScale=8',
      },
    },
    {
      id:          'ack',
      direction:   'client-to-server',
      label:       'ACK',
      sublabel:    'seq=1  ack=1',
      fromActor:   'client',
      toActor:     'server',
      phase:       'Handshake',
      color:       '#3b82f6',
      explanation: `Client acknowledges the server SYN. The three-way handshake
is complete — the connection is ESTABLISHED on both sides.
Both parties know each other's ISNs and can now send data.
This packet carries no data; it is a pure acknowledgment.`,
      fields: {
        'Flags':      'ACK=1',
        'Seq Number': '1',
        'Ack Number': '1  (server_ISN + 1)',
        'Window':     '64240 bytes',
        'Data':       '0 bytes — pure ACK',
      },
    },
    {
      id:          'data',
      direction:   'client-to-server',
      label:       'PSH·ACK',
      sublabel:    'seq=1  len=517',
      fromActor:   'client',
      toActor:     'server',
      phase:       'Transfer',
      color:       '#f59e0b',
      explanation: `Client sends 517 bytes of data (a TLS ClientHello in practice).
PSH=1 instructs the receiving TCP stack to push the data to the
application immediately, without waiting to fill its receive buffer.
The sequence number tells the receiver exactly where this data
fits in the overall byte stream.`,
      fields: {
        'Flags':       'PSH=1  ACK=1',
        'Seq Number':  '1',
        'Ack Number':  '1',
        'Window':      '64240 bytes',
        'Data length': '517 bytes',
        'Next seq':    '518  (1 + 517)',
      },
    },
    {
      id:          'ack_data',
      direction:   'server-to-client',
      label:       'ACK',
      sublabel:    'ack=518',
      fromActor:   'server',
      toActor:     'client',
      phase:       'Transfer',
      color:       '#22c55e',
      explanation: `Cumulative ACK: ack=518 confirms all bytes up through 517
were received correctly. If bytes 300–400 were missing, the server
would send ack=300 instead — holding the acknowledgment boundary
at the gap. This is what makes TCP reliable.`,
      fields: {
        'Flags':      'ACK=1',
        'Seq Number': '1',
        'Ack Number': '518  (1 + 517 — all data received)',
        'Window':     '64240 bytes',
        'Data':       '0 bytes',
      },
    },
    {
      id:          'fin',
      direction:   'client-to-server',
      label:       'FIN·ACK',
      sublabel:    'seq=518',
      fromActor:   'client',
      toActor:     'server',
      phase:       'Teardown',
      color:       '#8b5cf6',
      explanation: `Half-close: the client signals it has no more data to send,
but it can still receive. FIN consumes one sequence number, like SYN.
The connection enters FIN_WAIT_1. Server data already in flight
can still arrive and will be accepted.`,
      fields: {
        'Flags':      'FIN=1  ACK=1',
        'Seq Number': '518',
        'Ack Number': '1',
        'Window':     '64240 bytes',
        'Data':       '0 bytes',
      },
    },
    {
      id:          'finack',
      direction:   'server-to-client',
      label:       'FIN·ACK',
      sublabel:    'seq=1  ack=519',
      fromActor:   'server',
      toActor:     'client',
      phase:       'Teardown',
      color:       '#22c55e',
      explanation: `Server ACKs the client FIN (ack = 518 + 1 = 519) and
sends its own FIN in the same segment — the common optimization.
Client enters TIME_WAIT for 2×MSL (≈ 4 minutes) to ensure
this final ACK is received and to absorb any late duplicate segments.`,
      fields: {
        'Flags':      'FIN=1  ACK=1',
        'Seq Number': '1',
        'Ack Number': '519  (518 + 1)',
        'Window':     '65535 bytes',
        'Data':       '0 bytes',
      },
    },
    {
      id:          'last_ack',
      direction:   'client-to-server',
      label:       'ACK',
      sublabel:    'ack=2',
      fromActor:   'client',
      toActor:     'server',
      phase:       'Teardown',
      color:       '#52525b',
      explanation: `Final ACK closes the connection. The client stays in TIME_WAIT
to guarantee this ACK arrives — if it were lost, the server would
retransmit its FIN and the client needs to be able to respond.
After 2×MSL the port is released and can be reused.`,
      fields: {
        'Flags':      'ACK=1',
        'Seq Number': '519',
        'Ack Number': '2  (1 + 1)',
        'Window':     '64240 bytes',
        'State':      'TIME_WAIT → CLOSED after 2×MSL',
      },
    },
  ],
}
