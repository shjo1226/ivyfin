import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface User {
  id: string;
  name: string;
  email?: string;
  phone: string;
  isGuest?: boolean;
  birthDate?: string;
  gender?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  guestRegister: (data: GuestData) => Promise<void>;
  logout: () => void;
}

interface SignupData {
  name: string;
  email: string;
  phone: string;
  password: string;
  privacyConsent: boolean;
}

interface GuestData {
  name: string;
  phone: string;
  birthDate?: string;
  gender?: string;
  privacyConsent: boolean;
}

const API_URL = 'http://localhost:3005/api';

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    setIsLoading(false);
  }, []);

  const saveAuth = (accessToken: string, userData: User) => {
    setToken(accessToken);
    setUser(userData);
    localStorage.setItem('token', accessToken);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || '로그인에 실패했습니다.');
    }

    const data = await res.json();
    saveAuth(data.accessToken, data.user);
  }, []);

  const signup = useCallback(async (signupData: SignupData) => {
    const res = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signupData),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || '회원가입에 실패했습니다.');
    }

    const data = await res.json();
    saveAuth(data.accessToken, data.user);
  }, []);

  const guestRegister = useCallback(async (guestData: GuestData) => {
    const res = await fetch(`${API_URL}/auth/guest-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(guestData),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || '비회원 등록에 실패했습니다.');
    }

    const data = await res.json();
    saveAuth(data.accessToken, data.user);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        signup,
        guestRegister,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
