# Jour 24 — IPv6 en production : déploiement et transition

## La situation réelle

Vous déployez une nouvelle infrastructure. Votre fournisseur cloud supporte IPv6. Devez-vous l'activer ? Quels problèmes allez-vous rencontrer ?

---

## État du déploiement IPv6

En 2024 : ~45% du trafic mondial vers Google est IPv6. Les réseaux mobiles (4G/5G) sont souvent IPv6-only avec NAT64.

---

## Dual-stack — la stratégie de transition

Faire tourner IPv4 et IPv6 simultanément. Les clients IPv6 utilisent IPv6, les clients IPv4 utilisent IPv4.

```bash
# Configurer une interface dual-stack
ip addr add 192.168.1.10/24 dev eth0      # IPv4
ip addr add 2001:db8::1/64 dev eth0       # IPv6

# nginx écoute sur les deux
listen 80;           # IPv4
listen [::]:80;      # IPv6 (crochets obligatoires)
listen 443 ssl;
listen [::]:443 ssl;
```

---

## NAT64 + DNS64 — accès IPv4 depuis IPv6-only

Sur un réseau IPv6-only, certains serveurs n'ont que des adresses IPv4.

**DNS64 :** synthétise une adresse IPv6 à partir de l'adresse IPv4.
```
dig google.com AAAA @dns64-server
# → 64:ff9b::8.8.8.8 (préfixe NAT64 + IPv4)
```

**NAT64 :** traduit les paquets IPv6 vers IPv4 à la frontière du réseau.

---

## Adressage IPv6 en production

```bash
# Plages recommandées
2001:db8::/32        # Documentation/exemples (non routable)
fc00::/7             # Unique Local (équivalent RFC 1918)
2000::/3             # Global Unicast (allocation FAI/RIR)

# Exemple d'allocation typique FAI
/48 → entreprise     # 65536 sous-réseaux /64
/64 → un sous-réseau # 18 quintillions d'adresses hôtes
```

---

## Pièges courants en IPv6

**Applications codées en dur avec IPv4 :**
```python
# ❌
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.bind(('0.0.0.0', 8080))

# ✓ Dual-stack
sock = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
sock.bind(('::', 8080))
```

**Logs qui n'incluent pas IPv6 :**
```nginx
# Afficher l'IP réelle (IPv4 ou IPv6)
log_format main '$remote_addr - $remote_user [$time_local] "$request"';
# → ::1 pour localhost IPv6, 192.168.1.10 pour IPv4
```

**Firewalls IPv4-only :**
Toutes les règles iptables doivent être dupliquées avec ip6tables.

```bash
# Appliquer les mêmes règles en IPv4 et IPv6
ip6tables -A INPUT -p tcp --dport 22 -j ACCEPT
ip6tables -A INPUT -p tcp --dport 443 -j ACCEPT
ip6tables -P INPUT DROP
```

---

## À retenir

- Dual-stack = IPv4 + IPv6 simultanément, transition progressive
- NAT64 + DNS64 = accès IPv4 depuis réseau IPv6-only
- IPv6 élimine le NAT → bout-en-bout restauré
- Toujours tester les applications avec IPv6 explicitement
- ip6tables séparé d'iptables (ne pas oublier les règles IPv6)
