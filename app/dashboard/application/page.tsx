"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

type ApplicationStatus = "pending" | "approved" | "rejected";

type ExistingApplication = {
  id: string;
  fullName: string;
  age: string;
  phone: string;
  goal: string;
  experience: string;
  medicalNotes: string;
  status: ApplicationStatus;
};

export default function ApplicationPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [existingApplication, setExistingApplication] =
    useState<ExistingApplication | null>(null);

  const [form, setForm] = useState({
    fullName: "",
    age: "",
    phone: "",
    goal: "",
    experience: "",
    medicalNotes: "",
  });

  useEffect(() => {
    let cancelled = false;

    const loadApplicationPage = async () => {
      try {
        await auth.authStateReady();

        const currentUser = auth.currentUser;

        if (!currentUser) {
          window.location.replace("/login");
          return;
        }

        if (cancelled) return;

        setUserId(currentUser.uid);

        const q = query(
          collection(db, "applications"),
          where("userId", "==", currentUser.uid)
        );

        const snapshot = await getDocs(q);

        if (!snapshot.empty && !cancelled) {
          const docItem = snapshot.docs[0];
          setExistingApplication({
            id: docItem.id,
            ...(docItem.data() as Omit<ExistingApplication, "id">),
          });
        }
      } catch (error) {
        console.error("Application page error:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadApplicationPage();

    return () => {
      cancelled = true;
    };
  }, []);

  const submitApplication = async () => {
    if (!userId) return;

    if (
      !form.fullName ||
      !form.age ||
      !form.phone ||
      !form.goal ||
      !form.experience
    ) {
      alert("Please complete all required fields.");
      return;
    }

    setSubmitting(true);

    try {
      await addDoc(collection(db, "applications"), {
        userId,
        fullName: form.fullName,
        age: form.age,
        phone: form.phone,
        goal: form.goal,
        experience: form.experience,
        medicalNotes: form.medicalNotes,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      window.location.reload();
    } catch (error) {
      console.error("Submit application error:", error);
      alert("Failed to submit application.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="p-10">Loading...</p>;
  }

  return (
    <main className="min-h-screen bg-white p-10">
      <h1 className="text-3xl font-bold">Bootcamp Application</h1>
      <p className="mt-2 text-gray-600">
        Complete your application to join the program.
      </p>

      {existingApplication ? (
        <div className="mt-8 max-w-2xl rounded-xl border p-6">
          <p className="text-sm text-gray-500">Application status</p>
          <h2 className="mt-2 text-2xl font-semibold capitalize">
            {existingApplication.status}
          </h2>

          <div className="mt-6 space-y-2 text-sm text-gray-700">
            <p>
              <span className="font-medium">Name:</span>{" "}
              {existingApplication.fullName}
            </p>
            <p>
              <span className="font-medium">Age:</span>{" "}
              {existingApplication.age}
            </p>
            <p>
              <span className="font-medium">Phone:</span>{" "}
              {existingApplication.phone}
            </p>
            <p>
              <span className="font-medium">Goal:</span>{" "}
              {existingApplication.goal}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-8 max-w-2xl space-y-4">
          <input
            className="w-full rounded border p-3"
            placeholder="Full name"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />

          <input
            className="w-full rounded border p-3"
            placeholder="Age"
            value={form.age}
            onChange={(e) => setForm({ ...form, age: e.target.value })}
          />

          <input
            className="w-full rounded border p-3"
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />

          <input
            className="w-full rounded border p-3"
            placeholder="Main goal"
            value={form.goal}
            onChange={(e) => setForm({ ...form, goal: e.target.value })}
          />

          <textarea
            className="min-h-[120px] w-full rounded border p-3"
            placeholder="Training experience"
            value={form.experience}
            onChange={(e) =>
              setForm({ ...form, experience: e.target.value })
            }
          />

          <textarea
            className="min-h-[120px] w-full rounded border p-3"
            placeholder="Medical notes / injuries / relevant info"
            value={form.medicalNotes}
            onChange={(e) =>
              setForm({ ...form, medicalNotes: e.target.value })
            }
          />

          <button
            onClick={submitApplication}
            disabled={submitting}
            className="rounded bg-black px-6 py-3 text-white disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit application"}
          </button>
        </div>
      )}
    </main>
  );
}