import { query } from '../config/database';
import { UsageEvent, UsageType, TokenBreakdown } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class UsageRepository {
  static async findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<UsageEvent | null> {
    const res = await query(
      `SELECT * FROM usage_events WHERE tenant_id = $1 AND idempotency_key = $2`,
      [tenantId, idempotencyKey]
    );
    if (!res.rows[0]) return null;

    const row = res.rows[0];
    if (typeof row.metadata === 'string') {
      try {
        row.metadata = JSON.parse(row.metadata);
      } catch (e) {}
    }
    return row;
  }

  static async recordUsage(
    tenantId: string,
    usageType: UsageType,
    quantity: number,
    idempotencyKey: string,
    metadata?: TokenBreakdown
  ): Promise<{ event: UsageEvent; duplicate: boolean }> {
    const existing = await this.findByIdempotencyKey(tenantId, idempotencyKey);
    if (existing) {
      return { event: existing, duplicate: true };
    }

    try {
      const eventId = uuidv4();
      await query(
        `INSERT INTO usage_events (id, tenant_id, usage_type, quantity, idempotency_key, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
        [eventId, tenantId, usageType, quantity, idempotencyKey, JSON.stringify(metadata || {})]
      );

      const recorded = await this.findByIdempotencyKey(tenantId, idempotencyKey);
      if (!recorded) {
        throw new Error('Failed to retrieve recorded usage event');
      }

      // If retrieved event id matches existing or newly generated eventId
      const isDuplicate = recorded.id !== eventId;
      return { event: recorded, duplicate: isDuplicate };
    } catch (err: any) {
      if (err.code === '23505' || err.message?.includes('UNIQUE')) {
        const duplicateEvent = await this.findByIdempotencyKey(tenantId, idempotencyKey);
        if (duplicateEvent) {
          return { event: duplicateEvent, duplicate: true };
        }
      }
      throw err;
    }
  }

  static async getMonthlyUsageSummary(tenantId: string, periodStart: Date, periodEnd: Date): Promise<{ apiCallsUsed: number; aiTokensUsed: number }> {
    const startIso = periodStart.toISOString();
    const endIso = periodEnd.toISOString();

    const res = await query(
      `SELECT usage_type, SUM(quantity) as total_quantity
       FROM usage_events
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
       GROUP BY usage_type`,
      [tenantId, startIso, endIso]
    );

    let apiCallsUsed = 0;
    let aiTokensUsed = 0;

    for (const row of res.rows) {
      if (row.usage_type === 'api_call') {
        apiCallsUsed = parseInt(row.total_quantity, 10) || 0;
      } else if (row.usage_type === 'ai_tokens') {
        aiTokensUsed = parseInt(row.total_quantity, 10) || 0;
      }
    }

    return { apiCallsUsed, aiTokensUsed };
  }

  static async getMonthlyEvents(tenantId: string, periodStart: Date, periodEnd: Date): Promise<UsageEvent[]> {
    const startIso = periodStart.toISOString();
    const endIso = periodEnd.toISOString();

    const res = await query(
      `SELECT * FROM usage_events
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
       ORDER BY created_at DESC`,
      [tenantId, startIso, endIso]
    );

    return res.rows.map((row) => {
      if (typeof row.metadata === 'string') {
        try {
          row.metadata = JSON.parse(row.metadata);
        } catch (e) {}
      }
      return row;
    });
  }
}
