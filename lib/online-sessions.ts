import { AppRole } from "@/lib/roles";

export type OnlineSessionProviderRole = "coach" | "nutritionist";
export type OnlineSessionDeliveryMethod = "zoom" | "whatsapp";
export type OnlineSessionStatus = "scheduled" | "completed" | "cancelled";

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
