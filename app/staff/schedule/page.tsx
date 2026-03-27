"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { AppRole, getRoleLabel, normalizeRole } from "@/lib/roles";
import { useToast } from "@/components/ui/ToastProvider";

type ScheduleType = "training" | "nutrition" | "activity";

type Profile = {
  id: string;
  fullName: string;
  clientStatus?: "active" | "inactive";
  assignedProgram?: string;
};

type TemplateItem = {
  id: string;
  title: string;
};

type ScheduleItem = {
  id: string;
  profileId: string;
  date: string;
  startTime: string;
  endTime?: string;
  type: ScheduleType;
  templateId?: string;
  title?: string;
  details?: string;
};

export default function StaffSchedulePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<AppRole>("coach");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [profileSearch, setProfileSearch] = useState("");
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [trainingTemplates, setTrainingTemplates] = useState<TemplateItem[]>([]);
  const [nutritionTemplates, setNutritionTemplates] = useState<TemplateItem[]>([]);
  const [form, setForm] = useState({
    date: "",
    startTime: "",
    endTime: "",
    type: "training" as ScheduleType,
    templateId: "",
    title: "",
    details: "",
  });
  const { showToast } = useToast();

  const allowedTypes = useMemo<ScheduleType[]>(() => {
    if (role === "admin") return ["training", "nutrition", "activity"];
    if (role === "nutritionist") return ["nutrition"];
    return ["training"];
  }, [role]);

  const selectedProfile = useMemo(
    () => profiles.find((item) => item.id === selectedProfileId) || null,
    [profiles, selectedProfileId]
  );

  const filteredProfiles = useMemo(() => {
    const queryText = profileSearch.trim().toLowerCase();
    return profiles.filter((profile) => {
      const haystack = `${profile.fullName || ""} ${profile.assignedProgram || ""}`.toLowerCase();
      return !queryText || haystack.includes(queryText);
    });
  }, [profileSearch, profiles]);

  const groupedSchedule = useMemo(() => {
    return scheduleItems.reduce((acc, item) => {
      if (!acc[item.date]) acc[item.date] = [];
      acc[item.date].push(item);
      return acc;
    }, {} as Record<string, ScheduleItem[]>);
  }, [scheduleItems]);

  const summary = useMemo(
    () => ({
      profiles: profiles.length,
      visibleProfiles: filteredProfiles.length,
      items: scheduleItems.length,
    }),
    [filteredProfiles.length, profiles.length, scheduleItems.length]
  );

  useEffect(() => {
    const init = async () => {
      try {
        await auth.authStateReady();
        const currentUser = auth.currentUser;
        if (!currentUser) {
          window.location.replace("/login");
          return;
        }

        const userSnap = await getDoc(doc(db, "users", currentUser.uid));
        const nextRole = normalizeRole(userSnap.exists() ? userSnap.data()?.role : "user");

        if (nextRole !== "admin" && nextRole !== "coach" && nextRole !== "nutritionist") {
          window.location.replace("/dashboard");
          return;
        }

        setRole(nextRole);
        setForm((prev) => ({
          ...prev,
          type: nextRole === "nutritionist" ? "nutrition" : "training",
        }));

        const [profilesSnap, trainingSnap, nutritionSnap] = await Promise.all([
          getDocs(collection(db, "profiles")),
          getDocs(collection(db, "trainingTemplates")),
          getDocs(collection(db, "nutritionTemplates")),
        ]);

        setProfiles(
          profilesSnap.docs
            .map((docItem) => ({
              id: docItem.id,
              ...(docItem.data() as Omit<Profile, "id">),
            }))
            .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "")) as Profile[]
        );

        setTrainingTemplates(
          trainingSnap.docs.map((docItem) => ({
            id: docItem.id,
            ...(docItem.data() as Omit<TemplateItem, "id">),
          })) as TemplateItem[]
        );

        setNutritionTemplates(
          nutritionSnap.docs.map((docItem) => ({
            id: docItem.id,
            ...(docItem.data() as Omit<TemplateItem, "id">),
          })) as TemplateItem[]
        );
      } catch (error) {
        console.error("Load staff schedule error:", error);
        showToast({
          title: "Could not load staff schedule",
          description: "Please refresh the page.",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [showToast]);

  useEffect(() => {
    if (!selectedProfileId) {
      setScheduleItems([]);
      return;
    }

    const loadScheduleItems = async () => {
      try {
        const snapshot = await getDocs(
          query(collection(db, "scheduleItems"), where("profileId", "==", selectedProfileId))
        );

        const items = snapshot.docs
          .map((docItem) => ({
            id: docItem.id,
            ...(docItem.data() as Omit<ScheduleItem, "id">),
          }))
          .filter((item) => allowedTypes.includes(item.type))
          .sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.startTime.localeCompare(b.startTime);
          }) as ScheduleItem[];

        setScheduleItems(items);
      } catch (error) {
        console.error("Load staff schedule items error:", error);
        showToast({
          title: "Could not load client schedule",
          description: "Please try again.",
          type: "error",
        });
      }
    };

    void loadScheduleItems();
  }, [allowedTypes, selectedProfileId, showToast]);

  const activeTemplates = form.type === "nutrition" ? nutritionTemplates : trainingTemplates;

  const resetForm = () => {
    setEditingItemId(null);
    setForm({
      date: "",
      startTime: "",
      endTime: "",
      type: role === "nutritionist" ? "nutrition" : "training",
      templateId: "",
      title: "",
      details: "",
    });
  };

  const saveItem = async () => {
    if (!selectedProfileId || !form.date || !form.startTime) return;
    if (!allowedTypes.includes(form.type)) return;

    setSaving(true);
    try {
      const payload = {
        profileId: selectedProfileId,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime.trim(),
        type: form.type,
        templateId: form.templateId,
        title: form.title.trim(),
        details: form.details.trim(),
      };

      if (editingItemId) {
        await updateDoc(doc(db, "scheduleItems", editingItemId), payload);
      } else {
        await addDoc(collection(db, "scheduleItems"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      resetForm();
      const snapshot = await getDocs(
        query(collection(db, "scheduleItems"), where("profileId", "==", selectedProfileId))
      );
      setScheduleItems(
        snapshot.docs
          .map((docItem) => ({
            id: docItem.id,
            ...(docItem.data() as Omit<ScheduleItem, "id">),
          }))
          .filter((item) => allowedTypes.includes(item.type))
          .sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.startTime.localeCompare(b.startTime);
          }) as ScheduleItem[]
      );
      showToast({
        title: editingItemId ? "Schedule item updated" : "Schedule item created",
        description: "The shared client schedule has been updated.",
        type: "success",
      });
    } catch (error) {
      console.error("Save staff schedule item error:", error);
      showToast({
        title: "Save failed",
        description: "Could not save the schedule item.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: ScheduleItem) => {
    setEditingItemId(item.id);
    setForm({
      date: item.date || "",
      startTime: item.startTime || "",
      endTime: item.endTime || "",
      type: item.type,
      templateId: item.templateId || "",
      title: item.title || "",
      details: item.details || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteItem = async (itemId: string) => {
    const confirmed = window.confirm("Delete this schedule item?");
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, "scheduleItems", itemId));
      setScheduleItems((prev) => prev.filter((item) => item.id !== itemId));
      if (editingItemId === itemId) {
        resetForm();
      }
      showToast({
        title: "Schedule item deleted",
        description: "The client schedule was updated.",
        type: "success",
      });
    } catch (error) {
      console.error("Delete staff schedule item error:", error);
      showToast({
        title: "Delete failed",
        description: "Could not delete the schedule item.",
        type: "error",
      });
    }
  };

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">Loading staff schedule...</p>
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
              {getRoleLabel(role)}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Staff Schedule
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-600 md:text-base">
              This workspace lets staff contribute to the shared client schedule while staying limited to their own area.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <HeaderPill label="Staff role" value={getRoleLabel(role)} />
              <HeaderPill label="Clients" value={String(summary.visibleProfiles)} />
              <HeaderPill label="Visible items" value={String(summary.items)} />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <section className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <h2 className="text-xl font-semibold text-slate-950">
            {editingItemId ? "Edit item" : "Create item"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {role === "nutritionist"
              ? "You can manage nutrition schedule items."
              : role === "admin"
              ? "You can manage training, nutrition, and activity schedule items from this shared workspace."
              : "You can manage training schedule items."}
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Find client</label>
              <input
                value={profileSearch}
                onChange={(e) => setProfileSearch(e.target.value)}
                placeholder="Search by client name or program..."
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Client</label>
              <select
                value={selectedProfileId}
                onChange={(e) => {
                  setSelectedProfileId(e.target.value);
                  resetForm();
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              >
                <option value="">Select client</option>
                {filteredProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.fullName || "Unnamed profile"}
                    {profile.assignedProgram ? ` — ${profile.assignedProgram}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {selectedProfile && (
              <div className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
                <p className="text-sm font-semibold text-slate-900">{selectedProfile.fullName}</p>
                <p className="mt-1 text-sm text-slate-600">
                  Program: {selectedProfile.assignedProgram || "Not assigned"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Status: {selectedProfile.clientStatus || "active"}
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Date">
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </Input>
              <Input label="Type">
                <select
                  value={form.type}
                  onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as ScheduleType }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                >
                  {allowedTypes.map((type) => (
                    <option key={type} value={type}>
                      {getRoleLabel(type === "nutrition" ? "nutritionist" : type === "training" ? "coach" : "admin")}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-500">
                  Only schedule areas available to your role are shown here.
                </p>
              </Input>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Start time">
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </Input>
              <Input label="End time">
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </Input>
            </div>

            <Input label="Template">
              <select
                value={form.templateId}
                onChange={(e) => setForm((prev) => ({ ...prev, templateId: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              >
                <option value="">No template</option>
                {activeTemplates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </Input>

            <Input label="Custom title">
              <input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Optional custom title"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </Input>

            <Input label="Details">
              <textarea
                rows={5}
                value={form.details}
                onChange={(e) => setForm((prev) => ({ ...prev, details: e.target.value }))}
                placeholder="Optional notes"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </Input>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={saveItem}
                disabled={saving}
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? "Saving..." : editingItemId ? "Update item" : "Create item"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Clear
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <h2 className="text-xl font-semibold text-slate-950">Client schedule</h2>
          <p className="mt-2 text-sm text-slate-600">
            {selectedProfile ? `Viewing ${selectedProfile.fullName}` : "Choose a client to manage schedule items."}
          </p>

          {!selectedProfileId ? (
            <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
              Select a client to load schedule items.
            </div>
          ) : scheduleItems.length === 0 ? (
            <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
              No schedule items yet for your area.
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              {Object.entries(groupedSchedule).map(([date, items]) => (
                <div key={date}>
                  <div className="mb-3 border-b border-slate-100 pb-2">
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {date}
                    </p>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-[24px] border border-slate-100 bg-gradient-to-br from-white to-[#f8fbff] p-4 shadow-sm"
                      >
                        <p className="text-base font-semibold text-slate-900">
                          {item.title?.trim() || "Session"}
                        </p>
                        <div className="mt-2">
                          <span className="rounded-full border border-[#dbeafe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1d4ed8]">
                            {item.type}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          {item.startTime}
                          {item.endTime ? ` - ${item.endTime}` : ""}
                        </p>
                        {item.details && (
                          <p className="mt-3 text-sm leading-6 text-slate-700">{item.details}</p>
                        )}
                        <div className="mt-4 flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteItem(item.id)}
                            className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function HeaderPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 shadow-sm">
      {label}: <span className="text-slate-900">{value}</span>
    </div>
  );
}

function Input({
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
