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
];

export default function AdminSideBar() {
  const pathname = usePathname();

  return (
    <aside className="border-b bg-white md:min-h-screen md:w-[280px] md:border-b-0 md:border-r">
      <div className="p-6">
        <div className="mb-10">
          <h2 className="text-xl font-bold tracking-tight">Wild Atlantic</h2>
          <p className="text-sm text-gray-500">Bootcamp Admin</p>
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
                  "block rounded-xl px-4 py-3 text-sm font-medium transition",
                  isActive
                    ? "bg-black text-white"
                    : "text-gray-700 hover:bg-gray-100",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}