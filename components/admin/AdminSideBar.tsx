"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUnreadMessageCount } from "@/components/messages/useUnreadMessageCount";

const navItems = [
  { label: "Overview", href: "/admin" },
  { label: "Applications", href: "/admin/applications" },
  { label: "Availability", href: "/admin/availability" },
  { label: "Bookings", href: "/admin/bookings" },
  { label: "Messages", href: "/admin/messages" },
  { label: "Schedule", href: "/admin/schedule" },
  { label: "Training", href: "/admin/training" },
  { label: "Nutrition", href: "/admin/nutrition" },
  { label: "Activities", href: "/admin/activities" },
  { label: "Profiles", href: "/admin/profiles" },
  { label: "Progress", href: "/admin/progress" },
  { label: "Staff", href: "/admin/staff" },
  { label: "Payments", href: "/admin/payments" },
  { label: "Notifications", href: "/admin/notifications" },
  { label: "Online Sessions", href: "/admin/online-sessions" },
];

export default function AdminSideBar({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const unreadCount = useUnreadMessageCount();

  return (
    <aside className="h-full border-b border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,251,255,0.86))] backdrop-blur-xl md:min-h-screen md:w-[300px] md:border-b-0 md:border-r">
      <div className="flex h-full min-h-0 flex-col p-6">
        <div className="mb-8">
          <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-gradient-to-r from-white to-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8] shadow-sm">
            Rivcor
          </div>

          <div className="mt-5">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              Wild Atlantic
            </h2>
            <p className="mt-1 text-sm text-slate-500">Bootcamp Admin</p>
            <p className="mt-3 max-w-[220px] text-sm leading-6 text-slate-600">
              A polished control room for clients, scheduling, content, and operations.
            </p>
          </div>
        </div>

        <div className="mb-6 overflow-hidden rounded-[24px] border border-white/80 bg-[linear-gradient(135deg,#0f172a_0%,#123b76_52%,#2EA0FF_100%)] p-[1px] shadow-[0_22px_50px_rgba(15,23,42,0.14)]">
          <div className="rounded-[23px] bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(18,59,118,0.94))] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#93c5fd]">
              Workspace
            </p>
            <p className="mt-2 text-sm font-semibold text-white">
              Admin control center
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-200">
              Manage clients, scheduling, content, payments, and progress.
            </p>
          </div>
        </div>

        <div className="mb-3 px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Navigation
          </p>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {navItems.map((item) => {
            const isOverview = item.href === "/admin";

            const isActive = isOverview
              ? pathname === "/admin"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={[
                  "group flex items-center justify-between rounded-[20px] px-4 py-3 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "border border-[#dbeafe] bg-[linear-gradient(135deg,#eff6ff,#ffffff)] text-slate-950 shadow-[0_12px_30px_rgba(14,165,233,0.12)]"
                    : "border border-transparent text-slate-700 hover:-translate-y-0.5 hover:border-white hover:bg-white/90 hover:text-slate-950 hover:shadow-[0_10px_22px_rgba(15,23,42,0.08)]",
                ].join(" ")}
              >
                <span className="tracking-[0.01em]">{item.label}</span>
                <div className="flex items-center gap-2">
                  {item.href === "/admin/messages" && unreadCount > 0 ? (
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
      </div>
    </aside>
  );
}
