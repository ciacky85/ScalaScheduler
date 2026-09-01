import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { updateUser, deleteUser, approveUser, rejectUser } from '@/lib/auth/users-store';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Accesso negato. Richiesto ruolo Amministratore.' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, ...updates } = body;

    // Azione specifica: Approvazione rapida
    if (action === 'approve') {
      const approved = await approveUser(id, currentUser.username, updates.assignedCalendarIds);
      return NextResponse.json({ ok: true, user: approved });
    }

    // Azione specifica: Rifiuto rapido
    if (action === 'reject') {
      const rejected = await rejectUser(id);
      return NextResponse.json({ ok: true, user: rejected });
    }

    // Aggiornamento generale (ruolo, calendari, password, status)
    const updated = await updateUser(id, updates);
    return NextResponse.json({ ok: true, user: updated });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Accesso negato. Richiesto ruolo Amministratore.' }, { status: 403 });
    }

    const { id } = await params;
    const success = await deleteUser(id);
    if (!success) {
      return NextResponse.json({ ok: false, error: 'Utente non trovato o eliminazione non consentita.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, message: 'Utente eliminato con successo.' });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
}
