"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = "/dashboard";
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const signup = async () => {
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      window.location.href = "/dashboard";
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      window.location.href = "/dashboard";
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetSession = async () => {
    await signOut(auth);
    alert("Session reset. Now try login again.");
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm border">
        <h1 className="mb-6 text-center text-2xl font-bold">Login / Signup</h1>

        <input
          className="w-full mb-4 rounded-lg border p-3"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          className="w-full mb-4 rounded-lg border p-3"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={login}
          disabled={loading}
          className="w-full mb-3 rounded-lg bg-black py-3 text-white disabled:opacity-50"
        >
          {loading ? "Loading..." : "Login"}
        </button>

        <button
          onClick={signup}
          disabled={loading}
          className="w-full mb-3 rounded-lg border py-3 disabled:opacity-50"
        >
          Create account
        </button>

        <div className="my-4 text-center text-sm text-gray-500">or</div>

        <button
          onClick={googleLogin}
          disabled={loading}
          className="w-full rounded-lg bg-red-500 py-3 text-white disabled:opacity-50"
        >
          Continue with Google
        </button>

        <button
          onClick={resetSession}
          className="mt-4 w-full rounded-lg border py-3"
        >
          Reset session
        </button>
      </div>
    </main>
  );
}