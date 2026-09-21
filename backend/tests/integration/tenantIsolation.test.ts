import request from 'supertest';
import app from '../../src/app';
import { runMigrations } from '../../src/db/migrate';
import { runSeed } from '../../src/db/seed';
import { pool } from '../../src/config/database';
import { TenantRepository } from '../../src/repositories/tenantRepository';
import { PlanRepository } from '../../src/repositories/planRepository';
import { SubscriptionRepository } from '../../src/repositories/subscriptionRepository';

describe('MeterForge Integration Tests - Tenant Isolation', () => {
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    await runMigrations();
    await runSeed();

    const tA = await TenantRepository.create('Isolation Tenant A');
    const tB = await TenantRepository.create('Isolation Tenant B');
    tenantAId = tA.id;
    tenantBId = tB.id;

    const freePlan = await PlanRepository.findByName('Free');
    await SubscriptionRepository.createOrUpdateSubscription(tenantAId, freePlan!.id);
    await SubscriptionRepository.createOrUpdateSubscription(tenantBId, freePlan!.id);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('maintains strict isolation between Tenant A and Tenant B usage counts', async () => {
    // Record usage for Tenant A
    await request(app)
      .post('/generate')
      .set('Idempotency-Key', `isolation_a_${Date.now()}`)
      .send({ tenantId: tenantAId, usageType: 'api_call', quantity: 15 });

    // Record usage for Tenant B
    await request(app)
      .post('/generate')
      .set('Idempotency-Key', `isolation_b_${Date.now()}`)
      .send({ tenantId: tenantBId, usageType: 'api_call', quantity: 45 });

    const resA = await request(app).get(`/usage?tenantId=${tenantAId}`);
    const resB = await request(app).get(`/usage?tenantId=${tenantBId}`);

    expect(resA.body.apiCalls.used).toBe(15);
    expect(resB.body.apiCalls.used).toBe(45);
    expect(resA.body.apiCalls.used).not.toEqual(resB.body.apiCalls.used);
  });
});
