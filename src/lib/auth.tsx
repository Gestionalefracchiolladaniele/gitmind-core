import { useState, useEffect, createContext, useContext, type ReactNode } from 'react';
import type { User } from './types';
import { api } from './api';

export function resolveGitHubRedirectUri(): string {
  const configured = import.meta.env.VITE_GITHUB_REDIRECT_URI as string | undefined;
  if (configured && configured.trim().length > 0) {
    return configured.trim();
  }

  return `${window.location.origin}/auth/callback`;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: () => Promise<void>;
  loginDemo: () => void;
  logout: () => void;
  handleCallback: (code: string, redirectUri?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUserId = localStorage.getItem('danspace_user_id');
    if (storedUserId) {
      const storedUser = localStorage.getItem('danspace_user');
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch { /* ignore */ }
        setIsLoading(false);
        return;
      }
      api.verifyUser(storedUserId)
        .then(({ user }) => setUser(user))
        .catch(() => localStorage.removeItem('danspace_user_id'))
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async () => {
    const redirectUri = resolveGitHubRedirectUri();
    const { url } = await api.getAuthUrl(redirectUri);
    window.location.href = url;
  };

  const loginDemo = () => {
    const simulatedUser: User = {
      id: crypto.randomUUID(),
      name: 'Developer (Demo)',
      avatar_url: null,
      github_id: null,
      created_at: new Date().toISOString(),
    };
    localStorage.setItem('danspace_user_id', simulatedUser.id);
    localStorage.setItem('danspace_user', JSON.stringify(simulatedUser));
    setUser(simulatedUser);
  };

  const handleCallback = async (code: string, redirectUri?: string) => {
    try {
      const { user } = await api.authCallback(code, redirectUri || resolveGitHubRedirectUri());
      localStorage.setItem('danspace_user_id', user.id);
      setUser(user);
    } catch (e: any) {
      console.error('OAuth callback failed:', e);
      throw e;
    }
  };

  const logout = () => {
    localStorage.removeItem('danspace_user_id');
    localStorage.removeItem('danspace_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, loginDemo, logout, handleCallback }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
