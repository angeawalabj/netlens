# Jour 13 — MQTT et les protocoles IoT

## La situation réelle

1000 capteurs de température dans une usine envoient des mesures toutes les minutes. Sur batterie. Sur réseau cellulaire. Avec des connexions instables.

HTTP REST : chaque capteur ferait une requête TCP + TLS par mesure. 1000 capteurs × 1 req/min = overhead énorme. Batterie morte en jours.

MQTT : 2 octets d'en-tête, connexion persistante optionnelle, pub/sub natif. Batterie dure des années.

---

## MQTT — Message Queuing Telemetry Transport

MQTT (OASIS standard, v5.0 en 2019) est conçu pour :
- **Contraintes réseau** : faible bande passante, latence élevée, instabilité
- **Contraintes énergie** : appareils sur batterie
- **Topologies M2M** : machine-to-machine, N producteurs → M consommateurs

### Architecture

```
Capteurs (Publishers)
    │ PUBLISH → topic
    ▼
[BROKER MQTT] ← Mosquitto, EMQX, HiveMQ
    │ PUBLISH → subscribers
    ▼
Applications (Subscribers)
```

Le broker **découple** les producteurs des consommateurs. Un capteur publie sans savoir qui écoute. Une application s'abonne sans savoir d'où viennent les données.

---

## En-tête MQTT

L'en-tête fixe fait **2 octets** :

```
Octet 1 : Type de message (4 bits) | Flags (4 bits)
Octet 2 : Longueur restante (variable, 1-4 octets)
```

Types de messages :
```
0x10 CONNECT      0x20 CONNACK
0x30 PUBLISH      0x40 PUBACK
0x82 SUBSCRIBE    0x90 SUBACK
0xC0 PINGREQ      0xD0 PINGRESP
0xE0 DISCONNECT
```

Comparaison d'overhead par message :
```
HTTP REST : 200+ octets (headers HTTP)
MQTT      : 2 octets minimum
```

---

## Connexion et session

```
Client → Broker : CONNECT
  clientId: "capteur-usine-042"
  keepAlive: 60 secondes
  username/password: optionnel
  cleanStart: 1 (nouvelle session) ou 0 (reprendre session)
  LWT: Last Will and Testament

Broker → Client : CONNACK
  returnCode: 0x00 (succès)
  sessionPresent: 0 ou 1
```

### Last Will and Testament (LWT)

Configuré dans le CONNECT. Si le client se déconnecte **sans envoyer DISCONNECT** (coupure réseau, panne), le broker publie automatiquement le message LWT.

```
LWT topic:   "factory/sensors/042/status"
LWT payload: {"online": false, "ts": 0}
LWT QoS:     1
```

Utilisé pour détecter les déconnexions inopinées et déclencher des alertes.

---

## Topics — hiérarchie et wildcards

Les topics sont des chaînes hiérarchiques séparées par `/` :

```
factory/paris/hall-A/temperature
factory/paris/hall-A/humidity
factory/berlin/hall-B/temperature
```

**Wildcards pour les subscriptions :**

`+` : un niveau exactement
```
factory/+/hall-A/temperature
→ factory/paris/hall-A/temperature ✓
→ factory/berlin/hall-A/temperature ✓
→ factory/paris/hall-B/temperature ✗ (hall-B ≠ hall-A)
```

`#` : zéro ou plusieurs niveaux (doit être en fin de topic)
```
factory/#
→ factory/paris/hall-A/temperature ✓
→ factory/berlin/hall-B/humidity ✓
→ factory/paris ✓
```

---

## QoS — Quality of Service

| QoS | Garantie | Mécanisme | Usage |
|-----|----------|-----------|-------|
| **0** | Au plus une fois (fire-and-forget) | Aucun | Métriques temps réel, perte acceptable |
| **1** | Au moins une fois | PUBACK | Commandes importantes, duplicates tolérés |
| **2** | Exactement une fois | 4 messages | Transactions, commandes critiques |

### QoS 2 — protocole à 4 messages

```
Client → Broker : PUBLISH (DUP=0)
Broker → Client : PUBREC (message reçu)
Client → Broker : PUBREL (release)
Broker → Client : PUBCOMP (complet)
```

Garantit une livraison exactement une fois malgré les retransmissions.

---

## Retain et Persistence

**Retain=1** : le broker garde le dernier message sur ce topic. Un nouveau subscriber le reçoit immédiatement à l'abonnement, sans attendre la prochaine publication.

```
Capteur → PUBLISH factory/hall-A/temp {"temp": 23.5} retain=1

Nouvelle app s'abonne à factory/hall-A/temp
→ Reçoit immédiatement {"temp": 23.5} sans attendre
```

Parfait pour les topics d'état (température actuelle, statut appareil).

---

## Keep-Alive et PINGREQ

Si aucun message n'est échangé pendant `keepAlive` secondes, le client envoie un **PINGREQ** (2 octets). Le broker répond **PINGRESP** (2 octets).

Si le broker ne reçoit rien pendant `1.5 × keepAlive` secondes → il déclenche le LWT.

```bash
# Observer MQTT avec tcpdump
sudo tcpdump -i any -nn tcp port 1883 -X
```

---

## Autres protocoles IoT

### CoAP — Constrained Application Protocol

- UDP-based, similaire à HTTP en style REST
- Conçu pour microcontrôleurs (ARM Cortex-M, 256KB RAM)
- Supporte l'Observe (push similaire à MQTT)
- Ports 5683 (UDP) et 5684 (DTLS)

### LoRaWAN

- Radio longue portée (10-15 km)
- Ultra faible consommation
- Débit très faible (250 bps à 5.5 kbps)
- Parfait pour capteurs distants (agriculture, smart city)

### Zigbee / Z-Wave

- Réseau mesh local (maison intelligente)
- Portée ~10-100m
- Faible puissance

---

## Exercice pratique

```bash
# Installer Mosquitto (broker MQTT)
sudo apt install mosquitto mosquitto-clients

# Terminal 1 : s'abonner
mosquitto_sub -h localhost -t "test/#" -v

# Terminal 2 : publier
mosquitto_pub -h localhost -t "test/capteur/temp" -m '{"temp":23.5}'

# Observer avec Wireshark
# filtre : mqtt
```

---

## À retenir

- MQTT = pub/sub via broker, 2 octets d'en-tête minimum
- Topics hiérarchiques avec wildcards `+` (un niveau) et `#` (plusieurs)
- QoS 0 = fire-and-forget, QoS 1 = at-least-once, QoS 2 = exactly-once
- LWT = message publié par le broker si déconnexion anormale
- Retain = dernier message conservé pour les nouveaux subscribers
- Choisir MQTT plutôt que HTTP REST pour IoT contraint en énergie/bande passante
