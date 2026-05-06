import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { PersonWithUnit, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

interface AuthContextType {
  user: PersonWithUnit | null;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("oliveToken"));

  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem("oliveToken"));
  }, []);

  const { data: user, isLoading: isUserLoading, error } = useGetMe({
    query: {
      enabled: !!token,
      retry: false,
      queryKey: getGetMeQueryKey(),
    }
  });

  const login = (newToken: string) => {
    localStorage.setItem("oliveToken", newToken);
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem("oliveToken");
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
