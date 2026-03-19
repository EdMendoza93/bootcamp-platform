"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

export default function AdminProfileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [profileId, setProfileId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    fullName: "",
    age: "",
    goal: "",
    assignedProgram: "",
    paymentStatus: "pending",
    approvalStatus: "approved",
    onboardingStatus: "incomplete",
    clientStatus: "active",
    height: "",
    weight: "",
    allergies: "",
    injuries: "",
    notes: "",
    internalNotes: "",
    progressPhotosEnabled: false,
  });

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const resolvedParams = await params;
        setProfileId(resolvedParams.id);

        const profileRef = doc(db, "profiles", resolvedParams.id);
        const profileSnap = await getDoc(profileRef);

        if (!profileSnap.exists()) {
          window.location.replace("/admin/profiles");
          return;
        }

        const data = profileSnap.data() as any;

        setForm({
          fullName: data.fullName || "",
          age: data.age || "",
          goal: data.goal || "",
          assignedProgram: data.assignedProgram || "",
          paymentStatus: data.paymentStatus || "pending",
          approvalStatus: data.approvalStatus || "approved",
          onboardingStatus: data.onboardingStatus || "incomplete",
          clientStatus: data.clientStatus || "active",
          height: data.height || "",
          weight: data.weight || "",
          allergies: data.allergies || "",
          injuries: data.injuries || "",
          notes: data.notes || "",
          internalNotes: data.internalNotes || "",
          progressPhotosEnabled: data.progressPhotosEnabled || false,
        });
      } catch (error) {
        console.error("Load profile detail error:", error);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [params]);

  const saveProfile = async () => {
    if (!profileId) return;

    setSaving(true);

    try {
      await updateDoc(doc(db, "profiles", profileId), {
        fullName: form.fullName,
        age: form.age,
        goal: form.goal,
        assignedProgram: form.assignedProgram,
        paymentStatus: form.paymentStatus,
        approvalStatus: form.approvalStatus,
        onboardingStatus: form.onboardingStatus,
        clientStatus: form.clientStatus,
        height: form.height,
        weight: form.weight,
        allergies: form.allergies,
        injuries: form.injuries,
        notes: form.notes,
        internalNotes: form.internalNotes,
        progressPhotosEnabled: form.progressPhotosEnabled,
      });

      alert("Profile updated successfully.");
    } catch (error) {
      console.error("Save profile detail error:", error);
      alert("Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="p-10">Loading...</p>;
  }

  return (
    <main className="min-h-screen bg-white p-10">
      <a
        href="/admin/profiles"
        className="inline-block rounded border px-4 py-2"
      >
        Back to Profiles
      </a>

      <h1 className="mt-6 text-3xl font-bold">Edit Profile</h1>

      <div className="mt-8 max-w-3xl space-y-4">
        <input
          className="w-full rounded border p-3"
          placeholder="Full name"
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        />

        <input
          className="w-full rounded border p-3"
          placeholder="Age"
          value={form.age}
          onChange={(e) => setForm({ ...form, age: e.target.value })}
        />

        <textarea
          className="min-h-[100px] w-full rounded border p-3"
          placeholder="Goal"
          value={form.goal}
          onChange={(e) => setForm({ ...form, goal: e.target.value })}
        />

        <input
          className="w-full rounded border p-3"
          placeholder="Assigned program / personalized plan"
          value={form.assignedProgram}
          onChange={(e) =>
            setForm({ ...form, assignedProgram: e.target.value })
          }
        />

        <select
          className="w-full rounded border p-3"
          value={form.paymentStatus}
          onChange={(e) =>
            setForm({ ...form, paymentStatus: e.target.value })
          }
        >
          <option value="pending">pending</option>
          <option value="cash">cash</option>
          <option value="paid">paid</option>
        </select>

        <select
          className="w-full rounded border p-3"
          value={form.onboardingStatus}
          onChange={(e) =>
            setForm({ ...form, onboardingStatus: e.target.value })
          }
        >
          <option value="incomplete">incomplete</option>
          <option value="active">active</option>
        </select>

        <select
          className="w-full rounded border p-3"
          value={form.clientStatus}
          onChange={(e) =>
            setForm({ ...form, clientStatus: e.target.value })
          }
        >
          <option value="active">active</option>
          <option value="inactive">inactive</option>
        </select>

        <input
          className="w-full rounded border p-3"
          placeholder="Height"
          value={form.height}
          onChange={(e) => setForm({ ...form, height: e.target.value })}
        />

        <input
          className="w-full rounded border p-3"
          placeholder="Weight"
          value={form.weight}
          onChange={(e) => setForm({ ...form, weight: e.target.value })}
        />

        <textarea
          className="min-h-[100px] w-full rounded border p-3"
          placeholder="Allergies"
          value={form.allergies}
          onChange={(e) => setForm({ ...form, allergies: e.target.value })}
        />

        <textarea
          className="min-h-[100px] w-full rounded border p-3"
          placeholder="Injuries"
          value={form.injuries}
          onChange={(e) => setForm({ ...form, injuries: e.target.value })}
        />

        <textarea
          className="min-h-[120px] w-full rounded border p-3"
          placeholder="Client notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />

        <textarea
          className="min-h-[120px] w-full rounded border p-3"
          placeholder="Internal admin notes"
          value={form.internalNotes}
          onChange={(e) => setForm({ ...form, internalNotes: e.target.value })}
        />

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={form.progressPhotosEnabled}
            onChange={(e) =>
              setForm({
                ...form,
                progressPhotosEnabled: e.target.checked,
              })
            }
          />
          <span>Progress photos enabled</span>
        </label>

        <button
          onClick={saveProfile}
          disabled={saving}
          className="rounded bg-black px-6 py-3 text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </div>
    </main>
  );
}