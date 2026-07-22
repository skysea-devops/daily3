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
  sub:         string;
  email:       string;
  accessToken: string;
  idToken:     string;
}

interface AuthContextValue {
  user:               AuthUser | null;
  loading:            boolean;
  hasInterests:       boolean;
  plan:               "free" | "pro";
  signOut:            () => void;
  refreshSession:     () => Promise<void>;
  markInterestsSaved: () => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  user:               null,
  loading:            true,
  hasInterests:       false,
  plan:               "free",
  signOut:            () => {},
  refreshSession:     async () => {},
  markInterestsSaved: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]               = useState<AuthUser | null>(null);
  const [loading, setLoading]         = useState(true);
  const [hasInterests, setHasInterests] = useState(false);
  const [plan, setPlan]               = useState<"free" | "pro">("free");

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

          const accessToken = session.getAccessToken().getJwtToken();
          const idToken     = session.getIdToken().getJwtToken();

          setUser({
            sub:         claims["sub"] as string,
            email:       claims["email"] as string,
            accessToken,
            idToken,
          });

          localStorage.setItem("access_token", accessToken);
          localStorage.setItem("id_token", idToken);

          try {
            const profile = await getUserProfile(accessToken);
            // Free plan 1, Pro plan 3 interest kullanır — 1+ interest onboarding'in
            // tamamlandığı anlamına gelir. (Eski `=== 3` koşulu, 1 interest'e geçen
            // free kullanıcıları her taze login'de onboarding'e geri atıyordu.)
            if (profile.interests && profile.interests.length >= 1) {
              localStorage.setItem("cogletta-categories", JSON.stringify(profile.interests));
              setHasInterests(true);
            } else {
              setHasInterests(false);
            }
            setPlan(profile.plan === "pro" ? "pro" : "free");
          } catch (err) {
            // Profil gecici olarak yuklenemedi: kullaniciyi DEMOTE ETME. Son bilinen
            // plani koru (Pro kullaniciyi gecici hatada Free'ye dusurme). Free yalnizca
            // backend gercekten Free dondurdugunde (try blogunda) set edilir.
            console.warn("auth: profile load failed; keeping last-known plan", err);
            const saved = localStorage.getItem("cogletta-categories");
            if (saved) setHasInterests(true);
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
    localStorage.removeItem("cogletta-categories");
    setUser(null);
    setHasInterests(false);
    setPlan("free");
  }, []);

  const markInterestsSaved = useCallback(() => {
    setHasInterests(true);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, hasInterests, plan, signOut, refreshSession, markInterestsSaved }}
    >
      {children}
    </AuthContext.Provider>
  );
}
