# Jour 22 — Architectures distribuées et protocoles de coordination

## La situation réelle

Vous avez 10 microservices qui communiquent entre eux. Comment gérer la découverte de service, les timeouts, les retries, et éviter les cascades de pannes ?

---

## Service Discovery

Dans un environnement dynamique (Kubernetes, cloud), les IPs changent constamment. La découverte de service résout : "où est le service payments ?"

**DNS-based (simple) :**
```bash
# Kubernetes crée automatiquement des entrées DNS
curl http://payments-service.production.svc.cluster.local:8080
# Format : <service>.<namespace>.svc.cluster.local
```

**Consul / Eureka :** registre centralisé avec health checks actifs.

---

## Circuit Breaker

Quand un service dépendant est lent ou en panne, ne pas accumuler des requêtes qui timeouteront toutes.

```
États du circuit breaker :
CLOSED  → requêtes passent normalement
  ↓ (trop d'erreurs)
OPEN    → requêtes échouent immédiatement (fast fail)
  ↓ (après un délai)
HALF-OPEN → quelques requêtes test passent
  ↓ (succès)
CLOSED  → retour à la normale
```

```python
# Exemple avec tenacity
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10)
)
def call_payment_service(data):
    return requests.post("http://payments/charge", json=data, timeout=2)
```

---

## Timeouts et retries

**Règle :** tout appel réseau doit avoir un timeout explicite.

```python
# Sans timeout → thread bloqué indéfiniment
response = requests.get("http://service")  # ❌

# Avec timeout
response = requests.get("http://service", timeout=(3.05, 27))  # ✓
# (connect_timeout, read_timeout)
```

**Retry avec backoff exponentiel + jitter :**
```
Tentative 1 : immédiate
Tentative 2 : attendre 1s + random(0-1s)
Tentative 3 : attendre 2s + random(0-2s)
Tentative 4 : attendre 4s + random(0-4s)
```

Le jitter évite le "thundering herd" — tous les clients qui reessayent en même temps.

---

## gRPC — RPC moderne sur HTTP/2

gRPC (Google Remote Procedure Call) utilise HTTP/2 pour le transport et Protocol Buffers pour la sérialisation.

```protobuf
// payments.proto
service PaymentService {
    rpc Charge(ChargeRequest) returns (ChargeResponse);
    rpc StreamTransactions(StreamRequest) returns (stream Transaction);
}

message ChargeRequest {
    string user_id = 1;
    int64 amount_cents = 2;
    string currency = 3;
}
```

**Avantages vs REST :**
- Sérialisation binaire (Protocol Buffers) → ~10× plus compact que JSON
- HTTP/2 → multiplexage, streaming bidirectionnel
- Schema fort → documentation auto-générée, type safety
- Code client généré automatiquement

```bash
# Générer le code client Python
python -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. payments.proto
```

---

## Message queues — découplage asynchrone

Pour les opérations qui n'ont pas besoin de réponse immédiate.

```
Service A → [Queue] → Service B
           (Kafka, RabbitMQ, SQS)
```

**Garanties selon la queue :**
- At-most-once : peut perdre des messages (UDP-like)
- At-least-once : peut dupliquer (idempotence requise)
- Exactly-once : le plus complexe, overhead élevé (Kafka transactions)

---

## À retenir

- Service discovery DNS : simple, natif Kubernetes
- Circuit breaker : fast fail pour éviter la cascade de pannes
- Timeout obligatoire sur tout appel réseau
- Retry avec backoff exponentiel + jitter
- gRPC = HTTP/2 + Protocol Buffers + streaming bidirectionnel
- Message queue = découplage asynchrone, absorbe les pics de charge
