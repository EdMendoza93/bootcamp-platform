"use client";

import { useEffect, useRef, useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useToast } from "@/components/ui/ToastProvider";

async function routeAfterLogin(uid: string) {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const data = userSnap.data() as { role?: string };

      if (data.role === "admin") {
        window.location.assign("/admin");
        return;
      }
    }

    window.location.assign("/dashboard");
  } catch (error) {
    console.error("Route after login error:", error);
    window.location.assign("/dashboard");
  }
}

function isIosStandaloneApp() {
  if (typeof window === "undefined") return false;

  const isIos =
    /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1);

  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true;

  return isIos && isStandalone;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingRedirect, setCheckingRedirect] = useState(true);
  const routedRef = useRef(false);
  const { showToast } = useToast();

  const finishLogin = async (user: User) => {
    if (routedRef.current) return;
    routedRef.current = true;
    await routeAfterLogin(user.uid);
  };

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);

        try {
          const redirectResult = await getRedirectResult(auth);

          if (redirectResult?.user && mounted) {
            showToast({
              title: "Google login successful",
              description: "Redirecting to your account.",
              type: "success",
            });

            await finishLogin(redirectResult.user);
            return;
          }
        } catch (err: any) {
          console.error("Redirect login error:", err);
          if (mounted) {
            showToast({
              title: "Google login failed",
              description: err?.message || "Something went wrong.",
              type: "error",
            });
          }
        }

        await auth.authStateReady();

        if (auth.currentUser && mounted) {
          await finishLogin(auth.currentUser);
          return;
        }
      } finally {
        if (mounted) {
          setCheckingRedirect(false);
        }
      }
    };

    initAuth();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!mounted || !user || routedRef.current) return;
      await finishLogin(user);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [showToast]);

  const login = async () => {
    setLoading(true);

    try {
      await setPersistence(auth, browserLocalPersistence);
      const credential = await signInWithEmailAndPassword(auth, email, password);

      showToast({
        title: "Login successful",
        description: "Redirecting to your account.",
        type: "success",
      });

      await finishLogin(credential.user);
    } catch (err: any) {
      showToast({
        title: "Login failed",
        description: err.message || "Something went wrong.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const signup = async () => {
    setLoading(true);

    try {
      await setPersistence(auth, browserLocalPersistence);
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      showToast({
        title: "Account created",
        description: "Redirecting to your account.",
        type: "success",
      });

      await finishLogin(credential.user);
    } catch (err: any) {
      showToast({
        title: "Signup failed",
        description: err.message || "Something went wrong.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = async () => {
    setLoading(true);

    try {
      await setPersistence(auth, browserLocalPersistence);
      const provider = new GoogleAuthProvider();

      if (isIosStandaloneApp()) {
        await signInWithRedirect(auth, provider);
        return;
      }

      const credential = await signInWithPopup(auth, provider);

      showToast({
        title: "Google login successful",
        description: "Redirecting to your account.",
        type: "success",
      });

      await finishLogin(credential.user);
    } catch (err: any) {
      showToast({
        title: "Google login failed",
        description: err.message || "Something went wrong.",
        type: "error",
      });
      setLoading(false);
    }
  };

  const resetSession = async () => {
    try {
      await signOut(auth);
      routedRef.current = false;
      showToast({
        title: "Session reset",
        description: "You have been signed out.",
        type: "success",
      });
    } catch (err: any) {
      showToast({
        title: "Could not reset session",
        description: err.message || "Something went wrong.",
        type: "error",
      });
    }
  };

  if (checkingRedirect) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(46,160,255,0.18),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(15,23,42,0.10),_transparent_28%),linear-gradient(to_bottom_right,_#f8fbff,_#eef5ff)] px-6 py-10">
        <div className="mx-auto grid min-h-[80vh] max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_520px]">
          <section>
            <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#1d4ed8]">
              Wild Atlantic Bootcamp
            </div>

            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl">
              Welcome back
            </h1>

            <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
              Checking your login session...
            </p>
          </section>

          <section className="rounded-[32px] border border-white/70 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
            <p className="text-sm text-slate-500">Please wait...</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(46,160,255,0.18),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(15,23,42,0.10),_transparent_28%),linear-gradient(to_bottom_right,_#f8fbff,_#eef5ff)] px-6 py-10">
      <div className="mx-auto grid min-h-[80vh] max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_520px]">
        <section>
          <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#1d4ed8]">
            Wild Atlantic Bootcamp
          </div>

          <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 md:text-7xl">
            Welcome back
          </h1>

          <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
            Login or create your account to continue your program, track your
            progress, and access your personal dashboard.
          </p>

          <div className="mt-8 grid max-w-xl gap-4 sm:grid-cols-2">
            <FeaturePill
              title="Personal dashboard"
              description="Access your schedule, profile, and updates."
            />
            <FeaturePill
              title="Progress tracking"
              description="Keep your journey organized in one place."
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="bg-gradient-to-r from-[#071120] via-[#123b76] to-[#2EA0FF] p-[1px]">
            <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
          </div>

          <div className="p-8">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
              Access your account
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Use email/password or continue with Google.
            </p>

            <div className="mt-6 space-y-4">
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <input
                type="password"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <button
                onClick={login}
                disabled={loading}
                className="w-full rounded-2xl bg-slate-950 py-3.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md disabled:opacity-50"
              >
                {loading ? "Loading..." : "Login"}
              </button>

              <button
                onClick={signup}
                disabled={loading}
                className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:opacity-50"
              >
                Create account
              </button>

              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-sm text-slate-400">OR</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <button
                onClick={googleLogin}
                disabled={loading}
                className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:opacity-50"
              >
                {loading ? "Loading..." : "Continue with Google"}
              </button>

              <button
                onClick={resetSession}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 text-sm font-medium text-slate-600 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-sm"
              >
                Reset session
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function FeaturePill({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/70 bg-white/80 p-4 shadow-[0_14px_40px_rgba(15,23,42,0.06)] backdrop-blur">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}