import 'express';

declare global {
  namespace Express {
    interface Request {
      /** Populated by `requireAuth`/`optionalAuth`. */
      user?: { id: string; email: string; name: string };
    }
  }
}

export {};
