export type NutritionUnit = "g" | "ml" | "unit";
export type MealItemSource = "internal" | "fdc" | "manual";
export type FoodEntrySource = "manual" | "fdc" | "custom";

export type NutritionMeasure = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type MealItem = {
  foodId?: string;
  label: string;
  quantity: number;
  unit: NutritionUnit;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: MealItemSource;
  isManualOverride?: boolean;
  notes?: string;
};

export type NutritionTotals = NutritionMeasure;

export type FoodEntry = {
  id?: string;
  name: string;
  normalizedName: string;
  aliases?: string[];
  source: FoodEntrySource;
  fdcId?: number;
  per100g?: NutritionMeasure;
  per100ml?: NutritionMeasure;
  perUnit?: NutritionMeasure;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type FoodSearchResult = Omit<FoodEntry, "createdAt" | "updatedAt">;

export type NutritionTemplateSnapshot = {
  title?: string;
  description?: string;
  content?: string;
  mealItems?: MealItem[];
  totals?: NutritionTotals;
};

export type NutritionTemplateRecord = NutritionTemplateSnapshot & {
  id: string;
  updatedAt?: unknown;
};

export type ParsedMealItemInput = {
  raw: string;
  query: string;
  quantity: number;
  unit: NutritionUnit;
};

export function normalizeFoodName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMealItemInput(input: string): ParsedMealItemInput {
  const raw = input.trim();
  const match = raw.match(
    /^(.*?)(?:\s+(\d+(?:[.,]\d+)?)\s*(g|gr|gram|grams|ml|milliliter|milliliters|unit|units|u))?$/i
  );

  const quantity = Number(match?.[2]?.replace(",", ".") || "1");
  const normalizedUnit = (match?.[3] || "unit").toLowerCase();
  const query = (match?.[1] || raw).trim();

  let unit: NutritionUnit = "unit";
  if (normalizedUnit === "g" || normalizedUnit === "gr" || normalizedUnit === "gram" || normalizedUnit === "grams") {
    unit = "g";
  } else if (
    normalizedUnit === "ml" ||
    normalizedUnit === "milliliter" ||
    normalizedUnit === "milliliters"
  ) {
    unit = "ml";
  }

  return {
    raw,
    query,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    unit,
  };
}

export function roundNutritionValue(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number.isFinite(value) ? value : 0) * factor) / factor;
}

export function normalizeMeasure(input?: Partial<NutritionMeasure>): NutritionMeasure {
  return {
    calories: roundNutritionValue(Number(input?.calories || 0), 0),
    protein: roundNutritionValue(Number(input?.protein || 0)),
    carbs: roundNutritionValue(Number(input?.carbs || 0)),
    fat: roundNutritionValue(Number(input?.fat || 0)),
  };
}

export function calculateTotals(mealItems: MealItem[]): NutritionTotals {
  return mealItems.reduce<NutritionTotals>(
    (acc, item) => ({
      calories: roundNutritionValue(acc.calories + Number(item.calories || 0), 0),
      protein: roundNutritionValue(acc.protein + Number(item.protein || 0)),
      carbs: roundNutritionValue(acc.carbs + Number(item.carbs || 0)),
      fat: roundNutritionValue(acc.fat + Number(item.fat || 0)),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

function getMeasureForUnit(food: FoodSearchResult | FoodEntry, unit: NutritionUnit) {
  if (unit === "g") {
    return {
      basis: 100,
      measure: food.per100g || food.perUnit || food.per100ml,
    };
  }

  if (unit === "ml") {
    return {
      basis: 100,
      measure: food.per100ml || food.per100g || food.perUnit,
    };
  }

  return {
    basis: 1,
    measure: food.perUnit || food.per100g || food.per100ml,
  };
}

export function buildMealItemFromFood(params: {
  food: FoodSearchResult | FoodEntry;
  quantity: number;
  unit: NutritionUnit;
  label?: string;
  notes?: string;
  isManualOverride?: boolean;
}): MealItem {
  const { food, quantity, unit, label, notes, isManualOverride } = params;
  const { basis, measure } = getMeasureForUnit(food, unit);
  const safeMeasure = normalizeMeasure(measure);
  const factor = unit === "unit" ? quantity / basis : quantity / basis;

  return {
    foodId: food.id,
    label: label?.trim() || food.name,
    quantity,
    unit,
    calories: roundNutritionValue(safeMeasure.calories * factor, 0),
    protein: roundNutritionValue(safeMeasure.protein * factor),
    carbs: roundNutritionValue(safeMeasure.carbs * factor),
    fat: roundNutritionValue(safeMeasure.fat * factor),
    source: food.source === "fdc" ? "fdc" : "internal",
    isManualOverride,
    notes: notes?.trim() || "",
  };
}

export function buildFoodEntryFromMealItem(params: {
  name: string;
  quantity: number;
  unit: NutritionUnit;
  measure: NutritionMeasure;
  source: FoodEntrySource;
}): FoodSearchResult {
  const { name, quantity, unit, measure, source } = params;
  const safeQuantity = quantity > 0 ? quantity : 1;
  const normalizedMeasure = normalizeMeasure(measure);

  const perUnitMeasure =
    unit === "unit"
      ? normalizedMeasure
      : {
          calories: roundNutritionValue((normalizedMeasure.calories / safeQuantity) * 1, 0),
          protein: roundNutritionValue(normalizedMeasure.protein / safeQuantity),
          carbs: roundNutritionValue(normalizedMeasure.carbs / safeQuantity),
          fat: roundNutritionValue(normalizedMeasure.fat / safeQuantity),
        };

  const perHundredMeasure =
    unit === "unit"
      ? undefined
      : {
          calories: roundNutritionValue((normalizedMeasure.calories / safeQuantity) * 100, 0),
          protein: roundNutritionValue((normalizedMeasure.protein / safeQuantity) * 100),
          carbs: roundNutritionValue((normalizedMeasure.carbs / safeQuantity) * 100),
          fat: roundNutritionValue((normalizedMeasure.fat / safeQuantity) * 100),
        };

  return {
    name: name.trim(),
    normalizedName: normalizeFoodName(name),
    aliases: [],
    source,
    ...(unit === "g" ? { per100g: perHundredMeasure } : {}),
    ...(unit === "ml" ? { per100ml: perHundredMeasure } : {}),
    ...(unit === "unit" ? { perUnit: perUnitMeasure } : {}),
  };
}

export function createNutritionTemplateSnapshot(
  template?: NutritionTemplateSnapshot | null
): NutritionTemplateSnapshot | undefined {
  if (!template) return undefined;

  return {
    title: template.title || "",
    description: template.description || "",
    content: template.content || "",
    mealItems: template.mealItems?.map((item) => ({
      ...item,
      notes: item.notes || "",
    })) || [],
    totals: template.totals
      ? normalizeMeasure(template.totals)
      : calculateTotals(template.mealItems || []),
  };
}

export function hasStructuredMealItems(template?: NutritionTemplateSnapshot | null) {
  return Boolean(template?.mealItems && template.mealItems.length > 0);
}

export function searchFoods(foods: FoodEntry[], query: string) {
  const normalizedQuery = normalizeFoodName(query);
  if (!normalizedQuery) return [] as FoodEntry[];

  return [...foods]
    .map((food) => {
      const haystack = [
        food.name,
        food.normalizedName,
        ...(food.aliases || []),
      ]
        .filter(Boolean)
        .join(" ");
      const normalizedHaystack = normalizeFoodName(haystack);

      let score = 0;
      if (food.normalizedName === normalizedQuery) score += 100;
      if (food.normalizedName.startsWith(normalizedQuery)) score += 60;
      if (normalizedHaystack.includes(normalizedQuery)) score += 30;
      if ((food.aliases || []).some((alias) => normalizeFoodName(alias) === normalizedQuery)) {
        score += 50;
      }

      return { food, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name))
    .map((item) => item.food);
}

export function formatQuantity(quantity: number) {
  return Number.isInteger(quantity) ? String(quantity) : String(roundNutritionValue(quantity, 2));
}
