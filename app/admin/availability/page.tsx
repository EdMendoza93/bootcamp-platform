"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
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

type PackageConfig = {
  enabled: boolean;
  price: number;
  capacity: number;
  booked: number;
};

type AvailabilityItem = {
  id: string;
  startDate: string;
  label: string;
  active: boolean;
  notes?: string;
  packages: {
    oneWeek: PackageConfig;
    twoWeeks: PackageConfig;
    threeWeeks: PackageConfig;
  };
};

type AvailabilityForm = {
  startDate: string;
  label: string;
  notes: string;
  active: boolean;
  oneWeekEnabled: boolean;
  oneWeekPrice: string;
  oneWeekCapacity: string;
  twoWeeksEnabled: boolean;
  twoWeeksPrice: string;
  twoWeeksCapacity: string;
  threeWeeksEnabled: boolean;
  threeWeeksPrice: string;
  threeWeeksCapacity: string;
};

function getEmptyForm(): AvailabilityForm {
  return {
    startDate: "",
    label: "",
    notes: "",
    active: true,
    oneWeekEnabled: true,
    oneWeekPrice: "900",
    oneWeekCapacity: "8",
    twoWeeksEnabled: true,
    twoWeeksPrice: "1650",
    twoWeeksCapacity: "4",
    threeWeeksEnabled: true,
    threeWeeksPrice: "2250",
    threeWeeksCapacity: "2",
  };
}

function formatDateLabel(date: string) {
  if (!date) return "No date";
  const parsed = new Date(`${date}T12:00:00`);
  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function getPackageStatus(pkg: PackageConfig) {
  if (!pkg.enabled) return "disabled";
  if (pkg.capacity <= 0) return "soldout";

  const remaining = pkg.capacity - pkg.booked;
  if (remaining <= 0) return "soldout";
  if (remaining <= Math.max(1, Math.ceil(pkg.capacity * 0.2))) return "low";

  return "open";
}

function getUsagePercent(booked: number, capacity: number) {
  if (!capacity || capacity <= 0) return 0;
  return Math.min(100, Math.round((booked / capacity) * 100));
}

function getOverallDateStatus(item: AvailabilityItem) {
  if (!item.active) return "inactive";

  const packageStatuses = [
    getPackageStatus(item.packages.oneWeek),
    getPackageStatus(item.packages.twoWeeks),
    getPackageStatus(item.packages.threeWeeks),
  ];

  const hasOpen = packageStatuses.includes("open");
  const hasLow = packageStatuses.includes("low");
  const allDisabledOrSold =
    packageStatuses.every((status) => status === "disabled" || status === "soldout");

  if (allDisabledOrSold) return "soldout";
  if (hasLow) return "low";
  if (hasOpen) return "open";

  return "inactive";
}

export default function AdminAvailabilityPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<AvailabilityItem[]>([]);
  const [form, setForm] = useState<AvailabilityForm>(getEmptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);

  const { showToast } = useToast();

  const loadAvailability = async () => {
    try {
      const availabilityQuery = query(
        collection(db, "bootcampAvailability"),
        orderBy("startDate", "asc")
      );

      const snapshot = await getDocs(availabilityQuery);

      const data = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<AvailabilityItem, "id">),
      })) as AvailabilityItem[];

      setItems(data);
    } catch (error) {
      console.error("Load availability error:", error);
      showToast({
        title: "Could not load availability",
        description: "Please refresh the page.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAvailability();
  }, []);

  const summary = useMemo(() => {
    const activeDates = items.filter((item) => item.active).length;
    const soldOutDates = items.filter(
      (item) => getOverallDateStatus(item) === "soldout"
    ).length;

    const totalPackages = items.reduce((acc, item) => {
      return (
        acc +
        Number(item.packages.oneWeek.enabled) +
        Number(item.packages.twoWeeks.enabled) +
        Number(item.packages.threeWeeks.enabled)
      );
    }, 0);

    const totalBooked = items.reduce((acc, item) => {
      return (
        acc +
        (item.packages.oneWeek.booked || 0) +
        (item.packages.twoWeeks.booked || 0) +
        (item.packages.threeWeeks.booked || 0)
      );
    }, 0);

    return {
      totalDates: items.length,
      activeDates,
      soldOutDates,
      totalPackages,
      totalBooked,
    };
  }, [items]);

  const resetForm = () => {
    setForm(getEmptyForm());
    setEditingId(null);
  };

  const saveAvailability = async () => {
    if (!form.startDate) {
      showToast({
        title: "Start date required",
        description: "Please select a bootcamp start date.",
        type: "error",
      });
      return;
    }

    if (
      !form.oneWeekEnabled &&
      !form.twoWeeksEnabled &&
      !form.threeWeeksEnabled
    ) {
      showToast({
        title: "Enable at least one package",
        description: "You need at least one active duration option.",
        type: "error",
      });
      return;
    }

    setSaving(true);

    try {
      const payload = {
        startDate: form.startDate,
        label: form.label.trim() || formatDateLabel(form.startDate),
        notes: form.notes.trim(),
        active: form.active,
        packages: {
          oneWeek: {
            enabled: form.oneWeekEnabled,
            price: Number(form.oneWeekPrice || 0),
            capacity: Number(form.oneWeekCapacity || 0),
            booked:
              editingId
                ? items.find((item) => item.id === editingId)?.packages.oneWeek.booked || 0
                : 0,
          },
          twoWeeks: {
            enabled: form.twoWeeksEnabled,
            price: Number(form.twoWeeksPrice || 0),
            capacity: Number(form.twoWeeksCapacity || 0),
            booked:
              editingId
                ? items.find((item) => item.id === editingId)?.packages.twoWeeks.booked || 0
                : 0,
          },
          threeWeeks: {
            enabled: form.threeWeeksEnabled,
            price: Number(form.threeWeeksPrice || 0),
            capacity: Number(form.threeWeeksCapacity || 0),
            booked:
              editingId
                ? items.find((item) => item.id === editingId)?.packages.threeWeeks.booked || 0
                : 0,
          },
        },
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, "bootcampAvailability", editingId), payload);

        showToast({
          title: "Availability updated",
          description: "Bootcamp date was updated successfully.",
          type: "success",
        });
      } else {
        await addDoc(collection(db, "bootcampAvailability"), {
          ...payload,
          createdAt: serverTimestamp(),
        });

        showToast({
          title: "Date created",
          description: "New bootcamp availability was added.",
          type: "success",
        });
      }

      resetForm();
      await loadAvailability();
    } catch (error) {
      console.error("Save availability error:", error);
      showToast({
        title: "Save failed",
        description: "Could not save the bootcamp date.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: AvailabilityItem) => {
    setEditingId(item.id);
    setForm({
      startDate: item.startDate || "",
      label: item.label || "",
      notes: item.notes || "",
      active: item.active,
      oneWeekEnabled: item.packages.oneWeek.enabled,
      oneWeekPrice: String(item.packages.oneWeek.price ?? 0),
      oneWeekCapacity: String(item.packages.oneWeek.capacity ?? 0),
      twoWeeksEnabled: item.packages.twoWeeks.enabled,
      twoWeeksPrice: String(item.packages.twoWeeks.price ?? 0),
      twoWeeksCapacity: String(item.packages.twoWeeks.capacity ?? 0),
      threeWeeksEnabled: item.packages.threeWeeks.enabled,
      threeWeeksPrice: String(item.packages.threeWeeks.price ?? 0),
      threeWeeksCapacity: String(item.packages.threeWeeks.capacity ?? 0),
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteAvailability = async (id: string) => {
    const confirmed = window.confirm("Delete this bootcamp date?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "bootcampAvailability", id));

      if (editingId === id) {
        resetForm();
      }

      showToast({
        title: "Date deleted",
        description: "Bootcamp availability was removed.",
        type: "success",
      });

      await loadAvailability();
    } catch (error) {
      console.error("Delete availability error:", error);
      showToast({
        title: "Delete failed",
        description: "Could not delete this date.",
        type: "error",
      });
    }
  };

  const toggleActive = async (item: AvailabilityItem) => {
    try {
      await updateDoc(doc(db, "bootcampAvailability", item.id), {
        active: !item.active,
        updatedAt: serverTimestamp(),
      });

      showToast({
        title: item.active ? "Date disabled" : "Date activated",
        description: "Availability status was updated.",
        type: "success",
      });

      await loadAvailability();
    } catch (error) {
      console.error("Toggle active error:", error);
      showToast({
        title: "Update failed",
        description: "Could not change active status.",
        type: "error",
      });
    }
  };

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">
          Loading availability...
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
              Availability Control
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Bootcamp Dates & Packages
            </h1>

            <p className="mt-3 max-w-3xl text-sm text-slate-600 md:text-base">
              Create and manage bookable start dates, prices, and package capacity
              for 1, 2, and 3 week bootcamp options.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Total Dates" value={String(summary.totalDates)} tone="light" />
        <SummaryCard label="Active Dates" value={String(summary.activeDates)} tone="blue" />
        <SummaryCard label="Sold Out Dates" value={String(summary.soldOutDates)} tone="danger" />
        <SummaryCard label="Open Packages" value={String(summary.totalPackages)} tone="success" />
        <SummaryCard label="Total Reserved" value={String(summary.totalBooked)} tone="dark" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">
                {editingId ? "Edit date" : "Create date"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Define duration options, pricing and capacity.
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

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Display label
              </label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="e.g. May 3rd - 10th"
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
                Date active and visible
              </span>
            </label>

            <PackageEditor
              title="1 Week Package"
              enabled={form.oneWeekEnabled}
              price={form.oneWeekPrice}
              capacity={form.oneWeekCapacity}
              onEnabledChange={(value) =>
                setForm({ ...form, oneWeekEnabled: value })
              }
              onPriceChange={(value) =>
                setForm({ ...form, oneWeekPrice: value })
              }
              onCapacityChange={(value) =>
                setForm({ ...form, oneWeekCapacity: value })
              }
              tone="blue"
            />

            <PackageEditor
              title="2 Week Package"
              enabled={form.twoWeeksEnabled}
              price={form.twoWeeksPrice}
              capacity={form.twoWeeksCapacity}
              onEnabledChange={(value) =>
                setForm({ ...form, twoWeeksEnabled: value })
              }
              onPriceChange={(value) =>
                setForm({ ...form, twoWeeksPrice: value })
              }
              onCapacityChange={(value) =>
                setForm({ ...form, twoWeeksCapacity: value })
              }
              tone="success"
            />

            <PackageEditor
              title="3 Week Package"
              enabled={form.threeWeeksEnabled}
              price={form.threeWeeksPrice}
              capacity={form.threeWeeksCapacity}
              onEnabledChange={(value) =>
                setForm({ ...form, threeWeeksEnabled: value })
              }
              onPriceChange={(value) =>
                setForm({ ...form, threeWeeksPrice: value })
              }
              onCapacityChange={(value) =>
                setForm({ ...form, threeWeeksCapacity: value })
              }
              tone="dark"
            />

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional internal note"
                className="min-h-[110px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </div>

            <button
              type="button"
              onClick={saveAvailability}
              disabled={saving}
              className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {saving
                ? editingId
                  ? "Saving..."
                  : "Creating..."
                : editingId
                ? "Save Changes"
                : "Create Date"}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {items.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/80 p-10 text-center text-sm text-slate-500">
              No bootcamp dates added yet.
            </div>
          ) : (
            items.map((item) => (
              <AvailabilityCard
                key={item.id}
                item={item}
                onEdit={() => startEdit(item)}
                onDelete={() => deleteAvailability(item.id)}
                onToggleActive={() => toggleActive(item)}
              />
            ))
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
      className={`rounded-[24px] border p-5 shadow-[0_14px_40px_rgba(15,23,42,0.07)] ${styles[tone].card}`}
    >
      <p className={`text-sm font-semibold ${styles[tone].label}`}>{label}</p>
      <p className={`mt-2 text-3xl font-semibold tracking-tight ${styles[tone].value}`}>
        {value}
      </p>
    </div>
  );
}

function PackageEditor({
  title,
  enabled,
  price,
  capacity,
  onEnabledChange,
  onPriceChange,
  onCapacityChange,
  tone,
}: {
  title: string;
  enabled: boolean;
  price: string;
  capacity: string;
  onEnabledChange: (value: boolean) => void;
  onPriceChange: (value: string) => void;
  onCapacityChange: (value: string) => void;
  tone: "blue" | "success" | "dark";
}) {
  const toneStyles = {
    blue: "border-[#bfdbfe] bg-[#f8fbff]",
    success: "border-emerald-200 bg-emerald-50/50",
    dark: "border-slate-200 bg-slate-50",
  };

  return (
    <div className={`rounded-[24px] border p-4 ${toneStyles[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">{title}</p>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
          />
          Enabled
        </label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Price
          </label>
          <input
            type="number"
            value={price}
            onChange={(e) => onPriceChange(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Capacity
          </label>
          <input
            type="number"
            value={capacity}
            onChange={(e) => onCapacityChange(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
          />
        </div>
      </div>
    </div>
  );
}

function AvailabilityCard({
  item,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  item: AvailabilityItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  const status = getOverallDateStatus(item);

  return (
    <div className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={status} />
            {item.active ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                Active
              </span>
            ) : (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                Inactive
              </span>
            )}
          </div>

          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
            {item.label || formatDateLabel(item.startDate)}
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            {formatDateLabel(item.startDate)}
          </p>

          {item.notes && (
            <div className="mt-4 rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
              <p className="text-sm text-slate-600">{item.notes}</p>
            </div>
          )}

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <PackageStatusCard title="1 Week" pkg={item.packages.oneWeek} tone="blue" />
            <PackageStatusCard title="2 Weeks" pkg={item.packages.twoWeeks} tone="success" />
            <PackageStatusCard title="3 Weeks" pkg={item.packages.threeWeeks} tone="dark" />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 xl:w-[240px] xl:flex-col">
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
            {item.active ? "Disable" : "Activate"}
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
    </div>
  );
}

function PackageStatusCard({
  title,
  pkg,
  tone,
}: {
  title: string;
  pkg: PackageConfig;
  tone: "blue" | "success" | "dark";
}) {
  const status = getPackageStatus(pkg);
  const percent = getUsagePercent(pkg.booked, pkg.capacity);

  const toneStyles = {
    blue: "border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white",
    success: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white",
    dark: "border-slate-200 bg-gradient-to-br from-slate-50 to-white",
  };

  return (
    <div className={`rounded-[24px] border p-4 ${toneStyles[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-base font-semibold text-slate-950">{title}</p>
        <MiniPackagePill status={status} />
      </div>

      <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
        {formatMoney(pkg.price || 0)}
      </p>

      <p className="mt-2 text-sm text-slate-600">
        {pkg.booked || 0} booked / {pkg.capacity || 0} capacity
      </p>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/80">
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
          style={{ width: `${status === "disabled" ? 0 : percent}%` }}
        />
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

function MiniPackagePill({
  status,
}: {
  status: "open" | "low" | "soldout" | "disabled";
}) {
  const styles = {
    open: "border-emerald-200 bg-emerald-50 text-emerald-700",
    low: "border-amber-200 bg-amber-50 text-amber-700",
    soldout: "border-rose-200 bg-rose-50 text-rose-700",
    disabled: "border-slate-200 bg-slate-50 text-slate-600",
  };

  const labels = {
    open: "Open",
    low: "Low",
    soldout: "Sold Out",
    disabled: "Disabled",
  };

  return (
    <span
      className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}