"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useToast } from "@/components/ui/ToastProvider";
import SegmentedTabs from "@/components/ui/SegmentedTabs";
import CollapsiblePanel from "@/components/ui/CollapsiblePanel";
import {
  getDeliveryMethodLabel,
  getProviderRoleLabel,
  getSessionPaymentStatusClasses,
  getSessionPaymentStatusLabel,
  getSessionStatusTone,
  isUpcomingSession,
  normalizeSessionPayment,
  OnlineSessionRecord,
  OnlineSessionStatus,
  sortSessions,
} from "@/lib/online-sessions";

type Profile = {
  id: string;
  fullName: string;
};

type SessionTab = "overview" | "timeline";

export default function DashboardSessionsPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<OnlineSessionRecord[]>([]);
  const [activeTab, setActiveTab] = useState<SessionTab>("overview");
  const [statusFilter, setStatusFilter] = useState<"all" | OnlineSessionStatus>("all");

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

        const profileSnap = await getDocs(
          query(collection(db, "profiles"), where("userId", "==", currentUser.uid))
        );

        if (profileSnap.empty) {
          if (!cancelled) {
            setProfile(null);
            setSessions([]);
          }
          return;
        }

        const profileDoc = profileSnap.docs[0];
        const profileData = profileDoc.data() as Omit<Profile, "id">;

        const sessionsSnap = await getDocs(
          query(collection(db, "onlineSessions"), where("profileId", "==", profileDoc.id))
        );

        if (!cancelled) {
          setProfile({
            id: profileDoc.id,
            ...profileData,
          });
          setSessions(
            sortSessions(
              sessionsSnap.docs.map((docItem) => ({
                id: docItem.id,
                ...(docItem.data() as Omit<OnlineSessionRecord, "id">),
              })) as OnlineSessionRecord[]
            )
          );
        }
      } catch (error) {
        console.error("Load dashboard sessions error:", error);
        if (!cancelled) {
          showToast({
            title: "Could not load sessions",
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

  const visibleSessions = useMemo(() => {
    return sessions.filter((item) => statusFilter === "all" || item.status === statusFilter);
  }, [sessions, statusFilter]);

  const summary = useMemo(
    () => ({
      total: sessions.length,
      upcoming: sessions.filter((item) => isUpcomingSession(item)).length,
      completed: sessions.filter((item) => item.status === "completed").length,
      paymentPending: sessions.filter(
        (item) => normalizeSessionPayment(item).paymentStatus === "pending"
      ).length,
    }),
    [sessions]
  );

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">
          Loading your sessions...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-28">
      <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
        <div className="bg-gradient-to-r from-[#071120] via-[#123b76] to-[#2EA0FF] p-[1px]">
          <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
        </div>
        <div className="relative overflow-hidden p-6 md:p-8">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#2EA0FF]/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-emerald-300/10 blur-3xl" />
          <div className="relative">
            <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
              Sessions
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Your Online Sessions
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-600 md:text-base">
              Keep track of private Zoom or WhatsApp sessions booked for your
              bootcamp journey.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <HeaderPill label="Client" value={profile?.fullName || "Profile pending"} />
              <HeaderPill label="Total" value={String(summary.total)} />
              <HeaderPill label="Upcoming" value={String(summary.upcoming)} />
              <HeaderPill
                label="Payment pending"
                value={String(summary.paymentPending)}
              />
            </div>

            <div className="mt-6">
              <SegmentedTabs<SessionTab>
                items={[
                  { id: "overview", label: "Overview" },
                  { id: "timeline", label: "Timeline" },
                ]}
                value={activeTab}
                onChange={setActiveTab}
              />
            </div>
          </div>
        </div>
      </section>

      {activeTab === "overview" ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatusCard label="Total sessions" value={String(summary.total)} />
          <StatusCard label="Upcoming" value={String(summary.upcoming)} />
          <StatusCard label="Completed" value={String(summary.completed)} />
          <StatusCard label="Payment pending" value={String(summary.paymentPending)} />
        </section>
      ) : null}

      {activeTab === "timeline" ? (
      <section className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Session timeline</h2>
          <p className="mt-2 text-sm text-slate-600">
            You will find your meeting type, date, status, and direct link here.
          </p>
        </div>

        <div className="mt-5">
          <CollapsiblePanel
            title="Status filter"
            description="Open only when you need to narrow the list."
          >
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "all" | OnlineSessionStatus)
              }
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none"
            >
              <option value="all">All status</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </CollapsiblePanel>
        </div>

        {!profile ? (
          <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
            Your profile is not connected yet, so sessions cannot be shown here.
          </div>
        ) : visibleSessions.length === 0 ? (
          <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
            No sessions match the current filter.
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            {visibleSessions.map((item) => (
              <div
                key={item.id}
                className="rounded-[24px] border border-slate-100 bg-gradient-to-br from-white to-[#f8fbff] p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status={item.status} />
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${getSessionPaymentStatusClasses(normalizeSessionPayment(item).paymentStatus)}`}
                      >
                        {getSessionPaymentStatusLabel(
                          normalizeSessionPayment(item).paymentStatus
                        )}
                      </span>
                      <span className="rounded-full border border-[#dbeafe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1d4ed8]">
                        {getProviderRoleLabel(item.providerRole)}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {getDeliveryMethodLabel(item.deliveryMethod)}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-slate-950">
                      {item.title?.trim() || "Private session"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {item.scheduledDate} at {item.startTime} · {item.durationMinutes} min
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      {normalizeSessionPayment(item).paymentRequired
                        ? normalizeSessionPayment(item).price
                          ? `${normalizeSessionPayment(item).currency} ${normalizeSessionPayment(item).price}`
                          : "Payment will be confirmed by the team"
                        : "No extra payment attached"}
                    </p>
                    {item.notes ? (
                      <p className="mt-3 text-sm leading-6 text-slate-700">
                        {item.notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-start">
                    {item.meetingLink ? (
                      <a
                        href={item.meetingLink}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                      >
                        Open link
                      </a>
                    ) : (
                      <span className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-500">
                        Link coming soon
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      ) : null}
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

function StatusPill({ status }: { status: OnlineSessionStatus }) {
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

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white px-4 py-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1.5 text-base font-semibold text-slate-950">{value}</p>
    </div>
  );
}
