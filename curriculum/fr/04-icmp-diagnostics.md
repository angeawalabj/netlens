# Jour 4 — ICMP et les outils de diagnostic réseau

## La situation réelle

Un service est inaccessible depuis la production. Avant d'ouvrir un ticket, vous avez 5 minutes pour diagnostiquer. Quels outils utilisez-vous et comment interprétez-vous les résultats ?

---

## ICMP — Internet Control Message Protocol

ICMP est le protocole de "signalisation" de la couche réseau. Il ne transporte pas de données applicatives — il transporte des messages de contrôle entre équipements réseau.

### En-tête ICMP

```
Type (8 bits) | Code (8 bits) | Checksum (16 bits)
Data (variable selon type)
```

### Messages ICMP importants

| Type | Code | Signification |
|------|------|--------------|
| 0    | 0    | Echo Reply (réponse à ping) |
| 3    | 0    | Destination Unreachable — réseau inaccessible |
| 3    | 1    | Destination Unreachable — hôte inaccessible |
| 3    | 3    | Destination Unreachable — port inaccessible (UDP) |
| 3    | 4    | Fragmentation Needed (PMTUD) |
| 8    | 0    | Echo Request (ping) |
| 11   | 0    | Time Exceeded — TTL expiré (traceroute) |

---

## ping — tester la connectivité

```bash
ping google.com
ping -c 4 8.8.8.8      # 4 paquets seulement
ping -i 0.2 google.com  # envoyer toutes les 200ms
```

**Interpréter la sortie :**

```
PING google.com (142.250.75.110): 56 data bytes
64 bytes from 142.250.75.110: icmp_seq=0 ttl=118 time=8.234 ms
64 bytes from 142.250.75.110: icmp_seq=1 ttl=118 time=7.891 ms

--- google.com ping statistics ---
4 packets transmitted, 4 received, 0% packet loss
round-trip min/avg/max/stddev = 7.891/8.1/8.4/0.2 ms
```

- **ttl=118** : le paquet a traversé 64-118 = 10 routeurs (Linux TTL initial = 64, Windows = 128)
- **0% packet loss** : aucune perte
- **time** : RTT (Round-Trip Time) — aller + retour

**Cas d'échec :**
```
Request timeout          → hôte n'existe pas ou filtre ICMP
Destination unreachable  → routeur ne sait pas où router
Name or service not known→ problème DNS (pas réseau)
```

---

## traceroute / tracert — cartographier le chemin

traceroute exploite le TTL : envoie des paquets avec TTL=1, 2, 3...

Chaque routeur décrémente le TTL. Quand TTL=0, le routeur envoie ICMP Time Exceeded avec son adresse IP. traceroute construit ainsi la carte du chemin.

```bash
traceroute google.com          # Linux/macOS (UDP par défaut)
traceroute -I google.com       # Linux (ICMP — traverse mieux les firewalls)
tracert google.com             # Windows

# Avec résolution DNS désactivée (plus rapide)
traceroute -n google.com
```

**Interpréter la sortie :**
```
traceroute to google.com (142.250.75.110)
 1  192.168.1.1       1.2 ms    # votre box
 2  10.0.0.1          8.3 ms    # DSLAM FAI
 3  172.16.1.1       12.1 ms    # coeur FAI
 4  * * *                       # ICMP filtré (normal)
 5  142.250.75.110   18.4 ms    # destination
```

**`* * *`** : le routeur filtre les ICMP sortants (politique courante). Ça ne signifie pas que la connexion est coupée — testez avec une connexion applicative (curl, telnet).

**Latence élevée sur un seul saut puis normale** : le routeur déprioritise les paquets ICMP. Ne pas conclure à un problème sur ce saut.

---

## mtr — traceroute en continu

mtr (My TraceRoute) combine ping et traceroute en temps réel. Idéal pour détecter les pertes intermittentes.

```bash
mtr google.com            # interactif
mtr --report google.com   # rapport sur 10 cycles
mtr -n --report google.com # sans DNS
```

**Sortie mtr :**
```
HOST              Loss%  Snt  Last  Avg  Best  Wrst
1. 192.168.1.1    0.0%    10   1.2  1.3   1.1   1.8
2. 10.0.0.1       0.0%    10   8.3  8.1   7.9   8.9
3. ???           100.0%    10   0.0  0.0   0.0   0.0  ← ICMP filtré
4. 142.250.75.110 0.0%    10  18.4 18.2  17.8  19.1
```

**100% loss sur un hop intermédiaire mais 0% sur les hops suivants** = ICMP filtré sur ce routeur, pas un problème.

---

## netcat / nc — tester la connectivité TCP/UDP

```bash
# Tester si un port TCP est ouvert
nc -zv google.com 443     # -z = scan, -v = verbose
nc -zv 192.168.1.1 22

# Tester UDP
nc -zvu 8.8.8.8 53

# Créer un serveur TCP temporaire (pour tester)
nc -l 8080                # écoute sur 8080

# Client
nc localhost 8080
```

---

## ss / netstat — connexions locales

```bash
# Toutes les connexions actives
ss -tuln           # -t=TCP, -u=UDP, -l=listening, -n=sans DNS

# Filtrer par port
ss -tnp | grep :443

# Compter les connexions par état TCP
ss -tan | awk 'NR>1{print $1}' | sort | uniq -c | sort -rn
```

---

## Séquence de diagnostic — les 5 étapes

Face à un service inaccessible :

```
1. ping <ip>           → la machine répond-elle ?
2. traceroute <ip>     → où ça bloque dans le réseau ?
3. nc -zv <ip> <port>  → le port TCP est-il ouvert ?
4. curl -v <url>       → la couche HTTP fonctionne-t-elle ?
5. dig <domaine>       → la résolution DNS est-elle correcte ?
```

Si `ping` échoue mais `nc -zv :443` réussit → ICMP filtré, machine accessible.
Si `ping` réussit mais `nc -zv :443` échoue → port fermé ou firewall.
Si `nc` réussit mais `curl` échoue → problème HTTP/TLS/applicatif.

---

## À retenir

- ICMP = messages de contrôle réseau, pas de données applicatives
- `ping` teste la connectivité L3 (IP)
- `traceroute` cartographie le chemin via le mécanisme TTL
- `* * *` = ICMP filtré, pas nécessairement une coupure
- `mtr` détecte les pertes intermittentes que traceroute rate
- `nc -zv` teste la connectivité L4 (TCP/UDP)
