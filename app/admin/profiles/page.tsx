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
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "all"
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.replace("/login");
        return;
      }

      try {
        const snapshot = await getDocs(collection(db, "profiles"));

        const data: Profile[] = snapshot.docs
          .map((docItem) => ({
            id: docItem.id,
            ...(docItem.data() as Omit<Profile, "id">),
          }))
          .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));

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

  const summary = useMemo(() => {
    return {
      total: profiles.length,
      active: profiles.filter(
        (profile) => (profile.clientStatus || "active") === "active"
      ).length,
      inactive: profiles.filter(
        (profile) => (profile.clientStatus || "active") === "inactive"
      ).length,
      assigned: profiles.filter((profile) => Boolean(profile.assignedProgram))
        .length,
    };
  }, [profiles]);

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">
          Loading profiles...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
        <div className="bg-gradient-to-r from-[#0f172a] via-[#123b76] to-[#2EA0FF] p-[1px]">
          <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
        </div>

        <div className="p-6 md:p-8">
          <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
            Clients
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
            Profiles
          </h1>

          <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
            Search and manage your bootcamp clients, view their status, and open
            their individual profiles.
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total Profiles" value={String(summary.total)} tone="light" />
        <SummaryCard label="Active Clients" value={String(summary.active)} tone="success" />
        <SummaryCard label="Inactive Clients" value={String(summary.inactive)} tone="danger" />
        <SummaryCard label="Programs Assigned" value={String(summary.assigned)} tone="blue" />
      </section>

      <section className="rounded-[28px] border border-white/70 bg-white/90 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <input
            type="text"
            placeholder="Search by client name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe] md:flex-1"
          />

          <div className="flex flex-wrap gap-2">
            {(["all", "active", "inactive"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`rounded-2xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  statusFilter === status
                    ? "bg-slate-950 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
                }`}
              >
                {status[0].toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {filteredProfiles.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/80 p-10 text-center text-sm text-slate-500">
          No profiles found.
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredProfiles.map((profile) => (
            <div
              key={profile.id}
              className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_14px_40px_rgba(15,23,42,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_45px_rgba(15,23,42,0.10)]"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold text-slate-950">
                    {profile.fullName || "Unnamed profile"}
                  </h2>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge tone={profile.clientStatus === "inactive" ? "danger" : "success"}>
                      {profile.clientStatus || "active"}
                    </StatusBadge>

                    <StatusBadge tone="neutral">
                      payment: {profile.paymentStatus || "—"}
                    </StatusBadge>

                    <StatusBadge tone="blue">
                      onboarding: {profile.onboardingStatus || "—"}
                    </StatusBadge>

                    <StatusBadge tone="neutral">
                      approval: {profile.approvalStatus || "—"}
                    </StatusBadge>
                  </div>

                  <div className="mt-4 rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
                    <p className="text-sm font-semibold text-slate-700">Program</p>
                    <p className="mt-2 text-sm text-slate-600">
                      {profile.assignedProgram || "Not assigned"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href={`/admin/profiles/${profile.id}`}
                    className="inline-flex rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md"
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

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "success" | "danger" | "light";
}) {
  const styles: Record<
    "blue" | "success" | "danger" | "light",
    {
      card: string;
      label: string;
      value: string;
    }
  > = {
    blue: {
      card: "border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white",
      label: "text-[#1d4ed8]",
      value: "text-slate-950",
    },
    success: {
      card: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white",
      label: "text-emerald-700",
      value: "text-slate-950",
    },
    danger: {
      card: "border-rose-200 bg-gradient-to-br from-rose-50 to-white",
      label: "text-rose-700",
      value: "text-slate-950",
    },
    light: {
      card: "border-slate-200 bg-white",
      label: "text-slate-500",
      value: "text-slate-950",
    },
  };

  return (
    <div
      className={`rounded-[24px] border p-5 shadow-[0_14px_40px_rgba(15,23,42,0.07)] ${styles[tone].card}`}
    >
      <p className={`text-sm font-semibold ${styles[tone].label}`}>{label}</p>
      <p className={`mt-2 text-3xl font-semibold tracking-tight ${styles[tone].value}`}>
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "success" | "danger" | "blue" | "neutral";
}) {
  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
    blue: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
  };

  return (
    <span
      className={`rounded-full border px-3 py-1 text-[11px] font-semibold capitalize ${styles[tone]}`}
    >
      {children}
    </span>
  );
}