# Jour 16 — QUIC : repenser le transport pour le web moderne

## La situation réelle

YouTube remarque que 6% des utilisateurs ont une expérience dégradée à cause de TCP HOL blocking lors de pertes de paquets. Leur solution : réécrire la couche transport. C'est QUIC.

---

## Pourquoi QUIC existe

**Le problème fondamental de TCP :** il est dans le noyau OS. Modifier TCP nécessite de mettre à jour Windows, macOS, Linux, Android, iOS — des milliards d'appareils. Le cycle de déploiement dure des années.

**La solution QUIC :** implémenter un protocole de transport dans l'espace utilisateur, mis à jour comme n'importe quelle bibliothèque.

---

## QUIC — les innovations clés

### UDP comme substrat

QUIC tourne sur UDP port 443. Les firewalls et routeurs le voient comme du trafic UDP ordinaire.

```
HTTP/3 (sémantique HTTP)
    └── QUIC (fiabilité, contrôle de flux, multiplexage)
        └── UDP (datagrammes)
            └── IP
```

### TLS 1.3 intégré

TLS n'est pas une couche au-dessus de QUIC — il est **intégré**. Le handshake QUIC et le handshake TLS se font simultanément.

```
Client → Initial (ClientHello TLS 1.3 inclu) → Serveur
Client ← Handshake (ServerHello + Certificate + Finished chiffrés) ← Serveur
Client → Finished chiffré → Serveur
Client ← Données HTTP/3 ← Serveur
```

**Total : 1 RTT.** HTTP/2 sur TCP+TLS nécessite 2-3 RTT.

### 0-RTT — reprendre sans latence

Si le client a déjà contacté ce serveur, QUIC peut envoyer des données dès le **premier paquet** (0 RTT) en réutilisant un ticket de session précédent.

```
Client → [0-RTT data + ClientHello] → Serveur
Client ← [ServerHello + données HTTP/3] ← Serveur
```

**Attention :** 0-RTT est vulnérable aux attaques par rejeu. Ne jamais l'utiliser pour des requêtes qui modifient l'état (POST, PUT, DELETE).

### Connection ID — migration réseau

TCP identifie une connexion par `(IP src, port src, IP dst, port dst)`. Si l'IP change (Wi-Fi → 4G), la connexion casse.

QUIC utilise un **Connection ID** de 64 bits, choisi aléatoirement. L'IP peut changer — le Connection ID reste valide.

```
[Wi-Fi - IP: 192.168.1.10]  ──QUIC ConnID: 0xABCD──►  Serveur
                [handoff]
[4G    - IP: 10.0.0.5    ]  ──QUIC ConnID: 0xABCD──►  Serveur
```

La connexion migre transparentement. Aucune interruption de la session vidéo.

### Multiplexage sans HOL blocking

En HTTP/2, une perte TCP bloque **tous** les streams jusqu'à la retransmission.

En QUIC, chaque stream est indépendant au niveau transport. Une perte sur le stream 3 ne bloque pas les streams 1 et 7.

---

## QUIC en pratique

```bash
# Vérifier si un site supporte HTTP/3
curl --http3 -I https://cloudflare.com

# Dans Chrome : chrome://flags → Experimental QUIC protocol
# Puis voir dans DevTools → Network → Protocol

# Avec quiche (outil CLI Cloudflare)
git clone https://github.com/cloudflare/quiche
cd quiche && cargo build --examples
./target/debug/examples/http3-client https://cloudflare.com/
```

### Identifier QUIC dans Wireshark

```
Filtre : quic

# QUIC utilise des Connection IDs dans chaque paquet
# Le payload est chiffré → vous voyez le type de paquet mais pas le contenu
```

---

## QUIC vs TCP — comparaison opérationnelle

| Critère | TCP+TLS+HTTP/2 | QUIC+HTTP/3 |
|---------|----------------|-------------|
| RTT pour connexion | 2-3 RTT | 1 RTT (0 RTT si reprise) |
| HOL blocking | HTTP résolu, TCP reste | Résolu à tous les niveaux |
| Migration réseau | Connexion cassée | Transparente |
| Déploiement | OS kernel | Userspace (update rapide) |
| CPU | Moindre (AES-NI) | Plus élevé (UDP path) |
| Firewalls | Port 80/443 TCP OK | UDP 443 parfois bloqué |

---

## Ossification et QUIC

L'une des motivations de QUIC : l'**ossification** de TCP.

Les middleboxes (firewalls, load balancers, CDN) ont appris à "connaître" TCP et parfois modifient les paquets TCP (ajout d'options, modification de fenêtres). Certaines extensions TCP ne peuvent pas être déployées car des équipements intermédiaires les cassent.

QUIC chiffre presque tout (y compris les numéros de paquet) — les middleboxes ne peuvent pas l'inspecter ni le modifier. QUIC peut donc évoluer sans ossification.

---

## À retenir

- QUIC = UDP + fiabilité + contrôle de congestion + TLS 1.3 intégré, en userspace
- 1 RTT pour établir une connexion sécurisée (vs 2-3 pour TCP+TLS)
- 0-RTT pour reprendre une session (attention aux rejeux)
- Connection ID = migration réseau transparente (Wi-Fi ↔ 4G)
- Multiplexage sans HOL blocking à tous les niveaux
- UDP 443 peut être bloqué par certains firewalls → fallback HTTP/2 automatique
