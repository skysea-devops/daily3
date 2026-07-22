"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/Guards";
import { updateDisplayName, changePassword } from "@/lib/cognito";
import { cancelBillingSubscription, getBillingSubscription, switchBillingCycle, resumeSubscription } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL!;

const mutedPill: React.CSSProperties = {
  flexShrink: 0, padding: "7px 14px", borderRadius: 999,
  border: "1px solid var(--rule)", background: "var(--paper)",
  fontSize: "0.8125rem", fontWeight: 600, color: "var(--ink-muted)",
};

// Lemon Squeezy checkout linkleri build sırasında inline edilir. Prod'da bu
// değişkenler henüz tanımlı olmadığından upgrade butonları yerine "Coming soon"
// gösterilir; dev'de tanımlı oldukları için checkout akışı aynen çalışır.
const CHECKOUT_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_LS_CHECKOUT_MONTHLY &&
  process.env.NEXT_PUBLIC_LS_CHECKOUT_YEARLY
);

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
          This will cancel future subscription renewals first, then permanently delete your account and all your data. Your current payment will not be refunded, and access ends immediately because the account is removed.
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
          Your subscription will stop renewing. You&apos;ll keep Pro access until the end of your current billing period, and no automatic refund will be issued.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button onClick={onCancel} disabled={busy} style={{ padding: "9px 20px", borderRadius: 6, border: "1px solid var(--rule)", background: "none", fontSize: "0.875rem", color: "var(--ink-soft)", cursor: "pointer" }}>Keep Pro</button>
          <button onClick={onConfirm} disabled={busy} style={{ padding: "9px 20px", borderRadius: 6, border: "none", background: "var(--ink)", color: "white", fontSize: "0.875rem", fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1 }}>
            {busy ? "Cancelling..." : "Cancel subscription"}
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
  const [subscription, setSubscription] = useState<Awaited<ReturnType<typeof getBillingSubscription>> | null>(null);
  const [billingStatus, setBillingStatus] = useState<"loading" | "ready" | "error">("loading");
  const [billingNotice, setBillingNotice] = useState("");

  const displayName = user?.email?.split("@")[0] ?? "";

  // Pro kullanıcının abonelik durumunu güncel olarak çek. loadBilling ayrıca
  // "Retry" için de kullanılır. billingStatus: loading|ready|error → butonlar
  // yalnızca "ready"de render edilir (flicker yok, hata durumunda aksiyon yok).
  const loadBilling = useCallback(async () => {
    if (!user?.accessToken) return;
    setBillingStatus("loading");
    setBillingError("");
    try {
      const value = await getBillingSubscription(user.accessToken);
      setSubscription(value);
      setBillingStatus("ready");
    } catch (error: any) {
      setBillingError(error?.message || "Couldn't load your billing details.");
      setBillingStatus("error");
    }
  }, [user]);

  useEffect(() => {
    if (!user?.accessToken || plan !== "pro") return;
    void loadBilling();
  }, [user, plan, loadBilling]);

  // Lemon Squeezy Checkout dönüşü: ?checkout=success | ?checkout=cancel
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (checkout === "success") {
      setBanner("success");
      window.history.replaceState({}, "", "/settings");

      // Checkout dönüşü webhook'tan önce gelebilir. Profili artan aralıklarla
      // yeniden okuyarak kullanıcıyı sayfayı yenilemeye zorlamadan Pro'ya geçir.
      const delays = [0, 1500, 3000, 5000, 8000, 12000];
      const timers = delays.map((delay) =>
        window.setTimeout(() => { void refreshSession(); }, delay)
      );
      return () => timers.forEach((timer) => window.clearTimeout(timer));
    }
    if (checkout === "cancel") {
      setBanner("cancel");
      window.history.replaceState({}, "", "/settings");
    }
  }, [refreshSession]);

  // Kayıt akışından gelen Pro niyeti: /settings?upgrade=monthly|yearly → otomatik checkout
  useEffect(() => {
    const upgrade = new URLSearchParams(window.location.search).get("upgrade");
    if (upgrade !== "monthly" && upgrade !== "yearly") return;
    if (!user || plan !== "free" || !CHECKOUT_CONFIGURED) return;
    window.history.replaceState({}, "", "/settings");
    handleUpgrade(upgrade);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, plan]);

  function handleUpgrade(billing: "monthly" | "yearly") {
    if (!user || billingBusy) return;
    // Checkout'u cogletta içindeki hub'a taşı: hub, LS'i yeni sekmede açar ve
    // bu (settings) sekmesi cogletta'da kalır. Popup engeli hub'daki tıklamayla aşılır.
    router.push(`/checkout-complete?plan=${billing}`);
  }

  async function handleManageBilling() {
    if (!user?.accessToken || billingBusy) return;
    setBillingBusy(true); setBillingError(""); setModal(null);
    try {
      const current = await getBillingSubscription(user.accessToken);
      setSubscription(current);
      if (!current.portalUrl) throw new Error("Billing portal is not available for this subscription.");
      window.location.href = current.portalUrl;
    } catch (error: any) {
      setBillingError(error?.message || "Could not open billing portal.");
      setBillingBusy(false);
    }
  }

  async function handleCancelSubscription() {
    if (!user?.accessToken || billingBusy) return;
    setBillingBusy(true); setBillingError("");
    try {
      const result = await cancelBillingSubscription(user.accessToken);
      setSubscription((current) => current ? { ...current, cancelled: true, status: result.status, endsAt: result.endsAt } : current);
      setModal(null);
    } catch (error: any) {
      setBillingError(error?.message || "Could not cancel subscription.");
    } finally {
      setBillingBusy(false);
    }
  }

  // Aylık↔Yıllık geçiş: LS variant-swap (PATCH /me/subscription). Aynı abonelik ID
  // korunur, proration LS'te otomatik. Eski "önce iptal et, yeni checkout aç" akışı
  // yok — çift abonelik / iade riski ortadan kalktı.
  async function handleSwitchBillingCycle(target: "monthly" | "yearly") {
    if (!user?.accessToken || billingBusy) return;
    const priceLine = target === "yearly" ? "$58/year" : "$5.80/month";
    const confirmed = window.confirm(
      `Switch to ${target} billing (${priceLine})? Your plan changes right away and the difference ` +
      "is prorated automatically — no second subscription is created."
    );
    if (!confirmed) return;

    setBillingBusy(true); setBillingError(""); setBillingNotice("");
    try {
      const updated = await switchBillingCycle(target, user.accessToken);
      setSubscription((cur) => cur ? {
        ...cur,
        billingCycle: updated.billingCycle,
        status: updated.status,
        renewsAt: updated.renewsAt ?? cur.renewsAt,
        endsAt: updated.endsAt ?? cur.endsAt,
      } : cur);
      setBillingNotice(`You're now on ${target} billing.`);
      await refreshSession();
    } catch (error: any) {
      setBillingError(error?.message || "Could not switch billing cycle. Please try again.");
    } finally {
      setBillingBusy(false);
    }
  }

  // Resume: iptal edilmiş (ama henüz expired olmamış) aboneliği geri al.
  async function handleResumeSubscription() {
    if (!user?.accessToken || billingBusy) return;
    setBillingBusy(true); setBillingError(""); setBillingNotice("");
    try {
      const updated = await resumeSubscription(user.accessToken);
      setSubscription((cur) => cur ? {
        ...cur,
        cancelled: false,
        status: updated.status,
        renewsAt: updated.renewsAt ?? cur.renewsAt,
        endsAt: updated.endsAt ?? cur.endsAt,
      } : cur);
      setBillingNotice("Your subscription has been resumed — it will renew as normal.");
      await refreshSession();
    } catch (error: any) {
      setBillingError(error?.message || "Could not resume subscription. Please try again.");
    } finally {
      setBillingBusy(false);
    }
  }

  // "Current plan" satır metni: duruma göre cycle + fiyat / cancels-on / past due.
  function currentPlanText(): string {
    if (plan !== "pro") return "Free";
    if (billingStatus !== "ready" || !subscription) return "Cogletta Pro";
    const cycleLabel = subscription.billingCycle === "yearly" ? "Yearly"
      : subscription.billingCycle === "monthly" ? "Monthly" : "";
    const price = subscription.billingCycle === "yearly" ? "$58/year"
      : subscription.billingCycle === "monthly" ? "$5.80/month" : "";
    if (String(subscription.status).toLowerCase() === "past_due") return "Cogletta Pro — Payment past due";
    if (subscription.cancelled) {
      const d = subscription.endsAt ? new Date(subscription.endsAt).toLocaleDateString() : "the end of the period";
      return cycleLabel ? `Cogletta Pro — ${cycleLabel} · Cancels on ${d}` : `Cogletta Pro — Cancels on ${d}`;
    }
    return cycleLabel ? `Cogletta Pro — ${cycleLabel} · ${price}` : "Cogletta Pro";
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
          <Row label="Current plan" value={currentPlanText()} />
          {plan === "free" && CHECKOUT_CONFIGURED && (
            <Row topBorder label="Upgrade to Pro" description="3 articles per interest, sub-topics, weekly trend reports. Yearly saves two months.">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <ActionBtn label={billingBusy ? "Redirecting…" : "Yearly · $58"} onClick={() => handleUpgrade("yearly")} disabled={billingBusy} style="accent" />
                <ActionBtn label="Monthly · $5.80" onClick={() => handleUpgrade("monthly")} disabled={billingBusy} />
              </div>
            </Row>
          )}
          {plan === "free" && !CHECKOUT_CONFIGURED && (
            <Row topBorder label="Cogletta Pro" description="3 articles per interest, sub-topics, and weekly trend reports. Launching very soon — stay tuned.">
              <span style={{
                flexShrink: 0, padding: "7px 14px", borderRadius: 999,
                border: "1px solid var(--rule)", background: "var(--paper)",
                fontSize: "0.8125rem", fontWeight: 600, color: "var(--ink-muted)",
              }}>
                Coming soon
              </span>
            </Row>
          )}
          {plan === "pro" && billingStatus === "error" && (
            <Row topBorder label="Billing" description="Couldn't load your billing details.">
              <ActionBtn label={billingBusy ? "Retrying…" : "Retry"} onClick={() => void loadBilling()} disabled={billingBusy} />
            </Row>
          )}
          {plan === "pro" && billingStatus !== "error" && (
            <>
              <Row topBorder label="Billing cycle" description="Change between monthly and yearly anytime. The switch applies immediately.">
                {billingStatus !== "ready" || !subscription ? (
                  <span style={mutedPill}>Loading…</span>
                ) : subscription.cancelled ? (
                  <span style={mutedPill}>Unavailable while cancelled</span>
                ) : subscription.billingCycle === "monthly" ? (
                  <ActionBtn label={billingBusy ? "Switching…" : "Switch to yearly"} onClick={() => handleSwitchBillingCycle("yearly")} disabled={billingBusy} style="accent" />
                ) : subscription.billingCycle === "yearly" ? (
                  <ActionBtn label={billingBusy ? "Switching…" : "Switch to monthly"} onClick={() => handleSwitchBillingCycle("monthly")} disabled={billingBusy} />
                ) : (
                  <span style={mutedPill}>—</span>
                )}
              </Row>
              <Row topBorder label="Payment method & invoices" description="Open a secure link to update your payment method and view invoices.">
                <ActionBtn label={billingBusy ? "Opening…" : "Manage"} onClick={handleManageBilling} disabled={billingBusy || billingStatus !== "ready"} />
              </Row>
              <Row topBorder
                label={billingStatus === "ready" && subscription?.cancelled ? "Subscription cancelled" : "Cancel subscription"}
                description={
                  billingStatus === "ready" && subscription?.cancelled
                    ? `Pro stays active until ${subscription.endsAt ? new Date(subscription.endsAt).toLocaleDateString() : "the end of the billing period"}. Resume anytime before then to keep your subscription — you won't be charged again until it renews.`
                    : "You'll keep Pro until the end of your billing period."
                }>
                {billingStatus === "ready" && (subscription?.cancelled
                  ? <ActionBtn label={billingBusy ? "Resuming…" : "Resume subscription"} onClick={handleResumeSubscription} disabled={billingBusy} style="accent" />
                  : <ActionBtn label="Cancel Pro" onClick={() => setModal("cancelPro")} disabled={billingBusy} style="danger" />)}
              </Row>
            </>
          )}
          {plan === "pro" && billingStatus === "ready" && billingNotice && (
            <div style={{ padding: "0 20px 16px" }}>
              <p style={{ fontSize: "0.8125rem", color: "#166534", margin: 0 }}>{billingNotice}</p>
            </div>
          )}
          {billingError && billingStatus !== "error" && (
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
      {modal === "cancelPro" && <CancelProModal onConfirm={handleCancelSubscription} onCancel={() => setModal(null)} busy={billingBusy} />}
    </div>
  );
}

export default function SettingsPage() {
  return <RequireAuth><SettingsContent /></RequireAuth>;
}
