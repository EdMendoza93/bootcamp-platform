"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db, storage } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useToast } from "@/components/ui/ToastProvider";

type ProgressPhoto = {
  id: string;
  profileId: string;
  userId?: string;
  imageUrl: string;
  title?: string;
  note?: string;
  uploadedByRole: "admin" | "user";
  createdAt?: {
    seconds?: number;
    nanoseconds?: number;
  };
};

type PhotoModalData = {
  open: boolean;
  imageUrl: string;
  title: string;
  note: string;
  uploadedByRole: "admin" | "user" | "";
};

async function compressImage(file: File): Promise<File> {
  const imageBitmap = await createImageBitmap(file);

  const maxWidth = 1400;
  const scale = Math.min(1, maxWidth / imageBitmap.width);
  const targetWidth = Math.round(imageBitmap.width * scale);
  const targetHeight = Math.round(imageBitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error("Image compression failed."));
      },
      "image/jpeg",
      0.8
    );
  });

  const safeName = file.name.replace(/\.[^/.]+$/, "");
  return new File([blob], `${safeName}.jpg`, { type: "image/jpeg" });
}

export default function DashboardProgressPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileId, setProfileId] = useState("");
  const [userId, setUserId] = useState("");
  const [progressPhotosEnabled, setProgressPhotosEnabled] = useState(false);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);

  const [photoModalData, setPhotoModalData] = useState<PhotoModalData>({
    open: false,
    imageUrl: "",
    title: "",
    note: "",
    uploadedByRole: "",
  });

  const { showToast } = useToast();

  const loadPhotos = async (targetProfileId: string) => {
    const snapshot = await getDocs(
      query(
        collection(db, "progressPhotos"),
        where("profileId", "==", targetProfileId)
      )
    );

    const data = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...(docItem.data() as Omit<ProgressPhoto, "id">),
    })) as ProgressPhoto[];

    data.sort((a, b) => {
      const aSeconds = a.createdAt?.seconds || 0;
      const bSeconds = b.createdAt?.seconds || 0;
      return bSeconds - aSeconds;
    });

    setPhotos(data);
  };

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        await auth.authStateReady();

        const currentUser = auth.currentUser;
        if (!currentUser) {
          window.location.replace("/login");
          return;
        }

        if (cancelled) return;

        setUserId(currentUser.uid);

        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const userData = userSnap.data() as { role?: string };
          if (userData.role === "admin") {
            window.location.replace("/admin");
            return;
          }
        }

        const profileSnapshot = await getDocs(
          query(collection(db, "profiles"), where("userId", "==", currentUser.uid))
        );

        if (profileSnapshot.empty) {
          setProfileId("");
          setProgressPhotosEnabled(false);
          setPhotos([]);
          return;
        }

        const profileDoc = profileSnapshot.docs[0];
        const profileData = profileDoc.data() as {
          progressPhotosEnabled?: boolean;
        };

        setProfileId(profileDoc.id);
        setProgressPhotosEnabled(profileData.progressPhotosEnabled === true);

        await loadPhotos(profileDoc.id);
      } catch (error) {
        console.error("Load progress page error:", error);
        if (!cancelled) {
          showToast({
            title: "Could not load progress",
            description: "Please refresh the page.",
            type: "error",
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const resetForm = () => {
    setImageFile(null);
    setTitle("");
    setNote("");
    setEditingPhotoId(null);
  };

  const startEdit = (photo: ProgressPhoto) => {
    if (photo.uploadedByRole !== "user") return;

    setEditingPhotoId(photo.id);
    setTitle(photo.title || "");
    setNote(photo.note || "");
    setImageFile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const savePhoto = async () => {
    if (!profileId || !userId) return;

    if (!progressPhotosEnabled) {
      showToast({
        title: "Uploads not enabled",
        description: "Your coach has not enabled progress photos yet.",
        type: "error",
      });
      return;
    }

    if (editingPhotoId) {
      setSaving(true);

      try {
        await updateDoc(doc(db, "progressPhotos", editingPhotoId), {
          title: title.trim(),
          note: note.trim(),
        });

        resetForm();
        await loadPhotos(profileId);

        showToast({
          title: "Photo updated",
          description: "Your progress photo details were updated.",
          type: "success",
        });
      } catch (error) {
        console.error("Update progress photo error:", error);
        showToast({
          title: "Update failed",
          description: "Could not update the photo.",
          type: "error",
        });
      } finally {
        setSaving(false);
      }

      return;
    }

    if (!imageFile) {
      showToast({
        title: "Select an image",
        description: "Please choose a photo before uploading.",
        type: "error",
      });
      return;
    }

    setSaving(true);

    try {
      const compressedFile = await compressImage(imageFile);

      const fileRef = ref(
        storage,
        `progressPhotos/${profileId}/${Date.now()}-${compressedFile.name}`
      );

      await uploadBytes(fileRef, compressedFile);
      const imageUrl = await getDownloadURL(fileRef);

      await addDoc(collection(db, "progressPhotos"), {
        profileId,
        userId,
        imageUrl,
        title: title.trim(),
        note: note.trim(),
        uploadedByRole: "user",
        createdAt: serverTimestamp(),
      });

      resetForm();
      await loadPhotos(profileId);

      showToast({
        title: "Photo uploaded",
        description: "Your progress photo was uploaded successfully.",
        type: "success",
      });
    } catch (error) {
      console.error("Upload progress photo error:", error);
      showToast({
        title: "Upload failed",
        description: "Could not upload the photo.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const deletePhoto = async (photo: ProgressPhoto) => {
    if (photo.uploadedByRole !== "user") {
      showToast({
        title: "Not allowed",
        description: "You can only delete your own uploads.",
        type: "error",
      });
      return;
    }

    const confirmed = window.confirm("Delete this progress photo?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "progressPhotos", photo.id));

      if (editingPhotoId === photo.id) {
        resetForm();
      }

      await loadPhotos(profileId);

      showToast({
        title: "Photo deleted",
        description: "Your progress photo was removed.",
        type: "success",
      });
    } catch (error) {
      console.error("Delete progress photo error:", error);
      showToast({
        title: "Delete failed",
        description: "Could not delete the photo.",
        type: "error",
      });
    }
  };

  const openPhotoModal = (photo: ProgressPhoto) => {
    setPhotoModalData({
      open: true,
      imageUrl: photo.imageUrl,
      title: photo.title || "Progress update",
      note: photo.note || "",
      uploadedByRole: photo.uploadedByRole,
    });
  };

  const closePhotoModal = () => {
    setPhotoModalData({
      open: false,
      imageUrl: "",
      title: "",
      note: "",
      uploadedByRole: "",
    });
  };

  const userUploadsCount = useMemo(
    () => photos.filter((photo) => photo.uploadedByRole === "user").length,
    [photos]
  );

  if (loading) {
    return (
      <main className="min-h-screen px-6 py-8 md:px-10 md:py-10">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <p className="text-sm font-medium text-slate-500">
              Loading your progress timeline...
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!profileId) {
    return (
      <main className="min-h-screen px-6 py-8 md:px-10 md:py-10">
        <div className="mx-auto max-w-5xl">
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-8">
            <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
              Progress
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              Progress Photos
            </h1>

            <p className="mt-3 max-w-2xl text-slate-600">
              Your profile is not ready yet. Once it has been created, you will
              be able to use this section.
            </p>

            <div className="mt-6">
              <a
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                Back to Dashboard
              </a>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-screen px-6 py-8 md:px-10 md:py-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
            <div className="bg-gradient-to-r from-[#0f172a] via-[#123b76] to-[#2EA0FF] p-[1px]">
              <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
            </div>

            <div className="p-6 md:p-8">
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
                    Progress Tracking
                  </div>

                  <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                    Progress Photos
                  </h1>

                  <p className="mt-3 text-sm text-slate-600 md:text-base">
                    Upload your updates, track your timeline, and keep your coach
                    informed.
                  </p>
                </div>

                <a
                  href="/dashboard"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                >
                  Back to Dashboard
                </a>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <StatusCard
                  label="Uploads enabled"
                  value={progressPhotosEnabled ? "Yes" : "No"}
                  tone={progressPhotosEnabled ? "success" : "neutral"}
                />
                <StatusCard
                  label="Total photos"
                  value={String(photos.length)}
                  tone="neutral"
                />
                <StatusCard
                  label="Your uploads"
                  value={String(userUploadsCount)}
                  tone="blue"
                />
              </div>
            </div>
          </section>

          {progressPhotosEnabled ? (
            <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-8">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                  Upload
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  {editingPhotoId ? "Edit photo details" : "Upload new photo"}
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Share progress updates with your coach.
                </p>
              </div>

              <div className="mt-6 grid gap-4">
                {!editingPhotoId && (
                  <FieldGroup label="Choose image">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none transition file:mr-4 file:rounded-xl file:border-0 file:bg-[#eff6ff] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[#1d4ed8] focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                    />
                  </FieldGroup>
                )}

                <FieldGroup label="Title">
                  <input
                    type="text"
                    placeholder="Title (optional)"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  />
                </FieldGroup>

                <FieldGroup label="Note">
                  <textarea
                    placeholder="Note (optional)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="min-h-[150px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  />
                </FieldGroup>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={savePhoto}
                    disabled={saving}
                    className="rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-6 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving
                      ? "Saving..."
                      : editingPhotoId
                      ? "Save Changes"
                      : "Upload Photo"}
                  </button>

                  <button
                    onClick={resetForm}
                    disabled={saving}
                    className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-8">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                Uploads not enabled yet
              </h2>
              <p className="mt-2 text-slate-600">
                Your coach has not enabled progress photos for your profile yet.
              </p>
            </section>
          )}

          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-8">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                Timeline
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                Recent Uploads
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Recent uploads from you and your coach.
              </p>
            </div>

            {photos.length === 0 ? (
              <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 p-10 text-center text-sm text-slate-500">
                No progress photos yet.
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="rounded-[24px] border border-white/80 bg-white/95 p-3 shadow-[0_14px_40px_rgba(15,23,42,0.07)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(15,23,42,0.10)]"
                  >
                    <button
                      onClick={() => openPhotoModal(photo)}
                      className="w-full text-left"
                    >
                      <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-[18px] bg-slate-100">
                        <img
                          src={photo.imageUrl}
                          alt={photo.title || "Progress photo"}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    </button>

                    <div className="mt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                            photo.uploadedByRole === "admin"
                              ? "border-slate-200 bg-slate-50 text-slate-700"
                              : "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]"
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
                        <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                          {photo.note}
                        </p>
                      )}

                      <div className="mt-4 flex gap-2">
                        {photo.uploadedByRole === "user" && (
                          <>
                            <button
                              onClick={() => startEdit(photo)}
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() => deletePhoto(photo)}
                              className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {photoModalData.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm md:p-8">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[30px] border border-white/70 bg-white p-4 shadow-[0_30px_100px_rgba(15,23,42,0.25)] md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                    photoModalData.uploadedByRole === "admin"
                      ? "border-slate-200 bg-slate-50 text-slate-700"
                      : "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]"
                  }`}
                >
                  {photoModalData.uploadedByRole === "admin"
                    ? "Coach upload"
                    : "Your upload"}
                </span>

                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                  {photoModalData.title}
                </h2>

                {photoModalData.note && (
                  <p className="mt-2 text-sm text-slate-600">
                    {photoModalData.note}
                  </p>
                )}
              </div>

              <button
                onClick={closePhotoModal}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-all duration-200 hover:border-slate-300 hover:shadow-sm"
              >
                Close
              </button>
            </div>

            <div className="mt-6 flex justify-center rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
              <img
                src={photoModalData.imageUrl}
                alt={photoModalData.title}
                className="max-h-[72vh] w-auto max-w-full rounded-[20px] object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatusCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "success" | "neutral";
}) {
  const styles = {
    blue: "border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white",
    success: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white",
    neutral: "border-slate-100 bg-gradient-to-br from-slate-50 to-white",
  };

  return (
    <div className={`rounded-[22px] border p-4 ${styles[tone]}`}>
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