"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

interface GuardProps {
  children: React.ReactNode;
}

/** Redirects to / if not authenticated */
export function RequireAuth({ children }: GuardProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}

/** Redirects to /dashboard if already authenticated + has interests,
 *  or to /onboarding if authenticated but no interests yet */
export function RequireGuest({ children }: GuardProps) {
  const { user, loading, hasInterests } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace(hasInterests ? "/dashboard" : "/onboarding");
    }
  }, [user, loading, hasInterests, router]);

  if (loading || user) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}

/** Redirects to /dashboard if user already has interests saved */
export function RequireOnboarding({ children }: GuardProps) {
  const { user, loading, hasInterests } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace("/login");
      } else if (hasInterests) {
        router.replace("/dashboard");
      }
    }
  }, [user, loading, hasInterests, router]);

  if (loading || !user || hasInterests) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-black border-t-transparent" />
    </div>
  );
}
