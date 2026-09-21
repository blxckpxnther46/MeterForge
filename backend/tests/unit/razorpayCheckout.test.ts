import crypto from 'crypto';
import { PaymentService } from '../../src/services/paymentService';
import { config } from '../../src/config/env';

describe('Razorpay Standard Checkout Integration', () => {
  const secret = config.razorpay.keySecret;

  it('STEP 3: verifies valid HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET) signature', () => {
    const orderId = 'order_test_123456';
    const paymentId = 'pay_test_789012';
    const text = `${orderId}|${paymentId}`;
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(text)
      .digest('hex');

    const isValid = PaymentService.verifyPaymentSignature(orderId, paymentId, validSignature);
    expect(isValid).toBe(true);
  });

  it('STEP 3: rejects invalid or tampered payment signature', () => {
    const orderId = 'order_test_123456';
    const paymentId = 'pay_test_789012';
    const tamperedSignature = 'forged_signature_hash_abcdef';

    const isValid = PaymentService.verifyPaymentSignature(orderId, paymentId, tamperedSignature);
    expect(isValid).toBe(false);
  });

  it('STEP 1: validates minimum order amount of 100 paise', async () => {
    await expect(PaymentService.createOrder(50)).rejects.toThrow('Minimum order amount is 100 paise');
  });
});
