# Jour 7 — UDP : quand la vitesse prime sur la fiabilité

## La situation réelle

Vous développez un jeu multijoueur en ligne. Vous avez le choix entre TCP et UDP pour envoyer la position des joueurs 60 fois par seconde. Lequel choisissez-vous et pourquoi ?

---

## UDP — User Datagram Protocol

UDP est délibérément minimal. Son en-tête fait 8 octets (vs 20+ pour TCP) :

```
Source Port (16) | Destination Port (16)
Length (16)      | Checksum (16)
Data
```

**Ce qu'UDP ne fait pas :**
- Pas de connexion (pas de handshake)
- Pas de garantie de livraison
- Pas de garantie d'ordre
- Pas de contrôle de flux
- Pas de contrôle de congestion

**Ce qu'UDP fait :**
- Envoyer un datagramme, c'est tout
- Le plus vite possible
- Sans attendre de confirmation

---

## Quand UDP est le bon choix

### Latence critique > fiabilité

**Streaming vidéo/audio temps réel :**
Un paquet TCP perdu gèle la vidéo jusqu'à sa retransmission. Avec UDP, un paquet perdu = une légère dégradation visuelle sur une frame. La vidéo continue.

**Jeux multijoueur :**
La position d'un joueur est mise à jour 60×/s. Si le paquet de la frame 42 est perdu, la frame 43 arrivera dans 16ms avec la position correcte. Retransmettre la frame 42 ne sert à rien.

**VoIP / WebRTC :**
Un silence de 20ms vaut mieux qu'un freeze de 200ms pendant la retransmission TCP.

### Broadcast et multicast

TCP est point-à-point (unicast). UDP supporte le broadcast et le multicast — envoyer un datagramme à plusieurs destinations simultanément. Indispensable pour la découverte de services (mDNS, DHCP, SSDP).

### Protocoles request-response courts

**DNS :** une requête, une réponse. Pas besoin d'établir une connexion pour ça. UDP réduit la latence DNS de ~50ms (TCP 3WH) à quelques ms.

**NTP :** synchronisation de l'horloge. Un paquet, une réponse.

---

## La fiabilité au niveau applicatif

Quand une application a besoin de fiabilité mais aussi de contrôle fin sur le comportement :

**QUIC (HTTP/3) :** construit au-dessus d'UDP avec sa propre fiabilité, contrôle de congestion, et multiplexage. Corrige les limitations de TCP (HOL blocking au niveau TCP) tout en gardant la flexibilité d'UDP.

**RTP (Real-time Transport Protocol) :** protocole de streaming média sur UDP. Ajoute des numéros de séquence pour détecter les pertes et réordonner, sans les retransmissions de TCP.

**DTLS :** TLS adapté à UDP. Utilisé par WebRTC pour chiffrer les flux média.

---

## UDP et amplification DDoS

UDP est sans état, ce qui crée un vecteur d'attaque : l'amplification.

Un attaquant envoie une petite requête UDP avec une IP source falsifiée (la victime). Le serveur envoie une grande réponse à la victime.

```
Attaquant → DNS query (60B) avec src=IP_victime → Serveur DNS
Serveur DNS → DNS response (4000B) → IP_victime

Facteur d'amplification : 4000/60 = 67×
```

Protocoles souvent exploités : DNS (~67×), NTP (~1000×), Memcached (~51000×).

**Contre-mesure :** BCP38 — filtrer les paquets avec IP source impossible (ingress filtering). Malheureusement pas universellement déployé.

---

## Comparaison TCP vs UDP

| Critère | TCP | UDP |
|---------|-----|-----|
| Connexion | Oui (3WH) | Non (connectionless) |
| Fiabilité | Garantie | Aucune |
| Ordre | Garanti | Non garanti |
| En-tête | 20+ octets | 8 octets |
| Latence | +1 RTT (handshake) | Immédiat |
| Débit | Limité par cwnd | Limité par le réseau |
| Cas d'usage | HTTP, SSH, SMTP | DNS, streaming, jeux |

---

## Exercice pratique

```bash
# Voir le trafic UDP sur votre machine
sudo tcpdump -i any udp -n

# Faire une requête DNS en UDP (par défaut)
dig google.com
# Observer dans tcpdump : 1 query UDP, 1 response UDP

# Forcer DNS en TCP
dig +tcp google.com
# Observer : SYN, SYN-ACK, ACK, query, response, FIN
```

---

## À retenir

- UDP = envoi de datagrammes sans connexion, sans garantie
- 8 octets d'en-tête vs 20+ pour TCP
- Choisir UDP quand : latence > fiabilité, broadcast/multicast, request-response courts
- La fiabilité peut être ajoutée au niveau applicatif (QUIC, RTP)
- UDP est le vecteur des attaques par amplification DDoS
