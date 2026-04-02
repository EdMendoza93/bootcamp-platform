"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { db } from "@/lib/firebase";
import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from "firebase/firestore";
import { useToast } from "@/components/ui/ToastProvider";
import {
  fetchForzabyTrainingExercises,
  fetchForzabyTrainingRoutines,
  type ForzabyExerciseSnapshot,
  type ForzabyRoutineSnapshot,
} from "@/lib/forzaby";

type TrainingItem = {
  id: string;
  title: string;
  description?: string;
  content?: string;
  source?: "bootcamp" | "forzaby";
  forzabyResourceType?: "exercise" | "routine";
  importedAt?: number;
  forzabySnapshot?: ForzabyExerciseSnapshot | ForzabyRoutineSnapshot;
};

const ROUTINE_GALLERY_SECTIONS = [
  { key: "short", label: "Short splits", emoji: "⚡" },
  { key: "balanced", label: "Balanced plans", emoji: "🧩" },
  { key: "long", label: "Longer programs", emoji: "📚" },
] as const;

export default function AdminTrainingPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [items, setItems] = useState<TrainingItem[]>([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedRoutineId, setExpandedRoutineId] = useState<string | null>(null);
  const [forzabyExercises, setForzabyExercises] = useState<ForzabyExerciseSnapshot[]>([]);
  const [forzabyRoutines, setForzabyRoutines] = useState<ForzabyRoutineSnapshot[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    content: "",
  });

  const { showToast } = useToast();

  const loadItems = async () => {
    const snapshot = await getDocs(collection(db, "trainingTemplates"));
    const data = snapshot.docs
      .map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<TrainingItem, "id">),
      }))
      .sort((a, b) => (a.title || "").localeCompare(b.title || "")) as TrainingItem[];

    setItems(data);
  };

  const loadForzaby = async () => {
    const [exerciseResponse, routineResponse] = await Promise.all([
      fetchForzabyTrainingExercises(),
      fetchForzabyTrainingRoutines(),
    ]);

    setForzabyExercises(exerciseResponse.data?.snapshots || []);
    setForzabyRoutines(routineResponse.data?.snapshots || []);
  };

  useEffect(() => {
    const init = async () => {
      try {
        await Promise.all([loadItems(), loadForzaby()]);
      } catch (error) {
        console.error("Load training items error:", error);
        showToast({
          title: "Could not load training items",
          description: "Please refresh the page.",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    };

    void init();
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

  const groupedForzabyRoutines = useMemo(() => {
    const groups: Record<(typeof ROUTINE_GALLERY_SECTIONS)[number]["key"], ForzabyRoutineSnapshot[]> = {
      short: [],
      balanced: [],
      long: [],
    };

    for (const routine of forzabyRoutines) {
      const dayCount = routine.days.length;
      if (dayCount <= 2) groups.short.push(routine);
      else if (dayCount <= 4) groups.balanced.push(routine);
      else groups.long.push(routine);
    }

    return groups;
  }, [forzabyRoutines]);

  const resetForm = () => {
    setEditingId(null);
    setForm({ title: "", description: "", content: "" });
  };

  const saveItem = async () => {
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      content: form.content.trim(),
      source: editingId
        ? items.find((item) => item.id === editingId)?.source || "bootcamp"
        : "bootcamp",
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
        await updateDoc(doc(db, "trainingTemplates", editingId), payload);
        showToast({
          title: "Training item updated",
          description: "Changes saved successfully.",
          type: "success",
        });
      } else {
        await addDoc(collection(db, "trainingTemplates"), payload);
        showToast({
          title: "Training item created",
          description: "The new training item was added.",
          type: "success",
        });
      }

      await loadItems();
      resetForm();
    } catch (error) {
      console.error("Save training item error:", error);
      showToast({
        title: "Save failed",
        description: "Could not save the training item.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: TrainingItem) => {
    setEditingId(item.id);
    setForm({
      title: item.title || "",
      description: item.description || "",
      content: item.content || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteItem = async (id: string) => {
    const confirmed = window.confirm("Delete this training item?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "trainingTemplates", id));
      if (editingId === id) resetForm();
      await loadItems();
      showToast({
        title: "Training item deleted",
        description: "The item was removed.",
        type: "success",
      });
    } catch (error) {
      console.error("Delete training item error:", error);
      showToast({
        title: "Delete failed",
        description: "Could not delete the training item.",
        type: "error",
      });
    }
  };

  const importExercise = async (exercise: ForzabyExerciseSnapshot) => {
    setImporting(`exercise-${exercise.forzabyExerciseId}`);
    try {
      await addDoc(collection(db, "trainingTemplates"), {
        title: exercise.name,
        description:
          exercise.description || exercise.categoryName || "Imported from Forzaby exercise library",
        content: [
          exercise.categoryName ? `Category: ${exercise.categoryName}` : "",
          exercise.muscles.length ? `Primary muscles: ${exercise.muscles.join(", ")}` : "",
          exercise.musclesSecondary.length
            ? `Secondary muscles: ${exercise.musclesSecondary.join(", ")}`
            : "",
          exercise.equipment.length ? `Equipment: ${exercise.equipment.join(", ")}` : "",
          exercise.tags.length ? `Tags: ${exercise.tags.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        source: "forzaby",
        forzabyResourceType: "exercise",
        forzabyExerciseId: exercise.forzabyExerciseId,
        forzabySnapshot: exercise,
        importedAt: Date.now(),
      });

      await loadItems();
      showToast({
        title: "Exercise imported",
        description: `${exercise.name} is now in the Bootcamp training library and can be assigned to schedule from there.`,
        type: "success",
      });
    } catch (error) {
      console.error("Import exercise error:", error);
      showToast({
        title: "Import failed",
        description: "Could not import the Forzaby exercise.",
        type: "error",
      });
    } finally {
      setImporting(null);
    }
  };

  const importRoutine = async (routine: ForzabyRoutineSnapshot) => {
    setImporting(`routine-${routine.forzabyRoutineId}`);
    try {
      await addDoc(collection(db, "trainingTemplates"), {
        title: routine.title,
        description: routine.description || "Imported from Forzaby routine library",
        content: routine.days
          .map((day) => {
            const exercises = day.exercises
              .map((exercise) => {
                const parts = [exercise.snapshot?.name || `Exercise ${exercise.exerciseId}`];
                if (exercise.sets) parts.push(`${exercise.sets} sets`);
                if (exercise.reps) parts.push(`${exercise.reps} reps`);
                return `- ${parts.join(" · ")}`;
              })
              .join("\n");
            return `${day.dayName}\n${exercises}`;
          })
          .join("\n\n"),
        source: "forzaby",
        forzabyResourceType: "routine",
        forzabyRoutineId: routine.forzabyRoutineId,
        forzabySnapshot: routine,
        importedAt: Date.now(),
      });

      await loadItems();
      showToast({
        title: "Routine imported",
        description: `${routine.title} is now in the Bootcamp training library and ready to be assigned from there.`,
        type: "success",
      });
    } catch (error) {
      console.error("Import routine error:", error);
      showToast({
        title: "Import failed",
        description: "Could not import the Forzaby routine.",
        type: "error",
      });
    } finally {
      setImporting(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">Loading training items...</p>
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
            Training
          </h1>

          <p className="mt-3 max-w-3xl text-sm text-slate-600 md:text-base">
            Use Forzaby as the source library for exercises and premade routines, import them into Bootcamp training,
            then assign them to the client schedule from the Bootcamp library. Nothing from Forzaby goes straight to schedule.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard emoji="🧠" label="Forzaby exercises" value={String(forzabyExercises.length)} tone="blue" />
            <MetricCard emoji="📚" label="Forzaby routines" value={String(forzabyRoutines.length)} tone="blue" />
            <MetricCard emoji="🗂️" label="Bootcamp templates" value={String(items.length)} tone="slate" />
            <MetricCard emoji="🗓️" label="Schedule flow" value="Library first" tone="emerald" />
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-8">
        <div className="grid gap-8 xl:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
              Forzaby library
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Exercise imports
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Pull exercises into Bootcamp training. Once imported, they behave like local training content.
            </p>

            <div className="mt-6 grid gap-3 max-h-[560px] overflow-y-auto pr-1">
              {forzabyExercises.slice(0, 18).map((exercise) => (
                <div
                  key={exercise.forzabyExerciseId}
                  className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-white to-[#f8fbff] p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-lg">
                      {exercise.categoryName?.toLowerCase().includes("cardio") ? "🏃" : exercise.categoryName?.toLowerCase().includes("core") ? "🌀" : exercise.categoryName?.toLowerCase().includes("warm") ? "🔥" : "🏋️"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-950">{exercise.name}</p>
                        {exercise.isFeatured ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                            Popular
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {exercise.categoryName || "Exercise"} · {exercise.createdByDisplayName || "Forzaby"}
                      </p>
                      {exercise.muscles.length ? (
                        <p className="mt-2 text-xs text-slate-500">Targets {exercise.muscles.join(", ")}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => importExercise(exercise)}
                      disabled={Boolean(importing)}
                      className="rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-4 py-2 text-xs font-medium text-white shadow-sm transition hover:-translate-y-0.5 disabled:opacity-50"
                    >
                      {importing === `exercise-${exercise.forzabyExerciseId}` ? "Importing..." : "Import"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
              Forzaby routines
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Premade routine gallery
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Open a routine to preview the split, then import it into Bootcamp training. Assignment to schedule happens later from your Bootcamp templates.
            </p>

            <div className="mt-6 space-y-5">
              {ROUTINE_GALLERY_SECTIONS.map((section) => {
                const routines = groupedForzabyRoutines[section.key];
                if (!routines.length) return null;

                return (
                  <div key={section.key}>
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-lg">
                        {section.emoji}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{section.label}</p>
                        <p className="text-xs text-slate-500">{routines.length} routine{routines.length === 1 ? "" : "s"}</p>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      {routines.slice(0, 6).map((routine) => {
                        const isOpen = expandedRoutineId === routine.forzabyRoutineId;
                        return (
                          <div
                            key={routine.forzabyRoutineId}
                            className="overflow-hidden rounded-[22px] border border-slate-100 bg-gradient-to-br from-white to-[#f8fbff] shadow-sm"
                          >
                            <button
                              type="button"
                              onClick={() => setExpandedRoutineId((prev) => (prev === routine.forzabyRoutineId ? null : routine.forzabyRoutineId))}
                              className="w-full px-4 py-4 text-left transition hover:bg-slate-50/80"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-slate-950">{routine.title}</p>
                                  <p className="mt-1 text-sm text-slate-600">
                                    {routine.days.length} day{routine.days.length === 1 ? "" : "s"} · {routine.ownerDisplayName || "Forzaby Coach"}
                                  </p>
                                </div>
                                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                  {isOpen ? "Open" : "Preview"}
                                </span>
                              </div>
                            </button>

                            {isOpen ? (
                              <div className="border-t border-slate-100 px-4 py-4">
                                <div className="space-y-3">
                                  {routine.days.map((day) => (
                                    <div key={day.id || day.dayName} className="rounded-2xl border border-slate-100 bg-white px-3 py-3">
                                      <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-semibold text-slate-900">{day.dayName}</p>
                                        <span className="text-xs text-slate-500">{day.exercises.length} exercise{day.exercises.length === 1 ? "" : "s"}</span>
                                      </div>
                                      <div className="mt-2 space-y-1.5 text-sm text-slate-700">
                                        {day.exercises.slice(0, 5).map((exercise) => (
                                          <p key={exercise.id || `${day.dayName}-${exercise.exerciseId}`}>
                                            {exercise.snapshot?.name || `Exercise ${exercise.exerciseId}`}
                                            {exercise.sets ? ` · ${exercise.sets} sets` : ""}
                                            {exercise.reps ? ` · ${exercise.reps} reps` : ""}
                                          </p>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                <div className="mt-4 flex items-center justify-between gap-3">
                                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                    Import to Bootcamp training library
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => importRoutine(routine)}
                                    disabled={Boolean(importing)}
                                    className="rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-4 py-2 text-xs font-medium text-white shadow-sm transition hover:-translate-y-0.5 disabled:opacity-50"
                                  >
                                    {importing === `routine-${routine.forzabyRoutineId}` ? "Importing..." : "Import routine"}
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
            {editingId ? "Edit item" : "Create item"}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {editingId ? "Edit Training Item" : "Create Training Item"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Create Bootcamp-native templates or refine imported Forzaby content before it reaches the schedule.
          </p>
        </div>

        <div className="mt-6 grid gap-4">
          <FieldGroup label="Title" required>
            <input
              type="text"
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
            />
          </FieldGroup>

          <FieldGroup label="Description">
            <input
              type="text"
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
            />
          </FieldGroup>

          <FieldGroup label="Content">
            <textarea
              placeholder="Content"
              value={form.content}
              onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
              className="min-h-[200px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
            />
          </FieldGroup>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={saveItem}
              disabled={saving}
              className="rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-6 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : editingId ? "Save Changes" : "Create Item"}
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
            Bootcamp Training Library
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Search and manage the local training templates that Bootcamp can later assign to schedule.
          </p>
        </div>

        <div className="mt-6">
          <input
            type="text"
            placeholder="Search training items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe] md:max-w-xl"
          />
        </div>

        {filteredItems.length === 0 ? (
          <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 p-10 text-center text-sm text-slate-500">
            No training items found.
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
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-slate-950">{item.title}</h3>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${item.source === "forzaby" ? "border border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]" : "border border-slate-200 bg-slate-50 text-slate-600"}`}>
                        {item.source === "forzaby" ? "From Forzaby" : "Bootcamp"}
                      </span>
                      {item.forzabyResourceType ? (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {item.forzabyResourceType}
                        </span>
                      ) : null}
                    </div>
                    {item.description && <p className="mt-2 text-sm text-slate-600">{item.description}</p>}
                    {item.importedAt ? (
                      <p className="mt-2 text-xs text-slate-500">Imported from Forzaby and now editable in Bootcamp.</p>
                    ) : null}
                    {item.content && (
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.content}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
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

function MetricCard({
  emoji,
  label,
  value,
  tone,
}: {
  emoji: string;
  label: string;
  value: string;
  tone: "blue" | "slate" | "emerald";
}) {
  const toneClass =
    tone === "blue"
      ? "border-[#bfdbfe] bg-[#eff6ff]"
      : tone === "emerald"
      ? "border-emerald-200 bg-emerald-50"
      : "border-slate-200 bg-slate-50";

  return (
    <div className={`rounded-[24px] border p-4 ${toneClass}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/80 bg-white/90 text-lg shadow-sm">
          {emoji}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
        </div>
      </div>
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
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
        {required ? " *" : ""}
      </label>
      {children}
    </div>
  );
}
