"use client";

import { signOut } from "firebase/auth";
import ClientSidebar from "@/components/dashboard/ClientSidebar";
import { auth } from "@/lib/firebase";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const handleLogout = async () => {
    await signOut(auth);
    window.location.replace("/login");
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(46,160,255,0.16),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.08),_transparent_28%),linear-gradient(135deg,_#f8fbff_0%,_#eef6ff_52%,_#f9fcff_100%)]">
      <div className="grid min-h-screen md:grid-cols-[280px_1fr]">
        <div className="hidden md:block">
          <div className="sticky top-0 h-screen">
            <ClientSidebar />
          </div>
        </div>

        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-20 border-b border-white/70 bg-white/65 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl">
            <div className="mx-auto flex min-h-[84px] w-full max-w-7xl items-center justify-between gap-4 px-6 py-4 md:px-8">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#1d4ed8]">
                  Wild Atlantic Bootcamp
                </p>
                <h1 className="mt-1 text-base font-semibold tracking-tight text-slate-950">
                  Client Dashboard
                </h1>
                <p className="mt-1 text-xs text-slate-500">
                  Your plan, profile, and progress in one calm workspace.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden rounded-full border border-[#bfdbfe] bg-gradient-to-r from-white to-[#eff6ff] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1d4ed8] shadow-sm md:block">
                  Personal Portal
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-2xl bg-[linear-gradient(135deg,#0f172a,#123b76)] px-4 py-2.5 text-sm font-medium text-white shadow-[0_10px_25px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_35px_rgba(15,23,42,0.22)]"
                >
                  Logout
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-4 md:px-8 md:py-8">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
