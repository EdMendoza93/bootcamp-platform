"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUnreadMessageCount } from "@/components/messages/useUnreadMessageCount";

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Messages", href: "/dashboard/messages" },
  { label: "Progress", href: "/dashboard/progress" },
  { label: "Profile", href: "/dashboard/profile" },
  { label: "Sessions", href: "/dashboard/sessions" },
  { label: "Book", href: "/dashboard/book" },
  { label: "Application", href: "/dashboard/application" },
];

export default function ClientSidebar({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const unreadCount = useUnreadMessageCount();

  return (
    <aside className="h-full border-r border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(245,250,255,0.86))] backdrop-blur-xl">
      <div className="flex h-full flex-col p-6">
        <div className="mb-8">
          <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-gradient-to-r from-white to-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8] shadow-sm">
            Client Area
          </div>

          <div className="mt-5">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              Wild Atlantic
            </h2>
            <p className="mt-1 text-sm text-slate-500">Bootcamp Portal</p>
            <p className="mt-3 max-w-[220px] text-sm leading-6 text-slate-600">
              A focused space to follow your journey and keep everything in one place.
            </p>
          </div>
        </div>

        <div className="mb-3 px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Navigation
          </p>
        </div>

        <nav className="flex flex-col gap-2">
          {navItems.map((item) => {
            const isDashboard = item.href === "/dashboard";

            const isActive = isDashboard
              ? pathname === "/dashboard"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={[
                  "group flex items-center justify-between rounded-[20px] px-4 py-3 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "border border-[#dbeafe] bg-[linear-gradient(135deg,#eff6ff,#ffffff)] text-slate-950 shadow-[0_12px_30px_rgba(46,160,255,0.12)]"
                    : "border border-transparent text-slate-700 hover:-translate-y-0.5 hover:border-white hover:bg-white/90 hover:text-slate-950 hover:shadow-[0_10px_22px_rgba(15,23,42,0.08)]",
                ].join(" ")}
              >
                <span className="tracking-[0.01em]">{item.label}</span>
                <div className="flex items-center gap-2">
                  {item.href === "/dashboard/messages" && unreadCount > 0 ? (
                    <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-semibold text-white">
                      {unreadCount}
                    </span>
                  ) : null}
                  <span
                    className={[
                      "h-2.5 w-2.5 rounded-full transition-all duration-200",
                      isActive
                        ? "bg-[#2EA0FF] shadow-[0_0_0_4px_rgba(46,160,255,0.16)]"
                        : "bg-slate-200 group-hover:bg-slate-300",
                    ].join(" ")}
                  />
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-8">
          <div className="overflow-hidden rounded-[24px] border border-emerald-100 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_30%),linear-gradient(135deg,#ffffff,#ecfdf5)] p-4 shadow-[0_16px_35px_rgba(16,185,129,0.08)]">
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
