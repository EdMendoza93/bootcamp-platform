"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Application", href: "/dashboard/application" },
  { label: "Profile", href: "/dashboard/profile" },
  { label: "Progress", href: "/dashboard/progress" },
];

export default function ClientSidebar() {
  const pathname = usePathname();

  return (
    <aside className="h-full border-r border-white/70 bg-white/80 backdrop-blur">
      <div className="flex h-full flex-col p-6">
        <div className="mb-8">
          <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
            Client Area
          </div>

          <div className="mt-5">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              Wild Atlantic
            </h2>
            <p className="mt-1 text-sm text-slate-500">Bootcamp Portal</p>
          </div>
        </div>

        <nav className="space-y-2">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

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
              Your journey
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              Stay on track
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              View your plan, update your profile, and follow your progress.
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}