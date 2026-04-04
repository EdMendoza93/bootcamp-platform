"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/components/ui/ToastProvider";
import { AppRole, getRoleLabel } from "@/lib/roles";
import { getStaffInviteId, normalizeInviteEmail } from "@/lib/staff-invites";

type StaffInvite = {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  status?: "invited" | "accepted";
  acceptedByUid?: string;
};

type StaffUser = {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  status?: "active" | "inactive";
};

export default function AdminStaffPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    role: "coach" as AppRole,
  });

  const { showToast } = useToast();

  const loadData = useCallback(async () => {
    try {
      const [usersSnap, invitesSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(query(collection(db, "staffInvites"), orderBy("email", "asc"))),
      ]);

      const staffRows = usersSnap.docs
        .map((docItem) => ({
          id: docItem.id,
          ...(docItem.data() as Omit<StaffUser, "id">),
        }))
        .filter((item) => item.role === "admin" || item.role === "coach" || item.role === "nutritionist");

      const inviteRows = invitesSnap.docs.map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<StaffInvite, "id">),
      })) as StaffInvite[];

      setStaffUsers(staffRows);
      setInvites(inviteRows);
    } catch (error) {
      console.error("Load staff page error:", error);
      showToast({
        title: "Could not load staff",
        description: "Please refresh the page.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredStaff = useMemo(() => {
    const queryText = search.trim().toLowerCase();

    return staffUsers.filter((item) => {
      const haystack = `${item.name || ""} ${item.email || ""} ${item.role || ""}`.toLowerCase();
      return !queryText || haystack.includes(queryText);
    });
  }, [search, staffUsers]);

  const summary = useMemo(
    () => ({
      total: staffUsers.length,
      active: staffUsers.filter((item) => item.status !== "inactive").length,
      inactive: staffUsers.filter((item) => item.status === "inactive").length,
      admins: staffUsers.filter((item) => item.role === "admin").length,
      coaches: staffUsers.filter((item) => item.role === "coach").length,
      nutritionists: staffUsers.filter((item) => item.role === "nutritionist").length,
      pendingInvites: invites.filter((item) => item.status !== "accepted").length,
    }),
    [invites, staffUsers]
  );

  const toggleStaffStatus = async (staffUser: StaffUser) => {
    const nextStatus = staffUser.status === "inactive" ? "active" : "inactive";

    try {
      await updateDoc(doc(db, "users", staffUser.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });

      await loadData();

      showToast({
        title: nextStatus === "active" ? "Staff activated" : "Staff deactivated",
        description:
          nextStatus === "active"
            ? "They can access the platform again."
            : "They can no longer access the platform.",
        type: "success",
      });
    } catch (error) {
      console.error("Toggle staff status error:", error);
      showToast({
        title: "Update failed",
        description: "Could not update staff access.",
        type: "error",
      });
    }
  };

  const revokeInvite = async (inviteId: string) => {
    const confirmed = window.confirm("Revoke this invite?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "staffInvites", inviteId));
      await loadData();
      showToast({
        title: "Invite revoked",
        description: "The staff invite was removed.",
        type: "success",
      });
    } catch (error) {
      console.error("Revoke invite error:", error);
      showToast({
        title: "Could not revoke invite",
        description: "Please try again.",
        type: "error",
      });
    }
  };

  const createInvite = async () => {
    const fullName = form.fullName.trim();
    const email = normalizeInviteEmail(form.email);

    if (!fullName || !email) {
      showToast({
        title: "Missing information",
        description: "Please enter full name and email.",
        type: "error",
      });
      return;
    }

    setSaving(true);

    try {
      await setDoc(doc(db, "staffInvites", getStaffInviteId(email)), {
        fullName,
        email,
        role: form.role,
        status: "invited",
        createdAt: serverTimestamp(),
      });

      setForm({
        fullName: "",
        email: "",
        role: "coach",
      });

      await loadData();

      showToast({
        title: "Staff invite created",
        description: "They can now create an account with this email and automatically receive the assigned role.",
        type: "success",
      });
    } catch (error) {
      console.error("Create staff invite error:", error);
      showToast({
        title: "Could not create invite",
        description: "Please try again.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">Loading staff...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
        <div className="bg-gradient-to-r from-[#071120] via-[#123b76] to-[#2EA0FF] p-[1px]">
          <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
        </div>

        <div className="relative overflow-hidden p-6 md:p-8">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#2EA0FF]/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-emerald-300/10 blur-3xl" />

          <div className="relative">
            <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
              Staff
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Staff Access
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-600 md:text-base">
              Invite bootcamp owners, coaches, and nutritionists directly from the app instead of managing roles manually in Firebase Console.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Staff" value={String(summary.total)} tone="light" />
        <SummaryCard label="Active" value={String(summary.active)} tone="success" />
        <SummaryCard label="Inactive" value={String(summary.inactive)} tone="warning" />
        <SummaryCard label="Admins" value={String(summary.admins)} tone="dark" />
        <SummaryCard label="Pending Invites" value={String(summary.pendingInvites)} tone="blue" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <h2 className="text-xl font-semibold text-slate-950">Invite staff</h2>
          <p className="mt-2 text-sm text-slate-600">
            Create a role-based invite. When they create an account with the same email, the app will automatically assign their role.
          </p>

          <div className="mt-6 space-y-4">
            <Field label="Full name">
              <input
                value={form.fullName}
                onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
                placeholder="Jane Doe"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </Field>

            <Field label="Email">
              <input
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="jane@example.com"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </Field>

            <Field label="Role">
              <select
                value={form.role}
                onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as AppRole }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              >
                <option value="admin">Admin</option>
                <option value="coach">Coach</option>
                <option value="nutritionist">Nutritionist</option>
              </select>
            </Field>

            <div className="rounded-[22px] border border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white p-4 text-sm leading-6 text-slate-700">
              This first version avoids Console work. The invite is stored in-app, and the role is applied automatically when the invited person signs up with the invited email.
            </div>

            <button
              type="button"
              onClick={createInvite}
              disabled={saving}
              className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Creating invite..." : "Create invite"}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-slate-950">Current staff</h2>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search staff..."
                className="w-full max-w-[240px] rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </div>

            <div className="mt-5 space-y-3">
              {filteredStaff.length === 0 ? (
                <p className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
                  No staff found.
                </p>
              ) : (
                filteredStaff.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4"
                  >
                    <p className="text-sm font-semibold text-slate-950">
                      {item.name || item.email || item.id}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{item.email || item.id}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                        {getRoleLabel(item.role)}
                      </div>
                      <div
                        className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                          item.status === "inactive"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {item.status === "inactive" ? "inactive" : "active"}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void toggleStaffStatus(item)}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        {item.status === "inactive" ? "Activate" : "Deactivate"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
            <h2 className="text-xl font-semibold text-slate-950">Invites</h2>
            <div className="mt-5 space-y-3">
              {invites.length === 0 ? (
                <p className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
                  No invites yet.
                </p>
              ) : (
                invites.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-950">
                        {item.fullName || item.email}
                      </p>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        item.status === "accepted"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        {item.status || "invited"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{item.email}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                      {getRoleLabel(item.role)}
                    </p>
                    {item.status !== "accepted" ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void revokeInvite(item.id)}
                          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
                        >
                          Revoke invite
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "light" | "dark" | "blue" | "success" | "warning";
}) {
  const styles = {
    light: "border-slate-200 bg-white text-slate-950",
    dark: "border-slate-800 bg-gradient-to-br from-slate-950 to-slate-800 text-white",
    blue: "border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white text-slate-950",
    success: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-slate-950",
    warning: "border-amber-200 bg-gradient-to-br from-amber-50 to-white text-slate-950",
  };

  return (
    <div className={`rounded-[16px] border px-3.5 py-2.5 shadow-[0_8px_18px_rgba(15,23,42,0.05)] ${styles[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold leading-none tracking-tight">{value}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-700">{label}</label>
      {children}
    </div>
  );
}
