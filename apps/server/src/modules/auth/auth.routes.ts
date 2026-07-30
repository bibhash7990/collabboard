import { Router } from 'express';
import { schemas } from '@collabboard/shared';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/requireAuth';
import { authLimiter } from '../../middleware/rateLimit';
import {
  login,
  logout,
  me,
  refresh,
  register,
  resendVerification,
  verifyEmail,
} from './auth.controller';

export const authRouter = Router();

// Credential + token endpoints are the brute-force surface, so they sit behind
// the tighter authLimiter; the token itself is validated inside the handlers.
authRouter.post('/register', authLimiter, validate(schemas.registerSchema), register);
authRouter.post('/login', authLimiter, validate(schemas.loginSchema), login);
authRouter.post('/refresh', authLimiter, refresh);
authRouter.post('/logout', logout);

authRouter.post('/verify-email', validate(schemas.verifyEmailSchema), verifyEmail);

// Identity + re-send require a valid access token (the user proving who they are).
authRouter.get('/me', requireAuth, me);
authRouter.post('/resend-verification', requireAuth, resendVerification);
