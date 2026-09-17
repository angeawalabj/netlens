/**
 * Hub — Main Entry Point
 *
 * Animates the hero packet stream panel.
 * Nothing else — the hub has no application logic.
 */

const TLS_PACKETS = [
  { delay: 0,    dir: 'right', desc: 'ClientHello  TLS 1.3 + key_share X25519',  size: '320 B'  },
  { delay: 600,  dir: 'left',  desc: 'ServerHello  cipher=TLS_AES_256_GCM_SHA384', size: '89 B'  },
  { delay: 1100, dir: 'left',  desc: 'Certificate  [encrypted]  ECDSA P-256',     size: '1.2 KB' },
  { delay: 1500, dir: 'left',  desc: 'Finished  HMAC-SHA384 transcript',           size: '52 B'  },
  { delay: 1900, dir: 'right', desc: 'Finished  [encrypted]  session keys ready',  size: '52 B'  },
  { delay: 2400, dir: 'right', desc: 'AppData  GET /v1/charges  [opaque]',         size: '220 B' },
  { delay: 2900, dir: 'left',  desc: 'AppData  200 OK  content-length=1842',       size: '1.8 KB'},
]

function formatTime() {
  const d = new Date()
  return [
    d.getHours().toString().padStart(2, '0'),
    d.getMinutes().toString().padStart(2, '0'),
    d.getSeconds().toString().padStart(2, '0'),
  ].join(':') + '.' + d.getMilliseconds().toString().padStart(3, '0').slice(0, 2)
}

function animatePanel() {
  const body = document.getElementById('packetStream')
  if (!body) return

  body.innerHTML = ''

  TLS_PACKETS.forEach(({ delay, dir, desc, size }) => {
    setTimeout(() => {
      const row = document.createElement('div')
      row.className = 'pkt-row'
      row.style.animationDelay = '0ms'
      row.innerHTML = `
        <span class="pkt-row__time font-mono">${formatTime()}</span>
        <span class="pkt-row__dir pkt-row__dir--${dir}">${dir === 'right' ? '→' : '←'}</span>
        <span class="pkt-row__desc font-mono">${desc}</span>
        <span class="pkt-row__size font-mono">${size}</span>`
      body.appendChild(row)
    }, delay)
  })

  // Replay after full cycle
  const total = TLS_PACKETS[TLS_PACKETS.length - 1].delay + 3500
  setTimeout(animatePanel, total)
}

// Start animation once DOM is ready
animatePanel()
