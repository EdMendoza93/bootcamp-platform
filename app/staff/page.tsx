"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";
import { useToast } from "@/components/ui/ToastProvider";
import SegmentedTabs from "@/components/ui/SegmentedTabs";
import {
  AppRole,
  getRoleLabel,
  normalizeRole,
} from "@/lib/roles";
import {
  canRoleAccessThread,
  filterVisibleThreads,
  formatThreadTimestamp,
  getMessageCategoryClasses,
  getMessageCategoryLabel,
  MessageThreadRecord,
  sortThreads,
} from "@/lib/messages";
import {
  getAllowedProviderRoles,
  getProviderRoleLabel,
  getSessionPaymentStatusClasses,
  getSessionPaymentStatusLabel,
  getSessionStatusTone,
  isUpcomingSession,
  normalizeSessionPayment,
  OnlineSessionRecord,
  sortSessions,
} from "@/lib/online-sessions";

type Profile = {
  id: string;
  fullName?: string;
  clientStatus?: "active" | "inactive";
  assignedProgram?: string;
};

type ScheduleItem = {
  id: string;
  date: string;
  startTime?: string;
  title?: string;
  type?: "training" | "nutrition" | "activity";
  profileId: string;
};

type StaffTab = "overview" | "delivery" | "inbox";

export default function StaffOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole>("coach");
  const [uid, setUid] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [sessions, setSessions] = useState<OnlineSessionRecord[]>([]);
  const [threads, setThreads] = useState<MessageThreadRecord[]>([]);
  const [activeTab, setActiveTab] = useState<StaffTab>("overview");

  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        await auth.authStateReady();
        const currentUser = auth.currentUser;

        if (!currentUser) {
          window.location.replace("/login");
          return;
        }

        const userSnap = await getDoc(doc(db, "users", currentUser.uid));
        const nextRole = normalizeRole(
          userSnap.exists() ? userSnap.data()?.role : "user"
        );

        if (
          nextRole !== "admin" &&
          nextRole !== "coach" &&
          nextRole !== "nutritionist"
        ) {
          window.location.replace("/dashboard");
          return;
        }

        const [profilesSnap, scheduleSnap, sessionsSnap, threadsSnap, hiddenThreadsSnap] =
          await Promise.all([
            getDocs(collection(db, "profiles")),
            getDocs(collection(db, "scheduleItems")),
            getDocs(collection(db, "onlineSessions")),
            getDocs(collection(db, "messageThreads")),
            getDocs(collection(db, "users", currentUser.uid, "hiddenThreads")),
          ]);

        const profileRows = profilesSnap.docs
          .map((docItem) => ({
            id: docItem.id,
            ...(docItem.data() as Omit<Profile, "id">),
          }))
          .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "")) as Profile[];

        const allowedScheduleType =
          nextRole === "nutritionist" ? "nutrition" : "training";
        const allowedProviderRoles = getAllowedProviderRoles(nextRole);

        const scheduleRows = (scheduleSnap.docs
          .map((docItem) => ({
            id: docItem.id,
            ...(docItem.data() as Omit<ScheduleItem, "id">),
          })) as ScheduleItem[])
          .filter((item) => item.type === allowedScheduleType)
          .sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return (a.startTime || "").localeCompare(b.startTime || "");
          });

        const sessionRows = sortSessions(
          (sessionsSnap.docs.map((docItem) => ({
            id: docItem.id,
            ...(docItem.data() as Omit<OnlineSessionRecord, "id">),
          })) as OnlineSessionRecord[]).filter((item) =>
            allowedProviderRoles.includes(item.providerRole)
          )
        );

        const threadRows = sortThreads(
          filterVisibleThreads(
            (threadsSnap.docs.map((docItem) => ({
            id: docItem.id,
            ...(docItem.data() as Omit<MessageThreadRecord, "id">),
          })) as MessageThreadRecord[]).filter((item) =>
            canRoleAccessThread(item, nextRole, currentUser.uid)
            ),
            new Set(hiddenThreadsSnap.docs.map((docItem) => docItem.id))
          )
        );

        if (!cancelled) {
          setUid(currentUser.uid);
          setRole(nextRole);
          setProfiles(profileRows);
          setScheduleItems(scheduleRows);
          setSessions(sessionRows);
          setThreads(threadRows);
        }
      } catch (error) {
        console.error("Load staff overview error:", error);
        if (!cancelled) {
          showToast({
            title: "Could not load staff overview",
            description: "Please refresh the page.",
            type: "error",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const profileMap = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles]
  );

  const summary = useMemo(
    () => ({
      clients: profiles.length,
      activeClients: profiles.filter(
        (profile) => (profile.clientStatus || "active") === "active"
      ).length,
      scheduleItems: scheduleItems.length,
      upcomingSessions: sessions.filter((item) => isUpcomingSession(item)).length,
      unreadThreads: threads.filter((item) => !item.readByUserIds?.includes(uid))
        .length,
    }),
    [profiles, scheduleItems.length, sessions, threads, uid]
  );

  const recentSchedule = useMemo(() => scheduleItems.slice(0, 4), [scheduleItems]);
  const nextSessions = useMemo(
    () => sessions.filter((item) => item.status === "scheduled").slice(0, 4),
    [sessions]
  );
  const recentThreads = useMemo(() => threads.slice(0, 4), [threads]);

  const disciplineCopy =
    role === "nutritionist"
      ? "You can shape the nutrition side of every client plan and follow-up."
      : "You can shape the training side of every client plan and follow-up.";

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">
          Loading staff overview...
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

          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
                {getRoleLabel(role)}
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                Staff Workspace
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-600 md:text-base">
                {disciplineCopy}
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <HeroPill label="Clients" value={String(summary.clients)} />
                <HeroPill label="Your Area" value={getRoleLabel(role)} />
                <HeroPill label="Upcoming Sessions" value={String(summary.upcomingSessions)} />
                <HeroPill label="Unread Threads" value={String(summary.unreadThreads)} />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/staff/schedule"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                Open Schedule
              </Link>
              <Link
                href="/staff/messages"
                className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md"
              >
                Open Messages
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="All Clients" value={String(summary.clients)} tone="light" />
        <MetricCard label="Active Clients" value={String(summary.activeClients)} tone="success" />
        <MetricCard
          label={role === "nutritionist" ? "Nutrition Items" : "Training Items"}
          value={String(summary.scheduleItems)}
          tone="blue"
        />
        <MetricCard
          label="Private Sessions"
          value={String(summary.upcomingSessions)}
          tone="dark"
        />
        <MetricCard label="Unread Threads" value={String(summary.unreadThreads)} tone="light" />
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
            Staff focus
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Open one area at a time.
          </p>
        </div>
        <SegmentedTabs
          items={[
            { id: "overview", label: "Overview" },
            { id: "delivery", label: "Delivery" },
            { id: "inbox", label: "Inbox" },
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />
      </section>

      {activeTab === "delivery" ? (
      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                Shared schedule
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                Recent Work In Your Area
              </h2>
            </div>
            <Link
              href="/staff/schedule"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              Open
            </Link>
          </div>

          {recentSchedule.length === 0 ? (
            <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              No schedule items yet in your area.
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {recentSchedule.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="rounded-full border border-[#dbeafe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1d4ed8]">
                        {item.type}
                      </span>
                      <p className="mt-3 text-sm font-semibold text-slate-900">
                        {item.title?.trim() || "Schedule item"}
                      </p>
                      <Link
                        href={`/staff/clients/${item.profileId}`}
                        className="mt-1 inline-flex text-sm text-slate-600 hover:text-slate-950"
                      >
                        {profileMap.get(item.profileId)?.fullName || "Unknown client"}
                      </Link>
                    </div>
                    <div className="text-right text-xs uppercase tracking-[0.14em] text-slate-500">
                      <p>{item.date}</p>
                      <p className="mt-1">{item.startTime || "Time TBD"}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                Follow-up
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                Private Sessions
              </h2>
            </div>
            <Link
              href="/staff/sessions"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              Open
            </Link>
          </div>

          {nextSessions.length === 0 ? (
            <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              No private sessions scheduled in your area.
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {nextSessions.map((item) => {
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
                      <Link
                        href={`/staff/clients/${item.profileId}`}
                        className="hover:text-slate-950"
                      >
                        {profileMap.get(item.profileId)?.fullName || "Unknown client"}
                      </Link>{" "}
                      · {item.scheduledDate} at {item.startTime}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                      {payment.paymentRequired
                        ? payment.price
                          ? `${payment.currency} ${payment.price}`
                          : "Payment required"
                        : "No extra payment attached"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
      ) : null}

      {activeTab === "inbox" || activeTab === "overview" ? (
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                Inbox
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                Recent Conversations
              </h2>
            </div>
            <Link
              href="/staff/messages"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              Open
            </Link>
          </div>

          {recentThreads.length === 0 ? (
            <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              No conversations in your inbox yet.
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {recentThreads.map((thread) => {
                const isUnread = !thread.readByUserIds?.includes(uid);

                return (
                  <Link
                    key={thread.id}
                    href="/staff/messages"
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
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid gap-4">
          <InfoCard
            title="Shared Client View"
            body="All staff can see all clients so schedules, follow-up sessions, and support threads can be built collaboratively."
          />
          <InfoCard
            title="Area Permissions"
            body={
              role === "nutritionist"
                ? "You stay limited to nutrition content and nutrition-led follow-up work."
                : "You stay limited to training content and coaching-led follow-up work."
            }
          />
          <InfoCard
            title="Post-Bootcamp Flow"
            body="Private sessions and inbox support stay outside the on-site itinerary, which keeps the bootcamp schedule clean while still supporting long-term follow-up."
          />
        </div>
      </section>
      ) : null}
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

function InfoCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/80 bg-white/95 p-6 shadow-[0_14px_40px_rgba(15,23,42,0.07)]">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
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
