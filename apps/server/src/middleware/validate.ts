import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ApiError } from '../utils/ApiError';

type Source = 'body' | 'query' | 'params';

/**
 * Validates and *replaces* the given request segment with the parsed result
 * (so coercions like string→number in query params take effect downstream).
 */
export function validate(schema: ZodTypeAny, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[source]);
      // req.query/params are read-only getters in Express 5-ish setups; assign safely.
      Object.defineProperty(req, source, { value: parsed, configurable: true, writable: true });
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }));
        next(new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed', details));
      } else {
        next(err);
      }
    }
  };
}
