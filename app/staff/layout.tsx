import StaffShell from "@/components/staff/StaffShell";
import StaffRoute from "@/components/auth/StaffRoute";

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StaffRoute>
      <StaffShell>
        <div className="p-6 md:p-8">{children}</div>
      </StaffShell>
    </StaffRoute>
  );
}
