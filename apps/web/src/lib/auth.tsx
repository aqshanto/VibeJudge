"use client";

// লগইন করা ইউজারের তথ্য পুরো সাইটে শেয়ার করার context।

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { AuthUser, MeResponse } from "@vibejudge/shared";
import { api } from "./api";

interface AuthState {
  user: AuthUser | null;
  googleEnabled: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api<MeResponse>("/auth/me");
      setUser(me.user);
      setGoogleEnabled(me.googleEnabled);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, googleEnabled, loading, refresh, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
