"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useSearchParams } from "next/navigation";
import { auth, functions } from "@/lib/firebase";
import { useToast } from "@/components/ui/ToastProvider";
import {
  BookingDurationWeeks,
  BootcampWeekRecord,
  canStartDuration,
  getRemainingSpots,
  getWeekAvailabilityStatus,
} from "@/lib/bookings";

type BookingPricing = {
  oneWeekPrice: number | null;
  twoWeekPrice: number | null;
  threeWeekPrice: number | null;
  currency: string;
};

type BookingRecord = {
  id: string;
  startWeekId: string;
  weekIds: string[];
  durationWeeks: BookingDurationWeeks;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  customPrice?: number | null;
  currency?: string;
  createdAt?: {
    seconds?: number;
    nanoseconds?: number;
  };
};

type BookingEntitlement = {
  id: string;
  code: string;
  customerEmail?: string;
  customerName?: string;
  durationWeeks: BookingDurationWeeks;
  amount?: number | null;
  currency?: string;
  status: string;
  notes?: string;
  bookingId?: string;
  createdAt?: {
    seconds?: number;
    nanoseconds?: number;
  };
};

type BookingCatalogResponse = {
  weeks?: BootcampWeekRecord[];
  pricing?: Partial<BookingPricing>;
  bookings?: BookingRecord[];
  entitlements?: BookingEntitlement[];
};

function formatDateLabel(date: string) {
  if (!date) return "No date";

  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMonthLabel(date: string) {
  if (!date) return "No month";

  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function formatMonthShort(date: string) {
  if (!date) return "Month";

  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
  });
}

function formatMoney(amount?: number | null, currency = "EUR") {
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return "Price pending";
  }

  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getCurrentDateKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getPriceForDuration(
  pricing: BookingPricing,
  duration: BookingDurationWeeks
) {
  if (duration === 3) return pricing.threeWeekPrice;
  if (duration === 2) return pricing.twoWeekPrice;
  return pricing.oneWeekPrice;
}

export default function DashboardBookPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [weeks, setWeeks] = useState<BootcampWeekRecord[]>([]);
  const [pricing, setPricing] = useState<BookingPricing>({
    oneWeekPrice: null,
    twoWeekPrice: null,
    threeWeekPrice: null,
    currency: "EUR",
  });
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [entitlements, setEntitlements] = useState<BookingEntitlement[]>([]);
  const [bookingKey, setBookingKey] = useState("");
  const [redeemingKey, setRedeemingKey] = useState("");
  const [redeemCode, setRedeemCode] = useState("");
  const [claimingCode, setClaimingCode] = useState(false);
  const [selectedMonthKey, setSelectedMonthKey] = useState("");

  const { showToast } = useToast();

  useEffect(() => {
    const codeParam = String(searchParams.get("code") || "").trim();
    const checkoutParam = String(searchParams.get("checkout") || "").trim();

    if (codeParam) {
      setRedeemCode((current) => current || codeParam);
    }

    if (!checkoutParam) {
      return;
    }

    if (checkoutParam === "success") {
      showToast({
        title: "Payment completed",
        description: "Your booking payment was completed in Stripe.",
        type: "success",
      });
    } else if (checkoutParam === "cancel") {
      showToast({
        title: "Checkout cancelled",
        description: "Your booking was left pending and no payment was completed.",
        type: "error",
      });
    } else if (checkoutParam === "external-success") {
      showToast({
        title: "Payment completed",
        description:
          "Your code will be emailed to you and can also appear here automatically if the same email is used.",
        type: "success",
      });
    } else if (checkoutParam === "external-cancel") {
      showToast({
        title: "Checkout cancelled",
        description: "No external purchase was completed.",
        type: "error",
      });
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    window.history.replaceState({}, "", url.toString());
  }, [searchParams, showToast]);

  const loadCatalog = useCallback(async () => {
    try {
      await auth.authStateReady();

      if (!auth.currentUser) {
        window.location.replace("/login");
        return;
      }

      const getCatalog = httpsCallable(functions, "getUserBookingCatalog");
      const response = await getCatalog();
      const data = (response.data || {}) as BookingCatalogResponse;

      setWeeks(
        Array.isArray(data.weeks)
          ? [...data.weeks].sort((a, b) =>
              String(a.startDate || "").localeCompare(String(b.startDate || ""))
            )
          : []
      );
      setPricing({
        oneWeekPrice:
          typeof data.pricing?.oneWeekPrice === "number"
            ? data.pricing.oneWeekPrice
            : null,
        twoWeekPrice:
          typeof data.pricing?.twoWeekPrice === "number"
            ? data.pricing.twoWeekPrice
            : null,
        threeWeekPrice:
          typeof data.pricing?.threeWeekPrice === "number"
            ? data.pricing.threeWeekPrice
            : null,
        currency:
          String(data.pricing?.currency || "EUR").trim().toUpperCase() || "EUR",
      });
      setBookings(Array.isArray(data.bookings) ? data.bookings : []);
      setEntitlements(Array.isArray(data.entitlements) ? data.entitlements : []);
    } catch (error) {
      console.error("Load booking catalog error:", error);
      showToast({
        title: "Could not load booking options",
        description: "Please refresh the page.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const currentDateKey = useMemo(() => getCurrentDateKey(), []);

  const weekItems = useMemo(() => {
    const orderedWeeks = [...weeks].sort((a, b) =>
      String(a.startDate || "").localeCompare(String(b.startDate || ""))
    );

    return orderedWeeks
      .map((week, index) => ({
        week,
        startableOneWeek: canStartDuration(orderedWeeks, index, 1),
        startableTwoWeeks: canStartDuration(orderedWeeks, index, 2),
        startableThreeWeeks: canStartDuration(orderedWeeks, index, 3),
      }))
      .filter((item) => String(item.week.startDate || "") >= currentDateKey);
  }, [currentDateKey, weeks]);

  const summary = useMemo(
    () => ({
      availableStarts: weekItems.filter(
        (item) =>
          item.startableOneWeek || item.startableTwoWeeks || item.startableThreeWeeks
      ).length,
      activeBookings: bookings.filter((item) => item.status !== "cancelled").length,
      pendingPayment: bookings.filter(
        (item) => item.paymentStatus === "pending"
      ).length,
      availableCredits: entitlements.filter(
        (item) => item.status === "issued" || item.status === "claimed"
      ).length,
    }),
    [bookings, entitlements, weekItems]
  );

  const weekLookup = useMemo(
    () =>
      new Map(
        weeks.map((week) => [
          week.id,
          week.label || `${formatDateLabel(week.startDate)} → ${formatDateLabel(week.endDate)}`,
        ])
      ),
    [weeks]
  );

  const availableEntitlements = useMemo(
    () =>
      entitlements.filter(
        (item) => item.status === "issued" || item.status === "claimed"
      ),
    [entitlements]
  );

  const entitlementCounts = useMemo(() => {
    const counts: Record<BookingDurationWeeks, number> = {
      1: 0,
      2: 0,
      3: 0,
    };

    availableEntitlements.forEach((item) => {
      counts[item.durationWeeks] += 1;
    });

    return counts;
  }, [availableEntitlements]);

  const monthSections = useMemo(() => {
    const buckets = new Map<
      string,
      {
        key: string;
        label: string;
        items: typeof weekItems;
      }
    >();

    weekItems.forEach((item) => {
      const key = String(item.week.startDate || "").slice(0, 7);
      const existing = buckets.get(key);

      if (existing) {
        existing.items.push(item);
        return;
      }

      buckets.set(key, {
        key,
        label: formatMonthLabel(item.week.startDate),
        items: [item],
      });
    });

    return Array.from(buckets.values());
  }, [weekItems]);

  useEffect(() => {
    if (monthSections.length === 0) {
      if (selectedMonthKey) {
        setSelectedMonthKey("");
      }
      return;
    }

    if (!selectedMonthKey || !monthSections.some((month) => month.key === selectedMonthKey)) {
      setSelectedMonthKey(monthSections[0].key);
    }
  }, [monthSections, selectedMonthKey]);

  const visibleWeekItems = useMemo(() => {
    if (!selectedMonthKey) {
      return weekItems;
    }

    return monthSections.find((month) => month.key === selectedMonthKey)?.items || [];
  }, [monthSections, selectedMonthKey, weekItems]);

  const handleBooking = async (
    startWeekId: string,
    durationWeeks: BookingDurationWeeks
  ) => {
    const nextKey = `${startWeekId}-${durationWeeks}`;

    try {
      setBookingKey(nextKey);

      const createCheckoutSession = httpsCallable(
        functions,
        "createUserBookingCheckoutSession"
      );
      const response = await createCheckoutSession({
        startWeekId,
        durationWeeks,
      });
      const data = (response.data || {}) as {
        url?: string;
      };

      if (!data.url) {
        throw new Error("Stripe Checkout URL was not returned.");
      }

      window.location.assign(data.url);
    } catch (error) {
      console.error("Create user booking error:", error);
      showToast({
        title: "Could not start checkout",
        description: "Please try another week or duration.",
        type: "error",
      });
    } finally {
      setBookingKey("");
    }
  };

  const handleClaimCode = async () => {
    if (!redeemCode.trim() || claimingCode) {
      return;
    }

    try {
      setClaimingCode(true);

      const claimCodeCall = httpsCallable(functions, "claimBookingEntitlementCode");
      await claimCodeCall({
        code: redeemCode.trim(),
      });

      setRedeemCode("");
      showToast({
        title: "Code added",
        description: "Your booking credit is now available to redeem below.",
        type: "success",
      });

      await loadCatalog();
    } catch (error) {
      console.error("Claim entitlement code error:", error);
      showToast({
        title: "Could not add code",
        description: "Please check the code and try again.",
        type: "error",
      });
    } finally {
      setClaimingCode(false);
    }
  };

  const handleRedeem = async (
    startWeekId: string,
    durationWeeks: BookingDurationWeeks
  ) => {
    const entitlement = availableEntitlements.find(
      (item) => item.durationWeeks === durationWeeks
    );

    if (!entitlement) {
      showToast({
        title: "No credit available",
        description: "This duration does not have a redeemable credit right now.",
        type: "error",
      });
      return;
    }

    const nextKey = `${startWeekId}-${durationWeeks}`;

    try {
      setRedeemingKey(nextKey);

      const redeemCall = httpsCallable(functions, "redeemBookingEntitlement");
      const response = await redeemCall({
        entitlementId: entitlement.id,
        startWeekId,
      });
      const data = (response.data || {}) as {
        amount?: number;
        currency?: string;
      };

      showToast({
        title: "Credit redeemed",
        description: `Your ${durationWeeks}-week stay was confirmed with ${formatMoney(
          data.amount ?? entitlement.amount,
          data.currency || entitlement.currency || pricing.currency
        )}.`,
        type: "success",
      });

      await loadCatalog();
    } catch (error) {
      console.error("Redeem entitlement error:", error);
      showToast({
        title: "Could not redeem credit",
        description: "Please try another week or refresh the page.",
        type: "error",
      });
    } finally {
      setRedeemingKey("");
    }
  };

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">
          Loading booking options...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-28">
      <section className="overflow-hidden rounded-[28px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur md:rounded-[32px]">
        <div className="bg-gradient-to-r from-[#071120] via-[#123b76] to-[#2EA0FF] p-[1px]">
          <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
        </div>
        <div className="relative overflow-hidden p-5 md:p-8">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#2EA0FF]/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-emerald-300/10 blur-3xl" />

          <div className="relative">
            <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
              Book
            </div>
            <h1 className="mt-4 text-[1.9rem] font-semibold tracking-tight text-slate-950 md:text-4xl">
              Book Your Stay
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-600 md:text-base">
              Explore upcoming bootcamp weeks, choose the stay length that fits
              you, and create your booking from your own dashboard.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <HeaderPill label="Available starts" value={String(summary.availableStarts)} />
              <HeaderPill label="My bookings" value={String(summary.activeBookings)} />
              <HeaderPill label="Pending payment" value={String(summary.pendingPayment)} />
              <HeaderPill label="Credits ready" value={String(summary.availableCredits)} />
            </div>

            <div className="mt-5">
              <button
                type="button"
                onClick={() =>
                  document.getElementById("redeem-code")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  })
                }
                className="inline-flex rounded-full border border-[#bfdbfe] bg-white px-4 py-2 text-sm font-medium text-[#1d4ed8] transition hover:bg-[#eff6ff]"
              >
                Redeem code
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="1 week"
          value={formatMoney(pricing.oneWeekPrice, pricing.currency)}
        />
        <SummaryCard
          label="2 weeks"
          value={formatMoney(pricing.twoWeekPrice, pricing.currency)}
        />
        <SummaryCard
          label="3 weeks"
          value={formatMoney(pricing.threeWeekPrice, pricing.currency)}
        />
        <SummaryCard label="Currency" value={pricing.currency || "EUR"} />
      </section>

      <section className="rounded-[24px] border border-white/70 bg-white/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur sm:p-6 md:rounded-[28px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              My bookings
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Keep track of bookings already created from your account.
            </p>
          </div>
        </div>

        {bookings.length === 0 ? (
          <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            You do not have any bookings yet.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {bookings.map((booking) => (
              <div
                key={booking.id}
                className="rounded-[24px] border border-slate-100 bg-gradient-to-br from-white via-[#fbfdff] to-[#f1f7ff] p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusTag
                      label={booking.status || "pending"}
                      tone={booking.status === "cancelled" ? "danger" : "blue"}
                    />
                    <StatusTag
                      label={booking.paymentStatus || "pending"}
                      tone={booking.paymentStatus === "paid" ? "success" : "warning"}
                    />
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {booking.durationWeeks} week{booking.durationWeeks === 1 ? "" : "s"}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-950">
                  {booking.durationWeeks} week
                  {booking.durationWeeks === 1 ? "" : "s"}
                </h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-slate-100 bg-white/80 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Price
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {formatMoney(booking.customPrice, booking.currency || pricing.currency)}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-slate-100 bg-white/80 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Start week
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {weekLookup.get(booking.startWeekId) || "Pending assignment"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[24px] border border-white/70 bg-white/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur sm:p-6 md:rounded-[28px]">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">
            Upcoming weeks
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Choose a month first, then open the weeks available within that month.
          </p>
        </div>

        {weekItems.length === 0 ? (
          <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
            No upcoming bootcamp weeks are available yet.
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <div className="rounded-[24px] border border-slate-100 bg-gradient-to-br from-white to-[#f8fbff] p-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                    Browse by month
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Select the month you want to explore first.
                  </p>
                </div>
                <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {visibleWeekItems.length} weeks shown
                </div>
              </div>

            <div className="mt-4 flex flex-wrap gap-3">
              {monthSections.map((month) => {
                const active = month.key === selectedMonthKey;

                return (
                  <button
                    key={month.key}
                    type="button"
                    onClick={() => setSelectedMonthKey(month.key)}
                    className={`min-w-[170px] rounded-[18px] px-4 py-3 text-left text-sm font-medium transition sm:min-w-0 ${
                      active
                        ? "bg-slate-950 text-white shadow-[0_14px_28px_rgba(15,23,42,0.18)]"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-semibold uppercase tracking-[0.14em] ${
                          active ? "bg-white/10 text-white" : "bg-[#eff6ff] text-[#1d4ed8]"
                        }`}
                      >
                        {formatMonthShort(`${month.key}-01`)}
                      </span>
                      <div>
                        <p>{month.label}</p>
                        <p
                          className={`mt-1 text-xs ${
                            active ? "text-white/65" : "text-slate-500"
                          }`}
                        >
                          {month.items.length} available week
                          {month.items.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            </div>

            <div className="grid gap-5">
              {visibleWeekItems.map((item) => (
                <BookingWeekCard
                  key={item.week.id}
                  week={item.week}
                  pricing={pricing}
                  entitlementCounts={entitlementCounts}
                  startableOneWeek={item.startableOneWeek}
                  startableTwoWeeks={item.startableTwoWeeks}
                  startableThreeWeeks={item.startableThreeWeeks}
                  bookingKey={bookingKey}
                  redeemingKey={redeemingKey}
                  onBook={handleBooking}
                  onRedeem={handleRedeem}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[24px] border border-white/70 bg-white/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur sm:p-6 md:rounded-[28px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">
                Available credits
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                If you bought outside the platform, your credit appears here or can be claimed with a code.
              </p>
            </div>
          </div>

          {availableEntitlements.length === 0 ? (
            <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              No redeemable credits yet.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {availableEntitlements.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[22px] border border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] via-white to-[#f8fbff] p-5 shadow-[0_12px_30px_rgba(37,99,235,0.05)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusTag label={item.status} tone="blue" />
                    <StatusTag
                      label={`${item.durationWeeks} week${item.durationWeeks === 1 ? "" : "s"}`}
                      tone="success"
                    />
                  </div>
                  <p className="mt-4 text-lg font-semibold tracking-[0.06em] text-slate-950">
                    {item.code}
                  </p>
                  <div className="mt-4 rounded-[18px] border border-slate-100 bg-white/80 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Value
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {formatMoney(item.amount, item.currency || pricing.currency)}
                    </p>
                  </div>
                  {item.notes ? (
                    <p className="mt-2 text-sm leading-6 text-slate-500">{item.notes}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          id="redeem-code"
          className="rounded-[24px] border border-white/70 bg-white/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur sm:p-6 md:rounded-[28px]"
        >
          <h2 className="text-xl font-semibold text-slate-950">Redeem code</h2>
          <p className="mt-2 text-sm text-slate-600">
            Enter the code you received after an external purchase and it will unlock here instantly.
          </p>

          <div className="mt-6 space-y-4">
            <input
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value)}
              placeholder="WAB-XXXX-XXXX-XXXX"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm uppercase tracking-[0.08em] text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
            />
            <button
              type="button"
              onClick={handleClaimCode}
              disabled={!redeemCode.trim() || claimingCode}
              className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {claimingCode ? "Adding code..." : "Add code"}
            </button>

            <div className="rounded-[22px] border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3 text-sm leading-6 text-slate-700">
              If the same email was used during the external purchase, your credit can also appear automatically without typing the code.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function HeaderPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm">
      <span className="font-semibold text-slate-950">{label}:</span> {value}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] via-white to-[#f8fbff] px-3.5 py-2.5 shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1d4ed8]">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold leading-none tracking-tight text-slate-950">
        {value}
      </p>
    </div>
  );
}

function StatusTag({
  label,
  tone,
}: {
  label: string;
  tone: "blue" | "success" | "warning" | "danger";
}) {
  const styles = {
    blue: "border-[#dbeafe] bg-[#eff6ff] text-[#1d4ed8]",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
  };

  return (
    <span
      className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${styles[tone]}`}
    >
      {label}
    </span>
  );
}

function BookingWeekCard({
  week,
  pricing,
  entitlementCounts,
  startableOneWeek,
  startableTwoWeeks,
  startableThreeWeeks,
  bookingKey,
  redeemingKey,
  onBook,
  onRedeem,
}: {
  week: BootcampWeekRecord;
  pricing: BookingPricing;
  entitlementCounts: Record<BookingDurationWeeks, number>;
  startableOneWeek: boolean;
  startableTwoWeeks: boolean;
  startableThreeWeeks: boolean;
  bookingKey: string;
  redeemingKey: string;
  onBook: (startWeekId: string, durationWeeks: BookingDurationWeeks) => void;
  onRedeem: (startWeekId: string, durationWeeks: BookingDurationWeeks) => void;
}) {
  const status = getWeekAvailabilityStatus(week);
  const remainingSpots = getRemainingSpots(week);

  const options: Array<{
    duration: BookingDurationWeeks;
    available: boolean;
  }> = [
    { duration: 1, available: startableOneWeek },
    { duration: 2, available: startableTwoWeeks },
    { duration: 3, available: startableThreeWeeks },
  ];

  return (
    <div className="overflow-hidden rounded-[22px] border border-slate-100 bg-gradient-to-br from-white via-[#fbfdff] to-[#f2f8ff] shadow-[0_18px_50px_rgba(15,23,42,0.07)] md:rounded-[26px]">
      <div className="border-b border-slate-100/90 px-4 py-4 sm:px-5 sm:py-5 md:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusTag
              label={status}
              tone={
                status === "soldout"
                  ? "danger"
                  : status === "low"
                  ? "warning"
                  : "blue"
              }
            />
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              {remainingSpots} spots left
            </span>
          </div>

          <h3 className="mt-4 text-xl font-semibold tracking-tight text-slate-950">
            {week.label || `${formatDateLabel(week.startDate)} → ${formatDateLabel(week.endDate)}`}
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            {formatDateLabel(week.startDate)} → {formatDateLabel(week.endDate)}
          </p>
          {week.notes ? (
            <p className="mt-3 text-sm leading-6 text-slate-600">{week.notes}</p>
          ) : null}
        </div>
      </div>
      </div>

      <div className="bg-[linear-gradient(180deg,_rgba(248,251,255,0.78),_rgba(255,255,255,0.96))] px-4 py-4 sm:px-5 sm:py-5 md:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
              Available formats
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Choose the stay length that can begin from this week.
            </p>
          </div>
        </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {options.map((option) => {
          const price = getPriceForDuration(pricing, option.duration);
          const nextKey = `${week.id}-${option.duration}`;
          const availableCreditCount = entitlementCounts[option.duration];
          const canBook = option.available && typeof price === "number";
          const canRedeem = option.available && availableCreditCount > 0;
          const disabled = !canBook && !canRedeem;

          return (
            <div
              key={`${week.id}-${option.duration}`}
              className={`rounded-[18px] border p-3.5 sm:rounded-[20px] sm:p-4 ${
                disabled
                  ? "border-slate-200 bg-slate-50"
                  : "border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] via-white to-[#f8fbff] shadow-[0_12px_30px_rgba(37,99,235,0.05)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-950">
                  {option.duration} week{option.duration === 1 ? "" : "s"}
                </p>
                {option.available ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                    Open
                  </span>
                ) : (
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Closed
                  </span>
                )}
              </div>

              <p className="mt-3 text-lg font-semibold tracking-tight text-slate-950">
                {formatMoney(price, pricing.currency)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {option.available
                  ? "Available from this week"
                  : "Not available from this start date"}
              </p>
              {canRedeem ? (
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#1d4ed8]">
                  {availableCreditCount} credit
                  {availableCreditCount === 1 ? "" : "s"} available
                </p>
              ) : null}

              <div className="mt-4 flex flex-col gap-2">
                {canRedeem ? (
                  <button
                    type="button"
                    disabled={redeemingKey === nextKey}
                    onClick={() => onRedeem(week.id, option.duration)}
                    className="w-full rounded-xl bg-[#1d4ed8] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#1e40af] disabled:opacity-50"
                  >
                    {redeemingKey === nextKey
                      ? "Redeeming..."
                      : `Redeem ${option.duration} week${option.duration === 1 ? "" : "s"}`}
                  </button>
                ) : null}

                <button
                  type="button"
                  disabled={disabled || bookingKey === nextKey || !canBook}
                  onClick={() => onBook(week.id, option.duration)}
                  className={`w-full rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                    canBook
                      ? canRedeem
                        ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        : "bg-slate-950 text-white hover:bg-slate-800"
                      : "cursor-not-allowed border border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {bookingKey === nextKey
                    ? "Creating..."
                    : `Buy ${option.duration} week${option.duration === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
