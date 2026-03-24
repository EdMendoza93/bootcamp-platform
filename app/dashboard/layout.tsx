"use client";

import ClientSidebar from "@/components/dashboard/ClientSidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(46,160,255,0.10),_transparent_28%),linear-gradient(to_bottom_right,_#f8fbff,_#eef5ff)]">
      <div className="grid min-h-screen md:grid-cols-[280px_1fr]">
        <div className="hidden md:block">
          <div className="sticky top-0 h-screen">
            <ClientSidebar />
          </div>
        </div>

        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-20 border-b border-white/70 bg-white/75 backdrop-blur">
            <div className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between px-6 md:px-8">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#1d4ed8]">
                  Wild Atlantic Bootcamp
                </p>
                <h1 className="mt-1 text-sm font-semibold text-slate-900">
                  Client Dashboard
                </h1>
              </div>

              <div className="rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                Personal Portal
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