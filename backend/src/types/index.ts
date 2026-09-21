export type UsageType = 'api_call' | 'ai_tokens';
export type PlanName = 'Free' | 'Pro';
export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'created';

export interface Tenant {
  id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export interface Plan {
  id: string;
  name: PlanName;
  api_call_limit: number;
  ai_token_limit: number;
  price: number; // in paise
  currency: string;
  created_at: Date;
  updated_at: Date;
}

export interface Subscription {
  id: string;
  tenant_id: string;
  plan_id: string;
  provider: string;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  status: SubscriptionStatus;
  current_period_start: Date;
  current_period_end: Date;
  created_at: Date;
  updated_at: Date;
}

export interface TokenBreakdown {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
}

export interface UsageEvent {
  id: string;
  tenant_id: string;
  usage_type: UsageType;
  quantity: number;
  idempotency_key: string;
  metadata?: TokenBreakdown;
  created_at: Date;
}

export interface PaymentEvent {
  id: string;
  provider: string;
  provider_event_id: string;
  event_type: string;
  processed_at: Date;
  payload: Record<string, any>;
}

export interface GenerateUsageRequest {
  tenantId: string;
  usageType: UsageType;
  quantity: number;
  tokenBreakdown?: TokenBreakdown;
}

export interface GenerateUsageResponse {
  success: boolean;
  duplicate: boolean;
  event: UsageEvent;
  costEstimatePaise: number;
}

export interface UsageRollupResponse {
  tenantId: string;
  period: string; // e.g. "2026-09"
  apiCalls: {
    used: number;
    limit: number;
  };
  aiTokens: {
    used: number;
    limit: number;
  };
  cost: {
    amount: number; // in paise
    formattedINR: string; // e.g. "₹499.00"
    currency: string;
  };
  plan: PlanName;
  subscriptionStatus: SubscriptionStatus;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}
