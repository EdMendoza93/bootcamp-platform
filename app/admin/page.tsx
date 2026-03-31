"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { useToast } from "@/components/ui/ToastProvider";
import SegmentedTabs from "@/components/ui/SegmentedTabs";
import {
  formatThreadTimestamp,
  getMessageCategoryClasses,
  getMessageCategoryLabel,
  MessageThreadRecord,
  sortThreads,
} from "@/lib/messages";
import {
  getProviderRoleLabel,
  getSessionPaymentStatusClasses,
  getSessionPaymentStatusLabel,
  getSessionStatusTone,
  isUpcomingSession,
  normalizeSessionPayment,
  OnlineSessionRecord,
  sortSessions,
} from "@/lib/online-sessions";

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
  imageUrl?: string;
  title?: string;
  photoDate?: string;
  createdAt?: {
    seconds?: number;
    nanoseconds?: number;
  };
};

type AdminTab = "overview" | "operations" | "activity";

function getPhotoSortValue(photo: ProgressPhoto) {
  if (photo.photoDate) {
    return new Date(`${photo.photoDate}T12:00:00`).getTime();
  }

  return (photo.createdAt?.seconds || 0) * 1000;
}

function formatPhotoDate(
  photoDate?: string,
  createdAt?: { seconds?: number; nanoseconds?: number }
) {
  if (photoDate) {
    const parsed = new Date(`${photoDate}T12:00:00`);
    return parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (createdAt?.seconds) {
    const parsed = new Date(createdAt.seconds * 1000);
    return parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return "No date";
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");

  const [applications, setApplications] = useState<Application[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);
  const [onlineSessions, setOnlineSessions] = useState<OnlineSessionRecord[]>([]);
  const [messageThreads, setMessageThreads] = useState<MessageThreadRecord[]>([]);
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

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
        setCurrentUserId(currentUser.uid);

        const [appsSnap, profilesSnap, scheduleSnap, progressSnap, sessionsSnap, threadsSnap] =
          await Promise.all([
            getDocs(collection(db, "applications")),
            getDocs(collection(db, "profiles")),
            getDocs(collection(db, "scheduleItems")),
            getDocs(collection(db, "progressPhotos")),
            getDocs(collection(db, "onlineSessions")),
            getDocs(collection(db, "messageThreads")),
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

        const progressData = progressSnap.docs
          .map((docItem) => ({
            id: docItem.id,
            ...(docItem.data() as Omit<ProgressPhoto, "id">),
          }))
          .sort((a, b) => getPhotoSortValue(b) - getPhotoSortValue(a)) as ProgressPhoto[];

        const sessionData = sortSessions(
          sessionsSnap.docs.map((docItem) => ({
            id: docItem.id,
            ...(docItem.data() as Omit<OnlineSessionRecord, "id">),
          })) as OnlineSessionRecord[]
        );

        const threadData = sortThreads(
          threadsSnap.docs.map((docItem) => ({
            id: docItem.id,
            ...(docItem.data() as Omit<MessageThreadRecord, "id">),
          })) as MessageThreadRecord[]
        );

        scheduleData.sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return (a.startTime || "").localeCompare(b.startTime || "");
        });

        setApplications(appData);
        setProfiles(profileData);
        setScheduleItems(scheduleData);
        setProgressPhotos(progressData);
        setOnlineSessions(sessionData);
        setMessageThreads(threadData);
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

  const rejectedApplications = useMemo(
    () => applications.filter((item) => item.status === "rejected").length,
    [applications]
  );

  const activeClients = useMemo(
    () =>
      profiles.filter((item) => (item.clientStatus || "active") === "active")
        .length,
    [profiles]
  );

  const inactiveClients = useMemo(
    () =>
      profiles.filter((item) => (item.clientStatus || "active") === "inactive")
        .length,
    [profiles]
  );

  const pendingPayments = useMemo(
    () =>
      profiles.filter((item) => (item.paymentStatus || "pending") === "pending")
        .length,
    [profiles]
  );

  const recentSchedule = useMemo(() => scheduleItems.slice(0, 6), [scheduleItems]);
  const recentUploads = useMemo(() => progressPhotos.slice(0, 6), [progressPhotos]);
  const recentSessions = useMemo(
    () =>
      onlineSessions
        .filter((item) => item.status === "scheduled")
        .slice(0, 4),
    [onlineSessions]
  );
  const recentThreads = useMemo(() => messageThreads.slice(0, 4), [messageThreads]);

  const sessionSummary = useMemo(
    () => ({
      total: onlineSessions.length,
      upcoming: onlineSessions.filter((item) => isUpcomingSession(item)).length,
      paymentPending: onlineSessions.filter(
        (item) => normalizeSessionPayment(item).paymentStatus === "pending"
      ).length,
    }),
    [onlineSessions]
  );

  const threadSummary = useMemo(
    () => ({
      open: messageThreads.filter((item) => item.status === "open").length,
      unread: currentUserId
        ? messageThreads.filter(
            (item) => !item.readByUserIds?.includes(currentUserId)
          ).length
        : 0,
    }),
    [currentUserId, messageThreads]
  );

  const profileNameMap = useMemo(() => {
    const map: Record<string, string> = {};

    profiles.forEach((profile) => {
      map[profile.id] = profile.fullName || "Unnamed profile";
    });

    return map;
  }, [profiles]);

  const nextActions = useMemo(() => {
    const actions: Array<{
      title: string;
      description: string;
      href: string;
      tone: "blue" | "amber" | "emerald";
    }> = [];

    if (pendingApplications > 0) {
      actions.push({
        title: `${pendingApplications} application${
          pendingApplications === 1 ? "" : "s"
        } pending review`,
        description:
          "Approve or reject new applicants and move them into the onboarding flow.",
        href: "/admin/applications",
        tone: "blue",
      });
    }

    if (pendingPayments > 0) {
      actions.push({
        title: `${pendingPayments} client${
          pendingPayments === 1 ? "" : "s"
        } with payment pending`,
        description:
          "Check profiles that still need payment confirmation before full access.",
        href: "/admin/profiles",
        tone: "amber",
      });
    }

    if (actions.length === 0) {
      actions.push({
        title: "System ready",
        description:
          "Applications, client profiles, and schedule are currently under control.",
        href: "/admin/profiles",
        tone: "emerald",
      });
    }

    return actions.slice(0, 3);
  }, [pendingApplications, pendingPayments]);

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
        <div className="bg-gradient-to-r from-[#071120] via-[#123b76] to-[#2EA0FF] p-[1px]">
          <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
        </div>

        <div className="relative overflow-hidden p-6 md:p-8">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#2EA0FF]/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-emerald-300/10 blur-3xl" />

          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
                Admin overview
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                Control Center
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
                Monitor applications, clients, schedule, templates, and uploads from one place.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <HeroPill label="Applications" value={String(applications.length)} />
                <HeroPill label="Clients" value={String(profiles.length)} />
                <HeroPill label="Schedule" value={String(scheduleItems.length)} />
                <HeroPill label="Sessions" value={String(onlineSessions.length)} />
                <HeroPill label="Inbox" value={String(messageThreads.length)} />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href="/admin/applications"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                Review Applications
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Pending Applications"
          value={String(pendingApplications)}
          tone="blue"
        />
        <MetricCard
          label="Approved Applications"
          value={String(approvedApplications)}
          tone="success"
        />
        <MetricCard
          label="Active Clients"
          value={String(activeClients)}
          tone="dark"
        />
        <MetricCard
          label="Pending Payments"
          value={String(pendingPayments)}
          tone="light"
        />
      </section>

      <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              Daily focus
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Keep one work lane open at a time.
            </p>
          </div>
          <SegmentedTabs
            items={[
              { id: "overview", label: "Overview" },
              { id: "operations", label: "Operations" },
              { id: "activity", label: "Activity" },
            ]}
            value={activeTab}
            onChange={setActiveTab}
          />
        </div>

        {activeTab === "overview" ? (
      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
            Next actions
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            Priority Queue
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            The fastest actions to keep the operation moving.
          </p>

          <div className="mt-6 grid gap-4">
            {nextActions.map((action) => (
              <ActionCard
                key={action.title}
                title={action.title}
                description={action.description}
                href={action.href}
                tone={action.tone}
              />
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
            Snapshot
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            Business Health
          </h2>

          <div className="mt-6 space-y-4">
            <MiniStat label="Profiles" value={String(profiles.length)} />
            <MiniStat label="Inactive Clients" value={String(inactiveClients)} />
            <MiniStat label="Rejected Applications" value={String(rejectedApplications)} />
            <MiniStat label="Schedule Items" value={String(scheduleItems.length)} />
            <MiniStat label="Photo Uploads" value={String(progressPhotos.length)} />
          </div>

          <div className="mt-6 rounded-[22px] border border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1d4ed8]">
              Operational note
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              This overview now acts as a fast daily checkpoint so pending work, client movement, and schedule pressure are easier to read at a glance.
            </p>
          </div>
        </div>
      </section>
        ) : null}

        {activeTab === "operations" ? (
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <QuickLinkCard
          href="/admin/applications"
          title="Applications"
          description="Review applicants, approve decisions, and create profiles."
        />
        <QuickLinkCard
          href="/admin/profiles"
          title="Profiles"
          description="Manage payment, onboarding, program status, and client records."
        />
        <QuickLinkCard
          href="/admin/schedule"
          title="Schedule"
          description="Build itinerary items quickly with templates or custom details."
        />
        <QuickLinkCard
          href="/admin/templates"
          title="Templates"
          description="Maintain reusable training, nutrition, and activity content."
        />
        <QuickLinkCard
          href="/admin/progress"
          title="Progress"
          description="Review recent photo uploads and keep transformations organized."
        />
        <QuickLinkCard
          href="/admin/online-sessions"
          title="Online Sessions"
          description="Manage post-bootcamp follow-up calls without mixing them into the on-site schedule."
        />
        <QuickLinkCard
          href="/admin/messages"
          title="Messages"
          description="Stay on top of coach, nutrition, and private session threads."
        />
      </section>
        ) : null}

        {activeTab === "activity" ? (
        <>
      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                Follow-up
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                Sessions Watch
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Private calls stay separate from the bootcamp itinerary and can carry payment state later.
              </p>
            </div>
            <a
              href="/admin/online-sessions"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              Open Sessions
            </a>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <MiniStat label="Total" value={String(sessionSummary.total)} />
            <MiniStat label="Upcoming" value={String(sessionSummary.upcoming)} />
            <MiniStat
              label="Payment Pending"
              value={String(sessionSummary.paymentPending)}
            />
          </div>

          {recentSessions.length === 0 ? (
            <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              No scheduled follow-up sessions yet.
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {recentSessions.map((item) => {
                const profile = profileNameMap[item.profileId] || "Unknown client";
                const payment = normalizeSessionPayment(item);

                return (
                  <div
                    key={item.id}
                    className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <SessionStatusPill status={item.status} />
                      <span className="rounded-full border border-[#dbeafe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1d4ed8]">
                        {getProviderRoleLabel(item.providerRole)}
                      </span>
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${getSessionPaymentStatusClasses(payment.paymentStatus)}`}
                      >
                        {getSessionPaymentStatusLabel(payment.paymentStatus)}
                      </span>
                    </div>

                    <p className="mt-3 text-sm font-semibold text-slate-900">
                      {item.title?.trim() || "Private session"}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {profile} · {item.scheduledDate} at {item.startTime}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                      {payment.paymentRequired
                        ? payment.price
                          ? `${payment.currency} ${payment.price}`
                          : "Payment required"
                        : "No payment attached"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                Inbox
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                Message Watch
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Keep an eye on client questions across coach, nutrition, and private session threads.
              </p>
            </div>
            <a
              href="/admin/messages"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              Open Inbox
            </a>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <MiniStat label="Open Threads" value={String(threadSummary.open)} />
            <MiniStat label="Unread" value={String(threadSummary.unread)} />
          </div>

          {recentThreads.length === 0 ? (
            <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              No client conversations yet.
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {recentThreads.map((thread) => {
                const isUnread = currentUserId
                  ? !thread.readByUserIds?.includes(currentUserId)
                  : false;

                return (
                  <a
                    key={thread.id}
                    href="/admin/messages"
                    className="block rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${getMessageCategoryClasses(thread.category)}`}
                      >
                        {getMessageCategoryLabel(thread.category)}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {thread.status}
                      </span>
                      {isUnread ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                          Unread
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-900">
                      {thread.subject}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {thread.clientName || "Client thread"}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-500">
                      {thread.lastMessagePreview || "No message preview yet."}
                    </p>
                    <p className="mt-3 text-xs uppercase tracking-[0.14em] text-slate-400">
                      {formatThreadTimestamp(thread.lastMessageAt || thread.createdAt)}
                    </p>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="mb-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
              Schedule
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Upcoming Schedule
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Earliest items currently in the system.
            </p>
          </div>

          {recentSchedule.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              No schedule items yet.
            </div>
          ) : (
            <div className="space-y-3">
              {recentSchedule.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                        {item.type || "Session"}
                      </div>

                      <p className="mt-3 text-sm font-semibold text-slate-900">
                        {item.title || "Session"}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {profileNameMap[item.profileId] || "Unknown client"}
                      </p>
                    </div>

                    <div className="text-right text-sm text-slate-600">
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
          <div className="mb-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
              Progress
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Recent Uploads
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Latest progress photos uploaded to the platform.
            </p>
          </div>

          {recentUploads.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              No uploads yet.
            </div>
          ) : (
            <div className="space-y-3">
              {recentUploads.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt={item.title || "Progress update"}
                          width={112}
                          height={112}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                          No image
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {item.title || "Progress update"}
                      </p>
                      <p className="mt-1 truncate text-sm text-slate-600">
                        {profileNameMap[item.profileId] || "Unknown client"}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        {formatPhotoDate(item.photoDate, item.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
        </>
        ) : null}
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
      className={`rounded-[18px] border px-4 py-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.06)] ${styles[tone].card}`}
    >
      <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${styles[tone].label}`}>
        {label}
      </p>
      <p
        className={`mt-1.5 text-2xl font-semibold tracking-tight ${styles[tone].value}`}
      >
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
      className="group rounded-[24px] border border-white/80 bg-white/95 p-6 shadow-[0_14px_40px_rgba(15,23,42,0.07)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(15,23,42,0.10)]"
    >
      <div className="mb-4 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 transition group-hover:border-[#bfdbfe] group-hover:bg-[#eff6ff] group-hover:text-[#1d4ed8]">
        Open
      </div>
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </a>
  );
}

function ActionCard({
  title,
  description,
  href,
  tone,
}: {
  title: string;
  description: string;
  href: string;
  tone: "blue" | "amber" | "emerald";
}) {
  const styles: Record<"blue" | "amber" | "emerald", string> = {
    blue: "border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white",
    amber: "border-amber-200 bg-gradient-to-br from-amber-50 to-white",
    emerald: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white",
  };

  return (
    <a
      href={href}
      className={`rounded-[22px] border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${styles[tone]}`}
    >
      <p className="text-base font-semibold text-slate-950">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </a>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-[18px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white px-4 py-3">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <span className="text-sm font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function HeroPill({
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

function SessionStatusPill({
  status,
}: {
  status: OnlineSessionRecord["status"];
}) {
  const tone = getSessionStatusTone(status);

  const classes =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-[#dbeafe] bg-[#eff6ff] text-[#1d4ed8]";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${classes}`}
    >
      {status}
    </span>
  );
}
