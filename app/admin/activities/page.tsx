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

type ActivityItem = {
  id: string;
  title: string;
  description?: string;
  content?: string;
};

export default function AdminActivitiesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    content: "",
  });

  const { showToast } = useToast();

  const loadItems = async () => {
    const snapshot = await getDocs(collection(db, "activityTemplates"));

    const data = snapshot.docs
      .map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<ActivityItem, "id">),
      }))
      .sort((a, b) => (a.title || "").localeCompare(b.title || "")) as ActivityItem[];

    setItems(data);
  };

  useEffect(() => {
    const init = async () => {
      try {
        await loadItems();
      } catch (error) {
        console.error("Load activity items error:", error);
        showToast({
          title: "Could not load activities",
          description: "Please refresh the page.",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [showToast]);

  const filteredItems = useMemo(() => {
    const queryText = search.trim().toLowerCase();

    return items.filter((item) => {
      const title = (item.title || "").toLowerCase();
      const description = (item.description || "").toLowerCase();
      const content = (item.content || "").toLowerCase();

      return (
        !queryText ||
        title.includes(queryText) ||
        description.includes(queryText) ||
        content.includes(queryText)
      );
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
      if (editingId) {
        await updateDoc(doc(db, "activityTemplates", editingId), payload);

        showToast({
          title: "Activity item updated",
          description: "Changes saved successfully.",
          type: "success",
        });
      } else {
        await addDoc(collection(db, "activityTemplates"), payload);

        showToast({
          title: "Activity item created",
          description: "The new activity item was added.",
          type: "success",
        });
      }

      await loadItems();
      resetForm();
    } catch (error) {
      console.error("Save activity item error:", error);
      showToast({
        title: "Save failed",
        description: "Could not save the activity item.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: ActivityItem) => {
    setEditingId(item.id);
    setForm({
      title: item.title || "",
      description: item.description || "",
      content: item.content || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteItem = async (id: string) => {
    const confirmed = window.confirm("Delete this activity item?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "activityTemplates", id));

      if (editingId === id) {
        resetForm();
      }

      await loadItems();

      showToast({
        title: "Activity item deleted",
        description: "The item was removed.",
        type: "success",
      });
    } catch (error) {
      console.error("Delete activity item error:", error);
      showToast({
        title: "Delete failed",
        description: "Could not delete the activity item.",
        type: "error",
      });
    }
  };

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">
          Loading activity items...
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
            Templates
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
            Activities
          </h1>

          <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
            Manage reusable activity content for the bootcamp.
          </p>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
            {editingId ? "Edit item" : "Create item"}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {editingId ? "Edit Activity Item" : "Create Activity Item"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Add reusable activity content that can later be assigned to client
            schedules.
          </p>
        </div>

        <div className="mt-6 grid gap-4">
          <FieldGroup label="Title" required>
            <input
              type="text"
              placeholder="Title"
              value={form.title}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, title: e.target.value }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
            />
          </FieldGroup>

          <FieldGroup label="Description">
            <input
              type="text"
              placeholder="Description"
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
            />
          </FieldGroup>

          <FieldGroup label="Content">
            <textarea
              placeholder="Content"
              value={form.content}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, content: e.target.value }))
              }
              className="min-h-[200px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
            />
          </FieldGroup>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={saveItem}
              disabled={saving}
              className="rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-6 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : editingId
                ? "Save Changes"
                : "Create Item"}
            </button>

            <button
              onClick={resetForm}
              disabled={saving}
              className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
            Library
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            Activity Items
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Search and manage your saved activity templates.
          </p>
        </div>

        <div className="mt-6">
          <input
            type="text"
            placeholder="Search activity items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe] md:max-w-xl"
          />
        </div>

        {filteredItems.length === 0 ? (
          <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 p-10 text-center text-sm text-slate-500">
            No activity items found.
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="rounded-[24px] border border-slate-100 bg-gradient-to-br from-white to-[#f8fbff] p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#bfdbfe] hover:shadow-md"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold text-slate-950">
                      {item.title}
                    </h3>

                    {item.description && (
                      <p className="mt-2 text-sm text-slate-600">
                        {item.description}
                      </p>
                    )}

                    {item.content && (
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {item.content}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(item)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => deleteItem(item.id)}
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