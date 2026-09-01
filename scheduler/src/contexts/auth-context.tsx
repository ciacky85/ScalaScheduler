'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { UserProfile, ImpostazioniCalendario } from '@/lib/types';

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isAdmin: boolean;
  isCalendarAllowed: (cal: string | ImpostazioniCalendario) => boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string; status?: string }>;
  register: (data: { username: string; nome: string; email?: string; password: string }) => Promise<{ ok: boolean; error?: string; message?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.user) {
          setUser(data.user);
          return;
        }
      }
      setUser(null);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (username: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok && data.ok && data.user) {
        setUser(data.user);
        return { ok: true };
      }
      return { ok: false, error: data.error || 'Credenziali non valide', status: data.status };
    } catch (e: any) {
      return { ok: false, error: e.message || 'Errore di connessione' };
    }
  };

  const register = async (data: { username: string; nome: string; email?: string; password: string }) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const resData = await res.json();
      if (res.ok && resData.ok) {
        return { ok: true, message: resData.message };
      }
      return { ok: false, error: resData.error || 'Errore durante la registrazione' };
    } catch (e: any) {
      return { ok: false, error: e.message || 'Errore di connessione' };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      window.location.reload();
    }
  };

  const isAdmin = user?.role === 'admin';

  const isCalendarAllowed = useCallback((cal: string | ImpostazioniCalendario): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;

    const assigned = Array.isArray(user.assignedCalendarIds) ? user.assignedCalendarIds : [];

    if (typeof cal === 'string') {
      return assigned.includes(cal);
    }

    if (cal && typeof cal === 'object') {
      const owner = String(cal.ownerId || '').trim().toLowerCase();
      const uId = String(user.id || '').trim().toLowerCase();
      const uName = String(user.username || '').trim().toLowerCase();

      // Se l'utente è il proprietario del calendario (ownerId)
      if (owner && (owner === uId || owner === uName)) {
        return true;
      }

      // Se è presente nei calendari assegnati all'utente
      if (assigned.includes(cal.calendarId) || assigned.includes(cal.id)) {
        return true;
      }
    }

    return false;
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAdmin,
        isCalendarAllowed,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
