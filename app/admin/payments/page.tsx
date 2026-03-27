"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
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

  const connectionState = useMemo(() => {
    if (!settings?.stripeAccountId) return "not_connected";
    if (settings.onboardingComplete && settings.chargesEnabled) return "ready";
    return "incomplete";
  }, [settings]);

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
              Stripe Connect Readiness
            </h1>

            <p className="mt-3 max-w-3xl text-sm text-slate-600 md:text-base">
              This area is designed so the bootcamp owner can connect Stripe directly inside the app, without sharing secret keys with you as the developer.
            </p>
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
          label="Payouts"
          value={settings?.payoutsEnabled ? "Enabled" : "Not Enabled"}
          tone={settings?.payoutsEnabled ? "success" : "light"}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <h2 className="text-xl font-semibold text-slate-950">Owner-controlled setup</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            The intended flow is that the bootcamp owner signs in here, clicks Connect Stripe, and completes onboarding with Stripe directly. No manual sharing of secret keys should be required.
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
              label="Last update"
              value={formatTimestamp(settings?.updatedAt)}
            />
          </div>

          <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-semibold text-amber-900">Current status</p>
            <p className="mt-2 text-sm leading-6 text-amber-800">
              This page is the payments foundation only. The real Stripe Connect onboarding button and webhook lifecycle are the next implementation step.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
            <h2 className="text-xl font-semibold text-slate-950">Architecture decisions</h2>
            <div className="mt-5 space-y-3">
              <RuleCard title="Owner connects Stripe directly">
                The platform should open Stripe onboarding from the admin panel so the owner authorizes and completes setup without giving you secret keys.
              </RuleCard>
              <RuleCard title="Developer should not hold Stripe secrets">
                Secrets belong in the deployment environment of the project, not in your personal Stripe account or shared manually over chat.
              </RuleCard>
              <RuleCard title="Bookings will link to payments">
                Each booking will eventually store Stripe payment references such as checkout session or payment intent IDs.
              </RuleCard>
              <RuleCard title="Stripe Connect is justified here">
                Even with one bootcamp owner today, Connect helps keep account ownership and onboarding in the owner&apos;s hands.
              </RuleCard>
            </div>
          </div>

          <div className="rounded-[28px] border border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
            <h2 className="text-lg font-semibold text-slate-950">Next implementation step</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Build the real Connect onboarding flow: create account link, return link, refresh link, and webhook synchronization into <code>settings/payments</code>.
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
