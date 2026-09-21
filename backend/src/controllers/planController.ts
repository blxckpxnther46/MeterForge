import { Request, Response, NextFunction } from 'express';
import { PlanRepository } from '../repositories/planRepository';

export class PlanController {
  static async listPlans(_req: Request, res: Response, next: NextFunction) {
    try {
      const plans = await PlanRepository.listAll();
      return res.status(200).json({ plans });
    } catch (err) {
      next(err);
    }
  }
}
