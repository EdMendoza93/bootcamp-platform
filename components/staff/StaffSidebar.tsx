"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUnreadMessageCount } from "@/components/messages/useUnreadMessageCount";

const navItems = [
  { label: "Overview", href: "/staff" },
  { label: "Clients", href: "/staff/clients" },
  { label: "Schedule", href: "/staff/schedule" },
  { label: "Sessions", href: "/staff/sessions" },
  { label: "Messages", href: "/staff/messages" },
  { label: "Templates", href: "/staff/templates" },
];

export default function StaffSidebar({
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
              Staff
            </h2>
            <p className="mt-1 text-sm text-slate-500">Coach & Nutrition</p>
            <p className="mt-3 max-w-[220px] text-sm leading-6 text-slate-600">
              A shared workspace for building client schedules by discipline.
            </p>
          </div>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {navItems.map((item) => {
            const isOverview = item.href === "/staff";
            const isActive = isOverview
              ? pathname === "/staff"
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
                <span>{item.label}</span>
                <div className="flex items-center gap-2">
                  {item.href === "/staff/messages" && unreadCount > 0 ? (
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
