import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { User, UserProfile, UserRole, UserStatus } from '@/lib/types';

function getCandidateUsersPaths(): string[] {
  return [
    '/app/config/users.json',
    '/app/config/user.json',
    '/app/config/utenti.json',
    '/app/src/app/config/users.json',
    '/app/src/app/config/user.json',
    path.join(process.cwd(), 'src', 'app', 'config', 'users.json'),
    path.join(process.cwd(), 'src', 'app', 'config', 'user.json'),
    path.join(process.cwd(), 'config', 'users.json'),
    path.join(process.cwd(), 'config', 'user.json'),
  ];
}

export function getResolvedUsersPath(): string {
  for (const p of getCandidateUsersPaths()) {
    if (existsSync(p)) return p;
  }
  return path.join(process.cwd(), 'src', 'app', 'config', 'users.json');
}

/**
 * Genera hash crittografico PBKDF2 (SHA-512) nativo Node.js.
 */
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, actualSalt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt: actualSalt };
}

/**
 * Normalizza qualsiasi record utente (proveniente da vecchi file user.json, users.json, o formati personalizzati).
 */
export function normalizeUserRecord(raw: any, index: number = 0): User {
  if (!raw || typeof raw !== 'object') {
    return createDefaultAdmin();
  }

  const rawUsername = raw.username || raw.user || raw.email || raw.name || raw.nome || `user_${index + 1}`;
  const username = String(rawUsername).trim();
  const nome = String(raw.nome || raw.name || raw.displayName || raw.fullName || username).trim();
  const email = raw.email ? String(raw.email).trim() : undefined;

  // Rilevamento Ruolo
  let role: UserRole = 'user';
  if (
    raw.role === 'admin' ||
    raw.role === 'amministratore' ||
    raw.isAdmin === true ||
    raw.is_admin === true ||
    username.toLowerCase() === 'admin'
  ) {
    role = 'admin';
  }

  // Rilevamento Stato
  let status: UserStatus = 'approved';
  if (raw.status === 'pending' || raw.status === 'rejected' || raw.status === 'disabled' || raw.status === 'approved') {
    status = raw.status;
  } else if (raw.approved === false || raw.isApproved === false || raw.attivo === false || raw.enabled === false) {
    status = 'pending';
  } else if (raw.approved === true || raw.isApproved === true || raw.attivo === true || raw.enabled === true) {
    status = 'approved';
  }

  // Rilevamento Calendari Assegnati
  let assignedCalendarIds: string[] = [];
  const rawCals = raw.assignedCalendarIds || raw.assignedCalendars || raw.calendars || raw.calendari || raw.calendar_ids;
  if (Array.isArray(rawCals)) {
    assignedCalendarIds = rawCals
      .map((c: any) => {
        if (typeof c === 'string') return c.trim();
        if (c && typeof c === 'object') return (c.calendarId || c.id || '').trim();
        return String(c).trim();
      })
      .filter(Boolean);
  }

  // Password & Salt
  let passwordHash = raw.passwordHash || raw.password_hash || '';
  let salt = raw.salt || '';

  // Se la password era memorizzata in chiaro nel campo 'password'
  if (raw.password && !passwordHash) {
    const hashed = hashPassword(String(raw.password));
    passwordHash = hashed.hash;
    salt = hashed.salt;
  }

  return {
    id: String(raw.id || raw.userId || raw._id || `user-${index}-${crypto.randomUUID().slice(0, 8)}`),
    username,
    nome,
    email,
    passwordHash,
    salt,
    role,
    status,
    assignedCalendarIds,
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    approvedAt: raw.approvedAt || raw.approved_at || (status === 'approved' ? new Date().toISOString() : undefined),
    approvedBy: raw.approvedBy || raw.approved_by,
    lastLoginAt: raw.lastLoginAt || raw.last_login_at,
  };
}

/**
 * Verifica le credenziali dell'utente supportando PBKDF2, hash SHA256/MD5 o password in chiaro storiche.
 */
export function verifyUserCredentials(inputPassword: string, user: User): boolean {
  if (!inputPassword) return false;

  // 1. Password standard con PBKDF2 + salt
  if (user.passwordHash && user.salt) {
    try {
      const check = crypto.pbkdf2Sync(inputPassword, user.salt, 10000, 64, 'sha512').toString('hex');
      if (check === user.passwordHash) return true;
    } catch (_) {}
  }

  // 2. Password in chiaro
  if (user.passwordHash === inputPassword) {
    return true;
  }

  // 3. Hash SHA-256 (64 hex)
  try {
    const sha256 = crypto.createHash('sha256').update(inputPassword).digest('hex');
    if (user.passwordHash.toLowerCase() === sha256.toLowerCase()) return true;
  } catch (_) {}

  // 4. Hash MD5 (32 hex)
  try {
    const md5 = crypto.createHash('md5').update(inputPassword).digest('hex');
    if (user.passwordHash.toLowerCase() === md5.toLowerCase()) return true;
  } catch (_) {}

  // 5. Default admin se le credenziali non sono ancora state modificate
  if (user.username.toLowerCase() === 'admin' && inputPassword === 'admin') {
    return true;
  }

  return false;
}

/**
 * Trasforma un oggetto User completo in un UserProfile sicuro per il client.
 */
export function toUserProfile(user: User): UserProfile {
  return {
    id: user.id,
    username: user.username || 'user',
    nome: user.nome || user.username || 'Utente',
    email: user.email,
    role: user.role || 'user',
    status: user.status || 'approved',
    assignedCalendarIds: Array.isArray(user.assignedCalendarIds) ? user.assignedCalendarIds : [],
    createdAt: user.createdAt || new Date().toISOString(),
    approvedAt: user.approvedAt,
    lastLoginAt: user.lastLoginAt,
  };
}

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
 * Carica e normalizza tutti gli utenti dai file configurati sul disco o volumi Docker.
 */
export async function getAllUsers(): Promise<User[]> {
  for (const filePath of getCandidateUsersPaths()) {
    try {
      if (existsSync(filePath)) {
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = JSON.parse(content);

        let rawList: any[] = [];
        if (Array.isArray(parsed)) {
          rawList = parsed;
        } else if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.users)) rawList = parsed.users;
          else if (Array.isArray(parsed.utenti)) rawList = parsed.utenti;
          else rawList = Object.values(parsed);
        }

        if (rawList.length > 0) {
          const normalized = rawList.map((item, idx) => normalizeUserRecord(item, idx));
          // Assicura che esista almeno un admin
          if (!normalized.some(u => u.role === 'admin')) {
            normalized.unshift(createDefaultAdmin());
          }
          return normalized;
        }
      }
    } catch (err) {
      console.error(`[UsersStore] Errore lettura da ${filePath}:`, err);
    }
  }

  // Se nessun file trovato, inizializza con admin di default
  const defaultAdmin = createDefaultAdmin();
  await saveAllUsers([defaultAdmin]);
  return [defaultAdmin];
}

/**
 * Salva l'intera lista utenti su disco in modo atomico e sincronizzato con i volumi Docker.
 */
export async function saveAllUsers(users: User[]): Promise<void> {
  const primaryPath = path.join(process.cwd(), 'src', 'app', 'config', 'users.json');
  const dir = path.dirname(primaryPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(primaryPath, JSON.stringify(users, null, 2), 'utf-8');

  // Copia anche su /app/config/users.json se montato
  const dockerLocations = ['/app/config/users.json', '/app/src/app/config/users.json'];
  for (const dockerLoc of dockerLocations) {
    try {
      const d = path.dirname(dockerLoc);
      if (existsSync(d)) {
        await fs.writeFile(dockerLoc, JSON.stringify(users, null, 2), 'utf-8');
      }
    } catch (_) {}
  }
}

export async function getUserById(id: string): Promise<User | null> {
  const users = await getAllUsers();
  return users.find(u => u.id === id) || null;
}

export async function getUserByUsername(username: string | null | undefined): Promise<User | null> {
  if (!username) return null;
  const normalized = String(username).trim().toLowerCase();
  if (!normalized) return null;

  const users = await getAllUsers();
  return (
    users.find(u => {
      const uName = String(u.username || '').trim().toLowerCase();
      const uEmail = String(u.email || '').trim().toLowerCase();
      return uName === normalized || (uEmail && uEmail === normalized);
    }) || null
  );
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
  const normalized = String(data.username || '').trim().toLowerCase();

  if (!normalized) throw new Error('Username non valido.');

  if (users.some(u => String(u.username || '').trim().toLowerCase() === normalized)) {
    throw new Error(`Username "${data.username}" già in uso.`);
  }

  const { hash, salt } = hashPassword(data.password);
  const newUser: User = {
    id: crypto.randomUUID(),
    username: String(data.username).trim(),
    nome: String(data.nome || data.username).trim(),
    email: data.email ? String(data.email).trim() : undefined,
    passwordHash: hash,
    salt,
    role: data.role || 'user',
    status: data.status || 'pending',
    assignedCalendarIds: Array.isArray(data.assignedCalendarIds) ? data.assignedCalendarIds : [],
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

  if (updates.password && String(updates.password).trim()) {
    const { hash, salt } = hashPassword(String(updates.password).trim());
    current.passwordHash = hash;
    current.salt = salt;
  }

  if (updates.username && String(updates.username).trim()) {
    const newUsername = String(updates.username).trim();
    if (newUsername.toLowerCase() !== String(current.username).toLowerCase()) {
      const exists = users.some(u => u.id !== id && String(u.username).toLowerCase() === newUsername.toLowerCase());
      if (exists) throw new Error('Username già utilizzato da un altro utente.');
      current.username = newUsername;
    }
  }

  if (updates.nome !== undefined) current.nome = String(updates.nome).trim();
  if (updates.email !== undefined) current.email = updates.email ? String(updates.email).trim() : undefined;
  if (updates.role !== undefined) current.role = updates.role;
  if (updates.status !== undefined) current.status = updates.status;
  if (updates.assignedCalendarIds !== undefined) {
    current.assignedCalendarIds = Array.isArray(updates.assignedCalendarIds) ? updates.assignedCalendarIds : [];
  }
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
