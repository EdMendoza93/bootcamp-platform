"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useToast } from "@/components/ui/ToastProvider";
import { AppRole, getRoleLabel, normalizeRole } from "@/lib/roles";

type TemplateType = "training" | "nutrition";

type TemplateItem = {
  id: string;
  title: string;
  description?: string;
  content?: string;
};

const COLLECTION_BY_TYPE: Record<TemplateType, string> = {
  training: "trainingTemplates",
  nutrition: "nutritionTemplates",
};

export default function StaffTemplatesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<AppRole>("coach");
  const [activeType, setActiveType] = useState<TemplateType>("training");
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    content: "",
  });

  const { showToast } = useToast();

  const allowedTypes = useMemo<TemplateType[]>(() => {
    if (role === "admin") return ["training", "nutrition"];
    if (role === "nutritionist") return ["nutrition"];
    return ["training"];
  }, [role]);

  const loadItems = async (type: TemplateType) => {
    const snapshot = await getDocs(collection(db, COLLECTION_BY_TYPE[type]));
    const data = snapshot.docs
      .map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<TemplateItem, "id">),
      }))
      .sort((a, b) => (a.title || "").localeCompare(b.title || "")) as TemplateItem[];

    setItems(data);
  };

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
        const nextRole = normalizeRole(
          userSnap.exists() ? userSnap.data()?.role : "user"
        );

        if (
          nextRole !== "admin" &&
          nextRole !== "coach" &&
          nextRole !== "nutritionist"
        ) {
          window.location.replace("/dashboard");
          return;
        }

        setRole(nextRole);
        const nextType: TemplateType =
          nextRole === "nutritionist" ? "nutrition" : "training";
        setActiveType(nextType);
        await loadItems(nextType);
      } catch (error) {
        console.error("Load staff templates error:", error);
        showToast({
          title: "Could not load templates",
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
    if (!allowedTypes.includes(activeType)) {
      setActiveType(allowedTypes[0]);
      return;
    }

    if (!loading) {
      void loadItems(activeType);
    }
  }, [activeType, allowedTypes, loading]);

  const filteredItems = useMemo(() => {
    const queryText = search.trim().toLowerCase();

    return items.filter((item) => {
      const haystack =
        `${item.title || ""} ${item.description || ""} ${item.content || ""}`.toLowerCase();
      return !queryText || haystack.includes(queryText);
    });
  }, [items, search]);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      title: "",
      description: "",
      content: "",
    });
  };

  const saveItem = async () => {
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

    setSaving(true);

    try {
      const collectionName = COLLECTION_BY_TYPE[activeType];

      if (editingId) {
        await updateDoc(doc(db, collectionName, editingId), payload);
      } else {
        await addDoc(collection(db, collectionName), payload);
      }

      await loadItems(activeType);
      resetForm();

      showToast({
        title: editingId ? "Template updated" : "Template created",
        description: `The ${activeType} template library was updated successfully.`,
        type: "success",
      });
    } catch (error) {
      console.error("Save staff template error:", error);
      showToast({
        title: "Save failed",
        description: "Could not save the template.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: TemplateItem) => {
    setEditingId(item.id);
    setForm({
      title: item.title || "",
      description: item.description || "",
      content: item.content || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteItem = async (id: string) => {
    const confirmed = window.confirm("Delete this template?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, COLLECTION_BY_TYPE[activeType], id));

      if (editingId === id) {
        resetForm();
      }

      await loadItems(activeType);

      showToast({
        title: "Template deleted",
        description: "The template was removed from the library.",
        type: "success",
      });
    } catch (error) {
      console.error("Delete staff template error:", error);
      showToast({
        title: "Delete failed",
        description: "Could not delete the template.",
        type: "error",
      });
    }
  };

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">
          Loading staff templates...
        </p>
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
              Staff Templates
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-600 md:text-base">
              Build reusable content for your discipline so staff can assemble
              client schedules faster and more consistently.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              {allowedTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setActiveType(type);
                    resetForm();
                  }}
                  className={[
                    "rounded-2xl px-4 py-2.5 text-sm font-medium transition",
                    activeType === type
                      ? "bg-slate-950 text-white shadow-[0_12px_28px_rgba(15,23,42,0.16)]"
                      : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {type === "training" ? "Training templates" : "Nutrition templates"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <h2 className="text-xl font-semibold text-slate-950">
            {editingId ? "Edit template" : "Create template"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {activeType === "training"
              ? "Create reusable workouts, blocks, or session structures."
              : "Create reusable meal plans, nutrition blocks, or guidance."}
          </p>

          <div className="mt-6 space-y-4">
            <FieldGroup label="Title" required>
              <input
                type="text"
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder={
                  activeType === "training"
                    ? "Upper body strength"
                    : "High-protein breakfast"
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </FieldGroup>

            <FieldGroup label="Description">
              <input
                type="text"
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Short internal description"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </FieldGroup>

            <FieldGroup label="Content">
              <textarea
                value={form.content}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, content: e.target.value }))
                }
                placeholder="Add the full reusable template content here..."
                className="min-h-[220px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </FieldGroup>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={saveItem}
                disabled={saving}
                className="rounded-2xl bg-[linear-gradient(135deg,#0f172a,#123b76)] px-5 py-3 text-sm font-medium text-white shadow-[0_12px_28px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving
                  ? "Saving..."
                  : editingId
                  ? "Save changes"
                  : "Create template"}
              </button>

              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                Library
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                {activeType === "training" ? "Training" : "Nutrition"} Templates
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Search and maintain the reusable library for your role.
              </p>
            </div>

            <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {filteredItems.length} result{filteredItems.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="mt-6">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${activeType} templates...`}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
            />
          </div>

          {filteredItems.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 p-10 text-center text-sm text-slate-500">
              No templates found for this library.
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[24px] border border-slate-100 bg-gradient-to-br from-white to-[#f8fbff] p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#bfdbfe] hover:shadow-md"
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
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteItem(item.id)}
                        className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
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
        {required ? <span className="ml-1 text-[#1d4ed8]">*</span> : null}
      </label>
      {children}
    </div>
  );
}
