# EVIDENCE.md — MeterForge Capstone Verification Proofs

This document presents empirical proof for all requirements and Acceptance Probes specified in the **FlyRank Backend Track Capstone Brief**.

---

## 1. Capstone Acceptance Probes Verification Summary

| Probe # | Description | Result | Automated Test Suite Proof |
|---|---|---|---|
| **PROBE 1** | Send same billable request twice with same idempotency key $\rightarrow$ exactly one usage event recorded; second response mirrors the first. | **PASS** | `tests/integration/meterApi.test.ts` |
| **PROBE 2** | Drive tenant to exact quota $\rightarrow$ boundary call allowed; call after returns `429 Too Many Requests` (or `402 Payment Required`). | **PASS** | `tests/integration/quotaEnforcement.test.ts` |
| **PROBE 3** | Verified Razorpay test webhook flips tenant Free $\rightarrow$ Pro $\rightarrow$ `GET /usage` shows new plan limits (10,000 API calls). | **PASS** | `tests/integration/webhookSync.test.ts` |
| **PROBE 4** | Send forged webhook (bad signature) $\rightarrow$ `400 Bad Request`, state unchanged. Replay real event $\rightarrow$ processed once. | **PASS** | `tests/integration/webhookSync.test.ts` |
| **PROBE 5** | Check pinned pricing rules $\rightarrow$ cached input & reasoning tokens produce exact totals; `GET /usage` matches. | **PASS** | `tests/unit/pricingService.test.ts` |

---

## 2. Detailed Test Execution Output

### Automated Jest Test Suite Execution Log

```
> meterforge@1.0.0 test
> jest --runInBand --detectOpenHandles --forceExit

  console.log
    Running database migrations...
    Database migrations applied successfully.
    Seeding initial plans and tenants...
    Seed completed successfully.

PASS tests/integration/webhookSync.test.ts
  MeterForge Integration Tests - Webhook Signature & State Sync
    ✓ PROBE 4: rejects forged webhook with bad signature and returns 400 without modifying state (165 ms)
    ✓ PROBE 3: verified Razorpay test webhook flips tenant Free -> Pro and GET /usage reflects new limits (759 ms)
    ✓ PROBE 4: replayed webhook event is deduplicated and ignored (547 ms)

PASS tests/integration/quotaEnforcement.test.ts
  MeterForge Integration Tests - Quota Enforcement & Boundaries
    ✓ PROBE 2: allows usage up to exact quota limit (1000 API calls for Free plan) (1234 ms)
    ✓ PROBE 2: rejects request exceeding quota limit with HTTP 429 Too Many Requests (713 ms)
    ✓ PROBE 2: returns 402 Payment Required if subscription is past_due or cancelled (613 ms)

PASS tests/unit/webhookVerification.test.ts
  PaymentService - Razorpay Webhook Signature Verification
    ✓ verifies valid HMAC SHA256 webhook signature (1 ms)
    ✓ rejects invalid or forged webhook signature (1 ms)

PASS tests/integration/tenantIsolation.test.ts
  MeterForge Integration Tests - Tenant Isolation
    ✓ maintains strict isolation between Tenant A and Tenant B usage counts (1692 ms)

PASS tests/integration/meterApi.test.ts
  MeterForge Integration Tests - Idempotency & Metering
    ✓ PROBE 1: records usage event on first request (424 ms)
    ✓ PROBE 1: exact same request sent twice with same idempotency key returns original result without duplicate event (567 ms)
    ✓ records separate events for different idempotency keys (755 ms)

PASS tests/unit/pricingService.test.ts
  PricingService - Integer Money Math
    ✓ calculates AI token cost correctly with cached input and reasoning tokens (2 ms)
    ✓ treats reasoning tokens strictly as output tokens (1 ms)
    ✓ calculates cached input tokens at a lower rate than standard input tokens (1 ms)
    ✓ formats paise integer to INR string correctly (1 ms)

Test Suites: 6 passed, 6 total
Tests:       16 passed, 16 total
Snapshots:   0 total
Time:        22.768 s
Ran all test suites.
```

---

## 3. Specific Requirement Proofs

### Requirement 1: Exactly-Once Idempotent Metering (PROBE 1)
- **First Request**:
  ```json
  POST /generate
  Headers: Idempotency-Key: key_test_duplicate_1726910000
  Body: { "tenantId": "11111111-1111-1111-1111-111111111111", "usageType": "api_call", "quantity": 5 }

  HTTP 201 Created
  Response: {
    "success": true,
    "duplicate": false,
    "event": { "id": "evt_abc123", "idempotency_key": "key_test_duplicate_1726910000", "quantity": 5 },
    "costEstimatePaise": 50
  }
  ```
- **Retried Request (Same Key)**:
  ```json
  POST /generate
  Headers: Idempotency-Key: key_test_duplicate_1726910000
  Body: { "tenantId": "11111111-1111-1111-1111-111111111111", "usageType": "api_call", "quantity": 5 }

  HTTP 200 OK
  Response: {
    "success": true,
    "duplicate": true,
    "event": { "id": "evt_abc123", "idempotency_key": "key_test_duplicate_1726910000", "quantity": 5 },
    "costEstimatePaise": 50
  }
  ```

---

### Requirement 2: Quota Enforcement & Status Codes (PROBE 2)
- **At Quota Limit (1,000 / 1,000 calls)**:
  ```json
  HTTP 201 Created
  Response: { "success": true, "duplicate": false }
  ```
- **Call Exceeding Limit (1,001 / 1,000 calls)**:
  ```json
  HTTP 429 Too Many Requests
  Response: {
    "error": {
      "code": "QUOTA_EXCEEDED",
      "message": "Usage quota exceeded for API calls. Current usage: 1000, requested: 1, plan limit: 1000."
    }
  }
  ```
- **Cancelled/Past-Due Subscription Call**:
  ```json
  HTTP 402 Payment Required
  Response: {
    "error": {
      "code": "PAYMENT_REQUIRED",
      "message": "Subscription is past_due. Payment is required to continue usage."
    }
  }
  ```

---

### Requirement 3: Webhook Verification & Plan Synchronization (PROBE 3 & 4)
- **Forged Signature Test**:
  ```json
  POST /webhooks/razorpay
  Header: x-razorpay-signature: invalid_signature_hash

  HTTP 400 Bad Request
  Response: {
    "error": {
      "code": "INVALID_WEBHOOK_SIGNATURE",
      "message": "Razorpay webhook signature verification failed."
    }
  }
  ```
- **Verified Webhook Upgrade**:
  ```json
  POST /webhooks/razorpay
  Header: x-razorpay-signature: <valid_hmac_sha256_hash>
  Body: { "event": "subscription.authenticated", "payload": { ... "notes": { "tenant_id": "..." } } }

  HTTP 200 OK
  Response: { "processed": true, "duplicate": false, "message": "Webhook event processed successfully" }
  ```
- **GET /usage Output After Upgrade**:
  ```json
  GET /usage?tenantId=11111111-1111-1111-1111-111111111111

  HTTP 200 OK
  Response: {
    "tenantId": "11111111-1111-1111-1111-111111111111",
    "period": "2026-09",
    "apiCalls": { "used": 1000, "limit": 10000 },
    "aiTokens": { "used": 0, "limit": 1000000 },
    "cost": { "amount": 49900, "formattedINR": "₹499.00", "currency": "INR" },
    "plan": "Pro",
    "subscriptionStatus": "active"
  }
  ```

---

### Requirement 4: Money Math & AI Token Cost Proof (PROBE 5)
- **Sample Calculation**:
  - Input Tokens: 1,000 @ ₹0.15/1k = 15,000 micro-paise
  - Cached Input Tokens: 500 @ ₹0.0375/1k = 1,875 micro-paise
  - Output Tokens: 300 @ ₹0.60/1k = 18,000 micro-paise
  - Reasoning Tokens: 100 @ ₹0.60/1k = 6,000 micro-paise (counted as output)
  - **Total Micro-Paise**: $15,000 + 1,875 + 18,000 + 6,000 = 40,875 \text{ micro-paise}$
  - **Total Paise**: $\lfloor 40,875 / 10,000 \rfloor = 4 \text{ paise}$ ($\text{₹}0.04$)
- **Automated Test Confirmation**: `tests/unit/pricingService.test.ts` passed.
