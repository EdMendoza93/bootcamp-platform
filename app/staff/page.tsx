"use client";

import Link from "next/link";

export default function StaffOverviewPage() {
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
        <div className="bg-gradient-to-r from-[#071120] via-[#123b76] to-[#2EA0FF] p-[1px]">
          <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
        </div>

        <div className="relative overflow-hidden p-6 md:p-8">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#2EA0FF]/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-emerald-300/10 blur-3xl" />

          <div className="relative">
            <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
              Staff
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Staff Workspace
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-600 md:text-base">
              Coaches and nutritionists can see all clients and contribute to the shared schedule, while staying limited to their own discipline.
            </p>

            <div className="mt-6">
              <Link
                href="/staff/schedule"
                className="inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Open Staff Schedule
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <InfoCard
          title="Coach"
          body="Can create and edit training schedule items for any client."
        />
        <InfoCard
          title="Nutritionist"
          body="Can create and edit nutrition schedule items for any client."
        />
        <InfoCard
          title="Admin"
          body="Keeps full control over all schedule types, clients, and operations."
        />
      </section>
    </div>
  );
}

function InfoCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/80 bg-white/95 p-6 shadow-[0_14px_40px_rgba(15,23,42,0.07)]">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}
