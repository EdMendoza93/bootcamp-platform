export type AppRole = "admin" | "user" | "coach" | "nutritionist";

export function normalizeRole(value?: string | null): AppRole {
  if (value === "admin") return "admin";
  if (value === "coach") return "coach";
  if (value === "nutritionist") return "nutritionist";
  return "user";
}

export function getHomeRouteForRole(role?: string | null) {
  const normalized = normalizeRole(role);

  if (normalized === "admin") return "/admin";
  if (normalized === "coach" || normalized === "nutritionist") return "/staff";
  return "/dashboard";
}

export function canAccessAdmin(role?: string | null) {
  return normalizeRole(role) === "admin";
}

export function canAccessStaff(role?: string | null) {
  const normalized = normalizeRole(role);
  return normalized === "admin" || normalized === "coach" || normalized === "nutritionist";
}

export function getRoleLabel(role?: string | null) {
  const normalized = normalizeRole(role);

  if (normalized === "admin") return "Admin";
  if (normalized === "coach") return "Coach";
  if (normalized === "nutritionist") return "Nutritionist";
  return "Client";
}
