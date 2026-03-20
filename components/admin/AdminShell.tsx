"use client";

import AdminSideBar from "@/components/admin/AdminSideBar";

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen bg-gray-50">
      <div className="grid h-full md:grid-cols-[280px_1fr]">
        {/* Sidebar */}
        <div className="hidden md:block border-r bg-white">
          <AdminSideBar />
        </div>

        {/* Main content */}
        <div className="flex h-full flex-col">
          {/* Optional future header */}
          <header className="flex h-[64px] items-center justify-between border-b bg-white px-6">
            <div className="text-sm font-medium text-gray-500">
              Admin Panel
            </div>
          </header>

          {/* Scroll area */}
          <main className="flex-1 overflow-y-auto p-6 md:p-10">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}