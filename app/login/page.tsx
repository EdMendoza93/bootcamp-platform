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

  const login = async () => {
    setLoading(true);

    try {
      await setPersistence(auth, browserLocalPersistence);
      const credential = await signInWithEmailAndPassword(auth, email, password);
      await routeAfterLogin(credential.user.uid);
    } catch (err: any) {
      alert(err.message);
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

      await routeAfterLogin(credential.user.uid);
    } catch (err: any) {
      alert(err.message);
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
      await routeAfterLogin(credential.user.uid);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetSession = async () => {
    try {
      await signOut(auth);
      alert("Session reset");
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto grid min-h-[80vh] max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_520px]">
        <section>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Wild Atlantic Bootcamp
          </p>

          <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
            Welcome back
          </h1>

          <p className="mt-4 max-w-2xl text-lg text-gray-600">
            Login or create your account to continue.
          </p>
        </section>

        <section className="rounded-3xl border bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-semibold">Access your account</h2>
          <p className="mt-2 text-sm text-gray-500">
            Use email/password or continue with Google.
          </p>

          <div className="mt-6 space-y-4">
            <input
              className="w-full rounded-xl border p-4"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              type="password"
              className="w-full rounded-xl border p-4"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              onClick={login}
              disabled={loading}
              className="w-full rounded-xl bg-black py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? "Loading..." : "Login"}
            </button>

            <button
              onClick={signup}
              disabled={loading}
              className="w-full rounded-xl border py-3 text-sm font-medium disabled:opacity-50"
            >
              Create account
            </button>

            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-sm text-gray-400">OR</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <button
              onClick={googleLogin}
              disabled={loading}
              className="w-full rounded-xl border py-3 text-sm font-medium disabled:opacity-50"
            >
              Continue with Google
            </button>

            <button
              onClick={resetSession}
              className="w-full rounded-xl border py-3 text-sm font-medium text-gray-600"
            >
              Reset session
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}