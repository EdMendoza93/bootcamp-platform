"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { useToast } from "@/components/ui/ToastProvider";

type Application = {
  id: string;
  status?: "pending" | "approved" | "rejected";
  fullName?: string;
};

type Profile = {
  id: string;
  fullName?: string;
  clientStatus?: "active" | "inactive";
  paymentStatus?: string;
};

type ScheduleItem = {
  id: string;
  date: string;
  startTime: string;
  profileId: string;
  title?: string;
  type?: "training" | "nutrition" | "activity";
};

type ProgressPhoto = {
  id: string;
  profileId: string;
  title?: string;
  createdAt?: {
    seconds?: number;
    nanoseconds?: number;
  };
};

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [applications, setApplications] = useState<Application[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);

  const { showToast } = useToast();

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

        const [appsSnap, profilesSnap, scheduleSnap, progressSnap] =
          await Promise.all([
            getDocs(collection(db, "applications")),
            getDocs(collection(db, "profiles")),
            getDocs(collection(db, "scheduleItems")),
            getDocs(collection(db, "progressPhotos")),
          ]);

        const appData = appsSnap.docs.map((docItem) => ({
          id: docItem.id,
          ...(docItem.data() as Omit<Application, "id">),
        })) as Application[];

        const profileData = profilesSnap.docs.map((docItem) => ({
          id: docItem.id,
          ...(docItem.data() as Omit<Profile, "id">),
        })) as Profile[];

        const scheduleData = scheduleSnap.docs.map((docItem) => ({
          id: docItem.id,
          ...(docItem.data() as Omit<ScheduleItem, "id">),
        })) as ScheduleItem[];

        const progressData = progressSnap.docs.map((docItem) => ({
          id: docItem.id,
          ...(docItem.data() as Omit<ProgressPhoto, "id">),
        })) as ProgressPhoto[];

        scheduleData.sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return (a.startTime || "").localeCompare(b.startTime || "");
        });

        progressData.sort((a, b) => {
          const aSeconds = a.createdAt?.seconds || 0;
          const bSeconds = b.createdAt?.seconds || 0;
          return bSeconds - aSeconds;
        });

        setApplications(appData);
        setProfiles(profileData);
        setScheduleItems(scheduleData);
        setProgressPhotos(progressData);
      } catch (error) {
        console.error("Admin overview error:", error);
        showToast({
          title: "Could not load admin overview",
          description: "Please refresh the page.",
          type: "error",
        });
        window.location.replace("/dashboard");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [showToast]);

  const pendingApplications = useMemo(
    () => applications.filter((item) => item.status === "pending").length,
    [applications]
  );

  const approvedApplications = useMemo(
    () => applications.filter((item) => item.status === "approved").length,
    [applications]
  );

  const activeClients = useMemo(
    () =>
      profiles.filter((item) => (item.clientStatus || "active") === "active")
        .length,
    [profiles]
  );

  const recentSchedule = useMemo(() => scheduleItems.slice(0, 6), [scheduleItems]);
  const recentUploads = useMemo(() => progressPhotos.slice(0, 6), [progressPhotos]);

  const profileNameMap = useMemo(() => {
    const map: Record<string, string> = {};

    profiles.forEach((profile) => {
      map[profile.id] = profile.fullName || "Unnamed profile";
    });

    return map;
  }, [profiles]);

  const logout = async () => {
    await signOut(auth);
    window.location.replace("/login");
  };

  if (loading) {
    return <p className="p-10">Loading...</p>;
  }

  if (!allowed) return null;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Overview</h1>
          <p className="mt-2 text-gray-600">
            Quick visibility into applications, clients, schedule, and uploads.
          </p>
        </div>

        <button
          onClick={logout}
          className="rounded-xl bg-gray-200 px-4 py-2 text-sm font-medium text-black transition hover:bg-gray-300"
        >
          Logout
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Pending Applications" value={String(pendingApplications)} />
        <MetricCard label="Approved Applications" value={String(approvedApplications)} />
        <MetricCard label="Profiles" value={String(profiles.length)} />
        <MetricCard label="Active Clients" value={String(activeClients)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Upcoming Schedule</h2>
            <p className="mt-1 text-sm text-gray-500">
              Earliest items currently in the system.
            </p>
          </div>

          {recentSchedule.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-gray-500">
              No schedule items yet.
            </div>
          ) : (
            <div className="space-y-3">
              {recentSchedule.map((item) => (
                <div key={item.id} className="rounded-2xl border bg-gray-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {item.title || "Session"}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        {profileNameMap[item.profileId] || "Unknown client"}
                      </p>
                    </div>

                    <div className="text-right text-sm text-gray-600">
                      <p>{item.date}</p>
                      <p>{item.startTime || "—"}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Recent Uploads</h2>
            <p className="mt-1 text-sm text-gray-500">
              Latest progress photos uploaded to the platform.
            </p>
          </div>

          {recentUploads.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-gray-500">
              No uploads yet.
            </div>
          ) : (
            <div className="space-y-3">
              {recentUploads.map((item) => (
                <div key={item.id} className="rounded-2xl border bg-gray-50 p-4">
                  <p className="text-sm font-semibold text-gray-900">
                    {item.title || "Progress update"}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    {profileNameMap[item.profileId] || "Unknown client"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <QuickLinkCard
          href="/admin/applications"
          title="Applications"
          description="Review incoming applications and move clients forward."
        />
        <QuickLinkCard
          href="/admin/profiles"
          title="Profiles"
          description="Manage client profiles, onboarding, payment, and status."
        />
        <QuickLinkCard
          href="/admin/schedule"
          title="Schedule"
          description="Create itinerary items using templates or custom notes."
        />
        <QuickLinkCard
          href="/admin/templates"
          title="Templates"
          description="Manage reusable training, nutrition, and activity templates."
        />
        <QuickLinkCard
          href="/admin/progress"
          title="Progress"
          description="Review client progress photo uploads and status."
        />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

function QuickLinkCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <a
      href={href}
      className="rounded-2xl border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-gray-600">{description}</p>
    </a>
  );
}