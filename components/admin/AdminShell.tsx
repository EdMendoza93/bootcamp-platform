"use client";

import AdminSideBar from "@/components/admin/AdminSideBar";

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(46,160,255,0.14),_transparent_28%),linear-gradient(to_bottom_right,_#f8fbff,_#eef5ff)]">
      <div className="grid min-h-screen md:grid-cols-[300px_1fr]">
        <aside className="hidden border-r border-white/70 bg-white/80 backdrop-blur md:block">
          <div className="sticky top-0 h-screen">
            <AdminSideBar />
          </div>
        </aside>

        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-20 border-b border-white/70 bg-white/75 backdrop-blur">
            <div className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between px-6 md:px-8">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#1d4ed8]">
                  Wild Atlantic Bootcamp
                </p>
                <h1 className="mt-1 text-sm font-semibold text-slate-900">
                  Admin Panel
                </h1>
              </div>

              <div className="hidden items-center gap-2 md:flex">
                <div className="rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                  Rivcor Platform
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-4 md:px-8 md:py-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}