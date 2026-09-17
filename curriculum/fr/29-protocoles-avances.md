# Jour 29 — Protocoles avancés : DHCP, NTP, SNMP, RADIUS

## La situation réelle

Ces protocoles fonctionnent en silence en arrière-plan. Quand ils tombent en panne, c'est catastrophique. Comprendre comment ils fonctionnent vous permet de diagnostiquer les pannes rares mais critiques.

---

## DHCP — Attribution automatique des adresses IP

DHCP (RFC 2131, UDP ports 67/68) attribue automatiquement les paramètres réseau aux clients.

### Le DORA handshake

```
Client (0.0.0.0)      DHCP Server (255.255.255.255 broadcast)
     │                         │
     │── DHCP Discover ───────►│  "Qui peut me donner une IP ?" (broadcast)
     │                         │
     │◄── DHCP Offer ──────────│  "Je t'offre 192.168.1.50, bail 24h"
     │                         │
     │── DHCP Request ────────►│  "J'accepte 192.168.1.50" (broadcast)
     │                         │
     │◄── DHCP Ack ────────────│  "C'est confirmé, voici tes paramètres"
```

**Paramètres distribués :**
```
IP address    : 192.168.1.50
Subnet mask   : 255.255.255.0
Default GW    : 192.168.1.1
DNS servers   : 1.1.1.1, 8.8.8.8
Lease time    : 86400 secondes
```

### Configuration serveur DHCP (isc-dhcp-server)

```
# /etc/dhcp/dhcpd.conf
subnet 192.168.1.0 netmask 255.255.255.0 {
  range 192.168.1.100 192.168.1.200;
  option routers 192.168.1.1;
  option domain-name-servers 1.1.1.1, 8.8.8.8;
  default-lease-time 86400;
  max-lease-time 172800;

  # Adresse fixe par MAC (réservation)
  host serveur-prod {
    hardware ethernet aa:bb:cc:dd:ee:ff;
    fixed-address 192.168.1.10;
  }
}
```

```bash
# Voir les baux actifs
cat /var/lib/dhcp/dhcpd.leases

# Client : renouveler le bail
sudo dhclient -r eth0   # libérer
sudo dhclient eth0      # obtenir nouveau bail
```

### DHCP Snooping — sécurité

Un serveur DHCP rogue sur votre réseau peut rediriger tout le trafic (MitM). DHCP Snooping sur les switches managed filtre les réponses DHCP pour n'accepter que celles des ports "trusted".

---

## NTP — Synchronisation de l'horloge

NTP (RFC 5905, UDP port 123) synchronise les horloges réseau avec une précision de quelques millisecondes.

**Pourquoi c'est critique :**
- TLS : les certificats ont des dates de validité → horloge erronée = connexions rejetées
- Logs : timestamps incohérents → debug impossible
- Kerberos : tolérance de 5 minutes max sur l'horloge
- Bases de données distribuées : ordering des événements

### Hiérarchie NTP (Strata)

```
Stratum 0 : Horloge atomique / GPS (source de référence)
Stratum 1 : Serveurs directement connectés à stratum 0
Stratum 2 : Serveurs synchronisés sur stratum 1 (pool.ntp.org)
Stratum 3 : Vos serveurs internes
Stratum 4 : Vos workstations et appareils
```

```bash
# Vérifier la synchronisation
timedatectl status
ntpq -p        # voir les sources NTP et leur offset

# Configurer NTP (systemd-timesyncd)
# /etc/systemd/timesyncd.conf
[Time]
NTP=0.fr.pool.ntp.org 1.fr.pool.ntp.org
FallbackNTP=time.cloudflare.com

sudo systemctl restart systemd-timesyncd
timedatectl set-ntp true
```

---

## SNMP — Simple Network Management Protocol

SNMP (UDP port 161/162) monitore et configure les équipements réseau (switches, routeurs, imprimantes).

### Versions et sécurité

- **SNMPv1/v2c :** communauté en clair (ne pas utiliser en production)
- **SNMPv3 :** authentification + chiffrement (utiliser impérativement)

### MIB et OID

Les données SNMP sont organisées en arbre (MIB). Chaque nœud a un OID (Object Identifier).

```bash
# Interroger un équipement SNMP
snmpwalk -v2c -c public 192.168.1.1 sysDescr
snmpwalk -v2c -c public 192.168.1.1 ifTable

# OID courants
1.3.6.1.2.1.1.1.0  = sysDescr (description système)
1.3.6.1.2.1.2.2    = ifTable (interfaces réseau)
1.3.6.1.2.1.2.2.1.10 = ifInOctets (octets reçus par interface)

# Avec SNMPv3
snmpwalk -v3 -l authPriv -u monuser \
  -a SHA -A "authpass" \
  -x AES -X "privpass" \
  192.168.1.1 system
```

---

## RADIUS — Authentification centralisée

RADIUS (RFC 2865, UDP 1812/1813) centralise l'authentification réseau : Wi-Fi enterprise (802.1X), VPN, accès aux équipements réseau.

### Flux 802.1X Wi-Fi

```
[Station] ←──802.1X──► [AP/Switch] ←──RADIUS──► [Serveur RADIUS]
                                                  (FreeRADIUS, Cisco ISE)
   │                       │                           │
   ├── EAPOL Start ────────►                           │
   │                       ├── Access-Request ─────────►
   │                       │                           │
   │◄── EAP Challenge ──────                           │
   │                       ◄── Access-Challenge ────────
   │── EAP Response ────────►                          │
   │                       ├── Access-Request ─────────►
   │                       │                           │
   │                       ◄── Access-Accept ───────────
   │◄── EAPOL Success ──────                           │
   │                       [Port ouvert]                │
```

---

## À retenir

- DHCP DORA : Discover → Offer → Request → Ack
- DHCP Snooping : bloquer les serveurs DHCP rogue sur le réseau
- NTP : synchronisation critique (TLS, Kerberos, logs, DB distribuées)
- Stratum 2 = pool.ntp.org, toujours configurer au minimum 2 sources
- SNMP v3 obligatoire (v1/v2c = mot de passe en clair)
- RADIUS = authentification 802.1X pour Wi-Fi enterprise et VPN
