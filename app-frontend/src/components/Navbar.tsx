"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useState, useRef, useEffect } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL!;

export default function Navbar() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  function handleSignOut() {
    signOut();
    router.push("/");
  }

  async function handleDeleteAccount() {
    if (!user?.accessToken) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/me`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      if (res.ok) {
        signOut();
        router.push("/");
      } else {
        alert("Something went wrong. Please try again.");
      }
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
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
                <Link href="/dashboard" style={navLink}>Dashboard</Link>
                <Link href="/interests" style={navLink}>Interests</Link>

                {/* User dropdown */}
                <div ref={menuRef} style={{ position: "relative" }}>
                  <button
                    onClick={() => setMenuOpen(o => !o)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: "var(--white)",
                      border: "1px solid var(--rule)",
                      borderRadius: 20,
                      padding: "5px 12px 5px 6px",
                      cursor: "pointer",
                      fontSize: "0.8125rem",
                      color: "var(--ink)",
                      fontWeight: 500,
                    }}
                  >
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: "var(--ink)", color: "var(--white)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.75rem", fontWeight: 700, flexShrink: 0,
                    }}>
                      {user.email[0].toUpperCase()}
                    </div>
                    {user.email.split("@")[0]}
                  </button>

                  {menuOpen && (
                    <div style={{
                      position: "absolute", top: "calc(100% + 8px)", right: 0,
                      background: "var(--white)",
                      border: "1px solid var(--rule)",
                      borderRadius: 10,
                      minWidth: 180,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                      overflow: "hidden",
                      zIndex: 200,
                    }}>
                      <div style={{
                        padding: "10px 16px",
                        borderBottom: "1px solid var(--rule)",
                        fontSize: "0.8125rem",
                        color: "var(--ink-muted)",
                      }}>
                        {user.email}
                      </div>
                      <button
                        onClick={handleSignOut}
                        style={{
                          display: "block", width: "100%",
                          textAlign: "left",
                          padding: "10px 16px",
                          background: "none", border: "none",
                          fontSize: "0.875rem", color: "var(--ink-soft)",
                          cursor: "pointer",
                        }}
                      >
                        Sign out
                      </button>
                      <button
                        onClick={() => { setShowDeleteConfirm(true); setMenuOpen(false); }}
                        style={{
                          display: "block", width: "100%",
                          textAlign: "left",
                          padding: "10px 16px",
                          background: "none",
                          borderTop: "1px solid var(--rule)",
                          border: "none",
                          borderTop: "1px solid var(--rule)",
                          fontSize: "0.875rem", color: "#c0392b",
                          cursor: "pointer",
                        }}
                      >
                        Delete account
                      </button>
                    </div>
                  )}
                </div>
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

      {/* Delete account confirmation modal */}
      {showDeleteConfirm && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 20px",
        }}>
          <div style={{
            background: "var(--white)",
            borderRadius: 12,
            padding: "32px",
            maxWidth: 400,
            width: "100%",
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          }}>
            <h3 style={{
              fontFamily: "'Lora', serif",
              fontSize: "1.25rem",
              color: "var(--ink)",
              margin: "0 0 12px",
            }}>
              Delete your account?
            </h3>
            <p style={{
              fontSize: "0.875rem",
              color: "var(--ink-soft)",
              margin: "0 0 24px",
              lineHeight: 1.6,
            }}>
              This will permanently delete your account and all your data. This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                style={{
                  padding: "9px 20px",
                  borderRadius: 6,
                  border: "1px solid var(--rule)",
                  background: "none",
                  fontSize: "0.875rem",
                  color: "var(--ink-soft)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                style={{
                  padding: "9px 20px",
                  borderRadius: 6,
                  border: "none",
                  background: "#c0392b",
                  color: "white",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: deleting ? "not-allowed" : "pointer",
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? "Deleting..." : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
