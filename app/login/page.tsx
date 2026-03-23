"use client";

import { useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
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

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

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

      await routeAfterLogin(credential.user.uid);
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

      await routeAfterLogin(credential.user.uid);
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
      const credential = await signInWithPopup(auth, provider);

      showToast({
        title: "Google login successful",
        description: "Redirecting to your account.",
        type: "success",
      });

      await routeAfterLogin(credential.user.uid);
    } catch (err: any) {
      showToast({
        title: "Google login failed",
        description: err.message || "Something went wrong.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetSession = async () => {
    try {
      await signOut(auth);
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

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(46,160,255,0.18),_transparent_34%),linear-gradient(to_bottom_right,_#f8fbff,_#eef5ff)] px-6 py-10">
      <div className="mx-auto grid min-h-[80vh] max-w-6xl items-center gap-10 lg:grid-cols-[1.08fr_520px]">
        <section className="max-w-3xl">
          <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
            Wild Atlantic Bootcamp
          </div>

          <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl">
            Welcome back
          </h1>

          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            Login or create your account to continue your bootcamp journey,
            access your schedule, and manage your personalized experience.
          </p>

          <div className="mt-8 grid max-w-2xl gap-4 sm:grid-cols-3">
            <FeaturePill
              title="Your dashboard"
              description="Access itinerary, profile, and progress."
            />
            <FeaturePill
              title="Simple login"
              description="Use email and password or continue with Google."
            />
            <FeaturePill
              title="Premium experience"
              description="Clear, structured, and easy for non-tech users."
            />
          </div>
        </section>

        <section className="rounded-[32px] border border-white/70 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Account Access
          </div>

          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
            Access your account
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Use email and password or continue with Google.
          </p>

          <div className="mt-6 space-y-4">
            <FieldGroup label="Email">
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FieldGroup>

            <FieldGroup label="Password">
              <input
                type="password"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FieldGroup>

            <button
              onClick={login}
              disabled={loading}
              className="w-full rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] py-3.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Loading..." : "Login"}
            </button>

            <button
              onClick={signup}
              disabled={loading}
              className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create account
            </button>

            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                Or
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <button
              onClick={googleLogin}
              disabled={loading}
              className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue with Google
            </button>

            <button
              onClick={resetSession}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 text-sm font-medium text-slate-600 transition-all duration-200 hover:bg-slate-100"
            >
              Reset session
            </button>
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
    <div className="rounded-[22px] border border-white/70 bg-white/80 p-4 shadow-[0_14px_40px_rgba(15,23,42,0.05)] backdrop-blur">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}