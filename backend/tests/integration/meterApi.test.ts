import request from 'supertest';
import app from '../../src/app';
import { runMigrations } from '../../src/db/migrate';
import { runSeed } from '../../src/db/seed';
import { pool } from '../../src/config/database';

describe('MeterForge Integration Tests - Idempotency & Metering', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111'; // Free tenant from seed

  beforeAll(async () => {
    await runMigrations();
    await runSeed();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('PROBE 1: records usage event on first request', async () => {
    const idempotencyKey = `key_test_first_${Date.now()}`;
    const res = await request(app)
      .post('/generate')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        tenantId,
        usageType: 'api_call',
        quantity: 10,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.duplicate).toBe(false);
    expect(res.body.event.idempotency_key).toBe(idempotencyKey);
  });

  it('PROBE 1: exact same request sent twice with same idempotency key returns original result without duplicate event', async () => {
    const idempotencyKey = `key_test_duplicate_${Date.now()}`;
    const payload = {
      tenantId,
      usageType: 'api_call',
      quantity: 5,
    };

    // First call
    const res1 = await request(app)
      .post('/generate')
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res1.status).toBe(201);
    expect(res1.body.duplicate).toBe(false);

    // Second call with same idempotency key
    const res2 = await request(app)
      .post('/generate')
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res2.status).toBe(200);
    expect(res2.body.duplicate).toBe(true);
    expect(res2.body.event.id).toBe(res1.body.event.id);
  });

  it('records separate events for different idempotency keys', async () => {
    const res1 = await request(app)
      .post('/generate')
      .set('Idempotency-Key', `key_diff_1_${Date.now()}`)
      .send({ tenantId, usageType: 'api_call', quantity: 1 });

    const res2 = await request(app)
      .post('/generate')
      .set('Idempotency-Key', `key_diff_2_${Date.now()}`)
      .send({ tenantId, usageType: 'api_call', quantity: 1 });

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.event.id).not.toEqual(res2.body.event.id);
  });
});
