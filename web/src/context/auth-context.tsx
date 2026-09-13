"use client";

/**
 * Authentication state (A-1, A-2, D-013).
 *
 * What was here: with no valid NEXT_PUBLIC_PRIVY_APP_ID, `login()` did not fail. It activated a
 * fabricated embedded wallet - `0x71C8…1b47`, `collector@bankrock.eth` - persisted the session in
 * localStorage and presented it in the header as a Privy embedded wallet. The console called it a
 * "high-fidelity Demo Embedded Wallet". It was indistinguishable from a real session.
 *
 * That entire path is deleted: the address, the localStorage session, the fabricated user, and
 * the second implicit demo flag it derived. With no configured Privy app, sign-in is
 * UNAVAILABLE - `unavailable: true` with a reason the UI renders - and no address is ever shown.
 *
 * There is no demo flag here, implicit or otherwise: "Privy is not configured" is `unavailable`
 * and nothing else.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";

const LAST_LOGIN_METHOD_KEY = "bankrock_last_login_method";

/**
 * A Privy app id is valid when it is a non-placeholder identifier. A hardcoded placeholder id
 * used to be passed to the SDK so it would boot anyway; placeholders are now rejected here and
 * `PrivyProvider` is simply not rendered (A-2).
 */
export function isValidPrivyAppId(appId?: string): boolean {
  if (!appId) return false;
  const trimmed = appId.trim();
  if (
    trimmed === "" ||
    // Covers the placeholder id this app used to boot with, and its near variants.
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
  email?: { address: string };
  linkedAccounts?: Array<{ type: string; address?: string; [key: string]: unknown }>;
}

export interface BankRockAuthContextType {
  ready: boolean;
  authenticated: boolean;
  user: AuthUser | null;
  address?: string;
  isEmbedded: boolean;
  lastLoginMethod: string | null;
  /** True when sign-in cannot work at all - render an UNAVAILABLE state, not a login button. */
  unavailable: boolean;
  unavailableReason?: string;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  /** The Privy access token for authenticated API calls, or null when there is no session. */
  getAccessToken: () => Promise<string | null>;
}

export const SIGN_IN_UNAVAILABLE_REASON = "Sign-in is not configured";

const BankRockAuthContext = createContext<BankRockAuthContextType | undefined>(undefined);

/* -------------------------------------------------------------------------- */
/* Last login method (STEERING.md: surface the method last used to sign in)    */
/*                                                                             */
/* It is an external store read through useSyncExternalStore rather than state */
/* hydrated in an effect. Only ever a method name - never an address, never a  */
/* credential, and it is not a session: it cannot authenticate anything.       */
/* -------------------------------------------------------------------------- */

const lastLoginListeners = new Set<() => void>();
let lastLoginCache: string | null | undefined;

function readLastLoginMethod(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LAST_LOGIN_METHOD_KEY);
  } catch {
    return null;
  }
}

function getLastLoginMethodSnapshot(): string | null {
  if (lastLoginCache === undefined) {
    lastLoginCache = readLastLoginMethod();
  }
  return lastLoginCache;
}

function getServerLastLoginMethodSnapshot(): string | null {
  return null;
}

function subscribeLastLoginMethod(callback: () => void): () => void {
  lastLoginListeners.add(callback);
  const onStorage = () => {
    lastLoginCache = readLastLoginMethod();
    callback();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    lastLoginListeners.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function writeLastLoginMethod(method: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (method) localStorage.setItem(LAST_LOGIN_METHOD_KEY, method);
    else localStorage.removeItem(LAST_LOGIN_METHOD_KEY);
  } catch {
    // Storage restricted - the last login method is a convenience, never a credential.
  }
  lastLoginCache = method;
  lastLoginListeners.forEach((listener) => listener());
}

/**
 * The real provider. Must be rendered inside PrivyProvider and WagmiProvider - which only exist
 * when a valid app id is configured.
 */
export function BankRockAuthProvider({ children }: { children: React.ReactNode }) {
  const privy = usePrivy();
  const { address: wagmiAddress } = useAccount();
  const lastLoginMethod = useSyncExternalStore(
    subscribeLastLoginMethod,
    getLastLoginMethodSnapshot,
    getServerLastLoginMethodSnapshot,
  );

  const authenticated = Boolean(privy.ready && privy.authenticated);
  const user: AuthUser | null =
    privy.authenticated && privy.user ? (privy.user as unknown as AuthUser) : null;

  // Records the method used for a real session, so the next visit can surface it.
  useEffect(() => {
    if (!authenticated) return;
    const primaryMethod = user?.linkedAccounts?.[0]?.type ?? null;
    if (primaryMethod) {
      writeLastLoginMethod(primaryMethod);
    }
  }, [authenticated, user]);

  const login = useCallback(async () => {
    if (!privy.ready) return;
    await privy.login();
  }, [privy]);

  const logout = useCallback(async () => {
    if (privy.authenticated) {
      await privy.logout();
    }
    writeLastLoginMethod(null);
  }, [privy]);

  const getAccessToken = useCallback(async () => {
    if (!privy.authenticated) return null;
    return (await privy.getAccessToken()) ?? null;
  }, [privy]);

  const address = wagmiAddress ?? user?.wallet?.address ?? undefined;

  return (
    <BankRockAuthContext.Provider
      value={{
        ready: privy.ready,
        authenticated,
        user,
        address,
        isEmbedded: user?.wallet?.walletClientType === "privy",
        lastLoginMethod,
        unavailable: false,
        login,
        logout,
        getAccessToken,
      }}
    >
      {children}
    </BankRockAuthContext.Provider>
  );
}

/**
 * The provider used when sign-in cannot work - no valid NEXT_PUBLIC_PRIVY_APP_ID.
 *
 * It renders no Privy SDK, holds no session and exposes no address. `login()` resolves without
 * doing anything; the UI is expected to render the UNAVAILABLE state instead of a login control.
 */
export function UnavailableAuthProvider({
  children,
  reason = SIGN_IN_UNAVAILABLE_REASON,
}: {
  children: React.ReactNode;
  reason?: string;
}) {
  const noop = useCallback(async () => {}, []);
  const noToken = useCallback(async () => null, []);
  const lastLoginMethod = useSyncExternalStore(
    subscribeLastLoginMethod,
    getLastLoginMethodSnapshot,
    getServerLastLoginMethodSnapshot,
  );

  return (
    <BankRockAuthContext.Provider
      value={{
        ready: true,
        authenticated: false,
        user: null,
        address: undefined,
        isEmbedded: false,
        lastLoginMethod,
        unavailable: true,
        unavailableReason: reason,
        login: noop,
        logout: noop,
        getAccessToken: noToken,
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

export const usePrivyAuth = useAuth;
