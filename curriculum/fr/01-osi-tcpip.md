# Jour 1 — OSI et TCP/IP : les deux cartes du même territoire

## La situation réelle

Vous déployez une application web. Elle répond lentement. Votre chef vous demande "c'est un problème réseau ou applicatif ?".

Pour répondre à cette question, il faut une carte mentale de comment les données voyagent. C'est à ça que servent OSI et TCP/IP — pas à être mémorisés, mais à vous donner un vocabulaire pour localiser les problèmes.

---

## Le modèle OSI — 7 couches

Le modèle OSI (Open Systems Interconnection) découpe la communication réseau en 7 couches. Chaque couche a une responsabilité précise et ne communique qu'avec les couches adjacentes.

```
7 — Application    HTTP, DNS, SMTP, MQTT
6 — Présentation   Encodage, chiffrement (TLS)
5 — Session        Gestion de sessions
4 — Transport      TCP, UDP
3 — Réseau         IP, ICMP
2 — Liaison        Ethernet, Wi-Fi (MAC)
1 — Physique       Câbles, signaux électriques
```

**Ce qui compte vraiment :** quand votre navigateur charge une page, les données descendent ces 7 couches à l'envoi, traversent le réseau, et remontent les 7 couches à la réception. Chaque couche ajoute son en-tête à l'envoi (*encapsulation*) et le retire à la réception (*décapsulation*).

### La question des couches 5 et 6

En pratique, TLS — qui chiffre vos connexions HTTPS — ne rentre pas proprement dans une couche OSI. Il opère entre la couche 4 (Transport) et la couche 7 (Application). Le modèle OSI est un outil pédagogique, pas une implémentation.

---

## TCP/IP — Le modèle réel d'Internet

En pratique, Internet fonctionne avec 4 couches, pas 7 :

```
4 — Application    HTTP, DNS, TLS, SMTP, MQTT
3 — Transport      TCP, UDP
2 — Internet       IP, ICMP
1 — Accès réseau   Ethernet, Wi-Fi
```

TCP/IP est ce qui tourne réellement. OSI est le vocabulaire commun pour en parler.

---

## L'encapsulation en pratique

Quand votre navigateur envoie une requête HTTP :

```
[HTTP GET /page]
    ↓ encapsulé dans
[TCP seq=1 | HTTP GET /page]
    ↓ encapsulé dans
[IP src=192.168.1.10 dst=8.8.8.8 | TCP | HTTP]
    ↓ encapsulé dans
[Ethernet src=aa:bb dst=cc:dd | IP | TCP | HTTP]
    ↓
bits sur le câble
```

Chaque couche "emballe" la couche supérieure dans son propre format. Sur le réseau, tout est des bits — la structure est une convention partagée.

---

## Répondre à la question du chef

- **Problème couche 7** : l'application répond lentement même avec une connexion parfaite → code, base de données
- **Problème couche 4** : TCP retransmissions, timeouts → congestion réseau, serveur surchargé
- **Problème couche 3** : paquets perdus, TTL expiré → routage
- **Problème couche 2** : collisions, erreurs Ethernet → infrastructure locale

Wireshark vous montre toutes les couches simultanément. C'est son pouvoir.

---

## Exercice pratique

Ouvrez un terminal et tapez :
```bash
traceroute google.com      # Linux/macOS
tracert google.com         # Windows
```

Vous observez les couches 3 et 4 en action : chaque ligne est un routeur (couche 3) qui décrémente le TTL (couche 3) et renvoie un ICMP (couche 3).

---

## À retenir

- OSI = vocabulaire (7 couches)
- TCP/IP = implémentation réelle (4 couches)
- Encapsulation = chaque couche ajoute son en-tête
- Localiser un problème = identifier à quelle couche il se produit
