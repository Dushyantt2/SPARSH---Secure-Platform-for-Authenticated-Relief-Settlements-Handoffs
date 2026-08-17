import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setToken, getToken, clearToken, unauthorizedEvent } from '../api/client';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ twofa: boolean; userId?: number; hint?: string; devOtp?: string }>;
  citizenLoginStep1: (email: string, phone: string) => Promise<{ step: number; stepToken: string; name: string; maskedAadhaar: string }>;
  citizenLoginStep2: (stepToken: string, aadhaar: string) => Promise<User>;
  qrLogin: (token: string) => Promise<{ twofa: boolean; userId?: number; hint?: string; devOtp?: string }>;
  verifyOtp: (userId: number, code: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.get<User>('/auth/me');
      setUser(me);
    } catch {
      setUser(null);
      clearToken();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    return unauthorizedEvent(() => {
      setUser(null);
      clearToken();
    });
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ twofa: boolean; token: string | null; user?: User; hint?: string; devOtp?: string }>('/auth/login', { email, password });
    if (!res.twofa && res.token) {
      setToken(res.token);
      setUser(res.user!);
    }
    return { twofa: res.twofa, userId: res.user?.id, hint: res.hint, devOtp: res.devOtp };
  };

  const citizenLoginStep1 = async (email: string, phone: string) => {
    return await api.post<{ step: number; stepToken: string; name: string; maskedAadhaar: string }>('/auth/citizen-login/step1', { email, phone });
  };

  const citizenLoginStep2 = async (stepToken: string, aadhaar: string): Promise<User> => {
    const res = await api.post<{ token: string; user: User }>('/auth/citizen-login/step2', { stepToken, aadhaar });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const qrLogin = async (token: string) => {
    const res = await api.post<{ twofa: boolean; token: string | null; user?: User; hint?: string; devOtp?: string }>('/auth/qr-login', { token });
    if (!res.twofa && res.token) {
      setToken(res.token);
      setUser(res.user!);
    }
    return { twofa: res.twofa, userId: res.user?.id, hint: res.hint, devOtp: res.devOtp };
  };

  const verifyOtp = async (userId: number, code: string) => {
    const res = await api.post<{ token: string; user: User }>('/auth/verify-otp', { userId, code });
    setToken(res.token);
    setUser(res.user);
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, citizenLoginStep1, citizenLoginStep2, qrLogin, verifyOtp, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
