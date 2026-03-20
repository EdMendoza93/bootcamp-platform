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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Templates</h1>
        <p className="mt-2 text-gray-600">
          Create reusable training, nutrition, and activity templates for faster plan building.
        </p>
      </div>

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
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {activeType.charAt(0).toUpperCase() + activeType.slice(1)} templates
            </h2>
            <span className="text-sm text-gray-500">
              {activeTemplates.length} item{activeTemplates.length === 1 ? "" : "s"}
            </span>
          </div>

          {loading ? (
            <div className="rounded-2xl border bg-gray-50 p-4 text-sm text-gray-500">
              Loading templates...
            </div>
          ) : activeTemplates.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-gray-50 p-8 text-center text-sm text-gray-500">
              No templates yet for this category.
            </div>
          ) : (
            <div className="space-y-4">
              {activeTemplates.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border bg-gray-50 p-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold">{item.title}</h3>

                      {item.description ? (
                        <p className="mt-2 text-sm text-gray-600">
                          {item.description}
                        </p>
                      ) : null}

                      {item.content ? (
                        <p className="mt-4 whitespace-pre-wrap text-sm text-gray-700">
                          {item.content}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="rounded-xl border px-4 py-2 text-sm font-medium"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTemplate(item.id)}
                        className="rounded-xl border px-4 py-2 text-sm font-medium"
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

        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">
              {editingTemplateId ? "Edit template" : "Create template"}
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Save reusable content for {activeType} plans.
            </p>
          </div>

          <div className="space-y-4">
            <input
              type="text"
              value={form.title}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, title: e.target.value }))
              }
              className="w-full rounded-xl border p-3"
              placeholder="Title"
            />

            <input
              type="text"
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
              className="w-full rounded-xl border p-3"
              placeholder="Description"
            />

            <textarea
              rows={10}
              value={form.content}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, content: e.target.value }))
              }
              className="w-full rounded-xl border p-3"
              placeholder="Content"
            />

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={saveTemplate}
                disabled={saving}
                className="rounded-xl bg-black px-6 py-3 text-sm font-medium text-white disabled:opacity-50"
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
                className="rounded-xl border bg-white px-6 py-3 text-sm font-medium disabled:opacity-50"
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