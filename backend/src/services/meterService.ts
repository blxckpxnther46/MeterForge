import { UsageRepository } from '../repositories/usageRepository';
import { QuotaService } from './quotaService';
import { PricingService } from './pricingService';
import { UsageType, TokenBreakdown, GenerateUsageResponse } from '../types';

export class MeterService {
  static async recordUsage(
    tenantId: string,
    usageType: UsageType,
    quantity: number,
    idempotencyKey: string,
    metadata?: TokenBreakdown
  ): Promise<GenerateUsageResponse> {
    // 1. Idempotency Check: if request key already exists, return original result immediately
    const existing = await UsageRepository.findByIdempotencyKey(tenantId, idempotencyKey);
    if (existing) {
      const costEstimate =
        existing.usage_type === 'ai_tokens'
          ? PricingService.microPaiseToPaise(PricingService.calculateAiTokenCostMicroPaise(existing.metadata || {}))
          : PricingService.calculateApiCallCostPaise(existing.quantity);

      return {
        success: true,
        duplicate: true,
        event: existing,
        costEstimatePaise: costEstimate,
      };
    }

    // 2. Quota Check BEFORE recording new usage event
    await QuotaService.checkQuota(tenantId, usageType, quantity);

    // 3. Record Usage Event atomically
    const { event, duplicate } = await UsageRepository.recordUsage(
      tenantId,
      usageType,
      quantity,
      idempotencyKey,
      metadata
    );

    // 4. Calculate cost estimate
    const costEstimate =
      usageType === 'ai_tokens'
        ? PricingService.microPaiseToPaise(PricingService.calculateAiTokenCostMicroPaise(metadata || {}))
        : PricingService.calculateApiCallCostPaise(quantity);

    return {
      success: true,
      duplicate,
      event,
      costEstimatePaise: costEstimate,
    };
  }

  static async getUsageRollup(tenantId: string): Promise<any> {
    const { periodStart, periodEnd, periodString } = QuotaService.getCurrentBillingPeriod();
    const summary = await UsageRepository.getMonthlyUsageSummary(tenantId, periodStart, periodEnd);
    const events = await UsageRepository.getMonthlyEvents(tenantId, periodStart, periodEnd);

    // Calculate total monthly AI token cost
    let totalAiTokensMicroPaise = 0;
    for (const event of events) {
      if (event.usage_type === 'ai_tokens' && event.metadata) {
        totalAiTokensMicroPaise += PricingService.calculateAiTokenCostMicroPaise(event.metadata);
      }
    }

    const aiTokensCostPaise = PricingService.microPaiseToPaise(totalAiTokensMicroPaise);

    // Get current plan & subscription
    const quotaStatus = await QuotaService.checkQuota(tenantId, 'api_call', 0).catch((err) => {
      return null;
    });

    const subscription = quotaStatus ? await import('../repositories/subscriptionRepository').then(m => m.SubscriptionRepository.findByTenantId(tenantId)) : null;
    const plan = quotaStatus ? quotaStatus.plan : await import('../repositories/planRepository').then(m => m.PlanRepository.findByName('Free'));

    const basePlanPricePaise = plan ? plan.price : 0;
    const totalCostPaise = basePlanPricePaise + aiTokensCostPaise;

    return {
      tenantId,
      period: periodString,
      apiCalls: {
        used: summary.apiCallsUsed,
        limit: plan ? plan.api_call_limit : 1000,
      },
      aiTokens: {
        used: summary.aiTokensUsed,
        limit: plan ? plan.ai_token_limit : 100000,
      },
      cost: {
        amount: totalCostPaise,
        basePlanPaise: basePlanPricePaise,
        usageCostPaise: aiTokensCostPaise,
        formattedINR: PricingService.formatPaiseToINR(totalCostPaise),
        currency: 'INR',
      },
      plan: plan ? plan.name : 'Free',
      subscriptionStatus: subscription ? subscription.status : 'active',
    };
  }
}
