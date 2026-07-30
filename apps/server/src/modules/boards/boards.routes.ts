import { Router } from 'express';
import { schemas } from '@collabboard/shared';
import { requireAuth } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';
import * as boards from './boards.controller';
import * as members from './members.controller';
import * as snapshots from './snapshots.controller';
import * as share from './share.controller';
import { exportPdf } from './export.controller';
import { actionItems } from './ai.controller';

/**
 * All board endpoints require authentication; each `:id` handler re-authorizes the
 * caller's board role through `services/access` before doing any work. Validation is
 * declared here so controllers can trust their inputs.
 */
export const boardsRouter = Router();
boardsRouter.use(requireAuth);

// Boards CRUD + list
boardsRouter.get('/', validate(schemas.listBoardsSchema, 'query'), boards.list);
boardsRouter.post('/', validate(schemas.createBoardSchema), boards.create);
boardsRouter.get('/:id', boards.get);
boardsRouter.patch('/:id', validate(schemas.updateBoardSchema), boards.update);
boardsRouter.delete('/:id', boards.remove);

// Star + members
boardsRouter.post('/:id/star', validate(schemas.starBoardSchema), members.star);
boardsRouter.get('/:id/members', members.listMembers);
boardsRouter.post('/:id/invitations', validate(schemas.inviteSchema), members.invite);
boardsRouter.patch(
  '/:id/members',
  validate(schemas.updateMemberRoleSchema),
  members.updateMemberRole,
);
boardsRouter.delete('/:id/members/:userId', members.removeMember);

// Version history
boardsRouter.get('/:id/snapshots', snapshots.listSnapshots);
boardsRouter.post(
  '/:id/snapshots',
  validate(schemas.createSnapshotSchema),
  snapshots.createSnapshot,
);
boardsRouter.post(
  '/:id/snapshots/restore',
  validate(schemas.restoreSnapshotSchema),
  snapshots.restoreSnapshot,
);

// AI + export
boardsRouter.post('/:id/ai/action-items', validate(schemas.generateActionItemsSchema), actionItems);
boardsRouter.post('/:id/export/pdf', exportPdf);

// Share links
boardsRouter.get('/:id/share', share.listLinks);
boardsRouter.post('/:id/share', validate(schemas.createShareLinkSchema), share.createLink);
boardsRouter.delete('/:id/share/:linkId', share.revokeLink);
