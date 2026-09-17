# Jour 9 — DNS : l'annuaire d'Internet

## La situation réelle

Vous changez l'hébergeur de votre site. Vous mettez à jour le DNS. 4 heures plus tard, certains visiteurs voient encore l'ancien site. Pourquoi ? Et comment l'éviter la prochaine fois ?

---

## DNS — Domain Name System

DNS traduit des noms lisibles par l'humain (`google.com`) en adresses IP (`142.250.75.110`). C'est l'annuaire d'Internet.

Sans DNS, vous devriez mémoriser des adresses IP pour chaque site. DNS est hiérarchique, distribué, et mis en cache.

---

## La hiérarchie DNS

```
.                        ← Racine (13 clusters de serveurs root)
├── com.                 ← TLD (Top-Level Domain) géré par Verisign
│   ├── google.com.      ← Zone managée par Google
│   │   └── www          ← enregistrement A : 142.250.75.110
│   └── github.com.
└── fr.                  ← TLD national (ccTLD)
    └── gouv.fr.
```

Chaque domaine est délégué à des **serveurs de noms autoritatifs** qui détiennent les enregistrements DNS pour cette zone.

---

## La résolution récursive

Quand votre machine cherche l'IP de `api.stripe.com` :

```
Votre machine
  → Résolveur récursif (8.8.8.8 ou box)   "api.stripe.com ?"

  Résolveur → Serveur racine               "stripe.com ? Je connais .com"
  Résolveur ← Délégation vers .com TLD

  Résolveur → .com TLD (Verisign)         "stripe.com ? Je connais ns1.stripe.com"
  Résolveur ← Délégation vers ns1.stripe.com

  Résolveur → ns1.stripe.com              "api.stripe.com ?"
  Résolveur ← A: 54.187.168.41  TTL=300

  Résolveur met en cache la réponse
  Résolveur → Votre machine               "54.187.168.41"
```

En pratique, le résolveur a souvent les réponses en cache. La résolution complète prend 30–80ms. Cache hit : <1ms.

---

## Types d'enregistrements DNS

| Type | Usage | Exemple |
|------|-------|---------|
| **A** | IPv4 | `example.com → 93.184.216.34` |
| **AAAA** | IPv6 | `example.com → 2606:2800:220:1:248:1893:25c8:1946` |
| **CNAME** | Alias vers un autre nom | `www → example.com` |
| **MX** | Serveur de mail | `example.com → mail.example.com (prio 10)` |
| **TXT** | Texte libre | SPF, DKIM, DMARC, vérifications |
| **NS** | Serveurs de noms | `example.com → ns1.example.com` |
| **PTR** | DNS inverse (IP → nom) | `34.216.184.93 → example.com` |
| **SOA** | Start of Authority | Infos sur la zone |
| **SRV** | Service (port + proto) | `_https._tcp.example.com` |
| **CAA** | CA autorisées | Quelle CA peut émettre pour ce domaine |

---

## Le TTL — la vraie réponse à la question du chef

**TTL (Time To Live)** : durée en secondes pendant laquelle un enregistrement peut être mis en cache.

```
api.stripe.com. 300 IN A 54.187.168.41
                ↑
            TTL = 300 secondes = 5 minutes
```

Quand vous changez une IP, les résolveurs qui ont mis en cache l'ancienne réponse la gardent jusqu'à l'expiration du TTL.

**Cas concret :** TTL = 86400 (24h). Vous changez l'IP à 14h. Certains visiteurs verront l'ancien site jusqu'à 14h demain.

**Bonne pratique avant une migration :**
1. **48h avant** : baisser le TTL à 300 secondes
2. **Le jour J** : changer l'IP
3. **Attendre** le TTL précédent (300s)
4. **Après la migration** : remonter le TTL à 3600 ou 86400

---

## Outils de diagnostic DNS

```bash
# Résolution basique
dig google.com
dig google.com A
dig google.com AAAA
dig google.com MX

# Résolution depuis un serveur spécifique
dig @8.8.8.8 google.com
dig @1.1.1.1 google.com

# Voir le chemin complet (trace)
dig +trace google.com

# DNS inverse
dig -x 142.250.75.110

# Voir le TTL restant
dig google.com | grep -A2 "ANSWER SECTION"

# Vérifier SPF/DKIM/DMARC
dig google.com TXT
dig _dmarc.google.com TXT
```

---

## DNS over HTTPS (DoH) et DNS over TLS (DoT)

Les requêtes DNS traditionnelles sont en **clair** (UDP port 53). Votre FAI, et n'importe qui sur votre réseau, peut voir tous les domaines que vous résolvez.

**DoH (RFC 8484) :** DNS dans une requête HTTPS. Port 443. Indiscernable du trafic web normal.
**DoT (RFC 7858) :** DNS dans une connexion TLS. Port 853. Visible comme protocole, contenu chiffré.

```bash
# Tester DoH avec curl
curl -H 'accept: application/dns-json' \
  'https://cloudflare-dns.com/dns-query?name=google.com&type=A'

# Configurer systemd-resolved (Linux) pour DoT
# /etc/systemd/resolved.conf :
# DNS=1.1.1.1
# DNSOverTLS=yes
```

---

## DNSSEC — authenticité des réponses DNS

DNS classique peut être falsifié (DNS spoofing, cache poisoning). DNSSEC ajoute des signatures cryptographiques aux enregistrements.

```bash
# Vérifier si un domaine a DNSSEC
dig +dnssec cloudflare.com A
# Chercher le flag "ad" (Authenticated Data) dans les flags
```

---

## Exercice pratique

```bash
# Voir la résolution en temps réel
sudo tcpdump -i any udp port 53 -n &
dig google.com
dig api.stripe.com

# Comparer les TTL
for domain in google.com github.com cloudflare.com; do
  echo -n "$domain: "
  dig +short $domain | head -1
  dig $domain | grep -oP 'IN A.*' | awk '{print "TTL=" $0}' | head -1
done
```

---

## À retenir

- DNS = traduction nom → IP, hiérarchique et distribué
- Résolution = racine → TLD → autoritatif → cache
- TTL = durée de vie du cache → la clé des migrations propres
- Baisser le TTL 48h avant toute migration d'IP
- DNS classique = en clair → DoH/DoT pour la confidentialité
- DNSSEC = signatures cryptographiques contre le spoofing
