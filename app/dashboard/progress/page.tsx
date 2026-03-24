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
  photoDate?: string;
  createdAt?: {
    seconds?: number;
    nanoseconds?: number;
  };
};

function getTodayDateInputValue() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getPhotoSortValue(photo: Photo) {
  if (photo.photoDate) {
    return new Date(`${photo.photoDate}T12:00:00`).getTime();
  }

  return (photo.createdAt?.seconds || 0) * 1000;
}

function formatPhotoDate(photo: Photo) {
  if (photo.photoDate) {
    const parsed = new Date(`${photo.photoDate}T12:00:00`);
    return parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (photo.createdAt?.seconds) {
    const parsed = new Date(photo.createdAt.seconds * 1000);
    return parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return "No date";
}

export default function ProgressPage() {
  const [loading, setLoading] = useState(true);

  const [profileId, setProfileId] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [photoDate, setPhotoDate] = useState(getTodayDateInputValue());
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState("");

  const [approvalStatus, setApprovalStatus] = useState<
    "pending" | "approved" | "rejected" | "none"
  >("none");
  const [progressPhotosEnabled, setProgressPhotosEnabled] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.replace("/login");
        return;
      }

      try {
        const profileSnap = await getDocs(
          query(collection(db, "profiles"), where("userId", "==", user.uid))
        );

        if (!profileSnap.empty) {
          const profileDoc = profileSnap.docs[0];
          const data = profileDoc.data() as {
            approvalStatus?: "pending" | "approved" | "rejected";
            progressPhotosEnabled?: boolean;
          };

          const pid = profileDoc.id;

          setProfileId(pid);
          setApprovalStatus(data.approvalStatus || "none");
          setProgressPhotosEnabled(data.progressPhotosEnabled === true);

          const photosSnap = await getDocs(
            query(collection(db, "progressPhotos"), where("profileId", "==", pid))
          );

          const photoData = photosSnap.docs
            .map((docItem) => ({
              id: docItem.id,
              ...(docItem.data() as Omit<Photo, "id">),
            }))
            .sort((a, b) => getPhotoSortValue(b) - getPhotoSortValue(a));

          setPhotos(photoData);
        }
      } catch (error) {
        console.error("Load progress error:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const notApproved = approvalStatus !== "approved";
  const notEnabled = !progressPhotosEnabled;

  const previewUrl = useMemo(() => {
    if (!file) return "";
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (selectedFile: File | null) => {
    setFileError("");

    if (!selectedFile) {
      setFile(null);
      return;
    }

    if (!selectedFile.type.startsWith("image/")) {
      setFile(null);
      setFileError("Please choose an image file.");
      return;
    }

    setFile(selectedFile);
  };

  const uploadPhoto = async () => {
    if (!file || !profileId || !photoDate) return;

    setUploading(true);
    setFileError("");

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
        photoDate,
        uploadedByRole: "user",
        createdAt: serverTimestamp(),
      });

      setFile(null);
      setTitle("");
      setNote("");
      setPhotoDate(getTodayDateInputValue());

      window.location.reload();
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return <p className="p-10 text-gray-500">Loading...</p>;
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold">Your Progress</h1>
        <p className="mt-2 text-gray-600">
          Track your transformation over time.
        </p>
      </section>

      {notApproved ? (
        <section className="rounded-[32px] border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">
            Progress photos will unlock soon
          </h2>
          <p className="mt-2 text-gray-600">
            You’ll be able to upload progress photos once your profile has been
            approved.
          </p>
        </section>
      ) : notEnabled ? (
        <section className="rounded-[32px] border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Uploads not enabled yet</h2>
          <p className="mt-2 text-gray-600">
            Your coach has not enabled progress photos for your profile yet.
          </p>
        </section>
      ) : (
        <section className="rounded-[32px] border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Upload new photo</h2>
          <p className="mt-2 text-gray-600">
            Add a new visual update to your progress timeline.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Photo
              </label>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="inline-flex w-fit cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
                  Choose file
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      handleFileChange(e.target.files?.[0] || null)
                    }
                  />
                </label>

                <span className="text-sm text-slate-500">
                  {file ? file.name : "No file selected"}
                </span>
              </div>

              {fileError && (
                <p className="mt-2 text-sm text-red-600">{fileError}</p>
              )}

              {previewUrl && (
                <div className="mt-4 overflow-hidden rounded-2xl border bg-slate-50 p-3">
                  <img
                    src={previewUrl}
                    alt="Selected preview"
                    className="h-48 w-full rounded-xl object-cover"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Date
              </label>
              <input
                type="date"
                value={photoDate}
                onChange={(e) => setPhotoDate(e.target.value)}
                className="w-full rounded-xl border p-3"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Title
              </label>
              <input
                type="text"
                placeholder="Title (optional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border p-3"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Note
              </label>
              <textarea
                placeholder="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-h-[140px] w-full rounded-xl border p-3"
              />
            </div>

            <button
              onClick={uploadPhoto}
              disabled={uploading || !file || !photoDate}
              className="rounded-xl bg-black px-6 py-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload Photo"}
            </button>
          </div>
        </section>
      )}

      <section className="rounded-[32px] border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Your Photo Timeline</h2>
        <p className="mt-2 text-gray-600">
          A visual timeline of your progress updates.
        </p>

        {photos.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed p-10 text-center text-sm text-gray-500">
            No photos yet. Start your journey today.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {photos.map((photo) => (
              <div key={photo.id} className="rounded-2xl border p-3">
                <img
                  src={photo.imageUrl}
                  className="h-56 w-full rounded-xl object-cover"
                  alt={photo.title || "Progress photo"}
                />

                <p className="mt-3 font-medium">
                  {photo.title || "Progress"}
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  {formatPhotoDate(photo)}
                </p>

                {photo.note && (
                  <p className="mt-1 text-sm text-gray-600">{photo.note}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}