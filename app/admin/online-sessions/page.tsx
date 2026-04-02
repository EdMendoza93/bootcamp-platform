"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/components/ui/ToastProvider";
import {
  getAllowedProviderRoles,
  getDeliveryMethodLabel,
  getProviderRoleLabel,
  getSessionPaymentStatusClasses,
  getSessionPaymentStatusLabel,
  getSessionStatusTone,
  normalizeSessionPayment,
  OnlineSessionDeliveryMethod,
  OnlineSessionPaymentStatus,
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

export default function AdminOnlineSessionsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sessions, setSessions] = useState<OnlineSessionRecord[]>([]);
  const [profileSearch, setProfileSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OnlineSessionStatus>("all");
  const [providerFilter, setProviderFilter] = useState<
    "all" | OnlineSessionProviderRole
  >("all");
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
    paymentRequired: false,
    paymentStatus: "not_required" as OnlineSessionPaymentStatus,
    price: "",
    currency: "EUR",
  });

  const { showToast } = useToast();
  const allowedRoles = getAllowedProviderRoles("admin");

  const loadData = async () => {
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
      sessionsSnap.docs.map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<OnlineSessionRecord, "id">),
      })) as OnlineSessionRecord[]
    );

    setProfiles(profileRows);
    setSessions(sessionRows);
  };

  useEffect(() => {
    const init = async () => {
      try {
        await loadData();
      } catch (error) {
        console.error("Load online sessions admin error:", error);
        showToast({
          title: "Could not load online sessions",
          description: "Please refresh the page.",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [showToast]);

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
    return sessions.filter((item) => {
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesRole =
        providerFilter === "all" || item.providerRole === providerFilter;
      return matchesStatus && matchesRole;
    });
  }, [providerFilter, sessions, statusFilter]);

  const summary = useMemo(
    () => ({
      total: sessions.length,
      scheduled: sessions.filter((item) => item.status === "scheduled").length,
      completed: sessions.filter((item) => item.status === "completed").length,
      cancelled: sessions.filter((item) => item.status === "cancelled").length,
      pendingPayment: sessions.filter(
        (item) => normalizeSessionPayment(item).paymentStatus === "pending"
      ).length,
    }),
    [sessions]
  );

  const resetForm = () => {
    setEditingId(null);
    setForm({
      profileId: "",
      providerRole: "coach",
      scheduledDate: "",
      startTime: "",
      durationMinutes: "60",
      deliveryMethod: "zoom",
      meetingLink: "",
      title: "",
      notes: "",
      status: "scheduled",
      paymentRequired: false,
      paymentStatus: "not_required",
      price: "",
      currency: "EUR",
    });
  };

  const saveSession = async () => {
    const durationMinutes = Number(form.durationMinutes);

    if (!form.profileId || !form.scheduledDate || !form.startTime || !durationMinutes) {
      showToast({
        title: "Missing information",
        description: "Please complete client, date, time, and duration.",
        type: "error",
      });
      return;
    }

    setSaving(true);

    try {
      const paymentRequired = Boolean(form.paymentRequired);
      const paymentStatus = paymentRequired
        ? form.paymentStatus === "paid" || form.paymentStatus === "waived"
          ? form.paymentStatus
          : "pending"
        : "not_required";
      const price = paymentRequired ? Number(form.price || 0) : 0;
      const payload = {
        profileId: form.profileId,
        providerRole: form.providerRole,
        scheduledDate: form.scheduledDate,
        startTime: roundTimeToQuarterHour(form.startTime),
        durationMinutes,
        deliveryMethod: form.deliveryMethod,
        meetingLink: form.meetingLink.trim(),
        title: form.title.trim(),
        notes: form.notes.trim(),
        status: form.status,
        paymentRequired,
        paymentStatus,
        price: paymentRequired && price > 0 ? price : null,
        currency: String(form.currency || "EUR").trim().toUpperCase() || "EUR",
      };

      if (editingId) {
        await updateDoc(doc(db, "onlineSessions", editingId), payload);
      } else {
        await addDoc(collection(db, "onlineSessions"), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await loadData();
      resetForm();

      showToast({
        title: editingId ? "Session updated" : "Session created",
        description: "The online session schedule has been updated.",
        type: "success",
      });
    } catch (error) {
      console.error("Save online session error:", error);
      showToast({
        title: "Save failed",
        description: "Could not save the online session.",
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
      paymentRequired: Boolean(item.paymentRequired),
      paymentStatus: normalizeSessionPayment(item).paymentStatus,
      price:
        typeof item.price === "number" && Number.isFinite(item.price)
          ? String(item.price)
          : "",
      currency: normalizeSessionPayment(item).currency,
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
      console.error("Delete online session error:", error);
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
          Loading online sessions...
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
              Online sessions
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Coaching & Nutrition Calls
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-600 md:text-base">
              Schedule private Zoom or WhatsApp sessions for clients. Payments
              can sit on top of this later without changing the scheduling model.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <HeaderPill label="Total" value={String(summary.total)} />
              <HeaderPill label="Scheduled" value={String(summary.scheduled)} />
              <HeaderPill label="Completed" value={String(summary.completed)} />
              <HeaderPill label="Cancelled" value={String(summary.cancelled)} />
              <HeaderPill label="Payment pending" value={String(summary.pendingPayment)} />
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
            Admin can schedule sessions for either coaches or nutritionists.
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
                  {allowedRoles.map((role) => (
                    <option key={role} value={role}>
                      {getProviderRoleLabel(role)}
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
                  step={900}
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

            <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                Payment prep
              </p>

              <label className="mt-4 flex items-center gap-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.paymentRequired}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      paymentRequired: e.target.checked,
                      paymentStatus: e.target.checked ? "pending" : "not_required",
                    }))
                  }
                />
                This session requires payment
              </label>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Payment status">
                  <select
                    value={form.paymentStatus}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        paymentStatus: e.target.value as OnlineSessionPaymentStatus,
                      }))
                    }
                    disabled={!form.paymentRequired}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition disabled:bg-slate-100"
                  >
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="waived">Waived</option>
                    <option value="not_required">No payment</option>
                  </select>
                </Field>

                <Field label="Currency">
                  <input
                    value={form.currency}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, currency: e.target.value }))
                    }
                    disabled={!form.paymentRequired}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm uppercase text-slate-900 outline-none transition disabled:bg-slate-100"
                  />
                </Field>
              </div>

              <div className="mt-4">
                <Field label="Suggested price">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, price: e.target.value }))
                    }
                    disabled={!form.paymentRequired}
                    placeholder="0.00"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition disabled:bg-slate-100"
                  />
                </Field>
              </div>
            </div>

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
                Review upcoming and completed calls across coaching and nutrition.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <select
                value={providerFilter}
                onChange={(e) =>
                  setProviderFilter(e.target.value as "all" | OnlineSessionProviderRole)
                }
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none"
              >
                <option value="all">All areas</option>
                <option value="coach">Coach</option>
                <option value="nutritionist">Nutritionist</option>
              </select>
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
          </div>

          {visibleSessions.length === 0 ? (
            <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
              No online sessions match the current filters.
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
                          {profile?.fullName || "Unknown client"} · {item.scheduledDate} at{" "}
                          {item.startTime} · {item.durationMinutes} min
                        </p>
                        {normalizeSessionPayment(item).paymentRequired ? (
                          <p className="mt-2 text-sm text-slate-600">
                            {normalizeSessionPayment(item).price
                              ? `${normalizeSessionPayment(item).currency} ${normalizeSessionPayment(item).price}`
                              : "Price not set"}
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

function roundTimeToQuarterHour(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);

  if (!match) return value;

  let hours = Number(match[1]);
  let minutes = Number(match[2]);
  const roundedMinutes = Math.round(minutes / 15) * 15;

  if (roundedMinutes === 60) {
    hours = (hours + 1) % 24;
    minutes = 0;
  } else {
    minutes = roundedMinutes;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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
