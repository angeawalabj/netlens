# Jour 30 — Synthèse : tout connecter

## 30 jours en 30 secondes

Quand vous appuyez Entrée après `https://api.stripe.com/v1/charges` :

```
1. DNS
   → Résolveur récursif (8.8.8.8)
   → Serveurs racine → .com TLD → ns.stripe.com (authoritaire)
   → A record: 54.187.168.41, TTL=300
   Coût: ~30ms (première fois), <1ms (cache)

2. TCP Three-Way Handshake (vers 54.187.168.41:443)
   SYN → SYN-ACK → ACK
   Coût: 1 RTT (~80ms Paris-SF)

3. TLS 1.3 Handshake (1 RTT)
   ClientHello (key_share X25519, SNI: api.stripe.com)
   ServerHello + Certificate + Finished
   Client Finished + AppData (déjà chiffré)
   Coût: 1 RTT supplémentaire

4. HTTP/2 Request
   GET /v1/charges HTTP/2
   Headers compressés (HPACK)
   Stream multiplexé sur la connexion TCP existante

5. Response
   200 OK + JSON chiffré
   Déchiffrement AES-256-GCM côté client

Total: ~200ms (première connexion)
       ~80ms (connexion réutilisée, cache DNS)
       ~0ms  (si QUIC 0-RTT avec HTTP/3)
```

---

## La carte mentale des protocoles

```
Couche 7 (Application)
├── Texte/Web    : HTTP/1.1, HTTP/2, HTTP/3
├── Sécurité     : TLS 1.3 (s'insère entre 4 et 7)
├── Nommage      : DNS (sur UDP ou TCP 53, DoH sur 443)
├── Mail         : SMTP (587), IMAP (993), POP3 (995)
├── IoT          : MQTT (1883/8883), CoAP (5683)
├── Fichiers     : SFTP (22), rsync (22)
├── Admin        : SSH (22), SNMP (161)
├── Auth         : RADIUS (1812), Kerberos (88)
├── Temps        : NTP (123)
└── Adressage    : DHCP (67/68)

Couche 4 (Transport)
├── TCP : connexion, fiabilité, ordre, contrôle flux/congestion
└── UDP : datagrammes, sans connexion, rapide

Couche 3 (Réseau)
├── IP (IPv4 32 bits, IPv6 128 bits)
├── ICMP (ping, traceroute, errors)
└── Routage : RIP, OSPF, BGP

Couche 2 (Liaison)
├── Ethernet (trames, MAC, MTU 1500)
├── Wi-Fi (802.11)
└── ARP (IP → MAC)

Couche 1 (Physique)
└── Câbles, fibres, radio
```

---

## Questions de diagnostic par symptôme

### "Mon site ne répond pas"
```bash
# 1. Est-ce le DNS ?
dig monsite.com                      # résolution OK ?
dig @8.8.8.8 monsite.com            # DNS public différent ?

# 2. Est-ce le réseau ?
ping IP_du_serveur                   # L3 accessible ?
traceroute IP_du_serveur             # où ça bloque ?

# 3. Est-ce le port ?
nc -zv IP_du_serveur 443             # port ouvert ?

# 4. Est-ce TLS ?
openssl s_client -connect domain:443 # certificat valide ?

# 5. Est-ce l'application ?
curl -v https://monsite.com          # HTTP fonctionne ?
```

### "La latence a doublé"
```bash
mtr --report 8.8.8.8                # où la latence augmente ?
ss -tin dst monsite.com             # retransmissions TCP ?
curl -w "%{time_starttransfer}\n" monsite.com  # TTFB élevé ?
```

### "Les emails vont dans les spams"
```bash
dig mondomaine.com TXT | grep spf   # SPF configuré ?
dig _dmarc.mondomaine.com TXT       # DMARC configuré ?
# Tester DKIM : envoyer à check-auth@verifier.port25.com
```

### "Connexion WebSocket coupe aléatoirement"
```bash
# Vérifier les timeouts des proxies intermédiaires
# nginx : proxy_read_timeout 3600s
# Configurer des pings WebSocket (keepalive)
ws.onopen = () => setInterval(() => ws.ping(), 30000)
```

---

## Les outils indispensables

| Outil | Usage | Niveau |
|-------|-------|--------|
| `dig` | DNS | Base |
| `ping` | Connectivité L3 | Base |
| `traceroute`/`mtr` | Chemin réseau | Base |
| `ss` / `netstat` | Connexions locales | Base |
| `nc` / `netcat` | Test TCP/UDP | Intermédiaire |
| `curl -v` | HTTP debug | Intermédiaire |
| `openssl s_client` | TLS debug | Intermédiaire |
| `tcpdump` | Capture paquets | Avancé |
| `Wireshark` | Analyse protocoles | Avancé |
| `tshark` | Wireshark CLI | Avancé |
| `iptables` | Firewall/NAT | Avancé |
| `mtr --aslookup` | Routage BGP | Expert |

---

## Ce que vous savez maintenant

✓ Expliquer le voyage d'un paquet de votre navigateur à un serveur  
✓ Diagnostiquer les problèmes courants (DNS, TCP, TLS, HTTP)  
✓ Lire une capture Wireshark et identifier les anomalies  
✓ Configurer SSH, TLS, DNS, SMTP correctement  
✓ Choisir le bon protocole pour un cas d'usage IoT/web/temps-réel  
✓ Comprendre la sécurité réseau (ARP spoofing, MITM, DDoS, BGP hijacking)  
✓ Optimiser les performances (CDN, compression, connection pooling, QUIC)

---

## La suite — aller plus loin

**Pour les protocoles de sécurité :**
Livre : *The Web Application Hacker's Handbook* — Stuttard & Pinto

**Pour le réseau opérationnel :**
Livre : *TCP/IP Illustrated Vol. 1* — W. Richard Stevens  
Certification : CCNA (Cisco), CompTIA Network+

**Pour la performance :**
*High Performance Browser Networking* — Ilya Grigorik (gratuit en ligne)

**Pour pratiquer :**
- Wireshark sur votre propre trafic quotidien
- NetLens Sandbox (vous y êtes !)
- Monter un lab avec GNS3 ou EVE-NG

---

*Chaque fois que vous ouvrez un terminal et tapez `curl`, `dig`, ou `ssh`, vous utilisez ce que vous avez appris ici. Les protocoles ne sont plus de la magie noire — ils sont des outils que vous comprenez.*
