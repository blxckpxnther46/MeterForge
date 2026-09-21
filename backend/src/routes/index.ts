import { Router } from 'express';
import { HealthController } from '../controllers/healthController';
import { MeterController } from '../controllers/meterController';
import { PlanController } from '../controllers/planController';
import { SubscriptionController } from '../controllers/subscriptionController';
import { WebhookController } from '../controllers/webhookController';
import { PaymentController } from '../controllers/paymentController';
import { validateGenerateBody } from '../middleware/requestValidator';
import { rawBodyMiddleware } from '../middleware/rawBodyParser';
import { TenantRepository } from '../repositories/tenantRepository';

const router = Router();

// Health check
router.get('/health', HealthController.check);
router.get('/api/health', HealthController.check);

// Plans
router.get('/plans', PlanController.listPlans);
router.get('/api/plans', PlanController.listPlans);

// Metering
router.post('/generate', validateGenerateBody, MeterController.recordUsage);
router.post('/api/generate', validateGenerateBody, MeterController.recordUsage);
router.get('/usage', MeterController.getUsage);
router.get('/api/usage', MeterController.getUsage);

// Razorpay Standard Web Checkout Endpoints (Step 1 & Step 3)
router.post('/create-order', PaymentController.createOrder);
router.post('/api/create-order', PaymentController.createOrder);
router.post('/verify-payment', PaymentController.verifyPayment);
router.post('/api/verify-payment', PaymentController.verifyPayment);

// Subscriptions
router.post('/subscriptions/checkout', SubscriptionController.checkout);
router.post('/api/subscriptions/checkout', SubscriptionController.checkout);
router.get('/subscriptions', SubscriptionController.getSubscription);
router.get('/api/subscriptions', SubscriptionController.getSubscription);
router.post('/subscriptions/cancel', SubscriptionController.cancel);
router.post('/api/subscriptions/cancel', SubscriptionController.cancel);

// Webhook for Razorpay Test Mode
router.post('/webhooks/razorpay', rawBodyMiddleware, WebhookController.handleRazorpayWebhook);
router.post('/api/webhooks/razorpay', rawBodyMiddleware, WebhookController.handleRazorpayWebhook);

// Tenant helper endpoint for frontend / demo
router.get('/tenants', async (_req, res, next) => {
  try {
    const tenants = await TenantRepository.listAll();
    res.status(200).json({ tenants });
  } catch (err) {
    next(err);
  }
});
router.get('/api/tenants', async (_req, res, next) => {
  try {
    const tenants = await TenantRepository.listAll();
    res.status(200).json({ tenants });
  } catch (err) {
    next(err);
  }
});

export default router;
