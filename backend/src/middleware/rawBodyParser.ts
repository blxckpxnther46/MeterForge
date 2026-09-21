import express, { Request, Response, NextFunction } from 'express';

export interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

export const rawBodyMiddleware = express.json({
  verify: (req: RequestWithRawBody, _res: Response, buf: Buffer) => {
    req.rawBody = buf;
  },
});
