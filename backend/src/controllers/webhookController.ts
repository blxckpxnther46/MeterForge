import { Response, NextFunction } from 'express';
import { RequestWithRawBody } from '../middleware/rawBodyParser';
import { PaymentService } from '../services/paymentService';

export class WebhookController {
  static async handleRazorpayWebhook(req: RequestWithRawBody, res: Response, next: NextFunction) {
    try {
      const signature = req.headers['x-razorpay-signature'] as string;
      const rawBody = req.rawBody || JSON.stringify(req.body);

      const result = await PaymentService.handleWebhookEvent(rawBody, signature, req.body);
      return res.status(200).json(result);
    } catch (err: any) {
      if (err.statusCode === 400 || err.message?.includes('signature')) {
        return res.status(400).json({
          error: {
            code: 'INVALID_WEBHOOK_SIGNATURE',
            message: 'Razorpay webhook signature verification failed.',
          },
        });
      }
      next(err);
    }
  }
}
