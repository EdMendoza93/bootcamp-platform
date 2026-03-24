"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
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
    (window.navigator as any).standalone === true;

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

  const data = userSnap.data() as { role?: string };

  if (data.role === "admin") {
    window.location.replace("/admin");
  } else {
    window.location.replace("/dashboard");
  }
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
    let unsubscribe: (() => void) | undefined;

    const init = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);

        // 🔑 CRÍTICO: primero escuchar auth
        unsubscribe = onAuthStateChanged(auth, async (user) => {
          if (cancelled) return;

          if (user) {
            try {
              await ensureUserDoc(user.uid, user.email);
              await routeUserByRole(user.uid);
            } catch (err) {
              console.error(err);
              if (!cancelled) {
                setError("Could not complete sign in.");
                setLoading(false);
              }
            }
          } else {
            if (!cancelled) {
              const loginError = searchParams.get("error");
              if (loginError) {
                setError("Could not complete sign in.");
              }
              setLoading(false);
            }
          }
        });

        // 🔑 IMPORTANTE: después procesar redirect
        try {
          const result = await getRedirectResult(auth);

          if (result?.user) {
            await ensureUserDoc(result.user.uid, result.user.email);
            // ⚠️ NO redirigir aquí → deja que onAuthStateChanged lo haga
          }
        } catch (err) {
          console.error("Redirect error:", err);
        }
      } catch (err) {
        console.error("Init error:", err);
        if (!cancelled) {
          setError("Could not load login.");
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [searchParams]);

  const handleEmailLogin = async () => {
    setError("");
    setEmailLoading(true);

    try {
      const cred = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      await ensureUserDoc(cred.user.uid, cred.user.email);
      await routeUserByRole(cred.user.uid);
    } catch {
      setError("Incorrect email or password.");
    } finally {
      setEmailLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    setError("");
    setSignupLoading(true);

    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      await ensureUserDoc(cred.user.uid, cred.user.email);
      await routeUserByRole(cred.user.uid);
    } catch (err: any) {
      if (err?.code === "auth/email-already-in-use") {
        setError("That email is already in use.");
      } else {
        setError("Could not create account.");
      }
    } finally {
      setSignupLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setGoogleLoading(true);

    try {
      const provider = new GoogleAuthProvider();

      if (isRedirectMode) {
        // 🔥 PWA FIX
        await signInWithRedirect(auth, provider);
        return;
      }

      const cred = await signInWithPopup(auth, provider);
      await ensureUserDoc(cred.user.uid, cred.user.email);
      await routeUserByRole(cred.user.uid);
    } catch (err) {
      console.error(err);
      setError("Google sign-in failed.");
      setGoogleLoading(false);
    }
  };

  if (loading) {
    return <div className="p-10">Loading...</div>;
  }

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md p-8 border rounded-2xl">
        <h2 className="text-2xl font-semibold mb-4">Sign in</h2>

        {error && <p className="text-red-500 mb-4">{error}</p>}

        <input
          className="w-full mb-3 p-3 border rounded-xl"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="w-full mb-3 p-3 border rounded-xl"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleEmailLogin}
          className="w-full mb-2 p-3 bg-black text-white rounded-xl"
        >
          Sign in
        </button>

        <button
          onClick={handleCreateAccount}
          className="w-full mb-2 p-3 border rounded-xl"
        >
          Create account
        </button>

        <button
          onClick={handleGoogleLogin}
          className="w-full p-3 border rounded-xl"
        >
          Continue with Google
        </button>
      </div>
    </main>
  );
}