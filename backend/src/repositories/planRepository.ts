import { query } from '../config/database';
import { Plan, PlanName } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class PlanRepository {
  static async findByName(name: PlanName): Promise<Plan | null> {
    const res = await query('SELECT * FROM plans WHERE name = $1', [name]);
    return res.rows[0] || null;
  }

  static async findById(id: string): Promise<Plan | null> {
    const res = await query('SELECT * FROM plans WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  static async listAll(): Promise<Plan[]> {
    const res = await query('SELECT * FROM plans ORDER BY price ASC');
    return res.rows;
  }

  static async createOrUpdate(name: PlanName, apiCallLimit: number, aiTokenLimit: number, price: number): Promise<Plan> {
    const existing = await this.findByName(name);
    if (existing) {
      await query(
        `UPDATE plans SET api_call_limit = $1, ai_token_limit = $2, price = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
        [apiCallLimit, aiTokenLimit, price, existing.id]
      );
      return (await this.findByName(name))!;
    } else {
      const planId = uuidv4();
      await query(
        `INSERT INTO plans (id, name, api_call_limit, ai_token_limit, price, currency) VALUES ($1, $2, $3, $4, $5, 'INR')`,
        [planId, name, apiCallLimit, aiTokenLimit, price]
      );
      return (await this.findByName(name))!;
    }
  }
}
