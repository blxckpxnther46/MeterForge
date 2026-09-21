import { Pool } from 'pg';
import { config } from './env';

export interface QueryResult {
  rows: any[];
  rowCount: number;
}

let pgPool: Pool | null = null;
let useMemStore = process.env.USE_SQLITE === 'true';

const memDb: Record<string, any[]> = {
  tenants: [],
  plans: [],
  subscriptions: [],
  usage_events: [],
  payment_events: [],
};

export async function query(text: string, params: any[] = []): Promise<QueryResult> {
  if (!useMemStore) {
    if (!pgPool) {
      try {
        const isNeonOrSsl =
          config.databaseUrl.includes('neon.tech') ||
          config.databaseUrl.includes('sslmode=require') ||
          config.databaseUrl.includes('ssl=true');

        pgPool = new Pool({
          connectionString: config.databaseUrl,
          ssl: isNeonOrSsl ? { rejectUnauthorized: false } : undefined,
          max: 10,
          idleTimeoutMillis: 10000,
          connectionTimeoutMillis: 5000,
        });
      } catch (e) {
        useMemStore = true;
      }
    }

    if (pgPool) {
      try {
        const res = await pgPool.query(text, params);
        return { rows: res.rows, rowCount: res.rowCount || res.rows.length };
      } catch (err: any) {
        console.warn('[Database] PostgreSQL query error:', err.message);
        // Only switch to memory fallback if connection completely failed
        if (
          err.code === '28P01' ||
          err.code === 'ECONNREFUSED' ||
          err.code === 'ENOTFOUND' ||
          err.message?.includes('password authentication failed')
        ) {
          useMemStore = true;
          if (pgPool) {
            pgPool.end().catch(() => {});
            pgPool = null;
          }
        } else {
          throw err;
        }
      }
    }
  }

  // Pure JS In-Memory execution fallback
  const trimmed = text.trim();
  const upper = trimmed.toUpperCase();

  if (upper.startsWith('BEGIN') || upper.startsWith('COMMIT') || upper.startsWith('ROLLBACK') || upper.startsWith('CREATE')) {
    return { rows: [], rowCount: 0 };
  }

  if (upper.startsWith('INSERT INTO')) {
    const tableMatch = trimmed.match(/INSERT INTO\s+([a-z_]+)/i);
    const tableName = tableMatch ? tableMatch[1].toLowerCase() : null;

    if (tableName && memDb[tableName]) {
      const table = memDb[tableName];
      const obj: any = {};

      if (tableName === 'tenants') {
        obj.id = params[0];
        obj.name = params[1];
        obj.created_at = new Date();
        obj.updated_at = new Date();
      } else if (tableName === 'plans') {
        obj.id = params[0];
        obj.name = params[1];
        obj.api_call_limit = params[2];
        obj.ai_token_limit = params[3];
        obj.price = params[4];
        obj.currency = params[5] || 'INR';
        obj.created_at = new Date();
        obj.updated_at = new Date();
      } else if (tableName === 'subscriptions') {
        obj.id = params[0];
        obj.tenant_id = params[1];
        obj.plan_id = params[2];
        obj.provider = 'razorpay';
        obj.provider_subscription_id = params[3] || null;
        obj.provider_customer_id = params[4] || null;
        obj.status = params[5] || 'active';
        obj.current_period_start = new Date();
        obj.current_period_end = new Date(Date.now() + 30 * 86400000);
        obj.created_at = new Date();
        obj.updated_at = new Date();
      } else if (tableName === 'usage_events') {
        obj.id = params[0];
        obj.tenant_id = params[1];
        obj.usage_type = params[2];
        obj.quantity = params[3];
        obj.idempotency_key = params[4];
        obj.metadata = typeof params[5] === 'string' ? JSON.parse(params[5]) : params[5];
        obj.created_at = new Date();

        const dup = table.find((r) => r.tenant_id === obj.tenant_id && r.idempotency_key === obj.idempotency_key);
        if (dup && upper.includes('ON CONFLICT')) {
          return { rows: [], rowCount: 0 };
        }
      } else if (tableName === 'payment_events') {
        obj.id = params[0];
        obj.provider = params[1];
        obj.provider_event_id = params[2];
        obj.event_type = params[3];
        obj.payload = typeof params[4] === 'string' ? JSON.parse(params[4]) : params[4];
        obj.processed_at = new Date();

        const dup = table.find((r) => r.provider === obj.provider && r.provider_event_id === obj.provider_event_id);
        if (dup && upper.includes('ON CONFLICT')) {
          return { rows: [], rowCount: 0 };
        }
      }

      table.push(obj);
      return { rows: [obj], rowCount: 1 };
    }
  }

  if (upper.startsWith('UPDATE')) {
    const tableMatch = trimmed.match(/UPDATE\s+([a-z_]+)/i);
    const tableName = tableMatch ? tableMatch[1].toLowerCase() : null;

    if (tableName && memDb[tableName]) {
      const table = memDb[tableName];
      if (tableName === 'plans') {
        const plan = table.find((p) => p.id === params[3] || p.name === params[0]);
        if (plan) {
          plan.api_call_limit = params[0];
          plan.ai_token_limit = params[1];
          plan.price = params[2];
          plan.updated_at = new Date();
          return { rows: [plan], rowCount: 1 };
        }
      } else if (tableName === 'subscriptions') {
        let sub = table.find((s) => s.id === params[4] || s.id === params[1] || s.tenant_id === params[0]);
        if (sub) {
          if (params.length >= 5) {
            sub.plan_id = params[0];
            if (params[1]) sub.provider_subscription_id = params[1];
            if (params[2]) sub.provider_customer_id = params[2];
            sub.status = params[3];
          } else {
            sub.status = params[0];
          }
          sub.updated_at = new Date();
          return { rows: [sub], rowCount: 1 };
        }
      }
    }
    return { rows: [], rowCount: 0 };
  }

  if (upper.startsWith('SELECT')) {
    const tableMatch = trimmed.match(/FROM\s+([a-z_]+)/i);
    const tableName = tableMatch ? tableMatch[1].toLowerCase() : null;

    if (tableName && memDb[tableName]) {
      let rows = [...memDb[tableName]];

      if (params.length > 0) {
        if (trimmed.includes('WHERE tenant_id = $1 AND idempotency_key = $2')) {
          rows = rows.filter((r) => r.tenant_id === params[0] && r.idempotency_key === params[1]);
        } else if (trimmed.includes('WHERE provider = $1 AND provider_event_id = $2')) {
          rows = rows.filter((r) => r.provider === params[0] && r.provider_event_id === params[1]);
        } else if (trimmed.includes('WHERE tenant_id = $1')) {
          rows = rows.filter((r) => r.tenant_id === params[0]);
        } else if (trimmed.includes('WHERE id = $1')) {
          rows = rows.filter((r) => r.id === params[0]);
        } else if (trimmed.includes('WHERE name = $1')) {
          rows = rows.filter((r) => r.name === params[0]);
        }
      }

      if (upper.includes('SUM(QUANTITY)')) {
        const apiCallsUsed = rows.filter((r) => r.usage_type === 'api_call').reduce((acc, r) => acc + (r.quantity || 0), 0);
        const aiTokensUsed = rows.filter((r) => r.usage_type === 'ai_tokens').reduce((acc, r) => acc + (r.quantity || 0), 0);
        return {
          rows: [
            { usage_type: 'api_call', total_quantity: apiCallsUsed },
            { usage_type: 'ai_tokens', total_quantity: aiTokensUsed },
          ],
          rowCount: 2,
        };
      }

      if (upper.includes('ORDER BY PRICE ASC')) {
        rows.sort((a, b) => (a.price || 0) - (b.price || 0));
      } else if (upper.includes('ORDER BY CREATED_AT DESC')) {
        rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      }

      if (upper.includes('LIMIT 1')) {
        rows = rows.slice(0, 1);
      }

      return { rows, rowCount: rows.length };
    }
  }

  return { rows: [], rowCount: 0 };
}

export const pool = {
  connect: async () => ({
    query,
    release: () => {},
  }),
  end: async () => {
    if (pgPool) {
      await pgPool.end().catch(() => {});
      pgPool = null;
    }
  },
};
