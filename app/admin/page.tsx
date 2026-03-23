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
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">
          Loading admin overview...
        </p>
      </div>
    );
  }

  if (!allowed) return null;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
        <div className="bg-gradient-to-r from-[#0f172a] via-[#123b76] to-[#2EA0FF] p-[1px]">
          <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
        </div>

        <div className="p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
                Admin Console
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                Admin Overview
              </h1>

              <p className="mt-3 text-sm text-slate-600 md:text-base">
                Quick visibility into applications, client activity, schedule,
                and progress uploads across the platform.
              </p>
            </div>

            <button
              onClick={logout}
              className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md"
            >
              Logout
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Pending Applications"
          value={String(pendingApplications)}
          tone="blue"
        />
        <MetricCard
          label="Approved Applications"
          value={String(approvedApplications)}
          tone="dark"
        />
        <MetricCard
          label="Profiles"
          value={String(profiles.length)}
          tone="light"
        />
        <MetricCard
          label="Active Clients"
          value={String(activeClients)}
          tone="success"
        />
      </section>

      <section className="space-y-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
            Navigation
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            Management Areas
          </h2>
          <p className="mt-2 text-slate-600">
            Access the main operational areas of the platform.
          </p>
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
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="mb-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
              Schedule
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Upcoming Schedule
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Earliest items currently in the system.
            </p>
          </div>

          {recentSchedule.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-sm text-slate-500">
              No schedule items yet.
            </div>
          ) : (
            <div className="space-y-3">
              {recentSchedule.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-white to-[#f8fbff] p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#bfdbfe] hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        {item.type && <MiniTypeBadge type={item.type} />}
                      </div>

                      <p className="mt-3 text-sm font-semibold text-slate-900">
                        {item.title || "Session"}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {profileNameMap[item.profileId] || "Unknown client"}
                      </p>
                    </div>

                    <div className="text-right text-sm font-medium text-slate-600">
                      <p>{item.date}</p>
                      <p>{item.startTime || "—"}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="mb-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
              Progress
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Recent Uploads
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Latest progress photos uploaded to the platform.
            </p>
          </div>

          {recentUploads.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-sm text-slate-500">
              No uploads yet.
            </div>
          ) : (
            <div className="space-y-3">
              {recentUploads.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-white to-[#f8fbff] p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#bfdbfe] hover:shadow-md"
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {item.title || "Progress update"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {profileNameMap[item.profileId] || "Unknown client"}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {formatTimestamp(item.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "dark" | "light" | "success";
}) {
  const styles: Record<
    "blue" | "dark" | "light" | "success",
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
    success: {
      card: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white",
      label: "text-emerald-700",
      value: "text-slate-950",
    },
  };

  return (
    <div
      className={`rounded-[24px] border p-6 shadow-[0_14px_40px_rgba(15,23,42,0.07)] ${styles[tone].card}`}
    >
      <p className={`text-sm font-semibold ${styles[tone].label}`}>{label}</p>
      <p className={`mt-3 text-3xl font-semibold tracking-tight ${styles[tone].value}`}>
        {value}
      </p>
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
      className="rounded-[24px] border border-white/80 bg-white/95 p-6 shadow-[0_14px_40px_rgba(15,23,42,0.07)] transition-all duration-200 hover:-translate-y-1 hover:border-[#bfdbfe] hover:shadow-[0_20px_45px_rgba(15,23,42,0.10)]"
    >
      <div className="inline-flex rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
        Open
      </div>

      <h2 className="mt-4 text-lg font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </a>
  );
}

function MiniTypeBadge({
  type,
}: {
  type: "training" | "nutrition" | "activity";
}) {
  const styles = {
    training: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
    nutrition: "border-emerald-200 bg-emerald-50 text-emerald-700",
    activity: "border-violet-200 bg-violet-50 text-violet-700",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${styles[type]}`}
    >
      {type}
    </span>
  );
}

function formatTimestamp(
  createdAt?: { seconds?: number; nanoseconds?: number }
) {
  if (!createdAt?.seconds) return "No date";

  const date = new Date(createdAt.seconds * 1000);

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}