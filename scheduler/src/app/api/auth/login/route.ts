import { NextResponse } from 'next/server';
import { getUserByUsername, verifyPassword, toUserProfile, updateUser } from '@/lib/auth/users-store';
import { setSessionCookie } from '@/lib/auth/session';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { ok: false, error: 'Username e password sono obbligatori.' },
        { status: 400 }
      );
    }

    const user = await getUserByUsername(username);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Credenziali non valide.' },
        { status: 401 }
      );
    }

    const isValid = verifyPassword(password, user.passwordHash, user.salt);
    if (!isValid) {
      return NextResponse.json(
        { ok: false, error: 'Credenziali non valide.' },
        { status: 401 }
      );
    }

    if (user.status === 'pending') {
      return NextResponse.json(
        {
          ok: false,
          status: 'pending',
          error: 'Il tuo account è in attesa di approvazione da parte dell\'amministratore.',
        },
        { status: 403 }
      );
    }

    if (user.status === 'rejected' || user.status === 'disabled') {
      return NextResponse.json(
        {
          ok: false,
          status: user.status,
          error: 'Questo account è stato disabilitato o non è autorizzato ad accedere.',
        },
        { status: 403 }
      );
    }

    // Aggiorna ultimo login
    await updateUser(user.id, { lastLoginAt: new Date().toISOString() });

    const profile = toUserProfile(user);
    await setSessionCookie(profile);

    return NextResponse.json({
      ok: true,
      user: profile,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Errore durante il login.' },
      { status: 500 }
    );
  }
}
