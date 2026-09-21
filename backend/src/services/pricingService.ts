import {
  TOKEN_RATES_MICRO_PAISE_PER_1K,
  MICRO_PAISE_PER_PAISE,
  PAISE_PER_INR,
  API_CALL_UNIT_PRICE_PAISE,
} from '../config/pricing';
import { TokenBreakdown } from '../types';

export class PricingService {
  /**
   * Calculates the AI token usage cost in micro-paise using exact integer arithmetic.
   * Cached input tokens are discounted.
   * Reasoning tokens are counted as output tokens.
   */
  static calculateAiTokenCostMicroPaise(breakdown: TokenBreakdown): number {
    const input = Math.max(0, breakdown.inputTokens || 0);
    const cachedInput = Math.max(0, breakdown.cachedInputTokens || 0);
    const output = Math.max(0, breakdown.outputTokens || 0);
    const reasoning = Math.max(0, breakdown.reasoningTokens || 0);

    // Sum reasoning into output per Capstone rules
    const effectiveOutput = output + reasoning;

    // Integer calculation of total micro-paise
    const inputMicroPaise = Math.floor((input * TOKEN_RATES_MICRO_PAISE_PER_1K.inputTokens) / 1000);
    const cachedMicroPaise = Math.floor((cachedInput * TOKEN_RATES_MICRO_PAISE_PER_1K.cachedInputTokens) / 1000);
    const outputMicroPaise = Math.floor((effectiveOutput * TOKEN_RATES_MICRO_PAISE_PER_1K.outputTokens) / 1000);

    return inputMicroPaise + cachedMicroPaise + outputMicroPaise;
  }

  /**
   * Converts micro-paise to integer paise.
   */
  static microPaiseToPaise(microPaise: number): number {
    return Math.floor(microPaise / MICRO_PAISE_PER_PAISE);
  }

  /**
   * Calculates API call cost in paise.
   */
  static calculateApiCallCostPaise(quantity: number): number {
    return Math.max(0, quantity) * API_CALL_UNIT_PRICE_PAISE;
  }

  /**
   * Formats paise integer as INR string (e.g. 49900 -> "₹499.00").
   */
  static formatPaiseToINR(paise: number): string {
    const rupees = (paise / PAISE_PER_INR).toFixed(2);
    return `₹${rupees}`;
  }
}
