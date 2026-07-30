import { Router } from 'express';
import { schemas } from '@collabboard/shared';
import { requireAuth } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';
import * as workspaces from './workspaces.controller';

/** All workspace routes require a signed-in caller; per-route role checks live in the controller. */
export const workspacesRouter = Router();
workspacesRouter.use(requireAuth);

workspacesRouter.get('/', workspaces.list);
workspacesRouter.post('/', validate(schemas.createWorkspaceSchema), workspaces.create);

workspacesRouter.get('/:id', workspaces.get);
workspacesRouter.patch('/:id', validate(schemas.updateWorkspaceSchema), workspaces.update);
workspacesRouter.delete('/:id', workspaces.remove);

workspacesRouter.get('/:id/members', workspaces.members);
workspacesRouter.patch(
  '/:id/members',
  validate(schemas.updateMemberRoleSchema),
  workspaces.updateMemberRole,
);
workspacesRouter.delete('/:id/members/:userId', workspaces.removeMember);

workspacesRouter.post('/:id/invitations', validate(schemas.inviteSchema), workspaces.invite);
