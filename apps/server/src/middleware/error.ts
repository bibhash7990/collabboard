import type { NextFunction, Request, Response } from 'express';
import { MongoServerError } from 'mongodb';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import type { ApiError as ApiErrorBody } from '@collabboard/shared';

export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound('Route not found', 'ROUTE_NOT_FOUND'));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let apiError: ApiError;

  if (err instanceof ApiError) {
    apiError = err;
  } else if (err instanceof ZodError) {
    apiError = new ApiError(
      400,
      'VALIDATION_ERROR',
      'Request validation failed',
      err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
    );
  } else if (err instanceof MongoServerError && err.code === 11000) {
    apiError = ApiError.conflict('Resource already exists', 'DUPLICATE_KEY');
  } else {
    logger.error({ err }, 'Unhandled error');
    apiError = ApiError.internal();
  }

  const body: ApiErrorBody = {
    error: { code: apiError.code, message: apiError.message, details: apiError.details },
  };
  res.status(apiError.status).json(body);
}
