"use client";

import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/components/providers/AuthProvider";

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { appUser } = useAuth();

  const logout = async () => {
    await signOut(auth);
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="grid min-h-screen md:grid-cols-[260px_1fr]">
        <aside className="border-r bg-white p-6">
          <div className="mb-10">
            <h2 className="text-xl font-bold">Wild Atlantic</h2>
            <p className="text-sm text-gray-500">Bootcamp Platform</p>
          </div>

          <nav className="space-y-2">
            <Link
              href="/dashboard"
              className="block rounded-lg px-4 py-3 text-sm hover:bg-gray-100"
            >
              Overview
            </Link>

            <Link
              href="/dashboard/application"
              className="block rounded-lg px-4 py-3 text-sm hover:bg-gray-100"
            >
              Application
            </Link>

            <Link
              href="/dashboard/bookings"
              className="block rounded-lg px-4 py-3 text-sm hover:bg-gray-100"
            >
              Bookings
            </Link>

            {appUser?.role === "admin" && (
              <Link
                href="/admin"
                className="block rounded-lg px-4 py-3 text-sm hover:bg-gray-100"
              >
                Admin
              </Link>
            )}
          </nav>

          <button
            onClick={logout}
            className="mt-10 w-full rounded-lg bg-black px-4 py-3 text-sm text-white"
          >
            Logout
          </button>
        </aside>

        <main className="p-6 md:p-10">{children}</main>
      </div>
    </div>
  );
}