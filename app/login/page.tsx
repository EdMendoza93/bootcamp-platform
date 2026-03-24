"use client";

import { Suspense } from "react";
import LoginContent from "./LoginContent";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(46,160,255,0.14),_transparent_32%),linear-gradient(to_bottom_right,_#f8fbff,_#eef6ff)] px-6 py-10">
          <div className="mx-auto flex min-h-[80vh] max-w-6xl items-center justify-center">
            <div className="w-full max-w-md rounded-[32px] border border-white/70 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
              <p className="text-sm font-medium text-slate-500">
                Loading login...
              </p>
            </div>
          </div>
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}