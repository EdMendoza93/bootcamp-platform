import { AppRole } from "@/lib/roles";

export type OnlineSessionProviderRole = "coach" | "nutritionist";
export type OnlineSessionDeliveryMethod = "zoom" | "whatsapp";
export type OnlineSessionStatus = "scheduled" | "completed" | "cancelled";
export type OnlineSessionPaymentStatus =
  | "not_required"
  | "pending"
  | "paid"
  | "waived";

export type OnlineSessionRecord = {
  id: string;
  profileId: string;
  providerRole: OnlineSessionProviderRole;
  scheduledDate: string;
  startTime: string;
  durationMinutes: number;
  deliveryMethod: OnlineSessionDeliveryMethod;
  meetingLink?: string;
  title?: string;
  notes?: string;
  status: OnlineSessionStatus;
  paymentRequired?: boolean;
  paymentStatus?: OnlineSessionPaymentStatus;
  price?: number | null;
  currency?: string;
  createdByUid?: string;
};

export function getAllowedProviderRoles(role: AppRole): OnlineSessionProviderRole[] {
  if (role === "admin") return ["coach", "nutritionist"];
  if (role === "nutritionist") return ["nutritionist"];
  return ["coach"];
}

export function getProviderRoleLabel(role: OnlineSessionProviderRole) {
  return role === "coach" ? "Coach" : "Nutritionist";
}

export function getDeliveryMethodLabel(method: OnlineSessionDeliveryMethod) {
  return method === "zoom" ? "Zoom" : "WhatsApp";
}

export function getSessionStatusTone(status: OnlineSessionStatus) {
  if (status === "completed") return "success";
  if (status === "cancelled") return "danger";
  return "info";
}

export function normalizeSessionPayment(
  session: Partial<OnlineSessionRecord>
): {
  paymentRequired: boolean;
  paymentStatus: OnlineSessionPaymentStatus;
  price: number | null;
  currency: string;
} {
  const paymentRequired = Boolean(session.paymentRequired);
  const paymentStatus = paymentRequired
    ? session.paymentStatus === "paid" || session.paymentStatus === "waived"
      ? session.paymentStatus
      : "pending"
    : "not_required";

  return {
    paymentRequired,
    paymentStatus,
    price:
      typeof session.price === "number" && Number.isFinite(session.price)
        ? session.price
        : null,
    currency: String(session.currency || "EUR").trim().toUpperCase() || "EUR",
  };
}

export function getSessionPaymentStatusLabel(status: OnlineSessionPaymentStatus) {
  if (status === "paid") return "Paid";
  if (status === "pending") return "Pending";
  if (status === "waived") return "Waived";
  return "No payment";
}

export function getSessionPaymentStatusClasses(
  status: OnlineSessionPaymentStatus
) {
  if (status === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "waived") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

export function sortSessions(items: OnlineSessionRecord[]) {
  return [...items].sort((a, b) => {
    const first = `${a.scheduledDate}T${a.startTime || "00:00"}`;
    const second = `${b.scheduledDate}T${b.startTime || "00:00"}`;
    return first.localeCompare(second);
  });
}

export function isUpcomingSession(item: OnlineSessionRecord) {
  const value = new Date(`${item.scheduledDate}T${item.startTime || "00:00"}`).getTime();
  return value >= Date.now() && item.status === "scheduled";
}
