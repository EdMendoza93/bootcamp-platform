import AdminShell from "@/components/admin/AdminShell";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <AdminShell>
        <div className="p-6 md:p-8">{children}</div>
      </AdminShell>
    </div>
  );
}