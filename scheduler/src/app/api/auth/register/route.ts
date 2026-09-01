import { NextResponse } from 'next/server';
import { createUser } from '@/lib/auth/users-store';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, nome, email, password } = body;

    if (!username || !nome || !password) {
      return NextResponse.json(
        { ok: false, error: 'Username, Nome e Password sono obbligatori.' },
        { status: 400 }
      );
    }

    if (password.length < 4) {
      return NextResponse.json(
        { ok: false, error: 'La password deve contenere almeno 4 caratteri.' },
        { status: 400 }
      );
    }

    const newUser = await createUser({
      username: username.trim(),
      nome: nome.trim(),
      email: email?.trim() || undefined,
      password,
      role: 'user',
      status: 'pending', // In attesa di approvazione dall'admin
      assignedCalendarIds: [],
    });

    return NextResponse.json({
      ok: true,
      user: newUser,
      message: 'Registrazione effettuata con successo! Il tuo account è ora in attesa di approvazione da parte dell\'amministratore.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Errore durante la registrazione.' },
      { status: 400 }
    );
  }
}
