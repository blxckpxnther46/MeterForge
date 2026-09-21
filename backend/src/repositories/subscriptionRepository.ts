import { query } from '../config/database';
import { Subscription, SubscriptionStatus } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class SubscriptionRepository {
  static async findByTenantId(tenantId: string): Promise<Subscription | null> {
    const res = await query(
      `SELECT * FROM subscriptions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [tenantId]
    );
    return res.rows[0] || null;
  }

  static async createOrUpdateSubscription(
    tenantId: string,
    planId: string,
    providerSubscriptionId?: string,
    providerCustomerId?: string,
    status: SubscriptionStatus = 'active'
  ): Promise<Subscription> {
    const existing = await this.findByTenantId(tenantId);
    if (existing) {
      await query(
        `UPDATE subscriptions 
         SET plan_id = $1, 
             provider_subscription_id = COALESCE($2, provider_subscription_id),
             provider_customer_id = COALESCE($3, provider_customer_id),
             status = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [planId, providerSubscriptionId || null, providerCustomerId || null, status, existing.id]
      );
      return (await this.findByTenantId(tenantId))!;
    } else {
      const subId = uuidv4();
      await query(
        `INSERT INTO subscriptions (id, tenant_id, plan_id, provider, provider_subscription_id, provider_customer_id, status)
         VALUES ($1, $2, $3, 'razorpay', $4, $5, $6)`,
        [subId, tenantId, planId, providerSubscriptionId || null, providerCustomerId || null, status]
      );
      return (await this.findByTenantId(tenantId))!;
    }
  }

  static async updateStatus(id: string, status: SubscriptionStatus): Promise<Subscription> {
    await query(
      `UPDATE subscriptions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [status, id]
    );
    const res = await query('SELECT * FROM subscriptions WHERE id = $1', [id]);
    return res.rows[0];
  }
}
