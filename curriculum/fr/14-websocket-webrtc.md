# Jour 14 — WebSocket et WebRTC : le temps réel dans le navigateur

## La situation réelle

Vous construisez un outil collaboratif type Figma — plusieurs utilisateurs éditent le même document simultanément. Chaque modification doit apparaître chez tous les autres en moins de 100ms.

HTTP polling toutes les secondes ? Trop lent, trop cher. HTTP/2 Server Push ? Unidirectionnel. La solution : WebSocket.

---

## WebSocket — canal bidirectionnel persistant

WebSocket (RFC 6455) établit un canal **full-duplex** entre client et serveur sur une connexion TCP persistante.

### L'upgrade HTTP

WebSocket démarre comme une requête HTTP/1.1 ordinaire :

```
GET /ws HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
```

Le serveur répond 101 :
```
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

La connexion TCP reste ouverte mais le protocole change — plus d'HTTP, place au protocole WebSocket binaire.

### Le Sec-WebSocket-Accept

Le serveur prouve qu'il comprend WebSocket en calculant :
```
SHA1(Sec-WebSocket-Key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
→ encodé en base64
```

Ce "magic string" empêche un serveur HTTP ordinaire de répondre accidentellement à un upgrade WebSocket.

---

## Format des frames WebSocket

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-------+-+-------------+-------------------------------+
|F|R|R|R| opcode|M| Payload len |    Extended payload length    |
|I|S|S|S|  (4)  |A|     (7)     |             (16/63)           |
|N|V|V|V|       |S|             |                               |
| |1|2|3|       |K|             |                               |
+-+-+-+-+-------+-+-------------+-------------------------------+
```

Opcodes importants :
- `0x0` : continuation frame
- `0x1` : text frame (UTF-8)
- `0x2` : binary frame
- `0x8` : close
- `0x9` : ping
- `0xA` : pong

Les frames **client → serveur** sont toujours masquées (XOR avec une clé aléatoire de 4 octets). Protège les proxies intermédiaires des attaques par cache-poisoning.

---

## WebSocket en pratique

```javascript
// Côté client (navigateur)
const ws = new WebSocket('wss://example.com/ws')

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'join', room: 'doc-123' }))
}

ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  applyOperation(data)
}

ws.onclose = (event) => {
  console.log('Closed:', event.code, event.reason)
  // Reconnexion avec backoff exponentiel
  setTimeout(reconnect, Math.min(1000 * 2 ** attempts, 30000))
}

ws.onerror = (error) => {
  console.error('WebSocket error:', error)
}

// Ping/Pong pour keepalive
setInterval(() => ws.send(JSON.stringify({ type: 'ping' })), 30000)
```

```python
# Côté serveur (Python avec websockets)
import asyncio, websockets, json

async def handler(websocket):
    async for message in websocket:
        data = json.loads(message)
        # Broadcaster à tous les clients de la room
        await broadcast(data['room'], message)

asyncio.run(websockets.serve(handler, "0.0.0.0", 8765))
```

### SSE — Server-Sent Events (alternative unidirectionnelle)

Pour les flux **serveur → client uniquement**, SSE est plus simple que WebSocket :

```javascript
const evtSource = new EventSource('/events')
evtSource.onmessage = (event) => { console.log(event.data) }
evtSource.addEventListener('custom', handler)
```

```python
# Serveur
def stream():
    yield "data: hello\n\n"  # format SSE
    yield "data: world\n\n"
    yield "event: custom\ndata: {}\n\n".format(json.dumps(data))
```

SSE : HTTP standard, reconnexion automatique, event IDs, unidirectionnel.
WebSocket : bidirectionnel, custom protocol, plus de contrôle.

---

## WebRTC — peer-to-peer dans le navigateur

WebRTC (Web Real-Time Communication) permet des connexions **directes** entre navigateurs pour la voix, la vidéo, et les données — sans passer par le serveur pour le flux média.

### Architecture WebRTC

```
Navigateur A                    Navigateur B
     │                               │
     │  ←── Signaling (WebSocket) ──►│
     │       SDP offer/answer         │
     │       ICE candidates           │
     │                               │
     │ ←──────── DTLS + SRTP ───────►│
     │       (connexion directe P2P)  │
     │                               │
     [Serveur STUN/TURN]
     (aide à traverser les NAT)
```

### La négociation SDP

SDP (Session Description Protocol) décrit les capacités de chaque pair :
- Codecs audio/vidéo supportés (Opus, VP8, H.264)
- Adresses IP et ports disponibles (ICE candidates)
- Paramètres de chiffrement DTLS

```
Offrant → "voici mes capacités" (SDP offer)
Répondant → "voici les miennes + j'accepte ces codecs" (SDP answer)
```

L'échange SDP passe par un **serveur de signaling** (WebSocket ou HTTP) que vous contrôlez. WebRTC ne définit pas le protocole de signaling.

### ICE — traversée des NAT

Pour établir une connexion P2P, les deux pairs doivent se "trouver" malgré les NAT.

ICE (Interactive Connectivity Establishment) essaie plusieurs types de candidats en ordre :

1. **Host candidates** : adresses IP locales directes (si même réseau)
2. **Server-reflexive (STUN)** : IP publique découverte via un serveur STUN
3. **Relay (TURN)** : passage via un serveur relai (dernier recours)

```javascript
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:turn.example.com',
      username: 'user',
      credential: 'password'
    }
  ]
})
```

### Chiffrement DTLS + SRTP

WebRTC chiffre **toujours** :
- **DTLS** (Datagram TLS) pour l'échange de clés
- **SRTP** (Secure RTP) pour les flux audio/vidéo

Il n'existe pas de WebRTC non chiffré. Même sur un intranet.

### Exemple minimal : partage vidéo

```javascript
// Obtenir la caméra
const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })

// Créer la connexion
const pc = new RTCPeerConnection(config)
stream.getTracks().forEach(track => pc.addTrack(track, stream))

// Collecter les ICE candidates
pc.onicecandidate = (event) => {
  if (event.candidate) {
    signalingServer.send({ candidate: event.candidate })
  }
}

// Créer l'offre
const offer = await pc.createOffer()
await pc.setLocalDescription(offer)
signalingServer.send({ sdp: offer })
```

---

## Comparaison WebSocket vs SSE vs WebRTC

| | WebSocket | SSE | WebRTC |
|-|-----------|-----|--------|
| Direction | Bidirectionnel | Serveur → client | P2P bidirectionnel |
| Transport | TCP | HTTP/TCP | DTLS/SRTP (UDP) |
| NAT traversal | Non | Non | Oui (ICE/STUN/TURN) |
| Codecs média | Non | Non | Opus, VP8, H.264 |
| Cas d'usage | Chat, collaboration | Notifications, flux | Visio, partage écran |
| Complexité | Moyenne | Faible | Élevée |

---

## Exercice pratique

```bash
# Inspecter WebSocket dans Chrome DevTools
# → Onglet Network → Filtrer WS
# → Cliquer sur une connexion WS → onglet Messages

# Capturer avec tcpdump (tout est chiffré via WSS)
sudo tcpdump -i any -nn "tcp port 443" -X | head -100

# Tester WebSocket localement
# Installer wscat
npm install -g wscat
wscat -c ws://echo.websocket.org
# Taper un message → il est renvoyé
```

---

## À retenir

- WebSocket : upgrade HTTP → TCP persistent bidirectionnel
- `Sec-WebSocket-Key` / `Sec-WebSocket-Accept` : handshake de validation
- Frames masquées client→serveur (protection cache poisoning)
- SSE : plus simple pour unidirectionnel, reconnexion automatique
- WebRTC : P2P navigateur, ICE/STUN/TURN pour NAT, DTLS+SRTP obligatoire
- STUN : découvrir son IP publique | TURN : relai si P2P impossible
