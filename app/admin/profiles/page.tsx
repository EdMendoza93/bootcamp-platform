"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

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

  const filteredProfiles = useMemo(() => {
    return profiles.filter((profile) => {
      const name = (profile.fullName || "").toLowerCase();
      const query = search.trim().toLowerCase();

      const matchesSearch = !query || name.includes(query);

      const currentStatus = profile.clientStatus || "active";

      const matchesStatus =
        statusFilter === "all" ? true : currentStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [profiles, search, statusFilter]);

  if (loading) {
    return <p className="p-10">Loading...</p>;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Profiles</h1>
        <p className="mt-2 text-gray-600">
          Search and manage your bootcamp clients.
        </p>
      </div>

      <div className="mb-8 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="text"
            placeholder="Search by client name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-black md:flex-1"
          />

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setStatusFilter("all")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                statusFilter === "all"
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              All
            </button>

            <button
              onClick={() => setStatusFilter("active")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                statusFilter === "active"
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Active
            </button>

            <button
              onClick={() => setStatusFilter("inactive")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                statusFilter === "inactive"
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Inactive
            </button>
          </div>
        </div>
      </div>

      {filteredProfiles.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-gray-500">
          No profiles found.
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredProfiles.map((profile) => (
            <div
              key={profile.id}
              className="rounded-2xl border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">
                    {profile.fullName || "Unnamed profile"}
                  </h2>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge>
                      {profile.clientStatus || "active"}
                    </StatusBadge>

                    <StatusBadge>
                      payment: {profile.paymentStatus || "—"}
                    </StatusBadge>

                    <StatusBadge>
                      onboarding: {profile.onboardingStatus || "—"}
                    </StatusBadge>

                    <StatusBadge>
                      approval: {profile.approvalStatus || "—"}
                    </StatusBadge>
                  </div>

                  <p className="mt-4 text-sm text-gray-600">
                    Program: {profile.assignedProgram || "Not assigned"}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href={`/admin/profiles/${profile.id}`}
                    className="inline-block rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white"
                  >
                    Open Profile
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
      {children}
    </span>
  );
}