# Jour 27 — Performance réseau : mesurer et optimiser

## La situation réelle

Votre API répond en 200ms. Votre concurrent répond en 50ms. Comment mesurer où va le temps, et comment l'optimiser ?

---

## Décomposer la latence

```
Temps total = DNS + TCP connect + TLS + TTFB + transfer

DNS        : 0-50ms (cache ou résolution complète)
TCP 3WH    : 1 RTT (latence réseau × 2)
TLS 1.3    : 1 RTT supplémentaire
TTFB       : temps serveur (traitement + DB + etc.)
Transfer   : taille_réponse / bande_passante
```

```bash
# Mesurer chaque composant avec curl
curl -w @- -o /dev/null -s https://example.com << 'TIMING'
       DNS: %{time_namelookup}s
   Connect: %{time_connect}s
      TLS : %{time_appconnect}s
  Transfer: %{time_starttransfer}s
     Total: %{time_total}s
  Size    : %{size_download} bytes
TIMING
```

---

## RTT et la règle des 100ms

La latence de propagation lumineuse dans une fibre optique :
```
Paris → New York   : ~35ms RTT (théorique)
Paris → Tokyo      : ~130ms RTT
Paris → Sydney     : ~265ms RTT
```

**Règle pratique :** chaque RTT coûte cher. Minimiser les allers-retours.

```
HTTP/1.1 : DNS(1) + TCP(1) + TLS(2) + request(1) = 5 RTT minimum
HTTP/2   : DNS(1) + TCP(1) + TLS(1) + request(1) = 4 RTT
HTTP/3   : DNS(1) + QUIC(1) + request(0) = 2 RTT
HTTP/3 0RTT: DNS(1) + requête(0) = 1 RTT
```

---

## Bandwidth-Delay Product

```
BDP = bande_passante × RTT

Exemple : 1 Gbps × 100ms = 100 Mb = 12.5 MB "en vol"
```

Pour utiliser pleinement une connexion à 100ms RTT et 1Gbps, TCP doit avoir ~12.5 MB de données en transit sans ACK. La fenêtre TCP (`rwnd`) doit être au moins aussi grande.

```bash
# Vérifier les paramètres TCP
sysctl net.ipv4.tcp_rmem  # receive buffer [min default max]
sysctl net.ipv4.tcp_wmem  # send buffer

# Optimiser pour des connexions longue distance
sysctl -w net.core.rmem_max=134217728  # 128 MB
sysctl -w net.core.wmem_max=134217728
sysctl -w net.ipv4.tcp_rmem="4096 87380 134217728"
```

---

## Persistent connections et connection pooling

Établir une connexion TCP + TLS coûte 2-3 RTT. Pour des milliers de requêtes API, réutiliser les connexions est essentiel.

```python
# requests — session avec keep-alive
import requests

session = requests.Session()
# La session réutilise les connexions TCP
for i in range(100):
    r = session.get("https://api.example.com/data")
```

```python
# asyncio + aiohttp — pool de connexions
import aiohttp
import asyncio

async def main():
    connector = aiohttp.TCPConnector(limit=100)  # 100 connexions max
    async with aiohttp.ClientSession(connector=connector) as session:
        # Réutilise les connexions du pool
        async with session.get("https://api.example.com") as resp:
            return await resp.json()
```

---

## Compression

```nginx
# nginx — compression gzip/brotli
gzip on;
gzip_types text/plain application/json application/javascript text/css;
gzip_min_length 1000;
gzip_comp_level 6;

# Brotli (meilleur ratio que gzip, navigateurs modernes)
brotli on;
brotli_types text/plain application/json application/javascript;
```

Gains typiques :
```
JSON non compressé  : 100 KB
JSON gzip           : 15-20 KB  (80% de réduction)
JSON brotli         : 12-15 KB  (85% de réduction)
```

---

## Profiling réseau avec Chrome DevTools

```
Network tab → clic droit sur une requête → Timing

Queued         : en attente de connexion disponible
DNS Lookup     : résolution DNS
Initial connection : TCP + TLS handshake
Waiting (TTFB) : Time to First Byte = temps serveur
Content Download : transfert des données
```

**Lecture :** si TTFB est long → problème serveur/DB. Si Initial connection est long → latence réseau ou problème TLS. Si DNS Lookup est long → changer de résolveur.

---

## À retenir

- `curl -w` : mesurer DNS + TCP + TLS + TTFB précisément
- Chaque RTT coûte cher → minimiser les allers-retours
- BDP = bande passante × RTT = données "en vol" à supporter
- Connection pooling : réutiliser TCP+TLS au lieu de reconnecter
- Compression : gzip -80%, brotli -85% sur JSON/HTML/JS
- Chrome DevTools Timing : diagnostiquer où va le temps
