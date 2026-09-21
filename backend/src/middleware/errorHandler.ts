import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const statusCode = err.statusCode || 500;
  const code = err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');
  const message = err.message || 'An unexpected error occurred';

  if (statusCode >= 500) {
    console.error('[UnhandledError]', err);
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
    },
  });
}
