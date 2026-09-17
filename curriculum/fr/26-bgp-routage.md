# Jour 26 — BGP et le routage inter-domaines

## La situation réelle

Vous travaillez pour un hébergeur. Vous annoncez votre bloc d'adresses IP publiques au reste d'Internet. Comment les autres AS savent-ils où envoyer le trafic vers vos IPs ?

---

## AS — Autonomous System

Internet est composé de milliers d'AS (Autonomous Systems) — des réseaux indépendants avec leur propre politique de routage : FAIs, entreprises, CDN, cloud providers.

Chaque AS reçoit un numéro unique (ASN) :
```
AS15169  → Google
AS32934  → Facebook/Meta
AS36492  → AWS
AS2200   → Renater (réseau académique français)
```

---

## BGP — Border Gateway Protocol

BGP (RFC 4271, port 179 TCP) est le protocole de routage entre AS. C'est le "protocole qui fait tenir Internet".

### Sessions BGP

**iBGP (internal BGP) :** entre routeurs dans le même AS.
**eBGP (external BGP) :** entre routeurs d'AS différents.

```bash
# Session eBGP typique
# Routeur AS65001 → Routeur AS65002

# Configuration simplifiée (Cisco IOS)
router bgp 65001
  neighbor 203.0.113.1 remote-as 65002
  network 198.51.100.0 mask 255.255.255.0  # annoncer ce préfixe
```

### Annonces de préfixes

Un AS annonce les préfixes IP qu'il possède (et peut relayer les préfixes d'autres AS).

```
AS65001 annonce : 198.51.100.0/24 via eBGP
AS65002 reçoit l'annonce, la propage à ses voisins BGP
```

---

## Path attributes et sélection de route

BGP choisit la "meilleure" route parmi plusieurs selon des attributs :

**AS_PATH :** liste des AS traversés.
```
198.51.100.0/24 via AS65001 → AS_PATH: [65001]
198.51.100.0/24 via AS65003, AS65001 → AS_PATH: [65003, 65001]
→ Préférer le chemin le plus court (moins d'AS)
```

**LOCAL_PREF :** préférence locale dans un AS (plus élevé = préféré).

**MED (Multi-Exit Discriminator) :** suggère au voisin quel point d'entrée utiliser.

**Communities :** tags 32 bits pour signaler des informations de routage.

---

## Anycast BGP

Plusieurs serveurs à différents endroits dans le monde annoncent la même adresse IP via BGP. Le routage réseau envoie vers le plus proche.

```
1.1.1.1 est annoncé depuis :
  - São Paulo (AS13335)
  - Paris (AS13335)
  - Tokyo (AS13335)
  - New York (AS13335)

→ Votre trafic va vers le PoP Cloudflare le plus proche
```

Utilisé par : DNS racine (root servers), Cloudflare, CDN.

---

## BGP Hijacking — quand ça tourne mal

En 2010 : China Telecom annonce par erreur 37 000 préfixes BGP, dont ceux de US Army, NASA, et Yahoo. Le trafic mondial passe par la Chine pendant 18 minutes.

BGP n'a pas d'authentification native. Solutions modernes :
- **RPKI (Route Origin Authorization) :** signatures cryptographiques qui prouvent qu'un AS est autorisé à annoncer un préfixe
- **BGPsec :** signe le chemin complet (déploiement lent)

```bash
# Vérifier si un préfixe a une ROA (Route Origin Authorization)
curl https://rpki.cloudflare.com/api/v1/validity/13335/1.1.1.0/24
```

---

## Looking Glass — observer le routage global

```bash
# Voir les routes BGP vers une IP depuis différents points
# bgp.he.net → Looking Glass

# Avec routinator (validateur RPKI)
routinator validate --asn 13335 --prefix 1.1.1.0/24

# Tracer la route AS par AS
mtr --aslookup google.com
```

---

## À retenir

- AS = réseau indépendant avec une politique de routage (FAI, cloud, CDN)
- BGP = protocole entre AS, sur TCP port 179
- AS_PATH = liste des AS traversés, préférer les chemins courts
- Anycast = même IP annoncée depuis plusieurs points → routage vers le plus proche
- BGP hijacking = annonce malveillante/erronée de préfixes IP
- RPKI = authentification cryptographique des annonces BGP
