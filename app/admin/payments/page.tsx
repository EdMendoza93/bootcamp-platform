"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { useToast } from "@/components/ui/ToastProvider";

type PaymentsSettings = {
  stripeAccountId?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  onboardingComplete?: boolean;
  accountEmail?: string;
  country?: string;
  currency?: string;
  accountType?: "standard";
  connectionMode?: "oauth";
  livemode?: boolean;
  scope?: string;
  provider?: "stripe_connect";
  updatedAt?: {
    seconds?: number;
    nanoseconds?: number;
  };
};

function formatTimestamp(
  value?: {
    seconds?: number;
    nanoseconds?: number;
  }
) {
  if (!value?.seconds) return "Not updated yet";

  return new Date(value.seconds * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminPaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [settings, setSettings] = useState<PaymentsSettings | null>(null);

  const { showToast } = useToast();

  const loadSettings = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, "settings", "payments"));
      setSettings(snap.exists() ? (snap.data() as PaymentsSettings) : null);
    } catch (error) {
      console.error("Load payments settings error:", error);
      showToast({
        title: "Could not load payments",
        description: "Please refresh the page.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const stripeError = params.get("error");
    const stripeErrorDescription = params.get("error_description");

    if (stripeError) {
      showToast({
        title: "Stripe connection was not completed",
        description:
          stripeErrorDescription || "The owner cancelled or Stripe returned an error.",
        type: "error",
      });
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (!code || !state) {
      return;
    }

    let cancelled = false;

    const finalizeConnection = async () => {
      try {
        setCompleting(true);

        const completeStripeCall = httpsCallable(
          functions,
          "completeStripeConnectStandard"
        );
        await completeStripeCall({ code, state });

        if (cancelled) return;

        await loadSettings();
        showToast({
          title: "Stripe connected",
          description: "The owner's Stripe account is now linked to this platform.",
          type: "success",
        });
      } catch (error) {
        if (cancelled) return;

        console.error("Complete Stripe connection error:", error);
        showToast({
          title: "Could not complete Stripe connection",
          description: "Please try connecting Stripe again from this page.",
          type: "error",
        });
      } finally {
        if (!cancelled) {
          setCompleting(false);
          window.history.replaceState({}, "", window.location.pathname);
        }
      }
    };

    void finalizeConnection();

    return () => {
      cancelled = true;
    };
  }, [loadSettings, showToast]);

  const connectionState = useMemo(() => {
    if (!settings?.stripeAccountId) return "not_connected";
    if (settings.onboardingComplete && settings.chargesEnabled) return "ready";
    return "incomplete";
  }, [settings]);

  const startStripeConnect = async () => {
    try {
      setConnecting(true);

      const connectStripeCall = httpsCallable(
        functions,
        "createStripeConnectAuthorizeUrl"
      );
      const result = await connectStripeCall();
      const data = (result.data || {}) as { url?: string };

      if (!data.url) {
        throw new Error("Stripe onboarding URL was not returned.");
      }

      window.location.assign(data.url);
    } catch (error) {
      console.error("Connect Stripe error:", error);
      showToast({
        title: "Could not start Stripe onboarding",
        description: "Please verify functions deployment and Stripe configuration.",
        type: "error",
      });
    } finally {
      setConnecting(false);
    }
  };

  const refreshStripeStatus = async () => {
    try {
      setRefreshing(true);

      const refreshStripeCall = httpsCallable(
        functions,
        "refreshStripeConnectStatus"
      );
      await refreshStripeCall();
      await loadSettings();

      showToast({
        title: "Stripe status refreshed",
        description: "Latest Stripe capabilities were loaded successfully.",
        type: "success",
      });
    } catch (error) {
      console.error("Refresh Stripe status error:", error);
      showToast({
        title: "Could not refresh Stripe status",
        description: "Please verify the Stripe account is connected and functions are deployed.",
        type: "error",
      });
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">Loading payments...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
        <div className="bg-gradient-to-r from-[#071120] via-[#123b76] to-[#2EA0FF] p-[1px]">
          <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
        </div>

        <div className="relative overflow-hidden p-6 md:p-8">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#2EA0FF]/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-emerald-300/10 blur-3xl" />

          <div className="relative">
            <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
              Payments
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Stripe Connect Setup
            </h1>

            <p className="mt-3 max-w-3xl text-sm text-slate-600 md:text-base">
              The bootcamp owner can connect Stripe directly from this area. They do not need to send you their Stripe keys or log into Firebase.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={startStripeConnect}
                disabled={connecting || completing}
                className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                {completing
                  ? "Completing connection..."
                  : connecting
                  ? "Opening Stripe..."
                  : connectionState === "not_connected"
                  ? "Connect Stripe"
                  : "Reconnect Stripe"}
              </button>

              <button
                type="button"
                onClick={refreshStripeStatus}
                disabled={refreshing || completing || !settings?.stripeAccountId}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {refreshing ? "Refreshing..." : "Refresh Stripe status"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Provider"
          value={settings?.provider === "stripe_connect" ? "Stripe Connect" : "Pending"}
          tone="blue"
        />
        <SummaryCard
          label="Account Type"
          value={settings?.accountType === "standard" ? "Standard" : "Pending"}
          tone="blue"
        />
        <SummaryCard
          label="Connection"
          value={
            connectionState === "ready"
              ? "Ready"
              : connectionState === "incomplete"
              ? "Incomplete"
              : "Not Connected"
          }
          tone={
            connectionState === "ready"
              ? "success"
              : connectionState === "incomplete"
              ? "warning"
              : "light"
          }
        />
        <SummaryCard
          label="Charges"
          value={settings?.chargesEnabled ? "Enabled" : "Not Enabled"}
          tone={settings?.chargesEnabled ? "success" : "light"}
        />
        <SummaryCard
          label="Mode"
          value={settings?.livemode ? "Live" : settings?.stripeAccountId ? "Test" : "Pending"}
          tone={settings?.livemode ? "success" : "light"}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <h2 className="text-xl font-semibold text-slate-950">Owner-controlled setup</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            The owner signs in here, clicks Connect Stripe, and authorizes their Stripe account with Stripe directly. This keeps onboarding self-service inside admin.
          </p>

          <div className="mt-6 space-y-4">
            <StatusRow
              label="Stripe account"
              value={settings?.stripeAccountId || "Not connected yet"}
            />
            <StatusRow
              label="Account email"
              value={settings?.accountEmail || "Not available yet"}
            />
            <StatusRow
              label="Country"
              value={settings?.country || "Not set"}
            />
            <StatusRow
              label="Settlement currency"
              value={settings?.currency || "Not set"}
            />
            <StatusRow
              label="Access scope"
              value={settings?.scope || "Not connected yet"}
            />
            <StatusRow
              label="Last update"
              value={formatTimestamp(settings?.updatedAt)}
            />
          </div>

          <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-semibold text-amber-900">Current status</p>
            <p className="mt-2 text-sm leading-6 text-amber-800">
              Stripe connection now uses a Standard Connect style flow. The next step after connection is payment session creation and webhook synchronization for booking payments.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
            <h2 className="text-xl font-semibold text-slate-950">Architecture decisions</h2>
            <div className="mt-5 space-y-3">
              <RuleCard title="Owner connects Stripe directly">
                The platform opens Stripe authorization from the admin panel so the owner connects their own Stripe account without handing you credentials.
              </RuleCard>
              <RuleCard title="Client never enters Firebase">
                The owner should only use this admin panel and Stripe&apos;s own screens. They should not have to log into Firebase or touch deployment settings.
              </RuleCard>
              <RuleCard title="Platform configuration happens once">
                This app still needs one Stripe Connect application behind the scenes, but that is product setup, not a per-client key-sharing step.
              </RuleCard>
              <RuleCard title="Bookings will link to payments">
                Each booking will eventually store Stripe references such as a checkout session or payment intent tied to the connected Stripe account.
              </RuleCard>
            </div>
          </div>

          <div className="rounded-[28px] border border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
            <h2 className="text-lg font-semibold text-slate-950">Next implementation step</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Build payment collection on top of the connected Stripe account: create checkout or payment intents for bookings, then sync payment results back through webhooks.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "success" | "warning" | "light";
}) {
  const styles = {
    blue: "border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white",
    success: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white",
    warning: "border-amber-200 bg-gradient-to-br from-amber-50 to-white",
    light: "border-slate-200 bg-white",
  };

  const labelStyles = {
    blue: "text-[#1d4ed8]",
    success: "text-emerald-700",
    warning: "text-amber-700",
    light: "text-slate-500",
  };

  return (
    <div className={`rounded-[24px] border p-5 shadow-[0_14px_40px_rgba(15,23,42,0.07)] ${styles[tone]}`}>
      <p className={`text-sm font-semibold ${labelStyles[tone]}`}>{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
    </div>
  );
}

function StatusRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function RuleCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{children}</p>
    </div>
  );
}
