"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  getDocs,
  query,
  collection,
  updateDoc,
  where,
} from "firebase/firestore";
import { useToast } from "@/components/ui/ToastProvider";

type OnboardingStatus = "none" | "incomplete" | "active";

type ProfileForm = {
  profileId: string;
  fullName: string;
  age: string;
  goal: string;
  height: string;
  weight: string;
  allergies: string;
  injuries: string;
  notes: string;
  onboardingStatus: OnboardingStatus;
  paymentStatus: string;
};

export default function DashboardProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [hasProfile, setHasProfile] = useState(false);

  const [form, setForm] = useState<ProfileForm>({
    profileId: "",
    fullName: "",
    age: "",
    goal: "",
    height: "",
    weight: "",
    allergies: "",
    injuries: "",
    notes: "",
    onboardingStatus: "none",
    paymentStatus: "pending",
  });

  const { showToast } = useToast();

  const loadProfile = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      window.location.replace("/login");
      return;
    }

    setUserEmail(currentUser.email || "");

    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data() as { role?: string };
      if (userData.role === "admin") {
        window.location.replace("/admin");
        return;
      }
    }

    const profileSnapshot = await getDocs(
      query(collection(db, "profiles"), where("userId", "==", currentUser.uid))
    );

    if (profileSnapshot.empty) {
      setHasProfile(false);
      return;
    }

    const profileDoc = profileSnapshot.docs[0];
    const data = profileDoc.data() as Partial<ProfileForm>;

    setHasProfile(true);
    setForm({
      profileId: profileDoc.id,
      fullName: data.fullName || "",
      age: data.age || "",
      goal: data.goal || "",
      height: data.height || "",
      weight: data.weight || "",
      allergies: data.allergies || "",
      injuries: data.injuries || "",
      notes: data.notes || "",
      onboardingStatus:
        (data.onboardingStatus as OnboardingStatus) || "incomplete",
      paymentStatus: data.paymentStatus || "pending",
    });
  };

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        await auth.authStateReady();
        if (!cancelled) {
          await loadProfile();
        }
      } catch (error) {
        console.error("Load dashboard profile error:", error);
        if (!cancelled) {
          showToast({
            title: "Could not load profile",
            description: "Please refresh the page.",
            type: "error",
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const completionState = useMemo(() => {
    const required = [
      form.fullName,
      form.age,
      form.goal,
      form.height,
      form.weight,
    ];
    const completed = required.filter((value) => value.trim()).length;
    const total = required.length;
    const percent = Math.round((completed / total) * 100);

    return {
      completed,
      total,
      percent,
      ready: completed === total,
    };
  }, [form.fullName, form.age, form.goal, form.height, form.weight]);

  const saveProfile = async () => {
    if (!form.profileId) return;

    const payload = {
      fullName: form.fullName.trim(),
      age: form.age.trim(),
      goal: form.goal.trim(),
      height: form.height.trim(),
      weight: form.weight.trim(),
      allergies: form.allergies.trim(),
      injuries: form.injuries.trim(),
      notes: form.notes.trim(),
      onboardingStatus: completionState.ready ? "active" : "incomplete",
    };

    if (!payload.fullName || !payload.age || !payload.goal) {
      showToast({
        title: "Missing required information",
        description: "Please complete full name, age, and goal.",
        type: "error",
      });
      return;
    }

    setSaving(true);

    try {
      await updateDoc(doc(db, "profiles", form.profileId), payload);

      setForm((prev) => ({
        ...prev,
        onboardingStatus: completionState.ready ? "active" : "incomplete",
      }));

      showToast({
        title: "Profile saved",
        description: completionState.ready
          ? "Your profile is complete."
          : "Your changes were saved.",
        type: "success",
      });
    } catch (error) {
      console.error("Save dashboard profile error:", error);
      showToast({
        title: "Save failed",
        description: "Could not save your profile.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">
          Loading your profile...
        </p>
      </div>
    );
  }

  if (!hasProfile) {
    return (
      <div className="mx-auto max-w-4xl">
        <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-8">
          <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
            Profile
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
            Your Profile
          </h1>

          <p className="mt-3 max-w-2xl text-slate-600">
            Your profile has not been created yet. Once the team prepares it,
            you will be able to complete your details here.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              Back to Dashboard
            </a>
          </div>
        </section>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-5xl space-y-8 pb-28">
        <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="bg-gradient-to-r from-[#071120] via-[#123b76] to-[#2EA0FF] p-[1px]">
            <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
          </div>

          <div className="relative overflow-hidden p-6 md:p-8">
            <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#2EA0FF]/10 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-emerald-300/10 blur-3xl" />

            <div className="relative flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
                  My profile
                </div>

                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                  Personal Details
                </h1>

                <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
                  Keep your information updated so your plan, support, and
                  guidance can be tailored properly.
                </p>

                <div className="mt-4 inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm">
                  {userEmail}
                </div>
              </div>

              <a
                href="/dashboard"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                Back to Dashboard
              </a>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <StatusCard label="Profile status" value={formatProfileStatus(form.onboardingStatus)} />
              <StatusCard label="Payment" value={formatPaymentStatus(form.paymentStatus)} />
              <StatusCard
                label="Completion"
                value={`${completionState.percent}%`}
              />
            </div>

            <div className="mt-6 rounded-[24px] border border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#1d4ed8]">
                    Profile progress
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Complete the essential details to fully activate your profile.
                  </p>
                </div>

                <div className="text-sm font-semibold text-slate-900">
                  {completionState.completed}/{completionState.total} completed
                </div>
              </div>

              <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#dbeafe]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] transition-all duration-300"
                  style={{ width: `${completionState.percent}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-8">
          <SectionHeader
            eyebrow="Basic information"
            title="Personal Details"
            description="These details help the team prepare your experience properly."
          />

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <FieldGroup label="Full name" required>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                placeholder="Full name"
                value={form.fullName}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, fullName: e.target.value }))
                }
              />
            </FieldGroup>

            <FieldGroup label="Age" required>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                placeholder="Age"
                value={form.age}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, age: e.target.value }))
                }
              />
            </FieldGroup>

            <FieldGroup label="Height" required>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                placeholder="Height"
                value={form.height}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, height: e.target.value }))
                }
              />
            </FieldGroup>

            <FieldGroup label="Weight" required>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                placeholder="Weight"
                value={form.weight}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, weight: e.target.value }))
                }
              />
            </FieldGroup>

            <FieldGroup label="Main goal" required className="md:col-span-2">
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                placeholder="Main goal"
                value={form.goal}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, goal: e.target.value }))
                }
              />
            </FieldGroup>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-8">
          <SectionHeader
            eyebrow="Health & notes"
            title="Additional Information"
            description="Share anything relevant so your training and support can be adjusted appropriately."
          />

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <FieldGroup label="Allergies">
              <textarea
                className="min-h-[150px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                placeholder="Allergies"
                value={form.allergies}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, allergies: e.target.value }))
                }
              />
            </FieldGroup>

            <FieldGroup label="Injuries">
              <textarea
                className="min-h-[150px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                placeholder="Injuries"
                value={form.injuries}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, injuries: e.target.value }))
                }
              />
            </FieldGroup>

            <FieldGroup label="Notes" className="md:col-span-2">
              <textarea
                className="min-h-[170px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                placeholder="Anything else your coach should know"
                value={form.notes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, notes: e.target.value }))
                }
              />
            </FieldGroup>
          </div>
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Save your profile changes
            </p>
            <p className="text-xs text-slate-500">
              Update your details so your plan stays accurate.
            </p>
          </div>

          <div className="flex gap-3">
            <a
              href="/dashboard"
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              Cancel
            </a>

            <button
              onClick={saveProfile}
              disabled={saving}
              className="rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-6 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Profile"}
            </button>
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
        <p className="mt-2 text-sm text-slate-600">{description}</p>
      )}
    </div>
  );
}

function StatusCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
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

function formatProfileStatus(value: string) {
  if (value === "active") return "Complete";
  if (value === "incomplete") return "Incomplete";
  return "Not ready";
}

function formatPaymentStatus(value: string) {
  if (!value) return "Pending";
  return value.charAt(0).toUpperCase() + value.slice(1);
}