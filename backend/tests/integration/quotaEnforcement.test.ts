import request from 'supertest';
import app from '../../src/app';
import { runMigrations } from '../../src/db/migrate';
import { runSeed } from '../../src/db/seed';
import { pool } from '../../src/config/database';
import { TenantRepository } from '../../src/repositories/tenantRepository';
import { PlanRepository } from '../../src/repositories/planRepository';
import { SubscriptionRepository } from '../../src/repositories/subscriptionRepository';
import { UsageRepository } from '../../src/repositories/usageRepository';

describe('MeterForge Integration Tests - Quota Enforcement & Boundaries', () => {
  let tempTenantId: string;

  beforeAll(async () => {
    await runMigrations();
    await runSeed();

    const tenant = await TenantRepository.create('Quota Test Tenant');
    tempTenantId = tenant.id;
    const freePlan = await PlanRepository.findByName('Free');
    await SubscriptionRepository.createOrUpdateSubscription(tempTenantId, freePlan!.id);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('PROBE 2: allows usage up to exact quota limit (1000 API calls for Free plan)', async () => {
    // Fill usage up to 999 using UsageRepository to ensure ID is generated properly
    await UsageRepository.recordUsage(
      tempTenantId,
      'api_call',
      999,
      `prefill_999_${Date.now()}`
    );

    // Call #1000 (at exact quota boundary limit 1000)
    const resExactBoundary = await request(app)
      .post('/generate')
      .set('Idempotency-Key', `boundary_1000_${Date.now()}`)
      .send({
        tenantId: tempTenantId,
        usageType: 'api_call',
        quantity: 1,
      });

    expect(resExactBoundary.status).toBe(201);
    expect(resExactBoundary.body.success).toBe(true);
  });

  it('PROBE 2: rejects request exceeding quota limit with HTTP 429 Too Many Requests', async () => {
    // Call #1001 (beyond plan limit 1000)
    const resExceeded = await request(app)
      .post('/generate')
      .set('Idempotency-Key', `exceeded_1001_${Date.now()}`)
      .send({
        tenantId: tempTenantId,
        usageType: 'api_call',
        quantity: 1,
      });

    expect(resExceeded.status).toBe(429);
    expect(resExceeded.body.error.code).toBe('QUOTA_EXCEEDED');
    expect(resExceeded.body.error.message).toContain('quota exceeded');
  });

  it('PROBE 2: returns 402 Payment Required if subscription is past_due or cancelled', async () => {
    const sub = await SubscriptionRepository.findByTenantId(tempTenantId);
    await SubscriptionRepository.updateStatus(sub!.id, 'past_due');

    const res = await request(app)
      .post('/generate')
      .set('Idempotency-Key', `past_due_call_${Date.now()}`)
      .send({
        tenantId: tempTenantId,
        usageType: 'api_call',
        quantity: 1,
      });

    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('PAYMENT_REQUIRED');
  });
});
