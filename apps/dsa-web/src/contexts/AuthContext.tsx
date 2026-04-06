import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createParsedApiError, getParsedApiError, type ParsedApiError } from '../api/error';
import { authApi } from '../api/auth';
import { useStockPoolStore } from '../stores';

type AuthContextValue = {
  authEnabled: boolean;
  loggedIn: boolean;
  role: 'super_admin' | 'viewer' | null;
  capabilities: {
    canAccessSettings: boolean;
    canUseTheme: boolean;
    canAnalyzeHome: boolean;
    canAnalyzeRecommendation: boolean;
    canAnalyzeBatch: boolean;
  };
  passwordSet: boolean;
  viewerPasswordSet: boolean;
  passwordChangeable: boolean;
  setupState: 'enabled' | 'password_retained' | 'no_password';
  isLoading: boolean;
  loadError: ParsedApiError | null;
  login: (
    password: string,
    passwordConfirm?: string,
    role?: 'super_admin' | 'viewer'
  ) => Promise<{ success: boolean; error?: ParsedApiError }>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
    newPasswordConfirm: string
  ) => Promise<{ success: boolean; error?: ParsedApiError }>;
  logout: () => Promise<void>;
  refreshStatus: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const defaultCapabilities = {
  canAccessSettings: false,
  canUseTheme: false,
  canAnalyzeHome: false,
  canAnalyzeRecommendation: false,
  canAnalyzeBatch: false,
};

function extractLoginError(err: unknown): ParsedApiError {
  const parsed = getParsedApiError(err);
  if (parsed.status === 429) {
    return createParsedApiError({
      title: '登录尝试过于频繁',
      message: '尝试次数过多，请稍后再试。',
      rawMessage: parsed.rawMessage,
      status: parsed.status,
      category: parsed.category,
    });
  }
  return parsed;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authEnabled, setAuthEnabled] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [role, setRole] = useState<'super_admin' | 'viewer' | null>(null);
  const [capabilities, setCapabilities] = useState(defaultCapabilities);
  const [passwordSet, setPasswordSet] = useState(false);
  const [viewerPasswordSet, setViewerPasswordSet] = useState(false);
  const [passwordChangeable, setPasswordChangeable] = useState(false);
  const [setupState, setSetupState] = useState<'enabled' | 'password_retained' | 'no_password'>('no_password');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<ParsedApiError | null>(null);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const status = await authApi.getStatus();
      setAuthEnabled(status.authEnabled);
      setLoggedIn(status.loggedIn);
      setRole(status.role ?? null);
      setCapabilities(status.capabilities ?? defaultCapabilities);
      setPasswordSet(status.passwordSet ?? false);
      setViewerPasswordSet(status.viewerPasswordSet ?? false);
      setPasswordChangeable(status.passwordChangeable ?? false);
      setSetupState(status.setupState);
      useStockPoolStore.getState().setAnalysisCapabilities({
        canAnalyzeRecommendation: status.capabilities?.canAnalyzeRecommendation ?? true,
        canAnalyzeBatch: status.capabilities?.canAnalyzeBatch ?? true,
      });
      if (status.authEnabled && !status.loggedIn) {
        useStockPoolStore.getState().resetDashboardState();
      }
    } catch (err) {
      setLoadError(getParsedApiError(err));
      setAuthEnabled(false);
      setLoggedIn(false);
      setRole(null);
      setCapabilities(defaultCapabilities);
      setPasswordSet(false);
      setViewerPasswordSet(false);
      setPasswordChangeable(false);
      setSetupState('no_password');
      useStockPoolStore.getState().setAnalysisCapabilities({
        canAnalyzeRecommendation: true,
        canAnalyzeBatch: true,
      });
      useStockPoolStore.getState().resetDashboardState();
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const login = useCallback(
    async (
      password: string,
      passwordConfirm?: string,
      role?: 'super_admin' | 'viewer'
    ): Promise<{ success: boolean; error?: ParsedApiError }> => {
      try {
        await authApi.login(password, passwordConfirm, role);
        await fetchStatus();
        return { success: true };
      } catch (err: unknown) {
        return { success: false, error: extractLoginError(err) };
      }
    },
    [fetchStatus]
  );

  const changePassword = useCallback(
    async (
      currentPassword: string,
      newPassword: string,
      newPasswordConfirm: string
    ): Promise<{ success: boolean; error?: ParsedApiError }> => {
      try {
        await authApi.changePassword(currentPassword, newPassword, newPasswordConfirm);
        return { success: true };
      } catch (err: unknown) {
        return { success: false, error: getParsedApiError(err) };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    let logoutError: unknown = null;
    try {
      await authApi.logout();
    } catch (err) {
      logoutError = err;
    } finally {
      await fetchStatus();
    }

    if (logoutError && getParsedApiError(logoutError).status !== 401) {
      throw logoutError;
    }
  }, [fetchStatus]);

  return (
    <AuthContext.Provider
      value={{
        authEnabled,
        loggedIn,
        role,
        capabilities,
        passwordSet,
        viewerPasswordSet,
        passwordChangeable,
        setupState,
        isLoading,
        loadError,
        login,
        changePassword,
        logout,
        refreshStatus: fetchStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- useAuth is a hook, co-located for context access
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
