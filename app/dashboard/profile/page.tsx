"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, updateDoc, collection, getDocs, query, where } from "firebase/firestore";

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileDocId, setProfileDocId] = useState<string | null>(null);

  const [form, setForm] = useState({
    height: "",
    weight: "",
    allergies: "",
    injuries: "",
    notes: "",
    progressPhotosEnabled: false,
  });

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      try {
        await auth.authStateReady();

        const currentUser = auth.currentUser;

        if (!currentUser) {
          window.location.replace("/login");
          return;
        }

        const profileQuery = await getDocs(
          query(collection(db, "profiles"), where("userId", "==", currentUser.uid))
        );

        if (profileQuery.empty) {
          window.location.replace("/dashboard");
          return;
        }

        const profileDoc = profileQuery.docs[0];
        const profileData = profileDoc.data() as {
          height?: string;
          weight?: string;
          allergies?: string;
          injuries?: string;
          notes?: string;
          progressPhotosEnabled?: boolean;
        };

        if (cancelled) return;

        setProfileDocId(profileDoc.id);
        setForm({
          height: profileData.height || "",
          weight: profileData.weight || "",
          allergies: profileData.allergies || "",
          injuries: profileData.injuries || "",
          notes: profileData.notes || "",
          progressPhotosEnabled: profileData.progressPhotosEnabled || false,
        });
      } catch (error) {
        console.error("Load profile error:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  const saveProfile = async () => {
    if (!profileDocId) return;

    setSaving(true);

    try {
      await updateDoc(doc(db, "profiles", profileDocId), {
        height: form.height,
        weight: form.weight,
        allergies: form.allergies,
        injuries: form.injuries,
        notes: form.notes,
        progressPhotosEnabled: form.progressPhotosEnabled,
        onboardingStatus: "active",
      });

      alert("Profile updated successfully.");
      window.location.replace("/dashboard");
    } catch (error) {
      console.error("Save profile error:", error);
      alert("Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="p-10">Loading...</p>;
  }

  return (
    <main className="min-h-screen bg-white p-10">
      <h1 className="text-3xl font-bold">My Profile</h1>
      <p className="mt-2 text-gray-600">
        Update your personal information and preferences.
      </p>

      <div className="mt-8 max-w-2xl space-y-4">
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
          placeholder="Injuries or physical limitations"
          value={form.injuries}
          onChange={(e) => setForm({ ...form, injuries: e.target.value })}
        />

        <textarea
          className="min-h-[120px] w-full rounded border p-3"
          placeholder="Anything else you want us to know"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
          <span>I’m comfortable sharing progress photos</span>
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