"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (!currentUser) {
          window.location.replace("/login");
          return;
        }

        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          window.location.replace("/dashboard");
          return;
        }

        const data = userSnap.data() as { role?: string };

        if (data.role !== "admin") {
          window.location.replace("/dashboard");
          return;
        }

        setAllowed(true);
      } catch (error) {
        console.error("Admin error:", error);
        window.location.replace("/dashboard");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await signOut(auth);
    window.location.replace("/login");
  };

  if (loading) {
    return <p className="p-10">Loading...</p>;
  }

  if (!allowed) return null;

  return (
    <main className="min-h-screen bg-white p-10">
      <h1 className="text-3xl font-bold">Admin Panel</h1>
      <p className="mt-2 text-gray-600">
        Manage applications, profiles, templates, and schedules.
      </p>

      <div className="mt-8 flex flex-wrap gap-4">
        <a
          href="/admin/applications"
          className="inline-block rounded border px-4 py-2"
        >
          View Applications
        </a>

        <a
          href="/admin/profiles"
          className="inline-block rounded border px-4 py-2"
        >
          View Profiles
        </a>
        <a
          href="/admin/schedule"
          className="inline-block rounded border px-4 py-2"
        >
          Schedule Builder
        </a>
        <a
          href="/admin/training"
          className="inline-block rounded border px-4 py-2"
        >
          Training Templates
        </a>

        <a
          href="/admin/nutrition"
          className="inline-block rounded border px-4 py-2"
        >
          Nutrition Templates
        </a>

        <a
          href="/admin/activities"
          className="inline-block rounded border px-4 py-2"
        >
          Activity Templates
        </a>
      </div>

      <button
        onClick={logout}
        className="mt-8 block rounded bg-gray-200 px-4 py-2"
      >
        Logout
      </button>
    </main>
  );
}