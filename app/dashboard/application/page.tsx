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
    return <p className="p-10">Loading...</p>;
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-gray-500">
            Wild Atlantic Bootcamp
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">
            Bootcamp Application
          </h1>
          <p className="mt-3 text-gray-600">
            Complete your application to join the program.
          </p>
        </div>

        {existingApplication ? (
          <div className="mt-8 rounded-3xl border bg-white p-6 shadow-sm md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-gray-500">
                  Current status
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-bold capitalize">
                    {existingApplication.status}
                  </h2>
                  <StatusBadge status={existingApplication.status} />
                </div>

                <p className="mt-3 text-sm text-gray-600">{statusText}</p>
              </div>

              <a
                href="/dashboard"
                className="inline-flex rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white"
              >
                Go to Dashboard
              </a>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <InfoCard label="Name" value={existingApplication.fullName || "—"} />
              <InfoCard label="Age" value={existingApplication.age || "—"} />
              <InfoCard label="Phone" value={existingApplication.phone || "—"} />
              <InfoCard label="Goal" value={existingApplication.goal || "—"} />
            </div>

            <div className="mt-4 rounded-2xl bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-700">
                Training experience
              </p>
              <p className="mt-2 text-sm text-gray-600">
                {existingApplication.experience || "—"}
              </p>
            </div>

            <div className="mt-4 rounded-2xl bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-700">
                Medical notes
              </p>
              <p className="mt-2 text-sm text-gray-600">
                {existingApplication.medicalNotes || "None provided"}
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={refreshStatus}
                disabled={refreshing}
                className="rounded-xl border bg-white px-4 py-2.5 text-sm font-medium disabled:opacity-50"
              >
                {refreshing ? "Refreshing..." : "Refresh Status"}
              </button>

              <a
                href="/dashboard"
                className="rounded-xl border bg-white px-4 py-2.5 text-sm font-medium"
              >
                Back to Dashboard
              </a>
            </div>
          </div>
        ) : (
          <div className="mt-8 rounded-3xl border bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-xl font-semibold">Your details</h2>
            <p className="mt-2 text-sm text-gray-600">
              Fill in the information below to submit your application.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <input
                className="w-full rounded-xl border p-3"
                placeholder="Full name"
                value={form.fullName}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, fullName: e.target.value }))
                }
              />

              <input
                className="w-full rounded-xl border p-3"
                placeholder="Age"
                value={form.age}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, age: e.target.value }))
                }
              />

              <input
                className="w-full rounded-xl border p-3 md:col-span-2"
                placeholder="Phone"
                value={form.phone}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, phone: e.target.value }))
                }
              />

              <input
                className="w-full rounded-xl border p-3 md:col-span-2"
                placeholder="Main goal"
                value={form.goal}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, goal: e.target.value }))
                }
              />
            </div>

            <div className="mt-4 grid gap-4">
              <textarea
                className="min-h-[140px] w-full rounded-xl border p-3"
                placeholder="Training experience"
                value={form.experience}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, experience: e.target.value }))
                }
              />

              <textarea
                className="min-h-[140px] w-full rounded-xl border p-3"
                placeholder="Medical notes / injuries / relevant info"
                value={form.medicalNotes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, medicalNotes: e.target.value }))
                }
              />
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={submitApplication}
                disabled={submitting}
                className="rounded-xl bg-black px-6 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Application"}
              </button>

              <a
                href="/dashboard"
                className="rounded-xl border bg-white px-6 py-3 text-sm font-medium"
              >
                Cancel
              </a>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function StatusBadge({
  status,
}: {
  status: ApplicationStatus;
}) {
  return (
    <span className="rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium capitalize text-gray-700">
      {status}
    </span>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-gray-50 p-4">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <p className="mt-2 text-sm text-gray-600">{value}</p>
    </div>
  );
}