"use client";

import { usePushNotifications } from "@/components/providers/PushNotificationsProvider";

export default function PushNotificationsCard() {
  const { pushState, enablePush, infoMessage } = usePushNotifications();
  const showButtonCard = pushState === "ready" || pushState === "error";

  if (pushState === "enabled") {
    return (
      <section className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
        <p className="text-sm font-medium text-emerald-700">
          Push notifications are enabled.
        </p>
      </section>
    );
  }

  if (!showButtonCard) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Push notifications</h2>
          <p className="mt-2 text-sm text-slate-600">{infoMessage}</p>
        </div>

        <button
          onClick={enablePush}
          className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md"
        >
          Enable push
        </button>
      </div>
    </section>
  );
}
