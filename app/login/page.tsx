"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  GoogleAuthProvider,
  getRedirectResult,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  browserLocalPersistence,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

function isStandaloneIOS() {
  if (typeof window === "undefined") return false;

  const isIos =
    /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1);

  const standalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  return isIos && standalone;
}

async function routeUserByRole(uid: string) {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    window.location.replace("/dashboard");
    return;
  }

  const userData = userSnap.data() as { role?: string };

  if (userData.role === "admin") {
    window.location.replace("/admin");
    return;
  }

  window.location.replace("/dashboard");
}

export default function LoginPage() {
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(true);
  const [emailLoading, setEmailLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  const isRedirectMode = useMemo(() => isStandaloneIOS(), []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);

        // Important: let Firebase finish restoring session first
        await auth.authStateReady();

        // Important for iPhone homescreen redirect flow
        try {
          await getRedirectResult(auth);
        } catch (redirectError) {
          console.error("Redirect result error:", redirectError);
        }

        // Check again after redirect result settles
        const currentUser = auth.currentUser;

        if (currentUser && !cancelled) {
          await routeUserByRole(currentUser.uid);
          return;
        }

        const loginError = searchParams.get("error");
        if (loginError && !cancelled) {
          setError("Could not complete sign in. Please try again.");
        }
      } catch (err) {
        console.error("Login init error:", err);
        if (!cancelled) {
          setError("Could not load login. Please refresh the page.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const handleEmailLogin = async () => {
    setError("");
    setEmailLoading(true);

    try {
      await setPersistence(auth, browserLocalPersistence);

      const credential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      await routeUserByRole(credential.user.uid);
    } catch (err) {
      console.error("Email login error:", err);
      setError("Incorrect email or password.");
    } finally {
      setEmailLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setGoogleLoading(true);

    try {
      await setPersistence(auth, browserLocalPersistence);

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: "select_account",
      });

      if (isRedirectMode) {
        await signInWithRedirect(auth, provider);
        return;
      }

      const credential = await signInWithPopup(auth, provider);
      await routeUserByRole(credential.user.uid);
    } catch (err) {
      console.error("Google login error:", err);
      setError("Google sign-in failed. Please try again.");
      setGoogleLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f7fbff] px-6 py-10">
        <div className="mx-auto max-w-md rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <p className="text-sm text-slate-500">Loading login...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7fbff] px-6 py-10">
      <div className="mx-auto max-w-md rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
          Wild Atlantic Bootcamp
        </div>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
          Sign in
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          Access your dashboard and progress updates.
        </p>

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              placeholder="••••••••"
            />
          </div>

          <button
            type="button"
            onClick={handleEmailLogin}
            disabled={emailLoading || googleLoading}
            className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {emailLoading ? "Signing in..." : "Sign in"}
          </button>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={emailLoading || googleLoading}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {googleLoading
              ? isRedirectMode
                ? "Redirecting..."
                : "Signing in..."
              : "Continue with Google"}
          </button>
        </div>
      </div>
    </main>
  );
}