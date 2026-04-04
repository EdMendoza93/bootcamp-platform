export function normalizeInviteEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

export function getStaffInviteId(email?: string | null) {
  return normalizeInviteEmail(email);
}
