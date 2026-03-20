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
      query(collection(db, "progressPhotos"), where("profileId", "==", targetProfileId))
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
        const profileData = profileDoc.data() as { progressPhotosEnabled?: boolean };

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
    return <p className="p-10">Loading...</p>;
  }

  if (!profileId) {
    return (
      <main className="min-h-screen bg-gray-50 p-6 md:p-10">
        <div className="mx-auto max-w-5xl">
          <section className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
            <h1 className="text-3xl font-bold tracking-tight">Progress Photos</h1>
            <p className="mt-3 text-gray-600">
              Your profile is not ready yet. Once it has been created, you will
              be able to use this section.
            </p>

            <div className="mt-6">
              <a
                href="/dashboard"
                className="rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white"
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
      <main className="min-h-screen bg-gray-50 p-6 md:p-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <section className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  Progress Photos
                </h1>
                <p className="mt-3 text-gray-600">
                  Upload your updates and review your timeline.
                </p>
              </div>

              <a
                href="/dashboard"
                className="rounded-xl border bg-white px-4 py-2.5 text-sm font-medium"
              >
                Back to Dashboard
              </a>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <StatusCard
                label="Uploads enabled"
                value={progressPhotosEnabled ? "Yes" : "No"}
              />
              <StatusCard label="Total photos" value={String(photos.length)} />
              <StatusCard
                label="Your uploads"
                value={String(userUploadsCount)}
              />
            </div>
          </section>

          {progressPhotosEnabled ? (
            <section className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
              <h2 className="text-xl font-semibold">
                {editingPhotoId ? "Edit photo details" : "Upload new photo"}
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Share progress updates with your coach.
              </p>

              <div className="mt-6 grid gap-4">
                {!editingPhotoId && (
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                    className="w-full rounded-xl border p-3"
                  />
                )}

                <input
                  type="text"
                  placeholder="Title (optional)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border p-3"
                />

                <textarea
                  placeholder="Note (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="min-h-[140px] w-full rounded-xl border p-3"
                />

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={savePhoto}
                    disabled={saving}
                    className="rounded-xl bg-black px-6 py-3 text-sm font-medium text-white disabled:opacity-50"
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
                    className="rounded-xl border bg-white px-6 py-3 text-sm font-medium disabled:opacity-50"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
              <h2 className="text-xl font-semibold">Uploads not enabled yet</h2>
              <p className="mt-2 text-gray-600">
                Your coach has not enabled progress photos for your profile yet.
              </p>
            </section>
          )}

          <section className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-xl font-semibold">Timeline</h2>
            <p className="mt-2 text-sm text-gray-600">
              Recent uploads from you and your coach.
            </p>

            {photos.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed p-10 text-center text-sm text-gray-500">
                No progress photos yet.
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="rounded-2xl border bg-white p-3 shadow-sm"
                  >
                    <button
                      onClick={() => openPhotoModal(photo)}
                      className="w-full text-left"
                    >
                      <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-xl bg-gray-100">
                        <img
                          src={photo.imageUrl}
                          alt={photo.title || "Progress photo"}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    </button>

                    <div className="mt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                          {photo.uploadedByRole === "admin"
                            ? "Coach upload"
                            : "Your upload"}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatTimestamp(photo.createdAt)}
                        </span>
                      </div>

                      <p className="mt-3 line-clamp-1 font-medium">
                        {photo.title || "Progress update"}
                      </p>

                      {photo.note && (
                        <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                          {photo.note}
                        </p>
                      )}

                      <div className="mt-4 flex gap-2">
                        {photo.uploadedByRole === "user" && (
                          <>
                            <button
                              onClick={() => startEdit(photo)}
                              className="rounded-xl border px-3 py-2 text-sm font-medium"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() => deletePhoto(photo)}
                              className="rounded-xl border px-3 py-2 text-sm font-medium"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 md:p-8">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white p-4 shadow-xl md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                  {photoModalData.uploadedByRole === "admin"
                    ? "Coach upload"
                    : "Your upload"}
                </span>

                <h2 className="mt-3 text-2xl font-bold tracking-tight">
                  {photoModalData.title}
                </h2>

                {photoModalData.note && (
                  <p className="mt-2 text-sm text-gray-600">
                    {photoModalData.note}
                  </p>
                )}
              </div>

              <button
                onClick={closePhotoModal}
                className="rounded-xl border bg-white px-3 py-2 text-sm font-medium"
              >
                Close
              </button>
            </div>

            <div className="mt-6 flex justify-center rounded-2xl bg-gray-50 p-4">
              <img
                src={photoModalData.imageUrl}
                alt={photoModalData.title}
                className="max-h-[72vh] w-auto max-w-full rounded-2xl object-contain"
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
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-gray-50 p-4">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <p className="mt-2 text-sm font-semibold text-gray-900">{value}</p>
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