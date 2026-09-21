import { query } from '../config/database';
import { Tenant } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class TenantRepository {
  static async findById(id: string): Promise<Tenant | null> {
    const res = await query('SELECT * FROM tenants WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  static async create(name: string, id?: string): Promise<Tenant> {
    const tenantId = id || uuidv4();
    const res = await query(
      'INSERT INTO tenants (id, name) VALUES ($1, $2) RETURNING *',
      [tenantId, name]
    );
    if (res.rows.length > 0) return res.rows[0];
    return (await this.findById(tenantId))!;
  }

  static async listAll(): Promise<Tenant[]> {
    const res = await query('SELECT * FROM tenants ORDER BY created_at ASC');
    return res.rows;
  }
}
