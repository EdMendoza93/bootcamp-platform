"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Overview", href: "/admin" },
  { label: "Applications", href: "/admin/applications" },
  { label: "Profiles", href: "/admin/profiles" },
  { label: "Schedule", href: "/admin/schedule" },
  { label: "Templates", href: "/admin/templates" },
  { label: "Progress", href: "/admin/progress" },
  { label: "Training", href: "/admin/training" },
  { label: "Nutrition", href: "/admin/nutrition" },
  { label: "Activities", href: "/admin/activities" },
  { label: "Notifications", href: "/admin/notifications" },
];

export default function AdminSideBar() {
  const pathname = usePathname();

  return (
    <aside className="h-full border-b border-white/70 bg-white/80 backdrop-blur md:min-h-screen md:w-[300px] md:border-b-0 md:border-r">
      <div className="flex h-full flex-col p-6">
        <div className="mb-8">
          <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
            Rivcor
          </div>

          <div className="mt-5">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              Wild Atlantic
            </h2>
            <p className="mt-1 text-sm text-slate-500">Bootcamp Admin</p>
          </div>
        </div>

        <div className="mb-6 rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Workspace
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-900">
            Admin control center
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Manage clients, schedule, templates, payments, and progress.
          </p>
        </div>

        <nav className="flex gap-2 overflow-x-auto md:block md:space-y-2 md:overflow-visible">
          {navItems.map((item) => {
            const isOverview = item.href === "/admin";

            const isActive = isOverview
              ? pathname === "/admin"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "group flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-slate-950 text-white shadow-[0_10px_25px_rgba(15,23,42,0.18)]"
                    : "border border-transparent text-slate-700 hover:-translate-y-0.5 hover:border-slate-200 hover:bg-white hover:text-slate-950 hover:shadow-sm",
                ].join(" ")}
              >
                <span>{item.label}</span>

                <span
                  className={[
                    "h-2 w-2 rounded-full transition-all duration-200",
                    isActive
                      ? "bg-[#2EA0FF]"
                      : "bg-slate-200 group-hover:bg-slate-300",
                  ].join(" ")}
                />
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-8">
          <div className="rounded-[22px] border border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
              Platform
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              Premium admin experience
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Built to scale for Wild Atlantic Bootcamp and future Rivcor clients.
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}