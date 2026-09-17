# Jour 15 — Wireshark : voir les protocoles en vrai

## La situation réelle

Tout ce que vous avez appris les 14 jours précédents existe sur votre réseau en ce moment. Wireshark vous permet de le voir.

---

## Installation

```bash
# Linux (Debian/Ubuntu)
sudo apt install wireshark
sudo usermod -aG wireshark $USER
newgrp wireshark  # ou déconnexion/reconnexion

# macOS
brew install wireshark  # avec interface graphique depuis wireshark.org

# Vérifier
wireshark --version
tshark --version  # version CLI
```

---

## Interface Wireshark

```
┌─ Barre de filtres ─────────────────────────────────────────┐
├─ Liste des paquets (une ligne par paquet) ─────────────────┤
│  N°  Temps    Source          Destination     Proto  Info   │
│   1  0.000    192.168.1.10    8.8.8.8         DNS    Std... │
│   2  0.023    8.8.8.8         192.168.1.10    DNS    Resp..│
├─ Détail du paquet sélectionné ─────────────────────────────┤
│ ▶ Ethernet II                                               │
│ ▶ Internet Protocol Version 4                               │
│ ▶ User Datagram Protocol                                    │
│ ▶ Domain Name System (query)                                │
├─ Octets bruts (hexadécimal + ASCII) ───────────────────────┤
└────────────────────────────────────────────────────────────┘
```

---

## Capturer du trafic

```bash
# Interface graphique : sélectionner l'interface → bouton Start

# CLI avec tshark
tshark -i eth0                           # capturer sur eth0
tshark -i any                            # toutes les interfaces
tshark -i eth0 -w /tmp/capture.pcap      # sauvegarder
tshark -r /tmp/capture.pcap              # lire une capture

# Avec tcpdump (plus universel)
sudo tcpdump -i eth0 -w /tmp/capture.pcap
# → ouvrir le .pcap dans Wireshark
```

---

## Filtres de capture (BPF) vs filtres d'affichage

**Filtres de capture (BPF)** : appliqués au niveau du noyau, avant que les paquets n'entrent dans Wireshark. Syntaxe simple.

```bash
# Ne capturer que TCP port 443
sudo tcpdump -i eth0 -w out.pcap "tcp port 443"

# Ne capturer que les paquets vers/depuis une IP
sudo tcpdump -i eth0 -w out.pcap "host 8.8.8.8"

# Combiner
sudo tcpdump -i eth0 "tcp and (port 80 or port 443)"
```

**Filtres d'affichage** : appliqués dans Wireshark sur une capture existante. Syntaxe riche.

```
# Protocol
dns
http
tcp
tls

# IP
ip.addr == 192.168.1.10
ip.src == 192.168.1.10
ip.dst == 8.8.8.8

# Port TCP/UDP
tcp.port == 443
tcp.dstport == 80
udp.port == 53

# Flags TCP
tcp.flags.syn == 1
tcp.flags.rst == 1
tcp.flags == 0x002   # SYN uniquement
tcp.flags == 0x012   # SYN+ACK

# Contenu
http.host contains "google"
dns.qry.name == "api.stripe.com"
tls.handshake.type == 1   # ClientHello

# Combiner (AND, OR, NOT)
tcp and ip.addr == 8.8.8.8
not arp and not dns
http or (tcp.port == 8080)
```

---

## Suivre un flux

**Clic droit sur un paquet → Follow → TCP Stream**

Wireshark reconstruit la conversation complète et affiche les données déchiffrées (pour HTTP). Voir le contenu de requêtes/réponses HTTP en clair.

Pour HTTPS : le trafic est chiffré — vous voyez les frames TLS mais pas le contenu HTTP.

```bash
# Déchiffrer HTTPS avec la clé de session (si vous la contrôlez)
# Configurer SSLKEYLOGFILE dans le navigateur :
export SSLKEYLOGFILE=/tmp/ssl-keys.log
google-chrome &
# → dans Wireshark : Edit → Preferences → Protocols → TLS → Master Secret log file
```

---

## Analyses courantes

### Voir le three-way handshake TCP

```
Filtre : tcp.flags.syn == 1 or tcp.flags.ack == 1
```
Vous verrez clairement SYN, SYN-ACK, ACK avec les numéros de séquence.

### Trouver les retransmissions

```
Filtre : tcp.analysis.retransmission
```

Chaque retransmission indique une perte de paquet. Beaucoup de retransmissions = problème réseau.

### Analyser la latence DNS

```
Filtre : dns
```
Observer le delta entre la query et la response. >100ms = résolveur lent.

### Voir les requêtes HTTP claires

```
Filtre : http.request
```
Toutes les requêtes GET, POST, etc. en clair.

### Détecter les scans de ports

```
Filtre : tcp.flags == 0x002 and tcp.window_size == 1024
```
Un scan nmap SYN génère des centaines de SYN vers des ports différents.

---

## tshark — Wireshark en ligne de commande

```bash
# Statistiques des protocoles
tshark -r capture.pcap -q -z io,phs

# Extraire les requêtes DNS
tshark -r capture.pcap -Y "dns.flags.response == 0" \
  -T fields -e dns.qry.name

# Extraire les URLs HTTP
tshark -r capture.pcap -Y "http.request" \
  -T fields -e http.host -e http.request.uri

# Statistiques des conversations
tshark -r capture.pcap -q -z conv,tcp

# Top des IPs par volume
tshark -r capture.pcap -q -z endpoints,ip
```

---

## Captures utiles à faire maintenant

```bash
# 1. Observer votre résolution DNS
sudo tcpdump -i any -w /tmp/dns.pcap udp port 53 &
firefox google.com
kill %1
# → Ouvrir dans Wireshark, filtrer : dns

# 2. Observer le handshake TLS
sudo tcpdump -i any -w /tmp/tls.pcap "tcp port 443" &
curl https://api.github.com
kill %1
# → Ouvrir, filtrer : tls.handshake

# 3. Observer ARP
sudo tcpdump -i any -w /tmp/arp.pcap arp &
ping 192.168.1.254   # IP inexistante
kill %1
# → Ouvrir, filtrer : arp

# 4. Capture complète 30 secondes pendant navigation
sudo tcpdump -i any -w /tmp/browse.pcap &
# naviguer normalement
sleep 30 && kill %1
# → Explorer dans Wireshark avec différents filtres
```

---

## À retenir

- Wireshark = observer tous les protocoles en temps réel
- BPF (capture) vs display filters (analyse) — deux syntaxes
- Follow TCP Stream = reconstituer une conversation complète
- `tcp.analysis.retransmission` = détecter les pertes
- `tshark` = automatiser l'analyse depuis le terminal
- HTTPS chiffré → utiliser SSLKEYLOGFILE pour déchiffrer en dev
- Wireshark est l'outil le plus puissant pour valider votre compréhension
