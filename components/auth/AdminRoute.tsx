"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";

export default function AdminRoute({
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

    if (appUser && appUser.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [firebaseUser, appUser, loading, router]);

  if (loading) {
    return <p className="p-10">Loading...</p>;
  }

  if (!firebaseUser) {
    return null;
  }

  if (!appUser || appUser.role !== "admin") {
    return null;
  }

  return <>{children}</>;
}