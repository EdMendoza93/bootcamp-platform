"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";

type Application = {
  id: string;
  userId: string;
  fullName: string;
  age: string;
  goal: string;
  status: "pending" | "approved" | "rejected";
};

export default function AdminApplicationsPage() {
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<Application[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.replace("/login");
        return;
      }

      try {
        const snapshot = await getDocs(collection(db, "applications"));

        const data: Application[] = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...(docItem.data() as Omit<Application, "id">),
        }));

        setApplications(data);
      } catch (error) {
        console.error("Fetch applications error:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const updateStatus = async (
    id: string,
    status: "approved" | "rejected"
  ) => {
    try {
      await updateDoc(doc(db, "applications", id), {
        status,
      });

      setApplications((prev) =>
        prev.map((app) => (app.id === id ? { ...app, status } : app))
      );
    } catch (error) {
      console.error("Update status error:", error);
    }
  };

  const createProfile = async (app: Application) => {
    try {
      const existingProfileQuery = query(
        collection(db, "profiles"),
        where("userId", "==", app.userId)
      );

      const existingProfileSnapshot = await getDocs(existingProfileQuery);

      if (!existingProfileSnapshot.empty) {
        alert("This user already has a profile.");
        return;
      }

      await addDoc(collection(db, "profiles"), {
        userId: app.userId,
        applicationId: app.id,
        fullName: app.fullName,
        age: app.age,
        goal: app.goal,
        approvalStatus: "approved",
        onboardingStatus: "incomplete",
        paymentStatus: "pending",
        assignedProgram: "",
        height: "",
        weight: "",
        allergies: "",
        injuries: "",
        notes: "",
        progressPhotosEnabled: false,
        createdAt: serverTimestamp(),
      });

      alert("Profile created successfully.");
    } catch (error) {
      console.error("Create profile error:", error);
      alert("Error creating profile.");
    }
  };

  if (loading) {
    return <p className="p-10">Loading...</p>;
  }

  return (
    <main className="min-h-screen bg-white p-10">
      <h1 className="text-3xl font-bold">Applications</h1>

      <div className="mt-8 space-y-4">
        {applications.map((app) => (
          <div key={app.id} className="rounded-xl border p-6">
            <h2 className="text-xl font-semibold">{app.fullName}</h2>

            <p className="text-sm text-gray-600">Age: {app.age}</p>

            <p className="text-sm text-gray-600">Goal: {app.goal}</p>

            <p className="mt-2 text-sm">
              Status: <span className="font-medium">{app.status}</span>
            </p>

            {app.status === "pending" && (
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => updateStatus(app.id, "approved")}
                  className="rounded bg-green-600 px-4 py-2 text-white"
                >
                  Approve
                </button>

                <button
                  onClick={() => updateStatus(app.id, "rejected")}
                  className="rounded bg-red-600 px-4 py-2 text-white"
                >
                  Reject
                </button>
              </div>
            )}

            {app.status === "approved" && (
              <div className="mt-4">
                <button
                  onClick={() => createProfile(app)}
                  className="rounded bg-blue-600 px-4 py-2 text-white"
                >
                  Create Profile
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}