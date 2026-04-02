"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useToast } from "@/components/ui/ToastProvider";
import { fetchForzabyNutritionLibrary, type ForzabyFood, type ForzabyNutritionTemplate } from "@/lib/forzaby";
import NutritionMealPlan from "@/components/nutrition/NutritionMealPlan";
import {
  FoodEntry,
  FoodSearchResult,
  MealItem,
  NutritionTemplateRecord,
  NutritionUnit,
  buildFoodEntryFromMealItem,
  buildMealItemFromFood,
  calculateTotals,
  formatQuantity,
  normalizeMeasure,
  parseMealItemInput,
  roundNutritionValue,
  searchFoods,
} from "@/lib/nutrition";

type BuilderDraft = {
  label: string;
  quantity: number;
  unit: NutritionUnit;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  notes: string;
  source: MealItem["source"];
  foodId?: string;
  isManualOverride?: boolean;
};

const EMPTY_FORM = {
  title: "",
  description: "",
  mealItems: [] as MealItem[],
};

export default function AdminNutritionPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [builderLoading, setBuilderLoading] = useState(false);
  const [items, setItems] = useState<NutritionTemplateRecord[]>([]);
  const [foods, setFoods] = useState<FoodEntry[]>([]);
  const [forzabyFoods, setForzabyFoods] = useState<ForzabyFood[]>([]);
  const [forzabyMenus, setForzabyMenus] = useState<ForzabyNutritionTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingMealIndex, setEditingMealIndex] = useState<number | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [builderInput, setBuilderInput] = useState("");
  const [builderQuery, setBuilderQuery] = useState("");
  const [suggestions, setSuggestions] = useState<FoodSearchResult[]>([]);
  const [suggestionSource, setSuggestionSource] = useState<"internal" | "manual" | "">("");
  const [selectedFood, setSelectedFood] = useState<FoodSearchResult | null>(null);
  const [draft, setDraft] = useState<BuilderDraft | null>(null);
  const [expandedForzabyMenuId, setExpandedForzabyMenuId] = useState<string | null>(null);

  const { showToast } = useToast();

  const totals = useMemo(() => calculateTotals(form.mealItems), [form.mealItems]);

const groupedForzabyMenus = useMemo(() => {
  const groups: Record<"breakfast" | "snack" | "lunch" | "dinner", ForzabyNutritionTemplate[]> = {
    breakfast: [],
    snack: [],
    lunch: [],
    dinner: [],
  };

  for (const menu of forzabyMenus) {
    const mealGroup = classifyForzabyMenu(menu);
    groups[mealGroup].push(menu);
  }

  return groups;
}, [forzabyMenus]);

  const loadItems = async () => {
    const snapshot = await getDocs(collection(db, "nutritionTemplates"));

    const data = snapshot.docs
      .map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<NutritionTemplateRecord, "id">),
      }))
      .sort((a, b) => (a.title || "").localeCompare(b.title || "")) as NutritionTemplateRecord[];

    setItems(data);
  };

  const loadFoods = async () => {
    const snapshot = await getDocs(collection(db, "foods"));

    const data = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...(docItem.data() as Omit<FoodEntry, "id">),
    })) as FoodEntry[];

    setFoods(data);
  };

  useEffect(() => {
    const init = async () => {
      try {
        const [, , forzabyLibrary] = await Promise.all([loadItems(), loadFoods(), fetchForzabyNutritionLibrary()]);
        setForzabyFoods(forzabyLibrary.data?.foods || []);
        setForzabyMenus(forzabyLibrary.data?.templates || []);
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

    void init();
  }, [showToast]);

  const filteredItems = useMemo(() => {
    const queryText = search.trim().toLowerCase();

    return items.filter((item) => {
      const title = (item.title || "").toLowerCase();
      const description = (item.description || "").toLowerCase();
      const content = (item.content || "").toLowerCase();
      const mealLabels = (item.mealItems || [])
        .map((mealItem) => mealItem.label.toLowerCase())
        .join(" ");

      return (
        !queryText ||
        title.includes(queryText) ||
        description.includes(queryText) ||
        content.includes(queryText) ||
        mealLabels.includes(queryText)
      );
    });
  }, [items, search]);

  const resetBuilder = () => {
    setBuilderInput("");
    setBuilderQuery("");
    setSuggestions([]);
    setSuggestionSource("");
    setSelectedFood(null);
    setDraft(null);
    setEditingMealIndex(null);
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    resetBuilder();
  };

  const saveItem = async () => {
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      mealItems: form.mealItems,
      totals,
      updatedAt: serverTimestamp(),
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

      await Promise.all([loadItems(), loadFoods()]);
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

  const startEdit = (item: NutritionTemplateRecord) => {
    setEditingId(item.id);
    setForm({
      title: item.title || "",
      description: item.description || "",
      mealItems: item.mealItems || [],
    });
    resetBuilder();
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

  const beginManualDraft = (rawInput?: string) => {
    const parsed = parseMealItemInput(rawInput || builderInput);
    const nextLabel = parsed.query || rawInput?.trim() || "Custom food";

    setBuilderQuery(parsed.query || nextLabel);
    setSuggestions([]);
    setSuggestionSource("manual");
    setSelectedFood(null);
    setDraft({
      label: nextLabel,
      quantity: parsed.quantity,
      unit: parsed.unit,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      notes: "",
      source: "manual",
      isManualOverride: true,
    });
  };

  const searchFoodSuggestions = async () => {
    const parsed = parseMealItemInput(builderInput);
    const query = parsed.query.trim();

    if (!query) {
      showToast({
        title: "Food name required",
        description: "Type a food such as chicken 200g before searching.",
        type: "error",
      });
      return;
    }

    setBuilderLoading(true);
    setBuilderQuery(query);
    setSelectedFood(null);
    setDraft(null);

    try {
      const internalMatches = searchFoods([...foods, ...forzabyFoods], query).slice(0, 8);

      if (internalMatches.length > 0) {
        setSuggestions(internalMatches);
        setSuggestionSource("internal");
        return;
      }
      beginManualDraft(query);
      showToast({
        title: "No food match found",
        description: "Create a manual custom food or refine the search.",
        type: "info",
      });
    } catch (error) {
      console.error("Search food suggestions error:", error);
      setSuggestions([]);
      setSuggestionSource("manual");
      beginManualDraft(query);
      showToast({
        title: "Search unavailable",
        description: "Forzaby nutrition suggestions could not be completed. You can still create a manual food.",
        type: "error",
      });
    } finally {
      setBuilderLoading(false);
    }
  };

  const selectSuggestion = (food: FoodSearchResult) => {
    const parsed = parseMealItemInput(builderInput);
    const nextDraft = buildMealItemFromFood({
      food,
      quantity: parsed.quantity,
      unit: parsed.unit,
      label: food.name,
    });

    setSelectedFood(food);
    setSuggestions([]);
    setDraft({
      label: nextDraft.label,
      quantity: nextDraft.quantity,
      unit: nextDraft.unit,
      calories: nextDraft.calories,
      protein: nextDraft.protein,
      carbs: nextDraft.carbs,
      fat: nextDraft.fat,
      notes: nextDraft.notes || "",
      source: nextDraft.source,
      foodId: food.id,
      isManualOverride: false,
    });
  };

  const startEditMealItem = (mealItem: MealItem, index: number) => {
    setEditingMealIndex(index);
    setBuilderInput(`${mealItem.label} ${formatQuantity(mealItem.quantity)}${mealItem.unit}`);
    setBuilderQuery(mealItem.label);
    setSuggestions([]);
    setSuggestionSource(mealItem.source === "manual" ? "manual" : "internal");
    setSelectedFood(null);
    setDraft({
      label: mealItem.label,
      quantity: mealItem.quantity,
      unit: mealItem.unit,
      calories: mealItem.calories,
      protein: mealItem.protein,
      carbs: mealItem.carbs,
      fat: mealItem.fat,
      notes: mealItem.notes || "",
      source: mealItem.source,
      foodId: mealItem.foodId,
      isManualOverride: mealItem.isManualOverride,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeMealItem = (index: number) => {
    setForm((prev) => ({
      ...prev,
      mealItems: prev.mealItems.filter((_, itemIndex) => itemIndex !== index),
    }));

    if (editingMealIndex === index) {
      resetBuilder();
    }
  };

const persistFoodIfNeeded = async (item: BuilderDraft) => {
  const existingBootcampFoodById = selectedFood?.id
    ? foods.find((food) => food.id === selectedFood.id)
    : null;

  if (existingBootcampFoodById?.id) {
    return existingBootcampFoodById.id;
  }

  if (selectedFood) {
    const existingFood = foods.find(
      (food) => food.normalizedName === selectedFood.normalizedName
    );

    if (existingFood?.id) {
      return existingFood.id;
    }

    const docRef = await addDoc(collection(db, "foods"), {
      ...selectedFood,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });

    return docRef.id;
  }

  if (item.source === "manual") {
    const manualFood = buildFoodEntryFromMealItem({
      name: item.label,
      quantity: item.quantity,
      unit: item.unit,
      measure: normalizeMeasure({
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
      }),
      source: "manual",
    });

    const existingManualFood = foods.find(
      (food) => food.normalizedName === manualFood.normalizedName
    );

    if (existingManualFood?.id) {
      await updateDoc(doc(db, "foods", existingManualFood.id), {
        ...manualFood,
        updatedAt: serverTimestamp(),
      });
      return existingManualFood.id;
    }

    const docRef = await addDoc(collection(db, "foods"), {
      ...manualFood,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }

  return item.foodId;
};

  const saveMealItemToTemplate = async () => {
    if (!draft) {
      showToast({
        title: "No meal item ready",
        description: "Search and select a food first, or create a manual one.",
        type: "error",
      });
      return;
    }

    if (!draft.label.trim()) {
      showToast({
        title: "Food label required",
        description: "Add a label for the meal item.",
        type: "error",
      });
      return;
    }

    if (!draft.quantity || draft.quantity <= 0) {
      showToast({
        title: "Quantity required",
        description: "Use a quantity greater than zero.",
        type: "error",
      });
      return;
    }

    setBuilderLoading(true);

    try {
      const foodId = await persistFoodIfNeeded(draft);
      const nextItem: MealItem = {
        foodId,
        label: draft.label.trim(),
        quantity: roundNutritionValue(draft.quantity, 2),
        unit: draft.unit,
        calories: roundNutritionValue(draft.calories, 0),
        protein: roundNutritionValue(draft.protein),
        carbs: roundNutritionValue(draft.carbs),
        fat: roundNutritionValue(draft.fat),
        source: draft.source,
        isManualOverride:
          draft.source === "manual" || Boolean(draft.isManualOverride),
        notes: draft.notes.trim(),
      };

      setForm((prev) => {
        const mealItems = [...prev.mealItems];
        if (editingMealIndex !== null) {
          mealItems[editingMealIndex] = nextItem;
        } else {
          mealItems.push(nextItem);
        }

        return { ...prev, mealItems };
      });

      await loadFoods();
      resetBuilder();
    } catch (error) {
      console.error("Save meal item error:", error);
      showToast({
        title: "Could not save meal item",
        description: "Please try again.",
        type: "error",
      });
    } finally {
      setBuilderLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">
          Loading nutrition items...
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
            Nutrition
          </h1>

          <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
            Manage reusable nutrition content for the bootcamp.
          </p>
        </div>
      </section>

<section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-8">
  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
        Forzaby suggestions
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
        Premade menu gallery
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        Browse small premade menu cards by meal slot. Open one to preview it, then import a local editable copy into Bootcamp.
      </p>
    </div>

    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      {forzabyMenus.length} menus
    </div>
  </div>

  <div className="mt-6 space-y-5">
    {([
      ["breakfast", "Breakfast", "🍳"],
      ["snack", "Snack", "🍎"],
      ["lunch", "Lunch", "🥗"],
      ["dinner", "Dinner", "🍽️"],
    ] as const).map(([key, label, emoji]) => {
      const menus = groupedForzabyMenus[key];
      if (!menus.length) return null;

      return (
        <div key={key}>
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-lg">
              {emoji}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">{label}</p>
              <p className="text-xs text-slate-500">{menus.length} premade menu{menus.length === 1 ? "" : "s"}</p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {menus.slice(0, 6).map((menu) => {
              const isOpen = expandedForzabyMenuId === menu.id;
              return (
                <div
                  key={menu.id}
                  className="overflow-hidden rounded-[22px] border border-slate-100 bg-gradient-to-br from-white to-[#f8fbff] shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedForzabyMenuId((prev) => (prev === menu.id ? null : menu.id))}
                    className="w-full px-4 py-4 text-left transition hover:bg-slate-50/80"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">{menu.title || "Untitled menu"}</p>
                        {menu.description ? (
                          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{menu.description}</p>
                        ) : null}
                      </div>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {isOpen ? "Open" : "Preview"}
                      </span>
                    </div>
                  </button>

                  {isOpen ? (
                    <div className="border-t border-slate-100 px-4 py-4">
                      {menu.mealItems?.length ? (
                        <div className="space-y-2">
                          {menu.mealItems.slice(0, 6).map((item, index) => (
                            <div key={`${menu.id}-${item.label}-${index}`} className="rounded-2xl border border-slate-100 bg-white px-3 py-3 text-sm text-slate-700">
                              <div className="flex items-center justify-between gap-3">
                                <p className="font-medium text-slate-900">{item.label}</p>
                                <span className="text-xs text-slate-500">{item.calories} kcal</span>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">{item.quantity} {item.unit}</p>
                            </div>
                          ))}
                        </div>
                      ) : menu.content ? (
                        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{menu.content}</p>
                      ) : (
                        <p className="text-sm text-slate-500">No preview content available.</p>
                      )}

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          {menu.totals?.calories || 0} kcal total
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await addDoc(collection(db, "nutritionTemplates"), {
                                title: menu.title || "Untitled menu",
                                description: menu.description || "Imported from Forzaby",
                                content: menu.content || "",
                                mealItems: menu.mealItems || [],
                                totals: menu.totals,
                                source: "forzaby",
                                forzabyMenuId: menu.id,
                                forzabySnapshot: menu,
                                createdAt: serverTimestamp(),
                                updatedAt: serverTimestamp(),
                              });
                              await loadItems();
                              showToast({
                                title: "Menu imported",
                                description: `${menu.title || "Menu"} is now editable inside Bootcamp.`,
                                type: "success",
                              });
                            } catch (error) {
                              console.error("Import Forzaby menu error:", error);
                              showToast({
                                title: "Import failed",
                                description: "Could not import the Forzaby menu.",
                                type: "error",
                              });
                            }
                          }}
                          className="rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-4 py-2 text-xs font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                        >
                          Import to Bootcamp
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
</section>

      <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
            {editingId ? "Edit item" : "Create item"}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {editingId ? "Edit Nutrition Item" : "Create Nutrition Item"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Build nutrition templates with structured meal items and automatic totals.
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
        </div>

        <div className="mt-8 rounded-[24px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                Structured meal builder
              </p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">
                Meal Items
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Search Bootcamp foods first, then fall back to Forzaby suggestions.
              </p>
            </div>

            {form.mealItems.length > 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                {form.mealItems.length} meal item{form.mealItems.length === 1 ? "" : "s"}
              </div>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
            <input
              type="text"
              placeholder='Type "chicken 200g" or "rice 150g"'
              value={builderInput}
              onChange={(e) => setBuilderInput(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
            />
            <button
              type="button"
              onClick={searchFoodSuggestions}
              disabled={builderLoading}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {builderLoading ? "Searching..." : "Search food"}
            </button>
            <button
              type="button"
              onClick={() => beginManualDraft()}
              disabled={builderLoading}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:shadow-md disabled:opacity-50"
            >
              Manual food
            </button>
          </div>

          {builderQuery ? (
            <p className="mt-3 text-sm text-slate-500">
              Parsed query: <span className="font-medium text-slate-700">{builderQuery}</span>
              {suggestionSource ? ` · source: ${suggestionSource}` : ""}
            </p>
          ) : null}

          {suggestions.length > 0 ? (
            <div className="mt-5 overflow-hidden rounded-[20px] border border-slate-200 bg-white">
              {suggestions.map((food) => (
                <button
                  key={`${food.source}-${food.id || food.fdcId || food.name}`}
                  type="button"
                  onClick={() => selectSuggestion(food)}
                  className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 ${
                    selectedFood?.fdcId === food.fdcId && selectedFood?.name === food.name
                      ? "bg-[#eff6ff]"
                      : "bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{food.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {foods.some((item) => item.id === food.id) ? "Bootcamp food library" : "Forzaby library"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-slate-400">
                    Select
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {draft ? (
            <div className="mt-5 rounded-[16px] border border-[#bfdbfe] bg-white p-2.5 shadow-sm">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#1d4ed8]">
                      {editingMealIndex !== null ? "Edit meal item" : "Ready to add"}
                    </p>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      {draft.source}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-[minmax(0,1fr)_92px_86px]">
                    <input
                      type="text"
                      value={draft.label}
                      onChange={(e) =>
                        setDraft((prev) => (prev ? { ...prev, label: e.target.value } : prev))
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.quantity}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev ? { ...prev, quantity: Number(e.target.value || 0) } : prev
                        )
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                    />
                    <select
                      value={draft.unit}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev ? { ...prev, unit: e.target.value as NutritionUnit } : prev
                        )
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                    >
                      <option value="g">g</option>
                      <option value="ml">ml</option>
                      <option value="unit">unit</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={saveMealItemToTemplate}
                    disabled={builderLoading}
                    className="rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
                  >
                    {builderLoading
                      ? "Saving..."
                      : editingMealIndex !== null
                      ? "Update"
                      : "Add"}
                  </button>
                  <button
                    type="button"
                    onClick={resetBuilder}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="mt-2.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <MacroInput
                  label="Calories"
                  value={draft.calories}
                  onChange={(value) =>
                    setDraft((prev) =>
                      prev
                        ? { ...prev, calories: value, isManualOverride: true }
                        : prev
                    )
                  }
                />
                <MacroInput
                  label="Protein"
                  value={draft.protein}
                  onChange={(value) =>
                    setDraft((prev) =>
                      prev ? { ...prev, protein: value, isManualOverride: true } : prev
                    )
                  }
                />
                <MacroInput
                  label="Carbs"
                  value={draft.carbs}
                  onChange={(value) =>
                    setDraft((prev) =>
                      prev ? { ...prev, carbs: value, isManualOverride: true } : prev
                    )
                  }
                />
                <MacroInput
                  label="Fat"
                  value={draft.fat}
                  onChange={(value) =>
                    setDraft((prev) =>
                      prev ? { ...prev, fat: value, isManualOverride: true } : prev
                    )
                  }
                />
              </div>

              <textarea
                rows={1}
                value={draft.notes}
                onChange={(e) =>
                  setDraft((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
                }
                placeholder="Optional notes"
                className="mt-2 min-h-[36px] w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </div>
          ) : null}

          {form.mealItems.length > 0 ? (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-lg font-semibold text-slate-950">
                  Template meal items
                </h4>
                <div className="text-sm text-slate-500">
                  {roundNutritionValue(totals.calories, 0)} kcal total
                </div>
              </div>

              <div className="grid gap-3">
                {form.mealItems.map((mealItem, index) => (
                  <div
                    key={`${mealItem.label}-${index}`}
                    className="rounded-[16px] border border-slate-200 bg-white p-3"
                  >
                    <div className="flex flex-col gap-2.5 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {mealItem.label}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatQuantity(mealItem.quantity)} {mealItem.unit}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEditMealItem(mealItem, index)}
                          className="rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => removeMealItem(index)}
                          className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 shadow-sm transition hover:shadow-md"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="mt-2.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <MacroBadge label="Cal" value={String(mealItem.calories)} />
                      <MacroBadge label="P" value={`${mealItem.protein}g`} />
                      <MacroBadge label="C" value={`${mealItem.carbs}g`} />
                      <MacroBadge label="F" value={`${mealItem.fat}g`} />
                    </div>
                  </div>
                ))}
              </div>

            </div>
          ) : (
            <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 bg-white/70 p-6 text-sm text-slate-500">
              No structured meal items yet. Legacy text content will continue to work as-is.
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
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
      </section>

      <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
            Library
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            Nutrition Items
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Search and manage your saved nutrition templates.
          </p>
        </div>

        <div className="mt-6">
          <input
            type="text"
            placeholder="Search nutrition items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe] md:max-w-xl"
          />
        </div>

        {filteredItems.length === 0 ? (
          <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 p-10 text-center text-sm text-slate-500">
            No nutrition items found.
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

                    {item.mealItems?.length ? (
                      <div className="mt-4">
                        <NutritionMealPlan
                          mealItems={item.mealItems}
                          totals={item.totals}
                        />
                      </div>
                    ) : null}
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

function MacroInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        type="number"
        min="0"
        step="0.1"
        value={value}
        onChange={(e) => onChange(Number(e.target.value || 0))}
        className="w-20 border-0 bg-transparent p-0 text-right text-sm text-slate-900 outline-none"
      />
    </label>
  );
}

function MacroBadge({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function classifyForzabyMenu(menu: ForzabyNutritionTemplate) {
  const haystack = [
    menu.title,
    menu.description,
    ...(menu.tags || []),
    ...(menu.mealItems || []).map((item) => item.label),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (haystack.includes("breakfast") || haystack.includes("omelet") || haystack.includes("egg") || haystack.includes("morning")) {
    return "breakfast" as const;
  }

  if (haystack.includes("snack") || haystack.includes("yogurt") || haystack.includes("bar") || haystack.includes("fruit")) {
    return "snack" as const;
  }

  if (haystack.includes("dinner") || haystack.includes("evening") || haystack.includes("supper") || haystack.includes("salmon") || haystack.includes("steak")) {
    return "dinner" as const;
  }

  return "lunch" as const;
}

