import { PricingService } from '../../src/services/pricingService';

describe('PricingService - Integer Money Math', () => {
  it('calculates AI token cost correctly with cached input and reasoning tokens', () => {
    // Input: 1000 input tokens, 500 cached input tokens, 300 output tokens, 100 reasoning tokens
    // Rates:
    // input = 1000 * 15 = 15000 micro-paise
    // cachedInput = 500 * 3.75 = 1875 micro-paise
    // output + reasoning = (300 + 100) * 60 = 24000 micro-paise
    // Total micro-paise = 15000 + 1875 + 24000 = 40875 micro-paise
    // Total paise = Math.floor(40875 / 10000) = 4 paise
    const breakdown = {
      inputTokens: 1000,
      cachedInputTokens: 500,
      outputTokens: 300,
      reasoningTokens: 100,
    };

    const microPaise = PricingService.calculateAiTokenCostMicroPaise(breakdown);
    expect(microPaise).toBe(40875);

    const paise = PricingService.microPaiseToPaise(microPaise);
    expect(paise).toBe(4);
  });

  it('treats reasoning tokens strictly as output tokens', () => {
    const onlyOutput = PricingService.calculateAiTokenCostMicroPaise({ outputTokens: 1000 });
    const onlyReasoning = PricingService.calculateAiTokenCostMicroPaise({ reasoningTokens: 1000 });

    expect(onlyReasoning).toEqual(onlyOutput);
  });

  it('calculates cached input tokens at a lower rate than standard input tokens', () => {
    const standardInput = PricingService.calculateAiTokenCostMicroPaise({ inputTokens: 1000 });
    const cachedInput = PricingService.calculateAiTokenCostMicroPaise({ cachedInputTokens: 1000 });

    expect(cachedInput).toBeLessThan(standardInput);
    expect(cachedInput * 4).toEqual(standardInput); // 75% discount (3.75 paise vs 15 paise)
  });

  it('formats paise integer to INR string correctly', () => {
    expect(PricingService.formatPaiseToINR(49900)).toBe('₹499.00');
    expect(PricingService.formatPaiseToINR(0)).toBe('₹0.00');
    expect(PricingService.formatPaiseToINR(1050)).toBe('₹10.50');
  });
});
