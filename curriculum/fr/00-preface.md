# Préface — Pourquoi ce programme existe

## Le problème avec les cours réseau habituels

La plupart des ressources pour apprendre les réseaux suivent le même schéma :

1. Le modèle OSI (7 couches, souvent incomprises)
2. TCP/IP (4 couches, présentées comme une simplification)
3. Une liste de protocoles dans l'ordre de leurs RFCs
4. Un quiz de mémorisation en fin de chapitre

Vous finissez le cours en sachant *que* TCP fait un three-way handshake. Mais pas *pourquoi*. Pas *ce qui se passe quand ça échoue*. Pas *comment vous le verriez dans Wireshark*.

## Ce que ce programme fait différemment

**On part des situations réelles, pas des protocoles.**

Vous avez déjà vécu ces situations :
- "Mon site est lent uniquement pour les utilisateurs en Asie"
- "Ça marche sur ma machine mais pas en production"
- "Mon API timeout aléatoirement sous charge"
- "Mon email arrive dans les spams"

Chaque situation est une porte d'entrée vers les protocoles qu'il faut comprendre pour la résoudre. On ne décrit pas TCP pour décrire TCP — on l'explique parce que vous avez besoin de comprendre pourquoi votre connexion a tombé.

## La question centrale des 30 jours

> *Que se passe-t-il exactement, à la milliseconde près, quand vous appuyez sur Entrée après avoir tapé une URL ?*

Cette question contient les 30 jours. DNS, TCP, TLS, HTTP — tout y est. On y revient semaine après semaine avec des couches de compréhension supplémentaires.

## Comment utiliser ce programme

**Chaque chapitre répond à trois questions :**
1. Quel problème ce protocole résout-il ? (la raison d'être)
2. Est-il stateful ou stateless ? (son modèle mental)
3. À quoi ressemble son en-tête ? (ce que vous voyez dans Wireshark)

**L'outil qui accompagne le texte :**
NetLens Sandbox vous permet de voir chaque échange protocole en temps réel. Ne lisez pas sans ouvrir le sandbox en parallèle — l'observation active fixe les concepts 10× mieux que la lecture passive.

**Wireshark dès le Jour 3 :**
On installe Wireshark au Jour 3, pas au Jour 30. Chaque nouveau protocole est immédiatement observable sur votre propre machine.

## Prérequis

- Savoir ce qu'est une adresse IP (approximativement)
- Avoir déjà ouvert un terminal
- Aucune connaissance réseau préalable requise

---

*Bonne lecture. Bonne observation.*
