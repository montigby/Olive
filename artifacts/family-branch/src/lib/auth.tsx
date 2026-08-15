import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { PersonWithUnit, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

interface AuthContextType {
  user: PersonWithUnit | null;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Peeks at a JWT's payload (personId/familyUnitId) without verifying the
// signature -- this is a client-side UX check only, never a security
// boundary (the server independently verifies every token on every
// request). Returns null on any malformed input rather than throwing, since
// this runs on arbitrary strings from localStorage.
function decodeTokenPersonId(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return (JSON.parse(json) as { personId?: string }).personId ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("oliveToken"));
  const queryClient = useQueryClient();

  // Set synchronously on every render so the getter is available before any
  // child component fires its first TanStack Query request. A useEffect would
  // be too late — queries fire before effects run, causing spurious 401s.
  setAuthTokenGetter(() => localStorage.getItem("oliveToken"));

  const { data: user, isLoading: isUserLoading, error } = useGetMe({
    query: {
      enabled: !!token,
      retry: false,
      queryKey: getGetMeQueryKey(),
    }
  });

  const login = (newToken: string) => {
    // The auth token lives in localStorage, shared across every tab in this
    // browser regardless of which one is "active" -- logging into a second
    // account here silently signs the first one out everywhere, with no
    // warning. Confirm first if this would actually switch accounts (not
    // just refresh the same one), so a second real login doesn't quietly
    // evict someone already using this browser.
    const existingToken = localStorage.getItem("oliveToken");
    if (existingToken && existingToken !== newToken) {
      const existingPersonId = decodeTokenPersonId(existingToken);
      const newPersonId = decodeTokenPersonId(newToken);
      if (existingPersonId && newPersonId && existingPersonId !== newPersonId) {
        const proceed = window.confirm(
          "You're already signed in as someone else in this browser. Continue and switch accounts? This will sign the other account out here.",
        );
        if (!proceed) return;
      }
    }

    localStorage.setItem("oliveToken", newToken);
    queryClient.clear();
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem("oliveToken");
    queryClient.clear();
    setToken(null);
  };

  // If token exists but fetch fails (e.g. 401), we should probably clear token.
  useEffect(() => {
    if (error) {
      logout();
    }
  }, [error]);

  const isLoading = !!token && isUserLoading;

  return (
    <AuthContext.Provider value={{ user: user || null, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
