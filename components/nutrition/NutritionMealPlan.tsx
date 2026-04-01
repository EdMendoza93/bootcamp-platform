"use client";

import {
  MealItem,
  NutritionTotals,
  formatQuantity,
  roundNutritionValue,
} from "@/lib/nutrition";

export default function NutritionMealPlan({
  mealItems,
  totals,
  showLegacyContent,
}: {
  mealItems: MealItem[];
  totals?: NutritionTotals;
  showLegacyContent?: string;
}) {
  if (mealItems.length === 0 && !showLegacyContent?.trim()) {
    return null;
  }

  return (
    <div className="space-y-4">
      {mealItems.length > 0 ? (
        <>
          <div className="space-y-3">
            {mealItems.map((item, index) => (
              <div
                key={`${item.label}-${index}`}
                className="rounded-[20px] border border-slate-100 bg-white p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{item.label}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {formatQuantity(item.quantity)} {item.unit}
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                    {item.source}
                    {item.isManualOverride ? " + override" : ""}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-4">
                  <MacroCell label="Calories" value={String(roundNutritionValue(item.calories, 0))} />
                  <MacroCell label="Protein" value={`${roundNutritionValue(item.protein)}g`} />
                  <MacroCell label="Carbs" value={`${roundNutritionValue(item.carbs)}g`} />
                  <MacroCell label="Fat" value={`${roundNutritionValue(item.fat)}g`} />
                </div>

                {item.notes?.trim() ? (
                  <p className="mt-3 text-sm leading-6 text-slate-600">{item.notes}</p>
                ) : null}
              </div>
            ))}
          </div>

          {totals ? (
            <div className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                Totals
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <MacroCell label="Calories" value={String(roundNutritionValue(totals.calories, 0))} />
                <MacroCell label="Protein" value={`${roundNutritionValue(totals.protein)}g`} />
                <MacroCell label="Carbs" value={`${roundNutritionValue(totals.carbs)}g`} />
                <MacroCell label="Fat" value={`${roundNutritionValue(totals.fat)}g`} />
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {showLegacyContent?.trim() ? (
        <div className="whitespace-pre-line rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4 text-sm text-slate-800">
          {showLegacyContent}
        </div>
      ) : null}
    </div>
  );
}

function MacroCell({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
