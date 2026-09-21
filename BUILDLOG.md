# BUILDLOG.md — MeterForge Development Log

This document records the chronological engineering process, architectural decisions, AI tool assistance, and verification steps for **MeterForge** built for the FlyRank Backend Track Capstone.

---

## Phase 1 — Problem Definition & Architecture Design
- **Objective**: Design a multi-tenant usage metering and billing engine capable of handling exact-once idempotent usage recording, quota enforcement, money math without floats, and Razorpay Test Mode webhooks.
- **Payment Provider Substitution Decision**: The official FlyRank Capstone brief specifies Stripe Test Mode as the reference payment gateway. For this implementation, **Razorpay Test Mode** was selected as an intentional provider substitution. Care was taken to preserve all underlying correctness criteria: test-mode idempotency, raw-body HMAC SHA256 signature verification, event deduplication in database (`UNIQUE(provider, provider_event_id)`), and tenant plan state synchronization (Free $\rightarrow$ Pro).
- **Architecture**: Clean layered architecture:
  `Routes -> Controllers -> Services -> Repositories -> PostgreSQL / SQLite`

---

## Phase 2 — Database Schema & Dual-Driver Resilience
- **Database Schema**: Created `001_initial_schema.sql` defining `tenants`, `plans`, `subscriptions`, `usage_events`, and `payment_events`.
- **Database-Level Constraints**:
  - `UNIQUE(tenant_id, idempotency_key)` on `usage_events` to enforce idempotency at the database engine level.
  - `UNIQUE(provider, provider_event_id)` on `payment_events` for strict webhook deduplication.
- **Multi-Database Support**: Implemented a dual-driver fallback system in `src/config/database.ts` supporting both PostgreSQL (via `pg.Pool`) and SQLite (via `better-sqlite3`). This guarantees zero-friction evaluation on any environment without requiring local Docker daemon dependencies.

---

## Phase 3 — Core Billing Logic & Idempotent Metering
- **Exact-Once Idempotency (`MeterService`)**:
  - Requests carrying an `Idempotency-Key` header query the database first.
  - Retried requests carrying the same key return the original recorded result with `duplicate: true` without recording duplicate usage events.
- **Quota Enforcement (`QuotaService`)**:
  - Enforced *before* recording billable actions.
  - Boundary behavior: At 1,000 / 1,000 calls (for Free plan), call #1,000 is allowed. Call #1,001 is rejected with `HTTP 429 Too Many Requests`.
  - Inactive/cancelled/past-due subscriptions return `HTTP 402 Payment Required`.

---

## Phase 4 — Integer Money Math & AI Token Pricing
- **Zero-Float Standard**: All currency values are calculated and stored as integers in **paise** (1 INR = 100 paise).
- **Micro-Paise Rate Calculation**:
  - Sub-paise rate math uses **micro-paise** (1 paise = 10,000 micro-paise).
  - Formulas:
    - Input tokens: ₹0.15 / 1k tokens (15,000 micro-paise per 1,000)
    - Cached input tokens: ₹0.0375 / 1k tokens (3,750 micro-paise per 1,000 — 75% discount)
    - Output tokens: ₹0.60 / 1k tokens (60,000 micro-paise per 1,000)
    - Reasoning tokens: Counted as output tokens per FlyRank requirements.

---

## Phase 5 — Razorpay Test Mode & Webhook Security
- **HMAC SHA256 Verification**: Implemented raw-body signature validation in `PaymentService` using `x-razorpay-signature`.
- **Buffer Safety**: Added length equality check before invoking `crypto.timingSafeEqual` to avoid buffer length mismatch range errors on forged signatures.
- **Deduplication**: Webhooks with duplicate `provider_event_id` return `200 OK` with `duplicate: true` without double-updating subscription states.

---

## Phase 6 — Automated Testing & Verification
- Developed 6 Jest integration/unit test suites containing 16 total tests.
- Covered all 5 FlyRank Capstone Acceptance Probes (Idempotency, Quota Boundaries, Free $\rightarrow$ Pro webhook sync, Forged signature rejection, and Integer money math).
- All 16 tests executed and passed cleanly.

---

## Phase 7 — Demo Frontend (React + Vite + Tailwind CSS)
- Built a demonstration dashboard interface under `frontend/`.
- Interfaces with live backend REST APIs (`/tenants`, `/usage`, `/plans`, `/generate`, `/subscriptions/checkout`, `/webhooks/razorpay`).
- Visualizes real-time usage progress bars, cost rollups, interactive request simulator, and Razorpay Test Mode checkout simulation.

---

## AI Assistance Disclosure
- **AI Helper**: Google Antigravity / Gemini 3.6 Flash.
- **AI Utility**: Scaffolded TypeScript repository files, generated Jest integration test suites, and formatted documentation tables.
- **Manual Adjustments & Code Refinements**:
  - Corrected `timingSafeEqual` buffer length checks in `PaymentService`.
  - Added SQLite query translation for multi-DB test environment execution.
  - Verified integer micro-paise division formulas.
