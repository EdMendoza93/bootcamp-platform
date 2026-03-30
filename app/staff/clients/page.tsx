"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/components/ui/ToastProvider";
import CollapsiblePanel from "@/components/ui/CollapsiblePanel";

type Profile = {
  id: string;
  fullName?: string;
  userId?: string;
  assignedProgram?: string;
  clientStatus?: "active" | "inactive";
  paymentStatus?: string;
  onboardingStatus?: string;
};

function getInitials(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "CL";

  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

export default function StaffClientsPage() {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "all"
  );

  const { showToast } = useToast();

  useEffect(() => {
    const init = async () => {
      try {
        const snapshot = await getDocs(collection(db, "profiles"));

        const rows = snapshot.docs
          .map((docItem) => ({
            id: docItem.id,
            ...(docItem.data() as Omit<Profile, "id">),
          }))
          .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "")) as Profile[];

        setProfiles(rows);
      } catch (error) {
        console.error("Load staff clients error:", error);
        showToast({
          title: "Could not load clients",
          description: "Please refresh the page.",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [showToast]);

  const filteredProfiles = useMemo(() => {
    const query = search.trim().toLowerCase();

    return profiles.filter((profile) => {
      const haystack =
        `${profile.fullName || ""} ${profile.assignedProgram || ""} ${
          profile.paymentStatus || ""
        } ${profile.onboardingStatus || ""}`.toLowerCase();

      const currentStatus = profile.clientStatus || "active";
      const matchesSearch = !query || haystack.includes(query);
      const matchesStatus =
        statusFilter === "all" ? true : currentStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [profiles, search, statusFilter]);

  const summary = useMemo(
    () => ({
      total: profiles.length,
      active: profiles.filter(
        (profile) => (profile.clientStatus || "active") === "active"
      ).length,
      inactive: profiles.filter(
        (profile) => (profile.clientStatus || "active") === "inactive"
      ).length,
    }),
    [profiles]
  );

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">Loading clients...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
        <div className="bg-gradient-to-r from-[#071120] via-[#123b76] to-[#2EA0FF] p-[1px]">
          <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
        </div>

        <div className="p-6 md:p-8">
          <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
            Clients
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
            Client Workspace Index
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
            Open a client workspace to review their bootcamp stay, your area of the schedule,
            private sessions, and message threads from one place.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <HeaderPill label="Clients" value={String(summary.total)} />
            <HeaderPill label="Active" value={String(summary.active)} />
            <HeaderPill label="Inactive" value={String(summary.inactive)} />
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/70 bg-white/90 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-6">
        <CollapsiblePanel
          title="Search and filters"
          description="Open only when you need to narrow the client list."
          defaultOpen
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
            <input
              type="text"
              placeholder="Search by client, program, payment, onboarding..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
            />
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "all" | "active" | "inactive")
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </CollapsiblePanel>
      </section>

      {filteredProfiles.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/80 p-10 text-center text-sm text-slate-500">
          No clients match the current filters.
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
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-slate-950 text-sm font-semibold text-white shadow-sm">
                      {getInitials(profile.fullName || "Client")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl font-semibold text-slate-950">
                        {profile.fullName || "Unnamed profile"}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {profile.userId || profile.id}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge tone={profile.clientStatus === "inactive" ? "danger" : "success"}>
                      {profile.clientStatus || "active"}
                    </StatusBadge>
                    <StatusBadge tone="neutral">
                      payment: {profile.paymentStatus || "—"}
                    </StatusBadge>
                    <StatusBadge tone="blue">{profile.assignedProgram || "No program"}</StatusBadge>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <MetaCard
                      label="Workspace focus"
                      value="Schedule, sessions, and inbox"
                    />
                    <MetaCard
                      label="Status check"
                      value={`${profile.onboardingStatus || "—"} onboarding`}
                    />
                  </div>
                </div>

                <Link
                  href={`/staff/clients/${profile.id}`}
                  className="inline-flex rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md"
                >
                  Open Workspace
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HeaderPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 shadow-sm">
      {label}: <span className="text-slate-900">{value}</span>
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

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm text-slate-700">{value}</p>
    </div>
  );
}
