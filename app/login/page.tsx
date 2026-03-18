"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
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
    }
    setLoading(false);
  };

  const signup = async () => {
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      window.location.href = "/dashboard";
    } catch (err: any) {
      alert(err.message);
    }
    setLoading(false);
  };

  const googleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      window.location.href = "/dashboard";
    } catch (err: any) {
      alert(err.message);
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-xl shadow">
        <h1 className="text-2xl font-bold mb-6 text-center">
          Login / Signup
        </h1>

        <input
          className="w-full mb-4 p-3 border rounded"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          className="w-full mb-4 p-3 border rounded"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={login}
          disabled={loading}
          className="w-full mb-3 bg-black text-white py-3 rounded disabled:opacity-50"
        >
          {loading ? "Loading..." : "Login"}
        </button>

        <button
          onClick={signup}
          disabled={loading}
          className="w-full mb-3 border py-3 rounded disabled:opacity-50"
        >
          Create account
        </button>

        <div className="text-center my-4 text-sm text-gray-500">
          or
        </div>

        <button
          onClick={googleLogin}
          disabled={loading}
          className="w-full bg-red-500 text-white py-3 rounded disabled:opacity-50"
        >
          Continue with Google
        </button>
      </div>
    </main>
  );
}