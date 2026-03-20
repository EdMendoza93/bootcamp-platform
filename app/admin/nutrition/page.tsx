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

type NutritionItem = {
  id: string;
  title: string;
  description?: string;
  content?: string;
};

export default function AdminNutritionPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<NutritionItem[]>([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    content: "",
  });

  const { showToast } = useToast();

  const loadItems = async () => {
    const snapshot = await getDocs(collection(db, "nutritionTemplates"));

    const data = snapshot.docs
      .map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<NutritionItem, "id">),
      }))
      .sort((a, b) => (a.title || "").localeCompare(b.title || "")) as NutritionItem[];

    setItems(data);
  };

  useEffect(() => {
    const init = async () => {
      try {
        await loadItems();
      } catch (error) {
        console.error("Load nutrition items error:", error);
        showToast({
          title: "Could not load nutrition items",
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
        await updateDoc(doc(db, "nutritionTemplates", editingId), payload);

        showToast({
          title: "Nutrition item updated",
          description: "Changes saved successfully.",
          type: "success",
        });
      } else {
        await addDoc(collection(db, "nutritionTemplates"), payload);

        showToast({
          title: "Nutrition item created",
          description: "The new nutrition item was added.",
          type: "success",
        });
      }

      await loadItems();
      resetForm();
    } catch (error) {
      console.error("Save nutrition item error:", error);
      showToast({
        title: "Save failed",
        description: "Could not save the nutrition item.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: NutritionItem) => {
    setEditingId(item.id);
    setForm({
      title: item.title || "",
      description: item.description || "",
      content: item.content || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteItem = async (id: string) => {
    const confirmed = window.confirm("Delete this nutrition item?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "nutritionTemplates", id));

      if (editingId === id) {
        resetForm();
      }

      await loadItems();

      showToast({
        title: "Nutrition item deleted",
        description: "The item was removed.",
        type: "success",
      });
    } catch (error) {
      console.error("Delete nutrition item error:", error);
      showToast({
        title: "Delete failed",
        description: "Could not delete the nutrition item.",
        type: "error",
      });
    }
  };

  if (loading) {
    return <p className="p-10">Loading...</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Nutrition</h1>
        <p className="mt-2 text-gray-600">
          Manage reusable nutrition content for the bootcamp.
        </p>
      </div>

      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">
          {editingId ? "Edit Nutrition Item" : "Create Nutrition Item"}
        </h2>

        <div className="mt-6 grid gap-4">
          <input
            type="text"
            placeholder="Title"
            value={form.title}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, title: e.target.value }))
            }
            className="w-full rounded-xl border p-3"
          />

          <input
            type="text"
            placeholder="Description"
            value={form.description}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, description: e.target.value }))
            }
            className="w-full rounded-xl border p-3"
          />

          <textarea
            placeholder="Content"
            value={form.content}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, content: e.target.value }))
            }
            className="min-h-[180px] w-full rounded-xl border p-3"
          />

          <div className="flex flex-wrap gap-3">
            <button
              onClick={saveItem}
              disabled={saving}
              className="rounded-xl bg-black px-6 py-3 text-sm font-medium text-white disabled:opacity-50"
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
              className="rounded-xl border bg-white px-6 py-3 text-sm font-medium disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="text"
            placeholder="Search nutrition items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-black md:flex-1"
          />
        </div>

        {filteredItems.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed p-10 text-center text-sm text-gray-500">
            No nutrition items found.
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border bg-gray-50 p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold">{item.title}</h3>

                    {item.description && (
                      <p className="mt-2 text-sm text-gray-600">
                        {item.description}
                      </p>
                    )}

                    {item.content && (
                      <p className="mt-4 whitespace-pre-wrap text-sm text-gray-700">
                        {item.content}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(item)}
                      className="rounded-xl border px-4 py-2 text-sm font-medium"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => deleteItem(item.id)}
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
    </div>
  );
}