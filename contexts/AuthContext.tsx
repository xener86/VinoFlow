import React, { createContext, useContext, useEffect, useState } from 'react';
import { getCurrentUser, getSupabaseConfig } from '../services/supabase';

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
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isConfigured: false,
  refreshUser: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(false);

  const refreshUser = async () => {
    const currentUser = await getCurrentUser();
    setUser(currentUser);
  };

  useEffect(() => {
    const checkAuth = async () => {
      const config = getSupabaseConfig();
      
      if (config.url && config.key) {
        setIsConfigured(true);
        
        // Get user from localStorage
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } else {
        setIsConfigured(false);
      }
      
      setLoading(false);
    };

    checkAuth();

    // Listen for storage changes (useful for multi-tab sync)
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
    <AuthContext.Provider value={{ user, loading, isConfigured, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);