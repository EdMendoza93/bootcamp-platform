"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { useToast } from "@/components/ui/ToastProvider";

type TemplateType = "training" | "nutrition" | "activity";

type TemplateItem = {
  id: string;
  title: string;
  description?: string;
  content?: string;
};

const collectionMap: Record<TemplateType, string> = {
  training: "trainingTemplates",
  nutrition: "nutritionTemplates",
  activity: "activityTemplates",
};

export default function AdminTemplatesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [activeType, setActiveType] = useState<TemplateType>("training");

  const [trainingTemplates, setTrainingTemplates] = useState<TemplateItem[]>([]);
  const [nutritionTemplates, setNutritionTemplates] = useState<TemplateItem[]>([]);
  const [activityTemplates, setActivityTemplates] = useState<TemplateItem[]>([]);

  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    content: "",
  });

  const { showToast } = useToast();

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

  useEffect(() => {
    const init = async () => {
      try {
        await loadTemplates();
      } catch (error) {
        console.error("Load templates error:", error);
        showToast({
          title: "Could not load templates",
          description: "Please refresh the page.",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [showToast]);

  const activeTemplates = useMemo(() => {
    if (activeType === "training") return trainingTemplates;
    if (activeType === "nutrition") return nutritionTemplates;
    return activityTemplates;
  }, [activeType, trainingTemplates, nutritionTemplates, activityTemplates]);

  const summary = useMemo(
    () => ({
      training: trainingTemplates.length,
      nutrition: nutritionTemplates.length,
      activity: activityTemplates.length,
      total:
        trainingTemplates.length +
        nutritionTemplates.length +
        activityTemplates.length,
    }),
    [trainingTemplates, nutritionTemplates, activityTemplates]
  );

  const resetForm = () => {
    setEditingTemplateId(null);
    setForm({
      title: "",
      description: "",
      content: "",
    });
  };

  const saveTemplate = async () => {
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      content: form.content.trim(),
    };

    if (!payload.title) {
      showToast({
        title: "Title required",
        description: "Please add a title before saving.",
        type: "error",
      });
      return;
    }

    try {
      setSaving(true);

      if (editingTemplateId) {
        await updateDoc(
          doc(db, collectionMap[activeType], editingTemplateId),
          payload
        );

        showToast({
          title: "Template updated",
          description: "Your changes have been saved.",
          type: "success",
        });
      } else {
        await addDoc(collection(db, collectionMap[activeType]), payload);

        showToast({
          title: "Template created",
          description: "The new template has been added.",
          type: "success",
        });
      }

      await loadTemplates();
      resetForm();
    } catch (error) {
      console.error("Save template error:", error);
      showToast({
        title: "Could not save template",
        description: "Please try again.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: TemplateItem) => {
    setEditingTemplateId(item.id);
    setForm({
      title: item.title || "",
      description: item.description || "",
      content: item.content || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeTemplate = async (id: string) => {
    const confirmed = window.confirm("Are you sure you want to delete this template?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, collectionMap[activeType], id));

      if (editingTemplateId === id) {
        resetForm();
      }

      await loadTemplates();

      showToast({
        title: "Template deleted",
        description: "The template has been removed.",
        type: "success",
      });
    } catch (error) {
      console.error("Delete template error:", error);
      showToast({
        title: "Could not delete template",
        description: "Please try again.",
        type: "error",
      });
    }
  };

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
        <div className="bg-gradient-to-r from-[#0f172a] via-[#123b76] to-[#2EA0FF] p-[1px]">
          <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
        </div>

        <div className="p-6 md:p-8">
          <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
            Reusable Content
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
            Templates
          </h1>

          <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
            Create reusable training, nutrition, and activity templates for faster
            plan building.
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Training" value={String(summary.training)} tone="blue" />
        <SummaryCard label="Nutrition" value={String(summary.nutrition)} tone="success" />
        <SummaryCard label="Activity" value={String(summary.activity)} tone="violet" />
        <SummaryCard label="Total Templates" value={String(summary.total)} tone="dark" />
      </section>

      <section className="rounded-[28px] border border-white/70 bg-white/90 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-6">
        <div className="flex flex-wrap gap-2">
          {(["training", "nutrition", "activity"] as TemplateType[]).map((type) => {
            const isActive = activeType === type;

            return (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setActiveType(type);
                  resetForm();
                }}
                className={`rounded-2xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-slate-950 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                Library
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                {activeType.charAt(0).toUpperCase() + activeType.slice(1)} Templates
              </h2>
            </div>

            <span className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
              {activeTemplates.length} item{activeTemplates.length === 1 ? "" : "s"}
            </span>
          </div>

          {loading ? (
            <div className="rounded-[22px] border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500">
              Loading templates...
            </div>
          ) : activeTemplates.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-sm text-slate-500">
              No templates yet for this category.
            </div>
          ) : (
            <div className="space-y-4">
              {activeTemplates.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[24px] border border-slate-100 bg-gradient-to-br from-white to-[#f8fbff] p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#bfdbfe] hover:shadow-md"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold text-slate-950">
                        {item.title}
                      </h3>

                      {item.description ? (
                        <p className="mt-2 text-sm text-slate-600">
                          {item.description}
                        </p>
                      ) : null}

                      {item.content ? (
                        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                          {item.content}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTemplate(item.id)}
                        className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="mb-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
              {editingTemplateId ? "Edit template" : "Create template"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              {editingTemplateId ? "Edit Template" : "Create Template"}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Save reusable content for {activeType} plans.
            </p>
          </div>

          <div className="space-y-4">
            <FieldGroup label="Title" required>
              <input
                type="text"
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, title: e.target.value }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                placeholder="Title"
              />
            </FieldGroup>

            <FieldGroup label="Description">
              <input
                type="text"
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                placeholder="Description"
              />
            </FieldGroup>

            <FieldGroup label="Content">
              <textarea
                rows={10}
                value={form.content}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, content: e.target.value }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                placeholder="Content"
              />
            </FieldGroup>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={saveTemplate}
                disabled={saving}
                className="rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-6 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : editingTemplateId
                  ? "Save Changes"
                  : "Create Template"}
              </button>

              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>
        </section>
      </div>
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
  tone: "blue" | "success" | "violet" | "dark";
}) {
  const styles: Record<
    "blue" | "success" | "violet" | "dark",
    {
      card: string;
      label: string;
      value: string;
    }
  > = {
    blue: {
      card: "border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white",
      label: "text-[#1d4ed8]",
      value: "text-slate-950",
    },
    success: {
      card: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white",
      label: "text-emerald-700",
      value: "text-slate-950",
    },
    violet: {
      card: "border-violet-200 bg-gradient-to-br from-violet-50 to-white",
      label: "text-violet-700",
      value: "text-slate-950",
    },
    dark: {
      card: "border-slate-800 bg-gradient-to-br from-slate-950 to-slate-800",
      label: "text-slate-300",
      value: "text-white",
    },
  };

  return (
    <div
      className={`rounded-[24px] border p-5 shadow-[0_14px_40px_rgba(15,23,42,0.07)] ${styles[tone].card}`}
    >
      <p className={`text-sm font-semibold ${styles[tone].label}`}>{label}</p>
      <p className={`mt-2 text-3xl font-semibold tracking-tight ${styles[tone].value}`}>
        {value}
      </p>
    </div>
  );
}

function FieldGroup({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="ml-1 text-[#1d4ed8]">*</span>}
      </label>
      {children}
    </div>
  );
}