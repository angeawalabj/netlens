/**
 * Question Bank
 *
 * Single source of truth for all assessment questions.
 * This file has one reason to change: question content needs updating.
 *
 * Full 90-question bank is defined in packages/quiz/src/main.js
 * for the standalone build. This module exports the canonical source
 * used by @netlens/core quiz engine in tests and future integrations.
 *
 * Question schema:
 *   id      {number}   - Unique identifier, never reused
 *   type    {1|2|3|4|5}- Cognitive level
 *   week    {1|2|3|4}  - Curriculum week
 *   q       {string}   - Question text
 *   ch      {string[]} - Answer choices (2-5)
 *   ok      {number[]} - Correct answer indices (0-based)
 *   multi   {boolean}  - Multiple correct answers allowed
 *   x       {string=}  - Optional context block (code, scenario)
 *   e       {string}   - Explanation shown after answering
 *   c       {string}   - Concept tag (short, monospace reference)
 */

export const QUESTIONS = [
  {
    id: 1, type: 1, week: 1,
    q:   'What OSI layer does IP operate at?',
    ch:  ['Layer 2 — Data Link', 'Layer 3 — Network', 'Layer 4 — Transport', 'Layer 5 — Session'],
    ok:  [1], multi: false,
    e:   'IP operates at Layer 3 (Network). It handles logical addressing (IP addresses) and routing between networks. Layer 2 handles physical addressing (MAC) on a single LAN.',
    c:   'OSI L3 = IP, ICMP, IGMP | L2 = Ethernet, ARP | L4 = TCP, UDP',
  },
  {
    id: 2, type: 1, week: 1,
    q:   'What is the size of an IPv4 address?',
    ch:  ['16 bits', '32 bits', '48 bits', '128 bits'],
    ok:  [1], multi: false,
    e:   'IPv4 addresses are 32 bits — four octets in dotted-decimal notation. 2³² ≈ 4.3 billion addresses. IPv6 addresses are 128 bits.',
    c:   'IPv4 = 32 bits | IPv6 = 128 bits | MAC = 48 bits',
  },
  {
    id: 3, type: 1, week: 1,
    q:   'Which protocol resolves an IP address to a MAC address on a local network?',
    ch:  ['DNS', 'DHCP', 'ARP', 'ICMP'],
    ok:  [2], multi: false,
    e:   'ARP (Address Resolution Protocol) broadcasts: "Who has IP X?" The machine with that IP replies with its MAC address. ARP operates at Layer 2 and does not cross routers.',
    c:   'ARP: IP → MAC | Gratuitous ARP = unsolicited announcement | Proxy ARP = router answers for remote hosts',
  },
  {
    id: 4, type: 2, week: 2,
    q:   'A TCP segment is lost in transit. What happens?',
    ch:  [
      'It is silently ignored',
      'IP reroutes it automatically',
      'TCP detects loss via timeout or duplicate ACKs and retransmits',
      'Client switches to UDP',
    ],
    ok:  [2], multi: false,
    e:   'TCP detects loss two ways: (1) RTO timeout — no ACK received within the retransmission timeout; (2) 3 duplicate ACKs — fast retransmit. Both cause retransmission of the lost segment.',
    c:   'Loss detection: RTO timeout OR 3 dup ACKs (fast retransmit) | cwnd halved on loss',
  },
  {
    id: 5, type: 3, week: 3,
    q:   'A site is reachable by IP but not by hostname. Most likely cause?',
    ch:  [
      'Web server misconfiguration',
      'Expired TLS certificate',
      'DNS resolution failure — missing or incorrect A record',
      'Port 443 blocked by firewall',
    ],
    ok:  [2], multi: false,
    x:   'Symptom: http://203.0.113.5 → OK | https://www.example.com → timeout',
    e:   'If direct IP access works, the network and server are functional. The hostname failure points to DNS: the A record is missing, points to wrong IP, or a recent change has not propagated yet.',
    c:   'Diagnose: dig example.com A | Check TTL propagation | Separate DNS vs TLS vs server issues',
  },
]

export const QUESTION_COUNT = QUESTIONS.length

/**
 * Get questions filtered by type.
 * @param {number} type
 * @returns {typeof QUESTIONS}
 */
export function getByType(type) {
  return QUESTIONS.filter(q => q.type === type)
}

/**
 * Get questions filtered by curriculum week.
 * @param {number} week
 * @returns {typeof QUESTIONS}
 */
export function getByWeek(week) {
  return QUESTIONS.filter(q => q.week === week)
}
