import request from 'supertest';
import crypto from 'crypto';
import app from '../../src/app';
import { runMigrations } from '../../src/db/migrate';
import { runSeed } from '../../src/db/seed';
import { pool } from '../../src/config/database';
import { config } from '../../src/config/env';
import { TenantRepository } from '../../src/repositories/tenantRepository';
import { PlanRepository } from '../../src/repositories/planRepository';
import { SubscriptionRepository } from '../../src/repositories/subscriptionRepository';

describe('MeterForge Integration Tests - Webhook Signature & State Sync', () => {
  let testTenantId: string;
  const secret = config.razorpay.webhookSecret;

  beforeAll(async () => {
    await runMigrations();
    await runSeed();

    const tenant = await TenantRepository.create('Webhook Test Tenant');
    testTenantId = tenant.id;
    const freePlan = await PlanRepository.findByName('Free');
    await SubscriptionRepository.createOrUpdateSubscription(testTenantId, freePlan!.id);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('PROBE 4: rejects forged webhook with bad signature and returns 400 without modifying state', async () => {
    const payload = {
      event: 'subscription.authenticated',
      event_id: `evt_forged_${Date.now()}`,
      payload: {
        subscription: {
          entity: {
            id: 'sub_test_forged',
            notes: { tenant_id: testTenantId },
          },
        },
      },
    };

    const res = await request(app)
      .post('/webhooks/razorpay')
      .set('x-razorpay-signature', 'invalid_forged_sig_12345')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');

    // Verify tenant is still on Free plan
    const sub = await SubscriptionRepository.findByTenantId(testTenantId);
    const freePlan = await PlanRepository.findByName('Free');
    expect(sub?.plan_id).toBe(freePlan?.id);
  });

  it('PROBE 3: verified Razorpay test webhook flips tenant Free -> Pro and GET /usage reflects new limits', async () => {
    const eventId = `evt_valid_${Date.now()}`;
    const payloadObj = {
      event: 'subscription.authenticated',
      event_id: eventId,
      payload: {
        subscription: {
          entity: {
            id: `sub_valid_${Date.now()}`,
            customer_id: 'cust_valid_123',
            notes: { tenant_id: testTenantId },
          },
        },
      },
    };

    const rawBody = JSON.stringify(payloadObj);
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const resWebhook = await request(app)
      .post('/webhooks/razorpay')
      .set('x-razorpay-signature', validSignature)
      .set('Content-Type', 'application/json')
      .send(rawBody);

    expect(resWebhook.status).toBe(200);
    expect(resWebhook.body.processed).toBe(true);

    // Verify tenant upgraded to Pro
    const usageRes = await request(app).get(`/usage?tenantId=${testTenantId}`);
    expect(usageRes.status).toBe(200);
    expect(usageRes.body.plan).toBe('Pro');
    expect(usageRes.body.apiCalls.limit).toBe(10000); // Pro limit
  });

  it('PROBE 4: replayed webhook event is deduplicated and ignored', async () => {
    const eventId = `evt_replayed_${Date.now()}`;
    const payloadObj = {
      event: 'subscription.charged',
      event_id: eventId,
      payload: {
        payment: {
          entity: {
            id: `pay_replayed_${Date.now()}`,
            notes: { tenant_id: testTenantId },
          },
        },
      },
    };

    const rawBody = JSON.stringify(payloadObj);
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    // First delivery
    const res1 = await request(app)
      .post('/webhooks/razorpay')
      .set('x-razorpay-signature', validSignature)
      .set('Content-Type', 'application/json')
      .send(rawBody);

    expect(res1.status).toBe(200);
    expect(res1.body.duplicate).toBe(false);

    // Second delivery (Replay)
    const res2 = await request(app)
      .post('/webhooks/razorpay')
      .set('x-razorpay-signature', validSignature)
      .set('Content-Type', 'application/json')
      .send(rawBody);

    expect(res2.status).toBe(200);
    expect(res2.body.duplicate).toBe(true);
  });
});
