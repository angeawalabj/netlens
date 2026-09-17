# Jour 11 — SSH : accès distant sécurisé

## La situation réelle

Vous devez accéder à un serveur de production à 3h du matin depuis votre domicile, pendant un incident. Vous avez besoin que la connexion soit chiffrée, authentifiée, et que vous puissiez faire passer d'autres protocoles dedans si nécessaire.

SSH résout tout ça.

---

## SSH — Secure Shell

SSH (RFC 4253, port 22 TCP) remplace Telnet (non chiffré) pour l'accès distant. Il fournit :

- **Chiffrement** : tout le trafic est chiffré (AES, ChaCha20)
- **Authentification** : par clé publique ou mot de passe
- **Intégrité** : HMAC sur chaque message
- **Tunneling** : faire passer TCP, X11, agents SSH à travers la connexion

---

## Connexion de base

```bash
# Connexion simple
ssh user@hostname

# Port non standard
ssh -p 2222 user@hostname

# Clé spécifique
ssh -i ~/.ssh/ma_cle user@hostname

# Exécuter une commande et se déconnecter
ssh user@hostname "df -h && free -m"

# Copier des fichiers
scp fichier.txt user@hostname:/chemin/
scp user@hostname:/chemin/fichier.txt .

# Copie récursive
scp -r dossier/ user@hostname:/chemin/
```

---

## Authentification par clé publique

Plus sécurisée et plus pratique que le mot de passe.

```bash
# Générer une paire de clés (Ed25519 recommandé en 2024)
ssh-keygen -t ed25519 -C "mon@email.com"
# Crée : ~/.ssh/id_ed25519 (privée) et ~/.ssh/id_ed25519.pub (publique)

# Copier la clé publique sur le serveur
ssh-copy-id user@hostname
# Ou manuellement :
cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys  # sur le serveur

# La clé privée ne quitte JAMAIS votre machine
# La clé publique est sur le serveur (authorized_keys)
```

### Sécurité des clés

- Protéger la clé privée avec une passphrase forte
- Ne jamais partager la clé privée
- Utiliser `ssh-agent` pour ne saisir la passphrase qu'une fois par session

```bash
# Démarrer l'agent
eval $(ssh-agent)

# Ajouter une clé à l'agent
ssh-add ~/.ssh/id_ed25519
# → demande la passphrase une seule fois

# Lister les clés chargées
ssh-add -l
```

---

## known_hosts — protection contre le MITM

Au premier `ssh user@hostname`, SSH affiche l'empreinte du serveur :

```
The authenticity of host 'hostname (1.2.3.4)' can't be established.
ED25519 key fingerprint is SHA256:abc123...
Are you sure you want to continue connecting (yes/no)?
```

Si vous répondez `yes`, SSH mémorise la clé dans `~/.ssh/known_hosts`.

Lors des connexions suivantes, si la clé change :
```
WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!
```

Cela signifie soit que le serveur a été réinstallé (légitime) soit une attaque MITM (urgence).

```bash
# Vérifier l'empreinte du serveur (depuis le serveur lui-même)
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub

# Supprimer une entrée known_hosts (si serveur réinstallé)
ssh-keygen -R hostname
```

---

## Port forwarding — tunnels SSH

### Local forwarding (-L)

Accéder à un service distant comme s'il était local.

```bash
# Accéder à PostgreSQL distant (port 5432) via localhost:5432
ssh -L 5432:localhost:5432 user@serveur

# Maintenant dans un autre terminal :
psql -h localhost -p 5432 -U postgres

# Cas concret : accéder à une interface web derrière un firewall
ssh -L 8080:localhost:3000 user@serveur
# → http://localhost:8080 pointe vers serveur:3000
```

### Remote forwarding (-R)

Exposer un service local sur le serveur distant.

```bash
# Exposer votre serveur local (port 3000) sur le port 80 du serveur distant
ssh -R 80:localhost:3000 user@serveur
# → http://serveur:80 pointe vers votre localhost:3000

# Utile pour : démo client, webhook de développement, bypass firewall
```

### SOCKS proxy (-D)

Créer un proxy SOCKS5 qui route tout via SSH.

```bash
# Créer un proxy SOCKS sur localhost:1080
ssh -D 1080 user@serveur

# Configurer votre navigateur pour utiliser SOCKS5 localhost:1080
# Tout le trafic passe par le serveur SSH
```

---

## ~/.ssh/config — simplifier les connexions

```
Host prod
    HostName 123.456.789.0
    User ubuntu
    IdentityFile ~/.ssh/prod_key
    Port 22
    ServerAliveInterval 60

Host bastion
    HostName bastion.company.com
    User admin
    ForwardAgent yes

Host internal
    HostName 10.0.1.50
    User app
    ProxyJump bastion       # passer par le bastion
```

Avec cette config : `ssh prod` au lieu de `ssh -i ~/.ssh/prod_key ubuntu@123.456.789.0`

---

## Jump hosts (bastions)

Un bastion est un serveur SSH public qui donne accès au réseau privé.

```bash
# Connexion via un jump host
ssh -J bastion.company.com user@serveur-interne

# Ou avec ProxyJump dans ~/.ssh/config
ssh internal
```

---

## Sécuriser un serveur SSH

Configuration recommandée dans `/etc/ssh/sshd_config` :

```
# Désactiver l'authentification par mot de passe
PasswordAuthentication no
ChallengeResponseAuthentication no

# Désactiver root SSH
PermitRootLogin no

# Port non standard (obscurcissement, pas sécurité)
Port 2222

# Limiter les utilisateurs autorisés
AllowUsers ubuntu deploy

# Timeout inactivité
ClientAliveInterval 300
ClientAliveCountMax 2
```

```bash
# Après modification, recharger
sudo systemctl reload sshd
```

---

## Exercice pratique

```bash
# Générer une clé Ed25519
ssh-keygen -t ed25519 -C "$(whoami)@$(hostname)"

# Simuler un tunnel : accéder à httpbin.org via un proxy SSH
# (remplacer user@serveur par votre serveur)
ssh -L 8888:httpbin.org:80 user@serveur &
curl -H "Host: httpbin.org" http://localhost:8888/get

# Observer le trafic SSH (chiffré !)
sudo tcpdump -i any -n port 22
# → Vous ne voyez que des octets aléatoires
```

---

## À retenir

- SSH = shell chiffré sur TCP:22, remplace Telnet
- Authentification par clé publique > mot de passe
- known_hosts = protection MITM via empreinte serveur mémorisée
- `-L` = local forward (distant → vous), `-R` = remote forward (vous → distant)
- `~/.ssh/config` = simplifier et standardiser vos connexions
- `ProxyJump` = accéder au réseau privé via un bastion
