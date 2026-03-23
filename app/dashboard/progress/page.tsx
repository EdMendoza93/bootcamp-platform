"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db, storage } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

type Photo = {
  id: string;
  imageUrl: string;
  title?: string;
  note?: string;
  uploadedByRole?: "admin" | "user";
  createdAt?: {
    seconds?: number;
    nanoseconds?: number;
  };
};

export default function ProgressPage() {
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);

  const loadPhotos = async (pid: string) => {
    const photosQuery = query(
      collection(db, "progressPhotos"),
      where("profileId", "==", pid)
    );

    const photosSnap = await getDocs(photosQuery);

    const data = photosSnap.docs.map((docItem) => ({
      id: docItem.id,
      ...(docItem.data() as Omit<Photo, "id">),
    })) as Photo[];

    data.sort((a, b) => {
      const aSeconds = a.createdAt?.seconds || 0;
      const bSeconds = b.createdAt?.seconds || 0;
      return bSeconds - aSeconds;
    });

    setPhotos(data);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.replace("/login");
        return;
      }

      try {
        const profileQuery = query(
          collection(db, "profiles"),
          where("userId", "==", user.uid)
        );

        const profileSnap = await getDocs(profileQuery);

        if (!profileSnap.empty) {
          const profileDoc = profileSnap.docs[0];
          const pid = profileDoc.id;
          setProfileId(pid);
          await loadPhotos(pid);
        }
      } catch (error) {
        console.error("Load progress error:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const uploadPhoto = async () => {
    if (!file || !profileId) return;

    setUploading(true);

    try {
      const fileRef = ref(
        storage,
        `progress/${profileId}/${Date.now()}-${file.name}`
      );

      await uploadBytes(fileRef, file);
      const imageUrl = await getDownloadURL(fileRef);

      await addDoc(collection(db, "progressPhotos"), {
        profileId,
        imageUrl,
        title: title.trim(),
        note: note.trim(),
        uploadedByRole: "user",
        createdAt: serverTimestamp(),
      });

      setFile(null);
      setTitle("");
      setNote("");

      const input = document.getElementById(
        "progress-file-input"
      ) as HTMLInputElement | null;
      if (input) input.value = "";

      await loadPhotos(profileId);
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setUploading(false);
    }
  };

  const stats = useMemo(() => {
    return {
      total: photos.length,
      yourUploads: photos.filter((photo) => photo.uploadedByRole === "user")
        .length,
      coachUploads: photos.filter((photo) => photo.uploadedByRole === "admin")
        .length,
    };
  }, [photos]);

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">
          Loading your progress...
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-8 pb-28">
        <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="bg-gradient-to-r from-[#071120] via-[#123b76] to-[#2EA0FF] p-[1px]">
            <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
          </div>

          <div className="relative overflow-hidden p-6 md:p-8">
            <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#2EA0FF]/10 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-emerald-300/10 blur-3xl" />

            <div className="relative">
              <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
                Progress tracking
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                Your Progress
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
                Track your transformation over time and keep a visual record of
                your journey.
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <StatusCard label="Total photos" value={String(stats.total)} />
              <StatusCard label="Your uploads" value={String(stats.yourUploads)} />
              <StatusCard label="Coach uploads" value={String(stats.coachUploads)} />
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-8">
          <SectionHeader
            eyebrow="Upload"
            title="Add New Progress Photo"
            description="Upload a new image and optionally include a title or note."
          />

          <div className="mt-6 grid gap-4">
            <FieldGroup label="Photo">
              <input
                id="progress-file-input"
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none transition file:mr-4 file:rounded-xl file:border-0 file:bg-[#eff6ff] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[#1d4ed8] focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </FieldGroup>

            <FieldGroup label="Title">
              <input
                type="text"
                placeholder="e.g. Week 1 check-in"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </FieldGroup>

            <FieldGroup label="Note">
              <textarea
                placeholder="Anything you'd like to remember about this update"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-h-[140px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
              />
            </FieldGroup>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-8">
          <SectionHeader
            eyebrow="Gallery"
            title="Your Photo Timeline"
            description="A visual timeline of your progress updates."
          />

          {photos.length === 0 ? (
            <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 p-10 text-center text-sm text-slate-500">
              No photos yet. Start your journey today.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="rounded-[24px] border border-white/80 bg-white/95 p-3 shadow-[0_14px_40px_rgba(15,23,42,0.07)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(15,23,42,0.10)]"
                >
                  <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-[18px] bg-slate-100">
                    <img
                      src={photo.imageUrl}
                      alt={photo.title || "Progress photo"}
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div className="mt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                          photo.uploadedByRole === "admin"
                            ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                        }`}
                      >
                        {photo.uploadedByRole === "admin"
                          ? "Coach upload"
                          : "Your upload"}
                      </span>

                      <span className="text-xs text-slate-500">
                        {formatTimestamp(photo.createdAt)}
                      </span>
                    </div>

                    <p className="mt-3 line-clamp-1 font-semibold text-slate-900">
                      {photo.title || "Progress update"}
                    </p>

                    {photo.note && (
                      <p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-600">
                        {photo.note}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Upload a new progress photo
            </p>
            <p className="text-xs text-slate-500">
              Add a new visual update to your progress timeline.
            </p>
          </div>

          <button
            onClick={uploadPhoto}
            disabled={uploading || !file}
            className="rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-6 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload Photo"}
          </button>
        </div>
      </div>
    </>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
        {title}
      </h2>
      {description && (
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      )}
    </div>
  );
}

function StatusCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
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

function formatTimestamp(
  createdAt?: { seconds?: number; nanoseconds?: number }
) {
  if (!createdAt?.seconds) return "No date";

  const date = new Date(createdAt.seconds * 1000);

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}