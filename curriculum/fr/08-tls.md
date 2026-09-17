# Jour 8 — TLS 1.3 : comment HTTPS protège vos données

## La situation réelle

Vous tapez votre mot de passe bancaire sur https://. Entre votre navigateur et le serveur de la banque, les données traversent des dizaines de routeurs. Comment savez-vous que personne ne peut les lire ou les modifier ?

La réponse : TLS.

---

## Ce que TLS garantit

**Confidentialité :** les données sont chiffrées. Un observateur ne voit que des octets aléatoires.

**Intégrité :** toute modification des données en transit est détectée immédiatement.

**Authentification :** vous parlez bien au serveur légitime et pas à un imposteur.

TLS ne garantit pas l'anonymat (l'IP source/destination est visible) ni la disponibilité.

---

## Cryptographie asymétrique vs symétrique

**Asymétrique (RSA, ECDSA, ECDHE) :**
- Une paire de clés : publique + privée
- Ce qui est chiffré avec la publique ne peut être déchiffré qu'avec la privée
- Lent (~1000× plus lent qu'AES)
- Utilisé pour l'échange de clé initial

**Symétrique (AES-GCM, ChaCha20-Poly1305) :**
- Une seule clé partagée entre les deux parties
- Très rapide (GB/s sur hardware moderne avec AES-NI)
- Utilisé pour chiffrer les données

TLS combine les deux : asymétrique pour établir une clé symétrique partagée, symétrique pour chiffrer ensuite.

---

## Le handshake TLS 1.3 — 1 RTT

TLS 1.3 (RFC 8446, 2018) a été repensé pour ne nécessiter qu'**un seul aller-retour** avant d'envoyer des données applicatives.

```
Client                              Serveur
  │                                    │
  │──── ClientHello ──────────────────►│
  │     versions: [TLS 1.3]            │
  │     key_share: X25519_pub_client   │
  │     SNI: api.banque.fr             │
  │     ALPN: [h2, http/1.1]           │
  │                                    │
  │◄─── ServerHello ──────────────────│
  │     cipher: TLS_AES_256_GCM_SHA384│
  │     key_share: X25519_pub_server  │
  │         ↑                         │
  │   Les deux parties calculent       │
  │   le même secret partagé via ECDHE │
  │   Tout ce qui suit est chiffré     │
  │                                    │
  │◄─── Certificate [chiffré] ────────│
  │◄─── CertificateVerify [chiffré] ──│
  │◄─── Finished [chiffré] ───────────│
  │                                    │
  │──── Finished [chiffré] ───────────►│
  │                                    │
  │──── GET /compte [chiffré] ────────►│  ← 1 RTT seulement
```

---

## ECDHE — l'échange de clé

ECDHE (Elliptic Curve Diffie-Hellman Ephemeral) permet à deux parties de dériver le même secret partagé sans jamais l'envoyer sur le réseau.

**Analogie simplifiée :**
- Client et serveur choisissent chacun un nombre secret
- Ils échangent des valeurs publiques dérivées de ces nombres
- Chacun peut calculer le même secret final, mais un observateur ne peut pas

**Éphémère (E dans ECDHE) :** une nouvelle paire de clés est générée pour chaque connexion. Si la clé privée du serveur est compromise dans 5 ans, les sessions passées restent secrètes. C'est le **Perfect Forward Secrecy (PFS)**.

---

## Certificats X.509 et la chaîne de confiance

Un certificat TLS contient :
- **Subject** : le domaine (`CN=*.banque.fr`)
- **Subject Alternative Names** : domaines couverts
- **Public key** : la clé publique du serveur
- **Validity** : NotBefore, NotAfter
- **Signature** : signée par une CA (Certificate Authority)

**La chaîne de confiance :**
```
Certificat serveur (banque.fr)
    signé par → CA intermédiaire (Let's Encrypt E1)
        signée par → CA racine (ISRG Root X1)
            préinstallée dans votre OS/navigateur
```

Votre navigateur fait confiance à ~150 CA racines préinstallées. Si l'une d'elles signe un certificat frauduleux, c'est tout Internet qui est compromis. C'est pourquoi le CAB Forum régule strictement les CA.

### Vérifier un certificat

```bash
# Via openssl
openssl s_client -connect google.com:443 -showcerts

# Via curl
curl -v https://google.com 2>&1 | grep -A5 "Server certificate"

# Voir les détails
echo | openssl s_client -connect google.com:443 2>/dev/null \
  | openssl x509 -noout -text | grep -E "Subject:|Not After:|SAN"
```

---

## SNI — Server Name Indication

Un même serveur peut héberger des centaines de domaines sur une seule adresse IP. TLS doit savoir quel certificat présenter **avant** d'avoir établi la session chiffrée.

SNI résout ce problème : le client inclut le nom de domaine cible dans le ClientHello — en **clair**, avant le chiffrement.

C'est une fuite de confidentialité : un observateur sait que vous visitez `banque.fr` même s'il ne peut pas lire le contenu.

**ECH (Encrypted Client Hello)** — la solution en cours de déploiement — chiffre également le SNI.

---

## HSTS — forcer HTTPS

Un serveur peut dire à votre navigateur de ne jamais envoyer de requête HTTP :

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

Après avoir reçu ce header, le navigateur convertit `http://` en `https://` **localement**, sans contacter le serveur HTTP. Protège contre le SSL stripping.

**HSTS Preload :** une liste de domaines codée en dur dans les navigateurs (Chrome, Firefox, Safari) qui forcent HTTPS dès la première visite, même sans avoir vu le header HSTS.

---

## Exercice pratique

```bash
# Observer le handshake TLS complet
sudo tcpdump -i any -w /tmp/tls.pcap host google.com &
curl https://google.com -o /dev/null
kill %1

# Ouvrir dans Wireshark et filtrer : tls.handshake
wireshark /tmp/tls.pcap

# Vérifier TLS 1.3 et cipher suite
openssl s_client -connect google.com:443 </dev/null 2>&1 | \
  grep -E "Protocol|Cipher"
```

---

## À retenir

- TLS = confidentialité + intégrité + authentification
- TLS 1.3 : 1 RTT, PFS obligatoire, algorithmes faibles supprimés
- ECDHE : échange de clé sans transmettre le secret, éphémère par connexion
- Certificat = identité signée par une CA de confiance
- SNI = nom de domaine visible en clair dans le ClientHello (voir ECH)
- HSTS = le navigateur refuse HTTP après la première connexion HTTPS
