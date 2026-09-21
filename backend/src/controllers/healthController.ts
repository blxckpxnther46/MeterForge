import { Request, Response } from 'express';
import { query } from '../config/database';

export class HealthController {
  static async check(_req: Request, res: Response) {
    try {
      await query('SELECT 1');
      return res.status(200).json({
        status: 'ok',
        service: 'MeterForge Engine',
        timestamp: new Date().toISOString(),
        database: 'connected',
        paymentProvider: 'Razorpay Test Mode',
      });
    } catch (err: any) {
      return res.status(503).json({
        status: 'error',
        message: 'Database connection failed',
      });
    }
  }
}
