import { Request, Response, NextFunction } from 'express';
import { MeterService } from '../services/meterService';

export class MeterController {
  static async recordUsage(req: Request, res: Response, next: NextFunction) {
    try {
      const { tenantId, usageType, quantity, idempotencyKey, tokenBreakdown } = req.body;
      const result = await MeterService.recordUsage(
        tenantId,
        usageType,
        quantity,
        idempotencyKey,
        tokenBreakdown
      );

      // Return 200 for duplicate/cached idempotency response, 201 for fresh creation
      const statusCode = result.duplicate ? 200 : 201;
      return res.status(statusCode).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getUsage(req: Request, res: Response, next: NextFunction) {
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

      const rollup = await MeterService.getUsageRollup(tenantId);
      return res.status(200).json(rollup);
    } catch (err) {
      next(err);
    }
  }
}
