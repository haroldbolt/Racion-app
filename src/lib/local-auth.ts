import crypto from 'crypto';
import firebaseConfig from '../../firebase-applet-config.json';

const TOKEN_PREFIX = 'racion.';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSigningSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.SQL_PASSWORD ||
    `${firebaseConfig.projectId}:${firebaseConfig.apiKey}:racion_session_v1`
  );
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;

  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;

  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export interface AppSessionPayload {
  uid: string;
  email: string;
  name?: string;
  displayName?: string;
  phone?: string | null;
  authProvider: 'email' | 'phone';
  iat: number;
  exp: number;
}

export function signAppSessionToken(user: {
  uid: string;
  email: string;
  displayName?: string | null;
  phone?: string | null;
  authProvider: 'email' | 'phone';
}): string {
  const now = Date.now();
  const payload: AppSessionPayload = {
    uid: user.uid,
    email: user.email,
    name: user.displayName || undefined,
    displayName: user.displayName || undefined,
    phone: user.phone || null,
    authProvider: user.authProvider,
    iat: now,
    exp: now + TOKEN_TTL_MS,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encodedPayload)
    .digest('base64url');

  return `${TOKEN_PREFIX}${encodedPayload}.${signature}`;
}

export function verifyAppSessionToken(token: string): AppSessionPayload | null {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const raw = token.slice(TOKEN_PREFIX.length);
  const dotIdx = raw.indexOf('.');
  if (dotIdx <= 0) return null;

  const encodedPayload = raw.slice(0, dotIdx);
  const signature = raw.slice(dotIdx + 1);
  if (!encodedPayload || !signature) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encodedPayload)
    .digest('base64url');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as AppSessionPayload;
    if (!parsed?.uid || !parsed?.exp || parsed.exp <= Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isAppSessionToken(token: string): boolean {
  return token.startsWith(TOKEN_PREFIX);
}
