import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { User, UserProfile, UserRole, UserStatus } from '@/lib/types';

function getCandidateUsersPaths(): string[] {
  return [
    path.join(process.cwd(), 'src', 'app', 'config', 'users.json'),
    path.join(process.cwd(), 'config', 'users.json'),
    '/app/config/users.json',
    '/app/src/app/config/users.json',
  ];
}

export function getResolvedUsersPath(): string {
  for (const p of getCandidateUsersPaths()) {
    if (existsSync(p)) return p;
  }
  return path.join(process.cwd(), 'src', 'app', 'config', 'users.json');
}

/**
 * Genera hash crittografico per la password usando PBKDF2 (compatibile nativo Node.js).
 */
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, actualSalt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt: actualSalt };
}

/**
 * Verifica una password in chiaro rispetto a hash e salt memorizzati.
 */
export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const check = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return check === hash;
}

/**
 * Trasforma un oggetto User completo in un UserProfile sicuro (senza hash e salt).
 */
export function toUserProfile(user: User): UserProfile {
  return {
    id: user.id,
    username: user.username,
    nome: user.nome,
    email: user.email,
    role: user.role,
    status: user.status,
    assignedCalendarIds: Array.isArray(user.assignedCalendarIds) ? user.assignedCalendarIds : [],
    createdAt: user.createdAt,
    approvedAt: user.approvedAt,
    lastLoginAt: user.lastLoginAt,
  };
}

/**
 * Inizializza l'utente admin predefinito se non sono presenti utenti nel file.
 */
function createDefaultAdmin(): User {
  const { hash, salt } = hashPassword('admin');
  return {
    id: 'admin-root-001',
    username: 'admin',
    nome: 'Amministratore',
    email: 'admin@teatroallascala.org',
    passwordHash: hash,
    salt,
    role: 'admin',
    status: 'approved',
    assignedCalendarIds: [],
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    approvedBy: 'system',
  };
}

/**
 * Carica tutti gli utenti dal file JSON.
 */
export async function getAllUsers(): Promise<User[]> {
  const filePath = getResolvedUsersPath();
  try {
    if (existsSync(filePath)) {
      const content = await fs.readFile(filePath, 'utf-8');
      const users: User[] = JSON.parse(content);
      if (Array.isArray(users) && users.length > 0) {
        return users;
      }
    }
  } catch (err) {
    console.error('[UsersStore] Errore lettura users.json:', err);
  }

  // Se il file non esiste o è vuoto, inizializza con admin
  const defaultAdmin = createDefaultAdmin();
  await saveAllUsers([defaultAdmin]);
  return [defaultAdmin];
}

/**
 * Salva l'intera lista utenti su disco (sia su path primario che su /app/config se Docker).
 */
export async function saveAllUsers(users: User[]): Promise<void> {
  const primaryPath = path.join(process.cwd(), 'src', 'app', 'config', 'users.json');
  const dir = path.dirname(primaryPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(primaryPath, JSON.stringify(users, null, 2), 'utf-8');

  // Copia su /app/config/users.json se esiste (volume Docker montato)
  const dockerConfigDir = '/app/config';
  try {
    if (existsSync(dockerConfigDir)) {
      await fs.writeFile(path.join(dockerConfigDir, 'users.json'), JSON.stringify(users, null, 2), 'utf-8');
    }
  } catch (_) {}
}

export async function getUserById(id: string): Promise<User | null> {
  const users = await getAllUsers();
  return users.find(u => u.id === id) || null;
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const users = await getAllUsers();
  const normalized = username.trim().toLowerCase();
  return users.find(u => u.username.trim().toLowerCase() === normalized) || null;
}

export async function createUser(data: {
  username: string;
  nome: string;
  email?: string;
  password: string;
  role?: UserRole;
  status?: UserStatus;
  assignedCalendarIds?: string[];
}): Promise<UserProfile> {
  const users = await getAllUsers();
  const normalized = data.username.trim().toLowerCase();

  if (users.some(u => u.username.trim().toLowerCase() === normalized)) {
    throw new Error(`Username "${data.username}" già in uso.`);
  }

  const { hash, salt } = hashPassword(data.password);
  const newUser: User = {
    id: crypto.randomUUID(),
    username: data.username.trim(),
    nome: data.nome.trim(),
    email: data.email?.trim() || undefined,
    passwordHash: hash,
    salt,
    role: data.role || 'user',
    status: data.status || 'pending', // Di default i nuovi registrati sono in attesa
    assignedCalendarIds: data.assignedCalendarIds || [],
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  await saveAllUsers(users);
  return toUserProfile(newUser);
}

export async function updateUser(
  id: string,
  updates: Partial<Omit<User, 'id' | 'passwordHash' | 'salt'>> & { password?: string }
): Promise<UserProfile> {
  const users = await getAllUsers();
  const index = users.findIndex(u => u.id === id);
  if (index === -1) {
    throw new Error('Utente non trovato.');
  }

  const current = users[index];

  if (updates.password && updates.password.trim()) {
    const { hash, salt } = hashPassword(updates.password.trim());
    current.passwordHash = hash;
    current.salt = salt;
  }

  if (updates.username && updates.username.trim().toLowerCase() !== current.username.toLowerCase()) {
    const exists = users.some(u => u.id !== id && u.username.toLowerCase() === updates.username!.trim().toLowerCase());
    if (exists) throw new Error('Username già utilizzato da un altro utente.');
    current.username = updates.username.trim();
  }

  if (updates.nome !== undefined) current.nome = updates.nome.trim();
  if (updates.email !== undefined) current.email = updates.email.trim() || undefined;
  if (updates.role !== undefined) current.role = updates.role;
  if (updates.status !== undefined) current.status = updates.status;
  if (updates.assignedCalendarIds !== undefined) current.assignedCalendarIds = updates.assignedCalendarIds;
  if (updates.approvedAt !== undefined) current.approvedAt = updates.approvedAt;
  if (updates.approvedBy !== undefined) current.approvedBy = updates.approvedBy;
  if (updates.lastLoginAt !== undefined) current.lastLoginAt = updates.lastLoginAt;

  users[index] = current;
  await saveAllUsers(users);
  return toUserProfile(current);
}

export async function deleteUser(id: string): Promise<boolean> {
  const users = await getAllUsers();
  const target = users.find(u => u.id === id);
  if (!target) return false;
  if (target.username === 'admin') {
    throw new Error("Impossibile eliminare l'amministratore principale.");
  }

  const filtered = users.filter(u => u.id !== id);
  await saveAllUsers(filtered);
  return true;
}

export async function approveUser(id: string, approverUsername: string, assignedCalendarIds?: string[]): Promise<UserProfile> {
  return updateUser(id, {
    status: 'approved',
    approvedAt: new Date().toISOString(),
    approvedBy: approverUsername,
    ...(assignedCalendarIds ? { assignedCalendarIds } : {}),
  });
}

export async function rejectUser(id: string): Promise<UserProfile> {
  return updateUser(id, {
    status: 'rejected',
  });
}
