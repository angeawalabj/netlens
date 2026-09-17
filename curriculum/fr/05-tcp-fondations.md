# Jour 5 — TCP : fiabilité sur un réseau non fiable

## La situation réelle

Vous téléchargez un fichier de 2 GB. Le réseau perd 0,1 % des paquets. Sans TCP, votre fichier serait corrompu. Avec TCP, il arrive intact.

Comment TCP garantit-il cela sur un réseau qui ne garantit rien ?

---

## Le problème qu'IP ne résout pas

IP livre les paquets *au mieux* (best-effort). Il ne garantit ni :
- **L'ordre** : le paquet 3 peut arriver avant le paquet 1
- **La livraison** : un paquet peut être silencieusement perdu
- **La déduplication** : un paquet peut arriver deux fois
- **L'intégrité** : (le checksum IP ne couvre que l'en-tête)

TCP résout tous ces problèmes.

---

## En-tête TCP

```
Source Port (16) | Destination Port (16)
Sequence Number (32)
Acknowledgment Number (32)
Data Offset(4) | Reserved(3) | Flags(9) | Window Size (16)
Checksum (16)  | Urgent Pointer (16)
Options (variable)
Data
```

**Flags TCP :**

| Flag | Signification |
|------|---------------|
| SYN  | Synchronize — initier une connexion |
| ACK  | Acknowledge — confirmer réception |
| FIN  | Finish — fermer proprement |
| RST  | Reset — fermer brutalement |
| PSH  | Push — livrer immédiatement à l'application |
| URG  | Urgent — données urgentes (rarement utilisé) |

---

## Le Three-Way Handshake

Avant d'échanger des données, TCP établit une connexion en 3 étapes.

```
Client                          Serveur
  │                               │
  │──── SYN seq=1000 ────────────►│   "Je veux me connecter, mon ISN est 1000"
  │                               │
  │◄─── SYN-ACK seq=2000 ────────│   "OK, mon ISN est 2000, j'attends byte 1001"
  │          ack=1001             │
  │                               │
  │──── ACK ack=2001 ────────────►│   "Reçu, j'attends byte 2001"
  │                               │
  │      CONNEXION ÉTABLIE        │
```

**Pourquoi 3 étapes ?**
Parce que les deux parties doivent confirmer que l'autre peut envoyer ET recevoir. 2 étapes ne suffisent pas — le serveur ne saurait pas si son SYN-ACK est arrivé.

**ISN (Initial Sequence Number) :**
Le numéro de séquence initial est choisi aléatoirement pour éviter les conflits avec des connexions précédentes sur les mêmes ports.

---

## Numéros de séquence et ACK

TCP numérote chaque **octet** (pas chaque paquet). Les ACK sont cumulatifs.

```
Client envoie 500 octets à partir du byte 1 :
  → [seq=1, len=500] "voici les bytes 1 à 500"

Serveur répond :
  ← [ack=501] "reçu jusqu'à 500, j'attends le 501"

Client envoie encore 300 octets :
  → [seq=501, len=300] "voici les bytes 501 à 800"

Serveur confirme :
  ← [ack=801] "reçu jusqu'à 800"
```

**Retransmission :**
Si le client ne reçoit pas d'ACK dans le délai RTO (Retransmission TimeOut), il retransmet le segment. TCP détecte aussi les pertes via 3 ACK dupliqués (fast retransmit).

---

## La fermeture en 4 étapes

La fermeture propre (graceful close) nécessite 4 étapes car chaque direction se ferme indépendamment :

```
Client                          Serveur
  │──── FIN ────────────────────►│   "Je n'ai plus rien à envoyer"
  │◄─── ACK ─────────────────────│   "OK, reçu ton FIN"
  │◄─── FIN ─────────────────────│   "Moi non plus"
  │──── ACK ────────────────────►│   "OK"
  │
  └── TIME_WAIT (2×MSL ≈ 4 min) ──── puis port libéré
```

**TIME_WAIT :** le client attend 2×MSL (Maximum Segment Lifetime) pour s'assurer que le dernier ACK est arrivé et pour absorber d'éventuels paquets retardés. C'est normal de voir des connexions en TIME_WAIT avec `ss -tan`.

**RST :** ferme la connexion immédiatement, sans handshake. Utilisé pour les ports fermés, les connexions obsolètes, ou les attaques RST injection.

---

## Voir TCP dans Wireshark

```bash
# Démarrer Wireshark avec filtre TCP
sudo wireshark -f "tcp and host google.com" &
curl https://google.com
```

Vous verrez exactement : SYN, SYN-ACK, ACK, puis les données TLS.

---

## Exercice pratique

```bash
# Observer les états TCP en temps réel
watch -n 0.5 'ss -tan | awk "{print \$1}" | sort | uniq -c'

# Pendant un téléchargement dans un autre terminal :
curl -o /dev/null https://releases.ubuntu.com/22.04/ubuntu-22.04-desktop-amd64.iso
```

Vous verrez les états : SYN_SENT → ESTABLISHED → TIME_WAIT

---

## À retenir

- TCP garantit ordre, livraison, déduplication sur un réseau non fiable
- Three-way handshake : SYN → SYN-ACK → ACK (synchronise les ISN)
- Numéros de séquence : numérotent les **octets**, pas les paquets
- ACK cumulatif : "j'ai reçu tout jusqu'à N, j'attends N+1"
- Fermeture : 4 étapes + TIME_WAIT (normal et nécessaire)
- RST : fermeture brutale immédiate
