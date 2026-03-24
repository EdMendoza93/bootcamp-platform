"use client";

import { useEffect, useMemo, useState } from "react";
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

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        window.location.replace("/dashboard");
        return;
      }

      const userData = userSnap.data() as { role?: string };

      if (userData.role !== "admin") {
        window.location.replace("/dashboard");
        return;
      }

      await loadApplications();
    });

    return () => unsubscribe();
  }, []);

  const ensureProfileForApplication = async (app: Application) => {
    const existingProfileQuery = query(
      collection(db, "profiles"),
      where("userId", "==", app.userId)
    );

    const existingProfileSnapshot = await getDocs(existingProfileQuery);

    if (!existingProfileSnapshot.empty) {
      return existingProfileSnapshot.docs[0].id;
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
      progressPhotosEnabled: false,
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
        description: "Profile created successfully.",
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
        description: "Missing profile was created successfully.",
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
    return <p className="p-10">Loading...</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Applications</h1>
        <p className="mt-2 text-gray-600">
          Review applicants, approve decisions, and automatically create client
          profiles.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Total" value={String(summary.total)} />
        <SummaryCard label="Pending" value={String(summary.pending)} />
        <SummaryCard label="Approved" value={String(summary.approved)} />
        <SummaryCard label="Rejected" value={String(summary.rejected)} />
        <SummaryCard
          label="Profiles Created"
          value={String(summary.profilesCreated)}
        />
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="text"
            placeholder="Search by name, goal, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-black md:flex-1"
          />

          <div className="flex flex-wrap gap-2">
            {(["all", "pending", "approved", "rejected"] as const).map(
              (status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    statusFilter === status
                      ? "bg-black text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {status[0].toUpperCase() + status.slice(1)}
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {filteredApplications.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-gray-500">
          No applications found.
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredApplications.map((app) => {
            const isBusy = actionLoadingId === app.id;

            return (
              <div
                key={app.id}
                className="rounded-2xl border bg-white p-6 shadow-sm"
              >
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold">
                        {app.fullName || "Unnamed applicant"}
                      </h2>
                      <StatusBadge status={app.status} />
                      {app.hasProfile && (
                        <span className="rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
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
                      <div className="mt-4 rounded-2xl bg-gray-50 p-4">
                        <p className="text-sm font-medium text-gray-700">
                          Medical notes
                        </p>
                        <p className="mt-2 text-sm text-gray-600">
                          {app.medicalNotes}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-3 xl:w-[260px] xl:flex-col">
                    {app.status === "pending" && (
                      <>
                        <button
                          onClick={() => approveApplication(app)}
                          disabled={isBusy}
                          className="rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {isBusy ? "Working..." : "Approve"}
                        </button>

                        <button
                          onClick={() => rejectApplication(app)}
                          disabled={isBusy}
                          className="rounded-xl border bg-white px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                        >
                          {isBusy ? "Working..." : "Reject"}
                        </button>
                      </>
                    )}

                    {app.status === "approved" && app.hasProfile && app.profileId && (
                      <>
                        <a
                          href={`/admin/profiles/${app.profileId}`}
                          className="rounded-xl bg-black px-4 py-2.5 text-center text-sm font-medium text-white"
                        >
                          Open Profile
                        </a>

                        <div className="rounded-xl border bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-600">
                          Ready for next step
                        </div>
                      </>
                    )}

                    {app.status === "approved" && !app.hasProfile && (
                      <>
                        <button
                          onClick={() => createMissingProfile(app)}
                          disabled={isBusy}
                          className="rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {isBusy ? "Creating..." : "Create Missing Profile"}
                        </button>

                        <div className="rounded-xl border bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700">
                          Legacy approved app without profile
                        </div>
                      </>
                    )}

                    {app.status === "rejected" && (
                      <div className="rounded-xl border bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-600">
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
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "pending" | "approved" | "rejected";
}) {
  const styles = {
    pending: "bg-gray-100 text-gray-700 border-gray-200",
    approved: "bg-gray-100 text-gray-700 border-gray-200",
    rejected: "bg-gray-100 text-gray-700 border-gray-200",
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
    <div className="rounded-2xl bg-gray-50 p-4">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <p className="mt-2 text-sm text-gray-600">{value}</p>
    </div>
  );
}