# Jour 28 — PKI et gestion des certificats en production

## La situation réelle

Votre certificat TLS expire dans 3 heures. Vos 47 services HTTPS tombent. Le renouvellement manuel prend 2h. Voici comment ne plus jamais vivre ça.

---

## PKI — Public Key Infrastructure

La PKI est l'ensemble des systèmes, politiques et procédures qui gèrent les certificats numériques et les clés publiques.

**Composants :**
- **CA Racine (Root CA) :** clé privée stockée hors-ligne dans un HSM
- **CA Intermédiaire (Intermediate CA) :** émet les certificats finaux, peut être révoquée
- **Certificat final :** pour un domaine, une application, un utilisateur
- **CRL / OCSP :** révocation des certificats compromis

---

## Let's Encrypt — certificats gratuits automatisés

Let's Encrypt (ISRG) émet des certificats DV (Domain Validated) gratuitement via le protocole ACME.

### Le protocole ACME

ACME prouve que vous contrôlez le domaine via un "challenge" :

**Challenge HTTP-01 :**
```
Let's Encrypt → votre serveur : "place ce token à http://domain/.well-known/acme-challenge/TOKEN"
Let's Encrypt vérifie l'accès → certificat émis
```

**Challenge DNS-01 :**
```
Let's Encrypt → "place TXT _acme-challenge.domain = TOKEN dans ton DNS"
→ Permet les wildcards (*.example.com)
→ Fonctionne sans port 80 ouvert
```

### Certbot — automatisation du renouvellement

```bash
# Installer certbot
sudo apt install certbot python3-certbot-nginx

# Obtenir et configurer automatiquement nginx
sudo certbot --nginx -d example.com -d www.example.com

# Challenge DNS (pour wildcard)
sudo certbot certonly --manual --preferred-challenges dns \
  -d "*.example.com" -d example.com

# Renouveler automatiquement (cron ou systemd timer)
sudo certbot renew --quiet
# Recommandé : exécuter 2× par jour (cronjob)
echo "0 0,12 * * * root certbot renew --quiet" | sudo tee /etc/cron.d/certbot
```

### cert-manager (Kubernetes)

```yaml
# Installer cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml

# ClusterIssuer Let's Encrypt
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx

---
# Certificat automatique
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: api-tls
spec:
  secretName: api-tls-cert
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - api.example.com
```

cert-manager renouvelle automatiquement 30 jours avant expiration.

---

## Types de certificats

| Type | Validation | Délai | Usage |
|------|-----------|-------|-------|
| DV (Domain Validated) | Contrôle du domaine | Minutes | Sites web, APIs |
| OV (Organization Validated) | Identité de l'org vérifiée | Jours | E-commerce, entreprises |
| EV (Extended Validation) | Vérification renforcée | Semaines | Banques (barre verte, obsolète) |
| Wildcard `*.example.com` | DNS challenge | Minutes | Multi-sous-domaines |
| Multi-SAN | Plusieurs domaines | Minutes | Un cert pour N domaines |

---

## Rotation des certificats sans interruption

```bash
# 1. Générer la nouvelle clé et CSR
openssl req -newkey rsa:2048 -nodes \
  -keyout new-private.key \
  -out certificate.csr \
  -subj "/CN=example.com/O=MyOrg/C=FR"

# 2. Obtenir le nouveau certificat (via CA)
# 3. Tester SANS déployer
openssl verify -CAfile ca-bundle.crt new-certificate.crt
openssl x509 -in new-certificate.crt -noout -text | grep -E "Not After|Subject"

# 4. Déployer en hot-reload (nginx)
sudo cp new-certificate.crt /etc/ssl/
sudo cp new-private.key /etc/ssl/
sudo nginx -t && sudo systemctl reload nginx  # rechargement sans interruption

# 5. Vérifier
echo | openssl s_client -connect example.com:443 2>/dev/null \
  | openssl x509 -noout -dates
```

---

## Monitoring des expirations

```bash
# Script de monitoring des certificats
check_cert() {
  local domain=$1
  local warning_days=30

  expiry=$(echo | openssl s_client -connect ${domain}:443 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null \
    | cut -d= -f2)

  expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$expiry" +%s)
  now_epoch=$(date +%s)
  days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

  if [ $days_left -lt $warning_days ]; then
    echo "⚠️  $domain : expiration dans $days_left jours ($expiry)"
  else
    echo "✓  $domain : $days_left jours restants"
  fi
}

# Vérifier plusieurs domaines
for domain in example.com api.example.com cdn.example.com; do
  check_cert $domain
done
```

**Prometheus + alerting :**
```yaml
# règle d'alerte
- alert: CertificateExpiryWarning
  expr: |
    (probe_ssl_earliest_cert_expiry - time()) / 86400 < 30
  labels:
    severity: warning
  annotations:
    summary: "Certificat {{ $labels.instance }} expire dans {{ $value | humanizeDuration }}"

- alert: CertificateExpiryCritical
  expr: |
    (probe_ssl_earliest_cert_expiry - time()) / 86400 < 7
  labels:
    severity: critical
```

---

## CA Privée pour usage interne

Pour les microservices internes, les outils de dev, les VPN internes :

```bash
# Créer une CA privée avec easy-rsa
apt install easy-rsa
make-cadir ~/my-ca && cd ~/my-ca

./easyrsa init-pki
./easyrsa build-ca                    # créer la CA racine
./easyrsa gen-req service-name nopass # créer une clé + CSR
./easyrsa sign-req server service-name # signer le certificat

# Distribuer le cert CA aux clients (confiance)
cp pki/ca.crt /usr/local/share/ca-certificates/my-internal-ca.crt
update-ca-certificates
```

---

## À retenir

- Let's Encrypt : certificats gratuits, ACME automatisé, renouvelés tous les 90j
- cert-manager : renouvellement automatique dans Kubernetes
- Toujours monitorer les expirations (alerte à J-30 et J-7)
- `nginx reload` (pas restart) pour rotation sans interruption
- CA privée : pour services internes, microservices, mTLS
- DV = validation domaine (instantané) | OV = validation org (jours)
