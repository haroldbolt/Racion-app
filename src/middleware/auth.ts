import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';
import { isAppSessionToken, verifyAppSessionToken } from '../lib/local-auth.ts';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  name?: string;
  displayName?: string;
  phone?: string | null;
  authProvider?: string;
}

export interface AuthRequest extends Request {
  user?: DecodedIdToken | AuthenticatedUser;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];

  // Support Cloud SQL session tokens (email/phone accounts) alongside Firebase Google ID tokens
  if (isAppSessionToken(token)) {
    const sessionUser = verifyAppSessionToken(token);
    if (!sessionUser) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
    }
    req.user = sessionUser;
    return next();
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
