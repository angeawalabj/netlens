# Jour 10 — HTTP/1.1 à HTTP/3 : l'évolution du protocole web

## La situation réelle

Votre page web charge 80 ressources (HTML, CSS, JS, images, polices). Sur une connexion 4G avec 80ms de latence, pourquoi HTTP/2 la charge 3× plus vite qu'HTTP/1.1 ?

---

## HTTP/1.1 — texte, séquentiel, persistent

HTTP/1.1 (1997) est un protocole texte. Une requête ressemble à :

```
GET /index.html HTTP/1.1
Host: example.com
Accept: text/html
Connection: keep-alive

```

Une réponse :
```
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Length: 46080
Cache-Control: no-cache

<!DOCTYPE html>...
```

### Codes de statut importants

| Code | Signification |
|------|---------------|
| 200  | OK |
| 201  | Created (POST réussi) |
| 204  | No Content (succès sans corps) |
| 301  | Moved Permanently (redir permanente) |
| 302  | Found (redir temporaire) |
| 304  | Not Modified (cache valide) |
| 400  | Bad Request |
| 401  | Unauthorized (auth requise) |
| 403  | Forbidden (auth ok mais refusé) |
| 404  | Not Found |
| 429  | Too Many Requests (rate limit) |
| 500  | Internal Server Error |
| 502  | Bad Gateway |
| 503  | Service Unavailable |

### Le Head-of-Line Blocking

Sur une connexion HTTP/1.1, les requêtes sont traitées **en séquence**. Si la ressource A met 500ms, B et C attendent.

**Contournement :** les navigateurs ouvrent jusqu'à **6 connexions parallèles par origine**. Chaque connexion nécessite son propre TCP + TLS handshake.

```
80 ressources ÷ 6 connexions = ⌈80/6⌉ = 14 vagues minimum
14 × (TCP RTT + TLS RTT + req RTT) = énorme latence
```

---

## HTTP/2 — binaire, multiplexé

HTTP/2 (2015, RFC 7540) résout le HOL blocking avec le multiplexage.

### Frames binaires

HTTP/2 remplace le format texte par des **frames binaires** :
- Plus compactes
- Plus rapides à parser
- Permettent le multiplexage

Types de frames : HEADERS, DATA, SETTINGS, WINDOW_UPDATE, PUSH_PROMISE...

### Streams et multiplexage

Un **stream** est un canal logique bidirectionnel dans une connexion TCP. HTTP/2 multiplex N streams sur **1 connexion TCP**.

```
Connexion TCP unique
├── Stream 1 : GET /index.html
├── Stream 3 : GET /main.css     (concurrent)
├── Stream 5 : GET /app.js       (concurrent)
└── Stream 7 : GET /logo.png     (concurrent)
```

Les frames des différents streams sont entrelacées. Si la réponse HTML prend du temps, CSS et JS arrivent quand même.

### HPACK — compression des en-têtes

HTTP/1.1 envoie les mêmes en-têtes à chaque requête (`User-Agent`, `Accept`, `Cookie`...).

HPACK maintient une table de compression partagée entre client et serveur. Les en-têtes déjà envoyés sont référencés par un index. Économie : ~70-80% de la taille des en-têtes.

### Négociation via ALPN

HTTP/2 est toujours utilisé sur TLS en pratique. La négociation se fait via l'extension TLS ALPN (Application-Layer Protocol Negotiation) dans le ClientHello.

```
Client: j'accepte [h2, http/1.1]
Serveur: je choisis h2
→ HTTP/2 activé
```

### Server Push (déprécié)

HTTP/2 permettait au serveur d'envoyer des ressources anticipées (`PUSH_PROMISE`). En pratique : mal implémenté, retiré de Chrome en 2022, et de HTTP/3.

### HOL Blocking TCP — le problème restant

HTTP/2 résout le HOL blocking au niveau HTTP. Mais TCP lui-même est séquentiel : si un segment est perdu, **tous** les streams attendent sa retransmission.

C'est le problème que QUIC résout.

---

## HTTP/3 — sur QUIC

HTTP/3 (2022, RFC 9114) remplace TCP par **QUIC** (Quick UDP Internet Connections).

### Pourquoi QUIC sur UDP ?

- TCP est dans le noyau OS — impossible à modifier rapidement
- QUIC est dans l'espace utilisateur — mise à jour comme une bibliothèque
- QUIC inclut sa propre fiabilité, contrôle de congestion, et TLS 1.3

### Connection ID — la killer feature mobile

TCP identifie une connexion par `(IP src, port src, IP dst, port dst)`. Si vous passez du Wi-Fi (IP: 192.168.1.10) à la 4G (IP: 10.0.0.5), la connexion TCP est interrompue.

QUIC utilise un **Connection ID** opaque. Quand votre IP change, la connexion QUIC migre transparentement. Votre appel vidéo ne coupe plus.

### Multiplexage sans HOL Blocking

QUIC multiplex les streams, et chaque stream est indépendant au niveau transport. La perte d'un paquet d'un stream ne bloque pas les autres.

### Négociation via Alt-Svc

Migration vers HTTP/3 progressive :
```
Server: Alt-Svc: h3=":443"; ma=86400
```

Le navigateur sait que HTTP/3 est disponible et le tente à la prochaine connexion. Fallback automatique vers HTTP/2 si QUIC est bloqué (certains firewalls bloquent UDP 443).

---

## Comparaison

| | HTTP/1.1 | HTTP/2 | HTTP/3 |
|-|----------|--------|--------|
| Transport | TCP | TCP | QUIC (UDP) |
| Format | Texte | Binaire | Binaire |
| Connexions | 6 par origine | 1 | 1 |
| Multiplexage | Non | Oui (HTTP) | Oui (transport) |
| HOL Blocking | HTTP + TCP | TCP seulement | Non |
| TLS | Optionnel | Obligatoire (browsers) | Intégré |
| Migration réseau | Non | Non | Oui |

---

## Caching HTTP

```
Cache-Control: max-age=31536000, immutable
```

Directives essentielles :
- `max-age=N` : cache pendant N secondes
- `no-cache` : stocker mais revalider avant utilisation
- `no-store` : ne pas stocker du tout (données sensibles)
- `immutable` : ne jamais revalider (fichiers versionnés)
- `public` : cacheable par les CDN
- `private` : cacheable uniquement par le navigateur

**Stratégie recommandée :**
- Fichiers statiques versionnés (`app.a3f4c.js`) : `max-age=31536000, immutable`
- HTML : `no-cache` (revalider à chaque visite)
- API données : `private, max-age=0` ou `no-store`

---

## Exercice pratique

```bash
# Voir les headers HTTP
curl -I https://google.com
curl -v https://google.com 2>&1 | head -50

# Tester HTTP/2
curl --http2 -I https://google.com | grep "HTTP/"

# Tester HTTP/3
curl --http3 -I https://www.cloudflare.com | grep "HTTP/"

# Observer dans Wireshark
# filtre : http2 || quic
```

---

## À retenir

- HTTP/1.1 : texte, 6 connexions parallèles, HOL blocking
- HTTP/2 : binaire, multiplexage sur 1 TCP, HPACK, HOL blocking TCP restant
- HTTP/3 : QUIC (UDP), multiplexage total, migration réseau, TLS intégré
- Cache-Control : la clé de la performance frontend
- Alt-Svc : migration progressive vers HTTP/3
