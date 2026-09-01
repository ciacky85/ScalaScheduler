import crypto from 'crypto';
import { cookies } from 'next/headers';
import type { UserProfile, UserSession } from '@/lib/types';
import { getUserById, toUserProfile } from './users-store';

const SESSION_COOKIE_NAME = 'scala_scheduler_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'scala-scheduler-secret-key-2026-auth-session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 giorni

/**
 * Crea una stringa di token firmata HMAC-SHA256 contenente i dati di sessione.
 */
export function signSessionToken(session: UserSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

/**
 * Verifica e decodifica un token di sessione. Ritorna null se invalido o scaduto.
 */
export function verifySessionToken(token: string): UserSession | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;

    const expectedSignature = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(payload)
      .digest('base64url');

    if (signature !== expectedSignature) return null;

    const session: UserSession = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (Date.now() > session.expiresAt) return null;

    return session;
  } catch {
    return null;
  }
}

/**
 * Salva la sessione nei cookie HTTP.
 */
export async function setSessionCookie(user: UserProfile): Promise<void> {
  const cookieStore = await cookies();
  const session: UserSession = {
    userId: user.id,
    username: user.username,
    nome: user.nome,
    role: user.role,
    assignedCalendarIds: user.assignedCalendarIds || [],
    expiresAt: Date.now() + SESSION_DURATION_MS,
  };

  const token = signSessionToken(session);

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
  });
}

/**
 * Cancella il cookie di sessione.
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Recupera l'utente attualmente loggato a partire dal cookie di sessione.
 */
export async function getCurrentUser(): Promise<UserProfile | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const session = verifySessionToken(token);
    if (!session) return null;

    const user = await getUserById(session.userId);
    if (!user || user.status !== 'approved') {
      return null;
    }

    return toUserProfile(user);
  } catch {
    return null;
  }
}
