"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/Guards";
import { updateDisplayName, changePassword } from "@/lib/cognito";
import { createCheckoutSession, createPortalSession } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL!;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Section({ title, danger, children }: { title: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{
        fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.1em",
        textTransform: "uppercase", color: danger ? "#c0392b" : "var(--ink-muted)",
        marginBottom: 16,
      }}>
        {title}
      </h2>
      <div style={{
        background: "var(--white)",
        border: `1px solid ${danger ? "#fecaca" : "var(--rule)"}`,
        borderRadius: 12, overflow: "hidden",
      }}>
        {children}
      </div>
    </section>
  );
}

function Row({
  label, value, description, topBorder, children,
}: {
  label: string;
  value?: string;
  description?: string;
  topBorder?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div style={{
      padding: "16px 20px",
      borderTop: topBorder ? "1px solid var(--rule)" : undefined,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--ink)", marginBottom: value || description ? 2 : 0 }}>{label}</p>
          {value && <p style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>{value}</p>}
          {description && <p style={{ fontSize: "0.8125rem", color: "var(--ink-muted)", lineHeight: 1.5, marginTop: 2 }}>{description}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

function ActionBtn({ label, onClick, disabled, style }: { label: string; onClick: () => void; disabled?: boolean; style?: "danger" | "accent" }) {
  const color = style === "danger" ? "#c0392b" : style === "accent" ? "var(--accent)" : "var(--ink-soft)";
  const border = style === "danger" ? "1px solid #fecaca" : "1px solid var(--rule)";
  return (
    <button onClick={onClick} disabled={disabled} style={{
      flexShrink: 0, padding: "7px 14px", borderRadius: 8,
      border, background: "none",
      fontSize: "0.8125rem", fontWeight: 600, color,
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
    }}>
      {label}
    </button>
  );
}

// ─── Inline edit forms ────────────────────────────────────────────────────────

function ChangeNameForm({ currentName, onDone }: { currentName: string; onDone: () => void }) {
  const [name, setName] = useState(currentName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setLoading(true); setError(""); setSuccess(false);
    try {
      const [given, ...rest] = name.trim().split(" ");
      await updateDisplayName(given, rest.join(" "));
      setSuccess(true);
      setTimeout(onDone, 1000);
    } catch (e: any) {
      setError(e?.message || "Failed to update name.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Your name"
        style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid var(--rule)", fontSize: "0.875rem", color: "var(--ink)", background: "var(--white)", outline: "none" }}
      />
      {error && <p style={{ fontSize: "0.8125rem", color: "#c0392b" }}>{error}</p>}
      {success && <p style={{ fontSize: "0.8125rem", color: "#166534" }}>✓ Name updated!</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onDone} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--rule)", background: "none", fontSize: "0.8125rem", color: "var(--ink-muted)", cursor: "pointer" }}>Cancel</button>
        <button onClick={handleSave} disabled={loading} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--ink)", color: "var(--white)", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer", opacity: loading ? 0.6 : 1 }}>
          {loading ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    if (!oldPw || !newPw) return;
    if (newPw !== confirmPw) { setError("New passwords don't match."); return; }
    if (newPw.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true); setError(""); setSuccess(false);
    try {
      await changePassword(oldPw, newPw);
      setSuccess(true);
      setTimeout(onDone, 1200);
    } catch (e: any) {
      setError(e?.message || "Failed to change password.");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = { padding: "10px 14px", borderRadius: 8, border: "1px solid var(--rule)", fontSize: "0.875rem", color: "var(--ink)", background: "var(--white)", outline: "none" };

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <input type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} placeholder="Current password" style={inputStyle} />
      <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password" style={inputStyle} />
      <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Confirm new password" style={inputStyle} />
      {error && <p style={{ fontSize: "0.8125rem", color: "#c0392b" }}>{error}</p>}
      {success && <p style={{ fontSize: "0.8125rem", color: "#166534" }}>✓ Password changed!</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onDone} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--rule)", background: "none", fontSize: "0.8125rem", color: "var(--ink-muted)", cursor: "pointer" }}>Cancel</button>
        <button onClick={handleSave} disabled={loading} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--ink)", color: "var(--white)", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer", opacity: loading ? 0.6 : 1 }}>
          {loading ? "Saving..." : "Change password"}
        </button>
      </div>
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function DeleteModal({ onConfirm, onCancel, deleting }: { onConfirm: () => void; onCancel: () => void; deleting: boolean }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}>
      <div style={{ background: "var(--white)", borderRadius: 12, padding: "32px", maxWidth: 400, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
        <h3 style={{ fontFamily: "'Lora', serif", fontSize: "1.25rem", color: "var(--ink)", margin: "0 0 12px" }}>Delete your account?</h3>
        <p style={{ fontSize: "0.875rem", color: "var(--ink-soft)", margin: "0 0 24px", lineHeight: 1.6 }}>
          This will permanently delete your account and all your data. This action cannot be undone.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button onClick={onCancel} disabled={deleting} style={{ padding: "9px 20px", borderRadius: 6, border: "1px solid var(--rule)", background: "none", fontSize: "0.875rem", color: "var(--ink-soft)", cursor: "pointer" }}>Cancel</button>
          <button onClick={onConfirm} disabled={deleting} style={{ padding: "9px 20px", borderRadius: 6, border: "none", background: "#c0392b", color: "white", fontSize: "0.875rem", fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.7 : 1 }}>
            {deleting ? "Deleting..." : "Delete account"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CancelProModal({ onConfirm, onCancel, busy }: { onConfirm: () => void; onCancel: () => void; busy: boolean }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}>
      <div style={{ background: "var(--white)", borderRadius: 12, padding: "32px", maxWidth: 400, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
        <h3 style={{ fontFamily: "'Lora', serif", fontSize: "1.25rem", color: "var(--ink)", margin: "0 0 12px" }}>Manage your subscription</h3>
        <p style={{ fontSize: "0.875rem", color: "var(--ink-soft)", margin: "0 0 24px", lineHeight: 1.6 }}>
          You&apos;ll be taken to our secure billing portal, where you can cancel your plan, update your card, or download invoices. If you cancel, you&apos;ll keep Pro access until the end of your billing period.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button onClick={onCancel} disabled={busy} style={{ padding: "9px 20px", borderRadius: 6, border: "1px solid var(--rule)", background: "none", fontSize: "0.875rem", color: "var(--ink-soft)", cursor: "pointer" }}>Keep Pro</button>
          <button onClick={onConfirm} disabled={busy} style={{ padding: "9px 20px", borderRadius: 6, border: "none", background: "var(--ink)", color: "white", fontSize: "0.875rem", fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1 }}>
            {busy ? "Opening..." : "Open billing portal"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function SettingsContent() {
  const { user, plan, signOut, refreshSession } = useAuth();
  const router = useRouter();

  const [editName, setEditName]         = useState(false);
  const [editPassword, setEditPassword] = useState(false);
  const [modal, setModal]               = useState<"delete" | "cancelPro" | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [billingBusy, setBillingBusy]   = useState(false);
  const [billingError, setBillingError] = useState("");
  const [banner, setBanner]             = useState<"success" | "cancel" | null>(null);

  const displayName = user?.email?.split("@")[0] ?? "";

  // Stripe Checkout dönüşü: ?checkout=success | ?checkout=cancel
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (checkout === "success") {
      setBanner("success");
      // plan webhook ile güncelleniyor — session'ı hemen ve birkaç saniye sonra tazele
      refreshSession();
      const t = setTimeout(() => refreshSession(), 3000);
      window.history.replaceState({}, "", "/settings");
      return () => clearTimeout(t);
    }
    if (checkout === "cancel") {
      setBanner("cancel");
      window.history.replaceState({}, "", "/settings");
    }
  }, [refreshSession]);

  async function handleUpgrade() {
    if (!user?.accessToken || billingBusy) return;
    setBillingBusy(true); setBillingError("");
    try {
      const { url } = await createCheckoutSession(user.accessToken, user.email);
      window.location.href = url;
    } catch (e: any) {
      setBillingError(e?.message || "Something went wrong. Please try again.");
      setBillingBusy(false);
    }
  }

  async function handleManageBilling() {
    if (!user?.accessToken || billingBusy) return;
    setBillingBusy(true); setBillingError("");
    try {
      const { url } = await createPortalSession(user.accessToken);
      window.location.href = url;
    } catch (e: any) {
      setBillingError(e?.message || "Something went wrong. Please try again.");
      setBillingBusy(false);
      setModal(null);
    }
  }

  async function handleDeleteAccount() {
    if (!user?.accessToken) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/me`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      if (res.ok) { signOut(); router.push("/"); }
      else alert("Something went wrong. Please try again.");
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setDeleting(false);
      setModal(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <Navbar />
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "56px 5vw" }}>

        <h1 style={{ fontFamily: "'Lora', serif", fontSize: "2rem", fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>Settings</h1>
        <p style={{ fontSize: "0.9375rem", color: "var(--ink-soft)", marginBottom: 48 }}>Manage your account and preferences.</p>

        {banner === "success" && (
          <div style={{ marginBottom: 32, padding: "14px 18px", borderRadius: 10, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <p style={{ fontSize: "0.875rem", color: "#166534", margin: 0, lineHeight: 1.5 }}>
              ✓ Welcome to Cogletta Pro! Your upgrade is confirmed — it may take a few seconds to appear below.
            </p>
          </div>
        )}
        {banner === "cancel" && (
          <div style={{ marginBottom: 32, padding: "14px 18px", borderRadius: 10, background: "var(--white)", border: "1px solid var(--rule)" }}>
            <p style={{ fontSize: "0.875rem", color: "var(--ink-soft)", margin: 0, lineHeight: 1.5 }}>
              Checkout was cancelled — no changes were made. You can upgrade any time.
            </p>
          </div>
        )}

        {/* Profile */}
        <Section title="Profile">
          <Row label="Email" value={user?.email} />

          <div style={{ padding: "16px 20px", borderTop: "1px solid var(--rule)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--ink)", marginBottom: 2 }}>Display name</p>
                <p style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>{displayName}</p>
              </div>
              {!editName && <ActionBtn label="Change" onClick={() => { setEditName(true); setEditPassword(false); }} />}
            </div>
            {editName && <ChangeNameForm currentName={displayName} onDone={() => setEditName(false)} />}
          </div>

          <div style={{ padding: "16px 20px", borderTop: "1px solid var(--rule)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--ink)", marginBottom: 2 }}>Password</p>
                <p style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>••••••••</p>
              </div>
              {!editPassword && <ActionBtn label="Change" onClick={() => { setEditPassword(true); setEditName(false); }} />}
            </div>
            {editPassword && <ChangePasswordForm onDone={() => setEditPassword(false)} />}
          </div>
        </Section>

        {/* Plan & Billing */}
        <Section title="Plan & Billing">
          <Row label="Current plan" value={plan === "pro" ? "Cogletta Pro — $4.80/month" : "Free"} />
          {plan === "free" && (
            <Row topBorder label="Upgrade to Pro" description="3 articles per interest, sub-topics, weekly trend reports.">
              <ActionBtn label={billingBusy ? "Redirecting…" : "Upgrade →"} onClick={handleUpgrade} disabled={billingBusy} style="accent" />
            </Row>
          )}
          {plan === "pro" && (
            <>
              <Row topBorder label="Payment method" description="Update your card, view invoices, and manage billing in the secure Stripe portal.">
                <ActionBtn label={billingBusy ? "Opening…" : "Manage"} onClick={handleManageBilling} disabled={billingBusy} />
              </Row>
              <Row topBorder label="Cancel subscription" description="You'll keep Pro until the end of your billing period.">
                <ActionBtn label="Cancel Pro" onClick={() => setModal("cancelPro")} disabled={billingBusy} style="danger" />
              </Row>
            </>
          )}
          {billingError && (
            <div style={{ padding: "0 20px 16px" }}>
              <p style={{ fontSize: "0.8125rem", color: "#c0392b", margin: 0 }}>{billingError}</p>
            </div>
          )}
        </Section>

        {/* Notifications */}
        <Section title="Notifications">
          <Row label="Daily digest email" description="Receive your curated content every morning." />
          {plan === "pro" && (
            <Row topBorder label="Weekly trend report" description="A summary of the week's most important stories, every Sunday." />
          )}
        </Section>

        {/* Danger zone */}
        <Section title="Danger zone" danger>
          <Row label="Delete account" description="Permanently delete your account and all your data. This cannot be undone.">
            <ActionBtn label="Delete account" onClick={() => setModal("delete")} style="danger" />
          </Row>
        </Section>

      </main>

      {modal === "delete" && <DeleteModal onConfirm={handleDeleteAccount} onCancel={() => setModal(null)} deleting={deleting} />}
      {modal === "cancelPro" && <CancelProModal onConfirm={handleManageBilling} onCancel={() => setModal(null)} busy={billingBusy} />}
    </div>
  );
}

export default function SettingsPage() {
  return <RequireAuth><SettingsContent /></RequireAuth>;
}
