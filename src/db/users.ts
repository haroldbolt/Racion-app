import crypto from 'crypto';
import { db } from './index.ts';
import { users } from './schema.ts';
import { eq, sql } from 'drizzle-orm';
import { normalizeEmail, normalizePhone } from '../lib/local-auth.ts';

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string,
  authProvider = 'google'
) {
  try {
    const existing = await getUserByUid(uid);
    if (existing) {
      const result = await db
        .update(users)
        .set({
          email,
          displayName: displayName || existing.displayName || null,
        })
        .where(eq(users.uid, uid))
        .returning();
      return result[0];
    }

    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName || null,
        authProvider,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: displayName || null,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

export async function getUserByUid(uid: string) {
  try {
    const result = await db.select().from(users).where(eq(users.uid, uid));
    return result[0] || null;
  } catch (error) {
    console.error('Database query failed in getUserByUid:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

export async function findUserByEmail(email: string) {
  try {
    const normalized = normalizeEmail(email);
    const result = await db
      .select()
      .from(users)
      .where(sql`lower(trim(${users.email})) = ${normalized}`);
    return result[0] || null;
  } catch (error) {
    console.error('Database query failed in findUserByEmail:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

export async function findUserByPhone(phone: string) {
  try {
    const digits = normalizePhone(phone);
    if (!digits) return null;
    const result = await db
      .select()
      .from(users)
      .where(eq(users.phone, digits));
    return result[0] || null;
  } catch (error) {
    console.error('Database query failed in findUserByPhone:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

export async function createCredentialUser(params: {
  email: string;
  phone?: string | null;
  displayName?: string | null;
  passwordHash: string;
  authProvider: 'email' | 'phone';
}) {
  try {
    const uid = `usr_${crypto.randomUUID()}`;
    const result = await db
      .insert(users)
      .values({
        uid,
        email: params.email,
        phone: params.phone || null,
        displayName: params.displayName || null,
        passwordHash: params.passwordHash,
        authProvider: params.authProvider,
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in createCredentialUser:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}
