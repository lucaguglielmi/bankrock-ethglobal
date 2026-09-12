"use client";

import React, { createContext, useContext, useState, useCallback, useSyncExternalStore } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";

export const DEMO_WALLET_ADDRESS = "0x71C8564e688172f6E1a90C0071C8097b6De81b47";
const DEMO_STORAGE_KEY = "bankrock_auth_demo_session";

export function isValidPrivyAppId(appId?: string): boolean {
  if (!appId) return false;
  const trimmed = appId.trim();
  if (
    trimmed === "" ||
    trimmed === "clp1234567890abcdef123456" ||
    trimmed.startsWith("clp12345678") ||
    trimmed.includes("placeholder") ||
    trimmed.includes("your-privy-app-id") ||
    trimmed === "undefined" ||
    trimmed === "null"
  ) {
    return false;
  }
  return trimmed.length >= 10;
}

export interface AuthWallet {
  address: string;
  chainType?: string;
  walletClientType?: string;
  connectorType?: string;
}

export interface AuthUser {
  id: string;
  wallet?: AuthWallet;
  email?: {
    address: string;
  };
  linkedAccounts?: Array<{
    type: string;
    address?: string;
    [key: string]: unknown;
  }>;
}

export interface BankRockAuthContextType {
  ready: boolean;
  authenticated: boolean;
  user: AuthUser | null;
  address?: string;
  isEmbedded: boolean;
  isDemoMode: boolean;
  lastLoginMethod: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  connectDemoWallet: () => void;
}

const BankRockAuthContext = createContext<BankRockAuthContextType | undefined>(undefined);

// Listeners for demo auth state changes
const authListeners = new Set<() => void>();
function notifyAuthChange() {
  authListeners.forEach((listener) => listener());
}

function subscribeStorage(callback: () => void) {
  authListeners.add(callback);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", callback);
  }
  return () => {
    authListeners.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", callback);
    }
  };
}

function getDemoSessionSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(DEMO_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function getServerDemoSnapshot(): boolean {
  return false;
}

function emptySubscribe() {
  return () => {};
}

function getClientMountedSnapshot(): boolean {
  return true;
}

function getServerMountedSnapshot(): boolean {
  return false;
}

export function BankRockAuthProvider({
  children,
  isRealPrivyConfigured = false,
}: {
  children: React.ReactNode;
  isRealPrivyConfigured?: boolean;
}) {
  const privy = usePrivy();
  const { address: wagmiAddress } = useAccount();

  // Hydrate storage state without triggering setState-in-effect lint warnings
  const isStoredDemo = useSyncExternalStore(
    subscribeStorage,
    getDemoSessionSnapshot,
    getServerDemoSnapshot
  );

  const hasMounted = useSyncExternalStore(
    emptySubscribe,
    getClientMountedSnapshot,
    getServerMountedSnapshot
  );

  // Local state override for instantaneous reactivity within same component tree
  const [sessionActive, setSessionActive] = useState<boolean | null>(null);

  const isDemoActive = sessionActive !== null ? sessionActive : isStoredDemo;

  const createDemoUser = useCallback((): AuthUser => {
    return {
      id: "did:privy:demo_bankrock_embedded_user",
      wallet: {
        address: DEMO_WALLET_ADDRESS,
        chainType: "ethereum",
        walletClientType: "privy",
        connectorType: "embedded",
      },
      email: {
        address: "collector@bankrock.eth",
      },
      linkedAccounts: [
        {
          type: "wallet",
          address: DEMO_WALLET_ADDRESS,
          chainType: "ethereum",
          walletClientType: "privy",
          connectorType: "embedded",
        },
        {
          type: "email",
          address: "collector@bankrock.eth",
        },
      ],
    };
  }, []);

  const activateDemo = useCallback(() => {
    setSessionActive(true);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(DEMO_STORAGE_KEY, "true");
      } catch {
        // Storage restricted/unavailable
      }
    }
    notifyAuthChange();
    console.info(
      `%c[BankRock Auth]%c Connected high-fidelity Demo Embedded Wallet (${DEMO_WALLET_ADDRESS.slice(0, 6)}...${DEMO_WALLET_ADDRESS.slice(-4)})`,
      "font-weight: bold; color: #3b82f6;",
      "color: inherit;"
    );
  }, []);

  const deactivateDemo = useCallback(() => {
    setSessionActive(false);
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(DEMO_STORAGE_KEY);
      } catch {
        // Storage restricted/unavailable
      }
    }
    notifyAuthChange();
  }, []);

  const login = useCallback(async () => {
    // If real Privy App ID is configured and SDK reports ready, try official Privy modal
    if (isRealPrivyConfigured && privy.ready) {
      try {
        await privy.login();
        return;
      } catch (err) {
        console.warn("[BankRock Auth] Privy login failed or closed with error:", err);
        return;
      }
    }
    // Fallback: Instantaneous high-fidelity Demo Embedded Wallet (only if no Privy app configured)
    if (!isRealPrivyConfigured) {
      activateDemo();
    }
  }, [isRealPrivyConfigured, privy, activateDemo]);

  const logout = useCallback(async () => {
    deactivateDemo();
    if (privy.authenticated) {
      try {
        await privy.logout();
      } catch (err) {
        console.warn("[BankRock Auth] Error during Privy logout:", err);
      }
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem("bankrock_last_login_method");
    }
  }, [deactivateDemo, privy]);

  const isAuthenticated = Boolean(
    (privy.ready && privy.authenticated) ||
    isDemoActive
  );

  const activeUser: AuthUser | null = (privy.authenticated && privy.user)
    ? (privy.user as unknown as AuthUser)
    : isDemoActive
    ? createDemoUser()
    : null;

  // Track last login method when authenticated
  const [lastLoginMethod, setLastLoginMethod] = useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("bankrock_last_login_method");
      if (saved && !isAuthenticated) {
        setLastLoginMethod(saved);
      }
    }
  }, [isAuthenticated]);

  React.useEffect(() => {
    if (isAuthenticated && activeUser?.linkedAccounts && activeUser.linkedAccounts.length > 0) {
      // Find the most likely primary login method (e.g., google, apple, email, wallet)
      const primaryMethod = activeUser.linkedAccounts[0].type;
      localStorage.setItem("bankrock_last_login_method", primaryMethod);
      setLastLoginMethod(primaryMethod);
    }
  }, [isAuthenticated, activeUser]);

  const activeAddress =
    wagmiAddress ||
    privy.user?.wallet?.address ||
    (isDemoActive ? DEMO_WALLET_ADDRESS : undefined);

  const isEmbedded =
    activeUser?.wallet?.walletClientType === "privy" ||
    isDemoActive;

  // We are in demo mode if no valid Privy App ID was provided or demo is explicitly active
  const isDemoMode = !isRealPrivyConfigured || isDemoActive;

  // Ready is true as soon as client mounts, preventing permanent loading state
  const ready = hasMounted && (isDemoMode ? true : privy.ready);

  return (
    <BankRockAuthContext.Provider
      value={{
        ready,
        authenticated: isAuthenticated,
        user: activeUser,
        address: activeAddress,
        isEmbedded,
        isDemoMode,
        lastLoginMethod,
        login,
        logout,
        connectDemoWallet: activateDemo,
      }}
    >
      {children}
    </BankRockAuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(BankRockAuthContext);
  if (!context) {
    throw new Error("useAuth must be used within a BankRockAuthProvider");
  }
  return context;
}

// Alias for seamless drop-in replacement
export const usePrivyAuth = useAuth;
