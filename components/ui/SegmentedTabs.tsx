"use client";

type TabItem<T extends string> = {
  id: T;
  label: string;
};

export default function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-2 rounded-[22px] border border-slate-200 bg-white/90 p-1.5 shadow-sm">
      {items.map((item) => {
        const active = item.id === value;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
              active
                ? "bg-slate-950 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
