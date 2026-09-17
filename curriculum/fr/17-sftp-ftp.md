# Jour 17 — FTP, SFTP, FTPS : transfert de fichiers

## La situation réelle

Vous devez déployer des fichiers statiques sur un serveur distant. Votre prestataire d'hébergement ne fournit que "FTP". Est-ce sécurisé ? Quelles sont vos alternatives ?

---

## FTP — File Transfer Protocol

FTP (RFC 959, 1985) est l'un des protocoles les plus anciens encore utilisés — et l'un des plus problématiques en termes de sécurité.

### Deux connexions TCP

FTP utilise **deux connexions TCP séparées** :

**Canal de contrôle (port 21)** : commandes et réponses textuelles.
**Canal de données (port 20 ou aléatoire)** : transfert des fichiers.

Cette architecture double complique les firewalls et NAT.

### Modes actif et passif

**Mode actif :** le serveur initie la connexion de données vers le client.
```
Client → port 21 serveur : connexion contrôle
Client → PORT 192.168.1.10,20,100  : "connecte-toi sur mon port 5732"
Serveur → port 5732 client : connexion données
```
Problème : le firewall client bloque la connexion entrante du serveur.

**Mode passif (PASV) :** le client initie les deux connexions.
```
Client → port 21 serveur : connexion contrôle
Client → PASV
Serveur → "connecte-toi sur mon port 54321"
Client → port 54321 serveur : connexion données
```
Mode recommandé avec NAT/firewalls.

### Le problème fondamental : tout en clair

```bash
# Session FTP capturée (tcpdump)
220 Welcome to FTP server
USER alice
331 Password required
PASS supersecret123      ← mot de passe en CLAIR
230 Login successful
RETR secret-file.txt     ← nom de fichier en clair
# Et le contenu du fichier en clair aussi
```

FTP ne doit **jamais** être utilisé sur un réseau non sécurisé.

---

## FTPS — FTP over TLS

FTPS (RFC 4217) ajoute TLS à FTP. Deux modes :

**FTPS implicite (port 990)** : TLS immédiatement dès la connexion.
**FTPS explicite (port 21 + STARTTLS)** : commence en clair, s'élève à TLS avec `AUTH TLS`.

FTPS reste complexe à cause des deux canaux — le canal de données nécessite lui aussi une session TLS séparée. Les firewalls doivent comprendre FTP pour gérer la connexion de données.

---

## SFTP — SSH File Transfer Protocol

SFTP n'est **pas** FTP sur SSH. C'est un protocole complètement différent qui tourne comme sous-système SSH.

### Avantages de SFTP

- Une seule connexion TCP (port 22)
- Tout chiffré par SSH
- Authentification par clé publique
- Traversée facile des firewalls (port 22 seulement)
- Opérations avancées (permissions, liens symboliques, attributs)

### Commandes SFTP

```bash
# Connexion interactive
sftp user@hostname

sftp> ls                    # lister les fichiers distants
sftp> put fichier.txt       # uploader
sftp> get fichier.txt       # télécharger
sftp> mkdir dossier         # créer un dossier
sftp> rm fichier.txt        # supprimer
sftp> chmod 644 fichier.txt # permissions
sftp> exit

# Non-interactif
sftp user@hostname:/remote/path/fichier.txt ./local/
echo "put fichier.txt" | sftp user@hostname

# Avec clé spécifique
sftp -i ~/.ssh/deploy_key deploy@serveur
```

### rsync sur SSH — synchronisation incrémentale

Pour les gros transferts ou la synchronisation régulière, rsync est supérieur à SFTP :

```bash
# Synchroniser un dossier local vers distant
rsync -avz --delete ./dist/ user@serveur:/var/www/html/
# -a : préserver permissions/dates/liens
# -v : verbose
# -z : compresser en transit
# --delete : supprimer côté distant ce qui n'existe plus localement

# Synchroniser distant → local
rsync -avz user@serveur:/var/log/ ./logs-backup/

# Dry-run (voir ce qui serait fait sans le faire)
rsync -avzn --delete ./dist/ user@serveur:/var/www/html/

# Exclure des fichiers
rsync -avz --exclude='*.log' --exclude='.git' ./src/ user@serveur:/app/
```

rsync calcule les différences (checksums par blocs) et ne transfère que ce qui a changé. Pour 50 GB de fichiers avec 500 MB de modifications → rsync transfère ~500 MB, pas 50 GB.

---

## SCP — Secure Copy

SCP (Secure Copy Protocol) est plus simple que SFTP pour les transferts ponctuels :

```bash
# Copier un fichier vers le serveur
scp fichier.txt user@hostname:/chemin/distant/

# Copier depuis le serveur
scp user@hostname:/chemin/fichier.txt ./local/

# Copier un dossier récursivement
scp -r ./dossier/ user@hostname:/chemin/

# Avec port non standard
scp -P 2222 fichier.txt user@hostname:/chemin/

# Via un jump host
scp -J bastion user@interne:/path/fichier.txt .
```

**Note :** SCP utilise un protocole obsolète en dessous. Pour les nouveaux usages, préférer `sftp` ou `rsync`.

---

## Choisir le bon protocole

| Besoin | Protocole |
|--------|-----------|
| Hébergement mutualisé legacy | FTPS (si FTP obligatoire) |
| Transfert ponctuel sécurisé | SCP ou SFTP |
| Synchronisation incrémentale | rsync sur SSH |
| Déploiement CD/CI | rsync + SSH keys |
| Partage de fichiers public | HTTP/HTTPS (nginx) |
| Stockage objet | S3/MinIO (HTTP API) |

---

## Configurer le serveur SFTP (OpenSSH)

```
# /etc/ssh/sshd_config

# Sous-système SFTP
Subsystem sftp internal-sftp

# Utilisateur sftp uniquement (pas de shell)
Match User sftp-deploy
    ForceCommand internal-sftp
    ChrootDirectory /var/www
    AllowTcpForwarding no
    X11Forwarding no
```

```bash
sudo systemctl reload sshd

# Tester
sftp sftp-deploy@serveur
# → limité à /var/www, pas de shell possible
```

---

## À retenir

- FTP = en clair (USER, PASS, données) — à éviter absolument
- FTP utilise 2 connexions TCP (contrôle port 21, données port 20/aléatoire)
- FTPS = FTP + TLS — complexe, ports multiples
- SFTP = sous-système SSH — 1 port, tout chiffré, préféré
- SCP = transfert ponctuel via SSH
- rsync = synchronisation incrémentale (ne transfère que les différences)
- Préférer SFTP/rsync à tout FTP en 2024
