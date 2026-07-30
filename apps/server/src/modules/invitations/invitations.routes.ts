import { Router } from 'express';
import { schemas } from '@collabboard/shared';
import { optionalAuth, requireAuth } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';
import * as invitations from './invitations.controller';

export const invitationsRouter = Router();

// Preview is reachable while signed out (the landing page shows it before login).
invitationsRouter.get('/:token', optionalAuth, invitations.preview);
invitationsRouter.post(
  '/accept',
  requireAuth,
  validate(schemas.acceptInvitationSchema),
  invitations.accept,
);
