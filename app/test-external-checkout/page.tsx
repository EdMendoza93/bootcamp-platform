"use client";

import { FormEvent, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

type CheckoutResponse = {
  url?: string;
  sessionId?: string;
};

export default function TestExternalCheckoutPage() {
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [durationWeeks, setDurationWeeks] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const createCheckoutSession = httpsCallable<
        {
          customerEmail: string;
          customerName: string;
          durationWeeks: number;
        },
        CheckoutResponse
      >(functions, "createExternalBookingCheckoutSession");

      const result = await createCheckoutSession({
        customerEmail,
        customerName,
        durationWeeks,
      });

      const url = String(result.data?.url || "").trim();

      if (!url) {
        throw new Error("Stripe Checkout URL was not returned.");
      }

      window.location.assign(url);
    } catch (err) {
      console.error("External checkout test error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not create the external checkout session."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-50">
      <div className="mx-auto max-w-2xl rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.45)] backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
          Stripe Test
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-white">
          External booking checkout
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
          Use this page to test the external purchase flow. A successful payment
          should create a redeemable entitlement and trigger the email send.
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-200">
              Customer email
            </span>
            <input
              required
              type="email"
              value={customerEmail}
              onChange={(event) => setCustomerEmail(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400"
              placeholder="you@example.com"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-200">
              Customer name
            </span>
            <input
              type="text"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400"
              placeholder="Optional"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-200">
              Duration
            </span>
            <select
              value={durationWeeks}
              onChange={(event) => setDurationWeeks(Number(event.target.value))}
              className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400"
            >
              <option value={1}>1 week</option>
              <option value={2}>2 weeks</option>
              <option value={3}>3 weeks</option>
            </select>
          </label>

          {error ? (
            <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Creating checkout..." : "Open Stripe Checkout"}
          </button>
        </form>
      </div>
    </main>
  );
}
