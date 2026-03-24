"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  browserLocalPersistence,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

function isStandaloneIOS() {
  if (typeof window === "undefined") return false;

  const isIos =
    /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1);

  const standalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true;

  return isIos && standalone;
}

async function ensureUserDoc(uid: string, email?: string | null) {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    await setDoc(userRef, {
      email: email || "",
      role: "user",
      createdAt: serverTimestamp(),
    });
  }
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

export default function LoginContent() {
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(true);
  const [emailLoading, setEmailLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [error, setError] = useState("");

  const isRedirectMode = useMemo(() => isStandaloneIOS(), []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
        await auth.authStateReady();

        try {
          const redirectResult = await getRedirectResult(auth);

          if (redirectResult?.user) {
            await ensureUserDoc(
              redirectResult.user.uid,
              redirectResult.user.email
            );
          }
        } catch (redirectError) {
          console.error("Redirect result error:", redirectError);
        }

        const currentUser = auth.currentUser;

        if (currentUser && !cancelled) {
          await ensureUserDoc(currentUser.uid, currentUser.email);
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

      await ensureUserDoc(credential.user.uid, credential.user.email);
      await routeUserByRole(credential.user.uid);
    } catch (err) {
      console.error("Email login error:", err);
      setError("Incorrect email or password.");
    } finally {
      setEmailLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    setError("");
    setSignupLoading(true);

    try {
      await setPersistence(auth, browserLocalPersistence);

      const credential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      await ensureUserDoc(credential.user.uid, credential.user.email);
      await routeUserByRole(credential.user.uid);
    } catch (err: any) {
      console.error("Create account error:", err);

      if (err?.code === "auth/email-already-in-use") {
        setError("That email is already in use.");
      } else if (err?.code === "auth/weak-password") {
        setError("Password should be at least 6 characters.");
      } else if (err?.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else {
        setError("Could not create account. Please try again.");
      }
    } finally {
      setSignupLoading(false);
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
      await ensureUserDoc(credential.user.uid, credential.user.email);
      await routeUserByRole(credential.user.uid);
    } catch (err) {
      console.error("Google login error:", err);
      setError("Google sign-in failed. Please try again.");
      setGoogleLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(46,160,255,0.14),_transparent_32%),linear-gradient(to_bottom_right,_#f8fbff,_#eef6ff)] px-6 py-10">
        <div className="mx-auto flex min-h-[80vh] max-w-6xl items-center justify-center">
          <div className="w-full max-w-md rounded-[32px] border border-white/70 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
            <p className="text-sm font-medium text-slate-500">Loading login...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(46,160,255,0.14),_transparent_32%),linear-gradient(to_bottom_right,_#f8fbff,_#eef6ff)] px-6 py-10">
      <div className="mx-auto grid min-h-[80vh] max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden lg:block">
          <div className="max-w-xl">
            <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#1d4ed8]">
              Wild Atlantic Bootcamp
            </div>

            <h1 className="mt-6 text-5xl font-semibold tracking-tight text-slate-950">
              Welcome back
            </h1>

            <p className="mt-5 max-w-lg text-lg leading-8 text-slate-600">
              Access your training plan, nutrition guidance, schedule, and
              progress timeline from one premium client portal.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <div className="rounded-[24px] border border-white/80 bg-white/80 p-5 shadow-[0_14px_40px_rgba(15,23,42,0.07)]">
                <p className="text-sm font-semibold text-slate-900">
                  Personalized journey
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  View your custom schedule, progress photos, and coaching
                  updates in one place.
                </p>
              </div>

              <div className="rounded-[24px] border border-white/80 bg-white/80 p-5 shadow-[0_14px_40px_rgba(15,23,42,0.07)]">
                <p className="text-sm font-semibold text-slate-900">
                  Fast access
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Sign in with email or Google and continue where you left off.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto w-full max-w-md overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
            <div className="bg-gradient-to-r from-[#071120] via-[#123b76] to-[#2EA0FF] p-[1px]">
              <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
            </div>

            <div className="p-8">
              <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8] lg:hidden">
                Wild Atlantic Bootcamp
              </div>

              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
                Sign in
              </h2>

              <p className="mt-2 text-sm text-slate-600">
                Access your dashboard and progress updates.
              </p>

              {error && (
                <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
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
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
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
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleEmailLogin}
                  disabled={emailLoading || googleLoading || signupLoading}
                  className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {emailLoading ? "Signing in..." : "Sign in"}
                </button>

                <button
                  type="button"
                  onClick={handleCreateAccount}
                  disabled={emailLoading || googleLoading || signupLoading}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {signupLoading ? "Creating account..." : "Create account"}
                </button>

                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white px-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Or continue with
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={emailLoading || googleLoading || signupLoading}
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
          </div>
        </section>
      </div>
    </main>
  );
}