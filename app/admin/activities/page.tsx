"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";

type ActivityTemplate = {
  id: string;
  title: string;
  description: string;
  content: string;
  category: "activity" | "other";
};

export default function AdminActivitiesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<ActivityTemplate[]>([]);

  const [form, setForm] = useState({
    title: "",
    description: "",
    content: "",
    category: "activity",
  });

  const loadTemplates = async () => {
    try {
      const q = query(
        collection(db, "activityTemplates"),
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(q);

      const data: ActivityTemplate[] = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<ActivityTemplate, "id">),
      }));

      setTemplates(data);
    } catch (error) {
      console.error("Load activity templates error:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.replace("/login");
        return;
      }

      try {
        await loadTemplates();
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const createTemplate = async () => {
    if (!form.title || !form.content) {
      alert("Title and content are required.");
      return;
    }

    setSaving(true);

    try {
      await addDoc(collection(db, "activityTemplates"), {
        title: form.title,
        description: form.description,
        content: form.content,
        category: form.category,
        createdAt: serverTimestamp(),
      });

      setForm({
        title: "",
        description: "",
        content: "",
        category: "activity",
      });

      await loadTemplates();
      alert("Activity template created.");
    } catch (error) {
      console.error("Create activity template error:", error);
      alert("Failed to create activity template.");
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    const confirmed = window.confirm("Delete this activity template?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "activityTemplates", id));
      await loadTemplates();
    } catch (error) {
      console.error("Delete activity template error:", error);
      alert("Failed to delete template.");
    }
  };

  if (loading) {
    return <p className="p-10">Loading...</p>;
  }

  return (
    <main className="min-h-screen bg-white p-10">
      <a
        href="/admin"
        className="inline-block rounded border px-4 py-2"
      >
        Back to Admin
      </a>

      <h1 className="mt-6 text-3xl font-bold">Activity Templates</h1>
      <p className="mt-2 text-gray-600">
        Create reusable activities and other schedule items.
      </p>

      <div className="mt-8 max-w-3xl rounded-xl border p-6">
        <h2 className="text-xl font-semibold">Create Activity Template</h2>

        <div className="mt-4 space-y-4">
          <select
            className="w-full rounded border p-3"
            value={form.category}
            onChange={(e) =>
              setForm({
                ...form,
                category: e.target.value as "activity" | "other",
              })
            }
          >
            <option value="activity">activity</option>
            <option value="other">other</option>
          </select>

          <input
            className="w-full rounded border p-3"
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />

          <textarea
            className="min-h-[100px] w-full rounded border p-3"
            placeholder="Short description"
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
          />

          <textarea
            className="min-h-[220px] w-full rounded border p-3"
            placeholder="Activity details"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />

          <button
            onClick={createTemplate}
            disabled={saving}
            className="rounded bg-black px-6 py-3 text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Create Activity Template"}
          </button>
        </div>
      </div>

      <div className="mt-10 space-y-4">
        {templates.map((template) => (
          <div key={template.id} className="rounded-xl border p-6">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-semibold">{template.title}</h3>
              <span className="rounded bg-gray-100 px-2 py-1 text-xs uppercase tracking-wide text-gray-600">
                {template.category}
              </span>
            </div>

            {template.description && (
              <p className="mt-2 text-sm text-gray-600">
                {template.description}
              </p>
            )}

            <p className="mt-4 whitespace-pre-line text-sm text-gray-700">
              {template.content}
            </p>

            <button
              onClick={() => deleteTemplate(template.id)}
              className="mt-4 rounded border px-4 py-2 text-sm"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}