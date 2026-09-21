import app from './app';
import { config } from './config/env';
import { runMigrations } from './db/migrate';
import { runSeed } from './db/seed';
import { ReconciliationService } from './services/reconciliationService';

async function startServer() {
  try {
    console.log('Initializing MeterForge Backend Engine...');
    await runMigrations();
    await runSeed();

    // Schedule periodic background reconciliation job (every 1 hour)
    setInterval(() => {
      ReconciliationService.runMonthlyReconciliation().catch((err) => {
        console.error('Scheduled background reconciliation failed:', err);
      });
    }, 3600000);

    const server = app.listen(config.port, () => {
      console.log(`=======================================================`);
      console.log(`MeterForge Billing Engine running on http://localhost:${config.port}`);
      console.log(`Payment Gateway: Razorpay Test Mode (Substitution)`);
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`=======================================================`);
    });

    return server;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

export { startServer };
