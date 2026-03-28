"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { getHomeRouteForRole, normalizeRole } from "@/lib/roles";

export default function ProtectedRoute({
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

    if (appUser && normalizeRole(appUser.role) !== "user") {
      router.replace(getHomeRouteForRole(appUser.role));
    }
  }, [appUser, firebaseUser, loading, router]);

  if (loading) {
    return <p className="p-10">Loading...</p>;
  }

  if (appUser && appUser.status === "inactive") {
    return null;
  }

  if (firebaseUser && appUser && normalizeRole(appUser.role) !== "user") {
    return null;
  }

  if (!firebaseUser) return null;

  return <>{children}</>;
}
