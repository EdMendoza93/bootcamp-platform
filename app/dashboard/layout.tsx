"use client";

import ClientSidebar from "@/components/dashboard/ClientSidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen md:grid-cols-[250px_1fr]">
      <ClientSidebar />

      <main className="bg-gray-50 p-6">
        {children}
      </main>
    </div>
  );
}