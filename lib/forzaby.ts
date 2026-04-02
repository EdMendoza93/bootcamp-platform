const FORZABY_BASE_URL =
  process.env.NEXT_PUBLIC_FORZABY_BASE_URL || "http://127.0.0.1:3005";

type FetchResult<T> = {
  ok?: boolean;
  error?: string;
  data?: T;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, { ...init, cache: "no-store" });
  const data = (await response.json()) as FetchResult<T> & Record<string, unknown>;

  if (!response.ok || data.ok === false) {
    throw new Error(
      (typeof data.error === "string" && data.error) || "Forzaby request failed"
    );
  }

  return data;
}

export type ForzabyExerciseSnapshot = {
  source: "forzaby";
  forzabyExerciseId: number;
  visibility: "private" | "public";
  createdByUserId?: string | null;
  createdByDisplayName?: string;
  name: string;
  description?: string;
  categoryName?: string;
  muscles: string[];
  musclesSecondary: string[];
  equipment: string[];
  imageUrl?: string;
  primaryVideo?: string;
  tags: string[];
  isCustom: boolean;
  isFeatured: boolean;
};

export type ForzabyRoutineExerciseSnapshot = {
  id?: string;
  order?: number;
  exerciseId: number;
  sets?: number;
  reps?: number;
  notes?: string;
  snapshot?: {
    name: string;
    categoryName?: string;
    muscles?: string[];
    equipment?: string[];
  } | null;
};

export type ForzabyRoutineSnapshot = {
  source: "forzaby";
  forzabyRoutineId: string;
  ownerUserId: string;
  ownerDisplayName?: string;
  visibility: "private" | "public" | "unlisted";
  title: string;
  description?: string;
  goal?: string | null;
  durationWeeks?: number | null;
  tags: string[];
  importedAt: number;
  days: Array<{
    id?: string;
    order?: number;
    dayName: string;
    exercises: ForzabyRoutineExerciseSnapshot[];
  }>;
};

export type ForzabyFood = {
  id?: string;
  name: string;
  normalizedName: string;
  aliases?: string[];
  source: "manual" | "fdc" | "custom";
  per100g?: { calories: number; protein: number; carbs: number; fat: number };
  per100ml?: { calories: number; protein: number; carbs: number; fat: number };
  perUnit?: { calories: number; protein: number; carbs: number; fat: number };
};

export type ForzabyNutritionTemplate = {
  id: string;
  title?: string;
  description?: string;
  content?: string;
  mealItems?: Array<{
    foodId?: string;
    label: string;
    quantity: number;
    unit: "g" | "ml" | "unit";
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    source: "internal" | "fdc" | "manual";
    isManualOverride?: boolean;
    notes?: string;
  }>;
  totals?: { calories: number; protein: number; carbs: number; fat: number };
  ownerUserId?: string;
  ownerDisplayName?: string;
  visibility?: "private" | "public";
  tags?: string[];
};

export async function fetchForzabyTrainingExercises(viewerUserId?: string) {
  const params = new URLSearchParams();
  if (viewerUserId) params.set("viewerUserId", viewerUserId);
  return readJson<{
    allVisibleExercises: ForzabyExerciseSnapshot[];
    myPrivateExercises: ForzabyExerciseSnapshot[];
    myPublicExercises: ForzabyExerciseSnapshot[];
    publicExercises: ForzabyExerciseSnapshot[];
    snapshots: ForzabyExerciseSnapshot[];
  }>(`${FORZABY_BASE_URL}/api/internal/bootcamp/training/exercises?${params.toString()}`);
}

export async function fetchForzabyTrainingRoutines(viewerUserId?: string) {
  const params = new URLSearchParams();
  if (viewerUserId) params.set("viewerUserId", viewerUserId);
  return readJson<{
    allVisibleRoutines: ForzabyRoutineSnapshot[];
    myRoutines: ForzabyRoutineSnapshot[];
    publicRoutines: ForzabyRoutineSnapshot[];
    snapshots: ForzabyRoutineSnapshot[];
  }>(`${FORZABY_BASE_URL}/api/internal/bootcamp/training/routines?${params.toString()}`);
}

export async function fetchForzabyNutritionLibrary() {
  return readJson<{
    templates: ForzabyNutritionTemplate[];
    foods: ForzabyFood[];
  }>(`${FORZABY_BASE_URL}/api/internal/nutrition`);
}
