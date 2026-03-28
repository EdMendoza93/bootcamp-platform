"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { canAccessStaff, getHomeRouteForRole } from "@/lib/roles";

export default function StaffRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { firebaseUser, appUser, authLoading, profileLoading } = useAuth();

  const loading = authLoading || profileLoading;

  useEffect(() => {
    if (loading) return;

    if (!firebaseUser) {
      router.replace("/login");
      return;
    }

    if (appUser && appUser.status === "inactive") {
      router.replace("/login");
      return;
    }

    if (appUser && !canAccessStaff(appUser.role)) {
      router.replace(getHomeRouteForRole(appUser.role));
    }
  }, [appUser, firebaseUser, loading, router]);

  if (loading) {
    return <p className="p-10">Loading...</p>;
  }

  if (!firebaseUser) return null;
  if (appUser && appUser.status === "inactive") return null;
  if (!appUser || !canAccessStaff(appUser.role)) return null;

  return <>{children}</>;
}
