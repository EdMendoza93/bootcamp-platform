"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        window.location.href = "/login";
      } else {
        setUser(user);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await signOut(auth);
    window.location.href = "/login";
  };

  if (loading) return <p className="p-10">Loading...</p>;

  return (
    <main className="min-h-screen bg-white p-10">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <p className="mt-2 text-gray-600">{user?.email}</p>

      <button
        onClick={logout}
        className="mt-6 bg-black text-white px-4 py-2 rounded"
      >
        Logout
      </button>
    </main>
  );
}