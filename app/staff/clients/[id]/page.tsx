"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useToast } from "@/components/ui/ToastProvider";
import {
  canRoleAccessThread,
  filterVisibleThreads,
  formatThreadTimestamp,
  getMessageCategoryClasses,
  getMessageCategoryLabel,
  MessageThreadRecord,
  sortThreads,
} from "@/lib/messages";
import { BookingRecord } from "@/lib/bookings";
import { AppRole, getRoleLabel, normalizeRole } from "@/lib/roles";
import {
  getAllowedProviderRoles,
  getDeliveryMethodLabel,
  getProviderRoleLabel,
  getSessionPaymentStatusClasses,
  getSessionPaymentStatusLabel,
  getSessionStatusTone,
  normalizeSessionPayment,
  OnlineSessionRecord,
  sortSessions,
} from "@/lib/online-sessions";

type Profile = {
  id: string;
  userId?: string;
  fullName?: string;
  assignedProgram?: string;
  goal?: string;
  age?: string;
  height?: string;
  weight?: string;
  allergies?: string;
  injuries?: string;
  notes?: string;
  paymentStatus?: string;
  onboardingStatus?: string;
  approvalStatus?: string;
  clientStatus?: "active" | "inactive";
};

type ScheduleItem = {
  id: string;
  profileId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  type?: "training" | "nutrition" | "activity";
  title?: string;
  details?: string;
};

export default function StaffClientWorkspacePage() {
  const params = useParams<{ id: string }>();
  const profileId = Array.isArray(params?.id) ? params.id[0] : params?.id || "";

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole>("coach");
  const [uid, setUid] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [sessions, setSessions] = useState<OnlineSessionRecord[]>([]);
  const [threads, setThreads] = useState<MessageThreadRecord[]>([]);

  const { showToast } = useToast();

  useEffect(() => {
    const init = async () => {
      try {
        if (!profileId) {
          window.location.replace("/staff/clients");
          return;
        }

        await auth.authStateReady();
        const currentUser = auth.currentUser;

        if (!currentUser) {
          window.location.replace("/login");
          return;
        }

        const currentUserId = currentUser.uid;
        const currentUserSnap = await getDoc(doc(db, "users", currentUserId));
        const nextRole = normalizeRole(
          currentUserSnap.exists() ? currentUserSnap.data()?.role : "user"
        );

        if (
          nextRole !== "admin" &&
          nextRole !== "coach" &&
          nextRole !== "nutritionist"
        ) {
          window.location.replace("/dashboard");
          return;
        }

        const profileSnap = await getDoc(doc(db, "profiles", profileId));

        if (!profileSnap.exists()) {
          window.location.replace("/staff/clients");
          return;
        }

        const profileData = {
          id: profileSnap.id,
          ...(profileSnap.data() as Omit<Profile, "id">),
        } as Profile;

        const [bookingsSnap, scheduleSnap, sessionsSnap, threadsSnap, hiddenThreadsSnap] =
          await Promise.all([
            getDocs(query(collection(db, "bookings"), where("profileId", "==", profileId))),
            getDocs(query(collection(db, "scheduleItems"), where("profileId", "==", profileId))),
            getDocs(query(collection(db, "onlineSessions"), where("profileId", "==", profileId))),
            getDocs(query(collection(db, "messageThreads"), where("clientProfileId", "==", profileId))),
            getDocs(collection(db, "users", currentUserId, "hiddenThreads")),
          ]);

        const allowedScheduleType =
          nextRole === "nutritionist" ? "nutrition" : "training";
        const allowedProviderRoles = getAllowedProviderRoles(nextRole);

        setUid(currentUserId);
        setRole(nextRole);
        setProfile(profileData);
        setBookings(
          bookingsSnap.docs
            .map((docItem) => ({
              id: docItem.id,
              ...(docItem.data() as Omit<BookingRecord, "id">),
            })) as BookingRecord[]
        );
        setScheduleItems(
          (scheduleSnap.docs
            .map((docItem) => ({
              id: docItem.id,
              ...(docItem.data() as Omit<ScheduleItem, "id">),
            })) as ScheduleItem[])
            .filter((item) => item.type === allowedScheduleType)
            .sort((a, b) => {
              if (a.date !== b.date) return a.date.localeCompare(b.date);
              return (a.startTime || "").localeCompare(b.startTime || "");
            })
        );
        setSessions(
          sortSessions(
            (sessionsSnap.docs.map((docItem) => ({
              id: docItem.id,
              ...(docItem.data() as Omit<OnlineSessionRecord, "id">),
            })) as OnlineSessionRecord[]).filter((item) =>
              allowedProviderRoles.includes(item.providerRole)
            )
          )
        );
        setThreads(
          sortThreads(
            filterVisibleThreads(
              (threadsSnap.docs.map((docItem) => ({
              id: docItem.id,
              ...(docItem.data() as Omit<MessageThreadRecord, "id">),
            })) as MessageThreadRecord[]).filter((thread) =>
              canRoleAccessThread(thread, nextRole, currentUserId)
              ),
              new Set(hiddenThreadsSnap.docs.map((docItem) => docItem.id))
            )
          )
        );
      } catch (error) {
        console.error("Load staff client workspace error:", error);
        showToast({
          title: "Could not load client workspace",
          description: "Please refresh the page.",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [profileId, showToast]);

  const summary = useMemo(
    () => ({
      bookings: bookings.length,
      schedule: scheduleItems.length,
      sessions: sessions.length,
      threads: threads.length,
      unread: threads.filter((thread) => !thread.readByUserIds?.includes(uid)).length,
    }),
    [bookings.length, scheduleItems.length, sessions.length, threads, uid]
  );

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">
          Loading client workspace...
        </p>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/staff/clients"
          className="inline-flex rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          Back to Clients
        </Link>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/staff/schedule"
            className="rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            Open Schedule
          </Link>
          <Link
            href="/staff/sessions"
            className="rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            Open Sessions
          </Link>
          <Link
            href="/staff/messages"
            className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md"
          >
            Open Messages
          </Link>
        </div>
      </div>

      <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
        <div className="bg-gradient-to-r from-[#071120] via-[#123b76] to-[#2EA0FF] p-[1px]">
          <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
        </div>

        <div className="p-6 md:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
                {getRoleLabel(role)} workspace
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                {profile.fullName || "Client workspace"}
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
                Shared client context for on-site schedule work, private follow-up sessions, and support conversations.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:w-[360px]">
              <StatusBadge
                label="Approval"
                value={profile.approvalStatus || "—"}
                tone={profile.approvalStatus === "approved" ? "success" : "neutral"}
              />
              <StatusBadge
                label="Payment"
                value={profile.paymentStatus || "—"}
                tone={profile.paymentStatus === "paid" ? "success" : "warning"}
              />
              <StatusBadge
                label="Onboarding"
                value={profile.onboardingStatus || "—"}
                tone={profile.onboardingStatus === "active" ? "success" : "warning"}
              />
              <StatusBadge
                label="Client"
                value={profile.clientStatus || "active"}
                tone={profile.clientStatus === "inactive" ? "neutral" : "success"}
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <HeaderPill label="Bookings" value={String(summary.bookings)} />
            <HeaderPill label="Your Schedule Items" value={String(summary.schedule)} />
            <HeaderPill label="Sessions" value={String(summary.sessions)} />
            <HeaderPill label="Threads" value={String(summary.threads)} />
            <HeaderPill label="Unread" value={String(summary.unread)} />
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <h2 className="text-base font-semibold text-slate-950">Client Snapshot</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <InfoCard label="Assigned program" value={profile.assignedProgram || "Not assigned"} />
            <InfoCard label="Goal" value={profile.goal || "Not provided"} />
            <InfoCard label="Age" value={profile.age || "Not provided"} />
            <InfoCard label="Role view" value={getRoleLabel(role)} />
            <InfoCard label="Height" value={profile.height || "Not provided"} />
            <InfoCard label="Weight" value={profile.weight || "Not provided"} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <InfoCard label="Allergies" value={profile.allergies || "None provided"} />
            <InfoCard label="Injuries" value={profile.injuries || "None provided"} />
          </div>
          <div className="mt-4 rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
            <p className="text-sm font-semibold text-slate-700">Client notes</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {profile.notes || "No client notes saved."}
            </p>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <h2 className="text-base font-semibold text-slate-950">Bootcamp Stay</h2>
          <p className="mt-1 text-sm text-slate-500">
            Read-only booking context for this client.
          </p>

          <div className="mt-5">
            {bookings.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">
                No bookings attached to this client.
              </div>
            ) : (
              <div className="grid gap-3">
                {bookings.map((booking) => (
                  <div key={booking.id} className="rounded-2xl border bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                        {booking.status}
                      </span>
                      <span className="rounded-full border border-[#dbeafe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1d4ed8]">
                        {booking.durationWeeks} week{booking.durationWeeks === 1 ? "" : "s"}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {booking.paymentStatus}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-700">
                      Start week: {booking.startWeekId || "—"} · Capacity:{" "}
                      {booking.consumesCapacity ? "consumes" : "does not consume"}
                    </p>
                    {booking.shortStay ? (
                      <p className="mt-2 text-sm text-slate-600">
                        Short stay · {booking.shortStayNights || 0} nights
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
        <h2 className="text-base font-semibold text-slate-950">Your Area In The Schedule</h2>
        <p className="mt-1 text-sm text-slate-500">
          Only the schedule items that belong to your discipline are shown here.
        </p>

        <div className="mt-5">
          {scheduleItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">
              No schedule items found for your area.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {scheduleItems.map((item) => (
                <div key={item.id} className="rounded-2xl border bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-[#dbeafe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1d4ed8]">
                      {item.type}
                    </span>
                    <p className="text-sm font-medium text-slate-700">
                      {item.startTime || "—"}
                      {item.endTime ? ` - ${item.endTime}` : ""}
                    </p>
                  </div>
                  <p className="mt-3 font-medium text-slate-950">
                    {item.title?.trim() || "Schedule item"}
                  </p>
                  {item.details?.trim() ? (
                    <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                      {item.details}
                    </p>
                  ) : null}
                  <p className="mt-3 text-xs uppercase tracking-[0.14em] text-slate-400">
                    {item.date}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
        <h2 className="text-base font-semibold text-slate-950">Private Sessions</h2>
        <p className="mt-1 text-sm text-slate-500">
          Sessions remain separate from the on-site itinerary and follow your role permissions.
        </p>

        <div className="mt-5">
          {sessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">
              No private sessions in your area.
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {sessions.map((item) => {
                const payment = normalizeSessionPayment(item);

                return (
                  <div key={item.id} className="rounded-2xl border bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <SessionStatusBadge status={item.status} />
                      <span className="rounded-full border border-[#dbeafe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1d4ed8]">
                        {getProviderRoleLabel(item.providerRole)}
                      </span>
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${getSessionPaymentStatusClasses(payment.paymentStatus)}`}
                      >
                        {getSessionPaymentStatusLabel(payment.paymentStatus)}
                      </span>
                    </div>
                    <p className="mt-3 font-medium text-slate-950">
                      {item.title?.trim() || "Private session"}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {item.scheduledDate} at {item.startTime} · {item.durationMinutes} min
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      {getDeliveryMethodLabel(item.deliveryMethod)}
                    </p>
                    {item.notes?.trim() ? (
                      <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                        {item.notes}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
        <h2 className="text-base font-semibold text-slate-950">Client Conversations</h2>
        <p className="mt-1 text-sm text-slate-500">
          Support threads visible to your role.
        </p>

        <div className="mt-5">
          {threads.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">
              No support threads available.
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {threads.map((thread) => (
                <div key={thread.id} className="rounded-2xl border bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${getMessageCategoryClasses(thread.category)}`}
                    >
                      {getMessageCategoryLabel(thread.category)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {thread.status}
                    </span>
                    {!thread.readByUserIds?.includes(uid) ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                        Unread
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 font-medium text-slate-950">{thread.subject}</p>
                  <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                    {thread.lastMessagePreview || "No preview yet."}
                  </p>
                  <p className="mt-3 text-xs uppercase tracking-[0.14em] text-slate-400">
                    {formatThreadTimestamp(thread.lastMessageAt || thread.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
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

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm text-slate-700">{value}</p>
    </div>
  );
}

function StatusBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "neutral";
}) {
  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 ${styles[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold capitalize">{value}</p>
    </div>
  );
}

function SessionStatusBadge({
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
