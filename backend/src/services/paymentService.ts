import crypto from 'crypto';
import Razorpay from 'razorpay';
import { config } from '../config/env';
import { PaymentEventRepository } from '../repositories/paymentEventRepository';
import { SubscriptionRepository } from '../repositories/subscriptionRepository';
import { PlanRepository } from '../repositories/planRepository';

export class PaymentService {
  private static razorpayInstance: Razorpay | null = null;

  private static getRazorpay(): Razorpay {
    const keyId = config.razorpay.keyId;
    const keySecret = config.razorpay.keySecret;

    if (!keyId || !keySecret || keyId.includes('placeholder') || keySecret.includes('placeholder')) {
      throw new Error('Razorpay API keys missing or using placeholders. Update RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend/.env.');
    }

    return new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  /**
   * Step 1: Create Order via official Razorpay SDK
   */
  static async createOrder(amountPaise: number, currency: string = 'INR', receipt?: string, notes?: Record<string, any>) {
    if (amountPaise < 100) {
      const err: any = new Error('Minimum order amount is 100 paise (₹1.00)');
      err.statusCode = 400;
      throw err;
    }

    try {
      const razorpay = this.getRazorpay();
      const options = {
        amount: Math.round(amountPaise),
        currency: currency || 'INR',
        receipt: receipt || `rcpt_${Date.now()}`,
        notes: notes || {},
      };

      const order = await razorpay.orders.create(options);
      return {
        success: true,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
      };
    } catch (error: any) {
      console.error('[RazorpayOrderError] Razorpay API order creation failed:', error.message || error);
      const statusCode = error.statusCode || (error.message?.includes('missing') ? 401 : 500);
      const apiErr: any = new Error(error.error?.description || error.message || 'Razorpay authentication failed. Verify KEY_ID and KEY_SECRET in backend/.env.');
      apiErr.statusCode = statusCode;
      throw apiErr;
    }
  }

  /**
   * Step 3: Verify Razorpay Standard Checkout Payment Signature
   * Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
   */
  static verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    if (!orderId || !paymentId || !signature || !config.razorpay.keySecret) {
      return false;
    }

    const text = `${orderId}|${paymentId}`;
    const generatedSignature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(text)
      .digest('hex');

    const bufGenerated = Buffer.from(generatedSignature, 'utf8');
    const bufReceived = Buffer.from(signature, 'utf8');

    if (bufGenerated.length !== bufReceived.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufGenerated, bufReceived);
  }

  /**
   * Verify Payment Endpoint Logic
   */
  static async verifyAndProcessPayment(
    orderId: string,
    paymentId: string,
    signature: string,
    tenantId?: string
  ) {
    if (!orderId || !paymentId || !signature) {
      const err: any = new Error('Missing required verification fields: razorpay_order_id, razorpay_payment_id, and razorpay_signature');
      err.statusCode = 400;
      throw err;
    }

    const isValid = this.verifyPaymentSignature(orderId, paymentId, signature);
    if (!isValid) {
      const err: any = new Error('Razorpay payment signature verification failed');
      err.statusCode = 400;
      throw err;
    }

    // Record verified payment event in database
    const providerEventId = `pay_${paymentId}`;
    await PaymentEventRepository.recordEvent('razorpay', providerEventId, 'payment.captured', {
      order_id: orderId,
      payment_id: paymentId,
      signature,
      tenantId,
    });

    // Upgrade tenant subscription to Pro if tenantId passed
    if (tenantId) {
      const proPlan = await PlanRepository.findByName('Pro');
      if (proPlan) {
        await SubscriptionRepository.createOrUpdateSubscription(
          tenantId,
          proPlan.id,
          orderId,
          paymentId,
          'active'
        );
      }
    }

    return {
      success: true,
      message: 'Payment verified and subscription activated successfully',
      payment_id: paymentId,
      order_id: orderId,
    };
  }

  /**
   * Verifies Razorpay Webhook HMAC SHA256 Signature against raw body.
   */
  static verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
    if (!signature || !config.razorpay.webhookSecret) {
      return false;
    }
    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.webhookSecret)
      .update(bodyStr)
      .digest('hex');

    const bufExpected = Buffer.from(expectedSignature, 'utf8');
    const bufReceived = Buffer.from(signature, 'utf8');

    if (bufExpected.length !== bufReceived.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufExpected, bufReceived);
  }

  /**
   * Processes a verified Razorpay Webhook Event with event deduplication.
   * Supports standard Payment Events: payment.captured, order.paid, payment.authorized,
   * as well as Subscription Events: subscription.authenticated, subscription.charged, subscription.cancelled.
   */
  static async handleWebhookEvent(
    rawBody: string | Buffer,
    signature: string,
    payload: any
  ): Promise<{ processed: boolean; duplicate: boolean; message: string }> {
    const isValid = this.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      const error: any = new Error('Invalid Razorpay webhook signature');
      error.statusCode = 400;
      throw error;
    }

    const providerEventId = payload.event_id || payload.id || `evt_${Date.now()}`;
    const eventType = payload.event || 'unknown';

    const { duplicate } = await PaymentEventRepository.recordEvent(
      'razorpay',
      providerEventId,
      eventType,
      payload
    );

    if (duplicate) {
      return { processed: false, duplicate: true, message: 'Duplicate webhook event ignored' };
    }

    const entity = payload.payload?.payment?.entity || payload.payload?.order?.entity || payload.payload?.subscription?.entity;
    const tenantId = entity?.notes?.tenant_id || payload.notes?.tenant_id;

    if (tenantId) {
      const proPlan = await PlanRepository.findByName('Pro');

      const isPaymentSuccess =
        eventType === 'payment.captured' ||
        eventType === 'order.paid' ||
        eventType === 'payment.authorized' ||
        eventType === 'subscription.authenticated' ||
        eventType === 'subscription.charged';

      if (isPaymentSuccess) {
        if (proPlan) {
          await SubscriptionRepository.createOrUpdateSubscription(
            tenantId,
            proPlan.id,
            entity?.order_id || entity?.id || entity?.subscription_id,
            entity?.id || entity?.customer_id,
            'active'
          );
        }
      } else if (eventType === 'subscription.cancelled' || eventType === 'subscription.halted' || eventType === 'payment.failed') {
        const sub = await SubscriptionRepository.findByTenantId(tenantId);
        if (sub) {
          await SubscriptionRepository.updateStatus(sub.id, 'cancelled');
        }
      }
    }

    return { processed: true, duplicate: false, message: 'Webhook event processed successfully' };
  }

  /**
   * Creates Checkout session details.
   */
  static async createCheckoutSession(tenantId: string): Promise<{ checkoutUrl: string; subscriptionId: string; keyId: string }> {
    const proPlan = await PlanRepository.findByName('Pro');
    if (!proPlan) {
      throw new Error('Pro plan configuration not found');
    }

    const mockSubscriptionId = `sub_test_${Date.now()}_${tenantId.substring(0, 8)}`;
    const checkoutUrl = `https://checkout.razorpay.com/v1/subscription/${mockSubscriptionId}`;

    return {
      checkoutUrl,
      subscriptionId: mockSubscriptionId,
      keyId: config.razorpay.keyId,
    };
  }
}
