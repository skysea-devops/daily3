"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { userPool } from "@/lib/cognito";
import { getUserProfile } from "@/lib/api";
import type { CognitoUserSession } from "amazon-cognito-identity-js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuthUser {
  sub: string;
  email: string;
  accessToken: string;
  idToken: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** true while the initial session check is running */
  loading: boolean;
  /** true if the user has completed onboarding (interests saved) */
  hasInterests: boolean;
  signOut: () => void;
  /** Call after a successful login to refresh context immediately */
  refreshSession: () => Promise<void>;
  /** Call after interests are saved */
  markInterestsSaved: () => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  hasInterests: false,
  signOut: () => {},
  refreshSession: async () => {},
  markInterestsSaved: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasInterests, setHasInterests] = useState(false);

  const loadSession = useCallback(async () => {
    return new Promise<void>((resolve) => {
      const cognitoUser = userPool.getCurrentUser();

      if (!cognitoUser) {
        setUser(null);
        setLoading(false);
        resolve();
        return;
      }

      cognitoUser.getSession(
        async (error: Error | null, session: CognitoUserSession | null) => {
          if (error || !session || !session.isValid()) {
            setUser(null);
            setLoading(false);
            resolve();
            return;
          }

          const claims = session.getIdToken().decodePayload();

          // Sync tokens to localStorage (api.ts reads access_token)
          const accessToken = session.getAccessToken().getJwtToken();
          const idToken = session.getIdToken().getJwtToken();

          setUser({
            sub: claims["sub"] as string,
            email: claims["email"] as string,
            accessToken,
            idToken,
          });

          localStorage.setItem("access_token", accessToken);
          localStorage.setItem("id_token", idToken);

          // Fetch interests from DynamoDB (source of truth)
          // and sync to localStorage so dashboard can read them
          try {
            const profile = await getUserProfile(accessToken);
            if (profile.interests && profile.interests.length === 3) {
              localStorage.setItem(
                "daily3-categories",
                JSON.stringify(profile.interests)
              );
              setHasInterests(true);
            } else {
              setHasInterests(false);
            }
          } catch {
            // Fallback to localStorage if API fails
            const saved = localStorage.getItem("daily3-categories");
            setHasInterests(!!saved);
          }

          setLoading(false);
          resolve();
        }
      );
    });
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const refreshSession = useCallback(async () => {
    await loadSession();
  }, [loadSession]);

  const signOut = useCallback(() => {
    const cognitoUser = userPool.getCurrentUser();
    cognitoUser?.signOut();
    localStorage.removeItem("access_token");
    localStorage.removeItem("id_token");
    localStorage.removeItem("daily3-categories");
    setUser(null);
    setHasInterests(false);
  }, []);

  const markInterestsSaved = useCallback(() => {
    setHasInterests(true);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, hasInterests, signOut, refreshSession, markInterestsSaved }}
    >
      {children}
    </AuthContext.Provider>
  );
}
