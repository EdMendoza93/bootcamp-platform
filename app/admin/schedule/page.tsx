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
  updateDoc,
} from "firebase/firestore";

type Profile = {
  id: string;
  fullName: string;
  clientStatus?: "active" | "inactive";
};

type Template = {
  id: string;
  title: string;
};

type ScheduleItem = {
  id: string;
  profileId: string;
  date: string;
  startTime: string;
  endTime?: string;
  type: "training" | "nutrition" | "activity" | "other";
  templateId?: string;
  title?: string;
  details?: string;
};

export default function AdminSchedulePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showInactiveClients, setShowInactiveClients] = useState(false);
  const [useTemplate, setUseTemplate] = useState(true);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  const [form, setForm] = useState({
    profileId: "",
    date: "",
    startTime: "",
    endTime: "",
    type: "training",
    templateId: "",
    title: "",
    details: "",
  });

  const loadProfiles = async () => {
    const snapshot = await getDocs(collection(db, "profiles"));
    const data = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...(docItem.data() as any),
    })) as Profile[];

    setProfiles(data);
  };

  const loadScheduleItems = async () => {
    const q = query(collection(db, "scheduleItems"), orderBy("date", "asc"));
    const snapshot = await getDocs(q);

    const data = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...(docItem.data() as any),
    })) as ScheduleItem[];

    data.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.startTime.localeCompare(b.startTime);
    });

    setScheduleItems(data);
  };

  const loadTemplates = async (type: string) => {
    let collectionName = "";

    if (type === "training") collectionName = "trainingTemplates";
    if (type === "nutrition") collectionName = "nutritionTemplates";
    if (type === "activity" || type === "other") {
      collectionName = "activityTemplates";
    }

    if (!collectionName) return;

    const snapshot = await getDocs(collection(db, collectionName));

    let data = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      title: (docItem.data() as any).title,
      ...(docItem.data() as any),
    }));

    if (type === "activity" || type === "other") {
      data = data.filter((item: any) => item.category === type);
    }

    setTemplates(data.map((item: any) => ({ id: item.id, title: item.title })));
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.replace("/login");
        return;
      }

      await loadProfiles();
      await loadTemplates("training");
      await loadScheduleItems();

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    loadTemplates(form.type);
    setForm((prev) => ({
      ...prev,
      templateId: "",
    }));
  }, [form.type]);

  const activeProfiles = profiles.filter((p) => p.clientStatus !== "inactive");
  const visibleProfiles = showInactiveClients ? profiles : activeProfiles;

  const resetForm = () => {
    setForm({
      profileId: "",
      date: "",
      startTime: "",
      endTime: "",
      type: "training",
      templateId: "",
      title: "",
      details: "",
    });
    setEditingId(null);
    setUseTemplate(true);
  };

  const saveScheduleItem = async () => {
    if (!form.profileId || !form.date || !form.startTime) {
      alert("Missing required fields");
      return;
    }

    if (useTemplate && !form.templateId) {
      alert("Please select a template.");
      return;
    }

    if (!useTemplate && !form.title) {
      alert("Please add a custom title.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        profileId: form.profileId,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        type: form.type as "training" | "nutrition" | "activity" | "other",
        templateId: useTemplate ? form.templateId : "",
        title: form.title,
        details: form.details,
      };

      if (editingId) {
        await updateDoc(doc(db, "scheduleItems", editingId), payload);
        alert("Schedule item updated");
      } else {
        await addDoc(collection(db, "scheduleItems"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        alert("Schedule item created");
      }

      resetForm();
      await loadScheduleItems();
    } catch (error) {
      console.error(error);
      alert("Error saving schedule item");
    } finally {
      setSaving(false);
    }
  };

  const editScheduleItem = (item: ScheduleItem) => {
    setEditingId(item.id);

    const itemUsesTemplate = !!item.templateId;
    setUseTemplate(itemUsesTemplate);

    setForm({
      profileId: item.profileId || "",
      date: item.date || "",
      startTime: item.startTime || "",
      endTime: item.endTime || "",
      type: item.type || "training",
      templateId: item.templateId || "",
      title: item.title || "",
      details: item.details || "",
    });
  };

  const deleteScheduleItem = async (id: string) => {
    const confirmed = window.confirm("Delete this schedule item?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "scheduleItems", id));
      await loadScheduleItems();
    } catch (error) {
      console.error(error);
      alert("Error deleting schedule item");
    }
  };

  const getProfileName = (profileId: string) => {
    const profile = profiles.find((p) => p.id === profileId);
    return profile?.fullName || "Unknown client";
  };

  if (loading) return <p className="p-10">Loading...</p>;

  return (
    <main className="min-h-screen bg-white p-10">
      <a href="/admin" className="inline-block rounded border px-4 py-2">
        Back to Admin
      </a>

      <h1 className="mt-6 text-3xl font-bold">Schedule Builder</h1>

      <label className="mt-6 flex items-center gap-3">
        <input
          type="checkbox"
          checked={showInactiveClients}
          onChange={(e) => setShowInactiveClients(e.target.checked)}
        />
        <span>Show inactive clients</span>
      </label>

      <div className="mt-8 max-w-2xl space-y-4 rounded-xl border p-6">
        <h2 className="text-xl font-semibold">
          {editingId ? "Edit Schedule Item" : "Create Schedule Item"}
        </h2>

        <select
          className="w-full rounded border p-3"
          value={form.profileId}
          onChange={(e) =>
            setForm({ ...form, profileId: e.target.value })
          }
        >
          <option value="">Select client</option>
          {visibleProfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName}
              {p.clientStatus === "inactive" ? " (inactive)" : ""}
            </option>
          ))}
        </select>

        <input
          type="date"
          className="w-full rounded border p-3"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />

        <input
          type="time"
          className="w-full rounded border p-3"
          value={form.startTime}
          onChange={(e) => setForm({ ...form, startTime: e.target.value })}
        />

        <input
          type="time"
          className="w-full rounded border p-3"
          value={form.endTime}
          onChange={(e) => setForm({ ...form, endTime: e.target.value })}
        />

        <select
          className="w-full rounded border p-3"
          value={form.type}
          onChange={(e) =>
            setForm({
              ...form,
              type: e.target.value,
            })
          }
        >
          <option value="training">training</option>
          <option value="nutrition">nutrition</option>
          <option value="activity">activity</option>
          <option value="other">other</option>
        </select>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setUseTemplate(true)}
            className={`rounded px-4 py-2 text-sm ${
              useTemplate ? "bg-black text-white" : "border"
            }`}
          >
            Use Template
          </button>

          <button
            type="button"
            onClick={() => setUseTemplate(false)}
            className={`rounded px-4 py-2 text-sm ${
              !useTemplate ? "bg-black text-white" : "border"
            }`}
          >
            Custom Item
          </button>
        </div>

        {useTemplate ? (
          <select
            className="w-full rounded border p-3"
            value={form.templateId}
            onChange={(e) =>
              setForm({ ...form, templateId: e.target.value })
            }
          >
            <option value="">Select template</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        ) : (
          <>
            <input
              className="w-full rounded border p-3"
              placeholder="Custom title"
              value={form.title}
              onChange={(e) =>
                setForm({ ...form, title: e.target.value })
              }
            />

            <textarea
              className="min-h-[140px] w-full rounded border p-3"
              placeholder="Custom details"
              value={form.details}
              onChange={(e) =>
                setForm({ ...form, details: e.target.value })
              }
            />
          </>
        )}

        {useTemplate && (
          <>
            <input
              className="w-full rounded border p-3"
              placeholder="Custom display title (optional)"
              value={form.title}
              onChange={(e) =>
                setForm({ ...form, title: e.target.value })
              }
            />

            <textarea
              className="min-h-[100px] w-full rounded border p-3"
              placeholder="Extra notes (optional)"
              value={form.details}
              onChange={(e) =>
                setForm({ ...form, details: e.target.value })
              }
            />
          </>
        )}

        <div className="flex gap-3">
          <button
            onClick={saveScheduleItem}
            disabled={saving}
            className="rounded bg-black px-6 py-3 text-white disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : editingId
              ? "Update Schedule Item"
              : "Create Schedule Item"}
          </button>

          {editingId && (
            <button
              onClick={resetForm}
              className="rounded border px-6 py-3"
            >
              Cancel Edit
            </button>
          )}
        </div>
      </div>

      <div className="mt-10 space-y-4">
        {scheduleItems.map((item) => (
          <div key={item.id} className="rounded-xl border p-6">
            <h3 className="text-xl font-semibold">
              {item.title || "Schedule item"}
            </h3>

            <p className="mt-2 text-sm text-gray-600">
              Client: {getProfileName(item.profileId)}
            </p>
            <p className="text-sm text-gray-600">Date: {item.date}</p>
            <p className="text-sm text-gray-600">
              Time: {item.startTime}
              {item.endTime ? ` - ${item.endTime}` : ""}
            </p>
            <p className="text-sm uppercase text-gray-600">
              Type: {item.type}
            </p>
            <p className="text-sm text-gray-600">
              Mode: {item.templateId ? "template" : "custom"}
            </p>

            <div className="mt-4 flex gap-3">
              <button
                onClick={() => editScheduleItem(item)}
                className="rounded border px-4 py-2 text-sm"
              >
                Edit
              </button>

              <button
                onClick={() => deleteScheduleItem(item.id)}
                className="rounded border px-4 py-2 text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}