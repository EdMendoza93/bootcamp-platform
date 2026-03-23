"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
  where,
  query,
} from "firebase/firestore";
import { useToast } from "@/components/ui/ToastProvider";

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

export default function AdminApplicationsPage() {
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<Application[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("all");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const { showToast } = useToast();

  const loadApplications = async () => {
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
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.replace("/login");
        return;
      }

      await loadApplications();
    });

    return () => unsubscribe();
  }, []);

  const updateStatus = async (
    app: Application,
    status: "approved" | "rejected"
  ) => {
    try {
      setActionLoadingId(app.id);

      await updateDoc(doc(db, "applications", app.id), { status });

      setApplications((prev) =>
        prev.map((item) =>
          item.id === app.id ? { ...item, status } : item
        )
      );

      showToast({
        title:
          status === "approved"
            ? "Application approved"
            : "Application rejected",
        description:
          status === "approved"
            ? "The applicant can now move to the next step."
            : "The application was marked as rejected.",
        type: "success",
      });
    } catch (error) {
      console.error("Update status error:", error);
      showToast({
        title: "Status update failed",
        description: "Could not update the application status.",
        type: "error",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const createProfile = async (app: Application) => {
    try {
      setActionLoadingId(app.id);

      const existingProfileQuery = query(
        collection(db, "profiles"),
        where("userId", "==", app.userId)
      );

      const existingProfileSnapshot = await getDocs(existingProfileQuery);

      if (!existingProfileSnapshot.empty) {
        const existingProfileId = existingProfileSnapshot.docs[0]?.id || "";

        setApplications((prev) =>
          prev.map((item) =>
            item.id === app.id
              ? {
                  ...item,
                  hasProfile: true,
                  profileId: existingProfileId,
                }
              : item
          )
        );

        showToast({
          title: "Profile already exists",
          description: "This user already has a profile.",
          type: "info",
        });
        return;
      }

      const profileRef = await addDoc(collection(db, "profiles"), {
        userId: app.userId,
        applicationId: app.id,
        fullName: app.fullName || "",
        age: app.age || "",
        goal: app.goal || "",
        approvalStatus: "approved",
        onboardingStatus: "incomplete",
        clientStatus: "active",
        paymentStatus: "pending",
        assignedProgram: "",
        height: "",
        weight: "",
        allergies: "",
        injuries: "",
        notes: "",
        internalNotes: "",
        progressPhotosEnabled: false,
        createdAt: serverTimestamp(),
      });

      setApplications((prev) =>
        prev.map((item) =>
          item.id === app.id
            ? {
                ...item,
                hasProfile: true,
                profileId: profileRef.id,
                status: "approved",
              }
            : item
        )
      );

      showToast({
        title: "Profile created",
        description: "The client profile was created successfully.",
        type: "success",
      });
    } catch (error) {
      console.error("Create profile error:", error);
      showToast({
        title: "Profile creation failed",
        description: "Could not create the client profile.",
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
        <div className="bg-gradient-to-r from-[#0f172a] via-[#123b76] to-[#2EA0FF] p-[1px]">
          <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
        </div>

        <div className="p-6 md:p-8">
          <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
            Admissions
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
            Applications
          </h1>

          <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
            Review applicants, make approval decisions, and create client
            profiles once they are ready to move forward.
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Total" value={String(summary.total)} tone="light" />
        <SummaryCard label="Pending" value={String(summary.pending)} tone="blue" />
        <SummaryCard label="Approved" value={String(summary.approved)} tone="success" />
        <SummaryCard label="Rejected" value={String(summary.rejected)} tone="danger" />
        <SummaryCard
          label="Profiles Created"
          value={String(summary.profilesCreated)}
          tone="dark"
        />
      </section>

      <section className="rounded-[28px] border border-white/70 bg-white/90 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <input
            type="text"
            placeholder="Search by name, goal, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe] md:flex-1"
          />

          <div className="flex flex-wrap gap-2">
            {(["all", "pending", "approved", "rejected"] as const).map(
              (status) => (
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
              )
            )}
          </div>
        </div>
      </section>

      {filteredApplications.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/80 p-10 text-center text-sm text-slate-500">
          No applications found.
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredApplications.map((app) => {
            const isBusy = actionLoadingId === app.id;

            return (
              <div
                key={app.id}
                className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_14px_40px_rgba(15,23,42,0.07)] transition-all duration-200 hover:shadow-[0_20px_45px_rgba(15,23,42,0.10)]"
              >
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-slate-950">
                        {app.fullName || "Unnamed applicant"}
                      </h2>
                      <StatusBadge status={app.status} />
                      {app.hasProfile && (
                        <span className="rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold text-[#1d4ed8]">
                          Profile created
                        </span>
                      )}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <InfoRow label="Age" value={app.age || "—"} />
                      <InfoRow label="Goal" value={app.goal || "—"} />
                      <InfoRow label="Phone" value={app.phone || "—"} />
                      <InfoRow
                        label="Experience"
                        value={app.experience || "—"}
                      />
                    </div>

                    {app.medicalNotes ? (
                      <div className="mt-4 rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
                        <p className="text-sm font-semibold text-slate-700">
                          Medical notes
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {app.medicalNotes}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-3 xl:w-[260px] xl:flex-col">
                    {app.status === "pending" && (
                      <>
                        <button
                          onClick={() => updateStatus(app, "approved")}
                          disabled={isBusy}
                          className="rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isBusy ? "Working..." : "Approve"}
                        </button>

                        <button
                          onClick={() => updateStatus(app, "rejected")}
                          disabled={isBusy}
                          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isBusy ? "Working..." : "Reject"}
                        </button>
                      </>
                    )}

                    {app.status === "approved" && !app.hasProfile && (
                      <button
                        onClick={() => createProfile(app)}
                        disabled={isBusy}
                        className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isBusy ? "Creating..." : "Create Profile"}
                      </button>
                    )}

                    {app.status === "approved" && app.hasProfile && app.profileId && (
                      <>
                        <a
                          href={`/admin/profiles/${app.profileId}`}
                          className="rounded-2xl bg-slate-950 px-4 py-2.5 text-center text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md"
                        >
                          Open Profile
                        </a>

                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
                          Ready for next step
                        </div>
                      </>
                    )}

                    {app.status === "rejected" && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-600">
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
  tone: "blue" | "success" | "danger" | "dark" | "light";
}) {
  const styles: Record<
    "blue" | "success" | "danger" | "dark" | "light",
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
      className={`rounded-full border px-3 py-1 text-[11px] font-semibold capitalize ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{value}</p>
    </div>
  );
}