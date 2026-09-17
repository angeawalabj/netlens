# Jour 3 — IPv4, IPv6 et le subnetting

## La situation réelle

Vous configurez un serveur. On vous demande de l'assigner à `10.0.4.32/26`. Combien d'adresses disponibles ? Quelle est l'adresse de broadcast ? Est-ce que `10.0.4.63` est dans ce sous-réseau ?

Ce sont des questions quotidiennes pour quiconque gère de l'infrastructure.

---

## IPv4 — 32 bits, 4 milliards d'adresses

Une adresse IPv4 fait 32 bits, écrite en 4 octets décimaux : `192.168.1.10`

```
192    .    168    .    1      .    10
11000000  10101000  00000001  00001010
```

### En-tête IPv4

```
Version(4) | IHL(4) | DSCP(6) | ECN(2) | Total Length(16)
Identification(16)  | Flags(3) | Fragment Offset(13)
TTL(8)     | Protocol(8)       | Header Checksum(16)
Source IP (32 bits)
Destination IP (32 bits)
Options (variable)
```

**Champs importants :**
- **TTL** (Time To Live) : décrémenté par chaque routeur. À 0 → paquet détruit + ICMP Time Exceeded
- **Protocol** : 6 = TCP, 17 = UDP, 1 = ICMP
- **DF bit** (Don't Fragment) : le routeur ne peut pas fragmenter le paquet

### Adresses réservées (RFC 1918)

Ces plages sont privées — non routables sur Internet :
```
10.0.0.0/8         →  10.0.0.0 – 10.255.255.255
172.16.0.0/12      →  172.16.0.0 – 172.31.255.255
192.168.0.0/16     →  192.168.0.0 – 192.168.255.255
```

Autres réservations importantes :
```
127.0.0.0/8        → Loopback (localhost)
169.254.0.0/16     → Link-local (APIPA — auto-assigné si pas de DHCP)
0.0.0.0/8          → Réseau courant (non routable)
255.255.255.255/32 → Broadcast limité
```

---

## Subnetting — la mécanique

Un masque de sous-réseau divise l'adresse en deux parties :
- **Partie réseau** (bits à 1 dans le masque)
- **Partie hôte** (bits à 0 dans le masque)

### Exemple : 10.0.4.32/26

Le `/26` signifie 26 bits pour le réseau, 6 bits pour les hôtes.

```
Masque /26 = 11111111.11111111.11111111.11000000
           = 255.255.255.192

10.0.4.32  = 00001010.00000000.00000100.00100000
Réseau     = 00001010.00000000.00000100.00100000 → 10.0.4.32
Broadcast  = 00001010.00000000.00000100.00111111 → 10.0.4.63
Hôtes      = 10.0.4.33 → 10.0.4.62 (62 adresses utilisables)
```

**Formule rapide :** 2^(32-CIDR) adresses totales, -2 (réseau + broadcast) = hôtes utilisables

```
/24 → 254 hôtes    /26 → 62 hôtes
/25 → 126 hôtes    /27 → 30 hôtes
/30 → 2 hôtes      /32 → 1 hôte (loopback, route host)
```

### Vérifier si une IP est dans un sous-réseau

```bash
# Python — vérification rapide
python3 -c "import ipaddress; print('10.0.4.63' in ipaddress.ip_network('10.0.4.32/26'))"
# True

# ipcalc (Linux)
ipcalc 10.0.4.32/26
```

---

## IPv6 — 128 bits, la solution à long terme

IPv4 était épuisé en 2019 (IANA). IPv6 offre 2¹²⁸ ≈ 3,4 × 10³⁸ adresses.

### Notation

8 groupes de 4 chiffres hexadécimaux :
```
2001:0db8:85a3:0000:0000:8a2e:0370:7334
```

Règles d'abréviation :
1. Supprimer les zéros en tête : `0db8` → `db8`
2. Remplacer un groupe de zéros par `::` (une seule fois)

```
2001:0db8:0000:0000:0000:0000:0000:0001
→  2001:db8::1
```

### Types d'adresses IPv6

```
::1/128              → Loopback (équivalent 127.0.0.1)
fe80::/10            → Link-local (auto-configurées, non routées)
fc00::/7             → Unique local (équivalent RFC 1918)
2000::/3             → Global unicast (routables sur Internet)
ff00::/8             → Multicast
```

### Avantage majeur : pas de NAT

En IPv4, le NAT (Network Address Translation) cache des milliers de machines derrière une seule IP publique. Avec IPv6, chaque appareil a sa propre adresse globale — pas de NAT, pas de problèmes de connexions entrantes, pas de STUN/TURN pour WebRTC.

### Auto-configuration (SLAAC)

IPv6 permet à une interface de s'auto-configurer sans DHCP :
1. Génère une adresse link-local `fe80::` depuis la MAC
2. Écoute les Router Advertisements (ICMPv6) du routeur
3. Construit son adresse globale : préfixe du routeur + identifiant d'interface

```bash
# Voir les adresses IPv6
ip -6 addr show       # Linux
ifconfig | grep inet6 # macOS
```

---

## Exercice pratique

```bash
# Calculer un sous-réseau à la main, puis vérifier
ipcalc 172.16.10.0/22

# Voir vos adresses IPv4 et IPv6
ip addr show

# Voir la table de routage
ip route show
```

---

## À retenir

| Critère | IPv4 | IPv6 |
|---------|------|------|
| Taille | 32 bits | 128 bits |
| Notation | Décimale (192.168.1.1) | Hexadécimale (2001:db8::1) |
| NAT | Nécessaire | Inutile |
| Auto-config | DHCP | SLAAC + DHCP optionnel |
| Déployé | 99% d'Internet | ~40% (en croissance) |

**Retenir les /CIDR courants :** /32 hôte, /30 point-à-point (2 hôtes), /24 LAN standard (254 hôtes), /16 grande entreprise.
