# Jour 2 — Ethernet et ARP : comment ça se passe sur votre réseau local

## La situation réelle

Votre ordinateur veut envoyer un paquet à votre box (192.168.1.1). Il connaît l'adresse IP. Mais sur le câble Ethernet, les données ne voyagent pas par adresse IP — elles voyagent par adresse MAC.

**Le problème :** comment transformer "192.168.1.1" en une adresse MAC ?
**La solution :** ARP.

---

## Ethernet — La couche 2

Ethernet est le protocole qui gère la communication sur un réseau local (LAN). Une trame Ethernet contient :

```
[MAC destination 6B][MAC source 6B][EtherType 2B][Données][FCS 4B]
```

- **MAC destination** : l'adresse physique du destinataire
- **MAC source** : votre adresse physique
- **EtherType** : le protocole de couche 3 (0x0800 = IPv4, 0x0806 = ARP, 0x86DD = IPv6)

### Adresse MAC

Une adresse MAC fait 48 bits (6 octets) : `aa:bb:cc:dd:ee:ff`

Les 3 premiers octets identifient le fabricant (OUI — Organizationally Unique Identifier). Apple commence par `28:cf:e9`, Intel par `8c:8d:28`.

```bash
# Voir votre adresse MAC
ip link show        # Linux
ifconfig            # macOS
ipconfig /all       # Windows
```

### Broadcast

L'adresse `FF:FF:FF:FF:FF:FF` est l'adresse de broadcast — toutes les machines du réseau local reçoivent la trame.

---

## ARP — Address Resolution Protocol

ARP résout une adresse IP en adresse MAC. C'est simple, sans authentification, et c'est précisément ce qui le rend vulnérable.

### Fonctionnement

1. Votre machine veut contacter 192.168.1.1
2. Elle diffuse une requête ARP (broadcast) : **"Qui a 192.168.1.1 ?"**
3. La machine avec cette IP répond : **"C'est moi, ma MAC est aa:bb:cc:dd:ee:ff"**
4. Votre machine met en cache ce mapping pour éviter de redemander

```bash
# Voir le cache ARP
arp -n              # Linux
arp -a              # macOS / Windows
```

### Wireshark — voir ARP en direct

Lancez Wireshark avec le filtre `arp` et pingez une machine de votre réseau local. Vous verrez exactement ces deux paquets.

---

## ARP Spoofing — la faille

Puisqu'ARP n'a **aucune authentification**, n'importe quelle machine peut envoyer un ARP Reply non sollicité :

> "192.168.1.1 ? C'est moi ! MA MAC est `11:22:33:44:55:66`"

Si votre cache ARP est empoisonné avec la MAC de l'attaquant à la place de votre routeur, tout votre trafic passe par l'attaquant avant d'aller sur Internet. C'est une attaque Man-in-the-Middle (MITM) classique.

**Contre-mesures :**
- Dynamic ARP Inspection (DAI) sur les switches managés
- Entrées ARP statiques pour les machines critiques
- Segmentation réseau (VLANs)

---

## Exercice pratique

```bash
# Observer ARP sur votre réseau
sudo tcpdump -i eth0 arp

# Puis dans un autre terminal
ping 192.168.1.254   # une IP qui n'existe probablement pas
# Vous verrez des ARP "Who has 192.168.1.254?"
```

---

## À retenir

- Ethernet = protocole couche 2, trame avec MAC source/destination
- MAC = adresse physique 48 bits, unique par interface réseau
- ARP = résout IP → MAC (uniquement sur le réseau local)
- ARP est sans authentification → vulnérable au spoofing
- Les routeurs ne transmettent pas ARP (il ne sort pas du LAN)
