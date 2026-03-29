"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { buildCsv, downloadCsv } from "@/lib/export";
import { BookingRecord } from "@/lib/bookings";

type Profile = {
  id: string;
  fullName: string;
  userId?: string;
  approvalStatus?: string;
  onboardingStatus?: string;
  paymentStatus?: string;
  assignedProgram?: string;
  clientStatus?: "active" | "inactive";
  age?: string;
  goal?: string;
  height?: string;
  weight?: string;
  allergies?: string;
  injuries?: string;
  notes?: string;
  internalNotes?: string;
};

type UserRow = {
  id: string;
  email?: string;
  role?: string;
  name?: string;
  displayName?: string;
};

type ApplicationRow = {
  id: string;
  userId?: string;
  phone?: string;
  goal?: string;
  status?: string;
  createdAt?: {
    seconds?: number;
    nanoseconds?: number;
  };
};

type BookingExportRecord = BookingRecord & {
  createdAt?: {
    seconds?: number;
    nanoseconds?: number;
  };
};

type PaymentFilter = "all" | "paid" | "pending" | "cash" | "manual";
type OnboardingFilter = "all" | "active" | "incomplete";
type ClientExportScope = "filtered" | "all" | "active" | "inactive";
type BookingExportStatus = "all" | "confirmed" | "pending" | "cancelled";
type BookingExportPayment = "all" | "paid" | "pending" | "manual";

function getInitials(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "CL";

  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

export default function AdminProfilesPage() {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [bookings, setBookings] = useState<BookingExportRecord[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "all"
  );
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [onboardingFilter, setOnboardingFilter] =
    useState<OnboardingFilter>("all");
  const [clientExportScope, setClientExportScope] =
    useState<ClientExportScope>("filtered");
  const [bookingExportStatus, setBookingExportStatus] =
    useState<BookingExportStatus>("all");
  const [bookingExportPayment, setBookingExportPayment] =
    useState<BookingExportPayment>("all");
  const [bookingExportYear, setBookingExportYear] = useState("all");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.replace("/login");
        return;
      }

      try {
        const [profilesSnap, usersSnap, applicationsSnap, bookingsSnap] =
          await Promise.all([
            getDocs(collection(db, "profiles")),
            getDocs(collection(db, "users")),
            getDocs(collection(db, "applications")),
            getDocs(collection(db, "bookings")),
          ]);

        const data: Profile[] = profilesSnap.docs
          .map((docItem) => ({
            id: docItem.id,
            ...(docItem.data() as Omit<Profile, "id">),
          }))
          .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));

        const userData = usersSnap.docs.map((docItem) => ({
          id: docItem.id,
          ...(docItem.data() as Omit<UserRow, "id">),
        })) as UserRow[];

        const applicationData = applicationsSnap.docs.map((docItem) => ({
          id: docItem.id,
          ...(docItem.data() as Omit<ApplicationRow, "id">),
        })) as ApplicationRow[];

        const bookingData = bookingsSnap.docs.map((docItem) => ({
          id: docItem.id,
          ...(docItem.data() as Omit<BookingExportRecord, "id">),
        })) as BookingExportRecord[];

        setProfiles(data);
        setUsers(userData);
        setApplications(applicationData);
        setBookings(bookingData);
      } catch (error) {
        console.error("Fetch profiles error:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const filteredProfiles = useMemo(() => {
    return profiles.filter((profile) => {
      const name = (profile.fullName || "").toLowerCase();
      const program = (profile.assignedProgram || "").toLowerCase();
      const payment = (profile.paymentStatus || "").toLowerCase();
      const onboarding = (profile.onboardingStatus || "").toLowerCase();
      const query = search.trim().toLowerCase();

      const matchesSearch =
        !query ||
        name.includes(query) ||
        program.includes(query) ||
        payment.includes(query) ||
        onboarding.includes(query);

      const currentStatus = profile.clientStatus || "active";

      const matchesStatus =
        statusFilter === "all" ? true : currentStatus === statusFilter;

      const currentPayment = String(profile.paymentStatus || "pending").toLowerCase();
      const matchesPayment =
        paymentFilter === "all" ? true : currentPayment === paymentFilter;

      const currentOnboarding = String(
        profile.onboardingStatus || "incomplete"
      ).toLowerCase();
      const matchesOnboarding =
        onboardingFilter === "all"
          ? true
          : currentOnboarding === onboardingFilter;

      return matchesSearch && matchesStatus && matchesPayment && matchesOnboarding;
    });
  }, [onboardingFilter, paymentFilter, profiles, search, statusFilter]);

  const summary = useMemo(() => {
    return {
      total: profiles.length,
      active: profiles.filter(
        (profile) => (profile.clientStatus || "active") === "active"
      ).length,
      inactive: profiles.filter(
        (profile) => (profile.clientStatus || "active") === "inactive"
      ).length,
      assigned: profiles.filter((profile) => Boolean(profile.assignedProgram))
        .length,
      pendingPayment: profiles.filter(
        (profile) => (profile.paymentStatus || "pending") === "pending"
      ).length,
      incompleteOnboarding: profiles.filter(
        (profile) => (profile.onboardingStatus || "incomplete") === "incomplete"
      ).length,
    };
  }, [profiles]);

  const availableBookingYears = useMemo(() => {
    return [...new Set(
      bookings
        .map((booking) =>
          booking.createdAt?.seconds
            ? String(new Date(booking.createdAt.seconds * 1000).getFullYear())
            : ""
        )
        .filter(Boolean)
    )].sort((a, b) => Number(b) - Number(a));
  }, [bookings]);

  const exportClientDatabase = () => {
    const userById = new Map(users.map((user) => [user.id, user]));
    const applicationByUserId = new Map(
      applications
        .filter((application) => application.userId)
        .map((application) => [application.userId as string, application])
    );
    const bookingsByProfileId = new Map<string, BookingRecord[]>();

    bookings.forEach((booking) => {
      const key = booking.profileId || "";
      if (!key) return;
      const current = bookingsByProfileId.get(key) || [];
      current.push(booking);
      bookingsByProfileId.set(key, current);
    });

    const sourceProfiles =
      clientExportScope === "filtered"
        ? filteredProfiles
        : clientExportScope === "active"
        ? profiles.filter((profile) => (profile.clientStatus || "active") === "active")
        : clientExportScope === "inactive"
        ? profiles.filter((profile) => (profile.clientStatus || "active") === "inactive")
        : profiles;

    const rows = sourceProfiles.map((profile) => {
      const user = profile.userId ? userById.get(profile.userId) : null;
      const application = profile.userId
        ? applicationByUserId.get(profile.userId)
        : null;
      const profileBookings = bookingsByProfileId.get(profile.id) || [];

      return {
        profileId: profile.id,
        userId: profile.userId || "",
        fullName: profile.fullName || "",
        email: user?.email || "",
        phone: application?.phone || "",
        approvalStatus: profile.approvalStatus || "",
        onboardingStatus: profile.onboardingStatus || "",
        paymentStatus: profile.paymentStatus || "",
        clientStatus: profile.clientStatus || "active",
        assignedProgram: profile.assignedProgram || "",
        age: profile.age || "",
        goal: profile.goal || application?.goal || "",
        height: profile.height || "",
        weight: profile.weight || "",
        allergies: profile.allergies || "",
        injuries: profile.injuries || "",
        notes: profile.notes || "",
        internalNotes: profile.internalNotes || "",
        totalBookings: profileBookings.length,
        confirmedBookings: profileBookings.filter(
          (booking) => booking.status === "confirmed"
        ).length,
        pendingBookings: profileBookings.filter(
          (booking) => booking.status === "pending"
        ).length,
        totalCustomPrice: profileBookings.reduce(
          (sum, booking) => sum + (typeof booking.customPrice === "number" ? booking.customPrice : 0),
          0
        ),
      };
    });

    const headers = [
      "profileId",
      "userId",
      "fullName",
      "email",
      "phone",
      "approvalStatus",
      "onboardingStatus",
      "paymentStatus",
      "clientStatus",
      "assignedProgram",
      "age",
      "goal",
      "height",
      "weight",
      "allergies",
      "injuries",
      "notes",
      "internalNotes",
      "totalBookings",
      "confirmedBookings",
      "pendingBookings",
      "totalCustomPrice",
    ];

    downloadCsv(
      `bootcamp-client-database-${clientExportScope}-${new Date().toISOString().slice(0, 10)}.csv`,
      buildCsv(headers, rows)
    );
  };

  const exportBookingsReport = () => {
    const userById = new Map(users.map((user) => [user.id, user]));
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const applicationByUserId = new Map(
      applications
        .filter((application) => application.userId)
        .map((application) => [application.userId as string, application])
    );

    const filteredBookings = bookings.filter((booking) => {
      const matchesStatus =
        bookingExportStatus === "all" ? true : booking.status === bookingExportStatus;
      const matchesPayment =
        bookingExportPayment === "all"
          ? true
          : booking.paymentStatus === bookingExportPayment;
      const bookingYear = booking.createdAt?.seconds
        ? String(new Date(booking.createdAt.seconds * 1000).getFullYear())
        : "";
      const matchesYear =
        bookingExportYear === "all" ? true : bookingYear === bookingExportYear;

      return matchesStatus && matchesPayment && matchesYear;
    });

    const rows = filteredBookings.map((booking) => {
      const profile = booking.profileId ? profileById.get(booking.profileId) : null;
      const user = booking.userId ? userById.get(booking.userId) : null;
      const application = booking.userId
        ? applicationByUserId.get(booking.userId)
        : null;

      return {
        bookingId: booking.id,
        profileId: booking.profileId || "",
        userId: booking.userId || "",
        customerName: booking.customerName || profile?.fullName || "",
        customerEmail: booking.customerEmail || user?.email || "",
        phone: application?.phone || "",
        bookingStatus: booking.status,
        durationWeeks: booking.durationWeeks,
        startWeekId: booking.startWeekId || "",
        weekIds: Array.isArray(booking.weekIds) ? booking.weekIds.join(" | ") : "",
        paymentStatus: booking.paymentStatus,
        paymentMethod: booking.paymentMethod,
        consumesCapacity: booking.consumesCapacity ? "yes" : "no",
        shortStay: booking.shortStay ? "yes" : "no",
        shortStayNights: booking.shortStayNights || "",
        customPrice: typeof booking.customPrice === "number" ? booking.customPrice : "",
        currency: booking.currency || "EUR",
        createdAt: booking.createdAt?.seconds
          ? new Date(booking.createdAt.seconds * 1000).toISOString()
          : "",
        assignedProgram: profile?.assignedProgram || "",
        clientStatus: profile?.clientStatus || "",
        profilePaymentStatus: profile?.paymentStatus || "",
        notes: booking.notes || "",
      };
    });

    const headers = [
      "bookingId",
      "profileId",
      "userId",
      "customerName",
      "customerEmail",
      "phone",
      "bookingStatus",
      "durationWeeks",
      "startWeekId",
      "weekIds",
      "paymentStatus",
      "paymentMethod",
      "consumesCapacity",
      "shortStay",
      "shortStayNights",
      "customPrice",
      "currency",
      "createdAt",
      "assignedProgram",
      "clientStatus",
      "profilePaymentStatus",
      "notes",
    ];

    downloadCsv(
      `bootcamp-bookings-report-${bookingExportStatus}-${bookingExportPayment}-${bookingExportYear}-${new Date().toISOString().slice(0, 10)}.csv`,
      buildCsv(headers, rows)
    );
  };

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">
          Loading profiles...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
        <div className="bg-gradient-to-r from-[#0f172a] via-[#123b76] to-[#2EA0FF] p-[1px]">
          <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
        </div>

        <div className="p-6 md:p-8">
          <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
            Clients
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
            Profiles
          </h1>

          <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
            Search and manage your bootcamp clients, view their status, and open
            their individual profiles.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <HeaderPill label="Profiles" value={String(summary.total)} />
            <HeaderPill label="Pending payment" value={String(summary.pendingPayment)} />
            <HeaderPill
              label="Onboarding incomplete"
              value={String(summary.incompleteOnboarding)}
            />
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <div className="rounded-[22px] border border-slate-200 bg-white/90 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Client Database Export
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Export all client records, or only active/inactive clients. `Filtered`
                uses the current search and page filters.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <select
                  value={clientExportScope}
                  onChange={(e) =>
                    setClientExportScope(e.target.value as ClientExportScope)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                >
                  <option value="filtered">Current filtered view</option>
                  <option value="all">All clients</option>
                  <option value="active">Active only</option>
                  <option value="inactive">Inactive only</option>
                </select>
                <button
                  type="button"
                  onClick={exportClientDatabase}
                  className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md"
                >
                  Export Client CSV
                </button>
              </div>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-white/90 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Bookings & Payments Export
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Filter by booking status, payment status, and year. Year uses booking
                creation timestamp because profiles do not currently store a reliable created date.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <select
                  value={bookingExportStatus}
                  onChange={(e) =>
                    setBookingExportStatus(e.target.value as BookingExportStatus)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                >
                  <option value="all">All booking status</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Pending</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <select
                  value={bookingExportPayment}
                  onChange={(e) =>
                    setBookingExportPayment(e.target.value as BookingExportPayment)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                >
                  <option value="all">All payment status</option>
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                  <option value="manual">Manual</option>
                </select>
                <select
                  value={bookingExportYear}
                  onChange={(e) => setBookingExportYear(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                >
                  <option value="all">All years</option>
                  {availableBookingYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={exportBookingsReport}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                >
                  Export Bookings & Payments CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total Profiles" value={String(summary.total)} tone="light" />
        <SummaryCard label="Active Clients" value={String(summary.active)} tone="success" />
        <SummaryCard label="Inactive Clients" value={String(summary.inactive)} tone="danger" />
        <SummaryCard label="Programs Assigned" value={String(summary.assigned)} tone="blue" />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
        <SummaryCard
          label="Pending Payment"
          value={String(summary.pendingPayment)}
          tone="danger"
        />
        <SummaryCard
          label="Incomplete Onboarding"
          value={String(summary.incompleteOnboarding)}
          tone="blue"
        />
      </section>

      <section className="rounded-[28px] border border-white/70 bg-white/90 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_180px_180px_180px]">
          <input
            type="text"
            placeholder="Search by client, program, payment, onboarding..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
          />

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "all" | "active" | "inactive")
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as PaymentFilter)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
          >
            <option value="all">All payments</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="cash">Cash</option>
            <option value="manual">Manual</option>
          </select>

          <select
            value={onboardingFilter}
            onChange={(e) =>
              setOnboardingFilter(e.target.value as OnboardingFilter)
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
          >
            <option value="all">All onboarding</option>
            <option value="active">Active</option>
            <option value="incomplete">Incomplete</option>
          </select>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {statusFilter !== "all" && <StatusBadge tone="neutral">{statusFilter}</StatusBadge>}
            {paymentFilter !== "all" && <StatusBadge tone="neutral">{paymentFilter}</StatusBadge>}
            {onboardingFilter !== "all" && (
              <StatusBadge tone="blue">{onboardingFilter}</StatusBadge>
            )}
            {search.trim() && <StatusBadge tone="blue">search active</StatusBadge>}
          </div>

          <div className="flex items-center gap-3">
            <p className="text-sm text-slate-500">
              Showing {filteredProfiles.length} profile
              {filteredProfiles.length === 1 ? "" : "s"}
            </p>

            {(search.trim() ||
              statusFilter !== "all" ||
              paymentFilter !== "all" ||
              onboardingFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setPaymentFilter("all");
                  setOnboardingFilter("all");
                }}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </section>

      {filteredProfiles.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/80 p-10 text-center text-sm text-slate-500">
          No profiles found.
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredProfiles.map((profile) => (
            <div
              key={profile.id}
              className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_14px_40px_rgba(15,23,42,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_45px_rgba(15,23,42,0.10)]"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-slate-950 text-sm font-semibold text-white shadow-sm">
                      {getInitials(profile.fullName || "Client")}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl font-semibold text-slate-950">
                        {profile.fullName || "Unnamed profile"}
                      </h2>

                      <p className="mt-1 text-sm text-slate-500">
                        {profile.userId || profile.id}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge tone={profile.clientStatus === "inactive" ? "danger" : "success"}>
                      {profile.clientStatus || "active"}
                    </StatusBadge>

                    <StatusBadge tone="neutral">
                      payment: {profile.paymentStatus || "—"}
                    </StatusBadge>

                    <StatusBadge tone="blue">
                      onboarding: {profile.onboardingStatus || "—"}
                    </StatusBadge>

                    <StatusBadge tone="neutral">
                      approval: {profile.approvalStatus || "—"}
                    </StatusBadge>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <ProfileMetaCard
                      label="Assigned program"
                      value={profile.assignedProgram || "Not assigned"}
                    />
                    <ProfileMetaCard
                      label="Next action"
                      value={getProfileNextAction(profile)}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href={`/admin/profiles/${profile.id}`}
                    className="inline-flex rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md"
                  >
                    Open Profile
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
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
  tone: "blue" | "success" | "danger" | "light";
}) {
  const styles: Record<
    "blue" | "success" | "danger" | "light",
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

function StatusBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "success" | "danger" | "blue" | "neutral";
}) {
  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
    blue: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
  };

  return (
    <span
      className={`rounded-full border px-3 py-1 text-[11px] font-semibold capitalize ${styles[tone]}`}
    >
      {children}
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

function ProfileMetaCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function getProfileNextAction(profile: Profile) {
  if ((profile.approvalStatus || "approved") !== "approved") {
    return "Review approval";
  }

  if ((profile.paymentStatus || "pending") === "pending") {
    return "Confirm payment";
  }

  if ((profile.onboardingStatus || "incomplete") !== "active") {
    return "Complete onboarding";
  }

  if (!profile.assignedProgram) {
    return "Assign program";
  }

  if ((profile.clientStatus || "active") === "inactive") {
    return "Check inactive status";
  }

  return "Profile healthy";
}
