import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { getPublicBoard } from './public.controller';

/**
 * Unauthenticated share surface, mounted at /api/public by the routes barrel.
 * Deliberately no requireAuth: access is gated solely by possession of the
 * unguessable share token, re-checked (hash + revoked + expiry) per request.
 */
export const publicRouter = Router();

publicRouter.get(
  '/boards/:token',
  asyncHandler(async (req, res) => {
    res.json(await getPublicBoard(req));
  }),
);
