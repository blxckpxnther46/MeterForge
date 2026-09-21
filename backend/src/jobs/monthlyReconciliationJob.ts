import { ReconciliationService } from '../services/reconciliationService';

export async function executeMonthlyReconciliationJob() {
  try {
    console.log('[JobRunner] Triggering manual monthly reconciliation job...');
    const result = await ReconciliationService.runMonthlyReconciliation();
    console.log('[JobRunner] Reconciliation job completed successfully:', result);
    return result;
  } catch (error) {
    console.error('[JobRunner] Reconciliation job failed:', error);
    throw error;
  }
}

if (require.main === module) {
  executeMonthlyReconciliationJob()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
