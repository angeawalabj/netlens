# Jour 25 — Réseau Kubernetes : pods, services et ingress

## La situation réelle

Vous déployez vos microservices sur Kubernetes. Comment deux pods dans des nodes différents se parlent-ils ? Comment exposer un service à l'extérieur ? Comment le trafic arrive-t-il jusqu'au bon pod ?

---

## Le modèle réseau Kubernetes

**Règle fondamentale :**
- Chaque pod a sa propre adresse IP routable dans le cluster
- Tout pod peut parler à tout autre pod sans NAT
- Les pods voient leur propre IP, pas une IP NATée

```bash
# Voir l'IP d'un pod
kubectl get pod mon-pod -o jsonpath='{.status.podIP}'

# Réseau des nodes
kubectl get nodes -o wide
# INTERNAL-IP = IP du node dans le cluster
```

---

## CNI — Container Network Interface

Le CNI (Flannel, Calico, Cilium, Weave) implémente le modèle réseau Kubernetes.

**Flannel (simple) :** VXLAN overlay — encapsule les paquets inter-nodes dans UDP.

**Calico :** BGP natif — route les paquets sans encapsulation si possible. Supporte les Network Policies.

**Cilium :** eBPF — implémentation dans le kernel Linux, très performant, observabilité avancée.

```bash
# Voir le CNI installé
kubectl get pods -n kube-system | grep -E "calico|flannel|cilium"

# Voir les routes IP dans un node
kubectl debug node/node1 -it --image=nicolaka/netshoot -- ip route
```

---

## Services Kubernetes

Un Service expose un ensemble de pods via une IP virtuelle stable (ClusterIP).

```yaml
apiVersion: v1
kind: Service
metadata:
  name: payments-svc
spec:
  selector:
    app: payments       # sélectionne les pods avec ce label
  ports:
    - port: 80          # port du service
      targetPort: 8080  # port du pod
  type: ClusterIP       # accessible uniquement dans le cluster
```

### Types de services

**ClusterIP (défaut) :** IP virtuelle interne au cluster uniquement.

**NodePort :** expose sur chaque node du cluster sur un port fixe (30000-32767).
```yaml
type: NodePort
ports:
  - port: 80
    nodePort: 30080     # accessible depuis l'extérieur via <node-ip>:30080
```

**LoadBalancer :** crée un load balancer cloud (AWS ELB, GCP LB) avec IP publique.
```yaml
type: LoadBalancer
# → IP publique allouée par le cloud provider
```

**ExternalName :** alias DNS vers un service externe.
```yaml
type: ExternalName
externalName: api.stripe.com
```

### kube-proxy et iptables

kube-proxy maintient des règles iptables sur chaque node pour rediriger le trafic vers les pods corrects.

```bash
# Voir les règles iptables générées par kube-proxy
iptables -t nat -L KUBE-SERVICES -n
# → des centaines de règles DNAT pour chaque service
```

---

## DNS dans Kubernetes (CoreDNS)

CoreDNS résout automatiquement les noms de services :

```
<service>.<namespace>.svc.cluster.local
payments-svc.production.svc.cluster.local → 10.96.0.100

# Depuis le même namespace, juste le nom suffit :
curl http://payments-svc/api/charge
```

---

## Ingress — exposer HTTP à l'extérieur

Un Ingress est un reverse proxy géré par Kubernetes.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /payments
            backend:
              service:
                name: payments-svc
                port:
                  number: 80
          - path: /users
            backend:
              service:
                name: users-svc
                port:
                  number: 80
  tls:
    - hosts:
        - api.example.com
      secretName: api-tls-cert   # cert-manager gère le renouvellement
```

### Flux du trafic

```
Internet → LoadBalancer (IP publique)
         → Ingress Controller (nginx/traefik pod)
         → Service (ClusterIP)
         → Pod (via iptables DNAT)
```

---

## Network Policies — micro-segmentation

Sans Network Policy, tous les pods se parlent librement.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: payments-isolation
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: payments
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: api-gateway   # seul l'API gateway peut appeler payments
      ports:
        - port: 8080
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: postgres      # payments ne peut parler qu'à postgres
      ports:
        - port: 5432
```

---

## Debugging réseau Kubernetes

```bash
# Pod de debug avec tous les outils réseau
kubectl run netshoot --rm -it --image=nicolaka/netshoot -- bash

# Dans le pod :
ping payments-svc
curl http://payments-svc/health
nslookup payments-svc
tcpdump -i eth0

# Voir les endpoints d'un service
kubectl get endpoints payments-svc
# → les IPs des pods sélectionnés

# Vérifier qu'un pod reçoit du trafic
kubectl exec -it payments-pod -- ss -tan
```

---

## À retenir

- Chaque pod a une IP unique routable dans le cluster (pas de NAT)
- CNI (Calico, Cilium, Flannel) implémente le modèle réseau
- Service = IP virtuelle stable devant un groupe de pods
- kube-proxy = règles iptables DNAT sur chaque node
- CoreDNS = résolution `<service>.<namespace>.svc.cluster.local`
- Ingress = reverse proxy HTTP, routing basé sur host/path
- Network Policy = firewall entre pods (micro-segmentation)
