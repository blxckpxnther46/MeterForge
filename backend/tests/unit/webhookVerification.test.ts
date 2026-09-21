import crypto from 'crypto';
import { PaymentService } from '../../src/services/paymentService';
import { config } from '../../src/config/env';

describe('PaymentService - Razorpay Webhook Signature Verification', () => {
  const secret = config.razorpay.webhookSecret;

  it('verifies valid HMAC SHA256 webhook signature', () => {
    const rawBody = JSON.stringify({ event: 'subscription.charged', event_id: 'evt_123' });
    const signature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const isValid = PaymentService.verifyWebhookSignature(rawBody, signature);
    expect(isValid).toBe(true);
  });

  it('rejects invalid or forged webhook signature', () => {
    const rawBody = JSON.stringify({ event: 'subscription.charged', event_id: 'evt_123' });
    const forgedSignature = 'forged_invalid_signature_hash_1234567890abcdef';

    const isValid = PaymentService.verifyWebhookSignature(rawBody, forgedSignature);
    expect(isValid).toBe(false);
  });
});
