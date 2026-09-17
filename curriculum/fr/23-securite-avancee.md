# Jour 23 — Sécurité réseau avancée : attaques et défenses

## La situation réelle

Votre service subit 50 000 requêtes par seconde depuis des milliers d'IPs différentes. Votre base de données reçoit des requêtes malformées. Comment vous défendre ?

---

## DDoS — Distributed Denial of Service

**Volumétrique :** saturer la bande passante. Amplification DNS/NTP : petit paquet → grande réponse → vers la victime.

**Protocole :** exploiter les limites du protocole (SYN flood : ouvrir des milliers de half-open connections).

**Applicatif (L7) :** requêtes HTTP lentes qui monopolisent les workers (Slowloris).

### Défenses

```bash
# SYN cookies (Linux) — contre SYN flood
sysctl -w net.ipv4.tcp_syncookies=1

# Limiter les connexions par IP avec iptables
iptables -A INPUT -p tcp --dport 80 \
  -m connlimit --connlimit-above 50 -j DROP

# Rate limiting nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
server {
    location /api/ {
        limit_req zone=api burst=20 nodelay;
    }
}
```

---

## SQL Injection via le réseau

Même si ce n'est pas un protocole réseau, l'injection SQL se fait via HTTP. Exemple :

```
GET /user?id=1 OR 1=1--
```

**Défense : paramètres préparés (jamais d'interpolation de chaîne)**

```python
# ❌ Vulnérable
cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")

# ✓ Sécurisé
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
```

---

## Man-in-the-Middle (MITM)

Sur un réseau Wi-Fi public, un attaquant peut :
1. ARP spoof pour capturer le trafic
2. SSL strip pour downgrader HTTPS en HTTP
3. Injecter du contenu

**Défenses :**
- HTTPS partout + HSTS
- Certificate Pinning (mobile apps)
- VPN sur les réseaux non fiables
- HSTS Preload

---

## mTLS — authentification mutuelle

En mTLS, **les deux parties** présentent un certificat. Pas seulement le serveur.

```nginx
# nginx — requérir un certificat client
ssl_verify_client on;
ssl_client_certificate /etc/ssl/client-ca.pem;

# Accéder à l'info client dans les headers
proxy_set_header X-SSL-Client-CN $ssl_client_s_dn_cn;
```

Utilisé pour : microservices (Istio), API B2B, VPN enterprise.

---

## À retenir

- DDoS volumétrique : CDN + Anycast absorbent le volume
- SYN flood : SYN cookies côté serveur
- Rate limiting : nginx limit_req, Cloudflare, WAF
- SQL injection : paramètres préparés obligatoires
- MITM : HTTPS + HSTS + HSTS Preload
- mTLS : les deux parties s'authentifient mutuellement
