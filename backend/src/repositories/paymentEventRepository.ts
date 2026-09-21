import { query } from '../config/database';
import { PaymentEvent } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class PaymentEventRepository {
  static async findByProviderEventId(provider: string, providerEventId: string): Promise<PaymentEvent | null> {
    const res = await query(
      `SELECT * FROM payment_events WHERE provider = $1 AND provider_event_id = $2`,
      [provider, providerEventId]
    );
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    if (typeof row.payload === 'string') {
      try {
        row.payload = JSON.parse(row.payload);
      } catch (e) {}
    }
    return row;
  }

  static async recordEvent(
    provider: string,
    providerEventId: string,
    eventType: string,
    payload: Record<string, any>
  ): Promise<{ event: PaymentEvent; duplicate: boolean }> {
    const existing = await this.findByProviderEventId(provider, providerEventId);
    if (existing) {
      return { event: existing, duplicate: true };
    }

    try {
      const eventId = uuidv4();
      await query(
        `INSERT INTO payment_events (id, provider, provider_event_id, event_type, payload)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (provider, provider_event_id) DO NOTHING`,
        [eventId, provider, providerEventId, eventType, JSON.stringify(payload)]
      );

      const recorded = await this.findByProviderEventId(provider, providerEventId);
      if (!recorded) {
        throw new Error('Failed to retrieve recorded payment event');
      }

      const isDuplicate = recorded.id !== eventId;
      return { event: recorded, duplicate: isDuplicate };
    } catch (err: any) {
      if (err.code === '23505' || err.message?.includes('UNIQUE')) {
        const duplicateEvent = await this.findByProviderEventId(provider, providerEventId);
        if (duplicateEvent) {
          return { event: duplicateEvent, duplicate: true };
        }
      }
      throw err;
    }
  }
}
