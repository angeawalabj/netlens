/**
 * DNS Protocol Definition
 * RFC 1034 · RFC 1035 · RFC 8484 (DoH)
 */
export const DNS = {
  id:       'dns',
  label:    'DNS',
  subtitle: 'Domain Name System — recursive resolution',
  color:    '#22d3ee',
  rfc:      'RFC 1034 · RFC 1035',
  layer:    'Layer 7 — Application (over UDP/TCP)',

  actors: [
    { id: 'client',   label: 'CLIENT',   address: '192.168.1.10'       },
    { id: 'resolver', label: 'RESOLVER', address: '8.8.8.8 (recursive)'},
    { id: 'root',     label: 'ROOT NS',  address: '198.41.0.4 (a.root)'},
    { id: 'tld',      label: 'TLD .com', address: '192.5.6.30'         },
    { id: 'auth',     label: 'AUTH NS',  address: 'ns1.stripe.com'     },
  ],

  faults: [
    {
      id:         'nxdomain',
      label:      'Return NXDOMAIN',
      targetStep: 6,
      effect:     'Name does not exist — resolver returns RCODE=3 to client',
    },
    {
      id:         'root_timeout',
      label:      'Root server timeout',
      targetStep: 1,
      effect:     'Resolver retries with next root server (b.root-servers.net)',
    },
    {
      id:         'cache_poison',
      label:      'Cache poisoning (Kaminsky)',
      targetStep: 5,
      effect:     'Forged answer cached — wrong IP served to all clients',
    },
  ],

  steps: [
    {
      id: 'q_resolver', direction: 'client-to-server',
      label: 'QUERY', sublabel: 'api.stripe.com IN A',
      fromActor: 'client', toActor: 'resolver',
      phase: 'Recursive Query', color: '#22d3ee',
      explanation: `Client sends a UDP query to its configured recursive resolver.
RD=1 (Recursion Desired) asks the resolver to do the full lookup.
Transaction ID (0x1a2b) matches the response to this request.
The resolver checks its cache first — a cache hit ends the process here.`,
      fields: {
        'Transport':    'UDP port 53',
        'Transaction':  '0x1a2b',
        'Flags':        'QR=0 (query)  RD=1  AD=0',
        'Question':     'api.stripe.com. IN A',
        'EDNS0':        'bufsize=4096  DO=0 (DNSSEC not requested)',
      },
    },
    {
      id: 'q_root', direction: 'client-to-server',
      label: 'QUERY', sublabel: '→ root server',
      fromActor: 'resolver', toActor: 'root',
      phase: 'Root Delegation', color: '#22d3ee',
      explanation: `Cache miss — resolver queries a root server.
There are 13 root server clusters (a–m.root-servers.net),
each anycast-routed to hundreds of locations worldwide.
Root servers know nothing about specific domains —
they only know who manages each TLD.`,
      fields: {
        'Destination': 'a.root-servers.net (198.41.0.4)',
        'Question':    'api.stripe.com. IN A',
        'RD':          '0 (resolver handles recursion itself)',
      },
    },
    {
      id: 'r_root', direction: 'server-to-client',
      label: 'REFERRAL', sublabel: '.com NS delegation',
      fromActor: 'root', toActor: 'resolver',
      phase: 'Root Delegation', color: '#22d3ee',
      explanation: `Root server does not know api.stripe.com.
It returns a referral: "ask the .com TLD servers."
The Authority section contains NS records for .com.
The Additional section has glue A records so the resolver
does not need a separate lookup for the NS addresses.`,
      fields: {
        'QR':        '1 (response)',
        'AA':        '0 (not authoritative — delegation only)',
        'Authority': 'com. 172800 IN NS a.gtld-servers.net',
        'Additional':'a.gtld-servers.net. A 192.5.6.30  (glue record)',
      },
    },
    {
      id: 'q_tld', direction: 'client-to-server',
      label: 'QUERY', sublabel: 'stripe.com NS?',
      fromActor: 'resolver', toActor: 'tld',
      phase: 'TLD Delegation', color: '#22d3ee',
      explanation: `Resolver now queries the .com TLD servers (operated by Verisign).
These servers maintain NS delegations for every registered .com domain.
They do not store individual host records — only the name server
delegations for each second-level domain.`,
      fields: {
        'Destination': 'a.gtld-servers.net (192.5.6.30)',
        'Question':    'api.stripe.com. IN A',
      },
    },
    {
      id: 'r_tld', direction: 'server-to-client',
      label: 'REFERRAL', sublabel: 'stripe.com NS',
      fromActor: 'tld', toActor: 'resolver',
      phase: 'TLD Delegation', color: '#22d3ee',
      explanation: `TLD server returns NS records for stripe.com and glue records
with the IP addresses of those name servers. The resolver now knows
exactly which servers are authoritative for the stripe.com zone.`,
      fields: {
        'AA':        '0',
        'Authority': 'stripe.com. 172800 IN NS ns1.stripe.com',
        'Additional':'ns1.stripe.com. A 205.251.196.1  (glue)',
      },
    },
    {
      id: 'q_auth', direction: 'client-to-server',
      label: 'QUERY', sublabel: 'api.stripe.com IN A',
      fromActor: 'resolver', toActor: 'auth',
      phase: 'Authoritative Answer', color: '#22d3ee',
      explanation: `Resolver queries the authoritative name server for stripe.com.
This server holds the actual zone file and can answer definitively.
If DNSSEC is enabled, the response will include RRSIG signatures
for cryptographic verification of the answer.`,
      fields: {
        'Destination': 'ns1.stripe.com (205.251.196.1)',
        'Question':    'api.stripe.com. IN A',
        'DNSSEC':      'Not requested (DO=0)',
      },
    },
    {
      id: 'r_auth', direction: 'server-to-client',
      label: 'ANSWER', sublabel: '54.187.168.41  TTL=300',
      fromActor: 'auth', toActor: 'resolver',
      phase: 'Authoritative Answer', color: '#22c55e',
      explanation: `Authoritative Answer: AA=1. The A record and its TTL.
TTL=300 means the resolver may cache this answer for 5 minutes.
This is the definitive answer — no more delegations.
The resolver stores this in its cache for 300 seconds.`,
      fields: {
        'QR': '1', 'AA': '1  ← authoritative',
        'Answer': 'api.stripe.com. 300 IN A 54.187.168.41',
        'TTL':    '300 seconds',
      },
    },
    {
      id: 'r_client', direction: 'server-to-client',
      label: 'ANSWER', sublabel: '54.187.168.41 (cached)',
      fromActor: 'resolver', toActor: 'client',
      phase: 'Response to Client', color: '#22c55e',
      explanation: `Resolver forwards the answer to the client and caches it.
RA=1 (Recursion Available) confirms the resolver supports recursion.
Subsequent queries within 300s are served from cache in <1ms.
Cold resolution typically takes 30–80ms for the full chain.`,
      fields: {
        'RA':      '1 (recursion available)',
        'Answer':  'api.stripe.com. 300 IN A 54.187.168.41',
        'Latency': '~55ms (full cold resolution)',
        'Cache':   'Stored for 300s — next query = instant',
      },
    },
  ],
}

// ─────────────────────────────────────────────────────

/**
 * TLS 1.3 Protocol Definition
 * RFC 8446
 */
export const TLS = {
  id:       'tls',
  label:    'TLS 1.3',
  subtitle: 'Transport Layer Security — full handshake',
  color:    '#22c55e',
  rfc:      'RFC 8446',
  layer:    'Layer 4–7 — Security (between TCP and HTTP)',

  actors: [
    { id: 'client', label: 'CLIENT', address: 'port :443'        },
    { id: 'server', label: 'SERVER', address: 'api.example.com'  },
  ],

  faults: [
    {
      id: 'expired_cert',   label: 'Certificate expired',
      targetStep: 2,
      effect: 'alert: certificate_expired (45) — handshake aborted',
    },
    {
      id: 'unknown_ca',     label: 'Unknown CA',
      targetStep: 2,
      effect: 'alert: unknown_ca (48) — CA not in trust store',
    },
    {
      id: 'version_mismatch', label: 'Server only supports TLS 1.1',
      targetStep: 0,
      effect: 'alert: protocol_version (70) — no common version',
    },
  ],

  steps: [
    {
      id: 'client_hello', direction: 'client-to-server',
      label: 'ClientHello', sublabel: 'TLS 1.3 + key_share X25519',
      fromActor: 'client', toActor: 'server',
      phase: 'Handshake', color: '#3b82f6',
      explanation: `The client opens negotiation and — unique to TLS 1.3 —
sends its ECDHE key share (X25519) immediately.
This means the server has everything it needs to respond
in a single round trip. TLS 1.2 required 2 RTT for the same.`,
      fields: {
        'Record type':   '0x16 (Handshake)',
        'Handshake type':'1 (ClientHello)',
        'Cipher suites': 'TLS_AES_256_GCM_SHA384  TLS_CHACHA20_POLY1305_SHA256',
        'Extensions':    'supported_versions  key_share  SNI  ALPN  session_ticket',
        'Key share':     'X25519 public key (32 bytes)',
        'SNI':           'api.example.com  (visible in plaintext — see ECH)',
      },
    },
    {
      id: 'server_hello', direction: 'server-to-client',
      label: 'ServerHello', sublabel: 'cipher selected + key_share',
      fromActor: 'server', toActor: 'client',
      phase: 'Handshake', color: '#22c55e',
      explanation: `Server selects cipher suite and sends its X25519 key share.
Both parties independently compute the same ECDH shared secret.
All subsequent records are encrypted from this point forward.
TLS 1.3 derives multiple keys from this secret via HKDF.`,
      fields: {
        'Cipher selected': 'TLS_AES_256_GCM_SHA384',
        'Key share':       'Server X25519 public key (32 bytes)',
        '⚡ ECDH secret':  'Both sides derive identical handshake secret',
        'Encryption':      'Active from this point — all following records opaque',
      },
    },
    {
      id: 'certificate', direction: 'server-to-client',
      label: 'Certificate', sublabel: '[encrypted]  ECDSA P-256',
      fromActor: 'server', toActor: 'client',
      phase: 'Authentication', color: '#22c55e',
      explanation: `Certificate is sent encrypted (unlike TLS 1.2).
Client validates three things:
(1) chain of trust up to a trusted root CA,
(2) NotAfter date has not passed,
(3) Subject Alternative Name matches the SNI sent.
CertificateVerify proves server possesses the matching private key.`,
      fields: {
        'Record type':  '0x17 (ApplicationData — encrypted)',
        'Subject':      'api.example.com',
        'SAN':          'api.example.com',
        'Issuer':       "Let's Encrypt E1",
        'NotAfter':     '2025-06-01',
        'CertVerify':   'ECDSA signature over handshake transcript hash',
      },
    },
    {
      id: 'server_finished', direction: 'server-to-client',
      label: 'Finished', sublabel: '[encrypted]  HMAC-SHA384',
      fromActor: 'server', toActor: 'client',
      phase: 'Authentication', color: '#22c55e',
      explanation: `HMAC over the complete handshake transcript.
Any MITM modification to any earlier message would produce
a different hash here — immediately detected.
This binds the key exchange to the authentication step.`,
      fields: {
        'Content': 'HMAC-SHA384 of full handshake transcript',
        'Key':     'server_finished_key (derived via HKDF)',
        'Purpose': 'Transcript integrity — detects any MITM modification',
      },
    },
    {
      id: 'client_finished', direction: 'client-to-server',
      label: 'Finished', sublabel: '[encrypted]',
      fromActor: 'client', toActor: 'server',
      phase: 'Authentication', color: '#3b82f6',
      explanation: `Client confirms the handshake transcript matches.
Session keys are now fully derived:
client_write_key, server_write_key, client_write_IV, server_write_IV.
The session is established. Total cost: 1 RTT.`,
      fields: {
        'Content':      'HMAC-SHA384 of transcript',
        '🔐 Keys ready':'client_write_key  server_write_key  IVs',
        'Derivation':   'HKDF-Expand-Label (SHA-384)',
        'Total RTT':    '1  (vs 2 in TLS 1.2)',
      },
    },
    {
      id: 'app_data', direction: 'client-to-server',
      label: 'Application Data', sublabel: '[opaque]  HTTP/2 GET',
      fromActor: 'client', toActor: 'server',
      phase: 'Data', color: '#f59e0b',
      explanation: `Encrypted application data. An observer sees only:
record type 0x17, approximate length, and timing.
HTTP method, path, headers, and body are all hidden.
The hostname was visible in SNI — ECH (Encrypted Client Hello)
would hide even that.`,
      fields: {
        'Record type': '0x17 (ApplicationData)',
        'Encryption':  'AES-256-GCM  nonce = IV ⊕ sequence_number',
        'AEAD tag':    '16 bytes (authenticity guarantee)',
        'Observable':  'Record length + timing only',
        'Hidden':      'HTTP method  path  headers  body',
      },
    },
  ],
}

// ─────────────────────────────────────────────────────

/**
 * HTTP/1.1 → HTTP/2 Protocol Definition
 */
export const HTTP = {
  id:       'http',
  label:    'HTTP/1.1 → /2',
  subtitle: 'From sequential to multiplexed',
  color:    '#8b5cf6',
  rfc:      'RFC 9110 · RFC 9113',
  layer:    'Layer 7 — Application',

  actors: [
    { id: 'client', label: 'BROWSER', address: 'Chrome 124'       },
    { id: 'server', label: 'ORIGIN',  address: 'cdn.example.com'  },
  ],

  faults: [
    {
      id: 'hol_block',  label: 'Simulate HOL Blocking',
      targetStep: 2,
      effect: 'All pending requests wait behind the slow resource',
    },
    {
      id: 'err_503',    label: '503 Service Unavailable',
      targetStep: 3,
      effect: 'Client retry logic triggered — exponential backoff',
    },
    {
      id: 'redirect',   label: '301 Moved Permanently (http→https)',
      targetStep: 0,
      effect: 'Browser follows redirect — extra RTT before content',
    },
  ],

  steps: [
    {
      id: 'h1_get', direction: 'client-to-server',
      label: 'GET /index.html', sublabel: 'HTTP/1.1',
      fromActor: 'client', toActor: 'server',
      phase: 'HTTP/1.1', color: '#8b5cf6',
      explanation: `HTTP/1.1 text-based request over a persistent TCP connection.
Connection: keep-alive reuses the TCP connection for subsequent
requests. However, without pipelining, each request must wait
for the previous response before being sent — Head-of-Line Blocking.`,
      fields: {
        'Method':          'GET  /index.html  HTTP/1.1',
        'Host':            'cdn.example.com',
        'Connection':      'keep-alive',
        'Accept':          'text/html,application/xhtml+xml',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    },
    {
      id: 'h1_response', direction: 'server-to-client',
      label: '200 OK', sublabel: 'text/html  46 KB',
      fromActor: 'server', toActor: 'client',
      phase: 'HTTP/1.1', color: '#22c55e',
      explanation: `Server responds with the HTML. The browser must parse the HTML
to discover referenced resources (CSS, JS, fonts, images)
and then issue new requests for each one.
This parse-then-request cycle is an inherent HTTP/1.1 latency.`,
      fields: {
        'Status':          '200 OK',
        'Content-Type':    'text/html; charset=utf-8',
        'Content-Length':  '46080',
        'Cache-Control':   'no-cache',
        'Transfer-Encoding': 'chunked',
      },
    },
    {
      id: 'h1_parallel', direction: 'client-to-server',
      label: '6 parallel GETs', sublabel: '⚠ 6 TCP connections max',
      fromActor: 'client', toActor: 'server',
      phase: 'HTTP/1.1 — HOL Blocking', color: '#f59e0b',
      explanation: `Head-of-Line Blocking: requests on a single connection queue.
Browsers open up to 6 parallel TCP connections per origin
to work around this. Each connection requires its own TCP
three-way handshake and TLS handshake — significant overhead.`,
      fields: {
        'Connections':  '6 parallel TCP+TLS — one per resource',
        'Connection A': 'GET /main.css',
        'Connection B': 'GET /app.js',
        'Connection C': 'GET /font.woff2',
        'Overhead':     '6 × (TCP RTT + TLS RTT) — every page load',
      },
    },
    {
      id: 'h2_alpn', direction: 'client-to-server',
      label: 'ClientHello  ALPN: h2', sublabel: 'HTTP/2 negotiation',
      fromActor: 'client', toActor: 'server',
      phase: 'HTTP/2 Upgrade', color: '#8b5cf6',
      explanation: `ALPN (Application-Layer Protocol Negotiation) is a TLS extension.
The client lists supported application protocols during the TLS handshake.
If the server supports h2, it selects it. No extra round trip, no
URL change, same port 443. All browsers require TLS for HTTP/2.`,
      fields: {
        'TLS Extension':   'ALPN (type 0x0010)',
        'Client proposes': '[h2, http/1.1]',
        'Server selects':  'h2',
        'Constraint':      'All browsers require TLS — no cleartext h2c',
      },
    },
    {
      id: 'h2_mux', direction: 'client-to-server',
      label: 'HEADERS ×3  (streams 1,3,5)', sublabel: '✓ Multiplexed',
      fromActor: 'client', toActor: 'server',
      phase: 'HTTP/2 — Multiplexing', color: '#8b5cf6',
      explanation: `HTTP/2 multiplexing: 3 requests sent simultaneously over one
TCP connection using different stream IDs. Binary framing replaces
text parsing. HPACK header compression reduces header size by ~80%
by maintaining a shared compression table between client and server.`,
      fields: {
        'Frame type': 'HEADERS (binary — not text)',
        'Stream 1':   'GET /index.html',
        'Stream 3':   'GET /main.css  (concurrent — no waiting)',
        'Stream 5':   'GET /app.js   (concurrent — no waiting)',
        'HPACK':      'Dynamic table compression — ~80% header reduction',
        'Overhead':   '1 TCP  +  1 TLS — shared by all streams',
      },
    },
    {
      id: 'h2_responses', direction: 'server-to-client',
      label: 'DATA (streams 1,3,5)', sublabel: 'Interleaved — any order',
      fromActor: 'server', toActor: 'client',
      phase: 'HTTP/2 — Multiplexing', color: '#22c55e',
      explanation: `Responses can arrive in any order. Stream 3 (CSS) may
complete before Stream 1 (HTML). If Stream 5 stalls, Streams 1
and 3 continue unaffected — HTTP-level HOL blocking is solved.
Note: TCP-level HOL blocking remains and is solved by QUIC/HTTP/3.`,
      fields: {
        'Stream 3':   '200 OK  text/css  (fastest, arrives first)',
        'Stream 5':   '200 OK  application/js',
        'Stream 1':   '200 OK  text/html',
        'TCP HOL':    'Still present at L4 — eliminated by QUIC (HTTP/3)',
        'Gain vs H1': '2–4× fewer round trips for pages with 10+ resources',
      },
    },
  ],
}

// ─────────────────────────────────────────────────────

/**
 * MQTT Protocol Definition
 * RFC / OASIS MQTT 5.0
 */
export const MQTT = {
  id:       'mqtt',
  label:    'MQTT',
  subtitle: 'Publish/Subscribe messaging for IoT',
  color:    '#f97316',
  rfc:      'OASIS MQTT 5.0',
  layer:    'Layer 7 — Application (over TCP)',

  actors: [
    { id: 'client', label: 'DEVICE',  address: 'thermostat-salon-01' },
    { id: 'broker', label: 'BROKER',  address: 'mqtt.example.com:1883' },
  ],

  faults: [
    {
      id: 'bad_auth',    label: 'Bad credentials (CONNACK 0x04)',
      targetStep: 0,
      effect: 'CONNACK return code 0x04 — connection refused',
    },
    {
      id: 'lwt_trigger', label: 'Unexpected disconnect → LWT',
      targetStep: 2,
      effect: 'Broker publishes LWT: {"online":false} to status topic',
    },
    {
      id: 'qos2_dup',    label: 'QoS 2 duplicate delivery (DUP=1)',
      targetStep: 4,
      effect: 'PUBREC idempotency check — duplicate silently discarded',
    },
  ],

  steps: [
    {
      id: 'connect', direction: 'client-to-server',
      label: 'CONNECT', sublabel: 'clientId + LWT configured',
      fromActor: 'client', toActor: 'broker',
      phase: 'Session Setup', color: '#f97316',
      explanation: `After TCP connection, client sends CONNECT.
The Last Will and Testament (LWT) is configured here —
the broker will publish this message on the client's behalf
if the client disconnects without sending DISCONNECT cleanly.
Clean Start = 1 requests a fresh session (no queued messages).`,
      fields: {
        'Protocol':    'MQTT 5.0  (0x05)',
        'ClientId':    'thermostat-salon-01',
        'Keep Alive':  '60 seconds',
        'LWT Topic':   'sensors/salon/status',
        'LWT Payload': '{"online":false,"ts":0}',
        'LWT QoS':     '1',
        'Clean Start': '1  (new session — discard previous state)',
      },
    },
    {
      id: 'connack', direction: 'server-to-client',
      label: 'CONNACK', sublabel: 'RC=0x00  Session Present=0',
      fromActor: 'broker', toActor: 'client',
      phase: 'Session Setup', color: '#22c55e',
      explanation: `Broker accepts the connection. MQTT 5.0 returns rich properties:
server-assigned keep-alive, receive maximum for flow control,
and reason strings for human-readable debugging.
Return code 0x04 = bad credentials (rate-limit CONNECT attempts).`,
      fields: {
        'Return Code':     '0x00  Success',
        'Session Present': '0  (new session)',
        'Server Keep Alive': '60s',
        'Receive Maximum': '65535',
        'Maximum QoS':     '2',
        'Retain Available':'true',
      },
    },
    {
      id: 'subscribe', direction: 'client-to-server',
      label: 'SUBSCRIBE', sublabel: 'sensors/+/commands  QoS 1',
      fromActor: 'client', toActor: 'broker',
      phase: 'Subscription', color: '#f97316',
      explanation: `Wildcard subscription. '+' matches exactly one topic level.
'sensors/+/commands' matches sensors/salon/commands,
sensors/kitchen/commands, etc.
QoS 1 ensures each message is delivered at least once
with PUBACK confirmation — suitable for non-critical commands.`,
      fields: {
        'Packet ID':      '0x0001',
        'Topic Filter':   'sensors/+/commands',
        'QoS Requested':  '1  (At Least Once)',
        'Sub ID':         '1  (MQTT 5.0 — correlate deliveries to this sub)',
      },
    },
    {
      id: 'suback', direction: 'server-to-client',
      label: 'SUBACK', sublabel: 'QoS 1 granted',
      fromActor: 'broker', toActor: 'client',
      phase: 'Subscription', color: '#22c55e',
      explanation: `Broker confirms subscription at the granted QoS level.
The broker may grant a lower QoS than requested (policy enforcement).
From this point, all matching messages are queued and delivered
to this client at the negotiated QoS.`,
      fields: {
        'Packet ID':   '0x0001  (echo of SUBSCRIBE)',
        'Reason Code': '0x01  QoS 1 granted',
      },
    },
    {
      id: 'publish', direction: 'client-to-server',
      label: 'PUBLISH', sublabel: 'sensors/salon/temp  Retain=1',
      fromActor: 'client', toActor: 'broker',
      phase: 'Data Flow', color: '#f97316',
      explanation: `Client publishes a temperature reading.
Retain=1 tells the broker to store this as the "last known value"
for this topic — new subscribers receive it immediately on subscribe,
even if no new reading is published. Essential for state topics.`,
      fields: {
        'Topic':    'sensors/salon/temperature',
        'Payload':  '{"temp":23.5,"unit":"C","ts":1710500412}',
        'QoS':      '1',
        'Retain':   '1  (broker stores last value for new subscribers)',
        'Packet ID':'0x0002',
        'DUP':      '0  (first delivery attempt)',
      },
    },
    {
      id: 'puback', direction: 'server-to-client',
      label: 'PUBACK', sublabel: 'Packet ID=0x0002',
      fromActor: 'broker', toActor: 'client',
      phase: 'Data Flow', color: '#22c55e',
      explanation: `QoS 1 acknowledgment. Without this PUBACK, the client
retransmits with DUP=1 after timeout. Note: PUBACK means
"I accepted this message for delivery" — not "subscribers received it."
The delivery to subscribers is a separate concern.`,
      fields: {
        'Packet ID':   '0x0002  (echo of PUBLISH)',
        'Reason Code': '0x00  Success',
        'Note':        'QoS 1 = at-least-once — application must handle duplicates',
      },
    },
    {
      id: 'fan_out', direction: 'client-to-server',
      label: 'PUBLISH (fan-out)', sublabel: '→ all matching subscribers',
      fromActor: 'broker', toActor: 'client',
      phase: 'Fan-out', color: '#f97316',
      explanation: `Broker delivers to all subscribers matching the topic.
A monitoring app subscribed to 'sensors/#' receives this message.
One PUBLISH from the sensor reaches N subscribers — the broker
handles all the fan-out logic. This is the core value of pub/sub.`,
      fields: {
        'From':   'broker → monitoring-app (subscriber)',
        'Topic':  'sensors/salon/temperature',
        'QoS':    '1  (broker → subscriber delivery leg)',
        'Model':  '1 publisher → N subscribers via broker',
      },
    },
    {
      id: 'keepalive', direction: 'client-to-server',
      label: 'PINGREQ / PINGRESP', sublabel: 'keep-alive maintenance',
      fromActor: 'client', toActor: 'broker',
      phase: 'Keep-Alive', color: '#52525b',
      explanation: `If no other packets flow within Keep Alive seconds,
client sends PINGREQ — the smallest MQTT packet at 2 bytes.
Broker responds PINGRESP. If broker receives nothing for
1.5 × Keep Alive (90s), it considers the client dead
and triggers the LWT: {"online":false} is published.`,
      fields: {
        'PINGREQ':  '2 bytes total (fixed header only)',
        'PINGRESP': '2 bytes total',
        'Timeout':  '90s without any packet → LWT triggered',
        'LWT sent': 'sensors/salon/status ← {"online":false}',
      },
    },
  ],
}
