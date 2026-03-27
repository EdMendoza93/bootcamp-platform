export type BookingDurationWeeks = 1 | 2 | 3;

export type BookingStatus = "draft" | "pending" | "confirmed" | "cancelled";

export type BookingSource = "admin" | "public";

export type PaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "refunded"
  | "manual";

export type PaymentMethod = "stripe" | "cash" | "bank_transfer" | "manual";

export type WeekAvailabilityStatus = "open" | "low" | "soldout" | "inactive";

export type BootcampWeekRecord = {
  id: string;
  startDate: string;
  endDate: string;
  active: boolean;
  capacity: number;
  booked: number;
  label?: string;
  notes?: string;
};

export type BookingRecord = {
  id: string;
  startWeekId: string;
  weekIds: string[];
  durationWeeks: BookingDurationWeeks;
  status: BookingStatus;
  source: BookingSource;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  consumesCapacity: boolean;
  customerName: string;
  customerEmail: string;
  shortStay?: boolean;
  shortStayNights?: number;
  customPrice?: number | null;
  currency?: string;
  userId?: string;
  profileId?: string;
  notes?: string;
};

export function toMiddayDate(date: string) {
  return new Date(`${date}T12:00:00`);
}

export function getDateValue(date: string) {
  return toMiddayDate(date).getTime();
}

export function addDays(date: string, days: number) {
  const parsed = toMiddayDate(date);
  parsed.setDate(parsed.getDate() + days);

  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

export function getRemainingSpots(week: Pick<BootcampWeekRecord, "capacity" | "booked">) {
  return Math.max(0, (week.capacity || 0) - (week.booked || 0));
}

export function getWeekAvailabilityStatus(
  week: Pick<BootcampWeekRecord, "active" | "capacity" | "booked">
): WeekAvailabilityStatus {
  if (!week.active) return "inactive";
  if ((week.capacity || 0) <= 0) return "soldout";

  const remaining = getRemainingSpots(week);

  if (remaining <= 0) return "soldout";
  if (remaining <= Math.max(1, Math.ceil((week.capacity || 0) * 0.2))) {
    return "low";
  }

  return "open";
}

export function hasWeekOverlap(
  weeks: Array<Pick<BootcampWeekRecord, "id" | "startDate" | "endDate">>,
  nextWeek: Pick<BootcampWeekRecord, "startDate" | "endDate">,
  excludedWeekId?: string | null
) {
  const nextStart = getDateValue(nextWeek.startDate);
  const nextEnd = getDateValue(nextWeek.endDate);

  return weeks.some((week) => {
    if (excludedWeekId && week.id === excludedWeekId) return false;

    const currentStart = getDateValue(week.startDate);
    const currentEnd = getDateValue(week.endDate);

    return nextStart < currentEnd && nextEnd > currentStart;
  });
}

export function canStartDuration(
  weeks: BootcampWeekRecord[],
  startIndex: number,
  duration: BookingDurationWeeks
) {
  for (let i = 0; i < duration; i++) {
    const currentWeek = weeks[startIndex + i];
    const nextExpectedStart =
      i === 0 ? null : addDays(weeks[startIndex + i - 1].startDate, 7);

    if (!currentWeek) return false;
    if (!currentWeek.active) return false;
    if (getRemainingSpots(currentWeek) <= 0) return false;

    if (nextExpectedStart && currentWeek.startDate !== nextExpectedStart) {
      return false;
    }
  }

  return true;
}

export function getConsecutiveBookingWeeks(
  weeks: BootcampWeekRecord[],
  startWeekId: string,
  duration: BookingDurationWeeks
) {
  const orderedWeeks = [...weeks].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const startIndex = orderedWeeks.findIndex((week) => week.id === startWeekId);

  if (startIndex === -1) {
    return [];
  }

  if (!canStartDuration(orderedWeeks, startIndex, duration)) {
    return [];
  }

  return orderedWeeks.slice(startIndex, startIndex + duration);
}

export function bookingConsumesCapacity(
  booking: Pick<BookingRecord, "consumesCapacity" | "status">
) {
  return booking.consumesCapacity && booking.status !== "cancelled";
}

export function getBookedCountForWeek(weekId: string, bookings: BookingRecord[]) {
  return bookings.filter(
    (booking) => bookingConsumesCapacity(booking) && booking.weekIds.includes(weekId)
  ).length;
}

export function hydrateWeeksWithBookings(
  weeks: BootcampWeekRecord[],
  bookings: BookingRecord[]
) {
  return weeks.map((week) => ({
    ...week,
    booked: getBookedCountForWeek(week.id, bookings),
  }));
}
