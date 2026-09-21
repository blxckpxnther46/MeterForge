import { PlanRepository } from '../repositories/planRepository';
import { TenantRepository } from '../repositories/tenantRepository';
import { SubscriptionRepository } from '../repositories/subscriptionRepository';

export async function runSeed() {
  try {
    console.log('Seeding initial plans and tenants...');

    // Seed Free & Pro Plans
    const freePlan = await PlanRepository.createOrUpdate('Free', 1000, 100000, 0);
    const proPlan = await PlanRepository.createOrUpdate('Pro', 10000, 1000000, 49900);

    // Seed Demo Tenant A (Free Plan)
    const tenantAId = '11111111-1111-1111-1111-111111111111';
    let tenantA = await TenantRepository.findById(tenantAId);
    if (!tenantA) {
      tenantA = await TenantRepository.create('Acme Corp (Free Tenant)', tenantAId);
    }
    await SubscriptionRepository.createOrUpdateSubscription(tenantAId, freePlan.id, undefined, undefined, 'active');

    // Seed Demo Tenant B (Pro Plan)
    const tenantBId = '22222222-2222-2222-2222-222222222222';
    let tenantB = await TenantRepository.findById(tenantBId);
    if (!tenantB) {
      tenantB = await TenantRepository.create('Stark Industries (Pro Tenant)', tenantBId);
    }
    await SubscriptionRepository.createOrUpdateSubscription(tenantBId, proPlan.id, undefined, undefined, 'active');

    console.log('Seed completed successfully.');
  } catch (error) {
    console.error('Failed to seed database:', error);
    throw error;
  }
}

if (require.main === module) {
  runSeed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
