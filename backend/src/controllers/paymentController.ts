import { Request, Response, NextFunction } from 'express';
import { PaymentService } from '../services/paymentService';

export class PaymentController {
  /**
   * STEP 1: Create Razorpay Order
   * POST /api/create-order
   */
  static async createOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { amount, currency, receipt, notes } = req.body;
      const orderAmount = amount || 49900; // Default to Pro plan price 49900 paise (₹499) if not provided

      const result = await PaymentService.createOrder(
        orderAmount,
        currency || 'INR',
        receipt,
        notes
      );

      return res.status(200).json(result);
    } catch (err: any) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({
          error: {
            code: err.statusCode === 400 ? 'INVALID_AMOUNT' : err.statusCode === 401 ? 'AUTHENTICATION_FAILED' : 'ORDER_CREATION_FAILED',
            message: err.message,
          },
        });
      }
      next(err);
    }
  }

  /**
   * STEP 3: Verify Razorpay Payment Signature
   * POST /api/verify-payment
   */
  static async verifyPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, tenantId } = req.body;

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({
          error: {
            code: 'MISSING_FIELDS',
            message: 'Fields razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.',
          },
        });
      }

      const result = await PaymentService.verifyAndProcessPayment(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        tenantId
      );

      return res.status(200).json(result);
    } catch (err: any) {
      if (err.statusCode === 400) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'SIGNATURE_VERIFICATION_FAILED',
            message: err.message,
          },
        });
      }
      next(err);
    }
  }
}
