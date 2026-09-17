# Jour 12 — SMTP, IMAP, POP3 : anatomie d'un email

## La situation réelle

Vous envoyez un email depuis Gmail vers une adresse Outlook. L'email passe par 4 serveurs avant d'arriver. Il peut atterrir dans les spams. Quelqu'un peut usurper votre adresse.

Comment fonctionne l'email, et pourquoi est-ce si fragile ?

---

## Le chemin d'un email

```
[Alice - Gmail]
    │ SMTP (port 587)
    ▼
[smtp.gmail.com] ← MTA (Mail Transfer Agent) source
    │ SMTP (port 25)
    ▼
[smtp-in.outlook.com] ← MTA destination
    │
    ▼
[Boîte de Bob]
    │ IMAP (port 993) ou POP3 (port 995)
    ▼
[Client mail de Bob]
```

---

## SMTP — Simple Mail Transfer Protocol

SMTP (RFC 5321) est le protocole d'envoi. Il est en clair sur le port 25 (entre serveurs) ou chiffré sur 587 (soumission client) ou 465 (SMTPS).

### Session SMTP à la main

```bash
telnet smtp.example.com 25

220 smtp.example.com ESMTP ready

EHLO mon-client.fr
250-smtp.example.com Hello
250-SIZE 52428800
250-STARTTLS
250 OK

MAIL FROM:<alice@gmail.com>
250 OK

RCPT TO:<bob@outlook.com>
250 OK

DATA
354 Start mail input; end with <CRLF>.<CRLF>

From: Alice <alice@gmail.com>
To: Bob <bob@outlook.com>
Subject: Test
Date: Mon, 14 Jun 2024 10:00:00 +0200

Bonjour Bob !
.
250 Message accepted

QUIT
221 Bye
```

### En-têtes importants

Un email contient des **en-têtes** (métadonnées) et un **corps** (contenu).

```
Received: from smtp.gmail.com ([209.85.220.41])
        by mx.outlook.com; Mon, 14 Jun 2024 10:00:05 +0000
Received: from [192.168.1.10] by smtp.gmail.com
        Mon, 14 Jun 2024 10:00:00 +0200
From: Alice <alice@gmail.com>
To: Bob <bob@outlook.com>
Subject: Test
Date: Mon, 14 Jun 2024 10:00:00 +0200
Message-ID: <unique@gmail.com>
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8
```

**L'en-tête `Received` est ajouté par chaque serveur traversé.** C'est le seul en-tête qu'on peut partiellement faire confiance — les serveurs l'ajoutent eux-mêmes, il ne peut pas être entièrement falsifié.

---

## Le problème du spoofing

`From: president@whitehouse.gov` dans un email ne prouve rien. N'importe qui peut écrire n'importe quelle adresse dans le champ `From`.

C'est pour ça qu'on a inventé SPF, DKIM et DMARC.

---

## SPF — Sender Policy Framework

SPF liste les serveurs autorisés à envoyer des emails pour un domaine. C'est un enregistrement TXT dans le DNS.

```bash
dig gmail.com TXT | grep spf
# v=spf1 include:_spf.google.com ~all
```

Signification :
- `include:_spf.google.com` : les IPs de Google sont autorisées
- `~all` : les autres IPs → soft fail (marquer comme suspect)
- `-all` : les autres IPs → hard fail (rejeter)

Quand un email arrive, le serveur destinataire vérifie si l'IP émettrice est dans le SPF du domaine `From`. Si non → potentiel spam.

---

## DKIM — DomainKeys Identified Mail

DKIM ajoute une **signature cryptographique** à chaque email. Le serveur expéditeur signe avec sa clé privée. Le destinataire vérifie avec la clé publique publiée dans le DNS.

```bash
dig google._domainkey.gmail.com TXT
# p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
```

L'en-tête DKIM dans l'email :
```
DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed;
        d=gmail.com; s=20230601;
        h=from:to:subject:date;
        bh=hash_du_corps;
        b=signature_cryptographique
```

DKIM garantit que l'email n'a pas été modifié en transit ET qu'il vient bien d'un serveur autorisé par le domaine.

---

## DMARC — Domain-based Message Authentication

DMARC combine SPF et DKIM et définit une politique : que faire si les deux échouent ?

```bash
dig _dmarc.google.com TXT
# v=DMARC1; p=reject; rua=mailto:mailauth-reports@google.com
```

Politiques DMARC :
- `p=none` : surveiller seulement (rapports)
- `p=quarantine` : placer en spam si SPF/DKIM échouent
- `p=reject` : rejeter l'email si SPF/DKIM échouent

**Vérifier le statut d'un domaine :**
```bash
# Vérifier les 3 mécanismes
dig example.com TXT | grep spf
dig _dmarc.example.com TXT
dig mail._domainkey.example.com TXT
```

---

## IMAP vs POP3

### IMAP — Internet Message Access Protocol

IMAP garde les emails **sur le serveur**. Votre client synchronise l'état (lu, non lu, dossiers).

```
Téléphone : lit email → serveur marque comme lu
Ordinateur : ouvre email → déjà marqué lu
```

Port 143 (STARTTLS) ou 993 (IMAPS). Protocole recommandé.

```bash
# Se connecter manuellement à IMAP (pour les curieux)
openssl s_client -connect imap.gmail.com:993

A001 LOGIN user@gmail.com motdepasse
A002 LIST "" "*"
A003 SELECT INBOX
A004 FETCH 1 (FLAGS BODY[HEADER.FIELDS (FROM SUBJECT)])
A005 LOGOUT
```

### POP3 — Post Office Protocol v3

POP3 **télécharge** les emails et les **supprime** du serveur. Adapté pour un seul appareil.

Port 110 (clair) ou 995 (POP3S). Déconseillé pour un usage multi-appareils.

---

## Pourquoi les emails arrivent dans les spams

Checklist de délivrabilité :

```bash
# 1. SPF configuré et valide ?
dig votre-domaine.com TXT | grep spf

# 2. DKIM signé ?
# Vérifier dans les en-têtes d'un email envoyé :
# Authentication-Results: dkim=pass

# 3. DMARC configuré ?
dig _dmarc.votre-domaine.com TXT

# 4. IP blacklistée ?
# https://mxtoolbox.com/blacklists.aspx

# 5. rDNS (PTR) configuré pour l'IP du serveur mail ?
dig -x IP_SERVEUR_MAIL

# 6. Score de réputation du domaine ?
# https://postmaster.google.com (pour Gmail)
```

---

## Exercice pratique

```bash
# Voir les en-têtes complets d'un email reçu
# Gmail : ouvrir email → "..." → "Afficher l'original"
# Outlook : ... → "Afficher la source du message"

# Analyser les en-têtes
# https://toolbox.googleapps.com/apps/messageheader/

# Tester SPF/DKIM/DMARC
# Envoyer un email à check-auth@verifier.port25.com
# → vous recevrez un rapport complet
```

---

## À retenir

- SMTP = envoi (client→serveur port 587, serveur→serveur port 25)
- IMAP = réception synchronisée multi-appareils (port 993)
- POP3 = réception téléchargement mono-appareil (port 995)
- `From:` est falsifiable → SPF + DKIM + DMARC pour authentifier
- SPF = IPs autorisées dans le DNS
- DKIM = signature cryptographique du contenu
- DMARC = politique si SPF/DKIM échouent + rapports
