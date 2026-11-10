import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getApiSession, apiLogout, type ApiUser } from '@/lib/api-client';
import { getProfile } from '@/lib/api';
import type { Profile, UserRole } from '@/types/index';

export interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  profile: Profile | null;
  role: UserRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null, profile: null, role: null, loading: true,
  signOut: async () => {}, refreshProfile: async () => {},
});

const asAuthUser = (user: ApiUser): AuthUser => ({ id: String(user.id), email: user.email });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const current = await getProfile();
    setProfile(current);
    setUser(current ? { id: String(current.id), email: current.email ?? '' } : null);
  }, []);

  useEffect(() => {
    let alive = true;
    getApiSession()
      .then(async session => {
        if (!alive) return;
        setUser(session.user ? asAuthUser(session.user) : null);
        if (session.user) {
          const current = await getProfile();
          if (alive) setProfile(current);
        }
      })
      .catch(() => {
        if (alive) { setUser(null); setProfile(null); }
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const signOut = async () => {
    try { await apiLogout(); }
    finally { setUser(null); setProfile(null); }
  };

  return (
    <AuthContext.Provider value={{ user, profile, role: profile?.role ?? null, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
