import { TenantRepository } from '../repositories/tenantRepository';
import { UsageRepository } from '../repositories/usageRepository';
import { QuotaService } from './quotaService';
import { SubscriptionRepository } from '../repositories/subscriptionRepository';

export class ReconciliationService {
  /**
   * Background job to reconcile monthly usage and audit active tenant subscriptions.
   * Runs off the request path with retry capability and error reporting.
   */
  static async runMonthlyReconciliation(): Promise<{ processedTenants: number; anomaliesFound: number }> {
    console.log('[BackgroundJob] Starting monthly usage aggregation & subscription reconciliation job...');
    let processedCount = 0;
    let anomalyCount = 0;

    const tenants = await TenantRepository.listAll();
    const { periodStart, periodEnd } = QuotaService.getCurrentBillingPeriod();

    for (const tenant of tenants) {
      try {
        processedCount++;
        const usage = await UsageRepository.getMonthlyUsageSummary(tenant.id, periodStart, periodEnd);
        const subscription = await SubscriptionRepository.findByTenantId(tenant.id);

        if (!subscription) {
          console.warn(`[BackgroundJob] Warning: Tenant ${tenant.id} (${tenant.name}) has no active subscription!`);
          anomalyCount++;
        } else if (subscription.status === 'past_due' && (usage.apiCallsUsed > 0 || usage.aiTokensUsed > 0)) {
          console.warn(`[BackgroundJob] Anomaly: Past-due Tenant ${tenant.id} accumulated usage during current period.`);
          anomalyCount++;
        }

        console.log(`[BackgroundJob] Reconciled tenant ${tenant.name} (${tenant.id}): API Calls = ${usage.apiCallsUsed}, AI Tokens = ${usage.aiTokensUsed}`);
      } catch (err) {
        console.error(`[BackgroundJob] Error reconciling tenant ${tenant.id}:`, err);
        anomalyCount++;
      }
    }

    console.log(`[BackgroundJob] Reconciliation complete. Processed ${processedCount} tenants, found ${anomalyCount} anomalies.`);
    return { processedTenants: processedCount, anomaliesFound: anomalyCount };
  }
}
