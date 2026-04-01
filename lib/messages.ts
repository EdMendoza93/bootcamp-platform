import { AppRole } from "@/lib/roles";

export type MessageCategory = "general" | "coach" | "nutrition" | "sessions";
export type MessageThreadStatus = "open" | "closed";

export type MessageThreadRecord = {
  id: string;
  clientProfileId: string;
  clientUserId?: string;
  clientName?: string;
  category: MessageCategory;
  subject: string;
  status: MessageThreadStatus;
  participantRoles?: AppRole[];
  participantUserIds?: string[];
  createdByUid?: string;
  createdByRole?: AppRole;
  createdAt?: { seconds?: number; nanoseconds?: number };
  lastMessageAt?: { seconds?: number; nanoseconds?: number };
  lastMessagePreview?: string;
  lastSenderRole?: AppRole;
  readByUserIds?: string[];
};

export type ThreadMessageRecord = {
  id: string;
  body: string;
  senderUid: string;
  senderRole: AppRole;
  senderName?: string;
  createdAt?: { seconds?: number; nanoseconds?: number };
};

export function getMessageCategoryLabel(category: MessageCategory) {
  if (category === "coach") return "Coach";
  if (category === "nutrition") return "Nutrition";
  if (category === "sessions") return "Private Sessions";
  return "General";
}

export function getMessageCategoryClasses(category: MessageCategory) {
  if (category === "coach") return "border-sky-200 bg-sky-50 text-sky-700";
  if (category === "nutrition") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (category === "sessions") return "border-violet-200 bg-violet-50 text-violet-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

export function getThreadStatusClasses(status: MessageThreadStatus) {
  if (status === "closed") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export function getAllowedThreadCategories(role: AppRole): MessageCategory[] {
  if (role === "admin") return ["general", "coach", "nutrition", "sessions"];
  if (role === "coach") return ["general", "coach", "sessions"];
  if (role === "nutritionist") return ["general", "nutrition", "sessions"];
  return ["general", "coach", "nutrition", "sessions"];
}

export function canRoleAccessThread(
  thread: MessageThreadRecord,
  role: AppRole,
  uid?: string | null
) {
  if (role === "admin") return true;
  if (role === "user") {
    return Boolean(uid) && thread.clientUserId === uid;
  }

  const allowed = getAllowedThreadCategories(role);
  return allowed.includes(thread.category);
}

export function canManageThreadStatus(role: AppRole) {
  return role === "admin" || role === "coach" || role === "nutritionist";
}

export function formatThreadTimestamp(
  timestamp?: { seconds?: number; nanoseconds?: number }
) {
  if (!timestamp?.seconds) return "No activity yet";
  return new Date(timestamp.seconds * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function sortThreads(threads: MessageThreadRecord[]) {
  return [...threads].sort((a, b) => {
    const left = b.lastMessageAt?.seconds || b.createdAt?.seconds || 0;
    const right = a.lastMessageAt?.seconds || a.createdAt?.seconds || 0;
    return left - right;
  });
}

export function sortThreadMessages(messages: ThreadMessageRecord[]) {
  return [...messages].sort((a, b) => {
    const left = a.createdAt?.seconds || 0;
    const right = b.createdAt?.seconds || 0;
    return left - right;
  });
}
