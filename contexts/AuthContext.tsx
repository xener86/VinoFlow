import React, { createContext, useContext, useEffect, useState } from 'react';
import { customAuth } from '../services/customAuth';

interface User {
  id: string;
  email: string;
  [key: string]: any;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isConfigured: boolean;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: false,
  isConfigured: true,
  refreshUser: async () => {},
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConfigured] = useState(true); // Toujours configuré maintenant

  const refreshUser = async () => {
    const currentUser = customAuth.getUser();
    setUser(currentUser);
  };

  const signOut = async () => {
    await customAuth.signOut();
    setUser(null);
    window.location.href = '/login';
  };

  useEffect(() => {
    const checkAuth = async () => {
      const currentUser = customAuth.getUser();
      setUser(currentUser);
      setLoading(false);
    };

    checkAuth();

    // Listen for storage changes (multi-tab sync)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'user' || e.key === 'auth_token') {
        refreshUser();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isConfigured, refreshUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
