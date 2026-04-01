import { NextRequest, NextResponse } from "next/server";
import { FoodSearchResult, normalizeFoodName, normalizeMeasure } from "@/lib/nutrition";

type FdcNutrient = {
  nutrientName?: string;
  nutrientNumber?: string;
  value?: number;
};

type FdcFood = {
  description?: string;
  fdcId?: number;
  foodNutrients?: FdcNutrient[];
};

function pickNutrientValue(nutrients: FdcNutrient[] | undefined, candidates: string[]) {
  if (!nutrients?.length) return 0;

  const found = nutrients.find((nutrient) => {
    const nutrientName = (nutrient.nutrientName || "").toLowerCase();
    const nutrientNumber = (nutrient.nutrientNumber || "").toLowerCase();
    return candidates.includes(nutrientName) || candidates.includes(nutrientNumber);
  });

  return Number(found?.value || 0);
}

function mapFdcFood(food: FdcFood): FoodSearchResult | null {
  const name = food.description?.trim();
  if (!name || !food.fdcId) return null;

  const calories = pickNutrientValue(food.foodNutrients, [
    "energy",
    "energy (kcal)",
    "1008",
  ]);
  const protein = pickNutrientValue(food.foodNutrients, ["protein", "1003"]);
  const carbs = pickNutrientValue(food.foodNutrients, [
    "carbohydrate, by difference",
    "carbohydrate",
    "1005",
  ]);
  const fat = pickNutrientValue(food.foodNutrients, [
    "total lipid (fat)",
    "fatty acids, total saturated",
    "1004",
  ]);

  return {
    name,
    normalizedName: normalizeFoodName(name),
    aliases: [],
    source: "fdc",
    fdcId: food.fdcId,
    per100g: normalizeMeasure({ calories, protein, carbs, fat }),
  };
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.USDA_FDC_API_KEY;
  const query = request.nextUrl.searchParams.get("q")?.trim() || "";

  if (!query) {
    return NextResponse.json({ foods: [] satisfies FoodSearchResult[] });
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "USDA_FDC_API_KEY is not configured.", foods: [] satisfies FoodSearchResult[] },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          pageSize: 8,
          requireAllWords: false,
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "FDC search failed.", foods: [] satisfies FoodSearchResult[] },
        { status: response.status }
      );
    }

    const data = (await response.json()) as { foods?: FdcFood[] };
    const foods = (data.foods || [])
      .map(mapFdcFood)
      .filter(Boolean) as FoodSearchResult[];

    return NextResponse.json({ foods });
  } catch (error) {
    console.error("FDC search route error:", error);
    return NextResponse.json(
      { error: "FDC search failed.", foods: [] satisfies FoodSearchResult[] },
      { status: 500 }
    );
  }
}
