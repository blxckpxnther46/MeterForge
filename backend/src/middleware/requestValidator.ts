import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

const generateSchema = z.object({
  tenantId: z.string().uuid({ message: 'tenantId must be a valid UUID' }),
  usageType: z.enum(['api_call', 'ai_tokens'], {
    errorMap: () => ({ message: "usageType must be either 'api_call' or 'ai_tokens'" }),
  }),
  quantity: z.number().int().positive({ message: 'quantity must be a positive integer' }),
  tokenBreakdown: z
    .object({
      inputTokens: z.number().int().nonnegative().optional(),
      cachedInputTokens: z.number().int().nonnegative().optional(),
      outputTokens: z.number().int().nonnegative().optional(),
      reasoningTokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export function validateGenerateBody(req: Request, res: Response, next: NextFunction) {
  const result = generateSchema.safeParse(req.body);
  if (!result.success) {
    const issue = result.error.issues[0];
    return res.status(400).json({
      error: {
        code: 'INVALID_INPUT',
        message: issue.message,
        details: result.error.format(),
      },
    });
  }

  // Ensure Idempotency-Key header or body field is present
  const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
    return res.status(400).json({
      error: {
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Header Idempotency-Key is required for billable requests.',
      },
    });
  }

  req.body.idempotencyKey = idempotencyKey;
  next();
}
