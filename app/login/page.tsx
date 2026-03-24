"use client";

import { useEffect, useState } from "react";
import { auth, googleProvider } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
} from "firebase/auth";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detect iOS standalone (homescreen)
  const isIOSStandalone =
    typeof window !== "undefined" &&
    (window.navigator as any).standalone === true;

  // 🔥 HANDLE REDIRECT + AUTH STATE
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      try {
        // 1. Complete redirect login (IMPORTANT)
        const result = await getRedirectResult(auth);

        if (result?.user) {
          console.log("Redirect login success:", result.user);
          router.replace("/dashboard");
          return;
        }
      } catch (err) {
        console.error("Redirect error:", err);
      }

      // 2. Fallback: listen to auth state
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (!isMounted) return;

        if (user) {
          router.replace("/dashboard");
        } else {
          setLoading(false);
        }
      });

      return () => unsubscribe();
    };

    initAuth();

    return () => {
      isMounted = false;
    };
  }, [router]);

  // 🔐 EMAIL LOGIN
  const handleEmailLogin = async () => {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err.message);
    }
  };

  // 🔐 GOOGLE LOGIN
  const handleGoogleLogin = async () => {
    setError(null);

    try {
      if (isIOSStandalone) {
        // 👉 iPhone homescreen → redirect
        await signInWithRedirect(auth, googleProvider);
      } else {
        // 👉 Desktop → popup
        const result = await signInWithPopup(auth, googleProvider);
        if (result.user) {
          router.replace("/dashboard");
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    }
  };

  // ⏳ Loading state (important to avoid flicker/loop)
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white">
        <p className="text-sm opacity-70">Checking session...</p>
      </div>
    );
  }

  // 🎨 UI
  return (
    <div className="flex h-screen items-center justify-center bg-black text-white px-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl bg-zinc-900 p-6 shadow-lg">
        <h1 className="text-xl font-semibold text-center">
          Bootcamp Login
        </h1>

        {error && (
          <div className="text-sm text-red-400 text-center">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
          />

          <button
            onClick={handleEmailLogin}
            className="w-full rounded-lg bg-white text-black py-2 text-sm font-medium hover:opacity-90"
          >
            Sign in
          </button>
        </div>

        <div className="text-center text-xs opacity-50">or</div>

        <button
          onClick={handleGoogleLogin}
          className="w-full rounded-lg border border-white/20 py-2 text-sm hover:bg-white/10"
        >
          Continue with Google
        </button>
      </div>
    </div>
  );
}