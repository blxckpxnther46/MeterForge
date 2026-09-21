import { SubscriptionRepository } from '../repositories/subscriptionRepository';
import { PlanRepository } from '../repositories/planRepository';
import { UsageRepository } from '../repositories/usageRepository';
import { UsageType, Plan } from '../types';

export class QuotaExceededError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number = 429, code: string = 'QUOTA_EXCEEDED') {
    super(message);
    this.name = 'QuotaExceededError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class QuotaService {
  /**
   * Helper to compute start and end dates for the current billing month.
   */
  static getCurrentBillingPeriod(): { periodStart: Date; periodEnd: Date; periodString: string } {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthStr = (now.getMonth() + 1).toString().padStart(2, '0');
    const periodString = `${now.getFullYear()}-${monthStr}`;

    return { periodStart, periodEnd, periodString };
  }

  /**
   * Verifies if the requested usage is within the tenant's current plan limits.
   * Throws QuotaExceededError (429 or 402) if limits are exceeded or subscription is inactive.
   */
  static async checkQuota(
    tenantId: string,
    usageType: UsageType,
    quantity: number
  ): Promise<{ plan: Plan; currentUsage: number; newTotal: number; limit: number }> {
    const subscription = await SubscriptionRepository.findByTenantId(tenantId);
    if (!subscription) {
      throw new QuotaExceededError('No active subscription found for tenant. Upgrade required.', 402, 'PAYMENT_REQUIRED');
    }

    if (subscription.status === 'cancelled' || subscription.status === 'past_due') {
      throw new QuotaExceededError(
        `Subscription is ${subscription.status}. Payment is required to continue usage.`,
        402,
        'PAYMENT_REQUIRED'
      );
    }

    const plan = await PlanRepository.findById(subscription.plan_id);
    if (!plan) {
      throw new QuotaExceededError('Associated plan not found.', 500, 'INTERNAL_ERROR');
    }

    const { periodStart, periodEnd } = this.getCurrentBillingPeriod();
    const usageSummary = await UsageRepository.getMonthlyUsageSummary(tenantId, periodStart, periodEnd);

    const currentUsage = usageType === 'api_call' ? usageSummary.apiCallsUsed : usageSummary.aiTokensUsed;
    const limit = usageType === 'api_call' ? plan.api_call_limit : plan.ai_token_limit;

    const newTotal = currentUsage + quantity;

    if (newTotal > limit) {
      const typeLabel = usageType === 'api_call' ? 'API calls' : 'AI tokens';
      throw new QuotaExceededError(
        `Usage quota exceeded for ${typeLabel}. Current usage: ${currentUsage}, requested: ${quantity}, plan limit: ${limit}.`,
        429,
        'QUOTA_EXCEEDED'
      );
    }

    return { plan, currentUsage, newTotal, limit };
  }
}
