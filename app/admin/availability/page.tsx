"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  addDays,
  BookingRecord,
  BootcampWeekRecord,
  canStartDuration,
  getRemainingSpots,
  getWeekAvailabilityStatus,
  hasWeekOverlap,
  hydrateWeeksWithBookings,
} from "@/lib/bookings";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useToast } from "@/components/ui/ToastProvider";

type BootcampWeek = BootcampWeekRecord;

type WeekForm = {
  startDate: string;
  label: string;
  active: boolean;
  capacity: string;
  notes: string;
};

function getEmptyForm(): WeekForm {
  return {
    startDate: "",
    label: "",
    active: true,
    capacity: "6",
    notes: "",
  };
}

function toMiddayDate(date: string) {
  return new Date(`${date}T12:00:00`);
}

function formatDateLabel(date: string) {
  if (!date) return "No date";
  const parsed = toMiddayDate(date);
  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatMonthLabel(date: string) {
  if (!date) return "Unknown month";
  const parsed = toMiddayDate(date);
  return parsed.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function getCurrentMonthKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function getUsagePercent(booked: number, capacity: number) {
  if (!capacity || capacity <= 0) return 0;
  return Math.min(100, Math.round((booked / capacity) * 100));
}

export default function AdminAvailabilityPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weeks, setWeeks] = useState<BootcampWeek[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WeekForm>(getEmptyForm());
  const [activeMonth, setActiveMonth] = useState<string>("");

  const { showToast } = useToast();

  const autoEndDate = useMemo(() => {
    if (!form.startDate) return "";
    return addDays(form.startDate, 7);
  }, [form.startDate]);

  const loadWeeks = useCallback(async () => {
    try {
      const weeksQuery = query(
        collection(db, "bootcampWeeks"),
        orderBy("startDate", "asc")
      );
      const bookingsQuery = query(collection(db, "bookings"));

      const [weeksSnapshot, bookingsSnapshot] = await Promise.all([
        getDocs(weeksQuery),
        getDocs(bookingsQuery),
      ]);

      const data = weeksSnapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<BootcampWeek, "id">),
      })) as BootcampWeek[];

      const bookingData = bookingsSnapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<BookingRecord, "id">),
      })) as BookingRecord[];

      setBookings(bookingData);
      setWeeks(hydrateWeeksWithBookings(data, bookingData));
    } catch (error) {
      console.error("Load weeks error:", error);
      showToast({
        title: "Could not load weekly availability",
        description: "Please refresh the page.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadWeeks();
  }, [loadWeeks]);

  const summary = useMemo(() => {
    const activeWeeks = weeks.filter((week) => week.active).length;
    const soldOutWeeks = weeks.filter(
      (week) => getWeekAvailabilityStatus(week) === "soldout"
    ).length;
    const totalCapacity = weeks.reduce(
      (acc, week) => acc + (week.capacity || 0),
      0
    );
    const totalBooked = weeks.reduce((acc, week) => acc + (week.booked || 0), 0);

    const startableOneWeek = weeks.filter((_, index) =>
      canStartDuration(weeks, index, 1)
    ).length;

    const startableTwoWeeks = weeks.filter((_, index) =>
      canStartDuration(weeks, index, 2)
    ).length;

    const startableThreeWeeks = weeks.filter((_, index) =>
      canStartDuration(weeks, index, 3)
    ).length;

    return {
      totalWeeks: weeks.length,
      activeWeeks,
      soldOutWeeks,
      totalCapacity,
      totalBooked,
      startableOneWeek,
      startableTwoWeeks,
      startableThreeWeeks,
    };
  }, [weeks]);

  const currentMonthKey = useMemo(() => getCurrentMonthKey(), []);

  const weekViewItems = useMemo(
    () =>
      weeks.map((week, index) => ({
        week,
        monthKey: week.startDate.slice(0, 7),
        monthLabel: formatMonthLabel(week.startDate),
        assignedBookings: bookings.filter(
          (booking) =>
            booking.status !== "cancelled" &&
            booking.weekIds.includes(week.id)
        ),
        startableOneWeek: canStartDuration(weeks, index, 1),
        startableTwoWeeks: canStartDuration(weeks, index, 2),
        startableThreeWeeks: canStartDuration(weeks, index, 3),
      })),
    [bookings, weeks]
  );

  const monthTabs = useMemo(() => {
    const seen = new Set<string>();

    return weekViewItems
      .filter((item) => {
        if (item.monthKey < currentMonthKey) return false;
        if (seen.has(item.monthKey)) return false;
        seen.add(item.monthKey);
        return true;
      })
      .map((item) => ({
        id: item.monthKey,
        label: item.monthLabel,
      }));
  }, [currentMonthKey, weekViewItems]);

  const visibleWeekItems = useMemo(() => {
    const eligibleItems = weekViewItems.filter(
      (item) => item.monthKey >= currentMonthKey
    );

    if (!activeMonth) return eligibleItems;

    return eligibleItems.filter((item) => item.monthKey === activeMonth);
  }, [activeMonth, currentMonthKey, weekViewItems]);

  useEffect(() => {
    if (monthTabs.length === 0) {
      if (activeMonth !== "") {
        setActiveMonth("");
      }
      return;
    }

    if (!activeMonth || !monthTabs.some((tab) => tab.id === activeMonth)) {
      setActiveMonth(monthTabs[0].id);
    }
  }, [activeMonth, monthTabs]);

  const resetForm = () => {
    setForm(getEmptyForm());
    setEditingId(null);
  };

  const saveWeek = async () => {
    if (!form.startDate) {
      showToast({
        title: "Start date required",
        description: "Please enter the week start date.",
        type: "error",
      });
      return;
    }

    const nextCapacity = Number(form.capacity || 0);

    if (nextCapacity <= 0) {
      showToast({
        title: "Capacity required",
        description: "Please enter a capacity greater than zero.",
        type: "error",
      });
      return;
    }

    setSaving(true);

    try {
      const existingWeek = editingId
        ? weeks.find((week) => week.id === editingId)
        : null;

      const existingBooked = existingWeek?.booked || 0;

      if (editingId && nextCapacity < existingBooked) {
        showToast({
          title: "Capacity too low",
          description: "Capacity cannot be lower than already booked spots.",
          type: "error",
        });
        setSaving(false);
        return;
      }

      const generatedEndDate = addDays(form.startDate, 7);

      if (
        hasWeekOverlap(
          weeks,
          {
            startDate: form.startDate,
            endDate: generatedEndDate,
          },
          editingId
        )
      ) {
        showToast({
          title: "Overlapping week",
          description:
            "This weekly block overlaps an existing one. Weeks must stay as non-overlapping 7-day blocks.",
          type: "error",
        });
        setSaving(false);
        return;
      }

      const payload = {
        startDate: form.startDate,
        endDate: generatedEndDate,
        label:
          form.label.trim() ||
          `${formatDateLabel(form.startDate)} → ${formatDateLabel(generatedEndDate)}`,
        active: form.active,
        capacity: nextCapacity,
        booked: existingBooked,
        notes: form.notes.trim(),
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, "bootcampWeeks", editingId), payload);

        showToast({
          title: "Week updated",
          description: "Weekly availability was updated successfully.",
          type: "success",
        });
      } else {
        await addDoc(collection(db, "bootcampWeeks"), {
          ...payload,
          booked: 0,
          createdAt: serverTimestamp(),
        });

        showToast({
          title: "Week created",
          description: "New weekly block was added.",
          type: "success",
        });
      }

      resetForm();
      await loadWeeks();
    } catch (error) {
      console.error("Save week error:", error);
      showToast({
        title: "Save failed",
        description: "Could not save this weekly block.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (week: BootcampWeek) => {
    setEditingId(week.id);
    setForm({
      startDate: week.startDate || "",
      label: week.label || "",
      active: week.active,
      capacity: String(week.capacity ?? 0),
      notes: week.notes || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleActive = async (week: BootcampWeek) => {
    try {
      await updateDoc(doc(db, "bootcampWeeks", week.id), {
        active: !week.active,
        updatedAt: serverTimestamp(),
      });

      showToast({
        title: week.active ? "Week disabled" : "Week activated",
        description: "Availability status was updated.",
        type: "success",
      });

      await loadWeeks();
    } catch (error) {
      console.error("Toggle week error:", error);
      showToast({
        title: "Update failed",
        description: "Could not change the week status.",
        type: "error",
      });
    }
  };

  const deleteWeek = async (week: BootcampWeek) => {
    if (week.booked > 0) {
      showToast({
        title: "Week has assigned bookings",
        description:
          "This week cannot be deleted while clients are booked into it. Disable the week instead, or move or cancel those bookings first.",
        type: "error",
      });
      return;
    }

    const confirmed = window.confirm(
      "Delete this week? This will remove the availability block entirely."
    );
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "bootcampWeeks", week.id));

      if (editingId === week.id) {
        resetForm();
      }

      showToast({
        title: "Week deleted",
        description: "Weekly block was removed.",
        type: "success",
      });

      await loadWeeks();
    } catch (error) {
      console.error("Delete week error:", error);
      showToast({
        title: "Delete failed",
        description: "Could not delete this week.",
        type: "error",
      });
    }
  };

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">
          Loading weekly availability...
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
          <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#2EA0FF]/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-36 w-36 rounded-full bg-emerald-300/10 blur-3xl" />

          <div className="relative">
            <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
              Weekly Availability
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Bootcamp Weekly Blocks
            </h1>

            <p className="mt-3 max-w-3xl text-sm text-slate-600 md:text-base">
              Create weekly blocks, control room capacity, and let the system
              calculate whether 1, 2, or 3 week stays can start from each block.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <HeaderPill label="Total blocks" value={String(summary.totalWeeks)} />
              <HeaderPill label="Reserved" value={String(summary.totalBooked)} />
              <HeaderPill label="Capacity" value={String(summary.totalCapacity)} />
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-wrap gap-2">
        <div className="flex flex-wrap gap-2">
          <SummaryCard label="Total Weeks" value={String(summary.totalWeeks)} tone="light" />
          <SummaryCard label="Active Weeks" value={String(summary.activeWeeks)} tone="blue" />
          <SummaryCard label="Sold Out Weeks" value={String(summary.soldOutWeeks)} tone="danger" />
          <SummaryCard label="Total Reserved" value={String(summary.totalBooked)} tone="success" />
          <SummaryCard label="1 Week Starts" value={String(summary.startableOneWeek)} tone="blue" />
          <SummaryCard label="2 Week Starts" value={String(summary.startableTwoWeeks)} tone="success" />
          <SummaryCard label="3 Week Starts" value={String(summary.startableThreeWeeks)} tone="dark" />
          <SummaryCard label="Total Capacity" value={String(summary.totalCapacity)} tone="light" />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">
                {editingId ? "Edit week" : "Create week"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Set the week start date and total room capacity.
              </p>
            </div>

            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Start date
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Auto End Date
              </p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {autoEndDate ? formatDateLabel(autoEndDate) : "Select a start date first"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Weekly blocks always end 7 days after the start date.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Display label
              </label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="e.g. May 3rd - May 10th"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Total room capacity
              </label>
              <input
                type="number"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              <span className="text-sm font-medium text-slate-800">
                Week active and available for new bookings
              </span>
            </label>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional internal note"
                className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </div>

            <button
              type="button"
              onClick={saveWeek}
              disabled={saving}
              className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {saving
                ? editingId
                  ? "Saving..."
                  : "Creating..."
                : editingId
                ? "Save Changes"
                : "Create Week"}
            </button>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          {weeks.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/80 p-10 text-center text-sm text-slate-500">
              No weekly blocks added yet.
            </div>
          ) : (
            <>
              <div className="min-w-0 flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <div className="text-sm text-slate-600">
                  {weeks.length} weekly block{weeks.length === 1 ? "" : "s"} in the system
                </div>
                {monthTabs.length > 0 && (
                  <div className="min-w-0 w-full overflow-hidden">
                    <div className="max-w-full overflow-x-auto overflow-y-hidden pb-1">
                      <div className="inline-flex w-max gap-2 rounded-[22px] border border-slate-200 bg-white/90 p-1.5 shadow-sm">
                      {monthTabs.map((tab) => {
                        const active = tab.id === activeMonth;

                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveMonth(tab.id)}
                            className={`whitespace-nowrap rounded-2xl px-4 py-2 text-sm font-medium transition ${
                              active
                                ? "bg-slate-950 text-white shadow-sm"
                                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            }`}
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {visibleWeekItems.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/80 p-10 text-center text-sm text-slate-500">
                  No weekly blocks in the current or upcoming months.
                </div>
              ) : (
                visibleWeekItems.map((item) => (
                  <WeekCard
                    key={item.week.id}
                    week={item.week}
                    assignedBookings={item.assignedBookings}
                    startableOneWeek={item.startableOneWeek}
                    startableTwoWeeks={item.startableTwoWeeks}
                    startableThreeWeeks={item.startableThreeWeeks}
                    onEdit={() => startEdit(item.week)}
                    onToggleActive={() => toggleActive(item.week)}
                    onDelete={() => deleteWeek(item.week)}
                  />
                ))
              )}
            </>
          )}
        </div>
      </section>
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
  tone: "blue" | "success" | "danger" | "light" | "dark";
}) {
  const styles: Record<
    "blue" | "success" | "danger" | "light" | "dark",
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
    danger: {
      card: "border-rose-200 bg-gradient-to-br from-rose-50 to-white",
      label: "text-rose-700",
      value: "text-slate-950",
    },
    light: {
      card: "border-slate-200 bg-white",
      label: "text-slate-500",
      value: "text-slate-950",
    },
    dark: {
      card: "border-slate-800 bg-gradient-to-br from-slate-950 to-slate-800",
      label: "text-slate-300",
      value: "text-white",
    },
  };

  return (
    <div
      className={`min-w-[120px] flex-none rounded-[18px] border px-3 py-2.5 shadow-[0_8px_22px_rgba(15,23,42,0.04)] ${styles[tone].card}`}
    >
      <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${styles[tone].label}`}>
        {label}
      </p>
      <p className={`mt-1 text-xl font-semibold tracking-tight ${styles[tone].value}`}>
        {value}
      </p>
    </div>
  );
}

function WeekCard({
  week,
  assignedBookings,
  startableOneWeek,
  startableTwoWeeks,
  startableThreeWeeks,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  week: BootcampWeek;
  assignedBookings: BookingRecord[];
  startableOneWeek: boolean;
  startableTwoWeeks: boolean;
  startableThreeWeeks: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const status = getWeekAvailabilityStatus(week);
  const remaining = getRemainingSpots(week);
  const usagePercent = getUsagePercent(week.booked, week.capacity);
  const visibleAssignedBookings = assignedBookings.slice(0, 5);
  const extraAssignedCount = Math.max(
    0,
    assignedBookings.length - visibleAssignedBookings.length
  );

  return (
    <div className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px] xl:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={status} />
            {week.active ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                Active
              </span>
            ) : (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                Inactive
              </span>
            )}
            {week.booked > 0 && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                Existing bookings
              </span>
            )}
          </div>

          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
            {week.label || `${formatDateLabel(week.startDate)} → ${formatDateLabel(week.endDate)}`}
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            {formatDateLabel(week.startDate)} → {formatDateLabel(week.endDate)}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <MetaChip label="Start" value={week.startDate} />
            <MetaChip label="End" value={week.endDate} />
          </div>

          {week.notes && (
            <div className="mt-4 rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
              <p className="text-sm text-slate-600">{week.notes}</p>
            </div>
          )}

        </div>

        <div className="flex flex-wrap gap-3 xl:flex-col">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Edit
          </button>

          <button
            type="button"
            onClick={onToggleActive}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {week.active ? "Disable" : "Activate"}
          </button>

          <button
            type="button"
            onClick={onDelete}
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[24px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                Weekly Capacity
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {remaining} spots left
              </p>
            </div>

            <div className="text-right">
              <p className="text-sm text-slate-500">
                {week.booked} booked / {week.capacity} capacity
              </p>
            </div>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
            <div
              className={`h-full rounded-full ${
                status === "soldout"
                  ? "bg-rose-400"
                  : status === "low"
                  ? "bg-amber-400"
                  : status === "open"
                  ? "bg-emerald-400"
                  : "bg-slate-300"
              }`}
              style={{ width: `${status === "inactive" ? 0 : usagePercent}%` }}
            />
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
            Assigned Clients
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {assignedBookings.length === 0
              ? "No clients assigned to this week yet."
              : `${assignedBookings.length} client${assignedBookings.length === 1 ? "" : "s"} assigned to this week.`}
          </p>

          {assignedBookings.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-500">
              No active bookings for this week.
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {visibleAssignedBookings.map((booking) =>
                booking.profileId ? (
                  <Link
                    key={booking.id}
                    href={`/admin/profiles/${booking.profileId}`}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700 transition hover:border-[#bfdbfe] hover:bg-[#eff6ff]"
                  >
                    <span className="font-medium text-slate-950">
                      {booking.customerName || booking.customerEmail}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Open profile
                    </span>
                  </Link>
                ) : (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700"
                  >
                    <span className="font-medium text-slate-950">
                      {booking.customerName || booking.customerEmail}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                      No profile link
                    </span>
                  </div>
                )
              )}

              {extraAssignedCount > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-500">
                  +{extraAssignedCount} more assigned client{extraAssignedCount === 1 ? "" : "s"}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-3">
        <DurationCard title="1 Week" available={startableOneWeek} tone="blue" />
        <DurationCard title="2 Weeks" available={startableTwoWeeks} tone="success" />
        <DurationCard title="3 Weeks" available={startableThreeWeeks} tone="dark" />
      </div>
    </div>
  );
}

function DurationCard({
  title,
  available,
  tone,
}: {
  title: string;
  available: boolean;
  tone: "blue" | "success" | "dark";
}) {
  const toneStyles = {
    blue: available
      ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"
      : "border-slate-200 bg-gradient-to-br from-slate-50 to-white",
    success: available
      ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"
      : "border-slate-200 bg-gradient-to-br from-slate-50 to-white",
    dark: available
      ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"
      : "border-slate-200 bg-gradient-to-br from-slate-50 to-white",
  };

  return (
    <div className={`rounded-[24px] border p-4 ${toneStyles[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold text-slate-950">{title}</p>
        {available ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
            Startable
          </span>
        ) : (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Not Available
          </span>
        )}
      </div>
    </div>
  );
}

function StatusPill({
  status,
}: {
  status: "open" | "low" | "soldout" | "inactive";
}) {
  const styles = {
    open: "border-emerald-200 bg-emerald-50 text-emerald-700",
    low: "border-amber-200 bg-amber-50 text-amber-700",
    soldout: "border-rose-200 bg-rose-50 text-rose-700",
    inactive: "border-slate-200 bg-slate-50 text-slate-600",
  };

  const labels = {
    open: "Open",
    low: "Low Availability",
    soldout: "Sold Out",
    inactive: "Inactive",
  };

  return (
    <span
      className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function HeaderPill({
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

function MetaChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
      {label}: {value || "—"}
    </div>
  );
}
