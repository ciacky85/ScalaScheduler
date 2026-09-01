import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getAllUsers, createUser, toUserProfile } from '@/lib/auth/users-store';

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Accesso negato. Richiesto ruolo Amministratore.' }, { status: 403 });
    }

    const users = await getAllUsers();
    const profiles = users.map(toUserProfile);
    return NextResponse.json({ ok: true, users: profiles });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Accesso negato. Richiesto ruolo Amministratore.' }, { status: 403 });
    }

    const body = await request.json();
    const { username, nome, email, password, role, status, assignedCalendarIds } = body;

    if (!username || !nome || !password) {
      return NextResponse.json({ ok: false, error: 'Username, nome e password sono obbligatori.' }, { status: 400 });
    }

    const newUser = await createUser({
      username,
      nome,
      email,
      password,
      role: role || 'user',
      status: status || 'approved', // Se creato direttamente dall'admin è già approvato
      assignedCalendarIds: Array.isArray(assignedCalendarIds) ? assignedCalendarIds : [],
    });

    return NextResponse.json({ ok: true, user: newUser });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
}
