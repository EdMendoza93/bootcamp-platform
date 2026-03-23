"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
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
  description?: string;
  content?: string;
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
  createdAt?: unknown;
};

export default function AdminSchedulePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileSearch, setProfileSearch] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");

  const [trainingTemplates, setTrainingTemplates] = useState<TemplateItem[]>([]);
  const [nutritionTemplates, setNutritionTemplates] = useState<TemplateItem[]>([]);
  const [activityTemplates, setActivityTemplates] = useState<TemplateItem[]>([]);

  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

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

  const loadProfiles = async () => {
    const snapshot = await getDocs(collection(db, "profiles"));

    const data = snapshot.docs
      .map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<Profile, "id">),
      }))
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "")) as Profile[];

    setProfiles(data);
  };

  const loadTemplates = async () => {
    const [trainingSnap, nutritionSnap, activitySnap] = await Promise.all([
      getDocs(collection(db, "trainingTemplates")),
      getDocs(collection(db, "nutritionTemplates")),
      getDocs(collection(db, "activityTemplates")),
    ]);

    const mapDocs = (snapshot: Awaited<ReturnType<typeof getDocs>>) =>
      snapshot.docs
        .map((docItem) => ({
          id: docItem.id,
          ...(docItem.data() as Omit<TemplateItem, "id">),
        }))
        .sort((a, b) => (a.title || "").localeCompare(b.title || ""));

    setTrainingTemplates(mapDocs(trainingSnap));
    setNutritionTemplates(mapDocs(nutritionSnap));
    setActivityTemplates(mapDocs(activitySnap));
  };

  const loadScheduleItems = async (profileId: string) => {
    const q = query(
      collection(db, "scheduleItems"),
      where("profileId", "==", profileId)
    );

    const snapshot = await getDocs(q);

    const data = snapshot.docs
      .map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<ScheduleItem, "id">),
      }))
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.startTime.localeCompare(b.startTime);
      }) as ScheduleItem[];

    setScheduleItems(data);
  };

  useEffect(() => {
    const init = async () => {
      try {
        await Promise.all([loadProfiles(), loadTemplates()]);
      } catch (error) {
        console.error("Load schedule page error:", error);
        showToast({
          title: "Could not load schedule page",
          description: "Please refresh the page.",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [showToast]);

  useEffect(() => {
    if (!selectedProfileId) {
      setScheduleItems([]);
      return;
    }

    const run = async () => {
      try {
        setScheduleLoading(true);
        await loadScheduleItems(selectedProfileId);
      } catch (error) {
        console.error("Load client schedule error:", error);
        showToast({
          title: "Could not load client schedule",
          description: "Please try again.",
          type: "error",
        });
      } finally {
        setScheduleLoading(false);
      }
    };

    run();
  }, [selectedProfileId, showToast]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      templateId: "",
    }));
  }, [form.type]);

  const filteredProfiles = useMemo(() => {
    const queryText = profileSearch.trim().toLowerCase();

    return profiles.filter((profile) => {
      const name = (profile.fullName || "").toLowerCase();
      const assignedProgram = (profile.assignedProgram || "").toLowerCase();

      return (
        !queryText ||
        name.includes(queryText) ||
        assignedProgram.includes(queryText)
      );
    });
  }, [profiles, profileSearch]);

  const activeTemplates = useMemo(() => {
    if (form.type === "training") return trainingTemplates;
    if (form.type === "nutrition") return nutritionTemplates;
    return activityTemplates;
  }, [form.type, trainingTemplates, nutritionTemplates, activityTemplates]);

  const selectedTemplate = useMemo(() => {
    return activeTemplates.find((item) => item.id === form.templateId) || null;
  }, [activeTemplates, form.templateId]);

  const selectedProfile = useMemo(() => {
    return profiles.find((item) => item.id === selectedProfileId) || null;
  }, [profiles, selectedProfileId]);

  const groupedSchedule = useMemo(() => {
    return scheduleItems.reduce((acc, item) => {
      if (!acc[item.date]) acc[item.date] = [];
      acc[item.date].push(item);
      return acc;
    }, {} as Record<string, ScheduleItem[]>);
  }, [scheduleItems]);

  const resetForm = () => {
    setEditingItemId(null);
    setForm({
      date: "",
      startTime: "",
      endTime: "",
      type: "training",
      templateId: "",
      title: "",
      details: "",
    });
  };

  const getTemplateTitle = (type: ScheduleType, templateId?: string) => {
    if (!templateId) return "";

    const source =
      type === "training"
        ? trainingTemplates
        : type === "nutrition"
        ? nutritionTemplates
        : activityTemplates;

    return source.find((item) => item.id === templateId)?.title || "";
  };

  const getDisplayTitle = (item: ScheduleItem) => {
    return (
      item.title?.trim() ||
      getTemplateTitle(item.type, item.templateId) ||
      "Session"
    );
  };

  const saveScheduleItem = async () => {
    if (!selectedProfileId) {
      showToast({
        title: "Select a client",
        description: "Choose a client before saving a schedule item.",
        type: "error",
      });
      return;
    }

    if (!form.date || !form.startTime) {
      showToast({
        title: "Missing information",
        description: "Date and start time are required.",
        type: "error",
      });
      return;
    }

    if (!form.templateId && !form.title.trim()) {
      showToast({
        title: "Title required",
        description: "Choose a template or add a custom title.",
        type: "error",
      });
      return;
    }

    setSaving(true);

    try {
      const payload = {
        profileId: selectedProfileId,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime.trim(),
        type: form.type,
        templateId: form.templateId || "",
        title: form.title.trim(),
        details: form.details.trim(),
      };

      if (editingItemId) {
        await updateDoc(doc(db, "scheduleItems", editingItemId), payload);

        showToast({
          title: "Schedule item updated",
          description: "The session was updated successfully.",
          type: "success",
        });
      } else {
        await addDoc(collection(db, "scheduleItems"), {
          ...payload,
          createdAt: serverTimestamp(),
        });

        showToast({
          title: "Schedule item created",
          description: "The session was added successfully.",
          type: "success",
        });
      }

      resetForm();
      await loadScheduleItems(selectedProfileId);
    } catch (error) {
      console.error("Save schedule item error:", error);
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

  const deleteScheduleItem = async (itemId: string) => {
    const confirmed = window.confirm("Delete this schedule item?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "scheduleItems", itemId));

      if (editingItemId === itemId) {
        resetForm();
      }

      await loadScheduleItems(selectedProfileId);

      showToast({
        title: "Schedule item deleted",
        description: "The session was removed.",
        type: "success",
      });
    } catch (error) {
      console.error("Delete schedule item error:", error);
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
        <p className="text-sm font-medium text-slate-500">
          Loading schedule...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
        <div className="bg-gradient-to-r from-[#0f172a] via-[#123b76] to-[#2EA0FF] p-[1px]">
          <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
        </div>

        <div className="p-6 md:p-8">
          <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
            Scheduling
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
            Schedule
          </h1>

          <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
            Create, edit, and manage client itinerary items with template support.
          </p>
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[430px_1fr]">
        <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
              {editingItemId ? "Edit item" : "Create item"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              {editingItemId ? "Edit Schedule Item" : "Create Schedule Item"}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Build the client itinerary using templates or custom notes.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <FieldGroup label="Find client">
              <input
                type="text"
                value={profileSearch}
                onChange={(e) => setProfileSearch(e.target.value)}
                placeholder="Search by client name or program..."
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </FieldGroup>

            <FieldGroup label="Client">
              <select
                value={selectedProfileId}
                onChange={(e) => {
                  setSelectedProfileId(e.target.value);
                  resetForm();
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              >
                <option value="">Select client</option>
                {filteredProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.fullName || "Unnamed profile"}
                    {profile.assignedProgram
                      ? ` — ${profile.assignedProgram}`
                      : ""}
                  </option>
                ))}
              </select>
            </FieldGroup>

            {selectedProfile ? (
              <div className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Selected client
                </p>
                <p className="mt-2 font-semibold text-slate-900">
                  {selectedProfile.fullName || "Unnamed profile"}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Status: {selectedProfile.clientStatus || "active"}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Program: {selectedProfile.assignedProgram || "Not assigned"}
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <FieldGroup label="Date">
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, date: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </FieldGroup>

              <FieldGroup label="Type">
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      type: e.target.value as ScheduleType,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                >
                  <option value="training">Training</option>
                  <option value="nutrition">Nutrition</option>
                  <option value="activity">Activity</option>
                </select>
              </FieldGroup>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FieldGroup label="Start time">
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, startTime: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </FieldGroup>

              <FieldGroup label="End time">
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, endTime: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </FieldGroup>
            </div>

            <FieldGroup label="Template">
              <select
                value={form.templateId}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, templateId: e.target.value }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              >
                <option value="">No template</option>
                {activeTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>
            </FieldGroup>

            {selectedTemplate ? (
              <div className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Template preview
                </p>
                <p className="mt-2 font-semibold text-slate-900">
                  {selectedTemplate.title}
                </p>
                {selectedTemplate.description ? (
                  <p className="mt-1 text-sm text-slate-600">
                    {selectedTemplate.description}
                  </p>
                ) : null}
                {selectedTemplate.content ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {selectedTemplate.content}
                  </p>
                ) : null}
              </div>
            ) : null}

            <FieldGroup label="Custom title">
              <input
                type="text"
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Overrides template title if filled"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </FieldGroup>

            <FieldGroup label="Extra details">
              <textarea
                rows={5}
                value={form.details}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, details: e.target.value }))
                }
                placeholder="Optional notes for this schedule item"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </FieldGroup>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={saveScheduleItem}
                disabled={saving}
                className="rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-5 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : editingItemId
                  ? "Update Item"
                  : "Create Item"}
              </button>

              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                Client schedule
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                Schedule Items
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {selectedProfile
                  ? `Viewing schedule for ${selectedProfile.fullName || "client"}`
                  : "Choose a client to view and manage schedule items."}
              </p>
            </div>

            {selectedProfile ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                {scheduleItems.length} item{scheduleItems.length === 1 ? "" : "s"}
              </div>
            ) : null}
          </div>

          {!selectedProfileId ? (
            <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
              Select a client to load schedule items.
            </div>
          ) : scheduleLoading ? (
            <p className="mt-6 text-sm text-slate-500">Loading schedule...</p>
          ) : scheduleItems.length === 0 ? (
            <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
              No schedule items added yet for this client.
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              {Object.entries(groupedSchedule).map(([date, items]) => (
                <div key={date}>
                  <div className="mb-3 border-b border-slate-100 pb-2">
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {formatDateLabel(date)}
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-slate-950">
                      {date}
                    </h3>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-[24px] border border-slate-100 bg-gradient-to-br from-white to-[#f8fbff] p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#bfdbfe] hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <TypeBadge type={item.type} />
                            <p className="mt-3 text-base font-semibold text-slate-900">
                              {getDisplayTitle(item)}
                            </p>
                            <p className="mt-1 text-sm font-medium text-slate-600">
                              {item.startTime}
                              {item.endTime ? ` - ${item.endTime}` : ""}
                            </p>
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(item)}
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteScheduleItem(item.id)}
                              className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        {item.templateId ? (
                          <p className="mt-3 text-sm text-slate-500">
                            Template: {getTemplateTitle(item.type, item.templateId) || "—"}
                          </p>
                        ) : null}

                        {item.details?.trim() ? (
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                            {item.details}
                          </p>
                        ) : null}
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

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}

function TypeBadge({ type }: { type: ScheduleType }) {
  const styles: Record<ScheduleType, string> = {
    training: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
    nutrition: "border-emerald-200 bg-emerald-50 text-emerald-700",
    activity: "border-violet-200 bg-violet-50 text-violet-700",
  };

  const label =
    type === "training"
      ? "Training"
      : type === "nutrition"
      ? "Nutrition"
      : "Activity";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${styles[type]}`}
    >
      {label}
    </span>
  );
}

function formatDateLabel(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}