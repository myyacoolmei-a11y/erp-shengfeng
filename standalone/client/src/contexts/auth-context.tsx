import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { setAuthTokenGetter, setOn401Handler } from "@workspace/api-client-react";
import type { FeatureKey, DataPermission } from "../../../shared/userPermissions.ts";
import {
  hasFeaturePermission,
  resolveFeaturePermissions,
  navHrefAllowed,
} from "../../../shared/userPermissions.ts";

export type UserRole =
  | "super_admin"
  | "owner"
  | "admin"
  | "sales"
  | "engineer"
  | "technician"
  | "accountant"
  | "distributor";

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  roles: UserRole[];
  mustChangePassword: boolean;
  linkedEmployeeId?: number | null;
  featurePermissions?: FeatureKey[];
  dataPermission?: DataPermission;
}

/** Returns effective roles — falls back to [role] when roles array is empty (old tokens) */
export function effectiveRoles(user: AuthUser | null): UserRole[] {
  if (!user) return [];
  return user.roles?.length ? user.roles : [user.role];
}

/** True when user has at least one of the given roles */
export function hasRole(user: AuthUser | null, ...roles: UserRole[]): boolean {
  if (!user) return false;
  const eff = effectiveRoles(user);
  return roles.some((r) => eff.includes(r));
}

export function userCanAccessNav(user: AuthUser | null, href: string): boolean {
  if (!user) return false;
  return navHrefAllowed(user, href);
}

export function userHasFeature(user: AuthUser | null, feature: FeatureKey): boolean {
  if (!user) return false;
  return hasFeaturePermission(user, feature);
}

export function userFeaturePermissions(user: AuthUser | null): FeatureKey[] {
  if (!user) return [];
  return resolveFeaturePermissions(user);
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (updated: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "erp_auth_token";
const USER_KEY = "erp_auth_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      return stored ? (JSON.parse(stored) as AuthUser) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setAuthTokenGetter(null);
    setOn401Handler(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem(TOKEN_KEY));
    setOn401Handler(() => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setAuthTokenGetter(null);
      setOn401Handler(null);
      setUser(null);
    });

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }

    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          setUser(null);
          return;
        }
        const me = (await res.json()) as AuthUser;
        setUser(me);
        localStorage.setItem(USER_KEY, JSON.stringify(me));
      })
      .catch(() => { /* network error — keep existing state */ })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      throw new Error(data.error ?? "登入失敗");
    }
    const data = (await response.json()) as { token: string; user: AuthUser };
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setAuthTokenGetter(() => localStorage.getItem(TOKEN_KEY));
    setOn401Handler(() => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setAuthTokenGetter(null);
      setOn401Handler(null);
      setUser(null);
    });
    setUser(data.user);
  }, []);

  const updateUser = useCallback((updated: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...updated };
      localStorage.setItem(USER_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
