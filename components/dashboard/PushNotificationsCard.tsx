"use client";

import { usePushNotifications } from "@/components/providers/PushNotificationsProvider";

export default function PushNotificationsCard() {
  const { pushState, enablePush, infoMessage } = usePushNotifications();

  const showButton = pushState === "ready-to-enable" || pushState === "error";

  return (
    <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Push notifications</h2>
          <p className="mt-2 text-sm text-slate-600">{infoMessage}</p>
          {pushState === "ios-needs-home-screen" && (
            <p className="mt-2 text-xs text-slate-500">
              iOS limitation: install this app to your Home Screen first. Push support also depends on iOS and browser capabilities.
            </p>
          )}
        </div>

        {showButton && (
          <button
            onClick={enablePush}
            className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md"
          >
            Enable push
          </button>
        )}

        {pushState === "enabled" && (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
            Enabled
          </span>
        )}
      </div>
    </section>
  );
}
