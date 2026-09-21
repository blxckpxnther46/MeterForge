import { Request, Response, NextFunction } from 'express';
import { PaymentService } from '../services/paymentService';
import { SubscriptionRepository } from '../repositories/subscriptionRepository';

export class SubscriptionController {
  static async checkout(req: Request, res: Response, next: NextFunction) {
    try {
      const { tenantId } = req.body;
      if (!tenantId) {
        return res.status(400).json({
          error: {
            code: 'MISSING_TENANT_ID',
            message: 'tenantId is required in request body.',
          },
        });
      }

      const checkoutData = await PaymentService.createCheckoutSession(tenantId);
      return res.status(200).json(checkoutData);
    } catch (err) {
      next(err);
    }
  }

  static async getSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.query.tenantId as string;
      if (!tenantId) {
        return res.status(400).json({
          error: {
            code: 'MISSING_TENANT_ID',
            message: 'Query parameter tenantId is required.',
          },
        });
      }

      const subscription = await SubscriptionRepository.findByTenantId(tenantId);
      if (!subscription) {
        return res.status(444).json({
          error: {
            code: 'SUBSCRIPTION_NOT_FOUND',
            message: 'No subscription found for tenant.',
          },
        });
      }

      return res.status(200).json({ subscription });
    } catch (err) {
      next(err);
    }
  }

  static async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const { tenantId } = req.body;
      if (!tenantId) {
        return res.status(400).json({
          error: {
            code: 'MISSING_TENANT_ID',
            message: 'tenantId is required in request body.',
          },
        });
      }

      const sub = await SubscriptionRepository.findByTenantId(tenantId);
      if (!sub) {
        return res.status(404).json({
          error: {
            code: 'SUBSCRIPTION_NOT_FOUND',
            message: 'No active subscription found to cancel.',
          },
        });
      }

      const updated = await SubscriptionRepository.updateStatus(sub.id, 'cancelled');
      return res.status(200).json({ success: true, subscription: updated });
    } catch (err) {
      next(err);
    }
  }
}
