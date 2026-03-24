"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";

type Application = {
  id: string;
  status?: "pending" | "approved" | "rejected";
};

type Profile = {
  id: string;
  fullName?: string;
  clientStatus?: "active" | "inactive";
  paymentStatus?: string;
};

type ScheduleItem = {
  id: string;
  date: string;
  startTime: string;
};

type ProgressPhoto = {
  id: string;
  profileId: string;
  imageUrl?: string;
  title?: string;
  photoDate?: string;
  createdAt?: {
    seconds?: number;
  };
};

function getPhotoSortValue(photo: ProgressPhoto) {
  if (photo.photoDate) {
    return new Date(`${photo.photoDate}T12:00:00`).getTime();
  }
  return (photo.createdAt?.seconds || 0) * 1000;
}

function formatPhotoDate(photo: ProgressPhoto) {
  if (photo.photoDate) {
    return new Date(`${photo.photoDate}T12:00:00`).toLocaleDateString();
  }
  if (photo.createdAt?.seconds) {
    return new Date(photo.createdAt.seconds * 1000).toLocaleDateString();
  }
  return "No date";
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [applications, setApplications] = useState<Application[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          window.location.replace("/login");
          return;
        }

        const userSnap = await getDoc(doc(db, "users", user.uid));

        if (!userSnap.exists()) {
          window.location.replace("/dashboard");
          return;
        }

        const data = userSnap.data() as { role?: string };

        if (data.role !== "admin") {
          window.location.replace("/dashboard");
          return;
        }

        setAllowed(true);

        const [appsSnap, profilesSnap, scheduleSnap, progressSnap] =
          await Promise.all([
            getDocs(collection(db, "applications")),
            getDocs(collection(db, "profiles")),
            getDocs(collection(db, "scheduleItems")),
            getDocs(collection(db, "progressPhotos")),
          ]);

        const apps = appsSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));

        const profs = profilesSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));

        const schedule = scheduleSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));

        schedule.sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return (a.startTime || "").localeCompare(b.startTime || "");
        });

        const photos = progressSnap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as any),
          }))
          .sort((a, b) => getPhotoSortValue(b) - getPhotoSortValue(a));

        setApplications(apps);
        setProfiles(profs);
        setScheduleItems(schedule);
        setProgressPhotos(photos);
      } catch (err) {
        console.error(err);
        window.location.replace("/dashboard");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const pendingApps = applications.filter(
    (a) => a.status === "pending"
  ).length;

  const activeClients = profiles.filter(
    (p) => (p.clientStatus || "active") === "active"
  ).length;

  const recentUploads = progressPhotos.slice(0, 6);

  const logout = async () => {
    await signOut(auth);
    window.location.replace("/login");
  };

  if (loading) {
    return <p className="p-6">Loading...</p>;
  }

  if (!allowed) return null;

  return (
    <div className="space-y-8 p-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-semibold">Admin</h1>
        <button
          onClick={logout}
          className="bg-black text-white px-4 py-2 rounded-xl"
        >
          Logout
        </button>
      </div>

      {/* METRICS */}
      <div className="grid grid-cols-2 gap-4">
        <Card label="Pending Apps" value={pendingApps} />
        <Card label="Active Clients" value={activeClients} />
      </div>

      {/* RECENT UPLOADS */}
      <div>
        <h2 className="text-xl font-semibold mb-3">Recent Uploads</h2>

        {recentUploads.length === 0 ? (
          <p className="text-slate-500">No uploads</p>
        ) : (
          <div className="space-y-3">
            {recentUploads.map((photo) => (
              <div
                key={photo.id}
                className="flex gap-4 items-center border p-3 rounded-xl"
              >
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100">
                  {photo.imageUrl && (
                    <img
                      src={photo.imageUrl}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>

                <div>
                  <p className="font-medium">
                    {photo.title || "Progress update"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {formatPhotoDate(photo)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="border rounded-xl p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}