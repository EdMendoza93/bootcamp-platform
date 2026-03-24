"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signOut,
  User,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
} from "firebase/firestore";
import { useToast } from "@/components/ui/ToastProvider";

/* ===================== FIX PWA LOGIN ===================== */

function waitForAuthenticatedUser(timeoutMs = 5000): Promise<User | null> {
  return new Promise((resolve) => {
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }

    const timeout = window.setTimeout(() => {
      unsubscribe();
      resolve(auth.currentUser);
    }, timeoutMs);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        window.clearTimeout(timeout);
        unsubscribe();
        resolve(user);
      }
    });
  });
}

/* ===================== TYPES ===================== */

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
  profileId: string;
  title?: string;
  type?: "training" | "nutrition" | "activity";
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

/* ===================== HELPERS ===================== */

function getPhotoSortValue(photo: ProgressPhoto) {
  if (photo.photoDate) {
    return new Date(`${photo.photoDate}T12:00:00`).getTime();
  }
  return (photo.createdAt?.seconds || 0) * 1000;
}

function formatPhotoDate(
  photoDate?: string,
  createdAt?: { seconds?: number }
) {
  if (photoDate) {
    return new Date(`${photoDate}T12:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (createdAt?.seconds) {
    return new Date(createdAt.seconds * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return "No date";
}

/* ===================== PAGE ===================== */

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [applications, setApplications] = useState<Application[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);

  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        await auth.authStateReady();

        const currentUser =
          auth.currentUser || (await waitForAuthenticatedUser(5000));

        if (!currentUser) {
          window.location.replace("/login");
          return;
        }

        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          window.location.replace("/dashboard");
          return;
        }

        const data = userSnap.data() as { role?: string };

        if (data.role !== "admin") {
          window.location.replace("/dashboard");
          return;
        }

        if (cancelled) return;
        setAllowed(true);

        const [appsSnap, profilesSnap, scheduleSnap, progressSnap] =
          await Promise.all([
            getDocs(collection(db, "applications")),
            getDocs(collection(db, "profiles")),
            getDocs(collection(db, "scheduleItems")),
            getDocs(collection(db, "progressPhotos")),
          ]);

        const appData = appsSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Application, "id">),
        }));

        const profileData = profilesSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Profile, "id">),
        }));

        const scheduleData = scheduleSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ScheduleItem, "id">),
        }));

        const progressData = progressSnap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ProgressPhoto, "id">),
          }))
          .sort((a, b) => getPhotoSortValue(b) - getPhotoSortValue(a));

        setApplications(appData);
        setProfiles(profileData);
        setScheduleItems(scheduleData);
        setProgressPhotos(progressData);
      } catch (error) {
        console.error(error);
        showToast({
          title: "Error loading admin",
          description: "Please refresh",
          type: "error",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const pendingApplications = useMemo(
    () => applications.filter((a) => a.status === "pending").length,
    [applications]
  );

  const activeClients = useMemo(
    () =>
      profiles.filter((p) => (p.clientStatus || "active") === "active").length,
    [profiles]
  );

  const recentUploads = useMemo(
    () => progressPhotos.slice(0, 6),
    [progressPhotos]
  );

  const profileNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    profiles.forEach((p) => {
      map[p.id] = p.fullName || "Unnamed";
    });
    return map;
  }, [profiles]);

  const logout = async () => {
    await signOut(auth);
    window.location.replace("/login");
  };

  if (loading) return <p className="p-6">Loading...</p>;
  if (!allowed) return null;

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-3xl font-bold">Admin</h1>

      <div className="grid grid-cols-2 gap-4">
        <Stat label="Pending Apps" value={pendingApplications} />
        <Stat label="Active Clients" value={activeClients} />
      </div>

      <section>
        <h2 className="text-xl font-semibold mb-4">Recent Uploads</h2>

        {recentUploads.length === 0 ? (
          <p>No uploads</p>
        ) : (
          <div className="space-y-3">
            {recentUploads.map((item) => (
              <div key={item.id} className="flex gap-4 items-center">
                <div className="w-14 h-14 overflow-hidden rounded-xl border">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-xs text-gray-400">No image</div>
                  )}
                </div>

                <div>
                  <p className="font-semibold">
                    {item.title || "Progress"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {profileNameMap[item.profileId]}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formatPhotoDate(item.photoDate, item.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <button
        onClick={logout}
        className="bg-black text-white px-4 py-2 rounded-xl"
      >
        Logout
      </button>
    </div>
  );
}

/* ===================== UI ===================== */

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border p-4 rounded-xl">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}