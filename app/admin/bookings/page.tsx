"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import {
  BookingDurationWeeks,
  BookingRecord,
  BootcampWeekRecord,
  getConsecutiveBookingWeeks,
  getRemainingSpots,
  getWeekAvailabilityStatus,
  hydrateWeeksWithBookings,
} from "@/lib/bookings";
import { useToast } from "@/components/ui/ToastProvider";
import SegmentedTabs from "@/components/ui/SegmentedTabs";
import CollapsiblePanel from "@/components/ui/CollapsiblePanel";

type BookingRow = BookingRecord & {
  createdAt?: {
    seconds?: number;
    nanoseconds?: number;
  };
  updatedAt?: {
    seconds?: number;
    nanoseconds?: number;
  };
};

type UserRow = {
  id: string;
  email?: string;
  role?: string;
  name?: string;
  displayName?: string;
  username?: string;
};

type ProfileRow = {
  id: string;
  userId?: string;
  fullName?: string;
  clientStatus?: "active" | "inactive";
};

type BookingEntitlementRow = {
  id: string;
  code?: string;
  customerEmail?: string;
  customerName?: string;
  durationWeeks: BookingDurationWeeks;
  amount?: number | null;
  currency?: string;
  status?: "issued" | "claimed" | "redeemed" | "cancelled" | "expired";
  notes?: string;
  claimedByUid?: string;
  claimedByEmail?: string;
  bookingId?: string;
  createdAt?: {
    seconds?: number;
    nanoseconds?: number;
  };
  redeemedAt?: {
    seconds?: number;
    nanoseconds?: number;
  };
};

type BookingFormState = {
  userId: string;
  customerName: string;
  customerEmail: string;
  startWeekId: string;
  durationWeeks: BookingDurationWeeks;
  source: "admin" | "public";
  status: "pending" | "confirmed";
  paymentStatus: "pending" | "paid" | "manual";
  paymentMethod: "cash" | "bank_transfer" | "manual" | "stripe";
  consumesCapacity: boolean;
  shortStay: boolean;
  shortStayNights: string;
  customPrice: string;
  currency: string;
  notes: string;
};

type EntitlementFormState = {
  customerEmail: string;
  customerName: string;
  durationWeeks: BookingDurationWeeks;
  amount: string;
  currency: string;
  notes: string;
};

type BookingViewFilter = "recent" | "confirmed" | "cancelled" | "all";
type BookingPaymentFilter = "all" | "manual" | "paid" | "pending";
type BookingCapacityFilter = "all" | "consumes" | "no_capacity";
type BookingTab = "overview" | "create" | "codes" | "list";

function getEmptyBookingForm(): BookingFormState {
  return {
    userId: "",
    customerName: "",
    customerEmail: "",
    startWeekId: "",
    durationWeeks: 1,
    source: "admin",
    status: "confirmed",
    paymentStatus: "manual",
    paymentMethod: "manual",
    consumesCapacity: true,
    shortStay: false,
    shortStayNights: "",
    customPrice: "",
    currency: "EUR",
    notes: "",
  };
}

function getEmptyEntitlementForm(): EntitlementFormState {
  return {
    customerEmail: "",
    customerName: "",
    durationWeeks: 1,
    amount: "",
    currency: "EUR",
    notes: "",
  };
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function formatDateLabel(date: string) {
  if (!date) return "No date";

  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCreatedAt(
  createdAt?: {
    seconds?: number;
    nanoseconds?: number;
  }
) {
  if (!createdAt?.seconds) return "No timestamp";

  return new Date(createdAt.seconds * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMoney(amount?: number | null, currency = "EUR") {
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return "Standard pricing";
  }

  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getRecipientInitials(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "U";

  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

export default function AdminBookingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weeks, setWeeks] = useState<BootcampWeekRecord[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [entitlements, setEntitlements] = useState<BookingEntitlementRow[]>([]);
  const [form, setForm] = useState<BookingFormState>(getEmptyBookingForm());
  const [entitlementForm, setEntitlementForm] = useState<EntitlementFormState>(
    getEmptyEntitlementForm()
  );
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [entitlementSaving, setEntitlementSaving] = useState(false);
  const [lastIssuedCode, setLastIssuedCode] = useState<{
    code: string;
    customerEmail: string;
    durationWeeks: BookingDurationWeeks;
    amount?: number | null;
    currency?: string;
  } | null>(null);
  const [bookingViewFilter, setBookingViewFilter] =
    useState<BookingViewFilter>("recent");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingPaymentFilter, setBookingPaymentFilter] =
    useState<BookingPaymentFilter>("all");
  const [bookingCapacityFilter, setBookingCapacityFilter] =
    useState<BookingCapacityFilter>("all");
  const [activeTab, setActiveTab] = useState<BookingTab>("overview");

  const { showToast } = useToast();

  const loadData = useCallback(async () => {
    try {
      const weeksQuery = query(
        collection(db, "bootcampWeeks"),
        orderBy("startDate", "asc")
      );
      const bookingsQuery = query(collection(db, "bookings"));
      const usersQuery = query(collection(db, "users"));
      const profilesQuery = query(collection(db, "profiles"));
      const entitlementsQuery = query(collection(db, "bookingEntitlements"));

      const [weeksSnap, bookingsSnap, usersSnap, profilesSnap, entitlementsSnap] =
        await Promise.all([
        getDocs(weeksQuery),
        getDocs(bookingsQuery),
        getDocs(usersQuery),
        getDocs(profilesQuery),
        getDocs(entitlementsQuery),
      ]);

      const weekData = weeksSnap.docs.map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<BootcampWeekRecord, "id">),
      })) as BootcampWeekRecord[];

      const bookingData = bookingsSnap.docs.map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<BookingRow, "id">),
      })) as BookingRow[];

      const userData = usersSnap.docs
        .map((docItem) => ({
          id: docItem.id,
          ...(docItem.data() as Omit<UserRow, "id">),
        }))
        .filter((item) => item.role !== "admin") as UserRow[];

      const profileData = profilesSnap.docs.map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<ProfileRow, "id">),
      })) as ProfileRow[];

      const entitlementData = entitlementsSnap.docs
        .map((docItem) => ({
          id: docItem.id,
          ...(docItem.data() as Omit<BookingEntitlementRow, "id">),
        }))
        .sort((a, b) => {
          const aValue = a.createdAt?.seconds || 0;
          const bValue = b.createdAt?.seconds || 0;
          return bValue - aValue;
        }) as BookingEntitlementRow[];

      setWeeks(weekData);
      setBookings(bookingData);
      setUsers(userData);
      setProfiles(profileData);
      setEntitlements(entitlementData);
    } catch (error) {
      console.error("Load bookings error:", error);
      showToast({
        title: "Could not load bookings",
        description: "Please refresh the page.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const hydratedWeeks = useMemo(
    () => hydrateWeeksWithBookings(weeks, bookings),
    [weeks, bookings]
  );

  const recipientOptions = useMemo(() => {
    const profileByUserId = new Map(
      profiles
        .filter((profile) => profile.userId)
        .map((profile) => [profile.userId as string, profile])
    );

    return users
      .map((user) => {
        const profile = profileByUserId.get(user.id);
        const displayName =
          profile?.fullName ||
          user.displayName ||
          user.name ||
          user.username ||
          user.email ||
          user.id;

        return {
          id: user.id,
          displayName,
          email: user.email || "",
          clientStatus: profile?.clientStatus || "active",
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [profiles, users]);

  const selectedRecipient = useMemo(() => {
    return recipientOptions.find((recipient) => recipient.id === form.userId) || null;
  }, [form.userId, recipientOptions]);

  const filteredRecipientOptions = useMemo(() => {
    const normalizedSearch = recipientSearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return recipientOptions;
    }

    return recipientOptions.filter((recipient) => {
      const haystack = `${recipient.displayName} ${recipient.email} ${recipient.id}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [recipientOptions, recipientSearch]);

  const bookingDraftWeeks = useMemo(() => {
    if (!editingBookingId) return bookings;
    return bookings.filter((booking) => booking.id !== editingBookingId);
  }, [bookings, editingBookingId]);

  const editableHydratedWeeks = useMemo(
    () => hydrateWeeksWithBookings(weeks, bookingDraftWeeks),
    [weeks, bookingDraftWeeks]
  );

  const summary = useMemo(() => {
    const activeBookings = bookings.filter(
      (booking) => booking.status !== "cancelled"
    ).length;
    const paidBookings = bookings.filter(
      (booking) => booking.paymentStatus === "paid" || booking.paymentStatus === "manual"
    ).length;
    const capacityInUse = hydratedWeeks.reduce((acc, week) => acc + week.booked, 0);
    const openWeeks = hydratedWeeks.filter(
      (week) => getWeekAvailabilityStatus(week) === "open"
    ).length;

    return {
      totalBookings: bookings.length,
      activeBookings,
      paidBookings,
      capacityInUse,
      openWeeks,
    };
  }, [bookings, hydratedWeeks]);

  const recentBookings = useMemo(() => {
    return [...bookings].sort((a, b) => {
      const aValue = a.createdAt?.seconds || 0;
      const bValue = b.createdAt?.seconds || 0;
      return bValue - aValue;
    });
  }, [bookings]);

  const visibleBookings = useMemo(() => {
    let nextBookings =
      bookingViewFilter === "recent" ? recentBookings.slice(0, 8) : recentBookings;

    if (bookingViewFilter === "confirmed") {
      nextBookings = nextBookings.filter((booking) => booking.status === "confirmed");
    } else if (bookingViewFilter === "cancelled") {
      nextBookings = nextBookings.filter((booking) => booking.status === "cancelled");
    }

    if (bookingPaymentFilter !== "all") {
      nextBookings = nextBookings.filter(
        (booking) => booking.paymentStatus === bookingPaymentFilter
      );
    }

    if (bookingCapacityFilter === "consumes") {
      nextBookings = nextBookings.filter((booking) => booking.consumesCapacity);
    } else if (bookingCapacityFilter === "no_capacity") {
      nextBookings = nextBookings.filter((booking) => !booking.consumesCapacity);
    }

    const normalizedSearch = bookingSearch.trim().toLowerCase();

    if (normalizedSearch) {
      nextBookings = nextBookings.filter((booking) => {
        const haystack = [
          booking.customerName,
          booking.customerEmail,
          booking.userId,
          booking.notes,
          booking.paymentMethod,
          booking.status,
          booking.paymentStatus,
        ]
          .map((value) => String(value || "").toLowerCase())
          .join(" ");

        return haystack.includes(normalizedSearch);
      });
    }

    return nextBookings;
  }, [
    bookingCapacityFilter,
    bookingPaymentFilter,
    bookingSearch,
    bookingViewFilter,
    recentBookings,
  ]);

  const startableWeeks = useMemo(() => {
    return editableHydratedWeeks.filter(
      (week) => getWeekAvailabilityStatus(week) !== "inactive"
    );
  }, [editableHydratedWeeks]);

  const activeEntitlements = useMemo(
    () =>
      entitlements.filter(
        (item) => item.status === "issued" || item.status === "claimed"
      ),
    [entitlements]
  );

  const recentEntitlements = useMemo(
    () => entitlements.slice(0, 8),
    [entitlements]
  );

  const selectedWeeks = useMemo(() => {
    if (!form.startWeekId) return [];
    return getConsecutiveBookingWeeks(
      editableHydratedWeeks,
      form.startWeekId,
      form.durationWeeks
    );
  }, [editableHydratedWeeks, form.durationWeeks, form.startWeekId]);

  const canSaveBooking =
    form.userId.trim().length > 0 &&
    (!form.shortStay || Number(form.shortStayNights || 0) > 0) &&
    selectedWeeks.length === form.durationWeeks;

  const canSaveEntitlement = isValidEmail(entitlementForm.customerEmail);

  const resetForm = () => {
    setForm(getEmptyBookingForm());
    setEditingBookingId(null);
    setRecipientSearch("");
  };

  const startEdit = (booking: BookingRow) => {
    setEditingBookingId(booking.id);
    setForm({
      userId: booking.userId || "",
      customerName: booking.customerName || "",
      customerEmail: booking.customerEmail || "",
      startWeekId: booking.startWeekId || "",
      durationWeeks: booking.durationWeeks,
      source: booking.source,
      status:
        booking.status === "pending" ? "pending" : "confirmed",
      paymentStatus:
        booking.paymentStatus === "failed" || booking.paymentStatus === "refunded"
          ? "pending"
          : booking.paymentStatus,
      paymentMethod: booking.paymentMethod,
      consumesCapacity: booking.consumesCapacity,
      shortStay: Boolean(booking.shortStay),
      shortStayNights:
        typeof booking.shortStayNights === "number" ? String(booking.shortStayNights) : "",
      customPrice:
        typeof booking.customPrice === "number" ? String(booking.customPrice) : "",
      currency: booking.currency || "EUR",
      notes: booking.notes || "",
    });
    setRecipientSearch("");

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelBooking = async (booking: BookingRow) => {
    const confirmed = window.confirm("Cancel this booking?");
    if (!confirmed) return;

    try {
      const cancelBookingCall = httpsCallable(functions, "cancelAdminBooking");
      await cancelBookingCall({
        bookingId: booking.id,
      });

      showToast({
        title: "Booking cancelled",
        description: "Capacity has been released for this stay.",
        type: "success",
      });

      if (editingBookingId === booking.id) {
        resetForm();
      }

      await loadData();
    } catch (error) {
      console.error("Cancel booking error:", error);
      showToast({
        title: "Could not cancel booking",
        description: "Please try again.",
        type: "error",
      });
    }
  };

  const deleteBooking = async (booking: BookingRow) => {
    const confirmed = window.confirm(
      "Delete this cancelled booking permanently?"
    );
    if (!confirmed) return;

    try {
      const deleteBookingCall = httpsCallable(functions, "deleteAdminBooking");
      await deleteBookingCall({
        bookingId: booking.id,
      });

      showToast({
        title: "Booking deleted",
        description: "The cancelled booking was removed permanently.",
        type: "success",
      });

      if (editingBookingId === booking.id) {
        resetForm();
      }

      await loadData();
    } catch (error) {
      console.error("Delete booking error:", error);
      showToast({
        title: "Could not delete booking",
        description: "Please try again.",
        type: "error",
      });
    }
  };

  const saveBooking = async () => {
    if (!canSaveBooking || saving) return;

    setSaving(true);

    try {
      const parsedShortStayNights = Number(form.shortStayNights || 0);
      const parsedCustomPrice = Number(form.customPrice || 0);

      const payload = {
        userId: form.userId,
        startWeekId: form.startWeekId,
        durationWeeks: form.durationWeeks,
        status: form.status,
        source: form.source,
        paymentStatus: form.paymentStatus,
        paymentMethod: form.paymentMethod,
        consumesCapacity: form.shortStay ? true : form.consumesCapacity,
        customerName: selectedRecipient?.displayName || form.customerName.trim(),
        customerEmail: selectedRecipient?.email || form.customerEmail.trim().toLowerCase(),
        shortStay: form.shortStay,
        shortStayNights:
          form.shortStay && parsedShortStayNights > 0 ? parsedShortStayNights : null,
        customPrice: parsedCustomPrice > 0 ? parsedCustomPrice : null,
        currency: form.currency.trim().toUpperCase() || "EUR",
        notes: form.notes.trim(),
      };

      if (editingBookingId) {
        const updateBookingCall = httpsCallable(functions, "updateAdminBooking");
        await updateBookingCall({
          bookingId: editingBookingId,
          ...payload,
        });
      } else {
        const createBookingCall = httpsCallable(functions, "createAdminBooking");
        await createBookingCall(payload);
      }

      showToast({
        title: editingBookingId ? "Booking updated" : "Booking created",
        description: `Reserved ${selectedWeeks.length} week${selectedWeeks.length === 1 ? "" : "s"} successfully.`,
        type: "success",
      });

      resetForm();
      await loadData();
    } catch (error) {
      console.error("Save booking error:", error);
      showToast({
        title: editingBookingId ? "Could not update booking" : "Could not create booking",
        description: "Please try again.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const saveEntitlement = async () => {
    if (!canSaveEntitlement || entitlementSaving) return;

    setEntitlementSaving(true);

    try {
      const createEntitlementCall = httpsCallable(
        functions,
        "createBookingEntitlement"
      );
      const result = await createEntitlementCall({
        customerEmail: entitlementForm.customerEmail.trim().toLowerCase(),
        customerName: entitlementForm.customerName.trim(),
        durationWeeks: entitlementForm.durationWeeks,
        amount: Number(entitlementForm.amount || 0) > 0
          ? Number(entitlementForm.amount)
          : null,
        currency: entitlementForm.currency.trim().toUpperCase() || "EUR",
        notes: entitlementForm.notes.trim(),
      });
      const data = (result.data || {}) as {
        code?: string;
        customerEmail?: string;
        durationWeeks?: BookingDurationWeeks;
        amount?: number;
        currency?: string;
      };

      setLastIssuedCode({
        code: String(data.code || ""),
        customerEmail: String(data.customerEmail || entitlementForm.customerEmail),
        durationWeeks:
          data.durationWeeks === 2 || data.durationWeeks === 3 ? data.durationWeeks : 1,
        amount: typeof data.amount === "number" ? data.amount : null,
        currency: String(data.currency || entitlementForm.currency || "EUR"),
      });
      setEntitlementForm(getEmptyEntitlementForm());

      showToast({
        title: "Redemption code created",
        description: `${String(data.code || "").trim()} is ready for ${String(
          data.customerEmail || entitlementForm.customerEmail
        ).trim()}.`,
        type: "success",
      });

      await loadData();
    } catch (error) {
      console.error("Create entitlement error:", error);
      showToast({
        title: "Could not create redemption code",
        description: "Please check the email and pricing details, then try again.",
        type: "error",
      });
    } finally {
      setEntitlementSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">Loading bookings...</p>
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
              Bookings
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Booking Operations
            </h1>

            <p className="mt-3 max-w-3xl text-sm text-slate-600 md:text-base">
              This is the foundation for real stay reservations. It already reads weekly capacity and derives occupancy from the bookings collection.
            </p>

            <div className="mt-6">
              <SegmentedTabs<BookingTab>
                items={[
                  { id: "overview", label: "Overview" },
                  { id: "list", label: "Bookings" },
                  { id: "create", label: editingBookingId ? "Edit booking" : "Create booking" },
                  { id: "codes", label: "Redeem codes" },
                ]}
                value={activeTab}
                onChange={setActiveTab}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Total Bookings" value={String(summary.totalBookings)} tone="light" />
        <SummaryCard label="Active Bookings" value={String(summary.activeBookings)} tone="blue" />
        <SummaryCard label="Paid / Manual" value={String(summary.paidBookings)} tone="success" />
        <SummaryCard label="Capacity In Use" value={String(summary.capacityInUse)} tone="dark" />
        <SummaryCard label="Open Weeks" value={String(summary.openWeeks)} tone="light" />
      </section>

      {activeTab === "create" ? (
        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">
                {editingBookingId ? "Edit booking" : "Manual booking"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Create an admin booking that reserves 1, 2, or 3 consecutive weeks.
              </p>
            </div>

            {editingBookingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel edit
              </button>
            )}
          </div>

          <div className="mt-6 space-y-4">
            <CollapsiblePanel
              title="Guest selection"
              description="Choose the client first. Keep this panel closed once selected."
              defaultOpen
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Platform user
                  </label>
                  <input
                    value={recipientSearch}
                    onChange={(e) => setRecipientSearch(e.target.value)}
                    placeholder="Search user by name or email"
                    className="mb-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  />
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-3">
                    {selectedRecipient ? (
                      <button
                        type="button"
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            userId: "",
                            customerName: "",
                            customerEmail: "",
                          }));
                          setRecipientSearch("");
                        }}
                        className="flex w-full items-center gap-3 rounded-[20px] border border-[#bfdbfe] bg-white px-4 py-3 text-left shadow-sm transition hover:border-[#93c5fd]"
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white">
                          {getRecipientInitials(selectedRecipient.displayName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-950">
                            {selectedRecipient.displayName}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {selectedRecipient.email || selectedRecipient.id}
                          </p>
                        </div>
                        <StatusBadge
                          tone={
                            selectedRecipient.clientStatus === "inactive"
                              ? "neutral"
                              : "success"
                          }
                        >
                          {selectedRecipient.clientStatus}
                        </StatusBadge>
                      </button>
                    ) : (
                      <div className="rounded-[20px] border border-dashed border-slate-200 bg-white px-4 py-6 text-center">
                        <p className="text-sm font-medium text-slate-700">
                          No user selected yet
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Search by name or email, then choose a client below.
                        </p>
                      </div>
                    )}

                    <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                      {filteredRecipientOptions.slice(0, 10).map((recipient) => {
                        const isSelected = recipient.id === form.userId;

                        return (
                          <button
                            key={recipient.id}
                            type="button"
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                userId: recipient.id,
                                customerName: recipient.displayName || "",
                                customerEmail: recipient.email || "",
                              }))
                            }
                            className={`flex w-full items-center gap-3 rounded-[18px] border px-3 py-3 text-left transition ${
                              isSelected
                                ? "border-[#93c5fd] bg-[#eff6ff]"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-xs font-semibold text-slate-700">
                              {getRecipientInitials(recipient.displayName)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-950">
                                {recipient.displayName}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {recipient.email || recipient.id}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <StatusBadge
                                tone={
                                  recipient.clientStatus === "inactive"
                                    ? "neutral"
                                    : "success"
                                }
                              >
                                {recipient.clientStatus}
                              </StatusBadge>
                              {isSelected && (
                                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1d4ed8]">
                                  selected
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}

                      {filteredRecipientOptions.length === 0 && (
                        <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-5 text-center text-sm text-slate-500">
                          No users matched your search.
                        </div>
                      )}
                    </div>

                    <p className="mt-3 text-xs text-slate-500">
                      {filteredRecipientOptions.length} matching user
                      {filteredRecipientOptions.length === 1 ? "" : "s"}
                      {filteredRecipientOptions.length > 10 ? " · showing first 10" : ""}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Linked account
                  </label>
                  <input
                    value={
                      selectedRecipient
                        ? `${selectedRecipient.displayName} · ${selectedRecipient.email || selectedRecipient.id}`
                        : ""
                    }
                    readOnly
                    placeholder="Select a platform user first"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none"
                  />
                </div>
              </div>
            </CollapsiblePanel>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Start week
                </label>
                <select
                  value={form.startWeekId}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, startWeekId: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                >
                  <option value="">Select a start week</option>
                  {startableWeeks.map((week) => (
                    <option key={week.id} value={week.id}>
                      {(week.label || `${formatDateLabel(week.startDate)} - ${formatDateLabel(week.endDate)}`) +
                        ` (${getRemainingSpots(week)} left)`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Duration
                </label>
                <select
                  value={String(form.durationWeeks)}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      durationWeeks: Number(e.target.value) as BookingDurationWeeks,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                >
                  <option value="1">1 week</option>
                  <option value="2">2 weeks</option>
                  <option value="3">3 weeks</option>
                </select>
              </div>
            </div>

            <CollapsiblePanel
              title="Booking details"
              description="Payment, pricing, stay type, and internal notes."
            >
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Booking status
                    </label>
                    <select
                      value={form.status}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          status: e.target.value as BookingFormState["status"],
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                    >
                      <option value="confirmed">Confirmed</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Payment status
                    </label>
                    <select
                      value={form.paymentStatus}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          paymentStatus: e.target.value as BookingFormState["paymentStatus"],
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                    >
                      <option value="manual">Manual</option>
                      <option value="paid">Paid</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Payment method
                    </label>
                    <select
                      value={form.paymentMethod}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          paymentMethod: e.target.value as BookingFormState["paymentMethod"],
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                    >
                      <option value="manual">Manual</option>
                      <option value="cash">Cash</option>
                      <option value="bank_transfer">Bank transfer</option>
                      <option value="stripe">Stripe</option>
                    </select>
                  </div>
                </div>

                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={form.consumesCapacity}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, consumesCapacity: e.target.checked }))
                    }
                  />
                  <span className="text-sm font-medium text-slate-800">
                    This booking consumes weekly capacity
                  </span>
                </label>

                {form.shortStay && (
                  <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Short stays still reserve the full weekly room block, so capacity is always consumed.
                  </p>
                )}

                <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                  <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={form.shortStay}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          shortStay: e.target.checked,
                          shortStayNights: e.target.checked ? prev.shortStayNights : "",
                        }))
                      }
                    />
                    <span className="text-sm font-medium text-slate-800">
                      Mark as short stay
                    </span>
                  </label>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Nights
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={form.shortStayNights}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, shortStayNights: e.target.value }))
                      }
                      disabled={!form.shortStay}
                      placeholder="3"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe] disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr_140px]">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Custom price
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.customPrice}
                      onChange={(e) => setForm((prev) => ({ ...prev, customPrice: e.target.value }))}
                      placeholder="Optional"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Currency
                    </label>
                    <input
                      value={form.currency}
                      onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
                      maxLength={3}
                      placeholder="EUR"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm uppercase text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Notes
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Optional internal note"
                    className="min-h-[110px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  />
                </div>
              </div>
            </CollapsiblePanel>

            <button
              type="button"
              onClick={saveBooking}
              disabled={!canSaveBooking || saving}
              className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {saving
                ? editingBookingId
                  ? "Saving booking..."
                  : "Creating booking..."
                : editingBookingId
                ? "Save booking changes"
                : "Create booking"}
            </button>
          </div>
        </div>

          <div className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
            <h2 className="text-xl font-semibold text-slate-950">Booking preview</h2>
            <p className="mt-2 text-sm text-slate-600">
              Review the stay window and capacity impact before saving.
            </p>

            <div className="mt-6 rounded-[24px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Consecutive weeks preview
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {form.shortStay && <StatusBadge tone="warning">short stay</StatusBadge>}
                <StatusBadge tone="blue">
                  {formatMoney(
                    Number(form.customPrice || 0) > 0 ? Number(form.customPrice) : null,
                    form.currency || "EUR"
                  )}
                </StatusBadge>
              </div>

              {selectedWeeks.length === form.durationWeeks ? (
                <div className="mt-4 space-y-2">
                  {selectedWeeks.map((week) => (
                    <div
                      key={week.id}
                      className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white/90 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {week.label || `${formatDateLabel(week.startDate)} - ${formatDateLabel(week.endDate)}`}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {getRemainingSpots(week)} spots left
                        </p>
                      </div>
                      <StatusBadge tone="success">reserved</StatusBadge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Choose a valid start week and duration. If any required week is inactive, full, or not consecutive, the booking cannot be created.
                </p>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "list" ? (
        <section className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">
                {bookingViewFilter === "recent"
                  ? "Recent bookings"
                  : bookingViewFilter === "confirmed"
                  ? "Confirmed bookings"
                  : bookingViewFilter === "cancelled"
                  ? "Cancelled bookings"
                  : "All bookings"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Manual admin booking and public booking flows will live on top of this dataset.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {(
              [
                ["recent", "Recent"],
                ["confirmed", "Confirmed"],
                ["cancelled", "Cancelled"],
                ["all", "All"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setBookingViewFilter(value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  bookingViewFilter === value
                    ? "bg-slate-950 text-white"
                    : "border border-slate-200 bg-white text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <CollapsiblePanel
            title="Search and filters"
            description="Use when you need to narrow the list."
          >
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_180px_180px]">
            <input
              value={bookingSearch}
              onChange={(e) => setBookingSearch(e.target.value)}
              placeholder="Search by name, email, notes, status..."
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
            />

            <select
              value={bookingPaymentFilter}
              onChange={(e) =>
                setBookingPaymentFilter(
                  e.target.value as BookingPaymentFilter
                )
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
            >
              <option value="all">All payments</option>
              <option value="manual">Manual</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
            </select>

            <select
              value={bookingCapacityFilter}
              onChange={(e) =>
                setBookingCapacityFilter(
                  e.target.value as BookingCapacityFilter
                )
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
            >
              <option value="all">All capacity</option>
              <option value="consumes">Consumes capacity</option>
              <option value="no_capacity">No capacity</option>
            </select>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                Showing {visibleBookings.length} booking{visibleBookings.length === 1 ? "" : "s"}
              </p>

              <div className="flex flex-wrap gap-2">
                {bookingSearch && <StatusBadge tone="blue">search active</StatusBadge>}
                {bookingPaymentFilter !== "all" && (
                  <StatusBadge tone="neutral">{bookingPaymentFilter}</StatusBadge>
                )}
                {bookingCapacityFilter !== "all" && (
                  <StatusBadge tone="neutral">{bookingCapacityFilter}</StatusBadge>
                )}
                {(bookingSearch ||
                  bookingPaymentFilter !== "all" ||
                  bookingCapacityFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setBookingSearch("");
                      setBookingPaymentFilter("all");
                      setBookingCapacityFilter("all");
                    }}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          </CollapsiblePanel>

          {visibleBookings.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center">
              <p className="text-base font-semibold text-slate-900">No bookings in this view</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Try another filter or create a new booking from the panel on the left.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {visibleBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="rounded-[24px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={booking.status === "cancelled" ? "danger" : "success"}>
                      {booking.status}
                    </StatusBadge>
                    <StatusBadge tone="blue">{booking.source}</StatusBadge>
                    <StatusBadge tone="neutral">{booking.paymentStatus}</StatusBadge>
                    {booking.shortStay && <StatusBadge tone="warning">short stay</StatusBadge>}
                  </div>

                  <div className="mt-3">
                    <p className="text-base font-semibold text-slate-950">
                      {booking.customerName || "Unnamed guest"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {booking.customerEmail || "No email"}
                    </p>
                  </div>

                  <div className="mt-3 rounded-[18px] border border-white/80 bg-white/80 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Booking window
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {booking.weekIds?.length
                        ? `${booking.weekIds.length} reserved week${
                            booking.weekIds.length === 1 ? "" : "s"
                          } linked to this booking`
                        : "No weeks linked"}
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <MetaItem label="Duration" value={`${booking.durationWeeks} week${booking.durationWeeks === 1 ? "" : "s"}`} />
                    <MetaItem label="Weeks used" value={String(booking.weekIds?.length || 0)} />
                    <MetaItem
                      label="Price"
                      value={formatMoney(booking.customPrice, booking.currency || "EUR")}
                    />
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <MetaItem
                      label="Stay type"
                      value={
                        booking.shortStay && booking.shortStayNights
                          ? `${booking.shortStayNights} nights`
                          : "Full weekly block"
                      }
                    />
                    <MetaItem label="Capacity" value={booking.consumesCapacity ? "Consumes room" : "No capacity"} />
                    <MetaItem label="Created" value={formatCreatedAt(booking.createdAt)} />
                  </div>

                  {booking.notes && (
                    <div className="mt-3 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">
                        Internal note
                      </p>
                      <p className="mt-2 text-sm leading-6 text-amber-900">{booking.notes}</p>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => startEdit(booking)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      Edit
                    </button>

                    {booking.status !== "cancelled" && (
                      <button
                        type="button"
                        onClick={() => cancelBooking(booking)}
                        className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
                      >
                        Cancel booking
                      </button>
                    )}

                    {booking.status === "cancelled" && (
                      <button
                        type="button"
                        onClick={() => deleteBooking(booking)}
                        className="rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                      >
                        Delete permanently
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "codes" ? (
        <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">
                External sale redemption code
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Create a redeemable credit for someone who paid outside the platform.
              </p>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Customer email
                </label>
                <input
                  type="email"
                  value={entitlementForm.customerEmail}
                  onChange={(e) =>
                    setEntitlementForm((prev) => ({
                      ...prev,
                      customerEmail: e.target.value,
                    }))
                  }
                  placeholder="name@example.com"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Customer name
                </label>
                <input
                  value={entitlementForm.customerName}
                  onChange={(e) =>
                    setEntitlementForm((prev) => ({
                      ...prev,
                      customerName: e.target.value,
                    }))
                  }
                  placeholder="Optional"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Duration
                  </label>
                  <select
                    value={String(entitlementForm.durationWeeks)}
                    onChange={(e) =>
                      setEntitlementForm((prev) => ({
                        ...prev,
                        durationWeeks: Number(e.target.value) as BookingDurationWeeks,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  >
                    <option value="1">1 week</option>
                    <option value="2">2 weeks</option>
                    <option value="3">3 weeks</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Amount
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={entitlementForm.amount}
                    onChange={(e) =>
                      setEntitlementForm((prev) => ({
                        ...prev,
                        amount: e.target.value,
                      }))
                    }
                    placeholder="Defaults to pricing matrix"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Currency
                  </label>
                  <input
                    value={entitlementForm.currency}
                    onChange={(e) =>
                      setEntitlementForm((prev) => ({
                        ...prev,
                        currency: e.target.value,
                      }))
                    }
                    maxLength={3}
                    placeholder="EUR"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm uppercase text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Notes
                </label>
                <textarea
                  value={entitlementForm.notes}
                  onChange={(e) =>
                    setEntitlementForm((prev) => ({
                      ...prev,
                      notes: e.target.value,
                    }))
                  }
                  placeholder="Optional internal note about the external sale"
                  className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </div>

              <div className="rounded-[22px] border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3 text-sm text-slate-700">
                This creates a credit only. Capacity is not reserved until the client redeems the code on a specific start week.
              </div>

              <button
                type="button"
                onClick={saveEntitlement}
                disabled={!canSaveEntitlement || entitlementSaving}
                className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                {entitlementSaving ? "Creating code..." : "Create redemption code"}
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {lastIssuedCode ? (
              <div className="rounded-[28px] border border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                  Latest code
                </p>
                <p className="mt-3 text-2xl font-semibold tracking-[0.08em] text-slate-950">
                  {lastIssuedCode.code}
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  {lastIssuedCode.durationWeeks} week
                  {lastIssuedCode.durationWeeks === 1 ? "" : "s"} ·{" "}
                  {formatMoney(
                    lastIssuedCode.amount,
                    lastIssuedCode.currency || "EUR"
                  )}{" "}
                  · {lastIssuedCode.customerEmail}
                </p>
              </div>
            ) : null}

            <div className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">
                    Recent codes
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Active credits: {activeEntitlements.length}
                  </p>
                </div>
              </div>

              {recentEntitlements.length === 0 ? (
                <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                  No redemption codes created yet.
                </div>
              ) : (
                <div className="mt-6 space-y-3">
                  {recentEntitlements.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          tone={
                            item.status === "redeemed"
                              ? "success"
                              : item.status === "claimed"
                              ? "blue"
                              : item.status === "expired" || item.status === "cancelled"
                              ? "danger"
                              : "warning"
                          }
                        >
                          {item.status || "issued"}
                        </StatusBadge>
                        <StatusBadge tone="neutral">
                          {item.durationWeeks} week{item.durationWeeks === 1 ? "" : "s"}
                        </StatusBadge>
                      </div>

                      <p className="mt-3 text-sm font-semibold tracking-[0.08em] text-slate-950">
                        {item.code || item.id}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {item.customerName || item.customerEmail || "No recipient"}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {item.customerEmail || "No email"} ·{" "}
                        {formatMoney(item.amount, item.currency || "EUR")}
                      </p>

                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <MetaItem label="Created" value={formatCreatedAt(item.createdAt)} />
                        <MetaItem
                          label="Claimed by"
                          value={item.claimedByEmail || "Not claimed"}
                        />
                        <MetaItem
                          label="Booking"
                          value={item.bookingId || "Not redeemed"}
                        />
                      </div>

                      {item.notes ? (
                        <div className="mt-3 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">
                            Internal note
                          </p>
                          <p className="mt-2 text-sm leading-6 text-amber-900">
                            {item.notes}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "overview" ? (
        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
            <h2 className="text-xl font-semibold text-slate-950">Capacity snapshot</h2>
            <p className="mt-1 text-sm text-slate-500">
              Weekly occupancy here is derived from bookings, not manually typed.
            </p>

            <div className="mt-5 space-y-3">
              {hydratedWeeks.length === 0 ? (
                <p className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
                  No weekly availability yet.
                </p>
              ) : (
                hydratedWeeks.slice(0, 6).map((week) => (
                  <div
                    key={week.id}
                    className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">
                          {week.label || `${formatDateLabel(week.startDate)} - ${formatDateLabel(week.endDate)}`}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDateLabel(week.startDate)} - {formatDateLabel(week.endDate)}
                        </p>
                      </div>

                      <StatusBadge
                        tone={
                          getWeekAvailabilityStatus(week) === "soldout"
                            ? "danger"
                            : getWeekAvailabilityStatus(week) === "low"
                            ? "warning"
                            : getWeekAvailabilityStatus(week) === "inactive"
                            ? "neutral"
                            : "success"
                        }
                      >
                        {getWeekAvailabilityStatus(week)}
                      </StatusBadge>
                    </div>

                    <p className="mt-3 text-sm text-slate-600">
                      {week.booked} booked / {week.capacity} capacity · {getRemainingSpots(week)} left
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
            <h2 className="text-lg font-semibold text-slate-950">Admin flexibility</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Admin can now handle both sides of the stay flow: direct manual bookings and external-sale redemption codes that the client can use later inside their own Book page.
            </p>
          </div>
        </div>

        </section>
      ) : null}
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
  tone: "blue" | "success" | "light" | "dark";
}) {
  const styles = {
    blue: "border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white",
    success: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white",
    light: "border-slate-200 bg-white",
    dark: "border-slate-800 bg-gradient-to-br from-slate-950 to-slate-800 text-white",
  };

  const labelStyles = {
    blue: "text-[#1d4ed8]",
    success: "text-emerald-700",
    light: "text-slate-500",
    dark: "text-slate-300",
  };

  return (
    <div className={`rounded-[16px] border px-3.5 py-2.5 shadow-[0_8px_18px_rgba(15,23,42,0.05)] ${styles[tone]}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${labelStyles[tone]}`}>{label}</p>
      <p className="mt-1 text-xl font-semibold leading-none tracking-tight">{value}</p>
    </div>
  );
}

function StatusBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "success" | "danger" | "warning" | "blue" | "neutral";
}) {
  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    blue: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
    neutral: "border-slate-200 bg-slate-50 text-slate-600",
  };

  return (
    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${styles[tone]}`}>
      {children}
    </span>
  );
}

function MetaItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white/80 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
