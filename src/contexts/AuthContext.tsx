import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';

const LOCAL_SESSION_STORAGE_KEY = 'racion_app_session_token';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  phoneNumber?: string | null;
  providerData: Array<{ providerId: string }>;
  getIdToken: () => Promise<string>;
}

interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  language?: 'es' | 'en';
  units?: 'metric' | 'imperial';
  city?: string;
  remindersEnabled?: boolean;
  theme?: 'light' | 'dark';
  isLicensed?: boolean;
  licenseKey?: string;
}

export interface RegisterCredentialsInput {
  method: 'email' | 'phone';
  email?: string;
  phone?: string;
  password: string;
  displayName?: string;
}

export interface LoginCredentialsInput {
  identifier: string;
  password: string;
}

interface AuthContextType {
  user: AppUser | null;
  idToken: string | null;
  loading: boolean;
  userProfile: UserProfile | null;
  signInWithGoogle: () => Promise<void>;
  registerWithCredentials: (input: RegisterCredentialsInput) => Promise<void>;
  loginWithCredentials: (input: LoginCredentialsInput) => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  isAuthModalOpen: boolean;
  authModalMode: 'register' | 'login';
  openAuthModal: (mode?: 'register' | 'login') => void;
  closeAuthModal: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  idToken: null,
  loading: true,
  userProfile: null,
  signInWithGoogle: async () => {},
  registerWithCredentials: async () => {},
  loginWithCredentials: async () => {},
  signOut: async () => {},
  getIdToken: async () => null,
  isAuthModalOpen: false,
  authModalMode: 'register',
  openAuthModal: () => {},
  closeAuthModal: () => {},
  refreshProfile: async () => {},
});

function toAppUserFromBackend(
  backendUser: {
    uid: string;
    email?: string | null;
    displayName?: string | null;
    phoneNumber?: string | null;
    authProvider?: string;
  },
  token: string
): AppUser {
  const providerId = backendUser.authProvider === 'phone' ? 'phone' : 'password';
  return {
    uid: backendUser.uid,
    email: backendUser.email || null,
    displayName: backendUser.displayName || null,
    photoURL: null,
    phoneNumber: backendUser.phoneNumber || null,
    providerData: [{ providerId }],
    getIdToken: async () => token,
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'register' | 'login'>('register');

  const openAuthModal = (mode: 'register' | 'login' = 'register') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  const syncBackendUser = async (token: string) => {
    try {
      const res = await fetch('/api/user/sync', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const profRes = await fetch('/api/user/profile', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (profRes.ok) {
          const profData = await profRes.json();
          if (profData.profile) {
            setUserProfile(profData.profile);
          }
        }
      }
    } catch (e) {
      console.warn('Backend user synchronization offline or pending:', e);
    }
  };

  const refreshProfile = async () => {
    const activeToken = idToken || (auth.currentUser ? await auth.currentUser.getIdToken() : null);
    if (activeToken) {
      await syncBackendUser(activeToken);
    }
  };

  useEffect(() => {
    let mounted = true;

    const restoreSessionIfNeeded = async () => {
      const savedToken = localStorage.getItem(LOCAL_SESSION_STORAGE_KEY);
      if (!savedToken) {
        if (mounted) setLoading(false);
        return;
      }

      try {
        const res = await fetch('/api/auth/session', {
          headers: { Authorization: `Bearer ${savedToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (mounted && data.user) {
            setUser(toAppUserFromBackend(data.user, savedToken));
            setIdToken(savedToken);
            await syncBackendUser(savedToken);
          }
        } else {
          localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
        }
      } catch {
        // Offline fallback: keep token until connection returns
      } finally {
        if (mounted) setLoading(false);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
        const appUser: AppUser = {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
          phoneNumber: currentUser.phoneNumber,
          providerData: currentUser.providerData.map((p) => ({ providerId: p.providerId })),
          getIdToken: () => currentUser.getIdToken(),
        };
        if (mounted) setUser(appUser);
        try {
          const token = await currentUser.getIdToken();
          if (mounted) setIdToken(token);
          await syncBackendUser(token);
        } catch (e) {
          console.warn('Failed to get token or sync user:', e);
        }
        if (mounted) setLoading(false);
      } else {
        await restoreSessionIfNeeded();
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    try {
      const res = await signInWithPopup(auth, googleAuthProvider);
      localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
      const token = await res.user.getIdToken();
      setUser({
        uid: res.user.uid,
        email: res.user.email,
        displayName: res.user.displayName,
        photoURL: res.user.photoURL,
        phoneNumber: res.user.phoneNumber,
        providerData: res.user.providerData.map((p) => ({ providerId: p.providerId })),
        getIdToken: () => res.user.getIdToken(),
      });
      setIdToken(token);
      await syncBackendUser(token);
      setIsAuthModalOpen(false);
    } catch (error: any) {
      const code = error?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        console.warn('Google Sign-In cancelled by user');
      } else {
        console.warn('Google Sign-In notice:', code || error?.message);
      }
      throw error;
    }
  };

  const registerWithCredentials = async (input: RegisterCredentialsInput) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'No se pudo completar el registro. Verifica tus datos.');
    }

    if (auth.currentUser) {
      await fbSignOut(auth).catch(() => {});
    }

    localStorage.setItem(LOCAL_SESSION_STORAGE_KEY, data.token);
    setIdToken(data.token);
    setUser(toAppUserFromBackend(data.user, data.token));
    await syncBackendUser(data.token);
    setIsAuthModalOpen(false);
  };

  const loginWithCredentials = async (input: LoginCredentialsInput) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Credenciales incorrectas. Verifica tus datos.');
    }

    if (auth.currentUser) {
      await fbSignOut(auth).catch(() => {});
    }

    localStorage.setItem(LOCAL_SESSION_STORAGE_KEY, data.token);
    setIdToken(data.token);
    setUser(toAppUserFromBackend(data.user, data.token));
    await syncBackendUser(data.token);
    setIsAuthModalOpen(false);
  };

  const signOut = async () => {
    try {
      localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
      if (auth.currentUser) {
        await fbSignOut(auth);
      }
      setIdToken(null);
      setUser(null);
      setUserProfile(null);
      sessionStorage.removeItem('racion_app_user_session');
    } catch (error) {
      console.warn('Sign out failed:', error);
    }
  };

  const getIdToken = async () => {
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      setIdToken(token);
      return token;
    }
    const localToken = idToken || localStorage.getItem(LOCAL_SESSION_STORAGE_KEY);
    return localToken || null;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        idToken,
        loading,
        userProfile,
        signInWithGoogle,
        registerWithCredentials,
        loginWithCredentials,
        signOut,
        getIdToken,
        isAuthModalOpen,
        authModalMode,
        openAuthModal,
        closeAuthModal,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
