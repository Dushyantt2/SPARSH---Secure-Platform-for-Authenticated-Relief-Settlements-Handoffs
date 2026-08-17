import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type TokenPayload } from '../layers/layer0-access/auth.js';
import { findUserById } from '../layers/layer0-access/auth.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: TokenPayload;
  }
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  req.user = payload;
  next();
}

export function roleRequired(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient role privileges' });
      return;
    }
    next();
  };
}

export async function ensureEnabled(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return next();
  const user = await findUserById(req.user.uid);
  if (!user || !user.enabled) {
    res.status(403).json({ error: 'Account disabled' });
    return;
  }
  next();
}
