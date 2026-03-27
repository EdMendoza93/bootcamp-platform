import AdminShell from "@/components/admin/AdminShell";
import AdminRoute from "@/components/auth/AdminRoute";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminRoute>
      <AdminShell>
        <div className="p-6 md:p-8">{children}</div>
      </AdminShell>
    </AdminRoute>
  );
}
