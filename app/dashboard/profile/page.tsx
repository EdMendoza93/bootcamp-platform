"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, getDocs, query, collection, updateDoc, where } from "firebase/firestore";
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
      onboardingStatus: (data.onboardingStatus as OnboardingStatus) || "incomplete",
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
    const required = [form.fullName, form.age, form.goal, form.height, form.weight];
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
    return <p className="p-10">Loading...</p>;
  }

  if (!hasProfile) {
    return (
      <main className="min-h-screen bg-gray-50 p-6 md:p-10">
        <div className="mx-auto max-w-4xl">
          <section className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
            <h1 className="text-3xl font-bold tracking-tight">Your Profile</h1>
            <p className="mt-3 text-gray-600">
              Your profile has not been created yet. Once the team prepares it,
              you will be able to complete your details here.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="/dashboard"
                className="rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white"
              >
                Back to Dashboard
              </a>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-gray-500">
                Wild Atlantic Bootcamp
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight">
                My Profile
              </h1>
              <p className="mt-3 text-gray-600">{userEmail}</p>
            </div>

            <a
              href="/dashboard"
              className="rounded-xl border bg-white px-4 py-2.5 text-sm font-medium"
            >
              Back to Dashboard
            </a>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <StatusCard label="Profile status" value={form.onboardingStatus} />
            <StatusCard label="Payment" value={form.paymentStatus} />
            <StatusCard
              label="Completion"
              value={`${completionState.percent}%`}
            />
          </div>

          <div className="mt-6 rounded-2xl bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-700">Progress</p>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-black transition-all"
                style={{ width: `${completionState.percent}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-gray-600">
              Complete the core details to fully unlock your profile.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-xl font-semibold">Basic Information</h2>
          <p className="mt-2 text-sm text-gray-600">
            Keep your details updated so the team can plan properly.
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
              className="w-full rounded-xl border p-3"
              placeholder="Height"
              value={form.height}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, height: e.target.value }))
              }
            />

            <input
              className="w-full rounded-xl border p-3"
              placeholder="Weight"
              value={form.weight}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, weight: e.target.value }))
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
        </section>

        <section className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-xl font-semibold">Health & Notes</h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <textarea
              className="min-h-[140px] w-full rounded-xl border p-3"
              placeholder="Allergies"
              value={form.allergies}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, allergies: e.target.value }))
              }
            />

            <textarea
              className="min-h-[140px] w-full rounded-xl border p-3"
              placeholder="Injuries"
              value={form.injuries}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, injuries: e.target.value }))
              }
            />

            <textarea
              className="min-h-[160px] w-full rounded-xl border p-3 md:col-span-2"
              placeholder="Notes"
              value={form.notes}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, notes: e.target.value }))
              }
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={saveProfile}
              disabled={saving}
              className="rounded-xl bg-black px-6 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Profile"}
            </button>

            <a
              href="/dashboard"
              className="rounded-xl border bg-white px-6 py-3 text-sm font-medium"
            >
              Cancel
            </a>
          </div>
        </section>
      </div>
    </main>
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
    <div className="rounded-2xl bg-gray-50 p-4">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <p className="mt-2 text-sm font-semibold capitalize text-gray-900">
        {value}
      </p>
    </div>
  );
}