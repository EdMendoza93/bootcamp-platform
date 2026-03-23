"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { useToast } from "@/components/ui/ToastProvider";

type ApplicationStatus = "pending" | "approved" | "rejected";

type ExistingApplication = {
  id: string;
  fullName: string;
  age: string;
  phone: string;
  goal: string;
  experience: string;
  medicalNotes: string;
  status: ApplicationStatus;
};

export default function ApplicationPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [existingApplication, setExistingApplication] =
    useState<ExistingApplication | null>(null);

  const [form, setForm] = useState({
    fullName: "",
    age: "",
    phone: "",
    goal: "",
    experience: "",
    medicalNotes: "",
  });

  const { showToast } = useToast();

  const loadApplication = async (currentUserId: string) => {
    const q = query(
      collection(db, "applications"),
      where("userId", "==", currentUserId)
    );

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const docItem = snapshot.docs[0];
      const data = docItem.data() as Omit<ExistingApplication, "id">;

      setExistingApplication({
        id: docItem.id,
        ...data,
      });
    } else {
      setExistingApplication(null);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadApplicationPage = async () => {
      try {
        await auth.authStateReady();

        const currentUser = auth.currentUser;

        if (!currentUser) {
          window.location.replace("/login");
          return;
        }

        if (cancelled) return;

        setUserId(currentUser.uid);
        await loadApplication(currentUser.uid);
      } catch (error) {
        console.error("Application page error:", error);
        showToast({
          title: "Could not load application",
          description: "Please try refreshing the page.",
          type: "error",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadApplicationPage();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const refreshStatus = async () => {
    if (!userId) return;

    setRefreshing(true);
    try {
      await loadApplication(userId);
      showToast({
        title: "Status refreshed",
        description: "Your application status is up to date.",
        type: "success",
      });
    } catch (error) {
      console.error("Refresh application error:", error);
      showToast({
        title: "Refresh failed",
        description: "Could not refresh your application status.",
        type: "error",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const submitApplication = async () => {
    if (!userId) return;

    const payload = {
      fullName: form.fullName.trim(),
      age: form.age.trim(),
      phone: form.phone.trim(),
      goal: form.goal.trim(),
      experience: form.experience.trim(),
      medicalNotes: form.medicalNotes.trim(),
    };

    if (
      !payload.fullName ||
      !payload.age ||
      !payload.phone ||
      !payload.goal ||
      !payload.experience
    ) {
      showToast({
        title: "Missing information",
        description: "Please complete all required fields.",
        type: "error",
      });
      return;
    }

    setSubmitting(true);

    try {
      await addDoc(collection(db, "applications"), {
        userId,
        ...payload,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      await loadApplication(userId);

      showToast({
        title: "Application submitted",
        description: "Your application is now under review.",
        type: "success",
      });
    } catch (error) {
      console.error("Submit application error:", error);
      showToast({
        title: "Submission failed",
        description: "Could not submit your application.",
        type: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const statusText = useMemo(() => {
    if (!existingApplication) return "";

    if (existingApplication.status === "pending") {
      return "Your application has been submitted and is currently under review.";
    }

    if (existingApplication.status === "approved") {
      return "Your application has been approved. Continue in your dashboard for the next steps.";
    }

    return "Your application was not approved at this time.";
  }, [existingApplication]);

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">
          Loading your application...
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-4xl space-y-8 pb-28">
        <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="bg-gradient-to-r from-[#071120] via-[#123b76] to-[#2EA0FF] p-[1px]">
            <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
          </div>

          <div className="relative overflow-hidden p-6 md:p-8">
            <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#2EA0FF]/10 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-emerald-300/10 blur-3xl" />

            <div className="relative">
              <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
                Wild Atlantic Bootcamp
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                Bootcamp Application
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
                Complete your application to join the program. Once submitted,
                the team will review your details and guide you through the next
                steps.
              </p>
            </div>
          </div>
        </section>

        {existingApplication ? (
          <>
            <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-8">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="max-w-2xl">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                    Current status
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-semibold text-slate-950">
                      {formatStatusLabel(existingApplication.status)}
                    </h2>
                    <StatusBadge status={existingApplication.status} />
                  </div>

                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {statusText}
                  </p>
                </div>

                <a
                  href="/dashboard"
                  className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-5 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                >
                  Go to Dashboard
                </a>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-8">
              <SectionHeader
                eyebrow="Submitted details"
                title="Application Summary"
                description="Here is the information currently attached to your application."
              />

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <InfoCard label="Name" value={existingApplication.fullName || "—"} />
                <InfoCard label="Age" value={existingApplication.age || "—"} />
                <InfoCard label="Phone" value={existingApplication.phone || "—"} />
                <InfoCard label="Goal" value={existingApplication.goal || "—"} />
              </div>

              <div className="mt-4 rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
                <p className="text-sm font-semibold text-slate-700">
                  Training experience
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {existingApplication.experience || "—"}
                </p>
              </div>

              <div className="mt-4 rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
                <p className="text-sm font-semibold text-slate-700">
                  Medical notes
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {existingApplication.medicalNotes || "None provided"}
                </p>
              </div>
            </section>
          </>
        ) : (
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-8">
            <SectionHeader
              eyebrow="Application form"
              title="Your Details"
              description="Fill in the information below to submit your application."
            />

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <FieldGroup label="Full name" required>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  placeholder="Your full name"
                  value={form.fullName}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, fullName: e.target.value }))
                  }
                />
              </FieldGroup>

              <FieldGroup label="Age" required>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  placeholder="Your age"
                  value={form.age}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, age: e.target.value }))
                  }
                />
              </FieldGroup>

              <FieldGroup label="Phone" required className="md:col-span-2">
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  placeholder="Phone number"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                />
              </FieldGroup>

              <FieldGroup label="Main goal" required className="md:col-span-2">
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  placeholder="What would you like to achieve?"
                  value={form.goal}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, goal: e.target.value }))
                  }
                />
              </FieldGroup>
            </div>

            <div className="mt-4 grid gap-4">
              <FieldGroup label="Training experience" required>
                <textarea
                  className="min-h-[150px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  placeholder="Tell us about your previous training experience"
                  value={form.experience}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, experience: e.target.value }))
                  }
                />
              </FieldGroup>

              <FieldGroup label="Medical notes">
                <textarea
                  className="min-h-[150px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  placeholder="Injuries, medical notes, or any relevant information"
                  value={form.medicalNotes}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      medicalNotes: e.target.value,
                    }))
                  }
                />
              </FieldGroup>
            </div>
          </section>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {existingApplication
                ? "Check your application status"
                : "Submit your application"}
            </p>
            <p className="text-xs text-slate-500">
              {existingApplication
                ? "Refresh to see if anything has changed."
                : "Make sure your information is complete before submitting."}
            </p>
          </div>

          <div className="flex gap-3">
            <a
              href="/dashboard"
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              Back
            </a>

            {existingApplication ? (
              <button
                onClick={refreshStatus}
                disabled={refreshing}
                className="rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-6 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                {refreshing ? "Refreshing..." : "Refresh Status"}
              </button>
            ) : (
              <button
                onClick={submitApplication}
                disabled={submitting}
                className="rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-6 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Application"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
        {title}
      </h2>
      {description && (
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      )}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: ApplicationStatus;
}) {
  const styles: Record<ApplicationStatus, string> = {
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rejected: "border-rose-200 bg-rose-50 text-rose-700",
  };

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {formatStatusLabel(status)}
    </span>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{value}</p>
    </div>
  );
}

function FieldGroup({
  label,
  required,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="ml-1 text-[#1d4ed8]">*</span>}
      </label>
      {children}
    </div>
  );
}

function formatStatusLabel(status: ApplicationStatus) {
  if (status === "pending") return "Pending";
  if (status === "approved") return "Approved";
  return "Not approved";
}