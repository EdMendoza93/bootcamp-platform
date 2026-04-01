"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useToast } from "@/components/ui/ToastProvider";
import { getHomeRouteForRole, normalizeRole } from "@/lib/roles";

type Application = {
  id: string;
  userId: string;
  fullName: string;
  age: string;
  goal: string;
  phone?: string;
  experience?: string;
  medicalNotes?: string;
  status: "pending" | "approved" | "rejected";
  hasProfile?: boolean;
  profileId?: string;
};

function getApplicantInitials(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "AP";

  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

export default function AdminApplicationsPage() {
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<Application[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("all");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const { showToast } = useToast();

  const loadApplications = useCallback(async () => {
    try {
      const [appsSnapshot, profilesSnapshot] = await Promise.all([
        getDocs(collection(db, "applications")),
        getDocs(collection(db, "profiles")),
      ]);

      const profileByUserId = new Map<string, string>();

      profilesSnapshot.docs.forEach((docItem) => {
        const data = docItem.data() as { userId?: string };
        if (data.userId) {
          profileByUserId.set(data.userId, docItem.id);
        }
      });

      const data: Application[] = appsSnapshot.docs
        .map((docItem) => {
          const appData = docItem.data() as Omit<
            Application,
            "id" | "hasProfile" | "profileId"
          >;

          const profileId = profileByUserId.get(appData.userId);

          return {
            id: docItem.id,
            ...appData,
            hasProfile: Boolean(profileId),
            profileId: profileId || "",
          };
        })
        .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));

      setApplications(data);
    } catch (error) {
      console.error("Fetch applications error:", error);
      showToast({
        title: "Could not load applications",
        description: "Please refresh the page.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.replace("/login");
        return;
      }

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        window.location.replace("/login");
        return;
      }

      const userData = userSnap.data() as { role?: string };

      const role = normalizeRole(userData.role);
      if (role !== "admin") {
        window.location.replace(getHomeRouteForRole(role));
        return;
      }

      await loadApplications();
    });

    return () => unsubscribe();
  }, [loadApplications]);

  const ensureProfileForApplication = async (app: Application) => {
    const existingProfileQuery = query(
      collection(db, "profiles"),
      where("userId", "==", app.userId)
    );

    const existingProfileSnapshot = await getDocs(existingProfileQuery);

    if (!existingProfileSnapshot.empty) {
      const existingProfileId = existingProfileSnapshot.docs[0].id;

      await updateDoc(doc(db, "profiles", existingProfileId), {
        applicationId: app.id,
        approvalStatus: "approved",
        progressPhotosEnabled: true,
      });

      return existingProfileId;
    }

    const profileRef = await addDoc(collection(db, "profiles"), {
      userId: app.userId,
      applicationId: app.id,
      fullName: app.fullName || "",
      age: app.age || "",
      goal: app.goal || "",
      approvalStatus: "approved",
      onboardingStatus: "incomplete",
      clientStatus: "inactive",
      paymentStatus: "pending",
      assignedProgram: "",
      height: "",
      weight: "",
      allergies: "",
      injuries: "",
      notes: "",
      internalNotes: "",
      progressPhotosEnabled: true,
      createdAt: serverTimestamp(),
    });

    return profileRef.id;
  };

  const approveApplication = async (app: Application) => {
    try {
      setActionLoadingId(app.id);

      await updateDoc(doc(db, "applications", app.id), {
        status: "approved",
      });

      const profileId = await ensureProfileForApplication(app);

      setApplications((prev) =>
        prev.map((item) =>
          item.id === app.id
            ? {
                ...item,
                status: "approved",
                hasProfile: true,
                profileId,
              }
            : item
        )
      );

      showToast({
        title: "Application approved",
        description: "Profile created and progress uploads enabled.",
        type: "success",
      });
    } catch (error) {
      console.error("Approve application error:", error);
      showToast({
        title: "Approval failed",
        description: "Could not approve the application.",
        type: "error",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const rejectApplication = async (app: Application) => {
    try {
      setActionLoadingId(app.id);

      await updateDoc(doc(db, "applications", app.id), {
        status: "rejected",
      });

      setApplications((prev) =>
        prev.map((item) =>
          item.id === app.id ? { ...item, status: "rejected" } : item
        )
      );

      showToast({
        title: "Application rejected",
        description: "The application was marked as rejected.",
        type: "success",
      });
    } catch (error) {
      console.error("Reject application error:", error);
      showToast({
        title: "Rejection failed",
        description: "Could not update the application status.",
        type: "error",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const createMissingProfile = async (app: Application) => {
    try {
      setActionLoadingId(app.id);

      const profileId = await ensureProfileForApplication(app);

      await updateDoc(doc(db, "applications", app.id), {
        status: "approved",
      });

      setApplications((prev) =>
        prev.map((item) =>
          item.id === app.id
            ? {
                ...item,
                hasProfile: true,
                profileId,
                status: "approved",
              }
            : item
        )
      );

      showToast({
        title: "Profile created",
        description: "Missing profile was created and uploads enabled.",
        type: "success",
      });
    } catch (error) {
      console.error("Create missing profile error:", error);
      showToast({
        title: "Profile creation failed",
        description: "Could not create the missing profile.",
        type: "error",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredApplications = useMemo(() => {
    const queryText = search.trim().toLowerCase();

    return applications.filter((app) => {
      const matchesSearch =
        !queryText ||
        (app.fullName || "").toLowerCase().includes(queryText) ||
        (app.goal || "").toLowerCase().includes(queryText) ||
        (app.phone || "").toLowerCase().includes(queryText);

      const matchesStatus =
        statusFilter === "all" ? true : app.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [applications, search, statusFilter]);

  const summary = useMemo(() => {
    return {
      total: applications.length,
      pending: applications.filter((app) => app.status === "pending").length,
      approved: applications.filter((app) => app.status === "approved").length,
      rejected: applications.filter((app) => app.status === "rejected").length,
      profilesCreated: applications.filter((app) => app.hasProfile).length,
    };
  }, [applications]);

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">
          Loading applications...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
        <div className="bg-gradient-to-r from-[#071120] via-[#123b76] to-[#2EA0FF] p-[1px]">
          <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
        </div>

        <div className="relative overflow-hidden p-6 md:p-8">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#2EA0FF]/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-emerald-300/10 blur-3xl" />

          <div className="relative">
            <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
              Applications
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Applicant Review
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
              Review applicants, approve decisions, and automatically create
              client profiles.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <HeaderPill label="Pending" value={String(summary.pending)} />
              <HeaderPill label="Approved" value={String(summary.approved)} />
              <HeaderPill
                label="Profiles created"
                value={String(summary.profilesCreated)}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Total" value={String(summary.total)} tone="light" />
        <SummaryCard label="Pending" value={String(summary.pending)} tone="blue" />
        <SummaryCard
          label="Approved"
          value={String(summary.approved)}
          tone="success"
        />
        <SummaryCard
          label="Rejected"
          value={String(summary.rejected)}
          tone="light"
        />
        <SummaryCard
          label="Profiles Created"
          value={String(summary.profilesCreated)}
          tone="dark"
        />
      </section>

      <section className="rounded-[28px] border border-white/70 bg-white/90 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_220px]">
          <input
            type="text"
            placeholder="Search by name, goal, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
          />

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as "all" | "pending" | "approved" | "rejected"
              )
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {statusFilter !== "all" && (
              <StatusBadge status={statusFilter as "pending" | "approved" | "rejected"} />
            )}
            {search.trim() && (
              <span className="rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-xs font-semibold text-[#1d4ed8]">
                search active
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <p className="text-sm text-slate-500">
              Showing {filteredApplications.length} application
              {filteredApplications.length === 1 ? "" : "s"}
            </p>

            {(search.trim() || statusFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                }}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </section>

      {filteredApplications.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/90 p-10 text-center text-sm text-slate-500 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
          No applications found.
        </div>
      ) : (
        <div className="grid gap-5">
          {filteredApplications.map((app) => {
            const isBusy = actionLoadingId === app.id;

            return (
              <div
                key={app.id}
                className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur"
              >
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-slate-950 text-sm font-semibold text-white shadow-sm">
                        {getApplicantInitials(app.fullName || "Applicant")}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-xl font-semibold tracking-tight text-slate-950">
                            {app.fullName || "Unnamed applicant"}
                          </h2>
                          <StatusBadge status={app.status} />
                          {app.hasProfile && (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                              Profile created
                            </span>
                          )}
                        </div>

                        <p className="mt-2 text-sm text-slate-500">
                          {app.userId}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                      <InfoRow label="Age" value={app.age || "—"} />
                      <InfoRow label="Goal" value={app.goal || "—"} />
                      <InfoRow label="Phone" value={app.phone || "—"} />
                      <InfoRow
                        label="Experience"
                        value={app.experience || "—"}
                      />
                    </div>

                    {app.medicalNotes ? (
                      <div className="mt-4 rounded-[22px] border border-amber-100 bg-amber-50/70 p-4">
                        <p className="text-sm font-semibold text-amber-800">
                          Medical notes
                        </p>
                        <p className="mt-2 text-sm text-amber-700">
                          {app.medicalNotes}
                        </p>
                      </div>
                    ) : null}

                    <div className="mt-4 rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Next action
                      </p>
                      <p className="mt-2 text-sm font-medium text-slate-900">
                        {getApplicationNextAction(app)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 xl:w-[270px] xl:flex-col">
                    {app.status === "pending" && (
                      <>
                        <button
                          onClick={() => approveApplication(app)}
                          disabled={isBusy}
                          className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
                        >
                          {isBusy ? "Working..." : "Approve"}
                        </button>

                        <button
                          onClick={() => rejectApplication(app)}
                          disabled={isBusy}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          {isBusy ? "Working..." : "Reject"}
                        </button>
                      </>
                    )}

                    {app.status === "approved" && app.hasProfile && app.profileId && (
                      <>
                        <a
                          href={`/admin/profiles/${app.profileId}`}
                          className="rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
                        >
                          Open Profile
                        </a>

                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                          Ready for next step
                        </div>
                      </>
                    )}

                    {app.status === "approved" && !app.hasProfile && (
                      <>
                        <button
                          onClick={() => createMissingProfile(app)}
                          disabled={isBusy}
                          className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
                        >
                          {isBusy ? "Creating..." : "Create Missing Profile"}
                        </button>

                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
                          Legacy approved app without profile
                        </div>
                      </>
                    )}

                    {app.status === "rejected" && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                        Application closed
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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
  tone: "blue" | "success" | "dark" | "light";
}) {
  const styles: Record<
    "blue" | "success" | "dark" | "light",
    { card: string; label: string; value: string }
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
    dark: {
      card: "border-slate-800 bg-gradient-to-br from-slate-950 to-slate-800",
      label: "text-slate-300",
      value: "text-white",
    },
    light: {
      card: "border-slate-200 bg-white",
      label: "text-slate-500",
      value: "text-slate-950",
    },
  };

  return (
    <div
      className={`rounded-[16px] border px-3.5 py-2.5 shadow-[0_8px_18px_rgba(15,23,42,0.05)] ${styles[tone].card}`}
    >
      <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${styles[tone].label}`}>
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-semibold leading-none tracking-tight ${styles[tone].value}`}
      >
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "pending" | "approved" | "rejected";
}) {
  const styles = {
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rejected: "border-rose-200 bg-rose-50 text-rose-700",
  };

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <p className="mt-2 text-sm text-slate-600">{value}</p>
    </div>
  );
}

function HeaderPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
      {label}: <span className="text-slate-950">{value}</span>
    </div>
  );
}

function getApplicationNextAction(app: Application) {
  if (app.status === "pending") {
    return "Approve or reject application";
  }

  if (app.status === "approved" && !app.hasProfile) {
    return "Create missing profile";
  }

  if (app.status === "approved" && app.hasProfile) {
    return "Open profile and continue onboarding";
  }

  return "No further action required";
}
