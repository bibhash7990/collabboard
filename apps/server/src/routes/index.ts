import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { workspacesRouter } from '../modules/workspaces/workspaces.routes';
import { invitationsRouter } from '../modules/invitations/invitations.routes';
import { boardsRouter } from '../modules/boards/boards.routes';
import { publicRouter } from '../modules/public/public.routes';

/** Composes every feature router under /api. */
export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/workspaces', workspacesRouter);
apiRouter.use('/invitations', invitationsRouter);
apiRouter.use('/boards', boardsRouter);
apiRouter.use('/public', publicRouter);
