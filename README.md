# MeterForge — Usage Metering & Billing Engine

MeterForge is a multi-tenant **Usage Metering & Billing Engine** built for the **FlyRank Backend Track Capstone**. It answers the core questions every SaaS engine faces:
1. How much has a tenant used?
2. How much does that usage cost?
3. Has the tenant reached its plan limits?
4. What subscription plan is the tenant currently on?

---

> [!IMPORTANT]
> ### Payment Gateway Implementation Note
> The FlyRank Capstone specification defines Stripe Test Mode as the reference payment provider. This implementation uses **Razorpay Test Mode** instead as an intentional payment-gateway substitution. The substitution preserves all required backend engineering behaviors — test-mode payment flow, subscription state synchronization (Free $\rightarrow$ Pro), HMAC SHA256 signature verification, event deduplication (`UNIQUE(provider, provider_event_id)`), and secure secret handling — while adapting provider-specific API calls to Razorpay.

---

> [!NOTE]
> ### Backend vs. Frontend Distinction
> - **Backend Engine (`src/`)**: Primary FlyRank capstone deliverable. Express + TypeScript + PostgreSQL / SQLite engine implementing layered architecture, database-level idempotency, quota boundary checks, integer money math, background reconciliation jobs, and automated Jest test coverage.
> - **Demo Frontend (`frontend/`)**: Optional demonstration interface built using React + Vite + Tailwind CSS to visually showcase real-time usage metering, quota progress bars, cost rollups, and Razorpay Test Mode checkout flows.

---

## 🏛️ Architecture Overview

```
                          Client / Demo Frontend
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Express API Gateway                             │
│ ┌───────────────────────┬─────────────────────┬──────────────────────┐ │
│ │  /generate (Metering) │  /usage (Rollups)   │ /webhooks/razorpay   │ │
│ └───────────┬───────────┴──────────┬──────────┴──────────┬───────────┘ │
└─────────────┼──────────────────────┼─────────────────────┼─────────────┘
              │                      │                     │
              ▼                      ▼                     ▼
    ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
    │  MeterService    │   │  PricingService  │   │  PaymentService  │
    │  Idempotency DB  │   │  Integer Paise   │   │  HMAC Verification│
    └─────────┬────────┘   └──────────────────┘   └────────┬─────────┘
              │                                            │
              ▼                                            ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     PostgreSQL / SQLite Database                       │
│ ┌──────────────┬─────────────┬───────────────┬───────────────────────┐ │
│ │ tenants      │ plans       │ subscriptions │ usage_events (UNIQUE) │ │
│ └──────────────┴─────────────┴───────────────┴───────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Features & Engineering Guarantees

1. **Database-Level Idempotent Metering**: Enforces `UNIQUE(tenant_id, idempotency_key)` on `usage_events`. Retries with the same key return the original result without duplicate charges.
2. **Pre-Action Quota Enforcement**: Validates usage *before* recording events. Boundary call at quota limit (e.g. 1,000 / 1,000) succeeds; calls exceeding quota return `HTTP 429 Too Many Requests`. Lapsed subscriptions return `HTTP 402 Payment Required`.
3. **Zero-Float Money Math**: All monetary amounts are calculated and stored strictly in integer **paise** (1 INR = 100 paise) and **micro-paise** (1 paise = 10,000 micro-paise).
4. **AI Token Pricing Model**: Implements token rates for input, cached input (75% discount), output, and reasoning tokens (billed as output tokens per FlyRank rules).
5. **Verified Razorpay Webhooks**: HMAC SHA256 signature verification over raw request body. Replayed events are deduplicated via `payment_events` table (`UNIQUE(provider, provider_event_id)`).
6. **Tenant Isolation**: All usage, subscriptions, and rollups are strictly partitioned by `tenant_id`.
7. **Background Reconciliation Job**: Periodic worker (`ReconciliationService`) auditing monthly usage rollups and flagging subscription anomalies.

---

## 📊 Database Schema

```sql
-- Tenants
CREATE TABLE tenants (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Plans (Free: 1k calls/100k tokens, Pro: 10k calls/1M tokens)
CREATE TABLE plans (
    id TEXT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    api_call_limit INT NOT NULL,
    ai_token_limit INT NOT NULL,
    price INT NOT NULL, -- in paise (e.g. 49900 = ₹499.00)
    currency VARCHAR(10) NOT NULL DEFAULT 'INR'
);

-- Subscriptions
CREATE TABLE subscriptions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    plan_id TEXT NOT NULL REFERENCES plans(id),
    provider VARCHAR(50) NOT NULL DEFAULT 'razorpay',
    status VARCHAR(50) NOT NULL DEFAULT 'active'
);

-- Idempotent Usage Events
CREATE TABLE usage_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    usage_type VARCHAR(50) NOT NULL,
    quantity INT NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    metadata TEXT DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tenant_idempotency UNIQUE (tenant_id, idempotency_key)
);

-- Payment Webhook Events (Deduplication)
CREATE TABLE payment_events (
    id TEXT PRIMARY KEY,
    provider VARCHAR(50) NOT NULL DEFAULT 'razorpay',
    provider_event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT unique_provider_event UNIQUE (provider, provider_event_id)
);
```

---

## 💰 Integer Money Math & Token Rates

| Token Category | Rate / 1,000 Tokens | Micro-Paise / 1,000 | Notes |
|---|---|---|---|
| **Input Tokens** | ₹0.15 (15 paise) | 15,000 micro-paise | Standard input tokens |
| **Cached Input Tokens** | ₹0.0375 (3.75 paise) | 3,750 micro-paise | 75% discount |
| **Output Tokens** | ₹0.60 (60 paise) | 60,000 micro-paise | Standard output tokens |
| **Reasoning Tokens** | ₹0.60 (60 paise) | 60,000 micro-paise | Billed as output tokens |

$$\text{Total Micro-Paise} = \frac{\text{Input} \times 15000 + \text{Cached} \times 3750 + (\text{Output} + \text{Reasoning}) \times 60000}{1000}$$

$$\text{Total Paise} = \lfloor \text{Total Micro-Paise} / 10000 \rfloor$$

---

## 🔌 API Endpoints

### 1. Healthcheck
- `GET /health`
- **Response**: `200 OK`

### 2. List Plans
- `GET /plans`
- **Response**: List of Free and Pro plan details and limits.

### 3. Record Usage (Billable & Idempotent)
- `POST /generate`
- **Headers**: `Idempotency-Key: abc-123-xyz`
- **Body**:
  ```json
  {
    "tenantId": "11111111-1111-1111-1111-111111111111",
    "usageType": "ai_tokens",
    "quantity": 1900,
    "tokenBreakdown": {
      "inputTokens": 1000,
      "cachedInputTokens": 500,
      "outputTokens": 300,
      "reasoningTokens": 100
    }
  }
  ```
- **Response (`201 Created` / `200 OK Duplicate`)**:
  ```json
  {
    "success": true,
    "duplicate": false,
    "event": { "id": "...", "idempotency_key": "abc-123-xyz" },
    "costEstimatePaise": 4
  }
  ```

### 4. Usage Rollup
- `GET /usage?tenantId=11111111-1111-1111-1111-111111111111`
- **Response (`200 OK`)**:
  ```json
  {
    "tenantId": "11111111-1111-1111-1111-111111111111",
    "period": "2026-09",
    "apiCalls": { "used": 120, "limit": 1000 },
    "aiTokens": { "used": 5000, "limit": 100000 },
    "cost": { "amount": 49900, "formattedINR": "₹499.00", "currency": "INR" },
    "plan": "Free",
    "subscriptionStatus": "active"
  }
  ```

### 5. Razorpay Subscription Checkout
- `POST /subscriptions/checkout`
- **Body**: `{ "tenantId": "..." }`

### 6. Razorpay Verified Webhook
- `POST /webhooks/razorpay`
- **Header**: `x-razorpay-signature: <hmac_sha256_hash>`

---

## 🚀 Quickstart & Running Locally

### 1. Environment Setup
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 2. Database & Application (Docker Compose)
```bash
docker compose up -d
npm install
npm run migrate
npm run seed
npm run dev
```

### 3. Run Automated Tests
```bash
npm test
```

### 4. Run Demo Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## 📄 Manifest & Capstone Files

- `capstone.yaml`: Evaluator manifest file
- `EVIDENCE.md`: Complete empirical test outputs verifying all 5 probes
- `BUILDLOG.md`: Chronological AI-assisted development log

---

## ⚠️ Limitations & Non-Goals

1. **Invoicing & Proration**: Mid-cycle upgrade proration and formal PDF invoicing are documented stretch goals outside core scope.
2. **Razorpay Test Mode Substitution**: Razorpay Test Mode credentials are used instead of Stripe Test Mode per project instructions. Real payments move no funds.
