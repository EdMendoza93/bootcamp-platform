"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";

type Profile = {
  id: string;
  fullName: string;
  approvalStatus?: string;
  onboardingStatus?: string;
  paymentStatus?: string;
  assignedProgram?: string;
  clientStatus?: "active" | "inactive";
};

export default function AdminProfilesPage() {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.replace("/login");
        return;
      }

      try {
        const snapshot = await getDocs(collection(db, "profiles"));

        const data: Profile[] = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...(docItem.data() as Omit<Profile, "id">),
        }));

        setProfiles(data);
      } catch (error) {
        console.error("Fetch profiles error:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <p className="p-10">Loading...</p>;
  }

  return (
    <main className="min-h-screen bg-white p-10">
      <a
        href="/admin"
        className="inline-block rounded border px-4 py-2"
      >
        Back to Admin
      </a>

      <h1 className="mt-6 text-3xl font-bold">Profiles</h1>

      <div className="mt-8 space-y-4">
        {profiles.map((profile) => (
          <div key={profile.id} className="rounded-xl border p-6">
            <h2 className="text-xl font-semibold">{profile.fullName}</h2>

            <p className="mt-2 text-sm text-gray-600">
              Approval: {profile.approvalStatus || "—"}
            </p>

            <p className="text-sm text-gray-600">
              Onboarding: {profile.onboardingStatus || "—"}
            </p>

            <p className="text-sm text-gray-600">
              Client Status: {profile.clientStatus || "active"}
            </p>

            <p className="text-sm text-gray-600">
              Payment: {profile.paymentStatus || "—"}
            </p>

            <p className="text-sm text-gray-600">
              Program: {profile.assignedProgram || "Not assigned"}
            </p>

            <a
              href={`/admin/profiles/${profile.id}`}
              className="mt-4 inline-block rounded bg-black px-4 py-2 text-white"
            >
              Open Profile
            </a>
          </div>
        ))}
      </div>
    </main>
  );
}