// app-frontend/src/lib/auth-context.tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { userPool } from "@/lib/cognito";
import { getUserProfile, type TrialState } from "@/lib/api";
import type { CognitoUserSession } from "amazon-cognito-identity-js";
import { isCategoryId } from "./categories";

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
  planSource:         "trial" | "paid" | null;
  trialEndsAt:        string | null;
  /** Deneme gecmisi/durumu — /register sayfasinin durum ayrimi bunun uzerinden. */
  trial:              TrialState | null;
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
  planSource:         null,
  trialEndsAt:        null,
  trial:              null,
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
  /** "trial" iken Pro deneme suresi devam ediyor demektir. */
  const [planSource, setPlanSource]   = useState<"trial" | "paid" | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [trial, setTrial]             = useState<TrialState | null>(null);

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
            // Kayitli degerler bilinen kategori ID'lerine karsi suzulur.
            // Bos dizi degil AMA gecerli hicbir ID icermeyen bir kayit (ornegin
            // kategori yeniden adlandirildiginda kalan eski deger) kullaniciyi
            // sessizce fallback kartlarina mahkum ediyordu: hasInterests true
            // kaliyor, onboarding'e yonlendirilmiyor, ama backend o kategori
            // icin hicbir kaynak bulamiyor.
            const profileIsPro = profile.plan === "pro";
            const validInterests = (profile.interests ?? []).filter(isCategoryId);

            // Free planda konu SEÇİMİ YOK: her sabah rotasyondan bir konu gelir.
            // Dolayısıyla Free kullanıcı onboarding'e hiç uğramaz; kayıt sonrası
            // doğrudan dashboard'a gider. Pro'ya yükselirse interests boş olduğu
            // için hasInterests false olur ve seçim ekranına yönlendirilir —
            // istediğimiz davranış tam olarak bu.
            if (validInterests.length >= 1) {
              localStorage.setItem("cogletta-categories", JSON.stringify(validInterests));
            } else {
              localStorage.removeItem("cogletta-categories");
            }
            setHasInterests(profileIsPro ? validInterests.length >= 1 : true);
            setPlan(profileIsPro ? "pro" : "free");
            setPlanSource((profile.planSource as "trial" | "paid" | null) ?? null);
            setTrialEndsAt(profile.trialEndsAt ?? null);
            // Backend `trial` blogunu dondurmezse (eski deploy) makul bir varsayim
            // uret: Pro/trial ise active, degilse "unknown" yerine null birak.
            setTrial(
              profile.trial ?? {
                status:     profile.planSource === "trial" ? "active" : "none",
                eligible:   false,
                endsAt:     profile.trialEndsAt ?? null,
                startedAt:  null,
                consumedAt: null,
                daysLeft:   null,
              }
            );
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
    setPlanSource(null);
    setTrialEndsAt(null);
    setTrial(null);
  }, []);

  const markInterestsSaved = useCallback(() => {
    setHasInterests(true);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, hasInterests, plan, planSource, trialEndsAt, trial, signOut, refreshSession, markInterestsSaved }}
    >
      {children}
    </AuthContext.Provider>
  );
}
