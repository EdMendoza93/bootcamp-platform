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
  const { firebaseUser, appUser, loading } = useAuth();

  useEffect(() => {
    if (!loading && !firebaseUser) {
      router.replace("/login");
      return;
    }

    if (!loading && firebaseUser && appUser?.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [firebaseUser, appUser, loading, router]);

  if (loading) {
    return <p className="p-10">Loading...</p>;
  }

  if (!firebaseUser || appUser?.role !== "admin") return null;

  return <>{children}</>;
}