/**
 * Centralized Pricing Configuration
 * CRITICAL: All money values are integers stored in paise (1 INR = 100 paise).
 * Micro-paise math is used for sub-paise token rate calculations to prevent floating point drift.
 * 1 paise = 10,000 micro-paise.
 */

export const CURRENCY = 'INR';
export const PAISE_PER_INR = 100;
export const MICRO_PAISE_PER_PAISE = 10000;

export interface TokenRatesMicroPaisePer1k {
  inputTokens: number;        // e.g. 15,000 micro-paise per 1,000 tokens (15 paise / 1k)
  cachedInputTokens: number;  // e.g. 3,750 micro-paise per 1,000 tokens (3.75 paise / 1k)
  outputTokens: number;       // e.g. 60,000 micro-paise per 1,000 tokens (60 paise / 1k)
  reasoningTokens: number;    // Counted as output tokens (60,000 micro-paise per 1,000 tokens)
}

export const TOKEN_RATES_MICRO_PAISE_PER_1K: TokenRatesMicroPaisePer1k = {
  inputTokens: 15000,        // ₹0.15 / 1,000 tokens = 15 paise
  cachedInputTokens: 3750,   // ₹0.0375 / 1,000 tokens = 3.75 paise (75% discount)
  outputTokens: 60000,       // ₹0.60 / 1,000 tokens = 60 paise
  reasoningTokens: 60000,    // Billed as output tokens per FlyRank capstone rules
};

// API Call usage price in paise (e.g. 10 paise per extra call if calculated individually, or 0 in plan limits)
export const API_CALL_UNIT_PRICE_PAISE = 10;
