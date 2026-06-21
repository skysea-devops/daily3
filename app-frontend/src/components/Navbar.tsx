"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function Navbar() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  function handleSignOut() {
    signOut();
    router.push("/");
  }

  return (
    <header style={{
      borderBottom: "1px solid var(--rule)",
      background: "var(--paper)",
      position: "sticky",
      top: 0,
      zIndex: 100,
    }}>
      <div style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "0 5vw",
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <Link href="/" style={{
          fontFamily: "'Lora', serif",
          fontWeight: 600,
          fontSize: "1.05rem",
          color: "var(--ink)",
          textDecoration: "none",
          letterSpacing: "0.02em",
        }}>
          Cogletta
        </Link>

        <nav style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {!loading && user ? (
            <>
              <span style={{ ...navLink, color: "var(--ink)", fontWeight: 600 }}>
                {user.email.split("@")[0]}
              </span>
              <Link href="/dashboard" style={navLink}>Dashboard</Link>
              <Link href="/interests" style={navLink}>Interests</Link>
              <button onClick={handleSignOut} style={{ ...navLink, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" style={navLink}>Sign in</Link>
              <Link href="/register" style={navBtn}>Start reading</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

const navLink: React.CSSProperties = {
  fontSize: "0.875rem",
  color: "var(--ink-soft)",
  textDecoration: "none",
  fontFamily: "Inter, sans-serif",
};

const navBtn: React.CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 600,
  color: "var(--white)",
  background: "var(--ink)",
  padding: "8px 18px",
  borderRadius: 6,
  textDecoration: "none",
  fontFamily: "Inter, sans-serif",
};
