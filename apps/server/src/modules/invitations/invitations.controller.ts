import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { acceptInvitation, previewInvitation } from './invitations.service';

/** GET /invitations/:token — public preview (optionalAuth) of a pending invitation. */
export const preview = asyncHandler(async (req, res) => {
  const invitation = await previewInvitation(req.params.token);
  res.json({ invitation });
});

/** POST /invitations/accept — redeem the token for the authenticated caller. */
export const accept = asyncHandler(async (req, res) => {
  // requireAuth guarantees req.user, but narrow it for the type checker.
  if (!req.user) throw ApiError.unauthorized();
  const { token } = req.body as { token: string };
  const result = await acceptInvitation(req.user.email, req.user.id, token);
  res.json(result);
});
