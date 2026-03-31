"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signOut,
  signInWithEmailAndPassword,
  signInWithPopup,
  browserLocalPersistence,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getHomeRouteForRole, normalizeRole } from "@/lib/roles";

const MIN_PASSWORD_LENGTH = 8;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function resolveNextPath(value?: string | null) {
  const next = String(value || "").trim();

  if (!next.startsWith("/") || next.startsWith("//")) {
    return "";
  }

  return next;
}

async function findPendingInvite(email?: string | null) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;

  const invitesSnap = await getDocs(
    query(
      collection(db, "staffInvites"),
      where("email", "==", normalizedEmail),
      where("status", "==", "invited")
    )
  );

  if (invitesSnap.empty) return null;
  return invitesSnap.docs[0];
}

async function ensureUserDoc(
  uid: string,
  email?: string | null,
  displayName?: string | null
) {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  const inviteSnap = await findPendingInvite(email);
  const inviteData = inviteSnap?.data() as
    | {
        role?: string;
        fullName?: string;
      }
    | undefined;
  const invitedRole = inviteSnap ? normalizeRole(inviteData?.role) : null;
  const nextName = inviteData?.fullName || displayName || "";

  if (!userSnap.exists()) {
    await setDoc(userRef, {
      email: String(email || "").trim().toLowerCase(),
      name: nextName,
      role: invitedRole ?? "user",
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    const currentData = userSnap.data() as { role?: string; name?: string };
    const updates: {
      email: string;
      name: string;
      updatedAt: ReturnType<typeof serverTimestamp>;
      role?: string;
    } = {
      email: String(email || "").trim().toLowerCase(),
      name: nextName || currentData.name || "",
      updatedAt: serverTimestamp(),
    };

    if (invitedRole) {
      updates.role = invitedRole;
    }

    await setDoc(
      userRef,
      updates,
      { merge: true }
    );
  }

  if (inviteSnap) {
    await updateDoc(inviteSnap.ref, {
      status: "accepted",
      acceptedByUid: uid,
      acceptedAt: serverTimestamp(),
    });
  }
}

async function routeUserByRole(uid: string, nextPath?: string | null) {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    window.location.replace(resolveNextPath(nextPath) || "/dashboard");
    return;
  }

  const data = userSnap.data() as { role?: string; status?: "active" | "inactive" };
  if (data.status === "inactive") {
    await signOut(auth);
    window.location.replace("/login");
    return;
  }
  const safeNextPath = resolveNextPath(nextPath);

  if (safeNextPath && normalizeRole(data.role) === "user") {
    window.location.replace(safeNextPath);
    return;
  }

  window.location.replace(getHomeRouteForRole(data.role));
}

export default function LoginContent() {
  const searchParams = useSearchParams();
  const nextPath = resolveNextPath(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(true);
  const [emailLoading, setEmailLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const init = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);

        unsubscribe = onAuthStateChanged(auth, async (user) => {
          if (cancelled) return;

          if (user) {
            try {
              await ensureUserDoc(user.uid, user.email, user.displayName);
              await routeUserByRole(user.uid, nextPath);
            } catch (err) {
              console.error("Route user error:", err);
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

        try {
          const result = await getRedirectResult(auth);
          if (result?.user) {
            await ensureUserDoc(
              result.user.uid,
              result.user.email,
              result.user.displayName
            );
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
  }, [nextPath, searchParams]);

  const handleEmailLogin = async () => {
    setError("");
    setSuccessMessage("");

    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setEmailLoading(true);

    try {
      await setPersistence(auth, browserLocalPersistence);

      const cred = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      await ensureUserDoc(cred.user.uid, cred.user.email, cred.user.displayName);
      await routeUserByRole(cred.user.uid, nextPath);
    } catch (err) {
      console.error("Email login error:", err);
      setError("Incorrect email or password.");
    } finally {
      setEmailLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    setError("");
    setSuccessMessage("");

    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setSignupLoading(true);

    try {
      await setPersistence(auth, browserLocalPersistence);

      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      await ensureUserDoc(cred.user.uid, cred.user.email, cred.user.displayName);
      await routeUserByRole(cred.user.uid, nextPath);
    } catch (err: unknown) {
      console.error("Create account error:", err);

      const errorCode =
        typeof err === "object" && err && "code" in err
          ? String((err as { code?: string }).code || "")
          : "";

      if (errorCode === "auth/email-already-in-use") {
        setError("That email is already in use.");
      } else if (errorCode === "auth/weak-password") {
        setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      } else if (errorCode === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else {
        setError("Could not create account.");
      }
    } finally {
      setSignupLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setSuccessMessage("");
    setGoogleLoading(true);

    try {
      await setPersistence(auth, browserLocalPersistence);

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: "select_account",
      });

      const cred = await signInWithPopup(auth, provider);

      await ensureUserDoc(cred.user.uid, cred.user.email, cred.user.displayName);
      await routeUserByRole(cred.user.uid, nextPath);
    } catch (err) {
      console.error("Google login error:", err);
      setError("Google sign-in failed. Please try again.");
      setGoogleLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    setError("");
    setSuccessMessage("");

    if (!isValidEmail(email)) {
      setError("Enter your email first to reset your password.");
      return;
    }

    setResetLoading(true);

    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSuccessMessage("Password reset email sent. Check your inbox.");
    } catch (err: unknown) {
      console.error("Password reset error:", err);
      const errorCode =
        typeof err === "object" && err && "code" in err
          ? String((err as { code?: string }).code || "")
          : "";

      if (errorCode === "auth/user-not-found") {
        setError("No account was found for that email.");
      } else if (errorCode === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else {
        setError("Could not send reset email.");
      }
    } finally {
      setResetLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(46,160,255,0.14),_transparent_32%),linear-gradient(to_bottom_right,_#f8fbff,_#eef6ff)] px-6 py-10">
        <div className="mx-auto flex min-h-[80vh] max-w-6xl items-center justify-center">
          <div className="w-full max-w-md rounded-[32px] border border-white/70 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
            <p className="text-sm font-medium text-slate-500">
              Loading login...
            </p>
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

              <div className="mt-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <Image
                    src="/icon.png"
                    alt="Wild Atlantic Bootcamp"
                    width={28}
                    height={28}
                    className="h-7 w-7 rounded-lg"
                    priority
                  />
                </div>
                <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                  Sign in
                </h2>
              </div>

              <p className="mt-2 text-sm text-slate-600">
                Access your dashboard and progress updates.
              </p>

              {error && (
                <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}

              {successMessage && (
                <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {successMessage}
                </div>
              )}

              <div className="mt-6 space-y-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
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
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                    placeholder="••••••••"
                  />
                </div>

                <p className="text-xs text-slate-500">
                  New accounts require at least {MIN_PASSWORD_LENGTH} characters.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleEmailLogin}
                    disabled={emailLoading || googleLoading || signupLoading || resetLoading}
                    className="w-full rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    {emailLoading ? "Signing in..." : "Sign in"}
                  </button>

                  <button
                    type="button"
                    onClick={handleCreateAccount}
                    disabled={emailLoading || googleLoading || signupLoading || resetLoading}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    {signupLoading ? "Creating..." : "Create account"}
                  </button>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handlePasswordReset}
                    disabled={emailLoading || googleLoading || signupLoading || resetLoading}
                    className="text-sm font-medium text-slate-500 transition hover:text-slate-900 disabled:opacity-50"
                  >
                    {resetLoading ? "Sending reset email..." : "Forgot password?"}
                  </button>
                </div>

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
                  disabled={emailLoading || googleLoading || signupLoading || resetLoading}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {googleLoading ? "Signing in..." : "Continue with Google"}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
