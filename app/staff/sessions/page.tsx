"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useToast } from "@/components/ui/ToastProvider";
import { AppRole, getRoleLabel, normalizeRole } from "@/lib/roles";
import {
  getAllowedProviderRoles,
  getDeliveryMethodLabel,
  getProviderRoleLabel,
  getSessionPaymentStatusClasses,
  getSessionPaymentStatusLabel,
  getSessionStatusTone,
  normalizeSessionPayment,
  OnlineSessionDeliveryMethod,
  OnlineSessionProviderRole,
  OnlineSessionRecord,
  OnlineSessionStatus,
  sortSessions,
} from "@/lib/online-sessions";

type Profile = {
  id: string;
  fullName: string;
  clientStatus?: "active" | "inactive";
  assignedProgram?: string;
};

export default function StaffSessionsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<AppRole>("coach");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sessions, setSessions] = useState<OnlineSessionRecord[]>([]);
  const [profileSearch, setProfileSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OnlineSessionStatus>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    profileId: "",
    providerRole: "coach" as OnlineSessionProviderRole,
    scheduledDate: "",
    startTime: "",
    durationMinutes: "60",
    deliveryMethod: "zoom" as OnlineSessionDeliveryMethod,
    meetingLink: "",
    title: "",
    notes: "",
    status: "scheduled" as OnlineSessionStatus,
  });

  const { showToast } = useToast();
  const allowedRoles = useMemo(() => getAllowedProviderRoles(role), [role]);

  const loadData = useCallback(async () => {
    const [profilesSnap, sessionsSnap] = await Promise.all([
      getDocs(collection(db, "profiles")),
      getDocs(collection(db, "onlineSessions")),
    ]);

    const profileRows = profilesSnap.docs
      .map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<Profile, "id">),
      }))
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "")) as Profile[];

    const sessionRows = sortSessions(
      (sessionsSnap.docs.map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<OnlineSessionRecord, "id">),
      })) as OnlineSessionRecord[]).filter((item) =>
        allowedRoles.includes(item.providerRole)
      )
    );

    setProfiles(profileRows);
    setSessions(sessionRows);
  }, [allowedRoles]);

  useEffect(() => {
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

        setRole(nextRole);
        setForm((prev) => ({
          ...prev,
          providerRole: nextRole === "nutritionist" ? "nutritionist" : "coach",
        }));
      } catch (error) {
        console.error("Load staff sessions role error:", error);
      }
    };

    void init();
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        await loadData();
      } catch (error) {
        console.error("Load staff sessions error:", error);
        showToast({
          title: "Could not load sessions",
          description: "Please refresh the page.",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    };

    if (role) {
      void init();
    }
  }, [loadData, role, showToast]);

  const profileMap = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles]
  );

  const filteredProfiles = useMemo(() => {
    const queryText = profileSearch.trim().toLowerCase();
    return profiles.filter((profile) => {
      const haystack =
        `${profile.fullName || ""} ${profile.assignedProgram || ""}`.toLowerCase();
      return !queryText || haystack.includes(queryText);
    });
  }, [profileSearch, profiles]);

  const visibleSessions = useMemo(() => {
    return sessions.filter((item) => statusFilter === "all" || item.status === statusFilter);
  }, [sessions, statusFilter]);

  const summary = useMemo(
    () => ({
      total: sessions.length,
      scheduled: sessions.filter((item) => item.status === "scheduled").length,
      completed: sessions.filter((item) => item.status === "completed").length,
    }),
    [sessions]
  );

  const resetForm = () => {
    setEditingId(null);
    setForm({
      profileId: "",
      providerRole: role === "nutritionist" ? "nutritionist" : "coach",
      scheduledDate: "",
      startTime: "",
      durationMinutes: "60",
      deliveryMethod: "zoom",
      meetingLink: "",
      title: "",
      notes: "",
      status: "scheduled",
    });
  };

  const saveSession = async () => {
    const currentUser = auth.currentUser;
    const durationMinutes = Number(form.durationMinutes);

    if (!currentUser || !form.profileId || !form.scheduledDate || !form.startTime || !durationMinutes) {
      showToast({
        title: "Missing information",
        description: "Please complete client, date, time, and duration.",
        type: "error",
      });
      return;
    }

    if (!allowedRoles.includes(form.providerRole)) {
      showToast({
        title: "Not allowed",
        description: "You can only create sessions in your own area.",
        type: "error",
      });
      return;
    }

    setSaving(true);

    try {
      const payload = {
        profileId: form.profileId,
        providerRole: form.providerRole,
        scheduledDate: form.scheduledDate,
        startTime: form.startTime,
        durationMinutes,
        deliveryMethod: form.deliveryMethod,
        meetingLink: form.meetingLink.trim(),
        title: form.title.trim(),
        notes: form.notes.trim(),
        status: form.status,
        createdByUid: currentUser.uid,
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, "onlineSessions", editingId), payload);
      } else {
        await addDoc(collection(db, "onlineSessions"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      await loadData();
      resetForm();

      showToast({
        title: editingId ? "Session updated" : "Session created",
        description: "Your online session board was updated.",
        type: "success",
      });
    } catch (error) {
      console.error("Save staff session error:", error);
      showToast({
        title: "Save failed",
        description: "Could not save the session.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: OnlineSessionRecord) => {
    setEditingId(item.id);
    setForm({
      profileId: item.profileId,
      providerRole: item.providerRole,
      scheduledDate: item.scheduledDate,
      startTime: item.startTime,
      durationMinutes: String(item.durationMinutes || 60),
      deliveryMethod: item.deliveryMethod,
      meetingLink: item.meetingLink || "",
      title: item.title || "",
      notes: item.notes || "",
      status: item.status,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteSession = async (id: string) => {
    const confirmed = window.confirm("Delete this online session?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "onlineSessions", id));
      await loadData();
      if (editingId === id) resetForm();

      showToast({
        title: "Session deleted",
        description: "The online session was removed.",
        type: "success",
      });
    } catch (error) {
      console.error("Delete staff session error:", error);
      showToast({
        title: "Delete failed",
        description: "Could not delete the session.",
        type: "error",
      });
    }
  };

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">
          Loading staff sessions...
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
              {getRoleLabel(role)}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Online Sessions
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-600 md:text-base">
              Plan private calls for clients in your own area. Payments can be layered on
              later without changing how sessions are scheduled.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <HeaderPill label="Role" value={getRoleLabel(role)} />
              <HeaderPill label="Total" value={String(summary.total)} />
              <HeaderPill label="Scheduled" value={String(summary.scheduled)} />
              <HeaderPill label="Completed" value={String(summary.completed)} />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <section className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <h2 className="text-xl font-semibold text-slate-950">
            {editingId ? "Edit session" : "Create session"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            You can only create sessions inside your own discipline.
          </p>

          <div className="mt-6 space-y-4">
            <Field label="Find client">
              <input
                value={profileSearch}
                onChange={(e) => setProfileSearch(e.target.value)}
                placeholder="Search by client name or program..."
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </Field>

            <Field label="Client">
              <select
                value={form.profileId}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, profileId: e.target.value }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              >
                <option value="">Select client</option>
                {filteredProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.fullName || "Unnamed profile"}
                    {profile.assignedProgram ? ` — ${profile.assignedProgram}` : ""}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Provider area">
                <select
                  value={form.providerRole}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      providerRole: e.target.value as OnlineSessionProviderRole,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                >
                  {allowedRoles.map((item) => (
                    <option key={item} value={item}>
                      {getProviderRoleLabel(item)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Delivery">
                <select
                  value={form.deliveryMethod}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      deliveryMethod: e.target.value as OnlineSessionDeliveryMethod,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                >
                  <option value="zoom">Zoom</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date">
                <input
                  type="date"
                  value={form.scheduledDate}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, scheduledDate: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </Field>
              <Field label="Start time">
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, startTime: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Duration (minutes)">
                <input
                  type="number"
                  min="15"
                  step="15"
                  value={form.durationMinutes}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      durationMinutes: e.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </Field>
              <Field label="Status">
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      status: e.target.value as OnlineSessionStatus,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </Field>
            </div>

            <Field label="Session title">
              <input
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Optional title"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </Field>

            <Field label="Meeting link">
              <input
                value={form.meetingLink}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, meetingLink: e.target.value }))
                }
                placeholder="Zoom link or WhatsApp link"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </Field>

            <Field label="Notes">
              <textarea
                rows={5}
                value={form.notes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Internal notes or session scope"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </Field>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={saveSession}
                disabled={saving}
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? "Saving..." : editingId ? "Update session" : "Create session"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Clear
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Session board</h2>
              <p className="mt-2 text-sm text-slate-600">
                Review your scheduled, completed, and cancelled sessions.
              </p>
            </div>
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
          </div>

          {visibleSessions.length === 0 ? (
            <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
              No sessions match the current filters.
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              {visibleSessions.map((item) => {
                const profile = profileMap.get(item.profileId);
                return (
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
                          <Link
                            href={`/staff/clients/${item.profileId}`}
                            className="hover:text-slate-950"
                          >
                            {profile?.fullName || "Unknown client"}
                          </Link>{" "}
                          · {item.scheduledDate} at {item.startTime} · {item.durationMinutes} min
                        </p>
                        {normalizeSessionPayment(item).paymentRequired ? (
                          <p className="mt-2 text-sm text-slate-600">
                            {normalizeSessionPayment(item).price
                              ? `${normalizeSessionPayment(item).currency} ${normalizeSessionPayment(item).price}`
                              : "Payment required"}
                          </p>
                        ) : null}
                        {item.notes ? (
                          <p className="mt-3 text-sm leading-6 text-slate-700">
                            {item.notes}
                          </p>
                        ) : null}
                        {item.meetingLink ? (
                          <a
                            href={item.meetingLink}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-4 inline-flex text-sm font-medium text-[#1d4ed8] hover:text-[#1e40af]"
                          >
                            Open meeting link
                          </a>
                        ) : null}
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSession(item.id)}
                          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-700">{label}</label>
      {children}
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
