"use client";

import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import StaffSidebar from "@/components/staff/StaffSidebar";
import { auth, db } from "@/lib/firebase";
import { getHomeRouteForRole, getRoleLabel, normalizeRole } from "@/lib/roles";

export default function StaffShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [roleLabel, setRoleLabel] = useState("Staff");

  useEffect(() => {
    const loadRole = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const role = normalizeRole(snap.exists() ? snap.data()?.role : "user");
        setRoleLabel(getRoleLabel(role));

        if (role !== "coach" && role !== "nutritionist" && role !== "admin") {
          window.location.replace(getHomeRouteForRole(role));
        }
      } catch (error) {
        console.error("Load staff shell role error:", error);
      }
    };

    void loadRole();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    window.location.replace("/login");
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(46,160,255,0.18),_transparent_24%),radial-gradient(circle_at_left_bottom,_rgba(14,165,233,0.10),_transparent_28%),linear-gradient(135deg,_#f8fbff_0%,_#eef5ff_44%,_#f7fbff_100%)]">
      <div className="grid min-h-screen md:grid-cols-[300px_1fr]">
        <aside className="hidden border-r border-white/60 bg-white/70 backdrop-blur-xl md:block">
          <div className="sticky top-0 h-screen">
            <StaffSidebar />
          </div>
        </aside>

        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-20 border-b border-white/70 bg-white/65 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl">
            <div className="mx-auto flex min-h-[84px] w-full max-w-7xl items-center justify-between gap-4 px-6 py-4 md:px-8">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#1d4ed8]">
                  Wild Atlantic Bootcamp
                </p>
                <h1 className="mt-1 text-base font-semibold tracking-tight text-slate-950">
                  {roleLabel} Workspace
                </h1>
                <p className="mt-1 text-xs text-slate-500">
                  Shared scheduling space for staff contributions.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-white md:hidden"
                >
                  Menu
                </button>

                <div className="hidden rounded-full border border-[#bfdbfe] bg-gradient-to-r from-white to-[#eff6ff] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1d4ed8] shadow-sm md:block">
                  Staff portal
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-2xl bg-[linear-gradient(135deg,#0f172a,#1e3a5f)] px-4 py-2.5 text-sm font-medium text-white shadow-[0_10px_25px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_35px_rgba(15,23,42,0.22)]"
                >
                  Logout
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-5 md:px-8 md:py-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu overlay"
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />

          <div className="absolute inset-y-0 left-0 w-[86vw] max-w-[320px] overflow-y-auto shadow-[0_24px_60px_rgba(15,23,42,0.28)]">
            <StaffSidebar onNavigate={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
