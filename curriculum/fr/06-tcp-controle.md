# Jour 6 — TCP : contrôle de flux et contrôle de congestion

## La situation réelle

Un serveur en Californie envoie des données à un client à Paris. La connexion passe par des routeurs avec des buffers limités. Comment TCP évite-t-il de noyer le client ? Et de saturer le réseau ?

Deux mécanismes distincts : **contrôle de flux** (protège le récepteur) et **contrôle de congestion** (protège le réseau).

---

## Contrôle de flux — protéger le récepteur

Le récepteur annonce dans chaque ACK la taille de son buffer disponible : la **fenêtre de réception** (`rwnd`).

L'émetteur ne peut envoyer que `rwnd` octets sans recevoir d'ACK.

```
Récepteur : buffer 64 KB
  ← ACK ack=501 win=65535   "Buffer : 64 KB disponibles"

Émetteur envoie 32 KB :
  → [seq=501, len=32768]

Récepteur répond :
  ← ACK ack=32769 win=32767  "Il me reste 32 KB"

Application lit les données :
  ← ACK ... win=65535         "Buffer libéré, 64 KB à nouveau"
```

**Window = 0 :** le récepteur est plein. L'émetteur s'arrête et envoie des "zero-window probes" périodiques pour savoir quand le buffer se libère. Dans Wireshark : `TCP Zero Window`.

---

## Contrôle de congestion — protéger le réseau

Même si le récepteur a de la place, le réseau peut être saturé. TCP utilise une **fenêtre de congestion** (`cwnd`) côté émetteur pour éviter de saturer les routeurs intermédiaires.

L'émetteur peut envoyer `min(rwnd, cwnd)` octets sans ACK.

### Slow Start

Au démarrage d'une connexion, `cwnd` commence petit (1–10 MSS) et **double à chaque RTT** (croissance exponentielle).

```
RTT 1 : cwnd = 10 MSS
RTT 2 : cwnd = 20 MSS
RTT 3 : cwnd = 40 MSS
...jusqu'au seuil ssthresh (typiquement 64–128 KB)
```

Malgré son nom, Slow Start est très rapide. Une connexion peut atteindre des centaines de KB/s en quelques RTT.

### Congestion Avoidance

Au-dessus du seuil `ssthresh`, la croissance devient **linéaire** (+1 MSS par RTT) pour éviter la saturation.

### Détection de perte et réaction

**Timeout RTO :** aucun ACK reçu dans le délai →
- `ssthresh = cwnd / 2`
- `cwnd = 1 MSS` (redémarrage brutal)
- Slow Start recommence

**3 ACK dupliqués (Fast Retransmit) :** le récepteur reçoit des données hors ordre et répète le même ACK →
- Retransmettre immédiatement le segment manquant
- `ssthresh = cwnd / 2`
- `cwnd = ssthresh` (plus doux qu'un timeout)

```
Évolution typique de cwnd :
│    /
│   /
│  /   ← Slow Start
│ /
│/______/    ← CA (linéaire)
│      \
│       \___ ← perte détectée, cwnd chute
│        /
│       /    ← Slow Start depuis ssthresh
```

### Algorithmes modernes

L'algorithme classique (Reno/NewReno) réagit aux pertes après qu'elles se produisent. Les algorithmes modernes anticipent :

- **BBR** (Google, 2016) : mesure le débit réel et la latence pour maintenir le réseau au bord de la saturation sans la déclencher. Utilisé par YouTube, Gmail.
- **CUBIC** (Linux par défaut) : fenêtre de congestion en forme de courbe cubique, plus agressive que Reno.

---

## MSS — Maximum Segment Size

Le MSS est la taille maximale des données TCP dans un segment (sans les en-têtes). Il est négocié dans le SYN/SYN-ACK.

```
MSS = MTU - IP header - TCP header
    = 1500 - 20 - 20 = 1460 octets  (Ethernet standard)
```

Si le MSS n'est pas respecté, IP peut fragmenter le paquet — sauf si DF=1, auquel cas le routeur renvoie ICMP Fragmentation Needed et le paquet est silencieusement perdu.

---

## Path MTU Discovery (PMTUD)

TCP tente d'envoyer des paquets aussi grands que possible avec DF=1. Si un routeur renvoie ICMP Fragmentation Needed, TCP réduit la taille des segments pour ce chemin.

**PMTUD black holes :** certains firewalls filtrent les ICMP → PMTUD ne fonctionne pas → connexion TCP qui s'établit mais les gros transferts échouent mystérieusement. Solution : TCP MSS clamping sur le firewall.

---

## Exercice pratique

```bash
# Observer la congestion window avec ss
ss -tinh dst 8.8.8.8

# Pendant un download :
curl -o /dev/null https://speed.cloudflare.com/__down?bytes=100000000 &
ss -tinh | grep -A5 "8.8"
# Chercher : cwnd, ssthresh, rto
```

---

## À retenir

| Mécanisme | Protège | Variable | Réaction à la perte |
|-----------|---------|----------|---------------------|
| Contrôle de flux | Le récepteur | `rwnd` | Stop si win=0 |
| Contrôle de congestion | Le réseau | `cwnd` | Divise cwnd |

- `min(rwnd, cwnd)` = données en transit autorisées
- Slow Start = exponentiel jusqu'à `ssthresh`
- Congestion Avoidance = linéaire après `ssthresh`
- Perte = `ssthresh` divisé, `cwnd` réduit
